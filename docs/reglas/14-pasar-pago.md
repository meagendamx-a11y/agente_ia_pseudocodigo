# 14 · Pasar el pago a la próxima cita

Corte: 2026-08-26 19:05 UTC. Todo lo de aquí está medido contra Supabase
`ssyzfeadyrczlzjbvxyl` («Agenda PSI V2») leyendo `pg_proc.prosrc`, `pg_constraint`,
`pg_trigger` y datos de producción. Lo que no se pudo comprobar está dicho como tal en la §9.

**Qué está desplegado y qué sólo está escrito.** En `pg_proc` hay exactamente 13 funciones
`agent_*`, y ninguna es de dominio: `agent_bind_inbound_execution`, `agent_claim_tool_call`,
`agent_complete_inbound`, `agent_complete_inbound_from_workflow`, `agent_finalize_tool_call`,
`agent_get_capabilities`, `agent_get_capabilities_from_workflow`,
`agent_get_inbound_resume_execution`, `agent_issue_option_handle`,
`agent_mark_inbound_completing`, `agent_mark_inbound_waiting`,
`agent_register_inbound_context` y `agent_resolve_option_token`.

Las hermanas que este documento cita como modelo —`agent_cancel_appointment_from_workflow`,
`agent_reschedule_appointment_from_workflow`, `agent_list_upcoming_appointments_from_workflow`—
**no están desplegadas**: viven en migraciones pendientes del repositorio de trabajo
(`supabase/migrations/20260825001000_agent_consultas_agenda.sql` y
`…/20260825003000_agent_citas_mutaciones.sql`). Cada vez que abajo se dice «la hermana»,
se habla de código escrito y sin aplicar. Lo desplegado se dice «desplegado».

---

## 0. La regla del dueño y qué significa contra la base

> «Pasar el pago a la próxima cita lo podemos dejar así de simple: o paso el link del
> comprobante y lo asigno a la próxima sesión, o le pongo a esa sesión el estado
> acreditado.»
>
> Se ofrece **solo cuando la cita tiene recurrencia**, junto con la opción de reprogramar,
> y **solo con tiempo mínimo**. Si la cita tiene dinero adentro, cancelar no se permite: o
> mueve, o pasa el pago.

Traducido a lo que hay:

| Frase del dueño | Cómo se ejecuta | Estado |
|---|---|---|
| «paso el link del comprobante y lo asigno a la próxima sesión» | la fila de `payment_proofs` **cambia de dueño**: pasa del pago de la cita vieja al pago de la cita destino | se puede |
| «le pongo a esa sesión el estado acreditado» | el pago de la cita destino queda `credited` con el método del pago que viajó | se puede |
| «solo cuando la cita tiene recurrencia» | **choca**: hay **cero** series de recurrencia en producción. Ver §7 y §8.1 | choca |
| «solo con tiempo mínimo» | el aviso de cambio de cada profesional (`free_change_notice_minutes`); se exige `on_time` | se puede |
| «o mueve, o pasa el pago» | el cerrojo que impide cancelar una cita con dinero adentro **todavía no existe**: hay que escribirlo. Es una migración aparte, §8.2 | **falta escribirlo** |

**El plazo mínimo puede valer cero.** `update_appointment_policies` sólo acepta
`free_change_notice_minutes` en `(0, 360, 720, 1440)`. Si una profesional pone 0, cualquier
cita futura sale `on_time` y «solo con tiempo mínimo» deja de significar algo. Hoy no pasa:
las cinco profesionales de producción tienen 1440 (cuatro) y 720 (una).

Las dos primeras frases **no son dos operaciones**: son las dos formas que puede tener el
mismo dinero al viajar. Si el pago que viaja está `credited`, la cita destino queda
acreditada. Si está `pending` con comprobante recibido, lo que viaja es el comprobante y
la cita destino queda pendiente de revisión. **Una sola función cubre las dos**, y el
resultado dice cuál de las dos ocurrió para que el agente no lo adivine.

---

## 1. Qué bloquea hoy — los cinco obstáculos, uno por uno

### 1.1 `reschedule_appointment` siempre crea una cita nueva — **CONFIRMADO**

Firma desplegada:

```
public.reschedule_appointment(
  p_appointment_id uuid, p_new_starts_at_local text, p_new_modality text,
  p_mode text, p_old_payment_action text, p_old_payment_method text,
  p_expected_updated_at timestamptz, p_command_id uuid)
```

**No hay ningún parámetro de destino.** El destino se describe con una hora local
(`p_new_starts_at_local`) y el cuerpo la convierte en una fila nueva:

```sql
v_new_appt_id := gen_random_uuid();
...
INSERT INTO public.appointments(
  id, professional_id, patient_id, service_id, status, modality,
  starts_at, ends_at, agreed_price, origin,
  confirmed_at, confirmation_source, is_editable, series_id,
  rescheduled_from_appointment_id, created_at, updated_at
) VALUES (
  v_new_appt_id, v_professional_id, v_old.patient_id, v_old.service_id,
  'scheduled', v_new_modality, v_new_starts, v_new_ends,
  v_old.agreed_price, v_old.origin,
  NULL, NULL, false, v_old.series_id, v_old.id, now(), now()
);
```

Lo mismo vale para la hermana escrita y sin desplegar
(`agent_reschedule_appointment_from_workflow`, migración `20260825003000`, línea 1302):
también termina en un `INSERT INTO public.appointments … RETURNING id INTO
v_new_appointment_id`. **Ninguna de las dos sabe apuntar a una cita que ya existe.**

### 1.2 Un pago por cita: trasladar es fusionar — **CONFIRMADO**

```
payments_appointment_id_key  UNIQUE (appointment_id)
payment_proofs_payment_id_key UNIQUE (payment_id)
```

La cita destino **ya nació con su pago**. No se puede insertar un segundo renglón para
ella. La única mecánica posible es **actualizar en su lugar** el pago que la cita destino
ya tiene, y **mover** la fila de comprobante en vez de duplicarla. Ver §5.

### 1.3 `get_next_scheduled_appointment` es de la profesional — **CONFIRMADO**

```
proname:    get_next_scheduled_appointment
args:       p_patient_id uuid, p_service_id uuid
prosecdef:  true (SECURITY DEFINER de postgres)
proacl:     {postgres=X/postgres, authenticated=X/postgres}
```

Primeras dos líneas ejecutables de su cuerpo:

```sql
v_professional_id := public.current_professional_id();
IF v_professional_id IS NULL THEN
  RAISE EXCEPTION USING errcode = '28000', message = 'AUTH_REQUIRED';
END IF;
```

El agente llega por el borde de servicio, sin `auth.uid()`: `AUTH_REQUIRED` garantizado.
Y su ACL no incluye `service_role` ni `agenda_psi_agent_owner`. **No se reusa.**

**Pero su regla sí sirve, y no exige serie.** Su consulta es:

```sql
WHERE a.professional_id = v_professional_id
  AND a.patient_id      = p_patient_id
  AND a.service_id      = p_service_id
  AND a.status          = 'scheduled'
  AND a.starts_at       > now()
ORDER BY a.starts_at, a.id LIMIT 1
```

«La próxima» del producto es **misma paciente + mismo servicio + futura y viva**.
`series_id` no aparece.

### 1.4 Un cuarto obstáculo que la auditoría previa no nombró: el portero

`private.agent_claim_tool_call` tiene el catálogo de operaciones **cerrado en el cuerpo**.
Las mutaciones autorizadas en `agent_node` son exactamente éstas:

```sql
ELSIF p_operation IN (
  'confirm_appointment', 'cancel_appointment',
  'cancel_then_open_booking_flow', 'reschedule_appointment',
  'switch_appointment_modality', 'resume_resource_delivery',
  'submit_review'
) THEN
  v_metadata_allowed := p_is_mutation;
  v_state_allowed := v_turn.status = 'active';
END IF;
```

Una operación que no esté en esa lista deja `v_metadata_allowed` en su valor inicial y
sale por `TOOL_NOT_ALLOWED`. **La función nueva no funciona sin migrar el portero.**
El parche está en §8.3.

### 1.5 Un quinto obstáculo: el cerrojo del dueño no existe

La regla dice «si la cita tiene dinero adentro, cancelar no se permite». **Hoy sí se
permite, y con dos fugas verificadas.** La hermana escrita
`agent_cancel_appointment_from_workflow` resuelve el dinero con dos ramas y nada más:

```sql
IF v_policy_result = 'on_time' AND v_payment.status = 'pending' THEN
  …status = 'waived', waive_reason = 'forgiven'…
ELSIF v_policy_result = 'late'
      AND v_payment.status IN ('pending','credited')
      AND v_payment.late_change_decision IS NULL THEN
  …late_change_decision = 'pending'…
END IF;
```

