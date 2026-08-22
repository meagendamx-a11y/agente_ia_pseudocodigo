# `kapso_payment_proof_adapter`

Tipo: `webhook/media adapter`
Actor: gateway con inbound Kapso verificado

## Objetivo

Descargar inmediatamente una imagen autenticada, validarla y acuñar un receipt opaco para adjuntarla.

## Entrada externa

Contexto de media del provider asociado al `provider_message_id` autenticado. Nunca URL escrita por paciente/modelo.

## Contexto inyectado

Sesión, turno, target, provider message, media ordinal, URL/token efímero obtenido server-side y cita candidata opaca.

## Lee

Provider media API y configuración allowlisted; no tablas de dominio directas.

## Escribe

Objeto en **bucket privado/private bucket** `comprobantes` y option handle `storage_receipt`; todavía no escribe proof/pago.

## Validaciones

- Auth Kapso e inbound/surface/target coincidentes.
- Deadline **8 segundos/8 s**; abort streaming sobre **5 MiB**.
- Magic bytes reales: `image/jpeg`, `image/png` o `image/webp`; el MIME declarado no basta.
- Redirects/origen/protocolo acotados para evitar SSRF; no enviar auth a otro host.
- Calcular **SHA-256** durante streaming.

## Flujo lógico

1. Resolver media desde contexto firmado y descargar una vez.
2. Validar status, headers, tamaño y magic bytes mientras fluye.
3. Subir a namespace aleatorio server-side de `comprobantes`.
4. Guardar receipt one-time ligado a sesión/turno/provider message/hash, TTL 10m.
5. Devolver bearer opaco generado por gateway.

## Transacción/locks/idempotencia

Key `provider_message_id + media_ordinal`; replay exacto reutiliza receipt/resultado. Fallo posterior a upload se reconcilia por stable key; cleanup futuro retira huérfanos.

## Salida redactada

`{storage_receipt_token,expires_in_seconds:600,detected_type}`. No ruta, provider URL, checksum ni ID.

## Errores seguros

`MEDIA_NOT_AVAILABLE`, `MEDIA_TIMEOUT`, `MEDIA_TOO_LARGE`, `MEDIA_TYPE_NOT_ALLOWED`, `MEDIA_DOWNLOAD_FAILED`, `STORAGE_FAILED`.

## No debe hacer

No aceptar URLs de texto/modelo, no hacer bucket público, no revelar path/checksum, no acreditar/aprobar pago ni conservar archivo inválido.

## Pruebas mínimas

JPEG/PNG/WebP reales; MIME falso; polyglot; stream >5MiB; timeout/redirect; replay; otro target/session; upload parcial.

## Trazabilidad

DEC-12, DEC-13, DEC-23; SCN-21, SCN-33, SCN-34.

