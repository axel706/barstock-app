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
    : ['bordeaux','wine_burgundy','wine_magnum','sparkling','vodka','whiskey',
       'tequila_tall','brandy','squat','crown','apothecary_tall','apothecary_squat',
       'shaker_faceted','liqueur_slim','liqueur_cream','decanter_flared','none'];
  const SZ = Array.isArray(sizes) && sizes.length ? sizes
    : [50,187,200,250,330,355,375,473,500,700,750,1000,1500,1750,3000];

  const prompt =
`You are identifying bottle shapes for a bar's inventory, so the app can turn a liquid level into a volume.

For each product, give the bottle shape and the nominal size in millilitres.

Shapes, use exactly one of these keys. The ratio in brackets is height ÷ widest point, so a low number means a wide stubby bottle and a high number a slender one:
- bordeaux [4.0]: wine bottle, straight sides, sharp shoulder (cabernet, merlot, bordeaux blends)
- wine_burgundy [3.5]: wine bottle, shoulder that slopes the whole way down (pinot noir, chardonnay, sauvignon blanc)
- wine_magnum [3.6]: any wine bottle of 1.5 L or larger
- sparkling [3.1]: heavy sparkling wine bottle, very rounded base
- vodka [3.4]: straight from base to shoulder. The default for vodka, gin, rum and tequila
- whiskey [3.1]: straight body, raised collar at base and shoulder, square shoulder (Jack Daniel's, most bourbon)
- tequila_tall [3.8]: slimmer than vodka with a longer neck (Jose Cuervo)
- brandy [2.7]: no real shoulder, the whole body is one curve (cognac, armagnac)
- squat [2.3]: wide, widens towards the top, rounded shoulder (Maker's Mark)
- crown [1.8]: the widest of all, narrows towards the base (Crown Royal and other decanters)
- apothecary_tall [2.9]: perfect cylinder with a round shoulder (Absolut)
- apothecary_squat [2.3]: wide chemist bottle, straight to the top then an abrupt shoulder (Hendrick's)
- shaker_faceted [2.8]: cocktail-shaker shape, waist near the top (Tanqueray)
- liqueur_slim [4.3]: the most slender, long straight body (Cointreau, Grand Marnier, Chambord)
- liqueur_cream [3.4]: widest at the middle, narrows both ways (Baileys)
- decanter_flared [2.6]: amphora, narrows towards both ends, very long neck
- none: not measured by level — beer, cans, kegs, mixers, anything counted whole

Sizes, use exactly one of these numbers: ${SZ.join(', ')}
When the name gives no size, use 750 for spirits and wine.

Rules:
- If you are not confident what a product is, omit it entirely. An omission is fine. A wrong shape is not: it produces a number that looks precise and is false, and nobody re-checks a value that is already filled in.
- Use "none" for anything that is never half-full.

Products:
${names.map(n => '- ' + n).join('\n')}

Reply with JSON only, no prose, in this shape:
{"Product name exactly as given": {"shape": "whiskey", "size": 750}, ...}`;

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
