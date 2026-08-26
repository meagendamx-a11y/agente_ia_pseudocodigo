# El puente — de la versión anterior a la conversacional

Corte: 2026-08-26.

Este documento contesta una sola pregunta: **si agendar y reprogramar dejan de ir por
formulario y pasan a ser conversación, ¿qué hace falta y qué sobra?**

Todo lo de aquí está verificado leyendo los dos proyectos desplegados —Supabase
`deklbpimnkueqsugepqq` («Agenda PSI», la versión anterior) y `ssyzfeadyrczlzjbvxyl`
(«Agenda PSI V2»)— más el código del árbol de trabajo. Las decisiones del dueño mandan
sobre `docs/diseno/`, y este documento las aplica.

---

## 0. El dato que ordena todo lo demás

La versión anterior movió 855 citas de 98 pacientes con 8 profesionales. Por WhatsApp, lo
que sí ocurrió:

| Qué | Cuántas veces |
|---|---|
| Confirmaciones por botón (`appointment_confirmations`) | **348** |
| Cancelaciones por botón (`appointments` canceladas con `patient_policy_status` sellado) | **13** (8 a tiempo, 5 tarde) |
| Comprobantes recibidos (`payment_proofs`) | **25** |
| Enlaces a la web para **agendar** enviados (`booking_access_tokens`, `create_appointment`) | **422** |
| …de ésos, los que llegaron a abrir sesión (`active_session`) | **52** |
| Enlaces a la web para **reprogramar** enviados | **378** |
| …de ésos, los que llegaron a abrir sesión | **12** |

```sql
-- verificado en deklbpimnkueqsugepqq
select access_type, status, count(*) from public.booking_access_tokens group by 1,2;
-- create_appointment:      created 356 | active_session 52 | expired 11 | invalidated 3
-- reschedule_appointment:  created 363 | active_session 12 | expired 3
```

**Doce de cada cien enlaces de agendar se abrieron. Tres de cada cien de reprogramar.**
Y ninguna fila de esa tabla llegó nunca al estado `consumed`: la web ni siquiera sellaba
que la gestión hubiera terminado. Pero el final sí se puede contar por otro lado, y el dato
matiza el diagnóstico fácil:

```sql
-- verificado en deklbpimnkueqsugepqq: quien mueve una cita desde la web sella
-- patient_policy_status (public.reschedule_appointment_from_booking)
select session_status, patient_policy_status, count(*)
  from public.appointments where patient_policy_status is not null group by 1,2;
-- RESCHEDULED  IN_TIME 6 | OUT_OF_TIME 4   <- 10 citas movidas de verdad por la web
-- CANCELLED    IN_TIME 8 | OUT_OF_TIME 5   <- 13 cancelaciones por el botón del chat
```

**De las 12 sesiones de reprogramar que llegaron a abrirse, 10 acabaron en una cita
movida.** O sea: la web servía a quien lograba entrar; lo que se perdía era la entrada. De
agendar no se puede saber lo mismo, porque `create_appointment_from_booking` no sella
origen en la cita.

Contra eso, lo que sí vivía dentro del chat —confirmar— se usó 348 veces.

Ésa es la lección del sistema anterior, y es exactamente la decisión del dueño: **lo que
se queda en el chat funciona; lo que manda a la paciente afuera se pierde.** El formulario
de WhatsApp es mejor que una web con cookie, pero sigue siendo una pantalla que hay que
abrir.

---

## 1. Tabla de equivalencias

Una fila por capacidad del agente anterior.

### 1.1 Confirmar

| | |
|---|---|
| **Antes** | Botón «Confirmar» del recordatorio que se manda un día antes. |
| **Con qué** | `rpc_confirm_appointment_from_whatsapp(p_patient_phone, p_appointment_id, p_twilio_message_sid)`. Inserta en `appointment_confirmations` con `ON CONFLICT (appointment_id) DO NOTHING` y contesta un texto fijo. |
| **Hoy en V2** | `public.agent_confirm_appointment_from_workflow(p_provider_message_id, p_kapso_execution_id, p_appointment_handle)` — escrita en `20260825003000_agent_citas_mutaciones.sql`, **sin desplegar**. El portero desplegado ya autoriza la pareja `('agent_node','confirm_appointment')`. La ruta `/tools/appointments/confirm` ya está escrita en el gateway del árbol de trabajo (la función desplegada contesta cuatro rutas y ninguna más: `/health`, `/tools/capabilities`, `/workflow/waiting` y `/workflow/complete`; cualquier otra devuelve `403 OPERATION_NOT_ENABLED`). |
| **Qué falta** | Desplegar la migración. Nada más. |
| **Por texto** | «sí voy» → el expediente ya trajo la cita con su etiqueta y la acción `confirmar` → una llamada. **Total: 2.** |

### 1.2 Cancelar

| | |
|---|---|
| **Antes** | Botón «Cancelar». |
| **Con qué** | `rpc_cancel_appointment_from_whatsapp`. Lee `configurations.min_cancel_notice` (un booleano) y compara contra **24 horas escritas a mano en el código** (`(v_start_datetime - v_now_mx) < interval '24 hours'`); sella `patient_policy_status` en `IN_TIME` u `OUT_OF_TIME`; crea la notificación `appointment_cancelled`. **No mira el dinero en ningún momento.** |
| **Hoy en V2** | `agent_cancel_appointment_from_workflow(…, p_appointment_handle)`, escrita, sin desplegar. Portero ya autoriza. El plazo sale de la ficha de cada profesional (`free_change_notice_minutes`: Miranda pide 12 h, no 24). Abre `late_change_decision = 'pending'`, que es el circuito de cobro que en la versión anterior no existía. |
| **Qué falta** | El cerrojo del dinero (`PAYMENT_INSIDE`, `06` §2.8): sin él se repite el peor defecto del sistema anterior, que cancelaba encima de un comprobante ya recibido. |
| **Por texto** | «ya no voy a poder» → una llamada. **Total: 2.** El mensaje de cierre lo escribe el servidor y, si fue tarde, dice que su profesional decidirá si le cobra. |

### 1.3 Pedir comprobante

