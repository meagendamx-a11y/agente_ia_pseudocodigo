# 01 · Las conversaciones

Corte: 2026-08-27.

Éste es el archivo que se lee para saber **cómo se siente el producto**: los nueve flujos y los
bordes, mensaje por mensaje. Debajo de cada respuesta, una línea dice qué función se llamó y
cuántas llamadas van de las doce.

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
[qué función se llamó · cuántas llamadas van · si muta · si el turno cierra]
```

El contador es por gestión y se reinicia cuando el turno cierra. **Dormirse entre mensaje y
mensaje no cuesta**, así que una gestión de cuatro mensajes puede costar tres llamadas. El cierre
del turno vive fuera del presupuesto. Y en cuanto algo se escribe, el turno cierra: una mutación
por turno (regla 14).

### El reparto

Las profesionales son reales y sus plazos, precios, horarios y políticas se leyeron de la base el
2026-08-27. Las citas de cada ejemplo están puestas para que se vea la rama.

| | Araceli | Miranda |
|---|---|---|
| Cobro | **por adelantado** | después |
| Datos de transferencia en el perfil | **sí** | no |
| Aviso de cambio | **24 horas** | **12 horas** |
| Anticipación mínima para agendar | 48 horas | 48 horas |
| Cambio de modalidad | **ninguna dirección** | las dos, con 12 horas |
| Días que atiende | martes a viernes | martes a sábado |
| Horario | 9:00 a 2:00 y 3:00 a 6:00 | 9:00 a 2:00 y 3:00 a 6:00 |
| Dirección guardada | no | no |
| Liga de videollamada | no | sí |

Emilio es de Araceli y existe en la base: hoy debe un comprobante, el de la sesión del **jueves 20
de agosto, $800**, a la que no asistió. Ariadna es de Miranda y es el nombre del ensayo, porque la
única paciente que Miranda tiene en la base es una fila de prueba.

**Hoy es jueves 27 de agosto.** Con 48 horas de anticipación y sin sábados, domingos ni lunes, el
primer día que Araceli puede recibir es el **martes 1 de septiembre**. Eso no lo calcula el agente
nunca (regla 1): le llega resuelto.

---

## 1. Agendar

### 1.1 Cobra después — 3 llamadas

```
>>  hola, quiero agendar una cita

<<  Hola Ariadna. Con gusto te agendo con Miranda. Esto es lo que maneja:

    1. Psicoterapia individual · 50 minutos · $900
    2. Valoracion Sin Costo · 50 minutos · $800

    Dime cuál te interesa, qué días te quedan mejor y a qué hora.
[ver_servicios(para: "agendar") · 1 de 12 · no muta]

>>  la 1, el miércoles por la tarde

<<  Para el miércoles 2 de septiembre, en línea, tengo estas horas:

    1. 3:00   2. 4:00   3. 5:00

    Dime el número y te la aparto.
[buscar_horarios(servicio: 1, dias: ["miércoles"], parte_del_dia: "tarde") · 2 de 12 · no muta]

>>  la 2

<<  Listo, Ariadna. Aparté tu Psicoterapia individual del miércoles 2 de septiembre a las 4:00,
    en línea, con Miranda.
[agendar(opcion: 2) · 3 de 12 · muta · aviso appointment_created_by_patient · turno cerrado]
```

**Ni una palabra de pago**, porque Miranda cobra después (regla 6). Escoger la hora es agendar: no
hay un segundo mensaje para preguntarle si está de acuerdo con lo que acaba de escoger.

El segundo renglón se llama «Valoracion Sin Costo» y cuesta $800: **el precio sale del número,
nunca del nombre**. Y no se pregunta la modalidad porque ese servicio de Miranda es sólo en línea.

### 1.2 Prepago, con los datos de transferencia llenos — 3 llamadas

```
>>  quiero agendar una cita

<<  Hola Emilio. Con gusto te agendo con Araceli. Esto es lo que maneja:

    1. Psicoterapia individual · 50 minutos · $900
    2. Psicoterapia individual · 50 minutos · $800
    3. Psicoterapia Pareja · 90 minutos · $1,200
    4. Valoracion Sin Costo · 30 minutos · $0

    Dime cuál te interesa, qué días te quedan mejor y a qué hora.
[ver_servicios(para: "agendar") · 1 de 12 · no muta]

>>  la 2, en línea, el martes o el miércoles en la tarde

<<  El martes 1 y el miércoles 2 tengo las mismas horas. Te pongo las del martes 1:

    1. 3:00   2. 4:00   3. 5:00

    Si prefieres el miércoles 2, dímelo y te las aparto ahí.
