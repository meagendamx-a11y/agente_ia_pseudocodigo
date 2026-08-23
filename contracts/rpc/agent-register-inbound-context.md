# `agent_register_inbound_context`

Tipo: `command`
Actor: Edge inbound autenticado (`service_role`)

## Objetivo

Sellar el ledger, replay, identidad, relación, límites y turno en una sola
transacción antes de iniciar cualquier workflow o modelo.

## Firma SQL as-built

`agent_register_inbound_context(p_webhook_delivery_key text,p_provider_message_id text,p_reply_to_provider_message_id text,p_payload_sha256 text,p_sender_phone_e164 text,p_target_phone_number_id text,p_kapso_contact_id text,p_business_portfolio_id text,p_business_scoped_user_id text,p_kapso_conversation_id text,p_provider_received_at timestamptz) -> jsonb`

Es `SECURITY DEFINER SET search_path=''`, propiedad de
`agenda_psi_agent_owner`; solo `service_role` tiene `EXECUTE` y no recibe DML
directo sobre control.

## Entrada externa

Los 11 parámetros de la firma. Edge solo los construye después de autenticar el
raw body; ninguno es visible/editable por el modelo.

## Contexto inyectado

Los 11 argumentos provienen del sobre ya autenticado. `received_at` y el tiempo
de decisión se obtienen server-side; `provider_received_at` nunca gobierna
ventanas, TTL ni receipt markers.

## Lee

- `private.agent_runtime_targets`.
- `public.whatsapp_inbound_messages`, `public.whatsapp_links`,
  `public.patients`, `public.agent_sessions`, `public.agent_turns`.

## Escribe

- Ledger `public.whatsapp_inbound_messages`.
- Sesión/turno de control.
- Solo `whatsapp_links.last_inbound_at` para la relación activa exacta.

Cero escrituras de dominio.

## Validaciones

- Requeridos no vacíos y con máximo 255 caracteres; opcionales `NULL` o no
  vacíos con el mismo límite.
- `p_payload_sha256` es exactamente 64 hex minúsculas.
- Teléfono E.164 `^\+[1-9][0-9]{7,14}$`.
- Timestamp no nulo y no más de cinco minutos en el futuro.
- Portfolio y BSUID son ambos nulos o ambos presentes. Nunca se infiere
  portfolio desde parent BSUID.
- Input inválido: SQLSTATE `22023`, mensaje fijo `INVALID_INBOUND_CONTEXT`.
  Conflicto de replay: SQLSTATE `22000`, mensaje fijo `REPLAY_MISMATCH`.

## Resolución de identidad

El teléfono siempre es autoridad. El narrowing exacto es:

- `wl.phone = p_sender_phone_e164`;
- contacto: input nulo, stored nulo o igualdad;
- portfolio/BSUID: input pair nulo, stored pair nulo o igualdad de ambos;
- join compuesto `wl.patient_id=p.id` y
  `wl.professional_id=p.professional_id`, con
  `patients.patient_status='active'`.

El resultado interno `relationship_state` es exactamente
`unresolved|public|tenant|ambiguous`: target rechazado usa `unresolved`; cero
relaciones usa `public`; una usa `tenant`; varias usa `ambiguous` sin exponer
IDs.

## Flujo lógico

1. Capturar `received_at` y registrar las dos identidades únicas: delivery key y
   `message_sid=p_provider_message_id`.
2. En conflicto, bloquear candidatos por `id` estable. Replay null-safe exacto
   devuelve el resultado sellado antes de allowlist y rate; cualquier campo
   distinto produce `REPLAY_MISMATCH`.
3. Rechazar target ausente/deshabilitado como
   `rejected/TARGET_NOT_ENABLED`. La tabla inicia vacía/default-off.
4. Bloquear en orden teléfono→profesionales UUID ordenados→conversación→links,
   revalidar relaciones y recién entonces capturar el tiempo de decisión.
5. Bloquear sesión/turno. Phone/target o identidad no-null distinta se sella
   `rejected/SESSION_IDENTITY_MISMATCH` sin refresh.
6. Expirar primero un turno cuyo TTL terminó o cuya actividad supera 30 minutos.
7. Un `completing` todavía vigente devuelve `rejected/TURN_BUSY` antes de limpiar
   tenant. Para relación ahora `public|ambiguous`, expirar un viejo turno tenant
   `admitted|active|waiting_external` y limpiar la pareja de sesión.
