(() => {
  if (window.BarStockMobileCycle) return;

  // ── La pantalla del ciclo ────────────────────────────────────────────
  //
  // En el escritorio el ciclo es UN botón en el encabezado que va
  // cambiando de cara: "Start new cycle" → "Load the count" →
  // "Counting" → "Cycle open". Funciona en una tira de 40px porque
  // siempre dice la única cosa que toca hacer ahora.
  //
  // En el teléfono ese botón no existe: vive dentro de .wrap, que se
  // esconde mientras hay pantalla propia. Y aquí hay sitio para algo
  // mejor que un botón: la rutina entera con el paso en el que estás.
  //
  // ── Esto NO deduce el estado ─────────────────────────────────────────
  //
  // El paso sale de weekly-cycle.js, que lo deduce del estado real
  // —weekly_reset_at y si algún artículo tiene on hand— en vez de
  // recordarlo. Aquí sólo se pinta, y la acción es la MISMA función.
  // Dos sitios deduciendo el paso por su cuenta es la forma segura de
  // que un día digan cosas distintas, y el día que lo hagan uno de los
  // dos estará ofreciendo "poner todo a cero" sobre un conteo hecho.
  //
  // ── Y el conteo tampoco se reimplementa ──────────────────────────────
  //
  // Contar abre BarStockScanCount, el mismo escáner de siempre. Es lo
  // que mejor funciona de esta app y lo que más ha costado.

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const W = () => window.BarStockWeeklyCycle;
  const S = () => window.BarStockCountSession;

  function master() { return (window.state && window.state.master) || []; }

  function estado() {
    const w = W();
    if (!w || !w.estado) return 'loading';
    try { return w.estado(); } catch (e) { return 'loading'; }
  }

  function llamar(nombre) {
    const w = W();
    if (!w || typeof w[nombre] !== 'function') return null;
    try { return w[nombre](); } catch (e) { return null; }
  }

  // ── Los tres pasos ───────────────────────────────────────────────────
  //
  // Son los mismos tres de la rutina de cada lunes. Se pintan SIEMPRE
  // los tres: media pantalla de pasos tachados es lo que te dice de un
  // vistazo cuánto falta, y un paso que aparece y desaparece según el
  // estado no deja aprenderse la rutina.

  function pasos(st) {
    const reset = llamar('resetAt');
    const fecha = reset && W().fmtDate ? W().fmtDate(reset) : '';
    const abierto = st !== 'step1' && st !== 'loading';

    const ses = S();
    let contados = 0, hayConteo = false;
    try {
      hayConteo = !!(ses && ses.exists && ses.exists());
      contados = ses && ses.size ? ses.size() : 0;
    } catch (e) {}
    const contado = st === 'done';

    const v = pendientes();

    return [
      { n: 1, t: 'Cycle opened', s: fecha ? fecha : 'Not started', ok: abierto },
      { n: 2, t: contado ? 'Counted' : 'Count the bottles',
             s: contado ? master().length + ' items'
                        : hayConteo ? contados + ' so far' : 'With the scanner',
             ok: contado },
      { n: 3, t: v.n ? v.n + (v.n === 1 ? ' vendor waiting' : ' vendors waiting')
                     : 'Place the orders',
             s: v.n ? money(v.total) : 'When the count is in',
             ok: false, azul: !!v.n }
    ];
  }

  const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');

  function pendientes() {
    if (typeof window.getActiveVendors !== 'function' ||
        typeof window.getOrderRowsForVendor !== 'function' ||
        typeof window.computeOrderSubtotal !== 'function') return { n: 0, total: 0 };
    let n = 0, total = 0;
    try {
      for (const nombre of window.getActiveVendors()) {
        if (nombre === 'UNKNOWN') continue;
        const filas = window.getOrderRowsForVendor(nombre);
        if (!filas.length) continue;
        total += window.computeOrderSubtotal(filas);
        n++;
      }
    } catch (e) { return { n: 0, total: 0 }; }
    return { n, total };
  }

  // ── La tarjeta de arriba ─────────────────────────────────────────────
  //
  // Dice en qué paso estás y lleva la única acción que toca. Cada
  // estado explica lo que va a pasar ANTES de que pase: en el
  // escritorio eso vive en un `title`, y en un teléfono un `title` no
  // lo lee nadie nunca.

  function cabecera(st) {
    if (st === 'loading') {
      return { tono: 'wait', k: 'Checking…', t: 'Reading the cycle', d: '', btn: '' };
    }

    if (st === 'step1') {
      return {
        tono: 'green', k: 'Step 1 of 3', t: 'Start a new cycle',
        d: 'Sets on hand to zero for this location so the count starts clean.',
        btn: 'Start'
      };
    }

    if (st === 'step2') {
      return {
        tono: 'green', k: 'Step 2 of 3', t: 'Load the count',
        d: 'From a file, or count the bottles with your phone.',
        btn: 'Load it'
      };
    }

    if (st === 'counting') {
      const ses = S();
      let n = 0;
      try { n = ses && ses.size ? ses.size() : 0; } catch (e) {}
      const tot = master().length;
      const pct = tot ? Math.round((n / tot) * 100) : 0;

      const pau = !!llamar('pausado');
      const viejo = !!llamar('abandonado');
      const ms = llamar('quietoDesdeHace');
      const cuanto = (ms !== null && ms !== undefined && W().hace) ? W().hace(ms) + ' ago' : '';

      const zona = (window.BarStockZones && window.BarStockZones.activas())
        ? window.BarStockZones.paraPasada() : '';

      // Tres estados, no dos. Pausado es deliberado; abandonado es
      // olvidado. Uno se retoma cuando toque, el otro hay que decidir
      // si se tira — y decidir eso necesita saber cuánto lleva quieto.
      return {
        tono: viejo ? 'red' : 'amber',
        ico: pau ? 'player-pause' : viejo ? 'alert-triangle' : 'player-record',
        k: 'Step 2 · ' + (pau ? 'Paused' : viejo ? 'Abandoned' : 'Counting') +
           (cuanto ? ' ' + cuanto : ''),
        t: tot ? n + ' of ' + tot + ' counted' : n + ' counted',
        barra: pct,
        d: viejo
          ? 'Nobody has touched this in over three days. Pick it up, or discard it.'
          : (zona ? 'Last scan in ' + zona + ' · ' : '') +
            (tot ? (tot - n) + ' left' : ''),
        btn: viejo ? 'Pick it up' : 'Keep counting'
      };
    }

    // done
    const reset = llamar('resetAt');
    const fecha = reset && W().fmtDate ? W().fmtDate(reset) : '';
    const ms = llamar('edadCiclo');
    const viejo = !!llamar('cicloViejo');
    const lleva = (ms && W().cuantoLleva) ? W().cuantoLleva(ms) : '';

    return {
      tono: viejo ? 'amber' : 'teal',
      ico: viejo ? 'alert-triangle' : 'circle-check',
      k: 'Cycle open',
      t: fecha ? 'Since ' + fecha + (lleva ? ' · ' + lleva : '') : 'Open',
      d: viejo
        ? 'Open longer than a week. Usage keeps adding up until you restart.'
        : 'Usage keeps adding up until you restart.',
      btn: ''
    };
  }

  // ── Pintar ───────────────────────────────────────────────────────────

  function render(host) {
    if (!host) return;
    const st = estado();
    const c = cabecera(st);
    const ps = pasos(st);

    host.innerHTML = `
      <div class="m-cyc-t">This week</div>

      <div class="m-card m-cyc-h m-cyc-${esc(c.tono)}">
        <div class="m-cyc-k">${c.ico ? `<i class="ti ti-${esc(c.ico)}" aria-hidden="true"></i> ` : ''}${esc(c.k)}</div>
        <div class="m-cyc-n">${esc(c.t)}</div>
        ${c.barra !== undefined
          ? `<div class="m-cyc-bar"><span style="width:${c.barra}%"></span></div>` : ''}
        ${c.d ? `<div class="m-cyc-d">${esc(c.d)}</div>` : ''}
        ${c.btn ? `<button type="button" class="m-cyc-go" id="mcGo">${esc(c.btn)}</button>` : ''}
      </div>

      <div class="m-cyc-steps">
        ${ps.map(p => `
          <div class="m-cyc-s${p.ok ? ' on' : ''}${p.azul ? ' next' : ''}">
            <span class="m-cyc-sn">${p.ok ? '<i class="ti ti-check" aria-hidden="true"></i>' : p.n}</span>
            <span class="m-cyc-st">${esc(p.t)}<small>${esc(p.s)}</small></span>
          </div>`).join('')}
      </div>

      ${st === 'counting' ? `
        <button type="button" class="m-cyc-reset" id="mcDrop">
          <i class="ti ti-trash" aria-hidden="true"></i> Discard this count
        </button>
        <div class="m-cyc-warn">
          Throws away the ${esc(String(contados(st)))} bottles counted so far.
          The cycle stays open, so you can start counting again.
        </div>
      ` : ''}

      <!-- Reiniciar el ciclo NO vive aquí: vive en la tarjeta del Home,
           junto al resto de acciones del ciclo. Tenerlo en los dos
           sitios era dos caminos para lo único de esta app que borra
           el inventario entero. -->`;

    const go = host.querySelector('#mcGo');
    // La MISMA accion del boton de escritorio. Reimplementarla aqui
    // seria tener dos caminos para poner el inventario a cero.
    if (go) go.onclick = () => { const w = W(); if (w && w.accion) w.accion(); };


    const dr = host.querySelector('#mcDrop');
    if (dr) dr.onclick = async () => {
      // Se dice el número. "¿Descartar el conteo?" no deja decidir;
      // "vas a tirar 112 botellas contadas" sí.
      const n = contados(estado());
      const ok = await preguntar({
        titulo: 'Discard this count?',
        cuerpo: 'The cycle stays open.',
        aviso: n + ' bottle' + (n === 1 ? '' : 's') +
               ' counted so far will be thrown away. This cannot be undone.',
        ok: 'Discard', cancelar: 'Keep counting', peligro: true
      });
      if (!ok) return;
      const w = W();
      if (w && w.descartarConteo) w.descartarConteo();
    };
  }

  // El diálogo de la app en vez del `confirm()` del navegador. El
  // respaldo es por si este archivo corriera sin `dialog.js`: quedarse
  // sin preguntar y seguir adelante sería lo peor que podría pasar aquí.
  function preguntar(o) {
    const D = window.BarStockDialog;
    if (D && D.confirmar) return D.confirmar(o);
    return Promise.resolve(window.confirm(o.titulo));
  }

  function contados(st) {
    if (st !== 'counting') return 0;
    const ses = S();
    try { return (ses && ses.size) ? ses.size() : 0; } catch (e) { return 0; }
  }

  function refresh() {
    const host = document.querySelector('.m-screen[data-screen="cycle"]');
    if (host && host.classList.contains('on')) render(host);
    // El punto de la pestaña se ve desde cualquier pantalla, asi que se
    // repinta aunque el ciclo no este delante.
    if (window.BarStockMobile) window.BarStockMobile.refrescarBadges();
  }

  // El punto de la pestaña: conteo a medias o ciclo pasado de una
  // semana. Son las dos cosas que hay que ver sin entrar.
  function aviso() {
    const st = estado();
    if (st === 'counting') return 1;
    if (st === 'done' && llamar('cicloViejo')) return 1;
    return 0;
  }

  // ── ¿Tiene sentido escanear ahora mismo? ─────────────────────────────
  //
  // El círculo verde de la barra no siempre debe invitar. Contar sólo
  // tiene sentido con el ciclo abierto y el conteo sin cargar:
  //
  //   step1    no hay ciclo. Escanear antes de poner el on hand a cero
  //            mezcla el conteo nuevo con las existencias viejas, que
  //            es precisamente el error que el paso 1 existe para
  //            evitar.
  //   step2    es su momento. Verde.
  //   counting hay uno a medias. Verde, para retomarlo.
  //   done     la semana ya está contada. Escanear encima empezaría un
  //            conteo que ningún paso espera.
  //
  // Lo contesta este módulo y no el armazón porque el armazón no sabe
  // —ni debe saber— qué es un ciclo. Si este archivo no cargara, el
  // armazón deja el botón encendido: más vale un botón de más que
  // bloquear la acción principal del teléfono por un script que faltó.
  // El mensaje viene PARTIDO en título, detalle y consecuencia. Antes
  // era una sola cadena con saltos de línea, porque se la tragaba
  // `confirm()` del navegador y ahí no hay más que un párrafo. El
  // diálogo de la app sí distingue: la consecuencia irreversible va en
  // su propio renglón, en rojo, y se ve antes de leer nada.
  function escaneo() {
    const st = estado();
    if (st === 'step2' || st === 'counting') return { activo: true };

    if (st === 'loading') {
      return { activo: false, dialogo: {
        titulo: 'Still checking the cycle.',
        cuerpo: 'One moment.',
        // No hay nada que decidir, así que no se pregunta. Con
        // `confirm()` esto salía con OK y Cancel, y el OK te llevaba al
        // ciclo sin que nadie lo hubiera pedido.
        soloAviso: true
      } };
    }
    if (st === 'step1') {
      return { activo: false, dialogo: {
        titulo: 'Start the cycle first.',
        cuerpo: 'It sets on hand to zero so the count starts clean.',
        ok: 'Open the cycle', cancelar: 'Not now'
      } };
    }
    return { activo: false, dialogo: {
      titulo: 'This week is already counted.',
      cuerpo: 'Restart the cycle to count again.',
      aviso: 'Restarting sets every on hand back to zero.',
      ok: 'Open the cycle', cancelar: 'Not now', peligro: true
    } };
  }

  window.BarStockMobileCycle = { render, refresh, escaneo };

  function registrar() {
    if (!window.BarStockMobile) return;
    window.BarStockMobile.register({
      // Sin pestaña propia. Todas las acciones del ciclo viven en su
      // tarjeta del Home —empezar, contar, seguir, descartar,
      // reiniciar— así que una pestaña sólo para el detalle no vale un
      // hueco en la barra. Se entra desde el icono de la tarjeta.
      id: 'cycle', icon: 'ti-rotate-clockwise', label: 'Cycle',
      tab: false, orden: 20,
      mount: render, show: render,
      badge: aviso
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registrar);
  else registrar();
})();
