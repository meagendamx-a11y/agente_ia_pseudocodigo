# El agente de WhatsApp de la versión anterior

Corte: 2026-08-26. Todo lo de aquí está leído del proyecto Supabase **`deklbpimnkueqsugepqq`
(«Agenda PSI»)**, que sigue vivo: el código desplegado de las funciones de borde y el cuerpo
real de las funciones de la base, más conteos de las tablas de producción. Nada sale de
documentación ni de copias locales.

Este documento existe porque el dueño decidió que **agendar y reprogramar dejan de ir por
formulario y pasan a ser conversación**, y que quiere algo tan simple como lo de antes pero
por texto. Para copiar bien hay que entender qué era exactamente «lo de antes».

---

## 0. La verdad incómoda, primero

**El agente anterior nunca leyó un mensaje de texto.**

No es una forma de hablar. La función de la base que atendía el texto libre se llama
`rpc_handle_incoming_whatsapp_text_simple` y recibe exactamente dos cosas:

```sql
rpc_handle_incoming_whatsapp_text_simple(p_patient_phone text, p_twilio_message_sid text)
```

No hay un parámetro para el cuerpo del mensaje. Y en el borde, `whatsapp_weebhook_2` lee
`params['Body']` para clasificar el mensaje —sólo para saber si venía vacío— y **no se lo
pasa a nadie**:

```ts
if (inputKind === 'text') {
  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
    'rpc_handle_incoming_whatsapp_text_simple',
    {
      p_patient_phone: ctx.fromPhone,
      p_twilio_message_sid: ctx.messageSid,
    },
  )
```

Escribir «hola», «quiero agendar», «cámbiame la cita» o «ncjkdsa» producía **exactamente la
misma respuesta**, porque lo único que se miraba era el teléfono y si esa paciente tenía o
no una cita próxima.

Todo lo demás lo hacían **botones**. Y el botón traía adentro el número de la cita.

Eso deja el frente nuevo con una frase clara: **no hay nada que copiar del entendimiento de
texto, porque no existía. Lo que sí hay que copiar es cómo se cargaba el contexto y cómo se
contestaba.**

---

## 1. La función que enrutaba: `whatsapp_weebhook_2`

Una sola función de borde, sin verificación de JWT (`verify_jwt: false`), versión 35,
actualizada por última vez el **2026-04-28**. Twilio le pega con un POST de formulario y ella
contesta **TwiML en la misma llamada HTTP**: el texto que ve la paciente viaja en la respuesta,
no en una cola.

### 1.1 El árbol de decisión completo, tal como está en el código

```
POST whatsapp_weebhook_2
│
├─ método ≠ POST ──────────────────────────────► 405 "Method Not Allowed"
│
├─ 1) FIRMA. validateTwilioRequest()
│     HMAC-SHA1 sobre TWILIO_WEBHOOK_URL + params ordenados alfabéticamente,
│     comparación en tiempo constante contra el header X-Twilio-Signature.
│     no coincide ───────────────────────────► TwiML VACÍO (200, silencio)
│
├─ 2) TELÉFONO. From sin el prefijo "whatsapp:"
│     vacío ────────────────────────────────► TwiML VACÍO
│
├─ 3) DEDUPLICACIÓN. isNewInbound()
│     insert {message_sid, from_phone, raw_payload, received_at}
│     en la tabla que nombra TWILIO_INBOUND_DEDUPE_TABLE
│     · sin MessageSid ─────────────────────► sigue (se da por nuevo)
│     · variable de entorno vacía ──────────► sigue (se da por nuevo)   ← lo que pasa hoy
│     · error 23505 (repetido) ─────────────► TwiML VACÍO
│     · cualquier otro error ───────────────► sigue, "fail-open" explícito en el código
│
├─ 4) IDENTIDAD. findPatientLink()
│     select patient_id from whatsapp_links where patient_phone = From limit 1
│     no hay fila ──────────────────────────► MSG_NOT_REGISTERED (texto fijo)
│
└─ 5) CLASIFICACIÓN. classifyInput(), en este orden exacto y excluyente:
      │
      ├─ ButtonText ≠ "" ó ButtonPayload ≠ ""                 → quick_reply
      ├─ NumMedia > 0 y MediaUrl0 ≠ "" y
      │  MediaContentType0 empieza con "image/"               → image
      ├─ NumMedia > 0 (audio, video, PDF, sticker, ubicación) → unsupported_media
      ├─ Body ≠ ""                                            → text
      └─ nada de lo anterior                                  → unknown
```

Y de ahí, cada rama:

```
text              → rpc_handle_incoming_whatsapp_text_simple(teléfono, sid)
                    · error de la RPC ─────► TwiML VACÍO
                    · si no ───────────────► imprime reply_text; si viene null, TwiML VACÍO

unsupported_media → TwiML VACÍO. Silencio total. Ni un "no entiendo".

unknown           → TwiML VACÍO.

image             → processImageAndReturnTwiml()  (§1.3)

quick_reply       → getQuickReplyAction(normalizeLabel(ButtonText))
                    normalizeLabel = trim + minúsculas + quita acentos (NFD)
                    · "confirmar"                              → confirmar
                    · "cancelar"                               → cancelar
                    · "ver direccion"                          → ver_direccion
                    · "subir comprobante" | "enviar comprobante"→ subir_comprobante
                    · cualquier otra etiqueta ─────────────────► MSG_ONLY_BUTTONS
                    ↓
                    ButtonPayload debe cumplir /^[1-9][0-9]*$/
                    · no cumple ───────────────────────────────► MSG_ONLY_BUTTONS
                    ↓
                    ese número ES el appointment_id, y va directo a la RPC
```

