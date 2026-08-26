# Horarios, disponibilidad y la búsqueda

> **Este archivo sustituye por completo al documento del formulario de WhatsApp.** El
> nombre del archivo se conserva para no romper los enlaces de los demás documentos, pero
> el formulario ya no existe: agendar y reprogramar se hacen conversando. Todo lo que
> decía este archivo sobre pantallas, Flow JSON 7.2, `flow_token` y la superficie
> `flow_data_exchange` **está retirado**.
>
> **`waiting_external` no se retira.** Se retira su uso viejo —dormir esperando una
> pantalla—, pero el estado sigue siendo la pieza con la que la conversación entera cabe
> en **un solo turno**: el agente contesta, estaciona el turno y el mensaje siguiente lo
> reanuda. Verificado en el cuerpo desplegado de `public.agent_register_inbound_context`:
> `v_can_resume` sólo es cierto con `v_turn.status = 'waiting_external'`; con cualquier
> otro estado el turno viejo se marca `expired` y **nace uno nuevo**. Y los
> identificadores de opción los mata el cambio de turno, no el reloj —
> `private.agent_resolve_option_token` rechaza con `TOKEN_CONTEXT_INVALID` si
> `v_token.turn_id IS DISTINCT FROM p_turn_id`—. Sin ese estado, la paciente escoge una
> hora y el identificador que le dimos ya no existe, **siempre**. Es la misma decisión de
> `docs/diseno/01-arquitectura.md` §3.1 y `docs/diseno/02-herramientas.md` §1.1.
>
> Fuente que manda: `docs/anterior/01-decisiones-del-ensayo.md`.
> Medido contra `ssyzfeadyrczlzjbvxyl` el **26 de agosto de 2026, 16:10 hora de la
> Ciudad de México**. Todas las cifras de este documento salen de consultas ejecutadas ese
> día; ninguna viene de memoria ni de documentación.

---

## Índice

