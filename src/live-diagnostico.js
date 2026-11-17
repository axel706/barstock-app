(() => {
  if (window.BarStockLiveDiag) return;

  // ── Live vs count: qué pudo pasar ────────────────────────────────────
  //
  // Axel, 2026-11-17: "asegúrate de no sólo poner el dato ahí sino que
  // empiece a sugerir qué estuvo mal, qué artículos, si es receta, tuvo
  // más o menos de lo esperado". Sobre la lámina del correo del lunes.
  //
  // Lee el esperado guardado al cerrar cada conteo (live_expected,
  // migraciones 040 y 044) y, producto por producto, dice qué PODRÍA ser
  // con las reglas de docs/plan-esperado.md (sección 4). Las frases salen
  // de plantillas que eligen los números: nunca dicen algo que los datos
  // no digan. Lo que no se guarda no se afirma: el ciclo no guarda de qué
  // tragos salió cada botella, así que no se dice "va casi todo en
  // cócteles"; y lo que Toast vendió sin receta se dice del ciclo entero,
  // no se le cuelga a un producto.
  //
  // Sin ventana ni DOM: lo usa la app y lo corre el servidor
  // (lib/morning-cron.js). Sólo lee.

  // Qué sale: más de UMBRAL botellas Y más de PARTE de lo vendido. Medio
  // litro de algo que vende 40 no es nada; en algo que vende 2, mucho. La
  // MISMA regla que Finish count (live-expected.comparar la toma de aquí).
  const UMBRAL = 1, PARTE = 0.25;
  const seAleja = (dif, vendido) => Math.abs(dif) > UMBRAL && Math.abs(dif) > PARTE * (Number(vendido) || 0);

  const CAJAS = [6, 12];        // lo que suele traer una caja
  const CERCA_CAJA = 0.25;      // "justo una caja", con el redondeo de contar medias
  const DESHACE = 0.35;         // una semana deshace la anterior si se anulan casi del todo
  const PARECIDA = 0.5;         // dos semanas con la misma proporción, ±50 %
  const SEMANAS = 8;            // cuánta historia se mira
  const MAX = 6;                // cuántos productos se cuentan uno a uno

  const r1 = (n) => Math.round(n * 10) / 10;
  const r2 = (n) => Math.round(n * 100) / 100;
  const sumarDias = (d, k) => new Date(new Date(d + 'T12:00:00Z').getTime() + k * 864e5).toISOString().slice(0, 10);

  // ── Leer ─────────────────────────────────────────────────────────────
  // El último ciclo cerrado desde `desdeDia` (el lunes de la semana
  // pasada) y los de antes, para la historia. Sólo lee.
  async function leer(loc, desdeDia) {
    const R = window.BarStockRest;
    const desde = sumarDias(desdeDia, -7 * SEMANAS);
    const ciclos = await R.leerTodo('live_expected_cycles?location_id=eq.' + encodeURIComponent(loc) +
      '&end_day=gte.' + desde + '&select=id,cycle_end,end_day,status,unconverted&order=cycle_end.desc');
    if (!ciclos.length || ciclos[0].end_day < desdeDia) return { ciclos: [], filas: [] };
    const filas = await R.leerTodo('live_expected?cycle_id=in.(' + ciclos.map(c => c.id).join(',') + ')' +
      '&select=cycle_id,item_name,sold,counted,expected,difference,unit_price,in_toast&order=id.asc');
    return { ciclos, filas };
  }

  // ── Qué pudo ser, sin red ────────────────────────────────────────────
  //
  // ciclos: del más nuevo al más viejo (el primero es el que se cuenta).
  // filas:  las de todos esos ciclos. proveedor(item) → nombre o ''.
  function diagnosticar({ ciclos, filas, proveedor }) {
    if (!ciclos || !ciclos.length) return { hay: false };
    const ult = ciclos[0];
    const orden = new Map(ciclos.map((c, i) => [c.id, i]));
    const porItem = new Map();
    for (const f of filas || []) {
      if (!orden.has(f.cycle_id)) continue;
      if (!porItem.has(f.item_name)) porItem.set(f.item_name, []);
      porItem.get(f.item_name).push(f);
    }
    const lista = [];
    for (const [item, fs] of porItem) {
      fs.sort((a, b) => orden.get(a.cycle_id) - orden.get(b.cycle_id));
      const f = fs[0];
      if (orden.get(f.cycle_id) !== 0 || !f.in_toast) continue;
      const dif = Number(f.difference) || 0, vendido = Number(f.sold) || 0;
      if (!seAleja(dif, vendido)) continue;
      // La historia: las semanas de antes, seguidas, con Toast.
      const prev = [];
      for (let i = 1; i < fs.length; i++) {
        if (orden.get(fs[i].cycle_id) !== i || !fs[i].in_toast) break;
        prev.push({ dif: Number(fs[i].difference) || 0, vendido: Number(fs[i].sold) || 0 });
      }
      const precio = Number(f.unit_price) > 0 ? Number(f.unit_price) : null;
      lista.push(Object.assign({
        item, esperado: r1(Number(f.expected) || 0), contado: r2(Number(f.counted) || 0), dif: r2(dif),
        vendido: r1(vendido), parte: vendido > 0 ? Math.round(Math.abs(dif) / vendido * 100) : null,
        dinero: precio ? r2(dif * precio) : null, proveedor: (proveedor && proveedor(item)) || ''
      }, causa(dif, vendido, prev)));
    }
    lista.sort((a, b) => Math.abs(b.dinero || 0) - Math.abs(a.dinero || 0) || Math.abs(b.dif) - Math.abs(a.dif));
    const sum = (xs) => r2(xs.reduce((t, x) => t + Math.abs(x.dinero || 0), 0));
    return {
      hay: true, fin: ult.end_day, provisional: ult.status !== 'final',
      lista: lista.slice(0, MAX), mas: Math.max(0, lista.length - MAX), total: lista.length,
      corto: sum(lista.filter(x => x.dif < 0)), sobra: sum(lista.filter(x => x.dif > 0)),
      sinConvertir: (Array.isArray(ult.unconverted) ? ult.unconverted : [])
        .filter(x => x && x.nombre && /recipe missing/i.test(String(x.motivo || '')))
        .slice(0, 4).map(x => ({ nombre: String(x.nombre), unidades: Math.round(Number(x.unidades) || 0) }))
    };
  }

  // La causa más probable, en el orden de la tabla de docs/plan-esperado.md.
  function causa(dif, vendido, prev) {
    const signo = Math.sign(dif);
    // Sobra justo una caja: llegó algo sin orden ni factura.
    const caja = dif > 0 ? CAJAS.find(c => Math.abs(dif - c) <= CERCA_CAJA) : null;
    if (caja) return { causa: 'caja', caja };
    // Esta semana deshace la anterior: un error al contar.
    const p0 = prev[0];
    if (p0 && Math.sign(p0.dif) === -signo && Math.abs(p0.dif) > UMBRAL &&
        Math.abs(dif + p0.dif) <= DESHACE * Math.max(Math.abs(dif), Math.abs(p0.dif))) {
      return { causa: 'conteo', antes: r2(p0.dif) };
    }
    // La misma proporción de lo vendido, semana tras semana: receta o pour.
    if (vendido > 0) {
      const r = dif / vendido;
      let semanas = 1, suma = r;
      for (const p of prev) {
        if (!(p.vendido > 0) || !seAleja(p.dif, p.vendido)) break;
        const rp = p.dif / p.vendido;
        if (Math.sign(rp) !== signo || Math.abs(rp - r) > PARECIDA * Math.abs(r)) break;
        semanas++; suma += rp;
      }
      // Cuánto más (o menos) se usó de lo que dicen recetas y pours: lo
      // vendido es lo que ellas restan; lo usado de verdad, eso menos la
      // diferencia.
      if (semanas >= 2) return { causa: 'receta', semanas, desvio: Math.round(Math.abs(suma / semanas) * 100) };
    }
    // Cuadraba y de pronto falta: merma.
    if (dif < 0 && prev.length >= 3 && prev.slice(0, 3).every(p => !seAleja(p.dif, p.vendido))) {
      return { causa: 'merma', cuadro: prev.slice(0, 3).length };
    }
    return { causa: 'pronto' };
  }

  // ── Todo junto, para el correo del lunes ─────────────────────────────
  async function semana(desdeDia) {
    const loc = await window.BarStockInventoryCloud.fetchLocationId();
    if (!loc) return { error: 'No location is open.' };
    const { ciclos, filas } = await leer(loc, desdeDia);
    const master = (window.state && window.state.master) || [];
    const prov = new Map(master.filter(r => r && r.item).map(r => [r.item, String(r.vendor || '').trim()]));
    return diagnosticar({ ciclos, filas, proveedor: (i) => prov.get(i) || '' });
  }

  window.BarStockLiveDiag = { UMBRAL, PARTE, seAleja, leer, diagnosticar, causa, semana, MAX };
})();