**Nota importante:** el enrutado por botón se hace por la **etiqueta visible** del botón,
no por el payload. El payload sólo transporta el número de cita. Si mañana alguien cambia
el texto del botón en Twilio de «Ver dirección» a «Ver ubicación», el chat deja de
funcionar y contesta `MSG_ONLY_BUTTONS`.

### 1.2 Los dos textos fijos que vivían en el borde

```ts
const MSG_NOT_REGISTERED =
  'Hola. Te damos la bienvenida a Agenda Psi. Aun no apareces en nuestro registro. Si ya eres
   paciente, avisa a tu profesional para revisar tu registro. Si buscas psicologo, escribe al
   55 6437 0081  y un asesor te ayudara.'

const MSG_ONLY_BUTTONS =
  'Este chat funciona solo con botones y envío de comprobantes. Por favor, elige una opción
   válida. Si necesitas ayuda, envíanos un Whatsapp al 55 6437 0081.'
```

Son los **únicos** textos que escribe el borde. Todo lo demás lo redacta la base y el borde
sólo lo imprime.

### 1.3 La rama de imagen, que tiene su propio árbol antes de la RPC

El borde hace cuatro comprobaciones antes de tocar el archivo, para no descargar ni guardar
basura:

| Paso | Comprobación | Si falla, contesta |
|---|---|---|
| 1 | Hay `proof_request` con `status='ACTIVE'`, `expires_at > now()` y `patient_number` = el teléfono. Se toma la más reciente. | «No tenemos un comprobante pendiente en este momento. Si deseas enviarlo, primero selecciona el botón "Subir comprobante" en la cita correspondiente.» |
| 2 | Esa cita tiene `payment_method = 'TRANSFER'` | «Esta sesión no tiene pago por transferencia, no esperamos comprobante.» |
| 3 | Esa cita tiene `payment_status = 'PENDING'` | «Esta cita ya fue acreditada, no es necesario subir comprobante.» |
| 4 | Descarga de `MediaUrl0` con la credencial de Twilio, y tamaño ≤ **16 MB** (revisa `content-length` y otra vez el buffer real) | «No pudimos descargar tu comprobante. Intenta nuevamente.» / «El archivo es demasiado grande. Intenta con una imagen más ligera.» |

Luego sube al bucket `WHATSAPP_PROOFS_BUCKET` (por defecto `comprobantes`) con la ruta
`{professional_id}/{appointment_id}/{uuid}.{jpg|png|webp|bin}`, y recién ahí llama a la RPC.
**Si la RPC falla o no devuelve `reason = 'proof_attached'`, borra el archivo que acababa de
subir.** No deja huérfanos.

### 1.4 La rama de dirección, que no contesta con texto

`ver_direccion` es la única acción que **no** responde por TwiML cuando sale bien. La RPC
devuelve un `persistent_action` con formato `geo:lat,lng|etiqueta`, y el borde manda un
mensaje de **ubicación real de WhatsApp** por la API de Twilio (`POST /Messages.json` con
`PersistentAction`), y luego contesta TwiML vacío para no duplicar. Sólo si ese envío falla
cae a texto con el enlace de Google Maps.

---

## 2. Las seis acciones

Las seis son `SECURITY DEFINER`, devuelven `jsonb` y **todas** comparten el mismo contrato de
salida:

```json
{ "ok": true|false, "reason": "…", "reply_text": "…lo que lee la paciente…" }
```

El borde no interpreta nada: imprime `reply_text` y ya. **Esa es la decisión de diseño más
copiable de todo el sistema.**

### 2.1 Tabla resumen

| Acción | Recibe | Escribe | Qué le contesta a la paciente |
|---|---|---|---|
| `rpc_confirm_appointment_from_whatsapp` | teléfono, id de cita, sid | 1 fila en `appointment_confirmations` | «Cita confirmada, nos vemos pronto. ¡Sigue cuidando tu salud mental! 👏» |
| `rpc_cancel_appointment_from_whatsapp` | teléfono, id de cita, sid | `appointments.session_status='CANCELLED'` + `patient_policy_status` + aviso al profesional | «Cita cancelada con éxito.» |
| `rpc_request_payment_proof_from_whatsapp` | teléfono, id de cita, sid | cierra el `proof_request` ACTIVE anterior y crea uno nuevo a 24 h | «Sube la imagen de tu comprobante en este chat. Tienes 24 horas para enviarlo.» |
| `rpc_view_address_from_whatsapp` | teléfono, id de cita, sid | **nada** (sólo lee) | «Ubicación del consultorio de {nombre}» + pin de mapa |
| `rpc_handle_incoming_whatsapp_image` | teléfono, sid, url del archivo, tipo, número de medios | fila en `payment_proofs`, liga en `appointments.payment_proof_id`, consume el `proof_request`, aviso al profesional | «Comprobante recibido, muchas gracias.» |
| `rpc_handle_incoming_whatsapp_text_simple` | teléfono, sid | invalida tokens viejos, crea token nuevo, encola plantilla de WhatsApp | depende (§2.7) |

