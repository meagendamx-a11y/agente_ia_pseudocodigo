# `agent_get_professional_share_profile`

Tipo: `query`
Actor: gateway service-only, incluido fallback público

## Objetivo

Compartir una ficha breve equivalente al marketplace público.

## Entrada externa

Modelo: `{}`. Interno: `(session_id uuid) -> jsonb`.

## Contexto inyectado

Relación seleccionada o relación inactiva conocida; no acepta slug/ID del modelo.

## Lee

Perfil profesional, servicios y campos públicos aprobados.

## Escribe

Cero escrituras de dominio.

## Validaciones

La relación/phone debe corresponder al profesional. Esta excepción puede funcionar para paciente inactivo, pero solo si el perfil es públicamente visible/aprobado.

## Flujo lógico

Construir nombre, título público, enfoques/servicios públicos, modalidades, ciudad pública y URL pública del marketplace cuando exista.

## Transacción/locks/idempotencia

Query idempotente.

## Salida redactada

`{display_name,public_title,summary,services,modalities,city?,public_profile_url?}`.

## Errores seguros

`RELATIONSHIP_NOT_SELECTED`, `PUBLIC_PROFILE_NOT_AVAILABLE`.

## No debe hacer

No exponer estados draft/rejected, contacto privado, agenda, documentos, notas o métricas internas.

## Pruebas mínimas

Perfil aprobado, no público, relación activa/inactiva, duplicado de nombre y otro profesional.

## Trazabilidad

DEC-08, DEC-18; SCN-11, SCN-23.
