# 01 · Las conversaciones

Corte: 2026-08-28.

Éste es el archivo que se lee para saber **cómo se siente el producto**: el paso previo de las dos
profesionales, los nueve flujos y los bordes, mensaje por mensaje. Debajo de cada respuesta, una
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
arranca de cero en cada mensaje y no se arrastra al siguiente. Agendar cuesta cuatro llamadas
repartidas en cuatro mensajes, así que ninguna comparte mensaje con otra y el tope ni se acerca.
El tope existe para una sola cosa: que un modelo confundido no llame funciones en círculo.

Lo que se lleva de un mensaje al siguiente no son las palabras, es **la memoria de la
conversación**: qué se preguntó, qué función lo preguntó y qué opciones numeradas se ofrecieron.
Por eso un «la 2» aterriza siempre en la función correcta, y por eso no hay que acordarse de nada
para que el mensaje siguiente siga donde se quedó. El detalle está en `docs/07-portero.md`.

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
| Anticipación mínima para agendar | 48 horas | 48 horas |
| Cambio de modalidad | **ninguna dirección** | las dos, con 12 horas |
| Días que atiende | martes a viernes | martes a sábado |
| Horario | 9:00 a 2:00 y 3:00 a 6:00 | 9:00 a 2:00 y 3:00 a 6:00 |
| Dirección guardada | no | no |

Las pacientes del ejemplo también son inventadas: **Emilio** es de Lucía y **Ariadna** es de
Ramiro.

**En el ejemplo, hoy es jueves 27 de agosto.** Con 48 horas de anticipación y sin sábados,
domingos ni lunes, el primer día que Lucía puede recibir es el **martes 1 de septiembre**. Eso no
lo calcula el agente nunca (regla 1): le llega resuelto.

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
[reprogramar() · 1 de 3 · no muta]
```

**No cuesta ninguna llamada** porque ocurre antes de que haya intención: todavía no se sabe de qué
se va a hablar, así que ninguna de las once sería la función que llamar. La lista la escribe el
borde con lo que ya sabe del teléfono, la respuesta se guarda en la memoria de la conversación, y
**no se vuelve a preguntar**.

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
[ver_servicios(para: "agendar") · 1 de 3 · no muta]

>>  la 1, el miércoles por la tarde

<<  Para el miércoles 2 de septiembre, en línea, tengo estas horas:

    1. 3:00   2. 4:00   3. 5:00

    Dime cuál te acomoda.
[buscar_horarios(servicio: 1, dias: ["miércoles"], parte_del_dia: "tarde") · 1 de 3 · no muta]

>>  la 2

<<  ¿Aparto tu cita del miércoles 2 de septiembre a las 4:00, en línea?
[agendar(opcion: 2) · 1 de 3 · no muta]

>>  sí

<<  Listo, Ariadna. Aparté tu Psicoterapia individual del miércoles 2 de septiembre a las 4:00,
    en línea, con Ramiro. Las horas te las doy en horario de la Ciudad de México.
[agendar(opcion: 2, confirmado: true) · 1 de 3 · muta · aviso appointment_created_by_patient ·
 cierra]
```

**Ni una palabra de pago**, porque Ramiro cobra después (regla 6).

El segundo renglón del menú es un ejemplo puesto a propósito: se llama «Valoración sin costo» y
cuesta $800, para que se vea que **el precio sale del número, nunca del nombre**. Y no se pregunta
la modalidad porque ese servicio admite una sola.

**La zona horaria se dice una sola vez**, aquí, para que sepa en qué horario está viendo las horas.
No se repite en ningún otro mensaje.

### 1.2 Prepago, con los datos de transferencia llenos — 4 llamadas

