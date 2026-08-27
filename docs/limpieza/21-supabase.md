# Qué existe en Supabase para el agente — inventario y clasificación

Corte: 2026-08-26. Base `ssyzfeadyrczlzjbvxyl`. **Documento de sólo lectura: es una lista de
candidatos a borrado con su evidencia. No se ejecutó ningún DROP, DELETE, UPDATE ni INSERT.**

Todo lo de aquí se verificó contra la base desplegada y contra el código del repositorio. Cuando
algo no se pudo comprobar, se dice y se manda a «se queda».

---

## 0. LAS DOS PRUEBAS QUE SOSTIENEN TODO EL DOCUMENTO

Antes de la lista, las dos comprobaciones de las que cuelga cada renglón de «se borra».

### Prueba 1 — la app no puede tocar ninguna tabla del agente, por dos candados independientes

Las siete tablas del agente tienen RLS encendida y **cero políticas**. Verificado dos veces:

```sql
select c.relnamespace::regnamespace::text||'.'||c.relname as tabla, count(p.oid) as n_policies
from pg_class c left join pg_policy p on p.polrelid=c.oid
where c.relname in ('agent_sessions','agent_turns','agent_tool_calls','agent_option_tokens',
                    'whatsapp_inbound_messages','agent_runtime_targets','agent_token_key_registry')
group by 1;
```

Las siete devuelven `n_policies = 0`. El propio linter de Supabase lo confirma: siete avisos
`rls_enabled_no_policy`, uno por tabla (`get_advisors type=security`, 97 avisos totales).

Y encima **no hay GRANT**: en el ACL de las siete no aparece `authenticated`, ni `anon`, ni
`service_role`. Ejemplo textual de `pg_class.relacl`:

| Tabla | ACL completo |
|---|---|
| `public.agent_sessions` | `postgres=arwdDxtm/postgres \| agenda_psi_agent_owner=arw/postgres` |
| `public.agent_turns` | `agenda_psi_agent_owner=arwdDxtm/agenda_psi_agent_owner` |
| `public.agent_tool_calls` | `agenda_psi_agent_owner=arwdDxtm/agenda_psi_agent_owner` |
| `public.agent_option_tokens` | `agenda_psi_agent_owner=arwdDxtm/agenda_psi_agent_owner` |
| `public.whatsapp_inbound_messages` | `postgres=arwdDxtm/postgres \| agenda_psi_agent_owner=arw/postgres` |
| `private.agent_runtime_targets` | `agenda_psi_agent_owner=arwdDxtm/agenda_psi_agent_owner` |
| `private.agent_token_key_registry` | `agenda_psi_agent_owner=arwdDxtm/agenda_psi_agent_owner` |

El Flutter entra como `authenticated`. No está en ninguna de esas listas. **No es que la app no
las use: es que no puede.**

### Prueba 2 — la app no nombra nada del agente, y no podría llamarlo aunque lo nombrara

En los 137 archivos Dart de `flutter_application_1/lib/`:

```
grep -rn "agent_\|agent_sessions\|agent_turns\|agent_tool_calls\|agent_option_tokens\|
          whatsapp_inbound_messages\|agent_runtime_targets\|agent_token_key_registry\|
          agenda_psi_agent_owner\|kapso" lib/ test/   →   0 resultados
```

De 525 literales de texto en minúsculas distintos que hay en `lib/`, **cero empiezan con
`agent_`**. Y el privilegio lo confirma: las 13 funciones del agente están otorgadas a
`service_role` y al rol del agente, **nunca a `authenticated`**. Ninguna aparece en los 79 avisos
`authenticated_security_definer_function_executable` del linter, justamente porque `authenticated`
no puede ejecutarlas.

Dato adicional: la app **no usa `.from()` ni una sola vez**. Trabaja por RPC y por una sola función
de borde. Su superficie contra la base es un conjunto cerrado de nombres de RPC, y ninguno es del
agente.

---

## 1. SE BORRA

Sólo del agente, nadie más lo usa, y está demostrado. **16 renglones.**

> **Revisión adversarial del 2026-08-26.** Siete renglones que estaban en esta lista se movieron a
> §2.7. No porque el Flutter los nombre —se volvió a barrer `lib/` y `test/` completos y sigue sin
> nombrarlos—, sino porque son **las piezas sin las cuales el reloj de 24 h de §3.1 deja de
> sellarse**: la función que lo escribe, las tres tablas que esa función necesita para llegar a la
> línea que lo escribe, la función de borde que es su único invocador, y el rol dueño de la función
> con el permiso de columna con el que escribe. §3.1 fenceaba un solo renglón; la dependencia real
> es todo ese bloque.

### 1.1 Funciones — 12

Las ocho de `public` están otorgadas a `service_role` (las llaman las funciones de borde); las
cuatro de `private` sólo al rol del agente (las llaman las de `public`). Ninguna a `authenticated`.
Firma y ACL salen de `pg_proc`. Las trece son `SECURITY DEFINER` y las trece son propiedad de
`agenda_psi_agent_owner` (`pg_proc.prosecdef`, `pg_proc.proowner`).

