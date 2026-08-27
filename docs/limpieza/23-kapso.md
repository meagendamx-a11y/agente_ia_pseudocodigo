# Limpieza — Qué existe en Kapso

Corte: 2026-08-26, 20:30 hora de Ciudad de México.
Proyecto Kapso: **Agenda Psi**, `7cacfa3c-18f3-42c7-9623-22503fb947c7`.

**Este documento no ejecutó nada.** Es una lista de lo que se podría retirar, con su
evidencia. Nadie borró, desactivó ni desplegó nada. El dueño decide.

> **Segunda pasada, 2026-08-26 22:40.** Se revisó renglón por renglón el «SE BORRA»
> buscando un uso que se hubiera escapado. **Tres de los cinco renglones se movieron.**
> El resumen del cambio, con su evidencia, está en **§7 — REFUTACIÓN**. Las tablas de
> abajo ya están corregidas: son las buenas.

---

## ADVERTENCIAS QUE MANDAN SOBRE TODO LO DEMÁS

1. **`kapso push` trata nodos y aristas como conjuntos de reemplazo.** Mandar un nodo
   borra los demás. Si se toca el workflow, se manda la definición **completa**, y se
   baja con `kapso pull` inmediatamente antes para no pisar cambios hechos en el tablero.
2. **Desactivar el workflow deja al agente sin poder arrancar.** El webhook de entrada
   arranca ejecuciones contra ese workflow; sin él, cada mensaje entrante muere en el
   borde de Supabase.
3. **Borrar una función enganchada al workflow activo lo rompe en caliente.** Las dos
   Function Tools y el nodo de función terminal apuntan a funciones vivas.
4. **Las plantillas de WhatsApp no se pueden borrar desde Kapso.** Ni la CLI 0.18.0 ni
   el servidor MCP tienen acción de borrado (`kapso whatsapp templates` sólo ofrece
   `get`, `list`, `new`). Eso se hace en el administrador de Meta.

---

## CÓMO SE VERIFICÓ

- **Bajada real del proyecto** con la CLI, en un directorio limpio del scratchpad:
  `env -u KAPSO_API_KEY npx -y @kapso/cli@0.18.0 link --project 7cacfa3c-… --verify`
  y después `… pull --overwrite`. Salida literal: `Pulled 4 functions and 1 workflows.`
  Los archivos quedaron en
  `/private/tmp/claude-501/-Users-gaeljimenez-Documents-Agenda-Psi-Version-2---claude-worktrees-kapso-audit-ia-agent-afd65a/e551255f-4af6-45b8-a498-3ac1b5577f7e/scratchpad/kapso-pull/`.
- **MCP de Kapso**: `status`, `whatsapp_numbers list`, `whatsapp_webhooks list`,
  `whatsapp_templates list`, `search_logs` y `search` sobre los corpus `docs` y `knowledge`.
- **Base desplegada** `ssyzfeadyrczlzjbvxyl`, con SQL de sólo lectura.
- **Código desplegado** de las funciones de borde, leído con
  `get_edge_function` (no del repositorio, que tiene cambios sin subir).

**La variable `KAPSO_API_KEY` del entorno está caducada.** Un `GET` directo a
`https://api.kapso.ai/platform/v1/whatsapp/flows` con esa llave devuelve
`HTTP 401 {"error":"Invalid or missing API key"}`. Por eso la CLI exige quitarla, y por
eso el inventario de WhatsApp Flows quedó incompleto (ver §3).

---

## 1. WORKFLOWS

**Hay exactamente uno.** `kapso pull` bajó `1 workflows`.

| Campo | Valor | Evidencia |
|---|---|---|
| Nombre | `Agenda PSI — Agente WhatsApp — Draft` | `workflows/agenda-psi-agente-whatsapp-draft/workflow.yaml` |
| Slug | `agenda-psi-agente-whatsapp-draft` | mismo archivo |
| Estado | **`active`** (a pesar de llamarse «Draft») | `status: active` en `workflow.yaml` |
| Disparador | `api_call`, `active: true` | `triggers:` en `workflow.yaml` |
| Identificador | `d4ab8c62-f138-4869-a501-19e60c4483ff` | `search_logs`, `GET /platform/v1/workflows/d4ab8c62-…/definition 200` |

### Nodos y aristas

`definition.json` tiene **tres nodos y dos aristas**, y nada más (sus únicas claves de
primer nivel son `edges` y `nodes`):

- `start` — `node_type: start`, `config: {}`.
- `agent_1787536190845` — `node_type: agent`, «AI Agent».
- `function_1787546564195` — `node_type: function`, config
  `{"function_name": "agenda-psi-complete-inbound", "function_slug": "agenda-psi-complete-inbound", "save_response_to": null}`.

Aristas: `start → agent_1787536190845` y `agent_1787536190845 → function_1787546564195`,
ambas `type: default`, `label: next`.

### Configuración del nodo de agente

`provider_model_name: gpt-5.6-luna` (`provider_model_id: b0289d36-c498-4e52-ba86-52a8a00592c5`),
`temperature: "0.0"`, `reasoning_effort: medium`, `max_iterations: 16`, `max_tokens: 2048`,
`message_delivery_mode: tool_only`, `prompt_cache_ttl: 5m`,
`observer_prompt_mode: analysis_only`, `sandbox_enabled: false`.
`enabled_default_tools: ["send_notification_to_user","enter_waiting","complete_task","handoff_to_human"]`.
Vacíos: `flow_agent_webhooks`, `flow_agent_mcp_servers`, `flow_agent_knowledge_bases`,
`flow_agent_resources`, `flow_agent_app_integration_tools`, `default_tool_configs`.

Dos Function Tools declaradas:

| Nombre para el modelo | Función que ejecuta |
|---|---|
| `get_capabilities` | `agenda-psi-complete-inbound` |
| `sync_waiting` | `agenda-psi-mark-inbound-waiting` |

El prompt de sistema mide 3 792 caracteres. Dice literalmente
«La única herramienta administrativa conectada es get_capabilities» y
«Nunca uses handoff_to_human». **No menciona ningún formulario de WhatsApp.**

### ¿Se usa de verdad?

