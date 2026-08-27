# Lo que usa la app de Flutter — lista de referencia para cruzar

Frente: qué toca la app. Sirve para que el frente de Supabase no borre algo vivo.
**Todo lo que aparece aquí es "se queda".**

Fuentes: **todo** el proyecto en
`/Users/gaeljimenez/Documents/Agenda Psi Version 2 /.claude/worktrees/kapso-audit-ia-agent-afd65a/flutter_application_1/`
— `lib/` (137 archivos `.dart`), `test/` (103), `supabase/functions/`, `android/`, `ios/`,
`assets/`, `pubspec.yaml` (no existe `web/` ni `integration_test/`) — y la base desplegada
`ssyzfeadyrczlzjbvxyl` (solo lectura, solo `SELECT`). El código manda sobre la documentación.

## Cómo se barrió (para que se pueda repetir)

Toda la superficie de red de la app pasa por cinco puertas y ninguna más. Conteo exacto de
ocurrencias en `lib/`:

```
$ grep -rhoE "supabase\.[a-zA-Z]+" lib/ --include="*.dart" | sort | uniq -c
   7 supabase.auth
   1 supabase.functions
  30 supabase.rpc
   1 supabase.removeChannel
   2 supabase.storage
```

Más `supabase.channel(...)` (una sola vez, en `notification_data.dart:38`, partido en dos
líneas por el formateador, por eso no sale en ese conteo).

- **No hay una sola llamada PostgREST directa desde Dart.** `grep -rn "\.select(\|\.insert(\|\.upsert(\|\.delete()"`
  sobre `lib/` no devuelve nada. Los cuatro `.from(` que existen en `lib/` son dos de Storage
  (`resource_upload.dart:194`, `profile_media_upload.dart:184`) y dos de `TZDateTime.from`
  (`notification_models.dart:270,280`), que no es Supabase.
  **Matiz obligatorio:** el código del propio proyecto Flutter **sí** hace una lectura PostgREST
  directa, pero del lado servidor: `flutter_application_1/supabase/functions/notificar-push/index.ts:154-160`
  pega a `/rest/v1/professionals?id=eq.<id>&select=timezone,auth_user_id` con `service_role`.
  Detalle en las secciones 2 y 8.8.
- **La palabra `agent` no aparece en `lib/`.** `grep -rn "agent" lib/ --include="*.dart" -i` → vacío.
- **La palabra `kapso` no aparece ni en `lib/` ni en `test/`.** Mismo grep → vacío.
  Que no aparezca **no** quiere decir que la app no dependa de objetos con ese nombre dentro:
  la tabla `whatsapp_links`, de la que dependen tres RPC de la app, tiene una columna
  `kapso_contact_id`. Ver 8.7.

### Segunda pasada — barrido exhaustivo (no solo `lib/`)

El barrido de arriba encuentra las llamadas que siguen el patrón obvio. Para descartar nombres
construidos, constantes en archivos aparte o mapas de nombres se hizo una segunda pasada que no
parte del patrón sino del **conjunto de nombres de la base**:

```bash
# todo literal snake_case de lib/ Y test/, comillas simples y dobles
grep -rhoE "'[a-z][a-z0-9]*(_[a-z0-9]+)+'" lib test --include="*.dart" | tr -d "'"  > /tmp/lit.txt
grep -rhoE '"[a-z][a-z0-9]*(_[a-z0-9]+)+"' lib test --include="*.dart" | tr -d '"' >> /tmp/lit.txt
sort -u /tmp/lit.txt > /tmp/literales.txt   # 469 literales
# cruzar contra los nombres reales de public en la base desplegada
comm -12 /tmp/literales.txt /tmp/funciones_public.txt   # → exactamente las 72
```

Resultado: **72, ni una más ni una menos.** Ningún literal de `test/` nombra una función que
`lib/` no llame, y ninguna función de `public` aparece en Dart fuera de esas 72.

- **No hay nombres construidos.** `grep -rnE "rpc\(\s*[^'\"]" lib` solo devuelve los reenvíos de
  los ayudantes (`supabase.rpc(functionName)`); no hay interpolación (`'get_$algo'`) ni
  concatenación en ningún sitio de llamada.
- **No hay archivo de constantes con nombres de RPC.** `lib/data/` tiene solo dos archivos:
  `rpc_call.dart` (un `typedef` de firma, sin nombres) y `supabase_client.dart` (el getter del
  cliente).
- **`android/`, `ios/`, `assets/`, `pubspec.yaml`: nada.** No hay deep links ni esquemas de URL
  (`AndroidManifest.xml` solo trae el `intent-filter` de arranque; `Info.plist` no declara
  `CFBundleURLTypes`), no hay URL ni llave de Supabase incrustada en config nativa, y el único
  JSON del proyecto es `test/fixtures/app_rpc_signatures.json` (ver abajo). **No existe `web/`.**
