import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('booking Flow follows the approved order and commit boundary', async () => {
  const flow = JSON.parse(await readFile('flows/appointment-booking.flow.json', 'utf8'));
  const contract = JSON.parse(await readFile('flows/appointment-booking.contract.json', 'utf8'));
  assert.equal(flow.version, '7.0');
  assert.equal(flow.data_api_version, '3.0');
  assert.deepEqual(flow.screens.map(({ id }) => id), [
    'SERVICE', 'MODALITY', 'CALENDAR', 'SLOT', 'SUMMARY', 'CONFIRMATION',
  ]);
  assert.equal(contract.success_after_commit, true);
  assert.equal(contract.provider_validation.status, 'blocked_unverified');
});

test('Flow exposes no internal identifiers', async () => {
  const flow = await readFile('flows/appointment-booking.flow.json', 'utf8');
  for (const forbidden of ['patient_id', 'professional_id', 'service_id', 'appointment_id', 'command_id']) {
    assert.doesNotMatch(flow, new RegExp(forbidden, 'i'));
  }
});
