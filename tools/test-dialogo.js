#!/usr/bin/env node
/*
 * ── Preguntar y avisar con la cara de la app ─────────────────────────
 *
 * Sustituye a `confirm()` y `alert()` del navegador, que en el iPhone
 * salen blancos y con la tipografía del sistema: en medio de una app
 * oscura se leen como un error del teléfono, no como una pregunta.
 *
 * Lo que se protege:
 *
 *   1. La respuesta. Un `confirm()` devolvía un booleano y esto
 *      devuelve una promesa; si resolviera mal, una pregunta de
 *      "¿descartar el conteo?" podría darse por contestada que sí.
 *   2. Cancelar es lo que pasa por defecto. Tocar fuera, Escape, o
 *      cerrar de cualquier otra forma, nunca significa que sí.
 *   3. Una sola a la vez. Dos encimadas dejan a la de abajo sin forma
 *      de cerrarse y la app parece colgada.
 *   4. El texto se escapa. Los mensajes llevan nombres de proveedor y
 *      de producto, que vienen de datos.
 *   5. Ningún módulo del teléfono vuelve a llamar al del navegador
 *      salvo como respaldo.
 *
 *   node tools/test-dialogo.js
 */

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

try { require.resolve('jsdom'); }
catch (e) {
  console.error('\nFalta jsdom. Una vez:\n\n  npm install\n\nY despues:  npm test\n');
  process.exit(2);
}
const { JSDOM } = require('jsdom');

