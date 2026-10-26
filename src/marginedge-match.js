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
  const BEBIDA = ['BEER','LIQUOR','WINE','NA_BEVERAGES'];

  const RUIDO = new Set(['THE','AND','OF','A','BOTTLE','BTL','BOT','CASE','CS',
    'EA','EACH','PACK','PK','CAN','CANS','NR','LN','LOOSE','PREMIUM','BRAND']);

  let _prods = null;   // los de categoría de bebida
  let _otros = null;   // el resto del catálogo, sólo para el buscador
  let _diag = null;
  let _vinculos = new Map();

  // ── Por qué las filas recién tocadas no se van ──────────────────
  //
  // Al elegir el primer producto la fila cambia de estado y, con el
  // filtro por pestaña, desaparecía al instante. Para añadir el segundo
  // —el mismo vino en 1.5 L, pongamos— había que cambiar de pestaña y
  // volver a buscarla. Nadie descubre así que se puede.
  //
  // Lo que tocas en esta visita se queda a la vista hasta que cambias
  // de pestaña o vuelves a entrar.
  let _reciente = new Set();
  let _dueno = new Map();
  let _porId = new Map();
  let _idf = null;
  let _filas = null;
  let _tab = 'revisar';
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

  // ── El catálogo sale de Supabase, no de MarginEdge ────────────────
  //
  // MarginEdge limita a un par de peticiones por segundo y el catálogo
  // pasa de los miles de productos: leerlo en vivo cada vez que se abre
  // esta pantalla daba 429 siempre. No era un problema de reintentos,
  // era la pregunta mal hecha.
  //
  // Ahora se copia una vez a `marginedge_products` —despacio, con
  // pausas— y aquí se lee esa copia en una sola consulta. Instantáneo y
  // sin límite que lo corte a la mitad.

  // ── PostgREST corta a 1000 filas ───────────────────────────────────
  //
  // Y no avisa: devuelve mil y parece que eso es todo lo que hay. El
  // sync había guardado más de diez mil productos y esta pantalla veía
  // mil, ordenados por tipo — BEER y FOOD—, así que LIQUOR y WINE
  // simplemente no existían para la app. Horas buscando por qué Tito's
  // no estaba en el catálogo, y estaba.
  //
  // Se lee por tramos hasta que una página venga corta.
  const PAGINA = 1000;
  const MAX_FILAS = 60000;

  async function leerTodas(url, key, locId) {
    let todas = [];
    for (let desde = 0; desde < MAX_FILAS; desde += PAGINA) {
      const r = await fetch(
        `${url}/rest/v1/marginedge_products?location_id=eq.${locId}` +
        `&select=product_id,name,type,price,unit&order=product_id.asc` +
        `&limit=${PAGINA}&offset=${desde}`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } });

      if (!r.ok) throw new Error('Could not read the saved catalog: ' + (await r.text()));
      const trozo = await r.json();
      if (!Array.isArray(trozo)) throw new Error('Unexpected response.');
      todas = todas.concat(trozo);
      if (trozo.length < PAGINA) break;
    }
    return todas;
  }

  async function traerCatalogo() {
    const { url, key } = cfg();
    const P = window.BarStockParIntelligence;
    const locId = P && P.fetchLocationId ? await P.fetchLocationId() : null;
    if (!url || !key || !locId) throw new Error('No location.');

    const filas = await leerTodas(url, key, locId);

    const todo = filas.map(f => ({
      id: String(f.product_id), name: f.name || '',
      type: f.type || '', price: f.price, unit: f.unit || ''
    }));

    // Se emparejan primero los de categoría de bebida; el resto queda
    // disponible para el buscador, porque el filtro de categorías ya
    // demostró que puede dejar fuera vinos que sí existen.
    _prods = todo.filter(p => BEBIDA.includes(p.type));
    _otros = todo.filter(p => !BEBIDA.includes(p.type));
    _diag = null;

    return { bebida: _prods.length, otros: _otros.length, total: todo.length };
  }

  // ── Los vínculos ──────────────────────────────────────────────────
  //
  // Un artículo tuyo puede tener VARIOS productos de MarginEdge: el
  // mismo vino de la casa en 750 ml y en 1.5 L, o el mismo producto a
  // dos proveedores con fichas distintas. Todas esas compras caen en la
  // misma botella del estante.
  //
  // Al revés no: un producto de MarginEdge pertenece a un solo artículo
  // tuyo. Por eso la clave de la tabla es el producto.

  function clave(r) { return (r.code || '') + '||' + (r.item || ''); }

  async function leerVinculos(url, key, locId) {
    let todas = [];
    for (let desde = 0; desde < MAX_FILAS; desde += PAGINA) {
      const r = await fetch(
        `${url}/rest/v1/marginedge_links?location_id=eq.${locId}` +
        `&select=product_id,code,item_name&order=product_id.asc` +
        `&limit=${PAGINA}&offset=${desde}`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (!r.ok) throw new Error('Could not read the matches: ' + (await r.text()));
      const trozo = await r.json();
      if (!Array.isArray(trozo)) break;
      todas = todas.concat(trozo);
      if (trozo.length < PAGINA) break;
    }

    _vinculos = new Map();
    _dueno = new Map();
    for (const v of todas) {
      const k = (v.code || '') + '||' + (v.item_name || '');
      if (!_vinculos.has(k)) _vinculos.set(k, []);
      _vinculos.get(k).push(String(v.product_id));
      // Quién tiene ya ese producto. La clave de la tabla es el
      // producto, así que asignarlo a otro artículo se lo quita al
      // primero — y eso no puede pasar sin que se vea.
      _dueno.set(String(v.product_id), { clave: k, nombre: v.item_name || '' });
    }
    return todas.length;
  }

  async function vincular(fila, productId) {
    const id = String(productId);
    const ya = _dueno.get(id);

    // Un producto pertenece a un solo artículo. Si ya es de otro, esto
    // se lo quita: hay que decirlo antes, no después.
    if (ya && ya.clave !== clave(fila.row)) {
      const sigue = window.confirm(
        '"' + (_porId.get(id)?.name || id) + '" is already matched to "' + ya.nombre +
        '".\n\nMatching it here will remove it from there. Continue?');
      if (!sigue) return 'cancelado';
    }

    const { url, key } = cfg();
    const locId = await locationId();
    if (!url || !key || !locId) return false;

    const r = await fetch(`${url}/rest/v1/marginedge_links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key, Authorization: `Bearer ${key}`,
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        location_id: locId,
        product_id: String(productId),
        code: fila.row.code || '',
        item_name: fila.row.item || ''
      })
    });
    if (!r.ok) return false;

    if (!fila.enlaces.includes(id)) fila.enlaces.push(id);
    _dueno.set(id, { clave: clave(fila.row), nombre: fila.row.item || '' });

    // Si se lo quitamos a otra fila de esta misma sesión, hay que
    // reflejarlo ahí también o la pantalla mentiría hasta recargar.
    if (ya && ya.clave !== clave(fila.row)) {
      const otra = _filas && _filas.find(f => clave(f.row) === ya.clave);
      if (otra) {
        otra.enlaces = otra.enlaces.filter(x => x !== id);
        otra.productos = otra.productos.filter(p => p && String(p.id) !== id);
        if (!otra.enlaces.length) otra.estado = 'huerfano';
        _reciente.add(otra.idx);
      }
    }
    return true;
  }

  async function desvincular(fila, productId) {
    const { url, key } = cfg();
    const locId = await locationId();
    if (!url || !key || !locId) return false;

    const r = await fetch(
      `${url}/rest/v1/marginedge_links?location_id=eq.${locId}` +
      `&product_id=eq.${encodeURIComponent(productId)}`,
      { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return false;

    fila.enlaces = fila.enlaces.filter(x => x !== String(productId));
    return true;
  }

  async function locationId() {
    const P = window.BarStockParIntelligence;
    return P && P.fetchLocationId ? await P.fetchLocationId() : null;
  }

  // ── Calcular el trabajo ────────────────────────────────────────────

  function calcular() {
    construirIdf(_prods.map(p => p.name));
    const master = (window.state && state.master) || [];
    _porId = new Map(_prods.concat(_otros).map(p => [String(p.id), p]));
    const porId = _porId;

    _filas = master.map((r, idx) => {
      const enlaces = (_vinculos.get(clave(r)) || []).slice();

      if (enlaces.length) {
        return { idx, row: r, estado: 'hecho', enlaces,
                 productos: enlaces.map(id => porId.get(id)).filter(Boolean),
                 candidatos: [], puntos: [] };
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

      return {
        idx, row: r, enlaces: [], productos: [],
        estado: puntuados.length ? 'revisar' : 'huerfano',
        candidatos: puntuados.map(x => x.p),
        puntos: puntuados.map(x => x.s)
      };
    });
  }

  // ── Pintar ─────────────────────────────────────────────────────────

  function cuentas() {
    const c = { hecho: 0, revisar: 0, huerfano: 0 };
    for (const f of _filas || []) c[f.estado]++;
    return c;
  }

  function meta(p) {
    return [p.type, p.price != null ? p.price + ' ' + (p.unit || '') : '']
      .filter(Boolean).join(' · ');
  }

  // Candidato por confirmar
  function pastilla(p, s) {
    const etiqueta = s != null && s >= MINIMO
      ? '<span class="mem-conf ' + (s >= SEGURO ? 'hi' : 'mid') + '">' +
        (s >= SEGURO ? 'near certain' : 'might be') + '</span>'
      : '';
    return '<div class="mem-cand" data-pick="' + esc(p.id) + '">' +
      '<i class="mem-ck"></i>' +
      '<div class="mem-txt"><b>' + esc(p.name) + '</b><span>' + esc(meta(p)) + '</span></div>' +
      etiqueta + '</div>';
  }

  // Vínculo ya hecho. Lleva su propio botón de quitar: sin él, un
  // emparejado equivocado no había forma de deshacerlo.
  function enlace(p, id) {
    const nombre = p ? p.name : '(not in the saved catalog)';
    const sub = p ? meta(p) : 'id ' + id;
    return '<div class="mem-cand pick">' +
      '<i class="mem-ck">✓</i>' +
      '<div class="mem-txt"><b>' + esc(nombre) + '</b><span>' + esc(sub) + '</span></div>' +
      '<button type="button" class="mem-x" data-drop="' + esc(id) + '" ' +
      'title="Remove this match">Remove</button></div>';
  }

  function pintarFila(f) {
    const r = f.row;
    const hecho = f.estado === 'hecho';

    const cuerpo = hecho
      ? f.enlaces.map((id, i) => enlace(f.productos[i], id)).join('')
      : f.candidatos.map((p, i) => pastilla(p, (f.puntos || [])[i])).join('');

    const buscador = _buscando === f.idx
      ? '<div class="mem-find"><input type="text" class="ui-control" data-q="' + f.idx +
        '" placeholder="Type part of the name…" autocomplete="off"></div>' +
        '<div class="mem-hits" data-hits="' + f.idx + '"></div>'
      : '<div class="mem-cand none" data-find="' + f.idx + '">' +
        (hecho ? 'Add another MarginEdge product'
               : (f.candidatos.length ? 'None of these · search MarginEdge'
                                      : 'Search MarginEdge')) +
        '</div>';

    return '<div class="mem-row" data-idx="' + f.idx + '">' +
      '<div class="mem-mine"><b>' + esc(r.item) + '</b><span>' +
        esc([r.category || 'No category', r.vendor || 'No vendor',
             (Number(r.onHand) || 0) + ' on hand'].join(' · ')) +
      '</span></div>' +
      '<div class="mem-cands">' + cuerpo + buscador + '</div></div>';
  }

  function tab(id, texto, n) {
    return '<button type="button" class="mem-chip' + (_tab === id ? ' on' : '') +
      '" data-tab="' + id + '">' + esc(texto) + ' · ' + n + '</button>';
  }

  function pintar() {
    const host = document.getElementById('memBody');
    if (!host) return;

    const c = cuentas();
    const total = _filas.length || 1;

    const cab = document.getElementById('memHead');
    if (cab) {
      cab.innerHTML =
        '<div class="mem-bar">' +
          '<i style="width:' + (c.hecho / total * 100) + '%;background:#10b981"></i>' +
          '<i style="width:' + (c.revisar / total * 100) + '%;background:#f59e0b"></i>' +
          '<i style="width:' + (c.huerfano / total * 100) + '%;background:#94a3b8"></i>' +
        '</div>' +
        '<div class="mem-leg">' +
          '<span><i class="mem-dot" style="background:#10b981"></i><b>' + c.hecho + '</b> matched</span>' +
          '<span><i class="mem-dot" style="background:#f59e0b"></i><b>' + c.revisar + '</b> need your eye</span>' +
          '<span><i class="mem-dot" style="background:#94a3b8"></i><b>' + c.huerfano + '</b> no match found</span>' +
        '</div>' +
        '<div class="mem-chips">' +
          tab('revisar', 'Need your eye', c.revisar) +
          tab('hecho', 'Matched', c.hecho) +
          tab('huerfano', 'No match', c.huerfano) +
        '</div>';

      cab.querySelectorAll('[data-tab]').forEach(b => {
        b.onclick = () => { _tab = b.dataset.tab; _buscando = null; _reciente.clear(); pintar(); };
      });
    }

    const visibles = _filas.filter(f => f.estado === _tab || _reciente.has(f.idx));

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
    host.querySelectorAll('[data-drop]').forEach(el => { el.onclick = () => quitar(el); });
  }

  // El buscador no puntúa: busca lo que escribes, literal. Es la salida
  // cuando el algoritmo no acertó, así que aplicarle el mismo criterio
  // que ya falló no tendría sentido. Y mira TODO el catálogo, no sólo
  // las categorías de bebida.
  function buscar(host, idx, q) {
    const cont = host.querySelector('[data-hits="' + idx + '"]');
    if (!cont) return;

    const t = String(q || '').trim().toUpperCase();
    if (t.length < 2) { cont.innerHTML = ''; return; }

    const hits = _prods.concat(_otros)
      .filter(p => p.name.toUpperCase().includes(t)).slice(0, MAX_HITS);

    cont.innerHTML = hits.length
      ? hits.map(p => pastilla(p, null)).join('')
      : '<div class="mem-empty" style="padding:10px 2px">Nothing matches that.</div>';

    cont.querySelectorAll('[data-pick]').forEach(el => { el.onclick = () => elegir(el); });
  }

  function filaDe(el) {
    const caja = el.closest('.mem-row');
    if (!caja) return null;
    return _filas.find(f => f.idx === Number(caja.dataset.idx)) || null;
  }

  // ── Un candado por elemento, no uno global ────────────────────────
  //
  // Antes había un `_busy` único: mientras un guardado estaba en vuelo,
  // cualquier otro clic se descartaba EN SILENCIO. Yendo rápido por la
  // lista se perdían emparejados sin que nada lo dijera, y la fila se
  // redibujaba justo después como si hubiera pasado algo.
  //
  // Las filas son independientes, así que pueden guardarse a la vez.
  async function elegir(el) {
    if (el.dataset.saving === '1') return;
    const fila = filaDe(el);
    if (!fila) return;

    el.dataset.saving = '1';
    el.classList.add('saving');
    const ok = await vincular(fila, el.dataset.pick);
    el.dataset.saving = '';

    if (ok === 'cancelado') { el.classList.remove('saving'); return; }
    if (!ok) {
      el.classList.remove('saving');
      if (window.setStatus) setStatus('Could not save the match.');
      return;
    }

    const p = _prods.concat(_otros).find(x => String(x.id) === String(el.dataset.pick));
    if (p && !fila.productos.some(x => x && String(x.id) === String(p.id))) fila.productos.push(p);

    fila.estado = 'hecho';
    _reciente.add(fila.idx);
    _buscando = null;
    pintar();
  }

  async function quitar(el) {
    if (el.dataset.saving === '1') return;
    const fila = filaDe(el);
    if (!fila) return;

    el.dataset.saving = '1';
    el.closest('.mem-cand').classList.add('saving');
    const id = el.dataset.drop;
    const ok = await desvincular(fila, id);
    el.dataset.saving = '';

    if (!ok) {
      el.closest('.mem-cand').classList.remove('saving');
      if (window.setStatus) setStatus('Could not remove the match.');
      return;
    }

    fila.productos = fila.productos.filter(p => p && String(p.id) !== String(id));
    _dueno.delete(String(id));
    _reciente.add(fila.idx);

    // Sin vínculos vuelve a la cola: se recalculan sus candidatos para
    // que puedas elegir otro sin buscarlo a mano.
    if (!fila.enlaces.length) {
      const fam = familiaDe(fila.row.category);
      const puntuados = _prods
        .map(p => {
          let s = puntuar(fila.row.item, p.name);
          if (fam && p.type) s *= (p.type === fam ? 1.06 : 0.80);
          return { p, s: Math.min(1, s) };
        })
        .filter(x => x.s >= MINIMO)
        .sort((a, b) => b.s - a.s)
        .slice(0, MAX_CANDIDATOS);
      fila.candidatos = puntuados.map(x => x.p);
      fila.puntos = puntuados.map(x => x.s);
      fila.estado = puntuados.length ? 'revisar' : 'huerfano';
    }

    pintar();
  }

  // ── Entrada ────────────────────────────────────────────────────────

  async function abrir(unitId) {
    const host = document.getElementById('memBody');
    if (host) host.innerHTML = '<div class="mem-empty">Reading the MarginEdge catalog…</div>';
    _buscando = null;
    _tab = 'revisar';
    _reciente.clear();

    try {
      const info = await traerCatalogo();
      await leerVinculos(cfg().url, cfg().key, await locationId());

      // Sin copia del catálogo no hay nada que emparejar, y conviene
      // decirlo con el remedio al lado en vez de dejar la lista vacía.
      if (!info.total) {
        if (host) host.innerHTML = '<div class="mem-empty">' +
          '<b>No catalog saved yet.</b><br>Go back to Integrations and press ' +
          '<b>Sync catalog</b>. It copies the MarginEdge catalog here once, ' +
          'slowly enough not to hit their rate limit. After that this screen ' +
          'opens instantly.</div>';
        return;
      }

      if (!info.bebida) {
        if (host) host.innerHTML = '<div class="mem-empty">' + info.total +
          ' products saved, but none are in a beverage category. ' +
          'Search still looks at all of them.</div>';
      }

      calcular();
      pintar();
    } catch (e) {
      if (host) host.innerHTML = '<div class="mem-empty">' + esc(String(e.message || e)) + '</div>';
    }
  }

  window.BarStockMarginEdgeMatch = { abrir, leerTodas, _puntuar: puntuar, _tamanoDe: tamanoDe };
})();
