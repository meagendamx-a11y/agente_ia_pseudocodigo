# 11 · Los servicios que se le ofrecen y su precio

Corte: 2026-08-26. Todo lo de aquí está comprobado contra el proyecto desplegado
**`ssyzfeadyrczlzjbvxyl` («Agenda PSI V2»)**: cuerpo de función leído de `pg_proc.prosrc`,
restricciones leídas de `pg_constraint`, privilegios leídos de `relacl` y
`has_table_privilege`, y conteos ejecutados contra los datos de producción. Lo que no se
pudo comprobar se dice.

**La regla del dueño, literal:**

> «Si tiene servicios asignados, los muestras; si no tiene servicios asignados, le das la
> lista de todos, así de simple. Y si tiene servicios asignados, ve si tienen costo por
> defecto o costo normal.»

**Veredicto en una línea:** la regla se puede implementar completa y no hace falta ningún
cambio de esquema. Pero **ninguna de las dos funciones desplegadas hace lo que dice la regla**,
y la función del agente que ya está escrita (sin aplicar) tampoco: lista siempre el catálogo
entero.

**Faltan dos permisos, no uno.** `patient_services` (§5) es el de esta regla;
`recurrence_series` es el que exige la regla 2 del frente 12, porque la misma función tiene
que decir cada cuánto es la serie de ese servicio. Los dos se comprobaron hoy contra la base:
los dos devuelven falso.

**Aviso al que aplique el cambio:** la corrección del §6.2 **no es sólo la consulta**. Toca
tres puntos más de la misma función — el bloque `DECLARE`, el candado `IF v_total > 0` y el
campo `is_free` de la salida. Cambiar sólo la consulta deja a **13 de las 17 pacientes
activas con la lista vacía** (§6.2, punto 0). Van todos juntos: renglones 2 a 6 del §8.

---

## 1. Dónde viven los servicios asignados

### 1.1 La tabla

Se llama `public.patient_services`. Es una tabla de tres llaves y un precio.

| Columna | Tipo | Nulo | Defecto |
|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()` |
| `patient_id` | `uuid` | no | — |
| `professional_id` | `uuid` | no | — |
| `service_id` | `uuid` | no | — |
| `preferential_price` | `numeric(10,2)` | **sí** | — |
| `created_at` | `timestamptz` | no | `now()` |
| `updated_at` | `timestamptz` | no | `now()` |

Restricciones (`pg_constraint`):

```
patient_services_pkey                                  PRIMARY KEY (id)
uq_patient_service                                     UNIQUE (patient_id, service_id)
chk_patient_service_price                              CHECK (preferential_price IS NULL OR preferential_price >= 0)
patient_services_patient_id_professional_id_fkey       FK (patient_id, professional_id) → patients(id, professional_id) ON DELETE CASCADE
patient_services_service_id_professional_id_fkey       FK (service_id, professional_id) → services(id, professional_id)
```

**Dos cosas que se leen de aquí y ahorran comprobaciones:**

1. Las dos llaves foráneas son **compuestas con `professional_id`**, y las dos están
   validadas (`pg_constraint.convalidated = true` en las dos). Es imposible que una paciente
   tenga asignado un servicio de otra profesional: la base no lo deja entrar. La función del
   agente no tiene que revisarlo, y por eso la consulta del §6.2 **no repite** el filtro de
   pertenencia sobre `services` en la rama de asignados: si la fila de `patient_services` es
   del profesional del turno, el servicio también lo es.
2. `preferential_price` **puede ser nulo con la fila presente**. Estar asignada y tener
   precio preferente son cosas distintas. Hoy en producción hay 5 asignaciones y **sólo 3
   traen precio preferente**; las otras 2 se cobran a precio de catálogo.

### 1.2 La tabla del catálogo

`public.services`:

| Columna | Tipo | Nulo | Defecto |
|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()` |
| `professional_id` | `uuid` | no | — |
| `name` | `text` | no | — |
| `default_price` | `numeric(10,2)` | no | `0` |
| `is_free` | `boolean` | no | `false` |
| `duration_minutes` | `integer` | no | — |
| `buffer_after_minutes` | `integer` | no | `0` |
| `modality` | `service_modality` | no | — |
| `is_marketplace` | `boolean` | no | `false` |
| `is_active` | `boolean` | no | `true` |
| `created_at` / `updated_at` | `timestamptz` | no | `now()` |

De sus siete restricciones, las dos que mandan aquí:

```
chk_service_price   CHECK ((is_free AND default_price = 0) OR (NOT is_free AND default_price > 0))
uq_service_owner    UNIQUE (id, professional_id)
```

Enums:

```
service_modality = { in_person | online | both }     -- lo que admite un servicio
modality         = { in_person | online }            -- lo que se sella en una cita
```

`chk_service_price` es útil: **gratis y precio cero son lo mismo por construcción**. No hay
un servicio gratis con precio ni un servicio de $0 que no sea gratis.

### 1.3 La función desplegada — y por qué no sirve tal cual

`public.get_services_for_patient(p_patient_id uuid) RETURNS jsonb`. Verificada leyendo su
`prosrc` completo.

| Rasgo | Valor |
|---|---|
| `prosecdef` | `true` (SECURITY DEFINER) |
| Dueño | `postgres` |
| `proconfig` | `search_path=""` |
| `proacl` | `postgres=X/postgres \| authenticated=X/postgres` |
| Volatilidad | `s` (STABLE) |

Su primera instrucción:

```sql
v_professional_id := public.current_professional_id();
IF v_professional_id IS NULL THEN
  RAISE EXCEPTION USING errcode = '28000', message = 'AUTH_REQUIRED';
END IF;
```

**Bloqueo 1 — identidad.** `current_professional_id()` sale de `auth.uid()`. El agente entra
por el borde de servicio, sin sesión de usuario. Resultado garantizado: `AUTH_REQUIRED`.

**Bloqueo 2 — privilegio.** Su ACL no incluye `service_role` ni `agenda_psi_agent_owner`.

**Bloqueo 3, y es el importante — no hace lo que dice la regla.** Su consulta es:

```sql
FROM public.services s
LEFT JOIN public.patient_services ps
  ON ps.service_id = s.id
 AND ps.patient_id = p_patient_id
 AND ps.professional_id = v_professional_id
WHERE s.professional_id = v_professional_id
  AND s.is_active = true
```

Es un **LEFT JOIN**: devuelve **siempre el catálogo activo completo**, marque o no cada
renglón con `'is_assigned', ps.id IS NOT NULL`, y los ordena
`ORDER BY (ps.id IS NOT NULL) DESC, s.name ASC` para que los asignados salgan primero.

