# 03 · El dinero y las políticas

Corte: 2026-08-26. Base auditada: Supabase `ssyzfeadyrczlzjbvxyl` («Agenda PSI V2»), sólo
lectura. Cada afirmación de este documento se comprobó contra el esquema desplegado, contra
el cuerpo de las funciones vivas o contra las filas reales de producción.

**Este archivo reemplaza por completo al anterior.** El anterior describía el dinero de un
agente que agendaba y reprogramaba por formulario de WhatsApp, y que daba el cambio tardío
por imposible. Las dos cosas cambiaron.

**Manda sobre este documento** `docs/anterior/01-decisiones-del-ensayo.md`. Lo verificado
vive en `docs/reglas/10-reglas-finales.md`, `13-decision-tardia.md` y `14-pasar-pago.md`, y
aquí se reusa sin repetir la evidencia línea por línea.

**Tres cosas de `10-reglas-finales.md` quedaron desfasadas y aquí se corrigen**, porque el
repositorio se movió después de que se escribieron:

1. **R21 dice que congelar «es exactamente lo que hace el modo `charge_old`».** No lo es: ese
   modo nunca escribe `late_change_decision`, que es la única columna que el agente añade. §1.7.
2. **§3 renglón 4 y §4 choque 2 dan por inexistente el `GRANT DELETE ON payment_proofs`.** Ya
   está escrito en la migración de fundamento. §4.6.
3. **§3 renglón 12 pone el cerrojo «~línea 1129».** Ahí la cita ya está cancelada. §2.1.

---

## Lo que cambió respecto de todo lo escrito antes

| # | Antes | Ahora |
|---|---|---|
| 1 | Los cambios tardíos se bloqueaban o se ignoraban | **Se permiten los dos** —cancelar y reprogramar—. Se avisa antes y se pregunta |
| 2 | Reprogramar tarde arrastraba el dinero a la cita nueva | **Reprogramar tarde congela el dinero** en la cita vieja y abre la decisión de cobro. La cita nueva va aparte, con su propio pago |
| 3 | Reprogramar no mencionaba dinero nunca | **Reprogramar a tiempo sí mueve el dinero**, comprobante incluido, y se le dice |
| 4 | Pasar el pago a la próxima cita se dio por imposible | **Se construye.** Se ofrece junto con reprogramar, cuando la cita tiene una próxima del mismo servicio |
| 5 | «{Profesional} va a decidir si te cobra» | **A la paciente no se le dice que la profesional decide. Se le dice que se cobra** |
| 6 | El agente pedía comprobante siempre | **Cobrar desde el agente sólo aplica con cobro por adelantado.** Si cobra después, el agente no menciona pago al agendar |

---

## 0. Las reglas del dinero, en una página

**R-A · «Hay dinero adentro» tiene una definición exacta y una sola:**

```sql
p.status = 'credited'
OR EXISTS (SELECT 1 FROM public.payment_proofs pp WHERE pp.payment_id = p.id)
```

Una petición de comprobante sellada **sin archivo no es dinero**. Esta definición se usa en
el cerrojo de cancelar y en pasar el pago, y tiene que ser la misma en las dos: si difieren,
aparece una cita que no se puede cancelar y tampoco se puede pasar, o sea un callejón.

**R-B · Los cinco estados en que el agente puede encontrar un pago:**

| # | Nombre corto | `payments.status` | `proof_requested_at` | fila en `payment_proofs` | En producción hoy |
|---|---|---|---|---|---|
| 1 | Sin costo | `not_applicable` | — | — | **0** |
| 2 | Pendiente desnudo | `pending` | NULL | no | **3** |
| 3 | Comprobante pedido | `pending` | NOT NULL | no | **4** |
| 4 | Comprobante recibido | `pending` | da igual | **sí** | **0** |
| 5 | Acreditado | `credited` | da igual | da igual | **33** |

Más 1 condonado. Total 41 pagos. **`public.payment_proofs` tiene cero filas en toda la
historia**: la fila 4 nunca ha ocurrido y no se puede probar contra producción.

**R-C · A tiempo o tarde sale de la fila de la profesional, nunca de una constante:**

```sql
v_policy_result := CASE
  WHEN v_appointment.starts_at - v_now
       >= pg_catalog.make_interval(mins => v_policy.free_change_notice_minutes)
  THEN 'on_time' ELSE 'late' END;
```

**R-D · El agente nunca dice «pagado» ni «aprobado».** Dice «recibí tu comprobante». Un
comprobante recibido queda pendiente de revisión, y revisarlo es de la profesional.

**R-E · A la paciente no se le dice que la profesional decide. Se le dice que se cobra.**
Que la profesional después condone es asunto interno suyo. La consecuencia hay que aceptarla
de frente: **si condona, la paciente recibe una sorpresa buena**; si el agente hubiera dicho
«va a decidir», la paciente se queda con una duda abierta que nadie le va a cerrar, porque
hoy **ninguna de las tres funciones que resuelven le avisa a la paciente salvo «pedir
comprobante»** (`13-decision-tardia.md` §5.5).

**R-F · Cobrar desde el agente sólo aplica con `charge_timing = 'before'`.** Con `'after'`
el agente no pide comprobante, no menciona pago al agendar y no da datos bancarios.

**R-G · El agente abre la decisión de cobro; nunca la cierra.** No se le conceden
`late_change_decision_resolved_at` ni `_resolved_by`.

**R-H · `charge_reason` se reclasifica siempre que la cita se cierra.** `session` →
`cancellation` o `reschedule`. **Es la columna que no se puede olvidar:** sin ella la fila
desaparece de la facturación aunque la profesional cobre. La razón, medida, está en §1.9.

**R-I · Nada se encola en `whatsapp_outbox` mientras la paciente está en la conversación.**
El agente contesta en el mismo turno. Ver §7.

---

## 1. La matriz definitiva

Se lee así: **acción × plazo × estado del pago**. En cada celda, lo mismo en el mismo orden:
qué pasa con el dinero, qué pasa con la cita, qué función lo hace, qué puede hacer después la
profesional, y qué se le dice a la paciente.

**Lo que toda cita que se cierra sella siempre**, sea cancelada o reprogramada, a tiempo o
tarde:

```sql
cancelled_rescheduled_at = now(),
cancel_reschedule_actor  = 'patient',
change_policy_result     = 'on_time' | 'late',
is_editable              = false
-- starts_at y modality NO se tocan: la tarjeta cerrada conserva hora y modalidad
```

`cancelled_rescheduled_at` es obligatorio: sin él, `get_appointment_detail` no puede calcular
«avisó con tanto tiempo», que es el dato con el que la profesional decide.

### 1.1 Agendar

Una sola variable manda: cómo cobra esa profesional.

| `charge_timing` | El dinero | La cita | Función | Después, la profesional | Qué se le dice |
|---|---|---|---|---|---|
| **`after`** (cobra después) | Nace `pending`, `charge_reason='session'`, sin petición de comprobante | `scheduled`. Nace confirmada si empieza dentro de 48 h; si no, la confirma el aviso de 26 h | `agent_create_appointment_from_workflow` | Nada. Cobra al cerrar la sesión, como siempre | Se cierra sin mencionar dinero. «Listo, {nombre}. Aparté tu {servicio} del {día} a las {hora}, {modalidad}, con {profesional}.» |
| **`before`** (cobra por adelantado) | Nace `pending` **con `proof_requested_at = now()` y `method='transfer'`**. Es la petición sellada que arranca el reloj de 24 h | `scheduled` y **nunca confirmada**: `confirmed_at` y `confirmation_source` en NULL, `is_editable = true`. Ver §3 | la misma | Nada hasta que llegue el comprobante | Se le dan los datos de la transferencia y se le pide el comprobante, **con la consecuencia dicha desde el principio** |
| **Precio efectivo 0** | Nace `not_applicable`, importe 0 | igual que `after` | la misma | Nada | No se menciona dinero, aunque cobre por adelantado |

El precio efectivo es el de siempre, en tres escalones: `services.is_free` → 0; si no,
`patient_services.preferential_price`; si no, `services.default_price`. El modelo nunca manda
importes.

El texto de prepago, aprobado:

> Listo, Emilio. Aparté tu Psicoterapia individual del miércoles 2 de septiembre a las 12:00,
> presencial, con Araceli. Son $800.
>
> Para confirmarla, transfiere a BBVA, a nombre de Araceli Méndez, CLABE 012180001234567890,
> y mándame el comprobante por aquí. Si no llega en 24 horas, la cita se cancela y se libera
> el horario.

Y si la profesional no llenó sus datos de pago:

> Para confirmarla necesito tu comprobante de pago. Pídele a Araceli los datos para la
> transferencia y mándame el comprobante por aquí. Si no llega en 24 horas, la cita se cancela.

### 1.2 Confirmar

| Caso | El dinero | La cita | Función | Qué se le dice |
|---|---|---|---|---|
| Cobra después | No se toca | `confirmed_at = now()`, `confirmation_source='patient_response'`, `is_editable=false` | `agent_confirm_appointment_from_workflow` | «Listo, tu cita del {día} a las {hora} quedó confirmada.» |
| Cobra por adelantado | No se toca | **No se confirma** | ninguna: el agente contesta pidiendo el comprobante | Decir «sí voy» **no confirma**. Se le piden los datos y el comprobante. Lo que confirma es el archivo |

### 1.3 Mandar el comprobante

