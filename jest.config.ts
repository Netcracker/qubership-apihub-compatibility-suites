// The package is `"type": "module"`, so this config is ESM. The tests themselves are transformed
// to CommonJS by ts-jest, which is what jest's default runtime expects.
export default {
  testEnvironment: 'node',
  testTimeout: 100000,
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  transformIgnorePatterns: [
    '<rootDir>/node_modules/',
  ],
  testRegex: '(/test/.*(\\.|/)(test|spec))\\.(ts?|tsx?|js?|jsx?)$',
  moduleFileExtensions: [
    'ts',
    'tsx',
    'js',
    'jsx',
    'json',
    'node',
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/dist/',
  ],
}
