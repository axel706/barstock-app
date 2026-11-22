# Mide una banda o etiqueta por su COLOR: en cada columna del centro de la
# botella busca el primer y el último píxel de ese color dentro de una
# franja de alturas, y ajusta una recta a cada borde. Da la altura de
# cada borde (fracción de la botella, 0 la base) y su inclinación en
# grados (positivo sube a la derecha, como `rot` y `pend` de marcasFor).
# Así salió Red Label a 19° (su rojo) y Aperol a 14° (su azul); a ojo,
# Red Label salió 32° y luego 24°.
#
# Uso: python3 -I tools/marcas/color.py <carpeta> clave desde hasta R,G,B [tolerancia]
#   desde/hasta: la franja de alturas donde buscar (0–1).
import json, sys
import numpy as np
from PIL import Image

D, k = sys.argv[1], sys.argv[2]
lo, hi = float(sys.argv[3]), float(sys.argv[4])
rgb = np.array([int(v) for v in sys.argv[5].split(',')], float)
tol = float(sys.argv[6]) if len(sys.argv) > 6 else 60
c = json.load(open(D + '/cajas.json'))[k]
a = np.asarray(Image.open(c['f']).convert('RGB')).astype(float)
h = c['bot'] - c['top']; w = c['r'] - c['l']
alto = lambda y: (c['bot'] - y) / h
ok = np.sqrt(((a - rgb) ** 2).sum(2)) < tol
y0, y1 = int(c['bot'] - hi * h), int(c['bot'] - lo * h)
xs, arr, aba = [], [], []
# El centro del ancho: en los lados el vidrio curva la etiqueta.
for x in range(int(c['l'] + w * 0.2), int(c['r'] - w * 0.2)):
    ys = np.where(ok[y0:y1, x])[0]
    if len(ys) < 3: continue
    xs.append(x); arr.append(y0 + ys[0]); aba.append(y0 + ys[-1])
if len(xs) < 5: sys.exit('casi ningún píxel de ese color en la franja: revisa el color o la tolerancia')
xs = np.array(xs, float)
for nombre, ys in (('arriba', arr), ('abajo', aba)):
    m, b = np.polyfit(xs, np.array(ys, float), 1)
    xc = (c['l'] + c['r']) / 2
    print(f'{nombre}: altura en el centro {alto(m * xc + b):.3f}  inclinación {np.degrees(np.arctan(-m)):.1f}°  ({len(xs)} columnas)')
