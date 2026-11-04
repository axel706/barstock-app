// ── Qué valores toma cada campo de una lista ─────────────────────────
//
// Tres filas de ejemplo no dicen qué valores puede tomar un campo, y
// justo eso es lo que hay que saber antes de construir encima de una
// API: si `voided` viene alguna vez en true, si `quantity` es siempre
// entera, si una línea de venta es una botella o un trago.
//
// Para cada campo escalar con pocos valores distintos se devuelve la
// lista con su frecuencia. Si tiene muchos, es texto libre y sólo se
// dice cuántos hay.
//
// Vive en lib/ y no en api/ porque lib/ no cuenta para el tope de
// funciones de Vercel. `api/marginedge.js` lleva su propia copia de esto
// desde antes; moverla aquí es tocar algo que hoy funciona, y se hace
// aparte.

function resumir(lista, maxDistintos) {
  const max = maxDistintos || 40;
  const conteo = {};

  for (const fila of lista || []) {
    if (!fila || typeof fila !== 'object') continue;
    for (const [k, v] of Object.entries(fila)) {
      if (v !== null && typeof v === 'object') continue;  // arrays y objetos, fuera
      const clave = v === null ? '(null)' : String(v);
      (conteo[k] = conteo[k] || {});
      conteo[k][clave] = (conteo[k][clave] || 0) + 1;
    }
  }

  const out = {};
  for (const [campo, valores] of Object.entries(conteo)) {
    const distintos = Object.keys(valores).length;
    out[campo] = distintos > max
      ? distintos + ' valores distintos (texto libre)'
      : Object.fromEntries(Object.entries(valores).sort((a, b) => b[1] - a[1]));
  }
  return out;
}

module.exports = { resumir };
