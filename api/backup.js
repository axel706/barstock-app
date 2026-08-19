const { createClient } = require('@supabase/supabase-js');

const ADMIN_EMAIL = 'axeltorressalgado@icloud.com';
const ACCOUNT_ID = 'wjm-hospitality';
const KEEP = 10; // respaldos que se conservan por locación

// ── Respaldos del inventario ─────────────────────────────────────────
//
// Crear un respaldo lo puede hacer cualquiera con acceso a la locación:
// se dispara solo antes de las acciones que borran, y el usuario ni se
// entera. Restaurar es otra cosa — reemplaza el inventario completo, o
// sea que es tan destructivo como el accidente que viene a arreglar — y
// queda reservado al admin.
//
// La llave de servicio vive solo aquí. El navegador nunca escribe en
// inventory_backups; la tabla tiene RLS activo y ninguna política.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ ok: false, error: 'Missing token' });

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }
    const user = userData.user;
    const isAdmin = user.email === ADMIN_EMAIL;

    const { action, locationName, backupId, reason } = req.body || {};

    // Resuelve la locación y comprueba que quien llama tenga acceso.
    // Sin esto, cualquiera con sesión podría respaldar o listar los datos
    // de una locación que no le toca.
    async function resolveLocation(name) {
      if (!name) return { error: 'Missing locationName' };
      const { data: locs, error } = await supabase
        .from('locations')
        .select('id, name')
        .eq('account_id', ACCOUNT_ID)
        .eq('name', name)
        .limit(1);
      if (error) throw error;
      const loc = locs && locs[0];
      if (!loc) return { error: 'Location not found' };

      if (!isAdmin) {
        const { data: access } = await supabase
          .from('user_location_access')
          .select('location_id')
          .eq('user_id', user.id)
          .eq('location_id', loc.id)
          .limit(1);
        if (!access || !access.length) return { error: 'No access to that location' };
      }
      return { loc };
    }

    if (action === 'create') {
      const { loc, error: accErr } = await resolveLocation(locationName);
      if (accErr) return res.status(403).json({ ok: false, error: accErr });

      const { data: items, error: readErr } = await supabase
        .from('inventory_items')
        .select('code, item_name, vendor, suggested, on_hand, value, category, order_override, par_adjusted_week')
        .eq('location_id', loc.id);
      if (readErr) throw readErr;

      // Un respaldo vacío no es un respaldo, es una trampa: se vería en la
      // lista como algo restaurable y dejaría la locación en cero.
      if (!items || !items.length) {
        return res.status(200).json({ ok: true, skipped: 'empty', itemCount: 0 });
      }

      const { data: created, error: insErr } = await supabase
        .from('inventory_backups')
        .insert({
          location_id: String(loc.id),
          location_name: loc.name,
          reason: String(reason || 'manual').slice(0, 60),
          item_count: items.length,
          payload: items
        })
        .select('id, created_at')
        .single();
      if (insErr) throw insErr;

      // Poda: se conservan los KEEP más recientes de esta locación
      const { data: old } = await supabase
        .from('inventory_backups')
        .select('id')
        .eq('location_id', String(loc.id))
        .order('created_at', { ascending: false })
        .range(KEEP, KEEP + 200);
      if (old && old.length) {
        await supabase.from('inventory_backups').delete().in('id', old.map(o => o.id));
      }

      return res.status(200).json({ ok: true, id: created.id, itemCount: items.length });
    }

    if (action === 'list') {
      const { loc, error: accErr } = await resolveLocation(locationName);
      if (accErr) return res.status(403).json({ ok: false, error: accErr });

      // Sin payload a propósito: la lista no necesita cargar el inventario
      // completo de diez respaldos para mostrar fechas.
      const { data, error } = await supabase
        .from('inventory_backups')
        .select('id, created_at, reason, item_count')
        .eq('location_id', String(loc.id))
        .order('created_at', { ascending: false });
      if (error) throw error;

      return res.status(200).json({ ok: true, backups: data || [] });
    }

    if (action === 'restore') {
      if (!isAdmin) return res.status(403).json({ ok: false, error: 'Only the admin can restore' });
      if (!backupId) return res.status(400).json({ ok: false, error: 'Missing backupId' });

      const { data: bk, error: bkErr } = await supabase
        .from('inventory_backups')
        .select('id, location_id, location_name, item_count, payload')
        .eq('id', backupId)
        .single();
      if (bkErr || !bk) return res.status(404).json({ ok: false, error: 'Backup not found' });

      const rows = Array.isArray(bk.payload) ? bk.payload : [];
      if (!rows.length) return res.status(400).json({ ok: false, error: 'That backup is empty' });

      // Antes de pisar nada, respaldar lo que hay ahora. Restaurar el
      // respaldo equivocado es un error tan fácil de cometer como el que
      // trajo hasta aquí, y sin esto no habría vuelta atrás.
      const { data: current } = await supabase
        .from('inventory_items')
        .select('code, item_name, vendor, suggested, on_hand, value, category, order_override, par_adjusted_week')
        .eq('location_id', bk.location_id);
      if (current && current.length) {
        await supabase.from('inventory_backups').insert({
          location_id: bk.location_id,
          location_name: bk.location_name,
          reason: 'before-restore',
          item_count: current.length,
          payload: current
        });
      }

      const { error: delErr } = await supabase
        .from('inventory_items')
        .delete()
        .eq('location_id', bk.location_id);
      if (delErr) throw delErr;

      const toInsert = rows.map(r => ({
        location_id: bk.location_id,
        code: r.code || '',
        item_name: r.item_name || '',
        vendor: r.vendor || '',
        suggested: Number(r.suggested || 0),
        on_hand: Number(r.on_hand || 0),
        value: Number(r.value || 0),
        category: r.category || null,
        order_override: (r.order_override === null || r.order_override === undefined) ? null : Number(r.order_override),
        par_adjusted_week: r.par_adjusted_week || null
      }));

      const CHUNK = 200;
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const { error } = await supabase.from('inventory_items').insert(toInsert.slice(i, i + CHUNK));
        if (error) throw error;
      }

      return res.status(200).json({ ok: true, restored: toInsert.length });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    console.error('backup endpoint error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
