# 03 · El dinero

Corte: 2026-08-27. Todos los números de este archivo se leyeron de la base viva ese día.

Este archivo contesta una sola pregunta: **qué le pasa al cobro en cada acción**. Las fichas de
las once funciones están en `docs/02-funciones.md`. Los textos completos están en
`docs/06-textos.md`, que es la única fuente de lo que la paciente lee; aquí se citan por clave y
no se reescriben. Las reglas numeradas viven en `docs/00-el-agente.md` y se citan por número.

---

## 1. Las diez reglas del dinero, en una página

**D1 · «Dinero adentro» tiene una definición exacta y una sola.** El cobro está acreditado, o hay
un comprobante pegado. Una petición de comprobante sellada sin archivo **no** es dinero adentro.
(Regla 10; el porqué, en §2.)

**D2 · El agente nunca dice «pagado» ni «aprobado».** Dice «recibí tu comprobante». Un
comprobante recibido queda pendiente de revisión, y revisarlo es de la profesional. (Regla 4.)

**D3 · A la paciente no se le dice que la profesional va a decidir. Se le dice que se cobra.**
Que después condone es asunto interno suyo. Decirle «va a decidir» le abre una duda que nadie le
va a cerrar, porque cuando la profesional decide, la paciente casi nunca se entera (§9.1).
(Regla 5.)

**D4 · Cobrar desde el agente sólo aplica cuando la profesional cobra por adelantado.** Si cobra
después, el agente no pide comprobante, no menciona pago al agendar y no da datos de
transferencia. Hoy es **una de las seis**. (Regla 6.)

**D5 · Ningún plazo se escribe a mano.** Sale de la ficha de esa profesional: hoy 24 horas de
aviso en cinco y **12 en una**. La única constante del producto es **el reloj de 24 horas del
prepago**, que no sale de ninguna ficha. (Regla 2.)

**D6 · El agente abre la decisión de cobro; nunca la cierra.** Cerrarla es de la profesional,
desde su app, y son las mismas dos salidas de siempre: cobrar o no cobrar. (Regla 12.)

**D7 · Cuando una cita se cierra, el motivo del cobro se reclasifica en el mismo acto.** De
«sesión» a «cancelación» o a «cambio». Es la parte que no se puede olvidar: sin ella la fila
desaparece de la facturación **aunque la profesional decida cobrar**, sin error y sin aviso.

**D8 · Ninguna operación del agente cambia el importe de un cobro.** Ni al congelarlo, ni al
trasladarlo. Si el importe deja de coincidir con el precio de la cita, la tarjeta que ve la
profesional se apaga entera y se queda sin botones.

**D9 · Ningún movimiento de dinero termina sin que la profesional se entere, en la misma
transacción.** Si el aviso no se pudo escribir, el movimiento no ocurrió. Y el aviso del
comprobante **nunca lleva el monto**. (Regla 13.)

**D10 · El agente no encola ninguna plantilla.** Contesta dentro de la conversación abierta. Las
plantillas de dinero que salen solas —la petición de comprobante y el aviso del prepago vencido—
las producen los trabajos automáticos, nunca el agente. (Regla 15.)

---

## 2. Qué quiere decir «dinero adentro»

Un cobro tiene dinero adentro cuando **está acreditado** o cuando **tiene un comprobante pegado**.
Nada más. Una petición sellada sin archivo es una petición, no dinero: no entró nada.

Los cinco estados en que el agente se puede encontrar un cobro, y cuáles cuentan:

| Estado | Cómo se reconoce | ¿Dinero adentro? | Hoy en la base |
|---|---|---|---|
| Sin costo | El precio efectivo es cero | no | **0** |
| Pendiente desnudo | Se debe y nadie ha pedido nada | no | **31** |
| Comprobante pedido | Se selló la petición, no llegó archivo | **no** | **3** |
| Comprobante recibido | Llegó el archivo, nadie lo ha revisado | **sí** | **0** |
| Acreditado | El cobro ya entró, de un prepago o de una sesión cobrada | **sí** | **37** |

Más 2 cobros ya condonados, sobre citas cerradas. Total: 73.

**Por qué la definición tiene que ser exactamente ésta y la misma en los dos sitios.** La usan el
cerrojo de cancelar (§6) y pasar el pago (§7). Si difirieran, aparecería una cita que no se puede
cancelar **y** tampoco se puede pasar: un callejón sin salida por WhatsApp, construido por
nosotros. Y si una petición sellada contara como dinero, los 3 cobros que hoy sólo esperan
comprobante bloquearían la cancelación de sus citas sin que haya entrado un peso.