[buscar_horarios(servicio: 2, modalidad: "en_linea", dias: ["martes","miércoles"],
 parte_del_dia: "tarde") · 2 de 12 · no muta]

>>  la 2

<<  Listo, Emilio. Aparté tu Psicoterapia individual del martes 1 de septiembre a las 4:00, en
    línea, con Araceli. Son $800.

    Para confirmarla, transfiere a {banco}, a nombre de {titular}, CLABE {clabe}, y mándame el
    comprobante por aquí. Si no llega en 24 horas, la cita se cancela y se libera el horario.
[agendar(opcion: 2) · 3 de 12 · muta · aviso appointment_created_by_patient · turno cerrado]
```

Los tres huecos de la transferencia salen del perfil y no se copian aquí. **Araceli los tiene
llenos, así que ésta es la variante que ya se usa hoy.** Las 24 horas van escritas porque son el
reloj del prepago, valor fijo del producto y única excepción a la regla 2.

Dos renglones del menú se llaman igual y cuestan distinto. Por eso cada uno lleva su precio y por
eso ella contesta un número: el emparejamiento lo hace el modelo, la numeración el servidor.

### 1.3 Prepago sin los datos de transferencia

Cambia sólo el segundo párrafo del cierre. **Hoy no le toca a nadie:** la única profesional que
cobra por adelantado llenó sus datos. Queda escrita para la siguiente que cobre antes.

```
<<  Para confirmarla necesito tu comprobante de pago. Pídele a Araceli los datos para la
    transferencia y mándame el comprobante por aquí. Si no llega en 24 horas, la cita se cancela.
[agendar(opcion: 2) · 3 de 12 · muta · turno cerrado]
```

El agente no sabe cuál de las tres variantes existe: le llega escrita.

### 1.4 La hora se ocupó mientras conversaban

```
>>  la 2

<<  Se acaba de ocupar esa hora. Ese mismo día tengo 3:00 y 5:00. ¿Cuál tomo?
[agendar(opcion: 2) · 3 de 12 · no muta · el turno sigue abierto]
```

**No cuesta una llamada extra:** la función volvió a buscar por dentro y ofreció las alternativas
del mismo día, renumeradas, en la misma respuesta. Y se dice siempre; callarlo dejaría a Emilio
creyendo que tiene cita.

### 1.5 Cuando el filtro no da nada: los cinco motivos

Cada uno cuesta **una llamada**, ninguno se contesta con «no hay nada» y **todos llevan
alternativas numeradas de verdad**: un motivo sin alternativas obliga a volver a preguntar y
cuesta otra llamada y otro mensaje.

**Es demasiado pronto.**

```
>>  ¿tienes mañana?

<<  Para el viernes 28 ya no alcanzo: Araceli necesita 48 horas de anticipación. Lo más cercano
    es el martes 1 de septiembre, y tengo:

    1. 9:00   2. 10:00   3. 11:00   4. 12:00   5. 1:00

    ¿Cuál tomo?
[buscar_horarios(fechas: [28]) · 2 de 12 · no muta]
```

De viernes salta a martes porque Araceli no atiende sábados, domingos ni lunes. Ese salto lo
resuelve el servidor y el agente sólo lo lee.

**No trabaja esos días.**

```
>>  ¿tienes sábado o domingo?

<<  Araceli no atiende sábados ni domingos. Los días más próximos que sí tengo son estos:

    1. Martes 1, 9:00
    2. Martes 1, 4:00
    3. Miércoles 2, 10:00
    4. Miércoles 2, 3:00
    5. Jueves 3, 12:00

    ¿Cuál tomo?
[buscar_horarios(dias: ["sábado","domingo"]) · 2 de 12 · no muta]
```

**No trabaja a esa hora.**

```
>>  el martes en la noche

<<  Araceli no da consultas por la noche. Sus horarios son de 9:00 a 6:00, y para el martes 1
    tengo:

    1. 12:00   2. 1:00   3. 3:00   4. 4:00   5. 5:00

    ¿Te acomoda alguna?
[buscar_horarios(dias: ["martes"], parte_del_dia: "noche") · 2 de 12 · no muta]
```

Quien convierte «en la noche» en un par de horas es el servidor, con el horario de esa
profesional. El modelo nunca mapea una franja a un rango: la tarde de quien atiende de 3:00 a 6:00
no es la de nadie más.

**Sí trabaja, pero está llena.**

```
>>  el martes al mediodía

