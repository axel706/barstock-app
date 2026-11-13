#!/usr/bin/env node
/*
 * ── Bartenders: nombre y PIN, desde el teléfono ──────────────────────
 *
 * Axel, 2026-11-12, opción A: Settings › People › Bartenders. Lo que no
 * puede volver a pasar:
 *
 *   1. El servidor (api/admin.js):
 *      · sólo Axel crea, cambia o quita bartenders;
 *      · un bartender nace con app_metadata.role = 'bartender' (lo que
 *        lo hace invitado), el correo sacado de su nombre con el MISMO
 *        archivo del login, y el PIN de contraseña;
 *      · dos Billie no: el login no sabría cuál;
 *      · cambiar el PIN o quitar a alguien sólo funciona con bartenders:
 *        un id equivocado no toca a Axel ni a nadie del equipo;
 *      · quitar borra de verdad (el nombre queda libre).
 *   2. La pantalla: lista, crear (el PIN se enseña UNA vez), locaciones
 *      que se guardan al tocar, Change PIN, Remove con dos toques; y un
 *      fallo se dice tal cual.
 *   3. People sólo sale para Axel.
 *
 *   node tools/test-bartenders.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);
const esperar = ms => new Promise(r => setTimeout(r, ms));

// ── Un Supabase de mentira, con usuarios ───────────────────────────────
const AXEL = 'axeltorressalgado@icloud.com';
const db = { users: [], access: [], borrados: [] };
function reiniciar() {
  db.users = [
    { id: 'axel', email: AXEL, app_metadata: {}, user_metadata: { first_name: 'Axel' } },
    { id: 'sam', email: 'sam@crown.com', app_metadata: {}, user_metadata: { first_name: 'Sam' } }
  ];
  db.access = [{ user_id: 'sam', location_id: 'crown', role: 'staff' }];
  db.borrados = [];
}
function tabla(nombre) {
  const filtros = [];
  const q = {
    select: () => q, order: () => q,
    eq: (c, v) => { filtros.push(r => r[c] === v); return q; },
    in: (c, v) => { filtros.push(r => v.includes(r[c])); return q; },
    delete: () => { q._borrar = true; return q; },
    update: (o) => { q._cambio = o; return q; },
    insert: async (filas) => { db.access.push(...filas); return { error: null }; },
    then: (res) => {
      // `roles` vacía: la migración 039 sin correr; salen los de fábrica.
      const filas = nombre === 'locations' ? [{ id: 'crown', name: 'Crown', account_id: 'wjm-hospitality' }, { id: 'wb', name: "Will's & Bill's", account_id: 'wjm-hospitality' }]
        : nombre === 'roles' ? [] : db.access;
      if (q._borrar) { db.access = db.access.filter(r => !filtros.every(f => f(r))); return res({ error: null }); }
      if (q._cambio) { db.access.filter(r => filtros.every(f => f(r))).forEach(r => Object.assign(r, q._cambio)); return res({ error: null }); }
      return res({ data: filas.filter(r => filtros.every(f => f(r))), error: null });
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
      deleteUser: async (id, suave) => { db.borrados.push({ id, suave: !!suave }); db.users = db.users.filter(u => u.id !== id); return { error: null }; }
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

(async () => {
  grupo('1 · el servidor');
  {
    reiniciar();
    const r0 = await llamar('sam', 'createBartender', { name: 'Billie', pin: '324324', locationIds: ['wb'] });
    prueba('sólo Axel: otro usuario → 403 y nada creado', r0.codigo === 403 && db.users.length === 2);

    const r = await llamar('axel', 'createBartender', { name: 'Billie', pin: '324324', locationIds: ['wb'] });
    const b = db.users.find(u => u.email === 'billie@bartenders.barstockpro.com');
    prueba('crea a Billie con el correo del login y el PIN de contraseña', r.ok && !!b && b.password === '324324', JSON.stringify(r));
    prueba('invitado: app_metadata.role = bartender (lo que lee guest.js)', b && b.app_metadata.role === 'bartender');
    prueba('con su nombre y acceso a su locación, rol bartender', b && b.user_metadata.first_name === 'Billie' &&
      db.access.some(a => a.user_id === b.id && a.location_id === 'wb' && a.role === 'bartender'));

    const r2 = await llamar('axel', 'createBartender', { name: '  billie ', pin: '111111', locationIds: ['crown'] });
    prueba('otro "billie" no: lo dice', !r2.ok && /already someone called billie/i.test(r2.error) && db.users.length === 3, r2.error);
    const r3 = await llamar('axel', 'createBartender', { name: 'Marco', pin: '12345', locationIds: ['crown'] });
    const r4 = await llamar('axel', 'createBartender', { name: 'Marco', pin: '123456', locationIds: [] });
    prueba('PIN de 5 dígitos o sin locación: no crea', !r3.ok && /6 digits/.test(r3.error) && !r4.ok && /location/.test(r4.error) && db.users.length === 3);

    const l = await llamar('axel', 'listBartenders');
    prueba('la lista trae sólo bartenders, con sus locaciones', l.ok && l.bartenders.length === 1 && l.bartenders[0].name === 'Billie' &&
      l.bartenders[0].access[0].name === "Will's & Bill's", JSON.stringify(l));

    const p1 = await llamar('axel', 'setBartender', { userId: b.id, pin: '999000' });
    prueba('cambiar el PIN de Billie', p1.ok && b.password === '999000');
    const p2 = await llamar('axel', 'setBartender', { userId: 'sam', pin: '999000' });
    const p3 = await llamar('axel', 'setBartender', { userId: 'axel', pin: '999000' });
    prueba('pero no el de Sam (staff) ni el de Axel', !p2.ok && p2.codigo === 404 && !p3.ok && !db.users.find(u => u.id === 'axel').password);
    const p4 = await llamar('axel', 'setBartender', { userId: b.id, locationIds: ['crown', 'wb'] });
    prueba('las locaciones se reemplazan, con rol bartender', p4.ok && db.access.filter(a => a.user_id === b.id).length === 2 &&
      db.access.filter(a => a.user_id === b.id).every(a => a.role === 'bartender'));
    const p5 = await llamar('axel', 'setBartender', { userId: b.id, locationIds: [] });
    prueba('sin ninguna locación no se guarda', !p5.ok && db.access.filter(a => a.user_id === b.id).length === 2);

    const q1 = await llamar('axel', 'removeBartender', { userId: 'sam' });
    prueba('quitar a Sam (staff) por este camino: no', !q1.ok && db.users.some(u => u.id === 'sam'));
    const q2 = await llamar('axel', 'removeBartender', { userId: b.id });
    prueba('quitar a Billie: fuera, con su acceso', q2.ok && !db.users.some(u => u.id === b.id) && !db.access.some(a => a.user_id === b.id));
    prueba('borrado de verdad (no suave): el nombre queda libre', db.borrados.length === 1 && db.borrados[0].suave === false);
    const r5 = await llamar('axel', 'createBartender', { name: 'Billie', pin: '324324', locationIds: ['wb'] });
    prueba('y se puede volver a crear otro Billie', r5.ok);
  }

  grupo('2 · la pantalla');
  {
    const w = new JSDOM('<!doctype html><body></body>', { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
    w.BARSTOCK_CONFIG = { LOCATION_NAME: "Will's & Bill's", ADMIN_EMAIL: AXEL };
    w.__avisos = [];
    w.BarStockToast = { show: t => w.__avisos.push(String(t)) };
    w.__atras = null;
    w.BarStockMobile = { alVolverBanda: (fn) => { w.__atras = fn; } };
    w.__copiado = null;
    w.BarStockDevPanel = { copiar: async (t) => { w.__copiado = t; return true; } };
    w.eval(leer('src/bartender-id.js'));
    w.eval(leer('src/permisos.js'));
    // La API de verdad del servidor, por la mentira de arriba.
    reiniciar();
    let fallar = null;
    w.BarStockAdminApi = { llamar: async (a, p) => {
      if (fallar === a) return { ok: false, error: 'boom from Supabase' };
      const r = await llamar('axel', a, p); return JSON.parse(JSON.stringify(r));
    }, soyAdmin: () => true };
    w.eval(leer('src/mobile-bartenders.js'));
    const host = w.document.createElement('div'); w.document.body.appendChild(host);
    await w.BarStockMobileBartenders.montar(host, (t) => '<div class="cab">' + t + '</div>', () => {});
    const q = s => host.querySelector(s);
    prueba('sin nadie: lo dice, y el botón para agregar', /No one yet/.test(host.textContent) && !!q('#btNuevo'));

    q('#btNuevo').click();
    prueba('Add person: nombre, PIN ya generado y la locación abierta marcada', !!q('#btNom') && /^\d{6}$/.test(q('#btPin').value) &&
      q('[data-nl="wb"]').classList.contains('on') && !q('[data-nl="crown"]').classList.contains('on'));
    // Bartender de entrada: el rol que menos puede.
    prueba('el rol, Bartender de entrada', q('[data-nr="bartender"]').classList.contains('on') && !!q('[data-nr="manager"]'));
    prueba('el atrás de la banda vuelve a la lista', typeof w.__atras === 'function');
    q('#btCrear').click(); await esperar(30);
    prueba('sin nombre: lo dice y no crea', /Enter a name/.test(host.textContent) && db.users.length === 2);
    const nom = q('#btNom'); nom.value = 'Billie'; nom.dispatchEvent(new w.Event('input'));
    prueba('el botón dice a quién crea', q('#btCrear').textContent === 'Create Billie');
    const pin = q('#btPin'); pin.value = '32a4-324'; pin.dispatchEvent(new w.Event('input'));
    prueba('el PIN sólo acepta dígitos', pin.value === '324324', pin.value);
    q('#btCrear').click(); await esperar(40);
    prueba('crea a Billie de verdad', db.users.some(u => u.email === 'billie@bartenders.barstockpro.com' && u.password === '324324'));
    prueba('y enseña el PIN, una vez, con su nombre y locación', /Billie can sign in now/.test(host.textContent) && /324324/.test(q('.m-bt-ok').textContent) &&
      /Will's & Bill's/.test(q('.m-bt-ok').textContent));
    q('#btCopiar').click(); await esperar(10);
    prueba('Copy name and PIN copia los dos', /Billie/.test(w.__copiado) && /324324/.test(w.__copiado));
    prueba('Billie ya está en la lista', !!q('[data-b]') && /Billie/.test(q('[data-b]').textContent));

    q('[data-b]').click();
    prueba('al salir y volver, el PIN ya no se ve', !/324324/.test(host.textContent));
    q('[data-fl="crown"]').click(); await esperar(30);
    const id = db.users.find(u => u.user_metadata.first_name === 'Billie').id;
    prueba('tocar una locación la guarda', db.access.filter(a => a.user_id === id).map(a => a.location_id).sort().join() === 'crown,wb');
    // Axel, 2026-11-13: "lo selecciono, me salgo, regreso y solamente
    // tiene acceso a la locación original". Se guardaba; lo que volvía
    // era la lista leída al entrar, y la ficha se abría con ella.
    w.__atras(); await esperar(30);
    const fila = q('[data-b]');
    prueba('al volver a la lista, dice las dos locaciones', !!fila && /Crown/.test(fila.textContent) && /Will's & Bill's/.test(fila.textContent),
      fila && fila.textContent.replace(/\s+/g, ' '));
    fila.click();
    prueba('y al abrirla otra vez, las dos marcadas', q('[data-fl="crown"]').classList.contains('on') && q('[data-fl="wb"]').classList.contains('on'));

    // ── La lista entera de permisos (3A) ─────────────────────────────
    const sw = (k) => q('[data-fp="' + k + '"]');
    prueba('3A: todos los permisos, con su interruptor', host.querySelectorAll('[data-fp]').length === 14);
    prueba('lo que da el rol, encendido; lo que no, gris y quieto', sw('recetas').classList.contains('on') && !sw('recetas').disabled &&
      !sw('contar').classList.contains('on') && sw('contar').disabled && /Not in Bartender/.test(sw('contar').parentNode.textContent));
    prueba('Money y Orders: "Soon", sin poder tocarse', sw('ver_dinero').disabled && /Soon/.test(sw('ver_dinero').parentNode.textContent));
    sw('recetas').click(); await esperar(30);
    const billie = () => db.users.find(u => u.id === id);
    prueba('apagar uno se guarda sólo para Billie', billie().app_metadata.off.join() === 'recetas' && billie().app_metadata.perms.indexOf('recetas') < 0 &&
      !sw('recetas').classList.contains('on') && /Off for Billie/i.test(sw('recetas').parentNode.textContent));
    sw('recetas').click(); await esperar(30);
    prueba('y encenderlo se lo devuelve', billie().app_metadata.off.length === 0 && billie().app_metadata.perms.indexOf('recetas') >= 0);
    q('[data-fr="manager"]').click(); await esperar(40);
    prueba('cambiarla a Manager: su rol y sus permisos nuevos', billie().app_metadata.role === 'manager' &&
      billie().app_metadata.perms.indexOf('contar') >= 0 && sw('contar').classList.contains('on') && !sw('contar').disabled);
    q('[data-fr="bartender"]').click(); await esperar(40);
    prueba('y de vuelta a Bartender', billie().app_metadata.role === 'bartender' && billie().app_metadata.perms.indexOf('contar') < 0);
    q('[data-fl="crown"]').click(); await esperar(30); q('[data-fl="wb"]').click(); await esperar(30);
    prueba('quitarle la última no: lo dice y no la quita', /at least one location/.test(host.textContent) &&
      db.access.some(a => a.user_id === id && a.location_id === 'wb'));

    fallar = 'setPerson';
    q('[data-fl="crown"]').click(); await esperar(30);
    prueba('un fallo se dice tal cual y la píldora vuelve atrás', /Not saved: boom from Supabase/.test(host.textContent) && !q('[data-fl="crown"]').classList.contains('on'));
    fallar = null;

    q('#btPinCambiar').click();
    const np = q('#btPin'); np.value = '555111'; np.dispatchEvent(new w.Event('input'));
    q('#btPinGuardar').click(); await esperar(40);
    prueba('Change PIN: lo cambia y lo enseña una vez', db.users.find(u => u.id === id).password === '555111' && /555111/.test(host.textContent));

    q('[data-b]').click();
    q('#btQuitar').click();
    prueba('Remove pide un segundo toque', /Tap again to remove Billie/.test(host.textContent) && db.users.some(u => u.id === id));
    q('#btQuitar').click(); await esperar(40);
    prueba('al segundo, Billie ya no existe', !db.users.some(u => u.id === id) && /No one yet/.test(host.textContent) &&
      w.__avisos.some(t => /can no longer sign in/.test(t)));

    // ── La pestaña Roles ──────────────────────────────────────────────
    q('[data-tab="roles"]').click();
    const rs = [...host.querySelectorAll('[data-r]')].map(b => b.dataset.r).join();
    prueba('Roles: Owner, Manager y Bartender', rs === 'owner,manager,bartender', rs);
    q('[data-r="owner"]').click();
    prueba('Owner: todo encendido, nada se toca, sin Save', host.querySelectorAll('[data-rp].on').length === 14 &&
      [...host.querySelectorAll('[data-rp]')].every(b => b.disabled) && !q('#ppRolGuardar'));
    w.__atras(); await esperar(30);
    q('[data-tab="roles"]').click(); q('[data-r="manager"]').click();
    prueba('Manager: se edita (Axel es Owner) y dice a cuántos cambia', !!q('#ppRolGuardar') && !q('[data-rp="time_machine"]').disabled &&
      !q('[data-rp="time_machine"]').classList.contains('on') && /0 people have this role/.test(host.textContent));
  }

  grupo('3 · People sólo para Axel');
  {
    const src = leer('src/mobile-settings.js');
    prueba('People es un grupo marcado admin', /t: 'People', admin: true/.test(src));
    prueba('el menú filtra por BarStockAdminApi.soyAdmin()', /grupos\(\)\.map/.test(src) && /!g\.admin \|\| admin/.test(src));
    const w = new JSDOM('', { url: 'https://x.test', runScripts: 'outside-only' }).window;
    w.BARSTOCK_CONFIG = { ADMIN_EMAIL: AXEL };
    w.eval(leer('src/admin-api.js'));
    w.__bsUserEmail = 'sam@crown.com';
    const noSam = !w.BarStockAdminApi.soyAdmin();
    w.__bsUserEmail = 'AxelTorresSalgado@icloud.com';
    prueba('soyAdmin: Sam no, Axel sí (sin importar mayúsculas)', noSam && w.BarStockAdminApi.soyAdmin());
    const idx = leer('index.html');
    prueba('admin-api.js se carga antes que quien la usa', idx.indexOf('src/admin-api.js') < idx.indexOf('src/mobile-bartenders.js') &&
      idx.indexOf('src/admin-api.js') < idx.indexOf('src/admin-panel.js') && idx.indexOf('src/mobile-bartenders.js') < idx.indexOf('src/mobile-settings.js'));
    prueba('el panel del escritorio usa la misma llamada', /BarStockAdminApi\.llamar/.test(leer('src/admin-panel.js')) && !/fetch\('\/api\/admin'/.test(leer('src/admin-panel.js')));
  }

  console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
