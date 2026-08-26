# La web de agendar y reprogramar de la versión anterior

Auditoría del recorrido que ahora hay que volver conversación.

**Fuente:** proyecto Supabase `deklbpimnkueqsugepqq` («Agenda PSI», la versión anterior),
leído en modo consulta el 2026-08-26. Código de las tres funciones de borde bajado con
`get_edge_function`; definiciones de base leídas de `pg_proc`; los conteos salen de
consultas `select` sobre la base viva.

**Contraste:** donde el documento dice qué hay que construir, se compara contra
`ssyzfeadyrczlzjbvxyl` («Agenda PSI V2», la versión actual), también leído en modo
consulta el 2026-08-26. Dos de las cosas que este documento pedía **ya existen ahí**, y se
señalan en su lugar.

**Qué NO pude verificar:** el código Flutter de la web (`meagendamx-a11y/agenda_psi_web`)
no está en este equipo. Todo lo que sale sólo de
`referencias/ageda_psi_final/boceto_1/docs/03-web-paciente-flujo.md` va marcado
**[según el documento]**. Todo lo demás está verificado contra el sistema desplegado.

---

## 0. Lo primero, porque cambia la conversación entera

**En cinco meses de operación, la web de agendar produjo 19 citas.**

| Qué | Cuánto | Cómo se sabe |
|---|---|---|
| Ligas enviadas (agendar + reprogramar) | **800** | `select count(*) from booking_access_tokens` |
| Ligas que alguien llegó a abrir | **78** (9.75 %) | filas en `active_session` + `expired`; el estado sólo lo mueven las funciones que resuelven el enlace al abrirlo, ningún cron lo toca |
| Citas creadas desde la web | **19** | `notifications` con `event_type = 'appointment_created'`; **sólo** `create_appointment_from_booking` inserta ese evento |
| Citas creadas en total en el sistema | **855** | `select count(*) from appointments` |
| Reprogramaciones hechas desde la web | **8** | `notifications` con `event_type = 'appointment_rescheduled'`; **sólo** `reschedule_appointment_from_booking` lo inserta |
| Reprogramaciones en total | **137** | `select count(*) from rescheduled_appointments` |

De 422 ligas de agendar, 63 se abrieron y 19 terminaron en cita. De 378 ligas de
reprogramar, 15 se abrieron y 8 terminaron en cambio.

No es que el recorrido estuviera mal diseñado. Es que **pedirle a una paciente que salga
de WhatsApp, abra un navegador y navegue un calendario cuesta el 90 % de las
solicitudes**. Ese es el argumento más fuerte a favor de volverlo conversación, y es un
número, no una opinión.

---

## 1. El recorrido completo, pantalla por pantalla

### 1.1 Cómo empezaba: la paciente nunca pedía la liga

Hay cuatro orígenes de liga, y en **ninguno** la paciente elige agendar:

| Origen | Qué lo dispara | Tipo de liga | Vence en |
|---|---|---|---|
| `rpc_handle_incoming_whatsapp_text_simple` | La paciente escribe **cualquier texto** al WhatsApp | agendar | 7 días |
| `complete_appointments_and_create_followup_jobs` | Termina una sesión (job `post_appointment_followup`) | agendar | 7 días |
| `create_jobs_for_confirm_25hours` | Recordatorio de 25 h antes (job `reminder_24h`) | reprogramar | 2 días |
| `enqueue_manual_whatsapp_job_for_patient` | El profesional la manda a mano (job `manual_create_appointment`) | agendar | 7 días |

No había detección de intención. La paciente escribía «hola» y el sistema decidía por
ella. Antes de mandar la liga había **tres salidas**, no una: número que no aparece en
`whatsapp_links`, paciente marcada como inactiva, y —la que importa— paciente que ya
tiene una cita futura. En ese último caso no mandaba liga, contestaba este texto fijo:

```
Hola {nombre} 👋

Ya tienes una cita próxima con Psic. {nombre} el {DD/MM} a las {h:mm AM}.

Modalidad: {En línea | Presencial}.

Este chat funciona solo con botones y envío de comprobantes.

Para confirmar, cancelar o reprogramar tu cita, usa los botones del
recordatorio que se envía un día antes de tu sesión.

Si necesitas ayuda personalizada, escríbenos al 55 6437 0081.
```

Ojo con el alcance: ese filtro mira **cualquier** cita futura de la paciente, sin importar
el servicio. El bloqueo por servicio es otro, y vive más adelante, en la pantalla.

Antes de crear una liga nueva de agendar, invalidaba las anteriores de esa paciente
(`status = 'invalidated'`, `canceled_at = now()`). Pero sólo las que nadie había abierto:
el `update` lleva `and status = 'created'`. Una liga ya abierta sobrevivía intacta, así
que sí podía haber dos ligas vivas al mismo tiempo.

### 1.2 Pantalla 0 — Abrir la liga (`/access/:token`)

La paciente toca el botón del mensaje de WhatsApp. Twilio abre el navegador en
`/access/<token de 32 caracteres hexadecimales>`.

La página llama a la función de borde `resolve-booking-access` con `POST { rawToken }`.
Esa función hace tres cosas y devuelve un solo código:

1. `resolve_booking_access_token(p_raw_token)` — hashea el token con SHA-256 y lo busca.
2. Si el token estaba `created`, genera un secreto de sesión de 32 bytes,
   guarda su hash con `activate_booking_access_session` y devuelve la cookie
   `__Host-agp_booking_access`. Si estaba `active_session`, valida la cookie que ya trae
   el navegador con `validate_booking_access_session`.
3. `resolve_booking_access_final_state(p_booking_access_token_id)` — decide a qué
   pantalla va. Si la liga es de agendar, contesta ella misma. Si es de reprogramar,
   le pasa la pregunta a una quinta función, `check_reschedule_eligibility`, que es la
   que produce todos los códigos `appointment_*`.

