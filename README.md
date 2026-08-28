# El agente de WhatsApp de Agenda Psi

Aquí vive la documentación del agente: qué contesta, con qué funciones, con qué textos y con qué
límites. **No hay SQL desplegable ni código ejecutable.** Nada de este repositorio se corre contra
producción; lo que se despliega se escribe en `Agenda-Psi-V2`, a partir de esto.

---

## Qué es el agente

Un asistente que atiende por WhatsApp a las pacientes de las profesionales de Agenda Psi. Agenda,
mueve de día, cancela, confirma, cambia la modalidad, recibe comprobantes, pasa un pago a la
próxima sesión y guarda reseñas, siempre dentro de lo que esa profesional permite. Hace una sola
cosa: **detecta la intención**. Cada intención tiene una función, y la función resuelve todo por
dentro —quién escribe, con quién, qué cita, qué plazo, qué precio— y devuelve el texto ya
redactado; el agente lo copia y lo manda. No calcula fechas, no arma frases y nunca ve un
identificador de la base. Nunca interviene una persona.

---

## Por dónde empezar

**Quiero entender el producto.** `docs/00-el-agente.md` para el modelo entero y las veinte reglas,
y `docs/01-conversaciones.md` para leerlo como lo lee la paciente, mensaje por mensaje. Con esos dos
basta. Si además interesa dónde se juega la confianza, sigue `docs/03-dinero.md`: casi todo lo
delicado del producto es dinero.

**Voy a implementarlo.** `docs/08-implementacion.md` primero, que dice qué construir, en qué orden
y cómo se prueba cada pieza. De ahí se sale a `docs/02-funciones.md` por el contrato exacto de cada
función, a `docs/07-portero.md` por el turno y el presupuesto, y a `docs/04-horarios.md` por la
búsqueda, que es la pieza con más trabajo pendiente. `docs/05-prompt.md` se pega tal cual en el
nodo. Y antes de tocar nada, `AGENTS.md`.

**Necesito un dato duro.** Un número de hoy —cuántas pacientes, cuántas citas, qué plazo pide cada
profesional—: `docs/09-estado-y-limites.md`. Un texto que la paciente lee, palabra por palabra:
`docs/06-textos.md`. Los parámetros, el resultado o el aviso de una función: `docs/02-funciones.md`.
Una regla que alguien citó por número: `docs/00-el-agente.md`.

---

## Los doce archivos

| Archivo | Qué hay adentro |
|---|---|
| `README.md` | Esto: qué es, en qué orden se lee y quién manda. |
| `AGENTS.md` | Cómo se edita este repositorio: lo que no se nombra, lo que no se inventa y lo que no se propone borrar. |
| `docs/00-el-agente.md` | El modelo en una página, el grafo y las veinte reglas numeradas. Los demás archivos las citan por número y no las repiten. |
| `docs/01-conversaciones.md` | Los nueve flujos y los bordes, mensaje por mensaje. Es el archivo que se lee para saber cómo se siente el producto. |
| `docs/02-funciones.md` | El catálogo: once funciones, con sus parámetros, su resultado, si escriben en la base y qué aviso le llega a la profesional. |
| `docs/03-dinero.md` | Qué le pasa al pago en cada acción: el cobro por adelantado, el cambio tardío, pasar el pago, el comprobante. |
| `docs/04-horarios.md` | Cómo se buscan y se ofrecen los horarios, y qué hay que arreglarle al motor antes de confiar en él. |
| `docs/05-prompt.md` | El prompt completo del nodo agente, listo para pegar. |
| `docs/06-textos.md` | Los textos literales, cada uno con su clave y su cuándo. |
| `docs/07-portero.md` | Turnos, presupuesto, una mutación por turno, dormir y despertar, admisión, y qué pasa cuando algo falla. |
| `docs/08-implementacion.md` | Qué construir, en qué orden y cómo se prueba cada pieza. |
| `docs/09-estado-y-limites.md` | Los números de hoy, lo que está desplegado y contradice el diseño, y lo que queda abierto. |

Dos archivos son fuente única de su materia: las reglas sólo viven en `00` y los textos sólo viven
en `06`. Una regla se busca por su número y un texto por su clave. El único que reproduce un texto
completo es `docs/01-conversaciones.md`, y sólo cuando la conversación no se entiende sin él; si esa
copia y `06` difieren, manda `06`. Cómo se editan sin partirlos en dos versiones vivas está en
`AGENTS.md`.

---

## Quién manda cuando dos renglones se contradicen

Tres capas, y gana la de más arriba.

1. **Las decisiones del ensayo.** Gael ensayó el agente conversación por conversación y fijó cómo
   se comporta: qué se permite aunque sea tarde, qué no se cancela, qué no se le dice a la
   paciente. Están destiladas dentro de estos doce archivos, no viven aparte. Un documento que las
   contradiga está mal escrito; no las corrige.
2. **Lo que la base viva confirma.** El esquema y los datos se leen de la base desplegada, nunca de
   memoria ni de una copia local. Por eso ningún número de aquí se escribió sin haberlo consultado,
   y por eso se vuelven a leer antes de darlos por buenos.
3. **Estos documentos.** Y lo que no esté en ellos no se inventa: se pregunta.

---

## Lo que no está aquí

**El código y las migraciones.** Viven en el repositorio `Agenda-Psi-V2`. Aquí se decide qué se
construye; allá se construye. Y aquí sólo se decide qué se agrega: lo que la app Flutter usa se
queda, y la regla 20 dice por qué.

**El esquema real.** Vive en la base desplegada, y **es la única fuente de verdad del esquema**.
Ningún cuadro de este repositorio sustituye una consulta. Si algo de aquí no calza con la base, la
base tiene razón y el documento se corrige.

**El workflow y las funciones de Kapso.** Viven en Kapso, y sólo Kapso dice qué está corriendo.
Cualquier copia local puede estar vieja: se baja con `kapso pull` antes de diagnosticar nada.
