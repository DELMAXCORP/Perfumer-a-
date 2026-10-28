# Etiquetas Marklife P15 en Alpha

La impresión está en `marklife-p15.js`. Solo recibe una copia de nombre,
tamaño y mililitros vendidos del carrito. No escribe productos, ventas, borradores
ni datos de Supabase. Cada pulsación solicita una sola etiqueta, independientemente
de la cantidad del producto en el carrito. También funciona antes de registrar la venta.

## Uso y prueba con la impresora

1. Abre el sitio de Alpha mediante HTTPS en Chrome Android y enciende la P15.
2. Carga etiquetas troqueladas de 40 × 12 mm. Cierra la conexión de Thermoprint
   u otra aplicación si está utilizando la impresora.
3. Agrega un perfume al carrito y pulsa **Imprimir etiqueta**, o conecta antes
   mediante **Conectar P15**. Autoriza la P15 en el selector de Chrome.
4. Comprueba ALPHA, nombre y mililitros, orientación, márgenes y avance hasta
   la siguiente etiqueta. Prueba 3 ml, 5 ml, 10 ml, un nombre largo y un regalo.
5. Imprime otra etiqueta: no debería abrirse el selector. Apaga/enciende la P15
   y comprueba el indicador y la reconexión. Recarga Alpha para comprobar
   recuperación de permisos si `getDevices()` está disponible.

La autorización de Thermoprint corresponde a otro origen: Alpha necesita su
propia autorización inicial. El permiso lo conserva Chrome; localStorage solo
recuerda el identificador preferido. No se almacena un permiso ficticio.

## Reconexión y errores

Se consulta `navigator.bluetooth.getDevices()` al cargar. Se utiliza el dispositivo
recordado, o la única P15 autorizada. Con varias P15 sin una preferencia reconocida,
el selector permite decidir cuál utilizar. No se seleccionan otros modelos.

La conexión se comparte durante la sesión. Ante una desconexión se descartan
características antiguas y se realizan hasta tres intentos (1, 3 y 8 segundos).
Al volver a la pestaña o imprimir se puede intentar de nuevo sin selector si existe
un dispositivo autorizado conocido. No se realizan búsquedas sin autorización.
Si `getDevices()` no está disponible, se reutiliza el dispositivo mientras permanezca
en memoria; después de recargar puede hacer falta seleccionar la impresora otra vez.

Chrome, los permisos del sistema, la suspensión de Android, el alcance y el estado
de la impresora pueden impedir reconectar. No se garantiza conexión en segundo plano.
Si la consulta inicial de permisos sigue pendiente al tocar el botón, se indica que
se vuelva a pulsar, para conservar el gesto necesario para abrir el selector.

Una desconexión o un timeout nunca equivale a éxito. Una impresión interrumpida
no se reenvía automáticamente. Revisa físicamente la etiqueta antes de repetirla.
El resultado de la impresión permanece visible aunque se reconecte la P15.

## Referencia del protocolo

Implementación JavaScript específica para P15 a partir del comportamiento documentado
y del código de Thermoprint, revisión consultada:
`51967b7bdf6ddfe6e64db6456fad86bf39276e9a`.

- [Perfil P15](https://github.com/tomLadder/thermoprint/blob/51967b7bdf6ddfe6e64db6456fad86bf39276e9a/packages/core/src/device/profiles/p15.ts)
- [Comandos L11](https://github.com/tomLadder/thermoprint/blob/51967b7bdf6ddfe6e64db6456fad86bf39276e9a/packages/core/src/protocol/l11/commands.ts)
- [Secuencia L11](https://github.com/tomLadder/thermoprint/blob/51967b7bdf6ddfe6e64db6456fad86bf39276e9a/packages/core/src/protocol/l11/protocol.ts)
- [Control de flujo](https://github.com/tomLadder/thermoprint/blob/51967b7bdf6ddfe6e64db6456fad86bf39276e9a/packages/core/src/transport/flow-control.ts)
- [Envío y respuestas](https://github.com/tomLadder/thermoprint/blob/51967b7bdf6ddfe6e64db6456fad86bf39276e9a/packages/core/src/printer.ts)
- [Rotación y centrado](https://github.com/tomLadder/thermoprint/blob/51967b7bdf6ddfe6e64db6456fad86bf39276e9a/packages/cli/src/render/template-renderer.ts)

Servicio `ff00`, escritura sin respuesta `ff02`, notificaciones `ff01` y control
`ff03` (UUID Bluetooth completos en el código). Paquetes de hasta 95 bytes,
reducidos si la notificación MTU lo requiere. Créditos recibidos de la impresora,
pausa de 30 ms y recuperación de un crédito tras 1 s sin créditos, como upstream.

El perfil real P15 utiliza **thickness=2** (`10 FF 10 00 02`), seguido de wakeup,
enable, bitmap, posicionamiento al hueco y stop. Se separa preámbulo del bitmap
y se espera recuperación de créditos entre ambos. La imagen de 320 × 96 puntos
(40 × 12 mm) se rota y centra en un raster de 384 × 320 puntos, igual al exportador
de referencia. El texto usa umbral monocromático; no se transmiten imágenes remotas.

Solo se informa confirmación ante `AA`, `4F` o `4B` recibido en las notificaciones.
Se vigilan avisos de falta de papel, tapa abierta, temperatura y batería.

## Verificación local

Ejecuta `node --test tests/marklife-p15.test.cjs` y `node --check marklife-p15.js`.
Las pruebas usan un doble de Web Bluetooth exclusivamente dentro de los tests:
la aplicación siempre necesita una P15 real y no incluye modo de impresión simulada.
Cubren secuencia y tamaño del raster, orientación de píxeles, límites y ritmo de
paquetes, permisos, reconexión, concurrencia, errores y ausencia de confirmación.
La validación física de tamaño, avance y legibilidad queda pendiente de la P15.