| | |
|---|---|
| **Antes** | Botón «Subir comprobante» — **la paciente pedía que le pidieran**. |
| **Con qué** | `rpc_request_payment_proof_from_whatsapp` cerraba el `proof_request` ACTIVE anterior (`SUPERSEDED`) y creaba uno nuevo con 24 h de vigencia. Exigía `payment_method = 'TRANSFER'` y `payment_status = 'PENDING'`. |
| **Hoy en V2** | **No hay operación equivalente, y no debe haberla.** El diseño la sustituye por sellar `proof_requested_at = now()` al agendar en prepago (`03` §5.1) y por el estado `esperando_comprobante` que el expediente ya entrega. |
| **Qué falta** | Nada del lado del agente. |
| **Por texto** | **Cero llamadas.** El expediente dice que hay un pago esperando comprobante y el agente le pide la foto en el chat. |

### 1.4 Recibir la imagen del comprobante

| | |
|---|---|
| **Antes** | Ella mandaba la foto sin decir nada. |
| **Con qué** | El webhook (`whatsapp_weebhook_2`) buscaba el `proof_request` ACTIVE vigente de ese teléfono, bajaba el archivo de Twilio con las credenciales, lo subía a Storage, y llamaba a `rpc_handle_incoming_whatsapp_image`, que colgaba el `payment_proof` de la cita a la que apuntaba la petición. Si la RPC fallaba, borraba el archivo. |
| **Hoy en V2** | `agent_attach_payment_proof_from_workflow(…, p_appointment_handle, p_storage_object_path, p_mime_type, p_size_bytes, p_checksum)`, escrita en `20260825002000_agent_pagos.sql`. |
| **Qué falta** | Dos cosas verificadas. **Una:** el portero **desplegado** sólo la autoriza en la superficie `media_adapter`, y el agente vive en `agent_node` (nudo 2 de la auditoría) — pero el arreglo **ya está escrito**: `20260825000000_agent_dominio_fundamento.sql` suma `attach_payment_proof` a las mutaciones de `agent_node`. Falta aplicarlo, no escribirlo. **Dos:** nadie baja el archivo. La versión anterior sí lo hacía en el webhook; V2 todavía no, y hay que hacerlo en `kapso_inbound_webhook` al admitir (cambio 9 del diseño). |
| **Por texto** | Ella manda la foto → el expediente dice a qué pago corresponde → una llamada. **Total: 2.** Y nunca se le dice «pagado». |

### 1.5 Ver dirección

| | |
|---|---|
| **Antes** | Botón «Ver dirección». |
| **Con qué** | `rpc_view_address_from_whatsapp` devolvía `latitude`, `longitude`, `label` y un `persistent_action` con formato `geo:lat,lng|etiqueta`; el webhook mandaba un mensaje de ubicación real de Twilio, y si eso fallaba caía a un enlace de Google Maps. |
| **Hoy en V2** | **No hace falta operación.** El expediente trae `profesional.donde = { direccion, liga }` en la misma llamada que abre todo. |
| **Qué falta** | Nada. Se pierde el pin de mapa: hoy sale la dirección en texto. Es una pérdida real y pequeña; V2 sí guarda `office_latitude/longitude`, así que se puede recuperar el día que se quiera, sin llamada extra. |
| **Por texto** | **Cero llamadas.** Ya viene en el expediente. |

### 1.6 Texto suelto

| | |
|---|---|
| **Antes** | Cualquier cosa que ella escribiera. |
| **Con qué** | `rpc_handle_incoming_whatsapp_text_simple` — 10 526 caracteres de árbol de decisión con dos salidas. Si tenía cita próxima, le contestaba un texto que decía literalmente: *«Este chat funciona solo con botones y envío de comprobantes»*. Si no tenía, invalidaba sus tokens anteriores, acuñaba uno nuevo y disparaba una plantilla con el enlace a la web. |
| **Hoy en V2** | Es el caso normal, no la excepción: `abrir_expediente` más el modelo. |
| **Qué falta** | Los seis textos fijos (decisión abierta 9 del diseño): es lo único que necesita la pluma del dueño. |
| **Por texto** | 1 llamada para consultar algo, 2 si hay que contestar con un texto fijo. |

### 1.7 Agendar

| | |
|---|---|
| **Antes** | **Nunca en el chat.** Plantilla `HXae25ae694623ef5159bf5f42570c5b5d` con `{{3}} = token`, y una web con token y cookie: `create_booking_access_token_for_create` → `resolve-booking-access` → `get-current-booking-access-context` → `get-booking-access-context-data`. Token de 16 bytes, guardado como SHA-256. |
| **Hoy en V2** | **La versión conversacional ya está escrita.** `public.agent_create_appointment_from_workflow(p_provider_message_id, p_kapso_execution_id, p_slot_handle)` — un solo identificador opaco y nada más. La ruta `/tools/appointments/create` ya está escrita en el gateway del árbol de trabajo y llama a esa RPC con `p_slot_handle`. Y `agent_get_availability_from_workflow(…, p_service_handle, p_day, p_modality)` devuelve hasta **6 huecos** de un día, cada uno con su identificador. |
| **Qué falta** | **No es una línea que haya que escribir: es una que hay que dejar de borrar.** En el portero **desplegado** la pareja `('agent_node','create_appointment')` no existe —sus mutaciones son `confirm_appointment`, `cancel_appointment`, `cancel_then_open_booking_flow`, `reschedule_appointment`, `switch_appointment_modality`, `resume_resource_delivery` y `submit_review`— así que hoy sale `TOOL_NOT_ALLOWED`. Pero la migración `20260825000000_agent_dominio_fundamento.sql`, que está escrita y sin aplicar, **ya la añade** (con un comentario que dice «ÚNICO CAMBIO RESPECTO DE LO DESPLEGADO»). El problema real está más adelante: el parche del portero que el diseño planea en `06` §2.4 **retira `get_availability` y `reschedule_appointment`** de `agent_node`, y sin esas dos la versión conversacional no existe. Y falta todo lo del expediente: `agent_open_case_from_workflow` no está escrita, `open_case` no está en ninguna lista del portero, y sin servicios con identificador no se puede pedir disponibilidad. |
| **Por texto** | Ella dice qué quiere y cuándo le queda; el agente le ofrece hasta seis horas de ese día; ella escoge una. La cuenta completa está en §4. |

### 1.8 Reprogramar

