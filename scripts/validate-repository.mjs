import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const errors = [];
const fail = message => errors.push(message);

async function exists(file) {
  try { await readFile(file); return true; } catch { return false; }
}

async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const item = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(item));
    else result.push(item);
  }
  return result;
}

async function parseJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { fail(`${file}: JSON inválido: ${error.message}`); return null; }
}

const requiredRpc = [
  'agent-register-inbound-context.md', 'agent-select-relationship.md',
  'agent-bind-inbound-execution.md', 'agent-mark-inbound-waiting.md',
  'agent-mark-inbound-completing.md', 'agent-complete-inbound.md',
  'sweep-expired-agent-sessions.md',
  'purge-whatsapp-inbound.md', 'agent-get-capabilities.md',
  'agent-list-services.md', 'agent-get-booking-eligibility.md',
  'agent-get-availability.md', 'agent-list-upcoming-appointments.md',
  'agent-get-next-appointment.md', 'agent-get-location.md',
  'agent-get-pending-payments.md', 'agent-get-appointment-payment-status.md',
  'agent-get-professional-share-profile.md', 'agent-confirm-appointment.md',
  'agent-create-appointment.md', 'agent-cancel-appointment.md',
  'agent-reschedule-appointment.md', 'agent-switch-appointment-modality.md',
  'agent-attach-payment-proof.md', 'agent-resume-resource-delivery.md',
  'agent-submit-review.md',
];
const requiredEdge = ['agent-tool-gateway.md', 'kapso-inbound-webhook.md', 'kapso-payment-proof-adapter.md'];
const requiredInternal = ['agent-claim-tool-call.md', 'agent-finalize-tool-call.md', 'agent-issue-option-handle.md', 'agent-resolve-option-token.md'];
const requiredWorkers = ['resource-delivery-worker.md'];

for (const [dir, expected] of Object.entries({
  'contracts/rpc': requiredRpc,
  'contracts/edge': requiredEdge,
  'contracts/internal': requiredInternal,
  'contracts/workers': requiredWorkers,
})) {
  const actual = (await readdir(dir).catch(() => [])).filter(x => x.endsWith('.md')).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) fail(`${dir}: inventario incorrecto; esperado ${expected.length}, recibido ${actual.length}`);
}

const allFiles = await walk('.');
for (const file of allFiles.filter(x => x.endsWith('.json'))) await parseJson(file);
for (const file of allFiles.filter(x => x.endsWith('.sql'))) fail(`SQL desplegable prohibido: ${file}`);

const contractFiles = allFiles.filter(file => /^contracts\/.+\.md$/.test(file));
const requiredSections = [
  'Tipo:', 'Actor:', '## Objetivo', '## Entrada externa', '## Contexto inyectado',
  '## Lee', '## Escribe', '## Validaciones', '## Flujo lógico',
  '## Transacción/locks/idempotencia', '## Salida redactada',
  '## Errores seguros', '## No debe hacer', '## Pruebas mínimas', '## Trazabilidad',
];
for (const file of contractFiles) {
  const text = await readFile(file, 'utf8');
  for (const section of requiredSections) if (!text.includes(section)) fail(`${file}: falta ${section}`);
}

const lock = await parseJson('references.lock.json');
if (lock) {
  const legacy = lock.legacy_agent_functions ?? [];
  const count = disposition => legacy.filter(item => item.disposition === disposition).length;
  if (legacy.length !== 13 || count('rewrite') !== 8 || count('replace') !== 3 || count('omit') !== 2) fail('references.lock.json: legacy debe ser 13 con rewrite=8, replace=3, omit=2');
}

const traceability = await readFile('docs/TRACEABILITY.md', 'utf8').catch(() => '');
const decisionIds = [...traceability.matchAll(/^\| (DEC-\d{2}) \|/gm)].map(match => match[1]);
const scenarioIds = [...traceability.matchAll(/^\| (SCN-\d{2}) \|/gm)].map(match => match[1]);
const expectedDecisionIds = Array.from({ length: 26 }, (_, index) => `DEC-${String(index + 1).padStart(2, '0')}`);
const expectedScenarioIds = Array.from({ length: 37 }, (_, index) => `SCN-${String(index + 1).padStart(2, '0')}`);
if (JSON.stringify(decisionIds) !== JSON.stringify(expectedDecisionIds)) fail('TRACEABILITY: DEC-01..DEC-26 deben existir una vez y en orden');
if (JSON.stringify(scenarioIds) !== JSON.stringify(expectedScenarioIds)) fail('TRACEABILITY: SCN-01..SCN-37 deben existir una vez y en orden');

const intentFixtures = await parseJson('test/fixtures/agent-intents.json');
if (intentFixtures && JSON.stringify(intentFixtures.map(item => item.scenario_id)) !== JSON.stringify(expectedScenarioIds)) fail('fixtures: SCN-01..SCN-37 deben existir una vez y en orden');

