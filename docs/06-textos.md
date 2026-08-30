# Los textos

Ésta es la **única fuente** de lo que la paciente lee. Los demás archivos citan por clave —«el
texto `paciente_inactivo`»— y no vuelven a escribir la frase. El conteo de claves también se lleva
aquí y sólo aquí: los demás lo citan.

Dos orígenes y sólo dos. **Los once de prompt viven literales en el prompt**, se rellenan con lo que
el borde ya resolvió del mensaje y cuestan cero llamadas. **Los de las diez funciones los compone el
servidor** y llegan en la clave `texto`; el agente los copia palabra por palabra.

Tres cuidados atraviesan todo lo de aquí. **Nada de género en la paciente:** hay pacientes hombres,
así que ni «activa» ni «activo» aplicados a ella. **Nada de género en la profesional:** se le nombra
por su nombre de pila. **Ningún plazo escrito a mano:** sale de la ficha de cada profesional y viaja
en `{plazo}`, y `{plazo}` sólo aparece en los cuatro avisos de cambio. Sin excepciones: ya no hay
ningún reloj fijo del producto.

---

## 1. Los textos de prompt

Once textos, cero llamadas. Van en el orden en que el prompt los comprueba, y el primero es la
crisis.

### `crisis`

**Cuándo.** Cualquier señal de riesgo para ella o para alguien más. Se comprueba **antes que
cualquier otra cosa, incluido el estado de identidad**, y vale para todos los estados: teléfono
desconocido, cuenta dada de baja, paciente activa, todos. Va sola y no lleva pregunta de cierre.

> Si necesitas ayuda inmediata: Agenda Psi no es un servicio de emergencias. Si tú o alguien más se
> encuentra en peligro, llama al 911. Para recibir apoyo en salud mental, comunícate gratis, las 24
> horas, a Línea de la Vida: 800 911 2000.

**No lo compone nadie:** vive literal en el prompt, sin un solo hueco, y cierra. No tiene huecos a
propósito, así no depende de la red ni del tope de llamadas: ni un límite de tráfico ni una caída
del servidor pueden dejar a alguien sin esta respuesta. Y por eso el borde nunca contesta antes de
correr el modelo: si cortara en la identidad, la crisis de un teléfono desconocido no se detectaría
nunca. Las 24 horas de aquí son el horario de la línea, no un plazo del producto.

### `no_te_reconocemos`

**Cuándo.** El teléfono no tiene vínculo con ninguna profesional. Nunca fue paciente.

> Hola. Este número es el asistente de Agenda Psi, y desde aquí sólo puedo ayudar a pacientes que
> ya están con un psicólogo o psicóloga de la plataforma.
>
> Si estás buscando uno, aquí puedes ver quiénes están disponibles: https://agendapsi.mx

**Compone** el prompt, con cero llamadas; cualquiera de las diez funciones lo devuelve también, por
su cerrojo propio. Cierra. El directorio se ofrece aquí y sólo aquí: quien nunca fue paciente
necesita encontrar a alguien.

### `paciente_inactivo`

**Cuándo.** El teléfono sí tiene vínculo, pero la paciente está dada de baja.

> Por ahora tu cuenta con {profesional} no aparece activa, así que desde aquí no puedo ayudarte con
> tus citas. Escríbele para que te reactive y seguimos por aquí.

**Compone** el prompt, con `{profesional}` y cero llamadas. Cierra. Dice «tu cuenta no aparece
activa» y no «no apareces como paciente activo» porque lo segundo le pone género a quien lee. Y no
manda al directorio: **nunca fue paciente → directorio; fue y ya no → que la reactiven.**

### `con_cual_profesional`

**Cuándo.** El teléfono tiene vínculo con más de una profesional. **Se pregunta antes de nada**, y
de ahí toda la conversación es de esa profesional.

> Estás con más de una persona de Agenda Psi. ¿Con quién es lo que necesitas?
>
> {lista}

**Compone** el prompt, con `{lista}` de nombres de pila numerados. La conversación sigue abierta.
Es lo único que espera el borde por su cuenta, y por eso no entra en los siete valores de `espera`
de las funciones: el borde anota la respuesta en la fila de la conversación y no se vuelve a
preguntar. Nunca se adivina por la última plantilla ni por la cita más próxima: adivinar aquí manda
toda la conversación a la profesional equivocada, y la paciente no tiene forma de darse cuenta a
tiempo.

### `fuera_de_alcance`

**Cuándo.** Reactivar su cuenta, corregir un comprobante ya mandado, pedir que le hagamos llegar un
recado, pedir ayuda del equipo, o recoger materiales. Todo lo que el agente no hace y no es dinero.

> Eso no lo puedo ver desde aquí. Si necesitas ayuda de nuestro equipo, escríbenos por aquí:
> https://wa.me/525564370081
>
> Yo te sigo ayudando con tus citas y los comprobantes.

**Compone** el prompt. No lleva ningún hueco. La conversación sigue abierta. Va sólo el enlace, sin
el número escrito, para que se toque y no se copie, y cierra ofreciendo lo que sí hace: una negativa
a secas deja a la paciente sin siguiente paso. Es también la respuesta a quien contesta la plantilla
de materiales, porque prometer un material que hoy nadie entrega es el falso éxito contra el que
está armado el resto.

### `asunto_de_dinero`

**Cuándo.** Devoluciones, descuentos, condonaciones, «¿ya se aprobó mi pago?».

> Los cobros, los descuentos y las devoluciones los decide {profesional} directamente.
>
> Yo te ayudo con tus citas y los comprobantes.

**Compone** el prompt, con `{profesional}` una sola vez. La conversación sigue abierta. No se usa
para «¿cuánto le debo?»: eso tiene datos detrás y lo contesta `mis_citas`. Tampoco para «ya te mandé
el comprobante, ¿ya quedó?», que lo contesta `mandar_comprobante`.

### `no_entendi`

**Cuándo.** El mensaje es genuinamente ininteligible. **No** es para un saludo ni para «¿qué
tengo?»: eso es `mis_citas`. Es también el desenlace de un número suelto sin nada pendiente —«la 2»
al día siguiente, cuando la fila de la conversación ya caducó—, y el de un audio, un video, un
sticker o cualquier otro archivo que no sea imagen o PDF.

> No te entendí. Por aquí te puedo ayudar con tus citas —{verbos}— y con lo de tus pagos. ¿Qué
> necesitas?

**Compone** el prompt, con `{verbos}` del sobre. La conversación sigue abierta. Los verbos salen del
menú personalizado: si esa profesional no permite cambios de modalidad, no se menciona. Ejemplo de
`{verbos}`: «agendar, mover, cancelar o confirmar». Ante un número suelto sin lista viva **no se
adivina de qué lista era**: se contesta esto y ella lo vuelve a decir con palabras.

### `se_acabo_el_espacio`

**Cuándo.** Se acabaron las **tres llamadas de este mensaje** —el tope cuenta cada intento,
incluidos los que el borde rechaza por malformados—, o se agotó el presupuesto de tiempo del
mensaje.