<<  Los martes a esa hora ya se le llenaron. Esa misma hora sí la tengo el miércoles 2 y el
    jueves 3:

    1. Miércoles 2, 12:00
    2. Jueves 3, 12:00

    ¿Cuál tomo?
[buscar_horarios(dias: ["martes"], parte_del_dia: "mediodia") · 2 de 12 · no muta]
```

**Esos días concretos no va a estar.**

```
>>  ¿el 15 o el 16?

<<  El 15 y el 16 Araceli no va a estar. Lo más cercano es el 17, y ahí tengo:

    1. 9:00   2. 10:00   3. 12:00   4. 3:00   5. 5:00

    ¿Cuál tomo?
[buscar_horarios(fechas: [15,16]) · 2 de 12 · no muta]
```

Las fechas viajan como el número del día, sin mes y sin año; el servidor las resuelve a su próxima
ocurrencia dentro de los treinta días.

### 1.6 Cuando no hay ni un horario abierto

```
>>  quiero una cita

<<  Ahorita Araceli no tiene horarios abiertos para las próximas semanas. Lo mejor es que le
    escribas directamente para que te dé un espacio.
[ver_servicios(para: "agendar") · 1 de 12 · no muta · la gestión sigue abierta]
```

Es el texto `sin_horarios` y **cuesta una sola llamada**: no tiene sentido enseñar precios de algo
que no se puede apartar. Sale también cuando la profesional tiene apagado el agendado por parte de
la paciente, que hoy es el caso de una de las seis.

---

## 2. Mandar el comprobante

**Siempre se pregunta antes de guardar**, aunque haya un solo cobro esperando y aunque la
plantilla que ella contesta nombre la cita. La base admite un comprobante por cobro para siempre y
la app no ofrece manera de reemplazarlo: una foto equivocada queda pegada. Es la única excepción
del diseño a la regla de actuar cuando hay una sola candidata.

### 2.1 Una sola pendiente — 2 llamadas

```
>>  [manda una foto]

<<  ¿Es el comprobante de tu cita del martes 1 de septiembre a las 4:00?
[mandar_comprobante() · 1 de 12 · no muta]

>>  sí

<<  Listo, recibí tu comprobante. Tu cita del martes 1 de septiembre a las 4:00 ya quedó
    confirmada.
[mandar_comprobante(cita: 1) · 2 de 12 · muta · aviso payment_proof_received · turno cerrado]
```

**Nunca dice «pagado» ni «aprobado»** (regla 4): dice que lo recibió. El aviso que le llega a
Araceli **no lleva el monto**. Y el agente no mira la imagen: no valida que sea un comprobante,
valida que haya un cobro al cual pegarlo.

### 2.2 Varias pendientes — 2 llamadas

```
>>  [manda una foto] ya pagué

<<  ¿De cuál de estas es tu comprobante?

    1. Jueves 20 de agosto, 5:00 — $800
    2. Martes 1 de septiembre, 4:00 — $800
[mandar_comprobante() · 1 de 12 · no muta]

>>  la 1

<<  Listo, recibí tu comprobante de tu sesión del jueves 20 de agosto. Ya se lo hice llegar a
    Araceli.
[mandar_comprobante(cita: 1) · 2 de 12 · muta · aviso payment_proof_received · turno cerrado]
```

La lista va con fecha y monto, la más antigua primero. **Las sesiones pasadas no se colapsan:**
cada una es su propia deuda, y juntarlas escondería dinero sin dueño. El acuse de una sesión que
ya pasó es otro, porque no confirma nada.

Hoy nadie debe dos a la vez —son tres cobros esperando, repartidos entre tres personas—, así que
este caso está armado sobre la deuda real de Emilio.

### 2.3 Ninguna pendiente — 1 llamada

```
>>  [manda una foto]

<<  No tengo ningún cobro tuyo esperando comprobante. Si es de algo que Araceli te pidió aparte,
    mándaselo directo.
[mandar_comprobante() · 1 de 12 · no muta · turno cerrado]
```

Da igual qué traiga la foto: lo que decide la respuesta es si hay un cobro esperando.

### 2.4 Audio, video o sticker — 0 llamadas

Es `no_entendi` y lo contesta el prompt sin llamar a nada: el agente no oye audio ni ve video, así
que lo trata como lo que no logró leer y vuelve a ofrecer los verbos de esa profesional. **El
silencio es peor**, y era lo que hacía la versión anterior.

---

## 3. Confirmar

### 3.1 Cobra después — 1 llamada

```
>>  sí voy

