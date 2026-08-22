# `agent_reschedule_appointment`

Tipo: `command`
Actor: gateway service-only

## Objetivo

Reprogramar una sola cita específica, conservando el alcance de ocurrencia.

## Entrada externa

Modelo: `{appointment_token,new_starts_at_local,new_modality?,confirmed:true}`. Interno: `(session_id uuid, appointment_option_handle uuid, new_starts_at_local text, new_modality public.modality?, command_id uuid) -> jsonb`.

## Contexto inyectado

Tenant/turno/handle/command ID; timezone y políticas DB.

## Lee

`patients`, links, appointment/payment, service, schedules/blocks/connections, policies, `command_log`, serie solo para identificar scope.

## Escribe

Una cita, consecuencias/eventos/command log. **Nunca escribe `recurrence_series`/never writes `recurrence_series`** ni otra cita.

## Validaciones

Confirmación, `patients.patient_status='active'`, token/tenant, cita futura/reprogramable, fecha exacta `YYYY-MM-DDTHH:mm:ss` sin Z/offset, timezone IANA/DST, modalidad, lead y disponibilidad.

## Flujo lógico

Tomar **locks** profesional/recurso/cita/pago en orden estable; revalidar todo bajo lock; derivar economía; cambiar una ocurrencia; registrar comando y DTO.

## Transacción/locks/idempotencia

Transacción con anti-overlap/constraint y `command_id` idempotente. La selección previa no reserva. Unknown commit se reconcilia, no se repite con otra key.

## Salida redactada

`{outcome,service_name,old_starts_at_local,new_starts_at_local,timezone,modality,consequence_code}`.

## Errores seguros

`PATIENT_INACTIVE`, `INVALID_LOCAL_TIME`, `SLOT_NO_LONGER_AVAILABLE`, `APPOINTMENT_NOT_RESCHEDULABLE`, `CONFLICT`, `UNKNOWN_OUTCOME`.

## No debe hacer

No modificar series/otra ocurrencia, no confiar en fees/precio, no enviar URL ni template antes del commit.

## Pruebas mínimas

Éxito/replay, ocurrencia con series_id, DST, dos slots concurrentes, política/pago, inactivo y timeout.

## Trazabilidad

DEC-07, DEC-08, DEC-23; SCN-30, SCN-32.
