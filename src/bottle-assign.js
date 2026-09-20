(() => {
  if (window.BarStockBottleAssign) return;

  // ── Asignar forma y tamaño de botella ────────────────────────────────
  //
  // Mismo patrón que el botón de categorías, y a propósito: reglas
  // primero, IA solo para lo que las reglas no resuelven, y revisión
  // humana antes de guardar nada.
  //
  // Se apoya en trabajo que ya está hecho. El tamaño casi siempre viene
  // en el nombre (1.75, 1L, 375). Y la forma se deduce de la CATEGORÍA
  // que ya está asignada: si algo es tequila, su botella es de tequila.
  // Así la IA solo ve lo que sobra, que son unas pocas docenas y no 300.

  const SIZES = [50,187,200,250,330,355,375,473,500,700,750,1000,1500,1750,3000];

  // Categoría → forma. Es la regla que más trabajo hace, porque las
  // categorías ya están puestas.
  //
  // Gin, ron y tequila apuntan a la misma forma que el vodka. No es
  // pereza: al medir las botellas de referencia salieron indistinguibles
  // entre sí, y tener cuatro entradas iguales solo daría cuatro sitios
  // donde equivocarse. El día que una de las cuatro merezca la suya, se
  // separa aquí sin tocar las otras tres.
  const BY_CATEGORY = {
    'Vodka':              'vodka',
    'Gin':                'vodka',
    'Tequila & Mezcal':   'vodka',
    'Rum':                'vodka',
    'Whiskey & Bourbon':  'whiskey',
    'Brandy & Cognac':    'brandy',
    'Liqueur':            'liqueur_slim',
    'Wine':               'bordeaux',
    'Beer & Cider':       'none',
    'Non-Alcoholic':      'none'
  };

  // El nombre gana a la categoría cuando dice algo más concreto: dentro
  // de "Wine" caben un burdeos, un borgoña y un espumoso, y sus formas se
  // diferencian en hasta 15 puntos de volumen.
  //
  // Las primeras son marcas cuya botella se midió una por una y no se
  // parece a la de su categoría. Van antes que las varietales y que la
  // categoría porque son la pista más concreta que hay: si el nombre dice
  // "Crown Royal", no hay nada que deducir.
  const BY_NAME = [
    [/\bcrown\s*royal\b/i,                        'crown'],
    [/\bmaker'?s\s*mark\b/i,                      'squat'],
    [/\bhendrick'?s\b/i,                          'apothecary_squat'],
    [/\babsolut\b/i,                              'apothecary_tall'],
    [/\btanqueray\b/i,                            'shaker_faceted'],
    [/\b(jose\s*cuervo|cuervo)\b/i,               'tequila_tall'],
    [/\b(bailey'?s|rumchata|cream liqueur)\b/i,   'liqueur_cream'],
    [/\b(cointreau|grand\s*marnier|chambord|st[- ]?germain|luxardo)\b/i, 'liqueur_slim'],

    [/\b(champagne|prosecco|cava|sparkling|brut|spumante)\b/i, 'sparkling'],
    // "sauvignon" a secas no vale: un Cabernet Sauvignon viene en botella
    // de Burdeos y un Sauvignon Blanc en una de hombro caído. La palabra
    // que decide es la segunda, así que el blanco se caza entero y antes.
    [/\b(sauvignon blanc|pinot noir|pinot grigio|pinot gris|chardonnay|burgundy|bourgogne|gew[uü]rztraminer|viognier|riesling)\b/i, 'wine_burgundy'],
    [/\b(cabernet|merlot|bordeaux|malbec|syrah|shiraz|zinfandel|petite sirah|rioja|chianti|tempranillo)\b/i, 'bordeaux'],
    [/\b(keg|draft|draught)\b/i, 'none'],
    [/\b(can|cans|seltzer|soda|juice|syrup|puree|mix)\b/i, 'none']
  ];

  // Tamaño desde el nombre. El orden importa: 1.75 tiene que probarse
  // antes que 75, o "1.75L" se leería como 750 ml.
  const SIZE_RULES = [
    [/\b1\.75\s*l?\b|\b175cl\b/i, 1750],
    [/\b1\.5\s*l?\b|\b150cl\b|\bmagnum\b/i, 1500],
    [/\b1\s*l(?:t|iter|itre)?\b|\b100cl\b|\b1000\s*ml\b/i, 1000],
    [/\b750\s*ml\b|\b75cl\b|\b\.75l\b/i, 750],
    [/\b700\s*ml\b|\b70cl\b/i, 700],
    [/\b500\s*ml\b|\b50cl\b/i, 500],
    [/\b375\s*ml\b|\b37\.5cl\b|\bhalf\b/i, 375],
    [/\b200\s*ml\b/i, 200],
    [/\b187\s*ml\b/i, 187],
    [/\b50\s*ml\b|\bmini\b/i, 50]
  ];

  let _rows = [];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  // ── Reglas ───────────────────────────────────────────────────────────
  function byRules(row) {
    const name = String(row.item || '');
    let shape = null, size = null;

    for (const [re, s] of BY_NAME) { if (re.test(name)) { shape = s; break; } }
    if (!shape && row.category && BY_CATEGORY[row.category]) shape = BY_CATEGORY[row.category];

    for (const [re, v] of SIZE_RULES) { if (re.test(name)) { size = v; break; } }

    // Sin pista en el nombre, 750 ml es la apuesta correcta para todo lo
    // destilado: es lo que se compra por defecto. Para cerveza y demás no
    // se adivina, porque ahí no hay talla dominante.
    if (!size && shape && shape !== 'none') size = 750;

    return { shape, size, src: (shape || size) ? 'rule' : null };
  }

  async function byAI(rows) {
    // pickable() y no keys(): 'generic' es el respaldo cuando no hay nada
    // asignado, y ofrecérsela a la IA sería darle una salida cómoda para
    // todo lo que no reconozca. Si no está segura, que omita el producto.
    const shapes = (window.BarStockBottleProfiles
      ? window.BarStockBottleProfiles.pickable()
      : ['bordeaux','wine_burgundy','sparkling','vodka','whiskey','tequila_tall','brandy',
         'squat','crown','apothecary_tall','apothecary_squat','shaker_faceted',
         'liqueur_slim','liqueur_cream','decanter_flared','none']);
    try {
      const res = await fetch('/api/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'bottle',
          names: rows.map(r => r.item),
          shapes,
          sizes: SIZES
        })
      });
      const data = await res.json();
      return (data && data.ok && data.map) ? data.map : {};
    } catch (e) {
      console.warn('[botellas] la IA no respondio', e);
      return {};
    }
  }

  // ── Ejecutar ─────────────────────────────────────────────────────────
  async function run() {
    const master = (window.state && state.master) || [];
    if (!master.length) {
      if (typeof setStatus === 'function') setStatus('Load inventory first.');
      return;
    }

    open();
    body(`<div class="ac-status"><i class="ti ti-loader" aria-hidden="true"></i> Reading names…</div>`);

    // Pendiente es lo que no tiene forma NI aqui ni en el mapa global. Un
    // articulo cuya silueta se asigno en la otra barra ya esta resuelto, y
    // volver a ofrecerlo seria pedir que se decida dos veces lo mismo.
    if (window.BarStockItemShapes) {
      await window.BarStockItemShapes.load();
      window.BarStockItemShapes.applyTo(master);
    }
    const pending = master.filter(r => !r.bottleShape);

    if (!pending.length) {
      body(`<div class="ac-status">Every item already has its bottle shape.</div>`);
      setTimeout(close, 2200);
      return;
    }

    _rows = pending.map(r => {
      // La forma que ya tenia se RESPETA. Volver a deducirla pisaria
      // cualquier correccion hecha a mano en la pasada anterior.
      if (r.bottleShape) {
        return { item: r.item, code: r.code || '', category: r.category || null,
                 shape: r.bottleShape, size: r.bottleSizeMl || 750,
                 src: 'kept', on: true };
      }
      const g = byRules(r);
      return { item: r.item, code: r.code || '', category: r.category || null,
               shape: g.shape, size: g.size, src: g.src, on: !!g.shape };
    });

    const unresolved = _rows.filter(r => !r.shape);
    if (unresolved.length) {
      body(`<div class="ac-status"><i class="ti ti-loader" aria-hidden="true"></i> Asking AI about ${unresolved.length}…</div>`);
      const map = await byAI(unresolved);
      unresolved.forEach(r => {
        const g = map[r.item];
        if (g && g.shape) {
          r.shape = g.shape;
          if (!r.size && g.size) r.size = g.size;
          r.src = 'ai';
          r.on = true;
        }
      });
    }

    // Aquí venía un segundo paso: pedirle a la IA la silueta concreta de
    // cada producto. Se retiró. Prometía la botella exacta de cada marca
    // y devolvía un contorno aproximado que había que revisar uno por
    // uno, y además el resultado se guardaba en una columna que nadie
    // volvía a leer — al recargar la página el conteo usaba la forma de
    // familia igualmente. Una familia bien medida acierta más y no
    // cuesta trabajo a nadie.
    review();
  }

  // ── Revisión ─────────────────────────────────────────────────────────
  function review() {
    const withShape = _rows.filter(r => r.shape);
    const without = _rows.filter(r => !r.shape);
    const shapes = window.BarStockBottleProfiles ? window.BarStockBottleProfiles.PROFILES : {};

    if (!withShape.length) {
      body(`<div class="ac-status">Nothing could be resolved. Assign by hand.</div>`);
      return;
    }

    const opts = (sel) => Object.entries(shapes).map(([k, v]) =>
      `<option value="${esc(k)}"${k === sel ? ' selected' : ''}>${esc(v.name)}</option>`).join('');
    const sizeOpts = (sel) => SIZES.map(s =>
      `<option value="${s}"${Number(s) === Number(sel) ? ' selected' : ''}>${s} ml</option>`).join('');

    const V = window.BarStockBottleProfiles;

    // La revision es VISUAL. Revisar un desplegable con nombres de formas
    // no dice nada; ver la silueta dibujada al lado del producto si: "esa
    // no es la botella de Patron" se detecta de un vistazo, y es
    // exactamente el error que hay que cazar antes de guardar.
    const svg = (r) => `<svg viewBox="0 0 60 90" class="ac-sil" aria-hidden="true">
        <path d="${V.pathFor(r.shape || 'generic', 60, 90, 5)}"/>
      </svg>`;

    body(`
      <div class="ac-sum">
        ${withShape.length} item${withShape.length === 1 ? '' : 's'}${without.length ? ` · ${without.length} left blank` : ''}.
        Uncheck anything whose bottle does not look like that.
      </div>
      <div class="ac-grid">
        ${withShape.map((r, i) => `
          <label class="ac-cell">
            <input type="checkbox" data-i="${i}" ${r.on ? 'checked' : ''}>
            ${svg(r)}
            <span class="ac-cell-name">${esc(r.item)}</span>
            <span class="ac-cell-sub">${esc((shapes[r.shape] || {}).name || r.shape)} · ${r.size || 750} ml</span>
          </label>`).join('')}
      </div>
      <div class="ac-foot">
        <button class="ac-cancel" type="button">Cancel</button>
        <button class="ac-ok" type="button">Save</button>
      </div>`);

    const el = document.getElementById('baBody');
    el.querySelectorAll('input[type=checkbox]').forEach(c => {
      c.onchange = () => { withShape[Number(c.dataset.i)].on = c.checked; };
    });
    el.querySelector('.ac-cancel').onclick = close;
    el.querySelector('.ac-ok').onclick = () => apply(withShape);
  }

  // ── Guardar ──────────────────────────────────────────────────────────
  async function apply(rows) {
    const chosen = rows.filter(r => r.on && r.shape);
    if (!chosen.length) { close(); return; }

    body(`<div class="ac-status"><i class="ti ti-loader" aria-hidden="true"></i> Saving ${chosen.length}…</div>`);

    const c = window.BARSTOCK_CONFIG || {};
    const url = c.SUPABASE_URL, key = c.SUPABASE_KEY;
    let locationId = null;
    try { locationId = await window.BarStockInventoryCloud.fetchLocationId(); }
    catch (e) {
      body(`<div class="ac-status">Could not reach the database.</div>`);
      return;
    }

    let done = 0, failed = 0;
    // De cinco en cinco, como en categorias: en serie tarda una eternidad
    // con 300 articulos y todas a la vez Supabase las rechaza.
    for (let i = 0; i < chosen.length; i += 5) {
      await Promise.all(chosen.slice(i, i + 5).map(async r => {
        try {
          let u = `${url}/rest/v1/inventory_items?location_id=eq.${locationId}` +
                  `&item_name=eq.${encodeURIComponent(r.item)}`;
          if (r.code) u += `&code=eq.${encodeURIComponent(r.code)}`;
          const res = await fetch(u, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              apikey: key, Authorization: `Bearer ${key}`,
              Prefer: 'return=minimal'
            },
            body: JSON.stringify({
              bottle_shape: r.shape,
              bottle_size_ml: r.shape === 'none' ? null : (r.size || 750)
            })
          });
          if (!res.ok) throw new Error(await res.text());
          // Se refleja en memoria para que la pantalla no mienta hasta la
          // siguiente recarga.
          const row = ((window.state && state.master) || []).find(m => m.item === r.item);
          if (row) {
            row.bottleShape = r.shape;
            row.bottleSizeMl = r.shape === 'none' ? null : (r.size || 750);
          }
          done++;
        } catch (e) { failed++; console.warn('[botellas] fallo', r.item, e); }
      }));
      body(`<div class="ac-status"><i class="ti ti-loader" aria-hidden="true"></i> Saving ${done + failed} of ${chosen.length}…</div>`);
    }

    // ── Y al mapa GLOBAL ──────────────────────────────────────────────
    //
    // Lo de arriba escribe la fila de inventario de ESTA locacion. Sin
    // esto, asignar 260 siluetas en The Crown dejaba Will's & Bill's
    // igual de vacia, aunque los codigos de barras si se compartieran.
    //
    // Va despues y no en la misma peticion porque son dos tablas con
    // claves distintas: una por locacion, otra por cuenta.
    if (window.BarStockItemShapes) {
      body(`<div class="ac-status"><i class="ti ti-loader" aria-hidden="true"></i> Sharing across locations…</div>`);
      await window.BarStockItemShapes.saveMany(chosen.map(r => ({
        item: r.item, code: r.code || '', shape: r.shape,
        size: r.shape === 'none' ? null : (r.size || 750)
      })));
    }

    close();
    if (typeof render === 'function') render();
    if (typeof setStatus === 'function') {
      setStatus(`${done} bottle shapes assigned${failed ? `, ${failed} failed` : ''}.`);
    }
  }

  // ── Modal ────────────────────────────────────────────────────────────
  function open() {
    let bg = document.getElementById('baModalBg');
    if (!bg) {
      bg = document.createElement('div');
      bg.id = 'baModalBg';
      bg.className = 'modalbg';
      bg.innerHTML = `<div class="modal ac-modal">
        <div class="ac-head"><i class="ti ti-bottle" aria-hidden="true"></i> Assign bottle shapes</div>
        <div id="baBody"></div>
      </div>`;
      document.body.appendChild(bg);
      bg.addEventListener('click', e => { if (e.target === bg) close(); });
    }
    bg.classList.remove('hidden');
  }
  function close() {
    const bg = document.getElementById('baModalBg');
    if (bg) bg.classList.add('hidden');
  }
  function body(html) {
    const el = document.getElementById('baBody');
    if (el) el.innerHTML = html;
  }

  window.BarStockBottleAssign = { run, byRules, SIZES };
})();
