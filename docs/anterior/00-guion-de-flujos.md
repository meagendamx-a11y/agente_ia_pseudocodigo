# El guion de los flujos — para ensayar el agente conversando

Corte: 2026-08-26.

Este documento **no es una especificación**. Es el guion con el que Gael y yo vamos a ensayar:
Gael se hace pasar por quien escribe desde WhatsApp, yo contesto como el agente, y corregimos
sobre la marcha. Cada flujo trae el diálogo completo, mensaje por mensaje, y después de cada
turno del agente una línea que dice **qué consultó o qué cambió** y **cuántas llamadas lleva
gastadas de las ocho**.

Se apoya en los cuatro documentos de esta carpeta —`01-agente-anterior.md`, `02-web-agendar.md`,
`03-avisos.md`, `04-puente.md`— y en los ocho textos aprobados de
`docs/diseno/textos-fijos.md`, que aquí van **literales** (anexo A).

---

## 0. Cómo se lee este guion

```
PACIENTE: lo que llega por WhatsApp
AGENTE:   lo que sale por WhatsApp
(qué consultó o qué cambió · N de 8)
```

- **N de 8** es el contador de llamadas del turno. Se reinicia sólo cuando el turno se cierra.
- **Dormirse no cuesta.** Entre mensaje y mensaje el agente duerme el turno (`enter_waiting`
  más `sync_waiting`) y esa pareja **no gasta ordinal**: el precedente ya está desplegado
  (`agent_mark_inbound_waiting` no pasa por el portero). Por eso una gestión de cuatro mensajes
  puede costar tres llamadas.
- **El cierre tampoco cuesta.** Vive en el ordinal 9, fuera del presupuesto
  (`agent_tool_calls_check`).
- **Una gestión = un turno.** El turno se abre con el primer mensaje y se cierra **en cuanto la
  mutación se compromete**, nunca después. `mutation_limit` viene en 1 y `agent_turns_check` lo
  hace ley: si el agente reserva y se duerme, el siguiente pedido cae en `MUTATION_BLOCKED`.
- **El turno muere a los 30 minutos de silencio.** No es un fallo: es un reinicio. El siguiente
  mensaje abre turno nuevo, el agente vuelve a abrir expediente y vuelve a preguntar. Cuesta un
  mensaje de más y nada de dinero.

### Las siete reglas que gobiernan todos los flujos

1. **El agente nunca dice que algo quedó hecho sin que el servidor lo confirme.** Toda mutación
   devuelve `aplicado: true|false` y un `mensaje_de_cierre` que el agente copia palabra por
   palabra. Si el servidor no contestó, el agente **no afirma nada**: dice que lo está
   verificando.
2. **Ningún plazo se escribe a mano.** Salen de la ficha de cada profesional. Miranda da 12
   horas de aviso, Araceli 24, y tres de cinco piden 48 horas de anticipación para agendar.
3. **El agente mueve la agenda, nunca resuelve el dinero.** Guarda el comprobante y dice
   «recibido», nunca «pagado». Cobros, descuentos y devoluciones se contestan con el texto 2.
4. **Sin género** ni para quien escribe ni para su profesional. A la profesional se la nombra
   por su nombre de pila, siempre.
5. **Las opciones se dicen numeradas, en texto plano, y nunca pasan de diez.** Hoy el carril del
   agente sólo manda texto (`send_notification_to_user`); no hay botones ni listas interactivas.
   El tope de diez de las listas de WhatsApp se respeta igual, porque es el tope de lo legible.
6. **Los ocho textos fijos van literales.** Seis los compone el servidor y el modelo sólo escoge
   el código; el de crisis vive literal en el prompt; el de tope lo manda el borde.
7. **El agente nunca traspasa a una persona.** `handoff_to_human` existe y no se puede quitar,
   pero hoy nadie suelta una conversación traspasada y quien escribe deja de recibir respuesta
   para siempre. Se contesta con el texto 1, que trae el enlace del equipo.

### El personal del ensayo

Dos profesionales reales de producción, con sus valores reales al corte:

| | Araceli | Miranda |
|---|---|---|
| Anticipación mínima para agendar | **48 h** | **48 h** |
| Aviso de cambio | **24 h** | **12 h** |
| Cobro | **antes** (prepago) | después |
| Cambio de modalidad | a en línea **sí**, a presencial **sí** | a en línea **sí**, a presencial **sí** |
| Anticipación para cambiar modalidad | 24 h | **12 h** |
| Dirección | **sí** | no |
| Liga de videollamada | **no** | **sí** |
| Servicio del ensayo | Psicoterapia individual, 50 min + 10 de margen, $800 | Psicoterapia individual, 50 min + 10, $900 |

Pacientes del ensayo: **Emilio** (con Araceli) y **Ariadna** (con Miranda).

**Los horarios del ensayo están medidos hoy contra la base.** Para Araceli, en línea:

| Día | Huecos que devuelve la base (paso de 15 min) | Horas sin traslape (bloque de 60 min) |
|---|---|---|
| jueves 27 de agosto | **0** — no llega a las 48 h | — |
| viernes 28 | 9 (15:00 a 17:00) | **3**: 3:00, 4:00, 5:00 |
| sábado 29 y domingo 30 | 0 | — |
| lunes 31 | 9 (15:00 a 17:00) | **3** |
| martes 1, miércoles 2, jueves 3 de septiembre | **26** (9:00 a 13:00 y 15:00 a 17:00) | **8**: 9, 10, 11, 12, 1, 3, 4, 5 |

---

## 1. El recorrido de agendar, en una página

Ésta es la columna vertebral: los flujos 2, 3, 4, 5 y 6 son variaciones suyas.

| Paso | Quién habla | Qué pasa | Llamadas |
|---|---|---|---|
| 1 | Ella | «quiero una cita» | — |
| 2 | Agente | Abre expediente. Sabe quién es, con quién, sus servicios con precio, el **primer día agendable** y hasta dónde llega el calendario. Pregunta **día y modalidad en el mismo mensaje**. | **1** |
| 3 | Ella | «el miércoles, en línea» | — |
| 4 | Agente | Lee los horarios de ese día en esa modalidad. Ofrece las horas **numeradas y sin traslape**, con el precio dicho. | **2** |
| 5 | Ella | «la 7» o «a las 4» | — |
| 6 | Agente | Reserva. Copia el mensaje de cierre del servidor y **cierra el turno**. | **3** |

**Tres llamadas de ocho en el camino feliz.** Cada día extra que ella pruebe cuesta una más, así
que el techo real es **un expediente más seis días distintos más la reserva = 8 exactas**. El
noveno intento revienta con `TOOL_BUDGET_EXCEEDED` (flujo 23).

**Tres cosas cambian respecto de lo que está escrito hoy, y sin ellas el guion no se sostiene:**

1. **La modalidad se pregunta junto con el día**, no después, porque la disponibilidad depende de
   ella. Medido: el viernes 28 Araceli tiene 9 huecos en línea y 14 presencial.
2. **Las horas se ofrecen sin traslape.** La base avanza de 15 en 15 minutos: el miércoles 2 da
   **26 huecos**. Sin traslapes son **8 horas**, que sí caben en un mensaje.
3. **El tope de la consulta sube de 6 a 10 y respeta la parte del día.** Hoy
   `agent_get_availability_from_workflow` tiene `v_limit constant integer := 6` y toma los
   primeros seis del día en orden. Medido contra la base: el miércoles 2 devuelve **9:00, 9:15,
   9:30, 9:45, 10:00 y 10:15** —seis opciones dentro de setenta y cinco minutos— con
   `truncated: true`. Y el viernes 28 devuelve 15:00, 15:15, 15:30, 15:45, 16:00 y 16:15: **las
   5:00 nunca se ven**. Si alguien pide «el jueves por la tarde», recibe seis horas de la mañana.

---

## 2. Los veinticinco flujos

### Flujo 1 · Agendar una cita, camino feliz

**QUÉ SE DECIDE AQUÍ.** Día y modalidad en una pregunta, horas sin traslape en la siguiente, y
la hora que ella escoge **es** la confirmación: no hay paso de «¿confirmo?».

