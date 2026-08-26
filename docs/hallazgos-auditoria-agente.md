# Hallazgos verificados — auditoría del agente de IA

Corte: 2026-08-25. Todo lo de aquí está verificado contra los sistemas desplegados
(Supabase `ssyzfeadyrczlzjbvxyl`, proyecto Kapso «Agenda Psi») o contra documentación
externa con fuente citable. **La documentación del repositorio NO es fuente**: ha
resultado obsoleta repetidamente.

Este documento es el substrato del diseño corregido. Quien escriba el diseño final
debe darlo por cierto y no re-derivarlo; si necesita un detalle que no está aquí,
lo consulta contra la base, no contra los documentos de `referencias/`.

---

## 0. ESTADO ACTUAL EN UNA PÁGINA

**Kapso.** Un workflow **activo**, 3 nodos, 2 aristas: Start (disparador por API) →
Agent Node → Function Node (`agenda-psi-complete-inbound`). Modelo `gpt-5.6-luna`,
temperatura 0, `reasoning_effort: medium`, `max_iterations: 16`, `max_tokens: 2048`,
`message_delivery_mode: tool_only`, `prompt_cache_ttl: 5m`, sandbox apagado.
Herramientas nativas: `send_notification_to_user`, `enter_waiting`, `complete_task`,
`handoff_to_human`. Dos Function Tools: `get_capabilities` y `sync_waiting`.
Cuatro funciones privadas (`cloudflare_worker`, `passthrough`, sin endpoint público):
`agenda-psi-complete-inbound`, `agenda-psi-mark-inbound-waiting`,
`agenda-psi-flow-agendar`, `agenda-psi-flow-reprogramar` — las dos últimas idénticas
a `kapso/functions/*.js` del repositorio. Webhook de entrada con `buffer_enabled: false`,
ventana 5 s, tope 50, `payload_version: v2`. Número de producción conectado, WABA
aprobada, TIER_250.

**Supabase.** Dos funciones de borde del agente desplegadas: `kapso_inbound_webhook`
y `agent_tool_gateway`. El gateway declara **27 rutas** y sólo contesta **3**
(`/tools/capabilities`, `/workflow/waiting`, `/workflow/complete`) más `/health`;
las otras 24 devuelven `403 OPERATION_NOT_ENABLED`. En la base hay **13 funciones
del agente, todas de control**: `agent_register_inbound_context`,
`agent_bind_inbound_execution`, `agent_mark_inbound_waiting`,
`agent_mark_inbound_completing`, `agent_complete_inbound`,
`agent_complete_inbound_from_workflow`, `agent_get_inbound_resume_execution`,
`agent_get_capabilities`, `agent_get_capabilities_from_workflow`, y las cuatro
privadas `agent_claim_tool_call`, `agent_finalize_tool_call`,
`agent_issue_option_handle`, `agent_resolve_option_token`.
**Cero operaciones de dominio desplegadas.**

**El libro mayor.** En toda la historia de producción: 4 sesiones, 6 turnos,
**6 llamadas**, dos operaciones distintas (`get_capabilities` ×3 en ordinal 1,
`complete_inbound` ×3 en ordinal 9), **0 mutaciones**, **0 handles emitidos**.
Última actividad 2026-08-24 21:09 UTC.

**Escala real.** 5 profesionales, 17 pacientes activas (18 en total), 41 citas,
13 servicios activos, 18 vínculos de WhatsApp, 1 comprobante, 0 series de
recurrencia, 0 conexiones de consultorio activas, 0 reseñas.

**Sin desplegar en el árbol de trabajo.** `20260824200000_agent_cerrojos_tanda0.sql`
y seis migraciones `2026082500*_agent_*.sql` con 18 funciones de dominio; 22 rutas
añadidas al gateway; dos formularios de WhatsApp 7.2; un arreglo de la espera que
quedó descartado (repartía trabajo a mensajes que no cuentan para ningún tope).
Última migración aplicada: `20260824043359_agent_workflow_capabilities`.

---

## 1. EL PORTERO — LO MEJOR HECHO DEL SISTEMA

`private.agent_claim_tool_call(p_turn_id, p_execution_id, p_surface, p_operation,
p_tool_call_key, p_input_sha256, p_is_mutation)`. Verificado leyendo el cuerpo.

**26 operaciones en 4 superficies:**

| Superficie | Operaciones | Estado del turno exigido |
|---|---|---|
| `agent_node` — lecturas | `get_capabilities`, `select_relationship`, `list_services`, `get_booking_eligibility`, `list_upcoming_appointments`, `get_next_appointment`, `get_location`, `get_pending_payments`, `get_appointment_payment_status`, `get_professional_share_profile` | `active` |
| `agent_node` — lectura especial | `get_availability` | `active` **o** `waiting_external` |
| `agent_node` — mutaciones | `confirm_appointment`, `cancel_appointment`, `cancel_then_open_booking_flow`, `reschedule_appointment`, `switch_appointment_modality`, `resume_resource_delivery`, `submit_review` | `active` |
| `flow_data_exchange` | `flow_list_services`, `flow_get_eligibility`, `flow_get_availability` (lecturas), `flow_create_appointment` (mutación) | `waiting_external` |
| `media_adapter` | `attach_payment_proof` (mutación) | `active` |
| `workflow_internal` | `open_booking_flow`, `send_fixed_response` (lecturas) | `active` |
| `workflow_internal` — cierre | `complete_inbound` | `completing`, ordinal 9 fijo |

**Cerrojos verificados:**
- Presupuesto: `tool_call_count >= 8` → `TOOL_BUDGET_EXCEEDED`. El ordinal 9 del
  cierre está fuera del presupuesto y nunca lo refresca.
- Una mutación por turno: `committed_mutation_count >= mutation_limit` → `MUTATION_BLOCKED`.
- Sin tenant sólo pasan `get_capabilities`, `select_relationship` y `send_fixed_response`.
- Identidad: exige que sesión y turno coincidan en conversación, teléfono, número
  destino, paciente y profesional; si no, `CONTEXT_MISMATCH`.
- Tenant vivo: exige vínculo de WhatsApp con paciente `active`; si no, `TENANT_NOT_ACTIVE`.
- Réplica exacta: misma clave + misma forma → devuelve el resultado sellado sin recontar.
- Cada mutación recibe un `command_id` nuevo (`gen_random_uuid()`).
- El turno se renueva a `LEAST(sesión.expires_at, now() + 30 min)` en cada claim.

**Los cuatro nudos, con su evidencia:**

1. **`flow_create_appointment` está bloqueada para una gestión limpia.** Es
   `v_is_replacement_create`, y se rechaza con `MUTATION_BLOCKED` si NO se cumple
   `saga_state = 'awaiting_replacement_create' AND mutation_limit = 2 AND
   committed_mutation_count = 1`. O sea: el formulario sólo puede crear una cita
   dentro de la maniobra de cancelar-y-volver-a-agendar. **Agendar normal se rechaza.**
2. **`attach_payment_proof` sólo se autoriza en `media_adapter`**, pero quien decide
   que una imagen es un comprobante es el agente, que vive en `agent_node`.
3. **No existe `flow_reschedule_appointment`.** Mover una cita sólo existe como
   operación conversacional.
