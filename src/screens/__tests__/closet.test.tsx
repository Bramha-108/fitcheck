import { renderApp, screen, userEvent, makeCore, makeReference, __fake } from './testUtils';

jest.mock('../../db', () => require('./fakeDb'));
jest.mock('../../utils/photo', () => require('./nativeMocks').photo);
jest.mock('../../utils/backup', () => require('./nativeMocks').backup);

async function openCloset() {
  const user = userEvent.setup();
  await user.press(screen.getByRole('tab', { name: 'Closet' }));
  return user;
}

describe('Closet screen', () => {
  it('shows an honest empty-closet state with a single way forward', async () => {
    await renderApp();
    const user = await openCloset();
    expect(screen.getByText('Your closet is empty')).toBeTruthy();
    // No fake garments, no fabricated history.
    expect(screen.queryByLabelText(/size /)).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Add your first garment' }));
    expect(await screen.findByText('Garment details')).toBeTruthy(); // straight to the form
  });

  it('lists every saved garment, including very long names', async () => {
    const longName = 'Heavyweight Garment-Dyed Pigment Washed Relaxed Fit Crewneck Sweatshirt With Contrast Stitching';
    await renderApp({ garments: [makeReference({ id: 1 }), makeCore({ id: 2, brand: 'Levi\'s', name: longName, cat: 'jackets' })] });
    await openCloset();
    expect(screen.getByLabelText(/Uniqlo Oxford Shirt, tops, size M/)).toBeTruthy();
    expect(screen.getByLabelText(new RegExp(longName))).toBeTruthy();
  });

  it('a search that matches nothing says it was the search, not a filter', async () => {
    await renderApp({ garments: [makeReference()] });
    const user = await openCloset();
    await user.type(screen.getByLabelText('Search closet'), 'zzzz');
    expect(await screen.findByText(/Nothing in your closet matches "zzzz"/)).toBeTruthy();
    expect(screen.queryByText(/No garments tagged/)).toBeNull();
  });

  it('a filter with no matches names the filter, and clearing the search recovers', async () => {
    await renderApp({ garments: [makeReference()] });
    const user = await openCloset();
    await user.press(screen.getByRole('button', { name: 'Pants' }));
    expect(await screen.findByText(/No garments tagged "Pants"/)).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByLabelText(/Uniqlo Oxford Shirt/)).toBeTruthy();
  });

  it('search matches on brand and finds the right garment among many', async () => {
    const garments = Array.from({ length: 12 }, (_, i) =>
      makeCore({ id: i + 1, brand: i === 7 ? 'Patagonia' : `Brand${i}`, name: `Item ${i}`, createdAt: 1_700_000_000_000 + i })
    );
    await renderApp({ garments });
    const user = await openCloset();
    await user.type(screen.getByLabelText('Search closet'), 'patagonia');
    expect(await screen.findByLabelText(/Patagonia Item 7/)).toBeTruthy();
    expect(screen.queryByLabelText(/Brand3 Item 3/)).toBeNull();
  });

  it('opening a garment shows its detail and hides the tab bar (focused workflow)', async () => {
    await renderApp({ garments: [makeReference()] });
    const user = await openCloset();
    await user.press(screen.getByLabelText(/Uniqlo Oxford Shirt/));
    expect(await screen.findByRole('button', { name: 'Remove from closet' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Home' })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('tab', { name: 'Home' })).toBeTruthy();
  });

  // Regression: a restored backup (or a save interrupted before its first observation)
  // can leave a garment with an empty history. The tile used to crash on history[-1].
  it('renders a garment with no fit history instead of crashing, and invents no fit state', async () => {
    await renderApp({ garments: [makeCore({ id: 5, observations: [] })] });
    await openCloset();
    const tile = screen.getByLabelText(/Uniqlo Oxford Shirt, tops, size M, Regular\.$/);
    expect(tile).toBeTruthy();
  });

  it('never mutates data just by browsing', async () => {
    await renderApp({ garments: [makeReference()] });
    const before = __fake.snapshot();
    const user = await openCloset();
    await user.press(screen.getByLabelText(/Uniqlo Oxford Shirt/));
    expect(__fake.snapshot()).toEqual(before);
  });
});
