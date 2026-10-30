/* Tickets por el controlador de Windows. No accede a Supabase ni al inventario. */
(function () {
  'use strict';
  const escapar = valor => String(valor ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
  const numero = valor => valor !== null && valor !== undefined && String(valor).trim() !== '' && Number.isFinite(Number(valor));
  const dinero = valor => numero(valor) ? `S/ ${Number(valor).toFixed(2)}` : 'No registrado';

  const imagenQR = new URL('../assets/qr%20pagina%20ventas%20online.png', document.currentScript.src).href;

  function documento(venta) {
    const bloqueQR = '<section class="qr"><strong>ESCANEA Y VISITA ALPHA STORE</strong><img src="' + escapar(imagenQR) + '" alt="QR de Alpha Store"><div>Cat&aacute;logo y pedidos online</div></section>';
    const fecha = venta.fecha ? new Date(venta.fecha) : null;
    const detalles = Array.isArray(venta.detalles) ? venta.detalles.filter(item => item && typeof item === 'object') : [];
    const productos = detalles.length ? detalles.map(item => `<section class="producto">
      <strong>${escapar(item.nombre || 'Nombre no registrado')}</strong>
      ${item.tamano ? `<div>${escapar(item.tamano)}</div>` : ''}
      <div>Cant.: ${numero(item.cantidad) ? escapar(item.cantidad) : 'No registrada'} · P. unit.: ${dinero(item.precio_unitario)}</div>
      <div class="importe">Subtotal: ${dinero(item.subtotal)}</div>
    </section>`).join('') : `<p>${escapar(venta.producto_nombre || 'Productos no registrados')}</p><p>Venta sin desglose registrado de cantidades y precios unitarios.</p>`;
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ticket de venta</title><style>
      @page { size: auto; margin: 1mm; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: white; color: black; }
      body { width: 46mm; max-width: 100%; font: 9pt/1.2 Arial, sans-serif; overflow-wrap: anywhere; }
      .ticket { display: flow-root; }
      h1 { font-size: 10pt; text-align: center; margin: 0 0 1mm; }
      .subtitulo { font-size: 8pt; }
      p { margin: 1mm 0; }
      .producto { border-top: 1px dashed black; padding: 1mm 0; break-inside: avoid; }
      .producto:last-child { break-after: avoid; }
      .cierre { break-inside: avoid; }
      .importe { text-align: right; }
      .total { border-top: 2px solid black; padding-top: 1mm; font-size: 11pt; font-weight: bold; }
      .centrado, .qr { text-align: center; }
      .qr { break-inside: avoid; margin-top: 1mm; font-size: 8pt; }
      .qr img { display: block; width: 30mm; max-width: 100%; height: auto; padding: 3mm; margin: 1mm auto; background: white; image-rendering: pixelated; }
      .hoja { width: 46mm; height: 77mm; break-after: page; page-break-after: always; }
      .hoja:last-child { break-after: auto; page-break-after: auto; }
      .contenido-hoja { display: flow-root; }
      @media print {
        html { width: auto; }
        body { width: 100%; max-width: 56mm; color: #000; background: #fff; }
      }
    </style></head><body><article class="ticket"><h1>PERFUMERÍA ALPHA</h1><p class="centrado subtitulo">COMPROBANTE INTERNO DE VENTA</p>
      ${bloqueQR}
      <p>Venta: ${venta.id !== null && venta.id !== undefined ? '#' + escapar(venta.id) : 'Número no registrado'}</p>
      <p>Fecha: ${fecha && Number.isFinite(fecha.getTime()) ? escapar(fecha.toLocaleString('es-PE', { timeZone: 'America/Lima' })) : 'No registrada'}</p>
      <div class="productos">${productos}</div>
      <footer class="cierre"><p class="centrado">¡Gracias por tu compra!</p><p class="total">TOTAL: ${dinero(venta.monto_total)}</p></footer>
    </article></body></html>`;
  }

  function prepararHojasCatPrinter(doc) {
    const ticket = doc.querySelector('.ticket');
    const bloques = Array.from(ticket.children).flatMap(elemento =>
      elemento.classList.contains('productos') ? Array.from(elemento.children) : [elemento]);
    const hojas = doc.createElement('div');
    hojas.className = 'hojas-catprinter';
    ticket.replaceWith(hojas);
    const paginas = [];
    let contenido;
    function nuevaHoja() {
      const hoja = doc.createElement('section');
      hoja.className = 'hoja';
      hoja.dataset.pagina = String(paginas.length + 1);
      contenido = doc.createElement('div');
      contenido.className = 'contenido-hoja';
      hoja.appendChild(contenido);
      hojas.appendChild(hoja);
      paginas.push(hoja);
      return hoja;
    }
    let hoja = nuevaHoja();
    for (const bloque of bloques) {
      contenido.appendChild(bloque);
      if (contenido.getBoundingClientRect().height > hoja.getBoundingClientRect().height) {
        contenido.removeChild(bloque);
        if (contenido.children.length) hoja = nuevaHoja();
        contenido.appendChild(bloque);
        if (contenido.getBoundingClientRect().height > hoja.getBoundingClientRect().height) {
          throw new Error('Un bloque del ticket supera los 80 mm. Desactiva la corrección de hojas para imprimirlo con la paginación del navegador.');
        }
      }
    }
    // Solo se invierten las hojas completas. El texto y los productos dentro
    // de cada hoja conservan su orden para compensar la salida de CatPrinter.
    paginas.reverse().forEach(pagina => hojas.appendChild(pagina));
  }

  async function imprimir(venta, opciones = {}) {
    const contenido = documento(venta);
    // Un documento independiente evita imprimir la interfaz o datos internos.
    document.getElementById('alpha-ticket-frame')?.remove();
    const marco = document.createElement('iframe');
    marco.id = 'alpha-ticket-frame';
    marco.title = 'Ticket de venta';
    marco.setAttribute('aria-hidden', 'true');
    marco.style.cssText = 'position:fixed;width:48mm;height:1px;border:0;top:0;left:-10000px;';
    document.body.appendChild(marco);
    const destino = marco.contentWindow;
    destino.document.open();
    destino.document.write(contenido);
    destino.document.close();
    // Se conserva hasta la siguiente impresión: algunos navegadores imprimen de forma asíncrona.
    try {
      await Promise.all(Array.from(destino.document.images, imagen => imagen.decode()));
    } catch {
      throw new Error('No se pudo cargar la imagen QR del ticket. Revisa que assets/qr pagina ventas online.png esté publicada e intenta nuevamente.');
    }
    if (destino.document.fonts?.ready) await destino.document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (opciones.corregirOrdenHojas) prepararHojasCatPrinter(destino.document);
    // Respetar el papel de CatPrinter: una altura personalizada puede hacer
    // que el controlador reduzca el ticket completo para encajarlo en una hoja.
    destino.focus();
    destino.print();
  }
  window.AlphaTicket = Object.freeze({ imprimir, documento });
})();