```
PACIENTE: hola, quiero agendar una cita

AGENTE:   Hola Emilio. Con gusto te agendo con Araceli.
          Psicoterapia individual, 50 minutos, $800.
          ¿Qué día te queda bien, y la prefieres en línea o presencial?
          Puedo apartarte desde el viernes 28 de agosto.
(abrió expediente: relación, nombres, servicios con precio, primer día agendable · 1 de 8)

PACIENTE: el miércoles, en línea

AGENTE:   Para el miércoles 2 de septiembre, en línea, tengo ocho horas:
          1) 9:00   2) 10:00   3) 11:00   4) 12:00
          5) 1:00   6) 3:00    7) 4:00    8) 5:00
          Dime el número o la hora y te la aparto.
(leyó horarios del miércoles 2, en línea · 2 de 8)

PACIENTE: la 7

AGENTE:   Listo, agendé tu Psicoterapia individual del miércoles 2 de
          septiembre a las 4:00 de la tarde, en línea. Araceli ya recibió
          el aviso.
(reservó — el servidor contestó aplicado: sí · 3 de 8 · turno cerrado)
```

**DÓNDE SE PUEDE TORCER**

1. **Ya trae día y hora en el primer mensaje** («quiero cita el miércoles a las 4 en línea»). El
   agente se salta la pregunta: expediente (1), horarios del miércoles (2) para comprobar que las
   4:00 existen, reserva (3). Mismas tres llamadas, un mensaje menos. Si las 4:00 no están: «Las
   4:00 ya no las tengo ese día. Sí tengo 3:00 y 5:00. ¿Alguna te sirve?»
2. **El hueco se ocupó mientras conversaban.** El servidor contesta `SLOT_TAKEN` —la base tiene
   `excl_appointments_no_overlap`, así que el empalme se rechaza solo— y **no gasta la mutación
   del turno**. El agente: «Se acaba de ocupar esa hora. Ese mismo día tengo 3:00 y 5:00. ¿Cuál
   tomo?» Cuesta una llamada más (4 de 8) y hay que decirlo, nunca callarlo.
3. **Pide «mañana».** Araceli pide 48 horas, así que mañana devuelve cero. El agente **no
   consulta a ciegas**: el expediente ya le dijo el primer día agendable. «Para mañana ya no
   alcanzo: Araceli necesita 48 horas de anticipación. Lo más cercano que tengo es el viernes 28.»
   Cero llamadas gastadas de más.

---

### Flujo 2 · Agendar cuando ya tiene una cita próxima

**QUÉ SE DECIDE AQUÍ.** El bloqueo se dice en voz alta y se convierte en bifurcación. La versión
anterior lo aplicaba la pantalla en silencio; hoy **ninguna función lo impone**, así que la regla
vive en la frase del agente, no en el servidor.

```
PACIENTE: quiero agendar una sesión

AGENTE:   Hola Emilio. Ya tienes Psicoterapia individual el jueves 27 de
          agosto a las 3:30 de la tarde, en línea.
          ¿Quieres mover ésa de día, o agendar otra sesión aparte?
(abrió expediente: trae la cita con su etiqueta y sus acciones · 1 de 8)

PACIENTE: no, mover ésa

AGENTE:   Va. ¿Qué día te queda bien? Puedo desde el viernes 28.
(no consultó nada · 1 de 8)

PACIENTE: el miércoles 2

AGENTE:   Para el miércoles 2, en línea, tengo ocho horas:
          1) 9:00  2) 10:00  3) 11:00  4) 12:00
          5) 1:00  6) 3:00   7) 4:00   8) 5:00
(leyó horarios del miércoles 2 · 2 de 8)

PACIENTE: la 3

AGENTE:   Listo, moví tu cita del jueves 27 a las 3:30 al miércoles 2 de
          septiembre a las 11:00 de la mañana. Sigue en línea. Araceli ya
          recibió el aviso.
(movió la cita — aplicado: sí · 3 de 8 · turno cerrado)
```

**DÓNDE SE PUEDE TORCER**

1. **Quiere las dos.** «No, quiero otra aparte.» Se agenda normal (flujo 1) y **no se le impide**:
   hoy nada en el servidor lo bloquea. Si se quiere sostener la regla vieja de «una cita futura
   por servicio», tiene que vivir en la operación que crea la cita, no en el texto.
2. **Tiene dos citas próximas y no dice cuál.** El agente pregunta con las dos etiquetas y ella
   contesta «la del jueves». Como el turno sigue abierto, los identificadores del expediente
   **siguen vivos**: cero llamadas extra.
3. **La cita que ya tiene está a menos del plazo.** No cambia nada: mover es gratis siempre y
   **no se menciona ningún plazo al mover** (flujo 6).

---

### Flujo 3 · Agendar con prepago

**QUÉ SE DECIDE AQUÍ.** La cita nace **sin confirmar**, con la petición de comprobante sellada
desde el momento de agendar, y la consecuencia se dice desde el principio. Las 24 horas son un
valor fijo del producto, el único plazo que sí va escrito.

```
PACIENTE: quiero cita con Araceli

AGENTE:   Hola Emilio. Psicoterapia individual, 50 minutos, $800.
          Araceli cobra antes de la sesión, así que después de apartarla
          te pido tu comprobante por aquí.
          ¿Qué día te queda bien, y la prefieres en línea o presencial?
          Puedo desde el viernes 28.
(abrió expediente: cobro = antes · 1 de 8)

PACIENTE: viernes 28, presencial

AGENTE:   Para el viernes 28, presencial, tengo cinco horas:
          1) 12:00  2) 1:00  3) 3:00  4) 4:00  5) 5:00
(leyó horarios del viernes 28, presencial · 2 de 8)

PACIENTE: la 4

AGENTE:   Listo, aparté tu cita del viernes 28 a las 4:00 de la tarde.
          Para confirmarla necesito tu comprobante de pago — mándamelo por
          aquí. Si no llega en 24 horas, la cita se cancela.
(reservó — aplicado: sí; el pago nació con la petición de comprobante · 3 de 8 · turno cerrado)
```

Y después, en un **turno nuevo**, llega la foto: eso es el flujo 12.

**DÓNDE SE PUEDE TORCER**

1. **No manda el comprobante.** A las 24 horas un trabajo programado cancela la cita y libera el
   horario. No hay ventana de gracia. Si después quiere otra, empieza de cero.
2. **Manda el comprobante tarde, con la cita ya cancelada.** «Esa cita se canceló porque no llegó
   el comprobante a tiempo. Mándale la foto directamente a Araceli, y si quieres te busco horario
   nuevo ahora mismo.» Ningún camino del sistema reabre esa cita.
3. **Pregunta a dónde transferir.** Es texto 2 (`asunto_de_dinero`): los datos bancarios los da
   Araceli. Y ahí se ve el hueco: hoy nadie le dice a dónde pagar. Hay que confirmarlo (supuesto 7).

---

### Flujo 4 · Agendar cuando no hay horarios

**QUÉ SE DECIDE AQUÍ.** Hay **tres «no hay»** distintos y sólo uno usa el texto fijo.

**4a — Ni un hueco en sesenta días.** Es el texto 6, `sin_horarios`.

```
PACIENTE: quiero agendar

AGENTE:   Ahorita Araceli no tiene horarios abiertos para las próximas
          semanas. Lo mejor es que le escribas directamente para que te dé
          un espacio.
(abrió expediente: primer día agendable = ninguno · 1 de 8; el texto fijo · 2 de 8)
```

**4b — Ese día no, otros sí.** No es texto fijo: es una respuesta con datos.

```
PACIENTE: ¿tienes el sábado?

AGENTE:   El sábado Araceli no atiende. Lo más cercano que tengo es el
          lunes 31 y el martes 1. ¿Alguno te sirve?
(leyó horarios del sábado 29: cero huecos · 2 de 8)
```

**4c — La agenda todavía no está abierta a pacientes.** `AGENDA_CERRADA`. Hoy no pasa: las cinco
profesionales lo tienen encendido, y el interruptor es un pestillo de una sola dirección que
nadie puede apagar. **El texto de este caso no está escrito** (supuesto 3).

**DÓNDE SE PUEDE TORCER**