### 2.2 Cómo identificaba a la paciente: `p_patient_phone`

Las cuatro acciones de botón usan **exactamente el mismo patrón**, y es la pieza de
seguridad del sistema entero:

```sql
IF v_phone IS NULL OR v_phone = '' OR v_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
  RETURN jsonb_build_object('ok', false, 'reason', 'invalid_phone',
                            'reply_text', 'No pudimos validar tu número.');
END IF;

...

SELECT a.session_status INTO v_session_status
FROM public.appointments a
WHERE a.id = p_appointment_id
  AND EXISTS (
    SELECT 1 FROM public.whatsapp_links wl
    WHERE wl.patient_id = a.patient_id
      AND wl.patient_phone = v_phone
  )
FOR UPDATE OF a;

IF NOT FOUND THEN
  RETURN jsonb_build_object('ok', false, 'reason', 'appointment_not_owned_by_patient',
                            'reply_text', 'No encontramos esta cita para tu número.');
END IF;
```

Tres cosas en un solo movimiento:

1. **El teléfono se valida con formato E.164** antes de tocar nada.
2. **La pertenencia se comprueba en el mismo `WHERE` que trae la cita.** No hay un «primero
   busco al paciente y luego busco la cita»: si el número no es dueño de esa cita, la fila
   no existe para esa consulta. Un `appointment_id` adivinado no sirve de nada.
3. **`FOR UPDATE OF a` bloquea la cita en la misma sentencia**, así que dos toques al mismo
   botón se serializan.

No hay sesión, no hay token, no hay cookie. **El teléfono es la identidad y el candado.**

### 2.3 Cómo evitaba procesar dos veces: `p_twilio_message_sid`

Aquí hay que ser exacto, porque el nombre del parámetro promete más de lo que cumple:

| Acción | Qué hace realmente con el sid |
|---|---|
| `confirm` | **Lo usa de verdad.** Lo guarda en `appointment_confirmations.twilio_message_sid` con `ON CONFLICT (appointment_id) DO NOTHING`, respaldado por el índice único `uq_appointment_confirmations_appointment_id`. |
| `cancel` | Sólo verifica que no venga vacío. Nunca lo vuelve a mencionar. |
| `request_payment_proof` | Sólo verifica que no venga vacío. |
| `view_address` | Sólo verifica que no venga vacío. |
| `handle_incoming_image` | Sólo verifica que no venga vacío. |
| `handle_incoming_text_simple` | **Lo recibe y no lo usa nunca.** Parámetro muerto. |

Entonces, ¿cómo evitaba de verdad el doble procesamiento? **Con el estado, no con el
identificador del mensaje.** Cada acción es idempotente por su propia condición:

- **Confirmar:** el índice único por cita. La segunda vez el `INSERT` no mete fila,
  `ROW_COUNT = 0`, y contesta «Esta cita ya estaba confirmada. Nos vemos pronto.»
- **Cancelar:** `UPDATE … WHERE id = ? AND session_status = 'SCHEDULED'`. La segunda vez
  actualiza cero filas y cae a «Acción no disponible para esta cita.» El aviso al
  profesional sólo se escribe si `ROW_COUNT = 1`.
- **Pedir comprobante:** índice único parcial
  `proof_request_one_active_per_patient_uidx ON (patient_id) WHERE status='ACTIVE'`.
  Sólo puede haber una solicitud viva por paciente; la función cierra la anterior a
  `SUPERSEDED` antes de crear la nueva, con `SELECT … FOR UPDATE` sobre `patients` para
  serializar.
- **Subir comprobante:** el `UPDATE` exige `payment_proof_id IS NULL`, y si no actualiza
  exactamente una fila lanza excepción y revierte todo el bloque.
- **Ver dirección:** no escribe nada, así que repetir es gratis.

### 2.4 `rpc_cancel_appointment_from_whatsapp`, la única que evalúa política

Es la única que mira la configuración del profesional:

```sql
SELECT COALESCE(c.min_cancel_notice, false) INTO v_min_cancel_notice
FROM public.configurations c WHERE c.professional_id = v_professional_id LIMIT 1;

v_now_mx := timezone('America/Mexico_City', now());

IF v_min_cancel_notice AND (v_start_datetime - v_now_mx) < interval '24 hours' THEN
  v_patient_policy_status := 'OUT_OF_TIME';
  v_policy_status_label := 'outside_policy';
ELSE
  v_patient_policy_status := 'IN_TIME';
  v_policy_status_label := 'within_policy';
END IF;
```

