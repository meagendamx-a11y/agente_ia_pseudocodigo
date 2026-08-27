# La lista de limpieza — cierre de los tres frentes

Corte: 2026-08-26. Base desplegada `ssyzfeadyrczlzjbvxyl`. Proyecto Kapso «Agenda Psi»
`7cacfa3c-18f3-42c7-9623-22503fb947c7`.

**Este documento no ejecutó nada.** Sólo `SELECT`, lectura del código desplegado de las funciones de
borde y lectura de archivos. Nadie borró, desactivó, migró ni desplegó. La lista es para que el dueño
decida.

Cierra tres frentes:
[`21-supabase.md`](21-supabase.md), [`22-flutter.md`](22-flutter.md), [`23-kapso.md`](23-kapso.md).
Se cruzó contra la versión de esos documentos vigente al cierre: el de Supabase con **16 renglones**
en «SE BORRA» (ya había movido siete a su §2.7 por el reloj de 24 h), el de Flutter con su segunda
pasada exhaustiva, y el de Kapso con su refutación de §7.

---

## LO QUE CAMBIÓ AL CRUZARLOS, EN CUATRO RENGLONES

1. **El frente de Supabase mandó a borrar el mecanismo de dormir y despertar del agente.** No lo dijo
   con esas palabras: lo repartió en cinco renglones distintos, y a uno de ellos lo llama
   «huérfana» — por error, y sigue diciéndolo en la versión corregida.
2. **De los 16 renglones de «SE BORRA» de Supabase, sólo 4 sobreviven.** Cinco se van a «SE QUEDA» y
   siete a «SE REVISA».
3. **Su nueva recomendación de revocar permisos rompe algo vivo.** Detalle en §1.5.
4. **Se borran 7 cosas en total** —4 en Supabase, 3 entre Kapso y Meta— y quedan **13 decisiones**
   para el dueño.

---

# 1. EL CRUCE

Es la razón de ser de este documento: tomar la lista de «se borra» de Supabase y pasarla contra la
lista exhaustiva de lo que usa el Flutter. Se hizo por tres vías, no por una.

## 1.1 Cruce por privilegio — ¿puede la app tocar algo de la lista?

Se preguntó a la base, objeto por objeto, si los roles con los que entra la app (`authenticated`) y
el Marketplace (`anon`) tienen permiso. Se metieron los 20 objetos SQL que aparecen en cualquiera de
las dos versiones del frente, para que el cruce valga para las dos.

```sql
select b.objeto, b.tipo,
  coalesce((select bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE')) ...), false),
  coalesce((select bool_or(has_table_privilege('authenticated', c.oid, 'SELECT')) ...), false),
  coalesce((select bool_or(has_table_privilege('anon', c.oid, 'SELECT')) ...), false)
from borrar b ...;
```

**Resultado: los 20 devuelven `false, false, false`.** Las 13 funciones no las puede ejecutar
`authenticated`; las 7 tablas no las puede leer ni `authenticated` ni `anon`. Confirma la Prueba 1
del frente de Supabase con una consulta distinta.

**Ninguna coincidencia por esta vía.**

## 1.2 Cruce por dependencia — ¿alguna RPC de la app nombra algo de la lista?

Ésta es la que importa, porque el privilegio no detecta una dependencia interna. Se tomaron los **72
nombres de RPC** del frente de Flutter, más las tres dependencias internas que ese frente identificó
(`_get_internal_availability_core`, `is_agenda_admin`, `get_payment_proof_signing_receipt`), y se
buscó cada uno de los 23 objetos del agente dentro de `pg_get_functiondef` de las 75.

```sql
select a.name as rpc_de_la_app, o.nombre as objeto_del_agente_mencionado
from app a join pg_proc p on p.proname = a.name ...
join objetivo o on pg_get_functiondef(p.oid) ilike '%'||o.nombre||'%';
```

**Resultado: exactamente una coincidencia.**

| RPC de la app | Objeto del agente mencionado |
|---|---|
| `delete_patient` | `agent_sessions` |

Y se fue a ver la línea. Es un comentario, textual:

```
--    whatsapp_links, agent_sessions. rescheduled_from_appointment_id = SET NULL.
```

El código que se ejecuta no la nombra. El borrado en cadena lo hace la llave foránea
`agent_sessions_patient_id_fkey`, verificada:
`FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE`.

**Conclusión: no es una dependencia. `delete_patient` no se toca.** Confirma §5.1 del frente de
Supabase con la misma evidencia.

## 1.3 Cruce por llave foránea — la dirección que nadie había mirado

Los tres frentes miraron «¿la app apunta al agente?». Falta la contraria: **¿alguna tabla del agente
apunta a una tabla de la app con una regla que pueda bloquear un borrado de la app?**

| Llave | Tabla del agente | Apunta a | Al borrar |
|---|---|---|---|
| `agent_sessions_patient_id_fkey` | `agent_sessions` | `patients` | CASCADE |
| `fk_agent_sessions_patient_tenant` | `agent_sessions` | `patients` | **NO ACTION** (`NOT VALID`) |
| `agent_sessions_professional_id_fkey` | `agent_sessions` | `professionals` | **NO ACTION** |
| `agent_turns_patient_id_professional_id_fkey` | `agent_turns` | `patients` | SET NULL |
| `agent_option_tokens_patient_id_professional_id_fkey` | `agent_option_tokens` | `patients` | SET NULL |

**Hallazgo:** `agent_sessions` tiene dos llaves foráneas hacia el dominio con `NO ACTION`, que es
bloqueante, y una apunta a `professionals`. Hoy no estorba —hay 4 sesiones y nadie borra
profesionales—, pero es una razón *a favor* de limpiar, no en contra: mientras esas filas existan, un
borrado de profesional puede toparse con ellas.

**No mueve nada de lista.** Se apunta porque cambia el signo del riesgo: dejar `agent_sessions` no es
gratis del todo.

## 1.4 QUÉ SALVÓ EL CRUCE — y no fue nada del Flutter

Aquí está el resultado incómodo. **El cruce contra el Flutter salió limpio: cero coincidencias
reales.** Lo que salvó cinco renglones no fue la app: fue leer el código desplegado de las dos
funciones de borde y compararlo con lo que dicen los frentes.

### El error, con su prueba

El frente de Supabase, §1.1 renglón 8, dice de `public.agent_get_inbound_resume_execution`:

> «**Nadie.** Ni función SQL, ni cron, ni trigger, ni código de borde desplegado. Es huérfana.»

**Es falso.** El código desplegado de `kapso_inbound_webhook` (versión 32, `ACTIVE`), archivo
`functions/kapso_inbound_webhook/index.ts`, la llama:

```ts
async resolveExecutionId(providerMessageId, turnId) {
  const { data, error } = await supabase.rpc(
    'agent_get_inbound_resume_execution',
    { p_provider_message_id: providerMessageId, p_turn_id: turnId },
  ).abortSignal(AbortSignal.timeout(2_000));
  if (error !== null) throw error;
  return typeof data === 'string' ? data : null;
},
```

Y `kapso-workflow.ts` la usa exactamente en el camino de despertar:

```ts
} else {
  const resolved = await deps.resolveExecutionId(
    input.inbound.p_provider_message_id, turnId,
  );
  if (resolved === null) fail('WORKFLOW_TARGET_MISSING');
  executionId = controlText(resolved, 'WORKFLOW_TARGET_MISSING');
  url = `${KAPSO_API_BASE}/workflow_executions/${encodeURIComponent(executionId)}/resume`;
```

**Por qué se le escapó al frente:** buscó en `handler.ts`, donde están las rutas. Esta llamada vive
en `index.ts`, inyectada como cierre al construir el despachador. Por la misma razón, su §2.7 dice
que el webhook existe sólo por el reloj de 24 h, cuando además es la mitad de despertar.

Del lado de Kapso sí estaba bien: `23-kapso.md` §4 nombra las tres RPC del webhook. **Los dos frentes
se contradecían y nadie lo notó.** El código desplegado le da la razón a Kapso.

### El punto ciego que produjo el error

El frente de Supabase movió siete renglones a «se queda» razonando **sólo sobre el reloj de 24 h**.
Es un razonamiento correcto y no lo contradigo. Pero es un solo hilo, y hay dos: la misma maquinaria
sostiene **dormir y despertar**. Se ve textual en su §1.3, al justificar que el gateway se puede
borrar:

> «…y **no participa en el sellado del reloj de §3.1**: el reloj lo escribe
> `agent_register_inbound_context`, que entra por `kapso_inbound_webhook`, no por aquí.»

Es cierto y es insuficiente. El gateway no participa en el reloj: participa en **dormir**, porque su
ruta `/workflow/waiting` es la única puerta que existe para poner un turno en espera (§5).

### Lo que se salvó

De los 16 renglones vigentes de «SE BORRA» de Supabase:

| # | Renglón | Adónde va | Por qué |
|---|---|---|---|
| 1 | `public.agent_bind_inbound_execution` | **SE QUEDA** | Único escritor de `agent_turns.kapso_execution_id`, que despertar exige `IS NOT NULL` (§5.2) |
| 2 | `public.agent_mark_inbound_waiting` | **SE QUEDA** | Es dormir (§5.1) |
| 8 | `public.agent_get_inbound_resume_execution` | **SE QUEDA** | Es despertar. El error de arriba |
| 16 | `public.agent_tool_calls` | **SE QUEDA** | Es el cerrojo que sincroniza antes de dormir (§5.1, paso 4) |
| 21 | Borde `agent_tool_gateway` | **SE QUEDA** | Contiene `/workflow/waiting`. Se **reescribe**, no se borra |
| 3, 4, 5, 6, 7, 9, 10 | `agent_mark_inbound_completing`, `agent_complete_inbound`, `agent_complete_inbound_from_workflow`, `agent_get_capabilities`, `agent_get_capabilities_from_workflow`, `private.agent_claim_tool_call`, `private.agent_finalize_tool_call` | **SE REVISA** | No son del mecanismo, pero los alcanza el workflow que hoy está activo. Mueren con su reescritura (decisión 5) |
| 11, 12, 17, 19 | `private.agent_issue_option_handle`, `private.agent_resolve_option_token`, `public.agent_option_tokens`, `private.agent_token_key_registry` | **SE BORRA** | Los únicos cuatro que sobreviven |

Y los siete que el propio frente ya había movido a su §2.7 —`agent_register_inbound_context`,
`kapso_inbound_webhook`, `private.agent_runtime_targets`, `agent_sessions`, `agent_turns`, el rol y
sus permisos— **se quedan por partida doble**: por el reloj y por el mecanismo.

## 1.5 La corrección nueva: la revocación de permisos que rompe algo vivo

La versión corregida del frente de Supabase, §1.4, recomienda:

> «lo que **sí** se puede revocar de inmediato sin tocar el reloj es el `SELECT` sobre
> `appointments`, `payments`, `professional_profiles`, `professionals` y `services`: ninguna de esas
> cinco la lee `agent_register_inbound_context`.»

**La premisa es cierta y la conclusión es falsa para cuatro de las cinco.** `agent_register_inbound_context`
no es la única función que corre con los privilegios de ese rol: **las 13 son `SECURITY DEFINER` y
las 13 son propiedad del rol** — el propio frente lo corrigió en su §2.7. Y una de ellas sí las lee:

```sql
select p.proname, p.prosecdef, pg_get_userbyid(p.proowner), (lee appointments/payments/…)
from pg_proc p ... where p.proname like 'agent\_%';
```

| Función | `SECURITY DEFINER` | Dueño | appointments | payments | professional_profiles | professionals | services |
|---|---|---|---|---|---|---|---|
| `agent_get_capabilities` | sí | `agenda_psi_agent_owner` | **sí** | **sí** | **sí** | **sí** | no |
| `agent_issue_option_handle` | sí | `agenda_psi_agent_owner` | sí | no | no | no | **sí** |
| `agent_resolve_option_token` | sí | `agenda_psi_agent_owner` | sí | no | no | no | **sí** |

`agent_get_capabilities` es la que alcanza la Function Tool `get_capabilities`, y el prompt del
agente la vuelve obligatoria al inicio de cada gestión: **tres de las seis llamadas que el agente ha
hecho en toda su historia son exactamente ésa.** Revocarle el `SELECT` sobre esas cuatro tablas la
rompe en caliente, sin borrar ningún objeto.

**Lo único que se puede revocar hoy es el `SELECT` sobre `public.services`, y sólo después de borrar
`agent_issue_option_handle` y `agent_resolve_option_token`**, que son las únicas dos que la nombran y
que sí se borran. Las otras cuatro se revocan junto con la decisión 5.