1. **Pregunta día por día.** Cada día cuesta una llamada. A partir del sexto hay que cortar
   (flujo 23).
2. **Fin de mes.** Es el error de la versión anterior: preguntar un mes y quedarse con lo que
   conteste. Hoy Araceli devuelve tres días de agosto; el 30 de agosto devolvería cero con
   septiembre entero libre. El expediente tiene que traer el **primer día agendable**, no «los
   días de este mes».
3. **Sólo hay una modalidad ese día.** «Ese día sólo tengo presencial, ¿te sirve?» Es real: el
   viernes 28 Araceli tiene 12:00 y 1:00 presencial y nada en línea a esa hora.

---

### Flujo 5 · Reprogramar

**QUÉ SE DECIDE AQUÍ.** Es el recorrido **corto**: servicio y modalidad se heredan de la cita, y
el dinero se va con ella, comprobante incluido.

```
PACIENTE: no voy a poder el jueves

AGENTE:   Sin problema. Tienes Psicoterapia individual el jueves 27 a las
          3:30 de la tarde, en línea. ¿Qué día te queda mejor?
(abrió expediente: la cita, su etiqueta, su servicio y sus acciones · 1 de 8)

PACIENTE: el martes 1

AGENTE:   Para el martes 1, en línea, tengo ocho horas:
          1) 9:00  2) 10:00  3) 11:00  4) 12:00
          5) 1:00  6) 3:00   7) 4:00   8) 5:00
(leyó horarios del martes 1, excluyendo la cita que se mueve · 2 de 8)

PACIENTE: a las 10

AGENTE:   Listo, moví tu cita del jueves 27 a las 3:30 al martes 1 de
          septiembre a las 10:00 de la mañana. Sigue en línea y tu pago se
          fue con ella. Araceli ya recibió el aviso.
(movió la cita — aplicado: sí, dinero: viajó con la cita · 3 de 8 · turno cerrado)
```

**DÓNDE SE PUEDE TORCER**

1. **Quiere recorrerla media hora el mismo día** («de 5:00 a 5:30»). Hoy la lectura de
   disponibilidad pasa `NULL` en el parámetro que excluye la cita que se mueve, así que **su
   propia cita se tapa a sí misma los huecos vecinos** y el agente le diría que no sin poder
   explicar por qué. Es un parámetro. Sin ese arreglo, este desvío es un callejón.
2. **Tiene dos citas.** Se nombran las dos con su etiqueta y ella escoge. Cero llamadas extra
   mientras el turno siga abierto.
3. **La cita ya no está programada** (alguien la canceló mientras tanto):
   `CITA_YA_NO_ESTA_PROGRAMADA`. El agente vuelve a abrir expediente y le cuenta lo que sí tiene.

---

### Flujo 6 · Reprogramar tarde

**QUÉ SE DECIDE AQUÍ.** **Mover es gratis siempre y no se menciona ningún plazo.** Cobrar un
cambio tardío al reprogramar es estructuralmente imposible hoy, así que advertir de un cobro que
no puede ocurrir sería mentirle en la dirección que la hace aguantarse una cita que podía mover.

```
PACIENTE: se me atravesó algo, ¿puedo mover la de mañana?

AGENTE:   Claro. Tienes Psicoterapia individual mañana jueves 27 a las 3:30
          de la tarde, en línea. ¿Qué día te queda mejor?
(abrió expediente: la cita trae cambio_a_tiempo = falso, y no cambia nada · 1 de 8)

PACIENTE: el viernes

AGENTE:   Para el viernes 28, en línea, tengo tres horas:
          1) 3:00  2) 4:00  3) 5:00
(leyó horarios del viernes 28 · 2 de 8)

PACIENTE: la 1

AGENTE:   Listo, moví tu cita de mañana a las 3:30 al viernes 28 a las 3:00
          de la tarde. Sigue en línea y tu pago se fue con ella. Araceli ya
          recibió el aviso.
(movió la cita · 3 de 8 · turno cerrado)
```

El texto es **idéntico** al del flujo 5. Ésa es la decisión.

**DÓNDE SE PUEDE TORCER**

1. **Ella misma menciona el plazo** («ya sé que es tarde, ¿me van a cobrar?»). El agente no
   inventa: «Mover no tiene costo. Si te queda alguna duda de cobros, eso lo ves con Araceli.»
2. **Su profesional sí ve la marca.** La cita vieja queda sellada con `change_policy_result`, y
   Araceli lo ve en su ficha. El agente no lo menciona: no es información suya.
3. **Quiere mover y cancelar en el mismo mensaje.** Una mutación por turno. Se hace la primera,
   se cierra, y se le pide que escriba otra vez para la segunda.

---

### Flujo 7 · Confirmar

**QUÉ SE DECIDE AQUÍ.** Es la gestión más barata y la que el sistema anterior hizo 348 veces. Dos
llamadas y ni una decisión.

```
PACIENTE: sí voy

AGENTE:   Perfecto, Emilio. Confirmé tu cita del jueves 27 de agosto a las
          3:30 de la tarde, en línea. Araceli ya recibió el aviso.
(abrió expediente · 1 de 8; confirmó — aplicado: sí · 2 de 8 · turno cerrado)
```

**DÓNDE SE PUEDE TORCER**

1. **Ya estaba confirmada.** `CITA_YA_CONFIRMADA`. Nunca se contesta un error: «Esa ya la tenías
   confirmada. Nos vemos el jueves 27 a las 3:30.»
2. **Confirma una cita que no existe** («sí voy el viernes» y no hay nada el viernes). El
   expediente ya se lo dijo: «No tengo ninguna cita tuya el viernes. La que tienes es el jueves 27
   a las 3:30. ¿Es ésa?»
3. **Confirma y de paso pide otra cosa** («sí voy, y mándame la dirección»). Se contesta todo en
   el mismo mensaje: la dirección ya viene en el expediente, cero llamadas extra.

---

### Flujo 8 · Cancelar sin dinero adentro, a tiempo

**QUÉ SE DECIDE AQUÍ.** Cancelar a tiempo cierra el asunto y **no abre ninguna decisión de
cobro**. El pago pendiente queda condonado en el mismo movimiento.

```
PACIENTE: quiero cancelar mi cita del martes

AGENTE:   Listo, cancelé tu cita del martes 1 de septiembre a las 10:00 de
          la mañana. Miranda ya recibió el aviso.
          Si quieres agendar otra, dime qué día te queda bien.
(abrió expediente: la cita trae cancelar entre sus acciones · 1 de 8;
 canceló — aplicado: sí, dinero: sin cobro · 2 de 8 · turno cerrado)
```

**DÓNDE SE PUEDE TORCER**

1. **Quiere cancelar y agendar otra en el mismo mensaje.** Una mutación por turno. Se cancela, se
   cierra, y el mensaje siguiente abre turno nuevo para agendar. **No existe la maniobra de
   cancelar-y-reagendar**: son dos gestiones.
2. **No dice cuál.** Tiene una sola, así que se nombra y se hace. Con dos, se pregunta con las dos
   etiquetas.
3. **La cita ya pasó.** `CITA_YA_NO_ESTA_PROGRAMADA`: «Esa cita ya pasó, así que no hay nada que
   cancelar. ¿Quieres que te busque horario para la siguiente?»

---

### Flujo 9 · Cancelar tarde

**QUÉ SE DECIDE AQUÍ.** Cancelar tarde **sí se puede**, y es el único circuito de cobro que
funciona de punta a punta. El mensaje lo dice tal cual, **sin prometer que le avisarán** y sin
prometer nada sobre el cobro.

```
PACIENTE: no voy a poder llegar hoy a las 6

AGENTE:   Listo, cancelé tu cita de hoy a las 6:00 de la tarde. Avisaste
          con menos de 12 horas, así que Miranda va a decidir si te cobra
          esa sesión. Ella ya recibió el aviso.
(abrió expediente: la cita trae cambio_a_tiempo = falso · 1 de 8;
 canceló — aplicado: sí, dinero: decisión del profesional · 2 de 8 · turno cerrado)
```

Las **12 horas** salen de la ficha de Miranda. Con Araceli el mismo mensaje diría 24.

