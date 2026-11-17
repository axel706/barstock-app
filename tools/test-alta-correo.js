#!/usr/bin/env node
/*
 * ── El correo del código de alta (lib/alta-email.js) ─────────────────
 *
 * Axel, 2026-11-17, sobre lámina: texto 1, pasos en estilo B y, antes
 * del código, YOUR ACCOUNT. Lo que no puede volver a pasar:
 *
 *   1. Que diga una cuenta, unas locaciones o un nombre que no son.
 *   2. Que el código o el enlace no casen (el botón abre el alta).
 *   3. Que vuelva la línea "Starter Guide" que Axel quitó.
 *   4. Que la línea de los pasos vuelva a ser un degradado (Outlook no
 *      lo pinta) o que un nombre con "<" rompa el HTML.
 *
 *   node tools/test-alta-correo.js
 */
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const M = require(path.join(RAIZ, 'lib/alta-email.js'));

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const texto = (h) => h.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

const D = { nombre: 'Maria', quien: 'Axel', rol: 'Manager', locaciones: ['The Crown Tavern', "Will's & Bill's"],
  code: '482913', expira: '2026-11-17T23:00:00Z' };
const { asunto, html } = M.armar(D);
const t = texto(html);

console.log('\nlo que dice');
prueba('el asunto, con su nombre', asunto === 'Your BarStock account is ready, Maria', asunto);
prueba('el saludo y quién la creó', /Hi Maria, welcome to BarStock/.test(t) && /Axel just set up your account at The Crown Tavern/.test(t), t.slice(0, 200));
prueba('YOUR ACCOUNT: tipo, locaciones y con qué entra', /Your account/i.test(t) && /Account type Manager/.test(t) &&
  /Locations The Crown Tavern · Will's & Bill's/.test(t) && /Sign in with Your name \(Maria\) and your own PIN/.test(t), t);
prueba('el código, partido en dos', /482 913/.test(t));
prueba('hasta cuándo, en la hora de Nueva York', /Works once, until Tue, Nov 17 at 6:00 PM/.test(t), t);
prueba('los cuatro pasos, en orden', /Add BarStock to your home screen.*Open it from the new icon.*Enter your name and code.*Create your PIN/.test(t));
prueba('el paso 3 con su nombre', /type Maria ?, and enter the code above/.test(t));
prueba('el botón abre el alta con su nombre y su código', html.indexOf('https://app.barstockpro.com/?alta=Maria&amp;c=482913') >= 0 ||
  html.indexOf('https://app.barstockpro.com/?alta=Maria&c=482913') >= 0, (html.match(/href="[^"]*alta[^"]*"/) || [])[0]);
prueba('firma quien la creó', /See you in the app, Axel/.test(t));
prueba('sin la Starter Guide (Axel la quitó)', !/Starter Guide/i.test(t));

console.log('\nlo que no se rompe');
prueba('la línea de los pasos es una celda, no un degradado', !/linear-gradient/.test(html) && (html.match(/background:#bae6fd/g) || []).length === 3);
const raro = M.armar(Object.assign({}, D, { nombre: 'Li <b>', quien: '' }));
prueba('un nombre con "<" no rompe el HTML', raro.html.indexOf('Li <b>') < 0 && raro.html.indexOf('Li &lt;b&gt;') >= 0);
prueba('sin quién, firma BarStock', /See you in the app, BarStock/.test(texto(raro.html)));
prueba('el enlace codifica el nombre', M.enlace('Ana María', '000123') === 'https://app.barstockpro.com/?alta=Ana%20Mar%C3%ADa&c=000123');
prueba('en verano, la hora también es la de Nueva York', M.cuando('2026-07-01T22:00:00Z') === 'Wed, Jul 1 at 6:00 PM', M.cuando('2026-07-01T22:00:00Z'));

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
