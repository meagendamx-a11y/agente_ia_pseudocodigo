# 06 · Plan de implementación y de pruebas

Corte: 2026-08-26. Este documento se apoya en `docs/hallazgos-auditoria-agente.md` y lo
da por cierto. Todo lo que aparece aquí y no está allí se verificó contra la base
desplegada (`ssyzfeadyrczlzjbvxyl`) y contra los archivos del árbol de trabajo; cada
afirmación lleva su evidencia al lado. La documentación de `referencias/` **no es fuente**
para nada de esto.

Esto es lo que se va a ejecutar, en el orden en que se va a ejecutar.

---

## 0. Antes de tocar nada: cómo se despliega aquí

Tres restricciones del entorno que mandan sobre todo el plan:

1. **No hay `psql`, ni CLI de Supabase con credenciales, ni contraseña de la base.**
   El único camino para escribir en producción es preparar el `.sql` completo y
   pasárselo a Gael, que lo aplica y devuelve el resultado. El clasificador de permisos
   rechaza incluso un `COMMENT ON FUNCTION` lanzado desde aquí.
2. **`supabase db push`, `apply_migration`, `migration repair` y `db reset --linked`
   están prohibidos.** La base tiene **80 versiones aplicadas** y la carpeta local tiene
   **16 archivos**: el directorio local no es la historia viva. Verificado:
   `select count(*) from supabase_migrations.schema_migrations` → 80; última versión
   `20260824043359 agent_workflow_capabilities`.
3. **Nunca transcribir un cuerpo de función a mano.** Se extrae el bloque con un script
   y se verifica después comparando `md5(prosrc)` contra el archivo en disco. Ya se
   perdió una línea así una vez.

Para las funciones de borde sí hay despliegue directo (`deploy_edge_function`), y para
Kapso hay CLI (`kapso pull` / `kapso push`) con la sesión de `kapso login`. Si
`KAPSO_API_KEY` está puesta con un valor inválido tapa la sesión y todo falla con 401:
correr con `env -u KAPSO_API_KEY`.

---

## 1. La secuencia de despliegue

### 1.1 El orden, con la razón de cada posición

| # | Qué | Por qué va aquí |
|---|---|---|
| 1 | `20260824200000_agent_cerrojos_tanda0.sql` | Crea `public.agent_register_option_token_key`, que es **la única forma de registrar la llave emisora**. Sin ella nada más funciona (§1.2). |
| 2 | **Registrar la llave** (una línea de SQL, no es migración) | Es un dato, no un objeto. La migración crea al registrador; la llave la mete un `select`. |
| 3 | `20260824201000_agent_portero_nudos.sql` **(nueva, hay que escribirla)** | Cambia la lista de operaciones autorizadas. Todo lo que sigue reclama contra esa lista; si va después, cada familia se despliega apuntando a un portero que la rechaza. |
| 4 | `20260825000000_agent_dominio_fundamento.sql` **corregido** | Permisos del rol aislado y helpers comunes. Va antes que las familias porque todas los usan. |
| 5 | `20260825001000_agent_consultas_agenda.sql` **recortado** | De sus seis lectores sólo sobreviven las piezas que el expediente reaprovecha: las ocho lecturas sueltas se retiran del catálogo y su contenido se junta en `open_case` (paso 10). Lo que se aplica son sus helpers de formato y de etiquetas. |
| 6 | `20260825005000_agent_perfil_relacion.sql` **recortado** | Igual: `select_relationship` y `get_professional_share_profile` se retiran como operaciones —hoy no hay un solo teléfono con dos vínculos, y el perfil público es un campo del expediente— y lo que se conserva es la resolución de relaciones, que `open_case` usa para el caso ambiguo. |
| 7 | `20260825002000_agent_pagos.sql` **corregido** | Sus lecturas se absorben en el expediente; se queda la primera mutación real, adjuntar comprobante, ahora en la superficie `agent_node`. Es la mutación más barata de deshacer: no toca la agenda. |
| 8 | `20260825003000_agent_citas_mutaciones.sql` **corregido** | Las mutaciones de agenda. Van al final porque son las que mueven dinero y horarios. |
| 9 | `20260825006000_agent_formulario.sql` **(nueva, hay que escribirla)** | Las dos rutas del formulario **más las dos operaciones de `workflow_internal` que no existen todavía** (§1.3). Dependen del portero (paso 3) y de los helpers (paso 4) —incluida la fila `flow` de la matriz—, y de nada más. |
| 10 | `20260825007000_agent_expediente.sql` **(nueva, hay que escribirla)** | `public.agent_open_case_from_workflow`, que reemplaza a `agent_get_capabilities` y a las ocho lecturas sueltas, y retira las tres funciones de capacidades. Va al final a propósito: es lo único que el modelo ve, y se enciende cuando todo lo demás ya está puesto. |
| 11 | Funciones de borde (`agent_tool_gateway`, `kapso_inbound_webhook`) | El código nuevo del gateway llama RPC que sólo existen después del paso 10. Y `kapso_inbound_webhook` crece dos veces: baja el archivo del comprobante al admitir el mensaje, y entrega el resultado sellado del formulario al reanudar. |
| 12 | Kapso (funciones privadas → Flow → nodo → prompt) | Último. Es lo único que el modelo ve, y no debe ver una capacidad antes de que exista. |
| 13 | Encender: primero `AGENT_INBOUND_ENABLED`, después `AGENT_WORKFLOW_ENABLED` | Con el primero solo, la admisión graba y nadie llama al modelo: se puede mirar la conversación entrar sin que conteste. |

**La dependencia dura del paso 1, verificada hoy**, no es una suposición de diseño:

```sql
-- private.agent_token_key_registry EXISTE (viene de agent_whatsapp_foundation)
-- pero está VACÍA:
select count(*) from private.agent_token_key_registry;  -- 0
-- y la función que la llena NO existe todavía:
select to_regprocedure('public.agent_register_option_token_key(text,boolean,timestamptz)');  -- null
```

Y en el cuerpo desplegado de `private.agent_issue_option_handle`, la emisión termina en:

```sql
SELECT key_row.* INTO v_key
  FROM private.agent_token_key_registry AS key_row
 WHERE key_row.key_id = p_key_id
 FOR UPDATE;
IF NOT FOUND
   OR NOT v_key.can_issue
   OR v_key.verify_until <= v_now
   OR v_key.verify_until < p_expires_at THEN
  RETURN ... 'reason', 'OPTION_KEY_INVALID' ...;
END IF;
```

Con la tabla vacía, `NOT FOUND` es siempre cierto: **toda emisión de identificador
opaco devuelve `OPTION_KEY_INVALID`**. La primera lista de servicios, la primera lista
de citas y el primer token del formulario fallan cerrados. Por eso la tanda 0 es la
primera y no admite discusión.

El paso 2 es una sola línea:

```sql
select public.agent_register_option_token_key(
  'agente-2026-08',          -- ESTE es el identificador de la llave, no una etiqueta:
                             -- es la clave primaria del registro y lo que queda
                             -- guardado en agent_option_tokens.key_id. No se genera
                             -- ningún uuid. No es secreto.
  true,                      -- ésta es la que emite
  now() + interval '1 year'  -- verify_until debe ser >= expires_at de cualquier token
);
```

Se corre como `service_role`: es el único rol con `EXECUTE`.

El índice único parcial `uq_agent_token_key_registry_single_issuer` garantiza que a lo
más una llave tenga `can_issue`, así que el registro es idempotente por construcción.

**La fecha que se pone aquí es un acantilado, no una holgura.** Los dos cuerpos
desplegados exigen `verify_until > ahora` **y** `verify_until >= expires_at` del token:
`agent_issue_option_handle` contesta `OPTION_KEY_INVALID` y `agent_resolve_option_token`
contesta `TOKEN_KEY_INVALID`. El día que la ventana vence, el agente deja de poder
mostrar un servicio, una cita o un hueco, y el error que sale es genérico: nadie va a
relacionarlo con una llave. Por eso la ventana es de un año y **la fecha exacta se anota
en el calendario del dueño el mismo día que se registra**. Renovarla es volver a correr
la misma línea con una etiqueta nueva.

Los cinco tipos de identificador y su techo de vida, leídos del cuerpo desplegado, y lo que
quedan después de la migración de los nudos:

| Tipo | Entidad | Un solo uso | Vida máxima hoy | Después |
|---|---|---|---|---|
| `relationship` | `whatsapp_link` | sí | 10 min | 30 min |
| `service` | `service` | no | 15 min | 30 min |
| `appointment` | `appointment` | no | 15 min | 30 min |
| `slot` | `service_slot` | sí | 5 min | 30 min |
| `flow` | `turn` | sí | 15 min | 30 min |

**Un solo tope de 30 minutos para los cinco**, que es el techo al que el portero renueva el
turno (`LEAST(sesión.expires_at, now() + 30 min)`). Con topes distintos hay dos caminos que
terminan en silencio: el `flow_token` de 15 minutos deja sin cita a quien pasea el
calendario con calma, y el identificador de horario de 5 minutos deja la pantalla vacía para
siempre en ese turno cuando ella compara dos días y vuelve al primero. El emisor ya rechaza
cualquier vencimiento que pase del turno o de la sesión, así que con un solo tope **el turno
es el único reloj** y sobra el resto de la tabla. El argumento completo está en
`02-herramientas.md` §3, y `verify_until` de la llave tiene que cubrir esos 30 minutos.

### 1.2 Archivo por archivo: se aplica, se corrige, o se tira

| Archivo | Veredicto | Qué hay que hacerle |
|---|---|---|
| `20260824200000_agent_cerrojos_tanda0.sql` | **Se aplica tal cual** | Nada. Crea el registrador de llaves, el índice de unicidad, el barrendero de sesiones con su cron cada 5 min, y el encendido por número. Ya trae la trampa resuelta: el índice sobre `agent_sessions` se crea fuera del `SET ROLE` porque esa tabla es de `postgres`. |
| `20260825000000_agent_dominio_fundamento.sql` | **Se corrige antes** | Cuatro cosas. (a) **Quitarle el bloque completo de `private.agent_claim_tool_call`** — líneas 315 a 748: el `CREATE OR REPLACE`, su `REVOKE` y su `COMMENT`. Ese bloque hace un arreglo parcial del portero —agrega `create_appointment` y `attach_payment_proof` en `agent_node` y deja la saga en pie— y choca de frente con la migración de los nudos. El portero lo debe cambiar **una sola migración**. (b) **Agregarle la fila `('flow','turn',true,'30 minutes')` a la matriz de `private.agent_issue_listed_option`** (§1.3). (c) **Quitarle `confirmed_at` y `confirmation_source` del `GRANT INSERT` sobre `appointments`**: la cita del agente nunca nace confirmada, así que nadie las escribe al crear, y un permiso que no existe es mejor que una regla que hay que recordar. Siguen en el `GRANT UPDATE`. (d) **Quitarle el `GRANT INSERT` sobre `public.whatsapp_outbox`**: el agente no encola ninguna plantilla, nunca, y el único productor nuevo de la cola es un cron de `postgres` (`03-dinero.md` §5.3 y §9). Lo demás del archivo (permisos, helpers, bitácora) se queda intacto. |
| `20260825001000_agent_consultas_agenda.sql` | **Se recorta** | Sus seis lectores dejan de ser operaciones: el expediente los junta en uno solo (§2.6). Lo que se conserva y se reaprovecha entero son sus helpers —el formato de etiquetas legibles en la zona de la profesional, la emisión de handles de cita, el cálculo de `cambio_a_tiempo`—, que pasan a ser el cuerpo de `open_case`. Nada de lo que se conserva muta. |
| `20260825002000_agent_pagos.sql` | **Se corrige antes** | Tres cosas. (a) Sus dos lecturas se absorben en el expediente. (b) Su aviso al profesional sale con las claves equivocadas y con el monto adentro, que el contrato prohíbe (§2.7). (c) Reclama `attach_payment_proof` en `agent_node`, que es correcto, **y por eso la superficie `media_adapter` se borra entera del portero**: nadie más reclama ahí. |
| `20260825003000_agent_citas_mutaciones.sql` | **Se corrige antes** | Cuatro cosas. (a) Dos de sus cinco funciones cambian de superficie: agendar y reprogramar dejan de ser conversacionales (§2.2). (b) Los cinco avisos al profesional salen con las claves equivocadas (§2.7). (c) Cancelar y reprogramar le encolan a la paciente una plantilla de WhatsApp —`appointment_cancelled` y `appointment_rescheduled`— al mismo teléfono con el que el agente acaba de hablar: es eco, cuesta un mensaje de plantilla y se quita. (d) **Cancelar no tiene el cerrojo del dinero y hoy produce las dos formas de dinero muerto** (§2.8). Confirmar y cambiar modalidad no cambian de superficie. |
| `20260825004000_agent_recursos_resena.sql` | **Se parte en dos** | La mitad de la reseña se aplica tal cual. **La mitad de los materiales se tira de esta ronda**: no hay consumidor de `public.jobs` en la base, así que la entrega no puede ocurrir aunque la función exista (§8). Se despliega igual —es inerte sin ruta ni capacidad— o se recorta; recomiendo recortarla para no dejar código que promete algo que no pasa. |
| `20260825005000_agent_perfil_relacion.sql` | **Se recorta** | `select_relationship` y `get_professional_share_profile` dejan de ser operaciones: la primera porque hoy **ningún teléfono tiene más de un vínculo** (verificado: 18 teléfonos, todos con `vinculos = 1`) y el caso ambiguo lo resuelve el propio expediente con dos llamadas; la segunda porque el perfil público es un campo del expediente, no una herramienta. Se conserva la resolución de relaciones y la comprobación del perfil aprobado, que `open_case` usa. El estado ambiguo no se puede reproducir sin sembrar un segundo vínculo a propósito (§5, prueba P8). |
| `20260824201000_agent_portero_nudos.sql` | **Hay que escribirla** | §2. |
| `20260825006000_agent_formulario.sql` | **Hay que escribirla** | Cuatro funciones: el resolvedor del `flow_token` por el handle solo, la pantalla del calendario (`/flow/cuando`), y **las dos que hoy no existen en ninguna parte**: `agent_open_booking_flow_from_workflow` y `agent_send_fixed_response_from_workflow` (§1.3). Las dos mutaciones del formulario ya están escritas en `20260825003000` y sólo cambian de superficie. |
| `20260825007000_agent_expediente.sql` | **Hay que escribirla** | §2.6. |

