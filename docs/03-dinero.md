# 03 · El dinero

Corte: 2026-08-29.

Este archivo contesta una sola pregunta: **qué le pasa al cobro en cada acción**. Las fichas de las
diez funciones están en `docs/02-funciones.md`. Los textos completos están en `docs/06-textos.md`,
que es la única fuente de lo que la paciente lee; aquí se citan por clave y no se reescriben. Las
reglas generales están en `docs/00-el-agente.md`.

**Nada de aquí describe una base concreta.** Cada regla se escribe sobre **lo que cada profesional
configura** —si cobra antes o después, cuánto plazo de aviso pide, cuánta anticipación mínima exige,
qué precio tiene cada servicio—, nunca sobre lo que alguien tenga configurado hoy. Los nombres y las
cifras de los ejemplos son inventados y se marcan como ejemplos.

**Lo que parte este archivo en dos es el reloj.** Con tiempo mínimo de aviso, el cobro nuevo hereda
lo que el viejo tenía. Sin tiempo mínimo, el viejo se congela donde está y el nuevo nace desde cero.
Casi todo lo demás es consecuencia de esas dos líneas.

---

## 1. Las cuatro reglas del dinero

Son cuatro, no diez. Las otras seis que estaban aquí son las reglas 4, 5, 6, 10, 13 y 15 de
`docs/00-el-agente.md` §5 escritas otra vez, y repetirlas hacía que el repositorio citara «la regla
5» y «(D3)» como si fueran cosas distintas. Se leen allá y no se copian aquí.

**D1 · Los plazos salen de la ficha de cada profesional. La única constante del producto son las 26
horas.** Ningún plazo de aviso ni de anticipación se escribe a mano (regla 2). Lo único fijo es la
ventana de 26 horas, que decide si una cita nace confirmada y cuándo sale el recordatorio del
comprobante. Es un solo número para todas, y es el mismo que ya usa el trabajo programado, para que
el agente y el aviso automático nunca se pisen.

**D2 · La decisión de cobro sólo se abre cuando el cambio fue tarde.** Es la única situación donde
queda un cargo que alguien tiene que resolver, y sus dos salidas son cobrar o no cobrar. La abre el
agente al cancelar o al mover sin el aviso mínimo, y **la cierra siempre la profesional**, desde su
app. **En ningún caso se cobra solo.**

**Todo lo demás no la toca.** Agendar, confirmar, cancelar a tiempo y mover a tiempo no abren
ninguna decisión: o no hay cargo, o el cobro simplemente viaja con la cita. Y **mandar el
comprobante tampoco**: pega el archivo y el cobro sigue pendiente. Acreditarlo es otra cosa, es de
la profesional, y no tiene nada que ver con el aviso mínimo.

**D3 · Cuando una cita se cierra, el motivo del cobro se reclasifica en el mismo acto.** De «sesión»
a «cancelación» o a «cambio». Es la parte que no se puede olvidar: sin ella la fila desaparece de la
facturación **aunque la profesional decida cobrar**, sin error y sin aviso.

**D4 · Ninguna operación del agente cambia el importe de un cobro.** Ni al congelarlo, ni al
heredarlo, ni al trasladarlo: el importe viaja tal como estaba. Si deja de coincidir con el precio
de la cita donde acaba, **lo ajusta la profesional desde su app**, que es donde se ajustan los
importes. El agente no tiene esa acción y no debe tenerla.

---

## 2. Las dos definiciones que viven aquí y en ningún otro sitio

Los demás archivos las citan por número de sección. Si se duplicaran, aparecerían citas a las que
una mitad del sistema le ofrece mover un dinero que la otra mitad no ve.

### 2.1 «Dinero adentro»

Un cobro tiene dinero adentro cuando **está acreditado** o cuando **tiene un comprobante pegado**.
Nada más. **Un cobro al que sólo se le pidió comprobante, sin archivo, no es dinero adentro:** una
petición es una petición, no entró nada.

Los cinco estados en que el agente se puede encontrar un cobro, **evaluados en este orden**:

| Orden | Estado | Cómo se reconoce | ¿Dinero adentro? |
|---|---|---|---|
| 1 | Acreditado | El cobro ya entró, de un prepago o de una sesión cobrada | **sí** |
| 2 | Comprobante recibido | Llegó el archivo, nadie lo ha revisado | **sí** |
| 3 | Comprobante pedido | Se selló la petición, no llegó archivo | **no** |
| 4 | Pendiente desnudo | Se debe y nadie ha pedido nada | no |
| 5 | Sin costo | El precio efectivo es cero | no |

Si una petición sellada contara como dinero, cada cita de prepago que sólo espera comprobante
arrastraría ofertas de traslado sin que haya entrado un peso.

### 2.2 La precedencia: acreditado gana siempre sobre comprobante

**Los dos estados conviven.** Acreditar no borra el comprobante: el camino normal es que ella mande
el archivo y después la profesional acredite, así que el estado más común de un prepago resuelto es
los dos a la vez. La tabla de arriba no son filas disjuntas, es un orden de lectura.

Sin esa precedencia escrita, tres decisiones se quedan sin dato para tomarse:

- Qué primera línea sale al ofrecer las salidas de una cita con dinero adentro: «ya está pagada» o
  «ya mandaste tu comprobante».
- Qué coletilla lleva el cierre de cancelar.
- Qué fila de la tabla de §5.6 aplica a un cobro congelado.

Las tres las escoge el servidor, no el modelo, y las tres se resuelven igual: **acreditado con
comprobante pegado se lee como acreditado**, porque el archivo ya se revisó.

### 2.3 «Cobro esperando comprobante»

Es **todo cobro suyo que siga pendiente, con la petición sellada y sin archivo pegado**, sin
importar el estado de la cita —programada, cancelada, movida o pasada—. De una serie, sólo el de la
ocurrencia más próxima. Es lo que decide las candidatas de `mandar_comprobante` y lo que contesta
`mis_citas` cuando pregunta cuánto debe.

