# Recurrencias y la regla de la más próxima por serie

Corte: 2026-08-26, 19:04 UTC (segunda pasada, de refutación). Proyecto auditado: Supabase
`ssyzfeadyrczlzjbvxyl` («Agenda PSI V2»).
Todo lo de aquí está comprobado contra la base desplegada: nombre de función, fragmento de
`prosrc`, restricción o consulta ejecutada con su resultado. Lo que no se pudo comprobar se
dice que no se pudo.

**Las tres reglas del dueño que este documento verifica:**

1. La recurrencia es **cada semana, cada dos semanas y cada cuatro semanas**.
2. Al agendar, si el servicio elegido tiene recurrencia, se le explica **cada cuánto, qué día
   de la semana, a qué hora y cuál es su próxima cita**, y se le pregunta si de verdad quiere
   otra de ese servicio.
3. Para confirmar y para el comprobante: **la más próxima por serie, y todas las sueltas**.

---

## 0. El veredicto

| Regla del dueño | ¿Se sostiene contra la base? | Dónde está el detalle |
|---|---|---|
| Cada semana / cada dos / cada cuatro | **Sí, literal.** El enum tiene exactamente esos tres valores | §1.2 |
| Explicar cada cuánto, qué día, a qué hora | **Sí, pero las tres salen de la tabla de series**, no de las citas | §1.1, §2.3 |
| Explicar cuál es su próxima cita | **Sí, y más barato de lo que parece:** no se calcula, se lee | §2 |
| La más próxima por serie + todas las sueltas | **Sí, en una sola consulta de siete renglones** | §3 |
| «Si hay **dos series vivas**…» | **Sí, pero sólo de servicios distintos.** Un índice único lo impone | §5.1 |
| Dos series **del mismo servicio** | **Imposible por construcción.** Esa rama no hay que escribirla | §5.1 |
| Una serie + una cita suelta del mismo servicio | **Posible y frecuente.** Nada lo impide | §5.2 |

**El choque no es con el modelo de datos sino con los permisos, y es más grande de lo que
parecía:** el agente **no puede leer la tabla de series**, y ahí viven **tres** de las cuatro
cosas que el dueño quiere decir — cada cuánto, qué día de la semana y a qué hora. Sólo «cuál es
tu próxima cita» está hoy a su alcance. Se arregla con un `GRANT SELECT`, y con soltar los tres
asertos y el comentario de migración que hoy prohíben ese permiso a propósito (§2.4).

**Dos cosas más que hay que leer antes de escribir nada:**

- **La lista colapsada es también la lista de lo que se puede tocar.** Cada renglón que sale de
  la lista de citas próximas lleva un identificador opaco, y confirmar, cancelar, mover y
  cambiar modalidad **exigen ese identificador**. Colapsar por serie significa que el agente
  sólo puede actuar sobre la más próxima de cada serie (§3.6).
- **La regla del colapso no se aplica al comprobante.** El comprobante no pasa por la lista de
  citas: pasa por la lista de cobros, que es otra consulta, sobre `payments`, y que no filtra
  por serie. Aplicarle el colapso escondería hasta veintinueve cobros vivos (§3.7).

**Series activas hoy: cero.** La rama existe sin un solo dato que la ejercite (§4).

---

## 1. Cómo está guardada una recurrencia

### 1.1 La tabla

Sólo hay una, y se llama como se esperaba: `public.recurrence_series`.

```sql
select table_schema, table_name from information_schema.tables
 where table_name ilike '%recurr%' or table_name ilike '%serie%';
-- public | recurrence_series      (una sola fila de resultado)
```

Sus catorce columnas reales:

| # | Columna | Tipo | Nulo | Predeterminado |
|---|---|---|---|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |
| 2 | `professional_id` | `uuid` | no | — |
| 3 | `patient_id` | `uuid` | no | — |
| 4 | `service_id` | `uuid` | no | — |
| 5 | `modality` | `modality` | no | — |
| 6 | `frequency` | `recurrence_frequency` | no | — |
| 7 | `start_date` | `date` | no | — |
| 8 | `weekday` | `smallint` | no | — |
| 9 | `start_time` | `time` | no | — |
| 10 | `max_sessions` | `integer` | **sí** | — |
| 11 | `end_date` | `date` | **sí** | — |
| 12 | `is_active` | `boolean` | no | `true` |
| 13 | `created_at` | `timestamptz` | no | `now()` |
| 14 | `updated_at` | `timestamptz` | no | `now()` |

**La recurrencia no es una propiedad del servicio.** `public.services` tiene doce columnas y
ninguna habla de recurrencia (`id`, `professional_id`, `name`, `default_price`, `is_free`,
`duration_minutes`, `buffer_after_minutes`, `modality`, `is_marketplace`, `is_active`,
`created_at`, `updated_at`). La recurrencia vive en el **trío profesional + paciente +
servicio**. Esto importa para la regla 2: «el servicio elegido tiene recurrencia» no se
pregunta al catálogo, se pregunta a la fila de esta paciente con ese servicio.

### 1.2 El enum de frecuencia — coincide con la regla del dueño, palabra por palabra

```sql
select t.typname, e.enumsortorder, e.enumlabel
  from pg_type t join pg_enum e on e.enumtypid = t.oid
 where t.typname = 'recurrence_frequency' order by e.enumsortorder;
-- recurrence_frequency | 1 | weekly
-- recurrence_frequency | 2 | biweekly
-- recurrence_frequency | 3 | every_4_weeks
```

Y el paso en días sale del cuerpo de `public.create_recurrence_series`, literal:

```sql
-- Paso de dias por frecuencia (incrementos EXACTOS desde start_date).
v_step_days := CASE p_frequency
                 WHEN 'weekly'        THEN 7
                 WHEN 'biweekly'      THEN 14
                 WHEN 'every_4_weeks' THEN 28
               END;
```

**Tres valores, ni uno más. No hay «mensual», no hay «cada tres semanas», no hay día del mes.**
El modelo es de semanas exactas, así que el día de la semana nunca cambia dentro de una serie.

### 1.3 Las restricciones que hay que respetar

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'public.recurrence_series'::regclass;
```

| Restricción | Qué dice, literal | Qué significa para el agente |
|---|---|---|
| `chk_recurrence_weekday` | `((weekday >= 0) AND (weekday <= 6))` | 0 = domingo … 6 = sábado |
| `chk_recurrence_start_weekday` | `((weekday)::numeric = EXTRACT(dow FROM start_date))` | El día de la semana **no se guarda aparte**: es el de `start_date`. No pueden discrepar |
| `chk_recurrence_has_limit` | `((max_sessions IS NOT NULL) OR (end_date IS NOT NULL))` | Ninguna serie es infinita |
| `chk_recurrence_max_sessions` | `((max_sessions IS NULL) OR ((max_sessions >= 1) AND (max_sessions <= 30)))` | Tope de 30 **cuando se fija número**; `max_sessions` puede ser nulo y entonces manda `end_date` |
| `chk_recurrence_end_date` | `((end_date IS NULL) OR (end_date >= start_date))` | — |
| `uq_recurrence_series_owner` | `UNIQUE (id, professional_id)` | Sirve para llaves foráneas con dueño |
| `recurrence_series_patient_id_fkey` | `FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE` | Borrar a la paciente borra la fila madre, y con ella el `series_id` de sus citas (§1.5) |

Y el índice que gobierna la regla 3 del dueño:

```sql
CREATE UNIQUE INDEX ix_recurrence_series_active
    ON public.recurrence_series (professional_id, patient_id, service_id)
 WHERE is_active;
```

**Como mucho una serie viva por paciente y por servicio.** No es una convención escrita en una
función: es un índice único parcial, y la base lo rechaza sola. De ahí sale todo el §5.

### 1.4 El horizonte

Del cuerpo de `create_recurrence_series`, paso 10, literal:

```sql
-- 10) HORIZONTE — solo el servidor controla el horizonte por fecha. Sin limite de
--     sesiones, se deriva y persiste end_date = start_date + 6 meses; con limite,
--     max_sessions satisface chk_recurrence_has_limit.
v_end_date := CASE
  WHEN p_max_sessions IS NULL THEN (p_start_date + INTERVAL '6 months')::date
  ELSE NULL