let pasa = 0, falla = 0;
function ok(n, c, d) {
  if (c) { pasa++; console.log('  ok   ' + n); }
  else { falla++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}

function montar() {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/' });
  const w = dom.window;
  global.window = w; global.document = w.document;
  new Function(fs.readFileSync(path.join(RAIZ, 'src/dialog.js'), 'utf8'))();
  return w;
}

const latir = () => new Promise(r => setTimeout(r, 0));
const pulsar = (w, id) => { const b = w.document.getElementById(id); if (b) b.click(); };

(async () => {

console.log('\nla respuesta');
{
  const w = montar();
  const D = w.BarStockDialog;

  const p = D.confirmar({ titulo: 'Discard this count?', ok: 'Discard', cancelar: 'Keep' });
  await latir();
  ok('se abre', !!w.document.querySelector('#dlgBg .dlg-modal'));
  ok('con los dos botones', !!w.document.getElementById('dlgSi') && !!w.document.getElementById('dlgNo'));
  ok('y los textos que le pasaron',
     /Discard/.test(w.document.getElementById('dlgSi').textContent) &&
     /Keep/.test(w.document.getElementById('dlgNo').textContent));
  pulsar(w, 'dlgSi');
  ok('el boton de seguir contesta que si', (await p) === true);
  ok('y se cierra', w.document.getElementById('dlgBg').classList.contains('hidden'));
  ok('sin dejar el markup puesto', w.document.getElementById('dlgBg').innerHTML === '');

  const p2 = D.confirmar({ titulo: 'x' });
  await latir();
  pulsar(w, 'dlgNo');
  ok('y el otro que no', (await p2) === false);
}

console.log('\ncancelar es lo que pasa por defecto');
{
  const w = montar();
  const D = w.BarStockDialog;

  // Tocar fuera. Cancelar es la respuesta segura, asi que cerrar de
  // cualquier otra forma tiene que valer como cancelar — nunca como si.
  const p = D.confirmar({ titulo: 'Restart the cycle?', peligro: true });
  await latir();
  const bg = w.document.getElementById('dlgBg');
  bg.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok('tocar fuera cancela', (await p) === false);

  const p2 = D.confirmar({ titulo: 'x' });
  await latir();
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('Escape tambien', (await p2) === false);

  // Pulsar DENTRO de la tarjeta no cierra nada: si no, arrastrar el
  // dedo para leer el texto contesta por ti.
  const p3 = D.confirmar({ titulo: 'x' });
  await latir();
  w.document.querySelector('.dlg-modal')
   .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await latir();
  ok('pulsar dentro no cierra', !w.document.getElementById('dlgBg').classList.contains('hidden'));
  pulsar(w, 'dlgNo');
  await p3;
}

console.log('\nlo que destruye algo se ve distinto');
{
  const w = montar();
  const D = w.BarStockDialog;

  const p = D.confirmar({ titulo: 'Restart the cycle?',
    aviso: 'On hand goes back to zero for all 262 items.', peligro: true });
  await latir();
  ok('la tarjeta va marcada', !!w.document.querySelector('.dlg-modal.peligro'));
  ok('y la consecuencia va aparte, no mezclada en el cuerpo',
     !!w.document.querySelector('.dlg-aviso'));
  ok('con el numero dentro',
     /262 items/.test(w.document.querySelector('.dlg-aviso').textContent));
  pulsar(w, 'dlgNo'); await p;

  const p2 = D.confirmar({ titulo: 'Switch vendor?' });
  await latir();
  ok('y una normal no se marca', !w.document.querySelector('.dlg-modal.peligro'));
  pulsar(w, 'dlgNo'); await p2;
}

console.log('\navisar no pregunta');
{
  const w = montar();
  const D = w.BarStockDialog;

  const p = D.avisar({ titulo: 'This vendor does not take manual order lines.' });
  await latir();
  ok('un solo boton', !!w.document.getElementById('dlgSi') && !w.document.getElementById('dlgNo'));
  ok('que ocupa el ancho', !!w.document.querySelector('.dlg-foot.solo'));
  pulsar(w, 'dlgSi');
  await p;
  ok('y se cierra al pulsarlo', w.document.getElementById('dlgBg').classList.contains('hidden'));

  // Comodidad: una cadena suelta es el titulo.
  const p2 = D.avisar('Algo pasó');
  await latir();
  ok('acepta una cadena suelta', /Algo pasó/.test(w.document.getElementById('dlgBg').textContent));
  pulsar(w, 'dlgSi'); await p2;
}

console.log('\nuna sola a la vez');
{
  const w = montar();
  const D = w.BarStockDialog;

  const a = D.confirmar({ titulo: 'La primera' });
  const b = D.confirmar({ titulo: 'La segunda' });
  await latir();
  ok('solo hay una tarjeta', w.document.querySelectorAll('.dlg-modal').length === 1);
  ok('y es la primera', /La primera/.test(w.document.getElementById('dlgBg').textContent));

  pulsar(w, 'dlgSi');
  ok('la primera contesta', (await a) === true);
  await latir();
  ok('y entonces sale la segunda',
     /La segunda/.test(w.document.getElementById('dlgBg').textContent));
  pulsar(w, 'dlgNo');
  ok('que contesta la suya', (await b) === false);
}

console.log('\nel texto se escapa');
{
  const w = montar();
  const D = w.BarStockDialog;
  // Los mensajes llevan nombres de proveedor y de producto, y esos
  // vienen de datos.
  const p = D.confirmar({ titulo: 'Hide <img src=x onerror=alert(1)>?' });
  await latir();
  const bg = w.document.getElementById('dlgBg');
  ok('no se cuela una etiqueta', !bg.querySelector('img'));
  ok('pero el texto se lee', /onerror/.test(bg.textContent));
  pulsar(w, 'dlgNo'); await p;
}

console.log('\nel telefono ya no llama a los del navegador');
{
  // Lo que queda es el respaldo por si `dialog.js` no cargara. La
  // guarda: un archivo que llame al del navegador tiene que conocer
  // tambien el de la app — si no, es una alerta nueva que se olvido.
  const dir = path.join(RAIZ, 'src');
  const malos = [];
  fs.readdirSync(dir).filter(f => /^mobile-.*\.js$/.test(f)).forEach(f => {
    const s = fs.readFileSync(path.join(dir, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const nativo = /window\.(confirm|alert)\s*\(|[^.\w](confirm|alert)\s*\(/.test(s);
    if (nativo && !/BarStockDialog/.test(s)) malos.push(f);
  });
  ok('ningun modulo del movil pregunta sin el dialogo de la app',
     malos.length === 0, malos.join(', '));

  // Y el armazon, que es por donde entra el boton de escanear.
  const shell = fs.readFileSync(path.join(dir, 'mobile-shell.js'), 'utf8');
  ok('el armazon lo usa', /BarStockDialog/.test(shell));

  // El modulo y su hoja se cargan, y la hoja antes de que nadie pinte.
  const idx = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  ok('dialog.js se carga', /src\/dialog\.js/.test(idx));
  ok('y dialog.css tambien', /styles\/dialog\.css/.test(idx));
}

console.log('\n' + (falla ? falla + ' MAL' : 'todo bien') +
            '   ·   ' + (pasa + falla) + ' comprobaciones');
process.exit(falla ? 1 : 0);

})();