Sí. La función de borde desplegada `kapso_inbound_webhook` arranca o reanuda ejecuciones
contra `KAPSO_AGENT_WORKFLOW_ID`:
`POST https://api.kapso.ai/platform/v1/workflows/{workflowId}/executions` cuando la
admisión es `admitted`, y `…/workflow_executions/{id}/resume` cuando es `resumed`
(archivo `functions/kapso_inbound_webhook/kapso-workflow.ts` de la versión desplegada).

**Ni `agenda-psi-flow-agendar` ni `agenda-psi-flow-reprogramar` aparecen una sola vez en
`definition.json`.** Conteo literal de apariciones del slug en el archivo:
`agenda-psi-complete-inbound: 5`, `agenda-psi-mark-inbound-waiting: 2`,
`agenda-psi-flow-agendar: 0`, `agenda-psi-flow-reprogramar: 0`.

---

## 2. LAS CUATRO FUNCIONES PRIVADAS

Las cuatro son `function_type: cloudflare_worker`, `invoke_response_mode: passthrough`,
`public_endpoint: false`, `runtime_config: {}` (sus `function.yaml`).
Las cuatro son **idénticas** a las copias del repositorio de la app: `diff` sin
diferencias contra `kapso/functions/agenda-psi-agent-runtime.js`,
`…/agenda-psi-mark-inbound-waiting.js`, `…/agenda-psi-flow-agendar.js` y
`…/agenda-psi-flow-reprogramar.js`.

Invocaciones reales en los últimos 30 días (`search_logs`,
`source: function_invocation_event`, ventana 2026-07-27 → 2026-08-26, 18 eventos,
`has_more: false`):

| Función | Invocaciones 30 d | Última |
|---|---|---|
| `agenda-psi-complete-inbound` | 13 (7 con `200`, 6 con `502`) | 2026-08-24 21:09 UTC |
| `agenda-psi-flow-reprogramar` | 3 (todas `200`) | 2026-08-27 00:00 UTC |
| `agenda-psi-flow-agendar` | 2 (todas `200`) | 2026-08-26 01:07 UTC |
| `agenda-psi-mark-inbound-waiting` | **0** | — |

### 2.1 `agenda-psi-complete-inbound`

**Qué hace.** Una función con **dos caminos** que se distinguen por la forma del sobre,
no por un parámetro del modelo:

```js
const isAgentTool = isRecord(body)
  && Object.prototype.hasOwnProperty.call(body, 'input')
  && isRecord(body.flow_info)
  && Array.isArray(body.flow_events);
const route = isAgentTool ? '/tools/capabilities' : '/workflow/complete';
```

Como herramienta del agente pega a `/tools/capabilities` y devuelve
`{ ok, result, vars: { agent_capabilities_loaded: true } }`. Como nodo terminal del
workflow pega a `/workflow/complete` con `response_message_id: null`. Todo contra
`https://ssyzfeadyrczlzjbvxyl.supabase.co/functions/v1/agent_tool_gateway`, con
`AGENT_GATEWAY_SECRET` y tiempo de espera de 5 s.

**Quién la llama.** Las dos cosas a la vez: la Function Tool `get_capabilities` y el
nodo `function_1787546564195`.

**¿Hace falta con el diseño conversacional?** El cierre de la gestión sí; la doble ruta
en una sola función, no. Es el mismo anti-patrón de puerta única que se está retirando en
el resto del sistema.

**Veredicto: SE QUEDA hoy, SE PARTE en la reimplementación.** Borrarla ahora deja el
workflow activo con un nodo apuntando al vacío y sin la herramienta que el prompt exige
llamar al inicio de cada gestión.

### 2.2 `agenda-psi-mark-inbound-waiting`

**Qué hace.** Pega a `/workflow/waiting` del mismo gateway y sólo devuelve `ok` si la
respuesta trae `payload.status === 'waiting'`. Exige que el sobre traiga
`input` vacío (`Object.keys(body.input).length === 0`), `flow_info` y `flow_events`; si
no, `INVALID_EXECUTION_CONTEXT` con `400`.

**Quién la llama.** La Function Tool `sync_waiting`. El prompt la vuelve obligatoria:
«Solo si sync_waiting devuelve ok=true y status=waiting, llama enter_waiting».

**Cero invocaciones en 30 días.** Nunca se ha ejercido en producción.

**¿Hace falta?** Sí, mientras la espera dependa de sincronizar el turno antes de
`enter_waiting`. Kapso **no tiene evento de webhook de espera** — la lista de eventos del
proyecto no incluye `workflow.execution.waiting` (verificado en el corpus `docs`), así que
no hay alternativa barata.

**Veredicto: SE QUEDA.** Está declarada en el workflow activo; retirarla sin quitar antes
la herramienta del nodo deja al agente sin poder cerrar un turno con pregunta.

### 2.3 `agenda-psi-flow-agendar`

**Qué hace.** Es el endpoint de datos del formulario de agendar. Pantalla `CREAR_CITA`.
Tres pasos: `inicio → /flow/services`, `servicio|modalidad → /flow/eligibility`,
`dia → /flow/availability`.

**Quién la llama.** **Ningún nodo ni herramienta del workflow.** La llamó un WhatsApp Flow:
dos invocaciones el 2026-08-26 con `invoke_context: whatsapp_flow_data` y
`request_body.source: "whatsapp_flow"`, `flow_id: 2183999d-dc4e-450a-b3e0-7b7d851665cf`.
Desde entonces ese mismo flow apunta a la otra función (ver §3).

**Las tres rutas que pide están apagadas.** El gateway desplegado declara 27 rutas y sólo
contesta `/tools/capabilities`, `/workflow/waiting`, `/workflow/complete` y `/health`;
todo lo demás cae en `return safe(403, { ok: false, error: 'OPERATION_NOT_ENABLED' })`
(`supabase/functions/agent_tool_gateway/handler.ts`, líneas 32-35 para `/flow/*` y 241
para el 403). Por eso las dos invocaciones respondieron con la pantalla de aviso:
`"aviso": "No pude cargar tus opciones. Escríbeme e intentamos de nuevo."`

