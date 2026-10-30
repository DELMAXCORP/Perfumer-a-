# Tickets con QR fijo y CatPrinter

## Reconectar después de apagar la impresora

El botón **Conectar impresora**, junto a Cerrar sesión, abre ayuda con accesos a Bluetooth y a las impresoras de Windows. Enciende la X6, revisa YHK-A383 en Windows y restablece el enlace desde CatPrinter si hace falta. El navegador puede pedir confirmar la apertura de Configuración; si no abre, usa Windows + I → Bluetooth y dispositivos.

En ese mismo panel está **Corregir hojas invertidas de CatPrinter (48 × 80 mm)**, activado por defecto. Se guarda solo en este navegador. Al activarlo, el módulo distribuye los bloques en hojas de 46 × 77 mm para dejar espacio a los márgenes y envía las hojas completas en orden inverso. Así compensa el comportamiento reportado de CatPrinter; cada hoja conserva el orden de sus productos. La vista previa del navegador mostrará la última hoja primero: es intencional en este modo.

El diseño compacto usa QR de 30 mm con margen blanco, letra de 9 puntos, total de 11 puntos y espacios de 1 mm para reducir el número de hojas. No se reduce el voucher completo para encajarlo a la fuerza. Cada hoja del controlador conserva sus 80 mm: el ahorro se produce cuando el contenido cabe en menos hojas. Si un bloque individual resulta demasiado alto, se muestra un error en lugar de cortar información; desactiva la corrección para usar la paginación del navegador. Para otras impresoras o para guardar un PDF en orden normal, desmarca la opción.

Prueba con papel **48 × 80 mm**, escala **100 %**, una página por hoja y sin encabezados ni pies del navegador. La compensación depende de ese tamaño; no debe usarse con otro formato de papel. Las pruebas locales verifican cada página PDF y simulan la inversión de CatPrinter con 1, 2, 3 y 12 productos. La salida física debe confirmarse con la X6 real.

Revisa primero la cola: una impresión pendiente puede salir al reconectar. **Volver a imprimir el ticket** abre nuevamente el último ticket enviado desde esta sesión, o la venta recién registrada si aún no imprimiste. No registra ventas ni descuenta inventario. Si no hay ticket reciente, el botón queda desactivado; utiliza el Historial. No se reintenta automáticamente al recuperar Bluetooth.

La página no puede detectar el estado de CatPrinter ni reconectar su enlace Bluetooth directamente. Estos accesos usan los [URI oficiales de Configuración de Windows](https://learn.microsoft.com/en-us/windows/apps/develop/launch/launch-settings). La reconexión física debe comprobarse en el equipo real.

Después de registrar una venta aparece **Imprimir ticket**. Cada venta del historial también permite reimprimir. Todos los tickets incluyen la imagen existente `assets/qr pagina ventas online.png`, centrada y con espacio blanco alrededor. No hay campo de URL ni casilla para quitar el QR.

La impresión espera a que la imagen esté cargada y decodificada. Si falla, muestra un aviso y no abre un ticket sin QR. La ruta se resuelve desde `panel/ticket.js`, conservando el prefijo del proyecto en GitHub Pages. La imagen original no se modifica.

## Datos y seguridad

El ticket usa la fila real guardada por la inserción existente (número, fecha, productos, cantidades, precios, subtotales y total). Reimprimir o cancelar no registra otra venta ni modifica inventario. La fecha se muestra en hora de Perú y los datos históricos faltantes se identifican como no registrados.

No hay consultas de configuración ni cambios de autenticación o de barbería. **No se requiere SQL.** Se retiraron la migración pendiente y la biblioteca generadora de QR porque ya no se utilizan. Si ejecutaste anteriormente la migración de configuración, su tabla puede permanecer sin uso; este cambio no elimina datos ni tablas en Supabase.

## Archivos

- `panel/app.js`: impresión tras registrar y desde el historial, sin configuración de URL.
- `panel/index.html`: controles de impresión simplificados.
- `panel/ticket.js`: ticket compacto para el papel de 48 × 80 mm de CatPrinter, letra de 9 puntos, total de 11 puntos, imagen QR local y espera de carga.
- `assets/qr pagina ventas online.png`: imagen existente utilizada sin cambios.
- `tests/ticket.test.cjs` y `tests/ticket-integration.cjs`: contenido, ruta bajo GitHub Pages, imagen cargada y flujo en Chrome con datos simulados.

## Probar

En el equipo del usuario CatPrinter ofrece **48 × 80 mm**. La vista previa usa 46 mm de contenido para dejar 1 mm de margen a cada lado. En impresión el contenido se adapta al ancho disponible, hasta 56 mm si el controlador permite papel más ancho. Con 48 × 80 mm, usa escala 100 % y orden normal; los tickets largos continuarán en varias páginas sin forzar toda la venta dentro de 80 mm. No es necesario seleccionar 58 mm si el controlador no lo ofrece. La anchura física del rollo y el tamaño imprimible del controlador pueden diferir.

Orden del ticket: encabezado y QR arriba, productos en el centro y total al final. Se respeta el tamaño de papel seleccionado en CatPrinter, sin imponer la altura completa del voucher como una página personalizada. Un ticket largo puede continuar en otra hoja del controlador, conservando su tamaño de letra. Selecciona orden normal de páginas para que salgan en secuencia.

1. Publica la raíz con las carpetas `panel/` y `assets/`, conservando el nombre de la imagen. No hace falta configurar una URL. `dist/` no contiene el panel y no se modificó.
2. Abre `panel/index.html`, inicia sesión y pulsa **Imprimir ticket** en una venta del historial o después de registrar la próxima venta habitual.
3. En Chrome/Edge selecciona **CatPrinter**, papel **58 mm**, escala personalizada **100 %**, márgenes mínimos y desactiva encabezados y pies del navegador. Evita **Ajustar a página**: si el controlador ofrece una hoja corta y ajusta la altura completa, puede encoger todo el voucher. Usa papel de rollo o una longitud suficiente en las preferencias de CatPrinter. El código no puede cambiar la escala del diálogo ni del controlador.
4. Comprueba los datos de la venta, el QR arriba, los productos en el medio y el total abajo. Escanea el QR impreso con un celular. Prueba un ticket largo y confirma que no corta productos ni el QR; la longitud final depende del controlador.
5. Cancela y reimprime: la venta permanece guardada y no vuelve a descontar unidades.

El documento usa `@page { size: auto; margin: 1mm; }` y ocupa el ancho disponible hasta 56 mm. Se retiró la altura personalizada porque algunos controladores pueden reducir el voucher completo para encajarlo en una hoja corta. Imprime solo el ticket, sin interfaz ni costos internos. El navegador puede pedir confirmación: no hay impresión silenciosa ni selección automática de impresora. No se usa COM5 ni Bluetooth web.

Verificaciones: `node --check panel/app.js`, `node --check panel/ticket.js` y `node --test tests/ticket.test.cjs`. Para la prueba de navegador instala `playwright-core@1.56.1` en una carpeta temporal, asigna `NODE_PATH` a su `node_modules` y ejecuta `node --test tests/ticket-integration.cjs`. `ALPHA_CHROME` permite indicar otra ruta de Chrome. No necesita Node.js en producción.

La prueba de navegador simula guardar ventas y cerrar la impresión, sin conectarse a Supabase ni imprimir físicamente. La salida en CatPrinter y el escaneo desde papel siguen pendientes en la X6 real.
