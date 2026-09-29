import { renderApp, screen, userEvent, makeCore, makeReference, __fake } from './testUtils';
import { backup, photo } from './nativeMocks';

jest.mock('../../db', () => require('./fakeDb'));
jest.mock('../../utils/photo', () => require('./nativeMocks').photo);
jest.mock('../../utils/backup', () => require('./nativeMocks').backup);

async function openProfile(seed: Parameters<typeof renderApp>[0] = {}) {
  await renderApp(seed);
  const user = userEvent.setup();
  await user.press(screen.getByRole('tab', { name: 'Profile' }));
  await screen.findByRole('button', { name: 'Import backup' });
  return user;
}

const incomingFile = (garmentOverrides: Record<string, unknown> = {}) =>
  backup.validateBackup({
    version: 1,
    exportedAt: 1_700_000_000_000,
    garments: [{
      id: 40, brand: 'Patagonia', name: 'Better Sweater', cat: 'jackets', size: 'L', fit: 'Regular', sil: 'Regular',
      stretch: 'Some stretch', tags: [], cap: 'jacket', bg: ['#111111', '#222222'], m: { chest: 60, length: 72 },
      visual: 'No visual note yet.', photo: null, createdAt: 1_700_000_000_000,
      observations: [{ at: 1_700_000_100_000, note: 'Restored entry', comfort: [{ area: 'Chest', verdict: 'Good' }] }],
      ...garmentOverrides,
    }],
    bodyMeasurements: [{ at: 1_700_000_000_000, m: { chest: 100 } }],
  });

beforeEach(() => {
  backup.shareBackupFile.mockClear().mockResolvedValue(true);
  backup.pickBackupFile.mockClear().mockResolvedValue(null);
  photo.localPhotoExists.mockReset().mockReturnValue(false);
});

