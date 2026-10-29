(() => {
  if (window.BarStockMarginEdgeConnect) return;

  // ── Conectar una locación, de una ────────────────────────────────────
  //
  // Hasta ahora, dar de alta un restaurante nuevo eran SEIS pasos, y
  // cuatro de ellos dentro de un panel de diagnóstico: abrir
  // Developer tools, pulsar "Restaurantes", elegir el tuyo, pulsar
  // "Sync catalog" —a veces varias veces, porque el servidor corta a
  // los diez segundos—, pulsar "Sync invoices", y después emparejar
  // 265 botellas a mano.
  //
  // Nada de eso es una decisión tuya salvo una: cuál de los
  // restaurantes que ve la clave es esta locación. Todo lo demás es
  // trabajo que puede hacer la máquina.
  //
  // ── Los cuatro pasos ─────────────────────────────────────────────
  //
  //   1. Encontrar el restaurante (o preguntarlo, si hay varios).
  //   2. Copiar el catálogo, reanudándose solo hasta terminar.
  //   3. Traer las facturas del ciclo abierto.
  //   4. Emparejar lo OBVIO.
  //
  // El cuarto es el que convierte "conectado" en "listo". Sin él
  // terminas la conexión y te esperan 265 botellas a mano, que es
  // justo donde se abandona.
  //
  // ── Qué cuenta como obvio ────────────────────────────────────────
  //
  // Nombre idéntico una vez ignoras mayúsculas, acentos y apóstrofes
  // —el mismo `norm()` de toda la app— Y que el tamaño no se
  // contradiga. Nada más.
  //
  // Lo que se parece pero no es idéntico NO se toca: un emparejado
  // equivocado carga las compras de un producto a otra botella, y eso
  // es peor que no emparejar. Esos se quedan en "need your eye".

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Un lote generoso pero no infinito: PostgREST acepta el POST
  // entero, y con 265 vínculos esto es una sola petición.
  const LOTE = 200;
  // El bucle del catálogo se reanuda solo; este tope es para que un
  // cursor que no avanza no gire para siempre.
  const MAX_VUELTAS = 120;

  let _estado = null;   // null = sin arrancar · {pasos, hecho, error}
  let _corriendo = false;

  function I() { return window.BarStockIntegrations || null; }
  function M() { return window.BarStockMarginEdgeMatch || null; }

  function cfg() {
    const c = window.BARSTOCK_CONFIG || {};
    return { url: c.SUPABASE_URL, key: c.SUPABASE_KEY, loc: c.LOCATION_NAME || '' };
  }

  function master() { return (window.state && window.state.master) || []; }

  function norm(x) {
    const m = M();
    if (m && m._norm) { try { return m._norm(x); } catch (e) {} }
    return String(x == null ? '' : x)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/['‘’´`]/g, '')
      .replace(/[^A-Z0-9]+/g, ' ').trim();
  }

  // ── Paso 1 · qué restaurante ───────────────────────────────────────

  async function restaurantes() {
    const api = I();
    if (!api || !api.llamar) throw new Error('Integrations module not loaded.');
    const r = await api.llamar('units', {});
    if (!r || !r.ok) throw new Error((r && r.error) || 'MarginEdge did not answer.');
    const lista = r.muestra || r.datos || [];
    return (Array.isArray(lista) ? lista : []).map(o => api.idYNombre(o))
      .filter(x => x.id);
  }

  // ── Paso 2 · el catálogo ───────────────────────────────────────────
  //
  // El servidor corta a los 6,5 segundos y devuelve dónde se quedó.
  // Antes eso se traducía en "pulsa otra vez"; aquí se vuelve a
  // llamar solo hasta que no queda cursor.
  async function catalogo(unitId, locId, avisar) {
    const api = I();
    let cursor = null, tipos = null, total = 0, vueltas = 0;

    do {
      const r = await api.llamar('sync-catalog', {
        restaurantUnitId: unitId, locationId: locId,
        nextPage: cursor || undefined, tipos: tipos || undefined
      });
      total += (r && r.guardados) || 0;
      if (r && r.tipos) tipos = r.tipos;

      // Un corte no es un fallo: el servidor dejó apuntado dónde iba.
      // Sólo se rinde si además no avanzó nada.
      if (r && r.error && !r.nextPage) throw new Error(r.error);

      cursor = (r && r.nextPage) || null;
      vueltas++;
      avisar(total);
    } while (cursor && vueltas < MAX_VUELTAS);

    return total;
  }

  // ── Paso 3 · las facturas del ciclo ────────────────────────────────

  // ── Al conectar se trae HISTORIA, no sólo el ciclo ─────────────────
  //
  // La primera versión pedía desde el arranque del ciclo. En una
  // locación recién conectada eso puede ser hoy mismo, así que no
  // bajaba casi nada: faltaban facturas que sí habían llegado y no
  // había forma de saber por qué.
  //
  // Son 45 días: cubre un mes natural con margen y sigue siendo un
  // rango que MarginEdge contesta sin ahogarse. La PANTALLA sigue
  // enseñando sólo el ciclo abierto — eso es una decisión de qué
  // mirar, no de qué guardar, y son cosas distintas.
  const DIAS_ALTA = 45;

  function desdeAlta() {
    const W = window.BarStockWeeklyCycle;
    const t = W && W.resetAt ? W.resetAt() : null;
    const ciclo = t ? new Date(t).getTime() : null;
    const atras = Date.now() - DIAS_ALTA * 86400000;
    // El más antiguo de los dos: si el ciclo lleva más de 45 días
    // abierto, se respeta el ciclo entero.
    const desde = ciclo && ciclo < atras ? ciclo : atras;
    // En LOCAL. `toISOString()` da UTC, y pedir un día de menos es
    // gratis mientras que pedir uno de más pierde facturas.
    const d = new Date(desde);
    const z = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }

  async function facturas(unitId, locId, avisar) {
    const api = I();
    const startDate = desdeAlta();
    const endDate = new Date().toISOString().slice(0, 10);

    // Fase 1 · cabeceras
    let cursor = null, pedidos = [], vueltas = 0;
    do {
      const r = await api.llamar('sync-invoices', {
        restaurantUnitId: unitId, locationId: locId,
        startDate, endDate, nextPage: cursor || undefined
      });
      if (r && r.pedidos) pedidos = pedidos.concat(r.pedidos);
      if (r && r.error && !r.nextPage) throw new Error(r.error);
      cursor = (r && r.nextPage) || null;
      vueltas++;
      avisar(pedidos.length, 0);
    } while (cursor && vueltas < MAX_VUELTAS);

    if (!pedidos.length) return { facturas: 0, lineas: 0 };

    // Fase 2 · líneas, en tandas, reanudándose
    const meta = {};
    for (const p of pedidos) meta[p.id] = p;

    let pos = 0, lineas = 0, giros = 0;
    const ids = pedidos.map(p => p.id);
    while (pos < ids.length && giros < MAX_VUELTAS) {
      const r = await api.llamar('sync-invoices', {
        restaurantUnitId: unitId, locationId: locId,
        orderIds: ids.slice(pos, pos + 12), meta
      });
      const n = (r && r.hechos) || 0;
      lineas += (r && r.lineas) || 0;
      // Si una tanda no avanza nada, se para: mejor decir lo que hay
      // que girar sin fin pidiéndole a una API que nos está frenando.
      if (!n) break;
      pos += n;
      giros++;
      avisar(pedidos.length, pos);
    }

    return { facturas: pedidos.length, lineas };
  }

  // ── Paso 4 · emparejar lo obvio ────────────────────────────────────

  async function emparejar(locId, avisar) {
    const { url, key } = cfg();
    const m = M();
    if (!m || !m.leerTodas) return { hechos: 0, dudosos: 0 };

    const filas = master();
    if (!filas.length) return { hechos: 0, dudosos: 0 };

    const [catalogoFilas, yaFilas] = await Promise.all([
      m.leerTodas(url, key, locId),
      (async () => {
        const r = await fetch(
          `${url}/rest/v1/marginedge_links?location_id=eq.${locId}&select=item_name&limit=5000`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } });
        return r.ok ? await r.json() : [];
      })()
    ]);

    // Las botellas que ya tienen producto no se tocan.
    const yaTiene = new Set((yaFilas || []).map(x => norm(x.item_name)));

    // Índice por nombre normalizado. Si DOS productos distintos dan la
    // misma clave, ninguno es obvio: elegir uno al azar es exactamente
    // el error que esto quiere evitar.
    const porNombre = new Map();
    for (const p of catalogoFilas) {
      const k = norm(p.name);
      if (!k) continue;
      if (porNombre.has(k)) porNombre.set(k, null);   // ambiguo
      else porNombre.set(k, p);
    }

    const nuevos = [];
    let dudosos = 0;

    for (const r of filas) {
      const k = norm(r.item);
      if (!k || yaTiene.has(k)) continue;
      const p = porNombre.get(k);
      if (!p) { dudosos++; continue; }

      // El tamaño no puede contradecir. "Tito's 750" y "Tito's 1.75L"
      // comparten todas las palabras y son dos botellas distintas del
      // estante; si una de las dos no declara tamaño, no se descarta.
      if (m._tamanoDe) {
        const ta = m._tamanoDe(r.item), tb = m._tamanoDe(p.name);
        if (ta && tb && ta !== tb) { dudosos++; continue; }
      }

      nuevos.push({
        location_id: locId,
        product_id: String(p.id != null ? p.id : p.product_id),
        code: r.code || '',
        item_name: r.item || ''
      });
    }

    for (let i = 0; i < nuevos.length; i += LOTE) {
      const lote = nuevos.slice(i, i + LOTE);
      const r = await fetch(
        `${url}/rest/v1/marginedge_links?on_conflict=location_id,product_id`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: key, Authorization: `Bearer ${key}`,
            Prefer: 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify(lote)
        });
      if (!r.ok) throw new Error(await r.text());
      avisar(Math.min(i + LOTE, nuevos.length));
    }

    return { hechos: nuevos.length, dudosos };
  }

  // ── El orquestador ─────────────────────────────────────────────────

  const PASOS = [
    { id: 'unit',  t: 'Restaurant found' },
    { id: 'cat',   t: 'Copying the catalog' },
    { id: 'inv',   t: 'Invoices of this cycle' },
    { id: 'match', t: 'Matching what is obvious' }
  ];

  function arranca() {
    _estado = { fase: 0, detalle: {}, error: '', hecho: null };
  }

  function paso(i, texto) {
    if (!_estado) return;
    _estado.fase = Math.max(_estado.fase, i);
    _estado.detalle[PASOS[i].id] = texto;
    pintar();
  }

  async function conectar(unitId, nombreUnit) {
    if (_corriendo) return;
    _corriendo = true;
    arranca();
    pintar();

    const api = I();
    try {
      const locId = await api.locationId();
      if (!locId) throw new Error('No location.');

      await api.guardarUnidad(unitId);
      if (api.guardarNombreUnidad) api.guardarNombreUnidad(nombreUnit || '');
      paso(0, nombreUnit || unitId);

      paso(1, 'starting…');
      const prods = await catalogo(unitId, locId,
        n => paso(1, n.toLocaleString('en-US') + ' products so far'));
      paso(1, prods.toLocaleString('en-US') + ' products');

      paso(2, 'reading…');
      const inv = await facturas(unitId, locId,
        (n, hechas) => paso(2, hechas ? hechas + ' of ' + n + ' invoices' : n + ' found'));
      paso(2, inv.facturas + (inv.facturas === 1 ? ' invoice' : ' invoices') +
              ' · ' + inv.lineas + ' lines');

      paso(3, 'comparing…');
      const em = await emparejar(locId, n => paso(3, n + ' matched'));
      paso(3, em.hechos + ' matched automatically');

      _estado.hecho = {
        productos: prods, facturas: inv.facturas,
        emparejados: em.hechos, dudosos: em.dudosos
      };
    } catch (e) {
      _estado.error = String(e && e.message || e);
    } finally {
      _corriendo = false;
      pintar();
      // La pantalla de Conexiones vuelve a leer sus cifras.
      if (api && api.render) { try { api.render(); } catch (e) {} }
    }
  }

  // ── Pintar ─────────────────────────────────────────────────────────

  let _unidades = null;   // lista cuando hay que preguntar

  function pintar() {
    const el = document.getElementById('meConectar');
    if (!el) return;

    if (_estado) { el.innerHTML = vistaProgreso(); enganchar(el); return; }
    if (_unidades) { el.innerHTML = vistaElegir(); enganchar(el); return; }
    el.innerHTML = vistaInicio();
    enganchar(el);
  }

  function vistaInicio() {
    return '<div class="me-card mec">' +
      '<div class="mec-h">Connect MarginEdge</div>' +
      '<div class="mec-s">One button. It figures out the rest and tells you when it is done.</div>' +
      '<button type="button" class="mec-big" id="mecGo">Connect this location</button>' +
      '<div class="mec-will">' +
        '<div>· find which restaurant this location is</div>' +
        '<div>· copy the product catalog</div>' +
        '<div>· pull the invoices of the open cycle</div>' +
        '<div><b>· match every bottle whose name is an exact match</b></div>' +
      '</div>' +
      '<div class="mec-note">Nothing is written to your inventory, orders or prices. ' +
      'Matching only records which MarginEdge product is which bottle.</div>' +
    '</div>';
  }

  function vistaElegir() {
    return '<div class="me-card mec">' +
      '<div class="mec-h">Which one is ' + esc(cfg().loc || 'this location') + '?</div>' +
      '<div class="mec-s">Your key sees ' + _unidades.length +
        ' restaurants. This is saved per location, so the other keeps its own.</div>' +
      '<div class="mec-pick">' +
        _unidades.map((u, i) =>
          '<button type="button" class="mec-opt" data-u="' + i + '">' +
            esc(u.nombre || u.id) + '</button>').join('') +
      '</div>' +
    '</div>';
  }

  function vistaProgreso() {
    const e = _estado;

    if (e.hecho) {
      const h = e.hecho;
      return '<div class="me-card mec">' +
        '<div class="mec-h">' + esc(cfg().loc || 'This location') + ' is connected</div>' +
        '<div class="mec-s">From now on it keeps itself up to date on its own.</div>' +
        '<div class="me-nums" style="margin:12px 0 2px">' +
          '<div><b>' + h.productos.toLocaleString('en-US') + '</b><span>products</span></div>' +
          '<div><b>' + h.emparejados + '</b><span>matched</span></div>' +
          '<div><b>' + h.facturas + '</b><span>invoices</span></div>' +
        '</div>' +
        (h.dudosos
          ? '<div class="mec-alert">' +
              '<span class="t">' + h.dudosos + ' bottles need your eye' +
                '<small>The name is close but not identical — worth a look</small></span>' +
              '<button type="button" class="me-ghost" id="mecMatch">Match them</button>' +
            '</div>'
          : '') +
        '<div class="mec-note">Matched because the name is identical once you ignore case, ' +
        'accents and apostrophes, and the size agrees. Anything less certain is left alone.</div>' +
      '</div>';
    }

    const filas = PASOS.map((p, i) => {
      const estado = e.error && i === e.fase ? 'mal'
                   : i < e.fase ? 'ok'
                   : i === e.fase ? 'run' : 'esp';
      const ico = estado === 'ok' ? '✓' : estado === 'mal' ? '!' : String(i + 1);
      return '<div class="mec-step">' +
        '<span class="mec-ic ' + estado + '">' + (estado === 'run' ? '●' : ico) + '</span>' +
        '<span class="mec-st' + (estado === 'esp' ? ' esp' : '') + '">' +
          '<b>' + esc(p.t) + '</b>' +
          '<span>' + esc(e.detalle[p.id] || (estado === 'esp' ? 'waiting' : '')) + '</span>' +
        '</span></div>';
    }).join('');

    return '<div class="me-card mec">' +
      '<div class="mec-h">Setting up ' + esc(cfg().loc || 'this location') + '</div>' +
      '<div class="mec-s">Leave this open. It picks itself up if MarginEdge slows it down.</div>' +
      filas +
      (e.error
        ? '<div class="mec-err">' + esc(e.error) +
          '<br>Nothing was lost — press again and it carries on from here.</div>' +
          '<button type="button" class="mec-big" id="mecGo">Try again</button>'
        : '') +
    '</div>';
  }

  function enganchar(el) {
    // Todos los onclick ANTES de cualquier salida: en este panel ya
    // han nacido botones muertos dos veces por engancharlos tarde.
    const go = el.querySelector('#mecGo');
    if (go) go.onclick = () => empezar(go);

    const mm = el.querySelector('#mecMatch');
    if (mm) mm.onclick = () => window.showSettingsPanel('meMatch');

    el.querySelectorAll('[data-u]').forEach(b => {
      b.onclick = () => {
        const u = _unidades[Number(b.dataset.u)];
        if (!u) return;
        _unidades = null;
        conectar(u.id, u.nombre);
      };
    });
  }

  async function empezar(btn) {
    if (btn) btn.disabled = true;
    try {
      // Si ya hubo un intento, se reanuda con el restaurante elegido.
      const api = I();
      const ya = api && api.unidad && api.unidad();
      if (ya) { _estado = null; return conectar(ya, api.nombreUnidad && api.nombreUnidad()); }

      const lista = await restaurantes();
      if (!lista.length) throw new Error('The key does not see any restaurant.');
      if (lista.length === 1) { _estado = null; return conectar(lista[0].id, lista[0].nombre); }
      _unidades = lista;
      pintar();
    } catch (e) {
      arranca();
      _estado.error = String(e && e.message || e);
      pintar();
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // Se enseña el asistente mientras la locación no tenga catálogo
  // copiado: con catálogo, lo que hace falta es la pantalla de estado,
  // no un botón de alta.
  function montar() {
    _estado = null;
    _unidades = null;
    pintar();
  }

  // ── Buscar facturas nuevas, sin asistente ──────────────────────────
  //
  // Lo que pide el botón de la tarjeta del Home: traer lo que haya
  // entrado desde el último vistazo. No copia el catálogo ni empareja
  // nada — eso es dar de alta una locación y se hace una vez.
  //
  // Vive aquí y no en el Home porque el Home no debe saber hablar con
  // MarginEdge: ya tuvimos dos lectores de lo mismo dando cifras
  // distintas, y no hace falta un tercero.
  async function buscarFacturas() {
    const api = I();
    if (!api) throw new Error('Integrations module not loaded.');
    const unitId = api.unidad && api.unidad();
    if (!unitId) throw new Error('This location is not connected yet.');
    const locId = await api.locationId();
    if (!locId) throw new Error('No location.');
    return facturas(unitId, locId, () => {});
  }

  window.BarStockMarginEdgeConnect = {
    montar, pintar, conectar, buscarFacturas,
    _emparejar: emparejar, _catalogo: catalogo, _facturas: facturas
  };
})();
