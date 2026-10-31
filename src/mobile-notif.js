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

  // ── Los precios que ESPERAN ──────────────────────────────────────
  //
  // Lo de arriba (`precios`) sale de `marginedge_price_log`, que se
  // escribe DESPUÉS de aplicar: es un recibo de lo que ya pasó. Esto
  // es lo contrario — facturas que trajeron un precio distinto al que
  // tienes escrito y que nadie ha aprobado todavía.
  //
  // Era lo único de la cadena que no avisaba: las facturas entran
  // solas, el emparejado pendiente se ve en la tarjeta del Home, y los
  // precios se quedaban esperando dentro de la cuarta pestaña de un
  // panel de Ajustes.
  //
  // El cálculo NO se repite aquí: lo hace el módulo de compras, que es
  // su dueño. Dos reglas de "qué precio vale" acabarían diciendo cosas
  // distintas en la campana y en la lista.
  async function preciosPendientes() {
    const P = window.BarStockMarginEdgePurchases;
    if (!P || typeof P.calcularPrecios !== 'function') return [];

    let r = null;
    try { r = await P.calcularPrecios(); } catch (e) { return []; }
    const cambios = (r && r.cambios) || [];
    if (!cambios.length) return [];

    // El mismo umbral que los aplicados. Un 2% en treinta productos sí
    // mueve el valor del inventario, pero no merece una notificación:
    // la lista completa los sigue enseñando todos.
    const grandes = cambios.filter(c => {
      const a = Number(c.antes);
      return a > 0 && Math.abs(((c.precio - a) / a) * 100) >= UMBRAL;
    });
    if (!grandes.length) return [];

    const pct = (c) => Math.round(((c.precio - c.antes) / c.antes) * 100);
    const titular = grandes.slice(0, 2)
      .map(c => esc(c.item) + ' ' + (pct(c) > 0 ? '+' : '') + pct(c) + '%')
      .join(', ');
    const resto = grandes.length - 2;
    const facturas = new Set(grandes.map(c => c.factura).filter(Boolean)).size;

    // ── Un solo aviso, no doce ───────────────────────────────────────
    //
    // Doce renglones de precio llenan la campana y entierran todo lo
    // demás, y encima la acción es la misma para los doce: aprobarlos
    // de golpe. Un aviso con la cuenta y los dos mayores.
    //
    // La clave lleva las facturas implicadas: cerrarlo lo calla para
    // ESTAS, y una factura nueva vuelve a avisar.
    const clave = 'pend:' + grandes.map(c => c.factura || c.item).sort().join('|');

    return [{
      clave,
      grupo: 'Waiting for you',
      ico: 'ti-tag',
      tono: grandes.filter(c => pct(c) > 0).length >= grandes.length / 2 ? 'up' : 'dn',
      t: grandes.length + (grandes.length === 1 ? ' price changed' : ' prices changed') +
         ' on new invoices',
      d: titular + (resto > 0 ? ' and ' + resto + ' more' : '') +
         (facturas ? ' · from ' + facturas + (facturas === 1 ? ' invoice' : ' invoices') : ''),
      orden: 'zzzz',           // lo primero de la lista: es una tarea
      accion: 'Review',
      // TODOS, no sólo los grandes. El umbral decide a quién se
      // molesta, no qué se actualiza: un 2% en treinta productos sí
      // mueve el valor del inventario. La prueba cazó que aquí había
      // puesto `grandes`, que es lo contrario de lo que dice el
      // comentario de arriba.
      cambios
    }];
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

    // Los pendientes van ANTES: son una tarea, y los de `precios` son
    // un recibo de algo que ya hiciste.
    let esperando = [];
    try { esperando = await preciosPendientes(); } catch (e) {}

    _avisos = esperando.concat(lista).filter(a => !_descartadas.has(a.clave))
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

      // ── La campana va con el otro icono, a la DERECHA ─────────────
      //
      // Antes colgaba del <header> y la CSS la clavaba a la izquierda
      // con `position:absolute`, o sea que los dos botones de la banda
      // vivían en esquinas opuestas con el logo flotando en medio.
      //
      // Ahora entra DENTRO del grupo de la derecha y como primer hijo:
      // campana y luego perfil, el mismo orden de la maqueta. Al ser
      // los dos hijos de un flex, el hueco entre ellos lo pone el
      // `gap` del padre y no hace falta posicionar nada.
      //
      // Si el grupo todavía no existe —esto corre antes que la banda
      // en algún arranque— se cuelga del header y la CSS la deja
      // pasable igual.
      const grupo = banda.querySelector('.m-band-ico');
      if (grupo) grupo.insertBefore(el, grupo.firstChild);
      else banda.appendChild(el);
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

  // ── La cabecera del panel ────────────────────────────────────────
  //
  // Un nivel más adentro cambia el título y aparece el chevron A LA
  // IZQUIERDA de él, en la misma fila. Es el mismo patrón que usan
  // todas las pantallas desde que se recuperó ese renglón.
  function titulo(texto, conVolver) {
    const cab = document.querySelector('.m-nf-panel .m-nf-h');
    if (!cab) return;
    cab.innerHTML =
      (conVolver
        ? '<button type="button" class="m-nf-atras" id="mnfBack" aria-label="Back">' +
            '<i class="ti ti-chevron-left" aria-hidden="true"></i></button>'
        : '') +
      '<div><b>' + esc(texto) + '</b>' +
        (conVolver ? '' : '<span>What changed while you were away.</span>') +
      '</div>' +
      '<button type="button" class="m-nf-cerrar" id="mNotifX" aria-label="Close">' +
        '<i class="ti ti-x" aria-hidden="true"></i></button>';

    const atras = cab.querySelector('#mnfBack');
    if (atras) atras.onclick = () => pintarPanel();
    const x = cab.querySelector('#mNotifX');
    if (x) x.onclick = cerrar;
  }

  function pintarPanel() {
    const caja = document.getElementById('mNotifBody');
    if (!caja) return;
    titulo('Notifications', false);

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
          // Un aviso que se puede ATENDER lleva su acción en vez de la
          // X. Cerrar algo que hay que hacer no es una salida: es
          // esconderlo.
          (a.accion
            ? '<button type="button" class="m-nf-go" data-ver="' + esc(a.clave) + '">' +
                esc(a.accion) + '</button>'
            : '<button type="button" class="m-nf-x" data-x="' + esc(a.clave) + '" ' +
                'aria-label="Dismiss"><i class="ti ti-x" aria-hidden="true"></i></button>') +
        '</div>').join('')
    ).join('');

    caja.querySelectorAll('[data-x]').forEach(b => {
      b.onclick = () => {
        const a = _avisos.find(x => x.clave === b.dataset.x);
        if (a) descartar(a);
      };
    });

    caja.querySelectorAll('[data-ver]').forEach(b => {
      b.onclick = () => {
        const a = _avisos.find(x => x.clave === b.dataset.ver);
        if (a && a.cambios) pintarPrecios(a);
      };
    });
  }

  // ── La lista, dentro del mismo panel ─────────────────────────────
  //
  // No se navega a ningún sitio. La pantalla de precios del escritorio
  // vive en la cuarta pestaña de un panel de Ajustes y en el teléfono
  // no existe; mandar a alguien allí desde una notificación es
  // perderlo. Aquí se ve la lista, se aprueba, y se acabó.
  //
  // Se enseñan TODOS los cambios, no sólo los que pasaron el umbral:
  // el umbral decide a quién se molesta, no qué se actualiza. Un 2%
  // en treinta productos sí mueve el valor del inventario.
  function pintarPrecios(aviso) {
    const caja = document.getElementById('mNotifBody');
    if (!caja) return;

    const cambios = aviso.cambios || [];
    const pct = (c) => Math.round(((c.precio - c.antes) / c.antes) * 100);

    // El chevron va en la cabecera que ya existe, a la izquierda del
    // título — no en un renglón propio. Gastar una fila entera en un
    // botón de volver es el patrón viejo que la app dejó atrás, y hay
    // una prueba que lo vigila.
    titulo(cambios.length + (cambios.length === 1 ? ' price' : ' prices'), true);

    caja.innerHTML =
      '<div class="m-nf-lab">FROM THE LATEST INVOICE OF EACH ITEM</div>' +
      cambios.map(c =>
        '<div class="m-nf-pr">' +
          '<span class="m-nf-pr-n"><b>' + esc(c.item) + '</b>' +
            '<span>' + esc(c.vendor || '') +
              (c.factura ? ' · invoice ' + esc(c.factura) : '') +
              (c.fecha ? ' · ' + esc(c.fecha) : '') + '</span></span>' +
          '<span class="m-nf-pr-v ' + (c.precio > c.antes ? 'up' : 'dn') + '">' +
            dinero(c.antes) + ' → <b>' + dinero(c.precio) + '</b>' +
            '<span>' + (pct(c) > 0 ? '+' : '') + pct(c) + '%</span></span>' +
        '</div>').join('') +
      '<button type="button" class="m-nf-aplicar" id="mnfGo">' +
        'Update ' + cambios.length + (cambios.length === 1 ? ' price' : ' prices') +
      '</button>' +
      '<div class="m-nf-nota">Only these change. Everything else keeps the price ' +
        'you typed — nothing is cleared.</div>';

    const go = caja.querySelector('#mnfGo');
    if (go) go.onclick = async () => {
      const P = window.BarStockMarginEdgePurchases;
      if (!P || !P.aplicarPrecios) return;
      go.disabled = true;
      // Pase lo que pase el botón vuelve. Un "Updating…" eterno no
      // dice si funcionó, si falló o si sigue trabajando.
      try {
        const r = await P.aplicarPrecios(cambios, (n, tot) => {
          go.textContent = 'Updating… ' + n + ' of ' + tot;
        });
        caja.innerHTML =
          '<div class="m-nf-vacio">' +
            '<i class="ti ti-circle-check" aria-hidden="true"></i>' +
            r.ok + ' prices updated.' +
            (r.problemas && r.problemas.length
              ? '<br>' + r.problemas.length + ' could not be saved.' : '') +
          '</div>';
        if (window.BarStockInventoryRealtime && window.BarStockInventoryRealtime.refresh) {
          try { window.BarStockInventoryRealtime.refresh(); } catch (e) {}
        }
        // La campana se recalcula —el aviso tiene que desaparecer solo,
        // sin que nadie lo cierre a mano— pero el PANEL no se
        // repinta: lo hacía, y se comía el mensaje de que todo salió
        // bien. Acabar un trabajo y volver a la lista sin una palabra
        // se lee como que no pasó nada.
        try { await cargar(); } catch (e2) {}
        pintarCampana();
      } catch (e) {
        go.disabled = false;
        go.textContent = 'Update ' + cambios.length + ' prices';
        caja.insertAdjacentHTML('afterbegin',
          '<div class="m-nf-err">' + esc(String(e && e.message || e)) + '</div>');
      }
    };
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
  let _scrollY = 0;

  function bloquear() {
    _scrollY = window.scrollY || window.pageYOffset ||
               document.documentElement.scrollTop || 0;
    document.body.style.top = (-_scrollY) + 'px';
    document.body.classList.add('m-nf-abierto');
    // El raíz también: según la pantalla, el que se desplaza es uno u
    // otro, y bloquear sólo el body dejaba el documento moviéndose por
    // detrás del panel.
    document.documentElement.classList.add('m-nf-abierto');
  }

  function desbloquear() {
    document.body.classList.remove('m-nf-abierto');
    document.documentElement.classList.remove('m-nf-abierto');
    document.body.style.top = '';
    // Devolver el desplazamiento es lo último y va protegido: si
    // fallara, lo importante —soltar el body— ya está hecho. Al revés
    // dejaría la app congelada por no poder hacer scroll.
    try { window.scrollTo(0, _scrollY); } catch (e) {}
  }

  async function abrir() {
    if (_abierto) return cerrar();
    _abierto = true;
    bloquear();

    const fondo = document.createElement('div');
    fondo.id = 'mNotifBack';
    fondo.className = 'm-nf-back';
    fondo.onclick = cerrar;

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
    fondo.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

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
    document.body.appendChild(panel);
    const x = panel.querySelector('#mNotifX');
    if (x) x.onclick = cerrar;

    // ── El gesto, bien hecho ───────────────────────────────────────
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