4. **La maniobra `cancel_then_open_booking_flow` es la única ruta del sistema por la
   que el dinero de una paciente se evapora**: cancela y crea una cita nueva con un
   pago limpio; el dinero viejo no viaja. Contradice la regla del dueño. Con ella se
   va toda la maquinaria de saga (`saga_state` con cuatro valores, `mutation_limit`
   variable, la reserva del ordinal 8, el guardia `tool_call_count > 3`).

---

## 2. EL DOMINIO QUE YA EXISTE — Y POR QUÉ CASI NADA SE REUTILIZA

Hipótesis evaluada y **rechazada**: «el agente sólo necesita envolturas delgadas
sobre las funciones de la app del profesional».

**Bloqueo 1 — identidad.** Las 15 funciones de dominio del profesional arrancan con
`v_professional_id := public.current_professional_id()`, que es
`select id from public.professionals where auth_user_id = auth.uid()`. El agente
llega por el borde de servicio, sin `auth.uid()`. Resultado: `AUTH_REQUIRED` garantizado.

**Bloqueo 2 — privilegios.** Su ACL es `postgres=X/postgres | authenticated=X/postgres`.
Ninguna está otorgada a `service_role` ni a `agenda_psi_agent_owner`. Y `postgres` es
miembro de `agenda_psi_agent_owner`, no al revés: no hereda nada.

**Bloqueo 3 — semántica de producto opuesta.** `create_appointment` fuerza
`origin='professional'` y `confirmed_at=NULL`; `reschedule_appointment` y
`cancel_appointment` sellan `cancel_reschedule_actor='professional'` y
`change_policy_result = NULL` con el comentario «esta superficie no evalua anticipacion»;
`cancel_appointment` exige que el profesional elija `p_payment_action`
(`PAYMENT_ACTION_REQUIRED` si viene NULL), decisión que la paciente no toma.
Usarlas desde el agente **falsificaría el registro de quién actuó**.

**La única excepción, y es importante:** `public._get_internal_availability_core(
p_professional_id, p_service_id, p_day, p_modality, p_exclude_appointment_id,
p_restrict_to_configured_schedule, p_apply_patient_lead)` recibe al profesional
**como parámetro**, es `SECURITY DEFINER` de `postgres` (que tiene `BYPASSRLS`), y
con los dos interruptores en `true` devuelve exactamente «lo que la paciente puede
ver»: horario configurado por modalidad y día, excepciones del calendario, citas
propias, bloqueos, consultorio del socio conectado (sólo presencial), anticipación
mínima de la paciente, saltos de horario de verano, y encaje de `duration + buffer`
en paso de 15 min. **Lo único que NO mira es `is_patient_scheduling_enabled`.**
Basta un `GRANT EXECUTE` al rol del agente. Es la única envoltura delgada real.

**`private.assert_appointment_slot_available` es `SECURITY INVOKER`**: corre con los
privilegios del llamador y necesita `SELECT` sobre `appointments`, `blocked_slots` y
`professional_connections`. Esos GRANT sólo están en la migración `20260825000000`.

**Otras funciones desplegadas relevantes** (todas del profesional, inalcanzables):
`create_appointment`, `edit_appointment`, `cancel_appointment`, `reschedule_appointment`,
`waive_appointment_payment`, `credit_appointment_payment`,
`request_appointment_payment_proof`, `mark_appointment_attended`,
`mark_appointment_no_show`, `get_services_for_patient`, `list_appointments`,
`get_next_scheduled_appointment`, `get_appointment_detail`, `get_appointment_policies`,
`get_days_with_appointments`, `get_patient_pending_payments`,
`get_payment_proof_signing_receipt`, `assign_resources_to_appointment`,
`request_patient_review`, `get_marketplace_profile`, `search_marketplace_profiles`.

---

## 3. POLÍTICAS Y DATOS REALES

`public.professional_appointment_policies` (PK `professional_id`, todas `NOT NULL`):
`charge_timing` (`before|after`, def. `after`), `patient_min_booking_lead_minutes`
(def. 1440), `free_change_notice_minutes` (def. 1440), `patient_can_switch_to_online`
(def. false), `patient_can_switch_to_in_person` (def. false),
`min_lead_to_change_modality_minutes` (def. 1440).

`public.professionals`: `is_patient_scheduling_enabled` (def. false), `office_address`,
`office_google_place_id`, `office_latitude/longitude`, `fixed_meeting_url`, `timezone`
(def. `America/Mexico_City`).

**Valores reales al 2026-08-25:**

| Profesional | Agenda paciente | Anticip. mínima | Aviso cambio | → En línea | → Presencial | Anticip. modalidad | Cobro | Dirección | Liga |
|---|---|---|---|---|---|---|---|---|---|
| Maricruz tes | sí | 1440 | 1440 | no | no | 1440 | después | — | — |
| Araceli | sí | **2880** | 1440 | sí | sí | 1440 | **antes** | sí | — |
| Miranda | sí | **2880** | **720** | sí | sí | **720** | después | — | sí |
| test | sí | **2880** | 1440 | sí | **no** | 1440 | después | sí | — |
| Test | sí | 1440 | 1440 | no | no | 1440 | después | — | — |

**Consecuencias que mandan sobre cualquier texto:**
- **Tres de cinco piden 48 h de anticipación.** El calendario del formulario arranca
  dos días después para ellas.
- **Miranda tiene 12 h de aviso de cambio y 12 h para modalidad.** Cualquier copy que
  diga «24 horas» le miente a sus pacientes **en la dirección peligrosa**: creen que
  ya es tarde cuando todavía están a tiempo. El plazo sale de la fila, nunca de una
  constante.
- **Dos de cinco prohíben ambos cambios de modalidad; `test` permite → en línea pero
  no → presencial.** La direccionalidad es real.
- **Ninguna tiene dirección y liga a la vez.** Una cita presencial de Miranda no tiene
  a dónde mandar a la paciente: la operación de ubicación debe devolver nulo explícito,
  nunca inventar.
- **Cero conexiones de consultorio activas.** Esa rama del motor de disponibilidad
  nunca se ha ejercido con datos reales.

**El interruptor maestro es un pestillo de una sola dirección.** `is_patient_scheduling_enabled`
vive en la ficha del profesional, **no** en sus políticas. `update_appointment_policies`
recibe seis parámetros y ninguno es ése. Sólo lo escriben `save_weekly_schedules` y
`save_special_schedules`, **siempre a `true`**. `create_professional` lo pone en `false`
al nacer. **Ninguna función desplegada lo apaga.** En la app hay una insignia de sólo
lectura. Consecuencia: al guardar su primer horario válido, sus pacientes pueden
agendarle solas para siempre.

---

## 4. DINERO

### 4.1 Estados

Enums: `payment_status = {not_applicable, pending, credited, waived}`;
`waive_reason = {forgiven, carried_forward}`;
`charge_reason = {session, no_show, cancellation, reschedule}`;
`payment_method = {cash, transfer}`; `charge_timing = {before, after}`;
`late_change_decision = {pending, charge, no_charge}`;
`change_policy_result = {on_time, late}`;
`appointment_status = {scheduled, past_pending, attended, no_show, cancelled, rescheduled}`.

