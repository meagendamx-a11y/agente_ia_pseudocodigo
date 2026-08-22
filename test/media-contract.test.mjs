import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('media adapter is private, bounded and never credits payment', async () => {
  const text = await readFile('contracts/edge/kapso-payment-proof-adapter.md', 'utf8');
  for (const value of ['comprobantes', '5 MiB', 'image/jpeg', 'image/png', 'image/webp',
    'SHA-256', '(8 seconds|8 segundos|8 s)']) {
    assert.match(text, new RegExp(value, 'i'));
  }
  assert.match(text, /(private bucket|bucket privado)/i);
  assert.doesNotMatch(text, /mark.*paid|marcar.*pagad/i);
});

test('attachment requires requested pending payment and active patient', async () => {
  const text = await readFile('contracts/rpc/agent-attach-payment-proof.md', 'utf8');
  assert.match(text, /proof_requested_at[\s\S]*no existing proof|proof_requested_at[\s\S]*sin comprobante/i);
  assert.match(text, /patients\.patient_status='active'/);
  assert.match(text, /proof_received_pending_review/);
});
