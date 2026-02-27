/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          target: 'ES2020',
          module: 'ES2020',
          moduleResolution: 'node',
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
        },
        diagnostics: { ignoreCodes: [151002] },
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Must run before test modules are evaluated so model modules can see env flags
  // (e.g. IN_MEMORY_DB) during import-time initialization.
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
};