Restricciones clave: **`payments_appointment_id_key UNIQUE (appointment_id)`** — un
pago por cita, siempre, no hay renglones sueltos. `payment_proofs_payment_id_key
UNIQUE (payment_id)` — un comprobante por pago, para siempre.
`chk_payment_not_applicable_amount`, `chk_payment_credited_method`,
`chk_payment_resolved_at`, `chk_payment_waive_reason`,
`chk_payment_proof_requested_transfer` (pedir comprobante obliga `method='transfer'`),
`chk_late_decision_resolution`, `chk_late_decision_resolved_by`.

**Definición operativa de «hay dinero adentro»** — la que debe usar el cerrojo:

```sql
p.status = 'credited'
OR EXISTS (SELECT 1 FROM public.payment_proofs pp WHERE pp.payment_id = p.id)
```

Una petición sellada (`proof_requested_at IS NOT NULL` sin archivo) **no** cuenta.

### 4.2 Dinero muerto verificado

**Caso 1 — cancelar a tiempo con pago acreditado.** La cita queda `cancelled` con
`change_policy_result='on_time'` y el pago queda `credited/session/late_change_decision=NULL`.
Ninguna función del profesional lo cierra: `waive_appointment_payment` exige
`late_change_decision='pending'`; `credit_appointment_payment` exige `pending`, o
`credited` + decisión pendiente; `request_appointment_payment_proof` exige `pending`;
`cancel_appointment`/`reschedule_appointment` exigen `scheduled`;
`mark_appointment_attended`/`_no_show` exigen `past_pending`. Y **desaparece de la
facturación**: `get_billing_day`/`_month` piden que `charge_reason` case con el estado
de la cita, y aquí quedó `'session'` sobre una cita cancelada → `earns = false` → no
aparece ni como acreditado ni como pendiente. `get_appointment_detail` lo pinta como
`resolution_mode='resolved'`, `badge='paid'`, `action_mode='none'`: «Pagado» sin un
solo botón.

**Caso 2 — cancelar a tiempo con comprobante recibido.** Cae en la rama
`on_time + pending` → `waived/forgiven`. El traspaso ocurrió de verdad; el registro
dice «no se cobró». Y contradice la regla de que un comprobante queda pendiente de
revisión: el agente acaba de resolverlo.

**Ambos desaparecen si se aplica el cerrojo del dueño** (una cita con dinero adentro
no se cancela). Cero funciones nuevas.

**Caso 3 — la petición de comprobante se evapora al reprogramar.** `reschedule_appointment`
copia `proof_requested_at` sólo `WHEN v_old_has_proof`; una petición sin archivo se
pierde, y `tg_payments_apagar_cobro` cancela el aviso en cola. Nadie vuelve a pedirlo.

### 4.3 El cargo por cambio tardío

**Cancelar tarde: sí se puede.** El agente sella `late_change_decision='pending'` y la
app del profesional cierra con `waive_appointment_payment` (→ `no_charge`),
`credit_appointment_payment` (→ `charge`) o `request_appointment_payment_proof`
(→ `charge`). Circuito completo.

**Reprogramar tarde: estructuralmente imposible.** Con traslado, el pago viejo queda
`waived/carried_forward`, estado fuera de los tres resolutores; y el pago nuevo vive
en una cita `scheduled`, mientras `waive`/`request_proof` exigen `cancelled|rescheduled`.
Lo único que existe para cobrar un cambio tardío es `reschedule_appointment(p_mode='charge_old')`,
que cobra **la sesión vieja completa** más la nueva — dos sesiones, no una comisión —
y sólo se puede decidir en el mismo acto de reprogramar.

**Nadie desplegado abre una decisión tardía.** Las ocho funciones que mencionan
`late_change_decision` la leen o la resuelven; ninguna la pone en `'pending'`.
`cancel_appointment` y `reschedule_appointment` escriben `change_policy_result = NULL`
explícito. **La superficie de la paciente es la única que puede abrirla.**

**Decisión de producto pendiente:** «el dinero siempre viaja al reprogramar» y «el
profesional decide si te cobra por avisar tarde» son incompatibles en el esquema
actual. O mover es siempre gratis, o hace falta un renglón nuevo.

### 4.4 Prepago — tres huecos y una bomba de tiempo

1. **Nadie pide el comprobante al agendar.** `create_appointment` comenta
   explícitamente «NO se crea payment_proofs … ni jobs de comprobante». El código
   escrito del agente tampoco sella nada. La petición sólo aparece **26 h antes de la
   cita**, cuando `cron_appointment_confirmation_26h` sella `proof_requested_at=now(),
   method='transfer'` y manda `appointment_confirmation_prepay`.
2. **La cita de prepago nacería confirmada, y eso mata el aviso.** El código escrito
   hace `v_born_confirmed := v_starts_at <= v_now + interval '48 hours'` sin mirar
   `charge_timing`. Y el cron filtra `AND a.confirmed_at IS NULL`: una cita de prepago
   nacida confirmada **es saltada para siempre** → nadie le pide el comprobante nunca.
3. **No existe la autocancelación de 24 h.** `cron_prepay_proof_request` existe pero es
   un cascarón retirado que sólo levanta un `RAISE WARNING`, y **no está en `cron.job`**.

**La bomba:** hoy se salva por accidente porque Araceli (la única con `charge_timing='before'`)
pide 2880 minutos de anticipación, así que sus citas caen fuera de la ventana de 48 h.
**El día que baje ese margen a 24 h, el prepago deja de pedirse y no da ningún error.**

Los 7 cron activos: `cron_sweep_past_pending`, `cron_confirmation_26h`,
`cron_appointment_reminder_1h`, `purge_command_log`, `purge_whatsapp_outbox`,
`purge_whatsapp_inbound`, `sender_whatsapp`. **Ninguno atiende al agente.**

### 4.5 Trasladar el pago a la próxima cita

No se puede armar con lo que hay. Tres bloqueos: `reschedule_appointment` **siempre**
crea una cita nueva (no acepta destino existente); `UNIQUE(appointment_id)` obliga a
**fusionar** dos pagos, no a insertar otro; y `get_next_scheduled_appointment` es
`authenticated` + `current_professional_id()`. **Cero series activas en producción**,
pero esa función no exige serie: basta una próxima cita del mismo servicio.
Pregunta abierta: qué hacer si el importe que viaja no coincide con el de la cita
destino. Recomendación para la primera versión: permitir el traslado sólo cuando
coinciden.

---

## 5. LA APP DEL PROFESIONAL

### 5.1 Los avisos del agente llegarían en blanco — arreglo barato y bloqueante

La app arma el texto de cada aviso con `patient_first_name` y `appointment_starts_at`;
si falta cualquiera, cae a `('Notificación', 'Tienes una notificación nueva.')`. Las
funciones escritas del agente escriben `surface`, `command_id`, `starts_at`, `modality`,
`old_starts_at`, `old_modality`, `change_policy_result` — **cero de las siete claves
del contrato**, y nunca el nombre de la paciente. Los seis avisos (agendó, confirmó,
canceló, movió, cambió modalidad, mandó comprobante) llegarían vacíos, y el push
también, porque sale del mismo contenido. **Se arregla en las migraciones sin tocar la
app.** El contrato está en `referencias/agenda-psi-database/NOTIFICACIONES.md`.
Además: la función del agente mete el monto en el aviso de comprobante y **el contrato
lo prohíbe expresamente**.

