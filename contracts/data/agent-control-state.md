# Estado de control del agente

Tipo: `data contract`
Actor: sistema/service-only

## Objetivo

Separar admisión, autorización durable, turno, opciones opacas e idempotencia de
la memoria del LLM. Este documento refleja el SQL construido en Tasks 2–4; no
afirma que la migración ya esté desplegada.

## Tablas de control as-built

| Tabla | Responsabilidad |
|---|---|
| `public.whatsapp_inbound_messages` | Ledger legacy ampliado con delivery, hash, target, admisión, ejecución y refs de control. `message_sid` sigue siendo la identidad del mensaje. |
| `public.agent_sessions` | Capacidad por conversación, identidad autenticada, tenant opcional y expiración. |
| `public.agent_turns` | Estado de una gestión y presupuestos por turno. |
| `public.agent_tool_calls` | Claims, ordinales, command IDs y resultados redactados sellados. |
| `public.agent_option_tokens` | Handle aleatorio y binding interno; nunca bearer, MAC o secreto. |
| `private.agent_runtime_targets` | Kill switch DB por `phone_number_id`; inicia vacío/default-off. |
| `private.agent_token_key_registry` | Metadatos no secretos `key_id`, `can_issue` y `verify_until`. |

Las tablas de control tienen RLS sin policies y sin DML directo para
`public`, `anon`, `authenticated` ni `service_role`. Solo funciones
`SECURITY DEFINER SET search_path=''`, propiedad de
`agenda_psi_agent_owner`, cruzan esa frontera.

## Entrada externa

Solo el sobre Kapso autenticado. Ningún límite, tenant, ID de dominio,
`command_id`, stable key ni estado se acepta desde el modelo.

## Contexto inyectado

Teléfono/target/conversación autenticados, refs UUID de control, execution
sellada y tenant resuelto por DB. Los wrappers inyectan metadata allowlisted y
stable keys; el modelo nunca lo hace.

## Lee

Las siete tablas de control de la matriz anterior y, solo para revalidar
visibilidad, `whatsapp_links`, `patients`, `services` y `appointments`.

## Escribe

Ledger, sesión, turnos, claims, option tokens y receipt marker exacto. Este
control no escribe dominio.

## Validaciones e invariantes

- `agent_sessions` es una capacidad, no memoria conversacional. Solo un inbound
  verificado con relación activa exacta mueve `last_verified_inbound_at`; tools
  y lifecycle nunca extienden su expiración de 24 horas.
- `uq_agent_turns_one_open_conversation` limita a un turno
  `admitted|active|waiting_external|completing` por conversación.
- Un turno útil vence al menor de sesión y 30 minutos, o por 30 minutos de
  inactividad. Expirar o limpiar nunca concede permisos.
- Los helpers revalidan sesión, turno, teléfono, target, tenant y visibilidad
  actual antes de emitir o resolver una capacidad.
- `uq_agent_tool_calls_one_pending_mutation` arbitra una sola mutación pendiente.

## Lifecycle

El camino permitido es
`admitted -> active -> waiting_external -> active -> completing -> completed`.
Solo `waiting_external` puede reanudarse con un inbound nuevo y la ejecución ya
sellada. Un turno vigente `admitted`, `active` o `completing` produce
`TURN_BUSY`; `failed`, `rejected` y `expired` son terminales.

`agent_mark_inbound_waiting` y `agent_mark_inbound_completing` exigen cero
claims pendientes. `agent_complete_inbound` exige exactamente el claim técnico
pendiente `(workflow_internal,complete_inbound,false)` y después permite que ese
claim se finalice aun con el turno ya `completed`.

## Flujo lógico

1. Admission sella ledger, relación, límites, sesión y turno.
2. Bind sella execution; waiting/completing/complete son las únicas transiciones
   públicas posteriores.
3. Claim/finalize reserva y sella cada operación.
4. Issue/resolve mantiene handles opacos con revalidación actual.
5. Estados terminales permanecen como auditoría/replay hasta la purga futura.

## Presupuesto y saga