> Se me acabó el espacio de esta consulta. Escríbeme otra vez y seguimos justo desde donde nos
> quedamos.

**Lo compone el borde**, no el modelo, y cierra. Vive fuera de las funciones porque cuando hace
falta ya no queda ninguna llamada disponible: una herramienta que sólo se puede usar cuando no se
puede usar ninguna es una herramienta rota. Si el modelo escribe otra cosa en su lugar, el borde la
sustituye por este texto. Y dice la verdad: la fila de la conversación guarda qué se preguntó y qué
opciones se ofrecieron, así que el mensaje siguiente sí retoma donde se quedó.

**Antes de mandarlo por una llamada que escribe y no contestó**, el borde relee el estado y responde
con lo que encuentre. Si la cita quedó creada y ella lee «se me acabó el espacio», su siguiente «sí»
acaba en dos citas.

### `pendiente_lo_otro`

**Cuándo.** En un mismo lote pidió dos cosas —«cancélame la del martes y agéndame una para el
jueves»— y sólo se atendió la primera. No le recuerda qué quedó pendiente: le abre la puerta para
que lo vuelva a pedir, que es lo mismo y suena a servicio en vez de a trámite.

> ¿Y en qué más te puedo ayudar?

**Compone** el prompt. No lleva huecos. Se pega **al final** del texto que ya devolvió la función, y
es la **única excepción** a la regla de copiar el texto sin agregar nada antes ni después. Se
escribe aquí como excepción justo para que no se lea como permiso general.

### `resena_pide_calificacion`

**Cuándo.** Dejó un comentario y no dijo estrellas.

> Gracias por escribirlo. ¿Cuántas estrellas le pones, del 1 al 5?

### `resena_pide_comentario`

**Cuándo.** Dijo estrellas y no dejó comentario.

> Gracias. ¿Quieres agregar un comentario para su perfil? Si no, así la dejo.

**Componen** el prompt las dos. No llevan ni un dato adentro, así que no son resultados de
`dejar_resena` y no gastan llamada. Se pregunta una vez y no se insiste.

---

## 2. Los textos de las diez funciones

En el orden del catálogo. El servidor los compone enteros; el agente sólo escoge a cuál función
llamar.

### 2.0 Los huecos

| Hueco | Qué mete el servidor |
|---|---|
| `{paciente}` · `{profesional}` | Nombre de pila |
| `{servicio}` · `{duracion}` | «Psicoterapia individual» · «50 minutos» |
| `{monto}` | El precio efectivo, preferente si lo tiene: «$800» |
| `{dia}` · `{hora}` | «miércoles 2 de septiembre» · «4:00» |
| `{modalidad}` | «presencial» o «en línea», ya en español |
| `{plazo}` | El plazo de esa ficha: «24 horas», «12 horas» |
| `{ritmo}` · `{parte_del_dia}` | «cada semana» · «mañana», «mediodía», «tarde», «noche» |
| `{zona}` | La marca corta de la zona **de esa profesional**, de su ficha: «Hora CDMX», «Hora Tijuana» |
| `{lista}` | Las opciones numeradas, máximo cinco —hasta ocho sólo en la lista de servicios—, con su etiqueta ya escrita |
| `{verbos}` | Sólo lo que esa profesional permite |
| `{como_pagar}` | Cómo transferir, en una de dos frases fijas |
| `{banco}` · `{titular}` · `{clabe}` | Los datos de transferencia del perfil, sólo dentro de `{como_pagar}` |
| `{direccion}` | Dónde es |

### 2.0.1 La marca de zona horaria la pone el servidor, no el texto

**Todo mensaje que diga una hora lleva su zona.** Son veintiséis textos y ninguno la trae escrita
adentro: la pone el servidor al componer, con una sola regla, para que no haya que acordarse
veintiséis veces.

**En las listas de horas va en el encabezado**, entre paréntesis, pegada a donde se leen las horas:

> Para el {dia}, {modalidad}, tengo estas horas ({zona}):

**En cualquier otro mensaje con hora va como última línea**, sola:

> Listo, {paciente}. Aparté tu {servicio} del {dia} a las {hora}, {modalidad}.
>
> {zona}

**Y no va en ningún mensaje sin hora.** Un «no tengo ninguna cita tuya por cancelar» no lleva
marca: no hay ninguna hora que situar.

La zona sale de la ficha de la profesional, nunca escrita a mano — es la regla 2, la misma de los
plazos. **La cita ocurre donde está ella**, así que su hora es la que manda, y la marca existe
justo para que la paciente que vive en otro huso no tenga que adivinarlo. Los avisos automáticos y
la app de la profesional usan esa misma zona, así que todo lo que ella lee coincide.

---

`{como_pagar}` tiene **exactamente dos valores**, y los escoge el servidor según el perfil:

- Con datos de transferencia guardados: «Transfiere a {banco}, a nombre de {titular}, CLABE
  {clabe}, y mándame el comprobante por aquí.»
- Sin datos guardados: «Pídele los datos para la transferencia y mándame el comprobante por aquí.»

La segunda no repite el nombre de la profesional porque el texto que la recibe ya lo dijo.

Ninguno de los huecos lo rellena el modelo: llegan ya escritos dentro de `texto`. La tabla existe
para leer las plantillas de abajo, no para componerlas a mano. **No hay hueco de liga:** la liga de
la sesión en línea se manda en el aviso de una hora antes y en ningún otro lado.

### 2.1 `ver_servicios`

Varios servicios, `espera: "servicio"`. La pregunta de días va en el mismo mensaje para no gastar
un viaje:

**`servicios_varios`**

> Hola {paciente}. Con gusto te agendo con {profesional}. Sus servicios son:
>
> {lista}
>
> Dime cuál te interesa, qué días te quedan mejor y a qué hora.

Cada renglón de `{lista}` es `{servicio} · {duracion} · {monto}`. **Ésta es la única lista que puede
pasar de cinco renglones: llega hasta ocho.** El catálogo es corto, estable y no caduca como una
lista de horas. Con más de ocho servicios se muestran ocho y se le pide que diga cuál busca.

Con un solo servicio se dice cuál es y se pasa directo a los filtros, `espera: "filtros"`:

**`servicios_uno`**

> Hola {paciente}. Con gusto te agendo con {profesional}. {servicio}, {duracion}, {monto}. ¿Qué
> días te quedan mejor y a qué hora?

Este mismo texto es el que sale cuando **pide por su nombre un servicio que sí tiene**: se le
confirma cuál es y se le preguntan los filtros. Preguntarle «¿cuál te interesa?» después de que lo
acaba de decir es hacerle repetir.

El aviso de recurrencia va **antes** de todo lo demás y se lleva la pregunta:

**`aviso_recurrencia`**

> Ya tienes {servicio} {ritmo}, los {dia} a las {hora}, y tu próxima es el {dia} a las {hora}.
> ¿Quieres agendar otra sesión aparte de ésa?

`espera: "confirmado"`. Es el único aviso previo que queda al agendar: quien tiene una cita suelta y
pide otra no recibe aviso, porque el cierre le nombra servicio, día y hora, y `mis_citas` se lo
enseña cuando quiera.

