(() => {
  'use strict';

  window.AlphaDecantPricing = Object.freeze({
    price30ml(name) {
      const normalized = String(name || '').normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
      const category = window.ALPHA_PRODUCT_METADATA?.[normalized]?.category;
      if (category === 'disenador') return 200;
      if (category === 'arabes') return 90;
      // Reconoce las marcas de diseñador aunque el nombre tenga otra variante.
      if (/armani|acqua di gio|azzaro|jean paul|gaultier|gutier|le male|ultra male|stronger with you|valentino|versace|dior|chanel|paco rabanne|rabanne|carolina herrera|hugo boss|yves saint laurent|prada|gucci|givenchy|burberry|montblanc|mont blanc|dolce|lacoste|tom ford|viktor.*rolf/.test(normalized)) return 200;
      return 90;
    }
  });
})();
