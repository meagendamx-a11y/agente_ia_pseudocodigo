# Instrucciones para agentes

Este repositorio contiene contratos y pseudocódigo, no una implementación desplegable.

- No agregues migraciones `.sql`, secretos, datos de pacientes ni exportaciones vivas.
- Cambios de contrato deben incluir una prueba que falle antes del cambio y pase después.
- Conserva las fronteras de confianza: el modelo nunca recibe IDs internos, rutas de Storage ni secretos.
- No declares validado en Kapso o Supabase algo que no se haya comprobado E2E.
- Prefiere cambios pequeños, documentación en español y Node.js estándar sin dependencias npm.
