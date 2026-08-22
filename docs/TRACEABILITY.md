# Trazabilidad contractual

Cada fila nombra una frontera server-side; el prompt puede ayudar a conversar, pero nunca es el único control.

## Decisiones

| ID | Owner contract(s) | Fase | Prueba | Efecto outbound | Guardia negativa |
|---|---|---:|---|---|---|
| DEC-01 | gateway + spec | 0 | contract-shape | texto breve | sin sobrearquitectura runtime |
| DEC-02 | inbound + workflow | 0 | inbound-admission | inicia/reanuda workflow | callback no recibe inbound |
| DEC-03 | agent-node config | 0 | agent-config | respuesta Agent Node | sin fallback automático |
| DEC-04 | list-services + eligibility | 1 | query-contract | opciones Flow | sin subsecuente activo |
| DEC-05 | list-services + create | 1/2 | query/mutation | precio en resumen | modelo no fija precio |
| DEC-06 | booking Flow | 2 | booking-flow | Flow dinámico | no chat multi-slot |
| DEC-07 | appointment wrappers | 1/2 | mutation-contract | próxima cita | nunca serie completa |
| DEC-08 | capabilities + todos los wrappers | 0/1 | security/query | perfil o soporte | inactivo falla cerrado |
| DEC-09 | prompt + messages | 0 | agent-config | cierre cálido | no en crisis/reseña |
| DEC-10 | location + prompt | 1 | query-contract | copy proveedor | sin URL tool |
| DEC-11 | payment status | 1 | query-contract | explicación segura | sin banca |
| DEC-12 | proof adapter + attach | 3 | media-contract | recibido pendiente | nunca acredita |
| DEC-13 | allowlist | 3 | media-contract | policy text | sin editar proof |
| DEC-14 | submit-review | 3 | review-contract | thank-you | sin draft/edición/status |
| DEC-15 | static responses | 3 | review-contract | copy exacta | sin cierre adicional |
| DEC-16 | inbound public mode | 0 | inbound/agent-config | crisis literal | no requiere tenant |
| DEC-17 | static responses | 0 | agent-config | número soporte | sin handoff |
| DEC-18 | share-profile | 1 | query-contract | ficha pública | sin moderación interna |
| DEC-19 | create + messages | 2 | mutation-contract | texto libre creado | sin template nuevo |
| DEC-20 | resource resume/worker | 3 | resource-contract | recursos asignados | sin solicitar/seleccionar |
| DEC-21 | negative inventory | 0 | legacy/validator | ninguno | sin reactivación |
| DEC-22 | architecture/handoff | 4 | regression plan | rail existente | no tocar sender/callback |
| DEC-23 | claim/finalize + saga | 0/2 | security/mutation | resultado sellado | 8 calls; 1 o 2 mutaciones |
| DEC-24 | control state + maintenance | 0/4 | security | ninguno | expiración no autoriza |
| DEC-25 | register inbound | 0 | inbound-admission | limit notice | replay no cuenta |
| DEC-26 | Kapso inventory + kill switch | 0/4 | agent-config/E2E | tools bloqueadas | no IDs inventados |

## Escenarios

| ID | Owner contract(s) | Fase | Prueba | Efecto outbound | Guardia negativa |
|---|---|---:|---|---|---|
| SCN-01 | inbound | 0 | HMAC válido | ACK/workflow | firma antes de parsear |
| SCN-02 | inbound | 0 | firma inválida | 401 seguro | sin ledger/modelo |
| SCN-03 | register-inbound | 0 | replay exacto | resultado sellado | no cuenta límite |
| SCN-04 | register-inbound | 0 | key/hash distinto | rechazo | no sobrescribe identidad |
| SCN-05 | register-inbound | 0 | una relación | inicia turno | tenant sellado |
| SCN-06 | select-relationship | 0 | varias relaciones | opciones opacas | sin IDs |
| SCN-07 | inbound public mode | 0 | cero relaciones | soporte/crisis | cero tools dominio |
| SCN-08 | inbound limits | 0 | teléfono limitado | aviso con crisis | sin LLM |
| SCN-09 | crisis copy | 0 | peligro inmediato | 911/Línea Vida | sin consejo clínico |
| SCN-10 | support copy | 0 | hablar con profesional | wa.me soporte | sin ticket/handoff |
| SCN-11 | capabilities | 1 | paciente inactivo | perfil/soporte | cross-RPC deny |
| SCN-12 | list-services | 1 | servicios activos | lista/precios | sin IDs internos |
| SCN-13 | eligibility | 1 | subsecuente activo | no elegible | no crea serie |
| SCN-14 | availability | 1 | slots disponibles | tokens 15m | display no reserva |
| SCN-15 | availability | 1 | sin slots | explicación | no inventa horario |
| SCN-16 | upcoming appointments | 1 | varias citas | lista opaca | no elige primera |
| SCN-17 | next appointment | 1 | próxima futura | cita redactada | excluye pasado |
| SCN-18 | location | 1 | presencial | dirección pública | no datos privados |
| SCN-19 | location | 1 | online sin enlace | copy proveedor | no URL |
| SCN-20 | pending payments | 1 | varios estados | grupos seguros | sin CLABE |
| SCN-21 | payment status | 1 | proof solicitado | puede subir | no marca pagado |
| SCN-22 | payment status | 1 | ya pagado/proof | explicación | bloquea upload |
| SCN-23 | share-profile | 1 | profesional aprobado | ficha marketplace | sin draft/rejected |
| SCN-24 | confirm appointment | 1 | cita futura | confirmada | lock/replay |
| SCN-25 | booking Flow | 2 | crear cita | texto libre final | éxito tras commit |
| SCN-26 | booking Flow | 2 | slot perdido | slots frescos | sin falso éxito |
| SCN-27 | cancel appointment | 2 | cancelar confirmada | cancelada | confirmación explícita |
| SCN-28 | cancel→create saga | 2 | reemplazo exitoso | nueva cita | exactamente 2 mutaciones |
| SCN-29 | saga rejection | 2 | cancel rechazo prewrite | seguro | restaura límite 1 |
| SCN-30 | reschedule | 2 | reprogramar ocurrencia | nueva fecha | no serie |
| SCN-31 | switch modality | 2 | dirección permitida | modalidad nueva | política/lead time |
| SCN-32 | unknown outcome | 2 | timeout tras claim | copy no confirmado | no reintento nuevo |
| SCN-33 | proof adapter | 3 | imagen válida | recibida pendiente | private bucket |
| SCN-34 | proof adapter | 3 | MIME/tamaño inválido | error seguro | no guarda/acredita |
| SCN-35 | resource resume | 3 | reply a invitación | jobs asignados | correlación exacta |
| SCN-36 | resource worker | 3 | falla parcial/replay | resumen sellado | no duplica envío |
| SCN-37 | submit-review | 3 | reseña confirmada | gracias exacto | única inserción |
