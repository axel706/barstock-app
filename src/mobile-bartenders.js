(() => {
  if (window.BarStockMobileBartenders) return;
  // ── Settings › People: personas con nombre y PIN, y sus roles ────────
  //
  // Nació como "Bartenders" (Axel, 2026-11-12, opción A: "quiero que sean
  // usuarios y un PIN que yo les doy… necesito poder agregarlos desde la
  // app"). Desde el 2026-11-13 es People, con roles (lámina 3A): Owner,
  // Manager, Bartender y los que Axel cree; todos con nombre y PIN; el
  // mismo rol en todas sus locaciones; y por persona, las excepciones
  // ("aun cuando tengan el rol de manager pueda yo quitarle acceso a
  // ciertas funciones"). El archivo conserva su nombre para no mover el
  // orden de carga; la pantalla es People.
  //
  // La ven Axel y quien tenga "People and roles" (mobile-settings.js), y
  // lo que decide es el servidor: /api/admin. Crear o cambiar roles, y dar
  // o quitar Owner, sólo un Owner.
  //
  //   lista  → People / Roles. Cada persona con su rol, sus locaciones,
  //            cuántos permisos se le quitaron y su última entrada
  //   nuevo  → nombre, rol, locaciones y PIN (escrito o "Generate")
  //   creado → el PIN grande, una sola vez, con "Copy name and PIN":
  //            después nadie lo puede leer (Supabase guarda sólo la
  //            huella), sólo cambiarlo
  //   ficha  → rol, locaciones y la lista ENTERA de permisos del rol con
  //            su interruptor (3A): lo apagado sólo para ella lleva "Off
  //            for …" en ámbar; lo que el rol no da, en gris. Change PIN y
  //            Remove (dos toques). Todo se guarda al tocarlo.
  //   rol    → los permisos de un rol, en See y Do, con Save. Owner no se
  //            edita; Manager y Bartender sí, y los nuevos se pueden
  //            borrar si nadie los tiene
  //
  // "Money" y "Orders and invoices" salen como "Soon", sin poder tocarse:
  // esconder el dinero o la pestaña de Orders cambia cómo se ve la app y
  // está por dibujar. Un interruptor que no hace nada sería una afordancia
  // que miente.
  //
  // El atrás de la banda vuelve a la lista desde todo lo demás, como el
  // editor de Recipes, y al volver la lista se LEE otra vez: la que se
  // trajo al entrar ya no dice lo que se cambió (Axel, 2026-11-13: "lo
  // selecciono, me salgo, regreso y solamente tiene acceso a la locación
  // original").

  const A = () => window.BarStockAdminApi;
  const ID = () => window.BarStockBartenderId;
  const P = () => window.BarStockPermisos;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PRONTO = ['ver_dinero', 'ver_ordenes'];

  let _host = null, _cab = null, _volver = null;
  let _vista = 'lista', _tab = 'people';
  let _lista = null, _roles = null, _locs = null, _error = '';
  let _nuevo = null;       // { nombre, pin, rol, locs:Set }
  let _creado = null;      // { nombre, pin, locs:[nombres] } — se enseña una vez
  let _ficha = null;       // { id, nombre, rol, off:Set, locs:Set, pin:null|string, borrar }
  let _rol = null;         // { key|null, nombre, perms:Set, fijo, borrar }

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
  const rolDe = (key) => (_roles || []).find(r => r.key === key) || null;
  const nombreRol = (key) => (rolDe(key) || {}).name || key || '—';

  // ¿Soy Owner? Axel (su correo), o una persona de PIN con rol owner. Lo
  // que decide es el servidor; esto es para no enseñar lo que diría que no.
  function soyOwner() {
    const a = A(), G = window.BarStockGuest;
    return !!(a && a.soyAdmin && a.soyAdmin()) || !!(G && G.rol && G.rol() === 'owner');
  }
  // ¿Esta ficha es la mía? El servidor no deja cambiarse a uno mismo.
  function soyYo(id) {
    const G = window.BarStockGuest;
    return !!(id && G && G.id && G.id() === id);
  }

  async function cargar() {
    _error = '';
    try {
      const [b, l] = await Promise.all([
        A().llamar('listPeople'),
        _locs ? Promise.resolve({ ok: true, locations: _locs }) : A().llamar('listLocations')
      ]);
      if (!b || !b.ok) throw new Error((b && b.error) || 'no answer');
      if (!l || !l.ok) throw new Error((l && l.error) || 'no answer');
      _lista = b.people || [];
      _roles = b.roles || [];
      _locs = l.locations || [];
    } catch (e) {
      _lista = _lista || [];
      _roles = _roles || [];
      _error = 'Could not load the people: ' + ((e && e.message) || e);
    }
  }

  function chips(sel, attr) {
    return '<div class="m-bt-chips">' + (_locs || []).map(l =>
      '<button type="button" class="m-bt-chip' + (sel.has(l.id) ? ' on' : '') + '" ' + attr + '="' + esc(l.id) + '" aria-pressed="' + sel.has(l.id) + '">' +
        esc(l.name) + '</button>').join('') + '</div>';
  }
  // Los roles como píldoras. Owner sólo si quien mira es Owner (o si la
  // persona ya lo es: se ve, aunque no se pueda cambiar).
  function chipsRol(actual, attr) {
    return '<div class="m-bt-chips">' + (_roles || []).filter(r => r.key !== 'owner' || soyOwner() || actual === 'owner').map(r =>
      '<button type="button" class="m-bt-chip' + (r.key === actual ? ' on' : '') + '" ' + attr + '="' + esc(r.key) + '" aria-pressed="' + (r.key === actual) + '">' +
        esc(r.name) + '</button>').join('') + '</div>';
  }
  // Un interruptor. `estado`: 'on' | 'off' | 'gris'.
  function sw(attr, valor, estado, quieto) {
    return '<button type="button" class="m-pp-sw' + (estado === 'on' ? ' on' : '') + '" role="switch" aria-checked="' + (estado === 'on') + '"' +
      ' ' + attr + '="' + esc(valor) + '"' + (quieto ? ' disabled' : '') + '><i></i></button>';
  }

  function aviso(t) {
    if (window.BarStockToast && window.BarStockToast.show) { try { window.BarStockToast.show(t); } catch (e) {} }
  }

  // ── Pintar ─────────────────────────────────────────────────────────
  function titulo() {
    if (_vista === 'nuevo') return 'Add person';
    if (_vista === 'ficha') return _ficha.nombre;
    if (_vista === 'rol') return _rol.key ? _rol.nombre : 'New role';
    return 'People';
  }
  function pintar() {
    const host = _host;
    if (!host || !host.isConnected) return;
    const err = _error ? '<div class="m-bt-err">' + esc(_error) + '</div>' : '';
    let cuerpo = '';
    if (_vista === 'nuevo') cuerpo = vistaNuevo(err);
    else if (_vista === 'ficha') cuerpo = vistaFicha(err);
    else if (_vista === 'rol') cuerpo = vistaRol(err);
    else cuerpo = vistaLista(err);
    host.innerHTML = (_cab ? _cab(titulo()) : '') + '<div class="m-bt">' + cuerpo + '</div>';
    if (_volver) _volver();
    const M = window.BarStockMobile;
    if (_vista !== 'lista' && M && M.alVolverBanda) M.alVolverBanda(aLista);
    enganchar(host);
  }

  function vistaLista(err) {
    const tabs = '<div class="m-sx-tabs m-pp-tabs" role="tablist">' +
      '<button type="button" data-tab="people" class="' + (_tab === 'people' ? 'on' : '') + '">People</button>' +
      '<button type="button" data-tab="roles" class="' + (_tab === 'roles' ? 'on' : '') + '">Roles</button></div>';
    if (_lista === null) return tabs + '<div class="m-bt-p">Loading…</div>';
    if (_tab === 'roles') return tabs + err + vistaRoles();
    const creado = _creado ? '<div class="m-bt-ok">' +
        '<b>' + esc(_creado.nombre) + ' can sign in now</b>' +
        '<big>' + esc(_creado.pin) + '</big>' +
        '<small>Name: ' + esc(_creado.nombre) + ' · ' + esc(_creado.locs.join(', ')) + '</small>' +
        '<small>This is the only time the PIN is shown.</small>' +
      '</div>' +
      '<button type="button" class="m-set-save" id="btCopiar">Copy name and PIN</button>' : '';
    const filas = _lista.map(b => {
      // "N off": lo que el rol da y a esta persona se le quitó.
      const r = rolDe(b.role);
      const off = (b.off || []).filter(k => r && (r.perms || []).indexOf(k) >= 0).length;
      return '<button type="button" class="m-item m-bt-fila" data-b="' + esc(b.id) + '">' +
        '<span class="m-bt-ini">' + esc((b.name || '?').charAt(0).toUpperCase()) + '</span>' +
        '<span class="m-item-t">' + esc(b.name || '—') +
          '<small>' + esc(b.access.map(a => a.name).join(', ') || 'No location') + (off ? ' · ' + off + ' off' : '') + ' · ' + esc(cuando(b.lastSignIn)) + '</small>' +
        '</span><span class="m-pp-rol m-pp-rol-' + esc(b.role) + '">' + esc(nombreRol(b.role)) + '</span></button>';
    }).join('');
    return tabs + err + creado +
      (filas || (!_creado ? '<div class="m-bt-p">No one yet.</div>' : '')) +
      '<button type="button" class="m-bt-nueva" id="btNuevo">+ Add person</button>' +
      '<div class="m-bt-p">Everyone here signs in with their name and PIN. "off" counts what was taken away from that person.</div>';
  }

  function vistaRoles() {
    const filas = (_roles || []).map(r => '<button type="button" class="m-item m-bt-fila" data-r="' + esc(r.key) + '">' +
        '<span class="m-item-t">' + esc(r.name) +
          '<small>' + (r.key === 'owner' ? 'Everything' : (r.perms || []).length + ' of ' + P().TODOS.length) + ' · ' +
            (_lista || []).filter(b => b.role === r.key).length + ' people</small>' +
        '</span><span class="m-pp-rol m-pp-rol-' + esc(r.key) + '">' + esc(r.name) + '</span></button>').join('');
    return filas + (soyOwner() ? '<button type="button" class="m-bt-nueva" id="ppNuevoRol">+ New role</button>' : '') +
      '<div class="m-bt-p">' + (soyOwner() ? 'Changes reach each person the next time they open the app.' : 'Only an owner can change roles.') + '</div>';
  }

  function vistaNuevo(err) {
    const n = _nuevo;
    return '<div class="m-set-f"><label for="btNom">Name</label>' +
        '<input id="btNom" type="text" autocomplete="off" autocapitalize="words" value="' + esc(n.nombre) + '" placeholder="Maria">' +
        '<small>What they type to sign in. Capitals and spaces don\'t matter.</small></div>' +
      '<div class="m-set-f"><label>Role</label>' + chipsRol(n.rol, 'data-nr') + '</div>' +
      '<div class="m-set-f"><label>Locations</label>' + chips(n.locs, 'data-nl') + '</div>' +
      '<div class="m-set-f"><label for="btPin">PIN · 6 digits</label>' +
        '<div class="m-bt-pinf"><input id="btPin" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" value="' + esc(n.pin) + '">' +
        '<button type="button" class="m-bt-gen" id="btGen">Generate</button></div></div>' +
      err +
      '<button type="button" class="m-set-save" id="btCrear">' + esc('Create ' + (n.nombre.trim() || 'person')) + '</button>';
  }

  // La lista entera de permisos (3A).
  function permisosDe(f) {
    const r = rolDe(f.rol) || { perms: [], name: f.rol };
    const yo = soyYo(f.id);
    const corto = String(f.nombre || '').split(/\s+/)[0];
    const fila = (p) => {
      const pronto = PRONTO.indexOf(p.k) >= 0;
      const da = f.rol === 'owner' || (r.perms || []).indexOf(p.k) >= 0;
      const quitado = da && f.off.has(p.k);
      const estado = !da ? 'gris' : quitado ? 'off' : 'on';
      const sub = pronto ? 'Soon' : !da ? 'Not in ' + r.name : p.d || '';
      return '<div class="m-pp-perm' + (!da || pronto ? ' gris' : '') + '"><span>' + esc(p.n) +
          (quitado ? '<em>Off for ' + esc(corto) + '</em>' : '') +
          (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' +
        sw('data-fp', p.k, estado, !da || pronto || yo || f.rol === 'owner') + '</div>';
    };
    const C = P().CATALOGO;
    const nota = f.rol === 'owner' ? 'Owners can do everything.' : yo ? 'You can\'t change your own permissions.' : 'Changes save as you tap.';
    return '<div class="m-set-f"><label>What ' + esc(corto) + ' can do</label>' +
      '<div class="m-pp-lista">' + C.filter(p => p.ver).map(fila).join('') + '</div>' +
      '<div class="m-pp-lista">' + C.filter(p => !p.ver).map(fila).join('') + '</div>' +
      '<small>' + esc(nota) + '</small></div>';
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
    return '<div class="m-set-f"><label>Role</label>' + chipsRol(f.rol, 'data-fr') +
        (f.rol === 'owner' && !soyOwner() ? '<small>Only an owner can change an owner.</small>' : '') + '</div>' +
      '<div class="m-set-f"><label>Locations</label>' + chips(f.locs, 'data-fl') + '</div>' +
      permisosDe(f) +
      err + pin +
      (soyYo(f.id) ? '' : '<button type="button" class="m-bt-sec m-bt-del" id="btQuitar">' + esc(f.borrar ? 'Tap again to remove ' + f.nombre : 'Remove ' + f.nombre) + '</button>');
  }

  function vistaRol(err) {
    const r = _rol;
    const edita = soyOwner() && !r.fijo;
    const fila = (p) => {
      const pronto = PRONTO.indexOf(p.k) >= 0;
      const on = r.fijo || r.perms.has(p.k);
      const sub = pronto ? 'Soon' : p.d || '';
      return '<div class="m-pp-perm' + (pronto ? ' gris' : '') + '"><span>' + esc(p.n) +
          (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' +
        sw('data-rp', p.k, on ? 'on' : 'off', !edita || pronto) + '</div>';
    };
    const C = P().CATALOGO;
    const usan = (_lista || []).filter(b => b.role === r.key).length;
    const nombre = !r.key
      ? '<div class="m-set-f"><label for="ppRolNom">Name</label><input id="ppRolNom" type="text" autocomplete="off" autocapitalize="words" value="' + esc(r.nombre) + '" placeholder="Bar Lead"></div>'
      : '';
    const nota = r.fijo ? 'Owners can do everything. This role can\'t be changed.'
      : !soyOwner() ? 'Only an owner can change roles.'
      : r.key ? usan + (usan === 1 ? ' person has' : ' people have') + ' this role. Saving changes it for them too.' : '';
    return nombre +
      '<div class="m-set-f"><label>See</label><div class="m-pp-lista">' + C.filter(p => p.ver).map(fila).join('') + '</div></div>' +
      '<div class="m-set-f"><label>Do</label><div class="m-pp-lista">' + C.filter(p => !p.ver).map(fila).join('') + '</div>' +
      (nota ? '<small>' + esc(nota) + '</small>' : '') + '</div>' +
      err +
      (edita ? '<button type="button" class="m-set-save" id="ppRolGuardar">' + esc(r.key ? 'Save ' + r.nombre : 'Create role') + '</button>' : '') +
      (edita && r.key && !P().FABRICA[r.key]
        ? '<button type="button" class="m-bt-sec m-bt-del" id="ppRolBorrar">' + esc(r.borrar ? 'Tap again to remove ' + r.nombre : 'Remove ' + r.nombre) + '</button>' : '');
  }

  // ── Lo que hace cada cosa ──────────────────────────────────────────
  function enganchar(host) {
    const q = (s) => host.querySelector(s);
    host.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { _tab = b.dataset.tab; _creado = null; _error = ''; pintar(); }; });
    if (q('#btNuevo')) q('#btNuevo').onclick = () => {
      const activa = (_locs || []).find(l => l.name === (window.BARSTOCK_CONFIG || {}).LOCATION_NAME);
      // Bartender de entrada: el rol que menos puede. Se cambia con un toque.
      _nuevo = { nombre: '', pin: generar(), rol: 'bartender', locs: new Set(activa ? [activa.id] : []) };
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
      _ficha = { id: x.id, nombre: x.name, rol: x.role, off: new Set(x.off || []),
        locs: new Set(x.access.map(a => a.locationId)), pin: null, borrar: false };
      _creado = null; _error = ''; _vista = 'ficha'; pintar();
    }; });
    host.querySelectorAll('[data-r]').forEach(b => { b.onclick = () => {
      const r = rolDe(b.dataset.r);
      if (!r) return;
      _rol = { key: r.key, nombre: r.name, perms: new Set(r.perms || []), fijo: !!r.fijo || r.key === 'owner', borrar: false };
      _error = ''; _vista = 'rol'; pintar();
    }; });
    if (q('#ppNuevoRol')) q('#ppNuevoRol').onclick = () => {
      _rol = { key: null, nombre: '', perms: new Set(), fijo: false, borrar: false };
      _error = ''; _vista = 'rol'; pintar();
    };

    const nom = q('#btNom'), pin = q('#btPin');
    const soloDigitos = (el) => { el.value = el.value.replace(/\D/g, '').slice(0, 6); };
    if (nom) nom.oninput = () => {
      _nuevo.nombre = nom.value;
      const b = q('#btCrear'); if (b) b.textContent = 'Create ' + (nom.value.trim() || 'person');
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
    host.querySelectorAll('[data-nr]').forEach(b => { b.onclick = () => { _nuevo.rol = b.dataset.nr; pintar(); }; });
    if (q('#btCrear')) q('#btCrear').onclick = crear;

    host.querySelectorAll('[data-fl]').forEach(b => { b.onclick = () => cambiarLocs(b.dataset.fl); });
    host.querySelectorAll('[data-fr]').forEach(b => { b.onclick = () => cambiarRol(b.dataset.fr); });
    host.querySelectorAll('[data-fp]').forEach(b => { b.onclick = () => cambiarPermiso(b.dataset.fp); });
    if (q('#btPinCambiar')) q('#btPinCambiar').onclick = () => { _ficha.pin = generar(); _error = ''; pintar(); };
    if (q('#btPinGuardar')) q('#btPinGuardar').onclick = guardarPin;
    if (q('#btQuitar')) q('#btQuitar').onclick = quitar;

    const rn = q('#ppRolNom');
    if (rn) rn.oninput = () => { _rol.nombre = rn.value; };
    host.querySelectorAll('[data-rp]').forEach(b => { b.onclick = () => {
      const s = _rol.perms; s.has(b.dataset.rp) ? s.delete(b.dataset.rp) : s.add(b.dataset.rp); pintar();
    }; });
    if (q('#ppRolGuardar')) q('#ppRolGuardar').onclick = guardarRol;
    if (q('#ppRolBorrar')) q('#ppRolBorrar').onclick = borrarRol;
  }

  const fallo = (e) => ({ ok: false, error: (e && e.message) || String(e) });

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
    const r = await A().llamar('createPerson', { name: nombre, pin: n.pin, role: n.rol, locationIds: Array.from(n.locs) }).catch(fallo);
    if (!r || !r.ok) { _error = 'Not created: ' + ((r && r.error) || 'no answer'); return pintar(); }
    _creado = { nombre, pin: n.pin, locs: nombresDe(n.locs) };
    _nuevo = null; _vista = 'lista'; _tab = 'people';
    await cargar();
    pintar();
  }

  // Tras cambiar el rol, la ficha se rehace con lo que dice el servidor:
  // el rol nuevo borra las excepciones del de antes, y eso lo decide él.
  async function releerFicha() {
    const id = _ficha.id;
    await cargar();
    const x = (_lista || []).find(y => y.id === id);
    if (x && _vista === 'ficha' && _ficha && _ficha.id === id) {
      Object.assign(_ficha, { rol: x.role, off: new Set(x.off || []), locs: new Set(x.access.map(a => a.locationId)) });
    }
  }

  async function cambiarLocs(id) {
    const f = _ficha;
    const antes = new Set(f.locs);
    f.locs.has(id) ? f.locs.delete(id) : f.locs.add(id);
    if (!f.locs.size) { f.locs = antes; _error = 'Everyone needs at least one location. To take all access away, remove them.'; return pintar(); }
    _error = ''; pintar();
    const r = await A().llamar('setPerson', { userId: f.id, locationIds: Array.from(f.locs) }).catch(fallo);
    if (!r || !r.ok) { f.locs = antes; _error = 'Not saved: ' + ((r && r.error) || 'no answer'); return pintar(); }
    aviso('Saved: ' + f.nombre + ' · ' + nombresDe(f.locs).join(', '));
  }

  async function cambiarRol(key) {
    const f = _ficha;
    if (key === f.rol) return;
    const antes = { rol: f.rol, off: f.off };
    f.rol = key; f.off = new Set(); _error = ''; pintar();
    const r = await A().llamar('setPerson', { userId: f.id, role: key }).catch(fallo);
    if (!r || !r.ok) { Object.assign(f, antes); _error = 'Not saved: ' + ((r && r.error) || 'no answer'); return pintar(); }
    aviso('Saved: ' + f.nombre + ' is ' + nombreRol(key));
    await releerFicha();
    pintar();
  }

  async function cambiarPermiso(k) {
    const f = _ficha;
    const antes = new Set(f.off);
    f.off.has(k) ? f.off.delete(k) : f.off.add(k);
    _error = ''; pintar();
    const r = await A().llamar('setPerson', { userId: f.id, off: Array.from(f.off) }).catch(fallo);
    if (!r || !r.ok) { f.off = antes; _error = 'Not saved: ' + ((r && r.error) || 'no answer'); return pintar(); }
    const p = P().CATALOGO.find(x => x.k === k);
    aviso((f.off.has(k) ? 'Off for ' : 'Back on for ') + f.nombre + ': ' + (p ? p.n : k));
  }

  async function guardarPin() {
    const f = _ficha, b = _host.querySelector('#btPinGuardar');
    if (!ID().pinValido(f.pin)) { _error = 'The PIN has to be 6 digits.'; return pintar(); }
    if (b) { b.disabled = true; b.textContent = 'Saving…'; }
    const r = await A().llamar('setPerson', { userId: f.id, pin: f.pin }).catch(fallo);
    if (!r || !r.ok) { _error = 'Not saved: ' + ((r && r.error) || 'no answer'); return pintar(); }
    // El PIN nuevo se enseña como al crearlo: una vez, en la lista.
    _creado = { nombre: f.nombre, pin: f.pin, locs: nombresDe(f.locs) };
    _ficha = null; _vista = 'lista'; _tab = 'people';
    await cargar();
    pintar();
  }

  async function quitar() {
    const f = _ficha;
    if (!f.borrar) { f.borrar = true; pintar(); return; }
    const b = _host.querySelector('#btQuitar');
    if (b) { b.disabled = true; b.textContent = 'Removing…'; }
    const r = await A().llamar('removePerson', { userId: f.id }).catch(fallo);
    if (!r || !r.ok) { f.borrar = false; _error = 'Not removed: ' + ((r && r.error) || 'no answer'); return pintar(); }
    aviso(f.nombre + ' can no longer sign in.');
    _ficha = null; _vista = 'lista';
    await cargar();
    pintar();
  }

  async function guardarRol() {
    const r = _rol, b = _host.querySelector('#ppRolGuardar');
    const nombre = String(r.nombre || '').trim();
    if (!nombre) { _error = 'Enter a name for the role.'; return pintar(); }
    if (b) { b.disabled = true; b.textContent = 'Saving…'; }
    const x = await A().llamar('saveRole', { key: r.key || undefined, name: nombre, perms: Array.from(r.perms) }).catch(fallo);
    if (!x || !x.ok) { _error = 'Not saved: ' + ((x && x.error) || 'no answer'); return pintar(); }
    aviso('Saved: ' + nombre + (x.people ? ' · ' + x.people + (x.people === 1 ? ' person' : ' people') : ''));
    _rol = null; _vista = 'lista'; _tab = 'roles';
    await cargar();
    pintar();
  }

  async function borrarRol() {
    const r = _rol;
    if (!r.borrar) { r.borrar = true; pintar(); return; }
    const x = await A().llamar('removeRole', { key: r.key }).catch(fallo);
    if (!x || !x.ok) { r.borrar = false; _error = 'Not removed: ' + ((x && x.error) || 'no answer'); return pintar(); }
    aviso(r.nombre + ' removed.');
    _rol = null; _vista = 'lista'; _tab = 'roles';
    await cargar();
    pintar();
  }

  // Al volver a la lista se LEE otra vez. Antes se pintaba la que se
  // trajo al entrar: una locación tocada en la ficha se guardaba (salía
  // "Saved"), pero la lista y la ficha, al reabrirla, seguían con la de
  // antes, y parecía que no se había guardado (Axel, 2026-11-13). Se
  // pinta ya con lo que había y se repinta al llegar lo del servidor.
  async function aLista() {
    _vista = 'lista'; _nuevo = null; _ficha = null; _rol = null; _error = ''; pintar();
    await cargar();
    if (_vista === 'lista') pintar();
  }

  async function montar(host, cab, volver) {
    _host = host; _cab = cab; _volver = volver;
    _vista = 'lista'; _tab = 'people'; _nuevo = null; _ficha = null; _rol = null; _creado = null; _lista = null; _error = '';
    pintar();
    await cargar();
    pintar();
  }

  window.BarStockMobileBartenders = { montar, generar };
})();
