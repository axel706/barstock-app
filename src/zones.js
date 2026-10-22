(() => {
  if (window.BarStockZones) return;

  // ── Zonas · donde esta cada botella ──────────────────────────────────
  //
  // El caso: no estas en el restaurante, te escriben "no hay St Germain",
  // y abres el producto en el telefono para ver si hay y donde.
  //
  // Tres piezas:
  //
  //   1. La LISTA de zonas, en locations.zones. Vacia = apagado.
  //   2. La zona ACTIVA mientras escaneas, en este dispositivo.
  //   3. El REPARTO del ultimo conteo, en count_zones.
  //
  // ── Apagado por omision, y de verdad ─────────────────────────────────
  //
  // Sin zonas configuradas esto no pinta nada, no guarda nada y no pide
  // nada. El conteo se comporta exactamente como hoy. Es una funcion que
  // se enciende, no una que hay que aguantar.
  //
  // ── La zona activa vive en el dispositivo, no en la nube ─────────────
  //
  // Dos personas contando a la vez estan en sitios distintos: uno en la
  // barra y otro en el closet. Compartir la seleccion haria que al
  // cambiarla uno le cambiara la zona al otro a media pasada, y sus
  // botellas acabarian en el sitio equivocado sin que nada avisara.
  //
  // ── El reparto se escribe MIENTRAS se cuenta ─────────────────────────
  //
  // No al cerrar. Las preguntas de "¿hay o no hay?" llegan el mismo dia
  // del conteo, antes de que el ciclo se cierre. Se engancha al mismo
  // pulso de dos minutos que ya usa la sesion para avisar que sigue
  // viva.

  const LS = 'bs_zone_';

  let _zonas = null;      // array o null si no se ha cargado
  let _cargando = null;

  function cfg() {
    const c = window.BARSTOCK_CONFIG || {};
    return { url: c.SUPABASE_URL, key: c.SUPABASE_KEY, loc: c.LOCATION_NAME || '' };
  }

  function claveLocal() {
    const c = window.BARSTOCK_CONFIG || {};
    return LS + (c.ACCOUNT_ID || 'acc') + '__' + (c.LOCATION_NAME || 'loc');
  }

  async function locationId() {
    const P = window.BarStockParIntelligence;
    if (!P || typeof P.fetchLocationId !== 'function') return null;
    try { return await P.fetchLocationId(); } catch (e) { return null; }
  }

  // ── 1 · La lista ─────────────────────────────────────────────────────

  async function cargar(force) {
    if (_zonas && !force) return _zonas;
    if (_cargando) return _cargando;

    _cargando = (async () => {
      const { url, key, loc } = cfg();
      if (!url || !key || !loc) return [];
      try {
        const res = await fetch(
          `${url}/rest/v1/locations?name=eq.${encodeURIComponent(loc)}&select=zones`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } });
        const filas = await res.json();

        // Un objeto de error no es "no hay zonas". Si la columna todavia
        // no existe —migracion 018 sin correr— hay que decirlo, no
        // comportarse como si el usuario no hubiera configurado nada.
        if (!Array.isArray(filas)) {
          console.warn('[zonas] locations.zones no respondio (HTTP ' + res.status + '). ' +
            '¿Corriste la migracion 018?', JSON.stringify(filas).slice(0, 200));
          _zonas = [];
          return _zonas;
        }
        const z = (filas[0] && filas[0].zones) || [];
        _zonas = Array.isArray(z) ? z.filter(x => String(x || '').trim()) : [];
        return _zonas;
      } catch (e) {
        console.warn('[zonas] no se pudo leer la lista', e);
        _zonas = [];
        return _zonas;
      } finally {
        _cargando = null;
      }
    })();

    return _cargando;
  }

  function lista() { return _zonas || []; }
  function activas() { return lista().length > 0; }

  async function guardarLista(zonas) {
    const { url, key, loc } = cfg();
    if (!url || !key || !loc) throw new Error('No cloud connection.');

    // Limpieza antes de guardar: sin vacios y sin repetidos. Dos zonas
    // con el mismo nombre partirian el reparto de un producto en dos
    // filas que la pantalla no sabria juntar.
    const vistas = new Set();
    const limpias = [];
    for (const z of (zonas || [])) {
      const t = String(z || '').trim();
      if (!t) continue;
      const k = t.toLowerCase();
      if (vistas.has(k)) continue;
      vistas.add(k);
      limpias.push(t);
    }

    const res = await fetch(
      `${url}/rest/v1/locations?name=eq.${encodeURIComponent(loc)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal'
        },
        body: JSON.stringify({ zones: limpias })
      });
    if (!res.ok) throw new Error(res.status + ' · ' + (await res.text()).slice(0, 180));

    _zonas = limpias;

    // Si la zona que tenias seleccionada ya no existe, se suelta. Dejarla
    // puesta haria que las siguientes pasadas fueran a una zona que no
    // sale en ningun sitio.
    if (!limpias.includes(activa())) setActiva(limpias[0] || '');
    return limpias;
  }

  // ── 2 · La zona activa ───────────────────────────────────────────────

  function activa() {
    try { return localStorage.getItem(claveLocal()) || ''; } catch (e) { return ''; }
  }

  function setActiva(z) {
    try {
      const t = String(z || '').trim();
      if (t) localStorage.setItem(claveLocal(), t);
      else localStorage.removeItem(claveLocal());
    } catch (e) {}
  }

  // La zona con la que se guarda una pasada. Devuelve '' cuando la
  // funcion esta apagada, y entonces la pasada no lleva zona.
  function paraPasada() {
    if (!activas()) return '';
    const a = activa();
    return lista().includes(a) ? a : (lista()[0] || '');
  }

  // ── 3 · El reparto en la nube ────────────────────────────────────────
  //
  // Se reescribe entero el reparto de los articulos contados: primero se
  // borran sus filas y luego se insertan las nuevas.
  //
  // Borrar y reinsertar en vez de upsert porque una zona puede quedarse
  // en CERO. Si el lunes habia 2 en el closet y hoy no hay ninguna, un
  // upsert dejaria la fila vieja intacta y la pantalla seguiria mandando
  // gente al closet. Lo que desaparece tiene que desaparecer.
  //
  // Solo se tocan los articulos contados en esta sesion. Los demas
  // conservan el reparto de su ultimo conteo, que es justo lo que se
  // quiere: un producto que no se conto hoy no perdio su ubicacion.
  async function sincronizar() {
    if (!activas()) return 0;
    const S = window.BarStockCountSession;
    if (!S || !S.exists || !S.exists()) return 0;

    const { url, key } = cfg();
    const id = await locationId();
    if (!url || !key || !id) return 0;

    const tam = {};
    for (const r of (window.state && window.state.master) || []) {
      tam[r.item] = Number(r.bottleSizeMl) || 750;
    }

    const items = S.countedItems();
    if (!items.length) return 0;

    const ahora = new Date().toISOString();
    const filas = [];
    for (const item of items) {
      const porZona = S.bottlesByZone(item, tam[item] || 750);
      for (const [zona, botellas] of Object.entries(porZona)) {
        // Las pasadas sin zona no se guardan: no dicen donde esta nada,
        // que es la unica pregunta que contesta esta tabla.
        if (!zona) continue;
        filas.push({
          location_id: id,
          item_name: item,
          zone: zona,
          bottles: Math.round((Number(botellas) || 0) * 100) / 100,
          counted_at: ahora
        });
      }
    }

    try {
      const enc = items.map(i => '"' + String(i).replace(/"/g, '\\"') + '"').join(',');
      const del = await fetch(
        `${url}/rest/v1/count_zones?location_id=eq.${id}&item_name=in.(${encodeURIComponent(enc)})`,
        { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' } });
      if (!del.ok) throw new Error('DELETE ' + del.status + ' · ' + (await del.text()).slice(0, 160));

      if (!filas.length) return 0;

      const ins = await fetch(`${url}/rest/v1/count_zones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal'
        },
        body: JSON.stringify(filas)
      });
      if (!ins.ok) throw new Error('POST ' + ins.status + ' · ' + (await ins.text()).slice(0, 160));
      return filas.length;
    } catch (e) {
      // Que el reparto no suba NO puede romper el conteo. El conteo vive
      // en el telefono y es el dato que importa; esto es una comodidad
      // encima.
      console.warn('[zonas] no se pudo sincronizar el reparto', e);
      return 0;
    }
  }

  // ── Consultar donde esta un producto ─────────────────────────────────
  //
  // Devuelve { zonas: [{zona, botellas}], at } o null. `at` NUNCA es
  // opcional para quien pinte esto: "hay 1 en el closet" sin fecha manda
  // a alguien a buscar algo que pudo acabarse hace cuatro dias.
  async function donde(itemName) {
    const { url, key } = cfg();
    const id = await locationId();
    if (!url || !key || !id || !itemName) return null;
    try {
      const res = await fetch(
        `${url}/rest/v1/count_zones?location_id=eq.${id}` +
        `&item_name=eq.${encodeURIComponent(itemName)}&select=zone,bottles,counted_at`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      const filas = await res.json();
      if (!Array.isArray(filas) || !filas.length) return null;

      const orden = lista();
      const zonas = filas
        .map(f => ({ zona: f.zone, botellas: Number(f.bottles) || 0 }))
        .sort((a, b) => {
          const ia = orden.indexOf(a.zona), ib = orden.indexOf(b.zona);
          // Las zonas que ya no estan en la lista van al final, pero van:
          // tienen botellas contadas y esconderlas es perder inventario.
          if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
          return a.zona.localeCompare(b.zona);
        });

      return { zonas, at: filas[0].counted_at || null };
    } catch (e) {
      console.warn('[zonas] no se pudo leer el reparto de ' + itemName, e);
      return null;
    }
  }

  // ── Pintarlo ─────────────────────────────────────────────────────────
  //
  // Un solo sitio que dibuja el reparto, llamado desde los dos paneles y
  // el modal. Tres pantallas con su propia version del mismo bloque es
  // como acaban diciendo cosas distintas del mismo producto.
  //
  // La fecha va SIEMPRE, y no como adorno: "1 en el closet" de un conteo
  // de hace cuatro dias manda a alguien a buscar algo que ya se acabo.
  // Si pasa mas de una semana se avisa en ambar, porque a esas alturas
  // el dato es una pista, no un hecho.
  function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  function cuando(iso) {
    const t = Date.parse(iso || '');
    if (!isFinite(t)) return { txt: '', viejo: false };
    const dias = Math.floor((Date.now() - t) / 86400000);
    const f = new Date(t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (dias <= 0) return { txt: 'counted today', viejo: false };
    if (dias === 1) return { txt: 'counted yesterday', viejo: false };
    return { txt: 'counted ' + f + ' \u00b7 ' + dias + ' days ago', viejo: dias >= 7 };
  }

  function fmt(n) {
    return String(Math.round((Number(n) || 0) * 100) / 100);
  }

  async function pintarEn(hostId, itemName) {
    const host = document.getElementById(hostId);
    if (!host) return;
    if (!activas()) { host.innerHTML = ''; return; }

    host.innerHTML = '<div class="zw-wait">Looking…</div>';
    const d = await donde(itemName);

    if (!d || !d.zonas.length) {
      host.innerHTML = '<div class="zw-wait">Not counted by zone yet.</div>';
      return;
    }

    const c = cuando(d.at);
    host.innerHTML =
      '<div class="zw">' +
        d.zonas.map(z =>
          `<div class="zw-row${z.botellas <= 0 ? ' zw-zero' : ''}">
             <span class="zw-z">${esc(z.zona)}</span>
             <span class="zw-n">${fmt(z.botellas)}</span>
           </div>`).join('') +
        `<div class="zw-at${c.viejo ? ' zw-old' : ''}">${esc(c.txt)}</div>` +
      '</div>';
  }

  function invalidate() { _zonas = null; }

  window.BarStockZones = {
    cargar, lista, activas, guardarLista,
    activa, setActiva, paraPasada,
    sincronizar, donde, pintarEn, invalidate
  };
})();
