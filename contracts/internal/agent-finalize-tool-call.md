# `private.agent_finalize_tool_call`

Tipo: `command privado`
Actor: wrapper que posee el claim

## Objetivo

Sellar exactamente una vez el outcome y resultado redactado de un claim, además
de aplicar el contador/saga correspondiente.

## Firma SQL as-built

`private.agent_finalize_tool_call(p_turn_id uuid,p_tool_call_key text,p_outcome text,p_redacted_result jsonb) -> jsonb`

Helper `SECURITY DEFINER SET search_path=''`, propiedad de
`agenda_psi_agent_owner`, sin `EXECUTE` efectivo para roles API.

## Entrada externa

Ninguna directa. Solo el wrapper que ejecutó el claim puede pasar outcome y
resultado ya redactado.

## Contexto inyectado

Turn UUID de control y key generada por la superficie que reclamó. Outcome fijo
`committed|rejected_prewrite|unknown`; resultado ya redactado por el wrapper.

## Lee

`public.agent_turns`, `public.agent_tool_calls`.

## Escribe

`public.agent_turns`, `public.agent_tool_calls`.

## Validaciones

- Outcome fuera del enum, resultado no objeto o JSONB serializado mayor a 16384
  bytes: SQLSTATE `22023`, `INVALID_TOOL_FINALIZE`.
- Claim debe pertenecer al mismo turno/key. El lock order es `turn -> tool`.
- Resultado distinto nunca reemplaza uno sellado.
- La completion técnica exacta puede finalizar después de que el lifecycle
  público ya dejó el turno `completed`; ningún otro claim obtiene esa excepción.

## Flujo lógico

1. Bloquear turno y claim.
2. Si ya está finalizado y outcome/resultado son null-safe idénticos, devolver
   `FINALIZED/EXACT_REPLAY`; si difieren, `rejected/FINALIZE_MISMATCH`.
3. `committed` incrementa `committed_mutation_count` solo para mutación y aplica
   la transición exacta de saga.
4. `rejected_prewrite` libera la reserva: cancel inicial vuelve a `normal/1/0`;
   create rechazado permanece `awaiting_replacement_create/2/1`.
5. `unknown` no se presenta como commit: conserva el contador y sella
   `unknown_blocked`, bloqueando mutaciones posteriores.
6. Guardar outcome, resultado y `finalized_at`. Nunca disminuir
   `tool_call_count`.

## Saga exacta

- Cancel commit: `cancel_claimed/2/0 -> awaiting_replacement_create/2/1`.
- Create commit en ordinal 8: `awaiting_replacement_create/2/1 ->
  awaiting_replacement_create/2/2`.
- Segunda mutación fuera de esa tupla y toda tercera mutación quedan bloqueadas.
- Tasks 2–4 no inventan reconciliación para `unknown_blocked`.

## Transacción/locks/idempotencia

Una transacción. La fila finalizada es el resultado durable; retry idéntico no
reejecuta dominio y retry diferente no sobrescribe.

## Salida redactada

DTO exacto: `{status,reason,ordinal,command_id,replay,outcome,redacted_result}`.

Nuevo: `finalized/FINALIZED`; replay exacto: `finalized/EXACT_REPLAY` con
`replay=true`; mismatch: `rejected/FINALIZE_MISMATCH`.

## Errores seguros

`INVALID_TOOL_FINALIZE`, `CLAIM_NOT_FOUND`, `FINALIZE_MISMATCH`.

## No debe hacer

- Ejecutar, reintentar o compensar citas/pagos.
- Guardar texto clínico, PII o IDs internos en el resultado redactado.
- Tratar `unknown` como confirmado.

## Pruebas mínimas

Tres outcomes; replay/mismatch sin overwrite; límites 16 KiB; transición de
cancel/create; unknown blocked; completion post-completed.

## Trazabilidad

DEC-23; SCN-28, SCN-29, SCN-32.
