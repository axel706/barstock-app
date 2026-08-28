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
  const BY_CATEGORY = {
    'Vodka':              'vodka',
    'Gin':                'vodka',
    'Tequila & Mezcal':   'tequila',
    'Whiskey & Bourbon':  'whiskey',
    'Rum':                'whiskey',
    'Brandy & Cognac':    'burgundy',
    'Liqueur':            'liqueur',
    'Wine':               'bordeaux',
    'Beer & Cider':       'none',
    'Non-Alcoholic':      'none'
  };

  // El nombre gana a la categoría cuando dice algo más concreto: dentro
  // de "Wine" caben un burdeos, un borgoña y un espumoso, y sus formas se
  // diferencian en hasta 15 puntos de volumen.
  const BY_NAME = [
    [/\b(champagne|prosecco|cava|sparkling|brut|spumante)\b/i, 'champagne'],
    [/\b(pinot noir|chardonnay|burgundy|bourgogne|pinot gris|gew)/i, 'burgundy'],
    [/\b(cabernet|merlot|bordeaux|sauvignon|malbec|syrah|shiraz|zinfandel|petite sirah|rioja|chianti)\b/i, 'bordeaux'],
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
    const shapes = (window.BarStockBottleProfiles
      ? window.BarStockBottleProfiles.keys()
      : ['bordeaux','burgundy','champagne','whiskey','vodka','tequila','liqueur','cylinder','none']);
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

    // Solo lo que no tiene ya forma. Reasignar lo que alguien reviso a
    // mano seria pisarle el trabajo.
    const pending = master.filter(r => !r.bottleShape);
    if (!pending.length) {
      body(`<div class="ac-status">Every item already has a bottle shape.</div>`);
      setTimeout(close, 1600);
      return;
    }

    _rows = pending.map(r => {
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

    body(`
      <div class="ac-sum">
        ${withShape.length} resolved${without.length ? ` · ${without.length} left blank` : ''}.
        Uncheck anything that looks wrong — a wrong shape is worse than none.
      </div>
      <div class="ac-list">
        ${withShape.map((r, i) => `
          <label class="ac-row${r.src === 'ai' ? ' ai' : ''}">
            <input type="checkbox" data-i="${i}" ${r.on ? 'checked' : ''}>
            <span class="ac-name">${esc(r.item)}</span>
            <select data-shape="${i}">${opts(r.shape)}</select>
            <select data-size="${i}">${sizeOpts(r.size || 750)}</select>
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
    el.querySelectorAll('select[data-shape]').forEach(s => {
      s.onchange = () => { withShape[Number(s.dataset.shape)].shape = s.value; };
    });
    el.querySelectorAll('select[data-size]').forEach(s => {
      s.onchange = () => { withShape[Number(s.dataset.size)].size = Number(s.value); };
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
          if (row) { row.bottleShape = r.shape; row.bottleSizeMl = r.shape === 'none' ? null : (r.size || 750); }
          done++;
        } catch (e) { failed++; console.warn('[botellas] fallo', r.item, e); }
      }));
      body(`<div class="ac-status"><i class="ti ti-loader" aria-hidden="true"></i> Saving ${done + failed} of ${chosen.length}…</div>`);
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
