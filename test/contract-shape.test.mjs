import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('gateway is fixed-route, bounded and replay safe', async () => {
  const gateway = await readFile('contracts/edge/agent-tool-gateway.md', 'utf8');
  const allowlist = await readFile('config/tool-allowlist.json', 'utf8');
  for (const required of ['allowlist', '8', '(10 seconds|10 segundos|10 s)',
    '(input hash|hash de entrada)', 'command_id', '(redacted|redactado)',
    'cancel_then_open_booking_flow', '(provider invocation|invocaci[oó]n del proveedor)',
    '(Flow token handle|handle del token.*Flow)']) {
    assert.match(gateway, new RegExp(required, 'i'));
  }
  assert.doesNotMatch(allowlist, /"function_name"\s*:/i);
});

test('completion happens after provider accepts final text', async () => {
  const text = await readFile('contracts/rpc/agent-complete-inbound.md', 'utf8');
  assert.match(text, /assistant text[\s\S]*complete_task[\s\S]*Function Node[\s\S]*processed_at/is);
  assert.match(text, /response_message_id[\s\S]*(optional|opcional)/i);
});
