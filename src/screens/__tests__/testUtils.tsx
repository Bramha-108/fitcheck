import React from 'react';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import App from '../../../App';
import { GarmentCore } from '../../data/hydrate';
import { SeedGarment, __fake } from './fakeDb';

/**
 * Shared harness for the screen tests. Every test file must, at module top level:
 *
 *   jest.mock('../../db', () => require('./fakeDb'));
 *   jest.mock('../../utils/photo', () => require('./nativeMocks').photo);
 *   jest.mock('../../utils/backup', () => require('./nativeMocks').backup);
 *
 * (jest.mock calls are hoisted per-file, so they can't live in this shared module.)
 * Fonts and the splash screen are mocked below, once, for every importer.
 */
jest.mock('@expo-google-fonts/archivo', () => ({
  useFonts: () => [true, null],
  Archivo_400Regular: 1, Archivo_500Medium: 1, Archivo_600SemiBold: 1, Archivo_700Bold: 1,
}));
jest.mock('@expo-google-fonts/jetbrains-mono', () => ({ JetBrainsMono_400Regular: 1, JetBrainsMono_500Medium: 1 }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

/** Screen-transition/entrance animations shouldn't make tests wait; the store and
 * screens already skip straight to their end state under reduced motion. */
jest.mock('../../utils/motion', () => {
  const actual = jest.requireActual('../../utils/motion');
  return { ...actual, useReducedMotion: () => true };
});

export { __fake };

const NOW = Date.now();

export function makeCore(overrides: Partial<SeedGarment> = {}): SeedGarment {
  return {
    id: 1, brand: 'Uniqlo', name: 'Oxford Shirt', cat: 'tops', size: 'M', fit: 'Regular', sil: 'Regular',
    stretch: 'Some stretch', tags: [], cap: 'garment photo', bg: ['#E3E0DA', '#EDEAE4'],
    m: { chest: 54, shoulder: 45, length: 70, sleeve: 62, waist: 50 }, visual: 'No visual note yet.',
    photo: null, createdAt: NOW - 86_400_000, observations: [],
    ...overrides,
  } as SeedGarment & GarmentCore;
}

/** A garment the user marked comfortable, so it qualifies as a strong reference. */
export function makeReference(overrides: Partial<SeedGarment> = {}): SeedGarment {
  return makeCore({
    observations: [{ at: NOW - 3_600_000, note: 'Fits great', comfort: [
      { area: 'Chest', verdict: 'Good' }, { area: 'Shoulder', verdict: 'Good' }, { area: 'Length', verdict: 'Good' },
      { area: 'Sleeve', verdict: 'Good' }, { area: 'Waist', verdict: 'Good' },
    ] }],
    ...overrides,
  });
}

/** Renders the real <App /> against the fake database and waits for the closet to load. */
export async function renderApp(seed: Parameters<typeof __fake.reset>[0] = {}) {
  __fake.reset(seed);
  const utils = await render(<App />);
  await screen.findByRole('tab', { name: 'Home' });
  return utils;
}

export async function tapTab(label: 'Home' | 'Closet' | 'FitCheck' | 'Profile') {
  const user = userEvent.setup();
  await user.press(screen.getByRole('tab', { name: label }));
}

export { act, screen, userEvent, waitFor };