Códigos posibles, trece en total: `create_ready`, `reschedule_ready`, `token_expired`,
`token_used`, `session_inactive`, `appointment_past`, `appointment_cancelled`,
`appointment_already_rescheduled`, `appointment_completed_has_future`,
`appointment_completed_no_future`, `no_token`, `invalid_request`, `server_error`.

Uno de esos trece no puede ocurrir: `token_used` sale de que el token esté en `consumed`,
y nada escribe ese estado. Ver 3.3.

**No hay pantalla intermedia:** con `create_ready` el router va directo a `/crear-cita`;
con `reschedule_ready`, a `/reprogramar-cita`. Cualquier otro código es una pantalla de
mensaje sin salida. **[según el documento]**

### 1.3 Recorrido de AGENDAR (`/crear-cita`)

| Paso | Qué veía la paciente | Qué se consultaba | Con qué datos |
|---|---|---|---|
| 1 | — (invisible) | `get-booking-access-context-data` | la cookie → devuelve `patientId` |
| 2 | Saludo con su nombre y el del profesional, y la lista de servicios | `get_initial_booking_data(p_patient_id)` | `patientId` |
| 3 | Si ya tenía cita de ese servicio: mensaje de bloqueo | `get_future_scheduled_appointment_for_service(p_patient_id, p_service_id)` | paciente + servicio elegido |
| 4 | Modalidad: en línea / presencial | nada; sale de `modality` del servicio | — |
| 5 | Calendario del mes con los días disponibles habilitados | `get_available_booking_dates_for_month(p_patient_id, p_service_id, p_modality, p_month_start)` | + el mes que se está viendo |
| 6 | Lista de horarios del día elegido | `get_available_booking_slots_for_date(p_patient_id, p_service_id, p_modality, p_selected_date)` | + la fecha exacta |
| 7 | Confirmación y creación | `create_appointment_from_booking(...)` | profesional, paciente, servicio, `is_custom`, modalidad, hora de inicio |
| 8 | Pantalla de éxito; la página recarga el contexto | `get-current-booking-access-context` | la cookie |

**Dato que importa: en agendar nunca se mostró el precio.** `get_initial_booking_data`
devuelve `service_id`, `name`, `modality` e `is_custom`. No devuelve precio.
`get_available_booking_slots_for_date` tampoco. El precio se resolvía **dentro** de
`create_appointment_from_booking`, después de que la paciente ya había confirmado.

### 1.4 Recorrido de REPROGRAMAR (`/reprogramar-cita`)

| Paso | Qué veía la paciente | Qué se consultaba | Con qué datos |
|---|---|---|---|
| 1 | — (invisible) | `get-booking-access-context-data` | la cookie → `patientId` **y** `appointmentId` |
| 2 | Su nombre, la cita actual escrita en español, el precio y la modalidad | `get_appointment_confirmation_data(p_patient_id, p_appointment_id)` | paciente + cita |
| 3 | Calendario del mes | `get_available_booking_dates_for_month(...)` | el servicio y la modalidad **se heredan de la cita** |
| 4 | Horarios del día | `get_available_booking_slots_for_date(...)` | — |
| 5 | Confirmación y cambio | `reschedule_appointment_from_booking(p_appointment_id, p_patient_id, p_modality, p_start_datetime)` | — |
| 6 | Pantalla de éxito; recarga completa | — | — |

Reprogramar **no pregunta servicio**: lo hereda. `get_appointment_confirmation_data`
devuelve el servicio de la cita, su modalidad, el precio ya cobrado y una bandera
`has_min_reschedule_notice` que dice si la paciente está dentro del plazo de aviso.

El texto de la cita actual se arma en la base, mes por mes a mano:

```
2 de junio a las 6:00 am
```

---

## 2. De dónde salía cada lista

| Lista | Función | Parámetros | Qué devuelve |
|---|---|---|---|
| Servicios | `get_initial_booking_data` | `p_patient_id` | nombre de la paciente, nombre del profesional, `professional_id` y arreglo de servicios |
| ¿Ya tiene cita? | `get_future_scheduled_appointment_for_service` | `p_patient_id`, `p_service_id` | `SIN_CITA` o `CON_CITA` + texto ya formateado |
| Fechas | `get_available_booking_dates_for_month` | `p_patient_id`, `p_service_id`, `p_modality`, `p_month_start` | `{"available_dates": ["2026-09-01", ...]}` |
| Horarios | `get_available_booking_slots_for_date` | `p_patient_id`, `p_service_id`, `p_modality`, `p_selected_date` | `{"available_slots":[{"label":"10:00 - 11:00","start_datetime":"...","end_datetime":"..."}]}` |
| Cita a reprogramar | `get_appointment_confirmation_data` | `p_patient_id`, `p_appointment_id` | nombre, texto de la cita, precio, modalidad, servicio, `has_min_reschedule_notice` |

**Ojo con la documentación anterior:** el documento `03-web-paciente-flujo.md` lista
`get_services_for_patient` entre las funciones de la web de paciente. **No lo es.** Esa
función arranca con `v_auth_uid := auth.uid()` y lanza «Usuario no autenticado» si no hay
sesión. Es de la app del profesional. La web de paciente podía llamarla —el permiso está
abierto— pero siempre recibía ese error, nunca una lista de servicios.

### 2.1 Qué servicios veía

`get_initial_booking_data` tiene dos caminos:

- Si la paciente tiene servicios asignados (`patient_services`) que además estén activos
  y sean de su profesional → **muestra sólo esos**, con `is_custom = true`.
- Si no tiene ninguno → **muestra todo el catálogo activo del profesional**, con
  `is_custom = false`.

