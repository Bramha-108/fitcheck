import { BACKUP_VERSION, BackupParseError, buildBackupFile, parseBackupText, validateBackup } from '../backupFormat';
import { makeGarment } from '../../engine/__tests__/fixtures';
import { hydrate } from '../../data/hydrate';

const validGarment = () => ({
  id: 1, brand: 'Uniqlo', name: 'Oxford Shirt', cat: 'tops', size: 'M',
  fit: 'Regular', sil: 'Regular', stretch: 'Rigid', tags: ['Minimal'], cap: 'shirt', bg: ['#111', '#222'],
  m: { chest: 54, length: 70 }, visual: 'No visual note yet.', photo: null, createdAt: 1_700_000_000_000,
  observations: [{ at: 1_700_000_100_000, note: 'Comfy', comfort: [{ area: 'Chest', verdict: 'Good' }] }],
});

const validFile = () => ({
  version: BACKUP_VERSION,
  exportedAt: 1_700_000_200_000,
  garments: [validGarment()],
  bodyMeasurements: [{ at: 1_700_000_000_000, m: { chest: 98, waist: 80 } }],
});

const rejects = (mutate: (f: any) => void, message?: string) => {
  const f = validFile();
  mutate(f);
  expect(() => validateBackup(f)).toThrow(BackupParseError);
  if (message) expect(() => validateBackup(f)).toThrow(message);
};

describe('validateBackup', () => {
  it('accepts a well-formed file and preserves every stored field', () => {
    const out = validateBackup(validFile());
    expect(out.garments).toHaveLength(1);
    expect(out.garments[0]).toMatchObject({ id: 1, brand: 'Uniqlo', cat: 'tops', stretch: 'Rigid', m: { chest: 54, length: 70 } });
    expect(out.garments[0].observations[0].comfort).toEqual([{ area: 'Chest', verdict: 'Good' }]);
    expect(out.bodyMeasurements).toEqual([{ at: 1_700_000_000_000, m: { chest: 98, waist: 80 } }]);
  });

  it('accepts an empty closet', () => {
    expect(validateBackup({ version: 1, exportedAt: 1, garments: [], bodyMeasurements: [] }).garments).toEqual([]);
  });

  it('rejects non-objects, arrays and null', () => {
    for (const bad of [null, undefined, 'x', 42, [], true]) expect(() => validateBackup(bad)).toThrow(BackupParseError);
  });

  it('rejects missing top-level fields', () => {
    rejects((f) => delete f.garments);
    rejects((f) => delete f.bodyMeasurements);
    rejects((f) => delete f.version);
  });

  it('rejects a backup from a newer app version with an actionable message', () => {
    rejects((f) => { f.version = BACKUP_VERSION + 1; }, 'newer version');
  });

  it('rejects version 0 / negative', () => {
    rejects((f) => { f.version = 0; });
  });

  it('rejects a null or non-object measurement map (typeof null === "object")', () => {
    rejects((f) => { f.garments[0].m = null; });
    rejects((f) => { f.garments[0].m = [54]; });
  });

  it('rejects a garment with no measurements at all', () => {
    rejects((f) => { f.garments[0].m = {}; });
  });

  it('rejects unknown, zero, negative, non-finite or non-numeric measurement values', () => {
    rejects((f) => { f.garments[0].m = { chest: 0 }; });
    rejects((f) => { f.garments[0].m = { chest: -4 }; });
    rejects((f) => { f.garments[0].m = { chest: '54' }; });
    rejects((f) => { f.garments[0].m = { chest: null }; });
    rejects((f) => { f.garments[0].m = { wingspan: 54 }; });
    // JSON can't carry NaN/Infinity, but validateBackup also accepts pre-parsed values.
    rejects((f) => { f.garments[0].m = { chest: NaN }; });
    rejects((f) => { f.garments[0].m = { chest: Infinity }; });
  });

  it('rejects an unknown category', () => {
    rejects((f) => { f.garments[0].cat = 'hats'; });
    rejects((f) => { f.garments[0].cat = 7; });
  });

  it('requires the same minimum identity the app itself requires', () => {
    for (const key of ['brand', 'name', 'size']) {
      rejects((f) => { f.garments[0][key] = ''; });
      rejects((f) => { f.garments[0][key] = '   '; });
      rejects((f) => { delete f.garments[0][key]; });
    }
  });

  it('rejects duplicate garment ids', () => {
    rejects((f) => { f.garments.push({ ...validGarment() }); });
  });

  it('rejects non-integer or missing ids', () => {
    rejects((f) => { f.garments[0].id = 1.5; });
    rejects((f) => { delete f.garments[0].id; });
  });

  it('rejects a bad stretch level, tags, bg or photo type', () => {
    rejects((f) => { f.garments[0].stretch = 'Elastic'; });
    rejects((f) => { f.garments[0].tags = ['ok', 3]; });
    rejects((f) => { f.garments[0].tags = 'Minimal'; });
    rejects((f) => { f.garments[0].bg = ['#111']; });
    rejects((f) => { f.garments[0].bg = '#111'; });
    rejects((f) => { f.garments[0].photo = 12; });
  });

  it('rejects malformed observations', () => {
    rejects((f) => { f.garments[0].observations = 'none'; });
    rejects((f) => { f.garments[0].observations[0].at = 'yesterday'; });
    rejects((f) => { f.garments[0].observations[0].note = 5; });
    rejects((f) => { f.garments[0].observations[0].comfort = [{ area: 'Chest', verdict: 'Perfect' }]; });
    rejects((f) => { f.garments[0].observations[0].comfort = [null]; });
    rejects((f) => { f.garments[0].observations[0].visual = 3; });
  });

  it('rejects malformed body measurements, including garment-only zones', () => {
    rejects((f) => { f.bodyMeasurements[0].at = 'now'; });
    rejects((f) => { f.bodyMeasurements[0].m = null; });
    rejects((f) => { f.bodyMeasurements[0].m = { rise: 30 }; }); // rise isn't a body zone
    rejects((f) => { f.bodyMeasurements[0].m = { chest: -1 }; });
  });

  it('fills genuinely optional fields with their empty value — never an invented one', () => {
    const f: any = validFile();
    for (const k of ['fit', 'sil', 'stretch', 'tags', 'cap', 'bg', 'visual', 'photo']) delete f.garments[0][k];
    const g = validateBackup(f).garments[0];
    expect(g).toMatchObject({ fit: '', sil: '', cap: '', visual: '', tags: [], photo: null, stretch: 'Some stretch' });
    expect(g.m).toEqual({ chest: 54, length: 70 }); // measurements are never touched
  });

  it('never adds a measurement the file did not contain', () => {
    const g = validateBackup(validFile()).garments[0];
    expect(Object.keys(g.m).sort()).toEqual(['chest', 'length']);
  });
});

