# El formulario de WhatsApp

Un solo formulario, dos modos: **agendar** una cita nueva y **mover** una que ya existe.
Dos pantallas. Reemplaza por completo a `kapso/flows/agendar-cita.flow.json`,
`kapso/flows/reprogramar-cita.flow.json`, `kapso/functions/agenda-psi-flow-agendar.js` y
`kapso/functions/agenda-psi-flow-reprogramar.js`. Y también al borrador
`kapso/flows/agenda-psi-citas.flow.json` que quedó suelto en el árbol de trabajo, que
declara `7.3 / 4.0` y trae `include-days`: el JSON bueno es el de §3, y el viejo hay que
sobrescribirlo antes de que alguien lo suba.

Todo lo que aquí se afirma sobre la plataforma sale de
`docs/hallazgos-auditoria-agente.md`. Todo lo que se afirma sobre los datos está medido
contra `ssyzfeadyrczlzjbvxyl` el 2026-08-26 y se dice con el número al lado. Lo que se
afirma sobre componentes de Meta está leído de su referencia de componentes, y lo que se
afirma sobre las funciones del portero está leído del cuerpo desplegado, no de las
migraciones del árbol de trabajo.

---

## 0. Qué cambia y por qué

| Antes (dos borradores) | Ahora | Razón |
|---|---|---|
| Dos Flows publicados | Uno | Dos Flows publicados son dos ciclos de clonar-y-republicar, dos identificadores que mantener y **dos workers de Cloudflare**. Con 4 de 5 workers usados en el plan Free, dos Flows no dejan sitio para clonar. Ver §8. |
| Dos funciones de datos casi idénticas | Una | No hay código compartido entre funciones de Kapso: dos archivos gemelos divergen solos. |
| Una pantalla con servicio, modalidad, día y hora | Dos pantallas | La primera pantalla es una sola pregunta y se pinta sin ir al servidor. La segunda es el calendario. |
| Servicio y modalidad como dos listas | Una lista de combinaciones | La combinación que la profesional no ofrece **no existe** en la lista. Y no es cosmético: para `0420408e` la valoración presencial tiene 39 días abiertos y la misma valoración en línea sólo 15 (medido). La modalidad cambia el calendario, así que hay que saberla **antes** de pintarlo. |
| `If` alrededor de la modalidad | Ningún `If` | `CalendarPicker` no puede ir dentro de un `If`, y sin la lista de modalidades separada el `If` sobraba. Un componente menos, una rama menos. |
| Modalidad elegible al mover | La modalidad no se toca al mover | Cambiar de modalidad tiene su propia dirección permitida y su propia anticipación (`min_lead_to_change_modality_minutes`, 720 min para Miranda). Meterlo en la misma mutación que el traslado son dos reglas en un acto. Cambiar de modalidad se queda como operación conversacional. |
| Cuatro operaciones de formulario en el cerrojo | **Dos**, y las dos mutan: `flow_create_appointment` y `flow_reschedule_appointment`, servidas por la misma ruta | El libro mayor no admite más. `agent_tool_calls` tiene `CHECK (ordinal entre 1 y 8)` —el 9 está reservado al cierre— y `UNIQUE (turn_id, ordinal)`, y `agent_turns` tiene `CHECK (tool_call_count <= 8)`. Un formulario que registrara cada toque reventaría la restricción. Los intercambios de lectura se autentican con el identificador del formulario y no pasan por el libro mayor; sólo la mutación se apunta. Ver §5 y §10. |
| El agente manda el formulario con `send_interactive` | Lo manda el servidor | `send_interactive` es un **tipo de nodo de workflow** de Kapso, no una herramienta del agente ni algo que una función pueda invocar. El formulario sale por la API de mensajes de Kapso (`POST /meta/whatsapp/v24.0/{phone_number_id}/messages`), desde la misma ruta que decide abrirlo. Ver §5.0. |
| Un día preseleccionado con sus horas ya servidas | El calendario se abre sin día elegido | Preseleccionar obliga a averiguar, en la petición que Meta cronometra, cuál es el primer día que de verdad tiene huecos, y eso son varias corridas del cálculo exacto y una rama de reserva por si ninguna sale. Ella toca el día que ya iba a mirar. Ver §5.1. |

---

## 1. Las dos pantallas

Más de cuatro pantallas baja la finalización, y cada pantalla extra es un viaje al
servidor con el reloj de 10 segundos de Meta corriendo. Aquí son dos, y la primera se
abre **sin ningún viaje**: el mensaje que lleva el formulario ya trae los datos de esa
pantalla dentro.

### Pantalla 1 — `ELEGIR`

Una sola pregunta. Todo su texto viene en los datos, y eso es lo que la vuelve un
formulario de dos modos en vez de dos formularios.

|  | Modo agendar | Modo mover |
|---|---|---|
| `titulo` | «Agendar una cita» | «Mover tu cita» |
| `etiqueta` | «¿Qué agendamos?» | «¿Cuál cita mueves?» |
| `opciones[].title` | Nombre del servicio | «mié 2 sep, 7:00 p.m.» |
| `opciones[].description` | «En línea · 50 min · $800» | «Psicoterapia individual · En línea» |
| `nota` | El plazo de anticipación de **esa** profesional, en horas | «Tu pago se va contigo a la cita nueva.», sólo si esa cita tiene dinero adentro |
| `boton` | «Ver horarios» | «Ver horarios» |

**Dos límites de `Dropdown` mandan sobre esta copia, y los dos están leídos de la tabla de
límites de la referencia de componentes de Meta: título 30, descripción 300, etiqueta 20,
metadata 20, mínimo 1 opción, máximo 200.**

*El título de una opción tiene 30 caracteres.* «Psicoterapia individual · En línea» son 33
y no cabe. Por eso el nombre del servicio va en el título y la modalidad, la duración y el
precio en la descripción, que admite 300. Eso además resuelve un choque real de producción:
la profesional `0deec2d6` tiene **dos servicios activos llamados igual**, «Psicoterapia
individual», uno de $800 y otro de $900. En la lista se ven dos renglones con el mismo
título y descripciones distintas —«En línea · 50 min · $800» y «En línea · 50 min · $900»—
que es exactamente lo que ella configuró. Y `a608026a` tiene **tres servicios presenciales
activos llamados «test»**, dos de ellos sin costo: se distinguen por duración y precio, no
por nombre.

*La etiqueta del `Dropdown` tiene 20 caracteres.* Es un límite distinto y más apretado, y
es la razón de que la pregunta del modo agendar sea «¿Qué agendamos?» (15) y no «¿Qué
quieres agendar?», que son 21. «¿Cuál cita mueves?» son 18 y cabe.

**Un servicio puede valer para las dos modalidades.** `services.modality` es
`online | in_person | both`, así que la lista de combinaciones sale de los servicios
activos expandiendo los `both` en dos renglones. Con los datos de hoy son **18
combinaciones** entre las cinco profesionales: seis de `0deec2d6`, cinco de `a608026a`,
tres de `0420408e`, tres de `7e2d0ab6` y una de `2fab7e5a`.

**La nota del modo agendar sale de la fila de la profesional, nunca de una constante.**
`patient_min_booking_lead_minutes` vale 2880 para tres de las cinco y 1440 para las otras
dos. Un texto fijo que diga «48 horas» le miente a la mitad de las pacientes.

**La nota del modo mover sólo aparece cuando esa cita trae dinero adentro** —pago
acreditado o comprobante recibido—. Prometer que «tu pago se va contigo» en una cita que se
cobra después de la sesión y todavía no tiene nada es una promesa vacía.

Qué dispara: el botón manda `data_exchange` con `paso: "eleccion"` y el identificador
opaco de la opción. La respuesta es la pantalla 2 ya armada.

**El formulario nunca se abre vacío.** Si no hay ninguna combinación agendable, o no hay
ninguna cita que mover, el servidor se niega a abrirlo y el agente contesta por chat. Eso
evita el único caso en que `Dropdown` no puede pintarse: sin opciones.

### Pantalla 2 — `CUANDO`

El resumen de lo que eligió, el calendario, la hora y el botón.

| Dato | Para qué |
|---|---|
| `contexto` | El identificador opaco de la opción, para que viaje al siguiente intercambio. |
| `resumen_titulo` | «Psicoterapia individual · En línea» |
| `resumen_detalle` | Duración, precio y, en prepago, cómo se aparta el lugar. |
| `min_fecha`, `max_fecha` | La ventana de 60 días. `min_fecha` ya trae sumada la anticipación de la profesional. |
| `dias_cerrados` | Los días de la ventana que no se ofrecen. |
| `horarios` | Las horas del día que tocó. Al abrir, un solo renglón apagado: «Elige un día». |
| `nota_pie` | Una línea que **nombra el día que está en pantalla** y dice qué pasó: «Horarios del viernes 28 de agosto», «Ese día se llenó», «Ese horario se acaba de ocupar». |
| `puede_confirmar` | Apaga el botón cuando no hay hora que confirmar. Al abrir siempre es falso. |
| `boton` | «Confirmar cita» / «Mover la cita» |

**La pantalla 2 se abre sin día elegido.** No hay `dia_inicial`. Preseleccionar un día
obliga a servir sus horas junto con la pantalla —`on-select-action` no se dispara por un
valor inicial—, y eso significa correr el cálculo exacto sobre el primer día abierto, y
sobre el siguiente si salió vacío, y así hasta encontrar uno o rendirse: varias corridas y
una rama de reserva, todo dentro de la petición que Meta cronometra y cuya guía propia es
responder en menos de un segundo. Lo que compra es que ella vea horas sin tocar el
calendario. Lo que cuesta es un toque que iba a dar de todos modos. Se quita.

Qué dispara:

- **Tocar un día** → `data_exchange` con `paso: "dia"`. Vuelve la misma pantalla con las
  horas de ese día.
- **Tocar el botón** → `data_exchange` con `paso: "confirmar"`. Aquí es donde la cita se
  crea o se mueve, dentro del formulario, antes de cerrarlo.

