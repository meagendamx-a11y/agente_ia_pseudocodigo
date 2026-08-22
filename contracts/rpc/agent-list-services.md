# `agent_list_services`

Tipo: `query`
Actor: gateway/Flow service-only

## Objetivo

Listar todos los servicios activos del profesional con precio efectivo y elegibilidad preliminar.

## Entrada externa

Modelo: `{}`. Interno: `(session_id uuid) -> jsonb`.

## Contexto inyectado

Relación activa, sesión y turno.

## Lee

`patients`, `whatsapp_links`, `services`, patient price overrides y `recurrence_series`/citas subsecuentes.

## Escribe

Cero escrituras de dominio; solo option handles de servicio estables por turno.

## Validaciones

Revalidar `patients.patient_status='active'`, tenant, servicio activo/visible y moneda consistente.

## Flujo lógico

1. Obtener **todos los servicios activos/all active services**.
2. Precio exacto: si `is_free`, **0**; si no, `preferential_price`; de lo contrario `default_price`.
3. Calcular `has_active_recurrence` para el mismo servicio/paciente.
4. Excluir de opciones agendables el servicio con serie subsecuente activa; conservar reason code explicable.
5. Emitir `service_token`, nunca ID.

## Transacción/locks/idempotencia

Query sin reserva; option handle estable. Precio mostrado se recalcula al crear.

## Salida redactada

`{services:[{service_token,name,duration_minutes,modalities,effective_price,is_bookable,reason_code}]}`.

## Errores seguros

`SESSION_EXPIRED`, `PATIENT_INACTIVE`, `NO_ACTIVE_SERVICES`, `PRICE_CONFIGURATION_INVALID`.

## No debe hacer

No crear cita, no reservar slot, no exponer IDs/overrides ni permitir servicio con recurrencia activa.

## Pruebas mínimas

Gratis/preferencial/default; todos activos; inactivo; recurrencia mismo/otro servicio; token estable.

## Trazabilidad

DEC-04, DEC-05, DEC-08; SCN-11..SCN-13.