**La petición sellada es la condición, y es una sola regla para las dos formas de cobrar.** Lo que
cambia entre ellas es cuándo se sella:

- **Cobra por adelantado:** se sella al agendar, automáticamente. Acepta comprobante desde el
  primer momento.
- **Cobra después:** se sella cuando la profesional lo pide desde su app, normalmente al cerrar la
  sesión. Antes de eso no acepta comprobante, porque nadie se lo ha pedido.

Recibir comprobantes sigue aplicando **a todas las profesionales** (regla 6): lo que las distingue
no es si se acepta, es cuándo se pide.

**Y un cobro sin petición sellada no es una deuda todavía.** Con cobro después, la cita nace con su
cobro pendiente desde que se agenda, pero decirle que debe $800 por una sesión que aún no ocurre y
que nadie le ha cobrado sería inventarle una deuda. Por eso la misma condición gobierna las dos
cosas: lo que acepta comprobante y lo que se le dice que debe.

Si manda un comprobante y no hay ningún cobro sellado, el agente se lo dice y le da la salida:
`comprobante_nada_esperando` le pide que se lo mande directo a su profesional. Ése es el mensaje
correcto, no un hueco.

**Un cambio tardío cuenta como deuda desde que se avisó**, aunque la profesional todavía no haya
resuelto si lo cobra. La razón es simple: **el agente ya se lo dijo**. Al cancelar o mover sin el
aviso mínimo le dijo que se le cobra la sesión, y si después pregunta cuánto debe y no aparece,
va a creer que al final no se cobró — y luego se lo cobran. Eso es peor que adelantarse.

Deja de contar **sólo si la profesional resuelve que no se cobra**. Ahí sí desaparece, porque ahí sí
hay una respuesta.

Nada de esto rompe la regla 5 de `docs/00-el-agente.md`: no se le dice que su profesional está
decidiendo, se le dice lo que ya se le había dicho. La decisión sigue siendo de ella y sigue sin
contarse.

#### Esto es casi lo mismo que ve la profesional en Cobros

Comprobado contra la base. Cobros cuenta un cobro cuando se juntan cuatro cosas: la cita **ya se
cerró** —asistió, no asistió, se canceló o se movió—, el motivo del cobro corresponde a ese cierre,
no hay una decisión tardía abierta ni resuelta como «no cobrar», y el cobro está acreditado o
pendiente **con la petición hecha o con comprobante**. Las dos últimas son exactamente las nuestras.

**Y hay dos sitios donde el agente cuenta algo que Cobros no**, los dos a propósito:

- **El prepago de una cita futura.** Esa cita todavía no se cierra, así que no aparece en Cobros —
  pero a ella sí le pidieron pagar para confirmarla, y sí lo debe.
- **El cambio tardío con la decisión abierta.** Cobros lo esconde mientras la profesional no
  decida, y eso es justo el problema conocido del §9.2: mientras sigue abierta **no la ve nadie**.
  Copiar ese hueco en el agente sería propagar un defecto, no alinearse.

En todo lo demás los dos dicen lo mismo.

---

## 3. La matriz

### 3.1 Las acciones que el reloj no toca

| Acción | Qué le pasa al cobro | Qué ve la profesional en el dinero | Qué se le dice a la paciente |
|---|---|---|---|
| **Agendar**, cobra después, faltan más de 26 h | Nace un cobro pendiente por la sesión, sin petición de comprobante | Nada. Cobra al cerrar la sesión, como siempre | `agendar_cierre_cobra_despues`. **Ni una palabra de pago** |
| **Agendar**, cobra después, faltan menos de 26 h | Igual, y la cita **nace confirmada** | Nada | `agendar_cierre_cobra_despues`, el mismo |
| **Agendar**, cobra por adelantado | Nace pendiente **y con la petición sellada**, siempre, falte lo que falte | Ve que se pidió y no ha llegado. Nada más hasta que entre el archivo | `agendar_cierre_prepago`, con el monto y el hueco `{como_pagar}` |
| **Agendar**, precio efectivo cero | Nace sin costo, aunque esa profesional cobre por adelantado | Nada | `agendar_cierre_cobra_despues`. No se menciona dinero |
| **Confirmar**, cobra después | No se toca | Nada | `confirmar_cierre` |
| **Confirmar**, cobra antes y no hay comprobante | No se toca, **y la cita no queda confirmada** | Nada | `comprobante_pedido`. Lo que confirma es el archivo |
| **Confirmar**, cobra antes y ya mandó comprobante | No se toca | Nada | `confirmar_cierre`. No se le pide dos veces lo que ya mandó |
| **Mandar comprobante** | **No cambia de estado.** Sigue pendiente; lo que entra es el archivo. Si la cita sigue viva y en el futuro, queda confirmada | El aviso del comprobante, y decide: acreditar o condonar | `comprobante_acuse`. **Nunca «pagado»** |
| **Cambiar modalidad** | **No toca dinero nunca.** No hay versión tardía con cargo | Nada | `modalidad_cierre` |
| **Dejar reseña** | No toca dinero | Nada, a propósito | `resena_gracias` |

### 3.2 Las acciones que el reloj parte en dos

La regla entera, en dos líneas: **con tiempo mínimo de aviso el cobro nuevo hereda lo que el viejo
tenía; sin tiempo mínimo el viejo se congela donde está y el nuevo nace desde cero.** Por eso, sin
tiempo mínimo, se cobran las dos sesiones, y por eso el aviso va **antes** de mover y no después.