**DÓNDE SE PUEDE TORCER**

1. **Pregunta cuánto le van a cobrar.** Texto 2: lo decide su profesional directamente.
2. **Pide que no le cobren.** Texto 2, otra vez. El agente **no negocia** y no abre ninguna
   decisión por su cuenta.
3. **Está en el límite** (13 horas antes con Miranda). El servidor calcula, el agente no resta
   nunca. Si sale a tiempo, el mensaje es el del flujo 8 y no menciona plazo alguno.

**Advertencia que hay que dejar dicha:** hoy esa decisión es muy difícil de encontrar en la app
de Miranda —no sale en Cobros, no pone punto en el calendario, y el aviso se borra solo a las 24
horas—. El agente va a ser el único que las produzca, y las va a producir todas.

---

### Flujo 10 · Cancelar con dinero adentro, sin serie

**QUÉ SE DECIDE AQUÍ.** Una cita con el dinero adentro **no se cancela desde el chat**. La acción
`cancelar` ni siquiera aparece en esa cita, así que el agente no lo intenta y no recibe un error:
lo sabe antes de abrir la boca.

```
PACIENTE: necesito cancelar la del viernes

AGENTE:   Esa cita ya tiene tu pago, así que no la puedo cancelar desde
          aquí. Lo que sí puedo es moverla a otro día: tu pago se va con
          ella, y tu comprobante también.
          ¿Qué día te queda bien?
(abrió expediente: dinero_adentro = sí, y cancelar no está entre las acciones · 1 de 8)

PACIENTE: el martes 1

AGENTE:   Para el martes 1, presencial, tengo ocho horas:
          1) 9:00  2) 10:00  3) 11:00  4) 12:00
          5) 1:00  6) 3:00   7) 4:00   8) 5:00
(leyó horarios del martes 1 · 2 de 8)

PACIENTE: la 6

AGENTE:   Listo, moví tu cita del viernes 28 a las 4:00 al martes 1 de
          septiembre a las 3:00 de la tarde. Sigue presencial y tu pago se
          fue con ella. Araceli ya recibió el aviso.
(movió la cita · 3 de 8 · turno cerrado)
```

**DÓNDE SE PUEDE TORCER**

1. **Insiste en cancelar.** Texto 2 (`asunto_de_dinero`): los cobros y las devoluciones los decide
   Araceli. Y la cita **se queda como está**. Cuesta una llamada más (2 de 8).
2. **No hay ningún día que le sirva.** Mismo camino: texto 2, la cita se queda y el dinero también.
   Es el peor final del flujo y hay que aceptarlo, no maquillarlo.
3. **Cree que ya se canceló.** El agente nunca dijo que sí. La frase de arriba empieza por «no la
   puedo cancelar desde aquí», que es lo primero que se lee.

**La frase está aprobada y va literal.** Falta decidir quién la escribe: hoy la escribiría el
modelo, porque al no existir la acción `cancelar` nunca llega el error que traería el texto del
servidor (supuesto 5).

---

### Flujo 11 · Cancelar con dinero adentro, con serie

**QUÉ SE DECIDE AQUÍ.** El texto aprobado ofrece **dos salidas**: mover, o pasar el pago a otra
cita del mismo servicio. **La segunda no existe hoy y no se puede construir con lo que hay.**

```
PACIENTE: quiero cancelar la del viernes

AGENTE:   Esa cita ya tiene tu pago, así que no la puedo cancelar desde
          aquí. Puedo moverla a otro día, o pasar tu pago a tu cita del
          martes 8. ¿Cuál prefieres?
(abrió expediente: dinero_adentro = sí y hay otra cita del mismo servicio · 1 de 8)

PACIENTE: pásalo a la del 8

AGENTE:   ← AQUÍ NO HAY NADA DETRÁS.
```

Tres bloqueos verificados: la función de reprogramar **siempre** crea una cita nueva y no acepta
una existente como destino; `payments` tiene `UNIQUE (appointment_id)`, así que habría que
**fusionar** dos pagos, no insertar otro; y no hay ninguna operación que lo haga. Además hay
**cero series de recurrencia activas** en producción.

**Lo que recomiendo para esta ronda:** que este flujo **no exista**. Se contesta siempre con la
frase de una sola salida (flujo 10) y el segundo texto se guarda para el día que se construya el
traslado. Si Gael quiere las dos salidas, hay que abrir un renglón nuevo en el modelo de pagos, y
eso es una ronda propia.

**DÓNDE SE PUEDE TORCER**

1. **Se ofrece y no se puede cumplir.** Es exactamente el falso éxito contra el que está armado
   todo el resto del diseño. Es la razón de la recomendación.
2. **El importe no coincide** con el de la cita destino. Ni siquiera está decidido qué se hace.
3. **Ella lo pide sin que se lo ofrezcan** («¿me lo pasas a la otra cita?»). Texto 2: eso lo ve
   con Araceli.

---

### Flujo 12 · Mandar el comprobante

**QUÉ SE DECIDE AQUÍ.** El agente **guarda y avisa; nunca acredita**. La palabra «pagado» y la
palabra «aprobado» no salen jamás de este flujo.

```
PACIENTE: [manda una foto, sin texto]

AGENTE:   Comprobante recibido, gracias Emilio. Araceli lo va a revisar.
          Tu cita del viernes 28 a las 4:00 de la tarde ya quedó confirmada.
(abrió expediente: hay un pago esperando comprobante · 1 de 8;
 registró el comprobante — aplicado: sí · 2 de 8 · turno cerrado)
```

**DÓNDE SE PUEDE TORCER**

1. **Anuncia el comprobante sin mandarlo** («ahorita te mando el comprobante»). El agente **no
   llama a nada**: «Va, mándame la foto por aquí y la registro.» Si el modelo se adelanta y llama,
   el servidor contesta `SIN_ARCHIVO` y el agente pide la foto.
2. **Tiene dos pagos esperando comprobante.** El expediente trae los dos con su etiqueta: «¿Es de
   la cita del viernes 28 o la del martes 1?» Cero llamadas extra.
3. **Ya había mandado uno.** `YA_HAY_COMPROBANTE`: «Ése ya lo tenemos y Araceli lo va a revisar.»
   Y ahí hay un hueco real: el segundo comprobante desaparece en silencio y no hay forma de
   corregir el primero desde ninguna pantalla. Corregir un comprobante ya mandado es texto 1.
4. **Manda la foto y pregunta si ya quedó.** Se contesta con el expediente, no con texto 2: el
   comprobante está en revisión.

**Depende de una pieza que hoy no existe:** nadie baja el archivo de los servidores de WhatsApp.
La versión anterior sí lo hacía, en el webhook. Hay que hacerlo al admitir el mensaje.

---

### Flujo 13 · Mandar una foto que no es comprobante

**QUÉ SE DECIDE AQUÍ.** El agente **no juzga el contenido de la imagen**. Lo que decide es si hay
una petición de comprobante abierta.

**13a — No hay ningún pago esperando comprobante.**

```
PACIENTE: [manda una foto de un gato]

AGENTE:   Recibí tu foto, pero ahorita no tienes ningún pago pendiente de
          comprobante con Araceli.
          Yo te ayudo con tus citas y con hacerle llegar tu comprobante
          cuando toque. ¿Necesitas algo de tu cita del viernes?
(abrió expediente: no hay pagos con registrar_comprobante · 1 de 8)
```

**13b — Sí hay petición abierta y la foto no es un comprobante.** Se registra igual. Nadie del
lado del sistema puede distinguirlo, y Araceli lo va a ver al revisar. El agente contesta lo mismo
que en el flujo 12.

**13c — Manda audio, video o un sticker.**

```
PACIENTE: [manda una nota de voz]

AGENTE:   Por ahora sólo puedo leer texto, fotos y archivos PDF. ¿Me lo
          escribes?
(no consultó nada · 0 de 8)
```

**DÓNDE SE PUEDE TORCER**

1. **La versión anterior se quedaba callada** con audio, video y PDF. Eso no se copia: el silencio
   es peor que un «por ahora sólo puedo leer texto».
