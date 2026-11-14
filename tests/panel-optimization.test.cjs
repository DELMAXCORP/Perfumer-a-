// Local VM + in-memory PostgREST double. No network and no production writes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function panel(sourcePath = 'panel/app.js') {
  const nodes = new Map(), requests = [], alerts = [], files = [], uploads = [];
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { value: '', innerHTML: '', textContent: '', innerText: '', src: '', hidden: false, disabled: false,
      classList: { add() {}, remove() {}, toggle() {}, contains() {return false;} }, listeners: {},
      addEventListener(type, fn) { this.listeners[type] = fn; }, replaceChildren() { this.innerHTML = ''; },
      querySelectorAll() { return []; }, querySelector() { return node('child'); }, setAttribute() {}, removeAttribute() {}, remove() {}, close() {}, showModal() {}, reset() {}, focus() {} });
    return nodes.get(id);
  }
  const tables = {
    productos: [ { id: 1, nombre: 'Sellado', tipo: 'Perfume Sellado', tamano: '100ml', stock: 3, precio: 50, precio_sugerido: 100, ubicacion_stock: 'Tienda Local' },
      { id: 2, nombre: 'Abierto', tipo: 'Perfume para Decant', tamano: '100ml', stock: 1, ml_restantes: 40, precio: 100, ubicacion_stock: 'Tienda Local' },
      { id: 3, nombre: 'Envase', tipo: 'Decant Vacío', tamano: '5ml', stock: 10, precio: 1 } ],
    ventas: [{ id: 10, fecha: '2026-10-31T18:00:00Z', producto_nombre: 'Venta antigua', monto_total: 100, ganancia_neta: 50, vendedor_email: 'diego@alpha.com', detalles: [], comprobante_url: 'data:image/jpeg;base64,AAAA' },
      { id: 11, fecha: '2026-11-02T18:00:00Z', producto_nombre: 'Venta nueva', monto_total: 200, ganancia_neta: 80, vendedor_email: 'diego@alpha.com', detalles: [], comprobante_url: 'u/receipt.jpg' }],
    cierres_caja_notas: [], cierres_inventario_ubicaciones: [], inventario_movimientos: [], asistencia: [], contactos: []
  };
  let sandbox, authListener, failVenta = false, signatures = 0, deferTable = null, release = null;
  function query(table) {
    const state = { columns: '*', filters: [], orders: [], action: 'select' };
    const builder = {
      select(columns) { state.columns = columns; return this; },
      eq(k,v) { state.filters.push(r => r[k] === v); return this; },
      neq(k,v) { state.filters.push(r => r[k] !== v); return this; },
      in(k,values) { state.filters.push(r => values.includes(r[k])); return this; },
      is(k,v) { state.filters.push(r => (r[k] ?? null) === v); return this; },
      not(k,op,v) { state.filters.push(r => (r[k] ?? null) !== v); return this; },
      gte(k,v) { state.filters.push(r => Date.parse(r[k]) >= Date.parse(v)); return this; },
      lte(k,v) { state.filters.push(r => Date.parse(r[k]) <= Date.parse(v)); return this; },
      lt(k,v) { state.filters.push(r => Date.parse(r[k]) < Date.parse(v)); return this; },
      order(k,opts = {}) { state.orders.push([k,opts.ascending !== false]); return this; },
      range(a,b) { state.range = [a,b]; return this; }, limit(n) { state.range = [0,n-1]; return this; },
      insert(rows) { state.action = 'insert'; state.rows = rows; return this; },
      update(values) { state.action = 'update'; state.values = values; return this; },
      delete() { state.action = 'delete'; return this; },
      upsert(rows) { state.action = 'insert'; state.rows = Array.isArray(rows) ? rows : [rows]; return this; },
      single() { state.single = true; return this; }, maybeSingle() { state.single = true; return this; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        requests.push({ table, columns: state.columns, action: state.action, range: state.range });
        if (table === 'ventas' && state.action === 'insert' && failVenta) return { error: { message: 'fallo de prueba' }, status: 500 };
        let rows = tables[table].filter(r => state.filters.every(f => f(r)));
        if (state.action === 'insert') { rows = state.rows.map((r,i) => ({ id: 100 + i, fecha: '2026-11-04T18:00:00Z', ...r })); tables[table].push(...rows); }
        if (state.action === 'update') rows.forEach(r => Object.assign(r,state.values));
        if (state.action === 'delete') tables[table] = tables[table].filter(r => !rows.includes(r));
        if (state.action !== 'select') sandbox.AlphaData.privateCache.clear();
        rows = [...rows].sort((a,b) => { for (const [k,asc] of state.orders) { if (a[k] !== b[k]) return (a[k] > b[k] ? 1 : -1) * (asc ? 1 : -1); } return 0; });
        if (state.range) rows = rows.slice(state.range[0], state.range[1]+1);
        rows = rows.map(r => state.columns === '*' ? structuredClone(r) : Object.fromEntries(state.columns.split(',').map(k => [k,structuredClone(r[k])])));
        const response = { data: state.single ? rows[0] || null : rows, error: null, status: 200 };
        if (deferTable === table && state.action === 'select') {
          deferTable=null;
          return new Promise(resolve=>{release=()=>resolve(response);});
        }
        return response;
      }).then(resolve,reject); }
    };
    return builder;
  }
  const api = { from: query, auth: { getSession: async () => ({ data: {} }), onAuthStateChange: fn => { authListener = fn; },
    signInWithPassword: async ({email}) => ({data:{user:{id:email,email}}}), signOut: async () => { authListener('SIGNED_OUT',null); return {}; } },
    storage: { from: () => ({ createSignedUrl: async () => { signatures++; return { data: { signedUrl: 'https://mock/receipt' } }; },
      upload: async (path,blob,options) => {uploads.push({path,options});return {};}, remove: async()=>({}), getPublicUrl:path=>({data:{publicUrl:'https://mock/'+path}}) }) } };
  sandbox = { URL, Event, performance, console, Date, crypto: require('node:crypto').webcrypto,
    CustomEvent: class { constructor(type,init) { this.type=type; this.detail=init.detail; } },
    fetch() { throw Error('NETWORK FORBIDDEN'); }, addEventListener() {}, dispatchEvent() {},
    document: { getElementById: node, querySelector: () => node('selected'), querySelectorAll: () => [], addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} }, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    Audio: class { constructor() { this.duration = 0; } play() { return Promise.resolve(); } pause() {} addEventListener() {} removeEventListener() {} },
    alert: text => alerts.push(text), confirm: () => true, supabase: { createClient: () => api },
    XLSX: { utils: { aoa_to_sheet: rows => ({ rows }), book_new: () => ({}), book_append_sheet: (book,sheet,name) => { book[name] = sheet; } }, writeFile: book => files.push(book) }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('alpha-data.js','utf8'),sandbox);
  vm.runInContext(fs.readFileSync(sourcePath,'utf8'),sandbox);
  vm.runInContext(`renderizarStock=()=>{}; actualizarOpcionesVenta=()=>{}; renderizarCarrito=()=>{};
    renderizarGraficoVentas=()=>{}; actualizarGraficoVendedores=()=>{};
    guardarBorradorVenta=async()=>{}; restaurarBorradorVenta=async()=>{}; borrarBorradorVenta=async()=>{};
    comprobarMetaVentasDiaria=async()=>{}; usuarioActual={id:'admin',email:'diego@alpha.com'};
    if(typeof datos !== 'undefined') datos.privateCache.setScope('admin');`,sandbox);
  return { sandbox, node, tables, requests, alerts, files, uploads, run: code => vm.runInContext(code,sandbox), setFailVenta: () => {failVenta=true;}, signatures: () => signatures,
    deferNext: table=>{deferTable=table;}, release:()=>release() };
}

