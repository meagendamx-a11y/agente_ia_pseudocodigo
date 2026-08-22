# `agent_get_booking_eligibility`

Tipo: `query`
Actor: gateway/Flow service-only

## Objetivo

Revalidar si el servicio opaco puede agendarse ahora para la relación activa.

## Entrada externa

Modelo: `{ "service_token":"opaque" }`. Interno: `(session_id uuid, service_option_handle uuid) -> jsonb`.

## Contexto inyectado

Gateway verifica token HMAC y entrega handle/sesión/turno.

## Lee

`patients`, `whatsapp_links`, `services`, policies, price override y recurrencia activa.

## Escribe

Cero escrituras de dominio; no emite slot.

## Validaciones

Token vigente/tenant, `patients.patient_status='active'`, servicio activo y políticas habilitadas.

## Flujo lógico

Resolver servicio, bloquear si `has_active_recurrence` del mismo servicio, derivar modalidades/precio/lead time seguros.

## Transacción/locks/idempotencia

Query idempotente; no bloquea ni reserva citas.

## Salida redactada

`{eligible,reason_code,modalities,effective_price,duration_minutes}`.

## Errores seguros

`TOKEN_INVALID`, `PATIENT_INACTIVE`, `SERVICE_NOT_AVAILABLE`, `ACTIVE_RECURRENCE_EXISTS`, `BOOKING_DISABLED`.

## No debe hacer

No confiar en precio/modalidad del cliente, crear recurrencia/cita ni revelar IDs.

## Pruebas mínimas

Elegible, serie activa, servicio deshabilitado, token extranjero/expirado, paciente inactivo.

## Trazabilidad

DEC-04, DEC-05, DEC-08; SCN-13, SCN-25.