| # | Función | Firma | Quién la llama | ¿El Flutter la nombra? |
|---|---|---|---|---|
| 1 | `public.agent_bind_inbound_execution` | `(p_provider_message_id text, p_turn_id uuid, p_kapso_execution_id text)` | `kapso_inbound_webhook` — `rpc('agent_bind_inbound_execution')`. Ninguna función SQL la menciona. | No |
| 2 | `public.agent_mark_inbound_waiting` | `(p_provider_message_id text, p_kapso_execution_id text)` | `agent_tool_gateway` — `rpc('agent_mark_inbound_waiting')`. Ninguna función SQL la menciona. | No |
| 3 | `public.agent_mark_inbound_completing` | `(p_provider_message_id text, p_kapso_execution_id text)` | Sólo `public.agent_complete_inbound_from_workflow` | No |
| 4 | `public.agent_complete_inbound` | `(p_provider_message_id text, p_kapso_execution_id text, p_response_message_id text)` | Sólo `public.agent_complete_inbound_from_workflow` | No |
| 5 | `public.agent_complete_inbound_from_workflow` | `(p_provider_message_id text, p_kapso_execution_id text, p_response_message_id text)` | `agent_tool_gateway`, ruta `/workflow/complete`. Ninguna función SQL la menciona. | No |
| 6 | `public.agent_get_capabilities` | `(p_session_id uuid)` | Sólo `public.agent_get_capabilities_from_workflow` | No |
| 7 | `public.agent_get_capabilities_from_workflow` | `(p_provider_message_id text, p_kapso_execution_id text)` | `agent_tool_gateway`, ruta `/tools/capabilities`. Ninguna función SQL la menciona. | No |
| 8 | `public.agent_get_inbound_resume_execution` | `(p_provider_message_id text, p_turn_id uuid)` | **Nadie.** Ni función SQL, ni cron, ni trigger, ni código de borde desplegado. Es huérfana. | No |
| 9 | `private.agent_claim_tool_call` | `(p_turn_id uuid, p_execution_id text, p_surface text, p_operation text, p_tool_call_key text, p_input_sha256 text, p_is_mutation boolean)` | `agent_complete_inbound_from_workflow` y `agent_get_capabilities_from_workflow` | No |
| 10 | `private.agent_finalize_tool_call` | `(p_turn_id uuid, p_tool_call_key text, p_outcome text, p_redacted_result jsonb)` | Las mismas dos | No |
| 11 | `private.agent_issue_option_handle` | `(p_session_id uuid, p_turn_id uuid, p_kind text, p_entity_type text, p_entity_id uuid, p_stable_key text, p_key_id text, p_expires_at timestamptz, p_one_time boolean)` | **Nadie.** Huérfana; concuerda con las 0 filas de `agent_option_tokens`. | No |
| 12 | `private.agent_resolve_option_token` | `(p_session_id uuid, p_turn_id uuid, p_random_handle uuid, p_expected_kind text, p_consume boolean)` | **Nadie.** Huérfana. | No |

El renglón **13** (`public.agent_register_inbound_context`) estaba aquí y **se movió a §2.7**.

La consulta que produjo la columna «quién la llama» busca cada nombre dentro del `prosrc` de todas
las funciones de `public` y `private`:

```sql
select o.nombre, coalesce(string_agg(distinct p.pronamespace::regnamespace::text||'.'||p.proname,', '),'(NADIE)')
from obj o left join pg_proc p
  on p.pronamespace::regnamespace::text in ('public','private')
 and p.prosrc like '%'||o.nombre||'%' and p.proname <> o.nombre
group by o.nombre;
```

Y el cruce contra cron y triggers es negativo: los 7 cron (`cron.job`) sólo invocan
`cron_sweep_past_pending`, `cron_appointment_confirmation_26h`, `cron_appointment_reminder_1h`,
`purge_command_log`, `purge_whatsapp_outbox`, `purge_whatsapp_inbound` y
`disparar_sender_whatsapp`; y **ninguna de las 7 tablas del agente tiene un solo trigger**
(`pg_trigger`: 0 en las siete).

### 1.2 Tablas — 3

Con cada una se van sus índices y sus restricciones CHECK, que son objetos dependientes y caen
solos con el `DROP TABLE`. Las tres son hijas: ninguna otra tabla las referencia.

| # | Tabla | Filas | Quién escribe | Quién lee | ¿La toca el Flutter? |
|---|---|---|---|---|---|
| 16 | `public.agent_tool_calls` | 6 | `agent_claim_tool_call`, `agent_finalize_tool_call` | `agent_complete_inbound`, `agent_mark_inbound_waiting/_completing` | No |
| 17 | `public.agent_option_tokens` | **0** | `agent_issue_option_handle` (huérfana) | `agent_resolve_option_token` (huérfana) | No |
| 19 | `private.agent_token_key_registry` | **0** | Nadie | `agent_issue_option_handle`, `agent_resolve_option_token` (ambas huérfanas) | No |

Las tres las creó la migración `20260823235236_agent_whatsapp_foundation` y son propiedad del rol
`agenda_psi_agent_owner`. Las únicas funciones que las mencionan son las cuatro de `private` y tres
de `public`, **todas en la lista de borrado de §1.1**, así que al tirarlas no queda ninguna función
apuntando a una tabla inexistente.

Los renglones **14** (`public.agent_sessions`), **15** (`public.agent_turns`) y **18**
(`private.agent_runtime_targets`) estaban aquí y **se movieron a §2.7**.

