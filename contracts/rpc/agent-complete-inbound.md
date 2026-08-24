# `agent_complete_inbound`

Tipo: `command de control`
Actor: Function Node autenticado (`service_role`)

## Objetivo

Sellar inbound/turno como completados solo después del ACK del texto final y con
el claim técnico de completion pendiente.

## Firma SQL as-built

`agent_complete_inbound(p_provider_message_id text,p_kapso_execution_id text,p_response_message_id text) -> boolean`

Wrapper del workflow:
`agent_complete_inbound_from_workflow(p_provider_message_id text,p_kapso_execution_id text,p_response_message_id text) -> boolean`.

`SECURITY DEFINER SET search_path=''`, owner `agenda_psi_agent_owner`, EXECUTE
solo para `service_role`.

## Entrada externa

Provider message ID, execution ID y response message ID opcional provenientes
del workflow autenticado después del ACK final.

## Contexto inyectado

Correlación del workflow autenticado. `p_response_message_id` es nullable/
opcional hasta verificar E2E que Kapso siempre lo expone; si existe debe ser no
vacío y máximo 255 caracteres.

## Lee

`public.whatsapp_inbound_messages`, `public.agent_turns` y
`public.agent_tool_calls` para el gate técnico.

## Escribe

`processed_at`, legacy `response_message_sid`, status/terminal timestamps de
inbound/turno. Cero escrituras de dominio.

## Validaciones

Input, latest inbound, execution/turno exactos, estado `completing` y único claim
técnico pendiente.

## Flujo lógico

1. Input malformado: SQLSTATE `22023/INVALID_INBOUND_TRANSITION`; mismatch
   semántico devuelve `false` sin escribir.
2. Bloquear inbound→turn, exigir latest inbound del turno, execution exacta y
   estado `completing`.
3. Exigir **exactamente un claim pendiente** del mismo turno/execution con tupla
   `(workflow_internal,complete_inbound,false)`, ordinal 9, y ningún otro claim
   pendiente.
4. Orden externo obligatorio: assistant text aceptado por Kapso →
   `complete_task` → Function Node `agenda-psi-complete-inbound` → wrapper.
5. Sellar `processed_at`, response nullable, `completed` y `terminal_at` con
   tiempo server-side posterior a locks. No cambia `session.expires_at`.
6. Replay en `completed` usa igualdad null-safe de execution/response y devuelve
   `true`; `NULL→valor`, valor distinto o execution distinta devuelve `false`.
7. `agent_complete_inbound_from_workflow` crea/reproduce el claim técnico,
   invoca la primitiva y lo finaliza sin reabrir el turno.

## Transacción/locks/idempotencia

Una transacción; callbacks viejos no pueden completar si existe un inbound más
nuevo del turno. Misma correlación es replay; distinta correlación no sobrescribe.

## Salida redactada

Booleano service-only, nunca visible al paciente.

## Errores seguros

Input inválido levanta `INVALID_INBOUND_TRANSITION`; mismatch de estado,
ejecución, claim o response devuelve `false` sin eco.

## No debe hacer

- Enviar texto o finalizar antes del provider ACK.
- Completar sin el único claim técnico pendiente.
- Mutar dominio, outbox o sesión; fabricar `response_message_id`.

## Pruebas mínimas

Éxito, cero/claim incorrecto/múltiples claims, replay null y non-null, correlation
distinta, execution distinta, callback stale y session expiry inmutable.

## Trazabilidad

DEC-02, DEC-23; SCN-01, SCN-24..SCN-37.
