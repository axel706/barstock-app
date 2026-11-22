// Pone el dibujo de las marcas ENCIMA de la foto, a la misma escala y con
// la base alineada, para medir en vez de mirar. La silueta y la foto
// tienen la misma proporción, así que una altura o un ángulo en la foto
// es el mismo en el dibujo. Dos rondas a ojo salieron mal (Red Label a
// 32° cuando eran 19°): por eso esto existe.
//
// Uso: node tools/marcas/encima.js <carpeta> clave [clave…]
// <carpeta>/cajas.json: { clave: { f: ruta de la foto, top, bot, l, r, w, h } }
// (la caja de la botella dentro de la foto, en píxeles). Escribe
// <carpeta>/enc-<clave>.png: etiquetas en verde, texto en rosa.
// Las fotos NO van al repo (es público): viven en el scratchpad.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const D = path.resolve(process.argv[2]);
global.window = {};
new Function(fs.readFileSync(path.join(__dirname, '../../src/bottle-profiles.js'), 'utf8'))();
const B = window.BarStockBottleProfiles;
const info = JSON.parse(fs.readFileSync(path.join(D, 'cajas.json'), 'utf8'));
(async () => {
  // Dentro del repo carga el Playwright del proyecto, que no trae su
  // navegador; si está el Chromium de la máquina, se usa ése.
  const exe = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
  const p = await b.newPage();
  for (const k of process.argv.slice(3)) {
    const c = info[k];
    const H = 700, asp = B.PROFILES[k].asp, W = Math.round(H / asp) + 40;
    const bx = B.boxFor(k, W, H, 0);
    const esc = bx.usable / (c.bot - c.top);
    const left = bx.cx - ((c.l + c.r) / 2) * esc, top = bx.base - c.bot * esc;
    const html = `<html><body style="margin:0;background:#111">
      <div style="position:relative;width:${W}px;height:${H}px;overflow:hidden">
        <img src="file://${path.resolve(c.f)}" style="position:absolute;left:${left}px;top:${top}px;width:${c.w * esc}px;height:${c.h * esc}px;opacity:.75">
        <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="position:absolute;left:0;top:0">
          <path d="${B.pathFor(k, W, H, 0)}" fill="none" stroke="#0ff" stroke-width="1"/>
          <g>${B.marcasFor(k, W, H, 0)}</g></svg></div>
      <style>.cp-marca{fill:none;stroke:#0f0;stroke-width:2;stroke-dasharray:5 3}.cp-barra{fill:#f0f;fill-opacity:.55}.cp-barra-arco{fill:none;stroke:#f0f;stroke-opacity:.55;stroke-linecap:round}</style>
      </body></html>`;
    const f = path.join(D, 'enc-' + k + '.html');
    fs.writeFileSync(f, html);
    await p.setViewportSize({ width: W, height: H });
    await p.goto('file://' + f);
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(D, 'enc-' + k + '.png') });
    console.log('enc-' + k + '.png');
  }
  await b.close();
})();
