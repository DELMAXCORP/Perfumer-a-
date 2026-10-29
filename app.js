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

  const state = {
    products: [],
    cart: loadCart(),
    currentProductId: null
  };

  const elements = {
    filters: document.getElementById('filters'),
    search: document.getElementById('search'),
    category: document.getElementById('category-filter'),
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
    customerFeedback: document.getElementById('customer-feedback'),
    closeCustomer: document.getElementById('close-customer'),
    cancelCustomer: document.getElementById('cancel-customer')
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
        const price = stored ?? defaultDecantPrice(fragrance.name, size);
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

  function getFilteredProducts() {
    const query = normalize(elements.search.value);
    const category = elements.category.value;
    const min = elements.priceMin.value === '' ? null : Number(elements.priceMin.value);
    const max = elements.priceMax.value === '' ? null : Number(elements.priceMax.value);

    return Core.filterProducts(
      state.products.filter(product => product.presentation === 'completo'),
      { query, category, presentation: 'all', min, max }
    );
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
      image.src = product.image;
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

  function makeProductCard(product) {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.append(makeProductMedia(product));

    const info = document.createElement('div');
    info.className = 'product-info';
    const kicker = document.createElement('p');
    kicker.className = 'product-kicker';
    kicker.textContent = categoryLabel(product.category);
    const title = document.createElement('h3');
    title.textContent = product.name;
    const meta = document.createElement('p');
    meta.className = 'product-meta';
    meta.textContent = `${product.presentationLabel} · ${product.size}`;
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

  function renderCatalog() {
    const products = getFilteredProducts();
    elements.productGrid.replaceChildren();
    elements.productGrid.setAttribute('aria-busy', 'false');
    elements.catalogError.hidden = true;
    elements.resultCount.textContent = `${products.length} ${products.length === 1 ? 'presentación' : 'presentaciones'}`;
    elements.catalogEmpty.hidden = products.length > 0;
    elements.productGrid.hidden = products.length === 0;
    products.forEach(product => elements.productGrid.append(makeProductCard(product)));
  }

  function productDetailMedia(product) {
    if (product.presentation === 'decant') {
      return `<div class="detail-media decant-detail"><span class="mini-decant" data-size="${escapeHTML(product.size)}"></span><span class="media-note">Representación de la presentación. No es una foto del producto final.</span></div>`;
    }
    if (product.image) {
      return `<div class="detail-media"><img src="${escapeHTML(product.image)}" alt="Fotografía disponible de ${escapeHTML(product.name)}"></div>`;
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
      image.src = safeImageUrl(imageSource);
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
      console.warn('Registro de contacto no disponible:', error && error.message);
    }
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
    window.setTimeout(renderCatalog, 0);
  }

  function showCatalogError() {
    elements.productGrid.hidden = true;
    elements.catalogEmpty.hidden = true;
    elements.catalogError.hidden = false;
    elements.resultCount.textContent = 'Catálogo no disponible';
  }

  async function loadCatalog() {
    elements.catalogError.hidden = true;
    elements.productGrid.hidden = false;
    elements.productGrid.setAttribute('aria-busy', 'true');
    elements.resultCount.textContent = 'Cargando colección…';
    try {
      if (!window.supabaseClient) throw new Error('El cliente de catálogo no está disponible.');
      const { data, error } = await window.supabaseClient
        .from('catalogo_publico')
        .select('id,nombre,tipo,tamano,precio_venta,imagen_url,audio_url,agotado,precio_decant_3ml,precio_decant_5ml,precio_decant_10ml,precio_decant_30ml')
        .order('nombre', { ascending: true });
      if (error) throw error;
      state.products = buildProducts(data || []);
      renderCatalog();
    } catch (error) {
      console.error('No se pudo cargar el catálogo público:', error);
      showCatalogError();
    }
  }

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

  document.getElementById('year').textContent = String(new Date().getFullYear());
  renderBag();
  loadCatalog();
})();
