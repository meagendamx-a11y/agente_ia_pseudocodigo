# `agent_get_availability`

Tipo: `query`
Actor: gateway/Flow service-only

## Objetivo

Calcular slots vigentes para un servicio, día y modalidad sin reservarlos.

## Entrada externa

Modelo/Flow: `{service_token, day:YYYY-MM-DD, modality}`. Interno: `(session_id uuid, service_option_handle uuid, day date, modality public.modality) -> jsonb`.

## Contexto inyectado

Handle/sesión/turno verificados y timezone IANA del profesional.

## Lee

`patients`, `whatsapp_links`, `services`, schedules, blocks, connections, policies, appointments y recurrence eligibility.

## Escribe

Cero escrituras de dominio; solo option handles técnicos de slot/Flow.

## Validaciones

Token/tenant, `patients.patient_status='active'`, servicio/eligibility actual, day acotado, **lead** minutes, **modality** soportada y cálculo **anti-overlap/solapamiento**.

## Flujo lógico

1. Repetir eligibility y precio.
2. Interpretar horarios en timezone profesional.
3. Sustraer bloqueos, citas y recursos presenciales compartidos.
4. Aplicar duración, lead y política.
5. Emitir opciones opacas de slot con local wall time y expiry 5m.

## Transacción/locks/idempotencia

La consulta **no reserva/does not reserve** un slot. Create/reprogram debe repetir validaciones bajo lock y constraint.

## Salida redactada

`{day,timezone,slots:[{slot_token,starts_at_local,label}],reason_code?}` sin IDs.

## Errores seguros

`TOKEN_INVALID`, `PATIENT_INACTIVE`, `NOT_ELIGIBLE`, `MODALITY_NOT_SUPPORTED`, `NO_AVAILABILITY`, `INVALID_DAY`.

## No debe hacer

No crear hold/cita, no prometer disponibilidad futura, no aceptar timezone/IDs del cliente.

## Pruebas mínimas

Slots, sin disponibilidad, lead exacto, modalidad, bloqueos/citas/consultorio, DST, recurrencia e inactivo.

## Trazabilidad

DEC-04, DEC-05, DEC-06, DEC-08; SCN-13..SCN-15, SCN-26.