<<  Listo, tu cita del miércoles 2 de septiembre a las 4:00 quedó confirmada.
[confirmar() · 1 de 12 · muta · aviso appointment_confirmed · turno cerrado]
```

Es la gestión más barata del catálogo. Casi siempre llega contestando a la plantilla de
confirmación, y esa pista viaja ya redactada en el sobre del turno, sin costar ninguna llamada.

### 3.2 Prepago: decir «sí voy» no confirma — 1 llamada

```
>>  ahí estaré

<<  Tu cita del martes 1 de septiembre a las 4:00 se confirma con tu comprobante. Transfiere a
    {banco}, a nombre de {titular}, CLABE {clabe}, y mándame la foto por aquí.
[confirmar() · 1 de 12 · no muta · turno cerrado]
```

**Lo que confirma es el archivo, no la palabra.** La función no escribe nada y aun así contesta lo
único que sirve, sin gastar una llamada de más. No repite el reloj de 24 horas: arrancó al agendar
y la plantilla que ella contesta ya se lo dijo.

Sin datos en el perfil, la frase termina en «Pídele a Araceli los datos para la transferencia y
mándame la foto por aquí».

### 3.3 Con varias esperando — 2 llamadas

```
>>  sí voy

<<  ¿Cuál me confirmas?

    1. Miércoles 2, 4:00
    2. Viernes 4, 10:00
[confirmar() · 1 de 12 · no muta]

>>  la 1

<<  Listo, tu cita del miércoles 2 de septiembre a las 4:00 quedó confirmada.
[confirmar(cita: 1) · 2 de 12 · muta · turno cerrado]
```

El 1 sólo vale contra la última lista de esta función en este turno. No es un identificador: es
una posición, y un 1 de aquí no significa nada en otra función.

---

## 4. Reprogramar

**Se permite siempre, con tiempo o sin él.** Lo único que cambia es lo que se advierte antes.

### 4.1 Con tiempo — 3 llamadas

```
>>  no voy a poder el miércoles

<<  Va, muevo tu cita del miércoles 2 de septiembre a las 4:00. ¿Qué días te quedan mejor y a
    qué hora?
[reprogramar() · 1 de 12 · no muta]

>>  el viernes en la mañana

<<  Para el viernes 4 de septiembre, en línea, tengo estas horas:

    1. 9:00   2. 10:00   3. 11:00   4. 12:00   5. 1:00

    Dime el número y te la aparto.
[buscar_horarios(dias: ["viernes"], parte_del_dia: "manana") · 2 de 12 · no muta]

>>  la 2

<<  Listo, moví tu cita al viernes 4 de septiembre a las 10:00, en línea.
[reprogramar(opcion: 2) · 3 de 12 · muta · aviso appointment_rescheduled_by_patient ·
 turno cerrado]
```

**No se pregunta servicio ni modalidad:** vienen de la cita que se mueve. Y la búsqueda excluye esa
cita, para que no se tape a sí misma los huecos vecinos. Con varias candidatas sube a cuatro: la
lista numerada primero, y ella escoge.

### 4.2 Sin tiempo mínimo — 3 llamadas

```
>>  se me atravesó algo, ¿puedo mover la de hoy?

<<  Perfecto, te ayudo a reprogramarla. Sólo te aviso antes: Miranda pide 12 horas de aviso para
    cambios y ya faltan menos, así que se cobran las dos sesiones — la del jueves 27 y la nueva.

    ¿La movemos?
[reprogramar() · 1 de 12 · no muta]

>>  sí, muévela al sábado

<<  Para el sábado 29 de agosto, presencial, tengo estas horas:

    1. 10:00   2. 11:00   3. 12:00   4. 4:00   5. 5:00

    Dime el número y te la aparto.
[buscar_horarios(dias: ["sábado"]) · 2 de 12 · no muta]

>>  la 2

<<  Listo, moví tu cita al sábado 29 de agosto a las 11:00, presencial.
[reprogramar(opcion: 2, confirmado: true) · 3 de 12 · muta · turno cerrado]
```

Las **12 horas** salen de la ficha de Miranda. Con Araceli la misma frase diría 24, y un número
escrito a mano le mentiría a la mitad de las pacientes en la dirección peligrosa (regla 2).

**El cierre no repite el aviso de cobro**, porque ya se dio antes de mover. Y el aviso sólo se da
cuando hay algo que cobrar: con una sesión de precio cero se mueve sin mencionar dinero. A ella no
se le dice que su profesional va a decidir (regla 5): se le dice lo que va a pasar. Qué pasa con
el dinero está en `docs/03-dinero.md`.

---

## 5. Cancelar

### 5.1 A tiempo y sin dinero adentro — 1 llamada

```
>>  quiero cancelar mi cita del sábado

