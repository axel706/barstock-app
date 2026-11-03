(() => {
  if (window.BarStockCountFinish) return;

  // ── Cerrar el conteo ─────────────────────────────────────────────────
  //
  // Es el ÚNICO sitio de todo el conteo por escaneo que escribe en
  // inventory_items. Todo lo demás vive en la sesión del dispositivo.
  //
  // Hace lo mismo que importar un archivo de conteo, solo que los datos
  // los generaste escaneando: respaldo, reemplazo del inventario y ciclo
  // de Par Intelligence. Se apoya a propósito en la cadena que ya existe
  // y ya funciona, en vez de inventar otra.
  //
  // ── Los artículos que nadie escaneó ─────────────────────────────────
  //
  // Es la decisión delicada. Si contaste todo, lo que no apareció no
  // está y va a cero. Si te interrumpieron a mitad, poner a cero borra el
  // inventario de golpe.
  //
  // No hay forma de que el programa lo adivine, así que se pregunta. Y la
  // opción segura viene marcada: quien pulsa sin leer se lleva la que no
  // destruye nada.

  let _onCancel = null;   // volver a escanear
  let _onDone = null;     // cerrar el escáner entero
  let _mode = 'keep';     // keep | zero

  const S = () => window.BarStockCountSession;
  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  // ── Cuánto se tardó ──────────────────────────────────────────────────
  //
  // El tiempo ACTIVO del conteo, el que reconstruye `count-session` de
  // los huecos entre botellas. Se guarda una fila por conteo cerrado
  // —no una columna que sólo recuerda el último— para poder comparar
  // una semana con otra, que es donde está el valor: saber que pasaste
  // de dos horas a una y cuarto.
  //
  // Nada de esto puede tumbar el cierre. Si la tabla no existe todavía
  // o la red falla, se avisa por consola y el conteo se cierra igual:
  // el inventario ya está escrito y es lo único que importa.
  function cfgNube() {
    const c = window.BARSTOCK_CONFIG || {};
    return { url: c.SUPABASE_URL, key: c.SUPABASE_KEY, loc: c.LOCATION_NAME || '' };
  }

  async function tiempoAnterior() {
    const { url, key, loc } = cfgNube();
    if (!url || !key) return null;
    try {
      const res = await fetch(url + '/rest/v1/count_sessions' +
        '?location_name=eq.' + encodeURIComponent(loc) +
        '&select=active_ms,week_key&order=finished_at.desc&limit=1',
        { headers: { apikey: key, Authorization: 'Bearer ' + key } });
      if (!res.ok) return null;
      const filas = await res.json();
      return (Array.isArray(filas) && filas[0]) ? filas[0] : null;
    } catch (e) {
      console.warn('[conteo] no se pudo leer el tiempo anterior', e);
      return null;
    }
  }

  async function guardarTiempo(s) {
    const { url, key, loc } = cfgNube();
    if (!url || !key) return;
    if (!s || !s.activeMs) return;   // sin tiempo medido no se inventa una fila
    try {
      const semana = (window.BarStockWeek && window.BarStockWeek.cycleWeekKey)
        ? window.BarStockWeek.cycleWeekKey() : '';
      const res = await fetch(url + '/rest/v1/count_sessions', {
        method: 'POST',
        headers: { apikey: key, Authorization: 'Bearer ' + key,
                   'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          location_name: loc,
          week_key: semana,
          started_at: s.countingSince || s.startedAt,
          active_ms: Math.round(s.activeMs),
          items: s.counted
        })
      });
      if (!res.ok) {
        const t = await res.text();
        if (/count_sessions/.test(t) && /does not exist|relation/i.test(t)) {
          console.warn('[conteo] falta la tabla count_sessions. Corre la migración 020.');
        } else {
          console.warn('[conteo] no se pudo guardar el tiempo del conteo', t);
        }
      }
    } catch (e) {
      console.warn('[conteo] no se pudo guardar el tiempo del conteo', e);
    }
  }

  // El formato lo pone `count-session`, para que la tarjeta del Home y
  // esta pantalla no lo escriban cada una a su manera. El respaldo es
  // por si esta pantalla se abriera sin el módulo cargado.
  function S_FMT(ms) {
    const s = S();
    if (s && s.fmtDur) return s.fmtDur(ms);
    return Math.round((Number(ms) || 0) / 60000) + ' min';
  }

  // "18 min faster than last time". Se dice la DIFERENCIA y no los dos
  // números: el anterior ya pasó y lo que interesa saber es si vas
  // mejor. Por debajo de un minuto no se dice nada — esa diferencia es
  // ruido y presentarla como una mejora sería mentir.
  function comparar(ahora, antes) {
    const d = Math.round((antes - ahora) / 60000);
    if (!d) return 'same as last time';
    return Math.abs(d) + ' min ' + (d > 0 ? 'faster' : 'slower') + ' than last time';
  }

  // Por debajo de esto, el conteo anterior no fue un conteo: fue una
  // prueba, o alguien que abrio el escaner y se salio. Comparar contra
  // eso daba "22 min slower than last time" sobre un conteo de 22
  // minutos, que es ruido con cara de dato.
  const MINIMO_PARA_COMPARAR = 5 * 60000;

  // ── Lo que hay que pedir, ahora mismo ────────────────────────────────
  //
  // Se lee DESPUES del commit, cuando `toOrder` ya esta recalculado
  // contra el on hand nuevo. Es el unico momento en que este numero es
  // la consecuencia directa de lo que se acaba de contar.
  //
  // El dinero sale de `toOrder × tu precio de catalogo`, no de lo que
  // te van a cobrar: por eso en pantalla lleva tilde y se dice de
  // donde sale. Un signo de dolar a secas se lee como una factura.
  function loPorPedir() {
    const m = (window.state && window.state.master) || [];
    let n = 0, dinero = 0;
    const vend = new Set();
    for (const r of m) {
      const q = Number(r.toOrder) || 0;
      if (q <= 0) continue;
      n++;
      dinero += q * (Number(r.value) || 0);
      if (r.vendor) vend.add(String(r.vendor));
    }
    return { n, dinero, vendors: vend.size };
  }

  const dinero = (x) => '$' + Math.round(Number(x) || 0).toLocaleString('en-US');

  function build() {
    if ($('cfPanel')) return;
    const el = document.createElement('div');
    el.id = 'cfPanel';
    el.className = 'cf-panel';
    el.innerHTML = `
      <div class="cf-head">
        <button class="sc-x" id="cfBack" type="button" aria-label="Back">
          <i class="ti ti-arrow-left" aria-hidden="true"></i>
        </button>
        <span class="cf-title">Finish count</span>
      </div>
      <div class="cf-body" id="cfBody"></div>`;
    document.body.appendChild(el);
    // Un solo boton, dos significados: dentro de una vista vuelve al
    // resumen; en el resumen sale al escaner.
    $('cfBack').onclick = () => { if (_vista) irA(''); else close(true); };
  }

  function open(onCancel, onDone) {
    build();
    _onCancel = onCancel || null;
    _onDone = onDone || null;
    _mode = 'keep';
    // Siempre se abre en el resumen, y las cargas se rehacen: volver a
    // entrar despues de contar mas tiene que decir la verdad nueva.
    _vista = '';
    _busca = '';
    _ins = null;
    _zonas = null;
    $('cfPanel').classList.add('on');
    render();
  }

  // ── Una pantalla con cuatro vistas ───────────────────────────────────
  //
  // Antes esto era una sola pantalla con todo apilado: cuatro cajas de
  // aviso del mismo peso, el mismo hecho dicho tres veces —"257 never
  // scanned", "See which ones", "Those 257 stay at zero"— y la decisión
  // por debajo del pliegue. Lo más accionable, los artículos de alta
  // rotación sin contar, quedaba enterrado en medio.
  //
  // Ahora el resumen dice UNA cosa —el veredicto— y cada asunto tiene su
  // tarjeta, que abre su propia vista. El botón de cerrar está siempre a
  // la vista.
  //
  // `_vista` es el único estado nuevo. El resto de la pantalla —el modo
  // keep/zero, el commit, el cierre— no cambia.
  let _vista = '';        // '' | 'movers' | 'raros' | 'faltan' | 'zonas'
  let _ins = null;        // lo que devolvió BarStockCountInsight
  let _zonas = null;      // { filas, sinZona, estado }
  let _busca = '';        // el filtro de la lista de los que faltan

  const n2 = (x) => String(Math.round((Number(x) || 0) * 100) / 100);

  // ── El reparto por zona ──────────────────────────────────────────────
  //
  // Dos cosas, y la segunda importa más: cuánto hay en cada sitio, y si
  // eso llegó a la nube. Se fuerza la subida al abrir esta pantalla en
  // vez de confiar en el pulso de dos minutos, porque este es el momento
  // en que alguien está mirando y puede hacer algo si falla.
  async function cargarZonas() {
    const Z = window.BarStockZones;
    if (!Z || !Z.activas()) { _zonas = { filas: [], sinZona: 0, estado: '' }; return; }

    const tam = {};
    for (const r of (window.state && window.state.master) || []) {
      tam[r.item] = Number(r.bottleSizeMl) || 750;
    }

    const totales = {};
    let sinZona = 0;
    for (const item of S().countedItems()) {
      const porZona = S().bottlesByZone(item, tam[item] || 750);
      for (const [z, n] of Object.entries(porZona)) {
        if (!z) { sinZona += n; continue; }
        totales[z] = (totales[z] || 0) + n;
      }
    }

    _zonas = {
      filas: Object.entries(totales).sort((a, b) => b[1] - a[1]),
      sinZona,
      estado: 'guardando'
    };
    repintar();

    try {
      const subidas = await Z.sincronizar();
      _zonas.estado = subidas ? 'ok' : 'nada';
    } catch (e) {
      _zonas.estado = 'mal';
    }
    repintar();
  }

  // ── Los avisos ───────────────────────────────────────────────────────
  //
  // Van en segundo plano a propósito. Leer el historial es una consulta a
  // la nube, y la pantalla de cierre tiene que abrirse al instante: nadie
  // debe esperar a la red para poder pulsar "Keep scanning". Si la
  // consulta tarda o falla, esto simplemente no aparece y todo lo demás
  // funciona igual.
  async function cargarInsight() {
    if (!window.BarStockCountInsight) return;
    try { _ins = await window.BarStockCountInsight.analizar(); }
    catch (e) { console.warn('[conteo] avisos no disponibles', e); _ins = null; }
    repintar();
  }

  // Repintar sin relanzar las cargas. `render()` las dispara; esto sólo
  // vuelve a dibujar con lo que ya hay.
  function repintar() {
    if (!$('cfPanel') || !$('cfPanel').classList.contains('on')) return;
    pintar();
  }

  function render() {
    pintar();
    // En segundo plano, y sólo una vez por apertura.
    if (_ins === null) cargarInsight();
    if (_zonas === null) cargarZonas().catch(e => console.warn('[zonas] cierre', e));
  }

  // ── El encabezado ────────────────────────────────────────────────────
  //
  // La flecha vuelve al resumen cuando estás en una vista, y sale del
  // cierre cuando estás en el resumen. Un solo botón, dos significados,
  // y el título dice en cuál estás.
  function cabecera() {
    const T = {
      movers: ['Moves every week', (_ins && _ins.faltan.length || 0) + ' not counted'],
      raros:  ['Does not look right', (_ins && _ins.raros.length || 0) + ' to check'],
      faltan: ['What is missing', S().summary().missing + ' of ' + S().summary().total],
      zonas:  ['By zone', (_zonas && _zonas.filas.length || 0) + ' zones']
    };
    const t = T[_vista] || ['Finish count', ''];
    const cab = $('cfPanel') && $('cfPanel').querySelector('.cf-title');
    if (cab) cab.innerHTML = esc(t[0]) +
      (t[1] ? '<small class="cf-title-s">' + esc(t[1]) + '</small>' : '');
  }

  function pintar() {
    cabecera();
    const b = $('cfBody');
    if (!b) return;
    if (_vista === 'movers')      { vistaMovers(b); return; }
    if (_vista === 'raros')       { vistaRaros(b);  return; }
    if (_vista === 'faltan')      { vistaFaltan(b); return; }
    if (_vista === 'zonas')       { vistaZonas(b);  return; }
    vistaResumen(b);
  }

  function irA(v) { _vista = v; _busca = ''; pintar(); }

  // El pie de las vistas de detalle. Verde porque ir a contar AÑADE
  // existencia; el azul de "Close the count" es la acción contraria y no
  // pueden compartir color.
  function pieDetalle(accion) {
    return `<div class="cf-pie">
      ${accion ? `<button class="cf-b cf-b-ok" id="cfGoScan" type="button">
        <i class="ti ti-scan" aria-hidden="true"></i> ${esc(accion)}</button>` : ''}
      <button class="cf-b cf-b-gh" id="cfVolver" type="button">Back</button>
    </div>`;
  }

  function colgarPie(b) {
    const g = b.querySelector('#cfGoScan');
    if (g) g.onclick = () => close(true);
    const v = b.querySelector('#cfVolver');
    if (v) v.onclick = () => irA('');
  }

  // ── El resumen ───────────────────────────────────────────────────────
  function vistaResumen(b) {
    const s = S().summary();

    if (!s.counted) {
      b.innerHTML = `
        <div class="cf-empty">Nothing counted yet.</div>
        <button class="cf-b cf-b-gh" id="cfBack2" type="button">Keep scanning</button>`;
      b.querySelector('#cfBack2').onclick = () => close(true);
      return;
    }

    // Si todos los no contados ya están en cero, es que se venía de un
    // reset y no hay nada que preguntar.
    const desdeCero = S().missingRows().every(r => Number(r.onHand || 0) === 0);
    const pct = s.total ? s.counted / s.total : 0;
    const todo = !s.missing;
    const color = todo ? '#34d399' : pct < 0.5 ? '#f87171' : '#fbbf24';

    const r = 28, C = 2 * Math.PI * r;
    const anillo = `
      <svg class="cf-ring" viewBox="0 0 68 68" width="68" height="68" aria-hidden="true">
        <circle cx="34" cy="34" r="${r}" fill="none" stroke="rgba(255,255,255,.13)" stroke-width="7"/>
        <circle cx="34" cy="34" r="${r}" fill="none" stroke="${color}" stroke-width="7"
          stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct)).toFixed(1)}"
          stroke-linecap="round" transform="rotate(-90 34 34)"/>
      </svg>`;

    // El veredicto dice la CONSECUENCIA, no el mecanismo. "Replaces the
    // on hand" es lo que hace el programa; "saves 257 items as zero" es
    // lo que te pasa a ti.
    const frase = todo
      ? 'Every item was counted. Nothing will be saved as zero.'
      : desdeCero
        ? `Closing now saves <b>${s.missing} item${s.missing === 1 ? '' : 's'} as zero</b>
           for this whole location.`
        : `<b>${s.missing} item${s.missing === 1 ? '' : 's'}</b> have no reading.
           Pick below what happens to them.`;

    const nMov = _ins && _ins.listo ? _ins.faltan.length : 0;
    const nRar = _ins && _ins.listo ? _ins.raros.length : 0;
    const nZon = _zonas ? _zonas.filas.length : 0;

    b.innerHTML = `
      <div class="cf-vd ${todo ? 'ok' : ''}">
        <div class="cf-vd-top">${anillo}
          <div class="cf-vd-t"><b>${s.counted} of ${s.total}</b>
            <span>items counted &middot; ${Math.round(pct * 100)}%</span></div>
        </div>
        <div class="cf-vd-c">${frase}</div>
      </div>

      ${nMov ? tarjeta('movers', 'urge', 'trending-up',
          nMov + ' fast mover' + (nMov === 1 ? '' : 's') + ' not counted',
          _ins.faltan.slice(0, 3).map(x => esc(x.item) + ' ' + x.semanal.toFixed(1) + '/wk')
            .join(' · ')) : ''}

      ${nRar ? tarjeta('raros', 'urge', 'help-circle',
          nRar + ' count' + (nRar === 1 ? '' : 's') + ' do not look right',
          'Tap to see them and count again') : ''}

      ${s.missing ? tarjeta('faltan', '', 'list-search',
          'See the ' + s.missing + ' missing',
          'Search by name or category') : ''}

      ${s.missing && !desdeCero ? `
        <div class="cf-dec">
          <div class="cf-dec-k">Those ${s.missing}</div>
          <button class="cf-opt${_mode === 'keep' ? ' on' : ''}" type="button" data-mode="keep">
            <b>Leave them as they were</b>
            <small>Keeps their previous count</small>
          </button>
          <button class="cf-opt${_mode === 'zero' ? ' on' : ''}" type="button" data-mode="zero">
            <b>Set them to zero</b>
            <small>Only if you counted absolutely everything</small>
          </button>
        </div>` : ''}

      ${nZon ? tarjeta('zonas', '', 'map-pin', nZon + ' zone' + (nZon === 1 ? '' : 's'),
          _zonas.filas.map(([z, v]) => esc(z) + ' ' + n2(v)).join(' · ')) : ''}

      <div class="cf-pie">
        <button class="cf-b cf-b-go" id="cfGo" type="button">Close the count</button>
        <button class="cf-b cf-b-gh" id="cfMore" type="button">Keep scanning</button>
        <div class="cf-nota">A backup is taken first &middot; restorable from Admin</div>
      </div>`;

    b.querySelectorAll('[data-ir]').forEach(x => {
      x.onclick = () => irA(x.dataset.ir);
    });
    b.querySelectorAll('.cf-opt').forEach(x => {
      x.onclick = () => {
        _mode = x.dataset.mode;
        b.querySelectorAll('.cf-opt').forEach(y => y.classList.toggle('on', y === x));
      };
    });
    b.querySelector('#cfMore').onclick = () => close(true);
    b.querySelector('#cfGo').onclick = commit;
  }

  function tarjeta(ir, tono, ico, titulo, sub) {
    return `<button class="cf-card ${tono}" type="button" data-ir="${esc(ir)}">
      <i class="ti ti-${esc(ico)} cf-card-i" aria-hidden="true"></i>
      <span class="cf-card-t"><b>${esc(titulo)}</b><span>${sub}</span></span>
      <i class="ti ti-chevron-right cf-card-go" aria-hidden="true"></i>
    </button>`;
  }

  // ── Los que se mueven cada semana ────────────────────────────────────
  function vistaMovers(b) {
    const f = (_ins && _ins.faltan) || [];
    const max = f.reduce((m, x) => Math.max(m, x.semanal), 0) || 1;
    b.innerHTML = `
      <div class="cf-sub">These are the ones you sell. Closing now records
        them as zero, and next week&rsquo;s order will be built on that.</div>
      ${f.map(x => `
        <div class="cf-row">
          <span class="cf-row-n">${esc(x.item)}</span>
          <span class="cf-bar"><i style="width:${Math.round(x.semanal / max * 100)}%"></i></span>
          <span class="cf-row-v">${x.semanal.toFixed(1)}/wk</span>
        </div>`).join('')}
      ${pieDetalle('Go count these ' + f.length)}`;
    colgarPie(b);
  }

  // ── Los que no cuadran ───────────────────────────────────────────────
  //
  // Tocar uno abre SU panel de conteo con lo que ya se había puesto. Al
  // volver se recalcula: si el número dejó de ser raro, desaparece solo.
  function vistaRaros(b) {
    const r = (_ins && _ins.raros) || [];
    const sc = _ins && _ins.semanasCiclo;
    const ventana = !sc || Math.abs(sc - 1) < 0.15
      ? 'a week' : (sc < 1 ? Math.round(sc * 7) + ' days' : sc.toFixed(1) + ' weeks');

    b.innerHTML = `
      <div class="cf-sub">Expected = what was on hand when the cycle opened,
        plus what came in, minus ${esc(ventana)} of typical use. It may also be
        stock that arrived without the order being recorded &mdash; then the
        count is right and this is wrong.</div>
      ${r.map((x, i) => `
        <button class="cf-row cf-row-b" type="button" data-raro="${i}">
          <span class="cf-row-n">${esc(x.item)}</span>
          <span class="cf-row-v">${x.contado}
            <small>vs ${x.esperado}</small></span>
          <i class="ti ti-chevron-right cf-card-go" aria-hidden="true"></i>
        </button>`).join('')}
      ${pieDetalle('')}`;
    colgarPie(b);

    b.querySelectorAll('[data-raro]').forEach(x => {
      x.onclick = () => {
        const d = r[Number(x.dataset.raro)];
        const row = ((window.state && window.state.master) || []).find(m => m.item === d.item);
        if (!row || !window.BarStockCountPanel) return;
        window.BarStockCountPanel.open(row, () => {
          // El historial no se relee: sigue en caché. Lo que cambia es el
          // conteo, así que se vuelve a analizar con lo que ya hay.
          cargarInsight();
        });
      };
    });
  }

  // ── Los que faltan ───────────────────────────────────────────────────
  //
  // Agrupados por categoría porque así está la barra: el vodka en un
  // sitio, el vino en otro. Una lista alfabética de 257 nombres obliga a
  // recorrer el local entero; agrupada, dice a qué estantes volver.
  //
  // Con buscador, porque el otro uso de esta lista es comprobar UNO:
  // "¿le di al Tito's?". Y ese caso es tan frecuente como repasarla.
  function vistaFaltan(b) {
    b.innerHTML = `
      <div class="cf-busca">
        <i class="ti ti-search" aria-hidden="true"></i>
        <input id="cfSearch" type="text" placeholder="Search the missing"
               autocomplete="off" value="${esc(_busca)}">
      </div>
      <div id="cfMissingList"></div>
      ${pieDetalle('Go count them')}`;
    colgarPie(b);
    const inp = b.querySelector('#cfSearch');
    inp.oninput = (e) => { _busca = e.target.value; paintMissing(); };
    paintMissing();
  }

  function paintMissing() {
    const host = $('cfMissingList');
    if (!host) return;

    const filtro = String(_busca || '').trim().toLowerCase();
    let filas = S().missingRows();
    if (filtro) filas = filas.filter(r => String(r.item || '').toLowerCase().includes(filtro));

    if (!filas.length) {
      host.innerHTML = `<div class="cf-empty">${filtro ? 'Nothing matches' : 'Nothing missing'}</div>`;
      return;
    }

    const porCat = {};
    for (const r of filas) {
      const c = String(r.category || '').trim() || 'No category';
      (porCat[c] = porCat[c] || []).push(r);
    }

    host.innerHTML = Object.keys(porCat).sort().map(cat => `
      <div class="cf-cat">${esc(cat)} &middot; ${porCat[cat].length}</div>
      ${porCat[cat].map(r => `
        <div class="cf-row">
          <span class="cf-row-n">${esc(r.item)}</span>
          <span class="cf-row-v cf-row-q">was ${n2(r.onHand ?? 0)}</span>
        </div>`).join('')}
    `).join('');
  }

  // ── El reparto por zona ──────────────────────────────────────────────
  function vistaZonas(b) {
    const z = _zonas || { filas: [], sinZona: 0, estado: '' };
    const E = {
      guardando: ['', 'Saving…'],
      ok:   ['ok',  'Saved. If the phone loses signal it retries on its own.'],
      nada: ['ok',  'Nothing new to save.'],
      mal:  ['mal', 'Could not save the zone breakdown. The count itself is fine.']
    };
    const e = E[z.estado] || ['', ''];

    b.innerHTML = `
      <div class="cf-sub">What you counted, split by where it was. Saved with
        the count, so you can look it up from anywhere.</div>
      ${z.filas.map(([n, v]) => `
        <div class="cf-zrow"><span class="n">${esc(n)}</span>
          <span class="v">${n2(v)}</span><span class="u">bottles</span></div>`).join('')}
      ${z.sinZona ? `
        <div class="cf-zrow cf-zrow-no"><span class="n">No zone</span>
          <span class="v">${n2(z.sinZona)}</span><span class="u">bottles</span></div>` : ''}
      ${e[1] ? `<div class="cf-est ${e[0]}">${esc(e[1])}</div>` : ''}
      ${pieDetalle('')}`;
    colgarPie(b);
  }

  // ── ¿Ya corrió el ciclo esta semana? ─────────────────────────────────
  //
  // La pregunta NO es "¿hubo reset esta semana?". Ese fue mi primer
  // intento y estaba mal de una forma que rompía el caso normal: el paso
  // 1 del botón resetea y escribe `weekly_reset_at = ahora`, así que al
  // terminar el primer conteo del lunes la respuesta habría sido "sí, ya
  // hay ciclo" y `runCycle` no habría corrido nunca. La semana anterior
  // se quedaba sin cerrar.
  //
  // La pregunta correcta es si ya existe un snapshot para la semana en
  // curso, que es exactamente lo que `saveSnapshot` crea al abrir ciclo.
  // Si lo hay, este es el segundo conteo y solo debe corregir números.
  async function cicloYaCorrio() {
    const c = window.BARSTOCK_CONFIG || {};
    if (!c.SUPABASE_URL || !c.SUPABASE_KEY || !window.BarStockParIntelligence) return false;
    try {
      const locationId = await window.BarStockParIntelligence.fetchLocationId();
      if (!locationId) return false;

      // La semana que este conteo abriria. Misma funcion que usa
      // par-intelligence para escribir las filas, no una copia: escrita
      // aparte solo habria hecho falta un domingo para separarse.
      const weekStart = window.BarStockWeek.cycleWeekKey();

      const res = await fetch(
        `${c.SUPABASE_URL}/rest/v1/inventory_snapshots` +
        `?location_id=eq.${locationId}&week_start=eq.${weekStart}&select=id&limit=1`,
        { headers: { apikey: c.SUPABASE_KEY, Authorization: `Bearer ${c.SUPABASE_KEY}` } });
      const rows = await res.json();
      return Array.isArray(rows) && rows.length > 0;
    } catch (e) {
      // Esto llevaba semanas fallando en silencio porque
      // fetchLocationId no estaba exportada: el TypeError caia aqui,
      // devolvia false, y el ciclo corria en CADA cierre. O sea que un
      // recuento del jueves movia `weekly_reset_at` al jueves y
      // reescribia el snapshot de la semana, que es justo lo que esta
      // funcion existe para impedir.
      //
      // Sin poder comprobarlo se corre el ciclo igual: es el lado por el
      // que conviene fallar, porque no cerrar una semana pierde el dato
      // de consumo para siempre, mientras que cerrarla de más deja un
      // ciclo raro que se ve y se puede arreglar. Pero se dice.
      console.warn('conteo: no se pudo comprobar si el ciclo ya corrio; ' +
                   'se correra de nuevo', e);
      return false;
    }
  }

  // Contar ES abrir el ciclo. Antes escanear no tocaba `weekly_reset_at`,
  // así que después de un conteo completo el botón seguía ofreciendo
  // "Start new cycle" y pulsarlo borraba el trabajo recién hecho.
  async function marcarCicloAbierto() {
    const c = window.BARSTOCK_CONFIG || {};
    if (!c.SUPABASE_URL || !c.SUPABASE_KEY || !c.LOCATION_NAME) return;
    try {
      await fetch(
        `${c.SUPABASE_URL}/rest/v1/locations` +
        `?account_id=eq.${encodeURIComponent(c.ACCOUNT_ID || '')}` +
        `&name=eq.${encodeURIComponent(c.LOCATION_NAME)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: c.SUPABASE_KEY, Authorization: `Bearer ${c.SUPABASE_KEY}`,
            Prefer: 'return=minimal'
          },
          body: JSON.stringify({ weekly_reset_at: new Date().toISOString() })
        });
      if (window.BarStockCycle && typeof window.BarStockCycle.invalidate === 'function') {
        window.BarStockCycle.invalidate();
      }
    } catch (e) {
      console.warn('conteo: no se pudo marcar el ciclo como abierto', e);
    }
  }

  // ── Escribir ─────────────────────────────────────────────────────────
  async function commit() {
    const s = S().summary();
    const master = (window.state && state.master) || [];
    $('cfBody').innerHTML = `<div class="cf-status">Backing up…</div>`;

    try {
      // Respaldo ANTES de tocar nada. replaceInventoryMaster borra la
      // tabla entera y la reinserta: si algo falla a mitad, esto es lo
      // unico que devuelve el inventario a donde estaba.
      if (window.BarStockBackup) await window.BarStockBackup.snapshot('scan-count');

      $('cfBody').innerHTML = `<div class="cf-status">Applying ${s.counted} counts…</div>`;

      const counted = new Set(S().countedItems());
      master.forEach(r => {
        if (counted.has(r.item)) {
          // ── De mililitros a botellas ─────────────────────────────────
          //
          // El conteo se suma en ml porque un 750 y un litro no se pueden
          // sumar de otra forma. Aqui se convierte a la unidad en la que
          // vive el inventario: botellas del tamaño que se ORDENA, que es
          // lo que significa bottle_size_ml.
          //
          // 1.5 de 750 mas 1.5 de litro son 2,625 ml. Antes se guardaban
          // como 3.0 botellas; en botellas de litro son 2.625. El error
          // iba en contra: menos inventario del que hay, y el par pedia
          // de mas.
          //
          // Sin tamaño declarado se cae a 750, que es lo que ya suponia
          // el resto de la app al dibujar.
          r.onHand = S().bottlesFor(r.item, Number(r.bottleSizeMl) || 750);

          // Las fracciones de las abiertas, para poder enseñarlas como
          // referencia en el siguiente conteo. No entran en ningun
          // calculo: solo sirven para que quien cuenta vea donde quedo
          // la botella la vez pasada, en vez de empezar de cero y
          // registrar un consumo que no ocurrio.
          r.lastOpens = S().passesOf(r.item)
            .reduce((a, p) => a.concat(p.opens || []), [])
            .filter(x => x > 0);
        } else if (_mode === 'zero') {
          r.onHand = 0;
        }
        // Con 'keep' no se toca: conserva el valor que ya tenia.
      });

      // Recalcular lo que depende del on hand, o la pantalla quedaria
      // diciendo cosas viejas hasta la siguiente importacion.
      if (typeof recomputeAll === 'function') recomputeAll();
      else if (typeof recalc === 'function') recalc();

      $('cfBody').innerHTML = `<div class="cf-status">Saving to the cloud…</div>`;
      // `exacto`: un conteo cambia cantidades, nunca quita productos.
      // Si la lista local llego corta, se para aqui en vez de borrar la
      // diferencia. El conteo no se pierde — esta en la sesion.
      await window.BarStockInventoryCloud.replaceInventoryMaster(master, { exacto: true });

      // ── El ciclo ─────────────────────────────────────────────────────
      //
      // El PRIMER conteo de la semana cierra el ciclo anterior y abre
      // uno nuevo, igual que al importar un archivo. Los siguientes NO.
      //
      // Esa distincion importa: un reconteo del jueves que volviera a
      // cerrar y abrir partiria la semana en dos ciclos, el consumo se
      // repartiria entre los dos y los promedios dejarian de ser
      // comparables con los de las semanas enteras. Un segundo conteo
      // corrige numeros; no empieza una semana nueva.
      //
      // Si falla, el conteo ya esta guardado y eso es lo que no se puede
      // perder: se avisa y se sigue.
      const yaHayCiclo = await cicloYaCorrio();
      try {
        if (window.BarStockParIntelligence && !yaHayCiclo) {
          // Camino 3 de 3 para abrir ciclo, y el que llegó tarde: este
          // paso faltaba, y por eso el panel lateral de órdenes se
          // quedaba clavado en la orden de la semana anterior. Ahora la
          // rutina es la misma que la del botón y la del archivo; ver
          // src/cycle-open.js.
          //
          // resetLocal en false: aquí `state.placedOrders` se reconstruye
          // desde el historial contra la frontera nueva, unas líneas más
          // abajo, así que vaciarlo antes sería trabajo tirado.
          window.BarStockCycleOpen?.prepare?.({ resetLocal: false });

          await window.BarStockParIntelligence.runCycle(master);
          await marcarCicloAbierto();
        }
        // runCycle acaba de CERRAR la semana anterior y abrir una nueva,
        // asi que la lista de semanas que tenga cargada Consumption Match
        // ya no dice la verdad. Sin esto, el ciclo que se acaba de cerrar
        // no aparece hasta recargar la pagina entera.
        window.BarStockTheoreticalUsage?.invalidateWeeks?.();
        window.BarStockConsumptionMatch?.reset?.();
      } catch (e) {
        console.warn('conteo: el ciclo de Par Intelligence fallo', e);
      }

      // El tiempo, antes de vaciar la sesión: `s` ya lo lleva dentro,
      // pero el anterior hay que leerlo mientras todavía es "el
      // anterior" y no el que acabamos de escribir.
      const antes = await tiempoAnterior();
      await guardarTiempo(s);

      // La sesion se vacia SOLO despues de que todo lo anterior salio
      // bien. Vaciarla antes y fallar al guardar seria perder el conteo
      // entero sin forma de recuperarlo.
      S().clear((window.BARSTOCK_CONFIG || {}).LOCATION_NAME || '');

      // `weekly_reset_at` acaba de moverse: hay que releerla y repintar
      // el boton del ciclo. Sin esto el boton seguia ofreciendo "Load the
      // count" con el conteo ya cerrado, hasta recargar la pagina.
      await window.BarStockCycleOpen?.settle?.('count');

      // Y reconstruir que filas cuentan como ya pedidas, ahora contra la
      // frontera NUEVA. Es lo que hace que la pantalla de ordenes arranque
      // limpia en vez de arrastrar las marcas del ciclo anterior.
      if (typeof window.rebuildPlacedOrdersFromHistory === 'function') {
        await window.rebuildPlacedOrdersFromHistory();
      }

      if (typeof saveState === 'function') saveState();
      // `window.render` y no `render` a secas: dentro de este IIFE hay
      // una funcion `render` propia —la de este panel— que le hacia
      // sombra a la de la app. Lo que se queria repintar aqui es la
      // pantalla principal con el on hand nuevo, y nunca se repintaba.
      if (typeof window.render === 'function') window.render();

      // ── Y ahora qué ──────────────────────────────────────────────────
      //
      // Contar no es el final de nada: se cuenta para decidir qué pedir.
      // Antes esta pantalla decía "listo" y te devolvía a donde estabas,
      // y los dos pasos siguientes —revisar la orden y subir las ventas
      // de la semana— había que ir a buscarlos a dos sitios distintos.
      //
      // El aviso de la primera semana está porque sin historial no hay
      // par, no hay sugerido y mis dos avisos se callan por diseño. Sin
      // decirlo, la primera vez parece que algo está roto.
      // El `.catch(() => false)` de antes se tragaba cualquier error y lo
      // convertia en "primera semana". Un fallo de red, una columna que
      // falta o un bug en el analisis salian todos como el mismo mensaje
      // de bienvenida, indistinguibles de un bar que de verdad acaba de
      // empezar. Ahora el error se ve.
      let primeraVez = true;
      if (window.BarStockCountInsight) {
        try {
          const r = await window.BarStockCountInsight.analizar(true);
          primeraVez = !r.listo;
        } catch (e) {
          console.warn('[conteo] el analisis del historial fallo; se enseña el ' +
                       'mensaje de primera semana sin que lo sea', e);
        }
      } else {
        console.warn('[conteo] BarStockCountInsight no esta cargado');
      }

      // ── Qué cambió, y qué toca ahora ────────────────────────────────
      //
      // Antes esto era un acuse: un visto verde, un párrafo gris con lo
      // que de verdad importaba —cuántos artículos se tocaron de
      // cuántos— en el texto más pequeño de la pantalla, el tiempo
      // ocupando el sitio de honor siendo lo menos accionable, y media
      // pantalla vacía debajo.
      //
      // Acabas de contar doscientas botellas durante veintidós minutos.
      // Lo único que quieres saber es qué hay que pedir. Así que el
      // cierre se resume en tres números y el siguiente paso trae el
      // suyo, en vez de mandarte a buscarlo.
      const pedir = loPorPedir();
      const compara = antes && antes.active_ms >= MINIMO_PARA_COMPARAR
        ? comparar(s.activeMs, antes.active_ms) : '';

      $('cfBody').innerHTML = `
        <div class="cf-done"><i class="ti ti-circle-check" aria-hidden="true"></i></div>
        <div class="cf-count">Count closed</div>
        <div class="cf-note">${yaHayCiclo
          ? 'Corrected this week · no new cycle'
          : 'A new week starts now'}</div>

        <!-- Los tres números del cierre. Lo que cambió y lo que no es
             lo que antes iba en el párrafo pequeño: 5 de 260 es una
             frase muy distinta de 255 de 260, y de un vistazo tiene
             que verse cuál de las dos fue.

             El tiempo es ACTIVO: los ratos en que nadie registró nada
             no cuentan, así que no es la hora de empezar menos la de
             acabar. -->
        <div class="cf-tres">
          <div class="cf-t1"><b class="ok">${s.counted}</b><small>updated</small></div>
          <div class="cf-t1"><b>${s.missing}</b><small>${
            _mode === 'zero' ? 'set to zero' : 'untouched'}</small></div>
          ${s.activeMs ? `<div class="cf-t1">
            <b>${esc(S_FMT(s.activeMs))}</b><small>counting</small></div>` : ''}
        </div>
        ${compara ? `<div class="cf-vs">${esc(compara)}</div>` : ''}

        ${primeraVez ? `
          <div class="cf-first">
            This is your first closed week here. From the next one on, the
            app will flag what is missing that you actually use, and any
            count that does not match your history.
          </div>` : ''}

        <!-- El siguiente paso, con su número ya puesto.

             Si no hay nada que pedir NO se enseña "0 items · ~$0": un
             cero grande en una tarjeta destacada se lee como un fallo
             de carga. Se dice que no hay nada, y el paso que manda
             pasa a ser subir las ventas. -->
        ${pedir.n ? `
          <div class="cf-next-card">
            <div class="cf-next-k">Next</div>
            <div class="cf-next-h">Check the order</div>
            <div class="cf-next-big">${pedir.n} ${pedir.n === 1 ? 'item' : 'items'} · ~${esc(dinero(pedir.dinero))}</div>
            <!-- La tilde y esta linea no son adorno: el dinero sale de
                 tu precio de catalogo, no de lo que te van a cobrar. Un
                 signo de dolar a secas se lee como una factura. -->
            <div class="cf-next-s">${pedir.vendors} ${
              pedir.vendors === 1 ? 'vendor' : 'vendors'} · at your catalogue prices</div>
            <button class="cf-cta" id="cfGoOrder" type="button">Open Ordering</button>
          </div>
          <button class="cf-next" id="cfGoSales" type="button">
            <i class="ti ti-file-upload" aria-hidden="true"></i>
            <span><b>Upload this week's sales</b><small>Needed for Variance to compare</small></span>
            <i class="ti ti-chevron-right" aria-hidden="true"></i>
          </button>`
        : `
          <div class="cf-next-card">
            <div class="cf-next-k">Next</div>
            <div class="cf-next-h">Upload this week's sales</div>
            <div class="cf-next-s" style="margin-top:6px">Nothing to order right now · Variance needs the sales to compare</div>
            <button class="cf-cta" id="cfGoSales" type="button">Open Variance</button>
          </div>`}

        <button class="cf-ghost" id="cfEnd" type="button">Not now</button>`;

      // bsOpenSection es la misma función que usan las pastillas del
      // encabezado: una sola forma de navegar, no una segunda inventada
      // aquí que mañana se quede atrás cuando cambien las secciones.
      const irA = (s) => {
        if (typeof window.bsOpenSection === 'function') window.bsOpenSection(s);
      };
      // Con todo pedido no hay boton de ordenar, asi que se comprueba
      // antes de engancharlo. Sin esto, un bar al dia con sus pedidos
      // reventaba aqui y se quedaba sin pantalla de cierre.
      const al = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
      al('cfEnd', () => close(false));
      al('cfGoOrder', () => { close(false); irA('vendor'); });
      al('cfGoSales', () => { close(false); irA('consumption'); });

      if (typeof setStatus === 'function') setStatus(`Count closed · ${s.counted} items updated.`);

    } catch (e) {
      // No se vacia la sesion y no se cierra el panel: el conteo sigue
      // intacto en el dispositivo y se puede reintentar. Y se enseña el
      // error de verdad, porque en un telefono no hay consola.
      console.warn('conteo: fallo al cerrar', e);
      $('cfBody').innerHTML = `
        <div class="cf-warn">Could not close the count. Nothing was lost — your count is still saved on this phone.</div>
        <div class="cf-err">${esc(e.message || String(e))}</div>
        <button class="cf-ghost" id="cfBack3" type="button">Back</button>
        <button class="cf-go" id="cfRetry" type="button">Try again</button>`;
      $('cfBack3').onclick = () => close(true);
      $('cfRetry').onclick = commit;
    }
  }

  function close(backToScan) {
    const el = $('cfPanel');
    if (el) el.classList.remove('on');
    if (backToScan) { if (_onCancel) _onCancel(); }
    else { if (_onDone) _onDone(); }
  }

  // `_porPedir` sale sólo para el test: es la cuenta que se enseña en
  // grande al cerrar, y comprobarla leyendo HTML sería comprobar el
  // formato, no la suma.
  window.BarStockCountFinish = { open, close, _porPedir: loPorPedir };
})();