| | |
|---|---|
| **Antes** | **Nunca en el chat.** `create_booking_access_token_for_reschedule(patient, professional, appointment, expires)` y la misma web. 378 enlaces, 12 sesiones abiertas. |
| **Hoy en V2** | `agent_reschedule_appointment_from_workflow(…, p_appointment_handle, p_slot_handle)`, escrita, y el portero **ya la autoriza** en `agent_node`. Ruta `/tools/appointments/reschedule` ya escrita en el gateway con los dos identificadores. Y traslada el dinero completo con su comprobante (`03` §1.4). |
| **Qué falta** | Dos ajustes chicos. **Uno:** el expediente debe entregar, por cada cita, el identificador del servicio, porque la disponibilidad se pide por servicio. **Dos:** la lectura de disponibilidad pasa `NULL` en el parámetro que excluye la cita que se está moviendo, mientras la mutación sí la excluye (`v_old.id`) — o sea que **su propia cita se tapa a sí misma** los huecos vecinos al pedirle horarios. Es un parámetro. |
| **Por texto** | «quiero mover la del jueves» → el expediente ya trae esa cita con etiqueta → horarios de un día → escoge. Misma cuenta que agendar. |

---

## 2. Lo que V2 agrega y antes no existía

Cinco cosas. Ninguna tiene equivalente en el sistema anterior.

| Qué | Estado hoy | La versión por texto más simple |
|---|---|---|
| **Cambio de modalidad** | `agent_switch_appointment_modality_from_workflow(…, p_appointment_handle, p_modality)` escrita; el portero **ya la autoriza**. Ruta ya escrita en el gateway. | «¿la puedo tomar en línea?» → el expediente ya dice si esa profesional lo permite **en esa dirección** y si la cita todavía está a tiempo, y la acción `cambiar_modalidad` aparece o no aparece en esa cita → **2 llamadas**. El modelo no evalúa la política: escoge de la lista que le dieron. La direccionalidad es real: `test` deja pasar a en línea pero **no** a presencial. |
| **Reseña** | `agent_submit_review_from_workflow(…, p_rating, p_comment)` escrita, sin identificador: el sujeto es la pareja paciente-profesional del turno. | Si entra: «te doy 5 estrellas» → **2 llamadas**, y el cierre **nunca promete publicación**. La recomendación del diseño sigue en pie: dejarla fuera de esta ronda, porque ninguna función desplegada escribe `moderation_status` y hay cero reseñas en producción. Sacarla baja el catálogo a cuatro herramientas, que es lo mejor que le puede pasar a la precisión del modelo. |
| **Materiales** | `agent_resume_resource_delivery_from_workflow` escrita. La tabla `public.jobs` **sí existe** y guarda 14 trabajos, **los 14 en `pending`** (1 `patient_resource_delivery` y 13 de limpieza de archivos); ninguna tarea programada los consume —las que corren son `cron_appointment_reminder_1h`, `cron_confirmation_26h`, `cron_sweep_past_pending`, tres purgas y `sender_whatsapp`—. O sea: se encolan y ahí se quedan. | No entra. Se apaga la capacidad y se contesta con un texto fijo. Prometer un material que nadie entrega es el falso éxito contra el que está armado el resto del diseño. |
| **Trasladar el pago a la próxima cita** | Decisión abierta 2. Cero series de recurrencia activas. | No se construye. Mover ya traslada el dinero completo con su comprobante, así que el caso está cubierto por reprogramar. Si insiste: texto fijo que la remite a su profesional. |
| **La decisión de cobro tardío** | La abre cancelar poniendo `late_change_decision = 'pending'`. **Ojo con el lugar: la columna vive en `public.payments`, no en `public.appointments`.** Ocho funciones desplegadas la mencionan, la leen o la resuelven, y **ninguna la pone en `pending`** —`public.cancel_appointment`, la superficie de la profesional, incluso **revienta** con `INVALID_PAYMENT_STATE` si la encuentra puesta—. Hoy hay **cero** pagos en `pending`: el agente va a ser su único productor. | El mensaje de cierre se lo dice a ella tal cual —la cita quedó cancelada y su profesional decidirá si le cobra esa sesión— y **no promete que le avisarán**. Con la advertencia que ya está escrita: hoy esa decisión es muy difícil de encontrar en la app de la profesional, y el agente va a llenar esa pantalla. |

---

## 3. El problema del contexto

### 3.1 Antes el contexto lo cargaba el botón

Literalmente. El webhook anterior hacía esto:

```ts
// whatsapp_weebhook_2/index.ts, versión 35, desplegado
const appointmentId = parsePositiveBigintString(ctx.buttonPayload)
if (!appointmentId) return twimlMessage(MSG_ONLY_BUTTONS)
...
await supabaseAdmin.rpc(rpcName, {
  p_patient_phone: ctx.fromPhone,
  p_appointment_id: appointmentId,
  p_twilio_message_sid: ctx.messageSid,
})
```

El `ButtonPayload` **era el id de la cita**. Cero ambigüedad, cero conversación, y cero
posibilidad de hacer nada que no estuviera en un botón que alguien mandó antes. Por eso la
respuesta a un texto libre era «este chat funciona solo con botones»: no había de dónde
sacar de qué cita hablaba.

### 3.2 Por texto lo carga el expediente, y cuesta una llamada

V2 ya tiene la pieza: identificadores opacos **emparejados con una etiqueta legible**.

```json
{ "cita": "9f1c4d2a-6b70-4c11-9a3e-0d5f8e12b447",
  "etiqueta": "jueves 27 de agosto, 3:30 p. m., en línea",
  "confirmada": false,
  "dinero_adentro": true,
  "cambio_a_tiempo": true,
  "acciones": ["confirmar", "cambiar_modalidad", "reprogramar"] }
```

El modelo razona sobre la etiqueta y devuelve el identificador. **Ningún esquema de entrada
acepta la etiqueta**, así que no la puede mandar en su lugar. Y el identificador está atado
al turno: `private.agent_resolve_option_token` compara `token.turn_id` contra el turno que
pregunta y devuelve `TOKEN_CONTEXT_INVALID` si no coinciden.

**Cuánto cuesta el contexto entero: una llamada.** `abrir_expediente` trae hora local,
relación, nombres, los plazos reales de esa profesional, hasta tres citas con sus acciones,
hasta tres pagos con su estado, y qué herramientas están vivas. En la versión anterior el
equivalente no existía; en el diseño escrito antes del expediente eran ocho lecturas
sueltas.

