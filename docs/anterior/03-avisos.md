# El carril de avisos — la versión anterior contra la actual

Corte: **2026-08-26, 17:00 CDMX**. Todo lo de aquí está leído en vivo contra los dos proyectos
desplegados: `deklbpimnkueqsugepqq` («Agenda PSI», la versión anterior, sobre Twilio) y
`ssyzfeadyrczlzjbvxyl` («Agenda PSI V2», la actual, sobre Kapso). Sólo lecturas.

> **Dos números de aquí se mueven solos.** El generador de 2 minutos de la versión anterior
> **sigue encendido**, así que el total de la tabla y el número de mensajes atorados crecen
> cada día. Al corte: **1,524 filas** y **68 atoradas**. Si mañana no cuadran, es por eso.

---

## 0. Lo que hay que saber antes de seguir leyendo

**La versión anterior tenía un cartero que sí caminaba.** Quince mensajes distintos salían
solos hacia la paciente, generados por reloj o por lo que el profesional hacía en la app, y
se entregaron o leyeron **1,306** en cuatro meses. Está apagado, pero el mecanismo está
intacto y se puede leer entero.

**Ese cartero tenía tres defectos serios**, y los tres se corrigieron en la versión actual:
no reintentaba nunca, guardaba en la misma casilla «no pude enviarlo» y «lo envié pero
WhatsApp lo rechazó», y buscaba las citas en una ventana de diez minutos —si el reloj se
caía, esos avisos no se recuperaban jamás.

**Lo que de verdad se perdió no es lo que parecía.** El aviso viejo traía botones
—Confirmar, Cancelar, Ver dirección, Subir comprobante— y un enlace para agendar. Los
avisos de hoy no traen botones. Pero **no son texto muerto**: las dieciséis plantillas
actuales están escritas para que la paciente conteste. «Si necesitas algún cambio, avísame
por aquí». «Si quieres agendar otra, escríbeme por aquí». «Mándame un mensaje por aquí y te
los envío». La puerta ya está abierta con palabras. Lo que falta no es invitar a hablar:
es que del otro lado el agente sepa agendar y reprogramar.

**Lo que sí está roto hoy:** hay una segunda cola, `public.jobs`, que **nadie recoge**. 14
trabajos llevan ahí sin que nada los toque; uno es la invitación a recoger materiales que
una psicóloga dejó a su paciente el 25 de agosto. Está verificado abajo, con la consulta.

**Y la lección más cara de la versión anterior no es «no reintentaba».** Es que estuvo
**once días seguidos sin entregar un solo mensaje** —del 30 de julio al 9 de agosto, 88
avisos fallidos, uno tras otro— y nadie se dio cuenta. Lo que faltaba no era el reintento:
era que alguien se enterara.

---

## 1. El catálogo de mensajes de la versión anterior

Dos familias, y la diferencia importa mucho para el diseño nuevo.

### 1.1 Los avisos proactivos — siempre plantilla

Nacen sin que la paciente haya escrito nada. Van a la tabla `public.whatsapp_jobs_new` con
`send_mode = 'template'` y un ContentSid de Twilio. Son los que abren conversación.

| Mensaje | Cuándo sale | Quién lo dispara | ContentSid | ¿Botones? |
|---|---|---|---|---|
| **Recordatorio 25 h** | 25 h antes de la cita, ventana de 10 min | `create_jobs_for_confirm_25hours()`, cron cada 5 min | `HX0299451fcfdf36fadf2b0eefe2df2ee6` | Sí: Confirmar, Cancelar, + enlace para reprogramar |
| **Recordatorio 1 h · presencial** | 1 h antes, ventana de 5 min | `create_jobs_for_reminder_1hour()`, cron cada 2 min | `HX3d3a771a02a73010be648717ea44cdb0` | Sí: Ver dirección |
| **Recordatorio 1 h · en línea** | igual | igual | `HX4acbfc217a9c012f76dd5be9e6247a5f` | No |
| **Seguimiento post-sesión** | 60 min después de que la cita termina, sólo entre 06:00 y 22:00 CDMX | `complete_appointments_and_create_followup_jobs()`, cron cada 2 min | `HX8c77591aed981434bf091956ca1119b3` | Sí: enlace para agendar la siguiente |
| **Invitación a agendar (manual)** | Cuando el profesional lo pide | `enqueue_manual_whatsapp_job_for_patient(patient_id)` | `HXbe7349b2c83ae093b615666c265eb44d` | Sí: enlace para agendar |
| **Mensaje inicial** | La paciente escribe texto y **no** tiene cita próxima | `rpc_handle_incoming_whatsapp_text_simple()` | `HXae25ae694623ef5159bf5f42570c5b5d` | Sí: enlace para agendar |
| **Cancelada · con cobro** | El profesional cancela cobrando | `create_whatsapp_charge_proof_job(..., 'CANCELLED')` | `HX9e8a431ec1565c2117c6fc5b103b0646` | Sí: Subir comprobante |
| **Cancelada fuera de tiempo** | igual, variante | `create_whatsapp_charge_proof_job(..., 'CANCELLED_OUT_TIME')` | `HXb847d3cd9683c74d256a904d8ea049c6` | Sí |
| **Reprogramada · con cobro** | El profesional reprograma cobrando | `create_whatsapp_charge_proof_job(..., 'RESCHEDULED')` | `HX61f6c970e7b798c24d473ddf229d2b28` | Sí |
| **Reprogramada fuera de tiempo** | igual, variante | `create_whatsapp_charge_proof_job(..., 'RESCHEDULED_OUT_TIME')` | `HXc2b9141b2d316b9ba175f6ebbdc4dc8a` | **nunca se usó** |
| **No asistió · cobro** | El profesional marca «No asistió» | `create_whatsapp_charge_proof_job(..., 'NO_SHOW')` | `HXb3ed7976e627c6e8f34e4d45476fa504` | **nunca se usó** |
| **Asistió · cobro** | El profesional marca «Asistió» | `create_whatsapp_charge_proof_job(..., 'SHOW')` | `HX9bcaebae45294d1d8b74c6d3cd4ab47e` | Sí |
| **Cancelada · sin cobro** | El profesional cancela sin cobrar | `create_whatsapp_session_change_no_charge_job(..., 'CANCELLED')` | `HX8b30967d311f5aabfa56cb046ed4172d` | No |
| **Reprogramada · sin cobro** | El profesional reprograma sin cobrar | `create_whatsapp_session_change_no_charge_job(..., 'RESCHEDULED')` | `HXdeb3fc75ffd4a33344a25c8d00ac5307` | No |
| **Aviso masivo de funciones** | Una sola vez, el 20 abril 2026 | manual | `HX04ea0c91754ac451da5b563615eca320` | — |

