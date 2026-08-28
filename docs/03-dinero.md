# 03 · El dinero

Corte: 2026-08-28.

Este archivo contesta una sola pregunta: **qué le pasa al cobro en cada acción**. Las fichas de
las once funciones están en `docs/02-funciones.md`. Los textos completos están en
`docs/06-textos.md`, que es la única fuente de lo que la paciente lee; aquí se citan por clave y
no se reescriben. Las reglas generales están en `docs/00-el-agente.md`.

**Nada de aquí describe una base concreta.** Cada regla se escribe sobre **lo que cada profesional
configura** —si cobra antes o después, cuánto plazo de aviso pide, qué precio tiene cada servicio—,
nunca sobre lo que alguien tenga configurado hoy. Los nombres que aparecen en los ejemplos son
inventados y se marcan como ejemplos.

---

## 1. Las diez reglas del dinero, en una página

**D1 · «Dinero adentro» tiene una definición exacta y una sola.** El cobro está acreditado, o hay un
comprobante pegado. Una petición de comprobante sellada sin archivo **no** es dinero adentro. (El
porqué, en §2.)

**D2 · El agente nunca dice «pagado» ni «aprobado».** Dice «recibí tu comprobante». Un
comprobante recibido queda pendiente de revisión, y revisarlo es de la profesional.

**D3 · A la paciente no se le dice que la profesional va a decidir. Se le dice que se cobra.**
Que después condone es asunto interno suyo. Decirle «va a decidir» le abre una duda que nadie le
va a cerrar, porque cuando la profesional decide, la paciente casi nunca se entera (§9.1).

Hay **una excepción, y una sola**: cuando cancela una cita que ya traía dinero adentro. Ahí sí se le
dice que su pago queda registrado y que su profesional lo resuelve con ella, porque su dinero está
de verdad adentro y necesita saber a dónde ir a preguntar (§6.2).

**D4 · Recibir comprobantes aplica a todas las profesionales, cobren antes o después.** Lo que sólo
aplica al cobro por adelantado es **pedir el pago al agendar**: la paciente de quien cobra al cerrar
la sesión no recibe petición de comprobante al apartar, no oye una palabra de pago en el cierre y no
recibe datos de transferencia por aquí. Pero si transfiere por su cuenta y manda la foto, **el
agente la pega igual**.

**D5 · Ningún plazo de aviso se escribe a mano.** Sale de la ficha de esa profesional: una puede
pedir 24 horas y otra 12, y un número escrito a mano le miente a las pacientes de la segunda. La
única constante del producto es **la ventana de 26 horas**, que decide si una cita nace confirmada y
cuándo sale el recordatorio del comprobante. Es un solo número para todas, y es el mismo que usa el
trabajo programado.

**D6 · El agente abre la decisión de cobro; nunca la cierra.** Cerrarla es de la profesional,
desde su app, y son las mismas dos salidas de siempre: cobrar o no cobrar.

**D7 · Cuando una cita se cierra, el motivo del cobro se reclasifica en el mismo acto.** De
«sesión» a «cancelación» o a «cambio». Es la parte que no se puede olvidar: sin ella la fila
desaparece de la facturación **aunque la profesional decida cobrar**, sin error y sin aviso.

**D8 · Ninguna operación del agente cambia el importe de un cobro.** Ni al congelarlo, ni al
trasladarlo: el importe viaja tal como estaba. Si deja de coincidir con el precio de la cita donde
acaba, **lo ajusta la profesional desde su app**, que es donde se ajustan los importes. El agente no
tiene esa acción y no debe tenerla.

**D9 · Ningún movimiento de dinero termina sin que la profesional se entere, en la misma
transacción.** Si el aviso no se pudo escribir, el movimiento no ocurrió. Y el aviso del
comprobante **nunca lleva el monto**.

**D10 · El agente no encola ninguna plantilla.** Contesta dentro de la conversación abierta. La
única plantilla de dinero que sale sola es **el recordatorio del comprobante**, y la produce el
trabajo programado cuando faltan 26 horas para la sesión.

