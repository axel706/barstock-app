const { createClient } = require('@supabase/supabase-js');

const ADMIN_EMAIL = 'axeltorressalgado@icloud.com';
const ACCOUNT_ID = 'wjm-hospitality';

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ ok: false, error: "Missing token" });

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return res.status(401).json({ ok: false, error: "Invalid session" });
    }
    if (userData.user.email !== ADMIN_EMAIL) {
      return res.status(403).json({ ok: false, error: "Not authorized" });
    }

    const { action } = req.body || {};

    if (action === 'list') {
      const { data, error } = await supabase
        .from('signup_requests')
        .select('id, email, status, created_at, first_name, last_name, business_name, address, phone, message')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return res.status(200).json({ ok: true, requests: data });
    }

    if (action === 'listLocations') {
      const { data, error } = await supabase
        .from('locations')
        .select('id, name')
        .eq('account_id', ACCOUNT_ID)
        .order('name', { ascending: true });
      if (error) throw error;
      return res.status(200).json({ ok: true, locations: data });
    }

    if (action === 'approve') {
      const { requestId, locationId, role } = req.body || {};
      if (!requestId || !locationId) {
        return res.status(400).json({ ok: false, error: "Missing requestId or locationId" });
      }

      const { data: reqRow, error: reqError } = await supabase
        .from('signup_requests')
        .select('id, user_id, status')
        .eq('id', requestId)
        .single();
      if (reqError || !reqRow) throw reqError || new Error('Request not found');
      if (reqRow.status !== 'pending') {
        return res.status(400).json({ ok: false, error: "Request already processed" });
      }

      const { error: accessError } = await supabase
        .from('user_location_access')
        .insert({
          user_id: reqRow.user_id,
          account_id: ACCOUNT_ID,
          location_id: locationId,
          role: role || 'staff'
        });
      if (accessError) throw accessError;

      const { error: updateError } = await supabase
        .from('signup_requests')
        .update({ status: 'approved' })
        .eq('id', requestId);
      if (updateError) throw updateError;

      return res.status(200).json({ ok: true });
    }

    if (action === 'deny') {
      const { requestId } = req.body || {};
      if (!requestId) return res.status(400).json({ ok: false, error: "Missing requestId" });

      const { error } = await supabase
        .from('signup_requests')
        .update({ status: 'denied' })
        .eq('id', requestId);
      if (error) throw error;

      return res.status(200).json({ ok: true });
    }

    if (action === 'createLocation') {
      const { name } = req.body || {};
      if (!name || !name.trim()) {
        return res.status(400).json({ ok: false, error: "Missing location name" });
      }

      const { data, error } = await supabase
        .from('locations')
        .insert({ name: name.trim(), account_id: ACCOUNT_ID })
        .select('id, name')
        .single();
      if (error) throw error;

      return res.status(200).json({ ok: true, location: data });
    }

    // ── Gestion de usuarios ────────────────────────────────────────────
    //
    // Todo esto vivia en un HTML suelto con la llave service_role escrita
    // a mano. Aqui la llave viene de una variable de entorno y nunca sale
    // del servidor: el navegador solo manda un correo y una lista de
    // ubicaciones, y ya paso por la verificacion de ADMIN_EMAIL de arriba.

    // Supabase no ofrece buscar por correo, solo listar paginado.
    async function findUserByEmail(email) {
      const target = String(email || '').toLowerCase().trim();
      if (!target) return null;
      let page = 1;
      // Tope de seguridad: sin el, un correo inexistente pagina para
      // siempre si la API deja de respetar el corte por pagina corta.
      while (page <= 40) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 50 });
        if (error) throw error;
        const users = (data && data.users) || [];
        if (!users.length) return null;
        const found = users.find(u => (u.email || '').toLowerCase() === target);
        if (found) return found;
        if (users.length < 50) return null;
        page++;
      }
      return null;
    }

    function publicUser(user, access, locs) {
      const meta = user.user_metadata || {};
      const byId = new Map((locs || []).map(l => [l.id, l.name]));
      return {
        id: user.id,
        email: user.email,
        name: [meta.first_name, meta.last_name].filter(Boolean).join(' ') || '',
        createdAt: user.created_at,
        lastSignIn: user.last_sign_in_at || null,
        access: (access || []).map(a => ({
          locationId: a.location_id,
          name: byId.get(a.location_id) || '—',
          role: a.role
        }))
      };
    }

    if (action === 'findUser') {
      const { email } = req.body || {};
      const user = await findUserByEmail(email);
      if (!user) return res.status(200).json({ ok: true, user: null });

      const [{ data: access }, { data: locs }] = await Promise.all([
        supabase.from('user_location_access').select('location_id, role').eq('user_id', user.id),
        supabase.from('locations').select('id, name').eq('account_id', ACCOUNT_ID)
      ]);

      return res.status(200).json({ ok: true, user: publicUser(user, access, locs) });
    }

    if (action === 'createUser') {
      const { email, password, firstName, lastName, locationIds, role } = req.body || {};

      if (!email || !String(email).includes('@')) {
        return res.status(400).json({ ok: false, error: "Invalid email" });
      }
      if (!password || String(password).length < 8) {
        return res.status(400).json({ ok: false, error: "Password must be at least 8 characters" });
      }
      if (!Array.isArray(locationIds) || !locationIds.length) {
        return res.status(400).json({ ok: false, error: "Select at least one location" });
      }

      const existing = await findUserByEmail(email);
      if (existing) {
        return res.status(400).json({ ok: false, error: "That email already has an account" });
      }

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: String(email).trim(),
        password,
        email_confirm: true,
        user_metadata: {
          first_name: String(firstName || '').trim(),
          last_name: String(lastName || '').trim()
        }
      });
      if (authError) throw authError;

      const userId = authData.user.id;
      const rows = locationIds.map(locationId => ({
        user_id: userId,
        account_id: ACCOUNT_ID,
        location_id: locationId,
        role: role || 'staff'
      }));

      const { error: accessError } = await supabase.from('user_location_access').insert(rows);
      if (accessError) {
        // El usuario quedaria creado pero sin acceso a nada, y el correo
        // ocupado. Se deshace para que se pueda reintentar limpio.
        await supabase.auth.admin.deleteUser(userId, true).catch(() => {});
        throw accessError;
      }

      return res.status(200).json({ ok: true, userId });
    }

    if (action === 'setAccess') {
      const { userId, locationIds, role } = req.body || {};
      if (!userId) return res.status(400).json({ ok: false, error: "Missing userId" });
      if (!Array.isArray(locationIds)) {
        return res.status(400).json({ ok: false, error: "Missing locationIds" });
      }

      const { error: delError } = await supabase
        .from('user_location_access')
        .delete()
        .eq('user_id', userId);
      if (delError) throw delError;

      if (locationIds.length) {
        const rows = locationIds.map(locationId => ({
          user_id: userId,
          account_id: ACCOUNT_ID,
          location_id: locationId,
          role: role || 'staff'
        }));
        const { error: insError } = await supabase.from('user_location_access').insert(rows);
        if (insError) throw insError;
      }

      return res.status(200).json({ ok: true, count: locationIds.length });
    }

    if (action === 'deleteUser') {
      const { userId, email } = req.body || {};
      if (!userId || !email) {
        return res.status(400).json({ ok: false, error: "Missing userId or email" });
      }

      // El correo se vuelve a verificar contra el usuario real. Si la
      // pantalla mandara un id equivocado, aqui no coincide y no se borra.
      const { data: target, error: getError } = await supabase.auth.admin.getUserById(userId);
      if (getError || !target || !target.user) {
        return res.status(404).json({ ok: false, error: "User not found" });
      }
      if ((target.user.email || '').toLowerCase() !== String(email).toLowerCase().trim()) {
        return res.status(400).json({ ok: false, error: "Email does not match that user" });
      }
      // Borrarte a ti mismo te deja fuera de tu propia cuenta sin forma de
      // volver a entrar. No se permite desde aqui.
      if ((target.user.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        return res.status(400).json({ ok: false, error: "You cannot delete the admin account" });
      }

      const { error: accessError } = await supabase
        .from('user_location_access')
        .delete()
        .eq('user_id', userId);
      if (accessError) throw accessError;

      const { error: delError } = await supabase.auth.admin.deleteUser(userId, true);
      if (delError) throw delError;

      return res.status(200).json({ ok: true });
    }

    // ── Configuración global ───────────────────────────────────────────
    //
    // Va aquí y no en un endpoint nuevo por una razón práctica: Vercel
    // Hobby permite 12 funciones y estamos en 11. Un archivo más y el
    // despliegue vuelve a fallar, como paso el 20 de agosto.
    //
    // La escritura queda cubierta por la verificación de ADMIN_EMAIL de
    // arriba. La LECTURA no pasa por aquí: el navegador lee la tabla
    // directamente con la llave publica, porque la pantalla de entrada
    // necesita el fondo antes de que exista una sesion.
    if (action === 'setConfig') {
      if (!isAdmin) return res.status(403).json({ ok: false, error: 'Only the admin can change this' });
      const { key, value } = req.body || {};
      if (!key) return res.status(400).json({ ok: false, error: 'Missing key' });

      const ALLOWED = ['login_bg'];
      if (!ALLOWED.includes(key)) {
        return res.status(400).json({ ok: false, error: 'That key is not configurable' });
      }
      // La tabla es de lectura publica. Un limite de tamano evita que se
      // convierta en almacen de imagenes por accidente.
      if (value && String(value).length > 900000) {
        return res.status(400).json({ ok: false, error: 'That image is too large' });
      }

      if (value === null || value === '' || value === undefined) {
        const { error } = await supabase.from('app_config').delete().eq('key', key);
        if (error) throw error;
        return res.status(200).json({ ok: true, cleared: true });
      }

      const { error } = await supabase
        .from('app_config')
        .upsert({ key, value: String(value), updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;

      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: "Unknown action" });
  } catch (err) {
    console.error('admin endpoint error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
