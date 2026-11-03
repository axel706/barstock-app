#!/usr/bin/env node
/*
 * ── Lo que la ficha del movil trajo del escritorio ──────────────────
 *
 * Tres cosas que el panel de escritorio tenia y el telefono no: la
 * grafica de las ultimas semanas, la fecha del conteo, y el boton de
 * aplicar Pour·IQ.
 *
 * Lo que se protege:
 *
 *   1. El consumo sale CORREGIDO si alguien arreglo el conteo de
 *      cierre de esa semana. Si no, la grafica cuenta una historia y
 *      la columna Usage otra sobre el mismo producto.
 *   2. Una consulta que falla devuelve [], y con [] NO se pinta nada.
 *      Una grafica plana se lee como "este producto no se mueve", que
 *      es el disfraz de siempre: un fallo con pinta de dato.
 *   3. El par no salta de golpe: ±2 por paso, y el boton dice el
 *      destino real, no el optimo.
 *   4. Si el PATCH falla, NO se toca el estado local. Un par que no se
 *      guardo y dice que si manda la siguiente orden con el viejo.
 *   5. Y todo esto vive en UN sitio: escritorio y movil llaman al
 *      mismo modulo. Eran siete duplicaciones en este proyecto; esta
 *      no es la octava.
 *
 *   node tools/test-ficha-semanas.js
 */

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let ok = 0, mal = 0;
function prueba(n, c, d) {
  if (c) { ok++; console.log('  ok   ' + n); }
  else { mal++; console.log('  MAL  ' + n + (d ? '   → ' + d : '')); }
}
const grupo = t => console.log('\n' + t);

// Un window de mentira con el fetch controlado.
function cargar(respuestas) {
  const llamadas = [];
  const w = {
    BARSTOCK_CONFIG: { SUPABASE_URL: 'https://x.test', SUPABASE_KEY: 'k',
                       LOCATION_NAME: 'The Crown Tavern' },
    console: { warn() {} }
  };
  w.fetch = async (url, opt) => {
    llamadas.push({ url, opt });
    if (/\/locations\?/.test(url)) return { ok: true, json: async () => [{ id: 'loc1' }] };
    const r = respuestas.shift();
    if (!r) return { ok: true, status: 200, json: async () => [] };
    if (r.boom) throw new Error('red caida');
    return { ok: r.ok !== false, status: r.status || 200, json: async () => r.body };
  };
  global.window = w;
  new Function('window', 'fetch', 'console',
    fs.readFileSync(path.join(RAIZ, 'src/product-weeks.js'), 'utf8'))(w, w.fetch, w.console);
  return { w, W: w.BarStockProductWeeks, llamadas };
}

// Una semana tal y como viene de inventory_snapshots.
const sem = (d, used, extra) => Object.assign(
  { week_start: d, used, on_hand_start: null, ordered: 0, on_hand_end_adjusted: null },
  extra || {});

