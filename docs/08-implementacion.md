# 08 · La implementación

Corte: 2026-08-29.

Este archivo dice **qué hay que construir, en qué orden, y cómo se prueba antes de que lo toque
una paciente**. Cómo se comporta el agente está en `docs/01-conversaciones.md` y
`docs/02-funciones.md`; los textos, en `docs/06-textos.md`; el recorrido de un mensaje por dentro,
en `docs/07-portero.md`.

Los nombres de personas que aparecen aquí son **inventados y sirven de ejemplo**. Ningún dato de
producción se cita en este repositorio.

---

## 1. Lo que hay que construir, en una página

El modelo corre en nuestro código. Kapso queda como mensajería: guarda el número, guarda las
plantillas, entrega lo que llega y manda lo que le damos. No hay flujo de trabajo, no hay nodo de
agente, no hay funciones ni formularios de su lado.

De ahí salen cuatro frentes y ninguno depende de Kapso para existir.

| Frente | Qué se construye | Sin esto no arranca |
|---|---|---|
| La función de borde | Una sola, con el nombre `kapso_inbound_webhook`. Recibe, guarda, contesta 200, y sigue trabajando aparte: identidad, memoria, prompt, bucle del modelo, llamada a las funciones, envío de la respuesta | Nada |
| La base | **Las diez funciones de dominio**, una función propia de cancelar, el motor de horarios arreglado, la búsqueda con filtros y los avisos a la profesional | El modelo no tiene qué llamar |
| La memoria | La tabla `whatsapp_conversation_state`, una fila por teléfono. Se define en `docs/07-portero.md` §8.1 | Un «la 2» aterriza en la función equivocada |
| Los medios | Bajar la foto o el PDF del comprobante y guardarlo | `mandar_comprobante` no funciona aunque todo lo demás esté |

**Los dos frenos nuevos**, que sustituyen a todo el andamio que se borró:

- **Tres llamadas por mensaje.** No por gestión: por mensaje. Sin tope, un modelo confundido llama
  funciones en círculo y nadie lo detiene. Tres alcanzan porque lo más largo que ocurre dentro de
  un mismo mensaje son dos llamadas —la que escribe la lista y la que actúa sobre el número—, y
  queda una de margen. **Cuenta cada intento**, incluida la llamada que el borde rechaza por venir
  malformada: ése es justo el modo de fallo para el que el tope existe.
- **Un candado por conversación.** Si llegan dos mensajes del mismo teléfono al mismo tiempo, el
  segundo espera a que el primero termine. Es lo que más fácil se olvida y lo que produce citas
  duplicadas.

El orden de trabajo, en una línea: **se escriben las funciones de dominio y se prueban una por una
contra estados sembrados, después la función de borde, y hasta el final se toca el número real.**

---

## 2. El estado de la base hoy

Esto **ya se ejecutó**. No es plan, es de dónde se parte.

- **Borradas** las tablas `agent_sessions`, `agent_turns`, `agent_tool_calls`,
  `agent_option_tokens`, `agent_token_key_registry` y `agent_runtime_targets`.
- **Borradas** las trece funciones `agent_*` de `public` y de `private`.
- **Borradas** once columnas de maquinaria de `whatsapp_inbound_messages`. Se conservaron cinco
  que son datos del mensaje y no del andamio: `webhook_delivery_key`, `payload_sha256`,
  `reply_to_provider_message_id`, `target_phone_number_id` y `provider_received_at`.
- **Repuesto** el índice `ix_whatsapp_inbound_phone_received`, porque el anterior colgaba de una
  columna que se fue.
- **Queda** el rol `agenda_psi_agent_owner`, vacío. `postgres` no hereda sus privilegios y no puede
  retirarlo. No estorba y no se usa.
- **Intactos** los rieles compartidos `whatsapp_links`, `whatsapp_outbox` y `public.jobs`, las
  dieciocho funciones de la app y los siete trabajos programados.
- **Siguen desplegadas y rotas** las dos funciones de borde. `kapso_inbound_webhook` se reemplaza
  con el mismo nombre. `agent_tool_gateway` desaparece: en el diseño nuevo no hay intermediario.
- El respaldo de todo lo borrado está en `supabase/respaldo-agente-2026-08-28.sql`, en el
  repositorio de la app.

**Lo que no se toca, y por qué.** Nada de esta ronda propone borrar una tabla, una política, una
función de la app, un trigger, un trabajo programado ni un bucket. La cola de salida la escriben
las funciones de la app dentro de sus propias transacciones; el vínculo de WhatsApp lo inserta un
trigger al crear un paciente y editar su teléfono falla si no encuentra su renglón; los
comprobantes y su bucket nacieron antes que el agente; el Marketplace no se menciona en esta ronda
para nada. Y el proveedor de WhatsApp del inicio de sesión de la app **no es del agente**: es el
único modo de entrar, y no se toca por ninguna razón.

---

## 3. La función de borde

