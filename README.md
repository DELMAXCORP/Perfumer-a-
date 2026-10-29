# ALPHA Store

Prototipo público de comercio electrónico para ALPHA Perfumería, en Ica, Perú.

## Tecnología

El proyecto mantiene la tecnología que ya utilizaba el repositorio: HTML, CSS y JavaScript sin compilación. El catálogo se consulta en modo de solo lectura desde la vista pública `catalogo_publico` de Supabase. El panel interno anterior no forma parte de la nueva interfaz; su estado completo se conserva en `alpha-anterior-2026-10-28.zip`.

## Funciones implementadas

- Inicio, colección, guía de presentaciones, nosotros y contacto.
- Catálogo real desde Supabase, sin precios de respaldo.
- Búsqueda por nombre y por marca cuando esta esté registrada en los metadatos confirmados.
- Filtros por categoría y rango de precio.
- Ficha de producto con sus opciones de venta en decant (3, 5, 10 y 30 ml), con precio o cotización por WhatsApp.
- Carrito persistente con cantidades, subtotales, total y retiro de productos.
- Resumen de pedido copiable.
- Recolección de datos del cliente (nombre y celular) antes de enviar por WhatsApp.
- Registro de contactos para marketing, solo activos cuando la venta se marca como exitosa.
- Panel de administración (`panel/index.html`, pestaña "Contactos Marketing") para gestionar contactos.
- `admin.html` redirige al panel.
- Estados de carga, error, resultados vacíos y carrito vacío.
- Navegación por teclado, etiquetas accesibles y estilos responsivos.

## Datos pendientes de confirmación

- Dirección exacta, horario, condiciones de pago y entrega.
- Confirmar la identidad exacta y la marca de `LOVE POTION`, nombre compartido por varias fragancias.
- Tamaño y fragancia del decant de regalo.
- Historia institucional de ALPHA.

El WhatsApp oficial es el +51 927 025 595 y ya está configurado en `STORE_CONFIG.whatsappNumber`, dentro de `app.js`. El respaldo anterior no contiene un webhook ni una configuración de recordatorios por WhatsApp; para conectar la automatización existente hace falta su URL o configuración real.

Las marcas, categorías y notas olfativas investigadas se mantienen en `product-metadata.js`. Cada ficha enlaza la fuente consultada. La fotografía de decants del inicio es de Stefanie Berlin en Pexels y se usa conforme a su licencia gratuita.

## Contactos para marketing

La tienda recoge nombre y celular del cliente antes de enviar el pedido por WhatsApp. El contacto se crea como **pendiente** en la tabla `contactos` (ver `database/contactos-marketing.sql`). Solo los contactos con estado **exitosa** deben usarse para envíos de recordatorios, promociones, combos o nuevos ingresos.

Para marcar una venta como exitosa:
- Ejecuta `database/contactos-marketing.sql` en Supabase (una sola vez).
- Abre `panel/index.html`, inicia sesión con tu cuenta de Supabase y ve a la pestaña "📱 Contactos Marketing".
- Pulsa "Marcar exitosa" en el contacto correspondiente. Solo esos contactos se usarán para marketing.

La clave del panel es solo una barrera del lado del cliente; para producción conviene usar Supabase Auth.

Sirve la carpeta con cualquier servidor HTTP estático y abre `index.html`. `catalogo.html` conserva compatibilidad con enlaces antiguos y redirige a la colección nueva.
