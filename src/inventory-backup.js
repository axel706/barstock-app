(() => {
  if (window.BarStockBackup) return;

  // ── Red de protección del inventario ─────────────────────────────────
  //
  // Antes de cada acción que borra —Load master y el paso 1 del ciclo— se
  // copia el inventario de la locación a la nube. El usuario no se entera
  // y no tiene que acordarse de nada: la única forma de que un respaldo
  // sirva es que ocurra sin pedirlo.
  //
  // Si el respaldo falla, la acción SIGUE. Un error de red no puede
  // dejarte sin poder trabajar un lunes por la mañana; se avisa en la
  // consola y ya. Esa decisión es deliberada: la red de protección no
  // debe convertirse en un punto de falla nuevo.

  async function call(action, params) {
    const client = await window.BarStockAuth.getAuthClient();
    const { data } = await client.auth.getSession();
    const token = data?.session?.access_token;
    const res = await fetch('/api/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(Object.assign({ action }, params || {}))
    });
    return res.json();
  }

  function locationName() {
    return (window.BARSTOCK_CONFIG && window.BARSTOCK_CONFIG.LOCATION_NAME) || '';
  }

  async function snapshot(reason) {
    try {
      const r = await call('create', { locationName: locationName(), reason });
      if (r && r.ok && r.itemCount) console.info(`[backup] ${r.itemCount} artículos respaldados (${reason})`);
      return r;
    } catch (e) {
      console.warn('[backup] no se pudo respaldar, la accion continua', e);
      return { ok: false };
    }
  }

  async function list() {
    try { return await call('list', { locationName: locationName() }); }
    catch (e) { return { ok: false, error: String(e) }; }
  }

  async function restore(backupId) {
    return await call('restore', { backupId });
  }

  function fmt(iso) {
    try {
      return new Date(iso).toLocaleString(undefined,
        { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch (e) { return iso; }
  }

  const REASONS = {
    'load-master': 'antes de cargar un maestro',
    'reset-on-hand': 'antes de resetear el on hand',
    'before-restore': 'antes de una restauración',
    'manual': 'manual'
  };

  // ── Diálogo de restauración ────────────────────────────────────────
  async function openRestore() {
    const r = await list();
    if (!r.ok) { alert(r.error || 'No se pudo leer la lista de respaldos.'); return; }
    if (!r.backups.length) { alert('Todavía no hay respaldos para esta locación.'); return; }

    const lines = r.backups.map((b, i) =>
      `${i + 1}. ${fmt(b.created_at)} · ${b.item_count} artículos · ${REASONS[b.reason] || b.reason}`
    ).join('\n');

    const pick = prompt(
      `Respaldos de ${locationName()}\n\n${lines}\n\n` +
      `Escribe el número del respaldo a restaurar.\n` +
      `Reemplaza el inventario completo de esta locación.`, ''
    );
    if (pick === null) return;

    const idx = parseInt(pick, 10) - 1;
    const chosen = r.backups[idx];
    if (!chosen) { alert('Número fuera de la lista.'); return; }

    const ok = confirm(
      `Vas a reemplazar el inventario de ${locationName()} con el respaldo del ` +
      `${fmt(chosen.created_at)} (${chosen.item_count} artículos).\n\n` +
      `Lo que hay ahora se guarda como respaldo antes de tocarlo.`
    );
    if (!ok) return;

    if (typeof setStatus === 'function') setStatus('Restaurando inventario…');
    const out = await restore(chosen.id);
    if (out && out.ok) {
      if (typeof setStatus === 'function') setStatus(`Inventario restaurado: ${out.restored} artículos.`);
      if (typeof loadInventoryFromSupabase === 'function') await loadInventoryFromSupabase();
      if (typeof render === 'function') render();
      alert(`Restaurado. ${out.restored} artículos.`);
    } else {
      alert((out && out.error) || 'No se pudo restaurar.');
    }
  }

  window.BarStockBackup = { snapshot, list, restore, openRestore };
})();