<<  Listo, cancelé tu cita del sábado 29 de agosto a las 11:00. No te queda ningún cobro
    pendiente por ella.
[cancelar() · 1 de 12 · muta · aviso appointment_cancelled_by_patient · turno cerrado]
```

**No se pregunta «¿de verdad?».** Preguntar dos veces cuando no hay ninguna consecuencia es un
mensaje de más. Y si no tuviera nada que cancelar, la respuesta seguiría teniendo una salida —«Si
quieres agendar una, dime qué días te quedan mejor»—, nunca un error.

### 5.2 Tarde — 2 llamadas

```
>>  no voy a poder llegar hoy

<<  Te la cancelo, pero antes te aviso: Miranda pide 12 horas de aviso y ya faltan menos, así que
    la sesión se te cobra. ¿La cancelo de todos modos?
[cancelar() · 1 de 12 · no muta]

>>  sí, cancélala

<<  Listo, cancelé tu cita del jueves 27 de agosto a las 5:00.
[cancelar(confirmado: true) · 2 de 12 · muta · turno cerrado]
```

**Cancelar tarde sí se puede.** Rechazarlo deja el peor camino: ella avisó que no podía ir, nadie
registró nada, la cita sigue en pie, y Miranda se entera el día de la sesión cuando no llega nadie.

### 5.3 Con dinero adentro — 1 llamada, y 3 si acepta moverla

«Dinero adentro» tiene una definición exacta y una sola: el cobro está acreditado, o hay un
comprobante pegado. Una petición sellada sin archivo **no** es dinero adentro (regla 10).

```
>>  necesito cancelar la del martes

<<  Esa cita ya está pagada, así que no la puedo cancelar desde aquí. Lo que sí puedo es moverla
    a otro día: tu pago se va con ella, y tu comprobante también. ¿Te busco día?
[cancelar() · 1 de 12 · no muta · el turno sigue abierto]

>>  va, el miércoles en la tarde

<<  Para el miércoles 2 de septiembre, en línea, tengo estas horas:

    1. 3:00   2. 4:00   3. 5:00

    Dime el número y te la aparto.
[buscar_horarios(dias: ["miércoles"], parte_del_dia: "tarde") · 2 de 12 · no muta]

>>  la 1

<<  Listo, moví tu cita al miércoles 2 de septiembre a las 3:00, en línea.
[reprogramar(opcion: 1) · 3 de 12 · muta · turno cerrado]
```

No hace falta una llamada más para preguntar el día: la negativa de `cancelar` ya lo preguntó.

**La primera línea cambia sola según el estado** —«ya está pagada» o «ya mandaste tu
comprobante»— y el agente no escoge cuál. El turno se queda abierto a propósito, porque la
insistencia la cuenta el servidor.

### 5.4 Con dinero adentro y ella insiste — 2 llamadas

```
>>  no, cancélala de todos modos

<<  Entiendo, pero cancelarla no está de mi lado. Escríbele a Araceli: esa cancelación se hace
    desde su app. Si prefieres moverla, dime y te busco otro día.
[cancelar() · 2 de 12 · no muta · turno cerrado]
```

**El agente no cede** (regla 11), y no lleva la cuenta de nada: la función ya contestó una vez con
la negativa en este turno, así que la segunda llamada devuelve el segundo texto.

---

## 6. Cambiar de modalidad

Es una decisión **por dirección**, y la dirección la determina la modalidad que la cita tiene hoy:
una presencial sólo puede ir a en línea. No hay versión tardía con cargo: o alcanza el tiempo, o
no se cambia.

### 6.1 La propuesta y el cambio — 2 llamadas

```
>>  ¿la puedo tomar en línea?

<<  Sí. Tu cita del miércoles 2 de septiembre a las 4:00 pasaría de presencial a en línea.
    ¿La cambio?
[cambiar_modalidad() · 1 de 12 · no muta]

>>  sí

<<  Listo, tu cita del miércoles 2 de septiembre a las 4:00 queda en línea.
[cambiar_modalidad(confirmado: true) · 2 de 12 · muta · aviso modality_changed_by_patient ·
 turno cerrado]
