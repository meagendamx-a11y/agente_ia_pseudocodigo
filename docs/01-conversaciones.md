# 01 · Las conversaciones

Corte: 2026-08-29.

Éste es el archivo que se lee para saber **cómo se siente el producto**: el paso previo de las dos
profesionales, los ocho flujos y los bordes, mensaje por mensaje. Debajo de cada respuesta, una
línea dice qué función se llamó y cuántas llamadas van de las tres de ese mensaje.

El agente detecta la intención, llama a una función y **copia el texto que le llega palabra por
palabra**. No arma frases, no calcula fechas y no ramifica. Si algo de aquí se lee raro, el
arreglo está en `docs/06-textos.md`, nunca en el prompt.

Las reglas se citan por número desde `docs/00-el-agente.md`; los parámetros están en
`docs/02-funciones.md`; los textos completos, en `docs/06-textos.md`. **Si algo de aquí y `06`
difieren, manda `06`.**

---

## Cómo se lee

```
>>  lo que llega por WhatsApp
<<  lo que contesta el agente
[qué función se llamó · cuál de las tres llamadas de ese mensaje · si muta · si la conversación cierra]
```

**El tope es por mensaje: tres llamadas, y cada mensaje de ella trae tres nuevas.** La cuenta
arranca de cero en cada mensaje y no se arrastra al siguiente. El tope existe para una sola cosa:
que un modelo confundido no llame funciones en círculo. La cuenta completa está en el §10.

Lo que se lleva de un mensaje al siguiente no son las palabras, es **la memoria de la
conversación**: qué se preguntó, qué función lo preguntó, qué opciones numeradas se ofrecieron y
sobre qué cita se está trabajando. Por eso un «la 2» aterriza siempre en la función correcta, y por
eso no hay que acordarse de nada para que el mensaje siguiente siga donde se quedó. La tabla se
define en `docs/07-portero.md` §8.1 y aquí sólo se usa.

### El reparto

**Todo lo que sigue es un ejemplo inventado.** Los nombres, los plazos, los precios y los horarios
no salen de la base: están escogidos para que se vean las dos ramas que de verdad existen —quien
cobra antes de la sesión y quien cobra después—. **Cada profesional configura los suyos**, y el
agente lee lo que ella configuró, nunca un número escrito a mano.

| | Lucía · ejemplo | Ramiro · ejemplo |
|---|---|---|
| Cobro | **por adelantado** | después |
| Datos de transferencia en el perfil | **sí** | no |
| Aviso de cambio | **24 horas** | **12 horas** |
| Anticipación mínima para tomar un horario | 48 horas | 48 horas |
| Cambio de modalidad | **ninguna dirección** | las dos, con 12 horas |
| Días que atiende | martes a viernes | martes a sábado |
| Horario | 9:00 a 2:00 y 3:00 a 6:00 | 9:00 a 2:00 y 3:00 a 6:00 |
| Dirección guardada | no | no |

Las pacientes del ejemplo también son inventadas: **Emilio** es de Lucía y **Ariadna** es de
Ramiro.

**En el ejemplo, hoy es jueves 27 de agosto y son las 9 de la mañana.** Con 48 horas de
anticipación, el primer horario que se puede tomar empieza el sábado 29 a las 9:00. Para Ramiro,
que atiende hasta el sábado, ése es el primer día. Para Lucía, que no atiende sábados, domingos ni
lunes, el primer día es el **martes 1 de septiembre**. Eso no lo calcula el agente nunca (regla 1):
le llega resuelto.

**Los dos plazos de la ficha son distintos y no se mezclan.** El aviso de cambio decide si hay
cargo y no bloquea nada. La anticipación mínima decide **desde cuándo** se puede tomar un horario,
y vale igual para una cita nueva y para el horario nuevo de una que se mueve.

---

## 0. Con cuál profesional — 0 llamadas

Un teléfono puede tener vínculo con dos profesionales. Cuando pasa, **se pregunta con cuál antes
de nada**, y de ahí toda la conversación es de esa profesional.

```
>>  hola, quiero mover mi cita

<<  Estás con más de una persona de Agenda Psi. ¿Con quién es lo que necesitas?

    1. Lucía
    2. Ramiro
[cero llamadas · el texto vive en el prompt · la conversación sigue abierta]

>>  con Ramiro

<<  Va, muevo tu cita del miércoles 2 de septiembre a las 4:00. ¿Qué días te quedan mejor y a
    qué hora?

    Tu cita nueva la puedes tomar presencial o en línea, dime también cómo la prefieres.
[reprogramar() · 1 de 3 · no muta]
```

**No cuesta ninguna llamada** porque ocurre antes de que haya intención: todavía no se sabe de qué
se va a hablar, así que ninguna de las diez sería la función que llamar. La lista la escribe el
borde con lo que ya sabe del teléfono, la respuesta se guarda en la memoria de la conversación, y
**no se vuelve a preguntar**.

**«Con Ramiro» produce una gestión, no un «no te entendí», y hacen falta dos cosas para eso.** La
primera: el borde resuelve el número contra su propia lista y **sigue adelante en el mismo
mensaje** —anota la profesional, arma el sobre con ella puesta y corre el modelo con el lote
completo—. Si se detuviera ahí, ella tendría que volver a escribir para qué escribió. La segunda:
en ese sobre viaja **el último ida y vuelta** —lo que ella escribió y lo que se le contestó—, que
es donde está «quiero mover mi cita». Sin ese par, «con Ramiro» es dos palabras sueltas y se
contesta `no_entendi`.

Nunca se adivina, ni por la última plantilla ni por la cita más próxima. Adivinar aquí manda toda
la conversación a la profesional equivocada y ella no tiene cómo darse cuenta a tiempo. Con un solo
vínculo —el caso normal— este paso no existe y no se nota.

---

## 1. Agendar

**Escoger la hora no aparta.** Antes de crear la cita se pregunta, y hasta que dice que sí se
aparta. Cuesta un mensaje más y se paga solo: agendar es la única acción que crea algo de la nada,
la cita creada por error ya le llegó a la profesional como aviso, y nace no editable, así que la
paciente no tiene dónde deshacerla más que pidiéndolo por aquí.

### 1.1 Cobra después — 4 llamadas, una por mensaje

```
>>  hola, quiero agendar una cita

<<  Hola Ariadna. Con gusto te agendo con Ramiro. Sus servicios son:

    1. Psicoterapia individual · 50 minutos · $900
    2. Valoración sin costo · 50 minutos · $800

    Dime cuál te interesa, qué días te quedan mejor y a qué hora.
[ver_servicios() · 1 de 3 · no muta]

>>  la 1, el miércoles por la tarde

<<  Para el miércoles 2 de septiembre, en línea, tengo estas horas (Hora CDMX):

    1. 3:00   2. 4:00   3. 5:00

    Dime cuál te acomoda.
[buscar_horarios(servicio: 1, dias: ["miércoles"], parte_del_dia: "tarde") · 1 de 3 · no muta]

>>  la 2

<<  ¿Aparto tu cita del miércoles 2 de septiembre a las 4:00, en línea?
[agendar(opcion: 2) · 1 de 3 · no muta]

>>  sí

<<  Listo, Ariadna. Aparté tu Psicoterapia individual del miércoles 2 de septiembre a las 4:00,
    en línea, con Ramiro.
[agendar(opcion: 2, confirmado: true) · 1 de 3 · muta · aviso appointment_created_by_patient ·
 cierra]
```

**Ni una palabra de pago**, porque Ramiro cobra después (regla 6).

El segundo renglón del menú es un ejemplo puesto a propósito: se llama «Valoración sin costo» y
cuesta $800, para que se vea que **el precio sale del número, nunca del nombre**. Y no se pregunta
la modalidad porque ese servicio admite una sola.

**La zona horaria va pegada a la lista de horas, cada vez, y no en el cierre.** Son dos palabras
entre paréntesis y contestan la duda antes de que la tenga. Dicha una sola vez al final, ella
escogía una hora y se enteraba del huso cuando la cita ya estaba apartada.

### 1.2 Prepago, con los datos de transferencia llenos — 4 llamadas