**El calendario no es un campo obligatorio.** `required` en `CalendarPicker` es opcional y
su valor por omisión es falso, y aquí se deja así a propósito: el día no viaja en ningún
envío —el identificador del horario ya lo lleva dentro— y un campo obligatorio vacío
bloquearía el botón por su cuenta, compitiendo con `puede_confirmar`. Un solo mecanismo
manda sobre el botón. El `Dropdown` de horarios sí es obligatorio: es lo único que se manda.

**No hay `include-days`.** Un solo mecanismo pinta el calendario: `unavailable-dates`
lista todos los días de la ventana que no se ofrecen, fines de semana incluidos. Con eso
un sábado de trabajo excepcional —que `include-days` habría escondido— aparece
normalmente. El costo es tamaño: para una profesional de lunes a viernes son 18 fechas en
60 días, unos 230 bytes, contra un tope de 10 MB. Medido el 2026-08-26: la ventana de
`0deec2d6` en línea son 42 días ofrecidos y 18 cerrados. Meta pide además que cada fecha de
`unavailable-dates` caiga entre `min-date` y `max-date`, y por construcción todas caen: la
lista se arma sobre la misma ventana.

**El botón se apaga desde los datos** (`"enabled": "${data.puede_confirmar}"`). Cuando no
hay horas que ofrecer —al abrir, o porque el día que tocó salió vacío—, `horarios` lleva un
solo renglón deshabilitado que dice por qué —`Dropdown` exige al menos una opción y admite
`enabled` por renglón— y el botón queda muerto. La paciente ve la razón, no un error.

---

## 2. Las versiones: Flow JSON 7.2 y Data API 3.0

Meta acepta hoy Flow JSON 5.1, 6.0-6.3, 7.0-7.2 y 7.3 (recomendada), y Data API 3.0 y
4.0 (recomendada). Kapso demuestra hasta **7.2 / 3.0** y **no menciona 4.0 en ninguna
parte** de su documentación.

**Se elige 7.2 / 3.0.** El argumento no es de gusto: entre nosotros y Meta hay una capa
de Kapso que descifra, verifica la firma, envuelve y reenvía, y que documenta la
respuesta como `{ version: "3.0", screen, data }`. Adoptar una versión de Data API que
Kapso nunca ha ejercido pone esa capa a interpretar un contrato que no conoce, y el modo
de fallo de este sistema es silencioso: un Flow que se queda estático sin dar error.
7.3 tampoco compra nada — `CalendarPicker` existe desde 6.1 y ningún componente de este
diseño nació después de 7.2. Se sube de versión cuando Kapso demuestre 7.3/4.0, no antes.

`data_api_version` va **en la raíz**. Sin él el Flow se queda estático en silencio: el
endpoint queda sano y sin uso, que es el fallo más caro de diagnosticar de toda esta
plataforma.

`routing_model` es obligatorio con endpoint de datos.

---

## 3. El Flow JSON

Listo para pegar. Nombre del Flow: `agenda-psi-citas`.

```json
{
  "version": "7.2",
  "data_api_version": "3.0",
  "routing_model": {
    "ELEGIR": ["CUANDO"],
    "CUANDO": []
  },
  "screens": [
    {
      "id": "ELEGIR",
      "title": "Tu cita",
      "data": {
        "titulo": {
          "type": "string",
          "__example__": "Agendar una cita"
        },
        "etiqueta": {
          "type": "string",
          "__example__": "¿Qué agendamos?"
        },
        "opciones": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": { "type": "string" },
              "title": { "type": "string" },
              "description": { "type": "string" }
            }
          },
          "__example__": [
            {
              "id": "7b1c0f4e-2a55-4d61-9a0e-8f2c1d3b6a90",
              "title": "Psicoterapia individual",
              "description": "En línea · 50 min · $800"
            },
            {
              "id": "c4d9e2a1-88b3-4f07-bd12-6e5a09c7f431",
              "title": "Psicoterapia individual",
              "description": "Presencial · 50 min · $800"
            }
          ]
        },
        "nota": {
          "type": "string",
          "__example__": "Se agenda con 48 horas de anticipación."
        },
        "boton": {
          "type": "string",
          "__example__": "Ver horarios"
        }
      },
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          {
            "type": "TextSubheading",
            "text": "${data.titulo}"
          },
          {
            "type": "Dropdown",
            "name": "opcion",
            "label": "${data.etiqueta}",
            "required": true,
            "data-source": "${data.opciones}"
          },
          {
            "type": "TextCaption",
            "text": "${data.nota}"
          },
          {
            "type": "Footer",
            "label": "${data.boton}",
            "on-click-action": {
              "name": "data_exchange",
              "payload": {
                "paso": "eleccion",
                "opcion": "${form.opcion}"
              }
            }
          }
        ]
      }
    },
    {
      "id": "CUANDO",
      "title": "Día y hora",
      "terminal": true,
      "data": {
        "contexto": {
          "type": "string",
          "__example__": "7b1c0f4e-2a55-4d61-9a0e-8f2c1d3b6a90"
        },
        "resumen_titulo": {
          "type": "string",
          "__example__": "Psicoterapia individual · En línea"
        },
        "resumen_detalle": {
          "type": "string",
          "__example__": "50 minutos · $800. Te llega un recordatorio un día antes."
        },
        "min_fecha": {
          "type": "string",
          "__example__": "2026-08-27"
        },
        "max_fecha": {
          "type": "string",
          "__example__": "2026-10-25"
        },
        "dias_cerrados": {
          "type": "array",
          "items": { "type": "string" },
          "__example__": ["2026-08-27", "2026-08-29", "2026-08-30"]
        },
        "horarios": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": { "type": "string" },
              "title": { "type": "string" },
              "enabled": { "type": "boolean" }
            }
          },
          "__example__": [
            {
              "id": "1f0a7c33-6d21-4a58-9c74-2b8e5f10d9a4",
              "title": "10:00 a.m.",
              "enabled": true
            },
            {
              "id": "9c2b41de-70f5-4d0a-8e63-15ab7c904f22",
              "title": "7:00 p.m.",
              "enabled": true
            }
          ]
        },
        "nota_pie": {
          "type": "string",
          "__example__": "Elige un día para ver los horarios."
        },
        "puede_confirmar": {
          "type": "boolean",
          "__example__": false
        },
        "boton": {
          "type": "string",
          "__example__": "Confirmar cita"
        }
      },
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          {
            "type": "TextSubheading",
            "text": "${data.resumen_titulo}"
          },
          {
            "type": "TextBody",
            "text": "${data.resumen_detalle}"
          },
          {
            "type": "CalendarPicker",
            "name": "dia",
            "label": "Día",
            "mode": "single",
            "min-date": "${data.min_fecha}",
            "max-date": "${data.max_fecha}",
            "unavailable-dates": "${data.dias_cerrados}",
            "on-select-action": {
              "name": "data_exchange",
              "payload": {
                "paso": "dia",
                "contexto": "${data.contexto}",
                "dia": "${form.dia}"
              }
            }
          },
          {
            "type": "Dropdown",
            "name": "horario",
            "label": "Horario",
            "required": true,
            "data-source": "${data.horarios}"
          },
          {
            "type": "TextCaption",
            "text": "${data.nota_pie}"
          },
          {
            "type": "Footer",
            "label": "${data.boton}",
            "enabled": "${data.puede_confirmar}",
            "on-click-action": {
              "name": "data_exchange",
              "payload": {
                "paso": "confirmar",
                "contexto": "${data.contexto}",
                "horario": "${form.horario}"
              }
            }
          }
        ]
      }
    }
  ]
}
```

Cinco detalles que valen la pena.

**El día no viaja en el payload de confirmar.** Sólo `contexto` y `horario`. El
identificador del horario es un identificador opaco de un solo uso que lleva atado el
servicio y, en su clave estable, la modalidad y el instante exacto; mandar el día otra vez
sólo abre la puerta a que no coincidan. `contexto` sí viaja porque en modo mover dice
**cuál cita** se está moviendo —el identificador del horario no la conoce— y en modo
agendar sirve para que el servidor verifique que horario y opción hablan del mismo
servicio.

**`CalendarPicker` no está dentro de ningún `If`.** No hay `If` en todo el archivo. Lo
que cambiaría de rama cambia de texto.

**`min-date`, `max-date` y `unavailable-dates` van en `YYYY-MM-DD`.** Es el formato de
`CalendarPicker`, no el del viejo `DatePicker`, que usa milisegundos de época. Y lo que
`on-select-action` manda en modo `single` es también una cadena `"YYYY-MM-DD"`, así que
`${form.dia}` llega ya en el formato que el servidor espera.

**El botón lleva `enabled` y los renglones de horario también.** Las dos cosas están en la
referencia: `Footer` admite `enabled` dinámico, y cada elemento de `data-source` admite
`enabled` booleano desde antes de 5.0. Son las dos piezas que sostienen la pantalla cuando
no hay horas que ofrecer.

**No hay componente `Form` y eso es deliberado.** Desde Flow JSON 4.0 es opcional y
`${form.<nombre>}` resuelve por el `name` del componente. Dos pantallas de una pregunta
cada una no ganan nada envolviéndose.

---

## 4. La función de datos

Un solo archivo, `kapso/functions/agenda-psi-flow-citas.js`. Firma
`async function handler(request, env)`, sin `export default`.

**No tiene lógica de negocio.** Reconoce la acción, elige la ruta, pide al servidor y
devuelve lo que llegó. Todo lo que decide qué se ve —qué días, qué horas, qué texto, si
se puede o no— vive en la base. Esa separación es la que hace que el falso éxito sea
imposible aquí: la función no puede afirmar nada porque no sabe nada.

**Atiende las cuatro acciones de Meta.** `ping` es requisito de publicación y hay que
programarlo aquí porque Kapso no documenta si lo contesta por su cuenta; la respuesta
esperada es `{"data":{"status":"active"}}`. `INIT` y `BACK` no llegan nunca en producción
—el formulario se abre con `navigate`, y ninguna pantalla lleva `refresh_on_back`— así que
se cierran, no se sirven: **no existe una ruta que repinte la pantalla 1**. Un `INIT` sólo
puede venir de alguien abriendo el formulario por fuera de nuestro camino, y ahí no hay
nada que servir.