---

## 2. Qué quiere decir «dinero adentro»

Un cobro tiene dinero adentro cuando **está acreditado** o cuando **tiene un comprobante pegado**.
Nada más. Una petición sellada sin archivo es una petición, no dinero: no entró nada.

Los cinco estados en que el agente se puede encontrar un cobro, y cuáles cuentan:

| Estado | Cómo se reconoce | ¿Dinero adentro? |
|---|---|---|
| Sin costo | El precio efectivo es cero | no |
| Pendiente desnudo | Se debe y nadie ha pedido nada | no |
| Comprobante pedido | Se selló la petición, no llegó archivo | **no** |
| Comprobante recibido | Llegó el archivo, nadie lo ha revisado | **sí** |
| Acreditado | El cobro ya entró, de un prepago o de una sesión cobrada | **sí** |

**Por qué la definición tiene que ser exactamente ésta y la misma en los dos sitios.** La usan
cancelar, para decidir qué se le ofrece antes (§6), y pasar el pago, para decidir si hay algo que
pasar (§7). Si difirieran, aparecerían citas a las que una mitad del sistema le ofrece mover un
dinero que la otra mitad no ve. Y si una petición sellada contara como dinero, cada cita de prepago
que sólo espera comprobante arrastraría ofertas de traslado sin que haya entrado un peso.

---

## 3. La matriz

### 3.1 Lo que hace el agente

| Acción | Qué le pasa al cobro | Qué ve la profesional en el dinero | Qué se le dice a la paciente |
|---|---|---|---|
| **Agendar**, cobra después | Nace un cobro pendiente por la sesión, sin petición de comprobante | Nada. Cobra al cerrar la sesión, como siempre | `agendar_cierre_cobra_despues`. **Ni una palabra de pago** |
| **Agendar**, cobra por adelantado | Nace pendiente **y con la petición sellada** | Ve que se pidió y no ha llegado. Nada más hasta que entre el archivo | `agendar_cierre_prepago_con_datos` o `agendar_cierre_prepago_sin_datos` |
| **Agendar**, precio efectivo cero | Nace sin costo, aunque esa profesional cobre por adelantado | Nada | `agendar_cierre_cobra_despues`. No se menciona dinero |
| **Confirmar**, cobra después | No se toca | Nada | `confirmar_cierre` |
| **Confirmar**, cobra antes y no hay comprobante | No se toca, **y la cita no queda confirmada** | Nada | `comprobante_pedido_con_datos` o `comprobante_pedido_sin_datos`. Lo que confirma es el archivo |
| **Confirmar**, cobra antes y ya mandó comprobante | No se toca | Nada | `confirmar_cierre`. No se le pide dos veces lo que ya mandó |
| **Mandar comprobante** | **No cambia de estado.** Sigue pendiente; lo que entra es el archivo. Si la cita sigue viva y en el futuro, queda confirmada | Le llega el aviso y decide: acreditar o condonar | `comprobante_acuse`. **Nunca «pagado»** |
| **Reprogramar a tiempo** | El dinero viaja a la cita nueva, con su petición de comprobante y con su archivo si los tenía | La tarjeta vieja dice que el pago está en la cita nueva. Sin botones | `reprogramar_cierre` |
| **Reprogramar tarde** | El cobro viejo **se congela tal como está** sobre la cita movida y queda abierta la decisión. La cita nueva nace con su propio cobro | «Pendiente de decisión», con **[Cobrar]** y **[No cobrar]** | Antes de mover, `reprogramar_aviso_tardio`, con el plazo de esa ficha. Al cerrar, `reprogramar_cierre` |
| **Pasar una cita de la serie a su próxima** | El dinero viaja a la ocurrencia que ya existía y la cita movida **queda cancelada**, no reprogramada | El aviso de la cancelación. La tarjeta de la próxima dirá que está pagada | `reprogramar_recurrencia_dos_salidas` y, al cerrar, `reprogramar_pasada_a_la_proxima` |
| **Cancelar a tiempo**, sin dinero adentro | El cobro pendiente **se condona** | Tarjeta «No cobrada», sin botones. No aparece en Cobros | `cancelar_cierre`, que dice que no le queda ningún cobro pendiente |
| **Cancelar tarde**, sin dinero adentro | Se congela y queda abierta la decisión | «Pendiente de decisión», con las dos salidas | `cancelar_aviso_tardio` y, al confirmar, `cancelar_cierre_tardio` |
| **Cancelar con dinero adentro**, a cualquier hora | Antes se ofrecen dos salidas. Si dice que no a las dos, **la cita se cancela y el cobro se congela tal como estaba**, con la decisión abierta | «Pendiente de decisión», con las dos salidas | `cancelar_dinero_adentro` o `cancelar_dinero_adentro_con_proxima` y, si dice que no, `cancelar_insiste` |
| **Pasar el pago** | El dinero se traslada a la próxima sesión del mismo servicio y la cita que lo traía se cancela | El aviso de la cancelación. La tarjeta de la cita destino dirá que está pagada | `pasar_pago_acreditado` o `pasar_pago_comprobante`, según cómo viajó |
| **Cambiar modalidad** | **No toca dinero nunca.** No hay versión tardía con cargo | Nada | `modalidad_cierre` |
| **Dejar reseña** | No toca dinero | Nada, a propósito | `resena_gracias` |

