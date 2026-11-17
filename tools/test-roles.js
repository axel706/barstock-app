#!/usr/bin/env node
/*
 * ── Roles y permisos: el catálogo y el servidor ──────────────────────
 *
 * Axel, 2026-11-13, sobre lámina (3A): Owner, Manager, Bartender y los
 * roles que él cree; por persona, las excepciones ("aun cuando tengan el
 * rol de manager pueda yo quitarle acceso a ciertas funciones"); el
 * mismo rol en todas sus locaciones; todos con nombre y PIN.
 *
 * Lo que se protege:
 *   1. src/permisos.js: lo que puede una persona es su rol menos sus
 *      excepciones; un usuario de correo sin rol lo puede todo (como
 *      hasta hoy); un bartender de antes de los roles, lo de siempre.
 *   2. api/admin.js: People lo usa Axel o quien tenga "People and
 *      roles"; los roles y el Owner, sólo un Owner. Un usuario de correo
 *      sin rol NO entra (sus permisos "de siempre" no le dan la gente).
 *   3. Las excepciones y los roles se guardan en app_metadata ya
 *      calculados, y cambiar un rol se lo cambia a quien lo tiene.
 *   4. lib/integracion.js: sync pide "Sync"; send se niega a quien sólo
 *      edita recetas.
 *
 *   node tools/test-roles.js
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

const P = require(path.join(RAIZ, 'src/permisos.js'));

grupo('1 · el catálogo');
{
  prueba('quince permisos, sin repetir', P.TODOS.length === 15 && new Set(P.TODOS).size === 15);
  prueba('Owner: todo', P.efectivos('owner', [], ['contar']).length === 15);
  const man = P.efectivos('manager', [], []);
  prueba('Manager de fábrica: sin ajustes de la locación, Time Machine ni gente',
    man.indexOf('ajustes_locacion') < 0 && man.indexOf('time_machine') < 0 && man.indexOf('personas') < 0 && man.indexOf('contar') >= 0);
  prueba('las excepciones se restan', P.efectivos('manager', [], ['editar_productos']).indexOf('editar_productos') < 0);
  prueba('el guardado manda sobre el de fábrica', JSON.stringify(P.efectivos('manager', [{ key: 'manager', perms: ['contar', 'raro'] }], [])) === '["contar"]');
  prueba('un rol que ya no existe no da nada', P.efectivos('fantasma', [], []).length === 0);
  prueba('usuario de correo sin rol: todo, como hasta hoy', P.deUsuario({ app_metadata: {} }).length === 15);
  // Un 'staff' viejo, sin perms: con [] quedaba bajo el candado de recetas.
  prueba('un rol viejo que no salió de aquí: todo, como hasta hoy', P.deUsuario({ app_metadata: { role: 'staff' } }).length === 15);
  prueba('bartender de antes de los roles: ver, recetas y avisar de lo que se acaba', JSON.stringify(P.deUsuario({ app_metadata: { role: 'bartender' } })) ===
    JSON.stringify(['ver_dinero', 'ver_ordenes', 'ver_ajustes', 'recetas', 'avisar_bajo']));
  prueba('con perms guardados, esos', JSON.stringify(P.deUsuario({ app_metadata: { role: 'manager', perms: ['contar'] } })) === '["contar"]');
  prueba('recetas y avisar = el candado del bartender', P.bajoCandado(P.FABRICA.bartender.perms) && P.bajoCandado(['recetas']) &&
    !P.bajoCandado(['recetas', 'contar']) && !P.bajoCandado(['avisar_bajo', 'ordenes']));
  prueba('persona de PIN: con perms o rol de fábrica; un staff viejo no',
    P.dePin({ app_metadata: { role: 'bar_lead', perms: [] } }) && P.dePin({ app_metadata: { role: 'bartender' } }) &&
    !P.dePin({ app_metadata: { role: 'staff' } }) && !P.dePin({ app_metadata: {} }));
  prueba('la clave sale del nombre', P.claveDe('Bar Lead ñ') === 'bar_lead_n');
}

// ── Un Supabase de mentira, con usuarios y roles ──────────────────────
const AXEL = 'axeltorressalgado@icloud.com';
const db = {};
function reiniciar() {
  db.users = [
    { id: 'axel', email: AXEL, app_metadata: {}, user_metadata: { first_name: 'Axel' } },
    { id: 'sam', email: 'sam@crown.com', app_metadata: {}, user_metadata: { first_name: 'Sam' } }
  ];
  db.access = [];
  db.roles = [
    { account_id: 'wjm-hospitality', key: 'manager', name: 'Manager', perms: P.FABRICA.manager.perms.slice() },
    { account_id: 'wjm-hospitality', key: 'bartender', name: 'Bartender', perms: P.FABRICA.bartender.perms.slice() }
  ];
}
function tabla(nombre) {
  const filtros = [];
  const filas = () => nombre === 'locations'
    ? [{ id: 'crown', name: 'Crown', account_id: 'wjm-hospitality' }, { id: 'wb', name: "Will's & Bill's", account_id: 'wjm-hospitality' }]
    : nombre === 'roles' ? db.roles : db.access;
  const q = {
    select: () => q, order: () => q,
    eq: (c, v) => { filtros.push(r => r[c] === v); return q; },
    in: (c, v) => { filtros.push(r => v.includes(r[c])); return q; },
    delete: () => { q._borrar = true; return q; },
    update: (o) => { q._cambio = o; return q; },
    insert: async (fs) => { db.access.push(...fs); return { error: null }; },
    upsert: async (fila) => {
      const i = db.roles.findIndex(r => r.account_id === fila.account_id && r.key === fila.key);
      if (i >= 0) db.roles[i] = Object.assign({}, db.roles[i], fila); else db.roles.push(fila);
      return { error: null };
    },
    then: (res) => {
      if (nombre === 'roles' && db.roles === null) return res({ data: null, error: { message: 'roles unavailable' } });
      const pasa = r => filtros.every(f => f(r));
      if (q._borrar) {
        if (nombre === 'roles') db.roles = db.roles.filter(r => !pasa(r)); else db.access = db.access.filter(r => !pasa(r));
        return res({ error: null });
      }
      if (q._cambio) { filas().filter(pasa).forEach(r => Object.assign(r, q._cambio)); return res({ error: null }); }
      return res({ data: filas().filter(pasa), error: null });
    }
  };
  return q;
}
const rutaSb = require.resolve('@supabase/supabase-js', { paths: [RAIZ] });
require.cache[rutaSb] = { id: rutaSb, filename: rutaSb, loaded: true, exports: { createClient: () => ({
  from: tabla,
  auth: {
    getUser: async (t) => ({ data: { user: db.users.find(u => u.id === t) || null }, error: null }),
    admin: {
      listUsers: async () => ({ data: { users: db.users.slice() }, error: null }),
      getUserById: async (id) => ({ data: { user: db.users.find(u => u.id === id) || null }, error: null }),
      createUser: async (o) => {
        const u = { id: 'u' + (db.users.length + 1), email: o.email, password: o.password,
          app_metadata: o.app_metadata || {}, user_metadata: o.user_metadata || {} };
        db.users.push(u); return { data: { user: u }, error: null };
      },
      // Como Supabase: ban_duration no se guarda tal cual, pone banned_until.
      updateUserById: async (id, o) => {
        const u = db.users.find(x => x.id === id); o = Object.assign({}, o);
        if ('ban_duration' in o) { u.banned_until = o.ban_duration === 'none' ? null : '2126-01-01T00:00:00Z'; delete o.ban_duration; }
        Object.assign(u, o); return { data: { user: u }, error: null };
      },
      deleteUser: async (id) => { db.users = db.users.filter(u => u.id !== id); return { error: null }; }
    }
  }
}) } };
// Resend de mentira (como en test-correo-manana): lo mandado queda en
// `enviados`; con `fallaResend` contesta un error.
const enviados = []; let fallaResend = null;
const rutaRs = require.resolve('resend', { paths: [RAIZ] });
require.cache[rutaRs] = { id: rutaRs, filename: rutaRs, loaded: true, exports: {
  Resend: class { constructor() { this.emails = { send: async (m) => fallaResend ? { error: { message: fallaResend } } : (enviados.push(m), { data: { id: 'm' + enviados.length } }) }; } }
} };
process.env.RESEND_API_KEY = 'k-test';
process.env.SUPABASE_URL = 'https://sb.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv';
const handler = require(path.join(RAIZ, 'api/admin.js'));
async function llamar(token, action, cuerpo) {
  let codigo = 0, salida = null;
  const res = { setHeader() {}, status(c) { codigo = c; return this; }, json(j) { salida = j; return this; }, end() { return this; } };
  await handler({ method: 'POST', headers: { authorization: 'Bearer ' + token }, body: Object.assign({ action }, cuerpo || {}) }, res);
  return Object.assign({ codigo }, salida);
}
const u = (nombre) => db.users.find(x => x.user_metadata.first_name === nombre);

(async () => {

grupo('2 · quién administra la gente');
{
  reiniciar();
  const m = await llamar('axel', 'createPerson', { name: 'Maria', pin: '482913', role: 'manager', locationIds: ['crown', 'wb'] });
  prueba('Axel crea a Maria, manager, con PIN', m.ok && u('Maria').password === '482913' && u('Maria').app_metadata.role === 'manager');
  prueba('sus permisos van ya calculados en su sesión', JSON.stringify(u('Maria').app_metadata.perms) === JSON.stringify(P.FABRICA.manager.perms));
  prueba('y el rol en sus dos locaciones', db.access.filter(a => a.user_id === u('Maria').id && a.role === 'manager').length === 2);
  const sam = await llamar('sam', 'listPeople');
  prueba('un usuario de correo sin rol no entra', sam.codigo === 403);
  const mar = await llamar(u('Maria').id, 'listPeople');
  prueba('un manager (sin People and roles) tampoco', mar.codigo === 403);
  const l = await llamar('axel', 'listPeople');
  prueba('la lista trae a Maria con su rol y los roles', l.ok && l.people.length === 1 && l.people[0].role === 'manager' &&
    l.roles.map(r => r.key).join() === 'owner,manager,bartender');
  const o = await llamar('axel', 'createPerson', { name: 'Olga', pin: '111222', role: 'owner', locationIds: ['crown'] });
  prueba('Axel crea a Olga, owner', o.ok && u('Olga').app_metadata.perms.length === 15);
  const lo = await llamar(u('Olga').id, 'listPeople');
  prueba('Olga (owner de PIN) sí entra', lo.ok && lo.people.length === 2);
  const otro = await llamar(u('Olga').id, 'listUsers');
  prueba('pero lo que no es People sigue siendo sólo de Axel', otro.codigo === 403);
}

grupo('3 · excepciones y roles');
{
  const id = u('Maria').id;
  const r = await llamar('axel', 'setPerson', { userId: id, off: ['editar_productos', 'ordenes'] });
  prueba('quitarle Edit items y orders a Maria', r.ok && u('Maria').app_metadata.perms.indexOf('editar_productos') < 0 &&
    u('Maria').app_metadata.perms.indexOf('ordenes') < 0 && u('Maria').app_metadata.perms.indexOf('contar') >= 0);
  prueba('y lo quitado se guarda aparte', JSON.stringify(u('Maria').app_metadata.off) === '["editar_productos","ordenes"]');
  // Axel le da "People and roles" al rol Manager: Maria lo recibe, menos sus excepciones.
  const s = await llamar('axel', 'saveRole', { key: 'manager', name: 'Manager', perms: P.FABRICA.manager.perms.concat(['personas']) });
  prueba('cambiar el rol se lo cambia a quien lo tiene', s.ok && s.people === 1 && u('Maria').app_metadata.perms.indexOf('personas') >= 0 &&
    u('Maria').app_metadata.perms.indexOf('editar_productos') < 0);
  const yo = await llamar(id, 'setPerson', { userId: id, off: [] });
  prueba('nadie se cambia sus propios permisos', !yo.ok && /own role/.test(yo.error));
  const own = await llamar(id, 'setPerson', { userId: u('Olga').id, role: 'manager' });
  prueba('un manager no le quita el Owner a nadie', own.codigo === 403);
  const rol = await llamar(id, 'saveRole', { name: 'Bar Lead', perms: ['contar'] });
  prueba('ni crea roles: eso es de Owner', rol.codigo === 403);
  const n = await llamar('axel', 'saveRole', { name: 'Bar Lead', perms: ['contar', 'recetas', 'inventado'] });
  prueba('Axel crea "Bar Lead", sin permisos inventados', n.ok && n.key === 'bar_lead' && JSON.stringify(db.roles.find(x => x.key === 'bar_lead').perms) === '["contar","recetas"]');
  const dup = await llamar('axel', 'saveRole', { name: 'bar lead', perms: [] });
  prueba('otro con el mismo nombre no', !dup.ok && /already a role/.test(dup.error));
  const c = await llamar('axel', 'setPerson', { userId: id, role: 'bar_lead' });
  prueba('cambiar de rol borra las excepciones del de antes', c.ok && u('Maria').app_metadata.role === 'bar_lead' &&
    u('Maria').app_metadata.off.length === 0 && JSON.stringify(u('Maria').app_metadata.perms) === '["contar","recetas"]' &&
    db.access.filter(a => a.user_id === id).every(a => a.role === 'bar_lead'));
  const q = await llamar('axel', 'removeRole', { key: 'bar_lead' });
  prueba('un rol en uso no se borra', !q.ok && /1 person has this role/.test(q.error));
  const f = await llamar('axel', 'removeRole', { key: 'manager' });
  prueba('los de fábrica no se borran', !f.ok);
  await llamar('axel', 'setPerson', { userId: id, role: 'manager' });
  const q2 = await llamar('axel', 'removeRole', { key: 'bar_lead' });
  prueba('sin nadie, sí', q2.ok && !db.roles.some(x => x.key === 'bar_lead'));
  const b = await llamar('axel', 'removePerson', { userId: 'sam' });
  prueba('a un usuario de correo no se le borra desde aquí', b.codigo === 404 && db.users.some(x => x.id === 'sam'));
}

grupo('3b · un permiso nuevo llega a quien ya tenía el rol (2026-11-15)');
{
  // Billie se creó antes de "Report running low": sus permisos guardados
  // no lo traen, aunque su rol (el de fábrica) sí. Al abrir People se
  // rehacen y le llega con su próxima sesión.
  // El grupo 4 sigue con lo que dejó el 3 (Maria): se guarda y se
  // devuelve al acabar.
  const guardado = JSON.parse(JSON.stringify(db));
  reiniciar();
  db.roles = db.roles.filter(r => r.key !== 'bartender');   // el de fábrica, sin guardar
  const viejos = ['ver_dinero', 'ver_ordenes', 'ver_ajustes', 'recetas'];
  db.users.push({ id: 'billie', email: 'billie@bartenders.barstockpro.com', app_metadata: { role: 'bartender', off: [], perms: viejos.slice() }, user_metadata: { first_name: 'Billie' } });
  const l = await llamar('axel', 'listPeople');
  prueba('al abrir People, Billie recibe el permiso nuevo de su rol', l.ok && u('Billie').app_metadata.perms.indexOf('avisar_bajo') >= 0, JSON.stringify(u('Billie').app_metadata.perms));
  prueba('y la lista ya lo dice', l.people.find(x => x.name === 'Billie').perms.indexOf('avisar_bajo') >= 0);
  // Sus excepciones se respetan.
  reiniciar();
  db.roles = db.roles.filter(r => r.key !== 'bartender');
  db.users.push({ id: 'leo', email: 'leo@bartenders.barstockpro.com', app_metadata: { role: 'bartender', off: ['avisar_bajo'], perms: viejos.slice() }, user_metadata: { first_name: 'Leo' } });
  await llamar('axel', 'listPeople');
  prueba('lo que se le quitó a una persona sigue quitado', u('Leo').app_metadata.perms.indexOf('avisar_bajo') < 0);
  // Un rol guardado SIN el permiso: no se inventa.
  reiniciar();
  db.users.push({ id: 'mia', email: 'mia@bartenders.barstockpro.com', app_metadata: { role: 'bartender', off: [], perms: viejos.slice() }, user_metadata: { first_name: 'Mia' } });
  db.roles.find(r => r.key === 'bartender').perms = viejos.slice();
  await llamar('axel', 'listPeople');
  prueba('si el rol guardado no lo da, no se le da', u('Mia').app_metadata.perms.indexOf('avisar_bajo') < 0);
  // Los roles sin leer: no se toca a nadie (con la lista vacía, un rol
  // creado por Axel daría "ningún permiso").
  reiniciar();
  db.users.push({ id: 'ana', email: 'ana@bartenders.barstockpro.com', app_metadata: { role: 'bar_lead', off: [], perms: ['contar', 'recetas'] }, user_metadata: { first_name: 'Ana' } });
  db.roles.push({ account_id: 'wjm-hospitality', key: 'bar_lead', name: 'Bar Lead', perms: ['contar', 'recetas'] });
  const leer = db.roles; db.roles = null;
  const l2 = await llamar('axel', 'listPeople');
  db.roles = leer;
  prueba('si los roles no se pudieron leer, no se cambia a nadie', l2.ok && JSON.stringify(u('Ana').app_metadata.perms) === '["contar","recetas"]', JSON.stringify(u('Ana').app_metadata.perms));
  Object.assign(db, guardado);
}

grupo('3c · pausar el acceso, sin borrar (Axel, 2026-11-15)');
{
  // "No eliminarlo, solamente quitarle el acceso": Supabase lo bloquea
  // al entrar (ban), y nada más cambia. Al volver, el mismo PIN.
  const id = u('Maria').id;
  const antes = JSON.stringify({ p: u('Maria').password, r: u('Maria').app_metadata.role, perms: u('Maria').app_metadata.perms,
    a: db.access.filter(x => x.user_id === id).map(x => x.location_id + x.role) });
  const r = await llamar('axel', 'setPerson', { userId: id, pausar: true });
  prueba('Axel le pausa el acceso a Maria', r.ok && !!u('Maria').banned_until, JSON.stringify(r));
  prueba('con quién y cuándo', !!(u('Maria').app_metadata.pausa && u('Maria').app_metadata.pausa.at && u('Maria').app_metadata.pausa.by === 'Axel'), JSON.stringify(u('Maria').app_metadata.pausa));
  const l = await llamar('axel', 'listPeople');
  const m = (l.people || []).find(x => x.id === id) || {};
  prueba('People lo enseña', !!m.pausado && m.pausado.by === 'Axel' && !!m.pausado.at, JSON.stringify(m.pausado));
  const yo = await llamar(id, 'setPerson', { userId: id, pausar: false });
  prueba('nadie se cambia a sí mismo el acceso', !yo.ok);
  const own = await llamar(id, 'setPerson', { userId: u('Olga').id, pausar: true });
  prueba('el de un Owner sólo lo pausa otro Owner', own.codigo === 403 && !u('Olga').banned_until);
  const v = await llamar('axel', 'setPerson', { userId: id, pausar: false });
  prueba('se le devuelve', v.ok && !u('Maria').banned_until && !u('Maria').app_metadata.pausa);
  const l2 = await llamar('axel', 'listPeople');
  prueba('y People ya no lo marca', !((l2.people || []).find(x => x.id === id) || {}).pausado);
  const despues = JSON.stringify({ p: u('Maria').password, r: u('Maria').app_metadata.role, perms: u('Maria').app_metadata.perms,
    a: db.access.filter(x => x.user_id === id).map(x => x.location_id + x.role) });
  prueba('nada más cambió: el mismo PIN, rol, permisos y locaciones', antes === despues, antes + ' / ' + despues);
}

grupo('3d · alta sin PIN: la persona crea el suyo con un código (Axel, 2026-11-16, C)');
{
  const sinSesion = (accion, cuerpo) => llamar('', accion, cuerpo);
  const c = await llamar('axel', 'createPerson', { name: 'Leo', role: 'bartender', locationIds: ['crown'] });
  const leo = () => u('Leo');
  prueba('crear sin PIN: un código de 6 dígitos y hasta cuándo vale', c.ok && /^\d{6}$/.test(c.code || '') && !!c.expira &&
    new Date(c.expira).getTime() - Date.now() > 23 * 3600e3 && new Date(c.expira).getTime() - Date.now() <= 24 * 3600e3 + 5e3, JSON.stringify(c));
  prueba('su contraseña es una al azar, no el código', !!leo() && String(leo().password || '').length >= 24 && leo().password !== c.code);
  prueba('el código no se guarda tal cual', !!leo().app_metadata.alta && JSON.stringify(leo().app_metadata).indexOf(c.code) < 0, JSON.stringify(leo().app_metadata.alta));
  let l = await llamar('axel', 'listPeople');
  prueba('People: esperando su PIN, con hasta cuándo', !!((l.people || []).find(x => x.name === 'Leo') || {}).pendiente &&
    ((l.people || []).find(x => x.name === 'Leo').pendiente.expira === c.expira));
  prueba('y sin el código en la lista', JSON.stringify(l).indexOf(c.code) < 0);

  const mal = await sinSesion('altaVerificar', { name: 'Leo', code: c.code === '000000' ? '111111' : '000000' });
  const nadie = await sinSesion('altaVerificar', { name: 'Nadie', code: c.code });
  const maria = await sinSesion('altaVerificar', { name: 'Maria', code: c.code });
  prueba('sin sesión: un código malo, un nombre que no existe y alguien con PIN contestan IGUAL',
    !mal.ok && JSON.stringify(mal) === JSON.stringify(nadie) && JSON.stringify(nadie) === JSON.stringify(maria), JSON.stringify([mal, nadie, maria]));
  const bien = await sinSesion('altaVerificar', { name: ' leo ', code: c.code });
  prueba('con el nombre y el código, sí (sin gastarlo)', bien.ok && !!leo().app_metadata.alta, JSON.stringify(bien));
  const corto = await sinSesion('altaReclamar', { name: 'Leo', code: c.code, pin: '12' });
  prueba('un PIN que no es de 6 dígitos, no', !corto.ok && /6 digits/.test(corto.error || '') && !!leo().app_metadata.alta);
  const r = await sinSesion('altaReclamar', { name: 'Leo', code: c.code, pin: '135790' });
  prueba('Leo crea su PIN', r.ok && leo().password === '135790' && !leo().app_metadata.alta, JSON.stringify(r));
  prueba('y conserva su rol y sus permisos', leo().app_metadata.role === 'bartender' && Array.isArray(leo().app_metadata.perms) && leo().app_metadata.perms.length > 0);
  const otra = await sinSesion('altaReclamar', { name: 'Leo', code: c.code, pin: '246802' });
  prueba('el código sirve una vez', !otra.ok && leo().password === '135790');
  l = await llamar('axel', 'listPeople');
  prueba('People ya no lo marca', !((l.people || []).find(x => x.name === 'Leo') || {}).pendiente);

  // Caduca, se anula con 5 intentos y se rehace desde People.
  const z = await llamar('axel', 'createPerson', { name: 'Zoe', role: 'bartender', locationIds: ['crown'] });
  u('Zoe').app_metadata.alta.exp = new Date(Date.now() - 1000).toISOString();
  prueba('caducado no sirve', !(await sinSesion('altaVerificar', { name: 'Zoe', code: z.code })).ok);
  const n = await llamar('axel', 'nuevoCodigo', { userId: u('Zoe').id });
  prueba('"Show code again" da uno nuevo', n.ok && /^\d{6}$/.test(n.code || '') && (await sinSesion('altaVerificar', { name: 'Zoe', code: n.code })).ok);
  prueba('sam (sin People) no saca códigos', (await llamar('sam', 'nuevoCodigo', { userId: u('Zoe').id })).codigo === 403);
  const otroCod = n.code === '999999' ? '888888' : '999999';
  for (let i = 0; i < 5; i++) await sinSesion('altaVerificar', { name: 'Zoe', code: otroCod });
  prueba('con 5 intentos malos, el bueno ya no sirve', !(await sinSesion('altaVerificar', { name: 'Zoe', code: n.code })).ok &&
    !(await sinSesion('altaReclamar', { name: 'Zoe', code: n.code, pin: '112233' })).ok && u('Zoe').password !== '112233');
  const n2 = await llamar('axel', 'nuevoCodigo', { userId: u('Zoe').id });
  prueba('y uno nuevo vuelve a empezar', (await sinSesion('altaVerificar', { name: 'Zoe', code: n2.code })).ok);
  const sp = await llamar('axel', 'setPerson', { userId: u('Zoe').id, pin: '445566' });
  prueba('ponerle el PIN desde People también cierra el alta', sp.ok && u('Zoe').password === '445566' && !u('Zoe').app_metadata.alta &&
    !(await sinSesion('altaVerificar', { name: 'Zoe', code: n2.code })).ok);
  prueba('sin sesión, nada más que esas dos', (await sinSesion('listPeople')).codigo === 401);
  await llamar('axel', 'removePerson', { userId: u('Zoe').id });
  await llamar('axel', 'removePerson', { userId: u('Leo').id });
}

grupo('3e · el código por correo (Axel, 2026-11-17, sobre lámina)');
{
  const sinSesion = (accion, cuerpo) => llamar('', accion, cuerpo);
  enviados.length = 0;
  const malo = await llamar('axel', 'createPerson', { name: 'Ivo', role: 'bartender', locationIds: ['crown'], email: 'ivo-at-crown' });
  prueba('un correo mal escrito: lo dice, no crea y no manda', malo.codigo === 400 && /email/i.test(malo.error || '') && !u('Ivo') && enviados.length === 0, JSON.stringify(malo));
  const c = await llamar('axel', 'createPerson', { name: 'Nia', role: 'bartender', locationIds: ['crown', 'wb'], email: ' nia@crown.test ' });
  const m = enviados[0] || {};
  prueba('crear con correo: se lo manda', c.ok && enviados.length === 1 && JSON.stringify(m.to) === '["nia@crown.test"]' && c.enviado === 'nia@crown.test', JSON.stringify(c));
  prueba('con su código (el mismo que enseña la pantalla)', /^\d{6}$/.test(c.code || '') && (m.html || '').indexOf(c.code.slice(0, 3) + ' ' + c.code.slice(3)) >= 0);
  prueba('con su tipo de cuenta, sus locaciones y quién la creó', /Bartender/.test(m.html || '') && /Crown/.test(m.html || '') && /Will(&#39;|')s &amp; Bill(&#39;|')s/.test(m.html || '') && /Axel/.test(m.html || ''), (m.html || '').length);
  prueba('el asunto, con su nombre', m.subject === 'Your BarStock account is ready, Nia', m.subject);
  prueba('desde reports@barstockpro.com', /<reports@barstockpro\.com>$/.test(m.from || ''), m.from);
  prueba('el correo se guarda para reenviar códigos', u('Nia').app_metadata.contacto === 'nia@crown.test');
  prueba('y el código sigue sirviendo', (await sinSesion('altaVerificar', { name: 'Nia', code: c.code })).ok);
  const l = await llamar('axel', 'listPeople');
  prueba('People enseña a dónde se mandó', ((l.people || []).find(x => x.name === 'Nia') || {}).contacto === 'nia@crown.test');

  enviados.length = 0;
  const n = await llamar('axel', 'nuevoCodigo', { userId: u('Nia').id, enviar: true });
  prueba('"Email a new code": uno nuevo, al correo guardado', n.ok && enviados.length === 1 && JSON.stringify(enviados[0].to) === '["nia@crown.test"]' &&
    (enviados[0].html || '').indexOf(n.code.slice(0, 3) + ' ' + n.code.slice(3)) >= 0 && n.enviado === 'nia@crown.test', JSON.stringify(n));
  prueba('y el de antes ya no sirve', n.code === c.code || !(await sinSesion('altaVerificar', { name: 'Nia', code: c.code })).ok);

  enviados.length = 0;
  const z = await llamar('axel', 'createPerson', { name: 'Zed', role: 'bartender', locationIds: ['crown'] });
  const sin = await llamar('axel', 'nuevoCodigo', { userId: u('Zed').id, enviar: true });
  prueba('sin correo guardado ni dado: lo dice y no manda', sin.codigo === 400 && /email/i.test(sin.error || '') && enviados.length === 0, JSON.stringify(sin));
  prueba('sin correo, crear no manda nada', z.ok && !z.enviado && enviados.length === 0);

  fallaResend = 'domain not verified';
  const f = await llamar('axel', 'createPerson', { name: 'Fay', role: 'bartender', locationIds: ['crown'], email: 'fay@crown.test' });
  fallaResend = null;
  prueba('si el envío falla: la crea igual, lo dice, y el código sigue en pantalla', f.ok && !!u('Fay') && /domain not verified/.test(f.envioError || '') && !f.enviado && /^\d{6}$/.test(f.code || ''), JSON.stringify(f));

  enviados.length = 0;
  const p = await llamar('axel', 'createPerson', { name: 'Pia', role: 'bartender', locationIds: ['crown'], pin: '121212', email: 'pia@crown.test' });
  prueba('con "Set it now" no se manda código (no hay)', p.ok && enviados.length === 0 && !p.enviado);
  // Quien crea sin nombre en su sesión (Axel es cuenta de correo): el que
  // manda la app, el mismo del saludo del Home. Con nombre, el suyo.
  const axel = db.users.find(x => x.id === 'axel'); const meta = axel.user_metadata; axel.user_metadata = {};
  enviados.length = 0;
  await llamar('axel', 'createPerson', { name: 'Ole', role: 'bartender', locationIds: ['crown'], email: 'ole@crown.test', quien: 'Axel' });
  prueba('sin nombre en la sesión, firma con el del perfil', /See you in the app,<br><strong>Axel<\/strong>/.test((enviados[0] || {}).html || '') && !/BarStock just set up/.test((enviados[0] || {}).html || ''));
  axel.user_metadata = meta;
  enviados.length = 0;
  await llamar('axel', 'nuevoCodigo', { userId: u('Ole').id, enviar: true, quien: 'Otro' });
  prueba('con nombre en la sesión, manda el suyo', /<strong>Axel<\/strong>/.test((enviados[0] || {}).html || '') && !/Otro/.test((enviados[0] || {}).html || ''));
  await llamar('axel', 'removePerson', { userId: u('Ole').id });
  for (const x of ['Nia', 'Zed', 'Fay', 'Pia']) await llamar('axel', 'removePerson', { userId: u(x).id });
}

grupo('4 · el servidor de las integraciones');
{
  const I = require(path.join(RAIZ, 'lib/integracion.js'));
  const sesion = I.sesion || I._sesion;
  if (typeof sesion !== 'function') { prueba('lib/integracion.js exporta sesion', false, Object.keys(I).join(',')); }
  else {
    const pide = (token, action) => sesion({ headers: { authorization: 'Bearer ' + token }, body: { action } });
    await llamar('axel', 'createPerson', { name: 'Billie', pin: '324324', role: 'bartender', locationIds: ['crown'] });
    prueba('Billie (bartender): sync no', (await pide(u('Billie').id, 'sync') || {}).code === 403);
    prueba('Billie: send no', (await pide(u('Billie').id, 'send') || {}).code === 403);
    prueba('Billie: leer sí', (await pide(u('Billie').id, 'sales')) === null);
    prueba('Maria (manager): sync sí', (await pide(u('Maria').id, 'sync')) === null);
    await llamar('axel', 'setPerson', { userId: u('Maria').id, off: ['sincronizar'] });
    prueba('Maria sin Sync: sync no', (await pide(u('Maria').id, 'sync') || {}).code === 403);
    prueba('Sam (correo, sin rol): todo, como hasta hoy', (await pide('sam', 'sync')) === null);
  }
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
