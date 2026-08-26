# 13 · El cambio tardío y la matriz de resolución de la profesional

Corte: 2026-08-26. Proyecto auditado: Supabase `ssyzfeadyrczlzjbvxyl` («Agenda PSI V2»).

Todo lo que sigue está leído del `prosrc` de las funciones desplegadas, de las restricciones
reales de las tablas y de las filas reales de producción. Cada afirmación trae su evidencia.
Donde algo no se pudo comprobar, se dice.

**Las reglas del dueño que este documento comprueba:**

1. Los cambios tardíos **sí se permiten**. No se bloquean.
2. A la paciente se le avisa que reprograma o cancela sin el tiempo mínimo y que **por
   política se aplicará el cargo**.
3. **El estado del pago se congela tal como está.** Si estaba pendiente de comprobante,
   sigue pendiente de comprobante.
4. **Se abre la decisión para la profesional**, que después elige: cobrar en efectivo,
   cobrar con transferencia, volver a pedir el comprobante, acreditar el comprobante si ya
   lo tiene, o condonar.

**El veredicto en una línea.** Cancelar tarde se puede implementar hoy, entero, sin una sola
función nueva: las tres funciones de la profesional y su app ya cubren las cinco acciones.
**Reprogramar tarde no cierra** mientras el dinero viaje a la cita nueva: ninguna función
desplegada puede resolver esa decisión. El arreglo mínimo es congelar el pago viejo en su
sitio en vez de arrastrarlo — y congelar no hay que inventarlo: es lo que ya hace el modo
`'charge_old'` de `reschedule_appointment`, desplegado (§5.1).

**Lo que este documento no resuelve y hay que decidir aparte:** cuando la profesional decide,
**la paciente no se entera**. Cuatro de las cinco acciones no le mandan nada, ni siquiera
condonar (§5.5).

---

## 1. Qué columna abre la decisión, y con qué valores

La decisión vive en **`public.payments.late_change_decision`**, no en `public.appointments`.

```
Columna : late_change_decision
Tipo    : public.late_change_decision  (nullable, sin default)
Valores : pending | charge | no_charge
```

Verificado:

```sql
select column_name, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='payments'
  and column_name like 'late_change%';
-- late_change_decision              | late_change_decision | YES | null
-- late_change_decision_resolved_at  | timestamptz          | YES | null
-- late_change_decision_resolved_by  | actor_type           | YES | null

select typname, string_agg(enumlabel,' | ' order by enumsortorder)
from pg_type t join pg_enum e on e.enumtypid=t.oid
where typname='late_change_decision' group by 1;
-- late_change_decision | pending | charge | no_charge
```

Las dos restricciones que gobiernan la terna (leídas de `pg_constraint`):

```sql
chk_late_decision_resolution
  CHECK ( (late_change_decision = ANY (ARRAY['charge','no_charge']))
          = (late_change_decision_resolved_at IS NOT NULL) )

chk_late_decision_resolved_by
  CHECK ( (late_change_decision_resolved_at IS NULL)
          = (late_change_decision_resolved_by IS NULL) )
```

**Lectura literal:** `'pending'` obliga a que `late_change_decision_resolved_at` sea NULL, y
eso obliga a que `late_change_decision_resolved_by` también lo sea. Abrir la decisión es
escribir **una sola columna**. Los otros dos sellos son de quien la cierra.

**No hay ninguna restricción de tabla que ate `late_change_decision` al estado de la cita.**
Esa regla existe sólo dentro de `get_appointment_detail` (sección 3), y romperla no da error:
pinta la tarjeta en modo «Revisar» y apaga los botones.

### Quién la escribe hoy

Ocho funciones desplegadas mencionan la columna:

```sql
select proname from pg_proc
where pronamespace in ('public'::regnamespace,'private'::regnamespace)
  and prosrc like '%late_change_decision%';
-- cancel_appointment, credit_appointment_payment, get_appointment_detail,
-- get_billing_day, get_billing_month, mark_appointment_no_show,
-- request_appointment_payment_proof, waive_appointment_payment
```

- Tres la **resuelven**: `waive_appointment_payment`, `credit_appointment_payment`,
  `request_appointment_payment_proof`.
- Dos la **leen para facturar**: `get_billing_day`, `get_billing_month`.
- Una la **lee para pintar**: `get_appointment_detail`.
- Una la **prohíbe**: `cancel_appointment` revienta si la encuentra puesta (sección 6.3).
- Una sólo la nombra en un comentario: `mark_appointment_no_show` («El no-show NO toca
  `late_change_decision`»).

**Ninguna la pone en `'pending'`.** La superficie de la paciente —el agente— va a ser su
único productor.

### Lo que hay hoy en producción

```sql
select count(*) total,
       count(*) filter (where late_change_decision is not null) con_decision,
       count(*) filter (where late_change_decision='pending')   pendientes
from public.payments;
-- total 41 | con_decision 2 | pendientes 0
```

Las dos filas con decisión ya están **resueltas**, y son exactamente la forma a la que hay
que llegar:

| pago | estado | charge_reason | decisión | resuelta por | cita | change_policy_result | actor |
|---|---|---|---|---|---|---|---|
| `…0009` | credited | **reschedule** | charge | professional | rescheduled | late | patient |
| `…0016` | credited | **cancellation** | charge | professional | cancelled | late | patient |

Fíjate en `charge_reason`: reclasificado en las dos. Eso no es decorado; es lo que decide si
la fila existe en Cobros (sección 5.2).

**Pero ojo con qué prueban esas dos filas.** Las dos están `credited`, o sea prepago: quien
les reclasificó el `charge_reason` fue la rama del prepago de `credit_appointment_payment`,
que sí lo hace sola. **Ninguna de las dos pasó por la rama de pago `pending`** —la única que
no reclasifica— así que en producción no hay un solo ejemplo del camino que avisa §5.2. La
trampa no está desmentida por estas filas: está sin testigo.

La tercera fila que hay que mirar es la del arrastre, para contraste:

| pago | estado | charge_reason | waive_reason | cita | change_policy_result | actor |
|---|---|---|---|---|---|---|
| `…1e7d` | waived | **session** | carried_forward | rescheduled | null | professional |

`charge_reason` se quedó en `'session'` sobre una cita `rescheduled`, así que `earns` es
falso y la fila **no aparece en Cobros**. Es lo correcto —ese dinero está en la cita nueva—,
pero conviene tenerlo delante al leer §5.2.

---

## 2. Los cinco estados del pago

Los estados salen del enum y de las restricciones de `public.payments`, no de una convención:

```sql
payment_status = not_applicable | pending | credited | waived
waive_reason   = forgiven | carried_forward
charge_reason  = session | no_show | cancellation | reschedule
payment_method = cash | transfer
```

```
chk_payment_not_applicable_amount   CHECK ((status='not_applicable') = (amount = 0))
chk_payment_credited_method         CHECK ((status<>'credited') OR (method IS NOT NULL))
chk_payment_resolved_at             CHECK ((status IN ('credited','waived')) = (resolved_at IS NOT NULL))
chk_payment_waive_reason            CHECK ((status='waived') = (waive_reason IS NOT NULL))
chk_payment_proof_requested_transfer CHECK ((proof_requested_at IS NULL) OR (method='transfer'))
payments_appointment_id_key         UNIQUE (appointment_id)
payment_proofs_payment_id_key       UNIQUE (payment_id)
```