```
>>  quiero agendar una cita

<<  Hola Emilio. Con gusto te agendo con Lucía. Sus servicios son:

    1. Psicoterapia individual · 50 minutos · $900
    2. Psicoterapia individual · 50 minutos · $800
    3. Psicoterapia de pareja · 90 minutos · $1,200
    4. Valoración inicial · 30 minutos · $0

    Dime cuál te interesa, qué días te quedan mejor y a qué hora.
[ver_servicios() · 1 de 3 · no muta]

>>  la 2, en línea, el martes o el miércoles en la tarde

<<  El martes 1 y el miércoles 2 de septiembre tengo estas horas (Hora CDMX):

    1. 3:00   2. 4:00   3. 5:00

    Dime la hora y en cuál de los dos días.
[buscar_horarios(servicio: 2, modalidad: "en_linea", dias: ["martes","miércoles"],
 parte_del_dia: "tarde") · 1 de 3 · no muta]

>>  la 2, el martes

<<  ¿Aparto tu cita del martes 1 de septiembre a las 4:00, en línea?
[agendar(opcion: 2, dia: "martes") · 1 de 3 · no muta]

>>  sí

<<  Listo, Emilio. Aparté tu Psicoterapia individual del martes 1 de septiembre a las 4:00, en
    línea, con Lucía. Son $800, y para confirmarla necesito tu comprobante.

    Transfiere a {banco}, a nombre de {titular}, CLABE {clabe}, y mándame el comprobante por aquí.
[agendar(opcion: 2, dia: "martes", confirmado: true) · 1 de 3 · muta ·
 aviso appointment_created_by_patient · cierra]
```

Los tres huecos de la transferencia salen del perfil y no se copian aquí.

**El cierre no pone plazo al comprobante y no amenaza con cancelar.** Nada cancela citas solo: la
cita queda apartada, sin confirmar y con el comprobante pedido, y ahí se queda hasta que llegue.
La profesional ve en su app que se pidió y no ha llegado, y decide. El recordatorio sale por
plantilla desde el trabajo programado, no del agente —y **si la cita cae dentro de las 26 horas del
aviso, ese recordatorio no se encola**, para que no reciba por plantilla lo que acaba de leer.

**Dos días con las mismas horas se numeran una sola vez.** No se dice «te pongo las del martes»,
porque son las mismas horas de los dos días; lo que falta es que ella diga en cuál lo quiere. Ésta
es la única lista tras la cual `agendar` recibe también `dia`: el número identifica la hora y no el
día, y sin ese parámetro la decisión más cara de agendar se tomaría sin el dato. Si la lista era
compartida y no dijo el día, no se aparta nada: se reemite la misma lista con la misma numeración.

Dos renglones del menú se llaman igual y cuestan distinto. Por eso cada uno lleva su precio y por
eso ella contesta un número: el emparejamiento lo hace el modelo, la numeración el servidor.

### 1.3 Prepago sin los datos de transferencia

Es el **mismo texto** con el otro valor del hueco. Cambia sólo el segundo párrafo.

```
<<  Listo, Emilio. Aparté tu Psicoterapia individual del martes 1 de septiembre a las 4:00, en
    línea, con Lucía. Son $800, y para confirmarla necesito tu comprobante.

    Pídele los datos para la transferencia y mándame el comprobante por aquí.
[agendar(opcion: 2, dia: "martes", confirmado: true) · 1 de 3 · muta · cierra]
```

El nombre no se repite dentro del mismo texto: ella ya sabe quién es su profesional. Y el agente no
sabe cuál de los dos valores existe: le llega escrito.

### 1.4 Dice que no a la propuesta — 1 llamada

```
>>  no, mejor no

<<  Va, no la aparto. Cuando quieras, dime qué días te quedan mejor y te busco.
[agendar(opcion: 2, confirmado: false) · 1 de 3 · no muta · cierra]
```

La pregunta de antes de apartar tiene dos mitades y las dos necesitan texto. Por eso `confirmado`
es booleano **o nulo**: sin el nulo no hay forma de distinguir «dijo que no» de «todavía no se le
preguntó», y las dos caían en el mismo falso. Lo mismo vale para las otras tres preguntas cerradas
—mover, cancelar y cambiar de modalidad—, y cada una tiene su propia negativa.

### 1.5 La hora se ocupó mientras conversaban

```
>>  sí

<<  Se acaba de ocupar esa hora. Ese mismo día tengo estas horas (Hora CDMX):

    1. 3:00   2. 5:00

    ¿Te sirve alguna, o te busco otra fecha?
[agendar(opcion: 2, confirmado: true) · 1 de 3 · no muta · la conversación sigue abierta]
```

Entre la lista y la escritura pasan dos mensajes de ella, porque el paso de confirmación agrega
uno: en ese rato la profesional pudo apartar esa hora desde su app. Por eso **al apartar se vuelve
a validar que el hueco siga libre**.

**No cuesta una llamada extra:** la función volvió a buscar por dentro y ofreció las alternativas
del mismo día, renumeradas, en la misma respuesta. Y se dice siempre; callarlo dejaría a Emilio
creyendo que tiene cita. El número que llegue después **vuelve a proponer, no aparta**.

### 1.6 Cuando el filtro no da nada: los cinco motivos

Cada uno cuesta **una llamada**, ninguno se contesta con «no hay nada» y **todos llevan
alternativas numeradas de verdad**: un motivo sin alternativas obliga a volver a preguntar y
cuesta otra llamada y otro mensaje.

**En ninguno se nombra a la profesional y en ninguno se dice su plazo.** Escribir «Lucía necesita
48 horas, ya no alcanzo» convierte un hueco de agenda en un reproche a quien la atiende, y el
número no le sirve de nada a quien lo lee. Se dice lo que hay y lo que sí se puede.

**Es demasiado pronto.**

```
>>  ¿tienes mañana?

<<  Para el viernes 28 ya no alcanzo. Lo más cercano es el martes 1 de septiembre, y ahí tengo
    estas horas (Hora CDMX):

    1. 9:00   2. 10:00   3. 11:00   4. 12:00   5. 1:00

    ¿Te sirve alguno, o te busco otra fecha?
[buscar_horarios(relativo: "manana") · 1 de 3 · no muta]
```

«Mañana» viaja como palabra, no como fecha: el parámetro `relativo` la recibe tal cual y el
servidor la convierte con su propio «ahora». Saber que hoy es 27 y sumar uno es exactamente lo que
la regla 1 prohíbe, y el sobre no lleva la fecha de hoy.

De viernes salta a martes porque en el ejemplo Lucía no atiende sábados, domingos ni lunes. Ese
salto lo resuelve el servidor y el agente sólo lo lee.

**No hay consulta esos días.** Es el único de los cinco cuya lista propone **otra ventana** en vez
de horas, y por eso el único que no lleva marca de zona: no hay ninguna hora que situar.

```
>>  ¿tienes sábado o domingo?

<<  Los sábados y los domingos no hay consultas. Los días más próximos que sí tengo son estos:

    1. Martes 1 de septiembre
    2. Miércoles 2 de septiembre
    3. Jueves 3 de septiembre

    ¿Te sirve alguno, o te busco otra fecha?
[buscar_horarios(dias: ["sábado","domingo"]) · 1 de 3 · no muta]
```

**No hay consulta a esa hora.**

```
>>  el martes en la noche

<<  Por la noche no hay consultas. El horario es de 9:00 a 6:00, y para el martes 1 de septiembre
    tengo estas horas (Hora CDMX):

    1. 12:00   2. 1:00   3. 3:00   4. 4:00   5. 5:00

    ¿Te sirve alguno, o te busco otra fecha?
[buscar_horarios(dias: ["martes"], parte_del_dia: "noche") · 1 de 3 · no muta]
```

Quien convierte «en la noche» en un par de horas es el servidor, con el horario de esa
profesional. El modelo nunca mapea una franja a un rango: la tarde de quien atiende de 3:00 a 6:00
no es la de nadie más.

**Sí hay consulta, pero está llena.** Éste ofrece **dos caminos, no uno**: la misma hora en otros
días, y otras horas en el mismo día.

```
>>  el martes al mediodía

<<  Para esos días ya no tengo espacio a esa hora. Esa misma hora la tengo el miércoles 2 de
    septiembre, y ese mismo día tengo otras horas (Hora CDMX):

    1. Miércoles 2, 12:00
    2. Jueves 3, 12:00
    3. Martes 1, 10:00
    4. Martes 1, 3:00

    ¿Te sirve alguno, o te busco otra fecha?
[buscar_horarios(dias: ["martes"], parte_del_dia: "mediodia") · 1 de 3 · no muta]
```

La lista mezcla las dos salidas, y por eso cada renglón lleva día y hora. Ofrecer una sola la manda
a preguntar otra vez por la que no se le ofreció.

**Esos días concretos no va a haber.**