- Hay **8 llamadas útiles** con `ordinal 1..8`. Cada claim útil incrementa
  `tool_call_count` y puede refrescar actividad sin rebasar la sesión.
- `complete_inbound` es el único claim técnico con `ordinal 9`; no cuenta contra
  las ocho llamadas, no refresca actividad/TTL y existe como máximo una vez por
  turno.
- Turno normal: `mutation_limit=1`, `committed_mutation_count=0` y
  `saga_state='normal'`.
- `cancel_then_open_booking_flow` solo puede reclamarse con conteo útil `<=3`.
  Su claim fija `cancel_claimed/2/0`; un rechazo pre-write restaura `normal/1/0`.
- Cancelación confirmada pasa a `awaiting_replacement_create/2/1`. Lecturas del
  Flow pueden ocupar hasta el ordinal 7; `flow_create_appointment` reserva el
  **ordinal 8**. Su rechazo mantiene la espera y su commit conserva
  `awaiting_replacement_create/2/2` como historial terminal.
- La tercera mutación se bloquea con `MUTATION_BLOCKED`. Un outcome `unknown`
  sella `unknown_blocked`; Tasks 2–4 no intentan reconciliarlo.
- `command_id` se genera en DB para toda mutación y para el control técnico
  `(agent_node,select_relationship,false)`; se conserva en replay exacto.

## Tokens de opción

La tabla admite únicamente las ternas estructurales:

| kind | entity_type | TTL min | one_time |
|---|---|---:|---:|
| `relationship` | `whatsapp_link` | 10 | true |
| `service` | `service` | 15 | false |
| `appointment` | `appointment` | 15 | false |
| `slot` | `service_slot` | 5 | true |
| `flow` | `turn` | 15 | true |

La fila guarda `random_handle`, binding, stable key y `key_id`; nunca guarda el
token bearer completo. El handle estable permite que Edge regenere el mismo
bearer HMAC después de un reinicio: `v1.<key_id>.<random_handle>.<HMAC>`. Una emisión
nueva requiere `can_issue=true`; replay estable usa la clave original solo si
`verify_until` todavía cubre el expiry sellado. Una fila stable expirada nunca
se sobrescribe.

## Transacción/locks/idempotencia

- Admission: ledger/replay primero; locks teléfono→profesionales ordenados→
  conversación/link; decisión con tiempo server-side posterior a locks.
- Claim/finalize: `turn -> tool`; uniques `(turn_id,tool_call_key)` y
  `(turn_id,ordinal)` sellan replay.
- Issue/resolve: `session -> turn -> token`; consumo one-time es atómico.
- Lifecycle: `inbound -> turn`; callbacks viejos no pueden retroceder un inbound
  posterior del mismo turno.

## Salida redactada

Admission y control público devuelven solo refs UUID de control. Los IDs de
paciente, profesional y entidad que devuelve resolve quedan dentro del wrapper
privado y nunca se serializan al modelo.

## Errores seguros

`INVALID_INBOUND_CONTEXT`, `REPLAY_MISMATCH`, `TURN_BUSY`,
`TOOL_BUDGET_EXCEEDED`, `MUTATION_BLOCKED`, `TOKEN_EXPIRED` y los reasons
específicos enumerados en cada función. Ninguno incluye valores recibidos.

## No debe hacer

- Guardar narrativa clínica, texto/raw payload, secretos o bearer completo.
- Dar DML directo de tablas de control a `service_role`.
- Consultar outbox, recursos, pagos, citas o Storage durante admission.
- Extender sesión desde tools, outbound o lifecycle.

## Pruebas mínimas

Replay exacto/mismatch; RLS/ACL; 8 útiles y ordinal 9; una mutación pendiente;
todas las transiciones de saga; matriz de cinco tokens; consumo concurrente;
lifecycle y callbacks obsoletos. El arnés secuencial no sustituye una prueba
multisesión de carreras/deadlocks antes del deploy.

## Trazabilidad

DEC-08, DEC-23, DEC-24, DEC-25; SCN-03, SCN-04, SCN-28, SCN-29, SCN-32.
