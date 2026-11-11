#!/usr/bin/env node
/*
 * ── "See them" enseña lo que la tarjeta dice que se acaba ────────────
 *
 * Axel, 2026-11-11: "al pulsar See them me muestra la lista de
 * inventario sin un orden específico, no los productos que me dice que
 * se van a terminar". Abría Inventory por "Closest to empty" (lo que
 * queda contra el par): con quince productos a cero empatados, salían
 * en el orden del inventario.
 *
 * Opción B, sobre lámina:
 *   1. "See them" abre Inventory SÓLO con los productos de la tarjeta,
 *      en su orden. Los dos leen la misma lista (running-out.js).
 *   2. Una pastilla bajo el buscador lo dice, con el mismo número que la
 *      tarjeta, y al tocarla vuelve la lista entera.
 *   3. Vale para esa entrada: entrar por la pestaña no lo trae. Un
 *      refresco del LIVE no lo quita.
 *   4. La búsqueda acota dentro del filtro.
 *
 *   node tools/test-ver-agota.js
 */
const { JSDOM } = require('jsdom');
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
const esperar = ms => new Promise(r => setTimeout(r, ms));

const HOY = new Date().toISOString().slice(0, 10);
const enDias = (k) => new Date(Date.now() + k * 864e5).toISOString().slice(0, 10);
const MED = [1, 1, 1, 1, 1, 1, 1];
const fila = (producto, contado, llego, vendido, k) => ({
  producto, contado, llego, vendido, live: Math.round((contado + llego - vendido) * 100) / 100,
  movimiento: llego !== 0 || vendido !== 0, de: [], llegadas: [], viene: [],
  med: MED, agota: k == null ? null : enDias(k), enDias: k == null ? null : k
});
// En el inventario van por orden alfabético y con pares que darían otro
// orden a "Closest to empty": así un orden prestado se nota.
const FILAS = [
  fila('Absolut', 6, 0, 1, 9),            // 9 días: no entra
  fila('Aperol', 0, 0, 0, 0),             // fuera
  fila('Baileys 1L', 2, 0, 0.5, 5),
  fila('Bulleit Rye', 1, 0, 0.4, 2),
  fila('Crown Russe Vodka', 0, 0, 0, 0),  // fuera
  fila('St Germain', 1, 0, 0.6, 0),
  fila("Tito's Vodka 1L", 3, 5, 0.9, 4)
];

async function entorno() {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  // events.js crea el CustomEvent suelto: el de Node no lo acepta jsdom.
  global.CustomEvent = w.CustomEvent;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  new Function(leer('src/events.js'))();
  w.BarStockRunOut = { ahora: async () => ({ estado: 'listo', hoy: HOY, filas: FILAS }) };
  new Function(leer('src/live-cache.js'))();
  new Function(leer('src/running-out.js'))();
  new Function(leer('src/product-hero.js'))();
  const m = (item, onHand, suggested) => ({ item, vendor: 'LOOP', code: '', category: 'Liquor', onHand, suggested, value: 20 });
  w.state = { master: [m('Absolut', 6, 6), m('Aperol', 0, 1), m('Baileys 1L', 2, 4), m('Bulleit Rye', 1, 20),
    m('Crown Russe Vodka', 0, 6), m('St Germain', 1, 3), m("Tito's Vodka 1L", 3, 8)] };
  global.state = w.state;
  w.parAdjustments = new Map();
  w.normalizeName = (s) => String(s || '').toLowerCase();
  w.getVendorsForFilter = () => ['ALL', 'LOOP'];
  await w.BarStockLiveCache.cargar();

  const defs = {}, hosts = {};
  w.BarStockMobile = {
    register(d) { defs[d.id] = d; }, refrescarBadges() {},
    ir(id) {
      for (const k in hosts) hosts[k].classList.toggle('on', k === id);
      defs[id].show(hosts[id]);
    }
  };
  new Function(leer('src/mobile-home.js'))();
  new Function(leer('src/mobile-inventory.js'))();
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  for (const id of ['home', 'inventory']) {
    const h = w.document.createElement('div');
    h.className = 'm-screen' + (id === 'home' ? ' on' : ''); h.dataset.screen = id;
    w.document.body.appendChild(h);
    hosts[id] = h;
    defs[id].mount(h);
  }
  await esperar(20);
  return { w, home: hosts.home, inv: hosts.inventory, ir: (id) => w.BarStockMobile.ir(id) };
}
const tarjeta = (h) => [...h.querySelectorAll('.m-hero')].find(c => /Running out first/i.test(c.textContent));
const nombresInv = (h) => [...h.querySelectorAll('#miList .m-inv-n')].map(n => n.textContent);
const pastilla = (h) => h.querySelector('#miFiltro .m-inv-filtro');

