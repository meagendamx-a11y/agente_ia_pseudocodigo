# Los textos

Ésta es la **única fuente** de lo que la paciente lee. Los demás archivos citan por clave —«el
texto `paciente_inactivo`»— y no vuelven a escribir la frase.

Dos orígenes y sólo dos. **Los nueve de borde viven literales en el prompt**, se rellenan con lo
que la admisión ya resolvió del mensaje y cuestan cero llamadas. **Los de las once funciones los
compone el servidor** y llegan en la clave `texto`; el agente los copia palabra por palabra.

Tres cuidados atraviesan todo lo de aquí. **Nada de género en la paciente:** hay pacientes hombres,
así que ni «activa» ni «activo» aplicados a ella. **Nada de género en la profesional:** se le nombra
por su nombre de pila. **Ningún plazo escrito a mano:** sale de la ficha de cada profesional y viaja
en `{plazo}`. Sin excepciones: ya no hay ningún reloj fijo del producto.

---

## 1. Los textos de borde

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

### `no_te_reconocemos`

**Cuándo.** El teléfono no tiene vínculo con ninguna profesional. Nunca fue paciente.

> Hola. Este número es el asistente de Agenda Psi, y desde aquí sólo puedo ayudar a pacientes que
> ya están con un psicólogo o psicóloga de la plataforma.
>
> Si estás buscando uno, aquí puedes ver quiénes están disponibles: https://agendapsi.mx

**Compone** el prompt; cualquiera de las once funciones lo devuelve también, por su cerrojo propio.
Cierra. El directorio se ofrece aquí y sólo aquí: quien nunca fue paciente necesita encontrar a
alguien.

### `con_cual_profesional`

**Cuándo.** El teléfono tiene vínculo con más de una profesional. **Se pregunta antes de nada**, y
de ahí toda la conversación es de esa profesional.

> Estás con más de una persona de Agenda Psi. ¿Con quién es lo que necesitas?
>
> {lista}

**Compone** el prompt, con `{lista}` de nombres de pila numerados. La conversación sigue abierta,
`espera: "profesional"`. Nunca se adivina por la última plantilla ni por la cita más próxima:
adivinar aquí manda toda la conversación a la profesional equivocada, y la paciente no tiene forma
de darse cuenta a tiempo. La respuesta se guarda en la memoria de la conversación y no se vuelve a
preguntar.

### `paciente_inactivo`

**Cuándo.** El teléfono sí tiene vínculo, pero la paciente está dada de baja.

> Por ahora tu cuenta con {profesional} no aparece activa, así que desde aquí no puedo ayudarte con
> tus citas. Escríbele para que te reactive y seguimos por aquí.

**Compone** el prompt, con `{profesional}`. Cierra. Dice «tu cuenta no aparece activa» y no «no
apareces como paciente activo» porque lo segundo le pone género a quien lee. Y no manda al
directorio: **nunca fue paciente → directorio; fue y ya no → que la reactiven.**

### `sin_horarios`

**Cuándo.** La profesional no tiene ni un bloque de horario guardado, o tiene apagado el agendado
por parte de la paciente. Lo devuelve `ver_servicios`, y `buscar_horarios` si se llega ahí.

> Ahorita {profesional} no tiene horarios abiertos para las próximas semanas. Escríbele directamente
> para que te dé un espacio.

**Compone** la función que lo devuelve. La conversación sigue abierta. Dice «las próximas semanas» y
no «los próximos 30 días»: decir el horizonte en días invita a preguntar por el día 31.

### `crisis`

**Cuándo.** Cualquier señal de riesgo para ella o para alguien más. Va **sola y primero**: no se
mezcla con nada y no lleva pregunta de cierre.

> Si necesitas ayuda inmediata: Agenda Psi no es un servicio de emergencias. Si tú o alguien más se
> encuentra en peligro, llama al 911. Para recibir apoyo en salud mental, comunícate gratis, las 24
> horas, a Línea de la Vida: 800 911 2000.

**No lo compone nadie:** vive literal en el prompt, sin un solo hueco, y cierra. No tiene huecos a
propósito, así no depende de la red ni del tope de llamadas: ni un límite de tráfico ni una caída
del servidor pueden dejar a alguien sin esta respuesta. Las 24 horas de aquí son el horario de la
línea, no un plazo del producto.

