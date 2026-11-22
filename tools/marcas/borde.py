# La forma de un borde de color: para cada columna (de -1 a 1 del ancho
# de la botella), la altura del primer o el último píxel de ese color
# dentro de una franja. Dice si el borde es recto, inclinado o en arco, y
# cuánto: la flecha (centro contra los extremos) como parte del ancho,
# que es lo que piden `arco` de una etiqueta y de un texto.
#
# Uso: python3 -I tools/marcas/borde.py <carpeta> clave desde hasta R,G,B arriba|abajo [tolerancia]
import json, sys
import numpy as np
from PIL import Image

D, k = sys.argv[1], sys.argv[2]
lo, hi = float(sys.argv[3]), float(sys.argv[4])
rgb = np.array([int(v) for v in sys.argv[5].split(',')], float)
lado = sys.argv[6]
tol = float(sys.argv[7]) if len(sys.argv) > 7 else 50
c = json.load(open(D + '/cajas.json'))[k]
a = np.asarray(Image.open(c['f']).convert('RGB')).astype(float)
h = c['bot'] - c['top']; w = c['r'] - c['l']; xc = (c['l'] + c['r']) / 2
ok = np.sqrt(((a - rgb) ** 2).sum(2)) < tol
y0, y1 = int(c['bot'] - hi * h), int(c['bot'] - lo * h)
pts = []
for x in range(c['l'], c['r'] + 1):
    ys = np.where(ok[y0:y1, x])[0]
    if len(ys) < 3: continue
    y = y0 + (ys[0] if lado == 'arriba' else ys[-1])
    pts.append(((x - xc) / (w / 2), (c['bot'] - y) / h))
if len(pts) < 5: sys.exit('casi nada de ese color')
pts = np.array(pts)
for q in np.linspace(pts[0, 0], pts[-1, 0], 9):
    i = np.argmin(abs(pts[:, 0] - q)); print(f'x {pts[i,0]:+.2f}: {pts[i,1]:.3f}')
# Parábola: altura = a·x² + b·x + c. b da la inclinación; a, el arco.
# Lo que no es borde (un dibujo dentro de la etiqueta, un reflejo) se
# descarta: dos vueltas quitando lo que se aleja más de 3 veces la
# desviación típica del ajuste.
for _ in range(2):
    A, B, C = np.polyfit(pts[:, 0], pts[:, 1], 2)
    res = pts[:, 1] - np.polyval([A, B, C], pts[:, 0])
    mad = np.median(abs(res)) * 1.5 + 1e-4
    pts = pts[abs(res) < 3 * mad]
A, B, C = np.polyfit(pts[:, 0], pts[:, 1], 2)
x0, x1 = pts[0, 0], pts[-1, 0]
anch = (x1 - x0) * w / 2        # en píxeles
flecha = -A * ((x1 - x0) / 2) ** 2 * h   # px, positiva = el centro más alto (∩)
print(f'centro {C:.3f}  inclinación {np.degrees(np.arctan(B * h / (w / 2))):.1f}°  flecha {flecha / anch:+.3f} del ancho ({"∩" if flecha > 0 else "∪"})')