Cinco estados posibles en el instante del cambio tardío, y cómo se distinguen:

| # | Nombre corto | `status` | `proof_requested_at` | fila en `payment_proofs` | Qué significa |
|---|---|---|---|---|---|
| 1 | **Sin costo** | `not_applicable` | — | — | `amount = 0` por restricción |
| 2 | **Pendiente desnudo** | `pending` | NULL | no | Se debe y nadie ha pedido nada |
| 3 | **Comprobante pedido** | `pending` | NOT NULL | no | `method='transfer'` forzado por restricción |
| 4 | **Comprobante recibido** | `pending` | (da igual) | **sí** | Llegó el archivo, nadie lo revisó |
| 5 | **Acreditado** | `credited` | (da igual) | (da igual) | Prepago cobrado; `method` y `resolved_at` NOT NULL |

Hoy en producción (41 pagos, consulta ejecutada al corte): 0 sin costo, **3 pendientes
desnudos**, **4 con comprobante pedido**, **0 con comprobante recibido**, 33 acreditados, 1
condonado.

Dos precisiones para que los conteos de este documento y los de `14-pasar-pago.md` §7 no se
lean como contradicción:

- **La fila 4 está vacía en toda la historia**: `public.payment_proofs` tiene **0 filas**. La
  mitad «comprobante recibido» de la regla del dueño **nunca ha ocurrido**, ni aquí ni en el
  frente 14.
- **`proof_requested_at` está sellado en 5 pagos, no en 4.** El quinto ya está `credited`, así
  que no es un estado del instante del cambio tardío y no aparece en esta tabla. Los 4 de la
  fila 3 son los que siguen `pending`.

---

## 3. Qué ve la profesional en su app, estado por estado

Todo sale de `public.get_appointment_detail(p_appointment_id uuid)`. Es la **única** función
desplegada que entrega `payment_view`. Ni `get_appointments_by_day` ni `list_appointments`
devuelven un solo campo de dinero (comprobado leyendo su `prosrc`): por eso hay que **tocar
la tarjeta** para ver la decisión.

### El primer filtro: la coherencia

```sql
v_inconsistent := v_pay.amount IS DISTINCT FROM a.agreed_price
  OR (v_pay.late_change_decision IS NOT NULL
      AND a.status NOT IN ('cancelled', 'rescheduled'));
```

**Dos consecuencias duras:**

- Si el importe del pago no coincide con `agreed_price` de la cita, **todo** cae a «Revisar».
  La función del agente no debe tocar `amount`.
- **Una decisión abierta sobre una cita que no está `cancelled` ni `rescheduled` es
  incoherente.** No revienta: apaga la tarjeta.

### El árbol de decisión, literal

```sql
IF late_change_decision='pending' AND status='pending'  THEN resolution_mode := 'late_unpaid';
ELSIF late_change_decision='pending' AND status='credited' THEN resolution_mode := 'late_prepaid';
ELSIF late_change_decision='pending' THEN v_inconsistent := true;      -- <<< la trampa
ELSIF status='not_applicable' THEN 'free';
...
```

La tercera rama es el hallazgo del que cuelga casi todo lo demás: **si la decisión está
abierta y el pago no es `pending` ni `credited`, la tarjeta se apaga.**

### La tabla que pide la profesional

| Estado del pago | `resolution_mode` | `badge` | Texto del badge en la app | `proof_state` | `action_mode` | Botones |
|---|---|---|---|---|---|---|
| 1 · Sin costo **con decisión abierta** | `review` | `review` | «Revisar» | `none` | `none` | **ninguno** |
| 2 · Pendiente desnudo | `late_unpaid` | `decision_pending` | «Pendiente de decisión» | `none` | `resolve_late_unpaid` | **[Cobrar] [No cobrar]** |
| 3 · Comprobante pedido | `late_unpaid` | `decision_pending` | «Pendiente de decisión» | `requested` | `resolve_late_unpaid` | **[Cobrar] [No cobrar]** |
| 4 · Comprobante recibido | `late_unpaid` | `decision_pending` | «Pendiente de decisión» | `received` | `resolve_late_unpaid` | **[Cobrar] [No cobrar]** |
| 5 · Acreditado (prepago) | `late_prepaid` | `decision_pending` | «Pendiente de decisión» | según archivo | `resolve_late_prepaid` | **[Cobrar] [No cobrar]** |
| Decisión abierta sobre cita `scheduled` | `review` | `review` | «Revisar» | — | `none` | **ninguno** |
| Decisión abierta sobre pago `waived` | `review` | `review` | «Revisar» | — | `none` | **ninguno** |

El `badge` sale de esta rama (primera de la cascada, gana a todas):

```sql
v_badge := CASE
  WHEN v_resolution_mode IN ('late_unpaid','late_prepaid') THEN 'decision_pending'
  WHEN v_pay.status='credited' THEN 'paid'
  ...
```

Los textos son de la app real, `dashboard_card_mapper.dart:377`:
`PaymentBadge.decisionPending => 'Pendiente de decisión'`, y los botones
`chargeLate => 'Cobrar'`, `waiveLate => 'No cobrar'`.

Nota: **`proof_state` se calcula antes del árbol**, así que sobrevive intacto —
`received` / `requested` / `none`—. Es lo que le permite a la app abrir el submenú correcto
detrás de [Cobrar] (sección 4).

### La línea «avisó con tanto tiempo»

```sql
IF v_has_payment
   AND a.status IN ('cancelled','rescheduled')
   AND v_pay.late_change_decision = 'pending'
   AND a.cancelled_rescheduled_at IS NOT NULL THEN
  v_total_minutes := floor(EXTRACT(EPOCH FROM (a.starts_at - a.cancelled_rescheduled_at))/60);
  IF v_total_minutes >= 0 THEN
    v_change_notice := jsonb_build_object('hours', .../60, 'minutes', .../60 resto);
  ELSE
    v_badge := 'review'; v_action_mode := 'none'; v_resolution_mode := 'review';
  END IF;
END IF;
```

**`cancelled_rescheduled_at` es obligatorio.** Si la función del agente no lo sella, la
profesional ve la decisión pero no ve con cuánta anticipación avisó la paciente, que es
justo el dato con el que decide. Y si queda en el futuro respecto de `starts_at`, la tarjeta
se apaga entera.

**Y dura lo que dura la decisión.** El guardia exige `late_change_decision = 'pending'`: en
cuanto la profesional cobra o condona, `change_notice` vuelve a NULL y la línea «avisó con
tanto tiempo» desaparece de la tarjeta. El dato existe sólo mientras sirve para decidir.

### Y dónde NO aparece

- **No hay punto en el calendario del mes.** `get_days_with_appointments` filtra
  `AND a.status = 'scheduled'`. Una cita cancelada o reprogramada deja de pintar el día.
