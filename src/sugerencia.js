(() => {
  if (window.BarStockSugerencia) return;

  // ── Cuánto sugiere la app pedir en una orden (fase 4) ────────────────
  //
  // Axel, 2026-11-18, sobre lámina (opción C): en cada línea de una orden
  // de Orders › Open, "Suggested N" con su cuenta y "Use N"; y al final,
  // lo que está en su par (no sale en la orden) pero no llega a la
  // siguiente entrega, con "Add N". El plan: docs/plan-pedido.md.
  //
  // La cuenta es pedido.cuantoPedir: lo que se va a usar desde que llega
  // ESTE pedido hasta que llega el siguiente del mismo proveedor (Settings
  // › Delivery) + el colchón del 80 % − lo que quedará cuando llegue.
  //   · La demanda es la de la fila de run-out (pedido.demanda: lo MAYOR
  //     de Pour·IQ y lo reciente de Toast, con la forma de la semana).
  //     Lo que Toast no vende va con Pour·IQ solo, repartido por igual.
  //   · Lo que hay es el número de Inventory (live-cache.cuanto: el LIVE,
  //     o lo contado) y lo que ya viene, el `viene` de esa misma fila.
  //   · Sin horario de entrega del proveedor (Triage, UNKNOWN) no hay
  //     sugerencia: sin "hasta cuándo" no hay cuánto.
  //
  // No se guarda nada ni toca el par: sólo enseña. La cantidad de la
  // orden la cambia quien toque "Use" o "Add" (updateFinalOrder, como
  // cualquier cantidad puesta a mano).

  const P = () => window.BarStockPedido;
  const LC = () => window.BarStockLiveCache;
  const VD = () => window.BarStockVendorDelivery;

  // El horario de cada proveedor, leído una vez por pantalla.
  const _horario = new Map();

  // Lo que hay que tener leído antes de sugerir: el LIVE (con su demanda)
  // y el horario del proveedor. Se puede llamar en cada pintado: lo ya
  // leído no se vuelve a pedir.
  async function preparar(vendor) {
    const esperas = [];
    const lc = LC();
    if (lc && lc.cargar) { const x = lc.cargar(); if (x && x.then) esperas.push(x.catch(() => {})); }
    const V = window.BarStockVendorDefaults;
    if (vendor && !_horario.has(vendor) && V && V.getDefaults) {
      _horario.set(vendor, undefined);
      esperas.push(V.getDefaults(vendor).then(f => _horario.set(vendor, f || null)).catch(() => _horario.set(vendor, null)));
    }
    await Promise.all(esperas);
  }
  // Un horario que cambia en Settings › Delivery vale al volver a abrir.
  const olvidar = () => _horario.clear();

  function demandaDe(r, fila) {
    if (fila && fila.dem && fila.dem.porDia) return fila.dem;
    const pa = window.parAdjustments;
    const a = pa && pa.get ? pa.get(r.item + '||' + (r.code || '')) : null;
    if (!a || a.status !== 'active' || !P()) return null;
    const d = P().demanda({ pouriq: { avg: a.avgUsed, sd: a.stdDev, semanas: a.normalWeeks }, toast: null, hoy: P().diaDe(Date.now()) });
    return d && d.semanal > 0 ? d : null;
  }

  const uno = (n) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '');
  function cuando(ms) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' })
      .formatToParts(new Date(ms));
    const v = (t) => (f.find(x => x.type === t) || {}).value || '';
    return { dia: v('weekday'), hora: (v('hour') + ':' + v('minute')).replace(':00', '') + ' ' + v('dayPeriod') };
  }

  // → { pedir, uso, colchon, queda, llegada, siguiente, texto } o null.
  function para(r, ahora) {
    const p = P(), vd = VD(), lc = LC();
    if (!p || !vd || !r || !r.vendor) return null;
    const horario = _horario.get(r.vendor);
    if (!horario) return null;
    const t = ahora == null ? Date.now() : ahora;
    const a = vd.siguienteEntrega(horario, t);
    const b = a ? vd.siguienteEntrega(horario, Date.parse(a) + 60000) : null;
    if (!a || !b) return null;
    const fila = lc && lc.fila ? lc.fila(r) : null;
    const dem = demandaDe(r, fila);
    if (!dem) return null;
    const stock = lc && lc.cuanto ? lc.cuanto(r) : Number(r.onHand) || 0;
    const viene = ((fila && fila.viene) || []).map(v => ({ cuando: Date.parse(v.cuando), n: Number(v.n) || 0 }));
    const c = p.cuantoPedir(Object.assign({ dem, stock, viene, ahora: t, llegada: Date.parse(a), siguiente: Date.parse(b) },
      p.redondeoPara({ vendor: r.vendor, vino: !!(fila && fila.vino) })));
    const sig = cuando(Date.parse(b)), lleg = cuando(Date.parse(a));
    const texto = 'to last until next ' + sig.dia + ' ' + sig.hora + ': uses ' + uno(c.uso) +
      ' + cushion ' + uno(c.colchon) + ', ' + uno(c.queda) + ' left ' + lleg.dia;
    return { pedir: c.pedir, uso: c.uso, colchon: c.colchon, queda: c.queda, llegada: a, siguiente: b, multiplo: c.multiplo, texto };
  }

  window.BarStockSugerencia = { preparar, olvidar, para };
})();