**Con una advertencia que ordena todo el plan de trabajo: el expediente todavía no
existe.** `agent_open_case_from_workflow` está por escribirse (paso 10 de `06` §1.1, la
migración `20260825007000`), la operación `open_case` no está en ninguna lista del portero
—ni en la desplegada ni en la escrita—, y el gateway no tiene su ruta. Toda la cuenta de la
§4 se apoya en esa pieza, así que es la primera que hay que escribir, no la última.

### 3.3 El caso «¿cuál de las dos?» es gratis, pero sólo si el turno sigue abierto

Ella tiene dos citas. Escribe «cancélame la cita». El agente pregunta con las dos etiquetas.
Ella contesta «la del jueves».

- **Si el turno siguió abierto** (§4), los identificadores del expediente **siguen vivos**,
  porque el que los mata es el cambio de turno, no el reloj. El agente cancela directo.
  **Cero llamadas extra.**
- **Si el turno se cerró**, todos murieron. Hay que abrir expediente otra vez para volver a
  ver esa cita. **Una llamada extra**, y la conversación funciona igual.

Ésta es la razón por la que el diseño escrito decía «el expediente se abre en cada mensaje»:
estaba escrito para un mundo donde cada mensaje abre un turno nuevo. Conversando hay que
cambiar la regla a **una vez por turno, en el primer mensaje**, y el §4 explica por qué eso
además es lo que hace que la cuenta cierre.

---

## 4. La cuenta del presupuesto, para agendar por texto

Ésta es la pieza que decide si el cambio se puede hacer.

### 4.1 Los topes, tal como están en la base

Verificados en `ssyzfeadyrczlzjbvxyl`:

| Tope | Definición exacta | Dónde |
|---|---|---|
| Ocho llamadas por turno | `CHECK (tool_call_count >= 0 AND tool_call_count <= 8)` | `agent_turns_tool_call_count_check` |
| Ordinales del 1 al 8 | `CHECK ((ordinal >= 1 AND ordinal <= 8 AND NOT …complete_inbound) OR (ordinal = 9 AND …complete_inbound))` | `agent_tool_calls_check` |
| Una mutación por turno | `mutation_limit` con default **1**, y `CHECK (committed_mutation_count <= mutation_limit)` | `agent_turns_check` |
| Vida del turno | `expires_at = LEAST(sesión.expires_at, now() + 30 min)`, refrescado en cada reclamo y en cada reanudación; y muerte por inactividad a los 30 min | `agent_claim_tool_call`, `agent_bind_inbound_execution`, `agent_register_inbound_context` |
| **10 mensajes por teléfono en 5 min** | `count(*) >= 10 … admission_status IN ('admitted','resumed')` | `RATE_LIMIT_INBOUND_5M` |
| **5 turnos nuevos por teléfono en 5 min** | `count(*) >= 5 FROM agent_turns … created_at >= now() - interval '5 minutes'` | `RATE_LIMIT_TURN_PHONE_5M` |

**Y una distinción que decide la §4.4, y que no se ve si no se lee el orden del código:**
los tres topes de *turnos* están colgados de `ELSIF NOT v_can_resume`, así que **reanudar
no cuenta**. El de *mensajes* no lo está: se evalúa primero y cuenta **cada mensaje
admitido o reanudado**. O sea que el tope de diez mensajes en cinco minutos aplica a las
dos formas, incluida la del turno abierto.
| 30 turnos por teléfono en 24 h | idem con 24 horas | `RATE_LIMIT_TURN_PHONE_24H` |
| 100 turnos por profesional en 24 h | idem | `RATE_LIMIT_TURN_PROFESSIONAL_24H` |

**Lo primero que hay que entender: las ocho llamadas son por turno, y un turno no es un
mensaje — es todo lo que dure la gestión mientras el turno no se cierre.**

`agent_register_inbound_context` sólo reanuda un turno cuando lo encuentra en
`waiting_external`; y `agent_bind_inbound_execution` lo devuelve a `active` refrescándole
media hora. O sea que hay **dos formas** de conversar, con costos opuestos.

### 4.2 Forma A — un solo turno abierto durante toda la gestión

El agente contesta y se duerme (`enter_waiting` más `sync_waiting`, que deja el turno en
`waiting_external`). El siguiente mensaje **reanuda el mismo turno**. Los identificadores
siguen vivos. El presupuesto de ocho se comparte entre todos los mensajes.

**Agendar, paso por paso, con el expediente trayendo ya los servicios:**

| Lo que ella escribe | Llamadas que gasta | Ordinal acumulado |
|---|---|---|
| «quiero una cita» | `abrir_expediente` | **1** |
| «en línea, ¿tienes el martes?» | `disponibilidad(martes, en línea)` | **2** |
| «no me queda, ¿el jueves?» | `disponibilidad(jueves)` | **3** |
| «mejor el viernes en la tarde» | `disponibilidad(viernes)` | **4** |
| «a las 6» | `agendar(hueco)` — la mutación | **5** |
| — | el cierre vive en el ordinal 9, **fuera del presupuesto** | 5 |

**Cabe, y sobran tres.** Con esos tres le quedan **tres días más** que probar antes de topar:
el techo real de la forma A es **un expediente más seis días distintos más la reserva = 8
exactas**. El noveno intento revienta la restricción con `TOOL_BUDGET_EXCEEDED`.

Reprogramar cuesta lo mismo: expediente (que ya trae sus citas con etiqueta), los días que
pruebe, y la mutación.

**Y una mutación por turno alcanza para la gestión**, porque agendar es una y mover es
una —pero sólo si el turno se cierra en cuanto la mutación se compromete, y por eso está el
punto 4 de abajo.

**Lo que hay que cambiar para que salga esta cuenta** — cinco cosas chicas:

1. **El expediente trae los servicios con su identificador.** Si no, hay que gastar
   `list_services` en el primer mensaje y el techo baja de seis días probados a cinco. Es un
   arreglo más en `agent_open_case_from_workflow`, que de todos modos está por escribirse.
2. **El expediente se abre una vez por turno, no una vez por mensaje.** Reanudando, los
   identificadores del mensaje anterior siguen vivos y el modelo conserva toda la
   conversación en su contexto. Si se abre en cada mensaje, una gestión de cinco mensajes
   gasta cinco expedientes y **no cabe**.
