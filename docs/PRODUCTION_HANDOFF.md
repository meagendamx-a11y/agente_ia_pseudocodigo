# Handoff de implementación, rollout y rollback

## Estado comprobado de Fase 0 y Fase 1A

La base de control de Fase 0 está aplicada en Supabase y las Edge Functions `kapso_inbound_webhook` y `agent_tool_gateway` están desplegadas con kill switches apagados. Kapso entrega inbound v2 al webhook y conserva separado el callback de estados. Fase 1A agregó el cliente start/resume, el bind de ejecución, una RPC mínima para resolver resume y `agent_get_capabilities`; el Agent Node y sus tools aún no están activos.

Esta estrategia no usa Supabase Branching ni requiere plan Pro. Las migraciones persistentes se aplicaron de forma aditiva; las pruebas de comportamiento posteriores usaron fixtures reservados dentro de transacciones con `ROLLBACK`.

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

- Task 6, con workflow deshabilitado, responde HTTP `200` con `{ok:true,status:'admitted_no_workflow'}` y no llama al workflow de Kapso.
- La versión desplegada contiene start API `202`, resume API `200`, recuperación service-only del execution sellado y bind posterior; ese código no corre mientras `AGENT_WORKFLOW_ENABLED=false`.
- La identidad de admisión no verificada se envía explícitamente como `p_kapso_contact_id=null`, `p_business_portfolio_id=null` y `p_business_scoped_user_id=null`; no se inventan equivalencias entre BSUID, portfolio o contacto.
- Task 7 toma `new URL(request.url).pathname` como frontera canónica y despacha solo mediante un mapa exacto de rutas. El contrato se define sobre ese pathname canónico, no sobre interpretaciones previas de la forma original de la URL.
- Las dos funciones nuevas conservan archivos `deno.lock` reales, generados por Deno con integridad; no son placeholders editados a mano.
- Sender, callback de estados, Flutter, Marketplace, outbox y recursos quedan fuera de este cambio.

## Sobre de costo y abuso

Hay cero tráfico LLM del agente. `gpt-5.6-luna` ya aparece en el selector autenticado, pero sigue sin fijarse su `provider_model_id` interno ni pasar el E2E; no hay fallback automático. El sobre congelado es `max_tokens=2048`, `max_iterations=16`, `reasoning=medium` y `prompt_cache_ttl=5m`.

Cada turno admite 8 llamadas útiles; `complete_inbound` usa el ordinal 9 técnico y no amplía ese presupuesto. El gateway permite 1 reintento de transporte, nunca un reintento semántico automático de una mutación.

## Checkpoints de producción separados

1. **Checkpoint DB — completado para Fase 1A.** Migraciones aditivas aplicadas; ACL/owner y pruebas transaccionales verificadas.
2. **Checkpoint Edge — completado y apagado.** Slugs desplegados, secretos base cargados y humo seguro validado; las banderas siguen en `false`.
3. **Checkpoint Kapso Draft — en curso.** Inventario autenticado y Draft vacío observados; falta guardar API Trigger/Agent Node sin activarlo.
4. **Checkpoint E2E/activación — pendiente.** Probar start/resume, contexto, invocation identity y cierre con un número de prueba antes de habilitar allowlist/tools.

No se combinan checkpoints por conveniencia y no basta cambiar un prompt o JSON para autorizar el siguiente.

## Métricas sin PII

Medir contadores agregados de 401/4xx/5xx, latencia p95, replay/rate-limit, claims útiles, ordinal técnico, duplicados de command/tool key, outcomes unknown, errores Flow y costo por workflow. No registrar teléfono, WAMID, texto, payload, secretos, stack traces ni IDs de dominio. Revisar costo beta diariamente.

## Rollback posterior a un rollout autorizado

1. Apagar flags server-side y deshabilitar la ruta inbound/Agent Node en Kapso.
2. Mantener sender/callback y evidencia aditiva; no borrar filas ni compensar destructivamente citas, pagos, proofs o reseñas.
3. Expirar turns pendientes y revocar `EXECUTE` de las RPC agent si el incidente lo exige.
4. Revertir la Edge/config provider anterior solo si el checkpoint Edge la cambió.

## Gates aún pendientes

- Guardar la configuración Draft del Agent Node/API Trigger sin activarla.
- Preflight Kapso: `provider_model_id`, start/resume, `whatsapp_context`, invocation identity y send/complete.
- Ejecutar advisors finales después de cada migración de tools.
- Corrección/prueba del reminder online y correlación `patient_resource_delivery` outbox→provider message→batch, fuera de Fase 0.

## Publicación de esta guía

El runtime de Fase 1A vive en la rama aislada `codex/agent-phase-1a`. Esta guía registra el estado observado, pero no autoriza por sí sola activar Kapso, las tools o las banderas de producción.
