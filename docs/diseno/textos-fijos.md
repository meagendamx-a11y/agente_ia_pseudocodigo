# Los ocho textos fijos

Segunda versión, con las correcciones de Gael del 2026-08-26.

Seis los compone el servidor y el modelo sólo escoge el código. El de crisis vive **literal
en el prompt**, porque si dependiera de una llamada de red y del presupuesto de ocho, un
`TOOL_BUDGET_EXCEEDED` en un mensaje de crisis sería silencio en el peor momento del
producto. El octavo lo manda el borde de entrada, antes de que el agente exista.

**Reglas de redacción:**
- Nada de género en la paciente. Hay pacientes hombres en producción, así que ni «activa»
  ni «activo» aplicados a ella: se rodea.
- Nada de género en la profesional. Se usa su nombre de pila, nunca «él» ni «ella».
- Ningún plazo escrito a mano, salvo las 24 h del prepago, que es un valor fijo del producto.
- Sin disculpas largas. Cálido y breve.

---

## 1 · `fuera_de_alcance`

**Cuándo.** Reactivar la cuenta, corregir un comprobante ya mandado, pedir que le mandemos
un recado a su profesional, hablar con una persona, o cualquier cosa que el agente no puede
hacer y no es de dinero.

> Eso no lo puedo ver desde aquí. Si necesitas ayuda de nuestro equipo, escríbenos por aquí:
> https://wa.me/525564370081
>
> Yo te sigo ayudando con tus citas y con hacerle llegar tu comprobante a {profesional}.

**Después:** la gestión sigue abierta.
**Compone el servidor:** `{profesional}` = nombre de pila.
**Cambio de esta versión:** se quitó el número escrito; sólo va el enlace.

---

## 2 · `asunto_de_dinero`

**Cuándo.** Devoluciones, descuentos, condonaciones, «¿cuánto le debo?», datos bancarios,
«¿ya se aprobó mi pago?».

> Los cobros, los descuentos y las devoluciones los decide {profesional} directamente, así
> que eso lo ves con {profesional}.
>
> Yo te ayudo con tus citas y con hacerle llegar tu comprobante.

**Después:** la gestión sigue abierta.
**Compone el servidor:** `{profesional}` = nombre de pila, dos veces. Se repite el nombre a
propósito en vez de decir «con ella»: puede haber profesionales hombres.

**Ojo:** este texto **no** se usa para «ya te mandé el comprobante, ¿ya quedó?». Ese caso
tiene datos y se contesta con el expediente: el comprobante está en revisión.

---

## 3 · `no_te_reconocemos`

**Cuándo.** El teléfono no tiene ninguna relación con ninguna profesional. Nunca fue paciente.

> Hola. Este número es el asistente de Agenda Psi, y desde aquí sólo puedo ayudar a
> pacientes que ya están con un psicólogo o psicóloga de la plataforma.
>
> Si estás buscando uno, aquí puedes ver quiénes están disponibles: https://agendapsi.mx

**Después:** la gestión cierra.

---

## 4 · `elige_profesional`

**Cuándo.** El mismo teléfono está vinculado con dos o más profesionales. Hoy no pasa con
nadie en producción; el texto existe para el día que pase.

> Veo que estás con más de una profesional: {lista}. ¿De cuál quieres que revisemos tus citas?

**Después:** la gestión sigue abierta.
**Compone el servidor:** `{lista}` = los nombres de pila unidos con «y».

**Y hay una segunda salida, sin preguntar.** Si ella nombra una cita concreta —«la del
jueves a las 7»— el servidor resuelve a qué profesional pertenece esa cita y sella esa
relación para el resto de la gestión, sin gastar este texto. Preguntar es el camino de
respaldo, no el primero.

---

## 5 · `paciente_inactivo`

**Cuándo.** El teléfono sí está vinculado, pero la relación ya no está activa.

> Por ahora no apareces como paciente activo con {profesional}, así que desde aquí no puedo
> ayudarte con tus citas.
>
> Escríbele directamente para que te reactive, y en cuanto lo haga te sigo apoyando por aquí.

**Después:** la gestión cierra.
**Compone el servidor:** `{profesional}` = nombre de pila.

**Cambio de esta versión:** antes este texto mandaba al directorio. Ya no. Quien fue paciente
y quiere volver necesita que la reactiven, no buscar a alguien más. El directorio se queda
sólo en el texto 3, para quien nunca fue paciente. El corte queda limpio: **nunca fue
paciente → directorio; fue y ya no → que la reactiven.**

---

## 6 · `sin_horarios`

**Cuándo.** La profesional no tiene ni un hueco en los próximos sesenta días — normalmente
porque todavía no ha guardado su horario.

> Ahorita {profesional} no tiene horarios abiertos para las próximas semanas. Lo mejor es
> que le escribas directamente para que te dé un espacio.

**Después:** la gestión sigue abierta.

---

## 7 · Crisis

