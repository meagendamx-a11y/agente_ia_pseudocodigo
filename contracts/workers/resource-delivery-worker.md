# `resource_delivery_worker`

Tipo: `worker`
Actor: sistema service-only

## Objetivo

Procesar de forma segura jobs existentes de recursos ya asignados: batch 25, lease 2 minutos y max 8 intentos.

## Entrada externa

Ninguna pública. Firma futura: `(batch integer default 25) -> summary`; se limita a **batch 25**.

## Contexto inyectado

Clock, lease owner y allowlist fija del job type de recursos.

## Lee

`jobs`, resource batches/assignments/resources, storage metadata y estado de entrega.

## Escribe

Lease/intentos/resultado del mismo job, estado por assignment y agregado de batch.

## Validaciones

Job type ya permitido por `jobs_solo_recursos_bi`, assignment `queued` o lease vencido recuperable, recurso asignado/visible y attempts < **max 8**.

## Flujo lógico

1. Reclamar hasta 25 con `FOR UPDATE SKIP LOCKED` y **lease 2 minutos/2 min**.
2. Procesar cada assignment de forma aislada.
3. En éxito marcar sent; en fallo registrar reason y reintentar el mismo job hasta 8.
4. Calcular estado global desde todos los assignments, no solo el lote.

## Transacción/locks/idempotencia

Claim atómico; unique por assignment; lease recovery reutiliza fila/job. Un fallo no revierte éxitos del lote ni crea otro assignment.

## Salida redactada

`{claimed,sent,retryable_failed,terminal_failed,already_done}` para métricas internas.

## Errores seguros

`JOB_TYPE_NOT_ALLOWED`, `LEASE_CONFLICT`, `RESOURCE_UNAVAILABLE`, `DELIVERY_RETRYABLE`, `DELIVERY_TERMINAL`.

## No debe hacer

No crear/seleccionar recursos, no aflojar trigger, no registrar teléfono/nombre/archivo/contenido y no tocar sender/outbox de WhatsApp.

## Pruebas mínimas

Lote/lease, dos workers, partial failure, recovery, máximo 8, dedup, todos sent y agregado correcto.

## Trazabilidad

DEC-20, DEC-22; SCN-35, SCN-36.