### `vas_muy_rapido`

**Cuándo.** Se pasó alguno de los topes de tráfico. Lo manda el borde de entrada, antes de que el
agente arranque, y como mucho **uno cada quince minutos por teléfono**.

> Recibí varios mensajes seguidos y necesito un momento para ponerme al día. Espérame un minuto y
> escríbeme otra vez, por favor.

**Compone** el borde de entrada. Es un mensaje suelto. No dice «límite» ni «bloqueo», dice la única
acción que sirve. Hoy este envío no existe —la admisión marca el rechazo y ahí se acaba, así que
ella no recibe nada— y por eso está en lo que hay que construir.

### `no_entendi`

**Cuándo.** El mensaje es genuinamente ininteligible. **No** es para un saludo ni para «¿qué
tengo?»: eso es `mis_citas`.

> No te entendí. Por aquí te puedo ayudar con tus citas —{verbos}— y con lo de tus pagos. ¿Qué
> necesitas?

**Compone** el prompt, con `{verbos}` del sobre. La conversación sigue abierta. Los verbos salen del
menú personalizado: si esa profesional no permite cambios de modalidad, no se menciona. Ejemplo de
`{verbos}`: «agendar, mover, cancelar o confirmar».

### `se_acabo_el_espacio`

**Cuándo.** Se acabaron las **tres llamadas de este mensaje**. El tope es por mensaje, no por
conversación: existe para que un modelo confundido no llame funciones en círculo.

> Se me acabó el espacio de esta consulta. Escríbeme otra vez y seguimos justo desde donde nos
> quedamos.

**Compone** el prompt. Cierra. Vive ahí y no en una función porque cuando hace falta ya no queda
ninguna llamada disponible: una herramienta que sólo se puede usar cuando no se puede usar ninguna
es una herramienta rota. Y dice la verdad: la memoria de la conversación guarda qué se preguntó y
qué opciones se ofrecieron, así que el mensaje siguiente sí retoma donde se quedó.

---

## 2. Los textos de las once funciones

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
| `{zona}` | La zona horaria del negocio, en palabras: «la Ciudad de México» |
| `{lista}` | Las opciones numeradas, máximo cinco, con su etiqueta ya escrita |
| `{verbos}` | Sólo lo que esa profesional permite |
| `{banco}` · `{titular}` · `{clabe}` | Los datos de transferencia del perfil |
| `{direccion}` | Dónde es |

Ninguno lo rellena el modelo: llegan ya escritos dentro de `texto`. La tabla existe para leer las
plantillas de abajo, no para componerlas a mano. **No hay hueco de liga:** la liga de la sesión en
línea se manda en el aviso de una hora antes y en ningún otro lado.

### 2.1 `ver_servicios`

Varios servicios, `espera: "servicio"`. La pregunta de días va en el mismo mensaje para no gastar
un viaje:

**`servicios_varios`**

> Hola {paciente}. Con gusto te agendo con {profesional}. Sus servicios son:
>
> {lista}
>
> Dime cuál te interesa, qué días te quedan mejor y a qué hora.

Cada renglón de `{lista}` es `{servicio} · {duracion} · {monto}`. Con un solo servicio se dice cuál
es y se pasa directo a los filtros, `espera: "filtros"`:

**`servicios_uno`**

> Hola {paciente}. Con gusto te agendo con {profesional}. {servicio}, {duracion}, {monto}. ¿Qué
> días te quedan mejor y a qué hora?

Con `para: "precio"`, los mismos datos y otro cierre:

**`servicios_precios`**

> Hola {paciente}. Con {profesional} los precios son estos:
>
> {lista}
>
> ¿Te agendo alguna?

El aviso de recurrencia va **antes** de todo lo demás y se lleva la pregunta:

**`aviso_recurrencia`**

> Ya tienes {servicio} {ritmo}, los {dia} a las {hora}, y tu próxima es el {dia} a las {hora}.
> ¿Quieres agendar otra sesión aparte de ésa?

Y si tiene una próxima sin recurrencia:

**`aviso_cita_proxima`**

> Hola {paciente}. Ya tienes {servicio} el {dia} a las {hora}, {modalidad}. ¿Quieres mover ésa de
> día, o agendar otra sesión aparte?

Si pidió por su nombre un servicio que no está en su lista:

**`servicio_no_asignado`**

