# 06 · La migración y el plan

Corte: 2026-08-26. Base auditada y verificada: Supabase `ssyzfeadyrczlzjbvxyl`.
Última migración aplicada: **`20260824043359_agent_workflow_capabilities`**.

Este documento reemplaza al anterior, que describía el agente por formulario de WhatsApp. Todo
lo que decía sobre `flow_data_exchange`, `flow_token`, pantallas y `waiting_external` para
formularios **está retirado**. Manda
[`docs/anterior/01-decisiones-del-ensayo.md`](../anterior/01-decisiones-del-ensayo.md).

---

## 0. Lo que hay que hacer, en una página

Trece archivos de migración quedan por aplicar: **siete que ya estaban escritos** (cinco se
corrigen, dos se reusan tal cual) y **seis nuevos**. Ninguno está aplicado. Además hay un dato
que sembrar a mano, un despliegue de borde y un rediseño de las herramientas en Kapso.

| # | Archivo | Estado |
|---|---|---|
| 1 | `20260824200000_agent_cerrojos_tanda0.sql` | **se reusa tal cual** |
| 2 | `20260825000000_agent_dominio_fundamento.sql` | **corregido** |
| 3 | `20260825001000_agent_consultas_agenda.sql` | **corregido** |
| 4 | `20260825002000_agent_pagos.sql` | **corregido** |
| 5 | `20260825003000_agent_citas_mutaciones.sql` | **corregido** |
| 6 | `20260825004000_agent_recursos_resena.sql` | se reusa, con un límite conocido |
| 7 | `20260825005000_agent_perfil_relacion.sql` | se reusa, con un límite conocido |
| 8 | `20260826000000_agente_portero_conversacional.sql` | **nuevo** |
| 9 | `20260826001000_agente_datos_de_pago.sql` | **nuevo** |
| 10 | `20260826002000_agente_busqueda_con_filtros.sql` | **nuevo** |
| 11 | `20260826003000_agente_expediente.sql` | **nuevo** |
| 12 | `20260826004000_agente_pasar_el_pago.sql` | **nuevo** |
| 13 | `20260826005000_agente_prepago_24h.sql` | **nuevo** |

**Nada se tiró.** Los siete archivos previos valían la pena: el trabajo de esta ronda fue
corregir cosas concretas dentro de ellos y escribir lo que faltaba, no rehacerlos.

Los trece viven en
`supabase/migrations/` del repositorio de la app, y **ninguno se aplicó**: sólo se escribieron.

**Cuatro correcciones llegaron después de la primera pasada, revisando contra la base**, y las
cuatro son de las que rompen algo en producción, no de estilo. Están explicadas donde toca; se
listan aquí para que nadie las descubra tarde:

| Dónde | Qué estaba mal |
|---|---|
| §1.5 · crear cita | El reloj de 24 horas del prepago **no arrancaba**, y una cita de prepago para dentro de menos de 48 h **nacía confirmada**. Con las dos, la frase que el agente dice al cerrar era mentira |
| §2.2 · datos de pago | La columna de la CLABE **ya existe** y se llama `payment_clabe_or_account`. Crear `payment_clabe` partía la ficha de pago en dos |
| §4 · borde | `/media/payment-proof` estaba en la lista de rutas a borrar. Es la única que sirve el comprobante, y `attach_payment_proof` **se muda, no se retira** |
| §1.3 · disponibilidad | La consulta de horarios seguía aceptando el turno aparcado por dentro, y su prueba seguía exigiendo el comportamiento viejo |

---

## 1. Los siete archivos que ya estaban, uno por uno

### 1.1 `20260824200000_agent_cerrojos_tanda0.sql` — **se reusa tal cual**

No se le tocó una línea. Es el archivo más importante de todos y el que menos ruido hace,
porque contiene **la función que emite la llave de los identificadores opacos**:

```sql
public.agent_register_option_token_key(p_key_id text, p_can_issue boolean, p_verify_until timestamptz)
```

`private.agent_token_key_registry` está **vacía** en producción (0 filas, y 0 identificadores
emitidos en toda la historia). Mientras siga vacía, **toda** operación que ofrezca una lista
—servicios, horarios, citas, cobros— aborta con `AGENT_WORKFLOW_*_TOKEN_KEY_MISSING` antes de
devolver nada. Es el bloqueante de todo lo demás, y su arreglo no es código: es un `select`. Va
en la §3.

Trae además el índice único parcial que garantiza **a lo más una llave emisora viva**, el
barrendero de sesiones y turnos vencidos (`sweep_expired_agent_sessions`) y el apagador de
emergencia por número (`agent_set_runtime_target`), que es la palanca de apagado de la §9.

Un matiz que cambia lo que se puede prometer en la §9: **el barrendero todavía no corre**. Hoy
`cron.job` tiene siete entradas y ninguna es suya (verificado el 26-08-2026). El archivo lo
programa cada 5 minutos, así que empieza a correr al aplicarlo — pero hasta entonces, apagar el
número no cierra ningún turno vivo por sí solo.

### 1.2 `20260825000000_agent_dominio_fundamento.sql` — **corregido**

Es el archivo de permisos y helpers. Tres cambios:

**a) Se le quitó la copia del portero.** Traía un `CREATE OR REPLACE` de
`private.agent_claim_tool_call` con dos operaciones añadidas. Con el agente conversacional eso
dejó de ser un parche de dos líneas y se volvió una reescritura, así que la sección entera se
retiró y en su lugar quedó un puntero al archivo nuevo (#8). Dejarla habría significado escribir
la misma función dos veces y que la versión intermedia siguiera nombrando la superficie
`flow_data_exchange`, que ya no existe.

**b) Permisos nuevos**, todos de lectura salvo uno:

| Permiso | Por qué |
|---|---|
| `SELECT ON public.recurrence_series` | Ahí viven **tres de las cuatro piezas** del ritmo que se le dice a la paciente: cada cuánto, qué día y a qué hora. `appointments.series_id` dice que hay serie, pero no dice ninguna de las tres |
| `SELECT` sobre los cuatro horarios (`weekly_schedules`, `weekly_schedule_blocks`, `special_schedules`, `special_schedule_blocks`) | Es lo **único** que separa «Araceli no atiende sábados» de «los sábados ya se le llenaron». Sin ellos, los dos casos son el mismo silencio. **No** se usan para calcular huecos: eso lo sigue haciendo `_get_internal_availability_core`, que es `SECURITY DEFINER` de `postgres` |
| `DELETE ON public.payment_proofs` | El **único** `DELETE` de toda la superficie del agente. Lo exige mover el comprobante al pasar el pago: `UNIQUE (payment_id)` no deja dos filas a la vez, y un `UPDATE` del `payment_id` **no dispararía** `tg_payment_proofs_degradar_prepago_ai`, así que a la paciente le llegaría una petición del dinero que acaba de mover |

Los que la auditoría había marcado como faltantes —`blocked_slots`, `professional_connections`,
`professional_appointment_policies` y el `EXECUTE` sobre `public._get_internal_availability_core`—
**ya estaban escritos en este archivo**. No se duplicaron: se reusaron.

Como el archivo declaraba en su §1.10 que esos permisos se dejaban **a propósito** en cero, esa
sección se corrigió también. Y con ella, los tres asertos de prueba que prohibían leer
`recurrence_series` y los horarios: se **invirtieron** a «lee y no escribe», que es la garantía
que de verdad importa. *(De paso apareció que la prueba de `20260825001000` ya se contradecía con
la migración `20260825000000`: aseguraba que `blocked_slots` y `professional_connections` no
tenían `SELECT`, y aquélla se los concede.)*

**d) Un resto del diseño por formulario que se queda, y hay que decirlo.** El archivo crea
`private.agent_resolve_turn_context`, y ese ayudante lleva un parámetro `p_allow_waiting_external`
que existe sólo para el mundo del formulario: con él en `true`, la operación se autoriza sobre un
turno aparcado. **Ninguna función de dominio lo llama** —lo único que lo invoca es su propia
prueba— así que hoy es inerte y no abre nada. Se deja tal cual por la misma razón que
`saga_state`: quitarle el parámetro obliga a reescribir once llamadas de una prueba a cambio de
cero comportamiento. Lo que **no** se deja es que alguien lo use: si una función futura lo llama,
lo llama con `false`.

**c) Seis helpers de vocabulario en español**, movidos aquí desde el archivo de búsqueda porque
la lista de servicios (#3, que se aplica antes) también los necesita: `agent_es_weekday_name`,
`agent_es_weekday_plural`, `agent_es_day_label`, `agent_es_hour_label`, `agent_weekday_from_es` y
`agent_configured_blocks`. Ninguno depende de `lc_time`: la localización del servidor no es un
contrato.

> **El agente nunca calcula fechas.** Estos helpers existen para que el servidor entregue
> «miércoles 2 de septiembre a las 4:00 de la tarde» ya escrito y el modelo sólo lo copie.

### 1.3 `20260825001000_agent_consultas_agenda.sql` — **corregido**

**a) La lectura de horarios, los tres arreglos del dueño.** La primitiva de disponibilidad genera
un candidato **cada quince minutos**, así que 3:00, 3:15 y 3:30 son la misma hora ofrecida tres
veces sobre la misma sala. Tomando los primeros seis, un viernes de 3:00 a 7:00 se contestaba
«3:00, 3:15, 3:30, 3:45, 4:00 y 4:15»: **las 5:00 no aparecían nunca**.

