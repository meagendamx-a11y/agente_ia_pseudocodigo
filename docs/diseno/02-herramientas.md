# Catálogo de herramientas y contratos del agente conversacional

Corte: **2026-08-26, 17:10 hora de Ciudad de México.** Reescrito entero y **reverificado**, línea
por línea, contra la base desplegada y contra el árbol de trabajo.

> **Aviso de corte.** Entre las 15:48 y las 16:05 de hoy aparecieron cinco migraciones nuevas
> (`20260826000000` … `20260826004000`) y se tocaron dos de las anteriores. Varias cosas que el
> primer corte de este documento daba por «rotas» o «por escribir» **ya están escritas**, y otras
> están escritas **con otro nombre o a medias**. La §3.4, la columna de estado de la §5 y la §9
> se releyeron enteras y se corrigieron. Nada de eso está desplegado: en producción siguen
> existiendo trece funciones del agente y las trece son de plomería.

**La autoridad es `docs/anterior/01-decisiones-del-ensayo.md`.** Cuando este documento y aquél
no coincidan, gana aquél. Lo demás que se da por cierto: `docs/hallazgos-auditoria-agente.md`,
`docs/reglas/10-reglas-finales.md` y sus cuatro partes, `docs/diseno/textos-fijos.md` y
`docs/anterior/04-puente.md`. Lo que **no** es fuente: `docs/diseno/00`, `01`, `03`, `04`, `05` y
`06` en todo lo que toca agendar y reprogramar.

Todo dato técnico de aquí se verificó hoy contra la base desplegada (Supabase
`ssyzfeadyrczlzjbvxyl`) leyendo cuerpos de función, restricciones, privilegios y datos de
producción, o contra el código del árbol de trabajo. Cada afirmación viene con su evidencia.

**El cambio grande: no hay formulario.** Agendar y reprogramar se conversan. Con el formulario
se van la herramienta `abrir_formulario`, la superficie `flow_data_exchange` entera, el tipo de
identificador `flow`, las cuatro rutas `/flow/*` y la maniobra de cancelar-y-reagendar. Y entran
las dos cosas que el formulario hacía por dentro: **buscar horarios** y **reservar**.

---

## 0. Cinco reglas de forma que valen para las seis herramientas

1. **Esquema discriminado plano.** Un campo `operacion` con enum cerrado más un objeto `datos`.
   Nunca un `oneOf` de muchas ramas: el parser de Kapso es Ruby y es sensible a la forma. `datos`
   es de un solo nivel — escalares y arreglos de escalares, **nunca otro objeto ni un arreglo de
   objetos**. El modo de fallo del esquema anidado es que el modelo manda JSON mal formado, Kapso
   lo rechaza antes de invocar, la función nunca corre y el modelo abandona la herramienta.

2. **Ninguna clave es opcional.** Las que no aplican a esa operación van presentes y en `null`
   (o en `[]` si son listas). El portal compara el **conjunto exacto** de claves: en
   `parseExactBody` de `supabase/functions/agent_tool_gateway/handler.ts` se ordenan las claves
   esperadas y las recibidas y se comparan posición por posición; una de más o una de menos es
   `400 BAD_REQUEST` y no llega a la base.

3. **El modelo nunca escribe la correlación.** `provider_message_id` y `kapso_execution_id` son
   las dos claves que el portal exige siempre (`CORRELATION_KEYS`), las inyecta el Worker de
   Kapso desde `execution_context`, y **no viven en el `input_schema`**. Son lo que ata la
   llamada a un turno sellado.

4. **El agente nunca calcula fechas ni plazos.** Ni «el próximo sábado es el 29», ni restas de
   horas. Todo lo que sea una fecha, una hora o un plazo llega ya resuelto y ya escrito por el
   servidor, y el modelo lo copia. Ésta es la regla 1 del dueño y gobierna el diseño de cada
   salida de este documento.

5. **Lo que ve el modelo va en español; los identificadores internos del portero se quedan en
   inglés** porque ya están desplegados (`complete_inbound` sigue siendo `complete_inbound`). El
   portal traduce en una línea. El caso concreto es la modalidad: el modelo escribe `en_linea` o
   `presencial`, y el portal los convierte a los dos únicos valores del tipo `public.modality`,
   `online` e `in_person` (verificado en `pg_enum`).

Y una nota de plataforma que sigue vigente: **las seis herramientas cuelgan de una sola función
de Kapso.** Una función de Kapso es un script de Cloudflare Worker y el plan Free admite cinco.
Al retirarse el formulario se liberan `agenda-psi-flow-agendar` y `agenda-psi-flow-reprogramar`,
así que quedan **dos de cinco ocupadas** —`agenda-psi-complete-inbound` y
`agenda-psi-mark-inbound-waiting`— y tres libres. La función lee el conjunto exacto de claves que
le llegó y sabe de qué herramienta viene: los seis conjuntos son distintos, y los que comparten
`operacion` + `datos` los desempata el valor de `operacion`, porque los enums son disjuntos.
**Con tres Workers libres, multiplexar no es una comodidad: es la única forma de que quepan
seis herramientas** (§10, punto 8).

---

## 1. Las seis herramientas

### 1.1 `abrir_expediente`

**Descripción tal como la ve el modelo:**

> Trae de golpe todo lo de esta conversación: quién te escribe, con qué profesional, lo que esa
> profesional cobra y permite, sus servicios con su precio, sus citas próximas con lo que se
> puede hacer en cada una, lo que tiene pendiente de pagar y cuál fue el último aviso que le
> mandamos. Llámala una sola vez, al principio de la gestión, y siempre sin identificador. No la
> vuelvas a llamar para refrescar después de un cambio: la respuesta del cambio ya te dice cómo
> quedó todo. Sólo hay dos motivos para llamarla una segunda vez: que el expediente te haya dicho
> que la relación es ambigua —mándale entonces la frase `elige_profesional` que él mismo trae, y
> cuando te conteste llámalo otra vez con el identificador de la profesional que eligió—, o que
> otra herramienta te haya rechazado un identificador por vencido.

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
      "description": "Siempre null, salvo cuando en este mismo turno recibiste un expediente con relacion: \"ambigua\": entonces se llena con un identificador de esa lista `relaciones`."
    }
  }
}
```

**Salida:** el expediente completo. Su forma exacta está en la sección 2.

**Una vez por turno, no una vez por mensaje.** Ésta es la corrección más importante respecto del
diseño anterior y viene de `04-puente.md` §4.2. Conversando, la gestión entera vive en **un solo
turno abierto**: el agente contesta y estaciona el turno en `waiting_external`, y el mensaje
siguiente lo reanuda. Los identificadores siguen vivos porque quien los mata es el cambio de
turno, no el reloj (`private.agent_resolve_option_token` compara `token.turn_id` contra el turno
que pregunta y devuelve `TOKEN_CONTEXT_INVALID` si no coinciden, verificado leyendo el cuerpo).
Abrir el expediente en cada mensaje gastaría cinco expedientes en una gestión de cinco mensajes.

**Y este `waiting_external` no es el del formulario.** El que se retira es el estado en el que el
turno esperaba a que la paciente terminara una pantalla de WhatsApp, con las cuatro operaciones de
`flow_data_exchange` autorizadas justamente ahí. Éste es otra cosa: el turno duerme mientras ella
piensa qué contestar por texto, no reclama nada mientras duerme, y lo despierta el mensaje
siguiente. La pieza que lo estaciona —`/workflow/waiting` y `public.agent_mark_inbound_waiting`—
ya está desplegada y no reclama ordinal. **Que el estado se llame igual es lo único que comparten.**

**Un tope que conviene ver escrito:** `uq_agent_turns_one_open_conversation` es única sobre
`kapso_conversation_id` mientras el estado sea `admitted`, `active`, `waiting_external` o
`completing` (verificado en `pg_indexes`). O sea: **una conversación no puede tener dos turnos
abiertos**. Es exactamente lo que hace falta para que «la gestión entera vive en un turno» sea una
garantía del esquema y no una costumbre.

---

### 1.2 `buscar_horarios`

Es la operación nueva y la más importante del catálogo. Su contrato completo está en la
**sección 3**; aquí va sólo lo que ve el modelo.

**Descripción tal como la ve el modelo:**

> Busca horarios concretos que cumplan lo que ella pidió y te devuelve hasta cinco, con el
> mensaje ya escrito para mandárselo. Pásale tal cual lo que dijo —los días de la semana que le
> quedan, las fechas concretas que nombró, la hora o la parte del día—, sin traducir nada y sin
> calcular ninguna fecha. Úsala con `para_agendar` cuando quiere una cita nueva, después de que
> haya escogido servicio y modalidad, y con `para_mover` cuando quiere cambiar de día una cita
> que ya tiene: ahí no le preguntes servicio ni modalidad, vienen de la cita. No propongas tú
> ningún horario ni le ofrezcas una lista de días: esta herramienta ya te da días y horas juntos.
> Si te contesta que ninguno le sirve, vuelve a llamarla con los filtros nuevos.

**Entrada:**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["operacion", "datos"],
  "properties": {
    "operacion": { "type": "string", "enum": ["para_agendar", "para_mover"] },
    "datos": {
      "type": "object",
      "additionalProperties": false,
      "required": ["servicio", "modalidad", "cita",
                   "dias_de_la_semana", "fechas", "hora", "parte_del_dia"],
      "properties": {
        "servicio": {
          "type": ["string", "null"],
          "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
          "description": "El identificador que trajo el expediente en `servicios[].servicio`. Sólo con `para_agendar`; con `para_mover` va null."
        },
        "modalidad": {
          "type": ["string", "null"],
          "enum": ["en_linea", "presencial", null],
          "description": "Sólo con `para_agendar`. Si el servicio admite una sola, ésa. Con `para_mover` va null: la modalidad viene de la cita."
        },
        "cita": {
          "type": ["string", "null"],
          "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
          "description": "La cita que se mueve, de `citas[].cita`. Sólo con `para_mover`; con `para_agendar` va null."
        },
        "dias_de_la_semana": {
          "type": "array", "maxItems": 7,
          "items": { "type": "string",
            "enum": ["lunes","martes","miercoles","jueves","viernes","sabado","domingo"] },
          "description": "Los días que ella nombró. Vacío si no nombró ninguno."
        },
        "fechas": {
          "type": "array", "maxItems": 5,
          "items": { "type": "string", "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" },
          "description": "Sólo fechas que ella dijo con día y mes, copiadas del calendario que trae el expediente. Nunca una fecha que hayas calculado tú. Vacío si no dijo ninguna."
        },
        "hora": {
          "type": ["string", "null"],
          "pattern": "^([01][0-9]|2[0-3]):[0-5][0-9]$",
          "description": "La hora exacta que pidió, en 24 horas. null si no dio una hora exacta."
        },
        "parte_del_dia": {
          "type": ["string", "null"],
          "enum": ["manana", "mediodia", "tarde", "noche", null],
          "description": "Sólo cuando dijo algo vago como «en la tarde». Nunca junto con `hora`."
        }
      }
    }
  }
}
```

**Salida:** la sección 3.2.

---

### 1.3 `reservar`

**Descripción tal como la ve el modelo:**

> Aparta el horario que ella escogió: `agendar` crea la cita nueva, `reprogramar` mueve una que
> ya tiene. Úsala en cuanto escoja uno de los horarios que `buscar_horarios` acaba de darte, sin
> preguntarle «¿confirmo?»: escoger ya es confirmar. El horario y la modalidad viajan dentro del
> identificador del hueco, así que no los repitas. Si te contesta que ese horario ya se ocupó,
> vuelve a buscar y ofrécele otro. Y si la cita que va a mover tiene el aviso de que ya no
> alcanza el tiempo mínimo, avísale antes de llamar a esta herramienta, no después.

**Entrada:**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["operacion", "datos"],
  "properties": {
    "operacion": { "type": "string", "enum": ["agendar", "reprogramar"] },
    "datos": {
      "type": "object",
      "additionalProperties": false,
      "required": ["hueco", "cita"],
      "properties": {
        "hueco": {
          "type": "string",
          "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
          "description": "El identificador del horario que ella escogió, de `opciones[].hueco`."
        },
        "cita": {
          "type": ["string", "null"],
          "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
          "description": "La cita que se mueve. Sólo con `reprogramar`; con `agendar` va null."
        }
      }
    }
  }
}
```

**Ni servicio ni modalidad ni hora viajan en la entrada, y eso está verificado.** El
identificador de hueco lleva todo dentro: `agent_get_availability_from_workflow` acuña cada hueco
con la clave estable `service_id|dia|modalidad|hora_local`, y
`agent_create_appointment_from_workflow(p_provider_message_id, p_kapso_execution_id,
p_slot_handle)` la parte con `split_part` y la comprueba contra el servicio antes de crear
(migración `20260825003000`, líneas 240-256). Consecuencia útil: **el error `MODALITY_REQUIRED`
de la regla R6 no puede ocurrir por esta vía**; la modalidad se decidió al buscar.

**Salida:** el sobre de mutación de la sección 7.

---

### 1.4 `gestionar_cita`

**Descripción tal como la ve el modelo:**

> Cambia una cita que ya existe sin moverle el día: confirmar que sí va, cancelarla, pasarla de
> en línea a presencial o al revés, o pasar su pago a su próxima sesión. Úsala sólo con una cita
> que el expediente haya traído, y sólo con la acción que esa cita traiga en su lista `acciones`:
> si `cancelar` no está ahí es porque esa cita ya tiene el pago de ella adentro y cancelarla se
> lo quemaría. Para cambiarle el día usa `buscar_horarios` y `reservar`. Y si la cita trae el
> aviso de que ya no alcanza el tiempo mínimo, dile lo que va a pasar y espera su respuesta antes
> de llamar.

**Entrada:**

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["operacion", "datos"],
  "properties": {
    "operacion": {
      "type": "string",
      "enum": ["confirmar", "cancelar", "cambiar_modalidad", "pasar_pago"]
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
          "description": "La modalidad a la que pasa. Sólo con `cambiar_modalidad`; en las otras tres va null."
        }
      }
    }
  }
}
```

**`pasar_pago` lleva un solo identificador: el de la cita que se cancela.** El destino no se
señala, lo resuelve el servidor con la regla desplegada de `public.get_next_scheduled_appointment`
—misma paciente, mismo servicio, `scheduled`, posterior, la primera— y es literal «tu próxima
sesión» de la frase del dueño (`14-pasar-pago.md` §3.1). No es una simplificación: con una serie
viva **es la única forma que funciona**, porque la lista de citas próximas se colapsa por serie
(`DISTINCT ON (COALESCE(series_id, id))`, R12) y la segunda ocurrencia no tiene ningún
identificador que señalar.

**Salida:** el sobre de mutación de la sección 7.

---

### 1.5 `registrar_comprobante`

**Descripción tal como la ve el modelo:**