## 1.6 Una corrección más, de la misma familia

El frente de Supabase §3.2 ofrece como opción 2: «Dejar la tabla `whatsapp_inbound_messages` y su
purga, y borrar sólo las 16 columnas del agente».

**Esa opción rompe el mecanismo.** De las 16 columnas añadidas, **seis las leen las dos mitades**:
`target_phone_number_id`, `kapso_conversation_id`, `admission_status`, `agent_session_id`,
`agent_turn_id`, `kapso_execution_id`. Y otras dos, `webhook_delivery_key` y `payload_sha256`, son la
idempotencia del webhook. Comprobado leyendo el cuerpo de las dos funciones y la lista de columnas
(`information_schema.columns`: 22 columnas; las añadidas son de la 7 a la 22).

**La tabla se queda entera.**

---

# 2. SE BORRA

**Siete renglones.** Sólo lo que no toca la app, no toca el dominio, no toca el mecanismo de dormir y
despertar, y no lo alcanza el workflow que hoy está activo.

## 2.1 Supabase — 4

En orden de dependencia. Las dos funciones primero, después las dos tablas, y `agent_option_tokens`
antes que `agent_token_key_registry` porque la llave entre ellas es `RESTRICT`.

| # | Qué | Evidencia de una línea |
|---|---|---|
| 1 | `private.agent_issue_option_handle(uuid, uuid, text, text, uuid, text, text, timestamptz, boolean)` | Ninguna función de `public` ni `private` la nombra, y ninguna de las dos funciones de borde desplegadas la invoca: **leí las dos completas** — `kapso_inbound_webhook` llama `agent_register_inbound_context`, `agent_get_inbound_resume_execution` y `agent_bind_inbound_execution`; `agent_tool_gateway` llama `agent_get_capabilities_from_workflow`, `agent_mark_inbound_waiting` y `agent_complete_inbound_from_workflow`. Ninguna de las seis es ésta. |
| 2 | `private.agent_resolve_option_token(uuid, uuid, uuid, text, boolean)` | Idéntica prueba. Consulta de menciones cruzadas sobre `pg_get_functiondef` de todo `public` y `private`, excluyéndose a sí mismas: **resultado vacío**. |
| 3 | `public.agent_option_tokens` | **0 filas** desde que existe. Ninguna llave foránea apunta hacia ella (`pg_constraint` con `confrelid = 'public.agent_option_tokens'::regclass`: vacío). Sus únicos escritor y lector son las funciones 1 y 2. |
| 4 | `private.agent_token_key_registry` | **0 filas**. Su único referente es `agent_option_tokens` (`fk_agent_option_tokens_key_registry`), que se borra en el renglón 3. Sus únicos lectores son las funciones 1 y 2. |

Con la tabla 3 caen sus índices y sus `CHECK`; con la 4, los suyos. No hay que tocarlos aparte.

**Y sólo entonces, un permiso:** `REVOKE SELECT ON public.services FROM agenda_psi_agent_owner`. Es
la única tabla de dominio que **nada más** nombran esas dos funciones. Las demás revocaciones que
propone el frente de Supabase rompen `agent_get_capabilities` — ver §1.5.

## 2.2 Kapso y Meta — 3

**Paso 0, antes de nada, y cuesta un minuto.** Los cinco archivos sueltos de `kapso/` tienen **0
commits en cualquier rama** —comprobado hoy, `git log --all -- <ruta>` devuelve 0 para los cinco— y
**`kapso pull` no recupera Flows** (la CLI 0.18.0 no tiene comando de flows). Un `git add` de esos
cinco archivos vuelve reversible todo lo que sigue. Sin ese paso, el renglón 7 es el único borrado
irreversible de toda la lista.

| # | Qué | Dónde se borra | Evidencia de una línea |
|---|---|---|---|
| 5 | Plantilla `appointment_reminder_1h_online_no_url` | **Administrador de Meta** (Kapso no ofrece borrado de plantillas) | `private.wa_payload_ok('appointment_reminder_1h_online_no_url', '{"variables":["Ana","10:00","11:00"]}')` devuelve **`false`**: la base la rechaza. 0 filas en toda la historia de `whatsapp_outbox`. Y no es que el catálogo esté mal: la fila de `_simple` llegó a `status='sent'` con `provider_message_id` no nulo — Meta acepta `_simple`, así que `_no_url` no es el nombre bueno. |
| 6 | Plantilla `appointment_reminder_1h_online_no_link` | **Administrador de Meta** | Mismo `false` con la misma carga. 0 filas históricas. Ninguna función arma el nombre por concatenación: `cron_appointment_reminder_1h` elige entre tres literales, y `enviar-whatsapp` manda `template: { name: fila.template_key }` sin tabla de equivalencias. |
| 7 | Archivo local `kapso/flows/agenda-psi-citas.flow.json` | El disco | Pide `data_api_version: 4.0` y pantallas `ELEGIR`/`CUANDO`. Las dos funciones de formulario desplegadas devuelven una pantalla fija cada una (`const PANTALLA = 'CREAR_CITA'` y `'REPROGRAMAR_CITA'`), y las cinco invocaciones registradas traen `data_exchange.version: "3.0"`. No corresponde a nada desplegado. |

Los renglones 5 y 6 aguantaron dos rondas de refutación (siete vías en `23-kapso.md` §7.2). Los volví
a comprobar de forma independiente contra la base: `simple_ok=true, no_url_ok=false,
no_link_ok=false, filas_historicas=0, simple_entregada=1`.

## 2.3 Lo que NO está en esta lista y podría sorprender

- **Ningún cron.** Los 7 activos son del dominio, verificados hoy en `cron.job`:
  `cron_sweep_past_pending`, `cron_confirmation_26h`, `cron_appointment_reminder_1h`,
  `purge_command_log`, `purge_whatsapp_outbox`, `purge_whatsapp_inbound`, `sender_whatsapp`.
- **Ningún trigger, tipo, enum, vista, secuencia, bucket ni secreto.** El agente no creó ninguno.
- **Ninguna función de borde.** Las seis desplegadas se quedan: cuatro son de la app y del dominio, y
  las dos del agente son las dos mitades del mecanismo.
