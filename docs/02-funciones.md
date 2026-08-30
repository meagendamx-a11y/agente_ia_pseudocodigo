# 02 · Las diez funciones

Corte: 2026-08-29.

Este archivo es el catálogo completo: **una intención, una función, un texto**. La función recibe
lo poco que la paciente dijo, resuelve por dentro todo lo demás —quién es, con quién, qué cita,
qué plazo, qué precio— y devuelve el texto ya redactado en español. El agente lo copia y lo manda.

Las diez viven en la base. **El modelo corre en nuestra función de borde**, y cada herramienta que
pide es una de estas diez, llamada directo, sin intermediario. Kapso entrega el mensaje y manda la
respuesta; no decide nada de lo que hay aquí.

Las reglas numeradas se citan por número y viven en `docs/00-el-agente.md`. Los textos se citan por
clave y viven completos en `docs/06-textos.md`, que cierra con el índice de todas ellas. **Si una
clave de aquí y `06` difieren, manda `06`**, y la corrección se hace primero allá.

**Ningún ejemplo de este archivo cita datos de producción.** Los nombres son inventados y van
marcados como ejemplo. Las reglas se escriben sobre lo que cada profesional configura, nunca sobre
lo que hoy tiene configurado.

---

## 1. La regla de forma que sólo vive aquí

Valen además, sin repetirlas, **las reglas 17, 18 y 19** de `docs/00-el-agente.md`: ningún
identificador de la base cruza al modelo, la entrada y la salida son planas con todas las claves
presentes, y el «ahora» lo pone el servidor. Estaban copiadas aquí y la copia envejecía sola.

**La identidad no viaja en los parámetros.** El teléfono lo pone la función de borde desde el
mensaje que llegó, y **las diez vuelven a resolver quién es por su cuenta**, nunca de lo que traiga
el mensaje ni de lo que el modelo crea. Si el teléfono no tiene ningún vínculo, cualquiera de las
diez devuelve `no_te_reconocemos` y cierra; si el vínculo está dado de baja, devuelve
`paciente_inactivo` y cierra. Esa comprobación se repite en las diez y no se vuelve a mencionar en
cada ficha.

Ese cerrojo es una defensa contra un sobre viejo, **no el camino normal**: en el camino normal el
borde ya resolvió la identidad antes de correr el modelo y esos dos textos salen del prompt, con
cero llamadas.

---

## 2. La forma del resultado — cuatro claves, iguales en las diez

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
| `espera` | cadena o nulo | **El nombre exacto de lo que falta** en la llamada siguiente: en seis de los siete valores, el de un parámetro; en `filtros`, el del grupo de parámetros de día, fecha y franja. No es un enum que haya que interpretar: es la clave que hay que llenar |
| `hecho` | booleano | Verdadero **sólo** cuando algo se escribió en la base y el servidor lo volvió a leer. El agente no dice «listo» con `hecho: false`, y ésa es toda la regla contra el falso éxito |
| `cierra` | booleano | Si la conversación queda esperando respuesta o no |

**Los siete valores posibles de `espera`:** `servicio`, `modalidad`, `filtros`, `opcion`, `cita`,
`citas`, `confirmado`. Seis son, literalmente, el nombre de un parámetro de alguna de las diez.
`filtros` es el único que no nombra un parámetro sino un grupo: los parámetros de día, fecha y
franja de `buscar_horarios` (§4.2), que se piden juntos y se contestan juntos. Eran nueve: se van
`estrellas` y `comentario`, porque las dos preguntas de la reseña las hace el prompt y ninguna
función las devuelve.

**Qué hace `cierra`.** En falso, se guarda en la memoria de la conversación qué se preguntó, qué
función lo preguntó, qué opciones numeradas se ofrecieron y sobre qué cita se está trabajando; así
un «la 2» del mensaje siguiente aterriza donde debe sin que el modelo tenga que acordarse de nada.
En verdadero no queda nada pendiente y esa memoria se limpia. `cierra` **no frena al agente a media
respuesta**: sólo dice si la conversación quedó abierta.

| Caso | `cierra` |
|---|---|
| `hecho` es verdadero | verdadero: lo que se pidió ya ocurrió y no falta contestar nada |
| `no_te_reconocemos` o `paciente_inactivo` | verdadero |
| `espera` no es nulo | falso: falta un dato y ella tiene que darlo |
| La función dejó salidas abiertas y la respuesta puede ir a otra función | falso. Es el caso de las salidas de `cancelar` con dinero adentro y de la salida de la serie de `reprogramar` |
| El texto cierra la conversación y no hay nada que continuar | verdadero: `sin_horarios`, el acuse del comprobante, la petición de comprobante de `confirmar` con prepago, y `mis_citas` |

**Una salida abierta va con `espera: null` y `cierra: false`, nunca con un `espera` prestado.** Son
tres: `reprogramar_recurrencia_dos_salidas`, `cancelar_dinero_adentro` y
`cancelar_dinero_adentro_con_proxima`. `cancelar_dinero_adentro_tarde` **no es una salida abierta**:
fuera de plazo se cancela y ya, así que es un cierre —muta, `hecho: true`, `cierra: true`— y no
pregunta nada. Poner ahí `confirmado`
manda la respuesta a la rama contraria: un «reprográmala» después de la oferta de cancelar acabaría
**cancelando la cita que ella pidió mover**, con dinero adentro. Un `espera` que nombra el
parámetro equivocado no es un detalle de redacción: es el enrutamiento haciendo lo contrario de lo
que se pidió.

**No hay campo de error, y es deliberado.** Un código que el agente no puede usar para nada
distinto de leer un texto es ruido que le enseña a ramificar. Un «no se puede» del negocio es un
`texto` con su salida y `hecho: false`. Los motivos siguen existiendo donde sirven: en la bitácora
del servidor. El §9 desarrolla esto.

**La instrucción de mandar el texto tal cual vive en el prompt, no en el resultado.** Las
instrucciones metidas dentro de un resultado se pueden ignorar, o marcar como inyección.

### 2.1 El freno que ven las funciones: tres llamadas por mensaje

No hay presupuesto por gestión. Una gestión se reparte entre varios mensajes de ella, y **cada
mensaje trae sus tres llamadas**. Agendar gasta cuatro llamadas en total y ninguna comparte mensaje
con otra, así que el tope no lo roza.

El tope existe para una sola cosa: **un modelo confundido llama funciones en círculo y nadie lo
detiene**. Tres es suficiente porque la única concatenación autorizada —leer una lista y volver a
llamar con el número— son dos llamadas en el mismo mensaje.

**El tope cuenta cada intento**, tanto la llamada que llega a la base como la que el borde rechaza
por venir malformada o por no ser una de las diez. Si no contara los rechazos, el modo de fallo
para el que se escribió el tope —parámetros mal compuestos, una y otra vez— sería justo el que
nunca lo tocara.

Aparte del tope hay **un candado por conversación**: si llegan dos mensajes del mismo teléfono al
mismo tiempo, el segundo espera a que el primero termine. Sin él, «agéndame el martes» repetido dos
veces son dos citas. Los dos mecanismos están en `docs/07-portero.md`.

---

## 3. La tabla de las diez

Siete escriben, tres leen.

| # | Lo que ella escribe | Función | Muta | Aviso a la profesional |
|---|---|---|---|---|
| 1 | «quiero una cita» · «¿cuánto cuesta?» | `ver_servicios` | no | — |
| 2 | «el miércoles» · «en la tarde» · «mañana» | `buscar_horarios` | no | — |
| 3 | «la 3» · «a las 12» | `agendar` | sí (segunda llamada) | `appointment_created_by_patient` |
| 4 | «sí voy» · «ahí estaré» · «ambas» | `confirmar` | sí (salvo prepago sin comprobante) | `appointment_confirmed`, uno por cita |
| 5 | «no voy a poder» · «muévela» | `reprogramar` | sí (llamada final) | `appointment_rescheduled_by_patient`, o `appointment_cancelled_by_patient` cuando la salida es dejarla en la próxima de su serie |
| 6 | «cancélala» | `cancelar` | sí | `appointment_cancelled_by_patient` |
| 7 | «¿la puedo tomar en línea?» | `cambiar_modalidad` | sí (segunda llamada) | `modality_changed_by_patient` |
| 8 | «[imagen]» · «ya pagué» | `mandar_comprobante` | sí (segunda llamada) | `payment_proof_received`, y `appointment_confirmed` cuando el comprobante confirma la cita |
| 9 | «5 estrellas, me ayudó mucho» | `dejar_resena` | sí | **ninguno**, a propósito |
| 10 | «¿dónde es?» · «hola» · «¿qué tengo?» · «¿cuánto debo?» | `mis_citas` | no | — |

**Son diez, y pasar el pago no es una de ellas:** es un booleano de dos de ellas,
`cancelar(pasa_el_pago)` y `reprogramar(a_la_proxima)`. Se gana lo que importa: **el modelo ya no puede mover dinero por
iniciativa propia sobre una cita que él eligió**. La salida sólo existe cuando el servidor ya la
ofreció, y sólo el servidor sabe si hay dinero adentro, si alcanza el plazo y cuál es el destino.

**Fuera del catálogo, y a propósito, con cero llamadas:** crisis, hablar con una persona,
devoluciones y descuentos, no te entendí, se acabó el espacio, teléfono desconocido, cuenta dada de
baja, con cuál profesional, las dos preguntas de la reseña, y `pendiente_lo_otro`. Viven literales
en el prompt (`docs/05-prompt.md`).

