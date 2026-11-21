/*
 * ── El logo de cada proveedor ────────────────────────────────────────
 *
 * Axel, 2026-11-20: en Orders (Open, Sent, Invoices) cada proveedor
 * lleva su logo, "el logo solo", sin recuadro, del tamaño de la
 * insignia de iniciales que tenía. Los archivos los dio él y viven en
 * assets/vendors/ (recortados a fondo transparente; de Breakthru sólo
 * la flecha: el nombre va en negro y sobre la Tinta no se lee).
 *
 * Una sola regla para todas las pantallas, porque el nombre no es el
 * mismo en todas: la orden dice "LOOP" y la factura de MarginEdge dice
 * "PLCB"; la orden dice "SOUTHERN" y la factura "Southern Glazer's…".
 * Si cada pantalla tuviera su lista, LOOP llevaría el logo en Open y no
 * en Invoices.
 *
 * Sin logo, la insignia de iniciales en el color del proveedor (el de
 * vendorDotColor() de index.html), que es lo que había.
 */
(function () {
  'use strict';

  // Cuando se cambie un archivo, se sube esto: el teléfono guarda las
  // imágenes como guarda los scripts.
  const V = '1';

  // El orden importa poco (no se pisan), pero va del más corto al más
  // largo de reconocer. "WINE" solo es Wine Merchant: así lo trata ya
  // vendorDotColor(); "Wine Spectator" no.
  // Fine Wine & Good Spirits (Axel, 2026-11-21) va primero: lleva "Wine"
  // en el nombre y no es Wine Merchant. Su sello es de un solo color
  // sobre blanco, con textura gastada: el blanco se pasó a transparente
  // por lo claro, no rellenando desde el borde (se colaba por los huecos
  // del anillo).
  const LOGOS = [
    [/FINE WINE|\bFWGS\b/, 'fine-wine'],
    [/\bLOOP\b|\bPLCB\b|LIQUOR CONTROL|^LCB\b/, 'loop'],
    [/BREAKTHRU|BREAK THRU/, 'breakthru'],
    [/\bSOUTHERN\b/, 'southern'],
    [/WINE MERCHANT|MASCIARELLI|^WINE$/, 'wine-merchant']
  ];

  function de(v) {
    const u = String(v || '').trim().toUpperCase();
    if (!u) return null;
    for (const [re, archivo] of LOGOS) {
      if (re.test(u)) return 'assets/vendors/' + archivo + '.png?v=' + V;
    }
    return null;
  }

  // Va dentro de un style: sólo un color con forma de color.
  function color(v) {
    const c = typeof window.vendorDotColor === 'function' ? window.vendorDotColor(v) : '';
    return /^#[0-9a-f]{3,8}$|^rgba?\([\d.,\s%]+\)$|^hsla?\([\d.,\s%deg]+\)$/i.test(String(c)) ? c : '#94a3b8';
  }

  // De dos palabras, la primera de cada una (WINE MERCHANT → WM); de
  // una, sus dos primeras letras (BOTANERY → BO). Una regla que
  // cualquiera adivina, y no una por proveedor.
  function iniciales(v) {
    const ps = String(v || '').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
    if (!ps.length) return '?';
    return ps.length > 1 ? ps[0][0] + ps[1][0] : ps[0].slice(0, 2);
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // El nombre va escrito al lado en todas las pantallas: el logo es
  // decoración para el lector de pantalla (alt vacío).
  function html(v) {
    const src = de(v);
    if (src) return '<img class="m-vlogo" src="' + src + '" alt="" width="40" height="40" decoding="async">';
    return '<span class="m-vlogo m-vlogo-ini" style="--vc:' + color(v) + '" aria-hidden="true">' +
      esc(iniciales(v)) + '</span>';
  }

  window.BarStockVendorLogo = { de, html, color, iniciales };
})();
