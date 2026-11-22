// La lámina de una tanda de marcas: por botella, la foto, el dibujo como
// lo pinta el panel de conteo y el dibujo ENCIMA de la foto (enc-<clave>.png
// de encima.js). Es lo que Axel revisa antes de que una tanda vaya a main:
// la tercera columna es la que dice si cada etiqueta cae en su sitio y a
// su tamaño.
//
// Uso: node tools/marcas/lamina.js <carpeta> <n.º de tanda> clave [clave…]
// Lee <carpeta>/cajas.json (con `nombre` opcional en cada clave) y escribe
// <carpeta>/lamina-marcas-<n>.html. Correr antes encima.js con las mismas
// claves.
const fs = require('fs');
const path = require('path');
const D = path.resolve(process.argv[2]);
const n = process.argv[3];
const claves = process.argv.slice(4);
global.window = {};
new Function(fs.readFileSync(path.join(__dirname, '../../src/bottle-profiles.js'), 'utf8'))();
const B = window.BarStockBottleProfiles;
const cajas = JSON.parse(fs.readFileSync(path.join(D, 'cajas.json'), 'utf8'));
const tipos = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const datos = (f) => 'data:' + (tipos[path.extname(f).toLowerCase()] || 'image/png') + ';base64,' + fs.readFileSync(f).toString('base64');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const H = 360;
const tarjeta = (k) => {
  const asp = B.PROFILES[k].asp, W = Math.round(H / asp) + 16, P = 6;
  const d = B.pathFor(k, W, H, P), y = B.yToPx(k, B.heightFor(k, 0.55), W, H, P);
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><defs><clipPath id="c-${k}"><path d="${d}"/></clipPath></defs>
   <path d="${d}" class="vid"/><g clip-path="url(#c-${k})"><rect class="liq" x="0" y="${y.toFixed(1)}" width="${W}" height="${H}"/>${B.marcasFor(k, W, H, P)}</g><path d="${d}" class="borde"/></svg>`;
  const nom = esc(cajas[k].nombre || k);
  return `<figure><figcaption>${nom}</figcaption><div class="par"><img src="${datos(cajas[k].f)}" alt="${nom}" style="height:${H}px"><div class="dib">${svg}</div><img src="${datos(path.join(D, 'enc-' + k + '.png'))}" alt="" style="height:${H}px"></div></figure>`;
};
const html = `<title>Bottle labels batch ${esc(n)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&display=swap">
<style>
:root{--bg:#0b1220;--fg:#fff;--note:#94a3b8;--borde:rgba(255,255,255,.12);--tinta:rgba(15,23,42,.62);
 --f:"Plus Jakarta Sans",system-ui,-apple-system,sans-serif;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font-family:var(--f);padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:24px 40px}
h1{font-size:22px;margin:0}
p{color:var(--note);max-width:66ch;line-height:1.5;font-size:14px;margin:8px 0 0}
.lote{display:flex;flex-wrap:wrap;gap:16px;margin-top:20px}
figure{margin:0;background:var(--tinta);border:1px solid var(--borde);border-radius:20px;padding:12px 14px;display:grid;gap:10px;min-width:0;max-width:100%}
figcaption{font-weight:800;font-size:14px}
.par{display:flex;gap:14px;align-items:flex-end;overflow-x:auto}
.par img{border-radius:10px;display:block;flex:0 0 auto}
.dib{background:#0f172a;border-radius:12px;padding:4px;flex:0 0 auto}
.vid{fill:rgba(255,255,255,.04)}
.borde{fill:none;stroke:rgba(255,255,255,.55);stroke-width:1.4}
.liq{fill:rgba(217,119,6,.55)}
.cp-marca{fill:none;stroke:#fde68a;stroke-opacity:.32;stroke-width:1;stroke-dasharray:4 3;vector-effect:non-scaling-stroke}
.cp-barra{fill:#fde68a;fill-opacity:.5}
.cp-barra-arco{fill:none;stroke:#fde68a;stroke-opacity:.5;stroke-linecap:round}
</style>
<h1>Bottle labels · batch ${esc(n)}, measured</h1>
<p>Each bottle: the photo, the drawing as the count panel shows it, and the drawing ON the photo at the same scale (labels in green, text in pink). The third picture is the check: every label and line of text has to fall on the real one, at its real height, size, tilt and curve.</p>
<div class="lote">${claves.map(tarjeta).join('')}</div>`;
fs.writeFileSync(path.join(D, 'lamina-marcas-' + n + '.html'), html);
console.log('lamina-marcas-' + n + '.html');