**Presupuesto de tiempo: 6 segundos al servidor.** El límite real es de **10 segundos de
Meta**, no los 15 que documenta Kapso: los 15 son el envoltorio de Kapso hacia el worker,
y el reloj de Meta arrancó antes. Los 6 segundos son el techo del fracaso, no la meta: la
guía de Meta pide responder **en menos de un segundo**, y un endpoint lento le vale al Flow
una alerta de latencia. Sin reintentos: un reintento duplica el presupuesto y, en la ruta
de confirmar, duplicaría una cita.

**Siempre responde 200.** Un endpoint que devuelve otra cosa se pone «insano» a ojos de
Meta, que limita el Flow a 10 mensajes por hora y después lo bloquea.

```js
// Endpoint de datos del formulario de citas — agendar y mover.
// Kapso ya descifró el mensaje de Meta y verificó su firma; aquí llega en claro.
// Esta función no decide nada: traduce la acción a una ruta y devuelve lo que
// contesta el servidor, que es quien conoce la agenda, el dinero y las reglas.

const GATEWAY =
  'https://ssyzfeadyrczlzjbvxyl.supabase.co/functions/v1/agent_tool_gateway';

// Meta corta a los 10 s y su reloj arrancó antes que el nuestro. Seis segundos
// dejan margen para el TLS y el envoltorio de Kapso.
const TIMEOUT_MS = 6_000;

const RUTAS = {
  eleccion: '/flow/cuando',
  dia: '/flow/cuando',
  confirmar: '/flow/confirmar',
};

function esObjeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

// Data API 3.0 exige que la versión viaje en cada respuesta.
function responder(cuerpo) {
  return new Response(JSON.stringify({ version: '3.0', ...cuerpo }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

// Cerrar el formulario es la única salida ante una falla de transporte. Una
// pantalla vacía deja a la paciente atorada; cerrando, el agente retoma la
// conversación en el mismo segundo con un mensaje de verdad.
function cerrar(flowToken, resultado) {
  return responder({
    screen: 'SUCCESS',
    data: {
      extension_message_response: {
        params: { flow_token: flowToken, resultado },
      },
    },
  });
}

function cuerpoDePaso(paso, datos) {
  if (paso === 'eleccion') return { opcion: datos.opcion ?? null };
  if (paso === 'dia') return { opcion: datos.contexto ?? null, dia: datos.dia ?? null };
  if (paso === 'confirmar') {
    return { opcion: datos.contexto ?? null, horario: datos.horario ?? null };
  }
  return {};
}

async function pedirAlServidor(env, ruta, cuerpo) {
  const controlador = new AbortController();
  const reloj = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    const respuesta = await fetch(`${GATEWAY}${ruta}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${env.AGENT_GATEWAY_SECRET}`,
      },
      body: JSON.stringify(cuerpo),
      signal: controlador.signal,
    });
    if (!respuesta.ok) return null;
    const leido = await respuesta.json().catch(() => null);
    return esObjeto(leido) && esObjeto(leido.result) ? leido.result : null;
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

async function handler(request, env) {
  const crudo = await request.json().catch(() => null);
  // Kapso descifra el mensaje de Meta y lo deja íntegro bajo `data_exchange`.
  const peticion = esObjeto(crudo) && esObjeto(crudo.data_exchange)
    ? crudo.data_exchange
    : {};

  // 1 de 4 · Health check. Requisito de publicación de Meta.
  if (peticion.action === 'ping') return responder({ data: { status: 'active' } });

  const datos = esObjeto(peticion.data) ? peticion.data : {};

  // 2 de 4 · Notificación asíncrona de error del cliente. Meta la manda con
  // `data.error` y `data.error_message`. Se acusa y se calla: la conversación
  // sigue viva en el chat.
  if (datos.error || datos.error_message) {
    return responder({ data: { acknowledged: true } });
  }

  // 3 y 4 de 4 · INIT y BACK no ocurren en producción: el formulario se abre con
  // `navigate` y ninguna pantalla lleva `refresh_on_back`. Si llegan, es que el
  // formulario se abrió por otra vía, y no hay nada que servir.
  const flowToken = peticion.flow_token;
  const ruta = RUTAS[datos.paso];
  if (ruta === undefined) return cerrar(flowToken, 'caducado');

  const resultado = await pedirAlServidor(env, ruta, {
    flow_token: flowToken,
    ...cuerpoDePaso(datos.paso, datos),
  });
  if (resultado === null) return cerrar(flowToken, 'falla');
  return responder(resultado);
}
```

Nótese que la función **no arma pantallas de error**. El servidor ya devuelve la pantalla
que toca, incluida la de cierre cuando lo que corresponde es cerrar. La única pantalla que
compone la función es el cierre por falla de transporte, cuando el servidor no contestó y
por definición no hay nada que mostrar.

---

## 5. Las rutas del servidor

Tres rutas: una que abre el formulario y dos que lo alimentan. Todas en
`agent_tool_gateway`, todas con el mismo `Bearer` que ya usa el gateway, todas con la
envoltura `{ result: … }` que la función ya sabe leer. Ninguna de las tres está encendida
hoy: `/workflow/open-booking-flow` está declarada en el gateway pero contesta
`403 OPERATION_NOT_ENABLED`, y las dos del formulario son nombres nuevos. Ver §10.

**Cómo se identifica el formulario.** Las rutas del agente llevan
`kapso_execution_id` + `provider_message_id`, que el workflow inyecta. El formulario no
tiene acceso a nada de eso: corre en el teléfono de la paciente. Por eso en la superficie
del formulario **el `flow_token` es la correlación**, y no hace falta inventar nada para
tenerlo: `private.agent_issue_option_handle` ya acuña identificadores de tipo `flow` sobre
la entidad `turn`. Está en el cuerpo desplegado de la función y en el `CHECK
chk_agent_option_tokens_kind_matrix` de `agent_option_tokens`, que fija las cinco parejas
válidas: `relationship`/`whatsapp_link`, `service`/`service`, `appointment`/`appointment`,
`slot`/`service_slot` y **`flow`/`turn`**. Un tipo nuevo no pasaría ni la función ni la
restricción.

Cinco cosas que impone ese mecanismo, verificadas leyendo la función:

- **Todos los identificadores viven 30 minutos como máximo**, o lo que le quede a la sesión
  si es menos. Hoy el emisor tiene un tope por tipo —`flow` 15 minutos, `slot` 5— y ésos son
  dos caminos que terminan en silencio: el turno se renueva a media hora en cada llamada y
  el identificador no se renueva nunca, así que un formulario abierto tarde muere con el
  `flow_token` vencido y la cita no se crea. El arreglo es una línea del `CASE` de
  `private.agent_issue_option_handle` —un solo tope de 30 minutos para los cinco tipos— y
  con eso **el turno es el único reloj del formulario**: media hora, la misma que dura el
  turno. Cuando se acaba, el formulario se cierra por `caducado` y el agente ofrece mandarlo
  otra vez. El argumento completo está en `02-herramientas.md` §3.
- **La pareja `flow`/`turn` está marcada de un solo uso, y hay que resolverla sin
  consumirla.** Es lo que exige la restricción, y no estorba: `agent_resolve_option_token`
  sólo marca `consumed_at` cuando quien llama pide consumir, así que resolver con
  `p_consume` en falso funciona tantas veces como haga falta. Consumirlo en el primer
  intercambio mataría el formulario en la segunda pantalla; consumirlo al reservar mataría
  el reintento de Meta con un «se venció» sobre una cita que sí quedó. **No se consume
  nunca.**
- **Los identificadores de horario son de un solo uso y su `entity_id` es el servicio**: la
  modalidad y el instante van en la clave estable. Ése es el único de los cinco tipos que no
  identifica lo que su nombre dice, y se acepta a sabiendas, porque quien impide agendar un
  hueco que no ofrecimos no es el identificador sino la revalidación bajo candado al
  escribir y `excl_appointments_no_overlap`. **Ése sí se consume**, al reservar: es la
  garantía de que un mismo hueco no se reserva dos veces aunque la pantalla se toque doble.
- **Los identificadores de la pantalla 1 salen de las parejas que ya existen**, no de una
  nueva. Al agendar, cada combinación es un identificador de tipo `service` sobre el
  servicio, con la modalidad metida en la clave estable —la función comprueba que el
  servicio esté activo y sea de esa profesional—; al mover, cada cita es uno de tipo
  `appointment`, y la función comprueba que la cita sea de esa paciente con esa profesional.
  Los dos son reutilizables. Como `agent_option_tokens` tiene
  `UNIQUE (turn_id, kind, stable_key)`, pedir dos veces el mismo devuelve el mismo, no uno
  nuevo — **y ése es justamente el detalle que obliga al uuid por consulta en la clave del
  horario** (§5.1): cuando el emisor encuentra una fila con la misma clave ya vencida no
  acuña otra, contesta `TOKEN_EXPIRED_STABLE_KEY`, y la pantalla se queda vacía para siempre
  en ese turno.
- **`private.agent_resolve_option_token` exige que le entreguen sesión y turno**, y el
  formulario no los tiene: lo único que trae es el token. Por eso hace falta una función
  nueva que resuelva el identificador de formulario **por el handle solo** y devuelva
  sesión, turno, paciente, profesional y modo; de ahí en adelante los identificadores de
  horario se resuelven con la función que ya existe. Es la única pieza de SQL nueva que el
  formulario necesita para identificarse (§10).

Un token vencido, consumido o desconocido es un cierre por `caducado`, nunca un error.

### 5.0 · `POST /workflow/open-booking-flow`

La llama el workflow, no el formulario. Es la que decide si el formulario se abre.

**Entra**

```json
{
  "kapso_execution_id": "…",
  "provider_message_id": "…",
  "modo": "agendar"
}
```

