import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('documents every legacy disposition without embedding SQL', async () => {
  const lock = JSON.parse(await readFile('references.lock.json', 'utf8'));
  const text = await readFile('docs/LEGACY_13_MIGRATION.md', 'utf8');
  for (const item of lock.legacy_agent_functions) {
    assert.match(text, new RegExp(item.file.replace('.', '\\.')));
    assert.match(text, new RegExp(`\\| ${item.disposition} \\|`, 'i'));
  }
  assert.doesNotMatch(text, /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i);
});
