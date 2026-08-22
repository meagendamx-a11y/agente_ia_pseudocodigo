# `agent_get_next_appointment`

Tipo: `query`
Actor: gateway service-only

## Objetivo

Obtener la próxima cita específica del paciente.

## Entrada externa

Modelo: `{}`. Interno: `(session_id uuid) -> jsonb`.

## Contexto inyectado

Sesión/turno/relación activa.

## Lee

`patients`, `whatsapp_links`, `appointments`, `services`.

## Escribe

Cero escrituras de dominio; emite un option handle técnico.

## Validaciones

`patients.patient_status='active'`, tenant, scheduled y predicado literal `starts_at > now()`.

## Flujo lógico

Ordenar por starts_at y tomar una; si hay empate/correlación ambigua, fallar seguro y listar opciones.

## Transacción/locks/idempotencia

Query idempotente; no reserva ni modifica.

## Salida redactada

`{appointment_token,service_name,starts_at_local,timezone,modality,is_recurring_occurrence}`.

## Errores seguros

`NO_UPCOMING_APPOINTMENT`, `PATIENT_INACTIVE`, `AMBIGUOUS_APPOINTMENT`.

## No debe hacer

No incluir URL, IDs, notas ni otras ocurrencias de una serie.

## Pruebas mínimas

Futura/pasada/ahora, empate, serie, otro tenant e inactivo.

## Trazabilidad

DEC-07, DEC-10; SCN-17, SCN-19.

