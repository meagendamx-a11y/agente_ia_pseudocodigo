# Catálogo de herramientas y contratos del agente

Corte: 2026-08-25. Substrato: `docs/hallazgos-auditoria-agente.md`, que se da por cierto.
Todo detalle que no estaba ahí se verificó contra la base desplegada (Supabase
`ssyzfeadyrczlzjbvxyl`) y viene con su evidencia. La documentación de `referencias/`
no es fuente.

---

## 0. El punto de partida

El diseño anterior tenía dos formas posibles y las dos están descartadas por evidencia.

**Un orquestador único, no.** Es un anti-patrón con nombre —*God Tool*— y la razón
técnica es sencilla: los modelos eligen herramienta leyendo la descripción, no
inspeccionando el esquema. Una sola descripción para veintidós comportamientos no
distingue nada.

**Veintidós herramientas, tampoco.** La precisión de selección se cae entre diez y
quince herramientas, y las de en medio se eligen menos que las de los extremos. La
mitigación que sí funciona es filtrar primero a un subconjunto relevante y elegir
después.

De ahí salen **seis herramientas nombradas por intención**, de las cuales el servidor
enciende **entre dos y cinco** según lo que la paciente pueda hacer en ese momento.

Cuatro reglas de forma que valen para las seis:

1. **Esquema discriminado plano.** Un campo `operacion` con enum cerrado más un objeto
   `datos`. Nunca un `oneOf` de muchas ramas: el parser de Kapso es Ruby y es sensible
   a la forma. `datos` es de un solo nivel: sólo escalares, nunca otro objeto ni un
   arreglo de objetos. El modo de fallo documentado del esquema anidado es que el
   modelo manda JSON mal formado, Kapso lo rechaza antes de invocar, la función nunca
   corre y el modelo abandona la herramienta.
2. **Ninguna clave es opcional.** Las que no aplican a esa operación van presentes y en
   `null`. El portal ya compara el conjunto exacto de claves (`parseExactBody` en
   `supabase/functions/agent_tool_gateway/handler.ts`): una clave de más o una de menos
   es `400` y no llega a la base.
3. **El modelo nunca escribe la correlación.** `kapso_execution_id` y
   `provider_message_id` los inyecta el Worker de Kapso desde `execution_context`, no
   viven en el `input_schema`, y son lo que ata la llamada a un turno sellado.
   Verificado en `kapso/functions/agenda-psi-agent-runtime.js`.
4. **Las seis herramientas cuelgan de una sola función de Kapso.** Una función de Kapso
   es un script de Cloudflare Worker; el plan Free admite cinco y hoy hay cuatro
   (`agenda-psi-complete-inbound`, `agenda-psi-mark-inbound-waiting` y los dos endpoints
   de los formularios). Seis funciones nuevas no caben. No hace falta: la función lee el
   conjunto exacto de claves que le llegó y sabe de qué herramienta viene —los seis
   conjuntos son distintos, y el único que comparten dos (`operacion` + `datos`) lo
   desempata el valor de `operacion`, porque los dos enums son disjuntos. El modelo no
   escribe ni una clave de más. El runtime desplegado ya multiplexa así: la función
   `agenda-psi-complete-inbound` —cuyo código en el repositorio es
   `kapso/functions/agenda-psi-agent-runtime.js`— atiende la Function Tool
   `get_capabilities` y el nodo de cierre desde el mismo archivo, y elige entre
   `/tools/capabilities` y `/workflow/complete` mirando si el cuerpo trae a la vez
   `input`, `flow_info` y `flow_events`, que es lo que Kapso sólo pone en una Function
   Tool (verificado leyendo el archivo). Lo que ese precedente demuestra es que **una
   función atiende a dos llamadores distintos**; que atienda a seis Function Tools es lo
   que hay que comprobar antes de escribir código (§9, punto 12).

Y una regla de idioma: **lo que ve el modelo va en español**; los identificadores
internos del portero se quedan en inglés porque ya están desplegados
(`complete_inbound` sigue siendo `complete_inbound`). El portal traduce en una línea.
La modalidad es el caso concreto: el modelo escribe `en_linea` o `presencial`, y el portal
los convierte a los dos únicos valores del tipo `public.modality` de la base, `online` e
`in_person` (verificado en `pg_enum`).

---

## 1. Las seis herramientas

### 1.1 `abrir_expediente`

**Descripción tal como la ve el modelo:**

> Trae de golpe todo lo de esta conversación: quién escribe, con qué profesional, los
> plazos reales de esa profesional, sus próximas citas con lo que se puede hacer en cada
> una, y lo que tiene pendiente de pagar. Llámala siempre primero, en cada mensaje que te
> escriba, y siempre sin identificador: los identificadores del mensaje anterior ya no
> sirven. Si el expediente te dice que la relación es ambigua, contéstale con
> `responder_con_texto_fijo` y el código `elige_profesional` —ese texto ya trae los dos
> nombres— y, cuando te conteste, vuelve a llamarla sin identificador para tener la
> lista fresca y llámala otra vez con el identificador de la que eligió. No la uses para
> refrescar después de un cambio: la respuesta del cambio ya te dice cómo quedó todo.

**Entrada:**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["relacion"],
  "properties": {
    "relacion": {
      "type": ["string", "null"],
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
      "description": "Siempre null, salvo cuando acabas de recibir en este mismo mensaje un expediente con relacion: \"ambigua\": entonces se llena con un identificador de esa lista `relaciones`."
    }
  }
}
```

**Salida:** el expediente completo. Su forma exacta está en la sección 2.

**Por qué se llama en cada mensaje, y no una vez por conversación.** Cada mensaje entrante
abre un turno nuevo, y los identificadores están atados al turno que los emitió:
`private.agent_resolve_option_token` rechaza con `TOKEN_CONTEXT_INVALID` en cuanto
`token.turn_id` no coincide con el turno que pregunta (verificado leyendo el cuerpo). Un
identificador de cita que el modelo vio en el mensaje anterior está muerto en éste, sin
importar la hora. Por eso el expediente se abre de nuevo cada vez —cuesta una de las ocho
llamadas y devuelve identificadores vivos— y por eso la relación ambigua se resuelve con
dos llamadas dentro del mismo turno: una sin identificador para tener la lista fresca, y
otra con el que la paciente eligió.

---

### 1.2 `gestionar_cita`

**Descripción tal como la ve el modelo:**

> Cambia una cita que ya existe sin moverle la fecha: confirmar que sí va, cancelarla, o
> pasarla de en línea a presencial o al revés. Úsala sólo con una cita que el expediente
> haya traído, y sólo con la acción que esa cita traiga en su lista `acciones`. No la uses
> para mover la cita de día u hora —eso sale por formulario, con `abrir_formulario`— ni
> para cancelar una cita cuyo `dinero_adentro` sea verdadero: ese dinero se mueve con la
> cita, no se pierde.

**Entrada:**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["operacion", "datos"],
  "properties": {
    "operacion": {
      "type": "string",
      "enum": ["confirmar", "cancelar", "cambiar_modalidad"]
    },
    "datos": {
      "type": "object",
      "additionalProperties": false,
      "required": ["cita", "modalidad"],
      "properties": {
        "cita": {
          "type": "string",
          "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
          "description": "El identificador que trajo el expediente en `citas[].cita`."
        },
        "modalidad": {
          "type": ["string", "null"],
          "enum": ["en_linea", "presencial", null],
          "description": "Sólo con operacion `cambiar_modalidad`. En `confirmar` y `cancelar` va null."
        }
      }
    }
  }
}
```

**Salida:** el sobre de mutación de la sección 6.

---

### 1.3 `abrir_formulario`

**Descripción tal como la ve el modelo:**

> Abre el formulario de WhatsApp donde la paciente elige día y hora: `agendar` para una
> cita nueva, `reprogramar` para mover una que ya tiene. Úsala en cuanto pida agendar o
> cambiar de día, sin preguntarle antes por horarios: el formulario le enseña los que de
> verdad hay. No propongas tú ningún horario, no la uses para cambiar sólo la modalidad,
> y en cuanto la abras espera: el turno queda en manos del formulario.

**Entrada:**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["operacion"],
  "properties": {
    "operacion": { "type": "string", "enum": ["agendar", "reprogramar"] }
  }
}
```

Un solo campo, un enum de dos valores, nada anidado. **No lleva identificador de cita**, y
eso es deliberado: en modo `reprogramar` la primera pantalla del formulario lista las citas
de ella y ella escoge cuál mueve. El modelo no tiene que acertarle, y una decisión menos del
modelo es una decisión menos que puede salir mal.

**Salida:**

```json
{
  "ok": true,
  "turn_disposition": "wait",
  "result": {
    "operacion": "reprogramar",
    "abierto": true,
    "mensaje_de_cierre": "Te abro el calendario de Araceli para que escojas el nuevo día. Tu pago se va con la cita.",
    "acciones_disponibles": []
  }
}
```

Y cuando no se puede abrir, `abierto: false` con el motivo y su texto, que el modelo manda
tal cual:

```json
{
  "ok": true,
  "turn_disposition": "keep_open",
  "result": {
    "operacion": "agendar",
    "abierto": false,
    "motivo": "AGENDA_CERRADA",
    "mensaje_de_cierre": "Tu psicóloga todavía no abre su agenda para que ustedes aparten solas. ¿Le aviso que la buscas?",
    "acciones_disponibles": ["responder_con_texto_fijo"]
  }
}
```

Tres motivos y nada más: `AGENDA_CERRADA` (`professionals.is_patient_scheduling_enabled`
en falso), `SIN_COMBINACIONES` (ningún servicio activo con días abiertos en la ventana) y
`SIN_CITAS` (modo mover sin citas futuras).

`turn_disposition: "wait"` es nuevo. Hoy el portal sólo admite `close` y `keep_open`, y el
turno se estaciona con una segunda llamada a `/workflow/waiting`. Con `wait` **la misma
llamada abre el formulario y deja el turno en `waiting_external`**: la ruta manda el mensaje
interactivo por la API de Kapso y, después de cerrar su propia llamada en el portero, llama
a `public.agent_mark_inbound_waiting`. Un viaje menos, una llamada del presupuesto de
vuelta, y una carrera menos. El modelo llama a `enter_waiting` y ya; no pasa por
`sync_waiting`. La forma exacta del envío está en `04-formulario.md` §5.0.

---

### 1.4 `registrar_comprobante`

**Descripción tal como la ve el modelo:**

> Guarda el comprobante de pago que la paciente acaba de mandar como imagen o PDF, y le
> avisa a la profesional que ya llegó. Úsala nada más cuando el expediente traiga un pago
> con `registrar_comprobante` entre sus acciones y el archivo venga en este mismo mensaje.
> Nunca le digas que el pago quedó cubierto, aprobado o pagado: la profesional es quien lo
> revisa, y eso es exactamente lo que le tienes que decir.

**Entrada:**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["cita"],
  "properties": {
    "cita": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
      "description": "La cita cuyo pago trae este comprobante, de `pagos[].cita`."
    }
  }
}
```

Una sola intención, así que no lleva `operacion` ni `datos`: un enum de un valor sólo
añade una decisión que el modelo puede equivocar.

**De dónde sale el archivo, que no es de donde decía el diseño anterior.** Los cuatro
campos —`storage_object_path`, `mime_type`, `size_bytes`, `checksum`— no los escribe el
modelo, y tampoco los puede poner «el nodo de Kapso que subió la imagen», porque ese nodo
no existe: las cuatro funciones de Kapso desplegadas son las dos de control y los dos
endpoints de formulario, ninguna toca medios, y `whatsapp_context` —la única vía por la
que una Function Tool vería el archivo— **no llega**, porque nuestra ejecución arranca por
API y ese bloque sólo existe cuando la ejecución viene de WhatsApp.

El archivo entra por donde ya entra todo lo demás: **`kapso_inbound_webhook`, al admitir el
mensaje**. Es el único componente que ve el mensaje crudo de WhatsApp. Ahí se baja el
archivo, se guarda en el almacenamiento y se dejan los cuatro campos colgados del renglón
de `public.whatsapp_inbound_messages` de ese mensaje. Cuando el modelo llama a
`registrar_comprobante`, el portal ya tiene el `provider_message_id` —es la correlación que
ata todo— y de ahí saca el archivo. Consecuencias: el modelo no puede inventar una ruta de
almacenamiento, el cuerpo de la petición encoge a una sola clave, y la validación de forma
(JPEG, PNG o PDF; hasta 5 242 880 octetos; checksum de 64 hexadecimales, hoy en
`parsePaymentProofInput`) se muda al webhook, que es quien tiene el archivo en la mano.