```

**Sólo se listan las citas que de verdad pueden cambiar:** su servicio admite las dos modalidades,
la profesional permite esa dirección, alcanza la anticipación, y sigue viva y en el futuro. El
agente nunca intenta algo que no se puede; no llega a saber que existía. Con varias, la lista va
con la modalidad actual de cada una y la gestión sube a tres.

### 6.2 Las dos negativas — 1 llamada

```
>>  ¿me la puedes pasar a en línea?

<<  Araceli no maneja cambios a en línea. Tu cita del martes 1 se queda presencial.
[cambiar_modalidad() · 1 de 12 · no muta · turno cerrado]
```

```
>>  ¿la de hoy la puedo tomar en línea?

<<  Para cambiar la modalidad Miranda pide 12 horas de anticipación, y ya faltan menos. Tu cita
    del jueves 27 se queda presencial. Si es urgente, coméntaselo a Miranda.
[cambiar_modalidad() · 1 de 12 · no muta · turno cerrado]
```

Las dos nombran la dirección, no la modalidad deseada, y las dos dicen cómo queda la cita para que
no quede duda de si algo cambió. Hoy sólo una de las seis profesionales permite las dos
direcciones y otra permite sólo el paso a en línea: para las otras cuatro el verbo ni se menciona
en el menú (regla 8), así que esta intención casi nunca llega.

---

## 7. Pasar el pago — 2 llamadas encadenadas

```
>>  quiero cancelar la del martes

<<  Ya mandaste tu comprobante de esa cita, así que no la puedo cancelar desde aquí. Puedo
    moverla a otro día, o pasar tu pago a tu cita del martes 8. ¿Cuál prefieres?
[cancelar() · 1 de 12 · no muta · el turno sigue abierto]

>>  pásalo a la del 8

<<  Listo, pasé tu comprobante a tu sesión del martes 8 de septiembre a las 4:00, y cancelé la
    del martes 1.
[pasar_pago() · 2 de 12 · muta · aviso appointment_cancelled_by_patient · turno cerrado]
```

**El destino no se señala.** Lo resuelve el servidor: misma paciente, mismo servicio, programada,
la primera posterior. Como el modelo no elige, no se puede equivocar de cita.

Si el pago estuviera acreditado, la frase sería «tu pago quedó acreditado en tu sesión del martes
8». **Cuál de las dos sale lo dice el resultado, no lo que el modelo crea que pasó**, y ninguna
dice «pagado» ni «aprobado». Las dos nombran la cancelación de la cita vieja, porque eso es lo que
de verdad le pasa y callarlo la dejaría creyendo que sigue en pie.

Si no hubiera una próxima del mismo servicio, se dice y se ofrece mover, y el turno no cierra: es
un rechazo con salida.

---

## 8. Dejar reseña — 1 llamada

El agente no la pide: la pide la plantilla, que ya trae la petición completa.

```
>>  5 estrellas, Miranda me ayudó muchísimo

<<  Listo, te agradecemos mucho que compartieras esto. Tu nombre queda anónimo: en su perfil sólo
    se muestran tus iniciales.

    Nos ayuda a que más personas encuentren buenas profesionales en nuestro directorio. ¡Gracias!
[dejar_resena(estrellas: 5, comentario: "Miranda me ayudó muchísimo") · 1 de 12 · muta ·
 sin aviso · turno cerrado]
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
[dejar_resena(estrellas: 5) · 1 de 12 · muta · turno cerrado]
```

Se pregunta una vez y no se insiste. Si llega sólo el comentario, se pide la calificación
—«¿Cuántas estrellas le pones, del 1 al 5?»—; **sin calificación no se llama a nada**.

---

## 9. Consultar — 1 llamada

### 9.1 Qué tengo

```
>>  hola

<<  Tienes esto con Miranda:

    1. Miércoles 2 de septiembre, 4:00 — en línea
    2. Viernes 4 de septiembre, 10:00 — en línea

    ¿Qué necesitas? Te las puedo mover, cancelar, confirmar o cambiarles la modalidad.
[mis_citas() · 1 de 12 · no muta · turno cerrado]
```

Lo que se ofrece sale del menú de esa profesional: a las pacientes de Araceli no se les menciona el
cambio de modalidad, porque Araceli no lo permite.

**`mis_citas` cierra el turno.** Si contesta «muévela», eso abre turno nuevo con el presupuesto
entero por delante. Y si no tiene ninguna cita, lo dice y ofrece: «Ahorita no tienes ninguna cita
con Araceli. ¿Te busco día para una?» No es una rama rara: las 30 citas futuras de toda la base se
reparten entre **3 de las 17 pacientes activas**.

### 9.2 Dónde es

```
>>  ¿dónde es la cita?

