(() => {
  if (window.BarStockVendorDelivery) return;

  // ── El horario de entrega de cada proveedor ──────────────────────────
  //
  // Cuándo llega el pedido de cada proveedor (vendor_defaults.delivery_day
  // y delivery_time, migración 032). Lo ponen Settings → Delivery y, más
  // adelante, lo leen el envío de un pedido (su fecha de llegada) y el
  // LIVE. Los nombres de los días y el formato de la hora viven aquí para
  // que la lista de Settings y la leyenda de un pedido digan lo mismo.

  const DIAS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Cada media hora, todo el día: "07:00", "07:30"…
  const HORAS = [];
  for (let m = 0; m < 24 * 60; m += 30) {
    HORAS.push(String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));
  }

  // "07:00:00" (como lo devuelve PostgREST) o "07:00" → "7:00 AM".
  function hora(t) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
    if (!m) return '';
    const h = Number(m[1]);
    return ((h % 12) || 12) + ':' + m[2] + (h < 12 ? ' AM' : ' PM');
  }

  // "07:00:00" → "07:00", para comparar con HORAS.
  const corta = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? m[1].padStart(2, '0') + ':' + m[2] : ''; };

  // Una fila de vendor_defaults → "Tue · 7:00 AM", o '' si no tiene día.
  // Sin hora no hay horario: medio horario sería inventar la otra mitad.
  function texto(fila) {
    if (!fila || fila.delivery_day == null || !fila.delivery_time) return '';
    const d = DIAS[Number(fila.delivery_day)];
    return d ? d + ' · ' + hora(fila.delivery_time) : '';
  }

  // ── La fecha de llegada de un pedido ─────────────────────────────────
  //
  // Axel, 2026-11-11: cada pedido pertenece al ciclo en el que LLEGA, y
  // cuenta en el LIVE desde esa hora. La llegada es la siguiente vez que
  // toca el día y la hora de su proveedor DESPUÉS de colocarlo: Breakthru
  // (martes 4 PM) pedido el miércoles llega el martes siguiente; LOOP
  // (martes 7 AM) pedido el domingo, ese martes.
  //
  // Todo en hora de Nueva York, que es la de las locaciones, y no la del
  // teléfono: un pedido hecho de viaje no puede cambiar de día.
  const ZONA = 'America/New_York';
  const _fmt = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
  const SEMANA = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  function partes(t) {
    const o = {};
    for (const x of _fmt.formatToParts(new Date(t))) o[x.type] = x.value;
    return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, dia: SEMANA[o.weekday] };
  }

  // Una hora de reloj en Nueva York → el instante. Dos vueltas bastan para
  // caer bien también los días de cambio de horario.
  function instante(y, mo, d, h, mi) {
    const reloj = Date.UTC(y, mo - 1, d, h, mi);
    let t = reloj;
    for (let i = 0; i < 2; i++) {
      const p = partes(t);
      t = reloj - (Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000);
    }
    return t;
  }

  // La fila de vendor_defaults y el momento en que se colocó → la llegada
  // en ISO, o null si el proveedor no tiene horario. Null no es "ahora":
  // es "no se sabe", y quien la lea lo tiene que tratar así.
  function siguienteEntrega(fila, desde) {
    if (!fila || fila.delivery_day == null || !fila.delivery_time) return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(String(fila.delivery_time));
    if (!m) return null;
    const t0 = new Date(desde == null ? Date.now() : desde).getTime();
    if (isNaN(t0)) return null;
    const dia = Number(fila.delivery_day);
    for (let k = 0; k <= 7; k++) {
      const p = partes(t0 + k * 864e5);
      if (p.dia !== dia) continue;
      const t = instante(p.y, p.mo, p.d, Number(m[1]), Number(m[2]));
      if (t > t0) return new Date(t).toISOString();
    }
    return null;
  }

  // Lo mismo leyendo el horario del proveedor en la nube. Se pide cada vez:
  // es una petición al colocar un pedido, y así un horario recién cambiado
  // en Settings vale ya.
  async function llegadaDe(vendor, desde) {
    const V = window.BarStockVendorDefaults;
    if (!V || !V.getDefaults || !vendor) return null;
    return siguienteEntrega(await V.getDefaults(vendor), desde);
  }

  // "Thu Nov 19 · 4:00 PM", en hora de Nueva York.
  function fecha(iso) {
    if (!iso) return '';
    const p = partes(new Date(iso).getTime());
    const mes = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][p.mo - 1];
    return DIAS[p.dia] + ' ' + mes + ' ' + p.d + ' · ' + hora(String(p.h).padStart(2, '0') + ':' + String(p.mi).padStart(2, '0'));
  }

  window.BarStockVendorDelivery = { DIAS, HORAS, hora, corta, texto, siguienteEntrega, llegadaDe, fecha, ZONA };
})();
