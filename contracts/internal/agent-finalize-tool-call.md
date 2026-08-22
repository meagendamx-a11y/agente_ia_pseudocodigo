# `private.agent_finalize_tool_call`

Tipo: `command privado`
Actor: wrapper de dominio

## Objetivo

Sellar el resultado redactado, contabilizar un commit conocido o liberar/bloquear la reserva.

## Entrada externa

Ninguna; llamada interna con outcome enumerado.

## Contexto inyectado

`turn_id`, `tool_call_key`, outcome `committed|rejected_prewrite|unknown` y resultado redactado.

## Lee

`public.agent_turns`, `public.agent_tool_calls`, `public.command_log`.

## Escribe

`public.agent_turns`, `public.agent_tool_calls`.

## Validaciones

Claim existente, operación/turno coincidentes, resultado bajo 16 KiB y sin PII/IDs internos.

## Flujo lógico

1. Bloquear claim y turno.
2. Si ya finalizó, devolver replay.
3. Commit incrementa contador; rechazo pre-write libera reserva; desconocido conserva bloqueo.
4. Aplicar transición exacta de saga y guardar resultado seguro.

## Transacción/locks/idempotencia

Finalización idempotente en una transacción. Reconciliación consulta `command_log` con el mismo command ID.

## Salida redactada

Resultado sellado con ordinal y outcome seguro.

## Errores seguros

`CLAIM_NOT_FOUND`, `RESULT_TOO_LARGE`, `INVALID_TRANSITION`, `UNKNOWN_OUTCOME`.

## No debe hacer

No reejecutar dominio, no compensar citas/pagos y no reemplazar un resultado sellado.

## Pruebas mínimas

Doble finalize, commit/reject/unknown, reconciliación, saga cancel/create y resultado sobredimensionado.

## Trazabilidad

DEC-23; SCN-28, SCN-29, SCN-32.