### 5.2 La decisión de cobro que nadie encuentra

Los botones **[Cobrar]** / **[No cobrar]** existen y funcionan (`action_mode` =
`resolve_late_unpaid` / `resolve_late_prepaid` → `credit_appointment_payment` /
`waive_appointment_payment`). El problema es llegar: no aparece en Cobros
(`get_billing_day` excluye deliberadamente las decisiones tardías sin resolver, y el
monto tampoco entra en el total pendiente); no hay punto en el calendario
(`get_days_with_appointments` filtra `status='scheduled'`); la tarjeta cerrada es una
línea muda; y el aviso llega en blanco y se borra a las 24 h. Hay que **tocar la
tarjeta** para que aparezcan. Hoy es inofensivo porque nadie produce esas decisiones.
**El agente es lo que va a empezar a producirlas, y va a producirlas todas.**

### 5.3 Lo demás

- **La cita que agenda la paciente nace sin poderse editar** cuando cae dentro de las
  48 h: nace confirmada y `chk_appointment_confirmed_not_editable` la vuelve no editable.
  El profesional ve «Confirmada», no la reconoce, y el botón Editar desaparece sin
  explicación.
- **No puede distinguir quién agendó.** `origin`, `cancel_reschedule_actor`,
  `confirmation_source` y `change_policy_result` existen en `appointments` y **ninguna
  de las dos funciones que alimentan su agenda las entrega**. Y al reprogramar, la cita
  nueva **hereda el origen de la vieja** (`reschedule_appointment` inserta `v_old.origin`),
  así que cualquier etiqueta futura mentirá en cuanto haya un cambio de por medio.
- **La bandeja de avisos se borra sola cada 24 h** y abrirla marca todo como leído.
- **Las filas de aviso no llevan a ningún lado.**
- **El segundo comprobante desaparece en silencio** (`UNIQUE(payment_id)`), y no hay
  forma de pedir otro ni de borrar el primero desde ninguna pantalla.
- **Concurrencia: el profesional está protegido.** Su app manda `p_expected_updated_at`
  y la base rechaza el guardado si algo cambió. El agente usa candados de fila y la
  restricción de exclusión; el resultado se sostiene en las dos direcciones.
- **Tarjetas cerradas**: la documentación y la app dicen «sólo estado + paciente». El
  dueño decidió que **conservan hora y modalidad**. La documentación está del lado
  equivocado y hay que marcarla como obsoleta.

---

## 6. PERIFERIA

### 6.1 Recursos — el motor de trabajos no existe

`assign_resources_to_appointment` bifurca por la ventana de 24 h
(`whatsapp_links.last_inbound_at`): abierta → lote `queued` + un job
`patient_resource_delivery` por asignación; cerrada → lote `waiting_for_patient`
**sin token** + un job `patient_resource_invite:<batch_id>`.

**Nada en la base desplegada escribe `quick_reply_token_hash`.** El materializador que
debería acuñar el token no existe. Y **no hay ningún consumidor de `public.jobs`**:
`claim_jobs_batch`/`dispatch_jobs` sólo existen en `referencias/database_pseudocodigo/`,
no en `pg_proc`; ningún cron ni función de borde los invoca. Evidencia dura: el único
lote de producción lleva desde el 25 de agosto en `waiting_for_patient` con hash nulo,
y se acumulan 7 jobs `storage_cleanup_payment_proofs` y 6
`storage_cleanup_professional_resources` pendientes.

**Consecuencia:** la operación de soltar materiales no puede funcionar aunque se
escriba. Y `whatsapp_outbox.send_mode` admite `media`, pero **ninguna función produce
filas `media`**. El trigger `tg_jobs_solo_recursos_bi` **descarta en silencio** todo
`INSERT` en `jobs` cuyo `type` no sea `patient_resource_delivery`,
`storage_cleanup_payment_proofs` o `storage_cleanup_professional_resources` — así que
los `INSERT INTO jobs` de `create_appointment` y `reschedule_appointment` son **código
muerto**.

### 6.2 Reseñas — no existe el concepto de invitación

`public.reviews` no tiene ninguna columna de invitación. Restricciones:
`uq_review_patient_professional UNIQUE (patient_id, professional_id)`,
`chk_review_submission`, `chk_review_publication`, comentario ≤1000.
`request_patient_review(p_patient_id)` existe, está otorgada a `service_role`, exige
paciente activa + vínculo + sin reseña enviada + ≥1 cita `attended`, y **no tiene
llamador ni cron**: es huérfana.

**Ninguna función desplegada escribe `moderation_status`.** RLS en `reviews` tiene una
sola política, de SELECT. **La moderación es manual, fuera de SQL.** Todo lo que capture
el agente queda `pending` e invisible hasta que una persona lo publique a mano.

**Desajuste real:** `agent_get_capabilities` enciende `submit_review` para las 17
pacientes activas, pero la regla de la función (activa + ≥1 atendida + sin reseña)
sólo admite 11. El modelo ofrecería algo que se le va a negar. Se arregla en
`agent_get_capabilities`.

### 6.3 Marketplace — capacidad encendida sin operación

`agent_get_capabilities` enciende `list_marketplace_professionals` cuando
`relationship_state <> 'tenant' OR NOT patient_active`. Detrás **no hay nada**: ninguna
ruta de marketplace en las 27 del gateway, ninguna función `agent_*_marketplace_*`.
Es una capacidad que el modelo ve encendida y no puede ejercer.

`private.marketplace_public_base()` es la autoridad única de visibilidad pública y
exige: perfil `approved`, verificación `approved`, un servicio de marketplace con forma
exacta (individual, en línea, 50 min, 10 de buffer, no gratis, precio > 0), slug
válido, `display_name` sin título académico al inicio, `academic_degree`, ≥1 cédula
aprobada, foto, `about_me`, teléfono E.164. Hoy: 3 perfiles aprobados, los 3 pasan.

**No puede llegar al modelo** de `get_marketplace_profile`: `published_whatsapp_url`
(lleva el teléfono dentro), `photo_url`/`intro_video_url`, `license_numbers`, y
`reviews.items` (texto libre de terceras — superficie de inyección).

### 6.4 Avisos — el agente duplicaría mensajes

**16 plantillas**, sin tabla de catálogo: viven en el código de
`private.wa_payload_ok(text, jsonb)` y las impone `CHECK chk_outbox_variables`. Una
clave desconocida devuelve `-1` variables esperadas y **el INSERT revienta**: añadir un
mensaje nuevo exige migrar esa función.

Sin productor real hoy: `patient_reactivation`, `patient_resource_delivery`,
`patient_review_request`.

**Duplicación confirmada:** el código escrito del agente encola `appointment_cancelled`
y `appointment_rescheduled` al mismo teléfono con el que el agente acaba de conversar.
En la app del profesional ese aviso tiene sentido porque la paciente no estaba presente;
por el agente es eco. **Recomendación: no encolarlo.**

