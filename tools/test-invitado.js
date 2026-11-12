#!/usr/bin/env node
/*
 * ── El bartender invitado: ve todo, sólo escribe recetas ─────────────
 *
 * Axel, 2026-11-12: "puede seguir viendo todo, absolutamente toda la
 * información, pero no puede editar nada que no son las recetas".
 *
 *   1. Nombre → correo: lo mismo en el login y en api/admin.js
 *      (src/bartender-id.js, un solo archivo para los dos).
 *   2. La regla (BarStockGuest.permitido): leer siempre; escribir sólo
 *      recetas, el "Not a drink" de Recipes y la sesión. Nada de
 *      inventario, pedidos, conteos, ajustes, ni /api/ que mande o cargue.
 *   3. El candado en fetch: para un invitado, lo negado no sale y vuelve
 *      un 403 con el mensaje; para cualquier otro, todo sale como antes.
 *   4. supabase-js pasa por el candado (su fetch es el de window al
 *      llamar, no el de cuando nació).
 *   5. El servidor también niega a un bartender las acciones que
 *      escriben (sync) o mandan (send) en api/integrations.js.
 *   6. El orden de carga: el candado antes que nada que escriba.
 *
 *   node tools/test-invitado.js
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

const SB = 'https://abcdxyz.supabase.co';
function entorno(rol) {
  const w = new JSDOM('<!doctype html><body></body>', { url: 'https://app.barstockpro.com/', runScripts: 'outside-only' }).window;
  w.__salio = [];
  w.Response = Response;
  // El fetch "de verdad": apunta lo que sale.
  w.fetch = async (u, o) => { w.__salio.push([String((o && o.method) || 'GET').toUpperCase(), String(u)]); return new Response('[]', { status: 200 }); };
  if (rol !== undefined) {
    w.localStorage.setItem('sb-abcdxyz-auth-token', JSON.stringify({
      access_token: 't', user: { id: 'u1', email: 'billie@bartenders.barstockpro.com',
        app_metadata: rol ? { role: rol } : {}, user_metadata: { first_name: 'Billie' } } }));
  }
  w.eval(leer('src/bartender-id.js'));
  w.eval(leer('src/guest.js'));
  return w;
}

(async () => {
  grupo('1 · nombre → correo, uno solo para el login y el servidor');
  {
    const ID = require(path.join(RAIZ, 'src/bartender-id.js'));
    prueba('Billie → billie@bartenders.barstockpro.com', ID.correo('Billie') === 'billie@bartenders.barstockpro.com', ID.correo('Billie'));
    prueba('sin mayúsculas, espacios ni acentos', ID.correo('  Mary Jo ') === ID.correo('maryjo') && ID.clave('José') === 'jose');
    prueba('un nombre sin letras ni números no da correo', ID.correo('!!') === '' && !ID.nombreValido('  '));
    prueba('PIN: exactamente seis dígitos', ID.pinValido('324324') && !ID.pinValido('32432') && !ID.pinValido('3243245') && !ID.pinValido('32a324'));
    const w = entorno();
    prueba('en el navegador, el mismo módulo', w.BarStockBartenderId.correo('Billie') === ID.correo('Billie'));
  }

  grupo('2 · la regla: qué puede escribir un invitado');
  {
    const G = entorno('bartender').BarStockGuest;
    const p = (u, m, b) => G.permitido(u, m, b === undefined ? undefined : JSON.stringify(b));
    prueba('leer, todo', p(SB + '/rest/v1/inventory_items?select=*', 'GET'));
    prueba('las recetas: crear, cambiar y borrar', p(SB + '/rest/v1/toast_recipes', 'POST', {}) &&
      p(SB + '/rest/v1/toast_recipe_lines?id=eq.3', 'PATCH', {}) && p(SB + '/rest/v1/toast_recipe_lines?id=eq.3', 'DELETE'));
    prueba('"Not a drink": una fila ignored de licor', p(SB + '/rest/v1/toast_item_links?on_conflict=location_id,toast_item_guid', 'POST',
      [{ toast_item_guid: 'g', kind: 'liquor', status: 'ignored', item_name: null }]));
    prueba('pero NO emparejar un vino o un licor', !p(SB + '/rest/v1/toast_item_links', 'POST', [{ kind: 'wine', status: 'linked', item_name: 'X' }]) &&
      !p(SB + '/rest/v1/toast_item_links', 'POST', [{ kind: 'liquor', status: 'linked', item_name: 'X' }]) &&
      !p(SB + '/rest/v1/toast_item_links?id=eq.1', 'PATCH', { status: 'ignored', kind: 'liquor' }));
    prueba('el inventario no: ni insertar, ni cambiar, ni borrar', !p(SB + '/rest/v1/inventory_items', 'POST', []) &&
      !p(SB + '/rest/v1/inventory_items?id=eq.1', 'PATCH', {}) && !p(SB + '/rest/v1/inventory_items?location_id=eq.l', 'DELETE'));
    prueba('ni pedidos, conteos, snapshots, ajustes ni facturas', ['vendor_orders', 'weekly_snapshots', 'count_sessions', 'location_settings', 'invoice_order_links']
      .every(t => !p(SB + '/rest/v1/' + t, 'POST', {})));
    prueba('ni una función de la base (rpc)', !p(SB + '/rest/v1/rpc/increment_po_counter', 'POST', {}));
    prueba('la sesión sí: entrar, renovar, salir', p(SB + '/auth/v1/token?grant_type=password', 'POST', {}) && p(SB + '/auth/v1/logout', 'POST'));
    prueba('pero no cambiarse el PIN', !p(SB + '/auth/v1/user', 'PUT', { password: '111111' }));
    prueba('no manda pedidos ni informes (aunque sea a otro dominio)', !p('https://barstock-app.vercel.app/api/send-order', 'POST', {}) &&
      !p('/api/send-cost-report', 'POST', {}) && !p('/api/backup', 'POST', {}) && !p('/api/admin', 'POST', {}) && !p('/api/marginedge', 'POST', {}));
    prueba('integrations: lee (menú, vinos, ventas), no carga ni manda', p('/api/integrations?provider=toast', 'POST', { action: 'wine' }) &&
      !p('/api/integrations?provider=toast', 'POST', { action: 'sync' }) && !p('/api/integrations?provider=report', 'POST', { action: 'send' }));
    prueba('lo que no se puede leer, no se adivina: no sale', !p('/api/integrations?provider=toast', 'POST', undefined));
  }

  grupo('3 · el candado en fetch');
  {
    let w = entorno('bartender');
    prueba('un invitado se sabe desde la sesión guardada', w.BarStockGuest.activo() && w.BarStockGuest.nombre() === 'Billie');
    prueba('y <html> lleva la marca desde el principio', w.document.documentElement.classList.contains('bs-guest'));
    let r = await w.fetch(SB + '/rest/v1/inventory_items?location_id=eq.l', { method: 'DELETE' });
    prueba('borrar el inventario no sale', !w.__salio.some(x => /inventory_items/.test(x[1])), JSON.stringify(w.__salio));
    const cuerpo = await r.json();
    prueba('y vuelve un 403 que dice por qué', r.status === 403 && cuerpo.message === 'Guests can only edit recipes.');
    await w.fetch(SB + '/rest/v1/toast_recipes', { method: 'POST', body: '{}' });
    await w.fetch(SB + '/rest/v1/inventory_items?select=*');
    prueba('las recetas y las lecturas sí salen', w.__salio.length === 2, JSON.stringify(w.__salio));

    w = entorno('staff');
    await w.fetch(SB + '/rest/v1/inventory_items?location_id=eq.l', { method: 'DELETE' });
    prueba('otro rol: todo sale como siempre', w.__salio.length === 1 && !w.document.documentElement.classList.contains('bs-guest'));
    w = entorno();
    await w.fetch('/api/send-order', { method: 'POST', body: '{}' });
    prueba('sin sesión (el login): todo sale', w.__salio.length === 1 && !w.BarStockGuest.activo());
  }

  grupo('4 · supabase-js pasa por el candado');
  {
    const src = leer('src/supabase-client.js');
    prueba('createClient recibe un fetch que llama a window.fetch al usarse', /global:\s*\{\s*fetch:\s*\(\.\.\.a\)\s*=>\s*window\.fetch\(\.\.\.a\)/.test(src));
    const w = entorno('bartender');
    let opciones = null;
    w.BARSTOCK_CONFIG = { SUPABASE_URL: SB, SUPABASE_KEY: 'k' };
    w.supabase = { createClient: (u, k, o) => { opciones = o; return {}; } };
    w.eval(src);
    w.BarStockSupabase.getClient();
    await opciones.global.fetch(SB + '/rest/v1/vendor_orders', { method: 'POST', body: '{}' });
    prueba('una escritura de supabase-js de un invitado no sale', !w.__salio.length, JSON.stringify(w.__salio));
  }

  grupo('5 · el servidor también se lo niega');
  {
    const rutaSb = require.resolve('@supabase/supabase-js', { paths: [RAIZ] });
    let rol = 'bartender';
    require.cache[rutaSb] = { id: rutaSb, filename: rutaSb, loaded: true, exports: {
      createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u', app_metadata: { role: rol } } }, error: null }) } })
    } };
    const { sesion } = require(path.join(RAIZ, 'lib/integracion.js'));
    const req = (accion) => ({ headers: { authorization: 'Bearer x' }, body: { action: accion } });
    const a = await sesion(req('sync')), b = await sesion(req('send')), c = await sesion(req('wine'));
    prueba('bartender: sync y send → 403', a && a.code === 403 && b && b.code === 403);
    prueba('bartender: leer pasa', c === null);
    rol = undefined;
    prueba('otro usuario: sync pasa', (await sesion(req('sync'))) === null);
  }

  grupo('6 · el orden de carga');
  {
    const idx = leer('index.html');
    const pos = f => idx.indexOf('src="src/' + f);
    prueba('bartender-id.js y guest.js están cargados', pos('bartender-id.js') > 0 && pos('guest.js') > 0);
    prueba('el nombre antes que el candado', pos('bartender-id.js') < pos('guest.js'));
    prueba('el candado justo después de config.js, antes de supabase-client.js', pos('config.js') < pos('guest.js') && pos('guest.js') < pos('supabase-client.js') &&
      pos('guest.js') < pos('location-access.js'));
  }

  console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
