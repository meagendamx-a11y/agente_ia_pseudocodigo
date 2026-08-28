# 08 · La implementación

Corte: 2026-08-28.

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
| La base | Las once funciones de dominio, el motor de horarios arreglado, la búsqueda con filtros y los avisos a la profesional | El modelo no tiene qué llamar |
| La memoria | Una tabla chica, una fila por teléfono | Un «la 2» aterriza en la función equivocada |
| Los medios | Bajar la foto o el PDF del comprobante y guardarlo | `mandar_comprobante` no funciona aunque todo lo demás esté |

**Los dos frenos nuevos**, que sustituyen a todo el andamio que se borró:

- **Tres llamadas por mensaje.** No por gestión: por mensaje. Sin tope, un modelo confundido llama
  funciones en círculo y nadie lo detiene. Tres alcanzan porque lo más largo que ocurre dentro de
  un mismo mensaje son dos llamadas —la que escribe la lista y la que actúa sobre el número—, y
  queda una de margen.
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
   su `message_sid`. Los dos tienen índice único: si la entrega ya se procesó, no se procesa otra
   vez y se contesta 200 igual.
4. **Contesta 200 de inmediato** y sigue trabajando en segundo plano. Si tardara en contestar,
   Kapso reintenta la entrega y la paciente recibe dos respuestas al mismo mensaje.
5. **Toma el candado de la conversación.** Un candado consultivo de Postgres con el teléfono como
   llave. Si otro mensaje del mismo teléfono está adentro, éste espera a que termine.
6. **Resuelve quién escribe.** Teléfono contra los vínculos de WhatsApp. Sin vínculo, se contesta
   `no_te_reconocemos` y ahí termina. Dado de baja, `paciente_inactivo` y ahí termina. Los dos
   textos viven en el prompt y no cuestan ninguna llamada.
7. **Lee la memoria** de ese teléfono: la profesional elegida, qué dato se está esperando, y qué
   opciones se ofrecieron (§5).
8. **Arma el prompt** con el sobre de quién es, la memoria, y el texto de los mensajes del lote
   juntos, en orden.
9. **Corre el bucle**, con el tope de tres llamadas. El modelo pide una función, la función de
   borde la llama directo en la base, el resultado vuelve al modelo. Al agotarse el tope, el modelo
   ya sólo redacta con lo que tiene.
10. **Si el mensaje trae imagen o PDF**, se pide una liga fresca con el identificador del archivo,
    se baja, y se guarda. No se usa la liga que viene en el webhook, porque no sabemos si caduca
    (§10). La función `mandar_comprobante` lo toma del renglón del mensaje, no de un parámetro.
11. **Manda el texto** por el relevo de Kapso, como texto libre dentro de la ventana abierta, no
    como plantilla. No pasa por la cola de salida: esa cola sólo produce plantillas y sólo la usan
    los trabajos programados.
12. **Guarda lo que se contestó, actualiza la memoria y suelta el candado.** El texto de entrada y
    el de salida quedan en `whatsapp_inbound_messages`, que ya se limpia sola a los 30 días.

Los modos de fallo de cada paso —el modelo que no contesta, la base que no contesta, el envío que
falla— están en `docs/07-portero.md`. Aquí sólo importa una regla: **nada se da por escrito hasta
que la base lo confirma**. Si el servidor no sabe si la escritura ocurrió, la lee de vuelta y
contesta con certeza.

---

## 4. Las funciones de dominio, en orden de dependencia

Las once viven en la base y devuelven el texto ya redactado. La función de borde las llama directo,
con la llave de servicio: no hay intermediario y no hay rol intermedio que autorizar. El
catálogo completo, con parámetros y textos, está en `docs/02-funciones.md`.

