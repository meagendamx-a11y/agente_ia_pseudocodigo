# 10 · Las reglas finales

Corte: 2026-08-26, 19:15 UTC. Proyecto auditado: Supabase `ssyzfeadyrczlzjbvxyl`
(«Agenda PSI V2»).

Éste es el documento que se lee para implementar. La evidencia de cada afirmación vive en los
cuatro frentes: `11-servicios.md`, `12-recurrencias.md`, `13-decision-tardia.md` y
`14-pasar-pago.md`. Aquí no se repite: se cita.

**Tres cosas que cambian respecto de todo lo escrito antes, y que mandan sobre ello:**

1. **El agente pasa a ser conversacional.** Agendar y reprogramar van por texto, no por
   formulario. Eso deroga la decisión 1 de `hallazgos-auditoria-agente.md` §9 y toda la
   superficie `flow_data_exchange` del portero.
2. **Al reprogramar tarde el dinero ya no viaja: se congela.** Eso deroga la decisión 3 de
   §9 y el Flujo 6 del guion, que decía «mover es gratis siempre y no se menciona ningún
   plazo».
3. **Pasar el pago a la próxima cita se construye.** Eso reabre el Flujo 11 del guion, que lo
   había dado por imposible.

**Nada de esto está desplegado.** En la base hay 13 funciones del agente y las 13 son de
plomería (admisión, portero, identificadores, cierre). **Cero operaciones de dominio.**
Verificado hoy sobre `pg_proc`.

---

## 1. Las reglas, una por una

### Servicios y precio

**R1 · Qué servicios se le ofrecen.** Cuando la paciente pregunta por servicios o va a agendar,
se le ofrecen **sus servicios asignados si tiene alguno, y el catálogo activo completo si no
tiene ninguno**. Nunca los dos. Se lee `patient_services` unida a `services`, y si esa rama no
da filas, `services` sola. Con `agent_list_services_from_workflow`, corregida según
`11-servicios.md` §6.2.

**R2 · Cuánto cuesta.** El precio que se dice es el **efectivo**, en tres escalones y en este
orden: si `services.is_free` es verdadero, cero; si hay fila en `patient_services` con
`preferential_price` no nulo, ese número; si no, `services.default_price`. Es la misma fórmula
que graba `create_appointment` en `agreed_price`. Nunca se dice «preferente» ni «descuento»: se
dice el número.

**R3 · Gratis se decide por el número, no por la bandera ni por el nombre.** «Es gratis» quiere
decir **precio efectivo igual a 0**. Un servicio llamado *Valoracion Sin Costo* que cuesta $800
se cobra $800 (existe en producción, es de Miranda). Un precio preferente de 0 vuelve gratis un
servicio de paga y la cita nace `not_applicable`.

**R4 · La rama del catálogo no filtra marketplace.** «Todos» quiere decir todos los activos del
profesional. Filtrarlos escondería un servicio de Araceli con 13 citas de 4 pacientes distintas.

**R5 · Dos servicios con el mismo nombre se separan con precio y modalidad.** Araceli tiene dos
*Psicoterapia individual* activos, de $800 y $900. La línea del mensaje lleva siempre precio y
modalidad; si además coinciden, la duración. **Nunca un número de orden.**

**R6 · `modality = 'both'` es una pregunta pendiente.** Se dice «en línea o presencial», y en
cuanto escoja ese servicio hay que preguntarle cuál. Sin esa respuesta `create_appointment`
contesta `MODALITY_REQUIRED`. Son 2 de los 4 servicios activos de Araceli.

### Recurrencia

**R7 · Las frecuencias son tres.** Cada semana, cada dos semanas y cada cuatro semanas. El enum
`recurrence_frequency` tiene exactamente esos tres valores y el paso en días es 7, 14 y 28. No
hay mensual.

**R8 · Antes de agendar un servicio con serie viva, se le dice el ritmo y su próxima cita.**
Cuatro piezas: cada cuánto, qué día de la semana, a qué hora y cuál es su próxima. **Las tres
primeras salen de `recurrence_series` (`frequency`, `weekday`, `start_time`); la cuarta se lee
de `appointments`.** Viaja como un solo campo de texto, `recurrencia`, compuesto por el
servidor y copiado por el modelo palabra por palabra; `null` cuando no hay serie. Va en la
salida de `agent_list_services_from_workflow`.

**R9 · La fecha de una serie nunca se calcula.** Se lee de `appointments`. Una serie puede tener
huecos (`created_partial`) y una ocurrencia puede haberse movido sin salir de la serie. Ninguna
función debe derivar `start_date + N × paso`.

**R10 · Si la próxima cita no cae en el día y la hora de la serie, el texto lo dice.** «Cada dos
semanas, los miércoles a las 4:00 de la tarde; **tu próxima quedó** el viernes 4 de septiembre a
las 6:00 de la tarde.» La comparación es entre el día y hora locales de la cita y `weekday` /
`start_time` de la fila madre.

