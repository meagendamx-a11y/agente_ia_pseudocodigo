# `private.agent_issue_option_handle`

Tipo: `command privado`
Actor: wrapper allowlisted

## Objetivo

Crear o recuperar un handle estable ligado a sesión/turno/tenant/entidad sin revelar el ID.

## Entrada externa

Ninguna; los IDs provienen de queries autorizadas.

## Contexto inyectado

Sesión, turno, kind, entity type/ID, stable key, `key_id`, expiry y flag one-time.

## Lee

`public.agent_sessions`, `public.agent_turns`, `public.agent_option_tokens`.

## Escribe

`public.agent_option_tokens`; escritura técnica, cero escrituras de dominio.

## Validaciones

Sesión/turno vigentes y vinculados; kind permitido; expiry no supera TTL fijo; entidad pertenece al tenant activo; `key_id` vigente.

## Flujo lógico

1. Revalidar contexto.
2. Buscar stable issuance key.
3. Retornar el handle existente o generar UUID aleatorio.
4. Guardar binding/expiry/key ID, nunca bearer o secreto.

## Transacción/locks/idempotencia

Unique por stable issuance key; una carrera converge al mismo handle.

## Salida redactada

Handle, kind, expiry y key ID para que Edge regenere el bearer HMAC.

## Errores seguros

`SESSION_EXPIRED`, `TURN_EXPIRED`, `ENTITY_NOT_VISIBLE`, `INVALID_TTL`, `KEY_UNAVAILABLE`.

## No debe hacer

No persistir bearer/HMAC secreto, no extender sesión/token y no emitir para entidad extranjera.

## Pruebas mínimas

Emisión/replay concurrente, TTL por kind, tenant extranjero, reinicio y rotación de clave.

## Trazabilidad

DEC-24; SCN-06, SCN-14, SCN-16.