| Qué pasa | Detalle |
|---|---|
| El dinero | **No cambia de estado.** Sigue `pending`. Entra una fila en `payment_proofs`, y eso es todo. «Comprobante recibido» ≠ «pagado» |
| La cita | Si sigue viva y en el futuro, **queda confirmada**: `confirmed_at=now()`, `confirmation_source='patient_response'`, `is_editable=false`. Ver §3.3 |
| Función | `agent_attach_payment_proof_from_workflow` |
| Requisitos | El cobro está `pending`, ya se le pidió el comprobante (`proof_requested_at` no nulo) y no hay archivo. Si nadie lo pidió: `PROOF_NOT_REQUESTED`. Si ya hay uno: `PROOF_ALREADY_ATTACHED`, y no hay forma de reemplazarlo |
| Después, la profesional | Lo revisa: **acreditar** o **condonar**. La base admite **un solo comprobante por cobro, para siempre** (`payment_proofs_payment_id_key UNIQUE (payment_id)`) |
| Qué se le dice | «Listo, recibí tu comprobante. Tu cita del miércoles 2 a las 12:00 ya quedó confirmada.» |

**Siempre se confirma a qué cita pertenece antes de pegarlo**, aunque haya una sola pendiente.
Una foto equivocada queda pegada para siempre.

### 1.4 Cancelar **a tiempo**

| Estado del pago | El dinero | La cita | Función | Después, la profesional | Qué se le dice a la paciente |
|---|---|---|---|---|---|
| **1 · Sin costo** | No se toca. Sigue `not_applicable` | `cancelled`, `on_time`. `confirmed_at` y `confirmation_source` a NULL **juntos** | `agent_cancel_appointment_from_workflow` | Nada. Tarjeta `resolution_mode='free'`, sin badge y sin botones | «Listo, cancelé tu cita del {día} a las {hora}. No te queda ningún cobro pendiente por ella.» |
| **2 · Pendiente desnudo** | **Se condona:** `status='waived'`, `waive_reason='forgiven'`, `charge_reason='cancellation'`, `resolved_at=now()` | `cancelled`, `on_time` | la misma | Nada. Badge «No cobrada», `action_mode='none'`. No aparece en Cobros | Igual. **No se menciona cobro** |
| **3 · Comprobante pedido** | Se condona igual. El `waive` **conserva** `proof_requested_at` como evidencia. El trigger `payments_apagar_cobro_au` dispara (`pending`→`waived`) y **cancela los avisos de comprobante que quedaban en cola** | `cancelled`, `on_time` | la misma | Nada | Igual, **más una línea**: «Y ya no hace falta que me mandes el comprobante.» Sin eso manda una foto que caerá en un cobro que ya no existe |
| **4 · Comprobante recibido** | **No se cancela.** `APPOINTMENT_HAS_MONEY` | Sigue `scheduled`, intacta | el cerrojo de §2 | Nada; no se entera | Las dos salidas del §2.3 |
| **5 · Acreditado** | **No se cancela.** `APPOINTMENT_HAS_MONEY` | Sigue `scheduled` | el cerrojo de §2 | Nada | Igual que la fila 4 |

### 1.5 Cancelar **tarde**

**Se avisa antes de tocar nada**, y se pregunta:

> Te la cancelo, pero antes te aviso: Araceli pide 24 horas de aviso y ya faltan menos, así
> que la sesión se te cobra. ¿La cancelo de todos modos?

Y al confirmar ella: «Listo, cancelé tu cita del miércoles 2 a las 12:00.»

**El aviso sólo se da cuando hay algo que cobrar.** Con precio efectivo 0 se cancela sin
mencionar dinero: decirle «se te cobra» de una sesión de $0 es mentirle.

| Estado del pago | El dinero | La cita | Función | Después, la profesional | Qué se le dice a la paciente |
|---|---|---|---|---|---|
| **1 · Sin costo** | **No se abre decisión.** Sigue `not_applicable`. Abrirla mataría la tarjeta: caería en «Revisar» sin botones y las tres funciones que resuelven la rechazan | `cancelled`, `late` | `agent_cancel_appointment_from_workflow` | Nada. Tarjeta `free` | Se cancela **sin mencionar cobro** |
| **2 · Pendiente desnudo** | **Se congela:** `pending` intacto + `charge_reason='cancellation'` + `late_change_decision='pending'` | `cancelled`, `late` | la misma | Badge «Pendiente de decisión». **[Cobrar]** → Efectivo, Transferencia recibida, o Pedir comprobante. **[No cobrar]** → `waived/forgiven` | El aviso de arriba, y el cierre seco |
| **3 · Comprobante pedido** | Se congela conservando `proof_requested_at` y `method='transfer'`. El trigger **no** dispara porque `status` no cambia: **los avisos de comprobante en cola sobreviven**, que es lo que se quiere | `cancelled`, `late` | la misma | **[Cobrar]** → Transferencia recibida, o Volver a pedir comprobante. **El efectivo está bloqueado** (`INVALID_PAYMENT_ACTION`). **[No cobrar]** condona | Igual que la fila 2 |
| **4 · Comprobante recibido** | Se congela con el archivo intacto | `cancelled`, `late` | la misma | **[Cobrar]** → «Acreditar pago», transferencia forzada. **[No cobrar]** condona y **conserva el archivo**. Volver a pedir está bloqueado: `PROOF_ALREADY_ATTACHED` | Igual que la fila 2. **Nunca «pagado»** |
| **5 · Acreditado** | Se congela: sigue `credited`, importe y método sin tocar, + `charge_reason='cancellation'` + decisión abierta | `cancelled`, `late` | la misma | **[Cobrar]** retiene el prepago. **[No cobrar]** escribe `forgiven` — y ahí está la trampa: el dinero entró de verdad y el registro dice que no se cobró. No hay devolución en el producto | Igual que la fila 2 |

Las dos columnas que se sellan, exactamente:

```sql
UPDATE public.payments
   SET charge_reason        = v_new_charge_reason,   -- session -> cancellation
       late_change_decision = 'pending',
       updated_at           = v_now
 WHERE id = v_payment.id
   AND late_change_decision IS NULL;                 -- no reabrir una decisión ya tomada
-- precedido de: v_payment.status IN ('pending','credited')
```

`late_change_decision_resolved_at` y `_resolved_by` se quedan en NULL: lo exigen
`chk_late_decision_resolution` y `chk_late_decision_resolved_by`, y cerrarlas es de la
profesional.

### 1.6 Reprogramar **a tiempo** — el dinero viaja

No se pregunta servicio ni modalidad: vienen de la cita que se mueve.

| Estado del pago | El dinero | Las citas | Función | Después, la profesional | Qué se le dice a la paciente |
|---|---|---|---|---|---|
| **1 · Sin costo** | Nada que mover. La cita nueva nace con su pago `not_applicable` | Vieja `rescheduled` + `on_time`; nueva `scheduled`, conserva `series_id`, con `rescheduled_from_appointment_id` | `agent_reschedule_appointment_from_workflow` | Nada | «Listo, moví tu cita al {nuevo}. Sigue {modalidad}.» Sin mencionar dinero |
| **2 · Pendiente desnudo** | **Viaja:** el viejo a `waived` + `waive_reason='carried_forward'`, `charge_reason` se queda en `'session'`; el nuevo nace `pending` con el mismo importe | igual | la misma | Nada. La tarjeta vieja muestra «Pago en la cita nueva» | «… y tu pago se fue con ella.» |
| **3 · Comprobante pedido** | Viaja, **y la petición tiene que viajar con él** (§1.10, arreglo 2) | igual | la misma | Le sigue faltando el comprobante de la cita nueva | «… y tu pago se fue con ella», y se le sigue pidiendo el comprobante |
| **4 · Comprobante recibido** | Viaja **con el comprobante**, y la fila se **mueve, no se copia** (§1.10, arreglo 3) | igual | la misma | Revisa el comprobante sobre la cita nueva | «… y tu comprobante también.» Nunca «pagado» |
| **5 · Acreditado** | Viaja `credited`, con `resolved_at` en el pago nuevo | igual | la misma | Nada. La tarjeta nueva dirá «Pagado» | «… y tu pago se fue con ella.» |

### 1.7 Reprogramar **tarde** — el dinero se congela

Es la regla nueva y la que más cambia. **Se avisa antes de mover, y se pregunta:**

> Perfecto, te ayudo a reprogramarla. Sólo te aviso antes: Araceli pide 24 horas de aviso
> para cambios y ya faltan menos, así que se cobran las dos sesiones — la del viernes y la
> nueva.
>
> ¿La movemos?

**El cierre no repite el aviso**, porque ya se dio: «Listo, moví tu cita al miércoles 2 de
septiembre a las 4:00, presencial.»

| Estado del pago | El dinero | Las citas | Función | Después, la profesional | Qué se le dice a la paciente |
|---|---|---|---|---|---|
| **1 · Sin costo** | **No se abre decisión.** El viejo sigue `not_applicable` y el nuevo nace `not_applicable` | Vieja `rescheduled` + `late`; nueva `scheduled` | `agent_reschedule_appointment_from_workflow` | Nada | Se mueve **sin mencionar cobro** ni aviso previo |
| **2 · Pendiente desnudo** | El viejo **se queda `pending`** sobre la cita `rescheduled`, + `charge_reason='reschedule'` + decisión abierta. El nuevo es un pago propio: `pending`, `charge_reason='session'`, `charge_timing` de la política | igual | la misma | Sobre el viejo: **[Cobrar]** Efectivo / Transferencia / Pedir comprobante; **[No cobrar]** condona | El aviso de arriba y el cierre seco |
| **3 · Comprobante pedido** | Igual, conservando `proof_requested_at` y `method` sobre el viejo. El nuevo nace limpio | igual | la misma | Sobre el viejo: Transferencia o Volver a pedir; efectivo bloqueado | Igual |
| **4 · Comprobante recibido** | El viejo `pending` **con su archivo** sobre la cita `rescheduled` + decisión abierta. El nuevo nace `pending` | igual | la misma | Sobre el viejo: **[Cobrar]** «Acreditar pago», o **[No cobrar]** condonar | Igual. **Es la celda más dura del sistema:** su dinero se queda en la cita que movió y la sesión nueva se le vuelve a cobrar. Por eso el aviso dice «se cobran las dos sesiones» |
| **5 · Acreditado** | El viejo sigue `credited` sobre la cita `rescheduled` + `charge_reason='reschedule'` + decisión abierta. El nuevo nace `pending` | igual | la misma | Sobre el viejo: retener el prepago, o condonarlo como `forgiven` | Igual, con la misma dureza |