**R11 · El agente no crea, no extiende, no cierra y no borra series.** Sólo las lee. Su permiso
sobre `recurrence_series` es `SELECT` y nada más.

### Qué citas se ven y cuáles se pueden tocar

**R12 · La lista de citas próximas se colapsa: la más próxima de cada serie, y todas las
sueltas.** Se escribe con `DISTINCT ON (COALESCE(series_id, id))`. El `COALESCE` es
indispensable: `DISTINCT ON (series_id)` a secas colapsaría todas las sueltas en una. Va en
`agent_list_upcoming_appointments_from_workflow`, **en el `count(*)` y en el ciclo**.

**R13 · Sólo se puede tocar lo que salió en esa lista.** Confirmar, cancelar, mover y cambiar
modalidad exigen el identificador opaco que emite esa lista. De cada serie sólo la más próxima
lo lleva. **Si la paciente pide mover la tercera sesión, se le dice que por aquí se mueve la más
próxima y que para las demás hable con su profesional.** No es silencio: es una frase.

**R14 · El colapso no se aplica a los cobros.** La lista de cobros pendientes sale de `payments`,
no de `appointments`, y no filtra por serie ni por estado de la cita. Una serie de doce debe doce
cobros y los doce se ven (paginados de cinco en cinco por canasta, con el total completo).

**R15 · Para agrupar por serie sólo vale `series_id`.** `origin = 'recurring_series'` miente: hay
una cita en producción con ese origen y `series_id` nulo, porque borrar una serie hace
`ON DELETE SET NULL`.

**R16 · «La próxima» quiere decir tres cosas distintas y no se confunden.** La más próxima de
cada grupo (lista de citas); la primera cita futura sin más (`get_next_appointment`); y la
primera futura **del mismo servicio** (destino de pasar el pago). Tres consultas, tres reglas.

### Dinero

**R17 · El plazo sale de la fila del profesional, nunca de una constante.** `on_time` cuando
`starts_at - now() >= free_change_notice_minutes`; si no, `late`. Hoy: Miranda 720 minutos, las
otras cuatro 1440. El texto dice las horas de esa fila, no «24».

**R18 · Una cita con dinero adentro no se cancela desde el agente.** «Dinero adentro» es
`status = 'credited'` **o** existe fila en `payment_proofs`. Una petición sellada sin archivo no
cuenta. El rechazo se llama `APPOINTMENT_HAS_MONEY` y **sólo muerde cuando el aviso llega a
tiempo**; tarde hay salida honesta y no hay por qué cerrarla. Se le ofrecen las dos salidas del
dueño: mover, o pasar el pago.

**R19 · Cancelar a tiempo sin dinero adentro condona el pendiente.** `status='waived'`,
`waive_reason='forgiven'`, `charge_reason` reclasificado a `'cancellation'`. No se abre ninguna
decisión y no se menciona cobro.

**R20 · Cancelar tarde congela el pago y abre la decisión.** El pago se queda exactamente como
estaba —estado, método, petición de comprobante y archivo intactos— y se le sellan **dos
columnas**: `charge_reason` (`session` → `cancellation`) y `late_change_decision = 'pending'`.
Nunca sobre un pago `not_applicable` ni `waived`.

**R21 · Reprogramar tarde congela igual, con `'reschedule'`.** Es la regla nueva: **el dinero ya
no viaja en el cambio tardío**. El pago viejo se queda sobre la cita `rescheduled` con la
decisión abierta, y la cita nueva nace con su propio pago `pending`. No hay función nueva que
inventar: es exactamente lo que hace el modo `'charge_old'` de `reschedule_appointment`, ya
desplegado.

**R22 · Reprogramar a tiempo sí mueve el dinero.** Modo `'carry'`: el pago viejo queda
`waived/carried_forward` con `charge_reason` en `'session'`, y el nuevo nace con el mismo
importe, estado y método. El comprobante **se mueve, no se copia**.

**R23 · La petición de comprobante viaja siempre.** Hoy se copia sólo cuando además hay archivo,
así que una petición sellada sin comprobante se pierde al mover y nadie vuelve a pedirlo. Se
quita ese `CASE`.

**R24 · Pasar el pago a la próxima cita: el destino lo resuelve el servidor.** Misma paciente,
mismo servicio, `scheduled`, `starts_at` posterior, la primera. La paciente **no escoge cuál**:
es la regla de `get_next_scheduled_appointment` y es literalmente «tu próxima sesión». Con
`agent_carry_payment_forward_from_workflow`, un solo identificador.