| Acción | Con tiempo mínimo | Sin tiempo mínimo |
|---|---|---|
| **Reprogramar** | El cobro viejo se salda como pasado adelante y **el nuevo hereda**: acreditado nace acreditado; con comprobante, el comprobante se copia y **no se le vuelve a pedir**; pendiente a secas nace pendiente y ahí manda cómo cobra esa profesional; sin costo nace sin costo. Cierre `reprogramar_cierre`, o `reprogramar_cierre_prepago` cuando el nuevo queda pendiente de prepago | El cobro viejo **no se salda**: se congela tal como esté sobre la cita movida, con la decisión abierta. El nuevo **nace desde cero**, tratado según cómo cobre esa profesional. Antes de mover, `reprogramar_aviso_tardio`; al cerrar, `reprogramar_cierre` o `reprogramar_cierre_prepago` |
| **Pasar la cita de la serie a su próxima** | La vieja **queda cancelada**, la ocurrencia que ya existía no se toca, y el pago viaja a ella si lo había. Cierre `reprogramar_pasada_a_la_proxima` | La vieja queda cancelada con su cobro **congelado**: el pago **no viaja**. La próxima sigue en pie tal cual. Cierre `reprogramar_pasada_a_la_proxima_tarde`, sin la frase del pago mudado |
| **Cancelar**, sin dinero adentro | El cobro pendiente **se condona**. Tarjeta «No cobrada», sin botones. Cierre `cancelar_cierre` con la coletilla de que no le queda nada pendiente | Se avisa antes (`cancelar_aviso_tardio`), y al confirmar el cobro **se congela** con la decisión abierta. Cierre `cancelar_cierre` sin coletilla: el cargo ya se avisó |
| **Cancelar**, con dinero adentro | Se ofrecen las salidas (§3.3). Si dice que no, se cancela y **el cobro se congela tal como estaba**, con la decisión abierta | **No se ofrece nada: se cancela.** El cobro se congela con la decisión abierta, y el cierre dice el cargo dentro del mismo mensaje |

Tres precisiones que valen para toda la tabla:

- **El aviso de que se cobra no depende de si ya pagó.** Depende de que el precio efectivo sea mayor
  que cero. Es lo único que hace que el plazo signifique algo para quien cobra al cerrar la sesión.
  Con precio cero no se menciona dinero: decirle «se te cobra» de una sesión de cero pesos es
  mentirle en la otra dirección. La separación completa está en §5.1.
- **Mover se permite sin importar cuánto falte, pero el horario nuevo tiene que caber en la
  anticipación mínima de esa profesional.** Son dos números distintos de la misma ficha y contestan
  preguntas distintas: el plazo de aviso decide si hay cargo, la anticipación mínima decide desde
  cuándo se puede tomar un horario. Pueden aparecer los dos en la misma gestión, y no es un error.
  **Cancelar no toca la anticipación mínima**, porque cancelar no toma ningún horario, y **pasar el
  pago a una ocurrencia que ya existe tampoco**, porque ese horario ya estaba apartado.
- **Condonar y congelar se distinguen también en la cola de avisos.** Al condonar, los avisos de
  comprobante que quedaban pendientes se apagan solos, que es justo lo que hace falta: si no, ella
  recibiría después una petición del dinero de una cita que ya no existe. Al congelar no se apagan, y
  también es lo que hace falta: ese cobro sigue vivo y la profesional puede decidir cobrarlo.

### 3.3 Qué se le ofrece antes de cancelar

Pasar el pago dejó de ser una función del catálogo. Es una salida que el servidor ofrece, y la ofrece
sólo cuando ya comprobó que se puede (§7). Por eso esta tabla vive pegada a cancelar.

| Situación de la cita | Qué se le ofrece antes | Texto |
|---|---|---|
| Sin dinero adentro | Nada. Se cancela, o se avisa del cargo y se cancela | `cancelar_cierre` · `cancelar_aviso_tardio` |
| Con dinero adentro, a tiempo, sin próxima viva de su serie | Sólo reprogramarla, y el pago se va con ella | `cancelar_dinero_adentro` |
| Con dinero adentro, a tiempo, con próxima viva de su serie | Reprogramarla, **o** cancelar ésta y dejar el pago en la próxima | `cancelar_dinero_adentro_con_proxima` |
| Con dinero adentro, sin tiempo mínimo | **Nada. Se cancela**, y el cierre dice el cargo | `cancelar_dinero_adentro_tarde` |

**Fuera de plazo no se ofrece nada, y las dos salidas se caen por razones distintas.** Mover no le
ahorra el cargo: fuera de plazo se cobran las dos sesiones igual, así que ofrecerlo sólo alarga la
conversación sin mejorarle nada. Y dejar el pago en la próxima **no se puede**: fuera de plazo el
pago se queda en la cancelada, y trasladarlo cerraría el cobro viejo como condonado con motivo —en
Cobros eso se lee «no se cobró»— y la profesional perdería el cargo que su propia política le
concede.

### 3.4 Movimientos de dinero que el agente no produce

Se documentan porque el agente **se los encuentra**, no porque los haga.

| Movimiento | Quién lo hace | Qué significa para el agente |
|---|---|---|
| Marcar que no asistió | La profesional, desde su app | Deja un cobro pendiente por la falta. Ese cobro es candidato de `mandar_comprobante` como cualquier otro |
| Cerrar la sesión como asistida | La profesional | Nada. El agente no cobra sesiones |
| Cobrar o condonar una decisión abierta | La profesional | El agente no llama a ninguna de esas acciones y no le dice a la paciente cuál se tomó (§9.1) |
| Ajustar el importe de un cobro | La profesional, desde su app | Es la salida cuando un pago acaba sobre una sesión que cuesta distinto (§7.4) |
| Pasar la cita a revisión cuando llega su hora | El barrido de citas vencidas | La cita deja de estar programada y sale del alcance del agente. El cobro sigue vivo (§4.3) |
| Devoluciones y descuentos | La profesional, fuera de la app | Texto `asunto_de_dinero`, cero llamadas |

**Lo que ya no existe: nada cancela citas solo.** No hay reloj que mate una cita de prepago sin
comprobante ni ninguna otra cita por su cuenta.

