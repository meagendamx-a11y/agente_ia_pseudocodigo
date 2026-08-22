# Dependencias de Core antes de implementar

## Gates obligatorios

1. Reconciliar el historial de migraciones canónico con producción antes de cualquier DDL; no ejecutar `supabase db push` desde el root incompleto.
2. Versionar la migración de reseñas que hoy no forma parte del historial trackeado.
3. Corregir el reminder online: una confirmación reciente sin URL no puede suprimir el único `appointment_reminder_1h_online` que porta el enlace. Hasta entonces, creación/reprogramación online del agente queda deshabilitada.
4. Configurar cada webhook Edge externo con `verify_jwt=false` explícito y autenticación custom HMAC; funciones de usuario conservan auth adecuada.
5. Preferir nuevas Supabase secret keys con fallback temporal a service-role legacy durante transición; no reescribir sender/callback en el mismo corte.
6. Verificar correlación de recursos: outbox de `patient_resource_delivery` conserva `batch_id` server-only, `provider_message_id` y retención suficiente.
7. Verificar en Kapso IDs, Agent Node, API Trigger/resume, invocation ID y Flow E2E; kill switch permanece off.

## Runtime que no se cambia

- `whatsapp_outbox -> sender_whatsapp -> enviar-whatsapp -> Kapso`.
- `kapso_status_callback -> record_outbox_provider_status` para `sent/delivered/read/failed`.
- ACL de cron server-only ya corregida por `20260822075045 cron_server_only_acl`.
- `jobs_solo_recursos_bi` permanece restrictivo; el agente no crea jobs de confirmación.

## Regla de enlace online

El agente nunca tiene tool de URL. Si no hay enlace, la respuesta dice que lo envía directamente el profesional. La corrección del reminder vive en un plan Core separado con pruebas DB; no se resuelve desde prompt, Flow ni sender.

## Catálogo de mensajes

Verificar las 14 keys indicadas en `docs/MESSAGES.md`, la invitación manual de reseña y la futura reactivación. Reactivación no forma parte del agente. Cualquier limpieza de keys huérfanas requiere comprobar referencias provider primero.

## Mantenimiento

Cada RPC valida expiración inline; cleanup nunca autoriza. Programar en la implementación futura `sweep_expired_agent_sessions(1000)` al minuto 15 de cada hora. Producción ya tiene una purga inbound horaria: verificar que use 30 días/batch 5000 y no crear otro cron si es equivalente. La purga nueva debe respetar el orden option→tool→turn→inbound.

El pseudocódigo anterior de `quick_reply_token_hash`/botón queda sustituido para el agente por correlación authenticated quoted reply y emisión lazy de option token.