> Guarda el comprobante de pago que la paciente acaba de mandar como imagen o PDF, y le avisa a
> su profesional que ya llegó. Úsala nada más cuando el expediente traiga un cobro con
> `registrar_comprobante` entre sus acciones y el archivo venga en este mismo mensaje. **Confirma
> siempre con ella a qué cita corresponde antes de llamar**, aunque sólo haya un cobro
> esperando: se guarda un solo comprobante por cobro, para siempre, y una foto equivocada queda
> pegada. Nunca le digas que el pago quedó cubierto, aprobado o pagado: su profesional es quien lo
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
      "description": "La cita cuyo cobro trae este comprobante, de `pagos[].cita`."
    }
  }
}
```

Una sola intención, así que no lleva `operacion` ni `datos`: un enum de un valor sólo añade una
decisión que el modelo puede equivocar.

**De dónde sale el archivo.** Los cuatro campos —`storage_object_path`, `mime_type`,
`size_bytes`, `checksum`— no los escribe el modelo. El archivo entra por
`kapso_inbound_webhook`, que es el único componente que ve el mensaje crudo de WhatsApp: ahí se
baja, se guarda en el almacenamiento y se dejan los cuatro campos colgados del renglón de
`public.whatsapp_inbound_messages` de ese mensaje. Cuando el modelo llama, el portal ya tiene el
`provider_message_id` y de ahí saca el archivo.

**Hueco bloqueante, sin cambios respecto de la auditoría:** hoy `kapso_inbound_webhook/handler.ts`
no tiene una sola línea de medios ni de almacenamiento, y `whatsapp_inbound_messages` no tiene
dónde guardar los cuatro campos. Sin esa pieza, `registrar_comprobante` no funciona aunque la
función de base ya esté escrita.

**Y una consecuencia de forma: el archivo pertenece al mensaje, no a la conversación.** Si ella
escribe «ahorita te lo mando» y la imagen llega en el mensaje siguiente, la llamada del primer
mensaje no tiene nada que adjuntar. Ése es el error `SIN_ARCHIVO` de la sección 8.

**Salida:** el sobre de mutación de la sección 7.

---

### 1.6 `enviar_resena`

**Descripción tal como la ve el modelo:**

> Guarda la calificación de 1 a 5 y el comentario que ella quiera dejarle a su profesional. Tú
> nunca pides la reseña: la pide una plantilla que ya se le mandó. Úsala en cuanto tengas la
> calificación con un número; el comentario es opcional y se pregunta **una sola vez**, y si no
> lo da, se guarda sin él. Si mandó sólo el comentario, pregúntale la calificación. No la uses
> para quejas ni para reportar un problema con una cita, y no le digas que ya se publicó: una
> persona la revisa antes.

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

El tope de 1 000 caracteres es el `CHECK` de `public.reviews.comment`. La reseña pertenece al par
paciente–profesional, no a una cita (`uq_review_patient_professional UNIQUE (patient_id,
professional_id)`), así que aquí no viaja ningún identificador.

**La reseña entra en esta ronda porque la autoridad la tiene con flujo y texto de cierre
propios**, y con una corrección respecto del diseño anterior: **se enciende siempre que ella
pueda reseñar**, no sólo cuando no tiene citas ni cobros. La regla vieja la habría apagado
justamente en el caso normal —una paciente con un cobro pendiente que contesta la plantilla de
reseña con cinco estrellas—. Se queda la advertencia: ninguna función desplegada escribe
`moderation_status`, así que lo que capture el agente queda `pending` hasta que una persona lo
publique a mano, y en producción hay **cero reseñas** (verificado). El cierre nunca promete
publicación.

**Salida:** el sobre de mutación de la sección 7, con `estado: "en_revision"`.

---

### 1.7 La séptima herramienta que no existe: los textos fijos viajan en el expediente

Este documento tenía aquí una séptima herramienta, `responder_con_texto_fijo`, con un enum de seis
códigos. **Se retira**, y con ella la operación `send_fixed_response`, la ruta
`/workflow/fixed-response` y la función `agent_send_fixed_response_from_workflow` que nunca se
escribió. Los ocho textos que le tocaban se reparten así:

| Texto | Dónde vive ahora |
|---|---|
| `no_entendi`, `fuera_de_alcance`, `asunto_de_dinero`, `se_acabo_el_espacio` | `frases_fijas` del expediente, siempre presentes |
| `elige_profesional`, `no_te_reconocemos`, `paciente_inactivo` | `frases_fijas` del expediente, sólo el que corresponda al valor de `relacion` |
| `sin_horarios` | `frases_fijas` cuando `agendar.puede` va en falso; y como uno de los seis motivos de `buscar_horarios` cuando la profesional no tiene ni un bloque configurado (§3.3) |
| Crisis | Literal en el prompt |
| `vas_muy_rapido` | El borde de entrada, antes de que el agente exista |

**Cuatro razones, y las dos primeras son mecánicas, no de gusto:**

1. **`se_acabo_el_espacio` no se puede pedir con una llamada.** Es el texto de «se te acabaron las
   llamadas de esta gestión»: el rechazo `TOOL_BUDGET_EXCEEDED` sale *antes* de reservar ordinal,
   y cualquier herramienta que el modelo intente después vuelve a salir por el mismo sitio. Una
   herramienta que sólo se puede usar cuando ya no se puede usar ninguna es una herramienta rota.
2. **Los textos llevan datos de la ficha adentro.** Cinco de los ocho repiten el nombre de pila de
   la profesional, y `no_entendi` nombra sólo lo que esa profesional permite. No pueden vivir en
   el prompt, que es el mismo para todas.
3. **Cuesta una llamada de las doce**, y en el caso más común —«no te entendí»— la gestión entera
   valía una: el expediente. Con la frase dentro del expediente, cuesta cero.
4. **La operación no tenía llamador.** `send_fixed_response` es de la superficie
   `workflow_internal`, o sea de un nodo del workflow. Con tres nodos —Inicio, Agente y el
   Function de cierre— ninguno puede llamarla (`01-arquitectura.md` §8.0).

**Lo que no se pierde es la propiedad que importa: el modelo no redacta.** Sigue escogiendo una
frase de una lista cerrada y mandándola palabra por palabra; lo único que cambia es que la lista
llegó con el expediente en vez de con una llamada aparte. Es el mismo patrón *Action-Selector*, y
sigue siendo inmune a lo que venga escrito en el mensaje entrante.

**El cierre del turno lo decide el prompt, no un campo.** Después de `no_te_reconocemos` y de
`paciente_inactivo` el modelo cierra —no hay conversación que continuar—; después de los otros
seis se queda esperando, porque ella sí puede querer otra cosa. El expediente ya trae la señal:
`relacion` en `sin_relacion` o en `dada_de_baja` es el caso de cerrar, y viene con
`turn_disposition: "close"` en el sobre.

**Traspaso a persona:** no existe como salida del agente. `handoff_to_human` es una herramienta
nativa de Kapso, requerida por defecto a nivel de workflow y sin vía documentada para apagarla, y
el traspaso es un nodo terminal, no una opción dentro del bucle. Se contiene por prompt, y quien
pide hablar con una persona recibe `fuera_de_alcance`, que ya trae el enlace del equipo.

---

### 1.8 Qué se declara y cuándo

Kapso declara las herramientas en el nodo (`flow_agent_function_tools`), no por ejecución: no hay
forma documentada de enseñar un catálogo distinto en cada conversación. Así que **las seis viven
declaradas en el nodo y el subconjunto activo viaja como dato**: el expediente devuelve `puede`,
un objeto de banderas por verbo, y el portero rechaza cualquier otra con un error que vuelve a
nombrar las que sí quedan.

**Es `puede`, y no una segunda lista de nombres de herramienta.** El corte anterior devolvía las
dos cosas —`puedo` con verbos y `herramientas_disponibles` con nombres de herramienta—, que es el
mismo dato escrito dos veces y con dos vocabularios distintos. Una de las dos iba a desincronizarse
con la otra en la primera corrección. Queda una: `puede`, con banderas que el modelo lee para
saber qué ofrecerle a ella. La correspondencia verbo → herramienta la sabe el prompt, y la lista
de abajo es lo que esa correspondencia produce.

**`abrir_expediente` va siempre en la lista, en todos los casos.** Es la corrección de un callejón
sin salida que tenía el primer corte: dos remediaciones de la §8 —`HANDLE_VENCIDO` y
`CITA_YA_NO_ESTA_PROGRAMADA`— mandan al modelo a volver a abrir el expediente, y son la **única**
forma de conseguir identificadores frescos cuando los que tenía murieron. Si el expediente no está
encendido, esas dos remediaciones le devuelven `HERRAMIENTA_NO_DISPONIBLE` y ella se queda sin
respuesta. Apagarlo no ahorraba nada: quien impide llamarlo dos veces por gusto es el prompt y su
propia descripción, y el presupuesto de doce absorbe un segundo expediente sin despeinarse.

| Situación | Herramientas que tienen sentido | Cuántas |
|---|---|---|
| Relación ambigua | `abrir_expediente` (segunda vez, con la relación que escogió) | 1 |
| Teléfono sin ninguna relación | ninguna: se manda la frase y se cierra | 0 |
| Paciente dada de baja | ninguna: se manda la frase y se cierra | 0 |
| La profesional no tiene ni un hueco en el horizonte | `gestionar_cita` si tiene citas | 0–1 |
| Activa, sin citas futuras, sin cobros pendientes | + `buscar_horarios`, `reservar` | 2 |
| …y además con cita futura | + `gestionar_cita` | 3 |
| …y además con un cobro esperando comprobante | + `registrar_comprobante` | 4 |
| …y además puede reseñar | + `enviar_resena` | 5 |

`abrir_expediente` va aparte de la cuenta: es la que abre todas las gestiones, y las tres primeras
filas ya la gastaron.

`reservar` se enciende junto a `buscar_horarios` y no después: quien la gobierna es el
identificador de hueco, que el modelo no tiene hasta que busca.

En el caso más cargado están vivas las seis. La precisión de selección de un modelo empieza a
caerse entre diez y quince herramientas, así que seis está holgado, y el margen que sobra es el
que absorbe el día que haga falta una séptima.

**Y de paso se corrige un desajuste heredado.** `agent_get_capabilities` —que se retira entera—
enciende `submit_review` para toda paciente activa: son **17**. La regla real de la reseña
—activa, con al menos una cita `attended`, y sin reseña enviada— sólo admite **11** (verificado
hoy contra la base), así que el modelo ofrecía algo que se le iba a negar. El expediente usa la
regla real.

---

### 1.9 Lo que se quedó fuera, y por qué

| Se quita | Razón |
|---|---|
| `abrir_formulario` | No hay formulario. Agendar y mover se conversan. |
| `get_capabilities`, `select_relationship`, `list_upcoming_appointments`, `get_next_appointment`, `get_pending_payments`, `get_appointment_payment_status`, `get_location`, `get_professional_share_profile`, `list_services`, `get_booking_eligibility` | Diez lecturas que el expediente trae de una sola vez. Diez descripciones que el modelo tenía que discriminar y diez llamadas contra el presupuesto. |
| `get_availability` de un día suelto | La sustituye `buscar_horarios`, que recibe filtros y recorre los días candidatos por dentro. Ya hay una función de base escrita para eso, `agent_search_availability_from_workflow`; la vieja se borra en vez de reaprovecharse (§3.4). |
| `cancel_then_open_booking_flow` y toda la maquinaria de saga | Es la única ruta del sistema por la que el dinero de una paciente se evapora: cancela y crea una cita nueva con un pago limpio. Contradice la regla del dueño, y con el cerrojo del dinero más `pasar_pago` no tiene para qué nacer. |
| `resume_resource_delivery` | No hay consumidor de `public.jobs` en la base desplegada: hay 14 trabajos encolados y **los 14 en `pending`**. Prometer un material que nadie entrega es el falso éxito contra el que está armado el resto del diseño. |
| `list_marketplace_professionals` | Capacidad encendida sin ninguna operación detrás. Se apaga hasta que el marketplace entre a una ronda. |
| Compartir el perfil público | La autoridad no lo menciona en ninguna consulta. Se retira también del expediente, que es donde vivía. |
| Las cuatro operaciones de `flow_data_exchange` y el `flow_token` | Se van con el formulario. |

---

## 2. El expediente de apertura

Es la herramienta que se llama siempre y la que decide todo lo demás. Su trabajo es que el modelo
no tenga que calcular nada: ni restar horas, ni comparar plazos, ni adivinar si una cita se puede
cancelar, ni saber qué día es el próximo martes.

### 2.1 Forma exacta

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["ahora", "zona", "relacion", "relaciones", "paciente", "profesional",
               "agendar", "servicios", "citas", "pagos", "ultima_plantilla", "resena",
               "puede", "frases_fijas"],
  "properties": {
    "ahora": { "type": "string",
      "description": "Fecha y hora local del consultorio, ISO-8601 con desfase." },
    "zona": { "type": "string",
      "description": "Zona horaria del consultorio. Nunca la escoge el modelo." },
    "relacion": { "type": "string",
      "enum": ["paciente", "ambigua", "sin_relacion", "dada_de_baja"] },

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
      "required": ["nombre", "anticipacion_minima_horas", "aviso_de_cambio_horas",
                   "cobro", "cambio_de_modalidad", "donde", "datos_de_pago"],
      "properties": {
        "nombre": { "type": "string", "maxLength": 40,
          "description": "Nombre de pila. Nunca «ella» ni «él»: hay profesionales hombres." },
        "anticipacion_minima_horas": { "type": "integer" },
        "aviso_de_cambio_horas": { "type": "integer" },
        "cobro": { "type": "string", "enum": ["antes", "despues"] },
        "cambio_de_modalidad": {
          "type": "object", "additionalProperties": false,
          "required": ["a_en_linea", "a_presencial", "aviso_horas"],
          "properties": {
            "a_en_linea":   { "type": "boolean" },
            "a_presencial": { "type": "boolean" },
            "aviso_horas":  { "type": "integer" }
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
        "datos_de_pago": {
          "type": ["string", "null"], "maxLength": 160,
          "description": "Banco, titular y CLABE ya redactados en una frase. null cuando la profesional no los llenó: entonces el cierre de prepago la manda a pedírselos a ella."
        }
      }
    },

    "agendar": {
      "type": "object", "additionalProperties": false,
      "required": ["puede", "primer_dia", "ultimo_dia"],
      "properties": {
        "puede": { "type": "boolean" },
        "primer_dia": { "type": ["string", "null"], "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
          "description": "El primer día en que ya alcanza la anticipación mínima: ahora + el margen de esa ficha, redondeado al día. Aritmética pura, nunca una lectura de agenda. null sólo cuando `puede` va en falso." },
        "ultimo_dia": { "type": ["string", "null"], "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
          "description": "Hoy + 30 días, en la zona del consultorio. Es el horizonte del dueño, y es el mismo tope que aplica `buscar_horarios` por dentro (`v_today_local + v_horizon_days`)." }
      }
    },

    "servicios": {
      "type": "array", "maxItems": 5,
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["servicio", "etiqueta", "precio", "modalidad", "frases"],
        "properties": {
          "servicio":  { "type": "string" },
          "etiqueta":  { "type": "string", "maxLength": 80 },
          "precio":    { "type": "string" },
          "modalidad": { "type": "string", "enum": ["en_linea", "presencial", "ambas"] },
          "frases": {
            "type": "object", "additionalProperties": false,
            "required": ["antes_de_agendar"],
            "properties": {
              "antes_de_agendar": { "type": ["string", "null"], "maxLength": 240,
                "description": "El aviso del paso 2 de agendar, ya redactado: la recurrencia de ese servicio, o la próxima cita que ya tiene de él, con la pregunta de si de verdad quiere otra. null cuando no hay nada que avisar y el paso se salta." }
            }
          }
        }
      }
    },

    "citas": {
      "type": "array", "maxItems": 3,
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["cita", "etiqueta", "confirmada", "dinero_adentro",
                     "cambio_a_tiempo", "acciones", "frases"],
        "properties": {
          "cita":     { "type": "string" },
          "etiqueta": { "type": "string", "maxLength": 60 },
          "confirmada":      { "type": "boolean" },
          "dinero_adentro":  { "type": "boolean" },
          "cambio_a_tiempo": { "type": "boolean" },
          "acciones": {
            "type": "array", "maxItems": 5,
            "items": { "type": "string",
              "enum": ["confirmar", "cancelar", "reprogramar",
                       "cambiar_modalidad", "pasar_pago"] }
          },
          "frases": {
            "type": "object", "additionalProperties": false,
            "required": ["antes_de_cancelar", "antes_de_reprogramar",
                         "antes_de_cambiar_modalidad", "no_puedo_cancelar",
                         "si_insiste_en_cancelar", "no_puedo_cambiar_modalidad"],
            "properties": {
              "antes_de_cancelar": { "type": ["string", "null"], "maxLength": 300,
                "description": "Sólo cuando `cambio_a_tiempo` va en falso y `cancelar` sí está en acciones: el aviso de que la sesión se le cobra, con el plazo de esa ficha adentro. Se manda y se espera su sí." },
              "antes_de_reprogramar": { "type": ["string", "null"], "maxLength": 300,
                "description": "Sólo cuando `cambio_a_tiempo` va en falso: el aviso de que se cobran las dos sesiones. Se manda y se espera su sí." },
              "antes_de_cambiar_modalidad": { "type": ["string", "null"], "maxLength": 200,
                "description": "Sólo cuando `cambiar_modalidad` está en acciones. Nombra la modalidad de hoy y la de destino, en esa dirección." },
              "no_puedo_cancelar": { "type": ["string", "null"], "maxLength": 400,
                "description": "Sólo cuando `cancelar` NO está en acciones por dinero adentro. Trae las salidas que sí existen: mover, y pasar el pago si `pasar_pago` está en acciones." },
              "si_insiste_en_cancelar": { "type": ["string", "null"], "maxLength": 300,
                "description": "La segunda vuelta de la anterior, para cuando ella insiste. Va sólo si va `no_puedo_cancelar`." },
              "no_puedo_cambiar_modalidad": { "type": ["string", "null"], "maxLength": 300,
                "description": "Sólo cuando `cambiar_modalidad` NO está en acciones. Distingue los dos motivos del ensayo: la profesional no permite esa dirección, o ya no alcanza la anticipación." }
            }
          }
        }
      }
    },

    "pagos": {
      "type": "array", "maxItems": 5,
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["cita", "etiqueta", "importe", "estado", "acciones"],
        "properties": {
          "cita":     { "type": "string" },
          "etiqueta": { "type": "string", "maxLength": 60 },
          "importe":  { "type": "string" },
          "estado": { "type": "string",
            "enum": ["esperando_comprobante", "comprobante_recibido", "por_cobrar"] },
          "acciones": {
            "type": "array", "maxItems": 1,
            "items": { "type": "string", "enum": ["registrar_comprobante"] }
          }
        }
      }
    },

    "ultima_plantilla": {
      "type": ["object", "null"], "additionalProperties": false,
      "required": ["plantilla", "cita", "etiqueta", "cuando"],
      "properties": {
        "plantilla": { "type": "string", "maxLength": 60 },
        "cita":      { "type": ["string", "null"] },
        "etiqueta":  { "type": ["string", "null"], "maxLength": 60 },
        "cuando":    { "type": "string" }
      }
    },

    "resena": {
      "type": "object", "additionalProperties": false,
      "required": ["puede"],
      "properties": { "puede": { "type": "boolean" } }
    },

    "puede": {
      "type": "object", "additionalProperties": false,
      "required": ["agendar", "confirmar", "reprogramar", "cancelar",
                   "cambiar_modalidad", "pasar_pago", "mandar_comprobante",
                   "dejar_resena"],
      "properties": {
        "agendar":           { "type": "boolean" },
        "confirmar":         { "type": "boolean" },
        "reprogramar":       { "type": "boolean" },
        "cancelar":          { "type": "boolean" },
        "cambiar_modalidad": { "type": "boolean" },
        "pasar_pago":        { "type": "boolean" },
        "mandar_comprobante":{ "type": "boolean" },
        "dejar_resena":      { "type": "boolean" }
      }
    },

    "frases_fijas": {
      "type": "object", "additionalProperties": false,
      "required": ["no_entendi", "fuera_de_alcance", "asunto_de_dinero",
                   "se_acabo_el_espacio", "elige_profesional",
                   "no_te_reconocemos", "paciente_inactivo", "sin_horarios"],
      "description": "Las ocho claves van siempre. Las cuatro primeras traen texto siempre que haya profesional resuelta; las cuatro últimas traen texto sólo en su caso y null en los demás.",
      "properties": {
        "no_entendi":          { "type": ["string", "null"], "maxLength": 300 },
        "fuera_de_alcance":    { "type": ["string", "null"], "maxLength": 300 },
        "asunto_de_dinero":    { "type": ["string", "null"], "maxLength": 300 },
        "se_acabo_el_espacio": { "type": ["string", "null"], "maxLength": 200 },
        "elige_profesional":   { "type": ["string", "null"], "maxLength": 200 },
        "no_te_reconocemos":   { "type": ["string", "null"], "maxLength": 300 },
        "paciente_inactivo":   { "type": ["string", "null"], "maxLength": 300 },
        "sin_horarios":        { "type": ["string", "null"], "maxLength": 250 }
      }
    }
  }
}
```

