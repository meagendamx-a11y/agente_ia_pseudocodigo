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
| Workflow/Flow ID y versión | Draft configurado, inactivo | `Agenda PSI — Agente WhatsApp — Draft`, ID `d4ab8c62-f138-4869-a501-19e60c4483ff`, con API Trigger y Agent Node; ningún Flow disponible. |
| `gpt-5.6-luna` en Agent Node | configurado en Draft | OpenAI, temperatura `0`, reasoning `medium`, `max_iterations=16`, `max_tokens=2048`; el `provider_model_id` interno aún no se ha fijado. |
| Tools del Agent Node | mínimo de preflight | Cero custom/domain tools; 10 tools opcionales apagadas. `enter_waiting`, `complete_task` y el `handoff_to_human` obligatorio de Kapso quedan presentes; el prompt prohíbe usar handoff y dirige a soporte autoservicio. |
| Semántica primer input/resume | no verificado | Gate E2E. |
| Tool invocation ID estable en retry | no verificado | Gate obligatorio para tools directas. |
| `auto_send -> complete_task -> Function Node` | no verificado | Gate E2E. |
| `nfm_reply`, encryption y data endpoint | no verificado | Gate E2E. |
| Flow JSON estático 7.0 / Data API 3.0 | comprobado contra docs públicas | Artefacto local; aún no validado por provider. |

## Consecuencia

`config/agent-node.json.deployment_enabled=false` y `tool-allowlist.json.agent_node_enabled=false`. La autenticación y el inventario básico ya no bloquean; sí bloquean la activación la semántica API Trigger/resume, la identidad idempotente de tools y el E2E de cierre. Flow/media requieren su propio gate.

## Preflight reproducible

1. Mantener registrados el workflow ID y su estado Draft.
2. Enviar un inbound de prueba y comprobar contexto WhatsApp real al API Trigger.
3. Hacer Wait/resume y comprobar continuidad de conversación/turno.
4. Forzar un retry de tool y confirmar el mismo invocation ID.
5. Observar orden del mensaje final y Function Node.
6. Probar `nfm_reply`, flow token y respuesta data API 3.0.
7. Actualizar el lock a `verified_e2e` en un cambio revisado; nunca cambiar modelo automáticamente.
