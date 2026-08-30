# 04 · Los horarios

Corte: 2026-08-28.

Este archivo explica **cómo se buscan y cómo se ofrecen las horas**. La ficha de la función
—parámetros, tipos, qué devuelve— está en `docs/02-funciones.md` §4.2 y no se repite. Los textos
completos están en `docs/06-textos.md` y aquí se citan por clave. Las reglas se citan por número
y viven en `docs/00-el-agente.md`.

Tres reglas mandan sobre todo lo demás aquí. **El agente nunca calcula fechas** (regla 1):
empareja lo que ella escribe contra una lista que el servidor ya resolvió. **Cinco opciones como
máximo y horizonte de treinta días** (regla 7); la única excepción de esa regla es la lista de
servicios, que llega a ocho, y aquí no se listan servicios: todas las listas de esta página son de
horas y ninguna pasa de cinco. **El «ahora» lo pone el servidor** (regla 19), y por eso el modelo
no tiene con qué equivocarse de día.

**Ningún ejemplo de esta página es de producción.** Los nombres, los horarios y los servicios que
aparecen son inventados y están marcados como ejemplos. Cada regla se escribe sobre lo que la
profesional configura, nunca sobre lo que hoy tiene configurado.

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

### 1.2 Un ejemplo con números

**Ejemplo inventado.** Una ficha que atiende de 9:00 a 2:00 y de 3:00 a 6:00, con una sesión de
50 minutos más 10 de margen —bloques de una hora—, un martes cualquiera:

| | Resultado |
|---|---|
| Candidatos que devuelve el motor | **26**, uno cada quince minutos |
| Los seis primeros, tal cual | 09:00, 09:15, 09:30, 09:45, 10:00, 10:15 — **se pierde toda la tarde** |
| En punto y sin traslapes | **09:00, 10:00, 11:00, 12:00, 13:00, 15:00, 16:00, 17:00** |
| En punto, sin traslapes y con «por la tarde» | **12:00, 13:00, 15:00, 16:00, 17:00** — exactamente cinco |

El último renglón es la conversación que se quiere: ella pide la tarde y recibe cinco horas
tomables, no seis cuartos de hora de la mañana.

### 1.3 Los cuatro arreglos

| # | Arreglo | Qué cambia |
|---|---|---|
| 1 | **Subir el tope** | Deja de cortar en el sexto candidato. Se barre el día entero y de lo que queda se dicen cinco (regla 7) |
| 2 | **Ofrecer en punto** | De los candidatos de cada quince minutos, la lista se arma **sólo con los de minuto cero**. Si el horario abre a una hora rara, ese pedazo se desperdicia |
| 3 | **Quitar los traslapes** | En punto no basta: una sesión de hora y media que arranca a las 9:00 mata las 10:00. Se conserva la primera hora y se descarta todo lo que empiece antes de que ésa termine |
| 4 | **Respetar la franja** | Se filtra por la hora de **inicio**: «por la tarde» quiere decir que la sesión empiece en la tarde, no que quepa ahí. El borde de arriba no entra: la sesión que arranca justo cuando la franja termina queda fuera |

Los cuatro van juntos. Con el tope arriba y sin los otros tres se seguirían enseñando cuartos de
hora seguidos de la mañana: el mismo defecto, sólo que barriendo más día para llegar a él.

**Las listas son de horas en punto. Los minutos sueltos sólo entran si ella los pide por su
nombre**, y entonces vale cualquiera, no sólo la media: «a las 4:30» y «a las 4:15» se revisan
igual contra el horario y la agenda, y si el motor tiene ese candidato se le ofrece. Lo que no pasa
nunca es que un minuto suelto aparezca en una lista que ella no pidió: se prefiere desperdiciar un
pedazo de la agenda a llenarle el mensaje de horas incómodas.

**Y lo que se le ofrece se le puede apartar.** No hay una segunda regla que rechace los minutos al
escribir: si el motor entregó ese candidato y se le dijo, la escritura lo acepta. Lo contrario
—ofrecer una hora que el propio servidor va a rechazar un mensaje después— es justo lo que §7
existe para evitar, y la web anterior lo hacía: al apartar exigía minuto 0 o 30.