- **Ninguna de `agent_sessions`, `agent_turns`, `agent_tool_calls` ni `whatsapp_inbound_messages`.**

---

# 3. SE QUEDA

## 3.1 Porque lo usa la app de Flutter

Sale íntegro de `22-flutter.md`. **Nada de esto aparece en ninguna lista de borrado.**

- **Las 72 RPC** que llaman las 14 capas de datos por página, congeladas además por la reja
  `rpc_parity_test.dart`. Las 72 existen y las 72 tienen `EXECUTE` para `authenticated`.
- **Las tres dependencias internas que la app no nombra pero necesita:**
  `_get_internal_availability_core` (motor de `get_internal_availability`),
  `current_professional_id()` e `is_agenda_admin()` (viven dentro de las políticas de `notifications`
  y de las tres subidas de Storage).
- **La única función de borde que invoca:** `get-payment-proof-url`, y con ella
  `get_payment_proof_signing_receipt`, la tabla `payment_proofs` y el bucket `comprobantes`.
- **`public.notifications`**, su lugar en la publicación `supabase_realtime`, su `SELECT` para
  `authenticated` y su única política `notif_owner_sel`. Es lo único que la app lee directo.
- **Los cuatro buckets** y las tres políticas de subida de `storage.objects`.
- **`public.whatsapp_links` entera, columnas incluidas.** Tiene una columna `kapso_contact_id` que
  suena a agente; la tabla la escriben dos triggers del dominio y la leen RPC de la app.
- **El proveedor de WhatsApp de Supabase Auth.** No es una tabla ni una función: es un ajuste del
  panel. Es por donde entra el código de seis dígitos con el que se inicia sesión. **Si alguien lo
  apaga creyendo que es del agente, nadie puede entrar a la app.**

## 3.2 Porque lo usa el dominio

- **Los 7 cron y los 9 triggers.**
- **Las tres funciones de borde del dominio:** `notificar-push` (la dispara el trigger
  `notificar_push` sobre `notifications`), `enviar-whatsapp` (la dispara el cron `sender_whatsapp`
  cada minuto) y `kapso_status_callback` (la llama Kapso para anotar entregas). **`kapso_status_callback`
  lleva «kapso» en el nombre y no es del agente.**
- **El webhook de Kapso `88980a1c`** → `kapso_status_callback`, con los eventos
  `whatsapp.message.sent/delivered/read/failed`.
- **Las 16 plantillas del catálogo de `private.wa_payload_ok`.** Sacar una de Meta sin migrar esa
  función deja a la app sin poder encolar ese aviso: una clave desconocida hace que `wa_payload_ok`
  devuelva `false` y el `INSERT` en `whatsapp_outbox` reviente contra `chk_outbox_variables`.
- **El esquema `private` completo**, del que se borran dos funciones de veintisiete.
- **Los 33 enums y las 34 tablas de dominio.**
- **El número de producción `1189669584231262`** y la llave de API `Proyecto`.

## 3.3 Porque es el mecanismo de dormir y despertar

Trece piezas. Están en **§5**, que es la sección que hay que leer antes de borrar nada.

## 3.4 Porque no se pudo descartar

Se dice qué falta comprobar, no se adivina.

| Qué | Por qué no se pudo descartar |
|---|---|
| El número de sandbox de Kapso `597907523413541` | No hay herramienta que ate un número de sandbox a una prueba concreta. Es la única vía que ejerce el camino completo. |
| Cuántos WhatsApp Flows hay y adónde apunta cada uno | Las tres vías de sólo lectura están cerradas: `GET /platform/v1/whatsapp/flows` devuelve `HTTP 401`, la CLI 0.18.0 no tiene comando de flows y el servidor MCP de Kapso pide reautorización. Sólo queda el tablero. |
| El plan del proyecto Kapso | Ni el MCP ni la CLI exponen plan ni facturación. El tope de cinco scripts de Cloudflare es la regla del plan Free; hoy se usan cuatro. |
| `approve_profile` y `reject_profile` | No tienen `EXECUTE` para `anon`, `authenticated` ni `service_role`, y la app no las llama. Quién las ejecuta no se ve desde ningún frente. |
| Quién escribe hoy en el bucket `comprobantes` | La app no escribe ahí y no hay política de `storage.objects` para ese bucket. Cuál función pone el archivo no se fijó con evidencia. |

---

# 4. SE REVISA CON EL DUEÑO

Trece decisiones. Cada una con recomendación.

### 1. El reloj de 24 h de la entrega de materiales

**Qué pasa.** En toda la base, **una sola función escribe `whatsapp_links.last_inbound_at`, y es del
agente**: `agent_register_inbound_context`. Y **una función de la app lee ese dato**:
`assign_resources_to_appointment` (`EXECUTE` para `authenticated`), con
`AND wl.last_inbound_at >= now() - interval '24 hours'`. De 18 vínculos de WhatsApp, sólo 2 tienen
valor.

**Qué cambió con el cruce.** El frente de Supabase ya había blindado las siete piezas del reloj. El
cruce añade que **las mismas piezas sostienen dormir y despertar**, así que la decisión ya no es «si
las borramos, se congela el reloj» sino que no hay decisión que las borre: se quedan por dos razones
independientes.

**La pregunta que queda es otra:** ¿se acepta que la ventana de entrega de materiales de la app
dependa de que el carril del agente esté encendido?

**Recomendación:** aceptarlo hoy y escribirlo como requisito del rediseño. Hoy el efecto es teórico
—no existe consumidor de `public.jobs`, así que la entrega no funciona por ninguna de las dos ramas—,
pero el día que se construya el motor de trabajos, si el agente está apagado la rama abierta nunca se
activa.

### 2. Las rutas muertas del gateway

**Qué pasa.** El gateway desplegado (v35) declara **27 rutas** en `FUTURE_AGENT_ROUTES` y contesta
**tres** más `/health`. Las otras 24 caen en `return safe(403, { ok: false, error:
'OPERATION_NOT_ENABLED' })`. Las tres vivas son `/tools/capabilities`, `/workflow/waiting` y
`/workflow/complete`. (El frente de Supabase contó 24 leyendo `git show HEAD`; el árbol de trabajo
tiene el archivo modificado sin desplegar. Contra lo desplegado son 27. Las dos cifras son ciertas de
versiones distintas.)

