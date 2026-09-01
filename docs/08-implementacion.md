# 08 · La implementación

Corte de auditoría: 2026-09-01.

Este archivo separa lo comprobado, lo ya realizado y lo que falta construir. No contiene una
migración ejecutable. Antes de implementar se vuelve a consultar el proyecto de Supabase y la
documentación oficial de Kapso.

---

## 1. Decisiones cerradas

- El MVP usa un workflow de Kapso y su Agent Node.
- El modelo es `gpt-5.6-luna`, temperatura cero.
- `message_delivery_mode` es `tool_only`.
- La identidad se resuelve de forma determinista antes del modelo.
- `not_patient` e `inactive_patient` son estados y mensajes distintos.
- Kapso y WhatsApp entregan BSUID; la paciente no lo captura.
- Sólo se pide compartir contacto cuando un BSUID nuevo no puede ligarse sin teléfono.
- El Agent Node llama herramientas; el modelo nunca recibe UUID.
- La RPC redacta el texto final y el agente lo manda literalmente, salvo la única coletilla
  autorizada de `pendiente_lo_otro`.
- En el MVP se acepta el pequeño costo de tokens de esa copia para no duplicar transporte e
  idempotencia.
- La conversación pendiente vive en `enter_waiting`; no se crea memoria propia.
- `whatsapp_outbox` sigue atendiendo plantillas y avisos iniciados por el negocio, no el chat.
- Las mutaciones usan `command_id` interno y bloqueos transaccionales cortos.
- No se crea cron de recuperación ni agente OpenAI dentro de Supabase.

---

## 2. Estado comprobado de la base

### 2.1 `whatsapp_links`

La tabla vigente ya tiene:

- relación con paciente y profesional;
- `phone` obligatorio;
- `kapso_contact_id`;
- `business_portfolio_id`;
- `business_scoped_user_id`;
- `parent_business_scoped_user_id`;
- `whatsapp_username`;
- `last_inbound_at`;
- marcas de creación y actualización.

También conserva sus restricciones de relación y sus índices por teléfono, contacto de Kapso y
portafolio/BSUID. RLS está habilitado y no se abre al cliente. Se mantiene como tabla interna.

**Ya realizado:** el índice único parcial por
`(professional_id, business_portfolio_id, business_scoped_user_id)` cuando BSUID no es nulo. No
forma parte de los pendientes de esta guía.

No se hace nullable `phone`. Esta tabla no es un directorio genérico de contactos: representa una
relación local que ya tiene paciente.

### 2.2 Objetos relacionados

- `reviews` existe: `dejar_resena` sí forma parte del MVP.
- `command_log` existe y se reutiliza para idempotencia.
- `agent_sessions` no existe en el proyecto auditado y no se crea para este MVP; se usa un
  `identity_token` corto sellado por Supabase y cada herramienta revalida la relación.
- `whatsapp_outbox` existe y no se modifica para responder conversaciones.
- `whatsapp_inbound_messages` existe; se deja intacta por compatibilidad legacy y auditoría, pero no
  es la memoria ni la guardia del workflow nuevo.
- `whatsapp_conversation_state` no existe y no debe crearse.
- `agent_tool_gateway` está desplegada y se adecuará como frontera privada, sin OpenAI.
- `kapso_inbound_webhook` sigue desplegada, pero la versión vigente es phone-first y rechaza
  batches; no se considera fallback. Durante el corte se desconecta y permanece apagada.
- Las diez RPC con los contratos de `docs/02-funciones.md` todavía deben implementarse o adecuarse.

El bucket `comprobantes` es privado y admite JPEG/PNG/WebP de hasta 5 MiB. `payment_proofs` exige
`payment_id` único, ruta, MIME, tamaño y checksum. Por eso HEIC/HEIF y PDF se normalizan en servidor;
no se amplía el bucket ni se cambia el visor para el MVP.

---

## 3. Primer cambio: teléfono e identidad de proveedor

