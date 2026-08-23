# Disposición de las 13 funciones legacy

No se copia su SQL. Los SHA-256 y commits están en `references.lock.json`.

| Archivo legacy | Disposición | Sucesor/motivo |
|---|---|---|
| `agent_attach_payment_proof.sql` | rewrite | Receipt opaco, Storage privado y elegibilidad revalidada. |
| `agent_cancel_appointment.sql` | replace | Separa cancelación normal de saga cancelar→crear y elimina modo enviado por cliente. |
| `agent_confirm_appointment.sql` | rewrite | Token de cita, lock e idempotencia service-only. |
| `agent_create_appointment.sql` | replace | Flow dinámico, hora local estricta y precio autoritativo. |
| `agent_get_availability.sql` | rewrite | Servicio opaco, políticas y revalidación sin IDs visibles. |
| `agent_get_location.sql` | rewrite | DTO redactado sin URL ni estados internos. |
| `agent_get_next_appointment.sql` | rewrite | Solo futura, selección no ambigua y token corto. |
| `agent_get_online_link_status.sql` | omit | No existe función de URL en el agente. |
| `agent_get_pending_payments.sql` | rewrite | Ejes separados y `can_upload_proof` autoritativo. |
| `agent_get_professional_share_profile.sql` | rewrite | Solo perfil público aprobado. |
| `agent_request_human_handoff.sql` | omit | Se entrega el número de soporte; no hay handoff backend. |
| `agent_reschedule_appointment.sql` | rewrite | Una ocurrencia, locks, hora IANA e idempotencia. |
| `agent_switch_appointment_modality.sql` | replace | Dirección/política autorizada sin IDs ni banderas del modelo. |

Conteo contractual: **rewrite 8 / replace 3 / omit 2**.

## Entradas legacy retiradas

El esquema visible al modelo no admite IDs de paciente/profesional/cita/servicio, rutas de Storage, `command_id`, `session_id`, precio, fee, método de pago, `p_reschedule_mode`, `skip_to_next` ni nombres de funciones. El gateway deriva el contexto y los identificadores técnicos.