- **A tiempo con comprobante recibido** → cae en la primera rama: el pago queda
  `waived/forgiven`. La paciente transfirió de verdad y el registro dice «no se cobró».
- **A tiempo con pago acreditado** → **no cae en ninguna rama**: el pago se queda
  `credited` con `charge_reason='session'` colgando de una cita `cancelled`. En
  `get_billing_day` la condición `earns` exige `cancelled` con `charge_reason='cancellation'`,
  así que ese dinero **no aparece ni como acreditado ni como pendiente**. Desaparece de
  Cobros sin que nadie lo haya condonado.

Son los casos 1 y 2 de «dinero muerto verificado» de la auditoría previa. El cerrojo no es
adorno: es lo que los tapa. Cómo escribirlo, en §8.2.

---

## 2. Lo que sí existe y se reusa entero

`reschedule_appointment(p_mode := 'carry')` ya hace **exactamente el traslado de dinero
que el dueño describe** — sólo que hacia una cita que ella misma acaba de crear. Ese
bloque es la fuente:

```sql
UPDATE public.payments
   SET status = 'waived',
       waive_reason = 'carried_forward',
       resolved_at = now(),
       updated_at = now()
 WHERE id = v_old_pay.id;

INSERT INTO public.payments(... amount, status, method, charge_reason, charge_timing,
                            proof_requested_at, resolved_at ...)
VALUES (v_new_pay_id, v_new_appt_id, v_professional_id, v_old_pay.amount,
        v_old_pay.status, v_old_pay.method, 'session', v_old_pay.charge_timing,
        CASE WHEN v_old_has_proof THEN v_old_pay.proof_requested_at ELSE NULL END,
        CASE WHEN v_old_pay.status = 'credited' THEN now() ELSE NULL END, now(), now());

INSERT INTO public.payment_events(... event_type, from_status, to_status, actor,
                                  command_id, metadata ...)
VALUES
  (…, v_old_pay.id, 'carried_forward', v_old_pay.status, 'waived', 'professional',
   p_command_id, jsonb_build_object('carried_to_payment_id', v_new_pay_id), now()),
  (…, v_new_pay_id, 'carried_forward', NULL, v_old_pay.status, 'professional',
   p_command_id, jsonb_build_object('carried_from_payment_id', v_old_pay.id), now());
```

De aquí salen **los dos asientos enlazados** que pide el dueño: `payment_events` con
`event_type = 'carried_forward'` y las claves `carried_to_payment_id` /
`carried_from_payment_id` en `metadata`. **No hay que inventar ninguna columna nueva.**

Tres diferencias entre ese bloque y el que necesitamos, todas obligadas por §1.2:

| `reschedule_appointment` | La función nueva | Por qué |
|---|---|---|
| `INSERT` del pago nuevo | `UPDATE` del pago que la cita destino ya tiene | `UNIQUE (appointment_id)` |
| **copia** la fila de comprobante a un id nuevo | **mueve** la fila (`DELETE` + `INSERT`) | §5.3: dos filas sobre un mismo archivo son una bomba de limpieza |
| la cita vieja queda `rescheduled` | la cita vieja queda `cancelled` | aquí no hay cita nueva: la sesión se pierde y el dinero se adelanta |

---

## 3. La función nueva, escrita completa

### 3.1 Nombre y firma

```
public.agent_carry_payment_forward_from_workflow(
  p_provider_message_id text,
  p_kapso_execution_id  text,
  p_appointment_handle  uuid   -- la cita que se cancela: la que trae el dinero
) RETURNS jsonb
```

**Un solo identificador. El destino no se señala: lo resuelve el servidor.** Ésta es la
corrección que impuso el frente de recurrencias y hay que leerla antes de escribir nada.

El borrador pedía dos identificadores, el de la cita vieja y el de la cita destino, los dos
salidos de `agent_list_upcoming_appointments_from_workflow`. **Con la regla del dueño de «la más
próxima por serie» esa forma es imposible de armar en el caso que la motiva**: esa lista se
colapsa por `COALESCE(series_id, id)` (`12-recurrencias.md` §3.5 y §3.6), así que de cada serie
sólo la más próxima recibe identificador. Pedirle a la paciente que señale «la del 8» cuando la
del 8 es la segunda ocurrencia de su serie **no tiene renglón que señalar**.

El destino se calcula con la regla que el producto ya tiene escrita y desplegada, la de
`public.get_next_scheduled_appointment`:

```sql
WHERE a.patient_id = v_turn.patient_id
  AND a.service_id = v_old.service_id
  AND a.status     = 'scheduled'
  AND a.starts_at  > v_old.starts_at
ORDER BY a.starts_at, a.id
LIMIT 1
```

Es, literal, «la próxima sesión» de la frase del dueño. Y es mejor por tres razones que se
pueden comprobar: no depende del colapso, **desaparecen cuatro motivos de rechazo**
(`TARGET_EXPIRED`, `SAME_APPOINTMENT`, `TARGET_NOT_LATER`, `SERVICE_MISMATCH` — ninguno puede
ocurrir si el destino lo elige la propia consulta), y el modelo no puede equivocarse de cita
porque no escoge.

**Lo que se pierde, dicho sin maquillaje:** la paciente **no puede elegir a cuál de sus citas
futuras va el dinero. Siempre va a la más próxima del mismo servicio.** Si tiene dos y quería la
segunda, la respuesta es que eso lo ve con su profesional. Es la misma disciplina de una salida
del Flujo 10 del guion.

- Operación en el portero: `carry_payment_forward`, superficie `agent_node`, mutación,
  turno `active`.
- Ruta del gateway: `/tools/payments/carry-forward`.
- El identificador es de tipo `appointment` y **no se consume**
  (`chk_agent_option_tokens_kind_matrix` obliga a `kind='appointment'`,
  `entity_type='appointment'`, `one_time = false`).
- Sale de la lectura previa: `agent_list_upcoming_appointments_from_workflow` emite un
  `appointment_handle` por cada grupo de la lista colapsada (migración `20260825001000`,
  línea 1011). **No hace falta ninguna lectura nueva.**

Dos requisitos de operación que salen del portero desplegado y hay que decir en voz alta,
porque el modelo no los puede adivinar:

1. **El identificador tiene que nacer en el mismo turno que la mutación.**
   `private.agent_resolve_option_token` rechaza con `TOKEN_CONTEXT_INVALID` cualquier
   identificador cuyo `turn_id` no sea el del turno que llama
   (`v_token.turn_id IS DISTINCT FROM p_turn_id`). Listar las citas en un turno y pasar el
   pago en el siguiente no funciona.
2. **Caduca a los 15 minutos.** La lista lo emite con
   `LEAST(now() + interval '15 minutes', <expiración del turno>)`. Pasado eso la función
   contesta `OPTION_EXPIRED` y hay que volver a listar.

(La cita que se cancela **sí** es señalable siempre que sea la más próxima de su grupo, que es
el único caso en que el agente la puede tocar. Ver `12-recurrencias.md` §3.6.)

### 3.2 Motivos de rechazo

Diez, no trece: con el destino resuelto por el servidor, `TARGET_EXPIRED`, `SAME_APPOINTMENT`,
`TARGET_NOT_LATER` y `SERVICE_MISMATCH` **no pueden ocurrir** y no se escriben. Entra uno nuevo,
`NO_TARGET`, que es el caso del Flujo 10 del guion: no hay a dónde pasar el dinero, así que la
única salida es mover.

| `reason` | Cuándo |
|---|---|
| `OPTION_EXPIRED` | el identificador de la cita que trae el dinero ya no sirve |
| `APPOINTMENT_NOT_FOUND` | no es de esta paciente con esta profesional |
| `APPOINTMENT_NOT_CANCELLABLE` | no está `scheduled` |
| `APPOINTMENT_ALREADY_STARTED` | ya empezó |
| `PATIENT_INACTIVE` | la paciente ya no está activa |
| `LATE_CHANGE` | no hay tiempo mínimo: el aviso llegó tarde |
| `NO_MONEY_TO_CARRY` | la cita no tiene dinero adentro: entonces se cancela y ya |
| **`NO_TARGET`** | **no hay ninguna cita futura viva del mismo servicio a la cual pasar el dinero.** El agente ofrece mover, que es la otra salida del dueño |
| `TARGET_HAS_MONEY` | la próxima cita ya tiene dinero suyo o una decisión tardía abierta |
| `AMOUNT_MISMATCH` | los importes no coinciden (§4) |

### 3.3 El cuerpo

