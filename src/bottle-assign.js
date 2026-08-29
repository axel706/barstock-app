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

  // Las siluetas se piden en lotes de 20. Cada perfil son diez pares de
  // numeros, asi que 300 articulos de golpe no caben en una respuesta.
  // Se acumula POR QUE fallo cada lote. La vez anterior salio "0 got their
  // own bottle drawn" y ese cero no distinguia tres causas muy distintas:
  // que el endpoint no respondiera, que el modelo omitiera todo, o que la
  // validacion lo rechazara todo. Resulto ser la primera —el modo
  // silhouette no estaba desplegado— y no habia forma de saberlo desde la
  // pantalla.
  let _diag = { answered: 0, rejected: 0, omitted: 0, failed: 0, why: [] };

  async function silhouettes(rows) {
    const out = {};
    _diag = { answered: 0, rejected: 0, omitted: 0, failed: 0, why: [] };

    for (let i = 0; i < rows.length; i += 20) {
      const lote = rows.slice(i, i + 20);
      body(`<div class="ac-status"><i class="ti ti-loader" aria-hidden="true"></i> Drawing bottles ${i + 1}–${Math.min(i + 20, rows.length)} of ${rows.length}…</div>`);
      try {
        const res = await fetch('/api/categorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'silhouette', names: lote.map(r => r.item) })
        });
        if (!res.ok) {
          _diag.failed += lote.length;
          if (_diag.why.length < 3) _diag.why.push('HTTP ' + res.status);
          continue;
        }
        const data = await res.json();
        if (data && data.ok && data.map) {
          Object.assign(out, data.map);
          _diag.answered += Number(data.answered || 0);
          _diag.rejected += Number(data.rejected || 0);
          _diag.omitted  += Number(data.omitted  || 0);
          if (Array.isArray(data.why)) {
            data.why.forEach(w => { if (_diag.why.length < 3) _diag.why.push(w[1]); });
          }
        } else {
          _diag.failed += lote.length;
        }
      } catch (e) {
        // Un lote que falla no debe tumbar los demas: los que si
        // llegaron valen, y el resto se queda con su arquetipo.
        _diag.failed += lote.length;
        if (_diag.why.length < 3) _diag.why.push(e.message || 'network');
        console.warn('[botellas] lote de siluetas fallo', e);
      }
    }
    return out;
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

    // Pendiente es lo que le falta ALGO, no solo lo que no tiene forma.
    //
    // El filtro original era `!r.bottleShape`, y se escribio cuando la
    // forma era lo unico que existia. Al añadir las siluetas propias, una
    // segunda pasada decia "no hay nada que resolver" aunque ningun
    // articulo tuviera silueta: ya todos tenian forma de familia.
    //
    // Lo que se cuenta entero (none) se excluye a proposito: no lleva
    // deslizador, asi que dibujarle una botella no sirve de nada.
    const pending = master.filter(r =>
      !r.bottleShape || (r.bottleShape !== 'none' && !r.bottleProfile));

    if (!pending.length) {
      body(`<div class="ac-status">Every item already has its bottle and its own silhouette.</div>`);
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

    // Ahora la silueta concreta de cada producto. La forma del arquetipo
    // se queda como respaldo de los que la IA no reconozca.
    const conForma = _rows.filter(r => r.shape && r.shape !== 'none');
    if (conForma.length) {
      const sil = await silhouettes(conForma);
      const V = window.BarStockBottleProfiles;
      conForma.forEach(r => {
        const prof = sil[r.item];
        // Se valida tambien aqui, ademas de en el servidor. Este perfil
        // acaba calculando inventario.
        if (prof && V && V.isValidProfile(prof)) r.profile = prof;
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

    const V = window.BarStockBottleProfiles;
    const conSilueta = withShape.filter(r => r.profile).length;

    // La revision es VISUAL. Revisar un desplegable con nombres de formas
    // no dice nada; ver la silueta dibujada al lado del producto si: "esa
    // no es la botella de Patron" se detecta de un vistazo, y es
    // exactamente el error que hay que cazar antes de guardar.
    const svg = (r) => {
      const key = r.profile || r.shape || 'generic';
      return `<svg viewBox="0 0 60 90" class="ac-sil" aria-hidden="true">
        <path d="${V.pathFor(key, 60, 90, 5)}"/>
      </svg>`;
    };

    body(`
      <div class="ac-sum">
        ${withShape.length} item${withShape.length === 1 ? '' : 's'}${without.length ? ` · ${without.length} left blank` : ''}.
        <b>${conSilueta}</b> got their own bottle drawn; the rest keep a family shape.
        Uncheck anything that does not look like that product's bottle.
        ${(_diag.omitted || _diag.rejected || _diag.failed) ? `
          <div class="ac-diag">
            ${_diag.omitted ? `${_diag.omitted} the model didn't recognise` : ''}
            ${_diag.rejected ? ` · ${_diag.rejected} rejected as malformed` : ''}
            ${_diag.failed ? ` · ${_diag.failed} failed to reach the server` : ''}
            ${_diag.why.length ? `<br><span>${esc(_diag.why.join(' · '))}</span>` : ''}
          </div>` : ''}
      </div>
      <div class="ac-grid">
        ${withShape.map((r, i) => `
          <label class="ac-cell${r.profile ? ' own' : ''}">
            <input type="checkbox" data-i="${i}" ${r.on ? 'checked' : ''}>
            ${svg(r)}
            <span class="ac-cell-name">${esc(r.item)}</span>
            <span class="ac-cell-sub">${r.profile ? 'own shape' : esc((shapes[r.shape] || {}).name || r.shape)} · ${r.size || 750} ml</span>
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
              bottle_size_ml: r.shape === 'none' ? null : (r.size || 750),
              bottle_profile: r.profile || null
            })
          });
          if (!res.ok) throw new Error(await res.text());
          // Se refleja en memoria para que la pantalla no mienta hasta la
          // siguiente recarga.
          const row = ((window.state && state.master) || []).find(m => m.item === r.item);
          if (row) {
            row.bottleShape = r.shape;
            row.bottleSizeMl = r.shape === 'none' ? null : (r.size || 750);
            row.bottleProfile = r.profile || null;
          }
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
