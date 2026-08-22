import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('locks the authoritative sources and all legacy agent functions', async () => {
  const lock = JSON.parse(await readFile('references.lock.json', 'utf8'));
  assert.equal(lock.repositories.database_pseudocodigo.commit,
    'b2e38ee6a8109c86e537aa1a628868a45f095b30');
  assert.equal(lock.repositories.agenda_psi_database.commit,
    '4a854363f4fe3b85b75cf79c3744ead8957d9102');
  assert.equal(lock.legacy_agent_functions.length, 13);
  const counts = Object.fromEntries(
    ['rewrite', 'replace', 'omit'].map(disposition => [
      disposition,
      lock.legacy_agent_functions.filter(x => x.disposition === disposition).length,
    ]),
  );
  assert.deepEqual(counts, { rewrite: 8, replace: 3, omit: 2 });
});
