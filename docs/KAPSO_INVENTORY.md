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
| Workflow/Flow ID y versión | Draft configurado, conectado e inactivo | `Agenda PSI — Agente WhatsApp — Draft`, ID `d4ab8c62-f138-4869-a501-19e60c4483ff`, con API Trigger (Start) → Agent Node → Function Node de cierre; ningún WhatsApp Flow disponible. |
| `gpt-5.6-luna` en Agent Node | configurado en Draft | OpenAI, temperatura `0`, reasoning `medium`, `max_iterations=16`, `max_tokens=2048`; el `provider_model_id` interno aún no se ha fijado. |
| Tools del Agent Node | primera tool conectada en Draft | `get_capabilities` usa la Function privada `agenda-psi-complete-inbound`, input `{}` cerrado y ruta fija `/tools/capabilities`. `send_notification_to_user`, `enter_waiting` y `complete_task` siguen habilitadas; las demás tools de dominio permanecen desconectadas. |
| Semántica primer input/resume | parcial | Un inbound real verificó webhook, admisión, variables, start y bind; la ejecución terminó en `start` por aristas faltantes. El Draft ya conserva las dos aristas, pero falta repetir el inbound. |
| Tool invocation ID estable en retry | parcial | `get_capabilities` no depende de ese ID: se sella una vez por inbound + ejecución. Sigue siendo gate para las demás tools directas. |
| `send_notification_to_user -> complete_task` | verificado en Test mode | El Agent Node avanzó por `complete_task` hasta el Function Node. Tras sincronizar el secreto y corregir el pathname interno de Supabase, la Function privada devolvió `200` y cerró un inbound correlacionado. Falta comprobar el mismo recorrido dentro de un nuevo inbound real. |
| `nfm_reply`, encryption y data endpoint | no verificado | Gate E2E. |
| Flow JSON estático 7.0 / Data API 3.0 | comprobado contra docs públicas | Artefacto local; aún no validado por provider. |

## Consecuencia

`config/agent-node.json.deployment_enabled=false` y `tool-allowlist.json.agent_node_enabled=false`. La autenticación gateway, las aristas y el cierre correlacionado ya no bloquean. Sí bloquea la activación repetir el E2E inbound para comprobar contexto, `get_capabilities`, entrega y cierre dentro de la misma ejecución. La identidad idempotente sigue pendiente para tools posteriores; Flow/media conservan su propio gate.

## Preflight reproducible

1. Mantener registrados el workflow ID y su estado Draft.
2. Enviar un inbound de prueba y comprobar contexto WhatsApp real al API Trigger.
3. Hacer Wait/resume y comprobar continuidad de conversación/turno.
4. Confirmar que un retry de `get_capabilities` devuelve el resultado sellado sin aumentar el presupuesto.
5. Observar en E2E real el orden del mensaje final, Function Node y `agent_complete_inbound_from_workflow`.
6. Probar `nfm_reply`, flow token y respuesta data API 3.0.
7. Actualizar el lock a `verified_e2e` en un cambio revisado; nunca cambiar modelo automáticamente.