**Lo que se recorta no se pierde.** Un día abierto rara vez pasa de una docena de horas en punto
una vez quitados los traslapes, y de ésas se dicen cinco. Las demás vuelven en cuanto ella pide
otra franja u otro día, y eso cuesta una llamada más de las tres de ese mensaje.

---

## 2. La búsqueda con filtros

### 2.1 Qué recibe

Lo poco que ella dijo, tal cual: días de la semana por su nombre, números de día del mes, una
palabra relativa —«mañana», «la próxima semana»—, una hora exacta, o una franja del día. Los tipos
están en `docs/02-funciones.md` §4.2.

**Los números del mes viajan sin mes y sin año, y eso es a propósito.** Si dice «el 15 y el 16»,
resolver de qué mes son es aritmética de calendario, que es justo lo prohibido por la regla 1.
Lo que el agente sí puede hacer sin calcular nada es copiar el número. El servidor lo resuelve a
su próxima ocurrencia dentro del horizonte.

Eso deja un hueco: «el 15 de diciembre» llega como un 15 a secas, y un 15 siempre cae dentro de
una ventana de treinta días. **Se tapa con la etiqueta.** Cada opción viaja con el mes puesto
—«martes 15 de septiembre»—, así que ella ve de qué mes le estamos hablando y corrige en el mismo
mensaje. Y esa etiqueta lleva el mes **también cuando ella dio números de día**, que es justo
cuando hace falta.

**La resolución es siempre hacia adelante.** «¿Tienes el 20?» un día 27 se resuelve al 20 del mes
que viene, nunca al que ya pasó. Una fecha que ya pasó no se rechaza ni se corrige sola: acaba en
su próxima ocurrencia, y la única corrección es la etiqueta de arriba.

**«Mañana» y «la próxima semana» también viajan como palabra.** Para eso está `relativo`, con seis
valores literales —`hoy`, `manana`, `pasado_manana`, `esta_semana`, `proxima_semana`,
`fin_de_semana`—. El modelo copia lo que ella dijo y el servidor lo convierte con su propio
«ahora». Sin ese parámetro, «¿tienes mañana?» obligaría al modelo a saber qué día es hoy y sumar
uno, que es exactamente lo que la regla 1 prohíbe y lo que el sobre no le da.

**Si no hay ocurrencia dentro del horizonte, se dice.** «El 31», cuando el próximo 31 cae más allá
de los treinta días, no se resuelve a nada: sale `fuera_del_horizonte`, que reconoce que hasta ahí
no alcanzamos a ver y ofrece buscar algo antes. Más allá de los treinta días no se busca: se
consulta de nuevo cuando se acerque (regla 7).

**Un mes suelto no tiene parámetro que lo reciba.** «¿Tienes algo para diciembre?» llega sin día de
la semana, sin número y sin `relativo`, exactamente igual que «cuando sea», así que no se puede
distinguir de ella y no se adivina: se busca en todo el horizonte y la etiqueta de cada opción, que
lleva el mes, la corrige en el mismo mensaje.

**La franja tampoco la traduce el modelo.** «Por la tarde» viaja como una de las cuatro franjas
que la función admite, y quien la convierte en un par de horas es el servidor, con el horario de
esa profesional. La tarde de quien atiende de 3:00 a 7:00 no es la de quien atiende de 9:00 a 2:00.

### 2.2 Cómo recorre los días por dentro

Primero se arma la ventana: desde hoy hasta treinta días después, y nunca antes de la anticipación
mínima que pide esa ficha. **Cada profesional configura la suya**, y esa cifra sale de la ficha
(regla 2). No se escribe a mano en ningún texto y, además, **no se le dice**: el motivo «es
demasiado pronto» sólo nombra el día más cercano al que sí alcanza (§3).

**Esa ventana la pone la función, no el motor.** El núcleo de horarios recibe la anticipación
mínima de la paciente como un interruptor que viene **apagado por omisión**, y del agendado por
parte de la paciente no sabe nada: no lo mira nunca (verificado el 2026-08-28). Reutilizarlo tal
cual devuelve la vista de la profesional —horas de mañana mismo, y horas de quien tiene el
agendado apagado—, que es justo lo contrario de lo que la paciente puede ver. Los dos cortes son
del que llama.