> Ese servicio no lo tienes asignado, así que desde aquí no te lo puedo agendar. Pídele a
> {profesional} que te lo habilite y con gusto te lo agendo.

La lista es la que le toca: sus servicios asignados si tiene alguno, y el catálogo completo de su
profesional si no tiene ninguno. Este texto es para lo que quedó fuera de esa lista, y no ofrece
alternativas a propósito: cambiarle el servicio por otro parecido es decidir por ella.

Si la profesional no tiene horarios abiertos, devuelve `sin_horarios` y ahí termina.

### 2.2 `buscar_horarios`

Hasta cinco opciones, cada una con día y hora, `espera: "opcion"`:

**`horarios_lista`**

> Para el {dia}, {modalidad}, tengo estas horas:
>
> {lista}
>
> Dime cuál te acomoda.

No dice «y te la aparto» porque todavía no se aparta nada: antes de crear la cita se pregunta otra
vez, y ese texto es de `agendar`.

Cuando dos días traen exactamente las mismas horas se dicen **una sola vez**. No se dice «te pongo
las del martes», porque son las mismas horas de los dos días:

**`horarios_lista_compartida`**

> El {dia} y el {dia} tengo estas horas:
>
> {lista}
>
> Dime la hora y en cuál de los dos días.

Al escoger la hora siempre se sabe el día: o lo dice ella aquí, o ya venía determinado porque dijo
día y hora juntos desde el principio, y entonces no se vuelve a preguntar.

Cuando no hay ninguna, el texto es uno de los cinco motivos de la sección 3. **Nunca una lista
vacía y nunca «no hay nada».**

**`horarios_falta_modalidad`** — el servicio admite las dos y ella no dijo cuál. `espera: "modalidad"`.

> Ese lo puedes tomar presencial o en línea. ¿Cómo lo prefieres?

Es el único origen de ese valor al agendar: si `ver_servicios` ya lo había resuelto porque el
servicio admite una sola modalidad, esta rama no ocurre.

### 2.3 `agendar`

**Escoger no aparta.** Antes de crear nada se pregunta, y hasta que dice que sí se aparta.
`espera: "confirmado"`:

**`agendar_pregunta_confirmar`**

> ¿Aparto tu cita del {dia} a las {hora}, {modalidad}?

Cuesta un mensaje y evita el error caro: un «la 3» mal entendido crea una cita real que después hay
que cancelar, con su aviso a la profesional y su hueco bloqueado mientras tanto.

Cobra después: servicio, día, hora, modalidad y profesional, y **ni una palabra de pago**.

**`agendar_cierre_cobra_despues`**

> Listo, {paciente}. Aparté tu {servicio} del {dia} a las {hora}, {modalidad}, con {profesional}.
> Las horas te las doy en horario de {zona}.

Cobra por adelantado y llenó sus datos de transferencia:

**`agendar_cierre_prepago_con_datos`**

> Listo, {paciente}. Aparté tu {servicio} del {dia} a las {hora}, {modalidad}, con {profesional}.
> Son {monto}, y las horas te las doy en horario de {zona}.
>
> Para confirmarla, transfiere a {banco}, a nombre de {titular}, CLABE {clabe}, y mándame el
> comprobante por aquí.

Cobra por adelantado y no llenó sus datos:

**`agendar_cierre_prepago_sin_datos`**

> Listo, {paciente}. Aparté tu {servicio} del {dia} a las {hora}, {modalidad}, con {profesional}.
> Son {monto}, y las horas te las doy en horario de {zona}.
>
> Para confirmarla necesito tu comprobante. Pídele los datos para la transferencia y mándame el
> comprobante por aquí.

**Ninguna de las tres pone plazo al comprobante, y ninguna amenaza con cancelar.** Nada cancela
citas solo: la cita queda apartada y sin confirmar, con el comprobante pedido, y ahí se queda hasta
que llegue. La profesional ve en su app que se pidió y no ha llegado, y el recordatorio sale por
plantilla desde el trabajo programado, no del agente.

La zona horaria se dice **una sola vez**, aquí, para que sepa en qué horario está viendo las horas.
No se repite en ningún otro mensaje. El monto se dice en las dos de prepago y no en la de cobro
después: donde hay que transferir, callar la cantidad sería inútil.

