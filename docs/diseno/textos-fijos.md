# Los ocho textos fijos

Borrador para aprobación de Gael. Corte: 2026-08-26.

Seis los compone el servidor y el modelo sólo escoge el código. El de crisis vive **literal
en el prompt**, porque si dependiera de una llamada de red y del presupuesto de ocho, un
`TOOL_BUDGET_EXCEEDED` en un mensaje de crisis sería silencio en el peor momento del
producto. El octavo lo manda el borde de entrada, antes de que el agente exista.

**Reglas de redacción que se siguieron:**
- Nada de género en la paciente. Hay pacientes hombres en producción, así que ni «activa»
  ni «activo»: se rodea.
- Nada de género en la profesional. Se usa su nombre de pila, nunca «él» ni «ella».
- Ningún plazo escrito a mano. Si un texto llevara horas, saldrían de la ficha.
- Sin disculpas largas ni «lamento informarte». Cálido y breve.

---

## 1 · `fuera_de_alcance`

**Cuándo.** Reactivar la cuenta, corregir un comprobante ya mandado, pedir que le mandemos
un recado a su profesional, hablar con una persona, o cualquier cosa que el agente no puede
hacer y no es de dinero.

> Eso no lo puedo ver desde aquí. Si necesitas ayuda de nuestro equipo, escríbenos al
> 55 64 37 00 81: https://wa.me/525564370081
>
> Yo te sigo ayudando con tus citas y con hacerle llegar tu comprobante a {profesional}.

**Después:** la gestión sigue abierta.
**Compone el servidor:** `{profesional}` = nombre de pila.

---

## 2 · `asunto_de_dinero`

**Cuándo.** Devoluciones, descuentos, condonaciones, «¿cuánto le debo?», datos bancarios,
«¿ya se aprobó mi pago?».

> Los cobros, los descuentos y las devoluciones los decide {profesional} directamente, así
> que eso lo ves con {profesional}.
>
> Yo te ayudo con tus citas y con hacerle llegar tu comprobante.

**Después:** la gestión sigue abierta.
**Compone el servidor:** `{profesional}` = nombre de pila.

**Ojo:** este texto **no** se usa para «ya te mandé el comprobante, ¿ya quedó?». Ese caso
tiene datos y se contesta con el expediente: el comprobante está en revisión.

---

## 3 · `no_te_reconocemos`

**Cuándo.** El teléfono no tiene ninguna relación con ninguna profesional.

> Hola. Este número es el asistente de Agenda Psi, y desde aquí sólo puedo ayudar a
> pacientes que ya están con un psicólogo o psicóloga de la plataforma.
>
> Si estás buscando uno, aquí puedes ver quiénes están disponibles: https://agendapsi.mx

**Después:** la gestión cierra. No hay conversación que continuar.

---

## 4 · `elige_profesional`

**Cuándo.** El mismo teléfono está vinculado con dos o más profesionales. Hoy no pasa con
nadie en producción; el texto existe para el día que pase.

> Veo que estás con {lista}. ¿Con quién es lo que necesitas?

**Después:** la gestión sigue abierta.
**Compone el servidor:** `{lista}` = los nombres de pila unidos con «y» — «Araceli y
Miranda», «Araceli, Miranda y Ana».

---

## 5 · `dada_de_baja`

**Cuándo.** El teléfono sí está vinculado, pero la relación ya no está activa.

> Ahorita no tienes una relación activa con {profesional}, así que desde aquí no puedo
> ayudarte a mover ni a crear citas. Si quieres retomar, escríbele directamente.
>
> Y si estás buscando psicólogo o psicóloga, aquí puedes ver quiénes están disponibles:
> https://agendapsi.mx

**Después:** la gestión cierra.
**Compone el servidor:** `{profesional}` = nombre de pila.

---

## 6 · `sin_horarios`

**Cuándo.** La profesional no tiene ni un hueco en los próximos sesenta días —
normalmente porque todavía no ha guardado su horario.

