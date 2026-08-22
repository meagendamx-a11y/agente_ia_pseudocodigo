# Data endpoint del Flow de citas

## Frontera

Kapso descifra la solicitud de Meta y envía al endpoint un objeto `source=whatsapp_flow`, Flow IDs, `data_exchange.version=3.0`, action, screen, data y `flow_token`, además de `signature_valid`. El endpoint autentica a Kapso; no confía únicamente en `signature_valid` ni acepta un flow token desde texto del chat.

## Flujo lógico

1. Verificar auth Kapso, Flow/phone allowlisted, tamaño y protocolo 3.0.
2. Verificar HMAC del flow token y resolver su handle one-time ligado a sesión/turno.
3. Derivar `tool_call_key = flow_token_handle + action + canonical_input_hash`.
4. Llamar únicamente rutas `flow_data_exchange`: servicios, eligibility, disponibilidad y create.
5. Responder `{version:'3.0',screen,data}` dentro de 15 s; objetivo interno 10 s.

No se llama al LLM. El endpoint no recibe session/command/domain IDs y nunca devuelve IDs internos.

## Transiciones

- `SERVICE -> MODALITY`: si existe una sola modalidad, el endpoint puede avanzar directamente a CALENDAR sin eliminar la pantalla del artefacto.
- `CALENDAR -> SLOT`: consulta disponibilidad fresca; cero slots devuelve mensaje seguro y permite otra fecha.
- `SLOT -> SUMMARY`: precio/horario son resumen, no reserva.
- Submit de SUMMARY ejecuta `agent_create_appointment` bajo el mismo camino autoritativo.
- Si slot se pierde, responder `SLOT` con opciones nuevas.
- Solo commit conocido responde `CONFIRMATION`; esa pantalla terminal completa el Flow.

## Idempotencia y saga

El flow token se consume una vez después del commit. Replay exacto devuelve la respuesta sellada. Cancel→create conserva el turno padre y esta creación es la segunda/final mutación; unknown outcome bloquea.

## Seguridad y errores

Falla cerrado ante Flow/phone/token/session/turn mismatch, action no permitida, paciente inactivo, payload no canónico o endpoint provider no verificado. Registra reason/latencia, no selecciones ni PII.

## Validación pendiente

El JSON sigue la referencia pública Kapso Flow JSON 7.0/Data API 3.0, pero no se importó a un draft autenticado. Debe pasar validación provider y E2E `nfm_reply` antes de publicar.