**Hueco bloqueante:** hoy `kapso_inbound_webhook/handler.ts` no tiene una sola línea de
medios ni de almacenamiento, y `whatsapp_inbound_messages` no tiene dónde guardar los
cuatro campos (sus 22 columnas están verificadas contra la base). Sin esa pieza,
`registrar_comprobante` no puede funcionar aunque la función de base ya esté escrita. Es el
segundo bloqueo de despliegue del catálogo, junto con la llave de identificadores de la
sección 3.

**Y una consecuencia de forma: el archivo pertenece al mensaje, no a la conversación.** Si
la paciente escribe «ahorita te lo mando» y la imagen llega en el mensaje siguiente, la
llamada del primer mensaje no tiene nada que adjuntar —su `provider_message_id` es otro—.
Ése es el error `SIN_ARCHIVO` de la sección 7.1, con su remediación: pedirle que lo mande
como foto o PDF. Sin ese error el modelo se queda inventando qué contestar, que es
exactamente el caso más frecuente de esta herramienta.

**Salida:** el sobre de mutación de la sección 6.

---

### 1.5 `enviar_resena`

**Descripción tal como la ve el modelo:**

> Guarda la calificación de 1 a 5 y el comentario que la paciente quiera dejarle a su
> profesional. Úsala sólo cuando el expediente diga que sí puede reseñar y cuando la
> paciente ya te haya dado la calificación con un número. No la uses para quejas ni para
> reportar un problema con una cita, y no le digas que ya se publicó: una persona la
> revisa antes de que se vea.

**Entrada:**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["calificacion", "comentario"],
  "properties": {
    "calificacion": { "type": "integer", "minimum": 1, "maximum": 5 },
    "comentario": {
      "type": ["string", "null"],
      "maxLength": 1000,
      "description": "El texto de la paciente, tal cual. null si sólo dio calificación."
    }
  }
}
```

El tope de 1 000 caracteres no es un número inventado: es el `CHECK` de
`public.reviews.comment`. La reseña pertenece al par paciente–profesional, no a una cita
(`uq_review_patient_professional UNIQUE (patient_id, professional_id)`), así que aquí no
viaja ningún identificador de cita.

**Y es la herramienta que sobra.** Ninguna función desplegada escribe `moderation_status`:
lo que capture el agente queda `pending` e invisible hasta que una persona lo publique a
mano, y no hay quien lo haga. El mensaje de cierre le prometería a la paciente una reseña
que ningún código desplegado puede publicar. En producción hay **cero reseñas**. Además se
enciende sólo cuando la paciente no tiene cita próxima ni pago pendiente, que es el caso
menos frecuente de todos. **Recomendación: dejarla fuera de esta ronda y quedarse con
cinco herramientas.** El catálogo sigue escrito con seis porque la decisión es del dueño
(sección 9, punto 6); si la respuesta es que nadie modera, se borra esta sección entera,
la operación `submit_review` del portero, la ruta `/tools/reviews/submit` y los dos
errores de reseña de la sección 7.

**Salida:** el sobre de mutación de la sección 6, con `estado: "en_revision"`.

---

### 1.6 `responder_con_texto_fijo`

**Descripción tal como la ve el modelo:**

> Devuelve, palabra por palabra, la respuesta que le toca a una situación que no se
> resuelve con datos: algo fuera de lo que puedes hacer, un teléfono que no reconocemos, o
> cualquier asunto de cobros. Úsala cuando ninguna de las otras herramientas aplique y
> necesites cerrar bien la conversación. Manda el texto tal como venga, sin agregarle nada
> y sin quitarle nada.

**Entrada:**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["respuesta"],
  "properties": {
    "respuesta": {
      "type": "string",
      "enum": [
        "fuera_de_alcance",
        "asunto_de_dinero",
        "no_te_reconocemos",
        "elige_profesional",
        "agenda_cerrada",
        "dada_de_baja"
      ]
    }
  }
}
```

**Salida:**

```json
{
  "ok": true,
  "turn_disposition": "keep_open",
  "result": {
    "respuesta": "asunto_de_dinero",
    "mensaje_de_cierre": "Los cobros, descuentos y condonaciones los decide Araceli directamente. Yo te puedo ayudar con tus citas y con mandarle tu comprobante.",
    "acciones_disponibles": ["abrir_formulario"]
  }
}
```

El texto lo compone el servidor. El modelo escoge el código; nunca la redacción. Ése es
el patrón *Action-Selector*: el modelo traduce a un conjunto de acciones predefinido, y
la elección de acción queda inmune a lo que venga escrito en el mensaje entrante.

**`elige_profesional` es el único que lleva datos dentro**, y también los pone el servidor:
toma los nombres de `relaciones` de ese mismo turno y arma la pregunta. Por eso la relación
ambigua no necesita que el modelo escriba nada libre en el único momento en que tiene
delante los datos de dos pacientes distintas.

**El cierre del turno depende del código, no es siempre `keep_open`.**
`no_te_reconocemos` y `dada_de_baja` devuelven `turn_disposition: "close"`: no hay
conversación que continuar y dejar el turno abierto sólo invita a un segundo intento.
`fuera_de_alcance`, `asunto_de_dinero`, `elige_profesional` y `agenda_cerrada` devuelven
`keep_open`, porque después de cualquiera de los cuatro la paciente sí puede querer otra
cosa dentro del mismo turno.

**Seis códigos, no siete: la crisis no está aquí, y es deliberado.** El texto de crisis vive
literal en el prompt (`05-prompt.md` §2.4). Si dependiera de esta herramienta dependería de
una llamada de red, del presupuesto de ocho y de que el portero no la rechace, y un
`TOOL_BUDGET_EXCEEDED` en un mensaje de crisis es silencio en el peor momento posible del
producto. Es la única excepción a la regla de que los textos los compone el servidor.

**Traspaso a persona:** tampoco está en este enum. `handoff_to_human` es una herramienta
nativa de Kapso, requerida por defecto a nivel de workflow y sin vía documentada para
apagarla, y el traspaso es un nodo terminal, no una opción dentro del bucle. Se contiene por
prompt, y quien pide hablar con una persona recibe `fuera_de_alcance`.

---

### 1.7 Qué se declara y cuándo

Kapso declara las herramientas en el nodo (`flow_agent_function_tools`), no por ejecución:
no hay forma documentada de enseñar un catálogo distinto en cada conversación. Así que
**las seis viven declaradas en el nodo y el subconjunto activo viaja como dato**: el
expediente devuelve `herramientas_disponibles`, y el portero rechaza cualquier otra con
un error que vuelve a nombrar las que sí quedan. El filtrado ocurre igual, sólo que en el
resultado en vez de en la lista.

| Situación | Herramientas encendidas | Cuántas |
|---|---|---|
| Relación ambigua | `abrir_expediente`, `responder_con_texto_fijo` | 2 |
| Teléfono sin relación | `responder_con_texto_fijo` | 1 |
| Paciente dada de baja | `responder_con_texto_fijo` | 1 |
| Paciente activa, sin cita próxima, sin pago pendiente | `abrir_expediente`, `abrir_formulario`, `responder_con_texto_fijo` | 3 |
| …y además puede reseñar | + `enviar_resena` | 4 |
| Paciente activa con cita próxima | `abrir_expediente`, `gestionar_cita`, `abrir_formulario`, `responder_con_texto_fijo` | 4 |
| …y además con comprobante pedido | + `registrar_comprobante` | 5 |

`abrir_expediente` sólo se queda encendida en el caso ambiguo, que es el único que necesita
una segunda llamada dentro del mismo turno. En los demás ya se llamó, y volver a llamarla
gasta una de las ocho para recibir lo mismo.

`enviar_resena` se enciende sólo cuando no hay cita próxima ni pago pendiente. Es lo que
mantiene el tope en cinco, y además es lo correcto: no se le pide una reseña a alguien que
está intentando mover su cita del jueves.

**Y de paso se arregla un desajuste heredado.** `agent_get_capabilities` —que se retira
entera, §1.8— enciende `submit_review` para toda paciente activa: son 17. La regla real de
la reseña —activa, con al menos una cita `attended`, y sin reseña enviada— sólo admite 11
(verificado contra la base), así que el modelo ofrecía algo que se le iba a negar. El
expediente usa la regla real, no `patient_status = 'active'`, y por eso `resena.puede` es un
booleano calculado y no una copia de un interruptor.

---

### 1.8 Lo que se quedó fuera, y por qué

| Se quita | Razón |
|---|---|
| `get_capabilities`, `select_relationship`, `list_upcoming_appointments`, `get_next_appointment`, `get_pending_payments`, `get_appointment_payment_status`, `get_location`, `get_professional_share_profile` | Ocho lecturas que el expediente trae de una sola vez. Ocho descripciones que el modelo tenía que discriminar, y ocho llamadas contra un presupuesto de ocho. |
| `list_services`, `get_booking_eligibility`, `get_availability` | Agendar sale por formulario. Los servicios y los huecos los consume el formulario, no el modelo. Si el modelo no puede proponer horarios, no necesita verlos. |
| `create_appointment` y `reschedule_appointment` conversacionales | Misma razón, y es la decisión del dueño: agendar y mover van por formulario. Sus dos rutas (`/tools/appointments/create`, `/tools/appointments/reschedule`) mueren con ellas; las funciones escritas se reaprovechan enteras en la superficie del formulario. |
| `cancel_then_open_booking_flow` | Es la única ruta del sistema por la que el dinero de una paciente se evapora: cancela y crea una cita nueva con un pago limpio. Contradice la regla del dueño. Con ella se va toda la maquinaria de saga. |
| `resume_resource_delivery` | No hay consumidor de `public.jobs` en la base desplegada, nada escribe `quick_reply_token_hash`, y `tg_jobs_solo_recursos_bi` descarta en silencio. La operación no puede funcionar aunque se escriba. |
| `list_marketplace_professionals` | Capacidad encendida sin ninguna operación detrás. Se apaga hasta que el marketplace entre a una ronda. |
| Compartir el perfil público | No merece herramienta: es un campo del expediente (`profesional.perfil_publico`), presente sólo cuando el perfil está aprobado. |

---

## 2. El expediente de apertura

Es la herramienta más importante y la única que se llama siempre. Su trabajo es que el
modelo no tenga que calcular nada: ni restar horas, ni comparar plazos, ni adivinar si una
cita se puede cancelar.