La rutina vigente `tg_patients_whatsapp_link_phone_au`, activada después de actualizar
`patients.phone`, sincroniza el nuevo teléfono en `whatsapp_links` y exige que se actualice la fila
esperada. Hoy no invalida la identidad de proveedor.

Debe adecuarse para que, **sólo cuando el teléfono cambie realmente**, haga una sola actualización:

```text
si NEW.phone es distinto de OLD.phone:
    actualizar whatsapp_links WHERE patient_id = NEW.id
    phone = NEW.phone
    kapso_contact_id = null
    business_portfolio_id = null
    business_scoped_user_id = null
    parent_business_scoped_user_id = null
    whatsapp_username = null
    last_inbound_at = null
    updated_at = ahora del servidor

    exigir exactamente la fila esperada
si el teléfono no cambió:
    no invalidar nada
```

Motivo: el teléfono nuevo no prueba que conserve el mismo contacto de WhatsApp. Mantener el BSUID
anterior autorizaría a una identidad que ya no corresponde. En el siguiente mensaje entrante,
`resolve_whatsapp_identity` vuelve a poblar los campos si teléfono y BSUID coinciden.

Este cambio no borra la relación, no crea una nueva fila y no toca datos de agenda. Se prueba con
tres casos: mismo teléfono, teléfono distinto y error de integridad.

Se conserva su frontera vigente: función `SECURITY DEFINER`, `search_path` vacío, referencias
cualificadas y ejecución sólo para `service_role`; no se abre a `PUBLIC`, `anon` ni
`authenticated`.

---

## 4. Function Node de identidad

Construir `resolve_whatsapp_identity` con el contrato de `docs/07-portero.md`:

```text
entrada confiable:
    phone_number_id receptor
    kapso_contact_id
    telefono, si existe
    business_scoped_user_id, si existe
    parent_business_scoped_user_id, si existe
    whatsapp_username, si existe
    seleccion de profesional, si el workflow estaba esperando una
    identity_token pendiente, si estaba resolviendo contacto o profesional

obtener business_portfolio_id desde configuracion del servidor

buscar por portafolio + BSUID
si no resuelve, buscar por contacto Kapso y validar su estado actual antes de reconciliar BSUID
si no resuelve y hay telefono, normalizar E.164 y buscar por telefono

si telefono y BSUID contradicen relaciones locales:
    identity_conflict
si falta telefono para ligar un BSUID nuevo:
    emitir identity_token ligado al BSUID y conversacion
    enviar request_contact_info con recipient = BSUID, nunca con to
    needs_contact
si llega contacts como respuesta:
    exigir from_user_id igual al BSUID pendiente
    exigir exactamente un contacto origin = contact_request
    exigir telefono y wa_id coherentes; rechazar origin = other
si no existe relacion despues de una resolucion valida:
    not_patient
si existe pero no esta activa:
    inactive_patient
si hay varias relaciones activas y ninguna seleccion valida:
    needs_professional
si existe una sola relacion activa:
    completar metadatos de proveedor de forma idempotente
    actualizar last_inbound_at de forma monotona con timestamp confiable
    devolver nombre visible y verbos permitidos por su configuracion
    emitir identity_token ligado a link.updated_at, conversacion y caducidad
    identified
```

El mapeo `phone_number_id → business_portfolio_id` vive en configuración de servidor. Para el MVP
de un solo número puede ser una sola variable validada al arrancar. No se deriva del contenido que
manda la paciente.

`user_changed_number` y `user_changed_user_id` no se envían al Agent Node. Kapso reconcilia su
contacto y el siguiente inbound permite actualizar la copia local mediante `kapso_contact_id`. El
parser acepta que falten campos telefónicos; nunca crea un vínculo sólo porque apareció un BSUID.

La Function Node no consulta Postgres ni porta `service_role`: llama la ruta privada `/identity` de
`agent_tool_gateway`. Conserva el batch original mientras espera contacto o profesional y, al
resolver, entrega al Agent Node el texto/tipo visibles y los identificadores de medio sellados; no
entrega la tarjeta de contacto ni UUID. `last_inbound_at` usa el timestamp confiable del proveedor y
`greatest(valor_actual, recibido)` para no retroceder. Antes de seleccionar profesional se actualiza
en todas las relaciones locales que coincidan con la identidad; un status webhook nunca lo cambia.

