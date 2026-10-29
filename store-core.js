(function exposeAlphaStoreCore(globalScope) {
  'use strict';

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es-PE')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function numericPrice(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function filterProducts(products, filters) {
    const query = normalize(filters.query);
    const category = filters.category || 'all';
    const presentation = filters.presentation || 'all';
    const min = filters.min === null || filters.min === '' ? null : Number(filters.min);
    const max = filters.max === null || filters.max === '' ? null : Number(filters.max);
    return products.filter(product => {
      if (query && !normalize(`${product.name} ${product.brand}`).includes(query)) return false;
      if (category !== 'all' && product.category !== category) return false;
      if (presentation !== 'all' && product.presentation !== presentation) return false;
      if (min !== null && (product.price === null || product.price < min)) return false;
      if (max !== null && (product.price === null || product.price > max)) return false;
      return true;
    });
  }

  function deserializeCart(serialized) {
    try {
      const parsed = JSON.parse(serialized || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(item => item && typeof item.id === 'string' && numericPrice(item.price) !== null && Number(item.quantity) > 0)
        .map(item => ({ ...item, quantity: Math.min(99, Math.max(1, Math.floor(Number(item.quantity)))) }));
    } catch {
      return [];
    }
  }

  function addItem(cart, item, quantity) {
    const amount = Math.min(99, Math.max(1, Math.floor(Number(quantity) || 1)));
    const next = cart.map(entry => ({ ...entry }));
    const existing = next.find(entry => entry.id === item.id);
    if (existing) existing.quantity = Math.min(99, existing.quantity + amount);
    else next.push({ ...item, quantity: amount });
    return next;
  }

  function updateQuantity(cart, id, delta) {
    return cart.map(item => item.id === id
      ? { ...item, quantity: Math.min(99, Math.max(1, item.quantity + delta)) }
      : { ...item });
  }

  function removeItem(cart, id) {
    return cart.filter(item => item.id !== id).map(item => ({ ...item }));
  }

  function cartTotals(cart) {
    return cart.reduce((totals, item) => ({
      units: totals.units + item.quantity,
      amount: totals.amount + item.price * item.quantity
    }), { units: 0, amount: 0 });
  }

  function createOrderSummary(cart, storeName, customer) {
    const customerName = customer && customer.name ? String(customer.name).trim() : '';
    const customerPhone = customer && customer.phone ? String(customer.phone).trim() : '';
    const customerDelivery = customer && customer.delivery ? String(customer.delivery).trim() : '';
    const header = [];
    if (customerName || customerPhone) {
      if (customerName) header.push(`👤 Cliente: ${customerName}`);
      if (customerPhone) header.push(`📱 Teléfono: ${customerPhone}`);
      if (customerDelivery) header.push(`📦 Entrega: ${customerDelivery}`);
      header.push('');
    }
    const lines = cart.map((item, index) =>
      `${index + 1}. ${item.name} — ${item.presentationLabel}${item.presentation === 'decant' ? ` ${item.size}` : ''} — S/ ${(item.price * item.quantity).toFixed(2)} (×${item.quantity})`
    );
    const { amount } = cartTotals(cart);
    return [
      `🛒 Hola, ${storeName}. Quisiera consultar este pedido:`,
      '',
      ...header,
      ...lines,
      '',
      `💰 Total: S/ ${amount.toFixed(2)}`,
      '',
      'La disponibilidad, el pago y la entrega se confirman durante la atención por WhatsApp. ✅'
    ].join('\n');
  }

  const api = Object.freeze({ normalize, numericPrice, filterProducts, deserializeCart, addItem, updateQuantity, removeItem, cartTotals, createOrderSummary });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  globalScope.AlphaStoreCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
