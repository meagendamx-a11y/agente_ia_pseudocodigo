# Anotaciones de la auditoría final

Este anexo registra las correcciones que deben incorporarse a la guía antes de implementar el
agente. No contiene SQL ni código desplegable y, en este commit, **no modifica los contratos de
los documentos `00` a `08`**.

Si una anotación contradice la redacción actual de otro documento, se debe detener esa parte de
la implementación y corregir primero el documento dueño del tema. No se debe implementar en
silencio la versión anterior.

---

## Resultado general

La arquitectura central es adecuada para el MVP y no se detectó un bloqueo crítico:

- Kapso recibe y agrupa los mensajes entrantes.
- Una resolución determinista identifica al paciente antes de usar el modelo.
- Se conservan los seis estados de identidad definidos en `07-portero.md`.
- El Agent Node usa `gpt-5.6-luna`, temperatura `0` y modo `tool_only`.
- Supabase conserva la identidad, las reglas y la verdad del negocio.
- Las RPC devuelven el texto final; el modelo no debe reescribirlo.
- Las respuestas del Agent Node se mandan directamente con `send_notification_to_user`.
- `whatsapp_outbox` sigue reservado para plantillas y avisos iniciados por el negocio.
- No se agrega una tabla propia de sesiones o memoria de conversación.
- Las mutaciones siguen protegidas con `command_log` e idempotencia.

El modelo sólo interpreta lenguaje e intención. No recibe UUID internos, no decide permisos, no
calcula reglas de negocio y no escribe directamente en tablas.

---

## 1. Resolución de identidad y conflictos

El BSUID llega en el contexto confiable de Kapso/Meta; no se le pide al paciente que lo conozca ni
que lo escriba. Sólo cuando ese identificador aún no puede ligarse y no hay un teléfono confiable
se solicita compartir el contacto mediante el flujo oficial.

`not_patient` e `inactive_patient` siguen siendo desenlaces distintos. Si no existe vínculo después
de agotar la resolución válida, se envía `no_te_reconocemos`; si el vínculo existe pero está
inactivo, se envía `paciente_inactivo`. Ambos terminan antes del modelo y nunca comparten texto.

### Comparar todos los identificadores

La redacción actual de `07-portero.md` puede interpretarse como una búsqueda secuencial que deja de
comparar identificadores cuando el BSUID ya encontró un paciente. Eso puede ocultar un conflicto,
por ejemplo, si el BSUID corresponde al paciente A y el teléfono al paciente B.

La implementación debe:

1. Resolver de forma independiente todos los identificadores confiables disponibles: BSUID,
   `kapso_contact_id` y teléfono normalizado.
2. Comparar los resultados antes de autorizar.
3. Aceptar varias relaciones compatibles del mismo paciente con profesionales distintos.
4. Devolver `identity_conflict` cuando los identificadores apunten a identidades locales
   incompatibles.
5. Usar BSUID como identificador principal sólo después de superar esa comparación.

En `identity_conflict` no se actualizan los metadatos del proveedor ni `last_inbound_at`, no entra
el modelo y se termina la ejecución. Este estado necesita un texto determinista propio; no debe
reutilizar `fuera_de_alcance`, porque ese mensaje mantiene abierta la conversación.

Texto propuesto:

> Por seguridad, no pude verificar tu acceso por este medio. Escríbenos aquí para ayudarte:
> https://wa.me/525564370081

### Actualización de `whatsapp_links`

Cuando cambie alguno de estos datos del proveedor, la actualización debe asignar explícitamente
`updated_at = clock_timestamp()`:

- `kapso_contact_id`;
- portfolio de WhatsApp;
- BSUID;
- parent BSUID;
- username del proveedor.

La tabla desplegada no tiene un trigger general que actualice esa fecha. Un cambio exclusivo de
`last_inbound_at` no debe alterar `updated_at`.

La limpieza de esos campos cuando cambia el teléfono del paciente sigue pendiente de incorporarse
a la función ejecutada por el trigger correspondiente. El índice mínimo de identidad se trata por
separado en la base y no se duplica en este repositorio.

### Webhooks de estado

Un callback de estado puede traer `recipient_user_id` sin teléfono. Debe aceptarse y correlacionarse
por el identificador del mensaje del proveedor —WAMID—, como ya hace el flujo vigente. Un BSUID
recibido sólo en un estado de entrega no crea, actualiza ni autoriza una fila de `whatsapp_links`.

---

## 2. Espera, reanudación y tokens vencidos

Hay dos esperas distintas:

- Antes del agente, `Wait for Response` obtiene el contacto o el profesional que falta y después
  continúa el portero.
- Dentro del Agent Node, `enter_waiting` conserva la tarea en el mismo nodo. Al llegar el siguiente
  mensaje se reanuda el agente; no se vuelve a ejecutar automáticamente el portero.

Si `identity_token` o `agent_state` está vencido, es inválido o no puede verificarse, el MVP no
intenta reconstruir el estado y no ejecuta ninguna mutación. Envía exactamente:

> Esta gestión ya no está activa. Escríbeme de nuevo qué necesitas y empezamos otra vez.

Después llama `complete_task`. El siguiente mensaje abre una ejecución nueva y vuelve a resolver
la identidad. No se necesita un cron de recuperación.

Cuando llegue un medio incompatible antes del agente, la opción simple del MVP es enviar
`no_entendi` y terminar esa ejecución. Si el mismo lote también contiene texto comprensible, se
ignora el medio incompatible y se procesa el texto.

Al integrar esta anotación en `06-textos.md`, el mensaje de gestión inactiva debe convertirse en
una clave canónica fija, por ejemplo `gestion_inactiva`.

---

## 3. Alcance real de `last_inbound_at`

`last_inbound_at` es una señal del canal, no una bitácora exacta de cada mensaje. Una respuesta
reanudada dentro del Agent Node no vuelve a pasar por identidad y, si sólo saluda y no llama una
herramienta, puede no tocar Supabase. Esa limitación se acepta para el MVP.

Debe actualizarse de forma monótona:

- después de resolver una o más filas compatibles de `whatsapp_links`, incluso si el resultado
  conocido es inactivo o requiere seleccionar profesional;
- al inicio de cada llamada validada a `/tool`.

No debe actualizarse cuando:

- no existe una fila del paciente;
- aún no se resolvió ningún vínculo en `needs_contact`;
- existe `identity_conflict`;
- el evento es solamente un webhook de estado.

La base puede usar esta fecha como señal de una ventana de 24 horas, pero nunca como autorización.
Si más adelante se necesita auditoría exacta de todo mensaje entrante, hará falta un hook separado;
queda fuera del MVP.

---

## 4. Idempotencia de mutaciones

Se conserva `command_id` como UUIDv5 construido con:

- versión del contrato;
- relación ya resuelta;
- WAMID estables, ordenados y sin duplicados.

La operación no forma parte de `command_id`: dos mutaciones distintas sobre el mismo lote deben
colisionar y revelar un error de flujo.

La corrección necesaria está en `request_hash`. Además de operación, paso y argumentos públicos,
debe incluir la representación canónica del objetivo semántico interno decodificado del estado
sellado:

- IDs internos implicados;
- versiones esperadas de las filas;
- acción autorizada;
- para comprobantes, identificador del archivo del proveedor y/o SHA-256 normalizado.

Así, un mismo “sí” no puede reutilizar el resultado de una cita, pago o archivo diferente. Ese
objetivo interno se usa en el servidor y nunca se expone al modelo.

---

## 5. Comprobantes y Storage

El SHA-256 propio debe guardarse como hexadecimal canónico en
`storage.objects.user_metadata.sha256`. `storage.objects.metadata` se reserva para metadatos del
sistema, como eTag, tamaño y MIME. El digest verificado también se copia a
`payment_proofs.checksum`.

El bucket `comprobantes` permanece privado, acepta JPEG, PNG y WebP hasta 5 MiB y la carga debe ser
de creación exclusiva con ruta determinista. Antes de vincular el objeto se validan bucket, ruta,
MIME, tamaño y SHA-256.

Aunque `storage_cleanup_payment_proofs` existe como tipo permitido de trabajo, no hay un consumidor
desplegado que garantice esa limpieza. Para el MVP:

1. Si la RPC no logra vincular el archivo, intentar inmediatamente una eliminación acotada mediante
   la API de Storage.
2. Si también falla, emitir una alerta estructurada y dejarlo para limpieza manual.
3. No afirmar que existe recuperación automática hasta desplegar y comprobar un consumidor.

No se deben modificar directamente las tablas internas del esquema `storage`.

---

## 6. Reseñas

La tabla `reviews` sí existe. La RPC `request_patient_review` debe bloquear y revisar la fila de la
relación paciente-profesional:

- Si `submitted_at` ya tiene valor, devolver `resena_ya_enviada`.
- Si existe un borrador con `submitted_at` nulo, actualizar esa misma fila.
- Si no existe fila, insertar una.

Antes de guardar debe comprobar nuevamente que la relación está activa y que existe una cita
atendida. La RPC asigna `moderation_status = 'pending'` y `submitted_at` con hora del servidor; no
asigna `published_at`.

También copia `patients.first_name` a `reviews.patient_first_name`. En el marketplace sólo se
muestra la inicial de ese nombre. Por ello, al integrar el texto canónico debe decir:

> En su perfil sólo se muestra la inicial de tu nombre.

Esta herramienta no genera una notificación al profesional de forma deliberada. La regla maestra
de notificaciones debe permitir esa excepción.

---

## 7. Ajustes a reglas maestras

Al integrar estas anotaciones en `00-el-agente.md`, deben quedar explícitas estas precisiones:

- Los plazos de negocio provienen de la configuración del profesional. La ventana técnica de 26
  horas para recordatorio o prepago es una constante explícita del sistema.
- Recibir un comprobante nunca equivale a aprobar o acreditar un pago. Sólo puede decirse “ya está
  pagada” cuando el estado autoritativo de la base lo confirma.