La salida para `identified` guarda la relación resuelta en contexto confiable del workflow. Sus UUID
no se interpolan en el prompt ni en el esquema de herramientas y `get_variable` permanece
deshabilitada. Las opciones que nazcan después dentro de una herramienta se guardan como estado
sellado, según `docs/07-portero.md` §6.1.

### 4.1 Compatibilidad saliente con BSUID

No se reemplaza `whatsapp_outbox` ni se vuelve nullable `whatsapp_links.phone` para el MVP. El
sender vigente continúa con `{to: phone}` mientras exista teléfono. Se deja preparado y probado el
contrato alternativo `{recipient: business_scoped_user_id}` para una futura fila sin teléfono,
validando siempre el portafolio; un BSUID nunca se coloca en `to` y no se usa `recipient` para
plantillas de autenticación. El parser de status acepta `recipient_user_id` sin `recipient_id` y lo
usa sólo para correlación, nunca para crear una relación.

`needs_contact` sí usa hoy `{recipient: business_scoped_user_id}` para enviar la solicitud
interactiva porque todavía no conoce teléfono; es una respuesta del workflow, no una plantilla del
outbox.

---

## 5. Las diez RPC

Implementar o adecuar, en este orden:

1. `ver_servicios`
2. `buscar_horarios`
3. `mis_citas`
4. `agendar`
5. `confirmar`
6. `reprogramar`
7. `cancelar`
8. `cambiar_modalidad`
9. `mandar_comprobante`
10. `dejar_resena`

Las lecturas se terminan primero para validar identidad, forma y textos antes de habilitar
mutaciones. Cada RPC sigue este esqueleto:

```text
validar tipos y valores de argumentos
resolver de nuevo whatsapp_link, paciente y profesional desde contexto interno
comprobar que la relacion sigue activa y que el recurso pertenece a esa relacion

si es lectura:
    leer en zona de la profesional
    componer texto
    construir next_state interno si falta continuar
    devolver {result:{texto, espera, hecho:false, cierra}, next_state}

si esta rama realmente puede escribir:
    reclamar command_id en command_log con INSERT ON CONFLICT + SELECT FOR UPDATE
    comparar command_type y request_hash; cualquier diferencia falla cerrada
    si ya termino, devolver su resultado guardado
    bloquear solo las filas necesarias dentro de la transaccion
    volver a comprobar estado y reglas
    si la regla permite escribir:
        escribir la mutacion y el aviso a la profesional
        volver a leer el resultado
        hecho = true
    si la regla no permite escribir:
        hecho = false
    guardar resultado y completed_at del comando en la misma transaccion
    devolver {result:{texto, espera, hecho, cierra}, next_state}
```

El contrato exacto de parámetros, candidatos y textos vive en `docs/02-funciones.md`. Ninguna RPC
confía en una cita, paciente o profesional elegidos por el modelo.

`mandar_comprobante` además bloquea el pago y verifica en `storage.objects` el bucket, la ruta
`professional_id/payment_id/object_uuid.ext`, MIME, tamaño, SHA-256 guardado en metadata y
existencia antes de insertar la fila única de `payment_proofs` con su `checksum` obligatorio.

Todas las RPC del agente son exclusivas de servidor: `REVOKE EXECUTE` a `PUBLIC`, `anon` y
`authenticated`, y `GRANT EXECUTE` sólo a `service_role`. Si usan `SECURITY DEFINER`, pertenecen a
un rol dueño dedicado, llevan `SET search_path = ''` y cualifican cada objeto. Después de la
migración se ejecutan los advisors de seguridad y rendimiento de Supabase.

---

## 6. `agent_tool_gateway`

Adecuar la Edge Function existente; no crear un segundo agente.

