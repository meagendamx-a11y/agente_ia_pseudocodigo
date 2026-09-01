# Cómo se edita este repositorio

Aquí vive la documentación del agente de WhatsApp de Agenda Psi: once archivos en español. No hay
implementación. Estas reglas aplican por igual a personas y agentes.

## 1. La lista es cerrada

Son once archivos y ninguno más. Antes de escribir, se busca el archivo dueño del tema:

- reglas de producto: `docs/00-el-agente.md`;
- conversaciones: `docs/01-conversaciones.md`;
- herramientas, RPC y resultado: `docs/02-funciones.md`;
- dinero: `docs/03-dinero.md`;
- horarios: `docs/04-horarios.md`;
- Agent Node y prompt: `docs/05-prompt.md`;
- textos visibles: `docs/06-textos.md`;
- workflow, identidad, BSUID, espera e idempotencia: `docs/07-portero.md`;
- estado y orden de implementación: `docs/08-implementacion.md`.

Un tema se define una vez. Los demás archivos lo citan.

## 2. Lo que nunca se agrega

- Migraciones `.sql` o código desplegable.
- Secretos, llaves, tokens o cadenas de conexión.
- Nombres, teléfonos, mensajes o capturas de pacientes reales.
- Exportaciones o conteos de producción.
- Un duodécimo archivo para repetir decisiones que ya tienen dueño.

## 3. Arquitectura vigente

La arquitectura documentada es una sola:

- trigger de mensajes entrantes y agrupamiento en Kapso;
- Function Node determinista para resolver identidad;
- Agent Node de Kapso únicamente para identidades activas;
- `gpt-5.6-luna`, temperatura cero y `message_delivery_mode: tool_only`;
- `agent_tool_gateway` como Edge Function privada entre las herramientas y las RPC;
- diez herramientas de dominio;
- `send_notification_to_user`, `enter_waiting` y `complete_task` como únicas herramientas
  incorporadas del agente;
- verdad, autorización, concurrencia e idempotencia en servidor.

No se vuelve a introducir como diseño activo:

- OpenAI ejecutado dentro de `kapso_inbound_webhook`;
- un bucle propio del modelo;
- `whatsapp_conversation_state` o memoria conversacional personalizada;
- un candado de sesión durante toda la conversación;
- un cron o `whatsapp_outbox` para responder el chat;
- UUID entregados al modelo;
- respuestas de RPC reescritas por el modelo;
- un único estado `rejected` para toda identidad inválida.

`not_patient` e `inactive_patient` son estados distintos. El primero significa que no existe un
vínculo local; el segundo, que sí existe pero no está activo. Nunca comparten mensaje.

## 4. La base y la documentación externa se verifican

El esquema real vive en Supabase. Antes de describir una tabla, columna, índice, trigger, RPC o
Edge Function se consulta lo desplegado. Antes de usar sintaxis o comportamiento de Kapso, Meta,
Supabase u OpenAI se revisa la documentación oficial vigente. Si no puede comprobarse, se escribe
como pendiente; no se estima.

No se documentan conteos de filas ni datos actuales. Las reglas hablan de la configuración de cada
profesional, no de la muestra que exista hoy.

## 5. Los textos

`docs/06-textos.md` es la fuente única de lo que recibe la paciente. Los demás archivos citan la
clave. Sólo `docs/01-conversaciones.md` y el bloque de prompt de `docs/05-prompt.md` pueden
reproducir un texto cuando sea indispensable para entender o configurar el flujo. Si difieren,
manda `06`.

La RPC compone `texto`; el Agent Node lo manda literalmente con `send_notification_to_user`. No lo
traduce, corrige, resume, adorna ni concatena, salvo una excepción expresamente definida en `06`.

## 6. Seguridad y consistencia

- La identidad y los UUID llegan por contexto confiable, nunca por parámetros controlados por el
  modelo.
- BSUID se resuelve con `business_portfolio_id`; `whatsapp_username` nunca autoriza.
- Cada RPC vuelve a verificar identidad, relación, propiedad y estado dentro de su transacción.
- Las mutaciones usan un `command_id` determinista interno; no se pide al modelo ni a la paciente.
- Los bloqueos son cortos y transaccionales, sólo alrededor de la lectura y escritura de negocio.
- Una mutación y su aviso a la profesional son atómicos.
- Ninguna modificación propone borrar objetos usados por Flutter o por los avisos vigentes.

## 7. Los plazos y el género

Ningún plazo de una profesional se escribe a mano: sale de su ficha. Los textos no asignan género
a la paciente. A la profesional se le nombra por su nombre de pila.

## 8. Tono

Español de México, claro y directo. Sin relleno corporativo, emojis ni afirmaciones no comprobadas.
Cada decisión técnica no obvia incluye su motivo y su riesgo.

## 9. Mermaid

Sólo se permiten dos diagramas: uno en `docs/00-el-agente.md` y otro en
`docs/07-portero.md`. Se usa `flowchart LR` o `flowchart TD`, sin estilos ni subgrafos anidados. Las
etiquetas van entre comillas y sin acentos.
