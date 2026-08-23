# `private.agent_resolve_option_token`

Tipo: `query/command privado`
Actor: wrapper allowlisted

## Objetivo

Resolver un handle a su binding interno tras revalidar capacidad y consumirlo
atómicamente solo cuando el kind one-time llega a su paso terminal.

## Firma SQL as-built

`private.agent_resolve_option_token(p_session_id uuid,p_turn_id uuid,p_random_handle uuid,p_expected_kind text,p_consume boolean) -> jsonb`

Helper `SECURITY DEFINER SET search_path=''`, propiedad de
`agenda_psi_agent_owner`, sin `EXECUTE` para roles API.

## Entrada externa

Ninguna directa. El wrapper privado aporta handle ya autenticado y expected kind;
el modelo no puede llamar este helper.

## Contexto inyectado

Session/turn UUID de control, handle, kind esperado y decisión server-side de si
el paso actual consume un one-time.

## Lee

`public.agent_sessions`, `public.agent_turns`, `public.agent_option_tokens`,
`private.agent_token_key_registry`, `public.whatsapp_links`, `public.patients`,
`public.services`, `public.appointments`.

## Escribe

Solo `agent_option_tokens.consumed_at` cuando `one_time=true` y
`p_consume=true`.

## Validaciones

- Input malformado: SQLSTATE `22023`, `INVALID_OPTION_RESOLVE`.
- Lock order `session -> turn -> token`.
- Session/turn/token coinciden exactamente en conversación, teléfono, target,
  tenant y binding; session/turn/token y key deadline siguen vigentes.
- `p_expected_kind` coincide con la fila y la entidad sigue visible según la
  misma matriz cerrada de issue.
- Token reutilizable siempre exige `p_consume=false` y nunca recibe
  `consumed_at`.
- Token one-time puede resolverse con false para lecturas intermedias; el primer
  consume true sella `consumed_at` y cualquier resolve posterior devuelve
  `TOKEN_CONSUMED`.

## Flujo lógico

1. Bloquear sesión, turno y token.
2. Revalidar contexto, TTL, `verify_until`, kind y visibilidad actual.
3. Si consume y es one-time no consumido, sellar consumo en la misma
   transacción.
4. Devolver binding solo al wrapper privado. El wrapper traduce a DTO público
   sin IDs internos.

## Transacción/locks/idempotencia

Consumo atómico. Dos consumers no ganan. Replay de una tool ya finalizada se
resuelve desde su claim sellado y no vuelve a resolver/consumir el token.

## Salida redactada

DTO exacto: `{status,reason,kind,entity_type,entity_id,patient_id,professional_id,consumed}`.

Status `resolved|rejected`. Los UUID de entidad/tenant nunca cruzan al modelo ni
a una respuesta Edge visible.

## Errores seguros

`INVALID_OPTION_RESOLVE`, `TOKEN_CONTEXT_INVALID`, `TOKEN_NOT_FOUND`,
`TOKEN_EXPIRED`, `TOKEN_KEY_INVALID`, `TOKEN_NOT_VISIBLE`, `TOKEN_CONSUMED`,
`TOKEN_NOT_ONE_TIME`.

## No debe hacer

- Aceptar IDs de dominio desde el modelo o devolver el binding fuera del
  wrapper privado.
- Revivir tokens/session/turn expirados.
- Consumir tokens reutilizables ni consumir dos veces un one-time.

## Pruebas mínimas

Cinco kinds; sesión/turno/tenant extranjero; kind y deadlines; visibilidad que
cambia; one-time false→true→consumed; reusable false y consume rechazado.

## Trazabilidad

DEC-08, DEC-23, DEC-24; SCN-04, SCN-06, SCN-14.
