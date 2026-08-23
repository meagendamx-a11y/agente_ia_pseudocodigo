# `kapso_inbound_webhook`

Tipo: `webhook`
Actor: Kapso number webhook
Ruta futura: `/functions/v1/kapso_inbound_webhook`

## Objetivo

Autenticar `whatsapp.message.received` payload v2, registrar/admitir el inbound y solo entonces iniciar o reanudar el workflow.

## Entrada externa

Request HTTP con máximo **1 MiB** y headers obligatorios `X-Webhook-Event`, `X-Webhook-Signature`, `X-Idempotency-Key`, `X-Webhook-Payload-Version`. Sus valores son no confiables hasta autenticar.

## Contexto inyectado

Después de autenticar: `provider_message_id`, `reply_to_provider_message_id?`, sender E.164, `target_phone_number_id`, contacto, portfolio, BSUID, conversación y timestamp del proveedor.

## Lee

Configuración server-side de secreto, número/evento/version permitidos y kill switch.

## Escribe

Indirectamente llama `agent_register_inbound_context`; no escribe tablas ni dominio desde Edge.

## Validaciones

1. Rechazar longitud mayor a 1 MiB antes de parsear.
2. Exigir sintaxis de headers.
3. Calcular HMAC-SHA256 hexadecimal sobre el **raw body/body crudo** y comparar `X-Webhook-Signature` en **tiempo constante/constant-time** antes de parsear o usar payload.
4. Parsear JSON y comprobar v2, evento/header exacto, consistencia y `target_phone_number_id` allowlisted.
5. Normalizar E.164 y extraer reply context solo del sobre autenticado.
6. Rechazar timestamp más de 5 minutos en el futuro; un retry viejo válido se gobierna por replay/retención.

## Flujo lógico

1. Ejecutar validaciones en el orden anterior.
2. Calcular `payload_sha256` y llamar la RPC de admisión con timeout.
3. `admitted|resumed`: start/resume API Trigger; `replay`: devolver ACK sellado.
4. `rate_limited`: **sin llamar al LLM/no LLM**; solo el claim de cooldown envía aviso fijo con crisis completa.
5. `rejected`: ACK/4xx seguro según categoría sin iniciar workflow.

## Transacción/locks/idempotencia

La atomicidad vive en la RPC. Start espera 202; resume 200; 409 se reconcilia como resume concurrente; 429 respeta `Retry-After` sin crear turno nuevo. Target/sender/contacto distintos en una conversación existente fallan cerrado.

## Salida redactada

ACK bajo 10 s (objetivo interno 8 s), con código técnico sin teléfono, texto ni IDs de dominio.

## Errores seguros

`BODY_TOO_LARGE`, `BAD_SIGNATURE`, `UNSUPPORTED_EVENT`, `UNSUPPORTED_VERSION`, `TARGET_NOT_ALLOWED`, `IDENTITY_CONFLICT`, `TEMPORARY_UNAVAILABLE`.

## No debe hacer

- Parsear/usar payload antes de HMAC.
- Llamar Agent Node en rate limit/replay/rechazo.
- Reutilizar `kapso_status_callback`, aceptar eventos de estados o registrar texto en logs.
- Modificar sender, outbox, citas, pagos o Storage.

## Pruebas mínimas

Body exacto/alterado; firma timing-safe; 1 MiB; header/body mismatch; target equivocado; timestamp futuro/viejo; replay; rate-limit concurrente; start/resume 202/200/409/429; identidad cambiada.

## Trazabilidad

DEC-02, DEC-16, DEC-22, DEC-25; SCN-01..SCN-10.