2. **Manda la foto con un texto encima** («aquí está, ya pagué»). Se registra la foto y se
   contesta lo del flujo 12. Nunca se contesta «ya quedó pagado».
3. **Manda la foto a un teléfono desconocido.** Es el flujo 21: primero la identidad, después
   todo lo demás.

---

### Flujo 14 · Cambiar de modalidad

**QUÉ SE DECIDE AQUÍ.** El modelo **no evalúa la política**: la acción `cambiar_modalidad` aparece
o no aparece en esa cita, y él escoge de la lista que le dieron. La direccionalidad es real —hay
una profesional que deja pasar a en línea pero no a presencial.

```
PACIENTE: ¿la puedo tomar en línea?

AGENTE:   Sí. Cambié tu cita del martes 1 a las 10:00 de la mañana a en
          línea. Miranda ya recibió el aviso.
          Te comparto la liga: https://meet.example/miranda
(abrió expediente: la cita trae cambiar_modalidad · 1 de 8;
 cambió la modalidad — aplicado: sí · 2 de 8 · turno cerrado)
```

**DÓNDE SE PUEDE TORCER**

1. **Su profesional no lo permite.** `MODALIDAD_NO_PERMITIDA`: «Ese cambio lo tienes que ver
   directamente con Miranda.» Dos de cinco profesionales prohíben los dos cambios.
2. **Ya pasó el plazo.** `MODALIDAD_SIN_TIEMPO`: «Para cambiar la modalidad necesito 12 horas de
   anticipación. Si lo necesitas hoy, escríbele a Miranda.» Las 12 horas salen de su ficha.
3. **Cambia de modalidad y no hay a dónde mandarla.** Éste es el desvío que más me preocupa y es
   real hoy: **Araceli permite pasar a en línea y no tiene liga de videollamada**; **Miranda
   permite pasar a presencial y no tiene dirección**. El cambio se aplica y después no hay nada
   que darle. El agente no inventa: «Cambié tu cita a en línea. Araceli te va a mandar la liga
   antes de la sesión.» Y ahí quedó una promesa que nadie está obligado a cumplir. **Hay que
   decidir si el cambio se ofrece cuando el destino no tiene dónde** (supuesto 8).

---

### Flujo 15 · Preguntar la dirección o el enlace

**QUÉ SE DECIDE AQUÍ.** **Cero llamadas extra.** La dirección y la liga vienen en el expediente,
en el mismo movimiento que abre todo. Y ninguna profesional tiene las dos a la vez.

```
PACIENTE: ¿dónde es la cita?

AGENTE:   Tu cita del viernes 28 a las 4:00 de la tarde es presencial, en
          Av. Insurgentes Sur 1602, piso 4, Ciudad de México.
(abrió expediente: trae dirección y liga · 1 de 8)
```

**DÓNDE SE PUEDE TORCER**

1. **La cita es en línea y su profesional no tiene liga registrada.** Pasa hoy con Araceli. «Tu
   cita del martes 1 a las 10:00 es en línea. Araceli te manda la liga antes de la sesión.» Nunca
   se inventa una liga.
2. **La cita es presencial y no hay dirección.** Pasa hoy con Miranda. Mismo trato.
3. **Se pierde el pin de mapa.** La versión anterior mandaba una ubicación real de WhatsApp. Hoy
   sale la dirección en texto. Es una pérdida chica y recuperable: la base sí guarda las
   coordenadas.

---

### Flujo 16 · Preguntar precios

**QUÉ SE DECIDE AQUÍ.** El precio del servicio **sí se dice**, y es una ganancia: la web de
agendar nunca lo mostró. Todo lo demás que suene a dinero es texto 2.

```
PACIENTE: ¿cuánto cuesta una sesión?

AGENTE:   Con Araceli, Psicoterapia individual son $800, 50 minutos.
          ¿Quieres que te busque horario?
(abrió expediente: trae los servicios con su precio · 1 de 8)
```

**DÓNDE SE PUEDE TORCER**

1. **Pregunta cuánto debe.** El expediente trae sus pagos con importe y estado, así que se
   contesta con datos: «Tienes pendiente la sesión del viernes 28, $800.» Si pregunta cómo
   pagarla, ahí sí entra el texto 2.
2. **Pide descuento.** Texto 2, sin negociar.
3. **Tiene precio preferente.** El precio de esa paciente puede ser distinto del de catálogo. El
   expediente tiene que traer **su** precio, no el del catálogo, o el agente le va a decir un
   número y el servidor va a grabar otro (supuesto 6).

---

### Flujo 17 · Dejar reseña

**QUÉ SE DECIDE AQUÍ.** El agente **no pide la reseña**: la pide la plantilla que Gael manda a
mano. Y el cierre **nunca promete publicación**.

```
PACIENTE: 5 estrellas, Miranda me ayudó muchísimo

AGENTE:   Listo, te agradecemos mucho que compartieras esto. Tu nombre
          queda anónimo: en su perfil sólo se muestran tus iniciales.

          Nos ayuda a que más personas encuentren buenas profesionales en
          nuestro directorio. ¡Gracias!
(abrió expediente: reseña disponible · 1 de 8;
 registró la reseña — aplicado: sí · 2 de 8 · turno cerrado)
```

**DÓNDE SE PUEDE TORCER**

1. **Manda sólo el comentario, sin calificación.** «Gracias. ¿Cuántas estrellas le pondrías, del 1
   al 5?» Cero llamadas extra: la reseña se registra cuando llega la calificación. El comentario
   es opcional y no se insiste.
2. **Ya dejó una.** `RESENA_YA_ENVIADA`: se agradece y se cierra.
3. **Todavía no ha tenido ninguna sesión.** `RESENA_SIN_SESION_ATENDIDA`: «Podrás dejarla después
   de tu primera sesión.»
4. **Pregunta cuándo se publica.** No se promete nada. Hoy la moderación es manual y fuera del
   sistema: lo que capture el agente queda invisible hasta que una persona lo publique a mano, y
   hay cero reseñas en producción.

---

### Flujo 18 · Pedir una devolución

**QUÉ SE DECIDE AQUÍ.** Texto 2 literal, y **la gestión sigue abierta**: no se despide.

```
PACIENTE: ¿me pueden devolver lo de la sesión que no tomé?

AGENTE:   Los cobros, los descuentos y las devoluciones los decide Araceli
          directamente, así que eso lo ves con Araceli.

          Yo te ayudo con tus citas y con hacerle llegar tu comprobante.
(abrió expediente · 1 de 8; el texto fijo · 2 de 8)
```

El nombre se repite a propósito en vez de decir «con ella»: puede haber profesionales hombres.

**DÓNDE SE PUEDE TORCER**

1. **Insiste.** Se repite el mismo texto. No se negocia y no se improvisa una variante.
2. **Pregunta si ya se aprobó su pago.** Mismo texto: es asunto de dinero. Pero **«¿ya te llegó mi
   comprobante?» no lo es** —eso tiene datos y se contesta con el expediente: está en revisión.
3. **Después pide otra cosa** («ok, entonces muéveme la cita»). La gestión sigue abierta y se
   sigue normal: quedan seis llamadas.

---

### Flujo 19 · Pedir hablar con una persona

**QUÉ SE DECIDE AQUÍ.** Texto 1 literal, con el enlace del equipo. **Nunca `handoff_to_human`.**

```
PACIENTE: quiero hablar con alguien de verdad

AGENTE:   Eso no lo puedo ver desde aquí. Si necesitas ayuda de nuestro
          equipo, escríbenos por aquí:
          https://wa.me/525564370081

          Yo te sigo ayudando con tus citas y con hacerle llegar tu
          comprobante a Araceli.
(abrió expediente · 1 de 8; el texto fijo · 2 de 8)
```

**DÓNDE SE PUEDE TORCER**

1. **El modelo traspasa de verdad.** Si llama a `handoff_to_human`, la conversación pasa a una
   persona, **nadie la suelta**, y ella deja de recibir respuesta del agente para siempre sin que
   nadie se entere. La herramienta no se puede desactivar; se contiene por prompt y se vigila a
   mano.
2. **Pide que le mandemos un recado a su profesional.** Mismo texto 1: eso tampoco lo hace el
   agente.