```
>>  quiero agendar una cita

<<  Hola Emilio. Con gusto te agendo con Lucía. Sus servicios son:

    1. Psicoterapia individual · 50 minutos · $900
    2. Psicoterapia individual · 50 minutos · $800
    3. Psicoterapia de pareja · 90 minutos · $1,200
    4. Valoración inicial · 30 minutos · $0

    Dime cuál te interesa, qué días te quedan mejor y a qué hora.
[ver_servicios(para: "agendar") · 1 de 3 · no muta]

>>  la 2, en línea, el martes o el miércoles en la tarde

<<  El martes 1 y el miércoles 2 tengo estas horas:

    1. 3:00   2. 4:00   3. 5:00

    Dime la hora y en cuál de los dos días.
[buscar_horarios(servicio: 2, modalidad: "en_linea", dias: ["martes","miércoles"],
 parte_del_dia: "tarde") · 1 de 3 · no muta]

>>  la 2, el martes

<<  ¿Aparto tu cita del martes 1 de septiembre a las 4:00, en línea?
[agendar(opcion: 2) · 1 de 3 · no muta]

>>  sí

<<  Listo, Emilio. Aparté tu Psicoterapia individual del martes 1 de septiembre a las 4:00, en
    línea, con Lucía. Son $800, y las horas te las doy en horario de la Ciudad de México.

    Para confirmarla, transfiere a {banco}, a nombre de {titular}, CLABE {clabe}, y mándame el
    comprobante por aquí.
[agendar(opcion: 2, confirmado: true) · 1 de 3 · muta · aviso appointment_created_by_patient ·
 cierra]
```

Los tres huecos de la transferencia salen del perfil y no se copian aquí.

**El cierre no pone plazo al comprobante y no amenaza con cancelar.** Nada cancela citas solo: la
cita queda apartada, sin confirmar y con el comprobante pedido, y ahí se queda hasta que llegue.
La profesional ve en su app que se pidió y no ha llegado, y decide. El recordatorio sale por
plantilla desde el trabajo programado, no del agente.

**Dos días con las mismas horas se numeran una sola vez.** No se dice «te pongo las del martes»,
porque son las mismas horas de los dos días; lo que falta es que ella diga en cuál lo quiere. Y al
escoger la hora siempre se sabe el día: o lo dice aquí, o ya venía determinado porque lo dijo desde
el principio, y entonces no se le vuelve a preguntar.

Dos renglones del menú se llaman igual y cuestan distinto. Por eso cada uno lleva su precio y por
eso ella contesta un número: el emparejamiento lo hace el modelo, la numeración el servidor.

### 1.3 Prepago sin los datos de transferencia

Cambia sólo el segundo párrafo del cierre.

```
<<  Listo, Emilio. Aparté tu Psicoterapia individual del martes 1 de septiembre a las 4:00, en
    línea, con Lucía. Son $800, y las horas te las doy en horario de la Ciudad de México.

    Para confirmarla necesito tu comprobante. Pídele los datos para la transferencia y mándame el
    comprobante por aquí.
[agendar(opcion: 2, confirmado: true) · 1 de 3 · muta · cierra]
```

El nombre no se repite dentro del mismo texto: ella ya sabe quién es su profesional. Y el agente no
sabe cuál de las tres variantes de cierre existe: le llega escrita.

### 1.4 La hora se ocupó mientras conversaban

```
>>  sí

<<  Se acaba de ocupar esa hora. Ese mismo día tengo 3:00 y 5:00. ¿Te sirve alguna, o te busco
    otra fecha?
[agendar(opcion: 2, confirmado: true) · 1 de 3 · no muta · la conversación sigue abierta]
```

Entre la lista y la escritura pasan dos mensajes de ella, y el paso de confirmación agrega uno más:
en ese rato la profesional pudo apartar esa hora desde su app. Por eso **al apartar se vuelve a
validar que el hueco siga libre**.

**No cuesta una llamada extra:** la función volvió a buscar por dentro y ofreció las alternativas
del mismo día, renumeradas, en la misma respuesta. Y se dice siempre; callarlo dejaría a Emilio
creyendo que tiene cita.

### 1.5 Cuando el filtro no da nada: los cinco motivos

Cada uno cuesta **una llamada**, ninguno se contesta con «no hay nada» y **todos llevan
alternativas numeradas de verdad**: un motivo sin alternativas obliga a volver a preguntar y
cuesta otra llamada y otro mensaje.

**En ninguno se nombra a la profesional.** Escribir «Lucía necesita 48 horas, ya no alcanzo»
convierte un hueco de agenda en un reproche a quien la atiende. Se dice lo que hay y lo que sí se
puede.

**Es demasiado pronto.**

```
>>  ¿tienes mañana?

<<  Para el viernes 28 ya no alcanzo: se necesitan 48 horas de anticipación. Lo más cercano es el
    martes 1 de septiembre, y ahí tengo:

    1. 9:00   2. 10:00   3. 11:00   4. 12:00   5. 1:00

    ¿Te sirve alguno, o te busco otra fecha?
[buscar_horarios(fechas: [28]) · 1 de 3 · no muta]
```

