# Matriz final de funciones

Los RPC públicos son `service_role` únicamente. “Público” aquí significa frontera Edge→RPC, nunca acceso anónimo.

## Edge/webhooks

| Contrato | Tipo | Actor | Propósito |
|---|---|---|---|
| `kapso_inbound_webhook` | webhook | Kapso | Autenticar, admitir y despachar inbound. |
| `agent_tool_gateway` | webhook | Kapso workflow | Autorizar una operación fija y devolver DTO redactado. |
| `kapso_payment_proof_adapter` | webhook | Kapso media | Descargar, validar y guardar comprobante privado. |

## RPC service-only (23)

| # | Función | Tipo | Lee | Escribe | Propósito |
|---:|---|---|---|---|---|
| 1 | `agent_register_inbound_context` | command | links/sesiones/ledger | control | Admisión e identidad. |
| 2 | `agent_select_relationship` | command | tokens/links | sesión/control | Seleccionar relación opaca. |
| 3 | `agent_complete_inbound` | command | turno/inbound | control | Sellar respuesta final. |
| 4 | `sweep_expired_agent_sessions` | cron | sesiones/turnos | control | Expirar capacidades. |
| 5 | `purge_whatsapp_inbound` | cron | control expirado | control | Retención acotada. |
| 6 | `agent_get_capabilities` | query | relación/políticas | tokens técnicos | Capacidades seguras. |
| 7 | `agent_list_services` | query | servicios/precios/series | tokens técnicos | Servicios y precio efectivo. |
| 8 | `agent_get_booking_eligibility` | query | series/políticas | nada dominio | Elegibilidad. |
| 9 | `agent_get_availability` | query | horarios/bloqueos/citas | tokens técnicos | Slots vigentes. |
| 10 | `agent_list_upcoming_appointments` | query | citas | tokens técnicos | Citas futuras. |
| 11 | `agent_get_next_appointment` | query | citas | token técnico | Próxima cita. |
| 12 | `agent_get_location` | query | cita/perfil | nada | Ubicación segura. |
| 13 | `agent_get_pending_payments` | query | citas/pagos/proofs | nada | Resumen de pendientes. |
| 14 | `agent_get_appointment_payment_status` | query | pago/proof/cita | nada | Estado explicable. |
| 15 | `agent_get_professional_share_profile` | query | perfil público | nada | Ficha marketplace. |
| 16 | `agent_confirm_appointment` | command | cita/política | cita/eventos | Confirmar una cita. |
| 17 | `agent_create_appointment` | command | servicio/disponibilidad | cita/pago/eventos | Crear una cita. |
| 18 | `agent_cancel_appointment` | command | cita/políticas | cita/pago/eventos | Cancelar una cita. |
| 19 | `agent_reschedule_appointment` | command | cita/disponibilidad | una cita/eventos | Reprogramar ocurrencia. |
| 20 | `agent_switch_appointment_modality` | command | cita/política | una cita/eventos | Cambiar modalidad. |
| 21 | `agent_attach_payment_proof` | command | cita/pago/receipt | proof/eventos | Adjuntar comprobante. |
| 22 | `agent_resume_resource_delivery` | command | invitación/asignaciones | assignments/jobs | Liberar asignados pendientes. |
| 23 | `agent_submit_review` | command | relación/citas/reviews | review | Reseña final única. |

## Helpers privados y worker

| Contrato | Actor | Propósito |
|---|---|---|
| `private.agent_claim_tool_call` | wrappers | Reservar ordinal, command y presupuesto. |
| `private.agent_finalize_tool_call` | wrappers | Sellar resultado/replay. |
| `private.agent_issue_option_handle` | wrappers | Emitir binding opaco. |
| `private.agent_resolve_option_token` | wrappers | Revalidar binding/expiración/consumo. |
| `resource_delivery_worker` | sistema | Procesar jobs de recursos asignados. |

## Inventario negativo

No se definen contratos para URL online, handoff, reactivación, banca, edición/estado de reseña, reemplazo/rechazo de comprobante, solicitud de recursos ni series.

