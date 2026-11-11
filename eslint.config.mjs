import globals from './tools/node_modules/globals/index.js';
export default [{
  files: ['js/**/*.js', 'sw.js'],
  languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser, ...globals.serviceworker } },
  rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }], 'no-unreachable': 'error', 'no-dupe-keys': 'error', 'no-redeclare': 'error', 'no-self-assign': 'error', 'no-constant-condition': 'warn' },
}];