**Las catorce claves de primer nivel van siempre**, aunque vayan vacías: `relaciones: []`,
`servicios: []`, `citas: []`, `pagos: []`, `paciente: null`, `profesional: null`,
`ultima_plantilla: null`. Un expediente sin `citas` no significa lo mismo que un expediente con
`citas: []`: lo primero el modelo lo lee como «no me lo dijeron» y lo segundo como «no tiene
ninguna». La ausencia de un campo es una invitación a inventar. **Lo mismo vale dentro de
`frases`, `puede` y `frases_fijas`:** todas sus claves van presentes, en `null` o en `false`
cuando no aplican.

**Qué frase va en cada uno de los cuatro estados de `relacion`:**

| `relacion` | `frases_fijas` que trae texto | Qué hace el modelo |
|---|---|---|
| `paciente` | `no_entendi`, `fuera_de_alcance`, `asunto_de_dinero`, `se_acabo_el_espacio`; y `sin_horarios` si `agendar.puede` va en falso | La gestión normal |
| `ambigua` | `elige_profesional` | Manda esa frase, espera, y vuelve a llamar `abrir_expediente` con la relación que escogió |
| `sin_relacion` | `no_te_reconocemos` | Manda esa frase y cierra. Las otras van en `null`: sin profesional resuelta no hay nombre de pila con el que componerlas |
| `dada_de_baja` | `paciente_inactivo` | Manda esa frase y cierra |

### 2.2 Campo por campo

| Campo | De dónde sale | Por qué está |
|---|---|---|
| `ahora`, `zona` | `professionals.timezone` y la hora del servidor | Los modelos no comparten una noción consistente de «ahora». Se inyecta explícita, y ninguna herramienta acepta una zona del modelo. |
| `relacion` | Resolución de `whatsapp_links` contra el teléfono | Cuatro estados cerrados. Es lo primero que decide qué se puede hacer. |
| `relaciones[]` | `whatsapp_links` con `patients.patient_status = 'active'` | Sólo en el caso ambiguo. Cada renglón es un par identificador–etiqueta. Hoy no ocurre: los 18 vínculos de producción tienen teléfonos distintos (verificado). |
| `paciente.nombre` | `patients.first_name` | Para saludar. Nada más de la ficha clínica viaja: ni apellido, ni edad, ni motivo de consulta, ni contacto de emergencia. |
| `profesional.nombre` | `professionals.first_name` | Nombre de pila. Los textos fijos lo repiten en vez de decir «ella», porque puede haber profesionales hombres. |
| `profesional.anticipacion_minima_horas` | `professional_appointment_policies.patient_min_booking_lead_minutes ÷ 60` | Con cuánta anticipación se puede agendar. **Tres de cinco fichas piden 48 h.** |
| `profesional.aviso_de_cambio_horas` | `…free_change_notice_minutes ÷ 60` | El plazo para cancelar o mover sin que su profesional pueda cobrarle. |
| `profesional.cobro` | `…charge_timing` | `antes` cambia todo el guion del dinero. Hoy sólo Araceli. |
| `profesional.cambio_de_modalidad` | `…patient_can_switch_to_online`, `…patient_can_switch_to_in_person`, `…min_lead_to_change_modality_minutes` | La direccionalidad es real: `test` permite pasar a en línea pero **no** a presencial. |
| `profesional.donde` | `professionals.office_address`, `professionals.fixed_meeting_url` | Los dos siempre presentes, aunque vayan en `null`. Ninguna profesional tiene los dos a la vez, y una presencial sin dirección no se inventa. |
| `profesional.datos_de_pago` | `professionals.payment_bank_name`, `payment_account_holder`, `payment_clabe_or_account` | Redactados por el servidor en una frase. Ver §2.5: **las tres columnas ya existen y las cinco fichas las tienen vacías**. |
| `agendar.puede` | `professionals.is_patient_scheduling_enabled` | Si está en falso no se ofrece agendar. Hoy las cinco lo tienen en `true`. |
| `agendar.primer_dia`, `ultimo_dia` | `ahora + patient_min_booking_lead_minutes`, y `+ 30 días` | **Es el calendario del modelo.** Sin él, «¿tienes mañana?» vuelve vacío para la mayoría y se gastó una llamada en un día que nunca pudo tener huecos. Y es de donde el modelo copia las fechas concretas que manda a `buscar_horarios`, en vez de calcularlas. **Es aritmética, no una lectura de agenda:** el expediente no sabe —ni tiene por qué saber— si dentro de esa ventana hay huecos, porque los huecos dependen del servicio y de la modalidad, y todavía no se sabe cuál va a escoger. Quien contesta eso es `buscar_horarios`. |
| `servicios[]` | `patient_services` unida a `services` si tiene alguno asignado; `services` sola si no (R1) | Nunca los dos. **Hoy 13 de 17 pacientes activas no tienen ninguno asignado** (verificado), así que la rama del catálogo es la normal. |
| `servicios[].precio` | El precio efectivo en tres escalones: `is_free` → 0; `patient_services.preferential_price` si no es nulo; si no, `services.default_price` (R2) | Es la misma fórmula que graba `create_appointment` en `agreed_price`. Nunca se dice «preferente» ni «descuento»: se dice el número. |
| `servicios[].etiqueta` | Nombre + precio + modalidad + duración, siempre las cuatro | Araceli tiene **dos** *Psicoterapia individual* activos, los dos de 50 minutos, que sólo se distinguen por precio ($800 y $900) y por modalidad (ambas / sólo en línea): la duración no desempata nada ahí, pero sí informa. **Nunca un número de orden.** El acento de «Valoración» lo pone el servidor: en la base el nombre está sin acentuar (`Valoracion Sin Costo`). |
| `servicios[].frases.antes_de_agendar` | `recurrence_series` (`frequency`, `weekday`, `start_time`) más la próxima cita leída de `appointments` (R8, R9) | Frase ya compuesta que el modelo copia palabra por palabra. Es el aviso del paso 2 de agendar. `null` cuando no hay nada que avisar. Ver §2.4. |
| `citas[]` | Futuras y `scheduled`, colapsadas por `DISTINCT ON (COALESCE(series_id, id))` (R12) | De cada serie sólo la más próxima. El `COALESCE` es indispensable: `DISTINCT ON (series_id)` a secas colapsaría todas las sueltas en una. |
| `citas[].confirmada` | `appointments.confirmed_at IS NOT NULL` | Para no volver a pedir que confirme algo ya confirmado. |
| `citas[].dinero_adentro` | `payments.status = 'credited'` **o** existe fila en `payment_proofs` (R18) | La bandera que impide que el dinero se evapore. Una petición sellada sin archivo **no** cuenta. |
| `citas[].cambio_a_tiempo` | `starts_at - ahora >= free_change_notice_minutes` (R17) | Calculado en el servidor con el plazo de esa ficha. **No decide si se puede cancelar**: decide qué se le advierte antes. |
| `citas[].acciones` | Derivado de todo lo anterior | Lo que de verdad se puede hacer con esa cita ahora mismo. El modelo no filtra: escoge de esta lista. `cancelar` desaparece por una sola razón —dinero adentro y aviso a tiempo—, nunca por el plazo. `pasar_pago` aparece sólo si hay dinero adentro y existe una próxima cita viva del mismo servicio. |
| `pagos[]` | `payments` + `payment_proofs`, las sesiones pasadas que deban comprobante **más** la más próxima futura de cada serie, la más antigua primero | No se colapsa por serie (R14): una serie de doce debe doce cobros. Cinco por canasta, que es el tope de listas del dueño. |
| `pagos[].estado` | `esperando_comprobante` = pedido sin archivo. `comprobante_recibido` = archivo recibido, su profesional decide. `por_cobrar` = pendiente sin petición | «Pendiente de comprobante» tiene definición exacta y **hoy en producción son cuatro, los cuatro de sesiones pasadas** (verificado). |
| `ultima_plantilla` | `whatsapp_outbox` con `status = 'sent'` al teléfono de la sesión, el más reciente, y sólo si su `template_key` está en la lista de las once que invitan a algo | Es la pista que sustituye al payload de un botón: **ninguna de las 18 plantillas tiene botones**, todas son texto. La cita sale de `coalesce(payload->>'appointment_id', payload->>'new_appointment_id')`: las dos plantillas de reprogramación no nombran `appointment_id`, y una de ellas es justo la que pide comprobante tras mover. |
| `resena.puede` | Activa + ≥1 cita `attended` + sin reseña enviada | La regla real, no `patient_status = 'active'`. Hoy son 11 de 17. |
| `puede` | Política de la profesional + estado de la paciente | **Es lo que personaliza el menú.** Ocho banderas, una por verbo. El texto de «no te entendí» sólo nombra lo que esa profesional permite: si no permite cambios de modalidad, no se mencionan — y quien lo nombra es el servidor al componer `frases_fijas.no_entendi`, no el modelo leyendo banderas. |
| `citas[].frases`, `servicios[].frases` | Compuestas por el servidor con los plazos, los precios y las horas de esa ficha | **Es lo que vuelve cumplible la regla 1 del dueño.** Sin ellas el modelo tendría que escribir «Araceli pide 24 horas de aviso y ya faltan menos, así que se cobran las dos sesiones» partiendo de un `24` y un booleano: o sea, escribir un plazo a mano. Las llaves que empiezan con `antes_de_` se mandan **antes** de la acción y se espera el sí; las demás son la respuesta a lo que ella pidió. |
| `frases_fijas` | `textos-fijos.md`, compuestas con el nombre de pila de la profesional y con `puede` | Los ocho textos que no salen de ninguna operación. Sustituyen a la herramienta `responder_con_texto_fijo` (§1.7). |

**Lo que deliberadamente no viaja:** el teléfono de nadie, el apellido de la paciente, el texto
de reseñas de terceras (superficie de inyección), los identificadores internos de la base, y
ningún monto dentro de los avisos a la profesional.

### 2.3 El ejemplo real, tomado de producción

**Emilio Vargas Trejo, paciente de Araceli.** Es el caso más cargado que existe hoy en la base y
además el único con historia de plantillas de prepago. Todo lo de abajo es real, leído hoy:

- Araceli cobra **antes** (`charge_timing = 'before'`), pide **48 h** de anticipación
  (`patient_min_booking_lead_minutes = 2880`), da **24 h** de aviso de cambio
  (`free_change_notice_minutes = 1440`), permite los dos cambios de modalidad, tiene dirección,
  no tiene liga, y **no llenó sus datos de pago**.
- Emilio no tiene ningún servicio asignado, así que se le ofrece el catálogo completo: los cuatro
  activos de Araceli.
- **No tiene ninguna cita futura viva.** En toda la base hay cero (verificado).
- Debe dos comprobantes: la *Psicoterapia Pareja* del martes 25 ($1 200, petición sellada el 25 a
  la 1:30 p. m.) y la sesión a la que no asistió el jueves 20 ($800).
- El último aviso que se le mandó fue `appointment_confirmation_prepay`, el 25 de agosto a la
  1:30 p. m., por la cita de las 3:30.

```json
{
  "ahora": "2026-08-26T15:44:00-06:00",
  "zona": "America/Mexico_City",
  "relacion": "paciente",
  "relaciones": [],
  "paciente": { "nombre": "Emilio" },
  "profesional": {
    "nombre": "Araceli",
    "anticipacion_minima_horas": 48,
    "aviso_de_cambio_horas": 24,
    "cobro": "antes",
    "cambio_de_modalidad": { "a_en_linea": true, "a_presencial": true, "aviso_horas": 24 },
    "donde": { "direccion": "Francisco Javier Mina 59, Del Carmen, Ciudad de México, CDMX, México", "liga": null },
    "datos_de_pago": null
  },
  "agendar": { "puede": true, "primer_dia": "2026-08-28", "ultimo_dia": "2026-09-25" },
  "servicios": [
    { "servicio": "0b6c1e57-2f44-4a0e-9d81-5b7c0a3e6f12",
      "etiqueta": "Psicoterapia individual, $800, en línea o presencial, 50 min",
      "precio": "800.00", "modalidad": "ambas", "frases": { "antes_de_agendar": null } },
    { "servicio": "7a2d5c90-8e13-4b62-a047-1c9f3d8b5e64",
      "etiqueta": "Psicoterapia individual, $900, en línea, 50 min",
      "precio": "900.00", "modalidad": "en_linea", "frases": { "antes_de_agendar": null } },
    { "servicio": "3e8f1b24-6c07-4d95-8fa3-90b2e7c1d456",
      "etiqueta": "Psicoterapia Pareja, $1,200, en línea, 90 min",
      "precio": "1200.00", "modalidad": "en_linea", "frases": { "antes_de_agendar": null } },
    { "servicio": "c591a70d-4b38-4e26-b1f0-82d6c4a9e703",
      "etiqueta": "Valoración Sin Costo, gratis, en línea o presencial, 30 min",
      "precio": "0.00", "modalidad": "ambas", "frases": { "antes_de_agendar": null } }
  ],
  "citas": [],
  "pagos": [
    { "cita": "9f1c4d2a-6b70-4c11-9a3e-0d5f8e12b447",
      "etiqueta": "jueves 20 de agosto, 5:00 p. m.",
      "importe": "800.00", "estado": "esperando_comprobante",
      "acciones": ["registrar_comprobante"] },
    { "cita": "d4c8b1e2-59a7-4f30-8bc6-1e05a7d29348",
      "etiqueta": "martes 25 de agosto, 3:30 p. m.",
      "importe": "1200.00", "estado": "esperando_comprobante",
      "acciones": ["registrar_comprobante"] }
  ],
  "ultima_plantilla": {
    "plantilla": "appointment_confirmation_prepay",
    "cita": "d4c8b1e2-59a7-4f30-8bc6-1e05a7d29348",
    "etiqueta": "martes 25 de agosto, 3:30 p. m.",
    "cuando": "2026-08-25T13:30:00-06:00"
  },
  "resena": { "puede": true },
  "puede": {
    "agendar": true, "confirmar": false, "reprogramar": false, "cancelar": false,
    "cambiar_modalidad": false, "pasar_pago": false,
    "mandar_comprobante": true, "dejar_resena": true
  },
  "frases_fijas": {
    "no_entendi": "No te entendí. Por aquí te puedo ayudar a agendar una cita con Araceli y con hacerle llegar tu comprobante. ¿Qué necesitas?",
    "fuera_de_alcance": "Eso no lo puedo ver desde aquí. Si necesitas ayuda de nuestro equipo, escríbenos por aquí: https://wa.me/525564370081\n\nYo te sigo ayudando con tus citas y con hacerle llegar tu comprobante a Araceli.",
    "asunto_de_dinero": "Los cobros, los descuentos y las devoluciones los decide Araceli directamente, así que eso lo ves con Araceli.\n\nYo te ayudo con tus citas y con hacerle llegar tu comprobante.",
    "se_acabo_el_espacio": "Se me acabó el espacio de esta consulta. Escríbeme otra vez y seguimos justo desde donde nos quedamos.",
    "elige_profesional": null,
    "no_te_reconocemos": null,
    "paciente_inactivo": null,
    "sin_horarios": null
  }
}
```

**Mírese `no_entendi` de cerca: nombra agendar y el comprobante, y no nombra ni mover ni cancelar
ni cambiar de modalidad.** No es un descuido: Emilio no tiene ni una cita futura, así que esas
tres banderas de `puede` van en falso y la frase no las menciona. Es la regla 8 del dueño —el menú
es personalizado— aplicada al texto, y por eso la frase la compone el servidor y no el modelo.

Los identificadores son de ejemplo: en producción hay **cero identificadores emitidos en toda la
historia**, porque `private.agent_token_key_registry` está vacía (§4).

**Qué hace el modelo con esto sin gastar ni una llamada más:** sabe que Emilio no tiene citas, que
debe dos comprobantes con su fecha y su monto, que el último aviso fue el de prepago de la cita
del 25 —así que si manda una foto, lo más probable es ésa, y de todos modos se le pregunta—, que
puede agendar del 28 de agosto al 25 de septiembre, cuánto cuesta cada servicio, y que si agenda,
al no haber datos de pago, el cierre lo manda a pedírselos a Araceli.

### 2.4 El aviso de recurrencia, en un solo campo: `frases.antes_de_agendar`