**La crisis va antes que todo lo demás, en todos los estados.** No espera a saber si el teléfono
tiene vínculo, y el borde nunca contesta un texto de identidad antes de correr el modelo. Un «ya no
aguanto» desde un teléfono que no conocemos tiene que recibir la línea de ayuda, no una liga al
directorio.

**Los dos textos de identidad cuestan cero llamadas.** El borde resuelve el vínculo antes de armar
el sobre y el prompt los manda leyendo `estado`. El cerrojo dentro de las diez (§1) sigue ahí, pero
como defensa, no como camino.

**No hay función de recursos.** La plantilla `patient_resource_delivery` invita a recoger materiales
y hoy nadie consume esa cola. Si ella contesta a esa plantilla, se contesta con `fuera_de_alcance`.
Prometer un material que nadie entrega es exactamente el falso éxito contra el que está armado el
resto.

---

## 4. Las diez fichas

---

### 4.1 `ver_servicios`

**Intención.** «Quiero una cita». «¿Cuánto cuesta?». «¿Tienes terapia de pareja?».

| Parámetro | Tipo | De dónde sale |
|---|---|---|
| `pidio` | cadena ≤ 60, o nulo | El nombre del servicio que ella nombró, tal cual. Sólo se llena cuando pidió uno por su nombre |
| `confirmado` | booleano o nulo | Nulo mientras no se le haya preguntado. Verdadero cuando el aviso de que ya tiene una serie viva se dio y ella dijo que sí quiere otra sesión aparte |

**Qué hace por dentro.**

1. Comprueba que esa profesional tenga al menos un bloque de horario guardado y el agendado por
   parte de la paciente encendido. Si falta cualquiera de las dos, devuelve `sin_horarios` y ahí
   termina: no tiene sentido enseñar precios de algo que no se puede apartar.
2. Resuelve los servicios: **los asignados si tiene alguno; el catálogo activo completo de su
   profesional si no tiene ninguno.** No es una marca, es un corte: con asignados, los demás no se
   enseñan.
3. **Hasta ocho servicios, que es la única excepción a las cinco opciones de la regla 7.** El
   catálogo es corto, estable y no caduca como una lista de horas, y un catálogo de seis lo tiene
   cualquiera. Si tuviera más de ocho, se enseñan ocho y el mismo texto le pide que diga cuál busca;
   `pidio` es la puerta para lo que quedó fuera.
4. Empareja `pidio` contra esa lista. **La regla del emparejamiento, que antes no estaba escrita:**
   sin acentos, sin mayúsculas, contra el nombre completo y contra cada palabra de tres letras o
   más. Si empareja con más de uno, se enseña la lista en vez de escoger.
   - Empareja con uno que **sí** tiene → `servicios_uno`, y se sigue derecho a preguntar día y hora.
     Volver a enseñarle la lista entera es preguntarle lo que acaba de decir.
   - Empareja con uno del catálogo de su profesional que **no le está asignado** →
     `servicio_no_asignado`: que se lo pida a su profesional para que se lo habilite.
   - No empareja con nada del catálogo de su profesional → `servicio_no_existe`. Decirle «pídele que
     te lo habilite» de algo que su profesional no da es falso.
5. Calcula el precio efectivo, en tres escalones y en este orden: si el servicio es gratis, cero; si
   esa paciente tiene precio preferente, ése; si no, el de catálogo. Es la misma fórmula con la que
   se graba el dinero al crear la cita, así que el número que se dice y el que se cobra no pueden
   separarse. **La palabra «preferente» no sale nunca al mensaje: se dice el número y ya**, porque
   preferente no quiere decir descuento y puede salir más caro. Detalle en `docs/03-dinero.md`.
6. Compone cada línea con **nombre, precio y modalidad**. Los tres hacen falta: dos servicios de una
   misma profesional se pueden llamar igual y costar distinto, y un nombre puede decir «sin costo» y
   tener precio. **El precio sale del número, nunca del nombre.** Y decir la modalidad aquí es lo que
   permite que ella conteste día, hora y modalidad en un solo mensaje.
7. Hace el aviso previo **sólo cuando el servicio tiene una serie viva**: compone el ritmo, el día y
   la hora **de la serie** y la fecha de su próxima cita **de la agenda** —son dos fuentes distintas,
   y leer el día de la cita miente en cuanto una ocurrencia se movió—. Quien tiene una cita suelta y
   pide otra ya no recibe aviso: el cierre de agendar nombra servicio, día y hora, y `mis_citas`
   está a una pregunta. El aviso de la serie sí atrapa un error real.
8. Redacta y devuelve.

**Resultado.**

| Situación | `texto` | `espera` | `hecho` | `cierra` |
|---|---|---|---|---|
| Varios servicios | `servicios_varios` | `servicio` | falso | falso |
| Uno solo, o pidió uno que sí tiene | `servicios_uno` | `filtros` | falso | falso |
| Pidió uno que no tiene asignado | `servicio_no_asignado` | nulo | falso | falso |
| Pidió uno que su profesional no da | `servicio_no_existe` | `servicio` | falso | falso |
| Con serie viva | `aviso_recurrencia` | `confirmado` | falso | falso |
| Sin horario guardado, o agendado apagado | `sin_horarios` | nulo | falso | **verdadero** |

`servicio_no_asignado` va con `espera: null` porque **no enseña lista**: es una salida abierta, y
pedir un número contra una lista que no se escribió es el camino más corto a que el modelo se
invente uno.

**El `confirmado: false` de esta función no tiene texto propio, y es correcto.** Un «no» al aviso de
la serie significa «mejor muevo la que ya tengo», que es otra intención: el prompt la enruta a
`reprogramar`.

**Muta:** no. **Aviso:** ninguno.

**Errores y su remediación.** Ninguno propio. La única salida que no ofrece nada es `sin_horarios`,
y no es un error: es la respuesta correcta, y por eso cierra en vez de invitar a insistir.

---

### 4.2 `buscar_horarios`

**Intención.** «El miércoles». «En la tarde». «Mañana». «Cuando sea». Y también la segunda mitad de
mover una cita.

| Parámetro | Tipo | De dónde sale |
|---|---|---|
| `servicio` | entero 1..8, o nulo | Número de la lista que escribió `ver_servicios`. Nulo si sólo tiene uno. Es el único número que llega a 8, por la excepción de §4.1 |
| `modalidad` | `"en_linea"` \| `"presencial"` \| nulo | Lo que ella dijo. Nulo si el servicio admite una sola |
| `dias` | arreglo de nombres de día en español, máximo 7 | Lo que ella dijo, tal cual. El servidor empareja **sin acentos y sin mayúsculas**: «Miercoles», «miércoles» y «MIÉRCOLES» son el mismo día |
| `fechas` | arreglo de enteros 1..31, máximo 5 | El número del día del mes tal cual, **sin mes y sin año**. El servidor lo resuelve a su próxima ocurrencia dentro de los 30 días |
| `relativo` | `"hoy"` \| `"manana"` \| `"pasado_manana"` \| `"esta_semana"` \| `"proxima_semana"` \| `"fin_de_semana"` \| nulo | La palabra que ella usó, **sin convertirla a fecha** |
| `hora` | `"HH:MM"` o nulo | Sólo cuando dijo una hora exacta |
| `parte_del_dia` | `"manana"` \| `"mediodia"` \| `"tarde"` \| `"noche"` \| nulo | Cuando dijo una franja, en los cuatro literales sin acento. **Nunca viaja junto con `hora`** |

**`relativo` existe porque «¿tienes mañana?» es la forma normal de pedir día por WhatsApp.** Sin él,
el modelo tendría que saber qué día es hoy y sumar uno, que es exactamente lo que la regla 1 prohíbe
y lo que la regla 19 le impide: el sobre no lleva la fecha de hoy. Es el mismo patrón de
`parte_del_dia`: el modelo copia la palabra, el servidor la convierte con su propio «ahora».

`hora` y `parte_del_dia` son dos formas de decir la misma ventana, y quien las convierte en un par
de horas es el servidor, con el horario de esa profesional. **El modelo nunca mapea «en la tarde» a
un rango**, porque la tarde de una profesional que atiende de 3:00 a 7:00 no es la de otra.

**La cita que se está moviendo no viaja como parámetro:** la recupera el servidor de la
columna `subject` de la memoria de la conversación (§6). Sería el único número que cruzara
de una función a otra, y cada excepción a «un número sólo vale contra la última lista de esa
función» es una puerta por la que un número se resuelve contra la lista equivocada. Además no
funcionaba: con una sola candidata `reprogramar` no emite lista, así que no había número que mandar
y la exclusión no ocurría —que es el camino normal, porque la mayoría tiene una sola cita futura—.

**Qué hace por dentro.** Recorre los treinta días del horizonte, aplica los filtros, respeta la
anticipación mínima que esa ficha pide, quita los traslapes, excluye la cita que se mueve —para que
no se tape a sí misma ni tape a sus vecinas—, recorta a cinco y etiqueta cada opción con el nombre
del día, su fecha y la hora. **Es una sola llamada aunque el servidor revise treinta días:** el tope
cuenta viajes del agente, no trabajo de la base.

**La anticipación mínima corta al agendar y también al reprogramar.** Son dos plazos distintos de la
misma ficha y hay que decirlos por separado, porque mezclados se contradicen:

- **El aviso de cambio** decide si hay cargo. No bloquea: mover se permite sin importar cuánto falte.
- **La anticipación mínima** decide **desde cuándo** se puede tomar un horario. Vale igual para una
  cita nueva y para el horario nuevo de una que se mueve.