Se despliega con el nombre **`kapso_inbound_webhook`**. No es nostalgia: esa dirección ya está
configurada en el número de Kapso, y reusar el nombre hereda la configuración sin volver a tocarla.
Desplegar con otro nombre obliga a cambiar la dirección del webhook, que es justo lo que no
queremos mover.

### Lo que hace, paso a paso

1. **Recibe el POST y valida el sobre.** Método, tipo de contenido, cabeceras de control y la firma
   sobre los bytes crudos. Lo que no valida, se rechaza antes de tocar la base.
2. **Acepta lote, siempre.** El agrupamiento de Kapso está prendido con ventana de 5 segundos y
   lote máximo de 50. Con eso encendido **todas** las entregas llegan en formato de lote, aunque
   venga un solo mensaje. Suponer un mensaje suelto es el error clásico, y la versión desplegada
   hoy hace justo lo contrario: rechaza los lotes.
3. **Guarda cada mensaje del lote** en `whatsapp_inbound_messages`, con su `webhook_delivery_key` y
   su `message_sid`. **Recibido no es atendido**: la llave dice que llegó, y `respondido_at` dice
   que se contestó. Una entrega ya guardada **y respondida** se contesta 200 y no se ejecuta nada;
   una guardada **y sin responder** se atiende, porque si no, el mensaje que se cayó a media
   respuesta nunca recibe una.
4. **Contesta 200 de inmediato** y sigue trabajando en segundo plano. Si tardara en contestar,
   Kapso reintenta la entrega y la paciente recibe dos respuestas al mismo mensaje.
5. **Toma el candado de la conversación.** `pg_try_advisory_lock` sobre el hash del teléfono, en
   una conexión dedicada que se sostiene hasta el final del trabajo y se cierra en el `finally`.
   Nunca una conexión del pool compartido: un candado de sesión sobre una conexión prestada se
   queda pegado a otra conversación. Si no se consigue en 30 segundos, el mensaje queda guardado y
   sin contestar.
6. **Resuelve quién escribe, y no corta.** Teléfono contra los vínculos de WhatsApp. Sin vínculo,
   `estado: publica`. Dado de baja, `estado: inactiva`. En los dos casos **el borde escribe el
   estado en el sobre y corre el modelo igual**. El borde no contesta esos textos por su cuenta,
   nunca. La razón es una sola: la crisis se detecta leyendo el mensaje, y un «ya no aguanto» desde
   un teléfono que no conocemos es el caso que más importa de todos. El prompt manda `crisis`
   antes de mirar `estado`, y vale para cualquier estado. Los dos textos de identidad los manda el
   modelo y siguen costando cero llamadas a funciones.
   Cuando el teléfono tiene dos profesionales y ella acaba de contestar con cuál, el borde anota la
   elegida y **sigue en el mismo mensaje**: arma el sobre y corre el modelo con el lote completo.
   No la hace escribir otra vez.
7. **Lee la memoria** de ese teléfono: la profesional elegida, qué función preguntó, qué dato
   espera, qué opciones ofreció, la cita de la gestión en curso y el archivo del que se preguntó
   (§7).
8. **Arma el prompt** con cuatro cosas: el sobre de quién es, la memoria, **el último ida y vuelta**
   —lo que ella escribió y lo que se le contestó, leído de `whatsapp_inbound_messages`, y sólo si
   tiene menos de 24 horas— y el texto de los mensajes del lote juntos, en orden. Sin ese par
   anterior, un «con Ramiro» después de «hola, quiero mover mi cita» se contesta `no_entendi`.
   Cada renglón del lote lleva **su tipo cuando no es texto**: `[imagen]`, `[pdf]`, `[audio]`,
   `[video]`, `[sticker]`, `[ubicación]`, `[contacto]`, `[archivo]`, seguido del texto si lo trae.
   Sin esa marca, una foto sin texto llega como un renglón vacío y el flujo del comprobante no
   puede arrancar.
9. **Corre el bucle**, con el tope de tres llamadas. El modelo pide una función, la función de
   borde la llama directo en la base, el resultado vuelve al modelo. **Al agotarse el tope, el
   borde deja de despachar**: le devuelve al modelo un resultado vacío marcado como el último, y el
   modelo manda `se_acabo_el_espacio`. Si aun así el modelo escribe otra cosa, **el borde la
   sustituye** por ese texto. El modelo no redacta, ni cuando se queda sin llamadas.
10. **Si el mensaje trae imagen o PDF**, se pide una liga fresca con el identificador del archivo,
    se baja, y se guarda. No se usa la liga que viene en el webhook, porque no sabemos si caduca
    (§12). La función `mandar_comprobante` lo toma del renglón del mensaje, no de un parámetro.
11. **La memoria ya quedó guardada, antes de mandar nada.** La escribe la función dentro de su
    misma transacción, en el paso 9, no el borde aquí al final. Por eso la pregunta pendiente no
    depende de que el mensaje salga: si el envío falla, ella contesta «la 2» a una pregunta que el
    servidor sí recuerda.
