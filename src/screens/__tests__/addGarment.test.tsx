import { StyleSheet } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderApp, screen, userEvent, makeReference, __fake } from './testUtils';
import { photo } from './nativeMocks';

jest.mock('../../db', () => require('./fakeDb'));
jest.mock('../../utils/photo', () => require('./nativeMocks').photo);
jest.mock('../../utils/backup', () => require('./nativeMocks').backup);

async function openAddManual(seed: Parameters<typeof renderApp>[0] = {}) {
  await renderApp(seed);
  const user = userEvent.setup();
  await user.press(screen.getByRole('tab', { name: 'Closet' }));
  await user.press(screen.getByRole('button', { name: 'Add garment' }));
  await screen.findByText('Garment details');
  return user;
}

const valueOf = (label: string) => screen.getByLabelText(label).props.value as string;

describe('Add garment (manual entry)', () => {
  it('starts with every field blank — nothing pre-filled the user did not type', async () => {
    await openAddManual({ garments: [makeReference()] });
    for (const label of ['Brand', 'Product name', 'Size', 'Silhouette', 'Chest', 'Shoulder', 'Length', 'Sleeve', 'Waist']) {
      expect(valueOf(label) ?? '').toBe('');
    }
  });

  it('offers the closet\'s typical values only as ghost placeholders, never as values', async () => {
    await openAddManual({ garments: [makeReference()] });
    // Reference garment's chest is 54 cm — hint text only.
    expect(screen.getByLabelText('Chest').props.placeholder).toBe('54');
    expect(valueOf('Chest') ?? '').toBe('');
  });

  it('hides the tab bar while adding (focused workflow)', async () => {
    await openAddManual();
    expect(screen.queryByRole('tab', { name: 'Home' })).toBeNull();
  });

  it('rejects an incomplete save with inline errors, saves nothing, and keeps what was typed', async () => {
    const user = await openAddManual();
    await user.type(screen.getByLabelText('Product name'), 'Linen Shirt');
    await user.press(screen.getByRole('button', { name: 'Save to closet' }));

    expect(await screen.findByText('Add the missing details before saving.')).toBeTruthy();
    expect(screen.getAllByText('Required').length).toBeGreaterThanOrEqual(2); // brand + size
    expect(screen.getByText('Add at least one measurement to save.')).toBeTruthy();
    expect(__fake.snapshot().garments).toHaveLength(0);
    // The draft is left exactly as typed — never re-asked to redo the form.
    expect(valueOf('Product name')).toBe('Linen Shirt');
  });

  it('saves a complete garment: stored measurements are only the ones typed, and it lands in the closet', async () => {
    const user = await openAddManual();
    await user.type(screen.getByLabelText('Brand'), 'Uniqlo');
    await user.type(screen.getByLabelText('Product name'), 'Linen Shirt');
    await user.type(screen.getByLabelText('Size'), 'L');
    await user.type(screen.getByLabelText('Chest'), '56');
    await user.press(screen.getByRole('button', { name: 'Save to closet' }));

    expect(await screen.findByLabelText(/Uniqlo Linen Shirt, tops, size L/)).toBeTruthy();
    const { garments, observations } = __fake.snapshot();
    expect(garments).toHaveLength(1);
    // Measurement integrity: only chest was entered, so only chest is stored.
    expect(garments[0].m).toEqual({ chest: 56 });
    expect(garments[0].fit).toBe('—');
    // The initial history entry is always written, so Closet/Detail have something real to show.
    expect(observations).toHaveLength(1);
    expect(observations[0].note).toBe('Added to closet');
  });

  it('"Don\'t know the brand?" sets an explicit, honest sentinel the user chose', async () => {
    const user = await openAddManual();
    await user.press(screen.getByText("Don't know the brand?"));
    expect(valueOf('Brand')).toBe('Unknown brand');
    await user.press(screen.getByText("Don't know?"));
    expect(valueOf('Size')).toBe('Unknown size');
  });

  it('switching category drops measurements typed under the old category', async () => {
    const user = await openAddManual();
    await user.type(screen.getByLabelText('Chest'), '56');
    expect(valueOf('Chest')).toBe('56');

    await user.press(screen.getByRole('button', { name: 'Pants' }));
    // Pants have no chest field at all, and switching back must not resurrect the old value.
    expect(screen.queryByLabelText('Chest')).toBeNull();
    expect(screen.getByLabelText('Inseam')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Tops' }));
    expect(valueOf('Chest') ?? '').toBe('');
  });

  it('toggling cm/in converts what is already typed, and leaves empty fields empty', async () => {
    const user = await openAddManual();
    await user.type(screen.getByLabelText('Chest'), '50.8');
    await user.press(screen.getByRole('radio', { name: 'Inches' }));
    expect(valueOf('Chest')).toBe('20');
    expect(valueOf('Shoulder') ?? '').toBe(''); // never 0, never copied from a sibling
    expect(__fake.snapshot().units).toBe('in');
  });

  it('stores measurements in cm even when they were typed in inches', async () => {
    const user = await openAddManual({ units: 'in' });
    await user.type(screen.getByLabelText('Brand'), 'Levi');
    await user.type(screen.getByLabelText('Product name'), 'Tee');
    await user.type(screen.getByLabelText('Size'), 'M');
    await user.type(screen.getByLabelText('Chest'), '20');
    await user.press(screen.getByRole('button', { name: 'Save to closet' }));
    await screen.findByLabelText(/Levi Tee/);
    expect(__fake.snapshot().garments[0].m.chest).toBeCloseTo(50.8, 0);
  });

  it('offers Outseam for pants only, saves it in cm, and shows it on the garment and in FitCheck', async () => {
    const user = await openAddManual({ units: 'in' });
    expect(screen.queryByLabelText('Outseam')).toBeNull(); // tops
    await user.press(screen.getByRole('button', { name: 'Pants' }));
    await user.type(screen.getByLabelText('Brand'), 'Levi');
    await user.type(screen.getByLabelText('Product name'), '501');
    await user.type(screen.getByLabelText('Size'), '32');
    await user.type(screen.getByLabelText('Outseam'), '41');
    await user.press(screen.getByRole('button', { name: 'Save to closet' }));

    await user.press(await screen.findByLabelText(/Levi 501/));
    await screen.findByRole('button', { name: 'Remove from closet' });
    expect(__fake.snapshot().garments[0].m).toEqual({ outseam: expect.closeTo(104.1, 0) });
    expect(screen.getByText('Outseam')).toBeTruthy();

    await user.press(screen.getByLabelText(/^Back/));
    await user.press(screen.getByRole('tab', { name: 'FitCheck' }));
    expect(screen.queryByLabelText('Outseam')).toBeNull(); // FitCheck starts on tops
    await user.press(screen.getByRole('button', { name: 'Pants' }));
    expect(screen.getByLabelText('Outseam').props.placeholder).toBe('41'); // the user's own garment, in inches
  });

  it('shows a visible error and keeps the draft when the database write fails', async () => {
    const user = await openAddManual();
    await user.type(screen.getByLabelText('Brand'), 'Uniqlo');
    await user.type(screen.getByLabelText('Product name'), 'Linen Shirt');
    await user.type(screen.getByLabelText('Size'), 'L');
    await user.type(screen.getByLabelText('Chest'), '56');
    __fake.failNext('insertGarment');
    await user.press(screen.getByRole('button', { name: 'Save to closet' }));

    expect(await screen.findByText(/Couldn't save/i)).toBeTruthy();
    expect(__fake.snapshot().garments).toHaveLength(0);
    expect(valueOf('Product name')).toBe('Linen Shirt');
  });

  it('shows a picked photo right away, and a re-picked one replaces it, without leaving the screen', async () => {
    const user = await openAddManual();
    const preview = (uri: string) => screen.container.queryAll((n) => n.props.source?.uri === uri)[0];
    const opacityOf = (uri: string) => StyleSheet.flatten(preview(uri).props.style).opacity;

    photo.pickGarmentPhoto.mockResolvedValueOnce('file:///app/photos/g-1.jpg');
    await user.press(screen.getByRole('button', { name: 'Attach photo from library' }));
    expect(await screen.findByRole('button', { name: 'Garment photo, tap to change' })).toBeTruthy();
    await fireEvent(preview('file:///app/photos/g-1.jpg'), 'load');
    expect(opacityOf('file:///app/photos/g-1.jpg')).toBe(1);

    // Changing the photo resets the fade for the new source, then its own load reveals it.
    photo.pickGarmentPhoto.mockResolvedValueOnce('file:///app/photos/g-2.jpg');
    await user.press(screen.getByRole('button', { name: 'Garment photo, tap to change' }));
    expect(opacityOf('file:///app/photos/g-2.jpg')).toBe(0);
    await fireEvent(preview('file:///app/photos/g-2.jpg'), 'load');
    expect(opacityOf('file:///app/photos/g-2.jpg')).toBe(1);
  });
  it('a save lands on a Closet that shows the new garment, even after an earlier search', async () => {
    const user = await openAddManual({ garments: [makeReference({ brand: "Levi's", name: '501 Jeans' })] });
    await user.press(screen.getByText('← Back'));
    await user.type(screen.getByLabelText('Search closet'), 'levi');
    await user.press(screen.getByRole('button', { name: 'Add garment' }));
    await user.type(screen.getByLabelText('Brand'), 'Uniqlo');
    await user.type(screen.getByLabelText('Product name'), 'Linen Shirt');
    await user.type(screen.getByLabelText('Size'), 'L');
    await user.type(screen.getByLabelText('Chest'), '56');
    await user.press(screen.getByRole('button', { name: 'Save to closet' }));

    expect(await screen.findByLabelText(/Uniqlo Linen Shirt, tops, size L/)).toBeTruthy();
    expect(screen.getByLabelText('Search closet').props.value).toBe('');
  });

  it('a double-tap on Save adds the garment once', async () => {
    const user = await openAddManual();
    await user.type(screen.getByLabelText('Brand'), 'Uniqlo');
    await user.type(screen.getByLabelText('Product name'), 'Linen Shirt');
    await user.type(screen.getByLabelText('Size'), 'L');
    await user.type(screen.getByLabelText('Chest'), '56');
    // The first save's write is still in flight when the second tap lands.
    const release = __fake.holdNext('insertGarment');
    await user.press(screen.getByRole('button', { name: 'Save to closet' }));
    await user.press(screen.getByRole('button', { name: 'Save to closet' }));
    release();

    expect(await screen.findByLabelText(/Uniqlo Linen Shirt, tops, size L/)).toBeTruthy();
    expect(__fake.snapshot().garments).toHaveLength(1);
  });
});