`modo` es `"agendar"` o `"mover"`. Es el único argumento que escribe el modelo, es un
enum plano de dos valores y no tiene nada anidado adentro: el modo de fallo documentado
de los esquemas anidados —el modelo manda JSON mal escapado, Kapso rechaza por
validación y el modelo abandona la herramienta— necesita anidamiento para aparecer.

**Sale, cuando se puede abrir**

```json
{
  "ok": true,
  "turn_disposition": "wait",
  "result": { "operacion": "reprogramar", "abierto": true,
              "mensaje_de_cierre": "Te abro el calendario de Araceli para que escojas el nuevo día. Tu pago se va con la cita.",
              "acciones_disponibles": [] }
}
```

Casi nada, y a propósito. El mensaje con el formulario ya salió cuando esta respuesta llega:
lo mandó el servidor. Ni el identificador del formulario ni los datos de la pantalla 1 pasan
por el modelo, que es exactamente lo que uno quiere de un identificador opaco.

**Sale, cuando no**

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

Tres motivos, no más: `AGENDA_CERRADA` (`professionals.is_patient_scheduling_enabled =
false`), `SIN_COMBINACIONES` (ningún servicio activo con días abiertos en la ventana) y
`SIN_CITAS` (modo mover sin citas futuras). El borrador traía un cuarto, `SIN_VINCULO`, que
sobra: una paciente sin vínculo de WhatsApp activo no llega hasta aquí. El cerrojo la para
antes con `TENANT_NOT_ACTIVE` o `TENANT_REQUIRED` —está en el cuerpo de
`private.agent_claim_tool_call`, que exige vínculo con paciente `active` para todo lo que no
sean las dos operaciones sin inquilino, `open_case` y `send_fixed_response`.

Operación en el cerrojo: `open_booking_flow`, superficie `workflow_internal`, lectura,
turno `active`. En el cerrojo ya está permitida; en el gateway todavía no está encendida.

**Quién manda el mensaje: el servidor.** `send_interactive` es un **tipo de nodo de
workflow** de Kapso —configuración estática con interpolación `{{vars.…}}`—, no una
herramienta del agente ni algo que una función pueda llamar. Nuestro workflow tiene tres
nodos y ninguno es de mensaje. Así que el formulario sale de aquí mismo, por la API de
mensajes de Kapso, que sí acepta un mensaje interactivo de tipo Flow armado entero por
nosotros:

```
POST https://api.kapso.ai/meta/whatsapp/v24.0/{phone_number_id}/messages
X-API-Key: {KAPSO_API_KEY}

{ "messaging_product": "whatsapp", "to": "{teléfono de la paciente}",
  "type": "interactive",
  "interactive": { "type": "flow",
    "body":   { "text": "…" },
    "action": { "name": "flow", "parameters": {
      "flow_message_version": "3",
      "flow_id": "{WHATSAPP_FLOW_ID}",
      "flow_cta": "Ver horarios",
      "flow_token": "{el identificador que se acaba de acuñar}",
      "flow_action": "navigate",
      "flow_action_payload": { "screen": "ELEGIR", "data": { … } } } } } }
```

`phone_number_id` es `agent_turns.target_phone_number_id` y el teléfono es
`agent_sessions.phone`: los dos ya están sellados en el turno, ninguno lo escribe el
modelo. El `flow_token` viaja como cadena literal porque aquí no hay ninguna ruta de
variable que resolver — la trampa confirmada de `send_interactive` (si la ruta no resuelve,
el token sale literal) desaparece con el nodo. Y el mensaje sale por Kapso, que es lo que
después le deja enlazar la respuesta del formulario con el mensaje saliente al que
contesta.

Este mensaje **no pasa por `whatsapp_outbox`**: la cola sólo produce plantillas y
`private.wa_payload_ok` reventaría con una clave que no conoce. Es un mensaje libre dentro
de la ventana de 24 h, que es la misma ventana en la que el agente ya está conversando.

Abrir con `navigate` y la primera pantalla servida es además lo que Meta recomienda —
«prefer to make the first screen a data-channel-less to optimize flow opening»— y nos
ahorra un viaje de 10 segundos por gestión.

**El orden importa y es éste:** apartar la llamada en el cerrojo → armar la pantalla 1 y
acuñar el identificador → mandar el mensaje → cerrar la llamada en el cerrojo → dejar el
turno en `waiting_external` con `public.agent_mark_inbound_waiting`, la misma función que
hoy sirve `/workflow/waiting`, con el `provider_message_id` y el `kapso_execution_id` que
esta ruta ya recibe.

Esto último no es un adorno. La mutación del formulario exige el turno en
`waiting_external`, y esa marca la pone hoy una llamada aparte del modelo (`sync_waiting`)
**después** de que el mensaje salió. Marcarlo aquí quita esa dependencia de orden y
**le devuelve al agente una de sus ocho llamadas**, que a ocho por turno no sobran. Si el
mensaje no logra salir, no se marca nada: el turno sigue `active`, la ruta contesta
`abrir: false` y el agente sigue la conversación por chat.

`agent_mark_inbound_waiting` se niega si queda alguna llamada sin cerrar en el turno —está
en su cuerpo—, y por eso va después de cerrar la del cerrojo, no antes. Y si el agente
además llama a `sync_waiting`, no pasa nada: la función ve el turno ya en
`waiting_external` y devuelve `true` sin tocar nada.

Los dos intercambios de lectura, en cambio, no dependen de este orden:
`agent_resolve_option_token` acepta el turno `active` **o** `waiting_external`, así que un
toque muy rápido funciona igual aunque llegue antes de la marca.

### 5.1 · `POST /flow/cuando`

Una sola ruta para los dos intercambios de la pantalla 2. Con `dia` en nulo arma la
pantalla completa desde cero; con `dia` puesto devuelve la misma pantalla con las horas de
ese día. La forma de salida es idéntica en los dos casos, que es lo que permite que sea
una ruta y no dos.

**Entra**

```json
{ "flow_token": "3f9a…", "opcion": "7b1c…", "dia": "2026-08-28" }
```

**Sale, al abrir la pantalla** (sin `dia`): el calendario completo y la lista de horas con
un solo renglón apagado.

```json
{
  "result": {
    "screen": "CUANDO",
    "data": {
      "contexto": "7b1c…",
      "resumen_titulo": "Psicoterapia individual · En línea",
      "resumen_detalle": "50 minutos · $800. Te llega un recordatorio un día antes.",
      "min_fecha": "2026-08-28",
      "max_fecha": "2026-10-26",
      "dias_cerrados": ["2026-08-29", "2026-08-30", "2026-09-05"],
      "horarios": [{ "id": "sin-dia", "title": "Elige un día", "enabled": false }],
      "nota_pie": "Elige un día para ver los horarios.",
      "puede_confirmar": false,
      "boton": "Confirmar cita"
    }
  }
}
```

**Sale, al tocar un día**: la misma forma, con las horas de ese día y el pie nombrándolo.

```json
{
  "result": {
    "screen": "CUANDO",
    "data": {
      "contexto": "7b1c…",
      "resumen_titulo": "Psicoterapia individual · En línea",
      "resumen_detalle": "50 minutos · $800. Te llega un recordatorio un día antes.",
      "min_fecha": "2026-08-28",
      "max_fecha": "2026-10-26",
      "dias_cerrados": ["2026-08-29", "2026-08-30", "2026-09-05"],
      "horarios": [
        { "id": "1f0a7c33-6d21-4a58-9c74-2b8e5f10d9a4", "title": "10:00 a.m.", "enabled": true }
      ],
      "nota_pie": "Horarios del viernes 28 de agosto.",
      "puede_confirmar": true,
      "boton": "Confirmar cita"
    }
  }
}
```

**La pantalla se manda siempre completa.** Meta reemplaza el objeto de datos entero en cada
intercambio: un campo que se omita queda vacío en pantalla. Por eso las dos respuestas
llevan las mismas nueve claves y por eso `dias_cerrados` se vuelve a mandar cada vez —que
es justamente lo que permite tachar un día que se acaba de descubrir lleno.

Cada identificador de horario es un identificador opaco de **un solo uso** con el instante
exacto en su clave estable. Cada uno viaja con su etiqueta legible («10:00 a.m.»): un
identificador desnudo es justo el caso que degrada la precisión del modelo, y aquí además
es lo que la paciente lee.

**La clave estable lleva un uuid por consulta, y va al final.** La forma es
`service_id|dia|modalidad|hora_local|<uuid de esta consulta>`. El uuid está porque
`agent_option_tokens` tiene `UNIQUE (turn_id, kind, stable_key)` y el emisor, cuando
encuentra una fila con la misma clave ya vencida, **no acuña otra**: devuelve
`TOKEN_EXPIRED_STABLE_KEY`. Sin el uuid, volver a tocar un día cuyas horas ya vencieron deja
la pantalla vacía para siempre en ese turno. Y va **al final** y no al principio porque
`agent_create_appointment_from_workflow` parsea la clave por posición y valida la primera
contra el servicio que resolvió (`split_part(v_stable_key, '|', 1)`): un uuid delante
rompería todas las reservas con un error que ni siquiera es accionable para la paciente.

**Esta ruta no aparta ninguna llamada en el cerrojo, y es deliberado.** El libro mayor
tiene ocho renglones por turno —`CHECK (ordinal entre 1 y 8)` sobre `agent_tool_calls`,
`UNIQUE (turn_id, ordinal)`, `CHECK (tool_call_count <= 8)` sobre `agent_turns`—, así que
un formulario que apuntara cada toque no cabría: la novena lectura reventaría la
restricción. Y no hace falta: el libro mayor existe para acotar al **modelo**, que puede
alucinar en bucle, mientras que esta ruta la mueven los dedos de la paciente y no escribe
nada. El portero de esta ruta es el identificador del formulario, que ya exige lo mismo que
exigiría el cerrojo —lo verifica `agent_resolve_option_token` en su cuerpo: que sesión y
turno coincidan en conversación, teléfono, número destino, paciente y profesional; que
ninguno haya vencido; que el turno esté vivo; y que el vínculo de WhatsApp siga con la
paciente `active`—. Lo único que sí se apunta es la mutación (§5.2).