**R25 · El pago no se parte y no se acumula.** Si los importes no coinciden se rechaza con
`AMOUNT_MISMATCH` y se ofrece mover. No hay renglón de saldo en el esquema: entre las 38 tablas
de `public` no hay una sola columna de saldo.

**R26 · El pago de la cita destino se fusiona en su sitio, no se condona.** Conserva su `id` y su
`appointment_id` y adopta el estado del que viaja. Condonarlo diría «no se cobró» de un dinero
que sí se cobró, y `UNIQUE (appointment_id)` no deja insertar otro.

**R27 · El agente nunca dice «pagado» ni «aprobado».** Un comprobante recibido queda pendiente de
revisión. Acreditar, condonar y cobrar son de la profesional.

**R28 · El agente abre la decisión; nunca la cierra.** No se le conceden
`late_change_decision_resolved_at` ni `_resolved_by`. Resolver es un acto de la profesional en su
app.

### Lo que se le dice y lo que se le avisa

**R29 · El cierre se redacta desde los campos que devolvió el servidor.** No desde lo que el
modelo cree que pasó. Cada mutación devuelve el estado posterior en campos estructurados
(`applied`, `outcome`, `carried_state`, `change_policy_result`, `source`), y el mensaje se arma
con ellos. Es la mitigación medida contra el falso éxito, que es el 44-52% de todos los fallos.

**R30 · El aviso a la profesional lleva las cinco claves del contrato.** `patient_first_name`,
`appointment_starts_at`, `appointment_ends_at`, `appointment_modality` (literal `'online'` o
`'in_person'`) y `patient_last_name` opcional. Si falta una, la tarjeta cae en «Nueva
notificación · Hay una actualización reciente en tu cuenta». Las funciones escritas hoy mandan
`starts_at` y nunca el nombre: llegarían en blanco.

**R31 · Nada se encola en `whatsapp_outbox` cuando la paciente está en la conversación.** El
agente contesta en el mismo turno. Encolar la plantilla sería un eco frío.

---

## 2. La tabla de decisión del dinero

Cuatro tablas: cancelar y reprogramar, a tiempo y tarde, por cada uno de los cinco estados del
pago. Los cinco estados se distinguen así:

| # | Estado | `payments.status` | `proof_requested_at` | fila en `payment_proofs` |
|---|---|---|---|---|
| 1 | Sin costo | `not_applicable` | — | — |
| 2 | Pendiente desnudo | `pending` | NULL | no |
| 3 | Comprobante pedido | `pending` | NOT NULL | no |
| 4 | Comprobante recibido | `pending` | da igual | **sí** |
| 5 | Acreditado (prepago) | `credited` | da igual | da igual |

En producción hoy: 0 · 3 · 4 · **0** · 33, más 1 condonado. **La fila 4 nunca ha ocurrido**:
`payment_proofs` tiene cero filas en toda la historia.

En las cuatro tablas, la cita que se cierra sella siempre lo mismo:
`cancelled_rescheduled_at = now()`, `cancel_reschedule_actor = 'patient'`,
`change_policy_result`, `is_editable = false`, y **conserva hora y modalidad**. Sin
`cancelled_rescheduled_at` la profesional no ve con cuánta anticipación avisó la paciente, que
es el dato con el que decide.

### 2.1 Cancelar **a tiempo**

| Estado | El dinero | La cita | Qué puede hacer después la profesional | Qué se le dice a la paciente |
|---|---|---|---|---|
| **1 · Sin costo** | No se toca. Sigue `not_applicable` | `cancelled`, `on_time`, `confirmed_at` y `confirmation_source` a NULL juntos | Nada. Tarjeta `resolution_mode='free'`, sin badge y sin botones | «Listo, cancelé tu cita del {día} a las {hora}. {Profesional} ya recibió el aviso.» **No se menciona dinero** |
| **2 · Pendiente desnudo** | **Se condona:** `waived` + `forgiven` + `charge_reason='cancellation'` + `resolved_at` | `cancelled`, `on_time` | Nada. Badge «No cobrada», `action_mode='none'`. No aparece en Cobros: un `waived` queda fuera del filtro con cualquier motivo | Igual que arriba. **No se menciona cobro** |
| **3 · Comprobante pedido** | Se condona igual. `waive` **conserva** `proof_requested_at` como evidencia de que se pidió. El trigger `payments_apagar_cobro_au` dispara (`pending`→`waived`) y **cancela los avisos de comprobante que quedaban en cola** | `cancelled`, `on_time` | Nada | Igual, **más una línea**: ya no hace falta que mande el comprobante. Si no se dice, va a mandar una foto de algo que ya nadie espera (pregunta 7) |
| **4 · Comprobante recibido** | **No se cancela.** `APPOINTMENT_HAS_MONEY` | Sigue `scheduled`, intacta | Nada; no se entera | «Esa cita ya tiene tu pago, así que no la puedo cancelar desde aquí. Puedo moverla a otro día, o pasar tu pago a tu sesión del {fecha}.» Si no hay próxima del mismo servicio, sólo la primera salida |
| **5 · Acreditado** | **No se cancela.** `APPOINTMENT_HAS_MONEY` | Sigue `scheduled` | Nada | Igual que la fila 4 |

