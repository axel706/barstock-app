const { createClient } = require('@supabase/supabase-js');
// El nombre → correo de un bartender: el MISMO archivo que usa el login
// del teléfono. Si los dos lo calcularan aparte, Billie no entraría.
const BID = require('../src/bartender-id.js');

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

      // ── Y quien la crea entra ───────────────────────────────────
      //
      // Esto no estaba, y el selector de locaciones lee de
      // `user_location_access` SIN excepción para el admin. O sea:
      // creabas una locación y no aparecía en tu propia lista. El
      // único modo de entrar era acordarse de añadirse a mano en otra
      // pestaña del panel.
      //
      // No era un paso de alta, era un agujero.
      //
      // Si esto falla, la locación ya existe y se dice: callarlo
      // dejaría una locación invisible sin pista de por qué.
      let aviso = null;
      try {
        const { data: quien } = await supabase.auth.admin.listUsers({ page: 1, perPage: 50 });
        const yo = ((quien && quien.users) || [])
          .find(u => (u.email || '').toLowerCase() === String(ADMIN_EMAIL || '').toLowerCase());
        if (yo) {
          const { error: e2 } = await supabase.from('user_location_access').insert({
            user_id: yo.id, location_id: data.id,
            account_id: ACCOUNT_ID, role: 'admin'
          });
          if (e2) throw e2;
        } else {
          aviso = 'Location created, but the admin user was not found to grant access.';
        }
      } catch (e) {
        aviso = 'Location created, but access could not be granted: ' + (e.message || String(e));
      }

      return res.status(200).json({ ok: true, location: data, aviso });
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

    // ── Bartenders: nombre y PIN (Settings › People › Bartenders) ──────
    //
    // Axel, 2026-11-12: "quiero que sean usuarios y un PIN que yo les
    // doy". Cada uno es un usuario de Supabase con un correo sacado de su
    // nombre (src/bartender-id.js) y el PIN de contraseña. Lo que lo hace
    // invitado es app_metadata.role = 'bartender', que sólo se escribe
    // desde aquí (el propio usuario no puede tocar app_metadata), y que
    // src/guest.js y lib/integracion.js leen. En user_location_access va
    // también 'bartender', para que el rol se vea en la tabla.
    //
    // Estas acciones sólo tocan usuarios que YA son bartenders: con un id
    // equivocado no se le cambia la contraseña ni se borra a nadie más.
    const esBartender = (u) => !!(u && u.app_metadata && u.app_metadata.role === BID.ROL);
    async function bartender(userId) {
      if (!userId) return null;
      const { data, error } = await supabase.auth.admin.getUserById(userId);
      if (error || !data || !data.user || !esBartender(data.user)) return null;
      return data.user;
    }
    async function darAcceso(userId, locationIds) {
      const { error: delError } = await supabase.from('user_location_access').delete().eq('user_id', userId);
      if (delError) throw delError;
      if (!locationIds.length) return;
      const { error } = await supabase.from('user_location_access').insert(locationIds.map(locationId => ({
        user_id: userId, account_id: ACCOUNT_ID, location_id: locationId, role: BID.ROL
      })));
      if (error) throw error;
    }

    if (action === 'listBartenders') {
      // Supabase no filtra por app_metadata: se pagina la lista entera,
      // con el mismo tope que findUserByEmail.
      const todos = [];
      for (let page = 1; page <= 40; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 50 });
        if (error) throw error;
        const users = (data && data.users) || [];
        todos.push(...users.filter(esBartender));
        if (users.length < 50) break;
      }
      const ids = todos.map(u => u.id);
      const [{ data: access, error: aErr }, { data: locs, error: lErr }] = await Promise.all([
        ids.length ? supabase.from('user_location_access').select('user_id, location_id, role').in('user_id', ids) : Promise.resolve({ data: [] }),
        supabase.from('locations').select('id, name').eq('account_id', ACCOUNT_ID)
      ]);
      if (aErr) throw aErr;
      if (lErr) throw lErr;
      const bartenders = todos.map(u => publicUser(u, (access || []).filter(a => a.user_id === u.id), locs))
        .sort((a, b) => a.name.localeCompare(b.name));
      return res.status(200).json({ ok: true, bartenders });
    }

    if (action === 'createBartender') {
      const { name, pin, locationIds } = req.body || {};
      const nombre = String(name || '').trim();
      if (!BID.nombreValido(nombre)) return res.status(400).json({ ok: false, error: 'Enter a name.' });
      if (!BID.pinValido(pin)) return res.status(400).json({ ok: false, error: 'The PIN has to be 6 digits.' });
      if (!Array.isArray(locationIds) || !locationIds.length) {
        return res.status(400).json({ ok: false, error: 'Choose at least one location.' });
      }
      const email = BID.correo(nombre);
      // Dos "Billie" darían el mismo correo, y el login no sabría cuál.
      if (await findUserByEmail(email)) {
        return res.status(400).json({ ok: false, error: 'There is already a bartender called ' + nombre + '. Use another name.' });
      }
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email, password: String(pin), email_confirm: true,
        user_metadata: { first_name: nombre },
        app_metadata: { role: BID.ROL }
      });
      if (authError) throw authError;
      const userId = authData.user.id;
      try { await darAcceso(userId, locationIds); }
      catch (e) {
        // Sin acceso no sirve, y el nombre quedaría ocupado: se deshace.
        await supabase.auth.admin.deleteUser(userId).catch(() => {});
        throw e;
      }
      return res.status(200).json({ ok: true, userId, name: nombre });
    }

    if (action === 'setBartender') {
      const { userId, pin, locationIds } = req.body || {};
      const u = await bartender(userId);
      if (!u) return res.status(404).json({ ok: false, error: 'That bartender was not found.' });
      if (pin !== undefined) {
        if (!BID.pinValido(pin)) return res.status(400).json({ ok: false, error: 'The PIN has to be 6 digits.' });
        const { error } = await supabase.auth.admin.updateUserById(u.id, { password: String(pin) });
        if (error) throw error;
      }
      if (locationIds !== undefined) {
        if (!Array.isArray(locationIds) || !locationIds.length) {
          return res.status(400).json({ ok: false, error: 'Choose at least one location.' });
        }
        await darAcceso(u.id, locationIds);
      }
      return res.status(200).json({ ok: true });
    }

    if (action === 'removeBartender') {
      const { userId } = req.body || {};
      const u = await bartender(userId);
      if (!u) return res.status(404).json({ ok: false, error: 'That bartender was not found.' });
      const { error: accessError } = await supabase.from('user_location_access').delete().eq('user_id', u.id);
      if (accessError) throw accessError;
      // Borrado de verdad, no "suave" como deleteUser de arriba: así el
      // nombre queda libre y se puede volver a crear otro Billie.
      const { error } = await supabase.auth.admin.deleteUser(u.id);
      if (error) throw error;
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
      // No hace falta comprobar el admin aqui: el endpoint entero ya
      // rechazo a cualquiera que no sea ADMIN_EMAIL al principio.
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