test('entrada: inventario y asistencia independientes, sin historial ni cierres', async () => {
  const p=panel(); await p.run('iniciarApp()');
  const ventasEntrada=p.requests.filter(r=>r.table==='ventas');
  assert.equal(ventasEntrada.length,1);
  assert.equal(ventasEntrada[0].columns,'monto_total,ubicacion_venta');
  assert.equal(p.requests.filter(r=>r.table==='cierres_inventario_ubicaciones').length,0);
  assert.equal(p.requests.filter(r=>r.table==='productos').length,2);
  assert.equal(p.requests.filter(r=>r.table==='asistencia').length,2);
  const before=p.requests.length; await p.run('cargarTodo()'); assert.equal(p.requests.length,before);
});

test('comparación reproducible del respaldo: inicio 9 → 5; refresco tras escritura 9 → 3', async t => {
  const backup = '.local-backups/alpha-before-optimization/panel/app.js';
  if (!fs.existsSync(backup)) { t.skip('El respaldo local no se distribuye'); return; }
  const before = panel(backup), after = panel();
  await before.run('cargarTodo()'); await new Promise(resolve=>setImmediate(resolve));
  await after.run('iniciarApp()');
  assert.equal(before.requests.length,9); assert.equal(after.requests.length,5);
  before.requests.length=0; after.requests.length=0;
  after.run('datos.privateCache.clear()');
  await before.run('cargarTodo()'); await new Promise(resolve=>setImmediate(resolve));
  await after.run('cargarTodo()');
  assert.equal(before.requests.length,9); assert.equal(after.requests.length,3);
});