Si pidió por su nombre un servicio que su profesional sí tiene pero a ella no le está asignado:

**`servicio_no_asignado`**

> Ese servicio no lo tienes asignado, así que desde aquí no te lo puedo agendar. Pídele a
> {profesional} que te lo habilite y con gusto te lo agendo.

Y si pidió uno que su profesional **no ofrece en absoluto**:

**`servicio_no_existe`**

> Ese servicio no está entre los de {profesional}. Sus servicios son:
>
> {lista}
>
> ¿Te agendo alguno?

`espera: "servicio"`. Son dos textos y no uno porque prometen cosas distintas: uno se arregla
pidiéndole a la profesional que lo habilite, y el otro no se arregla de ninguna manera. Decirle
«pídele que te lo habilite» de algo que no existe es mandarla a una conversación que no lleva a
nada.

El nombre libre se empareja **sin acentos y sin mayúsculas, contra el nombre completo del servicio y
contra cada palabra suya de tres letras o más**. Si empareja con más de uno, no se adivina: sale
`servicios_varios` con la lista.

La lista es la que le toca: sus servicios asignados si tiene alguno, y el catálogo completo de su
profesional si no tiene ninguno.

Si la profesional no tiene horarios abiertos, devuelve `sin_horarios` y ahí termina:

**`sin_horarios`**

> Ahorita {profesional} no tiene horarios abiertos para las próximas semanas. Escríbele directamente
> para que te dé un espacio.

**Cuándo.** La profesional no tiene ni un bloque de horario guardado, o tiene apagado el agendado
por parte de la paciente. Lo devuelve `ver_servicios`, y `buscar_horarios` si se llega ahí. La
conversación sigue abierta. Dice «las próximas semanas» y no «los próximos 30 días»: decir el
horizonte en días invita a preguntar por el día 31.

### 2.2 `buscar_horarios`

Hasta cinco opciones, cada una con día y hora, `espera: "opcion"`. **El encabezado lleva la marca de
zona horaria**, aquí y en toda lista de horas:

**`horarios_lista`**

> Para el {dia}, {modalidad}, tengo estas horas ({zona}):
>
> {lista}
>
> Dime cuál te acomoda.

Ejemplo: «Para el miércoles 2 de septiembre, en línea, tengo estas horas (Hora CDMX):».

La marca va **pegada a la lista, cada vez**, y no una sola vez al cerrar. Si se dice sólo al final,
ella escoge una hora y se entera del huso cuando la cita ya está apartada. Es corta a propósito:
cuatro palabras entre paréntesis no estorban y contestan la duda antes de que la tenga.

No dice «y te la aparto» porque todavía no se aparta nada: antes de crear la cita se pregunta otra
vez, y ese texto es de `agendar`.

Cuando dos días traen exactamente las mismas horas se dicen **una sola vez**. No se dice «te pongo
las del martes», porque son las mismas horas de los dos días:

**`horarios_lista_compartida`**

> El {dia} y el {dia} tengo estas horas ({zona}):
>
> {lista}
>
> Dime la hora y en cuál de los dos días.

`espera: "opcion"`. El número identifica la hora pero no el día, y por eso ésta es la única lista
tras la cual `agendar` recibe también el parámetro `dia`. Al escoger la hora siempre se sabe el día:
o lo dice ella aquí, o ya venía determinado porque dijo día y hora juntos desde el principio, y
entonces no se vuelve a preguntar.

Cuando no hay ninguna, el texto es uno de los cinco motivos de la sección 3. **Nunca una lista
vacía y nunca «no hay nada».**

**`horarios_falta_modalidad`** — el servicio admite las dos y ella no dijo cuál. `espera: "modalidad"`.

> Ese lo puedes tomar presencial o en línea. ¿Cómo lo prefieres?

Es el único origen de ese valor al agendar: si `ver_servicios` ya lo había resuelto porque el
servicio admite una sola modalidad, esta rama no ocurre.

**`modalidad_no_disponible_en_servicio`** — pidió una modalidad que ese servicio no admite. `espera: "modalidad"`.

> {servicio} sólo se da {modalidad}. ¿Te busco día así, o prefieres otro servicio?

Se comprueba **antes que los cinco motivos**, porque no depende de la agenda. Sin esta rama, pedir
«en línea» de un servicio que sólo es presencial sale por «no hay consulta esos días», que es falso
y la manda a buscar otro día cuando lo que hay que cambiar es la modalidad.

**`fuera_del_horizonte`** — pidió una fecha más allá de lo que se alcanza a ver. `espera: "filtros"`.

> Hasta esa fecha todavía no alcanzo a ver la agenda. Puedo buscarte algo dentro de las próximas
> semanas. ¿Te busco día?

Tampoco aquí se dice el horizonte en días, por lo mismo que en `sin_horarios`. Una fecha sin año se
resuelve siempre **hacia adelante**: «el 20 de agosto» dicho un 27 de agosto es el 20 de septiembre,
y la etiqueta del día con su mes es la única corrección que hace falta.

### 2.3 `agendar`

**Escoger no aparta.** Antes de crear nada se pregunta, y hasta que dice que sí se aparta.
`espera: "confirmado"`:

**`agendar_pregunta_confirmar`**

> ¿Aparto tu cita del {dia} a las {hora}, {modalidad}?

Cuesta un mensaje y evita el error caro: un «la 3» mal entendido crea una cita real que después hay
que cancelar, con su aviso a la profesional y su hueco bloqueado mientras tanto.

Si dice que no, `hecho: false` y cierra:

**`agendar_no_aparta`**

> Va, no la aparto. Cuando quieras, dime qué días te quedan mejor y te busco.

Cobra después: servicio, día, hora, modalidad y profesional, y **ni una palabra de pago**.

**`agendar_cierre_cobra_despues`**

> Listo, {paciente}. Aparté tu {servicio} del {dia} a las {hora}, {modalidad}, con {profesional}.

Si esa cita cae dentro de la ventana del aviso automático, **nace confirmada** y el cierre es el
mismo: no se le pide confirmar algo que ya quedó confirmado, y tampoco se le anuncia el mecanismo.

Cobra por adelantado, **siempre**, falte lo que falte para la sesión:

**`agendar_cierre_prepago`**

> Listo, {paciente}. Aparté tu {servicio} del {dia} a las {hora}, {modalidad}, con {profesional}.
> Son {monto}, y para confirmarla necesito tu comprobante.
>
> {como_pagar}

Lo que confirma esta cita es el comprobante, no el reloj: por eso se pide igual a treinta días que a
tres horas. Lo único que cambia dentro de la ventana del aviso es que **no se le encola el
recordatorio**, para que no reciba por plantilla lo que acaba de leer aquí.

**Los dos cierres llevan la marca de zona horaria** como última línea, igual que todo mensaje que
diga una hora (§2.0.1). Y **ninguno pone plazo al comprobante ni amenaza con cancelar.** Nada cancela citas solo:
la cita queda apartada y sin confirmar, con el comprobante pedido, y ahí se queda hasta que llegue.
La profesional ve en su app que se pidió y no ha llegado. El monto se dice en la de prepago y no en
la de cobro después: donde hay que transferir, callar la cantidad sería inútil.

