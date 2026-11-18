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

  // ── Confirmar / Not right ────────────────────────────────────────────
  async function confirmar(t) {
    const mio = productoDe(t);
    if (!mio) return elegir(t, () => confirmar(t));
    const r = await T().confirmar(t, mio, quien());
    toast(!r.ok ? 'Not confirmed: ' + (r.error || 'unknown error')
      : r.aviso ? 'Confirmed, but not everything: ' + r.aviso
      : 'Confirmed · ' + n(t.qty) + ' ' + mio + (T().entra(t, _loc) ? ' from ' : ' to ') + deDonde(t));
    if (r.ok) { const LC = window.BarStockLiveCache; if (LC && LC.caducar) LC.caducar(); }
  }
  async function noEsAsi(t) {
    const D = window.BarStockDialog;
    const ok = D && D.preguntar ? await D.preguntar({
      titulo: 'Not right?',
      cuerpo: n(t.qty) + ' ' + (T().suItem(t, _loc) || 'bottles') + ' from ' + deDonde(t) + ' will not count here, and ' +
        deDonde(t) + ' sees that you said it is not right.',
      ok: 'Not right', cancelar: 'Cancel', peligro: true
    }) : window.confirm('Mark this transfer as not right?');
    if (!ok) return;
    const r = await T().rechazar(t, 'Not right at ' + T().nombreDe(_locs, _loc), quien());
    toast(!r.ok ? 'Not saved: ' + (r.error || 'unknown error')
      : r.aviso ? 'Marked not right, but not everything was undone: ' + r.aviso
      : 'Marked not right · ' + deDonde(t) + ' will see it');
  }
  const toast = (x) => { if (window.BarStockToast) window.BarStockToast.show(x); };

  // ── Elegir mi producto ("Change") ────────────────────────────────────
  //
  // Una hoja con mis productos: primero los que se parecen al suyo
  // (palabras en común), con un buscador. El campo va a 16 px en el
  // teléfono (el zoom de iOS), como todos.
  function parecido(a, b) {
    const pal = (s) => new Set(String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2));
    const A = pal(a), B = pal(b);
    let k = 0; for (const w of A) if (B.has(w)) k++;
    return k;
  }
  function elegir(t, despues) {
    const suyo = T().suItem(t, _loc) || '';
    const lista = master().filter(r => r && r.item)
      .map(r => ({ item: r.item, p: parecido(r.item, suyo) }))
      .sort((a, b) => b.p - a.p || a.item.localeCompare(b.item));
    const vieja = document.getElementById('mSheet');
    if (vieja) vieja.remove();
    const h = document.createElement('div');
    h.className = 'm-sheet'; h.id = 'mSheet';
    h.innerHTML = `<div class="m-sheet-bg"></div>
      <div class="m-sheet-box m-kp-hoja m-tr" role="dialog" aria-label="Your product">
        <div class="m-sheet-grip"></div>
        <div class="m-kp-t">Which is yours?</div>
        <div class="m-kp-s">${esc(deDonde(t))} sent ${esc(n(t.qty))} ${esc(suyo || 'bottles')}.</div>
        <input type="search" class="m-tr-buscar" placeholder="Search your products" aria-label="Search your products">
        <div class="m-tr-prods"></div>
      </div>`;
    document.body.appendChild(h);
    const cerrar = () => h.remove();
    if (window.BarStockSheet && window.BarStockSheet.enganchar) window.BarStockSheet.enganchar(h, cerrar);
    h.querySelector('.m-sheet-bg').onclick = cerrar;
    const caja = h.querySelector('.m-tr-prods'), inp = h.querySelector('.m-tr-buscar');
    const pinta = () => {
      const q = inp.value.trim().toLowerCase();
      const vis = lista.filter(x => !q || x.item.toLowerCase().includes(q)).slice(0, 40);
      caja.innerHTML = vis.map(x => `<button type="button" class="m-tr-loc" data-item="${esc(x.item)}">${esc(x.item)}</button>`).join('') ||
        '<div class="m-kp-s">Nothing with that name.</div>';
      caja.querySelectorAll('[data-item]').forEach(b => { b.onclick = () => {
        _elegido.set(t.id, b.dataset.item);
        cerrar();
        avisar();
        if (despues) despues();
      }; });
    };
    inp.oninput = pinta;
    pinta();
  }

  // ── Lo que pintan los demás ──────────────────────────────────────────
  //
  // La tarjeta del Home: el primero pendiente; si hay más, lo dice abajo.
  function tarjeta() {
    if (!puede()) return null;
    const ps = porConfirmar();
    if (!ps.length) return null;
    const t = ps[0];
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

  // Las líneas de la campana: { clave, titulo, sub, confirmar, noEsAsi }.
  function avisos() {
    if (!puede()) return [];
    return porConfirmar().map(t => ({
      clave: 'transfer:' + t.id,
      titulo: '⇄ ' + n(t.qty) + ' ' + (T().suItem(t, _loc) || 'bottles') + (T().entra(t, _loc) ? ' from ' : ' to ') + deDonde(t),
      sub: productoDe(t) ? 'As your ' + productoDe(t) : 'Choose which product is yours',
      confirmar: () => confirmar(t), noEsAsi: () => noEsAsi(t), boton: productoDe(t) ? 'Confirm ' + n(t.qty) : 'Choose yours'
    }));
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

  window.BarStockTransferConfirm = { cargar, alCambiar, tarjeta, avisos, rechazados, deProducto, confirmar, noEsAsi, elegir, miProducto, parecido, ficha, enganchar,
    _reset: () => { _filas = null; _loc = null; _locs = null; _pidiendo = null; _elegido.clear(); _oyentes.clear(); } };
})();