- El agente comunica el resultado conocido de cita y pago. Si el pago queda registrado pero
  pendiente de una decisión profesional, debe decirlo sin especular.
- La escritura atómica con notificación aplica a mutaciones de cita, pago o comprobante que tengan
  un contrato de notificación. No aplica a actualizaciones internas de identidad, registros de
  ejecución ni `dejar_resena`.
- La decisión sobre dinero no se abre únicamente por un cambio tardío. También se abre cuando una
  cancelación a tiempo termina con dinero asociado sin transferirlo ni reprogramarlo. Mientras el
  esquema reutilice `late_change_decision` para ambos casos, se documenta esa limitación y nunca se
  cobra automáticamente.

---

## 8. Horarios y modalidad

Para cerrar el comportamiento del MVP, la búsqueda se limita a la modalidad solicitada o ya
seleccionada. No se ofrece automáticamente la modalidad contraria cuando no hay horarios; el
paciente puede pedirla de forma explícita. Un fallback entre modalidades queda como mejora futura.

Antes de considerar lista la implementación deben probarse:

- agenda completamente ocupada;
- segunda búsqueda de alternativas;
- concurrencia entre citas del mismo profesional;
- conflicto de un consultorio compartido entre profesionales.

La documentación de producción no debe fijar una cantidad observada de filas ni afirmar que hay
“seis” configuraciones en Ciudad de México. Sólo debe declarar el campo de zona horaria y su valor
predeterminado confirmado.

Se acepta para el MVP que el prefiltrado barato sugiera un día y el cálculo exacto posterior lo
marque como lleno, siempre que el mensaje final al paciente sea correcto.

---

## 9. Correcciones editoriales al integrar

- `comprobante_acuse_sesion_pasada`: cambiar “recibí tu comprobante de tu sesión” por “recibí el
  comprobante de tu sesión”.
- En una carrera de cancelación, reemplazar “la cancelación sí, y sin decirle nada” por “la
  cancelación sí, sin exponer el conflicto interno”. La respuesta visible sí debe informar el
  resultado conocido de la cancelación y del pago.
- Al agregar `identity_conflict` y `gestion_inactiva` a `06-textos.md`, actualizar el conteo de
  claves canónicas.

---

## 10. Pruebas obligatorias derivadas de esta auditoría

- BSUID de A con teléfono de B, contacto de A con teléfono de B y relaciones compatibles del mismo
  paciente con profesionales distintos.
- Token de identidad o estado vencido e inválido: texto exacto, `complete_task` y cero mutaciones.
- Todos los casos definidos para `last_inbound_at`.
- Mismos argumentos públicos con distinto objetivo interno: `request_hash` diferente o rechazo por
  discrepancia.
- Actualización de una reseña en borrador sin violar la unicidad.
- SHA-256 en `user_metadata`, copia a `payment_proofs.checksum` y fallo de eliminación con alerta.
- Callback con sólo BSUID: correlación por WAMID sin modificar identidad.
- Ausencia de fallback implícito entre modalidades.
- Agenda llena, alternativas, concurrencia del profesional y consultorio compartido.

---

## Estado comprobado y límites

Al momento de esta auditoría:

- existen `whatsapp_links`, `reviews` y `command_log`;
- no existen `agent_sessions` ni `whatsapp_conversation_state` y no son necesarias para el MVP;
- el bucket privado `comprobantes` y `payment_proofs.checksum` forman parte del diseño vigente;
- la limpieza de identidad cuando cambia el teléfono sigue pendiente;
- no se considera desplegado un consumidor de limpieza sólo porque exista un tipo de trabajo.

Las reglas de precio no exigen columnas nuevas en `whatsapp_links`. Según la documentación vigente
en la fecha de la auditoría, las respuestas de servicio dentro de la ventana de 24 horas no generan
el mismo cargo que una plantilla iniciada por el negocio; Kapso anuncia un cambio para el 1 de
octubre de 2026. La regla y la tarifa deben verificarse nuevamente antes del lanzamiento. No se
codifica una tarifa futura en la identidad ni en las RPC.

Fuentes oficiales consultadas:

- [Kapso: Agent Node](https://docs.kapso.ai/docs/flows/step-types/agent-node)
- [Kapso: variables y contexto](https://docs.kapso.ai/docs/flows/variables-and-context)
- [Kapso: Business-Scoped User IDs](https://docs.kapso.ai/docs/whatsapp/business-scoped-user-ids)
- [Kapso: solicitud de información de contacto](https://docs.kapso.ai/docs/whatsapp/send-messages/request-contact-info)
- [Supabase: carga de archivos](https://supabase.com/docs/reference/javascript/file-buckets-upload)
- [Supabase: esquema de Storage](https://supabase.com/docs/guides/storage/schema/design)
- [Meta: precios de WhatsApp Business Platform](https://business.whatsapp.com/products/platform-pricing)
- [Kapso: qué cobra Meta](https://kapso.com/guides/whatsapp-pricing/how-pricing-works/what-meta-charges-for/)
