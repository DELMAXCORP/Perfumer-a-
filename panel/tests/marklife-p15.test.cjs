// Pruebas del transporte con un doble BLE; no equivalen a una prueba física.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../marklife-p15.js'), 'utf8');

function entorno({ autorizada = false, getDevices = true, fallo = false, sinConfirmacion = false, inseguro = false } = {}) {
  let reloj = 0, picker = 0, conexiones = 0;
  const tareas = new Map();
  let id = 0;
  const eventos = () => ({
    listeners: new Map(),
    addEventListener(n, f) { if (!this.listeners.has(n)) this.listeners.set(n, new Set()); this.listeners.get(n).add(f); },
    removeEventListener(n, f) { this.listeners.get(n)?.delete(f); },
    emit(n) { for (const f of this.listeners.get(n) || []) f({ target: this }); }
  });
  const elementos = Object.fromEntries(['p15Mensaje', 'p15Resultado', 'p15Estado', 'p15Conectar'].map(n => [n, { ...eventos(), textContent: '', dataset: {} }]));
  const escrituras = [], textos = [];
  const rx = { ...eventos(), async startNotifications() {} };
  const cx = { ...eventos(), async startNotifications() { this.notificar([1, 4]); } };
  for (const c of [rx, cx]) c.notificar = function(b) { this.value = new DataView(Uint8Array.from(b).buffer); this.emit('characteristicvaluechanged'); };
  const dispositivo = { ...eventos(), id: 'p15-prueba', name: 'P15' };
  const tx = { properties: { writeWithoutResponse: true }, async writeValueWithoutResponse(b) {
    escrituras.push({ datos: Array.from(b), tiempo: reloj });
    cx.notificar([1, 1]);
    if (fallo && escrituras.length === 3) dispositivo.gatt.disconnect();
    if (!sinConfirmacion && b.length >= 4 && Array.from(b.slice(-4)).join() === '16,255,241,69') rx.notificar([0xaa]);
  } };
  dispositivo.gatt = {
    connected: false,
    async connect() { conexiones++; this.connected = true; return this; },
    disconnect() { if (this.connected) { this.connected = false; dispositivo.emit('gattserverdisconnected'); } },
    async getPrimaryService() { return { async getCharacteristic(u) { return u.includes('ff02') ? tx : u.includes('ff01') ? rx : cx; } }; }
  };
  const bluetooth = { requestDevice(opts) { picker++; assert.equal(opts.filters[0].namePrefix, 'P15'); return Promise.resolve(dispositivo); } };
  if (getDevices) bluetooth.getDevices = async () => autorizada ? [dispositivo] : [];
  const document = { ...eventos(), hidden: false, getElementById: n => elementos[n], querySelectorAll: () => [], createElement: () => ({
    getContext: () => ({ fillRect() {}, measureText: t => ({ width: t.length * 7 }), fillText(t) { textos.push(t); }, getImageData: () => {
      const pixels = new Uint8ClampedArray(320 * 96 * 4).fill(255);
      pixels[0] = pixels[1] = pixels[2] = 0; // pixel negro conocido para probar rotación/centrado
      return { data: pixels };
    } })
  }) };
  const sandbox = { document, navigator: { bluetooth }, localStorage: { getItem: () => null, setItem() {} },
    Date: class extends Date { static now() { return reloj; } },
    setTimeout(f, ms) { const n = ++id; tareas.set(n, { f, ms }); return n; },
    clearTimeout(n) { tareas.delete(n); },
    Uint8Array, Uint8ClampedArray, console
  };
  sandbox.window = sandbox;
  sandbox.isSecureContext = !inseguro;
  vm.runInNewContext(source, sandbox);
  async function avanzar(hasta = () => false, max = 5000) {
    for (let i = 0; i < max; i++) {
      await Promise.resolve();
      if (hasta()) return;
      const entrada = tareas.entries().next().value;
      if (entrada) {
        tareas.delete(entrada[0]); reloj += entrada[1].ms; entrada[1].f();
      }
    }
    assert.fail('La operación no terminó');
  }
  async function imprimir(item = { nombre: '9PM', tamano: '5ml' }) {
    let terminada = false;
    const p = sandbox.AlphaP15.imprimir(item).then(() => { terminada = true; });
    await avanzar(() => terminada); await p;
  }
  return { sandbox, elementos, escrituras, textos, dispositivo, avanzar, imprimir, get picker() { return picker; }, get conexiones() { return conexiones; } };
}