3. **La vida del identificador de hueco sube de 5 minutos a 30.** Ya está decidido en `02`
   §3 por el formulario; por texto importa más, porque ella lee seis horarios y contesta
   escribiendo. Y con cinco minutos el castigo es peor de lo que parece: por
   `agent_option_tokens UNIQUE (turn_id, kind, stable_key)` el emisor devuelve
   `TOKEN_EXPIRED_STABLE_KEY` en vez de reemitir, y `agent_get_availability_from_workflow`
   **no lo tolera: levanta `AGENT_WORKFLOW_AVAILABILITY_HANDLE_REJECTED`**. No es que el
   día salga incompleto — es que **volver a pedir ese mismo día revienta la lectura entera**
   y ella no recibe horarios, sino un error.
4. **Después de la mutación, cerrar el turno; nunca dormirlo.** `mutation_limit` viene en
   **1** por omisión y `agent_turns_check` lo hace ley. En la forma A el turno abarca toda
   la conversación, así que si el agente reserva y se queda dormido, el «y de paso
   cancélame la del jueves» del mensaje siguiente cae en `MUTATION_BLOCKED`. Cerrar tras la
   mutación deja que el mensaje siguiente abra un turno nuevo con su propia mutación —es
   exactamente lo que ya advertía `06` §2.4— y no cuesta nada: una gestión son uno o dos
   turnos, muy lejos de los cinco en cinco minutos.
5. **El expediente dice desde qué día se puede agendar.** `patient_min_booking_lead_minutes`
   es **2 880 minutos (48 h)** en tres de las cinco fichas y 1 440 en las otras dos. Sin ese
   dato, «¿tienes mañana?» vuelve vacío para la mayoría y se gastó una de las ocho llamadas
   en un día que nunca pudo tener huecos. Con el primer día agendable y el horizonte de 60
   días dentro del expediente, el modelo no tira llamadas.

**El riesgo de la forma A no es el presupuesto, es el reloj.** Si ella tarda más de 30
minutos en contestar, el turno expira, el siguiente mensaje abre uno nuevo y todos los
identificadores mueren. No es un fallo: es un reinicio. El agente vuelve a abrir expediente
y vuelve a preguntar el día. Cuesta un mensaje de más y nada de dinero.

### 4.3 Forma B — cerrar el turno entre pasos

El agente cierra después de cada respuesta (`complete_task`). Cada mensaje abre un turno
nuevo con ocho llamadas frescas. **El presupuesto deja de importar por completo:** ningún
mensaje pasa de tres llamadas (expediente, una lectura o una mutación).

Suena mejor. **No lo es**, y por dos razones verificadas:

**Uno: los identificadores mueren entre mensajes.** El agente le enseña seis horarios; ella
escoge; el mensaje siguiente es otro turno y ese identificador ya no resuelve
(`TOKEN_CONTEXT_INVALID`). Para reservar hay que volver a pedir la disponibilidad de ese día
—lo que reemite los identificadores— y luego reservar: expediente (1), disponibilidad (2),
agendar (3). Funciona, pero el hueco pudo haberse ocupado en el intervalo y ella recibe un
desmentido cuando ya creía haber terminado. Es exactamente el problema que el diseño escrito
usaba para justificar el formulario.

**Dos, y es el que decide: se topa el tráfico, no el presupuesto.** El tope que muerde es
**5 turnos por teléfono en 5 minutos**. Una gestión de agendar son cinco o seis mensajes
seguidos, escritos rápido. Al sexto, `RATE_LIMIT_TURN_PHONE_5M` y ella recibe el aviso de
tope **a media gestión de agendar**, que es el peor lugar posible del producto para
recibirlo.

Y el de 30 turnos en 24 h también aprieta: dos gestiones de agendar más una reprogramación
más un par de preguntas lo alcanzan en una tarde.

**Y hay un tercer golpe, peor, que no se ve en la tabla: el aviso de tope se reclama una
sola vez cada quince minutos por teléfono** (`notice_claimed_at >= now() - interval '15
minutes'` dentro de `agent_register_inbound_context`). Al sexto mensaje ella recibe el
aviso; del séptimo en adelante el webhook contesta 200 sin `response_key` y **no le llega
nada**. Es decir: a media gestión de agendar, escribiendo cada vez más rápido porque nadie
le contesta, el chat se queda mudo un cuarto de hora.

### 4.4 Veredicto

| | Forma A (turno abierto) | Forma B (cerrar entre pasos) |
|---|---|---|
| Presupuesto de 8 llamadas | Cabe con margen: 5 de 8 en el caso normal, 8 exactas en el peor | Nunca lo toca |
| Identificadores | Vivos toda la gestión | Mueren en cada mensaje |
| El hueco que ella escogió | Se reserva contra el mismo identificador que vio | Hay que reemitirlo y puede haberse ido |
| Tope de 10 mensajes en 5 min | **Sí lo toca**, y es su techo real: cuenta cada mensaje admitido **o reanudado**. Una gestión de cinco o seis cabe; dos seguidas en cinco minutos, no | Igual, y además topa antes por turnos |
| Tope de 5 turnos en 5 min | **No lo toca**: toda la gestión es un turno, y reanudar está exento | **Lo topa al sexto mensaje** |
| Tope de 30 turnos en 24 h | Una gestión = un turno | Se alcanza en una tarde |
| Si tarda más de 30 min en contestar | Reinicia: expediente nuevo y vuelve a preguntar el día | Igual |

**Agendar conversando cabe, y cabe por la forma A.** Es lo contrario de lo que se
adivinaría: el presupuesto de ocho llamadas es generoso para una conversación; los cinco
turnos en cinco minutos no lo son.

Y es la misma decisión que ya tomaba el formulario, por la misma razón: el formulario
también deja el turno en `waiting_external` mientras ella escoge. Lo que cambia es que ahora
lo que ocurre durante la espera es una conversación en vez de una pantalla.

**Consecuencia sobre lo que ya está escrito: `enter_waiting`, `sync_waiting` y el estado
`waiting_external` no se tiran con el formulario. Se quedan, y pasan a ser más importantes
que antes.** Es el error más caro que se podría cometer en este cambio.

**Y un ajuste recomendado que no bloquea:** subir el tope de 5 turnos en 5 minutos a 10,
que es donde ya está el de mensajes (decisión abierta 10 del diseño). No hace falta para la
forma A, pero cubre el día en que un turno se cierre por accidente a media gestión.

### 4.5 Los cambios que hay que hacer, en una lista

