# 02 · Las once funciones

Corte: 2026-08-28.

Este archivo es el catálogo completo: **una intención, una función, un texto**. La función recibe
lo poco que la paciente dijo, resuelve por dentro todo lo demás —quién es, con quién, qué cita,
qué plazo, qué precio— y devuelve el texto ya redactado en español. El agente lo copia y lo manda.

Las once viven en la base. **El modelo corre en nuestra función de borde**, y cada herramienta que
pide es una de estas once, llamada directo, sin intermediario. Kapso entrega el mensaje y manda la
respuesta; no decide nada de lo que hay aquí.

Las reglas numeradas se citan por número y viven en `docs/00-el-agente.md`. Los textos se citan por
clave y viven completos en `docs/06-textos.md`, que cierra con el índice de todas ellas. **Si una
clave de aquí y `06` difieren, manda `06`**, y la corrección se hace primero allá.

---

## 1. Cinco reglas de forma que valen para las once

**1. La entrada y la salida son planas.** Escalares y arreglos de escalares. **Nunca un objeto
anidado ni un arreglo de objetos.** No es gusto: cuanto más simple es el esquema, menos llamadas
malformadas compone el modelo, y una llamada malformada se rechaza en el borde antes de tocar la
base. Un esquema anidado es la forma más barata de que una gestión muera sin dejar rastro.

**2. Todas las claves van siempre presentes.** Las que no aplican van en nulo; los arreglos vacíos
van vacíos; los booleanos que no aplican van en falso. La función de borde compara el conjunto
exacto de claves: una de más o una de menos no llega a la base.

**3. Ningún identificador de la base cruza al modelo.** Lo que viaja son números del 1 al 5 y
prosa. El detalle de cómo se atan esos números está en el §6.

**4. El «ahora» lo pone el servidor.** Ninguna función acepta zona horaria ni fecha de hoy como
parámetro. La zona del negocio es la canónica y se normaliza en código. De ahí sale la regla 1: el
agente no calcula fechas porque nunca tiene con qué.

**5. La identidad no viaja en los parámetros.** El teléfono lo pone la función de borde desde el
mensaje que llegó, y **las once vuelven a resolver quién es por su cuenta**, nunca de lo que traiga
el mensaje ni de lo que el modelo crea. Si el teléfono no tiene ningún vínculo, cualquiera de las
once devuelve `no_te_reconocemos` y cierra; si el vínculo está dado de baja, devuelve
`paciente_inactivo` y cierra. Esa comprobación se repite en las once y no se vuelve a mencionar en
cada ficha.

---

## 2. La forma del resultado — cuatro claves, iguales en las once

```json
{
  "texto":  "Listo, cancelé tu cita del jueves 27 de agosto a las 3:30 de la tarde. No te queda ningún cobro pendiente por ella.",
  "espera": null,
  "hecho":  true,
  "cierra": true
}
```

| Clave | Tipo | Qué significa |
|---|---|---|
| `texto` | cadena, ≤ 1000 caracteres | Lo que se manda, palabra por palabra. El agente lo copia y no lo adorna |
| `espera` | cadena o nulo | **El nombre exacto del parámetro que falta** en la llamada siguiente. No es un enum que haya que interpretar: es la clave que hay que llenar |
| `hecho` | booleano | Verdadero **sólo** cuando algo se escribió en la base y el servidor lo volvió a leer. El agente no dice «listo» con `hecho: false`, y ésa es toda la regla contra el falso éxito |
| `cierra` | booleano | Si la conversación queda esperando respuesta o no |

Valores posibles de `espera`: `servicio`, `modalidad`, `filtros`, `opcion`, `cita`, `citas`,
`confirmado`, `estrellas`, `comentario`. Cada uno es, literalmente, el nombre de un parámetro de
alguna de las once.

**Qué hace `cierra`.** En falso, el borde guarda en la memoria de la conversación qué se preguntó,
qué función lo preguntó y qué opciones numeradas se ofrecieron; así un «la 2» del mensaje siguiente
aterriza donde debe sin que el modelo tenga que acordarse de nada. En verdadero no queda nada
pendiente y esa memoria se limpia. `cierra` **no frena al agente a media respuesta**: sólo dice si
la conversación quedó abierta.

| Caso | `cierra` |
|---|---|
| `hecho` es verdadero | verdadero: lo que se pidió ya ocurrió y no falta contestar nada |
| `no_te_reconocemos` o `paciente_inactivo` | verdadero |
| `espera` no es nulo | falso: falta un dato y ella tiene que darlo |
| La función dejó salidas abiertas y la respuesta puede ir a otra función | falso. Es el caso de las dos salidas de `cancelar`: el borde recuerda que ya se ofrecieron, y por eso la segunda llamada cancela |
| El texto cierra la conversación y no hay nada que continuar | verdadero: `sin_horarios`, el acuse del comprobante, la petición de comprobante de `confirmar` con prepago, y `mis_citas` |

**No hay campo de error, y es deliberado.** Un código que el agente no puede usar para nada
distinto de leer un texto es ruido que le enseña a ramificar. Un «no se puede» del negocio es un
`texto` con su salida y `hecho: false`. Los motivos siguen existiendo donde sirven: en la bitácora
del servidor. El §9 desarrolla esto.

**La instrucción de mandar el texto tal cual vive en el prompt, no en el resultado.** Las
instrucciones metidas dentro de un resultado se pueden ignorar, o marcar como inyección.

### 2.1 El único freno: tres llamadas por mensaje

No hay presupuesto por gestión. Una gestión se reparte entre varios mensajes de ella, y **cada
mensaje trae sus tres llamadas**. Agendar gasta cuatro llamadas en total y ninguna comparte mensaje
con otra, así que el tope no lo roza.

El tope existe para una sola cosa: **un modelo confundido llama funciones en círculo y nadie lo
detiene**. Tres es suficiente porque la única concatenación autorizada —leer una lista y volver a
llamar con el número— son dos llamadas en el mismo mensaje.

Aparte del tope hay **un candado por conversación**: si llegan dos mensajes del mismo teléfono al
mismo tiempo, el segundo espera a que el primero termine. Sin él, «agéndame el martes» repetido dos
veces son dos citas. Los dos mecanismos están en `docs/07-portero.md`.

---

## 3. La tabla de las once

Ocho escriben, tres leen.

| # | Lo que ella escribe | Función | Muta | Aviso a la profesional |
|---|---|---|---|---|
| 1 | «quiero una cita» · «¿cuánto cuesta?» | `ver_servicios` | no | — |
| 2 | «el miércoles» · «en la tarde» · «cuando sea» | `buscar_horarios` | no | — |
| 3 | «la 3» · «a las 12» | `agendar` | sí (segunda llamada) | `appointment_created_by_patient` |
| 4 | «sí voy» · «ahí estaré» · «ambas» | `confirmar` | sí (salvo prepago sin comprobante) | `appointment_confirmed`, uno por cita |
| 5 | «no voy a poder» · «muévela» | `reprogramar` | sí (llamada final) | `appointment_rescheduled_by_patient` |
| 6 | «cancélala» | `cancelar` | sí | `appointment_cancelled_by_patient` |
| 7 | «¿la puedo tomar en línea?» | `cambiar_modalidad` | sí (segunda llamada) | `modality_changed_by_patient` |
| 8 | «pásalo a la otra cita» | `pasar_pago` | sí | `appointment_cancelled_by_patient` |
| 9 | [foto] · «ya pagué» | `mandar_comprobante` | sí (segunda llamada) | `payment_proof_received` |
| 10 | «5 estrellas, me ayudó mucho» | `dejar_resena` | sí | **ninguno**, a propósito |
| 11 | «¿dónde es?» · «hola» · «¿qué tengo?» · «¿cuánto debo?» | `mis_citas` | no | — |