**Recomendación:** reescribir el archivo dejando `/health`, `/tools/capabilities` y
`/workflow/waiting`, y `/workflow/complete` mientras viva el nodo terminal. **Es un despliegue, no un
borrado**, así que no entra en «SE BORRA»: entra en la reimplementación. **La función no se borra.**

### 3. Los permisos del rol `agenda_psi_agent_owner`

**Qué pasa.** El rol se queda: es dueño de las 13 funciones y de 5 tablas, y varias de las dos cosas
se quedan. Tiene `BYPASSRLS = true`, el privilegio más ancho del proyecto.

**Recomendación:** revocarle **sólo** el `SELECT` sobre `public.services`, y sólo después de borrar
las funciones 1 y 2 de §2.1. **No revocar `appointments`, `payments`, `professional_profiles` ni
`professionals`**, aunque el frente de Supabase lo proponga: rompen `agent_get_capabilities`, que el
workflow activo llama al inicio de cada gestión (§1.5). Esas cuatro se revocan junto con la decisión
5. El `BYPASSRLS` no se quita mientras el rol siga sosteniendo el mecanismo.

### 4. `whatsapp_inbound_messages` y su purga

**Qué pasa.** La tabla es anterior al agente (la migración del agente sólo la altera; sigue siendo
propiedad de `postgres`; su cron de purga corre desde el 2026-08-16, una semana antes de la primera
migración del agente). Pero el agente le añadió 16 columnas y hoy es el sustrato del mecanismo.

**Recomendación:** **no tocarla, ni la tabla ni sus columnas ni su cron `purge_whatsapp_inbound`.** La
opción de «borrar sólo las 16 columnas» rompe dormir y despertar: seis de esas columnas las leen las
dos mitades (§1.6).

### 5. Las siete funciones que el workflow activo todavía alcanza

`agent_get_capabilities`, `agent_get_capabilities_from_workflow`, `agent_complete_inbound`,
`agent_mark_inbound_completing`, `agent_complete_inbound_from_workflow`,
`private.agent_claim_tool_call`, `private.agent_finalize_tool_call`.

**Qué pasa.** No son del mecanismo de dormir y despertar. Pero la Function Tool `get_capabilities` y
el nodo terminal del workflow **activo** apuntan a la función de Kapso que las alcanza. Borrarlas hoy
rompe el workflow en caliente. Y el portero `agent_claim_tool_call` conoce 26 operaciones en 4
superficies para un sistema que en toda su historia hizo 6 llamadas y **0 mutaciones**.

**Recomendación:** mueren en un solo movimiento con la reescritura de la definición del workflow, no
antes y no sueltas. En esa reescritura se decide cuánto del portero sobrevive: su cerrojo de
presupuesto y su réplica exacta valen; la maquinaria de saga (`saga_state` con cuatro valores,
`mutation_limit` variable, la reserva del ordinal 8) sobra si no hay formulario.

### 6. El WhatsApp Flow `2183999d-dc4e-450a-b3e0-7b7d851665cf`

Está registrado y vivo; su endpoint de datos apunta hoy a `agenda-psi-flow-reprogramar`. No se pudo
ver si está publicado o en borrador. **Si está publicado no se puede borrar: hay que deprecarlo por
el Meta Proxy** (`POST /{flow_id}/deprecate`), porque Kapso no expone clonar ni deprecar.

**Recomendación:** deprecarlo. Antes, guardar `reprogramar-cita.flow.json` (decisión 8).

### 7. Las dos funciones de formulario de Kapso

`agenda-psi-flow-agendar` y `agenda-psi-flow-reprogramar`. Las dos se retiran con el formulario, pero
`reprogramar` es el endpoint vivo del Flow de la decisión 6, y `agendar` no se pudo descartar: lo
único que sostenía «ya no le apunta ningún Flow» era una inferencia de dos minutos de bitácora, y
**una función que ningún Flow abrió en 30 días deja las mismas cero líneas que una función suelta**.

**Recomendación:** abrir el tablero de Kapso, leer el `endpoint_uri` de cada Flow, desenganchar, y
sólo después borrar. Ninguna función, cron, política ni columna de Supabase las nombra (consulta
sobre `pg_proc` + `cron.job` + `pg_policies` + `information_schema.columns`: vacía), así que el lado
de la base no estorba.

### 8. Los dos archivos `.flow.json` que sí corresponden

`kapso/flows/agendar-cita.flow.json` y `kapso/flows/reprogramar-cita.flow.json`. Sus pantallas únicas
(`CREAR_CITA` y `REPROGRAMAR_CITA`) y su `data_api_version: 3.0` calzan con lo que devuelven las dos
funciones desplegadas y con las invocaciones reales del Flow `2183999d`.
`reprogramar-cita.flow.json` es hoy **la única copia legible** de la definición de un Flow vivo, y
republicar un Flow deprecado necesita el JSON.

**Recomendación:** `git add` de los cinco archivos sueltos hoy mismo. Después se borran cuando se
resuelvan las decisiones 6 y 7, y ya sin pérdida.

### 9. Las dos copias `kapso/functions/agenda-psi-flow-*.js`

Son el código local de las dos funciones de la decisión 7. `kapso pull` las recupera, pero sólo
mientras existan en Kapso y con una llave de API válida — y la que hay devuelve `401`.

**Recomendación:** se borran junto con su función, no antes. Cubiertas por el `git add` de la
decisión 8.

### 10. Cerrar el inventario de WhatsApp Flows

Hoy no se puede: `GET /platform/v1/whatsapp/flows` devuelve `HTTP 401 {"error":"Invalid or missing
API key"}`, la CLI 0.18.0 no tiene comando de flows y el servidor MCP de Kapso pide reautorización.

**Recomendación:** renovar la llave de API o abrir el tablero. **Las decisiones 6, 7 y 8 no se pueden
cerrar sin esto.**

### 11. Las dos plantillas sin productor

`patient_reactivation` (0 filas, nadie la encola) y `patient_review_request` (0 filas; la produce
`request_patient_review`, que no tiene llamador ni cron, y en Meta su `whatsapp_data.status` sigue en
`PENDING`). **Las dos están en el catálogo de `wa_payload_ok`**, así que apagarlas exige migrar esa
función; no basta con borrarlas en Meta.

**Recomendación:** dejarlas. Es una decisión de producto —si el agente nuevo va a reactivar pacientes
o pedir reseñas— y no cuesta nada esperar.