12. **Manda el texto** por el relevo de Kapso, como texto libre dentro de la ventana abierta, no
    como plantilla. No pasa por la cola de salida: esa cola sólo produce plantillas y sólo la usan
    los trabajos programados. Si el envío falla después de haber mutado —la cita ya se movió y el
    aviso ya le llegó a la profesional— se reintenta **una vez, a los dos segundos**.
13. **Anota `respondido_at`, guarda lo que se contestó y suelta el candado.** El texto de entrada y
    el de salida quedan en `whatsapp_inbound_messages`, que ya se limpia sola a los 30 días.

Los modos de fallo de cada paso —el modelo que no contesta, la base que no contesta, el envío que
falla— están en `docs/07-portero.md` §10.

### Una llamada sin respuesta no significa que no se escribió nada

Significa que no se escribió **si la llamada no llegó a la base**. Si la transacción cerró y la
respuesta se perdió en el camino —tiempo de espera agotado, conexión caída—, la cita quedó creada,
movida o cancelada, y ella leería que no pasó nada.

Por eso, antes de mandar `se_acabo_el_espacio` por una llamada que escribe y volvió sin respuesta,
**el borde relee el estado** con la función de lectura que corresponda y contesta con lo que
encuentre. Sin ese paso, `agendar` acaba en dos citas: ella repite «sí», la función intenta el
mismo hueco y le contesta «se acaba de ocupar esa hora» —lo ocupó ella misma—, y escoge otra.

La regla general no cambia: **nada se da por escrito hasta que la base lo confirma**. Si el
servidor no sabe si la escritura ocurrió, la lee de vuelta y contesta con certeza.

---

## 4. El modelo y sus números

**`gpt-5.6-luna`**, llamado desde la función de borde. Kapso no interviene: ni cuenta tokens ni
pone margen.

| Número | Valor | Dónde vive |
|---|---|---|
| Vueltas máximas del ciclo del modelo | 16 | Variable de entorno de la función de borde |
| Tokens de salida | 2048 | Variable de entorno |
| Presupuesto total por mensaje | 60 segundos | Variable de entorno |
| Espera por llamada al modelo | 20 segundos | Variable de entorno |
| Reintento ante error de red o 5xx | Uno | Variable de entorno |
| Llamadas a funciones por mensaje | **Tres** | En el código, no configurable |

Las dieciséis vueltas son el techo técnico del ciclo. **El freno de producto es el tope de tres
llamadas**, que es más estricto y corta antes. Se separan a propósito: el primero evita un ciclo
infinito, el segundo evita que el agente trabaje de más sobre las citas de alguien.

Agotado el presupuesto de 60 segundos, el borde manda `se_acabo_el_espacio` —compuesto por él, no
por el modelo— y suelta el candado. Antes se prefería el silencio; el silencio deja la conversación
muda para siempre, porque el 200 ya salió y Kapso no reintenta.

La llave del proveedor va en el secreto de la función. Nunca en el repositorio.

---

## 5. Las diez funciones de dominio, en orden de dependencia

Las diez viven en la base y devuelven el texto ya redactado. La función de borde las llama directo,
con la llave de servicio: no hay intermediario y no hay rol intermedio que autorizar. El catálogo
completo, con parámetros y textos, está en `docs/02-funciones.md`.

| Orden | Pieza | Por qué va aquí |
|---|---|---|
| 1 | **Los ayudantes de lectura**: identidad por teléfono, la política de cada profesional, los servicios de esa paciente y su precio efectivo | Sin ellos ninguna función resuelve un plazo ni un precio, y todos los textos dirían el mismo número para todas |
| 2 | **El arreglo del motor de horarios** | Hoy toma los primeros seis del día en pasos de quince minutos: un día que abre a las 3:00 y cierra a las 7:00 contesta de 3:00 a 4:15 y las 5:00 no aparecen nunca. Hay que subir el tope, quitar los traslapes, respetar la franja que pidió y ofrecer **en punto** |
| 3 | **La búsqueda con filtros** | Recibe días, fechas, franja y fecha relativa, recorre los treinta días del horizonte por dentro, excluye la cita que se mueve, respeta la anticipación mínima de la ficha, y devuelve hasta cinco opciones o el motivo redactado con alternativas de verdad. Es una operación nueva |
| 4 | **Las tres que sólo leen**: `ver_servicios`, `buscar_horarios`, `mis_citas` | Se pueden probar completas sin escribir una fila, y son las que más pronto enseñan si los textos suenan bien |
| 5 | **Las que escriben sin dinero de por medio**: `agendar`, `confirmar`, `dejar_resena` | Dependen de la búsqueda y de la memoria |
| 6 | **Las cuatro difíciles**: `cancelar`, `reprogramar`, `mandar_comprobante` y `cambiar_modalidad` | Las tres primeras mueven dinero. `cambiar_modalidad` no lo toca nunca, pero es la única que el plazo bloquea. Son las que más ramas tienen y las que más caro cuesta equivocar: van al final, con todo lo anterior ya probado |
| 7 | **Los avisos a la profesional** | Van dentro de cada mutación, en la misma transacción. Si el aviso no se pudo escribir, la mutación no ocurrió |