**Fuera del catálogo, y a propósito, con cero llamadas:** crisis, hablar con una persona,
devoluciones y descuentos, no te entendí, vas muy rápido, y se acabó el espacio. Viven literales en
el prompt (`docs/05-prompt.md`). Con ellos va la pregunta de con cuál profesional, que tampoco es
función: el §5 explica por qué.

Los dos textos de identidad —teléfono desconocido y vínculo dado de baja— tampoco tienen función
propia, pero **cuestan una llamada: la que ya se hizo**. Cualquiera de las once devuelve el texto
que toca en vez de su carga normal (§1, regla de forma 5).

**No hay función de recursos.** La plantilla `patient_resource_delivery` invita a recoger materiales
y hoy nadie consume esa cola. Si ella contesta a esa plantilla, se contesta con `fuera_de_alcance`.
Prometer un material que nadie entrega es exactamente el falso éxito contra el que está armado el
resto.

---

## 4. Las once fichas

---

### 4.1 `ver_servicios`

**Intención.** «Quiero una cita». «¿Cuánto cuesta?». «¿Qué servicios tienes?».

| Parámetro | Tipo | De dónde sale |
|---|---|---|
| `para` | `"agendar"` \| `"precio"` | Del verbo que ella usó. Sólo cambia la pregunta de cierre; los datos son los mismos |
| `pidio` | cadena ≤ 60, o nulo | El nombre del servicio que ella nombró, tal cual. Sólo se llena cuando pidió uno por su nombre |
| `confirmado` | booleano | Verdadero sólo cuando el aviso de que ya tiene una cita próxima se dio y ella dijo que sí quiere otra |

**Qué hace por dentro.**

1. Comprueba que esa profesional tenga al menos un bloque de horario guardado y el agendado por
   parte de la paciente encendido. Si falta cualquiera de las dos, devuelve `sin_horarios` y ahí
   termina: no tiene sentido enseñar precios de algo que no se puede apartar.
2. Resuelve los servicios: **los asignados si tiene alguno; el catálogo activo completo de su
   profesional si no tiene ninguno.** No es una marca, es un corte: con asignados, los demás no se
   enseñan.
3. Si `pidio` trae un nombre y ese servicio no está en la lista que le toca, devuelve
   `servicio_no_asignado`: no lo tiene asignado, que se lo pida a su profesional para que se lo
   habilite, y aquí está lo que sí tiene. **No se ofrece lo que no se puede apartar**, y tampoco se
   calla: callarlo la deja pensando que el servicio no existe.
4. Calcula el precio efectivo, en tres escalones y en este orden: si el servicio es gratis, cero; si
   esa paciente tiene precio preferente, ése; si no, el de catálogo. Es la misma fórmula con la que
   se graba el dinero al crear la cita, así que el número que se dice y el que se cobra no pueden
   separarse. **La palabra «preferente» no sale nunca al mensaje: se dice el número y ya**, porque
   preferente no quiere decir descuento y puede salir más caro. Detalle en `docs/03-dinero.md`.
5. Compone cada línea con **nombre, precio y modalidad**. Los tres hacen falta: dos servicios de una
   misma profesional se pueden llamar igual y costar distinto, y un nombre puede decir «sin costo» y
   tener precio. **El precio sale del número, nunca del nombre.** Y decir la modalidad aquí es lo que
   permite que ella conteste día, hora y modalidad en un solo mensaje.
6. Hace el aviso previo: si el servicio tiene una serie viva, compone el ritmo, el día y la hora **de
   la serie** y la fecha de su próxima cita **de la agenda** —son dos fuentes distintas, y leer el
   día de la cita miente en cuanto una ocurrencia se movió—. Si tiene una próxima sin serie, pregunta
   igual. Si no tiene nada, se salta el aviso.
7. Redacta y devuelve.

**Resultado.**

| Situación | `texto` | `espera` | `hecho` | `cierra` |
|---|---|---|---|---|
| Varios servicios | `servicios_varios` | `servicio` | falso | falso |
| Uno solo | `servicios_uno` | `filtros` | falso | falso |
| Preguntó precios | `servicios_precios` | nulo | falso | falso |
| Pidió uno que no tiene asignado | `servicio_no_asignado` | `servicio` | falso | falso |
| Con serie viva | `aviso_recurrencia` | `confirmado` | falso | falso |
| Con próxima sin serie | `aviso_cita_proxima` | `confirmado` | falso | falso |
| Sin horario guardado, o agendado apagado | `sin_horarios` | nulo | falso | **verdadero** |

**Muta:** no. **Aviso:** ninguno.

**Errores y su remediación.** Ninguno propio. La única salida que no ofrece nada es `sin_horarios`,
y no es un error: es la respuesta correcta, y por eso cierra en vez de invitar a insistir.

---

### 4.2 `buscar_horarios`

**Intención.** «El miércoles». «En la tarde». «Cuando sea». Y también la segunda mitad de mover una
cita.

| Parámetro | Tipo | De dónde sale |
|---|---|---|
| `servicio` | entero 1..5, o nulo | Número de la lista que escribió `ver_servicios`. Nulo si sólo tiene uno |
| `modalidad` | `"en_linea"` \| `"presencial"` \| nulo | Lo que ella dijo. Nulo si el servicio admite una sola |
| `dias` | arreglo de nombres de día en español, máximo 7 | Lo que ella dijo, tal cual, sin traducir |
| `fechas` | arreglo de enteros 1..31, máximo 5 | El número del día del mes tal cual, **sin mes y sin año**. El servidor lo resuelve a su próxima ocurrencia dentro de los 30 días |
| `hora` | `"HH:MM"` o nulo | Sólo cuando dijo una hora exacta |
| `parte_del_dia` | `"manana"` \| `"mediodia"` \| `"tarde"` \| `"noche"` \| nulo | Cuando dijo una franja. **Nunca viaja junto con `hora`** |
| `mover_cita` | entero 1..5, o nulo | La cita que se está moviendo. Sale de la lista de `reprogramar` |

`hora` y `parte_del_dia` son dos formas de decir la misma ventana, y quien las convierte en un par
de horas es el servidor, con el horario de esa profesional. **El modelo nunca mapea «en la tarde» a
un rango**, porque la tarde de una profesional que atiende de 3:00 a 7:00 no es la de otra.

`mover_cita` va en nulo cuando `reprogramar` tenía una sola candidata: el servidor ya sabe cuál es,
porque la escribió él. Lleva número sólo cuando `reprogramar` listó varias.

**Qué hace por dentro.** Recorre los treinta días del horizonte, aplica los filtros, respeta la
anticipación mínima que esa ficha pide, quita los traslapes, excluye la cita que se mueve —para que
no se tape a sí misma ni tape a sus vecinas—, recorta a cinco y etiqueta cada opción con el nombre
del día, su fecha y la hora. **Es una sola llamada aunque el servidor revise treinta días:** el tope
cuenta viajes del agente, no trabajo de la base.

**Las horas se ofrecen en punto.** Si el horario de esa profesional abre a una hora rara, ese pedazo
se desperdicia, y se prefiere desperdiciarlo a llenar la lista de horas incómodas. Si ella pide una
media hora concreta —«a las 4:30»—, se revisa si cabe y se le ofrece.

Si el servicio admite las dos modalidades y `modalidad` llegó en nulo, no busca: pregunta cuál, y
ahí se acaba la llamada. Por eso `ver_servicios` dice la modalidad de cada servicio: para que ella
conteste las dos cosas juntas y esta rama no se dispare.

**Resultado.**

