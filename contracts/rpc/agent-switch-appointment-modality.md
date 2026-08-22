# `agent_switch_appointment_modality`

Tipo: `command`
Actor: gateway service-only

## Objetivo

Cambiar la modalidad de una cita futura específica cuando la dirección y anticipación estén permitidas.

## Entrada externa

Modelo: `{appointment_token,modality,confirmed:true}`. Interno: `(session_id uuid, appointment_option_handle uuid, new_modality public.modality, command_id uuid) -> jsonb`.

## Contexto inyectado

Tenant/turno/handle/command ID y políticas Core.

## Lee

`patients`, links, appointment/service, policies, resources/connection y `command_log`.

## Escribe

Una cita y eventos/command log; no serie ni URL.

## Validaciones

Confirmación, `patients.patient_status='active'`, token/tenant, cita scheduled/futura, modalidad realmente distinta, dirección permitida, lead mínimo y recurso disponible.

## Flujo lógico

Tomar **lock** de cita y, si aplica, recurso; revalidar policy/estado; actualizar una ocurrencia; sellar comando/DTO.

## Transacción/locks/idempotencia

Una transacción idempotente por `command_id`; constraint/revalidación resuelve carreras. Unknown outcome bloquea reintento nuevo.

## Salida redactada

`{outcome,service_name,starts_at_local,old_modality,new_modality}`.

## Errores seguros

`PATIENT_INACTIVE`, `MODALITY_NOT_SUPPORTED`, `DIRECTION_NOT_ALLOWED`, `TOO_LATE_TO_SWITCH`, `RESOURCE_CONFLICT`, `UNKNOWN_OUTCOME`.

## No debe hacer

No generar/consultar enlace, no cambiar precio/pago/serie, no aceptar política del modelo.

## Pruebas mínimas

Ambas direcciones, no-op, lead exacto, recurso ocupado, replay, inactivo, otra relación y timeout.

## Trazabilidad

DEC-07, DEC-08, DEC-10, DEC-23; SCN-31, SCN-32.