END;
```

Y el paso 11 genera los candidatos así, literal:

```sql
INSERT INTO pg_temp.recurrence_cands (candidate_number, cdate)
SELECT gs + 1, p_start_date + (gs * v_step_days)
FROM generate_series(0, 29) AS gs
WHERE (p_max_sessions IS NULL OR gs + 1 <= p_max_sessions)
  AND (v_end_date IS NULL
       OR p_start_date + (gs * v_step_days) <= v_end_date);
```

**Cuidado con leer «treinta citas o seis meses»: los seis meses sólo existen cuando no se fija
número de sesiones.** El `v_end_date` del paso 10 es `NULL` en cuanto llega un `max_sessions`,
así que el segundo filtro se apaga y el único techo es el número. Lo que sí es siempre cierto
es el `generate_series(0, 29)`: **nunca más de treinta ocurrencias**.

La consecuencia para el agente es de calendario, no de tamaño: una serie de treinta sesiones
cada cuatro semanas abarca **812 días**, más de dos años. «Tu próxima» puede quedar cerca, pero
la serie de la que forma parte puede ser larguísima. Nada de suponer que una serie cabe en un
semestre.

### 1.5 Cómo se enlaza con las citas — y por qué `series_id` es lo único que vale

```sql
-- public.appointments, columna 16
series_id  uuid  NULL
-- appointments_series_id_fkey
FOREIGN KEY (series_id) REFERENCES recurrence_series(id) ON DELETE SET NULL
```

Además, `appointment_origin` tiene tres valores: `professional`, `patient`, **`recurring_series`**.

**Aquí está la trampa, y está viva en producción.** El `ON DELETE SET NULL` significa que una
cita puede **conservar `origin = 'recurring_series'` y perder `series_id`**.

Hay que contar bien **a qué citas les pasa**, porque `public.delete_recurrence_series` no se
limita a borrar la fila madre. En orden, lo que hace:

1. Pone `is_active = false` mientras corre la transacción.
2. Si hay una ocurrencia futura dentro de 26 h, la **cancela** y avisa a la paciente por
   plantilla; su cobro pendiente se condona, o se reclasifica a `cancellation` si ya había
   comprobante.
3. **Borra en duro (`DELETE`) todas las demás citas futuras `scheduled` de la serie.** Con
   ellas se van, por `ON DELETE CASCADE`, sus `payments`, sus `payment_proofs` y sus
   `payment_events`; los archivos de comprobante se encolan para limpieza en Storage.
4. Recién entonces borra la fila de `recurrence_series`.

El comentario del paso 9 lo dice con todas sus letras:

```sql
-- 9) HARD-DELETE DE recurrence_series
--    appointments.series_id usa ON DELETE SET NULL: las citas pasadas y la única
--    cancelada dentro de 26 h permanecen como historial sin apuntar a una serie
--    que el profesional ya eliminó.
```

**O sea: el `SET NULL` sólo alcanza a lo que no es futuro-y-`scheduled`** — las pasadas, la
cancelada de las 26 h, y cualquiera en `rescheduled`, `attended`, `no_show` o `cancelled`. Las
futuras vivas no quedan huérfanas: dejan de existir.

Comprobado hoy contra la base:

```sql
select count(*) filter (where series_id is not null) as citas_con_serie,
       count(*) filter (where origin = 'recurring_series') as citas_origen_serie
  from public.appointments;
-- citas_con_serie = 0 | citas_origen_serie = 1
```

La cita huérfana existe y tiene nombre:

```sql
select id, status, origin, series_id, starts_at from public.appointments
 where origin = 'recurring_series';
-- aa9b70f9-8f36-4191-b3b1-8a97bdc58432 | rescheduled | recurring_series | NULL | 2026-08-27 13:45+00
```

Encaja con lo de arriba: está en `rescheduled`, no en `scheduled`, y por eso el borrado en duro
no la tocó y sí le vació el `series_id`. **Lo que no se pudo comprobar es qué evento concreto la
dejó así**: la fila no guarda rastro de ello, `recurrence_series` está vacía y no hay bitácora
que lo diga. Se documenta el mecanismo, no la historia de esta fila.

**Consecuencia dura, y va en el diseño:** para agrupar por serie, **`origin` no sirve**. La
única señal fiable es `series_id`. Una cita puede decir que nació de una serie y no pertenecer
ya a ninguna.

### 1.6 Qué le pasa a `series_id` cuando la cita se mueve

`public.reschedule_appointment` (la del profesional) inserta la cita nueva con
`v_old.series_id`:

```sql
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

Y la del agente, escrita y sin desplegar
(`supabase/migrations/20260825003000_agent_citas_mutaciones.sql`, línea 1719), hace lo mismo:
pasa `v_old.series_id`.

**Traducción:** mover una cita de serie **no la saca de la serie**; la deja en la serie, en un
día y una hora que ya no coinciden con `weekday` ni con `start_time` de la fila madre.

En cambio `public.create_appointment` **siempre** crea citas sueltas, y lo dice en el propio
comentario del INSERT:

```sql
NULL         -- series_id           : esta funcion siempre crea citas sueltas
```

La función de crear del agente (misma migración, línea 473) también pasa `NULL`.

### 1.7 La fila madre es una declaración, no un calendario

Esto es lo más importante del apartado, y es la razón de que el §2 salga barato.

`create_recurrence_series` **materializa todas las citas de una vez**, al crear la serie:

```sql
INSERT INTO public.appointments (
  professional_id, patient_id, service_id, status, modality,
  starts_at, ends_at, agreed_price, origin,
  confirmed_at, confirmation_source, is_editable, series_id, created_at, updated_at
)
SELECT
  v_professional_id, p_patient_id, p_service_id, 'scheduled', v_modality,
  c.starts_at, c.ends_at, v_agreed_price, 'recurring_series',
  CASE WHEN c.starts_at <= v_now + INTERVAL '48 hours' THEN v_now END,
  ...
  v_series_id, v_now, v_now
FROM pg_temp.recurrence_cands c
WHERE c.available
ORDER BY c.candidate_number;
```

Fíjate en el `WHERE c.available`: las ocurrencias que no caben **se pueden saltar**. Pero
saltarlas **no es automático**, y esto es lo que hay que leer completo antes de diseñar nada.
El paso 16 resuelve cuatro salidas, no dos:

```sql
-- 16) RESOLVER allow_partial -> outcome (tabla del contrato):
--       Todo disponible                    -> created_all           (escribe todo)
--       Conflictos y allow_partial = false -> conflicts (0 escrituras)
--       Conflictos y allow_partial = true  -> created_partial       (solo disponibles)
--       Nada disponible                    -> nothing_available      (0 escrituras, ni serie)
```

y la condición literal es:

```sql
-- Solo TRUE es aceptación explícita; FALSE y NULL conservan el resultado sin escritura.
IF v_skipped_count > 0 AND p_allow_partial IS NOT TRUE THEN
```

**Traducción: una serie con huecos sólo nace si el profesional aceptó los huecos a propósito**
(`p_allow_partial => true`). Si no lo hizo, no hay serie a medias: no hay serie ni citas ni
cobros, y la llamada devuelve `conflicts`.

De dónde salen los huecos, en orden de probabilidad: una cita propia que traslapa
(`PROFESSIONAL_OVERLAP`), un bloqueo del profesional (`BLOCKED_SLOT`), la agenda del consultorio
compartido si es presencial (`OFFICE_OVERLAP`) y — esto el borrador no lo tenía — **el cambio de
horario de verano**: el paso 12 marca no disponible cualquier ocurrencia cuya hora local no
exista o sea ambigua (`NONEXISTENT_LOCAL_TIME`, `AMBIGUOUS_LOCAL_TIME`). Una serie de los
domingos a las 2 de la mañana perdería una ocurrencia sin que nadie tocara nada.

**Así que una serie puede tener huecos.** La ocurrencia número N **no** es
`start_date + (N-1) × paso`. Sumado a §1.6 (mover conserva la serie), la conclusión es tajante:

> **Nunca calcules una fecha de serie con la fórmula. Léela de `appointments`.**

