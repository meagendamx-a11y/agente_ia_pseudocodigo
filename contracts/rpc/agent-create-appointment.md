# `agent_create_appointment`

Tipo: `command`
Actor: Flow/gateway service-only

## Objetivo

Crear una cita ordinaria para un servicio elegible y un slot todavía disponible.

## Entrada externa

Flow/modelo seguro: `{service_token, starts_at_local, modality, confirmed:true}`. Interno: `(session_id uuid, service_option_handle uuid, starts_at_local text, modality public.modality, command_id uuid) -> jsonb`.

## Contexto inyectado

Sesión/turno/tenant, option handles y `command_id` sellado; precio/timezone/políticas vienen de DB.

## Lee

`patients`, `whatsapp_links`, `professionals`, `services`, pricing overrides, schedules, blocks, connections, appointments, policies y `command_log`.

## Escribe

Una `appointment`, su `payment` ordinario/eventos/command log según Core. No escribe series.

## Validaciones

- Confirmación explícita, `patients.patient_status='active'`, servicio/token/tenant y eligibility actual.
- `starts_at_local` es exactamente `YYYY-MM-DDTHH:mm:ss`, **sin Z/no Z** ni offset.
- Interpretar en `professionals.timezone` IANA; round-trip exacto y rechazo de hora DST inexistente o **ambigua/ambiguous**.
- Modalidad, lead time, schedules/blocks/resource y anti-overlap.

## Flujo lógico

1. Resolver tokens y hora local.
2. Tomar advisory/row **locks** estables por profesional y recurso presencial.
3. Revalidar paciente, servicio, recurrencia, política, horario y constraint de solapamiento.
4. Recalcular precio: free=0, preferencial, default. Congelar `agreed_price` **autoritativo/authoritative**.
5. Insertar cita/pago/eventos/command y devolver DTO.

## Transacción/locks/idempotencia

Todo dominio en una transacción; anti-overlap constraint decide carreras. `command_id` único hace la operación idempotente. El Flow no consume token hasta commit conocido; replay devuelve la misma cita. En saga solo se permite desde `awaiting_replacement_create` y cierra en count=2.

## Salida redactada

`{outcome:committed,service_name,starts_at_local,timezone,modality,effective_price,status}` para texto libre.

## Errores seguros

`PATIENT_INACTIVE`, `NOT_ELIGIBLE`, `INVALID_LOCAL_TIME`, `AMBIGUOUS_LOCAL_TIME`, `SLOT_NO_LONGER_AVAILABLE`, `CONFLICT`, `UNKNOWN_OUTCOME`.

## No debe hacer

No confiar en slot/precio/timezone cliente, no crear `appointment_created` en outbox, no crear/modificar `recurrence_series`, no devolver URL/IDs.

## Pruebas mínimas

Éxito/replay; dos creates concurrentes; stale slot; precio; DST; token extranjero; inactivo; saga segundo paso y unknown outcome.

## Trazabilidad

DEC-04..DEC-08, DEC-19, DEC-23; SCN-13..SCN-15, SCN-25, SCN-26, SCN-28, SCN-32.