Dos precisiones que valen para toda la tabla:

- **El aviso tardío sólo se da cuando hay algo que cobrar.** Con precio efectivo cero se mueve o
  se cancela sin mencionar dinero. Decirle «se te cobra» de una sesión de cero pesos es mentirle
  en la otra dirección.
- **Condonar y congelar se distinguen también en la cola de avisos.** Al condonar, los avisos de
  comprobante que quedaban pendientes se apagan solos, que es justo lo que hace falta: si no, ella
  recibiría después una petición del dinero de una cita que ya no existe. Al congelar no se apagan,
  y también es lo que hace falta: ese cobro sigue vivo y la profesional puede decidir cobrarlo.

### 3.2 Movimientos de dinero que el agente no produce

Se documentan porque el agente **se los encuentra**, no porque los haga.

| Movimiento | Quién lo hace | Qué significa para el agente |
|---|---|---|
| Marcar que no asistió | La profesional, desde su app | Deja un cobro pendiente por la falta. Si además pide comprobante, ese cobro entra como candidata de `mandar_comprobante` |
| Cerrar la sesión como asistida | La profesional | Nada. El agente no cobra sesiones |
| Cobrar o condonar una decisión abierta | La profesional | El agente no llama a ninguna de esas acciones y no le dice a la paciente cuál se tomó (§9.1) |
| Ajustar el importe de un cobro | La profesional, desde su app | Es la salida cuando un pago viaja a una sesión que cuesta distinto (§7.3) |
| Devoluciones y descuentos | La profesional, fuera de la app | Texto `asunto_de_dinero`, cero llamadas |

**Y uno que ya no existe: nada cancela citas solo.** No hay barrido que mate una cita de prepago sin
comprobante, ni ningún otro reloj que cierre citas por su cuenta (§4.3).

---

## 4. El prepago completo

Aplica cuando esa profesional cobra por adelantado **y** el precio efectivo es mayor que cero.

### 4.1 La cita nace apartada, sin confirmar y con el comprobante pedido

Al agendar, la cita queda apartada y **nunca confirmada**, y en la misma escritura se sella la
petición de comprobante. El cierre lleva el importe y los datos de la transferencia, o la salida de
pedírselos a su profesional cuando el perfil está vacío.

Que no nazca confirmada tiene dos razones, y las dos apuntan al mismo sitio:

1. **El comprobante es lo que confirma.** Si la cita naciera confirmada, el acuse del comprobante
   —«ya quedó confirmada»— sería falso: ya lo estaba.
