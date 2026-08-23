# Seguridad y fronteras de confianza

## Principios

- Kapso es un proveedor externo: cada webhook se autentica sobre el body crudo antes de usar payload.
- El modelo no autoriza. Solo recibe esquemas mínimos y DTOs redactados.
- El gateway tiene rutas fijas; no acepta nombre de función, session/command ID ni claves de idempotencia del modelo.
- Las futuras funciones SQL son `SECURITY DEFINER`, `search_path=''`, objetos plenamente calificados, `REVOKE` general y `GRANT EXECUTE` solo al rol de servicio requerido.
- Todas las funciones privadas de dominio revalidan relación y paciente activo.

## Secretos y tokens

HMAC de webhooks y opción vive fuera de la base. Logs permiten hashes, handles, reason codes, ordinales y latencia; prohíben teléfonos, texto, media, rutas, bearer tokens, secretos y notas clínicas. Rotación conserva el material antiguo únicamente para verificar/regenerar replays retenidos.

## Amenazas cubiertas

- Replay o reutilización de idempotency key con otro payload.
- Confusión de tenant por teléfono, contacto, destino o conversación.
- Prompt injection en texto y metadata multimedia.
- Carrera de dos mensajes/tools/slots.
- Timeout posterior a commit y doble mutación.
- Tokens vencidos, extranjeros, manipulados o ya consumidos.
- SSRF/archivos falsos en comprobantes.
- Exfiltración de datos internos por resultados o logs.

## Fail closed

Firma, target, identidad, relación, paciente activo, tool identity, token, presupuesto o outcome desconocido bloquean la operación. Crisis/soporte puede responder con copia fija sin tools; el tráfico limitado no llega al modelo.