- **Sí aparece en la agenda del día**, porque `get_appointments_by_day` no filtra por estado
  —trae las citas de la ventana sin más—, pero su DTO no lleva ni un campo de dinero: sale
  como una línea muda.
- **No aparece en el expediente de la paciente con estado de cobro.**
  `list_appointments` devuelve `id, kind, status, confirmed_at, starts_at_local,
  ends_at_local, patient_name, modality, can_edit`. Nada más.
- **No aparece en Cobros mientras la decisión siga abierta** (sección 5.2).

---

## 4. La matriz completa de resolución

Cinco filas (estado del pago) por seis columnas (acción). En cada celda: la función, lo que
exige y lo que deja escrito.

**Las tres funciones son:**

```
public.waive_appointment_payment(p_appointment_id uuid, p_command_id uuid)
public.credit_appointment_payment(p_appointment_id uuid, p_method payment_method, p_command_id uuid)
public.request_appointment_payment_proof(p_appointment_id uuid, p_command_id uuid)
```

Las tres son `SECURITY DEFINER` de `postgres`, con ACL
`postgres=X/postgres | authenticated=X/postgres`, y las tres empiezan con
`v_professional_id := public.current_professional_id()`. **Son de la profesional y de nadie
más**; el agente no las puede llamar.

### 4.1 La matriz de un vistazo

| Estado del pago | Cobrar · **efectivo** | Cobrar · **transferencia** | Cobrar · **volver a pedir comprobante** | Cobrar · **acreditar el comprobante** | Cobrar · **retener el prepago** | **Condonar** |
|---|---|---|---|---|---|---|
| 1 · Sin costo | ✗ imposible | ✗ imposible | ✗ imposible | — | — | ✗ imposible |
| 2 · Pendiente desnudo | ✓ | ✓ | ✓ (primera petición) | — | — | ✓ |
| 3 · Comprobante pedido | ✗ **bloqueada** | ✓ | ✓ (reenvío) | — | — | ✓ |
| 4 · Comprobante recibido | ✗ **bloqueada** | = acreditar | ✗ **bloqueada** | ✓ | — | ✓ |
| 5 · Acreditado (prepago) | — | — | ✗ **bloqueada** | — | ✓ | ✓ (ver trampa) |

`—` = la acción no tiene sentido en ese estado y la app no la ofrece.
`✗` = la base la rechaza, con el mensaje exacto que se cita abajo.

**Precisión sobre las `✗`:** sólo una es alcanzable desde la app hoy. En la fila 3 el efectivo
sigue en pantalla hasta que la profesional lo toca, porque el submenú se arma con
`choices: [if (!requested) _creditCash, …]` y `requested` sale de `proof_state` — si la
tarjeta viene de una lectura vieja, el botón está y la base lo rechaza. Las otras dos son
**inalcanzables**, no rechazadas: con comprobante recibido `_chargeLate` va directo a
«Acreditar pago» sin submenú, y con prepago va directo a `_creditPayment(method: null)` sin
preguntar nada (`appointment_economic_actions.dart:429` y `:450`). Se documentan para que nadie
las «arregle», no porque alguien las vaya a chocar.

### 4.2 Fila 1 — Sin costo (`not_applicable`)

**Ninguna celda pasa.** Las tres funciones la rechazan y la tarjeta se apaga.

| Acción | Función | Qué exige y qué falla |
|---|---|---|
| Condonar | `waive_appointment_payment` | `IF v_pay.status NOT IN ('pending','credited') THEN RAISE 'INVALID_PAYMENT_STATE'` |
| Cobrar (cualquier método) | `credit_appointment_payment` | Cae al `ELSE` final: `RAISE 'INVALID_PAYMENT_STATE'` |
| Pedir comprobante | `request_appointment_payment_proof` | `IF v_pay.status <> 'pending' THEN RAISE 'PAYMENT_NOT_PENDING'` |
| Ver la tarjeta | `get_appointment_detail` | Tercera rama → `v_inconsistent := true` → `badge='review'`, `action_mode='none'` |

**Arreglo mínimo: no abrir la decisión cuando el pago es `not_applicable`.** No hay nada que
cobrar (`amount = 0` por restricción), así que abrirla sólo produce una tarjeta muerta. La
función escrita en el árbol de trabajo ya lo hace bien: su rama tardía exige
`v_payment.status IN ('pending','credited')`. **Que ese guardia no se pierda.**

### 4.3 Fila 2 — Pendiente desnudo (`pending`, sin petición, sin archivo)

Lo que ve: badge «Pendiente de decisión», `action_mode='resolve_late_unpaid'`, `proof_state='none'`.
Al tocar **[Cobrar]** la app abre tres opciones — `appointment_economic_actions.dart:493`:
`choices: [if (!requested) _creditCash, _creditTransfer, requestChoice]` → **Efectivo**,
**Transferencia recibida**, **Pedir comprobante**.

| Acción | Función y argumentos | Qué exige exactamente | Qué deja escrito |
|---|---|---|---|
| **Efectivo** | `credit_appointment_payment(id, 'cash', cmd)` | `v_resolving_late` es cierto → `IF v_appt.status NOT IN ('cancelled','rescheduled') THEN RAISE 'INVALID_PAYMENT_ACTION'`; `IF p_method IS NULL THEN RAISE 'PAYMENT_METHOD_REQUIRED'`; el guardia del comprobante no aplica | `status='credited'`, `method='cash'`, `resolved_at=now()`, `late_change_decision='charge'` + `_resolved_at=now()` + `_resolved_by='professional'`; `appointments.is_editable=false`; eventos `payment_credited` y `late_decision_resolved`. **`charge_reason` NO se toca** |
| **Transferencia recibida** | `credit_appointment_payment(id, 'transfer', cmd)` | Igual | Igual, con `method='transfer'` |
| **Pedir comprobante** | `request_appointment_payment_proof(id, cmd)` | `IF v_appt.status NOT IN ('cancelled','rescheduled') THEN RAISE 'INVALID_PAYMENT_STATE'`; `IF v_pay.status <> 'pending' THEN RAISE 'PAYMENT_NOT_PENDING'`; `IF v_has_proof THEN RAISE 'PROOF_ALREADY_ATTACHED'` | `proof_requested_at=now()`, `method='transfer'`, **`charge_reason = 'cancellation'` o `'reschedule'`**, `is_editable=false`, `late_change_decision='charge'` + sellos; evento `proof_requested` + `late_decision_resolved`; encola `request_late_payment_proof` a la paciente |
| **No cobrar** | `waive_appointment_payment(id, cmd)` | `IF v_appt.status NOT IN ('cancelled','rescheduled') THEN RAISE 'INVALID_PAYMENT_STATE'`; `IF v_pay.status NOT IN ('pending','credited') THEN RAISE 'INVALID_PAYMENT_STATE'`; `IF v_pay.late_change_decision IS DISTINCT FROM 'pending' THEN RAISE 'INVALID_PAYMENT_STATE'` | `status='waived'`, `waive_reason='forgiven'`, **`charge_reason` reclasificado**, `resolved_at=now()`, `late_change_decision='no_charge'` + sellos; cancela jobs y outbox de comprobante |