De viernes salta a martes porque en el ejemplo no hay consultas sábados, domingos ni lunes. Ese
salto lo resuelve el servidor y el agente sólo lo lee.

**No hay consulta esos días.**

```
>>  ¿tienes sábado o domingo?

<<  Los sábados y los domingos no hay consultas. Los días más próximos que sí tengo son estos:

    1. Martes 1, 9:00
    2. Martes 1, 4:00
    3. Miércoles 2, 10:00
    4. Miércoles 2, 3:00
    5. Jueves 3, 12:00

    ¿Te sirve alguno, o te busco otra fecha?
[buscar_horarios(dias: ["sábado","domingo"]) · 1 de 3 · no muta]
```

**No hay consulta a esa hora.**

```
>>  el martes en la noche

<<  Por la noche no hay consultas. El horario es de 9:00 a 6:00, y para el martes 1 tengo:

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

<<  Para esos días ya no tengo espacio a esa hora. Esa misma hora la tengo el miércoles 2, y ese
    mismo día tengo otras horas:

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

<<  El 15 y el 16 no hay consultas. Lo más cercano es el 17, y ahí tengo:

    1. 9:00   2. 10:00   3. 12:00   4. 3:00   5. 5:00

    ¿Te sirve alguno, o te busco otra fecha?
[buscar_horarios(fechas: [15,16]) · 1 de 3 · no muta]
```

Las fechas viajan como el número del día, sin mes y sin año; el servidor las resuelve a su próxima
ocurrencia dentro de los treinta días.

### 1.6 Cuando no hay ni un horario abierto

```
>>  quiero una cita

<<  Ahorita Lucía no tiene horarios abiertos para las próximas semanas. Escríbele directamente
    para que te dé un espacio.
[ver_servicios(para: "agendar") · 1 de 3 · no muta · cierra]
```

Es el texto `sin_horarios` y **cuesta una sola llamada**: no tiene sentido enseñar precios de algo
que no se puede apartar. Sale también cuando la profesional tiene apagado el agendado por parte de
la paciente.

### 1.7 Un servicio que no tiene asignado

```
>>  quiero agendar una terapia de pareja

<<  Ese servicio no lo tienes asignado, así que desde aquí no te lo puedo agendar. Pídele a Lucía
    que te lo habilite y con gusto te lo agendo.
[ver_servicios(para: "agendar", pidio: "terapia de pareja") · 1 de 3 · no muta]
```

La lista que se le enseña es la que le toca: **sus servicios asignados si tiene alguno, y el
catálogo completo de su profesional si no tiene ninguno.** Este texto es para lo que quedó fuera de
esa lista, y no ofrece alternativas a propósito: cambiarle el servicio por otro parecido es decidir
por ella.

---

## 2. Mandar el comprobante

**Siempre se pregunta antes de guardar**, aunque haya un solo cobro esperando y aunque la
plantilla que ella contesta nombre la cita. La base admite un comprobante por cobro para siempre y
la app no ofrece manera de reemplazarlo: una foto equivocada queda pegada. Es la única excepción
del diseño a la regla de actuar cuando hay una sola candidata.

**Recibir comprobantes vale para todas las profesionales**, cobren antes o después de la sesión.
Quien cobra al cerrar también recibe transferencias por WhatsApp. Lo único que aplica sólo al cobro
por adelantado es **pedir el pago al agendar**.

### 2.1 Una sola pendiente — 2 llamadas, una por mensaje

```
>>  [manda una foto]

<<  ¿Es el comprobante de tu cita del martes 1 de septiembre?
[mandar_comprobante() · 1 de 3 · no muta]

>>  sí

<<  Listo, recibí tu comprobante. Tu cita del martes 1 de septiembre a las 4:00 ya quedó
    confirmada.
[mandar_comprobante(cita: 1) · 1 de 3 · muta · aviso payment_proof_received · cierra]
```

**El cobro se identifica por fecha.** La hora sólo se agrega cuando hay dos o más cobros del mismo
día, que es el único caso en que la fecha sola no alcanza.

**Nunca dice «pagado» ni «aprobado»** (regla 4): dice que lo recibió. El aviso que le llega a la
profesional **no lleva el monto**. Y el agente no mira la imagen: no valida que sea un comprobante,
valida que haya un cobro al cual pegarlo.