1. [El arreglo de la lectura de horarios](#1-el-arreglo-de-la-lectura-de-horarios)
2. [La consulta barata del calendario](#2-la-consulta-barata-del-calendario)
3. [La búsqueda con filtros](#3-la-búsqueda-con-filtros)
4. [Los dos interruptores del motor exacto](#4-los-dos-interruptores-del-motor-exacto)
5. [Cómo se ofrecen las horas](#5-cómo-se-ofrecen-las-horas)
6. [El hueco que se ocupa](#6-el-hueco-que-se-ocupa)
7. [Zonas horarias y horario de verano](#7-zonas-horarias-y-horario-de-verano)
8. [Lo que hay que cambiar](#8-lo-que-hay-que-cambiar)
9. [Lo que queda abierto](#9-lo-que-queda-abierto)

---

## 1. El arreglo de la lectura de horarios

> **Corrección de fondo, verificada hoy.** Los tres arreglos que el ensayo pidió por
> nombre —subir el tope, quitar los traslapes y respetar la franja— **ya están escritos**
> en `supabase/migrations/20260825001000_agent_consultas_agenda.sql`, que **no está
> desplegada** (`supabase_migrations.schema_migrations` termina en `20260824043359`, y
> `pg_proc` no tiene `public.agent_search_availability_from_workflow`). Leído hoy de esa
> migración, líneas 672–711:
>
> - `v_horizon_days constant integer := 30` — no 60.
> - `v_limit constant integer := 10` — **no existe ningún `:= 6` en el archivo**.
> - `p_from_local_time` y `p_to_local_time`, con su filtro por hora de inicio.
> - El barrido sin traslapes, con `v_last_end`.
>
> Este documento **no repite ese trabajo**. Lo que queda por hacer es otra cosa, y está
> en §1.3: bajar el tope a cinco, dejar de contestar de un día en un día, y decir el
> motivo cuando no hay nada.

### 1.1 El caso concreto

Emilio le escribe a Araceli: **«¿qué tienes el viernes?»**

El defecto que el dueño vio ensayando —«3:00, 3:15, 3:30, 3:45, 4:00 y 4:15, y las 5:00
no aparecen nunca»— es real y sigue reproduciéndose **en el motor**: el motor entrega
candidatos cada quince minutos, así que de las seis primeras horas **sólo una es
tomable**. Si escoge las 3:00, la sesión dura una hora y 3:15, 3:30, 3:45, 4:00 y 4:15
quedan muertas en el mismo instante.

Lo que ya no es cierto es que el agente las enseñe así: el barrido sin traslapes y el
filtro de franja están escritos en la migración `20260825001000` y sólo les falta
desplegarse. La medición de abajo separa las dos cosas —lo que da el motor y lo que
queda después del barrido— para que no se confundan otra vez.

**Medición.** Viernes 4 de septiembre, Araceli, Psicoterapia individual en línea
(50 min + 10 de margen = bloques de una hora), horario configurado 15:00–18:00:

```sql
select public._get_internal_availability_core(
  '0deec2d6-4c0e-4726-b5b5-187be7e77b67'::uuid,   -- Araceli
  'c1000000-0000-4000-8000-000000000001'::uuid,   -- Psicoterapia individual
  date '2026-09-04', 'online'::public.modality,
  null::uuid, true, true);
```

| | Resultado |
|---|---|
| Candidatos que devuelve el motor | **9** — 15:00, 15:15, 15:30, 15:45, 16:00, 16:15, 16:30, 16:45, 17:00 |
| Los seis primeros, tal cual (el defecto del ensayo) | **15:00, 15:15, 15:30, 15:45, 16:00, 16:15** |
| Con el barrido sin traslapes de la migración | **15:00, 16:00, 17:00** — **las 5:00 aparecen** |

Y un día completo. Martes 1 de septiembre, la misma profesional, presencial, que trabaja
09:00–14:00 y 15:00–18:00:

| | Resultado |
|---|---|
| Candidatos del motor | **26** |
| Los seis primeros | **09:00, 09:15, 09:30, 09:45, 10:00, 10:15** — se pierde toda la tarde |
| Con el barrido y `v_limit = 10` (lo escrito) | **09:00, 10:00, 11:00, 12:00, 13:00, 15:00, 16:00, 17:00** |
| Con el tope en **cinco**, que es lo que manda el dueño | **09:00, 10:00, 11:00, 12:00, 13:00** |

### 1.2 Qué está ya escrito, y por qué el paso de quince minutos no se toca

El motor **no tiene la culpa**: devuelve los 26 candidatos correctos, en pasos de quince
minutos, porque la app de la profesional los necesita así. Quien escoge qué enseñar es
`public.agent_search_availability_from_workflow`, y ahí ya está escrito el barrido
(migración `20260825001000`, líneas 955–966, copiado tal cual):

```sql
-- TRASLAPES. La primitiva genera un candidato cada 15 minutos, asi
-- que 3:00, 3:15 y 3:30 son la misma hora ofrecida tres veces sobre
-- la misma sala. Se conserva el primero de cada bloque y se descarta
-- todo el que empiece antes de que ese termine.
IF v_last_end IS NOT NULL AND v_slot.start_local < v_last_end THEN
  CONTINUE;
END IF;

-- LA FRANJA QUE PIDIO. Se compara contra la hora de INICIO: «a las
-- 5» quiere decir que la sesion empiece a las 5, no que quepa ahi.
IF (v_from_time IS NOT NULL AND v_slot.start_local::time < v_from_time)
   OR (v_to_time IS NOT NULL AND v_slot.start_local::time > v_to_time) THEN
  CONTINUE;
END IF;
```

Es un barrido en un `FOR` de PL/pgSQL, no un `WITH RECURSIVE`, y hace exactamente lo
mismo: conserva el primero y descarta todo lo que empiece antes de que ése termine. **No
hay nada que reescribir ahí.** Se reusa entero.

### 1.3 Lo que sí falta, y es lo que este documento resuelve

| # | Falta | Por qué |
|---|---|---|
| 1 | **El tope tiene que ser cinco, no diez** | Regla 7 del ensayo: «Cinco opciones como máximo en cualquier lista». El «de seis a diez» de la lista de arreglos del ensayo es más viejo que esa regla y **pierde**; medido, con diez el martes 1 salen ocho horas y ninguna lista de la conversación puede tener ocho |
| 2 | **Deja de contestar de un día en un día** | Hoy recibe `p_day date`: un solo día por llamada. «Martes o jueves por la tarde» son dos llamadas del presupuesto, y «cuando sea» son tantas como días haya que probar |
| 3 | **No dice el motivo cuando no hay nada** | El comentario del propio código lo admite: «Un dia sin huecos es un resultado legitimo: el modelo le propone otro». El modelo no puede saber si es que no trabaja ese día, que ya se llenó o que no alcanza el aviso, así que **adivina o pregunta otra vez** |
| 4 | **La franja tiene el borde de arriba cerrado** | `start_local::time > v_to_time` deja pasar el inicio exacto de `v_to_time`. Con «a las 5» = 17:00–18:00 admitiría las 18:00, que no es «a las 5». Se cambia a `>=` |
| 5 | **El identificador del hueco vive 5 minutos** | Ver §6.5 |

### 1.4 La demostración

**Consulta ejecutada** (el motor no se toca; sólo cambia la selección):

```sql
with raw as (
  select public._get_internal_availability_core(
    '0deec2d6-4c0e-4726-b5b5-187be7e77b67'::uuid,
    'c1000000-0000-4000-8000-000000000001'::uuid,
    date '2026-09-01', 'in_person'::public.modality, null::uuid, true, true) as j
),
cand as (
  select (e->>'start_local')::timestamp as ini,
         (e->>'end_local')::timestamp   as fin,
         row_number() over (order by (e->>'start_local')::timestamp) as ord
    from raw, jsonb_array_elements(raw.j) as t(e)
),
hoy as (
  select jsonb_agg(to_char(ini,'HH24:MI') order by ord) as horas
    from (select * from cand order by ord limit 6) s
),
arreglado as (
  with recursive g as (
    select c.ini, c.fin, c.ord, 1 as n from cand c where c.ord = 1
    union all
    select nx.ini, nx.fin, nx.ord, g.n+1
      from g cross join lateral
        (select c.* from cand c where c.ini >= g.fin order by c.ini limit 1) nx
     where g.n < 10)
  select jsonb_agg(to_char(ini,'HH24:MI') order by ini) as horas from g
)
select (select jsonb_array_length(j) from raw) as candidatos,
       (select horas from hoy)        as hoy,
       (select horas from arreglado)  as arreglado;
```

**Resultado, martes 1 de septiembre, presencial** (reejecutado hoy):

| | Valor |
|---|---|
| `candidatos` | `26` |
| `hoy` (los seis primeros) | `["09:00","09:15","09:30","09:45","10:00","10:15"]` |
| `arreglado_10` (lo escrito) | `["09:00","10:00","11:00","12:00","13:00","15:00","16:00","17:00"]` |
| `arreglado_5` (lo que manda el dueño) | `["09:00","10:00","11:00","12:00","13:00"]` |

Ocho opciones caben en el día, y de ésas se dicen **cinco**. La octava —las 17:00— no se
pierde: si ninguna de las cinco le sirve, la banda horaria de la siguiente pregunta la
trae. Ése es el precio de la regla de cinco y el dueño ya lo pagó a propósito.

**El mismo barrido sobre el viernes que citó el dueño** (viernes 4, en línea, 15:00–18:00):

| | Valor |
|---|---|
| `candidatos` | `9` |
| `hoy` | `["15:00","15:15","15:30","15:45","16:00","16:15"]` |
| `arreglado` | `["15:00","16:00","17:00"]` |

**Las 5:00 aparecen.**

**Y la franja horaria**, con la misma consulta y la banda de la tarde
(`start_local::time >= 12:00 and < 18:00`) aplicada antes del barrido, martes 1
presencial:

```
["12:00","13:00","15:00","16:00","17:00"]
```

Cinco opciones, exactamente cinco, y son **las mismas cinco horas del ejemplo del dueño**:
«los dos días tengo 12:00, 1:00, 3:00, 4:00 y 5:00».

---

## 2. La consulta barata del calendario

El SQL completo está en §3.7, dentro de la función; aquí va qué hace y cuánto cuesta. El
horizonte es de **30 días** —«hoy y los treinta siguientes»— porque el dueño fijó
«horizonte de 30 días» y «si quiere algo más lejano, se consulta de nuevo». La migración
escrita ya trae `v_horizon_days constant integer := 30`, así que ese número no cambia.

Qué hace: en **una sola pasada**, sin llamar al motor exacto ni una vez, dice qué días de
los próximos 30 están abiertos para una combinación de servicio y modalidad. No adivina
«lleno»: eso se descubre con el cálculo exacto, y sólo sobre los días que ésta dejó pasar.

Un día **no** se ofrece cuando:

1. no hay ninguna franja configurada de esa modalidad ese día —ni excepción del día ni
   horario semanal—, o la que hay es más corta que la sesión más su margen;
2. la franja del día está enteramente cubierta por un bloqueo;
3. la franja termina antes de que se cumpla la anticipación mínima de la paciente.

Y **no puede esconder un día que el motor exacto abriría**, porque cada regla se corresponde
con una línea del cuerpo del motor: sólo genera candidatos dentro de bloques de la
modalidad pedida y sólo si el bloque mide al menos una sesión más su margen (regla 1); un
bloqueo que cubre de la primera apertura al último cierre cubre a todos los candidatos
(regla 2); el último candidato posible empieza como mucho a la hora de cierre menos la
sesión (regla 3).

Al revés sí puede pasar, por un solo motivo: los candidatos van de 15 en 15 minutos desde
la apertura, así que el último real puede quedar hasta 14 minutos antes de «cierre menos
sesión». Ese día se ofrece y sale vacío al tocarlo, y termina en el motivo **lleno**, que
es el mismo camino del día que de verdad se llenó. Ningún caso nuevo.

### 2.1 La medición de hoy

Misma profesional, mismo servicio, mismo horizonte, `EXPLAIN (ANALYZE, BUFFERS)`
ejecutado el 26 de agosto de 2026. Araceli, Psicoterapia individual presencial, bloques de
60 minutos, 30 días:

| | Tiempo de ejecución | Páginas leídas |
|---|---|---|
| 30 llamadas al motor exacto | **38.6 ms** | **2 618** |
| La consulta barata, una sola pasada | **1.5 ms** | **171** |

**26 veces más rápida y 15 veces menos páginas.** Devolvió **21 días abiertos** en los 31
días de la ventana. Las cifras se mueven unas décimas entre corridas; el orden de
magnitud —milésimas contra decenas de milésimas— no.

Un detalle del plan que conviene decir: el planificador tardó **2.84 ms** en armar la
consulta barata, más de lo que tarda en correrla. Dentro de una función de PL/pgSQL el
plan se guarda desde la primera vez, así que ese costo se paga una vez por conexión y no
en cada búsqueda. Corriéndola suelta desde un cliente sí se paga siempre; es una razón más
para que viva dentro de la función y no como una consulta armada por fuera.

Y la diferencia importante no es la de hoy, es cómo crecen. La consulta barata toca
`blocked_slots` una vez por día abierto y **no toca `appointments` nunca**; el motor exacto
las toca una vez por candidato por día. Con **cero citas `scheduled`** en toda la base hoy
—verificado: 32 `attended`, 4 `past_pending`, 2 `rescheduled`, 2 `no_show`, 1 `cancelled`,
y **ninguna** `scheduled`— la diferencia son 37 milisegundos. Con una agenda llena, no.

Y ojo con el otro lado de la cuenta: **el precio del motor exacto es por día abierto, no
por búsqueda.** Con 21 días abiertos y una agenda llena, un recorrido sin tope pagaría los
21. Por eso §3.6 le pone tope al número de días que se visitan, y no al número de días que
devolvieron algo.

---

## 3. La búsqueda con filtros

### 3.1 Una sola operación, y se llama `search_availability`

**La búsqueda no es una operación nueva: es la lectura de horarios arreglada.** La
consulta de un solo día desaparece, porque preguntar por un día es pedir la búsqueda con
ese día como filtro. Dos operaciones que hacen lo mismo son complejidad de balde.

**El nombre está zanjado y ya no está en disputa.** Este documento se quedaba antes con
`get_availability`, el nombre desplegado, para no tocar el portero. Ese argumento cayó: el
portero se reescribe entero de todos modos —presupuesto, catálogo, inquilino y saga—, así que
conservar el literal viejo no ahorra nada y sí confunde, porque `get_availability` describe la
firma de un día que es justo la que no sirve. Queda **`search_availability`**, que es el nombre
que llevan el portero escrito (`20260826000000`) y la función escrita
(`public.agent_search_availability_from_workflow`, `20260826002000_agente_busqueda_con_filtros.sql`).
`01-arquitectura.md` §8.0 y `02-herramientas.md` §6.1 dicen ya lo mismo.

**Y exige el turno en `active`, no el doble estado.** El `active` **o** `waiting_external` que
`get_availability` tiene hoy en producción era del formulario, que corría con el turno aparcado.
Sin formulario, quien despierta el turno es el mensaje siguiente y
`agent_bind_inbound_execution` lo devuelve a `active` antes de que el modelo pueda llamar a nada.

> **Dos avisos, para no vender un «cero cambios» que no es cierto de la función entera.**
>
> 1. **El portero sí se toca, y bastante.** El presupuesto que este documento llama «doce»
>    **no está desplegado**: hoy el tope es **ocho**, y está escrito en cinco lugares que se
>    mueven juntos —`private.agent_claim_tool_call` (`tool_call_count >= 8`), el
>    `CHECK agent_turns_tool_call_count_check (tool_call_count <= 8)`, el
>    `CHECK agent_tool_calls_check` (ordinales 1..8 y el 9 reservado al cierre), el índice
>    parcial `uq_agent_tool_calls_one_completion_claim WHERE ordinal = 9`, y las
>    comprobaciones del ordinal 9 en `agent_complete_inbound` y
>    `agent_complete_inbound_from_workflow`—. Los cinco están ya en
>    `20260826000000_agente_portero_conversacional.sql`, los tres de esquema en su sección 0.
>    **Mientras esa migración no se aplique, cada llamada que este documento gasta sale de
>    ocho, no de doce.**
> 2. **El alta de `create_appointment`** —la mutación que agenda por texto— tampoco existe
>    en el portero desplegado. Es de `docs/diseno/02-herramientas.md` §6.2, y la trae la misma
>    migración.

### 3.2 Qué recibe, y por qué las fechas no son fechas

```
p_provider_message_id  text          -- contexto sellado del turno
p_kapso_execution_id   text          -- contexto sellado del turno
p_service_handle       uuid          -- el identificador opaco del servicio
p_modality             text          -- 'online' | 'in_person'
p_dias_semana          smallint[]    -- 0 domingo … 6 sábado. NULL si no nombró días
p_dias_del_mes         smallint[]    -- 1 … 31. NULL si no nombró fechas
p_desde                time          -- inicio de la franja. NULL si no dijo hora
p_hasta                time          -- fin de la franja. NULL si no dijo hora
```

**`p_dias_del_mes` no es un error de nombre.** El dueño fijó que **el agente nunca calcula
fechas**. Si Emilio dice «el 15 y el 16», el modelo no puede resolver de qué mes son sin
hacer aritmética de calendario, que es justo lo prohibido. Lo que sí puede hacer sin
calcular nada es copiar el número: manda `ARRAY[15, 16]` y **el servidor** resuelve cada
número a su próxima ocurrencia dentro del horizonte. Igual con «el próximo martes»:
`p_dias_semana := ARRAY[2]` y el servidor escoge el martes más cercano.

La franja sale de un vocabulario fijo que vive en el prompt, no de una cuenta:

| Lo que ella escribe | `p_desde` | `p_hasta` |
|---|---|---|
| «por la mañana» | `00:00` | `12:00` |
| «al mediodía» | `12:00` | `14:00` |
| «por la tarde» | `12:00` | `18:00` |
| «por la noche» | `18:00` | `23:59` |
| «a las 5» / «a las 5 de la tarde» | `17:00` | `18:00` |
| «después de las 4» | `16:00` | `23:59` |
| «antes de las 12» | `00:00` | `12:00` |
| «entre 3 y 6» | `15:00` | `18:00` |

**El borde de arriba no entra.** La banda es `[p_desde, p_hasta)`: «a las 5» son las
opciones que empiezan a partir de las 17:00 y antes de las 18:00, y las 18:00 en punto no
son «a las 5». La migración escrita usa `>` en vez de `>=` y sí las dejaría pasar; es el
arreglo 4 de §1.3.

Emparejar un texto contra una tabla de ocho renglones no es calcular. Es lo mismo que ya
hace con el nombre del día.

### 3.3 Los días candidatos

```
fecha_minima  = fecha local de (now() + anticipación mínima de la paciente)
fecha_maxima  = fecha local de hoy + 30
```

| Lo que dio | Días candidatos |
|---|---|
| `p_dias_del_mes` | cada número, resuelto a su próxima ocurrencia dentro de `[hoy, fecha_maxima]` |
| `p_dias_semana` (y no fechas) | todos los días de la ventana cuyo día de la semana está en el arreglo |
| ninguno de los dos | todos los días de la ventana |

**Y aquí hay un agujero que el servidor no puede tapar.** Si Emilio dice «el 15 de
diciembre», lo que viaja es `ARRAY[15]` a secas —el mes no viaja, porque el agente no
calcula fechas—, y el 15 **siempre** cae dentro de una ventana de 31 días. No hay ningún
`FUERA_DE_HORIZONTE` que se pueda disparar: el servidor resolvería el 15 de septiembre y
le contestaría opciones de septiembre a alguien que preguntó por diciembre.

Se tapa **arriba, no abajo**, con dos cosas que ya existen y no cuestan nada:

1. **Cada opción viaja con el mes en su etiqueta** — «martes 15 de septiembre» —, así que
   la respuesta nunca es ambigua y él corrige en el mismo mensaje.
2. **Una regla en el prompt**: si ella nombra un mes que no es éste ni el que entra, el
   agente no llama a nada y contesta el horizonte —«sólo puedo apartar hasta el 25 de
   septiembre; escríbeme más cerca de la fecha y te la busco»—. Es exactamente lo que
   pidió el dueño: «si quiere algo más lejano, se consulta de nuevo».

**Por eso no hay ningún motivo `FUERA_DE_HORIZONTE` en la función.** Era código que no se
podía alcanzar.

### 3.4 Los cinco motivos, y cómo se distingue cada uno

Se clasifica **día por día**, en este orden, y el primero que aplica gana:

| # | Motivo | Cómo se detecta | Qué se dice |
|---|---|---|---|
| 1 | `demasiado_pronto` | el día entero es anterior a `fecha_minima`; **o** la parte de la franja configurada que interseca la banda pedida termina antes de `now() + anticipación` | «Para mañana ya no alcanzo: Araceli necesita 48 horas. Lo más cercano es el viernes 28.» |
| 2 | `fecha_bloqueada` | hay una fila en `special_schedules` para esa fecha con `is_working = false`; **o** un `blocked_slots` que cubre de la primera apertura al último cierre del día | «El 15 y 16 Araceli no va a estar. Lo más cercano es el 17.» |
| 3 | `dia_no_laborable` | no hay ninguna franja de esa modalidad ese día —ni excepción ni semanal—, o la que hay mide menos que la sesión más su margen | «Araceli no atiende sábados ni domingos. Entre semana sí tengo.» |
| 4 | `fuera_de_horario` | ninguna franja del día **deja caber la sesión completa empezando dentro de la banda** | «Araceli no da consultas por la mañana. Sus horarios son de 3:00 a 7:00. ¿Te acomoda alguna?» |
| 5 | `lleno` | pasó las cuatro anteriores —el día está abierto y la sesión cabe en la banda— y el motor exacto devuelve **cero** candidatos | «Los martes al mediodía ya se le llenaron. Sí tengo miércoles y jueves a esa hora.» |

El orden no es arbitrario. **Lo primero es el reloj** —de nada sirve decirle que hay lugar
un día al que ya no llega—. **Lo segundo es la fecha concreta**, porque una excepción del
día manda sobre el horario semanal en el propio motor (`uq_special` es
`UNIQUE (professional_id, date)`, así que nunca hay dos compitiendo). Después la semana,
después la hora, y al final la ocupación, que es lo único que exige el cálculo caro.

> **El renglón 4 dice «deja caber la sesión», no «interseca», y la diferencia es una
> mentira.** «Interseca» es lo obvio y está mal. Caso real, medido hoy: Araceli,
> **Psicoterapia Pareja** —90 minutos—, en línea, **martes 1 de septiembre**, «a las 5»
> (banda 17:00–18:00). Sus bloques del martes en línea son 09:00–14:00 y 15:00–18:00, los
> dos intersecan la banda, y sin embargo el último hueco de hora y media del día empieza
> a las **16:30**:
>
> ```sql
> select jsonb_array_length(j), count(*) filter (
>          where (e->>'start_local')::timestamp::time >= time '17:00'
>            and (e->>'start_local')::timestamp::time <  time '18:00')
>   from ( select public._get_internal_availability_core(
>            '0deec2d6-…'::uuid,'c0000000-0000-4000-8000-000000000002'::uuid,
>            date '2026-09-01','online'::public.modality,null::uuid,true,true) as j) r,
>        jsonb_array_elements(r.j) t(e);
> -- 22 candidatos en el dia, 0 dentro de la banda
> ```
>
> Con la agenda **completamente vacía** —cero citas `scheduled` en toda la base—, la regla
> de «interseca» clasificaría eso como `lleno` y el agente diría «ya se le llenaron». Es
> falso y además irrecuperable: ella creería que hay que buscar otro día cuando lo que
> hay que mover es la hora.
>
> La condición correcta, y es una línea: existe un bloque `b` tal que
> `GREATEST(b.abre, p_desde) < p_hasta` **y**
> `GREATEST(b.abre, p_desde) + sesión <= b.cierra`. Medido sobre ese mismo martes:
> `toca_banda` (la regla vieja) da `true`, `cabe_en_banda` (la nueva) da `false`.
>
> **Y no es un día suelto.** Con la regla nueva corrida sobre los 30 días, «martes y
> jueves a las 5» para esa sesión de 90 minutos da `fuera_de_horario` en **los ocho
> martes y jueves** de la ventana; con la vieja, los ocho habrían caído a `lleno`. Y sobre
> la sesión normal de 60 minutos sin banda, la regla nueva devuelve exactamente lo mismo
> que la vieja —21 `abierto`, 8 `dia_no_laborable`, 2 `demasiado_pronto`—, así que no
> cierra ni un día que antes se abriera.

**El motivo que se dice es el del primer día candidato**, y los demás viajan en una lista
por si el agente los necesita. Es una regla de una línea y siempre contesta la pregunta
que ella hizo: «¿y el día que te pedí?».

#### La evidencia de que los cinco se distinguen

**1 · `demasiado_pronto`.** Araceli pide 2 880 minutos (48 h). El mismo motor, el mismo
día, con el interruptor del margen encendido y apagado:

```sql
select d::date as dia, to_char(d::date,'Dy') as nombre,
       jsonb_array_length(public._get_internal_availability_core(
         '0deec2d6-…'::uuid,'c1000000-…'::uuid, d::date,
         'in_person'::public.modality, null::uuid, true, true))  as con_margen,
       jsonb_array_length(public._get_internal_availability_core(
         '0deec2d6-…'::uuid,'c1000000-…'::uuid, d::date,
         'in_person'::public.modality, null::uuid, true, false)) as sin_margen
from generate_series(current_date, current_date+6, interval '1 day') g(d);
```

| Día | | `con_margen` | `sin_margen` | Motivo |
|---|---|---|---|---|
| 2026-08-26 | mié | 0 | 5 | `demasiado_pronto` |
| **2026-08-27** | **jue** | **0** | **26** | **`demasiado_pronto`** |
| 2026-08-28 | vie | 5 | 26 | hay (el margen le come la mañana) |
| 2026-08-29 | sáb | 0 | 0 | `dia_no_laborable` |
| 2026-08-30 | dom | 0 | 0 | `dia_no_laborable` |
| 2026-08-31 | lun | 26 | 26 | hay |
| 2026-09-01 | mar | 26 | 26 | hay |

El jueves 27 es la prueba limpia: **26 huecos si se apaga el margen, cero si se enciende.**
Lo único que lo cierra es el reloj. Y sábado y domingo dan cero con el margen apagado, que
es lo que separa «no trabaja ese día» de «no alcanzas».

> La doble llamada es la **demostración**, no la implementación. En la función el motivo
> sale de comparar fechas —`día < fecha_minima`— sin llamar al motor dos veces. El
> interruptor del margen nunca se apaga en producción (§4).

**2 · `fecha_bloqueada` contra `dia_no_laborable`.** Miranda, Psicoterapia individual en
línea (50 + 10), tercera semana de septiembre:

| Día | | ¿Tiene semana? | `special_schedules.is_working` | Huecos | Motivo |
|---|---|---|---|---|---|
| 2026-09-16 | mié | sí | — | 26 | hay |
| 2026-09-17 | jue | sí | — | 0 | `dia_no_laborable` |
| **2026-09-18** | **vie** | **sí** | **`false`** | **0** | **`fecha_bloqueada`** |
| **2026-09-19** | **sáb** | **sí** | **`false`** | **0** | **`fecha_bloqueada`** |
| **2026-09-20** | **dom** | no | **`false`** | **0** | **`fecha_bloqueada`** |
| 2026-09-21 | lun | no | — | 0 | `dia_no_laborable` |
| 2026-09-22 | mar | sí | — | 0 | `dia_no_laborable` |

Los dos motivos dan cero huecos y se separan con **una columna**: si existe la fila de
`special_schedules` con `is_working = false`, es una fecha que ella cerró; si no existe,
es que ese día de la semana no trabaja. Los tres días bloqueados de Miranda son datos
reales de producción, no un ejemplo inventado.

Y el jueves 17 y el martes 22 enseñan el sub-caso que hay que doblar dentro de
`dia_no_laborable`: Miranda **sí** tiene bloques en línea esos días, pero miden
**30 minutos** (05:00–05:30, 06:00–06:30, 07:00–07:30) y su sesión mide **60**. Hay
horario, y no cabe. Para la paciente eso es «ese día no te puedo dar esa sesión», que es
exactamente lo que dice el motivo.

**3 · `fuera_de_horario`.** Araceli, viernes (día 5), sus bloques configurados por
modalidad:

| Modalidad | Bloques del viernes |
|---|---|
| `in_person` | 09:00–14:00 y 15:00–18:00 |
| `online` | **15:00–18:00 y nada más** |

Un «el viernes por la mañana, en línea» no cabe en `15:00–18:00`. No hace falta llamar
al motor: se ve en `weekly_schedule_blocks`. Y el mismo renglón trae lo que el texto
necesita decir —«sus horarios son de 3:00 a 7:00»— sin que el agente lo invente.

El segundo caso de este mismo motivo es el de la sesión larga del recuadro de arriba:
hay bloque, el bloque toca la banda, y aun así **no cabe una sesión entera empezando
dentro de la banda**. Los dos son «ese día, a esa hora, no» y los dos se ven en la pasada
barata.

**4 · `lleno`.** Es el único que exige el cálculo caro, y por construcción es **lo que
queda** cuando los otros cuatro no aplicaron: el día tiene franja, no está bloqueado, la
sesión cabe dentro de la banda, y aún así el motor devuelve cero. Lo único que resta
candidatos a esa altura son `appointments` con `status = 'scheduled'`, `blocked_slots`
parciales y las citas presenciales del socio de consultorio.

**Hoy no puede dispararse, y eso es la evidencia de que está bien separado:** en toda la
base de producción hay **cero citas en estado `scheduled`** y **cero bloqueos futuros**
—hay seis bloqueos en total y el último terminó **hoy 26 de agosto a las 14:30**, hora de
la Ciudad de México—. El discriminador está vacío, así que el motivo `lleno` no aparece ni
una vez en los 30 días de ninguna de las cinco profesionales. El día que entre la primera
cita, será el único de los cinco que cambie.

**5 · Resumen del discriminador.** Cada motivo se separa con una fuente distinta, y
ninguna hay que crearla:

| Motivo | De dónde sale | ¿Cuesta el motor exacto? |
|---|---|---|
| `demasiado_pronto` | `professional_appointment_policies.patient_min_booking_lead_minutes` + la fecha | no |
| `fecha_bloqueada` | `special_schedules.is_working` / `blocked_slots` | no |
| `dia_no_laborable` | `weekly_schedules` + `weekly_schedule_blocks` (existencia y ancho) | no |
| `fuera_de_horario` | los mismos bloques, contra `[p_desde, p_hasta)` **y contra el ancho de la sesión** | no |
| `lleno` | `appointments` y `blocked_slots`, dentro del motor | **sí** |

**Cuatro de cinco se resuelven en la pasada barata.** El motor exacto sólo corre en los
días que sobrevivieron, y sólo para saber si están llenos.

### 3.5 Lo que devuelve

```jsonc
{
  "ok": true,
  "operation": "search_availability",
  "error": null,
  "data": {
    "timezone": "America/Mexico_City",
    "modality": "in_person",
    "opciones": [
      {
        "slot_handle": "…uuid…",
        "fecha": "2026-09-01",
        "start_local": "2026-09-01 12:00:00",
        "etiqueta_fecha": "martes 1 de septiembre",
        "etiqueta_hora": "12:00 p.m.",
        "etiqueta": "martes 1 de septiembre, 12:00 p.m."
      }
      // … hasta cinco
    ],
    "motivo": null,
    "motivos_por_dia": [],
    "contexto": {}
  }
}
```

Cuando no hay ninguna:

```jsonc
{
  "opciones": [],
  "motivo": "fuera_de_horario",
  "motivos_por_dia": [
    { "fecha": "2026-09-04", "etiqueta_fecha": "viernes 4 de septiembre",
      "motivo": "fuera_de_horario" }
  ],
  "contexto": {
    "horario_del_dia": [{ "abre": "15:00", "cierra": "18:00" }],
    "anticipacion_minutos": 2880
  },
  "alternativas": [
    { "slot_handle": "…uuid…", "fecha": "2026-09-04",
      "etiqueta": "viernes 4 de septiembre, 3:00 p.m." },
    { "slot_handle": "…uuid…", "fecha": "2026-09-04",
      "etiqueta": "viernes 4 de septiembre, 4:00 p.m." }
  ]
}
```

**Así se escriben los cinco textos del dueño sin inventar nada.** «Sus horarios son de
3:00 a 7:00» sale de `horario_del_dia`, que trae **los bloques del día uno por uno** —no
un «de la primera apertura al último cierre», que en un día partido en dos diría «de 9 a
6» y se comería la hora de comida—. «Araceli necesita 48 horas» sale de
`anticipacion_minutos`, que viene de la ficha y **nunca de una constante escrita a mano**.
Y «lo más cercano es el 17», «entre semana sí tengo» y «sí tengo miércoles y jueves a esa
hora» salen de `alternativas`.

**`alternativas` no es un dato, son opciones de verdad, con su identificador.** Es la
misma búsqueda corrida **una segunda vez sin el filtro de días**, conservando modalidad y
banda. Se calcula sólo cuando `opciones` viene vacía. Es la diferencia entre contestarle
«lo más cercano es el 17» —y que ella tenga que volver a preguntar, otra llamada— y
contestarle «el 17 te tengo a las 9, a las 10 o a la 1, ¿cuál?», que cierra en el mismo
mensaje.

> **Por qué no hay función auxiliar.** La versión anterior de este documento invocaba una
> `private.agent_availability_context(…)` que nunca definía: una función fantasma en la
> lista de «lo que hay que cambiar». Con `alternativas` no hace falta ninguna, porque
> `contexto` se queda en dos campos que la pasada barata ya tiene en la mano.

### 3.6 El reparto de las cinco

Una sola regla, tres renglones:

1. Se visitan los días candidatos abiertos **en orden de fecha**, y de cada uno se sacan
   sus opciones sin traslape que pasan la banda, máximo cinco por día.
2. **Se cuentan los días visitados, no los que devolvieron algo, y el tope son cinco.**
   Además se deja de visitar en cuanto ya hay cinco opciones y ella no nombró días.
3. Se reparte **por rondas**: la primera opción de cada día visitado, luego la segunda de
   cada uno, y así hasta juntar cinco.

Qué produce, caso por caso:

| Lo que dijo | Qué sale | Por qué |
|---|---|---|
| «cuando sea» | las cinco más próximas, casi siempre del mismo día | el primer día abierto ya trae cinco, y ahí se detiene |
| «a las 5» | las cinco fechas más próximas a esa hora | en un día cabe **una** opción de una hora dentro de una banda de una hora, así que hay que seguir avanzando de día |
| «el martes» | las cinco del martes más próximo | por rondas sobre un solo día es el orden cronológico |
| «martes y jueves por la tarde» | de los dos días, alternando | por rondas sobre dos días |

El segundo renglón es el que impide que «cuando sea» gaste cinco llamadas al motor cuando
la primera ya contestó, y el tercero es el que impide que «martes y jueves» conteste sólo
martes.

> **El renglón 2 dice «los visitados, no los que devolvieron algo», y eso es una
> corrección, no un matiz.** Si el tope se cuenta sobre los días que trajeron opciones, un
> día abierto y lleno no cuenta y el recorrido sigue. Con la agenda llena —el caso que
> §2.1 dice que importa— eso son **los 21 días abiertos** de la ventana medida hoy, no
> cinco: 21 llamadas al motor, unos 27 ms con agenda vacía y mucho más con agenda llena,
> por una sola pregunta. Contando los visitados, el tope se respeta siempre y la respuesta
> honesta es `lleno` con `alternativas`, que es lo que ella necesita oír.

**Costo máximo: cinco llamadas al motor exacto por pasada**, unos 6.5 ms con la medición
de §2.1, y **diez** en el peor caso, que es cuando la primera pasada sale vacía y hay que
correr la segunda para `alternativas` (§3.5). Trece milisegundos. Y sigue siendo **una
sola llamada del agente al servidor**: el presupuesto cuenta viajes del agente, no trabajo
de la base.

### 3.7 La función completa

```sql
-- ===========================================================================
-- BUSQUEDA DE HORARIOS CON FILTROS
--
-- Reclama la operacion 'search_availability' del catalogo nuevo (11 operaciones
-- private.agent_claim_tool_call. Sustituye a la consulta de un solo dia, que
-- deja de existir (preguntar por un dia es filtrar por ese dia).
--
-- Los bloques 0..3 y el 6 son el andamio comun de la familia (validacion,
-- contexto sellado, llave, claim, finalize) y son identicos a los de las demas
-- lecturas. Lo propio de esta funcion es el bloque 4 y el 5.
-- ===========================================================================
CREATE FUNCTION public.agent_search_availability_from_workflow(
  p_provider_message_id text,
  p_kapso_execution_id text,
  p_service_handle uuid,
  p_modality text,
  p_dias_semana smallint[] DEFAULT NULL,
  p_dias_del_mes smallint[] DEFAULT NULL,
  p_desde time DEFAULT NULL,
  p_hasta time DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $agent_search_availability_from_workflow$
DECLARE
  v_inbound public.whatsapp_inbound_messages%ROWTYPE;
  v_turn public.agent_turns%ROWTYPE;
  v_turn_expires_at timestamptz;
  v_claim jsonb;
  v_finalize jsonb;
  v_tool_call_key text;
  v_input_basis text;
  v_input_sha256 text;
  v_result jsonb;
  v_token jsonb;
  v_service_id uuid;

  -- Propio de la busqueda. Los tres topes son CINCO, y los tres vienen de la
  -- regla 7 del ensayo: "cinco opciones como maximo en cualquier lista". El
  -- "de seis a diez" de la lista de arreglos del ensayo es anterior a esa
  -- regla; con diez, el martes 1 de septiembre salen ocho horas (medido) y
  -- ninguna lista de la conversacion puede tener ocho.
  v_horizonte constant integer := 30;   -- decision del dueno
  v_por_dia   constant integer := 5;    -- tope de opciones que se saca de un dia
  v_dias_max  constant integer := 5;    -- tope de dias que se VISITAN
  v_total_max constant integer := 5;    -- tope de opciones que se devuelven

  v_dias  constant text[] := ARRAY['domingo','lunes','martes','miércoles',
                                   'jueves','viernes','sábado'];
  v_meses constant text[] := ARRAY['enero','febrero','marzo','abril','mayo','junio',
                                   'julio','agosto','septiembre','octubre',
                                   'noviembre','diciembre'];

  v_timezone text;
  v_lead_min integer;
  v_dur_mas_margen integer;
  v_hoy_local date;
  v_fecha_minima date;
  v_fecha_maxima date;
  v_desde time;
  v_hasta time;
  v_nombro_dias boolean;

  v_pasada integer;                    -- 1 = con filtro de dias; 2 = alternativas
  v_dia record;
  v_raw jsonb;
  v_slot record;
  v_dias_vistos integer;               -- dias en que SI se llamo al motor
  v_por_dia_json jsonb;
  v_visitados jsonb;                   -- [[opcion, ...], [opcion, ...]] por dia
  v_repartidas jsonb;
  v_opciones jsonb := '[]'::jsonb;
  v_alternativas jsonb := '[]'::jsonb;
  v_motivos jsonb := '[]'::jsonb;
  v_motivo text;
  v_contexto jsonb := '{}'::jsonb;
  v_ronda integer;
  v_i integer;
  v_option_expires_at timestamptz;
  v_key_id text;
  v_handle jsonb;
  v_rejection text;
BEGIN
  -- 0) VALIDACION ESTRICTA DE ENTRADA. La modalidad y los arreglos entran como
  --    texto y smallint para que un valor fuera del vocabulario sea 22023
  --    nuestro y no un 22P02 crudo del casteo, que el runtime no distingue.
  IF p_provider_message_id IS NULL
     OR NULLIF(pg_catalog.btrim(p_provider_message_id), '') IS NULL
     OR pg_catalog.char_length(p_provider_message_id) > 255
     OR p_kapso_execution_id IS NULL
     OR NULLIF(pg_catalog.btrim(p_kapso_execution_id), '') IS NULL
     OR pg_catalog.char_length(p_kapso_execution_id) > 255
     OR p_service_handle IS NULL
     OR p_modality IS NULL
     OR p_modality NOT IN ('in_person', 'online')
     OR (p_dias_semana IS NOT NULL
         AND (pg_catalog.array_length(p_dias_semana, 1) IS NULL
              OR pg_catalog.array_length(p_dias_semana, 1) > 7
              OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_dias_semana) AS d
                          WHERE d IS NULL OR d < 0 OR d > 6)))
     OR (p_dias_del_mes IS NOT NULL
         AND (pg_catalog.array_length(p_dias_del_mes, 1) IS NULL
              OR pg_catalog.array_length(p_dias_del_mes, 1) > 7
              OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_dias_del_mes) AS d
                          WHERE d IS NULL OR d < 1 OR d > 31)))
     OR ((p_desde IS NULL) <> (p_hasta IS NULL))
     OR (p_desde IS NOT NULL AND p_desde >= p_hasta) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_WORKFLOW_AVAILABILITY_INPUT';
  END IF;

  -- 1) CONTEXTO SELLADO DEL TURNO. Identico al resto de la familia.
  SELECT inbound.* INTO v_inbound
    FROM public.whatsapp_inbound_messages AS inbound
   WHERE inbound.message_sid = p_provider_message_id
   FOR UPDATE;
  IF NOT FOUND OR v_inbound.agent_turn_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'AGENT_WORKFLOW_AVAILABILITY_CONTEXT_INVALID';
  END IF;

  SELECT turn_row.* INTO v_turn
    FROM public.agent_turns AS turn_row
   WHERE turn_row.id = v_inbound.agent_turn_id
   FOR UPDATE;
  IF NOT FOUND
     OR v_inbound.admission_status NOT IN ('admitted', 'resumed')
     OR v_inbound.processed_at IS NOT NULL
     OR v_inbound.kapso_execution_id IS DISTINCT FROM p_kapso_execution_id
     OR v_turn.kapso_execution_id IS DISTINCT FROM p_kapso_execution_id
     -- 'waiting_external' SE QUEDA. No es el estado del formulario retirado:
     -- es el estado en que la conversacion entera cabe en un solo turno, y es
     -- el unico que hace que el identificador que le dimos siga vivo cuando
     -- ella conteste. El portero desplegado ya autoriza los dos para esta
     -- operacion; quitarlo aqui la volveria a partir en un turno por mensaje.
     OR v_turn.status NOT IN ('active', 'waiting_external')
     OR v_inbound.agent_session_id IS DISTINCT FROM v_turn.session_id
     OR v_inbound.phone IS DISTINCT FROM v_turn.phone
     OR v_inbound.target_phone_number_id IS DISTINCT FROM v_turn.target_phone_number_id
     OR v_inbound.kapso_conversation_id IS DISTINCT FROM v_turn.kapso_conversation_id
     OR v_turn.patient_id IS NULL
     OR v_turn.professional_id IS NULL
     OR EXISTS (
       SELECT 1 FROM public.whatsapp_inbound_messages AS later
        WHERE later.agent_turn_id = v_turn.id
          AND (later.received_at, later.message_sid)
            > (v_inbound.received_at, v_inbound.message_sid)
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'AGENT_WORKFLOW_AVAILABILITY_CONTEXT_INVALID';
  END IF;

  -- 2) LLAVE ESTABLE E IMPRONTA, con los seis argumentos del modelo dentro. Los
  --    arreglos se ordenan antes de serializar: el mismo filtro escrito al reves
  --    tiene que ser la misma llamada, no una segunda que gaste presupuesto.
  v_input_basis := pg_catalog.jsonb_build_object(
    'provider_message_id', p_provider_message_id,
    'kapso_execution_id', p_kapso_execution_id,
    'service_handle', p_service_handle,
    'modality', p_modality,
    'dias_semana', (SELECT pg_catalog.array_agg(d ORDER BY d)
                      FROM pg_catalog.unnest(COALESCE(p_dias_semana, '{}')) AS d),
    'dias_del_mes', (SELECT pg_catalog.array_agg(d ORDER BY d)
                      FROM pg_catalog.unnest(COALESCE(p_dias_del_mes, '{}')) AS d),
    'desde', p_desde,
    'hasta', p_hasta
  )::text;
  v_tool_call_key := 'agent-node:get-availability:'
    || pg_catalog.md5(p_provider_message_id || ':' || p_kapso_execution_id
                      || ':' || v_input_basis);
  v_input_sha256 := pg_catalog.md5(v_input_basis)
    || pg_catalog.md5(v_input_basis || ':agent-get-availability:v2');

  -- 3) CLAIM. La operacion es 'search_availability', del catalogo nuevo.
  v_claim := private.agent_claim_tool_call(
    v_turn.id, p_kapso_execution_id, 'agent_node', 'search_availability',
    v_tool_call_key, v_input_sha256, false
  );

  IF v_claim->>'status' = 'finalized'
     AND v_claim->>'reason' = 'EXACT_REPLAY'
     AND v_claim->>'outcome' = 'committed'
     AND pg_catalog.jsonb_typeof(v_claim->'redacted_result') = 'object' THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'ok', 'turn_disposition', 'keep_open',
      'result', v_claim->'redacted_result');
  END IF;

  IF v_claim->>'status' <> 'claimed'
     OR v_claim->>'reason' NOT IN ('CLAIMED', 'EXACT_REPLAY') THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'rejected', 'reason', COALESCE(v_claim->>'reason', 'REJECTED'));
  END IF;

  SELECT turn_row.expires_at INTO v_turn_expires_at
    FROM public.agent_turns AS turn_row WHERE turn_row.id = v_turn.id;

  -- 4) LO PROPIO DE LA BUSQUEDA.
  SELECT professional.timezone,
         COALESCE(policy.patient_min_booking_lead_minutes, 1440)
    INTO v_timezone, v_lead_min
    FROM public.professionals AS professional
    LEFT JOIN public.professional_appointment_policies AS policy
           ON policy.professional_id = professional.id
   WHERE professional.id = v_turn.professional_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'AGENT_WORKFLOW_AVAILABILITY_RESULT_INVALID';
  END IF;

  v_token := private.agent_resolve_option_token(
    v_turn.session_id, v_turn.id, p_service_handle, 'service', false);

  IF v_token->>'status' <> 'resolved' THEN
    v_rejection := 'OPTION_EXPIRED';
  ELSE
    v_service_id := (v_token->>'entity_id')::uuid;
    -- Esta comprobacion cubre exactamente las dos excepciones P0001 que puede
    -- levantar el motor (SERVICE_NOT_FOUND e INVALID_MODALITY), asi que no
    -- hace falta envolver la llamada en un bloque EXCEPTION: un savepoint
    -- dentro de la transaccion del claim rompe la idempotencia.
    SELECT service.duration_minutes + service.buffer_after_minutes
      INTO v_dur_mas_margen
      FROM public.services AS service
     WHERE service.id = v_service_id
       AND service.professional_id = v_turn.professional_id
       AND service.is_active
       AND (service.modality = 'both'::public.service_modality
            OR service.modality::text = p_modality);
    IF NOT FOUND THEN
      v_rejection := 'MODALITY_NOT_SUPPORTED';
    END IF;
  END IF;

  IF v_rejection IS NOT NULL THEN
    v_result := pg_catalog.jsonb_build_object(
      'ok', false, 'operation', 'search_availability',
      'error', v_rejection, 'data', '{}'::jsonb);
  ELSE
    v_hoy_local    := (pg_catalog.now() AT TIME ZONE v_timezone)::date;
    v_fecha_minima := ((pg_catalog.now()
                        + pg_catalog.make_interval(mins => v_lead_min))
                       AT TIME ZONE v_timezone)::date;
    v_fecha_maxima := v_hoy_local + v_horizonte;
    v_desde        := COALESCE(p_desde, time '00:00');
    v_hasta        := COALESCE(p_hasta, time '23:59:59');
    v_nombro_dias  := p_dias_semana IS NOT NULL OR p_dias_del_mes IS NOT NULL;

    -- 4.1) DOS PASADAS COMO MUCHO. La primera respeta el filtro de dias. Si
    --      sale vacia, la segunda repite lo mismo SIN el filtro de dias y de
    --      ahi salen las 'alternativas': opciones de verdad, con identificador,
    --      para que "lo mas cercano es el 17" cierre en el mismo mensaje en vez
    --      de costar otra pregunta. La segunda no corre si la primera trajo
    --      algo, ni si ella no nombro dias (no habria nada que quitar).
    FOR v_pasada IN 1..2 LOOP
      EXIT WHEN v_pasada = 2
            AND (pg_catalog.jsonb_array_length(v_opciones) > 0
                 OR NOT v_nombro_dias);

      v_dias_vistos := 0;
      v_visitados   := '[]'::jsonb;

      -- 4.2) DIAS CANDIDATOS CON SU MOTIVO, en una sola pasada barata. El motor
      --      exacto no se llama aqui ni una vez: los cuatro primeros motivos
      --      salen de horarios, excepciones, bloqueos y el reloj.
      FOR v_dia IN
        WITH ventana AS (
          SELECT g.d::date AS fecha
            FROM pg_catalog.generate_series(v_hoy_local, v_fecha_maxima,
                                            interval '1 day') AS g(d)
           WHERE v_pasada = 2
              OR (p_dias_del_mes IS NOT NULL
                  AND extract(day FROM g.d)::smallint
                      = ANY (p_dias_del_mes))
              OR (p_dias_del_mes IS NULL
                  AND p_dias_semana IS NOT NULL
                  AND extract(dow FROM g.d)::smallint
                      = ANY (p_dias_semana))
              OR (p_dias_del_mes IS NULL AND p_dias_semana IS NULL)
        ),
        -- Un numero del mes se resuelve a su PROXIMA ocurrencia: si dijo "el 1"
        -- y la ventana cruza un mes corto, el 1 aparece dos veces y se queda el
        -- primero. Las dos ramas van entre parentesis: un ORDER BY suelto en un
        -- brazo de UNION ALL es error de sintaxis, no una preferencia de estilo.
        candidato AS (
          (SELECT DISTINCT ON (extract(day FROM fecha)) fecha
             FROM ventana
            WHERE v_pasada = 1 AND p_dias_del_mes IS NOT NULL
            ORDER BY extract(day FROM fecha), fecha)
          UNION ALL
          (SELECT fecha FROM ventana
            WHERE v_pasada = 2 OR p_dias_del_mes IS NULL)
        ),
        -- La franja del dia: la excepcion si existe, si no la semanal. Solo
        -- bloques de la modalidad pedida y solo si cabe la sesion con su margen.
        franja AS (
          SELECT c.fecha,
                 pg_catalog.min(b.start_time) AS abre,
                 pg_catalog.max(b.end_time)   AS cierra,
                 -- CABE EN LA BANDA. No "interseca": el primer inicio posible
                 -- dentro de la banda tiene que dejar entrar la sesion entera.
                 -- Con "interseca", una sesion de 90 min a la que se le pide
                 -- "a las 5" en un bloque 15:00-18:00 sale como 'lleno' con la
                 -- agenda vacia, y el agente miente.
                 pg_catalog.bool_or(
                   GREATEST(b.start_time, v_desde) < v_hasta
                   AND (c.fecha + GREATEST(b.start_time, v_desde))
                       + pg_catalog.make_interval(mins => v_dur_mas_margen)
                       <= (c.fecha + b.end_time)) AS cabe_en_banda,
                 -- El ultimo inicio posible dentro de la banda, como instante
                 -- local: sirve para el segundo 'demasiado_pronto'. Se calcula
                 -- sobre timestamps, no sobre 'time', porque time + interval
                 -- da la vuelta a medianoche.
                 pg_catalog.max(LEAST(
                   (c.fecha + b.end_time)
                     - pg_catalog.make_interval(mins => v_dur_mas_margen),
                   (c.fecha + v_hasta))) AS ultimo_inicio,
                 -- Los bloques uno por uno, para el texto "sus horarios son de
                 -- 3:00 a 7:00". Un min/max diria "de 9 a 6" en un dia partido.
                 pg_catalog.jsonb_agg(
                   pg_catalog.jsonb_build_object(
                     'abre',   pg_catalog.to_char(b.start_time, 'HH24:MI'),
                     'cierra', pg_catalog.to_char(b.end_time,   'HH24:MI'))
                   ORDER BY b.start_time)
                   FILTER (WHERE b.start_time IS NOT NULL) AS bloques
            FROM candidato AS c
            LEFT JOIN LATERAL (
              SELECT ssb.start_time, ssb.end_time
                FROM public.special_schedules AS ss
                JOIN public.special_schedule_blocks AS ssb
                  ON ssb.special_schedule_id = ss.id
                 AND ssb.modality::text = p_modality
               WHERE ss.professional_id = v_turn.professional_id
                 AND ss.date = c.fecha
                 AND ss.is_working
              UNION ALL
              SELECT wsb.start_time, wsb.end_time
                FROM public.weekly_schedules AS ws
                JOIN public.weekly_schedule_blocks AS wsb
                  ON wsb.weekly_schedule_id = ws.id
                 AND wsb.modality::text = p_modality
               WHERE ws.professional_id = v_turn.professional_id
                 AND ws.weekday = extract(dow FROM c.fecha)::smallint
                 AND ws.is_working
                 AND NOT EXISTS (
                   SELECT 1 FROM public.special_schedules AS ss2
                    WHERE ss2.professional_id = v_turn.professional_id
                      AND ss2.date = c.fecha)
            ) AS b
              ON b.end_time - b.start_time
                 >= pg_catalog.make_interval(mins => v_dur_mas_margen)
           GROUP BY c.fecha
        )
        SELECT f.fecha,
               f.bloques,
               CASE
                 -- 1. El reloj. Primero, porque de nada sirve ofrecer un dia al
                 --    que ya no llega.
                 WHEN f.fecha < v_fecha_minima THEN 'demasiado_pronto'
                 -- 2. La fecha concreta. La excepcion del dia manda sobre la
                 --    semana, igual que en el motor.
                 WHEN EXISTS (
                   SELECT 1 FROM public.special_schedules AS ss
                    WHERE ss.professional_id = v_turn.professional_id
                      AND ss.date = f.fecha
                      AND NOT ss.is_working) THEN 'fecha_bloqueada'
                 WHEN f.abre IS NOT NULL AND EXISTS (
                   SELECT 1 FROM public.blocked_slots AS bs
                    WHERE bs.professional_id = v_turn.professional_id
                      AND bs.starts_at <= ((f.fecha + f.abre)   AT TIME ZONE v_timezone)
                      AND bs.ends_at   >= ((f.fecha + f.cierra) AT TIME ZONE v_timezone))
                   THEN 'fecha_bloqueada'
                 -- 3. La semana. Incluye "hay horario pero no cabe la sesion".
                 WHEN f.abre IS NULL THEN 'dia_no_laborable'
                 -- 4. La hora, con el ancho de la sesion adentro.
                 WHEN NOT f.cabe_en_banda THEN 'fuera_de_horario'
                 -- 5. El reloj otra vez, ya con la banda encima: la parte del
                 --    dia que ella pidio se acaba antes de que se cumpla el
                 --    margen. Sigue siendo "no alcanzas", no "esta llena".
                 WHEN (f.ultimo_inicio AT TIME ZONE v_timezone)
                      < pg_catalog.now()
                        + pg_catalog.make_interval(mins => v_lead_min)
                   THEN 'demasiado_pronto'
                 ELSE 'abierto'
               END AS motivo
          FROM franja AS f
         ORDER BY f.fecha
      LOOP
        -- 4.3) Solo los dias abiertos pagan el motor exacto, y solo se anotan
        --      los motivos de la primera pasada: la segunda existe para traer
        --      opciones, no para explicar dias que ella no pidio.
        IF v_dia.motivo <> 'abierto' THEN
          IF v_pasada = 1 THEN
            v_motivos := v_motivos || pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_build_object(
                'fecha', v_dia.fecha,
                'etiqueta_fecha',
                  v_dias[extract(dow FROM v_dia.fecha)::int + 1]
                  || ' ' || extract(day FROM v_dia.fecha)::int || ' de '
                  || v_meses[extract(month FROM v_dia.fecha)::int],
                'motivo', v_dia.motivo));
            IF v_contexto = '{}'::jsonb THEN
              v_contexto := pg_catalog.jsonb_build_object(
                'horario_del_dia', COALESCE(v_dia.bloques, '[]'::jsonb),
                'anticipacion_minutos', v_lead_min);
            END IF;
          END IF;
          CONTINUE;
        END IF;

        -- EL TOPE SE CUENTA AQUI, ANTES DE SABER SI EL DIA TRAJO ALGO. Contarlo
        -- despues deja que un dia abierto y lleno no cuente, y con la agenda
        -- llena eso son los 21 dias abiertos de la ventana, no cinco.
        v_dias_vistos := v_dias_vistos + 1;

        v_raw := public._get_internal_availability_core(
          v_turn.professional_id, v_service_id, v_dia.fecha,
          p_modality::public.modality,
          NULL::uuid,
          true,   -- solo dentro del horario configurado por la profesional
          true    -- modo paciente: aplica el margen minimo de anticipacion
        );

        -- Banda primero, barrido sin traslapes despues, tope al final. Aqui
        -- NO se acuna ningun identificador: se acunan en el reparto, para no
        -- dejar hasta veinte huecos vivos que nadie va a ver.
        v_por_dia_json := '[]'::jsonb;
        FOR v_slot IN
          WITH RECURSIVE candidato AS (
            SELECT (element->>'start_local')::timestamp AS ini,
                   (element->>'end_local')::timestamp   AS fin,
                   pg_catalog.row_number() OVER (
                     ORDER BY (element->>'start_local')::timestamp) AS orden
              FROM pg_catalog.jsonb_array_elements(v_raw) AS slot(element)
             WHERE (element->>'start_local')::timestamp::time >= v_desde
               AND (element->>'start_local')::timestamp::time <  v_hasta
          ),
          sin_traslape AS (
            SELECT c.ini, c.fin, c.orden, 1 AS n
              FROM candidato AS c
             WHERE c.orden = (SELECT pg_catalog.min(orden) FROM candidato)
            UNION ALL
            SELECT s.ini, s.fin, s.orden, previo.n + 1
              FROM sin_traslape AS previo
              CROSS JOIN LATERAL (
                SELECT c.ini, c.fin, c.orden FROM candidato AS c
                 WHERE c.ini >= previo.fin ORDER BY c.ini LIMIT 1) AS s
             WHERE previo.n < v_por_dia
          )
          SELECT ini FROM sin_traslape ORDER BY ini
        LOOP
          v_por_dia_json := v_por_dia_json || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'fecha', v_dia.fecha,
              'start_local', v_slot.ini,
              'etiqueta_fecha',
                v_dias[extract(dow FROM v_dia.fecha)::int + 1]
                || ' ' || extract(day FROM v_dia.fecha)::int || ' de '
                || v_meses[extract(month FROM v_dia.fecha)::int],
              'etiqueta_hora',
                pg_catalog.ltrim(pg_catalog.to_char(v_slot.ini, 'HH12:MI'), '0')
                || CASE WHEN pg_catalog.to_char(v_slot.ini, 'AM') = 'AM'
                        THEN ' a.m.' ELSE ' p.m.' END));
        END LOOP;

        IF pg_catalog.jsonb_array_length(v_por_dia_json) = 0 THEN
          -- Paso las cuatro guardas baratas y aun asi no hay nada: esta llena.
          IF v_pasada = 1 THEN
            v_motivos := v_motivos || pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_build_object(
                'fecha', v_dia.fecha,
                'etiqueta_fecha',
                  v_dias[extract(dow FROM v_dia.fecha)::int + 1]
                  || ' ' || extract(day FROM v_dia.fecha)::int || ' de '
                  || v_meses[extract(month FROM v_dia.fecha)::int],
                'motivo', 'lleno'));
            IF v_contexto = '{}'::jsonb THEN
              v_contexto := pg_catalog.jsonb_build_object(
                'horario_del_dia', COALESCE(v_dia.bloques, '[]'::jsonb),
                'anticipacion_minutos', v_lead_min);
            END IF;
          END IF;
        ELSE
          v_visitados := v_visitados || pg_catalog.jsonb_build_array(v_por_dia_json);
        END IF;

        -- Se deja de visitar al llegar al tope de dias, o en cuanto ya alcanza
        -- y ella no nombro dias.
        EXIT WHEN v_dias_vistos >= v_dias_max
               OR (NOT v_nombro_dias
                   AND (SELECT COALESCE(pg_catalog.sum(
                                 pg_catalog.jsonb_array_length(d)), 0)
                          FROM pg_catalog.jsonb_array_elements(v_visitados) AS d)
                       >= v_total_max);
      END LOOP;

      -- 5) REPARTO POR RONDAS. La primera opcion de cada dia visitado, luego la
      --    segunda de cada uno, hasta cinco. Con un solo dia es el orden
      --    cronologico, que es lo que quiere "cuando sea". Aqui, y solo aqui,
      --    se acuna el identificador: exactamente cinco por busqueda.
      v_repartidas := '[]'::jsonb;
      v_ronda := 0;
      WHILE pg_catalog.jsonb_array_length(v_repartidas) < v_total_max
            AND v_ronda < v_por_dia LOOP
        v_i := 0;
        WHILE v_i < pg_catalog.jsonb_array_length(v_visitados)
              AND pg_catalog.jsonb_array_length(v_repartidas) < v_total_max LOOP
          IF v_visitados->v_i->v_ronda IS NOT NULL THEN
            IF v_key_id IS NULL THEN
              -- El identificador vive lo que vive el turno, ni un minuto mas:
              -- el emisor ya rechaza cualquier vencimiento que pase del turno o
              -- de la sesion, asi que el turno ES el tope (ver 6.5).
              v_option_expires_at := v_turn_expires_at;
              SELECT key_row.key_id INTO v_key_id
                FROM private.agent_token_key_registry AS key_row
               WHERE key_row.can_issue
                 AND key_row.verify_until > pg_catalog.now()
                 AND key_row.verify_until >= v_option_expires_at;
              IF NOT FOUND THEN
                RAISE EXCEPTION USING ERRCODE = '55000',
                  MESSAGE = 'AGENT_WORKFLOW_AVAILABILITY_TOKEN_KEY_MISSING';
              END IF;
            END IF;

            -- entity_id de un 'slot' ES el service_id: asi lo valida el emisor.
            -- El instante concreto viaja en stable_key, con la convencion de la
            -- familia: service_id|dia|modalidad|hora_local. La mutacion de crear
            -- lee justo eso.
            v_handle := private.agent_issue_option_handle(
              v_turn.session_id, v_turn.id, 'slot', 'service_slot', v_service_id,
              v_service_id::text || '|'
                || (v_visitados->v_i->v_ronda->>'fecha') || '|'
                || p_modality || '|'
                || (v_visitados->v_i->v_ronda->>'start_local'),
              v_key_id, v_option_expires_at, true);
            IF v_handle->>'status' <> 'issued'
               OR v_handle->>'reason' NOT IN ('ISSUED', 'EXACT_REPLAY') THEN
              RAISE EXCEPTION USING ERRCODE = '55000',
                MESSAGE = 'AGENT_WORKFLOW_AVAILABILITY_HANDLE_REJECTED';
            END IF;

            v_repartidas := v_repartidas || pg_catalog.jsonb_build_array(
              (v_visitados->v_i->v_ronda)
              || pg_catalog.jsonb_build_object(
                   'slot_handle', v_handle->>'random_handle',
                   'etiqueta',
                   (v_visitados->v_i->v_ronda->>'etiqueta_fecha') || ', '
                   || (v_visitados->v_i->v_ronda->>'etiqueta_hora')));
          END IF;
          v_i := v_i + 1;
        END LOOP;
        v_ronda := v_ronda + 1;
      END LOOP;

      IF v_pasada = 1 THEN
        v_opciones := v_repartidas;
      ELSE
        v_alternativas := v_repartidas;
      END IF;
    END LOOP;

    -- 5.1) El motivo que se dice es el del PRIMER dia candidato, y el resto
    --      viaja en la lista. Una regla de una linea que siempre contesta la
    --      pregunta que ella hizo.
    IF pg_catalog.jsonb_array_length(v_opciones) = 0 THEN
      v_motivo := v_motivos->0->>'motivo';
    ELSE
      v_contexto := '{}'::jsonb;
      v_motivos  := '[]'::jsonb;
    END IF;

    v_result := pg_catalog.jsonb_build_object(
      'ok', true, 'operation', 'search_availability', 'error', NULL::text,
      'data', pg_catalog.jsonb_build_object(
        'timezone', v_timezone,
        'modality', p_modality,
        'opciones', v_opciones,
        'motivo', v_motivo,
        'motivos_por_dia', v_motivos,
        'contexto', v_contexto,
        'alternativas', v_alternativas));
  END IF;

  -- 6) FINALIZE. Identico al resto de la familia.
  v_finalize := private.agent_finalize_tool_call(
    v_turn.id, v_tool_call_key, 'committed', v_result);
  IF v_finalize->>'status' <> 'finalized'
     OR v_finalize->>'reason' NOT IN ('FINALIZED', 'EXACT_REPLAY')
     OR v_finalize->>'outcome' <> 'committed'
     OR v_finalize->'redacted_result' IS DISTINCT FROM v_result THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'AGENT_WORKFLOW_AVAILABILITY_FINALIZE_REJECTED';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'ok', 'turn_disposition', 'keep_open', 'result', v_result);
END;
$agent_search_availability_from_workflow$;

REVOKE ALL ON FUNCTION public.agent_search_availability_from_workflow(
  text, text, uuid, text, smallint[], smallint[], time, time)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agent_search_availability_from_workflow(
  text, text, uuid, text, smallint[], smallint[], time, time)
  TO service_role;
```

**El resultado cabe de sobra en el tope de tamaño.** `chk_agent_tool_calls_redacted_result_size`
limita el resultado guardado a 16 384 bytes; cinco opciones más cinco alternativas más
hasta cinco motivos con etiqueta rondan los mil quinientos.

**Ocho cosas de este cuerpo que no son de estilo, y por qué.**

| # | Qué | Por qué |
|---|---|---|
| 1 | `v_turn.status NOT IN ('active','waiting_external')` | Sin `waiting_external` la conversación se parte en un turno por mensaje, y `private.agent_resolve_option_token` mata el identificador en cuanto cambia el turno. La paciente escogería una hora que ya no existe, **siempre** |
| 2 | Los dos brazos de `candidato` entre paréntesis | Un `ORDER BY` suelto dentro de un brazo de `UNION ALL` es **error de sintaxis**. Probado en la base: `ERROR: 42601: syntax error at or near "union"`. Con paréntesis compila y devuelve lo esperado |
| 3 | `cabe_en_banda` en vez de «interseca» | Es la mentira del recuadro de §3.4: sin el ancho de la sesión, un día vacío sale como `lleno` |
| 4 | `ultimo_inicio` como `timestamp`, no como `time` | `time '23:30' + interval '60 minutes'` da la vuelta a medianoche y da `00:30`. Con la fecha pegada no hay vuelta |
| 5 | `bloques` en vez de `abre`/`cierra` para el texto | Un `min`/`max` sobre un día partido en dos diría «de 9 a 6» y se comería la hora de comida |
| 6 | `v_dias_vistos` antes de mirar el resultado | Contar los días productivos deja el recorrido sin tope real cuando la agenda está llena |
| 7 | Los identificadores se acuñan en el reparto | Acuñarlos en el recorrido crea hasta veinticinco filas en `agent_option_tokens` para enseñar cinco. Se acuñan exactamente las que se dicen |
| 8 | Sin bloque `EXCEPTION` alrededor del motor | Las dos excepciones `P0001` del motor (`SERVICE_NOT_FOUND`, `INVALID_MODALITY`) ya están cubiertas por el `SELECT` que valida el servicio antes. Un `BEGIN … EXCEPTION` abre un savepoint dentro de la transacción del claim, y eso rompe la idempotencia |

### 3.8 Lo que se retira de la migración

De `20260825001000_agent_consultas_agenda.sql`, en la definición de
`agent_search_availability_from_workflow` (líneas 672–1035, leídas hoy):

| Se va | Por qué |
|---|---|
| `p_day date` | lo sustituyen `p_dias_semana` y `p_dias_del_mes` |
| `p_from_local_time text` / `p_to_local_time text` | pasan a `time`. La validación por expresión regular deja de hacer falta y el `>` del borde de arriba se vuelve `<` |
| `v_limit constant integer := 10` | baja a **cinco**, por la regla 7 del ensayo |
| `'truncated', v_truncated` | ya no significa nada: con cinco días y cinco por día siempre hay más, y decirlo en cada respuesta no ayuda |
| `v_rejection := 'INVALID_DAY'` | no hay un día que validar; el horizonte lo gobierna la ventana |

**Se queda, tal cual:** `v_horizon_days := 30`, el barrido sin traslapes con `v_last_end`,
`v_turn.status NOT IN ('active','waiting_external')`, los dos `true` del motor y el
comentario que explica por qué esta operación admite el doble estado.

Y en `supabase/functions/agent_tool_gateway/index.ts`, la ruta `getAvailability` pasa de
mandar tres argumentos de dominio —`p_service_handle`, `p_day`, `p_modality`, leídos hoy
del archivo— a mandar seis. El nombre de la ruta y el de la operación no cambian.

---

## 4. Los dos interruptores del motor exacto

`public._get_internal_availability_core` termina con dos banderas:

```sql
p_restrict_to_configured_schedule boolean DEFAULT true,
p_apply_patient_lead              boolean DEFAULT false
```

**Los dos van siempre en `true` desde el agente. Sin excepción, en la búsqueda y en la
mutación de crear.**

### `p_restrict_to_configured_schedule`

En `false`, el motor abre una ventana de oficina genérica:

```sql
PROFESSIONAL_DAY_START constant time := time '05:00';
PROFESSIONAL_DAY_END   constant time := time '23:00';
...
SELECT p_day + PROFESSIONAL_DAY_START, p_day + PROFESSIONAL_DAY_END
 WHERE NOT p_restrict_to_configured_schedule
```

De 5 de la mañana a 11 de la noche, **todos los días**, sábados y domingos incluidos,
ignorando por completo lo que la profesional configuró. Eso existe para la app de la
profesional, que sí puede meter una cita fuera de su horario porque es su decisión. Si el
agente lo apagara, le ofrecería a Emilio las 6:30 de la mañana de un domingo.

Y hay una consecuencia peor que la vergüenza: **los cinco motivos dejan de existir.**
`dia_no_laborable` y `fuera_de_horario` se calculan contra los bloques configurados. Sin
ellos, todo día vacío se vuelve `lleno`, que es mentira.

### `p_apply_patient_lead`

En `false`, `v_lead_cutoff := now()`. En `true`:

```sql
SELECT COALESCE(pol.patient_min_booking_lead_minutes, 1440) INTO v_lead_min ...
v_lead_cutoff := now() + make_interval(mins => v_lead_min);
```

Apagarlo le ofrecería a Emilio las 4 de la tarde de hoy cuando Araceli pide 48 horas. La
cita se crearía —o peor, se ofrecería y luego la mutación la rechazaría con
`LEAD_TIME_NOT_MET`, después de que él ya escogió—.

Y el número **sale de la fila de esa profesional**, no de una constante. Es la misma regla
del dueño: «ningún plazo se escribe a mano». Los valores reales de hoy:

| Profesional | Anticipación mínima |
|---|---|
| Araceli | 2 880 min (48 h) |
| Miranda | 2 880 min (48 h) |
| test | 2 880 min (48 h) |
| Maricruz tes | 1 440 min (24 h) |
| Test | 1 440 min (24 h) |

**Tres de cinco piden 48 horas.** Un texto que diga «24 horas» le miente a la mayoría.

### Por qué son un interruptor y no una constante

Porque la app de la profesional usa el mismo motor con los dos en `false`, y ésa es la
razón de que sean parámetros. La regla no es «borrar el `false`»: es **que la superficie
del agente nunca lo pase**. Se garantiza en un solo lugar —las dos llamadas del agente al
motor, la de la búsqueda y la de crear— y ambas están en este documento con los dos `true`
literales, con comentario al lado.

---

## 5. Cómo se ofrecen las horas

Cuatro reglas, todas de presentación. El servidor entrega las opciones; el agente las dice.

**1 · Sin traslapes.** Ya viene resuelto desde el servidor (§1.2). El agente nunca ofrece
dos horas que no puedan coexistir.

**2 · Numeradas.** Cuando las cinco opciones caen en días distintos, se numeran día y hora
juntos, copiando la `etiqueta` tal cual:

> 1. Martes 1 de septiembre, 12:00 p.m.
> 2. Jueves 3 de septiembre, 12:00 p.m.
> 3. Martes 1 de septiembre, 1:00 p.m.
> 4. Jueves 3 de septiembre, 1:00 p.m.
> 5. Martes 1 de septiembre, 3:00 p.m.

**3 · Cinco máximo.** Es el tope del servidor, no una instrucción al modelo. No puede
enseñar seis porque nunca recibe seis.

**4 · Cuando dos días traen las mismas, se dicen una sola vez.** El agente mira las cinco
opciones que recibió; si todos los días que aparecen traen **exactamente el mismo juego de
horas**, dice las horas una vez y nombra los días:

> Los dos días tengo 12:00, 1:00, 3:00, 4:00 y 5:00. ¿Cuál te acomoda?

Esto sale del reparto por rondas de §3.6: con dos días y una banda estrecha, las rondas se
completan y los dos días quedan con el mismo juego. Con una banda ancha las rondas se
truncan, los juegos difieren, y entonces manda la regla 2. **El agente no decide cuál usar:
compara y le sale sola.**

Y cuando es un solo día, ni se numera:

> El martes 1 tengo 9:00, 10:00, 11:00, 12:00 y 1:00.

Ella contesta «el martes a las 12» o «la 3» y el agente ya tiene el `slot_handle`. **No hay
paso de «¿confirmo?»**: escoger es agendar.

---

## 6. El hueco que se ocupa

### 6.1 El caso

Se le ofrecen a Emilio cinco horas del martes. Mientras lee, otra paciente toma las 12:00.
Emilio contesta «las 12».

**Ofrecer un hueco nunca lo reserva.** No hay apartado, y es deliberado: apartar cinco
huecos por cada pregunta dejaría la agenda de la profesional llena de fantasmas de gente
que nunca contestó.

### 6.2 Qué devuelve el servidor

La mutación de crear resuelve el `slot_handle`, toma el candado de la agenda y **vuelve a
preguntar**:

```sql
PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('agenda:' || v_turn.professional_id::text, 0));
...
v_slots := public._get_internal_availability_core(
  v_turn.professional_id, v_service_id, v_starts_local::date,
  v_modality, NULL, true, true);
IF NOT EXISTS (
  SELECT 1 FROM pg_catalog.jsonb_array_elements(v_slots) AS candidate(value)
   WHERE (candidate.value->>'start_local')::timestamp = v_starts_local) THEN
  v_reason := 'SLOT_TAKEN';
END IF;
```

Y un segundo cerrojo con `private.assert_appointment_slot_available`, ya con el candado
tomado, que traduce el choque a `SLOT_TAKEN` también. El resultado:

```json
{ "applied": false, "reason": "SLOT_TAKEN" }
```

### 6.3 Por qué no gasta la mutación

Porque el `finalize` distingue el rechazo del efecto:

```sql
v_finalize := private.agent_finalize_tool_call(
  v_turn.id, v_tool_call_key,
  CASE WHEN v_data->>'applied' = 'true' THEN 'committed' ELSE 'rejected_prewrite' END,
  v_result);
```

Y en `private.agent_finalize_tool_call` —**leído del cuerpo desplegado**, no de la
documentación— el contador sólo sube con `'committed'`:

```sql
IF v_claim.is_mutation THEN
  UPDATE public.agent_turns AS turn_row
     SET committed_mutation_count = CASE
           WHEN p_outcome = 'committed'
           THEN LEAST(turn_row.mutation_limit, turn_row.committed_mutation_count + 1)
           ELSE turn_row.committed_mutation_count
         END,
```

**`rejected_prewrite` deja `committed_mutation_count` intacto.** El cerrojo de «una
mutación por turno» sigue disponible, así que Emilio puede escoger otra hora en el mismo
turno y la cita se crea. Lo único que se gastó fue **una llamada del presupuesto**, que es
exactamente lo que costó: un viaje al servidor que no escribió nada. (Ese presupuesto son
**ocho** mientras no aterrice el cambio de §3.1, no doce.)

Y hay una segunda cosa que se gastó, ésta sí definitiva: **el hueco es de un solo uso y se
consume antes de comprobar**. La mutación hace
`private.agent_resolve_option_token(..., 'slot', true)` con el consumo encendido, justo
después del claim, para que dos ejecuciones concurrentes no puedan reservarlo dos veces. Si
la comprobación falla después, ese identificador ya no sirve — pero tampoco hace falta,
porque el hueco que representaba ya no existe.

### 6.4 Qué contesta el agente

El servidor le devolvió `SLOT_TAKEN` y el agente **todavía tiene los otros cuatro
identificadores** de la misma búsqueda. No hace falta buscar de nuevo:

> Se me acabó de ocupar esa hora. Del mismo martes 1 todavía tengo 1:00, 3:00 y 4:00.
> ¿Alguna te sirve?

Si era la única que quedaba, entonces sí se busca otra vez —una llamada más—:

> Se me acabó de ocupar esa hora y del martes ya no me queda nada. Del jueves 3 tengo
> 9:00, 10:00 y 12:00. ¿Alguna te sirve?

> **Los dos textos son propuesta, no están aprobados.** El dueño fijó ocho textos fijos y
> éste no es uno de ellos. Falta su visto bueno.

### 6.5 El plazo de los identificadores: el tope es el turno

`private.agent_issue_option_handle` está **desplegada** y le pone techo a la vida de cada
tipo de identificador (`CASE` leído hoy del cuerpo desplegado):

| Tipo | Techo hoy |
|---|---|
| `relationship` | 10 minutos |
| `service` | 15 minutos |
| `appointment` | 15 minutos |
| **`slot`** | **5 minutos** |
| `flow` | 15 minutos |

**Cinco minutos es de la época del formulario**, donde la pantalla estaba abierta y ella
contestaba en segundos. Conversando por WhatsApp, cinco minutos es poco: se distrae, la
llaman, contesta a los ocho. El identificador vence, la mutación devuelve `SLOT_EXPIRED` y
hay que buscar otra vez — **una llamada del presupuesto tirada por un reloj que no protege
nada**, porque el hueco nunca estuvo apartado y la protección real es la recomprobación
bajo candado de §6.2.

**Y el problema no es sólo el `slot`.** Con `service` en quince minutos, quien compara dos
días, se distrae y vuelve, pierde también el identificador del servicio y la búsqueda
entera muere con `OPTION_EXPIRED`.

**Cambio: un solo techo de 30 minutos** para los tres tipos que sobreviven —`service`,
`appointment` y `slot`—, que es lo mismo que decir **«el tope es el turno»**. No hace falta
inventar un número: el emisor **ya** rechaza con `OPTION_EXPIRY_INVALID` cualquier
vencimiento que pase del turno o de la sesión, y el turno vive
`LEAST(sesión, now() + 30 minutos)` y se renueva en cada llamada. Con la tabla de cinco
topes distintos, lo único que se logra es que el identificador muera antes que la
conversación que lo necesita.

```sql
WHEN p_kind IN ('service', 'appointment', 'slot')
  THEN interval '30 minutes'
```

Es el mismo cambio que pide `docs/diseno/02-herramientas.md` §8 por su cuenta, y por la
misma razón. Las ramas de `relationship` y `flow` se van con las secciones que las retiran,
igual que las suyas en `chk_agent_option_tokens_kind_matrix`.

Con eso, la función de §3.7 no calcula ningún vencimiento propio: pone
`v_option_expires_at := v_turn_expires_at` y ya.

---

## 7. Zonas horarias y horario de verano

### 7.1 Todo en hora local de la profesional

`public.professionals.timezone` manda, con `America/Mexico_City` por omisión. **Las cinco
profesionales de producción tienen esa zona.** Nada en el sistema del agente usa la zona de
la paciente, y es a propósito: la cita ocurre donde está la profesional.

De ahí salen las tres fechas que gobiernan la búsqueda:

```sql
v_hoy_local    := (now() AT TIME ZONE v_timezone)::date;
v_fecha_minima := ((now() + make_interval(mins => v_lead_min)) AT TIME ZONE v_timezone)::date;
v_fecha_maxima := v_hoy_local + 30;
```

Y el motor devuelve `start_local` y `end_local` como **marcas de tiempo sin zona** —hora de
pared—, que es lo que se enseña y lo que viaja dentro del `stable_key` del identificador.
La conversión a instante absoluto ocurre una sola vez, en la mutación de crear.

### 7.2 Qué hace con una hora de pared que no existe

En México ya no hay horario de verano desde el 30 de octubre de 2022. **Medido:**

| Instante | Hora local en `America/Mexico_City` | Desfase |
|---|---|---|
| 2022-10-29 12:00 UTC | 07:00 | −5 h |
| 2022-10-31 12:00 UTC | 06:00 | −6 h |

Y de enero de 2026 a diciembre de 2027, mes por mes, el desfase es **−6 horas constante**.
Ninguna profesional de producción va a cruzar un salto.

**Pero el código no se apoya en eso, y hace bien.** `America/Tijuana` sí conserva el
cambio, y una profesional de Baja California puede darse de alta mañana. Medido:

| Instante | Hora local en `America/Tijuana` |
|---|---|
| 2027-03-13 20:00 UTC | 12:00 |
| 2027-03-15 20:00 UTC | 13:00 |

El 14 de marzo de 2027 el reloj salta de las 2:00 a las 3:00 y **las 2:30 de esa madrugada
no existen**. Postgres las normaliza en silencio:

```sql
select (timestamp '2027-03-14 02:30' at time zone 'America/Tijuana')
         at time zone 'America/Tijuana';
-- 2027-03-14 03:30:00
```

Le pediste las 2:30 y te devolvió las 3:30, sin avisar. **Ésa es la falla que las dos
guardas del sistema atrapan.**

**Guarda 1, dentro del motor.** Todo candidato tiene que sobrevivir la ida y vuelta:

```sql
AND c.starts_at AT TIME ZONE v_tz = c.start_local
AND c.ends_at   AT TIME ZONE v_tz = c.end_local
AND NOT EXISTS (
  SELECT 1 FROM generate_series(15, 120, 15) AS delta(minutes)
   WHERE (c.starts_at + make_interval(mins => delta.minutes)) AT TIME ZONE v_tz = c.start_local
      OR (c.starts_at - make_interval(mins => delta.minutes)) AT TIME ZONE v_tz = c.start_local
      OR (c.ends_at   + make_interval(mins => delta.minutes)) AT TIME ZONE v_tz = c.end_local
      OR (c.ends_at   - make_interval(mins => delta.minutes)) AT TIME ZONE v_tz = c.end_local)
```

La primera parte tira **la hora que no existe**: si la ida y vuelta no coincide, el
candidato se descarta. La segunda tira **la hora que ocurre dos veces**: si dos instantes
separados por hasta dos horas caen sobre la misma hora de pared, esa hora es ambigua y se
descarta también.

**Guarda 2, dentro de la mutación de crear**, porque entre ofrecer y crear pasan minutos y
el hueco llega como texto:

```sql
v_starts_at := v_starts_local AT TIME ZONE v_timezone;
IF (v_starts_at AT TIME ZONE v_timezone) <> v_starts_local
   OR ((v_starts_at + interval '1 hour') AT TIME ZONE v_timezone) = v_starts_local
   OR ((v_starts_at - interval '1 hour') AT TIME ZONE v_timezone) = v_starts_local THEN
  v_reason := 'INVALID_LOCAL_DATETIME';
```

**La búsqueda no añade ninguna guarda propia**, y eso es lo correcto: no reimplementa nada
del calendario. Filtra por hora de pared (`start_local::time`) sobre candidatos que el
motor **ya** validó, así que una hora imposible nunca llega a la banda porque nunca llegó a
la lista.

**Consecuencia visible el día del salto**, en Tijuana: la profesional que trabaja de 1:00 a
5:00 de la madrugada del 14 de marzo verá que sus 2:00 no se ofrecen. Es correcto: esa hora
no existió. Y el 7 de noviembre, cuando el reloj se atrasa y las 1:30 ocurren dos veces,
tampoco se ofrecen: no hay forma de decirle a la paciente cuál de las dos. **En ambos casos
el motivo que sale es `lleno`** —el día está abierto y el motor devolvió cero para esa
banda—, que es la única imprecisión conocida de los cinco motivos, y afecta a dos horas al
año en una zona donde hoy no hay ninguna profesional.

---

## 8. Lo que hay que cambiar

| # | Dónde | Cambio | ¿Bloquea? |
|---|---|---|---|
| 1 | `20260825001000_agent_consultas_agenda.sql` (**escrita, sin desplegar**) | Reescribir `agent_search_availability_from_workflow` con la forma de §3.7: filtros de días, banda como `time`, cinco motivos, tope **cinco**, tope de días visitados, y `alternativas`. **Se reusan** el horizonte de 30, el barrido sin traslapes y el doble estado del turno, que ya están ahí | **Sí.** Sin esto el agente contesta de un día en un día y no sabe decir por qué no hay |
| 2 | `private.agent_issue_option_handle` (**desplegada**) | Un solo techo de 30 minutos para `service`, `appointment` y `slot`: el tope es el turno | **Sí.** Con `slot` en 5 minutos, quien contesta a los ocho pierde el hueco y hay que buscar otra vez |
| 3 | `supabase/functions/agent_tool_gateway/index.ts` | La ruta `getAvailability` pasa de mandar 3 argumentos de dominio a 6 | Sí, va con el 1 |
| 4 | El prompt | La tabla de ocho renglones de §3.2 que traduce «por la tarde» a una banda; la regla de mandar el número del mes sin resolverlo; y la regla de contestar el horizonte cuando ella nombra un mes lejano (§3.3) | Sí |
| 5 | `private.agent_claim_tool_call` (**desplegada**) | Da de alta `search_availability`, retira `get_availability` y exige el turno en `active`. Va dentro de `20260826000000`, junto con el presupuesto de 12 y el alta de `create_appointment` | **Sí.** Sin el alta, la búsqueda sale con `TOOL_NOT_ALLOWED` siempre |

Lo que **no** hace falta: ninguna función nueva de dominio —tampoco la
`private.agent_availability_context` que la versión anterior de este documento pedía y
nunca definía—, ningún permiso nuevo sobre el motor más allá del `GRANT EXECUTE` que ya
trae `20260825000000`, ninguna tabla nueva, y ningún índice nuevo: la consulta barata
corre en 1.5 ms con los que ya existen.

**Y dos cosas que este documento da por hechas y no lo están.** No son suyas —viven en los
documentos hermanos— pero sin ellas nada de esto llega a la paciente:

| Dónde | Qué falta | Documento |
|---|---|---|
| `private.agent_claim_tool_call` y otras cuatro piezas | El presupuesto sigue en **ocho**, no en doce, y el ordinal del cierre en **nueve**. Las cinco piezas se mueven juntas o ninguna gestión cierra. Ya van juntas en `20260826000000` | `01-arquitectura.md` §3.1, `02-herramientas.md` §6.2 |
| `private.agent_claim_tool_call` | `create_appointment` **no existe** en el portero desplegado. Agendar por texto sale con `TOOL_NOT_ALLOWED`, siempre | `02-herramientas.md` §6.2 |

---

## 9. Lo que queda abierto

1. **Los textos del hueco ocupado (§6.4) no están aprobados.** El dueño fijó ocho textos y
   éste no es uno. Hay que enseñárselos.
2. **~~El nombre de la operación~~ — cerrado.** Se llama `search_availability` en los tres
   documentos, en el portero escrito y en la función escrita. Ya no es decisión pendiente.
3. **La modalidad cruzada sigue sin decidirse.** «Presencial no tengo mañanas, en línea
   sí»: hoy la búsqueda recibe una modalidad y contesta de esa modalidad. Ver si vale la
   pena que un `fuera_de_horario` o un `dia_no_laborable` mire de reojo la otra y lo
   ofrezca. Cuesta una pasada barata más, que son 1.5 ms.
4. **El motivo `lleno` nunca se ha ejercido con datos reales.** Cero citas `scheduled` en
   producción. Es el único de los cinco que no se pudo comprobar de punta a punta, y hay que
   volver a medirlo en cuanto exista la primera.
5. **La rama del consultorio compartido tampoco.** Cero conexiones activas. El motor la
   tiene y la búsqueda la hereda sin tocarla, pero nadie la ha visto correr.
6. **Un día que se ofrece y sale vacío al tocarlo** es posible por los 14 minutos de §2, y
   termina en `lleno`. Es correcto de cara a la paciente y no se va a arreglar: arreglarlo
   exige que la consulta barata mida huecos, que es justo lo que se decidió no hacer.
7. **`alternativas` está diseñada y medida en costo, pero no ejercida.** Como hoy ninguna
   profesional tiene la agenda llena, la segunda pasada nunca ha corrido con datos reales.
   Va junto con el punto 4.