| # | Qué | Dónde | Tamaño |
|---|---|---|---|
| 1 | `create_appointment` en las mutaciones de `agent_node` — **ya escrito** en `20260825000000_agent_dominio_fundamento.sql`; sólo hay que aplicarlo | migración de la tanda 1 | nada que escribir |
| 1 bis | **No retirar `get_availability` ni `reschedule_appointment`** de `agent_node`, como manda hoy el parche planeado | `06` §2.4 | dos renglones que **no** se borran |
| 1 ter | Añadir `open_case` a las lecturas de `agent_node` y a la lista sin inquilino | el mismo parche de `06` §2.4 | dos líneas |
| 2 | El expediente trae los servicios con identificador y etiqueta | `agent_open_case_from_workflow` (por escribir) | un arreglo más |
| 3 | El expediente trae, por cita, el identificador de su servicio | idem | un campo más |
| 4 | La disponibilidad admite excluir la cita que se mueve | `agent_get_availability_from_workflow`, que hoy pasa `NULL` donde la mutación pasa `v_old.id` | un parámetro |
| 5 | La vida del identificador de hueco sube a 30 min. Son **tres** lugares, no dos: la matriz del `private.agent_issue_option_handle` desplegado, la matriz del `private.agent_issue_listed_option` escrito, y el `interval '5 minutes'` que `agent_get_availability_from_workflow` mete en el `LEAST`. Y hay que comprobar que la llave vigente cubra la ventana más larga, o la lectura muere con `AGENT_WORKFLOW_AVAILABILITY_TOKEN_KEY_MISSING` | tres archivos | tres renglones |
| 6 | El prompt: expediente una vez por turno; dormir con `enter_waiting` **mientras se junta información**, y **cerrar** en cuanto la mutación se compromete | `05` §1 | reescritura de un bloque |
| 6 bis | El expediente trae el primer día agendable (hoy `patient_min_booking_lead_minutes` son 48 h en tres de cinco fichas) | `agent_open_case_from_workflow` (por escribir) | un campo más |
| 7 | *(recomendado)* subir el tope de turnos de 5 a 10 en 5 min | `agent_register_inbound_context` | una constante |

`get_availability` ya está autorizada con el turno en `active` **o** en `waiting_external`, y
es la única lectura del portero con ese privilegio. Conversando, en la práctica, el turno
siempre está `active` cuando el modelo llama —`agent_bind_inbound_execution` lo devuelve a
`active` al reanudar—, así que el privilegio no es lo que hace posible la conversación. Lo
que sí importa es que **no se borre**: el parche planeado en `06` §2.4 la retira, y sin ella
no hay agendar por texto.

**Y un detalle que hay que aceptar, no arreglar:** el identificador de hueco es de un solo
uso y `agent_create_appointment_from_workflow` lo consume **antes** de comprobar que el
hueco siga libre. Si alguien se le adelantó, ella recibe «ese horario ya se ocupó» y hay que
volver a ofrecerle el día: una llamada más. Cabe en el presupuesto y es honesto; lo único
inaceptable sería no decírselo.

---

## 5. El agrupamiento de mensajes

### 5.1 Hoy el segundo mensaje de una ráfaga se sale de la bitácora

Éste es el problema real que el dueño quiere resolver, y es más grave de lo que parece.
Recorrido verificado línea por línea:

1. Ella manda «quiero cita» y, dos segundos después, «para el martes».
2. El primero se admite y abre un turno en `admitted`.
3. El segundo llega y `agent_register_inbound_context` encuentra el turno en `admitted` o
   `active` → `v_status := 'rejected'; v_reason := 'TURN_BUSY'`.
4. El manejador ve `TURN_BUSY` y le pregunta a Kapso si hay una ejecución dormida:
   ```ts
   if (busyTurn) {
     if (live === null || live.status !== 'waiting') fail('WORKFLOW_EXECUTION_BUSY');
   ```
5. La ejecución está `running`, no `waiting` → `WORKFLOW_EXECUTION_BUSY` → el manejador lo
   atrapa y contesta `{ ok: true, status: 'rejected' }`.

**Doscientos y nada. El mensaje sale de nuestra bitácora, y como contestamos 200, Kapso ni
siquiera reintenta.**

Y aquí hay que ser exacto, porque el desenlace tiene dos ramas y ninguna es buena:

- **Si la ejecución está `running`** —el caso de la ráfaga rápida— nuestro despachador la
  descarta. Del lado de Kapso, el sustrato ya verificado dice que *«si está `running` en un
  paso de agente, el propio paso del agente inyecta el mensaje»*. O sea que el mensaje puede
  llegarle al modelo **por un camino que nuestra bitácora nunca ve**: sin fila de entrada,
  sin admisión, sin idempotencia, y con la guarda de «hay un mensaje posterior» de
  `agent_mark_inbound_waiting` ciega ante él.
- **Si la ejecución está `waiting`** pero nuestro turno seguía `active`, el despachador sí la
  reanuda —a propósito y **sin vincular**, para no romper la correlación del mensaje
  anterior—. Funciona, pero las herramientas siguen direccionadas al mensaje viejo.

En los dos casos el resultado para ella es el mismo problema del dueño: escribe en ráfagas
—que es como se escribe por WhatsApp— y la conversación se descuadra. Agendar por texto se
conversa exactamente así.

Así que el agrupamiento deja de ser «al final de la fila» (decisión abierta 14 del diseño) y
pasa a ser parte del cambio. La decisión del dueño manda.

### 5.2 Por qué encenderlo antes de tocar el código deja al agente mudo

Con el buffering encendido, **toda entrega de Kapso pasa a formato de lote, incluso un
mensaje solo**. Y hoy hay **dos cerrojos independientes** que rechazan un lote:

```ts
// kapso_inbound_webhook/handler.ts
const isBatch = batchHeader(request);      // lee x-webhook-batch y x-batch-size
...
if (isBatch) return errorResponse('BATCH_NOT_ENABLED', 422);
```

```ts
// _shared/agent/kapso-v2.ts
if (root.batch === true || Array.isArray(root.data)) fail('BATCH_NOT_ENABLED');
```

Los dos contestan **422**. Y en Kapso, **cualquier respuesta que no sea 200 cuenta como
fallo, los 4xx incluidos**. La secuencia es mecánica:

1. Cada entrega falla con 422.
2. Kapso reintenta: inmediato, 10 s, 40 s, 90 s. Los cuatro fallan.
3. Se dispara la pausa automática: **en 15 minutos con ≥20 entregas, ≥10 fallidas y ≥85 % de
   fallo, Kapso pone el webhook en `active: false`**, marca las pendientes como fallidas y
   manda correo a todos los miembros.
