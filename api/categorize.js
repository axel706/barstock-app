const ANTHROPIC_MODEL = process.env.ANTHROPIC_CATEGORIZE_MODEL || 'claude-sonnet-5';

// ── Categorías por conocimiento, no por texto ────────────────────────
//
// Este endpoint solo recibe los nombres que las reglas del navegador no
// pudieron resolver. Son los que no dicen qué son: Cointreau, Aperol,
// Cinzano, French Blue. No hay palabra que emparejar — hay que saber qué
// es cada producto.
//
// Se manda una sola petición con todos los nombres pendientes. Una por
// artículo sería cientos de llamadas para el mismo trabajo.

// ── Forma y tamaño de botella ──────────────────────────────────────────
//
// Solo llegan aquí los nombres que las reglas del navegador no pudieron
// resolver: los que no dicen qué son ni tienen categoría de la que
// deducirlo.
//
// La forma importa más de lo que parece. El conteo por nivel convierte
// una altura en un volumen, y eso depende de la geometría: media botella
// de Burdeos no es medio litro porque el hombro se cierra arriba. Entre
// una forma y otra hay hasta 15 puntos de diferencia.
async function bottleMode(res, names, shapes, sizes) {
  const SH = Array.isArray(shapes) && shapes.length ? shapes
    : ['bordeaux','burgundy','champagne','whiskey','vodka','tequila','liqueur','cylinder','none'];
  const SZ = Array.isArray(sizes) && sizes.length ? sizes
    : [50,187,200,250,330,355,375,473,500,700,750,1000,1500,1750,3000];

  const prompt =
`You are identifying bottle shapes for a bar's inventory, so the app can turn a liquid level into a volume.

For each product, give the bottle shape and the nominal size in millilitres.

Shapes, use exactly one of these keys:
- bordeaux: wine bottle with a sharp shoulder (cabernet, merlot, bordeaux blends)
- burgundy: wine bottle with a gently sloping shoulder (pinot noir, chardonnay); also most cognac and brandy
- champagne: heavy sparkling wine bottle
- whiskey: straight body with a short square shoulder (most whiskey, bourbon, rum)
- vodka: tall straight body with a long taper
- tequila: wide low body with a long neck
- liqueur: short and wide body
- cylinder: straight sided, no shoulder
- none: not measured by level — beer, cans, kegs, mixers, anything counted whole

Sizes, use exactly one of these numbers: ${SZ.join(', ')}
When the name gives no size, use 750 for spirits and wine.

Rules:
- If you are not confident what a product is, omit it entirely. An omission is fine. A wrong shape is not: it produces a number that looks precise and is false, and nobody re-checks a value that is already filled in.
- Use "none" for anything that is never half-full.

Products:
${names.map(n => '- ' + n).join('\n')}

Reply with JSON only, no prose, in this shape:
{"Product name exactly as given": {"shape": "tequila", "size": 750}, ...}`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!r.ok) {
    const t = await r.text();
    console.error('categorize/bottle: anthropic error', t);
    return res.status(502).json({ ok: false, error: 'Model request failed' });
  }

  const data = await r.json();
  const text = (data.content || []).map(c => c.text || '').join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return res.status(200).json({ ok: true, map: {} });

  let parsed;
  try { parsed = JSON.parse(m[0]); }
  catch (e) { return res.status(200).json({ ok: true, map: {} }); }

  // Filtrado contra las listas y contra los nombres pedidos. Sin esto,
  // una forma inventada entraria directa a la base de datos y el
  // deslizador calcularia sobre una geometria que no existe.
  const okShape = new Set(SH);
  const okSize = new Set(SZ.map(Number));
  const asked = new Set(names);
  const map = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (!asked.has(k) || !v || typeof v !== 'object') continue;
    if (!okShape.has(v.shape)) continue;
    const size = Number(v.size);
    map[k] = { shape: v.shape, size: okSize.has(size) ? size : 750 };
  }

  return res.status(200).json({ ok: true, map, asked: names.length, answered: Object.keys(map).length });
}

