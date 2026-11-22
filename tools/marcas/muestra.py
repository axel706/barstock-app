# El color de la botella a una altura (en el eje, o corrido con x de -1 a
# 1): para darle a color.py el color de una etiqueta sin adivinarlo.
#
# Uso: python3 -I tools/marcas/muestra.py <carpeta> clave altura[,x] [altura[,x] …]
import json, sys
import numpy as np
from PIL import Image

D, k = sys.argv[1], sys.argv[2]
c = json.load(open(D + '/cajas.json'))[k]
a = np.asarray(Image.open(c['f']).convert('RGB')).astype(int)
h = c['bot'] - c['top']; w = c['r'] - c['l']; xc = (c['l'] + c['r']) / 2
for arg in sys.argv[3:]:
    p = [float(v) for v in arg.split(',')]
    y = int(c['bot'] - p[0] * h); x = int(xc + (p[1] if len(p) > 1 else 0) * w / 2)
    m = np.median(a[max(0, y - 2):y + 3, max(0, x - 2):x + 3].reshape(-1, 3), 0).astype(int)
    print(f'{arg}: {m[0]},{m[1]},{m[2]}')