El orden sí está bien resuelto: `appointments_apagar_avisos_au` dispara al cambiar el
estado de la cita, antes de insertar la fila nueva, así que el aviso sobrevive y los
recordatorios pendientes mueren.

**Los tres triggers:**
- `tg_appointments_apagar_avisos` — al salir de `scheduled`, **cancela** confirmación,
  prepago y los tres recordatorios de 1 h. Al borrar la cita, cancela todo lo que la
  referencie.
- `tg_payments_apagar_cobro` — en `pending → credited|waived`: **cancela** las tres
  `request_*_payment_proof`, y **degrada** (sólo mientras siguen `queued`)
  `appointment_cancelled_payment_proof → appointment_cancelled`,
  `appointment_rescheduled_payment_proof → appointment_rescheduled`,
  `appointment_confirmation_prepay → appointment_confirmation_request`.
- `tg_payment_proofs_degradar_prepago_ai` — al insertar un comprobante, degrada
  `appointment_confirmation_prepay → appointment_confirmation_request`.

**La ventana de 24 h se maneja por construcción, no por comprobación:** la cola sólo
produce plantillas, y el agente sólo responde dentro de la sesión abierta. Correcto,
pero no está escrito en ningún lado.

---

## 7. KAPSO — LO QUE LA PLATAFORMA PERMITE Y LO QUE NO

Fuente: corpus de documentación de Kapso (`docs`, `knowledge`) y de Meta (`whatsapp`).

### 7.1 Nodo de agente

Campos: `system_prompt`, `provider_model_id`, `temperature` (def. 0.0),
`max_iterations` (**def. 80**), `max_tokens` (def. 8192), `reasoning_effort`
(`none|minimal|low|medium|high|xhigh|max|null`), `prompt_cache_ttl` (`5m|1h`),
`observer_prompt_mode` (`interactive_chat|analysis_only`), `message_delivery_mode`
(`auto_send_assistant_text|tool_only`), `enabled_default_tools`, `default_tool_configs`,
`flow_agent_function_tools`, `flow_agent_webhooks`, `flow_agent_mcp_servers`,
`flow_agent_knowledge_bases` (no documentado en la página del nodo; permite texto de
conocimiento en línea sin herramienta), `flow_agent_resources`.

**13 herramientas nativas**: `send_notification_to_user`, `send_media`,
`get_execution_metadata`, `get_whatsapp_context`, `contact_conversations`,
`save_variable`, `get_variable`, `get_current_datetime`, `complete_task`,
`handoff_to_human`, `enter_waiting`, `ask_about_file`, `emit_event`.

**`tool_only` es obligatorio, no estilístico.** Si el agente termina un turno con texto
plano, el texto se suprime (evento `agent_assistant_text_suppressed`) y la siguiente
llamada al modelo puede fallar con `This model does not support assistant message
prefill`. Cada turno debe terminar en `send_notification_to_user` seguido de
`enter_waiting` o `complete_task`.

**`handoff_to_human` se queda.** El mecanismo es `agent_default_tools_version` a nivel
de workflow: «Version used to decide which built-in agent tools are **required by
default**». Hay precedente confirmado con `enter_waiting` (requerida por defecto en
workflows creados después del 5 de febrero de 2026). No hay vía documentada para
desactivar una herramienta requerida. Contenerla por prompt.

**`observer_prompt_mode` es inerte para nosotros.** Sólo actúa con `allow_outbound: false`,
que se deriva de triggers de evento. El nuestro arranca por API.

**`prompt_cache_ttl: 1h` se acepta en la API pero el runtime no lo pide al proveedor.**
Nuestro `5m` es lo correcto.

**`temperature: 0` probablemente se ignora.** Los parámetros de sampling se descartan
mientras el pensamiento extendido está activo; hay que mirar `supports_custom_sampling`
en `GET /platform/v1/provider_models`. Dejar de usar «temperatura 0» como explicación
de determinismo.

**Hay un segundo presupuesto:** un *lifetime step budget* por ejecución con loop guard,
distinto y superior a `max_iterations`. Cada reanudación continúa la **misma** ejecución
e incrementa su contador. La cifra no está documentada. Sospechoso número uno si vemos
ejecuciones que mueren tras muchos turnos.

**Riesgo terminal confirmado:** una Function Tool puede completarse con éxito sin que se
persista su `agent_tool_response`; el job global `ResumeStuckFlowExecutionsJob` (cada
minuto, ejecuciones `running` con `last_event_at` > 300 s) reintenta, el proveedor
rechaza un transcript con `tool_use` sin `tool_result`, y la ejecución pasa a `failed`,
que es **terminal e irrecuperable**. No hay defensa por reintento: sólo detección
(buscar `agent_tool_called` sin `agent_tool_response`) y diseñar para que una ejecución
muerta no deje dinero a medio mover.

**No hay id de invocación estable** que Kapso pase a la función. Si necesitamos
idempotencia, la clave la fabricamos nosotros (`flow_info.step_id` + discriminante del
`input`).

### 7.2 Function Tools

Envelope: `{ input, execution_context, flow_info, flow_events, whatsapp_context }`.
«The agent only controls `input`.» `whatsapp_context` **sólo existe si la ejecución
viene de WhatsApp** — en una ejecución arrancada por API no está.

`input_schema` es «JSON Schema-like», `additionalProperties: true`, sin validador de
forma documentado. **Kapso sí valida los argumentos entrantes contra el esquema antes
de invocar**; si fallan, la función no se ejecuta.

Un objeto `vars` de primer nivel en la respuesta actualiza variables del flujo.
Function tools y function actions **sí** mezclan `vars`; los webhook nodes no.

**Timeout: 30 s** para invocaciones de funciones (las webhook tools son 45 s, camino
distinto). Código máximo 1 MB. Errores truncados a 512 caracteres. Plan Free: 5 scripts
de Cloudflare Worker; tenemos 4, y **clonar un WhatsApp Flow que cree un worker de
endpoint también cuenta**.

Firma obligatoria: `async function handler(request, env)`. **No `export default`.**
No hay código compartido entre funciones.

**Modo de fallo documentado del esquema anidado:** el modelo manda JSON stringificado
malformado en `input`, Kapso rechaza por validación, la función nunca corre, y el
modelo **abandona la herramienta** y se va a la nativa con el texto escapado dentro.
Cuanto más anidado el esquema, más probable.

### 7.3 Espera y reanudación

**Kapso no tiene ningún evento de webhook de espera.** La lista de eventos a nivel de
proyecto es cerrada: `whatsapp.phone_number.*`, `whatsapp.account.*`,
`workflow.execution.handoff`, `workflow.execution.failed`, `project.event`. **No existe
`workflow.execution.waiting`.** Por eso `sync_waiting` es necesaria y no hay alternativa
barata: `emit_event` + `project.event` está plan-gated con cuota mensual y tope de 10
eventos por ejecución.

**Contrato de reanudación:** `{ "message": { "kind": "payload", "data": <string|object|array> } }`.
`message.data` es **obligatorio**; sin él, `400`. `message` y `variables` van en la raíz,
**no bajo `workflow_execution`**. Acepta objetos: el objeto crudo de WhatsApp es válido
**dentro** de `message.data`. Sólo funciona en estado `waiting` (si no, `422`); un solo
resume pendiente a la vez (el segundo da `409`); responde `200` pero el trabajo es de
fondo.