2. **La profesional necesita ver la diferencia.** Apartada, sin confirmar y con el comprobante
   pedido es exactamente la forma de «se pidió y no ha llegado». Nacer confirmada borraría esa
   señal justo cuando le sirve.

**Con prepago la cita no consulta la ventana de las 26 horas.** Esa ventana decide si una cita nace
confirmada cuando la profesional cobra después (D5). Con prepago no hay nada que decidir: la cita
nunca nace confirmada, punto, y el agente no depende de ningún margen para que el comprobante se
pida.

### 4.2 Decir «sí voy» no confirma, salvo si ya mandó el comprobante

Con prepago, `confirmar` **no muta**: devuelve la petición del comprobante y ahí se queda. Lo que
confirma es el archivo. Cuando el archivo llega, `mandar_comprobante` lo pega y **confirma la cita
en el mismo acto**, siempre que siga viva y en el futuro. El cobro sigue pendiente: recibir no es
acreditar.

**Si ella ya mandó su comprobante, no se le pide de nuevo** y «sí voy» confirma normal, como con
cualquier otra profesional. Volver a pedir lo que ya está pegado es el error que más rápido le
enseña a la paciente que del otro lado no hay nadie leyendo.

### 4.3 Si el comprobante no llega, no pasa nada

**Nada cancela citas solo.** No hay reloj. La cita se queda apartada, sin confirmar y con el
comprobante pedido, y ahí se queda: es la única forma de que la profesional vea en su app que se
pidió un pago y no ha llegado, y de ahí decide ella.

**Ningún cierre de prepago le pone plazo al comprobante y ninguno amenaza con cancelar.** Lo único
automático es un recordatorio por plantilla, del trabajo programado, cuando faltan 26 horas para la
sesión.

**Si tiene un comprobante pendiente y escribe por otra cosa, el agente no lo menciona.** Contesta lo
que le preguntaron y ya. Colgarle el pendiente a cada mensaje convierte al agente en cobrador, y no
lo es: el recordatorio ya sale solo y a su hora.

**Lo que se acepta a cambio.** El horario no se libera solo, así que una cita de prepago que nunca
se pagó ocupa un hueco hasta que la profesional la cierre. Es un costo elegido: liberar el horario
obliga a cancelar la cita, y cancelar citas por su cuenta es justo lo que una máquina no debe hacer.

---

## 5. El cambio tardío

**El plazo ya no bloquea nada.** Cancelar, reprogramar y pasar el pago se permiten siempre, a
cualquier hora. Lo único que cambia es que **se avisa antes de tocar nada** y se pregunta, y que
después el dinero se congela en vez de condonarse. El plazo del aviso sale de la ficha de esa
profesional, nunca de una constante.

**La única excepción vive fuera de este archivo:** el cambio de modalidad sí sigue bloqueado por el
plazo, porque la profesional necesita saber con tiempo si va al consultorio. Y es, precisamente, el
único cambio que no toca dinero.

### 5.1 Reprogramar tarde: se cobran las dos sesiones

El aviso lo dice con esas palabras porque eso es lo que pasa:

- **El cobro viejo se congela tal como está** sobre la cita movida. Si estaba pendiente, sigue
  pendiente; si tenía petición de comprobante, la conserva; si tenía archivo, lo conserva; si
  estaba acreditado, sigue acreditado. Nada se mueve.
- **Se le abre a la profesional la decisión de cobro** sobre ese cobro congelado.
- **Se reclasifica el motivo del cobro**, de sesión a cambio, en el mismo acto (D7).
- **La cita nueva va aparte, con su propio cobro**, pendiente y por su propia sesión.

El cierre no repite el aviso: ya se dio antes de mover.

**Es la celda más dura del sistema, y hay que decirla completa:** el dinero de la paciente se
queda en la cita que movió, y la sesión nueva se le vuelve a cobrar. Por eso el aviso previo no
dice «puede que se te cobre» sino «se cobran las dos sesiones».

### 5.2 Por qué congelar y no arrastrar

