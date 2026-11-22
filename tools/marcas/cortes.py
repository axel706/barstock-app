# Los bordes en una columna: bajando por la botella en x (de -1 a 1, 0 el
# eje), las alturas donde el color cambia de golpe (el borde de una
# etiqueta, de una banda). Con tres columnas (-0.6, 0, 0.6) se ve si un
# borde va recto, inclinado (sube por un lado) o curvo (el centro se
# separa de los lados). Promedia una tira de 5 píxeles de ancho.
#
# Uso: python3 -I tools/marcas/cortes.py <carpeta> clave desde hasta x [x …] [--umbral N]
import json, sys
import numpy as np
from PIL import Image

args = sys.argv[1:]
umbral = 45.0
if '--umbral' in args:
    i = args.index('--umbral'); umbral = float(args[i + 1]); del args[i:i + 2]
D, k, lo, hi = args[0], args[1], float(args[2]), float(args[3])
c = json.load(open(D + '/cajas.json'))[k]
a = np.asarray(Image.open(c['f']).convert('RGB')).astype(float)
h = c['bot'] - c['top']; w = c['r'] - c['l']; xc = (c['l'] + c['r']) / 2
y0, y1 = int(c['bot'] - hi * h), int(c['bot'] - lo * h)
for xa in args[4:]:
    x = int(xc + float(xa) * w / 2)
    col = a[y0:y1 + 1, max(0, x - 2):x + 3].mean(1)
    d = np.sqrt((np.diff(col, axis=0) ** 2).sum(1))
    picos = [i for i in range(1, len(d) - 1) if d[i] > umbral and d[i] >= d[i - 1] and d[i] >= d[i + 1]]
    print(f'x {xa}: ' + '  '.join(f'{(c["bot"] - (y0 + i + 0.5)) / h:.3f}({d[i]:.0f})' for i in picos))