**Lo que entra por resume llega envuelto en `<external_input>`** y el prompt de sistema
de Kapso le dice al agente que viene de equipos internos o sistemas externos, **no del
usuario de WhatsApp**. Si nuestro prompt asume que todo input es de la paciente, el
agente cambiará de tono en el turno que más importa.

**Para mensajes entrantes de WhatsApp, Kapso reutiliza la ejecución controladora
activa:** si está `waiting`, la reanuda; **si está `running` en un paso de agente, el
propio paso del agente inyecta el mensaje** — camino de código distinto del resume por
API. Una ejecución nueva arranca sólo si no hay ninguna controladora activa.
«Do not count workflow executions one-to-one with user messages.»

### 7.4 Agrupamiento — son dos mecanismos

**Buffering del webhook (el que tenemos apagado).** Ventana 1-60 s (def. 5), tope
1-100 (def. 50), por conversación, debounce. Con él encendido **toda entrega usa
formato de lote, incluso un mensaje solo**. Reintentos: inmediato, 10 s, 40 s, 90 s;
**cualquier respuesta que no sea 200 cuenta como fallo, incluidos los 4xx**. Tras
agotarlos, cae a entrega individual. **Pausa automática**: en 15 minutos con ≥20
entregas, ≥10 fallidas y ≥85% de fallo, Kapso pone `active: false`, marca las
pendientes como fallidas, manda email a todos los miembros, y **no vuelve a intentar
hasta rehabilitarlo a mano**.

**Problema conocido confirmado por ingeniería de Kapso:** un lote listo para enviar
puede tratarse como basura de limpieza antes de crear el registro de entrega, y el lote
entero desaparece **sin dejar fila**. Tenerlo apagado nos protege de eso.

**Debounce del workflow (el que sí nos afecta).** `message_debounce_seconds`, **def. 1**,
ajuste del workflow, independiente del buffering, **ya activo**. Es el agrupamiento real
de nuestra entrada.

### 7.5 WhatsApp Flows

**Un Flow publicado es inmutable.** Error 139001: hay que **clonar y republicar**.
139004: no se puede borrar, hay que deprecar. Y **Kapso no expone clonar ni deprecar en
su Platform API**: hay que ir por el Meta Proxy (`POST /{waba_id}/flows` con
`clone_flow_id`, `POST /{flow_id}/deprecate`) o por el SDK. El `flow_id` debe vivir en
una variable de entorno, no incrustado.

Kapso hace: registro y sync con Meta, historial de versiones, **cifrado y descifrado**,
generación de URLs seguras, **creación y rotación de secretos**, **URLs de vista previa**,
publicación, **verificación de firmas**, registro de invocaciones. El payload que llega
a nuestro Worker incluye `signature_valid: true` — no hay que reimplementar la validación.

**Contrato del data endpoint.** Recibimos
`{ source, flow, data_exchange: { version, action, screen, data, flow_token },
signature_valid, received_at }` — «`data_exchange` contains Meta's original payload».
Devolvemos `{ version: "3.0", screen, data }`. Cierre:
`data.extension_message_response.params.flow_token`.

**Cuatro acciones de Meta**: `INIT` (al abrir, sólo si `flow_action = data_exchange`),
`BACK` (sólo si la pantalla tiene `refresh_on_back: true`), `data_exchange`, y **`ping`**
(health check, respuesta esperada `{"data":{"status":"active"}}`). Más la notificación
asíncrona de error (respuesta esperada `{"data":{"acknowledged": true}}`).
**Kapso no documenta si responde el `ping` por su cuenta o lo reenvía.** Responder al
health check es requisito de publicación: programar el Worker para las cuatro acciones
y confirmar mirando `function_invocations`.

**Timeout real: 10 segundos de Meta**, no los 15 que documenta Kapso (ésos son el
envoltorio de Kapso hacia el Worker). Rate limit 100 peticiones/minuto por flow.
Si el endpoint se pone insano, Meta **limita el Flow a 10 mensajes por hora** y luego lo
**bloquea**.

**Componentes.** `CalendarPicker` desde Flow JSON **6.1**; `mode` `single|range`;
`min-date`, `max-date`, `unavailable-dates` (array «YYYY-MM-DD»), `include-days`
(`Mon`..`Sun`). **`on-select-action` sólo admite `data_exchange`** — es decir, consultar
las horas al tocar un día obliga a que el Flow sea dinámico. **No hay tope documentado
al número de fechas no seleccionables**; 60 fechas son ~600 bytes contra un límite de
10 MB. **`CalendarPicker` NO puede ir dentro de un `If`**: la lista de componentes
permitidos dentro de `If` es explícita y no lo incluye (usar su propio `visible`).
`If` desde 4.0, anidación máxima 3. `Dropdown`: 1-200 opciones. `RadioButtonsGroup`:
1-20 opciones, `label` requerido desde 4.0. Máximo 50 componentes por pantalla, 100
pantallas por Flow, 1 Footer por pantalla.

**`routing_model` es obligatorio** cuando el Flow usa data endpoint.

**Versiones vigentes de Meta al 7-nov-2025**: Flow JSON 5.1, 6.0-6.3, 7.0-7.2, **7.3
(recomendada)**; Data API 3.0 y **4.0 (recomendada)**. Kapso demuestra hasta 7.2 / 3.0
y **no documenta 4.0 en ninguna parte**. Kapso no impone tope: manda el JSON y Meta valida.

**Deriva silenciosa confirmada:** si el Flow publicado no lleva `data_api_version: "3.0"`
en la raíz y no usa acciones `data_exchange`, **sigue siendo estático** y el endpoint
queda sano pero sin uso.

**La respuesta del Flow no llega sola al agente.** No hay variable documentada. Tres
rutas: el webhook `whatsapp.message.received` filtrando `interactive.type === 'nfm_reply'`
y leyendo `message.kapso.flow_response`; una Function Tool que lea
`whatsapp_context.messages[].interactive_data`; o la API de mensajes con
`fields=kapso(flow_response,flow_token)`.

**`flow_token`**: si no se da, Kapso usa el `flowId`. Kapso enlaza la respuesta con el
Flow **por el mensaje saliente al que responde, no por el valor del token**. Trampa
confirmada: en `send_interactive`, si la ruta de la variable no resuelve, el token sale
**literal**.

**Ocho requisitos de publicación de Meta**: número verificado en la WABA, llave pública
firmada subida, `endpoint_uri` puesto, app de Meta enlazada, JSON válido, versiones no
congeladas, **endpoint respondiendo health checks**, WABA suscrita a webhooks de Flows.
Más: nombre para mostrar aprobado, verificación de negocio aprobada, método de pago
válido. «Business verification can be the decisive blocker.»

**El sandbox de WhatsApp no soporta Flows en absoluto.**

**Regla dura:** `flow_action` debe ser `navigate` para Flows sin endpoint. Y Meta
recomienda: «Prefer to make the first screen a data-channel-less to optimize flow
opening.»

### 7.6 Pruebas — qué demuestra cada vía

