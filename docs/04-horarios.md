# 04 · Los horarios

Corte: 2026-08-27. Todo lo que se mide aquí se leyó de la base viva ese día.

Este archivo explica **cómo se buscan y cómo se ofrecen las horas**. La ficha de la función
—parámetros, tipos, qué devuelve— está en `docs/02-funciones.md` §4.2 y no se repite. Los textos
completos están en `docs/06-textos.md` y aquí se citan por clave. Las reglas se citan por número
y viven en `docs/00-el-agente.md`.

Tres reglas mandan sobre todo lo demás aquí. **El agente nunca calcula fechas** (regla 1):
empareja lo que ella escribe contra una lista que el servidor ya resolvió. **Cinco opciones como
máximo y horizonte de treinta días** (regla 7). **El «ahora» lo pone el servidor** (regla 19).

---

## 1. Lo que hay que arreglar del motor

### 1.1 El defecto, y por qué se ve tan mal

La lectura de horarios que hay desplegada enseña **las seis primeras horas del día, en pasos de
quince minutos**. Un día de 3:00 a 7:00 sale así: 3:00, 3:15, 3:30, 3:45, 4:00 y 4:15. **Las 5:00 no
aparecen nunca**, y la tarde entera desaparece.

Y es peor de lo que parece, porque de esas seis **sólo una es tomable**. Si escoge las 3:00, la
sesión dura una hora y las otras cinco mueren en el mismo instante. Se le enseñan seis opciones y
en realidad se le está enseñando una.

**El motor no tiene la culpa y no se toca.** Entrega un candidato cada quince minutos porque así
lo necesita la app de la profesional, que agenda a mano y a cualquier hora. Quien escoge qué
enseñar es la lectura, y ésa es la que se arregla.

### 1.2 La medición de hoy

Araceli, Psicoterapia individual presencial —50 minutos más 10 de margen, bloques de una hora—,
martes 8 de septiembre. Trabaja de 9:00 a 2:00 y de 3:00 a 6:00:

| | Resultado |
|---|---|
| Candidatos que devuelve el motor | **26**, uno cada quince minutos |
| Las seis primeras, tal cual | 09:00, 09:15, 09:30, 09:45, 10:00, 10:15 — **se pierde toda la tarde** |
| Quitando traslapes | **09:00, 10:00, 11:00, 12:00, 13:00, 15:00, 16:00, 17:00** |
| Quitando traslapes y con «por la tarde» | **12:00, 13:00, 15:00, 16:00, 17:00** — exactamente cinco |

El último renglón es la conversación que se quiere: ella pide la tarde y recibe cinco horas
tomables, no seis cuartos de hora de la mañana.

### 1.3 Los tres arreglos

| # | Arreglo | Qué cambia |
|---|---|---|
| 1 | **Subir el tope** | Deja de cortar en el sexto candidato. Se barre el día entero y de lo que queda se dicen cinco (regla 7) |
| 2 | **Quitar los traslapes** | Se conserva la primera hora y se descarta todo lo que empiece antes de que ésa termine. De 26 candidatos quedan 8 horas de verdad |
| 3 | **Respetar la franja** | Se filtra por la hora de **inicio**: «por la tarde» quiere decir que la sesión empiece en la tarde, no que quepa ahí. El borde de arriba no entra: la sesión que arranca justo cuando la franja termina queda fuera |

Los tres van juntos. Con el tope arriba y sin quitar traslapes se seguirían enseñando cuartos de
hora seguidos de la mañana: el mismo defecto, sólo que barriendo más día para llegar a él.

**Lo que se recorta no se pierde.** Medido sobre los catorce servicios activos y sus modalidades,
en una ventana de sesenta días: un día que trae algo da **ocho horas de promedio y dieciséis como
mucho**, una vez quitados los traslapes. De ésas se dicen cinco. Las demás vuelven en cuanto ella
pide otra franja u otro día, y eso cuesta una llamada de las nueve de margen (regla 9).

---

## 2. La búsqueda con filtros

### 2.1 Qué recibe

Lo poco que ella dijo, tal cual: días de la semana por su nombre, números de día del mes, una hora
exacta, o una franja del día. Los tipos están en `docs/02-funciones.md` §4.2.

**Los números del mes viajan sin mes y sin año, y eso es a propósito.** Si dice «el 15 y el 16»,
resolver de qué mes son es aritmética de calendario, que es justo lo prohibido por la regla 1.
Lo que el agente sí puede hacer sin calcular nada es copiar el número. El servidor lo resuelve a
su próxima ocurrencia dentro del horizonte.

