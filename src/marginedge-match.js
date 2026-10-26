(() => {
  if (window.BarStockMarginEdgeMatch) return;

  // ── Emparejar el inventario con el catálogo de MarginEdge ───────────
  //
  // Se hace una vez. A partir de ahí cada artículo lleva el
  // `companyConceptProductId` de MarginEdge y el vínculo deja de
  // depender del nombre: da igual que mañana alguien escriba "TITOS" o
  // "Tito's Handmade", la pareja aguanta. Eso es lo que arregla de raíz
  // lo que arrastran `sales-fix.js` y los 94 UNKNOWN.
  //
  // ── Por qué no vale `scoreMatch` ─────────────────────────────────
  //
  // El que usa el resto de la app cuenta palabras en común sobre el
  // total. Con estos nombres falla de tres maneras:
  //
  //   1. No entiende tamaños. "TITOS 1.75" contra "Tito's Handmade
  //      Vodka 1.75L" son 1.75 y 1.75L, dos palabras distintas. Y peor
  //      al revés: deja pasar "Tito's 750ml" como si diera igual.
  //   2. Todas las palabras pesan lo mismo. "VODKA" aparece en cien
  //      productos y no distingue nada; "TITOS" aparece en dos y lo
  //      distingue todo. Contarlas igual ahoga la marca entre el ruido.
  //   3. Los nombres largos salen castigados: cuantas más palabras
  //      tiene el candidato, menor es la proporción compartida, aunque
  //      la marca y el tamaño coincidan exactos.
  //
  // De los 270 artículos de The Crown Tavern, 179 se quedaban sin
  // pareja con ese método.

  const SEGURO = 0.80;   // por encima: se da por bueno sin preguntar
  const MINIMO = 0.30;   // por debajo: ni se ofrece — una sugerencia
                         // mala es peor que ninguna, porque se confirma
                         // por inercia lo que ya viene marcado
  const MAX_CANDIDATOS = 3;
  const MAX_VUELTAS = 60;
  const MAX_HITS = 8;

  // Palabras que no distinguen nada. Se quitan antes de comparar para
  // que no inflen el parecido entre dos productos sin relación.
  const RUIDO = new Set(['THE','AND','OF','A','BOTTLE','BTL','BOT','CASE','CS',
    'EA','EACH','PACK','PK','CAN','CANS','NR','LN','LOOSE','PREMIUM','BRAND']);

  let _prods = null;   // los de categoría de bebida
  let _otros = null;   // el resto del catálogo, sólo para el buscador
  let _diag = null;
  let _idf = null;
  let _filas = null;
  let _tab = 'revisar';
  let _busy = false;
  let _buscando = null;   // idx de la fila con el buscador abierto

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function cfg() {
    const c = window.BARSTOCK_CONFIG || {};
    return { url: c.SUPABASE_URL, key: c.SUPABASE_KEY };
  }

  async function llamar(action, params) {
    const client = window.BarStockSupabase.getClient();
    const { data } = await client.auth.getSession();
    const r = await fetch('/api/marginedge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (data?.session?.access_token || '')
      },
      body: JSON.stringify({ action, params: params || {} })
    });
    return r.json();
  }

  // ── Tamaños ────────────────────────────────────────────────────────
  //
  // Todo a mililitros, que es la única forma de que 1.75, 1.75L, 1750ML
  // y 1.75LTR sean la misma cosa. Un tamaño que no coincide es la señal
  // más fuerte de que dos productos NO son el mismo, así que merece
  // leerse bien.

  const ONZA_ML = 29.5735;

  function tamanoDe(texto) {
    const t = String(texto || '').toUpperCase().replace(/,/g, '');

    // Barriles, que no se miden en mililitros
    if (/\b(1\/2|HALF)\s*(BBL|BARREL|KEG)/.test(t)) return 58674;
    if (/\b(1\/4|QUARTER)\s*(BBL|BARREL|KEG)/.test(t)) return 29337;
    if (/\b(1\/6|SIXTH|SIXTEL)\s*(BBL|BARREL|KEG)?/.test(t)) return 19550;

    let m = t.match(/(\d+(?:\.\d+)?)\s*(ML|MILLILITER|MILLILITRE)/);
    if (m) return Math.round(parseFloat(m[1]));

    m = t.match(/(\d+(?:\.\d+)?)\s*(L|LT|LTR|LITER|LITRE)\b/);
    if (m) return Math.round(parseFloat(m[1]) * 1000);

    m = t.match(/(\d+(?:\.\d+)?)\s*(OZ|OUNCE)/);
    if (m) return Math.round(parseFloat(m[1]) * ONZA_ML);

    // Un número suelto: 1.75 son litros, 750 son mililitros. Es la
    // convención de cualquier carta de bar y acierta casi siempre.
    m = t.match(/(?:^|\s)(\d+(?:\.\d+)?)(?:\s|$)/);
    if (m) {
      const n = parseFloat(m[1]);
      if (n > 0 && n <= 20) return Math.round(n * 1000);
      if (n >= 50 && n <= 6000) return Math.round(n);
    }
    return null;
  }

  // Dos tamaños son el mismo si se parecen al 4 %: 750 contra 750, y
  // 1750 contra 1.75L, que redondean distinto según quién los escriba.
  function mismoTamano(a, b) {
    if (a == null || b == null) return null;
    return Math.abs(a - b) / Math.max(a, b) < 0.04;
  }

  function palabras(texto) {
    return String(texto || '')
      .toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/['’`]/g, '')              // TITO'S → TITOS
      .replace(/[^A-Z0-9]+/g, ' ')
      .split(/\s+/)
      .filter(w => w && !RUIDO.has(w) && !/^\d+$/.test(w));
  }

  // ── Peso de cada palabra ───────────────────────────────────────────
  //
  // Cuanto más rara es una palabra en el catálogo, más dice. "VODKA"
  // está en cientos de productos y no identifica nada; "TITOS" está en
  // dos y los identifica a los dos.
  function construirIdf(nombres) {
    const df = new Map();
    for (const n of nombres) {
      for (const w of new Set(palabras(n))) df.set(w, (df.get(w) || 0) + 1);
    }
    const N = nombres.length || 1;
    _idf = { df, N };
  }

  function peso(w) {
    if (!_idf) return 1;
    return Math.log(_idf.N / (1 + (_idf.df.get(w) || 0))) + 1;
  }

  // ── La puntuación ──────────────────────────────────────────────────
  //
  // Parecido entre las palabras de tu nombre y las del candidato,
  // pesando cada una por lo rara que sea. El denominador es sólo TU
  // nombre, no la unión: tu "TITOS 1.75" es taquigrafía y el candidato
  // siempre va a traer palabras de más, y castigarlas por existir era
  // justamente lo que dejaba 179 sin pareja.
  function puntuar(mio, suyo) {
    const a = palabras(mio), b = palabras(suyo);
    if (!a.length || !b.length) return 0;

    const bset = new Set(b);
    let acierto = 0, total = 0;
    for (const w of new Set(a)) {
      const p = peso(w);
      total += p;
      if (bset.has(w)) acierto += p;
    }
    if (!total) return 0;
    let s = acierto / total;

    const ta = tamanoDe(mio), tb = tamanoDe(suyo);
    const igual = mismoTamano(ta, tb);

    // Un tamaño que no cuadra es la señal más fiable de que no son el
    // mismo producto: el Tito's de 750 y el de 1.75 comparten todas las
    // palabras y son artículos distintos en el estante.
    if (igual === false) s *= 0.35;
    else if (igual === true) s = Math.min(1, s + 0.12);

    return s;
  }

  // Afinidad de familia. No decide por sí sola, pero desempata: un vino
  // tuyo no debería emparejar con un licor por mucho que coincida el
  // nombre de la bodega.
  function familiaDe(cat) {
    const c = String(cat || '').toUpperCase();
    if (/WINE|CHARD|CABERNET|PINOT|SAUVIGNON|ROSE|PROSECCO|CHAMPAGNE|SPARKL/.test(c)) return 'WINE';
    if (/BEER|ALE|LAGER|IPA|CIDER|SELTZER|DRAFT|KEG/.test(c)) return 'BEER';
    if (/SODA|JUICE|WATER|MIXER|TEA|COFFEE|NA |NON.?ALC/.test(c)) return 'NA_BEVERAGES';
    if (!c) return '';
    return 'LIQUOR';
  }

  // ── Traer el catálogo ──────────────────────────────────────────────

  async function traerCatalogo(unitId, avisar) {
    _prods = [];
    _otros = [];
    _diag = { sinCategoria: 0, desconocidas: 0, muestraIds: [] };
    let cursor = null, tipos = null, todas = null, vistos = 0, vueltas = 0;

    do {
      const r = await llamar('catalog', {
        restaurantUnitId: unitId,
        nextPage: cursor || undefined,
        tipos: tipos || undefined,
        todas: todas || undefined
      });

      if (r.productos) _prods = _prods.concat(r.productos);
      // El resto del catálogo se guarda igual: el buscador a mano no
      // puede depender de que el filtro de categorías esté bien.
      if (r.otros) _otros = _otros.concat(r.otros);
      vistos += r.vistos || 0;
      _diag.sinCategoria += r.sinCategoria || 0;
      _diag.desconocidas += r.desconocidas || 0;
      for (const id of (r.muestraIds || [])) {
        if (_diag.muestraIds.length < 6) _diag.muestraIds.push(id);
      }
      if (r.tipos) tipos = r.tipos;
      if (r.todas) todas = r.todas;

      if (!r.ok && !_prods.length && !_otros.length) {
        throw new Error(r.error || 'Could not read the catalog');
      }

      // Un error a media faena no tira lo ya recogido, pero hay que
      // decirlo: emparejar contra medio catálogo da falsos "sin pareja"
      // y eso lleva a dar de alta productos que ya existen.
      if (r.error) return { bebida: _prods.length, vistos, incompleto: true, error: r.error };

      cursor = r.nextPage || null;
      vueltas++;
      if (avisar) avisar(_prods.length, vistos);
    } while (cursor && vueltas < MAX_VUELTAS);

    return { bebida: _prods.length, otros: _otros.length, vistos, incompleto: !!cursor };
  }

  // ── Calcular el trabajo ────────────────────────────────────────────

  function calcular() {
    construirIdf(_prods.map(p => p.name));
    const master = (window.state && state.master) || [];

    _filas = master.map((r, idx) => {
      if (r.marginedgeId) {
        const ya = _prods.find(p => String(p.id) === String(r.marginedgeId));
        return { idx, row: r, estado: 'hecho', elegido: String(r.marginedgeId),
                 candidatos: ya ? [ya] : [], puntos: [] };
      }

      const fam = familiaDe(r.category);
      const puntuados = _prods
        .map(p => {
          let s = puntuar(r.item, p.name);
          if (fam && p.type) s *= (p.type === fam ? 1.06 : 0.80);
          return { p, s: Math.min(1, s) };
        })
        .filter(x => x.s >= MINIMO)
        .sort((a, b) => b.s - a.s)
        .slice(0, MAX_CANDIDATOS);

      if (!puntuados.length) {
        return { idx, row: r, estado: 'huerfano', elegido: null, candidatos: [], puntos: [] };
      }

      // Seguro sólo si el primero es muy bueno Y el segundo no se le
      // acerca: dos candidatos empatados son justo donde una decisión
      // automática se equivoca.
      const [p1, p2] = puntuados;
      const claro = p1.s >= SEGURO && (!p2 || p1.s - p2.s > 0.12);

      return {
        idx, row: r,
        estado: claro ? 'auto' : 'revisar',
        elegido: claro ? String(p1.p.id) : null,
        candidatos: puntuados.map(x => x.p),
        puntos: puntuados.map(x => x.s)
      };
    });
  }

  // ── Guardar ────────────────────────────────────────────────────────

  async function guardar(fila, productId) {
    const { url, key } = cfg();
    const P = window.BarStockParIntelligence;
    const locId = P && P.fetchLocationId ? await P.fetchLocationId() : null;
    if (!url || !key || !locId) return false;

    const r = await fetch(
      `${url}/rest/v1/inventory_items?location_id=eq.${locId}` +
      `&code=eq.${encodeURIComponent(fila.row.code || '')}` +
      `&item_name=eq.${encodeURIComponent(fila.row.item || '')}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: key, Authorization: `Bearer ${key}`,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ marginedge_id: productId || null })
      });

    if (!r.ok) return false;

    fila.row.marginedgeId = productId || null;
    if (window.state && state.master && state.master[fila.idx]) {
      state.master[fila.idx].marginedgeId = productId || null;
    }
    return true;
  }

  // ── Pintar ─────────────────────────────────────────────────────────

  function cuentas() {
    const c = { hecho: 0, auto: 0, revisar: 0, huerfano: 0 };
    for (const f of _filas || []) c[f.estado]++;
    return c;
  }

  function pastilla(p, sel, s) {
    const etiqueta = s != null && s >= MINIMO
      ? '<span class="mem-conf ' + (s >= SEGURO ? 'hi' : 'mid') + '">' +
        (s >= SEGURO ? 'near certain' : 'might be') + '</span>'
      : '';
    const meta = [p.type, p.price != null ? p.price + ' ' + (p.unit || '') : '']
      .filter(Boolean).join(' · ');

    return '<div class="mem-cand' + (sel ? ' pick' : '') + '" data-pick="' + esc(p.id) + '">' +
      '<i class="mem-ck">' + (sel ? '✓' : '') + '</i>' +
      '<div class="mem-txt"><b>' + esc(p.name) + '</b><span>' + esc(meta) + '</span></div>' +
      etiqueta + '</div>';
  }

  function pintarFila(f) {
    const r = f.row;
    const cands = f.candidatos
      .map((p, i) => pastilla(p, String(f.elegido || '') === String(p.id), (f.puntos || [])[i]))
      .join('');

    const buscador = _buscando === f.idx
      ? '<div class="mem-find"><input type="text" class="ui-control" data-q="' + f.idx +
        '" placeholder="Type part of the name…" autocomplete="off"></div>' +
        '<div class="mem-hits" data-hits="' + f.idx + '"></div>'
      : '<div class="mem-cand none" data-find="' + f.idx + '">' +
        (f.candidatos.length ? 'None of these · search MarginEdge' : 'Search MarginEdge') +
        '</div>';

    return '<div class="mem-row" data-idx="' + f.idx + '">' +
      '<div class="mem-mine"><b>' + esc(r.item) + '</b><span>' +
        esc([r.category || 'No category', r.vendor || 'No vendor',
             (Number(r.onHand) || 0) + ' on hand'].join(' · ')) +
      '</span></div>' +
      '<div class="mem-cands">' + cands + buscador + '</div></div>';
  }

  function tab(id, texto, n) {
    return '<button type="button" class="mem-chip' + (_tab === id ? ' on' : '') +
      '" data-tab="' + id + '">' + esc(texto) + ' · ' + n + '</button>';
  }

  // El filtro de categorías es la pieza que más silenciosamente puede
  // fallar: si descarta de más, los productos desaparecen y la pantalla
  // dice "no match" como si no existieran. Cuando hay señales de que no
  // está reconociendo las categorías, se dice en voz alta.
  function aviso() {
    if (!_diag) return '';
    const d = _diag;
    if (!d.desconocidas && !d.sinCategoria) return '';
    return '<div class="mem-warn">' +
      '<b>Heads up — the category filter may be dropping products.</b> ' +
      esc(String(d.desconocidas)) + ' products point at a category that is not in ' +
      'the category list' +
      (d.muestraIds.length ? ' (e.g. ' + esc(d.muestraIds.slice(0, 3).join(', ')) + ')' : '') +
      (d.sinCategoria ? ', and ' + esc(String(d.sinCategoria)) + ' have no category at all' : '') +
      '. Search still looks at the whole catalog, ' + esc(String((_otros || []).length)) +
      ' more products included, so you can find them by hand.</div>';
  }

  function pintar() {
    const host = document.getElementById('memBody');
    if (!host) return;

    const c = cuentas();
    const total = _filas.length || 1;
    const hechos = c.hecho + c.auto;

    const cab = document.getElementById('memHead');
    if (cab) {
      cab.innerHTML =
        '<div class="mem-bar">' +
          '<i style="width:' + (hechos / total * 100) + '%;background:#10b981"></i>' +
          '<i style="width:' + (c.revisar / total * 100) + '%;background:#f59e0b"></i>' +
          '<i style="width:' + (c.huerfano / total * 100) + '%;background:#94a3b8"></i>' +
        '</div>' +
        '<div class="mem-leg">' +
          '<span><i class="mem-dot" style="background:#10b981"></i><b>' + hechos + '</b> matched</span>' +
          '<span><i class="mem-dot" style="background:#f59e0b"></i><b>' + c.revisar + '</b> need your eye</span>' +
          '<span><i class="mem-dot" style="background:#94a3b8"></i><b>' + c.huerfano + '</b> no match found</span>' +
        '</div>' +
        '<div class="mem-chips">' +
          tab('revisar', 'Need your eye', c.revisar) +
          tab('auto', 'Matched', hechos) +
          tab('huerfano', 'No match', c.huerfano) +
        '</div>' + aviso();

      cab.querySelectorAll('[data-tab]').forEach(b => {
        b.onclick = () => { _tab = b.dataset.tab; _buscando = null; pintar(); };
      });
    }

    const visibles = _filas.filter(f =>
      _tab === 'auto' ? (f.estado === 'auto' || f.estado === 'hecho') : f.estado === _tab);

    host.innerHTML = visibles.length
      ? visibles.map(pintarFila).join('')
      : '<div class="mem-empty">Nothing here. Try another tab.</div>';

    enganchar(host);
  }

  function enganchar(host) {
    host.querySelectorAll('[data-find]').forEach(el => {
      el.onclick = () => {
        _buscando = Number(el.dataset.find);
        pintar();
        const inp = host.querySelector('[data-q="' + _buscando + '"]');
        if (inp) inp.focus();
      };
    });

    host.querySelectorAll('[data-q]').forEach(inp => {
      inp.oninput = () => buscar(host, Number(inp.dataset.q), inp.value);
      inp.onkeydown = e => { if (e.key === 'Escape') { _buscando = null; pintar(); } };
    });

    host.querySelectorAll('[data-pick]').forEach(el => { el.onclick = () => elegir(el); });
  }

  // El buscador no puntúa: busca lo que escribes, literal. Es la salida
  // de emergencia cuando el algoritmo no ha acertado, así que meterle
  // el mismo criterio que ya falló no tendría sentido.
  function buscar(host, idx, q) {
    const cont = host.querySelector('[data-hits="' + idx + '"]');
    if (!cont) return;

    const t = String(q || '').trim().toUpperCase();
    if (t.length < 2) { cont.innerHTML = ''; return; }

    // Busca en TODO el catálogo, no sólo en lo que el filtro de
    // categorías dejó pasar. Si el filtro se equivoca, esta es la única
    // forma de encontrar un producto que sí existe.
    const hits = _prods.concat(_otros)
      .filter(p => p.name.toUpperCase().includes(t)).slice(0, MAX_HITS);
    cont.innerHTML = hits.length
      ? hits.map(p => pastilla(p, false, null)).join('')
      : '<div class="mem-empty" style="padding:10px 2px">Nothing matches that.</div>';

    cont.querySelectorAll('[data-pick]').forEach(el => { el.onclick = () => elegir(el); });
  }

  async function elegir(el) {
    if (_busy) return;
    const caja = el.closest('.mem-row');
    if (!caja) return;
    const fila = _filas.find(f => f.idx === Number(caja.dataset.idx));
    if (!fila) return;

    _busy = true;
    el.classList.add('saving');
    const id = el.dataset.pick || null;
    const ok = await guardar(fila, id);
    _busy = false;

    if (!ok) {
      el.classList.remove('saving');
      if (window.setStatus) setStatus('Could not save the match.');
      return;
    }

    // Lo elegido a mano entra en la lista de candidatos para que la
    // pastilla marcada se vea al repintar.
    if (id && !fila.candidatos.some(p => String(p.id) === String(id))) {
      const p = _prods.find(x => String(x.id) === String(id));
      if (p) { fila.candidatos = [p]; fila.puntos = []; }
    }

    fila.elegido = id;
    fila.estado = id ? 'hecho' : 'huerfano';
    _buscando = null;
    pintar();
  }

  // ── Entrada ────────────────────────────────────────────────────────

  async function abrir(unitId) {
    const host = document.getElementById('memBody');
    if (host) host.innerHTML = '<div class="mem-empty">Reading the MarginEdge catalog…</div>';
    _buscando = null;
    _tab = 'revisar';

    try {
      const info = await traerCatalogo(unitId, (n, v) => {
        if (host) host.innerHTML = '<div class="mem-empty">Reading the MarginEdge catalog… ' +
          '<b>' + n + '</b> beverage products so far, out of ' + v + ' scanned.</div>';
      });

      if (info.incompleto && window.setStatus) {
        setStatus('Only part of the catalog came through: ' + (info.error || 'rate limited') +
                  '. Some items may show as unmatched.');
      }

      if (!info.bebida) {
        if (host) host.innerHTML = '<div class="mem-empty">No beverage products came back. ' +
          'Check the restaurant is the right one in Integrations.</div>';
        return;
      }

      calcular();
      pintar();
    } catch (e) {
      if (host) host.innerHTML = '<div class="mem-empty">' + esc(String(e.message || e)) + '</div>';
    }
  }

  window.BarStockMarginEdgeMatch = { abrir, _puntuar: puntuar, _tamanoDe: tamanoDe };
})();