Nada de lo anterior se aplica sin su archivo gemelo en `supabase/tests/`. Los seis
existentes se conservan; hacen falta tres nuevos, uno por migración nueva.

### 1.3 Dos huecos que nadie tapó, y el formulario no arranca sin ellos

**Nadie puede acuñar el token del formulario.** El emisor de bajo nivel
(`private.agent_issue_option_handle`) sí admite `kind = 'flow'` —está en su matriz de
techos y en el `CHECK` de la tabla—, pero el helper por el que pasan todas las familias
lo excluye a propósito. Es literal, en el archivo escrito:

```sql
-- private.agent_issue_listed_option, 20260825000000, matriz de kinds:
  ('relationship', 'whatsapp_link', true,  interval '10 minutes'),
  ('service',      'service',       false, interval '15 minutes'),
  ('appointment',  'appointment',   false, interval '15 minutes'),
  ('slot',         'service_slot',  true,  interval '5 minutes')
-- y el comentario de arriba: «Falta a proposito el kind 'flow' … El dia que se
-- despierten, se agrega aqui la fila ('flow','turn',true,'15 minutes').»
```

Un `kind` que no está en esa matriz sale con `INVALID_AGENT_OPTION_ISSUE_INPUT`. Ese día
llegó: se agrega la fila, **con 30 minutos y no con 15**, y los otros cuatro intervalos suben
a 30 también, para que esta matriz y la de `private.agent_issue_option_handle` digan lo
mismo. Son cinco renglones.

**Y no existe ninguna función de dominio para las dos operaciones de
`workflow_internal`.** El portero desplegado autoriza `open_booking_flow` y
`send_fixed_response` desde el día uno, y el gateway declara sus dos rutas, pero
`agent_open_booking_flow_from_workflow` y `agent_send_fixed_response_from_workflow` no
están escritas ni desplegadas: no aparecen en ninguna de las siete migraciones del agente
ni en el mapa del gateway. Sin la primera, el agente no puede abrir el formulario y toda
la mitad de agendar se queda sin puerta. Van en `20260825006000`, que es donde vive el
formulario.

`agent_open_booking_flow_from_workflow(p_provider_message_id, p_kapso_execution_id,
p_modo)` hace cuatro cosas y nada más: reclama `open_booking_flow`, arma los datos de la
primera pantalla con sus handles, acuña el token del formulario, y devuelve las dos cosas al
gateway, que es quien manda el mensaje. **El modo viaja dentro de la llave estable del
token** (`flow:<turn_id>:agendar` o `flow:<turn_id>:reprogramar`), porque
`agent_option_tokens` no tiene dónde más ponerlo: sus columnas son las que son y ninguna
guarda carga útil. El endpoint lo lee de la fila del token, que es la misma lectura que ya
hace para sacar sesión y turno (§2.2). **Es una sola operación para los dos modos**: no hay
`open_reschedule_flow` ni ruta `/workflow/open-reschedule-flow`; dos operaciones para el
mismo acto serían dos descripciones que el modelo tiene que discriminar a cambio de nada.

---

## 2. La migración de los nudos

Archivo: `supabase/migrations/20260824201000_agent_portero_nudos.sql`.
Reemplaza **dos** funciones, no una: `private.agent_claim_tool_call` y
`private.agent_finalize_tool_call`. Verificado que son las únicas dos funciones
desplegadas que mencionan `saga_state`:

```sql
select n.nspname||'.'||p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and p.prokind='f'
   and pg_get_functiondef(p.oid) like '%saga_state%';
-- private.agent_claim_tool_call
-- private.agent_finalize_tool_call
```

### 2.1 Los cuatro nudos y su arreglo

| Nudo | Hoy | Después |
|---|---|---|
| 1 · Agendar limpio se rechaza | `flow_create_appointment` sólo pasa si `saga_state='awaiting_replacement_create' AND mutation_limit=2 AND committed_mutation_count=1` | El guardia desaparece con la saga. Agendar por formulario pasa con un turno normal. |
| 2 · El comprobante vive en la superficie equivocada | `attach_payment_proof` sólo en `media_adapter` | Pasa a `agent_node`, que es donde vive el agente que decide que una imagen es un comprobante. **La superficie `media_adapter` desaparece entera**: `agent_attach_payment_proof_from_workflow` reclama en `agent_node` y no queda nadie que reclame ahí. |
| 3 · No se puede mover por formulario | No existe `flow_reschedule_appointment` | Se agrega a `flow_data_exchange`, mutación. |
| 4 · La maniobra que evapora el dinero | `cancel_then_open_booking_flow` cancela y crea una cita nueva con pago limpio | Se retira la operación y **toda** su maquinaria. |

### 2.2 Por qué la reserva ocurre dentro del formulario

**Primero, hay que tumbar un argumento falso que estaba escrito aquí.** Decía que la
respuesta del formulario abre un turno nuevo y que por eso el identificador del hueco
moriría antes de que el agente pudiera usarlo. **Eso no es lo que pasa.** El cuerpo
desplegado de `agent_register_inbound_context` reanuda el turno abierto en vez de crear
uno nuevo:

```sql
v_can_resume := v_session_exists
  AND v_turn_exists
  AND v_turn.status = 'waiting_external'
  AND v_turn.session_id = v_session.id
  AND v_turn.expires_at > v_now
  AND v_turn.last_activity_at >= v_now - interval '30 minutes'
  AND ( ... misma paciente y mismo profesional ... );
...
IF v_can_resume THEN
  UPDATE public.agent_turns SET last_activity_at = v_now, ... WHERE turn_row.id = v_turn.id;
  v_status := 'resumed';
```

Cuando la paciente cierra el formulario, el `nfm_reply` entra con el turno todavía en
`waiting_external`: la admisión lo marca `resumed` y **devuelve el mismo `turn_id`**.
Después `agent_bind_inbound_execution` lo regresa a `active`. O sea que sí es el mismo
turno y sí se podría resolver un identificador emitido dentro del formulario.

La reserva ocurre dentro del formulario de todos modos, por tres razones que sí se
sostienen:

1. **El hueco vive cinco minutos.** El techo está en el cuerpo desplegado de
   `agent_issue_option_handle`: `slot` + `service_slot` + un solo uso → `interval '5
   minutes'`, y no se puede pedir más. Entre que la paciente toca «Confirmar» y que el
   agente despierta, manda su mensaje y llama a la herramienta, cinco minutos se van sin
   esfuerzo. Y cuando se van, la paciente ya vio la pantalla de confirmación.
2. **La única forma de que el «listo» sea cierto es que elegir y reservar sean el mismo
   acto.** Si el agente reserva después, alguien puede haber tomado el hueco en el
   intervalo, y la paciente recibe un desmentido después de haber terminado. Es
   exactamente el falso éxito que hay que evitar.
3. **Es la decisión del dueño**: agendar y reprogramar van por formulario.

Consecuencia: la reserva ocurre **dentro** del formulario, en el mismo acto en que la
paciente elige. Eso es lo que pedían los nudos 1 y 3. En qué estado esté el turno cuando
ocurra es indiferente, y §2.3 explica por qué tiene que serlo.

Los dos formularios viejos de una sola pantalla (`kapso/flows/agendar-cita.flow.json` y
`kapso/flows/reprogramar-cita.flow.json`) terminan en `on-click-action: complete`, o sea
que devuelven el hueco al chat: **están construidos sobre la idea imposible y se tiran**.
El bueno es `kapso/flows/agenda-psi-citas.flow.json`, de dos pantallas, cuyo pie hace
`data_exchange` con `paso: confirmar`.

Por eso en `20260825003000` cambian dos funciones:

| Función | Reclama en el archivo escrito | Debe reclamar | Cómo llega la identidad |
|---|---|---|---|
| `agent_create_appointment_from_workflow` | `agent_node` / `create_appointment` | `flow_data_exchange` / `flow_create_appointment` | `p_flow_token` en vez de la pareja `(provider_message_id, kapso_execution_id)` |
| `agent_reschedule_appointment_from_workflow` | `agent_node` / `reschedule_appointment` | `flow_data_exchange` / `flow_reschedule_appointment` | igual |

Las otras tres (`confirm`, `cancel`, `switch_modality`) no cambian de superficie.

**Cómo se arma la identidad desde un token, en concreto.** El endpoint del formulario
sólo conoce el `flow_token`; no conoce sesión ni turno.
`private.agent_resolve_option_token` **exige las dos como argumentos** —`p_session_id` y
`p_turn_id`—, así que el token por sí solo no la invoca. Las dos funciones nuevas
empiezan igual: leen `public.agent_option_tokens` por `random_handle` para sacar
`session_id` y `turn_id`, y **con eso** llaman a `agent_resolve_option_token`, que
entonces sí verifica que sesión y turno coincidan en conversación, teléfono, número
destino, paciente y profesional. La búsqueda por `random_handle` no autoriza nada; sólo
convierte un uuid en un par de identificadores para que el verificador de siempre haga su
trabajo.

Y el reclamo necesita un `p_execution_id`: se toma de `v_turn.kapso_execution_id`, que es
justo contra lo que el portero compara. El endpoint nunca lo escribe.

### 2.3 Los lectores del formulario no reclaman

El turno tiene un techo de **ocho llamadas**, y no es sólo del código: está en la tabla.

```sql
-- agent_tool_calls_check, leído de pg_constraint:
CHECK (((ordinal >= 1 AND ordinal <= 8)
        AND NOT (surface='workflow_internal' AND operation='complete_inbound' AND NOT is_mutation))
       OR (ordinal = 9 AND surface='workflow_internal' AND operation='complete_inbound' AND NOT is_mutation))
-- más UNIQUE (turn_id, ordinal)
```

Si cada toque de la paciente en el formulario consumiera un ordinal, la cuenta sería:
expediente (1), abrir formulario (2), pantalla del calendario (3), primer día (4), segundo
día (5), tercer día (6), cuarto día (7), reservar (8). **Al quinto día que toca, la pantalla
se queda en blanco.** No es teórico: son cinco toques en un calendario de sesenta.

El techo existe para acotar al modelo, no a la paciente. Así que:

**Las lecturas del formulario salen del portero.** No reclaman, no gastan ordinal, no entran
al libro de idempotencia —no lo necesitan: no tienen efecto—. Y no es que quede apretado: la
novena lectura **revienta la restricción**, no da `TOOL_BUDGET_EXCEEDED`. Se autorizan
resolviendo el token del formulario (`kind = 'flow'`, atado al turno, 30 min de vida) con
`p_consume => false`, que ya verifica que sesión y turno coincidan en conversación,
teléfono, número destino, paciente y profesional, y que ninguno haya vencido. Es la misma
comprobación de identidad, sin el costo. **Lo único que sí siguen haciendo es renovar el
turno**, porque si no una paciente que se toma media hora escogiendo día llega a la pantalla
final con el turno vencido.

Y son **una sola ruta**, `/flow/cuando`, que sirve las dos vueltas de lectura de la pantalla
2 —pintar el calendario y pintar las horas de un día— con la misma forma de salida en los
dos casos. No hay ruta para la primera pantalla: `ELEGIR` viaja llena dentro del mensaje que
abre el formulario.

**El token del formulario no se consume nunca**, ni siquiera al reservar. Es de un solo
uso —así lo obliga `chk_agent_option_tokens_kind_matrix`—, pero resolverlo con
`p_consume => false` está permitido todas las veces que haga falta y **consumirlo sería
un tiro en el pie**: si Meta reintenta el `data_exchange` de la reserva después de que ya
pasó, la segunda llamada saldría con `TOKEN_CONSUMED` y la paciente vería un error sobre
una cita que sí se creó. Se deja vencer solo a los 30 minutos, con el turno.

La única llamada del formulario que sí reclama es la reserva, que además gasta la única
mutación del turno. Su operación depende del modo que trae la clave estable del token:
`flow_create_appointment` al agendar, `flow_reschedule_appointment` al mover. Con eso,
**agendar completo gasta tres de las ocho**: `open_case`, `open_booking_flow` y la reserva.

**Y la reserva se autoriza en `active` o en `waiting_external`, no sólo en
`waiting_external`.** Ésta es una corrección con un caso concreto detrás: la paciente
recibe el formulario, escribe «ahorita lo veo», y ese mensaje reanuda el turno y lo
devuelve a `active`. Diez minutos después abre el formulario, elige, toca «Confirmar
cita» —y la reserva sale con `TOOL_NOT_ALLOWED` porque el turno ya no está esperando. La
paciente ve un error después de haber terminado; nadie se entera de nada. El estado del
turno no es lo que autoriza al formulario: lo autoriza el token del formulario, que está
atado a ese turno y a esa paciente. Así que la superficie `flow_data_exchange` admite los
dos estados, exactamente como `get_availability` ya lo hace hoy en el portero desplegado
por esta misma razón. El tope de una mutación por turno sigue igual de firme.

**Y aquí está el cerrojo que obliga a cerrar la gestión.** Como la respuesta del
formulario **reanuda el mismo turno** (§2.2), la reserva ya gastó la única mutación que
ese turno tiene: `committed_mutation_count = 1`, `mutation_limit = 1`. Cualquier mutación
posterior en esa misma conversación —el comprobante que la paciente manda enseguida,
mover la cita que acaba de hacer— sale con `MUTATION_BLOCKED`. La paciente manda su foto
y no pasa nada.

La regla, entonces, es corta y no admite excepción: **en cuanto el agente confirma en el
chat lo que el formulario reservó, cierra la gestión con `complete_task`.** El siguiente
mensaje de la paciente entra con el turno ya `completed`, la admisión abre un turno nuevo,
y ese turno trae su propia mutación. No hace falta nada más: ni subir el tope, ni tocar la
tabla, ni una función nueva. Sólo que el prompt no deje al agente esperando después de una
reserva.