**Ya no hay `pasar_pago`.** Pasar el pago a la próxima dejó de ser una función y es una salida de
las otras dos: `cancelar(pasa_el_pago: true)` y `reprogramar(a_la_proxima: true)`. La cita destino
la pone el servidor, que ya la sabe. Así el modelo no puede mover dinero por iniciativa propia
sobre una cita que él escogió: sólo puede aceptar una salida que la función ya ofreció.

**Siete detalles que la implementación no puede improvisar.**

- **`agendar` confirma antes de apartar.** Primero devuelve la pregunta con el día, la hora y la
  modalidad; hasta que ella dice que sí, se crea. Son dos llamadas, no una.
- **Al reservar se valida que el hueco siga libre**, en la llamada que escribe. Si se ocupó mientras
  conversaban, se dice y se ofrecen alternativas del mismo día, renumeradas, en esa misma respuesta.
  Así lo resolvía la web anterior y se conserva.
- **La llamada que escribe relee la cita de origen dentro de su misma transacción.** Reprogramar son
  tres llamadas en tres mensajes, y entre la primera y la última la profesional pudo cancelarla,
  moverla o cerrarla desde su app. Se comprueba el estado de la cita, no sólo el efecto de la
  escritura.
- **Las citas que crea la paciente nacen con `is_editable = false`.**
- **Una cita nace confirmada si cae dentro de la ventana del aviso automático**, que hoy es de 26
  horas. Es un solo número para todas las profesionales, y es **el mismo que ya usa el trabajo
  programado**, para que el agente y el aviso nunca se pisen. La base pone además su propio techo
  (§6). Con cobro por adelantado la cita nace sin confirmar **siempre**, sin importar cuánto falte:
  ahí lo que confirma es el comprobante.
- **El aviso de cambio y la anticipación mínima son dos cosas distintas, y las dos conviven.** El
  aviso de cambio decide **si hay cargo**. La anticipación mínima de la ficha decide **desde cuándo
  se puede tomar un horario**, y corta igual al agendar y al reprogramar. Mover se permite sin
  importar el aviso, pero el horario nuevo tiene que caber en la anticipación mínima. Los dos
  pueden salir en la misma gestión: primero se le avisa que se cobran las dos sesiones, y después la
  búsqueda sólo le ofrece días a partir del primero que la anticipación permite. **Se cuenta desde
  hoy**, no desde la fecha de la cita que se mueve. Pasar el pago a una ocurrencia que ya existe no
  la toca, porque ahí no se está tomando ningún horario. Cancelar no la toca nunca.
- **Cambiar la modalidad es lo único que el plazo sigue bloqueando**, porque la profesional necesita
  saber con tiempo si va al consultorio. Su filtro de candidatas baja a dos condiciones —viva y en
  el futuro, y servicio con dos modalidades—: el permiso y la anticipación **deciden el texto**, no
  filtran. Si filtraran, las dos negativas no podrían salir nunca y ella leería que no tiene ninguna
  cita a la que cambiarle la modalidad, cuando lo que pasó es que llegó tarde.

**Los servicios llegan hasta ocho.** Son la única excepción a las cinco opciones de cualquier
lista: el catálogo es corto, estable y no caduca como una lista de horas. El parámetro `servicio`
va tipado 1..8. Si alguna profesional tuviera más, se muestran ocho y se le pide que diga cuál
busca.

**Nada cancela citas solo.** No hay reloj que borre una cita de prepago por falta de comprobante, y
ningún texto anuncia que la cita se cancele sola. Lo que sí pasa, a la hora de la sesión, es que el
barrido de citas vencidas la pasa a «Revisar», como a cualquier cita que llegó a su hora: ahí la
profesional la cierra como asistida o como falta, y resuelve el cobro. **Desde ese momento deja de
aparecer en `mis_citas` y de ser candidata de `cancelar` y de `reprogramar`.** El comprobante sí se
le sigue pudiendo pegar, porque las candidatas de `mandar_comprobante` son cobros, no citas.

---

## 6. Qué hay que escribir en la base, y qué ya está

**Reprogramar se reusa.** `reschedule_appointment` ya hace el camino con tiempo mínimo: salda el
cobro viejo como pasado adelante —`waive_reason = 'carried_forward'`—, crea el nuevo y **copia el
comprobante**. No hay que escribir eso otra vez. Dos cosas sí hay que añadirle:

- **Sin tiempo mínimo el cobro viejo no se salda.** Se queda congelado tal como esté, con la
  decisión abierta para la profesional, y el cobro nuevo nace desde cero. Por eso se cobran dos
  sesiones y por eso se avisa antes de mover.