El preámbulo (validación de entrada, `whatsapp_inbound_messages`, `agent_turns`, claim,
réplica exacta) es **literalmente el de la hermana escrita
`agent_cancel_appointment_from_workflow`** (migración `20260825003000`, línea 871); sólo
cambian la llave, el discriminante y el nombre de la operación. Va abreviado; lo que sigue
al claim va completo.

Un detalle del portero desplegado que la llave tiene que respetar:
`private.agent_claim_tool_call` exige `p_input_sha256 ~ '^[0-9a-f]{64}$'` y revienta con
`INVALID_TOOL_CLAIM` si no. Los dos `md5` concatenados de abajo dan exactamente 64
caracteres hexadecimales, igual que en las hermanas.

**Antes de copiar este cuerpo, leer el §8.7:** dos de sus escrituras —el `DELETE` del paso 7b y
las columnas `amount` y `charge_timing` del paso 7c— **no están concedidas al rol del agente**, y
sin arreglarlo la función aborta a media transacción.

```sql
CREATE FUNCTION public.agent_carry_payment_forward_from_workflow(
  p_provider_message_id text,
  p_kapso_execution_id  text,
  p_appointment_handle  uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $agent_carry_payment_forward_from_workflow$
DECLARE
  v_inbound     public.whatsapp_inbound_messages%ROWTYPE;
  v_turn        public.agent_turns%ROWTYPE;
  v_claim       jsonb;
  v_finalize    jsonb;
  v_tool_call_key text;
  v_input_basis   text;
  v_input_sha256  text;
  v_command_id  uuid;
  v_data        jsonb;
  v_result      jsonb;
  v_reason      text;
  v_now         timestamptz;

  v_old_token   jsonb;
  v_old_id      uuid;
  v_target_id   uuid;   -- lo resuelve la consulta del paso 4, no un identificador

  v_old         public.appointments%ROWTYPE;
  v_target      public.appointments%ROWTYPE;
  v_old_pay     public.payments%ROWTYPE;
  v_target_pay  public.payments%ROWTYPE;
  v_old_proof   public.payment_proofs%ROWTYPE;
  v_old_has_proof boolean := false;
  v_target_has_proof boolean := false;

  v_policy      public.professional_appointment_policies%ROWTYPE;
  v_policy_result public.change_policy_result;
  v_new_charge_reason public.charge_reason;
  v_carried_state text;

  v_service_name text;
  v_timezone     text;
  v_professional_first_name text;
  v_patient_first_name      text;
  v_patient_last_name       text;
  v_patient_active boolean;
  v_rows integer;
BEGIN
  -- ---------------------------------------------------------------------
  -- 0) ENTRADA Y CONTEXTO. Idéntico a agent_cancel_appointment_from_workflow:
  --    forma de los dos textos, whatsapp_inbound_messages FOR UPDATE,
  --    agent_turns FOR UPDATE, y las nueve igualdades de identidad.
  --    Se omite aquí por ser copia literal.
  -- ---------------------------------------------------------------------
  IF p_appointment_handle IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_WORKFLOW_CARRY_PAYMENT_INPUT';
  END IF;
  -- … (bloque de contexto omitido) …

  -- ---------------------------------------------------------------------
  -- 1) CLAIM. El identificador de la cita que trae el dinero entra en la llave.
  --    El destino no: lo resuelve el paso 4, así que no hay dos comandos
  --    distintos que distinguir.
  -- ---------------------------------------------------------------------
  v_input_basis := pg_catalog.jsonb_build_object(
    'provider_message_id', p_provider_message_id,
    'kapso_execution_id',  p_kapso_execution_id,
    'appointment_handle',  p_appointment_handle
  )::text;
  v_tool_call_key := 'agent-node:carry-payment-forward:'
    || pg_catalog.md5(
         p_provider_message_id || ':' || p_kapso_execution_id
         || ':' || p_appointment_handle::text
       );
  v_input_sha256 := pg_catalog.md5(v_input_basis)
    || pg_catalog.md5(v_input_basis || ':agent-carry-payment-forward:v1');

  v_claim := private.agent_claim_tool_call(
    v_turn.id, p_kapso_execution_id, 'agent_node',
    'carry_payment_forward', v_tool_call_key, v_input_sha256, true
  );

  IF v_claim->>'status' = 'finalized'
     AND v_claim->>'reason' = 'EXACT_REPLAY'
     AND v_claim->>'outcome' IN ('committed', 'rejected_prewrite')
     AND pg_catalog.jsonb_typeof(v_claim->'redacted_result') = 'object' THEN
    RETURN v_claim->'redacted_result';
  END IF;

  IF v_claim->>'status' <> 'claimed'
     OR v_claim->>'reason' NOT IN ('CLAIMED', 'EXACT_REPLAY') THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'rejected', 'reason', v_claim->>'reason');
  END IF;

  v_command_id := (v_claim->>'command_id')::uuid;
  IF v_command_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'AGENT_WORKFLOW_CARRY_PAYMENT_CLAIM_REJECTED';
  END IF;

  v_now := pg_catalog.now();

  -- ---------------------------------------------------------------------
  -- 2) EL IDENTIFICADOR. No se consume: no hay hueco de por medio y la
  --    paciente puede equivocarse de cita sin quemar nada.
  -- ---------------------------------------------------------------------
  v_old_token := private.agent_resolve_option_token(
    v_turn.session_id, v_turn.id, p_appointment_handle, 'appointment', false);

  IF v_old_token->>'status' <> 'resolved' THEN
    v_data := pg_catalog.jsonb_build_object('applied', false, 'reason', 'OPTION_EXPIRED');
  ELSE
      v_old_id := (v_old_token->>'entity_id')::uuid;

      -- El advisory de agenda serializa todo lo del mismo profesional.
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('agenda:' || v_turn.professional_id::text, 0));

      SELECT appointment.* INTO v_old
        FROM public.appointments AS appointment
       WHERE appointment.id = v_old_id
         FOR UPDATE;

      -- ---------------------------------------------------------------
      -- 3) LA CITA QUE SE CANCELA.
      -- ---------------------------------------------------------------
      IF v_reason IS NULL THEN
        IF v_old.id IS NULL
           OR v_old.patient_id IS DISTINCT FROM v_turn.patient_id
           OR v_old.professional_id IS DISTINCT FROM v_turn.professional_id THEN
          v_reason := 'APPOINTMENT_NOT_FOUND';
        ELSIF v_old.status <> 'scheduled'::public.appointment_status THEN
          v_reason := 'APPOINTMENT_NOT_CANCELLABLE';
        ELSIF v_old.starts_at <= v_now THEN
          v_reason := 'APPOINTMENT_ALREADY_STARTED';
        END IF;
      END IF;

      -- ---------------------------------------------------------------
      -- 4) LA CITA DESTINO, RESUELTA POR EL SERVIDOR. Es la regla literal de
      --    public.get_next_scheduled_appointment: misma paciente, mismo
      --    servicio, viva y posterior, la primera. La paciente no la escoge:
      --    de una serie sólo la más próxima lleva identificador
      --    (12-recurrencias.md §3.6), así que señalarla sería imposible.
      --    El FOR UPDATE va en la misma consulta y respeta el orden por
      --    starts_at, que es el orden canónico de bloqueo de esta familia.
      -- ---------------------------------------------------------------
      IF v_reason IS NULL THEN
        SELECT appointment.* INTO v_target
          FROM public.appointments AS appointment
         WHERE appointment.patient_id      = v_turn.patient_id
           AND appointment.professional_id = v_turn.professional_id
           AND appointment.service_id      = v_old.service_id
           AND appointment.status          = 'scheduled'::public.appointment_status
           AND appointment.starts_at       > v_old.starts_at
         ORDER BY appointment.starts_at, appointment.id
         LIMIT 1
           FOR UPDATE;
        IF NOT FOUND THEN
          -- No hay a dónde pasar el dinero. La otra salida del dueño sigue
          -- viva: mover la cita.
          v_reason := 'NO_TARGET';
        END IF;
      END IF;

      IF v_reason IS NULL THEN
        SELECT patient.patient_status = 'active'::public.patient_status,
               patient.first_name, patient.last_name,
               professional.first_name, professional.timezone
          INTO v_patient_active, v_patient_first_name, v_patient_last_name,
               v_professional_first_name, v_timezone
          FROM public.patients AS patient
          JOIN public.professionals AS professional
            ON professional.id = patient.professional_id
         WHERE patient.id = v_turn.patient_id
           AND patient.professional_id = v_turn.professional_id;
        IF NOT FOUND OR NOT v_patient_active THEN
          v_reason := 'PATIENT_INACTIVE';
        END IF;
      END IF;

      -- ---------------------------------------------------------------
      -- 5) TIEMPO MÍNIMO. El plazo sale de la fila del profesional, nunca de
      --    una constante. Sin tiempo mínimo no hay traslado: el dinero de una
      --    sesión que se pierde a última hora lo resuelve el profesional.
      -- ---------------------------------------------------------------
      IF v_reason IS NULL THEN
        SELECT policy.* INTO v_policy
          FROM public.professional_appointment_policies AS policy
         WHERE policy.professional_id = v_turn.professional_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'AGENT_WORKFLOW_CARRY_PAYMENT_POLICY_MISSING';
        END IF;
        v_policy_result := CASE
          WHEN v_old.starts_at - v_now
               >= pg_catalog.make_interval(mins => v_policy.free_change_notice_minutes)
          THEN 'on_time'::public.change_policy_result
          ELSE 'late'::public.change_policy_result
        END;
        IF v_policy_result = 'late'::public.change_policy_result THEN
          v_reason := 'LATE_CHANGE';
        END IF;
      END IF;

      -- ---------------------------------------------------------------
      -- 6) LOS DOS PAGOS. Uno tiene que traer dinero; el otro tiene que estar
      --    limpio. Es toda la aritmética de la operación.
      -- ---------------------------------------------------------------
      IF v_reason IS NULL THEN
        PERFORM 1
           FROM public.payments AS payment
          WHERE payment.appointment_id IN (v_old.id, v_target.id)
          ORDER BY payment.id
            FOR UPDATE;

        SELECT payment.* INTO v_old_pay
          FROM public.payments AS payment WHERE payment.appointment_id = v_old.id;
        SELECT payment.* INTO v_target_pay
          FROM public.payments AS payment WHERE payment.appointment_id = v_target.id;
        IF v_old_pay.id IS NULL OR v_target_pay.id IS NULL THEN
          RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'AGENT_WORKFLOW_CARRY_PAYMENT_PAYMENT_MISSING';
        END IF;

        SELECT proof.* INTO v_old_proof
          FROM public.payment_proofs AS proof WHERE proof.payment_id = v_old_pay.id;
        v_old_has_proof := FOUND;

        v_target_has_proof := EXISTS (
          SELECT 1 FROM public.payment_proofs AS proof
           WHERE proof.payment_id = v_target_pay.id);

        -- «Hay dinero adentro» = acreditado, o con comprobante recibido. Una
        -- petición sellada sin archivo NO es dinero.
        IF NOT (v_old_pay.status = 'credited'::public.payment_status
                OR v_old_has_proof) THEN
          v_reason := 'NO_MONEY_TO_CARRY';
        ELSIF v_target_pay.status <> 'pending'::public.payment_status
              OR v_target_has_proof
              OR v_target_pay.late_change_decision IS NOT NULL THEN
          -- La cita destino ya tiene dinero suyo: dos pagos no caben en una
          -- sesión y esta función no acumula saldo.
          v_reason := 'TARGET_HAS_MONEY';
        ELSIF v_old_pay.amount <> v_target_pay.amount THEN
          v_reason := 'AMOUNT_MISMATCH';
        END IF;
      END IF;

      IF v_reason IS NOT NULL THEN
        v_data := pg_catalog.jsonb_build_object('applied', false, 'reason', v_reason);
      ELSE
        -- =============================================================
        -- EFECTO
        -- =============================================================

        -- 7a) La cita vieja se cierra. Conserva hora y modalidad como
        --     historial. confirmed_at y confirmation_source se limpian JUNTOS
        --     por chk_appointment_confirmation_parity.
        --     Este UPDATE dispara appointments_apagar_avisos_au, que cancela
        --     confirmación, prepago y los tres recordatorios de esta cita.
        UPDATE public.appointments
           SET status                   = 'cancelled'::public.appointment_status,
               is_editable              = false,
               confirmed_at             = NULL,
               confirmation_source      = NULL,
               cancelled_rescheduled_at = v_now,
               cancel_reschedule_actor  = 'patient'::public.actor_type,
               change_policy_result     = v_policy_result,
               updated_at               = v_now
         WHERE id = v_old.id
           AND status = 'scheduled'::public.appointment_status;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows <> 1 THEN
          RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'AGENT_WORKFLOW_CARRY_PAYMENT_EFFECT_FAILED';
        END IF;

        -- 7b) EL COMPROBANTE CAMBIA DE DUEÑO. Se borra y se vuelve a insertar,
        --     no se hace UPDATE del payment_id: el INSERT dispara
        --     payment_proofs_degradar_prepago_ai, que degrada el
        --     appointment_confirmation_prepay que la cita destino pudiera
        --     tener en cola. Un UPDATE no lo dispararía y la paciente
        --     recibiría una petición de dinero que ya entregó.
        --     UNIQUE (payment_id) se respeta porque el borrado va primero y
        --     porque la cita destino no tenía comprobante (v_target_has_proof).
        IF v_old_has_proof THEN
          DELETE FROM public.payment_proofs
           WHERE payment_id = v_old_pay.id;

          INSERT INTO public.payment_proofs (
            payment_id, storage_object_path, mime_type,
            size_bytes, checksum, received_at
          ) VALUES (
            v_target_pay.id, v_old_proof.storage_object_path,
            v_old_proof.mime_type, v_old_proof.size_bytes,
            v_old_proof.checksum, v_old_proof.received_at
          );
        END IF;

        -- 7c) EL PAGO DE LA CITA DESTINO SE FUSIONA CON EL QUE VIAJA.
        --     Conserva su id y su appointment_id; adopta importe, estado,
        --     método, momento de cobro, petición de comprobante y momento de
        --     resolución. charge_reason se queda en 'session': la sesión
        --     destino sigue siendo una sesión.
        --     proof_requested_at viaja SIEMPRE, y no con el CASE WHEN
        --     v_old_has_proof que usa reschedule_appointment. El caso que eso
        --     salva es acotado —un pago ya credited que además traía una
        --     petición sellada— porque un pending con petición y sin archivo ni
        --     siquiera llega aquí: lo para NO_MONEY_TO_CARRY. Aun así viaja,
        --     por no repetir el «caso 3» de dinero muerto de la auditoría.
        --     La pareja (proof_requested_at, method) viaja junta, así que
        --     chk_payment_proof_requested_transfer se conserva.
        --     Si el pago que viaja está pending, este UPDATE no cambia el
        --     estado y no dispara nada; si está credited, dispara
        --     payments_apagar_cobro_au, que cancela las peticiones de dinero
        --     en cola de la cita destino y degrada su prepago.
        UPDATE public.payments
           SET amount             = v_old_pay.amount,
               status             = v_old_pay.status,
               method             = v_old_pay.method,
               charge_timing      = v_old_pay.charge_timing,
               proof_requested_at = v_old_pay.proof_requested_at,
               resolved_at        = v_old_pay.resolved_at,
               updated_at         = v_now
         WHERE id = v_target_pay.id
           AND status = 'pending'::public.payment_status;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows <> 1 THEN
          RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'AGENT_WORKFLOW_CARRY_PAYMENT_EFFECT_FAILED';
        END IF;

        -- 7d) EL PAGO VIEJO SE CIERRA COMO TRASLADADO, y su motivo de cobro se
        --     reclasifica session -> cancellation porque su cita quedó
        --     cancelled, igual que hacen cancel_appointment y
        --     agent_cancel_appointment_from_workflow.
        v_new_charge_reason := CASE
          WHEN v_old_pay.charge_reason = 'session'::public.charge_reason
          THEN 'cancellation'::public.charge_reason
          ELSE v_old_pay.charge_reason
        END;

        UPDATE public.payments
           SET status        = 'waived'::public.payment_status,
               waive_reason  = 'carried_forward'::public.waive_reason,
               charge_reason = v_new_charge_reason,
               resolved_at   = v_now,
               updated_at    = v_now
         WHERE id = v_old_pay.id;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows <> 1 THEN
          RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'AGENT_WORKFLOW_CARRY_PAYMENT_EFFECT_FAILED';
        END IF;

        -- 7e) LOS DOS ASIENTOS ENLAZADOS. Mismo event_type y mismas claves que
        --     usa reschedule_appointment en modo 'carry', más el importe y la
        --     cita que el pago destino traía antes: nada se pierde.
        INSERT INTO public.payment_events
              (payment_id, event_type, from_status, to_status,
               actor, command_id, metadata)
        VALUES
          (v_old_pay.id, 'carried_forward',
           v_old_pay.status, 'waived'::public.payment_status,
           'patient'::public.actor_type, v_command_id,
           pg_catalog.jsonb_build_object(
             'surface', 'agent',
             'carried_to_payment_id',     v_target_pay.id,
             'carried_to_appointment_id', v_target.id,
             'change_policy_result',      v_policy_result::text)),
          (v_target_pay.id, 'carried_forward',
           v_target_pay.status, v_old_pay.status,
           'patient'::public.actor_type, v_command_id,
           pg_catalog.jsonb_build_object(
             'surface', 'agent',
             'carried_from_payment_id',     v_old_pay.id,
             'carried_from_appointment_id', v_old.id,
             'replaced_amount',             v_target_pay.amount,
             'proof_moved',                 v_old_has_proof));

        -- 7f) AVISO AL PROFESIONAL. Ver §6: el tipo es el único que su app sabe
        --     pintar para este hecho, y las claves son las del contrato.
        SELECT service.name INTO v_service_name
          FROM public.services AS service WHERE service.id = v_old.service_id;

        INSERT INTO public.notifications (
          type, appointment_id, patient_id, professional_id, payload
        ) VALUES (
          'appointment_cancelled_by_patient',
          v_old.id,
          v_turn.patient_id,
          v_turn.professional_id,
          pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'patient_first_name',    v_patient_first_name,
            'patient_last_name',     v_patient_last_name,
            'appointment_starts_at', v_old.starts_at,
            'appointment_ends_at',   v_old.ends_at,
            'appointment_modality',  v_old.modality::text,
            'surface',               'agent',
            'command_id',            v_command_id,
            'change_policy_result',  v_policy_result::text,
            'payment_carried_to_appointment_id', v_target.id))
        );

        -- NO se encola nada en whatsapp_outbox: la paciente está en la
        -- conversación y el agente le contesta en ese mismo turno. Ver §6.1.

        v_carried_state := CASE
          WHEN v_old_pay.status = 'credited'::public.payment_status THEN 'credited'
          ELSE 'proof_received'
        END;

        v_data := pg_catalog.jsonb_build_object(
          'applied', true,
          'outcome', 'payment_carried_forward',
          'service_name',             v_service_name,
          'professional_first_name',  v_professional_first_name,
          'timezone',                 v_timezone,
          'cancelled_starts_at_local', pg_catalog.to_char(
            v_old.starts_at AT TIME ZONE v_timezone, 'YYYY-MM-DD"T"HH24:MI:SS'),
          'target_starts_at_local', pg_catalog.to_char(
            v_target.starts_at AT TIME ZONE v_timezone, 'YYYY-MM-DD"T"HH24:MI:SS'),
          'target_modality',       v_target.modality::text,
          'carried_state',         v_carried_state,
          'proof_moved',           v_old_has_proof,
          'change_policy_result',  v_policy_result::text,
          'charged',               false
        );
      END IF;
  END IF;

  IF v_data->>'applied' = 'true' THEN
    INSERT INTO public.command_log
          (scope_type, scope_id, command_id, command_type,
           request_hash, actor, result, completed_at, created_at)
    VALUES ('agent_patient', v_turn.patient_id, v_command_id,
            'agent_carry_payment_forward', v_input_sha256,
            'patient'::public.actor_type, v_data, v_now, v_now)
    ON CONFLICT (scope_type, scope_id, command_id) DO NOTHING;
  END IF;

  v_result := pg_catalog.jsonb_build_object(
    'status', 'ok',
    'turn_disposition',
      CASE WHEN v_data->>'applied' = 'true' THEN 'close' ELSE 'keep_open' END,
    'result', v_data
  );

  v_finalize := private.agent_finalize_tool_call(
    v_turn.id, v_tool_call_key,
    CASE WHEN v_data->>'applied' = 'true' THEN 'committed' ELSE 'rejected_prewrite' END,
    v_result
  );
  IF v_finalize->>'status' <> 'finalized'
     OR v_finalize->>'reason' NOT IN ('FINALIZED', 'EXACT_REPLAY')
     OR v_finalize->'redacted_result' IS DISTINCT FROM v_result THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'AGENT_WORKFLOW_CARRY_PAYMENT_FINALIZE_REJECTED';
  END IF;

  RETURN v_result;
END;
$agent_carry_payment_forward_from_workflow$;

REVOKE ALL ON FUNCTION public.agent_carry_payment_forward_from_workflow(text, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agent_carry_payment_forward_from_workflow(text, text, uuid)
  TO service_role;
COMMENT ON FUNCTION public.agent_carry_payment_forward_from_workflow(text, text, uuid) IS
  'Cancels one appointment with money in it and merges its payment into the next appointment of the same service.';
```

