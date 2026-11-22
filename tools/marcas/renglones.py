# Los renglones de texto de una franja: en cada fila del centro de la
# botella, qué parte de los píxeles se aleja del color de esa fila (la
# tinta). Las filas con tinta seguidas son un renglón: imprime su altura
# de abajo y de arriba (fracción de la botella, 0 la base), su grueso y
# qué parte del ancho ocupa (para `largo`). El grueso de un renglón es el
# de sus letras, no a ojo.
#
# Uso: python3 -I tools/marcas/renglones.py <carpeta> clave desde hasta [umbral] [ancho]
#   umbral: distancia de color que cuenta como tinta (de entrada 70).
#   ancho: la parte central del ancho que se mira (de entrada 0.96).
import json, sys
import numpy as np
from PIL import Image

D, k = sys.argv[1], sys.argv[2]
lo, hi = float(sys.argv[3]), float(sys.argv[4])
umbral = float(sys.argv[5]) if len(sys.argv) > 5 else 70
parte = float(sys.argv[6]) if len(sys.argv) > 6 else 0.96
c = json.load(open(D + '/cajas.json'))[k]
a = np.asarray(Image.open(c['f']).convert('RGB')).astype(float)
h = c['bot'] - c['top']; w = c['r'] - c['l']
alto = lambda y: (c['bot'] - y) / h
xc = (c['l'] + c['r']) / 2
x0, x1 = int(xc - w * parte / 2), int(xc + w * parte / 2)
y0, y1 = int(c['bot'] - hi * h), int(c['bot'] - lo * h)
filas = []
for y in range(y0, y1):
    fila = a[y, x0:x1]
    med = np.median(fila, 0)
    tinta = np.sqrt(((fila - med) ** 2).sum(1)) > umbral
    filas.append((y, tinta.mean(), np.where(tinta)[0]))
min_f = 0.03
grupos, g = [], []
for y, f, xs in filas:
    if f > min_f: g.append((y, xs))
    elif g: grupos.append(g); g = []
if g: grupos.append(g)
# El ancho de un renglón: la sombra del vidrio en los lados también se
# aleja del color de la fila, así que cada columna se compara con la
# misma columna en las filas de justo encima (vidrio o papel sin tinta);
# cuenta la que tiene tinta en buena parte del renglón y no encima.
def tinta_en(ys):
    m = np.zeros(x1 - x0)
    for y in ys:
        fila = a[y, x0:x1]
        m += np.sqrt(((fila - np.median(fila, 0)) ** 2).sum(1)) > umbral
    return m / max(1, len(ys))
for g in grupos:
    if len(g) < 2: continue
    ya, yb = g[0][0], g[-1][0]
    n = yb - ya + 1
    ref = tinta_en(range(max(0, ya - n - 2), max(0, ya - 2)))
    col = tinta_en(range(ya, yb + 1)) - ref
    xs = np.where(col > 0.2)[0]
    ancho = (xs.max() - xs.min() + 1) / w if len(xs) else 0
    centro = ((xs.max() + xs.min()) / 2 + x0 - xc) / (w / 2) if len(xs) else 0
    print(f'{alto(yb + 1):.3f}–{alto(ya):.3f}  grueso {n / h:.3f}  largo {ancho:.2f} del ancho  centro {centro:+.2f}')
