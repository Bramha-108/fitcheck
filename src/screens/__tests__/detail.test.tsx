import { Animated } from 'react-native';
import { MOTION } from '../../utils/motion';
import { renderApp, screen, setReducedMotion, userEvent, waitFor, makeReference, __fake } from './testUtils';

jest.mock('../../db', () => require('./fakeDb'));
jest.mock('../../utils/photo', () => require('./nativeMocks').photo);
jest.mock('../../utils/backup', () => require('./nativeMocks').backup);

async function openDetail(seed: Parameters<typeof renderApp>[0]) {
  await renderApp(seed);
  const user = userEvent.setup();
  await user.press(screen.getByRole('tab', { name: 'Closet' }));
  await user.press(screen.getByLabelText(/Uniqlo Oxford Shirt/));
  await screen.findByRole('button', { name: 'Remove from closet' });
  return user;
}

describe('Garment detail', () => {
  it('shows the garment and never renders an unrecorded measurement as zero', async () => {
    await openDetail({ garments: [makeReference({ m: { chest: 54 } })] });
    expect(screen.getByText('Oxford Shirt')).toBeTruthy();
    expect(screen.queryByText(/^0(\.0)? ?cm$/)).toBeNull();
  });

  it('"Update how it fits" appends a history entry and keeps the earlier ones', async () => {
    const user = await openDetail({ garments: [makeReference()] });
    const before = __fake.snapshot().observations.length;

    await user.press(screen.getByRole('button', { name: 'Update how it fits' }));
    expect(await screen.findByText('How does it fit today?')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Chest' }));
    await user.press(screen.getByRole('button', { name: 'Tight' }));
    await user.type(screen.getByLabelText('Comfort notes'), 'Pulls across the chest');
    await user.press(screen.getByRole('button', { name: 'Add to fit history' }));

    expect(await screen.findByText('Added to fit history — earlier entries kept.')).toBeTruthy();
    const { observations } = __fake.snapshot();
    expect(observations).toHaveLength(before + 1); // appended, never overwritten
    expect(observations[observations.length - 1]).toMatchObject({
      note: 'Pulls across the chest',
      comfort: [{ area: 'Chest', verdict: 'Tight' }],
    });
    expect(observations[0].note).toBe('Fits great');
  });

  it('fit update opens with nothing picked, and cannot be saved until area and comfort are chosen', async () => {
    const user = await openDetail({ garments: [makeReference()] });
    const before = __fake.snapshot().observations.length;
    await user.press(screen.getByRole('button', { name: 'Update how it fits' }));
    await screen.findByText('How does it fit today?');

    for (const name of ['Chest', 'Shoulder', 'Too tight', 'Tight', 'Good', 'Loose', 'Too loose', 'Looks too baggy']) {
      expect(screen.getByRole('button', { name }).props.accessibilityState?.selected).toBe(false);
    }
    expect(screen.getByLabelText('Visual preference').props.value).toBe('');

    const save = () => screen.getByRole('button', { name: /^Pick|^Add to fit history$/ });
    expect(save().props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Pick an area and how it feels' })).toBeTruthy();
    await user.press(save());
    expect(__fake.snapshot().observations).toHaveLength(before); // nothing invented

    await user.press(screen.getByRole('button', { name: 'Waist' }));
    expect(screen.getByRole('button', { name: 'Pick how it feels' }).props.accessibilityState?.disabled).toBe(true);
    await user.press(screen.getByRole('button', { name: 'Good' }));
    expect(save().props.accessibilityState?.disabled).toBe(false);
    await user.press(screen.getByRole('button', { name: 'Add to fit history' }));

    expect(await screen.findByText('Added to fit history — earlier entries kept.')).toBeTruthy();
    const { observations } = __fake.snapshot();
    expect(observations).toHaveLength(before + 1);
    expect(observations[observations.length - 1]).toMatchObject({ comfort: [{ area: 'Waist', verdict: 'Good' }] });
    expect(observations[observations.length - 1].visual ?? undefined).toBeUndefined();

    // The next update starts blank again rather than inheriting these picks.
    await user.press(screen.getByRole('button', { name: 'Update how it fits' }));
    await screen.findByText('How does it fit today?');
    expect(screen.getByRole('button', { name: 'Waist' }).props.accessibilityState?.selected).toBe(false);
    expect(screen.getByRole('button', { name: 'Good' }).props.accessibilityState?.selected).toBe(false);
  });

  it('a failed fit update is reported and nothing is lost', async () => {
    const user = await openDetail({ garments: [makeReference()] });
    const before = __fake.snapshot();
    await user.press(screen.getByRole('button', { name: 'Update how it fits' }));
    await user.press(screen.getByRole('button', { name: 'Chest' }));
    await user.press(screen.getByRole('button', { name: 'Loose' }));
    __fake.failNext('insertObservation');
    await user.press(screen.getByRole('button', { name: 'Add to fit history' }));
    expect(await screen.findByText("Couldn't save that update — try again.")).toBeTruthy();
    expect(__fake.snapshot().observations).toEqual(before.observations);

    // "Try again" has to be possible: the sheet stays open with the picks intact,
    // rather than closing and starting blank on the next open.
    expect(screen.getByRole('button', { name: 'Chest' }).props.accessibilityState?.selected).toBe(true);
    expect(screen.getByRole('button', { name: 'Loose' }).props.accessibilityState?.selected).toBe(true);
    await user.press(screen.getByRole('button', { name: 'Add to fit history' }));
    expect(await screen.findByText('Added to fit history — earlier entries kept.')).toBeTruthy();
    expect(__fake.snapshot().observations).toHaveLength(before.observations.length + 1);
  });

  it('removing a garment asks first, says it cannot be undone, and Cancel keeps it', async () => {
    const user = await openDetail({ garments: [makeReference()] });
    await user.press(screen.getByRole('button', { name: 'Remove from closet' }));
    expect(await screen.findByText('Remove garment?')).toBeTruthy();
    expect(screen.getByText(/can't be undone/)).toBeTruthy();
    await user.press(screen.getByText('Cancel'));
    expect(__fake.snapshot().garments).toHaveLength(1);
  });

  it('a closing confirmation keeps its own text while it fades, never a blank "Confirm" box', async () => {
    setReducedMotion(false); // the fade-out only runs on the animated path
    try {
      const user = await openDetail({ garments: [makeReference()] });
      await user.press(screen.getByRole('button', { name: 'Remove from closet' }));
      await screen.findByText('Remove garment?');
      await user.press(screen.getAllByRole('button', { name: 'Cancel' }).slice(-1)[0]);

      // Mid-fade: previously the dialog lost its title/message and fell back to
      // the default "Confirm" label for the length of the fade.
      expect(screen.queryByText('Confirm')).toBeNull();
      await waitFor(() => expect(screen.queryByText('Remove garment?')).toBeNull());
      expect(__fake.snapshot().garments).toHaveLength(1);
    } finally {
      setReducedMotion(true);
    }
  });

  it('a failed removal fades the garment back in instead of leaving an invisible screen', async () => {
    setReducedMotion(false); // the fade-out only runs on the animated path
    // These are native-driver animations, which Jest runs (callbacks fire) without
    // ever updating rendered opacity, so the fade itself is checked on a device.
    // What Jest can check: the value that faded the screen out is animated back to 1.
    const timing = jest.spyOn(Animated, 'timing');
    try {
      const user = await openDetail({ garments: [makeReference()] });
      __fake.failNext('deleteGarment');
      await user.press(screen.getByRole('button', { name: 'Remove from closet' }));
      await user.press(await screen.findByText('Remove'));

      expect(await screen.findByText("Couldn't remove that — try again.")).toBeTruthy();
      expect(__fake.snapshot().garments).toHaveLength(1);
      const exit = timing.mock.calls.find(([, c]) => c.toValue === 0 && c.duration === MOTION.delete);
      expect(exit).toBeTruthy();
      await waitFor(() => expect(timing.mock.calls.some(([v, c]) => v === exit![0] && c.toValue === 1)).toBe(true));
    } finally {
      timing.mockRestore();
      setReducedMotion(true);
    }
  });

  it('confirming removal deletes the garment and its history, then lands on an honest empty closet', async () => {
    const user = await openDetail({ garments: [makeReference()] });
    await user.press(screen.getByRole('button', { name: 'Remove from closet' }));
    await user.press(await screen.findByText('Remove'));
    expect(await screen.findByText('Your closet is empty')).toBeTruthy();
    const snap = __fake.snapshot();
    expect(snap.garments).toHaveLength(0);
    expect(snap.observations).toHaveLength(0);
  });

  it('editing prefills the saved values and saves changes without touching history', async () => {
    const user = await openDetail({ garments: [makeReference()] });
    await user.press(screen.getByRole('button', { name: 'Edit' }));
    expect((await screen.findByLabelText('Product name')).props.value).toBe('Oxford Shirt');
    expect(screen.getByLabelText('Chest').props.value).toBe('54');

    const obsBefore = __fake.snapshot().observations;
    await user.clear(screen.getByLabelText('Product name'));
    await user.type(screen.getByLabelText('Product name'), 'Oxford Shirt v2');
    await user.press(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Garment updated.')).toBeTruthy();
    const snap = __fake.snapshot();
    expect(snap.garments[0].name).toBe('Oxford Shirt v2');
    expect(snap.garments[0].m).toEqual({ chest: 54, shoulder: 45, length: 70, sleeve: 62, waist: 50 });
    expect(snap.observations).toEqual(obsBefore);
  });

  it('"+ Add" after an edit starts a blank new garment, never the edited one', async () => {
    for (const finishEdit of ['abandon', 'save'] as const) {
      const user = await openDetail({ garments: [makeReference()] });
      await user.press(screen.getByRole('button', { name: 'Edit' }));
      expect((await screen.findByLabelText('Product name')).props.value).toBe('Oxford Shirt');
      if (finishEdit === 'save') {
        await user.press(screen.getByRole('button', { name: 'Save changes' }));
        await screen.findByText('Garment updated.');
      } else {
        await user.press(screen.getByLabelText(/^Back/)); // edit form -> detail
      }
      await user.press(screen.getAllByLabelText(/^Back/)[0]); // detail -> closet
      await user.press(await screen.findByRole('button', { name: 'Add garment' }));

      for (const label of ['Brand', 'Product name', 'Size', 'Chest']) expect(screen.getByLabelText(label).props.value ?? '').toBe('');
      await user.type(screen.getByLabelText('Brand'), 'Muji');
      await user.type(screen.getByLabelText('Product name'), 'Linen Tee');
      await user.type(screen.getByLabelText('Size'), 'L');
      await user.type(screen.getByLabelText('Chest'), '56');
      await user.press(screen.getByRole('button', { name: 'Save to closet' }));
      await screen.findByLabelText(/Muji Linen Tee/);

      const { garments } = __fake.snapshot();
      expect(garments).toHaveLength(2); // added, not overwritten
      expect(garments.find((g) => g.name === 'Oxford Shirt')).toBeTruthy();
    }
  });

  it('caps a long fit history behind "Show all N entries"', async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      at: Date.now() - (9 - i) * 86_400_000,
      note: `Entry number ${i}`,
      comfort: [{ area: 'Chest', verdict: 'Good' as const }],
    }));
    const user = await openDetail({ garments: [makeReference({ observations: many })] });
    const toggle = await screen.findByText(/Show all 9 entries/);
    await user.press(toggle);
    expect(await screen.findByText('Show less')).toBeTruthy();
  });
});