Porque si el dinero viaja, **la decisión abierta no la puede resolver nadie**. El cobro arrastrado
queda en un estado que las tres acciones de la profesional rechazan, y el cobro nuevo cuelga de
una cita que sigue programada, que también queda fuera de las tres.

Congelar deja el cobro exactamente donde las tres acciones sí lo alcanzan. Y no hay que inventar
nada: es la misma forma que ya produce la app de la profesional cuando la cita la mueve ahí mismo
y decide cobrar la vieja. Lo único que el agente añade encima es **abrir la decisión**.

### 5.3 La decisión de cobro nace fuera de la app de la profesional

Nadie más la produce. La app de la profesional produce el cobro congelado cuando ella misma mueve
una cita, pero **la decisión abierta encima de ese cobro no la abre nadie hoy**. El agente va a ser
su único productor, y las va a producir todas: las de reprogramar tarde, las de cancelar tarde y las
de cancelar con dinero adentro.

### 5.4 Lo que la profesional puede hacer con un cobro congelado

Tocando la tarjeta de esa cita ve el marcador «Pendiente de decisión» y dos botones. Detrás de
**[Cobrar]** las opciones cambian según cómo esté el cobro; **[No cobrar]** condona siempre.

| Estado del cobro congelado | Detrás de **[Cobrar]** |
|---|---|
| Pendiente desnudo | Efectivo, transferencia recibida, o pedir comprobante |
| Comprobante pedido | Transferencia recibida, o volver a pedir comprobante. **El efectivo está bloqueado**: el cobro se comprometió como transferencia |
| Comprobante recibido | Acreditar el pago, por transferencia. Volver a pedir está bloqueado: sólo cabe un comprobante por cobro |
| Acreditado | Retener el prepago. No pregunta método: el dinero ya está dentro |

**Las dos últimas filas son las de cancelar con dinero adentro** (§6): ahí el cobro congelado llega
con el archivo pegado o ya acreditado. El de un cambio tardío casi siempre cae en las dos primeras.

**Del lado de la profesional no hay nada que construir.** Las tres acciones —acreditar el cobro,
pedir comprobante y condonar— existen, están conectadas y cubren las cuatro filas de arriba.

**No se abre decisión cuando no hay nada que cobrar.** Con precio efectivo cero, abrirla apagaría
la tarjeta: caería en «Revisar», sin botones, y las tres acciones la rechazarían. Se cierra la
cita y se acabó.

### 5.5 Cancelar tarde, sin dinero adentro

Igual que reprogramar tarde, sin cita nueva: el cobro se congela, se reclasifica el motivo y queda
abierta la decisión. La diferencia práctica es que aquí sí hubo un hueco perdido, y por eso el
aviso previo dice sencillamente que la sesión se le cobra.

Con dinero adentro se llega al mismo sitio por otro camino, y sin mirar el reloj (§6).

---

## 6. Cancelar una cita con dinero adentro

### 6.1 Se cancela. Antes se ofrecen dos salidas, una vez

**Una cita con dinero adentro sí se cancela.** Lo que el agente hace antes es ofrecerle las dos
salidas que probablemente le convienen más:

1. **Reprogramarla**, y el dinero se va con ella.
2. **Cancelar ésta y dejar el pago en su próxima sesión** del mismo servicio, si de verdad existe
   una (§7).

La segunda sólo se ofrece cuando hay próxima; si no la hay, el texto trae una sola salida. La
primera línea cambia sola según el estado —«ya está pagada» o «ya mandaste tu comprobante»— y el
agente no escoge cuál: la escoge el servidor. Los textos son `cancelar_dinero_adentro` y
`cancelar_dinero_adentro_con_proxima`.

**Que las salidas ya se ofrecieron lo recuerda el servidor, no el modelo.** Si la función ya
contestó una vez con la oferta, la llamada siguiente cancela.

### 6.2 Si dice que no a las dos, se cancela

