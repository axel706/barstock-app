(() => {
  if (window.BarStockAutoCategory) return;

  // ── Asignación automática de categorías ──────────────────────────────
  //
  // Dos pasadas, en este orden por una razón concreta:
  //
  //   1. REGLAS — gratis, instantáneas, sin red, y siempre dan el mismo
  //      resultado. Sobre el inventario real resuelven ~92%.
  //   2. IA — solo para lo que sobró. Son los nombres que no dicen qué
  //      son: Cointreau, Aperol, Cinzano, French Blue. Ahí no hay texto
  //      que emparejar, hay que saber qué es cada cosa.
  //
  // Y nada se guarda sin revisión. Escribir cientos de categorías de un
  // golpe es una operación masiva sobre inventory_items, y esas son
  // exactamente las que hay que mirar antes de soltar.

  const CATS = ['Vodka','Gin','Tequila & Mezcal','Whiskey & Bourbon','Rum',
                'Brandy & Cognac','Liqueur','Wine','Beer & Cider','Non-Alcoholic'];

  // El orden importa: lo más específico primero. "Creme de Cacao" tiene
  // que caer en Liqueur antes de que cualquier regla de vino lo toque.
  const RULES = [
    ['Vodka',             [/\bvodka\b/, /\bvordka\b/]],
    ['Gin',               [/\bgin\b/, /\bgenever\b/, /\bsloe gin\b/]],
    ['Tequila & Mezcal',  [/\btequila\b/, /\bmezcal\b/, /\bmescal\b/]],
    ['Whiskey & Bourbon', [/\bwhisk(?:e)?y\b/, /\bbourbon\b/, /\bscotch\b/, /\brye\b/, /\bsingle malt\b/]],
    ['Rum',               [/\brum\b/, /\bron\b/, /\bcacha[cç]a\b/]],
    ['Brandy & Cognac',   [/\bbrandy\b/, /\bcognac\b/, /\barmagnac\b/, /\bpisco\b/, /\bgrappa\b/]],
    ['Liqueur',           [/\bliqueur\b/, /\btriple sec\b/, /\bamaretto\b/, /\bcreme de\b/, /\bschnapps\b/,
                           /\bvermouth\b/, /\bsambuca\b/, /\bcura[cç]ao\b/, /\bbitters?\b/, /\baperol\b/,
                           /\bcampari\b/, /\bmaraschino\b/, /\bcordial\b/]],
    // El vino casi nunca dice "wine": dice el nombre de la uva o la
    // región. Sin estas palabras, media bodega se queda sin categoría.
    ['Wine',              [/\bwine\b/, /\bchampagne\b/, /\bprosecco\b/, /\bcava\b/, /\bmoscato\b/,
                           /\briesling\b/, /\bchardonnay\b/, /\bcabernet\b/, /\bsauvignon\b/, /\bmerlot\b/,
                           /\bpinot\b/, /\bmalbec\b/, /\bsyrah\b/, /\bsirah\b/, /\bros[eé]\b/, /\bchablis\b/,
                           /\bburgundy\b/, /\bbordeaux\b/, /\btoscana\b/, /\bchianti\b/, /\brioja\b/,
                           /\bigt\b/, /\bdoc?g?\b/, /\bblend\b/, /\bbrut\b/, /\bzinfandel\b/, /\bmalvasia\b/,
                           /\bgrigio\b/, /\bgris\b/, /\btempranillo\b/, /\bsangiovese\b/, /\bshiraz\b/,
                           /\bviognier\b/, /\balbari[nñ]o\b/, /\bvinho\b/, /\bsherry\b/, /\bport\b/]],
    ['Beer & Cider',      [/\bbeer\b/, /\bcider\b/, /\blager\b/, /\bipa\b/, /\bale\b/, /\bstout\b/, /\bpilsner\b/]],
    ['Non-Alcoholic',     [/\bjuice\b/, /\bsoda\b/, /\bsyrup\b/, /\bwater\b/, /\bpur[eé]e?\b/, /\bmixer\b/,
                           /\bzero\b/, /\bn\/a\b/, /\bnon-?alcoholic\b/, /\btonic\b/, /\bgrenadine\b/]],
  ];

  function byRules(name) {
    const s = String(name || '').toLowerCase();
    for (const [cat, pats] of RULES) {
      if (pats.some(p => p.test(s))) return cat;
    }
    return null;
  }

  // ── Pasada de IA para lo que las reglas no alcanzan ──────────────────
  async function byAI(names) {
    if (!names.length) return {};
    try {
      const client = await window.BarStockAuth.getAuthClient();
      const { data } = await client.auth.getSession();
      const res = await fetch('/api/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',
                   'Authorization': 'Bearer ' + (data?.session?.access_token || '') },
        body: JSON.stringify({ names, categories: CATS })
      });
      const out = await res.json();
      return (out && out.ok && out.map) ? out.map : {};
    } catch (e) {
      console.warn('[categorias] la pasada de IA fallo, quedan solo las reglas', e);
      return {};
    }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  // ── Flujo ────────────────────────────────────────────────────────────
  let _rows = [];

  async function run() {
    const pending = (window.state?.master || []).filter(r => !r.category && r.item);
    if (!pending.length) {
      alert('Every item already has a category.');
      return;
    }

    open();
    body(`<div class="ac-status"><i class="ti ti-loader" aria-hidden="true"></i> Reading ${pending.length} names…</div>`);

    _rows = pending.map(r => ({ item: r.item, cat: byRules(r.item), src: 'rule', on: true }));

    const unresolved = _rows.filter(r => !r.cat).map(r => r.item);
    if (unresolved.length) {
      body(`<div class="ac-status"><i class="ti ti-loader" aria-hidden="true"></i> ${_rows.length - unresolved.length} solved by name. Asking about ${unresolved.length} more…</div>`);
      const map = await byAI(unresolved);
      _rows.forEach(r => {
        if (!r.cat && map[r.item]) { r.cat = map[r.item]; r.src = 'ai'; }
      });
    }

    // Lo que sigue sin categoria no se propone: mejor dejarlo vacio que
    // inventar una. Una categoria equivocada es peor que ninguna porque
    // nadie la vuelve a revisar.
    _rows = _rows.filter(r => r.cat);
    if (!_rows.length) { body('<div class="ac-status">Could not work out any of them.</div>'); return; }
    review();
  }

  function review() {
    const rules = _rows.filter(r => r.src === 'rule').length;
    const ai = _rows.length - rules;

    body(`
      <div class="ac-sum">
        <strong>${_rows.length}</strong> proposed ·
        ${rules} from the name${ai ? ` · <span class="ac-ai">${ai} needed looking up</span>` : ''}
      </div>
      <div class="ac-hint">Uncheck anything that looks wrong, or change the category. Nothing is saved until you press Apply.</div>
      <div class="ac-list">
        ${_rows.map((r, i) => `
          <label class="ac-row${r.src === 'ai' ? ' ai' : ''}">
            <input type="checkbox" data-i="${i}" ${r.on ? 'checked' : ''}>
            <span class="ac-name">${esc(r.item)}</span>
            <select data-sel="${i}">
              ${CATS.map(c => `<option value="${esc(c)}"${c === r.cat ? ' selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
          </label>`).join('')}
      </div>
      <div class="ac-actions">
        <button class="ac-btn ghost" id="acCancel">Cancel</button>
        <button class="ac-btn go" id="acApply">Apply <span id="acN">${_rows.filter(r => r.on).length}</span></button>
      </div>`);

    const el = document.getElementById('acBody');
    el.querySelectorAll('[data-i]').forEach(c => c.onchange = () => {
      _rows[+c.dataset.i].on = c.checked;
      document.getElementById('acN').textContent = _rows.filter(r => r.on).length;
    });
    el.querySelectorAll('[data-sel]').forEach(s => s.onchange = () => {
      _rows[+s.dataset.sel].cat = s.value;
    });
    document.getElementById('acCancel').onclick = close;
    document.getElementById('acApply').onclick = apply;
  }

  async function apply() {
    const chosen = _rows.filter(r => r.on && r.cat);
    if (!chosen.length) { close(); return; }

    body(`<div class="ac-status"><i class="ti ti-loader" aria-hidden="true"></i> Saving ${chosen.length}…</div>`);

    let done = 0, failed = 0;
    // De cinco en cinco: en serie tarda una eternidad con 200 articulos,
    // y todas a la vez Supabase las rechaza.
    for (let i = 0; i < chosen.length; i += 5) {
      await Promise.all(chosen.slice(i, i + 5).map(async r => {
        try { await window.saveCategoryInline(r.item, r.cat); done++; }
        catch (e) { failed++; console.warn('[categorias] fallo', r.item, e); }
      }));
      body(`<div class="ac-status"><i class="ti ti-loader" aria-hidden="true"></i> Saving ${done + failed} of ${chosen.length}…</div>`);
    }

    close();
    if (typeof render === 'function') render();
    if (typeof setStatus === 'function') {
      setStatus(`${done} categories assigned${failed ? `, ${failed} failed` : ''}.`);
    }
  }

  // ── Modal ────────────────────────────────────────────────────────────
  function open() {
    let bg = document.getElementById('acModalBg');
    if (!bg) {
      bg = document.createElement('div');
      bg.id = 'acModalBg';
      bg.className = 'modalbg';
      bg.innerHTML = `<div class="modal ac-modal">
        <div class="ac-head"><i class="ti ti-tags" aria-hidden="true"></i> Assign categories</div>
        <div id="acBody"></div>
      </div>`;
      document.body.appendChild(bg);
      bg.addEventListener('click', e => { if (e.target === bg) close(); });
    }
    bg.classList.remove('hidden');
  }
  function close() {
    const bg = document.getElementById('acModalBg');
    if (bg) bg.classList.add('hidden');
  }
  function body(html) {
    const el = document.getElementById('acBody');
    if (el) el.innerHTML = html;
  }

  window.BarStockAutoCategory = { run, byRules, CATS };
})();