- **Cuando la cita nueva sigue siendo de prepago, hay que volver a sellar la petición de
  comprobante** sobre el cobro nuevo. El camino que ya existe sólo la conserva cuando ya había
  archivo pegado, que es justo el caso contrario al del prepago sin pagar. Sin ese sello, la
  profesional deja de ver «se pidió y no ha llegado», que es la señal entera del cobro por
  adelantado.

**Cancelar no se puede reusar.** `cancel_appointment` exige que quien la llama diga qué hacer con
el dinero —condonar, acreditar, pedir comprobante o retener— y sin eso no cancela. El agente no
puede tomar esa decisión: no es suya. Hace falta **una función propia** que cancele dejando la
decisión abierta, con `late_change_decision = 'pending'`.

**El vocabulario real de la base**, que es el que se escribe. No se inventan valores nuevos:

| Campo | Valores |
|---|---|
| `payment_status` | `not_applicable` · `pending` · `credited` · `waived` |
| `waive_reason` | `forgiven` · `carried_forward` |
| `late_change_decision` | `pending` · `charge` · `no_charge` |
| `change_policy_result` | `on_time` · `late` |
| `appointment_status` | `scheduled` · `past_pending` · `attended` · `no_show` · `cancelled` · `rescheduled` |
| `confirmation_source` | `patient_booking` · `patient_response` |

**El techo de 48 horas.** La base sólo deja nacer una cita ya confirmada por la paciente si empieza
dentro de las 48 horas siguientes a su creación, si viene de la paciente o de una serie, si no
viene de una reprogramación, y si su confirmación es del mismo instante que su creación. Nuestra
regla es de **26 horas**, así que cabe dentro y no hay que tocar la restricción. Una cita
confirmada exige además `is_editable = false`, que es lo que las citas de la paciente ya traen.

**Los avisos van dentro de la misma transacción que la mutación.** Y uno que se cuenta mal seguido:
`mandar_comprobante` sobre una cita de prepago **la confirma**, así que escribe **dos** avisos —el
del comprobante recibido y el de la cita confirmada—, no uno. Una mutación de cita sin su aviso no
existe.

---

## 7. La memoria

La tabla se llama **`whatsapp_conversation_state`** y se define en un solo sitio:
`docs/07-portero.md` §8.1. **Aquí no se vuelve a describir**: describirla en dos archivos es la
trampa del §9. Lo que le toca a este archivo es lo que hay que construir y quién la escribe.

**Lo que hay que crear**, porque hoy no existe:

- La tabla, con las ocho columnas de `docs/07-portero.md` §8.1.
- En `whatsapp_inbound_messages`, `respondido_at` —que separa recibido de atendido— y las dos
  columnas del texto: lo que ella escribió y lo que se le contestó. Hoy la tabla no guarda ni una
  palabra, y sin ellas no hay ida y vuelta anterior que mandar al modelo.

**La escribe la función, dentro de su misma transacción.** Es la única que conoce el mapa de los
números, porque acaba de componer la lista. El borde sólo escribe la fila de la profesional
elegida, y la limpia.

**El mapa de opciones no cruza al modelo.** El modelo ve números y prosa. La equivalencia se
resuelve del lado del servidor, contra la lista que el servidor mismo acaba de escribir.

Los siete valores de `espera` están en `docs/02-funciones.md` §2. No se repiten aquí, para que no
vuelvan a divergir: ya pasó una vez y quien copiara esta versión escribiría el enum incompleto.

**El texto de las conversaciones se guarda 30 días**, que es lo que ya hace sola
`whatsapp_inbound_messages`. Queda dicho a propósito: treinta días de conversaciones de terapia es
una postura, no un accidente de la tabla.

---

## 8. Kapso: qué se configura y qué no se toca

**Lo que ya quedó y no hay que volver a tocar:**

| Pieza | Estado |
|---|---|
| La dirección del webhook | Ya apunta a `kapso_inbound_webhook`. Por eso la función nueva se despliega con ese nombre |
| El agrupamiento de mensajes | Ya prendido: ventana de 5 segundos, lote máximo de 50. Cuesta cero y no se toca |
| El número y sus plantillas | Se quedan. Kapso es la mensajería |
| El relevo de envío | El mismo que ya usa el envío de plantillas |
| El flujo de trabajo, el nodo de agente, las funciones y los formularios | **Ya no existen.** No hay que crearlos ni rehacerlos. Ésa es la mitad del trabajo que este cambio se ahorra |

**Lo único que se revisa antes de encender:** que el secreto de firma del webhook sea el que la
función nueva espera, y que el agrupamiento siga prendido con esos dos números.

**Lo que nunca se toca:** el proveedor de WhatsApp del inicio de sesión de la app. No es de Kapso y
no es del agente. Es el único modo de entrar a la app, y apagarlo deja a todos fuera.

---

## 9. Las trampas que ya costaron caro

