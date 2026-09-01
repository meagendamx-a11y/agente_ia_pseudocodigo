# Prompt de continuación — Auditoría del agente de WhatsApp de Agenda Psi

> **Cómo se usa:** pega este archivo completo como primer mensaje en una sesión nueva, en un
> entorno cuya política de red permita salida a documentación oficial. Contiene todo lo que ya
> se investigó y verificó, para no repetir trabajo, y el plan de lo que falta.
>
> Corte de esta auditoría: **2026-09-01**. Repo: `meagendamx-a11y/agente_ia_pseudocodigo`,
> rama `claude/audit-ai-agent-implementation-jv5fkj`.

---

## 0. Tu misión en esta sesión

Ya se hizo una auditoría profunda (6 agentes de mapeo + 10 dimensiones de auditoría + verificación
adversarial; 76 hallazgos: 10 bloqueantes, 38 altos, 18 medios, 10 fortalezas). **No la repitas.**
Este documento la resume entera.

Lo que quedó pendiente y es tu trabajo:

1. **Verificar contra documentación oficial** las ~15 preguntas abiertas de §9, que la sesión
   anterior no pudo abrir porque el proxy de red bloqueaba los dominios.
2. **Cerrar el veredicto** sobre si la arquitectura A3 es la adecuada, ya con esas respuestas.
3. **Entregar la delimitación final** del agente: qué se construye, en qué orden, qué se pospone.

El objetivo del fundador (Gael) **no** es especificar cada RPC al detalle todavía. Es decidir si
*este tipo de agente* es el correcto para su workflow y sus conversaciones, y si es eficiente.
La especificación fina viene después.

**Cómo responder:** en español, directo al diagnóstico, riesgos y trade-offs explícitos, y separando
claramente lo que necesita aprobación de Gael. Nunca toques `.env` ni credenciales.

---

## 1. Requisito del entorno

La sesión anterior corrió en un entorno cuya política de egress bloqueaba **todo** dominio de
documentación. Verificado: `docs.kapso.ai`, `kapso.com`, `supabase.com`, `developers.facebook.com`,
`playbooks.com` → todos `EGRESS_BLOCKED`. Sólo funcionaban la búsqueda web y los MCP.

**Antes de empezar, confirma que puedes abrir estos dominios** (haz un fetch de prueba a cada uno):

- `docs.kapso.ai` ← el más importante
- `kapso.com` (guías de precios)
- `supabase.com/docs`
- `developers.facebook.com` y `business.whatsapp.com`
- `platform.openai.com` / `developers.openai.com`

Si alguno sigue bloqueado, dilo antes de trabajar; la mitad de esta sesión depende de leerlos.

Esto no es capricho: el propio `AGENTS.md` §4 del repo exige *"Antes de usar sintaxis o comportamiento
de Kapso, Meta, Supabase u OpenAI se revisa la documentación oficial vigente. Si no puede comprobarse,
se escribe como pendiente; no se estima."*

---

## 2. El proyecto

**Agenda Psi** es un SaaS para profesionales de salud mental (psicólogas) en México. Gael es el
fundador, itera con usuarias reales.

### Repos

| Repo | Qué es |
|---|---|
| `meagendamx-a11y/agenda-psi-v2` | La app Flutter + las Edge Functions + migraciones. Rama `main`. |
| `meagendamx-a11y/agente_ia_pseudocodigo` | **Sólo documentación** del agente propuesto. Sin código. 12 archivos: `README.md`, `AGENTS.md`, `docs/00`..`docs/09`. |

Dentro de `Agenda-Psi-V2/referencias/` viajan cuatro repos congelados que especifican el sistema:
`database_pseudocodigo/` (pseudocódigo SQL idéntico a lo desplegado), `agenda-psi-database/`
(contratos de dominio), `agendapsi_app_pseudocodigo/` (qué pantalla llama a qué RPC),
`ageda_psi_final/` (histórico, no manda).

### Supabase

- Producción: `project_id = ssyzfeadyrczlzjbvxyl` (nombre "Agenda PSI V2"), Postgres 17, us-west-2.
- Existe también `deklbpimnkueqsugepqq` ("Agenda PSI"), el proyecto viejo. **No es el vigente.**

### Arquitectura del producto hoy

La app Flutter habla con Supabase **sólo por RPC** — cero lecturas directas a tablas. ~95 funciones
`public`, 99 de 100 son `SECURITY DEFINER`, propiedad de `postgres`, y el aislamiento de tenant lo
da un `WHERE professional_id = current_professional_id()` **escrito a mano en cada cuerpo**, no la
RLS (las tablas tienen `relforcerowsecurity = false`, así que dentro de una `SECURITY DEFINER` la
RLS no aplica).

---

## 3. Historia arquitectónica: el péndulo A1 → A2 → A3

Esto es esencial para entender el diseño actual. Han oscilado tres veces.

### A1 (22–27 ago 2026) — Kapso + máquina de estados propia y pesada

Workflow de Kapso con Agent Node **más** una máquina de estados propia en Supabase:
`agent_sessions`, turnos, `agent_register_inbound_context`, `agent_claim_tool_call`,
`agent_mark_inbound_waiting`, presupuesto de 12 llamadas.

**Se probó E2E real.** La evidencia está en git:

```bash
git show 16e0606:docs/IMPLEMENTATION_STATUS.md
git show 16e0606:docs/KAPSO_INVENTORY.md
```

Resultado del E2E del **2026-08-23** (esto es oro, es lo único empírico que existe):

- Inbound real → Agent Node → Function Tool `get_capabilities` (outcome `committed`) ✅
- `send_notification_to_user` entregó el mensaje por WhatsApp ✅
- La ejecución quedó en `Waiting` ✅
- **El follow-up falló con `TURN_BUSY`**: `enter_waiting` cambia el estado en Kapso pero no llamaba
  la RPC propia `agent_mark_inbound_waiting`, así que el turno en Supabase seguía `active`.
  **Dos dueños del mismo estado, desincronizados.**
