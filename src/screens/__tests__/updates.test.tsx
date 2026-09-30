import { Linking } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderApp, screen, tapTab, userEvent, waitFor, __fake } from './testUtils';

jest.mock('../../db', () => require('./fakeDb'));
jest.mock('../../utils/photo', () => require('./nativeMocks').photo);
jest.mock('../../utils/backup', () => require('./nativeMocks').backup);
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0' }));

const RELEASE_APK = 'https://github.com/Bramha-108/fitcheck/releases/download/v1.1.0/fitcheck-1.1.0.apk';
const release = (tag: string) => ({
  tag_name: tag,
  html_url: `https://github.com/Bramha-108/fitcheck/releases/tag/${tag}`,
  assets: [{ name: `fitcheck-${tag.slice(1)}.apk`, browser_download_url: RELEASE_APK }],
});

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  (global as any).fetch = fetchMock;
});
afterEach(() => jest.restoreAllMocks());

const respondWith = (body: unknown, ok = true) =>
  fetchMock.mockResolvedValueOnce({ ok, status: ok ? 200 : 500, json: async () => body });

async function openProfile(seed: Parameters<typeof renderApp>[0] = {}) {
  await renderApp(seed);
  await tapTab('Profile');
  await screen.findByText('App updates');
  return userEvent.setup();
}

describe('App updates (Profile)', () => {
  it('never goes online by itself unless the automatic check is turned on', async () => {
    await openProfile();
    expect(screen.getByText(/You're on version 1\.0\.0/)).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Check for updates automatically' }).props.value).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a newer release becomes a Download button that opens the APK, and is remembered', async () => {
    const user = await openProfile();
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    respondWith(release('v1.1.0'));

    await user.press(screen.getByRole('button', { name: 'Check for updates' }));
    expect(await screen.findByText(/Version 1\.1\.0 is available/)).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Download version 1.1.0' }));
    expect(openURL).toHaveBeenCalledWith(RELEASE_APK);
    expect(JSON.parse(__fake.snapshot().settings['updates.available'])).toEqual({ version: '1.1.0', url: RELEASE_APK });
  });

  it('says so when already on the latest version', async () => {
    const user = await openProfile();
    respondWith(release('v1.0.0'));
    await user.press(screen.getByRole('button', { name: 'Check for updates' }));
    expect(await screen.findByText("You're on the latest version.")).toBeTruthy();
  });

  it('a check the user asked for that fails says so, and can be retried', async () => {
    const user = await openProfile();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await user.press(screen.getByRole('button', { name: 'Check for updates' }));
    expect(await screen.findByText(/Couldn't reach GitHub/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check for updates' }).props.accessibilityState?.disabled).toBe(false);
  });

  it('with the automatic check on, checks on launch once it is due — and not again within a day', async () => {
    respondWith(release('v1.1.0'));
    await openProfile({ settings: { 'updates.auto': '1', 'updates.lastCheck': String(Date.now() - 25 * 3600_000) } });
    expect(await screen.findByRole('button', { name: 'Download version 1.1.0' })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    await openProfile({ settings: { 'updates.auto': '1', 'updates.lastCheck': String(Date.now() - 3600_000) } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an automatic check that fails stays silent', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await openProfile({ settings: { 'updates.auto': '1' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText(/Couldn't reach GitHub/)).toBeNull();
  });

  it('a remembered update shows on launch without a network call, and is dropped once installed', async () => {
    await openProfile({ settings: { 'updates.available': JSON.stringify({ version: '1.1.0', url: RELEASE_APK }) } });
    expect(screen.getByRole('button', { name: 'Download version 1.1.0' })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    await openProfile({ settings: { 'updates.available': JSON.stringify({ version: '1.0.0', url: RELEASE_APK }) } });
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