Los dos pueden aparecer en la misma gestión: primero se le avisa que se cobran las dos sesiones, y
después la búsqueda sólo le ofrece días a partir del primero que la anticipación permita. No es un
error, es lo correcto. **La anticipación corta al escoger un horario, no al mover dinero:** dejar el
pago en una ocurrencia de la serie que ya existe no la toca, porque ahí no se está tomando un
horario nuevo. Y cancelar no la toca nunca, porque cancelar no toma ningún horario.

**Las horas se ofrecen en punto.** Si el horario de esa profesional abre a una hora rara, ese pedazo
se desperdicia, y se prefiere desperdiciarlo a llenar la lista de horas incómodas. **Si ella pide una
hora concreta por su nombre —«a las 4:30», «a las 4:15»— se revisa si el motor la tiene y se le
ofrece.** El motor entrega candidatos cada quince minutos, así que cualquier minuto que ella nombre
es ofrecible; lo que no se hace es ponerlo en una lista que ella no pidió. Decir «media hora» era
más estrecho que el motor y que el parámetro.

**La modalidad se comprueba antes que la agenda.** Si el servicio no admite la que ella pidió, se
dice y ahí se acaba: `modalidad_no_disponible_en_servicio`. Contestar «los martes y miércoles no hay
consultas» a quien pidió presencial un servicio que sólo existe en línea es falso e irrecuperable,
porque la manda a buscar otro día cuando lo que hay que cambiar es la modalidad.

Si el servicio admite las dos modalidades y `modalidad` llegó en nulo, no busca: pregunta cuál, y
ahí se acaba la llamada. Por eso `ver_servicios` dice la modalidad de cada servicio: para que ella
conteste las dos cosas juntas y esta rama no se dispare.

**Resultado.**

| Situación | `texto` | `espera` | `hecho` | `cierra` |
|---|---|---|---|---|
| Hay horas | `horarios_lista` | `opcion` | falso | falso |
| Dos días con las mismas horas | `horarios_lista_compartida` | `opcion` | falso | falso |
| Falta la modalidad | `horarios_falta_modalidad` | `modalidad` | falso | falso |
| Ese servicio no se da en esa modalidad | `modalidad_no_disponible_en_servicio` | `modalidad` | falso | falso |
| No trabaja a esa hora, y se proponen horas de ese mismo día | `sin_hueco_fuera_de_horario` | `opcion` | falso | falso |
| No trabaja esos días, y se proponen otros días, sin hora | `sin_hueco_dias_que_no_trabaja` | `filtros` | falso | falso |
| Esos días concretos no va a estar, y se proponen horas de otro día | `sin_hueco_ausencia` | `opcion` | falso | falso |
| Sí trabaja, está llena, y se proponen horas con su día | `sin_hueco_lleno` | `opcion` | falso | falso |
| Es demasiado pronto, y se proponen horas del primer día que alcanza | `sin_hueco_demasiado_pronto` | `opcion` | falso | falso |
| La fecha que pidió cae más allá del horizonte | `fuera_del_horizonte` | `filtros` | falso | falso |

**`espera` se parte por lo que la lista trae.** Los cinco motivos **llevan alternativas numeradas de
verdad**, no una frase: un motivo sin alternativas obliga a volver a preguntar y cuesta otra llamada
y otro mensaje. **Cuatro de los cinco traen horas apartables**, así que quedan esperando `opcion`,
porque ella va a contestar «la 2» y ese 2 tiene que aterrizar en `agendar`. Con `filtros`, ese «la
2» se iría a `buscar_horarios`, que no tiene parámetro `opcion`, y la gestión se atora justo cuando
ella ya había escogido. **`sin_hueco_dias_que_no_trabaja` es el único que propone otra ventana** —su
lista son días, sin hora—, y por eso es el único que espera `filtros`. El reparto de los cinco está
en `docs/06-textos.md` §3.

**«Es demasiado pronto» no dice cuánta anticipación pide la profesional.** Dice cuál es el día más
cercano al que sí alcanza, y ahí van las horas. El número no le sirve de nada y convierte un hueco
de agenda en un reproche a quien la atiende. `{plazo}` se queda sólo en los avisos de cambio.

**Las fechas se resuelven siempre hacia adelante.** «El 20» un día 27 acaba en el 20 del mes que
viene, y la única corrección es que la etiqueta de cada opción lleva el mes. Si esa próxima
ocurrencia cae fuera de los treinta días, no se resuelve a nada: sale `fuera_del_horizonte`. El
mismo texto sirve para «¿tienes algo para diciembre?», que se detecta porque no llegó `dias`, ni
`fechas`, ni `relativo`.

Si dos días traen las mismas horas **se numeran una sola vez** y se dice que son de esos dos días.
Numerarlas dos veces es enseñarle diez opciones que en realidad son cinco. Si difieren, se numeran
día y hora juntos. El detalle del motor está en `docs/04-horarios.md`.

**La marca de zona la pone el servidor en todo mensaje que diga una hora**, y la regla de
composición está en `docs/06-textos.md` §2.0.1. En las listas va dentro del encabezado —«…tengo
estas horas (Hora CDMX):»— porque ahí tiene que estar **antes** de que escoja, no después. En los
demás mensajes con hora va como última línea. Ninguna función la escribe dentro de su texto.

**Muta:** no. **Aviso:** ninguno.

**Errores y su remediación.** Un `servicio` que ya no resuelve lo contesta esta misma función
reemitiendo la lista de servicios: no cuesta una llamada más y no rompe la propiedad de que cada
número resuelve contra la lista que lo produjo.

---

### 4.3 `agendar`

**Intención.** «La 3». «A las 12». Ella escogió.

| Parámetro | Tipo | De dónde sale |
|---|---|---|
| `opcion` | entero 1..5 | Número de la lista que escribió `buscar_horarios` |
| `dia` | nombre del día en español, o nulo | **Sólo cuando la lista era compartida entre dos días.** Nulo en cualquier otro caso |
| `confirmado` | booleano o nulo | Nulo mientras la propuesta no se haya dado. Verdadero cuando ella dijo que sí; falso cuando dijo que no |

**`dia` existe porque en la lista compartida el número identifica la hora y no el día.** «El martes 1
y el miércoles 2 tengo estas horas: 1. 3:00 2. 4:00 3. 5:00» y ella contesta «la 2, el martes»: sin
`dia`, ese «martes» no viaja en ninguna clave y la decisión más cara de agendar —qué día se aparta—
se tomaría sin el dato. Si la lista era compartida y `dia` llega en nulo, **no se aparta nada**: se
reemite la misma lista compartida, con la misma numeración, esperando otra vez `opcion`. Es el
segundo texto que dos funciones comparten, junto con `horario_ocupado`.

**Agendar confirma antes de apartar.** La primera llamada no escribe nada: propone la cita completa
—día, hora, modalidad— y pregunta si la aparta. La segunda, con `confirmado: true`, la crea. Cuesta
un mensaje más y se paga solo: **agendar es la única acción que crea algo de la nada**, la cita
creada por error ya le llegó a la profesional como aviso, y la paciente no puede editarla desde la
app.

**Y decir que no es la otra mitad de esa pregunta.** Con `confirmado: false` no se aparta nada y se
contesta `agendar_no_aparta`, con `hecho: false` y `cierra: true`. Por eso `confirmado` es booleano
**o nulo**: sin el nulo no hay forma de distinguir «dijo que no» de «todavía no se le preguntó», y
las dos cosas caían en el mismo falso.

**Al escoger la hora se le dice el día**, en la propuesta y en el cierre. Y si ella ya había dicho
día y hora juntos, eso ya está determinado y no se le vuelve a preguntar.

**Qué hace la llamada que escribe.** Resuelve el número contra su propia lista, **vuelve a comprobar
que el hueco siga libre dentro de la misma escritura**, aparta la cita, escribe el aviso a la
profesional en la misma transacción, vuelve a leer lo que escribió y compone el texto con eso —no
con lo que pensaba hacer—.

La comprobación del hueco no es adorno. Entre la lista y la escritura pasan dos mensajes de ella, y
el paso de confirmación agrega uno más: en ese rato la profesional pudo apartar esa misma hora desde
su app. **Si se ocupó, no devuelve un código: vuelve a buscar por dentro y ofrece las alternativas
del mismo día**, renumeradas, con `hecho: false`. Una llamada, no dos. Y **el número que llegue
después vuelve a proponer, no aparta**: la propuesta existe porque agendar crea algo de la nada, y
eso no cambia porque la hora anterior se haya ocupado.

**Cómo nace la cita, y qué pasa con el dinero.**

- **No editable por la paciente.** La cita se marca `is_editable = false`. Lo que ella puede hacer
  con su cita es lo que este agente le ofrece, no lo que un formulario le deje tocar. La base además
  lo exige para que una cita pueda nacer confirmada.
- **Cobra después y faltan más de 26 horas:** nace sin confirmar, con su cobro pendiente, y **no se
  menciona pago**. Recibe la petición de confirmación cuando toque.
- **Cobra después y faltan menos de 26 horas:** nace **confirmada**, porque el aviso automático ya
  no le va a llegar. Es un solo número para todas las profesionales y es el mismo que usa el trabajo
  programado, para que el agente y el aviso no se pisen. La base pone un techo de 48 horas para que
  una cita nazca confirmada; nuestras 26 caben dentro.
- **Cobra antes:** nace apartada, **sin confirmar y con el comprobante solicitado, siempre**, sin
  importar cuánto falte. Lo que confirma esa cita es el comprobante, no un «sí voy». **Ahí se queda:
  nada la cancela sola.**