**Dónde está el dinero hoy.** De las **30 citas futuras vivas**, **ninguna tiene dinero adentro**,
y en toda la historia hay **cero comprobantes**. El cerrojo no va a morder el primer día. Empieza
a morder en cuanto el circuito de prepago funcione de verdad.

---

## 3. La matriz

### 3.1 Lo que hace el agente

| Acción | Qué le pasa al cobro | Qué ve la profesional en el dinero | Qué se le dice a la paciente |
|---|---|---|---|
| **Agendar**, cobra después | Nace un cobro pendiente por la sesión, sin petición de comprobante | Nada. Cobra al cerrar la sesión, como siempre | `agendar_cierre_cobra_despues`. **Ni una palabra de pago** |
| **Agendar**, cobra por adelantado | Nace pendiente **y con la petición sellada**, que es lo que arranca el reloj de 24 horas | Nada hasta que llegue el archivo | `agendar_cierre_prepago_con_datos` o `agendar_cierre_prepago_sin_datos` |
| **Agendar**, precio efectivo cero | Nace sin costo, aunque esa profesional cobre por adelantado | Nada | `agendar_cierre_cobra_despues`. No se menciona dinero |
| **Confirmar**, cobra después | No se toca | Nada | `confirmar_cierre` |
| **Confirmar**, cobra por adelantado | No se toca, **y la cita no queda confirmada** | Nada | `comprobante_pedido_con_datos` o `comprobante_pedido_sin_datos`. Lo que confirma es el archivo |
| **Mandar comprobante** | **No cambia de estado.** Sigue pendiente; lo que entra es el archivo. Si la cita sigue viva y en el futuro, queda confirmada | Le llega el aviso y decide: acreditar o condonar | `comprobante_acuse`. **Nunca «pagado»** |
| **Reprogramar a tiempo** | El dinero viaja a la cita nueva, con su petición de comprobante y con su archivo si los tenía | La tarjeta vieja dice que el pago está en la cita nueva. Sin botones | `reprogramar_cierre` |
| **Reprogramar tarde** | El cobro viejo **se congela tal como está** sobre la cita movida y queda abierta la decisión. La cita nueva nace con su propio cobro | «Pendiente de decisión», con **[Cobrar]** y **[No cobrar]** | Antes de mover, `reprogramar_aviso_tardio`, con el plazo de esa ficha. Al cerrar, `reprogramar_cierre`, sin repetir el aviso |
| **Cancelar a tiempo**, sin dinero adentro | El cobro pendiente **se condona** | Tarjeta «No cobrada», sin botones. No aparece en Cobros | `cancelar_cierre`, que dice que no le queda ningún cobro pendiente |
| **Cancelar tarde**, sin dinero adentro | Se congela y queda abierta la decisión | «Pendiente de decisión», con las dos salidas | `cancelar_aviso_tardio` y, al confirmar, `cancelar_cierre_tardio` |
| **Cancelar con dinero adentro** | **No se cancela.** Nada se toca | Nada: no pasó nada | `cancelar_dinero_adentro`; si insiste, `cancelar_insiste` |
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
| Marcar que no asistió | La profesional, desde su app | Deja un cobro pendiente por la falta. Si pide comprobante, ese cobro entra como candidata de `mandar_comprobante`. Hoy hay exactamente uno así, de $800 |
| Cerrar la sesión como asistida | La profesional | Nada. El agente no cobra sesiones |
| El reloj del prepago a las 24 horas | El servidor, solo | Cancela la cita, condona el cobro y avisa por plantilla. **No abre decisión de cobro** (§4.4) |
| Cobrar o condonar una decisión abierta | La profesional | El agente no llama a ninguna de esas acciones y no le dice a la paciente cuál se tomó (§9.1) |
| Devoluciones y descuentos | La profesional, fuera de la app | Texto `asunto_de_dinero`, cero llamadas |

---

## 4. El prepago completo

Aplica cuando esa profesional cobra por adelantado **y** el precio efectivo es mayor que cero. Hoy
es **una de las seis**, con **11 pacientes** a su cargo, y es quien tiene llenos banco, titular y
CLABE en su perfil —**2 de 6 los tienen**—.

### 4.1 La cita nace sin confirmar y con el reloj corriendo

Al agendar, la cita queda apartada y **nunca confirmada**, y en la misma escritura se sella la
petición de comprobante. Esa marca es el reloj: no hay ninguna otra cosa que diga cuándo empezó a
correr el plazo. El cierre lleva el importe y los datos de la transferencia, o la salida de
pedírselos a su profesional cuando el perfil está vacío.