Sin el cerrojo, las filas 4 y 5 son fugas vivas hoy: la 4 cae en la rama de condonar y el
registro dice «no se cobró» un dinero que sí entró; la 5 **no cae en ninguna rama** y el pago se
queda `credited/session` colgando de una cita `cancelled`, invisible en Cobros para siempre.

### 2.2 Cancelar **tarde**

| Estado | El dinero | La cita | Qué puede hacer después la profesional | Qué se le dice a la paciente |
|---|---|---|---|---|
| **1 · Sin costo** | **No se abre decisión.** Sigue `not_applicable`. Abrirla mataría la tarjeta: `get_appointment_detail` la mandaría a «Revisar» sin botones, y las tres funciones que resuelven la rechazan | `cancelled`, `late` | Nada. Tarjeta `free` | Se cancela **sin mencionar cobro**: no hay nada que cobrar |
| **2 · Pendiente desnudo** | Se congela: `pending` intacto + `charge_reason='cancellation'` + `late_change_decision='pending'` | `cancelled`, `late` | Badge «Pendiente de decisión». **[Cobrar]** → Efectivo, Transferencia recibida, o Pedir comprobante. **[No cobrar]** → `waived/forgiven`. Mientras la decisión siga abierta **no aparece en Cobros** (`late_ok=false`): sólo se llega tocando la tarjeta del día | «Cancelé tu cita del {día} a las {hora}. Avisaste con menos de {N} horas, así que {profesional} va a decidir si te cobra esa sesión. Ella ya recibió el aviso.» **Sin prometer nada sobre el cobro** |
| **3 · Comprobante pedido** | Se congela conservando `proof_requested_at` y `method='transfer'`. El trigger **no** dispara porque `status` no cambia: los avisos de comprobante en cola **sobreviven**, que es lo que se quiere | `cancelled`, `late` | **[Cobrar]** → Transferencia recibida, o Volver a pedir comprobante (**el efectivo está bloqueado**: `INVALID_PAYMENT_ACTION`). **[No cobrar]** condona | Igual que la fila 2 |
| **4 · Comprobante recibido** | Se congela con el archivo intacto | `cancelled`, `late` | **[Cobrar]** → «Acreditar pago», transferencia forzada. **[No cobrar]** condona y **conserva el archivo**. Volver a pedir comprobante está bloqueado: `PROOF_ALREADY_ATTACHED` | Igual que la fila 2. **Nunca «pagado»** |
| **5 · Acreditado** | Se congela: sigue `credited`, importe y método sin tocar, + `charge_reason='cancellation'` + decisión abierta | `cancelled`, `late` | `resolve_late_prepaid`. **[Cobrar]** retiene el prepago (`charge_reason` a `cancellation`, decisión `charge`). **[No cobrar]** escribe `forgiven` — **la trampa**: el dinero entró de verdad y el registro dice que no se cobró, y no hay devolución en el producto | Igual que la fila 2 |

### 2.3 Reprogramar **a tiempo** — el dinero viaja

| Estado | El dinero | Las citas | Qué puede hacer después la profesional | Qué se le dice a la paciente |
|---|---|---|---|---|
| **1 · Sin costo** | Nada que mover. La cita nueva nace con su pago `not_applicable` | Vieja `rescheduled`, nueva `scheduled` conservando `series_id` y con `rescheduled_from_appointment_id` | Nada | «Listo, moví tu cita del {viejo} al {nuevo}. Sigue {modalidad}.» Sin mencionar dinero |
| **2 · Pendiente desnudo** | Viaja: viejo a `waived/carried_forward` con `charge_reason` en `'session'` (por eso `earns` es falso y la fila vieja no aparece en Cobros, que es lo correcto); nuevo `pending`, mismo importe | Igual | Nada. La tarjeta vieja muestra «Pago en la cita nueva» | «… y tu pago se fue con ella.» |
| **3 · Comprobante pedido** | Viaja, **y hoy la petición se pierde**: se copia sólo cuando además hay archivo. La cita nueva nace sin `proof_requested_at` y nadie vuelve a pedirlo (R23) | Igual | Nada, y ése es el problema: nadie le vuelve a pedir el comprobante | «… y tu pago se fue con ella», y hay que seguir pidiéndole el comprobante de la cita nueva |
| **4 · Comprobante recibido** | Viaja con el comprobante. **La fila se mueve, no se copia**: dos filas sobre la misma ruta de archivo son una bomba de limpieza | Igual | Revisar el comprobante sobre la cita nueva | «… y tu comprobante también.» Nunca «pagado» |
| **5 · Acreditado** | Viaja `credited`, con `resolved_at` en el pago nuevo | Igual | Nada. La tarjeta nueva dirá «Pagado» | «… y tu pago se fue con ella.» |

