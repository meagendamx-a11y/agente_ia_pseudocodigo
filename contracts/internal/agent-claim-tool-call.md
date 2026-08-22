# `private.agent_claim_tool_call`

Tipo: `command privado`
Actor: wrapper de dominio

## Objetivo

Reservar de forma atómica ordinal, presupuesto, mutación y `command_id` antes de ejecutar una tool.

## Entrada externa

Ninguna; no está expuesta a Edge ni al modelo.

## Contexto inyectado

`turn_id`, `execution_id`, operación fija, `tool_call_key` derivada por servidor e `input_hash` canónico.

## Lee

`public.agent_turns`, `public.agent_tool_calls`, `public.command_log`.

## Escribe

`public.agent_turns`, `public.agent_tool_calls`.

## Validaciones

Turno activo/no expirado; execution coincidente; operación allowlisted; máximo 8 llamadas; paciente activo para dominio; presupuesto/saga compatible.

## Flujo lógico

1. Bloquear turno.
2. Si la key existe, devolver replay sellado o claim existente.
3. Validar contador y transición; reservar posición de mutación si corresponde.
4. Asignar ordinal y, para mutación, `command_id` generado en DB.
5. Insertar claim e incrementar contador.

## Transacción/locks/idempotencia

Una transacción con row lock; uniques por key y ordinal. La saga solo puede elevar el límite mediante la operación fija cancelar→Flow en el primer claim.

## Salida redactada

`{status, ordinal, command_id?, replay, redacted_result?}`.

## Errores seguros

`TURN_EXPIRED`, `TOOL_NOT_ALLOWED`, `TOOL_BUDGET_EXCEEDED`, `MUTATION_BLOCKED`, `CONFLICT`.

## No debe hacer

No ejecutar dominio, aceptar keys del modelo, elevar límites genéricamente ni otorgar permisos.

## Pruebas mínimas

Claim nuevo/replay, carrera de key, novena llamada, segunda mutación normal, upgrade/reversión de saga, inactivo.

## Trazabilidad

DEC-23, DEC-25; SCN-28, SCN-29, SCN-32.