### 2.2 Varias pendientes — 2 llamadas

```
>>  [manda una foto] ya pagué

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

### 2.3 Ninguna pendiente — 1 llamada

```
>>  [manda una foto]

<<  No tengo ningún cobro tuyo esperando comprobante. Si es de algo que Lucía te pidió aparte,
    mándaselo directo.
[mandar_comprobante() · 1 de 3 · no muta · cierra]
```

Da igual qué traiga la foto: lo que decide la respuesta es si hay un cobro esperando.

### 2.4 Audio, video o sticker — 0 llamadas

Es `no_entendi` y lo contesta el prompt sin llamar a nada: el agente no oye audio ni ve video, así
que lo trata como lo que no logró leer y vuelve a ofrecer los verbos de esa profesional. **El
silencio es peor**, y era lo que hacía la versión anterior.

### 2.5 Y lo que no pasa

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

<<  Tu cita del martes 1 de septiembre a las 4:00 se confirma con tu comprobante. Transfiere a
    {banco}, a nombre de {titular}, CLABE {clabe}, y mándame la foto por aquí.
[confirmar() · 1 de 3 · no muta · cierra]
```

**Lo que confirma es el archivo, no la palabra.** La función no escribe nada y aun así contesta lo
único que sirve, sin gastar una llamada de más. Tampoco pone plazo, por lo mismo que el cierre de
agendar: no hay ningún reloj que cumplir.

Sin datos en el perfil, la frase termina en «Pídele a Lucía los datos para la transferencia y
mándame la foto por aquí».

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
de los avisos no se puede escribir, no se confirma ninguna.

El 1 sólo vale contra la última lista de esta función. No es un identificador: es una posición, y
un 1 de aquí no significa nada en otra función.

---

## 4. Reprogramar

**Se permite siempre, con tiempo o sin él.** El plazo no bloquea nada: sólo decide si hay cargo, y
lo único que cambia es lo que se advierte antes.

### 4.1 Con tiempo — 3 llamadas

```
>>  no voy a poder el miércoles

<<  Va, muevo tu cita del miércoles 2 de septiembre a las 4:00. ¿Qué días te quedan mejor y a
    qué hora?

    Tu cita nueva la puedes tomar presencial o en línea. ¿Cómo la prefieres?
[reprogramar() · 1 de 3 · no muta]

>>  el viernes en la mañana, en línea

<<  Para el viernes 4 de septiembre, en línea, tengo estas horas:

    1. 9:00   2. 10:00   3. 11:00   4. 12:00   5. 1:00

    Dime cuál te acomoda.
[buscar_horarios(dias: ["viernes"], parte_del_dia: "manana", modalidad: "en_linea",
 mover_cita: null) · 1 de 3 · no muta]

>>  la 2

<<  Listo, moví tu cita al viernes 4 de septiembre a las 10:00, en línea.
[reprogramar(opcion: 2) · 1 de 3 · muta · aviso appointment_rescheduled_by_patient · cierra]
```

**La modalidad sí se vuelve a preguntar**, cuando ese servicio admite las dos: mover la cita es
justo cuando cambia el motivo por el que iba a ir en persona. La pregunta va pegada a la del día,
en el mismo mensaje, para que no cueste un viaje aparte. **El servicio no se pregunta:** viene de
la cita que se mueve.

La búsqueda excluye esa cita, para que no se tape a sí misma los huecos vecinos. Con varias
candidatas sube a cuatro: la lista numerada primero, y ella escoge.

### 4.2 Sin tiempo mínimo — 3 llamadas

```
>>  se me atravesó algo, ¿puedo mover la de hoy?

<<  Perfecto, te ayudo a reprogramarla. Sólo te aviso antes: Ramiro pide 12 horas de aviso para
    cambios y ya faltan menos, así que se cobran las dos sesiones — la del jueves 27 y la nueva.

    ¿La movemos?
[reprogramar() · 1 de 3 · no muta]

>>  sí, muévela al sábado

<<  Para el sábado 29 de agosto, presencial, tengo estas horas:

    1. 10:00   2. 11:00   3. 12:00   4. 4:00   5. 5:00

    Dime cuál te acomoda.
[buscar_horarios(dias: ["sábado"]) · 1 de 3 · no muta]

>>  la 2

<<  Listo, moví tu cita al sábado 29 de agosto a las 11:00, presencial.
[reprogramar(opcion: 2, confirmado: true) · 1 de 3 · muta · cierra]
```

