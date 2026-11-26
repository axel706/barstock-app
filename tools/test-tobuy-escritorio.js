#!/usr/bin/env node
/*
 * ── Orders › To buy en el escritorio (lámina "To buy · desktop", B: lista
 *    y orden en una pantalla; Axel 2026-11-26) ──
 *
 * Lo que no puede volver a pasar:
 *
 *   1. La orden de la derecha es lo MARCADO de la lista, como LOOP; lo
 *      desmarcado se queda en la lista. Lo cambiado a mano en la orden no
 *      se pierde al marcar otra línea.
 *   2. Colocada la orden (por la revisión de Orders, no sólo por el
 *      guardado de LOOP del teléfono), sus líneas pasan a "Ordered" con
 *      la cantidad pedida. Antes, desde la revisión, seguían "To buy" y
 *      alguien las compraría dos veces.
 *   3. To buy es una vista de Orders, primera y sólo con algo en la lista
 *      (la regla del teléfono).
 *   4. Es la lista del TELÉFONO (mobile-to-buy) y la orden de Q-O
 *      (desk-quick con la lista a la izquierda): nada copiado.
 *   5. Carga: desk-tobuy tras desk-quick y antes de desk-orders.
 *
 *   node tools/test-tobuy-escritorio.js
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

const MASTER = [
  { item: "Tito's Vodka", vendor: 'SOUTHERN', value: 25, onHand: 1, suggested: 6, code: 'T1' },
  { item: 'Kamora', vendor: 'BREAKTHRU', value: 14, onHand: 0, suggested: 3, code: 'K1' },
  { item: 'Aperol', vendor: 'LOOP', value: 20, onHand: 1, suggested: 2, code: 'A1' }
];
const LISTA = [
  { id: 1, item_name: "Tito's Vodka", qty: 4, reason: 'app', status: 'to_buy' },
  { id: 2, item_name: 'Kamora', qty: 2, reason: 'person', note: 'only 1 left', status: 'to_buy' },
  { id: 3, item_name: 'Aperol', qty: 3, reason: 'person', status: 'to_buy' }
];

function ventana() {
  const w = new JSDOM('<!doctype html><body><div id="col"></div></body>', { runScripts: 'outside-only' }).window;
  w.state = { master: MASTER.map(r => Object.assign({}, r)) };
  w.__marcadas = [];
  w.BarStockShoppingList = { marcarPedidas: async (ls, ref) => { w.__marcadas.push({ ls, ref }); return { ok: true }; } };
  w.eval(leer('src/mobile-quick.js'));
  return w;
}

grupo('1. La orden es lo marcado, como LOOP');
{
  const w = ventana();
  const Q = w.BarStockMobileQuick && w.BarStockMobileQuick.escritorio;
  prueba('mobile-quick arma el borrador desde la lista', !!(Q && Q.desdeLista));
  if (Q && Q.desdeLista) {
    Q.desdeLista(LISTA.map(x => ({ id: x.id, item: x.item_name, qty: x.qty })));
    const b = Q.borrador();
    prueba('siempre LOOP, con las tres líneas', b.vendor === 'LOOP' && b.items.map(x => x.item + ' ' + x.qty).join(',') === "Tito's Vodka 4,Kamora 2,Aperol 3", JSON.stringify(b.items.map(x => x.item + ' ' + x.qty)));
    Q.cantidad(0, 6);
    Q.desdeLista(LISTA.filter(x => x.id !== 3).map(x => ({ id: x.id, item: x.item_name, qty: x.qty })));
    const b2 = Q.borrador();
    prueba('desmarcar quita la línea de la orden y lo cambiado a mano se queda', b2.items.map(x => x.item + ' ' + x.qty).join(',') === "Tito's Vodka 6,Kamora 2", JSON.stringify(b2.items.map(x => x.item + ' ' + x.qty)));
    prueba('el borrador sabe que salió de la lista', Q.deLista && Q.deLista() === true);
  }
}

grupo('2. Colocada desde la revisión, las líneas pasan a "Ordered"');
{
  const w = ventana();
  const M = w.BarStockMobileQuick;
  prueba('mobile-quick expone trasColocar', !!(M && M.trasColocar));
  if (M && M.trasColocar && M.escritorio.desdeLista) {
    M.escritorio.desdeLista(LISTA.slice(0, 2).map(x => ({ id: x.id, item: x.item_name, qty: x.qty })));
    // La orden guardada, con la cantidad que se pidió de verdad.
    const orden = { id: 'ord_9', items: [{ item: "Tito's Vodka", finalOrder: 5, qty: 4 }, { item: 'Kamora', finalOrder: 2, qty: 2 }] };
    M.trasColocar(orden).then(aviso => {
      const m = w.__marcadas[0];
      prueba('marca las dos líneas con la orden y la cantidad pedida', !aviso && m && m.ref === 'ord_9' && JSON.stringify(m.ls) === JSON.stringify([{ id: 1, qty: 5 }, { id: 2, qty: 2 }]), JSON.stringify(w.__marcadas));
      final();
    });
  } else final();
}
const MO = leer('src/mobile-orders.js');
prueba('la revisión de Orders lo llama ANTES de tirar el borrador', /Q\.trasColocar\(orden\)[\s\S]{0,200}Q\.limpiar\(\)/.test(MO));

function final() {
  grupo('3. Una vista de Orders, primera y sólo con algo en la lista');
  const DO = leer('src/desk-orders.js');
  prueba('To buy va primero', /\['buy', 'To buy'\], \['open', 'Open'\], \['sent', 'Sent'\], \['inv', 'Invoices'\]/.test(DO));
  prueba('y sólo sale con algo en la lista (hayToBuy del teléfono)', /k !== 'buy' \|\| hayBuy\(\)/.test(DO) && /MO\(\)\.hayToBuy\(\)/.test(DO));
  prueba('sin nada que comprar, de vuelta a Open', /_vista === 'buy' && !hayBuy\(\)\) _vista = 'open'/.test(DO));
  prueba('la lista se lee al abrir Orders', /TBm\.cargar\(\)/.test(DO));

  grupo('4. La lista del teléfono y la orden de Q-O');
  const DT = fs.existsSync(path.join(RAIZ, 'src/desk-tobuy.js')) ? leer('src/desk-tobuy.js') : '';
  prueba('mobile-to-buy da su lista al escritorio', /escritorio = \{\s*porComprar, pedidas, porque, pedidaTxt/.test(leer('src/mobile-to-buy.js')));
  prueba('desk-quick admite la lista como columna', /columna: \{ pintar: pintarCol, clic: alClic/.test(DT) && /if \(_col\) return _col\.pintar\(col\)/.test(leer('src/desk-quick.js')));
  {
    const w = new JSDOM('<!doctype html><body><div id="col"></div></body>', { runScripts: 'outside-only' }).window;
    w.state = { master: MASTER };
    const desde = [];
    w.BarStockMobileToBuy = { escritorio: { porComprar: () => LISTA, pedidas: () => [{ id: 9, item_name: 'Grey Goose', qty: 3 }], porque: () => 'Running out', pedidaTxt: () => 'LOOP · CT-0220', puede: () => true } };
    w.BarStockMobileQuick = { escritorio: { desdeLista: (f) => desde.push(f.map(x => x.id).join(',')), borrador: () => ({ items: [] }), deLista: () => true } };
    let repintado = 0;
    w.BarStockDeskQuick = { abrir: () => {}, repintar: () => repintado++, cerrar: () => {} };
    if (DT) w.eval(DT);
    const D = w.BarStockDeskToBuy;
    prueba('desk-tobuy existe', !!D);
    if (D) {
      D.abrir(w.document.body, {}).then(() => {
        const col = w.document.getElementById('col');
        D._pintarCol(col);
        prueba('una fila por línea, todas marcadas, y lo pedido aparte', col.querySelectorAll('.dkt-chk.on').length === 3 && col.querySelectorAll('.dkt-l.ped').length === 1);
        col.addEventListener('click', (ev) => { /* el clic lo atiende desk-quick */ });
        const chk = col.querySelector('.dkt-l[data-id="3"] .dkt-chk');
        // desk-quick le pasa el clic a la columna (clic) con el evento.
        const ev = { target: chk };
        // alClic se llega por la columna que desk-tobuy le dio a desk-quick.
        let colOpc = null;
        w.BarStockDeskQuick.abrir = (c, o) => { colOpc = o.columna; };
        D.abrir(w.document.body, {}).then(() => {
          colOpc.clic(ev);
          prueba('desmarcar rehace la orden sin esa línea, y la repinta', desde[desde.length - 1] === '1,2' && repintado > 0, desde.join(' / '));
          grupo('5. Carga');
          const I = leer('index.html');
          const pos = s => I.indexOf(s);
          prueba('desk-tobuy tras desk-quick y antes de desk-orders', pos('src/desk-quick.js') > 0 && pos('src/desk-quick.js') < pos('src/desk-tobuy.js') && pos('src/desk-tobuy.js') < pos('src/desk-orders.js'));
          prueba('la vista usa la rejilla de Q-O', /\[data-vista="buy"\]\) \{\s*grid-template-columns: 420px/.test(leer('styles/desk-orders.css')));
          {
            // Lámina "the footer", A: los cinco pies, UNA barra de cristal,
            // en UNA regla (no cinco copias que dejan de decir lo mismo).
            const H = leer('styles/desk-header.css');
            const m = H.match(/:is\(([^)]*)\) \{\s*position: sticky; z-index: 5; bottom: max\(10px[^}]*border-radius: 22px;[^}]*backdrop-filter: blur\(18px\)/);
            const lista = m ? m[1] : '';
            prueba('los cinco pies (Open, Sent, Invoices, Q-O/To buy, Inventory) son UNA barra de cristal', ['.dko-pie', '.dks-pie', '.dkv-pie', '.dkq-pie', '.dki-pie'].every(c => lista.includes(c)), lista);
            const O = leer('styles/desk-orders.css') + leer('styles/desk-inventory.css');
            prueba('   y ninguno conserva su fondo propio de antes', !/\.(dko|dks|dkv|dkq|dki)-pie[^{]*\{[^}]*background:/.test(O));
          }
          prueba('el pie de To buy y Q-O en UNA línea (sin wrap ni la rejilla de dos filas)', /#dkOrd \.dkq-pie \{[^}]*flex-wrap: nowrap;/.test(leer('styles/desk-orders.css')) && !/grid-template-areas: "tot go" "live live"/.test(leer('styles/desk-orders.css')));
          fin();
        });
      });
    } else fin();
  }
}
function fin() {
  console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
}