```
>>  ¿el 15 o el 16?

<<  El 15 y el 16 no hay consultas. Lo más cercano es el 17, y ahí tengo estas horas (Hora CDMX):

    1. 9:00   2. 10:00   3. 12:00   4. 3:00   5. 5:00

    ¿Te sirve alguno, o te busco otra fecha?
[buscar_horarios(fechas: [15,16]) · 1 de 3 · no muta]
```

Las fechas viajan como el número del día, sin mes y sin año, y el servidor las resuelve **siempre
hacia adelante**: «el 20» dicho un 27 acaba en el 20 del mes que viene, y la etiqueta con el mes es
la única corrección que hace falta. Si esa fecha cae más allá de lo que se alcanza a ver, no se
resuelve a nada y sale `fuera_del_horizonte`, que dice que hasta ahí no llega y ofrece buscar
dentro de las próximas semanas.

**Y hay una sexta salida que no es un motivo de agenda:** pedir una modalidad que ese servicio no
admite. Se comprueba **antes** que los cinco, porque no depende de la agenda, y sale
`modalidad_no_disponible_en_servicio`. Contestar «los martes no hay consultas» a quien pidió en
línea un servicio que sólo es presencial es falso, y la manda a buscar otro día cuando lo que hay
que cambiar es la modalidad.

### 1.7 Cuando no hay ni un horario abierto

```
>>  quiero una cita

<<  Ahorita Lucía no tiene horarios abiertos para las próximas semanas. Escríbele directamente
    para que te dé un espacio.
[ver_servicios() · 1 de 3 · no muta · cierra]
```

Es el texto `sin_horarios` y **cuesta una sola llamada**: no tiene sentido enseñar precios de algo
que no se puede apartar. Sale también cuando la profesional tiene apagado el agendado por parte de
la paciente.

### 1.8 Un servicio que no tiene, y uno que no existe

```
>>  quiero agendar una terapia de pareja

<<  Ese servicio no lo tienes asignado, así que desde aquí no te lo puedo agendar. Pídele a Lucía
    que te lo habilite y con gusto te lo agendo.
[ver_servicios(pidio: "terapia de pareja") · 1 de 3 · no muta]
```

La lista que se le enseña es la que le toca: **sus servicios asignados si tiene alguno, y el
catálogo completo de su profesional si no tiene ninguno.** Hasta ocho renglones, que es la única
lista del sistema que pasa de cinco: el catálogo es corto, estable y no caduca como una lista de
horas.

Son **dos textos y no uno**, porque prometen cosas distintas. El de arriba es para el servicio que
su profesional sí da y a ella no le está asignado, y se arregla pidiéndoselo. Si pide uno que su
profesional **no ofrece en absoluto**, sale `servicio_no_existe`, que le enseña la lista y le
pregunta cuál quiere: decirle «pídele que te lo habilite» de algo que no existe es mandarla a una
conversación que no lleva a nada.

Y si pide por su nombre uno que **sí** tiene, no se le vuelve a enseñar el menú: se le confirma
cuál es y se pasa directo a preguntarle día y hora. Enseñarle la lista entera después de que lo
acaba de decir es hacerle repetir.

---

## 2. Mandar el comprobante

**Siempre se pregunta antes de guardar**, aunque haya un solo cobro esperando y aunque la
plantilla que ella contesta nombre la cita. La base admite un comprobante por cobro para siempre y
la app no ofrece manera de reemplazarlo: una foto equivocada queda pegada. Es la única excepción
del diseño a la regla de actuar cuando hay una sola candidata.

**Recibir comprobantes vale para todas las profesionales**, cobren antes o después de la sesión.
Quien cobra al cerrar también recibe transferencias por WhatsApp. Lo único que aplica sólo al cobro
por adelantado es **pedir el pago al agendar**.

**Las candidatas son cobros, no citas.** Todo cobro suyo que siga pendiente y sin archivo pegado,
**sin importar el estado de la cita** —cancelada, movida o pasada—, más el de su próxima cita
futura; de una serie, sólo el de la ocurrencia más próxima.

### 2.1 Una sola pendiente — 2 llamadas, una por mensaje

```
>>  [imagen]

<<  ¿Es el comprobante de tu cita del martes 1 de septiembre?
[mandar_comprobante() · 1 de 3 · no muta]

>>  sí

<<  Listo, recibí tu comprobante. Tu cita del martes 1 de septiembre a las 4:00 ya quedó
    confirmada.
[mandar_comprobante(cita: 1) · 1 de 3 · muta · avisos payment_proof_received y
 appointment_confirmed · cierra]
```

**El cobro se identifica por fecha.** La hora sólo se agrega cuando hay dos o más cobros del mismo
día, que es el único caso en que la fecha sola no alcanza.

**Nunca dice «pagado» ni «aprobado»** (regla 4): dice que lo recibió, y el cobro sigue pendiente.
El aviso que le llega a la profesional **no lleva el monto**, y cuando el comprobante confirma la
cita se escriben **los dos avisos en la misma transacción**: es una mutación de cita y no hay
excepción (regla 13). El agente no mira la imagen: no valida que sea un comprobante, valida que
haya un cobro al cual pegarlo.

### 2.2 Varias pendientes — 2 llamadas

```
>>  [imagen] ya pagué

<<  ¿De cuál de estas es tu comprobante?

    1. Jueves 20 de agosto — $800
    2. Martes 1 de septiembre — $800
[mandar_comprobante() · 1 de 3 · no muta]

>>  la 1

<<  Listo, recibí tu comprobante de tu sesión del jueves 20 de agosto. Ya se lo hice llegar a
    Lucía.
[mandar_comprobante(cita: 1) · 1 de 3 · muta · aviso payment_proof_received · cierra]
```

La lista va con fecha y monto, la más antigua primero. **Las sesiones pasadas no se colapsan:**
cada una es su propia deuda, y juntarlas escondería dinero sin dueño. El acuse de una sesión que
ya pasó es otro, porque no confirma nada.

### 2.3 El comprobante de una cita que ya se canceló — 2 llamadas

```
>>  [imagen]
    [contestando a la plantilla que le pidió el comprobante de la cancelación tardía]

<<  ¿Es el comprobante de tu cita del jueves 27 de agosto?
[mandar_comprobante() · 1 de 3 · no muta]
```

Es el mismo flujo, y hay que decirlo aparte porque **es el único camino que el producto tiene para
cobrar una cancelación tardía**. Con las candidatas puestas sobre citas vivas, ella mandaba la foto
de lo que nosotros le pedimos y leía «no tengo ningún cobro tuyo esperando comprobante». Con las
candidatas puestas sobre cobros, entra.

### 2.4 Manda dos fotos seguidas — 2 llamadas

```
>>  [imagen]
>>  [imagen]
    [las dos dentro de la ventana de agrupamiento]

<<  Me llegaron varias imágenes. Me quedo con la última. ¿Es el comprobante de tu cita del martes
    1 de septiembre?
[mandar_comprobante() · 1 de 3 · no muta]
```

El agrupamiento entrega lotes, así que dos fotos seguidas son **una sola entrega con dos
renglones**: suponer un archivo por mensaje es el error clásico. Se toma la última y se dice cuál.
La memoria de la conversación guarda **de qué archivo se preguntó**, y si llega uno nuevo antes de
que ella conteste, la pregunta se rehace sobre el nuevo. Sin eso, la pregunta protege contra la
cita equivocada y no contra el archivo equivocado, que es el mismo daño y tampoco tiene arreglo.

### 2.5 Ninguna pendiente — 1 llamada

```
>>  [imagen]

<<  No tengo ningún cobro tuyo esperando comprobante. Si es de algo que Lucía te pidió aparte,
    mándaselo directo.
[mandar_comprobante() · 1 de 3 · no muta · cierra]
```

Da igual qué traiga la foto: lo que decide la respuesta es si hay un cobro esperando.

### 2.6 Audio, video o sticker — 0 llamadas

Es `no_entendi` y lo contesta el prompt sin llamar a nada: el agente no oye audio ni ve video, así
que lo trata como lo que no logró leer y vuelve a ofrecer los verbos de esa profesional. **El
silencio es peor**, y era lo que hacía la versión anterior.

**Cada renglón del lote llega con su tipo cuando no es texto**, en una marca que escribe el borde y
el modelo sólo lee: `[imagen]`, `[pdf]`, `[audio]`, `[video]`, `[sticker]`, `[ubicación]`,
`[contacto]`, `[archivo]`, seguida del texto si lo trae. Sin esa marca, una foto sin texto llega
como un renglón vacío y el flujo del comprobante no arranca. Imagen y PDF van a
`mandar_comprobante`; **cualquier otro tipo, incluida una ubicación o una tarjeta de contacto, va a
`no_entendi`**.

