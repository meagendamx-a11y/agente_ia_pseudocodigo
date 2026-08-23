import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8').catch(() => '');
const compact = (text) => text.replace(/\s+/g, ' ').trim();

function assertSignature(text, name, parameters, returnType) {
  const signature = `${name}(${parameters.join(',')}) -> ${returnType}`;
  assert.ok(
    compact(text).includes(signature),
    `falta firma exacta: ${signature}`,
  );
}

test('congela los TTL de los cinco option-token kinds implementados', async () => {
  const ttl = JSON.parse(await read('config/token-lifetimes.json'));
  assert.deepEqual(
    {
      relationship: ttl.relationship_minutes,
      service: ttl.service_minutes,
      appointment: ttl.appointment_minutes,
      slot: ttl.slot_minutes,
      flow: ttl.flow_minutes,
    },
    { relationship: 10, service: 15, appointment: 15, slot: 5, flow: 15 },
  );

  const [availability, traceability] = await Promise.all([
    read('contracts/rpc/agent-get-availability.md'),
    read('docs/TRACEABILITY.md'),
  ]);
  assert.match(availability, /slot[\s\S]*expiry 5m/i);
  assert.match(traceability, /SCN-14[\s\S]*tokens 5m/i);
});

test('documenta el schema de control as-built sin command_log', async () => {
  const state = await read('contracts/data/agent-control-state.md');
  for (const marker of [
    'agent_turns', 'agent_tool_calls', 'agent_option_tokens',
    'agent_runtime_targets', 'agent_token_key_registry',
    'ordinal 1..8', 'ordinal 9', 'unknown_blocked',
    'uq_agent_turns_one_open_conversation',
    'uq_agent_tool_calls_one_pending_mutation',
  ]) assert.match(state, new RegExp(marker.replaceAll('.', '\\.'), 'i'), marker);
  assert.doesNotMatch(state, /command_log/i);
});

test('congela la firma de 11 argumentos y el DTO exacto de admission', async () => {
  const admission = await read('contracts/rpc/agent-register-inbound-context.md');
  assertSignature(admission, 'agent_register_inbound_context', [
    'p_webhook_delivery_key text',
    'p_provider_message_id text',
    'p_reply_to_provider_message_id text',
    'p_payload_sha256 text',
    'p_sender_phone_e164 text',
    'p_target_phone_number_id text',
    'p_kapso_contact_id text',
    'p_business_portfolio_id text',
    'p_business_scoped_user_id text',
    'p_kapso_conversation_id text',
    'p_provider_received_at timestamptz',
  ], 'jsonb');
  assert.match(
    compact(admission),
    /DTO exacto: `?\{status,reason,session_id,turn_id,relationship_state,notice_claimed,original_status\}`?/,
  );
  assert.match(admission, /unresolved\|public\|tenant\|ambiguous/);
  assert.match(admission, /waiting_external[\s\S]*RESUMED/i);
  assert.match(admission, /admitted\|active\|completing[\s\S]*TURN_BUSY/i);
  assert.doesNotMatch(admission, /whatsapp_outbox|resource_invitation|patient_resource_delivery/i);
});

test('congela firmas y DTOs exactos de claim, finalize, issue y resolve', async () => {
  const [claim, finalize, issue, resolve] = await Promise.all([
    read('contracts/internal/agent-claim-tool-call.md'),
    read('contracts/internal/agent-finalize-tool-call.md'),
    read('contracts/internal/agent-issue-option-handle.md'),
    read('contracts/internal/agent-resolve-option-token.md'),
  ]);

  assertSignature(claim, 'private.agent_claim_tool_call', [
    'p_turn_id uuid', 'p_execution_id text', 'p_surface text',
    'p_operation text', 'p_tool_call_key text', 'p_input_sha256 text',
    'p_is_mutation boolean',
  ], 'jsonb');
  assertSignature(finalize, 'private.agent_finalize_tool_call', [
    'p_turn_id uuid', 'p_tool_call_key text', 'p_outcome text',
    'p_redacted_result jsonb',
  ], 'jsonb');
  assertSignature(issue, 'private.agent_issue_option_handle', [
    'p_session_id uuid', 'p_turn_id uuid', 'p_kind text',
    'p_entity_type text', 'p_entity_id uuid', 'p_stable_key text',
    'p_key_id text', 'p_expires_at timestamptz', 'p_one_time boolean',
  ], 'jsonb');
  assertSignature(resolve, 'private.agent_resolve_option_token', [
    'p_session_id uuid', 'p_turn_id uuid', 'p_random_handle uuid',
    'p_expected_kind text', 'p_consume boolean',
  ], 'jsonb');

  assert.match(compact(claim), /DTO exacto: `?\{status,reason,ordinal,command_id,replay,outcome,redacted_result\}`?/);
  assert.match(compact(finalize), /DTO exacto: `?\{status,reason,ordinal,command_id,replay,outcome,redacted_result\}`?/);
  assert.match(compact(issue), /DTO exacto: `?\{status,reason,random_handle,kind,expires_at,key_id,replay\}`?/);
  assert.match(compact(resolve), /DTO exacto: `?\{status,reason,kind,entity_type,entity_id,patient_id,professional_id,consumed\}`?/);
  assert.doesNotMatch(`${claim}\n${finalize}`, /command_log/i);
});

