# WhatsApp Agent Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar, con el agente apagado, la base de control, admisión inbound y gateway fijo necesarios para probar el agente de WhatsApp sin modificar Flutter, Marketplace, sender, outbox ni callback de estados.

**Architecture:** El cambio es aditivo sobre PostgreSQL 17: extiende las dos tablas legacy sin renombrar columnas ni duplicar identidades, agrega tablas de control cerradas por ACL y publica únicamente RPC `service_role`. Dos Edge Functions nuevas usan handlers puros e inyección de dependencias para validar HMAC, payload Kapso v2 y rutas fijas; los `index.ts` se limitan al cableado Supabase/Deno. Todo queda desactivado por variables server-side. Como se eligió no contratar Supabase Pro/Branching, la migración y sus pruebas se validan sobre el proyecto actual dentro de una única transacción que termina explícitamente en `ROLLBACK`; este plan no deja DDL ni despliegues persistentes en producción.

**Tech Stack:** PostgreSQL 17.6, PL/pgSQL, Supabase Edge Runtime (Deno 2), TypeScript erasable-syntax, Node.js 22 `node:test`, Supabase CLI `2.115.0`.

**Spec:** `../../AGENT_WHATSAPP_SPEC.md`

## Global Constraints

- Proyecto objetivo: `Agenda-Psi-V2` en un worktree aislado desde `d26b6283c4ddbc169ef1078317a2008eb67a72af`.
- No modificar `lib/`, `test/` Flutter, Marketplace, RPC existentes, `enviar-whatsapp`, `kapso_status_callback`, `whatsapp_outbox` ni sus crons.
- No dejar cambios persistentes en Supabase, desplegar Edge Functions ni registrar el webhook en Kapso durante este plan. La única ejecución remota autorizada es `BEGIN -> migración -> pruebas -> ROLLBACK`.
- `AGENT_INBOUND_ENABLED=false`, `AGENT_WORKFLOW_ENABLED=false` y `AGENT_GATEWAY_ENABLED=false` por defecto.
- El webhook acepta únicamente entrega Kapso v2 no-buffered de `whatsapp.message.received`; la entrega unbuffered se verificará en el workspace autenticado de Kapso y el runtime rechazará tanto el header como el envelope batch.
- Firma HMAC-SHA256 hexadecimal sobre bytes crudos, comparación timing-safe, body máximo 1 MiB y respuesta antes de 10 segundos.
- Límites: 10 inbound/teléfono/5m; 5 turnos nuevos/teléfono/5m; 30 turnos nuevos/teléfono/24h; 100 turnos nuevos/profesional/24h; 8 tools/turno; sesión 24h; turno 30m; retención 30d.
- Tablas nuevas en `public` tienen RLS habilitado, cero policies y `REVOKE ALL` para `PUBLIC`, `anon`, `authenticated` y `service_role`; Edge solo entra por RPC `SECURITY DEFINER` de allowlist exacta.
- Cada función `SECURITY DEFINER` usa `SET search_path = ''`, nombres calificados y ACL exacta; helpers `private` no son ejecutables por roles API.
- Objetos del agente pertenecen a un owner dedicado `agenda_psi_agent_owner` (`NOLOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE`), nunca a `postgres`; el owner recibe únicamente ACL de objeto sobre dependencias explícitas y no es miembro de roles API.
- Nunca persistir texto del mensaje, prompt, secreto, bearer token, URL de media ni narrativa clínica.
- Las respuestas Edge y resultados sellados no exceden 16 KiB ni exponen teléfonos, IDs de dominio, SQL o stack traces.
- CLI y paquetes deben quedar fijados; no usar `latest` ni prereleases.

---

## File Structure

Target repository: `/Users/gaeljimenez/Documents/Agenda Psi Version 2 `