### 12. El sandbox `597907523413541`

Es la única vía de prueba que recorre webhook, agrupamiento y disparador de mensaje entrante de
verdad. Y hay una razón nueva para conservarlo: **el mecanismo de dormir y despertar nunca se ha
ejercido** (§5.4).

**Recomendación:** conservarlo hasta que la reimplementación esté probada de punta a punta.

### 13. El plan de Kapso y el tope de cinco scripts

Se usan cuatro scripts de Cloudflare Worker, uno por función. Queda un lugar de cinco si el proyecto
está en Free. **Clonar un WhatsApp Flow que necesite un worker de endpoint nuevo también cuenta.**

**Recomendación:** confirmar el plan antes de crear funciones nuevas en la reimplementación.

---

# 5. LO QUE SE QUEDA AUNQUE PAREZCA DEL AGENTE

**El mecanismo de dormir y despertar se queda, y es más importante que antes.** Ahora que no hay
formulario, es lo único que permite que una conversación de WhatsApp dure más de un mensaje. Sin él
el agente contesta una vez y se muere; con él la paciente escribe, el agente pregunta, se duerme, la
paciente responde horas después y el agente sigue donde iba.

**Éste es el error más caro que se podría cometer limpiando**, y el frente de Supabase estaba a punto
de cometerlo: mandó a borrar cinco de sus piezas, y a una de ellas la llama «huérfana».

## 5.1 Dormir — verificado extremo a extremo

**Paso 1. El modelo llama la herramienta.** El nodo de agente del workflow activo declara la Function
Tool `sync_waiting`, que ejecuta la función de Kapso `agenda-psi-mark-inbound-waiting`. El prompt de
sistema la vuelve obligatoria: «Solo si sync_waiting devuelve ok=true y status=waiting, llama
enter_waiting».

**Paso 2. La función de Kapso pega al gateway.** `agenda-psi-mark-inbound-waiting` hace `POST` a
`/workflow/waiting` de `agent_tool_gateway` y sólo devuelve `ok` si la respuesta trae
`payload.status === 'waiting'`.

**Paso 3. La ruta está viva.** Leído del gateway desplegado, versión 35, `ACTIVE`, archivo
`functions/agent_tool_gateway/handler.ts`:

```ts
if (path === '/workflow/waiting') {
  const input = parseCorrelatedInboundInput(raw);
  if (input === null) return safe(400, { ok: false, error: 'BAD_REQUEST' });
  try {
    const waiting = await deps.markInboundWaiting(input);
    return waiting
      ? safe(200, { ok: true, status: 'waiting' })
      : safe(409, { ok: false, error: 'WAITING_REJECTED' });
  } catch {
    return safe(503, { ok: false, error: 'SERVICE_UNAVAILABLE' });
  }
}
```

Es una de las **tres** rutas que contestan de las 27 declaradas. Y `index.ts` la cablea a la RPC:

```ts
async markInboundWaiting(args) {
  const { data, error } = await supabase.rpc('agent_mark_inbound_waiting', {
    p_provider_message_id: args.providerMessageId,
    p_kapso_execution_id: args.executionId,
  }).abortSignal(AbortSignal.timeout(2_000));
  ...
}
```

**Paso 4. La base marca el estado.** `public.agent_mark_inbound_waiting`, leída del cuerpo desplegado:

```sql
UPDATE public.agent_turns AS turn_row
   SET status = 'waiting_external',
       last_activity_at = v_now,
       expires_at = LEAST(v_session.expires_at, v_now + interval '30 minutes'),
       updated_at = v_now
 WHERE turn_row.id = v_turn.id;
```

**Y antes de marcar, se sincroniza.** Éste es el cerrojo que hace que el mecanismo valga:

```sql
IF v_turn.status <> 'active'
   OR EXISTS (
     SELECT 1 FROM public.agent_tool_calls AS tool_row
      WHERE tool_row.turn_id = v_turn.id
        AND tool_row.outcome IS NULL
   ) THEN
  RETURN false;
END IF;
```

**El turno no se puede dormir con una herramienta a medio terminar.** Por eso la tabla
`agent_tool_calls` es parte del mecanismo aunque no lo parezca, y por eso sale de «SE BORRA».

**Paso 5.** Sólo con `ok=true` el agente llama la herramienta nativa `enter_waiting` de Kapso, y la
ejecución queda en `waiting`.

## 5.2 Despertar — verificado extremo a extremo

**Paso 1.** Llega el siguiente mensaje. El webhook `741b3e51` de Kapso lo entrega a
`kapso_inbound_webhook`.

**Paso 2.** `agent_register_inbound_context` decide la admisión y devuelve `status: 'resumed'`.

**Paso 3.** El despachador pide el identificador de la ejecución dormida:

```ts
const resolved = await deps.resolveExecutionId(
  input.inbound.p_provider_message_id, turnId,
);
if (resolved === null) fail('WORKFLOW_TARGET_MISSING');
```

que es la RPC `agent_get_inbound_resume_execution` — **la que el frente de Supabase declara
huérfana**.

**Paso 4.** Esa RPC exige, literalmente, que el turno esté dormido:

```sql
AND inbound.admission_status = 'resumed'
AND inbound.kapso_execution_id IS NULL
AND turn_row.status = 'waiting_external'
AND turn_row.kapso_execution_id IS NOT NULL
```

Más siete condiciones de identidad (teléfono, número destino, conversación, paciente, profesional),
dos de vigencia y una que descarta mensajes viejos. Devuelve `turn_row.kapso_execution_id`.

**Paso 5.** El despachador reanuda:

```ts
url = `${KAPSO_API_BASE}/workflow_executions/${encodeURIComponent(executionId)}/resume`;
body = requestBody({ message: input.whatsapp.message, variables: vars });
expectedStatus = 200;
```

**Paso 6.** `agent_bind_inbound_execution` ata el mensaje nuevo a la ejecución. **Es la única función
de toda la base que escribe `agent_turns.kapso_execution_id`** — comprobado buscando
`SET kapso_execution_id` en `pg_get_functiondef` de todo `public` y `private`: una sola fila. Sin
ella, el paso 4 nunca encuentra nada, porque exige `kapso_execution_id IS NOT NULL`.

## 5.3 Las trece piezas, con todas sus letras

**Ninguna de estas trece se borra.**