8. Un turno restante y consistente `admitted|active|completing` devuelve
   `TURN_BUSY`. Solo un `waiting_external` vigente, con ejecución ya sellada,
   puede producir `resumed/RESUMED`.
9. Antes de admitir/reanudar, aplicar ventanas móviles. En rate limitado no se
   crea turno ni se refresca actividad/TTL; la limpieza stale del paso 7 sí se
   conserva.
10. Si no hay turno resumible, crear uno `admitted` tenant o tenantless. TTL:
    `least(session.expires_at,decision_time+30 minutes)`.
11. Sellar ledger y el DTO exacto en la misma transacción.

## Límites atómicos

- 10 admitted/resumed inbound por teléfono en 5 minutos.
- 5 turnos nuevos por teléfono en 5 minutos.
- 30 turnos nuevos por teléfono en 24 horas.
- 100 turnos nuevos por profesional resuelto en 24 horas.
- Replay no cuenta; resume sí usa cuota inbound pero no cuota de turno nuevo.
- El primer limitado por teléfono en 15 minutos sella `notice_claimed=true`;
  posteriores sellan false. Esta RPC no envía el aviso.

Reasons exactos de límite:
`RATE_LIMIT_INBOUND_5M`, `RATE_LIMIT_TURN_PHONE_5M`,
`RATE_LIMIT_TURN_PHONE_24H`, `RATE_LIMIT_TURN_PROFESSIONAL_24H`.

## Receipt markers

Solo una relación activa exacta y una identidad de sesión consistente permiten
actualizar monotónicamente `whatsapp_links.last_inbound_at` e inicializar/mover
`agent_sessions.last_verified_inbound_at`. En `rate_limited` y `TURN_BUSY` el
marker de sesión solo cambia si esa sesión ya existe, y nunca se refrescan
expiración ni actividad.
Target rechazado, identity mismatch, replay, public y ambiguous no actualizan
estos markers.

## Transacción/locks/idempotencia

Una transacción. Locks advisory con namespace propio y row locks estables;
uniques de delivery/provider y un único turno no terminal por conversación son
los árbitros finales. Core no comparte advisory locks, por lo que el update del
link vuelve a condicionar phone, narrowing y patient activo; cero filas falla
cerrado antes de tocar sesión/turno.

## Salida redactada

DTO exacto: `{status,reason,session_id,turn_id,relationship_state,notice_claimed,original_status}`.

- `status`: `admitted|resumed|rate_limited|replay|rejected`.
- `session_id` y `turn_id` son refs UUID de control, nunca IDs de dominio.
- `admitted|resumed` devuelve ambas refs; `rate_limited|rejected` las devuelve
  nulas.
- Normal usa `original_status=null`.
- Replay usa `status=replay`, `reason=EXACT_REPLAY`, conserva refs y
  `relationship_state` del resultado sellado, fija `notice_claimed=false` y
  expone el estado sellado solo en `original_status`.

Reasons normales exactos: `TARGET_NOT_ENABLED`, `TURN_BUSY`,
`SESSION_IDENTITY_MISMATCH`, `ADMITTED_TENANT`, `ADMITTED_PUBLIC`,
`ADMITTED_AMBIGUOUS`, `RESUMED` y los cuatro reasons de límite anteriores.

## Errores seguros

Excepciones: `INVALID_INBOUND_CONTEXT`, `REPLAY_MISMATCH`. Outcomes semánticos:
los reasons normales/límite enumerados arriba. Nunca incluyen input, teléfono,
provider IDs o hash.

## No debe hacer

- Iniciar/reanudar Kapso o llamar al LLM.
- Consultar/escribir colas de salida, pagos, citas, jobs, Storage o mutaciones de
  dominio.
- Crear option tokens o enriquecer `whatsapp_links`.
- Devolver teléfono, WAMID, texto/raw payload o IDs de paciente/profesional.

## Pruebas mínimas

Validación sin eco; target default-off; replay exacto y mismatch de cada campo;
0/1/N relaciones; identity mismatch; busy vs waiting resume; stale cleanup;
cuatro límites y cooldown; monotonic markers; DTO de siete keys; RLS/ACL. El
arnés secuencial no prueba carreras/deadlocks multisesión.

## Trazabilidad

DEC-08, DEC-16, DEC-20, DEC-24, DEC-25; SCN-03..SCN-08, SCN-11.
