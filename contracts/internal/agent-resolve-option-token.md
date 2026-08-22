# `private.agent_resolve_option_token`

Tipo: `query/command privado`
Actor: wrapper allowlisted después de HMAC Edge

## Objetivo

Resolver un handle verificado y revalidar binding, expiración, tenant y consumo.

## Entrada externa

Ninguna directa; Edge verifica formato/HMAC en tiempo constante y entrega solo `token_handle`.

## Contexto inyectado

Sesión, turno, handle, expected kind y consume.

## Lee

`public.agent_sessions`, `public.agent_turns`, `public.agent_option_tokens`, entidad ligada y `public.whatsapp_links`.

## Escribe

Solo `consumed_at` para token one-time; cero escrituras de dominio.

## Validaciones

Handle existente, kind exacto, sesión/turno/tenant iguales, no expirado/no consumido y paciente activo para dominio.

## Flujo lógico

1. Bloquear token si consume.
2. Revalidar todos los bindings y entidad visible.
3. Marcar consumo cuando corresponda.
4. Devolver ID solo al wrapper privado.

## Transacción/locks/idempotencia

Consumo atómico. Exact replay se resuelve por el tool claim sellado, no consume por segunda vez.

## Salida redactada

Binding interno solo para el wrapper; nunca se serializa al modelo.

## Errores seguros

`TOKEN_INVALID`, `TOKEN_EXPIRED`, `TOKEN_CONSUMED`, `TOKEN_KIND_MISMATCH`, `ENTITY_NOT_VISIBLE`.

## No debe hacer

No aceptar IDs de dominio, no devolver binding a Edge/modelo y no revivir tokens expirados.

## Pruebas mínimas

Token extranjero, kind incorrecto, expirado, one-time concurrente, inactivo y replay sellado.

## Trazabilidad

DEC-08, DEC-23, DEC-24; SCN-04, SCN-06, SCN-14.
