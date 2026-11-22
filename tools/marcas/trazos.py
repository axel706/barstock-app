# Convierte los trazos verdes de Axel (en su captura de la vista "encima
# de la foto") en alturas de la botella. Las barras rosas están en las dos
# imágenes: en la mía sé la altura de cada píxel; sus centros dan la
# correspondencia lineal captura -> mi imagen. Imprime las barras de las
# dos y la geometría (base y alto útil en enc-<clave>.png): con dos barras
# emparejadas, una fila de la captura pasa a fila de la mía, y de ahí a
# altura = (base - fila) / alto útil. Así se midieron el borde diagonal
# de Bulleit y la curva de arriba de Dewar's. Ojo: la inclinación de un
# trazo a mano no es la de la etiqueta (Bacardí): una inclinación se
# confirma en la foto (color.py) o se pregunta.
#
# Uso: python3 -I tools/marcas/trazos.py <carpeta> clave captura.png [x0]
#   x0: dónde empieza en la captura la columna de "encima".
import os
import sys, json, subprocess
import numpy as np
from PIL import Image

PERFILES = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../src/bottle-profiles.js')
D, k, captura = sys.argv[1], sys.argv[2], sys.argv[3]

def bandas(mask, minimo):
    rows = np.where(mask.sum(1) > minimo)[0]
    gs = []; ini = prev = None
    for y in rows:
        if prev is None or y > prev + 3:
            if ini is not None: gs.append((ini, prev))
            ini = y
        prev = y
    if ini is not None: gs.append((ini, prev))
    return gs

def rosa(a):
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    return (R > 170) & (B > 160) & (G < 130) & (R - G > 80)

mia = np.asarray(Image.open(f'{D}/enc-{k}.png').convert('RGB')).astype(int)
cap = np.asarray(Image.open(captura).convert('RGB')).astype(int)
# En la captura, sólo la columna de la vista encima (la derecha).
x0 = int(sys.argv[4]) if len(sys.argv) > 4 else 0
capc = cap[:, x0:, :]
bm = [b for b in bandas(rosa(mia), 4)]
bc = [b for b in bandas(rosa(capc), 6)]
print('rosa mia', bm)
print('rosa captura', bc)
# Geometría de mi imagen: la base y el alto útil.
g = json.loads(subprocess.check_output(['node', '-e', f'''
global.window={{}};new Function(require('fs').readFileSync({json.dumps(PERFILES)},'utf8'))();
const B=window.BarStockBottleProfiles;const H=700,asp=B.PROFILES['{k}'].asp,W=Math.round(H/asp)+40;
const bx=B.boxFor('{k}',W,H,0);console.log(JSON.stringify({{base:bx.base,usable:bx.usable}}));''']))
print(g)