La cita se cancela, **el estado del pago se conserva tal como estaba**, y se le dice lo único que
necesita saber: que su pago queda registrado y que su profesional lo resuelve con ella
(`cancelar_insiste`). **El agente no insiste una segunda vez.** Ella ya escuchó las dos salidas y
las rechazó; repetírselas es discutir con una paciente que ya decidió.

Es la única excepción a D3, y es la correcta: aquí sí hay una decisión pendiente sobre dinero que
ella metió de verdad, y callarlo la dejaría creyendo que lo perdió.

### 6.3 Por qué se congela y no se condona

Cancelar «a tiempo», tal como está escrito para una cita sin dinero, **condona el cobro pendiente**.
Con dinero adentro eso sale mal por los dos lados:

| Estado del cobro | Qué pasaría si se condonara |
|---|---|
| Comprobante recibido | El registro diría «no se cobró» de una transferencia que la paciente sí hizo |
| Prepago acreditado | Ni siquiera es un pendiente: no cae en esa rama, y el dinero se queda colgando de una cita cancelada, sin aparecer en Cobros ni como acreditado ni como pendiente, y sin ninguna acción de la profesional que lo alcance |

Congelar cierra las dos: el cobro conserva su estado, se le reclasifica el motivo a cancelación
—sin eso desaparece de la facturación aunque ella decida cobrar (D7)— y la decisión abierta lo pone
al alcance de las tres acciones que la profesional ya tiene (§5.4).

Por eso una cancelación con dinero adentro **se registra siempre como cancelación sin tiempo
mínimo**, aunque ella avise con dos semanas. No es un castigo: es la única forma que deja el dinero
donde alguien lo pueda resolver.

### 6.4 Por qué se cancela y no se la manda con su profesional

Mandarla con su profesional protege el dinero y crea algo peor. Ella avisa que no puede ir, nadie
registra nada, la cita sigue en pie, y su profesional se entera el día de la sesión, cuando no
llegó. Y deja un callejón sin salida —dinero adentro, sin próxima cita del mismo servicio y sin un
hueco al cual moverse— del que sólo se sale escribiéndole a la profesional.

Las dos salidas se ofrecen porque casi siempre le convienen más. Pero el «no» de la paciente se
respeta. **El dinero no se pierde por cancelar:** se queda registrado, con motivo, y con dueño.

---

## 7. Pasar el pago a la próxima cita

### 7.1 Cuándo aplica

Las dos condiciones, juntas: la cita **trae dinero adentro** y existe una **próxima cita viva del
mismo servicio**, posterior a la que se cancela. El reloj no entra: pasar el pago se permite
siempre, como cancelar y como reprogramar.

### 7.2 Qué resuelve el servidor

**El destino no se señala.** Lo resuelve el servidor: misma paciente, mismo servicio, programada,
la primera posterior. El cierre la nombra con su día y su hora, ya escritos por el servidor.

No es una simplificación. Con una serie viva es lo único que funciona: la lista de citas próximas
se colapsa por serie, así que la segunda ocurrencia no tiene número que señalar. Y como el modelo
no elige, no se puede equivocar de cita.

El traslado, por dentro:

1. La cita que trae el dinero **se cancela**, conservando su hora y su modalidad.
2. **El cobro que la cita destino ya tenía se sobrescribe en su sitio**, con el importe, el estado,
   el método y la petición del que viaja. No se borra y **no se condona**: condonarlo diría «no se
   cobró», y aquí sí se cobró, sólo que antes.
3. **Si lo que viaja es un comprobante, el archivo cambia de dueño: se mueve, no se copia.** Dos
   filas apuntando al mismo archivo son una bomba con mecha larga, porque la limpieza de archivos
   borra por ruta y nunca cuenta cuántas la usan. Además, moverlo con baja y alta es lo que apaga
   la petición de comprobante que la cita destino tuviera en cola; copiarlo dejaría a la paciente
   recibiendo una petición del dinero que acaba de mover.