### 5.2 · `POST /flow/confirmar`

Aquí ocurre la mutación. La cita se crea o se mueve **dentro del formulario**, antes de
cerrarlo, y el cierre se redacta con lo que quedó guardado.

**Entra**

```json
{ "flow_token": "3f9a…", "opcion": "7b1c…", "horario": "1f0a7c33-…" }
```

**Sale, cuando quedó** — el cierre del formulario:

```json
{
  "result": {
    "screen": "SUCCESS",
    "data": {
      "extension_message_response": {
        "params": { "flow_token": "3f9a…", "resultado": "creada" }
      }
    }
  }
}
```

**Sale, cuando el hueco se ocupó entre que se pintó y se tocó** — la misma pantalla 2,
con las horas frescas de ese día y el pie explicando:

```json
{
  "result": {
    "screen": "CUANDO",
    "data": { "…": "…", "nota_pie": "Ese horario se acaba de ocupar. Elige otro.", "puede_confirmar": true }
  }
}
```

Superficie `flow_data_exchange`, **mutación**, turno `active` **o** `waiting_external`.
Cuenta contra `mutation_limit` como cualquier otra mutación: una por gestión. Es la única
vuelta del formulario que queda en el cerrojo. La operación depende del modo que trae la
clave estable del `flow_token`: **`flow_create_appointment`** al agendar,
**`flow_reschedule_appointment`** al mover. Una ruta, dos operaciones, dos funciones de
dominio distintas —crear con su pago, o mover llevándose el dinero— y el libro mayor guarda
cuál fue.

Los dos estados del turno, y no sólo `waiting_external`, por un caso concreto: ella recibe
el formulario, escribe «ahorita lo veo» —y ese mensaje devuelve el turno a `active`—, y diez
minutos después abre el formulario y confirma. Con un solo estado exigido, la reserva
saldría con `TOOL_NOT_ALLOWED` después de que ella ya terminó. Quien autoriza aquí es el
`flow_token`, no el estado del turno.

`private.agent_claim_tool_call` exige un `p_execution_id` que case con
`agent_turns.kapso_execution_id` —si no, `CONTEXT_MISMATCH`—, y el formulario no lo trae.
No hace falta: el gateway ya llegó al turno resolviendo el identificador del formulario, y
el turno lleva la ejecución adentro. Se toma de ahí, no del cuerpo de la petición.

**El orden es lo que impide la cita doble.** Primero se aparta la llamada en el cerrojo con
una clave armada con el identificador del formulario y el del horario; después se resuelve
y se consume el identificador del horario. Si Meta o el dedo de la paciente repiten el
mismo intercambio, la clave es la misma y la forma es la misma, así que el cerrojo devuelve
el resultado sellado **antes** de que nadie vuelva a mirar el identificador ya consumido:
mismo resultado, sin recontar y sin escribir. Al revés —consumir primero— el reintento se
vería como un token quemado y la paciente recibiría un «se venció» sobre una cita que sí
quedó.

Adentro llama a la mutación que corresponda al modo —crear una cita de la paciente, o
reprogramarla trasladando el pago— revalidando el hueco bajo candado con
`private.assert_appointment_slot_available`. Esa función es `SECURITY INVOKER`: corre con
los privilegios de quien la llama y necesita `SELECT` sobre `appointments`, `blocked_slots`
y `professional_connections`, que sólo se otorgan en la migración `20260825000000`.

Tres cosas que esta mutación tiene que sellar, y que no puede heredar de las funciones del
profesional porque ninguna es alcanzable desde aquí:

- **En prepago, la petición de comprobante.** Hoy nadie la pide al agendar:
  `create_appointment` dice expresamente que no crea `payment_proofs` ni trabajos, y la
  petición sólo aparece 26 h antes por el cron. Si la cita nace de este formulario con
  `charge_timing = 'before'`, la mutación sella `proof_requested_at` y `method = 'transfer'`
  —que es lo que exige `chk_payment_proof_requested_transfer`— más su renglón en
  `payment_events`. Sin eso, «se aparta con el comprobante» es una frase sin nada detrás, y
  además `registrar_comprobante` contestaría `COMPROBANTE_NO_PEDIDO` si ella manda la foto
  por su cuenta. **No encola ninguna plantilla de WhatsApp**: quien se lo pide es el agente,
  con su propio mensaje, dentro de la sesión abierta (`03-dinero.md` §9).
- **Al mover, la petición de comprobante que ya existía.** `reschedule_appointment` sólo la
  copia cuando hay archivo, así que una petición sin archivo se pierde y el trigger
  `tg_payments_apagar_cobro` cancela el aviso en cola: nadie vuelve a pedirlo nunca. La
  mutación del formulario la traslada siempre.
- **Nunca `confirmed_at`.** `chk_appointment_patient_booking_origin` *permite* que una cita
  de la paciente nazca confirmada si empieza dentro de 48 h, pero no obliga; y
  `chk_appointment_confirmed_not_editable` la dejaría sin poderse editar. Ver §11.3.

### 5.3 · El calendario barato de 60 días

El motor de disponibilidad `public._get_internal_availability_core` es la única
envoltura delgada real que tiene este sistema: recibe a la profesional como parámetro,
es `SECURITY DEFINER` de `postgres`, y con los dos interruptores en `true` devuelve
exactamente lo que la paciente puede ver. Pero trabaja **un día a la vez**, y lo hace
generando cada candidato de 15 en 15 minutos y cruzándolo contra citas, bloqueos, el
consultorio del socio conectado y ocho sondas de horario de verano por candidato
(`generate_series(15, 120, 15)`, cuatro comprobaciones cada una).

Correrlo sesenta veces para pintar un calendario es multiplicar por sesenta justo la
parte que crece con la agenda real de la profesional, en la petición que Meta cronometra
a 10 segundos, y en cada cambio de opción.

**Medición del 2026-08-26**, profesional `0deec2d6`, psicoterapia individual en línea,
60 días, con `EXPLAIN (ANALYZE, BUFFERS)`:

| | Tiempo | Páginas leídas |
|---|---|---|
| 60 llamadas al motor exacto | 49.8 ms | 2 698 |
| La consulta barata, una sola pasada | 5.7 ms | 268 |

Hoy las dos caben. La diferencia es cómo crecen: la consulta barata toca
`blocked_slots` una vez por día abierto y **no toca `appointments` nunca**; el motor
exacto las toca una vez por candidato por día. Con 41 citas en toda la base la
diferencia son 44 milisegundos; con una agenda llena no.

**Y dan el mismo resultado.** Comparadas sobre las **18 combinaciones de servicio y
modalidad de las 5 profesionales**, 60 días cada una —1 080 días—, coinciden en los 617
días ofrecidos: **cero días ofrecidos de más, cero días escondidos de más**.

La regla es deliberadamente corta. Un día no se ofrece cuando:

1. no hay ninguna franja configurada de esa modalidad ese día —ni excepción del día ni
   horario semanal—, o la que hay es más corta que la sesión más su margen;
2. la franja del día está enteramente cubierta por un bloqueo (el caso «me voy de
   vacaciones»);
3. la franja termina antes de que se cumpla la anticipación mínima de la paciente (el
   caso del primer día, que casi siempre se cae por esto).

Pero la medición no es lo que sostiene la decisión, porque una medición vale para un
instante. Lo que la sostiene es que **la consulta barata no puede esconder un día que el
motor exacto abriría**, y eso sale de comparar cada regla con el cuerpo del motor:

- El motor sólo genera candidatos dentro de bloques de la modalidad pedida, y sólo si el
  bloque mide al menos una sesión más su margen. La regla 1 cierra exactamente esos días.
- Un bloqueo que cubre de la primera apertura al último cierre cubre a todos los
  candidatos, porque todos viven dentro. Ésa es la regla 2.
- El último candidato posible de un día empieza, como mucho, a la hora de cierre menos la
  sesión. Si eso ya cayó antes de la anticipación mínima, el motor no deja ni uno. Ésa es
  la regla 3.

Al revés sí puede pasar, y por un solo motivo: los candidatos van de 15 en 15 minutos desde
la apertura, así que el último candidato real puede quedar hasta 14 minutos antes de «cierre
menos sesión». Un día en que la anticipación mínima cae justo en ese hueco se ofrece y sale
vacío al tocarlo. Es el mismo camino que el día que se llenó, y termina igual: la pantalla
vuelve con «Ese día se llenó» y el día tachado. Ningún caso nuevo.

No se intenta adivinar «lleno» de forma barata, y es a propósito: sumar minutos ocupados
exige fusionar intervalos que pueden traslaparse —un bloqueo encima de una cita— y
equivocarse por ese lado esconde días que sí tienen hueco. El día que de verdad se llenó
se descubre al tocarlo, con el cálculo exacto, y se tacha en ese momento (§7).

La excepción del día manda sobre la semana: si existe cualquier fila en
`special_schedules` para esa fecha, el horario semanal no se mira —incluso si esa fila dice
que no trabaja, que es como se toma un día libre—. Es exactamente lo que hace el motor
exacto, y es lo que hace que coincidan. Y no hay que preocuparse por dos excepciones el
mismo día: `uq_special` es `UNIQUE (professional_id, date)`.

`weekday` es `extract(dow)`: **0 es domingo**. Verificado leyendo el cuerpo del motor
desplegado, no la documentación. `uq_weekly` es `UNIQUE (professional_id, weekday)`, así que
tampoco hay dos semanas compitiendo.

El `coalesce` sobre la anticipación mínima no es un blindaje: es la misma línea que tiene el
motor exacto (`COALESCE(pol.patient_min_booking_lead_minutes, 1440)`), y copiarla es lo que
mantiene a las dos consultas de acuerdo.

