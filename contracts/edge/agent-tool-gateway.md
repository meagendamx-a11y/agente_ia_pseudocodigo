# `agent_tool_gateway`

Tipo: `webhook/gateway`
Actor: Kapso workflow autenticado
Ruta futura: un path fijo por operación

## Objetivo

Ser la única frontera entre Agent Node/Flow/media/workflow y wrappers service-only, aplicando allowlist, contexto, presupuesto e idempotencia.

## Entrada externa

Payload seguro por operación conforme a `config/tool-allowlist.json`. El modelo puede enviar únicamente tokens opacos, valores de negocio acotados y confirmaciones explícitas.

## Contexto inyectado

Sesión, turno, ejecución, mensaje, surface y key derivada por servidor. Para Agent Node: ejecución + **invocación del proveedor/provider invocation** estable; para Flow: **handle del token Flow/Flow token handle** + acción + hash canónico; media: provider message + ordinal; interno: ejecución + paso fijo.

## Lee

Allowlist/config, sesión/turno y contratos de claim/finalize.

## Escribe

Control técnico por helpers y, mediante una sola ruta fija, el wrapper de dominio correspondiente.

## Validaciones

- Autenticación Kapso/server-to-server y target/workflow permitidos.
- Agent Node bloqueado hasta probar E2E el provider invocation ID estable ante retry.
- Operación, método, schema, estado del turno y tamaño de salida permiten solo allowlist.
- Máximo **8** llamadas, timeout **10 segundos/10 s**, una recuperación de transporte con la misma key.
- Token HMAC timing-safe; input hash/hash de entrada canónico; paciente activo en toda ruta privada de dominio.

## Flujo lógico

1. Resolver ruta fija; nunca resolver un nombre de función del body.
2. Derivar contexto/key, canonicalizar input y reclamar tool.
3. Si replay, regenerar bearer tokens desde handles y devolver el resultado sellado.
4. Ejecutar wrapper con session/handles y `command_id` inyectado.
5. Finalizar como committed, rejected_prewrite o unknown y devolver DTO redactado/redacted.

### Saga

`cancel_then_open_booking_flow` es distinto de cancelación normal. El claim inicial pasa `normal -> cancel_claimed`; rechazo pre-write restaura normal/1; cancel commit pasa a `awaiting_replacement_create`. Desde allí, **solo create** puede ser la segunda mutación. Un slot stale libera reserva pero conserva el estado; un outcome desconocido bloquea hasta reconciliar.

## Transacción/locks/idempotencia

Claim/finalize son transacciones cortas; wrapper ejecuta su propia transacción de dominio. Nunca se reintenta con nueva key o `command_id`; un timeout consulta claim/`command_log` y, si sigue desconocido, se cierra seguro.

## Salida redactada

DTO allowlisted menor a 16 KiB, reason codes y tokens opacos. Sin IDs, SQL, stack, teléfono, rutas o estados internos.

## Errores seguros

`UNAUTHENTICATED`, `OPERATION_NOT_ALLOWED`, `SCHEMA_INVALID`, `TOKEN_INVALID`, `TOOL_BUDGET_EXCEEDED`, `MUTATION_BLOCKED`, `TIMEOUT`, `UNKNOWN_OUTCOME`.

## No debe hacer

- Aceptar función/ID/session/command/key arbitrarios.
- Consultar tablas directamente desde el modelo o exponer secretos.
- Ejecutar segunda mutación normal, tercera mutación o reintento con identidad nueva.
- Habilitar agent_node mientras el gate Kapso esté bloqueado.

## Pruebas mínimas

Auth/route/schema; key estable; replay antes/después commit; novena llamada; timeout; resultado grande/PII; bypass entre superficies; todas las transiciones de saga; inactivo.

## Trazabilidad

DEC-01, DEC-08, DEC-23, DEC-26; SCN-11, SCN-24..SCN-37.
