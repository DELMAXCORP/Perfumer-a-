// Prueba local opcional: requiere playwright-core.
// Nunca se conectan a Supabase. Ver docs/tickets-catprinter.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');

test('Chrome: controles, vista aislada, QR, reimpresión y cancelación sin escrituras', async () => {
  const { chromium } = require('playwright-core');
  const servidor = http.createServer((req, res) => {
    const archivo = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!archivo.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(archivo, (error, datos) => {
      if (error) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', archivo.endsWith('.js') ? 'application/javascript' : archivo.endsWith('.css') ? 'text/css' : archivo.endsWith('.png') ? 'image/png' : 'text/html');
      res.end(datos);
    });
  });
  await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
  const navegador = await chromium.launch({ executablePath: process.env.ALPHA_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, timeout: 15000 });
  try {
    const pagina = await navegador.newPage();
    const errores = [];
    pagina.on('pageerror', error => errores.push(error.message));
    await pagina.route('https://**/*', route => route.fulfill(route.request().resourceType() === 'image'
      ? { contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' }
      : { contentType: 'application/javascript', body: '' }));
    await pagina.addInitScript(() => {
      if (window !== window.top) return;
      window.escrituras = 0;
      window.ventasInsertadas = 0;
      window.supabase = { createClient: () => ({
        auth: { getSession: async () => ({ data: {} }), onAuthStateChange() {} },
        from(tabla) { return {
          select() { return this; }, eq() { return this; },
          insert(filas) { this.filas = filas; return this; },
          async single() { window.ventasInsertadas++; return { data: { ...this.filas[0], id: 43, fecha: '2026-10-29T16:00:00Z' } }; },
        }; }
      }) };
      window.alert = texto => { window.ultimoAviso = texto; };
      // Simula cerrar/cancelar el diálogo, sin imprimir físicamente.
      window.impresiones = 0;
      window.addEventListener('load', () => {
        const original = window.AlphaTicket.imprimir;
        window.AlphaTicketPrueba = async (venta, opciones) => {
          const promesa = original(venta, opciones);
          document.getElementById('alpha-ticket-frame').contentWindow.print = () => { window.impresiones++; };
          await promesa;
        };
        window.AlphaTicket = { ...window.AlphaTicket, imprimir: window.AlphaTicketPrueba };
      });
    });
    await pagina.goto(`http://127.0.0.1:${servidor.address().port}/panel/index.html`, { timeout: 15000 });
    assert.equal(await pagina.locator('#corregirOrdenHojas').isChecked(), true);
    await pagina.locator('#corregirOrdenHojas').evaluate(input => { input.checked = false; });
    await pagina.evaluate(() => { usuarioActual = { email: 'vendedor@example.org' }; abrirConexionImpresora(); });
    assert.equal(await pagina.locator('#conexionImpresora').isVisible(), true);
    assert.equal(await pagina.locator('#btnReintentarTicket').isDisabled(), true);
    assert.equal(await pagina.locator('#conexionImpresora a').first().getAttribute('href'), 'ms-settings:bluetooth');
    await pagina.keyboard.press('Escape');
    assert.equal(await pagina.locator('#conexionImpresora').isVisible(), false);
    await pagina.evaluate(() => {
      usuarioActual = { email: 'vendedor@example.org' };
      document.getElementById('sec-login').classList.add('hidden');
      document.getElementById('sec-app').classList.remove('hidden');
      ultimaVentaTicket = { id: 42, fecha: '2026-10-29T15:00:00Z', monto_total: 30, detalles: [{ nombre: 'Decant real de prueba', tamano: '5ml', cantidad: 2, precio_unitario: 15, subtotal: 30 }] };
      listaVentasCache = [ultimaVentaTicket];
      document.getElementById('ticketVentaReciente').classList.remove('hidden');
    });
    assert.equal(await pagina.locator('#configTickets, #ticketQRReciente').count(), 0);
    await pagina.locator('#ticketVentaReciente button').click();
    await pagina.waitForFunction(() => window.impresiones === 1);
    const ticket = pagina.frameLocator('#alpha-ticket-frame');
    assert.equal(await ticket.locator('.qr img').count(), 1);
    assert.equal(await ticket.locator('button, nav, input').count(), 0);
    assert.match(await ticket.locator('body').innerText(), /Venta: #42/);
    assert.equal(await ticket.locator('.qr img').evaluate(img => img.complete && img.naturalWidth > 0), true);
    await pagina.evaluate(async () => { await imprimirTicket(listaVentasCache[0]); });
    assert.equal(await pagina.evaluate(() => window.impresiones), 2);
    assert.equal(await pagina.evaluate(() => window.escrituras), 0);
    assert.equal(await pagina.evaluate(() => listaVentasCache.length), 1);
    await pagina.evaluate(() => {
      reservarStockVenta = async () => [];
      comprobarMetaVentasDiaria = async () => {};
      borrarBorradorVenta = async () => {};
      actualizarOpcionesVenta = () => {};
      cargarTodo = () => {};
      sonidoVenta.play = async () => {};
      carritoVenta = [{ nombre: 'Perfume', tipo: 'Perfume Sellado', tamano: '100ml', cantidad: 1, precio_unitario: 100, costo_unitario: 50, subtotal: 100, costo_total: 50 }];
      renderizarCarrito();
    });
    assert.equal(await pagina.locator('#ticketVentaReciente').isVisible(), false);
    await pagina.locator('#formVenta').evaluate(form => form.dispatchEvent(new Event('submit', { cancelable: true })));
    await pagina.waitForFunction(() => !procesandoVenta);
    assert.equal(await pagina.locator('#ticketVentaReciente').isVisible(), true);
    assert.match(await pagina.locator('#ticketVentaEstado').innerText(), /Venta #43 registrada/);
    assert.equal(await pagina.evaluate(() => window.ventasInsertadas), 1);
    await pagina.locator('#ticketVentaReciente button').click();
    await pagina.waitForFunction(() => window.impresiones === 3);
    assert.equal(await pagina.evaluate(() => window.ventasInsertadas), 1);
    assert.equal(await pagina.evaluate(() => ultimaVentaTicket.monto_total), 100);
    assert.equal(await pagina.evaluate(() => carritoVenta.length), 0);
    await pagina.locator('#btnConectarImpresora').click();
    assert.equal(await pagina.locator('#conexionImpresora').isVisible(), true);
    assert.equal(await pagina.locator('#btnReintentarTicket').isEnabled(), true);
    await pagina.locator('#btnReintentarTicket').click();
    await pagina.waitForFunction(() => window.impresiones === 4);
    assert.equal(await pagina.locator('#conexionImpresora').isVisible(), false);
    assert.equal(await pagina.evaluate(() => window.ventasInsertadas), 1);
    assert.equal(await pagina.evaluate(() => window.escrituras), 0);
    assert.match(await pagina.frameLocator('#alpha-ticket-frame').locator('body').innerText(), /Venta: #43/);
    for (const cantidad of [3, 12]) {
      await pagina.evaluate(async cantidad => {
        await imprimirTicket({ id: 44, fecha: '2026-10-29T16:00:00Z', monto_total: cantidad * 20,
          detalles: Array.from({ length: cantidad }, (_, i) => ({ nombre: 'Producto ' + i, cantidad: 1, tamano: '5ml', precio_unitario: 20, subtotal: 20 })) });
      }, cantidad);
      const orden = await pagina.frameLocator('#alpha-ticket-frame').locator('body').evaluate(body => {
        const qr = body.querySelector('.qr').getBoundingClientRect();
        const productos = [...body.querySelectorAll('.producto')].map(p => p.getBoundingClientRect());
        const total = body.querySelector('.total').getBoundingClientRect();
        return { correcto: qr.bottom <= productos[0].top && productos.at(-1).bottom <= total.top,
          ancho: body.getBoundingClientRect().width, letra: parseFloat(getComputedStyle(body).fontSize),
          desborde: body.scrollWidth > body.clientWidth };
      });
      assert.equal(orden.correcto, true);
      assert.ok(Math.abs(orden.ancho - 46 * 96 / 25.4) < 1, 'El ticket debe caber en el papel de 48 mm con márgenes');
      assert.equal(orden.letra, 12, 'La letra compacta debe imprimirse a 9 puntos');
      assert.equal(orden.desborde, false, 'El contenido no debe salirse del ancho de papel');
      const html = await pagina.frameLocator('#alpha-ticket-frame').locator('html').evaluate(html => html.outerHTML);
      const vista = await navegador.newPage();
      await vista.setContent(html);
      await vista.locator('img').evaluate(img => img.decode());
      const pdf = await vista.pdf({ width: '48mm', height: '80mm', preferCSSPageSize: false });
      const paginas = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
      assert.ok(paginas >= 1);
      if (cantidad === 12) assert.ok(paginas > 1, 'Un ticket largo debe continuar en otra hoja sin encogerse entero');
      assert.equal(await vista.locator('body').evaluate(body => parseFloat(getComputedStyle(body).fontSize)), 12);
      assert.ok(await vista.locator('body').evaluate(body => body.getBoundingClientRect().width <= 46 * 96 / 25.4 + 1));
      await vista.close();
    }
    for (const cantidad of [1, 2, 3, 12]) {
      await pagina.evaluate(async cantidad => {
        document.getElementById('corregirOrdenHojas').checked = true;
        await imprimirTicket({ id: 45, monto_total: cantidad * 20,
          detalles: Array.from({ length: cantidad }, (_, i) => ({ nombre: 'Producto ' + i, cantidad: 1, tamano: '5ml', precio_unitario: 20, subtotal: 20 })) });
      }, cantidad);
      const frame = pagina.frameLocator('#alpha-ticket-frame');
      const datos = await frame.locator('body').evaluate(body => {
        const hojas = [...body.querySelectorAll('.hoja')];
        const fisicas = [...hojas].reverse(); // Simula la salida invertida informada por el usuario.
        return {
          paginas: hojas.map(h => Number(h.dataset.pagina)),
          productos: fisicas.flatMap(h => [...h.querySelectorAll('.producto > strong')].map(n => n.textContent)),
          primero: fisicas[0]?.querySelector('.qr') !== null,
          ultimo: fisicas.at(-1)?.querySelector('.total')?.textContent,
          cabe: hojas.every(h => h.querySelector('.contenido-hoja').getBoundingClientRect().height <= h.getBoundingClientRect().height),
          letra: parseFloat(getComputedStyle(body).fontSize)
        };
      });
      assert.ok(datos.paginas.length > 0, 'Se deben generar hojas para CatPrinter');
      assert.deepEqual(datos.paginas, Array.from({ length: datos.paginas.length }, (_, i) => datos.paginas.length - i));
      assert.deepEqual(datos.productos, Array.from({ length: cantidad }, (_, i) => 'Producto ' + i));
      assert.equal(datos.primero, true);
      assert.equal(datos.ultimo, 'TOTAL: S/ ' + (cantidad * 20).toFixed(2));
      assert.equal(datos.cabe, true);
      assert.equal(datos.letra, 12);
      const vista = await navegador.newPage();
      await vista.setContent(await frame.locator('html').evaluate(html => html.outerHTML));
      await vista.locator('img').evaluate(img => img.decode());
      const pdf = await vista.pdf({ width: '48mm', height: '80mm', preferCSSPageSize: false });
      assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, datos.paginas.length, 'Cada hoja debe producir exactamente una página, sin desbordamientos');
      await vista.close();
    }
    assert.deepEqual(errores, []);
  } finally {
    await navegador.close();
    servidor.closeAllConnections();
    await new Promise(resolve => servidor.close(resolve));
  }
});