Al apartar se valida que el hueco siga libre. Si se ocupó mientras conversaban, `hecho: false` y las
alternativas del mismo día, renumeradas por dentro. Se dice siempre, nunca se calla:

**`horario_ocupado`**

> Se acaba de ocupar esa hora. Ese mismo día tengo {lista}. ¿Te sirve alguna, o te busco otra fecha?

### 2.4 `confirmar`

Cobra después: confirma y cierra.

**`confirmar_cierre`**

> Listo, tu cita del {dia} a las {hora} quedó confirmada.

Si tenía varias esperando y contestó «ambas», se confirman las dos de una vez, en una sola llamada
y una sola transacción:

**`confirmar_cierre_ambas`**

> Listo, tus citas del {dia} y del {dia} quedaron confirmadas.

Cobra por adelantado: **decir «sí voy» no confirma**, así que no muta y pide el archivo.

**`comprobante_pedido_con_datos`**

> Tu cita del {dia} a las {hora} se confirma con tu comprobante. Transfiere a {banco}, a nombre de
> {titular}, CLABE {clabe}, y mándame la foto por aquí.

Sin datos de pago en el perfil:

**`comprobante_pedido_sin_datos`**

> Tu cita del {dia} a las {hora} se confirma con tu comprobante. Pídele a {profesional} los datos
> para la transferencia y mándame la foto por aquí.

Estas dos tampoco ponen plazo, por lo mismo: no hay reloj que cumplir. Si ella ya mandó su
comprobante, no se le pide de nuevo y «sí voy» confirma normal.

Con varias esperando confirmación, `espera: "cita"`:

**`confirmar_lista`**

> ¿Cuál me confirmas?
>
> {lista}

Se pregunta siempre que haya más de una. Nunca se asume por la última plantilla ni por la más
próxima.

**`confirmar_nada_que_confirmar`** — ninguna cita esperando confirmación. Cierra.

> No tengo ninguna cita tuya esperando confirmación. Tu próxima es el {dia} a las {hora}, y ya está
> confirmada.

**`confirmar_ya_confirmada`** — esa cita ya estaba confirmada. No muta, `hecho: false`, y se dice sin
que parezca un error.

> Esa ya estaba confirmada: tu cita del {dia} a las {hora} sigue en pie.

### 2.5 `reprogramar`

Reprogramar **se permite siempre**. El plazo ya no bloquea nada: sólo decide si hay que avisar de un
cobro.

Primera llamada, a tiempo, `espera: "filtros"`:

**`reprogramar_pregunta_dia`**

> Va, muevo tu cita del {dia} a las {hora}. ¿Qué días te quedan mejor y a qué hora?

La modalidad **sí se vuelve a preguntar**, porque puede querer cambiarla en la cita nueva. El
servicio no: viene de la cita que se mueve. `espera: "modalidad"`:

**`reprogramar_pregunta_modalidad`**

> Tu cita nueva la puedes tomar presencial o en línea. ¿Cómo la prefieres?

Primera llamada, sin tiempo mínimo, `espera: "confirmado"`:

**`reprogramar_aviso_tardio`**

> Perfecto, te ayudo a reprogramarla. Sólo te aviso antes: {profesional} pide {plazo} de aviso para
> cambios y ya faltan menos, así que se cobran las dos sesiones — la del {dia} y la nueva.
>
> ¿La movemos?

Es un aviso, no una negativa: diga lo que diga el reloj, si ella dice que sí, se mueve.

Con varias candidatas, `espera: "cita"`:

**`reprogramar_lista`**

> ¿Cuál quieres mover?
>
> {lista}

El cierre, que **no repite el aviso de cobro** porque ya se dio antes de mover:

**`reprogramar_cierre`**

> Listo, moví tu cita al {dia} a las {hora}, {modalidad}.

Ejemplo: «Listo, moví tu cita al miércoles 2 de septiembre a las 4:00, presencial.»

El aviso tardío **sólo se da cuando hay algo que cobrar**: con precio efectivo cero se mueve sin
mencionar dinero, porque decirle «se te cobra» de una sesión de cero pesos es mentirle en la otra
dirección. Lo mismo vale para el aviso de `cancelar`.

Cuando la cita que se mueve es de una serie, hay una segunda salida: no buscar día nuevo, sino
juntarla con la próxima que ya tiene agendada. `espera: "confirmado"`:

**`reprogramar_recurrencia_dos_salidas`**

