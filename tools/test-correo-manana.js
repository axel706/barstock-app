#!/usr/bin/env node
/*
 * ── El correo de la mañana (lib/morning-report.js) ───────────────────
 *
 * Axel, 2026-11-12, sobre lámina: el molde del correo de órdenes, con
 * una o dos frases en palabras encima de cada bloque. Lo que se protege:
 *
 *   1. Ayer en dinero y en botellas, cada uno contra lo de siempre de ese
 *      día de la semana, y una frase que lo dice ("a good night", "a slow
 *      night", "a normal night"). Sin la lista de lo más vendido.
 *   2. Lo que no llega al domingo, en UNA sección, ordenado por el día en
 *      que se acaba, con su "Order N" hasta el domingo. Un día sin nada,
 *      la sección no sale y el saludo lo dice.
 *   3. Sin "What stood out" y sin la etiqueta "from LOOP".
 *   4. Si ayer no se cargó, se dice, no se pinta un cero.
 *   5. El domingo, la meta es "through today".
 *   6. Todo lo que viene de fuera va escapado.
 *   7. Se manda SÓLO al correo de quien tiene la sesión: aunque la
 *      petición traiga otro destinatario, no se usa. Y sin RESEND_API_KEY
 *      se dice eso, no "no se pudo".
 *
 *   node tools/test-correo-manana.js
 */
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);
const texto = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ');

// Supabase de mentira: sólo valida la sesión, con su correo.
const rutaSb = require.resolve('@supabase/supabase-js', { paths: [RAIZ] });
// Y unas tablas, para leer la lista de destinatarios: sólo lee.
const TABLAS = { locations: [], location_settings: [] };
let errorTabla = null;
const consulta = (t) => {
  const f = [];
  const q = { select() { return q; }, eq(k, v) { f.push([k, v]); return q; }, limit() { return q; },
    insert() { throw new Error('escribió en ' + t); }, update() { throw new Error('escribió en ' + t); },
    upsert() { throw new Error('escribió en ' + t); }, delete() { throw new Error('borró en ' + t); },
    then(ok, ko) { const r = errorTabla && errorTabla.t === t ? { data: null, error: errorTabla.e }
      : { data: (TABLAS[t] || []).filter(x => f.every(([k, v]) => x[k] === v)), error: null };
      return Promise.resolve(r).then(ok, ko); } };
  return q;
};
require.cache[rutaSb] = { id: rutaSb, filename: rutaSb, loaded: true, exports: {
  createClient: () => ({ auth: { getUser: async (t) => (t === 'sesion-buena'
    ? { data: { user: { id: 'u1', email: 'axel@crown.test' } }, error: null }
    // Un manager sin "Location settings": ve el correo, no escribe direcciones.
    : t === 'sesion-sin-ajustes'
      ? { data: { user: { id: 'u2', email: 'mgr@crown.test', app_metadata: { role: 'manager', perms: ['ver_ajustes', 'contar'] } } }, error: null }
      : { data: {}, error: { message: 'bad' } }) }, from: consulta })
} };
// Resend de mentira: apunta lo que se le manda.
const enviados = [];
const rutaRs = require.resolve('resend', { paths: [RAIZ] });
require.cache[rutaRs] = { id: rutaRs, filename: rutaRs, loaded: true, exports: {
  Resend: class { constructor(k) { this.k = k; this.emails = { send: async (p) => { enviados.push(p); return { data: { id: 'm1' } }; } }; } }
} };

const M = require(path.join(RAIZ, 'lib/morning-report.js'));
const handler = require(path.join(RAIZ, 'api/integrations.js'));

const AYER = { fecha: '2026-11-11', dia: 'Wed', cargado: true,
  dinero: 3717, licor: 2144, vino: 1573, normalDinero: 3177, normalLicor: 1757, normalVino: 1417,
  botellas: 40.5, botLicor: 22.1, botVino: 18.4, normalBotellas: 24.7, normalBotLicor: 12.9, normalBotVino: 11.8 };
const AGOTAN = [
  { producto: 'Casamigos Blanco', queda: 1.9, agota: '2026-11-13', vende: 3.3, llega: 0, pedir: 2 },
  { producto: "Tito's Handmade Vodka", queda: 0.6, agota: '2026-11-12', vende: 8.3, llega: 0, pedir: 8 },
  { producto: 'Aperol Aperitivo', queda: 0.4, agota: '2026-11-12', vende: 3.8, llega: 0, pedir: 4 }
];
const BASE = { local: 'The Crown Tavern', hoy: '2026-11-12', ayer: AYER, agotan: AGOTAN };

async function llamar(o) {
  const res = { code: 200, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; }, end() { return this; } };
  await handler({ query: { provider: 'report' }, method: 'POST',
    headers: { authorization: o.token === undefined ? 'Bearer sesion-buena' : o.token },
    body: { action: o.accion, params: o.params || {} } }, res);
  return res;
}

