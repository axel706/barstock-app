# Una franja de la foto ampliada con una rejilla de alturas (cada 1 %,
# las de 5 % más marcadas) y de ancho (cada 10 % del ancho de la botella
# desde el eje). Para lo que no se mide por color (un dibujo, una
# ilustración): se lee sobre la rejilla, no a ojo sobre la foto entera.
# Las cifras se miden con las otras herramientas; ésta dice qué hay.
#
# Uso: python3 -I tools/marcas/rejilla.py <carpeta> clave desde hasta [alto_px]
#   Escribe <carpeta>/rej-<clave>-<desde>-<hasta>.png
import json, sys
from PIL import Image, ImageDraw

D, k = sys.argv[1], sys.argv[2]
lo, hi = float(sys.argv[3]), float(sys.argv[4])
H = int(sys.argv[5]) if len(sys.argv) > 5 else 800
c = json.load(open(D + '/cajas.json'))[k]
h = c['bot'] - c['top']; w = c['r'] - c['l']; xc = (c['l'] + c['r']) / 2
ya, yb = c['bot'] - hi * h, c['bot'] - lo * h
im = Image.open(c['f']).convert('RGB').crop((c['l'], int(ya), c['r'] + 1, int(yb) + 1))
s = H / im.size[1]; im = im.resize((max(1, int(im.size[0] * s)), H))
M = 48
out = Image.new('RGB', (im.size[0] + M, H + 14), (20, 20, 20)); out.paste(im, (M, 7)); d = ImageDraw.Draw(out)
Y = lambda f: 7 + (c['bot'] - f * h - int(ya)) * s
X = lambda u: M + (xc + u * w / 2 - c['l']) * s
for i in range(int(lo * 100), int(hi * 100) + 1):
    y = Y(i / 100); fuerte = i % 5 == 0
    d.line([(M - 6, y), (out.size[0], y)], fill=(255, 40, 40) if fuerte else (0, 170, 255), width=1)
    d.text((2, y - 6), f'{i / 100:.2f}', fill=(255, 255, 255))
for j in range(-10, 11, 2):
    x = X(j / 10); d.line([(x, 7), (x, 7 + H)], fill=(255, 220, 0) if j == 0 else (90, 90, 90), width=1)
out.save(f'{D}/rej-{k}-{lo}-{hi}.png')
print(f'{D}/rej-{k}-{lo}-{hi}.png')
