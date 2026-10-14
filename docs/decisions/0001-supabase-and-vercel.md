# ADR 0001: Despliegue en Vercel con Supabase y Cron Keepalive

- **Estado**: Aceptado
- **Fecha**: 2026-07-27

## Contexto
El proyecto requiere una solución de base de datos relacional para gestionar ascensos, perfiles y relaciones sociales, además de almacenamiento de imágenes y alojamiento web con coste cero en fase inicial.

## Decisión
Se adopta la combinación **Vercel + Supabase**:
1. **Supabase**: Provee PostgreSQL con Row Level Security (RLS) y autenticación de usuarios por email/contraseña.
2. **Cloudflare R2**: Provee almacenamiento S3-compatible para fotografías (`atlas-photos`) con 10 GB de capa gratuita y tope de seguridad infranqueable a 9,5 GB.
3. **Vercel**: Aloja la aplicación Next.js 15 en infraestructura serverless global.
4. **Keepalive Cron**: Debido a que los proyectos gratuitos de Supabase se pausan tras 7 días de inactividad, se implementa una ruta `/api/keepalive` invocada diariamente mediante Vercel Cron (`0 5 * * *`) asegurada con `CRON_SECRET`.

## Consecuencias
- **Positivas**: Coste operativo cero, alta disponibilidad, escalabilidad sin gestión de servidores.
- **Negativas**: Necesidad de mantener activo el endpoint keepalive para evitar pausas en la base de datos.
