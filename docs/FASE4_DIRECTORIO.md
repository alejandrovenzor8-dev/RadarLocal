# RadarLocal — Fase 4: directorio y acceso público

## Qué se conecta a PostgreSQL

`app/page.tsx` y `app/[...path]/page.tsx` cargan datos del servidor mediante `lib/server/public-page.ts` y `lib/server/public-directory.ts`. La interfaz conserva la paleta, las clases de tarjetas, la cabecera, la navegación y las reglas responsive de RadarLocal.

El directorio lista de 12 en 12 y exige `PUBLICADO`, `VERIFICADO`, ausencia de suspensión, una revisión vigente y categoría y ciudad válidas. Nombre, descripción, contacto, servicios, amenidades y horarios vienen de la revisión aprobada. La foto necesita derechos `AUTORIZADO`, pertenecer a la revisión publicada y una clave R2; sin R2 configurado se presenta la tarjeta sin imagen. Las coordenadas solo se muestran si coinciden con una fila `business_locations` verificada. Las rutas públicas son dinámicas; no se usa caché compartida para fichas o resultados.

La búsqueda admite nombre, descripción, categoría y subcategoría, estado, ciudad, servicio y amenidad. “Cerca de mí” pide permiso de ubicación y aplica un radio de 25 km únicamente a coordenadas verificadas. La navegación del directorio usa parámetros de URL y paginación. Promociones y eventos requieren estado publicado, aprobador, vigencia y negocio público. Un evento sin inicio válido o ya terminado queda fuera.

## Acceso real

`/login`, `/registro`, `/recuperar`, `/restablecer` y `/verificar-correo` llaman a la API Better Auth ya existente. `GET /api/account` devuelve la sesión y los roles consultados en PostgreSQL, con `Cache-Control: private, no-store`. Tras iniciar sesión se redirige a `/super-admin`, `/panel-negocio` o `/mi-cuenta` según los roles del servidor. El registro público de Better Auth solo concede `CUSTOMER`; la interfaz no ofrece selección de rol.

La ruta de autenticación existente responde 503 antes del alta o recuperación si faltan `RESEND_API_KEY` y `EMAIL_FROM`, y el formulario muestra el error. No se simula un correo enviado. Las páginas de cuenta y acceso llevan `noindex`. Una ficha no publicada muestra “Perfil no disponible”, no incluye sus datos y lleva `noindex, nofollow`.

## Datos de demostración retirados de la experiencia pública

La interfaz ya no importa `lib/radar-data.ts`. Quedaron fuera los ocho candidatos sin aprobar, negocios inventados, votos, rankings, anuncios, métricas, testimonios, promociones y eventos de muestra, planes y tarifas conceptuales, así como el acceso basado en `localStorage`. El componente anterior se conserva para consulta en `docs/radar-app.demo.tsx.txt`; los datos históricos no se han borrado. Los favoritos siguen siendo una preferencia **local de este dispositivo** y no proporcionan identidad ni permisos.

El mapa ya no usa una clave de demostración, `DEMO_MAP_ID` ni búsqueda de lugares por nombre. `NEXT_PUBLIC_RADAR_MAPS_KEY` es opcional y debe ser una clave propia de navegador restringida por dominio. Sin ella, el visitante ve las direcciones y enlaces a las coordenadas verificadas. La clave anterior de `.env.local` se retiró sin copiarla a otro archivo.

## Pruebas y ejecución local

1. Preparar PostgreSQL local de desarrollo y aplicar `npm run db:migrate`.
2. Copiar `.dev.vars.example` a `.dev.vars` y configurar `DATABASE_URL`, `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL`. El registro y la recuperación exigen correo real mediante `RESEND_API_KEY` y `EMAIL_FROM`.
3. Ejecutar `npm run dev`. Sin negocios aprobados, inicio y directorio muestran estados vacíos. Para probar fichas, un SUPER_ADMIN debe verificar y aprobar primero un negocio y sus imágenes.
4. Opcionalmente configurar R2 y la clave restringida de Google Maps para ver fotografías y mapa interactivo. No usar la clave anterior de demostración.

En PostgreSQL temporal local: `npm test` aprobó 14 pruebas en 5 archivos. Las cuatro pruebas nuevas cubren exclusión de fichas pendientes, no verificadas y suspendidas; búsqueda, filtros y radio; exclusión de imágenes pendientes y contenido comercial no vigente; y redirección por rol. `npm run build`, `npx tsc --noEmit --incremental false` y `npm run lint` aprobaron. El lint global pasó de 63 errores y 3 advertencias a cero. En navegador local se comprobó escritorio 1280 px, tablet 768 px y móvil 390 px, menú y filtros móviles, ausencia de desbordamiento horizontal, título de ficha publicada, `noindex` y ausencia de datos de ficha privada, redirección de propietario y error explícito de registro sin correo.

## Riesgos antes de producción

- Configurar y probar PostgreSQL mediante Hyperdrive real, R2 privado, correo y una clave propia de Maps. Ninguno se validó en producción.
- Publicar aviso de privacidad y términos reales desde SUPER_ADMIN antes de abrir el registro al público. Son datos pendientes, no textos de demostración.
- Validar derechos de imágenes, datos de contacto, ubicaciones y procedencia de cada candidato antes de aprobarlo.
- Para catálogos grandes, añadir índices de búsqueda sobre los campos JSONB y revisar paginación profunda y carga del mapa. La página de mapa muestra la página actual del directorio, hasta 12 fichas.
- Los favoritos locales no se sincronizan entre dispositivos. No hay pagos, reseñas, estadísticas ni anuncios operativos en la vista pública.

No hubo despliegue ni contratación de servicios.
