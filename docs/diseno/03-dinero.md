# 03 — Modelo de dinero y políticas

Esto no describe el sistema: dice qué hay que escribir. Cada celda de cada tabla
corresponde a líneas de una migración concreta. Lo que no está aquí, no se hace.

Substrato: `docs/hallazgos-auditoria-agente.md`. Todo lo que se cita de la base
está verificado contra `ssyzfeadyrczlzjbvxyl` el 2026-08-25/26.

---

## 0. Las cinco reglas que mandan sobre todo lo demás

1. **Una cita con dinero adentro no se cancela.** Se ofrece moverla. (La
   decisión del dueño dice «moverla **o** trasladar el pago a la próxima cita».
   Lo segundo no se puede armar con este esquema: §6, decisión pendiente #6.)
2. **Al mover, el dinero siempre viaja con la paciente.** Comprobante incluido.
3. **Un comprobante recibido queda pendiente de revisión.** El agente nunca dice
   «pagado» ni «aprobado». Acreditar, condonar y cobrar son del profesional.
4. **En prepago la cita nace sin confirmar**, el comprobante se pide al agendar,
   y si no llega, un trabajo la cancela.
5. **Ningún texto que ve la paciente lleva un número de horas escrito a mano.**
   Sale siempre de la fila de políticas de su profesional.

### Vocabulario: «hay dinero adentro»

Es una condición sobre dos tablas, y es la misma en todas partes:

```sql
p.status = 'credited'
OR EXISTS (SELECT 1 FROM public.payment_proofs pp WHERE pp.payment_id = p.id)
```

Una petición sellada sin archivo (`proof_requested_at IS NOT NULL` y cero filas
en `payment_proofs`) **no** cuenta. Se pidió el dinero, no llegó: no hay nada
que cuidar.

### Los cinco estados en que el agente puede encontrar un pago

`payments_appointment_id_key UNIQUE (appointment_id)` garantiza **como mucho** un
pago por cita; que haya exactamente uno lo garantiza la costumbre: toda función
que crea una cita crea su pago en la misma transacción. Sobre una cita
`scheduled` ese pago sólo puede estar en uno de estos cinco estados:

| # | Estado | Columnas | Qué significa |
|---|---|---|---|
| **A** | Gratis | `status='not_applicable'`, `amount=0` | No hay dinero. Nunca lo habrá. |
| **B** | Pendiente limpio | `status='pending'`, `proof_requested_at IS NULL`, sin comprobante | Se cobra después y todavía no se ha movido nada. |
| **C** | Comprobante pedido | `status='pending'`, `proof_requested_at IS NOT NULL`, sin comprobante | Se le pidió y no ha llegado. **No es dinero adentro.** |
| **D** | Comprobante recibido | `status='pending'`, 1 fila en `payment_proofs` | **Dinero adentro.** En revisión del profesional. |
| **E** | Acreditado | `status='credited'` | **Dinero adentro.** El profesional ya lo dio por cobrado. |

`waived` no aparece **mientras la cita sigue en pie**: los tres resolutores del
profesional exigen que la cita esté `cancelled` o `rescheduled`, así que una cita
`scheduled` nunca llega ahí. Sí aparece en cuanto la cita se cierra —al cancelar
a tiempo (§1.3), al mover (§1.4) o al vencer el prepago (§5.3)— y por eso la
operación de recibir comprobante, que es la única que sigue viva sobre citas
cerradas, tiene una sexta fila (§1.5).

---

## 1. La matriz definitiva

Vista compacta. `→` significa «no se ejecuta; se ofrece esto otro».

| Acción \ Pago | **A** gratis | **B** pendiente limpio | **C** comprobante pedido | **D** comprobante recibido | **E** acreditado |
|---|---|---|---|---|---|
| **Agendar** | pago `not_applicable` | pago `pending/after` | *(prepago: nace aquí)* | — | — |
| **Confirmar** | sella `confirmed_at` | sella `confirmed_at` | sella `confirmed_at` | sella `confirmed_at` | sella `confirmed_at` |
| **Cancelar a tiempo** | cancela, pago intacto | condona | condona | **→ mover** | **→ mover** |
| **Cancelar tarde** | cancela, pago intacto | abre decisión | abre decisión | **→ mover** | **→ mover** |
| **Reprogramar** | mueve, nada viaja | el dinero viaja | la petición viaja | comprobante y dinero viajan | el acreditado viaja |
| **Mandar comprobante** | rechaza: nada que pagar | acepta | acepta | rechaza: ya hay uno | rechaza: ya está cobrada |

Las cinco columnas son los estados posibles sobre una cita **en pie**. Mandar
comprobante es la única fila que también corre sobre citas cerradas, y ahí
aparece un sexto estado, `waived`, que la tabla no puede mostrar: está en §1.5.

Y ahora celda por celda.

### 1.1 Agendar

Entra por el formulario de WhatsApp (`flow_create_appointment`), no por
conversación. Función: `public.agent_create_appointment_from_workflow`.

El `charge_timing` del pago es **una foto de la política en el momento de
agendar**, no una lectura viva; es exactamente lo que hace `create_appointment`
del profesional, y hay que copiarlo.

| Precio y política | Dinero | Cita | Aviso al profesional |
|---|---|---|---|
| `agreed_price = 0` | pago `not_applicable`, `amount=0`, `method=NULL`, `resolved_at=NULL` | `scheduled`, `origin='patient'`, **sin confirmar** | `appointment_created_by_patient` |
| `charge_timing='after'` | pago `pending`, `charge_reason='session'`, `charge_timing='after'` | idem | idem |
| `charge_timing='before'` y precio > 0 | pago `pending`, `charge_reason='session'`, `charge_timing='before'`, **`proof_requested_at=now()`**, **`method='transfer'`** | idem | idem |

Dos cosas que se sellan siempre, sin ramas, y dos que dejan de escribirse:

```sql
-- La cita del agente NUNCA nace confirmada. Se borra la variable
-- v_born_confirmed del borrador y sus dos ramas, y con ellas las dos
-- columnas: no se escriben en NULL, se omiten del INSERT.
is_editable = true,
origin      = 'patient'::public.appointment_origin
```

**Y salen del permiso.** `20260825000000` concede hoy
`GRANT INSERT (…, confirmed_at, confirmation_source, …) ON public.appointments`.
Con `v_born_confirmed` borrado nadie las escribe al crear, así que se quitan de
esa lista. Siguen en el `GRANT UPDATE`, que es lo que necesitan confirmar (§1.2)
y cancelar (§1.3). La regla deja de depender de la disciplina de quien escriba la
función y pasa a ser un permiso que no existe.

Por qué. La cita que nace confirmada es saltada para siempre por
`cron_appointment_confirmation_26h`, que filtra `AND a.confirmed_at IS NULL`.
En prepago eso significa que nadie le pide nunca el comprobante. Y de paso
desaparece el problema de la app: `chk_appointment_confirmed_not_editable`
volvía no editable una cita que el profesional no reconocía.

El único valor de `appointment_confirmation_source` que el agente escribe es
`patient_response`, y sólo al confirmar. `patient_booking` queda sin uso — y con
él queda sin uso `chk_appointment_patient_booking_origin`, que es la restricción
que exige `confirmed_at = created_at` y `starts_at <= created_at + 48 h`: la
ventana de 48 h del borrador salía de ahí.

`is_editable = true` no dura para siempre: `cron_appointment_confirmation_26h`
lo pone en `false` 26 h antes de la sesión, para todas las citas, sean de quien
sean. Es el comportamiento de hoy y no se toca.

**No se encola ninguna plantilla de WhatsApp.** Ni aquí ni en ninguna otra
operación. Ver §9.

### 1.2 Confirmar

Función: `public.agent_confirm_appointment_from_workflow`.

**Confirmar no toca el dinero. Nunca. En ningún estado.** Es un acto de
asistencia, no de pago.

```sql
UPDATE public.appointments
   SET confirmed_at        = v_now,
       confirmation_source = 'patient_response'::public.appointment_confirmation_source,
       is_editable         = false,
       updated_at          = v_now
 WHERE id = v_appointment.id
   AND status = 'scheduled'::public.appointment_status
   AND confirmed_at IS NULL;
```

Consecuencia que la paciente tiene que oír en prepago: **confirmar no salva la
cita**. Lo único que la salva es el comprobante. Si confirma y no manda nada, el
trabajo de §5 la cancela igual. Y confirmar la saca de
`cron_appointment_confirmation_26h`, que filtra `AND a.confirmed_at IS NULL`:
después de confirmar, el único aviso que le queda es el que el agente ya le dio
en el chat. En prepago eso no cambia nada —el plazo de 24 h vence antes de que el
cron de 26 h llegue— pero explica por qué el mensaje del agente al agendar tiene
que llevar el vencimiento escrito.

Aviso: `appointment_confirmed`.

### 1.3 Cancelar

Función: `public.agent_cancel_appointment_from_workflow`. Es la única operación
del agente que cierra una cita sin abrir otra, y por eso es donde vive el
cerrojo (§2).

| Pago | A tiempo (`on_time`) | Tarde (`late`) |
|---|---|---|
| **A** gratis | cita `cancelled`; **el pago no se toca** | cita `cancelled`; **el pago no se toca** |
| **B** pendiente limpio | `waived/forgiven` + `charge_reason='cancellation'` | `late_change_decision='pending'` + `charge_reason='cancellation'` |
| **C** comprobante pedido | igual que B (el trigger cancela la petición en cola) | igual que B |
| **D** comprobante recibido | **CERROJO** | **CERROJO** |
| **E** acreditado | **CERROJO** | **CERROJO** |

El efecto sobre la cita es el mismo en las tres filas que sí ejecutan:

```sql
UPDATE public.appointments
   SET status                   = 'cancelled'::public.appointment_status,
       is_editable              = false,
       confirmed_at             = NULL,
       confirmation_source      = NULL,
       cancelled_rescheduled_at = v_now,          -- obligatorio, ver §3
       cancel_reschedule_actor  = 'patient'::public.actor_type,
       change_policy_result     = v_policy_result,
       updated_at               = v_now
 WHERE id = v_appointment.id
   AND status = 'scheduled'::public.appointment_status;
```

Y el pago, en la rama a tiempo (celdas **B** y **C**):

```sql
UPDATE public.payments
   SET status        = 'waived'::public.payment_status,
       waive_reason  = 'forgiven'::public.waive_reason,
       charge_reason = 'cancellation'::public.charge_reason,
       resolved_at   = v_now,                     -- obligatorio, ver abajo
       updated_at    = v_now
 WHERE id = v_payment.id
   AND status = 'pending'::public.payment_status;
```

`resolved_at` no es opcional: `chk_payment_resolved_at` dice
`(status IN ('credited','waived')) = (resolved_at IS NOT NULL)`, así que un
`waived` sin fecha revienta el `UPDATE`. Y `chk_payment_waive_reason` exige
`waive_reason` por el mismo motivo. Los dos se sellan en el mismo `UPDATE` o no
se sella ninguno.

La celda **A** (gratis) merece una frase: `not_applicable` no entra en ninguno
de los tres resolutores del profesional (`waive` y `credit` exigen `pending` o
`credited`). Si el agente le escribiera `late_change_decision='pending'`,
`get_appointment_detail` la marcaría `v_inconsistent := true` —la rama
`ELSIF v_pay.late_change_decision = 'pending' THEN v_inconsistent := true`, la
que recoge todo lo que no es `pending` ni `credited`— y el profesional vería una
tarjeta «Revisar» sin un solo botón. Por eso: **si el pago es `not_applicable`,
no se escribe ni una columna del pago.**

**Una corrección sobre el borrador.** Hoy abre la decisión tardía cuando
`v_payment.status IN ('pending','credited')`. **Se quita `'credited'`.** Con el
cerrojo puesto, un pago acreditado no llega nunca a esta función; dejar la rama
escrita es una segunda puerta al mismo error que §2 cierra. La condición queda
como la de §3.1: `status = 'pending'`, y nada más.

Lo que ve el profesional en la rama a tiempo, verificado en
`get_appointment_detail`: `resolution_mode='resolved'`, `badge='not_charged'`,
`action_mode='none'`. Una tarjeta cerrada que dice «No cobrada» y no le pide
nada. Es correcto: no hay nada que decidir.

Aviso al profesional: `appointment_cancelled_by_patient`.

### 1.4 Reprogramar

Función: `public.agent_reschedule_appointment_from_workflow`. Cierra la vieja
como `rescheduled` y crea la nueva con `rescheduled_from_appointment_id`, en una
sola transacción y una sola mutación. Copia exacta del modo `carry` de
`reschedule_appointment` del profesional, con **una corrección**.

| Pago viejo | Pago viejo queda | Pago nuevo nace |
|---|---|---|
| **A** gratis | `not_applicable`, sin tocar | `not_applicable`, `amount=0` |
| **B** pendiente limpio | `waived/carried_forward`, `resolved_at=now()` | `pending`, `charge_reason='session'`, mismo `amount`, mismo `charge_timing` |
| **C** comprobante pedido | igual | igual, **más `proof_requested_at` y `method='transfer'`** ← la corrección |
| **D** comprobante recibido | igual | igual, **más la fila de `payment_proofs` copiada** |
| **E** acreditado | igual | `credited`, mismo `method`, `resolved_at=now()` |

**El orden importa y es fácil de romper.** El pago viejo se lee entero a un
registro (`v_old_payment`) **con `FOR UPDATE`** —es el cuarto escritor que se
pelea por el mismo dinero, junto con cancelar (§2.1), adjuntar (§1.5) y vencer
(§5.3), y sin el candado un comprobante que llegue a mitad de la maniobra se
queda en el pago viejo, que acaba `waived`— y **antes** de pasarlo a
`waived/carried_forward`. El
pago nuevo copia `status`, `method`, `amount` y `proof_requested_at` de esa foto,
no de la fila ya escrita; si se leyera después, la cita nueva nacería con un pago
`waived` y el dinero desaparecería en el mismo movimiento que debía trasladarlo.
Es exactamente lo que hace el modo `carry` del profesional.

La cita nueva nace igual que la del formulario: sin `confirmed_at` ni
`confirmation_source` —no se escriben—, `is_editable = true`,
`origin = 'patient'`, y `rescheduled_from_appointment_id` apuntando a la vieja.
(La función del profesional la crea con `is_editable = false` y heredando
`v_old.origin`; el agente no copia ninguna de las dos cosas.)

**Y con el mismo `agreed_price` de la vieja**, como hace el modo `carry` del
profesional. No es cosmético: el pago nuevo copia `v_old_payment.amount`, y
`get_appointment_detail` abre con
`v_inconsistent := v_pay.amount IS DISTINCT FROM a.agreed_price`. Un precio de
servicio que cambió entre una cita y otra dejaría al profesional una tarjeta
«Revisar» sin un solo botón sobre una cita perfectamente sana. Mover no
renegocia el precio.

**El pago viejo NO reclasifica `charge_reason`.** Se queda en `session` y eso es
correcto: el dinero no se quedó ahí, se fue. La tarjeta cerrada lo dice sola —
`get_appointment_detail` pinta `badge='payment_in_new_appointment'` cuando ve
`waived` + `carried_forward`.

**La corrección (celda C).** `reschedule_appointment` del profesional copia
`proof_requested_at` sólo `WHEN v_old_has_proof`. Una petición sin archivo se
pierde, y `tg_payments_apagar_cobro` mata el aviso en cola. En el mundo del
agente eso rompe el prepago: agenda, se le pide el comprobante, mueve la cita
antes de mandarlo, y la cita nueva queda sin petición y sin vencimiento. La
función del agente copia `proof_requested_at` **siempre que el pago viejo lo
tenga**, con archivo o sin él:

```sql
INSERT INTO public.payments (
  appointment_id, professional_id, amount, status, method,
  charge_reason, charge_timing, proof_requested_at, resolved_at
) VALUES (
  v_new_appointment_id, v_turn.professional_id, v_old_payment.amount,
  v_old_payment.status, v_old_payment.method,
  'session'::public.charge_reason, v_old_payment.charge_timing,
  v_old_payment.proof_requested_at,      -- <- sin el CASE WHEN v_old_has_proof
  CASE WHEN v_old_payment.status = 'credited'::public.payment_status
       THEN v_now END
);
```

`chk_payment_proof_requested_transfer` queda satisfecho porque `method` viaja del
pago viejo, donde ya era `'transfer'`.

**El reloj del prepago no se reinicia al mover.** El vencimiento cuelga de
`proof_requested_at`, que viaja tal cual. Mover no compra tiempo.

Aviso: `appointment_rescheduled_by_patient`.

### 1.5 Mandar comprobante

Función: `public.agent_attach_payment_proof_from_workflow`, superficie **`agent_node`**
—hoy el portero sólo la autoriza en `media_adapter`, que es una superficie que nadie ocupa;
quien decide que una imagen es un comprobante es el agente, y el agente vive en `agent_node`
(`02-herramientas.md` §5.2, cambio 2)—. El archivo no lo escribe el modelo: lo baja y lo
guarda `kapso_inbound_webhook` al admitir el mensaje, y el gateway lo recupera por el
`provider_message_id`.

Es la **única** operación del agente que sigue viva sobre una cita ya cerrada, y
por eso su matriz tiene seis filas, no cinco: aquí sí se puede encontrar un pago
`waived`.

| Pago | Qué hace |
|---|---|
| **A** gratis | Rechaza. «Esa cita no tiene costo.» |
| **B** pendiente limpio | Acepta |
| **C** comprobante pedido | Acepta |
| **D** ya hay comprobante | Rechaza. «Ya recibí uno.» |
| **E** acreditado | Rechaza. «Esa ya quedó cobrada.» |
| **F** condonado (`waived`) | Rechaza, con la respuesta de abajo |

La fila **F** es la que no puede quedar en silencio. Se llega a ella por tres
caminos, y el tercero es el que duele: canceló a tiempo (§1.3), movió la cita
(§1.4, el pago viejo queda `carried_forward` y el bueno es el de la cita nueva),
o **se le venció el prepago y el trabajo de §5.3 canceló la cita**. Ese tercer
caso es una paciente que ya hizo la transferencia y tardó en mandar la foto:
manda el comprobante y la cita ya no existe.

> Esa cita ya se canceló porque no llegó el comprobante a tiempo, así que no
> puedo registrarlo aquí. Si ya hiciste la transferencia, mándale la foto a
> [profesional] directamente para que la revise. Y si quieres, te busco horario
> para una cita nueva.

Es lo único honesto que se puede decir con lo que hay: la cita está cerrada, el
pago está condonado, y ninguna función del profesional reabre un `waived`
(`waive`, `credit` y `request_proof` exigen `pending` o `credited`). **Decisión
pendiente #7**, en §10.

Aceptar es **una sola escritura de dominio**, con el pago bloqueado:

```sql
SELECT payment.*
  INTO v_payment
  FROM public.payments AS payment
 WHERE payment.appointment_id = v_appointment.id
 FOR UPDATE;                       -- el mismo candado que usan §2.1 y §5.3

INSERT INTO public.payment_proofs
  (payment_id, storage_object_path, mime_type, size_bytes, checksum)
VALUES (v_payment.id, v_path, v_mime, v_size, v_checksum);

INSERT INTO public.payment_events
  (payment_id, event_type, from_status, to_status, actor, command_id, metadata)
VALUES (v_payment.id, 'proof_attached',
        'pending'::public.payment_status, 'pending'::public.payment_status,
        'patient'::public.actor_type, v_command_id,
        pg_catalog.jsonb_build_object('surface', 'agent'));
```

`payment_events.event_type` es `text` sin `CHECK`: el vocabulario es una
costumbre, no una restricción. Lo desplegado usa seis nombres —`payment_credited`,
`payment_waived`, `proof_requested`, `charge_retained`, `carried_forward`,
`late_decision_resolved`—. El agente añade dos: `proof_attached` aquí y
`late_change_pending` en §3.2. Son deliberados y no rompen nada; lo que no se
vale es inventar un séptimo para lo mismo que ya tiene nombre.

El `FOR UPDATE` necesita el `GRANT UPDATE` sobre `payments` —Postgres lo exige
para bloquear una fila, aunque no se escriba—, y ya está concedido a nivel de
columna en `20260825000000`, que lo dice con todas sus letras: «este UPDATE
habilita el FOR UPDATE sobre payments». No se recorte ese permiso.

**Aun así, el agente no escribe ni una columna de `payments`.** No sella
`proof_requested_at`, no fuerza `method`, no cambia `status`. Motivo: el pago
sigue pendiente de revisión, y `credit_appointment_payment` ya fuerza
`method='transfer'` por su cuenta cuando ve un comprobante. El trigger
`tg_payment_proofs_degradar_prepago_ai` degrada solo la plantilla de prepago que
estuviera en cola.

**El caso que no se puede olvidar:** una cita ya `cancelled` o `rescheduled`
sigue aceptando comprobante si el profesional pidió uno al resolver una decisión
tardía (`request_appointment_payment_proof` dejó `status='pending'` y
`proof_requested_at` sellado, y mandó `request_late_payment_proof`). La
operación no filtra por estado de la cita: filtra por estado del pago.

Aviso: `payment_proof_received`, **sin monto** (§8.3).

### 1.6 Lo que hay que borrar

`cancel_then_open_booking_flow` es, según la auditoría, la única ruta del sistema
por la que el dinero de una paciente se evapora: cancela, crea una cita nueva con
un pago limpio, y el dinero viejo se queda atrás. Reprogramar hace lo mismo y
además traslada el dinero.

**Se borra la operación y con ella toda la maquinaria de saga**: `saga_state` con
sus cuatro valores, `mutation_limit` variable, la reserva del ordinal 8 y el
guardia `tool_call_count > 3`. Consecuencia directa:
`flow_create_appointment` deja de exigir
`saga_state='awaiting_replacement_create' AND mutation_limit=2 AND
committed_mutation_count=1`, que es lo que hoy hace que agendar normal se
rechace con `MUTATION_BLOCKED`.

**Son dos funciones, no una.** `private.agent_claim_tool_call` es la que lee la
maquinaria; `private.agent_finalize_tool_call` es la que la escribe, y el
borrador no la nombra. En su cuerpo desplegado:

```sql
saga_state = CASE
  WHEN p_outcome = 'unknown' THEN 'unknown_blocked'
  ...
  WHEN v_claim.surface = 'flow_data_exchange'
    AND v_claim.operation = 'flow_create_appointment'
  THEN 'awaiting_replacement_create'
  ELSE turn_row.saga_state
END
```

Esa última rama no tiene condición: **cualquier** `flow_create_appointment` que
se finalice deja el turno en `awaiting_replacement_create`. Y con el turno ahí,
el `claim` rechaza con `MUTATION_BLOCKED` toda mutación que no sea otra creación
por formulario, y baja el presupuesto de 8 a 7 llamadas. O sea: si sólo se toca
el `claim`, agendar por formulario deja de rechazarse **y a cambio envenena el
resto del turno**. Las dos funciones se migran juntas o no se migra ninguna.

Con `saga_state` fuera, el guardia `v_turn.saga_state = 'cancel_claimed'` del
`claim` también desaparece — y con él la duda de si un rechazo del cerrojo
bloquea el turno. Verificado: `cancel_claimed` sólo lo escribía
`cancel_then_open_booking_flow`; `cancel_appointment` a secas nunca lo tocó.

---

## 2. El cerrojo central

### 2.1 La condición, en columnas reales

Dentro de `public.agent_cancel_appointment_from_workflow`, **después** del
`SELECT ... FOR UPDATE` sobre `payments` y **antes** del `UPDATE` sobre
`appointments`:

```sql
SELECT payment.*
  INTO v_payment
  FROM public.payments AS payment
 WHERE payment.appointment_id = v_appointment.id
 FOR UPDATE;

SELECT EXISTS (SELECT 1
                 FROM public.payment_proofs AS proof
                WHERE proof.payment_id = v_payment.id)
  INTO v_has_proof;

IF v_payment.status = 'credited'::public.payment_status OR v_has_proof THEN
  v_reason := 'MONEY_LOCKED';
END IF;
```

Y `v_reason` ya tiene camino en el borrador: la función devuelve
`{'applied': false, 'reason': v_reason}`, no muta nada, y ella misma se finaliza
con `private.agent_finalize_tool_call(..., 'rejected_prewrite', ...)`.

Eso está verificado en el cuerpo desplegado de `agent_finalize_tool_call`:
`committed_mutation_count` sólo sube `WHEN p_outcome = 'committed'`. **La
mutación del turno no se gasta**, así que la paciente puede mover en el mismo
turno. Lo que sí se gasta es una de las ocho llamadas del presupuesto —el
ordinal se reservó en el `claim`, antes de saber que iba a rechazar—, y por eso
el rechazo no puede ser el camino normal: para eso está el reflejo de §2.2, que
evita que el modelo intente cancelar lo que se le va a negar.

El candado de fila importa, y funciona por dos razones que van juntas. Una: el
`FOR UPDATE` se toma **antes** de mirar los comprobantes, y esa mirada es una
instrucción aparte, con su propia foto —en `READ COMMITTED` cada instrucción de
la función toma una nueva—, así que ve lo que se acaba de confirmar. Dos: la
operación de adjuntar comprobante toma **ese mismo candado** antes de insertar
(§1.5), que es lo que hace que las dos se formen en fila en vez de cruzarse. Sin
la segunda, la primera no sirve de nada: insertar en `payment_proofs` no toca la
fila de `payments` y no despierta a nadie.

El mismo par de reglas es el que usa el trabajo de vencimiento del prepago
(§5.3). Son tres escrituras que se pelean por el mismo dinero —cancelar,
adjuntar y vencer— y las tres pasan por el candado del pago.

### 2.2 Dónde va el guardia

**La autoridad es la mutación.** Un solo lugar, y es el que decide.

**El reflejo va en el expediente**, que es lo único que el modelo lee antes de
elegir de qué cita habla: `public.agent_open_case_from_workflow`, la operación
`open_case` (`02-herramientas.md` §2). Cada cita del expediente lleva dos campos
que salen de la misma condición:

```sql
-- citas[].dinero_adentro
payment.status = 'credited'::public.payment_status
OR EXISTS (SELECT 1 FROM public.payment_proofs pp WHERE pp.payment_id = payment.id)
```

Cuando eso es cierto, `dinero_adentro` va en `true` y **`cancelar` desaparece de
`citas[].acciones`**. El modelo no filtra: escoge de la lista que le dieron. Es la
misma corrección que hace falta para la reseña —no ofrecer lo que se le va a
negar— y es la razón por la que el expediente entrega acciones y no datos crudos.

Y el mismo expediente trae con qué explicar sin adivinar: `pagos[].estado` con
sus tres valores (`esperando_comprobante`, `comprobante_en_revision`,
`por_cobrar`) y `citas[].cambio_a_tiempo` ya resuelto contra la política de esa
profesional.

**Lo que NO existe, para que nadie lo busque:** una capacidad `cancel_appointment`
que se pudiera apagar. `agent_get_capabilities` devuelve diez interruptores
—`schedule_appointment`, `manage_next_appointment`, `view_payment_status`,
`upload_payment_proof`, `resume_assigned_resources`, `submit_review`,
`share_professional_profile`, `list_marketplace_professionals`,
`contact_support`, `crisis_information`— y cancelar, mover y confirmar viven las
tres dentro de `manage_next_appointment`, que es **por paciente**, mientras que
el cerrojo es **por cita**: apagarla por dinero apagaría también mover, que es
justo lo que se le va a ofrecer. Ésa es una de las razones por las que esa
función se retira entera y la sustituye el expediente
(`01-arquitectura.md` §8.3).

### 2.3 Qué se le ofrece a la paciente

Respuesta fija, una sola, sin variantes:

> Esa cita ya tiene un pago registrado, así que no puedo cancelarla. Lo que sí
> puedo hacer es moverla al día y la hora que te acomoden: el pago se va contigo
> a la cita nueva, sin costo. ¿Te busco horarios?

No lleva número de horas: mover es gratis siempre (§4), así que no hay plazo que
mencionar. No promete devolución: este producto no las tiene.

Si insiste en cancelar:

> Para cancelarla con el pago de por medio tiene que verlo [profesional]
> directamente. Yo te la puedo mover cuando quieras.

### 2.4 Los dos casos de dinero muerto, muertos

**Caso 1 — cancelar a tiempo con pago acreditado.** Producía una cita
`cancelled` con el pago en `credited` / `charge_reason='session'` /
`late_change_decision=NULL`. Ninguno de los tres resolutores la toma:
`waive_appointment_payment` exige `late_change_decision='pending'`;
`credit_appointment_payment` exige `pending`, o `credited` con decisión
pendiente; `request_appointment_payment_proof` exige `status='pending'`. Y
desaparecía de Cobros, porque `get_billing_day` clasifica

```sql
earns = (a.status='attended'   AND pay.charge_reason='session')
     OR (a.status='no_show'    AND pay.charge_reason='no_show')
     OR (a.status='cancelled'  AND pay.charge_reason='cancellation')
     OR (a.status='rescheduled'AND pay.charge_reason='reschedule')
```

y `cancelled` + `session` da `earns=false`: ni acreditado ni pendiente.
`get_appointment_detail` la pintaba `resolution_mode='resolved'`, `badge='paid'`,
`action_mode='none'` — «Pagado» y ningún botón.

Con el cerrojo, `p.status='credited'` dispara el guardia. **La fila nunca nace.**

**Caso 2 — cancelar a tiempo con comprobante recibido.** Caía en la rama
`on_time + pending` y quedaba `waived/forgiven`: el traspaso ocurrió y el
registro dice «no se cobró». Además rompía la regla 3: el agente resolvía un
comprobante que le tocaba revisar al profesional.

Con el cerrojo, `EXISTS(payment_proofs)` dispara el guardia. **La fila nunca
nace.**

**Y no hay una tercera puerta.** Cancelar es la única operación del agente que
cierra una cita sin abrir otra. Reprogramar también cierra la vieja, pero deja
el pago en `waived/carried_forward` apuntando al pago nuevo, que es exactamente
lo que la tarjeta lee para decir «el pago está en la cita nueva». Eso no es
dinero muerto: es dinero mudado.

Cero funciones nuevas. Cero migraciones sobre el dominio del profesional.

---

## 3. Cancelación tardía

Es **la única forma en todo el sistema de abrir una decisión económica para el
profesional**. Ocho funciones desplegadas mencionan `late_change_decision`: la
leen o la resuelven, ninguna la pone en `'pending'`.
`cancel_appointment` y `reschedule_appointment` escriben `change_policy_result =
NULL` explícito, con el comentario «esta superficie no evalua anticipacion».

### 3.1 Cuándo se abre

Dos condiciones:

```sql
v_policy_result = 'late'                              -- avisó fuera de plazo
AND v_payment.status = 'pending'                      -- ni gratis ni acreditado
```

`late_change_decision IS NULL` no hace falta comprobarlo: sobre una cita
`scheduled` nunca puede ser otra cosa, porque los tres resolutores exigen que la
cita esté `cancelled` o `rescheduled`. Va únicamente en el `WHERE` del `UPDATE`,
como candado de concurrencia, no en la lista de condiciones.

`v_policy_result` sale de la política, sin redondear:

```sql
v_policy_result := CASE
  WHEN v_appointment.starts_at - v_now
       >= pg_catalog.make_interval(mins => v_policy.free_change_notice_minutes)
  THEN 'on_time'::public.change_policy_result
  ELSE 'late'::public.change_policy_result
END;
```

`status='credited'` no puede llegar aquí: lo para el cerrojo. `not_applicable`
se excluye a mano, porque una decisión abierta sobre un pago que no es `pending`
ni `credited` hace que `get_appointment_detail` marque `v_inconsistent := true`
y el profesional reciba una tarjeta «Revisar» sin botones.

### 3.2 Qué sella el agente, exactamente

Dos `UPDATE` y un evento. Nada más.

```sql
-- 1) La cita. cancelled_rescheduled_at es obligatorio: sin él la app no puede
--    calcular con cuánta anticipación avisó.
UPDATE public.appointments
   SET status                   = 'cancelled'::public.appointment_status,
       is_editable              = false,
       confirmed_at             = NULL,
       confirmation_source      = NULL,
       cancelled_rescheduled_at = v_now,
       cancel_reschedule_actor  = 'patient'::public.actor_type,
       change_policy_result     = 'late'::public.change_policy_result,
       updated_at               = v_now
 WHERE id = v_appointment.id
   AND status = 'scheduled'::public.appointment_status;

-- 2) El pago. La reclasificacion NO es cosmetica: ver 3.4.
UPDATE public.payments
   SET charge_reason        = 'cancellation'::public.charge_reason,
       late_change_decision = 'pending'::public.late_change_decision,
       updated_at           = v_now
 WHERE id = v_payment.id
   AND status = 'pending'::public.payment_status
   AND late_change_decision IS NULL;

-- 3) La huella.
INSERT INTO public.payment_events
      (payment_id, event_type, from_status, to_status, actor, command_id, metadata)
VALUES (v_payment.id, 'late_change_pending',
        'pending'::public.payment_status, 'pending'::public.payment_status,
        'patient'::public.actor_type, v_command_id,
        pg_catalog.jsonb_build_object(
          'surface', 'agent',
          'change_policy_result', 'late'));
```

`late_change_decision_resolved_at` y `_resolved_by` se quedan en `NULL`:
`chk_late_decision_resolution` sólo exige la fecha cuando la decisión es
`charge` o `no_charge`.

### 3.3 Qué ve el profesional

`get_appointment_detail` resuelve, verificado en el cuerpo desplegado:

| Campo | Valor |
|---|---|
| `resolution_mode` | `late_unpaid` |
| `badge` | `decision_pending` |
| `action_mode` | `resolve_late_unpaid` |
| `change_notice` | `{hours, minutes}` = `starts_at − cancelled_rescheduled_at` |

`change_notice` tiene cuatro condiciones, todas obligatorias: la cita está
`cancelled` o `rescheduled`, el pago tiene `late_change_decision = 'pending'`,
`cancelled_rescheduled_at IS NOT NULL`, y la diferencia no es negativa. Las dos
primeras las cumple esta operación por construcción; la tercera la tiene que
poner el agente. Si la dejara nula, el profesional vería la decisión sin saber
con cuánto tiempo avisó. Y si la diferencia saliera negativa —cancelar una cita
que ya empezó— la tarjeta entera se degrada a «Revisar» sin botones.

### 3.4 Con qué botón la cierra

Dos botones. `action_mode='resolve_late_unpaid'` mapea a dos funciones, y
mientras la decisión siga abierta la tercera no tiene botón (los modos
`mark_paid` y `mark_paid_or_request_proof` sólo aparecen cuando
`late_change_decision` ya no es `pending`).

| Botón | Función | Deja el pago en | En Cobros |
|---|---|---|---|
| **Cobrar** | `credit_appointment_payment(p_appointment_id, p_method, p_command_id)` | `credited`, `late_change_decision='charge'` | aparece como **acreditado** |
| **No cobrar** | `waive_appointment_payment(p_appointment_id, p_command_id)` | `waived/forgiven`, `late_change_decision='no_charge'` | no aparece, y está bien |

Una consecuencia del orden de los parámetros: `p_method` va **en medio**, y no
es opcional cuando el pago está `pending` (`PAYMENT_METHOD_REQUIRED`). Y si la
cancelación tardía cayó sobre un pago del estado **C** —prepago, con
`proof_requested_at` sellado—, `credit_appointment_payment` sólo admite
`'transfer'`: cualquier otro método muere con `INVALID_PAYMENT_ACTION`. O sea:
en prepago, [Cobrar] no ofrece efectivo. Es comportamiento de la app, no del
agente, pero el agente es quien va a empezar a producir esos casos.

**Por qué reclasificar `charge_reason` en el paso 2 es obligatorio.**
`credit_appointment_payment`, en su rama `status='pending' → 'credited'`, **no
toca `charge_reason`**. Sólo la rama `credited + decisión pendiente` reclasifica.
Si el agente hubiera dejado `'session'` sobre una cita `cancelled`, el profesional
tocaría [Cobrar], la fila quedaría `credited` / `session` / `cancelled`, y
`earns` daría `false`: **el dinero que acaba de cobrar no aparecería en Cobros.**
Es el Caso 1 de dinero muerto, entrando por la puerta de atrás.

`waive_appointment_payment` y `request_appointment_payment_proof` sí reclasifican
solas, pero eso no salva nada: basta que el profesional elija [Cobrar].

**El otro efecto de `late_ok`.** Mientras la decisión sigue abierta,
`get_billing_day` la excluye deliberadamente de las dos sumas:

```sql
late_ok = pay.late_change_decision IS NULL
       OR (a.status IN ('cancelled','rescheduled') AND pay.late_change_decision='charge')
```

Así que el monto no está en el total pendiente hasta que el profesional decida.
Eso es correcto, y también es lo que hace que la decisión sea difícil de
encontrar. Hoy es inofensivo porque nadie las produce. **El agente es lo que va
a empezar a producirlas, y va a producirlas todas.** No se arregla en esta ronda
—la app es intocable— pero queda dicho: ver §10.

### 3.5 Qué se le dice a la paciente

El agente **no promete nada sobre el cobro** y **no promete que le avisarán**:
ninguna función notifica a la paciente cuando el profesional resuelve.

> Listo, tu cita del jueves 27 quedó cancelada. Como avisaste con menos de
> {plazo}, [profesional] decide si te cobra esa sesión.

`{plazo}` sale de `free_change_notice_minutes` (§7). El texto se arma desde lo
que devolvió la función (`change_policy_result`, `starts_at_local`), nunca desde
lo que el modelo cree haber hecho.

---

## 4. El cargo por cambio tardío al reprogramar

### 4.1 Veredicto: estructuralmente imposible

No es que falte una función. Es que el esquema no tiene dónde ponerlo.

1. **Con traslado, el pago viejo queda `waived/carried_forward`.** Los tres
   resolutores exigen `pending` (`request_appointment_payment_proof`), o
   `pending|credited` (`waive_appointment_payment`), o `pending` / `credited +
   decisión pendiente` (`credit_appointment_payment`). `waived` no entra en
   ninguno.
2. **El pago nuevo vive en una cita `scheduled`.** `waive` y
   `request_proof` exigen `cancelled|rescheduled` con
   `INVALID_PAYMENT_STATE`; `credit` exige lo mismo para resolver una decisión
   tardía.
3. **`payments_appointment_id_key UNIQUE (appointment_id)`** impide un segundo
   renglón de cobro sobre la misma cita. No hay dónde escribir «comisión».
4. **Lo único que existe es `reschedule_appointment(p_mode='charge_old')`**, y
   cobra **la sesión vieja completa** además de la nueva: dos sesiones, no una
   comisión. Y sólo lo puede decidir el profesional, en el mismo acto de
   reprogramar, que es una superficie que la paciente no toca.

### 4.2 Recomendación: mover es siempre gratis

Cero código. La función del agente:

- **no** escribe `late_change_decision` al reprogramar, en ningún caso;
- **sí** sella `change_policy_result` (`on_time` / `late`) en la cita vieja, como
  hecho histórico. Hoy no alimenta nada, pero es el único registro de si avisó a
  tiempo, y es una columna que ya existe.

### 4.3 Consecuencias para los textos que ve la paciente

Cuatro reglas, y son duras:

1. **Al mover, nunca se menciona un plazo.** Ni «avisa con 24 horas», ni «si
   mueves tarde te pueden cobrar». Mover no cuesta y no abre nada.
2. **Al cancelar, el plazo sí se menciona**, porque ahí sí decide si se abre el
   cobro.
3. **El mismo número significa cosas distintas según la acción.**
   `free_change_notice_minutes` decide en cancelar y no decide en mover. Los
   textos no pueden compartir plantilla.
4. **Cuando el cerrojo bloquea una cancelación, el ofrecimiento de mover va sin
   condiciones**: «sin costo, sin importar cuándo». Es cierto y es simple.

### 4.4 Si el dueño eligiera lo contrario

Dos caminos, los dos caros:

- **Renglón nuevo.** `payments.appointment_id` es `NOT NULL` y `UNIQUE`. Un
  cargo por cambio necesitaría romper esa restricción o inventar citas
  sintéticas de tipo «cargo». Las dos cosas atraviesan Cobros, el calendario y
  las tarjetas de la app del profesional, que es intocable esta ronda.
- **Reusar el pago viejo.** Dejarlo `pending` con `charge_reason='reschedule'` y
  `late_change_decision='pending'`, y que el pago nuevo nazca limpio. Entonces
  **el dinero no viaja**, que contradice la decisión 3 del dueño; y si la
  paciente ya había mandado comprobante, el comprobante se queda sobre una cita
  que no ocurrió.

**Decisión pendiente #1.** Supuesto con el que sigue todo este documento:
**mover es siempre gratis.**

---

## 5. Prepago completo

Hoy sólo Araceli tiene `charge_timing='before'`, y se salva por accidente: pide
2880 minutos de anticipación, así que sus citas caen fuera de la ventana de 48 h
del borrador y nunca nacen confirmadas. **El día que baje ese margen a 24 h, el
prepago deja de pedirse y no da ningún error.** Eso es lo que se desactiva aquí.

### 5.1 Hueco 1 — nadie pide el comprobante al agendar

`create_appointment` lo dice en su propio comentario: «NO se crea
payment_proofs … ni jobs de comprobante». La petición sólo aparecía 26 h antes
de la cita, cuando `cron_appointment_confirmation_26h` sella
`proof_requested_at=now(), method='transfer'` y manda
`appointment_confirmation_prepay`. El cascarón que debía hacerlo antes,
`cron_prepay_proof_request`, está retirado —levanta un `RAISE WARNING` y
devuelve 0— y su comentario ya dice quién debe hacerlo: «la peticion de
comprobante anticipado la hacen el agente al agendar y la confirmacion de 26 h».

**Lo que sella el agendado, dentro de `agent_create_appointment_from_workflow`:**

```sql
SELECT policy.charge_timing
  INTO v_charge_timing
  FROM public.professional_appointment_policies AS policy
 WHERE policy.professional_id = v_turn.professional_id;

INSERT INTO public.payments (
  appointment_id, professional_id, amount, status, method,
  charge_reason, charge_timing, proof_requested_at, resolved_at
) VALUES (
  v_appointment_id, v_turn.professional_id, v_agreed_price,
  CASE WHEN v_agreed_price = 0 THEN 'not_applicable'::public.payment_status
       ELSE 'pending'::public.payment_status END,
  CASE WHEN v_agreed_price > 0
        AND v_charge_timing = 'before'::public.charge_timing
       THEN 'transfer'::public.payment_method END,
  'session'::public.charge_reason,
  v_charge_timing,
  CASE WHEN v_agreed_price > 0
        AND v_charge_timing = 'before'::public.charge_timing
       THEN v_now END,
  NULL
)
RETURNING id INTO v_payment_id;

IF v_charge_timing = 'before'::public.charge_timing AND v_agreed_price > 0 THEN
  INSERT INTO public.payment_events
        (payment_id, event_type, from_status, to_status, actor, command_id, metadata)
  VALUES (v_payment_id, 'proof_requested',
          'pending'::public.payment_status, 'pending'::public.payment_status,
          'patient'::public.actor_type, v_command_id,
          pg_catalog.jsonb_build_object('surface', 'agent',
                                        'reason', 'prepay_booking'));
END IF;
```

El `method='transfer'` no es opcional: `chk_payment_proof_requested_transfer`
exige `method='transfer'` en cuanto `proof_requested_at` deja de ser nulo.

Y el agente lo pide en el chat, con su propio mensaje, dentro de la sesión
abierta. El texto lleva el vencimiento calculado, nunca un número escrito a mano.

### 5.2 Hueco 2 — la cita de prepago nacía confirmada

El borrador hace `v_born_confirmed := v_starts_at <= v_now + interval '48 hours'`
sin mirar `charge_timing`. Y `cron_appointment_confirmation_26h` filtra
`AND a.confirmed_at IS NULL`. Una cita de prepago nacida confirmada es saltada
para siempre: nadie le pide el comprobante nunca, y nadie se entera.

**Arreglo: se borra `v_born_confirmed` y sus dos ramas.** La cita del agente
nunca nace confirmada, ni en prepago ni con cobro después. Es la versión con
menos código de las dos, y arregla tres cosas de un golpe: el prepago vuelve a
pedirse, `cron_appointment_confirmation_26h` alcanza siempre a la cita, y el
profesional deja de ver «Confirmada» sin botón de Editar en una cita que no
reconoce.

**Consecuencia que hay que aceptar.** Cuando la paciente agenda para dentro de
menos de 26 h, el cron le manda la plantilla de confirmación (o la de prepago) en
los siguientes cinco minutos, encima de lo que el agente ya le dijo en el chat.

Y **no hay forma barata de quitarla**. Adelantarse ocupando el `dedup_key` del
cron (`'appointment_confirmation:' || appointment_id`) no sirve: su
`ON CONFLICT` no es un `DO NOTHING`, es un `DO UPDATE` que revive la fila
cancelada y le pisa `template_key` y `payload` mientras no haya salido. La fila
del agente se reescribe. Quitar la repetición exigiría tocar
`cron_appointment_confirmation_26h`, que es un cron del producto del profesional.

Es una repetición, no un error, y en prepago hasta ayuda: el texto aprobado de
`appointment_confirmation_prepay` vuelve a pedir la foto del comprobante, que es
justo lo que se está esperando. **Decisión pendiente #2.** Supuesto: se acepta.

### 5.3 Hueco 3 — no existe la autocancelación

`cron_prepay_proof_request` es un cascarón retirado y **no está en `cron.job`**.
Los siete trabajos activos son `cron_sweep_past_pending`, `cron_confirmation_26h`,
`cron_appointment_reminder_1h`, `purge_command_log`, `purge_whatsapp_outbox`,
`purge_whatsapp_inbound` y `sender_whatsapp`. Ninguno atiende al agente.

**No se usa `public.jobs`.** El trigger `tg_jobs_solo_recursos_bi` descarta en
silencio todo `INSERT` cuyo `type` no sea uno de los tres de recursos y limpieza,
y además **no hay ningún consumidor de `jobs` desplegado**: `claim_jobs_batch` y
`dispatch_jobs` sólo existen en `referencias/`, no en `pg_proc`. Un trabajo
puesto ahí no se ejecutaría nunca.

**El trabajo programado, completo.**

```sql
CREATE FUNCTION public.cron_agent_prepay_expiry(p_batch integer DEFAULT 200)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_c     record;
  v_count integer := 0;
BEGIN
  FOR v_c IN
    SELECT a.id            AS cita,
           a.starts_at,
           p.id            AS pago,
           pat.first_name  AS pac,
           pat.phone       AS tel,
           pro.first_name  AS pro,
           pro.timezone    AS tz
      FROM public.appointments  a
      JOIN public.payments      p   ON p.appointment_id = a.id
      JOIN public.patients      pat ON pat.id = a.patient_id
      JOIN public.professionals pro ON pro.id = a.professional_id
     WHERE a.status = 'scheduled'::public.appointment_status
       AND a.origin = 'patient'::public.appointment_origin
       AND a.starts_at > now()
       AND p.charge_timing = 'before'::public.charge_timing
       AND p.status = 'pending'::public.payment_status
       AND p.proof_requested_at IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.payment_proofs pp
                        WHERE pp.payment_id = p.id)
       AND now() >= p.proof_requested_at + interval '24 hours'
     ORDER BY a.starts_at
     LIMIT p_batch
     FOR UPDATE OF a SKIP LOCKED
  LOOP
    BEGIN
      -- 0) EL CANDADO DEL PAGO, en su propia instruccion. La seleccion de
      --    arriba bloqueo la CITA, no el pago: entre esa foto y este momento
      --    cabe un comprobante entrando por el agente. Si el agente lo esta
      --    adjuntando ahora mismo, aqui se espera a que termine, porque esa
      --    operacion toma este mismo candado (1.5).
      PERFORM 1 FROM public.payments p2 WHERE p2.id = v_c.pago FOR UPDATE;

      -- 1) EL PAGO, y es tambien el guardia. Va antes que la cita: si se
      --    cancelara primero, un comprobante que llego tarde dejaria una cita
      --    cerrada con dinero adentro, que es la forma exacta del Caso 2.
      --    El NOT EXISTS tiene que ir en una instruccion APARTE del candado:
      --    en READ COMMITTED cada instruccion toma su propia foto, y esta es
      --    la primera que puede ver el comprobante recien confirmado. Metido
      --    en el WHERE del PERFORM de arriba no serviria.
      --    La reclasificacion a 'cancellation' es obligatoria: una fila
      --    'cancelled' con charge_reason 'session' es exactamente la forma del
      --    dinero muerto verificado.
      UPDATE public.payments
         SET status        = 'waived'::public.payment_status,
             waive_reason  = 'forgiven'::public.waive_reason,
             charge_reason = 'cancellation'::public.charge_reason,
             resolved_at   = now(),
             updated_at    = now()
       WHERE id = v_c.pago
         AND status = 'pending'::public.payment_status
         AND NOT EXISTS (SELECT 1 FROM public.payment_proofs pp
                          WHERE pp.payment_id = v_c.pago);
      IF NOT FOUND THEN
        CONTINUE;              -- llego el comprobante: no es asunto del cron
      END IF;

      -- 2) La cita. 'system' porque no la cerro ni ella ni el profesional.
      --    change_policy_result se queda NULL: no hubo aviso que evaluar.
      UPDATE public.appointments
         SET status                   = 'cancelled'::public.appointment_status,
             is_editable              = false,
             confirmed_at             = NULL,
             confirmation_source      = NULL,
             cancelled_rescheduled_at = now(),
             cancel_reschedule_actor  = 'system'::public.actor_type,
             updated_at               = now()
       WHERE id = v_c.cita
         AND status = 'scheduled'::public.appointment_status;

      INSERT INTO public.payment_events
            (payment_id, event_type, from_status, to_status,
             actor, command_id, metadata)
      VALUES (v_c.pago, 'payment_waived',
              'pending'::public.payment_status, 'waived'::public.payment_status,
              'system'::public.actor_type, gen_random_uuid(),
              jsonb_build_object('reason', 'prepay_proof_expired'));

      -- 3) El aviso a la paciente, ya con los dos UPDATE hechos y sus triggers
      --    corridos: private.wa_apagar_avisos_de_cita cancelo confirmacion,
      --    prepago y recordatorios de ESTA cita. Esta fila no corre peligro en
      --    ningun orden: esa funcion solo toca cinco template_key y
      --    'appointment_cancelled' no es una de ellas.
      --    Se escriben claves SEMANTICAS. El array payload->'variables' NUNCA
      --    se arma a mano: lo materializa el trigger BEFORE INSERT
      --    outbox_variables_bi (funcion tg_outbox_variables_bi) y lo cuenta
      --    chk_outbox_variables.
      INSERT INTO public.whatsapp_outbox
            (to_phone, send_mode, template_key, payload, status,
             dedup_key, scheduled_at)
      VALUES (v_c.tel::public.e164_phone,
              'template'::public.outbox_send_mode,
              'appointment_cancelled',
              jsonb_build_object(
                'appointment_id',          v_c.cita,
                'patient_first_name',      v_c.pac,
                'professional_first_name', v_c.pro,
                'starts_at',               v_c.starts_at,
                'timezone',                v_c.tz),
              'queued'::public.outbox_status,
              'agent_prepay_expiry:' || v_c.cita::text,
              now())
      ON CONFLICT (dedup_key) DO NOTHING;

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'vencimiento de prepago fallo para la cita %: %',
                    v_c.cita, sqlerrm;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;
```

**Registro en cron**, misma cadencia que los otros tres del dominio:

```sql
SELECT cron.schedule(
  'cron_agent_prepay_expiry',
  '*/5 * * * *',
  $$select public.cron_agent_prepay_expiry(200);$$
);
```

**De quién es esta función: de `postgres`, no del agente.** Va **fuera** del
bloque `SET ROLE agenda_psi_agent_owner` de las migraciones, igual que los tres
crons desplegados. No es un detalle de estilo: siendo `SECURITY DEFINER` de
`postgres` no depende de ninguno de los GRANT del agente, y `cron.schedule` sólo
lo puede llamar `postgres` de todos modos. Este trabajo no es el agente: corre
cuando la conversación lleva horas cerrada.

**Y de ahí sale una resta.** `20260825000000` concede hoy
`GRANT INSERT (to_phone, send_mode, template_key, payload, status, dedup_key,
scheduled_at) ON public.whatsapp_outbox TO agenda_psi_agent_owner`. Con la regla
de §9 —el agente no encola ninguna plantilla, nunca— y con este cron siendo de
`postgres`, **ninguna función de dinero necesita ese permiso**. Se quita del
inventario de la familia de dinero. Si la familia de recursos lo necesita, que
lo pida ella y con su motivo escrito.

**Por qué ese `payload` y no otro.** La cola no acepta claves con nombre: el
`CHECK chk_outbox_variables` llama a `private.wa_payload_ok(template_key,
payload)`, que exige que `payload->'variables'` sea un **array de cadenas no
vacías** con el largo exacto de la plantilla —cuatro para `appointment_cancelled`—
y devuelve `-1` para cualquier clave desconocida, con lo que el `INSERT`
revienta. Lo que salva a este `INSERT` es el trigger `outbox_variables_bi`, que
corre **antes** y arma el array a partir de cuatro claves semánticas:

```
appointment_cancelled →
  [patient_first_name, professional_first_name,
   wa_fecha(starts_at, timezone), wa_hora(starts_at, timezone)]
```

De ahí que el `payload` lleve esas cuatro claves. La quinta, `appointment_id`,
no la lee el trigger para esta plantilla: va porque es lo único que liga la fila
de la cola con la cita, y porque es la clave con la que
`private.wa_apagar_avisos_de_cita` encuentra los avisos de una cita cuando ésta
cambia de estado. Es la misma forma que usa `cron_appointment_confirmation_26h`.

Si el trigger no reconociera el `template_key`, no armaría nada, el `CHECK`
fallaría, y el `EXCEPTION WHEN OTHERS` de abajo se tragaría el fallo con un
`RAISE WARNING`: **la cita no se cancelaría y nadie se enteraría.** Ese bloque
de excepción es el de los tres crons desplegados y se conserva por eso, pero es
cómodo y peligroso a partes iguales.

**Y por qué `appointment_cancelled` no miente.** El texto aprobado en Meta es:

> Hola, {{1}} 👋
> Tu sesión con Psic. {{2}} del {{3}} a las {{4}} fue cancelada.
> Si quieres agendar otra, escríbeme por aquí.

Está en voz pasiva: no dice que la canceló el profesional. Y termina invitando a
agendar otra, que es exactamente lo que queremos que pase. Es la única de las 16
claves que sirve aquí, y sirve bien.

Cuatro cosas de la selección que no son adorno:

- **`a.origin = 'patient'`.** Las citas de prepago que agenda el profesional no
  se autocancelan. Cambiar eso sería cambiar su producto. Y el origen sobrevive
  al movimiento: la cita que crea el agente al reprogramar también nace
  `origin='patient'` (§1.4), así que el reloj la sigue.
- **`p.proof_requested_at IS NOT NULL`.** El reloj cuelga de la petición, no de
  la cita. Es lo que hace que mover no compre tiempo (§1.4). Y no se reinicia
  por detrás: `cron_appointment_confirmation_26h` sólo sella
  `proof_requested_at` `AND proof_requested_at IS NULL`, así que no pisa la
  fecha que puso el agente al agendar.
- **`a.starts_at > now()`, y el plazo es `proof_requested_at + 24 h` a secas.**
  Aquí el borrador tenía un error de verdad. Ponía
  `LEAST(proof_requested_at + 24 h, starts_at)` para que una cita cercana no
  esperara 24 horas. El problema es que `cron_sweep_past_pending` sólo mueve una
  cita a `past_pending` cuando `ends_at <= now()`: entre que la sesión empieza y
  que termina, la cita sigue `scheduled`, y con el `LEAST` este trabajo la
  alcanza y **la cancela con la paciente ya sentada**, mandándole «tu sesión fue
  cancelada» a mitad de la hora. La versión de arriba no puede hacer eso: no
  toca una cita que ya empezó. Y la rama que el `LEAST` intentaba cubrir hoy no
  existe — la única profesional con cobro antes pide 2880 minutos de
  anticipación, así que ninguna de sus citas nace a menos de 48 h. Un prepago
  agendado para dentro de pocas horas simplemente no se autocancela: pasa a
  `past_pending` y lo resuelve el profesional con sus botones de siempre, que es
  lo que ya ocurre con cualquier cita sin pagar. Ver §10, punto 8.
- **`FOR UPDATE OF a SKIP LOCKED`.** La misma forma de
  `cron_appointment_confirmation_26h`; una cita que el agente esté mutando en
  ese instante se salta y se atiende cinco minutos después. Ojo: `FOR UPDATE OF
  a` bloquea la cita, **no el pago** — por eso el paso 0 vuelve a leer el pago
  con su propio candado.

**Lo que este trabajo NO hace: avisarle al profesional.** No hay tipo de
notificación para «se canceló sola por falta de comprobante», y usar
`appointment_cancelled_by_patient` sería mentir. Inventar un tipo nuevo obliga a
tocar la app, que es intocable. La cita desaparece de su agenda y la tarjeta
cerrada lo explica. Queda nombrado en §10.

---

## 6. Trasladar el pago a la próxima cita

**No entra en esta ronda.**

Tres bloqueos verificados, y ninguno se resuelve con una función nueva:

1. `reschedule_appointment` **siempre** crea una cita nueva; no acepta un destino
   existente.
2. `payments_appointment_id_key UNIQUE (appointment_id)` obliga a **fusionar** dos
   pagos, no a insertar otro. Fusionar significa decidir qué pasa con dos montos,
   dos `charge_timing`, dos comprobantes y una restricción
   `payment_proofs_payment_id_key UNIQUE (payment_id)` que sólo admite uno.
3. `get_next_scheduled_appointment` es `authenticated` + `current_professional_id()`:
   el agente no puede llamarla.

Y sobre todo: **mover ya hace el trabajo.** Reprogramar traslada el monto
completo, el `charge_timing`, la petición de comprobante y una copia de la fila
de `payment_proofs`. La diferencia con «pásalo a la próxima» es que la próxima la
elige ella en el formulario, en el mismo turno.

Cero series de recurrencia activas en producción, así que tampoco hay un caso
real esperando.

**Qué se le contesta a la paciente**, respuesta fija:

> El pago viaja con esta cita. Si la movemos, se va con ella al día que elijas.
> Pasarlo a otra cita distinta lo tiene que hacer [profesional]. ¿Te busco
> horarios para moverla?

---

## 7. Las políticas que limitan a la paciente

### 7.1 De dónde salen y cómo se leen

`public.professional_appointment_policies`, PK `professional_id`, **todas las
columnas `NOT NULL`**. Cada función que la necesita la lee al principio, con el
resto del contexto; nadie la pasa como parámetro ni la cachea entre turnos:

```sql
SELECT policy.*
  INTO v_policy
  FROM public.professional_appointment_policies AS policy
 WHERE policy.professional_id = v_turn.professional_id;
IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '..._POLICY_MISSING';
END IF;
```

**Sin valor por omisión.** La fila nace con el profesional (los cinco de
producción la tienen); si falta, el dato está roto y hay que enterarse, no seguir
con un 1440 inventado.

| Columna | Def. | Valores posibles | Qué limita |
|---|---|---|---|
| `patient_min_booking_lead_minutes` | 1440 | 0, 360, 720, 1440, 2880 | Desde cuándo arranca el calendario del formulario |
| `free_change_notice_minutes` | 1440 | 0, 360, 720, 1440 | Si cancelar abre una decisión de cobro |
| `min_lead_to_change_modality_minutes` | 1440 | 0, 360, 720, 1440 | Hasta cuándo puede cambiar de modalidad |
| `patient_can_switch_to_online` | false | — | Si puede pasar de presencial a en línea |
| `patient_can_switch_to_in_person` | false | — | Si puede pasar de en línea a presencial |
| `charge_timing` | after | before, after | Si la cita nace con petición de comprobante (§5) |

Los tres plazos **no son un número libre**: `chk_policy_minutes_allowed` los
encierra en esos conjuntos, y `update_appointment_policies` los vuelve a validar
antes de escribir. Eso significa que sólo hay cinco textos de plazo posibles en
todo el producto —«6 horas», «12 horas», «24 horas», «48 horas», y **ninguno**—
y simplifica §7.2 hasta hacerla trivial.

Fuera de esta tabla, en `public.professionals`: `is_patient_scheduling_enabled`
(el interruptor maestro, que hoy es un pestillo de una sola dirección) y
`timezone`.

### 7.2 La regla: ningún texto lleva un número fijo

Todo texto que mencione un plazo lo recibe de la fila. Una sola función lo
convierte a palabras, y es la única que sabe redactar plazos:

```sql
CREATE FUNCTION private.agent_plazo_legible(p_minutes integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p_minutes = 0 THEN NULL
              ELSE (p_minutes / 60)::text || ' horas'
         END
$$;
```

Dos renglones, porque los valores posibles son cinco y cuatro de ellos son horas
exactas: 360 → «6 horas», 720 → «12 horas», 1440 → «24 horas», 2880 → «48 horas».
No hay rama de minutos ni de «1 hora» ni de días: ningún valor permitido las
necesita.

**El cero es un estado real, no un error.** `free_change_notice_minutes = 0`
significa que cancelar nunca es tarde; `patient_min_booking_lead_minutes = 0`,
que puede agendar para dentro de un rato. Cuando la función devuelve `NULL`,
**la frase del plazo desaparece entera**: «Si necesitas cancelar, avísame y no
hay ningún cobro de por medio», no «avísame con 0 horas». Ninguna de las cinco
profesionales tiene un cero hoy, pero la app deja ponerlo y es una rama, no un
blindaje.

Las operaciones de lectura devuelven el texto ya armado en un campo del
resultado; **el prompt del modelo nunca ve el número suelto**, para que no pueda
redondearlo ni «ayudar».

### 7.3 Los valores reales de hoy, y qué implican

| Profesional | Agenda paciente | Anticip. mínima | Aviso cambio | → En línea | → Presencial | Anticip. modalidad | Cobro |
|---|---|---|---|---|---|---|---|
| Maricruz tes | sí | 1440 | 1440 | no | no | 1440 | después |
| Araceli | sí | **2880** | 1440 | sí | sí | 1440 | **antes** |
| Miranda | sí | **2880** | **720** | sí | sí | **720** | después |
| test | sí | **2880** | 1440 | sí | **no** | 1440 | después |
| Test | sí | 1440 | 1440 | no | no | 1440 | después |

Lo que esto obliga:

- **Tres de cinco piden 48 h.** El calendario del formulario arranca dos días
  después para ellas. Un texto que diga «para mañana» está mal para la mayoría.
- **Miranda tiene 12 h de aviso de cambio.** Cualquier copy que diga «24 horas»
  le miente a sus pacientes **en la dirección peligrosa**: creen que ya es tarde
  cuando todavía están a tiempo, y no cancelan. Esta es la razón por la que la
  regla de §7.2 no es negociable.
- **Araceli es hoy la única con cobro antes.** Todo el §5 la afecta sólo a ella
  — y sólo dejará de estar dormido el día que baje su anticipación mínima.
- **Dos de cinco prohíben ambos cambios de modalidad, y `test` permite → en línea
  pero no → presencial.** La direccionalidad es real: el texto se arma con el
  interruptor de la dirección que ella pide, no con uno solo.
- **Ninguna tiene dirección y liga a la vez.** La operación de ubicación devuelve
  nulo explícito cuando no hay a dónde mandarla. Nunca inventa.

Ejemplos de texto, con la sustitución marcada:

> Puedo agendarte a partir del {fecha_mínima}, porque [profesional] pide al menos
> {plazo_anticipación} de anticipación.

> Si necesitas cancelar, avísame con al menos {plazo_aviso} y no hay ningún
> cobro de por medio.

> Puedo cambiarla a en línea hasta {plazo_modalidad} antes de la sesión.

Y las tres versiones sin plazo, para cuando la política vale 0 (§7.2). No son
una variante «por si acaso»: son la frase completa cuando el plazo no existe.

> Puedo agendarte desde hoy mismo.

> Si necesitas cancelar, avísame y no hay ningún cobro de por medio.

> Puedo cambiarla a en línea en cualquier momento antes de la sesión.

---

## 8. El contrato de avisos al profesional

Arreglo barato y bloqueante. Se hace **entero dentro de las migraciones del
agente**, sin tocar una línea de la app.

### 8.1 El problema, en una frase

Los dos lectores —la bandeja (`list_notifications`, que devuelve `payload` crudo
y la app renderiza) y la push (`notificar_push_al_insertar` →
`notificar-push`)— arman el texto con claves fijas. Las funciones escritas del
agente escriben `surface`, `command_id`, `starts_at`, `modality`,
`old_starts_at`, `old_modality`, `change_policy_result`: **cero coincidencias**,
y nunca el nombre de la paciente. Los seis avisos caerían al texto neutro
verificado en la función desplegada: **«Nueva notificación / Hay una
actualización reciente en tu cuenta.»**

### 8.2 La forma exacta de los seis avisos

Verificado contra el cuerpo desplegado de `notificar-push/index.ts` y contra las
filas reales de `public.notifications`.

| `type` | Claves obligatorias | Si falta una |
|---|---|---|
| `appointment_created_by_patient` | `patient_first_name`, `patient_last_name`, `appointment_starts_at`, `appointment_ends_at`, `appointment_modality` | texto neutro |
| `appointment_confirmed` | las mismas cinco | texto neutro |
| `appointment_cancelled_by_patient` | las mismas cinco | texto neutro |
| `appointment_rescheduled_by_patient` | `patient_first_name`, `patient_last_name`, `previous_starts_at`, `previous_modality`, `new_starts_at`, `new_modality` | texto neutro |
| `modality_changed_by_patient` | `patient_first_name`, `patient_last_name`, `appointment_starts_at`, `previous_modality`, `new_modality` | texto neutro |
| `payment_proof_received` | `patient_first_name`, `patient_last_name`, `appointment_starts_at` | texto neutro |

`patient_last_name` puede ser nulo y el lector lo tolera (`nombre()` sólo exige
`patient_first_name`). Ninguna de las otras claves lo tolera.

**Los seis `INSERT`, listos para pegar.**

```sql
-- 1) Agendó (agent_create_appointment_from_workflow)
INSERT INTO public.notifications
      (type, appointment_id, patient_id, professional_id, payload)
VALUES ('appointment_created_by_patient',
        v_appointment_id, v_turn.patient_id, v_turn.professional_id,
        pg_catalog.jsonb_build_object(
          'patient_first_name',   v_patient_first_name,
          'patient_last_name',    v_patient_last_name,
          'appointment_starts_at', v_starts_at,
          'appointment_ends_at',   v_ends_at,
          'appointment_modality',  v_modality));

-- 2) Confirmó (agent_confirm_appointment_from_workflow)
--    identico, con type = 'appointment_confirmed'

-- 3) Canceló (agent_cancel_appointment_from_workflow)
--    identico, con type = 'appointment_cancelled_by_patient'

-- 4) Movió (agent_reschedule_appointment_from_workflow)
INSERT INTO public.notifications
      (type, appointment_id, patient_id, professional_id, payload)
VALUES ('appointment_rescheduled_by_patient',
        v_new_appointment_id, v_turn.patient_id, v_turn.professional_id,
        pg_catalog.jsonb_build_object(
          'patient_first_name', v_patient_first_name,
          'patient_last_name',  v_patient_last_name,
          'previous_starts_at', v_old.starts_at,
          'previous_modality',  v_old.modality,
          'new_starts_at',      v_new_starts_at,
          'new_modality',       v_new_modality));

-- 5) Cambió de modalidad (agent_switch_appointment_modality_from_workflow)
INSERT INTO public.notifications
      (type, appointment_id, patient_id, professional_id, payload)
VALUES ('modality_changed_by_patient',
        v_appointment.id, v_turn.patient_id, v_turn.professional_id,
        pg_catalog.jsonb_build_object(
          'patient_first_name',    v_patient_first_name,
          'patient_last_name',     v_patient_last_name,
          'appointment_starts_at', v_appointment.starts_at,
          'previous_modality',     v_old_modality,
          'new_modality',          v_new_modality));

-- 6) Mandó comprobante (agent_attach_payment_proof_from_workflow)
INSERT INTO public.notifications
      (type, appointment_id, patient_id, professional_id, payload)
VALUES ('payment_proof_received',
        v_appointment.id, v_turn.patient_id, v_turn.professional_id,
        pg_catalog.jsonb_build_object(
          'patient_first_name',    v_patient_first_name,
          'patient_last_name',     v_patient_last_name,
          'appointment_starts_at', v_appointment.starts_at));
```

Cuatro reglas de forma, todas verificadas:

1. **El `timestamptz` se pasa tal cual; `::text` jamás.** El lector valida el
   instante con `/(?:[zZ]|[+-]\d{2}:?\d{2})$/`. `jsonb_build_object('x', now())`
   produce `"2026-08-26T02:29:29.960926+00:00"` y pasa. `now()::text` produce
   `"2026-08-26 02:29:29.960926+00"` y **falla**: el desplazamiento de dos
   dígitos no cumple el patrón, y el aviso cae al texto neutro sin dar un solo
   error. Envolverlo en `to_jsonb()` no aporta nada —comprobado en la base:
   `jsonb_build_object('a', now())` y `to_jsonb(now())` devuelven la misma
   cadena, porque el primero llama al segundo—. Lo mismo con la modalidad.
2. **La modalidad va en crudo**, `in_person` u `online`. El lector traduce con su
   propio diccionario; un «presencial» ya traducido no lo encuentra y cae al
   neutro.
3. **Nada de zona horaria en el `payload`.** Los dos lectores resuelven la zona
   por su cuenta desde `professionals.timezone`. Los instantes van absolutos.
4. **Ninguna clave de más.** `surface`, `command_id`, `change_policy_result`,
   `waived`, `pending_charge_decision`: ningún lector las mira. Son peso muerto
   que un día se filtra a una push.

`professional_id` es `NOT NULL`. `appointment_id` y `patient_id` se llenan
porque ya están en la mano y son el único rastro que liga el aviso con la cita;
la app hoy no los usa.

### 8.3 La regla del monto

**El aviso de comprobante no lleva el monto.** El borrador escribe hoy:

```sql
'amount', pg_catalog.to_char(v_payment.amount, 'FM999999990.00')
```

Se quita. Dos razones, y la segunda es de producto: el lector no la mira, así que
es peso muerto; y un monto en el aviso de un comprobante que **está pendiente de
revisión** dice que ya se cobró esa cantidad, que es exactamente lo que la regla
3 prohíbe decir. El profesional abre la tarjeta y ahí ve el monto, junto al
botón que lo resuelve.

Por la misma razón se quita `charge_reason` del mismo aviso.

---

## 9. Qué avisos de WhatsApp no debe encolar el agente

**El agente no encola ninguna plantilla. Ninguna. Nunca.**

Es una regla sin excepciones, y por eso es fácil de cumplir. El único productor
nuevo de `whatsapp_outbox` en todo este diseño es
`cron_agent_prepay_expiry` (§5.3), que no es el agente: corre cuando la
conversación lleva horas cerrada.

| Plantilla | Por qué el agente no la encola |
|---|---|
| `appointment_cancelled`, `appointment_cancelled_payment_proof` | **Eco.** El agente acaba de decírselo en el chat, al mismo teléfono. En la app del profesional este aviso tiene sentido porque la paciente no estaba presente; aquí sí estaba. |
| `appointment_rescheduled`, `appointment_rescheduled_payment_proof` | **Eco**, por lo mismo. |
| `appointment_confirmation_request`, `appointment_confirmation_prepay` | Son del `cron_appointment_confirmation_26h`, que ocupa el `dedup_key = 'appointment_confirmation:' || appointment_id`. Su `ON CONFLICT` no es un `DO NOTHING`: es un `DO UPDATE` que **revive la fila cancelada y le pisa el `payload` y el `template_key`** mientras no haya salido. Una fila puesta ahí por el agente no se respeta, se reescribe. |
| `request_session_payment_proof`, `request_late_payment_proof`, `request_no_show_payment_proof` | Son la voz del profesional pidiendo dinero. El agente no pide dinero por él. |
| `appointment_reminder_1h_*` | Del `cron_appointment_reminder_1h`. |
| `patient_welcome`, `patient_reactivation`, `patient_review_request`, `patient_resource_delivery` | Fuera de este documento. |

Son las 16 claves que la base conoce. `private.wa_payload_ok` las lleva escritas
en su cuerpo con el número exacto de variables de cada una, y
`chk_outbox_variables` las impone: una clave desconocida devuelve `-1` variables
esperadas y **el `INSERT` revienta**. (En Kapso hay 18 plantillas aprobadas:
sobran `appointment_reminder_1h_online_no_url` y
`appointment_reminder_1h_online_no_link`, dos variantes del recordatorio en
línea que no tienen clave en la base y por lo tanto no se pueden encolar.)
Añadir una plantilla nueva exige migrar `wa_payload_ok`,
migrar `tg_outbox_variables_bi` para que sepa armarle el array de variables, y
que Meta la apruebe. Este diseño no añade ninguna.

**Cómo habla el agente entonces.** Por dentro de la sesión abierta, con
`send_notification_to_user` de Kapso. La ventana de 24 h se cumple por
construcción: la cola sólo produce plantillas, y el agente sólo responde dentro
de una sesión que la paciente acaba de abrir. No hay que comprobar nada.

**Y lo que sí sigue pasando solo**, sin que el agente escriba una línea:

- `tg_appointments_apagar_avisos`: al salir de `scheduled`, cancela confirmación,
  prepago y los tres recordatorios de 1 h.
- `tg_payments_apagar_cobro`: en `pending → credited|waived`, cancela las tres
  peticiones de comprobante y degrada `appointment_confirmation_prepay →
  appointment_confirmation_request` mientras siga en cola.
- `tg_payment_proofs_degradar_prepago_ai`: al insertar un comprobante, degrada la
  plantilla de prepago.

El orden está bien resuelto de fábrica: los triggers de cita disparan al cambiar
el estado, **antes** de que se inserte la fila nueva, así que el aviso nuevo
sobrevive y los pendientes mueren.

---

## 10. Decisiones pendientes para el dueño

Cada una lleva la recomendación y el supuesto con el que este documento sigue.

1. **Cargo por cambio tardío al reprogramar.** Recomendación: **mover es siempre
   gratis**, cero código (§4.2). Supuesto en uso: mover es gratis. La alternativa
   contradice la decisión de que el dinero siempre viaja, o exige tocar la app
   del profesional.
2. **La repetición de la confirmación cuando se agenda con menos de 26 h de
   anticipación** (§5.2). Recomendación: aceptarla. Supuesto en uso: se acepta.
   El arreglo, si molesta, es que el agente ocupe el `dedup_key` del cron.
3. **Aviso al profesional cuando el prepago vence y la cita se cancela sola**
   (§5.3). Hoy no se le avisa: no hay tipo de notificación y crearlo obliga a
   tocar la app, que es intocable. Recomendación: dejarlo así esta ronda y
   resolverlo junto con el punto 4.
4. **Qué se le entrega al profesional en su ficha de cita** —quién agendó, quién
   canceló, si avisó a tiempo—. Las cuatro columnas existen (`origin`,
   `cancel_reschedule_actor`, `confirmation_source`, `change_policy_result`) y
   ninguna de las dos funciones que alimentan su agenda las entrega. Material de
   la ronda siguiente.
5. **Que la decisión tardía sea fácil de encontrar.** El agente va a producirlas
   todas, y hoy sólo aparecen tocando la tarjeta: no están en Cobros (por
   `late_ok`), no hay punto en el calendario (`get_days_with_appointments` filtra
   `status='scheduled'`), y el aviso se borra a las 24 h. Es un cambio en la app
   del profesional. Nombrado, no resuelto.
6. **Trasladar el pago a otra cita existente** (§6). Recomendación: no se
   construye. Supuesto en uso: no entra, y se contesta con la respuesta fija.
7. **El comprobante que llega después de que venció el prepago** (§1.5, fila F).
   La paciente hizo la transferencia y tardó en mandar la foto; para entonces el
   trabajo de §5.3 ya canceló la cita y condonó el pago. Ningún camino del
   sistema reabre un `waived`: `waive`, `credit` y `request_proof` exigen
   `pending` o `credited`. Recomendación: **dejarlo así y decirlo claro** —el
   agente la manda con el profesional y le ofrece agendar de nuevo—; el dinero
   se resuelve entre personas, que es donde ya estaba antes de que existiera el
   agente. La alternativa es abrir una ventana de gracia (aceptar el comprobante
   y dejar el pago `pending` sobre la cita cancelada), y eso obliga a
   des-condonar un pago, que hoy no tiene función. Supuesto en uso: no hay
   ventana de gracia.
8. **El plazo del prepago cuando la cita empieza antes de 24 h.** Resuelto en
   §5.3 así: el plazo es siempre `proof_requested_at + 24 h`, y el trabajo no
   toca una cita que ya empezó. Es decir, **una cita de prepago agendada para
   dentro de menos de 24 h nunca se autocancela**: llega sin comprobante, pasa a
   `past_pending` y el profesional la resuelve con sus botones, exactamente como
   cualquier otra cita sin pagar. Recomendación: dejarlo así. La alternativa
   —vencer al empezar la sesión— cancelaba la cita con la paciente ya sentada,
   porque entre `starts_at` y `ends_at` la cita sigue `scheduled`. Y hoy el caso
   no existe: la única profesional con cobro antes pide 48 h de anticipación.
   Supuesto en uso: 24 h fijas, y nunca sobre una cita empezada.
