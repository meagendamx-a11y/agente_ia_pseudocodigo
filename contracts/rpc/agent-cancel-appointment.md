# `agent_cancel_appointment`

Tipo: `command`
Actor: gateway service-only

## Objetivo

Cancelar una cita futura específica aplicando consecuencias económicas de Core.

## Entrada externa

Modelo: `{appointment_token, confirmed:true}`. Interno: `(session_id uuid, appointment_option_handle uuid, command_id uuid) -> jsonb`.

## Contexto inyectado

Modo normal o operación fija de saga sellada en claim; el modelo no envía modo/límite.

## Lee

`patients`, `whatsapp_links`, `appointments`, `payments`, proofs, policies, events y `command_log`.

## Escribe

Una cita y consecuencias/eventos/command log definidos por Core.

## Validaciones

Confirmación explícita, `patients.patient_status='active'`, token/tenant, cita futura y cancelable; nunca confiar en fee/refund/payment method cliente.

## Flujo lógico

Resolver token; tomar row **lock** de cita/pago; revalidar estado/política; derivar consecuencias; cancelar una ocurrencia; sellar resultado. En saga, commit pasa a `awaiting_replacement_create`.

## Transacción/locks/idempotencia

Row locks y `command_id` único en una transacción idempotente. Rechazo pre-write de saga restaura normal/1; unknown outcome conserva reserva hasta reconciliar `command_log`.

## Salida redactada

`{outcome,status:cancelled,consequence_code,can_open_booking_flow}` sin contabilidad interna.

## Errores seguros

`PATIENT_INACTIVE`, `APPOINTMENT_NOT_CANCELABLE`, `CONFLICT`, `POLICY_BLOCKED`, `UNKNOWN_OUTCOME`.

## No debe hacer

No cancelar otra cita/serie, no aceptar `skip_to_next`, no inventar reembolso ni compensar si luego falla create.

## Pruebas mínimas

Éxito/replay, carrera confirm/cancel, políticas/pago, cita de otro tenant, inactivo, saga reject/commit/unknown.

## Trazabilidad

DEC-07, DEC-08, DEC-23; SCN-27..SCN-29, SCN-32.
