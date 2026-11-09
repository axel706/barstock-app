(() => {
  if (window.BarStockVersionCenter) return;

  // ── El centro de versiones, en More ──────────────────────────────────
  //
  // En el teléfono el número de build va escondido (app.css), y sin él
  // no hay forma de saber si lo que tienes es lo último. Esta tarjeta lo
  // enseña —el mismo número del escritorio—, dice si hay una versión
  // nueva esperando y qué trae cada una. Diseño que Axel aprobó sobre su
  // captura de More: entre Settings y Log out, con la plantilla de las
  // tarjetas del carrusel (encabezado, título, tres renglones, pie).
  //
  // ── De dónde salen las notas ──────────────────────────────────────
  //
  // De changelog.json, que se escribe a mano con cada build, en inglés y
  // corto: lo lee el personal del bar. tools/test-changelog.js falla si
  // la build de index.html no tiene su entrada, igual que test-sello
  // falla si se sube la app sin subir el sello. Se pide al servidor sin
  // caché: así, con una versión nueva esperando, se puede decir qué trae
  // antes de actualizar.
  //
  // Si no hay notas —sin red, o una build sin entrada— se DICE. Enseñar
  // las de otra build como si fueran de ésta sería peor que no enseñar.

  const MAX = 10;                   // en la hoja, nunca más de diez
  const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let _notas = null;                // la lista, o null si no se pudo leer
  let _pidiendo = null;
  let _host = null;
  let _cuantas = 5;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const V = () => window.BarStockVersion || null;

  // "20261106-131106" → "Nov 6 · 1:11 PM". El sello ya va en hora de
  // Nueva York, así que se lee tal cual: convertirlo de zona lo movería.
  function fecha(build) {
    const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(String(build || ''));
    if (!m) return '';
    let h = Number(m[4]);
    const pm = h >= 12;
    h = h % 12 || 12;
    return MESES[Number(m[2]) - 1] + ' ' + Number(m[3]) + ' · ' + h + ':' + m[5] + ' ' + (pm ? 'PM' : 'AM');
  }

  function leer() {
    if (_pidiendo) return _pidiendo;
    _pidiendo = (async () => {
      try {
        const r = await fetch('/changelog.json?_=' + Date.now(), { cache: 'no-store' });
        const j = r && r.ok ? await r.json() : null;
        if (Array.isArray(j)) _notas = j;
      } catch (e) {
        // Sin red: se queda lo que hubiera, o nada, y la tarjeta lo dice.
      } finally {
        _pidiendo = null;
      }
      return _notas;
    })();
    return _pidiendo;
  }

  const de = (build) => (_notas || []).find(e => e && e.build === build) || null;

  // ── La tarjeta ─────────────────────────────────────────────────────
  function tarjeta() {
    const v = V();
    const mia = v ? v.actual() : null;
    const nueva = v ? v.nueva() : null;
    const hayNueva = !!(nueva && nueva !== mia);
    const eMia = de(mia), eNueva = hayNueva ? de(nueva) : null;

    let lineas;
    if (hayNueva) {
      lineas = ['Ready: BUILD-' + nueva].concat(eNueva ? eNueva.items.slice(0, 2) : []);
    } else {
      lineas = eMia ? eMia.items.slice(0, 3) : null;
    }

    const cuerpo = lineas
      ? '<ul class="m-vc-l">' + lineas.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>'
      : '<p class="m-vc-nada">Release notes are not available right now.</p>';
    // Con una nueva esperando y sin sus notas, al menos el número va:
    // eso sí se sabe. Lo que no se sabe no se rellena.
    const sinNotasNueva = hayNueva && !eNueva
      ? '<p class="m-vc-nada">Notes for it are not available right now.</p>' : '';

    return `
      <article class="m-hero m-hero-ver" id="mVerCard">
        <div class="m-hero-top"><div class="m-hero-txt">
          <div class="m-hero-k m-vc-k">VERSION
            ${hayNueva
              ? '<span class="m-vc-chip es-nueva"><i></i>New version ready</span>'
              : '<span class="m-vc-chip"><i></i>Up to date</span>'}
          </div>
          <div class="m-hero-t m-vc-t">${mia ? 'BUILD-' + esc(mia) : 'Unknown build'}
            <small>${hayNueva ? 'yours' : esc(fecha(mia))}</small></div>
          <div class="m-hero-cuerpo es-prosa">${cuerpo}${sinNotasNueva}</div>
        </div></div>
        <div class="m-hero-acts">
          <button type="button" class="m-hero-b2" id="mVerOld">Earlier versions</button>
          ${hayNueva ? '<button type="button" class="m-hero-b" id="mVerGo">Update now</button>' : ''}
        </div>
      </article>`;
  }

  function pintar(host) {
    if (host) _host = host;
    if (!_host || !_host.isConnected) return;
    _host.innerHTML = tarjeta();
    const old = _host.querySelector('#mVerOld');
    if (old) old.onclick = abrirHoja;
    const go = _host.querySelector('#mVerGo');
    if (go) go.onclick = () => { const v = V(); if (v) v._recargar(); };
  }

  // Se pinta ya con lo que haya, y otra vez cuando llegan las notas y
  // cuando se sabe si hay versión nueva: la tarjeta no espera a la red.
  function montar(host) {
    pintar(host);
    leer().then(() => pintar());
    const v = V();
    if (v && v.comprobar) v.comprobar().then(() => pintar());
  }

  // ── Earlier versions ───────────────────────────────────────────────
  function filas() {
    const v = V();
    const mia = v ? v.actual() : null;
    const lista = (_notas || []).slice(0, Math.min(_cuantas, MAX));
    if (!lista.length) return '<p class="m-vc-nada">Release notes are not available right now.</p>';
    return lista.map(e => `
      <div class="m-vc-v${e.build === mia ? ' es-mia' : ''}">
        <div class="m-vc-vh"><b>BUILD-${esc(e.build)}${e.build === mia ? '<span>YOURS</span>' : ''}</b>
          <small>${esc(fecha(e.build))}</small></div>
        <ul>${(e.items || []).map(t => '<li>' + esc(t) + '</li>').join('')}</ul>
      </div>`).join('');
  }

  function abrirHoja() {
    const vieja = document.getElementById('mSheet');
    if (vieja) vieja.remove();
    const h = document.createElement('div');
    h.className = 'm-sheet';
    // El id es el de todas las hojas del teléfono: las reglas que les
    // ganan el radio a app.css se apoyan en él.
    h.id = 'mSheet';
    h.innerHTML = `
      <div class="m-sheet-bg"></div>
      <div class="m-sheet-box m-vc-hoja" role="dialog" aria-label="Versions">
        <div class="m-sheet-grip"></div>
        <div class="m-vc-hh"><b>Versions</b>
          <div class="m-vc-seg">
            <button type="button" data-n="5">Last 5</button>
            <button type="button" data-n="10">Last 10</button>
          </div>
        </div>
        <div id="mVerList"></div>
      </div>`;
    document.body.appendChild(h);
    if (window.BarStockSheet) window.BarStockSheet.enganchar(h, () => h.remove());
    h.querySelector('.m-sheet-bg').onclick = () => h.remove();

    const repintar = () => {
      h.querySelectorAll('[data-n]').forEach(b => b.classList.toggle('on', Number(b.dataset.n) === _cuantas));
      const l = h.querySelector('#mVerList');
      if (l) l.innerHTML = filas();
    };
    h.querySelectorAll('[data-n]').forEach(b => {
      b.onclick = () => { _cuantas = Number(b.dataset.n); repintar(); };
    });
    repintar();
    if (!_notas) leer().then(repintar);
  }

  // ── What's new, al llegar de una actualización ────────────────────
  //
  // La abre update-anim.js cuando el punto ya se abrió en la app nueva.
  // Axel la quiso como hoja desde abajo, igual que la ficha de producto
  // de Inventory, y no como tarjeta desde la campana. No se cierra sola:
  // es una hoja y la decide quien la lee.
  //
  // Las líneas salen de changelog.json, las mismas del centro de
  // versiones. Si esa build no tiene entrada, se DICE, igual que en la
  // tarjeta: enseñar las de otra versión sería mentir.
  // ── Las que te perdiste ────────────────────────────────────────────
  //
  // Si te saltaste varias versiones (la app estuvo cerrada, o no se tocó
  // el aviso), What's new sale UNA vez con lo de todas juntas. Axel
  // (2026-11-09): sin decir cuántas versiones y sin fecha en cada nota;
  // lo más nuevo arriba, sin repetidas, y las "Behind-the-scenes fixes"
  // en una línea al final, sin número. Con una sola versión, sus notas
  // tal cual, como siempre.
  //
  // Los sellos se comparan como texto: AAAAMMDD-HHMMSS ordena igual.
  const SELLO = /^\d{8}-\d{6}$/;
  const deFondo = (t) => /^behind-the-scenes fixes$/i.test(String(t || '').trim());
  function notasDesde(build, desde) {
    if (!desde || !SELLO.test(desde) || desde >= build) {
      const e = de(build);
      return e && Array.isArray(e.items) ? e.items : [];
    }
    const entre = (_notas || []).filter(e => e && SELLO.test(e.build) && e.build > desde && e.build <= build)
      .sort((a, b) => (a.build < b.build ? 1 : -1));
    const vistas = new Set(), out = [];
    let fondo = false;
    for (const e of entre) {
      for (const t of (Array.isArray(e.items) ? e.items : [])) {
        if (deFondo(t)) { fondo = true; continue; }
        if (vistas.has(t)) continue;
        vistas.add(t); out.push(t);
      }
    }
    if (!out.length) return fondo ? ['Behind-the-scenes fixes'] : [];
    if (fondo) out.push('Plus behind-the-scenes fixes');
    return out;
  }

  async function novedades(build, desde) {
    if (!SELLO.test(String(build || ''))) return;
    if (!_notas) await leer();
    const items = notasDesde(build, desde);
    const cuerpo = items.length
      ? '<ul class="m-wn-l">' + items.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>'
      : '<p class="m-vc-nada">Release notes are not available right now.</p>';

    const vieja = document.getElementById('mSheet');
    if (vieja) vieja.remove();
    const h = document.createElement('div');
    h.className = 'm-sheet';
    // El id de todas las hojas del teléfono: las reglas que les ganan el
    // radio a app.css se apoyan en él.
    h.id = 'mSheet';
    h.innerHTML = `
      <div class="m-sheet-bg"></div>
      <div class="m-sheet-box m-wn" role="dialog" aria-label="What's new">
        <div class="m-sheet-grip"></div>
        <div class="m-wn-k"><i></i>Updated</div>
        <div class="m-wn-t">What's new</div>
        <div class="m-wn-s">BUILD-${esc(build)} · ${esc(fecha(build))}</div>
        ${cuerpo}
        <div class="m-wn-acts">
          <button type="button" class="m-wn-b2" id="mWnAll">All versions</button>
          <button type="button" class="m-wn-b" id="mWnOk">Got it</button>
        </div>
      </div>`;
    document.body.appendChild(h);
    const cerrar = () => h.remove();
    if (window.BarStockSheet) window.BarStockSheet.enganchar(h, cerrar);
    h.querySelector('.m-sheet-bg').onclick = cerrar;
    h.querySelector('#mWnOk').onclick = cerrar;
    h.querySelector('#mWnAll').onclick = () => { cerrar(); abrirHoja(); };
  }

  // ── La última versión que viste ────────────────────────────────────
  //
  // Se apunta en el teléfono para saber, al abrir, si hubo versiones
  // nuevas. Antes What's new sólo salía al actualizar con el aviso; si la
  // app se abría en frío ya estaba al día y nadie se enteraba de nada.
  const VISTO = 'barstock.buildVisto';
  function visto() { try { return localStorage.getItem(VISTO); } catch (e) { return null; } }
  function marcarVisto(build) {
    if (!SELLO.test(String(build || ''))) return;
    try { localStorage.setItem(VISTO, build); } catch (e) {}
  }

  // Al entrar con sesión (auth.js). La primera vez en un teléfono no hay
  // con qué comparar: sólo se apunta (un usuario nuevo no ve "What's new"
  // de todo lo anterior). Si se viene de actualizar con el aviso, la hoja
  // la saca la animación al terminar, no esto.
  async function alEntrar() {
    if (window.__bsUpd) return;
    const actual = V() && V().actual ? V().actual() : null;
    if (!SELLO.test(String(actual || ''))) return;
    const v = visto();
    marcarVisto(actual);
    if (!v || v >= actual) return;
    await novedades(actual, v);
  }

  window.BarStockVersionCenter = { montar, pintar, fecha, novedades, visto, marcarVisto, alEntrar, _leer: leer };
})();
