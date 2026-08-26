# Decisiones del ensayo

Lo que Gael fijó ensayando el agente conversando, el 26 de agosto de 2026. **Manda sobre
cualquier documento anterior**, incluidos el guion de flujos y las seis partes del diseño.

El agente es **conversacional**: agendar y reprogramar por texto, no por formulario de
WhatsApp.

---

## Reglas que atraviesan todos los flujos

1. **El agente nunca calcula fechas.** Ni «el próximo sábado es el 29», ni restas de horas.
   Empareja lo que ella escribe contra una lista que el servidor ya resolvió, con el nombre
   del día y su fecha.
2. **Ningún plazo se escribe a mano.** Salen de la ficha de cada profesional. Miranda pide
   12 horas de aviso, Araceli 24. Un texto con «24 horas» adentro le miente a la mitad.
3. **El tiempo mínimo es regla de la paciente, no de la profesional.** La profesional nunca
   está limitada por él: siempre decide. El plazo sólo gobierna lo que el agente permite y
   lo que advierte.
4. **El agente nunca dice «pagado» ni «aprobado».** Dice «recibí tu comprobante».
5. **A la paciente no se le dice que la profesional va a decidir.** Se le dice lo que va a
   pasar. Que la profesional condone o no es asunto interno suyo.
6. **Cobrar desde el agente sólo aplica cuando la profesional cobra por adelantado.** Si
   cobra después, el agente no pide comprobante ni menciona pago al agendar.
7. **Cinco opciones como máximo** en cualquier lista, y horizonte de 30 días. Si quiere algo
   más lejano, se consulta de nuevo.
8. **El agente sólo ofrece lo que esa profesional permite.** El menú de capacidades es
   personalizado: si no permite cambios de modalidad, no se menciona.
9. **El presupuesto sube de 8 a 12 llamadas por gestión.** Agendar gasta 3, así que quedan
   nueve de margen para quien pregunta mucho.

---

## La pista de las plantillas

**Ninguna de las 18 plantillas tiene botones**: todas son texto. Por eso el contexto de qué
le mandamos sustituye al payload de un botón.

**Regla:** cuando llega un mensaje, el agente mira **cuál fue la última plantilla que le
mandamos y de qué cita era**. Eso le dice qué está contestando sin adivinar. Y si usó el
«responder» de WhatsApp, es certeza — la admisión ya guarda a cuál mensaje respondió.

Nueve plantillas invitan a una acción y todas nombran la cita adentro:

| Plantilla | Qué invita |
|---|---|
| `appointment_confirmation_request` | confirmar |
| `appointment_confirmation_prepay` | comprobante, que además confirma |
| `request_session_payment_proof` | comprobante |
| `request_late_payment_proof` | comprobante por cambio sin tiempo mínimo |
| `request_no_show_payment_proof` | comprobante por no asistir |
| `appointment_cancelled_payment_proof` | comprobante tras cancelar |
| `appointment_rescheduled_payment_proof` | comprobante tras mover |
| `patient_resource_delivery` | soltar materiales |
| `patient_review_request` | reseña |

Y dos invitan a agendar sin pedir nada concreto: `appointment_cancelled` y
`patient_reactivation`.

**El contexto mejora la pregunta, no la elimina.** Con el comprobante siempre se confirma
antes de pegarlo, porque es irreversible.

---

## Qué citas se consideran

- **Para el comprobante:** todas las sesiones pasadas que deban comprobante —cada una es su
  propia deuda, no se colapsan— **más la más próxima futura** de cada serie.
- **Para confirmar, reprogramar, cancelar y cambiar modalidad:** sólo futuras, y de una
  serie sólo la más próxima.

**«Pendiente de comprobante» tiene definición exacta:** el cobro está pendiente, ya se le
pidió el comprobante, y no hay archivo. En producción hoy son cuatro, y **los cuatro son
sesiones pasadas** — vienen de que la profesional cerró la sesión en su app, no de un
prepago al agendar.

---

## Agendar

**El orden:**