**Ojo con «Pedir comprobante»: resuelve la decisión en el acto.** Sella
`late_change_decision='charge'`. No es «lo pienso después»: es «sí cobro, y quiero el papel».
Es coherente con la regla del dueño, pero conviene que el copy de la app lo diga.

### 4.4 Fila 3 — Comprobante pedido sin archivo (`pending` + `proof_requested_at`)

`proof_state='received'`… no: `'requested'`. La app quita el efectivo del submenú —
`if (!requested) _creditCash` — y cambia la etiqueta a **«Volver a pedir comprobante»**.

| Acción | Resultado | Evidencia |
|---|---|---|
| **Efectivo** | ✗ **bloqueada** | `credit_appointment_payment`: `IF (v_pay.proof_requested_at IS NOT NULL OR v_has_proof) AND p_method <> 'transfer' THEN RAISE 'INVALID_PAYMENT_ACTION'`. Y la restricción `chk_payment_proof_requested_transfer` no dejaría escribirlo aunque la función lo intentara |
| **Transferencia recibida** | ✓ | Mismo camino que la fila 2; `v_effective_method := 'transfer'` se fuerza solo |
| **Volver a pedir comprobante** | ✓ | `request_appointment_payment_proof`, rama `ELSE` (ya había `proof_requested_at`): **conserva la fecha original de la petición**, sólo reafirma `method='transfer'` y `charge_reason`, resuelve la decisión a `'charge'` y encola un aviso nuevo (dedup por `command_id`, así que un reenvío intencional sí sale) |
| **No cobrar** | ✓ | Igual que la fila 2. El `waive` **conserva** `proof_requested_at`: no borra la evidencia de que se pidió |

### 4.5 Fila 4 — Comprobante recibido (`pending` + fila en `payment_proofs`)

`proof_state='received'`. La app **no abre submenú**: [Cobrar] pregunta una sola cosa
(«Se acreditará por transferencia» → botón **«Acreditar pago»**) y llama a
`credit_appointment_payment(id, 'transfer', cmd)`.

| Acción | Resultado | Evidencia |
|---|---|---|
| **Acreditar (transferencia)** | ✓ | `v_effective_method := 'transfer'` forzado por `v_has_proof` |
| **Efectivo** | ✗ **bloqueada** | Mismo guardia: `(… OR v_has_proof) AND p_method <> 'transfer'` → `INVALID_PAYMENT_ACTION`. La app ni lo ofrece |
| **Volver a pedir comprobante** | ✗ **bloqueada** | `request_appointment_payment_proof`: `IF v_has_proof THEN RAISE 'PROOF_ALREADY_ATTACHED'`. Coherente: `payment_proofs_payment_id_key UNIQUE (payment_id)` impide que llegue un segundo archivo |
| **No cobrar** | ✓ | `waive` conserva el archivo como evidencia; el pago queda `waived/forgiven` |

Esto respeta la regla del dueño de que **un comprobante recibido queda pendiente de revisión**:
el agente nunca dice «pagado», y quien decide es la profesional, con las mismas dos salidas
que ya tiene en «No asistió» —acreditar o condonar—.

### 4.6 Fila 5 — Acreditado / prepago (`credited`)

`resolution_mode='late_prepaid'`, `action_mode='resolve_late_prepaid'`. La app llama a
`credit_appointment_payment(id, **null**, cmd)` —sin método— porque el dinero ya está dentro.

| Acción | Resultado | Evidencia |
|---|---|---|
| **Cobrar (retener el prepago)** | ✓ | Segunda rama: `ELSIF v_pay.status='credited' AND v_pay.late_change_decision='pending'`. Exige `v_appt.status IN ('cancelled','rescheduled')` y que `charge_reason` sea `'session'` o ya coincida con el destino (`IF v_pay.charge_reason <> 'session' AND v_pay.charge_reason IS DISTINCT FROM v_new_reason THEN RAISE 'INVALID_PAYMENT_ACTION'`). Deja: `charge_reason='cancellation'|'reschedule'`, `late_change_decision='charge'` + sellos, eventos `charge_retained` y `late_decision_resolved`. **El pago sigue `credited`; el importe y el método no se tocan** |
| **Efectivo / transferencia** | — | `p_method` ni se lee en esta rama. La app manda `null` |
| **Volver a pedir comprobante** | ✗ **bloqueada** | `request_appointment_payment_proof`: `IF v_pay.status <> 'pending' THEN RAISE 'PAYMENT_NOT_PENDING'`. Correcto: ya está cobrado |
| **No cobrar** | ✓ pero **con trampa** | `waive_appointment_payment` escribe `waive_reason = 'forgiven'` **fijo, en el código, sin parámetro**. Sobre un prepago eso significa: la paciente transfirió de verdad, y el registro dice «no se cobró». No hay devolución en el producto ni columna que la represente |

**La trampa del prepago condonado, con precisión.** `'carried_forward'` —el valor que diría
«ese dinero se fue a otra cita»— sólo lo escribe una función en toda la base:

```sql
select proname from pg_proc
where pronamespace in ('public'::regnamespace,'private'::regnamespace)
  and prosrc like '%carried_forward%';
-- get_appointment_detail   (sólo lo lee, para el badge 'payment_in_new_appointment')
-- reschedule_appointment   (lo escribe, en su modo 'carry')
```

Es decir: **desde la pantalla de decisión tardía no existe ninguna forma de mover ese dinero
a otra cita.** Sólo cobrarlo o darlo por no cobrado.

---

## 5. Las celdas imposibles

### 5.1 La grande: **reprogramar tarde no cierra por ningún lado**

Si al reprogramar tarde el dinero viaja a la cita nueva —la regla que estaba vigente— la
decisión abierta **no la puede resolver nadie**. Los dos sitios donde podría abrirse están
muertos, y hay que probarlo uno por uno.

**(a) Abrirla en el pago NUEVO** (el de la cita nueva, que queda `scheduled`):

| Función | Guardia que la mata |
|---|---|
| `waive_appointment_payment` | `IF v_appt.status NOT IN ('cancelled','rescheduled') THEN RAISE 'INVALID_PAYMENT_STATE'` |
| `credit_appointment_payment` | `IF v_resolving_late AND v_appt.status NOT IN ('cancelled','rescheduled') THEN RAISE 'INVALID_PAYMENT_ACTION'` |
| `request_appointment_payment_proof` | `IF v_appt.status NOT IN ('cancelled','rescheduled') THEN RAISE 'INVALID_PAYMENT_STATE'` |
| `get_appointment_detail` | `v_inconsistent := (late_change_decision IS NOT NULL AND a.status NOT IN ('cancelled','rescheduled'))` → «Revisar», sin botones |

**(b) Abrirla en el pago VIEJO, ya arrastrado** (`waived` / `carried_forward`, cita `rescheduled`):

| Función | Guardia que la mata |
|---|---|
| `waive_appointment_payment` | `IF v_pay.status NOT IN ('pending','credited') THEN RAISE 'INVALID_PAYMENT_STATE'` |
| `credit_appointment_payment` | Cae al `ELSE` final: `RAISE 'INVALID_PAYMENT_STATE'` |
| `request_appointment_payment_proof` | `IF v_pay.status <> 'pending' THEN RAISE 'PAYMENT_NOT_PENDING'` |
| `get_appointment_detail` | Tercera rama del árbol → `v_inconsistent := true` → «Revisar», sin botones |