Y no hay nada que alargue una serie después: las siete tareas programadas activas son
`cron_sweep_past_pending`, `cron_confirmation_26h`, `cron_appointment_reminder_1h`,
`purge_command_log`, `purge_whatsapp_outbox`, `purge_whatsapp_inbound` y `sender_whatsapp`.
**Ninguna toca series.** Una serie nace completa y se va gastando.

Detalle de dinero que conviene tener presente, y que reaparece en §3.7: el paso 19 inserta
**un pago por cada cita de la serie**, todos `pending` si el precio es mayor que cero
(`not_applicable` si el servicio es gratis), con `charge_timing` congelado por cita. Una serie
de doce sesiones nace con **doce cobros pendientes**.

---

## 2. De dónde sale «tu próxima es tal fecha»

### 2.1 Lo que ya existe, y por qué el agente no lo puede usar

`public.get_next_scheduled_appointment(p_patient_id uuid, p_service_id uuid)`. Su cuerpo, literal:

```sql
SELECT a.starts_at INTO v_next
  FROM public.appointments a
 WHERE a.professional_id = v_professional_id
   AND a.patient_id      = p_patient_id
   AND a.service_id      = p_service_id
   AND a.status          = 'scheduled'
   AND a.starts_at       > now()
 ORDER BY a.starts_at, a.id
 LIMIT 1;
```

Dos cosas que hay que subrayar:

1. **No filtra por serie.** Su noción de «próxima» es «próxima de este servicio», con serie o
   sin ella. **Y eso no es lo que el renglón de recurrencia necesita**, aunque el borrador lo
   diera por bueno: como una serie y una cita suelta del mismo servicio conviven sin problema
   (§5.2), esta función puede devolver la suelta del viernes cuando lo que se quería decir era
   la sesión de la serie. Para el renglón de recurrencia hay que filtrar
   `series_id = <la serie>`, no `service_id`.
2. **El agente no puede llamarla.** Arranca con
   `v_professional_id := public.current_professional_id()` y su ACL es
   `{postgres=X/postgres, authenticated=X/postgres}`. Sin `auth.uid()`, `AUTH_REQUIRED`
   garantizado. Es el bloqueo 1 y el bloqueo 2 de la auditoría, otra vez.

### 2.2 De dónde sale para el agente

De `public.appointments` directamente, que el rol del agente **ya puede leer**:

```sql
select c.relname, c.relacl::text from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in ('appointments','services','recurrence_series');
-- appointments      | {... , agenda_psi_agent_owner=r/postgres}
-- services          | {... , agenda_psi_agent_owner=r/postgres}
-- recurrence_series | {postgres=..., anon=m, authenticated=m, service_role=...}   <-- SIN el agente
```

Y el rol tiene `rolbypassrls = true`, así que el `SELECT` no tropieza con las políticas.

**La consulta es la del §3 con `LIMIT 1` por serie.** No hace falta ninguna función nueva de
«calcular la siguiente ocurrencia»: esa función no debe existir, porque mentiría en cuanto haya
un hueco (§1.7) o una cita movida (§1.6).

### 2.3 Lo que sí exige leer la tabla de series — y son tres cosas, no una

Las cuatro cosas que el dueño quiere decir se reparten así:

| Qué se dice | De dónde sale | ¿Lo alcanza el agente hoy? |
|---|---|---|
| **Cuál es su próxima cita** | `appointments` (la más próxima con ese `series_id`) | **Sí** |
| **Cada cuánto** | `recurrence_series.frequency` | **No** |
| **Qué día de la semana** | `recurrence_series.weekday` | **No** |
| **A qué hora** | `recurrence_series.start_time` | **No** |

**El borrador de este documento se equivocaba aquí, y el error importa.** Decía que el día y la
hora se leen de la próxima cita, «porque mover una cita no cambia la fila madre». Es al revés:
precisamente porque mover una cita no cambia la fila madre, **la próxima cita puede haberse
movido y ya no representar el ritmo**. Si la serie es de miércoles a las 4 y esta ocurrencia se
pasó al viernes, leer el día de la cita hace que el agente diga «cada dos semanas, **los
viernes**», que es falso sobre la serie. El ritmo vive en `weekday` y `start_time`; la próxima
fecha vive en `appointments`. Son dos preguntas distintas y tienen dos fuentes distintas.

No es una interpretación: es lo que ya hace la app del profesional. `get_patient_detail`
devuelve `frequency`, `weekday` y `start_time` **de la fila madre** (§2.5), y pide la próxima
cita por separado.

Ninguna de las tres se puede inferir de las citas. La frecuencia se rompe en cuanto una
ocurrencia se saltó (§1.7) o se movió (§1.6); el día y la hora se rompen con una sola
ocurrencia movida. **Inferirlo sería intuir.**

**Y la buena noticia es que las tres viajan en la misma fila.** El permiso que hacía falta para
`frequency` trae `weekday` y `start_time` de regalo: no hay ningún costo adicional por corregir
esto.

**El arreglo mínimo que respeta la intención del dueño es un permiso de lectura** (y sólo de
lectura):

```sql
GRANT SELECT ON public.recurrence_series TO agenda_psi_agent_owner;
```

Hoy la migración escrita lo descarta a propósito. En
`supabase/migrations/20260825000000_agent_dominio_fundamento.sql`, apartado 1.10:

> `recurrence_series` — Ninguna operacion de la paciente crea ni toca series. Si una consulta
> necesita saber que un servicio tiene recurrencia viva, eso se deriva de `appointments.series_id`,
> que el agente ya lee.

Esa decisión era correcta cuando el agente sólo tenía que **saber que hay serie**. Con la regla
2 del dueño ya no basta: hay que **decir cada cuánto, qué día y a qué hora**, y las tres obligan
a leer la fila. Es un `GRANT SELECT` sobre una tabla que hoy tiene cero renglones y sin
escritura de ningún tipo. El agente sigue sin poder crear ni tocar series.

**Una precisión que el borrador tenía mal: la tabla sí tiene RLS.** Comprobado:

```sql
select c.relrowsecurity from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname='public' and c.relname='recurrence_series';
-- true

select pol.polname, pg_get_expr(pol.polqual, pol.polrelid) from pg_policy pol
 where pol.polrelid = 'public.recurrence_series'::regclass;
-- recurrence_series_owner_sel | ((professional_id = current_professional_id()) OR is_agenda_admin())
```

Esa política sería mortal para el agente, porque `current_professional_id()` es nula sin sesión.
Lo que la neutraliza no es que no exista, sino que el rol la salta:

```sql
select rolname, rolbypassrls from pg_roles where rolname = 'agenda_psi_agent_owner';
-- agenda_psi_agent_owner | true
```

Vale la pena decirlo con nombre, porque es el mismo mecanismo del que ya dependen `appointments`
y `services`: **el filtro por profesional y por paciente lo pone la función, no la política.**

### 2.4 Pero el permiso está prohibido por escrito en cuatro lugares

Esto es lo único de este frente que **choca de verdad** con lo que ya está escrito, y no es un
choque con la base: es con las pruebas. Añadir el `GRANT` sin tocarlas **rompe tres asertos**, y
además deja mintiendo a un comentario de migración.

| Archivo | Línea | Qué asegura hoy |
|---|---|---|
| `supabase/tests/20260825000000_agent_dominio_fundamento.sql` | 312 | `('public.recurrence_series', 'SELECT')` está en la lista de privilegios **prohibidos**, con el comentario «Ninguna operacion de la paciente crea ni toca series» |
| `supabase/tests/20260825000000_agent_dominio_fundamento.sql` | 1185 | Prueba negativa explícita: si el `SELECT` funciona, revienta con `FUNDAMENTO_READ_RECURRENCE_SERIES_ALLOWED` |
| `supabase/tests/20260825001000_agent_consultas_agenda.sql` | **165** | `recurrence_series` está en el arreglo de tablas de horario; si `has_table_privilege(...,'SELECT')` da verdadero, revienta con `AGENT_Q1_UNEXPECTED_SCHEDULE_GRANT` |
| `supabase/migrations/20260825001000_agent_consultas_agenda.sql` | 26–29 | El comentario que justifica el cero, y que además declara que **la exclusión por recurrencia activa que pide el pseudocódigo no se implementa** |

El cuarto renglón no es cosmético; dice, literal:

```sql
--   * recurrence_series se queda en cero. Ninguna operacion de la paciente crea
--     ni toca series, y la exclusion por recurrencia activa que pide el
--     pseudocodigo no se implementa (ver el reporte de discrepancias).
```

Es decir: la regla 2 del dueño **ya estaba pedida en el pseudocódigo y se dio por no
implementada**. Lo que el dueño acaba de fijar no es una función nueva, es reabrir esa renuncia.

La prueba negativa, literal:

```sql
BEGIN
  PERFORM 1 FROM public.recurrence_series AS rs WHERE false;
  RAISE EXCEPTION 'FUNDAMENTO_READ_RECURRENCE_SERIES_ALLOWED';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END;
```

**El arreglo mínimo no es una línea: son cinco.** El `GRANT`, más quitar la fila de la lista de
prohibidos, más borrar el bloque de la prueba negativa, más sacar `recurrence_series` del
arreglo de tablas de horario del segundo archivo, más corregir el comentario de la migración.
Y conviene invertir el aserto: en vez de «el agente no puede leerla», que diga **«el agente
puede leerla y no puede escribirla»**, que es la garantía que de verdad importa. `INSERT`,
`UPDATE` y `DELETE` sobre `recurrence_series` siguen prohibidos y ahí el aserto no se toca.

### 2.5 Lo que la app del profesional ya hace, y que conviene copiar

`public.get_patient_detail(p_patient_id)` devuelve un bloque `active_recurrences` con
**exactamente los campos que el dueño quiere**:

```sql
'active_recurrences', COALESCE((
  SELECT jsonb_agg(
           jsonb_build_object(
             'series_id',  rs.id,
             'service_id', rs.service_id,
             'frequency',  rs.frequency,
             'weekday',    rs.weekday,
             'start_time', rs.start_time,
             'modality',   rs.modality
           )
           ORDER BY rs.weekday, rs.start_time, rs.id
         )
    FROM public.recurrence_series rs
   WHERE rs.patient_id = v_patient.id
     AND rs.professional_id = v_professional_id
     AND rs.is_active = true
), '[]'::jsonb)
```

Le falta una sola cosa para ser el renglón del dueño: **la próxima cita**. Ésa la pone
`get_next_scheduled_appointment`, que es una llamada aparte en la app.

Y `public.get_services_for_patient(p_patient_id)` ya trae la bandera por servicio, con un
comentario que vale por media página de diseño:

```sql
-- Solo cabe UNA serie activa por (profesional, paciente, servicio). Sin este dato,
-- Citas subsecuentes ofrece el servicio y el rechazo llega hasta el final, con el
-- formulario ya lleno. Crear cita lo ignora: una serie viva no estorba para agendar
-- una cita suelta.
'has_active_recurrence',  EXISTS (
  SELECT 1 FROM public.recurrence_series rs
   WHERE rs.professional_id = v_professional_id
     AND rs.patient_id      = p_patient_id
     AND rs.service_id      = s.id
     AND rs.is_active       = true
)
```

Ese `EXISTS` es, tal cual, lo que le falta a la lista de servicios del agente (§6.2).

---

## 3. La regla de selección, escrita como consulta

### 3.1 La idea, en una línea

> Agrupa por `series_id` cuando hay serie, y por la propia cita cuando no la hay. Toma la
> primera de cada grupo.

Eso se escribe con `COALESCE(series_id, id)` como llave de agrupación. Una serie es un grupo
con muchas citas; **cada cita suelta es un grupo de una sola cita**, así que todas las sueltas
sobreviven. Es la regla del dueño, sin ramas ni condicionales.

Un aviso, porque es el error fácil: `DISTINCT ON (series_id)` a secas **no sirve**, porque
Postgres trata todos los `NULL` como un mismo valor y colapsaría todas las citas sueltas en
una. El `COALESCE` es lo que impide ese desastre.

### 3.2 La consulta

```sql
-- Regla del dueño: todas las individuales futuras + la más próxima de cada serie.
SELECT
  to_char(x.starts_at AT TIME ZONE x.timezone, 'YYYY-MM-DD HH24:MI') AS inicia_local,
  x.paciente, x.profesional, x.servicio, x.modality,
  CASE WHEN x.series_id IS NULL THEN 'suelta' ELSE 'serie' END AS tipo,
  x.series_id, x.confirmada, x.dinero_adentro
FROM (
  SELECT DISTINCT ON (COALESCE(a.series_id, a.id))
         a.id, a.series_id, a.starts_at, a.modality,
         pa.first_name AS paciente, pr.first_name AS profesional,
         s.name AS servicio, pr.timezone,
         (a.confirmed_at IS NOT NULL) AS confirmada,
         COALESCE(pay.status = 'credited'
                  OR EXISTS (SELECT 1 FROM public.payment_proofs pp
                              WHERE pp.payment_id = pay.id), false) AS dinero_adentro
    FROM public.appointments a
    JOIN public.patients      pa  ON pa.id = a.patient_id
    JOIN public.professionals pr  ON pr.id = a.professional_id
    JOIN public.services      s   ON s.id  = a.service_id
    LEFT JOIN public.payments pay ON pay.appointment_id = a.id
   WHERE a.status    = 'scheduled'
     AND a.starts_at > now()
   ORDER BY COALESCE(a.series_id, a.id), a.starts_at, a.id
) x
ORDER BY x.starts_at;
```

`dinero_adentro` es la definición operativa que ya fijó la auditoría (`credited` o comprobante
existente); va aquí porque la regla del dueño es justamente «para confirmar y para el
comprobante».

### 3.3 Qué devuelve hoy, contra producción — y por qué esa respuesta caduca

A las **18:49 UTC** del 2026-08-26 devolvía un renglón:

| inicia_local | paciente | profesional | servicio | modality | tipo | series_id | confirmada | dinero_adentro |
|---|---|---|---|---|---|---|---|---|
| 2026-08-26 13:00 | Juan | Test | Psicoterapia Individual | in_person | suelta | `null` | false | false |

A las **19:04 UTC del mismo día**, quince minutos después, devuelve **cero renglones**:

```sql
select now(),
 (select count(*) from public.appointments where status='scheduled' and starts_at > now()) as futuras_vivas,
 (select count(*) from public.appointments where status='scheduled')                       as scheduled_total;
-- 2026-08-26 19:04:45+00 | 0 | 1
```

Esa única cita empezaba a las 19:00 UTC y ya empezó. **Hay que decirlo, porque cambia cómo se
lee todo este apartado: producción no tiene un juego de datos con el que probar nada.** Tiene
una sola cita `scheduled`, ya pasada, a la espera de que `cron_sweep_past_pending` la recoja.
Cualquier lectura «contra producción» de este frente caduca en horas. La evidencia que se
sostiene es la del banco del §3.4, no la de la agenda real.

(La otra cita del sistema, `aa9b70f9…` del 2026-08-27, está en estado `rescheduled` y por eso
nunca entró. Es la huérfana del §1.5.)

### 3.4 La prueba de que el colapso funciona

Como en producción no hay series, la rama se ejerció con un banco de pruebas **de sólo lectura**
—un `VALUES`, sin tocar un solo renglón— con la misma llave, el mismo `ORDER BY` y el mismo
`COALESCE`. Dos series vivas y dos citas sueltas. Las dos series son **de cada dos semanas**;
el borrador llamaba «mensual» a `S-B`, y eso no existe: el enum sólo tiene semanal, quincenal y
cada cuatro semanas (§1.2), y sus propias fechas están a catorce días. Da igual para lo que se
prueba —el banco ejercita la **llave de agrupación**, no el ritmo— pero no puede quedar escrito
un ritmo que la base no admite.

