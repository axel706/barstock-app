(() => {
  if (window.BarStockMarginEdgeMatch) return;

  // ── Emparejar el inventario con el catálogo de MarginEdge ───────────
  //
  // Se hace una vez. A partir de ahí cada artículo lleva el
  // `companyConceptProductId` de MarginEdge y el vínculo deja de
  // depender del nombre: da igual que mañana alguien escriba "TITOS" o
  // "Tito's Handmade", la pareja aguanta.
  //
  // Eso es lo que arregla de raíz el problema que arrastran
  // `sales-fix.js` y los 94 UNKNOWN: hoy se empareja comparando texto
  // en cada pasada, y el texto cambia.
  //
  // ── Por qué sólo bebida ──────────────────────────────────────────
  //
  // El catálogo de MarginEdge es el restaurante entero: comida,
  // químicos y desechables incluidos. De las 94 categorías sólo 13 son
  // de bebida (BEER, LIQUOR, WINE, NA_BEVERAGES). Sin ese filtro habría
  // que buscar 300 botellas entre varios miles de líneas.
  //
  // ── Por qué se empieza por las dudosas ───────────────────────────
  //
  // Lo que empareja solo no necesita que nadie lo mire. Obligar a pasar
  // por 212 aciertos para llegar a las 56 decisiones de verdad es la
  // forma más rápida de que esta pantalla se abandone a la mitad.

  const TIPOS_BEBIDA = ['BEER', 'LIQUOR', 'WINE', 'NA_BEVERAGES'];

  // Umbrales de `scoreMatch`, que va de 0 a 1.
  //   SEGURO — se da por bueno sin preguntar
  //   MINIMO — por debajo de esto ni se ofrece como candidato: una
  //            sugerencia mala es peor que ninguna, porque la gente
  //            confirma lo que ya viene marcado
  const SEGURO = 0.92;
  const MINIMO = 0.34;
  const MAX_CANDIDATOS = 3;

  let _prods = null;    // productos de bebida de MarginEdge
  let _filas = null;    // el trabajo calculado
  let _tab = 'revisar';
  let _busy = false;

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

  // ── Traer el catálogo ──────────────────────────────────────────────

  // El cruce con categorías y el filtro de bebida los hace el servidor:
  // el catálogo completo son varios miles de productos con campos que
  // esta pantalla no usa, y no tiene sentido traerlos al navegador para
  // tirar el 95 %.
  async function traerCatalogo(unitId) {
    const r = await llamar('catalog', { restaurantUnitId: unitId });
    if (!r.ok) throw new Error(r.error || 'Could not read the catalog');
    _prods = r.productos || [];
    return { bebida: _prods.length, deCatalogo: r.deCatalogo, incompleto: r.incompleto };
  }

  // ── Calcular el trabajo ────────────────────────────────────────────

  function calcular() {
    const master = (window.state && state.master) || [];
    const puntuar = window.scoreMatch;

    _filas = master.map((r, idx) => {
      if (r.marginedgeId) {
        const ya = _prods.find(p => String(p.id) === String(r.marginedgeId));
        return { idx, row: r, estado: 'hecho', elegido: r.marginedgeId, candidatos: ya ? [ya] : [] };
      }

      const puntuados = _prods
        .map(p => ({ p, s: puntuar ? puntuar(p.name, r.item) : 0 }))
        .filter(x => x.s >= MINIMO)
        .sort((a, b) => b.s - a.s)
        .slice(0, MAX_CANDIDATOS);

      if (!puntuados.length) {
        return { idx, row: r, estado: 'huerfano', elegido: null, candidatos: [] };
      }

      // Seguro sólo si el primero es muy bueno Y no hay un segundo que
      // se le parezca: dos candidatos empatados son justo el caso en el
      // que una decisión automática se equivoca.
      const [p1, p2] = puntuados;
      const claro = p1.s >= SEGURO && (!p2 || p1.s - p2.s > 0.15);

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

  function chipTipo(t) {
    return t ? '<span class="mem-type">' + esc(t) + '</span>' : '';
  }

  function pintarFila(f) {
    const r = f.row;
    const conf = (f.puntos || [])[0];

    const cands = f.candidatos.map((p, i) => {
      const id = String(p.id);
      const sel = String(f.elegido || '') === id;
      const s = (f.puntos || [])[i];
      const etiqueta = i === 0 && s != null
        ? '<span class="mem-conf ' + (s >= SEGURO ? 'hi' : 'mid') + '">' +
          (s >= SEGURO ? 'near certain' : 'might be') + '</span>'
        : '';
      return '<div class="mem-cand' + (sel ? ' pick' : '') + '" data-pick="' + esc(id) + '">' +
        '<i class="mem-ck">' + (sel ? '✓' : '') + '</i>' +
        esc(p.name) + etiqueta +
        '<span class="mem-meta">' + esc(p.type) +
        (p.price != null ? ' · ' + p.price + ' ' + esc(p.unit || '') : '') +
        '</span></div>';
    }).join('');

    return '<div class="mem-row" data-idx="' + f.idx + '">' +
      '<div class="mem-mine"><b>' + esc(r.item) + '</b><span>' +
        esc([r.category || 'No category', r.vendor || 'No vendor',
             (Number(r.onHand) || 0) + ' on hand'].join(' · ')) +
      '</span></div>' +
      '<div class="mem-arrow">→</div>' +
      '<div class="mem-cands">' + cands +
        '<div class="mem-cand none" data-pick="">' +
          (f.estado === 'huerfano'
            ? 'Nothing in MarginEdge looks like this'
            : 'None of these') +
        '</div>' +
      '</div></div>';
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
          '<i style="width:' + (hechos / total * 100) + '%;background:#34d399"></i>' +
          '<i style="width:' + (c.revisar / total * 100) + '%;background:#f59e0b"></i>' +
          '<i style="width:' + (c.huerfano / total * 100) + '%;background:#475569"></i>' +
        '</div>' +
        '<div class="mem-leg">' +
          '<span><i class="mem-dot" style="background:#34d399"></i><b>' + hechos + '</b> matched</span>' +
          '<span><i class="mem-dot" style="background:#f59e0b"></i><b>' + c.revisar + '</b> need your eye</span>' +
          '<span><i class="mem-dot" style="background:#475569"></i><b>' + c.huerfano + '</b> no match in MarginEdge</span>' +
        '</div>' +
        '<div class="mem-chips">' +
          tab('revisar', 'Need your eye', c.revisar) +
          tab('auto', 'Matched for you', c.auto + c.hecho) +
          tab('huerfano', 'No match', c.huerfano) +
        '</div>';

      cab.querySelectorAll('[data-tab]').forEach(b => {
        b.onclick = () => { _tab = b.dataset.tab; pintar(); };
      });
    }

    const visibles = _filas.filter(f =>
      _tab === 'auto' ? (f.estado === 'auto' || f.estado === 'hecho') : f.estado === _tab);

    host.innerHTML = visibles.length
      ? visibles.map(pintarFila).join('')
      : '<div class="mem-empty">Nothing here. Try another tab.</div>';

    host.querySelectorAll('[data-pick]').forEach(el => {
      el.onclick = async () => {
        if (_busy) return;
        const fila = _filas.find(f => f.idx === Number(el.closest('.mem-row').dataset.idx));
        if (!fila) return;

        _busy = true;
        el.classList.add('saving');
        const id = el.dataset.pick || null;
        const ok = await guardar(fila, id);
        _busy = false;

        if (!ok) {
          el.classList.remove('saving');
          if (window.setStatus) setStatus('Could not save the match. Is the marginedge_id column there?');
          return;
        }

        fila.elegido = id;
        fila.estado = id ? 'hecho' : 'huerfano';
        pintar();
      };
    });
  }

  function tab(id, texto, n) {
    return '<button type="button" class="mem-chip' + (_tab === id ? ' on' : '') +
      '" data-tab="' + id + '">' + esc(texto) + ' · ' + n + '</button>';
  }

  // ── Entrada ────────────────────────────────────────────────────────

  async function abrir(unitId) {
    const host = document.getElementById('memBody');
    if (host) host.innerHTML = '<div class="mem-empty">Reading the MarginEdge catalog…</div>';

    try {
      const info = await traerCatalogo(unitId);
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

  window.BarStockMarginEdgeMatch = { abrir, TIPOS_BEBIDA };
})();