| Situación | `texto` | `espera` | `hecho` | `cierra` |
|---|---|---|---|---|
| Hay horas | `horarios_lista` | `opcion` | falso | falso |
| Dos días con las mismas horas | `horarios_lista_compartida` | `opcion` | falso | falso |
| Falta la modalidad | `horarios_falta_modalidad` | `modalidad` | falso | falso |
| No trabaja a esa hora | `sin_hueco_fuera_de_horario` | `filtros` | falso | falso |
| No trabaja esos días | `sin_hueco_dias_que_no_trabaja` | `filtros` | falso | falso |
| Esos días concretos no va a estar | `sin_hueco_ausencia` | `filtros` | falso | falso |
| Sí trabaja, está llena | `sin_hueco_lleno` | `filtros` | falso | falso |
| Es demasiado pronto | `sin_hueco_demasiado_pronto` | `filtros` | falso | falso |

Los cinco motivos **llevan alternativas numeradas de verdad**, no una frase. Un motivo sin
alternativas obliga a volver a preguntar y cuesta otra llamada y otro mensaje; con alternativas
cierra en el mismo. Cuando las alternativas son opciones apartables, `espera` es `opcion`.

Si dos días traen las mismas horas **se numeran una sola vez** y se dice que son de esos dos días.
Numerarlas dos veces es enseñarle diez opciones que en realidad son cinco. Si difieren, se numeran
día y hora juntos. El detalle del motor está en `docs/04-horarios.md`.

**Muta:** no. **Aviso:** ninguno.

**Errores y su remediación.** Un `servicio` que ya no resuelve se contesta reemitiendo la lista:
`ver_servicios` otra vez. Un `mover_cita` sin lista de `reprogramar` detrás no se acepta y se
contesta con la pregunta de qué cita se mueve.

---

### 4.3 `agendar`

**Intención.** «La 3». «A las 12». Ella escogió.

| Parámetro | Tipo | De dónde sale |
|---|---|---|
| `opcion` | entero 1..5 | Número de la lista que escribió `buscar_horarios` |
| `confirmado` | booleano | Verdadero sólo cuando la propuesta ya se dio y ella dijo que sí |

**Agendar confirma antes de apartar.** La primera llamada no escribe nada: propone la cita completa
—día, hora, modalidad— y pregunta si la aparta. La segunda, con `confirmado`, la crea. Cuesta un
mensaje más y se paga solo: **agendar es la única acción que crea algo de la nada**, la cita creada
por error ya le llegó a la profesional como aviso, y la paciente no puede editarla desde la app.

**Al escoger la hora se le dice el día**, en la propuesta y en el cierre. Y si ella ya había dicho
día y hora juntos, eso ya está determinado y no se le vuelve a preguntar.

**Qué hace la llamada que escribe.** Resuelve el número contra su propia lista, **vuelve a comprobar
que el hueco siga libre dentro de la misma escritura**, aparta la cita, escribe el aviso a la
profesional en la misma transacción, vuelve a leer lo que escribió y compone el texto con eso —no
con lo que pensaba hacer—.

La comprobación del hueco no es adorno. Entre la lista y la escritura pasan dos mensajes de ella, y
el paso de confirmación agrega uno más: en ese rato la profesional pudo apartar esa misma hora desde
su app. **Si se ocupó, no devuelve un código: vuelve a buscar por dentro y ofrece las alternativas
del mismo día**, renumeradas, con `hecho: false`. Una llamada, no dos.

**Cómo nace la cita.**

- **No editable por la paciente.** La cita se marca `is_editable = false`. Lo que ella puede hacer
  con su cita es lo que este agente le ofrece, no lo que un formulario le deje tocar.
- **Confirmada o sin confirmar, según el reloj.** Si la cita cae dentro de la misma ventana en la
  que sale el aviso automático de confirmación —hoy 26 horas, un solo número para todas las
  profesionales— nace ya confirmada, porque el aviso no le va a llegar nunca. Fuera de esa ventana
  nace sin confirmar y recibe la petición cuando toque. Es el mismo número que usa el trabajo
  programado, para que el agente y el aviso no se pisen.
- **Con cobro por adelantado**, la cita nace apartada, sin confirmar, y con la petición de
  comprobante sellada en la misma escritura. **Ahí se queda: nada la cancela sola.** La profesional
  ve que se pidió y no llegó, y decide. El recordatorio sale solo, por plantilla, cuando falten 26
  horas.
- **La zona horaria se dice una sola vez**, en el cierre, para que sepa en qué horario está viendo
  las horas. No se repite en cada mensaje.

**Resultado.**

| Situación | `texto` | `espera` | `hecho` | `cierra` |
|---|---|---|---|---|
| Propuesta | `agendar_pregunta_confirmar` | `confirmado` | falso | falso |
| Confirmado, cobra después | `agendar_cierre_cobra_despues` | nulo | **verdadero** | verdadero |
| Confirmado, cobra antes y llenó sus datos | `agendar_cierre_prepago_con_datos` | nulo | **verdadero** | verdadero |
| Confirmado, cobra antes y no llenó sus datos | `agendar_cierre_prepago_sin_datos` | nulo | **verdadero** | verdadero |
| El hueco se ocupó | `horario_ocupado` | `opcion` | falso | falso |

Las tres variantes de cierre las escoge el servidor. **El agente no sabe cuál de las tres existe:**
llega escrita. Con precio efectivo cero no se menciona pago, comprobante ni transferencia en ninguna
de las tres.

**La cuenta de la gestión: cuatro llamadas.** `ver_servicios`, `buscar_horarios`, la propuesta y la
creación. Cada una contesta un mensaje distinto de ella, así que **ninguna comparte mensaje con otra
y el tope de tres nunca se acerca**. Probar filtros distintos suma una llamada por filtro, y también
una por mensaje. Si la profesional no tiene ni un bloque de horario, la gestión entera es una:
`ver_servicios` ya lo dice.

**Muta:** sí, con `confirmado`. **Aviso:** `appointment_created_by_patient`, con
`patient_first_name`, `patient_last_name`, `appointment_starts_at`, `appointment_ends_at` y
`appointment_modality`.

**Errores y su remediación.** Los dos traen su salida dentro del texto: el hueco ocupado ofrece
alternativas del mismo día, y un `opcion` que ya no resuelve reemite la lista con los mismos
filtros.

---

### 4.4 `confirmar`

**Intención.** «Sí voy». «Ahí estaré». «Ambas». Casi siempre contestando a
`appointment_confirmation_request` o a `appointment_confirmation_prepay`.

| Parámetro | Tipo | De dónde sale |
|---|---|---|
| `citas` | arreglo de enteros 1..5, o el literal `"todas"`, o nulo | Los números de la lista que escribió esta misma función. Nulo en la primera llamada |

**Es la única que recibe varias citas de una vez.** Ella puede tener dos avisos esperando y contestar
«ambas», y confirmarlas de una es lo natural. Va **una sola llamada, una sola transacción, y un
aviso a la profesional por cada cita**: si alguno de los avisos no se puede escribir, no se confirma
ninguna.

**Candidatas.** Sólo futuras, de una serie sólo la más próxima, y sólo las que de verdad están
esperando confirmación.

**Con varias esperando, siempre se pregunta cuál.** Nunca se asume, ni por la última plantilla ni
por la más próxima: confirmar la cita equivocada la deja creyendo que avisó de una sesión a la que
no va a ir. La lista numerada, y ella contesta números o «todas».

**Con prepago, decir «sí voy» NO confirma.** La función no muta y devuelve la petición de
comprobante con los datos de la transferencia, o con la salida de pedírselos a su profesional. Lo
que confirma es el archivo.

**Salvo que el comprobante ya haya llegado.** Si esa cita ya tiene comprobante recibido, no se le
pide de nuevo —pedir dos veces el mismo archivo la hace dudar de que el primero llegó, y la base
admite un solo comprobante por cobro—. En ese caso «sí voy» confirma normal y muta.

**Resultado.**