Al apartar se valida que el hueco siga libre. Si se ocupó mientras conversaban, `hecho: false` y las
alternativas del mismo día, renumeradas por dentro. Se dice siempre, nunca se calla:

**`horario_ocupado`**

> Se acaba de ocupar esa hora. Ese mismo día tengo estas horas ({zona}):
>
> {lista}
>
> ¿Te sirve alguna, o te busco otra fecha?

`espera: "opcion"`. Lo devuelve también `reprogramar` cuando la carrera se pierde al mover.

### 2.4 `confirmar`

Cobra después: confirma y cierra.

**`confirmar_cierre`**

> Listo, tu cita del {dia} a las {hora} quedó confirmada.

Si tenía varias esperando y contestó «ambas», se confirman las dos de una vez, en una sola llamada
y una sola transacción:

**`confirmar_cierre_ambas`**

> Listo, tus citas del {dia} y del {dia} quedaron confirmadas.

Cobra por adelantado: **decir «sí voy» no confirma**, así que no muta y pide el archivo.

**`comprobante_pedido`**

> Tu cita del {dia} a las {hora} se confirma con tu comprobante.
>
> {como_pagar}

Tampoco pone plazo, por lo mismo: no hay reloj que cumplir. Si ella ya mandó su comprobante, no se
le pide de nuevo y «sí voy» confirma normal.

Con varias esperando confirmación, `espera: "citas"` —en plural, porque puede contestar «ambas»—:

**`confirmar_lista`**

> ¿Cuál me confirmas?
>
> {lista}

Se pregunta siempre que haya más de una. Nunca se asume por la última plantilla ni por la más
próxima.

**`confirmar_nada_que_confirmar`** — ninguna cita esperando confirmación. Cierra.

> No tengo ninguna cita tuya esperando confirmación. Tu próxima es el {dia} a las {hora}, y ya está
> confirmada.

Cubre también el caso de la cita que ya estaba confirmada: una cita confirmada no entra en las
candidatas, así que no hace falta un texto aparte para decírselo.

### 2.5 `reprogramar`

**Dos cosas distintas, que hay que decir por separado.** El aviso de cambio no bloquea: mover se
puede aunque falten horas, y el plazo sólo decide si se cobran las dos sesiones. Lo que sí corta es
**la anticipación mínima de la ficha**, que decide desde cuándo se puede tomar un horario nuevo, y
vale igual al agendar que al mover.

Las dos pueden aparecer en la misma gestión: primero el aviso de que se cobran las dos sesiones, y
después una lista que empieza en el primer día que la anticipación permite. No es un error: son dos
números distintos de la misma ficha, y cada uno contesta una pregunta distinta.

Primera llamada, a tiempo, `espera: "filtros"`:

**`reprogramar_pregunta_dia`**

> Va, muevo tu cita del {dia} a las {hora}. ¿Qué días te quedan mejor y a qué hora?
>
> Tu cita nueva la puedes tomar presencial o en línea, dime también cómo la prefieres.

El segundo párrafo es **condicional**: va sólo cuando el servicio admite las dos modalidades. La
modalidad sí se vuelve a preguntar, porque puede querer cambiarla en la cita nueva; el servicio no,
que viene de la cita que se mueve. Van en el mismo mensaje y con una sola `espera` porque un mensaje
no puede esperar dos datos distintos a la vez: la respuesta trae los filtros y, si se preguntó, la
modalidad adentro.

Primera llamada, sin tiempo mínimo de aviso, `espera: "confirmado"`:

**`reprogramar_aviso_tardio`**

> Perfecto, te ayudo a reprogramarla. Sólo te aviso antes: {profesional} pide {plazo} de aviso para
> cambios y ya faltan menos, así que se cobran las dos sesiones — la del {dia} y la nueva.
>
> ¿La movemos?

Es un aviso, no una negativa: diga lo que diga el reloj, si ella dice que sí, se mueve. Se da
siempre que haya algo que cobrar, aunque todavía no haya pagado nada: es lo único que hace que el
plazo signifique algo para quien cobra al cerrar. Con precio efectivo cero no se menciona dinero.

Si dice que no, `hecho: false` y cierra:

**`reprogramar_no_mueve`**

> Va, la dejo como está: tu cita del {dia} a las {hora} sigue en pie.

Con varias candidatas, `espera: "cita"`:

**`reprogramar_lista`**

> ¿Cuál quieres mover?
>
> {lista}

El cierre normal, que **no repite el aviso de cobro** porque ya se dio antes de mover:

**`reprogramar_cierre`**

> Listo, moví tu cita al {dia} a las {hora}, {modalidad}.

Ejemplo: «Listo, moví tu cita al miércoles 2 de septiembre a las 4:00, presencial.»

Sale cuando a ella no le queda nada por pagar: cobra después, o el precio es cero, o se movió con
tiempo mínimo y el cobro nuevo heredó lo que traía el viejo. **Con tiempo mínimo, si ya había
comprobante, se copia y no se le vuelve a pedir**; si estaba acreditado, nace acreditado.

El otro cierre, cuando la cita nueva nace con un cobro que necesita comprobante:

**`reprogramar_cierre_prepago`**

> Listo, moví tu cita al {dia} a las {hora}, {modalidad}. Son {monto}, y para confirmarla necesito
> tu comprobante.
>
> {como_pagar}

Sale en dos casos, y hay que decir por qué en cada uno. **Sin tiempo mínimo**, el cobro viejo se
queda congelado en la cita de origen y el nuevo nace desde cero: por eso se cobran las dos sesiones,
y por eso el aviso va antes de mover y no después. **Con tiempo mínimo**, cuando el cobro viejo
estaba pendiente y sin archivo y su profesional cobra por adelantado: no hay nada que heredar, así
que la petición se vuelve a sellar sobre el cobro nuevo.

El caso duro se dice en voz alta: **si cobra por adelantado, ella ya mandó comprobante, y mueve sin
tiempo mínimo, su comprobante se queda en la cita vieja y la nueva le pide otro.** Va a pagar dos
veces salvo que su profesional condone la primera. Eso es exactamente lo que significa «se cobran
las dos sesiones», y es la razón de que se avise antes.

Cuando la cita que se mueve es de una serie, hay una segunda salida: no buscar día nuevo, sino
juntarla con la próxima ocurrencia viva de esa serie. `espera: null`, `cierra: false` —la respuesta
puede ser cualquiera de las dos y las dos llaman a `reprogramar`, así que la salida queda abierta y
no se declara ningún parámetro—:

**`reprogramar_recurrencia_dos_salidas`**

> Esa cita es de tus sesiones {ritmo}. Te busco otro día, o te la paso a tu próxima del {dia} a las
> {hora} y cancelo ésta. ¿Cuál prefieres?

Se ofrece con pago o sin él, y no pasa por ninguna función de dinero: consolidar la serie es una
salida de `reprogramar`. Si no hay pago, cierra igual, sin la frase del dinero.

