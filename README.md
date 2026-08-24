# Agente de IA de WhatsApp — guía contractual

> **No desplegable:** este repositorio contiene pseudocódigo, contratos, configuraciones de referencia y pruebas estáticas. No contiene SQL de producción ni Edge Functions ejecutables.

Define la implementación futura del agente de WhatsApp de Agenda PSI sobre Kapso y Supabase. La guía separa el webhook inbound y las tools del rail existente de `whatsapp_outbox`, `enviar-whatsapp` y `kapso_status_callback`.

## Estado

- Fuentes históricas fijadas por commit y SHA-256.
- Contratos futuros service-only, sin acceso del modelo a tablas ni IDs internos.
- Inventario autenticado de Kapso y primer inbound real verificados hasta `get_capabilities`, entrega y `Waiting`; el resume sigue bloqueado hasta sincronizar `agent_mark_inbound_waiting` antes de `enter_waiting`.
- Ningún artefacto de este repositorio debe ejecutarse directamente contra producción.

## Comandos

```bash
npm run check
node scripts/verify-legacy-sources.mjs --source /ruta/a/database_pseudocodigo
```

Consulta `docs/PRODUCTION_HANDOFF.md` antes de convertir estos contratos en migraciones o Edge Functions.

## Inventario

- 26 RPC service-only, 3 contratos Edge, 4 helpers privados y 1 worker.
- 26 decisiones y 37 escenarios trazados.
- 13 funciones legacy clasificadas 8 rewrite / 3 replace / 2 omit.
- WhatsApp Flow de seis pantallas con éxito posterior al commit.
- Configuración fail-closed mientras el E2E wait/resume/complete siga pendiente.

Documentos de entrada: `docs/AGENT_WHATSAPP_SPEC.md`, `docs/ARCHITECTURE.md` y `docs/FUNCTION_MATRIX.md`. Seguridad: `docs/SECURITY.md`. Estado comprobado del runtime: `docs/IMPLEMENTATION_STATUS.md`. Implementación/validación: `docs/CORE_DEPENDENCIES.md`, `docs/TEST_PLAN.md` y `docs/PRODUCTION_HANDOFF.md`.