test('historial: fecha en servidor, totales completos y Base64 solo bajo demanda', async () => {
  const p=panel(); await p.run('cargarProductos()');
  p.node('fechaReporteDesde').value='2026-10-31'; p.node('fechaReporteHasta').value='2026-10-31';
  await p.run('cargarHistorial()');
  assert.equal(p.run('listaVentasCache.length'),1);
  assert.equal(p.run('listaVentasCache[0].monto_total'),100);
  assert.equal(p.run('listaVentasCache[0].comprobante_url'),undefined);
  assert.equal(p.requests.some(r=>r.table==='ventas' && /comprobante_url|\*/.test(r.columns)),false);
  await p.run('abrirModalComprobante(0)');
  assert.equal(p.node('modalImgComprobante').src,'data:image/jpeg;base64,AAAA');
  assert.equal(p.signatures(),0);
});

test('firmas reutilizadas, aperturas simultáneas deduplicadas y logout limpia datos', async () => {
  const p=panel(); await p.run('cargarProductos(); cargarHistorial()');
  await Promise.all([p.run('abrirModalComprobante(0)'),p.run('abrirModalComprobante(0)')]);
  assert.equal(p.signatures(),1);
  p.run('cerrarModalComprobante()'); await p.run('abrirModalComprobante(0)'); assert.equal(p.signatures(),1);
  await p.run('cerrarSesion()');
  assert.equal(p.run('listaVentasCache.length'),0); assert.equal(p.run('listaProductos.length'),0);
  assert.equal(p.node('modalImgComprobante').src,''); assert.equal(p.run('firmas.entries.size'),0);
});

test('venta sellada y decant validan stock en servidor y reservan mililitros/envase', async () => {
  const p=panel(); await p.run('cargarProductos()');
  await p.run("reservarStockVenta([{tipo:'Perfume Sellado',producto_id:1,cantidad:2}])"); assert.equal(p.tables.productos[0].stock,1);
  await p.run("reservarStockVenta([{tipo:'Decant',producto_id:2,tamano:'5ml',cantidad:2}])");
  assert.equal(p.tables.productos[1].ml_restantes,30); assert.equal(p.tables.productos[2].stock,8);
  await assert.rejects(p.run("reservarStockVenta([{tipo:'Perfume Sellado',producto_id:1,cantidad:2}])"),/Stock insuficiente/);
  assert.equal(p.tables.productos[0].stock,1);
});

test('fallo de venta restaura reserva y una venta confirmada no recarga reportes ocultos', async () => {
  for (const fail of [false,true]) {
    const p=panel(); await p.run('cargarProductos()'); if(fail)p.setFailVenta();
    p.run("carritoVenta=[{tipo:'Perfume Sellado',producto_id:1,nombre:'Sellado',tamano:'100ml',cantidad:1,subtotal:100,costo_total:50}]");
    await p.node('formVenta').listeners.submit({preventDefault(){}});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(p.tables.productos[0].stock,fail?3:2);
    assert.equal(p.tables.ventas.length,fail?2:3);
    // Tras una venta confirmada solo se permite la consulta ligera de la caja del día
    // (monto_total,ubicacion_venta); ningún reporte oculto debe recargarse.
    assert.equal(p.requests.some(r=>r.table==='ventas'&&r.action==='select'&&r.columns!=='monto_total,ubicacion_venta'),false);
    assert.equal(p.requests.some(r=>r.table==='cierres_inventario_ubicaciones'),false);
  }
});