Eso deja un hueco: «el 15 de diciembre» llega como un 15 a secas, y un 15 siempre cae dentro de
una ventana de treinta días. **Se tapa por arriba, no por abajo.** Cada opción viaja con el mes en
su etiqueta —«martes 15 de septiembre»—, así que ella ve de qué mes le estamos hablando y corrige
en el mismo mensaje. Más allá de los treinta días no se busca: se consulta de nuevo cuando se
acerque (regla 7).

**La franja tampoco la traduce el modelo.** «Por la tarde» viaja como una de las cuatro franjas
que la función admite, y quien la convierte en un par de horas es el servidor, con el horario de
esa profesional. La tarde de quien atiende de 3:00 a 7:00 no es la de quien atiende de 9:00 a 2:00.

### 2.2 Cómo recorre los días por dentro

Primero se arma la ventana: desde hoy hasta treinta días después, y nunca antes de la anticipación
mínima que pide esa ficha. Hoy son **48 horas en tres profesionales y 24 en las otras tres**, y
ninguna de esas cifras se escribe a mano en ningún texto (regla 2).

**Esa ventana la pone la función, no el motor.** El núcleo de horarios recibe la anticipación
mínima de la paciente como un interruptor que viene **apagado por omisión**, y del agendado por
parte de la paciente no sabe nada: no lo mira nunca (verificado el 2026-08-28). Reutilizarlo tal
cual devuelve la vista de la profesional —horas de mañana mismo, y horas de quien tiene el
agendado apagado—, que es justo lo contrario de lo que la paciente puede ver. Los dos cortes son
del que llama.

Dentro de la ventana, los días candidatos salen de lo que ella dijo: los números del mes si los
dio; si no, los días de la semana que nombró; si no nombró nada, todos.

Después vienen dos pasadas de distinto precio:

1. **La pasada barata** dice qué días están abiertos para ese servicio y esa modalidad, sin tocar
   la agenda. Mira el horario semanal, las excepciones del día, los bloqueos que cubren el día
   entero y el reloj de la anticipación. **Cubre el horizonte completo de una sola vez.**
2. **El cálculo exacto** sólo corre sobre los días que sobrevivieron, y sólo para saber si están
   llenos. Es el único paso caro.

**El tope del cálculo exacto son diez días visitados, y se cuentan los visitados, no los que
devolvieron algo.** Si se contaran los que traen opciones, un día abierto pero lleno no contaría y
el recorrido seguiría: con la agenda llena, eso son todos los días abiertos de la ventana por una
sola pregunta. Además se deja de visitar en cuanto ya hay cinco opciones y ella no nombró días.

El reparto de las cinco es **por rondas**: la primera hora de cada día visitado, luego la segunda
de cada uno, y así hasta juntar cinco. Por eso «martes y jueves por la tarde» contesta de los dos
días y no cinco horas del martes.

### 2.3 Lo que cuesta, y por qué da igual

Medido hoy, sobre una profesional real y una ventana de **sesenta días** —el doble del horizonte,
a propósito, para ver cómo crece—:

| | Tiempo | Páginas leídas |
|---|---|---|
| La pasada barata, de una sola vez | **1.1 ms** | **14** |
| Los mismos sesenta días llamando al cálculo exacto día por día | **72.6 ms** | **2 986** |

Sesenta veces más rápida y doscientas veces menos páginas. La primera corrida cuesta unos nueve
milisegundos mientras se arma el plan; dentro de una función el plan se guarda y ese costo se
paga una vez por conexión.

**Y todo eso es una sola llamada del agente.** Aunque el servidor mire treinta días y toque el
cálculo exacto en diez, el agente hizo un viaje. **El presupuesto cuenta viajes del agente al
servidor, no trabajo de la base** (regla 9). Es la diferencia entre una gestión de tres llamadas y
una que se queda sin presupuesto preguntando día por día.

---

## 3. Los cinco motivos de que no haya nada

Una lista vacía la obliga a adivinar y al agente a preguntar otra vez, y cada pregunta cuesta
una llamada y un mensaje. Por eso **nunca se devuelve una lista vacía**: se devuelve el motivo, y
cada motivo lleva alternativas numeradas de verdad.