```sql
WITH citas(id, series_id, starts_at, servicio) AS (
  VALUES
    ('c1'::text, 'S-A'::text, timestamptz '2026-09-02 16:00+00', 'Psicoterapia individual'),
    ('c2',       'S-A',       timestamptz '2026-09-09 16:00+00', 'Psicoterapia individual'),
    ('c3',       'S-A',       timestamptz '2026-09-16 16:00+00', 'Psicoterapia individual'),
    ('c4',       'S-B',       timestamptz '2026-08-31 21:00+00', 'Terapia de pareja'),
    ('c5',       'S-B',       timestamptz '2026-09-14 21:00+00', 'Terapia de pareja'),
    ('c6',       NULL,        timestamptz '2026-08-28 18:00+00', 'Psicoterapia individual'),
    ('c7',       NULL,        timestamptz '2026-09-04 18:00+00', 'Psicoterapia individual')
)
SELECT id, COALESCE(series_id,'(suelta)') AS grupo,
       to_char(starts_at AT TIME ZONE 'America/Mexico_City','YYYY-MM-DD HH24:MI') AS inicia_local,
       servicio
FROM (SELECT DISTINCT ON (COALESCE(series_id, id)) * FROM citas
       ORDER BY COALESCE(series_id, id), starts_at, id) g
ORDER BY starts_at;
```

**Siete citas entran, cuatro salen:**

| id | grupo | inicia_local | servicio |
|---|---|---|---|
| c6 | (suelta) | 2026-08-28 12:00 | Psicoterapia individual |
| c4 | S-B | 2026-08-31 15:00 | Terapia de pareja |
| c1 | S-A | 2026-09-02 10:00 | Psicoterapia individual |
| c7 | (suelta) | 2026-09-04 12:00 | Psicoterapia individual |

`c2`, `c3` y `c5` desaparecen porque no son las más próximas de su serie. `c6` y `c7`
sobreviven las dos, aunque sean del mismo servicio, porque son sueltas. **Es exactamente la
frase del dueño.**

### 3.5 La forma final, tal como va dentro de la función del agente

La función `public.agent_list_upcoming_appointments_from_workflow`
(`supabase/migrations/20260825001000_agent_consultas_agenda.sql`, línea 1011) **no colapsa
nada**. Y conviene subrayar que está **escrita y sin desplegar**: en la base viven trece
funciones `agent%` y todas son de plomería (admisión del mensaje, control de la llamada,
capacidades, identificadores opacos). Ninguna de las seis consultas de agenda está desplegada
todavía (§4), así que corregirla es editar un archivo, no migrar una función viva.

Su consulta es:

```sql
FROM public.appointments AS appointment
WHERE appointment.patient_id      = v_turn.patient_id
  AND appointment.professional_id = v_turn.professional_id
  AND appointment.status          = 'scheduled'::public.appointment_status
  AND appointment.starts_at       > pg_catalog.now()
ORDER BY appointment.starts_at ASC, appointment.id ASC
LIMIT v_limit       -- v_limit constant integer := 5
```

Con una serie de doce sesiones, eso le entrega al modelo **cinco renglones de la misma serie**
y `truncated: true`, y las citas sueltas de la paciente **no aparecen nunca**. Es el peor
resultado posible: el modelo ofrece cinco veces lo mismo y esconde lo demás.

**Hay que tocar dos lugares, no uno.** El `truncated` no sale de la misma consulta: la función
hace antes un `count(*)` aparte, sin `LIMIT`, y ese conteo también decide si se emiten
identificadores:

```sql
SELECT pg_catalog.count(*)
  INTO v_total
  FROM public.appointments AS appointment
 WHERE appointment.patient_id = v_turn.patient_id
   ...
IF v_total > 0 THEN
```

Así que el arreglo es colapsar primero y recortar después, **en el conteo y en el ciclo**. Si
sólo se colapsa el ciclo, `truncated` dirá «hay más» cuando no las hay:

```sql
WITH grupos AS (
  SELECT DISTINCT ON (COALESCE(a.series_id, a.id))
         a.id, a.series_id, a.starts_at, a.modality, a.confirmed_at, a.service_id
    FROM public.appointments a
   WHERE a.patient_id      = v_turn.patient_id
     AND a.professional_id = v_turn.professional_id
     AND a.status          = 'scheduled'::public.appointment_status
     AND a.starts_at       > pg_catalog.now()
   ORDER BY COALESCE(a.series_id, a.id), a.starts_at, a.id
)
SELECT g.*, (SELECT count(*) FROM grupos) AS total_grupos
  FROM grupos g
 ORDER BY g.starts_at, g.id
 LIMIT 5;
```

Ejecutada contra producción con el par real de Juan y Test devuelve **cero renglones**, porque
esa cita ya empezó (§3.3): contra la agenda real esta forma no se puede ejercitar. Sobre el
banco del §3.4 sí, y ahí se ve el punto exacto:

| id | es_de_serie | total_grupos | total_citas_sin_colapsar |
|---|---|---|---|
| c6 | false | **4** | 7 |
| c4 | true | **4** | 7 |
| c1 | true | **4** | 7 |
| c7 | false | **4** | 7 |

**Siete citas, cuatro grupos.** Contando citas, `truncated` sería `7 > 5` = verdadero y el
modelo diría «hay más»; contando grupos es `4 > 5` = falso, que es la verdad. Ésa es la razón
de cambiar también el conteo.

**Dónde se aplica esta regla, exactamente:** en la **lista de citas próximas** del expediente,
que es la que el modelo lee para desambiguar cuando la paciente dice «sí voy» o quiere mover o
cancelar. **No** se aplica a la disponibilidad, **ni** a la lista de servicios, **ni** —y esto
el borrador lo tenía mal— a la foto del comprobante, que va por otro camino entero (§3.7).

`agent_get_next_appointment_from_workflow` (misma migración, línea 1278) **no hay que tocarla**:
toma la primera cita futura sin más, y la primera cita futura siempre es representante de su
grupo, tenga serie o no. Se deja escrito para que nadie la «arregle».

**Aviso de nombres, porque «la próxima» quiere decir tres cosas distintas y conviene no
confundirlas:**

| Dónde | Qué significa «la próxima» | Filtro |
|---|---|---|
| Lista de citas próximas (§3.2) | la más próxima **de cada grupo** | `DISTINCT ON (COALESCE(series_id, id))` |
| `agent_get_next_appointment_from_workflow` | la primera cita futura de la paciente, punto | `starts_at > now()`, `LIMIT 1` |
| Destino de «pasar el pago» (`14-pasar-pago.md`) | la primera futura **del mismo servicio** | + `service_id = <el de la cita que se cancela>` |

Son tres consultas distintas y ninguna sustituye a otra. La tercera es la regla de
`get_next_scheduled_appointment` y **no mira `series_id`**: si la paciente tiene una serie y
además una suelta del mismo servicio (§5.2), el dinero se va a la que ocurra antes.

### 3.6 La lista colapsada es también la lista de lo que se puede tocar

Esto no estaba en el borrador y cambia el alcance de la regla del dueño.

Cada renglón que la función mete en la lista **emite un identificador opaco** por cita:

```sql
v_handle := private.agent_issue_option_handle(
  v_turn.session_id, v_turn.id, 'appointment', 'appointment',
  v_appointment.id, 'appointment:' || v_appointment.id::text,
  v_key_id, v_option_expires_at, false);
```

Y las cuatro mutaciones de cita del agente lo **exigen** en su firma. Comprobado en
`supabase/migrations/20260825003000_agent_citas_mutaciones.sql`:

| Función | Línea | Tercer parámetro |
|---|---|---|
| `agent_confirm_appointment_from_workflow` | 596 | `p_appointment_handle uuid` |
| `agent_cancel_appointment_from_workflow` | 871 | `p_appointment_handle uuid` |
| `agent_reschedule_appointment_from_workflow` | 1302 | `p_appointment_handle uuid` |
| `agent_switch_appointment_modality_from_workflow` | 1924 | `p_appointment_handle uuid` |

**Consecuencia, y hay que decírsela al dueño con todas sus letras:** al colapsar, la sesión
número 4 de una serie de doce deja de tener identificador, y por lo tanto **el agente no la
puede confirmar, ni cancelar, ni mover, ni cambiarle la modalidad**. De cada serie sólo es
tocable la más próxima.

Eso es coherente con la regla («la más próxima por serie») y probablemente es justo lo que el
dueño quiere: una serie se mueve una sesión a la vez, en orden. Pero **no puede quedar como
efecto secundario sin nombre**. Si la paciente pide mover «la del 30», la respuesta correcta no
es el silencio: es decirle que por aquí se mueve la más próxima y que para las demás hable con
su profesional. El texto de esa salida hay que escribirlo; hoy no existe.

