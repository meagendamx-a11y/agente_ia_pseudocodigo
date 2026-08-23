# `agent_get_location`

Tipo: `query`
Actor: gateway service-only

## Objetivo

Explicar la ubicación de la próxima cita sin exponer enlaces ni datos privados.

## Entrada externa

Modelo: `{}`. Interno: `(session_id uuid) -> jsonb`.

## Contexto inyectado

Relación activa y próxima cita autorizada.

## Lee

`patients`, `whatsapp_links`, `appointments`, `professional_profiles`, conexiones de consultorio.

## Escribe

Cero escrituras de dominio.

## Validaciones

`patients.patient_status='active'`, próxima cita futura y ubicación pública vigente.

## Flujo lógico

Presencial: dirección pública y referencia aprobada. Online: indicar que no usa consultorio; si pregunta por enlace, usar la copy fija de que lo envía el profesional.

## Transacción/locks/idempotencia

Query idempotente, sin locks especiales.

## Salida redactada

`{modality,location_type,address_lines?,explanation_code}`; nunca meeting URL.

## Errores seguros

`NO_UPCOMING_APPOINTMENT`, `PATIENT_INACTIVE`, `LOCATION_NOT_CONFIGURED`.

## No debe hacer

No consultar/devolver enlace, domicilio privado, coordenadas o IDs.

## Pruebas mínimas

Presencial/online, sin dirección, sin próxima cita, inactivo y ubicación no pública.

## Trazabilidad

DEC-08, DEC-10; SCN-18, SCN-19.