El cierre de esa segunda salida, con tiempo mínimo:

**`reprogramar_pasada_a_la_proxima`**

> Listo, cancelé tu cita del {dia}. Tu próxima sigue en pie, el {dia} a las {hora}, y tu pago quedó
> ahí.

Y el gemelo sin tiempo mínimo, **sin la frase del pago mudado**, porque sin tiempo mínimo el pago no
viaja:

**`reprogramar_pasada_a_la_proxima_tarde`**

> Listo, cancelé tu cita del {dia}. Tu próxima sigue en pie, el {dia} a las {hora}.

La última frase del primero sólo va cuando esa cita traía pago. En los dos, la vieja queda
**cancelada**, no reprogramada, y la ocurrencia que ya existía no se toca: es la única forma de que
la serie no acabe con dos citas donde había una. Pasar el pago a una ocurrencia que ya existe **no
toca la anticipación mínima**, porque ahí no se está tomando un horario nuevo.

**`reprogramar_nada_que_mover`** — sin ninguna cita futura que mover. Cierra.

> No tengo ninguna cita tuya por mover. Si quieres agendar una, dime qué días te quedan mejor.

**`reprogramar_solo_la_proxima`** — de una serie sólo se mueve la más próxima, y ella pidió otra.
`espera: "confirmado"`.

> De tus sesiones {ritmo} sólo puedo mover la más próxima, la del {dia} a las {hora}. Las de después
> las ajusta {profesional} desde su app. ¿Muevo ésa?

Si la carrera se pierde al apartar, devuelve `horario_ocupado`. Si la cita de origen dejó de estar
donde estaba, los tres textos de la sección 4.3.

### 2.6 `cancelar`

**Cancelar no se bloquea nunca**, con dinero adentro o sin él. La anticipación mínima no entra
aquí: cancelar no toma ningún horario. El plazo de aviso sólo decide si hay cargo.

El cierre es **uno solo**, y el servidor le pega al final la coletilla que corresponda:

**`cancelar_cierre`**

> Listo, cancelé tu cita del {dia} a las {hora}.

Las cuatro coletillas, y las escoge el resultado, no lo que el modelo crea que pasó:

| Cómo quedó | Qué se pega al final |
|---|---|
| A tiempo y sin cobro | «No te queda ningún cobro pendiente por ella.» |
| Sin tiempo mínimo | no usa esta clave: usa `cancelar_dinero_adentro_tarde`, que dice el cargo dentro del mismo cierre |
| Con dinero adentro y sin pasarlo | «Tu pago queda registrado y {profesional} lo resuelve contigo.» |
| Con el pago pasado a su próxima | «Tu pago quedó en tu sesión del {dia} a las {hora}.» — y «Tu comprobante quedó…» si lo que viajó fue el comprobante |

Es una sola clave y no tres porque la frase que cambia es la última: tres plantillas enteras para
una coletilla obligan a mantener la misma primera línea en tres sitios. Y desde que la cita con
dinero adentro sí se cancela, el cierre con el pago abierto dejó de ser una negativa: es el cierre
normal.

Sin dinero adentro y tarde se avisa antes, `espera: "confirmado"`:

**`cancelar_aviso_tardio`**

> Te la cancelo, pero antes te aviso: {profesional} pide {plazo} de aviso y ya faltan menos, así
> que la sesión se te cobra. ¿La cancelo de todos modos?

Con precio efectivo cero no se menciona dinero, aquí ni en el aviso de `reprogramar`: decirle «se te
cobra» de una sesión de cero pesos es mentirle en la otra dirección.

Si dice que no, `hecho: false` y cierra:

**`cancelar_no_cancela`**

> Va, no la cancelo: tu cita del {dia} a las {hora} sigue en pie.

Con varias candidatas, `espera: "cita"`:

**`cancelar_lista`**

> ¿Cuál te cancelo?
>
> {lista}

Con cero, se dice con una salida. Nunca un error:

**`cancelar_nada_que_cancelar`**

> No tengo ninguna cita tuya por cancelar. Si quieres agendar una, dime qué días te quedan mejor.

Los textos de la cita con dinero adentro están en la sección 4.2, y los de la cita que dejó de estar
donde estaba en la 4.3.

### 2.7 `cambiar_modalidad`

Es el único cambio que **sí sigue bloqueado por el plazo**: la profesional necesita saber con tiempo
si va al consultorio.

Las candidatas son las citas **vivas, en el futuro, de un servicio que admite las dos
modalidades**. Ésas son las dos únicas condiciones que filtran. El permiso de esa profesional y la
anticipación **no filtran: deciden el texto**, que es para lo que existen. Si filtraran, una cita a
la que le falta el tiempo saldría por «no tengo ninguna cita a la que le pueda cambiar la
modalidad», cuando lo que pasó es que llegó tarde.

La propuesta, con la dirección del cambio, `espera: "confirmado"`:

**`modalidad_propuesta`**

> Sí. Tu cita del {dia} a las {hora} pasaría de {modalidad} a {modalidad}. ¿La cambio?

El cierre:

**`modalidad_cierre`**

> Listo, tu cita del {dia} a las {hora} queda {modalidad}.

Si dice que no, `hecho: false` y cierra:

**`modalidad_no_cambia`**

> Va, la dejo como está: tu cita del {dia} se queda {modalidad}.

Con varias, cada renglón con su modalidad actual y **sin dar por hecho a cuál dirección**,
`espera: "cita"`:

**`modalidad_lista`**

> ¿De cuál cita quieres cambiar la modalidad?
>
> {lista}

Ejemplo de `{lista}`, con datos inventados: «1. Jueves 27, 5:00 p.m. — presencial / 2. Sábado 29,
11:00 a.m. — en línea».

**`modalidad_nada_que_cambiar`** — ninguna cita viva y futura de un servicio con dos modalidades. Cierra.

> Ahorita no tengo ninguna cita tuya a la que le pueda cambiar la modalidad.

Las dos negativas por plazo y por permiso están en la sección 4.1. **Cambiar la modalidad no toca
dinero nunca.**

### 2.8 `mandar_comprobante`

**Siempre se pregunta antes de guardar**, aunque haya un solo cobro esperando y aunque la plantilla
nombre la cita. La base admite un comprobante por cobro para siempre y no hay pantalla para
reemplazarlo: una foto equivocada queda pegada.

Las candidatas son **cobros, no citas**: todo cobro suyo pendiente y sin archivo pegado, sin
importar el estado de la cita —cancelada, reprogramada o pasada—, más el de su próxima cita futura;
de una serie, sólo el de la ocurrencia más próxima. Por eso funciona el comprobante de una
cancelación tardía, que es el único camino que hay para cobrarla.

Una sola candidata, `espera: "confirmado"`:

**`comprobante_pregunta_una`**

> ¿Es el comprobante de tu cita del {dia}?

El cobro se identifica por **fecha**. La hora se agrega sólo cuando hay dos o más cobros del mismo
día, que es el único caso en que la fecha sola no alcanza.