Y el detalle que importa para el diseño nuevo: **cancelar tarde no cobra nada ni lo intenta.**
Sólo sella la etiqueta `OUT_OF_TIME` en la cita y le escribe un aviso al profesional con
`create_notification(… 'appointment_cancelled' …)`. **El dinero lo decide el profesional
después, desde su app.** La paciente ve la misma frase corta en los dos casos: «Cita
cancelada con éxito.»

Antes de llegar ahí, cuatro salidas por estado, todas con `ok: true`:

| `session_status` | Respuesta |
|---|---|
| `PAST` | «No se puede cancelar porque la cita ya pasó.» |
| `RESCHEDULED` | «No se puede cancelar porque la cita ya fue reprogramada.» |
| `CANCELLED` | «No se puede cancelar porque la cita ya fue cancelada.» |
| cualquier otro | «Acción no disponible para esta cita.» |

`confirm` tiene la misma estructura con otros textos: «Esta cita ya ocurrió.» / «Esta cita
fue reprogramada.» / «Esta cita fue cancelada.»

### 2.5 `rpc_request_payment_proof_from_whatsapp`

Dos puertas de dinero antes de crear nada:

```sql
IF COALESCE(v_payment_method, '') <> 'TRANSFER' THEN
  → ok:false, 'appointment_not_transfer', «Esta cita no usa pago por transferencia.»
IF COALESCE(v_payment_status, '') <> 'PENDING' THEN
  → ok:true,  'payment_not_pending', «Esta cita ya fue acreditada, no es necesario subir comprobante.»
```

Y luego crea el `proof_request` con `expires_at = now() + interval '24 hours'`. Ese renglón
es **el único pedazo de estado conversacional que existía en todo el sistema** (ver §3.2).

### 2.6 `rpc_handle_incoming_whatsapp_image`

Repite en la base las mismas tres puertas que ya revisó el borde —transferencia, pendiente,
solicitud viva— porque la base no confía en el borde. Después, el núcleo atómico en un
bloque con `EXCEPTION WHEN others`:

```sql
INSERT INTO public.payment_proofs (created_at, professional_id, patient_id, file_url) …
UPDATE public.appointments SET payment_proof_id = …, last_movement_at = now()
 WHERE id = … AND payment_method = 'TRANSFER' AND payment_status = 'PENDING'
   AND payment_proof_id IS NULL;
IF ROW_COUNT <> 1 THEN RAISE EXCEPTION 'appointment_not_pending_or_already_has_proof'; END IF;
UPDATE public.proof_request SET status = 'CONSUMED' WHERE id = … AND status = 'ACTIVE';
IF ROW_COUNT <> 1 THEN RAISE EXCEPTION 'proof_request_consume_failed'; END IF;
```

Si algo revienta, contesta «Error al subir comprobante. Intenta nuevamente desde el botón
"Subir comprobante".» y el borde borra el archivo del bucket.

El aviso al profesional (`payment_proof_uploaded`) va en un bloque aparte con
`EXCEPTION WHEN others THEN NULL`: **es "mejor esfuerzo", si falla no tumba la operación.**
Ojo: eso es lo contrario de la regla 6 del diseño nuevo, que exige que el aviso viva en la
misma transacción.

Y el mensaje nunca dice «pagado» ni «aprobado». Dice «Comprobante recibido, muchas gracias.»
Esa restricción ya existía y hay que conservarla.

### 2.7 `rpc_handle_incoming_whatsapp_text_simple`, la más larga y la que no lee nada

Es la pieza clave para el frente nuevo, porque es literalmente el lugar donde el agente
anterior decidía qué hacer con «quiero una cita». Su árbol completo:

```
0. normaliza teléfono (quita "whatsapp:" por si acaso). vacío → ok:false, reply_text:null

1. busca en whatsapp_links JOIN patients
      professional_id := coalesce(wl.professional_id, p.professional_id)

2. sin paciente → «Hola. Te damos la bienvenida a Agenda Psi. Aun no apareces en nuestro
                  registro…»  (el mismo texto que el borde, duplicado)

3. paciente con is_active = false →
   «Hola {nombre} 👋 / Por ahora no apareces como paciente activo en Agenda Psi. /
    Si crees que es un error o necesitas ayuda, escríbenos al 55 6437 0081.»

4. busca la PRÓXIMA cita SCHEDULED:
      where patient_id = ? and session_status='SCHEDULED'
        and start_datetime >= now() en CDMX
      order by start_datetime asc limit 1

5. SI TIENE CITA PRÓXIMA → no manda nada, sólo texto:
   «Hola {nombre} 👋
    Ya tienes una cita próxima con Psic. {profesional} el {DD/MM} a las {h:mm AM}.
    Modalidad: {Presencial | En línea}.
    Este chat funciona solo con botones y envío de comprobantes.
    Para confirmar, cancelar o reprogramar tu cita, usa los botones del recordatorio que se
    envía un día antes de tu sesión.
    Si necesitas ayuda personalizada, escríbenos al 55 6437 0081.»

6. SI NO TIENE CITA PRÓXIMA → resuelve profesional (link → paciente → última cita).
   sin profesional → «No encontramos un profesional asociado para agendar una cita…»

7-8. invalida los tokens 'create_appointment' en estado 'created' de esa pareja
     paciente/profesional (status='invalidated', canceled_at=now())

9.   crea token nuevo: create_booking_access_token_for_create(paciente, profesional)
     → 16 bytes aleatorios en hex, se guarda sólo el SHA-256, vigencia 7 días

10.  encola plantilla HXae25ae694623ef5159bf5f42570c5b5d (job_type 'mensaje_inicial')
     con vars {1: nombre paciente, 2: nombre profesional, 3: token en claro}

11.  dispara el envío inmediato con dispatch_whatsapp_job_now(); si falla,
     el cron de 1 minuto queda de respaldo (bloque EXCEPTION que no rompe la RPC)

12.  devuelve reply_text = null  →  el borde NO contesta por TwiML.
     El mensaje real llega como plantilla, con su botón de enlace.
```