**La anticipación mínima corta igual al agendar y al reprogramar.** En los dos casos se está
tomando un horario nuevo, así que el mismo corte aplica. La búsqueda no cambia de reglas según para
qué sirva.

**Son dos plazos distintos de la misma ficha y hay que decirlos por separado**, porque juntos se
contradicen:

| | Qué decide | ¿Bloquea? |
|---|---|---|
| **Aviso de cambio** | Si la cancelación o el cambio lleva cargo, y si el pago puede irse con la cita | No. Mover y cancelar se permiten sin importar el aviso |
| **Anticipación mínima** | Desde cuándo se puede tomar un horario | Sí. Ningún día anterior al corte entra en la ventana |

Por eso está mal escribir «se permite siempre» a secas. Lo cierto son dos frases: mover se permite
sin importar el aviso, **y** el horario nuevo tiene que caber en la anticipación mínima.

**Los dos pueden aparecer en la misma gestión, y no es un error.** Primero se le avisa que se
cobran las dos sesiones —eso es el aviso de cambio— y después la búsqueda sólo le ofrece días a
partir del primero que la anticipación permite.

**El corte se cuenta desde ahora, no desde la cita que se mueve.** Ejemplo inventado, con una ficha
que pide 48 horas: su cita es el jueves y hoy es martes; el jueves ya no alcanza, aunque sí
alcanzaba el día que la agendó. Se recalcula hoy porque el horario nuevo se está tomando hoy.

**Lo que la anticipación no toca es el dinero.** Pasar el pago a una ocurrencia de la serie que ya
existe no toma ningún horario: usa uno que ya estaba apartado, así que ahí no corta. Y cancelar no
la toca nunca, porque cancelar no toma horarios.

Dentro de la ventana, los días candidatos salen de lo que ella dijo: los números del mes si los
dio; si no, los días de la semana que nombró; si no nombró nada, todos. **`relativo` no escoge
días: acorta la ventana** —«mañana» la deja en uno, «la próxima semana» en siete— y lo demás
filtra dentro. Por eso «el martes de la próxima semana» se resuelve solo, sin que nadie sume
fechas.

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

Medido sobre una agenda de prueba y una ventana de **sesenta días** —el doble del horizonte, a
propósito, para ver cómo crece—:

| | Tiempo | Páginas leídas |
|---|---|---|
| La pasada barata, de una sola vez | **1.1 ms** | **14** |
| Los mismos sesenta días llamando al cálculo exacto día por día | **72.6 ms** | **2 986** |

Sesenta veces más rápida y doscientas veces menos páginas. La primera corrida cuesta unos nueve
milisegundos mientras se arma el plan; dentro de una función el plan se guarda y ese costo se
paga una vez por conexión.

**Y todo eso es una sola llamada del agente.** Aunque el servidor mire treinta días y toque el
cálculo exacto en diez, el agente hizo un viaje. **El único freno cuenta viajes del agente al
servidor, no trabajo de la base:** tres llamadas por mensaje de ella (regla 9). Buscar horarios
gasta una, y por eso preguntar por treinta días cabe holgado en un mensaje; preguntar día por día
no cabría en ninguno.

---

## 3. Cuando no hay horas que ofrecer

Una lista vacía la obliga a adivinar y al agente a preguntar otra vez, y cada pregunta cuesta
una llamada y un mensaje. Por eso **nunca se devuelve una lista vacía**: se devuelve el motivo, y
cada motivo lleva alternativas numeradas de verdad.

### 3.1 Antes de los cinco: ¿el servicio admite esa modalidad?

**Lo primero que se comprueba no es la agenda, es el servicio.** Si ella pide una modalidad que ese
servicio no admite —un servicio que sólo se da en línea, pedido presencial—, no hay bloque de esa
modalidad ningún día, así que caería en «no trabaja esos días». Eso es falso y además
irrecuperable: se iría a buscar otro día cuando lo que hay que cambiar es la modalidad.

