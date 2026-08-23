# `agent_mark_inbound_completing`

Tipo: `command de control`
Actor: Function Node autenticado (`service_role`)

## Objetivo

Marcar que el workflow activo ya preparó/aceptó el texto final y está listo para
reclamar la completion técnica antes del ACK final.

## Firma SQL as-built

`agent_mark_inbound_completing(p_provider_message_id text,p_kapso_execution_id text) -> boolean`

`SECURITY DEFINER SET search_path=''`, owner `agenda_psi_agent_owner`, EXECUTE
solo para `service_role`.

## Entrada externa

Provider message ID y execution ID provenientes del workflow autenticado.

## Contexto inyectado

Inbound latest ligado y execution exacta del turno activo.

## Lee

Inbound, turno, sesión y claims de control.

## Escribe

Solo status/activity/expiry del turno de control.

## Validaciones

Input/correlación, latest inbound, execution, estado active y cero claims
pendientes.

## Flujo lógico

1. Input malformado: SQLSTATE `22023/INVALID_INBOUND_TRANSITION`; mismatch
   semántico devuelve `false` sin escribir.
2. Bloquear inbound→turn, exigir latest inbound y execution exacta.
3. Exigir turno `active` y **cero claims pendientes**.
4. Cambiar a `completing` y refrescar solo actividad/expiry del turno dentro de
   session expiry.
5. Replay inmediato exacto en `completing` devuelve `true`; un callback stale o
   un estado distinto devuelve `false`.

## Transacción/locks/idempotencia

Una transacción con lock `inbound -> turn`; replay exacto es idempotente y un
callback stale no escribe.

## Salida redactada

Booleano service-only.

## Errores seguros

Input inválido levanta `INVALID_INBOUND_TRANSITION`; mismatch devuelve `false`.

## No debe hacer

No completar el ledger, fabricar response ID, enviar texto, extender sesión ni
escribir dominio.

## Pruebas mínimas

Active→completing, replay, pending claim, callback stale, execution mismatch y
estado inválido.

## Trazabilidad

DEC-02, DEC-23; SCN-24..SCN-37.