**Cuatro de cuatro en los dos sitios.** No es un descuido de una función: es que el estado
`waived` está fuera del universo de los tres resolutores, y el estado `scheduled` está fuera
del universo de las tres citas resolubles.

**El arreglo mínimo, que además es lo que dice la regla nueva del dueño:**

> «El estado del pago **se congela tal como está**.»

Congelar significa **no arrastrar**. En un cambio tardío la función del agente:

1. Cierra la cita vieja como `rescheduled` y **deja su pago exactamente donde estaba**
   —`pending` o `credited`, con su `method`, su `proof_requested_at` y su archivo intactos—.
2. Sobre ese pago sella sólo dos columnas: `charge_reason = 'reschedule'` y
   `late_change_decision = 'pending'`.
3. Crea la cita nueva con **un pago nuevo propio**, `pending` (o `not_applicable` si el
   precio es 0), `charge_reason='session'`, `charge_timing` de la política.

Con eso el pago congelado queda en `pending` o `credited` sobre una cita `rescheduled`: la
fila 2, 3, 4 o 5 de la matriz, todas resolubles. **Cero funciones nuevas.** Y la forma
resultante es idéntica a la fila `…0009` que ya existe en producción.

**Congelar no hay que inventarlo: ya está desplegado.** `reschedule_appointment` no tiene un
solo modo. Su firma es

```
reschedule_appointment(p_appointment_id, p_new_starts_at_local, p_new_modality,
                       p_mode, p_old_payment_action, p_old_payment_method,
                       p_expected_updated_at, p_command_id)
```

y valida `IF v_mode NOT IN ('carry', 'charge_old') THEN …`. **El modo `'charge_old'` es
exactamente congelar:** el pago viejo se queda sobre la cita `rescheduled` —no se marca
`waived`— y la cita nueva estrena su propio pago, leído del `INSERT`:

```sql
INSERT INTO public.payments(... amount, status, ... charge_reason, charge_timing ...)
VALUES (v_new_pay_id, v_new_appt_id, v_professional_id, v_old.agreed_price,
        CASE WHEN v_old.agreed_price = 0 THEN 'not_applicable' ELSE 'pending' END,
        NULL, 'session', v_policy_timing, NULL, now(), now());
```

Los tres pasos de arriba son, literalmente, ese modo. Y su matriz de acciones sobre el pago
viejo ya es la del dueño, con guardias por estado del comprobante:

| Estado del pago viejo | `p_old_payment_action` admitidas |
|---|---|
| `pending` desnudo | `credit` (`cash` o `transfer`), `request_proof` |
| `pending` + comprobante pedido | `credit` (sólo `transfer`), `request_proof` |
| `pending` + comprobante recibido | `credit` (sólo `transfer`), **`defer`** |
| `credited` | ninguna: `IF v_action IS NOT NULL OR v_method IS NOT NULL THEN RAISE` (se retiene) |

Ese `defer` —comentado en la función como «puede acreditarse como transferencia o quedar
pendiente de revision; es el unico estado que permite `defer`»— **deja el pago viejo
`pending`, con su archivo, sobre una cita `rescheduled`**. Es, columna por columna, el estado
congelado que este documento propone, menos `late_change_decision`.

Y en **todas** sus ramas `charge_old` sella `charge_reason = 'reschedule'` sobre el pago
viejo (seis `UPDATE public.payments` leídos, los seis con esa columna). Es la misma disciplina
que §5.2 le pide al agente, escrita ya por la función de la profesional.

**Corrección de rumbo.** Congelar y arrastrar **no** son mutuamente excluyentes «por el
esquema»: `payments_appointment_id_key UNIQUE (appointment_id)` es *un pago por cita*, y al
congelar los dos pagos cuelgan de **citas distintas** —la vieja `rescheduled` y la nueva
`scheduled`—, así que la restricción no se roza. Son excluyentes por producto, no por base:
o el dinero se mueve, o se queda. Lo que sí hay que decirle al dueño es la consecuencia:
si el pago viejo se congela, **la paciente que ya había pagado se queda con un cobro
pendiente en la cita nueva**, y la profesional decide sobre el viejo. Si elige «No cobrar»,
el prepago queda escrito como `forgiven` y **no se mueve a la cita nueva**: no hay función
desplegada que lo mueva.

**Lo que dice hoy la función escrita en el árbol de trabajo** (`supabase/migrations/
20260825003000_agent_citas_mutaciones.sql`), sin desplegar, en su comentario literal:

> «EL DINERO VIAJA CON LA PACIENTE (modo 'carry' del profesional) … Un cambio tardio NO
> cobra aqui: no hay hueco perdido, la sesion solo se movio.»

Esa función **nunca abre la decisión al reprogramar**. Es exactamente la parte que hay que
reescribir.

### 5.2 La silenciosa: **`charge_reason` sin reclasificar borra la fila de Cobros**

`get_billing_day` y `get_billing_month` clasifican cada fila con dos banderas:

```sql
((a.status='attended'    AND pay.charge_reason='session')
 OR (a.status='no_show'     AND pay.charge_reason='no_show')
 OR (a.status='cancelled'   AND pay.charge_reason='cancellation')
 OR (a.status='rescheduled' AND pay.charge_reason='reschedule'))  AS earns,

(pay.late_change_decision IS NULL
 OR (a.status IN ('cancelled','rescheduled')
     AND pay.late_change_decision='charge'))                      AS late_ok
```

y **filtran por las dos**: `WHERE earns AND late_ok AND (…credited… OR …pending con papel…)`.

Dos lecturas, las dos importantes:

1. **Mientras la decisión está `pending`, `late_ok` es falso.** La fila no está en Cobros, no
   suma al total pendiente y no pinta marcador en la semana. Es deliberado —no se cuenta un
   ingreso que nadie ha decidido—, pero significa que **Cobros no es el camino para
   encontrar la decisión**. Hay que entrar por la tarjeta.