### 2.7 Y lo que no pasa

**Si tiene un comprobante pendiente y escribe por otra cosa, el agente no lo menciona.** Contesta
lo que le preguntaron y ya. Cobrarle de paso en una conversación sobre otro tema es lo que hace que
deje de escribir. El recordatorio llega solo, por plantilla, desde el trabajo programado.

---

## 3. Confirmar

### 3.1 Cobra después — 1 llamada

```
>>  sí voy

<<  Listo, tu cita del miércoles 2 de septiembre a las 4:00 quedó confirmada.
[confirmar() · 1 de 3 · muta · aviso appointment_confirmed · cierra]
```

Es la gestión más barata del catálogo. Casi siempre llega contestando a la plantilla de
confirmación, y esa pista viaja ya redactada en el contexto que arma el borde, sin costar ninguna
llamada.

### 3.2 Prepago: decir «sí voy» no confirma — 1 llamada

```
>>  ahí estaré

<<  Tu cita del martes 1 de septiembre a las 4:00 se confirma con tu comprobante.

    Transfiere a {banco}, a nombre de {titular}, CLABE {clabe}, y mándame el comprobante por aquí.
[confirmar() · 1 de 3 · no muta · cierra]
```

**Lo que confirma es el archivo, no la palabra.** La función no escribe nada y aun así contesta lo
único que sirve, sin gastar una llamada de más. Tampoco pone plazo, por lo mismo que el cierre de
agendar: no hay ningún reloj que cumplir.

Sin datos en el perfil, el segundo párrafo es «Pídele los datos para la transferencia y mándame el
comprobante por aquí». Es el mismo hueco de los cierres de agendar, con sus mismos dos valores.

**Si ella ya mandó su comprobante, no se le pide de nuevo** y «sí voy» confirma normal: pedir dos
veces el mismo archivo la hace dudar de que el primero llegó, y la base admite uno solo por cobro.

### 3.3 Con varias esperando — 2 llamadas

```
>>  sí voy

<<  ¿Cuál me confirmas?

    1. Miércoles 2, 4:00
    2. Viernes 4, 10:00
[confirmar() · 1 de 3 · no muta]

>>  la 1

<<  Listo, tu cita del miércoles 2 de septiembre a las 4:00 quedó confirmada.
[confirmar(citas: [1]) · 1 de 3 · muta · cierra]
```

**Siempre se pregunta cuál.** Nunca se asume, ni por la última plantilla ni por la más próxima:
confirmar la equivocada la deja creyendo que avisó de una sesión a la que no va a ir.

### 3.4 Y puede contestar «ambas» — 2 llamadas

```
>>  ambas

<<  Listo, tus citas del miércoles 2 y del viernes 4 quedaron confirmadas.
[confirmar(citas: "todas") · 1 de 3 · muta · un aviso appointment_confirmed por cita · cierra]
```

Va **una sola llamada, una sola transacción, y un aviso a la profesional por cada cita**: si alguno
de los avisos no se puede escribir, no se confirma ninguna. Por eso `confirmar` es la única función
que recibe varias citas de una vez, y por eso lo que espera se llama `citas`, en plural.

El 1 sólo vale contra la última lista de esta función. No es un identificador: es una posición, y
un 1 de aquí no significa nada en otra función.

---

## 4. Reprogramar

**Mover se permite sin importar cuánto falte.** El aviso de cambio no bloquea: sólo decide si se
cobran las dos sesiones, y lo único que cambia es lo que se advierte antes.

**Lo que sí corta es la anticipación mínima de la ficha**, que decide desde cuándo se puede tomar
un horario, y el horario nuevo tiene que caber en ella igual que si estuviera agendando de cero.
Son dos cosas distintas y hay que decirlas por separado: dichas mezcladas —«se permite siempre»—
le prometían un día que la búsqueda le iba a negar un mensaje después.

**La anticipación se cuenta desde hoy**, no desde la fecha de la cita que se mueve: al mover se
está tomando un horario nuevo hoy, así que el corte se recalcula hoy.

### 4.1 Con tiempo — 3 llamadas

```
>>  no voy a poder el miércoles

<<  Va, muevo tu cita del miércoles 2 de septiembre a las 4:00. ¿Qué días te quedan mejor y a
    qué hora?

    Tu cita nueva la puedes tomar presencial o en línea, dime también cómo la prefieres.
[reprogramar() · 1 de 3 · no muta]

>>  el viernes en la mañana, en línea

<<  Para el viernes 4 de septiembre, en línea, tengo estas horas (Hora CDMX):

    1. 9:00   2. 10:00   3. 11:00   4. 12:00   5. 1:00

    Dime cuál te acomoda.
[buscar_horarios(dias: ["viernes"], parte_del_dia: "manana", modalidad: "en_linea") ·
 1 de 3 · no muta]

>>  la 2

<<  Listo, moví tu cita al viernes 4 de septiembre a las 10:00, en línea.
[reprogramar(opcion: 2) · 1 de 3 · muta · aviso appointment_rescheduled_by_patient · cierra]
```

**La modalidad sí se vuelve a preguntar**, cuando ese servicio admite las dos: mover la cita es
justo cuando cambia el motivo por el que iba a ir en persona. La pregunta va pegada a la del día,
en el mismo mensaje, para que no cueste un viaje aparte. **El servicio no se pregunta:** viene de
la cita que se mueve.

**La búsqueda no recibe cuál cita se está moviendo, y no le hace falta.** La primera llamada la
anotó en la memoria de la conversación, y de ahí la lee el servidor para excluirla de la búsqueda,
que es lo que evita que se tape a sí misma los huecos vecinos. Antes viajaba en un parámetro, y era
el único número del diseño que cruzaba de una función a otra —además de que no funcionaba cuando
había una sola candidata, que es el caso normal—.

Con varias candidatas la gestión sube a cuatro: primero la lista numerada, y ella escoge.

**Con tiempo mínimo el dinero viaja con la cita.** Si el cobro estaba acreditado, el nuevo nace
acreditado; si había comprobante, se copia y **no se le vuelve a pedir**. Sólo cuando el cobro
viejo era un pendiente a secas y su profesional cobra por adelantado, el cierre es el otro
—`reprogramar_cierre_prepago`— y lleva el monto y cómo pagar. Los detalles del dinero están en
`docs/03-dinero.md`.

### 4.2 Sin tiempo mínimo, y la anticipación cortando en la misma gestión — 4 llamadas, una por mensaje

```
>>  se me atravesó algo, ¿puedo mover la de hoy?

<<  Perfecto, te ayudo a reprogramarla. Sólo te aviso antes: Ramiro pide 12 horas de aviso para
    cambios y ya faltan menos, así que se cobran las dos sesiones — la del jueves 27 y la nueva.

    ¿La movemos?
[reprogramar() · 1 de 3 · no muta]

>>  sí, muévela

<<  Va, muevo tu cita del jueves 27 de agosto a las 5:00. ¿Qué días te quedan mejor y a qué hora?

    Tu cita nueva la puedes tomar presencial o en línea, dime también cómo la prefieres.
[reprogramar(confirmado: true) · 1 de 3 · no muta]

>>  ¿tienes mañana?

<<  Para el viernes 28 ya no alcanzo. Lo más cercano es el sábado 29 de agosto, y ahí tengo estas
    horas (Hora CDMX):

    1. 10:00   2. 11:00   3. 12:00   4. 4:00   5. 5:00

    ¿Te sirve alguno, o te busco otra fecha?
[buscar_horarios(relativo: "manana") · 1 de 3 · no muta]

>>  la 2

<<  Listo, moví tu cita al sábado 29 de agosto a las 11:00, presencial.
[reprogramar(opcion: 2) · 1 de 3 · muta · aviso appointment_rescheduled_by_patient · cierra]
```

**El «sí» del aviso cuesta su propia llamada**, y por eso ésta empata con agendar como la gestión
más larga. El aviso espera `confirmado`, así que la respuesta vuelve a `reprogramar` y de ahí sale
la pregunta del día; sólo después entra la búsqueda. Cuatro llamadas repartidas en cuatro mensajes,
una por mensaje, y el tope de tres ni se acerca.

