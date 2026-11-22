# Busca los bordes horizontales de las etiquetas en la foto: filas donde el
# color cambia de golpe a lo ancho de la botella. Imprime cada borde con su
# altura como fracción de la botella (0 la base, 1 arriba), su fuerza y
# cuánto del ancho lo cruza. Es ruidoso (el reflejo del vidrio también es
# un borde): sirve para encontrar candidatos, no para dar una medida sin
# mirarla encima de la foto con encima.js.
#
# Uso: python3 -I tools/marcas/bordes.py <carpeta> clave desde hasta
import json, sys
import numpy as np
from PIL import Image

c = json.load(open(sys.argv[1] + '/cajas.json'))[sys.argv[2]]
lo, hi = float(sys.argv[3]), float(sys.argv[4])
a = np.asarray(Image.open(c['f']).convert('RGB')).astype(float)
h = c['bot'] - c['top']; w = c['r'] - c['l']
f = lambda y: (c['bot'] - y) / h
# Sólo el centro del ancho (los bordes del vidrio también cambian).
x0 = int(c['l'] + w * 0.22); x1 = int(c['r'] - w * 0.22)
g = np.abs(np.diff(a[:, x0:x1, :], axis=0)).sum(2)   # cambio fila a fila
fuerte = g > 60
cubre = fuerte.mean(1)                                # parte del ancho que cambia
fil = np.convolve(cubre, np.ones(3) / 3, 'same')
cands = []
for y in range(1, len(fil) - 1):
    fy = f(y)
    if not (lo <= fy <= hi): continue
    if fil[y] >= fil[y - 1] and fil[y] >= fil[y + 1] and fil[y] > 0.35:
        cands.append((round(fy, 3), round(float(fil[y]), 2), y))
for fy, cov, y in cands:
    print(f'{fy:.3f}  cubre {cov:.2f}  fila {y}')