El paso 2 de agendar dice: si ese servicio tiene recurrencia, se le explica el ritmo, el día, la
hora y cuál es su próxima cita, y se le pregunta si de verdad quiere otra; si tiene una próxima
sin recurrencia, se le pregunta igual; si no tiene nada, se salta.

Son tres casos y **un solo campo**: `servicios[].frases.antes_de_agendar`, compuesto por el servidor y
copiado palabra por palabra.

| Caso | Qué trae `antes_de_agendar` |
|---|---|
| Serie viva de ese servicio | «Cada dos semanas, los miércoles a las 4:00 de la tarde; tu próxima es el miércoles 2 de septiembre a las 4:00 de la tarde.» |
| Serie viva cuya próxima se movió (R10) | «…; **tu próxima quedó** el viernes 4 de septiembre a las 6:00 de la tarde.» |
| Sin serie, pero con una próxima cita de ese servicio | «Ya tienes una sesión de esto el miércoles 2 de septiembre a las 4:00 de la tarde.» |
| Sin serie y sin próxima | `null` |

Las tres primeras piezas salen de `recurrence_series` (`frequency`, `weekday`, `start_time`) y la
cuarta se lee de `appointments`: **la fecha de una serie nunca se calcula** (R9), porque una serie
puede tener huecos y una ocurrencia puede haberse movido sin salir de la serie. Las frecuencias
son exactamente tres —cada semana, cada dos, cada cuatro— y no hay mensual (R7).

Hoy en producción hay **cero series** (verificado), así que este campo sale `null` siempre salvo
por el tercer caso. Y el permiso `SELECT` sobre `public.recurrence_series` **no existe todavía**
y ninguna migración lo concede (§9).

### 2.5 Los datos de pago ya existen; lo que falta es que los llenen

Corrección al punto 4 de la lista de cambios de la autoridad. Los tres campos **no hay que
agregarlos al esquema**: `public.professionals` ya tiene `payment_bank_name`,
`payment_account_holder` y `payment_clabe_or_account` (verificado en
`information_schema.columns`). Lo que pasa es que **las cinco profesionales los tienen en `NULL`**,
Araceli incluida, que es la única que cobra por adelantado.

Consecuencia inmediata y honesta: **hoy el cierre de prepago que aplica es el segundo**, el que la
manda a pedirle los datos a su profesional. El primero —el que dicta banco, titular y CLABE— no se
puede usar con nadie hasta que alguien llene esos tres campos. Lo que falta es la pantalla en la
app de la profesional, no una migración.

> **Y hay una migración escrita hoy que crea una cuarta columna sin querer.**
> `20260826001000_agente_datos_de_pago.sql` hace
> `ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS … payment_clabe text` — **`payment_clabe`,
> no `payment_clabe_or_account`**. Como la columna que existe se llama distinto, el
> `IF NOT EXISTS` no la reconoce y **crea una segunda columna vacía al lado**. A partir de ahí la
> pantalla escribiría en una y el agente leería la otra, o al revés, y el mensaje de prepago
> saldría sin CLABE sin que nada falle ni avise. El nombre bueno es el que ya está desplegado:
> `payment_clabe_or_account`. Es un `sed` de una palabra en esa migración y en el `GRANT SELECT`
> por columna que lleva debajo, y hay que hacerlo antes de aplicarla.

### 2.6 El techo, medido

**El techo es el que ya existe: 16 384 octetos.** El corte anterior inventaba encima un tope
propio de «4 000 caracteres» y decía que el peor expediente pesaba 3 357. **Los dos números están
mal, y se corrigen aquí armando los JSON y midiéndolos:**

- `chk_agent_tool_calls_redacted_result_size` limita `redacted_result` a **16 384 octetos**, y
  `jsonResponse` del portal limita el cuerpo completo de la respuesta al mismo número
  (`MAX_JSON_RESPONSE_BYTES = 16_384`, verificado en `_shared/agent/constants.ts`).
- El sobre `{"ok":true,"turn_disposition":"keep_open","result":{…}}` cuesta 52 octetos, medido.
- **El expediente real de Emilio de §2.3, serializado compacto, pesa 2 133 caracteres y 2 140
  octetos** (2 192 con el sobre). El español acentuado cuesta 0.3 % más octetos que caracteres.
- **El peor caso posible con los límites de esta misma sección pesa 4 696 caracteres** —5
  servicios, dos con su frase de recurrencia completa, 3 citas, 5 pagos, y la profesional con su
  liga de 200 y sus datos de pago de 160—, y **5 170 si los cinco servicios traen recurrencia**.

Un tope propio de 4 000 caracteres habría sido, por lo tanto, **un tope que el propio esquema
puede rebasar**, y su única forma de cumplirse sería recortar a última hora: exactamente el
mecanismo que hace que a una paciente se le pierda un cobro de la lista sin que nada avise. Se
retira. El peor expediente pesa 5 222 octetos con el sobre, **la tercera parte del cupo real**, y
no hace falta ningún tope intermedio.

Lo que sí sostiene el tamaño son seis reglas, y ninguna es un recorte:

1. Máximo **3 citas**, **5 pagos** y **5 servicios**. Cinco es el tope de listas del dueño y nadie
   gestiona más de tres citas en una conversación de WhatsApp; la agenda completa se ve en la app.
2. Las etiquetas se cortan a **60 caracteres**, la de servicio a **80**, la frase `antes_de_agendar` a **240**,
   la dirección a **120**, la liga a **200**.
3. Ningún texto libre de terceras personas entra jamás.
4. Ningún campo se repite: la dirección y la liga viven una sola vez, en la profesional, porque
   una relación es una profesional.
5. Los servicios **llevan siempre su duración**. R5 la pedía sólo para desempatar, pero un rótulo
   que a veces la trae y a veces no es una condición más que mantener, cuesta ocho caracteres, y
   la paciente que compara *Psicoterapia individual* de 50 minutos contra *Pareja* de 90 sí la
   necesita. Se prefiere la regla sin excepción.
6. Nada de lo que el modelo no vaya a usar en un mensaje entra: ni el perfil público, ni el
   apellido, ni el identificador del servicio de cada cita —`buscar_horarios` con `para_mover`
   resuelve el servicio a partir de la cita, en el servidor.

### 2.7 Los plazos salen de la ficha, nunca de una constante

Esto no es una precaución: es un error que ya estaría en producción si el texto dijera «24 horas».
Verificado hoy, ficha por ficha:

| Profesional | Anticipación mínima | Aviso de cambio | Cambio de modalidad | Cobro | Datos de pago |
|---|---|---|---|---|---|
| Araceli | 48 h | 24 h | a las dos, 24 h | **antes** | vacíos |
| Miranda | 48 h | **12 h** | a las dos, **12 h** | después | vacíos |
| test | 48 h | 24 h | **sólo a en línea**, 24 h | después | vacíos |
| Maricruz tes | 24 h | 24 h | ninguna | después | vacíos |
| Test | 24 h | 24 h | ninguna | después | vacíos |

Miranda da **12 horas** de aviso de cambio. Un texto que diga «necesito 24 horas» le miente a sus
pacientes en la dirección peligrosa: creen que ya es tarde cuando todavía están a tiempo, y se
aguantan una cita que podían mover gratis. Por eso el expediente entrega
`aviso_de_cambio_horas` como número y `cambio_a_tiempo` ya calculado, y el prompt sólo sabe decir
«con {aviso_de_cambio_horas} horas de anticipación».

Y por eso el permiso `SELECT` sobre `public.professional_appointment_policies` es **bloqueante**:
sin él el expediente no puede calcular ninguno de los dos. En la base desplegada el rol del agente
no lo tiene; el `GRANT` sí está escrito, en `20260825000000` línea 67 y otra vez en
`20260825001000` línea 31. Falta aplicarlo, no escribirlo (§9).

Nota aparte, para que no se confundan dos relojes distintos: el margen de **26 horas** del que se
le habla a la profesional como «24» es el del aviso de confirmación
(`cron_appointment_confirmation_26h`). No tiene nada que ver con `free_change_notice_minutes`, que
es el plazo de cambio de la paciente.

---

## 3. La búsqueda de horarios con filtros

Es la operación nueva. Sustituye a la pantalla del formulario y a `get_availability`, y es la
única pieza del catálogo que no existe ni escrita.

### 3.1 Qué recibe y qué hace por dentro

**Una sola llamada aunque el servidor recorra treinta días.** El presupuesto cuenta viajes del
agente al servidor, no trabajo de la base. Medido hoy contra producción con `EXPLAIN ANALYZE`:
recorrer los 30 días del horizonte llamando a la primitiva de disponibilidad un día a la vez
cuesta **39.0 ms la primera corrida y 37.4 ms la segunda** (Araceli, presencial, *Psicoterapia
individual* de 50 min, del 28 de agosto al 26 de septiembre). Son ~1.25 ms por día, contra los
2 000 ms de `READ_TIMEOUT_MS` del portal: caben cincuenta recorridos completos antes de que el
portal se rinda. **Ojo con el número de la autoridad:** ahí dice «recorrer 60 días cuesta 1.6
milisegundos», y está unas veinticinco veces bajo. No cambia ninguna decisión —sigue sobrando
margen— pero no sirve como presupuesto de nada más pesado.

Los cuatro filtros se usan **tal cual**, y se combinan con «y»:

| Filtro | Qué hace el servidor |
|---|---|
| `dias_de_la_semana` | Se queda sólo con los días del horizonte que caen en esos días de la semana. |
| `fechas` | Se queda sólo con esas fechas. Si vienen los dos filtros, se unen: es «esos días de la semana **o** esas fechas». |
| `hora` | Se queda con los huecos que empiezan a **±60 minutos** de esa hora. Una sola regla, dicha una vez, para que «a las 6» encuentre 5:45 y 6:15. |
| `parte_del_dia` | Ventanas fijas del servidor: mañana 6:00–11:59, mediodía 12:00–14:59, tarde 15:00–18:59, noche 19:00–22:59. Nunca las escoge el modelo. |

**Nada de esto lo calcula el modelo.** El horizonte va de `agendar.primer_dia` a
`agendar.ultimo_dia`, que ya vienen en el expediente. Si los cuatro filtros vienen vacíos —«cuando
sea»— el servidor devuelve las cinco opciones más próximas.

**`hora` y `parte_del_dia` son dos campos del modelo pero un solo par de horas en la base.** La
función escrita recibe `p_from_local_time` y `p_to_local_time`; el portal traduce «a las 6» a
17:00–19:00 y «en la tarde» a 15:00–18:59. Por eso los dos campos nunca viajan juntos: son dos
formas de decir la misma ventana, y quien la resuelve es el portal, no el modelo.

El recorrido se detiene en cuanto junta **cinco opciones**, y nunca ofrece dos horarios del mismo
día si con eso deja fuera un día distinto: reparte primero un horario por día, en orden
cronológico, y sólo después rellena.

### 3.2 Qué devuelve

```json
{
  "ok": true,
  "turn_disposition": "keep_open",
  "result": {
    "operacion": "para_agendar",
    "hay": true,
    "motivo": null,
    "opciones": [
      { "hueco": "b2f4a610-3c9d-4e72-8a15-6d0f7c39e284",
        "etiqueta": "viernes 28 de agosto, 4:00 p. m." },
      { "hueco": "5c7e0d93-18b4-4a06-9f2c-3e81b45da770",
        "etiqueta": "viernes 28 de agosto, 5:00 p. m." },
      { "hueco": "e04b7c15-9a26-4d38-b7e0-1f52c8a6903b",
        "etiqueta": "lunes 31 de agosto, 4:00 p. m." }
    ],
    "mensaje": "Tengo estos horarios con Araceli:\n\n1. Viernes 28 de agosto, 4:00 p. m.\n2. Viernes 28 de agosto, 5:00 p. m.\n3. Lunes 31 de agosto, 4:00 p. m.\n\n¿Cuál te acomoda?",
    "acciones_disponibles": ["reservar", "buscar_horarios"]
  }
}
```

**El mensaje lo redacta el servidor, también en la búsqueda.** Es la consecuencia directa de la
regla 1 del dueño: si el modelo redacta la lista, redacta fechas, y en cuanto redacta fechas las
calcula. Con el mensaje ya escrito, el modelo sólo lo manda.

**Quién lo redacta, con precisión.** «El servidor» son dos piezas y conviene no confundirlas: la
función de base devuelve **datos** —las opciones con su etiqueta, o el motivo con el puñado de
cifras que su frase necesita— y **el portal arma la frase** y la mete en `mensaje`. Así
está escrito ya: `agent_search_availability_from_workflow` devuelve `empty_reason` más un `hint`
con sólo los datos de ese motivo, y no compone ninguna oración. La regla que importa se cumple
igual —el modelo nunca escribe una fecha— y el texto vive donde se puede corregir sin migrar.

Y el portal aplica ahí la regla de presentación del dueño: **si dos días traen las mismas horas,
se dicen una sola vez** («los dos días tengo 12:00, 1:00, 3:00, 4:00 y 5:00»); si difieren, se
numeran día y hora juntos, como arriba.

### 3.3 Cuando no hay nada, se dice el motivo

Son **siete**, son distintos, y cada uno tiene su frase. `hay` va en falso, `opciones` en `[]` y
`motivo` trae uno de estos siete valores cerrados. Los cinco primeros son los de la autoridad; el
sexto sale de su regla 7 —horizonte de 30 días, «si quiere algo más lejano, se consulta de
nuevo»— y sin él una fecha de noviembre cae por descarte en `LLENA`, que es mentira; el séptimo es
la profesional que no ha guardado su horario.

**Ojo con los nombres: hay dos vocabularios y el portal traduce.** La función de base devuelve
`empty_reason` en inglés —así está escrita— y el portal lo convierte al `motivo` en español y le
pone la frase. Los dos van aquí para que nadie busque el literal equivocado:

| `motivo` (portal) | `empty_reason` (base) | Cuándo | `mensaje` (ejemplo con datos reales de Araceli) |
|---|---|---|---|
| `FUERA_DE_SU_HORARIO` | `OUT_OF_HOURS` | La hora o la parte del día que pidió cae fuera de todos sus bloques | «Araceli no da consultas de noche. Sus horarios son de 9:00 a 2:00 y de 3:00 a 6:00. ¿Te acomoda alguno?» |
| `DIAS_QUE_NO_TRABAJA` | `OUT_OF_WEEKDAYS` | Los días de la semana que pidió no están en su horario | «Araceli no atiende sábados ni domingos. Entre semana sí tengo.» |
| `ESOS_DIAS_NO_ESTA` | `DATES_UNAVAILABLE` | Sí trabaja esos días de la semana, pero esas fechas concretas están bloqueadas o son excepción | «El 15 y el 16 Araceli no va a estar. Lo más cercano es el 17.» |
| `LLENA` | `FULLY_BOOKED` | Trabaja esos días a esa hora, pero todo está ocupado | «Los martes al mediodía ya se le llenaron. Sí tengo miércoles y jueves a esa hora.» |
| `DEMASIADO_PRONTO` | `TOO_SOON` | Las fechas que pidió son anteriores a `agendar.primer_dia` | «Para mañana ya no alcanzo: Araceli necesita 48 horas. Lo más cercano es el viernes 28.» |
| `FUERA_DEL_HORIZONTE` | `BEYOND_HORIZON` | Las fechas que pidió pasan de `agendar.ultimo_dia` | «Todavía no tengo abierta esa fecha; llego hasta el viernes 25 de septiembre. Escríbeme más cerca y te la aparto.» |
| `SIN_HORARIO` | `NO_SCHEDULE` | La profesional no tiene **ni un** bloque de horario guardado | El texto aprobado de `sin_horarios`: «Ahorita Araceli no tiene horarios abiertos para las próximas semanas. Lo mejor es que le escribas directamente para que te dé un espacio.» |

El ejemplo de `FUERA_DE_SU_HORARIO` **dice «de noche» y no «por la mañana» a propósito**: Araceli
sí da consultas por la mañana —de 9:00 a 14:00, verificado en sus bloques—, así que la frase de la
autoridad, escrita para una profesional de 3:00 a 7:00, aquí sería falsa. El plazo, los bloques y
la parte del día salen siempre de la ficha, nunca del ejemplo.

**Los siete mensajes llevan una salida dentro** —la alternativa concreta, la fecha hasta la que sí
llega, o el «escríbele directamente»— y el servidor la calcula en el mismo recorrido, porque ya
tiene los días con huecos en la mano. Ninguno termina en punto: un «no hay» sin salida es una
conversación muerta.

> **`NO_SCHEDULE` va primero en la cadena de motivos, y esa posición es el arreglo.** Sin él, una
> profesional recién llegada —sin un solo bloque guardado— caía por descarte en `FULLY_BOOKED`, o
> sea «ya se le llenaron», que es mentira y además manda a la paciente a pedir otros días que
> tampoco existen. Añadido a `20260826002000_agente_busqueda_con_filtros.sql` como primera rama
> del `IF` de motivos, con `hint` vacío: el texto aprobado no menciona ni horas ni días, porque no
> hay ninguno que mencionar.

**«Esta profesional no tiene ni un horario abierto» también es un motivo de la búsqueda, no una
deducción del expediente.** El corte anterior lo resolvía «sin llamar a la búsqueda», leyendo
`agendar.primer_dia` en `null`. No funciona: el expediente calcula esa fecha con aritmética y no
sabe si hay huecos, porque los huecos dependen del servicio y de la modalidad y todavía no se
sabe cuál escogió. Averiguarlo obligaría a recorrer los 30 días **de cada servicio** dentro del
expediente, que es la llamada que más se hace. Así que se hace donde cuesta una vez: si la
búsqueda no encuentra ni un bloque configurado, devuelve el motivo `SIN_HORARIO` y el
portal contesta con el texto aprobado de `sin_horarios`. **El otro caso —`agendar.puede` en
falso— lo cubre el expediente**, que trae ese mismo texto en `frases_fijas.sin_horarios` y ahí no
cuesta ninguna llamada: si la profesional apagó el agendado por parte de la paciente, no hay nada
que buscar.