---

## 4. Qué pasa si los importes no coinciden

**La regla: no se traslada. Se rechaza con `AMOUNT_MISMATCH` y el agente ofrece mover.**

```sql
ELSIF v_old_pay.amount <> v_target_pay.amount THEN
  v_reason := 'AMOUNT_MISMATCH';
```

Por qué, con las dos cuentas hechas:

- Si viajan **800** y la cita destino cuesta **1 000**: al ponerle `credited` con
  `amount = 800`, `get_billing_day` sumará 800 el día que la sesión se marque asistida.
  El importe queda bien, pero la paciente cree que ya no debe nada y **debe 200 que nadie
  le va a cobrar**: no hay ningún renglón que registre un saldo parcial.
- Si viajan **1 000** y la cita destino cuesta **800**: al fusionar con `amount = 1 000`
  la profesional cobra 1 000 por una sesión de 800. Al revés, si se conservara el importe
  de la destino, **200 se evaporan sin asiento**, que es exactamente el dinero muerto que
  todo lo demás está intentando cerrar.

No hay tercera salida barata: el esquema **no tiene renglón de saldo**. `payments` es una
fila por cita, con `amount` `NOT NULL` y `chk_payment_amount (amount >= 0)`. Verificado:
entre las 38 tablas de `public` no hay **ni una sola columna** cuyo nombre contenga
`balance`, `wallet` o `saldo`.

