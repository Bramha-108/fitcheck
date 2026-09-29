import { renderApp, screen, makeReference } from './testUtils';

jest.mock('../../db', () => require('./fakeDb'));
jest.mock('../../utils/photo', () => require('./nativeMocks').photo);
jest.mock('../../utils/backup', () => require('./nativeMocks').backup);

it('boots the real app against an empty closet', async () => {
  await renderApp();
  expect(screen.getByRole('tab', { name: 'Home' })).toBeTruthy();
});

it('boots with a seeded garment', async () => {
  await renderApp({ garments: [makeReference()] });
  expect(screen.getByRole('tab', { name: 'Closet' })).toBeTruthy();
});