Eso es correcto para lo que hace: es el **selector de la profesional**, que necesita ver
todo el catálogo para poder asignar. **No es la regla de la paciente.** La regla de la
paciente es un corte, no una marca: si hay asignados, los otros **no se enseñan**.

**Conclusión: `get_services_for_patient` no se envuelve ni se reutiliza.** Lo que sí se
copia literal es su fórmula de precio, que es la misma que graba la cita.

---

## 2. El precio efectivo

### 2.1 La fórmula, citada dos veces

En `get_services_for_patient`:

```sql
'effective_price', CASE
                     WHEN s.is_free THEN 0
                     WHEN ps.preferential_price IS NOT NULL
                       THEN ps.preferential_price
                     ELSE s.default_price
                   END
```

En `public.create_appointment(...)`, líneas 186-200 de su `prosrc`, que es **la que de
verdad graba el dinero**:

```sql
-- 7) PRECIO EFECTIVO (formula canonica de PAGOS.md; el cliente no lo envia)
--    is_free => 0 ; si no, preferential_price (si existe fila) ; si no, default_price
IF v_is_free THEN
  v_agreed_price := 0;
ELSE
  SELECT ps.preferential_price
    INTO v_pref_price
    FROM public.patient_services ps
   WHERE ps.patient_id = p_patient_id
     AND ps.service_id = p_service_id;
  v_agreed_price := COALESCE(v_pref_price, v_default_price);
END IF;

v_pay_status := CASE WHEN v_agreed_price = 0 THEN 'not_applicable' ELSE 'pending' END;
```

Son **la misma fórmula, palabra por palabra**. Tres escalones, en este orden:

| Orden | Condición | Precio |
|---|---|---|
| 1 | `services.is_free = true` | **0**, y manda sobre todo lo demás |
| 2 | existe fila en `patient_services` con `preferential_price` no nulo | **ese** número |
| 3 | cualquier otro caso | `services.default_price` |

**Esto contesta la segunda mitad de la regla del dueño** («ve si tienen costo por defecto o
costo normal»): el escalón 2 es el costo preferente y el 3 es el de catálogo, y el que
gana es el preferente cuando la fila lo trae.

### 2.2 Los servicios gratis

`is_free` gana antes de mirar nada. Un servicio gratis **ignora el precio preferente aunque
exista**: si `is_free = true`, `create_appointment` ni siquiera consulta
`patient_services`. Y `chk_service_price` obliga a que `default_price = 0` en ese caso, así
que no hay forma de que un gratis traiga un número escondido.

Consecuencia de producto: la cita nace con `payment_status = 'not_applicable'` y **no entra
al circuito de cobro**. El agente no le pide comprobante ni le menciona dinero.

### 2.3 Dos trampas reales, medidas

**Trampa A — el precio preferente puede ser más caro.** `chk_patient_service_price` sólo
exige `>= 0`. En producción hoy:

| Paciente | Profesional | Servicio | Catálogo | Preferente | Efectivo |
|---|---|---|---|---|---|
| Raul Jimenez | Araceli | Psicoterapia individual | $800 | **$700** | **$700** |
| Raul Jimenez | Araceli | Psicoterapia Pareja | $1,200 | — | $1,200 |
| Gaek Jimendz | test test | Psicoterapia individual | $600 | **$3,000** | **$3,000** |
| Gabriel Pérez | Test test | Psicoterapia Individual | $800 | **$700** | **$700** |
| Juan Jiménez | Test test | Psicoterapia Individual | $800 | — | $800 |

«Preferente» no quiere decir «descuento». La palabra no debe salir nunca al mensaje: se dice
el número y ya.

**Trampa B — un preferente de 0 vuelve gratis un servicio de paga.** `>= 0` lo permite, y
entonces `v_agreed_price = 0` → `payment_status = 'not_applicable'`. **Hoy no hay ninguno**
(consulta ejecutada: `preferential_price = 0` → **0 filas**), pero la puerta está abierta y
la fórmula ya lo resuelve sola: «esto es gratis» se decide mirando el **precio efectivo
igual a 0**, no mirando `services.is_free`.

**Y aquí la función escrita se equivoca.** Su salida emite `'is_free', v_service.is_free`,
que es la bandera del catálogo, no el efectivo. Con un preferente de 0 devolvería
`price: "0.00"` y `is_free: false` a la vez: el modelo leería «cuesta cero pero no es
gratis», pediría comprobante, y la cita nacería `not_applicable` — dinero que nadie debe y
que nadie va a poder registrar. **Es una línea de arreglo** y va en la lista del §6.2.

---

## 3. La rama de «no tiene ninguno asignado»

### 3.1 Cuántas pacientes caen ahí — el dato que ordena todo

```sql
select p.patient_status,
  count(*) as pacientes,
  count(*) filter (where exists (select 1 from public.patient_services ps where ps.patient_id=p.id)) as con_asignados,
  count(*) filter (where not exists (select 1 from public.patient_services ps where ps.patient_id=p.id)) as sin_asignados
from public.patients p group by 1;
```

| Estado | Pacientes | Con asignados | **Sin asignados** |
|---|---|---|---|
| `active` | 17 | 4 | **13** |
| `inactive` | 1 | 0 | 1 |

**Trece de diecisiete pacientes activas —el 76%— caen en la rama del catálogo.** No es el
caso raro: es el caso normal. Las **18** pacientes tienen vínculo de WhatsApp, así que las 18
son alcanzables por el agente.

Toda la tabla, paciente por paciente:

| Paciente | Profesional | Asignados activos | Catálogo activo | Rama | Se le ofrecen |
|---|---|---|---|---|---|
| Andres | Araceli | 0 | 4 | catálogo | **4** |
| Camila | Araceli | 0 | 4 | catálogo | **4** |
| Diego | Araceli | 0 | 4 | catálogo | **4** |
| Emilio | Araceli | 0 | 4 | catálogo | **4** |
| Fernanda | Araceli | 0 | 4 | catálogo | **4** |
| Mariana | Araceli | 0 | 4 | catálogo | **4** |
| **Raul** | Araceli | **2** | 4 | **asignados** | **2** |
| Renata | Araceli | 0 | 4 | catálogo | **4** |
| Rodrigo | Araceli | 0 | 4 | catálogo | **4** |
| Sofia | Araceli | 0 | 4 | catálogo | **4** |
| Valeria | Araceli | 0 | 4 | catálogo | **4** |
| Ximena | Araceli | 0 | 4 | catálogo | **4** |
| Prueba | Miranda | 0 | 2 | catálogo | **2** |
| **Gaek** | test test | **1** | 2 | **asignados** | **1** |
| **Gabriel** | Test test | **1** | 1 | **asignados** | **1** |
| **Juan** | Test test | **1** | 1 | **asignados** | **1** |
| Sandra | Test test | 0 | 1 | catálogo | **1** |
| Patient (inactiva) | Test test | 0 | 1 | catálogo | 1 |

