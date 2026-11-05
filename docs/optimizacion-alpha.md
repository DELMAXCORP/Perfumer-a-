# Optimización de Alpha — entrega local, 4 de noviembre de 2026

Se implementaron cambios sobre los archivos existentes. No se ejecutó SQL, no se consultaron ni modificaron datos de producción, no se cambiaron RLS, permisos, proyecto Supabase, protocolos de impresoras ni la aplicación independiente de barbería. No se publicó en GitHub ni en Sites. La compatibilidad con la cuota Free requiere mediciones reales posteriores.

## Restauración y versión publicada

Git no está disponible en este entorno y la carpeta no presenta un checkout utilizable. Se creó `.local-backups/alpha-before-optimization/` antes de editar, con los originales de los archivos existentes afectados. `.gitignore` excluye ese directorio. No publicarlo ni copiarlo a la carpeta de distribución. Los scripts auxiliares de edición también quedan allí; no son parte de la aplicación.

La estructura verificada distingue:

- `index.html` y `app.js`: tienda actual, con datos del cliente, carrito y WhatsApp oficial existente.
- `catalogo.html`: redirección; no carga `catalogo.js`.
- `panel/index.html` y `panel/app.js`: POS y administración.
- `panel/catalogo.html`: catálogo con audio y actualización periódica.
- `admin.html`: redirección al panel; el antiguo `admin.js` no fue eliminado ni editado.
- `dist/`: versión anterior diferente, con WhatsApp sin configurar. Se optimizaron sus lecturas sin reemplazar su interfaz ni su configuración por las de la raíz. **No asumir que `dist/` contiene el sistema actual ni publicarlo como sustituto de la raíz.**

El código desplegado el 31 de octubre y los bytes de aquel día no están disponibles. Esta entrega no atribuye los 14.96 GB a una función.

## Optimizaciones y archivos

| Archivo | Cambios |
| --- | --- |
| `alpha-data.js` (nuevo) | Caché en memoria por usuario, deduplicación de lecturas, caducidad, generaciones que descartan respuestas anteriores, paginación completa, filtros de fecha de Lima, variantes de imágenes, mensajes de errores y diagnóstico opcional. |
| `panel/app.js` | Cargas por módulo; columnas explícitas; historial y Excel filtrados en servidor; capturas bajo demanda; firmas reutilizadas; invalidación tras escrituras; limpieza de sesión; dos variantes por imagen nueva; reutilización del HTML de inventario sin cambios. |
| `panel/index.html` | Carga del módulo compartido; botón Actualizar datos; respaldo de imágenes sin bucles de error; texto de ayuda de audio actualizado. |
| `panel/catalogo.js` y `catalogo.js` | Caché de cinco minutos, carga deduplicada, actualización manual y por cambios locales, pausa de consultas en segundo plano, audio explícito y reproductor reutilizable, miniaturas y renderizado sin reconstrucción cuando el resultado no cambia. La copia raíz se conserva aunque actualmente no la carga su redirección. |
| `panel/supabaseClient.js` y `supabaseClient.js` | Transporte instrumentado; no cambia claves ni opciones de Auth. |
| `index.html` | Incluye `alpha-data.js` antes del cliente. |
| `app.js` | Consulta deduplicada y paginada del catálogo; errores claros; reutiliza tarjetas al filtrar; usa miniaturas nuevas en listados y carrito; bloquea envíos simultáneos del formulario del cliente. Mantiene WhatsApp, carrito, precios y reglas existentes. |
| `dist/index.html`, `dist/app.js`, `dist/supabaseClient.js`, `dist/alpha-data.js` | Equivalentes de las mejoras comunes de consulta, caché y miniaturas para la versión conservada. |
| `tests/alpha-data.test.cjs`, `tests/catalog-optimization.test.cjs`, `tests/panel-optimization.test.cjs` (nuevos) | Pruebas locales con red prohibida y datos simulados. |
| `tests/store-static.test.cjs` | Corrige expectativas anteriores a esta tarea: filtro retirado, WhatsApp vacío y texto antiguo del resumen. No cambia la tienda para satisfacer esas expectativas obsoletas. |
| `.gitignore`, `docs/optimizacion-alpha.md` | Exclusión del respaldo y esta documentación. |

No se editaron `panel/ticket.js`, los controladores P15, hojas de estilo, archivos SQL ni imágenes o audios históricos.

## Consultas, caché y consistencia