| Situación | `texto` | `espera` | `hecho` | `cierra` |
|---|---|---|---|---|
| Una candidata, cobra después | `confirmar_cierre` | nulo | **verdadero** | verdadero |
| Una candidata, cobra antes y ya hay comprobante | `confirmar_cierre` | nulo | **verdadero** | verdadero |
| Varias confirmadas de una vez | `confirmar_cierre_ambas` | nulo | **verdadero** | verdadero |
| Cobra antes, con datos de pago | `comprobante_pedido_con_datos` | nulo | falso | verdadero |
| Cobra antes, sin datos de pago | `comprobante_pedido_sin_datos` | nulo | falso | verdadero |
| Varias esperando | `confirmar_lista` | `citas` | falso | falso |
| Ninguna esperando | `confirmar_nada_que_confirmar` | nulo | falso | verdadero |

**Muta:** sí, salvo la rama de prepago sin comprobante. **Aviso:** `appointment_confirmed`, con las
mismas cinco claves de `agendar`, **uno por cada cita confirmada**.

**Errores y su remediación.** Si la cita ya estaba confirmada, no es un fallo: se le confirma con su
hora y se cierra (`confirmar_ya_confirmada`, `hecho: false`). Si dejó de estar programada, se le
dice qué sí tiene y se ofrece agendar.

---

### 4.5 `reprogramar`

**Intención.** «No voy a poder». «Muévela». **Se permite siempre.** El plazo no bloquea nada: sólo
decide si hay cargo, y lo único que cambia es lo que se advierte antes.

| Parámetro | Tipo | De dónde sale |
|---|---|---|
| `cita` | entero 1..5, o nulo | Número de la lista que escribió esta misma función. Nulo en la primera llamada |
| `opcion` | entero 1..5, o nulo | Número de la lista de `buscar_horarios` |
| `confirmado` | booleano | Verdadero sólo cuando el aviso de cambio tardío ya se dio y ella dijo que sí |

**No pregunta servicio: viene de la cita que se mueve. Sí pregunta modalidad**, cuando ese servicio
admite las dos: mover la cita es justo cuando cambia el motivo por el que iba a ir en persona. La
pregunta va pegada a la del día, en el mismo texto, para que no cueste un mensaje aparte, y la
respuesta viaja a `buscar_horarios` dentro de los filtros.

**Candidatas.** Sólo futuras, de una serie sólo la más próxima.

**Qué hace por dentro.**

- **Primera llamada.** Nombra la cita que se mueve y pregunta el día —y la modalidad si aplica—.
  Calcula si el aviso llega a tiempo comparando cuánto falta contra el plazo **de esa ficha**. Si no
  alcanza, el texto lleva ese plazo adentro y la advertencia de que se cobran las dos sesiones.
  **Un texto con «24 horas» escrito a mano le miente a las pacientes de quien pide 12, y le miente
  en la dirección peligrosa** (regla 2): una profesional puede pedir 24 horas de aviso y otra 12.
- **La salida de la serie.** Si la cita pertenece a una serie viva y ella ya tiene agendada la
  siguiente ocurrencia, la primera llamada ofrece una segunda salida: **dejarla en esa próxima en
  vez de buscar un hueco nuevo**. Es lo que casi siempre quiere quien falta a una sesión de una
  serie semanal, y no gasta un hueco de la agenda. Si acepta, no se reprograma: **la cita vieja
  queda cancelada y el pago viaja a la próxima**, que es exactamente lo que hace `pasar_pago`. La
  ocurrencia que ya existía no se toca.
- **Llamada final.** Mueve la cita. **A tiempo, el dinero viaja con ella** a la cita nueva, con su
  petición de comprobante y con su archivo si los tenía. **Tarde, el cobro viejo se congela
  exactamente como estaba** sobre la cita movida, se le abre a la profesional la decisión de cobro,
  y la cita nueva nace con su propio pago. Al congelar se reclasifica el motivo del cobro, de sesión
  a cambio: sin eso la fila desaparece de la facturación aunque la profesional decida cobrar.
  Detalle completo en `docs/03-dinero.md`.
- El cierre **no repite el aviso de cobro**, porque ya se dio antes de mover.

**El aviso sólo se da cuando hay algo que cobrar.** Con precio efectivo cero se mueve sin mencionar
dinero: decirle «se te cobra» de una sesión de cero pesos es mentirle en la otra dirección (regla
5).

**Resultado.**

| Situación | `texto` | `espera` | `hecho` | `cierra` |
|---|---|---|---|---|
| Primera llamada, a tiempo | `reprogramar_pregunta_dia` | `filtros` | falso | falso |
| Primera llamada, el servicio admite las dos modalidades | `reprogramar_pregunta_modalidad` | `filtros` | falso | falso |
| Primera llamada, sin tiempo mínimo | `reprogramar_aviso_tardio` | `confirmado` | falso | falso |
| La cita es de una serie con próxima agendada | `reprogramar_recurrencia_dos_salidas` | nulo | falso | falso |
| Varias candidatas | `reprogramar_lista` | `cita` | falso | falso |
| Llamada final | `reprogramar_cierre` | nulo | **verdadero** | verdadero |
| Sin ninguna candidata | `reprogramar_nada_que_mover` | nulo | falso | verdadero |

`reprogramar_recurrencia_dos_salidas` deja la conversación abierta sin `espera`, porque la respuesta puede
ir a dos sitios: seguir aquí buscando día, o a `pasar_pago`.

**Muta:** sí, en la llamada final. **Aviso:** `appointment_rescheduled_by_patient`, con
`patient_first_name`, `patient_last_name`, `previous_starts_at`, `previous_modality`,
`new_starts_at` y `new_modality`.

**Errores y su remediación.** Si ella pide mover una sesión de la serie que no es la más próxima, no
hay renglón que ofrecerle: se le dice que por aquí se mueve la más próxima y que las demás las ve
con su profesional (`reprogramar_solo_la_proxima`). Eso es una salida, no silencio. Si el hueco
elegido se ocupó mientras decidía, la función vuelve a buscar por dentro y ofrece alternativas del
mismo día con `hecho: false`, igual que `agendar`.

---

### 4.6 `cancelar`

**Intención.** «Cancélala».

| Parámetro | Tipo | De dónde sale |
|---|---|---|
| `cita` | entero 1..5, o nulo | Número de la lista que escribió esta misma función. Nulo en la primera llamada |
| `confirmado` | booleano | Verdadero sólo cuando el aviso de cobro tardío ya se dio y ella dijo que sí |

**Candidatas.** Sólo futuras, de una serie sólo la más próxima.

**Una cita con dinero adentro sí se cancela.** El plazo tampoco bloquea. Lo único que cambia según
el dinero y según el reloj es qué se le ofrece antes y qué pasa con el cobro después.

**«Dinero adentro» tiene una definición exacta y una sola:** el cobro está acreditado, o hay un
comprobante pegado. **Una petición sellada sin archivo no es dinero adentro.**

**Qué hace por dentro.**

- **Sin dinero adentro, a tiempo.** Cancela, condona el cobro pendiente y cierra. **No pregunta**:
  preguntar «¿segura?» cuando no hay ninguna consecuencia es un mensaje de más.
- **Sin dinero adentro, tarde.** Avisa que la sesión se le cobra, con el plazo de esa ficha, y al
  confirmar cancela y congela el cobro con la decisión abierta para la profesional.
- **Con dinero adentro, primera vez.** No cancela todavía: **ofrece las dos salidas que conservan su
  dinero donde sirve** —reprogramar esta cita, y el pago se va con ella; o cancelarla y dejar el
  pago en su próxima sesión—. La segunda sólo se ofrece cuando de verdad hay una próxima del mismo
  servicio.
- **Con dinero adentro, y dijo que no a las dos.** **Se cancela.** Se registra como cancelación sin
  tiempo mínimo y **el estado del pago se conserva tal cual**, para que su profesional decida si lo
  cobra o lo condona. Se le dice que su pago queda registrado. **El agente no insiste una segunda
  vez**: ella ya escuchó las dos salidas y las rechazó.