**Sustituye a `agenda_cerrada`.** Con la decisión de dejar de consultar el interruptor de
«mis pacientes pueden agendar solas», ya no existe el caso de «no te deja agendar». Lo que
sí puede pasar es que no haya nada que ofrecer.

> Ahorita {profesional} no tiene horarios abiertos para las próximas semanas. Lo mejor es
> que le escribas directamente para que te dé un espacio.

**Después:** la gestión sigue abierta.
**Compone el servidor:** `{profesional}` = nombre de pila.

---

## 7 · Crisis

**Cuándo.** Señal de riesgo para ella o para alguien más. Va **sola y primero**: no se
mezcla con la gestión y no lleva la pregunta de cierre.

Este texto **no cambia** — es el que ya está aprobado y desplegado.

> Si necesitas ayuda inmediata: Agenda Psi no es un servicio de emergencias. Si tú o alguien
> más se encuentra en peligro, llama al 911. Para recibir apoyo en salud mental, comunícate
> gratis, las 24 horas, a Línea de la Vida: 800 911 2000.

**Después:** la gestión cierra.
**Vive literal en el prompt**, no en el servidor.

---

## 8 · `vas_muy_rapido`

**Cuándo.** Ella pasó alguno de los topes de tráfico. Lo manda el borde de entrada, antes
de que el agente arranque, y como mucho **uno cada quince minutos** por teléfono.

Es el único mensaje que sale cuando el agente no corre, así que tiene que invitar a
reintentar. Si dice «espera» sin decir qué hacer, ella se queda mirando la pantalla.

> Recibí varios mensajes seguidos y necesito un momento para ponerme al día. Espérame un
> minuto y escríbeme otra vez, por favor.

**Después:** no hay gestión. Es un mensaje suelto.

---

# Tres frases más que hay que aprobar

No son textos fijos —salen de una operación, no de un código— pero son las que más se van a
repetir y no deberían improvisarse.

## La reseña, antes de pedirla

Gael pidió que quede claro qué se publica de su nombre.

> Claro. Antes de que la escribas: de tu nombre sólo se muestran las iniciales, nunca
> completo. ¿Del uno al cinco, cómo calificarías tu experiencia con {profesional}?

Y al recibirla, el texto que ya está aprobado:

> Perfecto, muchas gracias por tu reseña.

## El comprobante que llega tarde

Cuando el prepago ya venció y la cita se canceló sola. Ningún camino del sistema reabre un
cobro cerrado, así que hay que decirlo sin rodeos y ofrecer la salida.

> Esa cita ya se canceló porque no alcanzó a llegar el comprobante. Mándale la foto
> directamente a {profesional} para que ella la revise, y si quieres te busco un horario
> nuevo ahora mismo.

**Ojo con el género:** «para que ella la revise» sólo sirve con profesionales mujeres. La
forma neutra: «para que la revise».

## La cita con dinero adentro que quiere cancelar

> Esa cita ya tiene tu pago, así que no la puedo cancelar desde aquí. Lo que sí puedo es
> moverla a otro día — tu pago se va con ella, y tu comprobante también.

Y cuando además tiene una próxima cita del mismo servicio:

> Esa cita ya tiene tu pago, así que no la puedo cancelar desde aquí. Puedo moverla a otro
> día, o pasar tu pago a tu cita del {día}. ¿Cuál prefieres?

---

# Lo que estos textos le exigen al sistema

1. **El nombre de pila de la profesional** tiene que venir en el expediente. Ya viene.
2. **`sin_horarios` necesita saber que no hay ni un hueco en el horizonte.** Sale de la
   misma consulta barata que pinta el calendario: si devuelve la lista vacía, es ese caso.
3. **`vas_muy_rapido` necesita un envío desde el borde** que hoy no existe: la admisión
   marca el rechazo y ahí se acaba, así que ella no recibe nada. Es un POST más, y va en la
   misma tanda.
4. **La frase de la reseña con iniciales** obliga a que el agente pregunte antes de
   registrar, no después. Va en el prompt como paso previo.
