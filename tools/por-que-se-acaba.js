/* ── ¿Por qué dice que se acaba? ──────────────────────────────────────
 *
 * SÓLO LECTURA. No hace ni un GET propio: lee lo que la app ya calculó
 * (BarStockLiveCache.fila, la fila de run-out) y rehace la cuenta con
 * las MISMAS funciones (run-out.ritmoHoy, pedido.recorrido, colchonDe).
 * No escribe nada.
 *
 *   1. Abre app.barstockpro.com en la locación, en el Home (que el LIVE
 *      esté cargado: la tarjeta de Running out ya enseñada).
 *   2. Consola del navegador. Pega este archivo entero y Enter.
 *   3. (async () => { await bsSeAcaba('Canal Grande'); })();
 *
 * Por qué existe (Axel, 2026-11-18): Canal Grande y Laboure salieron
 * "Out today" a media tarde con 2.4–2.5 botellas y él veía que llegaban
 * a la entrega del jueves. La fecha sale de cuatro piezas que se suman
 * (lo que falta de hoy con el ritmo, el margen, el colchón y la
 * demanda), y desde la pantalla no se ve cuál pesa. Esto enseña cada
 * una y, al final, la fecha que saldría quitando cada pieza por
 * separado: la que la cambia es la que la causa.
 */
(() => {
  const D3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const n2 = (x) => x == null || !isFinite(x) ? '—' : (Math.round(x * 100) / 100).toFixed(2);
  const hora = (ms) => ms == null ? '—' : new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  window.bsSeAcaba = async function (texto) {
    const LC = window.BarStockLiveCache, R = window.BarStockRunOut, P = window.BarStockPedido;
    if (!LC || !R || !P || !R.ritmoHoy) { console.log('Faltan módulos (¿app sin recargar?): LiveCache, RunOut.ritmoHoy o Pedido.'); return; }
    const master = (window.state && window.state.master) || [];
    const q = norm(texto);
    const hay = master.filter(r => r && r.item && norm(r.item).includes(q));
    if (!hay.length) { console.log('Ningún producto contiene "' + texto + '".'); return; }
    if (hay.length > 1) console.log('Varios coinciden, uso el primero:', hay.map(r => r.item));
    const r = hay[0];
    if (LC.cargar) { try { await LC.cargar(); } catch (e) { /* lo que haya */ } }
    const f = LC.fila(r);
    if (!f) { console.log(r.item + ': sin fila de run-out (no se movió desde el conteo, o el LIVE no ha cargado).'); return; }
    if (!f.dem || !f.dem.porDia) { console.log(r.item + ': Toast no lo vende con historia suficiente; no hay fecha.'); return; }

    const ahora = f.ahoraMs || Date.now();
    const hoy = P.diaDe(ahora);
    const w = new Date(hoy + 'T12:00:00Z').getUTCDay();
    const dem = f.dem;
    const usualHoy = Number(dem.porDia[w]) || 0;
    const v = Number(f.hoyVendido) || 0;
    const fr = f.hoyFrac;
    const rh = R.ritmoHoy(dem.porDia, hoy, v, fr, dem.cv);
    const deSiempre = rh.deSiempre;
    const hoyResta = rh.resto;
    const viene = (f.viene || []).map(x => ({ cuando: Date.parse(x.cuando), n: Number(x.n) || 0 }));
    const base = { dem, stock: (Number(f.live) || 0) - (Number(f.margen) || 0), viene, ahora, dias: 7, hoyResta };

    console.log('━━ ' + r.item + ' ━━  calculado ' + hora(ahora));
    console.log('LIVE ' + n2(f.live) + '  − margen ' + n2(f.margen) + '  = punto de partida ' + n2(base.stock));
    console.log('Viene: ' + (viene.length ? viene.map(x => '+' + x.n + ' ' + hora(x.cuando)).join(', ') : 'nada'));
    console.log('Demanda (' + dem.fuente + '): ' + n2(dem.semanal) + '/semana, σ ' + n2(dem.sigma) +
      ', tendencia ×' + n2(dem.tendencia) + ', reciente ' + n2(dem.reciente));
    console.log('  por día: ' + D3.map((d, i) => d + ' ' + n2(dem.porDia[i])).join(' · '));
    console.log('HOY (' + D3[w] + '): lo de siempre ' + n2(usualHoy) + ', vendido ' + n2(v) +
      ' al Sync de ' + hora(f.hoySync ? Date.parse(f.hoySync) : null) + ', parte del día a esa hora ' +
      (fr == null ? '— (sin curva)' : Math.round(fr * 100) + '%'));
    console.log('  cuánto varía de un día a otro (cv): ' + n2(dem.cv) + (dem.cv == null ? ' (sin dato: se usa 1)' : ''));
    console.log('  a hoy se le cree Z = f/(f+cv) = ' + Math.round(rh.z * 100) + '%; va a ×' + n2(rh.rho) +
      ' de lo normal → ritmo creído λ = 1 + Z(ρ−1) = ×' + n2(rh.lambda));
    console.log('  lo que falta de hoy = max(siempre − vendido = ' + n2(deSiempre) + ', siempre×(1−f)×λ) = ' + n2(hoyResta) +
      (rh.usaRitmo ? '  ← manda el RITMO' : '  ← manda lo de siempre'));

    const rec = P.recorrido(base);
    console.log('Colchón (Z ' + P.Z + ' · σ · √(uso/semanal)): con lo de hoy, ' + n2(P.colchonDe(dem, hoyResta)) +
      '; con un día de ' + D3[w] + ', ' + n2(P.colchonDe(dem, usualHoy)));
    console.table(rec.dias.map(d => ({ dia: d.dia, seguro: n2(d.seguro), llega: d.llega || '', cerrado: d.cerrado ? 'sí' : '', agotado: d.agotado ? 'SÍ' : '' })));
    console.log('Se acaba: ' + (rec.fin ? rec.fin.dia + ' (en ' + rec.fin.enDias + ' días) a las ' + hora(rec.fin.en) : 'no en 7 días'));
    console.log('Order N de la tarjeta: ' + LC.pedir(r));

    // Quitando cada pieza por separado: la que mueve la fecha es la causa.
    const fin = (op) => { const x = P.recorrido(Object.assign({}, base, op)).fin; return x ? x.dia + ' ' + hora(x.en) : 'no en 7 días'; };
    console.log('━━ Sin cada pieza ━━');
    console.table({
      'tal cual': { se_acaba: fin({}) },
      'sin el ritmo de hoy': { se_acaba: fin({ hoyResta: deSiempre }) },
      'sin el margen': { se_acaba: fin({ stock: Number(f.live) || 0 }) },
      'sin el colchón': { se_acaba: fin({ z: 0 }) },
      'sin ninguna de las tres': { se_acaba: fin({ hoyResta: deSiempre, stock: Number(f.live) || 0, z: 0 }) }
    });
  };
  console.log('Listo: (async () => { await bsSeAcaba(\'Canal Grande\'); })();');
})();
