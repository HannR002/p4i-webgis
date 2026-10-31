// Read-only compatibility comparison. Exit 0 confirms the trial is incompatible.
// Usage: node reproduce-override.mjs /absolute/baseline /absolute/override-trial
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
const roots = process.argv.slice(2);
assert.equal(roots.length, 2, 'Pass clean baseline and minimatch-11 trial roots');
const results = roots.map((root, index) => {
  const req = createRequire(path.resolve(root, 'package.json'));
  const { Linter } = req('eslint');
  const plugin = req('eslint-plugin-jsx-a11y');
  try {
    const messages = new Linter().verify(
      'const Example = () => <label><CustomControl /></label>;',
      [{
        languageOptions: { ecmaVersion: 2022, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
        plugins: { 'jsx-a11y': plugin },
        rules: { 'jsx-a11y/label-has-associated-control': ['error', { controlComponents: ['Custom*'], depth: 3 }] },
      }],
    );
    return { index, completed: true, messages: messages.map(({ ruleId, message }) => ({ ruleId, message })) };
  } catch (error) {
    return { index, completed: false, error: error.message };
  }
});
console.log(JSON.stringify(results, null, 2));
assert(results[0].completed);
assert(!results[1].completed);
assert.match(results[1].error, /minimatch.*not a function/);