const limits = await parseJson('config/admission-limits.json');
if (limits && JSON.stringify([
  limits.inbound_per_phone_5m, limits.new_turns_per_phone_5m,
  limits.new_turns_per_phone_24h, limits.new_turns_per_professional_24h,
  limits.tool_calls_per_turn, limits.gateway_timeout_ms,
]) !== JSON.stringify([10, 5, 30, 100, 8, 10000])) fail('admission-limits: valores no aprobados');

const agent = await parseJson('config/agent-node.json');
const model = await parseJson('config/provider-model-lock.json');
const allowlist = await parseJson('config/tool-allowlist.json');
if (agent && model && allowlist) {
  if (agent.reasoning_effort !== 'medium' || agent.max_iterations !== 16 || agent.max_tokens !== 2048 || agent.prompt_cache_ttl !== '5m') fail('agent-node: envelope no aprobado');
  if (agent.message_delivery_mode !== 'internal_only') fail('agent-node: entrega directa debe permanecer interna');
  if (JSON.stringify([...agent.enabled_default_tools].sort()) !== JSON.stringify(['complete_task', 'enter_waiting', 'send_notification_to_user'])) fail('agent-node: default tools incorrectas');
  if (model.automatic_fallback !== null) fail('provider lock: fallback automático prohibido');
  if (model.verification_status !== 'verified_e2e' && !(model.provider_model_id === null && agent.deployment_enabled === false && allowlist.agent_node_enabled === false)) fail('provider no verificado debe fallar cerrado');
  const visible = JSON.stringify(allowlist);
  for (const forbidden of ['agent_get_online_link_status','agent_request_human_handoff','agent_retry_online_reminder','agent_update_review','agent_get_review_status','skip_to_next','p_patient_id','p_professional_id','p_appointment_id','p_storage_object_path','p_reschedule_mode']) {
    if (visible.includes(forbidden)) fail(`allowlist contiene alcance/entrada prohibida: ${forbidden}`);
  }
}

const flow = await parseJson('flows/appointment-booking.flow.json');
const flowContract = await parseJson('flows/appointment-booking.contract.json');
const expectedScreens = ['SERVICE','MODALITY','CALENDAR','SLOT','SUMMARY','CONFIRMATION'];
if (flow && (flow.version !== '7.0' || flow.data_api_version !== '3.0' || JSON.stringify(flow.screens.map(x => x.id)) !== JSON.stringify(expectedScreens))) fail('Flow: versión/orden incorrecto');
if (flowContract?.success_after_commit !== true) fail('Flow: success_after_commit debe ser true');

const domainPrivate = requiredRpc.filter(file => ![
  'agent-register-inbound-context.md','agent-select-relationship.md',
  'agent-bind-inbound-execution.md','agent-mark-inbound-waiting.md',
  'agent-mark-inbound-completing.md','agent-complete-inbound.md',
  'sweep-expired-agent-sessions.md','purge-whatsapp-inbound.md',
  'agent-get-capabilities.md','agent-get-professional-share-profile.md',
].includes(file));
for (const file of domainPrivate) {
  const text = await readFile(path.join('contracts/rpc', file), 'utf8').catch(() => '');
  if (!text.includes("patients.patient_status='active'")) fail(`${file}: falta guard server-side de paciente activo`);
}

const queryFiles = [
  'agent-get-capabilities.md','agent-list-services.md','agent-get-booking-eligibility.md',
  'agent-get-availability.md','agent-list-upcoming-appointments.md','agent-get-next-appointment.md',
  'agent-get-location.md','agent-get-pending-payments.md','agent-get-appointment-payment-status.md',
  'agent-get-professional-share-profile.md',
];
for (const file of queryFiles) {
  const text = await readFile(path.join('contracts/rpc', file), 'utf8');
  if (!/cero escrituras de dominio/i.test(text)) fail(`${file}: la query debe declarar cero escrituras de dominio`);
}

const mutationFiles = [
  'agent-confirm-appointment.md','agent-create-appointment.md','agent-cancel-appointment.md',
  'agent-reschedule-appointment.md','agent-switch-appointment-modality.md',
  'agent-attach-payment-proof.md','agent-resume-resource-delivery.md','agent-submit-review.md',
];
for (const file of mutationFiles) {
  const text = await readFile(path.join('contracts/rpc', file), 'utf8').catch(() => '');
  if (!/lock/i.test(text) || !/command_id/i.test(text) || !/idempoten/i.test(text)) fail(`${file}: falta lock/command/idempotencia`);
}

for (const file of ['docs/ARCHITECTURE.md','docs/CORE_DEPENDENCIES.md','docs/TEST_PLAN.md','docs/PRODUCTION_HANDOFF.md','.github/workflows/contracts.yml']) {
  if (!(await exists(file))) fail(`falta artefacto final: ${file}`);
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  console.error(`Validación fallida: ${errors.length} error(es).`);
  process.exitCode = 1;
} else {
  console.log(`Repositorio contractual completo: ${requiredRpc.length} RPC, ${requiredEdge.length} Edge, ${requiredInternal.length} helpers, ${requiredWorkers.length} worker.`);
}
