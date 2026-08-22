import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('inbound contract authenticates before model execution', async () => {
  const text = await readFile('contracts/edge/kapso-inbound-webhook.md', 'utf8');
  for (const marker of [
    'whatsapp.message.received', 'X-Webhook-Signature',
    'X-Idempotency-Key', '(raw body|body crudo)',
    '(constant-time|tiempo constante)', 'target_phone_number_id',
    '1 MiB', '(no LLM|sin llamar al LLM)',
  ]) assert.match(text, new RegExp(marker, 'i'));
});

test('admission seals replay before rate counting and preserves reply correlation', async () => {
  const rpc = await readFile('contracts/rpc/agent-register-inbound-context.md', 'utf8');
  assert.match(rpc, /reply_to_provider_message_id/);
  assert.match(rpc, /replay[\s\S]*(before|antes)[\s\S]*(rate|l[ií]mite)/i);
  assert.match(rpc, /phone[\s\S]*professional|tel[eé]fono[\s\S]*profesional/i);
  assert.match(rpc, /patient_status='active'/);
});
