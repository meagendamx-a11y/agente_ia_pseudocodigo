import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('mutations lock, revalidate and never mutate a series', async () => {
  const files = await Promise.all([
    'agent-create-appointment', 'agent-cancel-appointment',
    'agent-reschedule-appointment', 'agent-switch-appointment-modality',
  ].map(name => readFile(`contracts/rpc/${name}.md`, 'utf8')));
  for (const text of files) {
    assert.match(text, /lock/i);
    assert.match(text, /command_id/i);
    assert.match(text, /idempoten/i);
    assert.match(text, /patients\.patient_status='active'/);
  }
  const allowlist = await readFile('config/tool-allowlist.json', 'utf8');
  const gateway = await readFile('contracts/edge/agent-tool-gateway.md', 'utf8');
  assert.doesNotMatch(allowlist, /skip_to_next/);
  assert.match(files[2], /never writes.*recurrence_series|nunca escribe.*recurrence_series/is);
  assert.match(gateway, /cancel_claimed.*awaiting_replacement_create.*only.*create|cancel_claimed.*awaiting_replacement_create.*solo.*create/is);
});

test('local datetime contract is timezone and DST safe', async () => {
  const create = await readFile('contracts/rpc/agent-create-appointment.md', 'utf8');
  assert.match(create, /YYYY-MM-DDTHH:mm:ss[\s\S]*(no Z|sin Z)[\s\S]*IANA[\s\S]*(ambiguous|ambigu)/i);
  assert.match(create, /agreed_price[\s\S]*(authoritative|autorit)/i);
});
