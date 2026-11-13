(() => {
  if (window.BarStockMobileBartenders) return;
  // ── Settings › People › Bartenders ───────────────────────────────────
  //
  // Axel, 2026-11-12, opción A sobre lámina: "quiero que sean usuarios y
  // un PIN que yo les doy… necesito poder agregarlos desde la app". Sólo
  // lo ve Axel (mobile-settings.js enseña People sólo a él), y lo que
  // decide es el servidor: /api/admin rechaza a cualquier otro.
  //
  //   lista  → cada bartender con sus locaciones y su última entrada
  //   nuevo  → nombre, PIN (escrito o "Generate") y locaciones
  //   creado → el PIN grande, una sola vez, con "Copy name and PIN":
  //            después ni Axel lo puede leer (Supabase guarda sólo la
  //            huella), sólo cambiarlo
  //   ficha  → locaciones, Change PIN y Remove (dos toques)
  //
  // El atrás de la banda vuelve a la lista desde nuevo y ficha, como el
  // editor de Recipes.

  const A = () => window.BarStockAdminApi;
  const ID = () => window.BarStockBartenderId;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let _host = null, _cab = null, _volver = null;
  let _vista = 'lista';
  let _lista = null, _locs = null, _error = '';
  let _nuevo = null;       // { nombre, pin, locs:Set }
  let _creado = null;      // { nombre, pin, locs:[nombres] } — se enseña una vez
  let _ficha = null;       // { id, nombre, locs:Set, pin:null|string, borrar }

  // Seis dígitos al azar, del generador del navegador y no de Math.random.
  function generar() {
    const a = new Uint32Array(1);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return String(a[0] % 1000000).padStart(6, '0');
  }

  function cuando(iso) {
    if (!iso) return 'never signed in';
    const d = new Date(iso);
    if (isNaN(d)) return 'never signed in';
    const hoy = new Date();
    const hora = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === hoy.toDateString()) return 'last in today ' + hora;
    return 'last in ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  const nombresDe = (ids) => (_locs || []).filter(l => ids.has(l.id)).map(l => l.name);

  async function cargar() {
    _error = '';
    try {
      const [b, l] = await Promise.all([
        A().llamar('listBartenders'),
        _locs ? Promise.resolve({ ok: true, locations: _locs }) : A().llamar('listLocations')
      ]);
      if (!b || !b.ok) throw new Error((b && b.error) || 'no answer');
      if (!l || !l.ok) throw new Error((l && l.error) || 'no answer');
      _lista = b.bartenders || [];
      _locs = l.locations || [];
    } catch (e) {
      _lista = _lista || [];
      _error = 'Could not load the bartenders: ' + ((e && e.message) || e);
    }
  }

  function chips(sel, attr) {
    return '<div class="m-bt-chips">' + (_locs || []).map(l =>
      '<button type="button" class="m-bt-chip' + (sel.has(l.id) ? ' on' : '') + '" ' + attr + '="' + esc(l.id) + '" aria-pressed="' + sel.has(l.id) + '">' +
        esc(l.name) + '</button>').join('') + '</div>';
  }

  function aviso(t) {
    if (window.BarStockToast && window.BarStockToast.show) { try { window.BarStockToast.show(t); } catch (e) {} }
  }

  // ── Pintar ─────────────────────────────────────────────────────────
  function pintar() {
    const host = _host;
    if (!host || !host.isConnected) return;
    const err = _error ? '<div class="m-bt-err">' + esc(_error) + '</div>' : '';
    let cuerpo = '';
    if (_vista === 'nuevo') cuerpo = vistaNuevo(err);
    else if (_vista === 'ficha') cuerpo = vistaFicha(err);
    else cuerpo = vistaLista(err);
    host.innerHTML = (_cab ? _cab(_vista === 'nuevo' ? 'Add bartender' : _vista === 'ficha' ? _ficha.nombre : 'Bartenders') : '') +
      '<div class="m-bt">' + cuerpo + '</div>';
    if (_volver) _volver();
    const M = window.BarStockMobile;
    if (_vista !== 'lista' && M && M.alVolverBanda) M.alVolverBanda(aLista);
    enganchar(host);
  }

  function vistaLista(err) {
    if (_lista === null) return '<div class="m-bt-p">Loading…</div>';
    const creado = _creado ? '<div class="m-bt-ok">' +
        '<b>' + esc(_creado.nombre) + ' can sign in now</b>' +
        '<big>' + esc(_creado.pin) + '</big>' +
        '<small>Name: ' + esc(_creado.nombre) + ' · ' + esc(_creado.locs.join(', ')) + '</small>' +
        '<small>This is the only time the PIN is shown.</small>' +
      '</div>' +
      '<button type="button" class="m-set-save" id="btCopiar">Copy name and PIN</button>' : '';
    const filas = _lista.map(b =>
      '<button type="button" class="m-item m-bt-fila" data-b="' + esc(b.id) + '">' +
        '<span class="m-bt-ini">' + esc((b.name || '?').charAt(0).toUpperCase()) + '</span>' +
        '<span class="m-item-t">' + esc(b.name || '—') +
          '<small>' + esc(b.access.map(a => a.name).join(', ') || 'No location') + ' · ' + esc(cuando(b.lastSignIn)) + '</small>' +
        '</span><i class="ti ti-chevron-right m-chev" aria-hidden="true"></i></button>').join('');
    return err + creado +
      (filas || (!_creado ? '<div class="m-bt-p">No bartenders yet.</div>' : '')) +
      '<button type="button" class="m-bt-nueva" id="btNuevo">+ Add bartender</button>' +
      '<div class="m-bt-p">Bartenders sign in with their name and PIN. They see everything and can only edit recipes.</div>';
  }

  function vistaNuevo(err) {
    const n = _nuevo;
    return '<div class="m-set-f"><label for="btNom">Name</label>' +
        '<input id="btNom" type="text" autocomplete="off" autocapitalize="words" value="' + esc(n.nombre) + '" placeholder="Billie">' +
        '<small>What they type to sign in. Capitals and spaces don\'t matter.</small></div>' +
      '<div class="m-set-f"><label for="btPin">PIN · 6 digits</label>' +
        '<div class="m-bt-pinf"><input id="btPin" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" value="' + esc(n.pin) + '">' +
        '<button type="button" class="m-bt-gen" id="btGen">Generate</button></div></div>' +
      '<div class="m-set-f"><label>Locations</label>' + chips(n.locs, 'data-nl') + '</div>' +
      err +
      '<button type="button" class="m-set-save" id="btCrear">' + esc('Create ' + (n.nombre.trim() || 'bartender')) + '</button>';
  }

  function vistaFicha(err) {
    const f = _ficha;
    const pin = f.pin !== null
      ? '<div class="m-set-f"><label for="btPin">New PIN · 6 digits</label>' +
          '<div class="m-bt-pinf"><input id="btPin" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" value="' + esc(f.pin) + '">' +
          '<button type="button" class="m-bt-gen" id="btGen">Generate</button></div>' +
          '<small>The old PIN stops working when you save.</small></div>' +
        '<button type="button" class="m-set-save" id="btPinGuardar">Save PIN</button>'
      : '<button type="button" class="m-bt-sec" id="btPinCambiar">Change PIN</button>';
    return '<div class="m-set-f"><label>Locations</label>' + chips(f.locs, 'data-fl') +
        '<small>Changes save as you tap.</small></div>' +
      err + pin +
      '<button type="button" class="m-bt-sec m-bt-del" id="btQuitar">' + esc(f.borrar ? 'Tap again to remove ' + f.nombre : 'Remove ' + f.nombre) + '</button>';
  }

  // ── Lo que hace cada cosa ──────────────────────────────────────────
  function enganchar(host) {
    const q = (s) => host.querySelector(s);
    if (q('#btNuevo')) q('#btNuevo').onclick = () => {
      const activa = (_locs || []).find(l => l.name === (window.BARSTOCK_CONFIG || {}).LOCATION_NAME);
      _nuevo = { nombre: '', pin: generar(), locs: new Set(activa ? [activa.id] : []) };
      _creado = null; _error = ''; _vista = 'nuevo'; pintar();
    };
    if (q('#btCopiar')) q('#btCopiar').onclick = async () => {
      const c = _creado;
      const t = 'BarStock · sign in as ' + c.nombre + ' with PIN ' + c.pin;
      const D = window.BarStockDevPanel;
      const hecho = D && D.copiar ? await D.copiar(t) : false;
      aviso(hecho ? 'Copied.' : 'Could not copy. Write it down: ' + c.nombre + ' · ' + c.pin);
    };
    host.querySelectorAll('[data-b]').forEach(b => { b.onclick = () => {
      const x = (_lista || []).find(y => y.id === b.dataset.b);
      if (!x) return;
      _ficha = { id: x.id, nombre: x.name, locs: new Set(x.access.map(a => a.locationId)), pin: null, borrar: false };
      _creado = null; _error = ''; _vista = 'ficha'; pintar();
    }; });

    const nom = q('#btNom'), pin = q('#btPin');
    const soloDigitos = (el) => { el.value = el.value.replace(/\D/g, '').slice(0, 6); };
    if (nom) nom.oninput = () => {
      _nuevo.nombre = nom.value;
      const b = q('#btCrear'); if (b) b.textContent = 'Create ' + (nom.value.trim() || 'bartender');
    };
    if (pin) pin.oninput = () => {
      soloDigitos(pin);
      if (_vista === 'nuevo') _nuevo.pin = pin.value; else _ficha.pin = pin.value;
    };
    if (q('#btGen')) q('#btGen').onclick = () => {
      const p = generar();
      if (_vista === 'nuevo') _nuevo.pin = p; else _ficha.pin = p;
      if (pin) pin.value = p;
    };
    host.querySelectorAll('[data-nl]').forEach(b => { b.onclick = () => {
      const s = _nuevo.locs; s.has(b.dataset.nl) ? s.delete(b.dataset.nl) : s.add(b.dataset.nl); pintar();
    }; });
    if (q('#btCrear')) q('#btCrear').onclick = crear;

    host.querySelectorAll('[data-fl]').forEach(b => { b.onclick = () => cambiarLocs(b.dataset.fl); });
    if (q('#btPinCambiar')) q('#btPinCambiar').onclick = () => { _ficha.pin = generar(); _error = ''; pintar(); };
    if (q('#btPinGuardar')) q('#btPinGuardar').onclick = guardarPin;
    if (q('#btQuitar')) q('#btQuitar').onclick = quitar;
  }

  // Lo que se comprueba aquí es para decirlo antes de llamar; lo que
  // manda es la misma regla en el servidor (src/bartender-id.js).
  async function crear() {
    const n = _nuevo, b = _host.querySelector('#btCrear');
    const nombre = n.nombre.trim();
    _error = !ID().nombreValido(nombre) ? 'Enter a name.'
      : !ID().pinValido(n.pin) ? 'The PIN has to be 6 digits.'
      : !n.locs.size ? 'Choose at least one location.' : '';
    if (_error) return pintar();
    if (b) { b.disabled = true; b.textContent = 'Creating…'; }
    const r = await A().llamar('createBartender', { name: nombre, pin: n.pin, locationIds: Array.from(n.locs) })
      .catch(e => ({ ok: false, error: (e && e.message) || String(e) }));
    if (!r || !r.ok) { _error = 'Not created: ' + ((r && r.error) || 'no answer'); return pintar(); }
    _creado = { nombre, pin: n.pin, locs: nombresDe(n.locs) };
    _nuevo = null; _vista = 'lista';
    await cargar();
    pintar();
  }

  async function cambiarLocs(id) {
    const f = _ficha;
    const antes = new Set(f.locs);
    f.locs.has(id) ? f.locs.delete(id) : f.locs.add(id);
    if (!f.locs.size) { f.locs = antes; _error = 'A bartender needs at least one location. To take all access away, remove them.'; return pintar(); }
    _error = ''; pintar();
    const r = await A().llamar('setBartender', { userId: f.id, locationIds: Array.from(f.locs) })
      .catch(e => ({ ok: false, error: (e && e.message) || String(e) }));
    if (!r || !r.ok) { f.locs = antes; _error = 'Not saved: ' + ((r && r.error) || 'no answer'); return pintar(); }
    aviso('Saved: ' + f.nombre + ' · ' + nombresDe(f.locs).join(', '));
  }

  async function guardarPin() {
    const f = _ficha, b = _host.querySelector('#btPinGuardar');
    if (!ID().pinValido(f.pin)) { _error = 'The PIN has to be 6 digits.'; return pintar(); }
    if (b) { b.disabled = true; b.textContent = 'Saving…'; }
    const r = await A().llamar('setBartender', { userId: f.id, pin: f.pin })
      .catch(e => ({ ok: false, error: (e && e.message) || String(e) }));
    if (!r || !r.ok) { _error = 'Not saved: ' + ((r && r.error) || 'no answer'); return pintar(); }
    // El PIN nuevo se enseña como al crearlo: una vez, en la lista.
    _creado = { nombre: f.nombre, pin: f.pin, locs: nombresDe(f.locs) };
    _ficha = null; _vista = 'lista';
    await cargar();
    pintar();
  }

  async function quitar() {
    const f = _ficha;
    if (!f.borrar) { f.borrar = true; pintar(); return; }
    const b = _host.querySelector('#btQuitar');
    if (b) { b.disabled = true; b.textContent = 'Removing…'; }
    const r = await A().llamar('removeBartender', { userId: f.id })
      .catch(e => ({ ok: false, error: (e && e.message) || String(e) }));
    if (!r || !r.ok) { f.borrar = false; _error = 'Not removed: ' + ((r && r.error) || 'no answer'); return pintar(); }
    aviso(f.nombre + ' can no longer sign in.');
    _ficha = null; _vista = 'lista';
    await cargar();
    pintar();
  }

  // Al volver a la lista se LEE otra vez. Antes se pintaba la que se
  // trajo al entrar: una locación tocada en la ficha se guardaba (salía
  // "Saved"), pero la lista y la ficha, al reabrirla, seguían con la de
  // antes, y parecía que no se había guardado (Axel, 2026-11-13). Se
  // pinta ya con lo que había y se repinta al llegar lo del servidor.
  async function aLista() {
    _vista = 'lista'; _nuevo = null; _ficha = null; _error = ''; pintar();
    await cargar();
    if (_vista === 'lista') pintar();
  }

  async function montar(host, cab, volver) {
    _host = host; _cab = cab; _volver = volver;
    _vista = 'lista'; _nuevo = null; _ficha = null; _creado = null; _lista = null; _error = '';
    pintar();
    await cargar();
    pintar();
  }

  window.BarStockMobileBartenders = { montar, generar };
})();