El paso 12 es una decisión fina que vale la pena entender: **el borde puede contestar texto,
pero no puede contestar botones.** TwiML sólo manda texto. Para mandar un botón con enlace
hay que ir por la API de plantillas de Twilio. Por eso, cuando la respuesta necesitaba un
botón, la RPC devolvía `reply_text: null` y encolaba un job.

---

## 3. El contexto entre mensajes

Esta es la parte más importante del frente, porque es justo lo que hay que reconstruir.

### 3.1 No había tabla de estado de conversación. Punto.

Las 18 tablas del proyecto anterior:

```
appointment_confirmations   appointments              booking_access_tokens
configurations              notifications             patient_services
patients                    payment_proofs            professionals
proof_request               rescheduled_appointments  services
special_schedules           twilio_inbound_dedupe     weekly_schedules
whatsapp_jobs               whatsapp_jobs_new         whatsapp_links
```

Ninguna guarda «en qué va la conversación», «qué preguntó el agente la vez pasada» ni «de qué
cita estamos hablando». No hay `conversation`, no hay `session`, no hay `turn`, no hay
`pending_intent`.

### 3.2 El contexto viajaba dentro del botón

**El `appointment_id` iba como variable de la plantilla, y Twilio lo devolvía como
`ButtonPayload`.** Se ve tal cual en el generador del recordatorio de 24 h:

```sql
jsonb_build_object(
  '1', r.patient_first_name,
  '2', r.professional_first_name,
  '3', to_char(r.start_datetime, 'FMHH12:MI AM'),
  '4', 'Presencial' | 'En línea',
  '5', r.appointment_id::text,     -- ← payload del botón «Confirmar»
  '6', r.appointment_id::text,     -- ← payload del botón «Cancelar»
  '7', r.booking_token_raw         -- ← token del botón de enlace «Reprogramar»
)
```

Y un ejemplo real de producción, de `whatsapp_jobs_new`:

```json
{"1":"Nayeli","2":"Maricruz","3":"9:00 AM","4":"Presencial",
 "5":"1435","6":"1435","7":"10480277902063a819d74895d88539f6"}
```

`1435` es el número de la cita, dos veces, una por botón.

Cuando la paciente toca «Confirmar», Twilio manda de vuelta
`ButtonText = "Confirmar"` y `ButtonPayload = "1435"`. El borde toma esos dos campos y ya
sabe todo: **qué quiere** (la etiqueta) y **de qué cita habla** (el payload). Sin consultar
nada, sin memoria, sin sesión.

**El contexto no se guardaba: se mandaba y regresaba.**

### 3.3 La única excepción: `proof_request`, un estado de una sola casilla

Hay exactamente un caso donde el contexto sí tuvo que quedarse en la base: subir el
comprobante. Porque la foto llega **sin botón**, y el borde necesita saber a qué cita
pegarla.

La solución fue la más pequeña posible:

| Pieza | Cómo funciona |
|---|---|
| Se crea | Al tocar «Subir comprobante», con `appointment_id`, `patient_id`, `professional_id` y el teléfono |
| Cuánto vive | `expires_at = now() + 24 horas` |
| Cuántas puede haber | Una por paciente, forzado por índice único parcial `ON (patient_id) WHERE status='ACTIVE'` |
| Cómo se cierra | `CONSUMED` al pegar la foto; `SUPERSEDED` si la paciente pide otra antes |
| Cómo se busca | `WHERE status='ACTIVE' AND expires_at > now() AND patient_number = <teléfono> ORDER BY created_at DESC LIMIT 1` |

En producción: **16 solicitudes, 12 consumidas, 25 comprobantes guardados.** Funcionó.

**Este es el molde exacto para agendar por texto.** Una tabla de una fila viva por paciente,
con vencimiento, con un índice único que garantiza que no haya dos, y que se cierra sola
cuando se usa. Nada más.

### 3.4 Agendar y reprogramar salían de la conversación

Cuando la paciente quería una cita nueva o mover la que tenía, el chat **dejaba de ser el
lugar donde pasan las cosas** y se convertía en un repartidor de enlaces:

| Qué | Tipo de token | Vigencia | Dónde se crea |
|---|---|---|---|
| Agendar | `create_appointment` | **7 días** | Al escribir texto sin cita próxima, y al terminar cada sesión (`post_appointment_followup`) |
| Reprogramar | `reschedule_appointment` | **2 días** | Dentro del recordatorio de 24 h, uno por cita |