4. El cobro viejo se cierra como trasladado y se reclasifica su motivo (D7).
5. Quedan **dos asientos enlazados en la bitácora del dinero**, uno en cada cobro. No hace falta
   inventar ninguna columna: es el mismo rastro que ya deja la app de la profesional.

El texto sale del resultado y no de lo que el modelo crea que pasó: `pasar_pago_acreditado` cuando
viajó un pago acreditado, `pasar_pago_comprobante` cuando viajó un comprobante. En el segundo no
aparecen «pagado» ni «aprobado» (D2). Los dos nombran la cancelación de la cita vieja, porque eso es
lo que de verdad le pasa y callarlo la dejaría creyendo que sigue en pie.

### 7.3 La única revisión, y las dos que no lo son

**Lo único que se revisa es que la cita destino no traiga ya dinero suyo.** Sobrescribir un pago que
ya estaba ahí borra un dato que nadie puede reconstruir, y fusionar dos dineros en un solo cobro no
tiene forma de registrarse. Si lo trae, no se pasa: `pasar_pago_la_proxima_ya_tiene`, que dice que
su profesional lo acomoda y ofrece mover la cita.

Los otros dos casos no son revisiones, son falta de materia, y los dos llevan su salida escrita:

- **No hay próxima del mismo servicio** → `pasar_pago_sin_proxima`, que ofrece mover, porque mover
  traslada el dinero completo.
- **Esa cita no trae dinero adentro** → `pasar_pago_sin_dinero`, que ofrece cancelarla o moverla.

**Que los importes no coincidan no detiene nada.** No hay dónde registrar un saldo parcial, es
cierto, pero la diferencia la arregla la profesional en un toque desde su app, y bloquear por eso
deja a la paciente sin salida por una cuenta que no es suya. El pago se pasa con el importe que
traía y **la profesional ajusta** (D8). El caso aparece en cuanto una profesional cambie el precio
de un servicio entre dos citas de la misma paciente.

### 7.4 La salida de la serie

Cuando la cita que se quiere mover es de una serie y la paciente ya tiene agendada la siguiente
ocurrencia, `reprogramar` ofrece una segunda salida antes de buscar día: dejarla en esa próxima. Es
lo que casi siempre quiere quien falta a una sesión de una serie semanal, y no gasta un hueco de la
agenda.

Si acepta, el dinero se mueve exactamente como en §7.2, con la misma revisión. Tres precisiones que
hacen la diferencia:

- **La cita vieja queda cancelada, no reprogramada.** Es lo único que evita que la serie termine con
  dos citas donde había una.
- **La ocurrencia que ya existía no se toca**: ni su día, ni su hora, ni su modalidad.
- **El aviso a la profesional es de cancelación**, como en cualquier traslado (§8).

La oferta es `reprogramar_recurrencia_dos_salidas` y el cierre `reprogramar_pasada_a_la_proxima`. La
frase del pago, en ese cierre, sólo va cuando esa cita traía pago.

### 7.5 Lo que la profesional ve, y lo que no

Le llega el aviso de que la paciente canceló esa cita. **No le llega el traslado**: no existe un
tipo de aviso para eso, y uno nuevo caería en el aviso genérico, que no dice nada del dinero ni de
la cita. El registro del traslado queda completo en la bitácora del dinero, y la tarjeta de la cita
destino dirá que está pagada cuando la abra. Se acepta así.

---

## 8. Los avisos que dispara cada movimiento de dinero

Van en la **misma transacción** que la mutación (D9). Las claves del `payload` salen del contrato
de la app, no se inventan y están en `docs/02-funciones.md`: si falta una sola, la tarjeta cae en
el aviso genérico y la push también.

| Movimiento | `type` |
|---|---|
| Agendó, con o sin prepago | `appointment_created_by_patient` |
| Confirmó, cobrando después o con el comprobante ya pegado | `appointment_confirmed`, uno por cita |
| Canceló, con o sin dinero adentro, con o sin decisión abierta | `appointment_cancelled_by_patient` |
| Pasó su pago a la próxima | `appointment_cancelled_by_patient` |
| Pasó su cita de la serie a la próxima | `appointment_cancelled_by_patient` |
| Movió su cita, a tiempo o tarde | `appointment_rescheduled_by_patient` |
| Mandó comprobante | `payment_proof_received` |