### 2.4 Reprogramar **tarde** — el dinero se congela

Es la regla nueva. **Lo importante de estas cinco filas: la paciente queda con dos cobros
vivos** —el congelado de la sesión que movió, que decide la profesional, y el de la sesión
nueva—. Eso es lo que el dueño pidió, y por eso el mensaje tiene que decirlo.

| Estado | El dinero | Las citas | Qué puede hacer después la profesional | Qué se le dice a la paciente |
|---|---|---|---|---|
| **1 · Sin costo** | **No se abre decisión.** El viejo sigue `not_applicable` y el nuevo nace `not_applicable` | Vieja `rescheduled` + `late`, nueva `scheduled` | Nada | Se mueve **sin mencionar cobro** |
| **2 · Pendiente desnudo** | Viejo **se queda `pending`** sobre la cita `rescheduled`, + `charge_reason='reschedule'` + decisión abierta. Nuevo pago propio, `pending`, `charge_reason='session'`, `charge_timing` de la política | Igual | Sobre el viejo: **[Cobrar]** Efectivo / Transferencia / Pedir comprobante, **[No cobrar]** condona | «Moví tu cita del {viejo} al {nuevo}. Avisaste con menos de {N} horas, así que {profesional} va a decidir si te cobra la sesión que moviste. **La sesión nueva se cobra aparte.**» |
| **3 · Comprobante pedido** | Igual, conservando `proof_requested_at` y `method` sobre el viejo. El nuevo nace limpio | Igual | Sobre el viejo: Transferencia o Volver a pedir; efectivo bloqueado | Igual que la fila 2 |
| **4 · Comprobante recibido** | Viejo `pending` **con su archivo** sobre la cita `rescheduled` + decisión abierta. **Es, columna por columna, el modo `defer` de `charge_old`, ya desplegado.** El nuevo nace `pending` | Igual | Sobre el viejo: **[Cobrar]** «Acreditar pago» o **[No cobrar]** condonar | Igual que la fila 2. **Y es la celda más dura del sistema:** ella ya entregó su dinero, ese dinero se queda en la cita que movió, y la sesión nueva se le vuelve a cobrar. Ver pregunta 2 |
| **5 · Acreditado** | Viejo sigue `credited` sobre la cita `rescheduled` + `charge_reason='reschedule'` + decisión abierta. El nuevo nace `pending` | Igual | Sobre el viejo: retener el prepago, o condonarlo como `forgiven` | Igual que la fila 2, con la misma dureza |

### 2.5 Pasar el pago a la próxima cita

Sólo se ofrece **a tiempo** (`LATE_CHANGE` si no), sólo cuando hay dinero adentro
(`NO_MONEY_TO_CARRY` si no), sólo cuando existe una próxima cita viva del mismo servicio
(`NO_TARGET` si no) y sólo cuando esa próxima no tiene dinero suyo ni decisión abierta
(`TARGET_HAS_MONEY`) y los importes coinciden (`AMOUNT_MISMATCH`).

| Qué pasa | Detalle |
|---|---|
| La cita vieja | `cancelled`, `on_time`, actor `patient`, conserva hora y modalidad |
| El pago viejo | `waived` + `carried_forward` + `charge_reason='cancellation'` + `resolved_at` |
| El comprobante | **cambia de dueño**: `DELETE` y luego `INSERT` sobre el pago destino. El `INSERT` es lo que dispara el degradado del aviso de prepago; un `UPDATE` no lo dispararía y a la paciente le llegaría una petición del dinero que acaba de mover |
| El pago destino | se **fusiona en su sitio**: conserva `id` y `appointment_id`, adopta estado, método, petición y momento de resolución |
| El rastro | dos asientos enlazados en `payment_events` con `event_type='carried_forward'` y las claves `carried_to_payment_id` / `carried_from_payment_id`, igual que el modo `'carry'` |
| A la profesional | aviso `appointment_cancelled_by_patient`. **Se entera de la cancelación, no del traslado** — el dato viaja en el `payload` esperando a que la app lo pinte |
| A la paciente, si viajó acreditado | «Listo, cancelé tu cita del {viejo} y tu pago quedó acreditado en tu sesión del {nuevo}. {Profesional} ya recibió el aviso.» |
| A la paciente, si viajó el comprobante | «Listo, cancelé tu cita del {viejo} y pasé tu comprobante a tu sesión del {nuevo}. {Profesional} lo va a revisar.» **Nunca «pagado» ni «aprobado»** |