**Veredicto corregido: SE REVISA CON EL DUEÑO** (antes decía «SE BORRA»; movido en §7).
El formulario se retira, sí. Pero «no está enganchada a nada vivo hoy» **no está
comprobado**: descansa en que las cinco invocaciones con `source: whatsapp_flow` traen el
mismo `flow_id`, y de ahí en la inferencia de que hubo **un** Flow al que se le cambió el
destino. **Nadie leyó la configuración de ningún Flow.** Un segundo Flow que apunte aquí y
que nadie haya abierto en 30 días no deja ninguna huella en la bitácora, y el inventario de
Flows está abierto por confesión propia (§3). La línea original terminaba en «Confirmar
antes que el Flow no volvió a apuntarle»: una condición sin cumplir dentro de un renglón de
«SE BORRA». Y esa condición **ya no se puede cumplir con las herramientas de esta
auditoría** (§7).

### 2.4 `agenda-psi-flow-reprogramar`

**Qué hace.** Lo mismo para la pantalla `REPROGRAMAR_CITA`:
`inicio → /flow/appointments`, `cita|modalidad → /flow/eligibility`,
`dia → /flow/availability`.

**`/flow/appointments` ni siquiera existe en el gateway.** La lista de rutas declaradas
tiene `/flow/services`, `/flow/eligibility`, `/flow/availability` y `/flow/create`. No
hay `/flow/appointments`.

**Quién la llama.** **Ningún nodo ni herramienta del workflow — pero sí un WhatsApp Flow
registrado y vivo.** Tres invocaciones con `source: "whatsapp_flow"` y
`flow_id: 2183999d-dc4e-450a-b3e0-7b7d851665cf`, la última el **2026-08-27 00:00:21 UTC**,
minutos antes de escribir esto. Nombre del script:
`prj-7cacfa3c-18f3-42c7-9623-22503fb947c7__agenda-psi-flow-reprogramar`.
Las tres respondieron
`"aviso": "No pude cargar tus citas. Escríbeme e intentamos de nuevo."`

**Veredicto: SE BORRA, PERO NO PRIMERO.** Es el endpoint de datos **actual** de un Flow
registrado. Borrar la función deja al Flow contestando error de infraestructura a quien lo
abra. Primero se desengancha o se deprecia el Flow.

---

## 3. WHATSAPP FLOWS

### Lo que sí está comprobado

**Existe al menos un WhatsApp Flow registrado y en uso:**
`2183999d-dc4e-450a-b3e0-7b7d851665cf`.

Evidencia dura, de un evento de invocación real:

```json
"attributes": { "invoke_context": "whatsapp_flow_data",
                "cf_script_name": "prj-7cacfa3c-…__agenda-psi-flow-reprogramar" },
"request_body": { "source": "whatsapp_flow",
                  "flow_id": "2183999d-dc4e-450a-b3e0-7b7d851665cf",
                  "data_exchange": { "action": "INIT", "version": "3.0", … } }
```

Las cinco invocaciones con `source: whatsapp_flow` de los últimos 30 días traen **el mismo
`flow_id`**. Entre el 26 de agosto 01:07 y el 26 de agosto 01:09 su endpoint de datos pasó
de `agenda-psi-flow-agendar` a `agenda-psi-flow-reprogramar`. Es **un** Flow al que se le
cambió el destino, no dos.

**Su versión de intercambio de datos es `3.0`** (campo `data_exchange.version`), y **todas
las aperturas devuelven la pantalla de error**, porque el gateway tiene apagadas las rutas
que necesita.

### Lo que NO se pudo comprobar, y por qué

**Cuántos Flows hay en total y en qué estado están** (borrador, publicado, deprecado).
Ninguna herramienta de sólo lectura disponible los enumera:

- El servidor MCP de Kapso no tiene herramienta de flows (sus herramientas son
  `status`, `customers`, `search`, `search_logs`, `setup_links`,
  `whatsapp_numbers`, `whatsapp_webhooks`, `whatsapp_templates`,
  `whatsapp_conversations`, `whatsapp_messages`, `findings`).
- La CLI 0.18.0 tampoco: `kapso whatsapp` sólo ofrece `conversations`, `messages`,
  `numbers`, `templates`, `webhooks`.
- La API de plataforma sí tiene `GET /platform/v1/whatsapp/flows`, pero la llave del
  entorno devuelve `401 Invalid or missing API key`.

**Por eso el Flow `2183999d` va a «SE REVISA CON EL DUEÑO», no a «SE BORRA».**

### Lo que hay en el repositorio y no está desplegado

Tres archivos de Flow JSON sin seguimiento de git (`?? kapso/flows/` en `git status`) en
`/Users/gaeljimenez/Documents/Agenda Psi Version 2 /.claude/worktrees/kapso-audit-ia-agent-afd65a/kapso/flows/`:

| Archivo | Versión Flow JSON | `data_api_version` | Pantallas |
|---|---|---|---|
| `agenda-psi-citas.flow.json` | 7.3 | 4.0 | `ELEGIR`, `CUANDO` |
| `agendar-cita.flow.json` | 7.2 | 3.0 | `CREAR_CITA` |
| `reprogramar-cita.flow.json` | 7.2 | 3.0 | `REPROGRAMAR_CITA` |

**Corrección (§7): dos de los tres SÍ se atan a lo desplegado.** La pantalla que devuelve
un data endpoint tiene que existir en el Flow JSON publicado; si no, Meta rechaza la
respuesta. Y las funciones desplegadas devuelven una sola pantalla fija cada una:

```js
// kapso/functions/agenda-psi-flow-agendar.js
const PANTALLA = 'CREAR_CITA';
return json({ screen: PANTALLA, data }, 200);

// kapso/functions/agenda-psi-flow-reprogramar.js
const PANTALLA = 'REPROGRAMAR_CITA';
return json({ screen: PANTALLA, data }, 200);
```

`reprogramar-cita.flow.json` tiene exactamente una pantalla, `REPROGRAMAR_CITA`, con
`routing_model: {"REPROGRAMAR_CITA": []}` y `data_api_version: 3.0` — que es la misma
`data_exchange.version: "3.0"` de las invocaciones reales del Flow `2183999d`.
`agendar-cita.flow.json` calza igual con `CREAR_CITA` y con las dos invocaciones del 26 de
agosto a las 01:07. **`agenda-psi-citas.flow.json` no calza con nada**: pide `4.0` y
pantallas `ELEGIR`/`CUANDO` que ninguna función desplegada devuelve.