**Que las salidas ya se ofrecieron lo recuerda el servidor, no el modelo.** Si la función ya
contestó una vez con la oferta, la llamada siguiente cancela. El modelo no lleva la cuenta de nada,
y por eso la oferta deja la conversación abierta.

La primera línea de la oferta cambia sola según el estado —«ya mandaste tu comprobante» o «ya está
pagada»—. El agente no escoge cuál.

**Resultado.**

| Situación | `texto` | `espera` | `hecho` | `cierra` |
|---|---|---|---|---|
| A tiempo, sin dinero | `cancelar_cierre` | nulo | **verdadero** | verdadero |
| Tarde, sin dinero | `cancelar_aviso_tardio` | `confirmado` | falso | falso |
| Tarde, confirmado | `cancelar_cierre_tardio` | nulo | **verdadero** | verdadero |
| Con dinero adentro, sin próxima del mismo servicio | `cancelar_dinero_adentro` | nulo | falso | **falso** |
| Con dinero adentro, con una próxima del mismo servicio | `cancelar_dinero_adentro_con_proxima` | nulo | falso | **falso** |
| Con dinero adentro, dijo que no a las dos salidas | `cancelar_insiste` | nulo | **verdadero** | verdadero |
| Varias candidatas | `cancelar_lista` | `cita` | falso | falso |
| Sin ninguna candidata | `cancelar_nada_que_cancelar` | nulo | falso | verdadero |

**Cancelar tarde, y cancelar con dinero adentro, tienen que poderse.** Rechazarlo deja el peor
camino de todos: ella avisó que no puede ir, nadie registró nada, la cita sigue en pie, y su
profesional se entera el día de la sesión cuando no llega. El dinero no se pierde por cancelar: se
queda registrado, y quien lo resuelve es la profesional desde su app.

**Muta:** sí, cuando cancela. **Aviso:** `appointment_cancelled_by_patient`, con las mismas cinco
claves de `agendar`.

**Errores y su remediación.** No hay ninguno que se sienta como error. Las dos ofertas no son
negativas: son las dos salidas que existen, y la tercera —cancelar de todos modos— también existe y
está a un «no» de distancia.

---

### 4.7 `cambiar_modalidad`

**Intención.** «¿La puedo tomar en línea?».

| Parámetro | Tipo | De dónde sale |
|---|---|---|
| `cita` | entero 1..5, o nulo | Número de la lista que escribió esta misma función. Nulo en la primera llamada |
| `confirmado` | booleano | Verdadero sólo cuando la propuesta ya se dio y ella dijo que sí |

**Es la única acción que el plazo sigue bloqueando**, y es a propósito: la profesional necesita saber
con tiempo si tiene que ir al consultorio. Cancelar y mover se permiten siempre porque el hueco se
libera de todos modos; cambiar la modalidad a última hora la manda a un consultorio vacío o la deja
sin él.

**No lleva a qué modalidad.** Es una decisión por dirección, y la dirección la determina la modalidad
que la cita tiene hoy: una presencial sólo puede ir a en línea. **No hay versión tardía con cargo:**
o alcanza el tiempo, o no se cambia.

**Sólo se listan las citas que de verdad pueden cambiar.** Una cita entra si cumple las cuatro: su
servicio admite las dos modalidades, la profesional permite esa dirección, alcanza la anticipación,
y sigue viva y en el futuro. **El agente nunca intenta algo que no se puede: no llega a saber que
existía.** Y para una profesional que no permite ningún cambio de modalidad, el verbo no se menciona
en el menú, así que la intención casi nunca llega (regla 8).

**Resultado.**

| Situación | `texto` | `espera` | `hecho` | `cierra` |
|---|---|---|---|---|
| Propuesta | `modalidad_propuesta` | `confirmado` | falso | falso |
| Confirmado | `modalidad_cierre` | nulo | **verdadero** | verdadero |
| Esa dirección no se permite | `modalidad_no_permitida` | nulo | falso | verdadero |
| No alcanza la anticipación | `modalidad_sin_anticipacion` | nulo | falso | verdadero |
| Varias candidatas | `modalidad_lista` | `cita` | falso | falso |
| Ninguna candidata | `modalidad_nada_que_cambiar` | nulo | falso | verdadero |

La lista de varias trae **cada cita con su modalidad actual**, porque sin eso la dirección del cambio
no se entiende.

**Muta:** sí, con `confirmado`. **Aviso:** `modality_changed_by_patient`, con `patient_first_name`,
`patient_last_name`, `appointment_starts_at`, `previous_modality` y `new_modality`.

**Errores y su remediación.** **Las dos negativas se conservan**, y son las únicas del catálogo que
quedan por plazo. La de anticipación lleva el plazo **de esa ficha** adentro, nunca un número escrito
a mano. Las dos remiten a su profesional. Si la cita ya está en la modalidad que pide, se le confirma
con su hora y se cierra.

---

### 4.8 `pasar_pago`

**Intención.** «Pásalo a la otra cita». Sale casi siempre de la salida que ofrecieron `cancelar` o
`reprogramar`.

| Parámetro | Tipo | De dónde sale |
|---|---|---|
| `cita` | entero 1..5, o nulo | La cita que trae el dinero. Sale de la lista de `cancelar`, de `reprogramar` o de esta misma función |

**El destino no se señala. Lo resuelve el servidor:** misma paciente, mismo servicio, programada, la
primera posterior. Y se dice literal «tu próxima sesión».

**No es una simplificación.** Con una serie viva es la única forma que funciona: la lista de citas
próximas se colapsa por serie y la segunda ocurrencia no tiene número que señalar. Y como el modelo
no elige, no se puede equivocar de cita.

**Qué hace por dentro, que es poco a propósito.** Cancela la cita que trae el dinero, localiza el
destino y **mueve el estado del cobro tal cual** —comprobante o acreditado— con su importe, su método
y su petición. Si lo que viaja es un comprobante, la fila del archivo **se mueve, no se copia**: dos
filas sobre un mismo archivo son una bomba de limpieza. Deja los dos asientos enlazados en la
bitácora del dinero, uno en cada pago.

**Lo único que revisa es que la cita destino no traiga ya dinero suyo.** Si lo trae, no se pasa y se
le dice que su profesional lo acomoda: sobrescribir un pago que ya estaba ahí borra un dato que
nadie puede reconstruir. **Que los importes no coincidan no bloquea nada**: se pasa igual y la
profesional ajusta el importe desde su app, que es donde se ajustan los importes. **El plazo tampoco
bloquea.**

**Resultado.**

| Situación | `texto` | `espera` | `hecho` | `cierra` |
|---|---|---|---|---|
| Viajó un pago acreditado | `pasar_pago_acreditado` | nulo | **verdadero** | verdadero |
| Viajó un comprobante | `pasar_pago_comprobante` | nulo | **verdadero** | verdadero |
| Vino de reprogramar una serie, y pasó a la próxima ocurrencia | `reprogramar_pasada_a_la_proxima` | nulo | **verdadero** | verdadero |
| No hay próxima del mismo servicio | `pasar_pago_sin_proxima` | nulo | falso | falso |
| La cita no tiene dinero adentro | `pasar_pago_sin_dinero` | nulo | falso | falso |
| La próxima ya tiene dinero suyo | `pasar_pago_la_proxima_ya_tiene` | nulo | falso | falso |

Los tres últimos no son rechazos por política: dos son «no hay materia» y el tercero es el único
cerrojo que queda. Los tres llevan su salida escrita —mover la cita— y ninguno cierra la
conversación.

**Cuál de las dos primeras sale lo dice el resultado, no lo que el modelo crea que pasó.** En la
segunda no aparecen «pagado» ni «aprobado»: un comprobante recibido queda pendiente de revisión y
eso no lo resuelve el agente (regla 4).

