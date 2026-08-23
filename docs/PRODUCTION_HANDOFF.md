# Handoff de implementación, rollout y rollback

## Estado comprobado de Fase 0

El código de Fase 0 está implementado en una rama Git/worktree de implementación. No fue aplicado en Supabase producción, las Edge Functions nuevas no fueron desplegadas y el webhook/Agent Node no fue registrado ni activado en Kapso. Los contratos SQL de Tasks 2–4 sí están sincronizados en esta guía; esto no equivale a un deploy.

Esta estrategia no usa Supabase Branching ni plan Pro: no se requiere contratar ninguno para validar Fase 0. La prueba remota autorizada fue un batch transaccional que terminó en `ROLLBACK`; cualquier cambio persistente requiere otro checkpoint.

## Evidencia rollback-only

El arnés ejecuta migración y suite conductual dentro de una sola conexión:

```sql
begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
-- migración exacta de Fase 0
-- pruebas exactas con fixtures sintéticos reservados
rollback;
```

El baseline se captura dinámicamente antes y después desde catálogos, versiones de migración y metadatos de Edge; no se fija un total como condición de éxito. La ejecución más reciente observó 75 migraciones, pero `75` es una observación, no un gate. El gate es igualdad exacta antes/después y ausencia posterior de roles, tablas, funciones y fixtures de Fase 0.

## Fronteras Edge as-built

- Task 6, con workflow deshabilitado, responde HTTP `200` con `{ok:true,status:'admitted_no_workflow'}` y no llama a Kapso.
- La identidad de admisión no verificada se envía explícitamente como `p_kapso_contact_id=null`, `p_business_portfolio_id=null` y `p_business_scoped_user_id=null`; no se inventan equivalencias entre BSUID, portfolio o contacto.
- Task 7 toma `new URL(request.url).pathname` como frontera canónica y despacha solo mediante un mapa exacto de rutas. El contrato se define sobre ese pathname canónico, no sobre interpretaciones previas de la forma original de la URL.
- Las dos funciones nuevas conservan archivos `deno.lock` reales, generados por Deno con integridad; no son placeholders editados a mano.
- Sender, callback de estados, Flutter, Marketplace, outbox y recursos quedan fuera de este cambio.

## Sobre de costo y abuso

Hay cero tráfico LLM y cero llamadas a Kapso en Fase 0. `gpt-5.6-luna` es el modelo preferido, pero sigue no verificado en Kapso; no hay fallback automático. El sobre congelado es `max_tokens=2048`, `max_iterations=16`, `reasoning=medium` y `prompt_cache_ttl=5m`.

Cada turno admite 8 llamadas útiles; `complete_inbound` usa el ordinal 9 técnico y no amplía ese presupuesto. El gateway permite 1 reintento de transporte, nunca un reintento semántico automático de una mutación.

## Checkpoints de producción separados

1. **Checkpoint DB — migración persistente.** Repetir baseline dinámico, revisar el diff SQL, aplicar la migración y ejecutar pruebas/advisors. Esto no autoriza Edge ni Kapso.
2. **Checkpoint Edge — deploy y secretos.** Desplegar cada slug nuevo deshabilitado, cargar secretos server-side y verificar `deno.lock`; esto no autoriza registro ni activación en Kapso.
3. **Checkpoint Kapso — registro y activación.** Completar el inventario autenticado, fijar IDs no secretos, registrar webhook/Agent Node en un número de prueba y activar por allowlist. Requiere autorización independiente de los dos checkpoints anteriores.

No se combinan checkpoints por conveniencia y no basta cambiar un prompt o JSON para autorizar el siguiente.

## Métricas sin PII

Medir contadores agregados de 401/4xx/5xx, latencia p95, replay/rate-limit, claims útiles, ordinal técnico, duplicados de command/tool key, outcomes unknown, errores Flow y costo por workflow. No registrar teléfono, WAMID, texto, payload, secretos, stack traces ni IDs de dominio. Revisar costo beta diariamente.

## Rollback posterior a un rollout autorizado

1. Apagar flags server-side y deshabilitar la ruta inbound/Agent Node en Kapso.
2. Mantener sender/callback y evidencia aditiva; no borrar filas ni compensar destructivamente citas, pagos, proofs o reseñas.
3. Expirar turns pendientes y revocar `EXECUTE` de las RPC agent si el incidente lo exige.
4. Revertir la Edge/config provider anterior solo si el checkpoint Edge la cambió.

## Gates aún pendientes

- Preflight Kapso autenticado: modelo/IDs, start/resume, invocation identity, send/complete y Flow.
- Apply persistente de migración y advisors sobre el schema ya visible.
- Deploy deshabilitado de ambos slugs y carga de secretos.
- Corrección/prueba del reminder online y correlación `patient_resource_delivery` outbox→provider message→batch, fuera de Fase 0.

## Publicación de esta guía

El runtime quedó en commits locales, incluido el runbook `82b603c`, y esta sincronización contractual se comete localmente después de sus pruebas. Ninguno de esos commits hace `push`, deploy, apply persistente ni registro en Kapso. La publicación o integración posterior requiere la elección explícita del propietario.
