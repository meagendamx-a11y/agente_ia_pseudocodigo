# Workflow Kapso propuesto

## Topología

```text
number webhook -> kapso_inbound_webhook -> atomic admission
  admitted/resumed -> API Trigger -> Function variables -> Agent Node
    -> tools/gateway | WhatsApp Flow | media adapter
    -> enter_waiting para continuación
    -> auto_send_assistant_text -> complete_task -> Function Node -> complete RPC
  replay/rate_limited/rejected -> respuesta fija/ACK, sin Agent Node
```

El workflow inbound es independiente de `whatsapp_outbox -> enviar-whatsapp` y del webhook de estados `kapso_status_callback`.

## Variables confiables

Solo el webhook/gateway inyecta referencias de sesión, turno, ejecución y mensaje. El input del paciente sigue siendo no confiable. Antes de habilitar tools se debe probar que el primer API Trigger y el resume preservan semántica real de mensaje WhatsApp y `whatsapp_context`, no solamente un bloque `<external_input>`.

## Espera y cierre

`enter_waiting` sella `waiting_external` antes de Flow o de esperar otra respuesta. Un inbound verificado reanuda el mismo turno. `complete_task` se usa una sola vez al final; el Function Node llama `agent_complete_inbound` después de que Kapso acepte el mensaje final.

## Preflight obligatorio

Estado al 2026-08-22: **bloqueado/no verificado** porque no hay sesión autenticada de Kapso disponible en esta ejecución. Permanecen por verificar: webhook/target, payload v2, workflow ID, Flow ID/versión, `provider_model_id`, semántica start/resume, ordering de send/complete, serialización `nfm_reply`, y un provider tool-invocation ID estable ante retry. Hasta comprobarlo, kill switch off y tools Agent Node deshabilitadas.

## WhatsApp Flow de citas

El Flow 7.0 usa Data API 3.0 y seis pantallas: `SERVICE -> MODALITY -> CALENDAR -> SLOT -> SUMMARY -> CONFIRMATION`. La data endpoint no llama al modelo y solo usa rutas Flow del gateway. SUMMARY solicita confirmación; CONFIRMATION solo se devuelve después del commit. Un slot perdido regresa a SLOT con opciones frescas. La respuesta `interactive.type='nfm_reply'`, `kapso.flow_response` y `kapso.flow_token` debe copiarse a variables allowlisted antes de reanudar Agent Node.

Referencia pública comprobada: <https://docs.kapso.ai/docs/whatsapp/flows/flow-json> y <https://docs.kapso.ai/docs/whatsapp/flows/data-endpoint>. Validación/import en workspace sigue bloqueada.