El token son 16 bytes aleatorios en hex (32 caracteres); en la base sólo se guarda el
SHA-256. Viaja en claro como variable de la plantilla, dentro del enlace del botón. Del otro
lado, tres funciones de borde (`resolve-booking-access`,
`get-current-booking-access-context`, `get-booking-access-context-data`) lo cambiaban por
una cookie de sesión web.

**Los números de producción de esa web:**

| Estado | Agendar | Reprogramar |
|---|---|---|
| `created` (nunca abierto) | 356 | 363 |
| `active_session` (sí abrió) | 52 | 12 |
| `expired` | 11 | 3 |
| `invalidated` | 3 | 0 |
| **Total** | **422** | **378** |

De 800 enlaces mandados, **64 se abrieron: 8 %**. Y `status='consumed'` tiene **cero filas
en toda la historia** — el ciclo del token nunca llegó a cerrarse.

Contrasta con los botones del mismo chat: **348 confirmaciones** sobre 372 recordatorios de
24 h enviados. **94 %.**

Ese contraste es el argumento numérico de la decisión del dueño. Lo que se contestaba con un
botón se contestaba; lo que salía a una web, no.

---

## 4. Botones y plantillas

### 4.1 Qué se mandaba con cada cosa

| Medio | Cuándo | Quién lo manda |
|---|---|---|
| **Texto libre (TwiML)** | Siempre que la respuesta cabía en texto y la paciente acababa de escribir | `whatsapp_weebhook_2`, en la misma llamada HTTP |
| **Plantilla con botones** | Todo mensaje que arranca el sistema, y toda respuesta que necesita un botón | `whatsapp_jobs_new` → `new_whatsapp_jobs_sender` → Twilio Content API |
| **Ubicación (pin de mapa)** | Sólo «Ver dirección» | `whatsapp_weebhook_2`, con `PersistentAction: geo:lat,lng\|etiqueta` |
| **Lista** | **Nunca.** No hay una sola lista en todo el sistema. | — |

### 4.2 El catálogo completo de plantillas, con envíos reales

Sacado de `whatsapp_jobs_new`, agrupado por `content_sid`:

| ContentSid | `job_type` | Envíos | Último | Variables |
|---|---|---:|---|---|
| `HX0299451fcfdf36fadf2b0eefe2df2ee6` | `reminder_24h` | 372 | 2026-08-09 | 1 paciente · 2 profesional · 3 hora · 4 modalidad · **5 id cita** · **6 id cita** · **7 token reprogramar** |
| `HX3d3a771a02a73010be648717ea44cdb0` | `reminder_1h` presencial | 300 | 2026-08-26 | 1 paciente · 2 hora inicio · 3 hora fin · **4 id cita** |
| `HX8c77591aed981434bf091956ca1119b3` | `post_appointment_followup` | 230 | 2026-08-24 | 1 paciente · 2 profesional · **3 token agendar** |
| `HXbe7349b2c83ae093b615666c265eb44d` | `post_appointment_followup` (versión vieja) | 183 | 2026-06-01 | 1 paciente · 2 profesional · **3 token agendar** |
| `HX4acbfc217a9c012f76dd5be9e6247a5f` | `reminder_1h` en línea | 117 | 2026-08-23 | 1 paciente · 2 hora inicio · 3 hora fin — **sin id: no lleva botón** |
| `HX9bcaebae45294d1d8b74c6d3cd4ab47e` | `SHOW` (cobro tras asistir) | 114 | 2026-08-22 | 1 paciente · 2 fecha · **3 id cita** |
| `HXdeb3fc75ffd4a33344a25c8d00ac5307` | `notification_no_charge_rescheduled` | 88 | 2026-08-18 | 1 paciente · 2 profesional · 3 fecha vieja · 4 fecha nueva · 5 hora · 6 modalidad — sin botón |
| `HX04ea0c91754ac451da5b563615eca320` | `template_funciones_habilitadas` | 67 | 2026-04-20 | 1 paciente — aviso masivo, sin botón |
| `HX8b30967d311f5aabfa56cb046ed4172d` | `notification_no_charge_cancelled` | 38 | 2026-08-18 | 1 paciente · 2 profesional · 3 fecha · 4 hora — sin botón |
| `HXae25ae694623ef5159bf5f42570c5b5d` | `mensaje_inicial` | 6 | 2026-07-13 | 1 paciente · 2 profesional · **3 token agendar** |
| `HX9e8a431ec1565c2117c6fc5b103b0646` | `CANCELLED` (cobro) | 1 | 2026-06-02 | 1 paciente · 2 profesional · 3 fecha · 4 hora · **5 id cita** |
| `HXb847d3cd9683c74d256a904d8ea049c6` | `CANCELLED_OUT_TIME` | 1 | 2026-05-25 | 1 paciente · 2 profesional · 3 fecha · 4 hora · **5 id cita** |
| `HX61f6c970e7b798c24d473ddf229d2b28` | `RESCHEDULED` | 1 | 2026-06-02 | 1 paciente · 2 profesional · 3 fecha vieja · 4 fecha nueva · 5 hora · 6 modalidad · **7 id cita** |
| `HXc2b9141b2d316b9ba175f6ebbdc4dc8a` | `RESCHEDULED_OUT_TIME` | 0 | — | 1 paciente · 2 profesional · 3 fecha · **4 id cita** |
| `HXb3ed7976e627c6e8f34e4d45476fa504` | `NO_SHOW` | 0 | — | 1 paciente · 2 fecha · 3 hora · **4 id cita** |

