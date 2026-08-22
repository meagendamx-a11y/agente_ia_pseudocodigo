# `agent_complete_inbound`

Tipo: `command de control`
Actor: Function Node service-only

## Objetivo

Marcar el inbound/turno completado solo después de que Kapso acepte el texto final.

## Entrada externa

No visible al modelo. Firma: `(provider_message_id text, kapso_execution_id text, response_message_id text?) -> boolean`.

## Contexto inyectado

Correlación firmada del workflow; `response_message_id` es opcional hasta probar que Kapso lo expone.

## Lee

`public.whatsapp_inbound_messages`, `public.agent_turns`, `public.agent_tool_calls`.

## Escribe

`processed_at`, response correlation y estado terminal de control. Cero escrituras de dominio.

## Validaciones

Inbound/ejecución/turno coincidentes, estado `completing`, resultado de dominio sellado cuando aplica y respuesta final aceptada.

## Flujo lógico

Orden obligatorio: **assistant text** aceptado por Kapso → `complete_task` → **Function Node** → esta RPC → `processed_at` y `completed`. Si falla el envío, no completa. Esperas usan `enter_waiting`, no esta función.

## Transacción/locks/idempotencia

Lock de inbound/turno. Repetir misma ejecución/correlación devuelve `true`; correlación distinta falla cerrado.

## Salida redactada

Booleano para el Function Node; no se muestra al paciente.

## Errores seguros

`INBOUND_NOT_FOUND`, `EXECUTION_MISMATCH`, `INVALID_STATE`, `RESPONSE_CORRELATION_MISMATCH`.

## No debe hacer

No enviar texto, no finalizar antes del provider ACK, no mutar dominio ni fabricar `response_message_id`.

## Pruebas mínimas

Éxito, send fallido, replay, ejecución distinta, response ID opcional/presente y espera externa.

## Trazabilidad

DEC-02, DEC-23; SCN-01, SCN-24..SCN-37.