**Recomendación: dejarlo así y no construir nada más.** En producción el caso no existe.
Lo que compara la función es `payments.amount`, no `appointments.agreed_price`, así que la
consulta mira las dos columnas:

```sql
with t as (
  select a.patient_id, a.service_id,
         count(distinct a.agreed_price) as n_precio,
         count(distinct p.amount)       as n_amount
    from public.appointments a
    join public.payments p on p.appointment_id = a.id
   group by 1,2)
select count(*) as pares,
       count(*) filter (where n_precio > 1) as pares_precio_variable,
       count(*) filter (where n_amount > 1) as pares_amount_variable
  from t;
-- pares = 16 | pares_precio_variable = 0 | pares_amount_variable = 0
```

**Las 16 combinaciones de paciente + servicio que existen tienen un solo precio y un solo
importe cobrado.** El
importe sólo puede diferir si la profesional cambia el precio del servicio o el precio
preferente de esa paciente entre las dos citas. Cuando pase, la salida es la de siempre:
mover la cita, que traslada el dinero completo sin tocar importes.

---

## 5. Qué pasa con el pago que la cita destino ya tenía

Es el punto que nadie había resuelto. La mecánica exacta, y por qué ninguna restricción se
rompe.

### 5.1 No se condona: se fusiona en su lugar

La cita destino nació con su pago propio, `pending`, con su `amount`. **Ese renglón no se
borra, no se condona y no se duplica: se sobrescribe.** Conserva su `id` y su
`appointment_id` —los dos únicos campos que no pueden cambiar— y adopta del pago que viaja
el importe, el estado, el método, el momento de cobro, la petición de comprobante y el
momento de resolución.

Condonarlo sería un error de registro: `waived/forgiven` significa «no se cobró», y aquí
sí se cobró, sólo que antes. Y no se puede condonar y luego insertar otro:
`UNIQUE (appointment_id)` lo prohíbe, y un pago `waived` sobre una cita `scheduled` deja a
`mark_appointment_attended` sin salida —su matriz termina en
`RAISE … 'INVALID_PAYMENT_STATE'` para cualquier estado que no sea
`not_applicable | credited | pending`—.

### 5.2 Ninguna restricción se rompe

