import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('resource flow sends only assigned pending resources', async () => {
  const rpc = await readFile('contracts/rpc/agent-resume-resource-delivery.md', 'utf8');
  const worker = await readFile('contracts/workers/resource-delivery-worker.md', 'utf8');
  assert.match(rpc, /waiting_for_patient.*attended.*queued/is);
  assert.match(rpc, /reply_to_provider_message_id.*whatsapp_outbox.*batch_id/is);
  assert.match(rpc, /(fail closed|falla cerrado)/i);
  assert.match(worker, /batch.*25.*lease.*(2 minutes|2 minutos|2 min).*max.*8/is);
  assert.match(rpc, /(never (selects|requests).*resources|nunca (selecciona|solicita).*recursos)/is);
  assert.match(rpc, /patients\.patient_status='active'/);
});