---

## 4. El prepago completo

Aplica cuando esa profesional cobra por adelantado **y** el precio efectivo es mayor que cero.

### 4.1 La cita nace apartada, sin confirmar y con el comprobante pedido

Al agendar, la cita queda apartada y **nunca confirmada**, y en la misma escritura se sella la
petición de comprobante. El cierre lleva el importe y el hueco `{como_pagar}`, que el servidor
rellena con los datos de transferencia del perfil o con la salida de pedírselos a su profesional.

Que no nazca confirmada tiene dos razones, y las dos apuntan al mismo sitio:

1. **El comprobante es lo que confirma.** Si la cita naciera confirmada, el acuse del comprobante
   —«ya quedó confirmada»— sería falso: ya lo estaba.
2. **La profesional necesita ver la diferencia.** Apartada, sin confirmar y con el comprobante pedido
   es exactamente la forma de «se pidió y no ha llegado». Nacer confirmada borraría esa señal justo
   cuando le sirve.

**Con prepago, la ventana de 26 horas no decide si la cita nace confirmada:** no nace confirmada
nunca, falte lo que falte. Pero sí se consulta para una cosa. **Si la cita cae dentro de la ventana,
no se encola el recordatorio del comprobante**, porque el cierre de agendar acaba de darle los datos
para transferir y la plantilla llegaría minutos después pidiéndole lo mismo.

### 4.2 Decir «sí voy» no confirma, salvo si ya mandó el comprobante

Con prepago, `confirmar` **no muta**: devuelve la petición del comprobante y ahí se queda. Lo que
confirma es el archivo. Cuando el archivo llega, `mandar_comprobante` lo pega y **confirma la cita en
el mismo acto**, siempre que siga viva y en el futuro. El cobro sigue pendiente: recibir no es
acreditar, y el agente no acredita nunca.

**Si ella ya mandó su comprobante, no se le pide de nuevo** y «sí voy» confirma normal, como con
cualquier otra profesional. Volver a pedir lo que ya está pegado es el error que más rápido le enseña
a la paciente que nadie está leyendo.

### 4.3 Si el comprobante no llega: nada la cancela, pero a su hora sale del alcance del agente

**Nada la cancela.** No hay reloj que cierre citas. Hasta la hora de la sesión la cita se queda
apartada, sin confirmar y con el comprobante pedido, que es la única forma de que la profesional vea
en su app que se pidió un pago y no ha llegado.

**Lo que sí pasa, a la hora de la sesión, es que el barrido de citas vencidas la pasa a «Revisar»**,
como a cualquier otra cita que llegó a su hora sin cerrarse. Ahí la profesional la cierra como
asistida o como falta, y resuelve el cobro. No se cancela, pero tampoco se queda como estaba.

**Consecuencia para la paciente, y es un límite, no un detalle:** al dejar de estar programada, esa
cita desaparece de `mis_citas` y de las candidatas de `cancelar` y de `reprogramar`. Si esa misma
tarde pregunta «¿qué tengo?», ya no la ve. **Su cobro sigue vivo y el comprobante se le puede seguir
pegando**, precisamente porque las candidatas de `mandar_comprobante` son cobros y no citas (§2.3).

**Ningún cierre de prepago le pone plazo al comprobante y ninguno amenaza con cancelar.** Lo único
automático es el recordatorio por plantilla, del trabajo programado, cuando faltan 26 horas para la
sesión —y no sale cuando la cita se agendó dentro de esa misma ventana (§4.1)—.

**Si tiene un comprobante pendiente y escribe por otra cosa, el agente no lo menciona.** Contesta lo
que le preguntaron y ya. Colgarle el pendiente a cada mensaje convierte al agente en cobrador, y no
lo es: el recordatorio ya sale solo y a su hora.

**Lo que se acepta a cambio.** El horario no se libera solo, así que una cita de prepago que nunca se
pagó ocupa un hueco hasta que la profesional la cierre. Es un costo elegido: liberar el horario
obliga a cancelar la cita, y cancelar citas por su cuenta es justo lo que una máquina no debe hacer.

---

## 5. El cambio tardío

### 5.1 Dos preguntas distintas que hoy estaban mezcladas

Se separan aquí y no se vuelven a mezclar en ningún documento:

**¿Se avisa que se cobra?** Sí, siempre que el precio efectivo sea mayor que cero, **aunque no haya
pagado nada**. Una sesión de quien cobra al cerrar, sin comprobante y sin acreditar, tiene precio
distinto de cero: si no se avisara, el plazo de aviso no significaría nada para la mitad de las
profesionales. Con precio efectivo cero no se avisa.

**¿Se mueve dinero, y hay que decirle a dónde?** Sólo cuando hay dinero adentro (§2.1). Sin dinero
adentro no se nombra ningún traslado, ninguna herencia y ninguna congelación: no hay nada que mover.

Mezclarlas dejaba sin decidir la mitad de las cancelaciones tardías —las de quien cobra al cerrar la
sesión y todavía no ha pagado—, que son justo las que más se dan.

**Lo que el aviso de cambio ya no hace es bloquear.** Cancelar y reprogramar se permiten sin
importar cuánto falte; el aviso sólo decide si queda un cargo. Lo que sí acota el horario nuevo al
mover es la anticipación mínima, que es otro campo de la ficha (§3.2). La excepción vive fuera de
este archivo: **el cambio de modalidad sí sigue bloqueado por el aviso de cambio**, porque la
profesional necesita saber con tiempo si va al consultorio. Y es, precisamente, el único cambio que
no toca dinero.

**Lo que el aviso sí bloquea dentro de este archivo es una sola cosa: pasar el pago a la próxima**
(§7.1). No es una excepción al párrafo anterior: la cita se cancela igual, lo que no se hace es
mudarle el dinero.

### 5.2 Reprogramar sin tiempo mínimo: se cobran las dos sesiones

