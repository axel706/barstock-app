(() => {
  if (window.BarStockItemEdit) return;
  // ── Renombrar, cambiar el código y borrar un artículo ────────────────
  //
  // Axel, 2026-11-13: "no puedo creer que a estas alturas no tengamos la
  // opción de editar un artículo". Nombre, código y borrar, en la hoja
  // del teléfono (mobile-inventory.js, opción A).
  //
  // Renombrar NO es cambiar un campo: el nombre une el producto con una
  // veintena de tablas (Toast, recetas, códigos de barras, zonas,
  // historial…). Lo hace la función rename_inventory_item de la base
  // (migración 038), en una sola transacción: o todo o nada. Aquí sólo se
  // le pasa lo que necesita, con el nombre normalizado por la MISMA
  // normalizeName de la app, para que la regla no viva en dos sitios.
  //
  // Borrar toma antes un respaldo de Time Machine y, si no se puede
  // tomar, no borra. El Delete del escritorio borraba sin rastro (está en
  // los pendientes de CLAUDE.md); éste no.

  const cfg = () => window.BARSTOCK_CONFIG || {};
  const H = () => ({ 'Content-Type': 'application/json', apikey: cfg().SUPABASE_KEY, Authorization: 'Bearer ' + cfg().SUPABASE_KEY });
  const norm = (s) => typeof window.normalizeName === 'function'
    ? window.normalizeName(s) : String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const limpio = (s) => String(s == null ? '' : s).trim().replace(/\s+/g, ' ');

  // Lo que dijo Supabase, tal cual. La función de la base devuelve sus
  // propios mensajes ("There is already an item called…") en `message`.
  async function error(r) {
    const t = await r.text();
    let m = t;
    try { const j = JSON.parse(t); m = j.message || j.error || t; } catch (e) { /* texto */ }
    if (/PGRST202|could not find the function/i.test(t)) {
      return new Error('The rename function is not in the database yet: run migration 038. (' + String(m).slice(0, 160) + ')');
    }
    return new Error(String(m).slice(0, 240));
  }

  // Cambia nombre y/o código. Devuelve lo que contestó la base (cuántas
  // filas de cada tabla), o null si no había nada que cambiar.
  async function renombrar(row, cambios) {
    if (!row) throw new Error('That item is no longer here.');
    const viejo = String(row.item || '');
    const nuevo = limpio(cambios && cambios.nombre != null ? cambios.nombre : viejo);
    const codigoViejo = String(row.code || '').trim();
    const codigoNuevo = cambios && cambios.codigo != null ? String(cambios.codigo).trim() : codigoViejo;
    if (!nuevo) throw new Error('The name can’t be empty.');
    if (nuevo === viejo && codigoNuevo === codigoViejo) return null;
    const loc = await window.BarStockInventoryCloud.fetchLocationId();
    const r = await fetch(cfg().SUPABASE_URL + '/rest/v1/rpc/rename_inventory_item', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ p_location: String(loc), p_old: viejo, p_new: nuevo,
        p_old_norm: norm(viejo), p_new_norm: norm(nuevo),
        p_new_code: codigoNuevo === codigoViejo ? null : codigoNuevo })
    });
    if (!r.ok) throw await error(r);
    let res = null;
    try { res = await r.json(); } catch (e) { res = {}; }

    // La copia de este teléfono, como hace el modal del escritorio: el
    // artículo y los alias que apuntaban a él.
    const vn = norm(viejo), nn = norm(nuevo);
    Object.assign(row, { item: nuevo, itemNorm: nn, code: codigoNuevo });
    if (typeof window.bsRenombrarAliases === 'function') try { window.bsRenombrarAliases(vn, nn); } catch (e) {}
    if (typeof window.saveState === 'function') try { window.saveState(); } catch (e) {}
    return res || {};
  }

  // Borrar: primero el respaldo; sin respaldo, nada.
  async function borrar(row) {
    if (!row) throw new Error('That item is no longer here.');
    const B = window.BarStockBackup;
    const s = B && B.snapshot ? await B.snapshot('Before deleting ' + row.item) : null;
    if (!s || !s.ok) throw new Error('Could not take a backup first, so nothing was deleted.' + (s && s.error ? ' (' + s.error + ')' : ''));
    await window.BarStockInventoryCloud.deleteInventoryItem({ code: String(row.code || '').trim(), item: String(row.item || '').trim() });
    const M = (window.state && window.state.master) || [];
    const i = M.indexOf(row);
    if (i >= 0) M.splice(i, 1);
    if (typeof window.saveState === 'function') try { window.saveState(); } catch (e) {}
    return true;
  }

  window.BarStockItemEdit = { renombrar, borrar };
})();