- **`google_places_flutter`** usa `GOOGLE_PLACES_API_KEY` del `.env`
  (`create_account_page.dart:93`, `edit_my_profile_page.dart:56`). No toca Supabase, pero es la
  cuarta llave del `.env` junto a `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y `ONESIGNAL_APP_ID`.

---

## 1. RPC que llama la app — 72 nombres

**Verificado dos veces: son 72.** El conteo resistió el barrido exhaustivo de la sección anterior
(cruce de los 469 literales snake_case de `lib/` **y** `test/` contra los nombres de `public` en
la base desplegada).

Las 14 capas de datos definen cada una un ayudante privado `_callXRpc(functionName, {params})`
que solo reenvía a `supabase.rpc`. El nombre viaja siempre como cadena literal en el sitio de
llamada, así que la lista es literal, no inferida.

**Tres sitios de llamada NO siguen ese patrón.** Importan porque un grep ingenuo del ayudante los
pierde:

| Sitio | Patrón | Por qué se escapa |
|---|---|---|
| `professional_data.dart:118` (`get_shell_context`) y `:138` (`create_professional`) | `supabase.rpc('nombre')` directo, sin ayudante | No hay `_callProfessionalRpc` en medio |
| `professional_data.dart:156` (`get_professional_status`) | `client.rpc('get_professional_status')` sobre un `SupabaseClient` **inyectado**, no sobre el `supabase` global | El grep de `supabase.rpc` no lo ve |
| `resource_data.dart:97` (`start_professional_resource_upload`) y `:105` (`upload_professional_resource`) | `final call = rpcCall ?? _callResourceRpc;` y luego `call('nombre', …)` — el ayudante pasa por una variable local | Ni `supabase.rpc` ni `_callResourceRpc` aparecen en el sitio de llamada |

### La reja que congela estas 72: `rpc_parity_test.dart`

`test/rpc_parity_test.dart` recorre `lib/` con un parser de Dart propio, extrae cada sitio de
llamada de RPC **con sus nombres de parámetro `p_*`** y los compara contra el fixture
`test/fixtures/app_rpc_signatures.json`. Si un nombre sobra, falta o si un parámetro cambia de
nombre, la prueba falla.

**Para el frente de Supabase esto es una red de seguridad extra y un archivo que hay que
mantener:** renombrar un parámetro `p_*` de cualquiera de estas RPC rompe la suite de la app
aunque la app siga funcionando. `test/fixtures/app_rpc_signatures.json` es, de hecho, la copia
declarada de las firmas canónicas.

**Hueco conocido de esa reja:** el fixture tiene **71 claves, no 72**. Falta
`start_professional_resource_upload`, y es por el tercer patrón de la tabla de arriba: el parser
busca `.rpc` o `algoRpc)` seguido de `(`, y `call('start_professional_resource_upload', …)` no
encaja con ninguno de los dos. Por el mismo motivo el segundo sitio de
`upload_professional_resource` (`resource_data.dart:105`) tampoco se ve, que es lo que evita que
salte la aserción de "aparece más de una vez". Es decir: **`start_professional_resource_upload`
es la única de las 72 sin cobertura de la reja.** Se queda igual; solo hay que saber que ahí la
prueba no avisa.

**Comprobación contra la base desplegada:** los 72 existen en `public` y los 72 tienen
`EXECUTE` para el rol `authenticated`. La consulta que lo verificó devolvió cero renglones
de faltantes:

```sql
-- devolvió []  (ninguna falta, ninguna sin permiso para authenticated)
with app(name) as (select unnest(array[ ...los 72... ]))
select a.name from app a
where not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname=a.name)
   or not coalesce((select bool_or(has_function_privilege('authenticated',p.oid,'EXECUTE'))
                    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                    where n.nspname='public' and p.proname=a.name), false);