4. **No vuelve a intentar hasta que alguien lo rehabilita a mano.**

O sea: encender el interruptor sin tocar el código apaga el agente entero en un cuarto de
hora, y no se recupera solo. No es un riesgo teórico: son dos `return` en el archivo.

### 5.3 El procedimiento seguro

**Primero el código, se despliega, se comprueba, y hasta entonces el interruptor.**

| # | Cambio | Por qué |
|---|---|---|
| 1 | `batchHeader` deja de ser fatal: devuelve el tamaño del lote en vez de tumbar la petición | Es el primero de los dos cerrojos |
| 2 | `parseKapsoV2` aprende la forma de lote: `batch: true` y `data: [...]`, y devuelve la lista de mensajes | Es el segundo cerrojo |
| 3 | **Una entrega sella un solo mensaje: el último del lote.** Los textos de los anteriores viajan como contenido dentro del `initial_data` que se manda a Kapso | Ver abajo: no hay alternativa barata |
| 4 | Se contesta **200 siempre** que el lote se haya podido leer, aunque la admisión lo rechace | Kapso espera un 200 por lote entero; un 422 por un mensaje raro tumba la entrega completa |
| 5 | Se deja el lote **por conversación** y con ventana chica (5 a 8 s) y tope chico | Son dos mecanismos que actúan en puntos distintos. El `message_debounce_seconds` del workflow (def. **1**) **ya está encendido** y agrupa lo que Kapso inyecta o reanuda dentro de la ejecución; subirlo es gratis y ayuda de ese lado. Pero **no agrupa las entregas a nuestro webhook**, que llegan una por mensaje: eso sólo lo hace el buffering del webhook, que es el que está apagado |

**El punto 3 es el que no es obvio, y tiene evidencia dura.** Un lote lleva **una sola**
cabecera `x-idempotency-key` para N mensajes, y en la base hay:

```sql
CREATE UNIQUE INDEX uq_whatsapp_inbound_delivery
  ON public.whatsapp_inbound_messages USING btree (webhook_delivery_key);
```

Si el manejador recorriera el lote registrando cada mensaje con esa misma llave, el segundo
chocaría contra el índice, `agent_register_inbound_context` encontraría un solo candidato
—el primer mensaje—, compararía `message_sid` y no cuadraría, y levantaría
`REPLAY_MISMATCH`, que el manejador traduce a **409**. Un 409 es no-200: fallo de entrega,
reintentos, y camino a la pausa automática.

Se podría derivar una llave por mensaje (`<x-idempotency-key>:<message.id>`, cabe de sobra
en los 255 caracteres de la columna y no necesita migración), pero entonces el primer
mensaje del lote abre el turno y **todos los demás rebotan con `TURN_BUSY`** y se tiran,
que es exactamente el defecto que veníamos a arreglar.

Por eso: **un lote es una solicitud**. Se sella el último mensaje —que es el que las guardas
de «hay un mensaje posterior» de `agent_bind_inbound_execution` y `agent_mark_inbound_waiting`
esperan ver— y los anteriores viajan como texto dentro de la misma solicitud. Es más simple,
es lo que pidió el dueño, y no toca ni una migración.

**Un riesgo que hay que dejar escrito y aceptar:** ingeniería de Kapso confirmó que un lote
listo para enviar puede tratarse como basura de limpieza antes de crear el registro de
entrega, y **el lote entero desaparece sin dejar fila**. Tenerlo apagado nos protegía de
eso. Encenderlo cambia «perder el segundo mensaje de una ráfaga, siempre» por «perder un
lote completo, rara vez». Con la ventana en 5-8 segundos el intercambio vale la pena, pero
es un intercambio, no una mejora limpia.

---

## 6. Qué se puede tirar del diseño actual

Si agendar y reprogramar dejan de ir por formulario, se va el formulario **entero** y toda
su maquinaria. Lo que sigue nombra archivo y sección.

### 6.1 Se va completo

| Qué | Dónde |
|---|---|
| **El documento del formulario, entero** — las dos pantallas, el Flow JSON, la función de datos, las tres rutas del servidor, el calendario barato de 60 días, el cierre, el ciclo de publicación y la lista de comprobación de Meta | `docs/diseno/04-formulario.md` (1 400+ líneas) |
| **La herramienta `abrir_formulario`** con su descripción y su esquema | `02-herramientas.md` §1.3 |
| **La operación `open_booking_flow`** y su ruta `/workflow/open-booking-flow` | `02` §5.1, `06` §3.3, `agent_tool_gateway/handler.ts` (`FUTURE_AGENT_ROUTES`) |
| **Las cuatro operaciones de `flow_data_exchange`** del portero (`flow_list_services`, `flow_get_eligibility`, `flow_get_availability`, `flow_create_appointment`) y la superficie entera | `private.agent_claim_tool_call`, `02` §5.1 |
| **`flow_reschedule_appointment`**, que iba a agregarse y ya no hace falta | `02` §5.2 cambio 10 |
| **Las cuatro rutas `/flow/*`** declaradas en el gateway y las dos que iban a sustituirlas (`/flow/cuando`, `/flow/confirmar`) | `agent_tool_gateway/handler.ts`, `04` §5, `06` §3.2 |
| **El resolvedor del `flow_token`** y todo el tipo de identificador `flow`. Ojo: no vive sólo en la documentación — es un renglón vivo de la matriz de vigencias del `private.agent_issue_option_handle` **desplegado** (`'flow' … interval '15 minutes'`), así que se borra en la misma edición que sube la vigencia del hueco | `02` §3, `06` §1.3, `01` §2.5 fila 3, y la matriz desplegada |
| **La maniobra `cancel_then_open_booking_flow` entera**: su pareja del portero, su ruta `/tools/appointments/cancel-then-book`, el `saga_state`, el `mutation_limit = 2` y el ordinal forzado a 8. Cancelar-y-reagendar por texto son dos gestiones, cada una con su turno | `private.agent_claim_tool_call`, `private.agent_finalize_tool_call`, `agent_tool_gateway/handler.ts` |
| **La migración `20260825006000_agent_formulario.sql`**, que todavía no se escribe | paso 9 de `00` §5 y `06` §1.1 |
| **`agent_open_booking_flow_from_workflow`**, que tampoco se escribe | `06` §1.3 |
| **Las dos funciones privadas de Kapso ya desplegadas** como Cloudflare Workers: `agenda-psi-flow-agendar` y `agenda-psi-flow-reprogramar` | `06` §4.6 — el conteo de Workers vuelve a 3 de 5, con dos libres |
| **Los dos Flows de WhatsApp** y todo el trámite de publicación con Meta | `06` §4.7, `04` §8 y §9 |