Esa bandera viaja hasta el final: `create_appointment_from_booking` usa `p_is_custom`
para decidir de dónde sale el precio. Si es personalizado toma
`coalesce(ps.custom_price_int, s.default_price_int)` —es decir, si a la paciente le
asignaron el servicio pero no le pusieron precio propio, cobra el de catálogo—; si no es
personalizado toma `services.default_price_int` directo.

### 2.2 Cómo se calculaba la disponibilidad

Las dos funciones de disponibilidad hacen exactamente lo mismo; una devuelve días y la
otra horas. Su lógica, en orden:

1. Saca `professional_id` de `patients`.
2. Saca la duración del servicio de `services.duration` (es un `TIME`, se convierte a
   minutos) y su modalidad. Si el servicio no está activo, **falla con excepción**.
3. Si la modalidad pedida no cabe en la del servicio (`AMBOS` acepta cualquiera), falla.
   Con `p_modality = 'AMBOS'` también falla: hay que elegir una.
4. Lee `configurations.min_booking_notice` del profesional.
5. Calcula el arranque: la hora actual en `America/Mexico_City`, **redondeada hacia
   arriba al siguiente bloque de 30 minutos**, más `min_booking_notice` minutos.
6. Para cada día: si hay `special_schedules` de ese día, **ése manda por completo**
   (incluido `enabled = false`, que apaga el día). Si no, usa `weekly_schedules` con
   `dow` donde lunes = 0 (`extract(isodow) - 1`).
7. Toma la ventana de la modalidad (`online_*` o `in_person_*`) y sus `breaks`
   (guardados como `[{"start_min":540,"end_min":1080}]`, minutos desde medianoche).
8. Genera candidatos **cada 30 minutos** desde el arranque, y descarta el que no quepa
   completo antes del cierre, el que se traslape con un descanso, y el que se traslape
   con una cita en `SCHEDULED`.

**La anticipación mínima se aplicaba en dos de los tres lugares, no en tres.** Manda al
listar fechas y al crear la cita. Al listar los **horarios de un día** sólo se aplica si
ese día es hoy:

```sql
-- get_available_booking_slots_for_date, paso 8
if p_selected_date = v_now_cdmx::date then
    v_effective_start_ts := greatest(v_work_start_ts, v_effective_min_start_ts);
else
    v_effective_start_ts := v_work_start_ts;   -- el mínimo se ignora
end if;
```

Medido hoy, 2026-08-26 a las 11:35 de CDMX, con la paciente 37, su servicio de 60 minutos
en línea y su profesional 10, que exige 36 horas de anticipación:

| Pregunta a la base | Respuesta |
|---|---|
| ¿Qué días quedan de agosto? | 28, 29 y 31 — **el 27 no aparece** |
| ¿Qué horarios hay el **27**? | **nueve** |
| ¿Qué horarios hay el 26? | ninguno |

Los nueve horarios del 27 son mentira. Cualquiera de ellos rebota al confirmar, en
`create_appointment_from_booking`, con «Ese horario ya no está disponible. Elige uno más
tarde.» En la web nunca se notó porque el calendario no dejaba tocar el 27: el día ni
siquiera se encendía.

**En conversación esto se vuelve un callejón sin salida.** La paciente dice «mañana», el
agente le ofrece nueve horas, ella elige una, y la cita no se crea. Quien pregunte los
horarios de un día tiene que descartar por su cuenta los que caen antes del mínimo, o
preguntar primero por las fechas del mes y no salirse de ésas.

El valor es `min_booking_notice` y está en **minutos**:

| Profesional | `min_booking_notice` | Equivale a | `min_reschedule_notice` |
|---|---|---|---|
| 10 | 2160 | 36 h | sí |
| 15 | (vacío) | sin mínimo | (vacío) |
| 20 | 1440 | 24 h | sí |
| 21 | (vacío) | sin mínimo | sí |
| 22 | 1440 | 24 h | sí |
| 23 | 1440 | 24 h | sí |
| 24 | 1440 | 24 h | sí |
| 25 | 1440 | 24 h | sí |

`min_reschedule_notice` es un interruptor de sí/no, no un plazo. Cuando está encendido,
el plazo es **24 horas fijas escritas en el código** de
`reschedule_appointment_from_booking` y de `get_appointment_confirmation_data`:

```sql
if v_old_start_datetime >= (v_now_cdmx + interval '24 hours') then
    v_patient_policy_status := 'IN_TIME';
else
    v_patient_policy_status := 'OUT_OF_TIME';
end if;
```

**Y no bloquea nada.** Reprogramar tarde sí se podía; sólo quedaba marcado en la cita
vieja como `OUT_OF_TIME` y la notificación al profesional decía `outside_policy`.

---

## 3. Cómo se creaba la cita al final

### 3.1 Agendar — `create_appointment_from_booking`

Firma:

```sql
create_appointment_from_booking(
  p_professional_id bigint,
  p_patient_id      bigint,
  p_service_id      bigint,
  p_is_custom       boolean,
  p_modality        modality,          -- LINEA | PRESENCIAL, nunca AMBOS
  p_start_datetime  timestamp          -- sin zona; convención: hora de CDMX
) returns jsonb
```

Valida, en este orden: que ningún parámetro venga vacío; que la hora esté en punto o y
media (`extract(minute) in (0, 30)`); que la paciente pertenezca a ese profesional; que
la fecha no sea pasada; que la hora respete `min_booking_notice`; que exista el servicio
y esté activo; que la modalidad quepa; que el día tenga horario para esa modalidad; que
la cita completa quepa en la ventana laboral; que no caiga en un descanso; y que no se
traslape con otra cita `SCHEDULED`.

Después inserta en `appointments` con `session_status = 'SCHEDULED'`,
`payment_status = 'PENDING'` y `editable = false`, e inserta una fila en `notifications`
con `event_type = 'appointment_created'`.