| # | Pieza | Dónde vive | Papel |
|---|---|---|---|
| 1 | `enter_waiting` | Kapso, `enabled_default_tools` del nodo de agente | Duerme la ejecución. **No se puede desactivar**: es requerida por defecto en workflows creados después del 5 de febrero de 2026 |
| 2 | Function Tool `sync_waiting` | Kapso, nodo de agente | La puerta para sincronizar antes de dormir |
| 3 | Función `agenda-psi-mark-inbound-waiting` | Kapso | Lo que ejecuta `sync_waiting`. **0 invocaciones en 30 días: no ejercida, no muerta** |
| 4 | Ruta `/workflow/waiting` | Borde `agent_tool_gateway` v35 | Una de las tres vivas de 27 |
| 5 | Borde `agent_tool_gateway` | Supabase | El contenedor de la ruta 4. Se **reescribe**, no se borra |
| 6 | `public.agent_mark_inbound_waiting` | Base | Pone `status = 'waiting_external'` |
| 7 | `public.agent_turns` | Base | **Aquí vive el estado de espera.** `agent_turns_status_check` lo admite entre los ocho valores: `admitted, active, waiting_external, completing, completed, rejected, failed, expired` |
| 8 | `public.agent_tool_calls` | Base | El cerrojo: no deja dormir con `outcome IS NULL` |
| 9 | `public.agent_sessions` | Base | Vigencia e identidad; el turno cuelga de ella |
| 10 | `public.whatsapp_inbound_messages` | Base | La llave de las dos mitades (`message_sid` + `agent_turn_id`) y el `admission_status = 'resumed'` |
| 11 | `public.agent_get_inbound_resume_execution` | Base | **Despierta.** La que el frente llama huérfana |
| 12 | `public.agent_bind_inbound_execution` | Base | Único escritor de `agent_turns.kapso_execution_id` |
| 13 | `public.agent_register_inbound_context` + `private.agent_runtime_targets` + borde `kapso_inbound_webhook` + webhook `741b3e51` | Base y Kapso | La entrada: produce `resumed`, lee el interruptor por número, y sella el reloj de 24 h |

De las trece, **cinco estaban en «SE BORRA»** en la versión vigente del frente de Supabase: las
número 5, 6, 8, 11 y 12. Las otras ocho ya se habían salvado por el hilo del reloj de 24 h.

## 5.4 El dato que hay que decir en voz alta

**El mecanismo nunca se ha ejercido en producción.** Comprobado hoy:

| Medida | Valor |
|---|---|
| Turnos que llegaron a `waiting_external` | **0** de 6 |
| Mensajes con `admission_status = 'resumed'` | **0** de 10 |
| Invocaciones de `agenda-psi-mark-inbound-waiting` en 30 días | **0** |

**Eso no lo vuelve borrable: lo vuelve no ejercido.** Es la misma vara con la que el frente de Kapso
manda el sandbox a «se queda» y con la que movió `agenda-psi-flow-agendar`. Y la explicación está en
el libro mayor: el agente hizo 6 llamadas en toda su historia, tres de `get_capabilities` y tres de
`complete_inbound`. **Nunca llegó a hacer una pregunta.**

La consecuencia práctica: **la primera vez que el agente nuevo intente dormirse, será la primera vez
que este camino corra de verdad.** Hay que probarlo, no darlo por bueno. Es una razón más para
conservar el sandbox (decisión 12).

## 5.5 Lo demás que parece del agente y no lo es

| Qué | Por qué se queda |
|---|---|
| `kapso_status_callback` y su webhook `88980a1c` | Lleva «kapso» y `verify_jwt=false` igual que las del agente, pero llama `record_outbox_provider_status` y anota entregas de la cola del dominio. |
| `enviar-whatsapp` | Manda WhatsApp, pero sólo plantillas de `whatsapp_outbox`, disparado por cron cada minuto. Cero referencias al agente. |
| El inicio de sesión por WhatsApp | Lo manda Supabase Auth, no Kapso. Apagarlo deja a todos fuera de la app. |
| `comprobantes` y `payment_proofs` | Nacieron en `20260821_mensajeria_whatsapp.sql`, antes del agente. **15 de las 18 funciones que tocan `payment_proofs` son RPC que la app llama todos los días.** Ninguna `agent_*` está en esa lista. |
| `whatsapp_links.kapso_contact_id` | Columna con «kapso» en el nombre, dentro de una tabla del dominio que escriben dos triggers de la app. |
| El esquema `private` | 23 de sus 27 funciones son del dominio. Se borran dos. |
| `appointment_confirmation_source`, `actor_type`, `change_policy_result` | Suenan a agente. Son enums de `postgres` que usan las funciones del profesional. |
| `patient-resources` siendo público | Es público a propósito: los recursos se le mandan al paciente por WhatsApp y el mensaje necesita una URL directa. |

---

# 6. EL RIESGO DE CADA BORRADO

Qué pasa si se borra y estábamos equivocados, y si se puede deshacer.

## 6.1 Los siete renglones de «SE BORRA»

| # | Qué | Si estábamos equivocados, pasa esto | ¿Se deshace? | Riesgo |
|---|---|---|---|---|
| 1 | `private.agent_issue_option_handle` | Una función del agente que emitiera un identificador de opción fallaría con «no existe». No hay ninguna: es la única emisora y su tabla tiene 0 filas. | **Sí.** Está en la migración `20260823235236_agent_whatsapp_foundation`; se vuelve a crear con su texto. | **Mínimo** |
| 2 | `private.agent_resolve_option_token` | Igual. Nadie la llama ni la nombra. | **Sí**, misma migración. | **Mínimo** |
| 3 | `public.agent_option_tokens` | Se perderían los identificadores de opción emitidos. Hay **0**, y nunca hubo. | **Sí** para la estructura. Los datos no existen. | **Mínimo** |
| 4 | `private.agent_token_key_registry` | Se perderían las llaves de firma de esos identificadores. Hay **0**. | **Sí**, misma migración. | **Mínimo** |
| 5 | Plantilla `_no_url` en Meta | Si el nombre bueno fuera éste, el recordatorio de una hora en línea dejaría de salir. No lo es: la base la rechaza y `_simple` llegó a `sent` con `provider_message_id` no nulo. | **Sí, pero lento.** Volver a darla de alta en Meta y esperar aprobación (días). | **Bajo** |
| 6 | Plantilla `_no_link` en Meta | Igual. | **Sí, lento**, misma vía. | **Bajo** |
| 7 | `kapso/flows/agenda-psi-citas.flow.json` | Se perdería el borrador de un formulario de dos pantallas que ninguna función desplegada sirve. | **Hoy NO: 0 commits y `kapso pull` no recupera Flows.** Con el `git add` de §2.2 paso 0, **sí**. | **Bajo con el paso 0. Irreversible sin él** |