Y **ninguno está en git de verdad**: `git log --all -- <ruta>` devuelve **0 commits** para
los cinco archivos sueltos, así que borrarlos es irreversible. **`kapso pull` recupera
funciones y workflows, pero no Flows** — la CLI 0.18.0 no tiene comando de flows (§3).
Por eso `agendar-cita.flow.json` y `reprogramar-cita.flow.json` pasaron a
«SE REVISA CON EL DUEÑO»; sólo `agenda-psi-citas.flow.json` se queda en «SE BORRA».

### La trampa de Meta que hay que tener presente

Un Flow publicado **es inmutable y no se puede borrar**: error 139001 obliga a clonar y
republicar, y 139004 obliga a deprecar en vez de borrar. **Kapso no expone clonar ni
deprecar en su API de plataforma**; eso se hace por el Meta Proxy
(`POST /{flow_id}/deprecate`). Fuente: corpus `docs` de Kapso y documentación de Meta,
ya recogido en `docs/hallazgos-auditoria-agente.md` §7.5.

---

## 4. WEBHOOKS

Son dos, los dos `active: true`, los dos sobre el número de producción
`1189669584231262`, los dos con `buffer_enabled: false`, ventana 5 s, tope 50,
`payload_version: v2`. Salida de `whatsapp_webhooks list`:

| Id | URL | Eventos | Creado | Carril |
|---|---|---|---|---|
| `741b3e51-e66a-4ae5-9e2d-bae2957d067f` | `…/functions/v1/kapso_inbound_webhook` | `whatsapp.message.received` | 2026-08-23 | **agente** |
| `88980a1c-9b93-40eb-95ec-f0802632fc1d` | `…/functions/v1/kapso_status_callback` | `whatsapp.message.sent`, `.delivered`, `.read`, `.failed` | 2026-08-21 | **app — NO SE TOCA** |

### El riesgo escondido del webhook del agente

Leyendo el código **desplegado** de `kapso_inbound_webhook`, sus únicas llamadas a la base
son tres RPC del agente: `agent_register_inbound_context`,
`agent_get_inbound_resume_execution` y `agent_bind_inbound_execution`. No toca pagos, ni
comprobantes, ni citas. Hasta ahí, es carril de agente puro.

**Pero `agent_register_inbound_context` es la única función desplegada que escribe
`whatsapp_links.last_inbound_at`, y una función de la app la lee.** Verificado con SQL
sobre la base:

```sql
select n.nspname||'.'||p.proname
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') and p.prokind='f'
  and position('last_inbound_at' in pg_get_functiondef(p.oid)) > 0;
-- public.agent_register_inbound_context
-- public.assign_resources_to_appointment
```

Y las líneas exactas:

- `agent_register_inbound_context`: `SET last_inbound_at = CASE … THEN v_now …` (escribe).
- `assign_resources_to_appointment`: `AND wl.last_inbound_at >= now() - interval '24 hours'` (lee).

`assign_resources_to_appointment` es función de la app del profesional: con ella decide si
los materiales salen en el momento o si el lote se queda `waiting_for_patient`.
**Si se borra el webhook del agente, ese campo se congela y la rama de «ventana abierta»
nunca vuelve a cumplirse.** Hoy el daño sería teórico —de 18 vínculos de WhatsApp sólo 2
tienen valor, el más reciente del 2026-08-24— y el motor de trabajos de recursos tampoco
existe (`docs/hallazgos-auditoria-agente.md` §6.1), pero es una dependencia real de la app
sobre el carril del agente y por eso **no va a «SE BORRA»**.

---

## 5. PLANTILLAS

Son **18** en Kapso (`whatsapp_templates list`, `total_count: 18`), todas `es_MX`, todas
`status: approved` salvo `patient_review_request`, que está aprobada en Kapso pero cuyo
`whatsapp_data.status` sigue en `PENDING`. Todas atadas al número `1189669584231262`.

### Las que la base acepta y las que no

El catálogo real vive dentro de `private.wa_payload_ok(text, jsonb)`, y lo impone
`CHECK chk_outbox_variables` sobre `whatsapp_outbox`:

```
CHECK (((send_mode <> 'template'::outbox_send_mode) OR private.wa_payload_ok(template_key, payload)))
```

`wa_payload_ok` nombra **16** plantillas. Las **dos** de Kapso que no están en esa lista
son exactamente `appointment_reminder_1h_online_no_url` y
`appointment_reminder_1h_online_no_link`. Verificado ejecutando la función con un carga
válida de tres variables:

```sql
select private.wa_payload_ok('appointment_reminder_1h_online_simple','{"variables":["Ana","10:00","11:00"]}') -- true
     , private.wa_payload_ok('appointment_reminder_1h_online_no_url' ,'{"variables":["Ana","10:00","11:00"]}') -- false
     , private.wa_payload_ok('appointment_reminder_1h_online_no_link','{"variables":["Ana","10:00","11:00"]}') -- false
```

**No hay ninguna otra así.** Las 16 restantes están todas en el catálogo.

### La duplicación, con el detalle exacto

Hay cuatro variantes del recordatorio de una hora en línea:

| Plantilla | Vars | Texto |
|---|---|---|
| `appointment_reminder_1h_online` | 4 | incluye el enlace: «Te comparto el enlace para conectarte: {{4}}» |
| `appointment_reminder_1h_online_simple` | 3 | «El enlace para conectarte lo comparte tu profesional.» |
| `appointment_reminder_1h_online_no_url` | 3 | **texto idéntico, carácter por carácter, al de `_simple`** |
| `appointment_reminder_1h_online_no_link` | 3 | variante más corta, sin la frase del enlace |

Es decir: `_no_url` es una copia exacta de `_simple` que nació con otro nombre, y `_no_link`
es un tercer intento con texto propio. La base se quedó con `_simple` y las otras dos
quedaron colgadas del lado de Meta.

### Quién produce cada plantilla en la base desplegada

Cruce entre las 18 plantillas y el cuerpo de todas las funciones de `public` y `private`
(excluyendo `wa_payload_ok`, que es el catálogo):