### 3.2 ¿La rama del catálogo se puede agendar?

**Sí, y está comprobado.** `create_appointment` valida el servicio así (líneas 126-141 de su
`prosrc`):

```sql
SELECT s.modality, s.duration_minutes, s.buffer_after_minutes,
       s.is_free, s.default_price, s.is_active
  INTO ...
  FROM public.services s
 WHERE s.id = p_service_id
   AND s.professional_id = v_professional_id;
IF NOT FOUND THEN RAISE ... 'SERVICE_NOT_FOUND_OR_NOT_OWNED'; END IF;
IF NOT v_svc_active THEN RAISE ... 'SERVICE_INACTIVE'; END IF;
```

Pide **pertenencia y que esté activo. No pide asignación.** Ofrecer el catálogo a las 13
pacientes sin asignaciones no crea una cita que después se rechace.

**Dos cosas que sí rechaza después, y que este frente tiene que dejar dichas:**

1. **Servicio `both` → hay que escoger modalidad.** Líneas 170-174 del mismo `prosrc`:
   ```sql
   IF v_svc_modality = 'both' THEN
     IF p_modality IS NULL THEN
       RAISE EXCEPTION USING errcode = 'P0001', message = 'MODALITY_REQUIRED';
   ```
   No es opcional. **Dos de los cuatro servicios activos de Araceli son `both`**
   (`Psicoterapia individual` de $800 y `Valoracion Sin Costo`), así que a sus 11 pacientes
   sin asignaciones se les ofrecen dos servicios que **no se pueden agendar sin que ellas
   digan «en línea» o «presencial»**. Por eso `modality` sale en la salida del §6.4 y por eso
   el mensaje del §6.7 tiene que decirlo: es una pregunta pendiente, no un adorno.

2. **Paciente inactiva → `PATIENT_INACTIVE`.** Líneas 156-163: si `patient_status =
   'inactive'`, la cita se rechaza y no hay auto-reactivación. Hay **una** paciente así hoy
   (§3.1) y sí tiene vínculo de WhatsApp. **Esta función no lo comprueba y no debe:** ese
   dato ya viaja en la operación de capacidades — `public.agent_get_capabilities`, línea 58
   (`patient_row.patient_status = 'active'`) y línea 99
   (`v_reason_codes := array_append(v_reason_codes, 'PATIENT_INACTIVE')`), que es la que
   `agent_get_capabilities_from_workflow` invoca en su línea 97. Duplicar la comprobación
   aquí sería complejidad de más.

### 3.3 Qué devuelve `list_services()` — y por qué no sirve para esta rama

`public.list_services()` **no recibe paciente**. Es la pantalla «Servicios» de la
profesional. Su `prosrc`, íntegro en lo que importa:

```sql
v_professional_id := public.current_professional_id();
IF v_professional_id IS NULL THEN
  RAISE EXCEPTION USING errcode = '28000', message = 'AUTH_REQUIRED';
END IF;
...
    FROM public.services s
   WHERE s.professional_id = v_professional_id
     AND s.is_active = true
     AND s.is_marketplace = false;
```

ACL: `postgres=X/postgres | authenticated=X/postgres`. Mismo bloqueo de identidad y de
privilegio que la otra.

Devuelve `service_id, name, default_price, is_free, duration_minutes, buffer_after_minutes,
modality`. **Nunca el precio preferente** — no puede, no sabe de quién se habla.

Y tiene un filtro que rompe la regla: **`is_marketplace = false`**. Si la rama del catálogo
copiara ese filtro, escondería servicios que sí se usan de verdad:

| Profesional | Servicio | Precio | Marketplace | Citas reales | Pacientes distintas |
|---|---|---|---|---|---|
| Araceli | Psicoterapia individual | $800 | no | 22 | 7 |
| Araceli | **Psicoterapia individual** | **$900** | **sí** | **13** | **4** |
| Araceli | Psicoterapia Pareja | $1,200 | no | 3 | 2 |
| Test test | Psicoterapia Individual | $800 | no | 2 | 2 |

El servicio de marketplace de Araceli tiene **13 citas con 4 pacientes distintas**. No es
decorativo. Y la única asignación con precio preferente de `test test` (Gaek, $3,000) **está
sobre un servicio de marketplace**. Filtrarlos dejaría a Gaek con cero servicios.

**Conclusión: la rama del catálogo es «todos los activos del profesional», sin filtro de
marketplace.** Es lo que dice la regla del dueño y es lo que aguanta los datos.

---

## 4. Cuántos servicios se le ofrecerían de verdad

### 4.1 Por profesional

| Profesional | Activos | …no marketplace | …marketplace | Inactivos | Activos gratis | Pacientes |
|---|---|---|---|---|---|---|
| Araceli Ramirez Soto | **4** | 3 | 1 | 3 | 1 | 12 |
| Maricruz tes Jimenez | **4** | 4 | 0 | 0 | 2 | **0** |
| Miranda Jimenez | **2** | 1 | 1 | 4 | 0 | 1 |
| test test | **2** | 1 | 1 | 2 | 0 | 1 |
| Test test | **1** | 1 | 0 | 0 | 0 | 4 |

13 servicios activos en total. **El máximo que se le ofrecería a cualquier paciente hoy es
4.** Maricruz tiene 4 activos pero cero pacientes, así que en la práctica el techo real es
el de Araceli: 4.

### 4.2 ¿Cabe en un mensaje?

Sí, con muchísimo margen. La lista más larga posible hoy, la de Araceli en rama catálogo:

```
Con Araceli tengo estos servicios:
1) Psicoterapia individual — en línea — 50 min — $900
2) Psicoterapia individual — en línea o presencial — 50 min — $800
3) Psicoterapia Pareja — en línea — 90 min — $1,200
4) Valoracion Sin Costo — en línea o presencial — 30 min — sin costo
```

(El nombre va **sin acento** porque así está capturado en la base. Ver §4.4 y la regla del
§6.4: el nombre sale tal cual, sin corregir.)