**Por qué congelar y no arrastrar, en una línea:** si el dinero viaja, la decisión abierta
**no la puede resolver nadie**. El pago viejo quedaría `waived` (fuera de las tres funciones
que resuelven) y el nuevo colgaría de una cita `scheduled` (fuera de las tres también).
Cuatro guardias en cada sitio, verificados uno por uno en `13-decision-tardia.md` §5.1.

**Media parte de congelar ya existe; la otra media no, y hay que decirlo con precisión.** El
modo `'charge_old'` de `public.reschedule_appointment` —desplegado— sí deja el pago viejo
sobre la cita `rescheduled` con `charge_reason='reschedule'`, y sí crea el pago nuevo aparte
con `'session'`. Pero **nunca escribe `late_change_decision`**: el cuerpo entero de
`reschedule_appointment` no menciona esa columna ni una vez (comprobado sobre `pg_proc`). Ese
modo no abre una decisión, la resuelve en el acto, porque ahí quien mueve la cita es la
profesional y elige cobrar, pedir comprobante o diferir en el mismo comando.

Lo que el agente añade es exactamente **una columna: `late_change_decision = 'pending'`**. Y
esa columna hoy **no la escribe nadie**. La propia `cancel_appointment` lo dice en su
comentario: «una cita scheduled valida no trae una decision tardia: esa dimension nace al
cerrar una cita desde la superficie del paciente/sistema». La superficie del paciente es el
agente, y es la pieza que falta.

Por eso tampoco existe en producción una fila con la forma congelada. Las dos filas cerradas
con decisión —los pagos `…0016` y `…0009`— la traen ya **resuelta** (`late_change_decision =
'charge'`, `resolved_by = 'professional'`): son el estado *después* de que la profesional
decidió, no el que el agente va a dejar. **La forma congelada no se ha visto nunca.**

### 1.8 Pasar el pago a la próxima cita

Es la tercera salida y tiene su propia sección: **§4**.

### 1.9 La columna que no se puede olvidar: `charge_reason`

`get_billing_day` y `get_billing_month` clasifican cada fila con dos banderas y **filtran por
las dos**:

```sql
((a.status='attended'    AND pay.charge_reason='session')
 OR (a.status='no_show'     AND pay.charge_reason='no_show')
 OR (a.status='cancelled'   AND pay.charge_reason='cancellation')
 OR (a.status='rescheduled' AND pay.charge_reason='reschedule'))  AS earns,

(pay.late_change_decision IS NULL
 OR (a.status IN ('cancelled','rescheduled')
     AND pay.late_change_decision='charge'))                      AS late_ok
```

Dos lecturas, las dos importantes:

1. **Mientras la decisión está `pending`, `late_ok` es falso.** La fila no está en Cobros, no
   suma al total pendiente y no pinta marcador. Es deliberado, pero significa que **Cobros no
   es el camino para encontrar la decisión**: se llega tocando la tarjeta del día.
2. **Si `charge_reason` se queda en `'session'` sobre una cita cerrada, `earns` es falso para
   siempre.** Y aquí está la trampa fina: **`credit_appointment_payment`, en su rama de pago
   `pending`, no toca `charge_reason`**. Si el agente no lo reclasificó, la profesional pulsa
   [Cobrar] → Efectivo, el pago queda `credited` + `charge`, la tarjeta dice «Pagado»… y la
   fila **no aparece nunca en Cobros ni suma al ingreso**. Sin error y sin aviso.

Por eso R-H: **el agente sella `charge_reason` en el mismo acto en que abre la decisión.** No
hay conflicto con las tres funciones que resuelven después: `waive` respeta el valor ya
puesto, `request_proof` lo sobrescribe con el mismo, y `credit` en la rama del prepago acepta
explícitamente que ya coincida.

### 1.10 Lo que falta en las funciones escritas para que esta matriz sea cierta

Las cinco mutaciones del agente **están escritas y sin desplegar** (migración
`supabase/migrations/20260825003000_agent_citas_mutaciones.sql`). En `pg_proc` hay 13
funciones `agent_*` desplegadas —nueve en `public`, cuatro en `private`— y **las 13 son de
plomería: cero operaciones de dominio.** El inventario completo, con lo que ya se corrigió y
lo que sigue abierto, vive en **§8**; aquí sólo lo que toca a esta matriz.

**Ya corregido en el archivo, sin aplicar:**

- El cerrojo `APPOINTMENT_HAS_MONEY` en cancelar, en el sitio correcto (§2).
- El bloque de dinero de reprogramar, partido en dos: a tiempo arrastra, tarde congela con
  `charge_reason='reschedule'` y `late_change_decision='pending'` (§1.7).
- La petición de comprobante viaja siempre al mover a tiempo. Antes se copiaba con
  `CASE WHEN v_old_has_proof THEN … END`, así que una petición sellada sin archivo se perdía y
  nadie volvía a pedirla.
- El comprobante **se mueve, no se copia**. Dos filas sobre el mismo `storage_object_path`
  eran una bomba: la limpieza de Storage borra **por ruta** y nunca cuenta cuántas filas la
  referencian. Es el mismo defecto que arrastra la `reschedule_appointment` desplegada, que
  sigue copiando.
- Los dos `INSERT INTO public.whatsapp_outbox` de cancelar y reprogramar, retirados (§7).

**Lo que sigue abierto:**

| # | Arreglo | Dónde |
|---|---|---|
| 1 | **Sellar la petición de prepago al agendar.** El `INSERT INTO public.payments` de crear sigue mandando `method` en NULL y sin `proof_requested_at` | §3.1 |
| 2 | **Que la cita de prepago no nazca confirmada.** `v_born_confirmed` sigue sin el `AND NOT v_prepay` | §3.3 |
| 3 | **Confirmar la cita al pegar el comprobante** | §3.3 |
| 4 | **Los avisos 4 y 5 siguen en blanco**, ahora por nombres de clave equivocados y no por falta del nombre de la paciente | §6.4 |

---

## 2. El cerrojo: una cita con dinero adentro no se cancela

### 2.1 La condición, en columnas reales

```sql
IF v_reason IS NULL
   AND v_policy_result = 'on_time'::public.change_policy_result
   AND (v_payment.status = 'credited'::public.payment_status
        OR EXISTS (SELECT 1 FROM public.payment_proofs AS proof
                    WHERE proof.payment_id = v_payment.id)) THEN
  v_reason := 'APPOINTMENT_HAS_MONEY';
END IF;
```

**Dónde va, exactamente, porque aquí es fácil equivocarse y sale caro.** En
`agent_cancel_appointment_from_workflow` (migración `20260825003000`) el orden real es este:

| # | Qué pasa ahí |
|---|---|
| 1 | Guardias de la cita: no existe, no es cancelable, ya empezó. Cada una sella `v_reason` |
| 2 | Se carga la política, se calcula `v_policy_result` y se carga `v_payment … FOR UPDATE` |
| **3** | **Aquí va el cerrojo** — última línea del bloque `IF v_reason IS NULL` |
| 4 | `IF v_reason IS NOT NULL THEN` → devuelve `applied:false` sin tocar nada |
| 5 | `UPDATE public.appointments … status='cancelled'` |
| 6 | La matriz económica |

**«Antes de la matriz económica» no alcanza: para cuando la matriz corre, la cita ya está
cancelada.** El `UPDATE` que la cierra va antes, en el paso 5. Un cerrojo puesto entre el 5 y
el 6 sellaría `v_reason` en un punto donde ya nadie lo lee: la función devolvería el rechazo y
la cita quedaría `cancelled` de todos modos, con el dinero colgando — que es justo lo que el
cerrojo existe para impedir.

**El sitio correcto es el paso 3: inmediatamente después del `SELECT … INTO v_payment … FOR
UPDATE`**, todavía dentro del `IF v_reason IS NULL`, para que la salida caiga sola por el
`IF v_reason IS NOT NULL` del paso 4. Así está escrito hoy en el archivo.

Tres decisiones dentro de esas seis líneas:

- **«Dinero adentro» se define igual que en pasar el pago** (R-A). Si las dos definiciones no
  coinciden, aparece la cita que no se puede cancelar y tampoco se puede pasar.
- **Sólo muerde `on_time`.** Cancelar tarde con dinero adentro **sí tiene salida honesta**:
  se congela y decide la profesional. Ese camino no pierde un peso y no hay por qué cerrarlo.
- **El motivo se llama `APPOINTMENT_HAS_MONEY`**, no «no se puede»: el agente lo lee y ofrece
  las dos salidas.

### 2.2 Qué tapa el cerrojo: dos fugas vivas, no hipótesis

Sin él, la matriz económica de cancelar resuelve el dinero con dos ramas y nada más
—«a tiempo + pendiente» condona, «tarde + hay dinero» congela— y se le escapan dos casos:

| Caso | Qué pasaría sin cerrojo | Consecuencia |
|---|---|---|
| **A tiempo + comprobante recibido** | Cae en la rama de condonar: `waived/forgiven` | La paciente transfirió de verdad y el registro dice «no se cobró» |
| **A tiempo + prepago acreditado** | **No cae en ninguna rama** | El pago se queda `credited` con `charge_reason='session'` colgando de una cita `cancelled`. `earns` es falso: **no aparece en Cobros ni como acreditado ni como pendiente**. Desaparece sin que nadie lo haya condonado, y **ninguna función de la profesional lo puede reabrir** |

### 2.3 Qué se le ofrece a la paciente

Sin próxima cita del mismo servicio — una sola salida:

> Esa cita ya tiene tu pago, así que no la puedo cancelar desde aquí. Lo que sí puedo es
> moverla a otro día: tu pago se va con ella, y tu comprobante también.

Con una próxima del mismo servicio — las dos salidas, juntas:

> Esa cita ya tiene tu comprobante, así que no la puedo cancelar desde aquí. Puedo moverla a
> otro día, o pasar tu pago a tu cita del martes 8. ¿Cuál prefieres?

La primera línea cambia según el estado: «ya mandaste tu comprobante» (fila 4) o «ya está
pagada» (fila 5).

**Si insiste**, el agente no cede y da la salida real:

> Entiendo, pero cancelarla no está de mi lado. Escríbele a Araceli y ella la cancela desde
> su app. Si prefieres moverla, dime y te busco otro día.

### 2.4 El límite que crea el cerrojo, dicho sin maquillaje

Una paciente **a tiempo**, con dinero adentro, **sin próxima cita del mismo servicio** y
**sin hueco libre al cual moverse**, se queda sin ninguna salida por WhatsApp. Tiene que
hablar con su profesional. Es consecuencia directa de la regla, no un defecto.

---

## 3. Prepago completo

Aplica sólo cuando `professional_appointment_policies.charge_timing = 'before'` y el precio
efectivo es mayor que cero. **Hoy es una profesional de cinco: Araceli**, con 12 pacientes
activos de los 17 activos de la base (18 en total, uno inactivo).

El circuito completo son cuatro piezas. **Una ya está escrita y sin aplicar**: el reloj de
24 h, en `supabase/migrations/20260826005000_agente_prepago_24h.sql`. **Las otras tres siguen
sin escribirse**: sellar la petición al agendar, nacer sin confirmar, y confirmar al pegar el
comprobante. Las tres son ediciones dentro de funciones que ya existen.

### 3.1 Se sella la petición al agendar

Es una edición sobre el `INSERT` que ya está escrito en
`20260825003000_agent_citas_mutaciones.sql` (líneas 477-490), que hoy no manda `method` ni
`proof_requested_at`. Se le añaden dos columnas y nada más:

```sql
INSERT INTO public.payments (
  appointment_id, professional_id, amount, status, method,
  charge_reason, charge_timing, proof_requested_at, resolved_at
) VALUES (
  v_appointment_id, v_turn.professional_id, v_amount,
  v_payment_status,                                                -- NO 'pending' a secas
  CASE WHEN v_prepay THEN 'transfer'::public.payment_method END,   -- lo exige el CHECK
  'session'::public.charge_reason,
  v_policy.charge_timing,
  CASE WHEN v_prepay THEN v_now END,                               -- arranca el reloj
  NULL
);
-- v_prepay := v_policy.charge_timing = 'before' AND v_amount > 0
```

**`v_payment_status` se conserva tal cual, y no es un detalle.** Esa variable ya vale
`not_applicable` cuando el importe es 0 y `pending` cuando no. Escribir `'pending'` a secas
rompería `chk_payment_not_applicable_amount`, que exige `(status = 'not_applicable') =
(amount = 0)`: la primera sesión gratis reventaría el `INSERT`. El `CASE` de `v_prepay` ya
excluye el importe 0, así que las dos columnas nuevas quedan en NULL en ese caso y ningún
CHECK se toca.

Tres cosas que no son adorno:

1. **`proof_requested_at` es el reloj.** No hay ninguna otra columna que diga cuándo empezó a
   correr el plazo de 24 h. Si no se sella, el trabajo de §3.2 no tiene de dónde contar.
2. **`method='transfer'` va obligado**, no elegido: `chk_payment_proof_requested_transfer`
   dice `(proof_requested_at IS NULL) OR (method='transfer')`. Sin él, el `INSERT` revienta.
3. **Es también lo que habilita el comprobante.** `agent_attach_payment_proof_from_workflow`
   rechaza con `PROOF_NOT_REQUESTED` cualquier archivo sobre un cobro que nadie pidió. Sin
   este sello, la paciente manda la foto y el agente la rechaza.

Las tres columnas están en el `GRANT INSERT` del agente sobre `payments`
(`20260825000000_agent_dominio_fundamento.sql`): `proof_requested_at` y `method` incluidas.
**No hace falta ningún
permiso nuevo.**

**Los datos bancarios ya existen en la base y están vacíos.** `public.professionals` tiene
`payment_bank_name`, `payment_account_holder` y `payment_clabe_or_account` —verificado en
`information_schema`— y **las cinco profesionales las tienen en NULL**. Corrige la decisión 4
del ensayo, que las daba por inexistentes: no hay que crear las columnas, hay que **llenarlas
desde el perfil y leerlas en el expediente del agente**. Eso ya está escrito y sin aplicar en
`20260826001000_agente_datos_de_pago.sql`, que las declara con `IF NOT EXISTS` y las mete en
`get_professional_info` / `update_professional_info`. Cuando estén vacías, el agente usa el
texto de respaldo de §1.1.

### 3.2 El trabajo que cancela a las 24 h

**No existía, y ya está escrito.** El archivo es
`supabase/migrations/20260826005000_agente_prepago_24h.sql`, la función es
`public.cron_prepay_autocancel(p_batch integer DEFAULT 200)`, y **no está aplicada**.

Lo que había antes, verificado sobre la base: en `cron.job` hay siete trabajos y ninguno
cancela prepagos vencidos; el único candidato por nombre, `public.cron_prepay_proof_request`,
**está retirado en el cuerpo** —levanta un `WARNING` y devuelve 0— y **ni siquiera está
registrado en cron**.

Y no puede colgarse de `public.jobs`: **esa tabla no tiene consumidor**. Hoy hay 14 trabajos
pendientes sin tocar y no existe ni `claim_jobs_batch` ni `dispatch_jobs` en `pg_proc`.

Se escribió como los barredores que ya funcionan, copiando la forma de
`public.cron_sweep_past_pending`: `SECURITY DEFINER`, `search_path` vacío, lote,
`FOR UPDATE … SKIP LOCKED` y re-chequeo bajo el lock.

**La selección, tal como quedó:**

```sql
SELECT …
  FROM public.appointments AS appointment
  JOIN public.payments     AS payment ON payment.appointment_id = appointment.id
 WHERE appointment.status       = 'scheduled'
   AND appointment.origin       = 'patient'   -- una cita de la profesional no se autocancela
   AND appointment.confirmed_at IS NULL       -- una cita confirmada ya no la mata el reloj
   AND appointment.starts_at    > v_now       -- y una que ya empezó, tampoco
   AND payment.status             = 'pending'
   AND payment.charge_timing      = 'before'
   AND payment.proof_requested_at IS NOT NULL
   AND payment.proof_requested_at + interval '24 hours' <= v_now
   AND NOT EXISTS (SELECT 1 FROM public.payment_proofs pp WHERE pp.payment_id = payment.id)
 ORDER BY payment.proof_requested_at
 LIMIT p_batch
   FOR UPDATE OF appointment, payment SKIP LOCKED
```

`appointment.starts_at > v_now` es lo que cierra el borde de una profesional que bajara su
anticipación mínima por debajo de 24 h: la sesión que ya empezó no la toca el reloj, la
recoge el barredor de citas vencidas. Hoy tampoco puede pasar —la única que cobra por
adelantado pide 2 880 minutos, o sea 48 h—, pero el guardia no cuesta nada.

**El efecto: la cita primero, el pago después, y el aviso al final.**

```sql
UPDATE public.appointments
   SET status = 'cancelled', is_editable = false,
       cancelled_rescheduled_at = v_now,
       cancel_reschedule_actor  = 'system',   -- no la canceló la paciente, la canceló el reloj
       updated_at = v_now
 WHERE id = v_row.appointment_id AND status = 'scheduled';
CONTINUE WHEN NOT FOUND;                       -- el ancla contra el doble procesado

UPDATE public.payments
   SET status = 'waived', waive_reason = 'forgiven',
       charge_reason = CASE WHEN charge_reason = 'session'
                            THEN 'cancellation' ELSE charge_reason END,
       resolved_at = v_now, updated_at = v_now
 WHERE id = v_row.payment_id AND status = 'pending';
```

**El orden entre esos dos `UPDATE` da igual, y conviene decirlo para que nadie invente una
regla que no existe.** Los dos disparadores se persiguen la misma fila de la cola por caminos
distintos: `appointments_apagar_avisos_au` la cancela por `appointment_id` —`appointment_
confirmation_prepay` está en su lista—, y `payments_apagar_cobro_au` la degrada por
`payment_id` a `appointment_confirmation_request`. En cualquiera de los dos órdenes la cola
queda limpia: si va primero el pago, la fila se degrada y el segundo disparador la cancela;
si va primero la cita, se cancela y el segundo ya no la toca porque exige `NOT cancelled`.
Se puso la cita primero por otra razón, más útil: su `UPDATE` con `AND status = 'scheduled'`
es el candado de idempotencia del ciclo.