**Regla que sale de la tabla:** hacer el `git add` de los cinco archivos sueltos antes de borrar nada
convierte el único borrado irreversible de la lista en uno reversible. Cuesta un minuto.

## 6.2 Lo que habría pasado siguiendo la lista original — para que no se repita

No es una propuesta: es el costo de los renglones que el cruce movió. Se pone porque el mismo error se
puede volver a cometer al redactar el guion de borrado.

| Si se hubiera borrado | Qué se rompe | ¿Se deshace? |
|---|---|---|
| `agent_get_inbound_resume_execution` | **El agente deja de despertar.** El webhook falla con `WORKFLOW_TARGET_MISSING` en cada mensaje de una conversación dormida. Cada respuesta de la paciente arranca una conversación nueva desde cero. | Sí, la función está en migración — pero el síntoma es silencioso: el webhook devuelve error y nadie mira. |
| `agent_bind_inbound_execution` | **Igual, pero peor:** deja de escribirse `agent_turns.kapso_execution_id`, así que despertar nunca encuentra a quién despertar aunque la RPC exista. | Sí, migración. |
| `agent_mark_inbound_waiting` | **El agente deja de dormirse.** `sync_waiting` devuelve error, el prompt prohíbe llamar `enter_waiting` sin `ok=true`, y el turno se cierra en vez de esperar. | Sí, migración. |
| Borde `agent_tool_gateway` | Se va la ruta `/workflow/waiting`. Mismo efecto que borrar `agent_mark_inbound_waiting`, y además se lleva `/tools/capabilities`, que el workflow activo llama al inicio de cada gestión. | Sí, se redespliega. |
| `agent_tool_calls` | Desaparece el cerrojo: el turno se podría dormir con una herramienta a medio terminar. Ése es el modo de fallo terminal que la auditoría documentó — un `tool_use` sin `tool_result` deja la ejecución en `failed`, que es irrecuperable. | Estructura sí, datos no. |
| Revocar `SELECT` sobre `appointments`, `payments`, `professional_profiles`, `professionals` | **`agent_get_capabilities` revienta en caliente**, sin que se haya borrado ningún objeto. Es la primera llamada de cada gestión. | Sí, se vuelve a otorgar — pero no hay objeto borrado que delate la causa. |
| Borrar las 16 columnas de `whatsapp_inbound_messages` | Seis de ellas las leen las dos mitades. Se rompen dormir y despertar por otra puerta. | Estructura sí, datos no. |
| `agent_turns`, `agent_sessions`, `agent_runtime_targets`, `kapso_inbound_webhook`, `agent_register_inbound_context`, el rol | Ya blindados por el frente de Supabase en su §2.7 por el reloj de 24 h. El cruce sólo añade que también son el mecanismo. | — |

## 6.3 Los tres borrados que no están en ninguna lista y hay que decir en voz alta

Ninguno es un objeto de base que alguien vaya a tirar por descuido. Son ajustes que se tocan «de
pasada» y se llevan la app entera.

| Qué | Qué pasa | ¿Se deshace? |
|---|---|---|
| Apagar el proveedor de WhatsApp de **Supabase Auth** creyendo que es del agente | **Nadie puede entrar a la app.** Es el único modo de iniciar sesión. | Sí, es un ajuste del panel — pero mientras tanto la app está caída para todos. |
| Desactivar el **workflow** de Kapso como paso intermedio | Cada mensaje entrante muere en el borde. Si hace falta una pausa, la palanca barata es el interruptor `AGENT_INBOUND_ENABLED` de la función de borde, que devuelve `{ ok: true, status: 'disabled' }` sin romper el webhook. | Sí, se reactiva. |
| Hacer `kapso push` con una definición parcial del workflow | **`kapso push` trata nodos y aristas como conjuntos de reemplazo.** Mandar un nodo borra los demás. | Sí si se hizo `kapso pull` antes; si no, se pierde la definición. |

## 6.4 El orden

**Supabase.**
1. `private.agent_issue_option_handle` y `private.agent_resolve_option_token` (nadie las llama; van
   primero para que el paso 2 quede sin lectores).
2. `public.agent_option_tokens` (antes que el paso 3: su llave hacia el registro es `RESTRICT`).
3. `private.agent_token_key_registry`.
4. `REVOKE SELECT ON public.services FROM agenda_psi_agent_owner`. **Ninguna otra revocación.**

**Kapso y Meta.**
0. `git add` de los cinco archivos sueltos de `kapso/`.
1. Borrar las dos plantillas en el administrador de Meta. No hay nada en la base ni en Kapso que las
   nombre.
2. Borrar `kapso/flows/agenda-psi-citas.flow.json`.
3. **Parar aquí.** Todo lo demás depende de abrir el tablero de Kapso y leer adónde apunta cada Flow
   (decisión 10).

**Nunca:** desactivar el workflow, tocar el proveedor de WhatsApp de Auth, ni borrar nada de las
trece piezas de §5.

---

## RESUMEN DE CIFRAS

| Lista | Cuántos |
|---|---|
| **SE BORRA** | **7** — 4 en Supabase (2 funciones huérfanas, 2 tablas con 0 filas) y 3 entre Kapso y Meta (2 plantillas, 1 archivo local) |
| **SE QUEDA** | Las 72 RPC de la app y sus 3 dependencias internas; 6 funciones de borde; 7 cron; 9 triggers; 33 enums; 4 buckets; 16 plantillas; el esquema `private` con 25 de sus 27 funciones; **y las 13 piezas del mecanismo de dormir y despertar** |
| **SE REVISA CON EL DUEÑO** | **13 decisiones** |
| **Movidos por el cruce** | **12 de los 16 renglones vigentes de «SE BORRA» de Supabase**: 5 a «se queda» y 7 a «se revisa». Más una recomendación de revocar permisos que se anula (§1.5) y una opción de §3.2 que se descarta (§1.6) |
