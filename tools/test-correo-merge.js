#!/usr/bin/env node
/*
 * ── El buzón único de correo ─────────────────────────────────────────
 *
 * Vercel Hobby permite DOCE funciones serverless por despliegue y las
 * doce estaban ocupadas. `api/contact.js` se mudó a `lib/mail-contact.js`
 * —donde no cuenta— y ahora lo atiende el despachador de `api/notify.js`.
 *
 * Esto no es un test de estructura: carga el despachador de verdad y le
 * mete peticiones falsas para ver a dónde van. Lo que NO puede probar es
 * que Resend entregue un correo; eso solo se sabe en producción, y por
 * eso este merge se hizo con el formulario de la landing y los avisos de
 * login, que si fallan no bloquean a nadie, y no con `send-order`.
 *
 * Lo que hay que proteger:
 *
 *   1. Que no se pase de 12 funciones. Es el techo que nos trajo aquí.
 *   2. Que /api/contact siga respondiendo. La landing es OTRO despliegue
 *      y tiene la URL escrita a pelo: no se actualizan a la vez, así que
 *      la URL vieja tiene que seguir viva vía rewrite.
 *   3. Que el preflight de contacto conserve su lista blanca de
 *      orígenes. El OPTIONS genérico del despachador contesta con
 *      Allow-Origin:*, y si se lo come a contacto, el endpoint queda de
 *      trampolín para mandar correo desde el dominio.
 *   4. Que login y signup sigan exactamente donde estaban.
 *
 *   node tools/test-correo-merge.js
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

// ── Una respuesta de mentira, para ver qué contesta el despachador ──
function resFalsa() {
  const r = {
    code: null, cuerpo: null, cabeceras: {}, terminada: false,
    setHeader(k, v) { this.cabeceras[k.toLowerCase()] = v; return this; },
    status(c) { this.code = c; return this; },
    json(o) { this.cuerpo = o; this.terminada = true; return this; },
    end() { this.terminada = true; return this; }
  };
  return r;
}

grupo('el techo de doce funciones');
{
  const api = fs.readdirSync(path.join(RAIZ, 'api')).filter(f => f.endsWith('.js'));
  prueba('no pasa de 12', api.length <= 12, api.length + ' funciones');

  // Esto es lo que el merge vino a conseguir. Si vuelve a 12, alguien
  // añadió algo y el siguiente despliegue con una integración revienta.
  prueba('queda al menos una libre', api.length <= 11,
    api.length + ' de 12 — sin hueco para api/oauth.js');

  prueba('api/contact.js ya no está', !api.includes('contact.js'),
    'sigue en api/, la ranura no se liberó');
  prueba('lib/mail-contact.js sí está',
    fs.existsSync(path.join(RAIZ, 'lib', 'mail-contact.js')));
}

grupo('la URL vieja sigue viva');
{
  const vj = path.join(RAIZ, 'vercel.json');
  prueba('vercel.json existe', fs.existsSync(vj));

  let cfg = null;
  try { cfg = JSON.parse(leer('vercel.json')); } catch (e) {}
  prueba('es JSON válido', !!cfg);

  const rw = (cfg && cfg.rewrites) || [];
  const r = rw.find(x => x.source === '/api/contact');
  prueba('hay rewrite para /api/contact', !!r,
    JSON.stringify(rw));
  prueba('apunta al despachador con su tipo',
    !!r && r.destination === '/api/notify?type=contact',
    r ? r.destination : '(ninguno)');

  // La landing es otro repo y otro despliegue: tiene la URL escrita a
  // pelo y no se actualiza a la vez que la app.
  const land = '/Users/aj/Desktop/barstockpro-landing/index.html';
  if (fs.existsSync(land)) {
    const l = fs.readFileSync(land, 'utf8');
    const m = /CONTACT_ENDPOINT\s*=\s*'([^']+)'/.exec(l);
    prueba('la landing sigue llamando a la URL vieja',
      !!m && /\/api\/contact$/.test(m[1]), m ? m[1] : '(no encontrada)');
  }
}

grupo('el despachador manda cada cosa a su sitio');
{
  // Resend se construye al cargar los manejadores y sin clave lanza.
  // Aquí no se manda ningún correo: solo se mira a dónde van las
  // peticiones, así que una clave de mentira basta.
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test_000';

  let handler = null, err = null;
  try { handler = require(path.join(RAIZ, 'api', 'notify.js')); }
  catch (e) { err = e; }
  prueba('api/notify.js carga', !!handler, err && err.message);

  if (handler) {
    const tipos = ['login', 'signup', 'contact'];
    for (const t of tipos) {
      // Sin tipo válido el despachador contesta 400 diciendo cuáles
      // acepta. Ese 400 es la señal de que NO conoce el tipo.
      const res = resFalsa();
      const r = handler({ method: 'OPTIONS', headers: {}, query: { type: t } }, res);
      const p = (r && typeof r.then === 'function') ? r : Promise.resolve(r);
      // OPTIONS no manda correo en ninguno de los tres.
      p.catch(() => {});
      prueba('conoce el tipo "' + t + '"',
        !(res.code === 400 && res.cuerpo && /Falta type/.test(res.cuerpo.error || '')),
        'contestó ' + res.code + ' ' + JSON.stringify(res.cuerpo));
    }

    // Un tipo inventado tiene que rebotar, no colarse.
    const res = resFalsa();
    handler({ method: 'POST', headers: {}, query: { type: 'inventado' }, body: {} }, res);
    prueba('un tipo desconocido rebota con 400', res.code === 400,
      'contestó ' + res.code);
  }
}

grupo('el preflight de contacto conserva su lista blanca');
{
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test_000';
  let handler = null;
  try { handler = require(path.join(RAIZ, 'api', 'notify.js')); } catch (e) {}

  if (handler) {
    // Este es el fallo sutil del merge: el preflight llega SIN cuerpo,
    // así que el tipo tiene que venir por la URL. Si no llegara, lo
    // atendería el OPTIONS genérico del despachador con Allow-Origin:*
    // y perderíamos la lista blanca.
    const bueno = resFalsa();
    handler({ method: 'OPTIONS',
              headers: { origin: 'https://www.barstockpro.com' },
              query: { type: 'contact' } }, bueno);
    prueba('deja pasar a la landing',
      bueno.cabeceras['access-control-allow-origin'] === 'https://www.barstockpro.com',
      JSON.stringify(bueno.cabeceras));
    prueba('no abre a cualquiera',
      bueno.cabeceras['access-control-allow-origin'] !== '*',
      bueno.cabeceras['access-control-allow-origin']);

    const malo = resFalsa();
    handler({ method: 'OPTIONS',
              headers: { origin: 'https://sitio-ajeno.example' },
              query: { type: 'contact' } }, malo);
    prueba('a un origen ajeno no le pone cabecera',
      !malo.cabeceras['access-control-allow-origin'],
      malo.cabeceras['access-control-allow-origin']);

    // Vary: Origin o un proxy cachea la respuesta de un origen y se la
    // sirve a otro.
    prueba('declara Vary: Origin',
      /origin/i.test(String(bueno.cabeceras['vary'] || '')),
      bueno.cabeceras['vary']);
  }
}

grupo('lo que no se tocó');
{
  const notify = leer('api/notify.js');
  prueba('login sigue colgando de lib/notify-login',
    /require\('\.\.\/lib\/notify-login'\)/.test(notify));
  prueba('signup sigue colgando de lib/notify-signup',
    /require\('\.\.\/lib\/notify-signup'\)/.test(notify));

  // El camino de las órdenes del lunes. Este merge no lo roza, y hasta
  // que no pase ese lunes no se toca.
  prueba('send-order sigue siendo su propia función',
    fs.existsSync(path.join(RAIZ, 'api', 'send-order.js')));
  const eo = leer('src/email-order.js');
  prueba('email-order.js sigue apuntando a /api/send-order',
    /\/api\/send-order/.test(eo));

  // La lógica del contacto se mudó, no se reescribió. Si estas dos
  // piezas se perdieran, el formulario dejaría de avisarte o dejaría
  // de acusar recibo, y nadie se daría cuenta hasta perder un lead.
  const mc = leer('lib/mail-contact.js');
  prueba('el contacto sigue mandando los DOS correos',
    (mc.match(/resend\.emails\.send\(/g) || []).length === 2);
  prueba('y conserva el cepo antirrobots', /b\.website/.test(mc));
  // Los comentarios de este archivo HABLAN de `../lib/` al explicar la
  // mudanza, así que hay que quitarlos antes de buscar o el propio
  // texto explicativo hace fallar la comprobación.
  const mcCodigo = mc.replace(/^\s*\/\/.*$/gm, '');
  prueba('con los require ya relativos a lib/',
    /require\('\.\/email-shell'\)/.test(mcCodigo) &&
    /require\('\.\/inboxes'\)/.test(mcCodigo) &&
    !/require\([^)]*\.\.\/lib\//.test(mcCodigo));
}

console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
  '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
