(() => {
  if (window.BarStockSettingsZones) return;

  // ── Ajustes · las zonas de la locacion ───────────────────────────────
  //
  // La lista de sitios donde hay botellas: main bar, closet, wine
  // cellar. El orden es el de los chips del escaner, asi que el que mas
  // se use va arriba.
  //
  // ── Por que se puede reordenar y no solo añadir ──────────────────────
  //
  // Durante un conteo el chip se toca cientos de veces. Que el primero
  // sea el que mas se usa no es cosmetica: es la diferencia entre
  // acertar siempre y tener que buscar.
  //
  // ── Quitar una zona no borra lo contado ──────────────────────────────
  //
  // Las botellas que ya se apuntaron en esa zona siguen en count_zones y
  // se siguen enseñando, al final de la lista. Si quitar una zona
  // borrara su contenido, un toque en ajustes haria desaparecer
  // inventario — y el inventario que desaparece sin dejar rastro es
  // exactamente lo que esta app existe para evitar.

  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  let _borrador = null;   // la lista que se esta editando
  let _guardando = false;

  function Z() { return window.BarStockZones; }

  async function load() {
    const host = $('zonesList');
    if (!host) return;
    host.innerHTML = '<div class="zs-empty">Loading…</div>';
    if (!Z()) { host.innerHTML = '<div class="zs-empty">Not available.</div>'; return; }
    await Z().cargar(true);
    _borrador = Z().lista().slice();
    paint();
  }

  function paint() {
    const host = $('zonesList');
    if (!host) return;

    if (!_borrador.length) {
      host.innerHTML = `
        <div class="zs-empty">
          No zones yet. Counting works exactly as it does today.<br>
          Add one to start tracking <b>where</b> each bottle is.
        </div>`;
    } else {
      host.innerHTML = _borrador.map((z, i) => `
        <div class="zs-row">
          <div class="zs-ord">
            <button type="button" data-up="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>
              <i class="ti ti-chevron-up" aria-hidden="true"></i></button>
            <button type="button" data-dn="${i}" aria-label="Move down" ${i === _borrador.length - 1 ? 'disabled' : ''}>
              <i class="ti ti-chevron-down" aria-hidden="true"></i></button>
          </div>
          <input class="zs-name ui-control" data-i="${i}" value="${esc(z)}"
                 maxlength="28" aria-label="Zone name">
          <button type="button" class="zs-del" data-del="${i}" aria-label="Remove">
            <i class="ti ti-trash" aria-hidden="true"></i></button>
        </div>`).join('');
    }

    host.querySelectorAll('.zs-name').forEach(el => {
      el.oninput = () => { _borrador[Number(el.dataset.i)] = el.value; sucio(true); };
    });
    host.querySelectorAll('[data-up]').forEach(b => {
      b.onclick = () => { mover(Number(b.dataset.up), -1); };
    });
    host.querySelectorAll('[data-dn]').forEach(b => {
      b.onclick = () => { mover(Number(b.dataset.dn), 1); };
    });
    host.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => { _borrador.splice(Number(b.dataset.del), 1); sucio(true); paint(); };
    });
  }

  function mover(i, d) {
    const j = i + d;
    if (j < 0 || j >= _borrador.length) return;
    const t = _borrador[i]; _borrador[i] = _borrador[j]; _borrador[j] = t;
    sucio(true);
    paint();
  }

  function sucio(v) {
    const b = $('zonesSave');
    if (b) b.disabled = !v || _guardando;
    const n = $('zonesNote');
    if (n && v) n.textContent = '';
  }

  function nota(txt, malo) {
    const n = $('zonesNote');
    if (!n) return;
    n.textContent = txt || '';
    n.className = 'zs-note' + (malo ? ' zs-bad' : '');
  }

  async function guardar() {
    if (_guardando || !Z()) return;
    _guardando = true;
    const b = $('zonesSave');
    if (b) { b.disabled = true; b.textContent = 'Saving…'; }
    try {
      const final = await Z().guardarLista(_borrador);
      _borrador = final.slice();
      paint();
      nota(final.length
        ? final.length + ' zone' + (final.length === 1 ? '' : 's') + ' saved.'
        : 'Zones turned off. Counting works as before.');
    } catch (e) {
      console.warn('[zonas] no se pudo guardar', e);
      nota('Could not save: ' + (e.message || e), true);
    } finally {
      _guardando = false;
      if (b) { b.textContent = 'Save zones'; b.disabled = true; }
    }
  }

  function init() {
    const add = $('zonesAdd');
    if (add && !add._z) {
      add._z = true;
      add.onclick = () => {
        _borrador.push('');
        paint();
        sucio(true);
        const campos = document.querySelectorAll('#zonesList .zs-name');
        const ult = campos[campos.length - 1];
        if (ult) try { ult.focus(); } catch (e) {}
      };
    }
    const save = $('zonesSave');
    if (save && !save._z) { save._z = true; save.onclick = guardar; }
  }

  window.__settingsHooks = window.__settingsHooks || {};
  window.__settingsHooks.zones = () => { init(); load(); };

  window.BarStockSettingsZones = { load };
})();