- **Con prepago dentro de las 26 horas no se encola el recordatorio.** El cierre acaba de darle los
  datos para transferir; la plantilla llegaría minutos después pidiéndole lo mismo, y ése es el
  segundo mensaje que más rápido le enseña que del otro lado no hay nadie leyendo.
- **Precio efectivo cero:** el cobro nace sin costo y no se menciona pago, comprobante ni
  transferencia en ninguna variante del cierre.

**Resultado.**

| Situación | `texto` | `espera` | `hecho` | `cierra` |
|---|---|---|---|---|
| Propuesta | `agendar_pregunta_confirmar` | `confirmado` | falso | falso |
| Confirmado, cobra después | `agendar_cierre_cobra_despues` | nulo | **verdadero** | verdadero |
| Confirmado, cobra antes | `agendar_cierre_prepago` | nulo | **verdadero** | verdadero |
| Dijo que no a la propuesta | `agendar_no_aparta` | nulo | falso | verdadero |
| El hueco se ocupó | `horario_ocupado` | `opcion` | falso | falso |
| La lista era compartida y no dijo el día | `horarios_lista_compartida` | `opcion` | falso | falso |

**Un solo cierre de prepago, con el hueco `{como_pagar}`.** Antes eran dos claves, con datos de
transferencia y sin ellos, y las dos repetían el texto entero para cambiar una frase. El servidor
llena el hueco con los datos del perfil o con la salida de pedírselos a su profesional; los dos
valores literales están en la tabla de huecos de `06`. **El agente no sabe cuál de los dos existe:**
llega escrito.

**La cuenta de la gestión: cuatro llamadas.** `ver_servicios`, `buscar_horarios`, la propuesta y la
creación. Cada una contesta un mensaje distinto de ella, así que **ninguna comparte mensaje con otra
y el tope de tres nunca se acerca**. Si el hueco se ocupa y hay que proponer otra vez, la gestión
sube a seis. Si la profesional no tiene ni un bloque de horario, la gestión entera es una:
`ver_servicios` ya lo dice.

**Muta:** sí, con `confirmado: true`. **Aviso:** `appointment_created_by_patient`, con
`patient_first_name`, `patient_last_name`, `appointment_starts_at`, `appointment_ends_at` y
`appointment_modality`.

**Errores y su remediación.** Los tres traen su salida dentro del texto: el hueco ocupado ofrece
alternativas del mismo día, la lista compartida sin día se reemite, y un `opcion` que ya no resuelve
reemite la lista con los mismos filtros.

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

**Con prepago, decir «sí voy» NO confirma.** La función no muta y devuelve `comprobante_pedido`, con
el hueco `{como_pagar}`. Lo que confirma es el archivo.

**Salvo que el comprobante ya haya llegado.** Si esa cita ya tiene comprobante recibido, no se le
pide de nuevo —pedir dos veces el mismo archivo la hace dudar de que el primero llegó, y la base
admite un solo comprobante por cobro—. En ese caso «sí voy» confirma normal y muta.

**Resultado.**

| Situación | `texto` | `espera` | `hecho` | `cierra` |
|---|---|---|---|---|
| Una candidata, cobra después | `confirmar_cierre` | nulo | **verdadero** | verdadero |
| Una candidata, cobra antes y ya hay comprobante | `confirmar_cierre` | nulo | **verdadero** | verdadero |
| Varias confirmadas de una vez | `confirmar_cierre_ambas` | nulo | **verdadero** | verdadero |
| Cobra antes y no hay comprobante | `comprobante_pedido` | nulo | falso | verdadero |
| Varias esperando | `confirmar_lista` | `citas` | falso | falso |
| Ninguna esperando | `confirmar_nada_que_confirmar` | nulo | falso | verdadero |

**No hay renglón para «ya estaba confirmada».** Una cita ya confirmada no entra en las candidatas,
así que no puede salir por ahí; y si es la única que tenía, lo que sale es
`confirmar_nada_que_confirmar`, que ya lo dice con su hora adentro.

**Muta:** sí, salvo la rama de prepago sin comprobante. **Aviso:** `appointment_confirmed`, con las
mismas cinco claves de `agendar`, **uno por cada cita confirmada**.

**Errores y su remediación.** Si la cita dejó de estar programada, se le dice qué sí tiene y se
ofrece agendar.

---

### 4.5 `reprogramar`

**Intención.** «No voy a poder». «Muévela».

**Mover se permite sin importar cuánto falte. Lo que sí manda es la anticipación mínima:** el
horario nuevo tiene que caber en ella, igual que si estuviera agendando de cero. Son dos cosas
distintas y decirlas mezcladas —«se permite siempre»— era prometerle un día que la búsqueda le iba a
negar un mensaje después. El aviso de cambio no bloquea: sólo decide si hay cargo.

| Parámetro | Tipo | De dónde sale |
|---|---|---|
| `cita` | entero 1..5, o nulo | Número de la lista que escribió esta misma función. Nulo en la primera llamada |
| `opcion` | entero 1..5, o nulo | Número de la lista de `buscar_horarios` |
| `confirmado` | booleano o nulo | Nulo mientras no se le haya propuesto nada. Verdadero cuando dijo que sí a lo último que el servidor le propuso; falso cuando dijo que no |
| `a_la_proxima` | booleano | Verdadero **sólo** cuando ella aceptó la salida de la serie que el servidor ya le ofreció |

**`a_la_proxima` no es una puerta que el modelo pueda abrir solo.** El único texto que la menciona es
`reprogramar_recurrencia_dos_salidas`, y ese texto lo compone el servidor después de comprobar que
hay serie viva y próxima ocurrencia. La cita la pone el servidor, que ya la sabe.

**No pregunta servicio: viene de la cita que se mueve. Sí pregunta modalidad**, cuando ese servicio
admite las dos: mover la cita es justo cuando cambia el motivo por el que iba a ir en persona. La
pregunta va **pegada a la del día, en el mismo texto** —segundo párrafo condicional de
`reprogramar_pregunta_dia`—, y la respuesta viaja a `buscar_horarios` dentro de los filtros. Como
clave aparte no podía existir: un mensaje no puede ser dos resultados con dos `espera` distintas.

**Candidatas.** Sólo futuras, de una serie sólo la más próxima.

**Qué hace por dentro.**

- **Primera llamada.** Nombra la cita que se mueve, la anota en `subject`, y pregunta el día —y la
  modalidad si aplica—. Calcula si el aviso llega a tiempo comparando cuánto falta contra el plazo
  **de esa ficha**. Si no alcanza, el texto lleva ese plazo adentro y la advertencia de que se cobran
  las dos sesiones. **Un texto con «24 horas» escrito a mano le miente a las pacientes de quien pide
  12, y le miente en la dirección peligrosa** (regla 2).
- **La salida de la serie.** Si la cita pertenece a una serie viva y ella ya tiene agendada la
  siguiente ocurrencia, la primera llamada ofrece una segunda salida: **dejarla en esa próxima en
  vez de buscar un hueco nuevo**. Es lo que casi siempre quiere quien falta a una sesión de una
  serie semanal, y no gasta un hueco de la agenda. Si acepta, no se reprograma: **la cita vieja queda
  cancelada** y la ocurrencia que ya existía no se toca. **Esa salida se ofrece haya pago o no lo
  haya**: consolidar la serie es una operación de agenda, no de dinero, y antes moría con «esa cita
  no tiene ningún pago tuyo adentro» justo cuando ella acababa de aceptar lo que le ofrecimos.
- **Llamada final.** Mueve la cita, o ejecuta la salida de la serie. Antes de escribir **relee el
  estado de la cita de origen dentro de la misma transacción** (§4.5 y §4.6 lo comparten): entre la
  primera llamada y ésta pasan dos mensajes de ella, y en ese rato la profesional pudo cancelarla,
  moverla o cerrarla desde su app.
- El cierre **no repite el aviso de cobro**, porque ya se dio antes de mover.

**El dinero, partido por el reloj.** Es la mitad del comportamiento de esta función y no se puede
leer de otro lado:

- **Con tiempo mínimo.** El cobro viejo se salda como **pasado adelante** y el nuevo **hereda lo que
  el viejo tenía**: acreditado nace acreditado; con comprobante, el comprobante se copia y **no se le
  vuelve a pedir**; pendiente a secas nace pendiente y ahí manda cómo cobra esa profesional
  —comprobante si cobra antes, nada si cobra después—; sin costo nace sin costo. **La petición de
  comprobante se vuelve a sellar sobre el cobro nuevo cuando la cita nueva sigue siendo de prepago**,
  porque el camino que la base ya tiene sólo la conserva si había archivo, que es justo el caso
  contrario al de la cita de prepago sin pagar. Sin ese sellado, la profesional deja de ver «se pidió
  y no ha llegado», que es la señal entera del prepago.
- **Sin tiempo mínimo.** El cobro viejo **no se salda**: se queda congelado tal como esté, con la
  decisión abierta para la profesional. El nuevo **nace desde cero**, sin heredar nada, tratado según
  cómo cobre. Por eso se cobran dos sesiones y por eso se avisa **antes** de mover. Al congelar se
  reclasifica el motivo del cobro, de sesión a cambio: sin eso la fila desaparece de la facturación
  aunque la profesional decida cobrar.
- **El caso duro, dicho en voz alta:** si cobra por adelantado, ella ya mandó comprobante, y mueve
  sin tiempo mínimo, su comprobante se queda en la cita vieja y la nueva le pide otro. Va a pagar dos
  veces salvo que su profesional condone la primera. Eso es lo que significa «se cobran las dos
  sesiones».