> Esa cita es de tus sesiones {ritmo}. Te busco otro día, o te la paso a tu próxima del {dia} a las
> {hora} y cancelo ésta. ¿Cuál prefieres?

Y el cierre de esa segunda salida:

**`reprogramar_pasada_a_la_proxima`**

> Listo, cancelé tu cita del {dia}. Tu próxima sigue en pie, el {dia} a las {hora}, y tu pago quedó
> ahí.

La última frase sólo va cuando esa cita traía pago. La vieja queda **cancelada**, no reprogramada, y
la ocurrencia que ya existía no se toca: es la única forma de que la serie no acabe con dos citas
donde había una.

**`reprogramar_nada_que_mover`** — sin ninguna cita futura que mover. Cierra.

> No tengo ninguna cita tuya por mover. Si quieres agendar una, dime qué días te quedan mejor.

**`reprogramar_solo_la_proxima`** — de una serie sólo se mueve la más próxima, y ella pidió otra.

> De tus sesiones {ritmo} sólo puedo mover la más próxima, la del {dia} a las {hora}. Las de después
> las ajusta {profesional} desde su app. ¿Muevo ésa?

### 2.6 `cancelar`

Cancelar **se permite siempre**, con dinero adentro o sin él. El plazo sólo decide si hay cargo.

Sin dinero adentro y a tiempo. **No se pregunta**: cancela y cierra.

**`cancelar_cierre`**

> Listo, cancelé tu cita del {dia} a las {hora}. No te queda ningún cobro pendiente por ella.

Sin dinero adentro y tarde, `espera: "confirmado"`:

**`cancelar_aviso_tardio`**

> Te la cancelo, pero antes te aviso: {profesional} pide {plazo} de aviso y ya faltan menos, así
> que la sesión se te cobra. ¿La cancelo de todos modos?

Y al confirmar, el cierre corto, sin repetir el aviso:

**`cancelar_cierre_tardio`**

> Listo, cancelé tu cita del {dia} a las {hora}.

Con varias candidatas:

**`cancelar_lista`**

> ¿Cuál te cancelo?
>
> {lista}

Con cero, se dice con una salida. Nunca un error:

**`cancelar_nada_que_cancelar`**

> No tengo ninguna cita tuya por cancelar. Si quieres agendar una, dime qué días te quedan mejor.

Los tres textos de la cita con dinero adentro están en la sección 4.

### 2.7 `cambiar_modalidad`

Es el único cambio que **sí sigue bloqueado por el plazo**: la profesional necesita saber con tiempo
si va al consultorio.

La propuesta, con la dirección del cambio, `espera: "confirmado"`:

**`modalidad_propuesta`**

> Sí. Tu cita del {dia} a las {hora} pasaría de {modalidad} a {modalidad}. ¿La cambio?

El cierre:

**`modalidad_cierre`**

> Listo, tu cita del {dia} a las {hora} queda {modalidad}.

Con varias, cada renglón con su modalidad actual y **sin dar por hecho a cuál dirección**:

**`modalidad_lista`**

> ¿De cuál cita quieres cambiar la modalidad?
>
> {lista}

Ejemplo de `{lista}`: «1. Jueves 27, 5:00 p.m. — presencial / 2. Sábado 29, 11:00 a.m. — en línea».
Las dos negativas están en la sección 4.

**`modalidad_nada_que_cambiar`** — ninguna cita cumple las cuatro condiciones. Cierra.

> Ahorita no tengo ninguna cita tuya a la que le pueda cambiar la modalidad.

### 2.8 `pasar_pago`

El destino no se señala nunca: lo resuelve el servidor y se dice literal. El estado se mueve tal
cual —comprobante o acreditado— y la cita vieja queda cancelada. Dos variantes, y la escoge el
resultado, no lo que el modelo crea que pasó:

**`pasar_pago_acreditado`**

> Listo, tu pago quedó acreditado en tu sesión del {dia} a las {hora}, y cancelé la del {dia}.

**`pasar_pago_comprobante`**

> Listo, pasé tu comprobante a tu sesión del {dia} a las {hora}, y cancelé la del {dia}.

Si no hay próxima del mismo servicio, se dice y se ofrece mover:

**`pasar_pago_sin_proxima`**