Unos 250 caracteres. El tope del gateway es `MAX_JSON_RESPONSE_BYTES = 16_384` bytes de JSON
(leído en `supabase/functions/_shared/agent/constants.ts` de la función desplegada, versión
35). **Medido, no estimado:** armando el JSON de los 4 servicios activos de Araceli con la
misma forma del §6.4 salen **803 bytes**, o sea **~200 bytes por servicio**, o sea que en el
tope caben **unos 81**. Hoy el máximo son 4. **La longitud no es el problema.**

El campo `recurrencia` añade entre 83 y 103 caracteres **sólo a los servicios que tienen serie
viva** (medido en `12-recurrencias.md` §6.3); en el resto es `null`, que cuesta cuatro. Con las
cero series de hoy no añade nada, y en el peor caso imaginable —los cuatro servicios de Araceli
con serie— la lista pasaría de ~803 a ~1,200 bytes. Sigue sin ser el problema.

### 4.3 El problema sí es otro: dos servicios activos con el mismo nombre

```sql
select pr.first_name||' '||pr.last_name, s.name, count(*),
  string_agg(s.default_price::text||' / '||s.modality::text||' / mkt='||s.is_marketplace::text, ' | ')
from public.services s join public.professionals pr on pr.id=s.professional_id
where s.is_active group by 1,2 having count(*)>1;
```

| Profesional | Nombre repetido | Veces | Variantes |
|---|---|---|---|
| Araceli Ramirez Soto | `Psicoterapia individual` | **2** | `800.00 / both / mkt=false` \| `900.00 / online / mkt=true` |
| Maricruz tes Jimenez | `test` | **3** | `0.00 / in_person` \| `0.00 / both` \| `900.00 / in_person` |

Araceli tiene **dos servicios activos que se llaman igual y cuestan distinto**. A las 11
pacientes suyas sin asignaciones se les enseñarían los dos. Si el mensaje sólo dijera el
nombre, la paciente vería «Psicoterapia individual» dos veces y no sabría cuál escoger.

**Esto no se arregla en la base y no hace falta arreglarlo ahí.** Se arregla porque la salida
de la función lleva **precio y modalidad junto al nombre**, y esos dos campos sí los
distinguen: `$800 / en línea o presencial` contra `$900 / en línea`. La instrucción para el
modelo es: **cuando dos servicios compartan nombre, la línea debe traer precio y modalidad
para separarlos.**

### 4.4 Un nombre que miente

Miranda tiene un servicio activo llamado **`Valoracion Sin Costo`** con
`default_price = 800.00` y `is_free = false`. **Cuesta $800.** No es un error del sistema:
es un dato que la profesional capturó así. Y Araceli tiene otro `Valoracion Sin Costo` que
sí es gratis ($0, `is_free = true`).

La regla del agente tiene que ser: **el precio sale del número, nunca del nombre.** Si el
efectivo es 0 se dice «sin costo»; si es 800 se dice «$800», aunque el servicio se llame
«Sin Costo».

---

## 5. Lo que le falta al rol del agente

El rol es `agenda_psi_agent_owner`: `rolsuper = false`, **`rolbypassrls = true`**,
`rolcanlogin = false`. Todas las funciones del agente son `SECURITY DEFINER` con dueño
`agenda_psi_agent_owner`, `search_path=""`, y `EXECUTE` otorgado a `service_role`.

Como el rol lleva `BYPASSRLS`, **las políticas RLS no estorban**. Lo único que decide es el
privilegio de tabla.

Estado real hoy (`has_table_privilege('agenda_psi_agent_owner', …, 'SELECT')`):

| Tabla | RLS activa | SELECT del rol del agente |
|---|---|---|
| `public.services` | sí | **sí** |
| `public.patients` | sí | **sí** |
| `public.professionals` | sí | **sí** |
| `public.whatsapp_links` | sí | **sí** |
| **`public.patient_services`** | sí | **NO** |

Y el ACL crudo lo confirma:

```
services          → postgres=arwdDxtm/postgres | anon=m | authenticated=m | service_role=arwdDxtm | agenda_psi_agent_owner=r
patient_services  → postgres=arwdDxtm/postgres | anon=m | authenticated=m | service_role=arwdDxtm
                                                                            ↑ falta agenda_psi_agent_owner
```

**El GRANT que falta es exactamente uno:**

```sql
GRANT SELECT ON public.patient_services TO agenda_psi_agent_owner;
```

Ya está escrito, sin aplicar, en dos migraciones del árbol de trabajo:
`supabase/migrations/20260825000000_agent_dominio_fundamento.sql:71` y
`supabase/migrations/20260825001000_agent_consultas_agenda.sql:32`. **Basta con aplicar una.**

Las tablas de control que la función necesita **ya están todas otorgadas** (SELECT, INSERT y
UPDATE): `public.agent_option_tokens`, `public.agent_turns`, `public.agent_tool_calls`,
`public.whatsapp_inbound_messages`, `private.agent_token_key_registry`.

**Para la regla de este frente no hace falta nada más.** Pero **sí hace falta un segundo
GRANT, y viene del frente 12**:

```sql
GRANT SELECT ON public.recurrence_series TO agenda_psi_agent_owner;
```

Comprobado hoy: `has_table_privilege('agenda_psi_agent_owner','public.recurrence_series','SELECT')`
devuelve **falso**, y ninguna migración del árbol de trabajo lo concede. El borrador de este
documento decía que ese permiso no hacía falta «porque `has_active_recurrence` es de la app de
la profesional». Eso dejó de ser cierto cuando el dueño fijó la regla 2 del frente 12: **antes de
agendar hay que decirle a la paciente cada cuánto, qué día y a qué hora es su serie**, y las tres
columnas viven en `recurrence_series` (`frequency`, `weekday`, `start_time`). No se pueden
inferir de las citas. Ver `12-recurrencias.md`, §2.3 y §2.4 — ese permiso además choca con tres
asertos de prueba que hay que soltar.

Consecuencia para esta función: la salida del §6.4 lleva **un campo más**, `recurrencia`, con el
texto compuesto por el servidor. Está en el §6.4 y en el renglón 7 del §8.

---

## 6. La función que hay que escribir

### 6.1 Ya existe escrita — y hay que corregirla

