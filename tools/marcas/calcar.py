# Calca una marca de la foto: su contorno de verdad, en vez de describirla
# con números (alto, ancho, arco, cuña). Axel, 2026-11-24, al ver el venado
# de Glenfiddich: "¿por qué no haces con las etiquetas lo que hiciste con
# el venado? Calcarlas". El rectángulo de Chivas, los dos óvalos del venado
# y las cintas casi planas salieron mal por describir a ojo lo que se podía
# calcar.
#
# Uso:
#   python3 -I tools/marcas/calcar.py <carpeta> clave desde hasta COLOR [opciones]
#
#   desde/hasta  la franja de alturas donde está la marca (0 base, 1 boca)
#   COLOR        el color de la marca, "R,G,B" (sácalo con muestra.py), o
#                varios separados por "/" (una etiqueta de dos tonos), o
#                "hsv:H0-H1,Smin,Vmin" por tono (mejor con degradados), y
#                varios criterios sumados con "+" ("hsv:30-63,0.25,0.5+250,250,190")
#   --tol N      distancia de color que todavía es la marca (por defecto 60)
#   --x A,B      sólo entre esas x (de -1 a 1, del radio máximo)
#   --cerrar N   cierra huecos de N px (letras dentro de la etiqueta; 2)
#   --min N      el área mínima de una pieza, en px (por defecto: sólo la
#                más grande; con --min salen todas las que pasen)
#   --simple N   tolerancia al simplificar el borde, en px (1.2)
#
# Imprime una marca `dibujo` por pieza, lista para bottle-profiles.js:
#   {tipo: 'dibujo', puntos: [[x, y], …]}
# con x como parte del radio máximo desde el eje (la mitad del ancho de la
# caja) e y como altura: las MISMAS medidas de la silueta, que salió de la
# misma foto, así que no hay que redimensionar nada.
# Escribe <carpeta>/calco-<clave>.png: la franja ampliada con la máscara en
# amarillo y el contorno en rosa. Se mira ANTES de creérselo; después,
# encima.js con el dibujo puesto.
import json, sys
import numpy as np
from PIL import Image, ImageDraw
from skimage import measure, morphology

args = sys.argv[1:]
def opcion(nombre, defecto):
    if nombre in args:
        i = args.index(nombre); v = args[i + 1]; del args[i:i + 2]; return v
    return defecto
tol = float(opcion('--tol', 60))
xs = opcion('--x', None)
cerrar = int(opcion('--cerrar', 2))
minimo = opcion('--min', None)
simple = float(opcion('--simple', 1.2))
D, k, desde, hasta, color = args[0], args[1], float(args[2]), float(args[3]), args[4]

c = json.load(open(D + '/cajas.json'))[k]
im = np.asarray(Image.open(c['f']).convert('RGB')).astype(int)
H = c['bot'] - c['top']; cx = (c['l'] + c['r']) / 2; medio = (c['r'] - c['l']) / 2
fila = lambda y: int(round(c['bot'] - y * H))
r0, r1 = fila(hasta), fila(desde)
franja = im[r0:r1]

# La máscara: cerca de alguno de los colores dados, o, con "hsv:", por
# tono. La distancia RGB sola falla en los degradados: con el venado se
# comía una franja de vidrio amarillento y dejaba fuera el brillo.
def mascara(crit):
    if crit.startswith('hsv:'):
        # hsv:H0-H1,Smin,Vmin   (H en grados 0–360; S y V de 0 a 1). H0 > H1
        # da la vuelta por el rojo (330-20).
        hh, smin, vmin = crit[4:].split(',')
        h0, h1 = [float(v) for v in hh.split('-')]
        hsv = np.asarray(Image.fromarray(franja.astype('uint8')).convert('HSV')).astype(float)
        H_, S_, V_ = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255
        enTono = (H_ >= h0) & (H_ <= h1) if h0 <= h1 else (H_ >= h0) | (H_ <= h1)
        return enTono & (S_ >= float(smin)) & (V_ >= float(vmin))
    r = np.zeros(franja.shape[:2], bool)
    for col in [np.array([int(v) for v in t.split(',')]) for t in crit.split('/')]:
        r |= np.sqrt(((franja - col) ** 2).sum(2)) <= tol
    return r
# Varios criterios con "+" se suman (el dorado por tono + su brillo casi
# blanco por color, que ya no tiene tono).
m = np.zeros(franja.shape[:2], bool)
for crit in color.split('+'):
    m |= mascara(crit)
if xs:
    a, b = [float(v) for v in xs.split(',')]
    cols_x = np.arange(franja.shape[1])
    m &= ((cols_x - cx) / medio >= a)[None, :] & ((cols_x - cx) / medio <= b)[None, :]
if cerrar:
    m = morphology.closing(m, morphology.disk(cerrar))

lab = measure.label(m)
piezas = sorted(measure.regionprops(lab), key=lambda r: -r.area)
if not piezas:
    sys.exit('nada de ese color en esa franja: prueba otro color o más --tol')
elegidas = [p for p in piezas if p.area >= int(minimo)] if minimo else piezas[:1]

vista = Image.fromarray(franja.astype('uint8')).convert('RGB')
esc = max(1, round(900 / max(franja.shape)))
vista = vista.resize((franja.shape[1] * esc, franja.shape[0] * esc))
capa = ImageDraw.Draw(vista, 'RGBA')
for p in elegidas:
    pieza = morphology.remove_small_holes(lab == p.label, max_size=200)
    borde = max(measure.find_contours(np.pad(pieza, 2).astype(float), 0.5), key=len) - 2
    pol = measure.approximate_polygon(borde, simple)[:-1]
    pts = [[round((q[1] - cx) / medio, 3), round((c['bot'] - (q[0] + r0)) / H, 4)] for q in pol]
    print("{tipo: 'dibujo', puntos: [" + ', '.join('[%s, %s]' % (a, b) for a, b in pts) + ']},')
    print('  // %d puntos · alto %.3f–%.3f · x %.2f a %.2f · %d px' % (
        len(pts), min(q[1] for q in pts), max(q[1] for q in pts), min(q[0] for q in pts), max(q[0] for q in pts), p.area), file=sys.stderr)
    # Relleno y borde gruesos: con un borde de 1 px y el relleno tenue no se
    # veía dónde acababa una etiqueta clara sobre el licor.
    xy = [(q[1] * esc, q[0] * esc) for q in pol]
    capa.polygon(xy, fill=(0, 255, 255, 60))
    capa.line(xy + xy[:1], fill=(255, 0, 255, 255), width=3)
vista.save(D + '/calco-' + k + '.png')
print(D + '/calco-' + k + '.png', file=sys.stderr)