**Lo que sí tiene un orden obligatorio es el aviso a la paciente: va al final**, después de
los dos `UPDATE`. Encolado antes, los mismos disparadores lo tocarían.

```sql
INSERT INTO public.whatsapp_outbox
      (to_phone, send_mode, template_key, payload, status, dedup_key, scheduled_at)
SELECT patient.phone, 'template', 'appointment_cancelled',
       jsonb_build_object(
         'patient_first_name',      patient.first_name,
         'professional_first_name', professional.first_name,
         'starts_at',               v_row.starts_at,
         'timezone',                professional.timezone,
         'patient_id',              v_row.patient_id,
         'appointment_id',          v_row.appointment_id),
       'queued', 'appointment_cancelled:' || v_row.appointment_id::text, v_now
  …
ON CONFLICT (dedup_key) DO NOTHING;
```

Se insertan **campos semánticos**, nunca `variables` a mano: el trigger
`tg_outbox_variables_bi` las materializa y `chk_outbox_variables` valida el conteo exacto
—cuatro para `appointment_cancelled`, comprobado dentro de `private.wa_payload_ok`—.

**No se abre decisión de cobro.** No hubo sesión perdida ni aviso tardío: la cita nunca llegó
a existir de verdad. Se condona y se libera el horario.

**Aquí sí se encola la plantilla**, y es la única excepción a R-I: la paciente **no está en
la conversación** —pasaron 24 horas— así que el eco no existe y el silencio sí sería un
problema.

**El aviso a la profesional es la única pieza sin decidir, y las dos salidas son malas.** El
archivo escrito usa un tipo nuevo, `appointment_cancelled_unpaid`, con las cinco claves del
§6. `notifications.type` es `text` sin CHECK, así que la base lo acepta; el problema es que el
renderizador de la app no lo conoce y lo pinta como «Nueva notificación · Hay una
actualización reciente en tu cuenta». La alternativa es reusar
`appointment_cancelled_by_patient`, que sí pinta tarjeta pero dice «{paciente} canceló su
cita», que es mentira: la canceló el reloj. **Tarjeta en blanco pero honesta, o tarjeta legible
pero falsa.** La app es intocable esta ronda, así que no hay tercera. Queda como decisión del
dueño; el archivo escogió la honesta.

**El registro en cron**, con la misma cadencia que los otros barredores:

```sql
SELECT cron.schedule(
  'cron_prepay_autocancel',
  '*/5 * * * *',
  $$ select public.cron_prepay_autocancel(200); $$
);
```

Cada cinco minutos, así que el corte real es 24 h más cinco minutos como mucho. Y las 24 h se
escriben literales: es un valor fijo del producto, no un plazo de la profesional (única
excepción a «ningún plazo se escribe a mano»).

### 3.3 Por qué la cita de prepago nunca nace confirmada

Tres razones, y las tres apuntan al mismo sitio:

1. **De producto: el comprobante es lo que confirma.** Decir «sí voy» no confirma nada cuando
   la profesional cobra por adelantado. Si la cita naciera confirmada, el cierre aprobado
   —«Tu cita del miércoles 2 a las 12:00 ya quedó confirmada»— sería falso: ya lo estaba.
2. **De base: una cita confirmada no se puede editar.**
   `chk_appointment_confirmed_not_editable` dice `(confirmed_at IS NULL) OR (is_editable =
   false)`. Nacer confirmada y morir por falta de pago 24 horas después es una contradicción
   escrita en la propia fila.
3. **De restricción: la ventana de `patient_booking` es angosta.**
   `chk_appointment_patient_booking_origin` sólo admite ese origen de confirmación cuando el
   origen es `patient` o `recurring_series`, `rescheduled_from_appointment_id` es NULL,
   `confirmed_at = created_at` **y** `starts_at <= created_at + 48 h`. Como quien cobra por
   adelantado exige 48 h de anticipación, la ventana y la política se tocan **exactamente en
   el borde**: una cita agendada justo a las 48 h nacería confirmada y **el aviso de 26 h
   nunca le pediría nada**. Es un caso estrecho; las razones 1 y 2 bastan solas.

**El arreglo, una línea** en `agent_create_appointment_from_workflow`, donde se calcula
`v_born_confirmed`:

```sql
v_born_confirmed := v_starts_at <= v_now + interval '48 hours' AND NOT v_prepay;
```

**Y el otro lado del mismo circuito: pegar el comprobante confirma la cita.** Hoy
`agent_attach_payment_proof_from_workflow` escribe una sola cosa de dominio, la prueba, y deja
la cita sin confirmar. Falta:

```sql
UPDATE public.appointments
   SET confirmed_at        = v_now,
       confirmation_source = 'patient_response'::public.appointment_confirmation_source,
       is_editable         = false,
       updated_at          = v_now
 WHERE id = v_appointment.id
   AND status = 'scheduled'::public.appointment_status
   AND starts_at > v_now
   AND confirmed_at IS NULL;
```

Las cuatro columnas están concedidas en el `GRANT UPDATE` sobre `appointments`
(`20260825000000_agent_dominio_fundamento.sql`). `patient_response` **no tiene** la
restricción de las 48 h: es el
valor correcto aquí. Y el guardia `status='scheduled'` es indispensable, porque el
comprobante de un cargo tardío llega sobre una cita ya `cancelled` y esa no se confirma.

### 3.4 Lo que pasa después de que el reloj la mató

**No hay ventana de gracia y la cita vieja no se reabre.** Si la paciente vuelve a escribir,
agenda de cero. La cita muerta queda `cancelled` con su pago condonado, así que no arrastra
ninguna deuda.

---

## 4. Pasar el pago a la próxima cita

> «Pasar el pago a la próxima cita lo podemos dejar así de simple: o paso el link del
> comprobante y lo asigno a la próxima sesión, o le pongo a esa sesión el estado acreditado.»

No son dos operaciones: son las dos formas que puede tener el mismo dinero al viajar. **Una
sola función cubre las dos**, y el resultado dice cuál ocurrió para que el modelo no lo
adivine.

### 4.1 Cuándo se ofrece

Junto con reprogramar, **sólo cuando hay a dónde pasarlo**. La regla del dueño dice «cuando
la cita tiene recurrencia»; en la base eso se traduce a la regla de «tu próxima sesión» que
el producto ya tiene escrita y desplegada en `public.get_next_scheduled_appointment`. Esto es
lo que ese cuerpo dice, literal:

```sql
WHERE a.professional_id = v_professional_id   -- el actor, nunca del cliente
  AND a.patient_id      = p_patient_id
  AND a.service_id      = p_service_id
  AND a.status          = 'scheduled'
  AND a.starts_at       > now()
ORDER BY a.starts_at, a.id
LIMIT 1
```

El agente la reusa con **un solo cambio**: `starts_at > v_old.starts_at` en vez de
`> now()`, para no ofrecer como destino una cita que cae antes que la que se está cancelando.
El `professional_id` sale del turno sellado, igual que ahí sale del actor.

**No se exige `series_id`.** Exigirlo dejaría la operación muerta al nacer: hay **cero filas
en `public.recurrence_series` y cero citas con `series_id`** en producción. Y la regla del
mismo servicio sigue siendo cierta para las series el día que existan: dos citas de la misma
serie son, por construcción, dos citas del mismo servicio.

**La paciente no escoge el destino: lo resuelve el servidor.** No es una simplificación, es
lo único que funciona con la regla R12: la lista de citas próximas se colapsa por serie con
`DISTINCT ON (COALESCE(series_id, id))`, así que de una serie **sólo la más próxima lleva
identificador** y «la del 8» no tendría renglón que señalar. Ese colapso **ya está escrito**
en `agent_list_upcoming_appointments_from_workflow` —en el conteo y en el ciclo, que es lo que
impide que `truncated` mienta— y sin aplicar, como todo lo demás. Además, resolver el destino
en el servidor borra cuatro motivos de rechazo y el modelo no puede equivocarse de cita porque
no elige.

**Lo que se pierde:** si tiene dos citas futuras y quería la segunda, la respuesta es que eso
lo ve con su profesional.

### 4.2 La función

**Ya está escrita y sin aplicar**, en
`supabase/migrations/20260826004000_agente_pasar_el_pago.sql`.

```
public.agent_carry_payment_forward_from_workflow(
  p_provider_message_id text,
  p_kapso_execution_id  text,
  p_appointment_handle  uuid   -- la cita que se cancela: la que trae el dinero
) RETURNS jsonb
```

Un solo identificador, del mismo tipo que confirmar y cancelar. Operación en el portero:
`carry_payment_forward`, superficie `agent_node`, mutación, turno `active`. Ruta del gateway:
`/tools/payments/carry-forward`.

**Diez motivos de rechazo:**

| `reason` | Cuándo |
|---|---|
| `OPTION_EXPIRED` | el identificador ya no sirve (caduca a los 15 minutos y tiene que nacer en el mismo turno) |
| `APPOINTMENT_NOT_FOUND` | no es de esta paciente con esta profesional |
| `APPOINTMENT_NOT_CANCELLABLE` | no está `scheduled` |
| `APPOINTMENT_ALREADY_STARTED` | ya empezó |
| `PATIENT_INACTIVE` | la paciente ya no está activa |
| `LATE_CHANGE` | no hay tiempo mínimo. Tarde no se pasa el pago: eso lo resuelve la decisión de cobro |
| `NO_MONEY_TO_CARRY` | la cita no tiene dinero adentro: entonces se cancela y ya |
| `NO_TARGET` | no hay ninguna cita futura viva del mismo servicio. Se ofrece mover |
| `TARGET_HAS_MONEY` | la próxima ya tiene dinero suyo o una decisión abierta |
| `AMOUNT_MISMATCH` | los importes no coinciden (§4.4) |

