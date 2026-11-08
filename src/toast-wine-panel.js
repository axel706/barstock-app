(() => {
  if (window.BarStockToastWinePanel) return;

  // ── Wine from Toast · la tabla del escritorio ───────────────────────
  //
  // La vista de escritorio del emparejamiento. La lógica (qué se sugiere,
  // qué se guarda, la locación) vive en toast-wine.js y la comparte con
  // las tarjetas del teléfono: aquí solo se pinta. Diseño que Axel aprobó
  // sobre lámina: una fila por artículo de Toast, ordenados por lo
  // vendido, con pestañas To review / Confirmed / Ignored y un botón para
  // confirmar de golpe las sugeridas claras.

  const W = () => window.BarStockToastWine;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let _tab = 'review';
  let _quitar = null;
  let _error = '';

  const NIVEL = {
    high: ['Suggested', 'tw-n-ok'],
    mid: ['Check', 'tw-n-dudo'],
    none: ['No match', 'tw-n-no']
  };

  // La entrada, en Connections: no necesita datos, así que se pinta sola.
  function entrada() {
    const el = $('twEntrada');
    if (!el) return;
    el.innerHTML = `
      <div class="tw-ent-t"><i class="ti ti-glass-full" aria-hidden="true"></i> Wine from Toast</div>
      <div class="tw-ent-s">Match each Toast wine to a bottle in your inventory, so Toast sales can be counted in bottles.</div>
      <button type="button" class="ui-control" id="twAbrir">Open</button>`;
    $('twAbrir').onclick = () => window.showSettingsPanel && window.showSettingsPanel('toastWine');
  }

  // Lo que pasa cuando no se puede emparejar, dicho tal cual.
  function aviso(d) {
    if (d.estado === 'cargando') {
      return `<div class="tw-aviso">Reading Toast sales… ${d.progreso || 0} of ${d.total || 7} days</div>`;
    }
    if (d.estado === 'sinRestaurante') {
      return `<div class="tw-aviso tw-aviso-mal">This location isn't linked to a Toast restaurant yet, so nothing can be matched here.
        <small>Toast data comes from restaurant ${esc(d.restaurante)}. It is set per location in Supabase (locations.toast_restaurant_guid).</small></div>`;
    }
    if (d.estado === 'otroRestaurante') {
      return `<div class="tw-aviso tw-aviso-mal">The Toast data here belongs to another restaurant, not to this location. Open this screen from that location.</div>`;
    }
    if (d.estado === 'error') {
      return `<div class="tw-aviso tw-aviso-mal">Couldn't load Toast wine.<small>${esc(d.error)}</small></div>`;
    }
    return '';
  }

  function opciones(productos, elegido) {
    return '<option value="">— Choose a wine —</option>' + productos.map(p =>
      `<option value="${esc(p)}"${p === elegido ? ' selected' : ''}>${esc(p)}</option>`).join('');
  }

  function pintar() {
    const host = $('twBody');
    if (!host) return;
    const d = W().datos() || { estado: 'cargando' };
    const cab = `
      <h4 style="margin:0 0 4px">Wine from Toast</h4>
      <div class="small muted" style="margin-bottom:14px">Each Toast item points to a wine in your inventory.
        A glass counts ${W().COPA_OZ} oz of its bottle; a bottle counts one. Several Toast items can point to the same wine.</div>`;
    if (d.estado !== 'listo') { host.innerHTML = cab + aviso(d); return; }

    const cuenta = (e) => d.filas.filter(f => f.estado === e).length;
    const claras = d.filas.filter(f => f.estado === 'review' && f.nivel === 'high' && f.producto).length;
    const lista = d.filas.filter(f => f.estado === _tab);

    const filas = lista.map(f => {
      let derecha;
      if (f.estado === 'review') {
        const n = NIVEL[f.nivel] || NIVEL.none;
        derecha = `<td><select class="tw-sel" data-g="${esc(f.guid)}">${opciones(d.productos, f.producto)}</select></td>
          <td class="tw-acc"><span class="tw-n ${n[1]}">${n[0]}</span>
            <button type="button" class="tw-b tw-ok" data-ok="${esc(f.guid)}">Confirm</button>
            <button type="button" class="tw-b tw-link" data-ig="${esc(f.guid)}">Ignore</button></td>`;
      } else {
        derecha = `<td>${f.producto ? esc(f.producto) : '<span class="muted">Not an inventory wine</span>'}</td>
          <td class="tw-acc"><button type="button" class="tw-b tw-link" data-un="${esc(f.guid)}">Undo</button></td>`;
      }
      return `<tr><td><b>${esc(f.nombre)}</b></td><td class="tw-g">${esc(f.grupo)}</td>
        <td><span class="tw-sv${f.servicio === 'bottle' ? ' tw-sv-b' : ''}">${esc(W().servicioTexto(f))}</span></td>
        <td class="tw-num">${f.vendido}</td>${derecha}</tr>`;
    }).join('');

    host.innerHTML = cab + `
      <div class="tw-barra">
        <div class="tw-tabs">
          <button type="button" data-tab="review" class="${_tab === 'review' ? 'on' : ''}">To review · ${cuenta('review')}</button>
          <button type="button" data-tab="confirmed" class="${_tab === 'confirmed' ? 'on' : ''}">Confirmed · ${cuenta('confirmed')}</button>
          <button type="button" data-tab="ignored" class="${_tab === 'ignored' ? 'on' : ''}">Ignored · ${cuenta('ignored')}</button>
        </div>
        ${_tab === 'review' && claras ? `<button type="button" class="ui-control" id="twTodas">Confirm all suggested (${claras})</button>` : ''}
      </div>
      ${_error ? `<div class="tw-aviso tw-aviso-mal">${esc(_error)}</div>` : ''}
      ${!d.completo ? '<div class="tw-aviso">Some days had more orders than could be read; sold counts may be short.</div>' : ''}
      ${lista.length ? `<table class="tw-tabla"><thead><tr><th>Toast item</th><th>Toast group</th><th>Serving</th>
        <th>Sold · ${W().DIAS} days</th><th>Inventory wine</th><th></th></tr></thead><tbody>${filas}</tbody></table>`
        : `<div class="tw-vacio">${_tab === 'review' ? 'Nothing left to review.' : 'Nothing here yet.'}</div>`}`;

    host.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { _tab = b.dataset.tab; _error = ''; pintar(); }; });
    const hacer = (fn) => async () => {
      _error = '';
      try { await fn(); } catch (e) { _error = 'Not saved: ' + String((e && e.message) || e); pintar(); }
    };
    host.querySelectorAll('[data-ok]').forEach(b => {
      b.onclick = hacer(async () => {
        const sel = host.querySelector(`.tw-sel[data-g="${CSS.escape(b.dataset.ok)}"]`);
        const v = sel && sel.value;
        if (!v) { _error = 'Choose a wine first.'; pintar(); return; }
        await W().confirmar(b.dataset.ok, v);
      });
    });
    host.querySelectorAll('[data-ig]').forEach(b => { b.onclick = hacer(() => W().ignorar(b.dataset.ig)); });
    host.querySelectorAll('[data-un]').forEach(b => { b.onclick = hacer(() => W().deshacer(b.dataset.un)); });
    const todas = $('twTodas');
    if (todas) todas.onclick = hacer(() => W().confirmarSugeridas());
  }

  function montar() {
    if (!W()) return;
    if (!_quitar) _quitar = W().alCambiar(() => { if (!($('settingsPanel-toastWine') || {}).classList || !$('settingsPanel-toastWine').classList.contains('hidden')) pintar(); });
    pintar();
    W().cargar();
  }

  window.__settingsHooks = window.__settingsHooks || {};
  window.__settingsHooks.toastWine = montar;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', entrada);
  else entrada();

  window.BarStockToastWinePanel = { montar, pintar, entrada };
})();
