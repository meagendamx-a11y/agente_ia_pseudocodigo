# `agent_submit_review`

Tipo: `command`
Actor: gateway service-only

## Objetivo

Persistir una reseña final e inmutable después de confirmación explícita.

## Entrada externa

Modelo: `{rating:1..5, comment?:string max 1000, confirmed:true}`. Interno: `(session_id uuid, rating smallint, comment text?, command_id uuid) -> jsonb`.

## Contexto inyectado

Sesión/turno/relación/command ID; server time y nombre snapshot vienen del servidor.

## Lee

`patients`, `whatsapp_links`, `appointments`, `reviews`, `command_log`.

## Escribe

Una review y command/evento. Es una **sola mutación final/single final mutation**.

## Validaciones

- Confirmación explícita, `patients.patient_status='active'`, relación/tenant.
- `rating` entero **1..5** y `comment` texto plano normalizado de máximo **1000** caracteres.
- Al menos una cita attended y regla de unicidad aplicable; `can_submit_review` de capabilities es informativo.

## Flujo lógico

Rating/comment permanecen en estado temporal Kapso hasta confirmar; **sin borrador persistido/no persistent draft**. Bajo lock, revalidar eligibility/unicidad, insertar snapshot y `moderation_status='pending'`, sellar command y responder el thank-you fijo.

## Transacción/locks/idempotencia

Lock/constraint de unicidad y `command_id` en una transacción idempotente. Dos submits concurrentes preservan una sola reseña; moderación posterior no altera lo enviado por el paciente.

## Salida redactada

`{outcome:'committed',code:'review_received'}`; el mensaje visible es exactamente “Perfecto, muchas gracias por tu reseña.”

## Errores seguros

`PATIENT_INACTIVE`, `REVIEW_NOT_ELIGIBLE`, `INVALID_RATING`, `COMMENT_TOO_LONG`, `REVIEW_ALREADY_SUBMITTED`, `UNKNOWN_OUTCOME`.

## No debe hacer

No persistir borradores, editar/consultar estado, prometer publicación/moderación/notificación, exponer `moderation_status` ni añadir cierre ordinario.

## Pruebas mínimas

Respuesta combinada/dos pasos/sin comentario; rating inválido; >1000; turno expirado; duplicate/carrera; inactivo; edición/status deny y replay.

## Trazabilidad

DEC-08, DEC-14, DEC-15, DEC-23; SCN-37.