**Muta:** sí. **Aviso:** `appointment_cancelled_by_patient`, con las mismas cinco claves de
`agendar`, **porque eso es lo que de verdad le pasa a la cita**. Lo que hay que aceptar y no
maquillar: **la profesional se entera de la cancelación, no del traslado**. El registro del traslado
queda completo en la bitácora del dinero y la tarjeta de la cita destino dirá que está pagada cuando
la abra.

---

### 4.9 `mandar_comprobante`

**Intención.** Llega una foto o un PDF. O «ya pagué».

| Parámetro | Tipo | De dónde sale |
|---|---|---|
| `cita` | entero 1..5, o nulo | Número de la lista que escribió esta misma función. Nulo en la primera llamada. **Nunca se adivina** |

**Recibir comprobantes aplica a todas las profesionales**, cobren antes o después. Lo que sólo aplica
al cobro por adelantado es **pedir el pago al agendar**. Quien cobra al cerrar la sesión también
puede recibir una transferencia por WhatsApp, y el agente la pega igual.

**El archivo no viaja en los parámetros.** Entra por el webhook, que es el único componente que ve el
mensaje crudo de WhatsApp, se guarda, y la función lo toma del renglón del mensaje entrante. **El
agente no mira la imagen:** no valida que sea un comprobante, valida que haya un cobro al cual
pegarlo.

**Siempre se confirma antes de guardar**, aunque haya un solo cobro esperando y aunque la plantilla
lo nombre. La base admite **un solo comprobante por cobro, para siempre**, y no hay pantalla para
reemplazarlo: una foto equivocada queda pegada. El contexto mejora la pregunta; no la elimina. **Es
la única excepción de todo el documento a la regla de actuar cuando hay una sola candidata.**

Consecuencia de esa excepción: **aquí sí hay número aunque la candidata sea una sola.** La pregunta
nombra la cita y la respuesta vuelve como `cita: 1`. Sin eso, la segunda llamada sería idéntica a la
primera y significaría otra cosa.

**El cobro se identifica por fecha.** La hora sólo se dice cuando hay dos o más cobros del mismo día:
«tu sesión del martes 8» basta, y agregar la hora a todo hace la lista ilegible.

**Candidatas.** Todas las sesiones pasadas que deban comprobante —**cada una es su propia deuda, no
se colapsan**— más la más próxima futura de cada serie, la más antigua primero, con fecha y monto.
Colapsar por serie aquí escondería cobros vivos, que es dinero sin dueño.

**Si tiene un comprobante pendiente y escribe por otra cosa, el agente no lo menciona.** Contesta lo
que le preguntaron y ya. El recordatorio sale solo, por plantilla. Cobrarle de paso en una
conversación sobre otro tema es lo que hace que deje de escribir.

**Resultado.**

| Situación | `texto` | `espera` | `hecho` | `cierra` |
|---|---|---|---|---|
| Una candidata | `comprobante_pregunta_una` | `cita` | falso | falso |
| Varias candidatas | `comprobante_lista` | `cita` | falso | falso |
| Segunda llamada, pega | `comprobante_acuse` | nulo | **verdadero** | verdadero |
| Segunda llamada, pega a una sesión que ya pasó | `comprobante_acuse_sesion_pasada` | nulo | **verdadero** | verdadero |
| Ningún cobro esperando | `comprobante_nada_esperando` | nulo | falso | verdadero |
| Ese cobro ya tiene comprobante | `comprobante_ya_hay_uno` | nulo | falso | verdadero |
| No vino archivo en el mensaje | `comprobante_sin_archivo` | nulo | falso | falso |

El acuse **nunca dice «pagado» ni «aprobado»: dice «recibí tu comprobante»** (regla 4).

**Muta:** sí, en la segunda llamada. **Aviso:** `payment_proof_received`, con `patient_first_name`,
`patient_last_name` y `appointment_starts_at`. **Sin el monto: el contrato lo prohíbe expresamente.**

**Errores y su remediación.** Los tres de la tabla llevan su salida escrita: mandárselo directo a su
profesional, esperar la revisión, o volver a mandar el archivo en un solo mensaje. Ninguno dice «ya
está pagado».

---

### 4.10 `dejar_resena`

**Intención.** «5 estrellas, me ayudó mucho».

| Parámetro | Tipo | De dónde sale |
|---|---|---|
| `estrellas` | entero 1..5, o nulo | Obligatorio para escribir. **Sin calificación no se llama** |
| `comentario` | cadena ≤ 1000, o nulo | Opcional. Lo que ella escribió, tal cual |

**El agente no pide la reseña:** la pide la plantilla `patient_review_request`, que ya trae la
petición completa.

Puede llegar en uno o en varios mensajes. **Si llegan sólo las estrellas, el agente pregunta una vez
por el comentario sin llamar a nada**; si no lo da, llama con la calificación sola. Si llega sólo el
comentario, pide la calificación; si no llega nunca, no se registra nada. Toda la lógica de «llegó en
partes» vive en una regla del prompt y en cero estado del servidor, porque la pregunta que falta no
tiene ni un dato adentro y no vale una llamada.

**Resultado.**

| Situación | `texto` | `espera` | `hecho` | `cierra` |
|---|---|---|---|---|
| Con calificación | `resena_gracias` | nulo | **verdadero** | verdadero |
| Llegó sin calificación | `resena_pide_calificacion` | `estrellas` | falso | falso |
| Llegó sin comentario | `resena_pide_comentario` | `comentario` | falso | falso |
| Ya había dejado una | `resena_ya_enviada` | nulo | falso | verdadero |

El agradecimiento lleva la nota del anonimato. **Nunca promete publicación:** ninguna función escribe
la moderación y una persona la revisa antes.

**Muta:** sí. **Aviso: ninguno, y es deliberado.** El contrato de avisos de la app no tiene un tipo
para la reseña, la app pinta en blanco lo que no conoce, y la reseña no existe para nadie hasta que
una persona la modera. Inventarle un tipo sería una tarjeta vacía.

**Errores y su remediación.** Sólo uno: ya había dejado una. Se le agradece y se cierra.

---

### 4.11 `mis_citas`

**Intención.** Las tres preguntas de la misma familia: **qué citas tengo, dónde es, y cuánto debo.**
Más «hola» y el caso de los cinco mensajes seguidos, cuando el agrupamiento los entrega juntos y hay
que leer la intención completa.

| Parámetro | Tipo | De dónde sale |
|---|---|---|
| `sobre` | `"citas"` \| `"donde"` \| `"adeudos"` | Cuál de las tres preguntó. Sólo cambia qué se responde primero; los datos se resuelven igual |

**No hay función de dirección aparte, ni de adeudos.** Son la misma consulta con distinto énfasis, y
partirla en tres funciones obligaría al modelo a elegir entre tres puertas que llevan al mismo
cuarto.

**Qué devuelve.** Sus citas futuras —máximo cinco, de una serie sólo la más próxima— con lo que puede
hacer con cada una, y la pregunta de cierre. Lo que puede hacer sale del menú de esa profesional: si
no permite cambios de modalidad, no se menciona. Si no tiene ninguna cita, lo dice y ofrece agendar.

- **Dónde es.** Presencial: la dirección. Si no hay dirección guardada, dice que se la comparte su
  profesional —es frecuente, no raro—.
- **En línea: se dice que es en línea, y no se manda la liga.** La liga sale en el aviso de una hora
  antes, y sólo ahí. Mandarla dos días antes es mandarla al fondo de una conversación donde no la va
  a encontrar el día de la sesión.
- **Cuánto debo.** Los cobros que están esperando, con su fecha y su monto. **No dice «pagado» ni
  promete que algo quedó saldado**: dice qué se espera y de qué sesión.

Cuando dos renglones comparten servicio, el de la serie lleva la coletilla que lo identifica como tal
y el suelto no lleva nada. **Nunca se dice «sesión 1 de 6»:** ese número no está guardado y contarlo
sería intuir.