### 6.2 Se reescribe

| Qué | Dónde | En qué se convierte |
|---|---|---|
| «Agendar y mover van por formulario, y la cita nace ahí adentro» | `00` §3.3 | «Agendar y mover van por conversación, y la cita nace en la mutación» |
| «Lo que la paciente toca dentro del formulario no gasta presupuesto» | `00` §3.4 | El §4 de este documento: la cuenta con el turno abierto |
| La tabla de seis herramientas y once operaciones | `00` §1 | **Siguen siendo seis, no cinco.** Sale `abrir_formulario`, pero entran las dos cosas que el formulario hacía por dentro y ahora hay que hacer en el chat: ver horarios y reservar. El catálogo queda en `abrir_expediente`, `ver_horarios`, `reservar` (agendar, o mover si viene la cita que se cambia), `gestionar_cita` (confirmar, cancelar, cambiar modalidad), `registrar_comprobante` y `responder_con_texto_fijo`. Con reseña, siete |
| La tabla de presupuesto («Agendar o mover: 3») | `00` §1 | La tabla de §4.2 de aquí |
| Los nodos M, N, O, P, Q, R del grafo | `00` §2 | Desaparecen; el ciclo de espera se queda pero lo alimenta el chat |
| Los cambios 3, 10, 11, 21, 22, 23, 24 y 25 de la tabla de cambios | `00` §4.2 | Se retiran o cambian de sentido |
| «Por qué el formulario no necesita nodo» | `01` §2.4 | Se retira |
| «La vuelta del formulario» completa | `01` §5 (5.1 a 5.4) | Se retira; el aviso a la profesional de §5.4 **se conserva** y se muda a las mutaciones conversacionales |
| «El formulario abandonado» | `01` §6.3 | Se sustituye por «la conversación abandonada»: el turno expira a los 30 minutos y no queda nada a medias |
| «Idempotencia en el formulario» | `01` §7.2 | Se retira; queda la del nodo del agente, §7.1 |
| «Las cuatro operaciones de conversación que el formulario ya cubre» | `01` §8.10 | **Se invierte**: esas cuatro vuelven |
| «Por qué la reserva ocurre dentro del formulario» y «Los lectores del formulario no reclaman» | `06` §2.2 y §2.3 | Se retiran; la reserva vuelve al portero con su ordinal |
| El par «cierre contra espera» | `05` §3.1 | **No se retira, cambia de dueño**: ya no lo provoca el formulario sino la conversación de agendar, que también duerme el turno |
| Agendar y reprogramar en la matriz del dinero | `03` §1.1 y §1.4 | El punto donde nace la cita deja de ser el formulario y pasa a ser la mutación conversacional. La matriz de estados **no cambia** |

### 6.3 Lo que NO se tira, aunque parezca del formulario

Esto es lo importante de la lista:

- **`enter_waiting`, `sync_waiting`, `agent_mark_inbound_waiting` y el estado
  `waiting_external`.** No son del formulario: son lo que mantiene vivo un turno entre dos
  mensajes de ella. Agendar por texto los necesita **más** que el formulario, porque son lo
  único que evita que los identificadores mueran a media conversación (§4.2). Tirarlos con
  el formulario sería el error más caro de todo el cambio.
- **`agent_get_availability_from_workflow` y su pareja `('agent_node','get_availability')`
  en el portero.** Es la pieza central de la versión conversacional, y **el parche del
  portero que hoy está planeado en `06` §2.4 la borra** junto con las ocho lecturas sueltas,
  porque suponía que el expediente lo absorbía todo. El expediente no puede absorber la
  disponibilidad: se pide por día y se pide varias veces en la misma gestión. Lo mismo con
  `('agent_node','reschedule_appointment')`, que ese parche mandaba al formulario. Si esas
  dos parejas se aplican tal como están escritas, agendar y mover por texto salen con
  `TOOL_NOT_ALLOWED`.
- **El cerrojo del dinero, la cancelación tardía, el prepago con su cron y el contrato de
  avisos.** Nada de `03-dinero.md` depende del formulario salvo dónde nace la cita.
- **Los identificadores con etiqueta.** Sin formulario importan más, no menos: son la única
  forma que tiene el modelo de referirse a una cita concreta.

---

## 7. Lo que este puente implica, en cinco frases

1. **La versión conversacional de agendar y reprogramar ya está escrita**
   (`agent_create_appointment_from_workflow`, `agent_reschedule_appointment_from_workflow`,
   `agent_get_availability_from_workflow`), **sus rutas ya están escritas en el gateway** y el
   permiso de `create_appointment` **también está escrito**. Nada de eso está aplicado: en la
   base desplegada sólo viven las trece funciones de plomería del agente, y el gateway
   desplegado contesta cuatro rutas. Lo que de verdad hay que vigilar no es una línea que
   falte, sino **dos que el parche planeado del portero borra** —`get_availability` y
   `reschedule_appointment`— más el expediente, que no está escrito.
2. **La cuenta cierra**: agendar por texto gasta 5 de 8 llamadas en el caso normal y 8 en el
   peor, siempre que la gestión completa viva en **un solo turno abierto**.
3. **El tope que muerde no es el de llamadas, es el de cinco turnos en cinco minutos**, y
   sólo muerde si el agente cierra entre pasos. La forma correcta es no cerrar.
4. **El agrupamiento hay que encenderlo, pero después del código**: hoy dos `return` en el
   webhook contestan 422 a cualquier lote, y eso apaga el webhook entero en quince minutos.
   Y hay una palanca gratis que se puede mover antes: subir el `message_debounce_seconds` del
   workflow, que ya está encendido.
5. **Se va todo el formulario menos la espera.** `04-formulario.md` completo, dos Workers,
   dos Flows, seis operaciones del portero —las cuatro de `flow_data_exchange`, más
   `open_booking_flow` y la maniobra `cancel_then_open_booking_flow`— y una migración que ya
   no hay que escribir; pero
   `waiting_external` se queda y se vuelve el corazón del diseño nuevo.