```text
POST solamente
validar HMAC-SHA-256(timestamp + nonce + hash del cuerpo canonico)
comparar en tiempo constante, rechazar timestamp vencido y soportar rotacion de secreto
limitar tamaño y parsear JSON
si ruta = /identity:
    ejecutar sólo resolve_whatsapp_identity y devolver estado + identity_token
si ruta = /tool:
    validar operacion fija del adaptador contra las diez permitidas

leer del contexto confiable:
    identity_token sellado
    WAMID y conversacion
    medio, si aplica

abrir identity_token y revalidar link.updated_at, actividad, paciente y profesional

leer de input solamente los argumentos publicos del contrato
rechazar claves extra, objetos anidados y cualquier UUID

si la rama ya puede escribir:
    obtener los whatsapp_message_id estables del batch o reanudacion actual
    ordenar y deduplicar los identificadores
    derivar UUIDv5 = namespace(version + relacion + mensajes), sin operacion
    derivar request_hash de operacion + argumentos canonicos + paso sellado

si hay comprobante sin confirmacion:
    obtener URL fresca por el identificador de medio
    fijar HTTPS/host permitido/redirects y descargar con limite
    validar MIME, firma magica, dimensiones y tamano
    normalizar HEIC/HEIF o PDF de una pagina a JPEG
    no guardar; conservar el identificador sólo dentro del estado privado

si hay comprobante confirmado:
    abrir el identificador desde el estado sellado
    obtener URL fresca, descargar y validar de nuevo
    normalizar a JPEG/PNG/WebP de hasta 5 MiB
    usar ruta professional_id/payment_id/UUIDv5(command_id).ext
    subir create-only; si existe, exigir checksum/MIME/tamano identicos
    si la RPC no lo liga, borrar; si falla, encolar storage_cleanup_payment_proofs

llamar la RPC fija de la operacion
validar {texto, espera, hecho, cierra}
construir next_state interno sólo si la gestión sigue abierta
sellar next_state dentro del gateway con clave de Supabase
devolver al adaptador {result, state_token}
```

Las credenciales de Supabase permanecen en servidor. Los errores internos se registran con un ID
de correlación, sin devolver secretos ni SQL al Agent Node.

---

## 7. Adaptadores de Kapso y herramientas

Una Function Tool de Kapso recibe automáticamente el contexto completo; por eso se prefiere sobre
pedir al modelo que pase teléfono, BSUID o medios.

Crear diez adaptadores mínimos, uno por operación. Comparten implementación y sólo fijan el nombre
de operación antes de llamar `agent_tool_gateway`. El modelo controla `input`; no controla la
operación real ni el contexto.

Cada herramienta declara únicamente sus argumentos de negocio públicos. No aparecen:

- UUID;
- `patient_id` o `professional_id`;
- BSUID o teléfono;
- `command_id`;
- URL o ID interno de un comprobante;
- fecha actual o zona horaria.

La respuesta privada del gateway al adaptador es `{result, state_token}`. `result` conserva las
cuatro claves públicas; `state_token` ya contiene cifradas y autenticadas las opciones y recursos
internos necesarios para continuar. El adaptador valida `result` y devuelve al Agent Node las
cuatro claves junto con `vars.agent_state = state_token`. Si la gestión termina, limpia esa
variable. El adaptador nunca recibe la clave de sellado.

En la siguiente llamada el adaptador toma `vars.agent_state` de `execution_context` y lo reenvía al
gateway sin abrirlo. El gateway valida firma, versión, conversación, profesional y caducidad, y
recupera el contexto interno. Nunca acepta el estado desde `input`. El secreto para llamar al
gateway es específico del workflow; la clave de sellado y la `service_role` sólo viven dentro de
Supabase.

---

## 8. Configuración del workflow

1. Trigger de mensajes entrantes para el número autorizado.
2. Agrupamiento de cinco segundos.
3. Function Node `resolve_whatsapp_identity`.
4. Decide Node con los seis estados de identidad.
5. Solicitud de contacto por `recipient: BSUID`, espera y validación estricta de
   `origin: contact_request` para `needs_contact`.