Regla de lectura, sin excepciones: **si la plantilla lleva el `appointment_id` como variable,
tiene botón de respuesta rápida. Si lleva un token, tiene botón de enlace. Si no lleva
ninguno de los dos, no tiene botón.**

Las cuatro etiquetas que el borde reconoce —«Confirmar», «Cancelar», «Ver dirección», «Subir
comprobante»/«Enviar comprobante»— son **todo el vocabulario del sistema**. Sólo cuatro
palabras, repartidas entre 15 plantillas.

### 4.3 Dos cosas que ya no corren

Vale la pena decirlo porque cambia lo que se puede probar hoy contra el proyecto viejo:

- El cron `whatsapp-confirm-25hours-5min` (`create_jobs_for_confirm_25hours`) está
  **`active: false`**. Por eso el último `reminder_24h` es del **9 de agosto**. El
  recordatorio con los botones de confirmar/cancelar/reprogramar **ya no se genera.**
- El cron `dispatch_whatsapp_jobs_every_1min` también está **`active: false`**. El único
  camino de salida hoy es el disparo inmediato `dispatch_whatsapp_job_now()`. Hay **67 jobs
  atorados en `created`** que nadie va a mandar.

Lo que sigue vivo es el cron `whatsapp-generators-2min`, que corre el recordatorio de 1 hora
y el seguimiento posterior a la sesión.

---

## 5. Lo que no entendía

No había escalamiento a humano, no había clasificador, no había «no te entendí, ¿quisiste
decir…?». Había **cinco salidas**, y tres de ellas eran silencio:

| Situación | Respuesta |
|---|---|
| Teléfono sin fila en `whatsapp_links` | `MSG_NOT_REGISTERED` — texto fijo con el 55 6437 0081 |
| Botón con etiqueta desconocida, o payload que no es un entero positivo | `MSG_ONLY_BUTTONS` — «Este chat funciona solo con botones…» |
| Texto libre, cualquiera que sea | La respuesta de `text_simple`: o «ya tienes cita próxima, usa los botones del recordatorio», o la plantilla para agendar |
| Audio, video, PDF, sticker, ubicación, contacto | **Silencio.** `twimlEmpty()` |
| Mensaje sin cuerpo, sin medio y sin botón | **Silencio.** `twimlEmpty()` |
| Firma de Twilio inválida | **Silencio**, con 200 |
| Cualquier error de una RPC | **Silencio.** `console.error` y `twimlEmpty()` |

El escalamiento era **un número de teléfono escrito dentro del texto**: 55 6437 0081. Cuatro
mensajes distintos lo llevan. No había handoff, ni bandeja, ni aviso a nadie. La paciente
tenía que escribirle a otro número.

---

## 6. Los límites

| Límite | Cómo estaba | Estado real |
|---|---|---|
| **Tope de tráfico entrante** | **No existe.** Ni por teléfono, ni por minuto, ni global. | Nunca hubo |
| **Deduplicación de entrada** | Tabla `twilio_inbound_dedupe` con índice único `twilio_inbound_dedupe_message_sid_uidx ON (message_sid)` y captura del payload completo | **Apagada.** La tabla tiene **0 filas** en toda la historia, con 348 confirmaciones registradas. La variable `TWILIO_INBOUND_DEDUPE_TABLE` está vacía y el código toma la rama `if (!dedupeTable) return true` |
| **Fail-open declarado** | Si el insert de dedupe falla por cualquier razón distinta de `23505`, el código sigue y lo comenta: `'dedupe insert failed, continuing fail-open'` | Decisión consciente: prefiere procesar dos veces que perder un mensaje |
| **Reintentos de salida** | **No existen.** `markJobFailed()` pone `status='failed'` y ahí muere. No hay contador, no hay espera progresiva, no hay reencolado | **112 jobs en `failed`** que nadie reintentó |
| **Tope por corrida de salida** | `MAX_JOBS_PER_RUN`, por defecto **20** | Activo |
| **Ventana horaria** | El generador de seguimiento sólo corre entre **06:00 y 22:00 CDMX**; fuera de eso devuelve 0 | Activo |
| **Ventana de 24 h de WhatsApp** | No se administra en ningún lado. Se resuelve por construcción: el borde sólo manda texto libre **como respuesta** a un mensaje entrante, y todo lo que arranca el sistema sale como plantilla | Correcto por diseño, no por código |
| **Comprobante** | Vigencia de la solicitud **24 h**; una viva por paciente; imagen ≤ **16 MB**; sólo `image/*` | Activo |
| **Tokens de la web** | Agendar **7 días**, reprogramar **2 días**; sólo se guarda el SHA-256; al pedir uno nuevo se invalidan los `created` anteriores de esa pareja | Activo |
| **Un job por cita y tipo** | Índice único `whatsapp_jobs_new (appointment_id, job_type)` más un `NOT EXISTS` en cada generador | Activo, doble candado |
| **Un sid de Twilio por job** | Índice único parcial sobre `twilio_message_sid WHERE NOT NULL` | Activo |