Ese caso se contesta con `modalidad_no_disponible_en_servicio`, que dice cómo sí se da ese servicio
y ofrece las dos salidas: buscar así, o ver otro servicio. Va antes que los cinco porque **no
depende del día ni de la ocupación**: depende de la ficha del servicio, y comprobarlo cuesta cero.
El mismo agujero existe al reprogramar, donde la modalidad se vuelve a preguntar sobre un servicio
heredado (§5), y se tapa con la misma comprobación.

### 3.2 Los cinco motivos

| Motivo | Clave del texto | Cómo se distingue | ¿Cuesta el cálculo exacto? |
|---|---|---|---|
| No trabaja a esa hora | `sin_hueco_fuera_de_horario` | Ningún bloque del día deja caber la sesión **empezando dentro** de la franja pedida | no |
| No trabaja esos días | `sin_hueco_dias_que_no_trabaja` | No hay bloque de esa modalidad ese día de la semana, o el que hay mide menos que la sesión con su margen | no |
| Esos días concretos no va a estar | `sin_hueco_ausencia` | Hay una excepción de calendario que cierra esa fecha, o un bloqueo que la cubre entera | no |
| Sí trabaja, pero está llena | `sin_hueco_lleno` | Pasó los cuatro anteriores y el cálculo exacto no dejó ni una hora en lo que ella pidió | **sí** |
| Es demasiado pronto | `sin_hueco_demasiado_pronto` | El día es anterior a la anticipación mínima de esa ficha, contada desde hoy | no |

Los textos están en `docs/06-textos.md` §3, en ese mismo orden. Y hay un sexto texto que no es un
motivo de agenda: `fuera_del_horizonte`, cuando la fecha que pidió cae más allá de los treinta días
(§2.1).

**Se clasifica día por día y gana el primero que aplica**, ya pasada la comprobación de §3.1, en
este orden: primero el reloj, porque de nada sirve ofrecer un día al que ya no llega; después la
fecha concreta, porque una excepción de calendario manda sobre el horario semanal; después la
semana; después la hora; y al final la
ocupación, que es lo único que exige el cálculo caro. **El motivo que se dice es el del primer día
que ella pidió**, porque ésa fue su pregunta.

**Cuatro de los cinco se resuelven en la pasada barata.** Sólo «está llena» paga el cálculo
exacto, y es el único que lo merece: es el único que depende de lo que pasó en la agenda hoy.

**«No trabaja a esa hora» dice «deja caber la sesión», no «toca la franja», y la diferencia es una
mentira.** Una sesión de hora y media en una franja de 17:00 a 18:00: el bloque de 15:00 a 18:00
toca la franja, pero la última hora en punto donde la sesión cabe entera es las 16:00. Con la regla
floja el agente diría «ya se le llenaron» con la agenda vacía. Es falso y además irrecuperable:
ella buscaría otro día cuando lo que hay que mover es la hora.

**Las alternativas son opciones de verdad, no una frase de consuelo.** Salen de correr la misma
búsqueda una segunda vez sin el filtro de días, conservando modalidad y franja, y sólo se calculan
cuando la primera pasada vino vacía. Es la diferencia entre «lo más cercano es el 17» —y que ella
tenga que volver a preguntar— y «el 17 te tengo a las 9, a las 10 o a la 1. ¿Te sirve alguno, o te
busco otra fecha?», que cierra en el mismo mensaje. Cuando las alternativas son horas apartables,
la función queda esperando el número de opción; cuando sólo se puede proponer otra ventana, queda
esperando otros filtros.

**«Está llena» ofrece dos salidas, no una.** La misma hora en otros días, y otras horas en ese
mismo día. Son dos preguntas distintas —«¿otro día a mi hora?» y «¿ese día a otra hora?»— y
contestar sólo una la manda a preguntar por la que faltó. Por eso esa lista mezcla las dos y cada
renglón lleva día y hora.

