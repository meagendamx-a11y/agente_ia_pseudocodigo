# Inventario y preflight Kapso

Observado: 2026-08-22 (America/Mexico_City).

## Estado verificable

| Elemento | Estado | Evidencia |
|---|---|---|
| Documentación pública de Agent Node | disponible | <https://docs.kapso.ai/docs/flows/step-types/agent-node> |
| Webhooks/payload | documentación disponible | <https://docs.kapso.ai/docs/platform/webhooks/overview> |
| Start/resume API | documentación disponible | <https://docs.kapso.ai/docs/workflows/start-and-resume-via-api> |
| Dynamic Flow/data endpoint | documentación disponible | <https://docs.kapso.ai/docs/whatsapp/flows/static-vs-dynamic> |
| Cuenta/workspace autenticado | bloqueado | La superficie de navegador disponible abrió `/users/sign_in`. |
| Número/webhook/target real | no verificado | No se inspeccionó un workspace autenticado. |
| Workflow/Flow ID y versión | no verificado | No se inventan valores. |
| `provider_model_id` para Luna | no verificado | `null` en el lock. |
| Semántica primer input/resume | no verificado | Gate E2E. |
| Tool invocation ID estable en retry | no verificado | Gate obligatorio para tools directas. |
| `auto_send -> complete_task -> Function Node` | no verificado | Gate E2E. |
| `nfm_reply`, encryption y data endpoint | no verificado | Gate E2E. |
| Flow JSON estático 7.0 / Data API 3.0 | comprobado contra docs públicas | Artefacto local; aún no validado por provider. |

## Consecuencia

`config/agent-node.json.deployment_enabled=false` y `tool-allowlist.json.agent_node_enabled=false`. Ninguna tool de Agent Node se habilita hasta completar todos los checks con un número/workflow de prueba. Flow/media pueden implementarse únicamente después de validar su propia identidad idempotente.

## Preflight reproducible

1. Registrar IDs no secretos y versión publicada/draft.
2. Enviar un inbound de prueba y comprobar contexto WhatsApp real al API Trigger.
3. Hacer Wait/resume y comprobar continuidad de conversación/turno.
4. Forzar un retry de tool y confirmar el mismo invocation ID.
5. Observar orden del mensaje final y Function Node.
6. Probar `nfm_reply`, flow token y respuesta data API 3.0.
7. Actualizar el lock a `verified_e2e` en un cambio revisado; nunca cambiar modelo automáticamente.