- **La salida de la serie sin tiempo mínimo: el pago no viaja.** La cita vieja queda cancelada con su
  cobro congelado, y el cierre lo dice, sin la frase del pago mudado.
- **El destino de un pago que sí viaja es la próxima ocurrencia viva de la serie de esa cita.** No
  «la primera cita posterior del mismo servicio»: no son el mismo conjunto, y el texto nombraría un
  día mientras el dinero acaba en otro. Si la cita no es de una serie, no hay destino y la salida no
  se ofrece.

**El aviso de cobro se da siempre que el precio efectivo sea mayor que cero**, aunque ella no haya
pagado nada: es lo único que hace que el plazo signifique algo para quien cobra al cerrar. **Que se
mueva dinero, y a dónde, sólo se menciona cuando hay dinero adentro.** Son dos preguntas distintas y
mezclarlas deja la mitad de las cancelaciones tardías sin decidir. Con precio cero no se menciona
dinero: decirle «se te cobra» de una sesión de cero pesos es mentirle en la otra dirección. La
separación completa está en `docs/03-dinero.md` §5.1.

**Resultado.**

| Situación | `texto` | `espera` | `hecho` | `cierra` |
|---|---|---|---|---|
| Varias candidatas | `reprogramar_lista` | `cita` | falso | falso |
| Primera llamada, a tiempo | `reprogramar_pregunta_dia` | `filtros` | falso | falso |
| Primera llamada, sin tiempo mínimo | `reprogramar_aviso_tardio` | `confirmado` | falso | falso |
| La cita es de una serie con próxima agendada | `reprogramar_recurrencia_dos_salidas` | nulo | falso | **falso** |
| Pidió una ocurrencia que no es la más próxima | `reprogramar_solo_la_proxima` | `confirmado` | falso | falso |
| Dijo que no a lo que se le propuso | `reprogramar_no_mueve` | nulo | falso | verdadero |
| Llamada final, cobra después o sin costo | `reprogramar_cierre` | nulo | **verdadero** | verdadero |
| Llamada final, la cita nueva es de prepago | `reprogramar_cierre_prepago` | nulo | **verdadero** | verdadero |
| Salida de la serie, con tiempo mínimo | `reprogramar_pasada_a_la_proxima` | nulo | **verdadero** | verdadero |
| Salida de la serie, sin tiempo mínimo | `reprogramar_pasada_a_la_proxima_tarde` | nulo | **verdadero** | verdadero |
| La próxima se canceló o ya tiene su propio pago | `cancelar_cierre`, coletilla de pago registrado | nulo | **verdadero** | verdadero |
| El hueco elegido se ocupó | `horario_ocupado` | `opcion` | falso | falso |
| La cita de origen ya no está | `cita_ya_no_esta` | nulo | falso | falso |
| La cita de origen cambió de día u hora | `cita_cambio_de_lugar` | nulo | falso | falso |
| La cita de origen ya pasó | `cita_ya_paso` | nulo | falso | falso |
| Sin ninguna candidata | `reprogramar_nada_que_mover` | nulo | falso | verdadero |

`reprogramar_recurrencia_dos_salidas` deja la conversación abierta **sin `espera`**, porque la
respuesta puede ir a dos sitios: seguir aquí buscando día, o volver aquí con `a_la_proxima: true`.

**`reprogramar_cierre_prepago` existe porque el cierre de hoy no dice cómo pagar.** Con prepago, la
cita nueva nace con su propio cobro pendiente —siempre sin tiempo mínimo, y también a tiempo cuando
el viejo era un pendiente a secas—, y el cierre tiene que llevar el monto y el hueco `{como_pagar}`,
igual que el de agendar. Sin eso, ella se entera por la plantilla de las 26 horas, o no se entera.

**Los tres textos de la cita que se movió sola no cierran la conversación:** los tres traen su
salida —agendar otra, mover la que ahora existe, o agendar una nueva— y por eso van con
`cierra: false`.

**Muta:** sí, en la llamada final. **Aviso:** `appointment_rescheduled_by_patient`, con
`patient_first_name`, `patient_last_name`, `previous_starts_at`, `previous_modality`,
`new_starts_at` y `new_modality`. **Con `a_la_proxima: true` el aviso es
`appointment_cancelled_by_patient`**, porque eso es lo que de verdad le pasa a la cita.

**Errores y su remediación.** Están todos en la tabla, y todos llevan la salida dentro del texto.
`horario_ocupado` es el mismo texto que usa `agendar`.

---

### 4.6 `cancelar`

**Intención.** «Cancélala». Se permite siempre, con dinero adentro o sin él: cancelar no toma ningún
horario, así que la anticipación mínima no la toca, y el plazo sólo decide si queda un cargo.

| Parámetro | Tipo | De dónde sale |
|---|---|---|
| `cita` | entero 1..5, o nulo | Número de la lista que escribió esta misma función. Nulo en la primera llamada |
| `confirmado` | booleano o nulo | Nulo mientras no se le haya preguntado. Verdadero cuando dijo que cancele de todos modos; falso cuando dijo que mejor no |
| `pasa_el_pago` | booleano | Verdadero **sólo** cuando ella aceptó la salida de dejar el pago en la próxima de su serie, que el servidor ya le ofreció |

**Candidatas.** Sólo futuras, de una serie sólo la más próxima.

**«Dinero adentro» tiene una definición exacta y una sola:** el cobro está acreditado, o hay un
comprobante pegado. **Una petición sellada sin archivo no es dinero adentro.** Y acreditado y
comprobante **no son excluyentes**: lo normal en un prepago resuelto es tener los dos. La
precedencia está escrita una sola vez, en `docs/03-dinero.md` §2: **acreditado gana siempre sobre
comprobante**.

**Cancelar necesita función propia, y hay que decirlo.** La función de cancelación que ya usa la app
exige que quien cancela tome una decisión de dinero —condonar, acreditar, pedir comprobante o
retener— y sin ella no cancela. **El agente no puede tomar esa decisión**, porque el dinero lo
resuelve la profesional. Hace falta una función propia que cancele **dejando la decisión de cobro
abierta** (`late_change_decision = 'pending'`). Es lo único de esta ficha que no se puede reusar.

**Qué hace por dentro.**

- **Sin dinero adentro, a tiempo.** Cancela, condona el cobro pendiente y cierra. **No pregunta**:
  preguntar «¿segura?» cuando no hay ninguna consecuencia es un mensaje de más.
- **Sin dinero adentro, tarde.** Avisa que la sesión se le cobra, con el plazo de esa ficha, y al
  confirmar cancela y congela el cobro con la decisión abierta.
- **Con dinero adentro y a tiempo.** No cancela todavía: **ofrece las salidas que conservan su dinero
  donde sirve** —reprogramar esta cita, y el pago se va con ella; y, sólo si existe una próxima
  ocurrencia viva de su serie, cancelar ésta y dejar el pago ahí—.
- **Con dinero adentro y sin tiempo mínimo.** **No se ofrece nada: se cancela.** Mover no le ahorra
  el cargo —fuera de plazo se cobran las dos sesiones—, y pasar el pago dejaría la cancelación
  tardía sin cargo, porque el traslado cierra el cobro viejo como condonado con motivo, que en
  Cobros se lee «no se cobró», y la profesional perdería el cargo que su propia política le concede.
  Ofrecer una salida que no mejora nada sólo alarga la conversación. El cierre dice el cargo dentro
  del mismo mensaje.
- **Dijo que no a las salidas.** **Se cancela.** Se registra como cancelación sin tiempo mínimo y **el
  estado del pago se conserva tal cual**, con la decisión abierta, para que su profesional decida si
  lo cobra o lo condona. Se le dice que su pago queda registrado. **El agente no insiste una segunda
  vez.**
- **En ningún caso se cobra solo.** Cancelar deja la decisión abierta; cobrarla o condonarla es de la
  profesional, desde su app.

**Las tres condiciones de pasar el pago van juntas**, y las comprueba el servidor antes de escribir
la oferta: la cita trae dinero adentro, **el aviso llega dentro del plazo de esa ficha**, y existe
una próxima ocurrencia viva de su serie. Si falta una, la salida no se menciona.

**Que las salidas ya se ofrecieron lo recuerda el servidor, no el modelo.** El modelo no lleva la
cuenta de nada, y por eso la oferta deja la conversación abierta.

La primera línea de la oferta cambia sola según el estado —«ya mandaste tu comprobante» o «ya está
pagada»—, con la precedencia de `03` §2. El agente no escoge cuál.

**Resultado.**

| Situación | `texto` | `espera` | `hecho` | `cierra` |
|---|---|---|---|---|
| Varias candidatas | `cancelar_lista` | `cita` | falso | falso |
| A tiempo, sin dinero adentro | `cancelar_cierre` | nulo | **verdadero** | verdadero |
| Tarde, sin dinero adentro | `cancelar_aviso_tardio` | `confirmado` | falso | falso |
| A tiempo, con dinero adentro, sin próxima viva de su serie | `cancelar_dinero_adentro` | nulo | falso | **falso** |
| A tiempo, con dinero adentro, con próxima viva de su serie | `cancelar_dinero_adentro_con_proxima` | nulo | falso | **falso** |
| Sin tiempo mínimo, con dinero adentro | `cancelar_dinero_adentro_tarde` | nulo | **verdadero** | verdadero |
| Confirmó la cancelación, o dijo que no a las salidas | `cancelar_cierre` | nulo | **verdadero** | verdadero |
| Aceptó dejar el pago en la próxima | `cancelar_cierre` | nulo | **verdadero** | verdadero |
| La próxima se canceló o ya tiene su propio pago | `cancelar_cierre`, coletilla de pago registrado | nulo | **verdadero** | verdadero |
| Dijo que mejor no la cancele | `cancelar_no_cancela` | nulo | falso | verdadero |
| La cita ya no está | `cita_ya_no_esta` | nulo | falso | falso |
| La cita ya pasó | `cita_ya_paso` | nulo | falso | falso |
| Sin ninguna candidata | `cancelar_nada_que_cancelar` | nulo | falso | verdadero |