test('primera autorización, secuencia L11, dimensiones y bitmap girado; conexión reutilizada', async () => {
  const e = entorno();
  await e.avanzar(() => e.elementos.p15Estado.textContent === 'Desconectada');
  // Dejar resolver la consulta de permisos antes del gesto.
  for (let i = 0; i < 6; i++) await Promise.resolve();
  await e.imprimir();
  assert.equal(e.picker, 1);
  assert.equal(e.elementos.p15Estado.textContent, 'Conectada');
  assert.match(e.elementos.p15Resultado.textContent, /confirmó/);
  assert.deepEqual(e.escrituras[0].datos, [16,255,16,0,2, ...Array(15).fill(0),16,255,241,2]);
  const bytes = e.escrituras.slice(1).flatMap(p => p.datos);
  assert.deepEqual(bytes.slice(0, 8), [29,118,48,0,48,0,64,1]);
  assert.equal(bytes.length, 8 + 48 * 320 + 6);
  assert.equal(bytes[8 + 319 * 48 + 18], 128);
  assert.deepEqual(bytes.slice(-6), [29,12,16,255,241,69]);
  assert.ok(e.escrituras.every(p => p.datos.length <= 95));
  assert.ok(e.escrituras.slice(1).every((p, i) => p.tiempo - e.escrituras[i].tiempo >= 30));
  assert.deepEqual(e.textos, ['ALPHA', '9PM', '5 ml']);
  await e.imprimir({ nombre: 'Perfume abierto', tamano: '100ml', ml_vendido: 32.5 });
  assert.ok(e.textos.includes('32.5 ml'));
  assert.equal(e.picker, 1);
  assert.equal(e.conexiones, 1);
});

test('reconecta autorizada al iniciar y tras perder enlace sin abrir selector', async () => {
  const e = entorno({ autorizada: true });
  await e.avanzar(() => e.elementos.p15Estado.textContent === 'Conectada');
  assert.equal(e.picker, 0);
  e.dispositivo.gatt.disconnect();
  await e.avanzar(() => e.elementos.p15Estado.textContent === 'Conectada');
  await e.imprimir();
  assert.equal(e.picker, 0);
  assert.equal(e.conexiones, 2);
});

test('desconexión durante envío no informa éxito ni reimprime', async () => {
  const e = entorno({ autorizada: true, fallo: true });
  await e.avanzar(() => e.elementos.p15Estado.textContent === 'Conectada');
  await e.imprimir();
  assert.match(e.elementos.p15Resultado.textContent, /No se repetirá automáticamente/);
  assert.doesNotMatch(e.elementos.p15Resultado.textContent, /confirmó/);
  const cantidad = e.escrituras.length;
  await e.avanzar(() => e.elementos.p15Estado.textContent === 'Conectada');
  assert.equal(e.escrituras.length, cantidad);
});

test('sin confirmación no declara éxito; pulsaciones simultáneas no duplican trabajo', async () => {
  const e = entorno({ autorizada: true, sinConfirmacion: true });
  await e.avanzar(() => e.elementos.p15Estado.textContent === 'Conectada');
  const p = e.imprimir();
  await e.sandbox.AlphaP15.imprimir({ nombre: 'Duplicado', tamano: '10ml' });
  await p;
  assert.match(e.elementos.p15Resultado.textContent, /no confirmó/);
  assert.equal(e.escrituras.filter(p => p.datos[0] === 16).length, 1);
  assert.ok(!e.textos.includes('Duplicado'));
});

test('sin getDevices conecta desde gesto; datos incompletos no se imprimen', async () => {
  const e = entorno({ getDevices: false });
  await Promise.resolve();
  await e.imprimir({ nombre: 'Envase', tamano: 'Frasco Entero' });
  assert.equal(e.picker, 0);
  assert.equal(e.escrituras.length, 0);
  await e.imprimir();
  assert.equal(e.picker, 1);
  assert.match(e.elementos.p15Resultado.textContent, /confirmó/);
});

test('HTTP inseguro informa requisito y no solicita acceso Bluetooth', async () => {
  const e = entorno({ inseguro: true });
  await e.imprimir();
  assert.equal(e.picker, 0);
  assert.match(e.elementos.p15Resultado.textContent, /HTTPS/);
});