<<  La dirección te la comparte Araceli directamente.
[mis_citas() · 1 de 12 · no muta · turno cerrado]
```

**No se inventa una dirección ni una liga.** Hoy sólo dos de las seis profesionales tienen
dirección guardada —las dos son filas de prueba— y sólo una tiene liga, así que ésta es la rama
frecuente, no la rara. Cuando el dato existe, la misma frase lo lleva adentro: «Tu cita del
miércoles 2 a las 4:00 es en línea. Por aquí te conectas: …».

### 9.3 Cuánto cuesta

```
>>  ¿cuánto cuesta una sesión?

<<  Hola Emilio. Con Araceli los precios son estos:

    1. Psicoterapia individual · 50 minutos · $900
    2. Psicoterapia individual · 50 minutos · $800
    3. Psicoterapia Pareja · 90 minutos · $1,200
    4. Valoracion Sin Costo · 30 minutos · $0

    ¿Te agendo alguna?
[ver_servicios(para: "precio") · 1 de 12 · no muta]
```

Mismos datos que al agendar, otra pregunta de cierre. El precio que se dice es **el de esa
paciente**: si tiene uno preferente, ése, y la palabra «preferente» no sale nunca al mensaje.

Cuando tiene una serie viva, el aviso va antes que nada: «Ya tienes Psicoterapia individual cada
semana, los domingos a las 6:00, y tu próxima es el domingo 30 a las 6:00. ¿Quieres agendar otra
sesión aparte de ésa?» Hoy hay **una sola serie en toda la base**.

---

## 10. Los bordes

**Cinco de los nueve textos de borde cuestan cero llamadas**: viven literales en el prompt y se
rellenan con el sobre del turno, así que ni un tope de tráfico ni una caída del servidor pueden
dejarlos sin respuesta. Otros tres cuestan una, la que ya se hizo: teléfono desconocido, cuenta
dada de baja y el `sin_horarios` del §1.6. El noveno no pasa por el agente: lo manda el borde de
entrada.

### Teléfono desconocido — 1 llamada

```
>>  hola, quiero agendar una cita con un psicólogo

<<  Hola. Este número es el asistente de Agenda Psi, y desde aquí sólo puedo ayudar a pacientes
    que ya están con un psicólogo o psicóloga de la plataforma.

    Si estás buscando uno, aquí puedes ver quiénes están disponibles: https://agendapsi.mx
[ver_servicios(para: "agendar") · 1 de 12 · no muta · turno cerrado]
```

Cuesta una llamada: **la que ya se hizo**. Cualquiera de las once devuelve este texto en vez de su
carga normal, porque las once vuelven a comprobar quién escribe por su cuenta. El directorio se
ofrece aquí y sólo aquí: quien nunca fue paciente necesita encontrar a alguien.

### La cuenta dada de baja — 1 llamada

```
>>  quiero agendar con Miranda

<<  Por ahora tu cuenta con Miranda no aparece activa, así que desde aquí no puedo ayudarte con
    tus citas.

    Escríbele directamente para que te reactive, y en cuanto lo haga te sigo apoyando por aquí.
[mis_citas() · 1 de 12 · no muta · turno cerrado]
```

El corte es limpio: **nunca fue paciente → directorio; fue y ya no → que la reactiven.** Y esto
cierra el hueco más grave que había, porque hoy una cuenta dada de baja no recibe absolutamente
nada: el rechazo tumba la única operación que podía contárselo.

### Crisis — 0 llamadas

```
>>  ya no quiero seguir aquí, no le veo sentido a nada

<<  Si necesitas ayuda inmediata: Agenda Psi no es un servicio de emergencias. Si tú o alguien
    más se encuentra en peligro, llama al 911. Para recibir apoyo en salud mental, comunícate
    gratis, las 24 horas, a Línea de la Vida: 800 911 2000.
[cero llamadas · el texto vive literal en el prompt · turno cerrado]
```

**Va sola y primero.** No se mezcla con la gestión y no lleva pregunta de cierre: si el mensaje
trae además «cancélame la del jueves», la cancelación no se hace y no se menciona. No tiene ni un
hueco a propósito, así no depende del sobre, ni de la red, ni del presupuesto.

### Fuera de alcance — 0 llamadas

```
>>  quiero hablar con alguien de verdad

<<  Eso no lo puedo ver desde aquí. Si necesitas ayuda de nuestro equipo, escríbenos por aquí:
    https://wa.me/525564370081

    Yo te sigo ayudando con tus citas y con hacerle llegar tu comprobante a Araceli.