Que no nazca confirmada tiene tres razones, y las tres apuntan al mismo sitio:

1. **De producto: el comprobante es lo que confirma.** Si la cita naciera confirmada, el acuse del
   comprobante —«ya quedó confirmada»— sería falso: ya lo estaba.
2. **Una cita confirmada no se puede editar.** Nacer confirmada y morir por falta de pago
   veinticuatro horas después es una contradicción escrita en la propia cita.
3. **La ventana que decide si una cita nace confirmada es de 48 horas**, y sólo se aplica a citas
   que la paciente agenda. Una cita que nace confirmada no recibe la petición de confirmación
   automática, así que dentro de esa ventana el prepago **no se pediría nunca**.

### 4.2 Hoy el prepago se salva por accidente

La única profesional que cobra por adelantado pide **48 horas de anticipación mínima** para
agendar, así que sus citas caen **fuera** de la ventana de 48 horas que decide si una cita nace
confirmada. Las dos cifras se tocan exactamente en el borde: basta una cita agendada justo a 48
horas para que nazca confirmada y el comprobante no se pida nunca. **El día que baje ese margen,
el prepago deja de pedirse y no da ningún error**: la cita nace confirmada, nadie pide el
comprobante y nadie se entera.

Por eso `agendar` no puede depender de ese margen: **con prepago, la cita nunca nace confirmada,
punto**. Es una línea, y es la que convierte una coincidencia en una regla.

### 4.3 Decir «sí voy» no confirma

Con prepago, `confirmar` **no muta**: devuelve la petición del comprobante y el turno se cierra.
Lo que confirma es el archivo. Cuando el archivo llega, `mandar_comprobante` pega el comprobante y
**confirma la cita en el mismo acto**, siempre que siga viva y en el futuro. El cobro sigue
pendiente: recibir no es acreditar.

Ese acuse no repite el reloj de 24 horas. El reloj arranca al agendar y ya se lo dijo el cierre.

### 4.4 Si el comprobante no llega

A las veinticuatro horas de la petición, el reloj **cancela la cita, condona el cobro y libera el
horario**. Después avisa a la paciente por plantilla, y el orden importa: encolado antes, el mismo
apagado de avisos que dispara la cancelación se lo llevaría por delante. El corte real es de 24
horas más lo que tarde el barrido en pasar, y esas 24 se escriben literales porque son un valor
fijo del producto: la única excepción a D5. **Ese barrido todavía no existe** (§9.10).

**No se abre decisión de cobro**, y es deliberado: no hubo sesión perdida ni aviso tardío. La cita
nunca llegó a existir de verdad.

**No hay ventana de gracia y la cita no se reabre.** Si la paciente vuelve a escribir, agenda de
cero. La cita muerta queda cancelada con su cobro condonado, así que no arrastra ninguna deuda.

---

## 5. El cambio tardío

El cambio tardío se permite siempre —cancelar y reprogramar—. Lo único que cambia es que **se
avisa antes de tocar nada** y se pregunta. El plazo del aviso sale de la ficha de esa profesional,
nunca de una constante.

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

Nadie más la produce. Hoy hay **cero decisiones abiertas** en la base y **dos ya resueltas**, que
son el estado *después* de que la profesional decidió. **La forma congelada no se ha visto nunca.**
El agente va a ser su único productor, y las va a producir todas. (Regla 12.)

### 5.4 Lo que la profesional puede hacer con un cobro congelado

Tocando la tarjeta de esa cita ve el marcador «Pendiente de decisión» y dos botones. Detrás de
**[Cobrar]** las opciones cambian según cómo esté el cobro; **[No cobrar]** condona siempre.

| Estado del cobro congelado | Detrás de **[Cobrar]** |
|---|---|
| Pendiente desnudo | Efectivo, transferencia recibida, o pedir comprobante |
| Comprobante pedido | Transferencia recibida, o volver a pedir comprobante. **El efectivo está bloqueado**: el cobro se comprometió como transferencia |
| Comprobante recibido | Acreditar el pago, por transferencia. Volver a pedir está bloqueado: sólo cabe un comprobante por cobro |
| Acreditado | Retener el prepago. No pregunta método: el dinero ya está dentro |

**Del lado de la profesional no hay nada que construir.** Las tres acciones —acreditar el cobro,
pedir comprobante y condonar— existen, están conectadas y cubren las cuatro filas de arriba.