Varias, con fecha y monto, la más antigua primero, `espera: "cita"`:

**`comprobante_lista`**

> ¿De cuál de estas es tu comprobante?
>
> {lista}

Si en un mismo lote llegaron varias imágenes, `espera: "confirmado"`:

**`comprobante_varias_imagenes`**

> Me llegaron varias imágenes. Me quedo con la última. ¿Es el comprobante de tu cita del {dia}?

Se toma **la última** y se dice cuál. La fila de la conversación guarda de qué archivo se preguntó,
y si llega uno nuevo antes de que ella conteste, la pregunta se rehace sobre el nuevo: sin eso, el
«sí» de ella pegaría una foto que no es la que acaba de mandar.

El acuse de una cita futura:

**`comprobante_acuse`**

> Listo, recibí tu comprobante. Tu cita del {dia} a las {hora} ya quedó confirmada.

Ejemplo: «Listo, recibí tu comprobante. Tu cita del miércoles 2 a las 12:00 ya quedó confirmada.»

El acuse de una sesión que ya pasó, que no confirma nada:

**`comprobante_acuse_sesion_pasada`**

> Listo, recibí tu comprobante de tu sesión del {dia}. Ya se lo hice llegar a {profesional}.

Sin ningún cobro esperando:

**`comprobante_nada_esperando`**

> No tengo ningún cobro tuyo esperando comprobante. Si es de algo que {profesional} te pidió aparte,
> mándaselo directo.

**`comprobante_ya_hay_uno`** — ese cobro ya tiene comprobante. Cierra, y no se ofrece reemplazarlo
porque no se puede.

> Ese cobro ya tiene su comprobante, así que no le puedo pegar otro. Si algo no cuadra, coméntaselo
> a {profesional}.

**`comprobante_sin_archivo`** — dijo que mandaba el comprobante pero no vino archivo.

> No me llegó ninguna imagen. Mándame la foto o el PDF del comprobante por aquí.

**Nunca «pagado» ni «aprobado»:** el agente pega el archivo y el cobro sigue pendiente. **El agente
no acredita nunca.** Y recibir comprobantes vale para todas las profesionales, cobren antes o
después de la sesión; lo que sólo aplica al cobro por adelantado es pedir el pago al agendar.

### 2.9 `dejar_resena`

Sólo dos textos: los dos que llevan datos. Las dos preguntas que faltan viven en el prompt y cuestan
cero llamadas.

**`resena_gracias`**

> Listo, te agradecemos mucho que compartieras esto. Tu nombre queda anónimo: en su perfil sólo se
> muestran tus iniciales.
>
> Nos ayuda a que más personas encuentren en el directorio a quien las acompañe.

**Nunca promete publicación:** ninguna función escribe la moderación y una persona la revisa antes.

**`resena_ya_enviada`** — ya había dejado una. Cierra.

> Ya tenemos tu reseña de {profesional}, y te lo agradecemos mucho. Si quieres cambiarla,
> coméntaselo.

### 2.10 `mis_citas`

Cubre las tres preguntas de la misma familia: qué citas tengo, dónde es, y cuánto debo.

Con varias citas:

**`mis_citas_lista`**

> Tienes esto con {profesional}:
>
> {lista}
>
> ¿Qué necesitas? Te las puedo {verbos}.

Con una sola, se nombra y se ofrece de una:

**`mis_citas_una`**

> Hola {paciente}. Sobre tu cita del {dia} a las {hora}: te la puedo {verbos}. ¿Cuál prefieres?

Ejemplo, con nombre inventado: «Hola Emilio. Sobre tu cita del miércoles 2 a las 4:00: te la puedo
mover, o cancelarla. ¿Cuál prefieres?»

Dónde es, presencial y en línea:

**`mis_citas_donde_presencial`**

> Tu cita del {dia} a las {hora} es presencial. La dirección es {direccion}.

Cuando no hay dirección guardada, el servidor cambia **sólo la segunda frase** por «La dirección te
la comparte {profesional} directamente». La primera se queda siempre: sin ella, la versión sin
dirección perdía el día, la hora y el dato de que es presencial.

**`mis_citas_donde_en_linea`**

> Tu cita del {dia} a las {hora} es en línea. La liga te llega una hora antes.

**La liga no se manda aquí.** Sale una sola vez, en el aviso de una hora antes, para que ella la
tenga a la mano cuando la necesita y no la busque tres días atrás en la conversación.

Cuánto debe:

**`mis_citas_adeudos`**

> De lo que tienes con {profesional}, esto está pendiente de pago:
>
> {lista}
>
> Cuando lo transfieras, mándame el comprobante por aquí.

**`mis_citas_sin_adeudos`**

> No tienes ningún pago pendiente con {profesional}.

Sin ninguna cita:

**`mis_citas_sin_citas`**

> Ahorita no tienes ninguna cita con {profesional}. ¿Te busco día para una?

---

## 3. Los cinco motivos de que no haya horarios

Los devuelve `buscar_horarios` ya redactados, y **cada uno con alternativas numeradas de verdad**.
La diferencia entre contestar «lo más cercano es el 17» y contestar «el 17 te tengo a las 9, a las
10 o a la 1» es una llamada y un mensaje: un motivo sin alternativas obliga a volver a preguntar.

**En ninguno se nombra a la profesional.** Está mal escribir «Fulana necesita 48 horas, ya no
alcanzo»: convierte un hueco de agenda en un reproche a quien la atiende. Se dice lo que hay y lo
que sí se puede.

**La `espera` no es la misma en los cinco**, y de eso depende dónde aterriza el «la 2» siguiente:

| Motivo | Qué trae la lista | `espera` |
|---|---|---|
| `sin_hueco_fuera_de_horario` | Horas apartables de ese día | `opcion` |
| `sin_hueco_dias_que_no_trabaja` | Otros días, sin hora | `filtros` |
| `sin_hueco_ausencia` | Horas apartables del día más cercano | `opcion` |
| `sin_hueco_lleno` | Horas apartables, cada renglón con su día | `opcion` |
| `sin_hueco_demasiado_pronto` | Horas apartables del día más cercano | `opcion` |

Cuatro de los cinco ofrecen horas que se pueden apartar, así que el número siguiente va a
`agendar`. Sólo el de los días que no trabaja propone otra ventana, y ése sí espera filtros. Declarar
`filtros` en los cinco atoraba la conversación justo cuando ella ya había escogido, y es la salida
más frecuente de agendar con la agenda apretada.

**No hay consulta a esa hora.**

**`sin_hueco_fuera_de_horario`**

> Por la {parte_del_dia} no hay consultas. El horario es de {hora} a {hora}, y para el {dia} tengo
> estas horas ({zona}):
>
> {lista}
>
> ¿Te sirve alguno, o te busco otra fecha?

**No hay consulta esos días.**

**`sin_hueco_dias_que_no_trabaja`**

> Los {dia} y los {dia} no hay consultas. Los días más próximos que sí tengo son estos:
>
> {lista}
>
> ¿Te sirve alguno, o te busco otra fecha?

