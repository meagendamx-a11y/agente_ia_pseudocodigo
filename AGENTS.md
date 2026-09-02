# Cómo se edita este repositorio

Corte: 2026-09-02.

Aquí vive la especificación de producción del agente de WhatsApp de Agenda Psi: **ocho archivos en
español**. Estas reglas aplican por igual a personas y a agentes, y mandan sobre el contenido de los
ocho. Lo que el repositorio **es** y en qué orden se lee está en `README.md`.

---

## Índice

1. [El gobierno se reabre: el pseudocódigo sí se permite](#1-el-gobierno-se-reabre-el-pseudocódigo-sí-se-permite)
2. [Lo que nunca se agrega](#2-lo-que-nunca-se-agrega)
3. [La lista cerrada: ocho archivos, un dueño por tema](#3-la-lista-cerrada-ocho-archivos-un-dueño-por-tema)
4. [Un tema, un dueño: cómo se cita](#4-un-tema-un-dueño-cómo-se-cita)
5. [La arquitectura vigente](#5-la-arquitectura-vigente)
6. [Lo que no se reintroduce](#6-lo-que-no-se-reintroduce)
7. [Las correcciones que no se deshacen](#7-las-correcciones-que-no-se-deshacen)
8. [La base y la documentación externa se verifican](#8-la-base-y-la-documentación-externa-se-verifican)
9. [Los textos](#9-los-textos)
10. [Seguridad y consistencia](#10-seguridad-y-consistencia)
11. [Los plazos, el género y los ejemplos](#11-los-plazos-el-género-y-los-ejemplos)
12. [Tono y forma](#12-tono-y-forma)
13. [Mermaid](#13-mermaid)
14. [Cómo se escribe un pendiente](#14-cómo-se-escribe-un-pendiente)

---

## 1. El gobierno se reabre: el pseudocódigo sí se permite

**Esto cambia respecto de la versión anterior de este archivo, y se cambia a propósito.** Antes se
prohibía «código desplegable» y en la práctica se leía como una prohibición de escribir cuerpos de
función. Se reabre por dos motivos concretos:

1. **El repositorio se llama `agente_ia_pseudocodigo`.** El nombre es el encargo. Una especificación
   que no puede escribir un cuerpo de función obliga a quien implemente a adivinar el orden de los
   bloqueos, el orden de las comprobaciones y la forma exacta del resultado, que es justo lo que esta
   documentación existe para evitar.
2. **El repositorio hermano ya guarda cuerpos de función como pseudocódigo, y ésa es su convención
   declarada.** `/home/user/Agenda-Psi-V2/referencias/database_pseudocodigo/` describe su carpeta
   `functions/` como «pseudocódigo de las RPC, un archivo por función», y su propio README advierte
   que «los cuerpos marcados como pseudocódigo deben implementarse y probarse antes de ejecutarse»
   (`referencias/database_pseudocodigo/README.md`). Escribir pseudocódigo aquí no inventa un formato:
   sigue el que la casa ya usa.

**Dónde vive.** El pseudocódigo de las RPC, del gateway y de los adaptadores vive en
`docs/05-pseudocodigo.md` y sólo ahí. Los demás archivos pueden citar una firma o un nombre de
función, no un cuerpo.

### La frontera, con una prueba concreta

La pregunta que decide es una sola: **¿esto se pega en el SQL Editor y corre?** Si la respuesta es
sí, no va en este repositorio. Un bloque de pseudocódigo cumple **las cuatro** condiciones:

1. **Lleva la marca `-- PSEUDOCODIGO`** en su primera línea, visible.
2. **Vive dentro de un bloque de código en un `.md`.** Nunca en un archivo `.sql`, nunca en una
   carpeta `migrations/`, nunca en un archivo con nombre de migración.
3. **No está completo a propósito.** Lleva marcadores explícitos donde falta trabajo, o parámetros
   entre `<...>`, o cuerpos abreviados. Si alguien lo copia tal cual, falla; ésa es la intención.
4. **No trae valores reales de configuración**: ni identificadores de proyecto, ni nombres de rol
   inventados, ni secretos, ni rutas de bucket con datos dentro.

Que un bloque contenga `CREATE FUNCTION`, `REVOKE` o `GRANT` no lo convierte en desplegable: la
cabecera de seguridad de `docs/05-pseudocodigo.md` §A.0.1 los lleva porque **el `GRANT` sólo a
`service_role` es parte del contrato de seguridad**, no un adorno. Lo que lo convertiría en
desplegable es estar completo, resuelto y en un `.sql`.

**Citar una migración ajena como evidencia sí se permite** —`archivo.sql:1055-1070`—, porque eso es
una referencia verificable, no SQL que este repositorio entregue para ejecutar.

---

## 2. Lo que nunca se agrega

Sigue prohibido, sin excepción:

- **SQL desplegable y migraciones.** Ver la prueba de §1.
- **Código ejecutable** de la app, de las Edge Functions o del workflow, listo para copiarse y correr.
- **Secretos, llaves, tokens, cadenas de conexión** y cualquier valor que autentique algo.
- **Datos reales de pacientes:** nombres, teléfonos, mensajes, comprobantes, capturas.
- **Conteos y exportaciones de producción.** Ver §11.
- **Un noveno archivo.** Ver §3.

---

## 3. La lista cerrada: ocho archivos, un dueño por tema

### La cuenta que estaba mal, y cómo queda

Había una contradicción de conteo que hay que dejar zanjada, porque explica por qué existían
archivos que nadie mantenía:

| Fuente | Decía | Por qué |
|---|---|---|
| `AGENTS.md` anterior | **once** archivos, y prohibía «un duodécimo» | Su lista enumeraba `docs/00` a `docs/08` y **se saltaba `docs/09`** |
| `README.md` anterior | **doce** archivos | Su tabla sí incluía `docs/09`, pero **omitía `TRASPASO-AUDITORIA.md`** |
| El disco | **trece** | Los doce del README **más** `TRASPASO-AUDITORIA.md`, que ningún archivo contaba |

Un archivo que ninguna lista cuenta es un archivo que nadie revisa y que envejece contra los demás.
Se acabó: **son ocho, y están enumerados abajo.** Cualquier archivo que aparezca en disco fuera de
esta lista es residuo de la consolidación: **se borra, no se edita**.

### Los ocho

| Archivo | Dueño de |
|---|---|
| `README.md` | Qué es el agente, la arquitectura decidida, el orden de lectura y la jerarquía ante una contradicción |
| `AGENTS.md` | Estas reglas: lista cerrada, frontera del pseudocódigo, arquitectura vigente y lo que no se reintroduce |
| `docs/01-producto.md` | Las **diecinueve reglas numeradas**, qué es y qué no es el agente, identidad y sus estados, dinero, horarios y alcance por fases |
| `docs/02-conversaciones-y-textos.md` | **Todo texto que lee la paciente**, por clave, y los guiones con su conteo de mensajes salientes |
| `docs/03-contratos.md` | Las **once herramientas**: parámetros, RPC de respaldo, resultado de cuatro claves, `espera`, `cierra`, `pending_step`, `allowed_next_tools` y avisos a la profesional |
| `docs/04-workflow-y-prompt.md` | El **workflow de Kapso** nodo por nodo, el **portero** (atestación, bitácora, sello, idempotencia, frenos) y el **prompt** con la configuración del Agent Node |
| `docs/05-pseudocodigo.md` | El **pseudocódigo**: las cuatro RPC del MVP, las rutas del gateway, el pipeline de medios y los once adaptadores |
| `docs/06-implementacion-y-decisiones.md` | El **registro de decisiones y riesgos aceptados**, la evidencia empírica medida, los límites de admisión, el orden de trabajo, el corte a producción y los **pendientes globales** |

**Antes de escribir, se busca el dueño.** Si el tema ya tiene dueño, se edita ahí y los demás
archivos lo citan. Si de verdad no lo tiene, se le asigna uno de los ocho: **no se crea un archivo
nuevo**, y tampoco se resucitan los antiguos `docs/00-el-agente.md` … `docs/09-anotaciones-auditoria.md`
ni `TRASPASO-AUDITORIA.md`, cuyo contenido vigente ya está integrado en los ocho.

---

## 4. Un tema, un dueño: cómo se cita

- **Reglas de producto:** por número, «regla 13». Dueño `docs/01-producto.md` §2.
- **Textos visibles:** por clave, «el texto `paciente_inactivo`». Dueño `docs/02-conversaciones-y-textos.md`.
- **Contratos:** por sección, «`03` §3.2».
- **Siempre por nombre de archivo nuevo y sección.** Nunca por los nombres antiguos.

**Dos reglas llevan el número 7 y las dos siguen vigentes.** La regla 7 de `docs/01-producto.md` §2
es el tope de cinco opciones, el horizonte de treinta días y la excepción de hasta ocho servicios.
La **regla dura 7** del prompt (`docs/04-workflow-y-prompt.md` §C.3) es la del envío literal del
texto. **No se fusionan, no se renumeran y no se borra una creyendo que se borra la otra.**

El orden de precedencia entre archivos está en `README.md` §5 y no se duplica aquí.

---

## 5. La arquitectura vigente

Es una sola y está decidida. Se documenta, no se debate ni se matiza:

- trigger de mensajes entrantes de Kapso, con su lote;
- **filtros deterministas** de identidad y estado antes del modelo, sin gastar tokens;
- **Agent Node** de Kapso, `gpt-5.6-luna`, temperatura `0`, `message_delivery_mode: tool_only`;
- el agente llama **una** herramienta por batch, y es un **webhook tool**;
- ese webhook aterriza en la Edge Function **`agent_tool_gateway`**;
- el gateway llama la **RPC de dominio** en Postgres;
- la RPC **autoriza, muta, avisa a la profesional y compone el texto final**, todo en la misma
  transacción;
- el texto **regresa al Agent Node** dentro de `{texto, espera, hecho, cierra}`;
- el modelo lo manda con **`send_notification_to_user` copiándolo literal** (regla dura 7);
- el turno cierra con **`enter_waiting` o `complete_task`**;
- **once herramientas de dominio**; `send_notification_to_user`, `enter_waiting` y `complete_task`
  son las **únicas** herramientas de control habilitadas;
- verdad, autorización, concurrencia e idempotencia **en el servidor**.

---

## 6. Lo que no se reintroduce

Ninguna de estas ideas vuelve como diseño activo. Varias fueron diseño real en algún borrador; por
eso se enumeran, para que nadie las reproponga creyendo que son nuevas.

**Descartadas en esta versión:**

- **Que el adaptador entregue el texto directamente por la API de Kapso.** Queda descartada.
  `send_notification_to_user` es la **única** vía de salida del texto, y la regla dura 7 se refuerza,
  no se relaja. El riesgo aceptado que eso implica está registrado **una sola vez**, en
  `docs/06-implementacion-y-decisiones.md`; no se repite en los demás archivos ni se reabre la
  decisión.
- **Derivar el `command_id` de un WAMID.** El trigger de mensajes entrantes no expone ninguno. Lo
  acuña el gateway desde (`conversation_id`, contador de turno) y viaja sellado. Ver §7, C2.
- **`pending_tool` a secas**, sin `allowed_next_tools`. Ver §7, C3.
- **`crisis` como texto fijo del prompt.** Es la **undécima herramienta de dominio**: su texto lo
  sirve el servidor y notifica a la profesional en la misma transacción. Ver §7, C4.
- **`dejar_resena` dentro del alcance.** Está pospuesta, con su motivo en `docs/01-producto.md` §6 y
  `docs/03-contratos.md` §6.
- **`consent_status` como bloqueo.** Se ignora a propósito: el agente atiende normal aunque esté en
  `pending`. Es una **decisión explícita**, con motivo y riesgo en el registro de decisiones, nunca
  una omisión que alguien deba «arreglar».
- **Dos máquinas de estado en paralelo.** Sólo hay una. El `TURN_BUSY` que se observó en la prueba
  de agosto pertenecía al diseño anterior y murió con él.

**Descartadas de antes y siguen descartadas:**

- OpenAI ejecutado dentro de `kapso_inbound_webhook`;
- un bucle propio del modelo;
- `whatsapp_conversation_state` o cualquier memoria conversacional propia;
- un candado de sesión durante toda la conversación;
- un cron o `whatsapp_outbox` para contestar el chat (regla 15);
- identificadores internos entregados al modelo (regla 17);
- respuestas de RPC reescritas, resumidas o adornadas por el modelo;
- un único estado `rejected` para toda identidad inválida. **«No te reconocemos» y «paciente
  inactiva» son estados distintos y nunca comparten texto**: el primero es que no existe vínculo, el
  segundo es que existe pero no está activo.

---

## 7. Las correcciones que no se deshacen

Cuatro correcciones y tres ajustes de configuración están decididos. Quien edite un archivo que los
toque, los respeta; quien quiera revertir uno, lo discute antes con el fundador, no en un commit.

| Clave | Qué obliga | Dueño |
|---|---|---|
| **C2** | El **`command_id` lo acuña el gateway** desde (`conversation_id`, contador de turno) y viaja **sellado** en `vars.agent_state`. No se deriva de WAMID, no lo manda el modelo y no lo escribe la paciente | `docs/04-workflow-y-prompt.md` §B.6 |
| **C3** | **`pending_step` + `allowed_next_tools` explícito**, con la tabla productor → consumidores completa. Sin eso, contestar «la 2» después de una lista falla siempre | `docs/03-contratos.md` §2 |
| **C4** | **`crisis` es herramienta de dominio**, la undécima: texto servido por el servidor y aviso a la profesional en la misma transacción | `docs/03-contratos.md` §3.4 y `docs/05-pseudocodigo.md` §A.4 |
| **C5** | **Bitácora append-only** en el gateway, y **`/identity` exige atestación del mensaje entrante**. Acuñar un token sobre una identidad que afirma quien llama es una llave maestra multi-tenant | `docs/04-workflow-y-prompt.md` §B.2 y §B.3 |

Y en el Agent Node:

- **`max_iterations` se fija explícitamente.** El default de Kapso es **80**, no 16. Dejarlo por
  omisión es darle presupuesto de agente autónomo a un asistente que hace una cosa por turno.
- **`get_variable` no se habilita.** Acepta `"*"`, y con eso el modelo podría leer el `agent_state`
  sellado.
- **Ninguna variable interpolada entra al system prompt.** Rompería el prefijo cacheable, y con el
  texto viajando dos veces por turno el caché importa todavía más.

---

## 8. La base y la documentación externa se verifican

El esquema real vive en Supabase y **el proyecto de producción es de sólo lectura**: un hook rebota
cualquier `INSERT`, `UPDATE` o DDL. Antes de describir una tabla, columna, índice, constraint,
trigger, RPC o Edge Function, **se consulta lo desplegado**. Antes de afirmar sintaxis o
comportamiento de Kapso, Meta, Supabase o del proveedor del modelo, **se consulta la documentación
oficial vigente**.

**Toda afirmación de esquema o de documentación externa va con su evidencia**: `archivo:línea`, la
consulta SQL que se ejecutó, o la URL con su fecha de consulta. Lo comprobado en lectura contra
producción se marca *(comprobado AAAA-MM-DD)*.

**Lo que no se pueda comprobar se escribe como pendiente. No se estima y nunca se pone una cifra
inventada.** Ver §14.

---

## 9. Los textos

`docs/02-conversaciones-y-textos.md` es la **fuente única** de lo que lee la paciente. Los demás
archivos citan la clave y no reproducen la frase. **Hay una sola excepción:** el bloque
`<textos_fijos>` del prompt en `docs/04-workflow-y-prompt.md` §C.3, que debe reproducirlos porque el
prompt tiene que poder pegarse en Kapso. Si esa copia y el catálogo difieren, **manda `02`**, y la
copia del prompt se corrige.

La RPC compone `texto`; el Agent Node lo manda **literal** con `send_notification_to_user`. No lo
traduce, corrige, resume, adorna, reordena ni concatena. Cualquier añadido —incluida una coletilla—
lo compone el servidor y llega dentro del mismo `texto`.

**Un texto que lleva un dato lo compone el servidor, siempre.** Precio, fecha, hora, monto, plazo y
nombre salen de la base. Un texto sin datos que el modelo escriba raro se lee raro; un precio o una
fecha que el modelo escriba mal es un daño real.

---

## 10. Seguridad y consistencia

Invariantes que ninguna edición rompe. Cada una tiene su desarrollo en el archivo dueño; aquí están
para que nadie escriba lo contrario por descuido.

- **La identidad y los identificadores internos llegan por contexto confiable**, nunca por
  parámetros que controle el modelo (regla 17).
- **Se resuelve siempre desde `whatsapp_link.id`**, nunca desde un `p_patient_id` suelto.
- **«Relación activa» se define contra `patients.patient_status` = `active` | `inactive`.** No se
  inventa otro predicado.
- **Cada RPC vuelve a comprobar identidad, relación, propiedad y estado dentro de su transacción.**
  Que el gateway ya haya autorizado no exime a la RPC.
- **Las RPC nuevas nacen cerradas:** `REVOKE` a `PUBLIC`, `anon`, `authenticated` y `service_role`, y
  después `GRANT EXECUTE` **sólo a `service_role`**. Nunca `authenticated`: estas funciones reciben
  el tenant como parámetro, así que ese `GRANT` es la única defensa que queda.
- **Una mutación y su aviso a la profesional son atómicos** (regla 13). `notifications` es el único
  canal con Realtime hacia la app, y su payload exige claves literales o degrada al aviso neutro.
- **Los bloqueos son cortos y transaccionales**, alrededor de la lectura y la escritura de negocio.
  No hay candado de sesión.
- **Ninguna propuesta borra o cambia objetos que hoy usan Flutter o los avisos vigentes.** Los
  enums cerrados del parser de Flutter lanzan `FormatException` y tumban la lista entera, y
  `payment_view` es exhaustivo: un valor desconocido deja la cita sin ninguna acción económica.
- **Los frenos de admisión no son opcionales.** Sus valores viven en
  `docs/06-implementacion-y-decisiones.md` y se citan de ahí, no se copian con otro número.

---

## 11. Los plazos, el género y los ejemplos

- **Ningún plazo se escribe a mano** (regla 2): sale de la configuración de la profesional.
- **Los textos no asignan género a la paciente.** A la profesional se le nombra por su nombre de
  pila.
- **Las reglas hablan de lo que cada profesional configura, no de la muestra que exista hoy.** Si un
  ejemplo necesita un nombre, un precio o una hora, se inventan y **se marcan como ejemplo**. Un
  conteo de producción no es evidencia de una regla: es un dato que cambia mañana.

---

## 12. Tono y forma

Español de México, claro y directo. Sin relleno corporativo, sin emojis, sin afirmaciones no
comprobadas. **Cada decisión técnica no obvia lleva su motivo y su riesgo**; una decisión sin motivo
escrito es una decisión que alguien va a revertir por error dentro de seis meses.

Son documentos largos y consolidados: **índice al inicio y encabezados claros**. Nada de `TODO` ni
secciones a medias: lo que falta se escribe como pendiente (§14).

---

## 13. Mermaid

Se permite un diagrama **sólo cuando aporta** algo que el texto no dice mejor. La regla anterior
—«sólo dos diagramas, uno en `docs/00` y otro en `docs/07`»— se retira: nombraba archivos que ya no
existen.

Reglas de forma: `flowchart LR` o `flowchart TD`, **etiquetas entre comillas y sin acentos**, sin
estilos y sin subgrafos anidados. Un diagrama que sólo repite la lista de arriba se borra.

---

## 14. Cómo se escribe un pendiente

Un pendiente no es una nota suelta. Lleva las cuatro cosas:

1. **Qué falta**, en una frase.
2. **Qué se intentó y con qué resultado**, incluidas las fuentes consultadas y su fecha.
3. **Qué se hace mientras tanto**, si hay que hacer algo.
4. **Quién lo cierra y con qué evidencia** bastaría para cerrarlo.

Si dos fuentes se contradicen, **se escriben las dos enfrentadas** y no se elige por intuición ni se
promedia. Nunca se pone una cifra que no se pudo verificar.

Cada archivo cierra con su sección de pendientes; los que afectan al proyecto entero se recogen
además en `docs/06-implementacion-y-decisiones.md`, que es su dueño.