### 2.4 Lo que cambia, línea por línea

**En `private.agent_claim_tool_call`:**

```sql
-- 1) Desaparece la variable de la maniobra y su cálculo.
--    v_is_replacement_create boolean;                                  <-- fuera
--    v_is_replacement_create := p_surface = 'flow_data_exchange'
--      AND p_operation = 'flow_create_appointment' AND p_is_mutation;  <-- fuera

-- 2) Mutaciones de agent_node: sale la maniobra, sale reprogramar
--    (se va al formulario), sale resume_resource_delivery (no hay motor de
--    trabajos, §8.2), entra adjuntar comprobante.
ELSIF p_operation IN (
  'confirm_appointment', 'cancel_appointment',
  'switch_appointment_modality', 'attach_payment_proof',
  'submit_review'
) THEN
  v_metadata_allowed := p_is_mutation;
  v_state_allowed := v_turn.status = 'active';
END IF;

-- 3) Superficie del formulario: se van los tres lectores (§2.3),
--    se queda la reserva y entra la reprogramación. Los dos estados,
--    como get_availability.
ELSIF p_surface = 'flow_data_exchange' THEN
  IF p_operation IN ('flow_create_appointment', 'flow_reschedule_appointment') THEN
    v_metadata_allowed := p_is_mutation;
    v_state_allowed := v_turn.status IN ('active', 'waiting_external');
  END IF;

-- 3 bis) La rama de media_adapter se borra entera: nadie reclama ahí.
--    ELSIF p_surface = 'media_adapter' AND p_operation = 'attach_payment_proof'  <-- fuera

-- 4) El bloqueo de mutación se queda en sus dos razones reales.
IF p_is_mutation AND (
     v_turn.saga_state = 'unknown_blocked'
     OR v_turn.committed_mutation_count >= v_turn.mutation_limit
   ) THEN
  ... 'MUTATION_BLOCKED' ...
END IF;

-- 5) El presupuesto vuelve a ser una sola condición.
IF v_turn.tool_call_count >= 8 THEN
  ... 'TOOL_BUDGET_EXCEEDED' ...
END IF;

-- 6) El ordinal ya no se fuerza a 8 para nadie.
v_ordinal := v_turn.tool_call_count + 1;
--    OJO al editar: esta línea vive DESPUÉS del retorno temprano del cierre.
--    El ordinal 9 se inserta en esa rama y nunca toca tool_call_count, y no
--    puede tocarlo: agent_turns_tool_call_count_check topa la columna en 8.
--    Si alguien "simplifica" fusionando las dos rutas, el cierre revienta.

-- 7) El UPDATE del turno deja de tocar mutation_limit y saga_state.
UPDATE public.agent_turns AS turn_row
   SET tool_call_count = v_ordinal,
       last_activity_at = v_now,
       expires_at = LEAST(v_session.expires_at, v_now + interval '30 minutes'),
       updated_at = v_now
 WHERE turn_row.id = p_turn_id;
```

Y una línea más, que es el hueco más grave del portero y sólo se ve leyendo el orden de sus
comprobaciones:

```sql
-- antes: una paciente dada de baja entra por el ELSE y recibe TENANT_NOT_ACTIVE
--        incluso para open_case y para send_fixed_response, que es justamente la
--        remediación que la tabla de errores manda usar. Ella escribe y no recibe nada.
IF NOT v_has_active_tenant THEN
-- después
IF NOT v_has_active_tenant AND NOT v_tenantless_allowed THEN
```

```sql
-- y la lista sin inquilino vivo queda en dos, no en tres:
v_tenantless_allowed :=
  (p_surface = 'agent_node' AND p_operation = 'open_case')
  OR (p_surface = 'workflow_internal' AND p_operation = 'send_fixed_response');
```

Se conserva sin tocar: la ruta de cierre en el ordinal 9, la comprobación de identidad entre
sesión y turno, la réplica exacta, el `MUTATION_PENDING`, el `command_id` nuevo por mutación,
la renovación del turno, y el orden global de candados.

**Y se retiran las ocho lecturas sueltas de `agent_node`** —`list_upcoming_appointments`,
`get_next_appointment`, `get_location`, `get_pending_payments`,
`get_appointment_payment_status`, `get_professional_share_profile`, `list_services`,
`get_booking_eligibility`— más `get_capabilities`, `select_relationship`, `get_availability`
y `resume_resource_delivery`. Las junta todas `open_case`. El catálogo final son **once
operaciones en tres superficies**, y está en `02-herramientas.md` §5.1.

**En `private.agent_finalize_tool_call`** hay una bomba que hay que desactivar en el mismo
acto. Su cuerpo desplegado dice:

```sql
saga_state = CASE
  WHEN p_outcome = 'unknown' THEN 'unknown_blocked'
  ...
  WHEN v_claim.surface = 'flow_data_exchange'
    AND v_claim.operation = 'flow_create_appointment'
  THEN 'awaiting_replacement_create'
  ELSE turn_row.saga_state
END,
```

O sea: **una reserva exitosa por formulario deja el turno en
`awaiting_replacement_create`**, y a partir de ahí el portero rechaza toda mutación
posterior con `MUTATION_BLOCKED`. Si sólo se arregla el reclamo y no el cierre, la primera
cita agendada por formulario deja el turno inservible. Queda:

```sql
saga_state = CASE WHEN p_outcome = 'unknown' THEN 'unknown_blocked' ELSE turn_row.saga_state END,
-- y el CASE de mutation_limit desaparece: nadie lo mueve ya.
```

### 2.5 Deja de ser aditiva, y cómo se hace segura

**Por qué deja de ser aditiva.** Todas las migraciones anteriores del agente sólo
agregaban. Ésta **retira operaciones que hoy están autorizadas**
(`cancel_then_open_booking_flow`, los tres lectores del formulario,
`reschedule_appointment` en `agent_node`) y **retira transiciones de estado** que ya están
escritas en el cierre. Un turno que estuviera a mitad de la maniobra —cancelada la cita
vieja, esperando la nueva— quedaría varado: la siguiente llamada se rechaza y el dinero ya
se movió. Ése es el único riesgo real, y es exactamente el escenario que la maniobra
producía.

**Las cuatro cosas que la hacen segura:**

1. **No hay nada en vuelo, y está verificado, no supuesto.** El libro mayor de producción
   registra 4 sesiones, 6 turnos, 6 llamadas, **0 mutaciones** y **0 identificadores
   emitidos**; la última actividad fue el 2026-08-24 21:09 UTC. Nunca se ejecutó la
   maniobra. Aun así, la migración lo vuelve a comprobar al aplicarse y se niega si algo
   cambió:

   ```sql
   do $verificar_saga$
   begin
     if exists (
       select 1 from public.agent_turns
        where saga_state <> 'normal' or mutation_limit <> 1
     ) then
       raise exception using
         errcode = '55000',
         message = 'SAGA_EN_VUELO: hay turnos a medias; no se retira la maniobra';
     end if;
   end
   $verificar_saga$;
   ```

2. **Se aplica con los dos interruptores apagados.** `AGENT_INBOUND_ENABLED=false` corta la
   entrada antes de la admisión, así que durante el cambio no puede nacer un turno nuevo.

3. **`CREATE OR REPLACE` conserva firma, dueño y permisos.** No hay `DROP`, así que no hay
   `GRANT` que rehacer ni dependencia que se caiga. Se comprueba con una huella antes y
   después:

   ```sql
   select p.proname, md5(p.prosrc) as cuerpo, p.proacl::text as permisos, p.prosecdef, p.proconfig
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in ('agent_claim_tool_call', 'agent_finalize_tool_call');
   ```

   Los permisos y `prosecdef` deben ser idénticos; el cuerpo, distinto. Cualquier otra
   diferencia aborta el despliegue.

4. **No se borran las columnas muertas.** `agent_turns.saga_state` y
   `agent_turns.mutation_limit` se quedan donde están, con sus valores por omisión.
   Borrarlas obligaría a reescribir la tabla y las dos funciones que las leen, a cambio de
   nada visible. Quedan anotadas como peso muerto para una limpieza posterior.

### 2.6 El expediente (`20260825007000_agent_expediente.sql`)

`public.agent_get_capabilities` es lo primero que ve el modelo hoy, y hace lo que no hay que
hacer: devuelve diez interruptores, tres de ellos encendidos sobre nada, y **ningún estado**.
El modelo que la llama sigue necesitando ocho lecturas más para saber cuándo es la cita, si
está confirmada, cuánto debe y qué puede hacer. Ocho lecturas contra un presupuesto de ocho.

Se retira entera —la función, `agent_get_capabilities_from_workflow` y la ruta
`/tools/capabilities`— y la sustituye **una sola función, `public.agent_open_case_from_workflow`**,
que en una consulta devuelve el expediente completo: la hora local y la zona, la relación, el
nombre de las dos, los plazos reales de esa profesional, hasta tres citas próximas con su
lista de `acciones`, hasta tres pagos con su estado, si puede reseñar, y
`herramientas_disponibles`. Su forma exacta, campo por campo, es de `02-herramientas.md` §2,
que es su dueño.

Tres desajustes del cuerpo viejo que el nuevo no hereda:

- **`submit_review`** se encendía para las 17 pacientes activas, cuando la regla real
  (activa + al menos una cita atendida + sin reseña enviada) sólo admite 11. El expediente
  calcula la regla real. Ofrecer algo que se va a negar es la receta del falso éxito.
- **`list_marketplace_professionals`** se encendía para toda paciente que no fuera tenant o
  estuviera dada de baja, y detrás no hay ninguna operación, ni ruta, ni función. No existe
  en el expediente. Decisión abierta del dueño (§9), supuesto explícito: **el marketplace no
  entra en esta ronda**.
- **`resume_assigned_resources`**, igual, por la misma razón (§8).

Y un cuarto, que es de dónde vienen los datos: el expediente **lee el dominio**
—`appointments`, `payments`, `payment_proofs`, `professional_appointment_policies`— y no el
libro mayor del agente. Así, si una ejecución se murió a media mutación, el siguiente mensaje
dice la verdad sin que nadie tenga que reconciliar nada.

Va al final del orden a propósito: es lo único que el modelo ve, y no debe ver una capacidad
antes de que exista lo que hay detrás.

### 2.7 Los avisos al profesional: las claves exactas

Los seis avisos del agente llegarían en blanco, y esto no se arregla en Kapso ni en la app:
se arregla cambiando el `payload` de los `INSERT INTO public.notifications` que ya están
escritos en `20260825002000` y `20260825003000`.

La fuente no es documentación: son las filas que la app del profesional ya produjo y sabe
leer, consultadas hoy en producción con
`select type, jsonb_object_keys(payload) from public.notifications`.

| Tipo de aviso | Claves que la fila real trae |
|---|---|
| `appointment_created_by_patient` | `patient_first_name`, `patient_last_name`, `appointment_starts_at`, `appointment_ends_at`, `appointment_modality` |
| `appointment_confirmed` | las mismas cinco |
| `appointment_cancelled_by_patient` | las mismas cinco |
| `appointment_rescheduled_by_patient` | `patient_first_name`, `patient_last_name`, `previous_starts_at`, `new_starts_at`, `previous_modality`, `new_modality` |
| `modality_changed_by_patient` | `patient_first_name`, `patient_last_name`, `appointment_starts_at`, `previous_modality`, `new_modality` |
| `payment_proof_received` | `patient_first_name`, `patient_last_name`, `appointment_starts_at` — **y nada más** |

Lo que las migraciones escriben hoy no coincide en ninguno de los seis: mandan `starts_at`
donde va `appointment_starts_at`, `modality` donde va `appointment_modality`,
`old_starts_at` donde va `previous_starts_at`, `old_modality` donde va
`previous_modality`, y **nunca el nombre ni el apellido de la paciente**, que es
justamente con lo que la app arma la frase. Sin esas dos, el aviso cae al texto genérico
«Tienes una notificación nueva» y el push sale igual de mudo.

Y hay una de más: el aviso del comprobante lleva `amount`. **La fila real no trae monto**,
y meterlo ahí es poner una cifra en una pantalla donde el profesional todavía no ha
revisado nada. Se quita.

Las claves internas que las migraciones añaden por su cuenta —`surface`, `command_id`,
`change_policy_result`, `pending_charge_decision`— **también se quitan**. Es cierto que la
app ignora lo que no conoce, así que no estorban hoy; pero un `payload` es lo que un día
alguien pinta en una pantalla o mete en una push, y una clave que ningún lector mira es peso
muerto que se filtra sola. El `payload` lleva exactamente las claves de la tabla y ni una
más (`03-dinero.md` §8.2, regla 4). Y dos reglas de forma que se rompen fácil: el
`timestamptz` se pasa tal cual y **`::text` jamás** —el lector valida el instante con un
patrón que un desplazamiento de dos dígitos no cumple, y el aviso cae al texto neutro sin
dar un solo error—, y la modalidad va en crudo, `online` o `in_person`, porque el lector
tiene su propio diccionario.

### 2.8 Cancelar: falta el cerrojo del dinero, y sin él se pierde dinero de verdad

El dueño decidió que **una cita con dinero adentro no se cancela desde el agente**. Esa
regla no está en el código escrito. `agent_cancel_appointment_from_workflow` tiene dos
ramas económicas y ninguna de las dos la respeta:

```sql
-- 20260825003000, dentro de la matriz económica:
IF v_policy_result = 'on_time' AND v_payment.status = 'pending' THEN
  UPDATE public.payments SET status = 'waived', waive_reason = 'forgiven', ...
ELSIF v_policy_result = 'late'
      AND v_payment.status IN ('pending','credited')
      AND v_payment.late_change_decision IS NULL THEN
  UPDATE public.payments SET late_change_decision = 'pending', ...
END IF;
```

Lo que producen, en los dos casos que importan:

- **A tiempo, con comprobante ya recibido.** El pago sigue `pending` (un comprobante no
  cambia el estado del pago), así que cae en la primera rama y queda `waived/forgiven`:
  el registro dice «no se cobró» sobre un traspaso que sí ocurrió, y **el agente acaba de
  resolver un comprobante**, que es exactamente lo que el dueño prohibió.
- **A tiempo, con el pago ya acreditado.** No cae en ninguna de las dos ramas. La cita
  queda `cancelled` y el pago se queda `credited` con `charge_reason = 'session'` sobre
  una cita cancelada: desaparece de la facturación, la ficha lo pinta «Pagado» sin un
  solo botón, y ninguna función del profesional puede volver a tocarlo. **Dinero sin
  dueño, para siempre.**

El arreglo es una condición más en la cadena de `v_reason`, antes de tocar nada, con la
definición operativa que ya estaba fijada:

```sql
ELSIF v_payment.status = 'credited'::public.payment_status
      OR EXISTS (SELECT 1 FROM public.payment_proofs pp
                  WHERE pp.payment_id = v_payment.id) THEN
  v_reason := 'PAYMENT_INSIDE';
```

Una petición sellada sin archivo (`proof_requested_at` con `payment_proofs` vacío) **no**
cuenta como dinero adentro: no ha llegado nada.

Y no cuesta la mutación del turno: la cadena de `v_reason` termina en
`{"applied": false, ...}`, y esa rama finaliza el reclamo con `rejected_prewrite`, que
`agent_finalize_tool_call` no suma a `committed_mutation_count`. La paciente recibe una
negativa y le queda su mutación intacta para mover la cita en la misma gestión.

Con esto, las dos formas de dinero muerto dejan de poder producirse. Cero funciones
nuevas, cero columnas nuevas.

---

## 3. Las rutas del gateway

Hoy el gateway desplegado declara **27 rutas** y contesta **3** (`/tools/capabilities`,
`/workflow/waiting`, `/workflow/complete`) más `/health`; las otras 24 devuelven
`403 OPERATION_NOT_ENABLED`. El interruptor por ruta es el mapa `DOMAIN_ROUTES` en
`supabase/functions/agent_tool_gateway/handler.ts`: una ruta declarada y ausente del mapa
contesta 403. Borrar un renglón apaga una operación sin tocar nada más.

Todas las rutas llevan siempre las dos claves de correlación, que el modelo nunca escribe:
`kapso_execution_id` y `provider_message_id`. El validador es exacto —una clave de más o
de menos es `400 BAD_REQUEST` y no llega a la base—, los identificadores opacos deben
venir en minúsculas con el formato completo de uuid, y el día en `YYYY-MM-DD`.

### 3.1 Lo que hay que abrir en `agent_node` (conversacional)

Seis rutas, una por operación. Las ocho lecturas sueltas que había aquí se retiran: las
junta el expediente (§2.6).

| Ruta | Cuerpo, además de las dos claves | RPC | Muta |
|---|---|---|---|
| `/tools/expediente` (hoy `/tools/capabilities`) | `relationship_handle` (uuid, o `null`) | `agent_open_case_from_workflow` | no |
| `/tools/appointments/confirm` | `appointment_handle` | `agent_confirm_appointment_from_workflow` | **sí** |
| `/tools/appointments/cancel` | `appointment_handle` | `agent_cancel_appointment_from_workflow` | **sí** |
| `/tools/appointments/modality` | `appointment_handle`, `modality` | `agent_switch_appointment_modality_from_workflow` | **sí** |
| `/tools/payments/proof` (hoy `/media/payment-proof`) | `appointment_handle` | `agent_attach_payment_proof_from_workflow` | **sí** |
| `/tools/reviews/submit` | `rating` (1–5), `comment` (texto o `null`) | `agent_submit_review_from_workflow` | **sí** |

**El cuerpo de `/tools/payments/proof` encoge a una sola clave**, y ése es un cambio con
consecuencias. Los cuatro campos del archivo —`storage_object_path`, `mime_type`,
`size_bytes`, `checksum`— no los escribe el modelo y **tampoco los puede poner un nodo de
Kapso, porque ese nodo no existe**: las funciones desplegadas de Kapso no tocan medios, y
`whatsapp_context` —la única vía por la que una Function Tool vería el archivo— no llega,
porque nuestra ejecución arranca por API. El archivo entra por donde entra todo lo demás:
**`kapso_inbound_webhook`, al admitir el mensaje**, que es el único componente que ve el
mensaje crudo de WhatsApp. Ahí se baja, se guarda en Storage y se dejan los cuatro campos
colgados del renglón de `whatsapp_inbound_messages`; el gateway los recupera por el
`provider_message_id`. La validación de forma —JPEG, PNG o PDF; hasta 5 242 880 octetos;
checksum de 64 hexadecimales— se muda ahí también. **Es trabajo nuevo**: hoy ese archivo no
tiene una sola línea de medios, y `whatsapp_inbound_messages` no tiene dónde guardar los
cuatro campos (sus 22 columnas están verificadas). Sin esa pieza, `registrar_comprobante` no
funciona aunque la función de base ya esté escrita.

### 3.2 Lo que hay que abrir para el formulario

Dos rutas. **No** llevan las dos claves de correlación: llevan el token del formulario, que
es lo único que el endpoint de datos conoce. Van con su propio validador.

| Ruta | Cuerpo | Muta | Paso del formulario |
|---|---|---|---|
| `/flow/cuando` | `flow_token`, `opcion`, `dia` (nulo al abrir la pantalla) | no | `paso: eleccion` y `paso: dia`, con la misma forma de salida |
| `/flow/confirmar` | `flow_token`, `opcion`, `horario` | **sí** | `paso: confirmar`, los dos modos |

Las dos valen con el turno en `active` o en `waiting_external` (§2.3): quien autoriza es el
token, no el estado. Y `/flow/confirmar` reclama con la operación que corresponda al modo:
`flow_create_appointment` o `flow_reschedule_appointment`.

**No hay ruta para la primera pantalla.** `ELEGIR` viaja llena dentro del mensaje que abre
el formulario, así que se pinta sin ir al endpoint —que es lo que Meta recomienda— y nos
ahorra un viaje de diez segundos por gestión. Lo que lista depende del modo: al agendar, las
combinaciones de servicio y modalidad con días abiertos; al mover, **las citas de ella**. El
modo no viaja en ningún cuerpo —el formulario no lo conoce y no debería poder elegirlo—:
viaja dentro de la llave estable del token del formulario (§1.3), que el endpoint lee de la
misma fila de la que ya saca sesión y turno.

De la lista de rutas se van las cuatro viejas de formulario —`/flow/services`,
`/flow/eligibility`, `/flow/availability`, `/flow/create`— y entran estas dos.

**El hueco que la paciente ve tiene que poder volver a mostrarse.** `/flow/cuando` acuña un
identificador `slot` por hora, y esos identificadores chocan contra
`agent_option_tokens UNIQUE (turn_id, kind, stable_key)`: cuando `agent_issue_option_handle`
encuentra una fila con esa misma llave y ya vencida, **no acuña otra**, devuelve
`TOKEN_EXPIRED_STABLE_KEY`. Con el tope de vida en 30 minutos (§1.1) el caso casi desaparece,
pero en el borde de la media hora sigue vivo, y su forma es la peor posible: **la pantalla se
queda vacía para siempre en ese turno.**

El arreglo cabe en una línea, pero **el uuid va al final de la llave, no al principio**, y
esto no es estilo. La llave del hueco tiene una forma que la función de agendar ya parsea
posición por posición, y la primera posición la valida contra el identificador que resolvió:

```sql
-- 20260825003000, dentro de agent_create_appointment_from_workflow:
v_day_text      := split_part(v_stable_key, '|', 2);
v_modality_text := split_part(v_stable_key, '|', 3);
v_start_text    := split_part(v_stable_key, '|', 4);
IF split_part(v_stable_key, '|', 1) IS DISTINCT FROM v_service_id::text
   OR v_modality_text NOT IN ('online', 'in_person') ... THEN
  RAISE EXCEPTION ... 'AGENT_WORKFLOW_CREATE_APPOINTMENT_SLOT_KEY_INVALID';
```

O sea que la forma es `service_id|dia|modalidad|hora_local`, y un uuid delante rompería
**todas** las reservas con un error que ni siquiera es accionable para la paciente. La
llave queda `service_id|dia|modalidad|hora_local|<uuid de la consulta>`: el parseo de los
cuatro primeros campos no cambia, y el quinto es lo único que hace distintos dos toques al
mismo día. Los del toque anterior mueren solos. Caben de sobra en los 255 caracteres que
admite la columna.

**El identificador del hueco sí se consume al reservar** (`p_consume => true`): es la
garantía de que un mismo hueco no se reserva dos veces aunque la pantalla se toque doble.

### 3.3 Lo que hay que abrir en `workflow_internal`

| Ruta | Cuerpo, además de las dos claves | RPC (hay que escribirla, §1.3) | Qué hace |
|---|---|---|---|
| `/workflow/open-booking-flow` | `modo` (`agendar` \| `reprogramar`) | `agent_open_booking_flow_from_workflow` | Reclama `open_booking_flow`, arma la primera pantalla y **acuña el token del formulario** (`kind='flow'`, atado al turno, 30 min, con el modo dentro de la llave estable). La ruta manda el mensaje interactivo por la API de Kapso y **deja el turno esperando**. |
| `/workflow/fixed-response` | `clave` | `agent_send_fixed_response_from_workflow` | Reclama `send_fixed_response` y devuelve el texto compuesto por el servidor. Se admite sin inquilino vivo: es la salida de la paciente dada de baja y del teléfono que no reconocemos. |

**Abrir el formulario sí sella la espera, y ésa es la única transición de estado escondida
dentro de una operación en todo el diseño.** El orden es: apartar la llamada en el portero →
armar la pantalla y acuñar el token → mandar el mensaje por
`POST /meta/whatsapp/v24.0/{phone_number_id}/messages` → cerrar la llamada en el portero →
llamar a `public.agent_mark_inbound_waiting`. Va **después** de cerrar la llamada porque esa
función se niega si queda alguna reserva abierta en el turno. Si el mensaje no logra salir,
no se marca nada: el turno sigue `active`, la ruta contesta `abierto: false` y el agente
sigue la conversación por chat.

Lo que se gana sellando aquí son tres cosas: **una llamada del presupuesto de vuelta al
agente** —a ocho por turno no sobran—, una carrera menos —el primer toque de la paciente ya
no puede llegar antes de que el turno esté parado— y una regla menos en el prompt, porque la
herramienta devuelve `turn_disposition: "wait"` y el modelo sólo tiene que llamar a
`enter_waiting`. Y no encierra al agente, porque después de abrir el formulario el agente no
hace nada más: manda el `mensaje_de_cierre` y se duerme. Si además llamara a `sync_waiting`
no pasaría nada: el cuerpo desplegado de `agent_mark_inbound_waiting` abre con
`IF v_turn.status = 'waiting_external' THEN RETURN true`, así que es idempotente por
construcción.

**Y el mensaje del formulario no pasa por `whatsapp_outbox`**: la cola sólo produce
plantillas y `private.wa_payload_ok` reventaría con una clave que no conoce. Es un mensaje
libre dentro de la ventana de 24 h, que es la misma en la que el agente ya está conversando.
Por eso `agent_tool_gateway` necesita ver `KAPSO_API_KEY`, que ya existe como secreto del
proyecto.

### 3.4 Lo que se queda cerrado, y por qué

**Las dos listas quedan iguales.** Hoy hay una lista declarada (`FUTURE_AGENT_ROUTES`) y un
mapa de las que sí atienden (`DOMAIN_ROUTES`), y una ruta borrada de una sola de las dos se
queda respondiendo. Al terminar, las dos tienen **las mismas doce rutas** más `/health`, y
`403 OPERATION_NOT_ENABLED` deja de ser una respuesta normal del sistema. Las doce están en
`02-herramientas.md` §4.

Dieciséis rutas se van, y **tres de ellas hay que borrarlas en dos lugares**, porque la
edición del árbol de trabajo ya las tiene abiertas en el mapa:

| Ruta | En la lista | En el mapa | Motivo |
|---|---|---|---|
| `/tools/appointments/create` | sí (sólo en el árbol de trabajo) | **sí** | Agendar se hace por formulario. Nunca estuvo en la lista desplegada: lo agregó una edición que no llegó a producción. |
| `/tools/appointments/reschedule` | sí | **sí** | Mover se hace por formulario. |
| `/tools/resources/resume` | sí | **sí** | No hay motor de trabajos: la entrega no puede ocurrir (§8). |
| `/tools/appointments/cancel-then-book` | sí | no | Se retira la maniobra. |
| `/tools/relationship/select`, `/tools/services`, `/tools/booking/eligibility`, `/tools/availability`, `/tools/appointments/upcoming`, `/tools/appointments/next`, `/tools/location`, `/tools/payments/pending`, `/tools/payments/status`, `/tools/profile/share` | sí | no | Las diez lecturas que el expediente junta en una (§2.6). |
| `/flow/services`, `/flow/eligibility` | sí | no | La superficie del formulario queda en dos rutas con nombres nuevos (§3.2). |

Cuenta exacta. La lista desplegada tiene **27** renglones; la del árbol de trabajo tiene
**28**, porque le agregaron `/tools/appointments/create`. Al terminar, las dos tienen **12**,
más `/health`. Y lo que hay que comprobar al desplegar no es la resta sino la igualdad:
`FUTURE_AGENT_ROUTES` y `DOMAIN_ROUTES` tienen que traer exactamente los mismos doce
nombres, y una diferencia entre las dos listas es un fallo de despliegue, no una opción.

---

## 4. Lo que hay que hacer en Kapso

### 4.1 Antes de nada: bajar la verdad

```bash
env -u KAPSO_API_KEY kapso pull
```

