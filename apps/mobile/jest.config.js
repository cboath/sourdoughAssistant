/** Two Jest projects (ADR 0013): `app` (jest-expo + RNTL) and `db` (plain Node, node:sqlite). */
module.exports = {
  projects: [
    {
      displayName: 'app',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/src/**/__tests__/**/*.test.tsx'],
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sourdough/.*)',
      ],
    },
    {
      displayName: 'db',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/src/db/**/*.test.ts',
        '<rootDir>/src/state/*.test.ts',
        '<rootDir>/src/lib/*.test.ts',
        '<rootDir>/src/features/notifications/*.test.ts',
        '<rootDir>/src/features/backup/*.test.ts',
      ],
      transform: { '^.+\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }] },
      globalSetup: '<rootDir>/jest.global-setup.js',
    },
  ],
};