### 4.3 La fusión de los dos pagos, paso por paso

El destino **ya nació con su pago**, y `payments_appointment_id_key UNIQUE (appointment_id)`
no deja insertar un segundo. Así que trasladar es **fusionar en su sitio**.

| # | Qué | Cómo |
|---|---|---|
| **1** | La cita vieja se cierra | `cancelled`, `on_time`, actor `patient`, `is_editable=false`, `cancelled_rescheduled_at=now()`. Conserva hora y modalidad. `confirmed_at` y `confirmation_source` a NULL **juntos** |
| **2** | El comprobante **cambia de dueño** | `DELETE` de la fila vieja y `INSERT` sobre el pago destino. **No un `UPDATE` del `payment_id`**: el disparador `payment_proofs_degradar_prepago_ai` es AFTER INSERT, y es el que degrada el `appointment_confirmation_prepay` que la cita destino tuviera en cola. Con un `UPDATE` no dispararía y a la paciente le llegaría una petición del dinero que acaba de mover |
| **3** | El pago del destino se **fusiona** | Conserva su `id` y su `appointment_id` —los dos únicos campos que no pueden cambiar— y adopta `status`, `method`, `proof_requested_at` y `resolved_at` del que viaja |
| **4** | El pago viejo se cierra | `waived` + `waive_reason='carried_forward'` + `charge_reason` reclasificado a `'cancellation'` + `resolved_at=now()` |
| **5** | El rastro | Dos asientos enlazados en `payment_events`, `event_type='carried_forward'`, con `carried_to_payment_id` / `carried_from_payment_id`. Son las mismas claves que usa `reschedule_appointment` en su modo `'carry'`: no hay que inventar ninguna columna |
| **6** | A la profesional | Aviso `appointment_cancelled_by_patient`, con el dato del traslado en el `payload` esperando a que la app lo pinte |

**El paso 3 se escribe con cuatro columnas, no con seis:**

```sql
UPDATE public.payments
   SET status             = v_old_pay.status,
       method             = v_old_pay.method,
       proof_requested_at = v_old_pay.proof_requested_at,
       resolved_at        = v_old_pay.resolved_at,
       updated_at         = v_now
 WHERE id = v_target_pay.id
   AND status = 'pending'::public.payment_status;
```

**`amount` y `charge_timing` no se tocan a propósito.** No están en el `GRANT UPDATE` del
agente sobre `payments`, y no hace falta abrirlos: `AMOUNT_MISMATCH` ya obligó a que los
importes sean idénticos, y el `charge_timing` del destino es de la misma política y de la
misma profesional. **Es un permiso menos y un cerrojo gratis:** ninguna operación del agente
cambia el importe de un cobro.

Y hay que decirlo al revés también: **el pago del destino no se condona.**
`waived/forgiven` significa «no se cobró», y aquí sí se cobró, sólo que antes. Además no se
puede condonar y luego insertar otro —`UNIQUE (appointment_id)`—, y un pago `waived` sobre una
cita `scheduled` deja a `mark_appointment_attended` sin salida (`INVALID_PAYMENT_STATE`).

Ninguna restricción se rompe, y la razón es que **las columnas viajan por parejas**: `status`
con `resolved_at` (`chk_payment_resolved_at`), y `proof_requested_at` con `method`
(`chk_payment_proof_requested_transfer`). El origen ya cumplía las dos.

### 4.4 Si los importes no coinciden

Se rechaza con `AMOUNT_MISMATCH` y el agente ofrece mover, que traslada el dinero completo sin
tocar importes. **No hay tercera salida barata: el esquema no tiene renglón de saldo.** Entre
las 38 tablas de `public` no hay ni una columna de saldo, y las dos cuentas salen mal:

- Viajan 800 a una sesión de 1 000 → la paciente cree que no debe nada y **debe 200 que nadie
  le va a cobrar**.
- Viajan 1 000 a una sesión de 800 → o se cobran 1 000 por una sesión de 800, o **200 se
  evaporan sin asiento**.

En producción el caso no existe: **las 16 combinaciones de paciente + servicio tienen un solo
precio y un solo importe cobrado.**

### 4.5 Qué se le dice a la paciente

| Cómo viajó | El texto |
|---|---|
| `credited` | «Listo, cancelé tu cita del {viejo} y tu pago quedó acreditado en tu sesión del {nuevo}. {Profesional} ya recibió el aviso.» |
| `proof_received` | «Listo, cancelé tu cita del {viejo} y pasé tu comprobante a tu sesión del {nuevo}. {Profesional} lo va a revisar.» |

En la segunda **no aparecen «pagado» ni «aprobado»**. La rama sale del campo `carried_state`
del resultado, no de lo que el modelo crea que pasó.

### 4.6 Los dos permisos sin los que revienta — y ya están escritos

| Permiso | Por qué | Estado |
|---|---|---|
| `GRANT SELECT ON public.payment_proofs` | Para leer la fila que va a mover | `20260825000000`, **escrito, sin aplicar** |
| `GRANT DELETE ON public.payment_proofs` | El paso 2 mueve la fila. Sin él la función aborta con `insufficient_privilege` **después** de cancelar la cita, y la transacción entera se va atrás: la paciente recibe un error | `20260825000000`, **escrito, sin aplicar** |

**Corrige lo que decían los documentos anteriores.** `10-reglas-finales.md` §3 renglón 4 y §4
choque 2 dan el `DELETE` por inexistente. Ya no lo es: se añadió a la migración de fundamento,
con su comentario de por qué —«el único `DELETE` de toda la superficie del agente»— y con la
razón exacta de por qué un `UPDATE` no sirve. Lo que falta no es escribirlo: es **aplicarlo**,
igual que todo lo demás de esa migración.

El `DELETE` es seguro: borra la fila que acaba de leer y la vuelve a insertar en la misma
transacción.

---

## 5. Las políticas que limitan a la paciente

Las cinco viven en `public.professional_appointment_policies`, una fila por profesional.
**Ninguna limita a la profesional: siempre decide.** Gobiernan lo que el agente permite y lo
que advierte.

| Columna | Qué gobierna | Valores admitidos |
|---|---|---|
| `charge_timing` | Si el agente pide comprobante al agendar | `before` \| `after` (default `after`) |
| `patient_min_booking_lead_minutes` | Con cuánta anticipación puede agendar. Rechazo `LEAD_TIME_NOT_MET` | default 1440. `update_appointment_policies` sólo acepta 0, 360, 720, 1440 o 2880 |
| `free_change_notice_minutes` | La frontera entre `on_time` y `late` para cancelar y reprogramar | default 1440. Sólo 0, 360, 720 o 1440 |
| `patient_can_switch_to_online` / `_to_in_person` | Si puede cambiar de modalidad, **por dirección** | booleanos, default `false` |
| `min_lead_to_change_modality_minutes` | Anticipación mínima para el cambio de modalidad | default 1440. Sólo 0, 360, 720 o 1440 |

### 5.1 Los valores reales de hoy

| Profesional | Cobra | Agendar con | Cambios con | → en línea | → presencial | Modalidad con | Pacientes activos |
|---|---|---|---|---|---|---|---|
| **Araceli** | **por adelantado** | 2 880 min (48 h) | 1 440 min (24 h) | sí | sí | 1 440 min | **12** |
| **Miranda** | después | 2 880 min (48 h) | **720 min (12 h)** | sí | sí | **720 min** | 1 |
| **test** | después | 2 880 min (48 h) | 1 440 min (24 h) | sí | **no** | 1 440 min | 1 |
| **Test** | después | 1 440 min (24 h) | 1 440 min (24 h) | no | no | 1 440 min | 3 |
| **Maricruz tes** | después | 1 440 min (24 h) | 1 440 min (24 h) | no | no | 1 440 min | 0 |

### 5.2 Qué implica cada renglón

1. **Araceli es todo el circuito de prepago.** Es la única con `charge_timing='before'` y
   tiene 12 de los 17 pacientes activos (18 en total). Todo el §3 existe por ella. En
   `payments` hay exactamente **2 filas con `charge_timing='before'`**, las dos suyas y las
   dos `pending` — y las dos cuelgan de citas `past_pending`, no de citas vivas.
2. **Miranda pide 12 horas, no 24.** Un texto con «24 horas» adentro le miente a su paciente.
   **Ningún plazo se escribe a mano**: sale de la fila y se dice en horas.
3. **A dos profesionales no se les menciona el cambio de modalidad**, porque las dos
   direcciones están en `false`. A `test` sólo se le ofrece «pasar a en línea». El menú es
   personalizado: si no lo permite, no se nombra.
4. **`free_change_notice_minutes` admite 0.** Si alguien lo pusiera en cero, todo saldría
   `on_time` y «sólo con tiempo mínimo» dejaría de significar algo. Hoy no pasa y se deja así.
5. **El cambio de modalidad no toca dinero nunca.** No hay versión tardía con cargo: o alcanza
   la anticipación, o no se cambia.

### 5.3 El agujero: hoy el agente no sabe nada de esto

`public.agent_get_capabilities` —desplegada— devuelve diez capacidades booleanas y **ni una
sola política**: no lleva `charge_timing`, ni los plazos, ni los permisos de modalidad.
Verificado leyendo su cuerpo completo. Y `agent_list_upcoming_appointments_from_workflow`
—escrita, sin aplicar— devuelve por cita **seis campos**: `appointment_handle`,
`service_name`, `starts_at_local`, `modality`, `is_confirmed` e `is_editable`.