| Vía | Webhook | Conversación | Trigger inbound | Debounce | Agente real | Envelope real | Envío real |
|---|---|---|---|---|---|---|---|
| Modal de prueba del tablero | No | No | Simulado | No | Sí | Probable (no documentado) | No |
| Disparo por API | No | Parcial | No | No | Sí | Sí | Sí |
| Resume por API | No | No | No | No | Sólo ruta `waiting` | Sí | Sí |
| `/functions/{id}/invoke` | No | No | No | No | **No** | **No** | No |
| Vista previa interactiva de Flow | No | No | No | No | No | — (ejerce el endpoint real) | No |
| Sandbox de WhatsApp | Sí | Sí | Sí | Sí | Sí | Sí | Sí |

**Puntos ciegos que hay que tener presentes:**
- **El modal de prueba usa variables de entorno de Development**, no de Production. Si
  los secretos difieren, está hablando con otro backend. Y **la documentación no dice
  qué payload inyecta ni si sustituye el mensaje del usuario** — es exactamente el hueco
  que hizo pasar la prueba anterior sin demostrar nada. Sólo se cierra abriendo la
  ejecución y comparando `agent_tool_called.payload` contra lo esperado.
- **`/functions/invoke` manda el cuerpo tal cual**, sin el envelope del Agent Node. Si
  el handler lee `body.input.x` y probamos con `{"x": ...}` en la raíz, la prueba pasa
  y producción falla. Hay que reconstruir el envelope a mano.
- **Nunca disparar por API sin `phone_number_id` explícito.** Sin él, Kapso cae al
  primer config de WhatsApp del proyecto, y un mensaje real posterior puede reanudar esa
  ejecución equivocada.
- **Ninguna prueba sin WhatsApp real ejerce la ruta de inyección en agente corriendo.**
  Sólo el sandbox recorre webhook + debounce + trigger de mensaje entrante.
- **La vista previa interactiva del Flow ejerce el endpoint real con cifrado real** y
  muestra petición y respuesta completas en la pestaña Actions. Es la mejor prueba del
  data endpoint.

**Observabilidad.** `GET /platform/v1/workflow_executions/{id}/events` (la ruta anidada
bajo `workflows/{id}` **no está enrutada y da 404**). Eventos del agente:
`agent_iteration_started`, `agent_tool_called`, `agent_tool_response`,
`agent_message_sent`, `agent_task_completed`, `agent_max_iterations_reached`.
Para «el agente dijo que lo hizo pero no llamó a la función»: buscar el nombre en
`agent_tool_called.payload.tool_name`; si no hay evento, es decisión del modelo, no un
log perdido. **Los transcripts internos completos del agente no se exponen por API pública.**
Los créditos de IA son un libro contable **distinto** de los mensajes del plan; al
agotarse, el workflow parece activo y el agente parece escribiendo, pero no sale mensaje.

**`kapso push` es peligroso:** dentro de `definition`, `nodes` y `edges` son **conjuntos
de reemplazo**. Mandar un nodo borra los demás. Una sola fuente de verdad por workflow,
y `kapso pull` antes de diagnosticar.

---

## 8. BUENAS PRÁCTICAS — EVIDENCIA EXTERNA

### 8.1 El orquestador único es un anti-patrón con nombre

Se llama *God Tool* (arXiv 2606.30317, ICSME 2026): «Una sola herramienta acepta un
esquema grande e indiferenciado como `do_anything(action, params)`… La precisión de
selección de herramienta colapsa.» Razón técnica: **los LLM eligen herramienta leyendo
descripciones, no inspeccionando esquemas**. Una herramienta tiene una descripción para
22 comportamientos.

Pero 22 tampoco: la precisión de selección cae entre 10 y 15 herramientas según modelo
(≤10 recomendado por el paper); hay **sesgo posicional** medido — las del medio se
eligen menos (BiasBusters, ICLR 2026, arXiv 2510.00307), y la mitigación efectiva es
**filtrar a un subconjunto relevante y luego elegir** (sesgo de 0.422 → 0.079).
OpenAI: «menos de 20 funciones al inicio de un turno».

**Lo que la evidencia sí respalda:** consolidar operaciones **relacionadas** en menos
herramientas con un parámetro `action` (documentación oficial de Anthropic, «Define
tools»), y el patrón *Tool Orchestrator* — herramientas compuestas con **una intención
nombrable**, no un buzón genérico.

**Precedente dentro de Kapso:** su propia herramienta nativa `contact_conversations` usa
un parámetro `action` con valores `list|read` y parámetros condicionales.

**Recomendación resultante:** ~6 herramientas nombradas por intención, y que el servidor
declare sólo las 3-5 relevantes a la gestión abierta. Esquema **discriminado plano**
(`operation` como `enum` + `payload` como objeto), nunca un `oneOf` de 22 ramas — el
parser de Kapso es Ruby y es sensible a la forma.

### 8.2 El falso éxito es el riesgo número uno

arXiv 2606.09863 (junio 2026, 9.876 trayectorias, 8 familias de modelos): **el falso
éxito representa 44-52% de todos los fallos**; en aerolínea y retail, 45-48%. «El agente
presenta la interacción como resuelta. Los clientes creen que el problema está
arreglado; los pedidos quedan abiertos; los reembolsos nunca se emiten.»
Tres mecanismos: lenguaje de aserción confiado independiente del resultado; secuencias
de sólo lectura sin escritura; y **racionalización en vez de verificación** — los
modelos con razonamiento extendido son **peores** (uno llegó a 79%).

**Mitigaciones medidas:** verificación de estado independiente reduce el falso éxito
**~15×** (3% vs 45%); señales de finalización mediante **campos estructurados, no
lenguaje natural**; operación de escritura obligatoria antes de declarar completado.
Los jueces LLM **no sirven** para detectarlo (0.54-0.65 AUROC).

**Aplicación:** el mensaje de cierre se redacta desde lo que devolvió el servidor, no
desde lo que el modelo cree. La mutación responde con el estado posterior en campos
estructurados y el cierre se construye con esos campos.

### 8.3 Errores como remediación

PolicyGuide (arXiv 2608.19861, agosto 2026): guía a nivel de flujo vs guarda por acción.
Pass⁴ 0.42 → 0.62; en el dominio más estructurado las mutaciones pasaron de 0.042 a
**0.549**. Tasa de proceso válido 56.2% vs 17.5%. Robustez adversaria: **91.3% de
ataques de persuasión bloqueados**. «Los agentes responden mejor a "por favor identifica
primero al usuario" que a "identificación requerida".» Y: «**el código, no la memoria
conversacional del modelo, es dueño de la persistencia del estado**».

### 8.4 Prompt

IFScale (arXiv 2507.11538): la adherencia se degrada de forma **no lineal**; estable
hasta ~30-50 instrucciones. Sesgo posicional fuerte: **primacía y recencia funcionan,
el medio es donde peor cumple**.

Instruction Stacking Collapse (arXiv 2608.02639): la tasa de cumplimiento cae de ~96% a
**20%** al apilar restricciones, y la causa es un conjunto **reproducible de conflictos
por pares**, no el volumen. Reescribir para eliminar conflictos recupera hasta +11 puntos.

ReboundBench (arXiv 2511.12381, 5.000 prompts): «No menciones X» **incrementa la
accesibilidad de X**. Pero **la repetición sí sostiene la supresión**. De ahí:
enrutamiento positivo («cuando pidan una devolución, responde R7») sobre prohibición
desnuda; y si una prohibición es innegociable, repetirla al final.

