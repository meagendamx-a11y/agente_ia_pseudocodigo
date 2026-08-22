# `agent_register_inbound_context`

Tipo: `command`
Actor: Edge inbound autenticado (`service_role`)

## Objetivo

Sellar replay, identidad, relación, límites y turno en una transacción.

## Entrada externa

No visible al modelo. Firma interna futura:

```text
(webhook_delivery_key text, provider_message_id text,
 reply_to_provider_message_id text?, payload_sha256 text,
 sender_phone_e164 text, target_phone_number_id text,
 kapso_contact_id text?, business_portfolio_id text?,
 business_scoped_user_id text?, kapso_conversation_id text,
 provider_received_at timestamptz) -> jsonb
```

## Contexto inyectado

Todos los argumentos provienen del sobre autenticado; `received_at=clock_timestamp()` es server-side.

## Lee

`public.whatsapp_inbound_messages`, `public.whatsapp_links`, `public.agent_sessions`, `public.agent_turns`, `public.whatsapp_outbox` para reply de recursos.

## Escribe

Ledger inbound, sesión/turno/control y, si hay correlación exacta de recursos, option handle técnico. Cero escrituras de dominio.

## Validaciones

- E.164, longitudes, hash hex, target autorizado y timestamp.
- Reutilización de delivery key o provider ID con hash/correlación distinta es rechazo de seguridad.
- Conversación existente debe conservar sender/contact/target.
- Para dominio, la relación se revalida con `patients.patient_status='active'`; cero relaciones solo habilita modo público sin tools.

## Flujo lógico

1. Insertar identidad externa única.
2. Resolver **replay antes del conteo de límite/rate**; devolver resultado sellado sin consumir cupo.
3. Resolver 0/1/N relaciones por índices confiables.
4. Tomar advisory locks en orden estable **teléfono/phone → profesional/professional**.
5. Contar ventanas móviles: inbound 10/5m; turnos 5/5m, 30/24h teléfono y 100/24h profesional.
6. Sellar `admission_status/reason`, claim de aviso 15m y crear/reanudar un único turno no terminal.
7. Renovar sesión 24h solo por este inbound válido.
8. Si `reply_to_provider_message_id` corresponde exactamente a `patient_resource_delivery`, validar outbox/phone/target/batch y emitir invitación lazy; ambigüedad falla cerrado.

## Transacción/locks/idempotencia

Una transacción; uniques por delivery key y provider message; locks advisory en orden estable; índice parcial por conversación no terminal. Replay exacto ilimitado durante retención.

## Salida redactada

`{status: admitted|resumed|rate_limited|replay|rejected, reason_code, turn_ref, session_ref, relationship_choices?, resource_invitation_token?, notice_claimed}`. Las refs internas solo regresan a Edge, nunca al modelo.

## Errores seguros

`INVALID_ENVELOPE`, `REPLAY_MISMATCH`, `IDENTITY_CONFLICT`, `RATE_LIMITED`, `RELATIONSHIP_AMBIGUOUS`, `RESOURCE_CORRELATION_FAILED`.

## No debe hacer

No iniciar Kapso, no llamar LLM, no confiar en texto, no renovar desde outbound/tool y no buscar batches históricos si falta quoted reply.

## Pruebas mínimas

Replay exacto/mismatch; carreras teléfono/profesional; 0/1/N relaciones; sesión/turno concurrente; inactivo; target cambiado; reply de recursos exacto/ambiguo/purgado.

## Trazabilidad

DEC-08, DEC-16, DEC-20, DEC-24, DEC-25; SCN-03..SCN-08, SCN-11, SCN-35.