**En ningún motivo se nombra a la profesional, y tampoco su número.** Está mal escribir «Fulana
necesita 48 horas, ya no alcanzo»: convierte un hueco de agenda en un reproche a quien la atiende.
Y «es demasiado pronto» tampoco dice cuánta anticipación pide la ficha: sólo cuál es el día más
cercano al que sí alcanza. Es el mismo criterio aplicado a la cifra —el motivo no explica la
política de quien la atiende—. Se dice lo que hay —«Para el {dia} ya no alcanzo. Lo más cercano es
el {dia}»— y se ofrece la salida.

**Y hay otro caso que tampoco es un motivo:** que la profesional no tenga ni un bloque de horario
guardado, o tenga apagado el agendado por parte de la paciente. Eso es el texto `sin_horarios` y
lo dice `ver_servicios` antes de llegar aquí, así que se resuelve con una sola llamada.

---

## 4. Cómo se ofrecen las horas

Cinco reglas, todas de presentación. El servidor entrega las opciones ya etiquetadas con el nombre
del día, la fecha y la hora; el agente las dice.

**1 · En punto.** Todas las horas de una lista son de minuto cero. La única hora con minutos que
puede aparecer es la que ella pidió por su nombre, sea :30 o :15.

**2 · Sin traslapes.** Viene resuelto del servidor. El agente nunca ofrece dos horas que no puedan
coexistir.

**3 · Cinco como máximo.** Es el tope del servidor, no una instrucción al modelo. No puede enseñar
seis porque nunca recibe seis.

**4 · Si dos días traen exactamente las mismas horas, se numeran una sola vez.** Se dice de qué dos
días son y ahí se acaba: «El martes 8 y el jueves 10 tengo estas horas (Hora CDMX):». **Está mal
decir «te pongo las del martes»**, porque no son las del martes: son las mismas de los dos.
Numerarlas dos veces es enseñarle diez opciones que en realidad son cinco. El texto está en
`docs/06-textos.md` §2.2.

**5 · Si difieren, se numeran día y hora juntos**, copiando la etiqueta tal cual:

> 1. Martes 8 de septiembre, 12:00
> 2. Jueves 10 de septiembre, 12:00
> 3. Martes 8 de septiembre, 1:00

**El agente no decide cuál de las dos usa: lo decide el servidor al componer el texto.** Con una
franja estrecha las rondas se completan y los días quedan con el mismo juego; con una franja ancha
las rondas se truncan y los juegos difieren.

Y con un solo día pasa lo mismo: las horas van numeradas, porque el número es lo único que ella
tiene que contestar.

**Al escoger la hora siempre se sabe el día.** O lo dice ella —«el jueves a las 12»—, o el renglón
que escogió ya lo traía pegado, o la lista compartida se lo pregunta. Nunca queda una hora suelta
sin día. Y si desde el principio dijo día y hora juntos, eso ya está determinado y no se le vuelve
a preguntar.

Ella contesta «la 3» o «el martes a las 12», el modelo empareja contra la lista que el servidor ya
escribió y manda el número (regla 17). **Escoger no aparta.** De aquí se pasa a `agendar`, que
propone la cita completa —día, hora, modalidad— y pregunta si la aparta; hasta que ella dice que sí
se crea. El detalle está en `docs/02-funciones.md` §4.3.

---

## 5. La cita que se mueve

Cuando la búsqueda sirve para mover una cita, el servidor la **excluye de la agenda antes de
calcular**. Cuál es no se lo dice el modelo: la búsqueda no recibe ninguna cita. El servidor la
saca de la memoria de la conversación, de la columna `subject`, donde `reprogramar` la dejó escrita
al resolver el número —o al resolver una sola candidata sin listarla—. La memoria está definida en
`docs/07-portero.md` §8.1.

Sin la exclusión pasan dos cosas feas, y las dos se ven en la conversación:

1. La cita se taparía a sí misma. La hora que ella tiene hoy no aparecería como disponible, y
   cambiar de modalidad conservando la hora sería imposible.
2. Se taparía a sus vecinas. Una sesión de una hora bloquea el bloque que ocupa; si sigue contada,
   las horas de alrededor tampoco se ofrecen aunque vayan a quedar libres en cuanto se mueva.

