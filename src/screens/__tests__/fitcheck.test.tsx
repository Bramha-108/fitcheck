import { renderApp, screen, userEvent, makeCore, makeReference, __fake } from './testUtils';

jest.mock('../../db', () => require('./fakeDb'));
jest.mock('../../utils/photo', () => require('./nativeMocks').photo);
jest.mock('../../utils/backup', () => require('./nativeMocks').backup);

async function openFitCheck(seed: Parameters<typeof renderApp>[0] = {}) {
  await renderApp(seed);
  const user = userEvent.setup();
  await user.press(screen.getByRole('tab', { name: 'FitCheck' }));
  await screen.findByRole('button', { name: 'Compare with my closet' });
  return user;
}

const compare = (user: ReturnType<typeof userEvent.setup>) =>
  user.press(screen.getByRole('button', { name: 'Compare with my closet' }));

describe('FitCheck entry + Result', () => {
  it('starts with no measurement values filled in', async () => {
    await openFitCheck({ garments: [makeReference()] });
    for (const label of ['Chest', 'Shoulder', 'Length', 'Sleeve', 'Waist']) {
      expect(screen.getByLabelText(label).props.value ?? '').toBe('');
    }
  });

  it('empty closet: explains the closet is empty instead of rendering a blank screen', async () => {
    const user = await openFitCheck();
    await user.type(screen.getByLabelText('Chest'), '55');
    await compare(user);
    expect(await screen.findByText('Nothing to compare yet')).toBeTruthy();
    expect(screen.getByText(/Your closet is empty/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add your first garment' })).toBeTruthy();
  });

  it('closet has garments but none in this category: says so, naming the category', async () => {
    const user = await openFitCheck({ garments: [makeReference()] });
    await user.press(screen.getByRole('button', { name: 'Pants' }));
    await user.type(screen.getByLabelText('Waist'), '82');
    await compare(user);
    expect(await screen.findByText(/You don't have any pants saved yet/)).toBeTruthy();
  });

  it('nothing entered: asks for a measurement rather than comparing against invented ones', async () => {
    const user = await openFitCheck({ garments: [makeReference()] });
    await compare(user);
    expect(await screen.findByText('Add a measurement to compare')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Back to measurements' }));
    expect(await screen.findByRole('button', { name: 'Compare with my closet' })).toBeTruthy();
  });

  it('entered zones no garment has recorded: reports no overlap, not "enter a measurement"', async () => {
    const user = await openFitCheck({ garments: [makeCore({ m: { chest: 54 } })] });
    await user.type(screen.getByLabelText('Sleeve'), '62');
    await compare(user);
    expect(await screen.findByText('Nothing shares these measurements yet')).toBeTruthy();
    expect(screen.queryByText('Add a measurement to compare')).toBeNull();
  });

  it('compares against the closest garment the user owns and explains it, with no percentages', async () => {
    const closest = makeReference({ id: 1, brand: 'Uniqlo', name: 'Oxford Shirt', m: { chest: 54, shoulder: 45, length: 70, sleeve: 62, waist: 50 } });
    const farther = makeReference({ id: 2, brand: 'Zara', name: 'Boxy Tee', m: { chest: 62, shoulder: 52, length: 76, sleeve: 66, waist: 58 } });
    const user = await openFitCheck({ garments: [farther, closest] });
    await user.type(screen.getByLabelText('Chest'), '55');
    await user.type(screen.getByLabelText('Shoulder'), '45');
    await compare(user);

    // Decision order: closest match first, and it is the right one.
    expect(await screen.findByText('Closest match')).toBeTruthy();
    expect(screen.getByLabelText(/Closest match: Uniqlo Oxford Shirt/)).toBeTruthy();
    expect(screen.getByText('Compared with your wardrobe')).toBeTruthy();
    expect(screen.getByText(/^Confidence: (High|Medium|Low)$/)).toBeTruthy();
    // No match percentages anywhere on the result.
    expect(screen.queryByText(/\d+\s?%/)).toBeNull();
    // Only the zones actually typed are diffed.
    expect(screen.getByText('Chest')).toBeTruthy();
    expect(screen.queryByText('Sleeve')).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Home' })).toBeNull(); // focused workflow
  });

  it('never writes to the database just by comparing', async () => {
    const user = await openFitCheck({ garments: [makeReference()] });
    const before = __fake.snapshot();
    await user.type(screen.getByLabelText('Chest'), '55');
    await compare(user);
    await screen.findByText('Closest match');
    expect(__fake.snapshot()).toEqual(before);
  });

  it('the result can be turned into a garment, carrying only the typed measurements', async () => {
    const user = await openFitCheck({ garments: [makeReference()] });
    await user.type(screen.getByLabelText('Chest'), '55');
    await compare(user);
    await user.press(await screen.findByRole('button', { name: 'Save this as a garment' }));
    expect(await screen.findByText('Garment details')).toBeTruthy();
    expect(screen.getByLabelText('Chest').props.value).toBe('55');
    expect(screen.getByLabelText('Waist').props.value ?? '').toBe('');
  });

  it('switching category in FitCheck drops measurements typed for the old one', async () => {
    const user = await openFitCheck({ garments: [makeReference()] });
    await user.type(screen.getByLabelText('Chest'), '55');
    await user.press(screen.getByRole('button', { name: 'Pants' }));
    await user.press(screen.getByRole('button', { name: 'Tops' }));
    expect(screen.getByLabelText('Chest').props.value ?? '').toBe('');
  });
});
