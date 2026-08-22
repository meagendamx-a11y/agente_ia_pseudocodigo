# `sweep_expired_agent_sessions`

Tipo: `cron/command de mantenimiento`
Actor: sistema service-only

## Objetivo

Expirar sesiones/turnos vencidos en lotes acotados; la autorización siempre se valida inline.

## Entrada externa

Ninguna pública. Firma futura: `(batch integer default 1000) -> integer`.

## Contexto inyectado

Clock server-side y owner del cron.

## Lee

`agent_sessions`, `agent_turns`, option tokens y tool reservations.

## Escribe

Estado/expiry de control; cero escrituras de dominio.

## Validaciones

Service-only; batch 1..1000; session expired por último inbound verificado; turno idle >30m o posterior a sesión.

## Flujo lógico

Reclamar ordenado con `SKIP LOCKED`; marcar sesión/turnos expirados, invalidar capabilities/reservas pendientes y conservar evidencia de outcome unknown.

## Transacción/locks/idempotencia

Lotes cortos, row locks y transición monotónica. Repetir no cambia filas ya terminales.

## Salida redactada

Cantidad procesada para métrica interna.

## Errores seguros

`INVALID_BATCH`, `MAINTENANCE_CONFLICT`.

## No debe hacer

No borrar evidencia, no autorizar, no renovar sesión, no compensar dominio ni completar unknown outcomes.

## Pruebas mínimas

Sesión/turno vigentes/vencidos, wait, unknown, dos sweepers, batch y replay.

## Trazabilidad

DEC-24; SCN-03, SCN-32.
