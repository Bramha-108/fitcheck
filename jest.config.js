/**
 * Two projects, on purpose:
 *
 * - `unit` — plain ts-jest in a node environment for the modules that have zero
 *   React Native/Expo imports (src/engine, src/utils/units.ts, src/utils/backupFormat.ts,
 *   src/data/*). Fast, and deliberately kept free of RN mocking.
 * - `screens` — the `jest-expo` preset (per the Expo SDK 57 unit-testing docs) plus
 *   @testing-library/react-native, for functional tests that render the real <App />
 *   and drive it the way a user would. Only native boundaries are faked (SQLite,
 *   fonts, file/photo/share I/O) — see src/screens/__tests__/testUtils.tsx.
 */
module.exports = {
  // Each `screens` test renders the whole <App /> and drives it like a user, so a
  // single test takes ~0.5-2s alone. Under a full parallel run on a busy machine the
  // slowest one sometimes crossed Jest's 5s default — a timeout, not a failure.
  // This must live here, not inside a project: Jest only reads `testTimeout` from
  // the top-level config and warns "Unknown option" (and ignores it) per-project.
  testTimeout: 15000,
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
      transform: {
        '^.+\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
      },
    },
    {
      displayName: 'screens',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/src/**/__tests__/**/*.test.tsx'],
      setupFiles: ['react-native-gesture-handler/jestSetup'],
    },
  ],
};