**La regla cabe en una línea, igual que la otra: el cobro viejo se queda donde está y la cita nueva
nace con el suyo.** Y el cobro nuevo se trata según cómo cobre esa profesional, como si fuera una
cita recién agendada. El aviso lo dice con esas palabras porque eso es lo que pasa:

- **El cobro viejo se congela tal como está** sobre la cita movida. Si estaba pendiente, sigue
  pendiente; si tenía petición de comprobante, la conserva; si tenía archivo, lo conserva; si estaba
  acreditado, sigue acreditado. Nada se mueve.
- **Se le abre a la profesional la decisión de cobro** sobre ese cobro congelado.
- **Se reclasifica el motivo del cobro**, de sesión a cambio, en el mismo acto (D3).
- **La cita nueva nace desde cero, con su propio cobro**, tratado según cómo cobre esa profesional.
  Si cobra por adelantado, nace pendiente y con la petición sellada.

El cierre no repite el aviso: ya se dio antes de mover. Pero **cuando la cita nueva es de prepago, el
cierre tiene que decir cómo pagarla**: sale `reprogramar_cierre_prepago`, con el monto y el hueco
`{como_pagar}`, igual que el de agendar. Sin eso, ella se entera de que hay que pagar otra vez por la
plantilla de las 26 horas, o no se entera.

**Es la celda más dura del sistema, y hay que decirla completa.** Si esa profesional cobra por
adelantado, ella ya mandó su comprobante, y mueve sin tiempo mínimo: **su comprobante se queda en la
cita vieja y la cita nueva le pide otro. Va a pagar dos veces, salvo que su profesional condone la
primera.** Eso es exactamente lo que significa «se cobran las dos sesiones», y es la razón de que el
aviso vaya antes de mover y no en el cierre.

### 5.3 Reprogramar con tiempo mínimo: el cobro nuevo hereda

**La regla cabe en una línea: el estado del cobro se pasa tal cual a la cita nueva.** Pendiente sigue
pendiente, acreditado sigue acreditado, y el comprobante se va con ella. Por dentro, el cobro viejo
se salda como **pasado adelante** y el nuevo nace con lo que el viejo tenía:

| Estado del cobro viejo | Con qué nace el cobro nuevo |
|---|---|
| Acreditado | Acreditado |
| Comprobante recibido | Con el comprobante copiado, y **no se le vuelve a pedir** |
| Comprobante pedido, o pendiente desnudo | Pendiente, y manda cómo cobra esa profesional: con petición de comprobante si cobra antes, sin nada si cobra después |
| Sin costo | Sin costo |

> **Nota de implementación, no de producto.** El camino que la base ya tiene sólo conserva la
> petición de comprobante **cuando había un archivo**. Si no lo había —la cita de prepago que ella
> todavía no ha pagado— el cobro nuevo nace pendiente y sin petición, y la profesional deja de ver
> «se pidió y no ha llegado», que es la señal entera del prepago (§4.1). Así que hay que volver a
> sellarla al escribir el cobro nuevo. Ahí el cierre es `reprogramar_cierre_prepago`.

### 5.4 Por qué congelar y no arrastrar

Porque si el dinero viaja, **la decisión abierta no la puede resolver nadie**. El cobro arrastrado
queda en un estado que las tres acciones de la profesional rechazan, y el cobro nuevo cuelga de una
cita que sigue programada, que también queda fuera de las tres.

Congelar deja el cobro exactamente donde las tres acciones sí lo alcanzan. Y no hay que inventar
nada: es la misma forma que ya produce la app de la profesional cuando la cita la mueve ahí mismo y
decide cobrar la vieja. Lo único que el agente añade encima es **abrir la decisión**.

### 5.5 La decisión de cobro nace fuera de la app de la profesional

Nadie más la produce. La app de la profesional produce el cobro congelado cuando ella misma mueve una
cita, pero **la decisión abierta encima de ese cobro no la abre nadie hoy**. El agente va a ser su
único productor, y las va a producir todas: las de reprogramar sin tiempo mínimo, las de cancelar sin
tiempo mínimo y las de cancelar con dinero adentro.

Por eso **cancelar necesita una función propia**. La cancelación que ya usa la app exige que quien
cancela tome una decisión de dinero —condonar, acreditar, pedir comprobante o retener— y sin ella no
cancela. El agente no puede tomar esa decisión, porque el dinero lo resuelve la profesional. Hace
falta una función que cancele dejando la decisión **abierta**. Es lo único de todo este archivo que
no se puede reusar tal cual.

### 5.6 Lo que la profesional puede hacer con un cobro congelado

Tocando la tarjeta de esa cita ve el marcador «Pendiente de decisión» y dos botones. Detrás de
**[Cobrar]** las opciones cambian según cómo esté el cobro; **[No cobrar]** condona siempre.

| Estado del cobro congelado | Detrás de **[Cobrar]** |
|---|---|
| Pendiente desnudo | Efectivo, transferencia recibida, o pedir comprobante |
| Comprobante pedido | Transferencia recibida, o volver a pedir comprobante. **El efectivo está bloqueado**: el cobro se comprometió como transferencia |
| Comprobante recibido | Acreditar el pago, por transferencia. Volver a pedir está bloqueado: sólo cabe un comprobante por cobro |
| Acreditado | Retener el prepago. No pregunta método: el dinero ya está dentro |

**Qué fila aplica cuando hay comprobante y además está acreditado: la última**, por la precedencia de
§2.2. Las dos últimas filas son las de cancelar con dinero adentro (§6): ahí el cobro congelado llega
con el archivo pegado o ya acreditado. El de un cambio tardío casi siempre cae en las dos primeras.

**Del lado de la profesional no hay nada que construir.** Las tres acciones —acreditar el cobro, pedir
comprobante y condonar— existen, están conectadas y cubren las cuatro filas de arriba.

