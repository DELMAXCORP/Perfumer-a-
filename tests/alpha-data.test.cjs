const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { ReadCache, StaleRead, all, dates, thumbnail } = require('../alpha-data.js');

test('deduplicación, caducidad e invalidación de lecturas', async () => {
  let now = 0, calls = 0;
  const cache = new ReadCache(() => now);
  const load = async () => ++calls;
  assert.deepEqual(await Promise.all([cache.read('x', load, 100), cache.read('x', load, 100)]), [1, 1]);
  now = 99; assert.equal(await cache.read('x', load, 100), 1);
  now = 100; assert.equal(await cache.read('x', load, 100), 2);
  cache.clear(); assert.equal(await cache.read('x', load), 3);
});

test('una respuesta anterior no atraviesa escrituras ni cambios de usuario', async () => {
  const cache = new ReadCache(); let finish;
  cache.setScope('admin');
  const old = cache.read('ventas', () => new Promise(resolve => { finish = resolve; }));
  await Promise.resolve(); cache.setScope('vendedor');
  const fresh = cache.read('ventas', async () => ['nuevo']);
  finish(['privado']); await assert.rejects(old, StaleRead);
  assert.deepEqual(await fresh, ['nuevo']);
  assert.deepEqual(await cache.read('ventas', () => { throw Error('no'); }), ['nuevo']);
});

test('fallos no quedan cacheados; no hay reintento de escrituras', async () => {
  const cache = new ReadCache(); let calls = 0;
  await assert.rejects(cache.read('x', () => { calls++; throw Error('red'); }));
  assert.equal(calls, 1);
  assert.equal(await cache.read('x', async () => 42), 42);
});

test('paginación completa incluso con max_rows inferior al tamaño solicitado', async () => {
  const source = Array.from({ length: 1203 }, (_, id) => ({ id })); let calls = 0;
  const rows = await all(() => ({ range(offset, end) { calls++; return Promise.resolve({ data: source.slice(offset, Math.min(end + 1, offset + 73)) }); } }));
  assert.equal(rows.length, 1203); assert.equal(new Set(rows.map(r => r.id)).size, 1203);
  assert.equal(calls, 18);
});

test('fechas de Lima incluyen todo el último día sin incluir el siguiente', () => {
  const filters = [];
  const query = { gte(...args) { filters.push(['gte', ...args]); return this; }, lt(...args) { filters.push(['lt', ...args]); return this; } };
  dates(query, 'fecha', '2026-10-31', '2026-10-31');
  assert.deepEqual(filters, [['gte', 'fecha', '2026-10-31T00:00:00-05:00'], ['lt', 'fecha', '2026-11-01T05:00:00.000Z']]);
  assert.throws(() => dates(query, 'fecha', '2026-11-02', '2026-11-01'));
});

test('miniaturas solamente para imágenes nuevas; conserva URLs históricas y privadas', () => {
  const root = 'https://example.supabase.co/storage/v1/object/';
  assert.equal(thumbnail(root + 'public/catalogo-imagenes/user/a.full.jpg'), root + 'public/catalogo-imagenes/user/a.thumb.jpg');
  for (const url of [root + 'public/catalogo-imagenes/old.jpg', root + 'sign/comprobantes/a.jpg?token=secret', 'data:image/png;base64,AAAA']) assert.equal(thumbnail(url), url);
});

test('diagnóstico apagado, sin secretos, cuenta solicitudes y no reintenta un 402', async () => {
  let calls = 0; const events = [];
  const sandbox = { URL, Event, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    performance, console: { debug() {} }, addEventListener() {}, dispatchEvent: e => events.push(e),
    fetch: async () => { calls++; return new Response('{}', { status: 402, headers: { 'content-length': '2' } }); } };
  sandbox.window = sandbox; vm.createContext(sandbox); vm.runInContext(fs.readFileSync('alpha-data.js', 'utf8'), sandbox);
  const api = sandbox.AlphaData, fetch = api.instrumentFetch();
  await fetch('https://example.supabase.co/rest/v1/ventas?telefono=secreto', { headers: { authorization: 'token' } });
  assert.equal(api.diagnostics.records.length, 0);
  api.diagnostics.enabled = true; api.diagnostics.start('venta');
  await fetch('https://example.supabase.co/storage/v1/object/sign/comprobantes/privado?token=secret');
  assert.equal(calls, 2); assert.equal(api.diagnostics.records.length, 1);
  assert.doesNotMatch(JSON.stringify(api.diagnostics.records), /secreto|privado|secret|token|authorization/);
  assert.equal(api.diagnostics.summary().venta, 1); assert.equal(events.at(-1).detail.status, 402);
});

test('escrituras confirmadas invalidan lecturas y notifican el catálogo', async () => {
  const sandbox = { URL, Event, performance, console, addEventListener() {}, dispatchEvent() {}, localStorage: { setItem() {} },
    fetch: async () => new Response('{}', { status: 200 }) };
  sandbox.window = sandbox; vm.createContext(sandbox); vm.runInContext(fs.readFileSync('alpha-data.js', 'utf8'), sandbox);
  const api = sandbox.AlphaData, old = api.privateCache.epoch, pub = api.publicCache.epoch;
  await api.instrumentFetch()('https://example.supabase.co/rest/v1/productos', { method: 'PATCH' });
  assert.equal(api.privateCache.epoch, old + 1); assert.equal(api.publicCache.epoch, pub + 1);
});
