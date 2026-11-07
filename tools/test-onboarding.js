#!/usr/bin/env node
/*
 * ── La bienvenida: Reply To y perfil del remitente ───────────────────
 *
 * Era una tarjeta de dos columnas, explicación a la izquierda y cinco
 * campos a la derecha, con letra de 13px. En el teléfono quedaba
 * apretada, los campos cortados, y al tocar uno iOS ampliaba la pantalla
 * sin vuelta atrás. Axel eligió sobre lámina dos pasos, y pidió que se
 * quedaran la explicación y el "Skip for now".
 *
 * Lo que se protege:
 *
 *   1. Paso 1: la explicación, el Reply To, Continue y Skip for now.
 *   2. Sin correo, o con uno mal escrito, no se avanza y se dice por qué.
 *   3. Skip for now cierra SIN guardar nada, como antes.
 *   4. Paso 2: el perfil, la firma que se escribe sola, Back.
 *   5. "Skip this step" guarda solo el Reply To; "Save & continue", los dos.
 *   6. Lo que ya estuviera guardado se trae puesto.
 *   7. Los campos a 16px en táctil (iOS) y no en el escritorio.
 *
 *   node tools/test-onboarding.js
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const RAIZ = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(RAIZ, 'src/onboarding.js'), 'utf8');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d !== undefined ? '   → ' + d : '')); }
}
function grupo(t) { console.log('\n' + t); }
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

async function entorno({ settings = {}, profile = {} } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://app.barstockpro.com/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false });
  w.__guardado = [];
  w.BarStockLocationSettings = { getSettings: async () => settings, saveSettings: async (x) => { w.__guardado.push(['settings', x]); } };
  w.BarStockSenderProfile = { getProfile: async () => profile, saveProfile: async (x) => { w.__guardado.push(['perfil', x]); } };
  w.eval(SRC);
  await w.BarStockOnboarding.checkAndShow();
  await esperar(20);
  return w;
}
const $ = (w, id) => w.document.getElementById(id);
const escribe = (w, id, v) => { const el = $(w, id); el.value = v; el.dispatchEvent(new w.Event('input')); };
const visible = (el) => !!el && !el.hidden && el.style.display !== 'none';

(async () => {

grupo('1 · paso 1');
{
  const w = await entorno();
  prueba('sale la bienvenida', !!$(w, 'bsOnboardingOverlay'));
  prueba('el paso 1 se ve y el 2 no', visible($(w, 'bsObPaso1')) && !visible($(w, 'bsObPaso2')));
  const t = $(w, 'bsObPaso1').textContent;
  prueba('con la explicacion', /sends order emails and cost reports/.test(t) && /Reply To/.test(t), t.slice(0, 90));
  prueba('con Continue', !!$(w, 'bsObNext'));
  prueba('y Skip for now', visible($(w, 'bsObSkip')) && /Skip for now/.test($(w, 'bsObSkip').textContent));
}

grupo('2 · sin correo, o mal escrito, no se avanza');
{
  const w = await entorno();
  $(w, 'bsObNext').click();
  prueba('vacio: se queda en el paso 1', visible($(w, 'bsObPaso1')) && !visible($(w, 'bsObPaso2')));
  prueba('y lo dice', /Add an email/.test($(w, 'bsObErr').textContent), $(w, 'bsObErr').textContent);
  escribe(w, 'bsObReplyTo', 'manager');
  $(w, 'bsObNext').click();
  prueba('mal escrito: tampoco', visible($(w, 'bsObPaso1')));
  prueba('y lo dice', /doesn't look like an email/.test($(w, 'bsObErr').textContent), $(w, 'bsObErr').textContent);
  prueba('el campo en rojo', $(w, 'bsObReplyTo').classList.contains('mal'));
}

grupo('3 · Skip for now no guarda nada');
{
  const w = await entorno();
  escribe(w, 'bsObReplyTo', 'manager@bar.com');
  $(w, 'bsObSkip').click();
  await esperar(450);
  prueba('se cierra', !$(w, 'bsOnboardingOverlay'));
  prueba('sin guardar', w.__guardado.length === 0, JSON.stringify(w.__guardado));
}

grupo('4 · paso 2');
{
  const w = await entorno();
  escribe(w, 'bsObReplyTo', 'manager@bar.com');
  $(w, 'bsObNext').click();
  prueba('con un correo valido, al paso 2', visible($(w, 'bsObPaso2')) && !visible($(w, 'bsObPaso1')));
  prueba('Skip for now ya no se ve (alli esta Skip this step)', !visible($(w, 'bsObSkip')));
  escribe(w, 'bsObName', 'Axel Ramirez'); escribe(w, 'bsObTitle', 'Bar Manager');
  escribe(w, 'bsObEmail', 'axel@bar.com'); escribe(w, 'bsObPhone', '312 555 0192');
  prueba('la firma se escribe sola', $(w, 'bsObFName').textContent === 'Axel Ramirez' &&
    $(w, 'bsObFTitle').textContent === 'Bar Manager' && $(w, 'bsObFContact').textContent === 'axel@bar.com · 312 555 0192');
  $(w, 'bsObBack').click();
  prueba('Back vuelve al paso 1 con el correo puesto', visible($(w, 'bsObPaso1')) && $(w, 'bsObReplyTo').value === 'manager@bar.com');
}

grupo('5 · guardar');
{
  const w = await entorno();
  escribe(w, 'bsObReplyTo', 'manager@bar.com'); $(w, 'bsObNext').click();
  escribe(w, 'bsObName', 'Axel');
  $(w, 'bsObSkipPerfil').click();
  await esperar(30);
  prueba('Skip this step guarda solo el Reply To', JSON.stringify(w.__guardado) === JSON.stringify([['settings', { reply_to_email: 'manager@bar.com' }]]), JSON.stringify(w.__guardado));
}
{
  const w = await entorno();
  escribe(w, 'bsObReplyTo', 'manager@bar.com'); $(w, 'bsObNext').click();
  escribe(w, 'bsObName', 'Axel'); escribe(w, 'bsObEmail', 'axel@bar.com');
  $(w, 'bsObSaveBtn').click();
  await esperar(30);
  const p = w.__guardado.find(x => x[0] === 'perfil');
  prueba('Save & continue guarda los dos', w.__guardado.some(x => x[0] === 'settings') && !!p && p[1].name === 'Axel' && p[1].email === 'axel@bar.com', JSON.stringify(w.__guardado));
}

grupo('6 · lo ya guardado se trae puesto');
{
  const w = await entorno({ settings: { reply_to_email: 'ya@bar.com' }, profile: {} });
  prueba('el Reply To que ya habia', $(w, 'bsObReplyTo').value === 'ya@bar.com', $(w, 'bsObReplyTo').value);
}

grupo('7 · 16px en tactil, no en el escritorio');
{
  const css = SRC;
  prueba('los campos llevan su clase', (SRC.match(/class="bsob-in"/g) || []).length === 5);
  prueba('en tactil, 16px o mas', /@media \(pointer: coarse\)\s*\{\s*#bsOnboardingOverlay \.bsob-in\s*\{\s*font-size:max\(16px/.test(css));
  prueba('sin los 13px de antes en los campos', !/<input[^>]*font-size:13px/.test(SRC));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
