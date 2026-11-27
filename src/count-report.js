(() => {
  if (window.BarStockCountReport) return;

  // ── El reporte de un conteo (Reports › Counts) ───────────────────────
  //
  // Axel, 2026-11-27, sobre cinco láminas: "un registro de los counts,
  // como cuántas botellas se contaron en éste y cuáles hay de más o de
  // menos con respecto al count anterior […] en modo reporte, fácil de
  // entender pero mostrando información útil". La forma elegida: arriba
  // el resumen con a dónde se fue el dinero; la tabla de todos los
  // productos con su propio scroll, la diferencia en una píldora, el
  // dinero aparte, la verificación de media semana en su columna y, bajo
  // el producto, una franja con lo que PODRÍA ser; después lo que parece
  // un error al contar, lo corto y lo de más, lo que se repite y semana
  // tras semana.
  //
  // Aquí sólo las cuentas y la lectura: lo pintan el escritorio
  // (desk-counts.js) y, después, el teléfono. Nada escribe.
  //
  // De dónde sale cada cosa (todo ya se guarda; sin migraciones):
  //   · cada conteo: count_sessions (cuándo, tiempo activo, productos);
  //   · lo contado de cada producto, semana a semana:
  //     inventory_snapshots.on_hand_start (lo escribe runCycle al cerrar
  //     el primer conteo de la semana, como lee live-expected.antes);
  //   · Live vs count: live_expected_cycles y live_expected, que guarda
  //     el cierre desde el 2026-11-15: lo que había, lo que llegó, lo
  //     vendido, lo esperado, lo contado y la verificación de la semana;
  //   · el porqué: las causas de live-diagnostico.js (las del correo del
  //     lunes, una sola cuenta) más cuatro nuevas que salen de comparar
  //     con el conteo de antes. Siempre "podría": la app señala, Axel
  //     decide. Lo vendido sin receta no se le cuelga a un producto: el
  //     ciclo no guarda de qué tragos salió cada botella.

  const D = () => window.BarStockLiveDiag;
  const cfg = () => window.BARSTOCK_CONFIG || {};
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const r1 = (n) => Math.round(n * 10) / 10;
  const r2 = (n) => Math.round(n * 100) / 100;
  const n1 = (n) => { const x = r1(Number(n) || 0); return Number.isInteger(x) ? String(x) : x.toFixed(1); };

  // Un ciclo de Live vs count es de un conteo si cerró a la vez: guardar()
  // usa como cycle_end la hora del cierre, y count_sessions.finished_at es
  // la misma hora (unos segundos de diferencia). Seis horas de margen por
  // si el cierre tardó o se guardó la sesión después.
  const MARGEN_CICLO = 6 * 3600e3;
  // Cuántos conteos de historia se miran (lo que se repite y las barras).
  const SEMANAS = 8;
  // Lo que se repite: el mismo lado, fuera de la regla, tantos conteos.
  const SEGUIDAS = 3;
  // Un salto que no explica nada de lo que llegó: tantas botellas, y más
  // de esa parte del par.
  const SALTO_MIN = 3, SALTO_PAR = 0.5;

  const fechaCorta = (iso) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  };
  const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));

  // ── Los conteos: uno por semana ──────────────────────────────────────
  // Un reconteo del jueves escribe otra fila en la misma semana y no abre
  // ciclo (live-expected.antes lo explica): la semana es UN conteo, el
  // primero que se cerró, y los demás se cuentan como reconteos.
  function semanas(sesiones) {
    const porSemana = new Map();
    for (const s of sesiones || []) {
      if (!s || !s.week_key || !s.finished_at) continue;
      if (!porSemana.has(s.week_key)) porSemana.set(s.week_key, []);
      porSemana.get(s.week_key).push(s);
    }
    const out = [];
    for (const [semana, ss] of porSemana) {
      ss.sort((a, b) => String(a.finished_at).localeCompare(String(b.finished_at)));
      out.push({ semana, sesion: ss[0], reconteos: ss.length - 1 });
    }
    return out.sort((a, b) => String(b.sesion.finished_at).localeCompare(String(a.sesion.finished_at)));
  }

  function cicloDe(sesion, ciclos) {
    const t = Date.parse(sesion && sesion.finished_at);
    if (!Number.isFinite(t)) return null;
    let mejor = null, dmin = Infinity;
    for (const c of ciclos || []) {
      const d = Math.abs(Date.parse(c.cycle_end) - t);
      if (d <= MARGEN_CICLO && d < dmin) { mejor = c; dmin = d; }
    }
    return mejor;
  }

  // El tiempo contra el conteo de antes: la frase de Finish count.
  function vsTiempo(s, antes) {
    const F = window.BarStockCountFinish || {};
    const min = Number(F.MINIMO_PARA_COMPARAR) || 0;
    if (!s || !antes || typeof F.comparar !== 'function') return null;
    const a = num(s.active_ms), b = num(antes.active_ms);
    if (a < min || b < min) return null;
    return { txt: F.comparar(a, b, ''), rapido: a < b, lento: a > b };
  }

  // Lo de un ciclo en dinero, sólo de lo que Toast vende (lo demás no
  // tiene Live). corto / sobra: lo de los productos que se alejan, la
  // MISMA cifra que "Live vs count" del Home y del correo
  // (live-diagnostico.diagnosticar suma lo mismo). neto: la diferencia de
  // todos, la que cuadra con la cascada (antes + entró − vendido).
  // dentro: qué parte quedó dentro de la regla.
  function resumenCiclo(filas) {
    const G = D();
    let neto = 0, corto = 0, sobra = 0, conToast = 0, dentro = 0, lejos = 0;
    for (const f of filas || []) {
      if (!f.in_toast) continue;
      conToast++;
      const dif = num(f.difference), p = num(f.unit_price);
      const dinero = p > 0 ? dif * p : 0;
      neto += dinero;
      if (G.seAleja(dif, num(f.sold))) {
        lejos++;
        if (dif < 0) corto += Math.abs(dinero); else sobra += dinero;
      } else dentro++;
    }
    return { neto: r2(neto), corto: r2(corto), sobra: r2(sobra), dentro: conToast ? Math.round(dentro / conToast * 100) : null, lejos };
  }

  // ── La lista (Counts, opción B) ──────────────────────────────────────
  // filas: las de live_expected de los ciclos que se pasan.
  function armarLista(sesiones, ciclos, filas) {
    const G = D();
    const porCiclo = new Map();
    for (const f of filas || []) {
      if (!porCiclo.has(f.cycle_id)) porCiclo.set(f.cycle_id, []);
      porCiclo.get(f.cycle_id).push(f);
    }
    const ss = semanas(sesiones);
    return ss.map((x, i) => {
      const s = x.sesion, antes = ss[i + 1] && ss[i + 1].sesion;
      const c = cicloDe(s, ciclos);
      const items = num(s.items);
      const live = c && !G.corto(c) && porCiclo.has(c.id) ? resumenCiclo(porCiclo.get(c.id)) : null;
      return {
        semana: x.semana, fecha: s.finished_at, reconteos: x.reconteos,
        activo: num(s.active_ms), items, porProducto: items > 0 ? num(s.active_ms) / items : null,
        vs: vsTiempo(s, antes), primero: !antes, live
      };
    });
  }

  // ── El porqué de un producto ─────────────────────────────────────────
  // tono: 'ro' parece un error al contar · 'a' faltó · 'v' sobró ·
  // 'gx' sólo información. El orden importa: lo que apunta a un error al
  // contar va primero, porque recontar cambia todo lo demás.
  function mensaje(x, ctx) {
    const G = D();
    const corto = x.dif != null && x.dif < 0;
    const lado = corto ? 'short' : 'more';
    const tono = corto ? 'a' : 'v';
    if (x.estado === 'sinContar') {
      return { tono: 'ro', txt: `Not counted this time: it had ${n1(x.tenia)} on ${ctx.fechaPrevia}. A bottle or a shelf skipped?` };
    }
    if (x.esperado != null && x.contado === 0 && x.esperado >= 1 && x.vendido > 0) {
      return { tono: 'ro', txt: `Counted 0, but Toast sold ${n1(x.vendido)} this week and Live expected ${n1(x.esperado)}: probably not all of it was counted` };
    }
    const caja = x.dif != null ? G.CAJAS.find(c => Math.abs(Math.abs(x.dif) - c) <= G.CERCA_CAJA) : null;
    const par = num(x.par);
    if (x.dif != null && x.dif >= SALTO_MIN && x.dif >= SALTO_PAR * Math.max(par, 1) && !caja && x.tenia != null) {
      const entro = num(x.entro);
      return { tono: 'ro', txt: `${n1(x.tenia)} → ${n1(x.contado)} with ${entro > 0 ? 'only ' + n1(entro) : 'nothing'} that came in: something the app doesn't know about came in, or it was counted twice` };
    }
    if (caja && corto && num(x.entro) >= caja) {
      return { tono: 'a', txt: `Exactly ${caja === 6 ? 'half a case' : 'a case'} short, and an order with it came this week: did the delivery come short without the invoice saying so?` };
    }
    if (x.causa) {
      const c = x.causa;
      if (c.causa === 'receta') {
        if (c.semanas >= 3) return { tono, txt: corto
          ? `${ordinal(c.semanas)} week short in a row: very likely a recipe or a pour (about ${c.desvio} % more is really used)`
          : `${ordinal(c.semanas)} week in a row with more: very likely the recipe or pour takes too much (about ${c.desvio} % less is really used)` };
        return { tono, txt: `${ordinal(c.semanas)} week ${lado} by a similar share of what it sold: a recipe or a pour may be off` };
      }
      if (c.causa === 'caja') return { tono: 'v', txt: `Exactly ${c.caja === 6 ? 'half a case' : 'one case'} more: a case that arrived without an order or invoice?` };
      if (c.causa === 'conteo') return { tono, txt: `Undoes last week's ${n1(Math.abs(c.antes))} ${c.antes < 0 ? 'short' : 'more'}: a counting slip, nothing is missing` };
      if (c.causa === 'merma') return { tono: 'a', txt: `It matched the ${c.cuadro} weeks before and now it's short: a bottle that went missing, or one that wasn't counted` };
      return { tono: 'gx', txt: corto
        ? 'First week short: too early to tell (a recipe, a counting slip or a missing bottle look the same in one week)'
        : "First week with more: too early to tell (a recipe that takes too much, a counting slip or a delivery that wasn't logged look the same in one week)" };
    }
    if (x.nuevo) return { tono: 'gx', txt: "New: first time it's counted, nothing to compare yet" };
    return null;
  }

  // ── El reporte de un conteo ──────────────────────────────────────────
  //
  // d = { semana, previa, sesion, sesionPrevia, fotos (inventory_snapshots
  //   de la semana y la de antes), ciclo (el de este conteo o null),
  //   ciclos (del de este conteo hacia atrás), filas (live_expected de
  //   esos ciclos), master }
  function armarReporte(d) {
    const G = D();
    const precio = new Map(), par = new Map();
    for (const r of d.master || []) if (r && r.item) { precio.set(r.item, num(r.value)); par.set(r.item, num(r.suggested)); }
    const foto = (sem) => new Map((d.fotos || []).filter(f => f.week_start === sem && f.item_name).map(f => [f.item_name, f]));
    const ahora = foto(d.semana), antes = d.previa ? foto(d.previa) : new Map();
    const ciclo = d.ciclo && !G.corto(d.ciclo) ? d.ciclo : null;
    const H = ciclo ? G.historia([ciclo].concat((d.ciclos || []).filter(c => c.id !== ciclo.id)), d.filas) : null;
    const fila = new Map();
    if (H) for (const [item, fs] of H.porItem) if (H.orden.get(fs[0].cycle_id) === 0) fila.set(item, fs);
    const fechaPrevia = d.sesionPrevia ? fechaCorta(d.sesionPrevia.finished_at) : 'the count before';

    const nombres = new Set([...ahora.keys(), ...fila.keys()]);
    // Lo que se contó la vez pasada y no esta: sólo se sabe con el ciclo,
    // que guarda una fila por producto CONTADO (live-expected.armar).
    if (H) for (const [item, f] of antes) if (num(f.on_hand_start) > 0.5 && !fila.has(item) && precio.has(item)) nombres.add(item);

    const filas = [];
    for (const item of nombres) {
      const fs = fila.get(item), f = fs && fs[0];
      const a = antes.get(item), w = ahora.get(item);
      const x = { item, par: par.get(item) || 0, nuevo: !a && !!(w && num(w.on_hand_start) > 0) };
      x.tenia = f ? num(f.start_count) : (a ? num(a.on_hand_start) : null);
      if (f) {
        x.entro = num(f.arrived); x.vendido = num(f.sold); x.contado = num(f.counted);
        x.check = f.checked && f.checked.n != null ? f.checked : null;
        if (f.in_toast) {
          x.esperado = num(f.expected); x.dif = r2(num(f.difference));
          const p = num(f.unit_price) > 0 ? num(f.unit_price) : (precio.get(item) || 0);
          x.dinero = p > 0 ? r2(x.dif * p) : null;
          if (G.seAleja(x.dif, x.vendido)) { x.estado = x.dif < 0 ? 'corto' : 'mas'; x.causa = G.causa(x.dif, x.vendido, H.prevDe(fs)); }
          else x.estado = 'even';
        } else { x.esperado = null; x.dif = null; x.dinero = null; x.estado = 'sinLive'; }
      } else if (H && a && num(a.on_hand_start) > 0.5) {
        x.estado = 'sinContar'; x.contado = null; x.entro = null; x.vendido = null; x.esperado = null; x.dif = null; x.dinero = null;
      } else {
        // Sin el ciclo (los conteos de antes del 2026-11-15): lo contado y
        // lo que se contó la vez anterior, sin esperado.
        x.entro = a && a.ordered != null ? num(a.ordered) : null; x.vendido = null; x.esperado = null;
        x.contado = w ? num(w.on_hand_start) : 0; x.dif = null; x.dinero = null; x.estado = 'sinLive';
      }
      x.msg = mensaje(x, { fechaPrevia });
      filas.push(x);
    }
    // Lo que pide mirarse primero, luego lo que más pesa en dinero.
    const peso = (x) => (x.msg && x.msg.tono === 'ro' ? 1e9 : 0) + Math.abs(x.dinero || 0) + (x.dif != null && x.estado !== 'even' ? Math.abs(x.dif) / 1e3 : 0);
    filas.sort((p, q) => peso(q) - peso(p) || p.item.localeCompare(q.item));

    const valor = (m) => { let t = 0; for (const [item, f] of m) t += num(f.on_hand_start) * (precio.get(item) || 0); return r2(t); };
    const botellas = (m) => { let t = 0; for (const f of m.values()) t += num(f.on_hand_start); return r1(t); };
    const ciclar = ciclo ? (d.filas || []).filter(f => f.cycle_id === ciclo.id) : [];
    let cascada = null;
    if (ciclo) {
      cascada = { antes: 0, entro: 0, vendido: 0, esperado: 0, contado: 0 };
      for (const f of ciclar) {
        const p = num(f.unit_price) > 0 ? num(f.unit_price) : (precio.get(f.item_name) || 0);
        if (!(p > 0) || !f.in_toast) continue;
        cascada.antes += num(f.start_count) * p; cascada.entro += num(f.arrived) * p;
        cascada.vendido += num(f.sold) * p; cascada.esperado += num(f.expected) * p; cascada.contado += num(f.counted) * p;
      }
      for (const k in cascada) cascada[k] = r2(cascada[k]);
    }
    const live = ciclo ? resumenCiclo(ciclar.map(f => Object.assign({}, f, { unit_price: num(f.unit_price) > 0 ? f.unit_price : (precio.get(f.item_name) || 0) }))) : null;
    const cortos = filas.filter(x => x.estado === 'corto').sort((p, q) => (p.dinero || 0) - (q.dinero || 0));
    const mas = filas.filter(x => x.estado === 'mas').sort((p, q) => (q.dinero || 0) - (p.dinero || 0));
    const sum = (xs) => r2(xs.reduce((t, x) => t + (x.dinero || 0), 0));

    // Lo que se repite: fuera de la regla, del mismo lado, SEGUIDAS
    // conteos o más, empezando por éste.
    const reincidentes = [];
    if (H) for (const [item, fs] of fila) {
      const f = fs[0];
      if (!f.in_toast) continue;
      const difs = [];
      for (let i = 0; i < fs.length; i++) {
        if (H.orden.get(fs[i].cycle_id) !== i || !fs[i].in_toast) break;
        const dd = num(fs[i].difference);
        if (!G.seAleja(dd, num(fs[i].sold)) || (difs.length && Math.sign(dd) !== Math.sign(difs[0]))) break;
        difs.push(r1(dd));
      }
      if (difs.length >= SEGUIDAS) reincidentes.push({ item, difs: difs.slice().reverse(), lado: difs[0] < 0 ? 'corto' : 'mas' });
    }
    reincidentes.sort((p, q) => q.difs.length - p.difs.length || p.item.localeCompare(q.item));

    const s = d.sesion || {};
    return {
      semana: d.semana, fecha: s.finished_at || null, sinCiclo: !ciclo, cicloCorto: !!(d.ciclo && !ciclo),
      resumen: {
        botellas: botellas(ahora), botellasAntes: d.previa ? botellas(antes) : null,
        valor: valor(ahora), valorAntes: d.previa ? valor(antes) : null,
        productos: num(s.items), activo: num(s.active_ms),
        porProducto: num(s.items) > 0 ? num(s.active_ms) / num(s.items) : null,
        vs: vsTiempo(s, d.sesionPrevia),
        nuevos: filas.filter(x => x.nuevo).length, sinContar: filas.filter(x => x.estado === 'sinContar').length,
        live, cortos: cortos.length, mas: mas.length, revisar: filas.filter(x => x.msg && x.msg.tono === 'ro').length
      },
      cascada, filas,
      revisar: filas.filter(x => x.msg && x.msg.tono === 'ro'),
      cortos, mas, dineroCorto: sum(cortos), dineroMas: sum(mas),
      reincidentes
    };
  }

  // Semana tras semana: Live vs count de cada ciclo, del más viejo al
  // de este conteo, y los tragos que Toast vendió sin receta (del ciclo
  // entero: no se le cuelgan a un producto).
  function armarSemanas(ciclos, filas, hasta) {
    const G = D();
    const lista = (ciclos || []).filter(c => !G.corto(c) && (!hasta || String(c.cycle_end) <= String(hasta.cycle_end)))
      .sort((a, b) => String(b.cycle_end).localeCompare(String(a.cycle_end))).slice(0, SEMANAS).reverse();
    return lista.map(c => {
      const fs = (filas || []).filter(f => f.cycle_id === c.id);
      const sinReceta = (Array.isArray(c.unconverted) ? c.unconverted : [])
        .filter(x => x && /recipe missing/i.test(String(x.motivo || '')))
        .reduce((t, x) => t + num(x.unidades), 0);
      return Object.assign({ id: c.id, fin: c.cycle_end, este: !!(hasta && c.id === hasta.id), sinReceta: Math.round(sinReceta) }, resumenCiclo(fs));
    });
  }

  // ── Leer (sólo lee) ──────────────────────────────────────────────────
  const R = () => window.BarStockRest;
  const loc = () => window.BarStockInventoryCloud && window.BarStockInventoryCloud.fetchLocationId
    ? window.BarStockInventoryCloud.fetchLocationId() : Promise.resolve(null);

  async function leerSesiones() {
    return R().leerTodo('count_sessions?location_name=eq.' + encodeURIComponent(cfg().LOCATION_NAME || '') +
      '&select=id,week_key,started_at,finished_at,active_ms,items&order=finished_at.desc,id.desc');
  }
  async function leerCiclos(l) {
    return R().leerTodo('live_expected_cycles?location_id=eq.' + encodeURIComponent(l) +
      '&select=id,cycle_start,cycle_end,end_day,status,unconverted&order=cycle_end.desc');
  }
  async function leerFilas(ids) {
    if (!ids.length) return [];
    return R().leerTodo('live_expected?cycle_id=in.(' + ids.join(',') + ')' +
      '&select=cycle_id,item_name,start_count,arrived,sold,counted,expected,difference,unit_price,in_toast,checked&order=id.asc');
  }

  // La lista de Counts.
  async function lista() {
    if (!R() || !R().leerTodo) throw new Error('The reader module did not load. Reload the app.');
    const l = await loc();
    const [sesiones, ciclos] = await Promise.all([leerSesiones(), l ? leerCiclos(l) : []]);
    const filas = await leerFilas(ciclos.map(c => c.id));
    return { conteos: armarLista(sesiones, ciclos, filas), sesiones, ciclos, filas };
  }

  // El reporte de un conteo (por su semana). base: lo que devolvió
  // lista(), para no volver a leerlo.
  async function reporte(semana, base) {
    const l = await loc();
    if (!l) throw new Error('No location is open.');
    const b = base || await lista();
    const ss = semanas(b.sesiones);
    const i = ss.findIndex(x => x.semana === semana);
    if (i < 0) throw new Error('That count was not found.');
    const previa = ss[i + 1] || null;
    const semanasLeer = [semana].concat(previa ? [previa.semana] : []);
    const fotos = await R().leerTodo('inventory_snapshots?location_id=eq.' + encodeURIComponent(l) +
      '&week_start=in.(' + semanasLeer.join(',') + ')&select=week_start,item_name,on_hand_start,ordered&order=id.asc');
    const ciclo = cicloDe(ss[i].sesion, b.ciclos);
    const ciclos = ciclo ? b.ciclos.filter(c => String(c.cycle_end) <= String(ciclo.cycle_end)).slice(0, SEMANAS + 1) : [];
    const master = (window.state && Array.isArray(window.state.master)) ? window.state.master : [];
    const rep = armarReporte({ semana, previa: previa && previa.semana, sesion: ss[i].sesion, sesionPrevia: previa && previa.sesion,
      fotos, ciclo, ciclos, filas: b.filas, master });
    rep.semanas = armarSemanas(b.ciclos, b.filas, rep.sinCiclo ? null : ciclo);
    rep.anterior = previa ? previa.semana : null;
    rep.siguiente = i > 0 ? ss[i - 1].semana : null;
    rep.reconteos = ss[i].reconteos;
    return rep;
  }

  window.BarStockCountReport = { semanas, cicloDe, armarLista, armarReporte, armarSemanas, mensaje, lista, reporte, fechaCorta, SEMANAS, SEGUIDAS };
})();
