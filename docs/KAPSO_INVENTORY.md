# Inventario y preflight Kapso

Observado: 2026-08-23 (America/Mexico_City).

## Estado verificable

| Elemento | Estado | Evidencia |
|---|---|---|
| Documentación pública de Agent Node | disponible | <https://docs.kapso.ai/docs/flows/step-types/agent-node> |
| Webhooks/payload | documentación disponible | <https://docs.kapso.ai/docs/platform/webhooks/overview> |
| Start/resume API | documentación disponible | <https://docs.kapso.ai/docs/workflows/start-and-resume-via-api> |
| Dynamic Flow/data endpoint | documentación disponible | <https://docs.kapso.ai/docs/whatsapp/flows/static-vs-dynamic> |
| Cuenta/workspace autenticado | verificado | Proyecto `Agenda Psi`, ID `7cacfa3c-18f3-42c7-9623-22503fb947c7`, plan Free. |
| Número/webhook/target real | verificado parcialmente | Target `1189669584231262`; webhook inbound v2 y callback de estados activos. |
| Workflow/Flow ID y versión | Draft configurado, conectado e inactivo | `Agenda PSI — Agente WhatsApp — Draft`, ID `d4ab8c62-f138-4869-a501-19e60c4483ff`, con API Trigger (Start) → Agent Node; ningún Flow disponible. |
| `gpt-5.6-luna` en Agent Node | configurado en Draft | OpenAI, temperatura `0`, reasoning `medium`, `max_iterations=16`, `max_tokens=2048`; el `provider_model_id` interno aún no se ha fijado. |
| Tools del Agent Node | mínimo de preflight | Cero custom/domain tools; `send_notification_to_user`, `enter_waiting` y `complete_task` habilitadas; 9 tools opcionales apagadas. `handoff_to_human` es obligatorio en Kapso, pero el prompt prohíbe usarlo y dirige a soporte autoservicio. |
| Semántica primer input/resume | no verificado | Gate E2E. |
| Tool invocation ID estable en retry | no verificado | Gate obligatorio para tools directas. |
| `send_notification_to_user -> complete_task` | verificado en Test mode | Terminó `Completed` en 4 s, en ese orden y sin `Waiting`; `$0.0006`, 4,096 tokens, 2 llamadas. No cubre Function Node/RPC. |
| `nfm_reply`, encryption y data endpoint | no verificado | Gate E2E. |
| Flow JSON estático 7.0 / Data API 3.0 | comprobado contra docs públicas | Artefacto local; aún no validado por provider. |

## Consecuencia

`config/agent-node.json.deployment_enabled=false` y `tool-allowlist.json.agent_node_enabled=false`. La autenticación, el inventario y el cierre interno del Draft ya no bloquean. Sí bloquean la activación la semántica API Trigger/resume real, el `whatsapp_context`, la identidad idempotente de tools y el cierre completo hasta RPC. El Test mode mostró un input sintético en inglés y `context.phone_number=null`; Flow/media requieren su propio gate.

## Preflight reproducible

1. Mantener registrados el workflow ID y su estado Draft.
2. Enviar un inbound de prueba y comprobar contexto WhatsApp real al API Trigger.
3. Hacer Wait/resume y comprobar continuidad de conversación/turno.
4. Forzar un retry de tool y confirmar el mismo invocation ID.
5. Observar en E2E real el orden del mensaje final, Function Node y complete RPC.
6. Probar `nfm_reply`, flow token y respuesta data API 3.0.
7. Actualizar el lock a `verified_e2e` en un cambio revisado; nunca cambiar modelo automáticamente.
