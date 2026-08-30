# Cómo se edita este repositorio

Aquí vive la documentación del agente de WhatsApp de Agenda Psi: once archivos en español que dicen
qué hace el agente, qué contesta palabra por palabra y qué falta construir. No hay implementación.
Las migraciones, las funciones de la base y el código de la función de borde se escriben y se
aplican en `agente_ia`; aquí se decide qué tienen que hacer. Estas reglas valen igual para una
persona y para un agente. Quien no pueda cumplir una, pregunta antes de escribir.

## 1. Lo que nunca se agrega

- **Migraciones `.sql`.** Se aplican en `agente_ia`; una copia aquí envejece sin que nadie se
  entere y termina contradiciendo a lo desplegado.
- **Secretos.** Llaves, tokens, cadenas de conexión: en un repo de documentación no tienen dónde
  caducar.
- **Datos de pacientes.** Ni nombres, ni teléfonos, ni capturas de conversaciones reales. Los
  ejemplos se inventan.
- **Exportaciones vivas.** Un volcado envejece en horas y a la semana es un número inventado con
  aspecto de dato.

Son once archivos y ni uno más. Cada tema tiene un solo dueño, y el orden de lectura está en
`README.md`. Antes de escribir un párrafo se busca dónde vive ya ese tema: si vive en otro archivo,
se cita en vez de repetirlo.

## 2. La lista cerrada

Estos once archivos describen un solo agente: el que conversa por texto, corre dentro de nuestra
función de borde y nunca redacta lo que contesta —el texto viene hecho, del prompt o del servidor—.
Antes hubo otros diseños, y de ninguno queda nada aquí.

**Ninguna pieza de un diseño anterior aparece en ningún archivo.** No se menciona «para contexto»,
no se explica «por si acaso», no va en una nota al pie, ni en un ejemplo, ni en un comentario del
prompt, ni siquiera para decir que se retiró. La regla cubre los nombres propios de esas piezas
—funciones, rutas, estados, herramientas, claves de texto— y también las cifras que la base
desmintió después.

**Lo que se retiró en la última ronda.** Se nombra aquí una sola vez, y sólo para que quien edite lo
reconozca y lo quite:

- **El agente corriendo en Kapso:** su flujo de trabajo, su nodo de agente, sus funciones y sus
  formularios. El modelo corre en nuestra función de borde, y Kapso quedó como mensajería.
- **La pasarela entre el modelo y la base.** Ya no hay intermediario: la función de borde llama
  directo a las funciones de la base.
- **El turno con sus estados, dormir y despertar, y la sincronización de la espera.** Existían para
  que Kapso pudiera pausar una ejecución. Ya no hay ejecución que pausar.
- **El presupuesto de doce llamadas por gestión y el ordinal reservado al cierre.** El freno de hoy
  es otro y se cuenta por mensaje.
- **El candado del dinero,** la regla de que una cita con pago no se cancelaba. Hoy sí se cancela.
- **La cancelación automática del prepago,** y con ella la frase de que la cita se cancela si el
  comprobante no llega en veinticuatro horas. Nada cancela citas solo, así que ese reloj no existe
  en ningún texto.
- **`no_pudimos_saber`** y cualquier respuesta que deje a la paciente sin saber si su petición
  ocurrió. Si el servidor no está seguro, lee de vuelta y contesta con certeza.
- **`pasar_pago` como función,** con su ficha, su parámetro, su fila en el enrutamiento, su flujo
  propio y su renglón en la tabla de candidatas. Pasar el pago a la próxima cita es hoy una salida
  que el servidor ofrece cuando ya comprobó que hay dinero adentro, y se ejecuta con un booleano de
  la función en curso: `cancelar(pasa_el_pago: true)` o `reprogramar(a_la_proxima: true)`. Así el
  modelo no puede mover dinero sobre una cita que él eligió. Y si el traslado no se puede hacer
  porque la cita destino ya traía su propio cobro, **se cancela igual y no se le dice nada**: no hay
  texto para ese caso, sólo el cierre normal con la coletilla del pago registrado.
- **El parámetro `mover_cita`.** La cita que se está moviendo la guarda el servidor en la memoria
  de la conversación, en la columna `subject`, y con eso un número de lista sólo vale contra la
  última lista de esa función, sin ninguna excepción.
- **`vas_muy_rapido`** y las piezas que lo sostenían. Nunca se definió el tope, ni la ventana, ni
  dónde se contaba, así que era una protección escrita y no construida. Los dos frenos de tráfico que sí
  existen son el agrupamiento de la mensajería y el candado por conversación.

**De rondas anteriores siguen fuera:** el expediente y su función de apertura, los identificadores
opacos con sus tokens y sus errores, el traspaso a una persona —el soporte es otro número donde
también vive el agente—, los formularios de WhatsApp con sus pantallas y sus rutas, las funciones de
marketplace para la paciente, y el estado `ambiguous` de identidad.

La prueba es corta: si un párrafo sólo se entiende contrastándolo con algo que ya no existe, está
mal escrito. Se reescribe diciendo lo que el agente hace hoy, y con eso se acaba. Quien dude de si
algo cae en la lista pregunta antes de escribirlo, porque adivinar aquí sale caro: cada concepto
viejo que sobrevive en un renglón le enseña al siguiente lector una arquitectura que ya nadie va a
construir.

**La excepción es este archivo.** La lista de arriba es el único lugar donde esos nombres se
escriben como diseño. `docs/08-implementacion.md` nombra además los objetos que ya se borraron de la
base, y sólo ésos, porque contar qué se borró es su trabajo. Ningún otro archivo los menciona.