### 3.4 Qué está arreglado ya, y qué falta

**Aquí se corrige el corte anterior de este documento.** Decía que la lectura de horarios estaba
rota en tres cosas —tope de seis, traslapes y horizonte de 60 días— y que por eso la tarde no
aparecía nunca. **Eso ya no es cierto: las tres están arregladas en lo escrito**, en
`20260825001000_agent_consultas_agenda.sql`, que se tocó a las 15:54 de hoy. Leído ahora mismo:

```
v_horizon_days constant integer := 30;   -- línea 698, no 60
v_limit        constant integer := 10;   -- línea 702, no 6
```

y el cuerpo ya descarta traslapes (`IF v_last_end IS NOT NULL AND v_slot.start_local < v_last_end
THEN CONTINUE`) y ya aplica la franja horaria **antes** de contar contra el tope.

**Medido hoy contra producción**, lunes 31 de agosto, presencial, *Psicoterapia individual* de 50
minutos con 10 de margen. La primitiva `public._get_internal_availability_core` devuelve **26
candidatos** en pasos de quince minutos, de 9:00 a 13:00 y de 15:00 a 17:00. Con el descarte de
traslapes ya escrito, lo que queda son **ocho horarios reales**:

```
9:00, 10:00, 11:00, 12:00, 13:00, 15:00, 16:00, 17:00
```

Ocho es menos que diez, así que **no se trunca nada y la tarde sí aparece**. El defecto que
describía la autoridad existió y ya está resuelto; lo que falta no es escribirlo, es desplegarlo.

Lo que sí queda pendiente son **tres cosas**, y ninguna es de recorte:

**1 · Se pide por un día y una modalidad.** La firma de
`agent_get_availability_from_workflow` es `(…, p_service_handle uuid, p_day date, p_modality
text, p_from_local_time text, p_to_local_time text)`: un día por llamada. Con eso, «¿tienes el
martes o el jueves en la tarde?» cuesta dos llamadas y ninguna sabe de la otra. Esto **ya está
escrito aparte**, en `public.agent_search_availability_from_workflow`
(`20260826002000_agente_busqueda_con_filtros.sql`), que recibe `p_weekdays text[]`, `p_dates
date[]` y la franja, y recorre los días candidatos por dentro con tope de cinco y horizonte de 30.

**2 · Falta la mitad de `para_mover`, y es bloqueante.** La función nueva **no recibe la cita**:
su firma es `(p_provider_message_id, p_kapso_execution_id, p_service_handle, p_modality,
p_weekdays, p_dates, p_from_local_time, p_to_local_time)` — no hay `p_appointment_handle`, así que
hoy la operación `para_mover` del §1.2 **no tiene por dónde entrar**, y de paso sigue pasando
`NULL::uuid` en `p_exclude_appointment_id`. Las dos consecuencias son la misma línea de código:
al pedir horarios para mover su cita del viernes a las 4, **su propia cita ocupa el viernes a las
4 y los vecinos**, y el servidor tampoco puede resolver el servicio a partir de la cita, así que
el modelo tendría que adivinarlo. Hay que añadir el parámetro y pasarlo a la primitiva.

**3 · La vida del identificador de hueco sube de 5 a 30 minutos** (§4). Con cinco minutos, una
paciente que compara el martes con el jueves y vuelve al martes se encuentra con que el emisor
**no puede reemitir** — `agent_option_tokens` tiene `UNIQUE (turn_id, kind, stable_key)` y el
emisor devuelve `TOKEN_EXPIRED_STABLE_KEY` en vez de acuñar otro—, y las dos funciones escritas
**no lo toleran: levantan `AGENT_WORKFLOW_AVAILABILITY_HANDLE_REJECTED`**. No es que el día salga
incompleto: es que volver a pedir ese mismo día revienta la lectura entera y ella recibe un error
en vez de horarios. El `interval '5 minutes'` está en el `LEAST` de las dos.

### 3.5 Lo que se acepta y no se arregla

El identificador de hueco es de un solo uso y `agent_create_appointment_from_workflow` lo consume
**antes** de comprobar que el hueco siga libre. Si alguien se le adelantó, ella recibe «ese
horario ya se ocupó» —el error `HORARIO_YA_OCUPADO` de §8— y hay que volver a buscarle. Cuesta
una llamada más, cabe en el presupuesto y es honesto; lo único inaceptable sería no decírselo.

---

## 4. Handles con etiqueta

Los identificadores opacos se quedan. Son un control de seguridad —atan cada opción al turno, a la
sesión, al teléfono y a la paciente, y caducan— no una decisión de presentación. Pero un
identificador desnudo degrada de verdad la precisión del modelo.

**La forma: cada identificador viaja emparejado con su etiqueta, siempre.**

```json
{ "cita": "9f1c4d2a-6b70-4c11-9a3e-0d5f8e12b447",
  "etiqueta": "jueves 27 de agosto, 3:30 p. m., en línea" }
```

Cuatro reglas:

1. **El campo del identificador se llama como su tipo**: `relacion`, `servicio`, `cita`, `hueco`.
   `etiqueta` siempre se llama `etiqueta`.
2. **El modelo razona sobre la etiqueta y devuelve el identificador.** Ningún esquema de entrada
   acepta `etiqueta`; si el modelo la manda, el conjunto exacto de claves ya no cuadra y el portal
   contesta `400` sin tocar la base.
3. **La etiqueta la compone el servidor.** Día de la semana, día, mes en letra, hora local en
   formato de 12 horas con «a. m.» / «p. m.», y modalidad en palabras. Nunca la escribe el modelo,
   nunca lleva el año, nunca pasa de 60 caracteres (80 la de servicio).
4. **Nunca aparece un identificador sin etiqueta**, ni siquiera dentro de un resultado de mutación:
   el sobre de la §7 repite la etiqueta para que el mensaje de cierre se redacte desde ahí.

### 4.1 Los cuatro tipos, y el quinto que se borra

Los tipos están fijados por `CHECK chk_agent_option_tokens_kind_matrix` de
`public.agent_option_tokens` y sus vidas por el `CASE` de `private.agent_issue_option_handle`, los
dos leídos hoy de la base:

| Tipo | Entidad | ¿Un solo uso? | Vida hoy | Vida después | Dónde se ve |
|---|---|---|---|---|---|
| `relationship` | `whatsapp_link` | sí | 10 min | **30 min** | expediente ambiguo |
| `service` | `service` | no | 15 min | **30 min** | `servicios[]` del expediente |
| `appointment` | `appointment` | no | 15 min | **30 min** | `citas[]`, `pagos[]`, `ultima_plantilla`, resultados |
| `slot` | `service_slot` | sí | 5 min | **30 min** | `opciones[]` de la búsqueda |
| ~~`flow`~~ | ~~`turn`~~ | — | 15 min | **se borra** | era el `flow_token` del formulario |

**Un solo tope, 30 minutos, y por qué es el correcto.** Treinta minutos es exactamente el techo al
que el portero renueva el turno (`expires_at = LEAST(sesión.expires_at, now() + 30 min)`), y el
emisor ya rechaza cualquier vencimiento que pase del turno o de la sesión. Con ese tope **el turno
es el único reloj**: quien mata un identificador es siempre el cambio de turno, nunca el
cronómetro, y sobra el resto de la tabla.

**Y con una letra chica que revienta el despliegue si se pasa por alto: quien emite tiene que
pasar `p_expires_at := v_turn.expires_at`, nunca `now() + interval '30 minutes'`.** El emisor
compara `p_expires_at > v_turn.expires_at` y rechaza con `OPTION_EXPIRY_INVALID` (leído hoy del
cuerpo desplegado). El `expires_at` del turno lo estampó el reclamo unos milisegundos antes con su
propio `clock_timestamp()`, así que un `now() + 30 min` calculado después **siempre cae por
encima** y **siempre se rechaza**. La igualdad sí pasa. Los 30 minutos del `CASE` son un techo, no
un valor: el valor es el vencimiento del turno. Las dos funciones escritas ya lo hacen bien —usan
`LEAST(now() + interval '5 minutes', v_turn_expires_at)`—; lo único que cambia es el intervalo.

**Un identificador muere con su turno.** `private.agent_resolve_option_token` compara
`token.turn_id` contra el turno que pregunta y devuelve `TOKEN_CONTEXT_INVALID` si no son el mismo
(verificado leyendo el cuerpo). Conversando eso casi no muerde, porque la gestión entera vive en
un turno que se reanuda mensaje tras mensaje. Sigue existiendo el error `HANDLE_VENCIDO` de §8
para el turno que llegó a su media hora, con la misma remediación: vuelve a abrir el expediente.

**Hoy no se puede emitir ni un solo identificador.** `private.agent_token_key_registry` existe en
la base desplegada y está **vacía** (0 renglones, verificado), y
`public.agent_register_option_token_key` **no existe**: vive en
`20260824200000_agent_cerrojos_tanda0.sql`, sin desplegar. `agent_issue_option_handle` rechaza con
`OPTION_KEY_INVALID` cuando no encuentra la llave, y comprueba además que
`verify_until >= p_expires_at`. **Registrar una llave con `can_issue = true` y un `verify_until`
que cubra los 30 minutos es el primer paso de cualquier despliegue.** La tabla es del rol del
agente —él es su dueño—, así que no necesita ningún `GRANT`: sólo la función que falta.

Cuatro lugares hay que tocar para subir la vida a 30 minutos, y los dos últimos se olvidan fácil:
el `CASE` del `private.agent_issue_option_handle` **desplegado**, la matriz gemela de
`private.agent_issue_listed_option` (escrita, sin aplicar), y el `interval '5 minutes'` del
`LEAST` de **las dos** lecturas de horarios —`agent_get_availability_from_workflow` línea 930 y
`agent_search_availability_from_workflow`—. Y hay que borrar la fila `flow` de los tres sitios,
más la rama `flow` del `CHECK` de la tabla.

---

## 5. Qué operación hay detrás de cada herramienta

Estados: **desplegada** (está en producción), **escrita** (está en el árbol de trabajo sin
desplegar), **por escribir**.

| Herramienta · operación | Operación del portero | Ruta del portal | Función de base | Estado |
|---|---|---|---|---|
| `abrir_expediente` | `open_dossier` | `/tools/expediente` | `public.agent_open_dossier_from_workflow(text, text)` | **escrita a medias** (`20260826003000`). Devuelve `ahora`, `paciente`, `profesional`, `puede`, `pendientes` y `ultima_plantilla`. **Le faltan cinco cosas de la §2.1 y son bloqueantes:** `relacion` con sus cuatro estados, `servicios[]`, `citas[]`, `pagos[]`, y todas las `frases` —las de cada cita, las de cada servicio y `frases_fijas`—. Y le falta el tercer parámetro: sin `p_relationship_handle` la segunda llamada del caso ambiguo no tiene por dónde entrar (§1.1). Ojo con el nombre: la operación del portero es `open_dossier`, no `open_case`. |
| `buscar_horarios` · `para_agendar` | `search_availability` | `/tools/horarios` | `public.agent_search_availability_from_workflow(text, text, uuid, text, text[], date[], text, text)` | **escrita** hoy (`20260826002000`), con horizonte 30, tope 5 y siete motivos |
| `buscar_horarios` · `para_mover` | `search_availability` | `/tools/horarios` | la misma, con un parámetro más | **por escribir**: falta `p_appointment_handle` y falta pasarlo a `p_exclude_appointment_id` (§3.4 · 2) |
| `reservar` · `agendar` | `create_appointment` | `/tools/appointments/create` | `public.agent_create_appointment_from_workflow(text, text, uuid)` | **escrita** (`20260825003000`). Dos correcciones: la cita nunca nace confirmada, y en prepago el pago nace con `proof_requested_at` y `method = 'transfer'` |
| `reservar` · `reprogramar` | `reschedule_appointment` | `/tools/appointments/reschedule` | `public.agent_reschedule_appointment_from_workflow(text, text, uuid, uuid)` | **escrita**. Hay que reescribir la rama tardía: **el dinero ya no viaja, se congela** (R21) |
| `gestionar_cita` · `confirmar` | `confirm_appointment` | `/tools/appointments/confirm` | `public.agent_confirm_appointment_from_workflow(text, text, uuid)` | **escrita** |
| `gestionar_cita` · `cancelar` | `cancel_appointment` | `/tools/appointments/cancel` | `public.agent_cancel_appointment_from_workflow(text, text, uuid)` | **escrita**. Le falta el cerrojo `APPOINTMENT_HAS_MONEY` |
| `gestionar_cita` · `cambiar_modalidad` | `switch_appointment_modality` | `/tools/appointments/modality` | `public.agent_switch_appointment_modality_from_workflow(text, text, uuid, text)` | **escrita** |
| `gestionar_cita` · `pasar_pago` | `carry_payment_forward` | `/tools/payments/carry-forward` | `public.agent_carry_payment_forward_from_workflow(text, text, uuid)` | **escrita** hoy (`20260826004000`), con la firma exacta que pedía `14-pasar-pago.md` §3.3 |
| `registrar_comprobante` | `attach_payment_proof` | `/tools/payments/proof` | `public.agent_attach_payment_proof_from_workflow(text, text, uuid, text, text, integer, text)` | **escrita** (`20260825002000`). Cambia de superficie (`media_adapter` → `agent_node`), de ruta y de dónde saca el archivo |
| `enviar_resena` | `submit_review` | `/tools/reviews/submit` | `public.agent_submit_review_from_workflow(text, text, integer, text)` | **escrita** (`20260825004000`) |
| — (cierre del turno) | `complete_inbound` | `/workflow/complete` | `public.agent_complete_inbound_from_workflow(text, text, text)` | **desplegada** |
| — (estacionar el turno) | — (no reclama) | `/workflow/waiting` | `public.agent_mark_inbound_waiting(text, text)` | **desplegada** |

**Nada de dominio está desplegado.** En la base hay **13 funciones del agente y las 13 son de
plomería** —admisión, portero, identificadores, cierre— verificado hoy sobre `pg_proc`: cuatro en
`private` y nueve en `public`. El portal en producción contesta cuatro rutas y nada más:
`/health`, `/tools/capabilities`, `/workflow/waiting` y `/workflow/complete`; cualquier otra
devuelve `403 OPERATION_NOT_ENABLED`.

**Y ninguna ruta del portal existe todavía para lo nuevo.** `/tools/expediente`,
`/tools/horarios` y `/tools/payments/carry-forward` no están ni en `FUTURE_AGENT_ROUTES` ni en
`DOMAIN_ROUTES` (leído hoy de `handler.ts`). Las tres funciones de base escritas hoy no tienen
quien las llame: **el trabajo que queda del lado del portal es tan grande como el que queda del
lado de SQL**, y conviene no leer «escrita» como «lista».

### 5.1 El mapa completo del gateway

Hoy hay dos listas que no coinciden —la declarada (`FUTURE_AGENT_ROUTES`, 28 rutas) y la que sí
atiende (`DOMAIN_ROUTES`, 18)— y una ruta borrada de una sola de las dos se queda respondiendo.
**Las dos listas quedan iguales, con doce rutas más `/health`**, y con eso
`403 OPERATION_NOT_ENABLED` deja de ser una respuesta normal del sistema:

| # | Ruta | Superficie |
|---|---|---|
| 1 | `/tools/expediente` (hoy `/tools/capabilities`) | `agent_node` |
| 2 | `/tools/horarios` (hoy `/tools/availability`) | `agent_node` |
| 3 | `/tools/appointments/create` | `agent_node` |
| 4 | `/tools/appointments/reschedule` | `agent_node` |
| 5 | `/tools/appointments/confirm` | `agent_node` |
| 6 | `/tools/appointments/cancel` | `agent_node` |
| 7 | `/tools/appointments/modality` | `agent_node` |
| 8 | `/tools/payments/carry-forward` | `agent_node` |
| 9 | `/tools/payments/proof` (hoy `/media/payment-proof`) | `agent_node` |
| 10 | `/tools/reviews/submit` | `agent_node` |
| 11 | `/workflow/complete` | `workflow_internal` |
| 12 | `/workflow/waiting` | — (no reclama) |

**Se borran de las dos listas diecisiete rutas**: `/tools/relationship/select`,
`/tools/services`, `/tools/booking/eligibility`, `/tools/appointments/upcoming`,
`/tools/appointments/next`, `/tools/location`, `/tools/payments/pending`,
`/tools/payments/status`, `/tools/profile/share`, `/tools/appointments/cancel-then-book`,
`/tools/resources/resume`, `/flow/services`, `/flow/eligibility`, `/flow/availability`,
`/flow/create`, **`/workflow/open-booking-flow`** y **`/workflow/fixed-response`**.

Las dos últimas son las que se colaron y conviene decir por qué. `/workflow/open-booking-flow`
está declarada hoy en `FUTURE_AGENT_ROUTES` (verificado leyendo `handler.ts`), es la puerta con la
que el agente abría el formulario, y se va con él igual que su operación `open_booking_flow` de la
§6.3. `/workflow/fixed-response` también está declarada, **nunca tuvo manejador ni función de
dominio** —hoy devuelve `403`— y se va con la herramienta que la usaba (§1.7): los ocho textos
viajan dentro del expediente.