**No se abre decisión cuando no hay nada que cobrar.** Con precio efectivo cero, abrirla apagaría la
tarjeta: caería en «Revisar», sin botones, y las tres acciones la rechazarían. Se cierra la cita y se
acabó.

### 5.7 Cancelar sin tiempo mínimo, sin dinero adentro

Igual que reprogramar sin tiempo mínimo, sin cita nueva: el cobro se congela, se reclasifica el
motivo y queda abierta la decisión. La diferencia práctica es que aquí sí hubo un hueco perdido, y
por eso el aviso previo dice sencillamente que la sesión se le cobra.

Con dinero adentro se llega al mismo sitio por otro camino, y por uno que no mira el reloj para
decidir si cancela (§6).

---

## 6. Cancelar una cita con dinero adentro

### 6.1 Se cancela. A tiempo, antes se ofrecen las salidas

**Una cita con dinero adentro sí se cancela.** Lo que cambia es si antes se le ofrece algo, y eso
depende del reloj:

- **A tiempo:** se le ofrece reprogramarla, y el dinero se va con ella. Y, sólo si existe una
  próxima ocurrencia viva de su serie, cancelar ésta y dejar el pago ahí. Son dos salidas y ninguna
  incluye cancelar a secas: cancelar sigue disponible con que lo vuelva a pedir, sólo que no se le
  pone enfrente.
- **Sin tiempo mínimo: no se le ofrece nada, se cancela.** Moverla no le ahorra el cargo, porque
  fuera de plazo se cobran las dos sesiones, y pasar el pago cerraría el cobro viejo como no
  cobrado y le quitaría a la profesional el cargo que su propia política le concede. Ofrecer una
  salida que no mejora nada sólo alarga la conversación. El cierre dice el cargo dentro del mismo
  mensaje.

La primera línea de las ofertas cambia sola según el estado —«ya está pagada» o «ya mandaste tu
comprobante»— y el agente no escoge cuál: la escoge el servidor, con la precedencia de §2.2.

**Que las salidas ya se ofrecieron lo recuerda el servidor, no el modelo.** Si la función ya contestó
una vez con la oferta, la llamada siguiente cancela.

### 6.2 Si dice que no, se cancela

La cita se cancela, **el estado del pago se conserva tal como estaba**, y se le dice lo único que
necesita saber: que su pago queda registrado y que su profesional lo resuelve con ella. Es la
coletilla del cierre `cancelar_cierre`. **El agente no insiste una segunda vez.** Ella ya escuchó las
salidas y las rechazó; repetírselas es discutir con una paciente que ya decidió.

No es una excepción a la regla 5 de `00`: no se le dice que la profesional va a decidir, se le dice
qué pasa con su dinero. Callarlo la dejaría creyendo que lo perdió.

### 6.3 Por qué se congela y no se condona

Cancelar «a tiempo», tal como está escrito para una cita sin dinero, **condona el cobro pendiente**.
Con dinero adentro eso sale mal por los dos lados:

| Estado del cobro | Qué pasaría si se condonara |
|---|---|
| Comprobante recibido | El registro diría «no se cobró» de una transferencia que la paciente sí hizo |
| Acreditado | Ni siquiera es un pendiente: no cae en esa rama, y el dinero se queda colgando de una cita cancelada, sin aparecer en Cobros ni como acreditado ni como pendiente, y sin ninguna acción de la profesional que lo alcance |

Congelar cierra las dos: el cobro conserva su estado, se le reclasifica el motivo a cancelación —sin
eso desaparece de la facturación aunque ella decida cobrar (D3)— y la decisión abierta lo pone al
alcance de las tres acciones que la profesional ya tiene (§5.6).

Por eso una cancelación con dinero adentro **se registra siempre como cancelación sin tiempo
mínimo**, aunque ella avise con dos semanas. No es un castigo: es la única forma que deja el dinero
donde alguien lo pueda resolver.

### 6.4 Por qué se cancela y no se la manda con su profesional

Mandarla con su profesional protege el dinero y crea algo peor. Ella avisa que no puede ir, nadie
registra nada, la cita sigue en pie, y su profesional se entera el día de la sesión, cuando no llegó.
Y deja un callejón sin salida —dinero adentro, sin próxima ocurrencia de su serie y sin un hueco al
cual moverse— del que sólo se sale escribiéndole a la profesional.

Las salidas se ofrecen porque casi siempre le convienen más. Pero el «no» de la paciente se respeta.
**El dinero no se pierde por cancelar:** se queda registrado, con motivo, y con dueño.

---

## 7. Pasar el pago a la próxima: una salida, no una función

Pasar el pago **ya no es una intención del catálogo**. El modelo no lo puede pedir: es una salida que
el servidor ofrece cuando ya comprobó que se puede, y que ella acepta con un «sí». Por dentro son dos
booleanos, `cancelar(pasa_el_pago)` y `reprogramar(a_la_proxima)`, y **la cita la pone el servidor**,
que ya la sabe.

El porqué es corto: el modelo no puede mover dinero por iniciativa propia sobre una cita que él
mismo eligió. Los únicos textos que mencionan estas salidas son los que el servidor compone después
de comprobar las condiciones, así que no hay puerta que abrir sin permiso.

### 7.1 Las tres condiciones, juntas

1. La cita **trae dinero adentro** (§2.1).
2. **El aviso llega dentro del plazo de esa ficha.** Sin tiempo mínimo el pago no se pasa, y la
   salida ni siquiera se menciona.
3. Existe una **próxima ocurrencia viva de la serie de esa cita**.

Si falta una, la salida no se ofrece. La segunda es la que faltaba: sin ella la cancelación tardía
quedaba sin cargo (§3.3).

**El destino es la serie, no el servicio.** La próxima ocurrencia viva de la serie de esa cita, y no
«la primera cita posterior del mismo servicio». No son el mismo conjunto: dos citas sueltas del mismo
servicio no son una serie, y una suelta anterior ganaría por ser la primera posterior. El texto
nombraría un día y el dinero acabaría en otro. **Si la cita no es de una serie, no hay destino y la
salida no existe.**