(async () => {

grupo('el consumo sale corregido cuando alguien arreglo el cierre');
{
  const { W } = cargar([{ body: [
    // Esta semana se corrigio: habia 10, entraron 4, quedaron 9.
    // Consumo real 5, aunque `used` diga 2.
    sem('2026-10-19', 2, { on_hand_start: 10, ordered: 4, on_hand_end_adjusted: 9 }),
    sem('2026-10-12', 3)
  ] }]);
  const s = await W.semanas('Tito’s Vodka', 4);
  prueba('llegan las dos', s.length === 2, String(s.length));
  prueba('de la mas vieja a la mas nueva',
    s[0].semana === '2026-10-12', s[0].semana);
  prueba('la corregida usa inicio + entradas - corregido',
    s[1].usado === 5, String(s[1].usado));
  prueba('y la que no, su propio used', s[0].usado === 3, String(s[0].usado));
}
{
  // Una correccion que da negativo no se pinta hacia abajo: una barra
  // negativa no significa nada en "cuanto se consumio".
  const { W } = cargar([{ body: [
    sem('2026-10-19', 0, { on_hand_start: 2, ordered: 0, on_hand_end_adjusted: 7 })
  ] }]);
  const s = await W.semanas('X', 4);
  prueba('un consumo negativo se queda en cero', s[0].usado === 0, String(s[0].usado));
}

grupo('un fallo no se disfraza de producto quieto');
{
  const { W } = cargar([{ boom: true }]);
  const s = await W.semanas('X', 4);
  prueba('la red caida devuelve vacio', Array.isArray(s) && s.length === 0);
}
{
  const { W } = cargar([{ ok: false, status: 500, body: [] }]);
  const s = await W.semanas('X', 4);
  prueba('un 500 tambien', s.length === 0);
}
{
  // Y la ficha del movil NO pinta con vacio. Es la regla entera: el
  // modulo puede devolver [], pero quien dibuja tiene que callarse.
  const src = fs.readFileSync(path.join(RAIZ, 'src/mobile-search.js'), 'utf8');
  const f = src.match(/async function pintarSemanas[\s\S]*?\n  \}/);
  prueba('pintarSemanas existe', !!f);
  prueba('y se va si no hay semanas',
    !!f && /if \(!s\.length\) return;/.test(f[0]));
}

grupo('la grafica vive en el hueco de la cabecera');
{
  const hero = fs.readFileSync(path.join(RAIZ, 'src/product-hero.js'), 'utf8');
  const src = fs.readFileSync(path.join(RAIZ, 'src/mobile-search.js'), 'utf8');
  const inv = fs.readFileSync(path.join(RAIZ, 'src/mobile-inventory.js'), 'utf8');

  prueba('la cabecera sabe abrir el hueco', /o\.hueco \? '<div class="m-fic-g">/.test(hero));
  // Vacia NO ocupa: una ranura que reserva aire sin nada dentro
  // descoloca el nombre sin motivo.
  prueba('y no lo abre si no se lo piden',
    /\$\{o\.hueco \?/.test(hero) && /: ''\}/.test(hero));
  prueba('la ficha de busqueda lo pide', /hueco: true/.test(src));
  // Inventory NO: ahi la cabecera encabeza un formulario de edicion y
  // una grafica al lado del nombre es un dato que nadie fue a buscar.
  prueba('la hoja de Inventory no', !/hueco/.test(inv));
  prueba('y la grafica se pinta dentro del hueco',
    /querySelector\('\.m-fic-g'\)/.test(src));

  // Lo que ya no puede volver: la tarjeta propia de 110px.
  prueba('ya no hay tarjeta de semanas', !/id="msSem"/.test(src));
  const css = fs.readFileSync(path.join(RAIZ, 'styles/mobile-app.css'), 'utf8');
  prueba('ni su CSS', !/\.m-sem-k/.test(css));
  prueba('pero si el del hueco', /\.m-fic-gb i\.hoy/.test(css));
}

grupo('las semanas de evento quedan fuera');
{
  const { W, llamadas } = cargar([{ body: [] }]);
  await W.semanas('X', 6);
  const u = llamadas[llamadas.length - 1].url;
  prueba('la consulta las excluye', /is_event_week=eq\.false/.test(u));
  prueba('y pide las que se le pidieron', /limit=6/.test(u), u.slice(-40));
}

grupo('el par no salta de golpe');
{
  const { W } = cargar([]);
  prueba('de 1 a 9, el paso es 3', W.paso(1, 9) === 3, String(W.paso(1, 9)));
  prueba('de 9 a 1, el paso es 7', W.paso(9, 1) === 7, String(W.paso(9, 1)));
  prueba('de 1 a 2 llega entero', W.paso(1, 2) === 2, String(W.paso(1, 2)));
  prueba('de 1 a 3 tambien', W.paso(1, 3) === 3, String(W.paso(1, 3)));
  // Y este null es la diferencia entre enseñar el boton y no enseñarlo.
  prueba('si ya coincide, no hay paso', W.paso(4, 4) === null, String(W.paso(4, 4)));
  prueba('sin optimo, tampoco', W.paso(4, null) === null, String(W.paso(4, null)));
}

grupo('hacia donde va');
{
  const { W } = cargar([]);
  const s = (...n) => n.map((usado, i) => ({ semana: 'w' + i, usado }));
  prueba('con tres semanas no se opina', W.rumbo(s(1, 5, 9)) === null);
  prueba('subiendo lo dice', (W.rumbo(s(1, 1, 5, 5)) || {}).txt === 'Picking up');
  prueba('bajando tambien', (W.rumbo(s(5, 5, 1, 1)) || {}).txt === 'Slowing down');
  prueba('y plano es plano', (W.rumbo(s(3, 3, 3, 3)) || {}).txt === 'Steady');
  prueba('con el delta', (W.rumbo(s(1, 1, 5, 5)) || {}).d === 4,
    String((W.rumbo(s(1, 1, 5, 5)) || {}).d));
}

grupo('un par que no se guardo no dice que si');
{
  const { W } = cargar([{ ok: false, status: 403, body: null }]);
  const r = { item: 'X', onHand: 2, suggested: 1 };
  let reventó = false;
  try { await W.aplicarPar(r, 3); } catch (e) { reventó = true; }
  prueba('el PATCH fallido lanza', reventó);
  prueba('y el par local NO se toco', r.suggested === 1, String(r.suggested));
}
{
  const { W, llamadas } = cargar([{ ok: true, body: null }]);
  const r = { item: 'Tito’s', onHand: 2, suggested: 1 };
  await W.aplicarPar(r, 3);
  prueba('el bueno si lo escribe', r.suggested === 3, String(r.suggested));
  const p = llamadas[llamadas.length - 1];
  prueba('con PATCH', p.opt.method === 'PATCH', String(p.opt.method));
  prueba('y anota la fecha del ajuste', /par_adjusted_week/.test(p.opt.body));
}

grupo('y esto vive en UN sitio, no en dos');
{
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const movil = fs.readFileSync(path.join(RAIZ, 'src/mobile-search.js'), 'utf8');

  prueba('el escritorio pide las semanas al modulo',
    /BarStockProductWeeks\.semanas\(/.test(html));
  // El movil lo guarda en una local `W`, asi que se busca el modulo,
  // no la llamada literal.
  prueba('el movil tambien', /BarStockProductWeeks/.test(movil) &&
    /W\.semanas\(/.test(movil));
  prueba('el escritorio pide el paso al modulo',
    /BarStockProductWeeks\.paso\(/.test(html));
  prueba('el movil tambien', /W\.paso\(/.test(movil));
  prueba('y los dos escriben por el mismo sitio',
    /BarStockProductWeeks\.aplicarPar\(/.test(html) &&
    /BarStockProductWeeks\.aplicarPar\(/.test(movil));

  // Lo que ya no puede volver. Ojo: index tiene OTRA consulta a
  // inventory_snapshots, la del modal grande, que pide todas las
  // semanas y el historial de ordenes. Esa es otra cosa y se queda; lo
  // que no puede volver es la de la grafica, con su limite y su select.
  prueba('index ya no arma la consulta de la grafica a mano',
    !/inventory_snapshots[^']*limit=4/.test(html));
  prueba('ni la correccion del cierre',
    !/on_hand_end_adjusted;\s*\n\s*const used/.test(html));
  prueba('ni parchea el par a mano',
    !/par_adjusted_week: new Date/.test(html));
  // Ni el tope escrito con numeros sueltos.
  prueba('ni calcula el tope de ±2 a mano',
    !/Math\.max\(optimal, r\.suggested - 2\)/.test(html));

  prueba('product-weeks.js se carga antes que mobile-search',
    html.indexOf('src/product-weeks.js') < html.indexOf('src/mobile-search.js'));
}

grupo('la fecha del conteo sale de Zones, no de una copia');
{
  const z = fs.readFileSync(path.join(RAIZ, 'src/zones.js'), 'utf8');
  const movil = fs.readFileSync(path.join(RAIZ, 'src/mobile-search.js'), 'utf8');
  prueba('Zones exporta cuando', /invalidate, cuando/.test(z));
  prueba('y el movil lo llama', /Z\.cuando\(d\.at\)/.test(movil));
  // Que no se haya escrito otra vez el calculo de dias.
  prueba('el movil no recalcula los dias',
    !/86400000/.test(movil), 'hay un calculo de dias suelto');
}

grupo('y los bloques de la ficha respiran igual');
{
  // El aire de esta hoja va todo por ARRIBA. El bloque de Pour·IQ se
  // escribio al reves —margen abajo, ninguno arriba— y quedaba pegado
  // a la tarjeta de datos mientras le sobraba hueco con los botones,
  // que ya traen el suyo.
  const css = fs.readFileSync(path.join(RAIZ, 'styles/mobile-app.css'), 'utf8');
  const bloque = (sel) => {
    const m = css.match(new RegExp('\\' + sel + '\\s*\\{([^}]*)\\}'));
    return m ? m[1] : '';
  };
  for (const sel of ['.m-zon', '.m-iqb']) {
    const d = bloque(sel);
    prueba(sel + ' separa por arriba', /margin-top:\s*9px/.test(d), d.trim().slice(0, 50));
    prueba(sel + ' y no por abajo', !/margin-bottom/.test(d), d.trim().slice(0, 50));
  }
  prueba('.m-rows tambien', /margin-top:\s*9px/.test(bloque('.m-rows')));

  // Y la regla muerta no vuelve: ponia margin-bottom: 0 a la ultima
  // .m-card con un comentario explicando el margen que quitaba, y no
  // quitaba ninguno porque .m-card no tiene estilos en ningun sitio.
  prueba('la regla que no hacia nada no volvio',
    !/\.m-card:last-of-type/.test(css));
}

grupo('y la hoja sigue siendo una tarjeta');
{
  // Con la grafica y Pour·IQ dentro, a 88vh dejaba de parecer una
  // tarjeta: la franja de arriba es lo que dice "esto se cierra".
  const css = fs.readFileSync(path.join(RAIZ, 'styles/mobile-app.css'), 'utf8');
  const m = css.match(/\.m-sheet-box\.m-ficha\s*\{[^}]*max-height:\s*(\d+)vh/);
  prueba('la ficha tiene tope de alto', !!m);
  prueba('y deja ver lo de detras', !!m && Number(m[1]) <= 80, m && m[1] + 'vh');
}

console.log('\n' + (mal ? mal + ' MAL' : 'todo bien') +
            '   ·   ' + (ok + mal) + ' comprobaciones');
process.exit(mal ? 1 : 0);

})();