**Los dos plazos aparecen en la misma gestión, y no es un error.** Primero se le avisa que se cobran
las dos sesiones, porque el aviso de cambio ya no alcanza; después la búsqueda sólo le ofrece días
a partir del primero que la anticipación mínima permite. Son dos números distintos de la misma
ficha y cada uno contesta una pregunta distinta: uno, si hay cargo; el otro, desde cuándo se puede
tomar un horario.

**El aviso es un aviso, no una negativa:** diga lo que diga el reloj, si ella dice que sí, se mueve.
Las 12 horas salen de la ficha de esa profesional; un número escrito a mano le mentiría a las
pacientes de quien pide otro, y en la dirección peligrosa (regla 2).

**El corte de la anticipación no dice cuánta anticipación se pide.** Dice cuál es el día más cercano
al que sí alcanza y ofrece las horas de ese día. El número es política de quien la atiende, y
ponerlo ahí convierte un hueco de agenda en un reproche.

**El cierre no repite el aviso de cobro**, porque ya se dio antes de mover. Y el aviso sólo se da
cuando hay algo que cobrar: con una sesión de precio cero se mueve sin mencionar dinero. A ella no
se le dice que su profesional va a decidir (regla 5): se le dice lo que va a pasar.

**Sin tiempo mínimo el pago viejo se queda congelado en la cita de origen** y la cita nueva nace con
su propio cobro. Cuando esa cita nueva es de prepago, el cierre lleva el monto y cómo pagar; el
caso duro —ya mandó comprobante, mueve tarde, y su comprobante se queda en la vieja— es exactamente
lo que significa «se cobran las dos sesiones», y por eso se avisa antes de mover y no después.

### 4.3 Cuando la cita es de una serie — 2 llamadas

Si la cita pertenece a una serie viva y ella ya tiene agendada la siguiente ocurrencia, hay una
segunda salida: no buscar hueco nuevo, sino dejarla en esa próxima.

```
>>  no voy a poder ir el martes

<<  Esa cita es de tus sesiones cada semana. Te busco otro día, o te la paso a tu próxima del
    martes 8 de septiembre a las 4:00 y cancelo ésta. ¿Cuál prefieres?
[reprogramar() · 1 de 3 · no muta · la conversación sigue abierta]

>>  pásala a la del 8

<<  Listo, cancelé tu cita del martes 1 de septiembre. Tu próxima sigue en pie, el martes 8 de
    septiembre a las 4:00, y tu pago quedó ahí.
[reprogramar(a_la_proxima: true) · 1 de 3 · muta · aviso appointment_cancelled_by_patient · cierra]
```

Es lo que casi siempre quiere quien falta a una sesión de una serie semanal, y no gasta un hueco de
la agenda. **La cita vieja queda cancelada, no reprogramada**, y la ocurrencia que ya existía no se
toca: es la única forma de que la serie no acabe con dos citas donde había una.

**La salida se ofrece con pago o sin él, y la ejecuta la misma función que la ofreció.** Antes
pasaba por la función del dinero, que contestaba «esa cita no tiene ningún pago tuyo adentro, así
que no hay nada que pasar» justo cuando ella acababa de aceptar lo que le acabábamos de ofrecer.
Consolidar la serie es una operación de agenda; el dinero se mueve **si lo hay y si alcanza el
tiempo mínimo**, y si no, el cierre es el mismo sin la última frase: «Listo, cancelé tu cita del
martes 1 de septiembre. Tu próxima sigue en pie, el martes 8 de septiembre a las 4:00».

**Pasar el pago a una ocurrencia que ya existe no toca la anticipación mínima**, porque ahí no se
está tomando ningún horario nuevo: se está usando uno que ya estaba apartado.

La oferta deja la conversación abierta y **sin dato que esperar**, porque la respuesta puede ir a
dos sitios: seguir aquí buscando día, o aceptar la salida. Declarar ahí un dato mandaría un
«búscame otro día» a la rama contraria.

### 4.4 Los dos rechazos, y decir que no

Sin ninguna cita futura que mover: «No tengo ninguna cita tuya por mover. Si quieres agendar una,
dime qué días te quedan mejor». Y si pide mover una sesión de la serie que no es la más próxima, se
le dice que por aquí se mueve la más próxima y que las demás las ajusta su profesional desde su
app. Ninguno de los dos es un error, y los dos ofrecen algo.

Y si después del aviso tardío dice que no: «Va, la dejo como está: tu cita del jueves 27 de agosto
a las 5:00 sigue en pie». Con `hecho: false` y cierra.

### 4.5 La cita dejó de estar donde estaba — 1 llamada

Mover son tres llamadas en tres mensajes. Entre la primera y la última, la profesional pudo
cancelarla, moverla o cerrarla desde su app.

```
>>  la 2

<<  Esa cita se movió mientras hablábamos: ahora es el viernes 4 de septiembre a las 10:00. ¿Te la
    muevo desde ahí?
[reprogramar(opcion: 2) · 1 de 3 · no muta · la conversación sigue abierta]
```

Son tres textos —que ya no está, que cambió de lugar, y que ya pasó— y los tres traen salida. La
llamada que escribe **relee el estado de la cita de origen dentro de su propia transacción**, no
sólo el efecto de lo que iba a hacer. Sin estos textos, el desenlace real era «se me acabó el
espacio», que es falso y no dice lo único útil.

---

## 5. Cancelar

**Cancelar no se bloquea nunca**, con dinero adentro o sin él, con tiempo o sin él. La anticipación
mínima no entra aquí: cancelar no toma ningún horario. El plazo de aviso sólo decide si queda un
cargo, y lo único que cambia es qué se le ofrece antes.

### 5.1 A tiempo y sin dinero adentro — 1 llamada

```
>>  quiero cancelar mi cita del sábado

<<  Listo, cancelé tu cita del sábado 29 de agosto a las 11:00. No te queda ningún cobro
    pendiente por ella.
[cancelar() · 1 de 3 · muta · aviso appointment_cancelled_by_patient · cierra]
```

**No se pregunta «¿de verdad?».** Preguntar dos veces cuando no hay ninguna consecuencia es un
mensaje de más. Y si no tuviera nada que cancelar, la respuesta seguiría teniendo una salida —«Si
quieres agendar una, dime qué días te quedan mejor»—, nunca un error.

**El cierre es uno solo y el servidor le pega la coletilla que corresponda.** Aquí, que no le queda
ningún cobro. Eran tres claves que decían lo mismo con un final distinto, y mantener la misma
primera línea en tres sitios es cómo se separan.

### 5.2 Tarde — 2 llamadas

```
>>  no voy a poder llegar hoy

<<  Te la cancelo, pero antes te aviso: Ramiro pide 12 horas de aviso y ya faltan menos, así que
    la sesión se te cobra. ¿La cancelo de todos modos?
[cancelar() · 1 de 3 · no muta]

>>  sí, cancélala

<<  Listo, cancelé tu cita del jueves 27 de agosto a las 5:00.
[cancelar(confirmado: true) · 1 de 3 · muta · cierra]
```

**Cancelar tarde sí se puede.** Rechazarlo deja el peor camino: ella avisó que no podía ir, nadie
registró nada, la cita sigue en pie, y la profesional se entera el día de la sesión cuando no llega
nadie. Aquí el cierre no lleva coletilla: el cargo ya se avisó antes, y repetirlo es regañarla.

**En ningún caso se cobra solo.** La cancelación deja la decisión de cobro abierta, y quien la cobra
o la condona es la profesional desde su app.

Si dice que mejor no: «Va, no la cancelo: tu cita del jueves 27 de agosto a las 5:00 sigue en pie».

### 5.3 Con dinero adentro y a tiempo: dos salidas primero — 3 llamadas

«Dinero adentro» tiene una definición exacta y una sola: el cobro está acreditado, o hay un
comprobante pegado. Una petición sellada sin archivo **no** es dinero adentro (regla 10). Y los dos
estados conviven: **acreditado gana siempre sobre comprobante**, y esa precedencia está escrita una
sola vez, en `docs/03-dinero.md` §2.

**La cita sí se cancela.** Lo que hace el agente antes es ofrecer las salidas que quizá le convienen
más, **una vez y sólo una**.