**El servicio no se vuelve a preguntar**: viene de la cita que se mueve. **La modalidad sí**, y esa
es la diferencia que importa: si ese servicio admite las dos, se le pregunta otra vez, porque mover
la cita es justo el momento en que puede querer cambiarla. Preguntar el servicio sería hacerla
repetir algo que ya está decidido; no preguntar la modalidad sería decidir por ella.

Y cuando hay una sola candidata, la cita ni siquiera lleva número: `reprogramar` la resuelve por
dentro, la deja en `subject` y nunca llega a escribir la lista. También ahí la búsqueda sabe cuál
excluir.

**La exclusión tiene que valer también en la comprobación de la escritura** (§7). Si la búsqueda
excluye la cita que se mueve y la escritura no, el servidor le ofrece una hora que él mismo va a
rechazar un mensaje después: la del propio hueco que se está liberando, que es la más fácil de
escoger cuando sólo quiere cambiar la modalidad.

**Y la anticipación mínima sigue cortando aquí** (§2.2). Excluir la cita libera su hueco, pero no
adelanta el reloj: con una ficha que pide 48 horas, el día de la cita que se mueve puede quedar
fuera de la ventana aunque estuviera dentro cuando se agendó. Mover se permite sin importar el
aviso de cambio; el horario nuevo tiene que caber en la anticipación.

---

## 6. Zonas horarias

**Siempre la zona del negocio.** Manda la zona de la profesional, con la de la Ciudad de México
por omisión. Nada usa la zona de la paciente, y es a propósito: la cita ocurre donde está la
profesional.

**El «ahora» lo pone el servidor** (regla 19). Ninguna función recibe la fecha de hoy ni una zona
como parámetro, así que no hay forma de que el modelo se equivoque de día: no tiene con qué.

Las horas se manejan como **hora de pared** —«martes 8, 12:00»— y se convierten a instante absoluto
una sola vez, al apartar la cita.

**La zona va pegada a la lista, cada vez que se listan horas.** Es una marca corta entre
paréntesis, al final del renglón que introduce las horas:

> Para el miércoles 2 de septiembre, en línea, tengo estas horas (Hora CDMX):
>
> 1. 3:00   2. 4:00   3. 5:00
>
> Dime cuál te acomoda.

**Cada vez, no una sola vez.** Antes se decía una sola vez, en el cierre de agendar. Con eso, la
paciente que está en otro huso escoge una hora y se entera del horario **después de que la cita ya
está apartada**: tarde. La marca sirve para leer la lista, no para cerrar la gestión, así que va
donde hay algo que escoger.

**Dónde va.** En toda lista de horas: `horarios_lista`, `horarios_lista_compartida`,
`horario_ocupado` y cuatro de los cinco `sin_hueco_*`. El quinto,
`sin_hueco_dias_que_no_trabaja`, propone días sin horas, así que no lleva marca: no hay ninguna
hora que situar. Al mover una cita las listas son estas mismas, porque las compone
`buscar_horarios`. Y **en ningún cierre**: los cierres de `agendar` ya no llevan la frase «las
horas te las doy en horario de {zona}», porque ahí ya no queda nada que escoger. Los textos están
en `docs/06-textos.md`.

**Es corta a propósito.** El hueco `{zona}` es «Hora CDMX», no «la Ciudad de México»: así cabe al
final del encabezado sin convertir cada respuesta en un formulario. Cuando la ficha tiene otra
zona, es la suya, con la misma forma breve — «Hora Tijuana».

**Y no se escribe a mano, sale de la ficha.** Es la misma regla 2 que gobierna los plazos: un
«Hora CDMX» fijo le miente a la paciente de una profesional que atiende desde otro huso, y le
miente en la dirección peligrosa, porque la hora que lee es la buena y la etiqueta es la falsa.

**Esta parte no hay que construirla: ya está y se comprobó contra la base.** La profesional tiene
su zona en su ficha —hoy las seis en Ciudad de México, que es el valor por omisión—, el motor de
disponibilidad lee esa zona y hace toda la aritmética de días y rangos en ella, y las dos funciones
que arman la fecha y la hora para los mensajes **reciben la zona como parámetro** en vez de
suponerla. El agente sólo tiene que pasar la que le corresponde y pedir la marca corta.