**Y tiene una segunda consecuencia, que es la que cierra el frente 14.** Si de cada serie sólo la
más próxima lleva identificador, **ninguna operación del agente puede recibir dos citas de la
misma serie**. Eso descarta la primera forma de «pasar el pago a la próxima cita», que pedía dos
identificadores —el de la cita que se cancela y el de la cita destino— y que con una serie viva
sería imposible de armar: la segunda ocurrencia no es señalable. **El arreglo es de una sola
pieza y está en `14-pasar-pago.md` §3.1: el destino no se señala, se resuelve.** La función
recibe un identificador —el de la cita que trae el dinero— y calcula el destino con la regla ya
existente de `get_next_scheduled_appointment`: misma paciente, mismo servicio, `scheduled`,
`starts_at > now()`, la primera. Es exactamente lo que el dueño llamó «la próxima sesión», y no
depende del colapso.

### 3.7 El comprobante NO pasa por esta lista

El borrador decía que la lista de citas próximas es «la que el modelo lee para desambiguar
cuando la paciente dice “sí voy” **o manda una foto**». La segunda mitad es falsa, y aplicarle
el colapso al camino del comprobante deja dinero sin dueño.

El camino de la foto es otro: `agent_get_pending_payments_from_workflow`
(`20260825002000_agent_pagos.sql`, línea 105) y luego
`agent_attach_payment_proof_from_workflow` (línea 898). Esa consulta **no sale de
`appointments`, sale de `payments`**, y su filtro es, literal:

```sql
   FROM public.payments AS payment
   JOIN public.appointments AS appointment
     ON appointment.id = payment.appointment_id
    AND appointment.professional_id = payment.professional_id
  WHERE payment.professional_id = v_turn.professional_id
    AND appointment.patient_id = v_turn.patient_id
    AND payment.status = 'pending'::public.payment_status
  ORDER BY appointment.starts_at ASC, appointment.id ASC
```

Ni una palabra de `series_id`, y **a propósito no filtra por estado de la cita**; su propio
comentario explica por qué: «El caso mas importante de esta consulta es justamente una cita ya
cerrada: el cargo tardio de una cancelacion o una reprogramacion fuera de plazo».

**Si a esta lista se le aplicara «la más próxima por serie», una serie de doce sesiones
escondería once cobros pendientes vivos.** Eso es exactamente dinero sin dueño. La regla del
colapso vale para elegir **qué cita se toca**; no vale para elegir **qué se debe**.

Un cobro se identifica por su propia cita, y cada renglón ya viaja con su fecha local, su
importe y su motivo. No hace falta ninguna regla de serie ahí.

**Lo que sí hay que anotar de esta lista, porque una serie la estresa de inmediato:** reparte
los cobros en tres canastas (`actionable`, `waiting`, `not_yet_due`) y **cada canasta se corta
en cinco** (`v_page constant integer := 5`, línea 143). Una serie de doce nace con doce cobros
`pending` sin comprobante pedido: los doce caen en `not_yet_due`, se muestran cinco y
`truncated` se pone en verdadero. **El total no se pierde**: `v_pending_count` y
`v_pending_total` se suman antes del corte, así que la cifra que se le dice a la paciente es la
completa aunque el detalle esté recortado. Eso está bien como está y no hay que tocarlo.

---

## 4. Cuántas series activas hay hoy

**Cero.** Y no es «cero activas de algunas»: es cero filas en la tabla.

```sql
select
  (select count(*) from public.recurrence_series)                     as series_total,
  (select count(*) from public.recurrence_series where is_active)     as series_activas,
  (select count(*) from public.appointments where series_id is not null) as citas_con_serie,
  (select count(*) from public.appointments)                          as citas_total,
  (select count(*) from public.appointments
    where status='scheduled' and starts_at > now())                   as citas_futuras_vivas,
  (select count(*) from public.appointments where origin='recurring_series') as citas_origen_serie;
```

| series_total | series_activas | citas_con_serie | citas_total | citas_futuras_vivas | citas_origen_serie |
|---|---|---|---|---|---|
| **0** | **0** | **0** | 41 | **1** → **0** | **1** |

(«Citas futuras vivas» era 1 a las 18:49 UTC y 0 a las 19:04 UTC del mismo día, §3.3.)

Ninguna de las trece funciones del agente desplegadas menciona siquiera la palabra:

```sql
select p.proname, (p.prosrc ilike '%recurren%' or p.prosrc ilike '%series%') as menciona_serie
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public','private') and p.proname like 'agent%';
-- las 13 filas devuelven menciona_serie = false
```

Y hay que leer bien **cuáles** son esas trece, porque no son las de este frente:
`agent_register_inbound_context`, `agent_bind_inbound_execution`,
`agent_get_inbound_resume_execution`, `agent_mark_inbound_waiting`,
`agent_mark_inbound_completing`, `agent_complete_inbound`,
`agent_complete_inbound_from_workflow`, `agent_get_capabilities`,
`agent_get_capabilities_from_workflow`, `agent_claim_tool_call`,
`agent_finalize_tool_call`, `agent_issue_option_handle` y `agent_resolve_option_token`.
**Todas son de plomería.** Las seis consultas de agenda, las tres de pagos y las cinco
mutaciones de cita están escritas en migraciones y **ninguna está desplegada**. Este documento
describe, entonces, cómo escribir archivos, no cómo migrar funciones vivas.

**Hay que decirlo sin adornos: la rama de series se va a escribir sin un solo dato que la
ejercite.** Ese es el riesgo real de este frente.

### 4.1 Cómo se prueba

El agente **no puede crear una serie**, y no debe poder: `create_recurrence_series` es
`SECURITY DEFINER` con `current_professional_id()` y ACL `{postgres=X, authenticated=X}`. La
única superficie que crea series es la app del profesional. Así que la prueba tiene que nacer
de ahí.

**Receta mínima, con datos que ya existen:**

1. Entrar a la app como **Araceli** (`0deec2d6-4c0e-4726-b5b5-187be7e77b67`; 4 servicios activos
   y 12 pacientes activas: es la única con holgura para el caso de dos series). Tiene política
   de cobro configurada, que la recurrencia **exige** (`POLICY_NOT_CONFIGURED`); las cinco
   profesionales la tienen, comprobado.
2. Crear **serie A** para **Emilio Vargas Trejo** (`d0000000-0000-4000-8000-000000000005`,
   activo, de Araceli) con el servicio *Psicoterapia individual*
   (`c1000000-0000-4000-8000-000000000001`, 50 min + 10 de margen, $800), frecuencia
   `biweekly`, seis sesiones. **Ese servicio es de modalidad `both`**, así que hay que mandar
   modalidad o revienta con `MODALITY_REQUIRED`.
3. Crear **serie B** para el **mismo Emilio** con el servicio *Psicoterapia Pareja*
   (`c0000000-0000-4000-8000-000000000002`, 90 min, $1 200, modalidad `online`), frecuencia
   `weekly`, cuatro sesiones. Tiene que ser **otro servicio**: con el mismo, la base la rechaza
   (§5.1).
4. Agendar además **una cita suelta** de *Psicoterapia individual*, para que el caso de §5.2
   quede cubierto en el mismo juego de datos.
5. Correr la consulta del §3.2 y comprobar que devuelve **tres renglones**: la más próxima de A,
   la más próxima de B y la suelta.

**Lo que hay que verificar en esa prueba, y que no es obvio:**

- Que la primera ocurrencia sea **estrictamente futura**, o revienta con `START_NOT_FUTURE`.
- Que `outcome` venga `created_all`. **Y si se quiere probar la serie con huecos, hay que
  pedirla:** con `p_allow_partial` en falso o nulo, un solo conflicto devuelve `conflicts` y
  **no escribe nada** — ni serie, ni citas, ni cobros (§1.7). Sólo con `p_allow_partial => true`
  aparece `created_partial` con `skipped_count > 0`, que es la prueba que de verdad interesa:
  confirma que la fecha no se calcula.
- Que al **mover** la más próxima de la serie A a una fecha posterior a la segunda ocurrencia,
  la consulta cambie sola de renglón. Ahí se ve que el orden manda y la fila madre no. Y de
  paso se ve el caso del §6.1: la cita movida ya no cae en el `weekday` de la serie.
