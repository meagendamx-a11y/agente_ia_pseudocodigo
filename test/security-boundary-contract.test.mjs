import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

test('forbids internal identifiers from model-visible schemas', async () => {
  const allowlist = await readFile('config/tool-allowlist.json', 'utf8').catch(() => '');
  const state = await readFile('contracts/data/agent-control-state.md', 'utf8');
  for (const forbidden of [
    'p_professional_id', 'p_patient_id', 'p_appointment_id',
    'p_storage_object_path', 'p_reschedule_mode', 'skip_to_next',
  ]) assert.equal(allowlist.includes(forbidden), false, forbidden);

  const files = await readdir('contracts/internal').catch(() => []);
  assert.deepEqual(files.sort(), [
    'agent-claim-tool-call.md',
    'agent-finalize-tool-call.md',
    'agent-issue-option-handle.md',
    'agent-resolve-option-token.md',
  ]);
  assert.match(state, /stable.*handle.*HMAC.*restart|handle estable.*HMAC.*reinicio/is);
  assert.match(state, /never.*complete bearer token|nunca.*token bearer completo/is);
  assert.match(state, /key_id.*original key|key_id.*clave original/is);
});

test('freezes admission and token lifetimes', async () => {
  const limits = JSON.parse(await readFile('config/admission-limits.json', 'utf8'));
  assert.deepEqual(
    [limits.inbound_per_phone_5m, limits.new_turns_per_phone_5m,
      limits.new_turns_per_phone_24h, limits.new_turns_per_professional_24h],
    [10, 5, 30, 100],
  );
  assert.equal(limits.tool_calls_per_turn, 8);
  assert.equal(limits.gateway_transport_retries, 1);
  assert.equal(limits.session_ttl_hours, 24);
});
