(() => {
  if (window.BarStockWipeLocation) return;

  // ── Vaciar una locación por completo ─────────────────────────────────
  //
  // Borra TODO lo que cuelga de una locación: maestro, conteos, órdenes,
  // ventas, informes, respaldos, alias y correcciones. Deja la locación
  // existiendo pero vacía, como recién creada.
  //
  // ── Por qué la fila de `locations` no se borra ──────────────────────
  //
  // Los permisos de los usuarios apuntan a ese id. Borrar la fila dejaría
  // a la gente con accesos a una locación fantasma y habría que volver a
  // darlos uno por uno. Vaciar y borrar no son lo mismo, y aquí lo que se
  // quiere es vaciar.
  //
  // ── El orden importa ────────────────────────────────────────────────
  //
  // Las líneas de una orden apuntan a la orden. Si se borra la orden
  // primero, sus líneas se quedan colgando de un padre que ya no existe
  // —o la base rechaza el borrado, según cómo esté declarada la relación.
  // Por eso lo que depende de otra cosa va SIEMPRE antes que aquello de
  // lo que depende.
  //
  // ── Se descarga antes de borrar ─────────────────────────────────────
  //
  // Y si la descarga falla, no se borra nada. Un vaciado sin copia es
  // irreversible, y esto va a usarse justo cuando alguien tiene prisa.

  const cfg = () => window.BARSTOCK_CONFIG || {};

  // El orden es el de borrado. Las hijas arriba, las padres abajo.
  const TABLES = [
    // Depende de vendor_orders: primero
    { t: 'vendor_order_items',      via: 'order' },

    { t: 'vendor_orders',           col: 'location_id' },
    { t: 'inventory_snapshots',     col: 'location_id' },
    { t: 'inventory_items',         col: 'location_id' },
    { t: 'inventory_no_matches',    col: 'location_id' },
    { t: 'inventory_aliases',       col: 'location_id' },
    { t: 'inventory_backups',       col: 'location_id' },
    { t: 'theoretical_sales',       col: 'location_id' },
    { t: 'theoretical_comments',    col: 'location_id' },
    { t: 'theoretical_notes',       col: 'location_id' },
    { t: 'theoretical_exclusions',  col: 'location_id' },
    { t: 'consumption_notes',       col: 'location_id' },
    { t: 'sales_aliases',           col: 'location_id' },
    { t: 'sales_overrides',         col: 'location_id' },
    { t: 'count_corrections',       col: 'location_id' },
    { t: 'cost_reports',            col: 'location_id' },
    { t: 'vendor_code_mappings',    col: 'location_id' },
    { t: 'vendor_defaults',         col: 'location_id' },
    { t: 'location_settings',       col: 'location_id' },
    { t: 'item_barcodes',           col: 'location_id' }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  function headers() {
    const { SUPABASE_KEY: k } = cfg();
    return { apikey: k, Authorization: `Bearer ${k}` };
  }

  // Algunas tablas pueden no existir todavía —las migraciones nuevas se
  // corren a mano— así que un 404 aquí no es un fallo: es una tabla que
  // no está. Se anota y se sigue.
  async function count(table, col, id) {
    const { SUPABASE_URL: url } = cfg();
    try {
      const res = await fetch(`${url}/rest/v1/${table}?${col}=eq.${id}&select=*`, {
        headers: Object.assign({ Prefer: 'count=exact', Range: '0-0' }, headers())
      });
      if (!res.ok) return null;
      const cr = res.headers.get('content-range');   // "0-0/123"
      return cr ? Number(cr.split('/')[1]) : null;
    } catch (e) { return null; }
  }

  async function rows(table, col, id) {
    const { SUPABASE_URL: url } = cfg();
    try {
      const res = await fetch(`${url}/rest/v1/${table}?${col}=eq.${id}&select=*`, { headers: headers() });
      return res.ok ? (await res.json()) : null;
    } catch (e) { return null; }
  }

  // Las líneas de orden no llevan location_id: cuelgan de la orden.
  async function orderIds(locId) {
    const { SUPABASE_URL: url } = cfg();
    const res = await fetch(`${url}/rest/v1/vendor_orders?location_id=eq.${locId}&select=id`, { headers: headers() });
    if (!res.ok) return [];
    return (await res.json() || []).map(r => r.id);
  }

  // ── Qué hay dentro ───────────────────────────────────────────────────
  async function survey(locId) {
    const out = [];
    const ids = await orderIds(locId);
    for (const spec of TABLES) {
      if (spec.via === 'order') {
        out.push({ table: spec.t, n: ids.length ? null : 0, note: ids.length ? `de ${ids.length} órdenes` : '' });
        continue;
      }
      const n = await count(spec.t, spec.col, locId);
      out.push({ table: spec.t, n, note: n === null ? 'no existe o sin acceso' : '' });
    }
    return out;
  }

  // ── La copia ─────────────────────────────────────────────────────────
  async function download(loc) {
    const dump = { location: loc, exported_at: new Date().toISOString(), tables: {} };
    const ids = await orderIds(loc.id);

    for (const spec of TABLES) {
      if (spec.via === 'order') {
        if (!ids.length) { dump.tables[spec.t] = []; continue; }
        const { SUPABASE_URL: url } = cfg();
        const res = await fetch(
          `${url}/rest/v1/${spec.t}?order_id=in.(${ids.join(',')})&select=*`, { headers: headers() });
        dump.tables[spec.t] = res.ok ? await res.json() : [];
        continue;
      }
      const r = await rows(spec.t, spec.col, loc.id);
      if (r !== null) dump.tables[spec.t] = r;
    }

    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `barstock_${String(loc.name).replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);

    const total = Object.values(dump.tables).reduce((s, v) => s + (v?.length || 0), 0);
    return total;
  }

  // ── El borrado ───────────────────────────────────────────────────────
  async function wipe(loc, onStep) {
    const { SUPABASE_URL: url } = cfg();
    const ids = await orderIds(loc.id);
    const done = [];

    for (const spec of TABLES) {
      onStep && onStep(spec.t);
      let target;
      if (spec.via === 'order') {
        if (!ids.length) { done.push({ table: spec.t, ok: true, skipped: true }); continue; }
        target = `${url}/rest/v1/${spec.t}?order_id=in.(${ids.join(',')})`;
      } else {
        target = `${url}/rest/v1/${spec.t}?${spec.col}=eq.${loc.id}`;
      }
      try {
        const res = await fetch(target, { method: 'DELETE', headers: headers() });
        done.push({ table: spec.t, ok: res.ok, status: res.status });
      } catch (e) {
        done.push({ table: spec.t, ok: false, status: 'error' });
      }
    }
    return done;
  }

  // ── El estado local ──────────────────────────────────────────────────
  //
  // El navegador guarda su propia copia del maestro. Sin limpiarla, la
  // app volvería a subir a la nube lo que se acaba de borrar en cuanto
  // algo dispare un guardado.
  function wipeLocal() {
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('crown_inventory') || k.startsWith('bs.cm') || k.startsWith('bs.count'))
        .forEach(k => localStorage.removeItem(k));
      Object.keys(sessionStorage)
        .filter(k => k.startsWith('vsp_placed_'))
        .forEach(k => sessionStorage.removeItem(k));
    } catch (e) { /* modo privado: no pasa nada */ }
  }

  window.BarStockWipeLocation = { TABLES, survey, download, wipe, wipeLocal, esc };
})();