---

## 7. El hueco que se ocupa mientras conversan

**Ofrecer un hueco nunca lo aparta**, y es deliberado: apartar cinco huecos por cada pregunta
llenaría la agenda de fantasmas de gente que nunca contestó.

Así que puede pasar, y ahora pasa más: entre la lista y la escritura hay dos mensajes de ella, el
que escoge la hora y el que dice que sí a la pregunta de `agendar`. Se le ofrecen cinco horas del
martes, mientras lee la profesional aparta las 12:00 desde su app, y ella contesta «las 12».

**Qué pasa por dentro.** Al apartar, el servidor toma el candado de esa agenda y **vuelve a
comprobar, dentro de la misma escritura**, que la hora siga libre: misma profesional, cualquier
cita viva **que no sea la que se mueve** y que se traslape con el rango completo de la sesión. Esa
exclusión es la misma de §5 y tiene que estar en los dos lados; si sólo está en la búsqueda, mover
una cita de las 10:00 a las 10:30 se rechaza por chocar consigo misma. Si ya no está, **no
devuelve un código: vuelve a buscar ahí mismo** y compone el texto `horario_ocupado` con las horas
que quedan de ese mismo día, renumeradas, y `hecho: false`. Una llamada, no dos. No dice «listo»
porque `hecho` es falso, y ésa es toda la regla contra el falso éxito.

Si era la última del día, entonces sí hace falta buscar otra vez, y eso cuesta una llamada más.

**Esto no se inventó aquí.** La web anterior ya lo resolvía así, y conviene copiarlo entero: la
escritura validaba contra la base y, cuando el espacio se había ido, la pantalla no mostraba un
error genérico. **Refrescaba el calendario sola, conservando el día que la paciente ya había
elegido**, y recién entonces le decía lo que había pasado. Veía el problema y la lista ya corregida
en el mismo momento, sin recargar y sin volver a empezar. `horario_ocupado` es ese mismo
comportamiento, en un mensaje en vez de una pantalla.

Dos detalles de allá que se conservan porque cada uno tapa un agujero distinto. **La comprobación
va dentro de la escritura, no antes:** comprobar en un paso y escribir en otro deja una rendija por
la que caben dos citas en la misma hora. Y **debajo hay una segunda red en la base**, que rechaza
el traslape aunque la comprobación fallara; ese rechazo también se traduce a `horario_ocupado`,
nunca a un error crudo.

**Lo único que se gastó es una llamada de las tres de ese mensaje**, un viaje que no escribió nada
y que deja intacta la mutación de ese mensaje. El candado por conversación y el tope por mensaje
están en `docs/07-portero.md`.

---

## 8. Lo que queda abierto

1. **«Está llena» no se ha visto con una agenda apretada de verdad.** Es el único de los cinco
   motivos que depende de lo que pasó en la agenda ese día, y el único que no se ha podido
   comprobar de punta a punta. Hay que volver a medirlo con una agenda llena antes de darlo por
   bueno.
2. **Las alternativas están diseñadas, pero no ejercidas**, por lo mismo: la segunda pasada sólo
   corre cuando la primera sale vacía.
3. **La modalidad cruzada sigue sin decidirse.** «Presencial no tengo mañanas, en línea sí»: hoy la
   búsqueda recibe una modalidad y contesta de esa modalidad. Que un «no trabaja a esa hora» mire
   de reojo la otra cuesta una pasada barata más, que es un milisegundo. Falta decidir si se
   ofrece o si confunde.
4. **Un día que se ofrece y sale vacío al tocarlo** es posible: los candidatos van de quince en
   quince minutos desde la apertura, así que el último puede quedar hasta catorce minutos antes de
   lo que la pasada barata supone. Y el recorte a horas en punto lo hace un poco más probable, no
   menos. Ese día termina en «está llena», que de cara a la paciente es correcto, y no se va a
   arreglar: arreglarlo exige que la pasada barata mida huecos.
5. **La rama del consultorio compartido tampoco se ha ejercido.** El motor la tiene y la búsqueda
   la hereda sin tocarla, pero nadie la ha visto correr.