El JSON del repositorio miente. Ya pasó: el 2026-08-24 el nodo desplegado entregaba en
`auto_send_assistant_text` y no en `tool_only`, `send_notification_to_user` no estaba
conectada aunque el prompt la ordenaba, y `handoff_to_human` sí lo estaba aunque el prompt
la prohibía. Se perdió un día diagnosticando una desobediencia del modelo que era una
secuencia imposible de ejecutar. **Se compara lo bajado contra lo que este plan pide,
antes de tocar nada.**

### 4.2 Advertencia sobre `kapso push`

Dentro de `definition`, **`nodes` y `edges` son conjuntos de reemplazo**: mandar un nodo
borra los demás. Reglas de operación:

1. Una sola fuente de verdad por workflow, en el repositorio, que siempre se produce a
   partir de un `kapso pull` reciente.
2. Nunca escribir un `definition` parcial a mano.
3. Después de cada `push`, un `pull` y un `diff` contra lo que se mandó. Si no coinciden,
   se restaura del `pull` anterior.

### 4.3 Los pasos, y cuál se puede hacer por línea de comandos

| # | Paso | Cómo | Tablero obligatorio |
|---|---|---|---|
| 1 | Bajar el workflow y las funciones | `kapso pull` | no |
| 2 | Publicar las funciones privadas nuevas y actualizadas | `kapso push` (o la API de funciones) | no |
| 3 | Cambiar la lista de herramientas del Agent Node | `kapso push` del nodo completo | no |
| 4 | Cambiar el prompt del sistema | `kapso push` del nodo completo | no |
| 5 | **Crear y publicar el WhatsApp Flow** | — | **sí** (y Meta) |
| 6 | Registrar la URL del endpoint del Flow y su llave pública firmada | — | **sí** |
| 7 | Probar el Flow con la vista previa interactiva | — | **sí** |
| 8 | Revisar ejecuciones y eventos | `GET /platform/v1/workflow_executions/{id}/events` | no |
| 9 | Rehabilitar el webhook si Kapso lo pausó solo | — | **sí** |

Kapso **no expone clonar ni deprecar un Flow en su Platform API**. Un Flow publicado es
inmutable (error 139001 al intentar editarlo, 139004 al intentar borrarlo): cada cambio es
un clon nuevo por el Meta Proxy (`POST /{waba_id}/flows` con `clone_flow_id`) y un
`POST /{flow_id}/deprecate` para el viejo. Por eso **el `flow_id` vive en una variable de
entorno, nunca incrustado en el código de la función**.

### 4.4 El workflow

Se queda con la misma forma: Start (disparador por API) → Agent Node → Function Node de
cierre. Dos aristas. No hace falta un nodo más: el formulario no es un nodo, es una
llamada desde una herramienta.

Ajustes del workflow, no del nodo:

- `message_debounce_seconds` está en 1 y **es el agrupamiento real de nuestra entrada**
  (el buffering del webhook está apagado y así se queda, que es lo que nos protege del
  problema confirmado de lotes que desaparecen sin dejar fila). Se deja en 1 en esta
  ronda; subirlo es decisión abierta del dueño.
- `agent_default_tools_version` decide qué herramientas nativas son obligatorias. **No hay
  vía documentada para desactivar una herramienta requerida**, así que `handoff_to_human`
  se queda conectada y se contiene por prompt.

### 4.5 Las herramientas del Agent Node

Nativas encendidas, y nada más:

| Herramienta | Para qué |
|---|---|
| `send_notification_to_user` | El único camino por el que sale texto. Sin ella, en `tool_only`, el agente no puede hablar. |
| `enter_waiting` | Pausar al final de cada turno. |
| `complete_task` | Cerrar la gestión. |
| `get_current_datetime` | Ningún modelo tiene una noción fiable de «ahora», y Kapso tampoco la da: `system.started_at` se escribe una vez y `system.last_resume.at` sólo al reanudar. |
| `handoff_to_human` | Requerida por la plataforma. Contenida por prompt. |

`message_delivery_mode` debe ser **`tool_only`**, y esto no es estilo: en el otro modo el
texto plano se entrega solo, la ejecución pausa sola, y cualquier secuencia que el prompt
ordene después es imposible. Además el texto suprimido genera
`agent_assistant_text_suppressed` y la siguiente llamada al modelo puede fallar con
«This model does not support assistant message prefill».

Function Tools que el modelo ve — **seis**, nombradas por intención, no un buzón genérico.
Los nombres y los esquemas son de `02-herramientas.md` §1, que es el dueño del catálogo:

| Herramienta | Ruta que usa por dentro |
|---|---|
| `abrir_expediente` | `/tools/expediente` |
| `gestionar_cita` | `/tools/appointments/confirm`, `/tools/appointments/cancel`, `/tools/appointments/modality` |
| `abrir_formulario` | `/workflow/open-booking-flow` |
| `registrar_comprobante` | `/tools/payments/proof` |
| `enviar_resena` | `/tools/reviews/submit` |
| `responder_con_texto_fijo` | `/workflow/fixed-response` |

**Las seis se declaran siempre, y esto corrige un error del borrador anterior de este
plan**, que decía que «el servidor declara sólo las que la capacidad enciende».
`flow_agent_function_tools` es config del Agent Node y **no hay ninguna vía documentada
para enseñar un catálogo distinto en cada ejecución**. El filtrado, que es la mitigación
medida contra el sesgo posicional, ocurre igual pero **en el resultado**: el expediente
devuelve `herramientas_disponibles`, cada cita devuelve sus `acciones`, cada resultado
devuelve `acciones_disponibles`, y el portero rechaza el resto con un error que vuelve a
nombrar lo que sí queda. Seis nombres ya están dentro del rango donde la precisión de
selección no se degrada.

Cada herramienta usa un esquema **discriminado plano** —`operacion` como `enum` y `datos`
como objeto de un solo nivel, sólo escalares—, nunca un `oneOf` de muchas ramas, y
**ninguna clave es opcional**: las que no aplican van presentes y en `null`, porque el
validador del gateway compara el conjunto exacto de claves. El parser de Kapso es Ruby y
es sensible a la forma; el modo de fallo documentado es que el modelo manda JSON mal
formado, Kapso rechaza por validación, la función nunca corre, y el modelo **abandona la
herramienta** y se va a la nativa con el texto escapado dentro. Cuanto más anidado el
esquema, más probable.

**Las seis cuelgan de una sola función de Kapso**, `agenda-psi-complete-inbound`, que ya
multiplexa dos llamadores (§4.6). Cuál herramienta es se decide por el conjunto exacto de
claves que llegó: los seis conjuntos son distintos, y el único que comparten dos
(`operacion` + `datos`) lo desempata el valor de `operacion`, porque los dos enums son
disjuntos.

### 4.6 Las funciones privadas (Cloudflare Workers)

Hoy hay cuatro desplegadas y el plan gratuito admite cinco. **Clonar un WhatsApp Flow que
cree un worker de endpoint también cuenta.** Hay que terminar en tres:

| Función | Estado |
|---|---|
| `agenda-psi-complete-inbound` | **Se queda, y no se le cambia el nombre.** Es el Function Node de cierre **y** la Function Tool a la vez: distingue una de otra mirando si el cuerpo trae `input` + `flow_info` + `flow_events`, y ese truco se conserva porque **el modelo sólo controla `input`** y así no puede elegir la ruta privilegiada. **Crece para atender las seis herramientas**, que se desempatan por el conjunto exacto de claves (§4.5). Ojo con el nombre: en el repositorio el mismo código se llama `agenda-psi-agent-runtime.js` y en Kapso está publicado como `agenda-psi-complete-inbound`; **manda el nombre publicado**, porque el nodo de cierre del workflow apunta a él y renombrarlo lo rompe. Y lleva la ruta `/tools/capabilities` escrita dentro, que se renombra a `/tools/expediente`: por eso esta función se despliega junto con el gateway, no antes ni después. |
| `agenda-psi-mark-inbound-waiting` | Se queda. Es `sync_waiting`, y **no hay alternativa barata**: Kapso no tiene ningún evento de webhook de espera (la lista de eventos del proyecto es cerrada y no incluye `workflow.execution.waiting`), y `emit_event` está limitado por plan con tope de 10 eventos por ejecución. Con el formulario sellando la espera por su cuenta (§3.3) le queda un solo caso de uso —el agente hizo una pregunta abierta que necesita para terminar lo que empezó— pero ése no tiene otra salida. |
| `agenda-psi-flow-agendar` | **Se retira.** Construida sobre el formulario de una pantalla que devuelve el hueco al chat (§2.2). |
| `agenda-psi-flow-reprogramar` | **Se retira.** Misma razón. |
| `agenda-psi-flow-citas` | **Nueva.** Un solo endpoint de datos para el formulario único, que atiende agendar y reprogramar según lo que diga el token. El código completo está en `04-formulario.md` §4. |

**El orden importa por el tope del plan.** Cuatro publicadas más la nueva serían cinco, y
cinco es el techo: no queda margen si el clon del Flow acaba creando su propio worker.
**Primero se retiran `agenda-psi-flow-agendar` y `agenda-psi-flow-reprogramar`, y hasta
después se publica `agenda-psi-flow-citas`.** Se termina en **tres**, con dos lugares
libres. Y no hace falta un Worker para mandar el mensaje del formulario: ese mensaje lo
manda el gateway (§3.3), que es quien ya tiene la llave de Kapso y el turno sellado.

Firma obligatoria: `async function handler(request, env)`. **No `export default`.** No hay
código compartido entre funciones: lo que se repite, se copia. Tiempo máximo de invocación
**30 s** para funciones; **10 s reales de Meta** para el endpoint del Flow (los 15 que
documenta Kapso son su propio envoltorio). Código máximo 1 MB, errores truncados a 512
caracteres.

El endpoint nuevo tiene que atender **las cuatro acciones de Meta**, no tres:

```js
// INIT          -> primera pantalla (sólo llega si flow_action = data_exchange)
// BACK          -> sólo si la pantalla trae refresh_on_back: true
// data_exchange -> los pasos: eleccion, dia, confirmar
// ping          -> { "data": { "status": "active" } }        <-- requisito de publicación
// y la notificación asíncrona de error -> { "data": { "acknowledged": true } }
```

Kapso **no documenta si contesta el `ping` por su cuenta o lo reenvía**. Se programa el
Worker para las cuatro y se confirma mirando `function_invocations` después del primer
health check de Meta. Responder el health check es uno de los ocho requisitos de
publicación.

El payload que llega ya viene descifrado y con `signature_valid: true`: Kapso hace el
cifrado, el descifrado, la verificación de firma, los secretos y su rotación. No hay que
reimplementar nada de eso.

### 4.7 El Flow

Base: `kapso/flows/agenda-psi-citas.flow.json`, pero **el JSON bueno, entero y listo para
pegar, es el de `04-formulario.md` §3**; el del árbol de trabajo hay que sobrescribirlo
antes de que alguien lo suba. Dos pantallas (`ELEGIR` → `CUANDO`), Flow JSON **7.2**, Data
API **3.0**, `routing_model` presente —que es **obligatorio** cuando el Flow usa endpoint
de datos—.

Tres correcciones al archivo del árbol antes de publicarlo:

1. **Los identificadores de las opciones traen un uuid de dominio dentro**
   (`"s|7b1c0f4e-…|online"`). Tienen que ser identificadores opacos: el `id` es el
   `random_handle` y el `title` es la etiqueta legible. Un identificador desnudo degrada la
   precisión del modelo, pero aquí el problema es otro y peor: el uuid del servicio sale de
   nuestro control y viaja por Meta.
2. **Declara `"version": "7.3"` y `data_api_version: "4.0"`; bajan a `7.2` y `3.0`.** Meta
   recomienda las dos altas, pero **Kapso no documenta 4.0 en ninguna parte** y sólo
   demuestra hasta 7.2 / 3.0, y está en medio del camino descifrando, verificando la firma
   y reenviando. El modo de fallo de ponerla a interpretar un contrato que no conoce es
   silencioso —un Flow que se queda estático sin dar error— y es el más caro de
   diagnosticar de toda la plataforma. Y 7.3 no compra nada: `CalendarPicker` existe desde
   6.1 y ningún componente de este diseño nació después de 7.2.
3. **Trae `include-days` y se quita.** Un solo mecanismo pinta el calendario:
   `unavailable-dates`, que lista todos los días de la ventana que no se ofrecen, fines de
   semana incluidos. Con eso un sábado de trabajo excepcional —que `include-days` habría
   escondido— aparece normalmente. El costo es tamaño, y es despreciable: 18 fechas en 60
   días son unos 230 bytes contra un tope de 10 MB.

Lo demás del JSON está bien y hay que dejarlo así:

- `CalendarPicker` desde Flow JSON 6.1, con `min-date`, `max-date` y `unavailable-dates`.
  **El tamaño no es el problema; el tiempo sí.** El presupuesto real de esa pantalla son
  los **10 segundos de Meta**, y correr el motor de disponibilidad sesenta veces no cabe
  ahí. La detección de días abiertos es **una sola consulta** sobre el horario configurado,
  las excepciones del calendario y los bloqueos — medida el 2026-08-26: 5.7 ms y 268
  páginas, contra 49.8 ms y 2 698 páginas de las sesenta llamadas al motor exacto, y
  **coinciden en los 617 días ofrecidos** de las 18 combinaciones de las cinco
  profesionales. Las horas exactas siguen saliendo del motor completo, y sólo del día que
  la paciente toca. La consulta está escrita en `04-formulario.md` §5.3.
- **`CalendarPicker` no puede ir dentro de un `If`.** La lista de componentes permitidos
  dentro de `If` es explícita y no lo incluye. Si hay que esconderlo, se usa su propio
  `visible`.
- El día exacto sólo se consulta al tocarlo, y `on-select-action` **sólo admite
  `data_exchange`**: por eso el Flow tiene que ser dinámico y por eso hace falta endpoint.
- Dos pantallas está en el punto óptimo: pasar de cuatro baja la tasa de finalización.