## 3. Datos de producción, ninguno

**Ningún archivo cita datos de producción.** Ni cuántas profesionales hay, ni cuál cobra por
adelantado, ni cuántas pacientes tiene alguien, ni el precio de un servicio real. Lo que hoy está en
la base son datos de prueba, y el agente va a atender a muchas profesionales con políticas, nombres
y precios distintos.

Las reglas se escriben sobre **lo que cada profesional configura**, nunca sobre lo que hoy tiene
configurado. Un renglón que dice «sólo una cobra antes de la sesión» deja de ser cierto el día que
entre la segunda, y nadie va a volver a leerlo para corregirlo.

Los ejemplos usan nombres inventados y se marcan como ejemplos, para que nadie los lea como una
política vigente de alguien.

## 4. Los números

Ninguno se escribe sin haberlo leído de lo desplegado. **Ni de memoria, ni de un corte anterior, ni
de otro archivo de este repo.** Lo escrito no es evidencia: lo que un repositorio declara y lo que
corre se separan solos, y con este agente ya se separaron. Si un número no se pudo verificar, se
dice «no se pudo comprobar»: **no se estima, no se redondea y no se hereda.** Los números que sí se
escriben son los del sistema —la ventana del aviso automático, el tope de llamadas por mensaje, los
plazos y las vueltas del recorrido de un mensaje, la ventana de agrupamiento de la mensajería, la
vigencia de la memoria y los días que se guarda el texto—, iguales para todas las profesionales y
cada uno con un solo archivo dueño. El número que se leyó de lo desplegado lleva su fecha de corte.

**Los conteos también son números.** Cada uno se recalcula en su archivo dueño y los demás lo citan
en vez de repetirlo: las diecinueve reglas, en `docs/00-el-agente.md`; los ocho flujos, en
`docs/01-conversaciones.md`; el catálogo de **diez funciones**, en `docs/02-funciones.md`; el índice
de claves de texto, en `docs/06-textos.md`. Quien agregue o quite una pieza corrige primero al dueño
y después las citas. Un conteo escrito a mano en cuatro archivos se queda viejo en tres.

## 5. Los textos

`docs/06-textos.md` es la **única** fuente de lo que la paciente lee. Los demás archivos citan por
clave —«el texto `paciente_inactivo`»— y sólo reproducen la frase en dos sitios: en
`docs/01-conversaciones.md`, cuando la conversación no se entiende sin ella, y en
`docs/05-prompt.md`, porque los textos de prompt viajan literales dentro del prompt. Si una cita y
`06` difieren, **manda `06`**. Ningún texto se retoca fuera de `06`: se corrige ahí y después se
arrastra la cita, así una frase nunca tiene dos versiones vivas.

## 6. Los plazos

Ningún plazo se escribe a mano dentro de un texto que la paciente lee. El aviso de cambio sale de la
ficha de su profesional, viaja en un hueco y sólo aparece en los avisos de cambio. Las profesionales
no piden el mismo aviso, así que un «24 horas» escrito a mano le miente a las pacientes de quien
pide 48, y esa mentira les cuesta un cargo. No hay excepciones. La anticipación mínima también sale
de la ficha, pero nunca se le dice: recorta los días que se le ofrecen y ahí se acaba. El único
plazo que no sale de una ficha es la ventana del aviso automático, que es una constante del sistema,
igual para todas, y no aparece dentro de ningún texto.

## 7. El género

Hay pacientes hombres. **Ningún texto asume género en la paciente:** ni «activa» ni «activo»
aplicados a ella; se rodea la frase. A la profesional se le nombra por su nombre de pila, nunca «él»
ni «ella», aunque el nombre se repita dos veces en tres renglones.

## 8. Lo que no se propone

**Nada de lo que se escriba propone borrar tablas, RLS, RPC, triggers, cron, buckets ni ningún
objeto que use la app Flutter.** Si un objeto lo toca la app, se queda. Sin excepciones y sin
matices: varias piezas que parecen del agente por el nombre las escribe o las lee la app dentro de
la misma transacción, y quitarlas rompe cosas que las profesionales usan a diario.
`docs/08-implementacion.md` sólo habla de lo que se construye; lo que ya se borró del andamio del
agente se cuenta ahí como hecho, no como propuesta.

Esta regla estaba numerada en `docs/00-el-agente.md` y se mudó aquí: es una regla de cómo se edita
el repositorio, no de cómo se comporta el agente. Allá ya no está y no se cita por número, así que
quien la necesite la lee en este renglón.

## 9. El tono

Español de México. Prosa clara y directa, frases cortas, y el **por qué** de cada decisión en la
misma línea o en la siguiente. Sin relleno corporativo, sin emojis, sin exclamaciones, sin «es
importante notar que», sin «en resumen». Nada de accesibilidad opcional, blindajes defensivos ni
soporte de casos que el producto no atiende hoy. Un archivo corto que dice todo es mejor que uno
largo que se repite. Se escribe «la profesional» y «la paciente».

## 10. Mermaid

Sólo dos diagramas en todo el repositorio: el grafo del modelo en `docs/00-el-agente.md` y el
recorrido de un mensaje en `docs/07-portero.md`. Un diagrama por archivo como máximo, y sólo en esos
dos. Sólo `flowchart LR` o `flowchart TD`, sin colores, sin estilos, sin subgrafos anidados. Las
etiquetas van entre comillas, en español y **sin acentos**, porque el renderizador se los come. Si
un diagrama necesita una leyenda para entenderse, no sirve: se escribe en prosa.
