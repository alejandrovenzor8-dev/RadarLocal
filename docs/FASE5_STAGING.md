# RadarLocal — Fase 5: preparación de staging

## Estado comprobado

El repositorio contiene seis migraciones (`0000`–`0005`), 34 tablas, Drizzle con `pg`, Better Auth, roles y pertenencias comprobadas en servidor, revisiones con bloqueo transaccional, directorio de publicaciones aprobadas y carga privada mediante un vínculo R2. El adaptador de correo usa la API HTTP de Resend para verificación y recuperación. La bandeja `notification_outbox` guarda decisiones para el propietario dentro de la aplicación.

**No hay una conexión real verificada** a Hyperdrive, R2 o Resend en este entorno. El build normal no contiene esos vínculos. No se han ejecutado migraciones en staging ni se ha desplegado un Worker. Las pruebas de integración locales usan PostgreSQL descartable, un emisor de correo falso y R2 en memoria.

## Recursos separados que debe proporcionar el equipo

1. Cuenta Cloudflare con permisos para Workers, Hyperdrive, R2, observabilidad y un hostname exclusivo de staging. Nombre de Worker reservado: `radarlocal-staging`.
2. Instancia PostgreSQL **de staging**, con acceso desde Hyperdrive, usuario de aplicación con permisos mínimos y usuario separado para migraciones. Respaldo habilitado y retención acordada.
3. Configuración Hyperdrive de staging vinculada solo a esa base y creada con **query caching deshabilitado**. Su ID será `RADAR_STAGING_HYPERDRIVE_ID` durante el build. La aplicación usa `HYPERDRIVE_FRESH` para todas las consultas. No configurar `DATABASE_URL` en el Worker de staging.
4. Bucket R2 privado de staging, sin dominio público ni `r2.dev`, cuyo nombre será `RADAR_STAGING_R2_BUCKET_NAME` durante el build.
5. Cuenta de Resend o proveedor equivalente, dominio remitente verificado, clave de API restringida a staging y buzones de prueba controlados. Para cambiar de proveedor se debe adaptar `lib/server/email.ts`.
6. Secretos distintos de producción: `BETTER_AUTH_SECRET` (aleatorio, al menos 32 caracteres), `BETTER_AUTH_URL` (URL exacta de staging), `RESEND_API_KEY`, `EMAIL_FROM`. Administrarlos con el gestor de secretos de Cloudflare. Los IDs de los vínculos se usan solo en el build; no poner secretos en el repositorio, variables `NEXT_PUBLIC_*` ni comandos visibles en historiales.

El build requiere `RADAR_DEPLOY_ENV=staging` y los dos IDs de staging. Genera un Worker con nombre `radarlocal-staging` y variable no secreta `RADAR_ENVIRONMENT=staging`. `npm run verify:staging-build` comprueba los vínculos y rechaza recursos iguales a los IDs genéricos si están definidos. La aplicación falla cerrada si staging no recibe Hyperdrive. `robots.txt` y los metadatos indican no indexar staging; mantener también el hostname fuera de anuncios y enlaces públicos. La no indexación no es una medida de control de acceso.

## Secuencia para una ejecución autorizada

1. Registrar IDs, nombres, URL y responsable de cada recurso en un inventario privado. Confirmar que ningún identificador, base, bucket, clave de correo o secreto se comparte con producción.
2. Crear la base y verificar desde un cliente administrativo `current_database()`, `current_user` y la instancia de destino. Tomar un respaldo inicial. Solo entonces aplicar `npm run db:migrate` con `DATABASE_URL` apuntando explícitamente a **staging**. Drizzle usa conexión directa para migraciones; el Worker usa Hyperdrive. No usar las reversiones `drizzle/rollback` sobre datos existentes.
3. Crear Hyperdrive con caché deshabilitada; verificar conexión y permisos de lectura/escritura usando una cuenta de prueba. Verificar transacción, bloqueo de fila y lectura inmediata tras aprobación. Un build local o un `dry-run` no prueba conectividad real.
4. Crear R2 privado y el remitente verificado. Preparar secretos de runtime de staging. Configurar `BETTER_AUTH_URL` con el mismo origen del Worker; verificar cookies seguras, redirecciones y cabeceras Origin.
5. En el equipo de build, establecer `RADAR_DEPLOY_ENV`, `RADAR_STAGING_HYPERDRIVE_ID` y `RADAR_STAGING_R2_BUCKET_NAME`. Ejecutar `npm run build`, `npm run verify:staging-build` y `npm run deploy:dry-run`. Revisar el JSON generado. **El despliegue real requiere autorización expresa aparte.**
6. Tras autorizar despliegue a staging, ejecutar el recorrido integral con usuarios, negocio, plan y contenido **identificados claramente como pruebas** y no accesibles al directorio público externo. No usar candidatos reales aún sin verificar. Registrar IDs de solicitud y revisión, estados, códigos HTTP y marcas de tiempo; no capturar tokens, contraseñas ni claves.