```
>>  necesito cancelar la del martes

<<  Ya mandaste tu comprobante de esa cita. Antes de cancelarla: puedo reprogramarla, o cancelar
    ésta y dejar el pago en la próxima, la del martes 8. ¿Cuál prefieres, o te la cancelo?
[cancelar() · 1 de 3 · no muta · la conversación sigue abierta]

>>  va, muévela al miércoles en la tarde

<<  Para el miércoles 2 de septiembre, en línea, tengo estas horas (Hora CDMX):

    1. 3:00   2. 4:00   3. 5:00

    Dime cuál te acomoda.
[buscar_horarios(dias: ["miércoles"], parte_del_dia: "tarde") · 1 de 3 · no muta]

>>  la 1

<<  Listo, moví tu cita al miércoles 2 de septiembre a las 3:00, en línea.
[reprogramar(opcion: 1) · 1 de 3 · muta · cierra]
```

Cuando no hay una próxima ocurrencia viva de su serie, la salida es una sola y el texto lo dice así:
«Esa cita ya está pagada. Antes de cancelarla: puedo reprogramarla y tu pago se va con ella. ¿Te
busco día, o te la cancelo?».

**No hay que volver a decir cuál cita se mueve.** `cancelar` ya la resolvió y la anotó en la memoria
de la conversación, así que la búsqueda y la escritura la leen de ahí. Y el cierre es el normal, sin
pedir comprobante: se movió con tiempo mínimo, así que el comprobante que ya había se copia al cobro
nuevo.

**El destino del traslado es la próxima ocurrencia viva de su serie**, no la próxima cita del mismo
servicio. No son el mismo conjunto, y el texto nombraría un día mientras el dinero acaba en otro. Si
la cita no es de una serie, no hay destino y esa salida no se ofrece.

**La primera línea cambia sola según el estado** —«ya está pagada» o «ya mandaste tu
comprobante»— y el agente no escoge cuál. La conversación se queda abierta **y sin dato que
esperar**, porque la cuenta de si ya se ofrecieron las salidas la lleva el servidor y la respuesta
puede ir a dos funciones distintas.

### 5.4 Con dinero adentro y sin tiempo mínimo — 3 llamadas

```
>>  ya no voy a poder ir hoy, cancélala

<<  Esa cita ya está pagada, y para cambios Lucía pide 24 horas de aviso: ya faltan menos, así
    que tu pago se queda en ésta y la nueva se cobra aparte. Aun así te la puedo mover. ¿Te busco
    día, o te la cancelo?
[cancelar() · 1 de 3 · no muta · la conversación sigue abierta]
```

Fuera de plazo se ofrece **sólo mover, y con el precio dicho**. La salida de dejar el pago en la
próxima **no se ofrece**, porque fuera de plazo el pago no se pasa: ofrecerla sería prometerle un
traslado que no ocurre. Y mover se sigue ofreciendo, porque ofrecer una salida antes de cancelar con
el precio por delante es más honesto que no ofrecer ninguna.

**Pasar el pago exige tres condiciones juntas:** dinero adentro, aviso dentro del plazo de esa
ficha, y una próxima ocurrencia viva de su serie. Faltando cualquiera, la salida no se menciona. El
plazo sí bloquea aquí, y es lo contrario de lo que decían tres documentos: si no bloqueara, el
traslado cerraría el cobro viejo como no cobrado y la profesional perdería el cargo que su propia
política le concede.

### 5.5 Si escoge dejar el pago en la próxima — 1 llamada, encadenada

Sale de la salida que `cancelar` acaba de ofrecer en el §5.3. **No es una intención propia ni una
función aparte:** es un booleano de `cancelar` que sólo se puede llenar después de que el servidor
ofreció esa salida, porque el único texto que la menciona es el suyo.

```
>>  déjalo en la del 8

<<  Listo, cancelé tu cita del martes 1 de septiembre a las 4:00. Tu pago quedó en tu sesión del
    martes 8 de septiembre a las 4:00.
[cancelar(pasa_el_pago: true) · 1 de 3 · muta · aviso appointment_cancelled_by_patient · cierra]
```

**El destino no se señala y el modelo no lo elige.** Lo resuelve el servidor, que ya sabe cuál es la
próxima ocurrencia viva de su serie. Así el modelo no puede mover dinero por iniciativa propia sobre
una cita que él escogió, que era el riesgo de tenerlo como intención suya.

La coletilla **nombra la cita destino, no el estado del cobro**, justo porque acreditado y
comprobante conviven y decir cuál de los dos es adivinar. Y nombra la cancelación de la vieja,
porque eso es lo que de verdad le pasa y callarlo la dejaría creyendo que sigue en pie.

**Lo único que se revisa es que la cita destino no traiga ya dinero suyo.**

```
>>  pásalo a la siguiente

<<  Ya no pude dejar el pago en tu próxima sesión, así que no cancelé nada: tu cita del martes 1
    de septiembre a las 4:00 sigue en pie. Lucía lo acomoda contigo. ¿Te la muevo de día, o te la
    cancelo?
[cancelar(pasa_el_pago: true) · 1 de 3 · no muta · la conversación sigue abierta]
```

Es una carrera, no una política: entre que se ofreció la salida y ella contestó, la próxima se
canceló o adquirió su propio pago. Un solo texto para las dos, porque a ella le pasa lo mismo en las
dos. **Y no se cancela nada**: cancelar una cita cuyo pago no llegó a moverse la dejaría peor de
como estaba. Sobrescribir un pago que ya estaba ahí borra un dato que nadie puede reconstruir.

**Que los importes no coincidan no detiene nada**: se pasa igual y la profesional ajusta desde su
app, que es donde se ajustan los importes.

### 5.6 Y si dice que no a las dos, se cancela — 2 llamadas

```
>>  no, cancélala de todos modos

<<  Listo, cancelé tu cita del martes 1 de septiembre a las 4:00. Tu pago queda registrado y
    Lucía lo resuelve contigo.
[cancelar(confirmado: true) · 1 de 3 · muta · aviso appointment_cancelled_by_patient · cierra]
```

**El agente no insiste una segunda vez:** ella ya escuchó las salidas y las rechazó. La cita queda
cancelada sin tiempo mínimo y **el estado del pago se conserva tal cual**, con la decisión abierta,
para que su profesional decida si lo cobra o lo condona.

A la paciente no se le pide que adivine cuál de las dos: se le dice lo único que necesita saber,
que su dinero no se perdió y con quién se ve. Negarse aquí dejaba el peor camino de todos —ella
avisó, nadie registró nada, y la cita seguía en pie—, y encima le hacía creer que su dinero
dependía de insistir.

---

## 6. Cambiar de modalidad

**Es el único cambio que el plazo sigue bloqueando**, y es a propósito: la profesional necesita
saber con tiempo si tiene que ir al consultorio. Cancelar y mover se permiten porque el hueco se
libera de todos modos; cambiar la modalidad a última hora la manda a un consultorio vacío o la deja
sin él.

Es una decisión **por dirección**, y la dirección la determina la modalidad que la cita tiene hoy:
una presencial sólo puede ir a en línea. No hay versión tardía con cargo: o alcanza el tiempo, o
no se cambia. Y no toca dinero nunca: ni el cobro, ni su estado, ni su petición.

### 6.1 La propuesta y el cambio — 2 llamadas

```
>>  ¿la puedo tomar en línea?

<<  Sí. Tu cita del miércoles 2 de septiembre a las 4:00 pasaría de presencial a en línea.
    ¿La cambio?
[cambiar_modalidad() · 1 de 3 · no muta]

>>  sí

<<  Listo, tu cita del miércoles 2 de septiembre a las 4:00 queda en línea.
[cambiar_modalidad(confirmado: true) · 1 de 3 · muta · aviso modality_changed_by_patient · cierra]
```

**Las candidatas son dos condiciones, no cuatro:** la cita está viva y en el futuro, y su servicio
admite las dos modalidades. El permiso de esa profesional y la anticipación **no filtran: deciden el
texto**, que es para lo que existen. Con el filtro de cuatro, una cita a la que le faltaba el
permiso o el tiempo nunca entraba y salía «no tengo ninguna cita tuya a la que le pueda cambiar la
modalidad», cuando lo que pasó es que llegó tarde. Con varias, la lista va con la modalidad actual
de cada una y la gestión sube a tres.

Si dice que no: «Va, la dejo como está: tu cita del miércoles 2 de septiembre se queda presencial».

### 6.2 Las dos negativas — 1 llamada

```
>>  ¿me la puedes pasar a en línea?

<<  Lucía no maneja cambios a en línea. Tu cita del martes 1 se queda presencial.
[cambiar_modalidad() · 1 de 3 · no muta · cierra]
```

