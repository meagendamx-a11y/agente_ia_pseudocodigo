# `purge_whatsapp_inbound`

Tipo: `cron/command de mantenimiento`
Actor: sistema service-only

## Objetivo

Eliminar control terminal más antiguo que la ventana de auditoría/replay en orden seguro y acotado.

## Entrada externa

Ninguna pública. Firma futura: `(p_older_than interval default interval '30 days', p_batch integer default 5000) -> integer`.

## Contexto inyectado

Clock y parámetros fijos del cron verificados.

## Lee

Option tokens, tool calls, terminal turns y inbound ledger.

## Escribe

Elimina únicamente control/auditoría elegible; cero dominio.

## Validaciones

Service-only; retención mínima 30d; batch 1..5000; solo terminal, sin outcome unknown/reserva/turno activo.

## Flujo lógico

Borrar en dependencia: option rows expiradas → tool calls de turnos terminales → turnos terminales → inbound sin dependientes, usando lote bounded.

## Transacción/locks/idempotencia

`SKIP LOCKED`, commits por lote e idempotencia natural. Un bearer expirado sigue inválido aunque su fila se retenga.

## Salida redactada

Cantidad de inbound raíz purgada; métricas internas por tipo pueden registrarse sin PII.

## Errores seguros

`RETENTION_TOO_SHORT`, `INVALID_BATCH`, `ACTIVE_DEPENDENCY`.

## No debe hacer

No borrar citas/pagos/proofs/reviews/jobs/outbox, evidencia unknown, sesiones vigentes ni acortar retención para liberar espacio.

## Pruebas mínimas

Orden FK, terminal/no terminal, 29/30/31 días, unknown, dos purgers y batch 5000.

## Trazabilidad

DEC-24, DEC-25; SCN-03, SCN-04, SCN-32.