2. **Si `charge_reason` sigue en `'session'` sobre una cita `cancelled`, `earns` es falso
   para siempre.** Y aquí está la trampa fina:

   > **`credit_appointment_payment`, en su rama de pago `pending`, NO toca `charge_reason`.**

   Comprobado leyendo el `UPDATE`: escribe `status`, `method`, `resolved_at`,
   `late_change_decision`, `late_change_decision_resolved_at`, `late_change_decision_resolved_by`,
   `updated_at`. Nada más. (Sí lo reclasifica en su otra rama, la del prepago `credited`. Y
   `waive_appointment_payment` y `request_appointment_payment_proof` sí lo reclasifican
   siempre.)

   **Resultado:** si el agente deja `charge_reason='session'` y la profesional pulsa
   [Cobrar] → Efectivo sobre una cancelación tardía, el pago queda `credited` + `charge`, la
   tarjeta dice «Pagado»… y **la fila no aparece nunca en Cobros ni suma al ingreso**. Sin
   error, sin aviso.

   **Arreglo mínimo: el agente sella `charge_reason` en el mismo acto.** No hay conflicto con
   las tres funciones después: `waive` usa `CASE WHEN charge_reason='session' … ELSE
   charge_reason END` (respeta el valor ya puesto); `request_proof` lo sobrescribe con el
   mismo valor; y `credit` en la rama del prepago acepta explícitamente que ya coincida
   (`IF charge_reason <> 'session' AND charge_reason IS DISTINCT FROM v_new_reason THEN
   RAISE`, que con `'cancellation'` sobre una cita `cancelled` no dispara).

   **Y en cancelación ya está escrito: sólo falta en reprogramación.** La función del árbol
   de trabajo sella las dos columnas juntas en su rama tardía de cancelar:

   ```sql
   UPDATE public.payments
      SET charge_reason        = v_new_charge_reason,   -- session -> cancellation
          late_change_decision = 'pending',
          updated_at           = v_now
    WHERE id = v_payment.id
      AND late_change_decision IS NULL;
   ```

   La rama de reprogramar no lo hace porque hoy arrastra el dinero. Al pasar a congelar hay
   que copiar ese mismo par de columnas con `'reschedule'`. No es código nuevo: es la misma
   línea, en la otra rama.

### 5.3 Las tres que están bloqueadas a propósito

No son fallos; se documentan para que nadie intente «arreglarlas»:

- **Efectivo con el comprobante ya pedido o recibido.** El pago se comprometió como
  transferencia; lo impone la función y lo respalda `chk_payment_proof_requested_transfer`.
- **Volver a pedir comprobante cuando ya llegó uno.** `PROOF_ALREADY_ATTACHED`, y de todas
  formas `payment_proofs_payment_id_key UNIQUE (payment_id)` no dejaría entrar el segundo.
- **Pedir comprobante de un prepago acreditado.** `PAYMENT_NOT_PENDING`. Ya está cobrado.

### 5.4 Lo que no cierra la decisión, aunque suene a que debería

`mark_appointment_attended` y `mark_appointment_no_show` **no pueden tocar una decisión
tardía**, y la razón es de estado de la cita, no de dinero:

```sql
-- ambas, tras normalizar una 'scheduled' ya vencida a 'past_pending':
IF v_appt.status <> 'past_pending' THEN
  RAISE EXCEPTION 'APPOINTMENT_NOT_PAST_PENDING';
```

Una cita `cancelled` o `rescheduled` jamás llega a `past_pending`. Su matriz de resoluciones
—`no_charge`, `charge_cash`, `charge_transfer`, `charge_transfer_request_proof`,
`charge_transfer_received`, `retain`— es un buen espejo de lo que el dueño pide, pero vive en
otro flujo y no aplica aquí.

### 5.5 La que deja a la paciente sin respuesta

La regla 2 del dueño dice que a la paciente se le avisa que **por política se aplicará el
cargo**. La regla 4 dice que después la profesional decide. Falta la tercera mitad: **la
paciente nunca se entera de qué decidió.**

De las tres funciones que resuelven, **una sola le manda algo**:

```sql
select proname,
       prosrc like '%INSERT INTO public.whatsapp_outbox%' encola_wa,
       prosrc like '%INSERT INTO public.notifications%'   crea_aviso
from pg_proc where proname in
 ('waive_appointment_payment','credit_appointment_payment','request_appointment_payment_proof');
-- waive_appointment_payment          | false | false
-- credit_appointment_payment         | false | false
-- request_appointment_payment_proof  | true  | false   <- 'request_late_payment_proof'
```

Traducido a las cinco acciones del dueño:

| Acción | ¿La paciente recibe algo? |
|---|---|
| Pedir / volver a pedir comprobante | **Sí** — plantilla `request_late_payment_proof` |
| Cobrar en efectivo | No |
| Cobrar por transferencia recibida | No |
| Acreditar el comprobante | No |
| Retener el prepago | No |
| **Condonar** | **No** |

Los dos extremos son los que duelen. **Cobrar en efectivo**: a la paciente se le anunció un
cargo, nadie le dice cuánto ni cómo pagarlo, y `credit_appointment_payment` además **apaga**
los avisos de comprobante que quedaban en cola (`UPDATE public.whatsapp_outbox SET
cancelled = true WHERE template_key IN ('request_session_payment_proof',
'request_late_payment_proof','request_no_show_payment_proof')`). Se queda callada y sin
instrucción. **Condonar**: la profesional le perdona el cargo del que se le avisó, y la
paciente sigue creyendo que lo debe.

Esto **no es un choque con la base**: `whatsapp_outbox` está ahí y `request_proof` demuestra
cómo se encola desde una de estas funciones. Es una decisión de producto que este frente no
puede tomar, y que hay que poner delante del dueño con las palabras justas: *«cuando decides,
¿le avisamos a la paciente? ¿en las cinco acciones o sólo cuando hay que cobrarle?»* Mientras
no se decida, escribirlo como consecuencia aceptada, igual que §6.4.

---

## 6. Qué tiene que sellar exactamente la función del agente

Un cambio tardío es **una transacción, tres escrituras**: la cita, el pago, y el aviso.

### 6.1 La cita que se cierra — `public.appointments`

| Columna | Valor | Por qué, con su evidencia |
|---|---|---|
| `status` | `'cancelled'` o `'rescheduled'` | Los tres resolutores exigen `v_appt.status IN ('cancelled','rescheduled')` |
| `is_editable` | `false` | Coherencia con la superficie de la profesional; y `chk_appointment_confirmed_not_editable` lo exige si quedara `confirmed_at` |
| `cancelled_rescheduled_at` | `now()` | `get_appointment_detail` calcula `change_notice` **sólo** `IF … a.cancelled_rescheduled_at IS NOT NULL`. Sin él, la profesional decide a ciegas |
| `cancel_reschedule_actor` | `'patient'` | Es lo que distingue una decisión de la paciente de una de la profesional. Las dos filas resueltas de producción lo tienen así |
| `change_policy_result` | `'late'` | El hecho que justifica la decisión. `cancel_appointment` y `reschedule_appointment` escriben `NULL` aquí a propósito («esta superficie no evalua anticipacion»); la superficie de la paciente es la única que lo puede sellar |
| `confirmed_at` y `confirmation_source` | **al cancelar**, los dos a `NULL` **juntos**; al reprogramar, **no se tocan** | Ninguna restricción obliga a limpiarlos: `chk_appointment_confirmation_parity CHECK ((confirmed_at IS NULL) = (confirmation_source IS NULL))` sólo exige que se muevan **juntos**. Se limpian por imitación: el `UPDATE` de `cancel_appointment` los pone a `NULL`, y el de `reschedule_appointment` no. Prueba de que conservarlos también es legal: la fila `…0016` de producción está `cancelled`, con decisión resuelta, y **conserva `confirmed_at`** |
| `starts_at`, `modality`, `agreed_price` | **no se tocan** | Decisión del dueño: las tarjetas cerradas conservan hora y modalidad. Y si `agreed_price` dejara de coincidir con `payments.amount`, `get_appointment_detail` manda toda la tarjeta a «Revisar» |
| `updated_at` | `now()` | — |