## Matriz de validación integral pendiente

| Componente | Prueba real necesaria | Criterio |
| --- | --- | --- |
| PostgreSQL/Hyperdrive | Consulta, escritura, transacción, dos aprobaciones simultáneas, lectura tras escritura | Sin lectura obsoleta ni doble publicación; errores recuperables ante caída |
| Autenticación/correo | Registro, enlace de verificación, caducidad, sesión, recuperación, cuenta inexistente, fallo del proveedor | Sin acceso antes de verificar; sin enumerar cuentas; 503/error claro si no se entrega |
| R2 | Archivo válido e inválido, cuota de plan, negocio ajeno, rechazo, aprobación y lectura de ficha | Objeto pendiente inaccesible al público; solo imagen autorizada en publicación |
| Moderación | Editar, enviar, rechazar, corregir, aprobar, nueva edición | Versión pública previa intacta hasta cada aprobación |
| Operación | Fallo de red, credenciales revocadas, logs, alertas, backup y restauración de ensayo | Sin secretos en logs; alertas recibidas; restauración demostrada en instancia aislada |

Las referencias R2 descartadas conservan actualmente el objeto privado. No ejecutar una eliminación automática hasta contar con inventario de referencias y prueba de restauración. Las decisiones se muestran en la bandeja interna; el envío de notificaciones de moderación por correo y sus reintentos aún requieren implementación y prueba. La comprobación de firma de imagen solo valida bytes iniciales; antes de producción se necesita decodificación/saneamiento de imágenes.

## Observabilidad, respaldo y costos

Los errores controlados registran operación, código e ID de incidente, sin mensajes de excepción ni secretos. Configurar Workers Logs y alertas de excepciones, respuestas 5xx y errores de Hyperdrive/Resend; verificar una alerta de prueba. El proveedor de PostgreSQL debe ofrecer respaldos automáticos y restauración puntual según la retención contratada. Probar restauración en **otra** base aislada antes de confiar en el procedimiento. Versionar también el inventario de migraciones aplicadas, sin secretos.

Costos variables: Worker por solicitudes/CPU, PostgreSQL administrado por instancia y respaldos, R2 por almacenamiento/operaciones y correo por volumen. Hyperdrive está incluido en Workers Free/Paid, con límite de consultas en Free. R2 y Resend tienen cuotas gratuitas sujetas a límites; confirmar condiciones actuales y presupuesto en las cuentas antes de aprovisionar. Ningún servicio se ha contratado aquí.

## CI y límites de la preparación local

`.github/workflows/ci.yml` instala dependencias, crea PostgreSQL temporal del job, aplica las seis migraciones, ejecuta las pruebas, TypeScript, lint y un build de staging con **IDs de relleno exclusivos de CI**. No despliega ni envía correos. En GitHub debe revisarse que el workflow efectivamente corra en un commit; su presencia en el repositorio no constituye un resultado de CI.

En esta preparación local se ejecutaron `npm run db:migrate` sobre una instancia PostgreSQL 18 temporal y `npm test`: seis migraciones aplicadas y 14/14 pruebas aprobadas. `npx tsc --noEmit --incremental false`, `npm run lint` y dos builds locales aprobaron; el build de staging con IDs de relleno pasó `npm run verify:staging-build` y registró `/robots.txt`. No se ha ejecutado el workflow en GitHub ni una prueba de red hacia servicios reales.

Para repetir localmente se requiere Node 22.13+ y una base descartable llamada `radarlocal_phase1_test`. Establecer `DATABASE_URL` y `TEST_DATABASE_URL` a esa misma base temporal, aplicar `npm run db:migrate` y ejecutar `npm test`, `npx tsc --noEmit --incremental false`, `npm run lint` y `npm run build`. No apuntar las pruebas a staging ni producción: las pruebas escriben datos.

## Puerta de salida de Fase 5

No iniciar Fase 6 operativa hasta documentar evidencia de conexión real a los cuatro servicios, flujo completo y fallos, respaldo/restauración, alertas y costos aceptados. Resolver primero limpieza de objetos R2, entrega de notificaciones externas y saneamiento de imágenes.
