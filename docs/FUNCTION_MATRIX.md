# Matriz final de funciones

“Público” significa frontera Edge/Function Node→RPC con `service_role`, nunca
acceso anónimo. La columna estado distingue el SQL construido en Tasks 2–4 de
los wrappers que siguen siendo contrato de implementación.

## Edge/webhooks (fuera de esta sincronización)

| Contrato | Tipo | Actor | Propósito |
|---|---|---|---|
| `kapso_inbound_webhook` | webhook | Kapso | Autenticar, admitir y despachar inbound. |
| `agent_tool_gateway` | webhook | Kapso workflow | Autorizar una operación fija y devolver DTO redactado. |
| `kapso_payment_proof_adapter` | webhook | Kapso media | Descargar, validar y guardar comprobante privado. |

## RPC service-only (26 contratos; 5 SQL as-built)

| # | Función | Estado | Tipo | Lee | Escribe | Propósito |
|---:|---|---|---|---|---|---|
| 1 | `agent_register_inbound_context` | SQL as-built | command | targets/links/patients/sesiones/ledger/turnos | control + receipt marker exacto | Admisión atómica, replay e identidad. |
| 2 | `agent_bind_inbound_execution` | SQL as-built | command | inbound/turno/sesión | inbound/turno | Sellar execution y activar admitted/resumed. |
| 3 | `agent_mark_inbound_waiting` | SQL as-built | command | inbound/turno/sesión/claims | turno | Entrar a espera externa sin claims pendientes. |
| 4 | `agent_mark_inbound_completing` | SQL as-built | command | inbound/turno/sesión/claims | turno | Preparar completion técnica. |
| 5 | `agent_complete_inbound` | SQL as-built | command | inbound/turno/claim técnico | inbound/turno | Sellar ACK final y completed. |
| 6 | `agent_select_relationship` | contrato pendiente | command | tokens/links | sesión/control | Seleccionar relación opaca. |
| 7 | `sweep_expired_agent_sessions` | contrato pendiente | cron | sesiones/turnos | control | Expirar capacidades. |
| 8 | `purge_whatsapp_inbound` | contrato pendiente | cron | control expirado | control | Retención acotada. |
| 9 | `agent_get_capabilities` | contrato pendiente | query | relación/políticas | tokens técnicos | Capacidades seguras. |
| 10 | `agent_list_services` | contrato pendiente | query | servicios/precios/series | tokens técnicos | Servicios y precio efectivo. |
| 11 | `agent_get_booking_eligibility` | contrato pendiente | query | series/políticas | nada dominio | Elegibilidad. |
| 12 | `agent_get_availability` | contrato pendiente | query | horarios/bloqueos/citas | tokens técnicos | Slots vigentes. |
| 13 | `agent_list_upcoming_appointments` | contrato pendiente | query | citas | tokens técnicos | Citas futuras. |
| 14 | `agent_get_next_appointment` | contrato pendiente | query | citas | token técnico | Próxima cita. |
| 15 | `agent_get_location` | contrato pendiente | query | cita/perfil | nada | Ubicación segura. |
| 16 | `agent_get_pending_payments` | contrato pendiente | query | citas/pagos/proofs | nada | Resumen de pendientes. |
| 17 | `agent_get_appointment_payment_status` | contrato pendiente | query | pago/proof/cita | nada | Estado explicable. |
| 18 | `agent_get_professional_share_profile` | contrato pendiente | query | perfil público | nada | Ficha marketplace. |
| 19 | `agent_confirm_appointment` | contrato pendiente | command | cita/política | cita/eventos | Confirmar una cita. |
| 20 | `agent_create_appointment` | contrato pendiente | command | servicio/disponibilidad | cita/pago/eventos | Crear una cita. |
| 21 | `agent_cancel_appointment` | contrato pendiente | command | cita/políticas | cita/pago/eventos | Cancelar una cita. |
| 22 | `agent_reschedule_appointment` | contrato pendiente | command | cita/disponibilidad | una cita/eventos | Reprogramar ocurrencia. |
| 23 | `agent_switch_appointment_modality` | contrato pendiente | command | cita/política | una cita/eventos | Cambiar modalidad. |
| 24 | `agent_attach_payment_proof` | contrato pendiente | command | cita/pago/receipt | proof/eventos | Adjuntar comprobante. |
| 25 | `agent_resume_resource_delivery` | contrato pendiente | command | invitación/asignaciones | assignments/jobs | Liberar asignados pendientes. |
| 26 | `agent_submit_review` | contrato pendiente | command | relación/citas/reviews | review | Reseña final única. |

## Helpers privados

| Contrato | Estado | Actor | Propósito |
|---|---|---|---|
| `private.agent_claim_tool_call` | SQL as-built | wrappers | Reservar replay, ordinal, command y presupuesto. |
| `private.agent_finalize_tool_call` | SQL as-built | wrappers | Sellar outcome/resultado y saga. |
| `private.agent_issue_option_handle` | SQL as-built | wrappers | Emitir binding opaco de cinco kinds. |
| `private.agent_resolve_option_token` | SQL as-built | wrappers | Revalidar binding/expiración/consumo. |
| `resource_delivery_worker` | contrato pendiente | sistema | Procesar jobs de recursos asignados. |

## Schema de control as-built

Tasks 2–4 agregan de forma aditiva `agent_turns`, `agent_tool_calls`,
`agent_option_tokens`, `private.agent_runtime_targets`,
`private.agent_token_key_registry` y columnas de envelope en inbound/sesión. No
renombran columnas legacy ni cambian RPC Core. RLS queda default-deny y
`service_role` usa únicamente las cinco RPC públicas anteriores.

## Inventario negativo

No se definen contratos para URL online, handoff, reactivación, banca,
edición/estado de reseña, reemplazo/rechazo de comprobante, solicitud de recursos
ni mutaciones de serie. Admission no consulta/escribe sender, colas de salida,
recursos, citas, pagos, jobs o Storage.

## Invariantes de mutación

Las operaciones futuras de dominio usarán el `command_id` que claim generó y
revalidarán patient activo, ownership, estado y política bajo lock. El turno
tiene 8 llamadas útiles; `complete_inbound` ocupa el único ordinal técnico 9. La
única excepción al límite de una mutación es la saga fija cancelar→crear: cancel
solo con conteo útil `<=3`, lecturas Flow hasta 7 y create reservado en ordinal
8; nunca existe una tercera mutación. Outcome desconocido queda
`unknown_blocked`.