El plazo que decide si es tarde sale de la fila, nunca de una constante:

```sql
v_policy_result := CASE
  WHEN v_appointment.starts_at - v_now
       >= make_interval(mins => v_policy.free_change_notice_minutes)
  THEN 'on_time' ELSE 'late' END;
```

Valores reales hoy: Miranda **720 min (12 h)**; las otras cuatro 1440.

### 6.2 El pago que se congela — `public.payments`

| Columna | Valor | Por qué |
|---|---|---|
| `status` | **sin cambio** | Eso *es* congelar. `pending` sigue `pending`, `credited` sigue `credited` |
| `method` | **sin cambio** | — |
| `proof_requested_at` | **sin cambio** | «Si estaba pendiente de comprobante, sigue pendiente de comprobante» |
| `payment_proofs` | **sin tocar** | El archivo es evidencia |
| `amount` | **sin cambio** | Si deja de casar con `agreed_price`, la tarjeta se apaga |
| `resolved_at` | **sin cambio** | `chk_payment_resolved_at` lo ata a `credited|waived`; escribirlo aquí rompería la restricción |
| **`charge_reason`** | `'cancellation'` o `'reschedule'` **si venía en `'session'`**; si no, se conserva | **La columna que no se puede olvidar.** Sin ella la fila desaparece de la facturación aunque la profesional cobre (§5.2) |
| **`late_change_decision`** | `'pending'` | La que abre la decisión |
| `late_change_decision_resolved_at` | **NULL** | `chk_late_decision_resolution` lo exige para `'pending'` |
| `late_change_decision_resolved_by` | **NULL** | `chk_late_decision_resolved_by` lo exige si el anterior es NULL |
| `updated_at` | `now()` | — |

Y el guardia de entrada, literal, tal como ya lo tiene escrita la función del árbol de trabajo:

```sql
WHERE id = v_payment.id
  AND late_change_decision IS NULL          -- no reabrir una decisión ya tomada
-- precedido de:
AND v_payment.status IN ('pending','credited')   -- nunca sobre not_applicable ni waived
```

Más una fila en `public.payment_events` (`event_type` es `text` libre, sin CHECK: no hay que
migrar nada para usar `'late_change_pending'`), con `actor='patient'` y el `command_id`.

**Un detalle de la cola que conviene saber.** El trigger `payments_apagar_cobro_au` sólo
dispara `WHEN (old.status='pending' AND new.status IN ('credited','waived'))`. Congelar no
cambia `status`, así que **no dispara**: los avisos de comprobante ya encolados sobreviven,
que es justo lo que queremos. Y el trigger de la cita, `tg_appointments_apagar_avisos`, al
salir de `scheduled` cancela `appointment_confirmation_request`,
`appointment_confirmation_prepay` y los tres recordatorios de 1 h —y **no** cancela los de
comprobante—. Comprobado leyendo `private.wa_apagar_avisos_de_cita`.

### 6.3 Lo que la función de la profesional NO va a poder hacer después

`public.cancel_appointment` revienta si se encuentra la decisión puesta:

```sql
-- Una cita scheduled valida no trae una decision tardia: esa dimension nace
-- al cerrar una cita desde la superficie del paciente/sistema.
IF v_pay.late_change_decision IS NOT NULL THEN
  RAISE EXCEPTION 'INVALID_PAYMENT_STATE' USING errcode = 'P0001';
END IF;
```

No es un problema —una cita ya cancelada no se vuelve a cancelar— pero deja claro que el
diseño previó exactamente esto: **la decisión tardía nace fuera de la app de la profesional.**

`public.reschedule_appointment`, en cambio, **no comprueba `late_change_decision` en ningún
sitio**. Exige `v_old.status='scheduled'` y `v_old_pay.status <> 'waived'`. En la práctica no
se alcanza —una cita con decisión abierta ya no está `scheduled`—, pero si alguna vez se
abriera la decisión sobre el pago de una cita `scheduled` (el caso 5.1(a)), la profesional
podría reprogramarla y su modo `'carry'` **no copia `late_change_decision` a la fila nueva**
(no está en la lista de columnas del `INSERT`), con lo que la decisión se evaporaría en
silencio junto con el pago viejo. Un motivo más para no abrirla nunca sobre una cita
`scheduled`.

### 6.4 El aviso a la profesional

`public.notifications.type` es `text` **sin CHECK** (`pg_constraint` sobre la tabla sólo trae
la PK, las FK y `chk_notification_payload_object`). Los tipos vivos hoy son nueve; los dos
que corresponden aquí son `appointment_cancelled_by_patient` y
`appointment_rescheduled_by_patient`, y su `payload` real en producción es:

```json
// appointment_cancelled_by_patient
{"patient_first_name":"Sofía","patient_last_name":null,
 "appointment_starts_at":"2026-08-17T15:00:00Z","appointment_ends_at":"2026-08-17T15:50:00Z",
 "appointment_modality":"in_person"}

// appointment_rescheduled_by_patient
{"patient_first_name":"Luis Ángel","patient_last_name":"Contreras",
 "previous_starts_at":"2026-08-16T18:00:00Z","previous_modality":"online",
 "new_starts_at":"2026-08-18T22:00:00Z","new_modality":"in_person"}
```

**No existe un tipo de aviso para «tienes una decisión de cobro pendiente».** Se puede añadir
sin migrar nada (la columna es texto libre), pero la app lo pintaría con su texto genérico
mientras no se toque —y la app es intocable esta ronda—. Consecuencia que hay que aceptar y
escribir: **el aviso que llega es el de la cancelación, y la decisión sólo se encuentra
tocando la tarjeta.**

---

## 7. El cambio a tiempo, para contraste

Mismo esquema, sin decisión abierta.

### 7.1 Cancelar a tiempo

| Estado del pago | Qué pasa | Cómo queda la tarjeta |
|---|---|---|
| Sin costo | La cita se cierra; el pago no se toca | `resolution_mode='free'`, sin badge, sin botones |
| Pendiente (desnudo, pedido o con comprobante) | El agente lo condona: `status='waived'`, `waive_reason='forgiven'`, `charge_reason` reclasificado, `resolved_at=now()` | badge «No cobrada», `resolution_mode='resolved'`, `action_mode='none'` |
| Acreditado (prepago) | **La función escrita no lo toca**: su rama a tiempo exige `v_payment.status='pending'` | `resolution_mode='resolved'`, badge **«Pagado»**, `action_mode='none'` |

El último renglón es dinero muerto, y hay que decirlo con precisión: el pago queda
`credited` + `charge_reason='session'` sobre una cita `cancelled`, así que `earns` es falso y
**la fila no aparece en Cobros ni como acreditada ni como pendiente**. Ninguna función de la
profesional lo puede reabrir: `waive` y `credit` exigen `late_change_decision='pending'` o un
`status` que ya no tiene; `mark_*` exigen `past_pending`.

Con la regla del dueño de que **una cita con dinero adentro no se cancela desde el agente**,
el caso no ocurre. Si esa regla cambiara, hay que abrir la decisión también en el caso a
tiempo, o el dinero se pierde de vista.

