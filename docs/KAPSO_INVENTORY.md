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
| Tools del Agent Node | 2 tools conectadas en Draft | `get_capabilities` usa la Function privada `agenda-psi-complete-inbound` y `/tools/capabilities`; `sync_waiting` usa `agenda-psi-mark-inbound-waiting` y `/workflow/waiting`. Ambas aceptan input `{}` y lo validan en runtime. `send_notification_to_user`, `enter_waiting` y `complete_task` siguen habilitadas; las demás tools de dominio permanecen desconectadas. |
| Semántica primer input/resume | primer input verificado; resume posterior al fix pendiente | El E2E previo llegó a `get_capabilities`, envió la respuesta y quedó en `Waiting`; el follow-up recibió `TURN_BUSY`. La ruta que sincroniza `waiting_external` ya está desplegada y conectada, pero todavía falta repetir el E2E. |
| Tool invocation ID estable en retry | parcial | `get_capabilities` no depende de ese ID: se sella una vez por inbound + ejecución. Sigue siendo gate para las demás tools directas. |
| `send_notification_to_user -> sync_waiting -> Waiting` | conectado en Draft; E2E pendiente | `/workflow/waiting` llama `agent_mark_inbound_waiting`; el prompt solo permite `enter_waiting` después de `ok=true,status=waiting`. |
| `complete_task -> Function Node` | verificado por partes | Test mode avanzó al Function Node y la Function privada cerró un inbound correlacionado. Falta probar cierre después de un resume real en la misma ejecución. |
| `nfm_reply`, encryption y data endpoint | no verificado | Gate E2E. |
| Flow JSON estático 7.0 / Data API 3.0 | comprobado contra docs públicas | Artefacto local; aún no validado por provider. |

## Consecuencia

`config/agent-node.json.deployment_enabled=false` y `tool-allowlist.json.agent_node_enabled=false`. La autenticación gateway, las aristas, `get_capabilities`, la entrega y la conexión de `agent_mark_inbound_waiting` ya no bloquean. El gate actual es repetir el E2E y demostrar wait/resume/complete sin `TURN_BUSY`. La identidad idempotente sigue pendiente para tools posteriores; Flow/media conservan su propio gate.

## Preflight reproducible

1. Mantener registrados el workflow ID y su estado Draft.
2. Activar temporalmente solo para un E2E controlado.
3. Enviar un inbound, comprobar `get_capabilities`, `sync_waiting`, `waiting_external` y después `enter_waiting`.
4. Enviar el follow-up y comprobar resume de la misma conversación/turno sin `TURN_BUSY`.
5. Confirmar que un retry de `get_capabilities` devuelve el resultado sellado sin aumentar el presupuesto.
6. Observar el orden del mensaje final, `complete_task`, Function Node y `agent_complete_inbound_from_workflow`.
7. Volver a Draft y apagar ambos kill switches incluso si la prueba falla.
8. Probar `nfm_reply`, flow token y respuesta data API 3.0 en una fase posterior.
9. Actualizar el lock a `verified_e2e` en un cambio revisado; nunca cambiar modelo automáticamente.