En `supabase/migrations/20260825001000_agent_consultas_agenda.sql:64` está
`public.agent_list_services_from_workflow(p_provider_message_id text, p_kapso_execution_id text)`,
escrita y **sin aplicar**. Su andamiaje (validación de entrada, contexto sellado del turno,
llave de idempotencia, claim, emisión de identificadores, finalize, reproducción exacta) está
bien y **no hay que tocarlo**. Una cosa de ese andamiaje sí conviene saber: en el paso 1
rechaza el turno si `v_turn.patient_id IS NULL` o `v_turn.professional_id IS NULL`, así que
la consulta del §6.2 nunca corre sin paciente.

Lo que está mal es el paso 4, la lectura de dominio:

```sql
  SELECT pg_catalog.count(*)
    INTO v_total                          -- cuenta el CATALOGO activo
    FROM public.services AS service
   WHERE service.professional_id = v_turn.professional_id
     AND service.is_active;

  IF v_total > 0 THEN                     -- <-- el candado del §6.2 punto 0
    ... eleccion de llave de emision ...

    FOR v_service IN
      SELECT service.id, ..., preferential.preferential_price
        FROM public.services AS service
        LEFT JOIN public.patient_services AS preferential
          ON preferential.service_id = service.id
         AND preferential.patient_id = v_turn.patient_id
         AND preferential.professional_id = v_turn.professional_id
       WHERE service.professional_id = v_turn.professional_id
         AND service.is_active
       ORDER BY service.name ASC, service.id ASC
       LIMIT v_limit          -- v_limit constant integer := 5
    LOOP
```

**Es un LEFT JOIN: lista siempre el catálogo entero.** Repite el error de
`get_services_for_patient`. A Raul, que tiene 2 asignados, le enseñaría los 4 de Araceli. **No
implementa la regla del dueño.**

Y trae un `LIMIT 5` con una bandera `truncated`. Hoy no muerde (el máximo son 4 activos),
pero es una pérdida silenciosa esperando: la profesional que dé de alta un sexto servicio no
se entera de que sus pacientes ya no lo ven.

### 6.2 El arreglo — cuatro puntos, no uno

Son **cuatro** ediciones en la misma función. No basta con cambiar la consulta.

#### Punto 0 — el candado que hay que mover, y por qué es el importante

El `FOR … IN SELECT` no está suelto: está dentro de un `IF v_total > 0 THEN … END IF;`, y
`v_total` lo llena el conteo previo, que hoy cuenta **el catálogo activo del profesional**.

Si alguien lee «se sustituye el conteo previo» y pone ahí el conteo de asignados, pasa esto:
para las **13 pacientes activas sin ninguna asignación** ese conteo vale 0, el candado no
abre, y la función devuelve `services: []` **con `ok: true`**. Es el peor resultado posible:
el 76% de las pacientes recibe una lista vacía y el modelo, sin nada que contradiga el
éxito, les dice que su profesional no tiene servicios. Y como el resultado se sella en
`agent_finalize_tool_call`, el reintento del proveedor **reproduce la misma respuesta
vacía**.

`v_total` tiene que seguir queriendo decir **«cuántos se van a listar»**, que es distinto
según la rama:

```sql
  -- 4a) LA RAMA. El conteo de asignados decide, y decide dos cosas: el campo
  --     `source` y cuantos renglones va a haber.
  SELECT pg_catalog.count(*)
    INTO v_assigned_count
    FROM public.patient_services AS assigned
    JOIN public.services AS service
      ON service.id = assigned.service_id
     AND service.is_active
   WHERE assigned.patient_id = v_turn.patient_id
     AND assigned.professional_id = v_turn.professional_id;

  IF v_assigned_count > 0 THEN
    v_source := 'assigned';
    v_total  := v_assigned_count;
  ELSE
    v_source := 'catalog';
    SELECT pg_catalog.count(*)
      INTO v_total
      FROM public.services AS service
     WHERE service.professional_id = v_turn.professional_id
       AND service.is_active;
  END IF;
```

El `IF v_total > 0 THEN` que sigue **no se toca**: sigue siendo el candado que evita pedir
llave de emisión cuando no hay nada que emitir. Con `v_total = 0` la salida es
`source: "catalog"` y `services: []`, que es un resultado legítimo: hoy ninguna de las cinco
profesionales tiene cero servicios activos (el mínimo es 1).

#### Punto 1 — la consulta que sí es la regla

Sustituye al `FOR … IN SELECT` completo:

```sql
    FOR v_service IN
      WITH asignados AS (
        SELECT service.id,
               service.name,
               service.duration_minutes,
               service.modality,
               service.is_free,
               service.default_price,
               assigned.preferential_price
          FROM public.patient_services AS assigned
          JOIN public.services AS service
            ON service.id = assigned.service_id
           AND service.is_active
         WHERE assigned.patient_id = v_turn.patient_id
           AND assigned.professional_id = v_turn.professional_id
      ),
      elegidos AS (
        SELECT * FROM asignados
        UNION ALL
        SELECT service.id,
               service.name,
               service.duration_minutes,
               service.modality,
               service.is_free,
               service.default_price,
               NULL::numeric
          FROM public.services AS service
         WHERE service.professional_id = v_turn.professional_id
           AND service.is_active
           AND NOT EXISTS (SELECT 1 FROM asignados)
      )
      SELECT * FROM elegidos
       ORDER BY name ASC, default_price DESC, id ASC
    LOOP
```

**Esta consulta se ejecutó contra producción**, tal cual, con los uuid reales de Raul
(`0de21d57-…`) y de Emilio (`d0000000-…-005`), los dos de Araceli. Devolvió exactamente las
2 filas y las 4 filas de los ejemplos del §6.6, en ese orden.

El orden es `nombre, luego precio de mayor a menor`: los dos «Psicoterapia individual» de
Araceli salen **pegados uno al otro**, el de $900 antes que el de $800. Es lo que conviene:
la paciente los ve juntos y compara, en vez de encontrárselos separados por otro servicio.

La base corre con `datcollate = en_US.UTF-8` (consultado en `pg_database`), así que el orden
por nombre **no distingue mayúsculas**: `Psicoterapia individual` va antes que
`Psicoterapia Pareja`. Se verificó ejecutando el orden completo contra los datos reales; es
el de los ejemplos del §6.6.

Cinco cosas más que hay que ver en esa consulta:

1. **`NOT EXISTS (SELECT 1 FROM asignados)`** es literalmente la regla: la rama del catálogo
   sólo produce filas cuando la de asignados no produjo ninguna. No hay tercera rama.