**No es un volcado del historial con otro nombre.** No trae servicios, ni precios, ni capacidades, ni
frases fijas. Trae citas y lo que se debe por ellas.

**Resultado.**

| Situación | `texto` | `espera` | `hecho` | `cierra` |
|---|---|---|---|---|
| Tiene citas | `mis_citas_lista` | nulo | falso | verdadero |
| Tiene una sola | `mis_citas_una` | nulo | falso | verdadero |
| Preguntó dónde es, presencial | `mis_citas_donde_presencial` | nulo | falso | verdadero |
| Preguntó dónde es, en línea | `mis_citas_donde_en_linea` | nulo | falso | verdadero |
| Sin dirección guardada | `mis_citas_sin_direccion` | nulo | falso | verdadero |
| Preguntó cuánto debe, y debe | `mis_citas_adeudos` | nulo | falso | verdadero |
| Preguntó cuánto debe, y no debe nada | `mis_citas_sin_adeudos` | nulo | falso | verdadero |
| No tiene ninguna | `mis_citas_sin_citas` | nulo | falso | verdadero |

**Cuándo NO se usa:** cuando el mensaje es genuinamente ininteligible. Eso es `no_entendi`, que vive
en el prompt y cuesta cero.

**Muta:** no. **Aviso:** ninguno.

**Errores y su remediación.** Ninguno. Es la función que no puede fallar en el sentido del negocio: o
hay citas, o no las hay.

---

## 5. Con cuál profesional: un paso previo, no una función

Un teléfono puede tener vínculo con dos profesionales. Cuando pasa, **se pregunta con cuál antes de
nada**, y de ahí toda la conversación es de esa profesional. Con un solo vínculo —el caso normal— el
paso no existe y no se nota.

**Es un paso del borde, no una función del catálogo, y no gasta ninguna llamada.** Tres razones, y
las tres son la misma:

1. **Ocurre antes de que haya intención.** Ninguna de las once sería la función correcta que llamar,
   porque todavía no se sabe de qué se va a hablar.
2. **La respuesta es un número contra una lista, y las listas las resuelve quien las escribió.** Aquí
   quien la escribió es el borde, con lo que ya sabe del teléfono; el modelo no tiene que emparejar
   nada.
3. **Si fuera función, el modelo tendría que decidir cuándo identificar.** Eso es justo lo que no se
   le deja decidir: quién es y con quién no depende de lo que el modelo interprete.

Cómo funciona: el borde ve dos vínculos, manda el texto `con_cual_profesional` con las dos numeradas, y
guarda en la memoria de la conversación que está esperando esa respuesta. El mensaje siguiente
resuelve el número contra esa misma memoria, la profesional elegida queda anotada por teléfono, y de
ahí en adelante **las once reciben ese contexto y ninguna vuelve a preguntar**.

Y como siempre: **las once vuelven a comprobar por su cuenta** que ese teléfono puede actuar sobre lo
que va a tocar. La elección sirve para hablar; el cerrojo sigue estando dentro de cada función.

---

## 6. Cuál cita: números de lista, y nada más

Cuando una función tiene más de una candidata, escribe la lista numerada dentro de `texto` —máximo
cinco, con el nombre del día, la fecha y la hora, compuestos por el servidor— y devuelve `espera:
"cita"`. Ella contesta «la 2», el modelo manda `cita: 2`, y el servidor resuelve el 2 contra la lista
que él mismo acaba de escribir.

**El conjunto de candidatas no es el mismo para todas.**

| Función | Qué citas entran |
|---|---|
| `mandar_comprobante` | Todas las sesiones pasadas que deban comprobante —cada una es su propia deuda, no se colapsan— más la más próxima futura de cada serie |
| `confirmar`, `reprogramar`, `cancelar`, `cambiar_modalidad`, `pasar_pago` | Sólo futuras, y de una serie sólo la más próxima |

Y dentro de ese conjunto, **sólo las que de verdad admiten esa acción**.

**La resolución, en cinco renglones:**

1. Si vino `cita` —o `citas`—, es ésa.
2. Cero candidatas: el texto de que no hay nada que hacer, con una salida. No se muta.
3. Una candidata: se actúa sobre ella, salvo que la acción exija aviso o propuesta previa, y salvo
   `mandar_comprobante`, que siempre pregunta.
4. Más de una: la lista numerada y la pregunta. **No se muta.**
5. La pista de la última plantilla desempata el renglón 4: si la plantilla nombró una cita y esa cita
   está entre las candidatas, el conjunto se colapsa a una. **No aplica en `confirmar`**, que con
   varias esperando siempre pregunta, ni en `mandar_comprobante`, que siempre pregunta de todos
   modos.

**Cuatro reglas del número:**

1. **Un `cita` sólo vale contra la última lista de esa función.** No es un identificador global: es
   una posición. Un 2 de `cancelar` no significa nada en `cambiar_modalidad`, porque las dos listas
   se construyen con reglas distintas. Es una propiedad de seguridad que un identificador global no
   tenía.
2. **Con una sola candidata no hay número**, y `cita` va en nulo. La única excepción es
   `mandar_comprobante`, por lo dicho en su ficha.
3. **Con cero, se dice, con una salida.** Nunca un error.
4. **El emparejamiento lo hace el modelo, la numeración el servidor.** Si ella dice «la del jueves a
   las 7», el modelo la empareja contra la lista que el servidor ya escribió y manda el número. Es la
   regla 1: el agente compara, no calcula.

**Los otros tres números tienen su propio productor**, y cada parámetro lo nombra: `servicio`
resuelve contra la lista de `ver_servicios`, `opcion` contra la de `buscar_horarios`, y `mover_cita`
contra la de `reprogramar`. Un número resuelve **contra la lista que lo produjo**, y nunca contra
otra.

**Que la lista no cueste un mensaje.** Cuando el renglón 4 devuelve la lista y ella ya había dicho
cuál —«cancélame la del martes»—, el agente no manda la lista: la lee, encuentra el número y **vuelve
a llamar en el mismo mensaje**. Dos llamadas de las tres, un solo mensaje. Es la única concatenación
que el prompt autoriza, y existe porque el agente no puede emparejar «el martes» contra nada hasta
que el servidor le enseñe las etiquetas.

**Dónde vive la equivalencia.** En la memoria de la conversación: una fila por teléfono con la
profesional elegida, qué dato se está esperando, qué función lo preguntó, las opciones que se
ofrecieron con su posición, y cuándo se escribió. Es lo mismo que hace falta para que un «la 2»
aterrice en la función correcta, así que no son dos mecanismos sino uno. **La fila no guarda nada
que el modelo pueda ver**, y se reemplaza entera en cuanto otra función emite otra lista. El diseño
de esa tabla está en `docs/08-implementacion.md`.

**Un número que ya no resuelve no es un error.** Se contesta reescribiendo la lista: la misma
función, con `cita` en nulo, la vuelve a emitir. El modelo no tiene a dónde ir a buscar otra cosa,
así que no se le da la opción de intentarlo.

---

## 7. La pista de la última plantilla

Ninguna de las plantillas tiene botones: todas son texto. La pista de qué le mandamos sustituye al
payload de un botón, y viaja por **dos caminos, según para qué haga falta**.

**Para detectar la intención: en el contexto que el borde le arma al modelo, ya redactada, cero
llamadas.** «Hace 3 horas le mandamos el aviso de prepago de su cita del martes 25 a las 3:30, y está
respondiendo justo a ese mensaje». El modelo nunca ve la clave de la plantilla ni una referencia a la
cita: ve una oración.

**Para desempatar candidatas: dentro de la función, sin decírselo al modelo.** Es el renglón 5 del
§6.

