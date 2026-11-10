(() => {
  'use strict';

  const Core = window.AlphaStoreCore;

  const STORE_CONFIG = Object.freeze({
    name: 'ALPHA Perfumería',
    location: 'Ica, Perú',
    whatsappNumber: '51927025595' // Número oficial confirmado, con código de país.
  });

  const PRODUCT_METADATA = Object.freeze(window.ALPHA_PRODUCT_METADATA || {});
  const STORAGE_KEY = 'alpha-store-bag-v1';
  const DECANT_SIZES = [
    ['3 ml', 'precio_decant_3ml'],
    ['5 ml', 'precio_decant_5ml'],
    ['10 ml', 'precio_decant_10ml'],
    ['30 ml', 'precio_decant_30ml']
  ];

  // Misma regla de precios del panel anterior: precio guardado y, si falta,
  // precio especial por fragancia o lista por defecto.
  const DECANT_PRICE_RULES = [
    { match: /AL HARAMAIN|GOLD EDITION/, '3 ml': 25, '5 ml': 45, '10 ml': 65, '30 ml': 195 },
    { match: /LIQUID BRUN|LIQUID BRUM/, '3 ml': 20, '5 ml': 30, '10 ml': 40, '30 ml': 120 },
    { match: /VALENTINO INTENSE/, '3 ml': 30, '5 ml': 45, '10 ml': 80, '30 ml': 240 },
    { match: /9PM NIGHT OUT|NIGHT OUT/, '3 ml': 20, '5 ml': 30, '10 ml': 40, '30 ml': 120 }
  ];
  const DEFAULT_DECANT_PRICES = { '3 ml': 15, '5 ml': 25, '10 ml': 35, '30 ml': 90 };

  const FAVORITES_KEY = 'alpha-favoritos-v1';
  const state = {
    products: [],
    cart: loadCart(),
    currentProductId: null,
    // Favoritos por fragranceKey, compartidos entre sesión y pestañas.
    favorites: loadFavorites(),
    pendingBrand: ''
  };

  function loadFavorites() {
    try { const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY)); return Array.isArray(parsed) && parsed.every(k => typeof k === 'string') ? parsed : []; }
    catch { return []; }
  }
  function saveFavorites() {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites)); } catch { /* la bolsa vive en memoria */ }
    catalogCards.forEach(entry => {
      const button = entry.card.querySelector('.fav-button');
      if (!button) return;
      const active = hasFavorite(button.dataset.fragranceKey);
      button.classList.toggle('is-favorite', active);
      button.setAttribute('aria-pressed', String(active));
      button.textContent = active ? '❤' : '♡';
    });
    if (typeof renderRowStatus === 'function') renderRowStatus();
    if (typeof favoritesOnly === 'function' && favoritesOnly()) renderCatalog();
  }
  function hasFavorite(key) { return state.favorites.includes(key); }
  function toggleFavorite(key) {
    state.favorites = hasFavorite(key) ? state.favorites.filter(k => k !== key) : [...state.favorites, key];
    saveFavorites();
  }
  // Nombre actual de una fragancia favorita para el mensaje de WhatsApp.
  function favoriteProducts() {
    return state.favorites
      .map(key => state.products.find(item => item.fragranceKey === key && item.presentation === 'completo'))
      .filter(Boolean);
  }

  const elements = {
    filters: document.getElementById('filters'),
    search: document.getElementById('search'),
    category: document.getElementById('category-filter'),
    brand: document.getElementById('brand-filter'),
    priceMin: document.getElementById('price-min'),
    priceMax: document.getElementById('price-max'),
    productGrid: document.getElementById('product-grid'),
    resultCount: document.getElementById('result-count'),
    catalogEmpty: document.getElementById('catalog-empty'),
    catalogError: document.getElementById('catalog-error'),
    productDialog: document.getElementById('product-dialog'),
    productDetail: document.getElementById('product-detail'),
    bagDialog: document.getElementById('bag-dialog'),
    bagItems: document.getElementById('bag-items'),
    bagCount: document.getElementById('bag-count'),
    bagSubtotal: document.getElementById('bag-subtotal'),
    bagTotal: document.getElementById('bag-total'),
    bagSummary: document.getElementById('bag-summary'),
    copyOrder: document.getElementById('copy-order'),
    shareCart: document.getElementById('share-cart'),
    sendWhatsapp: document.getElementById('send-whatsapp'),
    bagFeedback: document.getElementById('bag-feedback'),
    toast: document.getElementById('toast'),
    customerDialog: document.getElementById('customer-dialog'),
    customerForm: document.getElementById('customer-form'),
    customerName: document.getElementById('customer-name'),
    customerPhone: document.getElementById('customer-phone'),
    customerDelivery: document.getElementById('customer-delivery'),
    bagFeedback: document.getElementById('bag-feedback'),
    toast: document.getElementById('toast'),
    customerDialog: document.getElementById('customer-dialog'),
    customerForm: document.getElementById('customer-form'),
    customerName: document.getElementById('customer-name'),
    customerPhone: document.getElementById('customer-phone'),
    customerDelivery: document.getElementById('customer-delivery'),
    customerFeedback: document.getElementById('customer-feedback'),
    closeCustomer: document.getElementById('close-customer'),
    cancelCustomer: document.getElementById('cancel-customer'),
    favoritesToggle: document.getElementById('favorites-toggle'),
    requestFavorites: document.getElementById('request-favorites')
  };

  function normalize(value) {
    return Core.normalize(value);
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
  }

  function safeImageUrl(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/.test(text)) return text;
    try {
      const url = new URL(text, window.location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function numericPrice(value) {
    return Core.numericPrice(value);
  }

  function formatMoney(value) {
    const price = numericPrice(value);
    return price === null ? 'Precio pendiente' : `S/ ${price.toFixed(2)}`;
  }

  function defaultDecantPrice(name, size) {
    const upper = normalize(name).toUpperCase();
    const rule = DECANT_PRICE_RULES.find(item => item.match.test(upper));
    return numericPrice((rule || DEFAULT_DECANT_PRICES)[size]);
  }

  function getMetadata(name) {
    const saved = PRODUCT_METADATA[normalize(name)] || {};
    return {
      brand: saved.brand || 'Marca pendiente de confirmar',
      category: ['arabes', 'disenador'].includes(saved.category) ? saved.category : 'sin-clasificar',
      description: saved.description || 'Descripción del producto pendiente de confirmar.',
      notes: saved.notes || null,
      sourceName: saved.sourceName || '',
      sourceUrl: safeImageUrl(saved.sourceUrl)
    };
  }

  function categoryLabel(category) {
    return ({
      arabes: 'Perfume árabe',
      disenador: 'De diseñador',
      decants: 'Decant',
      'sin-clasificar': 'Categoría pendiente'
    })[category] || 'Categoría pendiente';
  }

  function buildProducts(rows) {
    const sealedGroups = new Map();
    const fragrances = new Map();

    rows.forEach(row => {
      const type = normalize(row.tipo);
      const name = String(row.nombre || '').trim();
      if (!name) return;
      if (type !== 'perfume sellado' && type !== 'perfume para decant') return;
      const fragranceKey = normalize(name);
      if (!fragrances.has(fragranceKey)) fragrances.set(fragranceKey, { name, rows: [] });
      fragrances.get(fragranceKey).rows.push(row);
      if (type !== 'perfume sellado') return;
      const groupKey = `${fragranceKey}|${normalize(String(row.tamano || '').trim())}`;
      if (!sealedGroups.has(groupKey)) sealedGroups.set(groupKey, []);
      sealedGroups.get(groupKey).push(row);
    });

    const products = [];
    sealedGroups.forEach((group, groupKey) => {
      const first = group[0];
      const metadata = getMetadata(first.nombre);
      const priced = group.find(item => numericPrice(item.precio_venta) !== null);
      const image = group.map(item => safeImageUrl(item.imagen_url)).find(Boolean) || '';
      products.push({
        id: `completo|${groupKey}`,
        fragranceKey: normalize(first.nombre),
        name: first.nombre,
        brand: metadata.brand,
        category: metadata.category,
        description: metadata.description,
        notes: metadata.notes,
        sourceName: metadata.sourceName,
        sourceUrl: metadata.sourceUrl,
        presentation: 'completo',
        presentationLabel: 'Perfume completo',
        size: first.tamano || 'Cantidad pendiente',
        price: priced ? numericPrice(priced.precio_venta) : null,
        available: group.some(item => item.agotado !== true),
        image,
        sourceIds: group.map(item => item.id)
      });
    });

    fragrances.forEach((fragrance, fragranceKey) => {
      const metadata = getMetadata(fragrance.name);
      const referenceImage = fragrance.rows.map(item => safeImageUrl(item.imagen_url)).find(Boolean) || '';
      DECANT_SIZES.forEach(([size, field]) => {
        const stored = fragrance.rows.map(item => numericPrice(item[field])).find(value => value !== null);
        const price = size === '30 ml'
          ? window.AlphaDecantPricing.price30ml(fragrance.name)
          : stored ?? defaultDecantPrice(fragrance.name, size);
        if (price === null) return;
        products.push({
          id: `decant|${fragranceKey}|${size}`,
          fragranceKey,
          name: fragrance.name,
          brand: metadata.brand,
          category: 'decants',
          fragranceCategory: metadata.category,
          description: metadata.description,
          notes: metadata.notes,
          sourceName: metadata.sourceName,
          sourceUrl: metadata.sourceUrl,
          presentation: 'decant',
          presentationLabel: 'Decant',
          size,
          price,
          available: true,
          image: '',
          referenceImage,
          sourceIds: fragrance.rows.map(item => item.id)
        });
      });
    });

    return products.sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      const nameOrder = a.name.localeCompare(b.name, 'es-PE');
      if (nameOrder) return nameOrder;
      if (a.presentation !== b.presentation) return a.presentation === 'completo' ? -1 : 1;
      return (a.price ?? Infinity) - (b.price ?? Infinity);
    });
  }

  function updateBrandOptions() {
    const selected = state.pendingBrand || elements.brand.value;
    const brands = [...new Set(state.products
      .map(item => item.brand)
      .filter(brand => brand && brand !== 'Marca pendiente de confirmar'))]
      .sort((a, b) => a.localeCompare(b, 'es-PE'));
    const optionsSignature = brands.join('|');
    if (optionsSignature === elements.brand.dataset.options && !state.pendingBrand) return;
    elements.brand.dataset.options = optionsSignature;
    const allOption = document.createElement('option');
    allOption.value = 'all'; allOption.textContent = 'Todas';
    elements.brand.replaceChildren(allOption);
    brands.forEach(brand => {
      const option = document.createElement('option');
      option.value = brand; option.textContent = brand;
      elements.brand.append(option);
    });
    const match = [...elements.brand.options].some(option => option.value === selected);
    elements.brand.value = match ? selected : 'all';
    state.pendingBrand = '';
  }

  function favoritesOnly() {
    return elements.favoritesToggle.getAttribute('aria-pressed') === 'true';
  }

  function getFilteredProducts() {
    const query = normalize(elements.search.value);
    const category = elements.category.value;
    const brand = elements.brand.value === '' ? 'all' : elements.brand.value;
    const min = elements.priceMin.value === '' ? null : Number(elements.priceMin.value);
    const max = elements.priceMax.value === '' ? null : Number(elements.priceMax.value);

    const bases = state.products.filter(product => product.presentation === 'completo');
    const onlyFavorites = favoritesOnly()
      ? bases.filter(product => hasFavorite(product.fragranceKey))
      : bases;
    return Core.filterProducts(onlyFavorites, { query, category, brand, presentation: 'all', min, max });
  }

  function makeFallbackMedia(name) {
    const fallback = document.createElement('span');
    fallback.className = 'media-placeholder';
    fallback.textContent = String(name || 'A').slice(0, 1).toLocaleUpperCase('es-PE');
    return fallback;
  }

  function makeProductMedia(product) {
    const media = document.createElement('button');
    media.type = 'button';
    media.className = `product-media${product.presentation === 'decant' ? ' decant-media' : ''}`;
    media.setAttribute('aria-label', `Ver ficha de ${product.name}, ${product.presentationLabel} ${product.size}`);

    const badge = document.createElement('span');
    badge.className = 'product-badge';
    badge.textContent = product.presentationLabel;
    media.append(badge);

    if (product.presentation === 'decant') {
      const visual = document.createElement('span');
      visual.className = 'mini-decant';
      visual.dataset.size = product.size;
      media.append(visual);
      const note = document.createElement('span');
      note.className = 'media-note';
      note.textContent = 'Representación de la presentación';
      media.append(note);
    } else if (product.image) {
      const image = document.createElement('img');
      image.src = AlphaData.thumbnail(product.image);
      image.width = 360; image.height = 360;
      image.alt = `Fotografía disponible de ${product.name}`;
      image.loading = 'lazy';
      image.addEventListener('error', () => image.replaceWith(makeFallbackMedia(product.name)), { once: true });
      media.append(image);
    } else {
      media.append(makeFallbackMedia(product.name));
    }

    media.addEventListener('click', () => openProduct(product.id));
    return media;
  }

  function makeFavoriteButton(product) {
    const favorite = document.createElement('button');
    favorite.type = 'button';
    favorite.className = 'fav-button';
    favorite.dataset.fragranceKey = product.fragranceKey;
    const sync = () => {
      const active = hasFavorite(product.fragranceKey);
      favorite.classList.toggle('is-favorite', active);
      favorite.setAttribute('aria-pressed', String(active));
      favorite.setAttribute('aria-label', `${active ? 'Quitar de' : 'Añadir a'} favoritos ${product.name}`);
      favorite.textContent = active ? '❤' : '♡';
    };
    sync();
    favorite.addEventListener('click', () => toggleFavorite(product.fragranceKey));
    return favorite;
  }

  function makeProductCard(product) {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.append(makeProductMedia(product));
    card.append(makeFavoriteButton(product));

    const info = document.createElement('div');
    info.className = 'product-info';
    const kicker = document.createElement('p');
    kicker.className = 'product-kicker';
    kicker.textContent = categoryLabel(product.category);
    const title = document.createElement('h3');
    title.textContent = product.name;
    const meta = document.createElement('p');
    meta.className = 'product-meta';
    meta.textContent = [product.brand !== 'Marca pendiente de confirmar' ? product.brand : '', product.presentationLabel, product.size].filter(Boolean).join(' · ');
    const price = document.createElement('p');
    price.className = 'product-price';
    price.textContent = formatMoney(product.price);
    const availability = document.createElement('p');
    availability.className = `product-status${product.available ? '' : ' decant-only'}`;
    availability.textContent = product.available ? 'Disponible para consulta' : 'Disponible en decants';
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const detailButton = document.createElement('button');
    detailButton.type = 'button';
    detailButton.className = 'button button-secondary';
    detailButton.textContent = 'Ver características';
    detailButton.addEventListener('click', () => openProduct(product.id));
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'button button-primary';
    const canBuy = product.available && product.price !== null;
    if (!canBuy && product.price !== null) {
      addButton.textContent = 'Ver decants';
      addButton.addEventListener('click', () => openProduct(product.id));
    } else {
      addButton.textContent = product.price === null ? 'Precio pendiente' : 'Añadir al carrito';
      addButton.disabled = !canBuy;
      addButton.addEventListener('click', () => addToCart(product, 1));
    }
    actions.append(detailButton, addButton);
    info.append(kicker, title, meta, price, availability, actions);
    card.append(info);
    return card;
  }

  // Filtros compartibles: el estado de los filtros vive en la URL.
  function syncFiltersUrl() {
    const params = new URLSearchParams();
    const query = elements.search.value.trim();
    if (query) params.set('q', query);
    if (elements.category.value !== 'all') params.set('cat', elements.category.value);
    if (elements.brand.value && elements.brand.value !== 'all') params.set('marca', elements.brand.value);
    if (favoritesOnly()) params.set('favs', '1');
    if (elements.priceMin.value) params.set('min', elements.priceMin.value);
    if (elements.priceMax.value) params.set('max', elements.priceMax.value);
    const queryString = params.toString();
    history.replaceState(null, '', queryString ? `?${queryString}` : location.pathname);
  }

  function loadFiltersFromUrl() {
    try {
      const params = new URLSearchParams(location.search);
      elements.search.value = params.get('q') || '';
      elements.category.value = ['all', 'arabes', 'disenador', 'sin-clasificar'].includes(params.get('cat')) ? params.get('cat') : 'all';
      state.pendingBrand = params.get('marca') || '';
      if (params.get('favs') === '1') elements.favoritesToggle.setAttribute('aria-pressed', 'true');
      elements.priceMin.value = params.get('min') || '';
      elements.priceMax.value = params.get('max') || '';
    } catch { /* la URL queda intacta */
    }
  }

  // Actualiza el botón de pedir favoritos con el conteo actual.
  function renderRowStatus() {
    const count = favoriteProducts().length;
    elements.requestFavorites.disabled = count === 0;
    elements.requestFavorites.textContent = count === 1 ? '❤ Pedir mi favorito por WhatsApp' : `❤ Pedir ${count} favoritos por WhatsApp`;
  }

  // Ficha estructurada para Google: catálogo con marca, precio y disponibilidad reales.
  function injectCatalogSchema() {
    const items = state.products
      .filter(product => product.presentation === 'completo')
      .map((product, index) => ({
        '@type': 'Product',
        name: product.name,
        brand: { '@type': 'Brand', name: product.brand },
        description: product.description,
        category: categoryLabel(product.category),
        position: index + 1,
        offers: {
          '@type': 'Offer',
          price: product.price,
          priceCurrency: 'PEN',
          availability: product.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
        }
      }));
    if (!items.length) return;
    let node = document.getElementById('catalog-schema');
    if (!node) {
      node = document.createElement('script');
      node.type = 'application/ld+json';
      node.id = 'catalog-schema';
      document.head.append(node);
    }
    node.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `Catálogo de ${STORE_CONFIG.name}`,
      numberOfItems: items.length,
      itemListElement: items
    });
  }

  const catalogCards = new Map();
  function renderCatalog() {
    const products = getFilteredProducts();
    elements.productGrid.replaceChildren();
    elements.productGrid.setAttribute('aria-busy', 'false');
    elements.catalogError.hidden = true;
    elements.resultCount.textContent = `${products.length} ${products.length === 1 ? 'presentación' : 'presentaciones'}`;
    elements.catalogEmpty.hidden = products.length > 0;
    elements.productGrid.hidden = products.length === 0;
    products.forEach(product => {
      const signature = JSON.stringify(product);
      let entry = catalogCards.get(product.id);
      if (!entry || entry.signature !== signature) { entry = { signature, card: makeProductCard(product) }; catalogCards.set(product.id, entry); }
      elements.productGrid.append(entry.card);
    });
    syncFiltersUrl();
    renderRowStatus();
  }

  function productDetailMedia(product) {
    if (product.presentation === 'decant') {
      return `<div class="detail-media decant-detail"><span class="mini-decant" data-size="${escapeHTML(product.size)}"></span><span class="media-note">Representación de la presentación. No es una foto del producto final.</span></div>`;
    }
    if (product.image) {
      return `<div class="detail-media"><img width="1400" height="1400" src="${escapeHTML(product.image)}" alt="Fotografía disponible de ${escapeHTML(product.name)}"></div>`;
    }
    return `<div class="detail-media"><span class="media-placeholder" aria-label="Fotografía pendiente">${escapeHTML(product.name.slice(0, 1).toUpperCase())}</span></div>`;
  }

  function notesMarkup(product) {
    if (!product.notes) return '<p>Notas olfativas pendientes de confirmar.</p>';
    const source = product.sourceUrl
      ? `<a class="notes-source" href="${escapeHTML(product.sourceUrl)}" target="_blank" rel="noopener noreferrer">Fuente: ${escapeHTML(product.sourceName || 'ficha consultada')}</a>`
      : '';
    return `<dl class="notes-pyramid">
      <div><dt>Salida</dt><dd>${escapeHTML(product.notes.top)}</dd></div>
      <div><dt>Corazón</dt><dd>${escapeHTML(product.notes.heart)}</dd></div>
      <div><dt>Fondo</dt><dd>${escapeHTML(product.notes.base)}</dd></div>
    </dl>${source}`;
  }

  function openWhatsapp(message) {
    const number = STORE_CONFIG.whatsappNumber.replace(/\D/g, '');
    const text = encodeURIComponent(message);
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (isMobile) {
      window.open(`https://wa.me/${number}?text=${text}`, '_blank', 'noopener,noreferrer');
    } else {
      window.open(`https://web.whatsapp.com/send?phone=${number}&text=${text}`, '_blank', 'noopener,noreferrer');
    }
  }

  function decantOptionsMarkup(product) {
    const rows = DECANT_SIZES.map(([size]) => {
      const variant = state.products.find(item => item.fragranceKey === product.fragranceKey && item.presentation === 'decant' && item.size === size);
      const name = escapeHTML(product.name);
      if (variant && variant.price !== null) {
        return `
        <li class="decant-row">
          <span class="decant-size">${escapeHTML(size)}</span>
          <span class="decant-price">${escapeHTML(formatMoney(variant.price))}</span>
          <button class="button button-secondary decant-add" type="button" data-decant-id="${escapeHTML(variant.id)}" aria-label="Añadir decant de ${escapeHTML(size)} de ${name} a la bolsa">Añadir</button>
        </li>`;
      }
      return `
        <li class="decant-row">
          <span class="decant-size">${escapeHTML(size)}</span>
          <span class="decant-price pending">Precio por confirmar</span>
          <button class="button button-quiet decant-consult" type="button" data-consult-size="${escapeHTML(size)}" aria-label="Consultar por WhatsApp el precio del decant de ${escapeHTML(size)} de ${name}">Consultar</button>
        </li>`;
    }).join('');
    return `<ul class="decant-list">${rows}</ul><p class="decant-note">Decants presentados en atomizador. Los precios por confirmar se cotizan por WhatsApp.</p>`;
  }

  function openProduct(productId) {
    const product = state.products.find(item => item.id === productId);
    if (!product) return;
    state.currentProductId = product.id;
    const canAdd = product.available && product.price !== null;
    const availabilityLabel = product.available ? 'Disponible para consulta' : 'Disponible en decants';
    elements.productDetail.innerHTML = `
      <div class="detail-layout">
        ${productDetailMedia(product)}
        <div class="detail-copy">
          <p class="eyebrow">${escapeHTML(categoryLabel(product.category))}</p>
          <h2 id="product-dialog-title">${escapeHTML(product.name)}</h2>
          <p class="detail-brand">${escapeHTML(product.brand)}</p>
          <p class="detail-description">${escapeHTML(product.description)}</p>
          <dl class="detail-facts">
            <div><dt>Presentación</dt><dd>${escapeHTML(product.presentationLabel)}</dd></div>
            <div><dt>Cantidad</dt><dd>${escapeHTML(product.size)}</dd></div>
            <div><dt>Precio</dt><dd>${escapeHTML(formatMoney(product.price))}</dd></div>
            <div><dt>Disponibilidad</dt><dd>${escapeHTML(availabilityLabel)}</dd></div>
          </dl>
          <div class="detail-buy">
            <div><p class="detail-price">${escapeHTML(formatMoney(product.price))}</p><p class="product-status${product.available ? '' : ' decant-only'}">${escapeHTML(availabilityLabel)}</p></div>
            <div class="quantity-control" aria-label="Cantidad"><button type="button" data-detail-decrease aria-label="Reducir cantidad">−</button><input id="detail-quantity" value="1" min="1" max="99" inputmode="numeric" aria-label="Cantidad"><button type="button" data-detail-increase aria-label="Aumentar cantidad">+</button></div>
            <button class="button button-primary" id="detail-add" type="button" ${canAdd ? '' : 'disabled'}>${product.price === null ? 'Precio pendiente' : product.available ? 'Añadir al carrito' : 'Disponible en decants'}</button>
            <button class="button button-secondary" id="detail-consult" type="button">Consultar por WhatsApp</button>
            <p class="detail-disclaimer">Añadir al carrito no reserva el producto. La disponibilidad y el pedido se confirman durante la atención por WhatsApp.</p>
          </div>
          <div class="decant-options">
            <h3>Opciones de decant</h3>
            ${decantOptionsMarkup(product)}
          </div>
          <div class="olfactory"><h3>Notas olfativas</h3>${notesMarkup(product)}</div>
        </div>
      </div>`;

    elements.productDetail.querySelectorAll('[data-decant-id]').forEach(button => button.addEventListener('click', () => {
      const decant = state.products.find(item => item.id === button.dataset.decantId);
      if (decant) addToCart(decant, 1);
    }));
    elements.productDetail.querySelectorAll('[data-consult-size]').forEach(button => button.addEventListener('click', () => {
      openWhatsapp(`Hola, ${STORE_CONFIG.name}. Quisiera consultar el precio del decant de ${button.dataset.consultSize} de ${product.name}.`);
    }));
    const quantityInput = document.getElementById('detail-quantity');
    elements.productDetail.querySelector('[data-detail-decrease]').addEventListener('click', () => { quantityInput.value = Math.max(1, Number(quantityInput.value) - 1); });
    elements.productDetail.querySelector('[data-detail-increase]').addEventListener('click', () => { quantityInput.value = Math.min(99, Number(quantityInput.value) + 1); });
    quantityInput.addEventListener('change', () => { quantityInput.value = Math.max(1, Math.min(99, Math.floor(Number(quantityInput.value) || 1))); });
    document.getElementById('detail-add').addEventListener('click', () => addToCart(product, Number(quantityInput.value) || 1));
    document.getElementById('detail-consult').addEventListener('click', () => openWhatsapp(`Hola, ${STORE_CONFIG.name}. Quisiera más información sobre ${product.name} (${product.presentationLabel} ${product.size}).`));

    if (!elements.productDialog.open) elements.productDialog.showModal();
    elements.productDialog.scrollTop = 0;
  }

  function loadCart() {
    return Core.deserializeCart(localStorage.getItem(STORAGE_KEY));
  }

  function saveCart() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cart));
  }

  function addToCart(product, quantity) {
    if (!product.available || product.price === null) return;
    const amount = Math.min(99, Math.max(1, Math.floor(Number(quantity) || 1)));
    const cartImage = product.presentation === 'completo' ? product.image : (product.referenceImage || product.image || '');
    state.cart = Core.addItem(state.cart, {
      id: product.id,
      name: product.name,
      presentation: product.presentation,
      presentationLabel: product.presentationLabel,
      size: product.size,
      price: product.price,
      image: cartImage.startsWith('data:') ? '' : cartImage
    }, amount);
    saveCart();
    renderBag();
    showToast(`${product.name} se añadió al carrito.`);
  }

  function updateCartQuantity(id, delta) {
    state.cart = Core.updateQuantity(state.cart, id, delta);
    saveCart();
    renderBag();
  }

  function removeFromCart(id) {
    state.cart = Core.removeItem(state.cart, id);
    saveCart();
    renderBag();
  }

  function resolveCartImage(item) {
    if (safeImageUrl(item.image)) return item.image;
    const product = state.products.find(entry => entry.id === item.id);
    if (product) {
      const candidate = product.presentation === 'completo' ? product.image : (product.referenceImage || product.image || '');
      if (safeImageUrl(candidate)) return candidate;
    }
    return '';
  }

  function makeBagFallback(name) {
    const fallback = document.createElement('span');
    fallback.className = 'bag-item-fallback';
    fallback.textContent = String(name || 'A').slice(0, 1).toUpperCase();
    return fallback;
  }

  function makeBagVisual(item) {
    const visual = document.createElement('div');
    visual.className = 'bag-item-visual';
    const imageSource = resolveCartImage(item);
    if (safeImageUrl(imageSource)) {
      const image = document.createElement('img');
      image.src = AlphaData.thumbnail(safeImageUrl(imageSource));
      image.width = 80; image.height = 80;
      image.alt = '';
      image.addEventListener('error', () => image.replaceWith(makeBagFallback(item.name)), { once: true });
      visual.append(image);
    } else if (item.presentation === 'decant') {
      const decant = document.createElement('span');
      decant.className = 'bag-decant';
      visual.append(decant);
    } else {
      visual.append(makeBagFallback(item.name));
    }
    return visual;
  }

  function renderBag() {
    const { units, amount: subtotal } = Core.cartTotals(state.cart);
    elements.bagCount.textContent = String(units);
    elements.bagCount.setAttribute('aria-label', `${units} ${units === 1 ? 'producto' : 'productos'} en el carrito`);
    elements.bagSubtotal.textContent = `S/ ${subtotal.toFixed(2)}`;
    elements.bagTotal.textContent = `S/ ${subtotal.toFixed(2)}`;
    elements.bagItems.replaceChildren();
    elements.copyOrder.disabled = state.cart.length === 0;
    elements.shareCart.hidden = !('share' in navigator) || state.cart.length === 0;
    elements.shareCart.disabled = state.cart.length === 0;
    elements.sendWhatsapp.disabled = state.cart.length === 0 || !STORE_CONFIG.whatsappNumber;
    elements.sendWhatsapp.textContent = STORE_CONFIG.whatsappNumber ? 'Enviar resumen por WhatsApp' : 'WhatsApp pendiente de confirmar';

    if (!state.cart.length) {
      const empty = document.createElement('div');
      empty.className = 'bag-empty';
      empty.innerHTML = '<span aria-hidden="true">◇</span><h3>Tu carrito está vacío</h3><p>Explora la colección y añade una presentación para preparar tu pedido.</p><button class="button button-secondary" type="button">Ir a la colección</button>';
      empty.querySelector('button').addEventListener('click', () => { elements.bagDialog.close(); document.getElementById('coleccion').scrollIntoView(); });
      elements.bagItems.append(empty);
      return;
    }

    state.cart.forEach(item => {
      const row = document.createElement('article');
      row.className = 'bag-item';
      row.append(makeBagVisual(item));
      const main = document.createElement('div');
      main.className = 'bag-item-main';
      const title = document.createElement('h3');
      title.textContent = item.name;
      const meta = document.createElement('p');
      meta.textContent = `${item.presentationLabel} · ${item.size} · ${formatMoney(item.price)} c/u`;
      const controls = document.createElement('div');
      controls.className = 'bag-item-controls';
      const quantity = document.createElement('div');
      quantity.className = 'quantity-control';
      const decrease = document.createElement('button');
      decrease.type = 'button'; decrease.textContent = '−'; decrease.setAttribute('aria-label', `Reducir cantidad de ${item.name}`);
      decrease.addEventListener('click', () => updateCartQuantity(item.id, -1));
      const amount = document.createElement('span');
      amount.textContent = String(item.quantity); amount.setAttribute('aria-label', `Cantidad ${item.quantity}`);
      const increase = document.createElement('button');
      increase.type = 'button'; increase.textContent = '+'; increase.setAttribute('aria-label', `Aumentar cantidad de ${item.name}`);
      increase.addEventListener('click', () => updateCartQuantity(item.id, 1));
      quantity.append(decrease, amount, increase);
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'remove-item'; remove.textContent = 'Retirar';
      remove.setAttribute('aria-label', `Retirar ${item.name} de la bolsa`);
      remove.addEventListener('click', () => removeFromCart(item.id));
      const itemTotal = document.createElement('strong');
      itemTotal.className = 'bag-item-total'; itemTotal.textContent = `S/ ${(item.price * item.quantity).toFixed(2)}`;
      controls.append(quantity, remove, itemTotal);
      main.append(title, meta, controls);
      row.append(main);
      elements.bagItems.append(row);
    });
  }

  function orderSummary(customer) {
    return Core.createOrderSummary(state.cart, STORE_CONFIG.name, customer);
  }

  async function copyOrderSummary() {
    if (!state.cart.length) return;
    const summary = orderSummary();
    try {
      await navigator.clipboard.writeText(summary);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = summary;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    elements.bagFeedback.textContent = 'Resumen copiado. Puedes pegarlo en el canal oficial cuando sea confirmado.';
  }

  async function shareCartSummary() {
    if (!state.cart.length) return;
    const summary = orderSummary();
    if (!navigator.share) {
      elements.bagFeedback.textContent = 'La función de compartir no está disponible en este navegador.';
      return;
    }
    try {
      await navigator.share({ title: `${STORE_CONFIG.name} - Carrito`, text: summary });
      elements.bagFeedback.textContent = 'Carrito compartido.';
    } catch (error) {
      if (error && error.name !== 'AbortError') {
        elements.bagFeedback.textContent = 'No se pudo compartir el carrito.';
      }
    }
  }
  function sendWhatsapp() {
    if (!state.cart.length || !STORE_CONFIG.whatsappNumber) return;
    elements.customerName.value = '';
    elements.customerPhone.value = '';
    elements.customerDelivery.value = '';
    elements.customerFeedback.textContent = '';
    if (!elements.customerDialog.open) elements.customerDialog.showModal();
    elements.customerDialog.scrollTop = 0;
  }

  async function submitCustomerForm(event) {
    event.preventDefault();
    const name = elements.customerName.value.trim();
    const phone = elements.customerPhone.value.trim().replace(/\D/g, '');
    const delivery = elements.customerDelivery.value.trim();
    if (!name) {
      elements.customerFeedback.textContent = 'Ingresa tu nombre.';
      return;
    }
    if (phone.length < 9) {
      elements.customerFeedback.textContent = 'Ingresa un número de celular válido.';
      return;
    }
    if (!delivery) {
      elements.customerFeedback.textContent = 'Selecciona la forma de entrega.';
      return;
    }
    if (submittingCustomer) return;
    submittingCustomer = true;
    const customer = { name, phone, delivery };
    openWhatsapp(orderSummary(customer));
    try {
      if (window.supabaseClient) {
        await window.supabaseClient.from('contactos').insert({
          nombre: name,
          telefono: phone,
          forma_entrega: delivery,
          pedido_resumen: orderSummary(customer),
          estado: 'pendiente'
        });
      }
    } catch (error) {
      // La tabla puede no existir aún; el envío de WhatsApp no se interrumpe.
      console.warn('Registro de contacto no disponible.');
    } finally { submittingCustomer = false; }
    elements.customerDialog.close();
    showToast('Mensaje enviado. ¡Gracias por tu pedido!');
  }

  let toastTimer;
  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    toastTimer = window.setTimeout(() => { elements.toast.hidden = true; }, 2400);
  }

  function clearFilters() {
    elements.filters.reset();
    elements.favoritesToggle.setAttribute('aria-pressed', 'false');
    window.setTimeout(renderCatalog, 0);
  }

  function showCatalogError() {
    elements.productGrid.hidden = true;
    elements.catalogEmpty.hidden = true;
    elements.catalogError.hidden = false;
    elements.resultCount.textContent = 'Catálogo no disponible';
  }

  let catalogLoading = null;
  async function requestCatalog() {
    elements.catalogError.hidden = true;
    elements.productGrid.hidden = false;
    elements.productGrid.setAttribute('aria-busy', 'true');
    elements.resultCount.textContent = 'Cargando colección…';
    try {
      if (!window.supabaseClient) throw new Error('El cliente de catálogo no está disponible.');
      const epoch = AlphaData.publicCache.epoch;
      const data = await AlphaData.publicCache.read('catalogo', () => AlphaData.all(() => window.supabaseClient
        .from('catalogo_publico')
        .select('id,nombre,tipo,tamano,precio_venta,imagen_url,audio_url,agotado,precio_decant_3ml,precio_decant_5ml,precio_decant_10ml,precio_decant_30ml')
        .order('nombre', { ascending: true }).order('id'), 500, () => epoch === AlphaData.publicCache.epoch), 60000);
      state.products = buildProducts(data || []);
      updateBrandOptions();
      injectCatalogSchema();
      renderCatalog();
    } catch (error) {
      if (error instanceof AlphaData.StaleRead) return;
      console.error('No se pudo cargar el catálogo público.');
      showCatalogError();
      elements.catalogError.querySelector('p').textContent = error.message || AlphaData.message(error);
    }
  }

  function loadCatalog() {
    if (catalogLoading) return catalogLoading;
    catalogLoading = requestCatalog().finally(() => { catalogLoading = null; });
    return catalogLoading;
  }
  window.addEventListener('alpha:products', () => {
    AlphaData.publicCache.clear();
    if (catalogLoading) catalogLoading.finally(loadCatalog); else loadCatalog();
  });
  let submittingCustomer = false;
  document.getElementById('mobile-open-bag').addEventListener('click', () => document.getElementById('open-bag').click());
  const mobileCount = document.getElementById('mobile-bag-count');
  new MutationObserver(() => { mobileCount.textContent = elements.bagCount.textContent; })
    .observe(elements.bagCount, { childList: true, characterData: true, subtree: true });
  elements.filters.addEventListener('submit', event => event.preventDefault());
  elements.filters.addEventListener('input', renderCatalog);
  elements.filters.addEventListener('change', renderCatalog);
  elements.filters.addEventListener('reset', () => window.setTimeout(renderCatalog, 0));
  document.getElementById('empty-reset').addEventListener('click', clearFilters);
  document.getElementById('retry-catalog').addEventListener('click', loadCatalog);
  document.getElementById('close-product').addEventListener('click', () => elements.productDialog.close());
  document.getElementById('open-bag').addEventListener('click', () => { elements.bagFeedback.textContent = ''; renderBag(); elements.bagDialog.showModal(); });
  document.getElementById('close-bag').addEventListener('click', () => elements.bagDialog.close());
  document.getElementById('close-customer').addEventListener('click', () => elements.customerDialog.close());
  document.getElementById('cancel-customer').addEventListener('click', () => elements.customerDialog.close());
  elements.customerForm.addEventListener('submit', submitCustomerForm);
  elements.copyOrder.addEventListener('click', copyOrderSummary);
  elements.shareCart.addEventListener('click', shareCartSummary);
  elements.sendWhatsapp.addEventListener('click', sendWhatsapp);
  [elements.productDialog, elements.bagDialog].forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));

  /* CTAs de WhatsApp con mensaje prellenado: dejan al cliente listo para
     enviar y al bot con la intención clasificada desde el primer mensaje. */
  document.querySelectorAll('[data-wa-message]').forEach(button => button.addEventListener('click', () => openWhatsapp(button.dataset.waMessage)));
  elements.favoritesToggle.addEventListener('click', () => {
    elements.favoritesToggle.setAttribute('aria-pressed', String(!favoritesOnly()));
    renderCatalog();
  });
  elements.requestFavorites.addEventListener('click', () => {
    const names = favoriteProducts().map(product => `• ${product.name} (${product.brand})`);
    if (!names.length) return;
    openWhatsapp(`Hola, ${STORE_CONFIG.name}. Estos son mis favoritos del catálogo y quisiera precios y disponibilidad:\n${names.join('\n')}`);
  });
  document.getElementById('year').textContent = String(new Date().getFullYear());
  renderBag();
  loadFiltersFromUrl();
  loadCatalog();
})();