test('Excel respeta rango y presencia de captura sin descargar contenido', async () => {
  const p=panel(); await p.run('cargarProductos()');
  p.node('fechaReporteDesde').value='2026-10-31'; p.node('fechaReporteHasta').value='2026-10-31';
  await p.run('exportarExcel()');
  assert.equal(p.files.length,1); assert.equal(p.files[0].Ventas.rows.length,2);
  assert.equal(p.files[0].Ventas.rows[1][3],100); assert.equal(p.files[0].Ventas.rows[1][8],'SÍ');
  assert.equal(p.requests.some(r=>r.columns==='comprobante_url'),false);
});

test('login vendedor y asistencia preservan usuario y límites', async () => {
  const p=panel(); p.node('loginEmail').value='vendedor@example.org';
  await p.node('formLogin').listeners.submit({preventDefault(){}}); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(p.run('usuarioActual.email'),'vendedor@example.org');
  assert.equal(p.run('esAdmin()'),false);
  await p.run('marcarIngresoTrabajo()'); assert.equal(p.tables.asistencia.length,1);
  await p.run('cargarEstadoAsistencia()');
  assert.equal(p.tables.asistencia[0].vendedor_email,'vendedor@example.org');
  await p.run('marcarSalidaTrabajo()'); assert.ok(p.tables.asistencia[0].fecha_salida);
});

test('anulación devuelve stock y mililitros según la lógica existente', async () => {
  const p=panel(); await p.run('cargarProductos()');
  p.tables.productos[0].stock=2; p.tables.productos[1].ml_restantes=35; p.tables.productos[2].stock=9;
  p.tables.ventas.push({id:12,detalles:[{tipo:'Perfume Sellado',producto_id:1,cantidad:1},{tipo:'Decant',producto_id:2,tamano:'5ml',cantidad:1}]});
  p.run('listaProductos.find(p=>p.id===1).stock=2;');
  p.run('listaVentasCache = ' + JSON.stringify(p.tables.ventas));
  await p.run('deshacerVenta(12)'); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(p.tables.productos[0].stock,3); assert.equal(p.tables.productos[1].ml_restantes,40); assert.equal(p.tables.productos[2].stock,10);
  assert.equal(p.tables.ventas.some(v=>v.id===12),false);
});

test('traslado parcial conserva existencias totales, costo y ubicaciones', async () => {
  const p=panel(); await p.run('cargarProductos()');
  p.node('selected').value='Tienda Local'; p.node('trasladoDestinoSelect').value='Alpha Móvil'; p.node('trasladoCantidad').value='1';
  p.run("gruposAbiertosInventario=[{nombre:'Sellado',tipo:'Perfume Sellado',tamano:'100ml',porUbicacion:{'Tienda Local':{filas:[listaProductos.find(p=>p.id===1)]}}}];grupoTrasladoActual=0;");
  await p.run('confirmarTrasladoPerfume()'); await new Promise(resolve=>setImmediate(resolve));
  const products=p.tables.productos.filter(p=>p.nombre==='Sellado');
  assert.equal(products.reduce((sum,p)=>sum+p.stock,0),3);
  assert.equal(products.find(p=>p.ubicacion_stock==='Alpha Móvil').stock,1);
  assert.equal(products.every(p=>p.precio===50),true);
});

test('cierre consulta solo al abrirlo y guarda la ubicación seleccionada', async () => {
  const p=panel(); p.node('fechaCierreInventario').value='2026-10-31';
  await p.run('cargarCierreInventario()');
  assert.ok(p.requests.some(r=>r.table==='inventario_movimientos'));
  const section={querySelectorAll:()=>[],querySelector:()=>null}; p.node('cierresInventarioPorUbicacion').children=[section];
  p.node('cierreNota-0').value='Conteo local';
  await p.run("guardarCierreInventarioUbicacion('Tienda Local',0)");
  assert.equal(p.tables.cierres_inventario_ubicaciones[0].ubicacion,'Tienda Local');
  assert.equal(p.tables.cierres_inventario_ubicaciones[0].contenido,'Conteo local');
});

