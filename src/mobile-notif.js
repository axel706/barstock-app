(() => {
  if (window.BarStockMobileNotif) return;

  // ── Centro de notificaciones ─────────────────────────────────────────
  //
  // Una campana a la izquierda de la banda, del mismo tamaño que el
  // engranaje, con un punto rojo cuando hay algo sin leer. Al pulsarla
  // se abre un panel flotante sobre la app con el fondo desenfocado —
  // no una pantalla nueva: esto se mira de paso, no se visita.
  //
  // ── No guarda avisos, los deriva ───────────────────────────────────
  //
  // Cada vez que se abre, arma la lista de lo que ya existe: el
  // registro de precios y los fallos de la app. Una tabla de avisos
  // sería una segunda copia de datos que ya están en otro sitio, y dos
  // copias acaban diciendo cosas distintas.
  //
  // Lo único que se guarda es cuáles cerraste, en
  // `marginedge_notif_descartadas`, y compartido entre dispositivos:
  // cerrar uno en el teléfono también lo quita del iPad.

  const UMBRAL = 5;       // % a partir del cual un cambio de precio avisa
  const MAX = 40;

  let _descartadas = null;   // Set de claves
  let _avisos = [];
  let _abierto = false;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

  const raf = f => (window.requestAnimationFrame || (g => setTimeout(g, 16)))(f);

  function cfg() {
    const c = window.BARSTOCK_CONFIG || {};
    return { url: c.SUPABASE_URL, key: c.SUPABASE_KEY };
  }

  async function locationId() {
    const P = window.BarStockParIntelligence;
    return P && P.fetchLocationId ? await P.fetchLocationId() : null;
  }

  function dinero(n) {
    return '$' + (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
  }

  // ── De dónde salen los avisos ────────────────────────────────────────

  async function leerDescartadas(url, key, locId) {
    const r = await fetch(
      `${url}/rest/v1/marginedge_notif_descartadas?location_id=eq.${locId}` +
      `&select=clave&limit=2000`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return new Set();
    const filas = await r.json();
    return new Set(Array.isArray(filas) ? filas.map(f => f.clave) : []);
  }

  async function precios(url, key, locId) {
    const r = await fetch(
      `${url}/rest/v1/marginedge_price_log?location_id=eq.${locId}` +
      `&select=id,item_name,price_before,price_after,invoice_number,invoice_date,` +
      `vendor_name,applied_at&order=applied_at.desc&limit=120`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return [];
    const filas = await r.json();
    if (!Array.isArray(filas)) return [];

    const out = [];
    for (const f of filas) {
      const a = Number(f.price_before), d = Number(f.price_after);
      if (!(a > 0)) continue;
      const pct = Math.round(((d - a) / a) * 1000) / 10;
      if (Math.abs(pct) < UMBRAL) continue;

      // La clave es la fila del registro: el mismo cambio no puede
      // volver con otro nombre y reaparecer después de cerrarlo.
      out.push({
        clave: 'precio:' + f.id,
        grupo: 'Prices',
        ico: pct > 0 ? 'ti-trending-up' : 'ti-trending-down',
        tono: pct > 0 ? 'up' : 'dn',
        t: esc(f.item_name) + (pct > 0 ? ' went up ' : ' dropped ') +
           Math.abs(pct) + '%',
        d: dinero(a) + ' → ' + dinero(d) +
           (f.vendor_name ? ' · ' + esc(f.vendor_name) : '') +
           (f.invoice_number ? ' · invoice ' + esc(f.invoice_number) : '') +
           (f.invoice_date ? ' · ' + esc(f.invoice_date) : ''),
        orden: f.applied_at || ''
      });
    }
    return out;
  }

  // Los fallos de la app que el sistema de burbujas dejó pendientes.
  // Viven en memoria, así que no necesitan clave estable ni se guardan.
  function fallosApp() {
    const T = window.BarStockToast;
    const p = (T && T.pendientes) ? T.pendientes() : [];
    return p.map((x, i) => ({
      clave: 'app:' + i + ':' + x.text,
      grupo: 'App',
      ico: x.tone === 'error' ? 'ti-alert-triangle' : 'ti-alert-circle',
      tono: 'warn',
      t: x.text,
      d: 'Happened while you were using the app',
      orden: 'zzz',
      efimero: true
    }));
  }

  async function cargar() {
    const { url, key } = cfg();
    const locId = await locationId();
    if (!url || !key || !locId) { _avisos = fallosApp(); return _avisos; }

    if (_descartadas === null) {
      try { _descartadas = await leerDescartadas(url, key, locId); }
      catch (e) { _descartadas = new Set(); }
    }

    let lista = [];
    try { lista = await precios(url, key, locId); } catch (e) {}

    _avisos = lista.filter(a => !_descartadas.has(a.clave))
      .concat(fallosApp())
      .sort((a, b) => String(b.orden).localeCompare(String(a.orden)))
      .slice(0, MAX);
    return _avisos;
  }

  async function descartar(aviso) {
    // Los de la app sólo viven en memoria: se quitan y ya.
    if (aviso.efimero) {
      const T = window.BarStockToast;
      if (T && T.olvidar) T.olvidar(aviso.t);
    } else {
      if (_descartadas) _descartadas.add(aviso.clave);
      const { url, key } = cfg();
      const locId = await locationId();
      if (url && key && locId) {
        try {
          await fetch(`${url}/rest/v1/marginedge_notif_descartadas` +
            `?on_conflict=location_id,clave`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json', apikey: key,
              Authorization: `Bearer ${key}`,
              Prefer: 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify({ location_id: locId, clave: aviso.clave })
          });
        } catch (e) { console.warn('[notif] no se pudo guardar el descarte', e); }
      }
    }
    _avisos = _avisos.filter(a => a.clave !== aviso.clave);
    pintarPanel();
    pintarCampana();
  }

  // ── La campana ───────────────────────────────────────────────────────

  function hueco() {
    const banda = document.getElementById('mBand');
    if (!banda) return null;
    let el = banda.querySelector('.m-band-note');
    if (!el) {
      el = document.createElement('span');
      el.className = 'm-band-note';
      banda.appendChild(el);
    }
    return el;
  }

  function pintarCampana() {
    const nota = hueco();
    if (!nota) return;
    const n = _avisos.length;
    nota.innerHTML =
      '<button type="button" class="m-ico m-ico-bell" id="mNotif" ' +
        'aria-label="' + (n ? n + ' notifications' : 'Notifications') + '">' +
        '<i class="ti ti-bell" aria-hidden="true"></i>' +
        (n ? '<span class="m-pip"></span>' : '') +
      '</button>';
    const b = nota.querySelector('#mNotif');
    if (b) b.onclick = abrir;
  }

  // ── El panel ─────────────────────────────────────────────────────────

  function pintarPanel() {
    const caja = document.getElementById('mNotifBody');
    if (!caja) return;

    if (!_avisos.length) {
      caja.innerHTML =
        '<div class="m-nf-vacio">' +
          '<i class="ti ti-bell-off" aria-hidden="true"></i>' +
          'Nothing new.<br>Price moves and app problems land here.' +
        '</div>';
      return;
    }

    // Agrupado, pero sin encabezado cuando sólo hay un grupo: un
    // título sobre una lista de una sola categoría no informa.
    const grupos = [];
    for (const a of _avisos) {
      let g = grupos.find(x => x.t === a.grupo);
      if (!g) { g = { t: a.grupo, items: [] }; grupos.push(g); }
      g.items.push(a);
    }

    caja.innerHTML = grupos.map(g =>
      (grupos.length > 1 ? '<div class="m-nf-lab">' + esc(g.t.toUpperCase()) + '</div>' : '') +
      g.items.map(a =>
        '<div class="m-nf" data-k="' + esc(a.clave) + '">' +
          '<i class="ti ' + esc(a.ico) + ' m-nf-i ' + esc(a.tono) + '" aria-hidden="true"></i>' +
          '<span class="m-nf-t"><b>' + a.t + '</b><span>' + a.d + '</span></span>' +
          '<button type="button" class="m-nf-x" data-x="' + esc(a.clave) + '" ' +
            'aria-label="Dismiss"><i class="ti ti-x" aria-hidden="true"></i></button>' +
        '</div>').join('')
    ).join('');

    caja.querySelectorAll('[data-x]').forEach(b => {
      b.onclick = () => {
        const a = _avisos.find(x => x.clave === b.dataset.x);
        if (a) descartar(a);
      };
    });
  }

  // ── Bloquear el documento mientras el panel está abierto ───────────
  //
  // Al llegar al final de la lista el gesto pasaba al documento de
  // debajo: el panel se quedaba fijo, la app se desplazaba por detrás,
  // y al intentar volver arriba no subía el panel sino la página.
  //
  // `overscroll-behavior: contain` corta el encadenado; esto además
  // impide que el documento se mueva en absoluto. En iOS no basta
  // `overflow:hidden`: hay que fijar el body y recordar dónde estaba.
  // ── Cinco intentos y la causa estaba un piso más abajo ────────────
  //
  // Antes esto fijaba el <body> con `top: -scrollY` y lo devolvía al
  // cerrar. Era un apaño contra un documento que rodaba, y traía lo
  // suyo: el body fijado quedaba más corto que la ventana y debajo
  // asomaba una franja negra sin nada que desenfocar, con la barra de
  // pestañas aparentemente subida encima.
  //
  // Ahora el armazón ya no deja rodar el documento —rueda #mScreens—
  // así que bloquear es sólo eso: parar ese contenedor. Sin mover
  // nada, sin recordar nada, sin franja.
  function caja() {
    const M = window.BarStockMobile;
    return (M && M.scroller) ? M.scroller() : null;
  }

  function bloquear() {
    const c = caja();
    if (c) c.classList.add('m-nf-quieto');
    // Red por si esto corre con el armazón a medio montar: sin
    // contenedor, se bloquea el documento a la antigua.
    else document.documentElement.classList.add('m-nf-abierto');
  }

  function desbloquear() {
    const c = caja();
    if (c) c.classList.remove('m-nf-quieto');
    document.documentElement.classList.remove('m-nf-abierto');
  }

  async function abrir() {
    if (_abierto) return cerrar();
    _abierto = true;
    bloquear();

    const fondo = document.createElement('div');
    fondo.id = 'mNotifBack';
    fondo.className = 'm-nf-back';
    // El panel va DENTRO del fondo —es el fondo quien lo centra— así
    // que el clic de cerrar tiene que mirar dónde cayó. Sin esto,
    // tocar cualquier aviso cerraría el panel.
    fondo.onclick = (e) => { if (e.target === fondo) cerrar(); };

    // ── La barrera del gesto ───────────────────────────────────────
    //
    // El CSS solo no basta en iOS: con `overscroll-behavior` y el body
    // fijado, arrastrar seguía moviendo la página por detrás y al
    // llegar al final de la lista uno se quedaba abajo sin poder
    // volver.
    //
    // Aquí se corta el gesto en origen: lo que no nace dentro de la
    // lista no desplaza nada. Y lo que nace dentro sólo desplaza la
    // lista, nunca el documento.
    // Y lo mismo con el gesto: ahora el panel está dentro, así que
    // sus touchmove pasan por aquí. Si se cancelaran todos, la lista
    // de avisos no se podría desplazar. Sólo muere lo que nace fuera.
    fondo.addEventListener('touchmove', e => {
      const p = document.getElementById('mNotifPanel');
      if (!p || !p.contains(e.target)) e.preventDefault();
    }, { passive: false });

    const panel = document.createElement('div');
    panel.id = 'mNotifPanel';
    panel.className = 'm-nf-panel';
    panel.innerHTML =
      '<div class="m-nf-h">' +
        '<div><b>Notifications</b><span>What changed while you were away.</span></div>' +
        '<button type="button" class="m-nf-cerrar" id="mNotifX" aria-label="Close">' +
          '<i class="ti ti-x" aria-hidden="true"></i></button>' +
      '</div>' +
      '<div id="mNotifBody" class="m-nf-body">' +
        '<div class="m-nf-vacio">Looking…</div></div>';

    document.body.appendChild(fondo);
    // Dentro del fondo, no al lado: el centrado lo hace su flex.
    fondo.appendChild(panel);
    const x = panel.querySelector('#mNotifX');
    if (x) x.onclick = cerrar;

    // ── Resuelto: el que rodaba era el documento ──────────────────
    //
    // Cuatro intentos fallaron aquí y los cuatro atacaban el síntoma:
    // `overscroll-behavior` en la lista, fijar el body con su scroll
    // guardado, empujar la lista un píxel en cada touchmove —ese
    // peleaba contra el dedo— y bloquear también el elemento raíz.
    //
    // La causa estaba un piso más abajo: el documento entero se podía
    // desplazar, así que al final de la lista iOS le entregaba el
    // gesto y uno se quedaba abajo. Ya no: el armazón fija el
    // documento y lo que rueda es #mScreens, que aquí se para.
    //
    // Era el mismo fallo que el hueco de la barra inferior y que el
    // deslizamiento lateral de toda la interfaz. Un solo arreglo.

    // ── El gesto ───────────────────────────────────────────────────
    //
    // El intento anterior empujaba la lista un píxel hacia dentro en
    // cada movimiento. Eso peleaba contra el dedo: había que forzar
    // arriba-abajo varias veces para "destrabarlo". Era un parche, no
    // un arreglo.
    //
    // Lo correcto es mirar la DIRECCIÓN del arrastre: sólo se cancela
    // cuando la lista ya no puede ir más en ese sentido. Dentro de su
    // recorrido, el dedo manda y nadie le toca el scrollTop.
    let y0 = 0;
    panel.addEventListener('touchstart', e => {
      y0 = e.touches[0].clientY;
    }, { passive: true });

    panel.addEventListener('touchmove', e => {
      const lista = panel.querySelector('#mNotifBody');
      // Fuera de la lista —la cabecera— no se desplaza nada.
      if (!lista || !lista.contains(e.target)) { e.preventDefault(); return; }

      const dy = e.touches[0].clientY - y0;
      const arriba = lista.scrollTop <= 0;
      const abajo = lista.scrollTop + lista.clientHeight >= lista.scrollHeight - 1;

      // Arrastrar hacia abajo estando arriba del todo, o hacia arriba
      // estando al final: ahí es donde iOS entregaría el gesto al
      // documento. Es el único momento en que se cancela.
      if ((arriba && dy > 0) || (abajo && dy < 0)) e.preventDefault();
    }, { passive: false });

    // Dos cuadros: el navegador tiene que ver el estado inicial antes
    // de que cambie, o no hay transición que animar.
    raf(() => raf(() => { fondo.classList.add('on'); panel.classList.add('on'); }));

    document.addEventListener('keydown', escTecla, true);

    await cargar();
    pintarPanel();
    pintarCampana();
  }

  function escTecla(e) { if (e.key === 'Escape') cerrar(); }

  function cerrar() {
    const fondo = document.getElementById('mNotifBack');
    const panel = document.getElementById('mNotifPanel');
    _abierto = false;
    desbloquear();
    document.removeEventListener('keydown', escTecla, true);
    if (fondo) fondo.classList.remove('on');
    if (panel) panel.classList.remove('on');
    // Se quitan DESPUÉS de la animación de salida; borrarlos al vuelo
    // haría que desaparecieran de golpe.
    setTimeout(() => {
      if (fondo) fondo.remove();
      if (panel) panel.remove();
    }, 220);
  }

  // ── Arranque ─────────────────────────────────────────────────────────

  async function refrescar() {
    try { await cargar(); } catch (e) {}
    pintarCampana();
    if (_abierto) pintarPanel();
  }

  function esMovil() {
    return window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
  }

  let _esperas = 0;
  function arrancar() {
    if (!esMovil()) return;
    if (!document.getElementById('mBand')) {
      if (_esperas++ > 40) return;
      setTimeout(arrancar, 300);
      return;
    }
    pintarCampana();
    refrescar();
  }

  window.BarStockMobileNotif = { refrescar, abrir, cerrar, _cargar: cargar, UMBRAL };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
})();