(async () => {

grupo('"See them" abre lo que dice la tarjeta');
{
  const { w, home, inv } = await entorno();
  const c = tarjeta(home);
  const enTarjeta = [...c.querySelectorAll('.m-hln .n')].map(n => n.textContent.trim());
  const total = Number((c.querySelector('.m-hero-t').textContent.match(/\d+/) || [])[0]);
  c.querySelector('.m-hero-b').click();
  await esperar(10);
  const lista = nombresInv(inv);
  const esperada = w.BarStockRunningOut.lista().map(x => x.item);
  prueba('sólo los productos de la tarjeta', lista.length === esperada.length && !lista.includes('Absolut'), lista.join(' | '));
  prueba('en el orden de la tarjeta', JSON.stringify(lista) === JSON.stringify(esperada), lista.join(' | '));
  prueba('los primeros son las filas de la tarjeta', JSON.stringify(lista.slice(0, enTarjeta.length)) === JSON.stringify(enTarjeta),
    enTarjeta.join(' | ') + '  vs  ' + lista.join(' | '));
  // "2 are out right now" cuenta los que están fuera; los de la semana
  // son la lista entera.
  prueba('lo que está fuera, primero', lista[0] === 'Aperol' && lista[1] === 'Crown Russe Vodka', lista.join(' | '));
  const p = pastilla(inv);
  prueba('la pastilla lo dice', !!p && /Running out first · 6/.test(p.textContent), p && p.textContent.replace(/\s+/g, ' '));
  prueba('con el estilo de las del cajón', !!p && p.classList.contains('m-chip') && p.classList.contains('on'));
  prueba('el titular de la tarjeta cuenta lo que está fuera', total === 2, String(total));
}

grupo('la pastilla devuelve la lista entera');
{
  const { home, inv } = await entorno();
  tarjeta(home).querySelector('.m-hero-b').click();
  await esperar(10);
  pastilla(inv).click();
  await esperar(10);
  prueba('todo el inventario', nombresInv(inv).length === 7, nombresInv(inv).join(' | '));
  prueba('sin pastilla', !pastilla(inv));
}

grupo('vale para esa entrada');
{
  const { home, inv, ir } = await entorno();
  tarjeta(home).querySelector('.m-hero-b').click();
  await esperar(10);
  ir('home');
  ir('inventory');
  await esperar(10);
  prueba('entrar por la pestaña no lo trae', nombresInv(inv).length === 7 && !pastilla(inv), nombresInv(inv).length + '');
}
{
  const { w, home, inv } = await entorno();
  tarjeta(home).querySelector('.m-hero-b').click();
  await esperar(10);
  w.BarStockEvents.emit('invoicesUpdated', {});
  await esperar(20);
  prueba('un refresco del LIVE no lo quita', nombresInv(inv).length === 6 && !!pastilla(inv), nombresInv(inv).join(' | '));
}

grupo('la búsqueda acota dentro');
{
  const { home, inv } = await entorno();
  tarjeta(home).querySelector('.m-hero-b').click();
  await esperar(10);
  const i = inv.querySelector('#miInput');
  i.value = 'vodka'; i.oninput();
  prueba('sólo los del filtro que coinciden', JSON.stringify(nombresInv(inv)) === JSON.stringify(['Crown Russe Vodka', "Tito's Vodka 1L"]),
    nombresInv(inv).join(' | '));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