**El pago no se toca.** La cita nace en pendiente y punto. No hay cobro, ni comprobante,
ni prepago en este recorrido.

La función **cree** estar protegida contra dos personas eligiendo el mismo hueco a la vez:

```sql
exception
    when exclusion_violation then
        raise exception 'Ese horario ya fue tomado hace un momento. Elige otro horario.';
```

**Ese manejador es código muerto.** La tabla `appointments` no tiene ninguna restricción
de exclusión ni ningún índice único que impida el traslape:

```sql
select conname from pg_constraint
where conrelid = 'public.appointments'::regclass and contype = 'x';
-- (cero filas)
```

Los siete índices de la tabla son la llave primaria y seis índices de búsqueda. Ninguno
es único sobre horario. Lo único que separa dos citas encimadas es el
`if exists (...)` que se ejecuta **antes** del `insert`, sin candado sobre la agenda: es
leer y luego escribir, con una rendija abierta en medio. En la web esa rendija duraba
milisegundos y nunca se notó.

**Esto ya está resuelto en la versión actual y no hay que construirlo.** El proyecto
`ssyzfeadyrczlzjbvxyl` sí tiene la restricción que aquí falta:

```sql
excl_appointments_no_overlap
  EXCLUDE USING gist (professional_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status = 'scheduled')
```

O sea que la base nueva rechaza el empalme ella misma, sin importar cuánto tarde la
paciente en contestar. El hallazgo sigue siendo cierto de la versión anterior; lo que
cambia es que ya no genera trabajo.

### 3.2 Reprogramar — `reschedule_appointment_from_booking`

Firma:

```sql
reschedule_appointment_from_booking(
  p_appointment_id  bigint,
  p_patient_id      bigint,
  p_modality        modality,
  p_start_datetime  timestamp
) returns jsonb
```

Toma la cita vieja **con candado** (`for update`), verifica que sea de esa paciente, y
según su estado devuelve `ok: false` con `appointment_past`, `appointment_cancelled`,
`appointment_already_rescheduled` o `appointment_completed`. Sólo sigue si está
`SCHEDULED`.

Luego repite exactamente las mismas validaciones de horario que agendar y hace tres
escrituras:

1. Inserta una **cita nueva** con el mismo servicio y **el mismo precio de la vieja**
   (`v_price_int` se copia de la cita original, no se recalcula del catálogo).
2. Marca la vieja como `RESCHEDULED` y le escribe `patient_policy_status`.
3. Inserta la relación en `rescheduled_appointments (old_appointment_id, new_appointment_id)`.

Y crea la notificación `appointment_rescheduled` con horas vieja y nueva, modalidad vieja
y nueva, y `policy_status`.

**El dinero tampoco se mueve aquí.** La cita nueva nace `PENDING`. Si la vieja ya tenía
pago, ese pago se queda en la vieja. No hay traspaso.

**Y hay un tope que nadie escribió a propósito: no se puede recorrer una cita.** La
revisión de empalme no excluye la cita que se está moviendo. El propio código lo dice:

```sql
-- Aquí NO excluimos la cita original.
-- Eso hace que su horario siga contando como ocupado hasta que la cambiemos a RESCHEDULED.
```

Caso concreto: la paciente tiene sesión de una hora el jueves a las 5:00 pm y quiere
pasarla a las 5:30 pm del mismo jueves. Imposible. Su propia cita bloquea el horario y la
función contesta «Ese horario ya no está disponible. Elige otro horario.» La lista de
horarios tampoco se lo muestra, por la misma razón. En la web se veía como un día raro
con menos huecos; en conversación es una paciente pidiendo media hora más y un agente
diciéndole que no sin poder explicar por qué. En la versión actual esto no pasa:
`reschedule_appointment` marca la cita vieja como reprogramada **antes** de insertar la
nueva.

### 3.3 El token nunca se gastaba

Esto es un hallazgo, no una descripción.

Busqué qué función escribe `status = 'consumed'` en `booking_access_tokens`:

```sql
select p.proname from pg_proc p ... where p.prosrc ilike '%''consumed''%';
-- resolve_booking_access_final_state
-- resolve_booking_access_session_context
-- resolve_booking_access_token
-- rpc_handle_incoming_whatsapp_image
```

Las tres primeras sólo **leen** ese estado para decidir qué contestar. La cuarta lo
menciona en otro contexto. **Ninguna función lo escribe.** Y los datos lo confirman: de
800 tokens, **cero** están en `consumed`.

Consecuencia práctica: la liga de agendar seguía viva 7 días después de haberla usado. Lo
único que impedía crear dos citas era el aviso de
`get_future_scheduled_appointment_for_service`, y ése lo aplicaba **la página**, no la
base. Con la liga en la mano y la página recargada, la paciente podía crear otra cita en
cuanto la primera dejara de contar como futura.

Y la limpieza tampoco alcanzaba: la invalidación que corre al mandar una liga nueva sólo
toca las que están en `created` (ver 1.1). Una liga ya abierta se queda viva junto con la
nueva.

---

## 4. El acceso sin cuenta

### 4.1 Las piezas

| Pieza | Qué es | Dónde vive |
|---|---|---|
| Token real | 16 bytes aleatorios → 32 caracteres hexadecimales | sólo en la URL de WhatsApp |
| `token_hash` | SHA-256 del token real, en hexadecimal | `booking_access_tokens.token_hash` |
| Secreto de sesión | 32 bytes aleatorios en base64-url | sólo en la cookie del navegador |
| `session_secret_hash` | SHA-256 del secreto | `booking_access_tokens.session_secret_hash` |
| Cookie | `__Host-agp_booking_access` | navegador |

La cookie se emite así:

```
__Host-agp_booking_access=<secreto>; Path=/; Max-Age=<ttl>; HttpOnly; Secure; SameSite=None; Partitioned
```

