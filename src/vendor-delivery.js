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

  window.BarStockVendorDelivery = { DIAS, HORAS, hora, corta, texto };
})();