Entra una ruta nueva, `/tools/payments/carry-forward`. **De veintiocho rutas declaradas se pasa a
doce**: 28 − 17 + 1 = 12. Y hay tres cambios de nombre: `/tools/capabilities` → `/tools/expediente`, `/tools/availability` →
`/tools/horarios`, y `/media/payment-proof` → `/tools/payments/proof`, que es lo que queda de la
superficie `media_adapter`.

Los moldes de entrada del portal (§0, regla 2) quedan así: `/tools/expediente` con
`['relationship_handle']`, `/tools/horarios` con `['service_handle','appointment_handle',
'modality','weekdays','dates','from_local_time','to_local_time']` —el portal recibe del modelo
`hora` o `parte_del_dia` y los convierte en ese par de horas antes de llamar a la base (§3.1)—,
`/tools/appointments/create` con
`['slot_handle']`, `/tools/appointments/reschedule` con `['appointment_handle','slot_handle']`,
`/tools/payments/carry-forward` con `['appointment_handle']` —**no es `parseRescheduleInput`
renombrado**, ése pide un `slot_handle` y aquí no hay hueco—, y `/tools/payments/proof` con
`['appointment_handle']` a secas: los cuatro campos del archivo los pone el portal desde el
renglón del mensaje entrante, no el modelo.

El renombre de `/tools/capabilities` es el único cambio de este documento que toca código ya
desplegado en Kapso: `agenda-psi-complete-inbound` lleva esa ruta escrita dentro.

---

## 6. Los cambios al portero

`private.agent_claim_tool_call(p_turn_id, p_execution_id, p_surface, p_operation,
p_tool_call_key, p_input_sha256, p_is_mutation)` es lo mejor hecho del sistema y se queda casi
entero. Lo que cambia es el catálogo que autoriza, el presupuesto y la maquinaria que sobra.

> **La reescritura ya está completa, y así quedó.**
> `20260826000000_agente_portero_conversacional.sql` sube el presupuesto a 12 y mueve el cierre al
> ordinal 13 con dos constantes nombradas; da de alta `open_dossier`, `search_availability`,
> `create_appointment` y `carry_payment_forward`; muda `attach_payment_proof` a `agent_node`;
> borra las diez lecturas sueltas, `get_availability`, `resume_resource_delivery`,
> `send_fixed_response` y la saga entera; deja `v_tenantless_allowed` en `open_dossier` a secas y
> le añade el `AND NOT v_tenantless_allowed` que le faltaba a `TENANT_NOT_ACTIVE`; y trae **una
> sección 0 de esquema** con los cuatro `ALTER TABLE` y el `DROP INDEX` del cambio 6, sin los
> cuales las dos constantes no sirven de nada. Lo único que queda por revisar antes de aplicarla
> es que las cuatro funciones sigan juntas en ese archivo.

### 6.1 El catálogo nuevo, completo

Pasa de **26 operaciones en 4 superficies a 11 en 2**, de las cuales ocho mutan. Son, exactamente,
las seis herramientas de la §1. La última columna dice si la operación pasa **sin inquilino vivo**:
sin relación resuelta y también con la paciente dada de baja. Las dos cosas son la misma lista, y
hoy no lo son (cambio 7).

| Superficie | Operación | Herramienta | ¿Mutación? | Estado del turno | Sin inquilino vivo |
|---|---|---|---|---|---|
| `agent_node` | `open_dossier` | `abrir_expediente` | no | `active` | **sí** |
| `agent_node` | `search_availability` | `buscar_horarios` | no | `active` | no |
| `agent_node` | `create_appointment` | `reservar` · `agendar` | **sí** | `active` | no |
| `agent_node` | `reschedule_appointment` | `reservar` · `reprogramar` | **sí** | `active` | no |
| `agent_node` | `confirm_appointment` | `gestionar_cita` · `confirmar` | **sí** | `active` | no |
| `agent_node` | `cancel_appointment` | `gestionar_cita` · `cancelar` | **sí** | `active` | no |
| `agent_node` | `switch_appointment_modality` | `gestionar_cita` · `cambiar_modalidad` | **sí** | `active` | no |
| `agent_node` | `carry_payment_forward` | `gestionar_cita` · `pasar_pago` | **sí** | `active` | no |
| `agent_node` | `attach_payment_proof` | `registrar_comprobante` | **sí** | `active` | no |
| `agent_node` | `submit_review` | `enviar_resena` | **sí** | `active` | no |
| `workflow_internal` | `complete_inbound` | — (cierre) | no | `completing`, ordinal 13 | (limpieza: no aplica) |

**Todas exigen el turno en `active`, `search_availability` incluida, y ésa es una corrección.** El
corte anterior de este documento le daba el doble estado `active` o `waiting_external` que
`get_availability` tiene hoy en producción. Ese doble estado era del formulario, que corría con el
turno aparcado. Conversando, quien despierta el turno es el mensaje siguiente, y
`agent_bind_inbound_execution` lo devuelve a `active` antes de que el modelo pueda llamar a nada
—verificado leyendo su `UPDATE` final en producción—. Una excepción de estado que ningún camino
recorre es una puerta abierta sin razón, y se cierra.

### 6.2 Los ocho cambios exactos

**Cambio 1 — sustituir los tres bloques `ELSIF` de autorización por el catálogo de 6.1.** Es el
cuerpo del cambio: once nombres en vez de veintiséis, y el turno en `active` para todos.
Con él desaparecen del `CASE` las superficies `media_adapter` y `flow_data_exchange` enteras.

**Cambio 2 — el alta de crear cita. (Es el cambio sin el cual no hay agente conversacional.)** En
el portero **desplegado** la pareja `('agent_node','create_appointment')` no existe: sus mutaciones
son `confirm_appointment`, `cancel_appointment`, `cancel_then_open_booking_flow`,
`reschedule_appointment`, `switch_appointment_modality`, `resume_resource_delivery` y
`submit_review` (leído hoy del cuerpo). Agendar por texto sale hoy con `TOOL_NOT_ALLOWED`,
siempre. Crear sólo existía como `flow_create_appointment` en `flow_data_exchange`, y **ahí estaba
bloqueada salvo dentro de la maniobra de saga**:

```sql
-- desplegado, dentro del guardia de mutación
OR (v_is_replacement_create AND NOT (
     v_turn.saga_state = 'awaiting_replacement_create'
     AND v_turn.mutation_limit = 2
     AND v_turn.committed_mutation_count = 1
   ))
```

O sea: el formulario sólo podía crear una cita dentro de la maniobra de cancelar-y-volver-a-
agendar, y **agendar normal se rechazaba**. La migración `20260825000000_agent_dominio_fundamento.sql`,
escrita y sin aplicar, ya añade `create_appointment` a `agent_node`. **Aplicarla es todo lo que
hace falta, y hay que vigilar que ningún parche posterior retire `reschedule_appointment`.**

**Cambio 3 — dos altas más: `open_dossier` y `search_availability`.** Ninguna de las dos está en el
portero **desplegado**, y sin ellas el expediente y la búsqueda no pueden reclamar. Las dos ya
están dadas de alta en el portero **escrito** de hoy (`20260826000000`, líneas 304 y 309), con una
diferencia que hay que corregir: ahí `search_availability` exige el turno en `active` a secas,
y tiene que heredar el doble estado que `get_availability` ya tiene hoy en producción.

**Cambio 4 — `attach_payment_proof` se muda a `agent_node`.** Hoy sólo se autoriza en
`media_adapter`, pero quien decide que una imagen es un comprobante es el agente, que vive en
`agent_node`. La superficie tenía que coincidir con quien llama, no con de dónde salió el archivo.
El arreglo ya está escrito en `20260825000000`; falta aplicarlo.

**Cambio 5 — se borra `cancel_then_open_booking_flow` y con ella toda la saga.** Con el cerrojo
del dinero más `pasar_pago`, la paciente que quiere deshacerse de una cita pagada tiene dos
salidas honestas —mover, o adelantar el dinero— y ninguna que queme su pago, así que la maniobra
no tiene para qué nacer. Al quitarla se van, sin dejar hueco:

- la variable `v_is_replacement_create` y sus cuatro apariciones;
- la reserva del ordinal 8 y el guardia `v_turn.tool_call_count > 3`;
- el `mutation_limit` variable —queda fijo en 1— y el `UPDATE` que lo subía a 2;
- los estados `cancel_claimed` y `awaiting_replacement_create` de `saga_state`;
- en `private.agent_finalize_tool_call`, las tres ramas de `saga_state` y la que regresaba el
  `mutation_limit` a 1.

```sql
ALTER TABLE public.agent_turns DROP CONSTRAINT agent_turns_saga_state_check;
ALTER TABLE public.agent_turns ADD CONSTRAINT agent_turns_saga_state_check
  CHECK (saga_state IN ('normal', 'unknown_blocked'));
ALTER TABLE public.agent_turns DROP CONSTRAINT agent_turns_mutation_limit_check;
ALTER TABLE public.agent_turns ADD CONSTRAINT agent_turns_mutation_limit_check
  CHECK (mutation_limit = 1);
```

Es gratis: en toda la historia de producción hay **6 turnos y ninguno salió de `normal`**.

**Y hay que desactivar una bomba en la otra función.** `private.agent_finalize_tool_call` pone
`saga_state = 'awaiting_replacement_create'` en **todo** `flow_create_appointment` que se
finalice, sin condición. Las dos funciones se migran juntas o no se migra ninguna.

**Cambio 6 — el tope de llamadas sube de 8 a 12, y son cuatro lugares, no tres.** La regla 9 del
dueño. Agendar gasta 3, así que quedan nueve de margen para quien pregunta mucho.

```sql
-- 1) el guardia del cuerpo de private.agent_claim_tool_call
IF v_turn.tool_call_count >= 12 THEN … 'TOOL_BUDGET_EXCEEDED' …

-- 2) el contador del turno
ALTER TABLE public.agent_turns DROP CONSTRAINT agent_turns_tool_call_count_check;
ALTER TABLE public.agent_turns ADD CONSTRAINT agent_turns_tool_call_count_check
  CHECK (tool_call_count >= 0 AND tool_call_count <= 12);

-- 3) el rango de ordinales, con el cierre movido de 9 a 13
ALTER TABLE public.agent_tool_calls DROP CONSTRAINT agent_tool_calls_check;
ALTER TABLE public.agent_tool_calls ADD CONSTRAINT agent_tool_calls_check
  CHECK (
    (ordinal BETWEEN 1 AND 12
      AND NOT (surface = 'workflow_internal' AND operation = 'complete_inbound'
               AND NOT is_mutation))
    OR (ordinal = 13 AND surface = 'workflow_internal'
        AND operation = 'complete_inbound' AND NOT is_mutation)
  );

-- 4) el que se olvida: el índice parcial que fija el ordinal del cierre en 9
DROP INDEX public.uq_agent_tool_calls_one_completion_claim;
CREATE UNIQUE INDEX uq_agent_tool_calls_one_completion_claim
  ON public.agent_tool_calls (turn_id)
  WHERE ordinal = 13 AND surface = 'workflow_internal'
    AND operation = 'complete_inbound' AND NOT is_mutation;
```

Y dentro de `agent_claim_tool_call`, en el bloque temprano del cierre, hay **tres `9` literales**,
no uno: el `EXISTS … tool_row.ordinal = 9` que detecta el cierre ya reclamado, el `9` del `INSERT
… VALUES (p_turn_id, p_tool_call_key, 9, …)` y el `'ordinal', 9` del `RETURN`. Los tres pasan a
`13` o el cierre queda inconsistente consigo mismo. El portero escrito de hoy ya los sustituyó por
una constante nombrada, `v_completion_ordinal constant integer := 13`, que es la forma correcta:
**12 y 13 no se pueden separar.**

**Ojo al editar:** ese retorno nunca toca `tool_call_count` y no puede tocarlo, porque el `CHECK`
topa la columna en 12. Quien «simplifique» fusionando las dos rutas revienta el cierre.

> **Los cuatro lugares van en la misma migración, y ya van.**
> `20260826000000_agente_portero_conversacional.sql` tenía `v_budget := 12` y
> `v_completion_ordinal := 13` y **ni un solo `ALTER TABLE`**. Aplicada así, las ocho primeras
> llamadas funcionaban, **la novena abortaba con violación de
> `agent_turns_tool_call_count_check`** —y abortaba *después* de insertar el renglón, así que se
> iba atrás la transacción entera— y el cierre en el ordinal 13 abortaba contra
> `agent_tool_calls_check`, con lo que el turno se quedaba abierto para siempre. Ya está corregido:
> el archivo abre con una **sección 0** que trae los cuatro `ALTER TABLE` y el `DROP INDEX`.
>
> **Y hay una letra chica que casi cuesta la migración entera.** El `CHECK` nuevo de
> `agent_tool_calls` va **`NOT VALID`**, y tiene que ir así: en producción hay **tres renglones
> con `ordinal = 9` y `operation = 'complete_inbound'`** —los tres cierres de agosto— y contra el
> `CHECK` nuevo valen falso, porque el 9 cae en el rango 1..12 que excluye el cierre y no es el 13.
> Un `ADD CONSTRAINT` normal revisa las filas viejas y **aborta la migración entera** con *check
> constraint is violated by some row*. `NOT VALID` exige el 13 a todo lo que se inserte de ahí en
> adelante y deja en paz los tres cierres viejos, que son historia de turnos terminados. El de
> `agent_turns` sí va validado: es más laxo que el que sustituye.

La cuenta de una gestión, con el turno abierto durante toda la conversación:

| Gestión | Ordinales que gasta |
|---|---|
| Agendar | 1 `open_dossier`, 2 `search_availability`, 3 `create_appointment` |
| Agendar preguntando mucho | 1 `open_dossier`, 2..11 diez búsquedas distintas, 12 la reserva |
| Mover | 1 `open_dossier`, 2 `search_availability`, 3 `reschedule_appointment` |
| Confirmar, cancelar, cambiar modalidad, pasar el pago, mandar comprobante, dejar reseña | 1 `open_dossier`, 2 la mutación |
| Consultar algo (cuándo, dónde, cuánto) | 1 `open_dossier` |
| Algo que no se resuelve con datos (fuera de alcance, dinero, no te entendí) | 1 `open_dossier`, y nada más: la frase viene dentro |

El cierre no cuenta: vive en el ordinal 13, fuera del presupuesto, y nunca lo refresca.

**Cambio 7 — una paciente dada de baja hoy no recibe absolutamente nada.** Es el hueco más grave
del portero y sólo se ve leyendo el orden de sus comprobaciones. `v_tenantless_allowed` gobierna
la rama donde el turno **no** tiene paciente. Cuando sí la tiene —el vínculo de WhatsApp existe,
pero `patients.patient_status` ya no es `'active'`— el flujo entra por el `ELSE`, y ahí
`TENANT_NOT_ACTIVE` se devuelve **sin mirar `v_tenantless_allowed`** (verificado leyendo el
cuerpo). Resultado: se le rechaza `open_dossier`, que es **la única** operación que podría decirle
al modelo que está dada de baja y traerle su texto. Ella escribe y no recibe nada. Una línea lo
cierra:

```sql
-- antes
IF NOT v_has_active_tenant THEN
-- después
IF NOT v_has_active_tenant AND NOT v_tenantless_allowed THEN
```

Y la lista sin inquilino vivo queda **en una sola operación**, porque `get_capabilities` y
`select_relationship` dejan de existir, `send_fixed_response` también, y el trabajo de las tres lo
hace `open_dossier`:

```sql
v_tenantless_allowed :=
  p_surface = 'agent_node' AND p_operation = 'open_dossier';
```

**Este cambio ya está en el portero escrito.** Era el único de esta sección que dejaba a una
persona sin respuesta, y eran dos líneas.

**Cambio 8 — el `CHECK` de asignación de `command_id` pierde su rama muerta.** Hoy dice
`(is_mutation OR (surface = 'agent_node' AND operation = 'select_relationship')) = (command_id IS
NOT NULL)`. Sin `select_relationship`, sobra la mitad:

```sql
ALTER TABLE public.agent_tool_calls DROP CONSTRAINT chk_agent_tool_calls_command_allocation;
ALTER TABLE public.agent_tool_calls ADD CONSTRAINT chk_agent_tool_calls_command_allocation
  CHECK (is_mutation = (command_id IS NOT NULL));
```

Y en el cuerpo, `v_needs_command_id := p_is_mutation` a secas. **Los dos ya están escritos**: el
`ALTER` en la sección 0 de `20260826000000` y la línea del cuerpo en su sección 1.

### 6.3 Las bajas, en una lista

| Se borra del portero | Qué era |
|---|---|
| `get_capabilities`, `select_relationship`, `list_services`, `get_booking_eligibility`, `list_upcoming_appointments`, `get_next_appointment`, `get_location`, `get_pending_payments`, `get_appointment_payment_status`, `get_professional_share_profile` | Las diez lecturas sueltas que el expediente absorbe |
| `get_availability` | La sustituye `search_availability` |
| `cancel_then_open_booking_flow` | La maniobra que evapora el dinero |
| `resume_resource_delivery` | Nadie consume `public.jobs` |
| `open_booking_flow` | Era del formulario |
| `flow_list_services`, `flow_get_eligibility`, `flow_get_availability`, `flow_create_appointment` | La superficie `flow_data_exchange` entera |
| `send_fixed_response` | Era de nodo y ningún nodo puede llamarla; los ocho textos viajan en el expediente (§1.7) |
| La superficie `media_adapter` | `attach_payment_proof` se muda a `agent_node` |

