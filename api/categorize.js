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

    const { names, categories } = req.body || {};
    if (!Array.isArray(names) || !names.length) {
      return res.status(400).json({ ok: false, error: 'Missing names' });
    }
    if (names.length > 400) {
      return res.status(400).json({ ok: false, error: 'Too many names in one request' });
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
