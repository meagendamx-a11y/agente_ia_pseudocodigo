import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('review contract persists only the final confirmed submission', async () => {
  const text = await readFile('contracts/rpc/agent-submit-review.md', 'utf8');
  assert.match(text, /rating.*1\.\.5.*comment.*1000/is);
  assert.match(text, /single final mutation|una sola mutaci[oó]n final/i);
  assert.match(text, /moderation_status.*pending/is);
  assert.match(text, /no persistent draft|sin borrador persistido/i);
  assert.match(text, /patients\.patient_status='active'/);
  const allowlist = await readFile('config/tool-allowlist.json', 'utf8');
  assert.doesNotMatch(allowlist, /agent_update_review|agent_get_review_status/);
});

test('review completion uses only the fixed thank-you', async () => {
  const responses = JSON.parse(await readFile('config/static-responses.es-MX.json', 'utf8'));
  assert.equal(responses.review_thanks, 'Perfecto, muchas gracias por tu reseña.');
});
