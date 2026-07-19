const ANTHROPIC_MODEL = process.env.ANTHROPIC_BRIEFING_MODEL || 'claude-sonnet-5';
const ANTHROPIC_VERSION = '2023-06-01';

const SYSTEM_PROMPT = `You are an inventory analyst for a bar/restaurant beverage program. You receive structured JSON data from a single weekly inventory count import and must produce a short, actionable briefing for a busy operator.

You get up to five kinds of signal in the input. Use whichever ones are present — a single week of data is always enough to say something useful, do not wait for multi-week history to report anything:
- "onHandChanges": on-hand quantity before/after THIS week's count for items that changed. Always available from week one.
- "overstockCandidates": items whose current on-hand is well above their par (suggested), computed from this week's snapshot alone. Always available from week one.
- "bigMovers": the largest single-week swings in on-hand from this import. Always available from week one.
- "historicalTrends": per-item usage across however many weeks of snapshots exist so far, each entry has "weeksOfHistory" (how many weeks feed it), "recentUsed" (up to the last 6 week_start/used points), "avgUsed", and "lastDelta" (most recent week vs the one before). This appears starting week two and grows richer every week — treat it as the main way your analysis should get MORE detailed and specific over time, not just a bonus.
- "parAdjustments": formal Pour-IQ par math (avg usage, suggested optimal, adjustment direction). Only present once a location has 4+ weeks of history — higher confidence than historicalTrends when present, but its absence does NOT mean there's nothing to report.

Calibrate confidence and detail to weeksOfHistory: with only 2-3 weeks, hedge lightly ("early trend, 2 weeks in") and keep it high-level; with 5+ weeks, be specific and confident, referencing the actual week-over-week pattern (e.g. "down for 3 straight weeks: 12 → 9 → 6"). The more history is present in the input, the more personal and detailed your notes should get — do not give the same generic level of detail once real multi-week data is available.

Respond with ONLY valid JSON (no markdown fences, no prose outside the JSON) matching exactly this shape:
{
  "summary": "one sentence, plain language, the single most important takeaway from this week",
  "trend_alerts": [{"item": "string", "note": "short actionable note about a usage spike/drop worth watching, drawing on bigMovers, historicalTrends, or parAdjustments — whichever gives the richest grounded detail"}],
  "overstock": [{"item": "string", "note": "short note explaining why this item looks overstocked and what to do, from overstockCandidates or parAdjustments"}],
  "par_suggestions": [{"item": "string", "action": "increase" or "decrease", "note": "short reason"}],
  "other_notes": ["short freeform note", "..."]
}

Rules:
- Ground every note in the actual input data provided — never invent numbers or a week count that isn't there.
- par_suggestions should only be populated from parAdjustments data (it requires the formal 4+ week par math); if parAdjustments is empty, leave par_suggestions empty — that's expected and fine.
- trend_alerts and overstock should draw first from onHandChanges/overstockCandidates/bigMovers/historicalTrends, which are available from week one onward — do not leave these empty just because parAdjustments is empty.
- Cap each array at 6 items, prioritizing the highest-impact ones.
- Be concise: each note is one short sentence, no fluff — but let it carry more specific detail as weeksOfHistory grows.
- Only fall back to explaining "not enough data" in "summary" if onHandChanges, overstockCandidates, bigMovers, and historicalTrends are ALL empty or trivial — otherwise there is always something to report.
- NEVER respond with plain prose, an apology, or a refusal outside the JSON shape, even if the input is sparse. The JSON object is mandatory in every response.`;

function buildUserPrompt(payload) {
  const { locationName, weekStart, changes, noMatchesCount, toOrderCount, adjustments, overstockCandidates, bigMovers, historicalTrends } = payload;
  return JSON.stringify({
    locationName,
    weekStart,
    toOrderCount,
    noMatchesCount,
    onHandChanges: (changes || []).slice(0, 60),
    parAdjustments: (adjustments || []).slice(0, 60),
    overstockCandidates: (overstockCandidates || []).slice(0, 25),
    bigMovers: (bigMovers || []).slice(0, 25),
    historicalTrends: (historicalTrends || []).slice(0, 30)
  });
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    // Modelo a veces envuelve en fences pese a la instrucción — intenta extraer el bloque {...}
    const match = String(text || '').match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (_) { /* fallthrough */ }
    }
    return null;
  }
}