El `Max-Age` **no es un valor fijo**: es lo que le queda al token para vencer
(`session_ttl_seconds`, calculado como `expires_at - now()`). O sea que la sesión del
navegador y el token vencen al mismo segundo.

### 4.2 Los estados del token

`booking_access_tokens.status` es texto libre, no un enum. Los valores en uso:

| Estado | Significado | Quién lo escribe |
|---|---|---|
| `created` | Liga enviada, nunca abierta | las dos funciones `create_booking_access_token_for_*` |
| `active_session` | Alguien abrió la liga y tiene cookie | `activate_booking_access_session` |
| `expired` | Se abrió después de vencer | se normaliza al abrir, en tres funciones distintas |
| `invalidated` | Reemplazada por una liga nueva | `rpc_handle_incoming_whatsapp_text_simple` |
| `consumed` | **nunca ocurre** | nadie |

Conteo real al 2026-08-26:

| Estado | Agendar | Reprogramar |
|---|---|---|
| `created` (nunca abierta) | 356 | 363 |
| `active_session` (abierta) | 52 | 12 |
| `expired` | 11 | 3 |
| `invalidated` | 3 | 0 |
| `consumed` | 0 | 0 |

### 4.3 La caducidad

Está en el valor por omisión de cada función:

```sql
create_booking_access_token_for_create(..., p_expires_at default now() + interval '7 days')
create_booking_access_token_for_reschedule(..., p_expires_at default now() + interval '2 days')
```

Siete días para agendar, dos para reprogramar. Y como la liga de reprogramar nace en el
recordatorio de 25 horas antes de la cita, esos dos días cubren de sobra la vida útil de
esa cita.

### 4.4 Por qué se eligió este camino, y por qué no aguanta el argumento

El motivo declarado, en el propio documento de diseño anterior, es que **no hay login**:
la paciente no tiene cuenta, y había que mover un calendario, una modalidad y una
duración variable en una pantalla. Un formulario web era la respuesta obvia, y el token
firmado era la forma barata de saber quién estaba del otro lado.

El problema es que **el candado no cerraba**. Estos son los permisos reales de ejecución
en la base:

| Función | Quién puede ejecutarla |
|---|---|
| `resolve_booking_access_token` | sólo `service_role` |
| `activate_booking_access_session` | sólo `service_role` |
| `validate_booking_access_session` | sólo `service_role` |
| `resolve_booking_access_session_context` | sólo `service_role` |
| `resolve_booking_access_final_state` | sólo `service_role` |
| `get_initial_booking_data` | **`anon`**, `authenticated`, `service_role` |
| `get_available_booking_dates_for_month` | **`anon`** |
| `get_available_booking_slots_for_date` | **`anon`** |
| `get_appointment_confirmation_data` | **`anon`** |
| `create_appointment_from_booking` | **`anon`** |
| `reschedule_appointment_from_booking` | **`anon`** |

Las funciones que **validan** el token están bien cerradas. Pero **las dos que escriben
citas están abiertas a `anon`**, y reciben `p_patient_id` y `p_appointment_id` como
parámetros sin verificar ningún token ni ninguna cookie. Con la llave pública del proyecto
y un número de paciente, se podía crear o mover una cita sin haber recibido nunca una
liga.

Y las que **emiten** ligas tampoco están cerradas:
`create_booking_access_token_for_create` y `create_booking_access_token_for_reschedule`
también son ejecutables por `anon`, y devuelven el token en claro. O sea que con la llave
pública se podía fabricar una liga válida para cualquier paciente.

Para el diseño nuevo esto importa por una razón concreta: **conversar por WhatsApp es más
seguro que la web anterior, no menos.** La identidad viene del número de teléfono
verificado por Meta, no de un parámetro que el cliente escribe.

---

## 5. Cuántos datos se movían en cada paso

Esta es la sección que decide si la versión conversacional puede usar listas
interactivas de WhatsApp, que tienen un tope duro de **diez opciones**.

### 5.1 Servicios

Servicios asignados por paciente (`patient_services` con servicio activo):

| Servicios asignados | Pacientes |
|---|---|
| 1 | 67 |
| 2 | 24 |
| 3 | 4 |

**95 de 98 pacientes veían entre 1 y 3 servicios. Nunca más de 3.**

Los 3 restantes no tienen servicios asignados, así que veían el catálogo completo de su
profesional:

| Profesional | Pacientes | Sin servicios asignados | Catálogo activo |
|---|---|---|---|
| 10 | 79 | 0 | 3 |
| 15 | 1 | 0 | 2 |
| 20 | 5 | **2** | 3 |
| 22 | 1 | 0 | 4 |
| 23 | 2 | 0 | 1 |
| 24 | 3 | 0 | **11** |
| 25 | 7 | **1** | 8 |

**Veredicto: cabe en una lista de diez, salvo un caso.** El profesional 24 tiene 11
servicios activos, pero sus 3 pacientes ya tienen servicios asignados, así que hoy nadie
llega a ver los 11. Es un borde real que puede aparecer mañana, no un problema de hoy.

### 5.2 Fechas

Medido con paciente 37, servicio «Psicoterapia individual» (60 min), en línea, contra el
profesional 10 (`min_booking_notice = 2160` min = 36 h):

| Mes | Fechas disponibles |
|---|---|
| Agosto 2026 (lo que queda del mes) | **3** |
| Septiembre 2026 (mes completo) | **26** |

**Veredicto: no cabe.** Un mes normal devuelve 26 días hábiles con hueco. Eso son 26
opciones, dos veces y media el tope de una lista interactiva. El calendario visual las
mostraba todas de un golpe sin costo; una conversación no puede.

**[según el documento]** la pantalla recortaba a 60 días hacia adelante en hora de CDMX.
Eso serían unas **50 fechas** navegables en total, repartidas en dos o tres meses que la
paciente hojeaba con flechas. No pude verificarlo en el código Flutter; la función de base
devuelve el mes completo sin recorte.