| Plantilla | La produce | Filas en `whatsapp_outbox` |
|---|---|---|
| `patient_welcome` | `tg_patients_whatsapp_link_ai` | 11 |
| `appointment_confirmation_request` | `create_appointment`, `edit_appointment`, `reschedule_appointment`, `cron_appointment_confirmation_26h` | 7 |
| `appointment_reminder_1h_in_person` | `cron_appointment_reminder_1h` | 4 |
| `appointment_cancelled_payment_proof` | `cancel_appointment` | 3 |
| `appointment_cancelled` | `cancel_appointment`, `deactivate_patient`, `delete_recurrence_series`, `delete_service` | 2 |
| `appointment_rescheduled` | `reschedule_appointment` | 2 |
| `appointment_confirmation_prepay` | `cron_appointment_confirmation_26h` | 2 |
| `request_late_payment_proof` | `request_appointment_payment_proof`, `credit_appointment_payment`, `waive_appointment_payment`, `reschedule_appointment` | 1 |
| `request_session_payment_proof` | `mark_appointment_attended`, `credit_appointment_payment`, `waive_appointment_payment`, `reschedule_appointment` | 1 |
| `request_no_show_payment_proof` | `mark_appointment_no_show`, `credit_appointment_payment`, `reschedule_appointment` | 1 |
| `appointment_rescheduled_payment_proof` | `reschedule_appointment` | 1 |
| `appointment_reminder_1h_online` | `cron_appointment_reminder_1h` | 1 |
| `appointment_reminder_1h_online_simple` | `cron_appointment_reminder_1h` | 1 |
| `patient_resource_delivery` | `assign_resources_to_appointment` | 1 |
| `patient_review_request` | `request_patient_review` (**huérfana: sin llamador ni cron**) | **0** |
| `patient_reactivation` | **nadie** (sólo aparece en el disparador `tg_outbox_variables_bi`, que es el que valida) | **0** |
| `appointment_reminder_1h_online_no_url` | **nadie** | **0** |
| `appointment_reminder_1h_online_no_link` | **nadie** | **0** |

---

## 6. EL TOPE DEL PLAN

**La regla, citada de la base de conocimiento de Kapso** (nota interna
«Free projects can exceed the Cloudflare Worker script cap from older deployments»):

> «Cloning this Flow would create a new endpoint worker, and Free projects can have up to
> five distinct Cloudflare Worker scripts.»

Y añade que el tope se cuenta por `cf_script_name`: **volver a desplegar un script que ya
existe siempre se permite; crear uno distinto se bloquea al llegar al tope**, y que
**clonar un WhatsApp Flow que necesite un worker de endpoint nuevo también cuenta**.

**Cuántos se usan: cuatro.** Uno por función, con el nombre
`prj-7cacfa3c-18f3-42c7-9623-22503fb947c7__<slug>` (visto literal en los eventos de
invocación). El endpoint de datos del Flow `2183999d` **no suma un quinto**: corre sobre
el script `…__agenda-psi-flow-reprogramar`, que es el de la función que ya se contó.

**Queda un lugar libre de cinco.**

**Lo que no pude comprobar:** que el proyecto esté efectivamente en el plan Free. Ni el
servidor MCP ni la CLI exponen el plan o la facturación (`kapso status` sólo devuelve
autenticación, usuario, proyecto, clientes y números). El tope de cinco es la regla del
plan Free; si el proyecto estuviera en otro plan, el número cambia.

---

## SE BORRA

Cosas cuya eliminación no toca la app del profesional, ni sus RPC, ni sus RLS, y cuya
evidencia de desuso está arriba.

| # | Qué | Por qué es seguro |
|---|---|---|
| 1 | Plantilla **`appointment_reminder_1h_online_no_url`** | Copia exacta de `_simple`. `private.wa_payload_ok` la rechaza (`false` con carga válida), no aparece en ninguna función de `public` ni `private`, y tiene 0 filas en `whatsapp_outbox`. Se borra **en Meta**, no en Kapso. **Refutación intentada y fallida** — ver §7. |
| 2 | Plantilla **`appointment_reminder_1h_online_no_link`** | Igual: rechazada por la base, sin productor, 0 filas. Se borra en Meta. **Refutación intentada y fallida** — ver §7. |
| 3 | El archivo local **`kapso/flows/agenda-psi-citas.flow.json`** | Es el único de los tres que **no** corresponde a nada desplegado: Flow JSON 7.3, `data_api_version: 4.0`, pantallas `ELEGIR` y `CUANDO`. Ninguna de las cuatro funciones desplegadas devuelve esas pantallas (`agenda-psi-flow-agendar.js` responde `screen: 'CREAR_CITA'`, `…-reprogramar.js` responde `screen: 'REPROGRAMAR_CITA'`), y ninguna invocación registrada trae `data_exchange.version: "4.0"` — las cinco traen `"3.0"`. Es un borrador suelto. Archivo local sin seguimiento de git: borrarlo no toca ningún sistema desplegado. |

---

## SE QUEDA

| # | Qué | Por qué |
|---|---|---|
| 1 | **Webhook `88980a1c` → `kapso_status_callback`** | Es el carril de avisos de la app: `whatsapp.message.sent/delivered/read/failed`. Intocable por instrucción y por función. |
| 2 | **Función de borde `kapso_status_callback`** | Misma razón. |
| 3 | **El workflow `agenda-psi-agente-whatsapp-draft`** mientras el agente deba poder arrancar | Es el único, está activo, y `kapso_inbound_webhook` arranca ejecuciones contra su identificador. Su definición se **reescribe**, no se borra. |
| 4 | **`agenda-psi-complete-inbound`** hasta que se reemplace la definición del workflow | La nombran el nodo terminal y la Function Tool `get_capabilities`. Borrarla rompe el workflow activo en caliente. |
| 5 | **`agenda-psi-mark-inbound-waiting`** hasta lo mismo | Es `sync_waiting`, y el prompt la vuelve obligatoria antes de `enter_waiting`. Que tenga 0 invocaciones no la vuelve muerta: la vuelve **no ejercida**. |
| 6 | **Las 16 plantillas del catálogo de `wa_payload_ok`** | Cada nombre desconocido hace que `wa_payload_ok` devuelva `-1` variables esperadas y **el INSERT en `whatsapp_outbox` reviente**. Quitar una plantilla de Meta sin migrar esa función deja a la app sin poder encolar ese aviso. Incluye `patient_reactivation` y `patient_review_request`, que hoy no tienen productor pero **sí están en el catálogo**: sacarlas es una decisión de producto, no de limpieza. |
| 7 | **El número de producción `1189669584231262` y su WABA** | `status: CONNECTED`, `waba_account_review_status: APPROVED`, `TIER_250`. Es por donde sale todo. |
| 8 | **El número de sandbox `597907523413541`** | No pude comprobar que nadie lo use: no hay herramienta que ate un número de sandbox a una prueba concreta, y es la única vía que ejerce webhook, debounce y disparador de mensaje entrante de verdad. Sin comprobación, se queda. |
| 9 | **La API key `Proyecto` (`66594600-2712-4d06-aaf2-dc8b8f6985f0`)** | Es la que usan las funciones de borde de Supabase para mandar plantillas por el Meta Proxy: se ve en los registros con `User-Agent: Deno/… SupabaseEdgeRuntime`. Es carril de la app. |