**Es un aviso, no una negativa:** diga lo que diga el reloj, si ella dice que sí, se mueve. Las 12
horas salen de la ficha de esa profesional; un número escrito a mano le mentiría a las pacientes de
quien pide otro, y en la dirección peligrosa (regla 2).

**El cierre no repite el aviso de cobro**, porque ya se dio antes de mover. Y el aviso sólo se da
cuando hay algo que cobrar: con una sesión de precio cero se mueve sin mencionar dinero. A ella no
se le dice que su profesional va a decidir (regla 5): se le dice lo que va a pasar. Qué pasa con
el dinero está en `docs/03-dinero.md`.

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
[pasar_pago() · 1 de 3 · muta · aviso appointment_cancelled_by_patient · cierra]
```

Es lo que casi siempre quiere quien falta a una sesión de una serie semanal, y no gasta un hueco de
la agenda. **La cita vieja queda cancelada, no reprogramada**, y la ocurrencia que ya existía no se
toca: es la única forma de que la serie no acabe con dos citas donde había una. La última frase
sólo va cuando esa cita traía pago.

La oferta deja la conversación abierta y sin dato que esperar, porque la respuesta puede ir a dos
sitios: seguir aquí buscando día, o pasar el pago.

### 4.4 Los dos rechazos, que llevan salida

Sin ninguna cita futura que mover: «No tengo ninguna cita tuya por mover. Si quieres agendar una,
dime qué días te quedan mejor». Y si pide mover una sesión de la serie que no es la más próxima, se
le dice que por aquí se mueve la más próxima y que las demás las ajusta su profesional desde su
app. Ninguno de los dos es un error, y los dos ofrecen algo.

---

## 5. Cancelar

**Se permite siempre**, con dinero adentro o sin él, con tiempo o sin él. Lo único que cambia es
qué se le ofrece antes y qué pasa con el cobro después.

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
nadie.

### 5.3 Con dinero adentro: dos salidas primero — 3 llamadas

«Dinero adentro» tiene una definición exacta y una sola: el cobro está acreditado, o hay un
comprobante pegado. Una petición sellada sin archivo **no** es dinero adentro (regla 10).

**La cita sí se cancela.** Lo que hace el agente antes es ofrecer las salidas que quizá le convienen
más, **una vez y sólo una**.

```
>>  necesito cancelar la del martes

<<  Ya mandaste tu comprobante de esa cita. Antes de cancelarla: puedo reprogramarla, o cancelar
    ésta y dejar el pago en la próxima, la del martes 8. ¿Cuál prefieres, o te la cancelo?
[cancelar() · 1 de 3 · no muta · la conversación sigue abierta]

>>  va, muévela al miércoles en la tarde

<<  Para el miércoles 2 de septiembre, en línea, tengo estas horas:

    1. 3:00   2. 4:00   3. 5:00

    Dime cuál te acomoda.
[buscar_horarios(dias: ["miércoles"], parte_del_dia: "tarde") · 1 de 3 · no muta]

>>  la 1

<<  Listo, moví tu cita al miércoles 2 de septiembre a las 3:00, en línea.
[reprogramar(opcion: 1) · 1 de 3 · muta · cierra]
```

Cuando no hay una próxima del mismo servicio, la salida es una sola y el texto lo dice así: «Esa
cita ya está pagada. Antes de cancelarla: puedo reprogramarla y tu pago se va con ella. ¿Te busco
día, o te la cancelo?».

**La primera línea cambia sola según el estado** —«ya está pagada» o «ya mandaste tu
comprobante»— y el agente no escoge cuál. La conversación se queda abierta a propósito, porque la
cuenta de si ya se ofrecieron las salidas la lleva el servidor.

### 5.4 Y si dice que no a las dos, se cancela — 2 llamadas

```
>>  no, cancélala de todos modos

<<  Listo, cancelé tu cita del martes 1 de septiembre a las 4:00. Tu pago queda registrado y
    Lucía lo resuelve contigo.