```

Orden alfabético. Todas las rutas son relativas a `flutter_application_1/`.

| # | RPC | Archivo : línea |
|---|-----|-----------------|
| 1 | `add_office_connection` | `lib/pages/office/office_data.dart:34` |
| 2 | `assign_resources_to_appointment` | `lib/pages/resources/resource_data.dart:153` |
| 3 | `cancel_appointment` | `lib/pages/appointments/appointment_data.dart:156` |
| 4 | `create_appointment` | `lib/pages/appointments/appointment_data.dart:70` |
| 5 | `create_blocked_slot` | `lib/pages/schedules/schedule_data.dart:62` |
| 6 | `create_patient` | `lib/pages/patients/patient_data.dart:185` |
| 7 | `create_professional` | `lib/pages/profile/professional_data.dart:139` |
| 8 | `create_recurrence_series` | `lib/pages/appointments/appointment_data.dart:245` |
| 9 | `create_service` | `lib/pages/services/service_data.dart:42` |
| 10 | `create_session_note` | `lib/pages/notes/note_data.dart:40` |
| 11 | `credit_appointment_payment` | `lib/pages/billing/billing_data.dart:46` |
| 12 | `current_professional_id` | `lib/pages/profile/profile_media_upload.dart:91` |
| 13 | `deactivate_patient` | `lib/pages/patients/patient_data.dart:112` |
| 14 | `delete_blocked_slot` | `lib/pages/schedules/schedule_data.dart:85` |
| 15 | `delete_office_connection` | `lib/pages/office/office_data.dart:70` |
| 16 | `delete_patient` | `lib/pages/patients/patient_data.dart:138` |
| 17 | `delete_professional_resource` | `lib/pages/resources/resource_data.dart:129` |
| 18 | `delete_recurrence_series` | `lib/pages/patients/patient_data.dart:157` |
| 19 | `delete_service` | `lib/pages/services/service_data.dart:124` |
| 20 | `delete_session_note` | `lib/pages/notes/note_data.dart:87` |
| 21 | `edit_appointment` | `lib/pages/appointments/appointment_data.dart:92` |
| 22 | `get_appointment_detail` | `lib/pages/appointments/appointment_data.dart:20` |
| 23 | `get_appointment_policies` | `lib/pages/policies/policy_data.dart:13` |
| 24 | `get_appointments_by_day` | `lib/pages/dashboard/dashboard_data.dart:38` |
| 25 | `get_billing_day` | `lib/pages/billing/billing_data.dart:32` |
| 26 | `get_billing_month` | `lib/pages/billing/billing_data.dart:24` |
| 27 | `get_days_with_appointments` | `lib/pages/dashboard/dashboard_data.dart:18` |
| 28 | `get_internal_availability` | `lib/pages/schedules/schedule_data.dart:38` |
| 29 | `get_my_profile` | `lib/pages/profile/marketplace_profile_data.dart:27` |
| 30 | `get_my_public_profile` | `lib/pages/profile/marketplace_profile_data.dart:36` |
| 31 | `get_next_scheduled_appointment` | `lib/pages/appointments/appointment_data.dart:34` |
| 32 | `get_office_connection_state` | `lib/pages/office/office_data.dart:20` |
| 33 | `get_onboarding_state` | `lib/pages/dashboard/dashboard_data.dart:53` |
| 34 | `get_patient` | `lib/pages/patients/patient_data.dart:53` |
| 35 | `get_patient_detail` | `lib/pages/patients/patient_data.dart:65` |
| 36 | `get_patient_pending_payments` | `lib/pages/appointments/appointment_data.dart:50` |
| 37 | `get_professional_info` | `lib/pages/profile/professional_data.dart:44` |
| 38 | `get_professional_status` | `lib/pages/profile/professional_data.dart:155` |
| 39 | `get_professional_today` | `lib/pages/profile/professional_data.dart:21` |
| 40 | `get_service_delete_impact` | `lib/pages/services/service_data.dart:107` |
| 41 | `get_services_for_patient` | `lib/pages/patients/patient_data.dart:169` |
| 42 | `get_session_note` | `lib/pages/notes/note_data.dart:18` |
| 43 | `get_shell_context` | `lib/pages/profile/professional_data.dart:118` |
| 44 | `get_special_schedules` | `lib/pages/schedules/schedule_data.dart:117` |
| 45 | `get_weekly_schedules` | `lib/pages/schedules/schedule_data.dart:94` |
| 46 | `has_unread_notifications` | `lib/pages/notifications/notification_data.dart:18` |
| 47 | `list_appointment_resources` | `lib/pages/resources/resource_data.dart:33` |
| 48 | `list_appointments` | `lib/pages/patients/patient_data.dart:77` |
| 49 | `list_catalog_options` | `lib/pages/profile/marketplace_profile_data.dart:48` |
| 50 | `list_notifications` | `lib/pages/notifications/notification_data.dart:12` |
| 51 | `list_patients` | `lib/pages/patients/patient_data.dart:23` |
| 52 | `list_professional_resources` | `lib/pages/resources/resource_data.dart:17` |
| 53 | `list_services` | `lib/pages/services/service_data.dart:15` |
| 54 | `mark_appointment_attended` | `lib/pages/appointments/appointment_data.dart:179` |
| 55 | `mark_appointment_no_show` | `lib/pages/appointments/appointment_data.dart:209` |
| 56 | `reactivate_patient` | `lib/pages/patients/patient_data.dart:121` |
| 57 | `reject_office_connection` | `lib/pages/office/office_data.dart:54` |
| 58 | `request_account_deletion` | `lib/pages/profile/professional_data.dart:55` |
| 59 | `request_appointment_payment_proof` | `lib/pages/billing/billing_data.dart:63` |
| 60 | `reschedule_appointment` | `lib/pages/appointments/appointment_data.dart:123` |
| 61 | `save_profile_draft` | `lib/pages/profile/marketplace_profile_data.dart:82` |
| 62 | `save_special_schedules` | `lib/pages/schedules/schedule_data.dart:128` |
| 63 | `save_weekly_schedules` | `lib/pages/schedules/schedule_data.dart:107` |
| 64 | `start_professional_resource_upload` | `lib/pages/resources/resource_data.dart:99` |
| 65 | `submit_profile_for_review` | `lib/pages/profile/marketplace_profile_data.dart:138` |
| 66 | `update_appointment_policies` | `lib/pages/policies/policy_data.dart:55` |
| 67 | `update_patient` | `lib/pages/patients/patient_data.dart:203` |
| 68 | `update_professional_info` | `lib/pages/profile/professional_data.dart:87` |
| 69 | `update_service` | `lib/pages/services/service_data.dart:79` |
| 70 | `update_session_note` | `lib/pages/notes/note_data.dart:68` |
| 71 | `upload_professional_resource` | `lib/pages/resources/resource_data.dart:61` y `:105` |
| 72 | `waive_appointment_payment` | `lib/pages/billing/billing_data.dart:76` |

### Las mismas 72, agrupadas por capa de datos

| Archivo | RPC que llama |
|---|---|
| `lib/pages/appointments/appointment_data.dart` (10) | `get_appointment_detail`, `get_next_scheduled_appointment`, `get_patient_pending_payments`, `create_appointment`, `edit_appointment`, `reschedule_appointment`, `cancel_appointment`, `mark_appointment_attended`, `mark_appointment_no_show`, `create_recurrence_series` |
| `lib/pages/billing/billing_data.dart` (5) | `get_billing_month`, `get_billing_day`, `credit_appointment_payment`, `request_appointment_payment_proof`, `waive_appointment_payment` |
| `lib/pages/dashboard/dashboard_data.dart` (3) | `get_days_with_appointments`, `get_appointments_by_day`, `get_onboarding_state` |
| `lib/pages/notes/note_data.dart` (4) | `get_session_note`, `create_session_note`, `update_session_note`, `delete_session_note` |
| `lib/pages/notifications/notification_data.dart` (2) | `list_notifications`, `has_unread_notifications` |
| `lib/pages/office/office_data.dart` (4) | `get_office_connection_state`, `add_office_connection`, `reject_office_connection`, `delete_office_connection` |
| `lib/pages/patients/patient_data.dart` (11) | `list_patients`, `get_patient`, `get_patient_detail`, `list_appointments`, `deactivate_patient`, `reactivate_patient`, `delete_patient`, `delete_recurrence_series`, `get_services_for_patient`, `create_patient`, `update_patient` |
| `lib/pages/policies/policy_data.dart` (2) | `get_appointment_policies`, `update_appointment_policies` |
| `lib/pages/profile/marketplace_profile_data.dart` (5) | `get_my_profile`, `get_my_public_profile`, `list_catalog_options`, `save_profile_draft`, `submit_profile_for_review` |
| `lib/pages/profile/professional_data.dart` (7) | `get_professional_today`, `get_professional_info`, `request_account_deletion`, `update_professional_info`, `get_shell_context`, `create_professional`, `get_professional_status` |
| `lib/pages/profile/profile_media_upload.dart` (1) | `current_professional_id` |
| `lib/pages/resources/resource_data.dart` (6) | `list_professional_resources`, `list_appointment_resources`, `upload_professional_resource`, `start_professional_resource_upload`, `delete_professional_resource`, `assign_resources_to_appointment` |
| `lib/pages/schedules/schedule_data.dart` (7) | `get_internal_availability`, `create_blocked_slot`, `delete_blocked_slot`, `get_weekly_schedules`, `save_weekly_schedules`, `get_special_schedules`, `save_special_schedules` |
| `lib/pages/services/service_data.dart` (5) | `list_services`, `create_service`, `update_service`, `get_service_delete_impact`, `delete_service` |

### Función interna de la que dependen esas 72 (no la llama la app, la llama la base)

`_get_internal_availability_core(...)` — sin `EXECUTE` para nadie (`anon`, `authenticated` y
`service_role` en `false`). Es el motor de `get_internal_availability`, que sí llama la app.
Comprobado en la base desplegada:

```sql
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosrc ilike '%_get_internal_availability_core%'
  and p.proname <> '_get_internal_availability_core';