6. Lista fija y espera para `needs_professional`.
7. Envío directo de `no_te_reconocemos`, `paciente_inactivo` o `fuera_de_alcance` para los cierres
   deterministas.
8. Compuerta determinista de medios: si el lote sólo trae formatos incompatibles, compone
   `no_entendi` con los verbos permitidos y espera; si además hay texto entendible, ignora el medio
   y conserva una sola respuesta.
9. Agent Node para `identified` con texto o medio compatible.

Configuración del Agent Node:

```text
model = gpt-5.6-luna
temperature = 0
message_delivery_mode = tool_only
sandbox = false
default tools = send_notification_to_user, enter_waiting, complete_task
function tools = las diez herramientas de dominio
```

El límite de iteraciones se fija conservadoramente después de pruebas; no se usa como regla de
negocio. La regla funcional es una herramienta de dominio por batch.

---

## 9. Prompt

Usar el prompt de `docs/05-prompt.md`. Sus prohibiciones principales:

- no calcular;
- no inventar ni reescribir `texto`;
- no aceptar identificadores;
- no llamar más de una herramienta de dominio por batch;
- no afirmar éxito sin `hecho: true`;
- llamar `enter_waiting` cuando falta una respuesta;
- llamar `complete_task` cuando terminó.

Saludo o agradecimiento con intención directa ejecuta esa intención. Sin intención directa, se
pregunta en qué puede ayudar y se espera. No se convierte automáticamente todo “hola” o “gracias”
en `mis_citas`.

---

## 10. Pruebas antes del número real

### 10.1 Identidad

- BSUID conocido sin teléfono: `identified`.
- BSUID desconocido sin teléfono: `needs_contact`.
- Contacto compartido que coincide: completa campos y continúa.
- `origin: other`, `from_user_id` distinto, varios teléfonos o `wa_id` incoherente: no liga y vuelve
  a solicitar el contacto nativo.
- Contacto compartido que no coincide: `not_patient` y no inserta vínculo.
- Vínculo existente inactivo: `inactive_patient`, nunca `not_patient`.
- Dos relaciones activas: `needs_professional`.
- Teléfono y BSUID incompatibles: `identity_conflict`, sin sobrescritura.
- Cambio manual de teléfono: limpia todos los campos de proveedor.
- Índice único: rechaza dos identidades iguales dentro de la misma relación profesional.
- Rotación de BSUID con el mismo contacto Kapso: reconcilia en el siguiente inbound sin duplicar.
- Status sólo BSUID: correlaciona entrega y no crea `whatsapp_links`.
- Envío por teléfono usa `to`; el contrato alternativo por BSUID usa `recipient`, nunca ambos.
- Tras `needs_contact` o `needs_professional`, el Agent Node recibe el batch original y no sólo la
  tarjeta o la selección.

### 10.2 Herramientas y RPC

- Las tres lecturas con relaciones activas, inactivas y ajenas.
- `dejar_resena`: relación activa, al menos una cita atendida, unicidad, `pending`, comentario como
  texto; rechazo inelegible, cross-tenant y replay.
- Cada mutación repetida con el mismo `command_id`: un solo efecto y el mismo resultado.
- Mismo `command_id` con payload distinto o segunda herramienta mutante para el mismo batch:
  `COMMAND_PAYLOAD_MISMATCH` y ningún segundo efecto.
- El mismo batch conserva los mismos WAMID durante un reintento de herramienta. Si no se demuestra,
  las mutaciones no se habilitan.
- Respuesta perdida después del commit: el reintento no repite la mutación.
- Dos intentos por el mismo horario: una escritura y una respuesta de horario ocupado.
- Aviso a la profesional falla: toda la mutación revierte.
- UUID o clave extra en `input`: rechazo antes de la RPC.
- Estado sellado alterado, vencido o reproducido en otra conversación: no muta y vuelve a preguntar.
- `opcion` o `confirmado` contra otra `pending_tool`, paso o acción: rechazo; una intención nueva no
  hereda el estado anterior.