**Y por eso la paciente no tiene que escoger:** con una serie sólo hay una candidata. Tampoco tendría
número que señalar, porque la lista de citas próximas se colapsa por serie.

### 7.2 El traslado, por dentro

1. La cita que trae el dinero **se cancela**, conservando su hora y su modalidad.
2. **El cobro que la cita destino ya tenía se sobrescribe en su sitio** —la base admite un cobro por
   cita— con el importe, el estado, el método y la petición del que viaja.
3. **Si lo que viaja es un comprobante, el archivo cambia de dueño: se mueve, no se copia.** Dos
   filas apuntando al mismo archivo son una bomba con mecha larga, porque la limpieza de archivos
   borra por ruta y nunca cuenta cuántas la usan. Además, moverlo con baja y alta es lo que apaga la
   petición de comprobante que la cita destino tuviera en cola; copiarlo dejaría a la paciente
   recibiendo una petición del dinero que acaba de mover.
4. **El cobro viejo se cierra como trasladado**, que es un condonar **con motivo propio** y no se lee
   como «no se cobró». Hay que decirlo así: quien implemente esto va a buscar una forma de
   cerrarlo que no sea condonar, y no existe. Lo que distingue las dos cosas es el motivo, y por eso
   D3 no es opcional.
5. Quedan **dos asientos enlazados en la bitácora del dinero**, uno en cada cobro. No hace falta
   inventar ninguna columna: es el mismo rastro que ya deja la app de la profesional.

El cierre lo escoge el resultado y no lo que el modelo crea que pasó. En `cancelar` es la coletilla
que nombra la cita destino con su día y su hora —**no el estado del cobro**, justo porque acreditado
y comprobante conviven—. En `reprogramar` es `reprogramar_pasada_a_la_proxima`. Los dos nombran la
cancelación de la cita vieja, porque eso es lo que de verdad le pasa y callarlo la dejaría creyendo
que sigue en pie.

### 7.3 La salida gemela: consolidar la serie desde `reprogramar`

Cuando la cita que se quiere mover es de una serie y ella ya tiene agendada la siguiente ocurrencia,
`reprogramar` ofrece una segunda salida antes de buscar día: dejarla en esa próxima. Es lo que casi
siempre quiere quien falta a una sesión de una serie semanal, y no gasta un hueco de la agenda.

Es la misma operación de §7.2 con una diferencia que importa: **esta salida se ofrece haya pago o no
lo haya.** Consolidar la serie es una operación de agenda, no de dinero: no se aborta porque esa
cita venga sin pago.

Tres precisiones que hacen la diferencia:

- **La cita vieja queda cancelada, no reprogramada.** Es lo único que evita que la serie termine con
  dos citas donde había una.
- **La ocurrencia que ya existía no se toca**: ni su día, ni su hora, ni su modalidad. Y por eso esta
  salida no consulta la anticipación mínima: no se está tomando un horario nuevo.
- **El aviso a la profesional es de cancelación**, como en cualquier traslado (§8).

Con tiempo mínimo el cierre es `reprogramar_pasada_a_la_proxima`, y la frase del pago sólo va cuando
esa cita traía pago. Sin tiempo mínimo es `reprogramar_pasada_a_la_proxima_tarde`, **sin esa frase**:
el pago se queda congelado en la cita cancelada.

### 7.4 La única revisión, y lo que no bloquea

**Lo único que se revisa al ejecutar es que la cita destino no traiga ya dinero suyo.** Sobrescribir
un pago que ya estaba ahí borra un dato que nadie puede reconstruir, y fusionar dos dineros en un
solo cobro no tiene forma de registrarse.

Ese choque no se descubre al ofrecer sino al ejecutar: entre la oferta y su respuesta, la próxima se
pudo cancelar o pudo adquirir su propio cobro. **Cuando pasa, se cancela igual y no se le dice
nada.** Ella pidió cancelar y eso es lo que ocurre; el pago se queda registrado en la cita
cancelada y la profesional lo resuelve. Explicarle que su próxima sesión ya traía otro cobro sería
contarle un enredo interno que no puede resolver. Lo único que no se vale es usar el cierre que
nombra la cita destino: el pago no llegó a moverse.

**Que los importes no coincidan no detiene nada.** No hay dónde registrar un saldo parcial, es
cierto, pero la diferencia la arregla la profesional en un toque desde su app, y bloquear por eso deja
a la paciente sin salida por una cuenta que no es suya. El pago se pasa con el importe que traía y
**la profesional ajusta** (D4). El caso aparece en cuanto una profesional cambie el precio de un
servicio entre dos citas de la misma paciente.

### 7.5 Lo que la profesional ve, y lo que no

Le llega el aviso de que la paciente canceló esa cita. **No le llega el traslado**: no existe un tipo
de aviso para eso, y uno nuevo caería en el aviso genérico, que no dice nada del dinero ni de la
cita. El registro del traslado queda completo en la bitácora del dinero, y la tarjeta de la cita
destino dirá que está pagada cuando la abra. Se acepta así, y va declarado como límite, no escondido.

---

## 8. Los avisos en cada camino donde se mueve dinero

Van en la **misma transacción** que la mutación: si el aviso no se pudo escribir, la mutación no
ocurrió (regla 13). Las claves del `payload` salen del contrato de la app, no se inventan y están en
`docs/02-funciones.md` §8: **si falta una sola, la tarjeta cae en el aviso genérico y la push
también**.

