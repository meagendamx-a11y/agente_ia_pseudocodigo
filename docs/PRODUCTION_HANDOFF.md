# Handoff de implementación, rollout y rollback

## Estado de esta entrega

Guía contractual completa; no contiene SQL/Edge desplegable. No se cambió Supabase ni Kapso. El preflight autenticado de Kapso está bloqueado y, por diseño, Agent Node/tools están deshabilitados.

## Secuencia autorizable

1. Reconciliar migraciones DB, versionar reseñas y crear ambiente/branch aislado con kill switch off.
2. Implementar estado aditivo, helpers, admission y gateway; probar sin LLM.
3. En workspace/número Kapso de prueba, registrar IDs no secretos y cumplir todo `docs/KAPSO_INVENTORY.md`.
4. Habilitar solo tools read-only para un profesional allowlisted.
5. Corregir reminder online y ejecutar pruebas de concurrencia antes de Flow/mutaciones.
6. Activar confirmación, create, cancel, reschedule y modalidad por separado.
7. Activar comprobantes, recursos y reseñas como cortes independientes.

Cada corte requiere revisión del diff, migración reversible/aditiva, tests, advisors Supabase y un rollback ensayado. Sender/callback quedan fuera de los cortes.

## Métricas sin PII

401/5xx, latencia p95, replay/rate-limit, tool count, ordinal/command duplicado, unknown outcome, provider message desconocido, outbox dead letters, Flow errors y costo por workflow. Revisar costo beta diariamente; nunca fallback costoso automático.

## Rollback

1. Apagar kill switch server-side y deshabilitar ruta inbound/Agent Node en Kapso.
2. Mantener sender/callback y tablas/logs aditivos.
3. Expirar turns pendientes y revocar EXECUTE de RPC agent.
4. Volver a la Edge/config provider anterior solo si fue modificada.
5. Nunca borrar evidencia ni compensar destructivamente citas, pagos, proofs o reseñas.

## Gates pendientes

- Kapso autenticado: modelo/IDs, start/resume, invocation identity, send/complete y Flow.
- Baseline de migraciones DB reproducible.
- Corrección y prueba del reminder online.
- Correlación `patient_resource_delivery` outbox→provider message→batch.
- Implementación SQL/Edge real y E2E de `docs/TEST_PLAN.md`.

## Publicación de esta guía

El primer push al remoto vacío requiere aprobación del propietario. Después de publicar y aceptar un commit inmutable, Agenda PSI V2 puede fijarlo como referencia read-only en otro cambio revisado.