// ── Silueta propia de cada producto ────────────────────────────────────
//
// Devuelve la GEOMETRIA de la botella de ese producto concreto, no el
// nombre de una familia. La de Patron no es la de Casamigos aunque las
// dos sean tequila, y esa diferencia son unos 16 ml en un cuarto de
// botella.
//
// El perfil se dibuja Y se calcula. Es deliberado: asi una forma
// equivocada se ve a simple vista en la parrilla de revision, en vez de
// esconderse dentro de un numero que parece correcto.
async function silhouetteMode(res, names) {
  if (names.length > 40) {
    return res.status(400).json({ ok: false, error: 'Too many names for silhouettes' });
  }

  const prompt =
`You are describing the SHAPE of specific bottles, so an app can turn a liquid level into a volume.

For each product, give the bottle's profile as a list of [y, r] points:
- y is height from 0 at the base to 1 at the mouth
- r is the radius at that height, relative to the widest part (widest point = 1)
- points ordered from base to mouth, starting at y = 0 and ending at y = 1
- use 8 to 14 points. Spend most of them on the shoulder, where the curve actually is: a bottle described with 3 points looks like a box.

Also give yFull: the height the liquid reaches in a full unopened bottle. Never 1 — above it sit the neck and the air. Typically 0.65 to 0.85.

Describe the ACTUAL bottle of that specific product. Patron is short and round with a stubby neck and a wide flat base. Jack Daniel's is square shouldered and flat sided. Grey Goose is tall, straight and narrow. Disaronno is a squat rectangular decanter. Crown Royal has rounded shoulders and a long tapering neck. These differences change the volume at a given height by up to 15 percent.

Rules:
- If you do not know what that specific bottle looks like, OMIT it. An omission falls back to a family shape, which is fine. An invented profile is not: it gives a number that looks precise and is wrong, and nobody re-checks a filled-in value.
- Do not answer from the category. "It is a tequila so probably like this" is exactly what to omit.

Products:
${names.map(n => '- ' + n).join('\n')}

Reply with JSON only, no prose:
{"Product name exactly as given": {"yFull": 0.72, "p": [[0,0.95],[0.04,1],[0.38,1],[0.46,0.97],[0.55,0.78],[0.63,0.5],[0.69,0.34],[0.74,0.29],[0.92,0.29],[1,0.33]]}, ...}`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!r.ok) {
    const t = await r.text();
    console.error('categorize/silhouette: anthropic error', t);
    return res.status(502).json({ ok: false, error: 'Model request failed' });
  }

  const data = await r.json();
  const text = (data.content || []).map(c => c.text || '').join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return res.status(200).json({ ok: true, map: {}, asked: names.length, answered: 0, note: 'no json in reply' });

  let parsed;
  try { parsed = JSON.parse(m[0]); }
  catch (e) { return res.status(200).json({ ok: true, map: {}, asked: names.length, answered: 0, note: 'unparseable json' }); }

  // Se valida en el servidor porque este perfil acaba en la base de datos
  // y de ahi en el calculo del inventario: un punto desordenado daria una
  // integral sin sentido y sin error visible.
  //
  // Pero se NORMALIZA antes de rechazar. Exigir que el primer punto sea
  // exactamente 0, el ultimo exactamente 1 y que algun radio llegue a 1
  // descartaria botellas perfectamente razonables que empiezan en 0.02 o
  // cuyo radio maximo es 0.94. Como lo que se usa es una FRACCION de
  // volumen, escalar todos los radios por igual no cambia el resultado:
  // normalizar sale gratis y rechazar sale caro.
  const asked = new Set(names);
  const map = {};
  const rejected = [];

  for (const [k, v] of Object.entries(parsed)) {
    if (!asked.has(k)) continue;
    if (!v || typeof v !== 'object' || !Array.isArray(v.p)) { rejected.push([k, 'no points']); continue; }

    const yFull = Number(v.yFull);
    if (!(yFull > 0.4 && yFull < 0.97)) { rejected.push([k, 'yFull=' + v.yFull]); continue; }
    if (v.p.length < 4 || v.p.length > 24) { rejected.push([k, v.p.length + ' points']); continue; }

    let bad = null, lastY = -1, maxR = 0;
    const pts = [];
    for (const q of v.p) {
      if (!Array.isArray(q) || q.length !== 2) { bad = 'malformed point'; break; }
      const y = Number(q[0]), rr = Number(q[1]);
      if (!isFinite(y) || !isFinite(rr)) { bad = 'not a number'; break; }
      if (y < 0 || y > 1) { bad = 'y out of range'; break; }
      if (rr <= 0) { bad = 'radius <= 0'; break; }
      if (y < lastY) { bad = 'out of order'; break; }
      lastY = y;
      if (rr > maxR) maxR = rr;
      pts.push([y, rr]);
    }
    if (bad) { rejected.push([k, bad]); continue; }
    if (pts.length < 4 || maxR <= 0) { rejected.push([k, 'too few points']); continue; }

    // Extremos a 0 y 1, radios escalados para que el maximo sea 1.
    // Ninguna de las dos cosas altera la forma.
    pts[0][0] = 0;
    pts[pts.length - 1][0] = 1;
    for (const q of pts) q[1] = q[1] / maxR;

    map[k] = { yFull, p: pts };
  }

  // Se devuelve POR QUE fallo cada uno. Sin esto, un cero en pantalla no
  // distingue "el modelo no conocia estas botellas" de "mi validacion las
  // rechazo todas", y esas dos cosas piden arreglos opuestos.
  const omitted = names.filter(n => !map[n] && !rejected.some(x => x[0] === n));

  return res.status(200).json({
    ok: true, map,
    asked: names.length,
    answered: Object.keys(map).length,
    rejected: rejected.length,
    omitted: omitted.length,
    why: rejected.slice(0, 5)
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ ok: false, error: 'Missing ANTHROPIC_API_KEY' });
    }

    const { names, categories, mode, shapes, sizes } = req.body || {};
    if (!Array.isArray(names) || !names.length) {
      return res.status(400).json({ ok: false, error: 'Missing names' });
    }
    if (names.length > 400) {
      return res.status(400).json({ ok: false, error: 'Too many names in one request' });
    }

    // ── Modo botella ───────────────────────────────────────────────────
    //
    // Vive dentro de este endpoint y no en uno propio por una razón muy
    // concreta: el plan Hobby de Vercel permite 12 funciones y el
    // proyecto va por 11. Gastar el último hueco aquí dejaría al
    // siguiente cambio sin sitio.
    //
    // Comparte con el modo categorías todo lo que importa: una sola
    // petición para todos los nombres, y filtrado del resultado contra
    // las listas permitidas antes de devolver nada.
    if (mode === 'bottle') {
      return await bottleMode(res, names, shapes, sizes);
    }
    if (mode === 'silhouette') {
      return await silhouetteMode(res, names);
    }

    const cats = Array.isArray(categories) && categories.length ? categories : [
      'Vodka','Gin','Tequila & Mezcal','Whiskey & Bourbon','Rum',
      'Brandy & Cognac','Liqueur','Wine','Beer & Cider','Non-Alcoholic'
    ];

    const prompt =