**Deriva silenciosa que hay que vigilar:** si el Flow publicado no lleva `data_api_version`
en la raíz y no usa acciones `data_exchange`, **sigue siendo estático** y el endpoint queda
sano pero sin uso. Se confirma mirando `function_invocations` después de la primera
apertura.

Sobre el `flow_token`: si no se da, Kapso usa el `flowId`. Y Kapso enlaza la respuesta con
el Flow **por el mensaje saliente al que responde, no por el valor del token**. Trampa
confirmada: en `send_interactive`, si la ruta de la variable no resuelve, el token sale
**literal**. Hay que comprobar en la primera pasada que el token que llega al endpoint es
el uuid que acuñamos y no la cadena `${...}`.

### 4.8 El prompt

**El texto completo, listo para pegar en `system_prompt`, es el de `05-prompt.md` §1**, con
su justificación sección por sección y su auditoría de conflictos por pares. Aquí sólo va lo
que el despliegue tiene que comprobar.

Siete bloques con etiquetas XML, en este orden: `<rol_y_alcance>`,
`<como_empieza_cada_gestion>`, `<que_puedes_hacer>`, `<caminos_de_decision>`, `<ejemplos>`,
`<contenido_no_confiable>`, `<recordatorio_final>`. La adherencia se degrada de forma no
lineal y es estable hasta unas 30–50 instrucciones; el medio del prompt es donde peor
cumple, así que las cinco reglas duras van arriba y se repiten literales al final.

**No lleva ninguna variable de plantilla**, y eso es una decisión, no un descuido. Un bloque
de estado inyectado sería correcto en el primer mensaje y **falso en el turno de vuelta del
formulario**, que es el que más importa: una reanudación no vuelve a disparar el workflow, y
Kapso persiste el mensaje de sistema al crear el chat. El estado entra por `abrir_expediente`,
que se llama al principio de cada mensaje. Si algún día se inyecta algo, dos hechos
verificados: la forma explícita es `{{vars.nombre}}`, y un nombre que no resuelva **se queda
escrito literal en el prompt**, no se vacía.

Cinco cosas que el despliegue tiene que comprobar, y que se rompen fácil:

1. **Cada turno termina en `send_notification_to_user` y luego `enter_waiting` o
   `complete_task`.** Si termina en texto plano, el texto se suprime.
2. **Cómo termina el turno lo decide `turn_disposition`**, un campo del servidor con tres
   valores y sólo tres: `close`, `keep_open`, `wait`. No es un juicio del modelo. `wait`
   implica que la herramienta **ya dejó el turno en `waiting_external`**, así que después de
   `wait` no se llama a `sync_waiting`.
3. **El mensaje de cierre se copia de `mensaje_de_cierre`**, no se redacta. El falso éxito
   es entre el 44% y el 52% de todos los fallos, y los modelos con razonamiento extendido
   son **peores**; la verificación de estado independiente lo baja unas 15 veces.
4. **Lo que entra por reanudación llega envuelto en `<external_input>`** y el prompt de
   sistema de Kapso le dice al agente que viene de sistemas externos, **no de la paciente**.
   El prompt tiene que decir explícitamente que la respuesta del formulario **sí** es de
   ella, o el agente cambiará de tono en el turno que más importa.
5. **«No menciones X» aumenta la accesibilidad de X.** Enrutamiento positivo siempre; y si
   una prohibición es innegociable —el texto de crisis, `handoff_to_human`— se repite
   literal al final.

No usar «temperatura 0» como explicación de determinismo: los parámetros de muestreo se
descartan mientras el pensamiento extendido está activo. Se comprueba
`supports_custom_sampling` en `GET /platform/v1/provider_models`.

---

## 5. El plan de pruebas reales

### 5.1 El punto ciego, primero

Una prueba anterior pasó **sin demostrar nada**. Dos causas, las dos vigentes:

- **El modal de prueba del tablero usa variables de entorno de Development**, no de
  Production. Si los secretos difieren, está hablando con otro backend. Y la documentación
  **no dice qué payload inyecta ni si sustituye el mensaje del usuario**.
- **`POST /platform/v1/functions/{id}/invoke` manda el cuerpo tal cual**, sin el envelope
  del Agent Node. Si el handler lee `body.execution_context.vars.provider_message_id` y la
  prueba manda `{"provider_message_id": "..."}` en la raíz, la prueba pasa y producción
  falla.

**La regla que cierra el hueco:** ninguna prueba cuenta por lo que devuelve. Cuenta por lo
que quedó escrito. Toda prueba se comprueba abriendo la ejecución y comparando
`agent_tool_called.payload` contra lo esperado, más una consulta a la base.

Y el modal de prueba del tablero **no se usa como evidencia de nada**.

### 5.2 Qué demuestra cada vía

| Vía | Webhook | Conversación | Disparador entrante | Debounce | Agente real | Envelope real | Envío real |
|---|---|---|---|---|---|---|---|
| Modal de prueba del tablero | no | no | simulado | no | sí | no documentado | no |
| Disparo por API | no | parcial | no | no | sí | **sí** | **sí** |
| Reanudación por API | no | no | no | no | sólo la rama de espera | **sí** | **sí** |
| `/functions/{id}/invoke` | no | no | no | no | **no** | **no** | no |
| Vista previa del Flow | no | no | no | no | no | ejerce el endpoint real | no |
| Teléfono real | **sí** | **sí** | **sí** | **sí** | **sí** | **sí** | **sí** |

**El sandbox de WhatsApp no soporta Flows en absoluto.** No sirve para nada de la mitad de
agendar; el número real de producción es la única vía.

### 5.3 Las pruebas

#### P0 · El SQL, en transacción, contra producción

- **Qué la dispara:** Gael manda un lote `begin; set local statement_timeout='30s';
  set local lock_timeout='5s'; <migración exacta> <archivo de pruebas exacto> rollback;`
- **Qué demuestra:** que el SQL corre, que los `GRANT` quedan como se pidieron, y que todas
  las aserciones del archivo de pruebas pasan sobre datos sintéticos.
- **Qué NO demuestra:** carreras entre sesiones, ausencia de bloqueos mutuos, ni nada del
  modelo. Una sola conexión no puede probar concurrencia.
- **Cómo se comprueba:** el lote devuelve `[]` y hace `rollback`. Huella de catálogo antes y
  después (columnas, restricciones, funciones con su ACL, índices, políticas, relaciones,
  disparadores) **idéntica**. Nunca se quita una aserción que falla para que el lote pase.

#### P1 · Cada función de dominio, invocada directo

- **Qué la dispara:** un `select public.agent_*_from_workflow(...)` dentro del mismo lote de
  P0, con sesión y turno sembrados a mano.
- **Qué demuestra:** la regla de negocio y la **redacción del resultado**: que no salgan
  uuid de dominio, ni teléfonos, ni apellidos, ni el monto en el aviso de comprobante —que
  el contrato prohíbe expresamente—.
- **Qué NO demuestra:** el enrutamiento del gateway ni la forma del cuerpo que Kapso manda.
- **Cómo se comprueba:** la aserción compara el jsonb completo. Además, después de cada
  mutación: `select status, change_policy_result, confirmed_at from appointments where ...`
  y `select status, late_change_decision from payments where ...`.

#### P2 · El gateway por HTTP

- **Qué la dispara:** `curl` contra
  `https://ssyzfeadyrczlzjbvxyl.supabase.co/functions/v1/agent_tool_gateway/<ruta>` con
  `authorization: Bearer <AGENT_GATEWAY_SECRET>` y `content-type: application/json`.
- **Qué demuestra:** enrutamiento, autenticación, y el validador exacto de forma.
- **Qué NO demuestra:** que Kapso mande exactamente ese cuerpo.
- **Cómo se comprueba:** una batería corta de negativos que tienen que dar el código
  correcto: sin `authorization` → 401; ruta inexistente → 404; método equivocado → 405;
  sin `content-type` de JSON → 415; una clave de más en el cuerpo → 400; ruta declarada y
  no abierta → 403 `OPERATION_NOT_ENABLED`.

#### P3 · Cada función privada de Kapso, con el envelope reconstruido a mano

**Ésta es la que cierra el punto ciego de las funciones.**

- **Qué la dispara:** `POST /platform/v1/functions/{id}/invoke` con el envelope armado a
  mano, porque Kapso manda el cuerpo tal cual:

```json
{
  "input": { "operacion": "confirmar", "datos": { "cita": "9f1c4d2a-…", "modalidad": null } },
  "execution_context": {
    "vars": { "provider_message_id": "wamid.HBg...", "agent_turn_id": "…", "relationship_state": "tenant" },
    "system": { "workflow_execution_id": "…" }
  },
  "flow_info": { "step_id": "…" },
  "flow_events": []
}
```

- **Qué demuestra:** que el handler lee las rutas correctas del envelope, que arma bien el
  cuerpo hacia el gateway, y que devuelve lo que el modelo necesita.
- **Qué NO demuestra:** **nada del modelo ni de Kapso.** No prueba que Kapso arme ese
  envelope igual, ni que el modelo llame la herramienta, ni que exista el mensaje.
  `whatsapp_context` **no está** en una ejecución arrancada por API, así que una función
  que dependa de él pasa aquí y falla allá.
- **Cómo se comprueba:** la respuesta trae `ok: true` y el resultado esperado, **y** en la
  base aparece la fila nueva en `agent_tool_calls` con el ordinal correcto. Si la fila no
  está, la función mintió.

#### P4 · Disparo por API, con el número explícito

- **Qué la dispara:**

```http
POST https://api.kapso.ai/platform/v1/workflows/{workflow_id}/executions
x-api-key: <KAPSO_API_KEY>
content-type: application/json

{
  "workflow_execution": {
    "phone_number": "+52…",
    "phone_number_id": "1189669584231262",
    "variables": {
      "agent_session_id": "…", "agent_turn_id": "…",
      "provider_message_id": "…", "relationship_state": "tenant"
    },
    "context": { "source": "agenda_psi_agent", "whatsapp_conversation_id": "…" },
    "initial_data": { … }
  }
}
```
  Contesta `202` con `data.id`.

- **Qué demuestra:** el nodo real, el prompt real, el modelo real, el envelope real de las
  Function Tools, y **el envío real de WhatsApp**. Es la prueba más completa que no
  requiere teléfono.
- **Qué NO demuestra:** el webhook, la firma, la admisión, el debounce, ni el disparador de
  mensaje entrante.
- **Cómo se comprueba:** `GET /platform/v1/workflow_executions/{id}/events` (la ruta anidada
  bajo `workflows/{id}` **no está enrutada y da 404**). Se buscan, en orden:
  `agent_iteration_started`, `agent_tool_called`, `agent_tool_response`,
  `agent_message_sent`, `agent_task_completed`. Y en la base:
  `select ordinal, surface, operation, outcome from agent_tool_calls where turn_id = ...
   order by ordinal`.
- **Regla dura:** **nunca disparar sin `phone_number_id`.** Sin él Kapso cae al primer
  config de WhatsApp del proyecto, y un mensaje real posterior puede reanudar esa ejecución
  equivocada.
- **Diagnóstico:** «el agente dijo que lo hizo pero no llamó a la función» se resuelve
  buscando el nombre en `agent_tool_called.payload.tool_name`. Si no hay evento, fue
  decisión del modelo, no un registro perdido. Los transcripts internos completos **no se
  exponen por API pública**.

#### P5 · Ciclo de espera y reanudación

- **Qué la dispara:** después de que P4 deje la ejecución en `waiting`:

```http
POST https://api.kapso.ai/platform/v1/workflow_executions/{id}/resume
{ "message": { "kind": "payload", "data": { … el objeto crudo del mensaje … } } }
```

- **Qué demuestra:** que `sync_waiting` selló `waiting_external` **antes** de que la
  ejecución se durmiera, que la ejecución despierta, y que el agente continúa la misma
  gestión.
- **Qué NO demuestra:** que un mensaje real la reanude. Para mensajes entrantes de WhatsApp,
  si la ejecución está `running` en un paso de agente **el propio paso inyecta el mensaje**,
  que es un camino de código distinto del resume por API.
- **Cómo se comprueba:** antes del resume,
  `select status from agent_turns where id = '<turn>'` debe decir `waiting_external`. La
  llamada contesta `200` pero el trabajo es de fondo: la evidencia son los eventos.
  Negativos que tienen que salir así: sin `message.data` → `400`; ejecución que no está en
  `waiting` → `422`; dos resume seguidos → `409`.
- **Ojo:** lo que entra por resume llega envuelto en `<external_input>`. Hay que leer el
  siguiente `agent_message_sent` y confirmar que el tono no cambió.

#### P6 · Vista previa interactiva del formulario

- **Qué la dispara:** abrir la vista previa del Flow desde el tablero de Kapso y recorrer
  las dos pantallas.
- **Qué demuestra:** **el endpoint de datos real, con cifrado real.** Es la mejor prueba del
  endpoint que existe, y la única posible sin teléfono, porque el sandbox no soporta Flows.
  Demuestra `INIT`, los `data_exchange` de cada paso, la respuesta de cierre, y que las
  pantallas se pintan con lo que devolvemos.
- **Qué NO demuestra:** nada del agente, del envío, ni de la respuesta que vuelve al chat.
- **Cómo se comprueba:** la pestaña Actions muestra petición y respuesta completas. Además:
  `select kind, entity_type, expires_at, consumed_at from agent_option_tokens where turn_id = ...`
  para ver los identificadores acuñados, y `function_invocations` para confirmar que el
  endpoint se está usando de verdad —si no aparece nada, el Flow quedó estático—.
- **Aparte, el health check:** disparar el `ping` y comprobar que contesta
  `{"data":{"status":"active"}}`. Si el endpoint se pone insano, Meta **limita el Flow a 10
  mensajes por hora** y después lo **bloquea**.

#### P7 · La pasada por teléfono real

- **Qué la dispara:** mandar un WhatsApp desde un teléfono vinculado al número de producción
  `1189669584231262`.
