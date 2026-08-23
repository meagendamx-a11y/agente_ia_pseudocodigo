import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('service contract fixes price precedence and recurrence exclusion', async () => {
  const text = await readFile('contracts/rpc/agent-list-services.md', 'utf8');
  const allowlist = await readFile('config/tool-allowlist.json', 'utf8');
  assert.match(text, /is_free.*0[\s\S]*preferential_price[\s\S]*default_price/i);
  assert.match(text, /(all active services|todos los servicios activos)/i);
  assert.match(text, /has_active_recurrence/i);
  assert.doesNotMatch(allowlist, /"service_id"\s*:/i);
});

test('availability revalidates policy and does not reserve displayed slots', async () => {
  const text = await readFile('contracts/rpc/agent-get-availability.md', 'utf8');
  assert.match(text, /lead[\s\S]*modality[\s\S]*(anti-overlap|solapamiento)/i);
  assert.match(text, /(does not reserve|no reserva)/i);
  assert.match(text, /patients\.patient_status='active'/);
});

test('appointment and payment reads are future-only and multi-axis', async () => {
  const nextAppointment = await readFile('contracts/rpc/agent-get-next-appointment.md', 'utf8');
  const paymentStatus = await readFile('contracts/rpc/agent-get-appointment-payment-status.md', 'utf8');
  const confirm = await readFile('contracts/rpc/agent-confirm-appointment.md', 'utf8');
  const allowlist = await readFile('config/tool-allowlist.json', 'utf8');
  assert.match(nextAppointment, /starts_at\s*>\s*now\(\)/i);
  assert.match(paymentStatus, /payment_state.*proof_state.*late_change_state.*actionability.*can_upload_proof/is);
  assert.doesNotMatch(allowlist, /"profile_status"\s*:/i);
  assert.match(confirm, /appointment_option_token.*(future|futura).*(scheduled|programada).*(lock|bloqueo)/is);
});