- Que al **cancelar** la más próxima, la siguiente ascienda sin que nadie la promueva a mano.
- Que la lista de cobros pendientes siga mostrando **las seis** sesiones de la serie A, no una
  (§3.7).

También hay banco de pruebas SQL en `supabase/tests/` (ocho archivos) donde puede vivir un caso
permanente. Hoy **ninguno crea una serie ni ejercita el colapso**: las tres únicas menciones a
`recurrence_series` son asertos de permisos, y son los que prohíben el `GRANT` (§2.4).

---

## 5. El caso raro

### 5.1 Dos series del mismo servicio: **no puede pasar**

El índice `ix_recurrence_series_active` es `UNIQUE (professional_id, patient_id, service_id)
WHERE is_active`. Un segundo intento revienta, y `create_recurrence_series` lo traduce a un
error con nombre:

```sql
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION USING errcode = 'P0001', message = 'ACTIVE_SERIES_EXISTS';
```

**No hay que escribir esa rama, ni que preguntarle nada a la paciente.** Cuando el dueño dice
«dos series vivas», la base garantiza que son **de dos servicios distintos**.

**Pero «servicios distintos» no quiere decir «nombres distintos», y el borrador daba eso por
hecho.** Araceli tiene hoy, en producción, **dos servicios activos que se llaman exactamente
igual**:

```sql
select id, name, default_price, modality, is_active from public.services
 where professional_id = '0deec2d6-4c0e-4726-b5b5-187be7e77b67' and is_active
 order by name;
-- c1000000-0000-4000-8000-000000000001 | Psicoterapia individual  |  800.00 | both     | t
-- 26e738f7-def0-4a31-8f6e-12126696b14f | Psicoterapia individual  |  900.00 | online   | t
-- c0000000-0000-4000-8000-000000000002 | Psicoterapia Pareja      | 1200.00 | online   | t
-- c0000000-0000-4000-8000-000000000004 | Valoracion Sin Costo     |    0.00 | both     | t
```

Nada lo impide: no hay unicidad por nombre en `services`. Así que Emilio **puede** tener dos
series vivas, de dos servicios distintos, y que las dos se llamen «Psicoterapia individual».
La celda que el borrador daba por fácil no lo es.

Lo que sí las distingue, y ya viaja en la lista de servicios del agente, es **la modalidad y el
precio**: `agent_list_services_from_workflow` devuelve `name`, `duration_minutes`, `modality`,
`price`, `is_free` e `is_preferential`. La regla de redacción es entonces: **si dos renglones
comparten nombre, se les añade la modalidad y el precio; si además comparten los dos, la
duración.** Nunca se les añade un número de orden, que no significa nada para la paciente.

¿Es alcanzable el caso? Sí, en cuatro de las cinco profesionales:

| Profesional | Servicios activos | Pacientes activas | ¿Puede tener dos series vivas? |
|---|---|---|---|
| Araceli | 4 | 12 | sí |
| Maricruz tes | 4 | 0 | sí, cuando tenga pacientes |
| Miranda | 2 | 1 | sí |
| test | 2 | 1 | sí |
| Test | **1** | 3 | **no**, nunca |

**Qué se le dice.** Los dos renglones se nombran por su servicio y no hace falta más:

```
Tienes dos series abiertas con Araceli:
1) Psicoterapia individual, cada dos semanas, los miércoles a las 4:00 de la tarde;
   tu próxima es el miércoles 2 de septiembre.
2) Psicoterapia Pareja, cada semana, los lunes a las 6:00 de la tarde;
   tu próxima es el lunes 31 de agosto.
```

Y para confirmar o para el comprobante, la lista trae **una de cada una**, más las sueltas.
Nunca cinco miércoles seguidos.

### 5.2 Una serie más una cita suelta del mismo servicio: **pasa, y nadie lo impide**

Verificado en el propio comentario de `get_services_for_patient`: «**Crear cita lo ignora: una
serie viva no estorba para agendar una cita suelta**». Y `create_appointment` nunca consulta
`recurrence_series`: mira el servicio, la política, la disponibilidad, e inserta con
`series_id = NULL`.

O sea: Emilio puede tener su *Psicoterapia individual* de los miércoles cada dos semanas **y**
una sesión extra el viernes, del mismo servicio y al mismo precio. Es un caso legítimo y
probablemente el más común de todos: la sesión de más en una semana difícil.

**Aquí está la única ambigüedad real de todo este frente**, y hay que resolverla en el texto,
no en el esquema. Si Emilio escribe «quiero mover mi sesión», tiene dos citas de
*Psicoterapia individual* y el nombre del servicio no las distingue. Lo que sí las distingue es
**la fecha y si es de la serie**:

```
Tienes dos sesiones de Psicoterapia individual:
1) el viernes 28 de agosto a las 4:00 de la tarde
2) el miércoles 2 de septiembre a las 4:00 de la tarde, la de tu serie de cada dos semanas
¿Cuál muevo?
```

**La regla de redacción:** cuando dos renglones de la lista comparten servicio, el renglón de
serie lleva la coletilla «la de tu serie de …» y el suelto no lleva nada. Nunca se dice
«sesión 1 de 6» ni se numera dentro de la serie: la base no guarda ese número y contarlo sería
intuir (§1.7).

Y una advertencia que sale del §3.6: en este ejemplo **las dos son tocables** porque una es la
suelta y la otra es la más próxima de su serie. Si Emilio pidiera mover la **tercera** sesión de
la serie, no habría renglón que ofrecerle. Ahí va la frase de una sola salida, no el silencio.

### 5.3 Y el que nadie pidió pero está en producción: la cita huérfana

Una cita con `origin = 'recurring_series'` y `series_id` nulo (§1.5) es, para todos los
efectos, **una cita suelta**. Con la consulta del §3.2 sale así sola, sin ninguna regla extra,
porque el `COALESCE` la agrupa por su propio `id`. **No hay que hacer nada, sólo no usar
`origin` para agrupar.**

---

## 6. El renglón de recurrencia en el expediente

### 6.1 La forma exacta

Un solo campo de texto, compuesto por el servidor y copiado por el modelo palabra por palabra.
No es un objeto con partes que el modelo arme: eso es justo lo que produce el falso éxito que
el resto del diseño combate.

```json
"recurrencia": "cada dos semanas, los miércoles a las 4:00 de la tarde; tu próxima es el miércoles 2 de septiembre"
```

`null` cuando ese servicio no tiene serie viva. Nada de cadena vacía ni de «sin recurrencia»:
el modelo tiene que poder distinguir «no aplica» de «aplica y dice esto».

**Las cuatro piezas del dueño, en orden y de dónde sale cada una:**

| Pieza del texto | Columna | Cómo se traduce |
|---|---|---|
| `cada dos semanas` | `recurrence_series.frequency` | `weekly` → «cada semana»; `biweekly` → «cada dos semanas»; `every_4_weeks` → «cada cuatro semanas» |
| `los miércoles` | `recurrence_series.weekday` | 0 = domingo … 6 = sábado, con `CASE` (§6.4) |
| `a las 4:00 de la tarde` | `recurrence_series.start_time` | Hora de pared de la serie, no la de una cita |
| `tu próxima es el miércoles 2 de septiembre` | `appointments` | La más próxima con ese `series_id` (§3) |

**Las tres primeras salen de la fila madre; sólo la cuarta se lee de las citas.** El borrador
tomaba el día y la hora de la próxima cita y eso produce texto falso en cuanto una ocurrencia se
mueve: la serie sigue siendo de miércoles a las 4 aunque esta vez toque el viernes (§2.3).

**Y de ahí sale la única rama de redacción de este renglón.** Cuando la próxima cita **no** cae
en el `weekday` y el `start_time` de la serie, el texto tiene que decirlo, o la paciente lee una
contradicción («los miércoles… tu próxima es el viernes 4»):

```
cada dos semanas, los miércoles a las 4:00 de la tarde;
tu próxima quedó el viernes 4 de septiembre a las 6:00 de la tarde
```

La comparación es barata y se hace con lo que ya está en mano: el día y la hora locales de la
próxima cita contra `weekday` y `start_time`. Nada de calcular ocurrencias.

