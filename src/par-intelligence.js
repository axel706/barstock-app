(() => {
  if (window.BarStockParIntelligence) return;

  function getConfig() {
    const config = window.BARSTOCK_CONFIG || {};
    return {
      url: config.SUPABASE_URL,
      key: config.SUPABASE_KEY,
      locationName: config.LOCATION_NAME || 'The Crown Tavern'
    };
  }

  async function fetchLocationId() {
    const { url, key, locationName } = getConfig();
    const res = await fetch(
      `${url}/rest/v1/locations?name=eq.${encodeURIComponent(locationName)}&select=id`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    const data = await res.json();
    if (!data?.length) throw new Error('Location not found: ' + locationName);
    return data[0].id;
  }

  function getWeekStart(date) {
    const now = date ? new Date(date) : new Date();
    const day = now.getDay();
    // Sunday (0) → next Monday (+1), all other days → previous Monday
    const diff = day === 0 ? 1 : (1 - day);
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return monday.toISOString().split('T')[0];
  }

  // ─── fetchAllSnapshotRows ────────────────────────────────────────
  // Supabase corta cualquier respuesta REST en un maximo de filas (1000).
  // inventory_snapshots crece con productos x semanas, asi que en locaciones
  // con historial la respuesta llegaba truncada y muchos productos parecian
  // tener solo 1-3 semanas de datos cuando en realidad tenian 6 u 8.
  // Aqui se pagina explicitamente hasta que la nube deje de devolver filas,
  // ordenando por id para que la paginacion sea estable.
  async function fetchAllSnapshotRows(baseUrl) {
    const { key } = getConfig();
    const PAGE_SIZE = 1000;
    const MAX_PAGES = 100; // tope de seguridad
    const out = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      const offset = page * PAGE_SIZE;
      const sep = baseUrl.includes('?') ? '&' : '?';
      const res = await fetch(
        `${baseUrl}${sep}order=id.asc&limit=${PAGE_SIZE}&offset=${offset}`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      const rows = await res.json();
      if (!Array.isArray(rows)) break;

      out.push(...rows);
      if (rows.length < PAGE_SIZE) break; // pagina incompleta = ya no hay mas
    }

    return out;
  }

  // Allow overriding the week start date from outside
  let _weekStartOverride = null;
  function getEffectiveWeekStart() {
    return _weekStartOverride || getWeekStart();
  }
  function setWeekStartOverride(dateStr) {
    _weekStartOverride = dateStr || null;
  }

  // ─── saveSnapshot ────────────────────────────────────────────────
  // Called at END of applyPendingImport — opens a new cycle snapshot
  // If a snapshot already exists for this week+item, updates it (no duplicates)
  async function saveSnapshot(master) {
    try {
      const { url, key } = getConfig();
      const locationId = await fetchLocationId();
      const weekStart = getEffectiveWeekStart();

      // Fetch existing snapshots for this week
      const existingRes = await fetch(
        `${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&week_start=eq.${weekStart}&select=id,item_name,code`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      const existing = await existingRes.json();
      const existingMap = new Map();
      for (const r of existing || []) {
        existingMap.set(`${r.item_name}||${r.code || ''}`, r.id);
      }

      // Build upsert payload for all items — all rows must have identical keys for PostgREST
      const upsertRows = (master || []).map(r => ({
        location_id: locationId,
        week_start: weekStart,
        item_name: r.item || '',
        code: r.code || '',
        vendor: r.vendor || '',
        on_hand_start: Number(r.onHand || 0),
        suggested_at_time: Number(r.suggested || 0),
        ordered: null,
        on_hand_end: null,
        used: null,
        is_event_week: false
      }));

      // Deduplicate by item_name before upsert
      const seenNames = new Set();
      const dedupedRows = upsertRows.filter(r => {
        if (seenNames.has(r.item_name)) return false;
        seenNames.add(r.item_name);
        return true;
      });

      // Upsert in chunks — constraint on (location_id, week_start, item_name) prevents duplicates
      const chunkSize = 200;
      for (let i = 0; i < dedupedRows.length; i += chunkSize) {
        const chunk = dedupedRows.slice(i, i + chunkSize);
        const res = await fetch(`${url}/rest/v1/inventory_snapshots?on_conflict=location_id,week_start,item_name`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: key,
            Authorization: `Bearer ${key}`,
            Prefer: 'resolution=merge-duplicates'
          },
          body: JSON.stringify(chunk)
        });
        if (!res.ok) { const txt = await res.text(); throw new Error('Error upserting snapshot: ' + txt); }
      }

      console.log('[ParIntelligence] Snapshot upserted:', upsertRows.length, 'items for', weekStart);
    } catch (err) {
      console.warn('[ParIntelligence] saveSnapshot failed:', err);
    }
  }

  // ─── completeSnapshot ─────────────────────────────────────────────
  // Called at START of applyPendingImport — closes previous cycle
  async function completeSnapshot(master) {
    try {
      const { url, key } = getConfig();
      const locationId = await fetchLocationId();
      const weekStart = getEffectiveWeekStart();

      // Find open snapshots (on_hand_end is null) from previous weeks
      const openSnapshots = await fetchAllSnapshotRows(
        `${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&on_hand_end=is.null&week_start=neq.${weekStart}&select=id,item_name,code,on_hand_start,ordered`
      );
      if (!openSnapshots?.length) return;

      // Build lookup from current master onHand
      const onHandMap = new Map();
      for (const r of master || []) {
        const key2 = `${(r.item || '').trim()}||${(r.code || '').trim()}`;
        onHandMap.set(key2, Number(r.onHand || 0));
      }

      // Get historical avg used per item for event week detection.
      // Paginado: si este promedio se calcula con datos truncados, semanas
      // normales se marcan como "evento" y quedan excluidas de Pour-IQ.
      const histData = await fetchAllSnapshotRows(
        `${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&used=not.is.null&is_event_week=eq.false&select=id,item_name,code,used`
      );
      const avgUsedMap = new Map();
      const usedAccum = new Map();
      for (const row of histData || []) {
        const k = `${row.item_name}||${row.code}`;
        if (!usedAccum.has(k)) usedAccum.set(k, []);
        usedAccum.get(k).push(Number(row.used || 0));
      }
      for (const [k, vals] of usedAccum) {
        avgUsedMap.set(k, vals.reduce((a, b) => a + b, 0) / vals.length);
      }

      // Patch all open snapshots in parallel
      const patches = [];
      for (const snap of openSnapshots) {
        const k = `${snap.item_name}||${snap.code}`;
        const onHandEnd = onHandMap.has(k) ? onHandMap.get(k) : null;
        if (onHandEnd === null) continue;

        const ordered = Number(snap.ordered || 0);
        const onHandStart = Number(snap.on_hand_start || 0);
        const used = onHandStart + ordered - onHandEnd;
        const avgUsed = avgUsedMap.get(k) || null;
        const isEventWeek = avgUsed !== null && used > avgUsed * 1.5;

        patches.push(fetch(`${url}/rest/v1/inventory_snapshots?id=eq.${snap.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: key,
            Authorization: `Bearer ${key}`,
            Prefer: 'return=minimal'
          },
          body: JSON.stringify({
            on_hand_end: onHandEnd,
            used: used,
            is_event_week: isEventWeek
          })
        }));
      }
      await Promise.all(patches);
      console.log('[ParIntelligence] Snapshots completed:', patches.length, 'items (parallel)');
    } catch (err) {
      console.warn('[ParIntelligence] completeSnapshot failed:', err);
    }
  }

  // ─── runCycle ─────────────────────────────────────────────────────
  // Single entry point called from applyPendingImport
  // 1. completeSnapshot (close previous cycle)
  // 2. saveSnapshot (open new cycle)
  async function runCycle(master) {
    await completeSnapshot(master);
    await saveSnapshot(master);
  }


  // ─── updateSnapshotOrdered ────────────────────────────────────────
  // Called after a vendor order is placed — adds ordered qty to snapshot
  async function updateSnapshotOrdered(rows) {
    try {
      const { url, key } = getConfig();
      const locationId = await fetchLocationId();
      const weekStart = getEffectiveWeekStart();

      for (const row of rows || []) {
        const itemName = (row.item || '').trim();
        const code = (row.code || '').trim();
        const qty = Number(row.finalOrder || 0);
        if (!itemName || qty <= 0) continue;

        // Find existing snapshot for this week + item
        let filterUrl = `${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&week_start=eq.${weekStart}&item_name=eq.${encodeURIComponent(itemName)}`;
        if (code) filterUrl += `&code=eq.${encodeURIComponent(code)}`;
        filterUrl += '&select=id,ordered';

        const res = await fetch(filterUrl, {
          headers: { apikey: key, Authorization: `Bearer ${key}` }
        });
        const snaps = await res.json();
        if (!snaps?.length) continue;

        const snap = snaps[0];
        const currentOrdered = Number(snap.ordered || 0);
        const newOrdered = currentOrdered + qty;

        await fetch(`${url}/rest/v1/inventory_snapshots?id=eq.${snap.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: key,
            Authorization: `Bearer ${key}`,
            Prefer: 'return=minimal'
          },
          body: JSON.stringify({ ordered: newOrdered })
        });
      }
      console.log('[ParIntelligence] ordered updated for', rows?.length, 'items');
    } catch (err) {
      console.warn('[ParIntelligence] updateSnapshotOrdered failed:', err);
    }
  }


  // ─── reverseSnapshotOrdered ───────────────────────────────────────
  // Called when an order is deleted or reopened — subtracts ordered qty
  async function reverseSnapshotOrdered(order) {
    try {
      const { url, key } = getConfig();
      const locationId = await fetchLocationId();

      // Use order date to find the right week
      const orderDate = new Date(order.createdAt || order.date || Date.now());
      const day = orderDate.getDay();
      const diff = orderDate.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(orderDate.setDate(diff));
      const weekStart = monday.toISOString().split('T')[0];

      for (const row of order.items || []) {
        const itemName = (row.item || '').trim();
        const code = (row.code || '').trim();
        const qty = Number(row.finalOrder || 0);
        if (!itemName || qty <= 0) continue;

        let filterUrl = `${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&week_start=eq.${weekStart}&item_name=eq.${encodeURIComponent(itemName)}`;
        if (code) filterUrl += `&code=eq.${encodeURIComponent(code)}`;
        filterUrl += '&select=id,ordered';

        const res = await fetch(filterUrl, {
          headers: { apikey: key, Authorization: `Bearer ${key}` }
        });
        const snaps = await res.json();
        if (!snaps?.length) continue;

        const snap = snaps[0];
        const currentOrdered = Number(snap.ordered || 0);
        const newOrdered = Math.max(0, currentOrdered - qty);

        await fetch(`${url}/rest/v1/inventory_snapshots?id=eq.${snap.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: key,
            Authorization: `Bearer ${key}`,
            Prefer: 'return=minimal'
          },
          body: JSON.stringify({ ordered: newOrdered })
        });
      }
      console.log('[ParIntelligence] ordered reversed for order:', order.id);
    } catch (err) {
      console.warn('[ParIntelligence] reverseSnapshotOrdered failed:', err);
    }
  }


  // ─── calculateParOptimal ─────────────────────────────────────────
  // Returns optimal par and avg_used for a single item
  async function calculateParOptimal(locationId, itemName, code) {
    const { url, key } = getConfig();

    let filterUrl = `${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&item_name=eq.${encodeURIComponent(itemName)}&is_event_week=eq.false&used=not.is.null&select=used,week_start`;
    if (code) filterUrl += `&code=eq.${encodeURIComponent(code)}`;

    const res = await fetch(filterUrl, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    const rows = await res.json();
    if (!rows?.length) return null;

    // Deduplicate by week_start — take first occurrence per week
    const byWeek = new Map();
    for (const r of rows) {
      if (!byWeek.has(r.week_start)) byWeek.set(r.week_start, Number(r.used || 0));
    }
    const usedValues = Array.from(byWeek.values());
    if (usedValues.length < 4) return { status: 'observing', normalWeeks: usedValues.length };

    const avgUsed = usedValues.reduce((a, b) => a + b, 0) / usedValues.length;
    const suggestedOptimal = Math.ceil(avgUsed * 1.35);

    return {
      status: 'active',
      normalWeeks: usedValues.length,
      avgUsed: Math.round(avgUsed * 10) / 10,
      suggestedOptimal
    };
  }

  // ─── getPendingAdjustments ────────────────────────────────────────
  // Runs across all master items and returns par adjustment per item
  async function getPendingAdjustments(master) {
    try {
      const locationId = await fetchLocationId();
      const results = new Map();

      // Batch fetch all normal snapshots for this location (paginado: ver
      // fetchAllSnapshotRows — sin esto la respuesta se corta en 1000 filas
      // y los productos aparecen con menos semanas de las que realmente tienen)
      const { url, key } = getConfig();
      const allRows = await fetchAllSnapshotRows(
        `${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&is_event_week=eq.false&used=not.is.null&select=id,item_name,code,used,week_start`
      );

      // Group by item
      const byItem = new Map();
      for (const r of allRows || []) {
        const k = `${r.item_name}||${r.code || ''}`;
        if (!byItem.has(k)) byItem.set(k, new Map());
        const weekMap = byItem.get(k);
        if (!weekMap.has(r.week_start)) weekMap.set(r.week_start, Number(r.used || 0));
      }

      // Build ordered map per item per week (paginado por el mismo motivo)
      const orderedRows = await fetchAllSnapshotRows(
        `${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&is_event_week=eq.false&ordered=not.is.null&select=id,item_name,code,ordered,week_start`
      );
      const orderedByItem = new Map();
      for (const r of orderedRows || []) {
        const k = `${r.item_name}||${r.code || ''}`;
        if (!orderedByItem.has(k)) orderedByItem.set(k, new Map());
        orderedByItem.get(k).set(r.week_start, Number(r.ordered || 0));
      }

      // Calculate adjustment per master item
      for (const row of master || []) {
        const k = `${row.item}||${row.code || ''}`;
        const weekMap = byItem.get(k);
        const orderedMap = orderedByItem.get(k);

        if (!weekMap || weekMap.size < 4) {
          results.set(k, { status: 'observing', normalWeeks: weekMap?.size || 0 });
          continue;
        }

        // Never ordered detection — suggested > 0 but ordered = 0 in all available weeks
        const current = Number(row.suggested || 0);
        if (current > 0 && orderedMap) {
          const orderedValues = Array.from(orderedMap.values());
          const totalOrdered = orderedValues.reduce((a, b) => a + b, 0);
          if (orderedValues.length >= 4 && totalOrdered === 0) {
            results.set(k, {
              status: 'never_ordered',
              normalWeeks: weekMap.size,
              currentSuggested: current
            });
            continue;
          }
        }

        const usedValues = Array.from(weekMap.values());
        const avgUsed = usedValues.reduce((a, b) => a + b, 0) / usedValues.length;
        const suggestedOptimal = Math.ceil(avgUsed * 1.35);
        const delta = current - suggestedOptimal;

        let adjustment = 0;
        if (delta > 1) adjustment = -1;
        else if (delta < -1) adjustment = 1;

        // Week-over-week trend — compare last two closed weeks
        let trendDelta = null;
        if (weekMap.size >= 2) {
          const sortedWeeks = Array.from(weekMap.keys()).sort();
          const lastWeek  = weekMap.get(sortedWeeks[sortedWeeks.length - 1]);
          const prevWeek  = weekMap.get(sortedWeeks[sortedWeeks.length - 2]);
          trendDelta = Math.round((lastWeek - prevWeek) * 10) / 10;
        }

        results.set(k, {
          status: 'active',
          normalWeeks: weekMap.size,
          avgUsed: Math.round(avgUsed * 10) / 10,
          suggestedOptimal,
          currentSuggested: current,
          delta,
          adjustment,
          trendDelta
        });
      }

      return results;
    } catch (err) {
      console.warn('[ParIntelligence] getPendingAdjustments failed:', err);
      return new Map();
    }
  }


  // ─── updateSnapshotOnHand ─────────────────────────────────────────
  // Called when user manually edits onHand — corrects:
  // 1. on_hand_start of current week snapshot
  // 2. on_hand_end of previous week snapshot (and recalculates used)
  async function updateSnapshotOnHand(itemName, code, newOnHand) {
    try {
      const { url, key } = getConfig();
      const locationId = await fetchLocationId();
      const weekStart = getEffectiveWeekStart();
      const val = Number(newOnHand || 0);

      // 1. Update on_hand_start of current week
      let currentUrl = `${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&week_start=eq.${weekStart}&item_name=eq.${encodeURIComponent(itemName)}`;
      if (code) currentUrl += `&code=eq.${encodeURIComponent(code)}`;
      currentUrl += '&select=id';
      const currentRes = await fetch(currentUrl, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      const currentSnaps = await currentRes.json();
      if (currentSnaps?.length) {
        await fetch(`${url}/rest/v1/inventory_snapshots?id=eq.${currentSnaps[0].id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
          body: JSON.stringify({ on_hand_start: val })
        });
      }

      // 2. Update on_hand_end of previous week (week_start < current, on_hand_end not null)
      let prevUrl = `${url}/rest/v1/inventory_snapshots?location_id=eq.${locationId}&week_start=lt.${weekStart}&item_name=eq.${encodeURIComponent(itemName)}&on_hand_end=not.is.null&select=id,on_hand_start,ordered&order=week_start.desc&limit=1`;
      if (code) prevUrl += `&code=eq.${encodeURIComponent(code)}`;
      const prevRes = await fetch(prevUrl, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      const prevSnaps = await prevRes.json();
      if (prevSnaps?.length) {
        const prev = prevSnaps[0];
        const ordered = Number(prev.ordered || 0);
        const onHandStart = Number(prev.on_hand_start || 0);
        const newUsed = onHandStart + ordered - val;
        await fetch(`${url}/rest/v1/inventory_snapshots?id=eq.${prev.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
          body: JSON.stringify({ on_hand_end: val, used: newUsed })
        });
      }

      console.log('[ParIntelligence] onHand correction applied for:', itemName, val);
    } catch (err) {
      console.warn('[ParIntelligence] updateSnapshotOnHand failed:', err);
    }
  }

  window.BarStockParIntelligence = {
    runCycle,
    saveSnapshot,
    completeSnapshot,
    updateSnapshotOrdered,
    reverseSnapshotOrdered,
    calculateParOptimal,
    getPendingAdjustments,
    updateSnapshotOnHand,
    setWeekStartOverride,
    getEffectiveWeekStart
  };

})();