- Costo observado: **$0.0008 USD** un inbound real; $0.0006 y 4.096 tokens una prueba sintética.
- Config verificada en el Agent Node: `gpt-5.6-luna`, `temperature 0`, `reasoning medium`,
  `max_iterations 16`, `max_tokens 2048`, `prompt_cache_ttl 5m`.
- Workflow ID `d4ab8c62-f138-4869-a501-19e60c4483ff`, 3 nodos y 2 aristas.

### A2 (28–30 ago, commit `3f0cf38`, árbol `ced1ba5`) — el pendulazo

Borraron el workflow y el Agent Node de Kapso. El modelo pasó a correr **dentro de nuestra Edge
Function** `kapso_inbound_webhook`, llamando a OpenAI y a las RPC directo. Kapso quedó como
mensajería. Frenos: candado por conversación + tope de 3 llamadas por mensaje + memoria
conversacional propia (columna `subject`).

Se borraron de la base **6 tablas, 13 funciones, 11 columnas** y el rol dueño del andamio.

### A3 (1 sep, commits `ed7a8eb` + `9ace45e`) — el diseño actual a auditar

Vuelta a Kapso, pero **sin** la maquinaria de A1:

```
Trigger inbound → Kapso agrupa 5 s → Function Node resolve_whatsapp_identity (determinista, 6 estados)
  → Agent Node (gpt-5.6-luna, temp 0, message_delivery_mode: tool_only)
  → 1 de 10 Function Tools → adaptador → agent_tool_gateway (Edge privada, HMAC)
  → RPC de dominio en Postgres (autoriza, muta, avisa Y REDACTA EL TEXTO FINAL)
  → vuelve al modelo → send_notification_to_user (copia literal) → enter_waiting | complete_task
```

Decisiones fuertes: sin tablas de sesión, sin memoria propia, sin cron, sin candado de sesión.
El estado entre turnos viaja en un token cifrado y autenticado en `vars.agent_state`, sellado por
el gateway. Idempotencia con el `command_log` existente y un `command_id` UUIDv5 derivado de los
WAMID del batch, **sin incluir la operación**.

Las 10 herramientas: `ver_servicios`, `buscar_horarios`, `agendar`, `confirmar`, `reprogramar`,
`cancelar`, `cambiar_modalidad`, `mandar_comprobante`, `dejar_resena`, `mis_citas`.

**Lectura clave:** A3 **no** es una vuelta a A1. Elimina por construcción la clase de fallo que mató
el E2E de A1 (dos máquinas de estado). El pendulazo A2 fue una sobrerreacción: mataron la plataforma
en lugar de matar la duplicación de estado.

---

## 4. Hechos verificados contra la base desplegada

**No los vuelvas a verificar. Úsalos.** Todos comprobados con SQL contra `ssyzfeadyrczlzjbvxyl`.

### 4.1 Lo que NO existe

- **Cero RPC de agente.** Ninguna función `agent_*` en `public`. Las 10 RPC están **todas por construir**.
- `agent_sessions` y `whatsapp_conversation_state` no existen (correcto según el diseño).
- No existe motor de políticas: **ninguna función desplegada evalúa `free_change_notice_minutes`**.
  Las dos RPC de cambio ponen `change_policy_result = NULL` a propósito. El "a tiempo / tarde" que
  decide el dinero **no existe todavía en producción**.
- No existe moderación de reseñas: nada publica una reseña, y `get_marketplace_reviews` filtra por
  `published`. Una reseña escrita por el agente nace en un cajón que nadie puede abrir.

### 4.2 Tablas y volúmenes reales

`professionals 6 · patients 22 · appointments 79-80 · payments 79-80 · whatsapp_links 19 ·
command_log 401 · whatsapp_outbox 31 · whatsapp_inbound_messages 10 · payment_proofs 0 ·
reviews 0 · notifications 17 · jobs 17 · services 29`. RLS activo en las 34 tablas.

**Concentración real:** una sola profesional concentra **71 de las 80 citas (89%)**; una segunda
tiene 7; una tercera 2; **tres de las seis nunca han creado una cita**. El MVP real es *una
profesional con ~14 pacientes*, no seis con veintidós.

### 4.3 Esquema — lo que ya está listo para el agente

- `actor_type` = `patient | professional | system` → el agente escribe como `patient`, **sin DDL**.
- `appointment_origin` = `professional | patient | recurring_series` → **el esquema fue diseñado
  anticipando citas creadas por la paciente**.
- `patients.patient_status` = `active | inactive` (NOT NULL, default `active`). **Aquí se resuelve
  `inactive_patient`**: 19 links → 16 activos, 3 inactivos. El documento nunca nombra esta columna.
- `command_log` PK = `(scope_type, scope_id, command_id)`; `scope_type` es **text libre**. Entra
  `scope_type='whatsapp_agent'` + `scope_id=whatsapp_link.id` + `actor='patient'` sin DDL. El patrón
  `INSERT ON CONFLICT DO NOTHING` + `SELECT FOR UPDATE` **ya lo usan las RPC desplegadas**
  (verificado en `cancel_appointment`).
- Modelo económico **completo, no falta ninguna columna**: `payments.status` =
  `not_applicable|pending|credited|waived`; `waive_reason` = `forgiven|carried_forward` (el traslado
  de pago ya existe); `late_change_decision` = `pending|charge|no_charge` con
  `chk_late_decision_resolution`; `charge_reason` = `session|no_show|cancellation|reschedule`;
  `UNIQUE(appointment_id)` en payments y `UNIQUE(payment_id)` en payment_proofs.
- Barreras de concurrencia ya probadas:
  `excl_appointments_no_overlap EXCLUDE USING gist (professional_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (status='scheduled')`
  y `pg_advisory_xact_lock(hashtextextended('agenda:'||professional_id, 0))` en `create_appointment`,
  `reschedule_appointment` y `cancel_appointment`.
