/**
 * App-update check against this repo's GitHub Releases — the only network call
 * FitCheck makes, and only when the user taps "Check for updates" or has turned
 * on the daily automatic check (both in Profile). Nothing about the closet is
 * sent: it's one anonymous GET for public release metadata. Installing is left
 * to Android's own installer — this only finds the download link.
 *
 * Kept free of React Native imports so the version logic stays unit-testable in
 * the plain `unit` jest project (see jest.config.js).
 */

export const RELEASES_REPO = 'Bramha-108/fitcheck';
const LATEST_RELEASE_URL = `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`;
const TIMEOUT_MS = 10_000;

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

/** Fetches the latest published release. Throws on network failure, timeout,
 * a non-OK response, or a response that doesn't describe a usable release. */
export async function fetchLatestRelease(): Promise<AvailableUpdate> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(LATEST_RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
    const release = parseLatestRelease(await res.json());
    if (!release) throw new Error('Latest release has no usable version or download');
    return release;
  } finally {
    clearTimeout(timer);
  }
}