**No se abre decisión cuando no hay nada que cobrar.** Con precio efectivo cero, abrirla apagaría
la tarjeta: caería en «Revisar», sin botones, y las tres acciones la rechazarían. Se cierra la
cita y se acabó.

### 5.5 Cancelar tarde, sin dinero adentro

Igual que reprogramar tarde, sin cita nueva: el cobro se congela, se reclasifica el motivo y queda
abierta la decisión. La diferencia práctica es que aquí sí hubo un hueco perdido, y por eso el
aviso previo dice sencillamente que la sesión se le cobra.

Con dinero adentro no se llega aquí: esa cita no se cancela, ni tarde ni a tiempo (§6).

---

## 6. El cerrojo: una cita con dinero adentro no se cancela

### 6.1 Qué tapa

Sin el cerrojo, cancelar **a tiempo** una cita con dinero adentro tiene dos fugas, y las dos son
silenciosas:

| Caso | Qué pasaría | Consecuencia |
|---|---|---|
| A tiempo, con comprobante recibido | El cobro se condonaría con el resto de los pendientes | La paciente transfirió de verdad y el registro dice «no se cobró» |
| A tiempo, con prepago acreditado | No caería en ninguna rama | El dinero se queda colgando de una cita cancelada, no aparece en Cobros ni como acreditado ni como pendiente, y **ninguna acción de la profesional lo puede reabrir** |

### 6.2 Muerde a cualquier hora

Tarde el dinero no se perdería —se congelaría y decidiría la profesional—, y aun así tampoco se
cancela. La regla 11 no lleva cláusula de reloj, y la respuesta no puede cambiar según a qué hora
escriba: el dinero que ya entró se quedaría esperando una decisión que a la paciente nadie le
cuenta (§9.1), mientras que moverlo o pasarlo lo deja sirviéndole.

Las dos salidas de abajo valen igual sin tiempo mínimo. Lo único que cambia es que mover una cita
tarde lleva antes su propio aviso, y entonces el dinero se comporta como en §5.1.

### 6.3 Las dos salidas

Con dinero adentro, la función no cancela y devuelve la negativa con lo que sí existe:

1. **Moverla a otro día**, con el dinero y el comprobante yéndose con ella si alcanza el tiempo.
2. **Pasar el pago a su próxima sesión**, sólo si hay una del mismo servicio (§7).

La primera línea de la negativa cambia sola según el estado —«ya está pagada» o «ya mandaste tu
comprobante»— y el agente no escoge cuál. Si insiste, `cancelar_insiste`: cancelarla no está del
lado del agente, y se hace desde la app de su profesional. **El agente no cede.** (Regla 11.) La
insistencia la cuenta el servidor, no el modelo.

### 6.4 El límite que el cerrojo crea

Una paciente con dinero adentro, **sin próxima cita del mismo servicio** y **sin ningún hueco libre
al cual moverse**, se queda sin salida por WhatsApp: tiene que escribirle a su profesional. Es
consecuencia directa de la regla, no un defecto.

---

## 7. Pasar el pago a la próxima cita

### 7.1 Cuándo aplica

Las dos condiciones, juntas: la cita **trae dinero adentro** y existe una **próxima cita viva del
mismo servicio**, posterior a la que se cancela. El reloj no entra: ésta es la salida que ofrece el
cerrojo, y el cerrojo vale a cualquier hora (§6.2).

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
   la petición de prepago que la cita destino tuviera en cola; copiarlo dejaría a la paciente
   recibiendo una petición del dinero que acaba de mover.
4. El cobro viejo se cierra como trasladado y se reclasifica su motivo (D7).
5. Quedan **dos asientos enlazados en la bitácora del dinero**, uno en cada cobro. No hace falta
   inventar ninguna columna: es el mismo rastro que ya deja la app de la profesional.

El texto sale del resultado y no de lo que el modelo crea que pasó: `pasar_pago_acreditado` cuando
viajó un pago acreditado, `pasar_pago_comprobante` cuando viajó un comprobante. En el segundo no
aparecen «pagado» ni «aprobado» (D2).

### 7.3 Los tres casos en que no se traslada

- **No hay próxima del mismo servicio** → `pasar_pago_sin_proxima`, que ofrece mover, porque mover
  traslada el dinero completo sin tocar importes.
- **La próxima ya tiene dinero suyo o una decisión abierta.** Fusionar dos dineros en un solo cobro
  no tiene forma de registrarse. Se dice y se ofrece mover.
- **Los importes no coinciden.** Se dice y se ofrece mover.