### 1.3 Funciones de borde — 1

| # | Función de borde | Evidencia de que es sólo del agente |
|---|---|---|
| 21 | `agent_tool_gateway` (v35, `verify_jwt=false`) | Su único RPC directo es `agent_mark_inbound_waiting`; las otras dos rutas vivas llaman `agent_complete_inbound_from_workflow` y `agent_get_capabilities_from_workflow`. Ninguna función SQL la invoca, el Flutter no la nombra, y **no participa en el sellado del reloj de §3.1**: el reloj lo escribe `agent_register_inbound_context`, que entra por `kapso_inbound_webhook`, no por aquí. |

El renglón **20** (`kapso_inbound_webhook`) estaba aquí y **se movió a §2.7**.

Sobre el tamaño del gateway: en el código commiteado (`git show HEAD:supabase/functions/agent_tool_gateway/handler.ts`)
hay **24 rutas** —`/health`, 11 bajo `/tools/`, 6 bajo `/tools/appointments/`, 4 bajo `/flow/`, 2
bajo `/workflow/`— y sólo cuatro contestan algo: `/health`, `/tools/capabilities`,
`/workflow/waiting` y `/workflow/complete`. Las otras 20 caen en el
`return safe(403, { ok: false, error: 'OPERATION_NOT_ENABLED' })` de la última línea del despacho.
(El documento de hallazgos contó 27 contra lo desplegado; el árbol de trabajo tiene `handler.ts`
modificado sin desplegar, así que las dos cifras pueden ser ciertas de versiones distintas. La
diferencia no cambia nada: la función entera se va.)

### 1.4 Rol y permisos — CERO por ahora

Los renglones **22** (rol `agenda_psi_agent_owner`) y **23** (sus permisos) estaban aquí y
**se movieron a §2.7**: el rol es dueño de `agent_register_inbound_context` y esa función es
`SECURITY DEFINER`, así que mientras §3.1 no se resuelva ni el rol se puede tirar ni sus permisos
se pueden revocar.

Nota de seguridad, no de limpieza, que **sigue en pie y no cambia con este movimiento**:
**`BYPASSRLS` en el rol del agente significa que cualquier función `SECURITY DEFINER` suya se salta
todas las políticas de todas las tablas de la base**, no sólo las suyas. Es el privilegio más ancho
que hay en el proyecto. Borrar el rol cierra eso — pero borrarlo hoy apaga el reloj de §3.1. Si se
decide conservarlo, lo que **sí** se puede revocar de inmediato sin tocar el reloj es el `SELECT`
sobre `appointments`, `payments`, `professional_profiles`, `professionals` y `services`: ninguna de
esas cinco la lee `agent_register_inbound_context`. Las que **no** se pueden tocar son `patients`,
`whatsapp_links` (con su `UPDATE (last_inbound_at)`), `agent_sessions` y
`whatsapp_inbound_messages`.

### 1.5 Tipos y enums — CERO

**No se creó ningún tipo ni enum para el agente.** Los 33 enums de `public` son todos del dominio y
todos propiedad de `postgres` (`appointment_status`, `payment_status`, `charge_reason`,
`late_change_decision`, `modality`, `outbox_send_mode`…). El agente resolvió sus estados con
`text` + restricciones `CHECK` dentro de sus propias tablas, así que **no hay nada que borrar aquí y
no hay ningún tipo compartido que pueda romperse**. Consulta:

```sql
select t.typname, t.typtype, pg_get_userbyid(t.typowner)
from pg_type t where t.typnamespace::regnamespace::text in ('public','private')
  and t.typtype in ('e','c','d');
```

### 1.6 Cron y triggers del agente — CERO

**Ningún cron atiende al agente y ningún trigger vive en una tabla del agente.** Los siete cron y
los nueve triggers son del dominio; se detallan en §2.2 y §2.3. El único cron que roza al agente es
`purge_whatsapp_inbound`, y sólo porque purga una tabla que el agente adoptó — va a §3.2.

---

## 2. SE QUEDA

Lo usa la app, o el dominio, o no se pudo descartar.

### 2.1 Las cuatro funciones de borde que NO son del agente

Éstas son las que se borrarían por error. Cada una con la prueba de quién la llama.

Reverificado el 2026-08-26 contra el inventario desplegado: **hay seis funciones de borde en total**
—`get-payment-proof-url` (v40, `verify_jwt=true`), `notificar-push` (v43), `enviar-whatsapp` (v40),
`kapso_status_callback` (v32), `kapso_inbound_webhook` (v32) y `agent_tool_gateway` (v35)—, las seis
`ACTIVE`. **Ninguna de las cuatro de esta tabla aparece en la lista de borrado**, y se comprobó
además que sus fuentes no mencionan `agent_`, `whatsapp_inbound_messages`, `last_inbound_at` ni el
rol del agente: `enviar-whatsapp` sólo hace `rpc('claim_outbox_batch')` y `rpc('finalize_outbox')`,
y `kapso_status_callback` sólo `rpc('record_outbox_provider_status')`. De las dos restantes,
`agent_tool_gateway` se borra (§1.3) y `kapso_inbound_webhook` **también se queda**, por §2.7.

