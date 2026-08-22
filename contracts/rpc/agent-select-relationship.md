# `agent_select_relationship`

Tipo: `command de control`
Actor: gateway service-only

## Objetivo

Seleccionar una relación paciente/profesional mediante una opción opaca vigente.

## Entrada externa

Modelo: `{ "relationship_token": "opaque" }`. Firma interna: `(session_id uuid, relationship_option_handle uuid, command_id uuid) -> jsonb`.

## Contexto inyectado

Gateway verifica bearer HMAC y deriva sesión, turno, handle y command ID.

## Lee

`public.agent_sessions`, `public.agent_option_tokens`, `public.whatsapp_links`, `public.patients`, perfil público.

## Escribe

Selección de sesión y consumo de option handle; cero escrituras de dominio.

## Validaciones

Token relationship 10m, sesión/turno/phone/tenant coincidentes, link real, relación visible. Duplicados de nombre se diferencian solo con título público aprobado.

## Flujo lógico

1. Resolver handle bajo lock.
2. Revalidar link y estado.
3. Consumir opciones anteriores y sellar la relación.
4. “Cambiar de profesional” invalida selección antes de emitir nuevas opciones.

## Transacción/locks/idempotencia

Lock de sesión/token; `command_id` idempotente; replay devuelve la misma selección.

## Salida redactada

`{selected:true, display_name, public_title?, capability_code}` sin IDs ni estados internos.

## Errores seguros

`TOKEN_INVALID`, `TOKEN_EXPIRED`, `RELATIONSHIP_NOT_AVAILABLE`, `SESSION_EXPIRED`.

## No debe hacer

No aceptar patient/professional ID, no exponer portfolio/BSUID, no activar pacientes ni mutar dominio.

## Pruebas mínimas

Una/múltiples relaciones, nombres iguales, token extranjero/vencido/consumido, cambio y replay.

## Trazabilidad

DEC-08; SCN-05, SCN-06, SCN-11.