**Dos aclaraciones sobre la tabla, verificadas contra las filas:**

- **La plantilla `HXbe7349…` hizo dos trabajos.** Fue el seguimiento post-sesión desde el
  30 de marzo hasta el 1 de junio —**183 filas**— y desde entonces el post-sesión usa
  `HX8c7759…` (230 filas). Las otras **2 filas** de `HXbe7349…` son las dos invitaciones
  manuales del 20 de abril. Es decir: la invitación a agendar y el viejo post-sesión son
  literalmente el mismo mensaje.
- **Las dos que nunca salieron** (`RESCHEDULED_OUT_TIME`, `NO_SHOW`) están escritas en la
  función y aprobadas en Twilio, pero no hay una sola fila suya. Estaban de más.

**Volumen real, del 30 de marzo al 26 de agosto** (`select job_type, count(*) …`):

| Mensaje | Filas | De ésas, entregadas o leídas |
|---|---:|---:|
| Recordatorio 1 h (dos modalidades) | 418 | 348 |
| Seguimiento post-sesión | 413 | 335 |
| Recordatorio 25 h | 372 | 345 |
| Asistió · cobro | 114 | 100 |
| Reprogramada sin cobro | 88 | 80 |
| Aviso masivo | 67 | 53 |
| Cancelada sin cobro | 38 | 32 |
| El resto (6 tipos) | 14 | 13 |
| **Total** | **1,524** | **1,306** |

Los tres que mandan volumen son **los tres de reloj**: 1 h, post-sesión y 25 h. Los demás
son goteo.

### 1.2 Las respuestas inmediatas — texto libre, sin plantilla

Cuando la paciente toca un botón o escribe, la respuesta **no pasa por la cola**. Sale en
el mismo instante, dentro de la misma llamada HTTP, como TwiML —texto libre—, y por eso no
necesita plantilla. Esto es lo que hoy hace el agente de Kapso, y es exactamente el
precedente de lo que el dueño quiere.

`whatsapp_weebhook_2/index.ts`:

```ts
function twimlMessage(body: string): Response {
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response><Message>${xmlEscape(body)}</Message></Response>`
  return new Response(xml, { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' } })
}
```

Y cada RPC devuelve el texto ya redactado en un campo `reply_text`, que el webhook
simplemente escupe:

| Situación | Texto que recibía la paciente |
|---|---|
| Toca «Confirmar» | «Cita confirmada, nos vemos pronto. ¡Sigue cuidando tu salud mental! 👏» |
| Toca «Confirmar» dos veces | «Esta cita ya estaba confirmada. Nos vemos pronto.» |
| Toca «Cancelar» | «Cita cancelada con éxito.» |
| Cancela algo ya pasado | «No se puede cancelar porque la cita ya pasó.» |
| Toca «Subir comprobante» | «Sube la imagen de tu comprobante en este chat. Tienes 24 horas para enviarlo.» |
| Manda foto sin que se la pidan | «No tenemos un comprobante pendiente en este momento…» |
| Manda foto y sí se la pidieron | «Comprobante recibido, muchas gracias.» |
| Toca «Ver dirección» | Un mensaje de **ubicación real** de WhatsApp (`PersistentAction: geo:lat,lng`), con enlace a Google Maps de respaldo |
| Escribe texto y **sí** tiene cita | «Ya tienes una cita próxima con Psic. X el DD/MM a las HH:MM. … Este chat funciona solo con botones y envío de comprobantes.» |
| Escribe texto y **no** tiene cita | *(no responde texto: encola la plantilla de agendar)* |
| Escribe cualquier otra cosa | «Este chat funciona solo con botones y envío de comprobantes. Por favor, elige una opción válida.» |
| No está registrada | «Hola. Te damos la bienvenida a Agenda Psi. Aun no apareces en nuestro registro…» |

**Nota para el diseño nuevo:** la versión anterior ya tenía un carril de texto libre que
funcionaba y era barato. Lo usaba sólo para decir «no». El dueño quiere usarlo para decir
«sí» —agendar y reprogramar conversando—, y el precedente técnico existe.

---

## 2. El motor: cómo se generaban, cómo se despachaban, qué pasaba al fallar

### 2.1 La tabla

`public.whatsapp_jobs_new`. Quince columnas, ni una de reintentos:

```
id, professional_id, appointment_id, job_type, to_phone_e164,
content_sid, template_vars (jsonb), twilio_message_sid,
status (text, default 'created'), status_updated_at, created_at,
scheduled_for, send_mode (default 'template'), body_text, p_dispatch_source
```

**No existe `attempt_count`. No existe `next_attempt_at`. No existe `locked_until`.**

### 2.2 Los generadores

Un solo cron activo hoy, cada 2 minutos, que llama a dos funciones:

```sql
CREATE OR REPLACE FUNCTION public.run_whatsapp_generators_2min()
begin
  perform public.complete_appointments_and_create_followup_jobs();
  perform public.create_jobs_for_reminder_1hour();
end;
```

| Cron | Cada | Qué genera | ¿Encendido? |
|---|---|---|---|
| `whatsapp-generators-2min` | 2 min | Post-sesión + recordatorio 1 h | **sí** |
| `whatsapp-confirm-25hours-5min` | 5 min | Recordatorio 25 h | **no** |
| `dispatch_whatsapp_jobs_every_1min` | 1 min | *(el envío)* | **no** |

**Éste es el defecto de diseño que más daño hace, y no es el de los reintentos.** Cada
generador busca en una **ventana estrecha** y confía en que el cron corre seguido: el de
25 h mira entre `+25 h` y `+25 h 10 min`; el de 1 h entre `+1 h` y `+1 h 5 min`. Dos
consecuencias:

- Si el cron se cae media hora, esos avisos **no se recuperan nunca** —la ventana ya pasó.
- **Una cita agendada con menos de 25 h de anticipación nunca recibe recordatorio de 25 h.**
  Nació después de que su ventana pasó. No es un caso raro: es la mitad de las citas de
  última hora.

La versión actual arregló exactamente esto, y en la §3.3 está escrito cómo.

El de post-sesión hace dos cosas a la vez: cierra las citas vencidas (`SCHEDULED → PAST`) y
encola el seguimiento, todo en un solo `UPDATE … RETURNING`. Y arranca con esto:

```sql
if v_time_cdmx < time '06:00' or v_time_cdmx > time '22:00' then
  return 0;
end if;
```

**Ojo con lo que hace de verdad esa guardia.** No «se salta» el mensaje nocturno: apaga la
función entera, incluido el cierre de las citas. Una sesión que termina a las 21:30 no se
cierra esa noche; se cierra a las 06:00 del día siguiente, y ahí se encola el seguimiento
con `scheduled_for` ya vencido, así que sale de inmediato. Es decir: **el mensaje no se
pierde, se pospone a la mañana.** Esa es la conducta que hay que decidir si se copia, no
«mandar o no mandar».

### 2.3 El despacho

Dos caminos hacia la misma función de borde `new_whatsapp_jobs_sender`:

1. **Inmediato.** Una RPC crea el trabajo y de una vez llama a la función de borde por
   `pg_net`, con el `job_id` dentro:

   ```sql
   CREATE OR REPLACE FUNCTION public.dispatch_whatsapp_job_now(p_job_id bigint, ...)
   select net.http_post(
     url := 'https://deklbpimnkueqsugepqq.supabase.co/functions/v1/new_whatsapp_jobs_sender',
     headers := jsonb_build_object('x-cron-secret', 'secreto-super-seguro-123'), ...
   ```

   El secreto está **escrito en el cuerpo de la función**, no en la bóveda. Es un hallazgo
   de seguridad menor pero real.

2. **Por reloj.** El cron de 1 minuto llamaba a la misma función sin `job_id`, y ella
   barría hasta 20 pendientes.

El barrido:

```ts
const { data } = await supabase
  .from('whatsapp_jobs_new')
  .select('id')
  .eq('status', 'created')
  .or(`scheduled_for.is.null,scheduled_for.lte.${nowIso}`)
  .order('created_at', { ascending: true })
  .limit(limit)
```

Luego reclama cada uno con un `UPDATE … WHERE status = 'created'` y lee el resultado: si no
devuelve fila, otro se lo llevó. Es un candado optimista razonable, **pero sin caducidad**:
si el proceso se muere después de reclamar, el trabajo queda en `processing` para siempre y
nadie lo rescata.

### 2.4 Qué pasaba si fallaba el envío

Esto es lo importante:

```ts
async function markJobFailed(supabase, jobId) {
  await supabase.from('whatsapp_jobs_new')
    .update({ status: 'failed', status_updated_at: new Date().toISOString() })
    .eq('id', jobId).eq('status', 'processing')
}
```

Y el barrido sólo mira `status = 'created'`. **Un trabajo en `failed` no se vuelve a mirar
jamás.**

> **Reintentos: cero.** No hay contador, no hay espera, no hay cola de veneno.

**Pero la evidencia dice algo más grave que «un tropiezo de red».** Los 112 fallidos no
están repartidos: son **dos apagones**, y en medio hay meses con cero fallas.

| Cuándo | Fallidos | Qué pasó |
|---|---:|---|
| 1–3 de abril | 24 | tres días seguidos |
| 4 abr – 29 jul | **0** | cuatro meses sin una sola falla |
| 30 jul – 9 ago | **88** | **once días seguidos, todo lo que se intentó falló** |

Es decir: entre el 30 de julio y el 9 de agosto **ninguna paciente recibió nada**, y el
sistema no avisó a nadie. El reintento no lo habría salvado —lo que faltaba era que alguien
se enterara. Ése es el hueco que hay que cuidar en el diseño nuevo, no el contador de
intentos.

### 2.5 El acuse de Twilio

`twilio_status_callback` valida la firma HMAC-SHA1 de Twilio y escribe el estado:

```ts
await supabase.from("whatsapp_jobs_new")
  .update({ status: messageStatus, status_updated_at: ... })
  .eq("twilio_message_sid", messageSid);
```

**Escribe encima de la misma columna `status`.** Por eso en esa columna conviven `created`,
`processing`, `sent`, `delivered`, `read`, `undelivered` y `failed`. Y por eso un `failed`
de Twilio («el número no existe») es indistinguible de un `failed` de red («no pude ni
intentarlo»). Los números al corte: 773 leídos, 533 entregados, 112 fallidos, 68 atorados en
`created`, 23 no entregados, 15 que se quedaron en `sent`.

### 2.6 La deduplicación

Doble, y frágil. Cada generador hace un `not exists`:

```sql
and not exists (
  select 1 from public.whatsapp_jobs_new j
  where j.appointment_id = a.id and j.job_type = 'reminder_1h'
    and coalesce(j.status, '') <> 'canceled')
```

y además la tabla tiene un índice único **duro**:

```sql
CREATE UNIQUE INDEX whatsapp_jobs_new_appointment_id_job_type_key
  ON public.whatsapp_jobs_new (appointment_id, job_type)
```

Los `INSERT` de los generadores **no tienen `ON CONFLICT`**. Si el índice se dispara —dos
corridas del cron encimadas—, la corrida entera revienta y **todos** los mensajes de ese
lote se pierden, no sólo el repetido.

### 2.7 El estado hoy, 26 de agosto

El motor está apagado a medias, y de la peor manera:

- El generador de 2 minutos **sigue corriendo**. El último recordatorio de 1 h se creó hoy
  a las 16:56 UTC.
- El despachador **dejó de entregar el 30 de julio**; el cron se apagó once días después,
  el **10 de agosto**. Entre esas dos fechas siguió intentando y fallando.
- Resultado: **68 mensajes atorados en `created`**, el más viejo del 10 de agosto, el más
  nuevo de hoy. Se siguen acumulando.
- El último mensaje que de verdad llegó a una paciente fue el **30 de julio a las 13:56**.

**Y no son sólo los del reloj.** De los 68 atorados, **10 nacieron de lo que el profesional
hizo en la app** —3 «Asistió · cobro», 4 «Reprogramada sin cobro», 3 «Cancelada sin
cobro»—, el más reciente del **22 de agosto**. Esas RPC llaman a `dispatch_whatsapp_job_now`
y devuelven `ok: true` a la app; el profesional ve que el aviso «salió» y la paciente nunca
lo recibe. Ése es el camino a silencio más caro que tiene el sistema viejo hoy.

---

## 3. El contraste con hoy

### 3.1 Pieza por pieza

| | **Anterior** (`deklbpimnkueqsugepqq`) | **Actual** (`ssyzfeadyrczlzjbvxyl`) |
|---|---|---|
| Proveedor | Twilio | Kapso (API de Meta) |
| Cola | `whatsapp_jobs_new` | `whatsapp_outbox` |
| Cartero | `new_whatsapp_jobs_sender` | `enviar-whatsapp` |
| Reloj del cartero | cron 1 min (**apagado**) | cron 1 min → `disparar_sender_whatsapp()` (**encendido**) |
| Secreto que dispara al cartero | escrito en el código SQL | leído de la bóveda: `vault.decrypted_secrets` |
| Búsqueda de citas | **ventana de 5–10 min** → si el reloj falla, se pierde | **ventana completa** (`starts_at <= now() + 26 h`) + `dedup_key` → se recupera solo |
| Reclamo de lote | `UPDATE … WHERE status='created'`, uno por uno | `claim_outbox_batch(25)`, con `FOR UPDATE SKIP LOCKED` |
| Concesión con caducidad | **no** | **sí**, 2 minutos (`locked_until`) |
| Rescate del cartero muerto | **no** | **sí**, vuelve a `queued` si venció y no hubo respuesta |
| Reintentos | **cero** | **2 intentos**, con un minuto de espera |
| Cola de veneno | **no** | **sí**, `dead_letter` |
| Cancelar un mensaje encolado | **no existe** | `cancelled` + tres funciones que apagan avisos (`wa_apagar_*`) |
| Deduplicación | índice único **sin `ON CONFLICT`** → revienta el lote | `dedup_key` + `ON CONFLICT DO UPDATE` → **actualiza** el mensaje pendiente |
| Estado del proveedor | **encima** de `status` | columna aparte: `provider_status` |
| Acuse | `twilio_status_callback` | `kapso_status_callback` → `record_outbox_provider_status()` |
| Horas de silencio | **sí**, 06:00–22:00; pospone a la mañana | **no** |
| Texto libre saliente | sí (TwiML, respuesta inmediata) | sí, pero por otro carril: el agente de Kapso |
| Plantillas | 15 ContentSid sueltos dentro del código de cada función | 16 claves en `private.wa_payload_ok` + `CHECK chk_outbox_variables` (18 aprobadas en Meta) |
| Botones en las plantillas | **sí** — Confirmar / Cancelar / Ver dirección / Subir comprobante | **no** |
| ¿La plantilla invita a contestar? | no hacía falta: había botones | **sí, todas, en el texto** |
| Enlaces con token dentro del aviso | **sí** — agendar y reprogramar | **no** |
| Confirmación antes de la cita | 25 h, y **sólo** si la cita existía con esa anticipación | 26 h, y **siempre**, aunque la cita se agende 3 h antes |
| Seguimiento post-sesión | **sí**, 413 mensajes | **no existe** |

### 3.2 Lo que el viejo hacía y el nuevo no

1. **El aviso era accionable de un toque.** El recordatorio de 25 h llevaba dos botones y
   un enlace: el `template_vars` lo dice sin ambigüedad —`'5'` y `'6'` son el
   `appointment_id` (carga de los dos botones) y `'7'` es el token de reprogramar. El
   webhook los leía:

   ```ts
   if (normalized === 'confirmar') return 'confirmar'
   if (normalized === 'cancelar') return 'cancelar'
   if (normalized === 'ver direccion') return 'ver_direccion'
   if (normalized === 'subir comprobante' ...) return 'subir_comprobante'
   ```

   Hoy no hay botones. **Lo que antes era un toque ahora es escribir una frase** —y las
   plantillas actuales ya lo piden con todas sus letras (§3.3, punto 1). El hueco no es
   la invitación: es que agendar y reprogramar todavía no están en manos del agente.

2. **Contestaba texto libre en el acto.** TwiML, sin cola, sin plantilla, sin costo.

3. **Mandaba ubicación de verdad**, no un enlace: `geo:lat,lng|etiqueta`. WhatsApp la pinta
   como mapa. La versión actual no tiene nada de esto: el recordatorio presencial dice «Si
   necesitas, te comparto la dirección», y la dirección la tiene que dar el agente
   hablando.

4. **Posponía el seguimiento nocturno a la mañana** (06:00–22:00 CDMX). El nuevo no tiene
   seguimiento post-sesión, así que la pregunta hoy es distinta: ¿lo reconstruimos, y con
   qué horario?

5. **Cerraba las citas vencidas** en el mismo movimiento que generaba el aviso. Hoy eso es
   un cron aparte (`cron_sweep_past_pending`), lo cual está mejor.

6. **Un mensaje de bienvenida a quien escribe sin ser paciente**, con un teléfono humano de
   rescate: «escribe al 55 6437 0081 y un asesor te ayudará».

### 3.3 Lo que el nuevo hace y el viejo no

1. **Las plantillas ya invitan a conversar.** Ésta es la corrección más importante de todo
   el documento, y se lee directo en las plantillas aprobadas en Meta:

   | Plantilla actual | Frase que abre la puerta |
   |---|---|
   | `appointment_confirmation_request` | «Por favor, ayúdame confirmándola. **Si necesitas algún cambio, avísame por aquí.**» |
   | `appointment_confirmation_prepay` | «**Mándame por aquí la foto de tu comprobante** y queda confirmada.» |
   | `appointment_reminder_1h_in_person` | «**Si necesitas, te comparto la dirección.**» |
   | `appointment_cancelled` | «**Si quieres agendar otra, escríbeme por aquí.**» |
   | `patient_resource_delivery` | «**Mándame un mensaje por aquí y te los envío.**» |
   | `patient_welcome` | «**Conmigo puedes agendar, mover tu cita**, consultar los datos de tu sesión y ver lo de los pagos.» |
   | `patient_reactivation` | «**Solo escríbeme y buscamos un horario** que te acomode.» |
   | `patient_review_request` | «**Respóndeme por aquí** cuando puedas.» |
   | los cuatro de comprobante | «**mándame por aquí la foto** de tu comprobante» |

   No hay que reescribir el copy para que el diseño conversacional funcione. Ya está
   escrito para eso.

2. **No pierde avisos si el reloj se cae.** Los crones nuevos barren **toda** la ventana
   cada 5 minutos (`a.starts_at <= now() + interval '1560 minutes'`) y se apoyan en
   `dedup_key` con `ON CONFLICT`, en vez de mirar diez minutos y confiar. Media hora de
   caída no cuesta un solo mensaje. Y una cita agendada tres horas antes **sí** recibe su
   confirmación —en el viejo no la recibía nunca.

3. **Reintenta.** Dos veces, con espera de un minuto, y luego cola de veneno:

   ```sql
   status = CASE WHEN attempt_count >= v_max THEN 'failed' ELSE 'queued' END,
   dead_letter = (attempt_count >= v_max),
   next_attempt_at = CASE WHEN attempt_count >= v_max THEN NULL
                          ELSE now() + interval '1 minute' END
   ```

4. **Rescata al cartero muerto.** Si la concesión de 2 minutos vence y no hubo respuesta
   del proveedor, la fila vuelve sola a la cola sin gastar intento.

5. **Distingue errores permanentes de pasajeros.** El cartero conoce los códigos de Meta que
   no vale la pena reintentar: `131026, 131047, 131051, 132000, 132001, 132005, 132007,
   132012, 132015, 132016, 133010`.

6. **Puede cancelar y corregir un mensaje que todavía no sale.** El `ON CONFLICT DO UPDATE`
   reescribe la plantilla y las variables mientras la fila siga en cola —por eso una
   confirmación de prepago puede degradarse sola a confirmación normal si el comprobante
   llega antes.

7. **No se calla dos veces.** El recordatorio de 1 h se salta a quien recibió su
   confirmación en las últimas 6 horas (`v_gracia constant interval := interval '6 hours'`).

8. **Las plantillas están centralizadas** en `private.wa_payload_ok`, con un `CHECK` que
   rechaza el `INSERT` si el número de variables no cuadra.

9. **Guarda el secreto en la bóveda**, no en el código —del lado de SQL. El cartero de borde
   sigue leyendo el suyo del entorno (`SENDER_SECRET`), igual que el viejo.

### 3.4 Lo que el nuevo también tiene de más

Para no repetir el error del viejo, conviene anotarlo: **la versión actual ya acumuló sus
propias plantillas muertas.**

- `patient_reactivation` está declarada en `wa_payload_ok` y aprobada en Meta, pero
  **ninguna función la produce**. Sólo la mencionan la validación y el armador de
  variables.
- En Meta hay **18** plantillas aprobadas y en la base sólo **16** claves. Las dos de más
  —`appointment_reminder_1h_online_no_url` y `appointment_reminder_1h_online_no_link`— son
  copias del recordatorio en línea simple que nadie usa.
- `patient_review_request` sí tiene productora (`request_patient_review`), pero nada la
  llama por reloj: hoy sólo saldría si alguien la pide a mano. Cero filas enviadas.

Es exactamente el mismo patrón que `RESCHEDULED_OUT_TIME` y `NO_SHOW` en el viejo.

---

## 4. `public.jobs` — la cola que nadie recoge

### 4.1 Verificado

La tabla está bien diseñada. Tiene todo lo que le faltaba al motor viejo:

```
id, type, run_after, status, attempt_count, dedup_key, payload,
locked_until, lease_token, next_attempt_at, cancelled, dead_letter,
last_error, created_at
```

**Y nadie la lee.** La consulta que lo demuestra —funciones que mencionan `jobs` en su
cuerpo, en los dos esquemas— devuelve **14 funciones, y las 14 escriben o actualizan;
ninguna lee**: `create_appointment`, `reschedule_appointment`,
`assign_resources_to_appointment`, `delete_patient`, `mark_appointment_attended`,
`credit_appointment_payment`, `edit_appointment`, etc. No existe `claim_jobs_batch`, no
existe `dispatch_jobs`, no hay función de borde que la consulte, y ninguno de los siete
crones la menciona:

| Cron activo hoy en la versión actual | Cada |
|---|---|
| `cron_sweep_past_pending` | 5 min |
| `cron_confirmation_26h` | 5 min |
| `cron_appointment_reminder_1h` | 5 min |
| `purge_command_log` | 1 h |
| `purge_whatsapp_outbox` | 1 h |
| `purge_whatsapp_inbound` | 1 h |
| `sender_whatsapp` | 1 min |

Contraste directo: para `whatsapp_outbox` **sí** existen `claim_outbox_batch` y
`finalize_outbox`, y el cron `sender_whatsapp` los llama cada minuto. Para `jobs` no existe
el par.

### 4.2 El daño, en números

```sql
select type, status, attempt_count, count(*), min(created_at), max(created_at)
from public.jobs group by 1,2,3;
```

| Tipo | Estado | Intentos | Filas | Desde | Hasta |
|---|---|---:|---:|---|---|
| `storage_cleanup_payment_proofs` | `pending` | **0** | 7 | 12 ago | 21 ago |
| `storage_cleanup_professional_resources` | `pending` | **0** | 6 | 15 ago | 25 ago |
| `patient_resource_delivery` | `pending` | **0** | 1 | 25 ago | 25 ago |

**Los 14 con `attempt_count = 0`.** Nadie los ha tocado ni una vez.

**Y la única fila que le habla a una paciente es más específica de lo que parece.** Su
`payload` dice `"mode": "invite_template"`, y su `dedup_key` es
`patient_resource_invite:792aa87d…`. Traducido: la paciente **no** tenía la ventana de 24 h
abierta, así que lo que se quedó atorado no son los archivos —es **la invitación a pedirlos**.
La psicóloga ve «materiales asignados» y la paciente no ha recibido ni el aviso.

Además, el disparador `tg_jobs_solo_recursos_bi` **tira a la basura en silencio** todo lo
que no sea uno de esos tres tipos:

```sql
IF NEW.type IN ('patient_resource_delivery',
                'storage_cleanup_payment_proofs',
                'storage_cleanup_professional_resources') THEN
  RETURN NEW;
END IF;
RETURN NULL;   -- se descarta en silencio, sin romper a quien la escribio
```

Así que los `INSERT INTO jobs` de `create_appointment` y `reschedule_appointment` —que
encolan un `appointment_confirmation_request` cuando la cita nueva cae dentro del margen—
son código muerto. **Y da igual, no hay daño:** el cron de 26 h barre toda la ventana cada
5 minutos y recoge esa cita de todas formas. Vale la pena borrar esos `INSERT` por higiene,
no por urgencia.

### 4.3 ¿Se puede portar el motor viejo? — No, y probablemente no hace falta ningún motor

**Respuesta corta: no hay que portar nada.** El motor viejo es *peor* que el que la versión
actual ya tiene para `whatsapp_outbox`: no reintenta, no tiene concesión con caducidad, no
distingue errores permanentes, pierde avisos si el reloj se cae y muere si el índice único
se dispara. Portarlo sería importar cinco defectos ya corregidos.

**Y antes de construir un motor nuevo hay que leer bien lo que ya existe.**
`assign_resources_to_appointment` no es una función tonta que encola un mensaje: ya toma la
decisión completa, y ya consulta la ventana de 24 h.

```sql
-- 5) VENTANA DE WHATSAPP — señal (no garantia)
SELECT EXISTS (
  SELECT 1 FROM public.whatsapp_links wl
   WHERE wl.patient_id = v_patient_id
     AND wl.last_inbound_at IS NOT NULL
     AND wl.last_inbound_at >= now() - interval '24 hours'
) INTO v_window_open;
```

Y de ahí salen dos caminos distintos:

| Ventana | Estado del lote | Qué encola |
|---|---|---|
| **abierta** | `queued` | un job **por archivo**, `mode = 'direct_media'` |
| **cerrada** | `waiting_for_patient` | **un** job por lote, `mode = 'invite_template'`, con token opaco |

**Lo que esto cambia respecto de la recomendación anterior:** «que
`assign_resources_to_appointment` escriba en `whatsapp_outbox` en vez de en `jobs`» **no
alcanza y tampoco hace falta tal cual**. El caso de ventana cerrada —el único que está
atorado hoy— ya tiene su plantilla lista y aprobada, y su texto es exactamente el diseño
conversacional que el dueño quiere:

> `patient_resource_delivery`: «Psic. {{2}} te dejó unos materiales de tu sesión. **Mándame
> un mensaje por aquí y te los envío.**»

Dos variables, nombre de la paciente y nombre de la psicóloga. **Ni token, ni enlace, ni
`media`.** La paciente contesta, la ventana se abre, y los archivos salen dentro de la
conversación por el mismo carril por el que el agente habla. El caso de ventana abierta se
resuelve igual: el agente ya está hablando, entrega ahí.

**Traducido a piezas:**

| Camino | Qué se necesita |
|---|---|
| Ventana cerrada | Que la rama `invite_template` escriba una fila `patient_resource_delivery` en `whatsapp_outbox` con dos variables. Nada más. |
| Ventana abierta | Que el agente entregue los archivos en la conversación. Es capacidad del agente, no de la cola. |
| Las dos limpiezas de almacén | No le hablan a nadie. Pueden esperar, o resolverse con un cron que las ejecute directo, sin motor. |

**Y hay una razón técnica de peso para no meter archivos en `whatsapp_outbox`:** el campo
`send_mode` admite `media`, pero **ninguna función produce filas `media`** y el cartero
actual **ignora el modo por completo**:

```ts
const cuerpo = {
  messaging_product: "whatsapp",
  type: "template",           // <- fijo, nunca lee fila.send_mode
  template: { name: fila.template_key, ... }
}
```

Meter archivos por ahí obligaría a reescribir el cartero. Meterlos por la conversación, no.

---

## 5. La ventana de 24 horas

WhatsApp sólo deja escribirle texto libre a alguien si esa persona te escribió en las
últimas 24 horas. Fuera de esa ventana, sólo plantilla aprobada.

### 5.1 Antes: por construcción, y sin manera de comprobarlo

**No había ninguna columna que registrara cuándo escribió la paciente por última vez.** La
tabla `whatsapp_links` de la versión anterior tiene cinco columnas y ninguna es una fecha:

```
id, professional_phone, patient_phone, patient_id, professional_id
```

La regla se cumplía por la forma del código, no por una comprobación:

- **Todo lo que sale sin que la paciente haya escrito** es plantilla. Los 15 mensajes del
  catálogo llevan `send_mode = 'template'` y un ContentSid.
- **Todo lo que sale como texto libre** es respuesta *dentro de la misma llamada HTTP* que
  trajo el mensaje de la paciente. Por definición, la ventana está abierta.

El truco: el modo `text` de la cola existía, pero se usó **tres veces en marzo**
(`cita_confirmada`, con el texto «Cita confirmada, nos vemos pronto…») y se abandonó en
favor de TwiML. Hoy sería un riesgo real —un mensaje `text` encolado que se envía 40 minutos
después podría caer fuera de la ventana—, pero nadie lo usa.

Y hay una **segunda ventana de 24 horas, que no es la de WhatsApp**: el plazo para mandar el
comprobante. `proof_request.expires_at` tiene por defecto `now() + '1 day'`, y el copy lo
dice: «Tienes 24 horas para enviarlo».

### 5.2 Ahora: por construcción, y además sí se comprueba

**Por construcción, y esta vez de forma más estricta.** El cartero `enviar-whatsapp` **sólo
sabe mandar plantillas**. El `send_mode` de la fila ni se consulta. Es imposible que la cola
mande texto libre, aunque alguien encole una fila `text` o `media`.

Los mensajes de texto libre salen por un carril distinto: el agente de Kapso, con su
herramienta `send_notification_to_user`, y sólo mientras la conversación está viva.

**Y sí existe el reloj, y sí se consulta.** `whatsapp_links.last_inbound_at` lo escribe
`agent_register_inbound_context` cada vez que la paciente escribe, y
`assign_resources_to_appointment` lo lee antes de decidir qué encolar (§4.3). Es la única
función que lo consulta hoy, y es la única que lo necesita: es la única que quiere mandar
algo que no es plantilla.

### 5.3 El resumen honesto

| | Anterior | Actual |
|---|---|---|
| ¿Se registra cuándo escribió la paciente? | **no** | **sí**, `last_inbound_at` |
| ¿Se comprueba la ventana antes de mandar? | no había con qué | **sí**, donde importa: entrega de materiales |
| ¿Puede la cola mandar texto libre? | sí en teoría, se usó 3 veces | **no**, es imposible |
| ¿Quién manda texto libre? | el webhook, en el acto (TwiML) | el agente de Kapso, en la conversación |
| ¿Está escrito en algún lado? | no | no |

**En las dos versiones la ventana se respeta porque la cola no da para violarla.** La
diferencia es que hoy, cuando alguien necesita saber si puede hablar libre, ya tiene con qué
preguntarlo.

---

## 6. Qué implica todo esto para el diseño conversacional

1. **La puerta de entrada ya existe, y no es la que se creía.** El aviso de hoy no es texto
   muerto: las plantillas piden respuesta con todas sus letras (§3.3). Lo que **no** existe
   hoy es el seguimiento post-sesión —los 413 mensajes del viejo no tienen equivalente en la
   versión actual, no hay cron que los genere—. Así que los puntos de entrada reales son
   **la confirmación de 26 h y el recordatorio de 1 h**, y encima está `patient_welcome`,
   que ya le dice a la paciente «conmigo puedes agendar, mover tu cita».

2. **Reconstruir el post-sesión es una decisión aparte, y buena.** Era el segundo de más
   volumen y el momento exacto en que la paciente quiere agendar la siguiente. Si se
   reconstruye, `patient_reactivation` y `patient_review_request` ya están aprobadas y
   nadie las manda: hay material listo. Y el viejo enseña el horario: **posponer a la
   mañana, no callar**.

3. **La ventana se abre sola en cuanto ella contesta.** El aviso sale como plantilla, ella
   responde cualquier cosa, y a partir de ahí el agente puede hablar libre durante 24 h. No
   hay que inventar mecanismo.

4. **La cola de avisos ya está bien. No la toques.** `whatsapp_outbox` +
   `claim_outbox_batch` + `finalize_outbox` + el cron de 1 minuto tiene reintentos,
   concesión con caducidad, cola de veneno y ventana amplia. Es mejor que el motor viejo en
   los cinco puntos que importan.

5. **Falta el aviso de que algo no llegó.** Es el hallazgo más caro de la versión anterior:
   once días sin entregar nada y nadie se enteró (§2.4). Hoy `whatsapp_outbox` tiene
   `dead_letter`, pero **nadie lo mira**. Una revisión diaria —«¿hay filas en `dead_letter`
   o atoradas en `queued` más de una hora?»— vale más que cualquier reintento adicional.

6. **La entrega de materiales se resuelve conversando, no con un motor.** El único trabajo
   atorado hoy es una invitación con la ventana cerrada, y su plantilla ya está aprobada y
   dice «mándame un mensaje por aquí y te los envío» (§4.3). Es la pieza más pequeña de
   toda la lista y la única que hoy deja a una paciente sin nada.

7. **Lo que sale de la cola sigue siendo plantilla, siempre.** El diseño nuevo tiene que
   separar con claridad **el aviso** (plantilla, cola, reloj) de **la conversación** (texto
   libre, agente, ventana abierta). Y hay un eco concreto que ya está programado: la RPC
   `reschedule_appointment` encola `appointment_rescheduled` **sin preguntar quién
   reprogramó**. Si el agente acuerda la reprogramación hablando y luego llama a esa RPC,
   la paciente recibe la plantilla contándole lo que acaba de acordar. Hay que decidirlo
   antes de conectar el agente a reprogramar, no después.

---

## Anexo — de dónde salió cada cosa

| Afirmación | Cómo se verificó |
|---|---|
| Los 15 mensajes y sus ContentSid | `pg_get_functiondef` de los cinco generadores + `select content_sid, count(*), count(distinct job_type) from whatsapp_jobs_new group by 1` |
| `HXbe7349…` sirvió a dos mensajes (183 + 2) | misma consulta, filtrando por ese `content_sid` |
| Volumen y entregados por tipo | `select job_type, count(*) filter (where status in ('read','delivered')), count(*) from whatsapp_jobs_new group by 1` |
| Cero reintentos | `new_whatsapp_jobs_sender/index.ts`, `markJobFailed` + el barrido filtrando sólo `status='created'` |
| Los 112 fallos son dos apagones | `select date_trunc('day',created_at)::date, count(*) from whatsapp_jobs_new where status='failed' group by 1` → 1–3 abr (24) y 30 jul – 9 ago (88) |
| 68 atorados, 10 de ellos de acciones del profesional | misma tabla, `where status='created' group by job_type` |
| El último entregado fue el 30 jul 13:56 | `max(status_updated_at) where status in ('read','delivered')` |
| Crones apagados | `select jobid, jobname, schedule, active from cron.job` en `deklbpimnkueqsugepqq` |
| Ventana estrecha del viejo (25 h + 10 min) | cuerpo de `create_jobs_for_confirm_25hours()` |
| Ventana amplia del nuevo (26 h completas) | `v_lead constant interval := interval '1560 minutes'` en `cron_appointment_confirmation_26h` |
| Horas de silencio apagan la función entera | `if v_time_cdmx < '06:00' or > '22:00' then return 0` al inicio de `complete_appointments_and_create_followup_jobs` |
| Índice único sin `ON CONFLICT` | `pg_indexes` de `whatsapp_jobs_new` + cuerpo de los generadores |
| Nadie consume `public.jobs` | `pg_proc` cruzado con `position('from jobs' …)`: 14 escritoras, 0 lectoras; `cron.job` sin entrada |
| El job atorado es una invitación, no los archivos | `select payload->>'mode', dedup_key from public.jobs where type='patient_resource_delivery'` → `invite_template` |
| La ventana **sí** se comprueba hoy | bloque 5 de `assign_resources_to_appointment`: `last_inbound_at >= now() - interval '24 hours'` |
| El cartero nuevo ignora `send_mode` | `enviar-whatsapp/index.ts`, `type: "template"` fijo en el cuerpo |
| Las plantillas actuales invitan a contestar | texto aprobado de las 18 plantillas en Meta, leído por la API de Kapso |
| 16 claves en la base, 18 aprobadas en Meta | `pg_get_functiondef` de `private.wa_payload_ok` contra el listado de plantillas de Kapso |
| `patient_reactivation` no tiene productora | `pg_proc` filtrando `prosrc like '%''patient_reactivation''%'` → sólo `wa_payload_ok` y `tg_outbox_variables_bi` |
| No hay post-sesión en la versión actual | `cron.job` (siete entradas) + funciones que escriben en `whatsapp_outbox`: ninguna se dispara al terminar la sesión |
| El eco de reprogramar | cuerpo de `reschedule_appointment`: el `INSERT INTO whatsapp_outbox` de `appointment_rescheduled` no mira el actor |
| 24 h del comprobante | `column_default` de `proof_request.expires_at` = `now() + '1 day'` |
