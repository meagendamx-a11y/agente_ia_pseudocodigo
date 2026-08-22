# Mensajes aprobados

La fuente ejecutable de copias fijas es `config/static-responses.es-MX.json`.

## Reglas

- Crisis, rate limit, soporte, outcome desconocido y reseña se usan textualmente.
- Crisis está disponible sin profesional y nunca termina con “¿Hay algo más…?”.
- Soporte dirige al propio paciente a `55 64 37 00 81` / `https://wa.me/525564370081`; no crea ticket.
- Sin profesional activo: tono casual; perfil público o soporte solamente.
- Online sin enlace: “El enlace de tu sesión te lo envía directamente tu profesional. Puedes gestionarlo con él.”
- No se comparten banco, cuenta, CLABE ni instrucciones de pago; se indica pedirlas al profesional.
- Cita creada usa texto libre con fecha, hora y modalidad. No existe template `appointment_created`.
- Comprobante: “recibido y pendiente de revisión”, nunca pagado/aprobado.
- Reseña final: “Perfecto, muchas gracias por tu reseña.”, sin promesa de publicación.

## Templates existentes fuera del agente

El sender puede seguir utilizando las 14 familias actuales indicadas por producto: `patient_welcome`; `appointment_confirmation_request`, `appointment_confirmation_prepay`; los tres reminders 1h; dos cancelaciones; dos reprogramaciones; tres solicitudes de comprobante; `patient_resource_delivery`. El agente no modifica ni reemplaza ese catálogo.

## Presupuesto

El envelope configurado permite hasta `16 × 2,048 = 32,768` tokens de salida teóricos por turno, pero 8 calls y los límites de admisión acotan abuso. No se afirma un costo monetario hasta verificar el SKU/precio vivo de `provider_model_id`; input, Kapso y Meta se miden por separado. Revisar costo beta diariamente antes de cambiar modelo, reasoning, iterations o tokens.

