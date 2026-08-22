# Agente de IA de WhatsApp — guía contractual

> **No desplegable:** este repositorio contiene pseudocódigo, contratos, configuraciones de referencia y pruebas estáticas. No contiene SQL de producción ni Edge Functions ejecutables.

Define la implementación futura del agente de WhatsApp de Agenda PSI sobre Kapso y Supabase. La guía separa el webhook inbound y las tools del rail existente de `whatsapp_outbox`, `enviar-whatsapp` y `kapso_status_callback`.

## Estado

- Fuentes históricas fijadas por commit y SHA-256.
- Contratos futuros service-only, sin acceso del modelo a tablas ni IDs internos.
- Validación autenticada de Kapso pendiente: la configuración permanece bloqueada y las tools deben seguir deshabilitadas hasta cumplir el preflight E2E.
- Ningún artefacto de este repositorio debe ejecutarse directamente contra producción.

## Comandos

```bash
npm run check
node scripts/verify-legacy-sources.mjs --source /ruta/a/database_pseudocodigo
```

Consulta `docs/PRODUCTION_HANDOFF.md` antes de convertir estos contratos en migraciones o Edge Functions.