### 2.1 Forma exacta

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["ahora", "zona", "relacion", "relaciones", "paciente", "profesional",
               "citas", "pagos", "resena", "herramientas_disponibles"],
  "properties": {
    "ahora":  { "type": "string", "description": "Fecha y hora local del consultorio, ISO-8601 con desfase." },
    "zona":   { "type": "string", "description": "Zona horaria del consultorio. Nunca la escoge el modelo." },
    "relacion": { "type": "string", "enum": ["paciente", "ambigua", "publica", "dada_de_baja"] },

    "relaciones": {
      "type": "array", "maxItems": 4,
      "description": "Vacío salvo cuando relacion = \"ambigua\".",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["relacion", "etiqueta"],
        "properties": {
          "relacion": { "type": "string" },
          "etiqueta": { "type": "string", "maxLength": 60 }
        }
      }
    },

    "paciente": {
      "type": ["object", "null"], "additionalProperties": false,
      "required": ["nombre"],
      "properties": { "nombre": { "type": "string", "maxLength": 40 } }
    },

    "profesional": {
      "type": ["object", "null"], "additionalProperties": false,
      "required": ["nombre", "agenda_abierta", "anticipacion_minima_horas",
                   "aviso_de_cambio_horas", "cobro", "cambio_de_modalidad",
                   "donde", "perfil_publico"],
      "properties": {
        "nombre": { "type": "string", "maxLength": 60 },
        "agenda_abierta": { "type": "boolean" },
        "anticipacion_minima_horas": { "type": "integer" },
        "aviso_de_cambio_horas": { "type": "integer" },
        "cobro": { "type": "string", "enum": ["antes", "despues"] },
        "cambio_de_modalidad": {
          "type": "object", "additionalProperties": false,
          "required": ["a_en_linea", "a_presencial", "aviso_horas"],
          "properties": {
            "a_en_linea":  { "type": "boolean" },
            "a_presencial":{ "type": "boolean" },
            "aviso_horas": { "type": "integer" }
          }
        },
        "donde": {
          "type": "object", "additionalProperties": false,
          "required": ["direccion", "liga"],
          "properties": {
            "direccion": { "type": ["string", "null"], "maxLength": 120 },
            "liga":      { "type": ["string", "null"], "maxLength": 200 }
          }
        },
        "perfil_publico": { "type": ["string", "null"], "maxLength": 120 }
      }
    },

    "citas": {
      "type": "array", "maxItems": 3,
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["cita", "etiqueta", "confirmada", "dinero_adentro",
                     "cambio_a_tiempo", "acciones"],
        "properties": {
          "cita":     { "type": "string" },
          "etiqueta": { "type": "string", "maxLength": 60 },
          "confirmada":      { "type": "boolean" },
          "dinero_adentro":  { "type": "boolean" },
          "cambio_a_tiempo": { "type": "boolean" },
          "acciones": {
            "type": "array", "maxItems": 4,
            "items": { "type": "string",
              "enum": ["confirmar", "cancelar", "cambiar_modalidad", "reprogramar"] }
          }
        }
      }
    },

    "pagos": {
      "type": "array", "maxItems": 3,
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["cita", "etiqueta", "importe", "estado", "acciones"],
        "properties": {
          "cita":     { "type": "string" },
          "etiqueta": { "type": "string", "maxLength": 60 },
          "importe":  { "type": "string" },
          "estado": { "type": "string",
            "enum": ["esperando_comprobante", "comprobante_en_revision", "por_cobrar"] },
          "acciones": {
            "type": "array", "maxItems": 1,
            "items": { "type": "string", "enum": ["registrar_comprobante"] }
          }
        }
      }
    },

    "resena": {
      "type": "object", "additionalProperties": false,
      "required": ["puede"],
      "properties": { "puede": { "type": "boolean" } }
    },

    "herramientas_disponibles": {
      "type": "array", "maxItems": 5,
      "items": { "type": "string",
        "enum": ["abrir_expediente", "gestionar_cita", "abrir_formulario",
                 "registrar_comprobante", "enviar_resena", "responder_con_texto_fijo"] }
    }
  }
}
```

**Las diez claves de primer nivel van siempre**, aunque vayan vacías: `relaciones: []`,
`citas: []`, `pagos: []`, `paciente: null`, `profesional: null`. Es la misma regla que
gobierna el sobre de mutación en la sección 6 —la ausencia de un campo es una invitación a
inventar— y aquí importa más, porque un expediente sin `citas` no significa lo mismo que un
expediente con `citas: []`: lo primero el modelo lo lee como «no me lo dijeron» y lo segundo
como «no tiene ninguna».

### 2.2 Campo por campo

| Campo | De dónde sale | Por qué está |
|---|---|---|
| `ahora`, `zona` | `professionals.timezone`, hora del servidor | Los modelos no comparten una noción consistente de «ahora». Se inyecta explícita, y ninguna herramienta acepta una zona del modelo. |
| `relacion` | Resolución de `whatsapp_links` contra el teléfono | Cuatro estados cerrados. Es lo primero que decide qué se puede hacer. |
| `relaciones[]` | `whatsapp_links` con `patients.patient_status = 'active'` | Sólo aparece en el caso ambiguo. Cada renglón es un par identificador–etiqueta. |
| `paciente.nombre` | `patients.first_name` | Para saludar. Nada más de la ficha clínica viaja: ni edad, ni motivo de consulta, ni contacto de emergencia. |
| `profesional.agenda_abierta` | `professionals.is_patient_scheduling_enabled` | Si está en falso, `abrir_formulario/agendar` no se ofrece. |
| `profesional.anticipacion_minima_horas` | `professional_appointment_policies.patient_min_booking_lead_minutes ÷ 60` | Con cuánta anticipación puede agendar. Tres de cinco profesionales piden 48 h. |
| `profesional.aviso_de_cambio_horas` | `…free_change_notice_minutes ÷ 60` | El plazo para cancelar o mover sin que la profesional pueda cobrar. |
| `profesional.cobro` | `…charge_timing` | `antes` cambia todo el guion del dinero. Hoy sólo Araceli. |
| `profesional.cambio_de_modalidad` | `…patient_can_switch_to_online`, `…patient_can_switch_to_in_person`, `…min_lead_to_change_modality_minutes` | La direccionalidad es real: `test` permite pasar a en línea pero no a presencial. |
| `profesional.donde` | `professionals.office_address`, `professionals.fixed_meeting_url` | Los dos, siempre presentes, aunque vayan en `null`. Ninguna profesional tiene los dos a la vez, y una presencial sin dirección no se inventa. |
| `profesional.perfil_publico` | Liga pública cuando `professional_profiles.profile_status = 'approved'` | Sustituye a la herramienta de compartir perfil. Nunca lleva el teléfono publicado dentro. |
| `citas[].confirmada` | `appointments.confirmed_at IS NOT NULL` | Para no volver a pedir que confirme algo ya confirmado. |
| `citas[].dinero_adentro` | `payments.status = 'credited' OR EXISTS(payment_proofs del pago)` | La bandera que impide que el dinero se evapore. Una petición sellada sin archivo **no** cuenta. |
| `citas[].cambio_a_tiempo` | `starts_at >= ahora + free_change_notice_minutes` | Calculado en el servidor con el plazo de esa profesional. **No decide si se puede cancelar**, decide qué le dice el mensaje de cierre: en falso, que su profesional decidirá si le cobra. |
| `citas[].acciones` | Derivado de todo lo anterior | Lo que de verdad se puede hacer con esa cita, ahora mismo. El modelo no filtra; escoge de esta lista. `cancelar` desaparece por una sola razón: dinero adentro. Nunca por el plazo. |
| `pagos[].estado` | `payments` + `payment_proofs` | `esperando_comprobante` = pedido sin archivo. `comprobante_en_revision` = archivo recibido, la profesional decide. `por_cobrar` = pendiente sin petición. |
| `resena.puede` | Activa + ≥1 cita `attended` + sin reseña enviada | La regla real, no `patient_status = 'active'`. |
| `herramientas_disponibles` | Sección 1.7 | El subconjunto relevante, entregado como dato. |

**Lo que deliberadamente no viaja:** el teléfono de nadie, el apellido de la paciente, el
texto de reseñas de terceras (superficie de inyección), los identificadores internos de
la base, y los montos dentro de los avisos.

### 2.3 Tres ejemplos reales

**Caso 1 — Emilio, paciente de Araceli, con una cita el jueves y prepago pendiente.**
Araceli cobra antes, pide 48 h de anticipación, da 24 h de aviso de cambio, permite los
dos cambios de modalidad, tiene dirección y no tiene liga. El pago tiene la petición de
comprobante sellada pero todavía sin archivo, así que `dinero_adentro` es falso y cancelar
sigue disponible.

```json
{
  "ahora": "2026-08-25T10:12:00-06:00",
  "zona": "America/Mexico_City",
  "relacion": "paciente",
  "paciente": { "nombre": "Emilio" },
  "profesional": {
    "nombre": "Araceli Ramírez",
    "agenda_abierta": true,
    "anticipacion_minima_horas": 48,
    "aviso_de_cambio_horas": 24,
    "cobro": "antes",
    "cambio_de_modalidad": { "a_en_linea": true, "a_presencial": true, "aviso_horas": 24 },
    "donde": { "direccion": "Av. Insurgentes Sur 1602, piso 4, Ciudad de México", "liga": null },
    "perfil_publico": "https://agendapsi.mx/p/araceli-ramirez"
  },
  "citas": [
    {
      "cita": "9f1c4d2a-6b70-4c11-9a3e-0d5f8e12b447",
      "etiqueta": "jueves 27 de agosto, 3:30 p. m., en línea",
      "confirmada": false,
      "dinero_adentro": false,
      "cambio_a_tiempo": true,
      "acciones": ["confirmar", "cancelar", "cambiar_modalidad", "reprogramar"]
    }
  ],
  "pagos": [
    {
      "cita": "9f1c4d2a-6b70-4c11-9a3e-0d5f8e12b447",
      "etiqueta": "jueves 27 de agosto, 3:30 p. m.",
      "importe": "1200.00",
      "estado": "esperando_comprobante",
      "acciones": ["registrar_comprobante"]
    }
  ],
  "resena": { "puede": false },
  "herramientas_disponibles": [
    "gestionar_cita", "abrir_formulario", "registrar_comprobante", "responder_con_texto_fijo"
  ]
}
```

**Caso 2 — la misma cita, pero el comprobante ya llegó.** Cambian tres cosas y ninguna la
decide el modelo: `dinero_adentro` pasa a verdadero, `cancelar` desaparece de las acciones
de la cita, y el pago pasa a `comprobante_en_revision` sin acciones. La paciente que pide
cancelar recibe la oferta de mover, porque el dinero se va con la cita.

```json
{
  "citas": [
    {
      "cita": "9f1c4d2a-6b70-4c11-9a3e-0d5f8e12b447",
      "etiqueta": "jueves 27 de agosto, 3:30 p. m., en línea",
      "confirmada": false,
      "dinero_adentro": true,
      "cambio_a_tiempo": true,
      "acciones": ["confirmar", "cambiar_modalidad", "reprogramar"]
    }
  ],
  "pagos": [
    {
      "cita": "9f1c4d2a-6b70-4c11-9a3e-0d5f8e12b447",
      "etiqueta": "jueves 27 de agosto, 3:30 p. m.",
      "importe": "1200.00",
      "estado": "comprobante_en_revision",
      "acciones": []
    }
  ]
}
```

**Caso 3 — un teléfono que pertenece a dos pacientes de dos profesionales distintas.**

```json
{
  "ahora": "2026-08-25T10:12:00-06:00",
  "zona": "America/Mexico_City",
  "relacion": "ambigua",
  "relaciones": [
    { "relacion": "5b2f9e01-4a3d-4f88-b0c2-77ad9e3f1120", "etiqueta": "Araceli Ramírez" },
    { "relacion": "c7d1a840-2e56-4b09-9f31-6c04b8e2d915", "etiqueta": "Miranda Jiménez" }
  ],
  "paciente": null,
  "profesional": null,
  "citas": [],
  "pagos": [],
  "resena": { "puede": false },
  "herramientas_disponibles": ["abrir_expediente", "responder_con_texto_fijo"]
}
```

El modelo contesta con el texto fijo `elige_profesional` —que el servidor arma con esos dos
nombres— y se despide del turno. Cuando ella contesta llega
un mensaje nuevo, y con él un turno nuevo: los dos identificadores de arriba ya están
muertos, así que el modelo vuelve a llamar `abrir_expediente` sin identificador, recibe la
misma lista con identificadores vivos, y la llama otra vez con el que corresponde al
nombre que ella dijo. Dos llamadas de las ocho. Nunca ve un identificador desnudo: siempre
va pegado a su etiqueta.

Hoy este caso **no existe en producción**: cero teléfonos con más de un vínculo de
WhatsApp (verificado). Se sostiene porque un teléfono compartido es real —una madre y una
hija, dos profesionales— y porque sin él ese teléfono no recibiría nada.

### 2.4 El techo, en caracteres

**6 000 caracteres.** Ése es el tope duro del expediente en el servidor.

La justificación es aritmética. `chk_agent_tool_calls_redacted_result_size` limita
`redacted_result` a **16 384 octetos**, y `jsonResponse` del portal limita el cuerpo
completo de la respuesta al mismo número (`MAX_JSON_RESPONSE_BYTES = 16_384`, verificado en
`supabase/functions/_shared/agent/constants.ts`). El sobre `{"ok":true,"turn_disposition":
"keep_open","result":{…}}` cuesta 54 octetos. El español acentuado gasta dos octetos por
letra acentuada; medido sobre el ejemplo del caso 1, son 1 064 caracteres contra 1 067
octetos, o sea 0.3%. Aun suponiendo un 3% —diez veces más—, 6 000 caracteres pesan menos de
6 200 octetos. Quedan más de 10 000 octetos de aire. Cabe holgado, y con margen para que un
nombre largo o una dirección larga no arruinen nada.

El tope se sostiene con cinco reglas, no con un recorte a última hora:

1. Máximo **3 citas** y **3 pagos**. Nadie gestiona más de tres cosas en una conversación
   de WhatsApp, y la agenda completa se ve en la app.
2. Las etiquetas se cortan a **60 caracteres**; la dirección a **120**; la liga y el perfil
   a **200** y **120**.
3. Ningún texto libre de terceras personas entra jamás.
4. Ningún campo se repite: la dirección y la liga viven una sola vez, en la profesional,
   porque una relación es una profesional.
5. El expediente del caso 1 —con una cita y un pago— pesa **1 064 caracteres**. Con el
   tope de tres citas y tres pagos no llega a 1 900. El techo de 6 000 es más del triple de
   lo que el expediente más cargado puede pesar.

### 2.5 Los plazos salen de la ficha, nunca de una constante

Esto no es una precaución: es un error que ya estaría en producción si el texto dijera
«24 horas».

| Profesional | Anticipación mínima | Aviso de cambio | Cambio de modalidad | Cobro |
|---|---|---|---|---|
| Araceli | 48 h | 24 h | a las dos, 24 h | **antes** |
| Miranda | 48 h | **12 h** | a las dos, **12 h** | después |
| test | 48 h | 24 h | **sólo a en línea**, 24 h | después |
| Maricruz tes | 24 h | 24 h | ninguna | después |
| Test | 24 h | 24 h | ninguna | después |

Miranda da **12 horas** de aviso de cambio. Un texto que diga «necesito 24 horas» le miente
a sus pacientes en la dirección peligrosa: creen que ya es tarde cuando todavía están a
tiempo, y se aguantan una cita que podían mover gratis. Por eso el expediente entrega
`aviso_de_cambio_horas` como número y `cambio_a_tiempo` ya calculado, y el prompt sólo
sabe decir «con {aviso_de_cambio_horas} horas de anticipación».

Y por eso el permiso de `SELECT` sobre `public.professional_appointment_policies` es
bloqueante: sin él el expediente no puede calcular ninguna de las dos cosas. Hoy el rol del
agente **no lo tiene** (sección 8).

Nota aparte, para que no se confundan dos plazos distintos: el margen de **26 horas** del
que se le habla a la profesional como «24» es el del aviso de confirmación
(`cron_appointment_confirmation_26h`). No tiene nada que ver con
`free_change_notice_minutes`, que es el plazo de cambio de la paciente. Son dos relojes.

---

## 3. Handles con etiqueta

Los identificadores opacos se quedan. Son un control de seguridad —atan cada opción al
turno, a la sesión, al teléfono y a la paciente, y caducan— no una decisión de
presentación. Pero un identificador desnudo degrada de verdad la precisión del modelo:
la recomendación explícita de Anthropic es devolver referencias legibles.

**La forma: cada identificador viaja emparejado con una etiqueta, siempre.**

```json
{ "cita": "9f1c4d2a-6b70-4c11-9a3e-0d5f8e12b447",
  "etiqueta": "jueves 27 de agosto, 3:30 p. m., en línea" }