| Camino | Aviso | Claves del `payload` |
|---|---|---|
| Agendó, con o sin prepago | `appointment_created_by_patient` | `patient_first_name`, `patient_last_name`, `appointment_starts_at`, `appointment_ends_at`, `appointment_modality` |
| Confirmó, cobrando después o con el comprobante ya pegado | `appointment_confirmed`, uno por cita | las mismas cinco |
| Mandó comprobante | `payment_proof_received` | `patient_first_name`, `patient_last_name`, `appointment_starts_at`. **Sin el monto** |
| Mandó comprobante y con eso quedó confirmada su cita de prepago | `payment_proof_received` **y** `appointment_confirmed`, los dos | las de cada uno |
| Movió su cita, con o sin tiempo mínimo | `appointment_rescheduled_by_patient` | `patient_first_name`, `patient_last_name`, `previous_starts_at`, `previous_modality`, `new_starts_at`, `new_modality` |
| Canceló, con o sin dinero adentro, con o sin decisión abierta | `appointment_cancelled_by_patient` | las mismas cinco de agendar |
| Canceló y pasó su pago a la próxima de su serie | `appointment_cancelled_by_patient` | las mismas cinco |
| Pasó su cita de la serie a la próxima, con pago o sin él | `appointment_cancelled_by_patient` | las mismas cinco |

Cuatro cosas propias del dinero:

1. **El aviso del comprobante no lleva el monto, y no es un olvido.** La app no lo lee; un importe
   copiado a la bandeja se queda mintiendo el día que el importe cambie, porque nadie reescribe un
   aviso ya enviado; y un comprobante recibido no es un cobro. Ponerlo empuja a leerlo como
   «entraron $800» —cifra inventada—, que es exactamente lo que la regla 4 prohíbe decir.
2. **El comprobante que confirma una cita de prepago escribe los dos avisos.** Pegar el archivo es un
   movimiento de dinero y confirmar la cita es una mutación de cita: son dos cosas, y la regla 13 no
   tiene excepciones. Escribir sólo el del comprobante dejaba una mutación de cita sin su aviso.
3. **No existe un aviso de «tienes una decisión de cobro pendiente».** Lo que llega es el aviso de la
   cancelación o del cambio, y la decisión se encuentra tocando la tarjeta de ese día (§9.2).
4. **Los dos traslados se avisan como cancelación**, el de `cancelar(pasa_el_pago)` y el de
   `reprogramar(a_la_proxima)`, porque eso es lo que de verdad le pasa a la cita.

---

## 9. Los límites conocidos, sin maquillaje

**9.1 · La paciente nunca sabe qué decidió la profesional.** De las acciones que resuelven una
decisión, sólo «pedir comprobante» le manda algo. Cobrar en efectivo no manda nada y la deja sin
saber cómo pagar, y además apaga los avisos de comprobante que quedaban en cola. Condonar es mudo: le
perdonan un cargo del que se le avisó y sigue creyendo que lo debe. Con la regla 5 duele menos en un
lado —se le dijo que se cobra, así que no queda en el aire— y más en el otro: le quita una buena
noticia.

**9.2 · La decisión abierta es difícil de encontrar.** Mientras siga abierta no aparece en Cobros —no
se cuenta un ingreso que nadie ha decidido—, no pinta punto en el calendario del mes, y el aviso que
la anunció se borra con el tiempo. El único camino es tocar la tarjeta del día.

**9.3 · Condonar un prepago queda registrado como «no se cobró».** El dinero entró de verdad y no hay
devolución en el producto ni dónde representarla. Con las cancelaciones con dinero adentro esto deja
de ser un caso raro: es la salida natural de **[No cobrar]** sobre un cobro acreditado. Es una
decisión de producto, no un arreglo barato.

**9.4 · El agente va a producir todas las decisiones de cobro.** Hoy no las produce nadie, y por eso
9.2 no molesta. Deja de ser cierto el día que esto se despliegue, y el volumen no va a ser pequeño:
las produce cancelar sin tiempo mínimo, reprogramar sin tiempo mínimo y cancelar con dinero adentro.

**9.5 · Una foto equivocada queda pegada para siempre.** Cabe un solo comprobante por cobro y la app
no tiene por dónde reemplazarlo. Por eso `mandar_comprobante` **siempre pregunta** antes de guardar,
aunque haya una sola candidata: es la única excepción del diseño a actuar cuando sólo hay una. Y por
eso el estado privado de la ejecución guarda **de qué archivo se preguntó**: sin eso la pregunta protege
contra la cita equivocada y no contra el archivo equivocado, que es el mismo daño.

**9.6 · Un pago puede acabar sobre una sesión que cuesta distinto.** Los importes no bloquean el
traslado ni la herencia, así que la cita destino puede quedar con un cobro que no coincide con su
precio. Lo resuelve la profesional ajustando el importe, y hasta que lo haga la cuenta está torcida.
Se prefiere así antes que dejar a la paciente sin salida.

**9.7 · Reprogramar a tiempo ya deja dos filas de comprobante sobre el mismo archivo.** El camino que
la base tiene hoy copia la fila del comprobante en vez de moverla. Por eso el traslado del pago
**mueve** la fila (§7.2): para no agravarlo. Cuántas filas comparten ruta hoy es una cuenta que nadie
ha hecho, y la limpieza de archivos borra por ruta sin contar cuántas la usan.

**9.8 · Un prepago sin comprobante ocupa el horario, y a su hora sale del alcance del agente.** Nada
lo cancela y nada lo libera: la cita ocupa el hueco hasta que la profesional la cierre. Y cuando pasa
su hora, el barrido la manda a «Revisar», con lo que **desaparece de `mis_citas` y de las candidatas
de `cancelar` y de `reprogramar`** (§4.3). Su cobro sigue vivo y el comprobante se le puede seguir
pegando, pero de la cita ya no puede hacer nada desde aquí.

**9.9 · Nada de esto tiene precedente.** El cobro congelado, la decisión abierta y el traslado de un
pago entre citas son formas que ninguna superficie ha producido todavía. Lo primero que hay que mirar
cuando esto salga no son los textos: es si la tarjeta de la profesional muestra bien un cobro
congelado con archivo pegado.