| Restricción | Estado después de fusionar | Por qué se cumple |
|---|---|---|
| `payments_appointment_id_key UNIQUE (appointment_id)` | una fila por cita | no se inserta nada; se actualiza la que ya estaba |
| `payment_proofs_payment_id_key UNIQUE (payment_id)` | una fila por pago | el `DELETE` va antes del `INSERT`, y el guardia `TARGET_HAS_MONEY` garantiza que el pago destino no tenía comprobante |
| `chk_payment_not_applicable_amount` (`status='not_applicable' ⇔ amount = 0`) | se cumple | la restricción es una equivalencia: un pago `pending` **no puede** tener importe 0, así que el destino trae importe > 0 y el origen también (`AMOUNT_MISMATCH` los obliga a ser iguales). El estado que llega nunca es `not_applicable`, porque el guardia de dinero exige `credited` o comprobante |
| `chk_payment_credited_method` (`credited ⇒ method NOT NULL`) | se cumple | `method` viaja del origen, y el origen ya cumplía la misma restricción |
| `chk_payment_resolved_at` (`credited|waived ⇔ resolved_at NOT NULL`) | se cumple | `status` y `resolved_at` viajan **como pareja** desde el origen, que ya cumplía |
| `chk_payment_waive_reason` (`waived ⇔ waive_reason NOT NULL`) | se cumple | el pago viejo se cierra con `waived` **y** `waive_reason='carried_forward'` en el mismo `UPDATE` |
| `chk_payment_proof_requested_transfer` (`proof_requested_at NOT NULL ⇒ method='transfer'`) | se cumple | `proof_requested_at` y `method` viajan **como pareja**; si el origen tenía petición, su `method` ya era `'transfer'` por esta misma restricción |
| `chk_late_decision_resolution` / `_resolved_by` | se cumple | ninguna de las dos columnas se toca, y `TARGET_HAS_MONEY` exige `late_change_decision IS NULL` en el destino |
| `payment_events_payment_id_fkey` | se cumple | los dos pagos siguen existiendo; el evento del destino cuelga de una fila viva |
| `appointments_rescheduled_from_appointment_id_fkey` | intacta | esta operación **no** escribe `rescheduled_from_appointment_id`: no hubo reprogramación |
| `excl_appointments_no_overlap` | intacta | no se crea ni se mueve ningún intervalo |

### 5.3 Por qué el comprobante se **mueve** y no se copia

`reschedule_appointment` copia la fila de comprobante a un `id` nuevo. Aquí no se puede
hacer lo mismo, y la razón es dura:

```sql
-- public.delete_recurrence_series, public.delete_service,
-- public.deactivate_patient y public.delete_patient hacen todas esto:
SELECT COALESCE(array_agg(DISTINCT pp.storage_object_path ...), '{}')
  INTO v_proof_paths
  FROM public.payments pay
  JOIN public.payment_proofs pp ON pp.payment_id = pay.id
 WHERE pay.appointment_id = ANY(v_appointments_to_delete);

INSERT INTO public.jobs (type, run_after, status, payload, dedup_key)
VALUES ('storage_cleanup_payment_proofs', now(), 'pending',
        jsonb_build_object('bucket', 'comprobantes',
                           'object_paths', to_jsonb(v_proof_paths)), …);
```

**La limpieza borra por ruta de archivo y nunca cuenta cuántas filas apuntan a esa ruta.**
Dos filas de `payment_proofs` sobre el mismo `storage_object_path` significan que el día
que una de las dos citas caiga en cualquiera de esas cuatro funciones, el archivo
desaparece y la otra fila queda apuntando al vacío. Moverla evita el problema entero: una
fila, un archivo.

Y la forma del movimiento —`DELETE` y luego `INSERT`, no `UPDATE payment_id`— es
deliberada. El disparador que apaga la petición de prepago es **AFTER INSERT**:

```
payment_proofs_degradar_prepago_ai
  AFTER INSERT ON public.payment_proofs FOR EACH ROW
  EXECUTE FUNCTION tg_payment_proofs_degradar_prepago_ai()
```

y su cuerpo degrada `appointment_confirmation_prepay → appointment_confirmation_request`
en las filas de la cola cuyo `payload->>'payment_id'` es el del pago que acaba de recibir
comprobante. Con un `UPDATE` no se dispararía, y la paciente recibiría una plantilla
pidiéndole el dinero que acaba de trasladar.

### 5.4 Lo que ve la profesional después

| Dónde | Antes | Después |
|---|---|---|
| Cobros del día de la cita vieja | nada (era futura) | **nada**: el pago quedó `waived` y `get_billing_day` sólo suma `credited` o `pending` con petición/comprobante. La reclasificación a `cancellation` no cambia esto |
| Cobros del día de la cita destino | nada (sigue futura) | **nada** hasta que la sesión se cierre. `get_billing_day` sólo mira citas `attended | no_show | cancelled | rescheduled` |
| Cobros el día que marque asistida la destino | — | aparece **acreditada** con el importe. `mark_appointment_attended` con pago `credited` no pide acción y deja `credited/session`; `earns` empareja `attended` con `session` |
| Bandeja de avisos | — | «Cita cancelada · {paciente} canceló su cita {modalidad} del {día}, de {hora} a {hora}.» |

**La reclasificación de `charge_reason` no mueve un peso en Cobros**, y hay que decirlo con
la razón correcta. `get_billing_day` no filtra «primero por estado y luego por motivo»: es
un solo filtro con todo pegado, y el estado del pago sólo admite dos valores:

```sql
WHERE earns
  AND late_ok
  AND (
    payment_status = 'credited'
    OR (payment_status = 'pending' AND (was_requested OR has_proof))
  )
```

Un pago `waived` no es ninguno de los dos, así que queda fuera con cualquier
`charge_reason`. Se reclasifica por coherencia del registro y para no dejar una excepción a
la regla que sigue `cancel_appointment` (desplegada) y que repite la hermana escrita.

---

## 6. Los avisos

### 6.1 A la paciente: nada por plantilla

**No se encola nada en `whatsapp_outbox`.** La paciente está escribiendo en ese momento;
el agente le contesta en el mismo turno con `send_notification_to_user`. Encolar
`appointment_cancelled` sería un eco: le llegaría dos veces lo mismo, una de ellas como
plantilla fría.

**Esto se aparta a propósito de la hermana escrita.**
`agent_cancel_appointment_from_workflow` **sí** encola `appointment_cancelled` con
`dedup_key = 'appointment_cancelled:' || professional_id || ':' || command_id`. Aquí no se
hace, y la razón no es que no se pueda —se podría, la plantilla existe y pide 4 variables—
sino que el texto de esa plantilla dice sólo «se canceló tu cita» y callaría justo lo único
que la paciente quiere oír: que su dinero viajó. Un eco que además miente por omisión es
peor que ningún eco. **Si el dueño prefiere que quede rastro fuera de la conversación, la
salida barata es encolar `appointment_cancelled` igual que la hermana; la salida cara es la
plantilla nueva del párrafo siguiente.**

Además, **no existe ninguna plantilla que diga lo que hay que decir**, y crear una no es
barato. El catálogo vive dentro del cuerpo de `private.wa_payload_ok(text, jsonb)` y lo
impone `chk_outbox_variables`:

```sql
ELSE jsonb_array_length(p_payload -> 'variables') = CASE p_template
       WHEN 'appointment_cancelled'                 THEN 4
       WHEN 'appointment_rescheduled'               THEN 6
       …
       ELSE -1
     END
```

Una clave desconocida devuelve `-1` y **el INSERT revienta**. Añadir «tu pago se pasó a tu
sesión del X» exige migrar esa función y dar de alta la plantilla en Meta. No hace falta:
la conversación está abierta.

**El texto lo escribe el modelo desde los campos del resultado, no desde lo que cree.**
Las dos ramas del dueño salen de `carried_state`:

| `carried_state` | Lo que dice el agente |
|---|---|
| `credited` | «Listo, cancelé tu cita del {cancelled_starts_at_local} y tu pago quedó acreditado en tu sesión del {target_starts_at_local}. {professional_first_name} ya recibió el aviso.» |
| `proof_received` | «Listo, cancelé tu cita del {cancelled_starts_at_local} y pasé tu comprobante a tu sesión del {target_starts_at_local}. {professional_first_name} lo va a revisar.» |

En la segunda rama **no aparecen «pagado» ni «aprobado»**: un comprobante recibido queda
pendiente de revisión y eso no lo resuelve el agente.

### 6.2 A la profesional: una fila en su bandeja

```sql
INSERT INTO public.notifications (type, appointment_id, patient_id, professional_id, payload)
VALUES ('appointment_cancelled_by_patient', v_old.id, …, jsonb_build_object(
  'patient_first_name',    …,
  'patient_last_name',     …,
  'appointment_starts_at', v_old.starts_at,
  'appointment_ends_at',   v_old.ends_at,
  'appointment_modality',  v_old.modality::text, …));
```

**Las cinco primeras claves son el contrato y no son negociables.** El renderizador de la
app (`flutter_application_1/lib/pages/notifications/notification_models.dart`) arma el texto
así:

```dart
'appointment_cancelled_by_patient' when name != null && window != null =>
  NotificationPresentation(
    title: 'Cita cancelada',
    message: '$name canceló su cita ${window.modality} del ${window.date}, '
             'de ${window.start} a ${window.end}.',
    tone: NotificationTone.danger,
    highlight: name,
  ),
```