[cancelar() · 1 de 3 · muta · aviso appointment_cancelled_by_patient · cierra]
```

**El agente no insiste una segunda vez:** ella ya escuchó las dos salidas y las rechazó. La cita
queda cancelada sin tiempo mínimo y **el estado del pago se conserva tal cual**, para que su
profesional decida si lo cobra o lo condona.

A la paciente no se le pide que adivine cuál de las dos: se le dice lo único que necesita saber,
que su dinero no se perdió y con quién se ve. Negarse aquí dejaba el peor camino de todos —ella
avisó, nadie registró nada, y la cita seguía en pie—, y encima le hacía creer que su dinero
dependía de insistir.

---

## 6. Cambiar de modalidad

**Es el único cambio que el plazo sigue bloqueando**, y es a propósito: la profesional necesita
saber con tiempo si tiene que ir al consultorio. Cancelar y mover se permiten siempre porque el
hueco se libera de todos modos; cambiar la modalidad a última hora la manda a un consultorio vacío
o la deja sin él.

Es una decisión **por dirección**, y la dirección la determina la modalidad que la cita tiene hoy:
una presencial sólo puede ir a en línea. No hay versión tardía con cargo: o alcanza el tiempo, o
no se cambia.

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

**Sólo se listan las citas que de verdad pueden cambiar:** su servicio admite las dos modalidades,
la profesional permite esa dirección, alcanza la anticipación, y sigue viva y en el futuro. El
agente nunca intenta algo que no se puede; no llega a saber que existía. Con varias, la lista va
con la modalidad actual de cada una y la gestión sube a tres.

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

Son las dos únicas negativas por plazo que quedan en todo el sistema. Las dos nombran la dirección,
no la modalidad deseada, y las dos dicen cómo queda la cita para que no quede duda de si algo
cambió. Y ninguna repite el nombre de la profesional dos veces.

Para una profesional que no permite ningún cambio de modalidad, el verbo no se menciona en el menú
(regla 8), así que esta intención casi nunca llega.

---

## 7. Pasar el pago — 1 llamada, encadenada

Sale casi siempre de la salida que ofrecieron `cancelar` o `reprogramar`.

```
>>  quiero cancelar la del martes

<<  Ya mandaste tu comprobante de esa cita. Antes de cancelarla: puedo reprogramarla, o cancelar
    ésta y dejar el pago en la próxima, la del martes 8. ¿Cuál prefieres, o te la cancelo?
[cancelar() · 1 de 3 · no muta · la conversación sigue abierta]

>>  déjalo en la del 8

<<  Listo, pasé tu comprobante a tu sesión del martes 8 de septiembre a las 4:00, y cancelé la
    del martes 1.
[pasar_pago() · 1 de 3 · muta · aviso appointment_cancelled_by_patient · cierra]
```

**El destino no se señala.** Lo resuelve el servidor: misma paciente, mismo servicio, programada,
la primera posterior. Como el modelo no elige, no se puede equivocar de cita.

Si el pago estuviera acreditado, la frase sería «tu pago quedó acreditado en tu sesión del martes
8». **Cuál de las dos sale lo dice el resultado, no lo que el modelo crea que pasó**, y ninguna
dice «pagado» ni «aprobado». Las dos nombran la cancelación de la cita vieja, porque eso es lo que
de verdad le pasa y callarlo la dejaría creyendo que sigue en pie.

**Lo único que se revisa es que la cita destino no traiga ya dinero suyo.**

```
>>  pásalo a la siguiente

<<  Tu sesión del martes 8 ya tiene su propio pago, así que no le puedo encimar éste. Lucía lo
    acomoda contigo. Si prefieres, te muevo la del martes 1 a otro día y tu pago se va con ella.
[pasar_pago() · 1 de 3 · no muta · la conversación sigue abierta]
```

Sobrescribir un pago que ya estaba ahí borra un dato que nadie puede reconstruir. **Que los
importes no coincidan no detiene nada**: se pasa igual y la profesional ajusta desde su app, que es
donde se ajustan los importes. El plazo tampoco detiene nada.

Si no hubiera una próxima del mismo servicio, se dice y se ofrece mover, y la conversación no
cierra: es un rechazo con salida.

---

## 8. Dejar reseña — 1 llamada

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
[cero llamadas · lo contesta el prompt]

>>  así déjala

<<  Listo, te agradecemos mucho que compartieras esto. Tu nombre queda anónimo…
[dejar_resena(estrellas: 5) · 1 de 3 · muta · cierra]
```