- el tope sube de **6 a 10**;
- se **quitan los traslapes** con una pasada golosa: se conserva el primero de cada bloque y se
  descarta todo el que empiece antes de que ése termine;
- se **respeta la franja** que pidió, con dos parámetros nuevos y opcionales
  `p_from_local_time` / `p_to_local_time` en formato `'HH:MM'`, comparados contra la hora de
  **inicio** («a las 5» quiere decir que empiece a las 5, no que quepa ahí);
- el horizonte baja de 60 a **30 días**, que es la regla del dueño;
- `truncated` deja de medirse sobre el crudo —venía inflado de traslapes y decía «hay más»
  siempre— y se mide sobre lo ofrecido.

**Faltaba un cuarto arreglo, y es del diseño retirado.** Esta consulta era la única que aceptaba
correr con el turno **aparcado** (`waiting_external`), porque el formulario corría así. El portero
nuevo (#8) retira esa excepción del catálogo, pero la consulta la traía **también por dentro**, en
su propio bloque de comprobaciones: el catálogo la habría rechazado y la función la habría
aceptado, que son dos reglas distintas sobre lo mismo. Ya exige `active`, igual que las otras
cinco.

**Y la prueba de este archivo no acompañaba a la corrección.** `supabase/tests/20260825001000…`
aparcaba el turno a propósito y exigía que la consulta **contestara**, y además fijaba el
resultado en **exactamente seis huecos**, que es justo el tope que este archivo sube a diez. Con
la migración corregida y la prueba sin tocar, la prueba fallaba. Ahora afirma lo contrario: con el
turno aparcado se niega, y con el turno activo devuelve entre uno y diez.

**b) La lista de citas se colapsa por serie**, con `DISTINCT ON (COALESCE(series_id, id))`, y **el
conteo se colapsa igual que el ciclo**. El `COALESCE` es indispensable: `DISTINCT ON (series_id)`
a secas colapsaría todas las citas sueltas en una, porque `NULL` agrupa con `NULL`. Y si sólo se
colapsara el ciclo, `truncated` mentiría.

> Consecuencia que hay que decirle a la paciente, no callarle: **sólo lo que salió en esa lista se
> puede tocar**, porque sólo eso lleva identificador. Si pide mover la tercera sesión de su serie,
> la respuesta es que por aquí se mueve la más próxima y que las demás las ve con su profesional.
> Es una frase, no un silencio.

**c) La lista de servicios, los seis cambios juntos.** Iban juntos a propósito: el tercero sin el
primero deja a 13 de 17 pacientes con la lista vacía y `ok: true`.

1. el conteo se parte en dos y `v_total` se llena según la rama;
2. el `LEFT JOIN` se cambia por `UNION ALL` con `NOT EXISTS`, así las dos ramas se excluyen por
   construcción y nunca sale una lista mezclada;
3. se quita el `LIMIT 5` y la bandera `truncated`: cinco es el tope de opciones que el agente
   **ofrece en un mensaje**, no el tope de servicios que una profesional puede tener;
4. se declaran `v_assigned_count` y `v_source`, y `source` sale en el resultado;
5. `is_free` se emite como **`v_price = 0`**, no como la bandera: existe en producción un
   *Valoración Sin Costo* que cuesta $800, y un preferente de 0 vuelve gratis un servicio de paga;
6. se añade **`recurrencia`** por servicio, compuesto entero por el servidor, y `proxima_cita`.

Ejemplo del campo `recurrencia`, que el modelo copia palabra por palabra:

> Cada dos semanas, los miércoles a las 4:00 de la tarde; **tu próxima quedó** el viernes 4 de
> septiembre a las 6:00 de la tarde.

El «quedó» en vez de «es» aparece sólo cuando la próxima cita **no** cae en el día y la hora de la
serie. Callarlo la manda a un día equivocado. La fecha de la próxima **se lee de `appointments`**,
nunca se deriva de `start_date + N × paso`: una serie puede tener huecos y una ocurrencia puede
haberse movido sin salir de la serie.

### 1.4 `20260825002000_agent_pagos.sql` — **corregido**

Una sola corrección, en el aviso a la profesional cuando llega un comprobante: llevaba
`charge_reason` y **el monto**, y no llevaba ninguna de las claves del contrato. Ahora lleva las
cuatro (`patient_first_name`, `appointment_starts_at`, `appointment_ends_at`,
`appointment_modality`) y **el monto se fue**, porque el contrato de notificaciones lo prohíbe
expresamente para este tipo.

El resto se reusa entero, incluido el detalle de que este archivo ya había arreglado por su cuenta
la sobre-concesión de `command_log` que su propia cabecera advertía.

### 1.5 `20260825003000_agent_citas_mutaciones.sql` — **corregido**

Es donde estaban los agujeros que de verdad movían dinero.

**0) El que faltaba: al agendar con prepago, el reloj de 24 horas no arrancaba.** Es el agujero
más caro de la ronda y no estaba visto. Crear la cita insertaba el cobro con **la petición de
comprobante vacía** y sin método. Dos consecuencias, las dos verificadas contra la base:

| Lo que el agente dice | Lo que pasaba de verdad |
|---|---|
| «Si no llega en 24 horas, la cita se cancela y se libera el horario» | El reloj cuelga del sello de la petición. Sin sello, el barrido del prepago (#13) **no ve la cita**. El único que llega a sellarla es el cron de 26 h, y ése corre 26 h antes de la **sesión**: una cita apartada para dentro de diez días se quedaba diez días ocupando el horario sin un peso |
| «La cita nace sin confirmar y el comprobante es lo que la confirma» | Una cita de prepago **dentro de las 48 h nacía confirmada**, y el barrido del prepago descarta lo confirmado. Ésa nunca se iba a cancelar |

Dos líneas lo cierran, las dos dentro de crear la cita:

- el cobro nace con **la petición sellada en ese instante** y método `transfer` —van juntos por
  obligación del `CHECK` que ata las dos columnas, y además es la verdad: el comprobante que se le
  pide es de una transferencia—;
- la cita de prepago **nace sin confirmar siempre**, sin importar cuán cerca esté la sesión.

Los permisos ya alcanzaban: la petición y el método ya estaban en el `INSERT` autorizado del
fundamento. Y no dispara ningún aviso duplicado: no hay ningún *trigger* de inserción sobre
cobros, así que el único mensaje que ella recibe es el del agente.

**a) El cerrojo del dueño: una cita con dinero adentro no se cancela.** Va después de cargar el
pago y **antes** de la matriz económica. «Dinero adentro» tiene definición exacta: `status =
'credited'` **o** existe fila en `payment_proofs`. Una petición sellada sin archivo **no cuenta**.

Sin el cerrojo había dos fugas vivas:

| Estado | Qué pasaba |
|---|---|
| Comprobante recibido | Caía en la rama de «a tiempo + pendiente» y se **condonaba**. El registro decía «no se cobró» de un dinero que sí entró |
| Acreditado | **No caía en ninguna rama.** El pago se quedaba `credited/session` colgando de una cita `cancelled` y desaparecía de Cobros para siempre, porque `get_billing_day` exige que `charge_reason` case con el estado de la cita |

**Sólo muerde a tiempo.** Tarde no hace falta: cancelar tarde congela el pago y abre la decisión
para la profesional, así que el dinero no se evapora. Cerrarlo también tarde dejaría a la paciente
sin poder cancelar y sin nada que ofrecerle.

**b) Reprogramar tarde congela el dinero.** Es la regla nueva y deroga «mover es gratis siempre».
Ahora hay dos ramas, y **cuál aplica lo decide el aviso, no el estado del pago**:

| Aviso | El pago viejo | La cita nueva |
|---|---|---|
| **a tiempo** | viaja: `waived` + `carried_forward` | nace con el mismo importe, estado, método y comprobante |
| **tarde** | **se congela** sobre la cita `rescheduled`: estado, método, petición y archivo intactos, más `charge_reason = 'reschedule'` y `late_change_decision = 'pending'` | nace con **su propio** cobro `pending` |
| sin costo | no se abre decisión ni tarde ni a tiempo | `not_applicable` |

Columna por columna, la rama tardía es el modo `'charge_old'` que la función de la profesional ya
hace hoy. No hay nada que inventar.

Que el `UPDATE` del congelado **no toque `status`** es deliberado: así el trigger
`payments_apagar_cobro_au` no dispara y los avisos de comprobante que quedaban en cola sobreviven,
que es justo lo que se quiere.

> **La consecuencia hay que decirla, no esconderla:** la paciente queda con **dos cobros vivos**,
> el congelado de la sesión que movió y el de la sesión nueva. El resultado devuelve
> `pending_charge_decision` y `new_session_charged` para que el mensaje lo diga.