> No tienes otra sesión de {servicio} donde pasarlo. Lo que sí puedo es moverte esa cita a otro día
> y tu pago se va con ella. ¿Te busco día?

Las tres nombran la cancelación de la cita vieja porque eso es lo que de verdad le pasa, y callarlo
la dejaría creyendo que sigue en pie.

**Sólo hay dos revisiones**, y cada una tiene su texto. Ninguna es un error y las dos ofrecen algo:

**`pasar_pago_sin_dinero`**

> Esa cita no tiene ningún pago tuyo adentro, así que no hay nada que pasar. Si quieres, te la
> cancelo o te la muevo de día.

**`pasar_pago_la_proxima_ya_tiene`**

> Tu sesión del {dia} ya tiene su propio pago, así que no le puedo encimar éste. {profesional} lo
> acomoda contigo. Si prefieres, te muevo la del {dia} a otro día y tu pago se va con ella.

**Que el importe sea distinto no detiene nada.** Si la sesión de destino cuesta más o cuesta menos,
el pago se pasa igual y la profesional ajusta desde su app: no hay texto para ese caso porque ese
caso no para. Y el tiempo mínimo tampoco: pasar el pago se permite siempre, como cancelar y como
reprogramar.

### 2.9 `mandar_comprobante`

**Siempre se pregunta antes de guardar**, aunque haya un solo cobro esperando y aunque la plantilla
nombre la cita. La base admite un comprobante por cobro para siempre y no hay pantalla para
reemplazarlo: una foto equivocada queda pegada.

Una sola candidata:

**`comprobante_pregunta_una`**

> ¿Es el comprobante de tu cita del {dia}?

El cobro se identifica por **fecha**. La hora se agrega sólo cuando hay dos o más cobros del mismo
día, que es el único caso en que la fecha sola no alcanza.

Varias, con fecha y monto, la más antigua primero:

**`comprobante_lista`**

> ¿De cuál de estas es tu comprobante?
>
> {lista}

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

**Nunca «pagado» ni «aprobado»:** el agente recibe y avisa, no acredita. Y recibir comprobantes vale
para todas las profesionales, cobren antes o después de la sesión; lo que sólo aplica al cobro por
adelantado es pedir el pago al agendar.

### 2.10 `dejar_resena`

Las dos preguntas que faltan cuestan **cero llamadas**: viven en el prompt porque no llevan ni un
dato adentro. Se pregunta una vez y no se insiste.

**`resena_pide_comentario`**

> Gracias. ¿Quieres agregar un comentario para su perfil? Si no, así la dejo.

**`resena_pide_calificacion`**

> Gracias por escribirlo. ¿Cuántas estrellas le pones, del 1 al 5?

El cierre, que sí sale de la función:

**`resena_gracias`**

> Listo, te agradecemos mucho que compartieras esto. Tu nombre queda anónimo: en su perfil sólo se
> muestran tus iniciales.
>
> Nos ayuda a que más personas encuentren en el directorio a quien las acompañe.

**Nunca promete publicación:** ninguna función escribe la moderación y una persona la revisa antes.

**`resena_ya_enviada`** — ya había dejado una. Cierra.

> Ya tenemos tu reseña de {profesional}, y te lo agradecemos mucho. Si quieres cambiarla,
> coméntaselo.

### 2.11 `mis_citas`

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

**`mis_citas_donde_en_linea`**

> Tu cita del {dia} a las {hora} es en línea. La liga te llega una hora antes.

**La liga no se manda aquí.** Sale una sola vez, en el aviso de una hora antes, para que ella la
tenga a la mano cuando la necesita y no la busque tres días atrás en la conversación.

Sin dirección guardada:

**`mis_citas_sin_direccion`**

> La dirección te la comparte {profesional} directamente.

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

**No hay consulta a esa hora.**

**`sin_hueco_fuera_de_horario`**

> Por la {parte_del_dia} no hay consultas. El horario es de {hora} a {hora}, y para el {dia} tengo:
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

**Esos días concretos no va a haber.**

**`sin_hueco_ausencia`**

> El {dia} y el {dia} no hay consultas. Lo más cercano es el {dia}, y ahí tengo:
>
> {lista}
>
> ¿Te sirve alguno, o te busco otra fecha?

**Sí hay consulta, pero está llena.** Éste ofrece **dos caminos**, no uno: la misma hora en otros
días, y otras horas en el mismo día.

