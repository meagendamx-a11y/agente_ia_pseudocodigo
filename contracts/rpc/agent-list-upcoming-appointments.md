# `agent_list_upcoming_appointments`

Tipo: `query`
Actor: gateway service-only

## Objetivo

Listar todas las citas futuras gestionables sin escoger silenciosamente una.

## Entrada externa

Modelo: `{}`. Interno: `(session_id uuid) -> jsonb`.

## Contexto inyectado

Sesión/turno/relación activa.

## Lee

`patients`, `whatsapp_links`, `appointments`, `services`, `payments`, `payment_proofs`.

## Escribe

Cero escrituras de dominio; emite option handles de cita por 15m.

## Validaciones

Revalidar `patients.patient_status='active'`, tenant y visibilidad. Solo `appointment_status='scheduled' AND starts_at > now()`.

## Flujo lógico

Ordenar ascendente; crear etiquetas con servicio/fecha/hora/modalidad; emitir tokens. Si hay más de una, el paciente debe elegir.

## Transacción/locks/idempotencia

Query sin reserva; handles estables por turno.

## Salida redactada

`{appointments:[{appointment_token,service_name,starts_at_local,timezone,modality}]}`.

## Errores seguros

`SESSION_EXPIRED`, `PATIENT_INACTIVE`, `NO_UPCOMING_APPOINTMENTS`.

## No debe hacer

No devolver IDs, notas, URLs o historial; no inferir selección.

## Pruebas mínimas

Cero/una/varias, orden, ahora exacto/pasado, otro tenant, inactivo.

## Trazabilidad

DEC-07, DEC-08; SCN-16.