Se pregunta una vez y no se insiste. Si llega sólo el comentario, se pide la calificación
—«Gracias por escribirlo. ¿Cuántas estrellas le pones, del 1 al 5?»—; **sin calificación no se
llama a nada**.

---

## 9. Consultar — 1 llamada

`mis_citas` cubre las tres preguntas de la misma familia: **qué citas tengo, dónde es, y cuánto
debo.** No hay función de dirección aparte ni de adeudos: son la misma consulta con distinto
énfasis, y partirla en tres obligaría al modelo a elegir entre tres puertas que llevan al mismo
cuarto.

### 9.1 Qué tengo

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

### 9.2 Dónde es

```
>>  ¿dónde es la cita?

<<  La dirección te la comparte Lucía directamente.
[mis_citas(sobre: "donde") · 1 de 3 · no muta · cierra]
```

**No se inventa una dirección.** Cuando el dato existe, la misma frase lo lleva adentro: «Tu cita
del miércoles 2 a las 4:00 es presencial. La dirección es …».

Y si es en línea: «Tu cita del miércoles 2 a las 4:00 es en línea. La liga te llega una hora
antes». **La liga no se manda aquí.** Sale una sola vez, en el aviso de una hora antes, para que la
tenga a la mano cuando la necesita y no la busque tres días atrás en la conversación.

### 9.3 Cuánto debo

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

### 9.4 Cuánto cuesta

```
>>  ¿cuánto cuesta una sesión?

<<  Hola Emilio. Con Lucía los precios son estos:

    1. Psicoterapia individual · 50 minutos · $900
    2. Psicoterapia individual · 50 minutos · $800
    3. Psicoterapia de pareja · 90 minutos · $1,200
    4. Valoración inicial · 30 minutos · $0

    ¿Te agendo alguna?
[ver_servicios(para: "precio") · 1 de 3 · no muta]
```

Mismos datos que al agendar, otra pregunta de cierre. El precio que se dice es **el de esa
paciente**: si tiene uno preferente, ése, y la palabra «preferente» no sale nunca al mensaje.

Cuando tiene una serie viva, el aviso va antes que nada: «Ya tienes Psicoterapia individual cada
semana, los martes a las 4:00, y tu próxima es el martes 8 de septiembre a las 4:00. ¿Quieres
agendar otra sesión aparte de ésa?».

---

## 10. Los bordes

**Seis de los diez textos de borde cuestan cero llamadas**: viven literales en el prompt y se
rellenan con lo que la admisión ya resolvió, así que ni un tope de tráfico ni una caída del
servidor pueden dejarlos sin respuesta. Un séptimo, `vas_muy_rapido`, ni siquiera pasa por el
agente: lo manda el borde de entrada. Los otros tres cuestan una, la que ya se hizo: teléfono
desconocido, cuenta dada de baja y el `sin_horarios` del §1.6.

### Teléfono desconocido — 1 llamada

```
>>  hola, quiero agendar una cita con un psicólogo

<<  Hola. Este número es el asistente de Agenda Psi, y desde aquí sólo puedo ayudar a pacientes
    que ya están con un psicólogo o psicóloga de la plataforma.

    Si estás buscando uno, aquí puedes ver quiénes están disponibles: https://agendapsi.mx
[ver_servicios(para: "agendar") · 1 de 3 · no muta · cierra]
```

Cuesta una llamada: **la que ya se hizo**. Cualquiera de las once devuelve este texto en vez de su
carga normal, porque las once vuelven a comprobar quién escribe por su cuenta. El directorio se
ofrece aquí y sólo aquí: quien nunca fue paciente necesita encontrar a alguien.

### La cuenta dada de baja — 1 llamada

```
>>  quiero agendar

<<  Por ahora tu cuenta con Ramiro no aparece activa, así que desde aquí no puedo ayudarte con
    tus citas. Escríbele para que te reactive y seguimos por aquí.
[mis_citas(sobre: "citas") · 1 de 3 · no muta · cierra]
```

El corte es limpio: **nunca fue paciente → directorio; fue y ya no → que la reactiven.** Y esto
cierra el hueco más grave que había: una cuenta dada de baja no recibía absolutamente nada.

### Crisis — 0 llamadas