Tres cosas propias del dinero:

1. **El aviso del comprobante no lleva el monto, y no es un olvido.** La app no lo lee; un importe
   copiado a la bandeja se queda mintiendo el día que el importe cambie, porque nadie reescribe un
   aviso ya enviado; y un comprobante recibido no es un cobro. Ponerlo empuja a leerlo como
   «entraron $800», que es exactamente lo que D2 prohíbe decir.
2. **No existe un aviso de «tienes una decisión de cobro pendiente».** Lo que llega es el aviso de
   la cancelación o del cambio, y la decisión se encuentra tocando la tarjeta de ese día.
3. **Los dos traslados se avisan como cancelación**, el de `pasar_pago` y el de la serie, porque eso
   es lo que de verdad le pasa a la cita.

---

## 9. Los límites conocidos, sin maquillaje

**9.1 · La paciente nunca sabe qué decidió la profesional.** De las acciones que resuelven una
decisión, sólo «pedir comprobante» le manda algo. Cobrar en efectivo no manda nada y la deja sin
saber cómo pagar, y además apaga los avisos de comprobante que quedaban en cola. Condonar es mudo:
le perdonan un cargo del que se le avisó y sigue creyendo que lo debe. Con D3 duele menos en un
lado —se le dijo que se cobra, así que no queda en el aire— y más en el otro: le quita una buena
noticia.

**9.2 · La decisión abierta es difícil de encontrar.** Mientras siga abierta no aparece en Cobros
—no se cuenta un ingreso que nadie ha decidido—, no pinta punto en el calendario del mes, y el
aviso que la anunció se borra con el tiempo. El único camino es tocar la tarjeta del día.

**9.3 · Condonar un prepago queda registrado como «no se cobró».** El dinero entró de verdad y no
hay devolución en el producto ni dónde representarla. Con las cancelaciones con dinero adentro esto
deja de ser un caso raro: es la salida natural de **[No cobrar]** sobre un cobro acreditado. Es una
decisión de producto, no un arreglo barato.

**9.4 · El agente va a producir todas las decisiones de cobro.** Hoy no las produce nadie, y por eso
9.2 no molesta. Deja de ser cierto el día que esto se despliegue, y el volumen no va a ser pequeño:
las produce cancelar tarde, reprogramar tarde y cancelar con dinero adentro.

**9.5 · Una foto equivocada queda pegada para siempre.** Cabe un solo comprobante por cobro y la
app no tiene por dónde reemplazarlo. Por eso `mandar_comprobante` **siempre pregunta** antes de
guardar, aunque haya una sola candidata: es la única excepción del diseño a actuar cuando sólo hay
una.

**9.6 · La paciente no elige a cuál cita va su dinero.** Siempre a la más próxima del mismo
servicio. Si tiene dos y quería la segunda, eso lo ve con su profesional.

**9.7 · Un pago puede acabar sobre una sesión que cuesta distinto.** Los importes ya no bloquean el
traslado, así que la cita destino puede quedar con un cobro que no coincide con su precio. Lo
resuelve la profesional ajustando el importe, y hasta que lo haga la cuenta está torcida. Se prefiere
así antes que dejar a la paciente sin salida.

**9.8 · Un prepago sin comprobante ocupa el horario indefinidamente.** Nada lo cancela y nada lo
libera. La profesional lo ve en su app y decide cuándo cerrarlo (§4.3).

**9.9 · Nada de esto tiene precedente.** El cobro congelado, la decisión abierta y el traslado de un
pago entre citas son formas que ninguna superficie ha producido todavía. Lo primero que hay que
mirar cuando esto salga no son los textos: es si la tarjeta de la profesional muestra bien un cobro
congelado con archivo pegado.