2. **En la rama del catálogo, `preferential_price` es `NULL` por construcción**, no por
   consulta. Si esa paciente tuviera un precio preferente, tendría fila en
   `patient_services` y habría caído en la otra rama. Por eso el catálogo **no necesita
   ningún JOIN** con `patient_services` — sólo el `NOT EXISTS`, que es donde entra el GRANT
   del §5.
3. **`AND service.is_active` va también en la rama de asignados.** `update_service` puede
   apagar un servicio (`is_active = false`) **sin borrar sus asignaciones**: se leyó su
   `prosrc` y no menciona `patient_services` ni una vez (a diferencia de `delete_service`,
   que sí las borra, línea 87: `DELETE FROM public.patient_services`). Hoy hay **0
   asignaciones a servicios inactivos**, pero el camino existe. Sin ese filtro, una paciente
   podría quedarse con una lista de servicios muertos y con la rama del catálogo apagada.
4. **En la rama de asignados no se filtra `service.professional_id`**, y no es un olvido: la
   llave foránea compuesta y validada del §1.1 ya garantiza que el servicio es del mismo
   profesional que la fila de asignación, y esa fila ya está filtrada por
   `assigned.professional_id = v_turn.professional_id`. Repetirlo sería un blindaje que no
   protege de nada.
5. **Se va el `LIMIT`.** «La lista de todos» no admite recorte. El techo real es el JSON de
   16 KB del gateway, unos 81 servicios medidos (§4.2); el máximo hoy es 4.

Y se quita también la bandera `truncated` del resultado — que es el otro uso de `v_total` y
el único que desaparece.

#### Punto 2 — el bloque `DECLARE`

Tres líneas:

```sql
  v_limit constant integer := 5;   -- SE VA
  v_assigned_count integer;        -- ENTRA
  v_source text;                   -- ENTRA
```

`v_total integer;` se queda. Sin esto la función **ni siquiera compila**: `v_assigned_count`
y `v_source` no existen hoy.

#### Punto 3 — `is_free` tiene que ser el precio, no la bandera

En el `jsonb_build_object` de la salida, dos líneas:

```sql
          'is_free', v_price = 0,
          'is_preferential', v_price > 0
            AND v_service.preferential_price IS NOT NULL
```

Hoy dicen `v_service.is_free` y `NOT v_service.is_free AND …`, que es la bandera del
catálogo. Es la trampa B del §2.3: con un preferente de 0 la salida diría «cuesta $0.00
pero no es gratis». `v_price` ya está calculado tres líneas arriba con la fórmula canónica,
así que el cambio no agrega ni una consulta.

### 6.3 Firma y contrato

```sql
public.agent_list_services_from_workflow(
  p_provider_message_id text,
  p_kapso_execution_id  text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
```

| Rasgo | Valor | Por qué |
|---|---|---|
| Dueño | `agenda_psi_agent_owner` | Es quien tiene el `SELECT` sobre las tablas |
| `EXECUTE` | `REVOKE ALL FROM PUBLIC, anon, authenticated, service_role` y luego `GRANT … TO service_role` | Igual que las 13 funciones ya desplegadas |
| Superficie del portero | `agent_node` | Ya la admite |
| Operación | `list_services` | **Ya está en la lista desplegada** — `private.agent_claim_tool_call`, línea 200: `'get_capabilities', 'select_relationship', 'list_services',` |
| Es mutación | `false` | Cuenta contra el presupuesto de 8, no contra el de mutaciones |
| Ruta del gateway | `POST /tools/services` | Ya declarada; hoy contesta 403 (ver §7.3) |
| Entrada del modelo | **ninguna** | El gateway usa `parseCorrelatedInboundInput`: sólo `provider_message_id` y `kapso_execution_id`, que pone el runtime. El modelo no manda argumentos, así que no puede pedir los servicios de otra persona |

La identidad **no viaja en los argumentos**: sale de `agent_turns.patient_id` y
`agent_turns.professional_id`, que la admisión ya selló. Es el mismo bloque de las otras
funciones.

### 6.4 Forma de salida

```jsonc
{
  "status": "ok",
  "turn_disposition": "keep_open",
  "result": {
    "ok": true,
    "operation": "list_services",
    "error": null,
    "data": {
      "source": "assigned | catalog",
      "services": [
        {
          "service_handle": "<uuid opaco>",
          "name": "…",
          "duration_minutes": 50,
          "modality": "online | in_person | both",
          "price": "800.00",
          "is_free": false,
          "is_preferential": false,
          "recurrencia": null
        }
      ]
    }
  }
}
```

**`source` es el campo nuevo y es el que importa.** Dice cuál de las dos ramas se disparó, en
un campo estructurado y no en prosa. Es la mitigación del §8.2 de los hallazgos (el falso
éxito se combate con campos estructurados, no con lenguaje): el modelo no tiene que adivinar
si esa lista es «lo suyo» o «todo lo que hay», se lo dicen.

Los demás campos ya venían en la función escrita y se conservan:

| Campo | Tipo | Regla |
|---|---|---|
| `service_handle` | uuid | Identificador opaco. Lo emite `private.agent_issue_option_handle`. Nunca sale el uuid de dominio |
| `name` | texto | Tal cual está en la base, sin corregir ni adornar |
| `duration_minutes` | entero | `services.duration_minutes`. **No** se suma el buffer: la paciente reserva 50 minutos de sesión, no 60 de bloque |
| `modality` | texto | El enum crudo. La traducción a «en línea» / «presencial» / «en línea o presencial» la hace el mensaje. Si vale `both`, la paciente **tendrá que escoger una** antes de agendar (§3.2, `MODALITY_REQUIRED`) |
| `price` | texto, dos decimales | El efectivo de §2.1, ya resuelto. Lo formatea `to_char(v_price, 'FM9999999990.00')`, que es lo que produce `"0.00"` y no `"0"`. Nunca los tres números por separado |
| `is_free` | booleano | **`v_price = 0`**, el efectivo — no `services.is_free`. Ver §2.3 y §6.2 punto 3 |
| `is_preferential` | booleano | `v_price > 0 AND preferential_price IS NOT NULL`. Es para el registro, **no** para decírselo a la paciente |
| `recurrencia` | texto o `null` | **Campo del frente 12.** Una sola cadena compuesta por el servidor: «cada dos semanas, los miércoles a las 4:00 de la tarde; tu próxima es el miércoles 2 de septiembre». `null` cuando ese servicio no tiene serie viva para esta paciente — nunca cadena vacía ni «sin recurrencia». Las tres primeras piezas salen de `recurrence_series` (`frequency`, `weekday`, `start_time`) y la cuarta de `appointments`. Regla completa, con el `CASE` de días en español y la rama de «tu próxima quedó el…»: `12-recurrencias.md` §6.1 y §6.4 |

