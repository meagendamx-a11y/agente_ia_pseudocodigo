# Estado de control del agente

Tipo: `data contract`
Actor: sistema/service-only

## Objetivo

Separar autorización durable, turno, opciones opacas e idempotencia de la memoria del LLM.

## Entrada externa

Solo el sobre Kapso previamente autenticado por HMAC. Ningún campo de control se acepta desde el modelo.

## Contexto inyectado

Teléfono normalizado, número destino, contacto/portfolio/BSUID cuando existan, conversación, ejecución, mensaje y relación seleccionada.

## Lee

- `public.whatsapp_links`, `public.agent_sessions`, `public.whatsapp_inbound_messages`.
- `public.agent_turns`, `public.agent_option_tokens`, `public.agent_tool_calls`, `public.command_log` en el estado futuro aditivo.

## Escribe

Solo filas de control, auditoría e idempotencia. No escribe dominio por sí mismo.

## Validaciones

- `agent_sessions` es capacidad de autorización, no memoria conversacional; dura 24 h desde el último inbound verificado.
- Cada wrapper revalida la pareja real de `whatsapp_links` y `patients.patient_status='active'`.
- Un índice parcial permite un único turno no terminal por conversación.
- El turno inactivo expira a los 30 minutos y nunca excede la sesión.
- Ninguna expiración o cleanup concede permisos.

## Flujo lógico

1. El ledger inbound sella identidad, hash, admisión y correlación.
2. El turno avanza `admitted -> active -> waiting_external -> active -> completing -> completed`; también puede terminar `failed` o `expired`.
3. Cada llamada se reclama antes de ejecutar y se finaliza con resultado redactado.
4. Las opciones guardan un handle aleatorio y binding interno; el gateway construye el bearer.
5. Resultados/turnos/ledger terminales se retienen 30 días para auditoría y replay.

### Presupuesto y saga

Turno normal: `mutation_limit=1`. La operación fija `cancel_then_open_booking_flow`, solamente al reclamar la primera cancelación con contador cero, sella `saga_state='cancel_claimed'` y límite 2. Rechazo pre-write restaura `normal/1`; cancelación confirmada pasa a `awaiting_replacement_create`, donde solo `agent_create_appointment` puede mutar. Rechazo de slot libera reserva y mantiene la espera. Resultado desconocido bloquea toda mutación hasta reconciliar `command_log`. Nunca hay una tercera mutación.

### Token estable

La fila guarda `random_handle`, binding y `key_id`; nunca persiste el token bearer completo. El handle estable se combina con un HMAC para regenerar el mismo bearer después de un reinicio: `v1.<key_id>.<random_handle>.<HMAC>`. La MAC cubre key ID, handle, sesión, turno, kind y expiry. En rotación, el replay usa la clave original indicada por `key_id`; la clave vieja se retiene durante la ventana sellada de 30 días, pero la expiración de base sigue invalidando el token.

## Transacción/locks/idempotencia

- Ledger: insertar replay identity, locks advisory teléfono→profesional, contar y admitir en una transacción.
- Tool: lock del turno, unique `(turn_id, tool_call_key)` y `(turn_id, ordinal)`.
- `command_id` se genera una vez en DB al claim y se reutiliza en cada replay.
- `tool_call_key` se deriva server-side por superficie; nunca lo envía el modelo.

## Salida redactada

Códigos, contadores seguros, tokens bearer generados en Edge y DTOs sin IDs internos.

## Errores seguros

`SESSION_EXPIRED`, `TURN_EXPIRED`, `TOKEN_INVALID`, `TOKEN_EXPIRED`, `TOOL_BUDGET_EXCEEDED`, `MUTATION_BLOCKED`, `UNKNOWN_OUTCOME`.

## No debe hacer

- Guardar narrativa clínica, prompts, secretos o token bearer completo.
- Aceptar límites, saga, sesión, command ID o IDs de dominio desde el modelo.
- Extender sesión desde tools/outbound o autorizar con filas expiradas.

## Pruebas mínimas

Replay tras reinicio y rotación; token extranjero/expirado/consumido; carrera de dos tools; ocho llamadas; una mutación; todas las transiciones de saga; inactivo cross-RPC.

## Trazabilidad

DEC-08, DEC-23, DEC-24, DEC-25; SCN-03, SCN-04, SCN-28, SCN-29, SCN-32.
