(() => {
  // ── Panel de administracion ──────────────────────────────────────────
  //
  // Cuatro pestanas: solicitudes de registro, crear usuario, editar
  // accesos y borrar usuario.
  //
  // Esto venia de un HTML suelto que llevaba la llave service_role
  // escrita en el navegador. Aqui NO hay ninguna llave: todo pasa por
  // /api/admin, que corre en el servidor, guarda la llave en una variable
  // de entorno y rechaza a cualquiera que no sea ADMIN_EMAIL.
  //
  // Que esta seccion este oculta en el menu es comodidad, no seguridad.
  // La seguridad esta en el servidor, y sigue ahi aunque alguien escriba
  // BarStockAdmin.render() en la consola.

  const TABS = [
    { id: 'requests', label: 'Requests',    icon: 'ti-inbox' },
    { id: 'create',   label: 'Create user', icon: 'ti-user-plus' },
    { id: 'access',   label: 'Edit access', icon: 'ti-key' },
    { id: 'delete',   label: 'Delete user', icon: 'ti-user-minus' },
    { id: 'wipe',     label: 'Wipe data',   icon: 'ti-eraser' }
  ];

  let _tab = 'requests';
  let _locations = [];
  let _newSel = new Set();     // ubicaciones marcadas al crear
  let _editUser = null;        // usuario cargado en "Editar accesos"
  let _editSel = new Set();
  let _delUser = null;         // usuario cargado en "Borrar"

  async function callAdmin(action, params) {
    params = params || {};
    const client = await window.BarStockAuth.getAuthClient();
    const { data: sessionData } = await client.auth.getSession();
    const token = sessionData?.session?.access_token;
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(Object.assign({ action }, params))
    });
    return res.json();
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
    }[c]));
  }

  function msg(id, text, kind) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!text) { el.className = 'adm-msg'; el.textContent = ''; return; }
    el.className = 'adm-msg ' + (kind || 'info');
    el.textContent = text;
  }

  function root() { return document.getElementById('adminRoot'); }

  // ── Barra de pestanas ────────────────────────────────────────────────
  function tabBar() {
    return `<div class="adm-tabs">${TABS.map(t => `
      <button class="adm-tab${_tab === t.id ? ' active' : ''}" data-tab="${t.id}">
        <i class="ti ${t.icon}" aria-hidden="true"></i>${t.label}
      </button>`).join('')}</div>`;
  }

  // Cuadricula de ubicaciones reutilizada por crear y editar
  function locGrid(selected, handler) {
    if (!_locations.length) return '<div class="adm-empty">No locations yet.</div>';
    return `<div class="adm-loc-grid">${_locations.map(l => `
      <button class="adm-loc${selected.has(l.id) ? ' on' : ''}" data-loc="${esc(l.id)}" data-handler="${handler}">
        <i class="ti ${selected.has(l.id) ? 'ti-check' : 'ti-map-pin'}" aria-hidden="true"></i>
        <span>${esc(l.name)}</span>
      </button>`).join('')}</div>`;
  }

  function roleSelect(id, value) {
    return `<select id="${id}" class="adm-input">
      <option value="staff"${value === 'staff' ? ' selected' : ''}>Staff</option>
      <option value="manager"${value === 'manager' ? ' selected' : ''}>Manager</option>
    </select>`;
  }

  // ── Pestana 1: solicitudes ───────────────────────────────────────────
  async function viewRequests(el) {
    el.innerHTML = '<div class="adm-empty">Loading…</div>';
    const reqRes = await callAdmin('list');
    if (!reqRes.ok) { el.innerHTML = `<div class="adm-empty">${esc(reqRes.error || 'Error loading requests')}</div>`; return; }

    const requests = reqRes.requests || [];
    const rows = requests.length ? requests.map(r => `
      <div class="adm-req" data-id="${esc(r.id)}">
        <div class="adm-req-head">
          <strong>${esc(r.first_name)} ${esc(r.last_name)}${r.business_name ? ' — ' + esc(r.business_name) : ''}</strong>
          <span class="adm-dim">${new Date(r.created_at).toLocaleDateString()}</span>
        </div>
        <div class="adm-dim adm-req-meta">
          ${esc(r.email)}${r.phone ? ' · ' + esc(r.phone) : ''}
          ${r.address ? '<br>' + esc(r.address) : ''}
          ${r.message ? '<br><em>' + esc(r.message) + '</em>' : ''}
        </div>
        <div class="adm-req-actions">
          <select class="adm-input adm-req-loc">
            ${_locations.map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}
          </select>
          <select class="adm-input adm-req-role">
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
          </select>
          <button class="adm-btn ok adm-approve" data-id="${esc(r.id)}">Approve</button>
          <button class="adm-btn ghost adm-deny" data-id="${esc(r.id)}">Deny</button>
        </div>
      </div>`).join('')
      : '<div class="adm-empty"><i class="ti ti-circle-check"></i> No pending requests.</div>';

    el.innerHTML = `
      <div class="adm-block">
        <div class="adm-label">Pending sign ups</div>
        ${rows}
      </div>
      <div class="adm-block">
        <div class="adm-label">Create location</div>
        <div class="adm-row">
          <input id="admNewLoc" class="adm-input" type="text" placeholder="Location name">
          <button class="adm-btn" id="admCreateLoc">Create</button>
        </div>
        <div id="admLocMsg" class="adm-msg"></div>
      </div>`;

    el.querySelectorAll('.adm-approve').forEach(b => b.onclick = async () => {
      const row = b.closest('.adm-req');
      const locationId = row.querySelector('.adm-req-loc')?.value;
      const role = row.querySelector('.adm-req-role')?.value;
      if (!locationId) return;
      b.disabled = true; b.textContent = 'Approving…';
      const r = await callAdmin('approve', { requestId: b.dataset.id, locationId, role });
      if (r.ok) render(); else { b.disabled = false; b.textContent = 'Approve'; alert(r.error || 'Could not approve'); }
    });

    el.querySelectorAll('.adm-deny').forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = 'Denying…';
      const r = await callAdmin('deny', { requestId: b.dataset.id });
      if (r.ok) render(); else { b.disabled = false; b.textContent = 'Deny'; alert(r.error || 'Could not deny'); }
    });

    const cl = document.getElementById('admCreateLoc');
    if (cl) cl.onclick = async () => {
      const input = document.getElementById('admNewLoc');
      const name = input?.value?.trim();
      if (!name) { msg('admLocMsg', 'Enter a location name.', 'error'); return; }
      cl.disabled = true; cl.textContent = 'Creating…';
      const r = await callAdmin('createLocation', { name });
      cl.disabled = false; cl.textContent = 'Create';
      if (r.ok) { await loadLocations(); render(); }
      else msg('admLocMsg', r.error || 'Could not create location.', 'error');
    };
  }

  // ── Pestana 2: crear usuario ─────────────────────────────────────────
  function viewCreate(el) {
    el.innerHTML = `
      <div class="adm-block">
        <div class="adm-label">New user</div>
        <div class="adm-grid2">
          <input id="admFirst" class="adm-input" type="text" placeholder="First name">
          <input id="admLast"  class="adm-input" type="text" placeholder="Last name">
        </div>
        <input id="admEmail" class="adm-input" type="email" placeholder="Email" autocomplete="off">
        <input id="admPass"  class="adm-input" type="text" placeholder="Password (8+ characters)" autocomplete="off">
        <div class="adm-hint">The password is shown in clear text on purpose — you have to pass it to the person. Have them change it after the first sign in.</div>
      </div>

      <div class="adm-block">
        <div class="adm-label">Access</div>
        ${locGrid(_newSel, 'new')}
        <div class="adm-row" style="margin-top:10px">
          <span class="adm-dim">Role</span>
          ${roleSelect('admRole', 'staff')}
        </div>
      </div>

      <button class="adm-btn ok wide" id="admCreateUser">
        <i class="ti ti-user-plus" aria-hidden="true"></i> Create user &amp; assign access
      </button>
      <div id="admCreateMsg" class="adm-msg"></div>`;

    document.getElementById('admCreateUser').onclick = async () => {
      const btn = document.getElementById('admCreateUser');
      const email = document.getElementById('admEmail').value.trim();
      const password = document.getElementById('admPass').value;
      const firstName = document.getElementById('admFirst').value.trim();
      const lastName = document.getElementById('admLast').value.trim();
      const role = document.getElementById('admRole').value;

      if (!firstName) return msg('admCreateMsg', 'Enter a first name.', 'error');
      if (!email.includes('@')) return msg('admCreateMsg', 'Enter a valid email.', 'error');
      if (password.length < 8) return msg('admCreateMsg', 'Password must be at least 8 characters.', 'error');
      if (!_newSel.size) return msg('admCreateMsg', 'Select at least one location.', 'error');

      btn.disabled = true; msg('admCreateMsg', 'Creating…', 'info');
      const r = await callAdmin('createUser', {
        email, password, firstName, lastName,
        locationIds: Array.from(_newSel), role
      });
      btn.disabled = false;

      if (r.ok) {
        const names = _locations.filter(l => _newSel.has(l.id)).map(l => l.name).join(', ');
        _newSel.clear();
        render();
        msg('admCreateMsg', `User created: ${firstName} ${lastName} (${email}) — ${names}`, 'success');
      } else {
        msg('admCreateMsg', r.error || 'Could not create user.', 'error');
      }
    };
  }

  // ── Pestana 3: editar accesos ────────────────────────────────────────
  function viewAccess(el) {
    el.innerHTML = `
      <div class="adm-block">
        <div class="adm-label">Find user</div>
        <div class="adm-row">
          <input id="admFindEmail" class="adm-input" type="email" placeholder="Email" autocomplete="off">
          <button class="adm-btn" id="admFindBtn">Search</button>
        </div>
        <div id="admFindMsg" class="adm-msg"></div>
      </div>
      <div id="admEditBody"></div>`;

    const run = async () => {
      const email = document.getElementById('admFindEmail').value.trim();
      if (!email) return msg('admFindMsg', 'Enter an email.', 'error');
      msg('admFindMsg', 'Searching…', 'info');
      const r = await callAdmin('findUser', { email });
      if (!r.ok) return msg('admFindMsg', r.error || 'Search failed.', 'error');
      if (!r.user) { _editUser = null; document.getElementById('admEditBody').innerHTML = ''; return msg('admFindMsg', 'No user with that email.', 'error'); }
      msg('admFindMsg', '', '');
      _editUser = r.user;
      _editSel = new Set(r.user.access.map(a => a.locationId));
      drawEdit();
    };

    document.getElementById('admFindBtn').onclick = run;
    document.getElementById('admFindEmail').onkeydown = e => { if (e.key === 'Enter') run(); };
    if (_editUser) drawEdit();
  }

  function drawEdit() {
    const body = document.getElementById('admEditBody');
    if (!body || !_editUser) return;
    const currentRole = _editUser.access[0]?.role || 'staff';
    body.innerHTML = `
      <div class="adm-user">
        <div>
          <div class="adm-user-name">${esc(_editUser.name || '—')}</div>
          <div class="adm-dim">${esc(_editUser.email)}</div>
        </div>
        <div class="adm-dim adm-user-meta">
          ${_editUser.lastSignIn ? 'Last sign in ' + new Date(_editUser.lastSignIn).toLocaleDateString() : 'Never signed in'}
        </div>
      </div>
      <div class="adm-block">
        <div class="adm-label">Locations</div>
        ${locGrid(_editSel, 'edit')}
        <div class="adm-row" style="margin-top:10px">
          <span class="adm-dim">Role</span>
          ${roleSelect('admEditRole', currentRole)}
        </div>
      </div>
      <button class="adm-btn ok wide" id="admSaveAccess"><i class="ti ti-device-floppy" aria-hidden="true"></i> Save access</button>
      <div id="admSaveMsg" class="adm-msg"></div>`;

    document.getElementById('admSaveAccess').onclick = async () => {
      const btn = document.getElementById('admSaveAccess');
      btn.disabled = true; msg('admSaveMsg', 'Saving…', 'info');
      const r = await callAdmin('setAccess', {
        userId: _editUser.id,
        locationIds: Array.from(_editSel),
        role: document.getElementById('admEditRole').value
      });
      btn.disabled = false;
      if (r.ok) {
        msg('admSaveMsg', _editSel.size
          ? `Access updated — ${_editSel.size} location${_editSel.size === 1 ? '' : 's'}.`
          : 'All access removed. This user can sign in but will see nothing.', 'success');
      } else {
        msg('admSaveMsg', r.error || 'Could not save.', 'error');
      }
    };
  }

  // ── Pestana 4: borrar usuario ────────────────────────────────────────
  function viewDelete(el) {
    el.innerHTML = `
      <div class="adm-block">
        <div class="adm-label">Find user</div>
        <div class="adm-row">
          <input id="admDelEmail" class="adm-input" type="email" placeholder="Email" autocomplete="off">
          <button class="adm-btn" id="admDelFind">Search</button>
        </div>
        <div id="admDelMsg" class="adm-msg"></div>
      </div>
      <div id="admDelBody"></div>`;

    const run = async () => {
      const email = document.getElementById('admDelEmail').value.trim();
      if (!email) return msg('admDelMsg', 'Enter an email.', 'error');
      msg('admDelMsg', 'Searching…', 'info');
      const r = await callAdmin('findUser', { email });
      if (!r.ok) return msg('admDelMsg', r.error || 'Search failed.', 'error');
      if (!r.user) { _delUser = null; document.getElementById('admDelBody').innerHTML = ''; return msg('admDelMsg', 'No user with that email.', 'error'); }
      msg('admDelMsg', '', '');
      _delUser = r.user;
      drawDelete();
    };

    document.getElementById('admDelFind').onclick = run;
    document.getElementById('admDelEmail').onkeydown = e => { if (e.key === 'Enter') run(); };
    if (_delUser) drawDelete();
  }

  function drawDelete() {
    const body = document.getElementById('admDelBody');
    if (!body || !_delUser) return;
    const locs = _delUser.access.map(a => a.name).join(', ') || 'none';

    body.innerHTML = `
      <div class="adm-user">
        <div>
          <div class="adm-user-name">${esc(_delUser.name || '—')}</div>
          <div class="adm-dim">${esc(_delUser.email)}</div>
        </div>
      </div>
      <div class="adm-danger">
        <div class="adm-danger-head"><i class="ti ti-alert-triangle" aria-hidden="true"></i> This cannot be undone</div>
        <div class="adm-dim">Deletes the account and its access to ${esc(locs)}. Counts and orders already recorded stay — they belong to the location, not the person.</div>
        <div class="adm-row" style="margin-top:12px">
          <input id="admDelConfirm" class="adm-input" type="text" placeholder="Type ${esc(_delUser.email)} to confirm" autocomplete="off">
          <button class="adm-btn danger" id="admDelGo">Delete</button>
        </div>
        <div id="admDelResult" class="adm-msg"></div>
      </div>`;

    document.getElementById('admDelGo').onclick = async () => {
      const typed = document.getElementById('admDelConfirm').value.trim().toLowerCase();
      if (typed !== String(_delUser.email).toLowerCase()) {
        return msg('admDelResult', 'The email does not match. Type it exactly to confirm.', 'error');
      }
      const btn = document.getElementById('admDelGo');
      btn.disabled = true; msg('admDelResult', 'Deleting…', 'info');
      const gone = _delUser.email;
      const r = await callAdmin('deleteUser', { userId: _delUser.id, email: _delUser.email });
      if (r.ok) {
        _delUser = null;
        render();
        msg('admDelMsg', `User ${gone} deleted.`, 'success');
      } else {
        btn.disabled = false;
        msg('admDelResult', r.error || 'Could not delete.', 'error');
      }
    };
  }

  // ── Armado ───────────────────────────────────────────────────────────

  // ── Vaciar la locación activa ────────────────────────────────────────
  //
  // Sin selector de locaciones a propósito. Actúa sobre la que está
  // abierta y nada más: un desplegable aquí sería la forma más fácil de
  // vaciar la equivocada, y esto no tiene deshacer.
  //
  // Tres cierres antes de borrar: se ve qué hay dentro, se descarga una
  // copia, y hay que escribir el nombre exacto de la locación.
  let _wipeSurvey = null;
  let _wipeSaved = false;

  function activeLoc() {
    const name = (window.BARSTOCK_CONFIG || {}).LOCATION_NAME || '';
    return _locations.find(l => l.name === name) || null;
  }

  async function viewWipe(el) {
    const W = window.BarStockWipeLocation;
    const loc = activeLoc();

    if (!W) {
      el.innerHTML = `<div class="adm-empty">The wipe module is not loaded.</div>`;
      return;
    }
    if (!loc) {
      el.innerHTML = `<div class="adm-empty">
        Could not identify the open location. Switch location from the header and come back.
      </div>`;
      return;
    }

    el.innerHTML = `
      <div class="adm-block">
        <div class="adm-label">Open location</div>
        <div class="adm-user">
          <div>
            <div class="adm-user-name">${esc(loc.name)}</div>
            <div class="adm-dim">Only this one is touched. Every other location is left alone.</div>
          </div>
        </div>
      </div>

      <div class="adm-block">
        <div class="adm-row">
          <button class="adm-btn" id="admWipeScan">See what is inside</button>
        </div>
        <div id="admWipeMsg" class="adm-msg"></div>
        <div id="admWipeList"></div>
      </div>

      <div id="admWipeBody"></div>`;

    document.getElementById('admWipeScan').onclick = async () => {
      msg('admWipeMsg', 'Reading…', 'info');
      _wipeSurvey = await W.survey(loc.id);
      msg('admWipeMsg', '', '');
      drawWipe(loc);
    };

    if (_wipeSurvey) drawWipe(loc);
  }

  function drawWipe(loc) {
    const list = document.getElementById('admWipeList');
    const body = document.getElementById('admWipeBody');
    if (!list || !body || !_wipeSurvey) return;

    const withRows = _wipeSurvey.filter(r => r.n === null || r.n > 0);
    const total = _wipeSurvey.reduce((s, r) => s + (r.n || 0), 0);

    list.innerHTML = `
      <div class="adm-wipe-grid">
        ${withRows.map(r => `
          <div class="adm-wipe-row">
            <span class="adm-wipe-t">${esc(r.table)}</span>
            <span class="adm-wipe-n">${r.n === null ? esc(r.note || '—') : r.n.toLocaleString()}</span>
          </div>`).join('') || '<div class="adm-dim">Nothing stored for this location.</div>'}
      </div>`;

    body.innerHTML = `
      <div class="adm-danger">
        <div class="adm-danger-head">
          <i class="ti ti-alert-triangle" aria-hidden="true"></i> This cannot be undone
        </div>
        <div class="adm-dim">
          Erases the master, counts, orders, sales, reports, backups and corrections
          of <b>${esc(loc.name)}</b> — about ${total.toLocaleString()} records. The location
          itself stays, so user access is not lost. Download the copy first: if you skip
          it there is no way back.
        </div>

        <div class="adm-row" style="margin-top:12px">
          <button class="adm-btn" id="admWipeSave">
            <i class="ti ti-download" aria-hidden="true"></i> Download a copy
          </button>
          <span id="admWipeSavedTag" class="adm-dim">${_wipeSaved ? 'Copy downloaded' : 'Not downloaded yet'}</span>
        </div>

        <div class="adm-row" style="margin-top:12px">
          <input id="admWipeConfirm" class="adm-input" type="text"
                 placeholder="Type ${esc(loc.name)} to confirm" autocomplete="off">
          <button class="adm-btn danger" id="admWipeGo" ${_wipeSaved ? '' : 'disabled'}>Erase everything</button>
        </div>
        <div id="admWipeGoMsg" class="adm-msg"></div>
      </div>`;

    const W = window.BarStockWipeLocation;

    document.getElementById('admWipeSave').onclick = async (ev) => {
      const btn = ev.currentTarget;
      btn.disabled = true; btn.textContent = 'Preparing…';
      try {
        const n = await W.download(loc);
        _wipeSaved = true;
        msg('admWipeGoMsg', `Copy downloaded — ${n.toLocaleString()} records.`, 'info');
        drawWipe(loc);
      } catch (e) {
        msg('admWipeGoMsg', 'Could not build the copy: ' + (e.message || e), 'error');
        btn.disabled = false; btn.textContent = 'Download a copy';
      }
    };

    document.getElementById('admWipeGo').onclick = async (ev) => {
      const typed = document.getElementById('admWipeConfirm').value.trim();
      if (typed !== loc.name) {
        return msg('admWipeGoMsg', 'The name does not match. Type it exactly as shown.', 'error');
      }
      if (!_wipeSaved) {
        return msg('admWipeGoMsg', 'Download the copy first.', 'error');
      }
      const btn = ev.currentTarget;
      btn.disabled = true;

      const done = await W.wipe(loc, (t) => msg('admWipeGoMsg', 'Erasing ' + t + '…', 'info'));
      W.wipeLocal();

      const failed = done.filter(d => !d.ok);
      if (failed.length) {
        msg('admWipeGoMsg',
          `Done with ${failed.length} table(s) refused: ${failed.map(f => f.table).join(', ')}. ` +
          `They may not exist yet, or their rules do not allow deleting.`, 'error');
      } else {
        msg('admWipeGoMsg', `${esc(loc.name)} is empty. Reload the page.`, 'info');
      }
      _wipeSurvey = await W.survey(loc.id);
      _wipeSaved = false;
      drawWipe(loc);
    };
  }

  async function loadLocations() {
    const r = await callAdmin('listLocations');
    _locations = r.ok ? (r.locations || []) : [];
  }

  async function render() {
    const el = root();
    if (!el) return;
    if (!_locations.length) await loadLocations();

    el.innerHTML = tabBar() + '<div id="admBody"></div>';

    el.querySelectorAll('.adm-tab').forEach(b => b.onclick = () => {
      _tab = b.dataset.tab;
      render();
    });

    const body = document.getElementById('admBody');
    if (_tab === 'requests')    await viewRequests(body);
    else if (_tab === 'create')  viewCreate(body);
    else if (_tab === 'access')  viewAccess(body);
    else if (_tab === 'delete')  viewDelete(body);
    else                    await viewWipe(body);

    // Las ubicaciones se marcan con delegacion: el contenido se redibuja
    // completo en cada cambio y los manejadores directos se perderian.
    el.querySelectorAll('.adm-loc').forEach(b => b.onclick = () => {
      const id = b.dataset.loc;
      const set = b.dataset.handler === 'new' ? _newSel : _editSel;
      if (set.has(id)) set.delete(id); else set.add(id);
      b.classList.toggle('on', set.has(id));
      const ic = b.querySelector('i');
      if (ic) ic.className = 'ti ' + (set.has(id) ? 'ti-check' : 'ti-map-pin');
    });
  }

  window.BarStockAdmin = { render };
})();