| Orden | Pieza | Por qué va aquí |
|---|---|---|
| 1 | **Los ayudantes de lectura**: identidad por teléfono, la política de cada profesional, los servicios de esa paciente y su precio efectivo | Sin ellos ninguna función resuelve un plazo ni un precio, y todos los textos dirían el mismo número para todas |
| 2 | **El arreglo del motor de horarios** | Hoy toma los primeros seis del día en pasos de quince minutos: un día que abre a las 3:00 y cierra a las 7:00 contesta de 3:00 a 4:15 y las 5:00 no aparecen nunca. Hay que subir el tope, quitar los traslapes, respetar la franja que pidió y ofrecer **en punto** |
| 3 | **La búsqueda con filtros** | Recibe días, fechas y franja, recorre los treinta días del horizonte por dentro, excluye la cita que se mueve, y devuelve hasta cinco opciones o el motivo redactado con alternativas de verdad. Es una operación nueva |
| 4 | **Las tres que sólo leen**: `ver_servicios`, `buscar_horarios`, `mis_citas` | Se pueden probar completas sin escribir una fila, y son las que más pronto enseñan si los textos suenan bien |
| 5 | **Las que escriben sin dinero de por medio**: `agendar`, `confirmar`, `dejar_resena` | Dependen de la búsqueda y de la memoria |
| 6 | **Las del dinero**: `cancelar`, `reprogramar`, `pasar_pago`, `mandar_comprobante`, `cambiar_modalidad` | Son las que más ramas tienen y las que más caro cuesta equivocar. Van al final, con todo lo anterior ya probado |
| 7 | **Los avisos a la profesional** | Van dentro de cada mutación, en la misma transacción. Si el aviso no se pudo escribir, la mutación no ocurrió |

**Cinco detalles que la implementación no puede improvisar.**

- **`agendar` confirma antes de apartar.** Primero devuelve la pregunta con el día, la hora y la
  modalidad; hasta que ella dice que sí, se crea. Son dos llamadas, no una.
- **Al reservar se valida que el hueco siga libre**, en la llamada que escribe. Si se ocupó mientras
  conversaban, se dice y se ofrecen alternativas del mismo día, renumeradas, en esa misma respuesta.
  Así lo resolvía la web anterior y se conserva.
- **Las citas que crea la paciente nacen con `is_editable = false`.**
- **Una cita nace confirmada si cae dentro de la ventana del aviso automático**, que hoy es de 26
  horas. Fuera de esa ventana nace sin confirmar y recibe la petición de confirmación cuando toque.
  Es un solo número para todas las profesionales, y es **el mismo que ya usa el trabajo
  programado**, para que el agente y el aviso nunca se pisen.
- **El tiempo mínimo ya no bloquea.** Cancelar y reprogramar se permiten siempre; el plazo sólo
  decide si hay cargo. La única excepción es **cambiar la modalidad**, que sí sigue bloqueada por
  el plazo, porque la profesional necesita saber con tiempo si va al consultorio.

**Nada cancela citas solo.** No hay reloj que borre una cita de prepago por falta de comprobante:
no hay que escribirlo, y ningún texto anuncia que la cita se cancele sola. La cita nace sin
confirmar y con el comprobante solicitado, para que la profesional vea que se pidió y no llegó.

---

## 5. La tabla de memoria

Lo que el agente necesita recordar **no son las palabras**: es qué preguntó, qué función lo
preguntó, y qué opciones numeradas ofreció. Con eso, un «la 2» nunca aterriza en la función
equivocada, porque no lo decide el modelo.

Una tabla nueva, lo más chica posible. Nombre propuesto: `agent_conversation_memory`.

| Columna | Qué guarda |
|---|---|
| `phone` | El teléfono. Llave primaria: **una sola fila por teléfono** |
| `professional_id` | La profesional de esta conversación, cuando hubo que preguntarla |
| `funcion` | Cuál función hizo la última pregunta |
| `espera` | El nombre exacto del dato que falta: `servicio`, `modalidad`, `filtros`, `opcion`, `cita`, `confirmado`, `estrellas` |
| `opciones` | Qué significa cada número de la última lista |
| `updated_at` | Cuándo se actualizó |

**Quién la escribe.** La fila la escribe la función que compuso la lista, en su misma transacción:
es la única que sabe qué significa cada número. La profesional elegida la escribe la función de
borde, porque esa pregunta se contesta sin llamar a nada.

**El mapa de opciones no cruza al modelo.** El modelo ve números del 1 al 5 y prosa. La equivalencia
se resuelve del lado del servidor, contra la lista que el servidor mismo acaba de escribir.

**Se sobrescribe, no se acumula.** No es un historial. Cuando llega un mensaje nuevo, lo que valía
antes ya no vale.

**Una decisión que falta.** Cuánto tiempo sigue valiendo una fila antes de considerarse de otra
conversación. No está decidido y no se estima aquí: hay que fijarlo antes de escribir la tabla.

**Y otra, aparte.** El texto de los mensajes sí se guarda, en `whatsapp_inbound_messages`, que ya
se limpia sola a los 30 días. Sin texto no hay manera de depurar las primeras semanas. Pero antes
de que entren pacientes de verdad hay que decidir cuántos días se guardan: treinta días de
conversaciones de terapia es una postura, y hoy la base no guarda ni una palabra.