- Índice ya desplegado: `uq_whatsapp_links_prof_portfolio_bsuid` sobre
  `(professional_id, business_portfolio_id, business_scoped_user_id)` donde BSUID no es null.
- `chk_appointment_patient_booking_origin` exige `starts_at <= created_at + 48h` para nacer
  confirmada → las 26 horas del diseño caben.
- **Efecto lateral no documentado:** `chk_payment_proof_requested_transfer` obliga a
  `method='transfer'` cuando `proof_requested_at` no es nulo. Sellar la petición de prepago al
  agendar **compromete el cobro como transferencia** y bloquea efectivo después.

### 4.4 Estado del canal de WhatsApp — crítico

- `whatsapp_links`: **0 filas con `business_scoped_user_id`, 0 con `kapso_contact_id`, 0 con
  `business_portfolio_id`**. Los índices `ix_whatsapp_links_kapso_contact` y
  `ix_whatsapp_links_portfolio_bsuid` figuran como **no usados**. El diseño resuelve identidad
  BSUID-first sobre una tabla que tiene cero BSUID, y **ninguna función desplegada escribe esas
  columnas** (el único escritor, `agent_register_inbound_context`, se borró en A2).
- `whatsapp_inbound_messages`: 10 filas, todas del **24-ago-2026**, 0 con `response_message_sid`.
  `last_inbound_at` poblado en 2 de 19 links. **La conversación entrante está muerta hoy.**
