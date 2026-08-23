# `agent_attach_payment_proof`

Tipo: `command`
Actor: media gateway service-only

## Objetivo

Adjuntar un receipt privado a una cita elegible como comprobante recibido pendiente de decisión.

## Entrada externa

Modelo: `{appointment_token, media_ordinal}`; nunca path. Interno: `(session_id uuid, appointment_option_handle uuid, storage_receipt_handle uuid, command_id uuid) -> jsonb`.

## Contexto inyectado

Handles verificados, turno/provider message, command ID y binding de Storage.

## Lee

`patients`, `whatsapp_links`, `appointments`, `payments`, `payment_proofs`, option receipt, `storage.objects`, eventos/`command_log`.

## Escribe

Proof, evento, notificación/command log y consumo del receipt en una transacción; no cambia payment a paid.

## Validaciones

- `patients.patient_status='active'`, tenant y tokens/receipt vigentes/coincidentes.
- Pago `pending`, existe `proof_requested_at` y **sin comprobante/no existing proof**.
- Objeto privado permitido, SHA binding e inexistencia de checksum duplicado en el mismo dominio.

## Flujo lógico

Tomar **locks** de receipt/cita/pago; revalidar; consumir receipt; insertar proof/event/notification/command; devolver `proof_received_pending_review`.

## Transacción/locks/idempotencia

Una transacción y `command_id` único. Receipt one-time y constraint evitan duplicados; replay exacto devuelve el mismo proof seguro. Rechazo pre-write libera reserva; unknown se reconcilia.

## Salida redactada

`{outcome:committed,code:'proof_received_pending_review',appointment_label}`.

## Errores seguros

`PATIENT_INACTIVE`, `RECEIPT_INVALID`, `RECEIPT_EXPIRED`, `PROOF_NOT_REQUESTED`, `PAYMENT_NOT_PENDING`, `PROOF_ALREADY_EXISTS`, `DUPLICATE_MEDIA`, `UNKNOWN_OUTCOME`.

## No debe hacer

No marcar `paid`, `credited` o `approved`; no reemplazar/rechazar/eliminar proof; no revelar path/hash/IDs ni aceptar banco.

## Pruebas mínimas

Éxito/replay, no solicitado, pagado, proof existente, receipt expirado/foreign, checksum duplicado, inactivo, carrera y timeout.

## Trazabilidad

DEC-08, DEC-11..DEC-13, DEC-23; SCN-21, SCN-22, SCN-33, SCN-34.