La modalidad **está disponible** (`recurrence_series.modality`, `NOT NULL`) y **no entra** en
este renglón: el dueño pidió cuatro cosas y son cuatro. La modalidad ya viaja en la etiqueta de
cada cita.

### 6.2 Dónde vive

En **dos sitios**, y por razones distintas:

1. **En cada servicio de la lista de servicios**, para la regla 2 (avisar antes de agendar). La
   función `agent_list_services_from_workflow` —escrita, **no desplegada** (§4)— devuelve
   `service_handle`, `name`, `duration_minutes`, `modality`, `price`, `is_free`,
   `is_preferential`. **No hay campo de recurrencia.** Hay que añadir `recurrencia` con este
   mismo texto.
2. **En la cita de serie de la lista de citas próximas**, como la coletilla del §5.2, para
   desambiguar cuando comparte servicio con una suelta.

**Y no en un tercero:** la lista de cobros pendientes no lleva este renglón. Ahí cada cita habla
de su propio dinero y la serie no aporta nada (§3.7).

### 6.3 Cuántos caracteres ocupa

Medido con `char_length` y `octet_length` en la propia base, no estimado:

| Caso | Renglón | Caracteres | Bytes |
|---|---|---|---|
| **Ejemplo real** (Emilio · Araceli · quincenal) | `cada dos semanas, los miércoles a las 4:00 de la tarde; tu próxima es el miércoles 2 de septiembre` | **98** | 101 |
| Más corto posible | `cada semana, los lunes a las 9:00 de la mañana; tu próxima es el lunes 31 de agosto` | 83 | 85 |
| Más largo posible | `cada cuatro semanas, los miércoles a las 12:30 de la tarde; tu próxima es el miércoles 30 de septiembre` | **103** | 106 |

**Entre 83 y 103 caracteres con este vocabulario. Cabe de sobra en cualquier mensaje y en
cualquier tope.**

El techo lo pone el número de servicios que se listan. **Y ese número deja de tener corte:** el
frente 11 quita el `v_limit constant integer := 5` de `agent_list_services_from_workflow`
(`11-servicios.md` §6.2, punto 1, renglón 3 del §8), porque «la lista de todos» no admite
recorte. El techo real pasa a ser el JSON de 16 KB del gateway, unos 81 servicios medidos. Con
el máximo de hoy —los cuatro activos de Araceli— el peor caso son **4 × 103 = 412 caracteres**
añadidos, y sólo si los cuatro tuvieran serie viva; los servicios sin serie llevan `null`.

(El borrador calculaba 5 × 103 = 515 dando por vivo un `LIMIT` que el frente 11 elimina. Las dos
ediciones van en la misma función y hay que hacerlas juntas.)

La rama del §6.1 —«tu próxima quedó el viernes 4 de septiembre a las 6:00 de la tarde»— alarga
el renglón unos 25 caracteres. Sigue sin ser un problema.

El ejemplo está construido con piezas reales de producción —Emilio Vargas Trejo
(`d0000000-0000-4000-8000-000000000005`), Araceli, servicio *Psicoterapia individual*
`c1000000-0000-4000-8000-000000000001`, 50 min + 10 de margen, $800— pero **la serie no existe**:
hay cero en la base (§4). Es un ejemplo con datos reales, no un renglón leído de producción, y
así hay que tratarlo.

### 6.4 Una trampa medida: los nombres de los días vienen en inglés

```sql
select current_setting('lc_time'), to_char(date '2026-09-02','TMDay TMMonth');
-- en_US.UTF-8 | Wednesday September
```

**Ni siquiera con `TM`.** El servidor está en `en_US.UTF-8`, así que `to_char` devuelve
«Wednesday September» y no «miércoles septiembre». Los nombres de día y de mes tienen que salir
de un `CASE` escrito en la función. No es opcional y no se arregla con una máscara de formato.

Lo mismo vale para «de la mañana / de la tarde»: sale de la hora local, no de `AM`/`PM`.

---

## 7. Lo que hay que escribir

Nueve cosas. Ninguna es grande, y la primera sigue siendo de una línea.

| # | Qué | Dónde | Tamaño |
|---|---|---|---|
| 1 | `GRANT SELECT ON public.recurrence_series TO agenda_psi_agent_owner` | `20260825000000_agent_dominio_fundamento.sql`, apartado 1.10 — hoy dice explícitamente que se queda en cero | **una línea** |
| 2 | Soltar los tres asertos que prohíben ese permiso, e invertir el que queda a «lee pero no escribe» | `tests/20260825000000` (líneas 312 y 1185) y `tests/20260825001000` (línea **165**) | 3 puntos, §2.4 |
| 3 | Corregir el comentario que declara la renuncia | `migrations/20260825001000`, líneas 26–29 | 3 renglones de comentario |
| 4 | Colapsar por `COALESCE(series_id, id)` **en el `count(*)` y en el ciclo** | `agent_list_upcoming_appointments_from_workflow` (`20260825001000`, línea 1011) | ~15 líneas, §3.5 |
| 5 | Campo `recurrencia` en cada servicio, con día y hora **de la fila madre** | `agent_list_services_from_workflow` (`20260825001000`, línea 64) | ~30 líneas, con el `CASE` de días y meses y la rama de «quedó el…» |
| 6 | Coletilla «la de tu serie de …» cuando serie y suelta comparten servicio, y modalidad + precio cuando dos servicios comparten nombre | mismo lector de citas próximas | ~8 líneas, §5.1 y §5.2 |
| 7 | **Texto de salida para «mueve la del 30»**: sólo la más próxima de cada serie es tocable | copy, no SQL | una frase, §3.6 |
| 8 | Dejar por escrito que la lista de cobros **no** se colapsa | comentario en `20260825002000`, línea 105 | 2 renglones, §3.7 |
| 9 | Un caso de prueba con dos series y una suelta | `supabase/tests/` | archivo nuevo |

**Lo que NO hay que escribir, y conviene dejarlo por escrito para que nadie lo intente:**

- **Ninguna función que calcule la siguiente ocurrencia** a partir de `frequency` y `start_date`.
  Las series pueden tener huecos (§1.7) y las citas se mueven sin salir de la serie (§1.6). La
  fecha se lee de `appointments`, siempre.
- **Ninguna rama para dos series del mismo servicio.** El índice único la hace imposible (§5.1).
- **Ningún uso de `origin = 'recurring_series'` para agrupar.** Miente en cuanto se borra una
  serie, y ya hay una cita así en producción (§1.5).
- **Ninguna operación del agente que cree, extienda, cierre o borre una serie.** Las series son
  del profesional. El agente las lee, las nombra y respeta su ritmo.
- **Ningún colapso por serie en la lista de cobros pendientes** (§3.7). Ahí cada cita debe su
  propio dinero.
- **Ningún día ni hora del ritmo leídos de una cita** (§2.3, §6.1). Salen de `weekday` y
  `start_time`.
- **Ninguna función que parta un pago, que acumule saldo, o que inserte un segundo cobro sobre
  una cita.** `payments_appointment_id_key UNIQUE (appointment_id)` —comprobado— lo prohíbe, y
  entre las 38 tablas de `public` no hay ni una columna de saldo (`14-pasar-pago.md` §4).

  **Corrección respecto del borrador:** éste decía «ningún traslado de un pago de una cita de la
  serie a otra», apoyándose en que el Flujo 11 del guion lo había descartado. Eso ya no aplica:
  **el dueño reabrió esa decisión** y el traslado se construye en `14-pasar-pago.md`, con la
  función `agent_carry_payment_forward_from_workflow`, que no inserta un cobro nuevo sino que
  **fusiona en su sitio** el que la cita destino ya tenía. Lo que sigue prohibido es partirlo.

  Dos cosas que este frente sí le impone a esa operación, y que están en su documento:

  1. **El destino no se elige de la lista colapsada.** Con el colapso del §3.6, la segunda
     ocurrencia de una serie no tiene identificador, así que no se puede señalar. El destino lo
     resuelve el servidor con la regla de `get_next_scheduled_appointment` —misma paciente,
     mismo servicio, viva y posterior— que es literalmente «tu próxima sesión»
     (`14-pasar-pago.md` §3.1).
  2. **El colapso no toca la lista de cobros** (§3.7). Una serie de doce debe once cobros y los
     once se ven.
