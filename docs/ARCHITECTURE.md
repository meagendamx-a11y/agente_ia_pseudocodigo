# Arquitectura objetivo

```text
Kapso number webhook (whatsapp.message.received v2)
  -> kapso_inbound_webhook (raw HMAC, allowlist, admission)
     -> admitted/resumed: Kapso API Trigger
        -> Agent Node (deshabilitado hasta preflight)
           -> agent_tool_gateway -> service-only wrapper -> redacted DTO
           -> WhatsApp Flow -> data endpoint -> create commit
           -> media adapter -> private receipt -> attach proof
        -> assistant text -> complete_task -> Function Node -> complete RPC
     -> replay/rate-limited/rejected: ACK/copia fija; sin LLM

Rail independiente sin cambios:
Core -> whatsapp_outbox -> sender_whatsapp -> enviar-whatsapp -> Kapso
Kapso status -> kapso_status_callback -> outbox status monotónico
```

## Límites de responsabilidad

- Kapso posee el workflow/turno conversacional; Supabase posee identidad, autorización, presupuestos e idempotencia.
- `agent_sessions` autoriza; `agent_turns` agrupa una gestión; `agent_tool_calls` sella cada llamada; tokens opacos esconden IDs.
- El gateway es fixed-route. Ninguna superficie llama nombres arbitrarios o tablas.
- Flow y media tienen identidad idempotente propia; no dependen de una key del modelo.
- Sender/callback no participan del inbound del agente.

## Implementación futura por capas

1. Baseline DB reproducible, estado aditivo, ACLs y kill switch off.
2. Inbound/admission/gateway sin LLM, con respuestas fijas.
3. Kapso test workspace y read-only tools.
4. Flow/create y mutaciones después de concurrencia/reminder online.
5. Proof, recursos y reseñas independientes.

## Runtime auditado

Supabase `ssyzfeadyrczlzjbvxyl`, Postgres 17.6; `enviar-whatsapp` v10 y `kapso_status_callback` v2 con auth custom; cero `agent_*` live y sin `agent_turns`. Los crons server-only ya están corregidos. Esto es evidencia del 2026-08-22, no configuración para desplegar.

## Modelo de fallos

Todo mismatch de identidad/token/turno falla cerrado. Rechazo pre-write puede liberar reserva; commit incrementa presupuesto; outcome desconocido bloquea. El paciente nunca recibe éxito antes del commit ni información interna al fallar.

