import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');
const section = (text, start, end) => {
  const from = text.indexOf(start);
  assert.notEqual(from, -1, `falta sección: ${start}`);
  const to = end ? text.indexOf(end, from + start.length) : -1;
  return text.slice(from, to === -1 ? undefined : to);
};

test('congela el estado real y el arnés rollback-only de Fase 0', async () => {
  const [handoff, plan] = await Promise.all([
    read('docs/PRODUCTION_HANDOFF.md'),
    read('docs/superpowers/plans/2026-08-22-whatsapp-agent-foundation.md'),
  ]);
  const task8 = section(plan, '### Task 8:', '## Deferred Plans');

  for (const text of [handoff, task8]) {
    assert.match(text, /Fase 0[\s\S]*(implementad|código)[\s\S]*(rama|worktree)/i);
    assert.match(text, /no (?:está |fue )?(?:aplicad|desplegad|registrad)[\s\S]*(Supabase|producción|Edge|Kapso)/i);
    assert.match(text, /Supabase Branching[\s\S]*plan Pro[\s\S]*(no (?:se )?requiere|sin contratar)/i);
    assert.match(text, /statement_timeout\s*=\s*'30s'/i);
    assert.match(text, /lock_timeout\s*=\s*'5s'/i);
    assert.match(text, /baseline[\s\S]*dinámic[\s\S]*75[\s\S]*(observad|referencia|no.*gate)/i);
    assert.doesNotMatch(text, /(?:all|las|exactamente)\s+74\s+migracion/i);
  }
});

test('sincroniza ACK, identidad autenticada, rutas canónicas y locks Deno', async () => {
  const [handoff, plan] = await Promise.all([
    read('docs/PRODUCTION_HANDOFF.md'),
    read('docs/superpowers/plans/2026-08-22-whatsapp-agent-foundation.md'),
  ]);
  const task6 = section(plan, '### Task 6:', '### Task 7:');
  const task7 = section(plan, '### Task 7:', '### Task 8:');

  assert.match(task6, /admitted_no_workflow[\s\S]*(?:HTTP\s*)?200/i);
  assert.doesNotMatch(task6, /202\s+`?\{?\s*ok/i);
  assert.match(task6, /p_kapso_contact_id[\s\S]*null[\s\S]*p_business_portfolio_id[\s\S]*null[\s\S]*p_business_scoped_user_id[\s\S]*null/i);
  assert.match(handoff, /identidad[\s\S]*p_kapso_contact_id[\s\S]*p_business_portfolio_id[\s\S]*p_business_scoped_user_id[\s\S]*null/i);

  for (const text of [handoff, task7]) {
    assert.match(text, /new URL\(request\.url\)\.pathname[\s\S]*(mapa|tabla)[\s\S]*exact/i);
    assert.match(text, /frontera canónica|límite canónico/i);
  }
  assert.doesNotMatch(task7, /(?:promete|garantiza|rechaza)[^\n]*(?:raw traversal|traversal raw|ruta raw)/i);

  assert.match(`${task6}\n${task7}`, /deno\.lock[\s\S]*(real|generad[oa] por Deno)[\s\S]*integridad/i);
  assert.match(handoff, /deno\.lock[\s\S]*(real|generad[oa] por Deno)[\s\S]*integridad/i);
});

test('separa los checkpoints y congela el sobre de costo sin PII', async () => {
  const [handoff, plan, nodeConfig, modelLock, limits] = await Promise.all([
    read('docs/PRODUCTION_HANDOFF.md'),
    read('docs/superpowers/plans/2026-08-22-whatsapp-agent-foundation.md'),
    read('config/agent-node.json').then(JSON.parse),
    read('config/provider-model-lock.json').then(JSON.parse),
    read('config/admission-limits.json').then(JSON.parse),
  ]);
  const task8 = section(plan, '### Task 8:', '## Deferred Plans');

  for (const text of [handoff, task8]) {
    assert.match(text, /checkpoint[\s\S]*migración persistente[\s\S]*checkpoint[\s\S]*Edge[\s\S]*secret[\s\S]*checkpoint[\s\S]*Kapso/i);
    assert.match(text, /cero[\s\S]*(LLM|modelo)[\s\S]*Kapso[\s\S]*Fase 0/i);
    assert.match(text, /gpt-5\.6-luna[\s\S]*(preferid|no verificad|sin verificar)/i);
    assert.match(text, /sin fallback automático|no (?:hay|usa|permite) fallback automático/i);
    assert.match(text, /max_tokens[^\n]*2048[\s\S]*max_iterations[^\n]*16[\s\S]*reasoning[^\n]*medium[\s\S]*(?:cache|prompt_cache_ttl)[^\n]*5m/i);
    assert.match(text, /8 (?:llamadas|claims|tools) útiles[\s\S]*(?:completion|complet)[^\n]*ordinal 9/i);
    assert.match(text, /1 (?:reintento|retry)[^\n]*transporte/i);
    assert.match(text, /métricas sin PII/i);
  }

  assert.deepEqual(
    {
      model: modelLock.semantic_model,
      verified: modelLock.verification_status,
      fallback: modelLock.automatic_fallback,
      maxTokens: nodeConfig.max_tokens,
      maxIterations: nodeConfig.max_iterations,
      reasoning: nodeConfig.reasoning_effort,
      cache: nodeConfig.prompt_cache_ttl,
      usefulCalls: limits.tool_calls_per_turn,
      transportRetries: limits.gateway_transport_retries,
    },
    {
      model: 'gpt-5.6-luna',
      verified: 'blocked_unverified',
      fallback: null,
      maxTokens: 2048,
      maxIterations: 16,
      reasoning: 'medium',
      cache: '5m',
      usefulCalls: 8,
      transportRetries: 1,
    },
  );
});

test('registra el runbook runtime cometido y protege las rutas Flutter reales', async () => {
  const plan = await read('docs/superpowers/plans/2026-08-22-whatsapp-agent-foundation.md');
  const task8 = section(plan, '### Task 8:', '## Deferred Plans');

  assert.match(task8, /agenda-psi-database\/docs\/whatsapp-agent-foundation-runbook\.md/i);
  assert.match(task8, /82b603c[\s\S]*(commit|cometid)/i);
  assert.match(
    task8,
    /Neither commit[\s\S]*push[\s\S]*deploy[\s\S]*Kapso registration/i,
  );
  assert.match(task8, /flutter_application_1\/lib[\s\S]*flutter_application_1\/test/i);
  assert.doesNotMatch(task8, /--\s+lib\s+test\s+supabase\/functions/i);
});
