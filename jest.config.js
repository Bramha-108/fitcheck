/**
 * Deliberately not jest-expo/react-native's preset — every module under test
 * (src/engine, src/utils/units.ts, src/data/hydrate.ts, src/data/constants.ts)
 * has zero React Native/Expo imports, so a plain ts-jest setup is enough and
 * avoids pulling in RN component mocking this suite doesn't need. Add a
 * component-testing setup separately if UI tests are ever added.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
};
