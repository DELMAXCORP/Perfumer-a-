const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const window = {};
const contexto = vm.createContext({ window, URL, document: { currentScript: { src: 'https://example.org/proyecto/panel/ticket.js' } } });
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../panel/ticket.js'), 'utf8'), contexto);

test('ticket conserva importes, regalos y datos guardados; escapa contenido', () => {
  const html = window.AlphaTicket.documento({ id: 123, fecha: '2026-10-29T17:00:00Z', monto_total: 40,
    vendedor_email: 'interno@alpha.test', ganancia_neta: 19,
    detalles: [{ nombre: '<script>alert(1)</script>', cantidad: 2, precio_unitario: 20, subtotal: 40, tamano: '5ml' },
      { nombre: 'Regalo', cantidad: 1, precio_unitario: 0, subtotal: 0 }] });
  assert.match(html, /Venta: #123/);
  assert.match(html, /Cant\.: 2 · P\. unit\.: S\/ 20\.00/);
  assert.match(html, /TOTAL: S\/ 40\.00/);
  assert.match(html, /P\. unit\.: S\/ 0\.00/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|interno@alpha|ganancia_neta/);
});

test('todos los tickets incluyen la imagen QR local bajo la ruta de GitHub Pages', () => {
  const html = window.AlphaTicket.documento({ id: 9, monto_total: 30 });
  assert.match(html, /<img src="https:\/\/example.org\/proyecto\/assets\/qr%20pagina%20ventas%20online.png"/);
  assert.match(html, /ESCANEA Y VISITA ALPHA STORE/);
  assert.match(html, /COMPROBANTE INTERNO DE VENTA/);
  assert.doesNotMatch(html, /<svg|store_url/);
});

test('ticket largo conserva todos los productos y no divide sus bloques', () => {
  const html = window.AlphaTicket.documento({ detalles: Array.from({ length: 60 }, (_, i) => ({ nombre: 'Perfume ' + i, cantidad: 1, precio_unitario: 10, subtotal: 10 })), monto_total: 600 });
  assert.equal((html.match(/class="producto"/g) || []).length, 60);
  assert.match(html, /break-inside: avoid/);
  assert.match(html, /TOTAL: S\/ 600\.00/);
  assert.ok(html.indexOf('class="qr"') < html.indexOf('class="productos"'));
  assert.ok(html.lastIndexOf('class="producto"') < html.indexOf('class="total"'));
});

test('ventas antiguas y datos faltantes no inventan cantidades, precios ni fecha', () => {
  const html = window.AlphaTicket.documento({ producto_nombre: 'Perfume antiguo', monto_total: 50 });
  assert.match(html, /Perfume antiguo/);
  assert.match(html, /sin desglose/);
  assert.match(html, /Número no registrado/);
  assert.match(html, /Fecha: No registrada/);
  const parcial = window.AlphaTicket.documento({ detalles: [{ nombre: 'Perfume' }] });
  assert.match(parcial, /Cant\.: No registrada/);
  assert.doesNotMatch(parcial, /S\/ 0\.00/);
});