### 5.3 Horarios

Aquí está el problema serio. La grilla avanza **de 30 en 30 minutos sin importar cuánto
dure el servicio**, así que las opciones se traslapan entre sí. Un miércoles del
profesional 10 —en línea de 09:00 a 20:00, con un descanso de 15:00 a 16:00— y un
servicio de una hora producen esto:

```
09:00 - 10:00 | 09:30 - 10:30 | 10:00 - 11:00 | 10:30 - 11:30 | 11:00 - 12:00 | 11:30 - 12:30
12:00 - 13:00 | 12:30 - 13:30 | 13:00 - 14:00 | 13:30 - 14:30 | 14:00 - 15:00 | 16:00 - 17:00
16:30 - 17:30 | 17:00 - 18:00 | 17:30 - 18:30 | 18:00 - 19:00 | 18:30 - 19:30 | 19:00 - 20:00
```

Dieciocho opciones para elegir una hora. Sin traslapes son **diez**: 9, 10, 11, 12, 1, 2,
4, 5, 6 y 7. Ése es el número que importa, y aparece medido más abajo.

Medición sobre septiembre 2026 completo, tres combinaciones reales:

| Servicio y modalidad | Días con cupo | Mínimo de horarios | Promedio | Máximo | Días con más de 10 |
|---|---|---|---|---|---|
| Psicoterapia individual 60 min · en línea | 26 | 1 | 9.0 | **18** | 9 |
| Psicoterapia individual 60 min · presencial | 21 | 3 | 8.0 | **16** | 8 |
| Terapia hidrosistémica 90 min · en línea | 25 | 2 | 7.4 | **16** | 8 |

**Veredicto: tal cual sale de la base, no cabe.** Uno de cada tres días pasa de diez
horarios. El promedio de nueve queda pegado al tope, así que cualquier profesional con
agenda más abierta lo rompe.

Pero si se quitan los traslapes —o sea, si se ofrecen sólo horas separadas por la duración
del servicio— el mismo septiembre da esto:

| Servicio y modalidad | Promedio de horas | Máximo en un día | Días con más de 10 |
|---|---|---|---|
| Psicoterapia individual 60 min · en línea | 5.4 | **10** | **0** |
| Psicoterapia individual 60 min · presencial | 4.8 | **9** | **0** |
| Terapia hidrosistémica 90 min · en línea | 3.1 | **6** | **0** |

**Quitar los traslapes basta.** Ningún día de septiembre pasa de diez en ninguna de las
tres combinaciones. El peor día —el que daba 18— da exactamente 10. Eso es caber, pero sin
un dedo de margen: un profesional que abra más horas lo rompe, y hay que tener lista una
salida para ese día (ver 7.1, paso 4).

### 5.4 Resumen de la sección

| Paso | Opciones de golpe | ¿Cabe en lista de 10? |
|---|---|---|
| Servicio | 1 a 3 (95 de 98 pacientes); hasta 11 en el borde | **Sí**, casi siempre |
| Modalidad | 1 o 2 | **Sí** |
| Fecha | 26 en un mes; ~50 en los 60 días | **No** |
| Horario, con traslapes | 9 en promedio, hasta 18 en un día | **No** |
| Horario, sin traslapes | 5.4 en promedio, hasta 10 en un día | **Sí, justo justo** |

**Conclusión operativa: las fechas no se pueden listar, hay que preguntarlas. Los horarios
sí caben, siempre que se quiten los traslapes.**

---

## 6. Qué se pierde al pasarlo a texto

Lista honesta, con la salida para cada cosa.

**1. El calendario que se ve completo de un vistazo.**
La paciente veía el mes entero con los días muertos apagados. En texto no hay equivalente:
26 fechas no se pueden decir.
*Salida:* que el agente no ofrezca fechas, que las **verifique**. La paciente dice «el
jueves» o «la próxima semana» y el agente contesta si hay o no, y si no, cuáles son los
dos o tres días cercanos que sí.

**2. La reja de horarios.**
Dieciocho horarios que se leían de un vistazo. En texto son un muro.
*Salida:* **quitar los traslapes**, y ya. En conversación sólo tienen sentido las horas
separadas por la duración del servicio, no la grilla de 30 minutos. Con eso el peor día
medido baja de 18 a 10 y ningún día de septiembre se pasa. Preguntar por la parte del día
queda como salida de emergencia para el día que sí se pase, no como paso fijo.

**3. Hojear meses.**
El calendario tenía flechas para ir a octubre.
*Salida:* que el agente entienda «en octubre», «la última semana del mes», «después del
15».

**4. El aviso de «ya tienes cita» que la página daba sin que se notara.**
La web consultaba `get_future_scheduled_appointment_for_service` en silencio y bloqueaba.
*Salida:* el agente tiene que decirlo en voz alta, con la cita concreta: «Ya tienes
Psicoterapia individual el 2 de junio a las 6:00 am. ¿Quieres cambiar ésa de día?». Y es
mejor así: el bloqueo silencioso era una pared, la frase es una bifurcación.

**5. La inmediatez entre ver el hueco y tomarlo.**
En la web pasaban segundos entre ver un horario y confirmarlo. En conversación pasan
minutos, y el hueco se puede ir.
*Salida:* nada que construir del lado de la base. La versión actual ya tiene la
restricción de empalme (ver 3.1), así que la cita chocada se rechaza sola. Lo único que
falta es el texto: hoy dice «Elige otro horario» y no dice cuáles. En conversación el
error tiene que traer las dos alternativas más cercanas, o la paciente se queda parada.