**Un solo cierre, con cuatro coletillas que escoge el servidor.** Eran tres claves —el cierre normal,
el tardío y el que salía después de las ofertas— y las tres decían lo mismo con un final distinto.
Las coletillas: que no le queda ningún cobro por esa cita, cuando se condonó; nada, cuando el cobro
se congeló y el cargo ya se avisó; que su pago queda registrado y su profesional lo resuelve con
ella, cuando había dinero adentro; y que su pago quedó en la cita destino, cuando se pasó. Los
textos literales están en `06`. **La coletilla del traslado nombra la cita destino, no el estado del
cobro**, justo porque acreditado y comprobante conviven.

**Que la próxima ya traiga su propio pago es una carrera, no una política:** entre que se ofreció la
salida y ella contestó, esa cita se canceló o adquirió un cobro. Sobrescribirlo borraría un dato que
nadie puede reconstruir, así que el traslado no ocurre — pero **la cancelación sí, y sin decirle
nada**. Ella pidió cancelar. El cierre lleva la coletilla del pago registrado, nunca la que nombra la
cita destino. **Que los importes no coincidan no bloquea nada**: se pasa
igual y la profesional ajusta desde su app, que es donde se ajustan los importes.

**Cancelar tarde, y cancelar con dinero adentro, tienen que poderse.** Rechazarlo deja el peor
camino de todos: ella avisó que no puede ir, nadie registró nada, la cita sigue en pie, y su
profesional se entera el día de la sesión cuando no llega. El dinero no se pierde por cancelar: se
queda registrado, y quien lo resuelve es la profesional.

**Muta:** sí, cuando cancela. **Aviso:** `appointment_cancelled_by_patient`, con las mismas cinco
claves de `agendar`, también cuando el pago se pasa a la próxima. Lo que hay que aceptar y no
maquillar: **con el traslado, la profesional se entera de la cancelación, no del movimiento del
dinero**. El registro del traslado queda completo en la bitácora del dinero y la tarjeta de la cita
destino dirá que está pagada cuando la abra.

---

### 4.7 `cambiar_modalidad`

**Intención.** «¿La puedo tomar en línea?».

| Parámetro | Tipo | De dónde sale |
|---|---|---|
| `cita` | entero 1..5, o nulo | Número de la lista que escribió esta misma función. Nulo en la primera llamada |
| `confirmado` | booleano o nulo | Nulo mientras la propuesta no se haya dado. Verdadero cuando dijo que sí; falso cuando dijo que no |

**Es la única acción que el plazo sigue bloqueando**, y es a propósito: la profesional necesita saber
con tiempo si tiene que ir al consultorio. Cancelar y mover se permiten porque el hueco se libera de
todos modos; cambiar la modalidad a última hora la manda a un consultorio vacío o la deja sin él.

**No lleva a qué modalidad.** Es una decisión por dirección, y la dirección la determina la modalidad
que la cita tiene hoy: una presencial sólo puede ir a en línea. **No hay versión tardía con cargo:**
o alcanza el tiempo, o no se cambia.

**El filtro de candidatas son dos condiciones, no cuatro.** Entra toda cita **viva y en el futuro
cuyo servicio admita las dos modalidades**. El permiso de la profesional y la anticipación **dejan de
filtrar y pasan a decidir el texto**, que es para lo que existen. Con el filtro de cuatro, una cita
a la que le faltaba el permiso o el tiempo nunca entraba, el conjunto quedaba vacío y salía «no tengo
ninguna cita tuya a la que le pueda cambiar la modalidad» —cuando lo que pasó es que llegó tarde—,
y las dos negativas que el contrato conserva expresamente no tenían por dónde salir.

Para una profesional que no permite ningún cambio de modalidad, el verbo no se menciona en el menú,
así que la intención casi nunca llega (regla 8).

**No toca dinero nunca.** Ni el cobro, ni su estado, ni su petición.

**Resultado.**

| Situación | `texto` | `espera` | `hecho` | `cierra` |
|---|---|---|---|---|
| Varias candidatas | `modalidad_lista` | `cita` | falso | falso |
| Propuesta | `modalidad_propuesta` | `confirmado` | falso | falso |
| Confirmado | `modalidad_cierre` | nulo | **verdadero** | verdadero |
| Dijo que no | `modalidad_no_cambia` | nulo | falso | verdadero |
| Esa dirección no se permite | `modalidad_no_permitida` | nulo | falso | verdadero |
| No alcanza la anticipación | `modalidad_sin_anticipacion` | nulo | falso | verdadero |
| Ninguna cita futura, o ninguna de un servicio con dos modalidades | `modalidad_nada_que_cambiar` | nulo | falso | verdadero |

La lista de varias trae **cada cita con su modalidad actual**, porque sin eso la dirección del cambio
no se entiende.

**Muta:** sí, con `confirmado: true`. **Aviso:** `modality_changed_by_patient`, con
`patient_first_name`, `patient_last_name`, `appointment_starts_at`, `previous_modality` y
`new_modality`.

**Errores y su remediación.** **Las dos negativas se conservan**, y son las únicas del catálogo que
quedan por plazo. La de anticipación lleva el plazo **de esa ficha** adentro, nunca un número escrito
a mano. Las dos remiten a su profesional. Si la cita ya está en la modalidad que pide, se le confirma
con su hora y se cierra.

---

### 4.8 `mandar_comprobante`

**Intención.** Llega una imagen o un PDF. O «ya pagué».

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

**De un lote con varios archivos se toma el último, y se dice.** El agrupamiento de Kapso entrega
lotes, así que dos fotos seguidas son una sola entrega con dos renglones: suponer un archivo por
mensaje es el error clásico. Y **la memoria guarda de qué archivo se preguntó** (`file_id`): si llega
uno nuevo antes de que ella conteste, la pregunta se rehace sobre el nuevo y el anterior se descarta.
Sin eso, la pregunta protege contra la cita equivocada y no contra el archivo equivocado, que es el
mismo daño y tampoco tiene arreglo.

**Siempre se confirma antes de guardar**, aunque haya un solo cobro esperando y aunque la plantilla
lo nombre. La base admite **un solo comprobante por cobro, para siempre**, y no hay pantalla para
reemplazarlo: una foto equivocada queda pegada. El contexto mejora la pregunta; no la elimina. **Es
la única excepción de todo el documento a la regla de actuar cuando hay una sola candidata.**

Consecuencia de esa excepción: **aquí sí hay número aunque la candidata sea una sola.** La pregunta
nombra la cita y la respuesta vuelve como `cita: 1`. Sin eso, la segunda llamada sería idéntica a la
primera y significaría otra cosa.

**El cobro se identifica por fecha.** La hora sólo se dice cuando hay dos o más cobros del mismo día:
«tu sesión del martes 8» basta, y agregar la hora a todo hace la lista ilegible.

**Candidatas: son cobros, no citas.** Todo cobro suyo que siga pendiente, **con la petición
sellada** y sin archivo pegado —**cada uno es su propia deuda, no se colapsan**—, **sin importar el
estado de la cita**. De una serie, sólo el de la ocurrencia más próxima. Los más antiguos primero,
con fecha y monto.

**La petición sellada es la condición.** Con cobro por adelantado se sella al agendar, así que la
cita futura entra desde el primer momento. Con cobro después se sella cuando la profesional lo pide,
normalmente al cerrar la sesión: antes de eso ese cobro no es candidato, porque nadie le ha pedido
nada. La definición completa está en `docs/03-dinero.md` §2.3.

Esa redacción arregla dos agujeros que dejaban al producto sin su único camino de cobro:

1. **Los cobros de citas canceladas o movidas entran.** Tres plantillas —la del comprobante tras
   cancelar, la del comprobante tras mover y la del cambio sin tiempo mínimo— piden justo ésos. Con
   las candidatas viejas, ella mandaba la foto y leía «no tengo ningún cobro tuyo esperando
   comprobante», después de que se lo pedimos nosotros.
2. **La cita suelta de prepago entra.** Antes el conjunto decía «la más próxima futura de cada
   serie», y una cita de prepago recién apartada no es pasada ni pertenece a ninguna serie: quedaba
   fuera el flujo más frecuente del cobro por adelantado.

Qué es «cobro esperando comprobante» se define una sola vez, en `docs/03-dinero.md` §2, y aquí se
cita. **La petición sellada es una sola regla para las dos formas de cobrar**, y decide las tres
cosas juntas: que la profesional lo vea marcado como pedido, que salga la plantilla, y que el cobro
acepte comprobante.

**Una cita que llegó a su hora sin comprobante deja de estar programada**, y con eso sale de
`mis_citas` y de las candidatas de `cancelar` y `reprogramar`. **Su cobro sigue vivo y el comprobante
se le puede seguir pegando**, precisamente porque aquí las candidatas son cobros.

