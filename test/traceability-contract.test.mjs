import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('maps all closed decisions and scenarios exactly once or more', async () => {
  const text = await readFile('docs/TRACEABILITY.md', 'utf8');
  assert.equal(text.match(/^\| DEC-\d{2} \|/gm)?.length, 26);
  assert.equal(text.match(/^\| SCN-\d{2} \|/gm)?.length, 37);
  assert.doesNotMatch(text, /decisi[oó]n abierta/i);
});
