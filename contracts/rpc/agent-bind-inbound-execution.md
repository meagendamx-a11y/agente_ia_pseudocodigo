# `agent_bind_inbound_execution`

Tipo: `command de control`
Actor: Edge/Function Node autenticado (`service_role`)

## Objetivo

Sellar la ejecución Kapso aceptada y mover exactamente un inbound/turno a
`active` sin permitir que un retry tardío reactive trabajo ya avanzado.

## Firma SQL as-built

`agent_bind_inbound_execution(p_provider_message_id text,p_turn_id uuid,p_kapso_execution_id text) -> boolean`

`SECURITY DEFINER SET search_path=''`, owner `agenda_psi_agent_owner`, EXECUTE
solo para `service_role`.

## Entrada externa

Provider message ID, turn UUID de control y Kapso execution ID provenientes del
workflow autenticado; nunca del texto/modelo.

## Contexto inyectado

La admisión sellada del inbound y el turn exacto que Edge acaba de iniciar o
reanudar con Kapso.

## Lee

`public.whatsapp_inbound_messages`, `public.agent_turns` y
`public.agent_sessions` para deadline.

## Escribe

Execution/estado/activity/expiry de inbound y turno de control; nunca sesión ni
dominio.

## Validaciones

Input malformado levanta SQLSTATE `22023/INVALID_INBOUND_TRANSITION`. Mismatch
semántico devuelve `false` sin escribir. Lock order: inbound→turn; advisory por
target+execution impide usar la misma ejecución en otro turno del target.

## Flujo lógico

1. `admitted` inbound + turno `admitted`: exigir refs exactas, sesión/turno
   vigentes, sellar execution en ambos y pasar a `active`.
2. `resumed` inbound + turno `waiting_external`: la ejecución del turno ya debe
   coincidir, la del inbound todavía debe ser nula; sellarla y pasar a `active`.
3. Replay inmediato exacto mientras el turno sigue `active` devuelve `true`.
4. Si el mismo inbound ya fue ligado y el turno volvió a `waiting_external`, el
   retry tardío devuelve `false`: no reactiva el turno.
5. Activity/expiry del turno usan tiempo posterior a locks y nunca exceden
   `least(session.expires_at,now()+30 minutes)`.

## Transacción/locks/idempotencia

Una transacción; lock `inbound -> turn` y advisory target+execution. Replay
exacto inmediato es true; correlación o estado distinto no escribe.

## Salida redactada

Booleano service-only. No se muestra al modelo/paciente.

## Errores seguros

Input inválido levanta `INVALID_INBOUND_TRANSITION`; todo mismatch semántico
devuelve `false` sin eco.

## No debe hacer

No iniciar Kapso, cambiar tenant, extender sesión, completar el inbound ni
escribir dominio/outbound.

## Pruebas mínimas

Admitted, resumed waiting_external, replay exacto, execution/turn equivocado,
execution cruzada, retry tardío y expiry.

## Trazabilidad

DEC-02, DEC-23; SCN-01, SCN-03.
