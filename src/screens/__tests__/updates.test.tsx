import { Linking } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderApp, screen, tapTab, userEvent, waitFor, __fake } from './testUtils';

jest.mock('../../db', () => require('./fakeDb'));
jest.mock('../../utils/photo', () => require('./nativeMocks').photo);
jest.mock('../../utils/backup', () => require('./nativeMocks').backup);
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0' }));

const REPO = 'https://github.com/Bramha-108/fitcheck';
const LATEST_PAGE = `${REPO}/releases/latest`;
const API = 'https://api.github.com/repos/Bramha-108/fitcheck/releases/latest';
const apkFor = (tag: string) => `${REPO}/releases/download/${tag}/fitcheck-${tag.slice(1)}.apk`;
const pageFor = (tag: string) => `${REPO}/releases/tag/${tag}`;

/** One "answer" per route: a tag (success), an HTTP status (GitHub answered,
 * but refused), or 'down' (never reached — fetch rejects, as RN does offline). */
type Answer = string | number | 'down';

let fetchMock: jest.Mock;
let calls: string[];
/** Fakes github.com: the latest-release page redirects to its tag (fetch follows
 * it, so the response's `url` is the tag page), the APK download exists only if
 * `apk` is true, and the REST API answers with release JSON. */
function github({ web, api = 'down', apk = true }: { web: Answer; api?: Answer; apk?: boolean }) {
  fetchMock.mockImplementation(async (url: string) => {
    calls.push(url);
    const answer = (a: Answer, ok: () => object) => {
      if (a === 'down') throw new TypeError('Network request failed');
      if (typeof a === 'number') return { ok: false, status: a, url, json: async () => ({ message: 'API rate limit exceeded' }) };
      return { ok: true, status: 200, ...ok() };
    };
    if (url === LATEST_PAGE) return answer(web, () => ({ url: pageFor(web as string) }));
    if (url.includes('/releases/download/')) return { ok: apk, status: apk ? 200 : 404, url };
    if (url === API) {
      return answer(api, () => ({
        url,
        json: async () => ({
          tag_name: api,
          html_url: pageFor(api as string),
          assets: [{ name: `fitcheck-${(api as string).slice(1)}.apk`, browser_download_url: apkFor(api as string) }],
        }),
      }));
    }
    throw new Error(`unexpected fetch ${url}`);
  });
}

beforeEach(() => {
  calls = [];
  fetchMock = jest.fn(async () => { throw new Error('no GitHub fake set up for this test'); });
  (global as any).fetch = fetchMock;
});
afterEach(() => jest.restoreAllMocks());

async function openProfile(seed: Parameters<typeof renderApp>[0] = {}) {
  await renderApp(seed);
  await tapTab('Profile');
  await screen.findByText('App updates');
  return userEvent.setup();
}
const check = (user: ReturnType<typeof userEvent.setup>) =>
  user.press(screen.getByRole('button', { name: 'Check for updates' }));

describe('App updates (Profile)', () => {
  it('never goes online by itself unless the automatic check is turned on', async () => {
    await openProfile();
    expect(screen.getByText(/You're on version 1\.0\.0/)).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Check for updates automatically' }).props.value).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a newer release becomes a Download button that opens the APK, and is remembered', async () => {
    github({ web: 'v1.1.0' });
    const user = await openProfile();
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    await check(user);
    expect(await screen.findByText(/Version 1\.1\.0 is available/)).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Download version 1.1.0' }));
    expect(openURL).toHaveBeenCalledWith(apkFor('v1.1.0'));
    expect(JSON.parse(__fake.snapshot().settings['updates.available'])).toEqual({ version: '1.1.0', url: apkFor('v1.1.0') });
  });

  it('finds the release even when the GitHub API is rate-limiting this network (shared mobile IPs)', async () => {
    github({ web: 'v1.1.0', api: 403 });
    const user = await openProfile();
    await check(user);
    expect(await screen.findByRole('button', { name: 'Download version 1.1.0' })).toBeTruthy();
    expect(calls).not.toContain(API); // the web route never needs the API
  });

  it('falls back to the API when the release page route fails', async () => {
    github({ web: 500, api: 'v1.1.0' });
    const user = await openProfile();
    await check(user);
    expect(await screen.findByRole('button', { name: 'Download version 1.1.0' })).toBeTruthy();
    expect(calls).toContain(API);
  });

  it('offers the release page when the expected APK file is not attached', async () => {
    github({ web: 'v1.1.0', apk: false });
    const user = await openProfile();
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await check(user);
    await user.press(await screen.findByRole('button', { name: 'Download version 1.1.0' }));
    expect(openURL).toHaveBeenCalledWith(pageFor('v1.1.0'));
  });

  it('says so when already on the latest version', async () => {
    github({ web: 'v1.0.0' });
    const user = await openProfile();
    await check(user);
    expect(await screen.findByText("You're on the latest version.")).toBeTruthy();
  });

  it('offline: blames the connection, and can be retried', async () => {
    github({ web: 'down', api: 'down' });
    const user = await openProfile();
    await check(user);
    expect(await screen.findByText(/Couldn't reach GitHub\. Check your connection/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check for updates' }).props.accessibilityState?.disabled).toBe(false);
  });

  it('GitHub reachable but refusing: does not blame the connection', async () => {
    github({ web: 429, api: 403 });
    const user = await openProfile();
    await check(user);
    expect(await screen.findByText(/GitHub didn't answer with a release just now/)).toBeTruthy();
    expect(screen.queryByText(/Check your connection/)).toBeNull();
  });

  it('with the automatic check on, checks on launch once it is due — and not again within a day', async () => {
    github({ web: 'v1.1.0' });
    await openProfile({ settings: { 'updates.auto': '1', 'updates.lastCheck': String(Date.now() - 25 * 3600_000) } });
    expect(await screen.findByRole('button', { name: 'Download version 1.1.0' })).toBeTruthy();
    expect(calls).toContain(LATEST_PAGE);

    fetchMock.mockClear();
    await openProfile({ settings: { 'updates.auto': '1', 'updates.lastCheck': String(Date.now() - 3600_000) } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an automatic check that fails stays silent', async () => {
    github({ web: 'down', api: 'down' });
    await openProfile({ settings: { 'updates.auto': '1' } });
    await waitFor(() => expect(calls).toContain(API));
    expect(screen.queryByText(/Couldn't reach GitHub/)).toBeNull();
  });

  it('a remembered update shows on launch without a network call, and is dropped once installed', async () => {
    await openProfile({ settings: { 'updates.available': JSON.stringify({ version: '1.1.0', url: apkFor('v1.1.0') }) } });
    expect(screen.getByRole('button', { name: 'Download version 1.1.0' })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    await openProfile({ settings: { 'updates.available': JSON.stringify({ version: '1.0.0', url: apkFor('v1.0.0') }) } });
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeTruthy();
    await waitFor(() => expect(__fake.snapshot().settings['updates.available']).toBe(''));
  });

  it('turning the automatic check on is remembered', async () => {
    await openProfile({ settings: { 'updates.lastCheck': String(Date.now()) } });
    await fireEvent(screen.getByRole('switch', { name: 'Check for updates automatically' }), 'valueChange', true);
    expect(screen.getByRole('switch', { name: 'Check for updates automatically' }).props.value).toBe(true);
    await waitFor(() => expect(__fake.snapshot().settings['updates.auto']).toBe('1'));
    expect(fetchMock).not.toHaveBeenCalled(); // checked within the last day already
  });
});