Son **diecisiete operaciones retiradas**, las mismas diecisiete rutas de la §5.1. Las cuatro que
entran son `open_dossier`, `search_availability`, `create_appointment` y `carry_payment_forward`.

### 6.4 Lo que no se toca

Los cerrojos verificados que se quedan exactamente como están: la réplica exacta por clave y
forma, `CONTEXT_MISMATCH` con sus seis comparaciones, `TENANT_NOT_ACTIVE` con el vínculo de
WhatsApp y la paciente `active`, `MUTATION_PENDING` con su índice parcial
`uq_agent_tool_calls_one_pending_mutation`, el `command_id` nuevo por mutación con su índice
único, la renovación del turno a `LEAST(sesión.expires_at, now() + 30 min)` en cada reclamo, y el
orden global de candados: turno, luego reclamo.

**Y un margen que conviene ver escrito:** un rechazo del portero —`TOOL_NOT_ALLOWED`,
`MUTATION_BLOCKED`, `MUTATION_PENDING`, `TENANT_*`— sale por `RETURN` **antes** del guardia del
presupuesto y antes del `INSERT`, así que **no gasta ordinal** (verificado leyendo el cuerpo). Lo
que sí gasta ordinal es un intento que llegó a reservar y terminó rechazado por la función de
dominio, como el hueco que se ocupó a media elección.

**Y una regla de operación que no está en el portero pero decide si la cuenta cierra:** después de
una mutación **se cierra el turno, nunca se duerme**. `mutation_limit` viene en 1 y
`agent_turns_check` lo hace ley; si el agente reserva y se queda dormido, el «y de paso cancélame
la del jueves» del mensaje siguiente cae en `MUTATION_BLOCKED`. Cerrar deja que el mensaje
siguiente abra un turno nuevo con su propia mutación.

---

## 7. Forma de los resultados

El falso éxito —el agente presenta la gestión como resuelta y no lo está— es entre el 44 % y el
52 % de todos los fallos en agentes de este tipo, y los modelos con razonamiento extendido son
**peores**, no mejores: racionalizan en vez de verificar. Lo único medido que funciona es
verificación de estado independiente y señales de finalización en **campos estructurados, no en
lenguaje natural** (R29).

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
    "aviso":   "a_tiempo",
    "dinero":  { "estado": "condonado", "importe": "800.00" },
    "mensaje": "Listo, cancelé tu cita del jueves 27 de agosto a las 3:30 de la tarde. No te queda ningún cobro pendiente por ella.",
    "acciones_disponibles": ["buscar_horarios", "reservar"]
  }
}
```

Seis decisiones, cada una contra un mecanismo de fallo conocido:

1. **`aplicado` es booleano, no prosa.** El lenguaje de aserción confiado —«ya quedó», «perfecto,
   listo»— es independiente del resultado en los modelos medidos, así que no se le pregunta al
   modelo si quedó.
2. **`antes` y `despues` son el estado leído después de escribir**, no lo que la función pensaba
   hacer. Es la verificación de estado independiente que baja el falso éxito unas quince veces.
3. **`mensaje` lo redacta el servidor** con lo que de verdad escribió, y el prompt
   obliga a mandarlo palabra por palabra. Ojo con la letra chica: la instrucción de mandarlo tal
   cual va en el **prompt**, no dentro del resultado, porque las instrucciones metidas en un
   `tool_result` pueden ignorarse o marcarse como posible inyección.
4. **`aviso` dice si el cambio llegó a tiempo**, con dos valores cerrados: `a_tiempo` y `tarde`.
   Es lo que el mensaje ya dijo antes de mutar, repetido en campo estructurado.
5. **`dinero` siempre viaja**, aunque no haya dinero. La ausencia del campo es una invitación a
   inventar. `estado` es enum cerrado, y son los siete desenlaces que la matriz del dinero admite:

   | `dinero.estado` | Cuándo |
   |---|---|
   | `sin_cobro` | El pago era `not_applicable`. Nunca se menciona dinero |
   | `condonado` | Canceló a tiempo con pendiente: `waived` + `forgiven` (R19) |
   | `esperando_comprobante` | Hay petición sellada y todavía no hay archivo |
   | `comprobante_recibido` | Hay archivo. **Nunca «pagado» ni «aprobado»** (R27) |
   | `viajo_con_la_cita` | Movió a tiempo: el pago y su comprobante se fueron con ella (R22) |
   | `congelado` | Avisó tarde: el pago se queda como estaba y su profesional decidirá (R20, R21) |
   | `paso_a_la_proxima` | Se trasladó a su próxima sesión del mismo servicio (R24) |

6. **`acciones_disponibles` cierra el círculo**: después de una mutación el turno se cierra y el
   modelo sabe con qué se queda, sin volver a abrir el expediente.

**Las dos lecturas** (`abrir_expediente` y `buscar_horarios`) devuelven
`turn_disposition: "keep_open"` y no llevan `antes`/`despues`. **Las mutaciones devuelven
`close`.** El portal sólo acepta esos dos valores (`handler.ts`, `domainResponse`): cualquier otro
es un `503 SERVICE_UNAVAILABLE`. No hace falta un tercero: quien estaciona el turno entre mensajes
es `/workflow/waiting`, que ya está desplegada y no reclama.

### 7.1 Los dos mensajes que el servidor tiene que redactar distinto

**El cierre de agendar depende de cómo cobra esa profesional**, y de si llenó sus datos de pago:

| Situación | `mensaje` |
|---|---|
| Cobra después | «Listo, Emilio. Aparté tu Psicoterapia individual del miércoles 2 de septiembre a las 12:00, presencial, con Araceli. Son $800.» **No se menciona pago.** |
| Cobra antes, con datos de pago | …más «Para confirmarla, transfiere a {banco}, a nombre de {titular}, CLABE {clabe}, y mándame el comprobante por aquí. Si no llega en 24 horas, la cita se cancela y se libera el horario.» |
| Cobra antes, sin datos de pago | …más «Para confirmarla necesito tu comprobante de pago. Pídele a Araceli los datos para la transferencia y mándame el comprobante por aquí. Si no llega en 24 horas, la cita se cancela.» **Éste es el que aplica hoy con todas.** |

**El cierre de mover tarde no repite el aviso de cobro** —ya se dio antes de mover— pero **sí dice
que la sesión nueva se cobra aparte**, porque congelar deja a la paciente con dos cobros vivos y
callarlo no tiene defensa (R21, y la pregunta 2 de `10-reglas-finales.md`).

### 7.2 El aviso a la profesional, con las claves exactas

Cada mutación escribe un renglón en `public.notifications`. La app arma el texto de la tarjeta con
esas claves y, si falta cualquiera, cae en blanco —y el push también, porque sale del mismo
contenido. **Las funciones escritas del agente hoy ponen `surface`, `command_id`, `starts_at`,
`modality`, `old_starts_at`, `old_modality` y `change_policy_result`: cero claves del contrato, y
nunca el nombre de la paciente.** Llegarían en blanco las seis.

Éstas son las claves reales, leídas hoy de los renglones de producción:

| `type` | Claves exactas del `payload` |
|---|---|
| `appointment_created_by_patient` | `patient_first_name`, `patient_last_name`, `appointment_starts_at`, `appointment_ends_at`, `appointment_modality` |
| `appointment_confirmed` | las mismas cinco |
| `appointment_cancelled_by_patient` | las mismas cinco |
| `appointment_rescheduled_by_patient` | `patient_first_name`, `patient_last_name`, `previous_starts_at`, `previous_modality`, `new_starts_at`, `new_modality` |
| `modality_changed_by_patient` | `patient_first_name`, `patient_last_name`, `appointment_starts_at`, `previous_modality`, `new_modality` |
| `payment_proof_received` | `patient_first_name`, `patient_last_name`, `appointment_starts_at` |

`appointment_modality` va con el literal `'online'` o `'in_person'`, no traducido.
`payment_proof_received` **no lleva el monto**, y los renglones reales lo confirman: la función
escrita se lo mete y el contrato lo prohíbe. Se quita.

El renglón se escribe **en la misma transacción que la mutación**: si no se pudo escribir, la
mutación no ocurrió. Por eso el sobre no lleva ningún campo que diga «sí se avisó»: sería un
booleano que siempre vale `true`. Que el sobre haya llegado con `aplicado: true` ya significa que
su profesional está enterada.

**Y no hay tipo de aviso para «tienes una decisión de cobro pendiente».** `notifications.type` es
texto libre, pero la app pinta en blanco lo que no conoce y es intocable esta ronda. Llega el
aviso de la cancelación y la decisión se encuentra tocando la tarjeta del día.

### 7.3 Lo que el agente no encola

Las funciones escritas encolan `appointment_cancelled` y `appointment_rescheduled` al mismo
teléfono con el que el agente acaba de conversar. En la app de la profesional ese aviso tiene
sentido porque la paciente no estaba presente; por el agente es eco frío. **No se encola nada en
`public.whatsapp_outbox`** (R31). El agente contesta dentro de la sesión abierta; la cola sólo
produce plantillas y sólo la usan los cron.

Con una excepción de lectura, que sí hace falta: el expediente **lee** `whatsapp_outbox` para
saber cuál fue la última plantilla (§2.2). Leer no es encolar.

---

## 8. Errores como remediación

Un error que sólo dice qué falló deja al modelo inventando la salida. Un error que dice qué se
puede hacer ahora la encuentra. La diferencia está medida: guía a nivel de flujo contra guarda por
acción sube el Pass⁴ de 0.42 a 0.62, y en el dominio más estructurado las mutaciones pasan de
0.042 a 0.549. Y la forma importa: los agentes responden mejor a «por favor identifica primero al
usuario» que a «identificación requerida». Enrutamiento positivo, no prohibición desnuda.

**El formato, único para todos:**

```json
{
  "ok": false,
  "error": {
    "codigo": "CITA_CON_DINERO_ADENTRO",
    "que_paso": "Esa cita ya tiene el pago de la paciente adentro y el aviso llegó a tiempo.",
    "que_puedes_hacer": "Ofrécele las dos salidas: moverla a otro día con `buscar_horarios` y `reservar`, o pasar su pago a su próxima sesión con `gestionar_cita` y `pasar_pago`. Si insiste en cancelar, dile que eso lo ve con su profesional.",
    "acciones_disponibles": ["buscar_horarios", "reservar", "gestionar_cita"]
  }
}
```

`que_paso` es para el modelo, no para la paciente: nunca se manda tal cual. `que_puedes_hacer`
nombra la herramienta que sí sirve. `acciones_disponibles` repite el subconjunto vivo, que es lo
que combate el sesgo posicional cuando el modelo tiene que reelegir.

### 8.1 Rechazos de control

Los que devuelve `private.agent_claim_tool_call`, que llegan al portal como `409` y ya vienen
redactados:

| Código del portero | Código para el modelo | `que_paso` | `que_puedes_hacer` |
|---|---|---|---|
| `TURN_NOT_FOUND`, `CLAIM_MISMATCH`, `TURN_EXPIRED`, `CONTEXT_MISMATCH` | `GESTION_CADUCADA` | Esta gestión ya no está viva. | Despídete y pídele que te escriba de nuevo. Si todavía tienes el expediente arriba, usa su frase `se_acabo_el_espacio`. |
| `TOOL_NOT_ALLOWED` | `HERRAMIENTA_NO_DISPONIBLE` | Esa herramienta no aplica en este momento de la gestión. | Escoge una de `acciones_disponibles`. |
| `TENANT_REQUIRED` | `FALTA_ABRIR_EXPEDIENTE` | Todavía no sabemos con qué profesional escribe. | Llama primero a `abrir_expediente`. |
| `TENANT_NOT_ACTIVE` | `PACIENTE_DADA_DE_BAJA` | Esta paciente ya no está activa con su profesional. | Manda la frase `paciente_inactivo` que trajo el expediente y cierra. |
| `MUTATION_PENDING`, `MUTATION_BLOCKED` | `YA_HICISTE_UN_CAMBIO` | En esta gestión ya se aplicó un cambio. | Cuéntale lo que quedó y cierra; si quiere otra cosa, que te escriba de nuevo. |
| `TOOL_BUDGET_EXCEEDED` | `SE_ACABARON_LOS_PASOS` | Ya se usaron todos los pasos de esta gestión. | Cierra con «Se me acabó el espacio de esta consulta. Escríbeme otra vez y seguimos justo desde donde nos quedamos.» No vuelvas a intentar. |

La salida de `PACIENTE_DADA_DE_BAJA` **sólo existe con el cambio 7 de §6.2**; hoy el portero
rechaza también el texto fijo y ella no recibe nada.

### 8.2 Rechazos de dominio

Los devuelve la función de base con `ok: false`. Dieciocho, y cada uno con su remediación:

| Código | `que_paso` | `que_puedes_hacer` |
|---|---|---|
| `CITA_CON_DINERO_ADENTRO` | Esa cita ya tiene el pago de la paciente adentro y el aviso llegó a tiempo. | Ofrécele mover, o pasar su pago a su próxima sesión. Si insiste, dile que cancelarla lo ve con su profesional. |
| `SIN_PROXIMA_CITA` | No hay ninguna sesión futura del mismo servicio a la cual pasar el dinero. | Ofrécele sólo la otra salida: moverla a otro día. |
| `LA_PROXIMA_YA_TIENE_PAGO` | Su próxima sesión ya tiene dinero suyo o una decisión de cobro abierta. | Ofrécele moverla a otro día. |
| `IMPORTES_DISTINTOS` | Los dos cobros no valen lo mismo y el pago no se parte. | Ofrécele moverla: al mover, el dinero completo se va con la cita. |
| `SIN_DINERO_QUE_PASAR` | Esa cita no tiene ningún pago adentro. | Cancélala normal: no hay nada que trasladar. |
| `AVISO_TARDIO_PARA_PASAR_PAGO` | Ya no alcanza el tiempo mínimo para pasar el pago. | Ofrécele moverla, y avísale antes de que se cobra la sesión que mueve. |
| `HORARIO_YA_OCUPADO` | Alguien apartó ese horario mientras ella decidía. | Dile que se acaba de ocupar, vuelve a buscar con los mismos filtros y ofrécele lo que salga. |
| `MODALIDAD_NO_PERMITIDA` | Esta profesional no permite ese cambio de modalidad. | Dile que ese cambio lo tiene que ver con ella directamente. |
| `MODALIDAD_SIN_TIEMPO` | Ya pasó el plazo para cambiar la modalidad de esa cita. | Dile con cuántas horas de anticipación se cambia y que, si lo necesita hoy, lo vea con su profesional. |
| `MISMA_MODALIDAD` | Esa cita ya está en la modalidad que pide. | Confírmaselo con la hora y cierra. |
| `CITA_YA_CONFIRMADA` | Esa cita ya estaba confirmada. | Confírmaselo con la hora y cierra. |
| `CITA_YA_NO_ESTA_PROGRAMADA` | Esa cita ya no está programada. | Vuelve a abrir el expediente y cuéntale lo que sí tiene. |
| `SIN_ARCHIVO` | En este mensaje no vino ninguna imagen ni PDF. | Pídele que mande el comprobante como foto o archivo en un solo mensaje, sin escribir nada más. |
| `COMPROBANTE_NO_PEDIDO` | Ese cobro no tiene ninguna petición de comprobante abierta. | Dile que su profesional todavía no le pide comprobante para esa cita. |
| `YA_HAY_COMPROBANTE` | Ese cobro ya tiene un comprobante recibido. | Dile que ya lo tenemos y que su profesional lo va a revisar. **Nunca «pagado».** |
| `RESENA_YA_ENVIADA` | Esta paciente ya dejó su reseña. | Agradécele y cierra. |
| `HANDLE_VENCIDO` | Ese identificador es de un mensaje anterior, o ya venció. | Vuelve a llamar `abrir_expediente` y usa los identificadores que traiga. **Ésta es una de las dos razones por las que el expediente va encendido siempre (§1.8): si no, esta salida no existe.** |
| `NO_PUDIMOS_SABER` | No sabemos si el cambio se aplicó. | No le digas que quedó ni que falló. Dile que lo estamos verificando y que su profesional le confirma. |

**Tres errores que estaban y ya no pueden ocurrir**, y conviene decir por qué:

- **`SIN_HUECOS`.** Un rango sin espacio libre ya no es un error: es una respuesta legítima de
  `buscar_horarios` con `hay: false` y uno de los seis motivos, cada uno con su salida (§3.3).
- **`SIN_LUGAR_A_DONDE_IR`.** La dirección y la liga viajan en el expediente, en `profesional.donde`,
  y cuando las dos van en `null` el modelo ya lo sabe antes de abrir la boca. Que ninguna de las
  cinco profesionales tenga las dos a la vez hace esto frecuente, no raro.
- **`FALTA_MODALIDAD`.** La modalidad se decidió al buscar y viaja dentro del identificador de
  hueco (§1.3).

**Cancelar tarde sí se puede, y es importante que se pueda.** Con dinero adentro y aviso a tiempo
no se cancela nunca —eso lo cubre `CITA_CON_DINERO_ADENTRO`—, pero fuera de plazo rechazar la
cancelación deja el peor de los caminos: la paciente avisó que no puede ir, nadie registró nada,
la cita sigue en pie, y su profesional se entera el día de la cita cuando no llega. Cancelar tarde
congela el pago y abre `late_change_decision = 'pending'`, que es el único circuito de cobro por
aviso tardío que funciona de punta a punta.

Con una advertencia que hay que dejar por escrito: esas decisiones son **muy difíciles de
encontrar** en la app de la profesional —no salen en Cobros, no ponen punto en el calendario, y el
aviso se borra solo a las 24 h; hay que tocar la tarjeta del día—. Hoy no importa porque **hay cero
pagos en `pending`** de decisión tardía: el agente va a ser su único productor, y va a producirlas
todas. Arreglar esa pantalla es de otra ronda, pero es la consecuencia directa de esta decisión.

`NO_PUDIMOS_SABER` es el único caso donde el modelo tiene prohibido afirmar cualquier cosa.
Corresponde al `503 SERVICE_UNAVAILABLE` del portal y al `outcome = 'unknown'` del portero, que
además deja el turno en `unknown_blocked` y bloquea cualquier otra mutación. Es deliberadamente
fallar cerrado: nadie afirma que un efecto ocurrió.

---

## 9. Permisos

`agenda_psi_agent_owner` tiene `BYPASSRLS`, así que **RLS no interviene**: lo único que importa
son los `GRANT`. Y `postgres` es miembro de `agenda_psi_agent_owner`, no al revés, así que el rol
del agente no hereda nada de nadie.

### 9.1 Lo que ya tiene, verificado hoy

Leído de `information_schema.table_privileges`:

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
| `public.whatsapp_links` | SELECT |

**Nueve tablas, y ninguna de escritura de dominio.** Funciones: `EXECUTE` sobre las cuatro
privadas del portero y las nueve públicas de control.

Las cuatro tablas del propio agente —`public.agent_turns`, `public.agent_tool_calls`,
`public.agent_option_tokens` y `private.agent_token_key_registry`— no aparecen y no es un hueco:
**son suyas**, el rol es su dueño (verificado en `pg_class`), y un dueño no necesita permiso.
`agent_sessions`, en cambio, es de `postgres`, y por eso sí lleva sus tres `GRANT`.

### 9.2 Lo que falta, tabla por tabla y columna por columna

**Aquí se corrige otra vez el corte anterior.** Decía que seis de estos permisos «no existen en
ninguna migración». Se volvió a grepear el directorio entero de migraciones y **los seis están
escritos**: `professional_appointment_policies` (línea 67), `blocked_slots` (82),
`professional_connections` (83), `recurrence_series` (102) y `DELETE` en `payment_proofs` (178),
los cinco en `20260825000000_agent_dominio_fundamento.sql`; y `whatsapp_outbox` en
`20260826003000_agente_expediente.sql` (línea 46), escrito hoy y por columna
—`to_phone, template_key, payload, status, sent_at`—, que es mejor que la tabla entera.

Así que **la lista de abajo no es «lo que falta escribir»: es «lo que falta aplicar»**, y esa
distinción importa porque cambia quién tiene trabajo. En la base desplegada el rol del agente
tiene nueve tablas y ninguna de escritura de dominio (§9.1); todo lo demás vive en el árbol.

```sql
-- ── LECTURAS ───────────────────────────────────────────────────────────────
-- La primera es bloqueante: sin ella el expediente no puede calcular ni un
-- solo plazo (§2.7).
GRANT SELECT ON public.professional_appointment_policies TO agenda_psi_agent_owner;
GRANT SELECT ON public.patient_services                  TO agenda_psi_agent_owner;
GRANT SELECT ON public.payment_proofs                    TO agenda_psi_agent_owner;
GRANT SELECT ON public.reviews                           TO agenda_psi_agent_owner;

