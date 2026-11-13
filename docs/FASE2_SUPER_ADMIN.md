# RadarLocal — Fase 2: SUPER_ADMIN

## Acceso local

1. Preparar PostgreSQL de desarrollo y aplicar `npm run db:migrate` con `DATABASE_URL` apuntando a esa base. Las migraciones nuevas son `0002`, `0003` y `0004`.
2. Configurar `.dev.vars` siguiendo `.dev.vars.example`: `DATABASE_URL`, `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL`. El correo real exige `RESEND_API_KEY` y `EMAIL_FROM`.
3. Crear una cuenta con correo verificado y establecer el primer SUPER_ADMIN con `npm run bootstrap:super-admin -- --email <correo> --confirm-first-super-admin`. No hay cuenta ni contraseña predeterminada.
4. Ejecutar `npm run dev` y abrir `/super-admin`. El panel verifica la sesión y el rol en el servidor. La API `/api/admin` repite la autorización en cada lectura o escritura.

## Funciones

- Dashboard con conteos reales y actividad reciente; usuarios con asignación o revocación de ADMIN y BUSINESS_OWNER. El panel no permite otorgar SUPER_ADMIN.
- Negocios privados: creación, procedencia, verificación, suspensión, archivo, relación con propietarios, revisión de derechos de fotografías, borradores y envío a revisión. Activar una ficha requiere una versión aprobada y verificación.
- Moderación: comparación de la propuesta con la versión pública, aprobación, rechazo y solicitud de correcciones. Se reutilizan los servicios transaccionales de Fase 1; las decisiones se auditan.
- Categorías con subcategorías, amenidades, estados y ciudades.
- Planes Gratuito, Básico y Plus sin precios inventados. Un plan se publica solo con precio, moneda y los siete beneficios configurados. Máximo de fotos y edición ampliada se comprueban en el backend; las correcciones esenciales permanecen disponibles.
- Suscripciones con una sola ACTIVA por negocio; promociones y eventos publicados exigen una ficha aprobada y el beneficio correspondiente. Publicidad, tarifas, configuración institucional, contactos y versiones legales se administran desde el panel.
- Los datos todavía sin registrar aparecen como `PENDIENTE_CONFIGURACION` en las secciones institucionales, de contacto, planes y documentos legales.

## Seguridad y límites

Todas las operaciones administrativas usan sesión propia de RadarLocal y `SUPER_ADMIN` consultado en PostgreSQL. Los cambios sensibles se validan en el servidor, se ejecutan con transacción y se registran en `audit_log`. Las rutas de borrador y aprobación conservan su aislamiento entre negocios. No se editan secretos desde el panel.

La interfaz pública continúa como demo y no consume aún estos registros. Los textos legales, precios y datos comerciales pendientes no se muestran allí como datos operativos. La subida de archivos, estadísticas reales, posicionamiento destacado, facturación y notificaciones enviadas requieren fases posteriores y, según el caso, almacenamiento, correo o servicios externos. Los campos de logo e imágenes institucionales aceptan URL; antes de publicar se deben verificar derechos y disponibilidad. Las listas administrativas muestran como máximo 100–500 registros por sección; se necesitará paginación para mayor escala.

## Pruebas de esta fase

- Migraciones PostgreSQL 18 temporal: `0002` subcategorías, `0003` índice único de suscripción activa y `0004` suspensión. La reversión de las tres se probó en una base temporal vacía. Los scripts están en `drizzle/rollback/` y deben usarse solo tras revisar los datos.
- `npm test`: 3 archivos, 6 pruebas aprobadas (autenticación, permisos, persistencia, configuración, planes, aislamiento, aprobación, rechazo, concurrencia y auditoría).
- `npm run build`, `npx tsc --noEmit --incremental false` y lint de archivos nuevos: correctos. El lint global conserva los errores previos de los componentes de la demo.
- Navegador local: inicio de sesión SUPER_ADMIN, carga real del dashboard, escritura y lectura de una configuración pendiente, rechazo 401 sin sesión; viewport móvil de 390 × 844 sin desbordamiento horizontal y con menú accesible.

No se desplegó a producción ni se validó Hyperdrive real. La prueba visual usó exclusivamente una base PostgreSQL temporal local; sus datos de prueba no deben importarse a producción.