---

## 3. Lo que hay que escribir, en orden de dependencia

### Permisos y pruebas (nada funciona antes de esto)

| # | Qué | Dónde | Estado |
|---|---|---|---|
| 1 | Sembrar una fila en `private.agent_token_key_registry` con `can_issue = true` y `verify_until` más allá de los 15 minutos del identificador | dato, no código | **Bloqueante de todo.** Hoy hay 0 filas y 0 identificadores emitidos en toda la historia |
| 2 | `GRANT SELECT ON public.patient_services TO agenda_psi_agent_owner` | `20260825000000:71` | escrito, sin aplicar |
| 3 | `GRANT SELECT ON public.recurrence_series TO agenda_psi_agent_owner` | ninguna migración | **no existe** |
| 4 | `GRANT DELETE ON public.payment_proofs TO agenda_psi_agent_owner` | ninguna migración | **no existe**; lo exige mover el comprobante |
| 5 | Soltar los tres asertos que prohíben leer `recurrence_series` e invertirlos a «lee pero no escribe», y corregir el comentario de migración que declara la renuncia | `tests/20260825000000` líneas 312 y 1185; `tests/20260825001000` línea 165; `migrations/20260825001000` líneas 26-29 | 4 lugares |

### Portero

| # | Qué | Dónde |
|---|---|---|
| 6 | Añadir `carry_payment_forward` a la lista de mutaciones de `agent_node` | `private.agent_claim_tool_call`, línea 210. Sube el catálogo de 26 a 27 |
| 7 | Añadir `create_appointment` a la misma lista | **sin esto no hay agendar por texto.** Hoy sólo existe como `flow_create_appointment` en `flow_data_exchange`, y ahí está bloqueada salvo dentro de la maniobra de saga. Ver pregunta 5 |

### Funciones de lectura

| # | Qué | Dónde |
|---|---|---|
| 8 | `agent_list_services_from_workflow`: partir el conteo en dos y llenar `v_total` según la rama; cambiar el `LEFT JOIN` por el `UNION ALL` con `NOT EXISTS`; quitar el `LIMIT 5` y la bandera `truncated`; declarar `v_assigned_count` y `v_source`; emitir `is_free` como `v_price = 0`; añadir `source` | `20260825001000:64`. **Los cinco cambios van juntos**: el tercero sin el primero deja a 13 de 17 pacientes con la lista vacía y `ok: true` |
| 9 | En la misma función, añadir el campo `recurrencia` por servicio, con el `CASE` de días y meses en español y la rama de «tu próxima quedó el…» | depende del renglón 3 |
| 10 | `agent_list_upcoming_appointments_from_workflow`: colapsar por `COALESCE(series_id, id)` **en el `count(*)` y en el ciclo** | `20260825001000:1011`. Si sólo se colapsa el ciclo, `truncated` miente |
| 11 | Dejar por escrito en un comentario que la lista de cobros **no** se colapsa | `20260825002000:105` |

### Mutaciones

| # | Qué | Dónde |
|---|---|---|
| 12 | `agent_cancel_appointment_from_workflow`: el cerrojo `APPOINTMENT_HAS_MONEY`, antes de la matriz económica y después de cargar el pago; sólo cuando `on_time` | `20260825003000`, ~línea 1129 |
| 13 | `agent_reschedule_appointment_from_workflow`: **reescribir la rama tardía**. Deja de arrastrar el dinero; congela el pago viejo sobre la cita `rescheduled` con `charge_reason='reschedule'` y `late_change_decision='pending'`, y crea la cita nueva con su propio pago | `20260825003000:1302`. Es copiar el par de columnas que su hermana de cancelar ya sella |
| 14 | En la misma función, rama a tiempo: que la petición de comprobante viaje siempre (quitar el `CASE WHEN v_old_has_proof`) y que el comprobante se **mueva** en vez de copiarse | dos ediciones chicas |
| 15 | `agent_carry_payment_forward_from_workflow`: **función nueva**. Un identificador, destino resuelto por el servidor, diez motivos de rechazo | `14-pasar-pago.md` §3.3 completa |
| 16 | Arreglar las claves del aviso a la profesional en **todas** las funciones escritas: hoy mandan `starts_at` y nunca el nombre, así que llegarían en blanco | las cinco mutaciones |

### Borde y copy