**5b. El día que la base ofrece y la base rechaza.**
Descubierto en 2.2: la lista de horarios de un día futuro no respeta la anticipación
mínima. La paciente dice «mañana», recibe nueve horas y ninguna se puede agendar.
*Salida:* que el agente no pregunte el día a ciegas. O consulta primero las fechas del mes
—esa función sí respeta el mínimo— y no se sale de ésas, o descuenta el mínimo por su
cuenta antes de leer horarios en voz alta.

**6. Los días en los que sólo hay una modalidad.**
El profesional 10 tiene presencial apagado los sábados, pero en línea encendido de 8 a 6.
Por eso el mismo servicio da 26 días con hueco en línea y sólo 21 presencial en el mismo
mes. El calendario lo escondía filtrando.
*Salida:* el agente lo dice: «Ese día sólo tengo en línea, ¿te sirve?».

**7. La sensación de control de una pantalla.**
Nada que hacer. Es el costo real del cambio, y contra él está el 90 % de ligas que nadie
abrió.

**Lo que NO se pierde, y conviene decirlo:**

- **La seguridad.** Mejora. El teléfono verificado es más fuerte que un parámetro que hoy
  cualquiera con la llave pública puede escribir.
- **El precio.** En agendar por web nunca se mostró. En conversación se puede decir antes
  de confirmar. Es una ganancia, no una pérdida.
- **La caducidad.** Ya no hace falta. Una conversación no vence en siete días.
- **El estado del token.** Los trece códigos de la función de borde se reparten así: dos
  dicen «pantalla lista» (`create_ready`, `reschedule_ready`) y dejan de existir porque ya
  no hay pantalla; **seis son puro andamiaje del enlace** (`no_token`, `token_used`,
  `token_expired`, `session_inactive`, `invalid_request`, `server_error`) y desaparecen
  con el enlace; y **cinco son de negocio** y sobreviven: la cita ya pasó, ya se canceló,
  ya se movió, ya se completó y tiene otra futura, ya se completó y no tiene otra. Esos
  cinco se le dicen a la paciente en tres frases, porque «ya pasó» y «ya se completó» son
  la misma noticia para ella.

---

## 7. El recorrido conversacional equivalente

Mismo recorrido, escrito como conversación. En cada paso digo **cuántas opciones se
ofrecen y cómo**.

### 7.1 Agendar

**Paso 0 — El disparo.**
La paciente escribe. A diferencia de antes, lo que escribe **sí importa**: puede decir
«quiero cita», «quiero cita el jueves en la tarde» o las tres cosas en tres mensajes
seguidos. Aquí es donde entra el agrupamiento de Kapso: se espera a que termine de
escribir y se procesa una sola solicitud. Si ya dijo día y hora, los pasos 3 y 4 se saltan
y se va directo a verificar.

**Paso 1 — Servicio. Entre 0 y 3 opciones, como lista o como pregunta.**

- Si tiene **un solo** servicio (67 de 98 pacientes): **no se pregunta**. Se da por hecho
  y se menciona al confirmar.
- Si tiene **dos o tres** (28 pacientes): lista interactiva con esas opciones. Cabe de
  sobra.
- Si no tiene ninguno asignado y el catálogo trae **más de diez**: no se lista. Se
  pregunta abierto («¿qué tipo de sesión buscas?») y el agente empata contra el catálogo.

**Paso 1b — El bloqueo, dicho en voz alta.**
Si ya hay cita futura de ese servicio, no se sigue:

> Ya tienes Psicoterapia individual el **2 de junio a las 6:00 am**.
> ¿Quieres mover ésa de día, o agendar una sesión distinta?

Dos opciones, como botones.

**Paso 2 — Modalidad. 0 o 2 opciones, como botones.**

- Servicio de una sola modalidad (todo el catálogo del profesional 24 es en línea): **no
  se pregunta**.
- Servicio `AMBOS` (todo el catálogo del profesional 10): dos botones, «En línea» y
  «Presencial».

**Paso 3 — Fecha. Cero opciones listadas. Se pregunta abierto, con tres pistas.**

> ¿Qué día te queda bien? Los más cercanos que tengo son **viernes 28**, **sábado 29** y
> **lunes 31**.

Las tres pistas salen de las tres primeras fechas de
`get_available_booking_dates_for_month`. No son la lista: son un ancla para que la
paciente no adivine. La paciente puede contestar «el 31», «el lunes», «la próxima semana»
o «¿tienes en octubre?».

**Cuidado con el fin de mes.** Esa función contesta un mes y sólo ése, y contesta vacío
cuando el mínimo de anticipación se pasa del último día. Hoy, 26 de agosto, devuelve tres
fechas. El 30 de agosto va a devolver **cero**, con septiembre entero libre. Si el agente
pregunta un mes y se queda con lo que le contesten, le va a decir a la paciente que no hay
nada. Tiene que preguntar el mes siguiente cuando el actual venga corto.

Si el día que pide no tiene hueco:

> Ese día ya no tengo espacio. El más cercano es el **miércoles 2**, y también tengo el
> **jueves 3**. ¿Alguno te sirve?

Dos opciones, como botones.

**Paso 4 — Hora. Hasta 10 opciones, sin traslapes. Un solo paso.**

Nunca las 18: se ofrecen **horas separadas por la duración del servicio**, no la grilla de
30 minutos.

> Para el miércoles 2 tengo: **9:00**, **10:00**, **11:00**, **12:00**, **1:00 pm**,
> **2:00 pm**, **4:00 pm**, **5:00 pm**, **6:00 pm** y **7:00 pm**.

Diez opciones. Este es el peor día de septiembre en las tres combinaciones que medí —el
que daba 18 horarios con traslapes— y sin traslapes da exactamente 10. El promedio del mes
es 5.4. **No hace falta preguntar «¿mañana o tarde?»**: ese paso sería un ida y vuelta más
para ahorrar cero opciones.

