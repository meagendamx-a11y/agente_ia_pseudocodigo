# Especificación cerrada del agente de WhatsApp

## Objetivo

Atender por WhatsApp solicitudes administrativas de pacientes mediante Kapso Agent Node y funciones service-only de Agenda PSI. El modelo conversa y decide qué operación allowlisted solicitar; Supabase autoriza, consulta o muta. El modelo no es una frontera de seguridad.

## Flujo

1. Kapso entrega `whatsapp.message.received` al webhook inbound.
2. El webhook verifica HMAC sobre bytes crudos, valida el número y registra/admite el mensaje atómicamente.
3. Solo un mensaje admitido inicia o reanuda el workflow.
4. Agent Node usa contexto redactado y tools fijas a través del gateway.
5. Cada tool sella claim, presupuesto e idempotencia antes de ejecutar su wrapper.
6. El agendado nuevo usa un WhatsApp Flow dinámico; el éxito se muestra solo después del commit.
7. Kapso envía el texto final y un Function Node marca el inbound completado.

## Decisiones de producto congeladas

| ID | Decisión |
|---|---|
| DEC-01 | MVP simple e iterativo, pero con controles server-side obligatorios. |
| DEC-02 | Kapso conserva el turno con API Trigger, Agent Node, Wait/Function Nodes y Flow. |
| DEC-03 | Modelo preferido `gpt-5.6-luna`; fallback únicamente manual a `gpt-5.2` y después `gpt-5`. |
| DEC-04 | Todos los servicios activos aparecen, excepto un servicio con serie subsecuente activa para ese paciente. |
| DEC-05 | Precio efectivo: gratis=0; después preferencial; de lo contrario precio por defecto. |
| DEC-06 | Citas nuevas se crean mediante WhatsApp Flow dinámico. |
| DEC-07 | Las citas subsecuentes no se crean ni gestionan como serie; solo la próxima ocurrencia específica admite acciones permitidas. |
| DEC-08 | Paciente inactivo: perfil público aprobado o soporte; todas las demás funciones fallan cerrado. |
| DEC-09 | Cierre ordinario exitoso: mensaje cálido y “¿Hay algo más en lo que te pueda apoyar?”. |
| DEC-10 | No existe tool de URL; si falta enlace, se indica que el proveedor lo envía directamente. |
| DEC-11 | Pagos se explican por ejes separados y el agente nunca comparte datos bancarios. |
| DEC-12 | Comprobante: solo si es elegible; queda recibido y pendiente de revisión, nunca pagado. |
| DEC-13 | No hay edición, reemplazo, rechazo ni eliminación de comprobantes en el agente. |
| DEC-14 | Reseña: una sola escritura final, sin borrador persistido ni consulta/edición posterior. |
| DEC-15 | Mensaje final de reseña exacto: “Perfecto, muchas gracias por tu reseña.” |
| DEC-16 | Crisis funciona aun sin relación; usa copias fijas de 911 y Línea de la Vida. |
| DEC-17 | Soporte es autoservicio al WhatsApp `55 64 37 00 81`; no crea handoff ni notificación interna. |
| DEC-18 | Perfil compartido es la ficha pública aprobada estilo marketplace, breve y sin estados internos. |
| DEC-19 | Creación exitosa usa texto libre con fecha, hora y modalidad; no crea template Kapso. |
| DEC-20 | Solo se entregan recursos ya asignados y pendientes; el paciente no puede pedir otros. |
| DEC-21 | Reactivación y template de reactivación quedan fuera del agente. |
| DEC-22 | Sender/outbox/callback de estados permanecen independientes y sin cambios. |
| DEC-23 | Una gestión permite 8 llamadas y 1 mutación; cancelar→crear permite exactamente 2. |
| DEC-24 | Sesión 24 h, turno inactivo 30 min, tokens de opción 10/15 min y auditoría 30 días. |
| DEC-25 | Límites atómicos por teléfono/profesional se aplican antes del modelo y los replays no cuentan. |
| DEC-26 | El Agent Node y sus tools permanecen deshabilitados hasta probar semántica API Trigger, IDs estables y Flow E2E en Kapso. |

## Escenarios aceptados

Los 37 escenarios se detallan en `docs/TRACEABILITY.md` y en `test/fixtures/agent-intents.json`. Ninguna mutación se autoriza solamente por texto del paciente o por el prompt.

## Fuera de alcance

- Consejo clínico, diagnósticos, notas clínicas o emergencias como servicio.
- URL de sesión, datos bancarios, reactivación, handoff técnico o solicitudes de recursos.
- Mutaciones de serie, `skip_to_next`, reembolsos o acreditación automática.
- Editar/consultar reseñas o comprobantes.
- Cambios al sender, al outbox o a `kapso_status_callback`.
