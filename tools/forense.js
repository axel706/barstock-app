/* ── ¿Qué desapareció del catálogo, y cuándo? ───────────────────────
 *
 * SÓLO LECTURA. Lee respaldos y el inventario actual. No restaura, no
 * escribe, no borra.
 *
 *   1. Abre app.barstockpro.com en la locación.
 *   2. Consola del navegador.
 *   3. Pega este archivo entero y Enter.
 *
 *   await bsLinea()        → la línea de tiempo: cuántos productos
 *                            había en cada respaldo y qué los provocó
 *   await bsQueFalta()     → qué hay en el último respaldo que ya no
 *                            está en el catálogo
 *   await bsQueFalta(id)   → lo mismo contra un respaldo concreto
 *   await bsCuando('baileys')
 *                          → en qué respaldo aparece por última vez
 *
 * Se conservan los 10 respaldos más recientes por locación, y se toma
 * uno antes de cada operación destructiva.
 */
(() => {
  const c = window.BARSTOCK_CONFIG || {};
  const norm = (s) => typeof window.normalizeName === 'function'
    ? window.normalizeName(s || '') : String(s || '').trim().toLowerCase();

  async function api(action, params) {
    const client = await window.BarStockAuth.getAuthClient();
    const { data } = await client.auth.getSession();
    const r = await fetch('/api/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
                 'Authorization': 'Bearer ' + (data?.session?.access_token || '') },
      body: JSON.stringify(Object.assign({ action, locationName: c.LOCATION_NAME }, params || {}))
    });
    return r.json();
  }

  async function ahora() {
    const locId = await window.BarStockParIntelligence.fetchLocationId();
    const r = await fetch(
      `${c.SUPABASE_URL}/rest/v1/inventory_items?location_id=eq.${locId}` +
      `&select=code,item_name&limit=2000`,
      { headers: { apikey: c.SUPABASE_KEY, Authorization: 'Bearer ' + c.SUPABASE_KEY } });
    return r.json();
  }

  const fecha = (iso) => new Date(iso).toLocaleString('en-US',
    { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  // ── La línea de tiempo ───────────────────────────────────────────
  window.bsLinea = async function () {
    const r = await api('list');
    if (!r.ok) { console.error(r.error); return; }
    const bs = (r.backups || []).slice().reverse();   // del más viejo al más nuevo
    const items = await ahora();

    console.log('%cRespaldos de ' + c.LOCATION_NAME + ' (del más viejo al más nuevo)',
      'font-weight:bold');
    let prev = null;
    const tabla = bs.map(b => {
      const d = prev === null ? '' : (b.item_count - prev > 0 ? '+' : '') + (b.item_count - prev);
      prev = b.item_count;
      return { cuando: fecha(b.created_at), motivo: b.reason,
               productos: b.item_count, cambio: d, id: b.id };
    });
    tabla.push({ cuando: 'AHORA', motivo: '—', productos: items.length,
                 cambio: prev === null ? '' : (items.length - prev > 0 ? '+' : '') + (items.length - prev),
                 id: '' });
    console.table(tabla);
    console.log('La fila donde el cambio es un número negativo grande es ' +
      'donde se perdieron productos. El motivo dice qué operación fue.');
    return tabla;
  };

  // ── Qué falta respecto a un respaldo ─────────────────────────────
  window.bsQueFalta = async function (backupId) {
    const l = await api('list');
    if (!l.ok) { console.error(l.error); return; }
    const bs = l.backups || [];
    if (!bs.length) { console.log('No hay respaldos.'); return; }
    const id = backupId || bs[0].id;

    const r = await api('get', { backupId: id });
    if (!r.ok) { console.error(r.error); return; }
    const b = r.backup;
    const items = await ahora();
    const hoy = new Set(items.map(x => norm(x.item_name)));

    const faltan = (b.payload || []).filter(x => !hoy.has(norm(x.item_name)));

    console.log('%cRespaldo de ' + fecha(b.created_at) + ' · ' + b.reason +
      ' · ' + b.item_count + ' productos', 'font-weight:bold');
    console.log('Hoy hay ' + items.length + '.');

    if (!faltan.length) {
      console.log('%c✓ No falta ninguno de los de ese respaldo.', 'color:#4ade80');
      return [];
    }
    console.log('%c✗ ' + faltan.length + ' que estaban y ya no:', 'color:#f87171;font-weight:bold');
    console.table(faltan.map(x => ({
      nombre: x.item_name, codigo: x.code || '—', proveedor: x.vendor || '—',
      on_hand: x.on_hand, par: x.suggested, precio: x.value
    })));
    console.log('Para recuperarlos: Admin → restaurar ese respaldo (reemplaza ' +
      'el inventario entero, así que primero mira qué más cambiaría), o ' +
      'volver a darlos de alta a mano.');
    return faltan;
  };

  // ── Cuándo se vio por última vez ─────────────────────────────────
  window.bsCuando = async function (texto) {
    const l = await api('list');
    if (!l.ok) { console.error(l.error); return; }
    const bs = (l.backups || []).slice().reverse();
    const t = norm(texto);

    const filas = [];
    for (const meta of bs) {
      const r = await api('get', { backupId: meta.id });
      if (!r.ok) continue;
      const hit = (r.backup.payload || []).find(x => norm(x.item_name).includes(t));
      filas.push({ cuando: fecha(meta.created_at), motivo: meta.reason,
                   total: meta.item_count,
                   estaba: hit ? '✓ ' + hit.item_name : '—' });
    }
    const items = await ahora();
    const hoy = items.find(x => norm(x.item_name).includes(t));
    filas.push({ cuando: 'AHORA', motivo: '—', total: items.length,
                 estaba: hoy ? '✓ ' + hoy.item_name : '—' });

    console.table(filas);
    console.log('La primera fila con "—" después de una con "✓" es el momento ' +
      'en que desapareció, y su motivo dice qué operación lo hizo.');
    return filas;
  };

  console.log('%cListo:\n' +
    '  await bsLinea()              la línea de tiempo\n' +
    '  await bsCuando(\'baileys\')    cuándo desapareció\n' +
    '  await bsQueFalta()           qué falta respecto al último respaldo',
    'font-weight:bold;color:#4ade80');
})();