```
>>  ¿la de hoy la puedo tomar en línea?

<<  Para cambiar la modalidad Ramiro pide 12 horas de anticipación, y ya faltan menos. Tu cita
    del jueves 27 se queda presencial. Si es urgente, coméntaselo.
[cambiar_modalidad() · 1 de 3 · no muta · cierra]
```

Son las dos únicas negativas por plazo que quedan en todo el sistema, y **ahora sí se pueden
alcanzar**, precisamente porque el permiso y la anticipación dejaron de filtrar. Las dos nombran la
dirección, no la modalidad deseada, y las dos dicen cómo queda la cita para que no quede duda de si
algo cambió. Y ninguna repite el nombre de la profesional dos veces.

Para una profesional que no permite ningún cambio de modalidad, el verbo no se menciona en el menú
(regla 8), así que esta intención casi nunca llega.

---

## 7. Dejar reseña — 1 llamada

El agente no la pide: la pide la plantilla, que ya trae la petición completa.

```
>>  5 estrellas, me ayudó muchísimo

<<  Listo, te agradecemos mucho que compartieras esto. Tu nombre queda anónimo: en su perfil sólo
    se muestran tus iniciales.

    Nos ayuda a que más personas encuentren en el directorio a quien las acompañe.
[dejar_resena(estrellas: 5, comentario: "me ayudó muchísimo") · 1 de 3 · muta · sin aviso ·
 cierra]
```

**Ningún aviso, y es deliberado:** la reseña no existe para nadie hasta que una persona la modera,
y una tarjeta de algo invisible sería una tarjeta vacía. Por lo mismo, **nunca se promete
publicación**.

Cuando llega en partes, la pregunta que falta **cuesta cero llamadas**, porque no lleva ni un dato
adentro:

```
>>  5 estrellas

<<  Gracias. ¿Quieres agregar un comentario para su perfil? Si no, así la dejo.
[cero llamadas · el texto vive en el prompt]

>>  así déjala

<<  Listo, te agradecemos mucho que compartieras esto. Tu nombre queda anónimo…
[dejar_resena(estrellas: 5) · 1 de 3 · muta · cierra]
```

Se pregunta una vez y no se insiste. Si llega sólo el comentario, se pide la calificación
—«Gracias por escribirlo. ¿Cuántas estrellas le pones, del 1 al 5?»—; **sin calificación no se
llama a nada**. Ninguna de las dos preguntas es un resultado de la función, y por eso ninguna gasta
llamada.

---

## 8. Consultar — 1 llamada

`mis_citas` cubre las tres preguntas de la misma familia: **qué citas tengo, dónde es, y cuánto
debo.** No hay función de dirección aparte ni de adeudos: son la misma consulta con distinto
énfasis, y partirla en tres obligaría al modelo a elegir entre tres puertas que llevan al mismo
cuarto.

### 8.1 Qué tengo

```
>>  hola

<<  Tienes esto con Lucía:

    1. Miércoles 2 de septiembre, 4:00 — en línea
    2. Viernes 4 de septiembre, 10:00 — en línea

    ¿Qué necesitas? Te las puedo mover, cancelar o confirmar.
[mis_citas(sobre: "citas") · 1 de 3 · no muta · cierra]
```

Los verbos salen del menú de esa profesional: a las pacientes de Lucía no se les menciona el cambio
de modalidad, porque no lo permite.

**`mis_citas` cierra la conversación**, porque no queda ningún dato esperando. Si contesta
«muévela», ése es un mensaje nuevo con sus tres llamadas por delante. Y si no tiene ninguna cita, lo
dice y ofrece: «Ahorita no tienes ninguna cita con Lucía. ¿Te busco día para una?».

### 8.2 Dónde es

```
>>  ¿dónde es la cita?

<<  Tu cita del miércoles 2 de septiembre a las 4:00 es presencial. La dirección te la comparte
    Lucía directamente.
[mis_citas(sobre: "donde") · 1 de 3 · no muta · cierra]
```

**No se inventa una dirección.** Cuando el dato existe, la segunda frase la lleva adentro: «La
dirección es …». Lo que no cambia nunca es la primera: sin ella, la versión sin dirección perdía el
día, la hora y el dato de que es presencial, que es justo lo que preguntó.

Y si es en línea: «Tu cita del miércoles 2 de septiembre a las 4:00 es en línea. La liga te llega
una hora antes». **La liga no se manda aquí.** Sale una sola vez, en el aviso de una hora antes,
para que la tenga a la mano cuando la necesita y no la busque tres días atrás en la conversación.

### 8.3 Cuánto debo

```
>>  ¿cuánto le debo?

<<  De lo que tienes con Lucía, esto está pendiente de pago:

    1. Jueves 20 de agosto — $800
    2. Martes 1 de septiembre — $800

    Cuando lo transfieras, mándame el comprobante por aquí.
[mis_citas(sobre: "adeudos") · 1 de 3 · no muta · cierra]
```

Dice qué se espera y de qué sesión. **No dice «pagado» ni promete que algo quedó saldado.** Y si no
debe nada, lo dice en una línea.

Esto no es lo mismo que «¿me pueden devolver lo de la sesión que no tomé?», que no tiene datos
detrás y es asunto de dinero.

### 8.4 Cuánto cuesta

```
>>  ¿cuánto cuesta una sesión?

<<  Hola Emilio. Con gusto te agendo con Lucía. Sus servicios son:

    1. Psicoterapia individual · 50 minutos · $900
    2. Psicoterapia individual · 50 minutos · $800
    3. Psicoterapia de pareja · 90 minutos · $1,200
    4. Valoración inicial · 30 minutos · $0

    Dime cuál te interesa, qué días te quedan mejor y a qué hora.
[ver_servicios() · 1 de 3 · no muta]
```

**Es el mismo texto que al agendar, y ya no hay uno aparte para el precio.** Se pierde un cierre un
poco más suave para quien sólo preguntó cuánto cuesta; a cambio desaparece el caso sin cubrir de
quien pregunta precios y tiene un solo servicio, y desaparece un parámetro que sólo servía para
escoger entre dos preguntas de cierre.

El precio que se dice es **el de esa paciente**: si tiene uno preferente, ése, y la palabra
«preferente» no sale nunca al mensaje.

Cuando tiene una serie viva, el aviso va antes que nada y se lleva la pregunta: «Ya tienes
Psicoterapia individual cada semana, los martes a las 4:00, y tu próxima es el martes 8 de
septiembre a las 4:00. ¿Quieres agendar otra sesión aparte de ésa?».

---

## 9. Los bordes

**Los once textos de borde cuestan cero llamadas.** Viven literales en el prompt y se rellenan con
lo que el borde ya resolvió, así que ni el tope de llamadas ni una caída del servidor pueden
dejarlos sin respuesta.

**Y el borde nunca contesta antes de correr el modelo.** Resuelve quién escribe, lo anota, y corre
el modelo igual. Cortar en la identidad —contestar el texto del teléfono desconocido y ahí
terminar— apagaba la crisis para quien más la necesita, que es el único caso donde el silencio no
se puede reparar después.

### Crisis — 0 llamadas

```
>>  ya no quiero seguir aquí, no le veo sentido a nada
    [desde un teléfono que no tiene vínculo con ninguna profesional]

<<  Si necesitas ayuda inmediata: Agenda Psi no es un servicio de emergencias. Si tú o alguien
    más se encuentra en peligro, llama al 911. Para recibir apoyo en salud mental, comunícate
    gratis, las 24 horas, a Línea de la Vida: 800 911 2000.
[cero llamadas · el texto vive literal en el prompt · cierra]
```

**Va primero, antes que el estado de identidad, y vale para todos los estados:** teléfono
desconocido, cuenta dada de baja y paciente activa. Un «ya no aguanto» desde un teléfono que no
conocemos tiene que recibir la línea de ayuda, no una liga al directorio.

Va sola y no lleva pregunta de cierre: si el mensaje trae además «cancélame la del jueves», la
cancelación no se hace y no se menciona. **No tiene ni un hueco a propósito**, así no depende de
nada: ni de la red, ni del tope de llamadas. Las 24 horas que dice son el horario de la línea, no
un plazo del producto.

### Teléfono desconocido — 0 llamadas

```
>>  hola, quiero agendar una cita con un psicólogo

<<  Hola. Este número es el asistente de Agenda Psi, y desde aquí sólo puedo ayudar a pacientes
    que ya están con un psicólogo o psicóloga de la plataforma.

    Si estás buscando uno, aquí puedes ver quiénes están disponibles: https://agendapsi.mx
[cero llamadas · el borde ya resolvió el vínculo · cierra]
```