| Motivo | Clave del texto | Cómo se distingue | ¿Cuesta el cálculo exacto? |
|---|---|---|---|
| No trabaja a esa hora | `sin_hueco_fuera_de_horario` | Ningún bloque del día deja caber la sesión **empezando dentro** de la franja pedida | no |
| No trabaja esos días | `sin_hueco_dias_que_no_trabaja` | No hay bloque de esa modalidad ese día de la semana, o el que hay mide menos que la sesión con su margen | no |
| Esos días concretos no va a estar | `sin_hueco_ausencia` | Hay una excepción de calendario que cierra esa fecha, o un bloqueo que la cubre entera | no |
| Sí trabaja, pero está llena | `sin_hueco_lleno` | Pasó los cuatro anteriores y el cálculo exacto devolvió cero | **sí** |
| Es demasiado pronto | `sin_hueco_demasiado_pronto` | El día es anterior a la anticipación mínima de esa ficha | no |

Los textos están en `docs/06-textos.md` §3, en ese mismo orden.

**Se clasifica día por día y gana el primero que aplica**, en este orden: primero el reloj, porque
de nada sirve ofrecer un día al que ya no llega; después la fecha concreta, porque una excepción de
calendario manda sobre el horario semanal; después la semana; después la hora; y al final la
ocupación, que es lo único que exige el cálculo caro. **El motivo que se dice es el del primer día
que ella pidió**, porque ésa fue su pregunta.

**Cuatro de los cinco se resuelven en la pasada barata.** Sólo «está llena» paga el cálculo
exacto, y es el único que lo merece: es el único que depende de lo que pasó en la agenda hoy.

**«No trabaja a esa hora» dice «deja caber la sesión», no «toca la franja», y la diferencia es una
mentira.** Una sesión de hora y media en una franja de 17:00 a 18:00: el bloque de 15:00 a 18:00
toca la franja, pero el último hueco de hora y media del día empieza a las 16:30. Con la regla
floja el agente diría «ya se le llenaron» con la agenda vacía. Es falso y además irrecuperable:
ella buscaría otro día cuando lo que hay que mover es la hora.

**Las alternativas son opciones de verdad, no una frase de consuelo.** Salen de correr la misma
búsqueda una segunda vez sin el filtro de días, conservando modalidad y franja, y sólo se calculan
cuando la primera pasada vino vacía. Es la diferencia entre «lo más cercano es el 17» —y que ella
tenga que volver a preguntar— y «el 17 te tengo a las 9, a las 10 o a la 1, ¿cuál?», que cierra en
el mismo mensaje. Cuando las alternativas son horas apartables, la función queda esperando el
número de opción; cuando sólo se puede proponer otra ventana, queda esperando otros filtros.

**Hay un sexto caso que no es un motivo:** que la profesional no tenga ni un bloque de horario
guardado, o tenga apagado el agendado por parte de la paciente. Eso es el texto `sin_horarios` y
lo dice `ver_servicios` antes de llegar aquí, así que la gestión entera cuesta una sola llamada.
Hoy **una de las seis** tiene ese interruptor apagado.

---

## 4. Cómo se ofrecen las horas

Cuatro reglas, todas de presentación. El servidor entrega las opciones ya etiquetadas con el
nombre del día, la fecha y la hora; el agente las dice.

**1 · Sin traslapes.** Viene resuelto del servidor. El agente nunca ofrece dos horas que no puedan
coexistir.

**2 · Cinco como máximo.** Es el tope del servidor, no una instrucción al modelo. No puede enseñar
seis porque nunca recibe seis.

**3 · Si dos días traen exactamente las mismas horas, se dicen una sola vez.** Los números son del
día más próximo y el otro queda ofrecido en la misma frase. El texto está en `docs/06-textos.md`
§2.2.

**4 · Si difieren, se numeran día y hora juntos**, copiando la etiqueta tal cual:

> 1. Martes 8 de septiembre, 12:00
> 2. Jueves 10 de septiembre, 12:00
> 3. Martes 8 de septiembre, 1:00

**El agente no decide cuál de las dos usa: lo decide el servidor al componer el texto.** Con una
franja estrecha las rondas se completan y los días quedan con el mismo juego; con una franja ancha
las rondas se truncan y los juegos difieren.

Y con un solo día pasa lo mismo: las horas van numeradas, porque el número es lo único que ella
tiene que contestar para apartar una.

Ella contesta «la 3» o «el martes a las 12», el modelo empareja contra la lista que el servidor ya
escribió y manda el número (regla 17). **No hay paso de «¿confirmo?»: escoger es agendar.**

---

## 5. La cita que se mueve

