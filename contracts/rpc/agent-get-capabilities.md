# `agent_get_capabilities`

Tipo: `query`
Actor: gateway service-only

## Objetivo

Devolver acciones permitidas y reason codes sin exponer políticas o estados internos.

## Entrada externa

Modelo: `{}`. Interno: `(session_id uuid) -> jsonb`.

## Contexto inyectado

Sesión/turno/relación sellados por gateway.

## Lee

`agent_sessions`, `whatsapp_links`, `patients`, professional policies, citas y perfil público.

## Escribe

Cero escrituras de dominio; puede emitir option handles técnicos de relación/perfil.

## Validaciones

Sesión/relación reales. Esta es una excepción controlada: puede describir que la relación está inactiva, pero no habilitar dominio.

## Flujo lógico

Derivar booleans para scheduling, acciones sobre cita existente, perfil, proof/resources/review y reason codes. Si inactivo, allowlist reducida a perfil público aprobado/soporte.

## Transacción/locks/idempotencia

Query consistente; emisión técnica estable/idempotente.

## Salida redactada

`{relationship_state, capabilities:{...}, reason_codes:[...]}` sin filas de política ni IDs.

## Errores seguros

`SESSION_EXPIRED`, `RELATIONSHIP_NOT_SELECTED`, `RELATIONSHIP_NOT_AVAILABLE`.

## No debe hacer

No autorizar por prompt, no devolver políticas crudas y no ejecutar dominio.

## Pruebas mínimas

Activo/inactivo, sin relación, perfil aprobado/no visible y capabilities contradictorias.

## Trazabilidad

DEC-08, DEC-14; SCN-11, SCN-37.

