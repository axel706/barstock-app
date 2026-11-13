const { createClient } = require('@supabase/supabase-js');
// El nombre → correo de un bartender: el MISMO archivo que usa el login
// del teléfono. Si los dos lo calcularan aparte, Billie no entraría.
const BID = require('../src/bartender-id.js');
// Los roles y sus permisos: el mismo catálogo que usa la app.
const P = require('../src/permisos.js');

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
    const { action } = req.body || {};

    // ── Quién puede qué aquí ────────────────────────────────────────────
    //
    // Todo lo de este archivo era sólo para Axel (ADMIN_EMAIL). Desde los
    // roles (2026-11-13), lo de Settings › People lo puede usar también
    // una persona de PIN con "People and roles"; cambiar roles, dar o
    // quitar Owner, sólo un Owner. Lo demás (solicitudes de alta,
    // usuarios de correo, configuración global) sigue siendo sólo Axel.
    //
    // Un usuario de correo SIN rol no entra por aquí aunque la app le
    // deje verlo todo: sus permisos "de siempre" son para no quitarle
    // nada, no para darle la gente.
    const yo = userData.user;
    const esAxel = yo.email === ADMIN_EMAIL;
    const miRol = yo.app_metadata && yo.app_metadata.role;
    const misPerms = miRol ? P.deUsuario(yo) : [];
    const esOwner = esAxel || miRol === 'owner';
    const DE_PERSONAS = ['listPeople', 'createPerson', 'setPerson', 'removePerson', 'saveRole', 'removeRole',
      'listBartenders', 'createBartender', 'setBartender', 'removeBartender', 'listLocations'];
    const puedePersonas = esAxel || misPerms.indexOf('personas') >= 0;
    if (DE_PERSONAS.indexOf(action) >= 0 ? !puedePersonas : !esAxel) {
      return res.status(403).json({ ok: false, error: "Not authorized" });
    }

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

    // ── Personas con nombre y PIN, y sus roles (Settings › People) ─────
    //
    // Empezó con los bartenders (Axel, 2026-11-12: "quiero que sean
    // usuarios y un PIN que yo les doy") y desde el 2026-11-13 es para
    // todos: Owner, Manager, Bartender y los roles que Axel cree, todos
    // con nombre y PIN ("PIN es bastante bueno").
    //
    // Cada persona es un usuario de Supabase con un correo sacado de su
    // nombre (src/bartender-id.js) y el PIN de contraseña. Lo que la hace
    // persona de PIN, y lo que puede, va en su app_metadata, que sólo se
    // escribe desde aquí (ella no puede tocarlo):
    //   role   la clave de su rol ('manager', 'bartender', …)
    //   off    los permisos que se le quitaron a ELLA (excepciones, 3A)
    //   perms  lo que puede, ya calculado (src/permisos.js efectivos):
    //          la app y lib/integracion.js lo leen de la sesión.
    // En user_location_access va también la clave del rol, para que se
    // vea en la tabla; no es lo que se lee.
    //
    // Estas acciones sólo tocan personas de PIN (con role): con un id
    // equivocado no se le cambia la contraseña ni se borra a un usuario de
    // correo. Los de antes de los roles (role = 'bartender' sin perms)
    // son personas de PIN igual.
    const esPersona = (u) => !!(u && u.app_metadata && u.app_metadata.role);
    async function persona(userId) {
      if (!userId) return null;
      const { data, error } = await supabase.auth.admin.getUserById(userId);
      if (error || !data || !data.user || !esPersona(data.user)) return null;
      return data.user;
    }
    async function darAcceso(userId, locationIds, rolKey) {
      const { error: delError } = await supabase.from('user_location_access').delete().eq('user_id', userId);
      if (delError) throw delError;
      if (!locationIds.length) return;
      const { error } = await supabase.from('user_location_access').insert(locationIds.map(locationId => ({
        user_id: userId, account_id: ACCOUNT_ID, location_id: locationId, role: rolKey
      })));
      if (error) throw error;
    }
    async function leerRoles() {
      const { data, error } = await supabase.from('roles').select('key, name, perms').eq('account_id', ACCOUNT_ID);
      if (error) throw error;
      return data || [];
    }
    // Los roles para la pantalla: Owner (fijo), los guardados, y los de
    // fábrica que no estén guardados (la migración 039 sin correr).
    function listaRoles(guardados) {
      const out = [Object.assign({ fijo: true }, P.FABRICA.owner)];
      for (const k of ['manager', 'bartender']) {
        if (!guardados.some(r => r.key === k)) out.push({ key: k, name: P.FABRICA[k].name, perms: P.FABRICA[k].perms.slice() });
      }
      for (const r of guardados) out.push({ key: r.key, name: r.name, perms: P.limpia(r.perms) });
      return out;
    }
    function metadata(rolKey, roles, off) {
      const quitados = P.limpia(off);
      return { role: rolKey, off: quitados, perms: P.efectivos(rolKey, roles, quitados) };
    }
    async function todasLasPersonas() {
      const todos = [];
      // Supabase no filtra por app_metadata: se pagina la lista entera,
      // con el mismo tope que findUserByEmail.
      for (let page = 1; page <= 40; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 50 });
        if (error) throw error;
        const users = (data && data.users) || [];
        todos.push(...users.filter(esPersona));
        if (users.length < 50) break;
      }
      return todos;
    }
    function publicaPersona(u, access, locs) {
      const m = u.app_metadata || {};
      return Object.assign(publicUser(u, access, locs), {
        role: m.role, off: P.limpia(m.off), perms: P.deUsuario(u)
      });
    }

    // Los nombres de antes (la pantalla de Bartenders) son las mismas
    // acciones con el rol fijo en 'bartender'.
    const ALIAS = { listBartenders: 'listPeople', createBartender: 'createPerson',
                    setBartender: 'setPerson', removeBartender: 'removePerson' };
    const accion = ALIAS[action] || action;
    const soloBartenders = !!ALIAS[action];

    if (accion === 'listPeople') {
      const todos = await todasLasPersonas();
      const ids = todos.map(u => u.id);
      const [{ data: access, error: aErr }, { data: locs, error: lErr }, roles] = await Promise.all([
        ids.length ? supabase.from('user_location_access').select('user_id, location_id, role').in('user_id', ids) : Promise.resolve({ data: [] }),
        supabase.from('locations').select('id, name').eq('account_id', ACCOUNT_ID),
        leerRoles().catch(() => [])
      ]);
      if (aErr) throw aErr;
      if (lErr) throw lErr;
      const people = todos
        .filter(u => !soloBartenders || u.app_metadata.role === BID.ROL)
        .map(u => publicaPersona(u, (access || []).filter(a => a.user_id === u.id), locs))
        .sort((a, b) => a.name.localeCompare(b.name));
      return res.status(200).json({ ok: true, people, bartenders: people, roles: listaRoles(roles) });
    }

    if (accion === 'createPerson') {
      const { name, pin, locationIds } = req.body || {};
      const rolKey = soloBartenders ? BID.ROL : String((req.body || {}).role || '');
      const nombre = String(name || '').trim();
      if (!BID.nombreValido(nombre)) return res.status(400).json({ ok: false, error: 'Enter a name.' });
      if (!BID.pinValido(pin)) return res.status(400).json({ ok: false, error: 'The PIN has to be 6 digits.' });
      if (!Array.isArray(locationIds) || !locationIds.length) {
        return res.status(400).json({ ok: false, error: 'Choose at least one location.' });
      }
      const roles = await leerRoles().catch(() => []);
      if (!P.rol(rolKey, roles)) return res.status(400).json({ ok: false, error: 'Choose a role.' });
      if (rolKey === 'owner' && !esOwner) return res.status(403).json({ ok: false, error: 'Only an owner can add another owner.' });
      const email = BID.correo(nombre);
      // Dos "Billie" darían el mismo correo, y el login no sabría cuál.
      if (await findUserByEmail(email)) {
        return res.status(400).json({ ok: false, error: 'There is already someone called ' + nombre + '. Use another name.' });
      }
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email, password: String(pin), email_confirm: true,
        user_metadata: { first_name: nombre },
        app_metadata: metadata(rolKey, roles, [])
      });
      if (authError) throw authError;
      const userId = authData.user.id;
      try { await darAcceso(userId, locationIds, rolKey); }
      catch (e) {
        // Sin acceso no sirve, y el nombre quedaría ocupado: se deshace.
        await supabase.auth.admin.deleteUser(userId).catch(() => {});
        throw e;
      }
      return res.status(200).json({ ok: true, userId, name: nombre });
    }

    if (accion === 'setPerson') {
      const { userId, pin, locationIds, role, off } = req.body || {};
      const u = await persona(userId);
      if (!u || (soloBartenders && u.app_metadata.role !== BID.ROL)) {
        return res.status(404).json({ ok: false, error: 'That person was not found.' });
      }
      // Nadie se quita a sí mismo People and roles ni se cambia el rol:
      // se quedaría fuera de la pantalla desde la que se arregla.
      if (u.id === yo.id && (role !== undefined || off !== undefined)) {
        return res.status(400).json({ ok: false, error: 'You can’t change your own role or permissions.' });
      }
      if (pin !== undefined) {
        if (!BID.pinValido(pin)) return res.status(400).json({ ok: false, error: 'The PIN has to be 6 digits.' });
        const { error } = await supabase.auth.admin.updateUserById(u.id, { password: String(pin) });
        if (error) throw error;
      }
      const m = u.app_metadata || {};
      let rolKey = m.role;
      if (role !== undefined || off !== undefined) {
        const roles = await leerRoles().catch(() => []);
        rolKey = role !== undefined ? String(role) : m.role;
        if (!P.rol(rolKey, roles)) return res.status(400).json({ ok: false, error: 'Choose a role.' });
        // Dar o quitar Owner sólo lo hace un Owner.
        if ((rolKey === 'owner' || m.role === 'owner') && !esOwner) {
          return res.status(403).json({ ok: false, error: 'Only an owner can change an owner.' });
        }
        // Al cambiar de rol, las excepciones del rol de antes no valen.
        const quitados = off !== undefined ? off : (role !== undefined && rolKey !== m.role ? [] : m.off);
        const { error } = await supabase.auth.admin.updateUserById(u.id, {
          app_metadata: Object.assign({}, m, metadata(rolKey, roles, quitados))
        });
        if (error) throw error;
      }
      if (locationIds !== undefined) {
        if (!Array.isArray(locationIds) || !locationIds.length) {
          return res.status(400).json({ ok: false, error: 'Choose at least one location.' });
        }
        await darAcceso(u.id, locationIds, rolKey);
      } else if (role !== undefined && rolKey !== m.role) {
        // El rol también va en user_location_access, para que se vea.
        const { error } = await supabase.from('user_location_access').update({ role: rolKey }).eq('user_id', u.id);
        if (error) throw error;
      }
      return res.status(200).json({ ok: true });
    }

    if (accion === 'removePerson') {
      const { userId } = req.body || {};
      const u = await persona(userId);
      if (!u || (soloBartenders && u.app_metadata.role !== BID.ROL)) {
        return res.status(404).json({ ok: false, error: 'That person was not found.' });
      }
      if (u.id === yo.id) return res.status(400).json({ ok: false, error: 'You can’t remove yourself.' });
      if (u.app_metadata.role === 'owner' && !esOwner) return res.status(403).json({ ok: false, error: 'Only an owner can remove an owner.' });
      const { error: accessError } = await supabase.from('user_location_access').delete().eq('user_id', u.id);
      if (accessError) throw accessError;
      // Borrado de verdad, no "suave" como deleteUser de arriba: así el
      // nombre queda libre y se puede volver a crear otro Billie.
      const { error } = await supabase.auth.admin.deleteUser(u.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    // ── Los roles: crearlos y cambiar sus permisos (sólo Owner) ─────────
    if (accion === 'saveRole') {
      if (!esOwner) return res.status(403).json({ ok: false, error: 'Only an owner can change roles.' });
      const { key, name, perms } = req.body || {};
      const nombre = String(name || '').trim();
      if (!nombre || nombre.length > 30) return res.status(400).json({ ok: false, error: 'Enter a name for the role.' });
      const clave = key ? String(key) : P.claveDe(nombre);
      if (!clave) return res.status(400).json({ ok: false, error: 'Enter a name for the role.' });
      if (clave === 'owner') return res.status(400).json({ ok: false, error: 'Owner can’t be changed.' });
      const roles = await leerRoles();
      // Un rol nuevo con el nombre de uno que ya existe pisaría al otro.
      if (!key && (roles.some(r => r.key === clave) || P.FABRICA[clave])) {
        return res.status(400).json({ ok: false, error: 'There is already a role called ' + nombre + '.' });
      }
      const lista = P.limpia(perms);
      const { error } = await supabase.from('roles').upsert(
        { account_id: ACCOUNT_ID, key: clave, name: nombre, perms: lista, updated_at: new Date().toISOString() },
        { onConflict: 'account_id,key' });
      if (error) throw error;
      // Quien ya tiene este rol recibe los permisos nuevos (menos sus
      // excepciones). Llegan con su próxima sesión: la de ahora dura una
      // hora como mucho.
      const nuevos = roles.filter(r => r.key !== clave).concat([{ key: clave, name: nombre, perms: lista }]);
      let cambiados = 0;
      for (const u of await todasLasPersonas()) {
        const m = u.app_metadata || {};
        if (m.role !== clave) continue;
        const { error: e2 } = await supabase.auth.admin.updateUserById(u.id, {
          app_metadata: Object.assign({}, m, metadata(clave, nuevos, m.off))
        });
        if (e2) throw e2;
        cambiados++;
      }
      return res.status(200).json({ ok: true, key: clave, people: cambiados });
    }

    if (accion === 'removeRole') {
      if (!esOwner) return res.status(403).json({ ok: false, error: 'Only an owner can change roles.' });
      const { key } = req.body || {};
      if (!key || P.FABRICA[key]) return res.status(400).json({ ok: false, error: 'Owner, Manager and Bartender can’t be removed.' });
      const usan = (await todasLasPersonas()).filter(u => u.app_metadata.role === key).length;
      if (usan) return res.status(400).json({ ok: false, error: usan + (usan === 1 ? ' person has' : ' people have') + ' this role. Give them another one first.' });
      const { error } = await supabase.from('roles').delete().eq('account_id', ACCOUNT_ID).eq('key', key);
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
