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
  let _defecto = '';      // con cual arranca cada conteo nuevo
  let _guardando = false;

  function Z() { return window.BarStockZones; }

  async function load() {
    const host = $('zonesList');
    if (!host) return;
    host.innerHTML = '<div class="zs-empty">Loading…</div>';
    if (!Z()) { host.innerHTML = '<div class="zs-empty">Not available.</div>'; return; }
    await Z().cargar(true);
    _borrador = Z().lista().slice();
    _defecto = Z().porDefecto();
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
      // La estrella marca con que zona ARRANCA cada conteo nuevo. No es
      // lo mismo que ser la primera de la lista: el orden manda los
      // chips del escaner —por frecuencia de uso— y la estrella dice por
      // donde se empieza a contar. Un bar puede tocar mil veces "Main
      // bar" y empezar siempre por el closet.
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
          <button type="button" class="zs-star${esDefecto(z) ? ' on' : ''}" data-star="${i}"
                  aria-pressed="${esDefecto(z)}"
                  title="Start every new count in this zone">
            <i class="ti ti-star" aria-hidden="true"></i></button>
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
    host.querySelectorAll('[data-star]').forEach(b => {
      b.onclick = () => { _defecto = _borrador[Number(b.dataset.star)] || ''; sucio(true); paint(); };
    });
    host.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => {
        const i = Number(b.dataset.del);
        // Si se borra la que era por defecto, la primera que quede toma
        // el relevo. Quedarse sin zona de arranque haria que el siguiente
        // conteo empezara sin ninguna seleccionada.
        const era = esDefecto(_borrador[i]);
        _borrador.splice(i, 1);
        if (era) _defecto = _borrador[0] || '';
        sucio(true); paint();
      };
    });
  }

  function esDefecto(z) {
    const a = String(z || '').trim().toLowerCase();
    return !!a && a === String(_defecto || '').trim().toLowerCase();
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
      const final = await Z().guardarLista(_borrador, _defecto);
      _borrador = final.slice();
      _defecto = Z().porDefecto();
      paint();
      nota(final.length
        ? final.length + ' zone' + (final.length === 1 ? '' : 's') + ' saved. ' +
          'Every new count starts in ' + (_defecto || final[0]) + '.'
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
        // La primera zona que se crea es la de arranque por si sola:
        // obligar a marcar una estrella para que la funcion sirva seria
        // un paso extra sin ninguna decision detras.
        if (_borrador.length === 1) _defecto = '';
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