3. **Pide reactivar su cuenta.** Texto 1 también, salvo que el expediente diga que está dada de
   baja: ahí es el flujo 22.

---

### Flujo 20 · Mensaje de crisis

**QUÉ SE DECIDE AQUÍ.** Va **sola y primero**. No se mezcla con la gestión, no lleva pregunta de
cierre, y **no gasta ni una llamada**: el texto vive literal en el prompt, porque si dependiera de
una llamada de red y del presupuesto de ocho, un tope alcanzado en un mensaje de crisis sería
silencio en el peor momento del producto.

```
PACIENTE: ya no quiero seguir aquí, no le veo sentido a nada

AGENTE:   Si necesitas ayuda inmediata: Agenda Psi no es un servicio de
          emergencias. Si tú o alguien más se encuentra en peligro, llama
          al 911. Para recibir apoyo en salud mental, comunícate gratis,
          las 24 horas, a Línea de la Vida: 800 911 2000.
(no consultó nada · 0 de 8 · turno cerrado)
```

**DÓNDE SE PUEDE TORCER**

1. **Viene mezclado con una gestión** («ya no quiero seguir aquí, cancélame la cita del jueves»).
   **Va el texto solo.** La cancelación no se hace y no se menciona. Si ella insiste después, se
   atiende en el mensaje siguiente.
2. **Se dispara con algo que no era crisis** («me quiero morir de risa»). Es el costo aceptado del
   lado seguro. El texto es breve y no acusa a nadie.
3. **Ella responde al texto.** Turno nuevo, gestión normal. El agente no vuelve a mandarlo salvo
   que haya señal otra vez.

---

### Flujo 21 · Teléfono desconocido

**QUÉ SE DECIDE AQUÍ.** Texto 3 literal, y **la gestión cierra**. Nunca fue paciente → directorio.

```
PACIENTE: hola, quiero agendar una cita con un psicólogo

AGENTE:   Hola. Este número es el asistente de Agenda Psi, y desde aquí
          sólo puedo ayudar a pacientes que ya están con un psicólogo o
          psicóloga de la plataforma.

          Si estás buscando uno, aquí puedes ver quiénes están disponibles:
          https://agendapsi.mx
(abrió expediente: relación pública · 1 de 8; el texto fijo · 2 de 8 · turno cerrado)
```

**DÓNDE SE PUEDE TORCER**

1. **Hoy no llega ni a contestar.** Sin inquilino, el portero sólo deja pasar tres operaciones y
   **`open_case` no está en ninguna lista** —ni en la desplegada ni en la escrita—. Sin ese
   renglón, un teléfono desconocido no recibe nada. Son dos líneas.
2. **Insiste.** Se repite el mismo texto una vez y ya. No hay conversación que sostener.
3. **Es paciente pero con otro teléfono.** Recibe el mismo texto 3, que es lo correcto: para
   nosotros ese número no es nadie. Que le escriba a su profesional para que le corrija el
   registro.

---

### Flujo 22 · Paciente inactivo

**QUÉ SE DECIDE AQUÍ.** Texto 5 literal, y **la gestión cierra**. Fue paciente y ya no →
**que la reactiven**, nunca al directorio. Ése es el corte limpio contra el flujo 21.

```
PACIENTE: quiero agendar con Miranda

AGENTE:   Por ahora no apareces como paciente activo con Miranda, así que
          desde aquí no puedo ayudarte con tus citas.

          Escríbele directamente para que te reactive, y en cuanto lo haga
          te sigo apoyando por aquí.
(abrió expediente: relación dada de baja · 1 de 8; el texto fijo · 2 de 8 · turno cerrado)
```

**DÓNDE SE PUEDE TORCER**

1. **Hoy tampoco recibe nada.** El portero rechaza con `TENANT_NOT_ACTIVE` **incluso la respuesta
   fija**. Es una línea del portero, y sin ella este flujo entero es silencio.
2. **Pide que la reactivemos nosotros.** Texto 1: eso no lo puede hacer el agente.
3. **Tiene una cita futura de cuando estaba activa.** No se le enseña ni se le deja tocar. El
   texto 5 es la única respuesta.

---

### Flujo 23 · Se le acaba el presupuesto a media gestión

**QUÉ SE DECIDE AQUÍ.** El agente **cuenta sus pasos y corta antes de reventar**. La novena
llamada no da un error suave: revienta la restricción y ella se queda parada a media gestión de
agendar, que es el peor lugar posible del producto.

```
PACIENTE: quiero cita
AGENTE:   ¿Qué día te queda bien, y en línea o presencial? Puedo desde el viernes 28.
(abrió expediente · 1 de 8)

PACIENTE: ¿el viernes?
AGENTE:   El viernes 28, en línea, tengo 3:00, 4:00 y 5:00.
(leyó el viernes 28 · 2 de 8)

PACIENTE: no me queda, ¿el lunes?
AGENTE:   El lunes 31 tengo 3:00, 4:00 y 5:00.
(leyó el lunes 31 · 3 de 8)

PACIENTE: ¿y el martes?
AGENTE:   El martes 1 tengo ocho horas, de 9:00 a 5:00.
(leyó el martes 1 · 4 de 8)

PACIENTE: ¿el miércoles?
AGENTE:   El miércoles 2 también, de 9:00 a 5:00.
(leyó el miércoles 2 · 5 de 8)

PACIENTE: ¿el jueves?
AGENTE:   El jueves 3, igual: de 9:00 a 5:00.
          Emilio, me quedan pocos pasos en esta consulta. De lo que ya vi,
          lo que más se parece a lo que buscas es el martes 1 a las 9:00 o
          el miércoles 2 a las 5:00. Dime cuál y la aparto ahora.
(leyó el jueves 3 · 6 de 8)

PACIENTE: déjame ver, ¿y el viernes 4?
AGENTE:   Voy a cerrar esta consulta para no dejarte a medias. Escríbeme
          otra vez cuando tengas el día y seguimos desde ahí — tardo nada.
(no consultó nada · 6 de 8 · turno cerrado)
```

El mensaje siguiente abre **turno nuevo con ocho llamadas frescas**, y no toca ningún tope: una
gestión son uno o dos turnos, muy lejos de los cinco turnos en cinco minutos.

**DÓNDE SE PUEDE TORCER**

1. **El agente no cuenta y llega a la novena.** `TOOL_BUDGET_EXCEEDED`. El error le dice «cierra
   con lo que tengas, no vuelvas a intentar», pero ella ya recibió una respuesta cortada. La regla
   tiene que estar en el prompt: **a la sexta llamada se corta y se ofrece lo que ya se vio**.
2. **Un `SLOT_TAKEN` gasta una llamada de más.** El identificador del hueco se consume **antes** de
   comprobar que el hueco siga libre, así que un choque cuesta una llamada extra. Cabe, pero
   estrecha el margen.
3. **Ella tarda más de 30 minutos en contestar.** El turno expira. No es un fallo: el agente
   vuelve a abrir expediente y vuelve a preguntar el día. Un mensaje de más y nada de dinero.

---

### Flujo 24 · Manda cinco mensajes seguidos

**QUÉ SE DECIDE AQUÍ.** **Un lote es una solicitud.** Es la forma en que se escribe por WhatsApp
y es exactamente como se conversa para agendar.

**Lo que pasa hoy, antes de tocar nada:**

```
PACIENTE: hola
PACIENTE: quiero cita
PACIENTE: con Araceli
PACIENTE: para el jueves
PACIENTE: en la tarde

AGENTE:   Hola Emilio. ¿Qué día te queda bien?
(abrió expediente con el PRIMER mensaje · 1 de 8)
```

Los otros cuatro **se salen de la bitácora**: el turno está ocupado, el despachador los descarta y
contestamos 200, así que Kapso ni siquiera reintenta. El agente pregunta el día que ella ya dijo
dos veces.

**Lo que tiene que pasar, con el agrupamiento encendido:**

```
PACIENTE: hola / quiero cita / con Araceli / para el jueves / en la tarde
          [los cinco dentro de la ventana de 5 a 8 segundos]

AGENTE:   Hola Emilio. Para el jueves 3 por la tarde, con Araceli, tengo
          3:00, 4:00 y 5:00. ¿Cuál te aparto?
(abrió expediente · 1 de 8; leyó el jueves 3 · 2 de 8)
```

