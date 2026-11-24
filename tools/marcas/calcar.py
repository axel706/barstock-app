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
#   --envuelve   una etiqueta que da la VUELTA a la botella: de frente llega
#                de borde a borde, así que sus lados van a ±1.15 (más allá
#                del borde) y la silueta la recorta. Sólo se calcan su borde
#                de arriba y el de abajo, columna por columna dentro de
#                --lados (0.9), con una mediana de 7 columnas que quita las
#                muescas de brillos y sombras. WhistlePig salió cortada por
#                dentro (Axel: "debe envolver la botella, no cortarse").
#   --lados N    hasta qué x se mide el borde con --envuelve (0.9: más allá,
#                el vidrio del canto se confunde con la etiqueta)
#   --espejo L   L = izq o der: calca sólo esa mitad y la refleja (una
#                etiqueta simétrica con la sombra mordiendo un lado)
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
envuelve = '--envuelve' in args
if envuelve: args.remove('--envuelve')
lados = float(opcion('--lados', 0.9))
espejo = opcion('--espejo', None)
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
def mediana(v, n=7):
    h = n // 2
    return np.array([np.median(v[max(0, i - h):i + h + 1]) for i in range(len(v))])
def simplificar(xy):
    if len(xy) < 3: return xy
    return [tuple(q) for q in measure.approximate_polygon(np.array(xy, float), simple)]
for p in elegidas:
    pieza = morphology.remove_small_holes(lab == p.label, max_size=200)
    if envuelve:
        # Sus dos bordes, columna por columna (en píxeles de la franja).
        # Cada borde se mide dentro del ancho de la botella A SU ALTURA (del
        # alfa de la foto): en una botella que se estrecha (Frangelico), las
        # columnas de los lados bajaban por el canto y el borde de arriba
        # caía en las esquinas.
        alfa = np.asarray(Image.open(c['f']).convert('RGBA'))[..., 3] > 40
        def radio(fila_franja):
            f = alfa[int(fila_franja) + r0]; xs_ = np.nonzero(f)[0]
            return (xs_.max() - xs_.min()) / 2 / medio if len(xs_) else 1
        def borde_col(cual):
            centro = [x for x in range(pieza.shape[1]) if abs((x - cx) / medio) <= 0.3 and pieza[:, x].any()]
            f0 = np.median([(np.nonzero(pieza[:, x])[0].min() if cual == 'arr' else np.nonzero(pieza[:, x])[0].max()) for x in centro])
            lim = lados * radio(f0)
            cols = [x for x in range(pieza.shape[1]) if abs((x - cx) / medio) <= lim and pieza[:, x].any()]
            if espejo == 'izq': cols = [x for x in cols if x <= cx]
            if espejo == 'der': cols = [x for x in cols if x >= cx]
            v = np.array([(np.nonzero(pieza[:, x])[0].min() if cual == 'arr' else np.nonzero(pieza[:, x])[0].max() + 1) for x in cols], float)
            return [(x - cx) / medio for x in cols], mediana(v)
        def con_espejo(X, v):
            if not espejo: return X, v
            if espejo == 'der': X, v = [-q for q in X][::-1], v[::-1]
            return X + [-q for q in X[::-1]], np.concatenate([v, v[::-1]])
        Xa, arr = con_espejo(*borde_col('arr'))
        Xb, aba = con_espejo(*borde_col('aba'))
        alto = lambda r: (c['bot'] - (r + r0)) / H
        top = simplificar([(x * medio, r) for x, r in zip(Xa, arr)])
        bot = simplificar([(x * medio, r) for x, r in zip(Xb, aba)])
        pts = ([[-1.15, round(alto(top[0][1]), 4)]] + [[round(x / medio, 3), round(alto(r), 4)] for x, r in top] +
               [[1.15, round(alto(top[-1][1]), 4)], [1.15, round(alto(bot[-1][1]), 4)]] +
               [[round(x / medio, 3), round(alto(r), 4)] for x, r in bot[::-1]] + [[-1.15, round(alto(bot[0][1]), 4)]])
        pol = [((c['bot'] - y * H) - r0, cx + x * medio) for x, y in pts]
    else:
        borde = max(measure.find_contours(np.pad(pieza, 2).astype(float), 0.5), key=len) - 2
        pol = measure.approximate_polygon(borde, simple)[:-1]
        pts = [[round((q[1] - cx) / medio, 3), round((c['bot'] - (q[0] + r0)) / H, 4)] for q in pol]
        if espejo:
            # La mitad tiene que ir SEGUIDA: el contorno empieza en cualquier
            # punto, y tomar los de un lado sin más los desordenaba (el
            # reflejo salía cruzado). Se rota para empezar donde entra a
            # esa mitad.
            lado = (lambda q: q[0] <= 0) if espejo == 'izq' else (lambda q: q[0] >= 0)
            n = len(pts)
            i0 = next((i for i in range(n) if lado(pts[i]) and not lado(pts[i - 1])), 0)
            pts = pts[i0:] + pts[:i0]
            mitad = []
            for q in pts:
                if not lado(q): break
                mitad.append(q)
            pts = mitad + [[-x, y] for x, y in mitad[::-1] if x != 0]
            pol = [((c['bot'] - y * H) - r0, cx + x * medio) for x, y in pts]
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