test('cambios rápidos de fecha: la respuesta antigua no reemplaza el historial reciente', async () => {
  const p=panel(); await p.run('cargarProductos()');
  p.node('fechaReporteDesde').value='2026-10-31';p.node('fechaReporteHasta').value='2026-10-31';
  p.deferNext('ventas'); const old=p.run('cargarHistorial()'); await new Promise(resolve=>setImmediate(resolve));
  p.node('fechaReporteDesde').value='2026-11-02';p.node('fechaReporteHasta').value='2026-11-02';
  await p.run('cargarHistorial()');assert.equal(p.run('listaVentasCache[0].id'),11);
  p.release();await old;assert.equal(p.run('listaVentasCache[0].id'),11);
});

test('último minuto de Lima pertenece al período tanto en historial como en Excel', async () => {
  const p=panel();p.tables.ventas.push({id:12,fecha:'2026-11-01T04:59:59Z',monto_total:30,detalles:[],comprobante_url:null});
  p.tables.ventas.push({id:13,fecha:'2026-11-01T05:00:00Z',monto_total:40,detalles:[],comprobante_url:null});
  p.node('fechaReporteDesde').value='2026-10-31';p.node('fechaReporteHasta').value='2026-10-31';
  await p.run('cargarProductos()');await p.run('cargarHistorial()');await p.run('exportarExcel()');
  assert.equal(p.run('listaVentasCache.length'),2);assert.equal(p.files[0].Ventas.rows.length,3);
  assert.equal(p.files[0].Ventas.rows.slice(1).reduce((s,r)=>s+r[3],0),130);
});

test('cambio de imagen sube variantes versionadas y conserva los precios', async () => {
  const p=panel();await p.run('cargarProductos()');
  p.run("datos.imageVariants=async()=>({full:{},thumb:{}}); edicionImagenProducto={archivo:{type:'image/png'},ids:[1],producto:listaProductos.find(p=>p.id===1)};");
  await p.run('guardarImagenProducto()');
  assert.equal(p.uploads.length,2);assert.match(p.uploads[0].path,/\.thumb\.jpg$/);assert.match(p.uploads[1].path,/\.full\.jpg$/);
  assert.equal(p.uploads[0].options.cacheControl,'31536000');assert.equal(p.tables.productos[0].precio,50);
  assert.match(p.tables.productos[0].imagen_url,/\.full\.jpg$/);
  assert.equal(p.run('edicionImagenProducto'),null);
});

test('actualizar precios conserva costo y existencias; vendedor no puede editarlos', async () => {
  const p=panel();await p.run('cargarProductos()');
  const prices=['15','25','35','90'];p.sandbox.prompt=()=>prices.shift();
  await p.run('editarPreciosDecant(1)');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(p.tables.productos[0].precio_decant_5ml,25);
  assert.equal(p.tables.productos[0].precio,50);assert.equal(p.tables.productos[0].stock,3);
  p.run("usuarioActual={id:'vendedor',email:'vendedor@example.org'}");
  const count=p.requests.length;await p.run('editarPreciosDecant(1)');assert.equal(p.requests.length,count);
});

test('doble envío simultáneo del formulario no duplica venta ni descuento', async () => {
  const p=panel();await p.run('cargarProductos()');
  p.run("carritoVenta=[{tipo:'Perfume Sellado',producto_id:1,nombre:'Sellado',tamano:'100ml',cantidad:1,subtotal:100,costo_total:50}]");
  const handler=p.node('formVenta').listeners.submit;
  await Promise.all([handler({preventDefault(){}}),handler({preventDefault(){}})]);
  assert.equal(p.requests.filter(r=>r.table==='ventas'&&r.action==='insert').length,1);
  assert.equal(p.tables.productos[0].stock,2);
});

module.exports = { panel };