**Si tiene un comprobante pendiente y escribe por otra cosa, el agente no lo menciona.** Contesta lo
que le preguntaron y ya. El recordatorio sale solo, por plantilla. Cobrarle de paso en una
conversación sobre otro tema es lo que hace que deje de escribir.

**Resultado.**

| Situación | `texto` | `espera` | `hecho` | `cierra` |
|---|---|---|---|---|
| Una candidata | `comprobante_pregunta_una` | `cita` | falso | falso |
| Varias candidatas | `comprobante_lista` | `cita` | falso | falso |
| Llegaron varios archivos en el mismo lote | `comprobante_varias_imagenes` | `cita` | falso | falso |
| Segunda llamada, pega | `comprobante_acuse` | nulo | **verdadero** | verdadero |
| Segunda llamada, pega a una sesión que ya pasó | `comprobante_acuse_sesion_pasada` | nulo | **verdadero** | verdadero |
| Ningún cobro esperando | `comprobante_nada_esperando` | nulo | falso | verdadero |
| Ese cobro ya tiene comprobante | `comprobante_ya_hay_uno` | nulo | falso | verdadero |
| No vino archivo en el mensaje | `comprobante_sin_archivo` | nulo | falso | falso |

El acuse **nunca dice «pagado» ni «aprobado»: dice «recibí tu comprobante»** (regla 4). Pegar el
archivo deja el cobro **pendiente**: el agente nunca acredita.

**Muta:** sí, en la segunda llamada. **Aviso:** `payment_proof_received`, con `patient_first_name`,
`patient_last_name` y `appointment_starts_at`. **Sin el monto: el contrato lo prohíbe expresamente.**
**Y cuando el comprobante confirma una cita de prepago, se escribe también `appointment_confirmed`,
en la misma transacción**: es una mutación de cita, y la regla 13 no tiene excepciones.

**Errores y su remediación.** Los tres de la tabla llevan su salida escrita: mandárselo directo a su
profesional, esperar la revisión, o volver a mandar el archivo en un solo mensaje. Ninguno dice «ya
está pagado».

---

### 4.9 `dejar_resena`

**Intención.** «5 estrellas, me ayudó mucho».

| Parámetro | Tipo | De dónde sale |
|---|---|---|
| `estrellas` | entero 1..5, o nulo | Obligatorio para escribir. **Sin calificación no se llama** |
| `comentario` | cadena ≤ 1000, o nulo | Opcional. Lo que ella escribió, tal cual |

**El agente no pide la reseña:** la pide la plantilla `patient_review_request`, que ya trae la
petición completa.

Puede llegar en uno o en varios mensajes. **Las dos preguntas que faltan cuestan cero llamadas y
viven en el prompt:** si llegan sólo las estrellas, se pregunta una vez por el comentario sin llamar
a nada, y si no lo da, se llama con la calificación sola; si llega sólo el comentario, se pide la
calificación, y si no llega nunca, no se registra nada. Ninguna de las dos lleva un dato adentro, y
por eso no valen una llamada ni un valor de `espera`.

**Resultado.**

| Situación | `texto` | `espera` | `hecho` | `cierra` |
|---|---|---|---|---|
| Con calificación | `resena_gracias` | nulo | **verdadero** | verdadero |
| Ya había dejado una | `resena_ya_enviada` | nulo | falso | verdadero |

El agradecimiento lleva la nota del anonimato. **Nunca promete publicación:** ninguna función escribe
la moderación y una persona la revisa antes.

**Muta:** sí. **Aviso: ninguno, y es deliberado.** El contrato de avisos de la app no tiene un tipo
para la reseña, la app pinta en blanco lo que no conoce, y la reseña no existe para nadie hasta que
una persona la modera. Inventarle un tipo sería una tarjeta vacía.

**Errores y su remediación.** Sólo uno: ya había dejado una. Se le agradece y se cierra.

---

### 4.10 `mis_citas`

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

- **Dónde es.** Presencial: la dirección; y si no hay dirección guardada, la segunda frase del mismo
  texto dice que se la comparte su profesional —es frecuente, no raro—. Antes era una clave aparte
  que se comía el día, la hora y el dato de que es presencial.
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

1. **Ocurre antes de que haya intención.** Ninguna de las diez sería la función correcta que llamar,
   porque todavía no se sabe de qué se va a hablar.
2. **La respuesta es un número contra una lista, y las listas las resuelve quien las escribió.** Aquí
   quien la escribió es el borde, con lo que ya sabe del teléfono; el modelo no tiene que emparejar
   nada.
3. **Si fuera función, el modelo tendría que decidir cuándo identificar.** Eso es justo lo que no se
   le deja decidir: quién es y con quién no depende de lo que el modelo interprete.

Cómo funciona: el borde ve dos vínculos, manda el texto `con_cual_profesional` con las dos numeradas,
y guarda en la memoria de la conversación que está esperando esa respuesta. El mensaje siguiente
resuelve el número contra esa misma memoria y **sigue adelante en el mismo mensaje**: anota la
profesional elegida, arma el sobre con ella puesta y corre el modelo con el lote completo. Si se
detuviera ahí, la intención con la que ella abrió —«hola, quiero mover mi cita»— se perdería y
tendría que volver a escribirla.

Y como siempre: **las diez vuelven a comprobar por su cuenta** que ese teléfono puede actuar sobre lo
que va a tocar. La elección sirve para hablar; el cerrojo sigue estando dentro de cada función.

---

## 6. Cuál cita: números de lista, y nada más

Cuando una función tiene más de una candidata, escribe la lista numerada dentro de `texto` —máximo
cinco, con el nombre del día, la fecha y la hora, compuestos por el servidor— y devuelve `espera:
"cita"`. Ella contesta «la 2», el modelo manda `cita: 2`, y el servidor resuelve el 2 contra la lista
que él mismo acaba de escribir.

**El conjunto de candidatas no es el mismo para todas.**

| Función | Qué entra |
|---|---|
| `mandar_comprobante` | **Cobros, no citas.** Todo cobro pendiente, **con la petición sellada** y sin archivo, sin importar el estado de la cita; de una serie, sólo el de la más próxima ocurrencia |
| `confirmar`, `reprogramar`, `cancelar`, `cambiar_modalidad` | Sólo citas futuras, y de una serie sólo la más próxima |

Y dentro de ese conjunto, **sólo las que de verdad admiten esa acción** —con la corrección de §4.7:
en `cambiar_modalidad`, el permiso y la anticipación ya no filtran, deciden el texto—.

Una cita que llegó a su hora deja de estar programada, así que sale de las candidatas de `confirmar`,
`reprogramar`, `cancelar` y `cambiar_modalidad`, y de `mis_citas`. **Su cobro no sale de las
candidatas de `mandar_comprobante`**, porque ahí el conjunto son cobros.

**La resolución, en cinco renglones:**

1. Si vino `cita` —o `citas`—, es ésa.
2. Cero candidatas: el texto de que no hay nada que hacer, con una salida. No se muta.
3. Una candidata: se actúa sobre ella, salvo que la acción exija aviso o propuesta previa, y salvo
   `mandar_comprobante`, que siempre pregunta. **Aunque no se liste, la cita resuelta se anota en
   `subject`.**
4. Más de una: la lista numerada y la pregunta. **No se muta.**
5. La pista de la última plantilla desempata el renglón 4: si la plantilla nombró una cita y esa cita
   está entre las candidatas, el conjunto se colapsa a una. **No aplica en `confirmar`**, que con
   varias esperando siempre pregunta, ni en `mandar_comprobante`, que siempre pregunta de todos
   modos.

**Cinco reglas del número:**

1. **Un `cita` sólo vale contra la última lista de esa función.** No es un identificador global: es
   una posición. Un 2 de `cancelar` no significa nada en `cambiar_modalidad`, porque las dos listas
   se construyen con reglas distintas. Es una propiedad de seguridad que un identificador global no
   tenía, **y no tiene ni una excepción**.
2. **Con una sola candidata no hay número**, y `cita` va en nulo. La única excepción es
   `mandar_comprobante`, por lo dicho en su ficha.
3. **Con cero, se dice, con una salida.** Nunca un error.
4. **El emparejamiento lo hace el modelo, la numeración el servidor.** Si ella dice «la del jueves a
   las 7», el modelo la empareja contra la lista que el servidor ya escribió y manda el número. Es la
   regla 1: el agente compara, no calcula.
5. **Un número fuera del rango de la última lista no se manda.** Cinco opciones y ella escribe «la
   7»: el borde **lo recorta a nulo** y la misma función **reemite su lista**. Lo que no puede pasar
   es que la guardia lo trate como llamada malformada, porque entonces sale `se_acabo_el_espacio`
   —que es falso, no se gastó ninguna llamada— y ella no se entera de lo único útil, que sólo había
   cinco. Equivocarse de número es de las cosas más fáciles de hacer por WhatsApp.

**Los otros dos números tienen su propio productor**, y cada parámetro lo nombra: `servicio` resuelve
contra la lista de `ver_servicios` y `opcion` contra la de `buscar_horarios`. Un número resuelve
**contra la lista que lo produjo**, y nunca contra otra.

**Que la lista no cueste un mensaje.** Cuando el renglón 4 devuelve la lista y ella ya había dicho
cuál —«cancélame la del martes»—, el agente no manda la lista: la lee, encuentra el número y **vuelve
a llamar en el mismo mensaje**. Dos llamadas de las tres, un solo mensaje. Es la única concatenación
que el prompt autoriza, y existe porque el agente no puede emparejar «el martes» contra nada hasta
que el servidor le enseñe las etiquetas.