---

## 6. Kapso: qué se configura y qué no se toca

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

## 7. Las trampas que ya costaron caro

| Trampa | La regla que evita repetirla |
|---|---|
| **Kapso apaga el webhook solo y no lo vuelve a prender.** Si acumula 20 entregas, 10 fallidas y 85% de fallo en quince minutos, corta. Si nuestra función se cae un cuarto de hora, el número deja de recibir mensajes hasta que alguien entre al panel | Pide alerta y una persona que sepa dónde prenderlo. Y pide que la palanca de apagado conteste 200, no error (§9) |
| Contestar el webhook tarde | Kapso reintenta y la paciente recibe dos respuestas al mismo mensaje. Se contesta 200 de inmediato y se trabaja aparte. Siempre |
| Suponer que llega un mensaje suelto | Con el agrupamiento prendido, **todas** las entregas llegan en lote. La función desplegada hoy rechaza lotes: eso es exactamente lo que hay que cambiar |
| Diagnosticar leyendo el repositorio | Ya pasó una vez: lo declarado en el repositorio no era lo que estaba corriendo. Se comprueba contra lo desplegado, siempre. El repositorio no es evidencia |
| Dar por muerta una pieza porque no tiene invocaciones | Cero invocaciones no la vuelve muerta: la vuelve **no ejercida**. Antes de retirar algo se lee su configuración, no su bitácora |
| Añadir una plantilla sin migrar el catálogo | Revienta la inserción y el aviso no sale |
| Tocar el proveedor de WhatsApp del inicio de sesión creyendo que es del agente | Es el único modo de entrar a la app |
| Escribir «24 horas» en un texto del aviso automático | La ventana real es de **26 horas**: es una constante del trabajo programado, no una política. Los textos a la profesional siguen diciendo 24, y esa diferencia se deja como está |
| Escribir «si no llega en 24 horas la cita se cancela» | Ese reloj ya no existe. Nada cancela citas solo |
| Escribir un plazo a mano en un texto que la paciente lee | Sale de la ficha de su profesional, siempre. Un texto con un número fijo adentro le miente a las pacientes de quien configuró otro |

---

## 8. El plan de pruebas

La regla que ordena todo esto: **cada pieza se prueba sembrando estados en la base y leyendo el
texto que devuelve, antes de desplegar nada y antes de tocar el número real.** Una función que
devuelve el texto correcto contra todos los estados sembrados es una función terminada. Lo que no
se puede probar así es sólo lo que depende de Kapso, y eso va al final.

### 8.1 Primero se siembran los estados

En una rama de la base, nunca en producción. Todo con nombres inventados: la profesional **Nadia
Robles**, que cobra por adelantado y tiene sus datos de transferencia llenos; la profesional
**Irene Sandoval**, que cobra después; las pacientes **Paula Ríos** y **Tomás Vela**. Son ejemplos.

| Estado sembrado | Para qué |
|---|---|
| Un teléfono sin ningún vínculo, y otro de alguien dado de baja | Los dos textos de identidad |
| Un teléfono con dos profesionales | Que se pregunte con cuál antes de nada |
| Paciente con servicios asignados, y paciente sin ninguno | Que el segundo vea el catálogo completo de su profesional |
| Un servicio que admite las dos modalidades y otro que admite una | Que la modalidad se pregunte sólo cuando hay que preguntarla |
| Un horario que abre a una hora rara, y otro con dos días de horas idénticas | Que las horas se ofrezcan en punto, y que dos días iguales se numeren una sola vez |
| Un día lleno y un día que no trabaja | Que cada motivo traiga alternativas de verdad, y que no se nombre a la profesional en el motivo |
| Una cita futura sin pago, otra con comprobante pegado, otra ya acreditada | La matriz del dinero al cancelar y al reprogramar |
| Dos citas esperando confirmación | Que se pregunte cuál, y que «ambas» confirme las dos |
| Una serie de recurrencia con su próxima ocurrencia | La salida de pasar la cita a la próxima de la serie |
| Un cobro de una sesión pasada esperando comprobante, y dos cobros del mismo día | Que el comprobante se identifique por fecha, y que la hora sólo aparezca cuando hay dos |
| Una cita dentro de la ventana de 26 horas y otra fuera | Que la primera nazca confirmada y la segunda no |
| Una cita dentro del tiempo mínimo de su ficha | Que cancelar y reprogramar se permitan igual y sólo cambie el cargo, y que cambiar la modalidad sí se niegue |

