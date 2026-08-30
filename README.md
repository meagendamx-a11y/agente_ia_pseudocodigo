# El agente de WhatsApp de Agenda Psi

Aquí vive la documentación del agente: qué contesta, con qué funciones, con qué textos y con qué
límites. **No hay SQL desplegable ni código ejecutable.** Nada de este repositorio se corre contra
producción; lo que se despliega se escribe en `agente_ia`, a partir de esto.

---

## Qué es el agente

Un asistente que atiende por WhatsApp a las pacientes de las profesionales de Agenda Psi. Agenda,
mueve de día, cancela —y si esa cita traía un pago, el aviso alcanza y le queda una próxima de su
serie, lo pasa ahí—, confirma, cambia la modalidad, recibe comprobantes, guarda reseñas y contesta
qué citas tiene, dónde es y cuánto debe, siempre dentro de lo que esa profesional tiene
configurado. Nunca interviene una persona.

**El modelo corre en nuestro código.** Una sola función de borde, `kapso_inbound_webhook`, recibe
el mensaje, lo guarda, contesta de inmediato —si tardara, Kapso reintenta y la paciente recibe dos
respuestas— y sigue trabajando en segundo plano: llama al modelo, llama directo a las funciones de
la base y manda la respuesta. Kapso quedó como mensajería y nada más: guarda el número, guarda las
plantillas, entrega lo que llega y manda lo que le damos.

El agente hace una sola cosa: **detecta la intención**. Cada intención tiene una función, y la
función resuelve todo por dentro —quién escribe, con quién, qué cita, qué plazo, qué precio— y
devuelve el texto ya redactado; el agente lo copia y lo manda. No calcula fechas, no arma frases y
nunca ve un identificador de la base.

Los dos frenos del mensaje lo sostienen. Un tope de **tres llamadas por mensaje**, porque sin él un modelo confundido
llama funciones en círculo y nadie lo detiene. Y un **candado por conversación**: si llegan dos
mensajes del mismo teléfono al mismo tiempo, el segundo espera, y así no salen citas duplicadas.

---

## Por dónde empezar

**Quiero entender el producto.** `docs/00-el-agente.md` para el modelo entero y las reglas
numeradas, y `docs/01-conversaciones.md` para leerlo como lo lee la paciente, mensaje por mensaje.
Con esos dos basta. Si además interesa dónde se juega la confianza, sigue `docs/03-dinero.md`: casi
todo lo delicado del producto es dinero.

**Voy a implementarlo.** `docs/08-implementacion.md` primero, que dice qué construir, en qué orden
y cómo se prueba cada pieza. De ahí se sale a `docs/02-funciones.md` por el contrato exacto de cada
función, a `docs/07-portero.md` por el recorrido de un mensaje, el candado y el tope de vueltas, y a
`docs/04-horarios.md` por la búsqueda, que es la pieza con más trabajo pendiente. `docs/05-prompt.md`
es el prompt que carga la función de borde. Y antes de tocar nada, `AGENTS.md`.

**Necesito un dato duro.** Un número de hoy —cuántas pacientes, cuántas citas, qué plazo pide cada
profesional— no se busca aquí: se consulta en la base desplegada. Ningún documento de este
repositorio cita datos de producción, porque cambian y porque el agente va a trabajar para muchas
profesionales con políticas, nombres y precios distintos. Un texto que la paciente lee, palabra por
palabra: `docs/06-textos.md`. Los parámetros, el resultado o el aviso de una función:
`docs/02-funciones.md`. Una regla que alguien citó por número: `docs/00-el-agente.md`.

---

## Los once archivos

| Archivo | Qué hay adentro |
|---|---|
| `README.md` | Esto: qué es, en qué orden se lee y quién manda. |
| `AGENTS.md` | Cómo se edita este repositorio: lo que no se nombra, lo que no se inventa y lo que no se propone borrar. |
| `docs/00-el-agente.md` | El modelo en una página, el recorrido de un mensaje y las reglas numeradas. Los demás archivos las citan por número y no las repiten. |
| `docs/01-conversaciones.md` | Los ocho flujos y los bordes, mensaje por mensaje. Es el archivo que se lee para saber cómo se siente el producto. |
| `docs/02-funciones.md` | El catálogo: diez funciones, con sus parámetros, su resultado, si escriben en la base y qué aviso le llega a la profesional. |
| `docs/03-dinero.md` | Qué le pasa al pago en cada acción: el cobro por adelantado, el cambio tardío, pasar el pago, el comprobante. |
| `docs/04-horarios.md` | Cómo se buscan y se ofrecen los horarios, y qué hay que arreglarle al motor antes de confiar en él. |
| `docs/05-prompt.md` | El prompt completo que carga la función de borde, listo para pegar. |
| `docs/06-textos.md` | Los textos literales, cada uno con su clave y su cuándo. |
| `docs/07-portero.md` | El recorrido de un mensaje por dentro: el candado por conversación, el tope de tres llamadas, la memoria de la conversación y los modos de fallo. |
| `docs/08-implementacion.md` | Qué construir, en qué orden y cómo se prueba cada pieza; qué se borró de la base y qué queda por hacer. |

Tres archivos son fuente única de su materia: las reglas sólo viven en `00`, los textos sólo viven
en `06` —y ahí se lleva el conteo de claves, para que ningún otro archivo lo repita—, y la memoria
de la conversación sólo se define en `07`. Una regla se busca por su número y un texto por su
clave. Un texto completo se reproduce en dos sitios y en ninguno más: en
`docs/01-conversaciones.md`, cuando la conversación no se entiende sin él, y en `docs/05-prompt.md`,
porque los textos de prompt viajan literales dentro del prompt. Si una copia y `06` difieren, manda
`06`. La regla entera, con su porqué y cómo se editan sin partirlos en dos versiones vivas, está en
`AGENTS.md` §5.

---

## Quién manda cuando dos renglones se contradicen

Tres capas, y gana la de más arriba.

1. **Las decisiones de Gael.** Ensayó el agente conversación por conversación y después leyó el
   repositorio entero; de ahí salió cómo se comporta: qué se permite aunque sea tarde, qué se
   cancela, qué no se le dice a la paciente. Están destiladas dentro de estos once archivos, no
   viven aparte. Un documento que las contradiga está mal escrito; no las corrige.
2. **Lo que la base viva confirma.** El esquema y los datos se leen de la base desplegada, nunca de
   memoria ni de una copia local. Por eso nada de aquí se escribió sin haberlo consultado, y por eso
   se vuelve a leer antes de darlo por bueno.
3. **Estos documentos.** Y lo que no esté en ellos no se inventa: se pregunta.

---

## Lo que no está aquí

**El código y las migraciones.** Viven en el repositorio `agente_ia`. Aquí se decide qué se
construye; allá se construye. Y aquí sólo se decide qué se agrega: lo que la app Flutter usa se
queda, y `docs/00-el-agente.md` dice por qué.

**El esquema real.** Vive en la base desplegada, y **es la única fuente de verdad del esquema**.
Ningún cuadro de este repositorio sustituye una consulta. Si algo de aquí no calza con la base, la
base tiene razón y el documento se corrige.

**Lo que quedó del lado de Kapso.** El número, las plantillas y el agrupamiento de mensajes. Nada
más: ahí ya no vive lógica, y ya no hay nada que bajar. Cómo está configurado ese lado sólo lo dice
el panel de Kapso, y cualquier copia local puede estar vieja.