---

## SE REVISA CON EL DUEÑO

| # | Qué | La pregunta concreta |
|---|---|---|
| 1 | **El WhatsApp Flow `2183999d-dc4e-450a-b3e0-7b7d851665cf`** | Está registrado, vivo, y su endpoint de datos apunta hoy a `agenda-psi-flow-reprogramar`. No pude ver su estado (borrador o publicado) porque ninguna herramienta de sólo lectura lo expone. **Si está publicado no se puede borrar: hay que deprecarlo por el Meta Proxy.** ¿Se deprecia o se deja como cascarón? |
| 2 | **Función `agenda-psi-flow-reprogramar`** | Se retira con el formulario, pero es el endpoint vivo del Flow de arriba. **Depende del punto 1** y del orden. |
| 3 | **Webhook `741b3e51` → `kapso_inbound_webhook`** | Es del agente, sí. Pero `agent_register_inbound_context` es lo único que refresca `whatsapp_links.last_inbound_at`, y `assign_resources_to_appointment` (app del profesional) lee ese campo para decidir la ventana de 24 h. Quitarlo congela el campo y fuerza para siempre la rama de «ventana cerrada». ¿Se acepta, o antes se le da otro escritor a ese campo? |
| 4 | **Si hay más Flows registrados** | Sólo comprobé uno. Hace falta una llave de API válida —o el tablero de Kapso— para listar `GET /platform/v1/whatsapp/flows` y cerrar el inventario. |
| 5 | **El plan del proyecto** | El tope de cinco scripts es del plan Free. No hay herramienta que confirme el plan. Si se van a crear funciones nuevas en la reimplementación, conviene confirmarlo antes de quedarse sin lugares. |
| 6 | **Plantillas sin productor: `patient_reactivation` y `patient_review_request`** | Están en el catálogo de la base y aprobadas en Meta, pero nadie las encola nunca. ¿Entran en la ronda o se apagan? Apagarlas exige migrar `wa_payload_ok`, no basta con borrarlas en Meta. |
| 7 | **El sandbox `597907523413541`** | Es la única vía de prueba que recorre el camino completo. ¿Se conserva para probar la reimplementación? |
| 8 | **Función `agenda-psi-flow-agendar`** *(movida desde «SE BORRA» — ver §7)* | Nadie del workflow la nombra, cierto. Pero el **26 de agosto a las 01:07 UTC** la invocó un WhatsApp Flow vivo (`invoke_context: whatsapp_flow_data`), y la única razón para creer que ese Flow ya no le apunta es una inferencia de dos minutos de bitácora, no la lectura de la configuración del Flow. **Esa confirmación ya no se puede hacer**: `GET /platform/v1/whatsapp/flows` sigue en `HTTP 401` y el servidor MCP de Kapso ahora responde «requires re-authorization (token expired)». ¿Se abre el tablero de Kapso y se lee a dónde apunta cada Flow antes de borrarla? |
| 9 | **Los archivos locales `kapso/flows/agendar-cita.flow.json` y `kapso/flows/reprogramar-cita.flow.json`** *(movidos desde «SE BORRA» — ver §7)* | Sí corresponden a lo desplegado: sus pantallas y su `data_api_version: 3.0` calzan con lo que devuelven las dos funciones y con las invocaciones reales del Flow `2183999d`. Son la **única copia que existe** (0 commits en cualquier rama) y **`kapso pull` no recupera Flows** — la CLI no tiene comando de flows. ¿Se guardan hasta resolver el Flow `2183999d` (punto 1)? |
| 10 | **Las dos copias `kapso/functions/agenda-psi-flow-agendar.js` y `…-reprogramar.js`** *(movidas desde «SE BORRA» — ver §7)* | Son el código local de dos funciones que **no están aprobadas para borrarse** (puntos 2 y 8). `kapso pull` sí las recupera mientras existan en Kapso, pero eso hoy exige una llave de API válida y la que hay devuelve `401`. ¿Se borran junto con su función, o antes? |

---

## EL ORDEN

Borrar en desorden rompe cosas en caliente. Este es el orden seguro, del paso que no
depende de nada al que depende de todo.

1. **Plantillas primero, y en Meta.** Borrar `appointment_reminder_1h_online_no_url` y
   `appointment_reminder_1h_online_no_link` en el administrador de Meta. No hay nada en la
   base ni en Kapso que las nombre, así que no rompen nada al desaparecer. Kapso no ofrece
   borrado de plantillas.
2. **Un solo archivo local: `kapso/flows/agenda-psi-citas.flow.json`.** Es el único que no
   corresponde a nada desplegado. Los otros cuatro archivos sueltos **no se borran todavía**
   (§7): son la única copia que existe de la definición y del código de dos Flows y dos
   funciones que siguen vivos.
3. **Abrir el tablero de Kapso y leer a dónde apunta cada WhatsApp Flow.** Es el paso que
   falta y del que dependen los dos siguientes. Sin él no se puede saber si
   `agenda-psi-flow-agendar` sigue siendo el endpoint de datos de algún Flow, y las tres
   vías de sólo lectura de esta auditoría están cerradas: el MCP pide reautorización, la
   CLI no tiene comando de flows y la llave del entorno devuelve `401`.