describe('Export backup', () => {
  it('is disabled with an empty closet and says why', async () => {
    await openProfile();
    expect(screen.getByRole('button', { name: 'Export backup' })).toBeDisabled();
    expect(screen.getByText(/nothing to back up yet/i)).toBeTruthy();
  });

  it('hands the whole closet to the share sheet: garments, history and body measurements', async () => {
    const user = await openProfile({
      garments: [makeReference({ id: 1 }), makeCore({ id: 2, brand: 'Levi\'s', name: '501', cat: 'pants', m: { waist: 82, inseam: 78 } })],
      body: [{ at: 1_700_000_000_000, m: { waist: 80 } }],
    });
    await user.press(screen.getByRole('button', { name: 'Export backup' }));

    expect(backup.shareBackupFile).toHaveBeenCalledTimes(1);
    const file = backup.shareBackupFile.mock.calls[0][0];
    expect(file.version).toBe(1);
    expect(file.garments.map((g) => g.name).sort()).toEqual(['501', 'Oxford Shirt']);
    expect(file.garments.find((g) => g.id === 1)!.observations).toHaveLength(1);
    expect(file.bodyMeasurements).toEqual([{ at: 1_700_000_000_000, m: { waist: 80 } }]);
    // Derived fields must not be written into the file as if they were recorded.
    expect(file.garments[0]).not.toHaveProperty('feels');
    expect(file.garments[0]).not.toHaveProperty('ref');
  });

  it('never modifies the closet', async () => {
    const user = await openProfile({ garments: [makeReference()] });
    const before = __fake.snapshot();
    await user.press(screen.getByRole('button', { name: 'Export backup' }));
    expect(__fake.snapshot()).toEqual(before);
  });

  it('tells the user when sharing is not available on this device', async () => {
    backup.shareBackupFile.mockResolvedValue(false);
    const user = await openProfile({ garments: [makeReference()] });
    await user.press(screen.getByRole('button', { name: 'Export backup' }));
    expect(await screen.findByText("Sharing isn't available on this device.")).toBeTruthy();
  });

  it('reports a failed export instead of failing silently, and re-enables the button', async () => {
    backup.shareBackupFile.mockRejectedValue(new Error('disk full'));
    const user = await openProfile({ garments: [makeReference()] });
    await user.press(screen.getByRole('button', { name: 'Export backup' }));
    expect(await screen.findByText("Couldn't create a backup — try again.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export backup' })).toBeEnabled();
  });
});

describe('Import backup', () => {
  it('picking nothing (cancelled picker) changes nothing and shows no error', async () => {
    const user = await openProfile({ garments: [makeReference()] });
    const before = __fake.snapshot();
    await user.press(screen.getByRole('button', { name: 'Import backup' }));
    expect(screen.queryByText('Import backup?')).toBeNull();
    expect(screen.queryByText(/Couldn't/)).toBeNull();
    expect(__fake.snapshot()).toEqual(before);
  });

  it('asks before replacing, with honest counts and the photo caveat; Cancel leaves the closet alone', async () => {
    backup.pickBackupFile.mockResolvedValue(incomingFile());
    const user = await openProfile({ garments: [makeReference()] });
    const before = __fake.snapshot();

    await user.press(screen.getByRole('button', { name: 'Import backup' }));
    expect(await screen.findByText('Import backup?')).toBeTruthy();
    expect(screen.getByText(/replaces your current closet \(1 garment\) with 1 garment/)).toBeTruthy();
    expect(screen.getByText(/Photos aren't included/)).toBeTruthy();
    expect(screen.getByText(/can't be undone/)).toBeTruthy();

    await user.press(screen.getByText('Cancel'));
    expect(__fake.snapshot()).toEqual(before);
  });

  it('confirming replaces the closet, history and body measurements with the file\'s contents', async () => {
    backup.pickBackupFile.mockResolvedValue(incomingFile());
    const user = await openProfile({ garments: [makeReference()], body: [{ at: 1, m: { waist: 70 } }] });

    await user.press(screen.getByRole('button', { name: 'Import backup' }));
    await user.press(await screen.findByText('Replace closet'));

    expect(await screen.findByText('Imported 1 garment from the backup.')).toBeTruthy();
    const snap = __fake.snapshot();
    expect(snap.garments.map((g) => g.name)).toEqual(['Better Sweater']);
    expect(snap.garments[0].m).toEqual({ chest: 60, length: 72 }); // no measurement invented
    expect(snap.observations.map((o) => o.note)).toEqual(['Restored entry']);
    expect(snap.body.map((b) => b.m)).toEqual([{ chest: 100 }]);

    // ...and the restored closet is what the user now sees.
    await user.press(screen.getByRole('tab', { name: 'Closet' }));
    expect(await screen.findByLabelText(/Patagonia Better Sweater/)).toBeTruthy();
    expect(screen.queryByLabelText(/Uniqlo Oxford Shirt/)).toBeNull();
  });

  it('drops a photo path that does not exist on this device instead of keeping a broken reference', async () => {
    backup.pickBackupFile.mockResolvedValue(incomingFile({ photo: 'file:///old-phone/photos/g-1.jpg' }));
    photo.localPhotoExists.mockReturnValue(false);
    const user = await openProfile();
    await user.press(screen.getByRole('button', { name: 'Import backup' }));
    await user.press(await screen.findByText('Replace closet'));
    await screen.findByText(/Imported 1 garment/);
    expect(__fake.snapshot().garments[0].photo).toBeNull();
  });

  it('keeps a photo path that still exists on this device', async () => {
    backup.pickBackupFile.mockResolvedValue(incomingFile({ photo: 'file:///here/photos/g-1.jpg' }));
    photo.localPhotoExists.mockReturnValue(true);
    const user = await openProfile();
    await user.press(screen.getByRole('button', { name: 'Import backup' }));
    await user.press(await screen.findByText('Replace closet'));
    await screen.findByText(/Imported 1 garment/);
    expect(__fake.snapshot().garments[0].photo).toBe('file:///here/photos/g-1.jpg');
  });

  it('an unreadable/invalid file shows the parser\'s message and changes nothing', async () => {
    backup.pickBackupFile.mockRejectedValue(new backup.BackupParseError("That file isn't a valid FitCheck backup."));
    const user = await openProfile({ garments: [makeReference()] });
    const before = __fake.snapshot();
    await user.press(screen.getByRole('button', { name: 'Import backup' }));
    expect(await screen.findByText("That file isn't a valid FitCheck backup.")).toBeTruthy();
    expect(screen.queryByText('Import backup?')).toBeNull();
    expect(__fake.snapshot()).toEqual(before);
  });

  it('an unexpected picker failure gets a generic message', async () => {
    backup.pickBackupFile.mockRejectedValue(new Error('boom'));
    const user = await openProfile();
    await user.press(screen.getByRole('button', { name: 'Import backup' }));
    expect(await screen.findByText("Couldn't read that file.")).toBeTruthy();
  });

  it('a database failure during the restore leaves the existing closet exactly as it was', async () => {
    backup.pickBackupFile.mockResolvedValue(incomingFile());
    const user = await openProfile({ garments: [makeReference()] });
    const before = __fake.snapshot();

    await user.press(screen.getByRole('button', { name: 'Import backup' }));
    __fake.failNext('replaceAllData');
    await user.press(await screen.findByText('Replace closet'));

    expect(await screen.findByText("Couldn't import that backup — your closet wasn't changed.")).toBeTruthy();
    expect(__fake.snapshot()).toEqual(before);
  });

  it('a garment with no fit history (valid in a backup) does not break the restored closet', async () => {
    backup.pickBackupFile.mockResolvedValue(incomingFile({ observations: [] }));
    const user = await openProfile();
    await user.press(screen.getByRole('button', { name: 'Import backup' }));
    await user.press(await screen.findByText('Replace closet'));
    await screen.findByText(/Imported 1 garment/);
    await user.press(screen.getByRole('tab', { name: 'Closet' }));
    expect(await screen.findByLabelText(/Patagonia Better Sweater/)).toBeTruthy();
  });

  it('export → import round-trips the closet losslessly', async () => {
    const seed = {
      garments: [makeReference({ id: 1 }), makeCore({ id: 2, name: '501', brand: 'Levis', cat: 'pants' as const, m: { waist: 82, inseam: 78 } })],
      body: [{ at: 1_700_000_000_000, m: { waist: 80, chest: 99 } }],
    };
    const user = await openProfile(seed);
    const original = __fake.snapshot();

    await user.press(screen.getByRole('button', { name: 'Export backup' }));
    const exported = backup.shareBackupFile.mock.calls[0][0];
    // What actually goes over the wire is JSON text — round-trip through it.
    backup.pickBackupFile.mockResolvedValue(backup.validateBackup(JSON.parse(JSON.stringify(exported))));

    await user.press(screen.getByRole('button', { name: 'Import backup' }));
    await user.press(await screen.findByText('Replace closet'));
    await screen.findByText(/Imported 2 garments/);

    const restored = __fake.snapshot();
    const strip = (g: any) => ({ ...g, photo: null });
    expect(restored.garments.map(strip).sort((a, b) => a.id - b.id)).toEqual(original.garments.map(strip).sort((a, b) => a.id - b.id));
    expect(restored.observations.map(({ note, comfort, at, garmentId }) => ({ note, comfort, at, garmentId })))
      .toEqual(original.observations.map(({ note, comfort, at, garmentId }) => ({ note, comfort, at, garmentId })));
    expect(restored.body.map((b) => ({ at: b.at, m: b.m }))).toEqual(original.body.map((b) => ({ at: b.at, m: b.m })));
  });
});