Éste es el único de los cinco cuya lista no lleva horas, y por eso el único sin marca de zona: no
hay ninguna hora que situar.

**Esos días concretos no va a haber.**

**`sin_hueco_ausencia`**

> El {dia} y el {dia} no hay consultas. Lo más cercano es el {dia}, y ahí tengo estas horas
> ({zona}):
>
> {lista}
>
> ¿Te sirve alguno, o te busco otra fecha?

**Sí hay consulta, pero está llena.** Éste ofrece **dos caminos**, no uno: la misma hora en otros
días, y otras horas en el mismo día.

**`sin_hueco_lleno`**

> Para esos días ya no tengo espacio a esa hora. Esa misma hora la tengo el {dia}, y ese mismo día
> tengo otras horas ({zona}):
>
> {lista}
>
> ¿Te sirve alguno, o te busco otra fecha?

La `{lista}` mezcla las dos salidas, y por eso cada renglón lleva día y hora. Ofrecer una sola la
manda a preguntar otra vez por la que no se le ofreció.

**Es demasiado pronto.**

**`sin_hueco_demasiado_pronto`**

> Para el {dia} ya no alcanzo. Lo más cercano es el {dia}, y ahí tengo estas horas ({zona}):
>
> {lista}
>
> ¿Te sirve alguno, o te busco otra fecha?

**No dice cuánta anticipación pide la profesional.** Dice cuál sería la cita más próxima posible y
ofrece la salida, que es lo único que ella puede usar. El número es política de quien la atiende, y
ponerlo aquí convierte un hueco de agenda en un reproche, igual que nombrarla.

Este motivo sale **igual al agendar y al reprogramar**: la anticipación mínima decide desde cuándo
se puede tomar un horario, y mover una cita también toma uno. El sexto caso —que la profesional no
tenga ni un bloque de horario guardado— no es un motivo: es el texto `sin_horarios`.

---

## 4. Las negativas de modalidad, el dinero adentro, y la cita que se movió sola

### 4.1 Las dos negativas de modalidad

Son las únicas dos negativas por plazo que quedan en todo el sistema. No hay versión tardía con
cargo: o alcanza el tiempo, o no se cambia. Se alcanzan porque el permiso y la anticipación ya no
filtran las candidatas: deciden cuál de estos dos textos sale.

Esa profesional no permite esa dirección:

**`modalidad_no_permitida`**

> Esos cambios no los tengo permitidos. Tu cita del {dia} se queda {modalidad}. Si es urgente,
> coméntaselo.

No alcanza la anticipación:

**`modalidad_sin_anticipacion`**

> Para eso {profesional} pide {plazo} de anticipación y ya faltan menos. Tu cita del {dia} se queda
> {modalidad}. Si es urgente, coméntaselo.

Las dos nombran la dirección y no la modalidad deseada, porque el permiso es por dirección: una
cita presencial sólo puede ir a en línea. Y las dos dicen cómo queda la cita, para que no quede
duda de si algo cambió.

### 4.2 La cita con dinero adentro

**Dinero adentro tiene una sola definición:** el cobro está **acreditado**, o hay un **comprobante
pegado**. Un cobro al que sólo se le pidió comprobante, sin archivo, no es dinero adentro y no
dispara nada de esta sección.

**Una cita con dinero adentro sí se cancela.** Lo que hace el agente antes es ofrecer las salidas
que quizá le convienen más, una vez y sólo una. La primera línea la escoge el servidor según el
estado —«ya está pagada» si está acreditado, «ya mandaste tu comprobante» si sólo hay archivo—, y
**acreditado gana siempre**: los dos estados conviven, y sin una precedencia escrita el texto queda
al azar.

Los tres textos dejan la conversación **abierta y sin `espera`**: `espera: null`, `cierra: false`.
Es lo único correcto, porque la respuesta puede ir a `cancelar` o a `reprogramar` y no hay un
parámetro que declarar. Declarar `confirmado` aquí hacía que un «reprográmala» aterrizara en
`cancelar(confirmado: true)` y le cancelara la cita que pidió mover, con su dinero adentro.

A tiempo, sin próxima ocurrencia viva de su serie, hay una sola salida:

**`cancelar_dinero_adentro`**

> Esa cita ya está pagada. Te la puedo reprogramar y tu pago se va con ella. ¿Te busco día?

A tiempo y con una próxima ocurrencia viva de su serie, hay dos:

**`cancelar_dinero_adentro_con_proxima`**

> Ya mandaste tu comprobante de esa cita. Puedo reprogramarla, o cancelarla y pasar tu comprobante
> a la próxima, la del {dia}. ¿Qué prefieres?

El destino del pago es **la próxima ocurrencia viva de la serie de esa cita**, no la próxima del
mismo servicio. Si la cita no es de una serie, no hay destino y esta salida no se ofrece: es la
diferencia entre nombrarle un día y que el dinero acabe en otro.

Sin tiempo mínimo, el pago **no se pasa**, y se dice antes de que lo pida:

**`cancelar_dinero_adentro_tarde`**

> Listo, cancelé tu cita del {dia} a las {hora}. Como {profesional} pide {plazo} de aviso y ya
> faltaban menos, tu pago se queda registrado en ella y {profesional} lo resuelve contigo.

**Fuera de plazo se cancela y ya, sin ofrecer nada.** No se ofrece mover, porque moverla no le
ahorra el cargo: fuera de plazo se cobran las dos. Y no se ofrece pasar el pago, porque fuera de
plazo el pago se queda en la cancelada — ofrecerlo sería prometerle un traslado que no ocurre.
Dentro del plazo sí se ofrece, y por eso los otros dos textos preguntan antes.

Pasar el pago exige **tres condiciones juntas**: dinero adentro, aviso dentro del plazo de esa
ficha, y una próxima ocurrencia viva de su serie. Faltando cualquiera, la salida no se ofrece. El
plazo sí bloquea aquí: si no bloqueara, el traslado cerraría el cobro viejo como no cobrado y la
profesional perdería el cargo que su propia política le concede.

Si acepta pasar el pago y entre la oferta y su respuesta la próxima se canceló o adquirió su propio
cobro, **no hay texto para eso: se cancela igual y no se le dice nada**. Ella pidió cancelar, y eso
es lo que pasa. El cierre es `cancelar_cierre` con la coletilla de que su pago queda registrado, que
es la única cierta — **nunca la que nombra la cita destino**, porque el pago no llegó a moverse y
decírselo sería prometerle un traslado que no ocurrió.

Explicarle que su próxima sesión ya traía otro cobro sería contarle un enredo interno que no puede
resolver ni le cambia nada: su cita queda cancelada y su dinero registrado, igual que si nunca
hubiera existido la salida.

**Que el importe sea distinto no detiene nada.** Si la sesión de destino cuesta más o cuesta menos,
el pago se pasa igual y la profesional ajusta desde su app: no hay texto para ese caso porque ese
caso no para.