| Trampa | La regla que evita repetirla |
|---|---|
| **Kapso apaga el webhook solo y no lo vuelve a prender.** Si acumula 20 entregas, 10 fallidas y 85% de fallo en quince minutos, corta. Si nuestra función se cae un cuarto de hora, el número deja de recibir mensajes hasta que alguien entre al panel | Pide alerta y una persona que sepa dónde prenderlo. Y pide que la palanca de apagado conteste 200, no error (§11) |
| Contestar el webhook tarde | Kapso reintenta y la paciente recibe dos respuestas al mismo mensaje. Se contesta 200 de inmediato y se trabaja aparte. Siempre |
| Suponer que llega un mensaje suelto | Con el agrupamiento prendido, **todas** las entregas llegan en lote. La función desplegada hoy rechaza lotes: eso es exactamente lo que hay que cambiar |
| **Dejar que el borde conteste antes de correr el modelo** | La identidad se resuelve, se escribe en `estado`, y el modelo corre igual. Un borde que corta apaga la crisis justo para quien escribe sin ser paciente de nadie |
| **Leer «llamada sin texto» como «no se escribió nada»** | Sólo es verdad si la llamada no llegó a la base. Si volvió sin respuesta, se relee el estado antes de contestar |
| **Describir la tabla de memoria en dos archivos** | Ya pasó: dos nombres, dos juegos de columnas y dos vidas. Se define en `docs/07-portero.md` §8.1 y los demás la citan |
| Diagnosticar leyendo el repositorio | Ya pasó una vez: lo declarado en el repositorio no era lo que estaba corriendo. Se comprueba contra lo desplegado, siempre. El repositorio no es evidencia |
| Dar por muerta una pieza porque no tiene invocaciones | Cero invocaciones no la vuelve muerta: la vuelve **no ejercida**. Antes de retirar algo se lee su configuración, no su bitácora |
| Añadir una plantilla sin migrar el catálogo | Revienta la inserción y el aviso no sale |
| Tocar el proveedor de WhatsApp del inicio de sesión creyendo que es del agente | Es el único modo de entrar a la app |
| Escribir «24 horas» en un texto del aviso automático | La ventana real es de **26 horas**: es una constante del trabajo programado, no una política. Los textos a la profesional siguen diciendo 24, y esa diferencia se deja como está |
| Escribir «si no llega en 24 horas la cita se cancela» | Ese reloj ya no existe. Nada cancela citas solo |
| Escribir un plazo a mano en un texto que la paciente lee | Sale de la ficha de su profesional, siempre. Un texto con un número fijo adentro le miente a las pacientes de quien configuró otro |

---

## 10. El plan de pruebas

La regla que ordena todo esto: **cada pieza se prueba sembrando estados en la base y leyendo el
texto que devuelve, antes de desplegar nada y antes de tocar el número real.** Una función que
devuelve el texto correcto contra todos los estados sembrados es una función terminada. Lo que no
se puede probar así es sólo lo que depende de Kapso, y eso va al final.

### 10.1 Primero se siembran los estados

En una rama de la base, nunca en producción. Todo con nombres inventados: la profesional **Nadia
Robles**, que cobra por adelantado y tiene sus datos de transferencia llenos; la profesional
**Irene Sandoval**, que cobra después; las pacientes **Paula Ríos** y **Tomás Vela**. Son ejemplos.

| Estado sembrado | Para qué |
|---|---|
| Un teléfono sin ningún vínculo, y otro de alguien dado de baja | Los dos textos de identidad, **y que un mensaje de riesgo desde cualquiera de los dos reciba `crisis`** |
| Un teléfono con dos profesionales | Que se pregunte con cuál antes de nada, y que al contestar se siga en el mismo mensaje |
| Paciente con servicios asignados, y paciente sin ninguno | Que el segundo vea el catálogo completo de su profesional |
| Una profesional con seis servicios | Que se muestren los seis, sin recortar a cinco |
| Un servicio que admite las dos modalidades y otro que admite una | Que la modalidad se pregunte sólo cuando hay que preguntarla, y que pedir una que el servicio no admite se diga así |
| Un horario que abre a una hora rara, y otro con dos días de horas idénticas | Que las horas se ofrezcan en punto, y que dos días iguales se numeren una sola vez |
| Un día lleno y un día que no trabaja | Que cada motivo traiga alternativas de verdad, y que no se nombre a la profesional en el motivo |
| Una ficha con anticipación mínima larga y una cita para pasado mañana | Que mover se permita, y que la búsqueda sólo ofrezca días a partir del primero que la anticipación permite |
| Una cita futura sin pago, otra con comprobante pegado, otra ya acreditada | La matriz del dinero al cancelar y al reprogramar |
| Dos citas esperando confirmación | Que se pregunte cuál, y que «ambas» confirme las dos |
| Una serie con su próxima ocurrencia viva, y otra serie sin ninguna próxima | Las dos salidas de la cita con dinero adentro, y el texto de cuando no se pudo |
| Un cobro de una sesión pasada esperando comprobante, y dos cobros del mismo día | Que el comprobante se identifique por fecha, y que la hora sólo aparezca cuando hay dos |
| Un cobro vivo sobre una cita ya cancelada, y otro sobre una reprogramada | Que el comprobante de una cancelación tardía se pueda pegar |
| Una cita de prepago cuya hora ya pasó | Que salga de `mis_citas`, de `cancelar` y de `reprogramar`, y que su cobro siga aceptando comprobante |
| Una cita dentro de la ventana de 26 horas y otra fuera | Que la primera nazca confirmada y la segunda no |
| Una cita dentro del tiempo mínimo de su ficha | Que cancelar y reprogramar avisen del cargo y se hagan igual, y que cambiar la modalidad sí se niegue |

