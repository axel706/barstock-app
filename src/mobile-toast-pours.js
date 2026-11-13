(() => {
  if (window.BarStockMobileToastPours) return;
  // ── Settings › Toast › Pours ─────────────────────────────────────────
  //
  // Axel, 2026-11-13, opción A sobre lámina: cada restaurante pone sus
  // pours. Una fila por cada medida que ESTA locación usa en Toast (los
  // grupos de debajo de Liquor: Single, Double, UP/RX… o los suyos), con
  // sus onzas en pasos de 0.25. Una medida sin onzas sale arriba, en
  // ámbar: sus licores no se pueden emparejar ni contar hasta tenerla.
  // Las que dicen sus onzas en el nombre ("2oz", "3oz") van en una fila
  // aparte, sin tocar.
  //
  // Guardar recalcula todo, también lo ya emparejado (Axel, "y sí
  // recalcula"): el cálculo lee las medidas al momento (toast-pours.js).

  const P = () => window.BarStockToastPours;
  const TL = () => window.BarStockToastLiquor;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PASO = 0.25;
  // Si Toast no se puede leer, las de siempre: algo que ajustar hay.
  const DE_SIEMPRE = ['Single', 'Double', 'UP/RX', 'Shot', 'Mix'];

  let _host = null, _cab = null, _volver = null;
  let _filas = null;       // [{ clave, medida, n, oz, auto }]
  let _cambios = {};       // clave → oz, sin guardar
  let _aviso = '', _error = '';

  // Las medidas de esta locación en Toast, con cuántos artículos de licor
  // se venden así. Por clave: "UP/RX" y "Up/Rx" son una.
  function medidasEnUso() {
    const d = TL() && TL().datos();
    if (!d || d.estado !== 'listo') return null;
    const por = new Map();
    for (const f of d.filas || []) {
      if (!f.medida) continue;
      const k = P().clave(f.medida);
      if (!por.has(k)) por.set(k, { clave: k, medida: f.medida, n: 0 });
      por.get(k).n++;
    }
    return [...por.values()];
  }

  function armar() {
    const uso = medidasEnUso();
    const base = uso && uso.length ? uso : DE_SIEMPRE.map(m => ({ clave: P().clave(m), medida: m, n: null }));
    _filas = base.map(x => Object.assign(x, {
      auto: P().enNombre(x.medida) !== undefined,
      oz: P().ozDe(x.medida)
    })).sort((a, b) => (b.n || 0) - (a.n || 0) || a.medida.localeCompare(b.medida));
  }

  const ozActual = (x) => Object.prototype.hasOwnProperty.call(_cambios, x.clave) ? _cambios[x.clave] : x.oz;
  const fmt = (oz) => oz === undefined ? '—' : String(Math.round(oz * 100) / 100);
  const cuenta = (x) => x.n == null ? 'Not seen in Toast yet' : x.n + (x.n === 1 ? ' liquor' : ' liquors') + ' sold this way';

  function fila(x) {
    const oz = ozActual(x);
    return `<div class="m-po-f${oz === undefined ? ' falta' : ''}">
      <span class="m-po-t">${esc(x.medida)}<small>${esc(cuenta(x))}</small></span>
      <span class="m-po-paso">
        <button type="button" data-menos="${esc(x.clave)}" aria-label="Less">−</button>
        <b>${fmt(oz)} oz</b>
        <button type="button" data-mas="${esc(x.clave)}" aria-label="More">+</button>
      </span></div>`;
  }

  function pintar() {
    const host = _host;
    if (!host || !host.isConnected) return;
    const loc = (window.BARSTOCK_CONFIG || {}).LOCATION_NAME || 'this location';
    let cuerpo;
    if (!_filas) cuerpo = '<div class="m-tw-aviso">Reading the sizes Toast uses here…</div>';
    else {
      const manual = _filas.filter(x => !x.auto);
      const faltan = manual.filter(x => ozActual(x) === undefined);
      const listas = manual.filter(x => ozActual(x) !== undefined);
      const autos = _filas.filter(x => x.auto);
      const hay = Object.keys(_cambios).length > 0;
      cuerpo =
        `<div class="m-tw-p">How much each way of selling a liquor pours at ${esc(loc)}. Changing one recounts every liquor sold that way. Recipes keep their own.</div>` +
        (_aviso ? `<div class="m-tw-aviso">${esc(_aviso)}</div>` : '') +
        (faltan.length ? `<div class="m-po-lab falta">Needs a pour · ${faltan.length}</div><div class="m-tl-sec m-po">${faltan.map(fila).join('')}</div>` : '') +
        (listas.length ? `<div class="m-po-lab">In use</div><div class="m-tl-sec m-po">${listas.map(fila).join('')}</div>` : '') +
        (autos.length ? `<div class="m-tl-sec m-po"><div class="m-po-f"><span class="m-po-t">${esc(autos.map(x => x.medida).join(' · '))}<small>Their size is in the name</small></span><span class="m-po-auto">auto</span></div></div>` : '') +
        (_error ? `<div class="m-tw-aviso mal">${esc(_error)}</div>` : '') +
        `<button type="button" class="m-set-save" id="poSave"${hay ? '' : ' disabled'}>Save pours</button>`;
    }
    host.innerHTML = (_cab ? _cab() : '') + '<div class="m-tw m-po-pant">' + cuerpo + '</div>';
    if (_volver) _volver();

    const x = (k) => (_filas || []).find(f => f.clave === k);
    host.querySelectorAll('[data-mas]').forEach(b => { b.onclick = () => {
      const f = x(b.dataset.mas); if (!f) return;
      const v = ozActual(f);
      // Sin onzas, el primer + pone la medida más común (1.5), no 0.25.
      _cambios[f.clave] = v === undefined ? 1.5 : Math.min(12, Math.round((v + PASO) * 100) / 100);
      _error = ''; pintar();
    }; });
    host.querySelectorAll('[data-menos]').forEach(b => { b.onclick = () => {
      const f = x(b.dataset.menos); if (!f) return;
      const v = ozActual(f);
      if (v === undefined) return;
      _cambios[f.clave] = Math.max(PASO, Math.round((v - PASO) * 100) / 100);
      _error = ''; pintar();
    }; });
    const g = host.querySelector('#poSave');
    if (g) g.onclick = guardar;
  }

  async function guardar() {
    const b = _host && _host.querySelector('#poSave');
    if (b) { b.disabled = true; b.textContent = 'Saving…'; }
    const porMedida = {};
    for (const f of _filas || []) if (Object.prototype.hasOwnProperty.call(_cambios, f.clave)) porMedida[f.medida] = _cambios[f.clave];
    try {
      await P().guardar(porMedida);
      _cambios = {}; _error = '';
      armar();
      _aviso = 'Saved. Every liquor sold in these sizes now counts with the new pours.';
      if (window.BarStockToast && window.BarStockToast.show) { try { window.BarStockToast.show('Pours saved'); } catch (e) {} }
    } catch (e) {
      _error = 'Not saved: ' + String((e && e.message) || e);
    }
    pintar();
  }

  async function montar(host, cab, volver) {
    _host = host; _cab = cab; _volver = volver;
    _filas = null; _cambios = {}; _aviso = ''; _error = '';
    pintar();
    // Las medidas guardadas, otra vez: pudieron cambiarse en otro teléfono.
    try { await P().cargar(true); }
    catch (e) { _error = String((e && e.message) || e); }
    // Las medidas en uso salen de lo que Toast vende aquí (Liquor from
    // Toast). Si no se puede leer, las de siempre.
    try { if (TL() && (!TL().datos() || TL().datos().estado !== 'listo')) await TL().cargar(); }
    catch (e) { /* se arma con las de siempre */ }
    armar();
    pintar();
  }

  window.BarStockMobileToastPours = { montar };
})();
