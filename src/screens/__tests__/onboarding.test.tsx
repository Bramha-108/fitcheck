import { renderApp, screen, userEvent, __fake } from './testUtils';

jest.mock('../../db', () => require('./fakeDb'));
jest.mock('../../utils/photo', () => require('./nativeMocks').photo);
jest.mock('../../utils/backup', () => require('./nativeMocks').backup);

/** Walks onboarding up to its comparison step with a chest-only reference. */
async function reachCompareStep(units: 'cm' | 'in', chest: string) {
  await renderApp({ onboarded: false, units });
  const user = userEvent.setup();
  await user.press(screen.getByText('Start with a garment →'));
  await user.press(screen.getByRole('button', { name: /^Enter measurements/ }));
  await user.type(screen.getByLabelText('Garment'), 'Oxford Shirt');
  await user.type(screen.getByLabelText('Size'), 'M');
  await user.type(screen.getByLabelText('Brand'), 'Uniqlo');
  await user.type(screen.getByLabelText('Chest'), chest);
  await user.press(screen.getByText('Continue →'));
  await user.press(screen.getByRole('button', { name: /^Fits great/ }));
  await user.press(screen.getByText('Save this fit →'));
  await user.press(await screen.findByText('Compare another garment →'));
  return user;
}

describe('Onboarding', () => {
  it('compares in centimetres', async () => {
    const user = await reachCompareStep('cm', '54');
    await user.type(screen.getByLabelText('Chest'), '56');
    await user.press(screen.getByText('Compare →'));
    expect(await screen.findByText('+2 cm')).toBeTruthy();
  });

  it('compares in inches against the reference saved in cm, not raw digits against cm', async () => {
    // 21.3 in is stored as ~54 cm. A new garment at 22 in is ~0.7 in bigger,
    // not 22 − 54 = −32 "cm" (shown as −12.6 in and "tighter").
    const user = await reachCompareStep('in', '21.3');
    expect(__fake.snapshot().garments[0].m.chest).toBeCloseTo(54.1, 1);
    await user.type(screen.getByLabelText('Chest'), '22');
    await user.press(screen.getByText('Compare →'));
    expect(await screen.findByText('+0.7 in')).toBeTruthy();
    expect(screen.queryByText(/^-/)).toBeNull();
  });
});