### 10.2 Después se prueba cada función, sola

Se llama la función con los parámetros que el modelo mandaría y **se lee el `texto`**. No se mira
la fila: se mira lo que la paciente recibiría. Es la prueba más barata y la que más defectos
atrapa, porque casi todo el producto vive en ese texto.

| Función | Estado | Lo que el texto tiene que decir |
|---|---|---|
| `ver_servicios` | Paciente sin servicios asignados | El catálogo de su profesional, con precio, y la pregunta de días y hora |
| `ver_servicios` | Pide por nombre uno que sí tiene | Ese servicio, no la lista entera con «dime cuál te interesa» |
| `buscar_horarios` | Día lleno | El motivo, con otros días de esas horas **o** ese día con otras horas. No una sola salida |
| `buscar_horarios` | Fecha más allá de los treinta días | Que hasta ahí no alcanza a ver, con salida |
| `agendar` | Primera llamada | La pregunta con día, hora y modalidad. **No se creó nada todavía** |
| `agendar` | Ella dice que no | Un texto que cierra sin apartar nada |
| `agendar` | Segunda llamada, hueco ya ocupado | Se dice, y se ofrecen alternativas del mismo día en la misma respuesta |
| `agendar` | Con quien cobra por adelantado | El cierre con banco, titular y CLABE. **Sin ninguna frase de 24 horas** |
| `confirmar` | Dos citas esperando | La lista numerada y la pregunta de cuál. Y «ambas» confirma las dos |
| `cancelar` | Cita con comprobante pegado, a tiempo, con próxima de su serie | Las dos salidas: reprogramar, o cancelar y dejar el pago en la próxima |
| `cancelar` | La misma cita, pero fuera del aviso | La salida de dejar el pago en la próxima **no se ofrece**, y se dice que el pago se queda en ésta |
| `cancelar` | Y ella dice que no a las dos | **Se cancela.** Y se le dice que su pago queda registrado y su profesional lo resuelve con ella |
| `cancelar(pasa_el_pago: true)` | Cita destino que ya trae su propio pago | No se pasa, y se le dice que su profesional lo acomoda. Con la destino limpia sí se pasa, **aunque el importe sea distinto** |
| `reprogramar` | Cita de una recurrencia | La segunda salida: pasarla a la próxima de su serie |
| `reprogramar(a_la_proxima: true)` | La misma serie, sin ningún pago adentro | **Cierra igual**, sin la frase del dinero. No una negativa |
| `reprogramar` | Prepago, fuera del aviso de cambio | El cierre con monto y datos de transferencia. El pago viejo no viaja y se dice |
| `reprogramar` | La cita de origen ya no existe | Que se dice, no que se mueve otra |
| `cambiar_modalidad` | Sin la anticipación que pide esa ficha | La negativa de anticipación, con el plazo **de esa** ficha. No «no tengo ninguna cita» |
| `mandar_comprobante` | Un solo cobro esperando, de quien cobra después | **Se pregunta igual** antes de pegarlo. El acuse dice «recibí tu comprobante», nunca «pagado». Recibir comprobantes vale para todas, cobren antes o después |
| `mandar_comprobante` | Cobro de una cita cancelada tarde | Entra en las candidatas. Es el único camino para cobrar una cancelación tardía |
| `mis_citas` | Cita en línea | La respuesta de dónde es, **sin la liga**. La liga sale en el aviso de una hora antes |

Y en todas: que el aviso a la profesional se haya escrito en la misma transacción, con las claves
que la app necesita, y que el del comprobante **no lleve el monto**.

### 10.3 Después la función de borde, sin Kapso

Se le manda un lote a mano, con el mismo formato y la misma firma que Kapso manda. Ocho asertos:

1. **Guarda y contesta 200 rápido.** Se mide el tiempo hasta el 200, no el tiempo total.
2. **La misma entrega, dos veces.** Si la primera ya se respondió, la segunda no ejecuta nada. Si la
   primera quedó guardada **sin responder**, la segunda sí la atiende. Las dos contestan 200.