- **Qué demuestra:** **lo único que demuestra el webhook, la firma HMAC, el permiso del
  número, la admisión, el debounce de 1 segundo, y el disparador de mensaje entrante** —
  incluida la inyección del mensaje en un agente que ya está corriendo, que ninguna otra vía
  toca. Y es la única forma de abrir el formulario de verdad.
- **Qué NO demuestra:** nada de lo que ya cubrieron P0 a P6; no las repite.
- **Cómo se comprueba:** en orden,
  `select admission_status, agent_session_id, agent_turn_id from whatsapp_inbound_messages
   order by created_at desc limit 3`, luego los eventos de la ejecución, luego la fila de
  dominio que corresponda.
- **Los dos teléfonos que sirven** (verificado: son los únicos dos vínculos con
  `last_inbound_at` no nulo):

  | Últimos 4 | Profesional | Por qué es interesante |
  |---|---|---|
  | 2929 | Araceli | Cobro **antes** de la sesión: es la única con prepago. Anticipación de 48 h. |
  | 0081 | Miranda | Aviso de cambio de **12 h**, no 24. Tiene liga de videollamada y **no** tiene dirección: la ubicación de una cita presencial suya debe devolver nulo explícito, nunca inventar. |

#### P8 · Los cerrojos, en negativo

Cada uno es una fila del turno sembrada a mano y una llamada que **tiene que fallar**:

| Qué se prueba | Cómo se provoca | Qué tiene que salir |
|---|---|---|
| Presupuesto | Turno con `tool_call_count = 8` | `409 TOOL_BUDGET_EXCEEDED` |
| Una mutación por turno | Turno con `committed_mutation_count = 1` | `409 MUTATION_BLOCKED` |
| **La segunda mutación después del formulario** | Turno que ya reservó por formulario y sigue abierto; se le pide adjuntar comprobante | `409 MUTATION_BLOCKED`. **Es la prueba de por qué el agente cierra la gestión al confirmar** (§2.3). |
| Mutación a medias | Turno con una mutación sin `outcome` | `409 MUTATION_PENDING` |
| **Cancelar con dinero adentro** | Cita `scheduled` con su pago `credited`, y otra con un `payment_proofs` colgado | `200` con `{"applied": false, "reason": "PAYMENT_INSIDE"}` (§2.8). Después: el pago sigue igual —ni `waived`, ni `forgiven`, ni `late_change_decision`— y la cita sigue `scheduled`. **Es la prueba de que el dinero no se evapora.** |
| Sin tenant | Turno sin paciente, operación que no sea `open_case` ni `send_fixed_response` | `409 TENANT_REQUIRED` |
| **Paciente dada de baja, y sí recibe respuesta** | Vínculo con `patient_status <> 'active'`; se piden `open_case` y `send_fixed_response` | Las dos tienen que **pasar** y devolver `relacion: "dada_de_baja"` y su texto. Cualquier mutación, `409 TENANT_NOT_ACTIVE`. Sin el arreglo de §2.4 las dos se rechazan y ella no recibe nada. |
| Identidad cruzada | Sesión y turno con teléfonos distintos | `409 CONTEXT_MISMATCH` |
| Identificador de otro turno | Handle emitido en el turno A, resuelto en el B | rechazo de token |
| **Hueco vencido y vuelto a pedir** | Emitir los huecos de un día, vencerlos a mano y volver a pedir el mismo día **con la misma llave estable** | `TOKEN_EXPIRED_STABLE_KEY`. Con el uuid por consulta **al final** de la llave (§3.2) esto **no** debe salir. Y con el uuid al principio, lo que sale es `..._SLOT_KEY_INVALID` al reservar: hay que probar las dos. |
| Réplica exacta | La misma llamada dos veces, misma clave y misma forma | el mismo resultado sellado, **sin recontar** |
| Ambigüedad | **Hay que sembrar un segundo vínculo**: hoy ningún teléfono tiene más de uno | `relationship_state = 'ambiguous'` |
| Tope de mensajes por teléfono | Once mensajes admitidos del mismo teléfono en cinco minutos | el onceavo sale `rate_limited` con `RATE_LIMIT_INBOUND_5M`. No es un fallo: es el cerrojo. Hay que conocerlo antes de probar a máquina. |

#### P9 · La ejecución muerta

- **Qué la dispara:** nada; es una consulta de vigilancia después de cada pasada.
- **Qué demuestra:** si una Function Tool terminó bien sin que se persistiera su
  `agent_tool_response`. Cuando eso pasa, el job global `ResumeStuckFlowExecutionsJob`
  reintenta cada minuto sobre ejecuciones `running` con más de 300 s sin evento, el
  proveedor rechaza un transcript con `tool_use` sin `tool_result`, y la ejecución pasa a
  `failed`, que es **terminal e irrecuperable**.
- **Cómo se comprueba:** en los eventos, buscar un `agent_tool_called` sin su
  `agent_tool_response`. **No hay defensa por reintento**: sólo detección, y diseñar para
  que una ejecución muerta no deje dinero a medio mover. Por eso la reserva es una sola
  transacción y por eso el turno se cierra con estado, no con texto.

#### P10 · Los créditos

- **Qué demuestra:** que hay saldo. Los créditos de IA son un libro contable **distinto** de
  los mensajes del plan.
- **Por qué importa:** al agotarse, el workflow parece activo y el agente parece escribiendo,
  pero **no sale mensaje**. Es un fallo mudo que se confunde con un fallo de prompt.

---

## 6. El recorrido de aceptación

Punta a punta, con el teléfono real terminado en 2929 (Araceli) y con los dos interruptores
encendidos. **Empieza por agendar porque no hay de otra:** verificado que Araceli y Miranda
tienen **cero citas en estado `scheduled` en el futuro**, así que no hay nada que
confirmar, cancelar ni mover hasta que este recorrido cree la primera. (El 2929 sí tiene
una fila futura, del 27 de agosto, pero está `rescheduled`: es una tarjeta cerrada, no una
cita viva, y ninguna operación del agente la toca.)

Son **tres gestiones seguidas, no una**, y el corte entre ellas es lo que se está probando:
el formulario gasta la única mutación de su turno, así que el turno se cierra en cuanto el
agente confirma y el siguiente mensaje abre uno nuevo (§2.3).

**Antes de empezar, dos topes, no uno**, los dos verificados en el cuerpo desplegado de
`agent_register_inbound_context`:

- **Diez mensajes por teléfono en cinco minutos** (`RATE_LIMIT_INBOUND_5M`). El recorrido
  completo son unos doce, así que el onceavo sale `rate_limited` y parece un fallo del
  agente.
- **Cinco turnos nuevos por teléfono en cinco minutos** (`RATE_LIMIT_TURN_PHONE_5M`; hay
  otro de treinta en 24 h). Éste es el que muerde en este diseño, porque **cada gestión
  abre un turno nuevo a propósito**: tres gestiones son tres turnos, y un solo reintento
  del recorrido dentro de la misma ventana llega a seis. El tope sólo cuenta turnos
  nuevos, no las reanudaciones.

Hay que dejar respirar cinco minutos entre gestiones. No es un fallo: es el cerrojo.

**Gestión 1 — agendar**

| # | Paso | Qué hay que ver |
|---|---|---|
| 1 | Mandar «hola» desde el teléfono | En `whatsapp_inbound_messages`, una fila con `admission_status = 'admitted'`, `agent_session_id` y `agent_turn_id` llenos. En Kapso, una ejecución nueva con `phone_number_id` correcto. |
| 2 | El agente contesta | Evento `agent_tool_called` con `abrir_expediente`, luego `agent_message_sent`, luego `complete_task`. En la base, ordinal 1 = `open_case`, ordinal 9 = `complete_inbound`, y el turno `completed`. Llega un mensaje real al teléfono. **Cerrar es lo normal**: un saludo no deja nada pendiente. |
| 3 | «Quiero agendar» | Turno nuevo, porque el paso 2 cerró. `agent_tool_called` con `abrir_expediente` (ordinal 1 = `open_case`) y luego con `abrir_formulario` (ordinal 2 = `open_booking_flow`); un renglón nuevo en `agent_option_tokens` con `kind = 'flow'`, y `agent_turns.status = 'waiting_external'` **puesto por la propia ruta**, sin que el modelo llame a `sync_waiting`. Llega el mensaje con el formulario. |
| 4 | Abrir el formulario | La primera pantalla se pinta **sin ninguna invocación al endpoint**: viaja llena dentro del mensaje. Muestra los servicios de Araceli con **su** precio, uno por combinación de servicio y modalidad. **Ningún uuid a la vista.** Si aparece una invocación con `action: INIT`, el Flow se abrió por otra vía. |
| 5 | Elegir servicio y modalidad | Otra invocación con `paso: eleccion`. El calendario arranca **dos días después de hoy**, no mañana: Araceli pide 48 h de anticipación. Los días sin cupo salen deshabilitados. |
| 6 | Tocar un día, salirse, volver a tocar **el mismo día** | Dos invocaciones con `paso: dia` contra `/flow/cuando`, **las dos con horas**. En `agent_option_tokens`, dos juegos de `slot` con llaves estables distintas. Si la segunda vuelve vacía, falta el uuid por consulta al final de la llave (§3.2). **Y `tool_call_count` sigue en 2**: el formulario no gasta presupuesto. |
| 7 | Tocar «Confirmar cita» | Invocación con `paso: confirmar` contra `/flow/confirmar`. En la base: ordinal 3 = `flow_create_appointment`, `outcome = 'committed'`; una fila nueva en `appointments` con `origin = 'patient'` y **`confirmed_at IS NULL`** (Araceli cobra antes, la cita nace sin confirmar); una fila en `payments` con `status = 'pending'`; y `agent_turns.saga_state` **sigue en `normal`** — si dice `awaiting_replacement_create`, el arreglo del cierre no se aplicó. |
| 8 | El formulario cierra | Llega un mensaje `nfm_reply` al webhook, con `admission_status = 'resumed'` y **el mismo `agent_turn_id` del paso 3** —no uno nuevo—. La ejecución que estaba `waiting` se reanuda y el turno vuelve a `active`. Y el cuerpo de la reanudación es **el sobre de mutación sellado**, con `origen: "formulario"` y su `mensaje_de_cierre`, no el JSON crudo de Meta. |
| 9 | El agente confirma y cierra | Un mensaje real que es **el `mensaje_de_cierre` copiado palabra por palabra**, no una frase que el modelo redactó. No dice «pagado» ni «aprobado». Enseguida `agent_task_completed`: ordinal 9 = `complete_inbound` y `agent_turns.status = 'completed'`. **Si el turno se queda abierto aquí, el resto del recorrido se cae con `MUTATION_BLOCKED`.** |
| 10 | En la app del profesional | El aviso de cita nueva llega **con el nombre de la paciente y la hora**, no en blanco. El push, igual. |

**Gestión 2 — el comprobante**

| # | Paso | Qué hay que ver |
|---|---|---|
| 11 | Mandar la foto del comprobante | Fila `admitted` y **`agent_turn_id` distinto del de la gestión 1**: turno nuevo, mutación nueva. En `whatsapp_inbound_messages`, los cuatro campos del archivo llenos —los puso el webhook al admitir—. `agent_tool_called` con `registrar_comprobante` (ordinal 2 = `attach_payment_proof`, superficie **`agent_node`**); en la base, `payment_proofs` con una fila nueva y `payments.status` **sigue en `pending`**. El comprobante queda pendiente de revisión. En la app, el aviso trae nombre y hora y **no trae el monto**. |
| 12 | «¿Dónde es?» | El agente contesta la dirección de Araceli. Con Miranda, la misma pregunta sobre una cita presencial tiene que decir que no hay dónde, no inventar. |
| 13 | «Cancélala» | El agente **se niega a cancelar** y ofrece mover: la cita ya tiene comprobante, o sea dinero adentro. Si el agente lo intenta de todos modos, la base contesta `{"applied": false, "reason": "PAYMENT_INSIDE"}` (§2.8) y **el pago no se mueve**: sigue `pending` y su comprobante sigue ahí. La negativa no gasta mutación: `committed_mutation_count` sigue en 0 y `agent_tool_calls.outcome` dice `rejected_prewrite`. |

**Gestión 3 — mover**

| # | Paso | Qué hay que ver |
|---|---|---|
| 14 | «Muévela» | Se abre el formulario en modo reprogramar. La primera pantalla lista **las citas de ella**, no los servicios. |
| 15 | Elegir nuevo día y hora | `flow_reschedule_appointment` con `outcome = 'committed'`. La cita vieja queda `rescheduled` conservando su hora y su modalidad; la nueva nace con `rescheduled_from_appointment_id` y `confirmed_at IS NULL`; y **el pago viaja**: el viejo queda `waived/carried_forward` y en `payment_proofs` aparece **una fila nueva colgada del pago nuevo**, con la misma ruta y el mismo checksum. Dos renglones nuevos en `payment_events` con `carried_forward`. |
| 16 | Lo que **no** debe pasar | En `whatsapp_outbox` **no** debe aparecer una fila `appointment_rescheduled` hacia el teléfono de la paciente: el agente acaba de decírselo en el chat y esa plantilla es eco (§1.2). |
| 17 | Cerrar y revisar la basura | `agent_task_completed`, ordinal 9 = `complete_inbound`, turno `completed`. Ningún `agent_tool_called` sin su `agent_tool_response`. Ninguna ejecución en `failed`. |

Si un paso no muestra lo que dice la columna derecha, se detiene el recorrido. No se
continúa «a ver si el siguiente sí».

---

## 7. Cómo se apaga

### 7.1 Los dos interruptores de entorno

Ambos viven en las variables de la función `kapso_inbound_webhook` y sólo el literal `true`
enciende; cualquier otra cosa, incluida la ausencia, apaga.

**`AGENT_INBOUND_ENABLED=false`** — el corte de raíz.

- **Qué apaga:** el webhook contesta `200 {"ok":true,"status":"disabled"}` **antes** de
  llamar a la admisión. No nace sesión, no nace turno, no se registra el mensaje, no se
  llama a Kapso. El corte ocurre después de verificar la firma y el permiso del número, así
  que Kapso sigue viendo `200` y **no cuenta fallos**: el webhook no se pausa solo.