La definición operativa de «hay dinero adentro», que es la que debe usar el cerrojo:

```sql
p.status = 'credited'
OR EXISTS (SELECT 1 FROM public.payment_proofs pp WHERE pp.payment_id = p.id)
```

Una petición sellada sin archivo **no** cuenta.

**Y hay que decir en voz alta que ese cerrojo todavía no existe.** La función escrita
`agent_cancel_appointment_from_workflow` no lo tiene, así que hoy los dos renglones de arriba
—prepago y comprobante recibido, cancelados a tiempo— son fugas vivas, no casos hipotéticos.
El parche, escrito completo y con sus tres decisiones justificadas, está en `14-pasar-pago.md`
§1.5 y §8.2. El motivo de rechazo se llama **`APPOINTMENT_HAS_MONEY`** — el guion anterior lo
llamaba `PAYMENT_INSIDE`, pero el nombre que manda es el del frente 14, que es el que está
escrito en un parche concreto. **Sólo muerde `on_time`**, precisamente porque el camino tardío
que describe este documento sí tiene salida honesta y no hay por qué cerrarlo.

### 7.2 Reprogramar a tiempo

El dinero viaja, modo `'carry'`:

- El pago viejo pasa a `waived` + `waive_reason='carried_forward'` + `resolved_at=now()`, y
  **`charge_reason` se queda en `'session'`** —el `UPDATE` no lo toca—, así que `earns` es
  falso y la fila vieja no aparece en Cobros. Es lo correcto: el dinero está en la cita
  nueva. Se ve tal cual en la fila `…1e7d` de producción (§1).
  La tarjeta vieja muestra el badge **«Pago en la cita nueva»**
  (`payment_in_new_appointment`), `resolution_mode='resolved'`, `action_mode='none'`.
- El pago nuevo nace con el **mismo importe, estado y método**, `charge_reason='session'`, y
  `resolved_at=now()` sólo si venía `credited`.
- El comprobante se **copia** a la fila nueva (nueva fila en `payment_proofs`, mismo
  `storage_object_path`, mismo `received_at`).

  **Y eso deja dos filas apuntando al mismo archivo, que es una bomba con mecha larga.** La
  limpieza de Storage borra **por ruta** y nunca cuenta cuántas filas la referencian
  (`delete_recurrence_series`, `delete_service`, `deactivate_patient` y `delete_patient`, las
  cuatro igual). El día que cualquiera de las dos citas caiga en una de esas funciones, el
  archivo desaparece y la otra fila queda apuntando al vacío. Hoy es **latente**, no activo:
  nadie consume `public.jobs` (14 trabajos pendientes sin tocar) y `payment_proofs` tiene 0
  filas. Está medido en `14-pasar-pago.md` §5.3 y §9.2, y por eso la función de pasar el pago
  **mueve** en vez de copiar. Aquí no se toca: `reschedule_appointment` es de la profesional y
  la app es intocable esta ronda; lo que sí conviene es que **la función escrita del agente
  mueva, no copie**, cuando se reescriba su rama a tiempo.

**Un agujero que se hereda tal cual.** La petición de comprobante se copia con esta condición,
en las dos funciones —la desplegada de la profesional y la escrita del agente—:

```sql
CASE WHEN v_old_has_proof THEN v_old_payment.proof_requested_at ELSE NULL END
```

Es decir: **una petición sellada sin archivo se pierde al reprogramar**. La cita nueva nace
sin `proof_requested_at`, y nadie vuelve a pedirlo. Con la regla nueva esto sólo afecta al
cambio **a tiempo**, porque en el tardío el pago viejo ya no se arrastra.

---

## 8. Resumen: qué choca y cuál es el arreglo mínimo

| # | Choque con la base | Arreglo mínimo que respeta la intención |
|---|---|---|
| 1 | **Reprogramar tarde con el dinero viajando no tiene resolución posible.** El pago viejo queda `waived` (fuera de los tres resolutores) y el nuevo vive en una cita `scheduled` (fuera de los tres también). Cuatro guardias en cada sitio, citados en §5.1 | **Congelar en vez de arrastrar**, que es lo que dice la regla nueva. Y es el modo `'charge_old'` que `reschedule_appointment` **ya tiene desplegado**: pago viejo intacto sobre la cita `rescheduled`, pago nuevo propio en la cita nueva. Cero funciones nuevas, y con precedente |
| 2 | **`credit_appointment_payment` no reclasifica `charge_reason` desde un pago `pending`.** Cobrar deja la fila con `'session'` sobre una cita cerrada → `earns=false` → invisible en Cobros para siempre | **El agente sella `charge_reason` al abrir la decisión.** En cancelar **ya está escrito** en el árbol de trabajo; falta copiarlo a la rama de reprogramar con `'reschedule'`. Las tres funciones lo respetan después |
| 3 | **Abrir la decisión sobre un pago `not_applicable` mata la tarjeta** (`resolution_mode='review'`, sin botones) y las tres funciones la rechazan | **No abrirla cuando `status='not_applicable'`.** El guardia ya está escrito en el árbol de trabajo; que no se pierda |
| 4 | **Condonar un prepago escribe `'forgiven'`, no `'carried_forward'`.** El dinero real queda registrado como no cobrado y no se mueve a ninguna cita | Ninguno barato: `waive_appointment_payment` tiene el valor **fijo en el código**, sin parámetro, y sólo `reschedule_appointment` escribe `'carried_forward'`. Es una decisión de producto, no un arreglo |
| 5 | **No hay tipo de aviso para «decisión pendiente»** y la app es intocable esta ronda | Aceptarlo y escribirlo: llega el aviso de cancelación, y la decisión se encuentra tocando la tarjeta |
| 6 | **La decisión abierta es invisible en Cobros y en el punto del calendario** (`late_ok=false`; `get_days_with_appointments` filtra `scheduled`) | Es deliberado en Cobros. El único camino real es la tarjeta del día, que sí aparece en `get_appointments_by_day` |
| 7 | **La paciente nunca sabe qué se decidió.** De las tres funciones que resuelven, sólo `request_appointment_payment_proof` le manda algo; cobrar y condonar no encolan nada y `credit` además apaga los avisos de comprobante que quedaban (§5.5) | No es un choque con la base —`whatsapp_outbox` está listo y `request_proof` enseña cómo—: es una decisión de producto. Preguntar al dueño si se avisa, y en cuáles de las cinco acciones. Mientras tanto, aceptarlo y escribirlo |

**Y lo que NO choca, que es la mejor noticia del frente:** las cinco acciones que pidió el
dueño ya existen, ya están conectadas y ya coinciden una a una con los guardias de la base.
La app abre [Cobrar] y ofrece **Efectivo**, **Transferencia recibida** y **Pedir / Volver a
pedir comprobante** cuando el pago está pendiente sin archivo; ofrece **Acreditar pago**
cuando el archivo llegó; retiene sin preguntar cuando es prepago; y [No cobrar] condona en
todos los casos. Del lado de la profesional **no hay nada que construir**.

Con una salvedad, y es la del renglón 7: no hay nada que construir **para que ella decida**.
Para que la paciente se entere de lo que decidió, sí.