**Ninguno de los seis sirve para lo que hace falta.** `is_editable` parece un candado y no lo
es: se apaga cuando la cita se confirma o cuando se le pide comprobante, no cuando se acabó el
plazo de aviso. Con esos seis campos el agente no puede saber si el cambio va a ser tardío ni
si hay dinero adentro.

**Y eso rompe las reglas nuevas**, porque **el aviso va antes de la mutación**: el agente tiene
que saber que el cambio va a ser tardío *antes* de tocarlo, y hoy sólo se enteraría por el
rechazo, cuando ya avisó mal o no avisó.

**El arreglo mínimo: cinco campos más por cita en la lista que ya se llama.** Ninguna llamada
nueva, ningún viaje extra.

| Campo | Qué es | Para qué |
|---|---|---|
| `change_policy_result` | `on_time` o `late`, calculado al leer con la fórmula de R-C | Decidir si hay que avisar antes |
| `notice_hours` | `free_change_notice_minutes / 60` | Escribir «pide 12 horas» sin inventar el número |
| `has_money` | la condición de R-A | Saber si cancelar está cerrado y ofrecer las dos salidas |
| `is_chargeable` | el importe del cobro es mayor que cero | No decir «se te cobra» de una sesión de $0 |
| `can_carry_payment` | existe una próxima viva del mismo servicio | Ofrecer «pasar tu pago» sólo cuando hay a dónde |

Y en las capacidades, `charge_timing`, para que el agente sepa desde el primer mensaje si
tiene que hablar de dinero al agendar.

---

## 6. El contrato de avisos a la profesional

Son seis eventos y **una sola tabla**: `public.notifications`. `type` es `text` sin CHECK, así
que la base acepta cualquier cosa — pero **el renderizador de la app decide si la tarjeta se
lee o sale en blanco**, y la app es intocable esta ronda.

El renderizador vive en
`flutter_application_1/lib/pages/notifications/notification_models.dart` y termina en
`_ => _neutralPresentation`. Un tipo que no conoce, o un tipo que conoce **al que le falte una
clave**, se pinta como:

> **Nueva notificación** · Hay una actualización reciente en tu cuenta.

### 6.1 Las tres reglas que atraviesan los seis

1. **`patient_first_name` es obligatorio y no puede venir vacío.** `patient_last_name` es
   opcional. Si el nombre falta, la tarjeta cae al aviso neutro, sin excepción.
2. **Las horas tienen que traer huso.** `_parseOffsetInstant` exige que terminen en `Z` o en
   `±HH:MM`. Es justo lo que produce un `timestamptz` metido en `jsonb_build_object`; una
   cadena armada a mano no sirve.
3. **La modalidad tiene que llegar exactamente como `'online'` o `'in_person'`.** Cualquier
   otro texto devuelve `null` y tumba la tarjeta.

Claves extra —`surface`, `command_id`, `change_policy_result`— son inofensivas: el
renderizador sólo lee las que conoce. Lo que no se puede es faltar una.

### 6.2 Los seis avisos, con su forma exacta

| # | Evento | `type` | Claves obligatorias | Lo que pinta la app |
|---|---|---|---|---|
| 1 | Agendó | `appointment_created_by_patient` | `patient_first_name`, `appointment_starts_at`, `appointment_ends_at`, `appointment_modality` | «Cita creada · {nombre} agendó una cita para el {día}, de {hora} a {hora}, en modalidad {modalidad}.» |
| 2 | Confirmó | `appointment_confirmed` | las mismas cuatro | «Cita confirmada · {nombre} confirmó su cita del {día}, de {hora} a {hora}, en modalidad {modalidad}.» |
| 3 | Canceló | `appointment_cancelled_by_patient` | las mismas cuatro | «Cita cancelada · {nombre} canceló su cita {modalidad} del {día}, de {hora} a {hora}.» |
| 4 | Reprogramó | `appointment_rescheduled_by_patient` | `patient_first_name`, `previous_starts_at`, `previous_modality`, `new_starts_at`, `new_modality` | «Cita reprogramada · {nombre} reprogramó su cita {modalidad} del {día} a las {hora}. Nueva cita: {día} a las {hora}, {modalidad}.» |
| 5 | Cambió modalidad | `modality_changed_by_patient` | `patient_first_name`, `appointment_starts_at`, `previous_modality`, `new_modality` | «Modalidad modificada · {nombre} cambió su cita del {día} a las {hora} de modalidad {antes} a {después}.» |
| 6 | Mandó comprobante | `payment_proof_received` | `patient_first_name`, `appointment_starts_at` | «Comprobante recibido · {nombre} envió el comprobante de su cita del {día} a las {hora}.» |

> **Aviso, y no es cosmético: «las mismas cuatro» sólo vale para los avisos 1, 2 y 3.** Los
> avisos 4 y 5 leen **otras claves, con otros nombres**, y el 6 lee sólo dos. El renderizador
> no busca por parecido: `previous_modality` y `old_modality` son dos cosas distintas y la
> segunda no existe para él. Copiar los cuatro nombres del renglón 1 en la tarjeta de
> reprogramar la deja igual de en blanco que no escribir nada. **Ya pasó al arreglarlas** — ver
> §6.4.

El aviso 3 se reusa también para **pasar el pago**: no existe tipo propio para ese hecho y uno
nuevo se pintaría en blanco. Para el **prepago vencido** la decisión está abierta y se explica
en §3.2 — el archivo escrito escogió el tipo nuevo `appointment_cancelled_unpaid`, que la app
pinta en blanco pero no miente sobre quién canceló.

Los seis nombres y sus payloads no son teoría: **los seis existen en producción**, uno de cada
uno, y se leyeron tal cual de la tabla.

### 6.3 El del comprobante: le faltaban las dos claves y le sobraba el monto

El aviso 6 pide **dos claves**: `patient_first_name` y `appointment_starts_at`. Lo que
`agent_attach_payment_proof_from_workflow` mandaba era `surface`, `command_id`,
`charge_reason` y `amount`: ninguna de las dos obligatorias, ni siquiera una hora. **Ya está
corregido** en `20260825002000_agent_pagos.sql`, sin aplicar.

El `'amount'` se fue por tres razones, y conviene que queden escritas para que nadie lo
devuelva:

1. **La app no lo lee.** Su texto no menciona dinero: la tarjeta sólo dice quién mandó qué y
   de cuál cita.
2. **Es dinero copiado a un sitio que no se actualiza.** El importe vive en `payments.amount`.
   Si cambia, la notificación se queda mintiendo para siempre, porque nadie reescribe una fila
   de la bandeja.
3. **Un comprobante recibido no es un cobro.** El pago sigue `pending`, pendiente de revisión.
   Poner el monto en la tarjeta empuja a leerlo como «entraron $800», que es exactamente lo
   que R-D prohíbe decir.

La fila real de producción lo confirma: su payload trae `patient_first_name`,
`patient_last_name` y `appointment_starts_at`. **Sin monto.**

### 6.4 Cómo van los seis hoy: cuatro bien, dos rotos

Verificado renglón por renglón contra el `switch` de
`flutter_application_1/lib/pages/notifications/notification_models.dart`, sobre el estado
actual de las migraciones. Las claves `surface` y `command_id` van en las seis y son
inofensivas.

| Aviso | Qué manda hoy | Veredicto |
|---|---|---|
| 1 · crear | las cuatro del contrato | **pinta** |
| 2 · confirmar | las cuatro | **pinta** |
| 3 · cancelar | las cuatro, más `change_policy_result`, `pending_charge_decision` y `waived` | **pinta** |
| 4 · reprogramar | `patient_first_name`, `appointment_starts_at`, `appointment_ends_at`, `appointment_modality`, `old_starts_at` | **EN BLANCO.** El renderizador de este tipo no mira ninguna de esas: pide `previous_starts_at`, `previous_modality`, `new_starts_at` y `new_modality`, y las cuatro faltan |
| 5 · modalidad | `patient_first_name`, `appointment_starts_at`, `appointment_ends_at`, `appointment_modality`, `old_modality`, `new_modality` | **EN BLANCO** por una palabra: el renderizador lee `previous_modality`, no `old_modality`. Las otras tres claves que pide ya están |
| 6 · comprobante | `patient_first_name`, `appointment_starts_at` | **pinta** |

**Los dos rotos lo están por la misma causa:** se les copió el juego de cuatro claves de los
avisos 1-3 en vez de leer el `switch` del tipo que les toca. Los arreglos son chicos y
distintos entre sí:

- **Reprogramar** necesita `previous_starts_at` (= `v_old.starts_at`, hoy va con el nombre
  `old_starts_at`), `previous_modality` (= `v_old.modality`), `new_starts_at` (= `v_starts_at`)
  y `new_modality` (= `v_modality`). Las tres `appointment_*` pueden quedarse o irse: el
  renderizador de este tipo no las mira.
- **Modalidad** necesita una sola edición: renombrar `old_modality` a `previous_modality`.
  Cuidado con el valor, que ya está bien: `v_appointment.modality` es la instantánea *anterior*
  al `UPDATE`, o sea la modalidad de la que se viene.

Y **la de cancelar no manda `service_name`**, por si algún documento anterior lo dijo: ese
campo va en el resultado que lee el modelo, no en el aviso.

---

## 7. Qué plantillas no debe encolar el agente

**La regla, en una línea: el agente contesta; el reloj encola.** Mientras la paciente está en
la conversación, el agente le responde en el mismo turno con
`send_notification_to_user`. Encolar además una plantilla es un **eco frío**: le llega dos
veces lo mismo, y la segunda con el texto genérico de Meta.