```sql
-- Los días ofrecibles de los próximos 60, para una combinación de servicio y
-- modalidad. Una sola pasada. No llama al motor exacto ni una vez.
--   p_professional_id  la profesional
--   p_modality         'online' | 'in_person'
--   p_slot_minutes     services.duration_minutes + services.buffer_after_minutes
with param as (
  select pr.timezone                                            as tz,
         coalesce(pol.patient_min_booking_lead_minutes, 1440)    as lead_min
    from public.professionals pr
    left join public.professional_appointment_policies pol
           on pol.professional_id = pr.id
   where pr.id = p_professional_id
),
ventana as (
  select tz,
         lead_min,
         (timezone(tz, now()) + make_interval(mins => lead_min))::date        as primer_dia,
         (timezone(tz, now()) + make_interval(mins => lead_min))::date + 59   as ultimo_dia
    from param
),
dia as (
  select v.tz, v.lead_min, v.primer_dia, v.ultimo_dia, g.d::date as fecha
    from ventana v,
         lateral generate_series(v.primer_dia, v.ultimo_dia, interval '1 day') as g(d)
),
-- La franja del día: la excepción si existe, si no la semanal. Sólo cuentan los
-- bloques de la modalidad pedida y sólo si caben una sesión más su margen.
franja as (
  select d.fecha,
         d.tz,
         d.lead_min,
         min(b.start_time) as abre,
         max(b.end_time)   as cierra
    from dia d
    join lateral (
      select ssb.start_time, ssb.end_time
        from public.special_schedules ss
        join public.special_schedule_blocks ssb
          on ssb.special_schedule_id = ss.id
         and ssb.modality = p_modality
       where ss.professional_id = p_professional_id
         and ss.date = d.fecha
         and ss.is_working
      union all
      select wsb.start_time, wsb.end_time
        from public.weekly_schedules ws
        join public.weekly_schedule_blocks wsb
          on wsb.weekly_schedule_id = ws.id
         and wsb.modality = p_modality
       where ws.professional_id = p_professional_id
         and ws.weekday = extract(dow from d.fecha)::smallint
         and ws.is_working
         and not exists (
           select 1
             from public.special_schedules ss2
            where ss2.professional_id = p_professional_id
              and ss2.date = d.fecha
         )
    ) b on true
   where b.end_time - b.start_time >= make_interval(mins => p_slot_minutes)
   group by d.fecha, d.tz, d.lead_min
),
abierto as (
  select f.fecha
    from franja f
   -- Todavía cabe una sesión completa después de la anticipación mínima.
   where ((f.fecha + f.cierra) at time zone f.tz) - make_interval(mins => p_slot_minutes)
         >= now() + make_interval(mins => f.lead_min)
     -- Y no hay un bloqueo que se trague el día entero.
     and not exists (
       select 1
         from public.blocked_slots bs
        where bs.professional_id = p_professional_id
          and bs.starts_at <= ((f.fecha + f.abre)   at time zone f.tz)
          and bs.ends_at   >= ((f.fecha + f.cierra) at time zone f.tz)
     )
)
select jsonb_build_object(
  'min_fecha', (select primer_dia from ventana),
  'max_fecha', (select ultimo_dia from ventana),
  'dias_abiertos', coalesce((
      select jsonb_agg(a.fecha order by a.fecha) from abierto a
    ), '[]'::jsonb),
  'dias_cerrados', coalesce((
      select jsonb_agg(to_char(d.fecha, 'YYYY-MM-DD') order by d.fecha)
        from dia d
       where not exists (select 1 from abierto a where a.fecha = d.fecha)
    ), '[]'::jsonb)
);
```

La misma consulta, corrida sobre los servicios activos de esa profesional —expandiendo los
de modalidad `both` en dos— y quedándose sólo con las combinaciones que tienen al menos un
día abierto, es la que arma la lista de la pantalla 1. Así la combinación que la profesional
no ofrece no aparece: no porque se filtre, sino porque nunca se construyó. Son seis
consultas para la profesional con más servicios activos de producción, y la más cara medida
tarda menos de un milisegundo de ejecución.

---

## 6. El cierre

Cuando la cita queda, pasan tres cosas en este orden.

**Uno.** `/flow/confirmar` escribió la cita y selló el resultado del formulario en la base:
qué quedó, cuándo, con qué modalidad, cómo está el dinero, y **el mensaje exacto** que la
paciente debe recibir. Ese mensaje lo redacta el servidor con las columnas de la cita
recién guardada, no con lo que nadie crea.

**Dos.** El formulario se cierra. La paciente ve la burbuja de respuesta del formulario en
su chat. Los parámetros del cierre son mínimos —`flow_token` y `resultado`— y **no son el
canal hacia el agente**: son lo que ve WhatsApp. El canal hacia el agente es lo sellado en
el paso uno. Esa separación es deliberada: el falso éxito es el 44-52% de todos los fallos
de agentes medidos, y la mitigación que más lo reduce —unas quince veces— es que la
verificación del estado sea independiente de quien dice haberlo cambiado.

**Tres.** El cierre del formulario llega como un mensaje entrante de WhatsApp
(`interactive.nfm_reply`). Ese mensaje entra por `kapso_inbound_webhook`, que ya es quien
reanuda las ejecuciones de Kapso: el turno está en `waiting_external`, la admisión lo
reconoce como `resumed`, y el despachador reanuda la ejecución que ya existe. **Ese es el
único cambio en el webhook**, y está en una función de cinco líneas: hoy `resumeMessage`
devuelve siempre `{ kind: 'payload', data: <el mensaje crudo de WhatsApp> }`; con el
formulario, primero pregunta si el turno tiene un resultado de formulario sellado sin
entregar, y si lo tiene manda ése.

**La pregunta es por el turno, no por el mensaje.** El webhook ya tiene el turno en la mano:
la admisión se lo devuelve, y lo pasa como variable del workflow. No hace falta reconocer un
`nfm_reply` ni destripar el `response_json` que manda el teléfono. Eso importa por tres
razones: el parser de la entrada (`parseKapsoV2`) hoy no mira el tipo de mensaje y no hay
por qué enseñarle; el contenido no puede ser alterado por el cliente porque no viene del
cliente; y —la que de verdad paga— **si el `nfm_reply` se pierde en la red, el resultado
sigue ahí esperando**: en cuanto ella vuelva a escribir cualquier cosa, la confirmación que
se le debía sale con su siguiente mensaje. Un camino que terminaba en silencio se repara
solo, sin un reloj nuevo.

Lo que llega al agente, dentro de `<external_input>`, es **el sobre de mutación tal cual**
—el mismo de `02-herramientas.md` §6, el mismo que habría visto si la mutación hubiera
salido de una herramienta suya— con una sola clave añadida, `origen`. Ni una forma nueva ni
un segundo contrato que mantener:

```json
{
  "origen": "formulario",
  "ok": true,
  "turn_disposition": "close",
  "result": {
    "operacion": "agendar",
    "aplicado": true,
    "cita": "8c14bd90-1f7a-4a2e-90cb-6d0e2a3f7c55",
    "etiqueta": "viernes 28 de agosto, 10:00 a. m., en línea",
    "antes":   null,
    "despues": { "estado": "programada", "modalidad": "en_linea", "empieza": "2026-08-28T10:00:00-06:00" },
    "dinero":  { "se_movio": false, "estado": "sin_cobro", "importe": null },
    "mensaje_de_cierre": "Listo. Tu cita quedó el viernes 28 de agosto a las 10:00 de la mañana, en línea. Psicoterapia individual, 50 minutos. Un día antes te escribo para que la confirmes.",
    "acciones_disponibles": []
  }
}
```

Con eso el agente contesta **sin gastar una sola llamada más**: manda `mensaje_de_cierre`
tal cual y cierra, porque `turn_disposition` dice `close`. Los otros campos no son para
redactar: son para lo que venga después. `cita` es el identificador opaco de la cita recién
creada, vivo en ese turno.

`dinero.estado` es el enum cerrado del sobre —`sin_cobro`, `esperando_comprobante`,
`comprobante_en_revision`, `viajo_con_la_cita`, `decision_del_profesional`— y ninguno de sus
valores afirma que algo esté pagado. En prepago, la cita nace sin confirmar y el estado es
`esperando_comprobante`. **El agente nunca dice «pagado» ni «aprobado»**: acreditar, condonar
y cobrar son de la profesional, y un comprobante recibido queda pendiente de revisión.

**No confundir el sobre con el `resultado` del cierre.** Son dos cosas distintas y viajan
por caminos distintos. El sobre de arriba es lo sellado en la base y es el canal hacia el
agente. El `resultado` del cierre es el parámetro que ve WhatsApp, y toma tres valores:
**`creada`, `movida`, `caducado`**. Los otros cuatro que traía el borrador sobraban:
`sin_opciones` no puede ocurrir porque el formulario no se abre vacío, `cerrada` describe
una profesional que apaga su agenda a media gestión y hoy **ninguna función desplegada la
apaga**, y `tope` desaparece junto con el contador del formulario (§5.1). El cuarto,
`falla`, es el único que el servidor no puede sellar —si no contestó, no selló nada— y por
eso vive sólo en los parámetros del cierre.

Las reglas del prompt que el formulario le agrega al agente son tres renglones de
`<caminos_de_decision>` y de la tabla D de `05-prompt.md`, y las tres ya están escritas
allá: pedir el formulario va a `abrir_formulario`; `turn_disposition: "wait"` va a
`enter_waiting` sin pasar por `sync_waiting`; y todo `mensaje_de_cierre` se manda palabra
por palabra. **Sólo hace falta una regla propia**, la del único cierre que el servidor no
pudo sellar:

```text
Si te llega la respuesta de un formulario y no trae el sobre con mensaje_de_cierre, no
adivines qué pasó: responde «Se me trabó el formulario. ¿Lo intentamos otra vez?» y cierra.
```

Es corta y no es adorno: cubre el cierre por falla de transporte, y sin ella ese camino
termina en el agente inventando un final. Sale barata porque no exige distinguir nada: **la
ausencia del sobre es la señal**.

Lo de «tal cual» no es estilo. Lo que entra por reanudación llega envuelto en
`<external_input>`, y el prompt de sistema de Kapso le dice al agente que eso viene de
equipos internos o sistemas externos y no de la persona con la que habla. Sin esta regla,
el agente cambia de tono justo en el turno que más importa.

---