Anthropic: datos largos arriba, instrucciones al final (hasta 30% de mejora); ejemplos
canónicos diversos en vez de listas de casos borde.

**Esqueleto recomendado**, con etiquetas XML: `<rol_y_alcance>` (prohibiciones duras,
primacía) → `<estado_de_la_gestion>` (inyectado: fecha, hora, zona, quién, qué pendiente,
en qué paso) → `<que_puedes_hacer>` (las 3-5 herramientas visibles) →
`<caminos_de_decision>` (tabla situación → acción) → `<respuestas_fijas>` →
`<ejemplos>` (3-5 gestiones completas) → `<contenido_no_confiable>` →
`<recordatorio_final>` (repetición literal de las prohibiciones duras).

### 8.5 Seguridad

Anthropic, mitigación de inyección: contenido no confiable **sólo en `tool_result`**;
decir qué es y de dónde viene; **codificarlo en JSON** (delimitadores inequívocos); y
—esto contradice un patrón común— **NO poner nuestras propias instrucciones dentro de
resultados de herramienta**: «las instrucciones que pongas ahí pueden ser ignoradas o
marcadas como posible inyección. Envía tus instrucciones en un turno de `user` que siga
al bloque `tool_result`». Hay que auditar qué devolvemos hoy.

Design Patterns for Securing LLM Agents (arXiv 2506.08837): «una vez que un agente ha
ingerido entrada no confiable, debe estar restringido de modo que sea **imposible** que
esa entrada dispare cualquier acción con consecuencias». Dos patrones describen casi
nuestro diseño: **Action-Selector** (el LLM traduce a un conjunto predefinido de
acciones; inmunidad a inyección para la elección de acción) y **Plan-Then-Execute**
(el plan se fija antes de procesar datos no confiables; integridad de flujo de control).
Su caso de estudio §4.5 es literalmente un asistente de reservas.

### 8.6 Topología — lo que repiten todas las plataformas

- **El contexto se carga antes del agente, de forma determinista.** n8n: obtener el
  contexto aguas arriba y pasarlo al prompt; una herramienta de búsqueda se reserva para
  cuando no sabes qué datos harán falta.
- **La pausa es un nodo de primera clase con estado durable, y el runtime la posee.**
  Caveat repetido: al reanudar, el código anterior se re-ejecuta, así que **los efectos
  laterales deben ser idempotentes** (upsert, no insert).
- **El cierre es una señal explícita del modelo**, no una inferencia del texto.
- **Formularios y caminos regulados salen del agente y se vuelven subflujos
  deterministas.** El agente **lanza** el formulario; no lo **conduce**.
- **Lo que decide el modelo vs lo que decide el flujo se separa por dónde vive el
  estado.** «Una mutación por gestión» debe ser estado del servidor, no instrucción del
  prompt.
- **El traspaso a humano es un nodo terminal**, no una herramienta más dentro del bucle.

### 8.7 Handles opacos — una tensión que hay que resolver

Anthropic es explícita en dirección contraria a nuestro diseño: «resolver UUIDs
alfanuméricos arbitrarios a lenguaje semánticamente significativo mejora
significativamente la precisión», y «devuelve identificadores semánticos y estables en
vez de referencias internas opacas».

**No hay que abandonar los handles opacos** —son un control de seguridad, no de UX— pero
**cada handle debe viajar emparejado con una etiqueta legible**:
`{ "handle": "…", "etiqueta": "martes 26 de agosto, 10:00, en línea" }`. El modelo razona
sobre la etiqueta y devuelve el handle. Un handle desnudo es el caso que degrada la
precisión.

### 8.8 Agendamiento por chat

Los botones y menús de WhatsApp **no pueden mostrar ni gestionar huecos en vivo**; los
huecos reales requieren un Flow dinámico con endpoint. Estructura óptima reportada:
**2 a 4 pantallas**; más de 4 baja la tasa de finalización.

Zonas horarias: normalizar **en la capa de herramienta, en código**, con la zona del
negocio como canónica; ninguna herramienta debe aceptar un parámetro de zona del modelo.
Y los modelos **no comparten una noción consistente de «ahora»**: inyectar fecha y hora
actuales explícitamente. (Kapso: `system.started_at` se escribe una vez y
`system.last_resume.at` sólo al reanudar; **ninguno es un «ahora» vivo**. El patrón
nativo es `get_current_datetime(timezone: '…')` antes de cada decisión de agendamiento.)

---

## 9. DECISIONES DEL DUEÑO YA TOMADAS (mandan sobre cualquier documento)

1. **Agendar y reprogramar van por formulario de WhatsApp.** Todo lo demás, conversacional.
2. **Una cita con dinero adentro no se cancela desde el agente.** Se ofrece mover, o
   trasladar el pago a la próxima cita si existe.
3. **Al reprogramar, el dinero siempre viaja con la paciente.**
4. **Un comprobante recibido queda pendiente de revisión.** El agente nunca dice
   «pagado» ni «aprobado». Acreditar, condonar y cobrar son del profesional.
5. **En prepago la cita nace sin confirmar** y se pide el comprobante por chat; si no
   llega en 24 h, un trabajo la cancela.
6. **Las tarjetas cerradas de cancelada y reprogramada conservan hora y modalidad**
   (la documentación y la app dicen lo contrario; el dueño manda).
7. **El margen real de aviso es de 26 h y a la profesional se le dicen 24.**
8. **La app del profesional y el Marketplace son intocables en esta ronda.**
9. **Simplicidad por encima de todo**: sin accesibilidad opcional, sin blindajes
   defensivos, sin soportar casos que el producto no atiende hoy.

## 10. DECISIONES ABIERTAS

1. **El cargo por cambio tardío al reprogramar**: aceptar que mover es siempre gratis
   (recomendado, cero código), o abrir un renglón nuevo en el modelo de pagos.
2. **Trasladar el pago a la próxima cita**: ¿se construye ahora o basta con mover?
   Cero series activas hoy; mover ya traslada el dinero completo con comprobante.
3. **El plazo del prepago cuando la cita es en menos de 24 h**: ¿vence a las 24 h o
   antes de que empiece la sesión, lo que ocurra primero?
4. **La cita del formulario, ¿nace confirmada alguna vez?** En prepago ya está decidido
   que no. Con cobro después, la ventana de 48 h choca con la anticipación de 48 h de
   tres profesionales: en la práctica ninguna nacería confirmada.
5. **Tope de citas sin confirmar por paciente**: no existe ninguno.
6. **Quién publica las reseñas**: no hay función de moderación.
7. **El marketplace en esta ronda**: si no entra, apagar la capacidad y decidir qué se
   le contesta a una paciente dada de baja.
8. **El agrupamiento de mensajes**: cuándo y con qué tope. Va al final de la fila.
9. **Qué se le entrega al profesional en su ficha de cita** (origen, actor, a tiempo o
   tarde) — material de la ronda siguiente, pero hay que nombrarlo.
10. **Un interruptor real de «mis pacientes pueden agendar solas»** — hoy es un pestillo
    de una sola dirección.
