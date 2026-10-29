#!/usr/bin/env node
/*
 * ── "Running out first" ──────────────────────────────────────────────
 *
 * El fallo que esto arregla no era cosmético. Con cuarenta y nueve
 * productos bajo la semana, los primeros diez decían todos "0 days" y
 * esa lista no priorizaba nada: no distinguía un Tito's que se mueve
 * doce a la semana de un amaretto que se mueve uno.
 *
 * Los días contestan "cuándo". Con todo a cero la pregunta que queda
 * es "cuánto duele", y eso lo contesta el consumo.
 *
 *   node tools/test-tarjeta-pronto.js
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'mobile-home.js'), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

// `normalWeeks` por encima del mínimo o la ficha no cuenta: con menos
// de cuatro semanas el promedio no significa nada todavía.
function entorno(items) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });

  w.state = { master: items.map(x => ({
    item: x.item, code: x.item, vendor: x.vendor || 'SOUTHERN',
    category: 'Liquor', onHand: x.onHand
  })) };

  w.parAdjustments = new Map(items.map(x => [x.item + '||' + x.item, {
    status: 'active', avgUsed: x.avg, normalWeeks: 8
  }]));

  w.BarStockWeeklyCycle = {
    estado: () => 'done', resetAt: () => '2026-10-25T08:00:00Z',
    fmtDate: () => 'Oct 25', edadCiclo: () => 2 * 86400000, cicloViejo: () => false
  };
  w.__ido = [];
  w.BarStockMobile = { ir: (x) => w.__ido.push(x) };

  new Function(SRC)();
  return w;
}

function pintar(w) {
  const host = w.document.createElement('div');
  host.className = 'm-screen on';
  host.setAttribute('data-screen', 'home');
  w.document.body.appendChild(host);
  w.BarStockMobileHome.render(host);
  return host;
}

// Bienvenida, ciclo y ésta: no hay órdenes en este montaje.
function tarjeta(h) {
  return Array.from(h.querySelectorAll('.m-hero'))
    .find(c => /Running out first/i.test(c.textContent));
}
const txt = (h) => tarjeta(h).textContent.replace(/\s+/g, ' ');
const filas = (h) => Array.from(tarjeta(h).querySelectorAll('.m-hln'));
const nombres = (h) => filas(h).map(f => f.querySelector('.n').textContent);

(() => {
  grupo('ordena por consumo, no por días');
  {
    // Los tres están a cero: por días quedarían empatados y saldría
    // el orden del inventario, que no significa nada.
    const w = entorno([
      { item: 'Hiram Walker Amaretto', onHand: 0, avg: 1 },
      { item: 'Tito’s Vodka 1.75L', onHand: 0, avg: 12 },
      { item: 'White Haven Sauvignon Blanc', onHand: 0, avg: 9 }
    ]);
    const h = pintar(w);
    prueba('el que más se mueve va primero',
      /Tito/.test(nombres(h)[0] || ''), nombres(h).join(' | '));
    // Sólo caben dos filas, así que el que menos se mueve ni sale:
    // se comprueba que el segundo sea el segundo que más se mueve y
    // que el amaretto quede fuera.
    prueba('el segundo es el siguiente que más se mueve',
      /White Haven/.test(nombres(h)[1] || ''), nombres(h).join(' | '));
    prueba('y el que menos no entra',
      !nombres(h).some(n => /Amaretto/.test(n)), nombres(h).join(' | '));
    prueba('con su consumo a la derecha',
      filas(h)[0].querySelector('.v').textContent === '12/wk',
      filas(h)[0].querySelector('.v').textContent);
  }

  grupo('la pastilla "out" mira el estante, no el redondeo');
  {
    // Media botella de algo que se mueve mucho también da 0 días.
    // Decir que está fuera cuando queda media es mentira.
    const w = entorno([
      { item: 'Vacío', onHand: 0, avg: 5 },
      { item: 'Media botella', onHand: 0.5, avg: 20 }
    ]);
    const h = pintar(w);
    const con = filas(h).filter(f => f.querySelector('.tag'));
    prueba('sólo uno lleva pastilla', con.length === 1, String(con.length));
    prueba('y es el que está a cero',
      con[0].querySelector('.n').textContent === 'Vacío',
      con[0].querySelector('.n').textContent);
    // Y los que están fuera van antes, aunque se muevan menos: es
    // otro estado, no una cuestión de grado.
    prueba('lo que está fuera va primero aunque se mueva menos',
      nombres(h)[0] === 'Vacío', nombres(h).join(' | '));
  }

  grupo('el titular es lo que exige algo hoy');
  {
    const w = entorno([
      { item: 'A', onHand: 0, avg: 5 },
      { item: 'B', onHand: 0, avg: 4 },
      { item: 'C', onHand: 2, avg: 3 }
    ]);
    const h = pintar(w);
    prueba('cuenta los que están fuera', /2 are out right now/.test(txt(h)), txt(h).slice(0, 70));
    prueba('y no "3 products"', !/3 products/.test(txt(h)));
    // La esquina repetía el título. Ahora dice otra cosa.
    const amt = tarjeta(h).querySelector('.m-hero-amt').textContent.replace(/\s/g, '');
    prueba('la esquina no repite el total', amt === '2outnow', amt);
    prueba('y el pie cuenta el resto', /and 1 more under a week/.test(txt(h)), txt(h));
  }

  grupo('sin nada fuera, el titular vuelve al total');
  {
    const w = entorno([
      { item: 'A', onHand: 2, avg: 3 },
      { item: 'B', onHand: 1, avg: 2 }
    ]);
    const h = pintar(w);
    prueba('dice cuántos hay', /2 products/.test(txt(h)), txt(h).slice(0, 70));
    prueba('ninguna pastilla', filas(h).every(f => !f.querySelector('.tag')));
    const amt = tarjeta(h).querySelector('.m-hero-amt').textContent.replace(/\s/g, '');
    prueba('y la esquina lo dice con su unidad', amt === '2thisweek', amt);
  }

  grupo('los nombres ya no se parten a lo bruto');
  {
    // Antes se recortaban a 18 caracteres en el código: "Canyon Road
    // Cabern". Ahora van enteros y los corta el ancho, con puntos
    // suspensivos, que es lo que sabe dónde está el borde.
    const largo = 'Canyon Road Cabernet Sauvignon Reserve';
    const w = entorno([{ item: largo, onHand: 0, avg: 5 }]);
    const h = pintar(w);
    prueba('el nombre llega entero al DOM', nombres(h)[0] === largo, nombres(h)[0]);
  }

  grupo('cuatro y el resto contado');
  {
    const seis = ['A', 'B', 'C', 'D', 'E', 'F'].map((n, i) =>
      ({ item: n, onHand: 0, avg: 10 - i }));
    const w = entorno(seis);
    const h = pintar(w);
    // Ésta es la tarjeta más alta del carril, así que fija la altura
    // de todas. Cada fila que se le quita encoge el Home entero.
    prueba('enseña dos', filas(h).length === 2, String(filas(h).length));
    // Y el resto se cuenta en el pie, que ya es un renglón dibujado:
    // una línea propia costaría altura a todas las tarjetas.
    prueba('el resto va en el pie', /and 4 more under a week/.test(txt(h)), txt(h));
  }

  grupo('más de una semana no entra');
  {
    const w = entorno([
      { item: 'Justo', onHand: 7, avg: 7 },      // 7 días
      { item: 'Sobra', onHand: 30, avg: 7 }      // 30 días
    ]);
    const h = pintar(w);
    prueba('sólo el de la semana', nombres(h).length === 1, nombres(h).join(' | '));
    prueba('y es el justo', nombres(h)[0] === 'Justo', nombres(h)[0]);
  }

  grupo('"See them" lleva a la lista que acabas de leer');
  {
    const w = entorno([{ item: 'A', onHand: 0, avg: 5 }]);
    const h = pintar(w);
    w.__orden = null;
    w.BarStockMobileInventory = {
      abrirCon: (o) => { w.__orden = o; w.__ido.push('inventory'); }
    };
    tarjeta(h).querySelector('.m-hero-b').click();
    // Antes caía en los 264 artículos ordenados por valor en el
    // estante, donde lo que acababas de leer no aparecía.
    prueba('abre inventario', w.__ido.includes('inventory'), w.__ido.join(','));
    prueba('ordenado por lo más cerca de vaciarse', w.__orden === 'falta', String(w.__orden));
  }

  console.log('\n' + (mal ? mal + ' fallos' : 'todo bien') +
    '   ·   ' + (ok + mal) + ' comprobaciones');
  process.exit(mal ? 1 : 0);
})();