4. **Resolver los Flows antes de tocar `agenda-psi-flow-agendar` ni
   `agenda-psi-flow-reprogramar`.** Desengancharlos del endpoint de datos, o deprecarlos por
   el Meta Proxy. **Sólo después** se borran las funciones, y con ellas sus copias locales.
   Al revés, el Flow queda vivo contestando error a quien lo abra.
5. **Decidir lo de `last_inbound_at` antes de tocar el webhook `741b3e51`.** Si se decide
   que la app puede vivir sin que ese campo se refresque, el webhook se puede quitar; si
   no, se queda hasta que otro escritor lo cubra.
6. **El workflow y sus dos funciones, al final y en un solo movimiento.** La definición
   nueva se manda **completa** —nodos y aristas son conjuntos de reemplazo— y sólo cuando
   ya no queden nodos ni Function Tools apuntando a `agenda-psi-complete-inbound` ni a
   `agenda-psi-mark-inbound-waiting` se borran esas dos funciones.
7. **Nunca desactivar el workflow como paso intermedio.** Mientras esté desactivado, cada
   mensaje entrante muere y no hay agente. Si hace falta una pausa, la palanca barata es
   el interruptor `AGENT_INBOUND_ENABLED` de la función de borde, que devuelve
   `{ ok: true, status: 'disabled' }` sin romper el webhook — pero eso ya es del frente de
   Supabase, no de éste.

---

## 7. REFUTACIÓN — SEGUNDA LECTURA DEL «SE BORRA»

Corte de esta segunda pasada: 2026-08-26, 22:40 hora de Ciudad de México.
Se tomó cada renglón de «SE BORRA» y se intentó **demostrar que sí se usa**. Igual que la
primera pasada, **aquí no se ejecutó nada**: sólo `SELECT`, lectura de archivos, lectura del
código desplegado y un `GET`.

### 7.1 Lo que se movió, y por qué

| Antes | Ahora | Motivo |
|---|---|---|
| SE BORRA 3 — función `agenda-psi-flow-agendar` | **SE REVISA 8** | El renglón cargaba una condición sin cumplir («Confirmar antes que el Flow no volvió a apuntarle») y esa condición ya no se puede cumplir. |
| SE BORRA 4 — los **tres** `kapso/flows/*.flow.json` | **SE BORRA 3** (sólo `agenda-psi-citas.flow.json`) + **SE REVISA 9** (los otros dos) | El motivo que daba —«sin correspondencia comprobable con el Flow desplegado»— es falso para dos de los tres, y se puede demostrar. |
| SE BORRA 5 — las dos copias `kapso/functions/agenda-psi-flow-*.js` | **SE REVISA 10** | Son el código de dos funciones que el propio documento **no** aprueba para borrarse. |

### 7.2 Lo que aguantó la refutación: las dos plantillas

Se buscó un uso de `appointment_reminder_1h_online_no_url` y `…_no_link` por siete vías
distintas. **Ninguna dio nada.**

1. **Todo el catálogo de la base desplegada, de una sola consulta** — funciones, vistas
   materializadas y normales, políticas RLS, restricciones `CHECK`, valores por omisión de
   columna, comandos de `cron.job`, disparadores y etiquetas de enum:

   ```sql
   select 'proc', n.nspname||'.'||p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname not in ('pg_catalog','information_schema') and p.prokind='f'
      and (pg_get_functiondef(p.oid) ilike '%_1h_online_no_url%' or pg_get_functiondef(p.oid) ilike '%_1h_online_no_link%')
   union all select 'policy', schemaname||'.'||tablename||'.'||policyname from pg_policies
    where coalesce(qual,'')||coalesce(with_check,'') ilike '%_1h_online_no_%'
   union all select 'cron', jobname from cron.job where command ilike '%_1h_online_no_%'
   -- … más vistas, restricciones, defaults, triggers y enums
   -- resultado: []
   ```

2. **Clave dinámica.** La sospecha real era que alguien armara el nombre por concatenación
   (`'appointment_reminder_1h_online' || v_sufijo`). Se buscó ese patrón en todo `public` y
   `private` y **no existe**. `cron_appointment_reminder_1h` elige entre tres literales:

   ```sql
   v_tpl := CASE WHEN v_c.modality = 'in_person'::public.modality THEN 'appointment_reminder_1h_in_person'
                 WHEN v_c.enlace IS NOT NULL                      THEN 'appointment_reminder_1h_online'
                 ELSE                                                  'appointment_reminder_1h_online_simple' END;
   ```

3. **El sender no traduce nombres.** La función de borde desplegada `enviar-whatsapp` manda
   `template: { name: fila.template_key }` tal cual, sin tabla de equivalencias: no hay forma
   de que una de estas dos entre por la puerta de atrás.

4. **`_simple` está viva de verdad, no es un alias.** Era la refutación más peligrosa: que el
   nombre bueno en Meta fuera `_no_url` y el catálogo de la base estuviera equivocado. No lo
   está — la fila de `_simple` en `whatsapp_outbox` llegó a `status = 'sent'` con
   `provider_message_id` no nulo. Meta la aceptó.

5. **Cero filas en toda la historia de `whatsapp_outbox`**, no sólo hoy: el conteo agrupado
   por `template_key` sobre la tabla completa devuelve 14 claves y ninguna es éstas dos.

6. **Cero apariciones en el repositorio de la app** (`grep -rn` sobre todo el árbol) y cero en
   el repositorio de la guía fuera de este documento y de `docs/anterior/03-avisos.md`.

7. **Cero apariciones en los 137 archivos Dart.** El Flutter no nombra `whatsapp_outbox`, ni
   `template_key`, ni `appointment_reminder`, ni `kapso`. Sus «flows» son suyos
   (`lib/flows/appointment_card_actions.dart`) y no tienen nada que ver con WhatsApp Flows.

**Los renglones 1 y 2 se quedan en «SE BORRA».**

### 7.3 Por qué se movió `agenda-psi-flow-agendar`