- JPEG, PNG y WebP válidos de hasta 5 MiB.
- HEIC/HEIF y PDF de una página normalizados a JPEG; nunca se guardan crudos.
- PDF multipágina, MIME falso, archivo grande, bomba de dimensiones, audio, video y sticker
  rechazados sin mutación.
- Medio incompatible solo: respuesta determinista sin tokens; acompañado de texto entendible: se
  ignora el medio y se atiende el texto, con una sola respuesta.
- Primera llamada de comprobante: valida pero no crea objeto ni `payment_proofs`.
- Confirmación: crea un solo objeto privado y un solo registro; el reintento reutiliza ambos.
- Medio vencido o no recuperable al confirmar: pide reenviarlo y no muta.

### 10.3 Agent Node

- La RPC devuelve un texto: se envía idéntico, una vez, salvo el sufijo autorizado de
  `pendiente_lo_otro`.
- `espera` no nulo: manda el texto y entra en `waiting`.
- `cierra: true`: manda el texto y completa, salvo el caso probado de dos intenciones.
- Consulta `mis_citas`: completa.
- Creación de cita: completa sólo después de `hecho: true`.
- Saludo o agradecimiento sin intención: pregunta cómo ayudar y espera.
- Saludo con “muévela”: ejecuta reprogramación, no `mis_citas`.
- Dos intenciones en un batch: una sola mutación, texto exacto más dos saltos de línea y
  `pendiente_lo_otro`; después `enter_waiting` aunque la primera gestión tenga `cierra: true`.
- Identidades no activas nunca aparecen en registros de tokens del Agent Node.

### 10.4 Precio y entrega

- Una respuesta visible por batch.
- Ningún mensaje de progreso.
- Respuesta del agente dentro de la ventana abierta.
- Mensaje iniciado por negocio fuera de ventana usa plantilla por la vía existente.
- Registros de Kapso muestran tokens y costo por ejecución.
- Para respuestas directas del Agent Node, categoría y precio se verifican en logs/billing de
  Kapso; el MVP no inventa una tabla de costos ni escribe esa telemetría en `whatsapp_links`.

---

## 11. Corte a producción

1. Desplegar trigger corregido, identidad, RPC, gateway y adaptadores sin conectar el número.
2. Ejecutar pruebas de base y del workflow en un entorno controlado.
3. Confirmar que los textos coinciden con `docs/06-textos.md`.
4. Aprobar expresamente la reversa degradada: apagar automatización y atender manualmente.
5. Dejar terminar ejecuciones legacy y desconectar sus eventos entrantes.
6. Activar el workflow para el número.
7. Probar un caso por cada estado de identidad y una lectura antes de una mutación.
8. Vigilar duplicados, errores de herramientas, tokens, entrega y costo.

Para revertir, se desactiva el workflow y **no** se reconecta el webhook legacy: la atención pasa a
manual hasta corregir. Una reversa automática futura debe probar batches, BSUID-only, los seis
estados, la misma guardia de mutación y cero solape en vuelo. No se deshace el índice ni se borran
tablas.

---

## 12. Orden de implementación

| Orden | Trabajo | Estado |
|---|---|---|
| 1 | Índice único parcial de BSUID por profesional | **Realizado** |
| 2 | Limpiar identidad de proveedor cuando cambia `patients.phone` | **Siguiente paso** |
| 3 | `resolve_whatsapp_identity` y sus seis estados | Pendiente |
| 4 | RPC de lectura | Pendiente |
| 5 | RPC de mutación, `command_log` y avisos atómicos | Pendiente |
| 6 | Adecuar `agent_tool_gateway` | Pendiente |
| 7 | Adaptadores y herramientas de Kapso | Pendiente |
| 8 | Configurar Agent Node y workflow | Pendiente |
| 9 | Pruebas, aprobación de reversa degradada y corte controlado | Pendiente |

No se comienza el paso siguiente porque el anterior “parezca sencillo”: se valida su contrato y
sus casos negativos. En especial, no se activa el Agent Node hasta que identidad impida que
`not_patient` e `inactive_patient` lleguen al modelo.