`name` sale de `patient_first_name` (obligatorio, no vacío) más `patient_last_name`
(opcional). `window` **necesita las tres**: `appointment_starts_at`, `appointment_ends_at` y
`appointment_modality`; si falta una sola, `_appointmentWindow` devuelve `null` y la tarjeta
cae en `_neutralPresentation`: «Nueva notificación · Hay una actualización reciente en tu
cuenta.». La modalidad además tiene que llegar exactamente como `'online'` o `'in_person'`;
cualquier otro texto también devuelve `null`. Y las dos horas tienen que traer huso
(`_parseOffsetInstant` exige que terminen en `Z` o en `±HH:MM`), que es justo lo que produce
un `timestamptz` metido en `jsonb_build_object`.

**La hermana escrita escribe `starts_at`, no `appointment_starts_at`, y nunca el nombre: sus
avisos llegarían en blanco.** Aquí van bien desde el primer día.

**Por qué se reusa `appointment_cancelled_by_patient` y no se inventa un tipo nuevo.**
`notifications.type` es `TEXT` sin restricción, así que un tipo nuevo entra en la base sin
migrar nada. Pero el renderizador termina en:

```dart
_ => _neutralPresentation,
```

Un tipo que la app no conoce se pinta en blanco, y **la app del profesional es intocable en
esta ronda**. Lo que la profesional ve es cierto —su paciente canceló esa cita— y el dato
del traslado viaja en el `payload` (`payment_carried_to_appointment_id`) esperando a que
alguien lo pinte.

**Lo que hay que saber y no maquillar:** con este aviso la profesional **se entera de la
cancelación y no del traslado**. Se cierra el día que la app aprenda un tipo nuevo; hasta
entonces el registro está completo en `payment_events` y la tarjeta de la cita destino
dirá «Pagado» cuando la abra.

---

## 7. Cuántas pacientes de producción podrían usar esto hoy

**Cero. Por cualquiera de las tres definiciones.**

```sql
select count(*) filter (where is_active) as series_activas, count(*) as series_total
  from public.recurrence_series;
-- series_activas = 0 | series_total = 0
```

```sql
select a.patient_id, a.service_id, count(*) as futuras_mismo_servicio
  from public.appointments a
 where a.status = 'scheduled' and a.starts_at > now()
 group by 1,2 having count(*) >= 2;
-- 0 filas
```

```sql
with dinero as (
  select a.status, a.starts_at, a.series_id, p.status as pay_status,
         exists(select 1 from public.payment_proofs pp where pp.payment_id = p.id) as has_proof
    from public.appointments a join public.payments p on p.appointment_id = a.id)
select count(*) filter (where status='scheduled' and starts_at > now())            as citas_futuras_vivas,
       count(*) filter (where status='scheduled' and starts_at > now()
                          and (pay_status='credited' or has_proof))                as futuras_con_dinero,
       count(*) filter (where status='scheduled' and starts_at > now()
                          and series_id is not null)                               as futuras_con_serie
  from dinero;
-- citas_futuras_vivas = 0 | futuras_con_dinero = 0 | futuras_con_serie = 0
```

El retrato completo:

| Medida | Valor |
|---|---|
| Series de recurrencia (activas / totales) | **0 / 0** |
| Citas `scheduled` en toda la base | **1** |
| …de ésas, todavía futuras | **0** |
| …de ésas, con dinero adentro | **0** |
| …de ésas, con serie | **0** |
| Pacientes con dos o más citas futuras del mismo servicio | **0** |
| Filas en `public.payment_proofs` | **0** |
| Pagos totales | 41: 33 `credited`, 7 `pending`, 1 `waived`, 0 `not_applicable` |
| …con `proof_requested_at` sellado | **5**, de los cuales **4 siguen `pending`** (el quinto ya está `credited`). Los 4 son la fila 3 de la matriz de `13-decision-tardia.md` §2; ahí el conteo se da sobre los `pending`, por eso dice 4 y aquí 5 |
| Combinaciones paciente + servicio | 16, **todas con un solo precio y un solo importe** |

Las 41 citas de producción se reparten así: 32 `attended`, 3 `past_pending`, 2 `no_show`,
2 `rescheduled`, 1 `cancelled`, **1 `scheduled`**.

La única `scheduled` empezó a las **2026-08-26 19:00 UTC**, cinco minutos antes de este
corte, con un pago `pending` de 800.00 y sin comprobante. O sea: **hoy no hay ni una sola
cita futura viva en toda la base**. La auditoría anterior contaba 1 porque midió antes de
esa hora; no es que se haya borrado nada.

Dos consecuencias que hay que decir en voz alta:

1. **Esta operación no se puede probar contra datos reales.** No hay una sola pareja de
   citas que la ejerza. Se prueba sembrando en una rama, nunca en producción.
2. **La auditoría anterior contaba «1 comprobante»; hoy `public.payment_proofs` tiene 0
   filas.** El dato cambió entre cortes. Con cero comprobantes en toda la historia, la rama
   `proof_received` —la mitad de la regla del dueño— **nunca ha ocurrido**.

---

## 8. Lo que hay que tocar además de la función

### 8.1 El choque con «solo cuando la cita tiene recurrencia»

**El choque:** exigir `series_id IS NOT NULL` deja la operación muerta al nacer. Hay cero
series y ninguna función desplegada las crea con datos reales; la condición no se cumpliría
nunca.

**El arreglo mínimo, que respeta la intención:** la intención de «recurrencia» es que
**exista una próxima sesión de lo mismo a la que empujar el dinero**. Eso ya tiene una
definición en el producto y no es la serie:

```sql
-- public.get_next_scheduled_appointment, cuerpo desplegado
AND a.patient_id = p_patient_id
AND a.service_id = p_service_id
AND a.status     = 'scheduled'
AND a.starts_at  > now()
```

Por eso la consulta del paso 4 **es** esa regla —mismo servicio, `scheduled`, posterior, la
primera— y **no** mira `series_id`. Si mañana las series se usan, sigue siendo cierta para ellas
sin cambiar una línea: dos citas de la misma serie son, por construcción, dos citas del mismo
servicio, así que la próxima ocurrencia de la serie **es** el destino que la consulta encuentra.

Y hay que decir por qué eso importa más de lo que parece: **con series vivas, ésta es la única
forma que funciona.** El destino no se puede señalar con un identificador, porque la lista de
citas próximas se colapsa por serie y la segunda ocurrencia no lleva ninguno
(`12-recurrencias.md` §3.6). Resolver el destino en el servidor no es una simplificación: es lo
que hace que la operación exista en el caso que el dueño describió.

### 8.2 El cerrojo del dueño — migración obligatoria

Sin esto la función nueva es una salida más, no *la* salida: la paciente puede seguir
cancelando y quemando su dinero por el camino de §1.5. El parche va en
`agent_cancel_appointment_from_workflow`, justo **antes** de la matriz económica y
**después** de cargar `v_payment` (migración `20260825003000`, alrededor de la línea 1129):

```sql
IF v_reason IS NULL
   AND v_policy_result = 'on_time'::public.change_policy_result
   AND (v_payment.status = 'credited'::public.payment_status
        OR EXISTS (SELECT 1 FROM public.payment_proofs AS proof
                    WHERE proof.payment_id = v_payment.id)) THEN
  v_reason := 'APPOINTMENT_HAS_MONEY';
END IF;
```

Tres decisiones dentro de esas seis líneas, y las tres tienen razón:

- **«Dinero adentro» se define igual que en la función nueva**: acreditado, o con
  comprobante recibido. Una petición sellada sin archivo no es dinero. Si las dos
  definiciones no coinciden, aparece una cita que no se puede cancelar y tampoco se puede
  pasar: un callejón sin salida.
- **Sólo muerde `on_time`.** Cancelar tarde con dinero adentro ya tiene salida honesta hoy:
  la segunda rama abre `late_change_decision='pending'` y decide la profesional en su app.
  Ese camino no pierde un peso y no hay por qué cerrarlo.
- **El motivo se llama `APPOINTMENT_HAS_MONEY`**, no «no se puede»: el agente lo lee y
  ofrece las dos salidas del dueño —mover la cita, o pasar el pago—.

**El límite que crea el cerrojo, dicho sin maquillaje:** una paciente a tiempo, con dinero
adentro, sin próxima cita del mismo servicio a la cual pasarlo y sin hueco libre al cual
moverse, se queda sin ninguna salida por WhatsApp. Tiene que hablar con su profesional. Es
consecuencia directa de la regla, no un defecto de la implementación.

### 8.3 El portero — migración obligatoria

Sin esto la función devuelve `TOOL_NOT_ALLOWED` siempre. Es una línea dentro de
`private.agent_claim_tool_call`:

```sql
ELSIF p_operation IN (
  'confirm_appointment', 'cancel_appointment',
  'cancel_then_open_booking_flow', 'reschedule_appointment',
  'switch_appointment_modality', 'resume_resource_delivery',
  'submit_review',
  'carry_payment_forward'            -- <— añadir
) THEN
  v_metadata_allowed := p_is_mutation;
  v_state_allowed := v_turn.status = 'active';
END IF;
```

Sube el catálogo del portero de 26 a 27 operaciones. **No hace falta tocar
`v_tenantless_allowed`**: es una mutación y exige inquilina viva, que es lo correcto.

### 8.4 El gateway

Una ruta más en las dos listas de `supabase/functions/agent_tool_gateway/handler.ts`:
`FUTURE_AGENT_ROUTES` (la lista de rutas conocidas, línea 13) y `DOMAIN_ROUTES` (el mapa de
rutas encendidas, línea 456). Una ruta que esté en la primera y no en la segunda contesta
403 `OPERATION_NOT_ENABLED`, que es el apagador por operación.

```ts
'/tools/payments/carry-forward',
…
['/tools/payments/carry-forward', (deps, raw) =>
  run(raw, parseCarryForwardInput, (input) => deps.carryPaymentForward(input))],
```

`parseCarryForwardInput` **no** es `parseRescheduleInput` renombrado: ése pide
`['appointment_handle', 'slot_handle']`, y un `slot_handle` es un identificador de hueco, no
de cita. Con el destino resuelto por el servidor (§3.1) el molde es el de **un solo
identificador de cita**, idéntico al de confirmar y al de cancelar:

```ts
function parseCarryForwardInput(raw: Uint8Array): CarryForwardInput | null {
  return parseExactBody(raw, ['appointment_handle'], (input, correlated) =>
    handleText(input.appointment_handle)
      ? { ...correlated, appointmentHandle: input.appointment_handle }
      : null);
}
```

Que el modelo mande **un** argumento y no dos también es lo que aconseja el hallazgo §7.2 de la
auditoría: cuanto más plano el esquema, menos probable el modo de fallo del JSON anidado
malformado.

### 8.5 Capacidades

**No hace falta una clave nueva.** `agent_get_capabilities` ya enciende
`manage_next_appointment` cuando la relación es de inquilina, la paciente está activa y hay
cita próxima:

```sql
'manage_next_appointment', v_relationship_state = 'tenant'
  AND v_patient_active AND v_has_upcoming,
```

El traslado es una forma de gestionar la próxima cita y cae ahí dentro.

### 8.6 Qué desaparece con esta función

`cancel_then_open_booking_flow` **no está implementada en ninguna parte**: el nombre sólo
aparece en el catálogo del portero y en `FUTURE_AGENT_ROUTES`; no hay función que la
ejecute ni entrada en `DOMAIN_ROUTES`. Así que hoy no evapora nada, porque no puede
correr. La fuga viva es la de §1.5, y la tapa el cerrojo de §8.2.

Lo que sí se puede decir: con el cerrojo más esta función, la paciente que quiere deshacerse
de una cita pagada tiene dos salidas honestas —mover, o adelantar el dinero— y ninguna que
queme su pago. **Entonces la maniobra de saga ya no tiene para qué nacer**: `saga_state` con
sus cuatro valores, el `mutation_limit` variable, la reserva del ordinal 8 y el guardia
`tool_call_count > 3`. Quitarla es una decisión aparte de este frente; aquí sólo queda
apuntado que nada de este documento la necesita.

### 8.7 Dos privilegios que faltan, y sin ellos la función revienta

Esto no se había medido y es bloqueante. El rol `agenda_psi_agent_owner` es el dueño de la
función, así que la función escribe **con los privilegios de ese rol**. Se leyó el inventario
completo de GRANT de las siete migraciones del árbol de trabajo
(`grep "GRANT .* TO agenda_psi_agent_owner"`) y se comprobó contra la base con
`has_table_privilege`. Faltan dos, y los dos los usa el §3.3:

**1 · `DELETE` sobre `public.payment_proofs`.** El paso 7b **mueve** la fila del comprobante con
`DELETE` y luego `INSERT`. La migración `20260825000000_agent_dominio_fundamento.sql:149` concede
**sólo `INSERT`** de seis columnas, y ninguna migración concede `DELETE` sobre esa tabla.
Comprobado hoy: `has_table_privilege('agenda_psi_agent_owner','public.payment_proofs','DELETE')`
→ **falso** (y el `SELECT` tampoco está aplicado todavía; está escrito en la línea 75 de la misma
migración). Sin el `DELETE`, la operación aborta con `insufficient_privilege` **después** de
haber cancelado la cita, y la transacción entera se va atrás: la paciente recibe un error y su
cita sigue viva. Falta:

```sql
GRANT DELETE ON public.payment_proofs TO agenda_psi_agent_owner;
```

Es el único `DELETE` que necesita el agente en toda su superficie, y conviene decir por qué es
seguro: `payment_proofs` tiene `UNIQUE (payment_id)` y la fila que borra es la que acaba de
leer del pago que viaja, dentro de la misma transacción que la vuelve a insertar.

**2 · `UPDATE (amount, charge_timing)` sobre `public.payments`.** El paso 7c fusiona el pago del
destino copiándole seis columnas del que viaja: `amount`, `status`, `method`, `charge_timing`,
`proof_requested_at`, `resolved_at`. El GRANT escrito
(`20260825000000_agent_dominio_fundamento.sql:137`) es por columnas y son éstas:

```sql
GRANT UPDATE (status, method, charge_reason, waive_reason,
              proof_requested_at, resolved_at,
              late_change_decision, updated_at)
  ON public.payments TO agenda_psi_agent_owner;
```

**`amount` y `charge_timing` no están.** Falta añadirlas a esa lista. Y hay que decir que no es
una omisión tonta del que la escribió: **ninguna otra operación del agente cambia el importe de
un cobro**, y no dárselo es un cerrojo real. Ésta es la única que lo necesita, y sólo para
copiar un importe que `AMOUNT_MISMATCH` ya obligó a ser idéntico.

Si el dueño prefiere no abrir `amount`, hay una salida sin GRANT nuevo: como los dos importes
son iguales por el guardia, **el `UPDATE` puede no tocar `amount` ni `charge_timing`**. Se pierde
la instantánea del `charge_timing` del pago que viaja —la cita destino se queda con el suyo, que
es de la misma política y del mismo profesional— y se gana un permiso menos. **Recomendación:
esta segunda**, que es la más simple y no toca el inventario de privilegios. Entonces el §3.3
paso 7c queda en cuatro columnas: `status`, `method`, `proof_requested_at`, `resolved_at`, más
`updated_at`.

---

## 9. Lo que no se pudo comprobar

1. **El comportamiento en vivo.** Cero parejas de citas en producción que ejerzan la
   operación, cero comprobantes en la base y cero mutaciones del agente en toda la historia
   del libro mayor. Todo lo de este documento está verificado **contra el esquema y contra
   los cuerpos de las funciones desplegadas**, no contra una ejecución.
2. **El consumidor de `public.jobs`.** La limpieza de comprobantes de §5.3 se apoya en un
   trabajo que hoy **nadie consume** (la auditoría lo verificó: no hay `claim_jobs_batch`
   ni `dispatch_jobs` en `pg_proc`, y hoy hay **14 trabajos pendientes** sin tocar en
   `public.jobs`). El riesgo de
   copiar la fila de comprobante es real pero **latente**: se materializa el día que alguien
   escriba el consumidor. Mover en vez de copiar lo cierra por adelantado y no cuesta nada.
3. **Cómo se ve la tarjeta de la cita destino en la app** después de la fusión. Se leyó
   `get_billing_day` y `mark_appointment_attended`, que son los que gobiernan Cobros y el
   cierre; no se leyó `get_appointment_detail` en este frente.
4. **Si la profesional acepta enterarse sólo de la cancelación.** §6.2 lo deja escrito como
   límite conocido, no resuelto: es decisión de producto, no de base.
5. **La fórmula `on_time`/`late` no tiene precedente desplegado.** Las dos funciones
   desplegadas que cierran una cita —`cancel_appointment` y `reschedule_appointment`—
   escriben `change_policy_result = NULL` a propósito («esta superficie no evalua
   anticipacion», dice el comentario de la primera). La comparación
   `starts_at - now() >= make_interval(mins => free_change_notice_minutes)` sale de la
   hermana escrita y sin desplegar (migración `20260825003000`, línea 1074). Este documento
   la copia tal cual para que las dos coincidan, pero nadie la ha ejecutado nunca.
