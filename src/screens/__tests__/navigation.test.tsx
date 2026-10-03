import { BackHandler } from 'react-native';
import { act, renderApp, screen, tapTab, userEvent, makeReference } from './testUtils';

jest.mock('../../db', () => require('./fakeDb'));
jest.mock('../../utils/photo', () => require('./nativeMocks').photo);
jest.mock('../../utils/backup', () => require('./nativeMocks').backup);

// The store re-subscribes its hardwareBackPress listener whenever navigation state
// changes, so track live listeners and press "back" through the newest one — the
// same one Android would call.
const listeners: Array<() => boolean | null | undefined> = [];
beforeEach(() => {
  listeners.length = 0;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    listeners.push(handler);
    return { remove: () => { listeners.splice(listeners.indexOf(handler), 1); } };
  });
});
afterEach(() => jest.restoreAllMocks());

const pressHardwareBack = async () => {
  let handled: boolean | null | undefined = false;
  await act(async () => { handled = listeners[listeners.length - 1]?.(); });
  return handled;
};

const selectedTab = () =>
  ['Home', 'Closet', 'FitCheck', 'Profile'].find(
    (name) => screen.getByRole('tab', { name }).props.accessibilityState?.selected,
  );

describe('Top-level navigation', () => {
  it('tab switches are roots, not back-stack entries: Back goes to Home, then exits', async () => {
    await renderApp({ garments: [makeReference()] });

    for (const tab of ['Closet', 'FitCheck', 'Profile', 'Closet', 'FitCheck', 'Profile'] as const) {
      await tapTab(tab);
      expect(selectedTab()).toBe(tab);
    }
    expect(screen.getByText('Fit profile')).toBeTruthy();

    // Previously this replayed FitCheck → Closet → Profile → … one Back at a time.
    expect(await pressHardwareBack()).toBe(true);
    expect(selectedTab()).toBe('Home');
    expect(await pressHardwareBack()).toBe(false); // at the root: let the OS exit
  });

  it('each tab opens at its own root, not a nested screen visited earlier', async () => {
    await renderApp({ garments: [makeReference()] });
    const user = userEvent.setup();

    await tapTab('Closet');
    await user.press(screen.getByLabelText(/Uniqlo Oxford Shirt/));
    await screen.findByRole('button', { name: 'Remove from closet' });
    // Detail is a focused workflow, so leaving it is via its own back control.
    expect(await pressHardwareBack()).toBe(true);
    expect(selectedTab()).toBe('Closet');

    await tapTab('FitCheck');
    await tapTab('Profile');
    await tapTab('Closet');
    expect(screen.queryByRole('button', { name: 'Remove from closet' })).toBeNull();
    expect(selectedTab()).toBe('Closet');

    expect(await pressHardwareBack()).toBe(true);
    expect(selectedTab()).toBe('Home');
  });

  it('Back within a flow still returns to where the flow started', async () => {
    await renderApp({ garments: [makeReference()] });
    const user = userEvent.setup();

    await tapTab('FitCheck');
    await tapTab('Closet');
    await user.press(screen.getByLabelText(/Uniqlo Oxford Shirt/));
    await screen.findByRole('button', { name: 'Remove from closet' });

    expect(await pressHardwareBack()).toBe(true);
    expect(selectedTab()).toBe('Closet'); // the flow's origin, not FitCheck
  });

  it('Back closes an open confirmation instead of leaving it over another screen', async () => {
    await renderApp({ garments: [makeReference()] });
    const user = userEvent.setup();

    await tapTab('Closet');
    await user.press(screen.getByLabelText(/Uniqlo Oxford Shirt/));
    await user.press(await screen.findByRole('button', { name: 'Remove from closet' }));
    expect(await screen.findByText('Remove garment?')).toBeTruthy();

    // Previously Back navigated to Closet with "Remove garment?" still showing,
    // and tapping Remove there deleted the garment out of context.
    expect(await pressHardwareBack()).toBe(true);
    expect(screen.queryByText('Remove garment?')).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove from closet' })).toBeTruthy(); // still on Detail

    expect(await pressHardwareBack()).toBe(true);
    expect(selectedTab()).toBe('Closet');
    expect(screen.queryByText('Remove garment?')).toBeNull();
  });
});