describe('parseBackupText', () => {
  it('parses valid JSON text', () => {
    expect(parseBackupText(JSON.stringify(validFile())).garments).toHaveLength(1);
  });

  it('rejects text that is not JSON with the standard message', () => {
    expect(() => parseBackupText('not json {')).toThrow("That file isn't a valid FitCheck backup.");
    expect(() => parseBackupText('')).toThrow(BackupParseError);
  });

  it('rejects JSON that is not a backup', () => {
    expect(() => parseBackupText('{"hello":"world"}')).toThrow(BackupParseError);
    expect(() => parseBackupText('[]')).toThrow(BackupParseError);
    expect(() => parseBackupText('null')).toThrow(BackupParseError);
  });
});

describe('buildBackupFile → validateBackup round trip', () => {
  it('produces a file that validates and carries only stored (non-derived) fields', () => {
    const g = hydrate(
      {
        id: 7, brand: 'Levi\'s', name: '501', cat: 'pants', size: '32', fit: 'Straight', sil: 'Straight', stretch: 'Rigid',
        tags: [], cap: 'jeans', bg: ['#000', '#111'], m: { waist: 82, inseam: 78 }, visual: 'No visual note yet.', photo: null, createdAt: 1_700_000_000_000,
      },
      [{ id: 1, garmentId: 7, at: 1_700_000_100_000, note: 'Good in the waist', comfort: [{ area: 'Waist', verdict: 'Good' }], visual: 'Stacks nicely' }]
    );
    const file = buildBackupFile([g], [{ id: 3, at: 1_700_000_000_000, m: { waist: 80 } }]);

    // Derived fields must not leak into the file.
    const raw = JSON.parse(JSON.stringify(file));
    expect(raw.garments[0]).not.toHaveProperty('feels');
    expect(raw.garments[0]).not.toHaveProperty('history');
    expect(raw.garments[0]).not.toHaveProperty('ref');
    expect(raw.bodyMeasurements[0]).not.toHaveProperty('id');

    const restored = validateBackup(raw);
    expect(restored.garments[0].m).toEqual({ waist: 82, inseam: 78 });
    expect(restored.garments[0].observations).toHaveLength(1);
    expect(restored.garments[0].observations[0]).toMatchObject({ note: 'Good in the waist', visual: 'Stacks nicely' });
    expect(restored.bodyMeasurements).toEqual([{ at: 1_700_000_000_000, m: { waist: 80 } }]);
  });

  it('round-trips an empty-measurement-free garment fixture built by makeGarment', () => {
    const file = buildBackupFile([makeGarment({ m: { chest: 55 }, name: 'Tee', brand: 'A', size: 'S' })], []);
    expect(validateBackup(JSON.parse(JSON.stringify(file))).garments[0].m).toEqual({ chest: 55 });
  });
});