**Lo que NO sale, y es deliberado:** `service_id`, `default_price` cuando hay preferente
(sería enseñarle a la paciente el precio que no le toca), `buffer_after_minutes`,
`is_marketplace`, `professional_id`, `patient_id`.

### 6.5 Los identificadores opacos

El mecanismo ya está desplegado. `private.agent_issue_option_handle`, leída de `prosrc`:

- Acepta `kind = 'service'` con `entity_type = 'service'` y `one_time = false`, y le asigna
  **15 minutos** de vigencia (líneas 153-155).
- **Valida contra la base** que la entidad sea un servicio activo del profesional del turno
  (líneas 259-262):
  ```sql
  SELECT 1 FROM public.services AS service
   WHERE service.id = v_entity_id
     AND service.professional_id = v_turn.professional_id
     AND service.is_active
  ```
- Inserta en `public.agent_option_tokens` y devuelve `random_handle` (uuid).
- La tabla lleva `UNIQUE (turn_id, kind, stable_key)`, así que con
  `stable_key = 'service:' || service.id` **dos llamadas en el mismo turno reemiten el mismo
  handle** en vez de dar dos nombres a un mismo servicio.

La vigencia se recorta a `LEAST(now() + 15 min, agent_turns.expires_at)`: un handle nunca
sobrevive al turno que lo emitió.

**Ese handle es la entrada de los pasos siguientes** — elegibilidad y disponibilidad se piden
por servicio, y en el gateway del árbol de trabajo `/tools/booking/eligibility` ya usa
`parseServiceHandleInput`.

### 6.6 Ejemplos reales de producción

**Rama `assigned` — Raul Jimenez, paciente de Araceli.** Tiene 2 asignaciones; una con
precio preferente de $700 sobre un catálogo de $800, y otra sin preferente. **Los otros 2
servicios activos de Araceli no aparecen.**

```json
{
  "source": "assigned",
  "services": [
    {
      "service_handle": "<uuid emitido en el turno>",
      "name": "Psicoterapia individual",
      "duration_minutes": 50,
      "modality": "both",
      "price": "700.00",
      "is_free": false,
      "is_preferential": true
    },
    {
      "service_handle": "<uuid emitido en el turno>",
      "name": "Psicoterapia Pareja",
      "duration_minutes": 90,
      "modality": "online",
      "price": "1200.00",
      "is_free": false,
      "is_preferential": false
    }
  ]
}
```

El primer renglón es la prueba viva de la segunda mitad de la regla: el catálogo dice $800 y
a Raul se le cobran **$700**, porque su fila de `patient_services` trae precio preferente. El
segundo también está asignado, pero **sin** precio preferente, así que va a catálogo. Y ese
primer renglón trae `modality: "both"`: si Raul escoge ése, **hay que preguntarle si en línea
o presencial** antes de agendar (§3.2).

**Rama `catalog` — Emilio, paciente de Araceli.** Cero asignaciones: es una de las **11**
pacientes de Araceli sin ninguna, y una de las **13** activas sin ninguna en toda la base. Se
le da el catálogo activo completo, marketplace incluido.

```json
{
  "source": "catalog",
  "services": [
    {
      "service_handle": "<uuid emitido en el turno>",
      "name": "Psicoterapia individual",
      "duration_minutes": 50,
      "modality": "online",
      "price": "900.00",
      "is_free": false,
      "is_preferential": false
    },
    {
      "service_handle": "<uuid emitido en el turno>",
      "name": "Psicoterapia individual",
      "duration_minutes": 50,
      "modality": "both",
      "price": "800.00",
      "is_free": false,
      "is_preferential": false
    },
    {
      "service_handle": "<uuid emitido en el turno>",
      "name": "Psicoterapia Pareja",
      "duration_minutes": 90,
      "modality": "online",
      "price": "1200.00",
      "is_free": false,
      "is_preferential": false
    },
    {
      "service_handle": "<uuid emitido en el turno>",
      "name": "Valoracion Sin Costo",
      "duration_minutes": 30,
      "modality": "both",
      "price": "0.00",
      "is_free": true,
      "is_preferential": false
    }
  ]
}
```

Nombres, duraciones, modalidades y precios **son los de producción**, y estos dos bloques no
se escribieron a mano: salen de correr la consulta del §6.2 punto 1 contra la base
desplegada, con la misma fórmula de precio que graba `create_appointment`, y en el orden que
la propia base produjo. Los dos «Psicoterapia individual» del segundo ejemplo son los dos
servicios reales de Araceli, y ahí se ve por qué la línea del mensaje tiene que llevar precio
y modalidad.

**Los `service_handle` van con marcador, no con valor.** No se pudo tomar uno real: en toda la
historia de producción se han emitido **cero** (§7.2), y este trabajo es de sólo lectura.

### 6.7 Cómo se dice en el mensaje

Del guion de flujos (flujo 16, «Preguntar precios»), el precio sí se dice y es una ganancia
frente a la versión anterior. Con la salida de arriba:

- **Rama `assigned`, con un servicio:** «Con Araceli, Psicoterapia individual son $700, 50
  minutos.» Se dice el número y ya. **Nunca «tu precio preferente» ni «tu descuento»**:
  `is_preferential` es para el registro.
- **Rama `catalog`, con varios:** lista numerada, una línea por servicio, con **precio y
  modalidad** en cada una para que dos nombres iguales se distingan.
- **`is_free: true`:** «sin costo». Y no se menciona pago, comprobante ni transferencia: la
  cita nace `not_applicable`. Con el arreglo del §6.2 punto 3 ese campo ya quiere decir
  «efectivo 0», así que el modelo no tiene que comparar cadenas de precio.
- **El precio sale del número, nunca del nombre.** `Valoracion Sin Costo` de Miranda cuesta
  $800 y así se dice.
- **`modality: "both"` es una pregunta pendiente.** Se dice «en línea o presencial», y en
  cuanto escoja ese servicio hay que preguntarle cuál de las dos: sin esa respuesta
  `create_appointment` contesta `MODALITY_REQUIRED` (§3.2).

---

## 7. Los choques con la base, en corto

### 7.1 Ninguna función desplegada implementa la regla