| Función de borde | Quién la llama | Evidencia literal |
|---|---|---|
| **`get-payment-proof-url`** (v40, `verify_jwt=true`) | **La app de Flutter, directo.** | `flutter_application_1/lib/pages/billing/billing_data.dart:90` → `'get-payment-proof-url'`, dentro de `getPaymentProofUrl()`, que llama a `supabase.functions.invoke(functionName, body: body)` en la línea 100. **Es la única función de borde que el Flutter invoca en todo el proyecto.** Borrarla apaga el visor de comprobantes de Cobros. |
| **`notificar-push`** (v43) | El trigger `notificar_push` sobre `public.notifications`. | `CREATE TRIGGER notificar_push AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION notificar_push_al_insertar()`, y el cuerpo de `notificar_push_al_insertar()` hace `net.http_post(url := '…/functions/v1/notificar-push', body := jsonb_build_object('record', to_jsonb(new)))`. Borrarla deja sin push las 12 filas de avisos que ya existen y todas las futuras. |
| **`enviar-whatsapp`** (v40) | El cron `sender_whatsapp`, cada minuto. | `cron.job` jobid 8: `select public.disparar_sender_whatsapp();`, y esa función hace `net.http_post(url := '…/functions/v1/enviar-whatsapp')` con el secreto `sender_secret` de la bóveda. Su código sólo llama `claim_outbox_batch` y `finalize_outbox` y lee `whatsapp_outbox`: **cero referencias al agente.** Es el que manda las 16 plantillas del dominio. |
| **`kapso_status_callback`** (v32) | Kapso, cuando WhatsApp reporta un mensaje. | Su código llama `db.rpc("record_outbox_provider_status", …)` con los eventos `whatsapp.message.sent/delivered/read/failed`. **Anota el estado de entrega de la cola del dominio**, no del agente. Que se llame «kapso» no la hace del agente: el dominio manda sus plantillas por Kapso desde antes. Borrarla deja la cola sin saber si un mensaje llegó. |

### 2.2 Los siete cron

Ninguno atiende al agente. `cron.job` completo:

| jobid | Nombre | Comando | De quién es |
|---|---|---|---|
| 1 | `cron_sweep_past_pending` | `select public.cron_sweep_past_pending(500);` | Dominio |
| 2 | `cron_confirmation_26h` | `select public.cron_appointment_confirmation_26h();` | Dominio (el margen de 26 h) |
| 4 | `cron_appointment_reminder_1h` | `select public.cron_appointment_reminder_1h();` | Dominio |
| 5 | `purge_command_log` | `select public.purge_command_log();` | Dominio |
| 6 | `purge_whatsapp_outbox` | `select public.purge_whatsapp_outbox();` | Dominio |
| 7 | `purge_whatsapp_inbound` | `select public.purge_whatsapp_inbound();` | **Ver §3.2** |
| 8 | `sender_whatsapp` | `select public.disparar_sender_whatsapp();` | Dominio |

### 2.3 Los nueve triggers

Todos del dominio, ninguno sobre una tabla del agente (`pg_trigger` sin los internos):
`appointments_apagar_avisos_ad` y `_au`, `jobs_solo_recursos_bi`, `notificar_push`,
`patients_whatsapp_link_ai`, `patients_whatsapp_link_phone_au`,
`payment_proofs_degradar_prepago_ai`, `payments_apagar_cobro_au`, `outbox_variables_bi`.

### 2.4 El esquema `private` y sus 23 funciones de dominio

`private` **no es del agente**: tiene 27 funciones, de las cuales sólo 4 son suyas. Las otras 23
sostienen la app y el dominio: `wa_payload_ok` (la que valida las variables de las 16 plantillas),
`wa_fecha`, `wa_hora`, `wa_modalidad`, `wa_apagar_avisos_de_cita`, `wa_apagar_cobro`,
`wa_apagar_todo_de_cita`, `assert_appointment_slot_available`, `marketplace_public_base`,
`hash_command_request`, `consume_rate_limit`, `__credit_payment_internal`,
`__waive_payment_internal`, `__request_proof_internal`, y las de perfil y almacenamiento.
**Se borran cuatro funciones de dentro; el esquema se queda.**

### 2.5 Las siete tablas de dominio sobre las que el agente tiene SELECT

`appointments`, `patients`, `payments`, `professional_profiles`, `professionals`, `services`,
`whatsapp_links`. Son de la app. Lo que se retira es **el otorgamiento al rol del agente**, no la
tabla — y sólo el de cinco de ellas: `patients` y `whatsapp_links` las lee la función del reloj
(§2.7, §3.3).

### 2.6 Los 33 enums, las 34 tablas de dominio y el resto del esquema

Nada de eso se creó para el agente (§1.5).

### 2.7 Los siete renglones que se movieron de «SE BORRA» — el bloque del reloj de 24 h

Ninguno de los siete lo nombra el Flutter. Se quedan por otra razón: **son las siete piezas que
tienen que existir para que `whatsapp_links.last_inbound_at` se siga sellando**, y ese sello lo lee
una RPC de la app. Basta borrar **una** de las siete para que el reloj se congele. §3.1 sólo
fenceaba la primera; la dependencia es todo el bloque, y por eso la decisión de §3.1 los gobierna a
los siete juntos, no de a uno.

La cadena, leída del cuerpo desplegado de `agent_register_inbound_context` en el orden en que se
ejecuta:

| # | Objeto | Por qué el reloj no sobrevive sin él |
|---|---|---|
| 13 | `public.agent_register_inbound_context` | Es **el único escritor** de `whatsapp_links.last_inbound_at` en toda la base. El propio documento ya lo decía en §3.1 y aun así el renglón estaba en la lista de borrado. |
| 20 | `kapso_inbound_webhook` (v32, `verify_jwt=false`) | Es **el único invocador** de la 13 (`rpc('agent_register_inbound_context')` en su `index.ts`). Apagarla deja a la 13 viva y jamás llamada: el reloj se congela igual que si la hubieran borrado. |
| 18 | `private.agent_runtime_targets` | Es **el primer portón** del cuerpo de la 13: `IF NOT EXISTS (SELECT 1 FROM private.agent_runtime_targets WHERE phone_number_id = … AND enabled) THEN … EXIT decide_admission`. La salida ocurre **antes** de la línea que escribe el reloj. Borrar la tabla —o su única fila— apaga el sello sin borrar nada más. |
| 14 | `public.agent_sessions` | La 13 la declara como `%ROWTYPE` y hace `SELECT … FOR UPDATE` sobre ella **antes** del `UPDATE` del reloj. Sin la tabla la función revienta al primer uso. |
| 15 | `public.agent_turns` | Idéntico: `%ROWTYPE` y `SELECT … FOR UPDATE` antes del `UPDATE` del reloj. |
| 22 | Rol `agenda_psi_agent_owner` | Las trece funciones del agente son `SECURITY DEFINER` y **las trece son propiedad de este rol** (`pg_proc.proowner`), la 13 incluida. `DROP ROLE` es imposible mientras posea objetos, y quitarle la propiedad de la 13 le quita los privilegios con los que escribe. (Corrección de dato: §1.4 decía «dueño de 5 tablas y 4 funciones de `private`»; son 5 tablas y **las 13 funciones**, 9 de ellas en `public`.) |
| 23 | Sus permisos | El `UPDATE (last_inbound_at)` sobre `whatsapp_links` **es literalmente el permiso con el que se escribe el reloj**, y el `SELECT` sobre `whatsapp_links` y `patients` es con el que la 13 resuelve a qué vínculo escribirle. Revocarlos apaga el sello sin borrar ningún objeto. |

Y con ellos queda amarrada la tabla de §3.2: `public.whatsapp_inbound_messages` es la primera
sentencia del cuerpo de la 13 (`INSERT … ON CONFLICT DO NOTHING` como libro de idempotencia) y la
última (`UPDATE … SET admission_status …`). **La opción 1 de §3.2 —borrar los tres objetos— también
apaga el reloj**, aunque §3.2 no lo diga.

Lo que **no** entra en el bloque, y por eso sigue en «SE BORRA»: la función de borde
`agent_tool_gateway` (renglón 21), las doce funciones de §1.1 —la 13 no llama a ninguna— y las tres
tablas de §1.2, que la 13 no menciona.

---

## 3. SE REVISA CON EL DUEÑO

Tres decisiones. En las tres, la respuesta depende del producto, no de la base.

### 3.1 `agent_register_inbound_context` es el único que escribe el reloj de las 24 horas

**Éste es el hallazgo más riesgoso del inventario.**

En toda la base, **una sola función escribe `whatsapp_links.last_inbound_at`, y es del agente**:

```sql
select p.proname from pg_proc p
where p.pronamespace::regnamespace::text in ('public','private')
  and p.prosrc like '%last_inbound_at%';
```

Devuelve exactamente dos filas:

- **`public.agent_register_inbound_context`** — escribe:
  `SET last_inbound_at = CASE WHEN wl.last_inbound_at IS NULL OR wl.last_inbound_at < v_now THEN v_now ELSE wl.last_inbound_at`
- **`public.assign_resources_to_appointment`** — lee, y es **de la app** (`acl: postgres=X/postgres | authenticated=X/postgres`):
  `AND wl.last_inbound_at IS NOT NULL AND wl.last_inbound_at >= now() - interval '24 hours'`

Es decir: **una función de la app decide por dónde va la entrega de materiales leyendo un dato que
sólo el agente escribe.** Los números lo confirman: de 18 vínculos de WhatsApp, sólo 2 tienen
`last_inbound_at`, y el más reciente es `2026-08-24 21:09:12`, que es exactamente la última
actividad del agente.

**Verificado a fondo el 2026-08-26. El hallazgo se confirma y crece.** Tres cosas nuevas:

**a) No hay ningún otro escritor, por ninguna vía.** Se volvió a buscar `last_inbound_at` en el
`prosrc` de **todos** los esquemas de la base (no sólo `public` y `private`): siguen siendo esas dos
funciones y nada más. Ningún trigger lo escribe —los quince triggers no internos se revisaron uno
por uno y **ninguno** menciona la columna, ni siquiera `patients_whatsapp_link_ai` ni
`patients_whatsapp_link_phone_au`, que son los que crean y mantienen la fila de `whatsapp_links`—.
Ningún cron, ninguna vista, ningún `DEFAULT` ni columna generada. La columna nace `NULL` y sólo la
mueve el agente.

**b) La app ya consume la decisión, hoy, no «el día que se construya el motor de trabajos».**
El Flutter llama la RPC y **parsea la respuesta**:

- `flutter_application_1/lib/pages/resources/resource_data.dart:153` → `'assign_resources_to_appointment'`,
  dentro de `assignResourcesToAppointment()`, que usa la pantalla
  `lib/pages/patients/assign_resources_page.dart:312`.
- `flutter_application_1/lib/pages/resources/resource_models.dart:111-114` → convierte
  `delivery_mode` en `ResourceDeliveryMode.direct` / `ResourceDeliveryMode.awaitingPatientTap`, y
  **lanza `FormatException` con cualquier otro valor**.

Es decir: con el reloj congelado, cada asignación de materiales devolvería siempre
`awaiting_patient_tap`, grabaría siempre `resource_delivery_batches.status = 'waiting_for_patient'`
y encolaría siempre el job de invitación. Sigue siendo cierto que **hoy nadie consume
`public.jobs`**, así que el material no se entrega por ninguna de las dos ramas; pero el estado del
lote y el modo devuelto a la app **sí se escriben y sí se leen desde hoy**, y quedan grabados mal
para siempre en las citas que se atiendan mientras tanto.

**c) La decisión no es sobre una función: es sobre siete objetos.** Basta borrar cualquiera de los
siete renglones de §2.7 —o resolver §3.2 por la opción 1— para que el reloj se congele. En
particular, apagar `kapso_inbound_webhook` (renglón 20) o borrar la única fila de
`private.agent_runtime_targets` (renglón 18) apaga el sello **sin tocar la función 13**, que es
justo lo que §3.1 creía estar protegiendo.

**Opciones:**
1. Borrar el bloque completo de §2.7 y anotar que el agente nuevo tiene que volver a sellar
   `last_inbound_at`. Es lo natural si el agente se reimplementa pronto. **Coste mientras tanto:**
   toda entrega de materiales queda registrada como ventana cerrada.
2. Lo mismo, dejando el sellado de la ventana de 24 h como requisito escrito del rediseño.
3. Conservar sólo el sellado. **Arreglo mínimo, ya medido:** una función de dominio de una sola
   sentencia —el mismo `UPDATE public.whatsapp_links SET last_inbound_at = greatest(…)` por
   `patient_id`+`professional_id`— más un único invocador que la llame cuando entre un mensaje. Es
   la única de las tres que permite borrar los siete renglones de §2.7 sin perder el reloj, pero
   **necesita un invocador nuevo**: hoy el único que sabe que llegó un mensaje entrante es
   `kapso_inbound_webhook`, que está en el bloque. Añade código; va contra la regla de no agregar
   complejidad.

**Mientras no se decida, no se borra ninguno de los siete renglones de §2.7, y §3.2 no se resuelve
por la opción 1.**

### 3.2 `whatsapp_inbound_messages`: es anterior al agente, pero hoy sólo el agente la usa

Tres objetos, una sola decisión: la tabla, el cron `purge_whatsapp_inbound` (jobid 7) y la función
`public.purge_whatsapp_inbound(p_older_than interval DEFAULT '30 days', p_batch integer DEFAULT 5000)`.

Lo verificado:

- **Es anterior al agente.** La migración del agente sólo la altera
  (`ALTER TABLE public.whatsapp_inbound_messages`), no la crea; sigue siendo propiedad de `postgres`;
  y su cron de purga lleva corriendo desde el **2026-08-16**, una semana antes de la primera
  migración del agente (265 corridas, todas `succeeded`).
- **Pero el agente se la quedó.** De sus 22 columnas, las 6 primeras son las originales
  (`message_sid`, `phone`, `received_at`, `processed_at`, `response_message_sid`) y las **16
  restantes** las añadió `agent_whatsapp_foundation`: `webhook_delivery_key`, `payload_sha256`,
  `admission_status`, `admission_reason`, `admission_result`, `agent_session_id`, `agent_turn_id`,
  `kapso_execution_id`, `notice_claimed_at`, etc.
- **Hoy nadie más la toca.** Las diez funciones que la mencionan son las nueve `agent_*` de `public`
  más `purge_whatsapp_inbound`. La app no tiene GRANT sobre ella y su RLS no tiene políticas.
  Tiene 10 filas.

**Opciones:**
1. Borrar los tres objetos. La base queda sin bitácora de entrada. **Atención: esta opción también
   apaga el reloj de §3.1**, porque la tabla es la primera y la última sentencia del cuerpo de
   `agent_register_inbound_context` (§2.7). No se puede tomar sin haber tomado antes la opción 1 o 2
   de §3.1.
2. Dejar la tabla y su purga como sustrato de la reimplementación, y borrar sólo las 16 columnas
   del agente. Es la opción prudente si el agente nuevo va a necesitar idempotencia de webhook.
   **Si §3.1 se resuelve por conservar, esta opción tampoco sirve tal cual**: nueve de esas 16
   columnas (`webhook_delivery_key`, `payload_sha256`, `admission_*`, `agent_session_id`,
   `agent_turn_id`, `notice_claimed_at`…) las escribe la función que sella el reloj.
3. Dejar los tres tal cual y decidir al escribir el agente nuevo. Cuesta 168 kB. **Es la única
   compatible con conservar el reloj.**

### 3.3 El rol `agenda_psi_agent_owner`: ¿se borra o se recicla?