1. **Servicio.** Si tiene servicios asignados, esos. Si no tiene ninguno, el catálogo
   completo de su profesional. Con su precio, preferente si lo tiene. *(Hoy 13 de 17
   pacientes activas no tienen ninguno asignado, así que la rama del catálogo es la normal.)*
2. **El aviso, si aplica.** Si ese servicio tiene recurrencia, se le explica el ritmo, el
   día, la hora y cuál es su próxima cita, y se le pregunta si de verdad quiere otra. Si
   tiene una próxima sin recurrencia, se le pregunta igual. Si no tiene nada, se salta.
3. **Modalidad**, sólo si el servicio admite las dos. Si admite una, se dice cuál y se sigue.
4. **Filtros de día y hora, en una sola pregunta.** «¿Qué días te quedan mejor y a qué hora?»
5. **Opciones concretas** que cumplen los filtros — no una lista de días.
6. **Escoge, y con eso se crea.** No hay paso de «¿confirmo?».

**No se ofrece lista de días.** Se descartó ensayando: si escoge un día y ninguna hora le
sirve, tiene que retroceder, y cada retroceso cuesta una llamada y un mensaje.

**Los filtros se usan tal cual** — días de la semana, fechas concretas, hora, o los tres. Si
sólo da la hora, se le muestran los días más próximos a esa hora. Si dice «cuando sea», las
cinco más próximas.

**La búsqueda es una sola llamada aunque el servidor revise diez días por dentro.** El
presupuesto cuenta viajes del agente al servidor, no trabajo de la base. Medido: recorrer 60
días cuesta 1.6 milisegundos.

**Cuando el filtro no da nada, se dice el motivo.** Son cinco y son distintos:

| Motivo | Qué se dice |
|---|---|
| No trabaja a esa hora | «Araceli no da consultas por la mañana. Sus horarios son de 3:00 a 7:00. ¿Te acomoda alguna?» |
| No trabaja esos días | «Araceli no atiende sábados ni domingos. Entre semana sí tengo.» |
| Esos días concretos no va a estar | «El 15 y 16 Araceli no va a estar. Lo más cercano es el 17.» |
| Sí trabaja, pero está llena | «Los martes al mediodía ya se le llenaron. Sí tengo miércoles y jueves a esa hora.» |
| Es demasiado pronto | «Para mañana ya no alcanzo: Araceli necesita 48 horas. Lo más cercano es el viernes 28.» |

**Cómo se ofrecen las horas:** si dos días traen las mismas, se dicen una sola vez («los dos
días tengo 12:00, 1:00, 3:00, 4:00 y 5:00»). Si difieren, se numeran día y hora juntos.

**Al cerrar, según cómo cobra:**

- **Cobra después:** se crea directo. No se menciona pago.
- **Cobra por adelantado:** se crea, se le dan los datos de la transferencia y se le pide el
  comprobante, con el reloj de 24 horas dicho desde el principio.

> Listo, Emilio. Aparté tu Psicoterapia individual del miércoles 2 de septiembre a las
> 12:00, presencial, con Araceli. Son $800.
>
> Para confirmarla, transfiere a BBVA, a nombre de Araceli Méndez, CLABE
> 012180001234567890, y mándame el comprobante por aquí. Si no llega en 24 horas, la cita se
> cancela y se libera el horario.

Si la profesional no llenó sus datos de pago:

> Para confirmarla necesito tu comprobante de pago. Pídele a Araceli los datos para la
> transferencia y mándame el comprobante por aquí. Si no llega en 24 horas, la cita se cancela.

---

## El comprobante

1. **Nunca se adivina a qué cita pertenece.** Se consulta qué cobros esperan comprobante, y
   se usa la pista de la última plantilla.
2. **El agente no mira la imagen.** No valida que sea un comprobante: valida que haya un
   cobro al cual pegarlo.
3. **Siempre se confirma antes de guardarlo**, aunque haya una sola cita pendiente. La base
   admite **un solo comprobante por cobro, para siempre**, y no hay pantalla para
   reemplazarlo. Una foto equivocada queda pegada.
4. **Una pendiente** → «¿Es el comprobante de tu cita del miércoles 2 a las 12:00?»
   **Varias** → se listan con fecha y monto, la más antigua primero.
   **Ninguna** → se le dice que no se espera y que se lo mande directo a su profesional.