**DÓNDE SE PUEDE TORCER**

1. **Encenderlo antes de tocar el código apaga el agente entero.** Con el agrupamiento encendido
   toda entrega pasa a formato de lote, incluso un mensaje solo, y hoy hay **dos `return` que
   contestan 422 a cualquier lote**. Cuatro reintentos fallidos por entrega y, en quince minutos
   con veinte entregas, Kapso pone el webhook en inactivo, manda correo a todo el mundo y **no
   vuelve a intentar hasta que alguien lo rehabilita a mano**. Primero el código, después el
   interruptor.
2. **Los mensajes llegan separados.** Si tarda quince segundos entre uno y otro, son entregas
   distintas y el turno se reanuda con cada una. Funciona, y cada mensaje que reanuda cuenta para
   el tope de **diez mensajes en cinco minutos**. Con la gestión completa en un solo turno, ése es
   el techo real.
3. **Pasa de diez en cinco minutos.** El borde manda el texto 8 (`vas_muy_rapido`), **una sola vez
   cada quince minutos por teléfono**. Del mensaje siguiente en adelante, silencio durante ese
   cuarto de hora. Ella escribe cada vez más rápido porque nadie contesta, y eso lo empeora.
4. **El lote entero se pierde.** Ingeniería de Kapso confirmó que un lote listo para enviar puede
   tratarse como basura de limpieza antes de crear el registro de entrega, y desaparece sin dejar
   fila. Cambiamos «perder el segundo mensaje de una ráfaga, siempre» por «perder un lote
   completo, rara vez». Con la ventana en 5 a 8 segundos vale la pena, pero es un intercambio.

---

### Flujo 25 · Escribe algo que no se entiende

**QUÉ SE DECIDE AQUÍ.** **Nunca silencio, y nunca «no te entendí» a secas.** Se contesta con lo
que sí se puede hacer, y con sus datos concretos, que es lo que hace que la siguiente frase suya
sea útil.

```
PACIENTE: asdkjh

AGENTE:   No te entendí, Emilio. Te ayudo con esto:
          1) mover o cancelar tu cita del jueves 27 a las 3:30
          2) confirmarla
          3) agendar otra
          4) mandarme tu comprobante
          ¿Cuál necesitas?
(abrió expediente · 1 de 8)
```

Las opciones **salen del expediente**, no de una lista fija: si no tuviera cita, no aparecerían las
tres primeras. Nunca pasan de cuatro.

**DÓNDE SE PUEDE TORCER**

1. **Escribe en otro idioma o con muchas faltas.** Mismo camino. El agente no corrige ni comenta.
2. **Es un saludo suelto** («hola», «buenas»). No es «no se entiende»: es el arranque normal. Se
   saluda y se ofrece lo mismo. Ojo con no heredar el error de la versión anterior, que ante
   cualquier texto mandaba un enlace para agendar aunque ella sólo hubiera dicho «gracias».
3. **Repite lo mismo sin entenderse dos veces.** A la segunda, texto 1: que le escriba al equipo.
   No hay tercera.
4. **No hay ningún texto fijo para este caso.** Los ocho aprobados no lo cubren. Hoy la frase la
   redactaría el modelo (supuesto 4).

---

## 3. Cuadro de llamadas por gestión

| Flujo | Llamadas en el camino normal | Peor caso |
|---|---|---|
| 1 · Agendar | **3** | 8 (seis días probados) |
| 2 · Agendar con cita próxima | 1 (si sólo avisa) o **3** (si mueve) | 8 |
| 3 · Agendar con prepago | **3** + 2 después, por el comprobante | 8 + 2 |
| 4 · Sin horarios | **2** (texto fijo) o 2 por día probado | 8 |
| 5 · Reprogramar | **3** | 8 |
| 6 · Reprogramar tarde | **3** | 8 |
| 7 · Confirmar | **2** | 2 |
| 8 · Cancelar a tiempo | **2** | 2 |
| 9 · Cancelar tarde | **2** | 2 |
| 10 · Cancelar con dinero (mueve) | **3** | 8 |
| 10 · Cancelar con dinero (insiste) | **2** | 2 |
| 11 · Cancelar con dinero y serie | — no existe hoy | — |
| 12 · Comprobante | **2** | 2 |
| 13 · Foto que no es comprobante | **1** | 2 |
| 14 · Cambiar modalidad | **2** | 2 |
| 15 · Dirección o enlace | **1** | 1 |
| 16 · Precios | **1** | 2 |
| 17 · Reseña | **2** | 2 |
| 18 · Devolución | **2** | 2 |
| 19 · Hablar con una persona | **2** | 2 |
| 20 · Crisis | **0** | 0 |
| 21 · Teléfono desconocido | **2** | 2 |
| 22 · Paciente inactivo | **2** | 2 |
| 23 · Presupuesto agotado | corta en **6** | 8 |
| 24 · Cinco mensajes | **1 a 2** | igual |
| 25 · No se entiende | **1** | 2 |

**Nada normal pasa de tres.** El presupuesto de ocho es generoso para conversar; lo que aprieta es
el tope de diez mensajes en cinco minutos, y sólo si la conversación se alarga mucho.

---

## LO QUE ESTE GUION ASUME Y HAY QUE CONFIRMAR CON EL DUEÑO

1. **La hora que ella escoge es la confirmación.** No hay paso de «¿confirmo?»: dice «la 7» y la
   cita queda. Ahorra un ida y vuelta y una llamada, pero es un cambio respecto de la web
   anterior, que sí tenía pantalla de confirmación. **¿Se aparta directo, o se pregunta antes?**
2. **Las opciones se ofrecen como texto numerado, no como lista interactiva de WhatsApp.** Hoy el
   carril del agente sólo manda texto. Una lista interactiva se puede mandar desde el servidor,
   pero es una pieza más. **¿Texto numerado, o vale la pena la lista?**
3. **El enum de textos fijos no coincide con la lámina.** La lámina aprobada tiene ocho:
   `fuera_de_alcance`, `asunto_de_dinero`, `no_te_reconocemos`, `elige_profesional`,
   `paciente_inactivo`, `sin_horarios`, crisis y `vas_muy_rapido`. El diseño escrito nombra otros
   dos que no están en la lámina: `agenda_cerrada` y `dada_de_baja`. **Mandan los de la lámina, y
   `agenda_cerrada` se queda sin texto** — hoy no hace falta, porque las cinco profesionales
   tienen la agenda abierta y el interruptor no se puede apagar.
4. **No hay texto para «no te entendí».** El flujo 25 lo redactaría el modelo. **¿Se escribe un
   noveno texto fijo, o se deja que el modelo lo arme con el expediente?** Mi recomendación: que
   lo arme, porque las opciones dependen de lo que ella tenga.
5. **La frase de «esa cita ya tiene tu pago» la escribiría el modelo.** Como `cancelar` desaparece
   de las acciones, el agente nunca recibe el error que traería el texto del servidor. **¿Se mete
   la frase literal en el prompt, o se hace que el servidor la mande?**
6. **El precio que se dice tiene que ser el de esa paciente**, no el de catálogo. Hay precios
   preferentes por paciente. Si el expediente trae el de catálogo, el agente dice un número y el
   servidor graba otro.
7. **Nadie le dice a dónde transferir.** En prepago el agente pide el comprobante, pero los datos
   bancarios son texto 2 y salen de su profesional. **¿Está bien así, o el agente debería poder
   darlos?**
8. **Cambiar de modalidad puede dejarla sin a dónde ir.** Araceli permite pasar a en línea y no
   tiene liga; Miranda permite pasar a presencial y no tiene dirección. **¿Se ofrece el cambio
   igual, o se apaga cuando el destino no tiene dónde?**
9. **Reprogramar tarde no advierte nada.** Mover es gratis siempre y no se menciona plazo. Es lo
   contrario de lo que hacía la versión anterior, que advertía. **Confirmar que el silencio es lo
   correcto.**