**Primero: el lado de Supabase está limpio, y eso se confirma.** Ninguna función, cron,
política ni columna de la base nombra las funciones de Kapso, un `flow_id`, un `flow_token`
ni `nfm_reply`:

```sql
select 'proc', n.nspname||'.'||p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where p.prokind='f' and pg_get_functiondef(p.oid) ~* '(agenda-psi-flow|flow_id|2183999d|whatsapp_flow|nfm_reply|flow_token)'
union all select 'columna', table_schema||'.'||table_name||'.'||column_name from information_schema.columns
 where table_schema in ('public','private') and column_name ~* 'flow';
-- resultado: []
```

El código desplegado de `kapso_inbound_webhook` tampoco las nombra: sus únicas llamadas son
las tres RPC del agente y `POST …/workflows/{id}/executions` o `…/resume`. Y los 7 cron
activos son los siete de siempre, ninguno toca Kapso.

**El problema no es Supabase: es que el enganche vive del lado de Meta y nadie lo leyó.**

La cadena de razonamiento del documento original era: las cinco invocaciones con
`source: whatsapp_flow` traen el mismo `flow_id` → luego hubo **un** Flow → luego se le
cambió el destino de `agendar` a `reprogramar` → luego `agendar` quedó suelta. El eslabón
débil es el último: **una función que ningún Flow abrió en 30 días produce exactamente las
mismas cero líneas de bitácora que una función suelta.** La bitácora prueba lo que se usó,
no lo que está configurado. Y §3 ya reconoce que el inventario de Flows está abierto.

Esa es justamente la razón por la que el documento manda `agenda-psi-flow-reprogramar` a
«SE REVISA» y por la que manda el sandbox a «SE QUEDA» («No pude comprobar que nadie lo use…
Sin comprobación, se queda»). El mismo hueco de evidencia, aplicado con la misma vara, saca
a `agenda-psi-flow-agendar` de «SE BORRA».

**Y el hueco se cerró aún más.** Se volvió a intentar listar los Flows, por las dos vías que
quedaban, y las dos están muertas:

```
GET https://api.kapso.ai/platform/v1/whatsapp/flows   →  HTTP 401
                                                          {"error":"Invalid or missing API key"}
```

```
mcp__kapso__status  →  MCP server "kapso" requires re-authorization (token expired)
```

O sea: el servidor MCP con el que se levantó la evidencia original **ya no responde**, así
que hoy ni siquiera se puede releer la bitácora en la que descansa la inferencia. Queda una
sola vía: **abrir el tablero de Kapso y mirar el `endpoint_uri` de cada Flow.** Hasta que
alguien lo haga, esta función no se borra.

Lo que sí quedó firme, y no hace falta rehacer: **nada del workflow la nombra.** Conteo
literal en `definition.json`: `agenda-psi-flow-agendar: 0`, `agenda-psi-flow-reprogramar: 0`.

### 7.4 Por qué se partieron los archivos locales

El motivo original —«sin correspondencia comprobable con el Flow desplegado»— **es
demostrablemente falso para dos de los tres**, y la demostración está en §3: la pantalla que
devuelve el endpoint tiene que existir en el Flow JSON publicado, las funciones desplegadas
devuelven una pantalla fija cada una (`CREAR_CITA` y `REPROGRAMAR_CITA`), y esas son
exactamente las pantallas únicas de `agendar-cita.flow.json` y `reprogramar-cita.flow.json`,
con el mismo `3.0` que traen las invocaciones reales.

A eso se suma que la palabra «local» hacía sonar el borrado más inocente de lo que es:

```
$ git ls-files kapso
kapso/functions/agenda-psi-agent-runtime.js
kapso/functions/agenda-psi-agent-runtime.test.mjs
kapso/functions/agenda-psi-mark-inbound-waiting.js
kapso/functions/agenda-psi-mark-inbound-waiting.test.mjs

$ git log --all --oneline -- kapso/flows/reprogramar-cita.flow.json | wc -l
0
```

Los cinco archivos sueltos tienen **0 commits en cualquier rama**. No hay copia en ningún
lado del historial: borrarlos es definitivo. Y la red de seguridad no alcanza para todos —
**`kapso pull` recupera funciones y workflows, pero no Flows**, porque la CLI 0.18.0 no tiene
comando de flows (§3). Así que:

- `reprogramar-cita.flow.json` es hoy **la única copia legible** de la definición de un Flow
  que está vivo, que el propio documento manda a «SE REVISA», y que si está publicado no se
  puede editar: sólo clonar y republicar (§3, la trampa de Meta). Republicar necesita el JSON.
- `agendar-cita.flow.json` corresponde a lo que ese Flow servía el 26 de agosto a las 01:07.
- `agenda-psi-citas.flow.json` **no corresponde a nada**: pide `data_api_version: 4.0` —que
  Kapso no documenta en ninguna parte— y pantallas `ELEGIR`/`CUANDO` que ninguna función
  desplegada devuelve. Ése sí se borra.

Las dos copias `.js` van al mismo cajón por una razón más simple: **son el código de dos
funciones que este documento no aprueba para borrarse.** `kapso pull` sí las recupera, pero
sólo mientras la función exista en Kapso y con una llave de API válida, y la que hay devuelve
`401`. Se borran cuando se borre su función, no antes.

### 7.5 Lo que se revisó y salió limpio (para no rehacerlo)

- Los 137 archivos Dart: cero menciones de Kapso, plantillas, `whatsapp_outbox` o Flows.
- Las 6 funciones de borde desplegadas: `get-payment-proof-url`, `notificar-push`,
  `enviar-whatsapp`, `kapso_status_callback`, `kapso_inbound_webhook`, `agent_tool_gateway`.
  Ninguna nombra las plantillas ni las funciones de Kapso.
- Los 7 cron activos: ninguno nombra nada de esta lista.
- Ninguna columna de `public` ni `private` se llama `*flow*`.
- El repositorio de la app: cero referencias a `kapso/flows`, a `*.flow.json` o a los slugs
  de las funciones. El único script que lee un Flow JSON,
  `referencias/agente_ia_pseudocodigo/scripts/validate-repository.mjs`, lee
  `flows/appointment-booking.flow.json` del repositorio de la guía — **otro archivo, otra
  carpeta**. Borrar `kapso/flows/` no lo rompe.
