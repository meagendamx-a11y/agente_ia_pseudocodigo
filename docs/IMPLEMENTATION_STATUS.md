# Estado actual de implementación — Fase 1A

Corte verificado: 2026-08-23 (America/Mexico_City).

## Referencias congeladas

- Runtime: `Agenda-Psi-V2`, rama `codex/agent-phase-1a`, commit `8c0a0f02a683d0c69b0e863bf58611dee775f0a9`.
- Guía contractual: `agente_ia_pseudocodigo`, rama `codex/agente-whatsapp-guide`.
- Supabase: proyecto productivo con los kill switches apagados después de la prueba controlada.
- Kapso: workflow `Agenda PSI — Agente WhatsApp — Draft`, nuevamente en Draft después de la prueba.

## Avance por commit del runtime

| Commit | Avance comprobable |
| --- | --- |
| `5564c91` | Agregó start/resume de Kapso, bind de ejecución, recuperación del execution sellado y `agent_get_capabilities`. |
| `161ab11` | Conectó el gateway autenticado, `get_capabilities`, cierre correlacionado, Function privada y pruebas del runtime Kapso. |
| `d6d1e01` | Corrigió el pathname interno observado por Supabase Edge Runtime y dejó las rutas exactas operativas. |
| `0b93258` | Vendorizó esta guía como quinta referencia de proyecto en `referencias/agente_ia_pseudocodigo`. |
| `8c0a0f0` | Implementó y probó `/workflow/waiting`, el wrapper de `agent_mark_inbound_waiting` y la Function privada de Kapso. |

## Estado comprobado

- Las migraciones de Fase 1A y las Edge Functions están desplegadas.
- El secreto del gateway quedó sincronizado sin exponerlo.
- El canvas de Kapso conserva exactamente 3 nodos y 2 aristas: API Trigger → Agent Node → Function Node.
- `gpt-5.6-luna` está configurado con temperatura `0`, reasoning `medium`, `max_iterations=16` y `max_tokens=2048`.
- Un inbound real fue admitido, abrió una ejecución Production y llegó al Agent Node.
- El Agent Node llamó `get_capabilities`; el ledger registró outcome `committed` y devolvió capacidades redactadas.
- Kapso envió la respuesta de WhatsApp y cambió la ejecución a `Waiting`.
- La ruta autenticada fija `/workflow/waiting` está desplegada en `agent_tool_gateway`; reutiliza la RPC existente `agent_mark_inbound_waiting` sin cambiar SQL.
- La Function privada `agenda-psi-mark-inbound-waiting` está desplegada con su secreto cifrado y sin endpoint público.
- El Agent Node conserva 3 nodos y 2 aristas y ahora tiene 2 Function Tools: `get_capabilities` y `sync_waiting`.
- El prompt guardado exige `send_notification_to_user` → `sync_waiting` → `enter_waiting`; si la sincronización falla, prohíbe la espera y cierra con `complete_task`.

## Incidente reproducido y corrección aplicada

El built-in `enter_waiting` de Kapso cambia únicamente el estado de la ejecución en Kapso. No llama por sí mismo `agent_mark_inbound_waiting`, así que el turno de Supabase permaneció `active`. El siguiente inbound fue rechazado correctamente como `TURN_BUSY` porque solo un turno `waiting_external` puede reanudarse.

La corrección quedó aplicada de forma acotada:

1. `/workflow/waiting` valida autenticación, `Content-Type` y correlación del envelope.
2. La ruta llama la RPC ya existente `agent_mark_inbound_waiting`; no cambia su contrato SQL.
3. `agenda-psi-mark-inbound-waiting` acepta solo el envelope de Function Tool, usa contexto confiable y devuelve un resultado redactado.
4. La tool `sync_waiting` está conectada en Draft antes de `enter_waiting`.
5. El runtime pasó 47/47 pruebas relevantes antes del deploy de `agent_tool_gateway`.

La ruta y la Function privada quedaron desplegadas y la tool quedó guardada en Draft. La corrección aún no se considera validada de extremo a extremo: falta repetir el recorrido real de espera, resume y cierre.

## Cierre seguro aplicado

- `AGENT_INBOUND_ENABLED=false`.
- `AGENT_WORKFLOW_ENABLED=false`.
- Workflow Kapso en Draft, con 3 nodos y 2 aristas preservadas.
- El turno controlado se cerró mediante `agent_complete_inbound_from_workflow`: inbound procesado, turno `completed`, terminal y ambos tool calls con outcome `committed`.

## Siguiente gate

Repetir un E2E único que demuestre:

1. inbound → `get_capabilities` → respuesta;
2. `sync_waiting` → `enter_waiting` → turno `waiting_external`;
3. segundo inbound → resume de la misma ejecución;
4. respuesta final → `complete_task` → Function Node → turno `completed`.

Hasta completar ese recorrido, producción permanece apagada. Flutter, Marketplace, sender/outbox, callback de estados y las RPC de dominio existentes quedan fuera de este cambio.
