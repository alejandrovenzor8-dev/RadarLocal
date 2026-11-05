# RadarLocal: infraestructura de Fase 1

Esta rama prepara un Worker directo. No se ha creado un servicio PostgreSQL externo, una configuración Hyperdrive, un proveedor de correo ni un despliegue.

## Desarrollo local

1. Instalar Node 22.13+ y dependencias con `npm ci`.
2. Crear una base PostgreSQL **de desarrollo**. Copiar `.dev.vars.example` a `.dev.vars` y completar `DATABASE_URL`, `BETTER_AUTH_SECRET` aleatorio de al menos 32 caracteres y `BETTER_AUTH_URL=http://localhost:5173`. `.dev.vars` está ignorado por Git.
3. Ejecutar `npm run db:migrate` con `DATABASE_URL` apuntando a esa base. Revisar el destino antes de ejecutar: este comando cambia el esquema seleccionado.
4. Ejecutar `npm run dev`. Las rutas de Better Auth están bajo `/api/auth/*`; `GET /api/auth/get-session` devuelve `null` para un visitante anónimo.
5. Para enviar correos reales se necesita un dominio remitente verificado y los secretos `RESEND_API_KEY` y `EMAIL_FROM`. El adaptador actual usa la API HTTP de Resend. Sin esos valores, registro y recuperación responden 503. Las pruebas inyectan un emisor falso y no envían correos.

`npm run import:candidates` muestra los ocho candidatos sin escribir. Para importarlos **solo a una base elegida de forma explícita**, usar `npm run import:candidates -- --apply --confirm-private-import` con `DATABASE_URL` configurada. El proceso es idempotente por slug y crea fichas `PENDIENTE_CONFIGURACION`, ubicaciones sin verificar e imágenes con derechos `PENDIENTE`; no publica nada. Las categorías de esos candidatos también quedan pendientes.

El primer `SUPER_ADMIN` requiere una cuenta creada y con correo verificado. Con la base correcta seleccionada, ejecutar `npm run bootstrap:super-admin -- --email <correo> --confirm-first-super-admin`. El script toma un bloqueo transaccional, se niega si ya existe un `SUPER_ADMIN` y registra auditoría. No hay contraseña ni cuenta predeterminada. Los roles posteriores se asignan únicamente mediante el servicio de autorización, tras autenticar al actor.

## Pruebas

Usar una base descartable llamada `radarlocal_phase1_test`, ejecutar allí las migraciones y fijar `TEST_DATABASE_URL` a su conexión antes de `npm test`. Las pruebas crean registros y nunca deben apuntar a una base con datos reales. `npm run build`, `npx tsc --noEmit --incremental false` y `npm run lint` son verificaciones separadas.

Las migraciones versionadas están en `drizzle/`. `drizzle/rollback/` contiene reversión **solo para una instalación vacía**: rechaza tablas con datos. Para una base con datos, preparar respaldo y una migración correctiva revisada; no ejecutar los scripts de reversión sobre producción.

## Cloudflare Workers directo e Hyperdrive

El build de Vinext genera `dist/server/wrangler.json` y `dist/client`. La configuración fuente está en `vite.config.ts`, con `nodejs_compat` y fecha `2026-05-22`, que admite el `workerd` instalado. `npm run deploy:dry-run` empaqueta sin publicar. No se incluye un comando de despliegue automático en los scripts.

Para una prueba real futura: crear una base PostgreSQL y una configuración Hyperdrive **con caché deshabilitada**; guardar su ID no secreto en `RADAR_HYPERDRIVE_ID` durante el build. El Worker recibirá el vínculo `HYPERDRIVE_FRESH` y usará su `connectionString`; `DATABASE_URL` queda como respaldo local. Configurar `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `RESEND_API_KEY` y `EMAIL_FROM` como secretos o variables de runtime de Cloudflare, nunca en el repositorio ni en variables `NEXT_PUBLIC_*`. Confirmar que el `dist/server/wrangler.json` generado incluye el vínculo antes de cualquier despliegue autorizado.

La prueba local de Fase 1 verificó `pg` y Drizzle contra PostgreSQL por TCP desde `workerd`. **No valida Hyperdrive**, porque aún no existe una base externa ni un vínculo real. La primera prueba con Hyperdrive debe comprobar sesiones, permisos, transacciones, aprobación y lecturas posteriores a escrituras.

## Alcance actual

Los servicios de autorización y moderación viven en `lib/server/`. El registro de Better Auth otorga solo `CUSTOMER`. Las rutas de borrador, envío y revisión están protegidas por sesión y permisos del servidor. Una aprobación exige negocio y categoría verificados, imágenes autorizadas y la misma versión pública de origen; una transacción con bloqueo de fila impide doble aprobación.

La interfaz pública y el panel visual siguen siendo la demo de `components/radar-app.tsx` y no están conectados a estas rutas. Sus cuentas y estadísticas locales **no son identidad ni datos operativos**. No se debe publicar esa experiencia como producto final hasta sustituir los datos ficticios y enlazar las pantallas a los servicios reales.

## Resultado de la validación local

- Dos migraciones aplicadas a PostgreSQL 18 temporal: 34 tablas. `drizzle-kit migrate` también se verificó en una base temporal separada. La reversión se probó únicamente en una base vacía.
- Integración: 2 archivos, 4 pruebas aprobadas para autenticación, permisos, aislamiento, beneficios y aprobaciones concurrentes. La importación privada se repitió y reportó 0 inserciones nuevas y 0 publicaciones.
- `npm run build`, `npx tsc --noEmit --incremental false`, lint de archivos nuevos y `npm run deploy:dry-run`: correctos. El empaquetado de Wrangler no publicó nada y, sin `RADAR_HYPERDRIVE_ID`, no incluyó un vínculo Hyperdrive.
- `npm run lint` global aún falla con 63 errores y 3 advertencias preexistentes en `components/google-business-map.tsx` y `components/radar-app.tsx`. Estos componentes no se modificaron en esta fase.
- La prueba de Hyperdrive real, entrega de correo real y dominio final siguen pendientes de servicios y configuración externos. La instancia PostgreSQL temporal se detuvo al terminar las pruebas.
