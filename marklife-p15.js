/* Marklife P15 solamente. Referencia de protocolo y transporte:
 * https://github.com/tomLadder/thermoprint/tree/51967b7bdf6ddfe6e64db6456fad86bf39276e9a
 * packages/core/src/device/profiles/p15.ts, protocol/l11 y transport/flow-control.ts.
 * Sin dependencias de Supabase ni acceso de escritura a ventas/inventario.
 */
(() => {
  'use strict';
  const uuid = short => `0000${short}-0000-1000-8000-00805f9b34fb`;
  const SERVICE = uuid('ff00');
  const STORAGE = 'alpha-marklife-p15-id';
  // Se limita a P15/P15R/P15S; no se incorporan los otros modelos del perfil upstream.
  const esP15 = d => /^P15/i.test(d.name || '');
  const pausa = ms => new Promise(resolve => setTimeout(resolve, ms));
  let dispositivo = null, sesion = null, conectando = null, buscando = null;
  let ocupada = false, estado = 'Desconectada', reintentos = 0, timer = null;
  let dispositivos = [], consultaTerminada = false;
  const elemento = id => document.getElementById(id);
  function mensaje(texto) { elemento('p15Mensaje').textContent = texto; }
  function resultado(texto) { elemento('p15Resultado').textContent = texto; }
  function actualizar(nuevo = estado) {
    estado = nuevo;
    const indicador = elemento('p15Estado');
    indicador.textContent = estado;
    indicador.dataset.estado = estado;
    const boton = elemento('p15Conectar');
    boton.disabled = ocupada || !!conectando || !!buscando;
    boton.textContent = sesion ? 'P15 conectada' : 'Conectar P15';
    boton.disabled ||= !!sesion;
    document.querySelectorAll('.p15-imprimir').forEach(b => { b.disabled = ocupada; });
  }
  function comprobarSoporte() {
    if (!window.isSecureContext) throw new Error('Abre Alpha mediante HTTPS para utilizar Bluetooth.');
    if (!navigator.bluetooth) throw new Error('Web Bluetooth no está disponible. Utiliza Chrome Android compatible.');
  }
  function idGuardado() { try { return localStorage.getItem(STORAGE); } catch { return null; } }
  function recordar(d) { try { localStorage.setItem(STORAGE, d.id); } catch { /* permiso BLE independiente */ } }
  function limpiar(s) {
    if (!s) return;
    for (const c of s.notificaciones) c.removeEventListener('characteristicvaluechanged', s.recibir);
    s.cancelada = true;
  }
  function programarReconexion() {
    if (timer || reintentos >= 3 || !dispositivo || document.hidden) return;
    const demora = [1000, 3000, 8000][reintentos++];
    timer = setTimeout(() => {
      timer = null;
      if (ocupada || document.hidden) return;
      void conectar(false).catch(() => programarReconexion());
    }, demora);
  }
  function desconectada() {
    const anterior = sesion;
    sesion = null;
    limpiar(anterior);
    if (anterior?.trabajo) anterior.trabajo.error = new Error('Conexión interrumpida. Revisa la etiqueta antes de volver a imprimir.');
    actualizar('Desconectada');
    mensaje('P15 desconectada. Se intentará reconectar cuando Chrome lo permita; también puedes pulsar Imprimir etiqueta.');
    if (!conectando) programarReconexion();
  }
  function usarDispositivo(d) {
    if (dispositivo === d) return;
    dispositivo?.removeEventListener('gattserverdisconnected', desconectada);
    dispositivo = d;
    dispositivo.addEventListener('gattserverdisconnected', desconectada);
  }
  async function autorizadas() {
    if (!navigator.bluetooth?.getDevices) { consultaTerminada = true; return; }
    try {
      dispositivos = (await navigator.bluetooth.getDevices()).filter(esP15);
      const guardado = idGuardado();
      const d = dispositivos.find(d => d.id === guardado) || (dispositivos.length === 1 ? dispositivos[0] : null);
      if (d && !dispositivo) usarDispositivo(d);
    } catch { /* No se abre el selector en segundo plano. */ }
    finally { consultaTerminada = true; }
  }
  async function esperar(s, condicion, limite) {
    const inicio = Date.now();
    while (!condicion() && Date.now() - inicio < limite) {
      validar(s);
      await pausa(25);
    }
    validar(s);
  }
  function validar(s) {
    if (s.cancelada || !dispositivo?.gatt?.connected) throw new Error('P15 desconectada. Revisa la etiqueta antes de volver a imprimir.');
    if (s.trabajo?.error) throw s.trabajo.error;
  }
  function conectar(permitirSelector) {
    if (sesion && dispositivo?.gatt?.connected) return Promise.resolve(sesion);
    if (conectando) return conectando;
    // requestDevice se llama directamente desde el gesto, sin esperar getDevices o Canvas.
    // Si la consulta inicial sigue pendiente, se pide otro clic una vez resuelta.
    try { comprobarSoporte(); } catch (e) { return Promise.reject(e); }
    if (!dispositivo && !consultaTerminada) return Promise.reject(new Error('Comprobando impresoras autorizadas. Vuelve a pulsar en un momento.'));
    if (!dispositivo && !permitirSelector) return Promise.reject(new Error('Conecta la P15 una primera vez desde el botón.'));
    if (!dispositivo && !buscando) {
      buscando = navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'P15' }], optionalServices: [SERVICE] });
    }
    clearTimeout(timer); timer = null;
    conectando = (async () => {
      // Ceder una microtarea permite asignar la promesa compartida antes de publicar estado.
      await Promise.resolve();
      actualizar('Conectando');
      mensaje('Conectando con Marklife P15…');
      let s;
      try {
        if (buscando) {
          const d = await buscando;
          if (!esP15(d)) throw new Error('Selecciona una Marklife P15.');
          usarDispositivo(d);
        }
        const server = await dispositivo.gatt.connect();
        const service = await server.getPrimaryService(SERVICE);
        s = { creditos: 0, ultimoCredito: Date.now(), paquete: 95, cancelada: false, notificaciones: [], trabajo: null };
        s.tx = await service.getCharacteristic(uuid('ff02'));
        if (!s.tx.properties.writeWithoutResponse) throw new Error('La P15 no permite el transporte Bluetooth requerido.');
        s.recibir = e => {
          const v = e.target.value;
          if (!v?.byteLength) return;
          const b = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
          if (b[0] === 1 && b.length >= 2) { s.creditos += b[1]; s.ultimoCredito = Date.now(); }
          if (b[0] === 2 && b.length >= 3) {
            const mtu = b[1] | (b[2] << 8);
            if (mtu > 3) s.paquete = Math.min(95, mtu - 3);
          }
          if (s.trabajo && [0xaa, 0x4f, 0x4b].includes(b[0])) s.trabajo.confirmado = true;
          if (b[0] === 0xff && b.length >= 2) {
            const errores = { 1: 'Sin papel', 2: 'Tapa abierta', 3: 'Impresora sobrecalentada', 4: 'Batería baja' };
            if (errores[b[1]]) {
              mensaje(errores[b[1]]);
              if (s.trabajo) s.trabajo.error = new Error(errores[b[1]]);
            }
          }
        };
        const rx = await service.getCharacteristic(uuid('ff01'));
        let cx;
        try { cx = await service.getCharacteristic(uuid('ff03')); }
        catch (e) { if (e.name !== 'NotFoundError') throw e; }
        for (const c of [rx, cx].filter(Boolean)) {
          c.addEventListener('characteristicvaluechanged', s.recibir);
          s.notificaciones.push(c);
          await c.startNotifications();
        }
        if (cx) await esperar(s, () => s.creditos > 0, 3000);
        validar(s);
        sesion = s;
        recordar(dispositivo);
        reintentos = 0;
        actualizar('Conectada');
        mensaje('P15 lista. Etiquetas de 40 × 12 mm; una por pulsación.');
        return s;
      } catch (e) {
        limpiar(s);
        dispositivo?.gatt?.disconnect();
        sesion = null;
        actualizar('Desconectada');
        throw e;
      }
    })().finally(() => { conectando = null; buscando = null; actualizar(); });
    return conectando;
  }
  async function enviar(s, datos) {
    s.ultimoCredito = Date.now();
    const inicio = Date.now();
    for (let offset = 0; offset < datos.length;) {
      validar(s);
      if (Date.now() - inicio > 90000) throw new Error('La transmisión tardó demasiado. Revisa la etiqueta antes de reintentar.');
      // Recuperación por falta de créditos igual que Thermoprint: uno tras 1 s.
      if (s.creditos <= 0 && Date.now() - s.ultimoCredito >= 1000) {
        s.creditos = 1; s.ultimoCredito = Date.now();
      }
      if (s.creditos > 0) {
        const parte = datos.slice(offset, offset + s.paquete);
        await s.tx.writeValueWithoutResponse(parte);
        s.creditos--; offset += parte.length;
      }
      await pausa(30);
    }
  }
  function datosEtiqueta(item) {
    const nombre = String(item.nombre || '').replace(/\s+/g, ' ').trim();
    const ml = item.ml_vendido != null ? Number(item.ml_vendido)
      : Number(String(item.tamano || '').match(/(\d+(?:[.,]\d+)?)\s*ml\b/i)?.[1]?.replace(',', '.'));
    if (!nombre || !Number.isFinite(ml) || ml <= 0) throw new Error('Este producto no tiene nombre o mililitros válidos para la etiqueta.');
    return { nombre, volumen: `${ml.toLocaleString('es-PE', { maximumFractionDigits: 2 })} ml` };
  }
  function bitmapEtiqueta(datos) {
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 96; // 40 × 12 mm, 8 puntos/mm.
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('No se pudo generar la etiqueta.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 320, 96);
    ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 21px Arial, sans-serif'; ctx.fillText('ALPHA', 160, 17);
    // Hasta dos líneas, reduciendo fuente antes de rechazar un nombre que no quepa.
    let lineas;
    for (let size = 20; size >= 11; size--) {
      ctx.font = `bold ${size}px Arial, sans-serif`;
      lineas = [''];
      for (const palabra of datos.nombre.split(' ')) {
        const i = lineas.length - 1;
        const candidata = `${lineas[i]} ${palabra}`.trim();
        if (ctx.measureText(candidata).width <= 300) lineas[i] = candidata;
        else lineas.push(palabra);
      }
      if (lineas.length <= 2 && lineas.every(l => ctx.measureText(l).width <= 300)) break;
    }
    if (lineas.length > 2 || lineas.some(l => ctx.measureText(l).width > 300)) throw new Error('El nombre es demasiado largo para una etiqueta de 40 × 12 mm legible.');
    lineas.forEach((l, i) => ctx.fillText(l, 160, lineas.length === 1 ? 49 : 40 + i * 20));
    ctx.font = 'bold 16px Arial, sans-serif'; ctx.fillText(datos.volumen, 160, 81);
    const pixels = ctx.getImageData(0, 0, 320, 96).data;
    // Rotación (x,y) -> (y,319-x), centrada en raster de 384 puntos como Thermoprint.
    const raster = new Uint8Array(48 * 320);
    for (let y = 0; y < 96; y++) for (let x = 0; x < 320; x++) {
      const p = (y * 320 + x) * 4;
      if (pixels[p] * .299 + pixels[p + 1] * .587 + pixels[p + 2] * .114 < 128) {
        const rx = y + 144, ry = 319 - x;
        raster[ry * 48 + (rx >> 3)] |= 0x80 >> (rx & 7);
      }
    }
    return raster;
  }
  async function imprimir(item) {
    if (ocupada) return;
    ocupada = true;
    actualizar();
    let s, transmitido = false;
    try {
      const datos = datosEtiqueta(item);
      // Autorizar antes de cualquier espera que pueda consumir el gesto del usuario.
      const conexion = conectar(true);
      s = await conexion;
      const raster = bitmapEtiqueta(datos);
      s.trabajo = { confirmado: false, error: null };
      resultado(`Imprimiendo ${datos.nombre} · ${datos.volumen}…`);
      const preambulo = new Uint8Array(24);
      preambulo.set([0x10, 0xff, 0x10, 0x00, 2]); // thickness=2 del perfil P15
      preambulo.set([0x10, 0xff, 0xf1, 0x02], 20); // tras 15 ceros de wakeup
      transmitido = true;
      await enviar(s, preambulo);
      await esperar(s, () => s.creditos >= 3, 1000);
      const payload = new Uint8Array(8 + raster.length + 6);
      payload.set([0x1d, 0x76, 0x30, 0, 48, 0, 0x40, 1]); // 384 × 320, 1bpp
      payload.set(raster, 8);
      payload.set([0x1d, 0x0c, 0x10, 0xff, 0xf1, 0x45], 8 + raster.length);
      await enviar(s, payload);
      await esperar(s, () => s.trabajo.confirmado, 30000);
      if (!s.trabajo.confirmado) throw new Error('La P15 no confirmó la impresión. Revisa la etiqueta antes de reintentar.');
      resultado('La P15 confirmó la impresión de una etiqueta.');
    } catch (e) {
      resultado(e.name === 'NotFoundError' && !dispositivo ? 'Selección cancelada. Pulsa Imprimir etiqueta para conectar la P15.'
        : `${e.message || 'No se pudo imprimir.'}${transmitido ? ' No se repetirá automáticamente.' : ''}`);
      // Un trabajo incompleto no debe mezclarse con el siguiente en la misma conexión.
      if (transmitido) dispositivo?.gatt?.disconnect();
    } finally {
      if (s) s.trabajo = null;
      ocupada = false;
      actualizar();
      if (!sesion && dispositivo) programarReconexion();
    }
  }
  window.AlphaP15 = Object.freeze({ imprimir, get ocupada() { return ocupada; } });
  elemento('p15Conectar').addEventListener('click', () => {
    void conectar(true).catch(e => { mensaje(e.message || 'No se pudo conectar la P15.'); });
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !ocupada && !conectando && !sesion && dispositivo) {
      reintentos = 0;
      void conectar(false).catch(e => { mensaje(e.message); programarReconexion(); });
    }
  });
  try {
    comprobarSoporte();
    void autorizadas().then(() => {
      if (dispositivo) return conectar(false).catch(() => {
        mensaje('No se pudo reconectar la P15. Enciéndela y pulsa Imprimir etiqueta.');
        programarReconexion();
      });
      if (!navigator.bluetooth.getDevices) mensaje('Este Chrome no permite recuperar dispositivos autorizados. Conecta la P15 desde un botón.');
    });
  } catch (e) { consultaTerminada = true; mensaje(e.message); }
  actualizar();
})();
