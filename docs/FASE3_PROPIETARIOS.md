# RadarLocal — Fase 3: propietarios

## Pantallas y acceso

- `/panel-negocio`: negocios vinculados, verificación y publicación, plan y beneficios efectivos, solicitudes y notificaciones. Muestra un estado vacío cuando la cuenta aún no tiene negocios.
- `/panel-negocio/[id]/editar`: editor de seis pasos (información, contacto, ubicación y horarios, servicios, fotografías, vista previa). Guarda el borrador automáticamente y permite guardarlo manualmente. Advierte antes de salir con cambios pendientes y pide confirmación antes de enviar a revisión.
- `/panel-negocio/[id]/contenido`: borradores de promociones y eventos cuando la suscripción vigente incluye el beneficio. Enviar coloca el contenido en revisión; no lo publica.

Las páginas consultan la sesión Better Auth en el servidor. El rol `BUSINESS_OWNER` y la pertenencia `ACTIVO` al negocio se vuelven a comprobar en cada API. Una cuenta sin negocio ve el estado vacío. La cuenta simulada de la demo pública no da acceso. El panel conserva la identidad visual de RadarLocal.

## Servicios y publicación

- `GET /api/owner` y `GET /api/owner/businesses/[id]`: dashboard y ficha privada.
- `PATCH /api/businesses/[id]/draft`: autoguardado parcial; `GET` y `PUT` existentes siguen disponibles.
- `POST /api/businesses/[id]/submit`: crea una revisión y solicitud versionadas. El servicio existente bloquea cambios concurrentes; solo la aprobación por `ADMIN` o `SUPER_ADMIN` actualiza la versión pública.
- `POST /api/owner/businesses/[id]/content`: guarda o envía a revisión una promoción o evento. El beneficio efectivo se comprueba en PostgreSQL.
- `POST /api/businesses/[id]/media`: carga una imagen privada; `DELETE /api/businesses/[id]/media/[assetId]`: descarta una imagen pendiente del propio usuario; `GET /api/media/[id]`: entrega imágenes privadas solo a propietario o moderador autorizado, o públicas solo cuando figuran en la versión publicada y tienen derechos autorizados.

El propietario puede solicitar correcciones esenciales de nombre, descripción, categoría, contacto, ubicación y horarios aun si su plan no incluye edición ampliada. Servicios, amenidades, imágenes, promociones y eventos dependen de beneficios configurados por SUPER_ADMIN. Los precios y la contratación no se muestran como operativos.

## Cloudflare R2

El adaptador usa el vínculo Worker `BUCKET`. Para un entorno autorizado, crear un bucket **privado** y definir `RADAR_R2_BUCKET_NAME` durante el build; comprobar el vínculo `r2_buckets` en el Wrangler generado. No configurar dominio público, `r2.dev` ni política pública para este bucket. Los objetos nuevos reciben una clave única `private/businesses/<id>/<uuid>.<ext>`; el cliente solo conoce el ID de PostgreSQL. Se validan sesión, pertenencia, beneficio, cuota, tipo JPG/PNG/WebP, firma inicial y tamaño máximo de 5 MB. Se registran con derechos `PENDIENTE`; el administrador debe autorizar los derechos antes de aprobar la revisión que los incorpora.

Sin `BUCKET` el editor informa que la carga no está configurada y la API devuelve 503. Las pruebas usan un adaptador R2 local en memoria; **no se ha validado una conexión real a R2**. La validación por firma inicial no equivale a decodificar ni sanear el archivo completo. Antes de operar a escala conviene añadir procesamiento de imágenes, limpieza de objetos privados descartados, cuotas de almacenamiento y observabilidad.

## Instalación local

1. Usar una base PostgreSQL de desarrollo; configurar `DATABASE_URL`, `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL` en `.dev.vars` según `.dev.vars.example`.
2. Ejecutar `npm run db:migrate`. La migración nueva `0005_cuddly_lionheart.sql` añade metadatos de carga a `media_assets`, índice único de clave y restricción de tamaño. Su reversión está en `drizzle/rollback/0005_down.sql` y se niega si hay metadatos de imágenes cargadas.
3. Crear o usar una cuenta Better Auth verificada. Un SUPER_ADMIN debe conceder `BUSINESS_OWNER`, vincularla al negocio con pertenencia activa y configurar un plan y sus beneficios. No hay credenciales predeterminadas.
4. Ejecutar `npm run dev` y abrir `/panel-negocio`. Las decisiones se revisan en `/super-admin`; las notificaciones de revisión aparecen en el panel. El envío de correo requiere `RESEND_API_KEY` y `EMAIL_FROM` configurados.

## Pruebas de esta fase

- PostgreSQL local temporal: 10 pruebas de integración aprobadas en cuatro archivos. Cubren cuenta sin negocio, aislamiento, autoguardado, recuperación de borrador, rechazo y aprobación, versión pública intacta durante revisión, límites y privacidad de imágenes con R2 simulado, y beneficios de contenido.
- `npm run build`, `npx tsc --noEmit`, ESLint de los archivos nuevos y `git diff --check`: correctos. El lint global mantiene problemas preexistentes de la demo.
- Migraciones `0000` a `0005` aplicadas con Drizzle en una base temporal nueva; reversión de `0005` comprobada en esa base sin datos.
- Navegador local con PostgreSQL temporal: inicio de sesión de cuenta de prueba, carga del dashboard y editor; escritorio de 1280 px y móvil de 390 px sin desbordamiento horizontal.

## Pendientes y riesgos

R2, Hyperdrive y correo real necesitan servicios y secretos configurados antes de validación operativa. Las notificaciones de revisiones quedan en la bandeja de PostgreSQL; el envío externo depende del proveedor de correo. La interfaz pública sigue siendo la demo separada y aún no consume fichas aprobadas. Los objetos R2 descartados conservan su archivo privado hasta una futura tarea de limpieza. La lista del panel tiene un límite de 100 negocios; agregar paginación antes de crecimiento amplio. No se desplegó ni se contrató ningún servicio.