- `whatsapp_outbox`: de 31 mensajes, **24 fallaron con error `131026` de Meta ("Message
  undeliverable")**. De los 19 teléfonos, sólo 7 tuvieron intento de envío y **sólo 2 entrega real**.
  Todos son `+52 55` de 13 caracteres, E.164 bien formado: el problema no es el formato.
  ⚠️ **Verifica esto tú mismo al empezar** — la sesión anterior no alcanzó a re-confirmarlo, y si es
  cierto, es el hallazgo más importante de todos: el canal saliente está roto y con él el entrante.
- 4 crons cada 5 min: `cron_appointment_confirmation_26h`, `cron_appointment_reminder_1h`,
  `cron_sweep_past_pending`, más `sender_whatsapp` cada minuto y tres `purge_*` horarios.
  `cron_prepay_proof_request` está **retirado** (sólo emite WARNING y devuelve 0).

### 4.5 Edge Functions desplegadas

`agent_tool_gateway` (v35, `verify_jwt=false`), `kapso_inbound_webhook` (v32), `kapso_status_callback`,
`enviar-whatsapp`, `notificar-push`, `get-payment-proof-url`.

- **`agent_tool_gateway` v35 es un cascarón muerto**: `BASE_PATH='/agent_tool_gateway'`, auth Bearer
  estático (no HMAC), 28 rutas en lista blanca, sólo 3 vivas (`/tools/capabilities`,
  `/workflow/waiting`, `/workflow/complete`) que llaman tres RPC **que ya no existen**. Hoy
  responde 401/404/405/503, nunca algo útil.
  ⚠️ El repo local tiene `BASE_PATH='/functions/v1/agent_tool_gateway'`, que en Supabase **nunca
  hace match**. No lo copies.
  **Se reusa:** el esqueleto de seguridad (`routePath` anti-traversal, límites de 1 MiB/16 KiB,
  `jsonResponse` con `no-store`+`nosniff`, `secrets.ts`, `crypto.ts` — que **ya tiene HMAC y no se usa**).
- **`kapso_inbound_webhook` v32**: verifica HMAC sobre bytes crudos, exige `payload-version: v2` y
  `x-idempotency-key`. **No acepta batches** (`BATCH_NOT_ENABLED`, ver
  `supabase/functions/_shared/agent/kapso-v2.ts:65`). Es **phone-first duro**: si no hay teléfono
  pero sí BSUID, falla con `IDENTITY_UNSUPPORTED`. **No tiene OpenAI adentro** (la versión A2 no
  está desplegada). Llama `agent_register_inbound_context`, borrada → con
  `AGENT_INBOUND_ENABLED=true` todo inbound da 503.

### 4.6 Advisors

- **7 tablas con RLS activo y CERO políticas**: `command_log`, `jobs`, `whatsapp_links`,
  `whatsapp_outbox`, `whatsapp_inbound_messages`, `payment_events`, `account_deletion_requests`.
  Es *deny-all* para `anon`/`authenticated` (deseable), pero significa que **el agente vive entero
  en tablas sin política**: si el gateway falla, nada lo salva.
- `postgres` y `service_role` tienen **BYPASSRLS**, así que "rol dueño dedicado" no compra nada por
  sí solo.
- 4 funciones con `search_path` mutable en el esquema `private`: `wa_fecha`, `wa_hora`,
  `wa_modalidad`, `wa_payload_ok` — **son justo las que arman los textos de WhatsApp**. Conviene fijarles `search_path`.
- 15 FKs sin índice de cobertura; irrelevante con 79 citas, no a escala.

### 4.7 El punto de encuentro con la app Flutter

La app **ya sabe pintar** los tipos de notificación que el agente produciría:
`appointment_created_by_patient`, `appointment_confirmed`, `appointment_cancelled_by_patient`,
`appointment_rescheduled_by_patient`, `modality_changed_by_patient`, `payment_proof_received`.
Cada uno exige claves literales en el payload; si falta una pieza **no falla: degrada al aviso
neutro "Nueva notificación"** — falla silenciosa a escala.

**`notifications` es el único canal con Realtime** (`subscribeToNotificationInserts`): es la única
vía por la que la app se entera sola de que el agente hizo algo.

Supuestos de la app que un agente externo rompe:
- `payment_view` es server-owned y **exhaustivo**: un valor desconocido en `badge`, `proof_state`,
  `action_mode` o `resolution_mode` cae a `PaymentViewDto.review()` y **la cita queda sin ninguna
  acción económica**.
- Concurrencia optimista: `edit_appointment`, `reschedule_appointment`, etc. mandan
  `p_expected_updated_at`. Si el agente escribe en medio, la profesional recibe `STATE_CONFLICT`.
- La app cachea `command_id` **UUIDv4** por fingerprint con candado en memoria del teléfono; el
  agente usaría **UUIDv5** derivado de WAMID sobre el **mismo** `command_log`.
- Enums cerrados: un valor nuevo lanza `FormatException` y **tumba toda la lista**, no sólo la fila.
- Fuera de `notifications` no hay Realtime: una cita agendada por WhatsApp **no aparece sola** en un
  dashboard abierto.

---

## 5. Hechos verificados contra documentación externa

Verificados por búsqueda web (los dominios estaban bloqueados). **Reconfírmalos leyendo la fuente.**

- **`gpt-5.6-luna` existe.** OpenAI lo lanzó el **2026-07-09**. Familia GPT-5.6: **Sol** (flagship),
  **Terra** (intermedio), **Luna** (nano — el más barato y rápido). ~1M de contexto. Pensado para
  clasificación, ruteo, resumen y alto volumen sensible a costo. Precio original $1/M input,
  $6/M output; luego bajó ~80%.
- **Kapso Agent Node**: `complete_task` y `enter_waiting` **son tools por defecto reales**.
  `enter_waiting` es obligatoria por defecto en workflows creados después del **2026-02-05**.
- **Kapso message batching**: ventana configurable **1–60 s, default 5 s**, acumula hasta que pasen
  N segundos sin mensaje nuevo. El diseño usa 5 s = el default.
- **BSUID** (business-scoped user IDs) de Meta y **Request Contact Info** son reales. Formato BSUID:
  código ISO 3166 alpha-2 + punto + hasta 128 alfanuméricos (ej. `US.13491208655302741918`).
  Único por *business portfolio*.
- `send_notification_to_user` y el modo de salida directa interna (`tool_only`) quedaron verificados
  **empíricamente** en el E2E de A1, no en la doc oficial.

---

## 6. Los 10 hallazgos BLOQUEANTES

Todos con evidencia citable, sobrevivieron verificación adversarial de dos lentes.

### B1. El canal saliente está roto: sólo 2 de 19 pacientes pueden recibir un WhatsApp hoy
24 de 31 mensajes de `whatsapp_outbox` fallaron con `131026 | Message undeliverable`. De 19
teléfonos, 7 con intento y **2 con entrega real**. El cron de 26 h y el recordatorio de 1 h **se
están perdiendo hoy** (5 de 5 confirmaciones de prepago fallaron, 5 de 6 recordatorios).
**Consecuencia:** se invertirían 10-15 semanas en un agente cuyo trigger nunca se dispara — una
paciente no puede contestar un mensaje que no recibió.
**Recomendación:** antes de escribir una línea de RPC, sanear los teléfonos, verificar si el número
remitente está en modo prueba con lista blanca, y volver a medir. Criterio de salida: ≥90 %
`delivered|read` sobre una semana. Es trabajo de días y arregla el producto que **ya existe**.

### B2. El candado `pending_tool` rompe todo traspaso lista → selección
`07-portero.md:340-344` exige que la operación coincida con `pending_tool` del token sellado cuando
el modelo manda `opcion`/`cita`/`confirmado`. Pero por diseño la lista la escribe `buscar_horarios`
y el número lo consume `agendar`/`reprogramar` (`02-funciones.md:1039-1041`).
**Implementado literal, las cuatro rutas que mutan la agenda quedan en bucle de "vuelve a preguntar"
y el agente no puede agendar ni mover una sola cita.**
**Recomendación:** reescribir el candado en términos de `pending_step` + `allowed_next_tools`
explícito, y definir la tabla productor→consumidores antes de escribir una línea del gateway.

### B3. `buscar_horarios` no tiene desenlace para "faltan filtros"
La tabla de resultados (`02-funciones.md:295-307`) tiene 10 filas y ninguna para "escogió servicio
pero no dijo día"; el doc asigna ese caso a `fuera_del_horizonte`, cuyo texto ("Hasta esa fecha
todavía no alcanzo a ver la agenda") es un disparate ahí. Ariadna contesta "la 1", que es como se
escribe por WhatsApp, y **el flujo más común del producto se atora en el segundo turno**.
4 de 6 profesionales tienen 2+ servicios activos, así que la lista es la norma.
**Recomendación:** añadir `horarios_falta_filtros`, o mejor devolver directamente las primeras cinco
horas del horizonte, que es lo que haría una recepcionista.

### B4. El copiado literal es la única función crítica en manos del modelo, y no se verifica en producción
Toda la garantía de que la paciente lea el precio, la fecha y el monto correctos descansa en **una
línea de prompt** (regla 7) ejecutada por el **tier nano**. Ningún componente de runtime compara lo
que la RPC compuso con lo que el modelo envió. No hay dónde detectarlo después: las lecturas no
llevan `command_id`, no hay bitácora de conversación, y el hilo no pasa por `whatsapp_outbox`.
**Recomendación (la más importante del informe):** **sacar el envío del modelo, no subir de tier.**
Los diez adaptadores ya comparten implementación (`08:317-320`): que sea el **adaptador** quien
entregue `result.texto` a WhatsApp y devuelva al modelo sólo `{espera, hecho, cierra}`. Con eso la
paráfrasis se vuelve imposible por construcción, desaparecen la regla 7 y medio
`<resultado_de_herramienta>`, el texto deja de pagarse dos veces por turno, y `gpt-5.6-luna` queda
haciendo sólo aquello para lo que fue lanzado: ruteo. **Si Kapso obliga a que el envío salga del
Agent Node, entonces el adaptador debe devolver un hash corto y el workflow rechazar el
`send_notification_to_user` cuyo `message` no lo reproduzca.**
👉 *Esto depende de una pregunta de documentación de Kapso: ver §9.*

### B5. `/identity` con secreto de workflow es una llave maestra multi-tenant
Quien tenga el secreto puede pedir un `identity_token` para **cualquier** teléfono o BSUID, porque
la identidad que `/identity` resuelve la **afirma el llamador** y nada prueba que ese mensaje
entrante existió. El secreto vive en la plataforma de un tercero (dashboard de Kapso, editable por
cualquiera con acceso, visible en exports/backups/logs). Basta para enumerar las citas de las 22
pacientes, cancelar o reprogramar las 80 citas, y pegar comprobantes falsos. No hay `auth.uid()`,
no hay RLS efectiva debajo, y en `command_log` todo aparece como `actor='patient'` legítimo.
**Recomendación:** que `/identity` **no acuñe token a partir de una identidad afirmada**: exigir
atestación del mensaje entrante. Lo más barato es dejar `kapso_inbound_webhook` (que **ya valida
HMAC**) como escritor-sólo-de-atestación, y que `/identity` sólo emita token para un
`(conversación, WAMID)` atestado en los últimos N minutos. Alternativa: re-consultar el mensaje en
`api.kapso.ai/platform/v1` con una API key que sólo vive en Supabase. Además: **secretos distintos
por ruta**, rotación, y HMAC real (el código ya existe en `_shared/agent/crypto.ts`, sólo no se usa).

### B6 y B7. La precondición que habilita TODAS las mutaciones se prueba en el último paso — y ya salió "parcial" una vez
El `command_id` se deriva de los WAMID del batch. El propio doc admite (`07:370-373`) que si Kapso
no entrega un conjunto estable durante un reintento, **las mutaciones no se habilitan**. Esa prueba
**ya se intentó en A1 y quedó registrada como "parcial"** (`git show 16e0606:docs/KAPSO_INVENTORY.md`
línea 19). El plan la agenda en la **fila 9 de 9**, después de escribir ~5.000-7.000 líneas de PL/pgSQL.
Además: el webhook desplegado rechaza lotes y sólo lee un `message.id` singular — **nunca se ha
visto un conjunto**. Y con `enter_waiting`, cuando la paciente responde "sí", el batch es **otro**,
con otros WAMID, luego otro `command_id`: hay que verificar que el diseño funciona a través de una espera.
**Recomendación:** mover esa prueba a la **fila 0**. Un workflow desechable con una sola Function Tool
que devuelva los WAMID que ve, forzando timeout y reintento, y con un segundo mensaje llegando
durante la ejecución. Un día de trabajo. Si no es estable, cambiar la derivación a un identificador
único estable (`execution_id` + `system.event.message.id`) en vez de un conjunto.
👉 *Pregunta directa para la doc de Kapso: ver §9.*

### B8. El texto de `crisis` lo escribe el modelo de memoria, no lo verifica nadie, y no deja rastro
9 de los 13 textos fijos los compone el modelo copiando del prompt, y entre ellos está **`crisis`** —
el único mensaje del producto donde equivocarse no es un problema de agenda. No llama herramienta,
no toca Supabase, no notifica a la profesional, no se guarda y **no está en el plan de pruebas**.
Dos fallas silenciosas: (1) el nano parafrasea o trunca el número de emergencia (911 / Línea de la
Vida 800 911 2000) sin que nada lo detecte; (2) una paciente escribe *"ya no le veo sentido a nada,
cancélame el jueves"* → el agente manda la línea de ayuda, llama `complete_task`, y **la psicóloga
nunca se entera**.
**Recomendación:** convertir `crisis` en herramienta de dominio número once, que devuelva el texto
desde el servidor y escriba una notificación a la profesional en la misma transacción. Media jornada,
y es la diferencia entre un bug de agenda y un incidente clínico.

### B9. Ningún desenlace del agente queda registrado en Supabase salvo las siete mutaciones
Las tres lecturas no escriben nada (`07:357`), los seis desenlaces de identidad ni pasan por el
modelo (`05:203-209`), y `last_inbound_at` está prohibido en `needs_contact` e `identity_conflict`
(`09:132-136`). Una paciente recibe `no_te_reconocemos`, cuelga, y **no queda ni una fila**. Gael se
entera semanas después y no puede reconstruir nada: el único rastro está en los logs de un tercero.
**Recomendación:** el gateway es el único componente propio que ve **todos** los turnos. Que escriba
una fila append-only por llamada (id de correlación, estado de identidad, operación, `hecho`,
latencia, `sha256(texto)`) reusando `whatsapp_inbound_messages`, que ya tiene esas columnas y hoy
tiene 10 filas muertas. **Cero DDL**, y no viola "no crear memoria propia" porque el agente nunca lo lee.

### B10. La reconciliación perezosa se apoya en un ancla vacía en 19 de 19 filas
El orden de resolución depende de `kapso_contact_id` para reconciliar un BSUID rotado, pero
**ninguna función desplegada escribe** esa columna, ni `business_scoped_user_id`, ni
`business_portfolio_id`. Si Meta corta a BSUID-only antes de que exista una conversación que ligue
teléfono+BSUID, **el 100 % de la base cae en `needs_contact`** — una integración que el equipo nunca
ha ejercido y cuyo fallo devuelve `not_patient`. La reversa documentada es atención manual.
**Recomendación:** antes del agente, una fase de ligado perezoso que no depende del Agent Node: que
el parser de inbound y `kapso_status_callback` **ya desplegados** persistan esas tres columnas cuando
lleguen junto al teléfono, y medir la cobertura. Sólo cuando sea alta tiene sentido construir
`needs_contact`.

---

## 7. Los altos y medios más relevantes (38 + 18)

**Conversación / UX**
- Agendar cuesta **8 mensajes** (4 de ella, 4 del agente) aunque el primer mensaje ya traiga
  servicio, día y hora. Peor caso realista: 6 mensajes de ella, 12 turnos, 5-6 llamadas de dominio.
- `mis_citas_lista` numera opciones, **cierra** (`cierra: true`) y borra el estado sellado: el
  "la 2" que ella conteste cae en `no_entendi`. **Callejón sin salida por construcción.**
- `pendiente_lo_otro` = *"¿Y en qué más te puedo ayudar?"* — no nombra ni acusa la petición que
  quedó sin atender.
- `crisis` cierra la ejecución y **se traga la petición operativa** del mismo mensaje.
- No hay clave para *"te entendí, pero eso no lo hago yo"* distinta de *"no te entendí"*. Preguntas
  perfectamente claras ("¿puedo llegar 10 minutos tarde?", "¿ella atiende adolescentes?") reciben
  "no te entendí". **Es el fallo más visible del diseño: la negativa se lee como incomprensión.**
- Dos `no_entendi` seguidos son idénticos palabra por palabra.
- El prompt **no da precedencia** entre `ver_servicios` y `buscar_horarios`, y el mensaje típico de
  apertura dispara los dos.

**Estado y concurrencia**
- **A3 no eliminó la máquina de estados propia: la mudó de tabla a token.** Sigue habiendo tres
  dueños del estado (ejecución de Kapso, token en `vars.agent_state`, `command_log`), y el candado
  `pending_tool` **ya es su propio `TURN_BUSY`** (ver B2).
- `agent_state` no está ligado al vínculo ni a la ejecución; el `identity_token` sí. Dos mensajes
  casi simultáneos pueden **cruzar las listas numeradas**.
- El `identity_token` se ancla a `whatsapp_links.updated_at`, **la misma fila que el agente escribe
  en cada turno** → ancla autodestructiva o inerte según cómo se escriba el UPDATE.
- El `request_hash` lo deriva el gateway y la RPC sólo lo compara: **la guardia se compara consigo
  misma**. Y el orden de los pasos hace que "commiteó y se perdió la respuesta" con otra operación
  nunca llegue a leer el resultado guardado.
- No hay texto para ningún fallo del portero: el modelo recibe algo que no puede mandar.

**Costo, latencia y modelo**
- Costo del modelo **irrelevante**: ~$0.009 USD por gestión de agendado; 1000 pacientes/mes ≈ $20 USD
  (~$0.30-0.60 por profesional al mes). **No es el eje que importa.**
- Latencia: **8.5-16 s por turno**, 35-70 s por gestión completa. Postgres es el **1 %**.
- Los 5 s de batching se cobran el 100 % de las veces y, en los mensajes reales que existen en la
  base, **no habrían agrupado ni un par**.
- **99.8 % de las Edge Functions arrancan en frío** (1495 arranques / 1498 invocaciones) y A3 llama
  al gateway **dos veces por turno**.
- El prefijo cacheable (~4000 tokens) **se destruye** al interpolar `{profesional}`, `{paciente}` y
  `{verbos}` dentro del system prompt.
- `reasoning` y `max_tokens` **no están en ninguna tabla de config de A3**; clonar el Agent Node de
  A1 arrastra `medium` y 2048. `max_iterations 16` permite encadenar hasta cinco herramientas de
  dominio: **cinco veces el techo del propio diseño**.
- A3 tiene **menos frenos que A1 y que A2**, y el único interruptor es apagar el número entero.
  Sin lista blanca, sin piloto por profesional, sin canario.

**Base de datos**
- Las 10 RPC **no pueden reusar nada**: 67 de 100 funciones arrancan en `current_professional_id()`.
  Y el repo **ya duplicó lógica dos veces y las copias ya divergieron**.
- La capa de presentación en PL/pgSQL convierte **cada coma en una migración a producción**, sin
  staging. 86 textos dentro de funciones de 400-1200 líneas.
- `get_internal_availability` **es inservible** para el agente: llama `current_professional_id()` y
  además pasa `p_restrict_to_configured_schedule => false` y `p_apply_patient_lead => false`.
  Pero **`_get_internal_availability_core` sí sirve**, llamada directa con `p_professional_id`
  explícito y ambos flags en `true`. **No hay que reescribir el motor**, hay que escribir un
  envolvente con pasada barata propia. (Corrección al doc: el tope de "seis primeras horas" **no**
  está en el núcleo — el defecto vive en la lectura de la app, no en la base.)
- Normalizar HEIC y PDF dentro de la Edge Function choca con los límites de Supabase Edge, y **no
  existe ningún límite de tasa en todo el diseño**.
- Las **56 pruebas** de la sección 10 no son ejecutables: no hay staging, no hay pgTAP, hay un solo
  número de WhatsApp, y 14 piden datos que no existen.

**Identidad**
- Sólo **3 de los 6 estados** son alcanzables hoy: `identified`, `inactive_patient`, `not_patient`.
  `needs_contact` e `identity_conflict` son inalcanzables por construcción. `needs_professional`
  es **cero hoy** (0 teléfonos con 2+ profesionales) pero estructuralmente inevitable mañana:
  **conviene el estado en el resolver, no el flujo todavía**.
- `identity_conflict` **no es decidible** con el esquema actual: no existe ninguna entidad que
  represente a una persona a través de profesionales.
- La equivalencia "paciente ⇒ link" que sostiene `not_patient` **ya es falsa**: hay tres pacientes
  activos sin link.
- El paso 2 del plan (limpiar identidad al cambiar `patients.phone`) es **un no-op hoy** (borra
  columnas que ya son NULL en 19 de 19) y su pseudocódigo **anula `last_inbound_at`, que es una
  dependencia viva de `assign_resources_to_appointment`**.
- **Punto ciego:** existe `consent_status` (`pending|signed`) y **4 links activos están en `pending`**.
  El documento no lo usa. Un bot que da información de agenda a alguien sin consentimiento firmado
  es un tercer estado que conviene decidir.

**Alcance**
- `dejar_resena` escribe en un cajón que **nadie puede abrir**: no hay moderación ni quien pida la reseña.
- `mandar_comprobante` **NO es posponible** y está mal clasificada junto a `dejar_resena`: 78 de 80
  citas reales pertenecen a profesionales con `charge_timing='before'`, y con prepago el "sí voy"
  **no confirma** — devuelve `comprobante_pedido`. Es la única salida del flujo real.
- Las ramas caras de dinero **son inalcanzables con la configuración real**: las dos únicas
  profesionales con citas tienen `free_change_notice_minutes = 0` (editado deliberadamente el 31-ago
  y el 1-sep). Con aviso en cero **no existe el "cambio tardío"**.
- Camino corto: **3 herramientas en ~3 semanas contra 10 en 10-15**, y hoy no hay nada que mida cuál
  se usa.

**Coherencia documental** (13 contradicciones verificadas, las peores)
- `identity_conflict`: `05:208`, `07:30`, `07:82` y `08:354` mandan `fuera_de_alcance`; `09:59-66`
  dice explícitamente que **no** debe reusarse. **Tres archivos dueños contra el anexo.**
- `README:55` dice "Los doce archivos"; `AGENTS.md:3,8` dice "once y ninguno más" y `AGENTS.md:28`
  **prohíbe un duodécimo archivo**. `09` viola el archivo que gobierna el repo.
- Regla 13: `00:112-113` dice que ninguna mutación termina sin aviso; `02:914` dice
  "Aviso: ninguno, y es deliberado" — y `02:870` afirma "la regla 13 no tiene excepciones"
  **44 líneas antes de excepcionarla**.
- `06:14-15` dice "ya no hay ningún reloj fijo"; `03:27-29` dice "la única constante son las 26 horas".
- Cuándo se abre la decisión de cobro: `03:33-36` vs `03:475-477`, **contradicción dentro del mismo archivo**.
- `02:87-89` declara **tres** salidas abiertas; son **siete**.
- `06:814-815` promete "sólo se muestran tus iniciales" (plural) pero sólo se copia `first_name`.
- **"Relación activa" nunca se define contra una columna** en los doce archivos, y es el predicado
  que decide tres de los seis estados y el cerrojo de las diez RPC.
- Sin valores: TTL del `identity_token` y de `agent_state`, ventana del HMAC, **dónde se guarda el
  nonce** (se pide anti-replay sin almacén), límite de iteraciones.
- **El anexo `09` sin reconciliar es riesgo serio de proceso:** `README:47` sólo pide "revisar", así
  que el modo de fallo probable es implementar la versión vieja en silencio. Toca 8 de los 10
  documentos; **25-35 ediciones puntuales, media jornada.**

---

## 8. Las 10 FORTALEZAS — lo que NO se debe tocar al simplificar

1. **El paradigma central es correcto.** El modelo queda reducido a emparejar palabras contra listas
   que escribió el servidor: sin identidad, sin UUID, sin cálculo, sin poder de autorización.
   Superficie total: **~20 parámetros, casi todos enteros pequeños**. Es la decisión de diseño más
   fuerte del documento.
2. **A3 elimina por construcción el fallo que mató el E2E de A1** (dos máquinas de estado), y deja
   el grueso del trabajo fuera de Kapso.
3. **La inyección de prompt está contenida por construcción, no por la regla dura 9.** El modelo no
   puede nombrar a quién afecta, así que una inyección exitosa sólo daña a quien la escribe.
4. **La base ya tiene la red que el diseño necesita**: el `EXCLUDE USING gist` y el
   `pg_advisory_xact_lock` existen y están probados por las RPC de la profesional.
5. **El esquema fue construido esperando un actor paciente**: `actor_type` y `appointment_origin` ya
   tienen `patient`; `late_change_decision` ya existe y `waive_appointment_payment` /
   `credit_appointment_payment` ya son su consumidor. **Falta el productor, que es el agente.**
6. **El modelo económico completo es implementable sin DDL.** Ninguna columna falta.
7. **El techo de costo por mensaje es una constante impuesta por el servidor**, no por el prompt.
8. **El índice único de BSUID por profesional está desplegado** y su alcance (por profesional, no
   por portafolio) es la decisión correcta.
9. **El reparto modelo/servidor produce conversación natural donde importa**: los parámetros copian
   las palabras que ella dijo (`relativo`, `parte_del_dia`) sin convertir, y los cinco motivos de
   sin-hueco están resueltos mejor que en casi cualquier bot de agenda.
10. **La arquitectura ya es incremental**: los diez adaptadores comparten implementación, el costo
    marginal de la herramienta N+1 es una RPC más unas líneas. **Nada técnico obliga a construir las
    diez.** El plan de trabajo es lo que no es incremental, no la arquitectura.

---

## 9. Lo que NO se pudo verificar — tu trabajo principal

Estas preguntas requieren leer documentación oficial. Varias **cambian el veredicto**.

### Sobre Kapso (`docs.kapso.ai`) — las críticas

1. **¿Existe `message_delivery_mode` y el valor `tool_only`?** ¿Cuáles son todos los valores? Es la
   base del diseño y sólo está verificado empíricamente.
2. **🔑 ¿Puede una Function Tool de Kapso enviar el mensaje de WhatsApp directamente, sin pasar por
   `send_notification_to_user` del Agent Node?** De esto depende **B4**, la recomendación más
   importante del informe. Si sí, la paráfrasis del modelo se vuelve imposible por construcción.
3. **🔑 ¿Kapso garantiza WAMID estables en un reintento de Function Tool?** ¿Qué identificador es
   estable: `system.event.message.id`, un `tool_invocation_id`, el `execution_id`? De esto depende
   **B6/B7** y con ello **si las siete mutaciones se pueden construir**.
4. **¿Qué contiene exactamente `execution_context`, `whatsapp_context`, `flow_info`, `flow_events`?**
   ¿Se inyectan automáticamente en cada Function Tool? ¿Los WAMID vienen en `whatsapp_context`?
5. **¿Cómo funcionan `vars` entre `enter_waiting` y el resume?** ¿Persisten? ¿Aparecen en logs de
   Kapso? (De esto depende si es seguro poner un token cifrado ahí.)
6. **¿`enter_waiting` tiene timeout?** ¿Qué pasa si la paciente nunca contesta? ¿La ejecución queda
   colgada, cuesta dinero, se limpia sola?
7. **¿Se puede limitar `max_iterations` por Agent Node y cuál es el default?**
8. **¿Kapso tiene rate limiting propio por conversación o por contacto?** (El diseño no tiene ninguno.)
9. **¿Qué modelos ofrece el Agent Node?** ¿Está `gpt-5.6-terra`? ¿Se puede cambiar sin rehacer el workflow?
10. **¿Kapso soporta lista blanca de números / entorno de staging?** (De esto depende el canario de despliegue.)
11. **¿Cómo se comporta el batching de 5 s con medios?** ¿Foto + texto llegan en el mismo batch?

### Sobre Meta / WhatsApp (`developers.facebook.com`, `business.whatsapp.com`)

12. **¿Qué cambia el 1 de octubre de 2026 en el precio de los mensajes de servicio?** El doc dice que
    Meta aún describe el régimen gratuito dentro de la ventana de 24 h y que Kapso anuncia un cambio.
    **Verifícalo:** si los mensajes de servicio pasan a costar, la regla de "una respuesta visible por
    batch" cambia de optimización a requisito, y el cálculo de costo del §7 se altera.
13. **¿Cuál es el calendario real de la migración BSUID?** ¿Hay fecha de corte a BSUID-only? De esto
    depende la urgencia de **B10**.
14. **Error `131026`**: ¿cuáles son sus causas documentadas? Es la clave de **B1**.

### Sobre OpenAI

15. **¿Qué dice OpenAI sobre `gpt-5.6-luna` para seguimiento estricto de instrucciones y copiado
    literal?** ¿Hay benchmark de instruction-following por tier? Precio actual de luna vs terra.

### Sobre Supabase

16. **Límites reales de Edge Functions** (memoria, CPU time, tamaño de respuesta) para decidir si
    normalizar HEIC/PDF adentro es viable.
17. **¿Hay forma de mantener isolates calientes?** (99.8 % de arranques en frío.)

---

## 10. El plan para esta sesión

### Fase 0 — Confirmar el terreno (30 min)
1. Verifica que puedes abrir los dominios de §1. Si no, dilo y detente.
2. **Re-verifica B1 con SQL** contra `ssyzfeadyrczlzjbvxyl`:
   ```sql
   select status, provider_status, left(last_error,60), template_key, count(*)
   from public.whatsapp_outbox group by 1,2,3,4 order by 5 desc;
   ```
   y la cobertura de entrega sobre los 19 teléfonos de `whatsapp_links`.
   **Si B1 se confirma, es el hallazgo número uno y cambia el orden de todo el plan.**

### Fase 1 — Resolver las preguntas abiertas (el grueso)
Contesta las 17 preguntas de §9 leyendo la fuente oficial. Para cada una: respuesta, cita con URL, y
**qué hallazgo de §6 confirma, refuta o modifica**. Las marcadas 🔑 son las que pueden cambiar el
veredicto: priorízalas.

### Fase 2 — Cerrar el veredicto
Con esas respuestas, contesta las seis preguntas de Gael, comprometiéndote:
1. ¿A3 es la más adecuada? Sí / sí con condiciones / no.
2. ¿Este *tipo* de agente es el correcto para su workflow y sus conversaciones?
3. ¿Es eficiente? (costo, latencia, esfuerzo de construcción, capacidad de iterar)
4. ¿Qué cambiarías antes de escribir la primera línea? Máximo cinco, ordenados por impacto.
5. ¿Cuál es el camino más corto a producción con pacientes reales?
6. ¿Qué decisiones sólo puede tomar Gael?

### Fase 3 — La delimitación final
Entrega, como documento:
- El alcance del MVP: **qué herramientas se construyen y en qué orden**. Ten presente que
  `mandar_comprobante` no es posponible (78 de 80 citas son prepago) y que `dejar_resena` sí lo es
  (no hay moderación). Considera el camino corto de 3 herramientas en ~3 semanas.
- La secuencia de fases con **entregable y criterio de éxito medible** por fase.
- La lista de bloqueantes que deben cerrarse antes de escribir código.
- Las decisiones que necesitan aprobación de Gael, como **preguntas cerradas con recomendación**.
- Las ~30 ediciones de reconciliación del anexo `09` con los documentos dueños.

### Entregable
Un artifact HTML publicado (o el formato que Gael prefiera) con el veredicto, los grafos y el plan.
Los grafos ya validados en la sesión anterior: (a) el sistema hoy, (b) el recorrido de un mensaje en
A3, (c) la evolución A1→A2→A3, (d) la frontera de confianza.

---

## 11. Cómo trabajar

- **No repitas la auditoría.** Este documento la contiene. Tu valor añadido es la documentación
  oficial y el cierre.
- Sesión anterior: `https://claude.ai/code/session_013SodKQh5S2cut8GEt2f3Ku`
- La rama de trabajo es `claude/audit-ai-agent-implementation-jv5fkj` en ambos repos.
- Todo lo que afirmes debe tener evidencia: archivo:línea, consulta SQL, o URL de doc oficial.
  Si no puedes verificar algo, **dilo**; no lo estimes.
- Gael pidió respuestas en español, directas, con riesgos y trade-offs, y separando claramente lo que
  necesita su aprobación.