function normalizeInsights(parsed, rawText) {
  if (!parsed || typeof parsed !== 'object') {
    const trimmed = String(rawText || '').trim();
    console.warn('weekly-briefing: could not parse model response as JSON. Raw text:', trimmed.slice(0, 2000));
    return {
      // Muestra el texto crudo del modelo en vez de un mensaje genérico — casi siempre
      // es una explicación válida (ej. "no hay suficiente historial todavía") que el
      // modelo no envolvió en JSON pese a la instrucción.
      summary: trimmed ? trimmed.slice(0, 400) : 'The model returned an empty response this week.',
      trend_alerts: [],
      overstock: [],
      par_suggestions: [],
      other_notes: []
    };
  }
  const arr = (v) => Array.isArray(v) ? v : [];
  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    trend_alerts: arr(parsed.trend_alerts).slice(0, 6),
    overstock: arr(parsed.overstock).slice(0, 6),
    par_suggestions: arr(parsed.par_suggestions).slice(0, 6),
    other_notes: arr(parsed.other_notes).slice(0, 6)
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY not configured' });
    }

    const body = req.body || {};

    // Item analysis mode
    if (body.mode === 'order-analysis') {
      if (!body.orderPrompt) return res.status(400).json({ ok: false, error: 'Missing orderPrompt' });

      // Reframe the prompt to be conservative and avoid repeating individual suggestions
      const prompt = body.orderPrompt + '\n\nCRITICAL INSTRUCTIONS:\n' +
        '- The manager has already seen individual Pour-IQ suggestions and CHOSE to ignore them — do NOT repeat those same suggestions\n' +
        '- Your job is to find SOFTER, more conservative middle-ground adjustments (never more than -1 from the current order quantity per item)\n' +
        '- Think of it as: if they ordered 10 and Pour-IQ said 6, you suggest 9 — not 6\n' +
        '- Focus on the ORDER AS A WHOLE, not item by item summaries\n' +
        '- Always end with: "Adjusting these items brings your order from $[original] to $[adjusted], a saving of $[amount] ([%]%)"\n' +
        '- If no conservative adjustments make sense, say the order looks balanced and give a one-line overall assessment\n' +
        '- Max 180 words, plain English, professional tone';

      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, messages: [{ role: 'user', content: prompt }] })
      });
      if (!anthropicRes.ok) return res.status(502).json({ ok: false, error: 'Anthropic API error' });
      const data = await anthropicRes.json();
      const text = (data.content || []).map(b => b.text || '').join('');
      return res.status(200).json({ ok: true, text });
    }

    if (body.mode === 'item') {
      const d = body;

      // Days of stock logic
      const days = d.daysRemaining;
      let stockWindow = '';
      if (days != null) {
        if (days < 7) stockWindow = 'CRITICAL: less than 7 days of stock remaining.';
        else if (days <= 10) stockWindow = 'OPTIMAL: 7-10 days of stock (ideal range).';
        else if (days <= 14) stockWindow = 'EXCESS: 10-14 days of stock (slightly over).';
        else stockWindow = 'OVERSTOCK: more than 14 days of stock remaining.';
      }

      const prompt = `You are a bar inventory analyst for a weekly ordering cycle. Orders are placed once per week. The optimal stock window is 7-10 days of supply on hand after the order arrives.

Analyze this specific product and give a PERSONALIZED purchasing recommendation. Do NOT summarize the numbers back — instead INTERPRET them and give a specific order quantity adjustment if needed.

Rules:
- If days remaining < 7: recommend ordering the suggested amount or more
- If days remaining 7-10: stock is optimal, order to maintain this level
- If days remaining 10-14: recommend reducing the order by a specific amount (e.g. "order 2 instead of 5")
- If days remaining > 14: recommend ordering little or nothing this week
- Factor in the trend: if usage is declining (negative trend), be more aggressive about reducing
- Factor in over/under history: if consistently over-ordered vs actual usage, call it out
- Factor in Pour-IQ status: if over par and trend declining, reinforce the reduction
- Be specific with numbers, not generic advice
- 3-4 sentences max, plain English, no headers or bullets

Product: ${d.item}
Vendor: ${d.vendor}
Unit Price: $${d.unitPrice}
On Hand: ${d.onHand} | Suggested par: ${d.suggested} | App suggests ordering: ${d.toOrder}
Days of stock remaining: ${days != null ? days + ' days — ' + stockWindow : 'Unknown'}
Avg weekly usage: ${d.avgUsed != null ? d.avgUsed + ' btl/wk' : 'Insufficient data (< 4 weeks)'}
Optimal par (Pour-IQ): ${d.optimal != null ? d.optimal : 'Not enough data'}
Pour-IQ status: ${d.statusLabel || 'Unknown'}
Week-over-week trend: ${d.trendStr || 'Unknown'}
Weeks of usage data: ${d.normalWeeks || 0}
Last ${d.orderCount || 0} orders: total ordered = ${d.totalOrdered || 0} btl, avg per order = ${d.avgOrdered || 'N/A'} btl
Over/under vs actual usage: ${Number(d.overUnder || 0) >= 0 ? '+' : ''}${Number(d.overUnder || 0).toFixed(1)} btl (${Number(d.overUnder || 0) > 0 ? 'over-ordering' : Number(d.overUnder || 0) < 0 ? 'under-ordering' : 'on target'})`;

      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, messages: [{ role: 'user', content: prompt }] })
      });
      if (!anthropicRes.ok) return res.status(502).json({ ok: false, error: 'Anthropic API error' });
      const data = await anthropicRes.json();
      const text = (data.content || []).map(b => b.text || '').join('');
      return res.status(200).json({ ok: true, text });
    }

    const { locationName, weekStart } = body;
    if (!locationName || !weekStart) {
      return res.status(400).json({ ok: false, error: 'Missing required fields (locationName, weekStart)' });
    }

    const userPrompt = buildUserPrompt(body);

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('Anthropic API error:', errText);
      return res.status(502).json({ ok: false, error: 'Anthropic API error: ' + errText });
    }

    const anthropicData = await anthropicRes.json();
    const rawText = (anthropicData.content || []).map(b => b.text || '').join('');
    const parsed = safeParseJson(rawText);
    const insights = normalizeInsights(parsed, rawText);

    return res.status(200).json({
      ok: true,
      model: ANTHROPIC_MODEL,
      insights
    });

  } catch (err) {
    console.error('weekly-briefing error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