(async () => {

grupo('un día movido');
{
  const { asunto, html } = M.armar(BASE);
  const t = texto(html);
  prueba('el asunto dice el día, el dinero y cuántos no llegan',
    asunto === "The Crown Tavern · Wed $3,717 · 3 won't make it to Sunday", asunto);
  // Varias frases por situación (Axel, 2026-11-15): se acepta cualquiera
  // de las de "un buen día"; lo que no puede cambiar es lo que dicen.
  prueba('la fecha de hoy va sola, arriba, antes del saludo', /Thursday · Nov 12 (Good morning|Morning|Rise and shine)/.test(t) && !/Thursday, Nov 12\./.test(t), t.slice(0, 200));
  prueba('el saludo cuenta el día', /Wednesday (was a good night|came in strong|beat a usual Wednesday|was a busy one), and 3 things won't make it to Sunday\./.test(t), t.slice(0, 300));
  prueba('ayer, con palabras', /\$3,717 in drinks, 17% more than a usual Wednesday\.|Drinks came to \$3,717, 17% above a usual Wednesday\.|\$3,717 in drinks: 17% over what a Wednesday usually brings\./.test(t), t.slice(0, 500));
  prueba('quién lo llevó', /Liquor, cocktails included, carried most of it\.|Most of it was liquor, cocktails included\.|Liquor led the way, cocktails included\./.test(t));
  prueba('las seis cifras', ['$3,717', '$2,144', '$1,573', '40.5', '22.1', '18.4'].every(x => t.includes(x)));
  prueba('con su comparación en cada una', /↗ 17%/.test(t) && /↗ 22%/.test(t) && /↗ 11%/.test(t) && /↗ 64%/.test(t) && /↗ 71%/.test(t) && /↗ 56%/.test(t), t.slice(0, 900));
  prueba('dicho una vez debajo', (t.match(/Arrows compare with a usual Wednesday/g) || []).length === 1);
  prueba('las seis tarjetas del mismo tamaño (celdas de ancho fijo)', (html.match(/table-layout:fixed/g) || []).length === 2);

  prueba('una sola sección para lo que no llega', /Won't make it to Sunday/.test(t) && !/Needs attention today|Later this week/.test(t));
  prueba('su frase, en orden', /Tito's Handmade Vodka and Aperol Aperitivo run out today\. Casamigos Blanco goes on Friday\./.test(t), t);
  const i1 = t.indexOf("Tito's Handmade Vodka Out today"), i2 = t.indexOf('Aperol Aperitivo Out today'), i3 = t.indexOf('Casamigos Blanco Out Fri');
  prueba('las filas por el día en que se acaban, y a igual día el que más pide', i1 > 0 && i1 < i2 && i2 < i3, [i1, i2, i3].join(','));
  prueba('cada una con lo que queda y lo que se suele vender', /0\.6 left · Thu–Sun usually sells 8\.3/.test(t));
  prueba('y cuánto pedir hasta el domingo', /Order 8 through Sunday/.test(t) && /Order 4 through Sunday/.test(t) && /Order 2 through Sunday/.test(t));
  prueba('con la cuenta explicada', /what each day from today to Sunday usually sells/.test(t));
  prueba('sin lo más vendido', !/Most sold|led again/.test(t));
  prueba('sin "What stood out"', !/stood out/i.test(t));
  prueba('sin la etiqueta "from LOOP"', !/from LOOP/.test(t));
  prueba('el molde del correo de órdenes', /Sent via BarStock Pro/.test(t) && /Open BarStock/.test(t) && /Have a good shift|Have a great service|Good luck tonight/.test(t));
}

grupo('un día tranquilo');
{
  const { asunto, html } = M.armar(Object.assign({}, BASE, { agotan: [],
    ayer: Object.assign({}, AYER, { dinero: 3000, licor: 1700, vino: 1300 }) }));
  const t = texto(html);
  prueba('el saludo lo dice', /Wednesday (was a normal night|was right on pace|looked like a usual Wednesday), and nothing runs out before Sunday\./.test(t), t.slice(0, 300));
  prueba('sin la sección', !/Won't make it/.test(t) && !/Order \d/.test(t));
  prueba('el asunto también', /· nothing runs out$/.test(asunto), asunto);
  prueba('cerca de lo normal, se dice así', /right around a usual Wednesday|about what a Wednesday usually does|in line with a usual Wednesday/.test(t), t.slice(0, 500));
}
{
  const t = texto(M.armar(Object.assign({}, BASE, { ayer: Object.assign({}, AYER, { dinero: 2400, licor: 1300, vino: 1100 }) })).html);
  prueba('por debajo: a slow night', /Wednesday (was a slow night|came in light|was quieter than usual)/.test(t) && /24% (less than a usual|below a usual|under what a) Wednesday/.test(t), t.slice(0, 500));
}

grupo('no dice siempre lo mismo (Axel, 2026-11-15)');
{
  // Los mismos números en días distintos: las frases cambian. El mismo
  // día, siempre igual (la vista previa y el automático coinciden).
  const dia = (hoy) => texto(M.armar(Object.assign({}, BASE, { hoy })).html);
  const corta = (t) => (/Wednesday (was a good night|came in strong|beat a usual Wednesday|was a busy one)/.exec(t) || [])[1];
  const saludo = (t) => (/(Good morning ☀️|Morning ☕|Good morning 👋|Rise and shine ☀️)/.exec(t) || [])[1];
  const dias = ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18'];
  const cortas = new Set(dias.map(d => corta(dia(d))));
  const saludos = new Set(dias.map(d => saludo(dia(d))));
  prueba('en una semana, la frase de ayer cambia', cortas.size >= 3 && !cortas.has(undefined), JSON.stringify([...cortas]));
  prueba('y el saludo también', saludos.size >= 3 && !saludos.has(undefined), JSON.stringify([...saludos]));
  prueba('el mismo día, siempre lo mismo', dia('2026-11-14') === dia('2026-11-14'));
}

grupo('lo que no se sabe no se pinta');
{
  const t = texto(M.armar(Object.assign({}, BASE, { ayer: { fecha: '2026-11-11', dia: 'Wed', cargado: false } })).html);
  prueba('ayer sin cargar: se dice', /Wednesday's sales from Toast haven't loaded yet/.test(t), t.slice(0, 400));
  prueba('y no salen cifras de cero', !/\$0\b/.test(t) && !/table-layout:fixed/.test(t));
}
{
  const t = texto(M.armar(Object.assign({}, BASE, { ayer: Object.assign({}, AYER, { fecha: '2026-11-09', dia: 'Mon', dinero: 0, licor: 0, vino: 0,
    botellas: 0, botLicor: 0, botVino: 0, normalDinero: 0, normalLicor: 0, normalVino: 0, normalBotellas: 0, normalBotLicor: 0, normalBotVino: 0 }), hoy: '2026-11-10' })).html);
  prueba('el lunes cerrado: "Monday was closed", sin tarjetas', /Monday was closed/.test(t) && !/You did/.test(t), t.slice(0, 300));
}
{
  const t = texto(M.armar(Object.assign({}, BASE, { ayer: Object.assign({}, AYER, { normalDinero: null, normalLicor: null, normalVino: null,
    normalBotellas: null, normalBotLicor: null, normalBotVino: null }) })).html);
  prueba('sin historia suficiente: sin flechas ni comparación', !/↗|↘/.test(t) && !/Arrows compare/.test(t) && /You did \$3,717 in drinks\./.test(t), t.slice(0, 600));
}

grupo('sin previsión, no se dice "nothing runs out"');
{
  // Con un conteo a medias no hay LIVE, y con poca historia de Toast no
  // hay "lo de siempre": no se sabe qué se acaba. Decir "nothing runs
  // out" sería una afordancia que miente.
  for (const [prev, frase] of [['counting', /A count is in progress/], ['history', /not enough Toast history/], ['error', /Could not work out what runs out/]]) {
    const { asunto, html } = M.armar(Object.assign({}, BASE, { agotan: [], prevision: prev }));
    const t = texto(html);
    prueba(prev + ': lo dice', frase.test(t) && !/nothing runs out/.test(t) && !/nothing runs out/.test(asunto), t.slice(0, 400) + ' | ' + asunto);
  }
  const t = texto(M.armar(Object.assign({}, BASE, { prevision: 'ok' })).html);
  prueba('con previsión, la sección de siempre', /Won't make it to Sunday/.test(t));
}

grupo('el domingo');
{
  const { asunto, html } = M.armar(Object.assign({}, BASE, { hoy: '2026-11-15',
    ayer: Object.assign({}, AYER, { fecha: '2026-11-14', dia: 'Sat' }),
    agotan: [{ producto: "Tito's Handmade Vodka", queda: 0.5, agota: '2026-11-15', vende: 1.2, llega: 0, pedir: 1 }] }));
  const t = texto(html);
  prueba('la meta es hoy', /won't make it through today/.test(t) && /Order 1 through today/.test(t) && /Sun usually sells 1\.2/.test(t), t);
  prueba('y en el asunto', /1 won't make it through today/.test(asunto), asunto);
}

grupo('el lunes: el resumen de la semana (Axel, 2026-11-17, sobre lámina)');
{
  // El lunes no se abre: su correo es la semana pasada de lunes a
  // domingo, con el domingo en su caja, lo que suele dar esta semana y lo
  // que no llega al domingo. Un solo correo, no dos.
  const SEM = { lunes: '2026-11-16', cargados: 7,
    total: { dinero: 24310, licor: 14120, vino: 10190, botellas: 289, botLicor: 151, botVino: 138,
      normalDinero: 22509, normalLicor: 12720, normalVino: 9893, normalBotellas: 272.6, normalBotLicor: 138.5, normalBotVino: 140.8 },
    mejor: { fecha: '2026-11-21', dinero: 6486 },
    top: [{ nombre: 'Nino Ardevi Prosecco', botellas: 43 }, { nombre: "Tito's", botellas: 18 }, { nombre: 'Casamigos Blanco', botellas: 9 }],
    domingo: { fecha: '2026-11-22', cargado: true, dinero: 3440, normalDinero: 3276, top: { nombre: 'Nino Ardevi Prosecco', botellas: 9 } },
    plan: [['2026-11-23', 0, 0], ['2026-11-24', 2180, 25], ['2026-11-25', 2640, 31], ['2026-11-26', 3050, 36],
      ['2026-11-27', 5210, 62], ['2026-11-28', 5980, 70], ['2026-11-29', 3440, 41]].map(([fecha, dinero, botellas]) => ({ fecha, dinero, botellas })) };
  const LUNES = { local: 'The Crown Tavern', hoy: '2026-11-23', semanal: SEM,
    ayer: Object.assign({}, AYER, { fecha: '2026-11-22', dia: 'Sun', dinero: 3440, normalDinero: 3276 }),
    agotan: [{ producto: "Tito's Handmade Vodka", queda: 6, agota: '2026-11-26', vende: 19, llega: 0, pedir: 13 },
      { producto: 'Aperol Aperitivo', queda: 7, agota: '2026-11-27', vende: 11, llega: 0, pedir: 4 }] };
  const { asunto, html } = M.armar(LUNES);
  // Una etiqueta deja un espacio antes de la coma: "$3,440 ,".
  const t = texto(html).replace(/ ([,.])/g, '$1');
  prueba('la etiqueta dice que es el semanal', /Monday · Nov 23 · Weekly/i.test(t), t.slice(0, 160));
  prueba('la frase de arriba: la semana contra una semana normal', /Last week did \$24,310 in drinks, 8% more than a usual week\./.test(t), t.slice(0, 400));
  prueba('el rótulo con sus fechas', /Last week · Mon Nov 16 – Sun Nov 22/.test(t), t.slice(0, 600));
  prueba('la caja del domingo, como ayer', /Yesterday · Sunday/i.test(t) && /Sunday did \$3,440, 5% more than a usual Sunday\. Top seller: Nino Ardevi Prosecco \(9\)\./.test(t), t.slice(0, 900));
  prueba('la semana entera en palabras', /The whole week: Saturday carried it with \$6,486, and liquor, cocktails included, was 58% of it\./.test(t), t.slice(0, 1200));
  prueba('las seis cifras de la semana con su flecha', ['$24,310', '$14,120', '$10,190', '289', '151', '138'].every(x => t.includes(x)) &&
    /↗ 8%/.test(t) && /↗ 11%/.test(t) && /↗ 3%/.test(t) && /↗ 6%/.test(t) && /↗ 9%/.test(t) && /↘ 2%/.test(t), t.slice(0, 1600));
  prueba('las flechas, contra una semana normal', /Arrows compare with a usual week/.test(t));
  prueba('lo más vendido de la semana', /Top sellers: Nino Ardevi Prosecco \(43 btl\), Tito's \(18\), Casamigos Blanco \(9\)\./.test(t));
  prueba('esta semana: lo que suele dar', /This week · what to plan for/.test(t) && /A usual week like this one does about \$22,500 and 265 bottles\./.test(t), t);
  prueba('día por día, con el lunes cerrado', /Mon closed/.test(t) && /Tue \$2,180/.test(t) && /Sat \$5,980/.test(t), t);
  prueba('lo que no llega al domingo, de lunes a domingo', /Won't make it to Sunday/.test(t) && /6\.0 left · Mon–Sun usually sells 19\.0/.test(t) && /Order 13 through Sunday/.test(t), t);
  prueba('sin la tarjeta diaria de ayer (va en la caja del domingo)', !/Yesterday · Sun, Nov 22/.test(t) && (t.match(/\$3,440/g) || []).length === 2, t);
  prueba('un solo correo, que se despide por la semana', /Have a great week\./.test(t) && /Weekly report/.test(t));
  prueba('el asunto lo dice', /^The Crown Tavern · Weekly · Nov 16–22 \$24,310 · 2 won't make it to Sunday$/.test(asunto), asunto);
  // Sin historia para comparar: se dice la cifra, sin inventar el %.
  const sinN = M.armar(Object.assign({}, LUNES, { semanal: Object.assign({}, SEM, { total: Object.assign({}, SEM.total, { normalDinero: null, normalBotellas: null }) }) }));
  prueba('sin semanas para comparar, sin porcentaje', /Last week did \$24,310 in drinks\./.test(texto(sinN.html)) && !/more than a usual week/.test(texto(sinN.html)));
  // Una semana a medio cargar no se presenta como entera.
  const media = texto(M.armar(Object.assign({}, LUNES, { semanal: Object.assign({}, SEM, { cargados: 5 }) })).html);
  prueba('a medio cargar, lo dice', /only 5 of its 7 days/.test(media), media.slice(0, 500));
  // El botón de prueba lo pide un martes: la caja no dice "yesterday".
  const martes = texto(M.armar(Object.assign({}, LUNES, { hoy: '2026-11-24' })).html).replace(/ ([,.])/g, '$1');
  prueba('otro día, la caja dice "Sunday", no "yesterday"', !/Yesterday · Sunday/i.test(martes) && /Sunday did \$3,440/.test(martes), martes.slice(0, 700));
  const raro = M.armar(Object.assign({}, LUNES, { semanal: Object.assign({}, SEM, { top: [{ nombre: '<script>x', botellas: 2 }] }) })).html;
  prueba('los nombres, escapados', !/<script>x/.test(raro));
}

grupo('el lunes: Live vs count, con lo que podría ser (Axel, 2026-11-17)');
{
  // "Que no sólo ponga el dato sino que sugiera qué estuvo mal, qué
  // artículos, si es receta, si tuvo más o menos de lo esperado." Las
  // frases dicen sólo lo que los datos dicen, y siempre "could be".
  const CONTEO = { hay: true, fin: '2026-11-22', provisional: false, total: 5, mas: 0, corto: 112, sobra: 118,
    lista: [
      { item: "Tito's Handmade Vodka", esperado: 8.5, contado: 6, dif: -2.5, vendido: 18, parte: 14, dinero: -54, proveedor: 'LOOP', causa: 'receta', semanas: 3, desvio: 14 },
      { item: 'Aperol Aperitivo', esperado: 1, contado: 7, dif: 6, vendido: 4, parte: 150, dinero: 118, proveedor: 'Southern', causa: 'caja', caja: 6 },
      { item: 'Casamigos Blanco', esperado: 3.1, contado: 2, dif: -1.1, vendido: 2.2, parte: 50, dinero: -58, proveedor: '', causa: 'pronto' },
      { item: 'Jameson', esperado: 4, contado: 6.5, dif: 2.5, vendido: 6, parte: 42, dinero: 60, proveedor: '', causa: 'conteo', antes: -2.4 },
      { item: 'Hendricks', esperado: 5, contado: 3, dif: -2, vendido: 4, parte: 50, dinero: -70, proveedor: '', causa: 'merma', cuadro: 3 },
      { item: 'Aperol Spritz base', esperado: 2, contado: 4, dif: 2, vendido: 6, parte: 33, dinero: 20, proveedor: '', causa: 'receta', semanas: 2, desvio: 30 }],
    sinConvertir: [{ nombre: 'Espresso Martini', unidades: 14 }] };
  const base = { local: 'The Crown Tavern', hoy: '2026-11-23', agotan: [],
    semanal: { lunes: '2026-11-16', cargados: 7, total: { dinero: 24310, normalDinero: 22509 }, top: [], plan: [], conteo: CONTEO } };
  const t = texto(M.armar(base).html).replace(/ ([,.:])/g, '$1');
  prueba('arriba lo anuncia', /what Sunday's count found, and what to plan for this week/.test(t), t.slice(0, 400));
  prueba('su rótulo', /Live vs count · what Sunday's count found/.test(t));
  prueba('el resumen: cuántos, faltante y sobrante', /Six products came out far from what the app expected: \$112 short and \$118 over\. Here's what each could be\./.test(t), t);
  prueba('cada uno dice si tuvo más o menos', (t.match(/Less than expected/g) || []).length === 3 && (t.match(/More than expected/g) || []).length === 3);
  prueba('la línea de números', /Expected ≈8\.5, counted 6 · 2\.5 bottles short \(−\$54\) · about 14% of the 18 it sold/.test(t), t);
  prueba('receta, tres semanas: very likely, con cuánto se usa de más', /very likely a recipe or pour\. It's been short by a similar share of what it sold 3 weeks in a row: the bottles really used were about 14% more than the recipes and pours say\./.test(t), t);
  prueba('receta, dos semanas: aún no "very likely", y lo dice', /could be: a recipe or pour\. It's been over by a similar share of what it sold 2 weeks in a row: the bottles really used were about 30% less than the recipes and pours say\./.test(t) && /If next Sunday is the same, it's very likely the recipe/.test(t), t);
  prueba('una caja justa: sin factura, y de qué proveedor', /exactly 6 more \(\+\$118\)/.test(t) && /a case that arrived without an order or invoice\. 6 is exactly one case\./.test(t) && /Check if Southern dropped off Aperol Aperitivo/.test(t), t);
  prueba('una semana sola: demasiado pronto, y qué dirá el domingo', /could be: too early to tell/.test(t) && /We'll know next Sunday: a recipe repeats by a similar share, a counting slip comes back the other way, and a loss doesn't\./.test(t));
  prueba('deshace la semana anterior: error al contar', /a counting slip\. Last week it came out 2\.4 short, and this week about the same the other way/.test(t), t);
  prueba('cuadraba y de pronto falta: merma, con su dinero', /a bottle that went missing, or one that wasn't counted\. It came out close to what the app expected the 3 weeks before/.test(t) && /that's \$70 gone/.test(t), t);
  prueba('siempre "could be", nunca "it is"', (t.match(/What it could be:/g) || []).length === 6);
  prueba('lo vendido sin receta, del ciclo y sin colgárselo a un producto', /Toast also sold drinks with no recipe yet: Espresso Martini \(14\)\. The bottles in them weren't subtracted, so anything that goes into them can look short/.test(t), t);

  const sin = (c) => texto(M.armar(Object.assign({}, base, { semanal: Object.assign({}, base.semanal, { conteo: c }) })).html).replace(/ ([,.:])/g, '$1');
  prueba('sin conteo cerrado la semana pasada: lo dice', /No count was closed last week, so there's nothing to compare yet\./.test(sin({ hay: false })));
  prueba('un ciclo de horas, no de una semana: no se compara y lo dice', /Sunday's count can't be compared: the cycle it closed only covered 3 hours, not a week of sales\./.test(sin({ hay: true, invalido: true, fin: '2026-11-15', horas: 3 })) &&
    !/More than expected|Less than expected/.test(sin({ hay: true, invalido: true, fin: '2026-11-15', horas: 3 })));
  prueba('todo cerca: lo dice', /Everything Toast sells came out close to what the app expected\./.test(sin(Object.assign({}, CONTEO, { lista: [], total: 0, corto: 0, sobra: 0, sinConvertir: [] }))));
  prueba('un error: lo que pasó, sin adivinar', /Couldn't read what the count found: HTTP 500: boom/.test(sin({ error: 'HTTP 500: boom' })) && !/migration/.test(sin({ error: 'HTTP 500: boom' })));
  prueba('provisional: lo avisa', /may not have been complete/.test(sin(Object.assign({}, CONTEO, { provisional: true }))));
  prueba('más de seis: cuántos quedan', /And 3 smaller ones\./.test(sin(Object.assign({}, CONTEO, { mas: 3, total: 9 }))));
  prueba('los nombres, escapados', !/<b>x/.test(M.armar(Object.assign({}, base, { semanal: Object.assign({}, base.semanal,
    { conteo: Object.assign({}, CONTEO, { lista: [Object.assign({}, CONTEO.lista[0], { item: '<b>x' })] }) }) })).html));
  prueba('una causa que no existe no entra', !/undefined/.test(sin(Object.assign({}, CONTEO, { lista: [Object.assign({}, CONTEO.lista[0], { causa: 'otra' })] }))));
}

grupo('lo de fuera, escapado');
{
  const { html } = M.armar(Object.assign({}, BASE, { local: 'Crown <b>', agotan: [{ producto: '<img src=x onerror=alert(1)>', queda: 1, agota: '2026-11-12', vende: 3, llega: 0, pedir: 2 }] }));
  prueba('un nombre con etiquetas no entra como etiquetas', !/<img src=x/.test(html) && /&lt;img src=x/.test(html));
  prueba('la locación tampoco', !/Crown <b>/.test(html));
}

grupo('por la función de integraciones');
{
  let r = await llamar({ accion: 'preview', params: { datos: BASE } });
  prueba('preview: devuelve el correo sin mandarlo', r.body && r.body.ok && /Won't make it to Sunday/.test(texto(r.body.html)) && enviados.length === 0, JSON.stringify(r.body).slice(0, 200));
  prueba('sin sesión, nada', (await llamar({ accion: 'preview', token: '', params: { datos: BASE } })).code === 401);

  delete process.env.RESEND_API_KEY;
  r = await llamar({ accion: 'send', params: { datos: BASE } });
  prueba('sin RESEND_API_KEY lo dice, y no manda', r.code === 500 && /RESEND_API_KEY/.test(r.body.error) && enviados.length === 0, JSON.stringify(r.body));

  process.env.RESEND_API_KEY = 'k-test';
  r = await llamar({ accion: 'send', params: { datos: BASE, to: 'otro@fuera.test' } });
  const e = enviados[0] || {};
  prueba('send: lo manda', r.body && r.body.ok && enviados.length === 1, JSON.stringify(r.body));
  prueba('SÓLO al correo de la sesión, aunque pidan otro', JSON.stringify(e.to) === JSON.stringify(['axel@crown.test']), JSON.stringify(e.to));
  prueba('dice a quién se mandó', r.body.to === 'axel@crown.test');
  prueba('marcado como prueba en el asunto', /^\[Test\] The Crown Tavern · /.test(e.subject), e.subject);
  prueba('desde reports@barstockpro.com', /<reports@barstockpro\.com>$/.test(e.from), e.from);
  r = await llamar({ accion: 'nada', params: {} });
  prueba('una acción que no existe, 400', r.code === 400, String(r.code));
  r = await llamar({ accion: 'preview', params: {} });
  prueba('sin datos, 400 diciendo qué falta', r.code === 400 && /datos/.test(r.body.error), JSON.stringify(r.body));
}

grupo('a la lista de la locación (Settings › Emails)');
{
  // Axel, 2026-11-12: "necesito la posibilidad de mandarlo a más
  // destinatarios", con su propia lista, aparte de la del informe de
  // costes. La lista se LEE de la base en el servidor: lo que mande la
  // app como destinatarios no se usa.
  TABLAS.locations = [{ id: 'loc-1', account_id: 'wjm-hospitality', name: 'The Crown Tavern' }];
  TABLAS.location_settings = [{ location_id: 'loc-1', morning_recipients: 'gm@crown.test, bar@crown.test; mal-escrito ,GM@crown.test' }];
  enviados.length = 0;
  let r = await llamar({ accion: 'send', params: { datos: BASE, para: 'lista', cuenta: 'wjm-hospitality', to: 'otro@fuera.test' } });
  const e = enviados[0] || {};
  prueba('manda a la lista guardada', r.body && r.body.ok && JSON.stringify(e.to) === JSON.stringify(['gm@crown.test', 'bar@crown.test']), JSON.stringify(r.body) + ' ' + JSON.stringify(e.to));
  prueba('sin repetidos ni lo que no es un correo', !(e.to || []).some(x => /mal|fuera/.test(x)));
  prueba('dice a cuántos', r.body.to === 'gm@crown.test, bar@crown.test', r.body.to);
  prueba('a la lista no va marcado como prueba', !/\[Test\]/.test(e.subject || ''), e.subject);

  TABLAS.location_settings = [{ location_id: 'loc-1', morning_recipients: '' }];
  enviados.length = 0;
  r = await llamar({ accion: 'send', params: { datos: BASE, para: 'lista', cuenta: 'wjm-hospitality' } });
  prueba('lista vacía: lo dice y no manda', r.code === 400 && /No morning email recipients/.test(r.body.error) && enviados.length === 0, JSON.stringify(r.body));

  TABLAS.location_settings = [];
  r = await llamar({ accion: 'send', params: { datos: Object.assign({}, BASE, { local: 'Otra' }), para: 'lista', cuenta: 'wjm-hospitality' } });
  prueba('una locación que no existe: lo dice', r.code === 400 && /Otra/.test(r.body.error) && enviados.length === 0, JSON.stringify(r.body));

  errorTabla = { t: 'location_settings', e: { code: '42703', message: 'column location_settings.morning_recipients does not exist' } };
  r = await llamar({ accion: 'send', params: { datos: BASE, para: 'lista', cuenta: 'wjm-hospitality' } });
  prueba('sin la columna: lo dice, con su migración', r.code === 500 && /morning_recipients/.test(r.body.error) && /035/.test(r.body.error) && enviados.length === 0, JSON.stringify(r.body));
  errorTabla = { t: 'location_settings', e: { code: '57014', message: 'canceling statement due to statement timeout' } };
  r = await llamar({ accion: 'send', params: { datos: BASE, para: 'lista', cuenta: 'wjm-hospitality' } });
  prueba('otro error: el que fue, sin adivinar una migración', r.code === 500 && /statement timeout/.test(r.body.error) && !/035/.test(r.body.error), JSON.stringify(r.body));
  errorTabla = null;

  TABLAS.location_settings = [{ location_id: 'loc-1', morning_recipients: 'gm@crown.test' }];
  enviados.length = 0;
  r = await llamar({ accion: 'send', params: { datos: BASE } });
  prueba('sin "lista", sigue yendo sólo a ti', JSON.stringify((enviados[0] || {}).to) === JSON.stringify(['axel@crown.test']));

  // Axel, 2026-11-15: "Send to me" se mandó al correo con el que inicia
  // sesión y no al reply-to, y él lo buscaba donde llega el automático.
  // La prueba va ahora al reply-to de la locación, leído de la base.
  TABLAS.location_settings = [{ location_id: 'loc-1', reply_to_email: 'barra@crown.test', morning_recipients: 'gm@crown.test' }];
  enviados.length = 0;
  r = await llamar({ accion: 'send', params: { datos: BASE, para: 'replyto', cuenta: 'wjm-hospitality', to: 'otro@fuera.test' } });
  prueba('la prueba va al reply-to de la locación', r.body && r.body.ok && JSON.stringify((enviados[0] || {}).to) === JSON.stringify(['barra@crown.test']), JSON.stringify(r.body) + ' ' + JSON.stringify((enviados[0] || {}).to));
  prueba('marcada como prueba', /^\[Test\] /.test((enviados[0] || {}).subject || ''));
  prueba('y dice a dónde', r.body.to === 'barra@crown.test');
  TABLAS.location_settings = [{ location_id: 'loc-1', reply_to_email: '' }];
  enviados.length = 0;
  r = await llamar({ accion: 'send', params: { datos: BASE, para: 'replyto', cuenta: 'wjm-hospitality' } });
  prueba('sin reply-to: lo dice y no manda', r.code === 400 && /reply-to/i.test(r.body.error || '') && /Settings › Emails/.test(r.body.error || '') && enviados.length === 0, JSON.stringify(r.body));

  // Axel, 2026-11-17 (lámina B): "quiero mandar cualquiera de los 2 a
  // distintos correos si lo necesito". Escritos en la pantalla: sólo con
  // el permiso de ajustes de la locación, correos válidos y como mucho 10.
  enviados.length = 0;
  r = await llamar({ accion: 'send', params: { datos: BASE, para: 'otros', to: ['gm@crown.test', 'Chef@Crown.test', 'chef@crown.test'] } });
  prueba('a otros correos: a esos, sin repetir', r.body && r.body.ok && JSON.stringify((enviados[0] || {}).to) === JSON.stringify(['gm@crown.test', 'Chef@Crown.test']), JSON.stringify(r.body) + ' ' + JSON.stringify((enviados[0] || {}).to));
  prueba('es el correo de verdad: sin "[Test]"', /^The Crown Tavern/.test((enviados[0] || {}).subject || ''), (enviados[0] || {}).subject);
  enviados.length = 0;
  r = await llamar({ accion: 'send', params: { datos: BASE, para: 'otros', to: ['gm@crown.test', 'no es correo'] } });
  prueba('uno que no es un correo: lo dice y no manda a nadie', r.code === 400 && /no es correo/.test(r.body.error || '') && enviados.length === 0, JSON.stringify(r.body));
  r = await llamar({ accion: 'send', params: { datos: BASE, para: 'otros', to: Array.from({ length: 11 }, (_, i) => 'p' + i + '@x.test') } });
  prueba('más de 10: no', r.code === 400 && /10/.test(r.body.error || '') && enviados.length === 0, JSON.stringify(r.body));
  r = await llamar({ accion: 'send', params: { datos: BASE, para: 'otros', to: [] } });
  prueba('sin nadie: lo dice', r.code === 400 && enviados.length === 0, JSON.stringify(r.body));
  r = await llamar({ accion: 'send', token: 'Bearer sesion-sin-ajustes', params: { datos: BASE, para: 'otros', to: ['gm@crown.test'] } });
  prueba('sin el permiso de ajustes de la locación: 403 y nada', r.code === 403 && enviados.length === 0, JSON.stringify(r.body));
  r = await llamar({ accion: 'send', token: 'Bearer sesion-sin-ajustes', params: { datos: BASE, para: 'replyto', cuenta: 'wjm-hospitality' } });
  prueba('el test al reply-to sí puede (no escribe direcciones)', r.code !== 403, JSON.stringify(r.body));
}

grupo('la migración y Settings › Emails');
{
  const fs = require('fs');
  const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
  const mig = path.join(RAIZ, 'database/migrations/035_morning_recipients.sql');
  prueba('la migración 035 añade la columna', fs.existsSync(mig) && /alter table public\.location_settings[\s\S]*add column if not exists morning_recipients/i.test(fs.readFileSync(mig, 'utf8')));
  const ms = leer('src/mobile-settings.js');
  prueba('Emails tiene su campo', /campo\('ms_morn', 'Morning email recipients'/.test(ms) && /morning_recipients: val\(host, 'ms_morn'\)/.test(ms));
  const { JSDOM } = require('jsdom');
  const w = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/', runScripts: 'outside-only' }).window;
  w.BARSTOCK_CONFIG = { SUPABASE_URL: 'https://sb.test', SUPABASE_KEY: 'k' };
  w.__cuerpos = [];
  w.fetch = async (u, o) => {
    if (/locations\?/.test(u)) return { ok: true, json: async () => [{ id: 'loc-1' }] };
    w.__cuerpos.push(JSON.parse(o.body)[0]);
    return w.__falla ? { ok: false, text: async () => w.__falla } : { ok: true, text: async () => '' };
  };
  w.eval(leer('src/location-settings.js'));
  await w.BarStockLocationSettings.saveSettings({ reply_to_email: 'a@b.c', report_recipients: 'x@y.z' });
  prueba('guardar sin el campo no lo manda (el escritorio no lo tiene)', !('morning_recipients' in w.__cuerpos[0]), JSON.stringify(w.__cuerpos[0]));
  await w.BarStockLocationSettings.saveSettings({ reply_to_email: 'a@b.c', report_recipients: 'x@y.z', morning_recipients: 'gm@crown.test' });
  prueba('con el campo, sí', w.__cuerpos[1].morning_recipients === 'gm@crown.test');
  w.__falla = '{"code":"PGRST204","message":"Could not find the \'morning_recipients\' column of \'location_settings\' in the schema cache"}';
  let err = '';
  try { await w.BarStockLocationSettings.saveSettings({ morning_recipients: 'gm@crown.test' }); } catch (e) { err = e.message; }
  prueba('sin la columna, dice qué migración falta', /morning_recipients/.test(err) && /035/.test(err), err);
  w.__falla = '{"code":"42501","message":"permission denied"}';
  err = '';
  try { await w.BarStockLocationSettings.saveSettings({ morning_recipients: 'gm@crown.test' }); } catch (e) { err = e.message; }
  prueba('otro error: el que fue', /permission denied/.test(err) && !/035/.test(err), err);
}

grupo('cada mañana, solo: Vercel lo manda al reply-to');
{
  // Axel, 2026-11-12: "hagámoslo automático, pero sólo para mí por ahora,
  // al correo registrado en reply-to". Los números salen de los MISMOS
  // módulos de src/ que usa la app, corridos en el servidor: no hay una
  // segunda copia del cálculo.
  const C = require(path.join(RAIZ, 'lib/morning-cron.js'));
  const SB = 'https://sb.test';
  Object.assign(process.env, { SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: 'srv', TOAST_RESTAURANT_GUID: 'guid-crown', RESEND_API_KEY: 'k-test' });
  let ajustes = [{ location_id: 'loc-1', reply_to_email: 'axel@crown.test', morning_recipients: 'gm@crown.test, bar@crown.test' }];
  const pedidas = [];
  const fetchViejo = global.fetch;
  global.fetch = async (u, o) => {
    u = String(u); pedidas.push({ u, metodo: (o && o.method) || 'GET', llave: o && o.headers && (o.headers.apikey || o.headers.Authorization) });
    const filas = /\/locations\?/.test(u) ? (/toast_restaurant_guid=not\.is\.null/.test(u) ? [{ id: 'loc-1', name: 'The Crown Tavern', account_id: 'wjm-hospitality', toast_restaurant_guid: 'guid-crown' }] : [])
      : /\/location_settings\?/.test(u) ? ajustes
      : /\/inventory_items\?/.test(u) ? [{ code: 'T1', item_name: "Tito's", vendor: 'LOOP', on_hand: 2, suggested: 4, value: 20, bottle_size_ml: 1000 }]
      : [];
    return { ok: true, status: 200, headers: { get: (k) => /content-range/i.test(k) ? '0-' + (filas.length - 1) + '/' + filas.length : null },
      json: async () => filas, text: async () => JSON.stringify(filas) };
  };
  const llamarCron = async (auth) => {
    const res = { code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
    await C.cronManana({ method: 'GET', headers: { authorization: auth }, query: {} }, res);
    return res;
  };

  delete process.env.CRON_SECRET;
  enviados.length = 0;
  let r = await llamarCron('Bearer x');
  prueba('sin CRON_SECRET no corre, y lo dice', r.code === 500 && /CRON_SECRET/.test(r.body.error) && enviados.length === 0, JSON.stringify(r.body));
  process.env.CRON_SECRET = 'cron-ok';
  r = await llamarCron('Bearer otro');
  prueba('con otra llave, 401 y nada', r.code === 401 && enviados.length === 0);

  r = await llamarCron('Bearer cron-ok');
  const e = enviados[0] || {};
  prueba('lo manda', r.code === 200 && r.body.ok && enviados.length === 1, JSON.stringify(r.body).slice(0, 300));
  // Axel, 2026-11-17: "configurar algunos a los que siempre se envía".
  // El automático va al reply-to y a la lista "Every morning", sin repetir.
  prueba('al reply-to y a la lista de siempre', JSON.stringify(e.to) === JSON.stringify(['axel@crown.test', 'gm@crown.test', 'bar@crown.test']), JSON.stringify(e.to));
  prueba('es el de verdad: sin "[Test]"', /^The Crown Tavern/.test(e.subject || ''), e.subject);
  prueba('el mismo correo de la app', /Good morning|Morning ☕|Rise and shine/.test(e.html || '') && /Sent via BarStock Pro/.test(e.html || ''));
  prueba('los números salen de Supabase con la llave del servidor', pedidas.some(p => /toast_sales\?/.test(p.u)) && pedidas.some(p => /inventory_items\?/.test(p.u)) &&
    pedidas.filter(p => p.u.startsWith(SB)).every(p => p.llave === 'srv' || p.llave === 'Bearer srv'), [...new Set(pedidas.map(p => p.u.split('?')[0]))].join(', '));
  prueba('y sólo LEE: ni una escritura', pedidas.every(p => p.metodo === 'GET'), pedidas.filter(p => p.metodo !== 'GET').map(p => p.metodo + ' ' + p.u).join(' | '));
  prueba('dice a quién y qué', r.body.enviados === 1 && r.body.locaciones[0].to === 'axel@crown.test, gm@crown.test, bar@crown.test' && typeof r.body.locaciones[0].asunto === 'string', JSON.stringify(r.body).slice(0, 300));

  ajustes = [{ location_id: 'loc-1', reply_to_email: '', morning_recipients: 'gm@crown.test' }];
  enviados.length = 0;
  r = await llamarCron('Bearer cron-ok');
  prueba('sin reply-to: no manda, y lo dice', r.code === 500 && /reply-to/i.test(r.body.error) && enviados.length === 0, JSON.stringify(r.body));

  // Axel, 2026-11-15: "también necesitamos ya configurarlo para Will's &
  // Bill's". Cada locación enlazada a Toast recibe el SUYO, con sus
  // números, en su reply-to; una sin reply-to no tumba a las demás.
  global.fetch = async (u, o) => {
    u = String(u); pedidas.push({ u, metodo: (o && o.method) || 'GET' });
    const loc = (/location_id=eq\.([^&]+)/.exec(u) || [])[1];
    const filas = /\/locations\?/.test(u) ? (/toast_restaurant_guid=not\.is\.null/.test(u) ? [
        { id: 'loc-1', name: 'The Crown Tavern', account_id: 'wjm', toast_restaurant_guid: 'guid-crown' },
        { id: 'loc-2', name: "Will's & Bill's", account_id: 'wjm', toast_restaurant_guid: 'guid-wb' },
        { id: 'loc-3', name: 'Jockey Tavern', account_id: 'wjm', toast_restaurant_guid: 'guid-jt' }] : [])
      : /\/location_settings\?/.test(u) ? ({ 'loc-1': [{ reply_to_email: 'axel@crown.test' }], 'loc-2': [{ reply_to_email: 'axel@wb.test' }], 'loc-3': [{ reply_to_email: '' }] }[loc] || [])
      : /\/inventory_items\?/.test(u) ? [{ code: 'T1', item_name: loc === 'loc-2' ? 'Jameson' : "Tito's", vendor: 'LOOP', on_hand: 2, suggested: 4, value: 20, bottle_size_ml: 1000 }]
      : [];
    return { ok: true, status: 200, headers: { get: (k) => /content-range/i.test(k) ? '0-' + (filas.length - 1) + '/' + filas.length : null },
      json: async () => filas, text: async () => JSON.stringify(filas) };
  };
  enviados.length = 0; pedidas.length = 0;
  r = await llamarCron('Bearer cron-ok');
  const aWB = enviados.find(x => /^Will's & Bill's/.test(x.subject || ''));
  prueba("Will's & Bill's recibe el suyo, en su reply-to", !!aWB && JSON.stringify(aWB.to) === JSON.stringify(['axel@wb.test']), JSON.stringify(enviados.map(x => [x.subject, x.to])));
  prueba('y Crown el suyo, sin mezclarse', enviados.some(x => /^The Crown Tavern/.test(x.subject || '') && JSON.stringify(x.to) === JSON.stringify(['axel@crown.test'])) && enviados.length === 2, JSON.stringify(enviados.map(x => [x.subject, x.to])));
  prueba('cada uno con su inventario', pedidas.some(p => /inventory_items\?location_id=eq\.loc-2/.test(p.u)) && pedidas.some(p => /inventory_items\?location_id=eq\.loc-1/.test(p.u)));
  const jt = ((r.body && r.body.locaciones) || []).find(x => /Jockey/.test(x.local || ''));
  prueba('la que no tiene reply-to no se manda, se dice cuál y no tumba a las demás', !!jt && !jt.ok && /reply-to/i.test(jt.error || '') && enviados.length === 2, JSON.stringify(r.body).slice(0, 400));
  prueba('y la respuesta no da por bueno lo que falló', r.body && r.body.ok === false && r.body.enviados === 2, JSON.stringify(r.body).slice(0, 300));
  // Axel, 2026-11-17: el lunes no se abre, y el martes llegaba un
  // correo que sólo decía "Monday was closed". Un día CARGADO y sin
  // ninguna venta no manda correo; uno sin cargar sí (no se sabe si se
  // abrió, y un lunes de evento tiene que llegar). Así un lunes abierto
  // por una ocasión especial manda su correo sin tocar ningún ajuste.
  const ayerNY = (() => { const t = new Date(Date.now() - 4 * 3600e3 - 864e5);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(t); })();
  const conAyer = (dias) => async (u, o) => {
    u = String(u); pedidas.push({ u, metodo: (o && o.method) || 'GET' });
    const filas = /\/locations\?/.test(u) ? [{ id: 'loc-1', name: 'The Crown Tavern', account_id: 'wjm', toast_restaurant_guid: 'guid-crown' }]
      : /\/location_settings\?/.test(u) ? [{ reply_to_email: 'axel@crown.test' }]
      : /\/toast_sales_days\?/.test(u) ? dias
      : /\/inventory_items\?/.test(u) ? [{ code: 'T1', item_name: "Tito's", vendor: 'LOOP', on_hand: 2, suggested: 4, value: 20, bottle_size_ml: 1000 }]
      : [];
    return { ok: true, status: 200, headers: { get: (k) => /content-range/i.test(k) ? '0-' + (filas.length - 1) + '/' + filas.length : null },
      json: async () => filas, text: async () => JSON.stringify(filas) };
  };
  global.fetch = conAyer([{ business_date: ayerNY, complete: true, closed: true, fetched_at: new Date().toISOString() }]);
  enviados.length = 0;
  r = await llamarCron('Bearer cron-ok');
  const om = ((r.body && r.body.locaciones) || [])[0] || {};
  prueba('ayer cargado y sin ninguna venta: no manda', enviados.length === 0, JSON.stringify(enviados.map(x => x.subject)));
  prueba('y lo dice, sin contarlo como fallo', r.code === 200 && r.body.ok === true && om.omitido && /no sales/i.test(om.omitido), JSON.stringify(r.body).slice(0, 300));
  global.fetch = conAyer([]);
  enviados.length = 0;
  r = await llamarCron('Bearer cron-ok');
  prueba('ayer sin cargar: sí manda (no se sabe si se abrió)', enviados.length === 1, JSON.stringify(r.body).slice(0, 300));
  global.fetch = fetchViejo;

  const v = JSON.parse(require('fs').readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8'));
  const cr = (v.crons || []).find(c => /provider=report/.test(c.path) && /cron=morning/.test(c.path));
  // Hobby: una vez al día, y Vercel lo dispara dentro de esa hora. A las
  // 13 UTC (8–9 AM en Nueva York en invierno), después de las dos cargas
  // de Toast (10 y 12 UTC): así ayer ya está cargado.
  prueba('Vercel lo llama una vez al día, después de las cargas de Toast', !!cr && /^0 13 \* \* \*$/.test(cr.schedule), JSON.stringify(cr));
  // Los módulos de src/ se leen al correr, no con require: sin esto Vercel
  // no los empaqueta con la función.
  const fn = (v.functions || {})['api/integrations.js'] || {};
  prueba('y la función lleva src/ consigo', /src\/\*\*/.test(String(fn.includeFiles || '')), JSON.stringify(fn));
}

grupo('en la app: los números salen de los mismos módulos');
{
  const { JSDOM } = require('jsdom');
  const fs = require('fs');
  const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
  async function app(ro) {
    const w = new JSDOM('<!doctype html><body class="m-shell"></body>', { url: 'https://x.test/', runScripts: 'outside-only' }).window;
    w.BARSTOCK_CONFIG = { LOCATION_NAME: 'The Crown Tavern' };
    w.state = { master: [{ item: "Tito's", suggested: 4 }, { item: 'Sin par', suggested: 0 }, { item: 'Sobra', suggested: 4 }] };
    w.BarStockToastSales = { ahora: async () => ({ hoy: '2026-11-12', semana: [{ fecha: '2026-11-10' }, Object.assign({}, AYER)] }) };
    w.eval(leer('src/pedido.js'));
    w.eval(leer('src/run-out.js'));
    const MED = [1.2, 0, 0.5, 0.8, 1.4, 2.6, 3.1];
    w.BarStockRunOut.ahora = typeof ro === 'function' ? ro : async () => (ro || { estado: 'listo', hoy: '2026-11-12', suficiente: true, filas: [
      { producto: "Tito's", live: 0.6, med: MED, viene: [], agota: '2026-11-12' },
      { producto: 'Sin par', live: 0.1, med: MED, viene: [], agota: '2026-11-12' },
      { producto: 'Sobra', live: 20, med: MED, viene: [], agota: null },
      { producto: 'Beer', live: 1, med: null, viene: [], agota: null }] });
    w.__llamadas = [];
    w.BarStockDevPanel = { esc: (x) => String(x), llamar: async (p, a, prm) => { w.__llamadas.push({ p, a, prm });
      return a === 'preview' ? { ok: true, asunto: 'S', html: '<p>vista</p>' } : { ok: true, to: 'axel@crown.test' }; } };
    w.BarStockToast = { show: (t) => { w.__toast = t; } };
    w.eval(leer('src/morning-report.js'));
    return w;
  }
  let w = await app();
  const d = await w.BarStockMorningReport.datos();
  prueba('ayer, tal cual lo da toast-sales', d.ayer && d.ayer.dinero === 3717 && d.ayer.botLicor === 22.1 && d.ayer.fecha === '2026-11-11', JSON.stringify(d.ayer));
  prueba('la locación y hoy', d.local === 'The Crown Tavern' && d.hoy === '2026-11-12' && d.prevision === 'ok');
  prueba('sólo lo que tiene par y no llega al domingo', d.agotan.length === 1 && d.agotan[0].producto === "Tito's", JSON.stringify(d.agotan));
  const t0 = d.agotan[0] || {};
  prueba('con cuánto pedir, de cuantoPedir', t0.pedir === 8 && Math.abs(t0.vende - 8.3) < 1e-9 && t0.queda === 0.6 && t0.agota === '2026-11-12', JSON.stringify(t0));

  for (const [ro, prev] of [[{ estado: 'contando' }, 'counting'], [{ estado: 'listo', hoy: '2026-11-12', suficiente: false, filas: [] }, 'history'],
    [async () => { throw new Error('cloud down'); }, 'error'], [{ estado: 'sinConteo' }, 'error']]) {
    w = await app(ro);
    const x = await w.BarStockMorningReport.datos();
    prueba('sin previsión (' + prev + '): se dice, no se manda una lista vacía', x.prevision === prev && x.agotan.length === 0, JSON.stringify(x).slice(0, 200));
  }
  w = await app(async () => { throw new Error('cloud down'); });
  prueba('y el error, con lo que pasó', /cloud down/.test((await w.BarStockMorningReport.datos()).detalle || ''));

  // El panel de Settings: la vista sale sola al entrar; "Send to me" la manda.
  w = await app();
  const host = w.document.createElement('div'); w.document.body.appendChild(host);
  await w.BarStockMorningReport.montar(host, () => '<div class="cab"></div>', () => {}, { tipo: 'daily' });
  await new Promise(r => setTimeout(r, 20));
  const fr = host.querySelector('iframe.m-mr-vista');
  prueba('al entrar, la vista del correo', !!fr && /vista/.test(fr.getAttribute('srcdoc') || '') && w.__llamadas[0].a === 'preview' && w.__llamadas[0].p === 'report',
    host.innerHTML.slice(0, 300));
  prueba('con los datos de la app', !!(w.__llamadas[0].prm && w.__llamadas[0].prm.datos && w.__llamadas[0].prm.datos.ayer));
  const bt = host.querySelector('#mrSend');
  prueba('el botón dice lo que hace: una prueba', !!bt && /Send a test/.test(bt.textContent), bt && bt.textContent);
  bt.click();
  await new Promise(r => setTimeout(r, 20));
  const env = w.__llamadas.find(x => x.a === 'send');
  prueba('lo manda al reply-to, con los mismos datos y sin direcciones', !!env && !!env.prm.datos && env.prm.para === 'replyto' && !!env.prm.cuenta && !('to' in env.prm), JSON.stringify(env && env.prm).slice(0, 160));
  prueba('y dice a dónde se mandó', /axel@crown\.test/.test(host.textContent + ' ' + (w.__toast || '')), host.textContent.slice(0, 200));

  // "Send to…" (Axel, 2026-11-17, lámina B): una hoja con la lista de
  // siempre puesta; se quita o se añade, y "Every morning" la guarda.
  const abrirHoja = async (st, op) => {
    const w3 = await app();
    w3.__guardado = null;
    w3.BarStockLocationSettings = { getSettings: async () => Object.assign({}, st),
      saveSettings: async (x) => { if (op && op.fallaGuardar) throw new Error('HTTP 500: nope'); w3.__guardado = x; } };
    const h = w3.document.createElement('div'); w3.document.body.appendChild(h);
    await w3.BarStockMorningReport.montar(h, () => '', () => {}, { tipo: 'daily' });
    await new Promise(r => setTimeout(r, 20));
    h.querySelector('#mrOtros').click();
    await new Promise(r => setTimeout(r, 20));
    return { w3, h, hoja: w3.document.getElementById('mSheet') };
  };
  const chips = (hoja) => [...hoja.querySelectorAll('.m-mr-chip')].map(c => c.firstChild.textContent);
  const escribir = (w3, hoja, t) => { const c = hoja.querySelector('#mrAdd'); c.value = t; c.dispatchEvent(new w3.KeyboardEvent('keydown', { key: 'Enter' })); };
  const ST = { reply_to_email: 'axel@crown.test', report_recipients: 'orders@crown.test', morning_recipients: 'gm@crown.test; bar@crown.test, malo' };
  {
    let { w3, h, hoja } = await abrirHoja(ST);
    prueba('"Send to…" abre la hoja con el tipo que se ve', !!hoja && /Send the daily email/.test(hoja.textContent), h.innerHTML.slice(0, 300));
    prueba('con la lista de siempre puesta (sólo los correos)', JSON.stringify(chips(hoja)) === JSON.stringify(['gm@crown.test', 'bar@crown.test']), JSON.stringify(chips(hoja)));
    prueba('y dice que el reply-to también lo recibe', /also goes to the reply-to, axel@crown\.test/.test(hoja.textContent));
    hoja.querySelector('.m-mr-chip button').click();                     // quita gm
    escribir(w3, hoja, 'chef@crown.test');
    prueba('quitar y añadir', JSON.stringify(chips(hoja)) === JSON.stringify(['bar@crown.test', 'chef@crown.test']), JSON.stringify(chips(hoja)));
    escribir(w3, hoja, 'no-es-correo');
    prueba('lo que no es un correo no entra, y lo dice', chips(hoja).length === 2 && /Not an email address: no-es-correo/.test(hoja.textContent));
    hoja.querySelector('#mrAdd').value = '';
    prueba('el botón dice a cuántos', /Send to 2/.test(hoja.querySelector('#mrMandar').textContent));
    prueba('"Every morning" empieza apagado: mandar a alguien una vez no cambia la lista', hoja.querySelector('#mrSiempre').getAttribute('aria-pressed') === 'false');
    hoja.querySelector('#mrMandar').click();
    await new Promise(r => setTimeout(r, 20));
    const e1 = w3.__llamadas.filter(x => x.a === 'send').pop();
    prueba('manda "otros" con esas direcciones y los datos que se ven', !!e1 && e1.prm.para === 'otros' && JSON.stringify(e1.prm.to) === JSON.stringify(['bar@crown.test', 'chef@crown.test']) && !!e1.prm.datos.ayer, JSON.stringify(e1 && e1.prm).slice(0, 200));
    prueba('sin "Every morning" no guarda nada', w3.__guardado === null);
    prueba('la hoja se cierra y dice a quién', !w3.document.getElementById('mSheet') && /Sent the daily email to/.test(h.textContent + (w3.__toast || '')));

    ({ w3, h, hoja } = await abrirHoja(ST));
    escribir(w3, hoja, 'chef@crown.test');
    hoja.querySelector('#mrSiempre').click();
    hoja.querySelector('#mrMandar').click();
    await new Promise(r => setTimeout(r, 20));
    const g = w3.__guardado || {};
    prueba('con "Every morning", guarda esa lista', g.morning_recipients === 'gm@crown.test, bar@crown.test, chef@crown.test', JSON.stringify(g));
    prueba('sin borrar el reply-to ni lo demás de la locación', g.reply_to_email === 'axel@crown.test' && g.report_recipients === 'orders@crown.test', JSON.stringify(g));
    prueba('y luego la manda', w3.__llamadas.some(x => x.a === 'send' && x.prm.para === 'otros'));

    ({ w3, h, hoja } = await abrirHoja(ST, { fallaGuardar: true }));
    hoja.querySelector('#mrSiempre').click();
    hoja.querySelector('#mrMandar').click();
    await new Promise(r => setTimeout(r, 20));
    prueba('si no se puede guardar la lista: lo dice y no manda', !w3.__llamadas.some(x => x.a === 'send') && /Could not save the every-morning list: HTTP 500: nope/.test(hoja.textContent), hoja.textContent.slice(0, 300));
  }
  {
    // Daily | Weekly: lo que se manda es lo que se ve.
    const css = leer('styles/mobile-app.css');
    prueba('sin el permiso de ajustes, no se ve ni la prueba ni "Send to…"', /bs-sin-ajustes_locacion #mScreens \.m-mr :is\(#mrSend, #mrOtros\)/.test(css));
    prueba('el campo no hace zoom en iOS', /#mSheet \.m-mr-add \{[^}]*font-size: max\(16px/.test(css));
    prueba('los botones viejos ya no están', !/mrSemana|mrLista/.test(leer('src/morning-report.js')));
  }

  // El lunes: datos() reúne la semana con la MISMA toast-sales del Home.
  {
    const sum = (d, k) => new Date(new Date(d + 'T12:00:00Z').getTime() + k * 864e5).toISOString().slice(0, 10);
    const dw = (d) => new Date(d + 'T12:00:00Z').getUTCDay();
    const dias = [], ventas = [], porDia = {};
    for (let k = 1; k <= 70; k++) {
      const f = sum('2026-11-23', -k);
      dias.push({ business_date: f, complete: true, closed: true });
      if (dw(f) === 1) continue;                       // el lunes, cerrado
      const extra = f >= '2026-11-16' ? 1.1 : 1;       // la semana pasada, 10 % más
      ventas.push({ business_date: f, sales_category: 'Liquor', net: 100 * (dw(f) + 1) * extra, toast_item_name: 'Tito' });
      porDia[f] = 2;
    }
    const mk = async (hoy) => {
      const w2 = await app({ estado: 'listo', hoy, suficiente: true, filas: [] });
      delete w2.BarStockToastSales;   // el de mentira de app(): aquí va el de verdad
      w2.eval(leer('src/toast-sales.js'));
      const TS = w2.BarStockToastSales;
      const base = { productos: [{ producto: "Tito's", porDia }], ventas, dias, hoy };
      TS.ahora = async () => Object.assign({ hoy: null, base }, TS.resumir(base));
      return w2;
    };
    let w2 = await mk('2026-11-23');
    const x = await w2.BarStockMorningReport.datos();
    const S = x.semanal || {};
    prueba('el lunes, datos() trae la semana pasada', S.lunes === '2026-11-16' && S.cargados === 7 && x.hoy === '2026-11-23', JSON.stringify(S).slice(0, 200));
    prueba('su total y lo de una semana normal, de semanaCal', S.total && Math.round(S.total.dinero) === 2860 && Math.round(S.total.normalDinero) === 2600 && S.total.normalLicor > 0, JSON.stringify(S.total));
    prueba('el mejor día y lo más vendido', S.mejor && S.mejor.fecha === '2026-11-21' && S.top[0] && S.top[0].nombre === "Tito's" && S.top[0].botellas === 12, JSON.stringify([S.mejor, S.top]));
    prueba('el domingo, con su normal', S.domingo && S.domingo.fecha === '2026-11-22' && Math.round(S.domingo.dinero) === 110 && S.domingo.normalDinero === 100, JSON.stringify(S.domingo));
    prueba('esta semana, día por día, con el lunes en cero', (S.plan || []).length === 7 && S.plan[0].dinero === 0 && S.plan[5].dinero === 700, JSON.stringify(S.plan));
    w2 = await mk('2026-11-24');
    prueba('un martes, no (es el correo de cada día)', !(await w2.BarStockMorningReport.datos()).semanal);
    prueba('un martes con op.semanal, sí: la misma semana pasada', ((await w2.BarStockMorningReport.datos({ semanal: true })).semanal || {}).lunes === '2026-11-16');

    // Weekly: la vista pasa al resumen, y "Send a test" manda ése.
    const h4 = w2.document.createElement('div'); w2.document.body.appendChild(h4);
    await w2.BarStockMorningReport.montar(h4, () => '', () => {}, { tipo: 'daily' });
    await new Promise(r => setTimeout(r, 20));
    prueba('abre en Daily, con el correo de cada día', h4.querySelector('#mrTipo .on').dataset.t === 'daily' && !w2.__llamadas.filter(z => z.a === 'preview').pop().prm.datos.semanal);
    w2.__llamadas.length = 0;
    h4.querySelector('#mrTipo [data-t="weekly"]').click();
    await new Promise(r => setTimeout(r, 30));
    prueba('Weekly enseña el resumen de la semana', h4.querySelector('#mrTipo .on').dataset.t === 'weekly' && !!(w2.__llamadas.find(z => z.a === 'preview') || { prm: { datos: {} } }).prm.datos.semanal);
    h4.querySelector('#mrSend').click();
    await new Promise(r => setTimeout(r, 30));
    const env3 = w2.__llamadas.find(z => z.a === 'send');
    prueba('y "Send a test" manda la semana, al reply-to y sin direcciones', !!env3 && !!(env3.prm.datos && env3.prm.datos.semanal) && env3.prm.para === 'replyto' && !('to' in env3.prm), String(JSON.stringify(env3 && env3.prm)).slice(0, 200));
    // Un lunes, Daily manda el de cada día, no el semanal que sale solo.
    const wl = await mk('2026-11-23');
    prueba('un lunes con op.diario, el de cada día', !(await wl.BarStockMorningReport.datos({ diario: true })).semanal);
  }

  const ms = leer('src/mobile-settings.js');
  prueba('Settings › Toast lo ofrece', /id: 'morning'[^}]*n: 'Morning email'/.test(ms) && /_panel === 'morning'[\s\S]{0,120}BarStockMorningReport/.test(ms));
  const html = leer('index.html');
  const pos = (f) => html.indexOf('src="src/' + f);
  prueba('se carga después de lo que usa y antes de Settings',
    pos('morning-report.js') > pos('run-out.js') && pos('morning-report.js') > pos('toast-sales.js') && pos('morning-report.js') > pos('dev-panel.js') &&
    pos('morning-report.js') < pos('mobile-settings.js') && pos('run-out.js') > 0, [pos('run-out.js'), pos('toast-sales.js'), pos('morning-report.js'), pos('mobile-settings.js')].join(','));
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') + '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);
})();
