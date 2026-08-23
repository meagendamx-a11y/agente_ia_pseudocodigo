# Plan de pruebas para la implementación real

Las pruebas de este repositorio validan contratos; no prueban PostgreSQL, HTTP, Storage ni Kapso.

## Base de datos

- `supabase test db` y `supabase db lint` sobre baseline reconciliado.
- ACL/RLS: anon/authenticated denegados y service-only exacto; `SECURITY DEFINER`, search path vacío y objetos calificados.
- Concurrencia real: replay inbound; locks teléfono→profesional; un turno activo; 8 calls; una mutación; saga upgrade/reject/commit/unknown.
- Dos creates/reprogramaciones por slot; constraint anti-overlap; DST; precio/policies; scope de una ocurrencia.
- Paciente inactivo negado en cada wrapper privado de dominio.
- Retención/purga y sweep por lotes sin borrar unknown/activos.

## Edge/HTTP

- `deno test` por Edge futura.
- HMAC sobre body crudo, comparison timing-safe, 1 MiB, header/body mismatch, target, replay/mismatch y timeout.
- Tool auth, schemas, canonical input hash, mismo invocation key en retry y DTO <=16 KiB sin PII.
- Media: SSRF/redirect, magic bytes, 5 MiB streaming, 8 s, bucket privado, receipt 10m y cleanup.

## Kapso E2E con número de prueba

- Inbound -> admission -> API Trigger -> tool -> texto -> complete -> Function Node.
- Primer input y resume preservan semántica/`whatsapp_context`.
- Provider tool invocation ID idéntico tras un retry de transporte.
- `enter_waiting`, concurrent resume 409, 429/Retry-After y send fallido.
- Flow draft validado: Data API 3.0, encryption, `nfm_reply`, flow token, lost-slot refresh y success tras commit.
- Cero-tenant crisis, rate limit sin LLM y copy completa; injection en texto/media metadata.
- Quoted resource reply -> outbox provider message -> batch exacto.

## Regresión del rail existente

- Sender claim/lease/finalize y callback monotónico `sent/delivered/read/failed` sin cambios.
- Templates actuales y reminder online corregido antes de citas online.
- Proof sigue pending; recursos no asignados nunca salen; reseña solo una vez.

## Criterios

No habilitar tráfico si queda un fallo de identidad, idempotencia, ACL, concurrencia, Flow provider o reminder online. Static green por sí solo no satisface el gate E2E.