test('documenta ocho llamadas utiles, completion tecnica y saga acotada', async () => {
  const [state, claim, finalize] = await Promise.all([
    read('contracts/data/agent-control-state.md'),
    read('contracts/internal/agent-claim-tool-call.md'),
    read('contracts/internal/agent-finalize-tool-call.md'),
  ]);
  const text = `${state}\n${claim}\n${finalize}`;
  assert.match(text, /8 (llamadas|claims) (útiles|utiles)/i);
  assert.match(text, /complete_inbound[\s\S]*ordinal 9/i);
  assert.match(text, /cancel_then_open_booking_flow[\s\S]*(<= ?3|a lo sumo 3)/i);
  assert.match(text, /flow_create_appointment[\s\S]*ordinal 8/i);
  assert.match(text, /tercera mutaci[oó]n[\s\S]*(bloque|rechaz)/i);
  assert.match(text, /unknown[\s\S]*unknown_blocked/i);
});

test('congela la matriz estructural y TTL de los cinco token kinds', async () => {
  const issue = await read('contracts/internal/agent-issue-option-handle.md');
  for (const row of [
    /relationship\s*\|\s*whatsapp_link\s*\|\s*10\s*\|\s*true/i,
    /service\s*\|\s*service\s*\|\s*15\s*\|\s*false/i,
    /appointment\s*\|\s*appointment\s*\|\s*15\s*\|\s*false/i,
    /slot\s*\|\s*service_slot\s*\|\s*5\s*\|\s*true/i,
    /flow\s*\|\s*turn\s*\|\s*15\s*\|\s*true/i,
  ]) assert.match(issue, row);
  assert.match(issue, /verify_until[\s\S]*can_issue/i);
  assert.match(issue, /stable[\s\S]*(?:no|nunca se) sobrescribe[\s\S]*expirad/i);
});

test('congela las cuatro RPC lifecycle y sus gates de claims pendientes', async () => {
  const [bind, waiting, completing, complete] = await Promise.all([
    read('contracts/rpc/agent-bind-inbound-execution.md'),
    read('contracts/rpc/agent-mark-inbound-waiting.md'),
    read('contracts/rpc/agent-mark-inbound-completing.md'),
    read('contracts/rpc/agent-complete-inbound.md'),
  ]);
  assertSignature(bind, 'agent_bind_inbound_execution', [
    'p_provider_message_id text', 'p_turn_id uuid', 'p_kapso_execution_id text',
  ], 'boolean');
  assertSignature(waiting, 'agent_mark_inbound_waiting', [
    'p_provider_message_id text', 'p_kapso_execution_id text',
  ], 'boolean');
  assertSignature(completing, 'agent_mark_inbound_completing', [
    'p_provider_message_id text', 'p_kapso_execution_id text',
  ], 'boolean');
  assertSignature(complete, 'agent_complete_inbound', [
    'p_provider_message_id text', 'p_kapso_execution_id text',
    'p_response_message_id text',
  ], 'boolean');
  assert.match(bind, /resumed[\s\S]*waiting_external/i);
  assert.match(`${waiting}\n${completing}`, /cero claims pendientes/i);
  assert.match(complete, /exactamente un claim pendiente[\s\S]*workflow_internal[\s\S]*complete_inbound/i);
  assert.match(complete, /response_message_id[\s\S]*(nullable|opcional)/i);
});

test('sincroniza matriz, especificacion, trazabilidad y dependencias al SQL as-built', async () => {
  const [matrix, spec, traceability, dependencies] = await Promise.all([
    read('docs/FUNCTION_MATRIX.md'), read('docs/AGENT_WHATSAPP_SPEC.md'),
    read('docs/TRACEABILITY.md'), read('docs/CORE_DEPENDENCIES.md'),
  ]);
  for (const fn of [
    'agent_bind_inbound_execution', 'agent_mark_inbound_waiting',
    'agent_mark_inbound_completing', 'agent_complete_inbound',
  ]) assert.match(matrix, new RegExp(fn));
  assert.match(spec, /8 llamadas útiles[\s\S]*ordinal 9/i);
  assert.match(spec, /relationship\/service\/appointment\/slot\/flow[\s\S]*10\/15\/15\/5\/15/i);
  assert.match(traceability, /ordinal 9/i);
  assert.match(traceability, /waiting_external/i);
  assert.match(dependencies, /Tasks 2.?4[\s\S]*(rollback|ROLLBACK)[\s\S]*(no desplegad|no aplicado)/i);
});