**c) La petición de comprobante viaja siempre**, y **el comprobante se mueve, no se copia.** El
`CASE WHEN v_old_has_proof` que copiaba `proof_requested_at` sólo cuando además había archivo era
un agujero: una petición sellada sin comprobante se perdía al mover, el trigger cancelaba el aviso
en cola, y nadie volvía a pedirlo nunca. Y dos filas de `payment_proofs` apuntando a la misma ruta
de archivo son una bomba de limpieza: el job de storage borra el objeto por la primera y la
segunda queda apuntando a un archivo que ya no existe.

**d) Las claves del contrato en los cinco avisos.** Las funciones mandaban `starts_at`,
`modality`, `command_id`… y **nunca el nombre de la paciente**. Con eso, los seis avisos y sus push
llegarían con el texto de respaldo: «Nueva notificación · Hay una actualización reciente en tu
cuenta». Ahora los cinco `INSERT INTO public.notifications` leen el nombre en la misma consulta y
llevan `patient_first_name`, `appointment_starts_at`, `appointment_ends_at` y
`appointment_modality`. Se arregla **sin tocar la app**.

**e) Se retiran los dos ecos de WhatsApp.** Cancelar y reprogramar encolaban
`appointment_cancelled` y `appointment_rescheduled` **al mismo teléfono con el que el agente
acababa de conversar**. En la app de la profesional ese aviso tiene sentido porque la paciente no
estaba presente; por el agente es un eco frío del mensaje que ella acaba de recibir.

### 1.6 `20260825004000_agent_recursos_resena.sql` — se reusa, con un límite conocido

La mitad de la reseña se reusa entera. **La mitad de los materiales no puede funcionar todavía**, y
no por culpa de este archivo:

- nada en la base desplegada escribe `quick_reply_token_hash`, y el `CHECK chk_batch_token` exige
  que ese hash y `token_expires_at` existan para poder sellar `token_used_at`;
- **no hay ningún consumidor de `public.jobs`**: `claim_jobs_batch` y `dispatch_jobs` sólo existen
  en `referencias/`, no en `pg_proc`, y ningún cron los invoca. Evidencia dura: el único lote de
  producción lleva desde el 25 de agosto en `waiting_for_patient` con hash nulo.

**Decisión: se despliega la función y se deja apagada la capacidad en el prompt.** No se menciona
«materiales» hasta que exista el materializador. Escribirlo es la ronda siguiente.

### 1.7 `20260825005000_agent_perfil_relacion.sql` — se reusa, con un límite conocido