Un detalle que conviene no heredar: `whatsapp_links` tiene **único por `patient_id`** pero el
índice sobre `patient_phone` **no es único**, aunque se llame `whatsapp_links_patient_phone_uidx`.
Dos pacientes con el mismo teléfono romperían la identidad, y el borde resuelve con
`.limit(1).maybeSingle()`: se queda con la primera que salga. Hoy hay 45 vínculos.

Y el mecanismo de baja: cuando un paciente pasa a `is_active = false`, el disparador
`sync_whatsapp_links_on_patient_active_change` **borra el vínculo**. Por eso el borde no
necesita comprobar «activo»: si no está activo, no tiene fila, y cae en `MSG_NOT_REGISTERED`.

---

## 7. Qué hacía bien y por qué era simple

Ocho decisiones. Estas son las que hay que copiar.

**1. El contexto viaja en el mensaje, no en la base.**
El número de cita iba dentro del botón y regresaba dentro del botón. Cero tablas de estado,
cero expiración que administrar, cero «¿de qué cita hablábamos?». Para agendar por texto no
se puede hacer literal —el texto no trae payload— pero la idea traduce: **que lo que la
paciente acaba de decir sea suficiente para saber de qué cita habla, y si no lo es, que el
sistema lo pregunte con una opción numerada en vez de recordarlo.**

**2. Cuando hizo falta guardar contexto, se guardó una sola casilla.**
`proof_request`: una fila viva por paciente, 24 horas, índice único parcial que garantiza
que no haya dos, y se cierra sola al usarse. No es una máquina de estados. Es un recado
pegado en el refrigerador con fecha de caducidad. **Ese es el molde para agendar y
reprogramar por texto.**

**3. La identidad y el permiso son la misma consulta.**
`WHERE a.id = ? AND EXISTS (whatsapp_links con este teléfono)`. No hay «autenticar y luego
autorizar». Si el número no es dueño de la cita, la cita no existe. Un `appointment_id`
adivinado no sirve para nada. Y el `FOR UPDATE` va en la misma sentencia.

**4. El texto lo escribe la base; el borde sólo lo imprime.**
Las seis acciones devuelven `{ok, reason, reply_text}` y el borde hace
`twimlFromRpc(rpcData)`. El borde no sabe nada del producto. Se puede cambiar cualquier
frase con un `CREATE OR REPLACE FUNCTION`, sin desplegar código.

**5. La respuesta viaja en la misma llamada HTTP.**
TwiML sincrónico. Sin cola, sin reintentos, sin «pendiente de enviar», sin ventana que
administrar. Si la función contestó, la paciente lo vio. Todo el aparato de jobs existía
sólo para lo que el sistema arranca por su cuenta.

**6. La idempotencia es una condición de estado, no un identificador de mensaje.**
`ON CONFLICT (appointment_id)` para confirmar, `WHERE session_status='SCHEDULED'` para
cancelar, `WHERE payment_proof_id IS NULL` para el comprobante. No hace falta llevar
registro de qué mensajes ya se procesaron: la operación misma se niega a repetirse. Por eso
la deduplicación por `MessageSid` pudo quedarse apagada durante toda la vida del producto
sin que nadie lo notara.

**7. Repetir una acción da una respuesta útil, no un error.**
La segunda confirmación no dice «error»: dice «Esta cita ya estaba confirmada. Nos vemos
pronto.» Cancelar algo ya cancelado dice «No se puede cancelar porque la cita ya fue
cancelada.» Cuatro estados, cuatro frases, todas con `ok: true`. La paciente nunca ve una
falla técnica.

**8. El agente mueve la agenda, pero nunca resuelve el dinero.**
Cancelar tarde sella `OUT_OF_TIME` y le avisa al profesional. Subir comprobante guarda el
archivo y dice «Comprobante recibido», nunca «pagado». **El chat registra; la persona
decide.** Esa regla ya estaba y coincide con lo que el dueño quiere hoy.

### Y lo que no hay que copiar

- **El vocabulario de cuatro palabras.** Enrutar por la etiqueta visible del botón hace que
  cambiar un texto en Twilio rompa el chat.
- **El silencio como respuesta.** Mandar un audio y no recibir nada es peor que recibir «por
  ahora sólo puedo leer texto».
- **El aviso al profesional como "mejor esfuerzo".** En `handle_incoming_image` el
  `create_notification` va en un `EXCEPTION WHEN others THEN NULL`. Si falla, el comprobante
  entra y el profesional nunca se entera.
- **Los `failed` terminales.** 112 mensajes que nadie mandó y nadie reintentó.
- **Sacar a la paciente del chat.** 800 enlaces, 64 abiertos, 0 consumidos. Contra 372
  recordatorios con botones y 348 confirmaciones. El número ya dio su veredicto.