### 8.2 Después se prueba cada función, sola

Se llama la función con los parámetros que el modelo mandaría y **se lee el `texto`**. No se mira
la fila: se mira lo que la paciente recibiría. Es la prueba más barata y la que más defectos
atrapa, porque casi todo el producto vive en ese texto.

| Función | Estado | Lo que el texto tiene que decir |
|---|---|---|
| `ver_servicios` | Paciente sin servicios asignados | El catálogo de su profesional, con precio, y la pregunta de días y hora |
| `buscar_horarios` | Día lleno | El motivo, con otros días de esas horas **o** ese día con otras horas. No una sola salida |
| `agendar` | Primera llamada | La pregunta con día, hora y modalidad. **No se creó nada todavía** |
| `agendar` | Segunda llamada, hueco ya ocupado | Se dice, y se ofrecen alternativas del mismo día en la misma respuesta |
| `agendar` | Con quien cobra por adelantado | El cierre con banco, titular y CLABE. **Sin ninguna frase de 24 horas** |
| `confirmar` | Dos citas esperando | La lista numerada y la pregunta de cuál. Y «ambas» confirma las dos |
| `cancelar` | Cita con comprobante pegado | Las dos salidas: reprogramar, o cancelar y dejar el pago en la próxima |
| `cancelar` | Y ella dice que no a las dos | **Se cancela.** Y se le dice que su pago queda registrado y su profesional lo resuelve con ella |
| `reprogramar` | Cita de una recurrencia | La segunda salida: pasarla a la próxima de su serie. Si acepta, la vieja queda cancelada |
| `cambiar_modalidad` | Sin la anticipación que pide esa ficha | La negativa de anticipación, con el plazo **de esa** ficha |
| `pasar_pago` | Cita destino que ya trae su propio pago | No se pasa, y se le dice que su profesional lo acomoda. Con la destino limpia sí se pasa, **aunque el importe sea distinto** |
| `mandar_comprobante` | Un solo cobro esperando, de quien cobra después | **Se pregunta igual** antes de pegarlo. El acuse dice «recibí tu comprobante», nunca «pagado». Recibir comprobantes vale para todas, cobren antes o después |
| `mis_citas` | Cita en línea | La respuesta de dónde es, **sin la liga**. La liga sale en el aviso de una hora antes |

Y en todas: que el aviso a la profesional se haya escrito en la misma transacción, con las claves
que la app necesita, y que el del comprobante **no lleve el monto**.

### 8.3 Después la función de borde, sin Kapso

Se le manda un lote a mano, con el mismo formato y la misma firma que Kapso manda. Cinco asertos:

1. **Guarda y contesta 200 rápido.** Se mide el tiempo hasta el 200, no el tiempo total.
2. **La misma entrega dos veces no se procesa dos veces**, y las dos contestan 200.
3. **Un lote de cinco mensajes se lee como una sola intención**, no como cinco.
4. **Dos entregas del mismo teléfono a la vez**: la segunda espera. No se crean dos citas.
5. **El tope de tres llamadas corta**, y lo que sale es un texto, no un silencio.

### 8.4 Hasta el final, el número real

Con todo lo anterior en verde. Es la única vía que ejerce lo que no podemos simular: el
agrupamiento de verdad, la firma de verdad, el archivo de verdad, y las tres preguntas que quedaron
sin comprobar (§10).

**Criterio de fracaso, no de éxito.** Si el agente dice una fecha que no salió de una etiqueta del
servidor, o dice un plazo que no salió de la ficha de esa profesional, o dice «pagado», o dice
«listo» de algo que no se escribió, el recorrido no pasa aunque la base haya quedado bien.

---

## 9. Cómo se apaga si algo sale mal

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
| El modelo dice que lo hizo y no hay fila | La bitácora: si no hubo llamada, fue decisión del modelo | El prompt. La regla de `hecho` es lo que lo previene |

---

## 10. Lo que quedó sin comprobar

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

Y dos decisiones que están abiertas y hay que cerrar antes de que entren pacientes de verdad:
cuántos días se guarda el texto de las conversaciones (§5), y cuánto tiempo sigue valiendo una fila
de memoria.

**Una fecha que hay que apuntar: el 1 de octubre de 2026 Meta deja de dar gratis las respuestas
libres dentro de la ventana de 24 horas.** Cada respuesta del agente pasa a costar. No cambia el
diseño, cambia el costo de operarlo.