Borrarlo quita el `BYPASSRLS`, que es el privilegio más ancho del proyecto. Pero **ya no es una
decisión libre: es consecuencia de §3.1.** El rol es dueño de las 13 funciones del agente
—`agent_register_inbound_context` incluida— y todas son `SECURITY DEFINER`, así que mientras esa
función tenga que seguir sellando el reloj, el rol se queda (§2.7, renglón 22). Si §3.1 se resuelve
por borrar, el rol se va con el Paso 7 y la decisión de calendario vuelve a ser sólo eso: si el
agente se reimplementa en semanas hay que volver a crearlo, volver a otorgar los permisos y volver a
reasignar la propiedad.

Si se conserva, lo que **sí** se puede revocar hoy sin tocar el reloj es el `SELECT` sobre
`appointments`, `payments`, `professional_profiles`, `professionals` y `services` — cinco de las
siete tablas de dominio, verificado contra el cuerpo de la función, que no lee ninguna de ellas.
Las otras dos (`patients` y `whatsapp_links`, con su `UPDATE (last_inbound_at)`) no se pueden
tocar.

---

## 4. EL ORDEN DE BORRADO

Hay dependencias reales: llaves foráneas entre tablas del agente, funciones que llaman a otras
funciones, y objetos que son propiedad del rol. Este orden las respeta.

**Paso 0 — apagar la entrada antes de tocar la base.** Desactivar el workflow en Kapso. **Ojo con el
webhook que apunta a `kapso_inbound_webhook`: quitarlo apaga el reloj de §3.1** (§2.7, renglón 20).
Si §3.1 aún no se decide, el workflow se desactiva pero el webhook de entrada se deja puesto; lo
único que hay que garantizar es que ninguna ruta de `agent_tool_gateway` siga en uso.

**Paso 1 — la función de borde `agent_tool_gateway`.** Es la puerta de las funciones que se van;
con ella apagada, las doce funciones de §1.1 no pueden ser invocadas por nadie.
`kapso_inbound_webhook` **no se toca en este paso**: está en §2.7.

**Paso 2 — las funciones `public` que llaman a otras.** En este orden, para no dejar funciones rotas
en medio:
`agent_complete_inbound_from_workflow` → `agent_get_capabilities_from_workflow` →
`agent_complete_inbound` → `agent_mark_inbound_completing` → `agent_mark_inbound_waiting` →
`agent_bind_inbound_execution` → `agent_get_inbound_resume_execution` → `agent_get_capabilities`.

**Paso 3 — las cuatro de `private`.** `agent_claim_tool_call`, `agent_finalize_tool_call`,
`agent_issue_option_handle`, `agent_resolve_option_token`. Van después del paso 2 porque las dos
primeras las llamaban las `_from_workflow`.

**Paso 4 — las tres tablas de §1.2, de hija a madre.** Las llaves foráneas mandan el orden
(`pg_constraint contype='f'`):

1. `public.agent_option_tokens` — apunta a `agent_turns` con **`ON DELETE RESTRICT`**, a
   `agent_sessions`, a `patients` y a `private.agent_token_key_registry` (también `RESTRICT`).
   **Tiene que ir primera**: mientras exista, no se puede tirar `agent_token_key_registry`.
2. `public.agent_tool_calls` — apunta a `agent_turns` con **`ON DELETE RESTRICT`**; como
   `agent_turns` se queda (§2.7), esto no bloquea nada, pero va antes por orden.
3. `private.agent_token_key_registry` — ya sin la referencia de `agent_option_tokens`.

Los índices y las restricciones CHECK de esas tres caen solos con cada `DROP TABLE`. No hay que
tocarlos. `agent_turns`, `agent_sessions` y `agent_runtime_targets` **no se tocan aquí**: están en
§2.7.

**Paso 5 — sólo si §3.1 se resuelve por borrar el bloque de §2.7.** En este orden:
`kapso_inbound_webhook` → `public.agent_register_inbound_context` → `public.agent_turns` →
`private.agent_runtime_targets` → `public.agent_sessions` (esta última **sólo después** de
`agent_turns` y `agent_option_tokens`, y sólo después de resolver §3.2, porque
`whatsapp_inbound_messages` la referencia con `fk_inbound_agent_session`, `NOT VALID`,
`ON DELETE SET NULL`; y también la referencia `fk_inbound_agent_turn` contra `agent_turns`) → por
último revocar el `UPDATE (last_inbound_at)` sobre `whatsapp_links`.

**Paso 6 — si §3.2 se resuelve por borrar:** desprogramar el cron `purge_whatsapp_inbound` (jobid
7), borrar `public.purge_whatsapp_inbound(interval, integer)` y por último la tabla
`public.whatsapp_inbound_messages`. En ese orden: si se tira la tabla primero, el cron falla cada
hora en el minuto 29. **Este paso sólo puede correr después del Paso 5**: mientras
`agent_register_inbound_context` viva, la tabla es su libro de idempotencia (§2.7).

**Paso 7 — el rol, al final, y sólo si se corrió el Paso 5.** Sólo cuando ya no sea dueño de nada.
Primero revocar sus permisos de tabla, el de columna y los dos `USAGE` de esquema; después
confirmar que no queda ningún objeto suyo — **y la consulta original no bastaba, porque el rol
también es dueño de funciones**:

```sql
select c.relnamespace::regnamespace::text||'.'||c.relname, c.relkind
from pg_class c where c.relowner = (select oid from pg_roles where rolname='agenda_psi_agent_owner')
union all
select p.pronamespace::regnamespace::text||'.'||p.proname, 'f'
from pg_proc p where p.proowner = (select oid from pg_roles where rolname='agenda_psi_agent_owner');
```

Hoy devuelve 5 tablas (con sus índices y sus toast) y **13 funciones**. Cuando devuelva vacío, el
rol se puede tirar.

---

## 5. QUÉ NO SE PUEDE BORRAR AUNQUE PAREZCA DEL AGENTE

### 5.1 `public.delete_patient` nombra `agent_sessions` — y es de la app

`delete_patient(p_patient_id uuid, p_command_id uuid)` está otorgada a `authenticated`: es de la
app. Y aparece en la búsqueda de menciones de `agent_sessions`. **No es una dependencia real:** la
mención está dentro del bloque de comentario del final, en la línea que documenta la cascada —
«*whatsapp_links, agent_sessions. rescheduled_from_appointment_id = SET NULL*». El código que se
ejecuta no la nombra; el borrado en cadena lo hace la llave foránea
`agent_sessions_patient_id_fkey … ON DELETE CASCADE`, que desaparece con la tabla.

Conclusión: **borrar `agent_sessions` no rompería `delete_patient`.** Y como con la revisión del
2026-08-26 `agent_sessions` **se queda** (§2.7), el comentario tampoco miente por ahora: la cascada
que describe sigue existiendo. **La función no se toca en ningún caso.** Si algún día §3.1 se
resuelve por borrar, entonces sí hay que corregir ese comentario.

### 5.2 `kapso_status_callback` — el nombre engaña

Lleva «kapso» y `verify_jwt=false`, igual que las dos del agente. Pero llama
`record_outbox_provider_status` y sirve a la cola de plantillas del dominio. Ver §2.1.

### 5.3 `enviar-whatsapp` — es el sender del dominio, no del agente

Manda WhatsApp, pero sólo plantillas de `whatsapp_outbox`, disparado por cron cada minuto. Cero
referencias al agente en su código. Ver §2.1.

### 5.4 El esquema `private` — 23 de sus 27 funciones son del dominio

Se borran cuatro funciones de dentro. El esquema y las otras 23 se quedan. Ver §2.4.

### 5.5 `public.whatsapp_links` y su columna `last_inbound_at`

La tabla es del dominio (la escriben los triggers `patients_whatsapp_link_ai` y
`patients_whatsapp_link_phone_au`) y la lee `assign_resources_to_appointment`, que es de la app.
**Pero la columna `last_inbound_at` no la escribe ninguno de esos dos triggers** —se comprobó uno
por uno—: la escribe sólo `agent_register_inbound_context`. Los permisos del rol del agente sobre
esta tabla **no se retiran** mientras §3.1 no se decida. Ver §3.1 y §2.7.

### 5.6 Los 33 enums y las 34 tablas de dominio

Ninguno se creó para el agente (§1.5). `appointment_confirmation_source`, `actor_type` y
`change_policy_result` suenan a agente y no lo son: los tres son de `postgres` y los usan las
funciones del profesional.

### 5.7 Las siete tablas de dominio sobre las que el agente tiene SELECT

`appointments`, `patients`, `payments`, `professional_profiles`, `professionals`, `services`,
`whatsapp_links`. Se revoca el permiso; la tabla no se toca. Con el matiz de §2.5: el permiso sobre
`patients` y sobre `whatsapp_links` no se revoca mientras §3.1 no se decida.

---

## 6. RESUMEN DE CIFRAS

| Lista | Cuántos |
|---|---|
| **SE BORRA** | **16** — 12 funciones (8 `public` + 4 `private`), 3 tablas (`agent_tool_calls`, `agent_option_tokens`, `agent_token_key_registry`) y 1 función de borde (`agent_tool_gateway`) |
| **SE QUEDA** | **4 funciones de borde, 7 cron, 9 triggers, 33 enums, el esquema `private` con 23 funciones, las 7 tablas de dominio, y los 7 renglones del bloque del reloj de §2.7** |
| **SE REVISA CON EL DUEÑO** | **3 decisiones**, pero ahora son **una sola en el fondo**: §3.1 (el reloj de 24 h) gobierna los siete renglones de §2.7, arrastra la opción 1 de §3.2 y decide §3.3 |

Cambio respecto del corte anterior: la lista de borrado bajó de 23 a 16 renglones. Los 7 que
salieron están en §2.7 con su razón. **Ninguno salió porque el Flutter lo nombre** —se volvió a
barrer `lib/` y `test/` (240 archivos Dart): cero menciones de `agent`, `kapso`, `inbound` o
`agenda_psi_agent_owner`; cero usos de `.from()`; un solo `functions.invoke`, el de
`get-payment-proof-url`—. Salieron porque sostienen el reloj de 24 h que sí lee la app.

Objetos que **no existen** y que por lo tanto no hay que buscar: tipos o enums del agente (0),
triggers del agente (0), cron del agente (0), vistas del agente (0), secuencias del agente (0),
buckets del agente (0 — los cuatro son `comprobantes`, `identidad-ine`, `patient-resources`,
`perfiles`), secretos de bóveda del agente (0 — el único es `sender_secret`, del sender del dominio).
