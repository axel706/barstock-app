(() => {
  if (window.BarStockMarginEdgeUnclaimed) return;

  // ── Llegó y nadie lo reclama ─────────────────────────────────────────
  //
  // La pantalla de emparejar va de TUS botellas hacia fuera: recorre el
  // inventario y para cada artículo busca su producto. Eso deja un
  // agujero por el otro lado — un producto de MarginEdge que ninguna
  // botella reclama no aparece en ninguna parte: ni en la lista, ni en
  // los contadores, ni en un aviso.
  //
  // Y sus facturas se caen en silencio. Pasó de verdad: entró una
  // factura de "Smith & Hook Reserve Cabernet Sauvignon", el estante
  // tenía "Smith Hook Cabernet Sauvignon" emparejado con OTRO producto,
  // y el historial dijo que no había llegado nada. Ni un aviso. Media
  // hora para encontrarlo y sólo porque saltó a la vista en el móvil.
  //
  // Esta pantalla hace la pregunta al revés: de las facturas hacia tus
  // botellas. Es el único sitio desde el que ese agujero se ve.
  //
  // ── Tres decisiones ──────────────────────────────────────────────
  //
  // 1. PROPONE, no te hace buscar. Usa el mismo motor de parecido que
  //    la pantalla de emparejar —exportado, no copiado— y si hay una
  //    botella que encaja la ofrece a un toque. Eso es lo automático
  //    que faltaba.
  //
  // 2. Cuando no hay nada parecido, PREGUNTA en vez de adivinar. Un
  //    emparejado equivocado no es un error inocente: mueve dinero a
  //    la botella que no es, y eso es peor que no contarlo.
  //
  // 3. "Not mine" existe para que la lista pueda llegar a CERO.
  //    Siempre va a entrar comida y papel; sin salida, la lista nunca
  //    se vacía y en una semana se deja de mirar. Con ella, que
  //    aparezca algo aquí significa algo.
  //
  // ── El rango ─────────────────────────────────────────────────────
  //
  // Sólo el ciclo abierto. Con las 82 facturas históricas el primer
  // día salen cuarenta cosas de meses pasados y se abandona. Lo que
  // importa es lo que no está contado AHORA.

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const dinero = (n) => '$' + (Math.round((Number(n) || 0) * 100) / 100)
    .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // PostgREST corta en 1000 filas sin avisar. Ya costó caro una vez.
  const PAGINA = 1000;
  const MAX_PAGINAS = 40;

  // Por debajo de esto no se propone nada: más vale preguntar.
  const MINIMO = 0.42;

  let _lista = [];        // lo no reclamado, ya puntuado
  let _busy = new Set();  // por producto, nunca global

  function cfg() {
    const c = window.BARSTOCK_CONFIG || {};
    return { url: c.SUPABASE_URL, key: c.SUPABASE_KEY };
  }

  async function locationId() {
    const P = window.BarStockParIntelligence;
    return P && P.fetchLocationId ? await P.fetchLocationId() : null;
  }

  function motor() {
    return window.BarStockMarginEdgeMatch || null;
  }

  function master() {
    return (window.state && window.state.master) || [];
  }

  // Desde cuándo se mira. El arranque del ciclo; si no se sabe, los
  // últimos 14 días, que es más que una semana de compras y menos que
  // un historial entero.
  function desde() {
    // La fecha del reinicio en LOCAL, no cortando el ISO: `resetAt()`
    // es UTC y un ciclo reiniciado el 26 por la tarde en Pensilvania
    // es el 27 en UTC. Las facturas traen fecha sin hora —fecha
    // local—, así que comparar contra la UTC se comía el día entero
    // del reinicio. Faltaban dos facturas del 26 por esto.
    const W = window.BarStockWeeklyCycle;
    const t = (W && W.fechaInicioLocal) ? W.fechaInicioLocal() : '';
    if (t) return t;
    const d = new Date(Date.now() - 14 * 86400000);
    return d.toISOString().slice(0, 10);
  }

  async function leerPaginado(url, key, ruta) {
    let todo = [];
    for (let p = 0; p < MAX_PAGINAS; p++) {
      const r = await fetch(`${url}/rest/v1/${ruta}&limit=${PAGINA}&offset=${p * PAGINA}`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (!r.ok) throw new Error(await r.text());
      const trozo = await r.json();
      if (!Array.isArray(trozo) || !trozo.length) break;
      todo = todo.concat(trozo);
      if (trozo.length < PAGINA) break;
    }
    return todo;
  }

  // ── Qué llegó y nadie reclama ──────────────────────────────────────

  async function calcular() {
    const { url, key } = cfg();
    const locId = await locationId();
    if (!url || !key || !locId) throw new Error('No location.');

    const dia = desde();

    const [lineas, enlaces, descartados] = await Promise.all([
      leerPaginado(url, key,
        `marginedge_invoice_lines?location_id=eq.${locId}` +
        `&invoice_date=gte.${dia}` +
        `&select=product_id,vendor_item_name,vendor_name,quantity,line_price,` +
        `invoice_date,invoice_number&order=invoice_date.asc`),
      leerPaginado(url, key,
        `marginedge_links?location_id=eq.${locId}&select=product_id&order=product_id.asc`),
      leerPaginado(url, key,
        `marginedge_not_mine?location_id=eq.${locId}&select=product_id&order=product_id.asc`)
    ]);

    const tiene = new Set(enlaces.map(e => String(e.product_id)));
    const fuera = new Set(descartados.map(e => String(e.product_id)));

    // Agrupado por producto, no por línea: tres facturas del mismo vino
    // son una decisión, no tres.
    const porProd = new Map();
    for (const l of lineas) {
      const id = String(l.product_id || '');
      if (!id || tiene.has(id) || fuera.has(id)) continue;

      let g = porProd.get(id);
      if (!g) {
        g = { id, nombre: l.vendor_item_name || id, vendor: l.vendor_name || '',
              unidades: 0, dinero: 0, fecha: '', factura: '' };
        porProd.set(id, g);
      }
      g.unidades += Number(l.quantity) || 0;
      g.dinero += Number(l.line_price) || 0;
      // La más reciente: es la que tiene sentido enseñar.
      if (!g.fecha || (l.invoice_date && l.invoice_date > g.fecha)) {
        g.fecha = l.invoice_date || '';
        g.factura = l.invoice_number || '';
        if (l.vendor_name) g.vendor = l.vendor_name;
      }
    }

    const grupos = Array.from(porProd.values());

    // El nombre del catálogo manda sobre el del proveedor cuando se
    // tiene: es el que vas a ver en la pantalla de emparejar, y dos
    // nombres distintos para lo mismo confunden más que uno feo.
    const M = motor();
    if (M && M.leerTodas && grupos.length) {
      try {
        const cat = await M.leerTodas(url, key, locId);
        const porId = new Map(cat.map(p => [String(p.product_id), p]));
        for (const g of grupos) {
          const p = porId.get(g.id);
          if (p && p.name) { g.nombre = p.name; g.tipo = p.type || ''; }
        }
      } catch (e) { /* sin catálogo se usa el nombre del proveedor */ }
    }

    sugerir(grupos);

    // Lo caro primero: es donde está el dinero que no cuadra.
    grupos.sort((a, b) => b.dinero - a.dinero);
    _lista = grupos;
    return _lista;
  }

  // ── A qué botella se parece ────────────────────────────────────────
  //
  // El mismo motor de la pantalla de emparejar, al revés. Se importa
  // en vez de copiarse: dos motores darían dos respuestas distintas a
  // la misma pregunta según por dónde entraras.
  function sugerir(grupos) {
    const M = motor();
    const filas = master();
    if (!M || !M._puntuar || !filas.length) return;

    // El peso de cada palabra se calcula sobre el corpus que se va a
    // comparar. Sin esto, "WINE" pesaría lo mismo que "TITOS".
    if (M._idf) {
      try { M._idf(filas.map(r => r.item)); } catch (e) {}
    }

    for (const g of grupos) {
      const fam = M._familia ? M._familia(g.tipo || '') : '';
      let mejor = null, mejorS = 0;

      for (const r of filas) {
        let s = M._puntuar(r.item, g.nombre);
        if (fam && r.category && M._familia) {
          s *= (M._familia(r.category) === fam ? 1.06 : 0.80);
        }
        if (s > mejorS) { mejorS = s; mejor = r; }
      }

      if (mejor && mejorS >= MINIMO) { g.sugerida = mejor; g.puntos = mejorS; }
    }
  }

  // ── Escribir ───────────────────────────────────────────────────────

  async function asignar(productId, fila, nombreProd) {
    const { url, key } = cfg();
    const locId = await locationId();
    if (!url || !key || !locId) throw new Error('No location.');

    // `return=representation` a propósito: se comprueba que la fila se
    // escribió en vez de confiar en que un 2xx significa lo que
    // creemos. Esa confianza ya hizo perder emparejados en silencio.
    const r = await fetch(
      `${url}/rest/v1/marginedge_links?on_conflict=location_id,product_id`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key, Authorization: `Bearer ${key}`,
          Prefer: 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify({
          location_id: locId,
          product_id: String(productId),
          code: fila.code || '',
          item_name: fila.item || ''
        })
      });

    if (!r.ok) throw new Error(await r.text());
    const filas = await r.json();
    if (!Array.isArray(filas) || !filas.length) {
      throw new Error('The link did not save. Nothing was changed.');
    }
    return true;
  }

  // Quitar el vínculo y dejar el producto sin dueño otra vez.
  //
  // Reasignarlo a otra botella no necesita esto —el upsert mueve el
  // vínculo porque la clave es el producto—, pero sí hace falta para
  // deshacer: un enlace equivocado tiene que poder soltarse sin
  // obligarte a elegir una botella cualquiera para salir del paso.
  async function desenlazar(productId) {
    const { url, key } = cfg();
    const locId = await locationId();
    if (!url || !key || !locId) throw new Error('No location.');

    const r = await fetch(
      `${url}/rest/v1/marginedge_links?location_id=eq.${locId}` +
      `&product_id=eq.${encodeURIComponent(String(productId))}`, {
        method: 'DELETE',
        headers: { apikey: key, Authorization: `Bearer ${key}` }
      });
    if (!r.ok) throw new Error(await r.text());
    return true;
  }

  async function noEsMio(productId, nombre) {
    const { url, key } = cfg();
    const locId = await locationId();
    if (!url || !key || !locId) throw new Error('No location.');

    const r = await fetch(
      `${url}/rest/v1/marginedge_not_mine?on_conflict=location_id,product_id`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key, Authorization: `Bearer ${key}`,
          Prefer: 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify({
          location_id: locId,
          product_id: String(productId),
          product_name: String(nombre || '')
        })
      });

    if (!r.ok) throw new Error(await r.text());
    return true;
  }

  // ── Pintar ─────────────────────────────────────────────────────────

  function fichaBotella(r) {
    return [r.category, r.vendor, (Number(r.onHand) || 0) + ' on hand']
      .filter(Boolean).join(' · ');
  }

  function pintarItem(g, i) {
    const meta = [g.vendor, g.factura ? 'invoice ' + g.factura : '', g.fecha]
      .filter(Boolean).map(esc).join(' &middot; ');

    const cuanto = (Math.round(g.unidades * 100) / 100) +
      (g.unidades === 1 ? ' unit' : ' units');

    const acciones = g.sugerida
      ? '<div class="meu-acts">' +
          '<button type="button" class="meu-sug" data-si="' + i + '">' +
            '<span class="meu-tick">&#10003;</span>' +
            '<span class="meu-t">' + esc(g.sugerida.item) +
              '<small>' + esc(fichaBotella(g.sugerida)) + '</small></span>' +
          '</button>' +
          '<button type="button" class="meu-alt" data-otra="' + i + '">Another</button>' +
          '<button type="button" class="meu-no" data-no="' + i + '">Not mine</button>' +
        '</div>'
      : '<input type="search" class="meu-buscar" data-buscar="' + i + '" ' +
          'placeholder="Search your bottles…" autocomplete="off">' +
        '<div class="meu-res" data-res="' + i + '"></div>' +
        '<div class="meu-acts meu-derecha">' +
          '<button type="button" class="meu-no" data-no="' + i + '">Not mine</button>' +
        '</div>' +
        '<p class="meu-hint">Nothing here looks close enough to suggest. ' +
          'Better to ask than to guess: a wrong match moves money to the ' +
          'wrong bottle.</p>';

    return '<div class="meu-it" data-it="' + i + '">' +
      '<div class="meu-nm">' + esc(g.nombre) + '</div>' +
      '<div class="meu-meta">' + meta + '</div>' +
      '<div class="meu-qty">' + esc(cuanto) + ' &middot; <b>' + dinero(g.dinero) + '</b></div>' +
      '<div class="meu-ask">Is this one of yours?</div>' +
      acciones +
      '<div class="meu-aviso" data-aviso="' + i + '"></div>' +
    '</div>';
  }

  function pintar() {
    const host = document.getElementById('meuBody');
    if (!host) return;

    if (!_lista.length) {
      // El cero se dice, no se deja en blanco. Una lista vacía sin
      // explicación se lee como que algo no cargó.
      host.innerHTML = '<div class="meu-ok">' +
        '<b>Everything that arrived is counted.</b><br>' +
        'No invoice line in this cycle points at a product without a bottle.' +
        '</div>';
      return;
    }

    const total = _lista.reduce((s, g) => s + g.dinero, 0);

    host.innerHTML =
      '<p class="meu-sub">These came in on an invoice and no bottle on your shelf ' +
        'claims them, so nothing was added to your stock or your cycle.</p>' +
      '<p class="meu-money">' + dinero(total) + ' not counted</p>' +
      _lista.map(pintarItem).join('');

    enganchar(host);
  }

  function avisar(i, texto, malo) {
    const el = document.querySelector('[data-aviso="' + i + '"]');
    if (!el) return;
    el.className = 'meu-aviso' + (malo ? ' mal' : '');
    el.textContent = texto || '';
  }

  function quitarFicha(i) {
    const el = document.querySelector('[data-it="' + i + '"]');
    if (el) el.remove();
    _lista[i] = null;
    // Si ya no queda ninguna, se repinta para dar el mensaje de cero.
    if (!_lista.some(Boolean)) { _lista = []; pintar(); }
  }

  // Bloqueo POR PRODUCTO, nunca global. Un candado global se tragaba
  // los clics en silencio y se perdían emparejados sin que nada lo
  // dijera.
  async function conBloqueo(i, fn) {
    if (_busy.has(i)) return;
    _busy.add(i);
    try { await fn(); }
    catch (e) { avisar(i, String(e && e.message || e), true); }
    finally { _busy.delete(i); }
  }

  function enganchar(host) {
    host.querySelectorAll('[data-si]').forEach(b => {
      b.onclick = () => {
        const i = Number(b.dataset.si);
        const g = _lista[i];
        if (!g || !g.sugerida) return;
        conBloqueo(i, async () => {
          b.disabled = true;
          avisar(i, 'Linking…');
          await asignar(g.id, g.sugerida, g.nombre);
          quitarFicha(i);
        });
      };
    });

    host.querySelectorAll('[data-no]').forEach(b => {
      b.onclick = () => {
        const i = Number(b.dataset.no);
        const g = _lista[i];
        if (!g) return;
        conBloqueo(i, async () => {
          b.disabled = true;
          avisar(i, 'Dismissing…');
          await noEsMio(g.id, g.nombre);
          quitarFicha(i);
        });
      };
    });

    // "Another" convierte la ficha en buscador: la sugerencia estaba
    // mal y hay que elegir a mano.
    host.querySelectorAll('[data-otra]').forEach(b => {
      b.onclick = () => {
        const i = Number(b.dataset.otra);
        const g = _lista[i];
        if (!g) return;
        g.sugerida = null;
        const el = document.querySelector('[data-it="' + i + '"]');
        if (el) {
          el.outerHTML = pintarItem(g, i);
          enganchar(host);
          const inp = document.querySelector('[data-buscar="' + i + '"]');
          if (inp) inp.focus();
        }
      };
    });

    host.querySelectorAll('[data-buscar]').forEach(inp => {
      inp.oninput = () => buscar(Number(inp.dataset.buscar), inp.value);
    });
  }

  function buscar(i, q) {
    const caja = document.querySelector('[data-res="' + i + '"]');
    if (!caja) return;

    const t = String(q || '').trim().toUpperCase();
    if (t.length < 2) { caja.innerHTML = ''; return; }

    const hits = master()
      .filter(r => String(r.item || '').toUpperCase().includes(t))
      .slice(0, 6);

    if (!hits.length) { caja.innerHTML = '<div class="meu-vacio">Nothing matches.</div>'; return; }

    caja.innerHTML = hits.map((r, k) =>
      '<button type="button" class="meu-hit" data-hit="' + i + '" data-k="' + k + '">' +
        '<span class="meu-t">' + esc(r.item) +
          '<small>' + esc(fichaBotella(r)) + '</small></span>' +
      '</button>').join('');

    caja.querySelectorAll('[data-hit]').forEach(b => {
      b.onclick = () => {
        const r = hits[Number(b.dataset.k)];
        const g = _lista[i];
        if (!g || !r) return;
        conBloqueo(i, async () => {
          b.disabled = true;
          avisar(i, 'Linking…');
          await asignar(g.id, r, g.nombre);
          quitarFicha(i);
        });
      };
    });
  }

  // ── Abrir ──────────────────────────────────────────────────────────

  async function abrir() {
    const host = document.getElementById('meuBody');
    if (host) host.innerHTML = '<div class="meu-ok">Reading invoices…</div>';
    try {
      await calcular();
      pintar();
    } catch (e) {
      if (host) {
        host.innerHTML = '<div class="meu-ok mal">' + esc(String(e.message || e)) + '</div>';
      }
    }
  }

  // Cuántos hay, para el aviso de la pantalla de conexiones. Devuelve
  // el número y el dinero: "3 productos" no mueve a nadie, "$212 que
  // no están contados en tu ciclo" sí.
  async function resumen() {
    try {
      const l = await calcular();
      return { n: l.length, dinero: l.reduce((s, g) => s + g.dinero, 0) };
    } catch (e) {
      return { n: 0, dinero: 0, error: String(e && e.message || e) };
    }
  }

  // `asignar` y `noEsMio` los usa también la pantalla de facturas del
  // teléfono, que enlaza una línea sin salir de la factura. Se
  // exportan en vez de copiarse: dos sitios escribiendo en
  // `marginedge_links` con reglas ligeramente distintas es el fallo
  // que más veces ha mordido este proyecto.
  window.BarStockMarginEdgeUnclaimed = {
    abrir, resumen, asignar, noEsMio, desenlazar,
    _calcular: calcular, _sugerir: sugerir
  };
})();