## 7. Los casos que se tuercen

| Caso | Qué ve la paciente | Qué hace el agente |
|---|---|---|
| **El formulario caduca.** Pasaron 30 minutos desde que se acuñó el identificador del formulario, o venció la sesión, o el turno se quedó quieto media hora. | El formulario se cierra solo con `resultado: caducado`. | El identificador vencido sigue siendo una fila que apunta al turno, así que el servidor sí puede sellar el resultado. El agente manda: «Se venció la ventana para elegir. ¿Te lo mando otra vez?» Sólo lo vuelve a abrir si ella dice que sí, y eso ya es un turno nuevo con presupuesto nuevo. |
| **El horario elegido se venció.** El identificador del horario vive lo mismo que el turno, así que esto sólo pasa en el borde de la media hora. | Sigue dentro del formulario: la misma pantalla, con las horas frescas de ese día. | Nada. |
| **Lo abandona.** Cierra el formulario sin confirmar. | Nada. No pasa nada más. | Nada llega: Meta sólo manda el `nfm_reply` cuando el formulario se completa. El agente sigue esperando y el turno vence solo. El siguiente mensaje de ella lo reanuda como cualquier otro y la conversación sigue. Sin temporizadores, sin barrido nuevo. |
| **El hueco se ocupó** entre que se pintó y se tocó Confirmar. | Sigue **dentro** del formulario: la misma pantalla, con las horas frescas de ese día y el pie «Ese horario se acaba de ocupar. Elige otro.» | Nada. No se enteró. Éste es el único caso donde quedarse en el formulario gana: ella corrige en dos toques. |
| **El día se llenó** entre que se pintó el calendario y ella lo tocó. | La lista de horas trae un solo renglón deshabilitado, «Ese día se llenó», el botón se apaga, y **el día queda tachado en el calendario**. | Nada. |
| **El servidor no contesta** dentro de los 6 segundos. | Se cierra con `resultado: falla`. | Es el único cierre sin resultado sellado. El agente ve la respuesta del formulario sin bloque y contesta «Se me trabó el formulario. ¿Lo intentamos otra vez?» |
| **El `nfm_reply` se pierde** en el camino. | Vio el formulario cerrarse bien, y su cita **sí existe**. | No llega nada en ese momento y el turno vence. Pero el resultado sellado sigue sin entregar, así que **el siguiente mensaje de ella, sea cual sea, se lo trae**: el webhook pregunta por el turno, no por el mensaje. Sin reloj nuevo y sin barrido nuevo. |
| **La ejecución de Kapso muere** (`failed` es terminal e irrecuperable). | Igual que el caso anterior. | Igual que el caso anterior: la mutación ocurrió del lado del servidor y quedó sellada antes de que nadie reanudara nada. Una ejecución muerta **no deja dinero a medio mover** ni pierde la confirmación. |

Sobre el presupuesto: hoy el cerrojo corta a las **8 llamadas por turno**, y ese tope no es
una preferencia sino una restricción de la base —`agent_turns` tiene
`CHECK (tool_call_count <= 8)` y `agent_tool_calls` tiene `CHECK (ordinal entre 1 y 8)` con
`UNIQUE (turn_id, ordinal)`—. Un formulario que apuntara cada toque **no cabe**: no es que
quede apretado, es que la novena lectura tira la restricción. Por eso los intercambios de
lectura no se apuntan (§5.1) y no hace falta ningún contador nuevo. Lo que **sí** sigue
contra el turno es la mutación: una por gestión, sin excepción. Y abrir el formulario ahora
cuesta una llamada en vez de dos, porque la misma ruta deja el turno esperando (§5.0).

---

## 8. El ciclo de publicación

**Un Flow publicado es inmutable.** Cambiar una coma exige clonar y republicar (error
139001), y no se puede borrar, sólo deprecar (139004). Y **Kapso no expone clonar ni
deprecar en su Platform API**: eso va por el Meta Proxy o por el SDK.

**Dónde vive el identificador.** En un secreto de las funciones de Supabase,
`WHATSAPP_FLOW_ID`, porque el mensaje lo arma y lo manda `agent_tool_gateway` (§5.0).
Nunca incrustado en el JSON ni en la función de Kapso. El repositorio guarda el nombre de la
variable, jamás el valor. Que viva ahí tiene un efecto lateral bueno: se acaba la trampa del
ambiente. El modal de prueba del tablero de Kapso usa las variables de **Development**, no
las de Production, y con el identificador del Flow del lado de Kapso una prueba podía estar
hablando con otro Flow sin decirlo.

### Alta

1. Crear la función `agenda-psi-flow-citas` en Kapso, privada (`cloudflare_worker`,
   `passthrough`), con `AGENT_GATEWAY_SECRET` en el ambiente. Borrar
   `agenda-psi-flow-agendar` y `agenda-psi-flow-reprogramar`: quedan 3 de 5 workers.
2. Crear el Flow en Kapso con el JSON de §3. Kapso lo registra en Meta, sube la llave
   pública firmada, genera y rota el secreto y verifica las firmas. No hay que
   reimplementar nada de eso; el payload que llega al worker ya trae
   `signature_valid: true`.
3. Apuntar el `endpoint_uri` del Flow a la función.
4. **Probar con la vista previa interactiva del Flow.** Ejerce el cifrado real y muestra
   petición y respuesta completas en la pestaña Actions. Lo que demuestra y lo que no, dicho
   con precisión: la vista previa abre la pantalla 1 con los `__example__` del JSON y manda
   un `flow_token` suyo, que no es ninguno de los nuestros. Así que las dos rutas contestan
   un cierre por `caducado`. **Eso ya es la prueba que importa**: que el endpoint recibe las
   tres acciones, contesta 200, contesta con `"version": "3.0"` y no se cae. El contenido se
   prueba en el paso 8, con un formulario de verdad.
5. Comprobar el health check mirando `function_invocations`: tiene que haber una
   invocación con `action: "ping"` respondida con `{"data":{"status":"active"}}`. Es
   requisito de publicación y Kapso no documenta si lo contesta él.
6. Publicar.
7. Guardar el identificador en el secreto `WHATSAPP_FLOW_ID` de las funciones de Supabase.
8. Prueba de punta a punta **por el sandbox de WhatsApp no sirve**: el sandbox no soporta
   Flows en absoluto. La prueba real es con el número de producción, mandándose el
   formulario a un teléfono propio. Es también la única forma de ver qué hace el calendario
   con la selección del día cuando la pantalla se repinta: si al volver de tocar un día la
   fecha se ve deseleccionada, se le agrega `init-value` al `CalendarPicker` —está
   disponible porque no hay `Form`— alimentado con el día que el servidor ya conoce.

### Cambio

1. Clonar por el Meta Proxy: `POST /{waba_id}/flows` con `clone_flow_id`.
2. Subir el JSON nuevo al clon y probarlo con la vista previa interactiva.
3. Publicar el clon.
4. Cambiar `WHATSAPP_FLOW_ID` al identificador del clon. **Aquí es donde el cambio entra
   en vigor**, no al publicar.
5. Esperar a que no queden formularios abiertos del viejo —quince minutos bastan, que es
   lo que vive un identificador de formulario— y deprecar el viejo:
   `POST /{flow_id}/deprecate`.

**El clon cuenta contra el tope de workers del plan Free.** Son 5, y clonar un Flow que
crea un worker de endpoint consume uno. Con un solo formulario vamos de 4 a 3 funciones, y
durante el clon a 4: cabe. Con los dos formularios del borrador anterior el clon nos
dejaba en 5, exactamente en el tope, y el primer intento de clonar habría fallado en el
peor momento. Fundir los dos formularios en uno es lo que compra ese margen.

---

## 9. Los requisitos de Meta, como lista de comprobación

Ocho requisitos de publicación, más tres de cuenta que bloquean antes que cualquier otra
cosa.

- [ ] **Número verificado en la WABA.** Ya está: número de producción conectado, WABA
      aprobada, TIER_250.
- [ ] **Llave pública firmada subida.** La sube y rota Kapso.
- [ ] **`endpoint_uri` puesto** y apuntando a `agenda-psi-flow-citas`.
- [ ] **App de Meta enlazada** a la WABA.
- [ ] **JSON válido** contra Flow JSON 7.2. Meta valida al subir; Kapso no impone tope y
      sólo reenvía.
- [ ] **Versiones no congeladas.** 7.2 y 3.0 están vigentes al corte.
- [ ] **El endpoint responde el health check.** Verificado en `function_invocations`, no
      supuesto.
- [ ] **WABA suscrita a los webhooks de Flows.**
- [ ] **Nombre para mostrar aprobado.**
- [ ] **Verificación de negocio aprobada.** Es el bloqueo decisivo: sin ella nada de lo
      anterior sirve.
- [ ] **Método de pago válido** en la cuenta de Meta.

Y tres que no son de Meta pero fallan igual de feo:

- [ ] `AGENT_GATEWAY_SECRET` puesto en el ambiente de la función nueva de Kapso.
- [ ] `WHATSAPP_FLOW_ID` puesto como secreto de las funciones de Supabase.
- [ ] `KAPSO_API_KEY` visible para `agent_tool_gateway`. Ya existe como secreto del
      proyecto —`kapso_inbound_webhook` la usa para reanudar ejecuciones— así que lo único
      que hay que comprobar es que la función nueva la lee.

---

## 10. Lo que este diseño exige cambiar en lo ya escrito

Seis cambios, todos en migraciones y en las dos funciones de borde. Ninguno toca la app de
la profesional.

1. **Las cuatro operaciones de formulario se vuelven dos, y las dos mutan.**
   `flow_list_services`, `flow_get_eligibility` y `flow_get_availability` **salen del
   cerrojo**; se quedan `flow_create_appointment` —que ya existe— y
   `flow_reschedule_appointment` —que hay que agregar—, las dos en `flow_data_exchange`, las
   dos válidas con el turno en `active` o `waiting_external`, y las dos servidas por la misma
   ruta `/flow/confirmar`. Las lecturas desaparecen del cerrojo porque **no caben en el libro
   mayor**: `agent_tool_calls` tiene `CHECK (ordinal entre 1 y 8)` y
   `UNIQUE (turn_id, ordinal)`, y `agent_turns` tiene `CHECK (tool_call_count <= 8)`. Se
   autentican con el identificador del formulario, que exige lo mismo (§5.1).