### 6.1 `subject`: cuál cita, cuando las listas se encadenan

La equivalencia entre un número y una cita vive en la memoria de la conversación, una fila por
teléfono, que **se define una sola vez en `docs/07-portero.md` §8.1** —tabla
`whatsapp_conversation_state`— y aquí sólo se cita. **La escribe la función, dentro de su
transacción**, porque es la única que conoce el mapa de los números; el borde sólo escribe la fila de
la profesional elegida y la limpia. Una fila de más de 24 horas se ignora: pasado un día, un «la 2»
es de otra conversación.

De sus columnas, dos importan aquí. `options` guarda la última lista numerada **y se reemplaza entera
en cuanto otra función emite otra lista**. `subject` guarda **la cita ya elegida de la gestión en
curso** y no se reemplaza: se escribe cuando se resuelve el número —o cuando la función resuelve una
sola candidata sin listarla— y se borra cuando la gestión cierra.

Hacen falta las dos porque **una gestión encadena varias listas y `options` sólo sobrevive a la
última**. Reprogramar, con dos citas futuras:

```
>>  quiero mover una cita
<<  [reprogramar_lista]  1. jueves 27, 3:00   2. martes 1, 4:00
>>  la 2
<<  [reprogramar_pregunta_dia]  Va, muevo tu cita del martes 1 a las 4:00. ¿Qué días te quedan mejor?
>>  el viernes en la tarde
<<  [horarios_lista]  1. 3:00   2. 4:00   3. 5:00
>>  la 2
```

Cuando llega ese último «la 2», `options` ya trae las horas: la lista que explicaba el `cita: 2` la
borró `buscar_horarios`. Sin `subject`, el servidor no sabe **qué cita se está moviendo** —ni para
escribirla, ni para excluirla de la búsqueda, que es lo que evita que se tape a sí misma y a sus
vecinas—. Con `subject`, lo sabe en las tres listas y en la cuarta si el hueco se ocupa y hay que
renumerar.

Ejemplo con nombres inventados: da igual que la paciente se llame Emilio o que la profesional se
llame Ramiro; lo que resuelve el «cuál cita» es la columna, no el contexto.

**Un número que ya no resuelve, con fila viva, no es un error.** Se contesta reescribiendo la lista:
la misma función —la fila dice cuál—, con `cita` en nulo, la vuelve a emitir. **Sin fila** no se
adivina de qué lista era: eso se contesta `no_entendi`, y está escrito así en `07` §8.1 y en el
enrutamiento del prompt.

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
y de qué cita. Dos precisiones que hay que leer al revés de como estaban escritas:

1. **Las plantillas de comprobante traen `payment_id` directo en el payload.** Es más exacto que
   cualquier `appointment_id` y evita el rodeo: lo que se busca es el cobro, no la cita.
2. **Las dos plantillas de reprogramación traen `old_appointment_id` y `new_appointment_id`, y el
   cobro que se pide es el de la VIEJA.** La cola se encola con el cobro de la cita vieja, que es el
   que se congela al mover sin tiempo mínimo. Leer `new_appointment_id` para buscar el cobro pega el
   comprobante al cobro equivocado, y como sólo cabe uno por cobro y no hay pantalla para
   reemplazarlo, **no tiene arreglo después**. `new_appointment_id` sólo sirve para nombrar la cita
   nueva en el texto.

Y dos familias —bienvenida y entrega de materiales— no traen cita ni pueden traerla.

**La pista dura siete días.** La cola de salida se purga cada hora y se borran las filas ya enviadas
de más de siete días. Pasada esa semana la pista sale vacía en vez de mentir con una plantilla vieja,
que es el comportamiento que se quiere. Que la tabla se mantenga chica no basta para que la consulta
salga barata: busca dentro del contenido del mensaje, y por eso lleva su propio índice, el que
`docs/08-implementacion.md` §7.1 manda crear.

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

**Las siete de comprobante apuntan a la misma función y a la misma cita, y aun así se pregunta.** Las
tres que piden el comprobante de una cita cancelada o movida sólo funcionan con las candidatas
redefinidas de §4.8; con las anteriores, el agente contestaba que no había nada que cobrar.

---

## 8. Los avisos a la profesional

**Van en la misma transacción que la mutación. Si el aviso no se pudo escribir, la mutación no
ocurrió.** No hay cola, no hay segunda llamada, y no hay forma de que la cita se mueva y el aviso no
salga. En `confirmar` con varias citas la regla se aplica al conjunto: **o se escriben todos los
avisos y se confirman todas, o no se confirma ninguna**.

Las claves salen del contrato de la app, que arma el texto con el nombre de la paciente y la hora de
la cita. **Se leyeron del switch de la app y no se inventan**, en
`flutter_application_1/lib/pages/notifications/notification_models.dart`.

**El aviso no lleva zona horaria, y no hay que agregársela.** Guarda el instante de la cita y nada
más. Cuando la profesional abre su app, la función que le lista sus avisos consulta **en ese
momento** la zona de su ficha y se la devuelve junto con los datos: la hora se pinta al leerla, no
al escribirla. Si algún día ella cambia de zona, sus tarjetas viejas se vuelven a pintar bien solas
— cosa que no pasaría si cada una llevara la zona congelada adentro. Comprobado contra la base.

| `type` | Claves del `payload` | Quién lo escribe |
|---|---|---|
| `appointment_created_by_patient` | `patient_first_name`, `patient_last_name`, `appointment_starts_at`, `appointment_ends_at`, `appointment_modality` | `agendar` |
| `appointment_confirmed` | las mismas cinco | `confirmar`, y `mandar_comprobante` cuando el comprobante confirma la cita de prepago |
| `appointment_cancelled_by_patient` | las mismas cinco | `cancelar` (también cuando el pago se pasa a la próxima), y `reprogramar` con `a_la_proxima: true` |
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

**El único movimiento que no tiene aviso propio es el traslado del pago**, y va declarado en §4.6: a
la profesional le llega la cancelación. El registro del traslado queda completo en la bitácora del
dinero.

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
| **El texto trae la salida adentro** | Casi siempre | La oferta de `cancelar` con dinero adentro nombra las salidas que conservan el pago, y cancelar de todos modos está a un «no» de distancia |
| **`espera` nombra el parámetro que falta** | Cuando la gestión sigue viva | Un filtro que no dio nada devuelve `espera: "filtros"`: el modelo sabe exactamente qué clave llenar |
| **La función se resuelve sola y devuelve otra cosa** | Cuando volver a preguntar costaría un mensaje | El hueco ocupado no es un rechazo: `agendar` vuelve a buscar por dentro y ofrece alternativas del mismo día, renumeradas |

**Decir que no también es una respuesta, y ahora tiene texto.** Eran cinco preguntas cerradas sin una
sola rama de «no», y el modelo se quedaba sin nada que copiar justo cuando menos debe redactar:
`agendar_no_aparta`, `reprogramar_no_mueve`, `cancelar_no_cancela` y `modalidad_no_cambia`, los
cuatro con `hecho: false` y `cierra: true`. Por eso `confirmado` es booleano **o nulo** en las cuatro
funciones que lo reciben: sin el nulo, «dijo que no» y «todavía no se le preguntó» son el mismo
valor.

**La cita puede dejar de existir a media gestión, y eso también tiene texto.** Mover son tres
llamadas en tres mensajes, y entre la primera y la última la profesional puede haber cancelado esa
cita, movida o cerrada desde su app. Por eso **la llamada que escribe relee el estado de la cita de
origen dentro de la misma transacción**, no sólo el efecto de lo que va a escribir, y por eso existen
`cita_ya_no_esta`, `cita_cambio_de_lugar` y `cita_ya_paso`. Sin ellos, la función escribe sobre una
cita muerta o revienta, y las dos salidas son peores que decirlo.

**No existe el caso de «no pudimos saber si se escribió».** Cada función que muta **vuelve a leer lo
que escribió, dentro de la misma transacción, antes de componer el texto**, y `hecho` es la
conclusión de esa lectura. O la transacción cerró y el efecto está —y se lee—, o no cerró y no hay
efecto ninguno. **Eso garantiza que la transacción es atómica, no que el borde se haya enterado:** si
la llamada commitea y la respuesta se pierde por el camino, lo escrito está y el borde no lo sabe.
Ese caso no es de este archivo —vive en `docs/07-portero.md`— y se resuelve releyendo el estado antes
de contestar, nunca dándole a ella un «se me acabó el espacio» sobre una cita que sí se creó.

Los rechazos de cada función están en su ficha y no se repiten aquí. Quedan tres que no son de
ninguna en particular:

| Situación | Qué devuelve | Qué hace el agente |
|---|---|---|
| El teléfono no tiene ningún vínculo | `no_te_reconocemos`, `cierra: true` | Manda el texto y cierra. **Cero llamadas:** el borde ya lo sabía |
| El vínculo está dado de baja | `paciente_inactivo`, `cierra: true` | Igual. **Esto cierra solo el hueco más grave que había:** antes, quien estaba dado de baja no recibía absolutamente nada |
| Un número que ya no resuelve | La misma lista, reescrita | Vuelve a preguntar cuál. Sin fila en la memoria, `no_entendi`: no se adivina de qué lista era |

**Lo que no está aquí.** Lo que pasa cuando el modelo se atora, cuando llegan dos mensajes a la vez o
cuando el borde se cae no es de este archivo: vive en `docs/07-portero.md`. Y el texto que la
paciente llega a leer de esa capa, `se_acabo_el_espacio`, vive literal en el prompt, lo compone el
borde y cuesta cero llamadas.
