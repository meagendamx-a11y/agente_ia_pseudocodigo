# `agent_confirm_appointment`

Tipo: `command`
Actor: gateway service-only

## Objetivo

Confirmar una cita futura programada específica de forma idempotente.

## Entrada externa

Modelo: `{ "appointment_option_token":"opaque", "confirmed":true }`. Interno: `(session_id uuid, appointment_option_handle uuid, command_id uuid) -> jsonb`.

## Contexto inyectado

Gateway resuelve token, sesión/turno y command ID sellado.

## Lee

`patients`, `whatsapp_links`, `appointments`, `command_log`, políticas/eventos.

## Escribe

Cita exacta, evento/command log requeridos; no otra cita ni outbox genérico.

## Validaciones

Confirmación explícita; `patients.patient_status='active'`; token de cita **futura** y **programada/scheduled**; ownership; transición permitida.

## Flujo lógico

Resolver token, tomar **lock/bloqueo** de la cita, revalidar estado/tiempo/tenant, registrar command, confirmar y devolver DTO autoritativo.

## Transacción/locks/idempotencia

Row lock y `command_id` único en una transacción. Si ya está confirmada por el mismo comando, replay exitoso; conflicto externo devuelve estado seguro sin reescribir.

## Salida redactada

`{outcome:committed,appointment:{service_name,starts_at_local,timezone,modality,status:confirmed}}`.

## Errores seguros

`TOKEN_INVALID`, `PATIENT_INACTIVE`, `APPOINTMENT_NOT_FUTURE`, `INVALID_STATE`, `CONFLICT`, `UNKNOWN_OUTCOME`.

## No debe hacer

No confirmar por correlación textual, no cambiar pago/modalidad/serie, no enviar URL ni afirmar antes del commit.

## Pruebas mínimas

Éxito/replay, cita pasada/cancelada/otra relación, carrera con cancelación, inactivo y timeout tras commit.

## Trazabilidad

DEC-07, DEC-08, DEC-23; SCN-24, SCN-32.