Sólo si algún día llegara a pasar de diez —un profesional con la agenda más abierta que la
que hay hoy— se acota antes con dos botones, «Por la mañana» y «Por la tarde». Es la
salida de emergencia, no el camino normal.

Si la paciente propone su propia hora («¿a las 5?»), no se lista nada: se contesta sí o
no, y si es no, la más cercana.

**Paso 5 — Confirmación. Una opción y su contraria.**

> Entonces: **Psicoterapia individual**, **en línea**, el **miércoles 2 de septiembre a
> las 10:00 am**. Son **$600**. ¿Confirmo?

Dos botones: «Sí, agenda» y «Cambiar algo». Aquí el precio sí se dice, cosa que la web
nunca hizo. Y es el precio **de esa paciente**: el servicio 38 cuesta $800 de catálogo,
pero la paciente 37 lo tiene asignado en $600 (`patient_services.custom_price_int`). Ese
es el valor que `create_appointment_from_booking` graba en la cita cuando
`p_is_custom = true`.

**Paso 6 — El resultado.**
Si el hueco se fue mientras conversaban, no se dice «elige otro horario». Se dice:

> Se acaba de ocupar esa hora. Tengo **11:00** ese mismo día, o **10:00** el jueves.
> ¿Cuál tomo?

Dos opciones, como botones.

### 7.2 Reprogramar

Es el recorrido **corto**, porque servicio y modalidad se heredan de la cita. Sólo hay dos
preguntas.

**Paso 0 — El disparo.**
Botón del recordatorio, o la paciente escribe «no puedo el jueves». Si ya dijo cuándo sí
puede, el paso 1 se salta.

**Paso 1 — Qué cita. Cero opciones.**
Hoy, de las 9 pacientes con cita futura agendada, las 9 tienen exactamente una. Así que
**no se pregunta**: se nombra.

> Tienes **Psicoterapia individual el jueves 3 a las 5:00 pm**, en línea. ¿La movemos?

Si está fuera del plazo de aviso (`has_min_reschedule_notice` en falso), **no se bloquea**
—la versión anterior tampoco bloqueaba— pero se advierte, porque el profesional lo va a
ver marcado.

**Paso 2 — Fecha nueva. Cero opciones listadas, tres pistas.** Igual que agendar.

**Paso 3 — Hora nueva. Hasta 10 opciones.** Igual que agendar, con una salvedad de la
versión anterior que ya no aplica en la actual: ahí no se podía recorrer la cita unos
minutos, porque ella misma bloqueaba su horario (ver 3.2).

**Paso 4 — Confirmación.**

> La muevo del **jueves 3 a las 5:00 pm** al **martes 8 a las 6:00 pm**. Sigue en línea y
> sigue costando **$600**. ¿Confirmo?

El precio no cambia porque `reschedule_appointment_from_booking` **copia el precio de la
cita vieja**, no lo recalcula del catálogo.

Dos botones.

### 7.3 Cuadro final de opciones por paso

| Paso | Agendar | Reprogramar | Cómo se ofrece |
|---|---|---|---|
| Servicio | 0 a 3 (11 en el borde) | **0** (se hereda) | Lista, o pregunta abierta si pasa de 10 |
| Modalidad | 0 o 2 | **0** (se hereda) | Botones |
| Fecha | **0 listadas**, 3 pistas | **0 listadas**, 3 pistas | Pregunta abierta + anclas |
| Hora | 1 a 10 (5.4 promedio) | 1 a 10 | Lista, sin traslapes |
| Parte del día | sólo si el día pasa de 10 | igual | Botones, salida de emergencia |
| Confirmar | 2 | 2 | Botones |

**Ningún paso pasa de diez opciones.** La lista interactiva de WhatsApp alcanza para
todos, siempre que la fecha se pregunte en vez de listarse y la hora se ofrezca sin
traslapes.

---

## 8. Lo que hay que decidir antes de construir

Cuatro cosas que la web resolvía por accidente y en conversación hay que decidir a mano:

1. **La grilla fina.** En la versión anterior avanzaba de 30 en 30 minutos. En la actual
   avanza **de 15 en 15** (`_get_internal_availability_core` tiene
   `v_step constant int := 15`, y el tamaño del bloque es duración más margen). El mismo
   miércoles que daba 18 opciones daría **41**. O sea que el problema es el doble de
   grande, no la mitad. Si la conversación ofrece horas separadas por la duración del
   servicio, está **ocultando** huecos que sí existen (las 9:15, las 9:30). Es la decisión
   correcta para no abrumar, pero hay que tomarla a sabiendas: si la paciente pide «9:30»
   explícitamente, el sistema sí puede dárselo.

2. **La anticipación mínima, dicha o callada.** En la versión anterior iba de 24 a 36 horas
   según el profesional y salía de `configurations.min_booking_notice` en minutos; en la
   actual es `patient_min_booking_lead_minutes`, con 24 horas por omisión. La web la
   aplicaba en silencio: los días simplemente no aparecían. En conversación, cuando la
   paciente pida «mañana» y no se pueda, el agente tiene que explicar por qué, con el plazo
   de **esa** profesional, nunca con una constante.

3. **Quién descuenta el mínimo.** Hallazgo de 2.2: en la versión anterior, la lista de
   horarios de un día futuro **no** lo descontaba, y ofrecía horas que la creación
   rechazaba. La versión actual sí lo descuenta parejo, pero **sólo cuando se le pide**
   (`p_apply_patient_lead`). Si el agente consulta con ese interruptor apagado, vuelve el
   mismo callejón sin salida. Hay que decidir de una vez que todo lo que se le lee a una
   paciente sale con el interruptor encendido.

4. **La cita que ya existe.** La regla anterior era «una cita futura por servicio». La
   aplicaba la página, no la base, y por eso se podía burlar recargando. Si en la versión
   nueva se quiere sostener, tiene que vivir en la operación que crea la cita, no en el
   texto del agente.