**Cuándo.** Señal de riesgo para ella o para alguien más. Va **sola y primero**: no se
mezcla con la gestión y no lleva la pregunta de cierre. Este texto no cambia.

> Si necesitas ayuda inmediata: Agenda Psi no es un servicio de emergencias. Si tú o alguien
> más se encuentra en peligro, llama al 911. Para recibir apoyo en salud mental, comunícate
> gratis, las 24 horas, a Línea de la Vida: 800 911 2000.

**Después:** la gestión cierra.
**Vive literal en el prompt**, no en el servidor.

---

## 8 · `vas_muy_rapido`

**Cuándo.** Pasó alguno de los topes de tráfico. Lo manda el borde de entrada, antes de que
el agente arranque, y como mucho **uno cada quince minutos** por teléfono.

> Recibí varios mensajes seguidos y necesito un momento para ponerme al día. Espérame un
> minuto y escríbeme otra vez, por favor.

**Después:** no hay gestión. Es un mensaje suelto.

---

# Las frases que salen de una operación

No son textos fijos —los compone el servidor como parte de un resultado— pero son las que
más se van a repetir.

## La reseña

El agente **no la pide**: la pide la plantilla que Gael manda a mano
(`patient_review_request`), que ya trae la petición completa: cuántas estrellas y, si quiere,
un comentario para el perfil.

**Puede llegar en uno o en varios mensajes.** Ella puede mandar «5 estrellas» y después el
comentario, o las dos cosas juntas. Si falta la calificación, el agente la pide; el
comentario es opcional y nunca se insiste.

**Al cerrar:**

> Listo, te agradecemos mucho que compartieras esto. Tu nombre queda anónimo: en su perfil
> sólo se muestran tus iniciales.
>
> Nos ayuda a que más personas encuentren buenas profesionales en nuestro directorio.
> ¡Gracias!

## El prepago, al terminar de agendar

Sustituye al texto del comprobante que llegaba tarde, que se elimina.

> Listo, aparté tu cita del {día} a las {hora}. Para confirmarla necesito tu comprobante de
> pago — mándamelo por aquí. Si no llega en 24 horas, la cita se cancela.

## La cita con dinero adentro que quiere cancelar

Sin recurrencia — sólo se puede mover:

> Esa cita ya tiene tu pago, así que no la puedo cancelar desde aquí. Lo que sí puedo es
> moverla a otro día: tu pago se va con ella, y tu comprobante también.

Con recurrencia o con una próxima cita del mismo servicio — las dos salidas:

> Esa cita ya tiene tu pago, así que no la puedo cancelar desde aquí. Puedo moverla a otro
> día, o pasar tu pago a tu cita del {día}. ¿Cuál prefieres?

---

# El prepago, de punta a punta

Queda así, con la corrección de Gael:

1. **Agenda por formulario, normal.** La cita nace sin confirmar y el reloj de 24 h empieza
   a correr desde que agenda, no 26 h antes de la cita.
2. **El agente le pide el comprobante por chat**, con la consecuencia dicha desde el
   principio: si no llega en 24 h, se cancela.
3. **Si no llega, un trabajo programado la cancela** y libera el horario.
4. **Si después quiere otra cita, el formulario le pide la foto adentro.** No hay ventana de
   gracia ni se reabre la cita vieja: empieza de cero, pero esta vez con el comprobante
   dentro del formulario.

La condición para pedir la foto dentro del formulario: que esa paciente tenga al menos una
cita cancelada por prepago vencido. Es una consulta, y la resuelve el servidor al armar la
primera pantalla.

**Se hace con un solo formulario, no con dos.** El endpoint de datos decide a qué pantalla
va después de la de horarios: si le toca subir comprobante, la manda a la pantalla de la
foto; si no, cierra. Un solo formulario publicado, un solo permiso de Meta, un solo worker.
Dos formularios costarían dos publicaciones y dos workers, y sólo quedan dos libres.

---

# Lo que estos textos le exigen al sistema

1. **El nombre de pila de la profesional** tiene que venir en el expediente. Ya viene.
2. **`sin_horarios` necesita saber que no hay ni un hueco en el horizonte.** Sale de la
   misma consulta barata que pinta el calendario: si devuelve la lista vacía, es ese caso.
3. **`vas_muy_rapido` necesita un envío desde el borde** que hoy no existe: la admisión
   marca el rechazo y ahí se acaba, así que ella no recibe nada. Es un POST más.
4. **`elige_profesional` necesita resolver una cita contra dos relaciones** para poder tomar
   el camino corto. Hoy no hay ningún teléfono con dos, así que no se ejercita.
5. **La reseña por partes** obliga a que el agente sepa cuándo tiene lo suficiente para
   registrar: con la calificación basta.
6. **La pantalla del comprobante dentro del formulario** obliga a bajar y descifrar el
   archivo desde los servidores de WhatsApp. Es la rutina que no existe hoy, y es el único
   trabajo nuevo de peso que sale de esta ronda de correcciones.