**`sin_hueco_lleno`**

> Para esos días ya no tengo espacio a esa hora. Esa misma hora la tengo el {dia}, y ese mismo día
> tengo otras horas:
>
> {lista}
>
> ¿Te sirve alguno, o te busco otra fecha?

La `{lista}` mezcla las dos salidas, y por eso cada renglón lleva día y hora. Ofrecer una sola la
manda a preguntar otra vez por la que no se le ofreció.

**Es demasiado pronto.**

**`sin_hueco_demasiado_pronto`**

> Para el {dia} ya no alcanzo: se necesitan {plazo} de anticipación. Lo más cercano es el {dia}, y
> ahí tengo:
>
> {lista}
>
> ¿Te sirve alguno, o te busco otra fecha?

Ese `{plazo}` es la anticipación mínima de la paciente, no el aviso de cambio: son dos números
distintos de la misma ficha y ninguno se escribe a mano. El sexto caso —que la profesional no tenga
ni un bloque de horario guardado— no es un motivo: es el texto `sin_horarios`.

---

## 4. Modalidad que no se puede, y la cita con dinero adentro

### 4.1 Las dos negativas de modalidad

Son las únicas dos negativas por plazo que quedan en todo el sistema. No hay versión tardía con
cargo: o alcanza el tiempo, o no se cambia.

Esa profesional no permite esa dirección:

**`modalidad_no_permitida`**

> {profesional} no maneja cambios a {modalidad}. Tu cita del {dia} se queda {modalidad}.

No alcanza la anticipación:

**`modalidad_sin_anticipacion`**

> Para cambiar la modalidad {profesional} pide {plazo} de anticipación, y ya faltan menos. Tu cita
> del {dia} se queda {modalidad}. Si es urgente, coméntaselo.

Las dos nombran la dirección y no la modalidad deseada, porque el permiso es por dirección: una
cita presencial sólo puede ir a en línea. Y las dos dicen cómo queda la cita, para que no quede
duda de si algo cambió.

### 4.2 Los tres textos de la cita con dinero adentro

**Una cita con dinero adentro sí se cancela.** Lo que hace el agente antes es ofrecer las salidas
que quizá le convienen más, una vez y sólo una. La primera línea la escoge el servidor según el
estado —«ya está pagada» o «ya mandaste tu comprobante»— y el agente no elige cuál.

Sin próxima cita del mismo servicio hay una sola salida. `espera: "confirmado"`:

**`cancelar_dinero_adentro`**

> Esa cita ya está pagada. Antes de cancelarla: puedo reprogramarla y tu pago se va con ella. ¿Te
> busco día, o te la cancelo?

Con una próxima del mismo servicio hay dos. `espera: "confirmado"`:

**`cancelar_dinero_adentro_con_proxima`**

> Ya mandaste tu comprobante de esa cita. Antes de cancelarla: puedo reprogramarla, o cancelar ésta
> y dejar el pago en la próxima, la del {dia}. ¿Cuál prefieres, o te la cancelo?

Si dice que no a las dos, se cancela. **El agente no insiste una segunda vez:**

**`cancelar_insiste`**

> Listo, cancelé tu cita del {dia} a las {hora}. Tu pago queda registrado y {profesional} lo
> resuelve contigo.

La cita queda cancelada sin tiempo mínimo y el estado del pago se conserva tal como estaba, para que
la profesional decida si lo cobra o lo condona. A la paciente no se le pide que adivine cuál de las
dos: se le dice lo único que necesita saber, que su dinero no se perdió y con quién se ve.

La cuenta la lleva el servidor: si la función ya ofreció las salidas una vez, la segunda llamada
cancela. El modelo no lleva la cuenta de nada.

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

**Ningún texto de aquí cita datos de producción.** Los nombres que aparecen en los ejemplos son
inventados y están marcados como ejemplos. Cada regla se escribe sobre lo que la profesional
configura, nunca sobre lo que hoy tiene configurado.

---

## 6. Índice de claves

Las 83 claves de esta página, en el orden en que aparecen. Los demás archivos citan por
clave; si una clave no está aquí, el texto no existe todavía.