- Create `supabase/config.toml`: auth explícita de las cuatro Edge Functions live y las dos nuevas; las cuatro existentes conservan su modo actual.
- Create `supabase/functions/package.json`: scripts Node 22 para tests de handlers puros.
- Create per-function `deno.json`/`deno.lock`: configuración aislada; inbound fija `npm:@supabase/supabase-js@2.112.3`, versión estable comprobada en el registro oficial el 2026-08-22.
- Create `supabase/functions/runtime-lock.json`: hashes SHA-256 de sender y callback existentes.
- Create `supabase/functions/runtime-lock.test.mjs`: regresión que impide cambios accidentales a esas dos Edge Functions.
- Create via CLI `supabase/migrations/*_agent_whatsapp_foundation.sql`: una sola migración aditiva de Fase 0; el timestamp exacto lo genera `supabase migration new`.
- Create `supabase/tests/agent_whatsapp_foundation.sql`: assertions conductuales/ACL sin transacción propia; el harness remoto siempre las envuelve en `BEGIN ... ROLLBACK`.
- Create `supabase/functions/_shared/agent/constants.ts`: límites y códigos seguros.
- Create `supabase/functions/_shared/agent/crypto.ts`: SHA-256, HMAC y comparación timing-safe.
- Create `supabase/functions/_shared/agent/http.ts`: lectura acotada, JSON seguro y respuesta redactada.
- Create `supabase/functions/_shared/agent/kapso-v2.ts`: parser estricto del envelope v2 no-buffered.
- Create `supabase/functions/_shared/agent/secrets.ts`: secret key moderna con fallback legacy controlado.
- Create `supabase/functions/_shared/agent/*.test.ts`: tests unitarios de primitivas.
- Create `supabase/functions/kapso_inbound_webhook/handler.ts`: admisión e interruptores mediante dependencias.
- Create `supabase/functions/kapso_inbound_webhook/index.ts`: wiring Deno/Supabase.
- Create `supabase/functions/kapso_inbound_webhook/handler.test.ts`: casos HTTP y replay.
- Create `supabase/functions/agent_tool_gateway/handler.ts`: autenticación y router fijo inicialmente deshabilitado.
- Create `supabase/functions/agent_tool_gateway/index.ts`: wiring Deno/Supabase.
- Create `supabase/functions/agent_tool_gateway/handler.test.ts`: auth, ruta y kill switch.
- Create `docs/whatsapp-agent-foundation-runbook.md`: variables, comandos, métricas y rollback de este corte.

---

### Task 1: Isolated Runtime Scaffold and Regression Lock

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/functions/package.json`
- Create: `supabase/functions/runtime-lock.json`
- Create: `supabase/functions/runtime-lock.test.mjs`

**Interfaces:**
- Consumes: current `enviar-whatsapp/index.ts` and `kapso_status_callback/index.ts` bytes.
- Produces: `npm test` for Edge code and an immutable hash gate for both existing functions.

- [ ] **Step 1: Create the isolated Git worktree**

Run from the main checkout:

```bash
git worktree add ".worktrees/whatsapp-agent-runtime" -b codex/implement-whatsapp-agent d26b6283c4ddbc169ef1078317a2008eb67a72af
git -C ".worktrees/whatsapp-agent-runtime" status --short --branch
```

Expected: clean branch `codex/implement-whatsapp-agent`.

- [ ] **Step 2: Record the two existing Edge hashes**

Run:

```bash
shasum -a 256 supabase/functions/enviar-whatsapp/index.ts supabase/functions/kapso_status_callback/index.ts
```

Write the two exact results into `runtime-lock.json` using paths as keys. Do not include secrets or deployed bundles.

- [ ] **Step 3: Write the failing regression test**

The test must read `runtime-lock.json`, hash each file with `node:crypto`, and assert equality:

```js
test('existing WhatsApp Edge Functions remain byte-identical', async () => {
  for (const [path, expected] of Object.entries(lock.files)) {
    const actual = createHash('sha256').update(await readFile(path)).digest('hex');
    assert.equal(actual, expected, path);
  }
});
```

- [ ] **Step 4: Run the test before adding its lock file**

Run: `node --test supabase/functions/runtime-lock.test.mjs`

Expected: FAIL because `runtime-lock.json` is absent.

- [ ] **Step 5: Add the minimal pinned test package and lock**

`supabase/functions/package.json` must contain:

```json
{
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.0.0 <23" },
  "scripts": {
    "test": "node --experimental-strip-types --test runtime-lock.test.mjs _shared/agent/*.test.ts kapso_inbound_webhook/*.test.ts agent_tool_gateway/*.test.ts"
  }
}
```

Create `supabase/config.toml` with the exact live JWT modes plus the two new custom-auth endpoints:

```toml
project_id = "agenda-psi-v2"

[functions.get-payment-proof-url]
verify_jwt = true

[functions.notificar-push]
verify_jwt = true

[functions.enviar-whatsapp]
verify_jwt = false

[functions.kapso_status_callback]
verify_jwt = false

[functions.kapso_inbound_webhook]
verify_jwt = false