El directorio se ofrece aquí y sólo aquí: quien nunca fue paciente necesita encontrar a alguien.
**Ya no cuesta una llamada**, porque el borde resuelve el vínculo antes de armar el sobre y el
modelo sólo copia el texto. Las diez funciones siguen comprobando quién escribe por su cuenta y
devuelven este mismo texto si el sobre venía viejo, pero eso es un cerrojo, no el camino normal.

### La cuenta dada de baja — 0 llamadas

```
>>  quiero agendar

<<  Por ahora tu cuenta con Ramiro no aparece activa, así que desde aquí no puedo ayudarte con
    tus citas. Escríbele para que te reactive y seguimos por aquí.
[cero llamadas · el borde ya resolvió el vínculo · cierra]
```

El corte es limpio: **nunca fue paciente → directorio; fue y ya no → que la reactiven.** Y esto
cierra el hueco más grave que había: una cuenta dada de baja no recibía absolutamente nada.

### Fuera de alcance — 0 llamadas

```
>>  quiero hablar con alguien de verdad

<<  Eso no lo puedo ver desde aquí. Si necesitas ayuda de nuestro equipo, escríbenos por aquí:
    https://wa.me/525564370081

    Yo te sigo ayudando con tus citas y los comprobantes.
[cero llamadas · el texto vive en el prompt · la conversación sigue abierta]
```

El mismo texto para reactivar la cuenta, corregir un comprobante ya mandado, pedir que le hagamos
llegar un recado o recoger materiales. Cierra ofreciendo lo que sí hace: una negativa a secas deja
a quien escribe sin siguiente paso.

### Asunto de dinero — 0 llamadas

```
>>  ¿me pueden devolver lo de la sesión que no tomé?

<<  Los cobros, los descuentos y las devoluciones los decide Lucía directamente.

    Yo te ayudo con tus citas y los comprobantes.
[cero llamadas · el texto vive en el prompt · la conversación sigue abierta]
```

El nombre va una sola vez: ella ya sabe quién es su profesional. La conversación sigue abierta, así
que si después dice «ok, entonces muéveme la cita», se sigue normal. Y **«ya te mandé el
comprobante, ¿ya quedó?» no es asunto de dinero**: eso tiene datos detrás y lo contesta
`mandar_comprobante`.

### No te entendí — 0 llamadas

```
>>  asdkjh

<<  No te entendí. Por aquí te puedo ayudar con tus citas —agendar, mover, cancelar o
    confirmar— y con lo de tus pagos. ¿Qué necesitas?
[cero llamadas · el texto vive en el prompt · la conversación sigue abierta]
```

Los verbos salen del menú de esa profesional. **Un saludo suelto no es esto:** «hola» es el
arranque normal y lo contesta `mis_citas`. Esto es para lo genuinamente ininteligible, para el
audio, el video y el sticker del §2.6, y también para **un número suelto sin nada pendiente**: «la
2» al día siguiente, cuando la fila de la conversación ya caducó. Ahí **no se adivina de qué lista
era**; se contesta esto y ella lo vuelve a decir con palabras.

### Pidió dos cosas y se contestó una — 1 llamada, y el aviso cuesta cero

```
>>  cancélame la del martes y agéndame una para el jueves

<<  Listo, cancelé tu cita del martes 1 de septiembre a las 4:00. No te queda ningún cobro
    pendiente por ella.

    De lo otro que me pediste hablamos en cuanto me lo vuelvas a escribir.
[cancelar() · 1 de 3 · muta · el segundo párrafo vive en el prompt · cierra]
```

Una mutación por mensaje (regla 14). El agente contesta la primera y **dice que la segunda queda
pendiente**, que es lo que antes no podía hacer: se contestaba una y de la otra no se decía ni una
palabra. Pegar ese párrafo al final es la **única excepción** a copiar el texto de la función sin
agregar nada antes ni después, y está escrita como excepción justo para que no se lea como permiso
general.

### Se acabó el espacio — 0 llamadas

```
>>  ¿y el viernes 11?

<<  Se me acabó el espacio de esta consulta. Escríbeme otra vez y seguimos justo desde donde nos
    quedamos.
[cero llamadas · tres de tres gastadas en este mensaje · cierra]
```

Vive en el prompt y no en una función porque cuando hace falta ya no queda ninguna llamada: una
herramienta que sólo se puede usar cuando no se puede usar ninguna es una herramienta rota. **Lo
compone el borde, no el modelo**, y si el modelo escribe otra cosa en su lugar, el borde la
sustituye. **Y dice la verdad:** la memoria de la conversación guarda qué se preguntó y qué opciones
se ofrecieron, así que el mensaje siguiente sí retoma donde se quedó, con sus tres llamadas nuevas.

Sale también cuando se agota el presupuesto de tiempo del mensaje. **Pero nunca después de una
llamada que escribe y no contestó:** ahí el borde relee el estado y contesta con lo que encuentre.
Si la cita quedó creada y ella lee «se me acabó el espacio», su siguiente «sí» acaba en dos citas.

Es un texto que casi no se va a leer. Ningún flujo gasta más de dos llamadas en un mismo mensaje;
para llegar a tres hace falta que el modelo se confunda, que es exactamente el caso que el tope
existe para cortar.

### La ráfaga de cinco mensajes — 1 llamada

```
>>  hola
>>  buenas
>>  oye
>>  una pregunta
>>  ¿qué tengo esta semana?
    [los cinco dentro de la ventana de agrupamiento]

<<  Hola Emilio. Sobre tu cita del martes 1 a las 4:00: te la puedo mover, cancelar o confirmar.
    ¿Cuál prefieres?
[mis_citas(sobre: "citas") · 1 de 3 · no muta · cierra]
```

**Un lote es una solicitud.** Así se escribe por WhatsApp y así se conversa para agendar. El
agrupamiento es de Kapso y ya está encendido: ventana de cinco segundos, lote de hasta cincuenta.
Con eso prendido, **todas las entregas llegan en formato de lote**, aunque venga un solo mensaje.
Suponer que llega un mensaje suelto es el error clásico, y el código tiene que leer el lote
siempre.

Y hay un segundo cuidado del mismo tamaño: **un candado por conversación**. Si llegan dos mensajes
del mismo teléfono al mismo tiempo, el segundo espera a que el primero termine. Sin él, «agéndame
el martes» escrito dos veces son dos citas.

**No hay ningún texto de «vas muy rápido», y es a propósito.** Un tope de tráfico por teléfono se
puede escribir el día que haya un número que defender: hoy los dos frenos que existen son el
agrupamiento y el candado, y los dos alcanzan. La fecha que hay que apuntar es el **1 de octubre de
2026**, cuando cada respuesta empieza a costar dinero; ése es el día de decidir el tope, no antes.

---

## 10. La cuenta de las llamadas

**Tres por mensaje**, y cada mensaje de ella trae tres nuevas. La cuenta arranca de cero en cada
mensaje y no se arrastra: una gestión se reparte entre varios mensajes, y esperar el siguiente no
cuesta nada. El tope **cuenta cada intento**, incluida la llamada que el borde rechaza por venir
malformada, que es justo el modo de fallo para el que el tope existe.

**Lo que cuenta no es cuánto cuesta la gestión, sino cuánto cuesta el mensaje más caro de esa
gestión.** Las dos más largas de este archivo son agendar y mover sin tiempo mínimo, con cuatro
llamadas cada una; las dos gastan **una por mensaje**, porque cada llamada contesta un dato que ella
acaba de dar. Fuera de la concatenación del párrafo de abajo, ningún mensaje de este archivo gasta
más de una.

**Lo único que alarga una gestión es probar filtros distintos**, y cada filtro es una llamada
aunque el servidor recorra treinta días por dentro. Pero cada filtro llega en su propio mensaje, así
que quien prueba seis días distintos gasta una llamada en cada uno de seis mensajes y ninguno se
acerca al tope.

**Ningún mensaje llega a tres.** El único caso de dos en un mismo mensaje es la concatenación
autorizada: la función devuelve una lista, ella ya había dicho cuál —«cancélame la del martes»—, y
el agente lee la lista, encuentra el número y vuelve a llamar sin mandar nada en medio. Dos
llamadas, un solo mensaje, un solo viaje ahorrado. **Si algún flujo llegara a necesitar más de
tres llamadas en un mismo mensaje, el defecto sería del flujo:** querría decir que una gestión pide
más viajes de los que caben en un mensaje, y lo que hay que hacer es partirla, no subir el tope.
