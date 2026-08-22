# `agent_get_appointment_payment_status`

Tipo: `query`
Actor: gateway service-only

## Objetivo

Explicar el estado actual del pago de una cita y si puede recibir comprobante.

## Entrada externa

Modelo: `{ "appointment_token":"opaque"? }`. Interno: `(session_id uuid, appointment_option_handle uuid?) -> jsonb`.

## Contexto inyectado

Handle verificado; sin token solo se admite una única cita inequívoca, de lo contrario se piden opciones.

## Lee

`patients`, `whatsapp_links`, `appointments`, `payments`, `payment_proofs`, eventos de cambios tardíos.

## Escribe

Cero escrituras de dominio.

## Validaciones

`patients.patient_status='active'`, tenant, cita visible y combinación de estados soportada.

## Flujo lógico

Construir ejes independientes, en este orden: `payment_state`, `proof_state`, `late_change_state`, `actionability`, `can_upload_proof`, `explanation_code`. `can_upload_proof=true` únicamente si pago pending, `proof_requested_at` existe y no hay proof.

## Transacción/locks/idempotencia

Query idempotente; la autorización de upload se revalida de nuevo al adjuntar.

## Salida redactada

DTO con los seis ejes, label de cita e importe seguro; sin estados internos extra.

## Errores seguros

`APPOINTMENT_REQUIRED`, `PATIENT_INACTIVE`, `PAYMENT_NOT_FOUND`, `PAYMENT_STATE_UNSUPPORTED`.

## No debe hacer

No marcar pagado/aprobar/rechazar proof, no dar banca y no aceptar estado reclamado por usuario.

## Pruebas mínimas

Pending solicitado/no solicitado; proof presente; paid; late change; ambigüedad; token extranjero; inactivo.

## Trazabilidad

DEC-11, DEC-12, DEC-13; SCN-20..SCN-22.
