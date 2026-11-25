/* Shared read cache and opt-in diagnostics. Never caches writes or retries them. */
(function (root) {
  'use strict';
  class StaleRead extends Error { constructor() { super('Lectura reemplazada'); this.name = 'StaleRead'; } }
  class ReadCache {
    constructor(clock = Date.now) { this.clock = clock; this.entries = new Map(); this.epoch = 0; this.scope = ''; }
    setScope(scope) { if (scope !== this.scope) { this.scope = scope; this.clear(); } }
    clear() { this.epoch++; this.entries.clear(); }
    async read(key, loader, ttl = 60000) {
      const now = this.clock();
      for (const [entryKey, entryValue] of this.entries) {
        if (!entryValue.pending && entryValue.until <= now) this.entries.delete(entryKey);
      }
      const existing = this.entries.get(key);
      if (existing && (existing.pending || existing.until > now)) return existing.promise;
      const epoch = this.epoch;
      const entry = { pending: true, until: 0 };
      entry.promise = Promise.resolve().then(() => {
        if (epoch !== this.epoch) throw new StaleRead();
        return loader();
      }).then(value => {
        if (epoch !== this.epoch) throw new StaleRead();
        entry.pending = false; entry.until = this.clock() + ttl;
        return value;
      }).catch(error => { if (this.entries.get(key) === entry) this.entries.delete(key); throw error; });
      this.entries.set(key, entry);
      if (this.entries.size > 128) {
        for (const [entryKey, entryValue] of this.entries) {
          if (this.entries.size <= 128) break;
          if (!entryValue.pending) this.entries.delete(entryKey);
        }
      }
      return entry.promise;
    }
  }
  const privateCache = new ReadCache(), publicCache = new ReadCache();
  const diagnostics = { enabled: false, records: [], operation: 'sin etiqueta',
    start(label) { this.operation = String(label).replace(/[^a-z0-9_-]/gi, '').slice(0, 40); this.records = []; },
    summary() { return this.records.reduce((out, r) => { out[r.operation] = (out[r.operation] || 0) + 1; return out; }, {}); }
  };
  function message(error) {
    const status = Number(error?.status || error?.statusCode || 0);
    if (status === 402) return 'Supabase ha restringido el servicio por cuota o facturación. Intenta más tarde o contacta al administrador.';
    if (status === 401) return 'Tu sesión venció. Vuelve a iniciar sesión.';
    if (status === 403) return 'Tu usuario no tiene permiso para esta operación.';
    return 'No se pudo completar la consulta. Revisa la conexión e intenta nuevamente.';
  }
  async function result(query) {
    const response = await query;
    if (response.error) {
      const error = new Error(message({ ...response.error, status: response.status || response.error.status }));
      error.status = response.status; throw error;
    }
    return response.data;
  }
  // Iterate pages even when the project's max_rows is smaller than pageSize.
  async function all(factory, pageSize = 500, valid = () => true) {
    const rows = [];
    for (let offset = 0; ; ) {
      const page = await result(factory().range(offset, offset + pageSize - 1));
      if (!valid()) throw new StaleRead();
      if (!page?.length) return rows;
      rows.push(...page); offset += page.length;
    }
  }
  function dates(query, field, from, to, dateOnly = false) {
    if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new Error('Fecha inicial inválida');
    if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error('Fecha final inválida');
    if (from && to && from > to) throw new Error('La fecha inicial debe ser anterior a la final.');
    if (from) query = query.gte(field, dateOnly ? from : `${from}T00:00:00-05:00`);
    if (to) {
      if (dateOnly) query = query.lte(field, to);
      else {
        const next = new Date(`${to}T00:00:00-05:00`); next.setUTCDate(next.getUTCDate() + 1);
        query = query.lt(field, next.toISOString());
      }
    }
    return query;
  }
  function dayInLima(value) {
    const date = new Date(value);
    return new Date(date.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
  function thumbnail(url) {
    // Only new uploads use this naming convention; historical URLs stay intact.
    if (!url) return url;
    try { const parsed = new URL(url); if (/\/storage\/v1\/object\/public\/catalogo-imagenes\/[^?]+\.full\.jpg$/.test(parsed.pathname)) {
      parsed.pathname = parsed.pathname.replace(/\.full\.jpg$/, '.thumb.jpg'); return parsed.href;
    } } catch (_) { /* data URLs and local resources stay intact */ }
    return url;
  }
  async function imageVariants(file) {
    const url = URL.createObjectURL(file), image = new Image();
    try {
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('No se pudo leer la imagen.')); image.src = url; });
      const encode = max => new Promise((resolve, reject) => {
        const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo comprimir la imagen.')), 'image/jpeg', 0.85);
      });
      return { full: await encode(1400), thumb: await encode(360) };
    } finally { URL.revokeObjectURL(url); }
  }
  function notifyProducts() {
    publicCache.clear();
    try { root.localStorage.setItem('alpha-catalog-version', `${Date.now()}-${Math.random()}`); } catch (_) { /* memory cache still works */ }
    root.dispatchEvent?.(new Event('alpha:products'));
  }
  root.addEventListener?.('storage', event => { if (event.key === 'alpha-catalog-version') { publicCache.clear(); root.dispatchEvent(new Event('alpha:products')); } });
  function instrumentFetch() {
    const native = root.fetch.bind(root);
    return async (resource, options = {}) => {
      const url = new URL(typeof resource === 'string' ? resource : resource.url);
      const method = (options.method || resource.method || 'GET').toUpperCase();
      const started = performance.now(), epoch = privateCache.epoch;
      // Keep only service/table names. Never record query strings, object paths or bodies.
      const match = url.pathname.match(/^\/(rest\/v1|storage\/v1|auth\/v1)\/([^/]+)/);
      const route = match ? `${match[1]}/${match[1] === 'rest/v1' ? match[2] : 'recurso'}` : 'supabase';
      let response;
      try {
        response = await native(resource, options);
        if (response.ok && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) && url.pathname.startsWith('/rest/v1/')) {
          privateCache.clear();
          if (url.pathname === '/rest/v1/productos') notifyProducts();
        }
        if ([401, 402, 403].includes(response.status)) root.dispatchEvent?.(new CustomEvent('alpha:service-error', { detail: { status: response.status, epoch } }));
        return response;
      } finally {
        if (diagnostics.enabled) {
          const bytes = Number(response?.headers.get('content-length'));
          const row = { operation: diagnostics.operation, route, method, status: response?.status || 0, ms: Math.round(performance.now() - started), bytes: bytes > 0 ? bytes : null };
          row.repeated = diagnostics.records.some(r => r.route === route && r.method === method);
          diagnostics.records.push(row); if (diagnostics.records.length > 1000) diagnostics.records.shift();
          root.console?.debug('[Alpha tráfico]', row);
        }
      }
    };
  }
  const api = { ReadCache, StaleRead, privateCache, publicCache, diagnostics, message, result, all, dates, dayInLima, thumbnail, imageVariants, notifyProducts, instrumentFetch };
  root.AlphaData = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