2. **Se retira el candado de saga sobre la creación desde el formulario.** Hoy
   `flow_create_appointment` sólo pasa si el turno está en
   `saga_state = 'awaiting_replacement_create'` con `mutation_limit = 2` y una mutación ya
   cometida, es decir: sólo dentro de la maniobra de cancelar-y-volver-a-agendar. **Agendar
   normal se rechaza hoy.** Y esa maniobra es justamente la única ruta por la que el dinero
   de una paciente se evapora, que el dueño ya prohibió. Se va el candado y se va la
   maniobra. Con ella se va también la reserva del ordinal 8 y el guardia
   `tool_call_count > 3`, que sólo existen para sostenerla.
3. **Una función nueva que resuelva el identificador del formulario por el handle solo.**
   `private.agent_resolve_option_token` exige que le den sesión y turno, y el formulario no
   los tiene. La función nueva recibe el handle, comprueba que sea de tipo `flow`, que no
   haya vencido y que el turno siga vivo, y devuelve sesión, turno, paciente, profesional y
   modo. Los identificadores de horario siguen resolviéndose con la función que ya existe.
   **No hace falta un tipo de identificador nuevo**: la pareja `flow`/`turn` ya está en el
   cuerpo desplegado y en `chk_agent_option_tokens_kind_matrix`. Lo que sí hace falta son dos
   líneas más: subir su tope de vida a 30 minutos, y **agregar la fila
   `('flow','turn',true,'30 minutes')` a la matriz de `private.agent_issue_listed_option`**,
   que excluye ese tipo a propósito y sin ella nadie puede acuñar el token.
4. **Tres rutas encendidas en el gateway, y seis apagadas.** `/workflow/open-booking-flow`
   está declarada pero contesta `403 OPERATION_NOT_ENABLED`; hay que ponerla en el mapa que
   sí atiende. `/flow/cuando` y `/flow/confirmar` son nombres nuevos y hay que declararlas
   además en la lista. Se van las cuatro rutas de formulario viejas —`/flow/services`,
   `/flow/eligibility`, `/flow/availability`, `/flow/create`— y `/workflow/open-reschedule-flow`
   nunca llega a existir: un solo `open_booking_flow` con su argumento `modo` cubre los dos
   casos. El mapa completo del gateway, con las doce rutas que quedan, está en
   `02-herramientas.md` §4.
   Y las dos rutas del formulario **no llevan `kapso_execution_id` ni `provider_message_id`**:
   el gateway los recupera del turno al que llegó por el identificador del formulario, que
   es lo que `private.agent_claim_tool_call` exige para no contestar `CONTEXT_MISMATCH`.
5. **La ruta que abre el formulario manda el mensaje y deja el turno esperando.** Manda el
   mensaje interactivo por la API de mensajes de Kapso (§5.0) y, después de cerrar su propia
   llamada, llama a `public.agent_mark_inbound_waiting` con las mismas dos claves que ya
   recibe. Cierra la ventana en la que el primer toque de la paciente llegaría antes de que
   el turno estuviera parado, y le devuelve al agente una de sus ocho llamadas.
6. **El webhook de entrada entrega el resultado sellado del formulario.** Una rama en
   `resumeMessage`, dentro de `kapso_inbound_webhook`: si el turno tiene un resultado de
   formulario sellado sin entregar, el cuerpo de la reanudación es ése —el sobre de mutación
   con `origen: "formulario"`—; si no, el objeto de forma fija con `origen: "paciente"`.
   **No mira el tipo de mensaje entrante**, lo que ahorra enseñarle a `parseKapsoV2` a
   reconocer un `nfm_reply` y, de paso, repara solo el caso en que el `nfm_reply` se pierde.
   Leer lo sellado cuesta una función de control nueva —el borde habla por RPC, no por
   tabla— que recibe el `turn_id` y devuelve el `redacted_result` de la mutación del
   formulario con `outcome = 'committed'`.

Y una trampa que hay que mirar antes de encender esto: **una cita que naciera confirmada
nacería sin poderse editar.** `chk_appointment_confirmed_not_editable` dice
`confirmed_at IS NULL OR is_editable = false`, y la profesional vería «Confirmada» sin
reconocerla y sin botón de Editar. La buena noticia es que el esquema no obliga a nada: la
otra restricción, `chk_appointment_patient_booking_origin`, sólo **permite** marcar
`confirmation_source = 'patient_booking'` cuando la cita empieza dentro de 48 horas y
`confirmed_at = created_at`. Nunca usarla es legal y es lo que este documento supone
(§11.3).

---

## 11. Decisiones pendientes del dueño

Cada una viene con la recomendación y con el supuesto bajo el que está escrito este
documento, para que nada se quede parado esperando.

1. **El cargo por mover tarde.** Recomendación: **mover siempre es gratis**. En el esquema
   de hoy cobrar un cambio tardío al reprogramar es estructuralmente imposible —el pago
   viejo queda en un estado que ninguno de los tres resolutores acepta, y lo único que
   existe cobra la sesión vieja completa más la nueva—, así que la alternativa es un
   renglón nuevo en el modelo de pagos. *Supuesto de este documento:* mover es gratis, y por
   eso la nota de la pantalla 1 en modo mover habla del pago que viaja y no amenaza con un
   cobro. Si el dueño decide lo contrario, cambia esa nota y aparece un renglón nuevo en el
   modelo de pagos; el formulario no cambia.

2. **Cambiar de modalidad al mover.** Recomendación: **no**, se queda conversacional.
   Tiene su propia dirección permitida y su propia anticipación —12 horas para Miranda, 24
   para las demás— y dos de cinco profesionales prohíben los dos sentidos. *Supuesto:* al
   mover, la modalidad se conserva. Si el dueño lo quiere adentro, la lista de la pantalla 1
   pasa de «tus citas» a «tus citas × las modalidades permitidas para cada una», que sigue
   siendo una sola lista y sigue cabiendo en dos pantallas.

3. **¿La cita del formulario nace confirmada alguna vez?** En prepago ya está decidido que
   no. Con cobro después, la ventana de 48 horas que la haría nacer confirmada choca con la
   anticipación de 48 horas que piden tres de cinco profesionales. *Supuesto:* **nunca nace
   confirmada**, y la confirmación siempre la pide el aviso de 26 horas. Además esto evita
   el efecto colateral de la cita que nace sin poderse editar.

4. **El plazo del prepago cuando la cita es en menos de 24 horas.** *Resuelto en
   `03-dinero.md` §5.3 y §10.8:* **24 horas fijas desde que se pidió el comprobante, y nunca
   sobre una cita que ya empezó.** «Lo que ocurra primero» cancelaba una sesión en curso,
   porque `cron_sweep_past_pending` sólo mueve la cita a `past_pending` cuando `ends_at`
   ya pasó: entre el principio y el final de la sesión la cita sigue `scheduled`. La
   consecuencia que se acepta es que una cita de prepago agendada para dentro de menos de 24
   horas **no se autocancela nunca**: llega sin comprobante, pasa a `past_pending` y la
   resuelve la profesional con sus botones. Hoy el caso no existe, porque la única con cobro
   antes pide 48 horas. El `resumen_detalle` de la pantalla 2 dice el vencimiento con la hora
   concreta. Y hay que decirlo entero: **el trabajo que la cancela no existe todavía.**
   `cron_prepay_proof_request` es un cascarón retirado que sólo levanta un aviso, y no está
   en `cron.job`. El formulario sella la petición de comprobante (§5.2); el trabajo que la
   hace vencer está escrito completo en `03-dinero.md` §5.3 y hay que darlo de alta.

5. **Tope de citas sin confirmar por paciente.** No existe ninguno. Con el formulario
   abierto a las 17 pacientes activas, nada impide que una aparte cinco huecos y no
   confirme ninguno. *Supuesto:* sin tope en esta ronda, porque a la escala de hoy no se ha
   producido nunca. Es la primera cosa que habrá que mirar si el formulario se usa.

6. **Un interruptor real de «mis pacientes pueden agendar solas».** Hoy
   `is_patient_scheduling_enabled` es un pestillo de una sola dirección: al guardar su
   primer horario válido se enciende para siempre y ninguna función desplegada lo apaga.
   `/workflow/open-booking-flow` lo respeta y se niega a abrir si está apagado — pero
   apagado no va a estar nunca. *Supuesto:* el formulario lee la columna y respeta lo que
   diga; darle a la profesional una forma de apagarlo es trabajo de la app y de otra ronda.

7. **La vida de los identificadores: cinco topes distintos o uno solo.** *Resuelto:* **uno
   solo, de 30 minutos**, para los cinco tipos. Con los topes de hoy hay dos caminos que
   terminan en silencio: el `flow_token` de 15 minutos deja sin cita a quien pasea el
   calendario con calma, y el identificador de horario de 5 minutos deja la pantalla vacía
   **para siempre en ese turno** si ella compara dos días y vuelve al primero
   (`TOKEN_EXPIRED_STABLE_KEY`). Y estirarlos no alarga ninguna ventana peligrosa: quien
   impide agendar un hueco que ya se ocupó no es el reloj del identificador sino la
   revalidación bajo candado al escribir, que devuelve la pantalla con «Ese horario se acaba
   de ocupar». Es una línea del `CASE` de `private.agent_issue_option_handle`. *Supuesto:*
   30 minutos, el mismo reloj del turno.

8. **Qué texto lleva el mensaje que carga el formulario.** El servidor lo escribe (§5.0):
   un cuerpo corto y un botón de 20 caracteres —«Ver horarios» al agendar, «Ver horarios»
   al mover—. *Supuesto:* «Aquí puedes elegir el día y la hora» y «Aquí puedes mover tu
   cita». Son dos frases y el dueño manda sobre ellas; no cambian nada del diseño.