Si dice que no a todo, se cancela con `cancelar_cierre` y su coletilla de pago, y **el agente no
insiste una segunda vez**. La cuenta la lleva el servidor: si la función ya ofreció las salidas una
vez, la segunda llamada cancela. El modelo no lleva la cuenta de nada. A la paciente no se le pide
que adivine qué pasa con su dinero: se le dice lo único que necesita saber, que no se perdió y con
quién se ve.

### 4.3 La cita dejó de estar donde estaba

Reprogramar son tres llamadas en tres mensajes, y entre la primera y la última la profesional puede
haber tocado esa cita desde su app. La llamada que escribe **relee el estado de la cita de origen
dentro de su propia transacción**, y si cambió, sale uno de estos tres. `hecho: false` en los tres.

**`cita_ya_no_esta`** — la cancelaron mientras conversaban. Cierra.

> Esa cita ya no está: se canceló mientras hablábamos. ¿Te busco día para otra?

**`cita_cambio_de_lugar`** — la movieron de día. `espera: "confirmado"`.

> Esa cita se movió mientras hablábamos: ahora es el {dia} a las {hora}. ¿Te la muevo desde ahí?

**`cita_ya_paso`** — la sesión ya ocurrió, o el barrido la pasó a revisión. Cierra.

> Esa cita ya pasó, así que desde aquí ya no la puedo cambiar. Si necesitas algo de ella,
> coméntaselo a {profesional}.

Los tres los devuelven `reprogramar` y `cancelar`; `cita_cambio_de_lugar` sólo `reprogramar`, porque
cancelar una cita que se movió de día se cancela igual. Sin estos textos, el desenlace real era «se
me acabó el espacio», que es falso y no dice lo único útil.

---

## 5. La regla de esta página

**Ningún texto se retoca en otro archivo.** Si una cita en cualquier otro archivo difiere de lo que
está aquí, manda este archivo: la corrección se hace **primero aquí** y después en la cita. Nunca al
revés y nunca en los dos a la vez. Los demás archivos citan por clave; sólo
`docs/01-conversaciones.md` reproduce un texto completo, y únicamente cuando la conversación no se
entiende sin él.

Un texto nuevo se escribe aquí antes de existir en la función. Una rama nueva de conversación es
una plantilla nueva en esta página y un despliegue, no una línea más de prompt: ése es el precio de
que el agente no redacte, y es el que hace que no invente.

**Ningún texto de aquí cita datos de producción.** Los nombres y los precios que aparecen en los
ejemplos son inventados y están marcados como ejemplos. Cada regla se escribe sobre lo que la
profesional configura, nunca sobre lo que hoy tiene configurado.

---

## 6. Índice de claves

Las 83 claves de esta página, en el orden en que aparecen. Los demás archivos citan por clave y
citan este número; si una clave no está aquí, el texto no existe todavía.

| Clave | Sección |
|---|---|
| `crisis` | 1 |
| `no_te_reconocemos` | 1 |
| `paciente_inactivo` | 1 |
| `con_cual_profesional` | 1 |
| `fuera_de_alcance` | 1 |
| `asunto_de_dinero` | 1 |
| `no_entendi` | 1 |
| `se_acabo_el_espacio` | 1 |
| `pendiente_lo_otro` | 1 |
| `resena_pide_calificacion` | 1 |
| `resena_pide_comentario` | 1 |
| `servicios_varios` | 2.1 |
| `servicios_uno` | 2.1 |
| `aviso_recurrencia` | 2.1 |
| `servicio_no_asignado` | 2.1 |
| `servicio_no_existe` | 2.1 |
| `sin_horarios` | 2.1 |
| `horarios_lista` | 2.2 |
| `horarios_lista_compartida` | 2.2 |
| `horarios_falta_modalidad` | 2.2 |
| `modalidad_no_disponible_en_servicio` | 2.2 |
| `fuera_del_horizonte` | 2.2 |
| `agendar_pregunta_confirmar` | 2.3 |
| `agendar_no_aparta` | 2.3 |
| `agendar_cierre_cobra_despues` | 2.3 |
| `agendar_cierre_prepago` | 2.3 |
| `horario_ocupado` | 2.3 |
| `confirmar_cierre` | 2.4 |
| `confirmar_cierre_ambas` | 2.4 |
| `comprobante_pedido` | 2.4 |
| `confirmar_lista` | 2.4 |
| `confirmar_nada_que_confirmar` | 2.4 |
| `reprogramar_pregunta_dia` | 2.5 |
| `reprogramar_aviso_tardio` | 2.5 |
| `reprogramar_no_mueve` | 2.5 |
| `reprogramar_lista` | 2.5 |
| `reprogramar_cierre` | 2.5 |
| `reprogramar_cierre_prepago` | 2.5 |
| `reprogramar_recurrencia_dos_salidas` | 2.5 |
| `reprogramar_pasada_a_la_proxima` | 2.5 |
| `reprogramar_pasada_a_la_proxima_tarde` | 2.5 |
| `reprogramar_nada_que_mover` | 2.5 |
| `reprogramar_solo_la_proxima` | 2.5 |
| `cancelar_cierre` | 2.6 |
| `cancelar_aviso_tardio` | 2.6 |
| `cancelar_no_cancela` | 2.6 |
| `cancelar_lista` | 2.6 |
| `cancelar_nada_que_cancelar` | 2.6 |
| `modalidad_propuesta` | 2.7 |
| `modalidad_cierre` | 2.7 |
| `modalidad_no_cambia` | 2.7 |
| `modalidad_lista` | 2.7 |
| `modalidad_nada_que_cambiar` | 2.7 |
| `comprobante_pregunta_una` | 2.8 |
| `comprobante_lista` | 2.8 |
| `comprobante_varias_imagenes` | 2.8 |
| `comprobante_acuse` | 2.8 |
| `comprobante_acuse_sesion_pasada` | 2.8 |
| `comprobante_nada_esperando` | 2.8 |
| `comprobante_ya_hay_uno` | 2.8 |
| `comprobante_sin_archivo` | 2.8 |
| `resena_gracias` | 2.9 |
| `resena_ya_enviada` | 2.9 |
| `mis_citas_lista` | 2.10 |
| `mis_citas_una` | 2.10 |
| `mis_citas_donde_presencial` | 2.10 |
| `mis_citas_donde_en_linea` | 2.10 |
| `mis_citas_adeudos` | 2.10 |
| `mis_citas_sin_adeudos` | 2.10 |
| `mis_citas_sin_citas` | 2.10 |
| `sin_hueco_fuera_de_horario` | 3 |
| `sin_hueco_dias_que_no_trabaja` | 3 |
| `sin_hueco_ausencia` | 3 |
| `sin_hueco_lleno` | 3 |
| `sin_hueco_demasiado_pronto` | 3 |
| `modalidad_no_permitida` | 4.1 |
| `modalidad_sin_anticipacion` | 4.1 |
| `cancelar_dinero_adentro` | 4.2 |
| `cancelar_dinero_adentro_con_proxima` | 4.2 |
| `cancelar_dinero_adentro_tarde` | 4.2 |
| `cita_ya_no_esta` | 4.3 |
| `cita_cambio_de_lugar` | 4.3 |
| `cita_ya_paso` | 4.3 |