[cero llamadas · el texto vive en el prompt · la gestión sigue abierta]
```

El mismo texto para reactivar la cuenta, corregir un comprobante ya mandado, pedir que le hagamos
llegar un recado o recoger materiales. Cierra ofreciendo lo que sí hace: una negativa a secas deja
a quien escribe sin siguiente paso.

### Asunto de dinero — 0 llamadas

```
>>  ¿me pueden devolver lo de la sesión que no tomé?

<<  Los cobros, los descuentos y las devoluciones los decide Araceli directamente, así que eso lo
    ves con Araceli.

    Yo te ayudo con tus citas y con hacerle llegar tu comprobante.
[cero llamadas · el texto vive en el prompt · la gestión sigue abierta]
```

La gestión sigue abierta: si después dice «ok, entonces muéveme la cita», se sigue normal. El
nombre se repite en vez de decir «con ella» porque hay profesionales hombres. Y **«ya te mandé el
comprobante, ¿ya quedó?» no es asunto de dinero**: eso tiene datos detrás y lo contesta
`mandar_comprobante`.

### No te entendí — 0 llamadas

```
>>  asdkjh

<<  No te entendí. Por aquí te puedo ayudar con tus citas —agendar, mover, cancelar o
    confirmar— y con lo de tus pagos. ¿Qué necesitas?
[cero llamadas · el texto vive en el prompt · la gestión sigue abierta]
```

Los verbos salen del menú de esa profesional. **Un saludo suelto no es esto:** «hola» es el
arranque normal y lo contesta `mis_citas`. Esto es para lo genuinamente ininteligible, y para el
audio, el video y el sticker del §2.4.

### Se acabó el espacio — 0 llamadas

```
>>  ¿y el viernes 11?

<<  Se me acabó el espacio de esta consulta. Escríbeme otra vez y seguimos justo desde donde nos
    quedamos.
[cero llamadas · doce de doce gastadas · turno cerrado]
```

Vive en el prompt y no en una función porque cuando hace falta ya no queda ninguna llamada: una
herramienta que sólo se puede usar cuando no se puede usar ninguna es una herramienta rota. El
mensaje siguiente abre turno nuevo con las doce enteras.

Ése es el texto que ella puede leer sin que el agente llegue a arrancar: `vas_muy_rapido`, que sale
cuando se pasa un tope de tráfico, como mucho uno cada quince minutos por teléfono. Hoy ese envío
no existe, y por eso está en lo que hay que construir.

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
[mis_citas() · 1 de 12 · no muta · turno cerrado]
```

**Un lote es una solicitud.** Así se escribe por WhatsApp y así se conversa para agendar. Hoy, sin
el agrupamiento encendido, sólo sobrevive el primer mensaje: el turno queda ocupado, los otros
cuatro se descartan y el agente pregunta lo que ella ya dijo. Encenderlo antes de que el código
acepte lotes apaga el agente entero, así que va primero el código y después el interruptor.

---

## 11. La cuenta del presupuesto

Tope: **doce llamadas por gestión**, y el cierre del turno vive fuera. Lo único que alarga una
gestión es probar filtros distintos, y **cada filtro es una llamada aunque el servidor recorra
treinta días por dentro**: quien prueba seis días distintos gasta 1 + 6 + 1 = 8 y todavía le
sobran cuatro.

| Flujo | Camino normal | Peor caso realista |
|---|---:|---|
| 1 · Agendar | **3** | 8 · seis filtros probados |
| 2 · Mandar comprobante | **2** | 2 · siempre son dos |
| 3 · Confirmar | **1** | 2 · con varias esperando |
| 4 · Reprogramar | **3** | 4 · con varias candidatas, o dos búsquedas |
| 5 · Cancelar | **1** | 3 · si acepta moverla |
| 6 · Cambiar de modalidad | **2** | 3 · con varias candidatas |
| 7 · Pasar el pago | **2** | 2 · encadenada tras cancelar |
| 8 · Dejar reseña | **1** | 1 |
| 9 · Consultar | **1** | 1 |

Y los bordes: crisis, hablar con una persona, devoluciones y descuentos, no te entendí, vas muy
rápido y se acabó el espacio cuestan **cero**. Teléfono desconocido y cuenta dada de baja cuestan
**una**, la que ya se hizo.

**Ningún flujo pasa de 8.** El margen entre 8 y 12 es para quien pregunta mucho, y ése es
exactamente el margen que el ensayo pidió.
