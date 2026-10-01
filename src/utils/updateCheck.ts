/**
 * App-update check against this repo's GitHub Releases — the only network access
 * FitCheck has, and only when the user taps "Check for updates" or has turned on
 * the daily automatic check (both in Profile). Nothing about the closet is sent:
 * just anonymous requests for public release information. Installing is left to
 * Android's own installer — this only finds the download link.
 *
 * Two routes, in order:
 * 1. github.com's own "latest release" page, which redirects to
 *    /releases/tag/<tag>. Read off the redirect with HEAD requests — no API, so
 *    no API rate limit.
 * 2. The REST API (api.github.com) as a fallback. Anonymous API calls are capped
 *    at 60/hour per public IP, and mobile carriers put many phones behind one
 *    shared IP — so on mobile data the API alone was routinely refused (403) for
 *    reasons that had nothing to do with this user or their connection.
 *
 * Kept free of React Native imports so the version logic stays unit-testable in
 * the plain `unit` jest project (see jest.config.js).
 */

export const RELEASES_REPO = 'Bramha-108/fitcheck';
const LATEST_RELEASE_PAGE = `https://github.com/${RELEASES_REPO}/releases/latest`;
const LATEST_RELEASE_API = `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`;
const TIMEOUT_MS = 10_000;

/** Why a check failed, so the UI can say something true: `network` = GitHub
 * couldn't be reached at all (offline, timeout); `server` = it answered, but not
 * with a usable release (rate limiting, an outage, no release published). */
export class UpdateCheckError extends Error {
  constructor(readonly kind: 'network' | 'server', message: string) {
    super(message);
    this.name = 'UpdateCheckError';
  }
}

/** How often the opt-in automatic check may run — at most once a day. */
export const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface AvailableUpdate {
  version: string;
  /** Where "Download" sends the user: the release's APK, else the release page. */
  url: string;
}

/** "v1.2.0" / "1.2" / "1.2.0-beta" → [1, 2, 0]; null if it isn't a version at all. */
export function parseVersion(v: string | null | undefined): number[] | null {
  if (!v) return null;
  const core = v.trim().replace(/^v/i, '').split(/[-+]/)[0];
  if (!/^\d+(\.\d+)*$/.test(core)) return null;
  return core.split('.').map(Number);
}

/** True only when `latest` is a strictly higher version than `installed`. An
 * unparseable version on either side is never treated as an update. */
export function isNewerVersion(latest: string | null | undefined, installed: string | null | undefined): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(installed);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

// Only ever open a link on github.com over https — the response is untrusted
// input, and "Download" must never become a way to open an arbitrary URL.
function isGithubUrl(u: unknown): u is string {
  return typeof u === 'string' && u.startsWith('https://github.com/');
}

/** Pulls the version and download link out of a GitHub "latest release" response. */
export function parseLatestRelease(json: unknown): AvailableUpdate | null {
  if (!json || typeof json !== 'object') return null;
  const r = json as { tag_name?: unknown; html_url?: unknown; assets?: unknown };
  if (typeof r.tag_name !== 'string' || !parseVersion(r.tag_name)) return null;
  const assets = Array.isArray(r.assets) ? (r.assets as { name?: unknown; browser_download_url?: unknown }[]) : [];
  const apk = assets.find((a) => typeof a?.name === 'string' && a.name.toLowerCase().endsWith('.apk') && isGithubUrl(a.browser_download_url));
  const url = apk ? (apk.browser_download_url as string) : isGithubUrl(r.html_url) ? r.html_url : null;
  if (!url) return null;
  return { version: r.tag_name.trim().replace(/^v/i, ''), url };
}

/** "https://github.com/OWNER/REPO/releases/tag/v1.2.0" → "v1.2.0" (the tag as
 * published); null for any other URL or a tag that isn't a version. */
export function tagFromReleaseUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/tag\/([^/?#]+)\/?(?:[?#].*)?$/.exec(url);
  if (!m) return null;
  const tag = decodeURIComponent(m[1]);
  return parseVersion(tag) ? tag : null;
}

/** fetch with a timeout; a request that never gets an answer is a `network`
 * failure, an answer that isn't 2xx is a `server` one. */
async function timedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    throw new UpdateCheckError('network', `Couldn't reach ${url}: ${(e as Error)?.message ?? e}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new UpdateCheckError('server', `${url} responded ${res.status}`);
  return res;
}

/** Route 1: follow github.com's "latest release" redirect. The APK link follows
 * the release naming convention (docs/RELEASING.md) and is confirmed to exist
 * before it's offered — otherwise the release page is offered instead. */
async function latestFromReleasePage(): Promise<AvailableUpdate> {
  const res = await timedFetch(LATEST_RELEASE_PAGE, { method: 'HEAD' });
  const tag = tagFromReleaseUrl(res.url);
  if (!tag) throw new UpdateCheckError('server', `Latest-release page didn't redirect to a version tag (${res.url || 'no URL'})`);
  const version = tag.replace(/^v/i, '');
  const base = `https://github.com/${RELEASES_REPO}/releases`;
  const apk = `${base}/download/${encodeURIComponent(tag)}/fitcheck-${version}.apk`;
  const page = `${base}/tag/${encodeURIComponent(tag)}`;
  const apkExists = await timedFetch(apk, { method: 'HEAD' }).then(() => true, () => false);
  return { version, url: apkExists ? apk : page };
}

/** Route 2: the REST API's "latest release" — the fallback (see top of file). */
async function latestFromApi(): Promise<AvailableUpdate> {
  const res = await timedFetch(LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } });
  const release = parseLatestRelease(await res.json());
  if (!release) throw new UpdateCheckError('server', 'Latest release has no usable version or download');
  return release;
}

/** Finds the latest published release, trying the web route first and the API
 * second. Throws an UpdateCheckError: `network` only if GitHub couldn't be
 * reached by either route, `server` if it answered but neither gave a release. */
export async function fetchLatestRelease(): Promise<AvailableUpdate> {
  const failures: UpdateCheckError[] = [];
  for (const route of [latestFromReleasePage, latestFromApi]) {
    try {
      return await route();
    } catch (e) {
      failures.push(e instanceof UpdateCheckError ? e : new UpdateCheckError('server', String((e as Error)?.message ?? e)));
    }
  }
  const kind = failures.every((f) => f.kind === 'network') ? 'network' : 'server';
  throw new UpdateCheckError(kind, failures.map((f) => f.message).join('; '));
}