`select_relationship` y `get_professional_share_profile` se reusan enteros. El límite es el
marketplace: `agent_get_capabilities` enciende `list_marketplace_professionals` cuando la relación
no es de paciente activa, y **detrás no hay nada**: ninguna ruta, ninguna función. El expediente
nuevo (#11) ya no la enciende, y el prompt no la menciona.

---

## 2. Los seis archivos nuevos

### 2.1 `20260826000000_agente_portero_conversacional.sql` — el portero

Reemplaza **las dos mitades** del libro de idempotencia de una sola vez:
`private.agent_claim_tool_call` y `private.agent_finalize_tool_call`. Van juntas porque la saga
vive repartida entre ellas: la primera la autoriza y la segunda la avanza. Retirarla de una y
dejarla en la otra deja turnos marcados `awaiting_replacement_create` que nadie sabe destrabar.

**El catálogo nuevo: de 26 operaciones en 4 superficies a 11 en 2.** Son, exactamente, las seis
herramientas del catálogo conversacional.

| Superficie | Operaciones | Turno |
|---|---|---|
| `agent_node` — 2 lecturas | **`open_dossier`**, **`search_availability`** | `active` |
| `agent_node` — 8 mutaciones | **`create_appointment`**, `confirm_appointment`, `cancel_appointment`, `reschedule_appointment`, `switch_appointment_modality`, **`attach_payment_proof`**, **`carry_payment_forward`**, `submit_review` | `active` |
| `workflow_internal` — cierre | `complete_inbound` | `completing`, ordinal 13 |

Se retiran **diecisiete** operaciones:

- las **cuatro** de formulario —`flow_data_exchange` tiene cuatro, no cinco:
  `flow_list_services`, `flow_get_eligibility`, `flow_get_availability` y
  `flow_create_appointment` (leído del cuerpo desplegado el 26-08-2026)—;
- `open_booking_flow` y `cancel_then_open_booking_flow`;
- las **diez lecturas sueltas** que el expediente absorbe: `get_capabilities`,
  `select_relationship`, `list_services`, `get_booking_eligibility`,
  `list_upcoming_appointments`, `get_next_appointment`, `get_location`,
  `get_pending_payments`, `get_appointment_payment_status` y `get_professional_share_profile`;
- `get_availability`, que sustituye `search_availability`;
- `resume_resource_delivery`, porque nadie consume `public.jobs`;
- `send_fixed_response`, que es de nodo y ningún nodo puede llamarla.

La autorización número dieciocho que desaparece es el par `media_adapter` +
`attach_payment_proof`, y ésa **no se retira: se muda** a `agent_node`. La diferencia importa en
el borde: una operación retirada pierde su ruta, una operación mudada la conserva (§4).

> **Ojo con `get_capabilities`: es la única que el agente ha ejercido alguna vez** —tres llamadas
> en toda la historia— y es la que el gateway desplegado contesta en `/tools/capabilities`. En el
> instante en que se aplica esta migración, esa ruta deja de funcionar. Por eso el paso 4 (el
> gateway con `/tools/expediente`) va pegado a éste, y por eso el paso 1 es apagar el número.

**El alta de `create_appointment` es lo que hace conversacional al agente.** Sin esa línea,
agendar por texto devuelve `TOOL_NOT_ALLOWED` siempre; lo único que existía era
`flow_create_appointment`, y ahí estaba bloqueada salvo dentro de la maniobra de saga.

**`attach_payment_proof` se muda a `agent_node`.** Estaba en `media_adapter`, pero quien decide que
una imagen es un comprobante es el modelo, y el modelo vive en el nodo del agente. En esta
arquitectura no hay un adaptador de medios separado: el gateway es el único adaptador.

**El presupuesto sube de 8 a 12.** Agendar gasta 3 —expediente, búsqueda, crear—, así que quedan
nueve de margen para quien pregunta mucho.

> **La trampa del ordinal, y es la parte más frágil de toda la ronda. Son CINCO lugares, no dos.**
> El cierre vive fuera del presupuesto con un ordinal fijo, que pasa de 9 a 13, y el tope útil pasa
> de 8 a 12. Esos dos números están escritos a mano en cinco sitios:
>
> 1. el cuerpo de `private.agent_claim_tool_call` (`v_budget`, `v_completion_ordinal`);
> 2. `agent_complete_inbound` y `agent_complete_inbound_from_workflow`, **tres lugares entre las
>    dos** —el `EXISTS`, el `INSERT` y la comprobación del `RETURN`—;
> 3. el `CHECK agent_turns_tool_call_count_check` (`tool_call_count <= 8`);
> 4. el `CHECK agent_tool_calls_check` (ordinales 1..8 y el 9 del cierre);
> 5. el índice parcial `uq_agent_tool_calls_one_completion_claim WHERE ordinal = 9`.
>
> Mover sólo el 1 y el 2 deja el sistema así: **la novena llamada aborta** contra el `CHECK` de
> `agent_turns` —y aborta *después* de insertar el renglón, así que se va atrás la transacción
> entera— y **el cierre en el 13 aborta** contra el `CHECK` de `agent_tool_calls`, con lo que
> ninguna gestión vuelve a cerrarse. Por eso los cinco van en este mismo archivo: los tres de
> esquema en su **sección 0** y los otros dos en el cuerpo de las funciones.
>
> **Y hay una letra chica que casi cuesta la migración entera.** El `CHECK` nuevo de
> `agent_tool_calls` va **`NOT VALID`**, y tiene que ir así: en producción hay **tres renglones con
> `ordinal = 9` y `operation = 'complete_inbound'`** —los tres cierres de agosto— y contra el
> `CHECK` nuevo valen falso. Un `ADD CONSTRAINT` normal revisa las filas viejas y **aborta la
> migración entera**. El de `agent_turns` sí va validado: es más laxo que el que sustituye.

**Se retira la saga con toda su maquinaria**: los cuatro valores de `saga_state`, el
`mutation_limit` variable, la reserva del ordinal 8 y el guardia `tool_call_count > 3`. Lo único
que sobrevive es el cerrojo que importa: **una reserva que quedó en `unknown` bloquea cualquier
mutación posterior del turno**, y ahora eso se deduce de `agent_tool_calls` en vez de guardarse en
una columna.

La columna `saga_state` **se queda**, congelada en `'normal'` y con un `COMMENT` que lo dice. No se
borra porque la nombran 20 líneas de la migración desplegada `20260823235236` y 14 asertos de su
prueba; borrarla obliga a reescribir esa prueba a cambio de cero comportamiento.

**Ninguna operación se autoriza ya en `waiting_external`.** Antes `get_availability` sí, porque el
formulario corría con el turno aparcado. Sin formulario, un turno aparcado es un turno que espera
el próximo mensaje, y `agent_bind_inbound_execution` lo devuelve a `active` antes de que el modelo
pueda llamar a nada (verificado leyendo su cuerpo: su `UPDATE` final escribe `status = 'active'`).

#### Ésta es la primera migración del agente que **no es aditiva**

Todas las anteriores sólo agregaban. Ésta **quita autorizaciones**: en el instante en que se
aplica, diecisiete operaciones dejan de estar permitidas y devuelven `TOOL_NOT_ALLOWED`.

Es segura por tres hechos verificados contra producción el 26-08-2026, no por confianza:

1. en toda la historia hay **6 llamadas de herramienta**, de dos operaciones (`get_capabilities` y
   `complete_inbound`), **0 mutaciones** y **0 identificadores emitidos**. Salvo
   `get_capabilities`, ninguna de las diecisiete que se retiran se ha ejercido nunca;
2. ninguna de las diecisiete tiene función de dominio desplegada: el gateway contesta 3 rutas de 27
   y las otras 24 devuelven `OPERATION_NOT_ENABLED`, así que hoy son nombres en una lista. La
   excepción es `get_capabilities`, que sí tiene función y sí tiene ruta — y por eso el paso 4 va
   pegado a éste;
3. la última actividad del agente es del 24-08-2026. **No hay ningún turno vivo.**

**Y aun así se aplica con el destino apagado** (§4, paso 1). Eso es lo que la vuelve segura también
la próxima vez, cuando ya haya tráfico: apagar el número garantiza que no exista un turno a medio
camino durante el cambio.

### 2.2 `20260826001000_agente_datos_de_pago.sql` — los tres campos de la ficha

**El hallazgo era mayor de lo que decía la versión anterior de este documento, y estaba mal
contado: las TRES columnas ya existen en producción.** No dos. La tercera se llama
`payment_clabe_or_account`, no `payment_clabe`. Verificado el 26-08-2026:

```
payment_bank_name | payment_account_holder | payment_clabe_or_account
```

Escribir `payment_clabe` no habría fallado —`ADD COLUMN IF NOT EXISTS` es callado— sino algo peor:
habría creado una **cuarta** columna y dejado la ficha de pago **partida en dos**, con el
expediente del agente leyendo la nueva, vacía para siempre, y cualquier pantalla que se hiciera
después escribiendo en la vieja. La paciente recibiría «pídele a Araceli los datos» aunque Araceli
los hubiera llenado. **Corregido:** la migración y el expediente nombran `payment_clabe_or_account`.

Las tres se siguen declarando con `ADD COLUMN IF NOT EXISTS`: sobre producción el `ALTER` no hace
nada y sobre una base limpia crea las tres, y de paso el repositorio deja de mentir sobre la tabla.
Ninguna migración del repo las creaba; alguien las agregó fuera del control de versiones.

**Y no hace falta ningún `GRANT` nuevo.** El archivo traía un `GRANT SELECT` por columna con la
explicación de que «el agente lee esta tabla por columna, no entera». Es falso: `agenda_psi_agent_owner`
**ya tiene `SELECT` sobre `public.professionals` entera** (se lo concede la migración desplegada
`20260823235236`), y un permiso de tabla cubre también las columnas que nazcan después. El `GRANT`
se retiró: no agregaba un solo permiso y hacía creer que el permiso era más estrecho de lo que es.

**Lo que de verdad falta en producción no es esquema, es dato.** Las cinco fichas tienen las tres
columnas **vacías**, así que hasta que alguien las llene el agente siempre usa el texto de
respaldo. Eso mueve la pantalla de captura de «se puede hacer después» a «sin ella, el prepago de
la §2.6 le pide a la paciente un comprobante sin decirle a dónde transferir».

**La regla de producto: los tres o ninguno.** Media ficha produce un mensaje roto —«transfiere a
BBVA, a nombre de , CLABE »— y el agente no puede repararlo a mitad de la frase. Con la regla de
los tres sólo hay dos caminos: los dice completos, o usa el texto de respaldo ya aprobado («pídele
a Araceli los datos para la transferencia»). Se valida en `update_professional_info` con
`INCOMPLETE_PAYMENT_DETAILS`, igual que ya se validan juntas las cuatro columnas del consultorio.

La CLABE se guarda en dígitos limpios y se valida contra `^[0-9]{18}$`: la paciente la copia y la
pega en su banco, y un espacio suelto la vuelve inválida allá.

Los dos RPC del profesional se extienden de forma **aditiva**: `get_professional_info` devuelve
tres claves más y `update_professional_info` acepta tres claves más en su lista blanca. Un cliente
viejo las ignora, así que la pantalla se puede hacer después.

### 2.3 `20260826002000_agente_busqueda_con_filtros.sql` — la búsqueda

```
public.agent_search_availability_from_workflow(
  p_provider_message_id, p_kapso_execution_id,
  p_service_handle, p_modality,
  p_weekdays text[],      -- «lunes», «miércoles»… en español, con o sin acento
  p_dates date[],         -- fechas concretas
  p_from_local_time text, -- 'HH:MM'
  p_to_local_time text
)
```

Recorre hasta 30 días **por dentro** y devuelve **hasta cinco opciones concretas**, o el motivo.
Una sola llamada aunque el servidor revise treinta días: el presupuesto cuenta viajes del modelo al
servidor, no trabajo de la base, y recorrer el horizonte está medido en 1.6 ms.

Cada opción viaja como `{slot_handle, etiqueta}`:

```json
{ "slot_handle": "…", "etiqueta": "miércoles 2 de septiembre, 12:00" }
```

El modelo razona sobre la etiqueta y devuelve el identificador. Un identificador desnudo degrada la
precisión de selección; emparejado con su etiqueta, no.

**Cuando no hay nada, se dice cuál de las seis cosas pasó**, y cada motivo trae sólo el dato que su
mensaje necesita. Un objeto con cinco nulos adentro es ruido, y el ruido en el resultado de una
herramienta es donde el modelo empieza a inventar.

| `empty_reason` | Qué trae | Qué se dice |
|---|---|---|
| `TOO_SOON` | `lead_hours`, `earliest_date`, `nearest_date_label` | «Para mañana ya no alcanzo: Araceli necesita 48 horas. Lo más cercano es el viernes 28.» |
| `OUT_OF_HOURS` | `works_from`, `works_to`, `alternatives` | «Araceli no da consultas por la mañana. Sus horarios son de 3:00 a 7:00.» |
| `OUT_OF_WEEKDAYS` | `working_weekdays`, `alternatives` | «Araceli no atiende sábados ni domingos. Entre semana sí tengo.» |
| `DATES_UNAVAILABLE` | `nearest_date_label`, `alternatives` | «El 15 y 16 Araceli no va a estar. Lo más cercano es el 17.» |
| `FULLY_BOOKED` | `nearest_date_label`, `alternatives` | «Los martes al mediodía ya se le llenaron. Sí tengo miércoles y jueves a esa hora.» |
| `BEYOND_HORIZON` | `last_date_label` | Más allá de 30 días: que vuelva a preguntar |

El recorrido es **una sola pasada** que llena dos cestas: las opciones que cumplen el filtro y las
alternativas de los días que no lo cumplen. La segunda sólo se entrega cuando la primera sale
vacía, y es lo que convierte «no tengo» en «sí tengo miércoles y jueves a esa hora».

Un detalle que importa: las dos negativas del servicio (inactivo, modalidad no admitida) se
comprueban **leyendo `public.services`**, no atrapando el `P0001` de la primitiva. Envolver el
recorrido en un bloque `EXCEPTION` crearía un savepoint alrededor de los identificadores ya
emitidos y los perdería todos.

### 2.4 `20260826003000_agente_expediente.sql` — el expediente de apertura

Una llamada al principio de la gestión que deja al modelo con:

- **qué hora es** donde vive la profesional, ya resuelta y con nombre de día. Los modelos no
  comparten una noción consistente de «ahora», y Kapso no ofrece una viva: `system.started_at` se
  escribe una vez y `last_resume.at` sólo al reanudar;
- **qué permite esta profesional**: los seis plazos de su ficha, ya divididos en horas, más la
  dirección, la liga y los datos de transferencia (o nulo explícito). Ninguna de las cinco
  profesionales tiene dirección y liga a la vez, así que el nulo explícito es la respuesta real;
- **qué se le puede ofrecer**: nueve banderas calculadas con la regla real de cada operación;
- **a qué le está contestando**: la plantilla que le mandamos, de qué cita era y hace cuántas horas.

**La pista de la última plantilla** sustituye al payload de un botón. Ninguna de las 18 plantillas
tiene botones: todas son texto. Se lee de `whatsapp_outbox` —cinco columnas, un `GRANT SELECT`
nuevo— filtrando por teléfono, `status = 'sent'` y `patient_id`, y el `appointment_id` sale del
`payload`, que lo lleva dentro en todas las plantillas de cita (verificado contra las filas reales;
un aviso de cita movida nombra dos y la que invita a hacer algo es siempre la nueva).

**El expediente no trae la lista de citas**, y es deliberado: traerla obligaría a emitir
identificadores de cita aquí, y ésos ya los emite `agent_list_upcoming_appointments_from_workflow`
con su propia llave estable. Dos emisores del mismo identificador es la clase de duplicado que
termina divergiendo. El expediente dice **cuántas** hay; cuando el modelo necesita tocar una, pide
la lista. Con eso la aritmética del dueño se sostiene:

| Gestión | Llamadas |
|---|---|
| Agendar | expediente + búsqueda + crear = **3** |
| Confirmar | expediente + lista + confirmar = **3** |
| Comprobante | expediente + cobros pendientes + adjuntar = **3** |

**La capacidad de reseña se corrige aquí.** `agent_get_capabilities` la enciende para las 17
pacientes activas, pero `request_patient_review` sólo admite 11: exige además ≥1 cita atendida y
ninguna reseña ya enviada. El modelo ofrecía algo que se le iba a negar.

### 2.5 `20260826004000_agente_pasar_el_pago.sql` — pasar el pago

Es la segunda salida del dueño cuando una cita trae dinero y no se puede cancelar.

**Un solo identificador: el destino lo resuelve el servidor.** Va a la primera cita viva del mismo
servicio posterior a la que se cancela, que es literal la regla de
`get_next_scheduled_appointment` y literal la frase del dueño («tu próxima sesión»).

No es una simplificación cosmética, es la única forma que funciona: la lista de citas se colapsa
por serie, así que pedirle que señale «la del 8», cuando la del 8 es la segunda ocurrencia de su
serie, **no tiene renglón que señalar**. Y de paso desaparecen cuatro motivos de rechazo que no
pueden ocurrir si el destino lo elige la consulta.

**Lo que se pierde, dicho sin maquillaje:** la paciente no puede elegir a cuál de sus citas futuras
va el dinero. Si tiene dos y quería la segunda, eso lo ve con su profesional.

| Pieza | Qué pasa |
|---|---|
| La cita vieja | `cancelled`, `on_time`, actor `patient`, conserva hora y modalidad |
| El pago viejo | `waived` + `carried_forward` + `charge_reason = 'cancellation'` + `resolved_at` |
| El comprobante | **cambia de dueño**: `DELETE` y luego `INSERT` sobre el pago destino |
| El pago destino | se **fusiona en su sitio**: conserva `id` y `appointment_id`, adopta estado, método, petición y resolución |
| El rastro | dos asientos enlazados en `payment_events` |

Diez motivos de rechazo: `OPTION_EXPIRED`, `APPOINTMENT_NOT_FOUND`,
`APPOINTMENT_NOT_CANCELLABLE`, `APPOINTMENT_ALREADY_STARTED`, `PATIENT_INACTIVE`, `LATE_CHANGE`,
`NO_MONEY_TO_CARRY`, `NO_TARGET`, `TARGET_HAS_MONEY`, `AMOUNT_MISMATCH`.

**No se escriben `amount` ni `charge_timing` del pago destino**, y es un cerrojo gratis:
`AMOUNT_MISMATCH` ya obligó a que los importes sean iguales, y el `charge_timing` sale de la misma
política del mismo profesional. Copiarlos no cambia un renglón y obligaría a abrir dos columnas más
en el `GRANT UPDATE` de `payments`. Así, **ninguna** operación del agente puede tocar el importe de
un cobro.

**A la profesional se le avisa de la cancelación, no del traslado.** No existe un tipo de aviso
para esto y su app pinta en blanco lo que no conoce; el dato del traslado viaja en el `payload`
esperando a que la app lo pinte.

### 2.6 `20260826005000_agente_prepago_24h.sql` — el reloj del prepago

Hoy la frase «si no llega en 24 horas, la cita se cancela y se libera el horario» **sería mentira**.
No existe nada que la cumpla: `cron_prepay_proof_request` es un cascarón que sólo levanta un
`RAISE WARNING` y ni siquiera está en `cron.job`.

`public.cron_prepay_autocancel(p_batch)` + su entrada en `cron.job` cada 5 minutos.

**A qué citas les corre el reloj, y a cuáles no:**

| Filtro | Por qué |
|---|---|
| `origin = 'patient'` | La creó ella por el agente. **Una cita que creó la profesional no se autocancela:** el reloj es parte del trato que el agente propuso, no una regla general. Sin este filtro, `cron_appointment_confirmation_26h` —que sella `proof_requested_at` 26 h antes de cualquier cita de prepago— haría que a las dos horas de la sesión se cancelaran citas que ella agendó a mano |
| `confirmed_at IS NULL` | En prepago la cita nace sin confirmar y es el comprobante lo que la confirma. Ojo: eso **también** es la corrección de la §1.5 punto 0 — antes, una cita de prepago para dentro de menos de 48 h nacía confirmada y este filtro la descartaba |
| `charge_timing = 'before'` | El prepago es propiedad del **cobro**, que es una instantánea de la política al crear la cita |
| `proof_requested_at + 24 h <= now()` | El reloj arranca cuando se le pidió el comprobante. Y **al agendar por el agente, pedírselo y agendar son el mismo instante**: es la corrección de la §1.5 punto 0. Sin ella este filtro no se cumplía nunca a tiempo y el barrido pasaba de largo |
| sin comprobante | Si mandó algo, ya no le corre nada |
| `starts_at > now()` | **Ésta es la respuesta a la pregunta abierta** de si el plazo vence antes cuando la sesión es en menos de 24 h: no vence antes, simplemente deja de aplicar en cuanto la sesión empieza. De ahí en adelante la lleva `cron_sweep_past_pending` a `past_pending` y decide la profesional |

Condonar aquí es honesto y no esconde nada: por definición **no hay dinero adentro**, porque una
cita con comprobante no llega a este barrido.

**El tipo de aviso, dicho sin maquillaje.** Se usa uno nuevo, `appointment_cancelled_unpaid`, que
hoy le llega a la profesional como tarjeta genérica. Se prefirió eso a reusar
`appointment_cancelled_by_patient`, que se pinta bonito pero **dice una mentira**: la paciente no
canceló nada. El registro de quién actuó es `cancel_reschedule_actor = 'system'`, y no se falsifica
por una tarjeta más legible. Las cinco claves del contrato van en el payload de todos modos, para
que el día que la app aprenda el tipo la tarjeta salga completa.

A la paciente **sí** se le encola `appointment_cancelled`: aquí no está en la conversación, y si no
se le avisa se presenta a una cita que ya no existe.

---

## 3. El dato que no va en ninguna migración

**Sembrar la llave emisora.** Es un dato, no código, y es **bloqueante de absolutamente todo**:
mientras `private.agent_token_key_registry` siga vacía, ninguna lista se puede ofrecer.

```sql
-- Como service_role, UNA vez, después de aplicar 20260824200000.
select public.agent_register_option_token_key(
  'agente-2026-08',            -- nombre de la llave; cualquier texto estable
  true,                        -- es la emisora
  now() + interval '90 days'   -- ventana de verificación
);
```

La ventana tiene que cubrir **con holgura** el techo de 15 minutos de los identificadores
reusables: la emisión se rechaza si `verify_until` no alcanza a cubrir la expiración del
identificador que se va a emitir. Noventa días es holgura de sobra.

**Rotar** es llamarla otra vez con un `key_id` nuevo. La función degrada a la anterior en vez de
borrarla, así que los identificadores ya emitidos se siguen verificando hasta su propia fecha, y el
índice único parcial garantiza que nunca haya dos emisoras vivas.

**Comprobación** (debe devolver exactamente una fila con `can_issue = true`):

```sql
select key_id, can_issue, verify_until from private.agent_token_key_registry;
```

---

## 4. La secuencia de despliegue, con la razón de cada posición

> **Restricción del entorno que manda sobre este plan:** desde aquí no hay `psql` ni credenciales
> de la base. El `.sql` se prepara completo y lo aplica Gael. Para las funciones de borde sí hay
> despliegue directo.

| # | Paso | Por qué va aquí |
|---|---|---|
| 1 | **Apagar el número**: `select public.agent_set_runtime_target('<phone_number_id>', false);` | El paso #2 quita autorizaciones. Con el destino apagado no puede existir un turno a medio camino mientras el catálogo cambia. Hoy no hay tráfico y sería inofensivo; el hábito es lo que lo vuelve seguro la próxima vez |
| 2 | Aplicar los **trece archivos**, en orden de nombre | El sello de tiempo ya garantiza el orden interno. Ver el detalle abajo |
| 3 | **Sembrar la llave** (§3) | Después de #2 porque la función que la registra nace en `20260824200000`. Antes del borde porque sin ella toda lista aborta |
| 4 | Desplegar **`agent_tool_gateway`** con las rutas nuevas | Antes de tocar Kapso: una herramienta que Kapso declare y el gateway no conteste devuelve `403 OPERATION_NOT_ENABLED`, y el modelo aprende a no usarla |
| 5 | Rehacer las **herramientas del nodo de agente** en Kapso (§5) | Después de #4, y con `kapso pull` antes de tocar nada |
| 6 | **Prender el número**: `agent_set_runtime_target(..., true)` | Último. Es la única acción que vuelve a admitir tráfico |
| 7 | Recorrido de aceptación en el sandbox (§7) | Con el número prendido y con el juego de datos sembrado |

**El orden interno de la base, y por qué no es cosmético:**

```
20260824200000  cerrojos      → la función que registra la llave, el barrendero, el apagador
20260825000000  fundamento    → permisos y helpers. TODO lo demás depende de esto
20260825001000  consultas     → usa los helpers de vocabulario del fundamento
20260825002000  pagos
20260825003000  mutaciones    → usa assert_appointment_slot_available, que necesita
                                los SELECT de blocked_slots y professional_connections
20260825004000  recursos y reseña
20260825005000  perfil y relación
20260826000000  portero       → reemplaza claim, finalize y las dos del cierre
20260826001000  datos de pago → declara las tres columnas con IF NOT EXISTS. Sin GRANT:
                                el rol ya lee professionals entera
20260826002000  búsqueda      → llama a los helpers del fundamento y a la primitiva
20260826003000  expediente    → lee las tres columnas de pago: DESPUÉS de 20260826001000
20260826004000  pasar el pago → necesita el DELETE de payment_proofs (fundamento)
20260826005000  prepago 24 h
```

Tres dependencias duras que no se pueden reordenar:

1. **fundamento antes que todo**: sin sus `GRANT`, las funciones se crean pero revientan con
   *permission denied* la primera vez que corren;
2. **datos de pago antes que expediente**: el expediente lee `payment_clabe_or_account`. Sobre
   producción da igual —las tres columnas ya están— pero sobre una base limpia el expediente no
   compila su consulta si el `ALTER` no corrió antes;
3. **las cuatro funciones del portero en el mismo archivo**: el ordinal del cierre es un solo
   número repartido en cuatro lugares, y separarlos deja el sistema roto entre dos migraciones.

**Lo que hay que cambiar en `agent_tool_gateway`** (paso 4), y es todo lo que falta del borde.
El punto de partida es el `handler.ts` del árbol de trabajo —28 rutas declaradas y 18 con función
de dominio—, **no** el desplegado, que tiene 27 y contesta 3.

- **renombrar tres, no crearlas de cero**: `/tools/capabilities` → `/tools/expediente`,
  `/tools/availability` → `/tools/horarios`, y `/media/payment-proof` → `/tools/payments/proof`.
  Las tres existen ya en `handler.ts`, y renombrarlas conserva su plomería;
- añadir **una** ruta nueva: `/tools/payments/carry-forward`;
- quitar **diecisiete**: las cuatro `/flow/*`, `/workflow/open-booking-flow`,
  `/tools/appointments/cancel-then-book`, `/workflow/fixed-response`, y las diez lecturas sueltas
  (`/tools/relationship/select`, `/tools/services`, `/tools/booking/eligibility`,
  `/tools/appointments/upcoming`, `/tools/appointments/next`, `/tools/location`,
  `/tools/payments/pending`, `/tools/payments/status`, `/tools/profile/share`,
  `/tools/resources/resume`);
- **`/media/payment-proof` se renombra, no se borra.** Ésta es la trampa de la lista:
  `attach_payment_proof` **se muda de superficie, no se retira**, y esa ruta es la única que la
  sirve. Borrarla deja al agente sin forma de pegar un comprobante: la paciente manda su foto, el
  modelo llama a `registrar_comprobante`, el borde contesta `404`, y el dinero que ella acaba de
  transferir se queda sin dueño y sin respuesta. Es exactamente la clase de silencio que el
  recorrido de aceptación #3 tiene que atrapar;
- ampliar el parser de `/tools/horarios` con los filtros: `['service_handle',
  'appointment_handle','modality','weekdays','dates','from_local_time','to_local_time']`;
- `parseSearchAvailabilityInput` y `parseCarryForwardInput` nuevos. El de la búsqueda es el único
  con arreglos: hay que acotarlos (7 días de la semana, 10 fechas) **en el borde también**, no sólo
  en la base. Y el de pasar el pago **no es `parseRescheduleInput` renombrado**: ése pide un
  `slot_handle` y aquí no hay hueco, sólo `['appointment_handle']`;
- **y el borde arma las frases.** La función de base de la búsqueda devuelve `empty_reason` en
  inglés más un `hint` con las cifras; el portal traduce al `motivo` en español y compone el
  `mensaje` (`02-herramientas.md` §3.3). Es donde se corrige un texto sin migrar.

La cuenta queda en **12 rutas declaradas** más `/health`: 28 − 17 + 1. De ésas, **10 son las 10
operaciones de `agent_node`** —las seis herramientas del catálogo— y las otras dos son
`/workflow/complete` y `/workflow/waiting`.

> **`/workflow/fixed-response` se va, y con ella la operación `send_fixed_response`.** Estaba
> declarada en el borde desde el principio, nunca tuvo manejador ni función de dominio, y hoy
> devuelve `403`. La operación es de la superficie `workflow_internal`, o sea de un nodo, y con
> tres nodos ninguno puede llamarla. Los ocho textos fijos viajan dentro del expediente, en
> `frases_fijas` (`02-herramientas.md` §1.7). El catálogo del portero queda en **11 operaciones**.

---

## 5. Qué hay que hacer en Kapso

> **Antes de tocar nada, `kapso pull`.** El JSON del repositorio ya mintió una vez: el nodo
> desplegado no era el declarado. Y `kapso push` es peligroso: dentro de `definition`, `nodes` y
> `edges` son **conjuntos de reemplazo** — mandar un nodo borra los demás.

### 5.1 Las herramientas: seis, y son las seis del catálogo

El gateway expone **10 operaciones de `agent_node`** (§4). Declarar diez Function Tools sería
caro sin necesidad: la precisión de selección de herramienta cae entre 10 y 15 herramientas, hay
sesgo posicional medido (las del medio se eligen menos), y OpenAI recomienda menos de 20 al inicio
de un turno. Pero una sola herramienta genérica tampoco: eso es el anti-patrón *God Tool*, y su
precisión colapsa porque **los modelos eligen herramienta leyendo descripciones, no esquemas**.

**Seis herramientas nombradas por intención**, que son exactamente las de
`02-herramientas.md` §1, con la descripción que ese documento le enseña al modelo:

| Herramienta | Operaciones del portero detrás |
|---|---|
| `abrir_expediente` | `open_dossier` |
| `buscar_horarios` | `search_availability` |
| `reservar` | `create_appointment`, `reschedule_appointment` |
| `gestionar_cita` | `confirm_appointment`, `cancel_appointment`, `switch_appointment_modality`, `carry_payment_forward` |
| `registrar_comprobante` | `attach_payment_proof` |
| `enviar_resena` | `submit_review` |

**Esquema plano y discriminado, nunca anidado más de un nivel.** Un campo `operacion` con enum
cerrado más un objeto `datos` de un solo nivel —escalares y arreglos de escalares, nunca otro
objeto ni un arreglo de objetos—. Los esquemas exactos están en `02-herramientas.md` §1; el portal
recibe del modelo `hora` o `parte_del_dia` y los traduce al par `from_local_time`/`to_local_time`
antes de llamar a la base.

**Las seis cuelgan de una sola función de Kapso.** Una función de Kapso es un Worker de
Cloudflare y el plan Free admite cinco. Al retirarse el formulario se liberan
`agenda-psi-flow-agendar` y `agenda-psi-flow-reprogramar`, así que quedan dos ocupadas
—`agenda-psi-complete-inbound` y `agenda-psi-mark-inbound-waiting`— y **tres libres**. Seis
herramientas no caben en tres Workers: multiplexar no es comodidad, es la única forma. La función
distingue de qué herramienta viene por el conjunto exacto de claves que le llegó, y los que
comparten `operacion` + `datos` los desempata el valor de `operacion`, porque los enums son
disjuntos. **Se comprueba antes de escribir código** (`02-herramientas.md` §10, punto 8); si no se
pudiera, la salida es subir de plan.

El modo de fallo del esquema anidado está documentado: el modelo manda JSON *stringificado*
malformado en `input`, Kapso lo rechaza antes de invocar, **la función nunca corre**, y el modelo
abandona la herramienta y se va a la nativa con el texto escapado dentro. Cuanto más anidado el
esquema, más probable. El parser de Kapso es Ruby y es sensible a la forma.

`kapso_execution_id` y `provider_message_id` **no los escribe el modelo**: los inyecta el workflow
desde el contexto de ejecución. Eso es lo que ata una llamada a un turno sellado.

### 5.2 El nodo

| Ajuste | Hoy | Propuesto | Razón |
|---|---|---|---|
| `max_iterations` | 16 | **30** | Doce llamadas de herramienta más sus mensajes no caben con holgura en 16. El default de la plataforma es 80 |
| `message_delivery_mode` | `tool_only` | igual | **No es estilístico.** Si el agente termina un turno con texto plano, el texto se suprime y la siguiente llamada al modelo puede fallar con *«This model does not support assistant message prefill»* |
| `prompt_cache_ttl` | `5m` | igual | `1h` se acepta en la API pero el runtime no lo pide al proveedor |
| `temperature: 0` | 0 | igual, pero **no explica nada** | Los parámetros de sampling se descartan mientras el pensamiento extendido está activo. Dejar de usarlo como explicación de determinismo |
| `handoff_to_human` | presente | se queda | Es requerida por defecto a nivel de workflow y no hay vía documentada para desactivarla. Se contiene por prompt |
| Buffering del webhook | apagado | **sigue apagado** | Un lote listo para enviar puede tratarse como basura de limpieza y desaparecer **sin dejar fila**. Confirmado por ingeniería de Kapso. El agrupamiento va al final de la fila |
| `message_debounce_seconds` | 1 | igual | Es el agrupamiento real de nuestra entrada, y ya está activo |

### 5.3 Lo que se retira

Las dos funciones privadas del formulario —`agenda-psi-flow-agendar` y
`agenda-psi-flow-reprogramar`— **se retiran**. Eso libera 2 de los 5 scripts de Cloudflare Worker
del plan Free, que era un techo real.

### 5.4 El prompt

Esqueleto, con etiquetas XML y en este orden: `<rol_y_alcance>` (prohibiciones duras, por primacía)
→ `<estado_de_la_gestion>` (lo que devolvió `abrir_expediente`) → `<que_puedes_hacer>` (sólo las
capacidades encendidas para **esta** paciente) → `<caminos_de_decision>` (tabla situación → acción)
→ `<respuestas_fijas>` → `<ejemplos>` (3-5 gestiones completas) → `<contenido_no_confiable>` →
`<recordatorio_final>` (repetición literal de las prohibiciones).

Cuatro reglas que salen de evidencia medida, no de gusto:

- **la adherencia se degrada de forma no lineal** y es estable hasta ~30-50 instrucciones;
- **el medio es donde peor cumple**: primacía y recencia funcionan;
- **«no menciones X» incrementa la accesibilidad de X.** Enrutamiento positivo («cuando pida
  cancelar una cita pagada, ofrécele mover o pasar el pago») sobre prohibición desnuda; y si una
  prohibición es innegociable, repetirla al final;
- **el texto de crisis vive en el prompt**, no en una herramienta. No cuesta ninguna llamada a
  propósito: ni un tope de tráfico ni un error del servidor pueden dejarla sin respuesta.

**El mensaje de cierre se redacta desde los campos que devolvió el servidor**, nunca desde lo que el
modelo cree que pasó. Es la mitigación medida contra el falso éxito, que es el **44-52 % de todos
los fallos** de los agentes de servicio, y la verificación de estado independiente lo reduce **~15×**
(3 % contra 45 %). Los jueces LLM no sirven para detectarlo.

---

## 6. El plan de pruebas

### 6.1 Lo primero: sembrar datos, porque hoy no hay nada que probar

| Cosa | En producción hoy |
|---|---|
| Series de recurrencia | **0** |
| Comprobantes de pago | **0** — la tabla está vacía, no tiene una fila |
| Cobros que esperan comprobante (pendiente + petición sellada, sin archivo) | **4**, y los cuatro son sesiones pasadas |
| Identificadores opacos emitidos | **0** |
| Mutaciones del agente | **0** |
| Conexiones de consultorio activas | **0** |
| Reseñas | **0** |

Todo verificado el 26-08-2026 contra `ssyzfeadyrczlzjbvxyl`.

Las ramas de recurrencia, de comprobante recibido, de traslado y de consultorio compartido se
escribirían **sin un solo dato que las ejercite**. Ése es el riesgo real de esta ronda y no se tapa
con más lectura. Y es peor de lo que decía la versión anterior de este documento, que contaba un
comprobante: **no hay ninguno**, así que ni el cerrojo de «no se cancela una cita con dinero
adentro» ni pasar el pago tienen hoy una sola fila real detrás.

**Juego mínimo, en una rama de Supabase, nunca en producción:** dos series (una semanal y una
quincenal, una de ellas con la próxima movida a otro día para ejercitar «tu próxima quedó»), una
cita suelta del mismo servicio que una de las series (para el destino de pasar el pago), un
comprobante recibido, un prepago con `proof_requested_at` sellado hace 25 horas, una cita con
`charge_timing = 'before'` de Araceli, y **los tres datos de transferencia de Araceli llenos**, sin
los cuales el mensaje de prepago sale por el camino de respaldo y no se prueba el que importa.

### 6.2 Qué demuestra y qué NO demuestra cada vía

| Vía | Demuestra | **NO** demuestra |
|---|---|---|
| **Pruebas SQL en rama** (`supabase/tests/*.sql`) | Los permisos exactos, la matriz económica columna por columna, los cerrojos del portero, la idempotencia por réplica exacta, y que los avisos llevan las claves del contrato | Nada del modelo, nada de Kapso, nada del envelope, nada del texto |
| **Modal de prueba del tablero** | Que el nodo corre y que el modelo elige herramienta | **Usa variables de entorno de *Development*, no de Production.** Si los secretos difieren, está hablando con otro backend. Y la documentación **no dice qué payload inyecta ni si sustituye el mensaje del usuario** — es exactamente el hueco que hizo pasar la prueba anterior sin demostrar nada. Sólo se cierra abriendo la ejecución y comparando `agent_tool_called.payload` contra lo esperado |
| **Disparo por API** | Envelope real, envío real de WhatsApp, agente real | Ni webhook, ni debounce, ni disparador de mensaje entrante. **Nunca dispararlo sin `phone_number_id` explícito:** sin él Kapso cae al primer config de WhatsApp del proyecto, y un mensaje real posterior puede reanudar esa ejecución equivocada |
| **Resume por API** | Que la ruta `waiting` reanuda y que el contrato `{"message":{"kind":"payload","data":…}}` es el correcto | Sólo esa ruta. Y **lo que entra por resume llega envuelto en `<external_input>`**, con el prompt de sistema de Kapso diciéndole al agente que viene de sistemas externos, **no de la paciente**. Si nuestro prompt asume que todo input es de ella, cambiará de tono en el turno que más importa |
| **`/functions/{id}/invoke`** | Que el handler no revienta | **Manda el cuerpo tal cual, sin el envelope del Agent Node.** Si el handler lee `body.input.x` y probamos con `{"x": …}` en la raíz, la prueba pasa y producción falla. Hay que reconstruir el envelope a mano |
| **Sandbox de WhatsApp** | **Todo**: webhook, debounce, disparador de entrante, agente, envelope, envío | Es la única vía que recorre la inyección de mensaje en un agente **ya corriendo**, que es un camino de código distinto del resume por API |

**Regla que sale de la tabla:** ninguna prueba sin WhatsApp real ejerce la ruta de inyección en
agente corriendo. El sandbox no es opcional.

### 6.3 Las seis pruebas que hay que escribir y que hoy no existen

1. **El presupuesto y el cierre.** Doce llamadas pasan, la trece devuelve `TOOL_BUDGET_EXCEEDED`,
   y el cierre **sí** entra en el ordinal 13. Es la prueba que atrapa el fallo de haber cambiado el
   9 en un solo lugar.
2. **Las seis operaciones retiradas más `attach_payment_proof` por `media_adapter`** devuelven
   `TOOL_NOT_ALLOWED`, y ninguna deja fila en `agent_tool_calls`. El séptimo aserto es el que
   importa de verdad: **la misma operación por `agent_node` sí se autoriza**, porque se mudó de
   superficie y no se retiró.
3. **La matriz de cancelar y reprogramar, las veinte celdas.** Cinco estados de pago × cuatro
   combinaciones de operación y aviso. Es la única prueba que verifica que el dinero no se evapora
   en ninguna esquina.
4. **La búsqueda vacía, los seis motivos.** Un juego de datos por motivo, y el aserto es sobre
   `empty_reason` y sobre las claves del `hint`, no sobre el texto.
5. **El reloj del prepago, y arranca al agendar.** Dos mitades, y la primera es la que faltaba:
   agendar con una profesional que cobra por adelantado deja el cobro **con la petición sellada en
   ese instante, método `transfer`, y la cita sin confirmar aunque la sesión sea mañana**. La
   segunda: una cita `origin = 'patient'` sin comprobante a las 25 horas se cancela; una
   `origin = 'professional'` en la misma situación **no**; una que ya empezó **tampoco**.

6. **La ruta del comprobante existe.** Que `attach_payment_proof` tenga una ruta que contesta
   después de mudarse de superficie. Es una prueba de borde, no de base, y existe porque el plan
   anterior mandaba borrar la única que la servía.

---

## 7. El recorrido de aceptación

Ocho conversaciones en el sandbox de WhatsApp, con el juego de datos sembrado. Cada una se aprueba
mirando **tres cosas a la vez**: el texto que recibió la paciente, los eventos `agent_tool_called`
de la ejecución, y el estado en la base.

| # | Conversación | Qué tiene que pasar |
|---|---|---|
| 1 | «Quiero agendar» → servicio → filtros → escoge | **Tres llamadas**, no más. La cita nace, la profesional recibe un aviso **con nombre y hora**, y el agente no ofreció una lista de días |
| 2 | Lo mismo con Araceli (cobra por adelantado) | La cita nace **sin confirmar** —aunque sea para mañana— y su cobro nace **con la petición sellada en ese instante**, que es lo que hace verdad la frase. El mensaje trae banco, titular y CLABE. **Ojo: las cinco fichas los tienen vacíos, así que hay que llenar los de Araceli antes de correr esta conversación** o lo que se prueba es el texto de respaldo, no éste |
| 3 | Manda una foto | Se le pregunta **antes** de pegarla, aunque haya un solo cobro esperando. El cierre dice «recibí tu comprobante», **nunca** «pagado» |
| 4 | «Cancela mi cita» sobre una con comprobante | **No se cancela.** Se le ofrecen las dos salidas, y si insiste el agente no cede: le dice que le escriba a su profesional |
| 5 | «Muévela» a menos de 24 h | Se le advierte **antes de mover**, con el plazo de **su** profesional (Miranda: 12 h, no 24), y el cierre dice que la sesión nueva se cobra aparte |
| 6 | «Cámbiala a en línea» con `test`, que no permite → presencial | Se le dice que no y **cuál** se queda. No se ofrece lo que esa profesional no permite |
| 7 | «El sábado a las 9» con quien no trabaja sábados | Sale `OUT_OF_WEEKDAYS` y el mensaje dice qué días **sí**, con alternativas |
| 8 | Cinco mensajes seguidos | Llegan agrupados por el debounce y el agente lee la intención completa, sin contestar cinco veces |

**Criterio de fracaso, no de éxito:** si en cualquiera de las ocho el agente dice una fecha que no
salió de una etiqueta del servidor, o dice «24 horas» a una paciente de Miranda, o dice «pagado»,
el recorrido no pasa aunque la base haya quedado bien.

---

## 8. Los límites conocidos de esta ronda

Se escriben aquí para que nadie los descubra en producción.

1. **La decisión de cobro tardío es difícil de encontrar en la app de la profesional.** No aparece
   en Cobros, no pone punto en el calendario, la tarjeta cerrada es una línea muda y el aviso se
   borra solo a las 24 h: la única forma de llegar es tocando la tarjeta del día. Hoy es inofensivo
   porque nadie produce esas decisiones. **El agente va a empezar a producirlas, y va a producirlas
   todas.** Primer punto de la ronda siguiente.
2. **La paciente nunca sabe qué decidió la profesional.** De las tres funciones que resuelven, sólo
   «pedir comprobante» le manda algo. Cobrar en efectivo la deja callada y sin saber cuánto;
   condonar la deja creyendo que debe. Arreglarlo cuesta una plantilla nueva en Meta y migrar
   `private.wa_payload_ok`.
3. **Condonar un prepago escribe `forgiven`, no `carried_forward`.** El dinero entró de verdad y el
   registro dice que no se cobró. El valor está fijo en el código de `waive_appointment_payment`,
   sin parámetro, y la app es intocable. Es decisión de producto, no arreglo.
4. **Los materiales no se pueden entregar todavía** (§1.6). Capacidad apagada en el prompt.
5. **El marketplace no entra.** Capacidad apagada.
6. **Las cinco fichas tienen los datos de transferencia vacíos.** Mientras sigan así, todo prepago
   cierra con el texto de respaldo («pídele a tu profesional los datos») y la paciente tiene que
   pedirlos por fuera. No es un defecto del código: es la pantalla de captura, que esta ronda deja
   pendiente. Y es el límite que más se nota, porque toca la conversación de agendar entera.
7. **Los ocho textos fijos dependen de que el expediente los componga.** Con
   `send_fixed_response` retirada (§4), la única fuente de `no_te_reconocemos`,
   `paciente_inactivo`, `elige_profesional`, `sin_horarios`, `fuera_de_alcance`,
   `asunto_de_dinero`, `no_entendi` y `se_acabo_el_espacio` es el bloque `frases_fijas` del
   expediente. **Hoy el expediente escrito no lo trae**, así que hasta que lo traiga, esos ocho
   casos terminan en una respuesta improvisada por el modelo o en silencio. Es la exigencia 2 de
   `05-prompt.md` §9.
8. **La reseña queda invisible hasta que una persona la publique a mano:** ninguna función
   desplegada escribe `moderation_status`.
9. **`is_patient_scheduling_enabled` es un pestillo de una sola dirección.** Ninguna función
   desplegada lo apaga: al guardar su primer horario válido, sus pacientes pueden agendarle solas
   para siempre.
10. **La rama de modalidad cruzada** («presencial no tengo mañanas, en línea sí») sigue sin decidir.
11. **Riesgo de plataforma sin defensa por reintento:** una Function Tool puede completarse con éxito
   sin que se persista su `agent_tool_response`; el job global de Kapso reintenta, el proveedor
   rechaza un transcript con `tool_use` sin `tool_result`, y la ejecución pasa a `failed`, que es
   **terminal e irrecuperable**. No hay defensa por reintento: sólo detección (buscar
   `agent_tool_called` sin `agent_tool_response`) y el diseño que ya tenemos, en el que una
   ejecución muerta no deja dinero a medio mover, porque cada mutación es una transacción.

---

## 9. Cómo se apaga si algo sale mal

Tres palancas, de la más barata a la más cara. **La primera resuelve el 90 % de los casos.**

### 9.1 Apagar el número (segundos, sin desplegar nada)

```sql
select public.agent_set_runtime_target('<phone_number_id>', false);
```

La admisión deja de aceptar mensajes para ese número. No borra nada, no revierte nada, y los turnos
vivos los cierra el barrendero en su siguiente pasada (cada 5 minutos). Para volver:

```sql
select public.agent_set_runtime_target('<phone_number_id>', true);
select * from public.agent_list_runtime_targets();   -- para ver el estado
```

**Cuándo usarla:** cualquier duda. Es reversible y no cuesta nada.

### 9.2 Desactivar el workflow en Kapso (minutos)

Sirve cuando el problema es el modelo, no la base: elige mal la herramienta, inventa fechas, o se
queda en bucle. Deja de correr el agente pero **los mensajes siguen llegando al webhook**, así que
hay que apagar también el número si no se quiere acumular admisión inútil.

### 9.3 Revertir la base (última opción, y no es simétrica)

**Ninguna de las trece migraciones es reversible tal como está escrita**, y decirlo así es más
honesto que prometer un `down` que nadie ha probado. Lo que sí se puede revertir en caliente, y es
lo único que hace falta, son **las cuatro funciones del portero**:

```
private.agent_claim_tool_call
private.agent_finalize_tool_call
public.agent_complete_inbound
public.agent_complete_inbound_from_workflow
```

**Antes de aplicar, guardar sus cuerpos actuales:**

```sql
select p.proname, pg_get_functiondef(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname = 'private' and p.proname in ('agent_claim_tool_call','agent_finalize_tool_call'))
    or (n.nspname = 'public'  and p.proname in ('agent_complete_inbound','agent_complete_inbound_from_workflow'));
```

Volver a aplicar esos cuatro cuerpos deja el sistema exactamente como estaba: las funciones de
dominio nuevas quedan desplegadas pero **inalcanzables**, porque el catálogo viejo no las nombra.
Es la reversión buena: no borra nada y no deja a medias ninguna transacción.

Lo que **no** hace falta revertir, y no conviene tocar:

- los `GRANT`: son de lectura salvo un `DELETE`, y no hacen nada por sí solos;
- las columnas nuevas de `professionals`: son nulables y aditivas;
- el `cron.job` del prepago: se apaga con `select cron.unschedule('cron_prepay_autocancel');`, que
  es una línea y no toca datos.

### 9.4 Qué mirar para decidir

| Síntoma | Dónde se ve | Palanca |
|---|---|---|
| Ninguna gestión cierra | `agent_turns` con `status = 'completing'` y `terminal_at IS NULL` | 9.3 — es el ordinal del cierre |
| Toda lista sale vacía o revienta | `AGENT_WORKFLOW_*_TOKEN_KEY_MISSING` en los logs | Sembrar la llave (§3). No es reversión, es el dato que falta |
| El modelo dice que lo hizo y no hay fila | Buscar el nombre en `agent_tool_called.payload.tool_name`. **Si no hay evento, fue decisión del modelo, no un log perdido** | 9.2 y revisar el prompt |
| Ejecuciones que mueren tras muchos turnos | `workflow.execution.failed` | Sospechoso número uno: el *lifetime step budget* de Kapso, que es distinto y superior a `max_iterations` y cuya cifra no está documentada |
| El agente parece escribir y no sale mensaje | Créditos de IA agotados — son un libro contable **distinto** del de los mensajes del plan | Recargar. No es un bug |