3. **Un lote de cinco mensajes se lee como una sola intención**, no como cinco. Y un lote con una
   foto sin texto llega al modelo con su marca `[imagen]`.
4. **Dos entregas del mismo teléfono a la vez**: la segunda espera. No se crean dos citas.
5. **Un mensaje de riesgo desde un teléfono sin vínculo recibe `crisis`**, no el directorio. Es el
   aserto que prueba que el borde no corta antes del modelo.
6. **El tope de tres llamadas corta**, y lo que sale es `se_acabo_el_espacio`, no un silencio. Y una
   llamada malformada cuenta para el tope.
7. **Una llamada que escribe y no devuelve respuesta**: se mata la respuesta después del commit y se
   comprueba que el borde relee y contesta lo que de verdad pasó, no «se me acabó el espacio».
8. **El envío falla después de mutar**: se reintenta a los dos segundos, y la memoria ya quedó
   guardada antes de intentar mandar.

### 10.4 Hasta el final, el número real

Con todo lo anterior en verde. Es la única vía que ejerce lo que no podemos simular: el
agrupamiento de verdad, la firma de verdad, el archivo de verdad, y las tres preguntas que quedaron
sin comprobar (§12).

**Criterio de fracaso, no de éxito.** Si el agente dice una fecha que no salió de una etiqueta del
servidor, o dice un plazo que no salió de la ficha de esa profesional, o dice «pagado», o dice
«listo» de algo que no se escribió, o contesta el directorio a un mensaje de riesgo, el recorrido
no pasa aunque la base haya quedado bien.

---

## 11. Cómo se apaga si algo sale mal

**La palanca buena contesta 200.** Es la diferencia importante ahora que el modelo corre de este
lado: una palanca que devuelve error cuenta como entrega fallida, y las entregas fallidas apagan el
webhook del lado de Kapso, que **no se vuelve a prender solo**.

| # | Palanca | Qué hace | Costo |
|---|---|---|---|
| 1 | **El interruptor de la función de borde** | Una variable de entorno. Apagada, contesta 200 diciendo que está deshabilitada, no reintenta, no acumula fallos y no dispara el auto-apagado | Segundos, sin desplegar nada |
| 2 | **Volver a desplegar la versión anterior** | Como el nombre es el mismo, el despliegue reemplaza. No hay que tocar la dirección del webhook | Minutos |
| 3 | **Quitar el número de la lista de números permitidos** | Deja de admitirlo | **Es la peor.** Contesta error, y el error cuenta para el auto-apagado de Kapso |

Con la palanca 1 puesta, los mensajes de ese rato no se contestan. No hay cola que los guarde para
después, y así se acepta: es preferible el silencio a una respuesta equivocada sobre dinero.

**Lo que no se hace nunca:** quitar la dirección del webhook en Kapso, ni desconectar el número.
Recuperarlo es entrar al panel a mano, y mientras tanto no llega nada.

| Síntoma | Dónde se ve | Qué es |
|---|---|---|
| Deja de llegar todo, de golpe, sin que nadie despliegue | El panel de Kapso, el webhook en pausa | El auto-apagado. Se prende a mano |
| La paciente recibe dos respuestas al mismo mensaje | El tiempo hasta el 200 en la bitácora | Se está contestando tarde |
| Dos citas idénticas | Dos entregas del mismo teléfono muy juntas | El candado por conversación |
| Una conversación entera muda | El candado tomado y no soltado | La conexión del candado no se cerró en el `finally` |
| Ella escribió y nunca recibió nada | Un mensaje guardado sin `respondido_at` | El reintento se descartó como duplicado |
| El modelo dice que lo hizo y no hay fila | La bitácora: si no hubo llamada, fue decisión del modelo | El prompt. La regla de `hecho` es lo que lo previene |

---

## 12. Lo que quedó sin comprobar

Se dice con todas sus letras. No hay estimación de ninguno de estos tres puntos, y los tres se
resuelven mirando, no razonando.

1. **Si el webhook nos dice a qué mensaje respondió la paciente.** El formato de Kapso no lo
   documenta. El formato crudo de Meta sí lo trae, pero ése **no admite agrupamiento**, así que no
   se pueden tener las dos cosas. Hay que probarlo contra el número real.
2. **Si la liga de imagen que viene en el webhook caduca**, y si hace falta llave para bajarla. Por
   eso el diseño pide una liga fresca con el identificador del archivo: ése es el camino
   documentado y funciona en los dos casos.
3. **Cuánto cobra Kapso por los tokens de inteligencia y si le pone margen.** Está en el panel de
   facturación del proyecto, no en su página pública.

**Lo que estaba abierto y ya se cerró:** el texto de las conversaciones se guarda 30 días, y una
fila de memoria vale 24 horas.

**Una fecha que hay que apuntar: el 1 de octubre de 2026 Meta deja de dar gratis las respuestas
libres dentro de la ventana de 24 horas.** Cada respuesta del agente pasa a costar. No cambia el
diseño, cambia el costo de operarlo.