- **Qué NO apaga:** el gateway sigue contestando. Una ejecución de Kapso que ya esté viva
  puede seguir llamando a sus herramientas y **terminar de mover dinero**. Tampoco apaga las
  conversaciones de WhatsApp: la paciente escribe, nadie contesta, y ella no recibe ningún
  aviso de que el servicio está caído.

**`AGENT_WORKFLOW_ENABLED=false`** — el corte quirúrgico.

- **Qué apaga:** el despachador de Kapso no se construye. La admisión sigue corriendo, así
  que el mensaje queda registrado y el turno nace, pero el webhook contesta
  `{"ok":true,"status":"admitted_no_workflow"}` y **nunca se llama al modelo**.
- **Para qué sirve:** es el modo de observación. Se ve entrar el tráfico real, con su
  admisión, su relación resuelta y su turno, sin gastar un solo crédito de IA y sin que
  salga un solo mensaje.
- **Qué NO apaga:** nada de lo que ya está vivo en Kapso, y tampoco el gateway.

### 7.2 El tercero, que es el bueno para una sola profesional

`private.agent_runtime_targets` es un apagador por número, y **falla cerrado**: si no hay
fila, o la fila dice `enabled = false`, `agent_register_inbound_context` devuelve
`TARGET_NOT_ENABLED` y no admite. Hoy hay exactamente una fila, para el número
`1189669584231262`, encendida.

```sql
select public.agent_set_runtime_target('1189669584231262', false);  -- apagar
select public.agent_list_runtime_targets();                          -- ver cómo está
```

A diferencia de los de entorno, éste deja rastro en la base y no requiere redesplegar nada.
**Las dos funciones llegan con la tanda 0**: hoy la tabla existe y tiene su fila encendida,
pero `agent_set_runtime_target` y `agent_list_runtime_targets` todavía no existen
(verificado: `to_regprocedure` devuelve nulo para las dos). Hasta que la tanda 0 se aplique,
este apagador sólo se puede accionar con un `update` a mano sobre la tabla.

### 7.3 Qué pasa con una gestión a medias

Esto es lo que hay que tener claro **antes** de apagar, no después:

- **Lo que ya se escribió, se queda.** Una cita creada, un pago movido, un comprobante
  adjuntado: ninguna de las tres cosas se deshace apagando nada. No hay reversión.
- **El turno abierto se queda abierto** hasta que el barrendero lo vence.
  `sweep_expired_agent_sessions` corre cada 5 minutos y cierra lo vencido; el turno se
  renueva a `LEAST(sesión, ahora + 30 min)` cada vez que **reclama** una llamada o que
  entra un mensaje. Los lectores del formulario no reclaman (§2.3), así que **mientras la
  paciente está dentro del formulario el reloj del turno sí se renueva**, porque
  `/flow/cuando` lo renueva en cada toque igual que lo haría un reclamo (§2.3). Lo que no se
  renueva es el token, que se acuñó una vez: media hora desde que se abrió el formulario es
  todo lo que dura. Y se acaba antes de lo que parece: acuñar un hueco exige `expires_at`
  del token ≤ `expires_at` del turno, así que sobre el final de la media hora el emisor
  contesta `OPTION_EXPIRY_INVALID` y la pantalla de horas vuelve vacía. Decisión pendiente 12.
- **La ejecución de Kapso que estaba `waiting` sigue esperando.** Con el inbound apagado
  nadie la reanuda; muere sola por vencimiento. Si hay que soltarla a mano:
  `PATCH /platform/v1/workflow_executions/{id}` con
  `{"workflow_execution": {"status": "ended"}}`.
- **Un formulario abandonado deja una ejecución dormida.** Si la paciente nunca toca
  «Confirmar», el turno vence a la media hora y la admisión abrirá un turno nuevo la
  próxima vez que escriba, pero **la ejecución vieja de Kapso sigue en `waiting`** y el
  barrendero no la toca: sólo cierra filas de la base. Se suelta con el mismo `PATCH`. Vale
  la pena mirarlo después de cada pasada de pruebas.
- **Un formulario abierto en el teléfono de la paciente sigue abierto.** El token vive 30
  minutos, lo mismo que el turno; después de eso, el endpoint le devuelve la pantalla con
  aviso y listas vacías, que es la razón por la que esa pantalla existe. Si lo toca antes y el gateway está sano, la
  reserva **se hace**: apagar el inbound no cierra el formulario.
- **Lo que nunca se borra como parte de un apagado:** filas de auditoría, identificadores,
  historial de comandos, citas, pagos, materiales ni cola de salida.

**El orden para apagar de emergencia:** primero `AGENT_INBOUND_ENABLED=false` (corta la
entrada), después deshabilitar la ruta de entrada en Kapso (corta el reintento), después
apagar el número en `agent_runtime_targets` (deja constancia). El gateway se deja vivo: es
lo que permite que las ejecuciones que ya están en el aire terminen de escribir en lugar de
dejar el dinero a la mitad.

---

## 8. Qué queda fuera de esta ronda

Se nombra explícitamente para que nadie lo dé por incluido.

### 8.1 La app del profesional

**Intocable en esta ronda**, por decisión del dueño. Consecuencias que hay que aceptar con
los ojos abiertos:

- **La decisión de cobro tardío que nadie encuentra.** Los botones existen y funcionan, pero
  no hay forma de llegar: no aparece en Cobros, no hay punto en el calendario, la tarjeta
  cerrada es una línea muda, y el aviso se borra a las 24 h. Hay que **tocar la tarjeta**.
  Hoy es inofensivo porque nadie produce esas decisiones. **El agente va a empezar a
  producirlas, y va a producirlas todas.** Es el primer punto de la ronda siguiente.
- **La cita que agenda la paciente nace sin poderse editar** cuando cae dentro de las 48 h.
  El profesional ve «Confirmada», no la reconoce, y el botón Editar desaparece sin
  explicación.
- **No puede distinguir quién agendó.** Las columnas existen; las dos funciones que alimentan
  su agenda no las entregan.

Lo único que sí se arregla desde este lado, porque es barato y bloqueante: **los avisos del
agente llegarían en blanco**. Las funciones escritas del agente no escriben ninguna de las
siete claves del contrato ni el nombre de la paciente, así que los seis avisos y sus push
llegarían vacíos. Se arregla dentro de las migraciones, sin tocar la app.

### 8.2 El motor de trabajos, que no existe, y la entrega de materiales, que por eso está muerta

**No hay ningún consumidor de `public.jobs` en la base desplegada.** `claim_jobs_batch` y
`dispatch_jobs` sólo viven en `referencias/database_pseudocodigo/`, no en `pg_proc`, y
ningún cron ni función de borde los invoca. Evidencia dura: el único lote de producción
lleva desde el 25 de agosto en `waiting_for_patient` con el hash del token en nulo, y se
acumulan 7 trabajos de limpieza de comprobantes y 6 de materiales sin atender.

Además, **nada escribe `quick_reply_token_hash`**: el materializador que debería acuñar el
token de la invitación no existe. Y `whatsapp_outbox.send_mode` admite `media`, pero
**ninguna función produce filas `media`**.

Conclusión: **la operación de soltar materiales no puede funcionar aunque se escriba.** Se
retira de esta ronda: la capacidad no existe en el expediente, la ruta
`/tools/resources/resume` se queda cerrada, y la mitad correspondiente de
`20260825004000` no se despliega. Construir el motor de trabajos es una ronda propia.

Nota de paso, para que no sorprenda: el disparador `tg_jobs_solo_recursos_bi` **descarta en
silencio** todo `INSERT` en `jobs` cuyo tipo no sea uno de tres, así que los `INSERT INTO
jobs` que hay dentro de `create_appointment` y `reschedule_appointment` son código muerto
desde hace tiempo.

### 8.3 La moderación de reseñas

**Ninguna función desplegada escribe `moderation_status`.** La tabla `reviews` tiene una
sola política de RLS, de lectura. La moderación es manual y ocurre fuera de SQL.

O sea: todo lo que capture el agente queda `pending` e **invisible** hasta que una persona
lo publique a mano. El agente puede recibir la reseña —eso sí entra en esta ronda, con la
capacidad ya corregida para las 11 pacientes que de verdad califican—, pero **no hay quién
la publique**. Decisión abierta del dueño; supuesto explícito mientras tanto: se recibe y se
queda esperando, y el agente no promete que se vaya a publicar.

### 8.4 El Marketplace

**Intocable en esta ronda**, por decisión del dueño. Hoy `agent_get_capabilities` enciende
`list_marketplace_professionals` para toda paciente que no sea tenant o que esté dada de
baja, y **detrás no hay nada**: ninguna ruta, ninguna función. Es una capacidad que el
modelo ve encendida y no puede ejercer, que es justo el escenario que produce falso éxito.

**No existe en el expediente** (§2.6), y con `agent_get_capabilities` retirada tampoco
queda dónde encenderla. Queda pendiente para el dueño: **qué se le contesta a una paciente dada
de baja que escribe.** Supuesto explícito mientras no decida: una respuesta fija, corta, que
la remita a su profesional; ninguna herramienta encendida.

Aparte, hay material que **no puede llegar al modelo** el día que el marketplace entre:
`published_whatsapp_url` lleva el teléfono dentro, `photo_url` e `intro_video_url` son
enlaces de almacenamiento, `license_numbers` son cédulas, y `reviews.items` es texto libre
escrito por terceras personas, o sea una superficie de inyección.

---

## 9. Decisiones que siguen abiertas y bloquean parte del código

Cada una lleva la recomendación y el supuesto con el que se sigue adelante si no hay
respuesta a tiempo.

| # | Decisión | Recomendación | Supuesto si no hay respuesta |
|---|---|---|---|
| 1 | El cargo por avisar tarde al **reprogramar** | Aceptar que **mover es siempre gratis**. Cero código. Cobrarlo es estructuralmente imposible hoy: el pago viejo queda `waived/carried_forward`, fuera de los tres resolutores, y el nuevo vive en una cita `scheduled`, que ninguno admite. | Mover es gratis. La cita se mueve y el dinero viaja completo. |
| 2 | Trasladar el pago a **la próxima cita** | No construirlo ahora. Hay cero series activas, y mover ya traslada el dinero completo con su comprobante. | No se construye. Cuando hay dinero adentro, el agente ofrece mover y nada más. |
| 3 | El plazo del prepago cuando la cita es en menos de 24 h | **24 h fijas desde que se pidió el comprobante, y nunca sobre una cita que ya empezó.** «Lo que ocurra primero» cancelaba una sesión en curso: entre `starts_at` y `ends_at` la cita sigue `scheduled` y el cron la alcanza, y le manda «tu sesión fue cancelada» a mitad de la hora (`03-dinero.md` §5.3). Consecuencia que se acepta: una cita de prepago para dentro de menos de 24 h no se autocancela nunca. Hoy el caso no existe: la única con cobro antes pide 48 h. | 24 h fijas, nunca sobre una cita empezada. |
| 4 | ¿La cita del formulario nace confirmada alguna vez? | **No, nunca.** En prepago ya está decidido; y con cobro después, la ventana de 48 h choca con la anticipación de 48 h de tres de las cinco profesionales, así que en la práctica ninguna nacería confirmada. Una regla, no dos. | Nace sin confirmar siempre. |
| 5 | Tope de citas sin confirmar por paciente | No existe ninguno hoy, y con 17 pacientes activas no es un problema. Se nombra y se deja. | Sin tope. |
| 6 | Quién publica las reseñas | Hace falta una persona o una función de moderación. No hay ninguna. | Se reciben y esperan. El agente no promete publicación. |
| 7 | El marketplace en esta ronda | Fuera. Apagar la capacidad. | Apagada. |
| 8 | El agrupamiento de mensajes | Dejar `message_debounce_seconds` en 1. El buffering del webhook se queda apagado. Va al final de la fila. | En 1, sin buffering. |
| 9 | Qué se le entrega al profesional en su ficha de cita | Material de la ronda siguiente, pero nombrado: origen, actor, y si el cambio fue a tiempo o tarde. | No se entrega nada nuevo. |
| 10 | Un interruptor real de «mis pacientes pueden agendar solas» | Hace falta. Hoy `is_patient_scheduling_enabled` es un pestillo de una sola dirección: **ninguna función desplegada lo apaga**, y al guardar su primer horario válido queda encendido para siempre. | Sigue siendo pestillo. Se nombra en la ronda siguiente. |
| 11 | Qué se le contesta a la paciente cuando el agente **se niega a cancelar** porque hay dinero adentro (§2.8) y **no hay hueco al cual moverla** | Una respuesta fija que la remite a su profesional. El agente no abre ninguna decisión de cobro por su cuenta: cobrar, condonar y acreditar son del profesional, y abrir una decisión tardía sobre una cita que nadie tocó sería inventar un hecho. | Respuesta fija que remite al profesional. La cita se queda como está y el dinero también. |
| 12 | La media hora que dura un formulario abierto | Dejarla. Con el tope único de 30 minutos (§1.1) el `flow_token` ya dura lo mismo que el turno, y `/flow/cuando` renueva el turno en cada toque; lo único que no se estira es el token, que se acuñó una vez. Estirarlo más obligaría a reemitirlo a media sesión. | Media hora desde que se abre. Pasado ese punto el endpoint devuelve la pantalla con aviso y listas vacías, y la paciente vuelve a pedir el formulario por chat. |

Y una bomba de tiempo que no es decisión de nadie, pero que hay que vigilar desde el día
uno: **el prepago hoy se salva por accidente.** Araceli es la única con cobro antes, y pide
48 h de anticipación, así que sus citas caen fuera de la ventana de 48 h que hace nacer una
cita confirmada. El cron de 26 h filtra `confirmed_at IS NULL`. **El día que baje su margen
a 24 h, el prepago deja de pedirse y no da ningún error.** La decisión 4 —que la cita del
formulario nunca nace confirmada— es lo que la desactiva.