`chk_outbox_variables` acepta exactamente **16 claves de plantilla** —el catálogo vive dentro
de `private.wa_payload_ok` y una clave desconocida devuelve `-1` y revienta el `INSERT`—.
Ninguna es del agente en una conversación viva:

| Plantilla | De quién es | Por qué el agente no la encola |
|---|---|---|
| `appointment_cancelled` | del reloj de prepago (§3.2) y de la app de la profesional | La función de cancelar del agente **la encolaba**, y era eco: la paciente acababa de leer «Listo, cancelé tu cita…». Ya está retirada del archivo |
| `appointment_rescheduled` | de la app de la profesional | La de reprogramar hacía lo mismo. También retirada |
| `appointment_confirmation_request` | del cron de 26 h | El agente no pide confirmación: la paciente ya está escribiendo. Y el trigger `appointments_apagar_avisos_au` cancela la que hubiera en cola en cuanto la cita deja de estar `scheduled` |
| `appointment_confirmation_prepay` | del cron de 26 h | Igual. Al agendar con prepago, el agente pide el comprobante **con palabras**, no con plantilla |
| `request_session_payment_proof` | de la app de la profesional | El agente lo pide en la conversación |
| `request_late_payment_proof` | de `request_appointment_payment_proof`, de la profesional | Es la única que la profesional le manda a la paciente cuando decide. Del agente, nunca |
| `request_no_show_payment_proof` | de `mark_appointment_no_show` | Otro flujo |
| `appointment_cancelled_payment_proof` · `appointment_rescheduled_payment_proof` | de `cancel_appointment` / `reschedule_appointment`, de la profesional | Otro flujo |
| los tres `appointment_reminder_1h_*` | del cron de 1 h | Otro flujo |
| `patient_welcome` · `patient_reactivation` | del alta y la reactivación | No son del agente |
| `patient_resource_delivery` · `patient_review_request` | las manda la profesional | Son las que **abren** una conversación con el agente, no las que él manda |

**La única excepción, y es una sola:** el trabajo que cancela un prepago vencido (§3.2) sí
encola `appointment_cancelled`. Ahí no hay eco posible: pasaron 24 horas, la paciente no está
en la conversación, y el silencio sería peor —se quedaría creyendo que tiene cita—.

**Cómo se encola, cuando toca.** Nunca se arma `variables` a mano: se insertan campos
semánticos (`patient_first_name`, `professional_first_name`, `starts_at`, `timezone`,
`old_starts_at` / `new_starts_at`, `meeting_url`) y el trigger `outbox_variables_bi`
—función `tg_outbox_variables_bi`, `BEFORE INSERT`— las materializa.

Ese trigger **relee `appointments.modality` sólo para cuatro plantillas**: las dos de
reprogramar y las dos de confirmación. Para ésas la cita tiene que existir y estar ya
actualizada antes del `INSERT` en la cola. `appointment_cancelled` **no** es una de ellas: sus
cuatro variables salen enteras del payload. Aun así el `INSERT` va al final, por los
disparadores que apagan la cola (§3.2).

---

## 8. Lo que falta, en orden

**Nada de esto está aplicado sobre la base**, así que «escrito» quiere decir «el texto existe
en un archivo de `supabase/migrations/` que nadie ha corrido». Estado verificado el 26 de
agosto de 2026 a las 16:12; los archivos se están editando, así que este renglón se
reverifica antes de repartir trabajo. **No se citan números de línea a propósito**: cambian
cada media hora. Se cita la función y qué buscar dentro.

### Bloquea todo

| # | Qué | Dónde | Estado |
|---|---|---|---|
| 1 | Sembrar una fila en `private.agent_token_key_registry` con `can_issue = true` y `verify_until` más allá de los 15 minutos del identificador | dato, no código | **0 filas.** Sin esto, toda lectura que emita identificadores aborta antes de devolver nada |
| 2 | Aplicar las migraciones | — | 13 archivos escritos, cero aplicados |

### Ya escrito, sólo falta aplicar

| # | Qué | Dónde |
|---|---|---|
| 3 | `GRANT SELECT` y `GRANT DELETE` sobre `public.payment_proofs` | `20260825000000_agent_dominio_fundamento.sql` |
| 4 | El cerrojo `APPOINTMENT_HAS_MONEY`, tras cargar el pago y antes de tocar la cita | `agent_cancel_appointment_from_workflow` → §2 |
| 5 | Reprogramar partido en dos: a tiempo arrastra, tarde congela | `agent_reschedule_appointment_from_workflow` → §1.7 |
| 6 | Reprogramar a tiempo: la petición viaja siempre y el comprobante se mueve | la misma → §1.6 |
| 7 | Sin `INSERT INTO public.whatsapp_outbox` en cancelar ni en reprogramar | la misma y su hermana → §7 |
| 8 | `public.cron_prepay_autocancel` y su `cron.schedule` cada cinco minutos | `20260826005000_agente_prepago_24h.sql` → §3.2 |
| 9 | Los tres campos bancarios del perfil y sus dos funciones | `20260826001000_agente_datos_de_pago.sql` → §3.1 |
| 10 | `agent_carry_payment_forward_from_workflow` | `20260826004000_agente_pasar_el_pago.sql` → §4 |
| 11 | `carry_payment_forward` en el catálogo del portero | `20260826000000_agente_portero_conversacional.sql` |
| 12 | El colapso por `COALESCE(series_id, id)` en la lista, en el conteo y en el ciclo | `agent_list_upcoming_appointments_from_workflow` → §4.1 |
| 13 | Los avisos 1, 2, 3 y 6 con sus claves correctas | crear, confirmar, cancelar y comprobante → §6.4 |

### Todavía por escribir

| # | Qué | Dónde | Bloquea a |
|---|---|---|---|
| 14 | Sellar `proof_requested_at` + `method='transfer'` en el `INSERT INTO public.payments` de crear, conservando `v_payment_status` | `agent_create_appointment_from_workflow` | §3.1 |
| 15 | `AND NOT v_prepay` en `v_born_confirmed` | la misma | §3.3 |
| 16 | Confirmar la cita al pegar el comprobante | `agent_attach_payment_proof_from_workflow` | §3.3 |
| 17 | Los avisos 4 y 5: `previous_starts_at` / `previous_modality` / `new_starts_at` / `new_modality` en reprogramar, y renombrar `old_modality` → `previous_modality` en modalidad | las dos mutaciones | §6.4. **Hoy siguen en blanco** |
| 18 | Los cinco campos nuevos por cita en la lista: `change_policy_result`, `notice_hours`, `has_money`, `is_chargeable`, `can_carry_payment` | `agent_list_upcoming_appointments_from_workflow` | §5.3. **Sin esto los avisos previos no se pueden dar** |
| 19 | La ruta `/tools/payments/carry-forward` en `FUTURE_AGENT_ROUTES` y en `DOMAIN_ROUTES`, con su `parse` de un solo identificador | `supabase/functions/agent_tool_gateway/handler.ts` | §4. Hoy no aparece ni una vez |
| 20 | Un juego de datos sembrado en rama: dos series, una cita suelta del mismo servicio, un comprobante y un prepago | `supabase/tests/` | **todo lo probable** |

---

## 9. Los límites conocidos, sin maquillaje

1. **Nada de esto se puede probar contra producción.** Cero series, cero comprobantes en toda
   la historia, cero citas futuras vivas, cero decisiones abiertas, cero identificadores
   emitidos y cero mutaciones del agente. Se siembra en una rama o se escribe a ciegas.
2. **La paciente nunca sabe qué decidió la profesional.** De las tres funciones que resuelven,
   sólo «pedir comprobante» le manda algo. Cobrar en efectivo la deja callada y sin saber
   cuánto ni cómo pagar —y además **apaga** los avisos de comprobante que quedaban en cola—;
   condonar es mudo. Con R-E esto duele menos en un lado y más en el otro: se le dijo que se
   cobra, así que la mudez de «cobrar» ya no la deja en el aire, pero la de «condonar» sí le
   quita una buena noticia.
3. **La decisión tardía es difícil de encontrar en la app.** No aparece en Cobros
   (`late_ok=false`), no pinta punto en el calendario (`get_days_with_appointments` filtra
   `scheduled`) y el aviso se borra solo. La única forma es tocar la tarjeta del día. El
   dueño decidió no arreglarlo esta ronda.
4. **La app no conoce dos tipos de aviso que hacen falta:** «tienes una decisión de cobro
   pendiente» y «el reloj canceló un prepago». `notifications.type` es texto libre, así que
   los dos se pueden insertar sin migrar nada, pero el renderizador los pinta en blanco.
   El de la decisión se acepta así. El del prepago sigue abierto: la alternativa es reusar
   `appointment_cancelled_by_patient`, que pinta pero dice que canceló la paciente (§3.2).
5. **Condonar un prepago escribe `forgiven`, no `carried_forward`.** El valor está fijo en el
   código de `waive_appointment_payment`, sin parámetro. El dinero entró de verdad y el
   registro dice que no se cobró. Es decisión de producto, no arreglo barato.
6. **El agente va a producir decisiones tardías y las va a producir todas.** Hoy no las
   produce nadie: `late_change_decision = 'pending'` no la escribe ninguna función desplegada
   —`reschedule_appointment` ni siquiera nombra esa columna— y las dos únicas filas de
   producción que la traen ya están resueltas. Por eso el punto 3 no molesta todavía. Deja de
   ser cierto el día que esto se despliegue.
