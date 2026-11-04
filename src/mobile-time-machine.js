(() => {
  if (window.BarStockMobileTimeMachine) return;

  // ── Time Machine: cuánto se tardó en cada conteo ─────────────────────
  //
  // Cada conteo cerrado ya dejaba una fila en `count_sessions` (ver
  // `guardarTiempo` en count-finish.js y la migración 020), pero la app
  // sólo leía la última, para el "X min faster than last time" del
  // cierre. El historial existía y no había dónde verlo.
  //
  // Arriba, el último conteo en grande; debajo, los anteriores en
  // tarjetas pequeñas. Es la mezcla de B y C que eligió Axel sobre los
  // bocetos.
  //
  // Sólo lee. Nada de esta pantalla escribe en la base.
  //
  // ── Los conteos de prueba se enseñan ─────────────────────────────────
  //
  // Un conteo de menos de MINIMO_PARA_COMPARAR no es un conteo: es
  // alguien probando la interfaz. Se enseña igual, porque es justo lo
  // que Axel usa para probarla, pero SIN comparación: decir "40 min
  // faster" de un conteo de 30 segundos es la misma mentira que ya se
  // quitó de la pantalla de cierre.

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Cuántas barras caben en la tarjeta grande sin que las etiquetas de
  // fecha se pisen a 300px de ancho.
  const BARRAS = 6;

  const F = () => window.BarStockCountFinish || {};
  const minimo = () => Number(F().MINIMO_PARA_COMPARAR) || 0;

  // El formato es el de `count-session`, el mismo de la tarjeta del Home
  // y de la pantalla de cierre. Sin respaldo propio a propósito: un
  // segundo formateador aquí es un segundo sitio donde "1 h 12 min"
  // puede empezar a decirse distinto. count-session carga mucho antes.
  function dur(ms) {
    const S = window.BarStockCountSession;
    return (S && S.fmtDur) ? S.fmtDur(ms) : '—';
  }

  function porArticulo(f) {
    const n = Number(f.items) || 0;
    return n > 0 ? dur((Number(f.active_ms) || 0) / n) : '—';
  }

  function fecha(iso, corta) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', corta
      ? { month: 'short', day: 'numeric' }
      : { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // La comparación de un conteo con el que va justo antes. Vacía si
  // falta el anterior o si alguno de los dos es de prueba.
  function diferencia(f, antes, cola) {
    if (!antes) return null;
    const a = Number(f.active_ms) || 0, b = Number(antes.active_ms) || 0;
    if (a < minimo() || b < minimo()) return null;
    if (typeof F().comparar !== 'function') return null;
    return { txt: F().comparar(a, b, cola), rapido: a < b, lento: a > b };
  }

  // De las filas de la base a lo que se pinta. Sale aparte, y exportada,
  // para que el test compruebe las cuentas sin leer HTML.
  function armar(filas) {
    const lista = (Array.isArray(filas) ? filas : [])
      .filter(f => f && f.finished_at)
      .slice()
      .sort((x, y) => String(y.finished_at).localeCompare(String(x.finished_at)));
    if (!lista.length) return { ultimo: null, anteriores: [], barras: [] };

    const ultimo = Object.assign({}, lista[0], { dif: diferencia(lista[0], lista[1]) });
    const anteriores = lista.slice(1).map((f, i) => Object.assign({}, f, {
      dif: diferencia(f, lista[i + 2], ''),
      primero: i + 2 === lista.length
    }));

    // Las barras van de la más vieja a la más nueva, que es como se lee
    // una tendencia. Con un solo conteo no hay tendencia y no se pinta.
    const tramo = lista.slice(0, BARRAS).reverse();
    const max = Math.max.apply(null, tramo.map(f => Number(f.active_ms) || 0)) || 1;
    const barras = lista.length < 2 ? [] : tramo.map((f, i) => ({
      alto: Math.max(6, Math.round((Number(f.active_ms) || 0) / max * 100)),
      etiqueta: fecha(f.finished_at, true),
      ahora: i === tramo.length - 1
    }));

    return { ultimo, anteriores, barras };
  }

  async function leer() {
    const R = window.BarStockRest;
    if (!R || !R.leerTodo) throw new Error('The reader module did not load. Reload the app.');
    const loc = (window.BARSTOCK_CONFIG || {}).LOCATION_NAME || '';
    // Misma llave con la que escribe `guardarTiempo`: el nombre de la
    // locación, no su id.
    return R.leerTodo('count_sessions?location_name=eq.' + encodeURIComponent(loc) +
      '&select=id,finished_at,active_ms,items&order=finished_at.desc,id.desc');
  }

  // ── Pintar ───────────────────────────────────────────────────────────

  function cabecera() {
    const M = window.BarStockMobile;
    const loc = (window.BARSTOCK_CONFIG || {}).LOCATION_NAME || '';
    const o = {
      titulo: 'Time Machine',
      volverA: (M && M.nombreAnterior && M.nombreAnterior()) || 'Home',
      sub: (loc ? loc + ' · ' : '') + 'active time, pauses not counted'
    };
    return (M && M.cabecera) ? M.cabecera(o) : '<div class="m-inv-t">Time Machine</div>';
  }

  function claseDif(d) {
    return d.rapido ? ' rapido' : (d.lento ? ' lento' : '');
  }

  function tarjetaGrande(u, barras) {
    return `
      <div class="m-tm-hero">
        <div class="m-tm-k">Last count · ${esc(fecha(u.finished_at))}</div>
        <div class="m-tm-big">${esc(dur(u.active_ms))}</div>
        ${u.dif ? `<div class="m-tm-vs${claseDif(u.dif)}">${esc(u.dif.txt)}</div>` : ''}
        <div class="m-tm-par">
          <span><b>${esc(Number(u.items) || 0)}</b>items</span>
          <span><b>${esc(porArticulo(u))}</b>per item</span>
        </div>
        ${barras.length ? `
          <div class="m-tm-barras" aria-hidden="true">
            ${barras.map(b => `<span class="${b.ahora ? 'ahora' : ''}" style="height:${b.alto}%"></span>`).join('')}
          </div>
          <div class="m-tm-fechas" aria-hidden="true">
            ${barras.map(b => `<span>${esc(b.etiqueta)}</span>`).join('')}
          </div>` : ''}
      </div>`;
  }

  function tarjetaChica(f) {
    const der = f.dif
      ? `<span class="m-tm-dif${claseDif(f.dif)}">${esc(f.dif.txt)}</span>`
      : (f.primero ? '<span class="m-tm-dif">first saved</span>' : '');
    return `
      <div class="m-tm-card">
        <div class="m-tm-ch"><b>${esc(fecha(f.finished_at))}</b>${der}</div>
        <div class="m-tm-tres">
          <div><b>${esc(dur(f.active_ms))}</b>total</div>
          <div><b>${esc(Number(f.items) || 0)}</b>items</div>
          <div><b>${esc(porArticulo(f))}</b>per item</div>
        </div>
      </div>`;
  }

  function cuerpo(d) {
    if (!d.ultimo) {
      return `<div class="m-tm-nota">No counts saved yet. Close a count and its time shows up here.</div>`;
    }
    return tarjetaGrande(d.ultimo, d.barras) + (d.anteriores.length
      ? `<div class="m-tm-sec">Earlier counts</div>${d.anteriores.map(tarjetaChica).join('')}`
      : `<div class="m-tm-nota">This is your first saved count. From the next one on, earlier counts show up here and you will see whether each one went faster.</div>`);
  }

  function enganchar(host) {
    const M = window.BarStockMobile;
    if (M && M.alVolver) M.alVolver(host, () => M.volver());
  }

  // Cada entrada vuelve a leer. Si se entra dos veces seguidas, la
  // respuesta vieja no puede pisar a la nueva.
  let _gen = 0;

  async function pintar(host) {
    if (!host) return;
    const g = ++_gen;
    host.innerHTML = `<div class="m-tm">${cabecera()}
      <div class="m-tm-nota">Loading your counts…</div></div>`;
    enganchar(host);
    let filas;
    try {
      filas = await leer();
    } catch (e) {
      if (g !== _gen) return;
      // Se dice lo que pasó, tal cual. Nada de adivinar una causa.
      console.warn('[time machine] no se pudo leer count_sessions', e);
      host.innerHTML = `<div class="m-tm">${cabecera()}
        <div class="m-tm-nota mal">Could not load your count times.
          <small>${esc((e && e.message) || String(e))}</small></div></div>`;
      enganchar(host);
      return;
    }
    if (g !== _gen) return;
    host.innerHTML = `<div class="m-tm">${cabecera()}${cuerpo(armar(filas))}</div>`;
    enganchar(host);
  }

  window.BarStockMobileTimeMachine = { pintar, _armar: armar };

  function registrar() {
    if (!window.BarStockMobile) return;
    window.BarStockMobile.register({
      // Sin pestaña: se entra desde el reloj de la banda.
      id: 'timemachine', icon: 'ti-history', label: 'Time Machine',
      tab: false,
      show: pintar,
      atras(host, hacerlo) {
        if (hacerlo && window.BarStockMobile) window.BarStockMobile.volver();
        return true;
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registrar);
  else registrar();
})();