| Clave | Sección |
|---|---|
| `fuera_de_alcance` | 1 |
| `asunto_de_dinero` | 1 |
| `no_te_reconocemos` | 1 |
| `con_cual_profesional` | 1 |
| `paciente_inactivo` | 1 |
| `sin_horarios` | 1 |
| `crisis` | 1 |
| `vas_muy_rapido` | 1 |
| `no_entendi` | 1 |
| `se_acabo_el_espacio` | 1 |
| `servicios_varios` | 2.1 |
| `servicios_uno` | 2.1 |
| `servicios_precios` | 2.1 |
| `aviso_recurrencia` | 2.1 |
| `aviso_cita_proxima` | 2.1 |
| `servicio_no_asignado` | 2.1 |
| `horarios_lista` | 2.2 |
| `horarios_lista_compartida` | 2.2 |
| `horarios_falta_modalidad` | 2.2 |
| `agendar_pregunta_confirmar` | 2.3 |
| `agendar_cierre_cobra_despues` | 2.3 |
| `agendar_cierre_prepago_con_datos` | 2.3 |
| `agendar_cierre_prepago_sin_datos` | 2.3 |
| `horario_ocupado` | 2.3 |
| `confirmar_cierre` | 2.4 |
| `confirmar_cierre_ambas` | 2.4 |
| `comprobante_pedido_con_datos` | 2.4 |
| `comprobante_pedido_sin_datos` | 2.4 |
| `confirmar_lista` | 2.4 |
| `confirmar_nada_que_confirmar` | 2.4 |
| `confirmar_ya_confirmada` | 2.4 |
| `reprogramar_pregunta_dia` | 2.5 |
| `reprogramar_pregunta_modalidad` | 2.5 |
| `reprogramar_aviso_tardio` | 2.5 |
| `reprogramar_lista` | 2.5 |
| `reprogramar_cierre` | 2.5 |
| `reprogramar_recurrencia_dos_salidas` | 2.5 |
| `reprogramar_pasada_a_la_proxima` | 2.5 |
| `reprogramar_nada_que_mover` | 2.5 |
| `reprogramar_solo_la_proxima` | 2.5 |
| `cancelar_cierre` | 2.6 |
| `cancelar_aviso_tardio` | 2.6 |
| `cancelar_cierre_tardio` | 2.6 |
| `cancelar_lista` | 2.6 |
| `cancelar_nada_que_cancelar` | 2.6 |
| `modalidad_propuesta` | 2.7 |
| `modalidad_cierre` | 2.7 |
| `modalidad_lista` | 2.7 |
| `modalidad_nada_que_cambiar` | 2.7 |
| `pasar_pago_acreditado` | 2.8 |
| `pasar_pago_comprobante` | 2.8 |
| `pasar_pago_sin_proxima` | 2.8 |
| `pasar_pago_sin_dinero` | 2.8 |
| `pasar_pago_la_proxima_ya_tiene` | 2.8 |
| `comprobante_pregunta_una` | 2.9 |
| `comprobante_lista` | 2.9 |
| `comprobante_acuse` | 2.9 |
| `comprobante_acuse_sesion_pasada` | 2.9 |
| `comprobante_nada_esperando` | 2.9 |
| `comprobante_ya_hay_uno` | 2.9 |
| `comprobante_sin_archivo` | 2.9 |
| `resena_pide_comentario` | 2.10 |
| `resena_pide_calificacion` | 2.10 |
| `resena_gracias` | 2.10 |
| `resena_ya_enviada` | 2.10 |
| `mis_citas_lista` | 2.11 |
| `mis_citas_una` | 2.11 |
| `mis_citas_donde_presencial` | 2.11 |
| `mis_citas_donde_en_linea` | 2.11 |
| `mis_citas_sin_direccion` | 2.11 |
| `mis_citas_adeudos` | 2.11 |
| `mis_citas_sin_adeudos` | 2.11 |
| `mis_citas_sin_citas` | 2.11 |
| `sin_hueco_fuera_de_horario` | 3 |
| `sin_hueco_dias_que_no_trabaja` | 3 |
| `sin_hueco_ausencia` | 3 |
| `sin_hueco_lleno` | 3 |
| `sin_hueco_demasiado_pronto` | 3 |
| `modalidad_no_permitida` | 4.1 |
| `modalidad_sin_anticipacion` | 4.1 |
| `cancelar_dinero_adentro` | 4.2 |
| `cancelar_dinero_adentro_con_proxima` | 4.2 |
| `cancelar_insiste` | 4.2 |