-- → [{"proname":"get_internal_availability"}]
```

Ninguna función del agente la usa. **Se queda: borrarla rompe Crear cita, Editar cita,
Reprogramar y Citas subsecuentes.**

---

## 2. Tablas que lee o escribe directo

**Desde Dart, ninguna por PostgREST.** No hay `.from('tabla')`, `.select(`, `.insert(`,
`.update(` ni `.delete()` en todo `lib/`. Los `.from(` que existen son dos de Storage
(`resource_upload.dart:194` y `profile_media_upload.dart:184`), que reciben un nombre de bucket
y no de tabla, y dos de `tz.TZDateTime.from` (`notification_models.dart:270,280`), que no tienen
nada que ver con Supabase. **La afirmación resiste: el cliente Flutter nunca habla PostgREST.**

**Pero el proyecto Flutter sí lee una tabla directo, desde su Edge Function.**
`flutter_application_1/supabase/functions/notificar-push/index.ts:154-160` —código que vive
dentro de este repositorio y que se despliega con la app— hace:

```
GET {SUPABASE_URL}/rest/v1/professionals?id=eq.<professional_id>&select=timezone,auth_user_id
    con apikey y Authorization = SUPABASE_SERVICE_ROLE_KEY
```

Es la única lectura directa de tabla de todo el frente de la app, y no está en `lib/`. **Se
quedan `public.professionals` y sus dos columnas `timezone` y `auth_user_id`**: sin `timezone`
la push imprime la hora en otro huso; sin `auth_user_id` el aviso se manda a un alias que
OneSignal no conoce y **el teléfono no suena**. Detalle en 8.8.

Tablas con las que la app habla directamente, entonces, son **dos**:

| Tabla | Cómo | Dónde |
|---|---|---|
| `public.notifications` | Realtime (`INSERT`), como cliente autenticado | `lib/pages/notifications/notification_data.dart:34-48` — sección 5 |
| `public.professionals` | PostgREST `SELECT timezone, auth_user_id`, como `service_role` | `supabase/functions/notificar-push/index.ts:154-160` |

La base lo confirma para el cliente: `notifications` es la **única** tabla de `public` con
`SELECT` otorgado al rol `authenticated`. La lectura de `professionals` de arriba no la
contradice, porque va con `service_role`.

```sql
-- comprobado sobre notifications, catalog_options, professional_profiles,
-- reviews, patients y appointments: solo notifications tiene grant a authenticated
notifications         → authenticated:SELECT, service_role:(todo)
catalog_options       → service_role:(todo)
professional_profiles → service_role:(todo)
reviews               → service_role:(todo)
patients              → service_role:(todo)
appointments          → service_role:(todo)
```

---

## 3. Edge Functions que invoca

Una sola. `grep -rn "functions.invoke" lib/` da un único resultado.

| Edge Function | Dónde | Cómo |
|---|---|---|
| `get-payment-proof-url` | `lib/pages/billing/billing_data.dart:90` (invocación real en `:100`) | `supabase.functions.invoke('get-payment-proof-url', body: {'appointment_id': ...})` |

Cadena completa de esa pantalla (Ver comprobante), verificada extremo a extremo:

1. La app invoca `get-payment-proof-url` (desplegada y `ACTIVE`, `verify_jwt: true`).
2. Esa función llama con `service_role` la RPC `get_payment_proof_signing_receipt(p_auth_user_id, p_appointment_id)`
   — evidencia: `referencias/database_pseudocodigo/supabase/functions/get-payment-proof-url/index.ts`.
3. La RPC existe en la base con `EXECUTE` solo para `service_role`, y su cuerpo lee
   `payment_proofs` (`prosrc ilike '%payment_proofs%'`).
4. Con lo que devuelve, la función firma una URL temporal (300 s) del bucket privado
   `comprobantes`.

**Se quedan las cuatro piezas:** la Edge Function `get-payment-proof-url`, la RPC
`get_payment_proof_signing_receipt`, la tabla `payment_proofs` y el bucket `comprobantes`.

### Edge Functions que NO invoca la app pero son de la app

- `notificar-push` — vive dentro del propio proyecto Flutter, en
  `flutter_application_1/supabase/functions/notificar-push/index.ts`. La dispara el trigger
  `notificar_push_al_insertar` cuando entra una fila a `notifications`; manda la push a
  OneSignal con la llave REST como secreto de la función. El encabezado del archivo lo dice:
  *«Manda a OneSignal la push de una fila recién insertada en `notifications`»*.
  La app solo lleva el App ID público (`lib/platform/push_notifications.dart:152`,
  `dotenv.maybeGet('ONESIGNAL_APP_ID')`). **Se queda.**

  Cadena completa, verificada en la base desplegada — son **cinco** piezas, no una:

  1. `INSERT` en `public.notifications`.
  2. Trigger `notificar_push` (`AFTER INSERT ... FOR EACH ROW`) → `notificar_push_al_insertar()`.
  3. Esa función llama **`net.http_post(...)`**, o sea la extensión **`pg_net`**, contra
     `https://ssyzfeadyrczlzjbvxyl.supabase.co/functions/v1/notificar-push`, con la llave
     publishable **escrita a mano en el cuerpo de la función**. Va envuelta en
     `exception when others then raise warning`, así que una push que no sale nunca tumba el
     `INSERT`: la fila se guarda y la bandeja la muestra igual.
  4. `notificar-push` lee `public.professionals` (`timezone`, `auth_user_id`) por PostgREST
     con `service_role` — sección 2.
  5. `POST https://api.onesignal.com/notifications` con
     `include_external_user_ids: [auth_user_id]`.

  **Se quedan también `pg_net` y la URL/llave incrustadas en `notificar_push_al_insertar`.**
  Si alguien quita `pg_net` creyendo que es del agente —el agente también sale a la red desde la
  base—, la campana sigue mostrando el aviso pero **el teléfono deja de sonar**, y en silencio:
  solo queda un `warning` en la bitácora.

---

## 4. Storage — cuatro buckets

Tres los escribe la app directo; uno lo lee firmado a través de la Edge Function.

| Bucket | La app | Dónde | Estado en la base |
|---|---|---|---|
| `patient-resources` | **Escribe** (`uploadBinary`) | constante en `lib/pages/resources/resource_upload.dart:11`, subida en `:193-199` | público, 15 MB, PDF/imagen/audio |
| `perfiles` | **Escribe** (foto y video del perfil) | constante en `lib/pages/profile/marketplace_profile_models.dart:673`, subida en `lib/pages/profile/profile_media_upload.dart:183-189` | público, 50 MB, imagen y video |
| `identidad-ine` | **Escribe** (frente y reverso del INE) | constante en `lib/pages/profile/marketplace_profile_models.dart:677`, mismo `putProfileMediaInBucket` | privado, 10 MB, imagen y PDF |
| `comprobantes` | **Lee**, nunca escribe, y solo por URL firmada de `get-payment-proof-url` | `lib/pages/billing/billing_data.dart:82-94` | privado, 5 MB, solo imagen |

Las tres políticas de `storage.objects` que existen en la base desplegada son exactamente las
tres subidas de la app, y las tres dependen de `current_professional_id()`:

```
patient_resources_own_folder_insert  authenticated  INSERT
  (bucket_id = 'patient-resources' AND (storage.foldername(name))[1] = current_professional_id()::text)
profile_media_own_folder_insert      authenticated  INSERT
  (bucket_id = 'perfiles'          AND (storage.foldername(name))[1] = current_professional_id()::text)
profile_ine_own_folder_insert        authenticated  INSERT
  (bucket_id = 'identidad-ine'     AND (storage.foldername(name))[1] = current_professional_id()::text)
```

No hay ninguna política de `storage.objects` para `comprobantes`: ahí solo escribe
`service_role`. **Ninguna de estas tres políticas se puede tocar.**

---

## 5. Realtime — una sola suscripción

`lib/pages/notifications/notification_data.dart:34-48`:

```dart
NotificationUnsubscribe subscribeToNotificationInserts(void Function() onInsert) {
  final userKey = supabase.auth.currentUser?.id ?? 'session';
  final channel = supabase
      .channel('notifications-badge-$userKey')
      .onPostgresChanges(
        event: PostgresChangeEvent.insert,
        schema: 'public',
        table: 'notifications',
        callback: (_) => onInsert(),
      )
      .subscribe();
  return () => supabase.removeChannel(channel);
}
```

Es lo que mantiene fresco el punto rojo de la campana. Depende de **tres** cosas, las tres
verificadas en la base desplegada, y las tres son "se queda":

1. La tabla `public.notifications` está en la publicación `supabase_realtime`. Y es la única:

   ```sql
   select pubname, schemaname, tablename from pg_publication_tables;
   -- supabase_realtime | public | notifications        ← la única de public
   -- supabase_realtime_messages_publication | realtime | messages_2026_08_2x (particiones internas)
   ```

2. `authenticated` tiene `SELECT` sobre `public.notifications` (sin ese grant, Realtime con
   RLS no entrega nada).

3. La política RLS `notif_owner_sel` (`SELECT`) sobre `notifications`:

   ```sql
   ((professional_id = current_professional_id()) OR is_agenda_admin())
   ```

   Es la **única** política de esa tabla. Por lo tanto `current_professional_id()` **e**
   `is_agenda_admin()` son dependencias vivas de la app aunque la app nunca llame
   `is_agenda_admin` por su nombre.

No hay ninguna otra suscripción ni `stream()` en `lib/`.

---

## 6. Auth — y el detalle que sí puede romper la app

| Qué | Dónde |
|---|---|
| `supabase.auth.signInWithOtp(phone:, channel: OtpChannel.whatsapp)` | `lib/pages/auth/auth_data.dart:21` |
| `supabase.auth.verifyOTP(phone:, token:, type: OtpType.sms)` | `lib/pages/auth/auth_data.dart:30` |
| `supabase.auth.signOut()` | `lib/pages/auth/auth_data.dart:13` |
| `supabase.auth.onAuthStateChange` | `lib/auth/auth_notifier.dart:18` y `lib/platform/push_notifications.dart:192` |
| `supabase.auth.refreshSession()` | `lib/auth/auth_notifier.dart:159` |
| `supabase.auth.currentSession` / `currentUser` | `lib/auth/auth_notifier.dart:24,42,75,130`; `lib/platform/push_notifications.dart:185,218`; `lib/pages/notifications/notification_data.dart:37` |

**La app entra por un código que llega por WhatsApp.** Lo manda Supabase Auth, no el agente ni
Kapso, pero el canal de WhatsApp de Supabase Auth es configuración del proyecto y se parece
a algo del agente. Está en la sección 8.

Arranque: `lib/main.dart:32-35` inicializa Supabase con `SUPABASE_URL` y
`SUPABASE_PUBLISHABLE_KEY` desde `.env`. No hay `service_role` en la app.

### Lo del login que sí toca una tabla: el identificador de la push

`lib/platform/push_notifications.dart:185-218` — el teléfono se presenta ante OneSignal con
`supabase.auth.currentSession?.user.id`, es decir con el id de **`auth.users`**, no con el del
profesional. El comentario del archivo explica por qué: preguntarle a la base quién es el
profesional desde dentro del aviso de «sesión iniciada» se traba contra el propio arranque y la
pantalla del código se quedaba colgada.

Consecuencia para la limpieza: **la traducción de `auth.users.id` a `professionals` vive del
lado servidor**, en `notificar-push`, y depende de la columna `professionals.auth_user_id`
(sección 2 y 8.8). Es un vínculo del inicio de sesión con una tabla, aunque la app nunca la
nombre.

También cuelga de `onAuthStateChange`: al cerrar sesión el aparato se «olvida»
(`_runtime.forget()`), y al restaurarse una sesión guardada se vuelve a identificar.

---

## 7. Lo que llama el Marketplace

**El Marketplace no vive en este repositorio.** Es un sitio Next.js público; en el repo solo
está su documentación, en `referencias/agenda-psi-database/MARKETPLACE.md` y en
`referencias/agenda-psi-database/paginas/marketplace-{landing,afinidad,listado,perfil}.md`.
No hay código suyo aquí, así que su lista sale de dos evidencias que coinciden.

**Evidencia 1 — las páginas canónicas.** `grep` de nombres de función sobre los cuatro
`paginas/marketplace-*.md` devuelve exactamente tres: `list_catalog_options(`,
`search_marketplace_profiles(`, `get_marketplace_profile(`.

**Evidencia 2 — los permisos de la base desplegada.** Solo cuatro funciones de `public`
tienen `EXECUTE` para el rol `anon`, y son justamente la superficie pública:

| RPC | `anon` | La usa también la app de Flutter |
|---|---|---|
| `list_catalog_options` | sí | **SÍ** — `marketplace_profile_data.dart:48` |
| `search_marketplace_profiles` | sí | no |
| `get_marketplace_profile` | sí | no |
| `get_marketplace_reviews` | sí | no |

Buckets que el Marketplace lee: `perfiles` es público (foto y video del perfil publicado) y
`patient-resources` también. **Los dos los escribe la app, así que ya estaban en la sección 4.**

Aviso al frente de Supabase: **`list_catalog_options` NO es solo del Marketplace.** La app la
usa para llenar el catálogo del perfil profesional y, a través de `listPatientAreas`
(`lib/pages/patients/patient_data.dart:45-48`), también las áreas de la ficha del paciente.

---

## 8. LO QUE PARECE DEL AGENTE PERO LO USA LA APP

Esto es lo importante de esta entrega. Todo lo de abajo huele a WhatsApp, a Kapso o a agente,
y **nada de esto se puede borrar sin romper la app.**

Si solo se lee un apartado de todo el documento, que sea **8.7**: es el único cuyo borrado no
degrada un aviso sino que **deja pantallas de uso diario devolviendo error**, y es el que
contradice lo que este mismo documento daba por indecidible.

### 8.1 El inicio de sesión llega por WhatsApp

`lib/pages/auth/auth_data.dart:21`:

```dart
Future<void> sendLoginOtp(String phone) =>
    supabase.auth.signInWithOtp(phone: phone, channel: OtpChannel.whatsapp);
```

El único modo de entrar a la app es un código de seis dígitos que llega por WhatsApp. Lo manda
**Supabase Auth**, con su propio proveedor configurado en el proyecto — no pasa por Kapso, ni
por `whatsapp_outbox`, ni por `enviar-whatsapp`. Los mensajes de error de la pantalla lo
confirman: `over_sms_send_rate_limit`, `sms_send_failed` (`auth_data.dart:47-52`) son códigos
de Supabase Auth, no del agente.

**Riesgo:** si al limpiar el agente alguien apaga o reconfigura el proveedor de WhatsApp en
Authentication del proyecto pensando que es del agente, **nadie puede entrar a la app.** No es
una tabla ni una función que se borre por descuido: es un ajuste del panel. Vale la pena
decirlo en voz alta antes de tocar cualquier cosa con "whatsapp" en el nombre.

### 8.2 `comprobantes` + `payment_proofs` + `get_payment_proof_signing_receipt` son de la app

El bucket `comprobantes` y la tabla `payment_proofs` existen porque el paciente manda su
comprobante por WhatsApp. Se ven como parte del mundo del agente. **No lo son:** nacieron en
`supabase/migrations/20260821_mensajeria_whatsapp.sql`, que es de **antes** de la primera
migración del agente (`20260823235236_agent_whatsapp_foundation.sql`).

Y la app depende de ellos por dos caminos distintos:

- **Lectura:** la pantalla Ver comprobante, por la cadena de la sección 3.
- **Escritura indirecta:** `payment_proofs` lo tocan 18 funciones de `public`, y **15 de esas
  18 son RPC que la app llama todos los días.** Verificado:

  ```sql
  select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosrc ilike '%payment_proofs%';
  ```

  De la app: `cancel_appointment`, `create_appointment`, `create_recurrence_series`,
  `credit_appointment_payment`, `deactivate_patient`, `delete_patient`,
  `delete_recurrence_series`, `delete_service`, `get_appointment_detail`, `get_billing_day`,
  `get_billing_month`, `mark_appointment_attended`, `mark_appointment_no_show`,
  `request_appointment_payment_proof`, `reschedule_appointment` — quince.
  Las otras tres son del servidor: `cron_appointment_confirmation_26h`,
  `get_payment_proof_signing_receipt`, `tg_jobs_solo_recursos_bi`.

  **Ninguna función `agent_*` aparece en esa lista.**

### 8.3 `list_catalog_options` parece del Marketplace y la usa la app

Es la única RPC con `EXECUTE` para `anon` que además llama la app de Flutter. Detalle en la
sección 7.

### 8.4 `current_professional_id` e `is_agenda_admin` sostienen RLS y Storage

`current_professional_id()` la llama la app directo (`profile_media_upload.dart:91`) **y**
aparece en las tres políticas de subida de `storage.objects` **y** en la política de lectura
de `notifications`. `is_agenda_admin()` la app nunca la nombra, pero está en el `USING` de
`notif_owner_sel`; si se va, se cae la evaluación de esa política y con ella el badge en vivo
de la campana. Las dos tienen `EXECUTE` para `authenticated`. **Se quedan las dos.**

### 8.5 `notifications`, `notificar_push_al_insertar` y `notificar-push` son de la app

La tabla `notifications` es lo único que la app lee directo (Realtime, sección 5) y lo único
que lee la bandeja (`list_notifications`, `has_unread_notifications`). El trigger
`notificar_push_al_insertar` y la Edge Function `notificar-push` cuelgan de esa misma tabla y
son los que hacen que suene el teléfono. Nada de eso es del agente.

### 8.6 `patient-resources` es público a propósito

`lib/pages/resources/resource_upload.dart:9-11` lo explica: *«Bucket de recursos. Es público
solo para leer: subir y borrar siguen protegidos»*. Es público porque los recursos se le
mandan al paciente por WhatsApp y el mensaje necesita una URL directa. Si alguien lo vuelve
privado creyendo que la exposición era del agente, la app sigue subiendo bien pero el paciente
deja de poder abrir lo que le mandaron.

### 8.7 `whatsapp_links`, `whatsapp_outbox` y `jobs` son dependencias duras de la app

**Este es el caso más grave de toda la entrega y corrige lo que decía la sección de abajo.**

Las tres tablas se ven íntegramente del mundo del agente. `whatsapp_links` incluso tiene una
columna llamada **`kapso_contact_id`** y otra **`last_inbound_at`**. Y sin embargo: la app no las
nombra nunca, pero **17 de sus 72 RPC las escriben o las leen dentro de la misma transacción**.
Borrar cualquiera de las tres no degrada un aviso: **revienta pantallas de uso diario con
error.**

**Crear un paciente.** `create_patient` inserta en `public.patients`, y ahí salta el trigger
`patients_whatsapp_link_ai`:

```sql
INSERT INTO public.whatsapp_links (patient_id, professional_id, phone) VALUES (...);
INSERT INTO public.whatsapp_outbox (...) SELECT ... 'patient_welcome' ... ;
```

Sin `whatsapp_links` o sin `whatsapp_outbox`, **la pantalla Nuevo paciente deja de guardar.**

**Editar el teléfono de un paciente.** `update_patient` no escribe el enlace a mano; lo espeja
el trigger `patients_whatsapp_link_phone_au`, y ese trigger **no perdona**:

```sql
UPDATE public.whatsapp_links SET phone = NEW.phone, updated_at = now() WHERE patient_id = NEW.id;
GET DIAGNOSTICS v_rows = ROW_COUNT;
IF v_rows <> 1 THEN RAISE EXCEPTION 'WHATSAPP_LINK_MISSING' USING ERRCODE = 'P0001'; END IF;
```

No es que se quede sin hacer nada: **levanta excepción y aborta el `UPDATE`.** Vaciar
`whatsapp_links` basta para que editar el teléfono desde la app falle.

**Asignar recursos a una cita.** `assign_resources_to_appointment` **lee** `whatsapp_links` para
decidir si la ventana de WhatsApp está abierta (`last_inbound_at` dentro de las últimas 24 h) y,
si lo está, inserta en `public.jobs` con `type = 'patient_resource_delivery'`. Esa tabla `jobs`
tiene su propio trigger `jobs_solo_recursos_bi`, que solo deja pasar tres tipos —
`patient_resource_delivery`, `storage_cleanup_payment_proofs`,
`storage_cleanup_professional_resources` — y descarta el resto en silencio.

**RPC de la app que escriben `whatsapp_outbox` — once:**
`cancel_appointment`, `credit_appointment_payment`, `deactivate_patient`, `delete_patient`,
`delete_recurrence_series`, `delete_service`, `mark_appointment_attended`,
`mark_appointment_no_show`, `request_appointment_payment_proof`, `reschedule_appointment`,
`waive_appointment_payment`. (Ocho hacen `INSERT`, ocho hacen `UPDATE`/`DELETE` para apagar
avisos que ya no aplican; varias hacen las dos cosas.)

**RPC de la app que escriben `public.jobs` — doce:**
`assign_resources_to_appointment`, `create_appointment`, `credit_appointment_payment`,
`deactivate_patient`, `delete_patient`, `delete_professional_resource`,
`delete_recurrence_series`, `delete_service`, `edit_appointment`, `mark_appointment_attended`,
`reschedule_appointment`, `waive_appointment_payment`.

**RPC de la app que dependen de `whatsapp_links` — cuatro:** `create_patient` y `update_patient`
(por trigger), `assign_resources_to_appointment` (lectura de la ventana) y `delete_patient` (la
cascada de borrado la incluye, junto con `agent_sessions`).

Comprobación:

```sql
select p.proname,
  (p.prosrc ~* 'insert\s+into\s+public\.whatsapp_outbox')            as ins_outbox,
  (p.prosrc ~* '(update|delete\s+from)\s+public\.whatsapp_outbox')   as mod_outbox,
  (p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+public\.jobs') as dml_jobs
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';
```

**Se quedan las tres tablas y los tres triggers** (`patients_whatsapp_link_ai`,
`patients_whatsapp_link_phone_au`, `jobs_solo_recursos_bi`), junto con `tg_outbox_variables_bi`,
que es `BEFORE INSERT` sobre `whatsapp_outbox` y por lo tanto está en el camino de esas once RPC.
Que el agente también use estas tablas no las hace suyas: **ya eran de la app.**

### 8.8 `professionals.auth_user_id` — la columna que traduce la sesión

`auth_user_id` suena a plomería de autenticación o a algo que el agente necesitaría para atar una
conversación a una cuenta. **Es la app.** Es lo único que traduce el identificador con el que el
teléfono se presenta ante OneSignal (`auth.users.id`, sección 6) al profesional dueño de la fila
de `notifications`. Sin esa columna, `notificar-push` cae a su valor por omisión —mandar el aviso
al `professional_id`— y OneSignal lo rechaza por alias desconocido: **ninguna push llega.**

Lo mismo vale para `professionals.timezone`: es la zona con la que la push imprime día y hora, y
si falta, el texto sale en `America/Mexico_City` aunque el profesional viva en otro huso.

Las dos se leen en `supabase/functions/notificar-push/index.ts:154-160`, y esa es la **única**
lectura directa de tabla en todo el frente de la app.

---

## Lo que NO pude comprobar desde este frente

- **El pipeline de avisos — corregido.** Este punto decía que desde el frente de Flutter no había
  forma de decidir sobre `whatsapp_outbox`, `whatsapp_links` y `jobs`. **Sí la hay, y la respuesta
  es que se quedan: son dependencias duras de 17 de las 72 RPC de la app.** El detalle y la
  evidencia están en 8.7. Lo que sigue sin poder decidirse desde aquí es solo el **transporte**:
  `whatsapp_inbound_messages`, `enviar-whatsapp`, `claim_outbox_batch`, `finalize_outbox`,
  `disparar_sender_whatsapp`, `record_outbox_provider_status`, los cuatro `cron_*` y los
  `purge_*`. Ninguno aparece en `lib/` y ninguna RPC de la app los llama. Pero **que la app no
  los llame no significa que se puedan borrar**: son quienes vacían el `whatsapp_outbox` que
  esas once RPC llenan, y quienes llenan `payment_proofs`, del que la app sí depende (8.2). Si se
  apagan, la app no da error: los avisos simplemente se quedan encolados para siempre. Quién los
  enciende y si el agente los duplicó es trabajo del otro frente.
- **Quién escribe hoy en el bucket `comprobantes`.** Sé que la app no, que no hay política de
  `storage.objects` para ese bucket (solo `service_role`) y que la tabla `payment_proofs` es
  anterior al agente. Cuál Edge Function pone el archivo ahí en producción no lo pude fijar
  con evidencia desde este frente.
- **Las funciones de administración** `approve_profile` y `reject_profile`: no tienen `EXECUTE`
  para `anon`, `authenticated` ni `service_role`, y la app no las llama. Quién las ejecuta no
  se ve desde aquí. Van a "se queda" por no poder comprobarlo.
