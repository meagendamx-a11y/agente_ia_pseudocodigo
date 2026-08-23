# `private.agent_claim_tool_call`

Tipo: `command privado`
Actor: wrapper allowlisted, nunca Edge/modelo directo

## Objetivo

Reservar atómicamente replay key, ordinal, presupuesto y `command_id` antes de
ejecutar una operación de dominio o control.

## Firma SQL as-built

`private.agent_claim_tool_call(p_turn_id uuid,p_execution_id text,p_surface text,p_operation text,p_tool_call_key text,p_input_sha256 text,p_is_mutation boolean) -> jsonb`

Es `SECURITY DEFINER SET search_path=''`, propiedad de
`agenda_psi_agent_owner`. `public`, `anon`, `authenticated` y `service_role` no
tienen `EXECUTE`; solo la invocan wrappers privados bajo la frontera autorizada.

## Entrada externa

Ninguna directa. El wrapper traduce una ruta fija a estos argumentos; Edge y el
modelo no pueden invocar el helper ni elegir metadata.

## Contexto inyectado

Todos los campos son derivados server-side: turn UUID de control, execution
sellada, tupla fija de `config/tool-allowlist.json`, key de la superficie y hash
canónico de input. El modelo no construye `tool_call_key`.

## Lee

`public.agent_sessions`, `public.agent_turns`, `public.agent_tool_calls`,
`public.whatsapp_links`, `public.patients`.

## Escribe

`public.agent_turns`, `public.agent_tool_calls`.

## Validaciones

- Input malformado: SQLSTATE `22023`, mensaje `INVALID_TOOL_CLAIM` sin eco.
- Execution, surface, operation, mutation flag y estados deben coincidir con la
  metadata embebida de la allowlist.
- Turno/sesión deben seguir vigentes, vinculados y dentro del estado permitido;
  tools tenant revalidan la pareja activa exacta.
- Tenantless permite únicamente `get_capabilities`, `select_relationship`,
  `send_fixed_response` y el claim técnico `complete_inbound`.

## Flujo lógico

1. Bloquear turno y buscar `(turn_id,tool_call_key)`.
2. Un claim finalizado exacto devuelve replay antes de revalidar estado actual.
   Un claim pendiente exacto revalida execution, estado, TTL y tenant, pero no
   recontabiliza ni refresca.
3. Un campo sellado distinto devuelve `rejected/CLAIM_MISMATCH`.
4. Para claim nuevo, aplicar primero arbitraje de mutación/saga y después el
   presupuesto útil, de modo que una tercera mutación responde siempre
   `MUTATION_BLOCKED`.
5. Reservar ordinal, insertar claim, incrementar `tool_call_count` solo cuando
   sea útil y refrescar turno hasta
   `least(session.expires_at,now()+30 minutes)`.

## Presupuesto y saga

- Hay 8 llamadas útiles, ordinales `1..8`; una novena útil devuelve
  `TOOL_BUDGET_EXCEEDED`.
- Toda mutación y `(agent_node,select_relationship,false)` reciben un
  `command_id` UUID generado en DB. El resto lo recibe nulo.
- Una sola mutación puede quedar pendiente por turno.
- `cancel_then_open_booking_flow` solo se reclama cuando el conteo útil es
  `<=3`; fija `cancel_claimed` y `mutation_limit=2`.
- Tras cancel commit, solo `flow_create_appointment` puede ser la segunda
  mutación. Lecturas Flow terminan como máximo en ordinal 7 y create reserva
  ordinal 8. Una tercera mutación se rechaza con `MUTATION_BLOCKED`.
- Outcome `unknown` deja el turno en `unknown_blocked`.

## Completion técnica

`(workflow_internal,complete_inbound,false)` es la única tupla de ordinal 9.
Solo se crea en `completing` con execution exacta, existe una vez por turno, no
incrementa `tool_call_count` y no refresca actividad/TTL. Su replay pendiente
exacto también es válido después de que `agent_complete_inbound` haya dejado el
turno `completed`; un claim nuevo nunca se crea desde `completed`.

## Transacción/locks/idempotencia

Lock `turn -> tool`; uniques `(turn_id,tool_call_key)`, `(turn_id,ordinal)`,
`command_id`, mutación pendiente y completion técnica son árbitros finales. El
claim no ejecuta dominio.

## Salida redactada

DTO exacto: `{status,reason,ordinal,command_id,replay,outcome,redacted_result}`.

- `status=claimed|finalized|rejected`.
- Nuevo: `claimed/CLAIMED`, `replay=false`.
- Existente exacto: `reason=EXACT_REPLAY`, mismo ordinal/command y status según
  pendiente o finalizado.
- Rechazo semántico devuelve datos nulos.

## Errores seguros

`INVALID_TOOL_CLAIM`, `TURN_NOT_FOUND`, `TURN_EXPIRED`, `CONTEXT_MISMATCH`,
`TOOL_NOT_ALLOWED`, `CLAIM_MISMATCH`, `TOOL_BUDGET_EXCEEDED`,
`MUTATION_PENDING`, `MUTATION_BLOCKED`, `TENANT_REQUIRED`,
`TENANT_NOT_ACTIVE`, `COMPLETION_ALREADY_CLAIMED`.

## No debe hacer

- Ejecutar/compensar dominio o aceptar metadata/key/command desde el modelo.
- Otorgar permisos por un replay pendiente cuya capacidad ya expiró.
- Contar completion técnica como trabajo útil.

## Pruebas mínimas

Metadata completa; tenantless; replay/mismatch; 8 útiles y ordinal 9; command
allocation iff; una mutación pendiente; saga completa; TTL/tenant drift.

## Trazabilidad

DEC-23, DEC-25; SCN-28, SCN-29, SCN-32.
