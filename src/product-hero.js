(() => {
  if (window.BarStockProductHero) return;

  // ── La cabecera de un producto, en UN sitio ──────────────────────────
  //
  // Es la tarjeta que abre la ficha de búsqueda: silueta llena hasta
  // donde está el producto, nombre, proveedor, el número grande contra
  // el par, y el aviso teñido del color del estado.
  //
  // Vivía dentro de `mobile-search.js` como tres funciones privadas.
  // Ahora la usan dos pantallas —buscar desde Home y editar desde
  // Inventory— y copiarla habría sido la cuarta vez en este proyecto
  // que la misma cosa se escribe en dos sitios y un día dejan de
  // decir lo mismo. Las otras tres fueron los márgenes de pantalla, el
  // catálogo de fondos y el dibujado del logo.
  //
  // Aquí NO se decide dónde se enseña ni qué va debajo. Eso es de cada
  // pantalla: una enseña zonas y acciones, la otra campos editables.

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const n2 = (x) => String(Math.round((Number(x) || 0) * 100) / 100);

  // Con menos historia que esto, "te alcanza para X días" es una
  // corazonada con aspecto de dato — y de los que se creen.
  const SEMANAS_PARA_FIAR = 4;

  const BOT = { w: 52, h: 116, pad: 4 };

  // ── El color del estado ──────────────────────────────────────────────
  //
  // Lo primero que se ve desde lejos es el color, no el número.
  function tono(r) {
    const oh = Number(r.onHand) || 0;
    if (oh <= 0) return { c: '#f87171', t: 'out of stock' };
    const sug = Number(r.suggested) || 0;
    if (sug > 0 && oh / sug <= 0.25) return { c: '#fbbf24', t: 'running low' };
    return { c: '#4ade80', t: '' };
  }

  function clase(k) {
    return k.t === 'out of stock' ? 'mal' : k.t === 'running low' ? 'ojo' : 'bien';
  }

  function parDe(r) {
    const m = window.parAdjustments;
    if (!m || !m.size) return null;
    return m.get(r.item + '||' + (r.code || '')) || null;
  }

  // ── La botella es un medidor, no una botella ───────────────────────
  //
  // El PAR es la botella llena y el on hand marca el nivel. 7.3 de un
  // par de 18 sale a poco menos de la mitad; 30 de 36 casi llena.
  //
  // El nivel es lineal, no por volumen. `heightFor` convierte volumen
  // de líquido en altura teniendo en cuenta el hombro, y eso es
  // correcto para una botella de verdad: aquí falsearía el medidor,
  // porque la mitad del par se dibujaría por debajo de la mitad de la
  // altura.
  //
  // Sin par no hay contra qué medir, así que se queda vacía. No se
  // escribe nada: el par ya está en la ficha y un texto de más en el
  // icono es ruido.
  function silueta(r, color) {
    const V = window.BarStockBottleProfiles;
    if (!V || !V.pathFor) return '';

    const key = (r.bottleShape && V.forSize)
      ? V.forSize(r.bottleShape, r.bottleSizeMl) : 'generic';

    let d = '';
    try { d = V.pathFor(key, BOT.w, BOT.h, BOT.pad); } catch (e) { return ''; }
    if (!d) return '';

    const oh = Number(r.onHand) || 0;
    const par = Number(r.suggested) || 0;
    const ratio = par > 0 ? Math.max(0, Math.min(1, oh / par)) : null;

    let yPx = BOT.h - BOT.pad;
    if (ratio !== null && ratio > 0) {
      try { yPx = V.yToPx(key, ratio, BOT.w, BOT.h, BOT.pad); } catch (e) {}
    }
    const frac = ratio || 0;

    const id = 'ph' + Math.random().toString(36).slice(2, 8);
    return `
      <div class="m-bot">
        <svg viewBox="0 0 ${BOT.w} ${BOT.h}" width="${BOT.w}" height="${BOT.h}" aria-hidden="true">
          <defs>
            <clipPath id="${id}"><rect x="0" y="${yPx}" width="${BOT.w}" height="${BOT.h}"/></clipPath>
          </defs>
          <path d="${d}" fill="rgba(0,0,0,.22)" stroke="rgba(255,255,255,.38)" stroke-width="1.6"/>
          ${frac > 0 ? `<g clip-path="url(#${id})">
            <path d="${d}" fill="${color}" opacity=".78"/></g>` : ''}
          <path d="${d}" fill="none" stroke="rgba(255,255,255,.38)" stroke-width="1.6"/>
        </svg>
      </div>`;
  }

  // "1 days" era un fallo que llevaba ahí desde el principio.
  const cuantos = (n, u) => n + ' ' + u + (n === 1 ? '' : 's');

  // Días que aguanta, o null si la historia no da para decirlo.
  function diasQueAguanta(r, p) {
    const avg = p && p.avgUsed != null ? Number(p.avgUsed) : null;
    const semanas = p && p.normalWeeks ? p.normalWeeks : 0;
    if (avg === null || avg <= 0 || semanas < SEMANAS_PARA_FIAR) return null;
    return Math.round((Number(r.onHand) || 0) / avg * 7);
  }

  function aviso(r, dias) {
    if (Number(r.onHand) <= 0) return 'Out of stock';
    if (dias !== null) return 'Runs out in ' + cuantos(dias, 'day');
    const sug = Number(r.suggested) || 0;
    if (sug > 0 && Number(r.onHand) / sug <= 0.25) return 'Running low';
    return '';
  }

  // ── El bloque ────────────────────────────────────────────────────────
  //
  // `o.sub` deja a cada pantalla poner su propia segunda línea. Por
  // defecto es "proveedor · categoría · tamaño", que es lo que dice la
  // ficha de búsqueda. Inventory le añade el código, que ahí sí
  // importa: es con lo que se cruzan las facturas.
  //
  // `o.hueco` abre una ranura vacía a la derecha. A la derecha del
  // nombre sobraba espacio —media tarjeta en blanco— y la gráfica de
  // las semanas estaba abajo ocupando una tarjeta entera para sí sola.
  // Aquí sólo se reserva el sitio; lo que entra lo pone quien llama,
  // DESPUÉS, porque ese dato llega de una consulta y la cabecera no
  // espera a nadie.
  //
  // Vacía no ocupa: una ranura que reserva aire cuando no hay nada que
  // meter descoloca el nombre sin motivo.
  function html(r, o) {
    o = o || {};
    const k = tono(r);
    const p = o.par !== undefined ? o.par : parDe(r);
    const dias = diasQueAguanta(r, p);
    const av = o.aviso !== undefined ? o.aviso : aviso(r, dias);

    const sub = o.sub !== undefined ? o.sub
      : (String(r.vendor || '') +
         (r.category ? ' · ' + r.category : '') +
         (r.bottleSizeMl ? ' · ' + r.bottleSizeMl + ' ml' : ''));

    return `
      <div class="m-fic m-fic-${clase(k)}">
        ${silueta(r, k.c)}
        <div class="m-fic-d">
          <div class="m-fic-n">${esc(r.item)}</div>
          <div class="m-fic-s">${esc(sub)}</div>
          <div class="m-fic-big">
            <b style="color:${k.c}">${n2(r.onHand)}</b>
            <span>${Number(r.suggested) > 0 ? 'of ' + n2(r.suggested) : 'on hand'}</span>
          </div>
          ${av ? `<div class="m-fic-av" style="color:${k.c}">${esc(av)}</div>` : ''}
        </div>
        ${o.hueco ? '<div class="m-fic-g"></div>' : ''}
      </div>`;
  }

  window.BarStockProductHero = {
    html, tono, silueta, parDe, diasQueAguanta, aviso,
    SEMANAS_PARA_FIAR
  };
})();