[functions.agent_tool_gateway]
verify_jwt = false
```

- [ ] **Step 6: Verify and commit**

Run:

```bash
cd supabase/functions && npm test
git diff --check
git diff -- supabase/functions/enviar-whatsapp supabase/functions/kapso_status_callback
```

Expected: tests PASS and final diff for existing functions is empty.

Commit:

```bash
git add supabase/config.toml supabase/functions/package.json supabase/functions/runtime-lock.json supabase/functions/runtime-lock.test.mjs
git commit -m "test: lock existing WhatsApp runtime"
```

---

### Task 2: Additive Agent Control Schema

**Files:**
- Create via CLI: `supabase/migrations/*_agent_whatsapp_foundation.sql`
- Create: `supabase/tests/agent_whatsapp_foundation.sql`

**Interfaces:**
- Consumes: legacy `public.whatsapp_inbound_messages`, `public.agent_sessions`, `public.whatsapp_links`, `public.patients`, `public.command_log`.
- Produces: `public.agent_turns`, `public.agent_tool_calls`, `public.agent_option_tokens`, `private.agent_runtime_targets`, `private.agent_token_key_registry` and additive envelope columns on the two legacy control tables.

- [ ] **Step 1: Write and run the failing behavioral DB test**

Write catalog assertions first in `supabase/tests/agent_whatsapp_foundation.sql`. The file itself must not call `BEGIN`, `COMMIT` or `ROLLBACK`; the remote harness supplies the transaction. It must use only catalogs and synthetic rows created by the harness, never application rows.

Execute on the current Supabase project:

```sql
begin;
-- exact contents of supabase/tests/agent_whatsapp_foundation.sql
rollback;
```

Expected: FAIL because the new tables and RPC do not exist. Confirm afterwards that no transaction remains open and no object was created.

- [ ] **Step 2: Generate the migration using the pinned CLI**

Run and record the printed path:

```bash
npx --yes supabase@2.115.0 migration new agent_whatsapp_foundation
```

Do not rename the generated timestamp.

- [ ] **Step 3: Extend legacy tables without renaming or dropping**

The migration must preserve `message_sid`, `phone`, `response_message_sid` and every existing `agent_sessions` column. `message_sid` remains the single provider-message identity and `response_message_sid` remains the single response identity; do not create alias columns that could drift. Add delivery, payload hash, target, reply correlation, admission and execution fields using `ADD COLUMN IF NOT EXISTS`. Never add a column for message text or raw payload.

Required new delivery identity unique; `message_sid` already has its legacy unique constraint:

```sql
create unique index uq_whatsapp_inbound_delivery
  on public.whatsapp_inbound_messages (webhook_delivery_key);
```

Create or validate the dedicated `agenda_psi_agent_owner` role before transferring new tables/functions. If a role with that name exists but any required attribute differs, abort. Do not change the owner or body of any existing Core RPC.

- [ ] **Step 4: Create control tables and the empty DB target allowlist**

`agent_turns` must enforce one nonterminal turn per conversation:

```sql
create unique index uq_agent_turns_one_open_conversation
  on public.agent_turns (kapso_conversation_id)
  where status in ('admitted','active','waiting_external','completing');
```

`agent_tool_calls` must enforce:

```sql
unique (turn_id, tool_call_key),
unique (turn_id, ordinal),
check (ordinal between 1 and 8),
check (outcome is null or outcome in ('committed','rejected_prewrite','unknown'))
```

`agent_option_tokens` stores `random_handle`, `key_id`, internal binding, expiry and optional consumption; it never stores the bearer or MAC.

`agent_turns.session_id` uses a nullable foreign key with `ON DELETE SET NULL`, never `CASCADE`: the legacy session sweeper must not erase the 30-day audit trail.

`private.agent_runtime_targets(phone_number_id text primary key, enabled boolean not null default false, ...)` is the database-side kill switch. It starts empty, has no API grants, and admission fails closed with `TARGET_NOT_ENABLED` unless the authenticated target has an enabled row. The Edge environment allowlist is a separate first check, not a substitute.

`private.agent_token_key_registry(key_id text primary key, can_issue boolean, verify_until timestamptz, ...)` stores only non-secret key metadata. It starts empty; HMAC material remains exclusively in Edge secrets. Issuance requires `can_issue=true`; replay/verification may use an old key only until its sealed verification deadline.

- [ ] **Step 5: Apply RLS and ACL default deny**

For every new/existing agent control table:

```sql
alter table public.<table> enable row level security;
revoke all on table public.<table> from public, anon, authenticated, service_role;
```

Add no RLS policies. Only allowlisted `SECURITY DEFINER` RPC may access these rows; `service_role` receives no direct DML on the control tables.

- [ ] **Step 6: Write executable catalog assertions**

`supabase/tests/agent_whatsapp_foundation.sql` must raise on missing columns, duplicate identity columns, missing unique indexes, missing RLS, direct `service_role`/`anon`/`authenticated` privileges, cascading session FKs, or any policy on the control tables. Assert every new table/function owner is exactly `agenda_psi_agent_owner` and that this role is `NOLOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE`. It must not query application rows.

- [ ] **Step 7: Run local tests and commit**

Run:

```bash
cd supabase/functions && npm test
git diff --check
```

Expected: PASS.

Commit the CLI-generated migration path and tests:

```bash
git add supabase/migrations supabase/tests supabase/functions
git commit -m "feat: add WhatsApp agent control schema"
```

---

### Task 3: Atomic Inbound Admission RPC

**Files:**
- Modify: `supabase/migrations/*_agent_whatsapp_foundation.sql`
- Modify: `supabase/tests/agent_whatsapp_foundation.sql`

**Interfaces:**
- Consumes: authenticated Kapso envelope fields from the Edge handler.
- Produces: `public.agent_register_inbound_context(text,text,text,text,text,text,text,text,text,text,timestamptz) -> jsonb` with status `admitted|resumed|rate_limited|replay|rejected`.

- [ ] **Step 1: Add failing catalog and ACL assertions**

Assert the exact `regprocedure` exists, is `SECURITY DEFINER`, has empty `proconfig` search path, is owned by `agenda_psi_agent_owner`, and is executable by `service_role` but not `PUBLIC`, `anon` or `authenticated`.

Run the SQL test against the current project inside `BEGIN ... ROLLBACK`; it remains RED until the migration is prepended by the Task 8 harness. Do not replace this with source-text/regex tests.

- [ ] **Step 2: Implement validation and replay before rate counting**

The RPC parameters are, in order:

```text
p_webhook_delivery_key text,
p_provider_message_id text,
p_reply_to_provider_message_id text,
p_payload_sha256 text,
p_sender_phone_e164 text,
p_target_phone_number_id text,
p_kapso_contact_id text,
p_business_portfolio_id text,
p_business_scoped_user_id text,
p_kapso_conversation_id text,
p_provider_received_at timestamptz
```

Validate nonempty bounded identifiers, `^[0-9a-f]{64}$` hash, E.164 and timestamp. Insert the ledger identity first. On unique conflict, lock and compare every sealed identity/hash field; exact match returns the sealed result and mismatch raises `REPLAY_MISMATCH`.

Require an enabled row in `private.agent_runtime_targets`; an empty allowlist is the default-off state. Write `p_provider_message_id` into legacy `message_sid` and compare against that same column on replay.

- [ ] **Step 3: Resolve relationships and lock in stable order**

Resolve active relationships through `whatsapp_links -> patients` using phone and, when present, BSUID/portfolio. Always acquire advisory locks phone first and each resolved professional second in UUID text order. Zero relationships creates public mode; one binds session; multiple returns relationship choices later without exposing IDs.

- [ ] **Step 4: Apply moving-window limits atomically**

Count admitted inbound by phone over 5 minutes and newly-created turns over 5 minutes/24 hours. Professional 24-hour count applies only when a relationship is resolved. Replay never counts. Seal `notice_claimed=true` only once per phone per 15 minutes.

- [ ] **Step 5: Create or resume session and one open turn**

Only a verified inbound may set `expires_at = clock_timestamp() + interval '24 hours'` and update `whatsapp_links.last_inbound_at` for the exact active relationship. Resume an unexpired turn active within 30 minutes; otherwise expire it and create a new turn. Use the partial unique index as the final arbiter under concurrency.

- [ ] **Step 6: Seal and return a redacted result**

Persist `admission_status`, `admission_reason`, `session_id`, `turn_id` and the returned JSON. Do not include patient/professional IDs in JSON. Internal refs are random control UUIDs only.

- [ ] **Step 7: Verify and commit**

Run local tests, `git diff --check`, then commit:

```bash
git add supabase/migrations supabase/tests supabase/functions
git commit -m "feat: add atomic inbound admission"
```

---

### Task 4: Tool Budget, Option Token and Completion Helpers

**Files:**
- Modify: `supabase/migrations/*_agent_whatsapp_foundation.sql`
- Modify: `supabase/tests/agent_whatsapp_foundation.sql`

**Interfaces:**
- Produces private helpers `private.agent_claim_tool_call`, `private.agent_finalize_tool_call`, `private.agent_issue_option_handle`, `private.agent_resolve_option_token`.
- Produces service RPC `public.agent_bind_inbound_execution(text,uuid,text) -> boolean`, `public.agent_mark_inbound_waiting(text,text) -> boolean`, `public.agent_mark_inbound_completing(text,text) -> boolean` and `public.agent_complete_inbound(text,text,text) -> boolean`.

- [ ] **Step 1: Add failing signature/ACL tests for all eight functions**

Private helpers must have zero effective privileges for `anon`, `authenticated` and `service_role`; only the trusted function owner calls them. The four public control RPCs are service-only.

- [ ] **Step 2: Implement claim under a turn row lock**

Exact signature:

```text
private.agent_claim_tool_call(uuid,text,text,text,text,text,boolean) -> jsonb
```

Arguments: turn, execution, surface, fixed operation, server-derived key, canonical input hash, mutation flag. Validate operation/mutation against an internal fixed metadata allowlist; mismatch returns `OPERATION_METADATA_MISMATCH`. Reuse existing claim on exact key/hash; mismatch rejects. Allocate ordinal 1..8 and one DB-generated `command_id` for mutations.

- [ ] **Step 3: Implement finalize with three outcomes**

Exact signature:

```text
private.agent_finalize_tool_call(uuid,text,text,jsonb) -> jsonb
```

Lock claim/turn; reject result larger than 16 KiB; never overwrite a sealed outcome. `rejected_prewrite` releases reservation, `unknown` blocks future mutations, and `committed` increments mutation count. Implement the exact saga states from the spec even though no domain mutation is enabled in this plan: after a committed cancellation only gateway operation `flow_create_appointment` (the transport name for wrapper `agent_create_appointment`) may consume the second mutation.

- [ ] **Step 4: Implement stable option handles**

Issue signature:

```text
private.agent_issue_option_handle(uuid,uuid,text,text,uuid,text,text,timestamptz,boolean) -> jsonb
```

Resolve signature:

```text
private.agent_resolve_option_token(uuid,uuid,uuid,text,boolean) -> jsonb
```

Store/replay one `random_handle` per stable issuance key. Resolve checks session, turn, kind, expiry, tenant binding and one-time consumption. Bearer HMAC stays exclusively in Edge.

- [ ] **Step 5: Implement completion after provider acceptance**

`agent_bind_inbound_execution(provider_message_id, turn_id, kapso_execution_id)` is the only transition from `admitted` or a verified resumed `waiting_external` turn to `active`; it locks inbound and turn and seals the execution ID after Kapso accepts workflow start/resume. `agent_mark_inbound_waiting(provider_message_id, kapso_execution_id)` is the only transition from `active` to `waiting_external`. `agent_mark_inbound_completing(provider_message_id, kapso_execution_id)` is the only transition from `active` to `completing` after final assistant text is accepted.

`agent_complete_inbound(provider_message_id, kapso_execution_id, response_message_id)` locks inbound and turn, requires `completing`, and is idempotent only for identical correlation. It writes `processed_at`, legacy `response_message_sid` and terminal `completed`; it never sends messages. No control RPC may accept an arbitrary requested state.

- [ ] **Step 6: Verify and commit**

Run local tests and commit:

```bash
git add supabase/migrations supabase/tests supabase/functions
git commit -m "feat: enforce agent tool budgets and completion"
```

---

### Task 5: Shared Edge Security Primitives

**Files:**
- Create: `supabase/functions/_shared/agent/constants.ts`
- Create: `supabase/functions/_shared/agent/crypto.ts`
- Create: `supabase/functions/_shared/agent/http.ts`
- Create: `supabase/functions/_shared/agent/kapso-v2.ts`
- Create: `supabase/functions/_shared/agent/secrets.ts`
- Create: `supabase/functions/_shared/agent/crypto.test.ts`
- Create: `supabase/functions/_shared/agent/http.test.ts`
- Create: `supabase/functions/_shared/agent/kapso-v2.test.ts`
- Create: `supabase/functions/_shared/agent/secrets.test.ts`

**Interfaces:**
- Produces: `verifyHmacSha256(raw, signature, secret)`, `sha256Hex(raw)`, `readBoundedBody(request, 1048576)`, `parseKapsoV2(payload)`, `getServerSecret(env)`.

- [ ] **Step 1: Write failing unit tests**

Cover exact/altered raw bytes, upper/lower hex and optional `sha256=` prefix, unequal signature lengths, invalid JSON, batch header/envelope rejection, missing phone number, BSUID-only identity rejected as `IDENTITY_UNSUPPORTED`, future timestamp and non-`cloud_api` origin. `http.test.ts` must prove that a chunked stream larger than 1 MiB is rejected even without `Content-Length`.

Run: `cd supabase/functions && npm test`

Expected: FAIL because modules do not exist.

- [ ] **Step 2: Implement constant-time HMAC and bounded reads**

Use WebCrypto only. Compare fixed-size decoded byte arrays by XOR over all bytes; malformed hex returns false without throwing. Read the body as `ArrayBuffer` once and never reserialize before HMAC.

- [ ] **Step 3: Implement the current Kapso v2 parser**

Read these authoritative fields only:

```text
message.id
message.timestamp
message.kapso.direction
message.from | conversation.phone_number
message.context.id (optional, captured only; not trusted for authorization until a real fixture is verified)
message.kapso.origin
conversation.id
conversation.business_scoped_user_id (optional)
conversation.parent_business_scoped_user_id (optional)
conversation.username (optional, never persisted in Fase 0)
phone_number_id
```

Normalize WhatsApp digits to `+<digits>`. Require top-level and conversation phone-number IDs to agree when both exist. Require `message.kapso.origin='cloud_api'`. Reject batch payloads with `BATCH_NOT_ENABLED` and BSUID-only identity with `IDENTITY_UNSUPPORTED`; do not invent a BSUID-to-patient mapping.

- [ ] **Step 4: Implement modern secret-key selection**

Parse `SUPABASE_SECRET_KEYS` JSON and select `default` when present; fallback to `SUPABASE_SECRET_KEY`, then legacy `SUPABASE_SERVICE_ROLE_KEY`. Never log names with values or lengths.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
cd supabase/functions && npm test
git diff --check
```

Commit:

```bash
git add supabase/functions/_shared supabase/functions/package.json
git commit -m "feat: add secure agent Edge primitives"
```

---

### Task 6: Disabled Kapso Inbound Webhook

**Files:**
- Create: `supabase/functions/kapso_inbound_webhook/handler.ts`
- Create: `supabase/functions/kapso_inbound_webhook/index.ts`
- Create: `supabase/functions/kapso_inbound_webhook/deno.json`
- Create: `supabase/functions/kapso_inbound_webhook/deno.lock`
- Create: `supabase/functions/kapso_inbound_webhook/handler.test.ts`

**Interfaces:**
- Consumes: Kapso headers/raw v2 body and injected `registerInbound()` dependency.
- Produces: `createKapsoInboundHandler(deps): (request: Request) => Promise<Response>`.

- [ ] **Step 1: Write failing handler tests**

Cover method 405; body >1 MiB with and without `Content-Length`; missing headers; bad HMAC before JSON parsing; event/version mismatch; target not allowlisted; batch header/body; wrong origin; BSUID-only identity; disabled switch; admitted/resumed/replay/rate-limited; RPC failure. Assert no response contains phone, WAMID, payload text or stack trace.

- [ ] **Step 2: Implement validation order and kill switches**

Order is: method/content type/content length/header syntax -> bounded raw stream -> raw HMAC -> JSON parse -> v2/event/target/origin/identity -> `AGENT_INBOUND_ENABLED`. Invalid HMAC must remain 401 even when disabled.

- [ ] **Step 3: Call admission only when inbound is enabled**

Map the authenticated envelope to the exact Task 3 parameter names. Target must pass both the environment allowlist and the DB allowlist. Until Kapso identity authority is verified, pass `p_kapso_contact_id=null`, `p_business_portfolio_id=null` and `p_business_scoped_user_id=null`; keep `parent_business_scoped_user_id` separate and never reinterpret it as portfolio/contact identity. Use an abort timeout below 8 seconds. A replay returns 200 without workflow. A rate limit returns the fixed response key only when `notice_claimed`; this plan does not send it.

- [ ] **Step 4: Keep workflow start/resume disabled**

When admission succeeds and `AGENT_WORKFLOW_ENABLED=false`, return `{ok:true,status:'admitted_no_workflow'}` with HTTP 200. Do not call Kapso API. Add a dependency seam for a later `startOrResumeWorkflow`, but its default implementation throws `WORKFLOW_DISABLED`.

- [ ] **Step 5: Wire Deno/Supabase without domain table access**

Create a function-local `deno.json` mapping `@supabase/supabase-js` to exact `npm:@supabase/supabase-js@2.112.3`; el `deno.lock` debe ser real, generado por Deno con integridad, nunca un placeholder escrito a mano. Import only the alias. `index.ts` creates a Supabase client with the modern/fallback secret, calls only `agent_register_inbound_context`, and exports no credentials. Do not query tables from Edge.

- [ ] **Step 6: Verify and commit**

Run tests, ensure existing Edge diff is empty, then commit:

```bash
git add supabase/functions/kapso_inbound_webhook supabase/functions/_shared
git commit -m "feat: add disabled Kapso inbound webhook"
```

---

### Task 7: Disabled Fixed-Route Tool Gateway

**Files:**
- Create: `supabase/functions/agent_tool_gateway/handler.ts`
- Create: `supabase/functions/agent_tool_gateway/index.ts`
- Create: `supabase/functions/agent_tool_gateway/deno.json`
- Create: `supabase/functions/agent_tool_gateway/deno.lock`
- Create: `supabase/functions/agent_tool_gateway/handler.test.ts`

**Interfaces:**
- Consumes: server-to-server bearer secret and exact request pathname.
- Produces: `createAgentToolGatewayHandler(deps)`; in Fase 0 only `GET /health` is callable and all tool paths are disabled.

- [ ] **Step 1: Write failing auth/router tests**

Cover missing/wrong bearer, timing-safe secret comparison, unsupported method, canonical path variants produced by Fetch URL, unknown path, arbitrary `function_name` body, disabled gateway, health response and maximum body/result sizes.

- [ ] **Step 2: Implement fixed-route normalization**

Use `new URL(request.url).pathname` como frontera canónica. Strip only the known Supabase prefix ending in `/agent_tool_gateway` from that canonical pathname; never derive a function or table from JSON. Define a compile-time mapa exacto de paths with no catch-all entry. The contract does not interpret the URL string before Fetch URL canonicalization. The body cannot override route, session, command ID, operation or tool-call key.

- [ ] **Step 3: Keep every agent operation disabled**

`GET /health` returns `{ok:true,enabled:false}` after auth. Only explicitly enumerated future tool/flow/media/workflow paths may return 403 `OPERATION_NOT_ENABLED`; every other path returns 404. No RPC is called.

- [ ] **Step 4: Wire and verify**

Use a function-local `deno.json` with no floating imports; el `deno.lock` debe ser real, generado por Deno con integridad, nunca un placeholder. `index.ts` reads `AGENT_GATEWAY_SECRET` and no Kapso/model secrets. Run all tests and commit:

```bash
git add supabase/functions/agent_tool_gateway supabase/functions/_shared
git commit -m "feat: add disabled fixed-route agent gateway"
```

---

### Task 8: Transactional Supabase Validation and Runbook

**Files:**
- Create in runtime repository: `agenda-psi-database/docs/whatsapp-agent-foundation-runbook.md`
- Modify: `docs/PRODUCTION_HANDOFF.md`
- Modify: `docs/superpowers/plans/2026-08-22-whatsapp-agent-foundation.md`
- Create: `test/production-handoff-as-built.test.mjs`

**Interfaces:**
- Consumes: current production schema metadata and the user-approved no-Branch test strategy.
- Produces: behavioral proof from one rolled-back transaction plus an exact before/after fingerprint; no persistent Supabase changes.

**Estado as-built:** El código de Fase 0 está implementado en una rama Git/worktree. No fue aplicado en Supabase producción, no se desplegaron las Edge nuevas y no se registró ni activó nada en Kapso. Esta validación no usa Supabase Branching ni plan Pro: no se requiere ninguno de los dos.

- [ ] **Step 1: Capture the immutable pre-test baseline**

Using read-only catalogs and the Supabase API, record a machine-comparable fingerprint of all existing user tables/columns/constraints/indexes/RLS/policies, function identity signatures/owners/security/search paths/effective ACL, triggers and migration versions. Record the four live Edge slugs, versions, JWT mode and deployed SHA. El baseline es dinámico y descubre los conteos en vez de fijarlos. La última ejecución observó 75 versiones de migración; `75` es una referencia, no un gate. Store no rows, secrets or function source in Git.

- [ ] **Step 2: Confirm the DB suite is RED without the migration**

Execute only:

```sql
begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
-- exact supabase/tests/agent_whatsapp_foundation.sql
rollback;
```

Expected: FAIL on the first missing Fase 0 object. Then query `to_regclass`/`to_regprocedure` and confirm no new object exists.

- [ ] **Step 3: Execute migration plus tests in one rollback-only transaction**

Send one SQL batch through the read/write SQL endpoint, not `apply_migration`:

```sql
begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
-- exact CLI-generated migration SQL
-- exact catalog/ACL and synthetic behavioral test SQL
rollback;
```

The test data uses reserved synthetic identifiers only and is rolled back. Cover target default-off, exact replay/mismatch, zero/one/multiple relationship branches without reading real rows, moving limits, expiry, one open turn, execution transitions, eight tool claims, mutation/saga block, token expiry/consumption, finalize outcomes and completion correlation. A SQL error aborts the transaction; never retry by removing a failing assertion.

- [ ] **Step 4: Prove rollback and compare the baseline**

Re-run the exact fingerprint and require byte-for-byte equality with Step 1. Confirm all Fase 0 tables, RPC, role and synthetic fixtures are absent; require the dynamically captured migration-version set and the four Edge versions/SHAs to remain unchanged. The observed total was 75, but no fixed count is the invariant. If any difference remains, stop and investigate before any further action.

- [ ] **Step 5: Validate Edge locally without deployment**

Run Node tests for HMAC, streaming limit, strict Kapso parser, disabled inbound, gateway auth/routes and runtime hashes. Verify the function-local `deno.lock` files are real Deno-generated integrity locks, not placeholders. Do not set production secrets, call Kapso, deploy either new slug or alter any existing slug. Security/performance advisors for the new schema are deferred until a separately approved persistent apply because they use a different connection and cannot inspect uncommitted DDL.

- [ ] **Step 6: Write the operational runbook**

Document exact environment variable names, flags default false, test commands, the rollback-only SQL harness and rollback by flags/`EXECUTE` revoke. Preserve three explicit production checkpoints: checkpoint DB — migración persistente; checkpoint Edge — deploy y secretos; checkpoint Kapso — registro y activación. None authorizes the next.

Document the fixed cost envelope too: cero tráfico LLM y cero llamadas a Kapso en Fase 0; `gpt-5.6-luna` preferido pero aún no verificado; sin fallback automático; `max_tokens=2048`, `max_iterations=16`, `reasoning=medium`, `prompt_cache_ttl=5m`; 8 llamadas útiles más completion técnico en ordinal 9; 1 reintento de transporte; métricas sin PII.

- [ ] **Step 7: Final verification**

Run the runtime checks in its implementation worktree and the guide checks in this repository:

```bash
cd /path/to/agenda-psi-database/supabase/functions && npm test
cd ../..
git diff --check
git status --short
git diff d26b6283c4ddbc169ef1078317a2008eb67a72af -- \
  flutter_application_1/lib flutter_application_1/test \
  supabase/functions/enviar-whatsapp \
  supabase/functions/kapso_status_callback
cd /path/to/agente_ia_pseudocodigo && npm run check
```

Expected: all tests PASS; final protected-path diff empty, including no files under `flutter_application_1/lib` or `flutter_application_1/test`.

- [ ] **Step 8: Record the completed local checkpoint**

The runtime runbook is committed locally in `82b603c`; the guide synchronization is also committed locally after its tests pass. Neither commit implies a push, merge, persistent Supabase apply, Edge deploy, secret change or Kapso registration. Present both branches and verification output for the separate publication/integration choice. A later explicitly approved publication may use this release note:

```text
Agent disabled by default. Migration validated only inside BEGIN/ROLLBACK; new
Edge Functions not deployed. No persistent production, Kapso, Flutter,
Marketplace, sender, outbox or status-callback changes.
```

---

## Deferred Plans

This plan intentionally stops before LLM traffic. Subsequent independently reviewable plans are:

1. Read-only service wrappers plus authenticated Kapso Agent Node preflight for one allowlisted professional.
2. Online-reminder correction, WhatsApp Flow and scheduling mutations.
3. Payment-proof media adapter.
4. Pending resource delivery and one-shot review capture.

No deferred feature may be enabled by changing only a prompt or JSON flag; each requires its own DB/Edge tests and production authorization.