5. **El cierre, tal cual:**

> Listo, recibí tu comprobante. Tu cita del miércoles 2 a las 12:00 ya quedó confirmada.

---

## Confirmar

- **Si cobra por adelantado, decir «sí voy» NO confirma.** El comprobante es lo que
  confirma. El agente contesta pidiendo el comprobante con los datos de pago.
- **Si cobra después**, se confirma y se cierra: «Listo, tu cita del miércoles 2 a las 12:00
  quedó confirmada.»
- **Con varias esperando confirmación**, se listan y ella escoge.

---

## Cancelar

**Sin dinero adentro, a tiempo:**

> Listo, cancelé tu cita del miércoles 2 de septiembre a las 12:00. No te queda ningún cobro
> pendiente por ella.

**Sin dinero adentro, tarde** — se avisa antes:

> Te la cancelo, pero antes te aviso: Araceli pide 24 horas de aviso y ya faltan menos, así
> que la sesión se te cobra. ¿La cancelo de todos modos?

Y al confirmar: «Listo, cancelé tu cita del miércoles 2 a las 12:00.»

**Con dinero adentro: no se cancela.** Y se dice la razón:

> Esa cita ya tiene tu comprobante, y si la cancelo se perdería tu pago. Mejor te la
> reprogramo y tu pago sigue contando. ¿Te ayudo a reprogramarla?
>
> Y si de plano la quieres cancelar, coméntaselo a Araceli y ella lo resuelve contigo.

La primera línea cambia según el estado: «ya mandaste tu comprobante» o «ya está pagada».

**Si la cita tiene recurrencia, dos salidas:**

> Esa cita no la puedo cancelar porque ya mandaste tu comprobante. Puedo reprogramarla, o
> pasar tu pago a tu cita del martes 8. ¿Cuál prefieres?

**Si insiste**, el agente no cede y da la salida real:

> Entiendo, pero cancelarla no está de mi lado. Escríbele a Araceli y ella la cancela desde
> su app. Si prefieres moverla, dime y te busco otro día.

---

## Reprogramar

**Se permite siempre, con tiempo o sin él.** Lo que cambia es lo que se advierte antes.
**No se pregunta servicio ni modalidad**: vienen de la cita que se mueve.

**Con tiempo mínimo:** se mueve y el pago se va con la cita, comprobante incluido. No se
menciona nada de cobros.

**Sin tiempo mínimo:** se avisa **antes de mover**:

> Perfecto, te ayudo a reprogramarla. Sólo te aviso antes: Araceli pide 24 horas de aviso
> para cambios y ya faltan menos, así que se cobran las dos sesiones — la del viernes y la
> nueva.
>
> ¿La movemos?

**Qué pasa con el dinero en el cambio tardío:** el pago de la cita vieja **se congela tal
como está** —si estaba pendiente de comprobante, sigue pendiente— y queda abierta la
decisión de cobro para la profesional. La cita nueva **va aparte**, con su propio pago:
comprobante si cobra por adelantado, cargo sin pedir comprobante si cobra después.

**El cierre no repite el aviso de cobro** — ya se dio antes de mover:

> Listo, moví tu cita al miércoles 2 de septiembre a las 4:00, presencial.

---

## Cambiar de modalidad

**Es una decisión por dirección.** Una cita presencial necesita el permiso «a en línea», y
al revés. No hay versión tardía con cargo: o alcanza el tiempo, o no se cambia.

**Con una sola cita:**

> Sí. Tu cita del miércoles 2 a las 4:00 pasaría de presencial a en línea. ¿La cambio?

**Las dos negativas:**

> Araceli no maneja cambios a en línea. Tu cita del miércoles 2 se queda presencial.

> Para cambiar la modalidad Araceli pide 24 horas de anticipación, y ya faltan menos. Tu
> cita del miércoles se queda presencial. Si es urgente, coméntaselo a Araceli.

**Con varias**, sin dar por hecho a qué modalidad ni cuál cita, y cada una con su modalidad
actual:

> ¿De cuál cita quieres cambiar la modalidad?
>
> 1. Jueves 27, 5:00 p.m. — presencial
> 2. Sábado 29, 11:00 a.m. — en línea

**Sólo se listan las que de verdad pueden cambiar.** Una cita entra si cumple las cuatro:
su servicio admite las dos modalidades; la profesional permite esa dirección; alcanza la
anticipación; y sigue viva y en el futuro.

---

## Reseña

El agente **no la pide**: la pide la plantilla, que ya trae la petición completa.

**Se piden los dos —calificación y comentario— pero no se bloquea.** Si sólo manda estrellas,
el agente pregunta una vez por el comentario; si no lo da, se guarda con la calificación. Si
sólo manda comentario, se pregunta la calificación. Puede llegar en uno o en varios mensajes.

> Listo, te agradecemos mucho que compartieras esto. Tu nombre queda anónimo: en su perfil
> sólo se muestran tus iniciales.
>
> Nos ayuda a que más personas encuentren buenas profesionales en nuestro directorio.
> ¡Gracias!

---

## Consultas

**Dirección o enlace** — ya vienen en el expediente, cuesta una llamada:

> Tu cita del miércoles 2 a las 4:00 es presencial. La dirección es Av. Insurgentes Sur
> 1234, Col. Del Valle.

Si no hay dirección o no hay liga: «La dirección te la comparte Araceli directamente.»

**Precios** — el mismo listado que al agendar: los asignados con su precio efectivo, y si no
tiene ninguno asignado, todos los de la profesional.

---

## Los bordes

**Teléfono desconocido, paciente inactivo y crisis** usan sus textos fijos literales
(ver `docs/diseno/textos-fijos.md`). La crisis **no cuesta ninguna llamada** a propósito: el
texto vive en el prompt, para que ni un tope de tráfico ni un error del servidor puedan
dejarla sin respuesta.

**No se entiende** — acotado a lo que el agente hace, y personalizado a lo que esa
profesional permite:

> No te entendí. Por aquí te puedo ayudar con tus citas —agendar, mover, cancelar o
> confirmar— y con lo de tus pagos. ¿Qué necesitas?

**Se acaba el presupuesto:**

> Se me acabó el espacio de esta consulta. Escríbeme otra vez y seguimos justo desde donde
> nos quedamos.

**Cinco mensajes seguidos** — con el agrupamiento encendido llegan juntos y el agente lee la
intención completa:

> Hola Emilio. Sobre tu cita del miércoles 2 a las 4:00: te la puedo mover, o cancelarla.
> ¿Cuál prefieres?

---

## Lo que hay que cambiar en el sistema

1. **La lectura de horarios está rota para conversar.** Hoy toma los primeros seis del día
   en pasos de quince minutos. Para el viernes 28 devuelve de 3:00 a 4:15 y **las 5:00 no
   aparecen nunca**. Tres arreglos: subir el tope de seis a diez, **quitar los traslapes**,
   y respetar la parte del día que pidió.
2. **Agendar por texto no está autorizado.** La operación de crear cita no está en la lista
   que el agente puede llamar. Hay que darla de alta.
3. **Subir el tope de llamadas por gestión de 8 a 12.**
4. **Tres campos de datos de pago en el perfil de la profesional** — banco, a nombre de, y
   CLABE. Opcionales, con la consecuencia explicada.
5. **La búsqueda con filtros** es una operación nueva: recibe días, fechas y hora, recorre
   los días candidatos por dentro, y devuelve hasta cinco opciones concretas o el motivo por
   el que no hay ninguna.
6. **La pista de la última plantilla** en el expediente: qué le mandamos, de qué cita, y
   cuándo.
7. **Encender el agrupamiento de mensajes**, después de que el código acepte lotes.

---

## Lo que queda abierto

1. **La rama de modalidad cruzada** — «presencial no tengo mañanas, en línea sí». Sin decidir.
2. **La decisión de cobro tardío es difícil de encontrar en la app de la profesional.** Gael
   decidió no arreglarlo en esta ronda: el aviso alcanza para el MVP y se optimiza después.