`cargarTodo()` ahora obtiene productos y únicamente recarga historial o cierre si esa vista está activa. El inicio carga productos y las dos consultas de asistencia para conservar el cronómetro y su aviso. Cada pestaña carga sus propios datos al abrirse. Las ventas mantienen las lecturas y actualizaciones condicionadas de stock en Supabase.

Las lecturas privadas tienen una caducidad general de 60 segundos; asistencia, 30 segundos. La caducidad se comprueba al solicitar datos, no introduce sondeo del panel. El botón Actualizar datos invalida la caché y carga la vista actual. La validación de stock de cada venta sigue consultando al servidor, incluso con caché vigente.

El transporte invalida explícitamente las lecturas privadas al confirmar una escritura REST. Esto sucede también en operaciones parciales y reversiones. Nunca cachea ni reintenta escrituras. Los cambios de productos notifican el catálogo de la misma ventana y otras pestañas del mismo origen mediante un marcador sin datos privados en `localStorage`. Otros dispositivos se actualizan por el intervalo del catálogo.

Las solicitudes comparten una promesa cuando tienen la misma clave y generación. Una invalidación o cambio de usuario vuelve inválidas las respuestas pendientes. Hay revisiones adicionales para filtros de fecha y apertura/cierre de capturas. Las entradas caducadas se purgan y la caché limita a 128 entradas resueltas; las solicitudes aún pendientes se conservan para deduplicar.

El historial selecciona datos comerciales y `detalles`, excluyendo `comprobante_url`. Una consulta separada solicita únicamente IDs con comprobante no nulo ni vacío. Así se conserva el botón y el indicador Sí/No del Excel sin transportar Base64. Al pulsar Ver Captura se lee `comprobante_url` de esa venta: si es `data:image/`, se muestra directamente; si es una ruta, se firma. No se borran, sobrescriben ni migran capturas.

La existencia real de Base64 en producción queda sin verificar: se comprobó su representación y compatibilidad en el código y con fixtures locales. La solución funciona para ambas representaciones sin modificación de esquema. Una inspección o migración histórica requiere una tarea separada y autorización; no se ejecutó automáticamente.

Las firmas duran 300 segundos y se reutilizan con un margen de 60 segundos. Su caché y el contenido privado se limpian al cerrar sesión/cambiar usuario; una respuesta pendiente no puede volver a mostrar una captura cerrada o de otra sesión. Un 401 oculta el panel y solicita iniciar sesión; si hay una venta en curso se pospone la limpieza del estado hasta terminar su manejo del error. Un 403 informa falta de permiso sin modificar RLS; un 402 informa restricción de servicio. No se implementan reintentos de escrituras ante ninguno de esos estados.

La paginación es de transporte: recorre todas las páginas del período solicitado antes de calcular reportes o exportar. **No calcula totales sobre una sola página.** Mantiene los cálculos comerciales existentes. Usa orden estable y continúa hasta una página vacía, incluso cuando `max_rows` del servidor sea inferior al tamaño solicitado de 500. Esto añade una consulta final vacía y permite exportaciones completas en vez de depender del límite implícito de Supabase.

Sin rango de fechas, el historial sigue representando todo el historial autorizado; puede transferir bastante información. Cambiar ese significado o introducir reportes agregados de servidor requiere una fase aparte. Las páginas no constituyen una instantánea transaccional frente a escrituras concurrentes de otros dispositivos; véanse riesgos.

## Catálogo y multimedia

El catálogo interno ya no consulta cada 30 segundos. Tiene carga inicial, botón Actualizar catálogo y comprobación cada cinco minutos cuando la pestaña está visible. Volver a ella consulta solo si caducó la caché. Los cambios de productos realizados en otras pestañas del mismo origen invalidan el catálogo inmediatamente. El plazo nominal entre dispositivos es de hasta cinco minutos con pestaña visible, conexión disponible y temporizadores activos; la suspensión del navegador, fallos o cuotas impiden prometer un plazo estricto. En segundo plano no consulta.

No se agregó Realtime ni una tabla/RPC de versiones. El mecanismo sin cambios de esquema reduce diez veces la frecuencia de actualización periódica. Sigue descargando las filas del catálogo en cada actualización: una comprobación ligera de versión fiable entre dispositivos exigiría metadata mantenida en servidor, propuesta para otra fase si se necesita.

Para imágenes nuevas mediante Guardar imagen:

- JPEG, calidad 0.85, máximo 1400 px en el lado mayor para detalle y 360 px para miniatura, sin ampliar imágenes pequeñas.
- Dos archivos UUID: `*.full.jpg` y `*.thumb.jpg`, en la carpeta del usuario y el bucket público de catálogo existente.
- Se publica la URL completa en `imagen_url`; los listados derivan la miniatura **solo para ese patrón nuevo y bucket**. Las URLs históricas, externas, privadas y Base64 permanecen intactas.
- `cacheControl: '31536000'` porque cada cambio usa rutas nuevas y no sobrescribe el contenido. Si falla la asociación, se contempla limpieza de los archivos recién subidos; los archivos históricos no se tocan.
- Los listados conservan carga diferida y añaden dimensiones. El detalle conserva la imagen de mayor resolución. Los catálogos conservan nodos cuando los datos no cambian.

Se eligió JPEG/Canvas/toBlob por compatibilidad amplia sin nuevas dependencias; se probaron dimensiones y liberación de URLs con mocks. La calidad visual, orientación y consumo de memoria en dispositivos reales siguen pendientes de validación con fotos reales en un entorno aislado.

El audio se reproduce únicamente con Escuchar descripción. Un reproductor `preload='none'` detiene el anterior y reutiliza la fuente si coincide. Abrir precios no reproduce audio. No se precargan audios del catálogo y se pausa al ocultar la pestaña. No se recodificaron archivos de audio: una compresión automática fiable y uniforme en navegadores requiere evaluar códecs/calidad; no se instaló un codificador ni se cambió el formato de archivos existentes. Para audios nuevos se recomienda preparar MP3/AAC comprimidos y medir su peso antes de subirlos. El límite existente de 20 MiB se conserva.

El QR de Yape y los sonidos de venta, meta y jornada siguen siendo archivos locales. No se encontró código NPS en Alpha.

## Pruebas y comparación reproducible

Todas las pruebas automatizadas usan VM, dobles de DOM/Bluetooth/Canvas o funciones puras. No equivalen a una prueba de navegador real, impresora física ni transacción real de Supabase.

Resultado final: **43 pruebas aprobadas, 0 fallidas**. También se verificó la sintaxis de los JavaScript de raíz/panel/dist y la existencia de las referencias locales de scripts de las cuatro páginas principales. No se ejecutó la integración opcional de navegador.

Ejecutar desde la raíz:

```powershell
node --test tests/alpha-data.test.cjs tests/catalog-optimization.test.cjs tests/panel-optimization.test.cjs tests/store-static.test.cjs tests/ticket.test.cjs tests/marklife-p15.test.cjs panel/tests/marklife-p15.test.cjs
```

Cobertura ejecutada:

- Login simulado de vendedor, restauración de sesión administrativa, asistencia y cierre de sesión.
- Validación de stock, reserva de sellados, mililitros y envases, rechazo por falta de existencias.
- Venta confirmada y fallo de inserción con devolución de reservas, sin recargar reportes ocultos.
- Anulación con restitución, traslado parcial sin aumentar existencias y cierre por ubicación.
- Historial, filtro de servidor, límite del día de Lima, Excel completo y presencia de comprobante.
- Comprobante Base64 bajo demanda, reutilización/deduplicación de firmas y limpieza al salir.
- Respuestas antiguas frente a cambio de usuario, escrituras y cambios rápidos de fecha.
- Paginación de 1203 filas con un servidor simulado que entrega como máximo 73 por respuesta.
- Caché/caducidad, invalidación de escrituras, diagnóstico sin secretos y 402 sin reintento.
- Catálogo, audio explícito, ausencia de precarga, pausa de consultas ocultas y conservación de nodos.
- Conversión de imágenes y subida simulada de las dos variantes sin alterar precios.
- Actualización de precios sin alterar costo/stock, rechazo del vendedor y doble envío local de venta sin duplicación.
- Carrito, persistencia serializada, filtros y resumen comercial de WhatsApp, además de controles estáticos de la tienda.
- Contenido de tickets, QR fijo y secuencia/protocolo P15 con dobles Bluetooth, incluidos fallos y doble pulsación.

La prueba estática de tienda fallaba antes de editar. Se actualizaron sus expectativas para la versión ya existente; las pruebas originales de tickets/P15 pasaron como referencia y continúan pasando.

La comparación contra el respaldo se ejecuta si este existe y se omite al distribuir las pruebas sin él:

| Operación con los mismos fixtures pequeños | Original | Optimizada |
| --- | ---: | ---: |
| Inicio: productos, asistencia y módulos asociados | 9 lecturas | 4 lecturas |
| Refresco de productos tras escritura, con reportes ocultos | 9 lecturas | 2 lecturas |
| Repetir el refresco sin escritura dentro del TTL | 9 lecturas | 0 lecturas |
| Ciclos de catálogo por hora visible, nominales | 120 | 12 |

Las dos lecturas de productos de los fixtures nuevos incluyen una página de datos y la comprobación final vacía. Para un catálogo pequeño, 12 ciclos pueden representar 24 solicitudes REST por hora con esta paginación; no se confunden ciclos con solicitudes HTTP. Aperturas, retornos y actualizaciones manuales pueden añadir consultas. Los conteos no incluyen Auth, firmas ni medios. No hay medición comparable de bytes de producción y no se declara ahorro en GB.

## Verificación manual pendiente

Antes de publicar, usar un entorno aislado con el mismo esquema y RLS:

1. Chrome/Edge de escritorio y Safari/Chrome móvil: carga inicial, volver desde segundo plano, conexión lenta y sin conexión.
2. Admin y vendedor: login, sesión vencida, 401/403/402, cambio de usuario y salida con modales abiertos.
3. Sellado, decants de varios tamaños, regalos y frasco abierto entero: importes, costos, mililitros y envases.
4. Venta fallida, dos dispositivos concurrentes y pérdida de respuesta después de una escritura; no repetir automáticamente una operación cuyo resultado sea incierto.
5. Anulación y traslado completo/parcial en cada ubicación; verificar movimientos, costos y existencia total.
6. Cierres con notas y existencias; historial vacío, varios rangos, cambios rápidos de fechas y más de 1000 filas; conciliar totales y Excel con los datos del entorno aislado.
7. Capturas históricas Base64 y Storage; abrir/cerrar/reabrir, URL caducada y salida con solicitud pendiente.
8. Fotos JPEG/PNG/WebP verticales y horizontales: orientación, aspecto, calidad, tamaño real, variantes y permisos de subida/eliminación. Verificar fotos históricas intactas.
9. Audio nuevo y antiguo: reproducción explícita, cambiar de perfume, abrir precios sin reproducción, caché y solicitudes Range.
10. Tienda: variantes y precios, filtros, carrito persistente, formulario, texto/número de WhatsApp y responsive.
11. Impresión física de tickets con X6/controlador actual y etiquetas P15 de 40 × 12 mm, conexión, desconexión y reimpresión. No se ejecutó ninguna impresión física.

La prueba de integración en navegador `tests/ticket-integration.cjs` no se ejecutó: requiere `playwright-core`, que no está instalado. No se instaló una dependencia ni un navegador adicional.

**Funciones de QR ausentes:** en esta versión `panel/ticket.js` incluye siempre `assets/qr-catalogo-perfumeria.png`. No hay control para incluir/excluir el QR ni URL configurable por administrador. No se inventaron esos controles ni se modificó la impresión. Incorporarlos necesita una tarea aprobada por separado.

## Riesgos existentes y propuesta independiente

La caché no sustituye la validación económica, pero el frontend por sí solo no puede garantizar atomicidad o idempotencia:

- La venta reserva varios productos y después inserta `ventas`. No es una transacción única. Una pérdida de conexión o respuesta puede dejar incierto el resultado; no se agregó reintento automático.
- Las reversiones son varias escrituras. Una reversión puede fallar por red, permisos o escrituras concurrentes.
- La anulación conserva la lógica existente: algunas actualizaciones calculan el nuevo stock con datos del navegador o con lectura seguida de escritura sin comparación. Anulaciones simultáneas pueden perder incrementos.
- Los traslados parciales usan varias escrituras y compensaciones; no hay atomicidad entre ellas.
- Deshabilitar controles evita algunas dobles pulsaciones locales, pero no garantiza idempotencia entre dispositivos o tras recargar la página.
- Los reportes paginados tienen orden estable y descartan generaciones antiguas del mismo navegador, pero no son una instantánea de base de datos frente a operaciones de otros dispositivos.
- Los campos dentro de `detalles` siguen descargándose porque se utilizan para márgenes, tickets, anulaciones y reportes. No se comprobó si allí u otras columnas existen datos históricos grandes adicionales.