**Por qué los importes tienen que ser idénticos.** No hay dónde registrar un saldo parcial, y las
dos cuentas salen mal: si viajan $800 a una sesión de $1 000, la paciente cree que no debe nada y
debe $200 que nadie le va a cobrar; si viajan $1 000 a una de $800, o se le cobran $1 000 por una
sesión de $800, o $200 se evaporan sin asiento. La salida es mover la cita. Hoy el caso no existe:
las **19 combinaciones de paciente y servicio** que hay en la base tienen **un solo importe
cobrado**. Aparecerá el día que una profesional cambie el precio entre dos citas.

### 7.4 Lo que la profesional ve, y lo que no

Le llega el aviso de que la paciente canceló esa cita. **No le llega el traslado**: no existe un
tipo de aviso para eso, y uno nuevo caería en el aviso genérico, que no dice nada del dinero ni de
la cita. El registro del traslado queda completo
en la bitácora del dinero, y la tarjeta de la cita destino dirá que está pagada cuando la abra.
Se acepta así.

---

## 8. Los avisos que dispara cada movimiento de dinero

Van en la **misma transacción** que la mutación (D9). Las claves del `payload` salen del contrato
de la app, no se inventan y están en `docs/02-funciones.md`: si falta una sola, la tarjeta cae en
el aviso genérico y la push también.

| Movimiento | `type` |
|---|---|
| Agendó, con o sin prepago | `appointment_created_by_patient` |
| Confirmó, cobrando después | `appointment_confirmed` |
| Canceló, con o sin decisión abierta | `appointment_cancelled_by_patient` |
| Pasó su pago a la próxima | `appointment_cancelled_by_patient` |
| Movió su cita, a tiempo o tarde | `appointment_rescheduled_by_patient` |
| Mandó comprobante | `payment_proof_received` |

Tres cosas propias del dinero:

1. **El aviso del comprobante no lleva el monto, y no es un olvido.** La app no lo lee; un importe
   copiado a la bandeja se queda mintiendo el día que el importe cambie, porque nadie reescribe un
   aviso ya enviado; y un comprobante recibido no es un cobro. Ponerlo empuja a leerlo como
   «entraron $800», que es exactamente lo que D2 prohíbe decir.
2. **No existe un aviso de «tienes una decisión de cobro pendiente».** Lo que llega es el aviso de
   la cancelación o del cambio, y la decisión se encuentra tocando la tarjeta de ese día.
3. **Pasar el pago se avisa como cancelación**, porque eso es lo que de verdad le pasa a la cita.

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
hay devolución en el producto ni dónde representarla. Es una decisión de producto, no un arreglo
barato.

**9.4 · El agente va a producir todas las decisiones tardías.** Hoy no las produce nadie, y por eso
9.2 no molesta todavía. Deja de ser cierto el día que esto se despliegue.

**9.5 · Una foto equivocada queda pegada para siempre.** Cabe un solo comprobante por cobro y la
app no tiene por dónde reemplazarlo. Por eso `mandar_comprobante` **siempre pregunta** antes de
guardar, aunque haya una sola candidata: es la única excepción del diseño a actuar cuando sólo hay
una.

**9.6 · La paciente no elige a cuál cita va su dinero.** Siempre a la más próxima del mismo
servicio. Si tiene dos y quería la segunda, eso lo ve con su profesional.

**9.7 · Cancelar con dinero adentro puede quedarse sin salida.** Sin próxima del mismo servicio y
sin hueco libre, la única puerta es escribirle a su profesional (§6.4).

**9.8 · El prepago vencido se avisa con un tipo que la app no conoce, o con uno que miente.** O
el aviso genérico, honesto pero mudo, o tarjeta legible que dice que canceló la paciente cuando la
canceló el reloj. La app no se toca esta ronda, así que no hay tercera. Queda escogido el genérico.

**9.9 · Casi nada de esto se puede ver contra los datos de hoy.** Cero comprobantes, cero
decisiones abiertas, cero citas futuras con dinero adentro y cero movimientos de dinero hechos por
el agente. Lo que sí hay para probar: 30 citas futuras vivas, una serie semanal, y los 3 cobros
esperando comprobante —uno de una sesión a la que no se asistió, uno de una sesión que sí ocurrió,
y uno de una cita futura de prepago—.

**9.10 · El reloj de 24 horas todavía no existe.** De los siete trabajos automáticos que corren
hoy, ninguno cancela un prepago vencido. Mientras no exista, una cita de prepago sin comprobante se
queda apartada indefinidamente y el horario no se libera.
