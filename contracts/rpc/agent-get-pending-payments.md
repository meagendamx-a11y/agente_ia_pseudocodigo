# `agent_get_pending_payments`

Tipo: `query`
Actor: gateway service-only

## Objetivo

Resumir sesiones con pago pendiente sin mezclar pago, comprobante y decisión profesional.

## Entrada externa

Modelo: `{}`. Interno: `(session_id uuid) -> jsonb`.

## Contexto inyectado

Relación activa.

## Lee

`patients`, `whatsapp_links`, `appointments`, `payments`, `payment_proofs`, payment events/policies.

## Escribe

Cero escrituras de dominio; option handles de cita solo cuando la acción es segura.

## Validaciones

`patients.patient_status='active'`, tenant, pago ordinario asociado y estados conocidos.

## Flujo lógico

Separar `actionable`, `not_yet_due` y `waiting_professional_decision`; cada elemento usa el DTO multi-eje del status específico.

## Transacción/locks/idempotencia

Query idempotente; no cambia fechas, pago o proof.

## Salida redactada

`{actionable:[],not_yet_due:[],waiting_professional_decision:[]}` con labels, importes ya autorizados y explanation codes.

## Errores seguros

`PATIENT_INACTIVE`, `NO_PENDING_PAYMENTS`, `PAYMENT_STATE_UNSUPPORTED`.

## No debe hacer

No compartir CLABE/cuenta, instruir transferencia, marcar pago ni decidir un proof.

## Pruebas mínimas

Cada grupo, varios estados, sin pendientes, otro tenant e inactivo.

## Trazabilidad

DEC-08, DEC-11; SCN-20.