Propuesta separada, **no ejecutada**: diseñar funciones transaccionales de venta, anulación y traslado; bloqueo o comparación segura de existencias por fila; clave idempotente única por operación y respuesta recuperable por esa clave; registro de movimientos en la misma transacción; autorización equivalente a RLS actual. Diseñar además una versión ligera del catálogo y, si el volumen lo exige, reportes agregados o una instantánea coherente. Requiere revisar el esquema real, pruebas de concurrencia y autorización de cambios SQL/migraciones. No cambiar permisos ni hacer públicos los comprobantes.

No se puede garantizar ausencia de inconsistencias concurrentes hasta resolver y verificar esa fase. Tampoco se garantiza que el proyecto compartido con barbería quede bajo la cuota gratuita: depende del tráfico y de ambas aplicaciones.

## Medir antes y después

Diagnóstico apagado por defecto, en memoria y sin persistencia. En la consola de una sesión local:

```js
AlphaData.diagnostics.enabled = true;
AlphaData.diagnostics.start('abrir-historial');
// Realizar la operación en el entorno aislado.
console.table(AlphaData.diagnostics.records);
AlphaData.diagnostics.summary();
AlphaData.diagnostics.enabled = false;
AlphaData.diagnostics.records = [];
```

Registra servicio/tabla, método, duración hasta cabeceras, estado, repetición de la misma ruta/método y `content-length` si está disponible. No almacena filtros, IDs de usuario, rutas de objetos, cuerpos, claves, cabeceras ni tokens. `repeated` señala la misma ruta/método; no demuestra que dos consultas tengan filtros idénticos. La etiqueta de operación se fija manualmente antes de reproducirla. Los bytes ausentes se muestran como `null`; Content-Length no equivale necesariamente al tamaño descomprimido ni al egress facturado.

El transporte de Supabase no ve las descargas directas de `<img>`/`Audio`. Para ellas:

1. Usar Network del navegador, filtrar el dominio Supabase y separar REST, firmas y objetos. Comparar el mismo conjunto de acciones, datos, usuarios, duración y dispositivos antes/después.
2. Medir caché fría una vez y después caché caliente con Disable cache **desmarcado**, distinguiendo transferencia de red y recursos servidos desde memoria/disco. No borrar caché en cada repetición.
3. Registrar solicitudes, estados, Transferred/Resource size, cabeceras Cache-Control y estado CDN cuando esté disponible, y solicitudes parciales de audio. Revisar también Performance/Resource Timing si hay permisos de exposición de métricas.
4. No compartir un HAR sin retirar Authorization, cookies, URLs firmadas, cuerpos, teléfonos y demás datos privados.
5. En Supabase Dashboard, comparar el mismo período y categoría de egress, separar caché/no caché y revisar Storage por objeto y Data API por tabla. Correlacionar las horas del 31 de octubre con America/Lima; no atribuirlas a barbería solo por su horario.
6. Para analizar registros del proyecto compartido, separar rutas/buckets, método, estado, bytes efectivos, agente y procedencia disponibles. El número de firmas no es el número de descargas y el número de descargas no determina sus bytes.

Documentación consultada: [paginación](https://supabase.com/docs/reference/javascript/range), [filtros](https://supabase.com/docs/reference/javascript/using-filters), [egress](https://supabase.com/docs/guides/storage/serving/bandwidth), [caché de Storage](https://supabase.com/docs/guides/storage/cdn/smart-cdn). No se depende de Smart CDN de pago.

## Publicación en GitHub Pages, solo tras autorización

1. Confirmar en Settings → Pages la rama y carpeta que se sirven actualmente. Para conservar tienda y POS actuales, preparar la raíz con `panel/`, `assets/` y los módulos compartidos; no sustituirla por el `dist/` antiguo.
2. Revisar y confirmar el diff, las pruebas, la matriz manual y el respaldo. Excluir `.local-backups/`; no subir secretos, HAR privados ni datos de pruebas reales.
3. Incluir todos los archivos modificados y `alpha-data.js` en la misma versión. Publicar solo tras aprobación, mediante el flujo GitHub existente, sin añadir servicios de pago ni cambiar Supabase.
4. Verificar las rutas relativas bajo el subdirectorio de GitHub Pages: tienda, redirecciones, POS, catálogo interno, scripts compartidos, QR e imágenes. Actualizar la página completa para evitar mezclar scripts antiguos de caché con los nuevos.
5. Medir el uso con tráfico representativo. Si aparecen regresiones, restaurar los originales desde el respaldo o revertir el commit aprobado. Los archivos de datos de Supabase no necesitan reversión porque esta entrega no los modifica.