```
>>  ya no quiero seguir aquí, no le veo sentido a nada

<<  Si necesitas ayuda inmediata: Agenda Psi no es un servicio de emergencias. Si tú o alguien
    más se encuentra en peligro, llama al 911. Para recibir apoyo en salud mental, comunícate
    gratis, las 24 horas, a Línea de la Vida: 800 911 2000.
[cero llamadas · el texto vive literal en el prompt · cierra]
```

**Va sola y primero.** No se mezcla con la gestión y no lleva pregunta de cierre: si el mensaje
trae además «cancélame la del jueves», la cancelación no se hace y no se menciona. No tiene ni un
hueco a propósito, así no depende de nada: ni de la red, ni del tope de llamadas.

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
arranque normal y lo contesta `mis_citas`. Esto es para lo genuinamente ininteligible, y para el
audio, el video y el sticker del §2.4.

### Se acabó el espacio — 0 llamadas

```
>>  ¿y el viernes 11?

<<  Se me acabó el espacio de esta consulta. Escríbeme otra vez y seguimos justo desde donde nos
    quedamos.
[cero llamadas · tres de tres gastadas en este mensaje · cierra]
```

Vive en el prompt y no en una función porque cuando hace falta ya no queda ninguna llamada: una
herramienta que sólo se puede usar cuando no se puede usar ninguna es una herramienta rota. **Y
dice la verdad:** la memoria de la conversación guarda qué se preguntó y qué opciones se
ofrecieron, así que el mensaje siguiente sí retoma donde se quedó, con sus tres llamadas nuevas.

Es un texto que casi no se va a leer. Ningún flujo gasta más de dos llamadas en un mismo mensaje;
para llegar a tres hace falta que el modelo se confunda, que es exactamente el caso que el tope
existe para cortar.

### Vas muy rápido — 0 llamadas

```
>>  [nueve mensajes en veinte segundos]

<<  Recibí varios mensajes seguidos y necesito un momento para ponerme al día. Espérame un minuto
    y escríbeme otra vez, por favor.
[cero llamadas · lo manda el borde de entrada, antes de que el agente arranque]
```

Como mucho **uno cada quince minutos por teléfono**. No dice «límite» ni «bloqueo», dice la única
acción que sirve. Hoy este envío no existe, y por eso está en lo que hay que construir.

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

---

## 11. La cuenta de las llamadas

**Tres por mensaje**, y cada mensaje de ella trae tres nuevas. La cuenta arranca de cero en cada
mensaje y no se arrastra: una gestión se reparte entre varios mensajes, y esperar el siguiente no
cuesta nada.

| Flujo | La gestión entera | Lo más que gasta un mensaje |
|---|---:|---:|
| 0 · Con cuál profesional | **0** | 0 |
| 1 · Agendar | **4** | 1 |
| 2 · Mandar comprobante | **2** | 1 |
| 3 · Confirmar | **1** | 1 · con varias esperando, 2 en la gestión |
| 4 · Reprogramar | **3** | 2 · si ya dijo cuál cita |
| 5 · Cancelar | **1** | 2 · si ya dijo cuál cita; tarde, 2 en la gestión; con dinero adentro, 3 |
| 6 · Cambiar de modalidad | **2** | 2 · si ya dijo cuál cita |
| 7 · Pasar el pago | **1** | 1 |
| 8 · Dejar reseña | **1** | 1 |
| 9 · Consultar | **1** | 1 |

Y los bordes: crisis, hablar con una persona, devoluciones y descuentos, no te entendí, con cuál
profesional, vas muy rápido y se acabó el espacio cuestan **cero**. Teléfono desconocido y cuenta
dada de baja cuestan **una**, la que ya se hizo.

**Lo único que alarga una gestión es probar filtros distintos**, y cada filtro es una llamada
aunque el servidor recorra treinta días por dentro. Pero cada filtro llega en su propio mensaje, así
que quien prueba seis días distintos gasta una llamada en cada uno de seis mensajes y ninguno se
acerca al tope.

**Ningún mensaje llega a tres.** El único caso de dos en un mismo mensaje es la concatenación
autorizada: la función devuelve una lista, ella ya había dicho cuál —«cancélame la del martes»—, y
el agente lee la lista, encuentra el número y vuelve a llamar sin mandar nada en medio. Dos
llamadas, un solo mensaje, un solo viaje ahorrado.
