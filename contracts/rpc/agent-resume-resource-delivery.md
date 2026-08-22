# `agent_resume_resource_delivery`

Tipo: `command`
Actor: gateway service-only

## Objetivo

Liberar únicamente recursos ya asignados y pendientes desde una invitación exactamente correlacionada.

## Entrada externa

Modelo: `{invitation_token,confirmed:true}`. Interno: `(session_id uuid, invitation_option_handle uuid, command_id uuid) -> jsonb`.

## Contexto inyectado

El inbound autenticado aporta `reply_to_provider_message_id`; la admisión resuelve `whatsapp_outbox` y su `batch_id`, y acuña el token lazy ligado al turno.

## Lee

`patients`, `whatsapp_links`, `whatsapp_inbound_messages`, `whatsapp_outbox`, appointments, resource batches/assignments/jobs y `command_log`.

## Escribe

Assignments ya existentes `waiting_for_patient -> queued`, jobs permitidos y command/eventos. No crea asignaciones.

## Validaciones

- `patients.patient_status='active'`, tenant, sesión/turno/token vigentes.
- `reply_to_provider_message_id` mapea exactamente una outbox `patient_resource_delivery` del mismo recipient/target y payload con `batch_id` válido.
- Appointment fuente `attended`; batch vigente; assignment en `waiting_for_patient`.
- Si falta/purgó/ambigua correlación, **falla cerrado/fail closed**.

## Flujo lógico

1. Resolver/consumir token bajo lock.
2. Revalidar outbox→batch→appointment attended.
3. Mover solo `waiting_for_patient -> queued`.
4. Crear/asegurar job únicamente para cada assignment ya `queued`; `sent` no requeue y `sending` queda intacto.
5. Sellar resumen.

## Transacción/locks/idempotencia

Locks de token/batch/assignments, unique job por assignment y `command_id` idempotente. Replay devuelve el resumen; no duplica jobs.

## Salida redactada

`{outcome,queued_count,already_sent_count,in_progress_count,failed_closed_count}` sin batch/resource IDs.

## Errores seguros

`PATIENT_INACTIVE`, `INVITATION_INVALID`, `INVITATION_EXPIRED`, `CORRELATION_MISSING`, `APPOINTMENT_NOT_ATTENDED`, `NOTHING_PENDING`, `UNKNOWN_OUTCOME`.

## No debe hacer

**Nunca selecciona o solicita recursos/never selects or requests resources**; no busca batches históricos, no cambia `sent/sending`, no expone outbox payload ni afloja el trigger de jobs.

## Pruebas mínimas

Correlación exacta/ausente/ambigua/purgada; attended/no; waiting/queued/sending/sent; replay/carrera; inactivo y tenant distinto.

## Trazabilidad

DEC-08, DEC-20, DEC-23; SCN-35, SCN-36.