-- Ahí viven tres de las cuatro piezas del aviso de recurrencia (frequency,
-- weekday, start_time). Está escrito, pero hay tres asertos de prueba y un
-- comentario de migración que prohíben este permiso a propósito: hay que
-- invertirlos a «lee, pero no escribe», que es la garantía que importa, o la
-- prueba tumba el despliegue.
GRANT SELECT ON public.recurrence_series                 TO agenda_psi_agent_owner;

-- De aquí sale `ultima_plantilla`, la pista que sustituye al payload de un botón
-- (§2.2). Sólo SELECT, y sólo cinco columnas: el agente nunca encola nada (R31).
GRANT SELECT (to_phone, template_key, payload, status, sent_at)
  ON public.whatsapp_outbox TO agenda_psi_agent_owner;

-- Las dos que necesita private.assert_appointment_slot_available, que es
-- SECURITY INVOKER (prosecdef = false, verificado) y corre con los privilegios
-- de quien la llama.
GRANT SELECT ON public.blocked_slots            TO agenda_psi_agent_owner;
GRANT SELECT ON public.professional_connections TO agenda_psi_agent_owner;

-- ── CITAS ──────────────────────────────────────────────────────────────────
-- Crear (agendar y la cita nueva de mover) y cambiar estado o modalidad.
-- `series_id` va en la lista porque las funciones escritas lo nombran en su
-- INSERT aunque siempre con NULL: Postgres cobra el permiso por columna
-- nombrada, no por valor escrito, y sin él revientan.
-- `confirmed_at` y `confirmation_source` NO van en el INSERT: la cita del
-- agente nunca nace confirmada. La regla deja de depender de la disciplina de
-- quien escriba la función y pasa a ser un permiso que no existe.
GRANT INSERT (professional_id, patient_id, service_id, status, modality,
              starts_at, ends_at, agreed_price, origin,
              series_id, rescheduled_from_appointment_id, is_editable)
  ON public.appointments TO agenda_psi_agent_owner;
GRANT UPDATE (status, modality, is_editable, confirmed_at, confirmation_source,
              cancel_reschedule_actor, cancelled_rescheduled_at,
              change_policy_result, updated_at)
  ON public.appointments TO agenda_psi_agent_owner;

-- ── PAGOS ──────────────────────────────────────────────────────────────────
-- Se crea uno por cita nueva, se traslada al mover a tiempo y se congela al
-- mover o cancelar tarde. El agente nunca escribe 'credited' ni resuelve una
-- decisión tardía: `late_change_decision_resolved_at` y `_resolved_by` NO se
-- conceden (R28).
-- `amount` y `charge_timing` van en el INSERT —un pago nuevo tiene que nacer
-- con su importe— pero NO en el UPDATE: la única operación que querría
-- cambiarlos es pasar el pago, y ahí los dos importes ya son idénticos por
-- AMOUNT_MISMATCH, así que no hay nada que reescribir.
GRANT INSERT (appointment_id, professional_id, amount, status, method,
              charge_reason, charge_timing, waive_reason, proof_requested_at,
              resolved_at, late_change_decision)
  ON public.payments TO agenda_psi_agent_owner;
GRANT UPDATE (status, method, charge_reason, waive_reason, proof_requested_at,
              resolved_at, late_change_decision, updated_at)
  ON public.payments TO agenda_psi_agent_owner;

-- ── COMPROBANTES ───────────────────────────────────────────────────────────
GRANT INSERT (payment_id, storage_object_path, mime_type, size_bytes, checksum)
  ON public.payment_proofs TO agenda_psi_agent_owner;

-- Escrito en 20260825000000 línea 178, y sin él pasar el pago revienta.
-- El comprobante se **mueve**, no se copia: DELETE y luego INSERT sobre el pago
-- destino, en la misma transacción. Sin este permiso la función aborta DESPUÉS
-- de cancelar la cita y la transacción entera se va atrás. Es el único DELETE
-- de toda la superficie del agente, y es seguro: `payment_proofs` tiene
-- UNIQUE (payment_id) y la fila que borra es la que acaba de leer.
GRANT DELETE ON public.payment_proofs TO agenda_psi_agent_owner;

-- ── BITÁCORA DEL PAGO ──────────────────────────────────────────────────────
GRANT INSERT (payment_id, event_type, from_status, to_status, actor,
              command_id, metadata)
  ON public.payment_events TO agenda_psi_agent_owner;

-- ── EL AVISO A LA PROFESIONAL, con las claves de §7.2 ───────────────────────
GRANT INSERT (type, appointment_id, patient_id, professional_id, payload)
  ON public.notifications TO agenda_psi_agent_owner;

-- ── RESEÑAS ────────────────────────────────────────────────────────────────
-- El UPDATE no sobra: `uq_review_patient_professional` es única por par, y
-- `request_patient_review` deja explícito que «una fila sin submitted_at es una
-- reseña empezada y nunca enviada». Si esa fila existe, insertar revienta.
GRANT INSERT (professional_id, patient_id, patient_first_name, rating,
              comment, submitted_at)
  ON public.reviews TO agenda_psi_agent_owner;
GRANT UPDATE (patient_first_name, rating, comment, submitted_at, updated_at)
  ON public.reviews TO agenda_psi_agent_owner;

-- ── LAS DOS ENVOLTURAS DELGADAS SOBRE EL DOMINIO EXISTENTE ─────────────────
GRANT EXECUTE ON FUNCTION public._get_internal_availability_core(
  uuid, uuid, date, public.modality, uuid, boolean, boolean
) TO agenda_psi_agent_owner;
GRANT EXECUTE ON FUNCTION private.assert_appointment_slot_available(
  uuid, timestamptz, timestamptz, public.modality, uuid
) TO agenda_psi_agent_owner;
```

**Por qué la disponibilidad no pide `weekly_schedules`, `special_schedules` ni sus bloques:**
`public._get_internal_availability_core` es `SECURITY DEFINER` propiedad de `postgres` (verificado
en `pg_proc.prosecdef`), así que las lee con sus propios privilegios. Basta el `EXECUTE`.

### 9.3 Lo que se quita de las migraciones escritas

| Permiso escrito | Por qué se quita |
|---|---|
| `INSERT` en `public.whatsapp_outbox` | El agente contesta dentro de la sesión abierta. Encolar `appointment_cancelled` al mismo teléfono con el que acaba de conversar es eco (R31). El `SELECT` de §9.2 **sí** se queda: leer no es encolar. |
| `INSERT` en `public.jobs` | No hay consumidor de `public.jobs` en la base desplegada, y `tg_jobs_solo_recursos_bi` descarta en silencio todo lo que no sea de recursos. Los `INSERT INTO jobs` de crear y mover ya son código muerto. |
| `SELECT`/`UPDATE` en `resource_delivery_batches` y `resource_assignments` | La operación de recursos se sale del catálogo. |
| `INSERT` en `public.command_log` | El libro mayor del agente es `public.agent_tool_calls`, con su clave de llamada y su `command_id`. Dos bitácoras para lo mismo es complejidad de más. |
| `UPDATE (updated_at)` en `public.professionals` (`20260825000000` línea 252) | Servía para tomar un candado de fila y serializar la agenda. No hace falta: `excl_appointments_no_overlap` ya impide el traslape, y la comprobación amable la da `assert_appointment_slot_available`. **Se quita el `UPDATE`, no el `SELECT`:** el `GRANT SELECT` por columna de los tres datos de pago (`20260826001000` línea 52) se queda, con el nombre de columna corregido según §2.5. |
| `EXECUTE` en `get_marketplace_profile`, `get_marketplace_reviews`, `search_marketplace_profiles` | El marketplace no entra en esta ronda. |
| `GRANT CREATE ON SCHEMA public/private` | Se otorga al principio de cada migración y se revoca al final. Está bien, pero debe quedar revocado en **todas**, sin excepción. |

### 9.4 El agujero que hay que nombrar

`20260825003000_agent_citas_mutaciones.sql` —la migración de **todas** las mutaciones de cita:
crear, confirmar, cancelar, reprogramar, cambiar modalidad— **no tiene un solo `GRANT` de tabla**.
Sólo otorga `CREATE ON SCHEMA public` y el `EXECUTE` de sus funciones. Si se despliega sola, las
cinco funciones existen, el portal las llama, y todas revientan con permiso denegado sobre
`public.appointments` en la primera escritura. Depende por completo de que
`20260825000000_agent_dominio_fundamento.sql` se haya aplicado antes. Los permisos de escritura de
citas y pagos deben vivir en esa misma migración, junto a las funciones que los usan.

Y el mismo agujero se repite en las tres migraciones escritas hoy: `20260826002000` (búsqueda),
`20260826003000` (expediente) y `20260826004000` (pasar el pago) sólo otorgan `CREATE ON SCHEMA`
y el `EXECUTE` de su propia función —`20260826003000` es la única que además concede el `SELECT`
por columna de `whatsapp_outbox`—. Ninguna es autónoma: **el orden de aplicación es una
dependencia real y no está declarada en ningún lado**. Recomendación: que cada migración lleve
sus propios `GRANT`, aunque se repitan; un `GRANT` repetido no cuesta nada y una migración que se
aplica sola y revienta a medias cuesta un rollback en producción.

---

## 10. Lo que queda para el dueño

Cada uno con su recomendación y el supuesto con el que sigue este catálogo, para que nada se
bloquee.

1. **La rama de modalidad cruzada** —«presencial no tengo mañanas, en línea sí»—. Sin decidir.
   *Supuesto de este catálogo:* `buscar_horarios` recibe una modalidad y devuelve una modalidad.
   Si ella pregunta por la otra, es otra llamada, y caben doce.

2. **Quién cancela la cita de prepago que nunca recibió su comprobante.** La petición se sella al
   crear la cita, así que hay un reloj corriendo: a las 24 h un trabajo debería cancelar. **Ese
   trabajo no existe:** `cron_prepay_proof_request` es un cascarón retirado que sólo levanta un
   `RAISE WARNING` y no está en `cron.job`. Sin él, una cita de Araceli sin comprobante se queda
   programada para siempre y su hueco no vuelve a la agenda. **Recomendación: escribirlo en esta
   ronda**, con 24 h fijas desde que se pidió el comprobante y **nunca sobre una cita que ya
   empezó** —«lo que ocurra primero» cancelaría una sesión en curso, porque entre `starts_at` y
   `ends_at` la cita sigue `scheduled`. Ninguna herramienta de este documento depende de él, pero
   sin él el prepago queda a medias.

3. **Los tres datos de pago están vacíos en las cinco fichas** (§2.5). Las columnas ya existen; lo
   que falta es la pantalla que las llene. **Recomendación: que entre en esta ronda**, porque es
   una pantalla chica y sin ella el único cierre de prepago posible manda a la paciente a pedirle
   los datos a su profesional por otro canal.

4. **Quién publica las reseñas.** Ninguna función desplegada escribe `moderation_status`; la
   moderación es manual, fuera de SQL, y en producción hay cero reseñas. *Supuesto:* entra, porque
   la autoridad la tiene con flujo y texto propios. Si el dueño decide que nadie modera, se borran
   §1.6, la operación `submit_review`, la ruta `/tools/reviews/submit`, el error `RESENA_YA_ENVIADA`
   y el campo `resena` del expediente, y el catálogo baja a cinco herramientas.

5. **El interruptor de «mis pacientes pueden agendar solas» es de una sola dirección.**
   `save_weekly_schedules` lo pone en `true` y nada lo apaga. El expediente lo lee y lo respeta,
   pero si una profesional quiere cerrar su agenda no puede. Material de otra ronda.

6. **Cancelar y mover tarde producen decisiones de cobro que la profesional casi no puede
   encontrar** (§8.2). No bloquea nada de este catálogo. **Recomendación: mirarlo antes de encender
   el agente para las cinco profesionales**, porque el primer mes va a llenar esa pantalla.

7. **Nada de esto se puede probar contra producción:** cero series, cero comprobantes, cero citas
   futuras vivas, cero identificadores emitidos y cero mutaciones del agente en toda la historia
   —los seis turnos que existen son `normal`, y sus seis llamadas son tres `get_capabilities` y
   tres `complete_inbound`, todas lecturas (verificado hoy sobre `agent_tool_calls`)—.
   **Recomendación: sembrar un juego de datos en una rama de Supabase antes de escribir** —dos
   series, una cita suelta del mismo servicio, un comprobante y un prepago—. Es el riesgo real de
   esta ronda y no se tapa con más lectura.

   Y con un aviso que este corte deja por escrito: **los tres defectos de despliegue que este
   documento denunciaba ya están arreglados en el árbol de trabajo, y conviene saber cuáles eran
   para no reintroducirlos.** El portero subía el presupuesto a 12 sin mover las tres
   restricciones que lo topan en 8 —hoy trae su sección 0, y el `CHECK` de ordinales va `NOT VALID`
   por los tres cierres viejos que hay en producción (§6.2)—; la migración de datos de pago creaba
   una columna duplicada al escribir `payment_clabe` donde la base dice `payment_clabe_or_account`
   (§2.5); y ninguna de las migraciones de hoy era autónoma en permisos (§9.4), que sigue siendo la
   dependencia de orden que hay que respetar al aplicar.

8. **Que dos herramientas de Kapso puedan compartir una función.** Todo el catálogo descansa en
   eso (§0). La documentación de Kapso no lo dice ni lo prohíbe, y el runtime desplegado ya
   multiplexa dos caminos en un archivo. **Se comprueba antes de escribir código, no después:**
   basta declarar dos herramientas apuntando a la misma función y abrir la ejecución. **Y hay que
   comprobarlo de verdad, porque el plan B del corte anterior no existe:** el plan Free admite
   cinco Workers, dos están ocupados por la plomería —`agenda-psi-complete-inbound` y
   `agenda-psi-mark-inbound-waiting`— y quedan **tres libres**. Siete herramientas sueltas no
   caben en tres. Si multiplexar no se pudiera, la salida es subir de plan o fundir herramientas,
   no repartirlas. Se comprueba antes de escribir código. El catálogo no
   cambia en ninguno de los dos casos.
