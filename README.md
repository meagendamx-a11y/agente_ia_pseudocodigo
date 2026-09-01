# El agente de WhatsApp de Agenda Psi

Aquí vive la especificación del agente: qué entiende, qué puede hacer, qué texto entrega y qué
falta implementar. **No hay SQL desplegable ni código ejecutable.** Las migraciones, las funciones
y el workflow se construyen en sus repositorios a partir de esta guía.

---

## Qué es el agente

Es un asistente que atiende por WhatsApp a pacientes de profesionales de Agenda Psi. Puede
consultar, agendar, confirmar, reprogramar y cancelar citas; cambiar modalidad; recibir
comprobantes; guardar reseñas; y contestar datos de agenda y pagos. No es un expediente clínico y
no da atención psicológica.

El MVP corre como un **workflow de Kapso**:

1. Kapso agrupa durante cinco segundos los mensajes entrantes.
2. Una Function Node resuelve la identidad sin usar inteligencia artificial.
3. Quien no está en `whatsapp_links` recibe `no_te_reconocemos`; quien sí está pero tiene su
   relación inactiva recibe `paciente_inactivo`. Son estados y mensajes distintos.
4. Sólo una identidad activa entra al Agent Node con `gpt-5.6-luna`.
5. El agente detecta una intención y llama una de las diez herramientas.
6. `agent_tool_gateway` valida el contexto confiable, llama la RPC correspondiente y devuelve el
   texto final.
7. En modo `tool_only`, el agente manda ese texto **literalmente**, sin reescribirlo, y llama
   `enter_waiting` o `complete_task`. La única excepción es agregar `pendiente_lo_otro` cuando el
   batch traía dos intenciones; en ese caso siempre espera.

Las respuestas deterministas anteriores al agente no gastan tokens. El texto de una RPC sí vuelve
al Agent Node para que lo mande con `send_notification_to_user`; se acepta ese costo pequeño en el
MVP porque evita duplicar estado, entrega e idempotencia. Se medirá en los registros de Kapso antes
de diseñar una optimización.

La base sigue siendo la única verdad del negocio. El modelo no recibe UUID, no autoriza acciones,
no calcula fechas, precios ni plazos y no escribe directamente en tablas.

---

## Por dónde empezar

**Para entender el producto:** `docs/00-el-agente.md` y `docs/01-conversaciones.md`.

**Para implementarlo:** `docs/08-implementacion.md`, después `docs/07-portero.md` para el workflow,
`docs/02-funciones.md` para los contratos y `docs/05-prompt.md` para configurar el Agent Node.

**Antes de programar:** revisar `docs/09-anotaciones-auditoria.md`; contiene correcciones pendientes
de integrar en los documentos dueños de cada contrato.

**Para conocer un texto exacto:** `docs/06-textos.md`. Los datos o el esquema vigentes se consultan
en la base desplegada; este repositorio nunca sustituye esa consulta.

---

## Los doce archivos

| Archivo | Qué contiene |
|---|---|
| `README.md` | Arquitectura, orden de lectura y fuentes de verdad. |
| `AGENTS.md` | Reglas para editar este repositorio. |
| `docs/00-el-agente.md` | Modelo completo y reglas numeradas. |
| `docs/01-conversaciones.md` | Flujos vistos desde WhatsApp. |
| `docs/02-funciones.md` | Contratos de las diez herramientas y sus RPC. |
| `docs/03-dinero.md` | Reglas de pagos, comprobantes y cambios. |
| `docs/04-horarios.md` | Búsqueda y reserva de horarios. |
| `docs/05-prompt.md` | Configuración y prompt del Agent Node. |
| `docs/06-textos.md` | Fuente única de todos los textos visibles. |
| `docs/07-portero.md` | Workflow, identidad BSUID, espera, idempotencia y fallos. |
| `docs/08-implementacion.md` | Estado actual, pendientes, orden y pruebas. |
| `docs/09-anotaciones-auditoria.md` | Correcciones y decisiones pendientes de integrar tras la auditoría final. |

Las reglas viven en `00`, los textos en `06`, los contratos en `02`, el transporte y la identidad
en `07`, y la secuencia de trabajo en `08`. `09` es un anexo de auditoría: para los puntos que
enumera, debe reconciliarse con el documento dueño antes de implementar. Un archivo cita al dueño
del tema en vez de copiar una segunda definición.

---

## Quién manda cuando hay una contradicción

1. Las decisiones de producto confirmadas por Gael.
2. El esquema y el comportamiento de la base desplegada.
3. La documentación oficial vigente de Kapso, Meta, Supabase y OpenAI.
4. Estos documentos.

Lo que no esté confirmado no se inventa: se deja como pendiente de comprobación.

---

## Lo que queda fuera

- El código y las migraciones.
- Secretos o datos reales de pacientes.
- Un motor propio de memoria de conversación.
- Respuestas del agente mediante `whatsapp_outbox`; esa cola conserva exclusivamente los avisos y
  plantillas iniciados por el negocio que ya funcionan.
- Un modelo dentro de Supabase. La Edge Function es una frontera privada de seguridad y negocio,
  no otro agente.
