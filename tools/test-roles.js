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
  prueba('catorce permisos, sin repetir', P.TODOS.length === 14 && new Set(P.TODOS).size === 14);
  prueba('Owner: todo', P.efectivos('owner', [], ['contar']).length === 14);
  const man = P.efectivos('manager', [], []);
  prueba('Manager de fábrica: sin ajustes de la locación, Time Machine ni gente',
    man.indexOf('ajustes_locacion') < 0 && man.indexOf('time_machine') < 0 && man.indexOf('personas') < 0 && man.indexOf('contar') >= 0);
  prueba('las excepciones se restan', P.efectivos('manager', [], ['editar_productos']).indexOf('editar_productos') < 0);
  prueba('el guardado manda sobre el de fábrica', JSON.stringify(P.efectivos('manager', [{ key: 'manager', perms: ['contar', 'raro'] }], [])) === '["contar"]');
  prueba('un rol que ya no existe no da nada', P.efectivos('fantasma', [], []).length === 0);
  prueba('usuario de correo sin rol: todo, como hasta hoy', P.deUsuario({ app_metadata: {} }).length === 14);
  // Un 'staff' viejo, sin perms: con [] quedaba bajo el candado de recetas.
  prueba('un rol viejo que no salió de aquí: todo, como hasta hoy', P.deUsuario({ app_metadata: { role: 'staff' } }).length === 14);
  prueba('bartender de antes de los roles: ver y recetas', JSON.stringify(P.deUsuario({ app_metadata: { role: 'bartender' } })) ===
    JSON.stringify(['ver_dinero', 'ver_ordenes', 'ver_ajustes', 'recetas']));
  prueba('con perms guardados, esos', JSON.stringify(P.deUsuario({ app_metadata: { role: 'manager', perms: ['contar'] } })) === '["contar"]');
  prueba('sólo recetas = el candado del bartender', P.soloRecetas(P.FABRICA.bartender.perms) && !P.soloRecetas(['recetas', 'contar']));
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
      updateUserById: async (id, o) => { const u = db.users.find(x => x.id === id); Object.assign(u, o); return { data: { user: u }, error: null }; },
      deleteUser: async (id) => { db.users = db.users.filter(u => u.id !== id); return { error: null }; }
    }
  }
}) } };
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
  prueba('Axel crea a Olga, owner', o.ok && u('Olga').app_metadata.perms.length === 14);
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