`You are categorising products from a bar's inventory.

Assign each product to exactly one of these categories:
${cats.map(c => '- ' + c).join('\n')}

Rules:
- Use only the categories listed above, spelled exactly as shown.
- Vermouth, amaro, aperitivo and cream liqueurs go to Liqueur.
- Fortified wines such as port and sherry go to Wine.
- If you are not confident what a product is, omit it from the response entirely. An omission is fine. A wrong category is not — nobody re-checks a category that already has a value.

Products:
${names.map(n => '- ' + n).join('\n')}

Reply with JSON only, no prose, in this shape:
{"Product name exactly as given": "Category", ...}`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!r.ok) {
      const t = await r.text();
      console.error('categorize: anthropic error', t);
      return res.status(502).json({ ok: false, error: 'Model request failed' });
    }

    const data = await r.json();
    const text = (data.content || []).map(c => c.text || '').join('');

    // El modelo a veces envuelve el JSON en explicaciones o en un bloque
    // de código. Se recorta al primer objeto que aparezca.
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return res.status(200).json({ ok: true, map: {} });

    let parsed;
    try { parsed = JSON.parse(m[0]); }
    catch (e) { return res.status(200).json({ ok: true, map: {} }); }

    // Se filtra contra la lista y contra los nombres pedidos. Sin esto,
    // una categoría inventada entraría directa a la base de datos.
    const valid = new Set(cats);
    const asked = new Set(names);
    const map = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (asked.has(k) && valid.has(v)) map[k] = v;
    }

    return res.status(200).json({ ok: true, map, asked: names.length, answered: Object.keys(map).length });
  } catch (err) {
    console.error('categorize endpoint error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