| Función | Qué hace | Por qué no sirve |
|---|---|---|
| `get_services_for_patient(uuid)` | Catálogo activo completo con bandera `is_assigned`, asignados primero | Es el selector de la profesional. **Nunca corta**, sólo marca. Más: `AUTH_REQUIRED` y sin GRANT |
| `list_services()` | Catálogo activo del profesional, **sin marketplace**, sin paciente | No conoce a la paciente → nunca el precio preferente. Y su filtro de marketplace escondería 13 citas reales |
| `agent_list_services_from_workflow` (escrita, sin aplicar) | LEFT JOIN + `LIMIT 5` | Lista siempre el catálogo entero. **Repite el error.** Es lo que hay que corregir, en los cuatro puntos del §6.2 |

**No es un choque de esquema. Es un choque de función:** las columnas están bien, la fórmula
del precio está bien y es única, y la regla del dueño se escribe en una consulta de veinte
líneas. Lo que no existe es una función que la haga.

### 7.2 Un blanco que bloquea todo, y no es de este frente

```sql
select count(*) from private.agent_token_key_registry;   -- 0
```

**La tabla de llaves de emisión está vacía.** Sin una fila con `can_issue = true` y
`verify_until > now()` que además llegue hasta el vencimiento del handle
(`verify_until >= v_option_expires_at`, y ese techo son los 15 minutos del kind `service`),
la función aborta con `AGENT_WORKFLOW_LIST_SERVICES_TOKEN_KEY_MISSING` antes de devolver
nada. Concuerda con lo que ya dice el corte de la auditoría: consulta ejecutada,
`public.agent_option_tokens` tiene **0 filas** — cero handles emitidos en toda la historia.

Un matiz que importa para leer el §6.2: ese aborto vive **dentro** del candado
`IF v_total > 0`. Con cero servicios que listar no se pide llave y no se aborta. Hoy no pasa
nunca, porque las cinco profesionales tienen al menos un servicio activo.

No es un problema de esta función ni se arregla en ella: es una fila que alguien tiene que
sembrar. **Pero mientras esté vacía, esta operación no puede funcionar aunque se aplique.**

### 7.3 La ruta existe y contesta 403

Verificado leyendo la función de borde **desplegada** `agent_tool_gateway`, versión 35:
`'/tools/services'` está en `FUTURE_AGENT_ROUTES`, pero no hay rama que la atienda, así que
cae en la última línea del handler:

```ts
return safe(403, { ok: false, error: 'OPERATION_NOT_ENABLED' });
```

En el árbol de trabajo ya está escrita, y de los dos lados: la ruta en `handler.ts:459`

```ts
['/tools/services', (deps, raw) =>
  run(raw, parseCorrelatedInboundInput, (input) => deps.listServices(input))],
```

y la dependencia que la cumple en `index.ts:91`, que llama a
`agent_list_services_from_workflow`. No falta cableado: falta desplegar.

Encender esta operación es: aplicar el GRANT, hacer las **cuatro** ediciones del §6.2,
aplicar la migración, desplegar el gateway, y sembrar la llave del §7.2.

### 7.4 Lo que la regla no resuelve y hay que decidir

Dos cosas, chicas, y ninguna bloquea:

1. **Marketplace en la rama del catálogo.** La regla dice «todos». Hoy hay **tres** servicios
   activos de marketplace: el de Araceli ($900, con **13 citas de 4 pacientes distintas**),
   el de Miranda ($900, sin citas) y el de `test test` ($600, sin citas). **Recomendación:
   incluirlos**, que es lo que dice la regla y lo que aguantan los datos.

   Si el dueño prefiere excluirlos, el daño no es el que uno esperaría, y conviene decirlo
   con precisión: la única asignación con precio preferente de `test test` —Gaek, $3,000—
   **está encima de un servicio de marketplace**. Con el filtro puesto en las dos ramas, la
   rama de asignados de Gaek se queda en cero, el `NOT EXISTS` se dispara, y **cae en la rama
   del catálogo**: no se queda sin lista, se queda con un servicio distinto (`test`, $900)
   que su profesional nunca le asignó, y el de $3,000 desaparece sin que nadie se entere.
   Silencioso y peor que un error.
2. **Dos servicios activos con el mismo nombre** (Araceli ×2, Maricruz ×3). Es un dato que
   capturaron las profesionales, no una falla. Se resuelve en el mensaje, con precio y
   modalidad en cada línea. **La app de la profesional es intocable en esta ronda**, así que
   no se le va a pedir que los renombre.

---

## 8. Resumen ejecutable

| # | Qué | Dónde |
|---|---|---|
| 1 | `GRANT SELECT ON public.patient_services TO agenda_psi_agent_owner;` | Ya escrito en `20260825000000_agent_dominio_fundamento.sql:71`. Falta aplicarlo |
| 1b | `GRANT SELECT ON public.recurrence_series TO agenda_psi_agent_owner;` | **No está escrito en ninguna migración.** Lo exige el campo `recurrencia` del §6.4; ver `12-recurrencias.md` §7, renglones 1 a 3 |
| 2 | **Partir el conteo previo en dos y llenar `v_total` según la rama** (§6.2 punto 0) | `20260825001000_agent_consultas_agenda.sql`, dentro de `agent_list_services_from_workflow` |
| 3 | Cambiar el `LEFT JOIN` por el `UNION ALL` con `NOT EXISTS`, sin `LIMIT` (§6.2 punto 1) | misma función |
| 4 | `DECLARE`: quitar `v_limit`, añadir `v_assigned_count` y `v_source` (§6.2 punto 2) | misma función |
| 5 | Salida: `'is_free', v_price = 0` y `'is_preferential', v_price > 0 AND …` (§6.2 punto 3) | misma función |
| 6 | Añadir `source` a `data` y quitar `truncated` | misma función |
| 6b | Añadir el campo `recurrencia` por servicio | misma función; regla en `12-recurrencias.md` §6.1, depende del renglón 1b |
| 7 | Encender la ruta `/tools/services` en el gateway | ya escrita (`handler.ts:459` + `index.ts:91`); falta desplegar |
| 8 | Sembrar una llave de emisión en `private.agent_token_key_registry` | **bloqueante y ajeno a este frente**; hoy hay 0 filas |

Los cinco cambios de la función (2 a 6) **van juntos**. El 3 sin el 2 deja a 13 de 17
pacientes con la lista vacía; el 4 sin el 2 y el 3 no compila.

Nada de esto toca el esquema, la app de la profesional ni el portero: la operación
`('agent_node','list_services')` ya está admitida en la base desplegada
(`private.agent_claim_tool_call`, línea 200, con `v_state_allowed := v_turn.status =
'active'` en la 206).