**El dato no tiene columna propia.** Se reconstruye de la cola de salida: qué plantilla salió, cuándo,
y de qué cita. **Las dos plantillas de reprogramación no nombran la cita con la misma clave que las
demás**: donde el resto escribe `appointment_id`, ellas escriben `new_appointment_id` —y también un
`old_appointment_id`, que **nunca** es el que se lee, porque el cobro que se abre al mover es el de
la cita nueva—. Quien lea una sola forma se pierde justo los casos en que ella acaba de recibir un
aviso de cambio. Y dos familias —bienvenida y entrega de materiales— no traen cita ni pueden traerla.

**La pista dura siete días.** La cola de salida se purga cada hora y se borran las filas ya enviadas
de más de siete días (verificado el 2026-08-28). Pasada esa semana la pista sale vacía en vez de
mentir con una plantilla vieja, que es el comportamiento que se quiere; y como la tabla se mantiene
chica sola, la consulta que busca la última plantilla de un teléfono no necesita índice nuevo.

Leer la cola **no es encolar**. El agente no encola nada: contesta dentro de la conversación abierta.
La cola sólo produce plantillas y sólo la usan los trabajos automáticos.

Qué insinúa cada plantilla:

| Plantilla | Intención | Función |
|---|---|---|
| `appointment_confirmation_request` | confirmar | `confirmar` |
| `appointment_confirmation_prepay` | comprobante, que además confirma | `mandar_comprobante` |
| `request_session_payment_proof` | comprobante | `mandar_comprobante` |
| `request_late_payment_proof` | comprobante por cambio sin tiempo mínimo | `mandar_comprobante` |
| `request_no_show_payment_proof` | comprobante por no asistir | `mandar_comprobante` |
| `appointment_cancelled_payment_proof` | comprobante tras cancelar | `mandar_comprobante` |
| `appointment_rescheduled_payment_proof` | comprobante tras mover | `mandar_comprobante` |
| `patient_review_request` | reseña | `dejar_resena` |
| `appointment_cancelled` | agendar | `ver_servicios` |
| `patient_reactivation` | agendar | `ver_servicios` |
| `patient_resource_delivery` | recoger materiales | **ninguna** — `fuera_de_alcance` |

**Las siete de comprobante apuntan a la misma función y a la misma cita, y aun así se pregunta.**

---

## 8. Los avisos a la profesional

**Van en la misma transacción que la mutación. Si el aviso no se pudo escribir, la mutación no
ocurrió.** No hay cola, no hay segunda llamada, y no hay forma de que la cita se mueva y el aviso no
salga. En `confirmar` con varias citas la regla se aplica al conjunto: **o se escriben todos los
avisos y se confirman todas, o no se confirma ninguna**.

Las claves salen del contrato de la app, que arma el texto con el nombre de la paciente y la hora de
la cita. **Se leyeron del switch de la app y no se inventan**, en
`flutter_application_1/lib/pages/notifications/notification_models.dart`.

| `type` | Claves del `payload` | Quién lo escribe |
|---|---|---|
| `appointment_created_by_patient` | `patient_first_name`, `patient_last_name`, `appointment_starts_at`, `appointment_ends_at`, `appointment_modality` | `agendar` |
| `appointment_confirmed` | las mismas cinco | `confirmar` |
| `appointment_cancelled_by_patient` | las mismas cinco | `cancelar`, `pasar_pago` |
| `appointment_rescheduled_by_patient` | `patient_first_name`, `patient_last_name`, `previous_starts_at`, `previous_modality`, `new_starts_at`, `new_modality` | `reprogramar` |
| `modality_changed_by_patient` | `patient_first_name`, `patient_last_name`, `appointment_starts_at`, `previous_modality`, `new_modality` | `cambiar_modalidad` |
| `payment_proof_received` | `patient_first_name`, `patient_last_name`, `appointment_starts_at` | `mandar_comprobante` |

**Cuatro precisiones que la app impone y que no se pueden negociar:**

1. **`patient_first_name` es obligatorio y no puede ir vacío.** `patient_last_name` es opcional: si
   viene, se pega; si no, la tarjeta sale con el nombre de pila solo.
2. **La modalidad va con el literal `online` o `in_person`, sin traducir.** Cualquier otro texto deja
   la tarjeta sin nombre de modalidad y la tira al aviso genérico.
3. **Las horas tienen que traer huso** —terminar en `Z` o en `±HH:MM`—, que es justo lo que sale de
   una marca de tiempo con zona.
4. **Si falta una sola clave de las que ese tipo exige, la tarjeta cae en el aviso neutro** —«Nueva
   notificación · Hay una actualización reciente en tu cuenta»— y la push también. No es un fallo
   ruidoso: es una tarjeta en blanco que nadie va a saber leer.

`payment_proof_received` **no lleva el monto**. El contrato lo prohíbe expresamente y no hay
excepción.

`dejar_resena` **no manda ningún aviso**, y es deliberado. El porqué está en su ficha.

**Dos avisos que el agente NO manda.** Encolar `appointment_cancelled` o `appointment_rescheduled` al
mismo teléfono con el que se acaba de conversar es un eco: en la app de la profesional ese aviso
tiene sentido porque la paciente no estaba presente; por el agente le llegaría dos veces lo mismo,
una de ellas como plantilla fría que además callaría lo único que ella quiere oír. Se quita.

---

## 9. Los errores como remediación

**No hay campo de error.** Lo que en otro diseño sería un código es aquí un `texto` con `hecho:
false` y una salida escrita. La regla es una sola: **un error no dice qué falló, dice qué hacer
ahora.** Un texto que sólo explica el fallo deja al agente inventando la salida; uno que nombra la
siguiente acción la encuentra.

Las tres formas que toma esa remediación:

| Forma | Cuándo | Ejemplo |
|---|---|---|
| **El texto trae la salida adentro** | Casi siempre | La oferta de `cancelar` con dinero adentro nombra las dos salidas que conservan el pago, y la tercera está a un «no» de distancia |
| **`espera` nombra el parámetro que falta** | Cuando la gestión sigue viva | Un filtro que no dio nada devuelve `espera: "filtros"`: el modelo sabe exactamente qué clave llenar |
| **La función se resuelve sola y devuelve otra cosa** | Cuando volver a preguntar costaría un mensaje | El hueco ocupado no es un rechazo: `agendar` vuelve a buscar por dentro y ofrece alternativas del mismo día, renumeradas |

**No existe el caso de «no pudimos saber si se escribió».** Cada función que muta **vuelve a leer lo
que escribió, dentro de la misma transacción, antes de componer el texto**, y `hecho` es la
conclusión de esa lectura. O la transacción cerró y el efecto está —y se lee—, o no cerró y no hay
efecto ninguno. No hay un tercer estado del que haya que dudar, así que no hay texto que lo diga.
Decirle a la paciente «estamos verificando, tu profesional te confirma» era prometer un mensaje que
nadie iba a mandarle.

Los rechazos de cada función están en su ficha y no se repiten aquí. Quedan tres que no son de
ninguna en particular:

| Situación | Qué devuelve | Qué hace el agente |
|---|---|---|
| El teléfono no tiene ningún vínculo | `no_te_reconocemos`, `cierra: true` | Manda el texto y cierra. Cuesta 1 llamada, la que ya se hizo |
| El vínculo está dado de baja | `paciente_inactivo`, `cierra: true` | Igual. **Esto cierra solo el hueco más grave que había:** antes, quien estaba dado de baja no recibía absolutamente nada |
| Un número que ya no resuelve | La misma lista, reescrita | Vuelve a preguntar cuál. No se le da la opción de intentar otra cosa, porque no hay otra cosa |

**Lo que no está aquí.** Lo que pasa cuando el modelo se atora, cuando llegan dos mensajes a la vez o
cuando el borde se cae no es de este archivo: vive en `docs/07-portero.md`. Y los dos textos que la
paciente llega a leer de esa capa, `vas_muy_rapido` y `se_acabo_el_espacio`, viven literales en el
prompt y cuestan cero llamadas.