```

Cuatro reglas:

1. **El campo del identificador se llama como su tipo**: `relacion`, `cita`, `servicio`,
   `hueco`. `etiqueta` siempre se llama `etiqueta`.
2. **El modelo razona sobre la etiqueta y devuelve el identificador.** Ningún esquema de
   entrada acepta `etiqueta`; si el modelo la manda, el conjunto exacto de claves ya no
   cuadra y el portal contesta `400` sin tocar la base.
3. **La etiqueta la compone el servidor.** Día de la semana, día, mes en letra, hora local
   en formato de 12 horas con «a. m.» / «p. m.», y modalidad en palabras. Nunca la escribe
   el modelo, nunca lleva el año, nunca pasa de 60 caracteres.
4. **Nunca aparece un identificador sin etiqueta**, ni siquiera dentro de un resultado de
   mutación: el sobre de la sección 6 repite la etiqueta para que el mensaje de cierre se
   redacte desde ahí.

Los cinco tipos están fijados por el `CHECK chk_agent_option_tokens_kind_matrix` de
`public.agent_option_tokens`, y sus vidas por `private.agent_issue_option_handle`
(verificado leyendo el cuerpo):

| Tipo | Entidad | ¿Un solo uso? | Vida máxima hoy | Vida máxima después | Dónde se ve |
|---|---|---|---|---|---|
| `relationship` | `whatsapp_link` | sí | 10 min | 30 min | expediente ambiguo |
| `appointment` | `appointment` | no | 15 min | 30 min | expediente, resultados, primera pantalla del formulario al mover |
| `service` | `service` | no | 15 min | 30 min | primera pantalla del formulario al agendar |
| `slot` | `service_slot` | sí | 5 min | 30 min | las horas de un día, dentro del formulario |
| `flow` | `turn` | sí | 15 min | 30 min | el `flow_token` del formulario |

Cuatro consecuencias que hay que escribir:

**Un identificador muere con su turno, y el turno es un mensaje.** No es el reloj lo que
los mata: `private.agent_resolve_option_token` compara `token.turn_id` contra el turno que
pregunta y devuelve `TOKEN_CONTEXT_INVALID` si no son el mismo (verificado leyendo el
cuerpo). Como cada mensaje entrante abre su propio turno, **todo identificador que el
modelo vio en el mensaje anterior está muerto en éste**, aunque hayan pasado diez segundos.
No es un caso raro: es la conversación normal —«¿la cancelo?», «sí»— partida en dos turnos.
De ahí la regla de abrir el expediente en cada mensaje. Con el tope único de 30 minutos el
reloj deja de rematar por su cuenta: un identificador vive exactamente lo que vive su turno,
así que quien lo mata es siempre el cambio de turno. Sigue existiendo el error
`HANDLE_VENCIDO` de la sección 7 —para el turno muy largo que llegó a su media hora— con la
misma remediación: vuelve a abrir el expediente.

**Los topes de vigencia por tipo hay que borrarlos y dejar uno solo: 30 minutos.** Es una
línea del `CASE` de `private.agent_issue_option_handle`, y arregla dos caminos que hoy
terminan en silencio.

El primero es el `flow_token`. Verificado leyendo los dos cuerpos:
`private.agent_resolve_option_token` sólo marca `consumed_at` cuando quien llama pide
consumir (`p_consume = true`), así que un identificador de un solo uso se puede resolver
todas las veces que haga falta —un formulario de varias pantallas no lo gasta—. Pero
`token.expires_at <= now()` devuelve `TOKEN_EXPIRED`, y **renovar el turno no renueva el
identificador**. Una paciente que abre el calendario de 60 días, lo pasea, escoge día, mira
horarios y confirma —quince minutos son poco para eso— llega a la última pantalla con el
`flow_token` muerto: la cita no se crea y ella cierra el formulario creyendo que sí.

El segundo es el identificador de horario, y es peor porque no hace falta distraerse: con
cinco minutos, una paciente que compara el martes con el jueves y vuelve al martes se
encuentra con que el emisor **no puede reemitir**. `agent_option_tokens` tiene
`UNIQUE (turn_id, kind, stable_key)`, y cuando el emisor encuentra una fila con esa misma
clave ya vencida devuelve `TOKEN_EXPIRED_STABLE_KEY` en vez de acuñar otra: la pantalla se
queda vacía **para siempre en ese turno**. Con treinta minutos el caso casi desaparece, y lo
que queda lo cierra un uuid por consulta al final de la clave estable (§4).

Treinta minutos es exactamente el techo al que el portero renueva el turno
(`LEAST(sesión.expires_at, now() + 30 min)`), y el emisor ya rechaza cualquier vencimiento
que pase del turno o de la sesión: con ese tope, **el turno es el único reloj** y sobra el
resto de la tabla. Pasado eso el formulario cierra con un mensaje, nunca en silencio.

**Hoy no se puede emitir ni un solo identificador.** `private.agent_token_key_registry`
existe en la base desplegada y está **vacía** (0 renglones), y
`public.agent_register_option_token_key` **no existe**: vive en
`20260824200000_agent_cerrojos_tanda0.sql`, sin desplegar. `agent_issue_option_handle`
rechaza con `OPTION_KEY_INVALID` cuando no encuentra la llave. Registrar una llave con
`can_issue = true` y un `verify_until` que cubra la vida más larga (30 min con el arreglo
de arriba) es el primer paso de cualquier despliegue. La tabla del registro es del rol del
agente —él es su dueño, verificado en `pg_class`—, así que registrar la llave no necesita
ningún `GRANT`: sólo la función que falta.

**Y hay un segundo emisor que también hay que tocar.** El helper por el que pasan todas las
familias, `private.agent_issue_listed_option` (en `20260825000000`, sin desplegar), lleva su
propia matriz de tipos y **excluye `flow` a propósito**, con el comentario escrito de que
«el día que se despierten, se agrega aquí la fila». Un tipo que no está en esa matriz sale
con `INVALID_AGENT_OPTION_ISSUE_INPUT`. Sin esa fila —`('flow','turn',true,'30 minutes')`—
nadie puede acuñar el `flow_token` y el formulario no se abre nunca.

---

## 4. Qué operación hay detrás de cada herramienta

Estados: **desplegada** (está en producción), **escrita** (está en el árbol de trabajo sin
desplegar), **por escribir**.

| Herramienta · operación | Operación del portero | Superficie | Ruta del portal | Función de base | Estado |
|---|---|---|---|---|---|
| `abrir_expediente` | `open_case` | `agent_node` | `/tools/expediente` (hoy `/tools/capabilities`) | `public.agent_open_case_from_workflow(text, text, uuid)` | **por escribir** (reaprovecha piezas de `agent_get_capabilities`, desplegada, y de cinco funciones escritas) |
| `gestionar_cita` · `confirmar` | `confirm_appointment` | `agent_node` | `/tools/appointments/confirm` | `public.agent_confirm_appointment_from_workflow(text, text, uuid)` | **escrita** (`20260825003000`) |
| `gestionar_cita` · `cancelar` | `cancel_appointment` | `agent_node` | `/tools/appointments/cancel` | `public.agent_cancel_appointment_from_workflow(text, text, uuid)` | **escrita**, hay que añadirle el cerrojo del dinero y arreglar el aviso |
| `gestionar_cita` · `cambiar_modalidad` | `switch_appointment_modality` | `agent_node` | `/tools/appointments/modality` | `public.agent_switch_appointment_modality_from_workflow(text, text, uuid, text)` | **escrita**, hay que arreglar el aviso |
| `abrir_formulario` · `agendar` y `reprogramar` | `open_booking_flow` | `workflow_internal` | `/workflow/open-booking-flow` | `public.agent_open_booking_flow_from_workflow(text, text, text)` | ruta declarada sin manejador; función **por escribir**. Una sola operación para los dos modos: el tercer argumento es `agendar` o `reprogramar` y viaja después dentro de la clave estable del `flow_token` |
| `registrar_comprobante` | `attach_payment_proof` | `agent_node` (hoy `media_adapter`) | `/tools/payments/proof` (hoy `/media/payment-proof`) | `public.agent_attach_payment_proof_from_workflow(text, text, uuid, text, text, integer, text)` | **escrita** (`20260825002000`); cambia de superficie, de ruta y de dónde saca el archivo (§1.4) |
| `enviar_resena` | `submit_review` | `agent_node` | `/tools/reviews/submit` | `public.agent_submit_review_from_workflow(text, text, integer, text)` | **escrita** (`20260825004000`) |
| `responder_con_texto_fijo` | `send_fixed_response` | `workflow_internal` | `/workflow/fixed-response` | `public.agent_send_fixed_response_from_workflow(text, text, text)` | ruta declarada sin manejador; función **por escribir** |
| — (cierre del turno) | `complete_inbound` | `workflow_internal` | `/workflow/complete` | `public.agent_complete_inbound_from_workflow(text, text, text)` | **desplegada** |
| — (estacionar el turno) | — | — | `/workflow/waiting` | `public.agent_mark_inbound_waiting(text, text)` | **desplegada** |

Y la superficie del formulario, que no es una herramienta del modelo. Son **dos rutas**, y
sólo la segunda es operación del portero:

| Ruta del portal | Qué sirve | Operación del portero | Función de base | Estado |
|---|---|---|---|---|
| `/flow/cuando` | Las dos vueltas de lectura de la pantalla 2: pintar el calendario y pintar las horas de un día. Misma forma de salida en las dos | **ninguna**: no reclama, no gasta ordinal (§5.2, cambio 7) | `public.agent_flow_pantalla_cuando(text, uuid, date)` | **por escribir**, con la consulta barata de días de `04-formulario.md` §5.3 y `public._get_internal_availability_core` para las horas del día tocado |
| `/flow/confirmar` | La última pantalla: crea o mueve la cita | `flow_create_appointment` **o** `flow_reschedule_appointment` según el modo del `flow_token` | `public.agent_create_appointment_from_workflow` / `public.agent_reschedule_appointment_from_workflow` | funciones **escritas** (`20260825003000`), les cambia la superficie y la forma de llegar la identidad; ruta **por escribir** |

**No hay ruta para la primera pantalla**, y es a propósito: `ELEGIR` viaja llena dentro del
mensaje que abre el formulario, así que se pinta sin ir al endpoint —que es lo que Meta
recomienda— y nos ahorra un viaje de diez segundos por gestión.

**Ninguna ruta `/flow/*` tiene manejador**, ni siquiera en el árbol de trabajo:
`DOMAIN_ROUTES` en `handler.ts` no tiene una sola entrada que empiece por `/flow/`
(verificado). Toda la superficie del formulario está por conectar.

**Dos correcciones a `flow_create_appointment`, y una a `flow_reschedule_appointment`.**
La función escrita hace `v_born_confirmed := v_starts_at <= v_now + interval '48 hours'`
(línea 452 de `20260825003000`) y crea el pago sin `proof_requested_at` (línea 478).
Las dos cosas juntas dejan a la paciente de prepago sin que nadie le pida el dinero:
`cron_appointment_confirmation_26h` filtra `a.confirmed_at IS NULL`, así que una cita
nacida confirmada **nunca** recibe la petición de comprobante; y mientras el pago no tenga
`proof_requested_at`, `registrar_comprobante` contesta `COMPROBANTE_NO_PEDIDO` aunque ella
mande la foto por su cuenta. Los dos arreglos:

1. **La cita nace sin confirmar, siempre.** Se borra `v_born_confirmed` y sus cinco
   apariciones; `confirmed_at` y `confirmation_source` quedan en `NULL` e `is_editable` en
   `true`. Es la recomendación de §9, punto 4, y además es lo que ya hace la función de
   reprogramar, que crea la cita nueva sin confirmar a propósito.
2. **Con `charge_timing = 'before'`, el pago nace con la petición sellada**:
   `proof_requested_at = now()` y `method = 'transfer'` —los dos juntos, que es lo que
   exige `chk_payment_proof_requested_transfer`—, más su renglón en `payment_events`. Así
   el expediente enseña el pago como `esperando_comprobante` desde el primer momento y el
   agente le puede decir cuánto y a dónde en la misma sesión abierta, sin encolar nada. No
   duplica al cron: su `UPDATE` lleva `AND proof_requested_at IS NULL` (verificado leyendo
   el cuerpo), y si para entonces ya llegó el comprobante manda
   `appointment_confirmation_request` en vez del de prepago. Es la decisión 5 del dueño
   —«en prepago la cita nace sin confirmar y se pide el comprobante por chat»— puesta en
   el único lugar donde se puede cumplir.

Y en reprogramar: **la cita nueva conserva la modalidad de la vieja.** El formulario no
ofrece cambiarla. Si no, mover una cita se convierte en la puerta de atrás del cambio de
modalidad, que tiene su propio permiso y su propio plazo por profesional (`test` no permite
pasar a presencial). Cambiar de modalidad es `gestionar_cita`, y sólo eso.

**El mapa completo del gateway, que es el que hay que dejar escrito**, porque hoy hay dos
listas que no coinciden —la declarada (`FUTURE_AGENT_ROUTES`) y la que sí atiende
(`DOMAIN_ROUTES`)— y una ruta borrada de una sola de las dos se queda respondiendo. **Las
dos listas quedan iguales, con doce rutas más `/health`**, y con eso
`403 OPERATION_NOT_ENABLED` deja de ser una respuesta normal del sistema:

| # | Ruta | Superficie |
|---|---|---|
| 1 | `/tools/expediente` (hoy `/tools/capabilities`) | `agent_node` |
| 2 | `/tools/appointments/confirm` | `agent_node` |
| 3 | `/tools/appointments/cancel` | `agent_node` |
| 4 | `/tools/appointments/modality` | `agent_node` |
| 5 | `/tools/payments/proof` (hoy `/media/payment-proof`) | `agent_node` |
| 6 | `/tools/reviews/submit` | `agent_node` |
| 7 | `/workflow/open-booking-flow` | `workflow_internal` |
| 8 | `/workflow/fixed-response` | `workflow_internal` |
| 9 | `/workflow/complete` | `workflow_internal` |
| 10 | `/workflow/waiting` | — (no reclama) |
| 11 | `/flow/cuando` | — (autoriza el `flow_token`) |
| 12 | `/flow/confirmar` | `flow_data_exchange` |

Se borran de las dos listas las dieciséis que sobran: `/tools/relationship/select`,
`/tools/services`, `/tools/booking/eligibility`, `/tools/availability`,
`/tools/appointments/upcoming`, `/tools/appointments/next`, `/tools/location`,
`/tools/payments/pending`, `/tools/payments/status`, `/tools/profile/share`,
`/tools/appointments/create`, `/tools/appointments/reschedule`,
`/tools/appointments/cancel-then-book`, `/tools/resources/resume`, `/flow/services` y
`/flow/eligibility`. Tres de ellas —`create`, `reschedule` y `resources/resume`— están
**también en `DOMAIN_ROUTES` del árbol de trabajo**, así que hay que quitarlas de los dos
lugares. Entran dos nombres nuevos, `/flow/cuando` y `/flow/confirmar`, y hay dos cambios de
nombre: `/tools/capabilities` → `/tools/expediente` y `/media/payment-proof` →
`/tools/payments/proof`, que es lo que queda de la superficie `media_adapter`. **De
veintiocho rutas declaradas se pasa a doce.**

El renombre de `/tools/capabilities` es el único cambio de este documento que toca código ya
desplegado en Kapso: `agenda-psi-complete-inbound` lleva esa ruta escrita dentro, así que se
despliega junto con el resto.

**Nota sobre el estado desplegado del portal:** el portal en producción sólo contesta
`/tools/capabilities`, `/workflow/waiting`, `/workflow/complete` y `/health`; el resto
devuelve `403 OPERATION_NOT_ENABLED`. Las veintiuna rutas con manejador que se leen en
`handler.ts` —dieciocho en `DOMAIN_ROUTES` más esas tres de control— son del árbol de
trabajo, no de producción.

---

## 5. Los cambios al portero

`private.agent_claim_tool_call(p_turn_id, p_execution_id, p_surface, p_operation,
p_tool_call_key, p_input_sha256, p_is_mutation)` es lo mejor hecho del sistema y se queda
casi entero. Lo que cambia es el catálogo que autoriza y la maquinaria que sobra.

### 5.1 El conjunto de operaciones autorizadas, completo

Pasa de 26 operaciones en 4 superficies a **11 en 3**, de las cuales siete mutan.

La última columna dice si la operación pasa **sin inquilino vivo**: sin relación resuelta y
también con la paciente dada de baja. Las dos cosas son la misma lista, y hoy no lo son
(cambio 10).

| Superficie | Operación | ¿Mutación? | Estado del turno exigido | Sin inquilino vivo |
|---|---|---|---|---|
| `agent_node` | `open_case` | no | `active` | **sí** |
| `agent_node` | `confirm_appointment` | sí | `active` | no |
| `agent_node` | `cancel_appointment` | sí | `active` | no |
| `agent_node` | `switch_appointment_modality` | sí | `active` | no |
| `agent_node` | `attach_payment_proof` | sí | `active` | no |
| `agent_node` | `submit_review` | sí | `active` | no |
| `workflow_internal` | `open_booking_flow` | no | `active` | no |
| `workflow_internal` | `send_fixed_response` | no | `active` | **sí** |
| `workflow_internal` | `complete_inbound` | no | `completing`, ordinal 9 fijo | (limpieza: no aplica) |
| `flow_data_exchange` | `flow_create_appointment` | sí | `active` **o** `waiting_external` | no |
| `flow_data_exchange` | `flow_reschedule_appointment` | sí | `active` **o** `waiting_external` | no |

Desaparece la superficie `media_adapter` completa, y desaparecen del portero las lecturas
del formulario: no son operaciones suyas, las autoriza el `flow_token` (cambio 7).

**Por qué las dos mutaciones del formulario valen en los dos estados.** El caso concreto:
ella recibe el formulario, escribe «ahorita lo veo», y ese mensaje reanuda el turno y lo
devuelve a `active`; diez minutos después abre el formulario, elige, toca «Confirmar cita»
—y la reserva saldría con `TOOL_NOT_ALLOWED` **después** de que ella ya terminó, sin que
nadie se entere. Quien autoriza al formulario no es el estado del turno sino el `flow_token`,
que está atado a ese turno y a esa paciente. Es el mismo doble estado que `get_availability`
ya tiene hoy en el portero desplegado, y por la misma razón.

### 5.2 Los diez cambios exactos

**Cambio 1 — sustituir los tres bloques `ELSIF` de autorización** por el catálogo de 5.1.
Es el cuerpo del cambio: once nombres en vez de veintiséis, y un estado de turno exigido por
cada uno.

**Cambio 2 — `attach_payment_proof` se muda a `agent_node`. (Nudo 2.)** Hoy sólo se
autoriza en `media_adapter`, pero quien decide que una imagen es un comprobante es el
agente, que vive en `agent_node`. La superficie tenía que coincidir con quien llama, no con
de dónde salió el archivo. Los cuatro campos del archivo los pone el portal, que los saca
del renglón del mensaje entrante (§1.4); el modelo sólo dice de qué cita es.
`media_adapter` se borra del `CASE`, y con ella la superficie entera.

```sql
-- antes
ELSIF p_surface = 'media_adapter'
      AND p_operation = 'attach_payment_proof' THEN
  v_metadata_allowed := p_is_mutation;
  v_state_allowed := v_turn.status = 'active';

-- después: la operación entra en la lista de mutaciones de agent_node
```

**Cambio 3 — se borra `cancel_then_open_booking_flow` y con ella toda la saga.
(Nudo 4.)** Es la única ruta del sistema por la que el dinero de una paciente se evapora:
cancela y crea una cita nueva con un pago limpio; el dinero viejo no viaja. Contradice la
regla del dueño. Al quitarla se van, sin dejar hueco:

- la variable `v_is_replacement_create` y sus cuatro apariciones;
- la reserva del ordinal 8;
- el guardia `v_turn.tool_call_count > 3`;
- el `mutation_limit` variable (queda fijo en 1) y el `UPDATE` que lo subía a 2;
- los estados `cancel_claimed` y `awaiting_replacement_create` de `saga_state`;
- en `private.agent_finalize_tool_call`, las tres ramas de `saga_state` y la que
  regresaba `mutation_limit` a 1.

```sql
ALTER TABLE public.agent_turns DROP CONSTRAINT agent_turns_saga_state_check;
ALTER TABLE public.agent_turns ADD CONSTRAINT agent_turns_saga_state_check
  CHECK (saga_state IN ('normal', 'unknown_blocked'));
ALTER TABLE public.agent_turns DROP CONSTRAINT agent_turns_mutation_limit_check;
ALTER TABLE public.agent_turns ADD CONSTRAINT agent_turns_mutation_limit_check
  CHECK (mutation_limit = 1);
```

Es gratis: en toda la historia de producción hay 6 turnos y ninguno salió de `normal`.

**Cambio 4 — `flow_create_appointment` deja de exigir la maniobra. (Nudo 1.)** Hoy se
rechaza con `MUTATION_BLOCKED` si no se cumple `saga_state = 'awaiting_replacement_create'
AND mutation_limit = 2 AND committed_mutation_count = 1`. O sea: el formulario sólo podía
crear una cita dentro de la maniobra de cancelar-y-volver-a-agendar, y **agendar normal se
rechazaba**. Como agendar por formulario es la decisión del dueño, queda como mutación
ordinaria en `waiting_external`, sujeta nada más al cerrojo de una mutación por turno.

**Cambio 5 — se añade `flow_reschedule_appointment`. (Nudo 3.)** No existía: mover una
cita sólo vivía como operación conversacional, y mover por formulario es la otra decisión
del dueño. Mutación en `active` o `waiting_external`, mismo tratamiento que la de crear, y
servida por la misma ruta `/flow/confirmar`, que elige una u otra por el modo que trae la
clave estable del `flow_token`.

**Y hay que desactivar una bomba en la otra función.** `private.agent_finalize_tool_call`
—que el borrador de este cambio no nombraba— pone `saga_state = 'awaiting_replacement_create'`
en **todo** `flow_create_appointment` que se finalice, sin condición. Con el turno ahí, el
portero rechaza con `MUTATION_BLOCKED` cualquier mutación posterior y el presupuesto baja de
8 a 7. O sea: si sólo se toca el reclamo, agendar por formulario deja de rechazarse **y a
cambio envenena el resto del turno**. Las dos funciones se migran juntas o no se migra
ninguna.

**Cambio 6 — la lista sin inquilino vivo queda en dos.** Hoy pasan `get_capabilities`,
`select_relationship` y `send_fixed_response`. Las dos primeras dejan de existir y su
trabajo lo hace `open_case`, que es justamente la herramienta que resuelve la relación.

```sql
v_tenantless_allowed :=
  (p_surface = 'agent_node' AND p_operation = 'open_case')
  OR (p_surface = 'workflow_internal' AND p_operation = 'send_fixed_response');
```

**Cambio 7 — las lecturas del formulario salen del libro mayor del turno.** Es el cambio
menos obvio y el más necesario. El presupuesto de ocho llamadas existe para acotar cuánto
puede divagar el modelo. El formulario no divaga: lo maneja la paciente con el dedo, y cada
día que toca en el calendario cuesta una consulta de disponibilidad. Con todo en la misma
cuenta, una gestión de agendar se queda sin presupuesto después de tres o cuatro días
tocados.

Y no es que quede apretado: **es que no cabe**. `agent_tool_calls` tiene
`CHECK (ordinal entre 1 y 8)` con `UNIQUE (turn_id, ordinal)`, y `agent_turns` tiene
`CHECK (tool_call_count <= 8)`. La novena lectura no da `TOOL_BUDGET_EXCEEDED`: revienta la
restricción.

Las lecturas del formulario dejan de ser operaciones del portero. La ruta `/flow/cuando`
—que sirve las dos vueltas de lectura, pintar el calendario y pintar las horas de un día—
se autoriza resolviendo el `flow_token` con `p_consume => false`, que verifica exactamente
lo mismo que verificaría el portero: que sesión y turno coincidan en conversación, teléfono,
número destino, paciente y profesional; que ninguno haya vencido; que la llave que lo firmó
siga viva; que el turno esté en `active` o `waiting_external`; y que el vínculo de WhatsApp
siga con la paciente `active`. Es la misma autorización sin el contador, y **no toca
`tool_call_count` ni escribe en `public.agent_tool_calls`**. El precedente ya está desplegado:
`agent_mark_inbound_waiting` tampoco pasa por el portero. Las mutaciones del formulario sí
siguen reclamando, porque son las que necesitan `command_id`, réplica exacta y el cerrojo de
una mutación por turno. Meta ya limita el formulario a 100 peticiones por minuto: no hace
falta un segundo tope.

**Lo que sí tiene que seguir haciendo: renovar el turno.** El portero renueva
`expires_at` a `LEAST(sesión.expires_at, now() + 30 min)` en cada reclamo, y ésa es la
única cosa que mantiene vivo el turno. Si las lecturas del formulario dejan de reclamar y
además dejan de renovar, una paciente que se toma media hora escogiendo día —que es lo
normal en un calendario de 60 días— llega a la pantalla final con el turno vencido: la
creación se rechaza, el formulario se cierra, y ella se queda sin cita creyendo que la
tiene. **La ruta `/flow/cuando` renueva el turno exactamente igual que el reclamo**, en la
misma transacción en que resuelve el token. Es la única escritura que hace.

**Y renovar el turno no basta por sí solo:** el `flow_token` tiene su propia caducidad y
renovar el turno no la mueve. Por eso subir la vida del identificador `flow` de 15 a 30
minutos (§3) es parte de este cambio, no una nota aparte: sin las dos cosas, el mismo
camino termina igual de mudo.

**Cambio 8 — el presupuesto se queda en 8 y el ordinal 9 no se toca.** Con el expediente
juntando ocho lecturas en una, la cuenta completa de una gestión es ésta, y es la misma en
las seis partes del diseño:

| Gestión | Ordinales que gasta |
|---|---|
| Agendar o mover | 1 `open_case`, 2 `open_booking_flow`, 3 la mutación del formulario |
| Confirmar, cancelar, cambiar modalidad, mandar comprobante, dejar reseña | 1 `open_case`, 2 la mutación |
| Consultar algo (cuándo es, dónde es, cuánto debo) | 1 `open_case` |
| Algo que no se resuelve con datos | 1 `open_case`, 2 `send_fixed_response` |

Nada llega a cuatro, y el cierre no cuenta: vive en el ordinal 9, fuera del presupuesto.
Ocho ya sobra, y bajarlo obligaría a migrar `agent_turns_tool_call_count_check` y
`agent_tool_calls_check` a cambio de nada. La cláusula de cierre —ordinal 9 fijo, fuera del
presupuesto, que nunca lo refresca— es correcta y se queda íntegra. **Ojo al editar:** el
ordinal 9 vive en un retorno temprano que nunca toca `tool_call_count`, y no puede tocarlo,
porque `agent_turns_tool_call_count_check` topa la columna en 8. Quien «simplifique»
fusionando las dos rutas revienta el cierre.

**Y un margen que conviene ver escrito:** un rechazo del portero —`TOOL_NOT_ALLOWED`,
`MUTATION_BLOCKED`, `MUTATION_PENDING`, `TENANT_*`— sale por `RETURN` **antes** del guardia
del presupuesto y antes del `INSERT`, así que **no gasta ordinal** (verificado leyendo el
cuerpo). Lo que sí gasta ordinal es un intento que llegó a reservar y terminó rechazado por
la función de dominio, como el hueco que se ocupó a media elección: ahí el ordinal ya se
asignó, aunque la mutación no se gaste.

**Cambio 9 — el `CHECK` de asignación de `command_id` pierde su rama muerta.** Hoy dice
`(is_mutation OR (surface = 'agent_node' AND operation = 'select_relationship')) =
(command_id IS NOT NULL)`. Sin `select_relationship`, sobra la mitad:

```sql
ALTER TABLE public.agent_tool_calls DROP CONSTRAINT chk_agent_tool_calls_command_allocation;
ALTER TABLE public.agent_tool_calls ADD CONSTRAINT chk_agent_tool_calls_command_allocation
  CHECK (is_mutation = (command_id IS NOT NULL));
```

**Cambio 10 — una paciente dada de baja hoy no recibe absolutamente nada, y hay que
arreglarlo aquí.** Es el hueco más grave del portero y sólo se ve leyendo el orden de sus
comprobaciones. `v_tenantless_allowed` gobierna la rama donde el turno **no** tiene
paciente. Cuando sí la tiene —el vínculo de WhatsApp existe, pero
`patients.patient_status` ya no es `'active'`— el flujo entra por el `ELSE`, y ahí
`TENANT_NOT_ACTIVE` se devuelve **sin mirar `v_tenantless_allowed`** (verificado leyendo el
cuerpo). Resultado: a una paciente dada de baja se le rechaza `open_case`, así que el
modelo ni siquiera se entera de que está dada de baja; y se le rechaza
`send_fixed_response`, que es justamente la remediación que la tabla de errores manda usar.
La remediación es la operación que acaba de ser rechazada por el mismo error. Ella escribe
y no recibe nada. Una línea lo cierra:

```sql
-- antes
IF NOT v_has_active_tenant THEN
-- después
IF NOT v_has_active_tenant AND NOT v_tenantless_allowed THEN
```

Con eso, `open_case` puede contestar `relacion: "dada_de_baja"` y el texto fijo puede
salir. Ninguna otra operación cambia: las cinco mutaciones y las cuatro del formulario
siguen exigiendo inquilino vivo, porque ninguna está en `v_tenantless_allowed`.

### 5.3 Lo que no se toca

Los cerrojos verificados que se quedan exactamente como están: la réplica exacta por clave
y forma, `CONTEXT_MISMATCH` con sus seis comparaciones, `TENANT_NOT_ACTIVE` con el vínculo
de WhatsApp y la paciente `active`, `MUTATION_PENDING`, el `command_id` nuevo por mutación,
la renovación del turno a `LEAST(sesión.expires_at, now() + 30 min)`, y el orden global de
candados: turno, luego reclamo.

---

## 6. Forma de los resultados

El falso éxito —el agente presenta la gestión como resuelta y no lo está— es entre el 44%
y el 52% de todos los fallos en agentes de este tipo, y los modelos con razonamiento
extendido son **peores**, no mejores: racionalizan en vez de verificar. Los jueces
automáticos no lo detectan. Lo único medido que funciona es verificación de estado
independiente y señales de finalización en **campos estructurados, no en lenguaje natural**.

De ahí el sobre único de mutación:

```json
{
  "ok": true,
  "turn_disposition": "close",
  "result": {
    "operacion": "cancelar",
    "aplicado": true,
    "cita": "9f1c4d2a-6b70-4c11-9a3e-0d5f8e12b447",
    "etiqueta": "jueves 27 de agosto, 3:30 p. m., en línea",
    "antes":   { "estado": "programada", "modalidad": "en_linea", "empieza": "2026-08-27T15:30:00-06:00" },
    "despues": { "estado": "cancelada",  "modalidad": "en_linea", "empieza": "2026-08-27T15:30:00-06:00" },
    "dinero":  { "se_movio": false, "estado": "sin_cobro", "importe": null },
    "mensaje_de_cierre": "Listo, cancelé tu cita del jueves 27 de agosto a las 3:30 de la tarde. Araceli ya recibió el aviso.",
    "acciones_disponibles": ["abrir_formulario", "responder_con_texto_fijo"]
  }
}
```

Cinco decisiones, cada una contra un mecanismo de fallo conocido:

1. **`aplicado` es booleano, no prosa.** La señal de finalización es un campo estructurado.
   El lenguaje de aserción confiado —«ya quedó», «perfecto, listo»— es independiente del
   resultado en los modelos medidos, así que no se le pregunta al modelo si quedó.
2. **`antes` y `despues` son el estado leído después de escribir**, no lo que la función
   pensaba hacer. Es la verificación de estado independiente que baja el falso éxito unas
   quince veces.
3. **`mensaje_de_cierre` lo redacta el servidor** con lo que de verdad escribió, y el
   prompt obliga a mandarlo palabra por palabra con `send_notification_to_user`. Es la
   aplicación directa de «el cierre se redacta desde lo que devolvió el servidor, no desde
   lo que el modelo cree». Ojo con la letra chica: la instrucción de mandarlo tal cual va
   en el **prompt**, no dentro del resultado, porque las instrucciones metidas en un
   `tool_result` pueden ignorarse o marcarse como posible inyección.
4. **`dinero` siempre viaja**, aunque no haya dinero. `se_movio` en falso con `estado:
   "sin_cobro"` es información; la ausencia del campo es una invitación a inventar.
   `estado` es enum cerrado: `sin_cobro`, `esperando_comprobante`, `comprobante_en_revision`,
   `viajo_con_la_cita`, `decision_del_profesional`.
5. **`acciones_disponibles` cierra el círculo**: después de una mutación el turno se cierra
   y el modelo sabe con qué se queda, sin tener que volver a abrir el expediente.

**Las lecturas** (`abrir_expediente`, `responder_con_texto_fijo`) devuelven
`turn_disposition: "keep_open"` y no llevan `antes`/`despues`. **`abrir_formulario`**
devuelve `"wait"`.

### 6.1 El aviso a la profesional, con las claves exactas

Cada mutación escribe un renglón en `public.notifications`. La app arma el texto de la
tarjeta con esas claves y, si falta cualquiera, cae a `('Notificación', 'Tienes una
notificación nueva.')` — el aviso llega en blanco y el push también, porque sale del mismo
contenido. Las funciones escritas del agente hoy ponen `surface`, `command_id`,
`starts_at`, `modality`, `old_starts_at`, `old_modality` y `change_policy_result`: **cero
claves del contrato**, y nunca el nombre de la paciente.

Éstas son las claves reales, leídas de los renglones de producción:

| `type` | Claves exactas del `payload` |
|---|---|
| `appointment_created_by_patient` | `patient_first_name`, `patient_last_name`, `appointment_starts_at`, `appointment_ends_at`, `appointment_modality` |
| `appointment_confirmed` | las mismas cinco |
| `appointment_cancelled_by_patient` | las mismas cinco |
| `appointment_rescheduled_by_patient` | `patient_first_name`, `patient_last_name`, `previous_starts_at`, `previous_modality`, `new_starts_at`, `new_modality` |
| `modality_changed_by_patient` | `patient_first_name`, `patient_last_name`, `appointment_starts_at`, `previous_modality`, `new_modality` |
| `payment_proof_received` | `patient_first_name`, `patient_last_name`, `appointment_starts_at` |

`payment_proof_received` **no lleva el monto**, y los renglones reales lo confirman: la
función escrita del agente se lo mete y el contrato lo prohíbe. Se quita.

El renglón se escribe **en la misma transacción que la mutación**: si no se pudo escribir,
la mutación no ocurrió. Por eso el sobre no lleva ningún campo que diga «sí se avisó»: sería
un booleano que siempre vale `true` y que el modelo tendría que leer para nada. Que el
sobre haya llegado con `aplicado: true` ya significa que la profesional está enterada.

**Y una corrección a la función escrita de reprogramar.** Copia `proof_requested_at` al
pago nuevo sólo `WHEN v_old_has_proof`, es decir, sólo si ya había archivo (línea 464 de
`20260825003000`). Una petición de comprobante sellada y todavía sin archivo se pierde al
mover la cita, y ningún cron la vuelve a abrir: la paciente movió su cita de prepago y nadie
le vuelve a pedir el pago nunca. **La petición viaja siempre**, con archivo o sin él, junto
con `method = 'transfer'`, que es lo que exige `chk_payment_proof_requested_transfer`.

### 6.2 Lo que el agente no encola

Las funciones escritas encolan `appointment_cancelled` y `appointment_rescheduled` al mismo
teléfono con el que el agente acaba de conversar. En la app de la profesional ese aviso
tiene sentido porque la paciente no estaba presente; por el agente es eco puro. **No se
encola nada en `public.whatsapp_outbox`.** El agente contesta dentro de la sesión abierta;
la cola sólo produce plantillas y sólo la usan los cron.

---

## 7. Errores como remediación

Un error que sólo dice qué falló deja al modelo inventando la salida. Un error que dice qué
se puede hacer ahora la encuentra. La diferencia está medida: guía a nivel de flujo contra
guarda por acción sube el Pass⁴ de 0.42 a 0.62, y en el dominio más estructurado las
mutaciones pasan de 0.042 a 0.549. Además bloquea el 91.3% de los intentos de persuasión.
Y la forma importa: los agentes responden mejor a «por favor identifica primero al usuario»
que a «identificación requerida». Enrutamiento positivo, no prohibición desnuda.

**El formato, único para todos:**

```json
{
  "ok": false,
  "error": {
    "codigo": "CITA_CON_DINERO_ADENTRO",
    "que_paso": "Esa cita ya tiene el pago de la paciente adentro.",
    "que_puedes_hacer": "Ofrécele moverla a otro día con `abrir_formulario`: el pago se va con la cita.",
    "acciones_disponibles": ["abrir_formulario", "responder_con_texto_fijo"]
  }
}
```

`que_paso` es para el modelo, no para la paciente: nunca se manda tal cual. `que_puedes_hacer`
nombra la herramienta que sí sirve. `acciones_disponibles` repite el subconjunto vivo, que es
lo que combate el sesgo posicional cuando el modelo tiene que reelegir.

### 7.1 La tabla completa

**Rechazos de control** (los diez que ya devuelve `private.agent_claim_tool_call`, que llegan
al portal como `409` y ya vienen redactados):

| Código del portero | Código para el modelo | `que_paso` | `que_puedes_hacer` |
|---|---|---|---|
| `TURN_NOT_FOUND`, `CLAIM_MISMATCH`, `TURN_EXPIRED`, `CONTEXT_MISMATCH` | `GESTION_CADUCADA` | Esta gestión ya no está viva. | Despídete con `responder_con_texto_fijo` y pídele que te escriba de nuevo. |
| `TOOL_NOT_ALLOWED` | `HERRAMIENTA_NO_DISPONIBLE` | Esa herramienta no aplica en este momento de la gestión. | Escoge una de `acciones_disponibles`. |
| `TENANT_REQUIRED` | `FALTA_ABRIR_EXPEDIENTE` | Todavía no sabemos con qué profesional escribe. | Llama primero a `abrir_expediente`. |
| `TENANT_NOT_ACTIVE` | `PACIENTE_DADA_DE_BAJA` | Esta paciente ya no está activa con su profesional. | Responde con `responder_con_texto_fijo` y el código `dada_de_baja`. (Esa salida sólo existe con el cambio 10 de §5.2; hoy el portero rechaza también el texto fijo y ella no recibe nada.) |
| `MUTATION_PENDING`, `MUTATION_BLOCKED` | `YA_HICISTE_UN_CAMBIO` | En esta gestión ya se aplicó un cambio. | Cuéntale lo que quedó y cierra; si quiere otra cosa, que te escriba de nuevo. |
| `TOOL_BUDGET_EXCEEDED` | `SE_ACABARON_LOS_PASOS` | Ya se usaron todos los pasos de esta gestión. | Cierra con lo que tengas; no vuelvas a intentar. |

**Rechazos de dominio** (los devuelve la función de base con `ok: false`):

| Código | `que_paso` | `que_puedes_hacer` |
|---|---|---|
| `CITA_CON_DINERO_ADENTRO` | Esa cita ya tiene el pago de la paciente adentro. | Ofrécele moverla con `abrir_formulario`: el pago se va con la cita. |
| `MODALIDAD_NO_PERMITIDA` | Esta profesional no permite ese cambio de modalidad. | Dile que ese cambio lo tiene que ver con ella directamente. |
| `MODALIDAD_SIN_TIEMPO` | Ya pasó el plazo para cambiar la modalidad de esa cita. | Dile con cuántas horas de anticipación se cambia y que, si lo necesita hoy, lo vea con su profesional. |
| `CITA_YA_CONFIRMADA` | Esa cita ya estaba confirmada. | Confírmaselo con la hora y cierra. |
| `CITA_YA_NO_ESTA_PROGRAMADA` | Esa cita ya no está programada. | Vuelve a abrir el expediente y cuéntale lo que sí tiene. |
| `AGENDA_CERRADA` | Esta profesional todavía no abre su agenda a las pacientes. | Responde con `responder_con_texto_fijo` y el código `agenda_cerrada`. |
| `SIN_ARCHIVO` | En este mensaje no vino ninguna imagen ni PDF. | Pídele que mande el comprobante como foto o archivo en un solo mensaje, sin escribir nada más. |
| `COMPROBANTE_NO_PEDIDO` | Ese pago no tiene ninguna petición de comprobante abierta. | Dile que su profesional todavía no le pide comprobante para esa cita. |
| `YA_HAY_COMPROBANTE` | Ese pago ya tiene un comprobante recibido. | Dile que ya lo tenemos y que su profesional lo va a revisar. |
| `RESENA_YA_ENVIADA` | Esta paciente ya dejó su reseña. | Agradécele y cierra. |
| `RESENA_SIN_SESION_ATENDIDA` | Todavía no tiene ninguna sesión atendida. | Dile que podrá dejarla después de su primera sesión. |
| `HANDLE_VENCIDO` | Ese identificador es de un mensaje anterior, o ya venció. | Vuelve a llamar `abrir_expediente` y usa los identificadores que traiga. |
| `NO_PUDIMOS_SABER` | No sabemos si el cambio se aplicó. | No le digas que quedó ni que falló. Dile que lo estamos verificando y que su profesional le confirma. |

Trece, no quince: se cayeron tres y entró uno. El que entra es `SIN_ARCHIVO`, y es el caso
más frecuente de `registrar_comprobante`: la paciente anuncia el comprobante antes de
mandarlo, el modelo llama a la herramienta, y sin este error se queda inventando qué decir
(§1.4). Los tres que se caen, y por qué, porque dos eran errores que ninguna herramienta de
este catálogo puede producir:

- **`SIN_HUECOS`** suponía que el modelo consulta disponibilidad. No la consulta: los huecos
  viven dentro del formulario. Un rango sin espacio libre es una pantalla del formulario,
  no un error de herramienta.
- **`SIN_LUGAR_A_DONDE_IR`** suponía una operación que pregunta dónde es la cita. Tampoco
  existe: la dirección y la liga viajan en el expediente, en `profesional.donde`, y cuando
  las dos van en `null` el modelo ya lo sabe antes de abrir la boca. Que ninguna de las
  cinco profesionales tenga las dos a la vez hace esto frecuente, no raro.
- **`CAMBIO_TARDIO`** rechazaba cancelar fuera de plazo, y eso es lo que se corrige abajo.

**Cancelar tarde sí se puede, y es importante que se pueda.** Con dinero adentro no se
cancela nunca —eso lo cubre `CITA_CON_DINERO_ADENTRO`—, pero sin dinero adentro y fuera de
plazo, rechazar la cancelación deja el peor de los caminos: la paciente avisó que no puede
ir, nadie registró nada, la cita sigue en pie, y la profesional se entera el día de la cita
cuando no llega. Cancelar tarde escribe `change_policy_result = 'late'` y
`late_change_decision = 'pending'`, que es el único circuito de cobro por aviso tardío que
funciona de punta a punta: la profesional recibe el aviso `appointment_cancelled_by_patient`
y resuelve con **[Cobrar]** o **[No cobrar]**, que son `credit_appointment_payment` y
`waive_appointment_payment`. El mensaje de cierre se lo dice a ella tal cual: la cita quedó
cancelada y su profesional decidirá si le cobra la sesión.

Con una advertencia que hay que dejar por escrito: esas decisiones son difíciles de
encontrar en la app de la profesional —no salen en Cobros, no ponen punto en el calendario,
y el aviso se borra solo a las 24 h; hay que tocar la tarjeta—. Hoy no importa porque nadie
las produce. El agente va a producirlas todas. Arreglar esa pantalla es de otra ronda, pero
es la consecuencia directa de esta decisión y no se puede fingir que no existe.

`NO_PUDIMOS_SABER` es el único caso donde el modelo tiene prohibido afirmar cualquier cosa.
Corresponde al `503 SERVICE_UNAVAILABLE` del portal y al `outcome = 'unknown'` del portero,
que además deja el turno en `unknown_blocked` y bloquea cualquier otra mutación. Es
deliberadamente fallar cerrado: nadie afirma que un efecto ocurrió.

---

## 8. Permisos

`agenda_psi_agent_owner` tiene `BYPASSRLS`, así que **RLS no interviene**: lo único que
importa son los `GRANT`. Y `postgres` es miembro de `agenda_psi_agent_owner`, no al revés,
así que el rol del agente no hereda nada de nadie.

### 8.1 Lo que ya tiene, verificado hoy

| Tabla | Privilegio |
|---|---|
| `public.agent_sessions` | SELECT, INSERT, UPDATE |
| `public.whatsapp_inbound_messages` | SELECT, INSERT, UPDATE |
| `public.appointments` | SELECT |
| `public.patients` | SELECT |
| `public.payments` | SELECT |
| `public.professionals` | SELECT |
| `public.professional_profiles` | SELECT |
| `public.services` | SELECT |
| `public.whatsapp_links` | SELECT, UPDATE (`last_inbound_at`) |

Funciones: `EXECUTE` sobre las cuatro privadas del portero y las nueve públicas de control.
**Ninguna función de dominio, ninguna tabla de escritura.**

Las cuatro tablas del propio agente —`public.agent_turns`, `public.agent_tool_calls`,
`public.agent_option_tokens` y `private.agent_token_key_registry`— no aparecen en la lista
y no es un hueco: **son suyas**, el rol es su dueño (verificado en `pg_class`), y un dueño
no necesita permiso. `agent_sessions`, en cambio, es de `postgres`, y por eso sí lleva sus
tres `GRANT` explícitos.

### 8.2 Lo que falta en producción, tabla por tabla y columna por columna

Casi todo esto ya está escrito en `20260825000000_agent_dominio_fundamento.sql`; lo que no
está es **aplicado**. La lista sirve para dos cosas: saber qué se rompe si esa migración no
va primera, y tener en un solo lugar el permiso mínimo, sin lo que sobra de §8.3.

```sql
-- Lecturas que faltan. La primera es bloqueante: sin ella el expediente
-- no puede calcular ni un solo plazo.
GRANT SELECT ON public.professional_appointment_policies TO agenda_psi_agent_owner;
GRANT SELECT ON public.payment_proofs                    TO agenda_psi_agent_owner;
GRANT SELECT ON public.patient_services                  TO agenda_psi_agent_owner;
GRANT SELECT ON public.reviews                           TO agenda_psi_agent_owner;

-- Las dos que necesita private.assert_appointment_slot_available, que es
-- SECURITY INVOKER y corre con los privilegios de quien la llama.
GRANT SELECT ON public.blocked_slots            TO agenda_psi_agent_owner;
GRANT SELECT ON public.professional_connections TO agenda_psi_agent_owner;

-- Citas: crear (formulario) y cambiar de estado o modalidad.
-- `series_id` va en la lista porque las dos funciones escritas lo nombran en su
-- INSERT, aunque siempre con NULL: Postgres cobra el permiso por columna nombrada,
-- no por valor escrito, y sin él las dos revientan.
-- `confirmed_at` y `confirmation_source` NO van: la cita del agente nunca nace
-- confirmada (03-dinero.md §1.1), así que ninguna función las escribe al crear.
-- Siguen en el GRANT UPDATE, que es lo que necesitan confirmar y cancelar. La
-- regla deja de depender de la disciplina de quien escriba la funcion y pasa a
-- ser un permiso que no existe.
GRANT INSERT (professional_id, patient_id, service_id, status, modality,
              starts_at, ends_at, agreed_price, origin,
              series_id, rescheduled_from_appointment_id,
              is_editable)
  ON public.appointments TO agenda_psi_agent_owner;
GRANT UPDATE (status, modality, is_editable, confirmed_at, confirmation_source,
              cancel_reschedule_actor, cancelled_rescheduled_at,
              change_policy_result, updated_at)
  ON public.appointments TO agenda_psi_agent_owner;

-- Pagos: se crea uno por cita nueva y se traslada al reprogramar.
-- El agente nunca escribe 'credited' ni resuelve una decisión tardía.
GRANT INSERT (appointment_id, professional_id, amount, status, method,
              charge_reason, charge_timing, waive_reason, proof_requested_at,
              resolved_at, late_change_decision)
  ON public.payments TO agenda_psi_agent_owner;
GRANT UPDATE (status, method, charge_reason, waive_reason, proof_requested_at,
              resolved_at, late_change_decision, updated_at)
  ON public.payments TO agenda_psi_agent_owner;

-- Comprobantes: sólo insertar. Uno por pago, para siempre.
GRANT INSERT (payment_id, storage_object_path, mime_type, size_bytes, checksum)
  ON public.payment_proofs TO agenda_psi_agent_owner;

-- Bitácora del pago: la necesita el traslado al reprogramar.
GRANT INSERT (payment_id, event_type, from_status, to_status, actor,
              command_id, metadata)
  ON public.payment_events TO agenda_psi_agent_owner;

-- El aviso a la profesional, con las claves de §6.1.
GRANT INSERT (type, appointment_id, patient_id, professional_id, payload)
  ON public.notifications TO agenda_psi_agent_owner;

-- Reseñas. El UPDATE no sobra: `uq_review_patient_professional` es única por par,
-- y `request_patient_review` deja explícito que «una fila sin submitted_at es una
-- reseña empezada y nunca enviada». Si esa fila existe, insertar revienta y hay
-- que actualizarla.
GRANT INSERT (professional_id, patient_id, patient_first_name, rating,
              comment, submitted_at)
  ON public.reviews TO agenda_psi_agent_owner;
GRANT UPDATE (patient_first_name, rating, comment, submitted_at, updated_at)
  ON public.reviews TO agenda_psi_agent_owner;

-- La única envoltura delgada real sobre el dominio existente.
GRANT EXECUTE ON FUNCTION public._get_internal_availability_core(
  uuid, uuid, date, public.modality, uuid, boolean, boolean
) TO agenda_psi_agent_owner;
GRANT EXECUTE ON FUNCTION private.assert_appointment_slot_available(
  uuid, timestamptz, timestamptz, public.modality, uuid
) TO agenda_psi_agent_owner;
```

### 8.3 Lo que se quita de las migraciones escritas, y por qué

| Permiso escrito | Por qué se quita |
|---|---|
| `INSERT` en `public.whatsapp_outbox` | El agente contesta dentro de la sesión abierta. Encolar `appointment_cancelled` al mismo teléfono con el que acaba de conversar es eco. La cola es de los cron. |
| `INSERT` en `public.jobs` | No hay consumidor de `public.jobs` en la base desplegada, y `tg_jobs_solo_recursos_bi` descarta en silencio todo lo que no sea de recursos. Los `INSERT INTO jobs` de `create_appointment` y `reschedule_appointment` ya son código muerto. |
| `SELECT`/`UPDATE` en `resource_delivery_batches` y `resource_assignments` | La operación de recursos se sale del catálogo. |
| `INSERT` en `public.command_log` | El libro mayor del agente es `public.agent_tool_calls`, con su clave de llamada y su `command_id`. Dos bitácoras para lo mismo es complejidad de más. |
| `UPDATE (updated_at)` en `public.professionals` | Servía para tomar un candado de fila sobre la profesional y serializar la agenda. No hace falta: `excl_appointments_no_overlap` —`EXCLUDE USING gist (professional_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE status = 'scheduled'`— ya impide el traslape, y la comprobación amable la da `assert_appointment_slot_available`. |
| `EXECUTE` en `get_marketplace_profile`, `get_marketplace_reviews`, `search_marketplace_profiles` | El marketplace no entra en esta ronda. |
| `GRANT CREATE ON SCHEMA public/private` | Se otorga al principio de cada migración y se revoca al final. Está bien, pero debe quedar revocado en las siete, sin excepción. |

### 8.4 El agujero que hay que nombrar

`20260825003000_agent_citas_mutaciones.sql` —la migración de **todas** las mutaciones de
cita: crear, confirmar, cancelar, reprogramar, cambiar modalidad— **no tiene un solo
`GRANT` de tabla**. Sólo otorga `CREATE ON SCHEMA public` y el `EXECUTE` de sus cinco
funciones. Si se despliega sola, las cinco funciones existen, el portal las llama, y todas
revientan con permiso denegado sobre `public.appointments` en la primera escritura. Depende
por completo de que `20260825000000_agent_dominio_fundamento.sql` se haya aplicado antes.
Los permisos de escritura de citas y pagos deben vivir en esa misma migración, junto a las
funciones que los usan.

---

## 9. Decisiones que quedan para el dueño

Cada una lleva la recomendación y el supuesto con el que sigue este diseño, para que nada
se bloquee.

1. **El cargo por cambio tardío al reprogramar.** «El dinero siempre viaja» y «la
   profesional decide si te cobra por avisar tarde» son incompatibles en el esquema actual:
   con traslado, el pago viejo queda `waived/carried_forward`, que está fuera de los tres
   resolutores, y el pago nuevo vive en una cita `scheduled`. **Recomendación: mover es
   siempre gratis** (cero código). *Supuesto de este diseño:* `CAMBIO_TARDIO` sólo aplica a
   cancelar; reprogramar tarde se permite y no abre decisión.

2. **Trasladar el pago a la próxima cita.** No se puede armar con lo que hay: reprogramar
   siempre crea cita nueva, `UNIQUE(appointment_id)` obliga a fusionar dos pagos, y hay cero
   series activas. **Recomendación: no construirlo**; mover ya traslada el dinero completo.
   *Supuesto:* no hay herramienta ni operación para esto.

3. **Quién cancela la cita de prepago que nunca recibió su comprobante.** Con la corrección
   de §4, la petición se sella al crear la cita, así que a partir de ahí hay un reloj
   corriendo: la decisión 5 del dueño dice que a las 24 h un trabajo cancela. **Ese trabajo
   no existe:** `cron_prepay_proof_request` es un cascarón retirado que sólo levanta un
   `RAISE WARNING` y no está en `cron.job`. Sin él, una cita de Araceli sin comprobante se
   queda programada para siempre y su hueco no vuelve a la agenda. **Recomendación:
   escribirlo en la misma ronda que el catálogo**, con la regla de **24 h fijas desde que se
   pidió el comprobante, y nunca sobre una cita que ya empezó**. «Lo que ocurra primero»
   cancelaría una sesión en curso, porque entre `starts_at` y `ends_at` la cita sigue
   `scheduled`; el trabajo completo, con esa corrección, está en `03-dinero.md` §5.3.
   *Supuesto de este diseño:* se escribe. Ninguna herramienta de este documento depende de
   él, pero sin él el prepago queda a medias.

4. **¿La cita del formulario nace confirmada alguna vez?** En prepago ya está decidido que
   no. Con cobro después, la ventana de 48 h choca con la anticipación de 48 h de tres
   profesionales: en la práctica ninguna nacería confirmada. Y no es sólo estética: el cron
   de las 26 h filtra `confirmed_at IS NULL`, así que una cita nacida confirmada se queda
   sin petición de comprobante para siempre. **Recomendación: que nunca nazca confirmada**,
   y por eso §4 ya lo escribe como corrección a la función. *Supuesto:* `confirmada: false`
   siempre, y `confirmar` aparece en las acciones de toda cita recién creada.

5. **Tope de citas sin confirmar por paciente.** No existe ninguno. *Supuesto:* el
   expediente enseña hasta 3 citas y no hay tope de creación.

6. **Quién publica las reseñas.** Ninguna función desplegada escribe `moderation_status`;
   la moderación es manual, fuera de SQL. Todo lo que capture el agente queda `pending` e
   invisible, y en producción hay cero reseñas. **Recomendación: dejar `enviar_resena`
   fuera de esta ronda** y quedarse con cinco herramientas; prometerle a una paciente una
   reseña que nadie puede publicar es exactamente el falso éxito contra el que está armado
   todo el resto del documento. *Supuesto de este diseño:* entra, porque la decisión es del
   dueño y el catálogo está escrito con seis. Si sale, se borran §1.5, la operación
   `submit_review`, la ruta `/tools/reviews/submit`, los dos errores de reseña y el campo
   `resena` del expediente.

7. **El marketplace en esta ronda.** *Supuesto:* fuera. La capacidad no se enciende en el
   expediente, y a una paciente dada de baja se le contesta con el texto fijo
   `dada_de_baja`. Falta decidir qué dice ese texto.

8. **Los seis textos fijos, más el de crisis.** El enum está cerrado; la redacción no. Es lo
   único de este documento que necesita la pluma del dueño antes de escribirse. Seis los
   compone el servidor; el de crisis va literal en el prompt (§1.6).

9. **El interruptor real de «mis pacientes pueden agendar solas».** Hoy es un pestillo de
   una sola dirección: `save_weekly_schedules` lo pone en `true` y nada lo apaga. El
   expediente lo lee y lo respeta, pero si una profesional quiere cerrar su agenda no puede.
   Material de otra ronda; aquí sólo queda nombrado.

10. **¿Recibe el agente comprobantes en esta ronda?** La herramienta está diseñada, la
    función de base está escrita, y falta la pieza que trae el archivo: hoy nada baja la
    imagen de WhatsApp ni la guarda (§1.4). Es trabajo nuevo en `kapso_inbound_webhook` y
    cuatro columnas en `whatsapp_inbound_messages`. **Recomendación: que entre.** Es el
    único momento en que una paciente manda dinero por este canal, y sin ella el prepago de
    Araceli sigue dependiendo de que alguien mire el chat a mano. *Supuesto:* entra.

11. **Cancelar tarde produce decisiones de cobro que la profesional casi no puede
    encontrar** (§7.1). No bloquea nada de este catálogo y no se arregla aquí, pero el
    primer mes de agente va a llenar esa pantalla. **Recomendación: mirarlo en la ronda
    siguiente, antes de encender el agente para las cinco profesionales.**

12. **Que dos herramientas de Kapso puedan compartir una función.** Todo el catálogo
    descansa en eso (§0, regla 4), porque seis funciones nuevas no caben en el plan. La
    documentación de Kapso no lo dice ni lo prohíbe, y el runtime desplegado ya multiplexa
    dos caminos en un archivo. **Se comprueba antes de escribir código, no después:** basta
    declarar dos herramientas apuntando a la misma función y abrir la ejecución. Si
    resultara que no se puede, la salida es subir de plan; el catálogo no cambia.