| # | Qué | Dónde |
|---|---|---|
| 17 | Encender `/tools/services` en el gateway | ya escrita en `handler.ts:459` + `index.ts:91`; falta desplegar |
| 18 | Añadir `/tools/payments/carry-forward` a `FUTURE_AGENT_ROUTES` (línea 13) y a `DOMAIN_ROUTES` (línea 456), con `parseCarryForwardInput` de un solo identificador | `agent_tool_gateway/handler.ts` |
| 19 | Texto de salida para «mueve la del 30»: por aquí sólo se mueve la más próxima de cada serie | copy |
| 20 | Texto de «avisaste tarde» para **reprogramar**, que hoy no existe porque mover era gratis, incluida la frase de que la sesión nueva se cobra aparte | copy |
| 21 | Texto de «ya no hace falta que mandes el comprobante» al cancelar a tiempo con petición sellada | copy |
| 22 | Un juego de datos sembrado en rama: dos series, una cita suelta del mismo servicio, un comprobante y un prepago | `supabase/tests/`. **Nada de esto se puede probar contra producción** |

---

## 4. Lo que choca, y el arreglo mínimo

| # | El choque | Arreglo mínimo |
|---|---|---|
| 1 | **El agente no puede leer `recurrence_series`**, y ahí viven tres de las cuatro cosas que el dueño quiere decir del ritmo. Además hay tres asertos de prueba y un comentario de migración que **prohíben ese permiso a propósito** | Un `GRANT SELECT` y cuatro ediciones en pruebas y comentarios. Invertir el aserto a «lee y no escribe», que es la garantía que importa |
| 2 | **`DELETE` sobre `payment_proofs` no está concedido**, y mover el comprobante lo necesita. La función abortaría **después** de cancelar la cita, y la transacción entera se iría atrás | `GRANT DELETE ON public.payment_proofs TO agenda_psi_agent_owner`. Es el único `DELETE` de toda la superficie del agente, y es seguro: borra la fila que acaba de leer y la vuelve a insertar en la misma transacción |
| 3 | **`amount` y `charge_timing` no están en el `GRANT UPDATE` de `payments`**, y la fusión del pago destino los escribe | **No escribirlos.** `AMOUNT_MISMATCH` ya obligó a que los importes sean iguales, y el `charge_timing` del destino es de la misma política y del mismo profesional. Se ahorra un permiso |
| 4 | **La tabla de llaves de emisión está vacía.** Sin una fila, cualquier operación que emita identificadores aborta antes de devolver nada | Sembrar una fila. No es de ningún frente y los bloquea a todos |
| 5 | **`create_appointment` no está en el catálogo del portero para `agent_node`.** Agendar por texto devuelve `TOOL_NOT_ALLOWED` siempre | Una línea en `agent_claim_tool_call`. Y con ella se puede retirar toda la superficie `flow_data_exchange` y la maniobra de saga |
| 6 | **Condonar un prepago escribe `forgiven`, no `carried_forward`.** El dinero entró de verdad y el registro dice que no se cobró | Ninguno barato: el valor está fijo en el código de `waive_appointment_payment`, sin parámetro, y la app es intocable. Es decisión de producto, no arreglo |
| 7 | **La paciente nunca sabe qué decidió la profesional.** De las tres funciones que resuelven, sólo pedir comprobante le manda algo. Cobrar en efectivo además apaga los avisos de comprobante que quedaban en cola; condonar es mudo | No es choque con la base: `whatsapp_outbox` está listo. Es decisión de producto. Ver pregunta 1 |
| 8 | **No existe un tipo de aviso «tienes una decisión de cobro pendiente».** `notifications.type` es texto libre, pero la app pinta en blanco lo que no conoce y es intocable | Aceptarlo y escribirlo: llega el aviso de la cancelación, y la decisión se encuentra tocando la tarjeta del día. No está en Cobros ni pone punto en el calendario |
| 9 | **El colapso por serie deja sin identificador a todas las ocurrencias menos la primera**, así que sólo ésa es tocable | Es coherente con la regla del dueño. Lo que falta es la frase de salida (renglón 19 del §3), no código |
| 10 | **Reprogramar tarde congelado deja a la paciente con dos cobros vivos** | Es la consecuencia directa de la regla nueva. El arreglo es de texto: decírselo en el mismo mensaje |
| 11 | **`free_change_notice_minutes` admite 0.** Si una profesional lo pone en cero, «sólo con tiempo mínimo» deja de significar algo y todo sale `on_time` | Hoy no pasa: 1440 en cuatro y 720 en una. Dejarlo |
| 12 | **Importes distintos entre la cita vieja y la destino no tienen salida.** El esquema no tiene renglón de saldo | Rechazar con `AMOUNT_MISMATCH` y ofrecer mover, que traslada el dinero completo sin tocar importes. En producción el caso no existe: las 16 combinaciones de paciente + servicio tienen un solo importe |
| 13 | **Nada de esto se puede probar contra producción.** Cero series, cero comprobantes, cero citas futuras vivas, cero identificadores emitidos, cero mutaciones del agente en toda la historia | Sembrar el juego de datos del renglón 22. Es el riesgo real de toda esta ronda y no se tapa con más lectura |

---

## 5. Las preguntas que quedan

