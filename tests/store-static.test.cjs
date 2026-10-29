const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const metadata = fs.readFileSync(path.join(root, 'product-metadata.js'), 'utf8');
const core = require(path.join(root, 'store-core.js'));

const requiredIds = [
  'inicio', 'coleccion', 'nosotros', 'contacto', 'product-dialog', 'bag-dialog',
  'search', 'category-filter', 'presentation-filter', 'price-min', 'price-max'
];
requiredIds.forEach(id => assert.match(html, new RegExp(`id=["']${id}["']`), `Falta #${id}`));

assert.match(html, /lang="es"/);
assert.match(html, /name="viewport"/);
assert.match(html, /aria-live="polite"/);
assert.match(html, /src="store-core\.js"/);
assert.match(html, /src="product-metadata\.js"/);
assert.match(html, /hero-decants-pexels\.jpg/);
assert.match(html, /decant de regalo/i);
assert.match(html, /no confirma disponibilidad, pago ni compra/i);
assert.match(js, /localStorage\.setItem\(STORAGE_KEY/);
assert.match(js, /localStorage\.getItem\(STORAGE_KEY/);
assert.match(js, /precio_decant_3ml/);
assert.doesNotMatch(js, /let fallback = \[|const fallback = \[/, 'No deben existir precios de respaldo');
assert.match(js, /whatsappNumber: ''/);
assert.match(js, /encodeURIComponent\(orderSummary\(\)\)/);
assert.match(js, /notes-pyramid/);
assert.match(metadata, /'9pm'/);
assert.match(metadata, /'versace eros eau de toilette'/);
assert.doesNotMatch(metadata, /'love potion': item/, 'Love Potion no debe identificarse sin confirmar la marca');
assert.match(css, /@media \(min-width: 940px\)/);
assert.match(css, /:focus-visible/);
assert.match(css, /prefers-reduced-motion/);

const fixtures = [
  { id: '1', name: 'Fragancia Solar', brand: 'Casa Uno', category: 'arabes', presentation: 'completo', price: 180 },
  { id: '2', name: 'Fragancia Lunar', brand: 'Casa Dos', category: 'disenador', presentation: 'completo', price: 320 },
  { id: '3', name: 'Fragancia Solar', brand: 'Casa Uno', category: 'decants', presentation: 'decant', price: 25 }
];
assert.deepEqual(core.filterProducts(fixtures, { query: 'casa dos', category: 'all', presentation: 'all', min: null, max: null }).map(item => item.id), ['2']);
assert.deepEqual(core.filterProducts(fixtures, { query: '', category: 'decants', presentation: 'decant', min: 20, max: 30 }).map(item => item.id), ['3']);
assert.equal(core.filterProducts(fixtures, { query: 'inexistente', category: 'all', presentation: 'all', min: null, max: null }).length, 0);

let cart = core.addItem([], { id: '1', name: 'Fragancia Solar', presentationLabel: 'Perfume completo', size: '100 ml', price: 180 }, 1);
cart = core.addItem(cart, { id: '1', name: 'Fragancia Solar', presentationLabel: 'Perfume completo', size: '100 ml', price: 180 }, 2);
cart = core.addItem(cart, { id: '3', name: 'Fragancia Solar', presentationLabel: 'Decant', size: '5 ml', price: 25 }, 2);
assert.deepEqual(core.cartTotals(cart), { units: 5, amount: 590 });
cart = core.updateQuantity(cart, '3', -1);
assert.deepEqual(core.cartTotals(cart), { units: 4, amount: 565 });
const serialized = JSON.stringify(cart);
assert.deepEqual(core.deserializeCart(serialized), cart);
assert.match(core.createOrderSummary(cart, 'ALPHA Perfumería'), /Total referencial: S\/ 565\.00/);
cart = core.removeItem(cart, '1');
assert.deepEqual(core.cartTotals(cart), { units: 1, amount: 25 });

console.log('ALPHA Store: comprobaciones estáticas y funcionales superadas.');