Cuando la búsqueda sirve para mover una cita, se le dice cuál es la que se mueve, y el servidor la
**excluye de la agenda antes de calcular**. Sin eso pasan dos cosas feas, y las dos se ven en la
conversación:

1. La cita se taparía a sí misma. La hora que ella tiene hoy no aparecería como disponible, y
   cambiar de modalidad conservando la hora sería imposible.
2. Se taparía a sus vecinas. Una sesión de una hora bloquea el bloque que ocupa; si sigue contada,
   las horas de alrededor tampoco se ofrecen aunque vayan a quedar libres en cuanto se mueva.

**No se pregunta ni el servicio ni la modalidad**: vienen de la cita que se mueve. Y cuando hay una
sola candidata, la cita ni siquiera lleva número: el servidor la resuelve por dentro y nunca llega
a escribir la lista.

---

## 6. Zonas horarias

**Siempre la zona del negocio.** Manda la zona de la profesional, con la de la Ciudad de México
por omisión. Nada usa la zona de la paciente, y es a propósito: la cita ocurre donde está la
profesional. Hoy **las seis profesionales están en la zona de la Ciudad de México**, así que en
producción no hay ni una hora que traducir.

**El «ahora» lo pone el servidor** (regla 19). Ninguna función recibe la fecha de hoy ni una zona
como parámetro, así que no hay forma de que el modelo se equivoque de día: no tiene con qué.

Las horas se manejan como **hora de pared** —«martes 8, 12:00»— y se convierten a instante
absoluto una sola vez, al apartar la cita. Ningún texto nombra la zona, y con las seis en la misma
no hace falta que la nombre.

---

## 7. El hueco que se ocupa mientras conversan

**Ofrecer un hueco nunca lo aparta**, y es deliberado: apartar cinco huecos por cada pregunta
llenaría la agenda de fantasmas de gente que nunca contestó.

Así que puede pasar, y hay que contarlo bien. Se le ofrecen cinco horas del martes, mientras lee
otra paciente toma las 12:00, y ella contesta «las 12».

**Qué pasa por dentro.** Al apartar, el servidor toma el candado de esa agenda y vuelve a
comprobar que la hora siga libre. Si ya no está, **no devuelve un código: vuelve a buscar ahí
mismo** y compone el texto `horario_ocupado` con las horas que quedan de ese mismo día,
renumeradas, y `hecho: false`. Una llamada, no dos. El agente no dice «listo» porque `hecho` es
falso, y ésa es toda la regla contra el falso éxito.

Si era la última del día, entonces sí hace falta buscar otra vez, y eso cuesta una llamada más.

**No debe gastar la mutación del turno.** La llamada se reclama como mutación siempre, pero se
cierra como rechazada antes de escribir, así que el cerrojo de una mutación por turno (regla 14)
sigue disponible y ella puede escoger otra hora en el mismo turno. Lo único que se gastó fue una
llamada del presupuesto: un viaje que no escribió nada. **Falta comprobar contra el cuerpo
desplegado que ese camino deja el turno limpio**, y eso vive en `docs/07-portero.md`.

---

## 8. Lo que queda abierto

1. **«Está llena» nunca se ha visto con datos reales.** Hoy hay 30 citas futuras vivas y cero
   bloqueos futuros, pero ninguna de esas citas llena un día entero. Es el único de los cinco
   motivos que no se ha podido comprobar de punta a punta, y hay que volver a medirlo en cuanto una
   agenda se apriete de verdad.
2. **Las alternativas están diseñadas y medidas, pero no ejercidas**, por lo mismo: la segunda
   pasada sólo corre cuando la primera sale vacía, y hoy casi nunca sale vacía.
3. **La modalidad cruzada sigue sin decidirse.** «Presencial no tengo mañanas, en línea sí»: hoy la
   búsqueda recibe una modalidad y contesta de esa modalidad. Que un «no trabaja a esa hora» mire
   de reojo la otra cuesta una pasada barata más, que es un milisegundo. Falta decidir si se
   ofrece o si confunde.
4. **Un día que se ofrece y sale vacío al tocarlo** es posible: los candidatos van de quince en
   quince minutos desde la apertura, así que el último puede quedar hasta catorce minutos antes de
   lo que la pasada barata supone. Ese día termina en «está llena», que de cara a la paciente es
   correcto, y no se va a arreglar: arreglarlo exige que la pasada barata mida huecos.
5. **La rama del consultorio compartido tampoco se ha ejercido.** Cero conexiones activas hoy. El
   motor la tiene y la búsqueda la hereda sin tocarla, pero nadie la ha visto correr.