**1 · Cuando la profesional decide, ¿se le avisa a la paciente? ¿En las cinco acciones o sólo
cuando hay que cobrarle?**
Hoy sólo «pedir comprobante» le manda algo. Los dos extremos duelen: cobrar en efectivo la deja
callada y sin saber cuánto ni cómo pagar, y condonar la deja creyendo que debe.
**Recomendación: avisar en dos casos —cobrar y condonar— y en ninguno más.** Cobrar, porque se
le anunció el cargo y necesita saber cuánto; condonar, porque es la buena noticia y callarla no
tiene defensa. Acreditar y retener no cambian nada para ella. Cuesta una plantilla nueva en Meta
y migrar `private.wa_payload_ok`; si eso no entra en la ronda, escribirlo como límite conocido.

**2 · Reprogramar tarde con el comprobante ya entregado: ¿de verdad se le vuelve a cobrar la
sesión nueva?**
Es la celda 2.4 · 4. Congelar significa que su dinero se queda en la cita que movió, a decisión
de la profesional, y la sesión nueva nace con su propio cobro pendiente.
**Recomendación: sí, congelar, y decírselo en el mismo mensaje.** Es la única forma que el
esquema admite de que un cambio tardío sea cobrable, y arrastrarlo es lo que hoy no tiene
resolución posible por ningún lado. Pero el mensaje **no puede omitirlo**: «la sesión nueva se
cobra aparte» va en el texto.

**3 · En la rama del catálogo, ¿entran los servicios de marketplace?**
Hay tres activos. El de Araceli tiene 13 citas con 4 pacientes distintas, y la única asignación
con precio preferente de `test test` está encima de uno de ellos.
**Recomendación: incluirlos**, que es lo que dice la regla del dueño. Excluirlos no deja a nadie
sin lista: la deja con **otra** lista, sin el servicio que sí le asignaron, y en silencio.

**4 · Pasar el pago: ¿la paciente elige a cuál cita va, o siempre a la más próxima del mismo
servicio?**
**Recomendación: siempre a la más próxima**, resuelta por el servidor. Es literal lo que dijo el
dueño («la próxima sesión»), quita cuatro motivos de rechazo, y es la única forma que funciona
con una serie viva, porque de una serie sólo la primera ocurrencia tiene identificador.

**5 · ¿Agendar por texto entra en esta ronda?**
Sin `create_appointment` en el portero, no hay agente conversacional: hay un agente que confirma,
cancela, mueve y contesta precios.
**Recomendación: sí, y en la misma migración que el resto.** Es una línea en el portero. Y con
ella se puede retirar la superficie `flow_data_exchange` entera, que es la que hoy obliga a la
maniobra de saga.

**6 · ¿Se retira `cancel_then_open_booking_flow` y toda la maquinaria de saga?**
No está implementada en ninguna parte: sólo existe el nombre en el catálogo del portero y en la
lista de rutas futuras. Con el cerrojo del dinero y la función de pasar el pago, no tiene para
qué nacer.
**Recomendación: retirarla**, junto con `saga_state`, el `mutation_limit` variable, la reserva
del ordinal 8 y el guardia `tool_call_count > 3`. Es la decisión que más código quita.

**7 · Al cancelar a tiempo una cita con el comprobante ya pedido, ¿se le dice que ya no lo
mande?**
El sistema apaga los avisos en cola, pero ella ya recibió la petición.
**Recomendación: sí, una línea.** Si no, manda una foto que va a caer en un cobro que ya no
existe, y el agente va a tener que explicárselo después.

**8 · `amount` en el `GRANT UPDATE` de `payments`: ¿se abre o no?**
**Recomendación: no abrirlo.** Ninguna otra operación del agente cambia el importe de un cobro, y
la única que lo necesitaría copia un número que ya es idéntico. Es un cerrojo gratis.

**9 · ¿Se siembra el juego de datos de prueba antes de escribir, o se escribe a ciegas?**
Cero series, cero comprobantes, cero citas futuras vivas. Las ramas de recurrencia, de
comprobante recibido y de traslado se escribirían sin un solo dato que las ejercite.
**Recomendación: sembrar primero, en una rama de Supabase, con la receta de `12-recurrencias.md`
§4.1.** Es medio día y es lo único que separa este diseño de una hipótesis.

**10 · La app de la profesional sigue intocable. ¿Hasta cuándo?**
El agente va a empezar a producir decisiones tardías y **va a producirlas todas**. Hoy no
aparecen en Cobros, no ponen punto en el calendario y el aviso se borra solo a las 24 horas: la
única forma de encontrarlas es tocar la tarjeta del día.
**Recomendación: aceptarlo esta ronda y ponerlo primero en la lista de la siguiente.** No es un
problema mientras nadie produzca esas decisiones; deja de serlo el día que se despliegue esto.
