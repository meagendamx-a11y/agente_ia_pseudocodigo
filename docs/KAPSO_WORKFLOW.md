# Workflow Kapso propuesto

## Topología

```text
number webhook -> kapso_inbound_webhook -> atomic admission
  admitted/resumed -> API Trigger -> Function variables -> Agent Node
    -> get_capabilities -> Function privada -> gateway
    -> tools futuros | WhatsApp Flow | media adapter
    -> pregunta: send_notification_to_user -> enter_waiting
    -> respuesta final: send_notification_to_user -> complete_task
       -> Function Node -> agent_complete_inbound_from_workflow
  replay/rate_limited/rejected -> respuesta fija/ACK, sin Agent Node
```

El workflow inbound es independiente de `whatsapp_outbox -> enviar-whatsapp` y del webhook de estados `kapso_status_callback`.

## Variables confiables

Solo el webhook/gateway inyecta referencias de sesión, turno, ejecución y mensaje. El input del paciente sigue siendo no confiable. Antes de habilitar tools se debe probar que el primer API Trigger y el resume preservan semántica real de mensaje WhatsApp y `whatsapp_context`, no solamente un bloque `<external_input>`.

## Espera y cierre

El texto directo del asistente queda interno. `send_notification_to_user` entrega cada mensaje; después de un envío exitoso, `enter_waiting` sella `waiting_external` si se hizo una pregunta y `complete_task` avanza al cierre si la respuesta fue final. Un inbound verificado reanuda el mismo turno. El Function Node privado `agenda-psi-complete-inbound` llama `agent_complete_inbound_from_workflow` para cerrar y finalizar técnicamente el turno.

## Preflight obligatorio

Estado al 2026-08-23: **Draft configurado con primera tool y cierre técnico; E2E real pendiente**. Ya se verificaron proyecto, target, webhooks activos y el workflow `d4ab8c62-f138-4869-a501-19e60c4483ff` con API Trigger (Start) conectado al Agent Node `gpt-5.6-luna`. El nodo usa temperatura `0`, reasoning `medium`, `max_iterations=16`, `max_tokens=2048`, salida directa interna, `send_notification_to_user`, `enter_waiting`, `complete_task` y una Function Tool `get_capabilities` con input cerrado `{}`. Después del Agent Node está conectado el Function Node privado `agenda-psi-complete-inbound`.

La prueba API Call previa terminó `Completed` en 4 s: envió soporte con `send_notification_to_user` y, tras éxito, llamó `complete_task` en la siguiente iteración. Costó `$0.0006` y consumió 4,096 tokens en dos llamadas. El arnés sustituyó el mensaje por `Hello, I need assistance.` y expuso `context.phone_number=null`; por tanto no demuestra `initial_data`, start/resume real, `whatsapp_context`, la nueva Function Tool ni el cierre contra Supabase. `get_capabilities` no depende de un invocation ID del modelo: el servidor sella una sola lectura por `provider_message_id + kapso_execution`. Las demás tools directas siguen bloqueadas hasta definir una identidad estable de invocación/retry. Kill switches y activación de producción continúan apagados.

## WhatsApp Flow de citas

El Flow 7.0 usa Data API 3.0 y seis pantallas: `SERVICE -> MODALITY -> CALENDAR -> SLOT -> SUMMARY -> CONFIRMATION`. La data endpoint no llama al modelo y solo usa rutas Flow del gateway. SUMMARY solicita confirmación; CONFIRMATION solo se devuelve después del commit. Un slot perdido regresa a SLOT con opciones frescas. La respuesta `interactive.type='nfm_reply'`, `kapso.flow_response` y `kapso.flow_token` debe copiarse a variables allowlisted antes de reanudar Agent Node.

Referencia pública comprobada: <https://docs.kapso.ai/docs/whatsapp/flows/flow-json> y <https://docs.kapso.ai/docs/whatsapp/flows/data-endpoint>. El workspace autenticado no contiene Flows; validación/import continúa pendiente.
