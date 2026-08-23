# `private.agent_issue_option_handle`

Tipo: `command privado`
Actor: wrapper allowlisted

## Objetivo

Crear o recuperar un handle estable ligado a sesión, turno, tenant y una entidad
visible sin exponer su UUID al modelo.

## Firma SQL as-built

`private.agent_issue_option_handle(p_session_id uuid,p_turn_id uuid,p_kind text,p_entity_type text,p_entity_id uuid,p_stable_key text,p_key_id text,p_expires_at timestamptz,p_one_time boolean) -> jsonb`

Helper `SECURITY DEFINER SET search_path=''`, propiedad de
`agenda_psi_agent_owner`, sin `EXECUTE` para roles API.

## Entrada externa

Ninguna directa. El wrapper obtiene IDs y stable key desde queries autorizadas;
el token/bearer presentado por un caller no entra a este helper.

## Contexto inyectado

Todos los UUID, stable key, key ID y expiry provienen del wrapper privado. Edge
recibe solo el material mínimo para construir el bearer; el modelo no elige
ningún binding.

## Lee

`public.agent_sessions`, `public.agent_turns`, `public.agent_option_tokens`,
`private.agent_token_key_registry`, `public.whatsapp_links`, `public.patients`,
`public.services`, `public.appointments`.

## Escribe

Solo `public.agent_option_tokens`; cero escrituras de dominio.

## Matriz estructural exacta

| kind | entity_type | TTL min | one_time | Visibilidad autoritativa |
|---|---|---:|---:|---|
| relationship | whatsapp_link | 10 | true | Link exacto, teléfono/narrowing de sesión y patient compuesto activo; admite turno tenantless ambiguous. |
| service | service | 15 | false | Servicio activo del profesional activo del turno. |
| appointment | appointment | 15 | false | Cita de la pareja exacta patient/professional del turno. |
| slot | service_slot | 5 | true | `services.id=entity_id`, activo y del profesional del turno; stable key sella el slot. |
| flow | turn | 15 | true | `entity_id` es el UUID del turno actual. |

Otra terna `kind/entity_type/one_time` es inválida; no existe polimorfismo libre
ni SQL dinámico.

## Validaciones

- Input malformado: SQLSTATE `22023`, `INVALID_OPTION_ISSUE`.
- Lock order `session -> turn -> token`.
- Session y turn coinciden en conversación, teléfono, target, tenant y vínculo;
  ambos siguen vivos y en estado permitido.
- Expiry es futuro y no rebasa TTL del kind, expiración de sesión/turno ni
  `verify_until` de la key.
- Una emisión nueva además requiere `can_issue=true`.
- Relationship exige `entity_id=whatsapp_links.id`, mismo phone, narrowing
  contact/portfolio+BSUID y join patient/professional activo exacto.

## Stable issuance y rotación

La unique `(turn_id,kind,stable_key)` converge carreras. Un replay stable exige
que session, turn, kind, entity type/ID y one-time coincidan; key/expiry pedidos
se ignoran y se devuelven los originales. También revalida contexto/visibilidad,
y la key almacenada debe conservar `verify_until > now()` y
`verify_until >= stored expires_at`; no requiere que siga `can_issue=true`.

Una stable key existente nunca se sobrescribe cuando su fila está expirada:
devuelve `TOKEN_EXPIRED_STABLE_KEY`. El caller debe derivar una stable key nueva.

## Flujo lógico

1. Validar input y bloquear sesión/turno.
2. Buscar stable issuance y bloquearla si existe.
3. Revalidar deadlines, key registry y entidad visible.
4. En replay válido, devolver handle/key/expiry originales.
5. En emisión nueva, generar `random_handle`, derivar tenant exacto y guardar el
   binding. Nunca guardar bearer, MAC/HMAC o secreto.

## Transacción/locks/idempotencia

Una transacción con lock `session -> turn -> token`. La unique estable converge
dos emisores; replay exacto devuelve la fila original sin refresh.

## Salida redactada

DTO exacto: `{status,reason,random_handle,kind,expires_at,key_id,replay}`.

Status `issued|rejected`; nuevo `ISSUED`, replay `EXACT_REPLAY`.
`random_handle` no es un ID de dominio.

## Errores seguros

`INVALID_OPTION_ISSUE`, `OPTION_CONTEXT_INVALID`, `OPTION_ISSUE_MISMATCH`,
`OPTION_KIND_INVALID`, `OPTION_EXPIRY_INVALID`, `OPTION_KEY_INVALID`,
`OPTION_NOT_VISIBLE`, `TOKEN_EXPIRED_STABLE_KEY`.

## No debe hacer

- Persistir o devolver bearer, HMAC, secreto o PII.
- Extender sesión/turno/token por replay.
- Emitir un binding de otro tenant o confiar en una entidad enviada por modelo.

## Pruebas mínimas

Las cinco ternas; límites/deadlines; tenant/context mismatch; stable replay;
rotación; expired stable key; carrera convergente.

## Trazabilidad

DEC-24; SCN-06, SCN-14, SCN-16.
