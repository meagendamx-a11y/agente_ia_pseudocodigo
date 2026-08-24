import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('uses an honest stable cost envelope and blocks unverified provider config', async () => {
  const config = JSON.parse(await readFile('config/agent-node.json', 'utf8'));
  const modelLock = JSON.parse(await readFile('config/provider-model-lock.json', 'utf8'));
  const responses = JSON.parse(await readFile('config/static-responses.es-MX.json', 'utf8'));
  const allowlist = JSON.parse(await readFile('config/tool-allowlist.json', 'utf8'));
  const fixtures = JSON.parse(await readFile('test/fixtures/agent-intents.json', 'utf8'));

  assert.ok(['gpt-5.6-luna', 'gpt-5.2', 'gpt-5'].includes(modelLock.semantic_model));
  if (modelLock.verification_status === 'verified_e2e') {
    assert.match(modelLock.provider_model_id, /\S/);
    assert.equal(config.provider_model_id, modelLock.provider_model_id);
  } else {
    assert.ok([
      'blocked_unverified',
      'inventory_verified_e2e_pending',
    ].includes(modelLock.verification_status));
    assert.equal(modelLock.provider_model_id, null);
    assert.equal(config.provider_model_id, null);
    assert.equal(config.deployment_enabled, false);
    assert.equal(allowlist.agent_node_enabled, false);
  }
  if (modelLock.semantic_model !== 'gpt-5.6-luna') assert.equal(modelLock.selection_mode, 'manual_fallback');
  assert.equal(config.reasoning_effort, 'medium');
  assert.equal(config.max_iterations, 16);
  assert.equal(config.max_tokens, 2048);
  assert.equal(config.prompt_cache_ttl, '5m');
  assert.equal(config.message_delivery_mode, 'internal_only');
  assert.deepEqual(config.enabled_default_tools.sort(), [
    'complete_task',
    'enter_waiting',
    'send_notification_to_user',
  ]);
  assert.equal(modelLock.automatic_fallback, null);
  assert.match(responses.rate_limit_notice, /55 64 37 00 81[\s\S]*911[\s\S]*800 911 2000/);
  assert.match(responses.unknown_outcome, /no pude confirmar[\s\S]*no lo intentar[eé] de nuevo autom[aá]ticamente/i);
  assert.doesNotMatch(JSON.stringify(allowlist),
    /sandbox|repository|\bMCP\b|web_search|file_search|computer_use|code_interpreter|app_integration|handoff/i);
  assert.equal(fixtures.length, 37);
});

test('crisis and review messages do not append the ordinary closing', async () => {
  const responses = JSON.parse(await readFile('config/static-responses.es-MX.json', 'utf8'));
  assert.doesNotMatch(responses.crisis, /Hay algo m[aá]s/);
  assert.equal(responses.review_thanks, 'Perfecto, muchas gracias por tu reseña.');
  assert.doesNotMatch(responses.review_thanks, /Hay algo m[aá]s/);
});
