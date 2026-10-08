# Google Form - AquaChile

Este directorio contiene el Google Apps Script para crear el formulario de Solicitud de Evaluación Psicolaboral.

## Estado

El script está preparado como integración futura. El backend todavía debe publicar el endpoint `POST /api/solicitudes/desde-form` antes de activar el envío automático hacia Neon.

## Flujo previsto

Google Form → Google Apps Script → Backend AquaChile → PostgreSQL/Neon

## Seguridad

No se debe guardar `DATABASE_URL`, contraseñas de Neon ni otras credenciales de base de datos en este archivo. El script usará `WEBHOOK_TOKEN` para autenticarse contra el backend.
