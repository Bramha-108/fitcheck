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
