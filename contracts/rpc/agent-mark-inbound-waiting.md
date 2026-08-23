# `agent_mark_inbound_waiting`

Tipo: `command de control`
Actor: Function Node autenticado (`service_role`)

## Objetivo

Marcar que la ejecución activa espera una interacción externa antes de poder
ser reanudada por un inbound posterior.

## Firma SQL as-built

`agent_mark_inbound_waiting(p_provider_message_id text,p_kapso_execution_id text) -> boolean`

`SECURITY DEFINER SET search_path=''`, owner `agenda_psi_agent_owner`, EXECUTE
solo para `service_role`.

## Entrada externa

Provider message ID y execution ID provenientes del workflow autenticado.

## Contexto inyectado

Inbound latest ya ligado y execution sellada en el turno.

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
2. Bloquear inbound→turn y exigir que sea el inbound más nuevo del turno por
   `(received_at,message_sid)` y que execution coincida en ambos.
3. Exigir turno `active` y **cero claims pendientes**.
4. Cambiar a `waiting_external`, actualizar actividad/expiry del turno sin
   extender sesión.
5. Replay inmediato exacto ya en `waiting_external` devuelve `true`; un callback
   viejo cuando existe un inbound posterior devuelve `false`.

## Transacción/locks/idempotencia

Una transacción con lock `inbound -> turn`; replay exacto no vuelve a cambiar
timestamps y callback stale no escribe.

## Salida redactada

Booleano service-only.

## Errores seguros

Input inválido levanta `INVALID_INBOUND_TRANSITION`; mismatch devuelve `false`.

## No debe hacer

No completar, crear turno, consumir token, cambiar tenant ni escribir dominio.

## Pruebas mínimas

Active→waiting, replay, claim pendiente, callback stale, execution equivocada y
deadline.

## Trazabilidad

DEC-02, DEC-23; SCN-25, SCN-26.
