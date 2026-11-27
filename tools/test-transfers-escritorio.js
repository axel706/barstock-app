#!/usr/bin/env node
/*
 * ── Transfers en el escritorio (lámina "Transfers · desktop", A: "como
 *    Sent"; Axel 2026-11-27) ──
 *
 * Lo que no puede volver a pasar:
 *
 *   1. Transfers es una sección de la barra lateral (ya no "Soon"), con el
 *      número de lo que espera que confirmes.
 *   2. Es el Transfers del TELÉFONO: qué sale, el Undo y el guardar viven
 *      UNA vez (mobile-transfers.datos / deshacer / crear) y los usan los
 *      dos; confirmar y "Not right", los de transfer-confirm.
 *   3. La lista a la izquierda y el elegido a la derecha; confirmar desde
 *      su pie; New transfer en el mismo panel, que guarda con crear().
 *   4. Elegir una botella en el escritorio es UNA ventana (desk-botella),
 *      la de Invoices, "Choose yours" y "Add a product"; sin escribir
 *      enseña también lo que no casa con la pista.
 *   5. El pie, en la barra de cristal de todos; la sección, antes de
 *      desk-shell.
 *
 *   node tools/test-transfers-escritorio.js
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const existe = f => fs.existsSync(path.join(RAIZ, f));

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);
const esperar = (ms) => new Promise(r => setTimeout(r, ms || 0));

const SHELL = leer('src/desk-shell.js');
const MTsrc = leer('src/mobile-transfers.js');
const DT = existe('src/desk-transfers.js') ? leer('src/desk-transfers.js') : '';
const DB = existe('src/desk-botella.js') ? leer('src/desk-botella.js') : '';
const INDEX = leer('index.html');

(async () => {
  grupo('1. Una sección de la barra lateral');
  prueba('Transfers abre su sección, con su número', /id: 'transfers', label: 'Transfers', icon: 'ti-arrows-exchange', sec: 'transfers',\s*\n\s*cuenta:/.test(SHELL));
  // Counts salió de "Soon" el mismo día (desk-counts.js): el grupo se fue.
  prueba('   y ya no está en "Soon"', !/id: 'transfers'[^}]*pronto: true/.test(SHELL) && !/grupo: 'Soon'/.test(SHELL));

  grupo('2. Lo del teléfono, una vez');
  prueba('mobile-transfers da qué sale, el Undo y el guardar', /BarStockMobileTransfers = \{ montar, abrirNuevo, pendientes, datos, deshacer, crear/.test(MTsrc));
  prueba('   y el teléfono los usa (no tiene su copia)', /const d = datos\(\);/.test(MTsrc) && /await deshacer\(recientes/.test(MTsrc) && /await crear\(_nuevo\)/.test(MTsrc) &&
    (MTsrc.match(/Undo this transfer\?/g) || []).length === 2);
  prueba('el escritorio también', /MT\(\)\.datos\(\)/.test(DT) && /MT\(\)\.deshacer\(g\)/.test(DT) && /MT\(\)\.crear\(_nuevo\)/.test(DT) && /d\.c\.confirmar\(g\)/.test(DT) && /d\.c\.noEsAsi\(g\)/.test(DT));

  grupo('3. La lista y el elegido');
  {
    const w = new JSDOM('<!doctype html><body class="dk"><div class="wrap"></div></body>', { runScripts: 'outside-only' }).window;
    w.state = { master: [{ item: 'Triage Vodka' }, { item: 'Aperol' }] };
    const g1 = [{ id: 'a1', status: 'pending', qty: 6, moved_at: new Date().toISOString(), created_by: 'Mia' }, { id: 'a2', status: 'pending', qty: 2, moved_at: new Date().toISOString() }];
    const g2 = [{ id: 'c1', status: 'pending', qty: 12, moved_at: new Date().toISOString() }];
    const llamadas = [];
    const T = { entra: (x) => x.id[0] === 'a', otraLoc: () => 'wb', suItem: (x) => ({ a1: 'Triage House Vodka', a2: 'Aperol', c1: 'Triage Vodka' })[x.id],
      miItem: (x) => (x.id === 'c1' ? 'Triage Vodka' : null), loRegistre: (x) => x.id === 'c1', pareja: () => null };
    const C = { productoDe: (y) => ({ a1: 'Triage Vodka', a2: 'Aperol' })[y.id], confirmar: async (g) => llamadas.push('ok:' + g.length), noEsAsi: async () => llamadas.push('no') };
    w.BarStockMobileTransfers = {
      datos: () => ({ t: T, c: C, loc: 'crown', locs: [{ id: 'crown', name: 'The Crown Tavern' }, { id: 'wb', name: "Will's & Bill's" }], filas: [], conteo: null,
        porConf: [g1], recientes: [g2], todos: [g1, g2], puede: true, nombre: (id) => ({ crown: 'The Crown Tavern', wb: "Will's & Bill's" })[id],
        estado: (g) => (g === g1 ? ['to confirm', 'in'] : ['waiting', 'w']), deshacible: () => false }),
      crear: async (o) => { llamadas.push('crear:' + o.otra + ':' + o.lineas.map(l => l.item + 'x' + l.qty).join(',')); return { ok: true }; },
      cuandoNY: () => 'Fri 2:10 PM'
    };
    let registro = null;
    w.BarStockDeskHeader = { registrar: (s, spec) => { registro = { s, spec }; }, refrescar: () => {} };
    w.BarStockDeskBotella = { abrir: (o) => { llamadas.push('botella:' + o.titulo); if (o.alElegir) o.alElegir('Aperol'); } };
    if (DT) w.eval(DT);
    const sec = w.document.getElementById('transfersSection');
    prueba('crea su sección, con la forma estándar, y registra su header', !!sec && sec.classList.contains('dk-pantalla') && registro && registro.s === 'transfers');
    if (sec) {
      sec.classList.add('bs-active-section'); await esperar(20);
      const c = [...sec.querySelectorAll('#dktxLista .dktx-c')];
      prueba('la columna: por confirmar, la primera elegida', c.length === 1 && c[0].classList.contains('sel') && /From Will's & Bill's/.test(c[0].textContent), c.map(x => x.textContent.replace(/\s+/g, ' ')).join(' | '));
      const det = sec.querySelector('#dktxDet');
      prueba('el elegido: cada producto lo suyo → lo tuyo', det.querySelectorAll('.dktx-l').length === 2 && /Triage House Vodka/.test(det.textContent) && /Triage Vodka/.test(det.textContent));
      det.querySelector('[data-tx="ok"]').click(); await esperar(10);
      prueba('Confirm all en el pie confirma el grupo entero', llamadas.includes('ok:2'), llamadas.join(','));
      registro.spec.alClic({}, { dataset: { dkc: 'vista', vista: 'semana' } }); await esperar(5);
      prueba('This week: lo de la semana, también lo que espera a la otra', sec.querySelectorAll('#dktxLista .dktx-c').length === 2);
      registro.spec.alClic({}, { dataset: { dkc: 'nuevo' } }); await esperar(5);
      prueba('New transfer en el panel derecho, con la otra locación ya puesta (sólo hay una)', /New transfer/.test(det.textContent) && !!det.querySelector('.dktx-loc.on'));
      det.querySelector('[data-tx="anadir"]').click(); await esperar(5);
      prueba('   Add a product abre la ventana del escritorio', llamadas.includes('botella:Add a product'));
      det.querySelector('[data-tx="mas"]').click(); await esperar(5);
      det.querySelector('[data-tx="crear"]').click(); await esperar(20);
      prueba('   y guarda con crear() del teléfono', llamadas.includes('crear:wb:Aperolx2'), llamadas.join(','));
    }
  }

  grupo('4. UNA ventana para elegir una botella');
  prueba('Invoices y "Choose yours" la usan', /BarStockDeskBotella\.abrir\(o\)/.test(leer('src/desk-invoices.js')) && /BarStockDeskBotella[\s\S]{0,400}DB\.abrir\(\{ titulo: 'Which is yours\?'/.test(leer('src/transfer-confirm.js')));
  {
    const w = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' }).window;
    if (DB) w.eval(DB);
    const B = w.BarStockDeskBotella;
    prueba('existe', !!B);
    if (B) {
      B.abrir({ productos: ['Aperol', 'Campari', 'Kahlua Coffee Liqueur'], pista: 'Kahlua', verTodo: true, alElegir: () => {} });
      const ps = [...w.document.querySelectorAll('#dkvBus [data-p]')].map(b => b.dataset.p);
      prueba('sin escribir, primero lo que casa con la pista y después lo demás', ps.join(',') === 'Kahlua Coffee Liqueur,Aperol,Campari', ps.join(','));
      B.abrir({ productos: ['Aperol', 'Campari'], pista: 'Triage House Vodka', verTodo: true, alElegir: () => {} });
      prueba('   una pista que no casa no deja la ventana vacía', w.document.querySelectorAll('#dkvBus [data-p]').length === 2);
    }
  }

  grupo('5. El pie y la carga');
  prueba('el pie, en la barra de cristal de todos', /#dkTx \.dktx-pie\) \{\s*position: sticky;/.test(leer('styles/desk-header.css')));
  const pos = s => INDEX.indexOf(s);
  prueba('desk-botella antes que quien la usa, desk-transfers antes de desk-shell', pos('src/desk-botella.js') > 0 && pos('src/desk-botella.js') < pos('src/desk-transfers.js') && pos('src/desk-botella.js') < pos('src/desk-invoices.js') && pos('src/desk-transfers.js') < pos('src/desk-shell.js') && pos('src/mobile-transfers.js') < pos('src/desk-transfers.js'));
  prueba('su hoja carga', /styles\/desk-transfers\.css\?v=/.test(INDEX));

  console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
