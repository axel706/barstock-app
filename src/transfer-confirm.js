(() => {
  if (window.BarStockTransferConfirm) return;

  // ── Confirmar un transfer desde la otra locación (lámina C) ──────────
  //
  // Axel, 2026-11-18: "lo óptimo sería que la otra locación reciba el
  // Transfer en la app sin mover un dedo, sólo lo confirma". Sobre
  // lámina, la C: la primera tarjeta del Home mientras haya algo por
  // confirmar, en la campana, y un chip en la ficha del producto.
  // Confirmar en cualquiera quita los otros (todo lee de aquí).
  //
  // Al confirmar, esta locación pone SU producto: el que se recuerda de
  // transfers pasados entre las dos (transfers.miPareja), si no el que se
  // llama igual, y si no se elige ("Change" o al confirmar). Hasta
  // confirmar, aquí no cuenta nada.
  //
  // Aquí se lee lo pendiente (una vez por pintado, sin esperar) y se
  // arman la tarjeta, las líneas de la campana y el chip. Pide "Make and
  // send orders": sin él no sale nada que tocar.

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = () => window.BarStockTransfers;
  const G = () => window.BarStockGuest;
  const quien = () => { const g = G(); return (g && g.nombre && g.nombre()) || ''; };
  const master = () => (window.state && window.state.master) || [];
  const n = (x) => String(Math.round((Number(x) || 0) * 10) / 10);

  let _filas = null, _loc = null, _locs = null, _pidiendo = null;
  const _oyentes = new Set();
  const alCambiar = (f) => { _oyentes.add(f); return () => _oyentes.delete(f); };
  const avisar = () => { for (const f of _oyentes) { try { f(); } catch (e) { console.warn('[transfer]', e); } } };

  // Lee lo de esta locación (sin esperar a quien pinta). Al llegar algo
  // distinto, avisa para repintar.
  function cargar() {
    const t = T();
    if (!t || _pidiendo) return _pidiendo;
    _pidiendo = Promise.all([window.BarStockInventoryCloud.fetchLocationId(), t.locaciones(), t.leer()])
      .then(([loc, locs, filas]) => {
        const antes = JSON.stringify(porConfirmar());
        _loc = loc; _locs = locs; _filas = filas;
        if (JSON.stringify(porConfirmar()) !== antes) avisar();
      })
      .catch(e => console.warn('[transfer] no se pudo leer', e))
      .then(() => { _pidiendo = null; });
    return _pidiendo;
  }
  if (window.BarStockEvents && window.BarStockEvents.on) {
    window.BarStockEvents.on('transfersUpdated', () => { const t = T(); if (t) t.olvidar(); cargar(); });
  }

  const porConfirmar = () => (T() && _filas && _loc ? T().porConfirmar(_filas, _loc) : []);
  const puede = () => !!(T() && T().puede());
  const deDonde = (t) => T().nombreDe(_locs, T().otraLoc(t, _loc));
  const corta = (s) => String(s || '').replace(/^the\s+/i, '');

  // Mi producto para este transfer: el que ya puso alguien aquí, el de la
  // pareja recordada, o el que se llama igual. null si hay que elegirlo.
  function miProducto(t) {
    const T0 = T();
    const ya = T0.miItem(t, _loc);
    if (ya) return ya;
    const suyo = T0.suItem(t, _loc);
    const par = T0.miPareja(_filas, _loc, T0.otraLoc(t, _loc), suyo);
    if (par && master().some(r => r && r.item === par)) return par;
    const igual = master().find(r => r && r.item && suyo && r.item.toLowerCase() === suyo.toLowerCase());
    return igual ? igual.item : null;
  }
  const _elegido = new Map();   // id → el producto elegido con "Change"
  const productoDe = (t) => _elegido.get(t.id) || miProducto(t);

  // ── Un transfer es un GRUPO de filas (migración 046) ─────────────────
  //
  // Se confirma o se rechaza entero: todas sus líneas a la vez, cada una
  // con mi producto. Las de un producto (o de antes de la 046) son un
  // grupo de una.
  const gruposPend = () => (T() ? T().grupos(porConfirmar()) : []);
  const grupoDe = (x) => {
    if (Array.isArray(x)) return x;
    const k = T().grupoDe(x);
    const g = porConfirmar().filter(t => T().grupoDe(t) === k);
    return g.length ? g : [x];
  };
  const botellas = (g) => g.reduce((a, t) => a + (Number(t.qty) || 0), 0);

  // ── Confirmar / Not right ────────────────────────────────────────────
  // Si a alguna línea le falta mi producto, se elige (una a una) y se
  // sigue; nunca se confirma a ciegas.
  async function confirmar(x) {
    const g = grupoDe(x);
    const falta = g.find(t => !productoDe(t));
    if (falta) return elegir(falta, () => confirmar(g));
    const items = {};
    for (const t of g) items[t.id] = productoDe(t);
    const r = await T().confirmar(g, items, quien());
    const que = g.length === 1 ? n(g[0].qty) + ' ' + items[g[0].id] : g.length + ' items · ' + n(botellas(g)) + ' bottles';
    toast(!r.ok ? 'Not confirmed: ' + (r.error || 'unknown error')
      : r.aviso ? 'Confirmed, but not everything: ' + r.aviso
      : 'Confirmed · ' + que + (T().entra(g[0], _loc) ? ' from ' : ' to ') + deDonde(g[0]));
    if (r.ok) { const LC = window.BarStockLiveCache; if (LC && LC.caducar) LC.caducar(); }
  }
  async function noEsAsi(x) {
    const g = grupoDe(x);
    const t = g[0];
    const que = g.length === 1 ? n(t.qty) + ' ' + (T().suItem(t, _loc) || 'bottles') : g.length + ' items';
    const D = window.BarStockDialog;
    const ok = D && D.preguntar ? await D.preguntar({
      titulo: 'Not right?',
      cuerpo: que + ' from ' + deDonde(t) + ' will not count here, and ' +
        deDonde(t) + ' sees that you said it is not right.',
      ok: 'Not right', cancelar: 'Cancel', peligro: true
    }) : window.confirm('Mark this transfer as not right?');
    if (!ok) return;
    const r = await T().rechazar(g, 'Not right at ' + T().nombreDe(_locs, _loc), quien());
    toast(!r.ok ? 'Not saved: ' + (r.error || 'unknown error')
      : r.aviso ? 'Marked not right, but not everything was undone: ' + r.aviso
      : 'Marked not right · ' + deDonde(t) + ' will see it');
  }
  const toast = (x) => { if (window.BarStockToast) window.BarStockToast.show(x); };

  // ── Elegir mi producto ("Change") ────────────────────────────────────
  //
  // El buscador de toda la app a pantalla completa (bottle-search.js,
  // Axel 2026-11-18, lámina A): era una hoja propia que en el iPhone
  // hacía lo mismo que el campo de la factura. La pista es SU producto:
  // sin escribir salen los míos que comparten palabras con él.
  function elegir(t, despues) {
    const B = window.BarStockBottleSearch;
    if (!B || !B.abrir) return;
    const suyo = T().suItem(t, _loc) || '';
    B.abrir({
      pantalla: true,
      titulo: 'Which is yours?',
      sub: deDonde(t) + ' sent ' + n(t.qty) + ' ' + (suyo || 'bottles') + '. Which is yours?',
      productos: master().filter(r => r && r.item).map(r => r.item).sort((a, b) => a.localeCompare(b)),
      pista: suyo,
      que: 'products',
      alElegir: (p) => {
        B.cerrar();
        _elegido.set(t.id, p);
        avisar();
        if (despues) despues();
      }
    });
  }

  // ── Lo que pintan los demás ──────────────────────────────────────────
  //
  // La tarjeta del Home: el primero pendiente; si hay más, lo dice abajo.
  function tarjeta() {
    if (!puede()) return null;
    const gs = gruposPend();
    if (!gs.length) return null;
    const g = gs[0];
    if (g.length > 1) return tarjetaGrupo(g, gs.length);
    const ps = gs;
    const t = g[0];
    const mio = productoDe(t);
    const cuando = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' })
      .format(new Date(t.moved_at)).replace(',', '');
    const filas = [
      { n: 'Their product', v: T().suItem(t, _loc) || '—' },
      { n: 'Yours', v: mio || 'Choose' }
    ];
    return {
      tono: 'blue', transfer: true,
      k: '⇄ Transfer to confirm',
      tt: n(t.qty) + ' ' + (mio || T().suItem(t, _loc) || 'bottles'),
      sub: (T().entra(t, _loc) ? 'from ' : 'to ') + corta(deDonde(t)) + ' · ' + cuando + (t.created_by ? ' · ' + t.created_by : '') +
        (t.before_count ? ' · before the count' : ''),
      filas,
      mas: ps.length > 1 ? 'and ' + (ps.length - 1) + ' more to confirm' : '',
      // Sin producto, "Choose yours" elige Y confirma (confirmar() abre la
      // lista y confirma con lo elegido); "Change" sólo cambia.
      btn: mio ? 'Confirm ' + n(t.qty) : 'Choose yours',
      go: () => confirmar(t),
      btn2: 'Not right', go2: () => noEsAsi(t),
      btn3: mio ? 'Change' : '', goB3: () => elegir(t)
    };
  }

  // Varios productos: una línea por producto (como las de una orden) y
  // "Confirm all". Si a alguno le falta mi producto, "Choose yours".
  function tarjetaGrupo(g, cuantos) {
    const t = g[0];
    const cuando = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' })
      .format(new Date(t.moved_at)).replace(',', '');
    const todos = g.every(x => productoDe(x));
    return {
      tono: 'blue', transfer: true,
      k: '⇄ Transfer to confirm',
      tt: g.length + ' items · ' + n(botellas(g)) + ' bottles',
      sub: (T().entra(t, _loc) ? 'from ' : 'to ') + corta(deDonde(t)) + ' · ' + cuando + (t.created_by ? ' · ' + t.created_by : '') +
        (t.before_count ? ' · before the count' : ''),
      filas: g.slice(0, 3).map(x => ({ q: n(x.qty), n: productoDe(x) || T().suItem(x, _loc) || '—', v: productoDe(x) ? '' : 'choose' })),
      mas: [g.length > 3 ? 'and ' + (g.length - 3) + ' more items' : '', cuantos > 1 ? (cuantos - 1) + ' more to confirm' : ''].filter(Boolean).join(' · '),
      btn: todos ? 'Confirm all' : 'Choose yours',
      go: () => confirmar(g),
      btn2: 'Not right', go2: () => noEsAsi(g)
    };
  }

  // Las líneas de la campana: { clave, titulo, sub, confirmar, noEsAsi }.
  function avisos() {
    if (!puede()) return [];
    return gruposPend().map(g => {
      const t = g[0], uno = g.length === 1, todos = g.every(x => productoDe(x));
      return {
        clave: 'transfer:' + T().grupoDe(t),
        titulo: '⇄ ' + (uno ? n(t.qty) + ' ' + (T().suItem(t, _loc) || 'bottles') : g.length + ' items · ' + n(botellas(g)) + ' bottles') +
          (T().entra(t, _loc) ? ' from ' : ' to ') + deDonde(t),
        sub: uno ? (productoDe(t) ? 'As your ' + productoDe(t) : 'Choose which product is yours')
          : g.map(x => n(x.qty) + ' ' + (productoDe(x) || T().suItem(x, _loc))).join(', '),
        confirmar: () => confirmar(g), noEsAsi: () => noEsAsi(g),
        boton: todos ? (uno ? 'Confirm ' + n(t.qty) : 'Confirm all') : 'Choose yours'
      };
    });
  }

  // Lo que registré yo y la otra dijo "Not right", de la última semana:
  // quien lo mandó tiene que enterarse ("Crown says it's not right").
  function rechazados() {
    const T0 = T();
    if (!T0 || !_filas || !_loc) return [];
    const desde = Date.now() - 7 * 864e5;
    return _filas.filter(t => t.status === 'rejected' && T0.loRegistre(t, _loc) && Date.parse(t.status_at) > desde)
      .map(t => ({ clave: 'transfer-no:' + t.id,
        titulo: corta(deDonde(t)) + ' says the transfer is not right',
        sub: n(t.qty) + ' ' + (T0.miItem(t, _loc) || 'bottles') + (T0.entra(t, _loc) ? ' from ' : ' to ') + corta(deDonde(t)) +
          (t.status_by ? ' · ' + t.status_by : '') + ' · it does not count in either location' }));
  }

  // El chip de la ficha: lo pendiente de ESTE producto (por mi producto,
  // o por la pareja recordada).
  function deProducto(item) {
    if (!puede()) return [];
    return porConfirmar().filter(t => productoDe(t) === item);
  }

  // ── En la ficha: el bloque "Transfers" ───────────────────────────────
  //
  // Debajo de "Where it is" y no dentro: esa caja sólo sale con las zonas
  // encendidas, y una locación sin zonas también recibe transfers. Lo de
  // ESTE producto: lo que me toca confirmar ("12 coming from W+B ·
  // Confirm · Not right"), y lo que ya cuenta aquí desde el último
  // conteo ("+12 from W+B", "−12 to Crown · waiting for Crown"), con
  // "Undo" mientras no haya un conteo después.
  function cuandoNY(iso) {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' })
      .format(new Date(iso)).replace(',', '');
  }
  function ficha(item) {
    const T0 = T();
    if (!T0 || !_filas || !_loc) return '';
    const LC = window.BarStockLiveCache;
    const conteo = LC && LC.conteo ? LC.conteo() : null;
    const c = conteo ? Date.parse(conteo) : 0;
    const pend = deProducto(item);
    const aqui = _filas.filter(t => T0.cuentaAqui(t, _loc) && T0.miItem(t, _loc) === item && Date.parse(t.created_at) > c);
    if (!pend.length && !aqui.length) return '';
    const lineas = [];
    for (const t of pend) {
      lineas.push(`<div class="m-trf-l m-trf-pend"><span><b>${esc(n(t.qty))}</b> coming ${T0.entra(t, _loc) ? 'from' : 'to'} ${esc(corta(deDonde(t)))} · ${esc(cuandoNY(t.moved_at))}</span>
        ${puede() ? `<span class="m-trf-b"><button type="button" data-trf-ok="${esc(t.id)}">Confirm</button><button type="button" data-trf-no="${esc(t.id)}">Not right</button></span>` : ''}</div>`);
    }
    for (const t of aqui) {
      const entra = T0.entra(t, _loc);
      const espera = t.status === 'pending' ? ' · waiting for ' + corta(deDonde(t)) : '';
      lineas.push(`<div class="m-trf-l ${entra ? 'm-trf-in' : 'm-trf-out'}"><span><b>${entra ? '+' : '&minus;'}${esc(n(t.qty))}</b> ${entra ? 'from' : 'to'} ${esc(corta(deDonde(t)))} · ${esc(cuandoNY(t.moved_at))}${t.created_by ? ' · ' + esc(t.created_by) : ''}${esc(espera)}${t.before_count ? ' · before the count' : ''}</span>
        ${puede() && T0.deshacible(t, conteo) ? `<span class="m-trf-b"><button type="button" data-trf-undo="${esc(t.id)}">Undo</button></span>` : ''}</div>`);
    }
    return `<div class="m-trf"><div class="m-trf-k">Transfers</div>${lineas.join('')}</div>`;
  }
  // Los toques del bloque. `despues`: repintar la ficha.
  function enganchar(el, despues) {
    const T0 = T();
    if (!el || !T0) return;
    const de = (id) => (_filas || []).find(t => t.id === id);
    el.querySelectorAll('[data-trf-ok]').forEach(b => { b.onclick = async () => { const t = de(b.dataset.trfOk); if (t) { await confirmar(t); if (despues) despues(); } }; });
    el.querySelectorAll('[data-trf-no]').forEach(b => { b.onclick = async () => { const t = de(b.dataset.trfNo); if (t) { await noEsAsi(t); if (despues) despues(); } }; });
    el.querySelectorAll('[data-trf-undo]').forEach(b => { b.onclick = async () => {
      const t = de(b.dataset.trfUndo);
      if (!t) return;
      const LC = window.BarStockLiveCache;
      const r = await T0.deshacer(t, quien(), LC && LC.conteo ? LC.conteo() : null);
      toast(r.ok ? 'Transfer undone' : 'Not undone: ' + (r.error || 'unknown error'));
      if (r.ok && LC && LC.caducar) LC.caducar();
      if (despues) despues();
    }; });
  }

  window.BarStockTransferConfirm = { cargar, alCambiar, tarjeta, avisos, rechazados, deProducto, gruposPend, productoDe,
    estado: () => ({ filas: _filas, loc: _loc, locs: _locs }), confirmar, noEsAsi, elegir, miProducto, ficha, enganchar,
    _reset: () => { _filas = null; _loc = null; _locs = null; _pidiendo = null; _elegido.clear(); _oyentes.clear(); } };
})();