10. **El flujo 11 se cae.** El segundo texto aprobado ofrece pasar el pago a otra cita, y eso no
    existe ni se puede construir sin abrir un renglón nuevo en el modelo de pagos. **Recomiendo
    quedarnos con una sola salida —mover— y guardar el segundo texto.**
11. **La regla de «una cita futura por servicio» hoy no la impone nadie.** Vive en la frase del
    agente. **¿Se deja así, o se mete en la operación que crea la cita?**
12. **La reseña se queda dentro.** Es la decisión de Gael, pero hay que saberlo: nadie publica las
    reseñas hoy, la moderación es manual y fuera del sistema, y hay cero reseñas en producción.
    Sacarla bajaría el catálogo de siete herramientas a seis, que es lo mejor que le puede pasar a
    la precisión del modelo.
13. **La entrega de materiales no entra en este guion.** No hay quien consuma la cola de trabajos:
    hay catorce trabajos pendientes que nadie ha tocado ni una vez, y uno de ellos es la
    invitación a recoger materiales que una psicóloga dejó el 25 de agosto. Prometer un material
    que nadie entrega es el falso éxito contra el que está armado el resto.
14. **Tres cambios en la lectura de horarios, sin los cuales el guion no se puede ensayar de
    verdad:** subir el tope de 6 a 10, ofrecer horas sin traslape, y respetar la parte del día que
    ella pidió. Hoy «el jueves por la tarde» devuelve las seis primeras horas de la mañana.
15. **La vida del identificador de hueco sube de 5 a 30 minutos.** Con cinco minutos, volver a
    pedir el mismo día **revienta la lectura entera** y ella recibe un error en vez de una lista.
    Son tres lugares, y hay que comprobar que la llave vigente cubra la ventana más larga.

---

## Anexo A — Los ocho textos fijos, literales

Salen de `docs/diseno/textos-fijos.md`, segunda versión con las correcciones de Gael del
2026-08-26. Van así, palabra por palabra.

**1 · `fuera_de_alcance`** — reactivar la cuenta, corregir un comprobante ya mandado, mandar un
recado, hablar con una persona. *La gestión sigue abierta.*

> Eso no lo puedo ver desde aquí. Si necesitas ayuda de nuestro equipo, escríbenos por aquí:
> https://wa.me/525564370081
>
> Yo te sigo ayudando con tus citas y con hacerle llegar tu comprobante a {profesional}.

**2 · `asunto_de_dinero`** — devoluciones, descuentos, condonaciones, «¿cuánto le debo?», datos
bancarios, «¿ya se aprobó mi pago?». *La gestión sigue abierta.*

> Los cobros, los descuentos y las devoluciones los decide {profesional} directamente, así que eso
> lo ves con {profesional}.
>
> Yo te ayudo con tus citas y con hacerle llegar tu comprobante.

**3 · `no_te_reconocemos`** — nunca fue paciente. *La gestión cierra.*

> Hola. Este número es el asistente de Agenda Psi, y desde aquí sólo puedo ayudar a pacientes que
> ya están con un psicólogo o psicóloga de la plataforma.
>
> Si estás buscando uno, aquí puedes ver quiénes están disponibles: https://agendapsi.mx

**4 · `elige_profesional`** — el mismo teléfono con dos o más profesionales. Hoy no pasa con nadie.
*La gestión sigue abierta.*

> Veo que estás con más de una profesional: {lista}. ¿De cuál quieres que revisemos tus citas?

Y hay una segunda salida sin preguntar: si nombra una cita concreta, el servidor resuelve a qué
profesional pertenece y sella esa relación sin gastar este texto.

**5 · `paciente_inactivo`** — fue paciente y ya no. *La gestión cierra.*

> Por ahora no apareces como paciente activo con {profesional}, así que desde aquí no puedo
> ayudarte con tus citas.
>
> Escríbele directamente para que te reactive, y en cuanto lo haga te sigo apoyando por aquí.

**6 · `sin_horarios`** — ni un hueco en sesenta días. *La gestión sigue abierta.*

> Ahorita {profesional} no tiene horarios abiertos para las próximas semanas. Lo mejor es que le
> escribas directamente para que te dé un espacio.

**7 · Crisis** — va sola y primero, sin pregunta de cierre. Vive literal en el prompt.
*La gestión cierra.*

> Si necesitas ayuda inmediata: Agenda Psi no es un servicio de emergencias. Si tú o alguien más
> se encuentra en peligro, llama al 911. Para recibir apoyo en salud mental, comunícate gratis,
> las 24 horas, a Línea de la Vida: 800 911 2000.

**8 · `vas_muy_rapido`** — lo manda el borde, como mucho uno cada quince minutos por teléfono.
*No hay gestión.*

> Recibí varios mensajes seguidos y necesito un momento para ponerme al día. Espérame un minuto y
> escríbeme otra vez, por favor.

### Las tres frases que salen de una operación

**El prepago, al terminar de agendar:**

> Listo, aparté tu cita del {día} a las {hora}. Para confirmarla necesito tu comprobante de pago —
> mándamelo por aquí. Si no llega en 24 horas, la cita se cancela.

**La cita con dinero adentro que quiere cancelar, sin otra cita a la cual pasar el pago:**

> Esa cita ya tiene tu pago, así que no la puedo cancelar desde aquí. Lo que sí puedo es moverla a
> otro día: tu pago se va con ella, y tu comprobante también.

**El cierre de la reseña:**

> Listo, te agradecemos mucho que compartieras esto. Tu nombre queda anónimo: en su perfil sólo se
> muestran tus iniciales.
>
> Nos ayuda a que más personas encuentren buenas profesionales en nuestro directorio. ¡Gracias!

---

## Anexo B — De dónde salió cada número de este guion

| Afirmación | Cómo se verificó |
|---|---|
| El tope de la consulta de horarios es 6 | `v_limit constant integer := 6` en `agent_get_availability_from_workflow`, migración `20260825001000` |
| El miércoles 2 devuelve 26 huecos y los seis primeros son 9:00, 9:15, 9:30, 9:45, 10:00 y 10:15 | `public._get_internal_availability_core` con modo paciente, medido contra `ssyzfeadyrczlzjbvxyl` |
| El viernes 28 devuelve 9 en línea y 14 presencial | misma consulta, las dos modalidades |
| El jueves 27 devuelve cero para Araceli | misma consulta: su anticipación mínima son 2 880 minutos |
| La disponibilidad no excluye la cita que se mueve | `NULL::uuid` en el quinto parámetro de la llamada a la primitiva |
| Araceli tiene dirección y no liga; Miranda al revés; las dos permiten los dos cambios de modalidad | `professionals` cruzado con `professional_appointment_policies` |
| Miranda da 12 h de aviso y 12 h para modalidad | `free_change_notice_minutes = 720`, `min_lead_to_change_modality_minutes = 720` |
| Nada impide agendar una segunda cita del mismo servicio | `agent_create_appointment_from_workflow` no tiene esa comprobación |
| Cancelar a tiempo con pago pendiente lo condona | rama `on_time` + `pending` → `waived/forgiven` en `agent_cancel_appointment_from_workflow` |
| Cancelar tarde abre la decisión del profesional | rama `late` → `late_change_decision = 'pending'` en la misma función |
| El cerrojo del dinero no está escrito | `PAYMENT_INSIDE` no aparece en ninguna migración del árbol de trabajo |
| La cita nacería confirmada dentro de 48 h | `v_born_confirmed := v_starts_at <= v_now + interval '48 hours'` |
| Cero comprobantes, cero reseñas, una cita futura | conteos sobre `payment_proofs`, `reviews` y `appointments` |
| Dormir no gasta ordinal | `agent_mark_inbound_waiting` no pasa por el portero |
| El cierre vive en el ordinal 9 | `agent_tool_calls_check` |
| Diez mensajes en cinco minutos, aviso uno cada quince | `RATE_LIMIT_INBOUND_5M` y `notice_claimed_at` en `agent_register_inbound_context` |
| Dos `return` contestan 422 a cualquier lote | `kapso_inbound_webhook/handler.ts` y `_shared/agent/kapso-v2.ts` |
| El resto de los datos de la versión anterior | los cuatro documentos de esta carpeta, verificados contra `deklbpimnkueqsugepqq` |
