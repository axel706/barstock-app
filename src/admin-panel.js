(() => {
  async function getClient(){
    return window.BarStockAuth.getAuthClient();
  }

  async function callAdmin(action, params){
    params = params || {};
    const client = await getClient();
    const { data: sessionData } = await client.auth.getSession();
    const token = sessionData?.session?.access_token;
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(Object.assign({ action }, params))
    });
    return res.json();
  }

  function escapeHtml(s){
    return String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }

  async function render(){
    const root = document.getElementById('adminRoot');
    if (!root) return;
    root.innerHTML = '<div class="small muted">Loading...</div>';

    const [reqRes, locRes] = await Promise.all([
      callAdmin('list'),
      callAdmin('listLocations')
    ]);

    if (!reqRes.ok) {
      root.innerHTML = '<div class="small muted">' + escapeHtml(reqRes.error || 'Error loading requests') + '</div>';
      return;
    }

    const locations = locRes.ok ? (locRes.locations || []) : [];
    const requests = reqRes.requests || [];

    const requestsHtml = requests.length ? requests.map(r => `
        <div class="admin-request-row" data-id="${r.id}" style="padding:14px 0;border-bottom:1px solid #e2e8f0">
          <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:6px;margin-bottom:6px">
            <div style="font-weight:600">${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)} — ${escapeHtml(r.business_name)}</div>
            <div class="small muted">${new Date(r.created_at).toLocaleString()}</div>
          </div>
          <div class="small muted" style="margin-bottom:10px;line-height:1.6">
            ${escapeHtml(r.email)}${r.phone ? ' · ' + escapeHtml(r.phone) : ''}${r.address ? '<br>' + escapeHtml(r.address) : ''}
            ${r.message ? '<br><em>' + escapeHtml(r.message) + '</em>' : ''}
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <select class="admin-location-select" style="min-width:160px">
              ${locations.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('')}
            </select>
            <select class="admin-role-select">
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
            </select>
            <button class="admin-approve-btn" data-id="${r.id}">Approve</button>
            <button class="admin-deny-btn" data-id="${r.id}">Deny</button>
          </div>
        </div>
      `).join('') : '<div class="small muted">No pending requests.</div>';

    root.innerHTML = `
      <div style="margin-bottom:20px">
        <div style="font-weight:600;margin-bottom:8px">Pending sign ups</div>
        ${requestsHtml}
      </div>
      <div>
        <div style="font-weight:600;margin-bottom:8px">Create location</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input id="adminNewLocationName" type="text" placeholder="Location name" style="flex:1 1 220px">
          <button id="adminCreateLocationBtn">Create</button>
        </div>
        <div id="adminLocationMsg" class="small muted" style="margin-top:6px"></div>
      </div>
    `;

    root.querySelectorAll('.admin-approve-btn').forEach(btn => {
      btn.onclick = async () => {
        const row = btn.closest('.admin-request-row');
        const locationId = row.querySelector('.admin-location-select')?.value;
        const role = row.querySelector('.admin-role-select')?.value;
        if (!locationId) return;
        btn.disabled = true;
        btn.textContent = 'Approving...';
        const result = await callAdmin('approve', { requestId: btn.dataset.id, locationId, role });
        if (result.ok) {
          render();
        } else {
          btn.disabled = false;
          btn.textContent = 'Approve';
          alert(result.error || 'Could not approve');
        }
      };
    });

    root.querySelectorAll('.admin-deny-btn').forEach(btn => {
      btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = 'Denying...';
        const result = await callAdmin('deny', { requestId: btn.dataset.id });
        if (result.ok) {
          render();
        } else {
          btn.disabled = false;
          btn.textContent = 'Deny';
          alert(result.error || 'Could not deny');
        }
      };
    });

    const createBtn = document.getElementById('adminCreateLocationBtn');
    if (createBtn) {
      createBtn.onclick = async () => {
        const input = document.getElementById('adminNewLocationName');
        const msg = document.getElementById('adminLocationMsg');
        const name = input?.value?.trim();
        if (!name) { if (msg) msg.textContent = 'Enter a location name.'; return; }
        createBtn.disabled = true;
        createBtn.textContent = 'Creating...';
        const result = await callAdmin('createLocation', { name });
        createBtn.disabled = false;
        createBtn.textContent = 'Create';
        if (result.ok) {
          if (input) input.value = '';
          if (msg) msg.textContent = 'Location created.';
          render();
        } else {
          if (msg) msg.textContent = result.error || 'Could not create location.';
        }
      };
    }
  }

  window.BarStockAdmin = { render };
})();
