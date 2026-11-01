(() => {
  if (window.BarStockCycleOpen) return;

  // ── Abrir un ciclo es UN proceso, no tres copias ─────────────────────
  //
  // Un ciclo se puede abrir por tres caminos distintos:
  //
  //   1 · el botón "Start new cycle", que resetea el on hand
  //   2 · cargar el conteo desde un archivo (CSV / backup)
  //   3 · cerrar un conteo hecho con el teléfono
  //
  // Los tres tienen que dejar la app en el mismo punto de partida, y sin
  // embargo cada uno hacía su propia versión de la limpieza. El tercero
  // se añadió después que los otros dos y no heredó un paso: borrar la
  // bandera del panel lateral de órdenes.
  //
  // Lo que costó eso: cuentas con el teléfono el domingo, el lunes abres
  // la laptop para pedir, y el panel sigue enseñando la orden de la
  // semana pasada —"Order placed · 44 items · $2,397.57"— mientras la
  // tabla de al lado te pide producto. Sin salida limpia, además: el
  // único botón a mano era "reabrir", que carga esa orden vieja sobre la
  // actual.
  //
  // Así que la limpieza vive aquí, en un sitio, y los tres caminos la
  // llaman. El día que aparezca un cuarto camino —un import por API, lo
  // que sea— hereda la rutina completa por no tener alternativa.
  //
  // ── Esto NO sustituye a la comprobación del panel ────────────────────
  //
  // `placedOrderThisCycle()` en index.html verifica que la orden marcada
  // caiga dentro del ciclo abierto, y sigue haciendo falta. No es
  // redundante: `sessionStorage` es de UN navegador, así que contar en el
  // teléfono no puede limpiar la bandera de la laptop. Nunca podrá.
  //
  //   limpiar   → arregla el dispositivo donde abriste el ciclo
  //   verificar → arregla todos los demás
  //
  // Las dos cubren mitades distintas del mismo problema.

  // Borra las banderas "orden colocada" del panel lateral de órdenes.
  // Una por proveedor, en el sessionStorage de este navegador.
  function limpiarPanelOrdenes() {
    try {
      Object.keys(sessionStorage)
        .filter(k => k.startsWith('vsp_placed_'))
        .forEach(k => sessionStorage.removeItem(k));
    } catch (e) {
      // sessionStorage puede lanzar en modo privado o con las cookies
      // bloqueadas. Abrir el ciclo es lo importante; esto es cosmético.
      console.warn('[ciclo] no se pudo limpiar el panel de ordenes', e);
    }
  }

  // Todo lo que hay que dejar en cero al abrir un ciclo.
  //
  // `opts.resetLocal` en false para el camino del teléfono: ahí
  // `state.placedOrders` se reconstruye desde el historial contra la
  // frontera nueva (rebuildPlacedOrdersFromHistory), y vaciarlo a mano
  // antes sería trabajo tirado.
  function prepare(opts) {
    const o = opts || {};
    limpiarPanelOrdenes();

    if (o.resetLocal !== false && window.state) {
      window.state.placedOrders = [];
    }

    // La frontera del ciclo acaba de moverse. Sin invalidar, el resto de
    // la app —Order History, las mini-cards, el panel lateral— sigue
    // preguntando por la anterior hasta la siguiente recarga de página.
    if (window.BarStockCycle && typeof window.BarStockCycle.invalidate === 'function') {
      window.BarStockCycle.invalidate();
    }
  }

  // ── Dejar constancia de que se abrió un ciclo ──────────────────────
  //
  // `locations.weekly_reset_at` sólo recuerda el ciclo ABIERTO. En
  // cuanto se abre otro, el anterior deja de existir para la app, y
  // con él la posibilidad de decir "estas facturas son de la semana
  // del 19 al 26".
  //
  // Va aquí dentro de `settle()` y no en `prepare()` a propósito:
  // prepare corre ANTES de escribir, así que ahí la marca de tiempo
  // habría que inventarla —`Date.now()`, un segundo antes de la que de
  // verdad se guarda—. Y una frontera aproximada es exactamente cómo
  // una factura acaba del lado equivocado: ya pasó hoy con la fecha
  // UTC contra la local.
  //
  // Se lee la que YA está escrita, que es la que usa todo lo demás.
  //
  // Si falla, no se dice nada al usuario y el ciclo sigue su curso:
  // esto es historial para una pantalla, no parte de abrir la semana.
  // Pero se avisa por consola, porque un hueco silencioso en un
  // historial no se nota hasta que haces falta.
  async function registrar(origen) {
    const c = window.BARSTOCK_CONFIG || {};
    if (!c.SUPABASE_URL || !c.SUPABASE_KEY || !c.LOCATION_NAME) return;

    let iso = null;
    try {
      const d = window.BarStockCycle && window.BarStockCycle.startedAt
        ? window.BarStockCycle.startedAt() : null;
      iso = d ? new Date(d).toISOString() : null;
    } catch (e) {}
    if (!iso) return;

    try {
      const res = await fetch(`${c.SUPABASE_URL}/rest/v1/cycle_periods`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: c.SUPABASE_KEY, Authorization: `Bearer ${c.SUPABASE_KEY}`,
          // Dos dispositivos pueden cerrar el mismo ciclo a la vez. La
          // tabla tiene una única por (locacion, inicio), asi que el
          // segundo choca; se ignora en vez de romper.
          Prefer: 'return=minimal,resolution=ignore-duplicates'
        },
        body: JSON.stringify({
          location_name: c.LOCATION_NAME,
          started_at: iso,
          origen: origen || null
        })
      });
      if (!res.ok) {
        const t = await res.text();
        if (/cycle_periods/.test(t) && /does not exist|relation/.test(t)) {
          console.warn(
            '[ciclo] falta la tabla cycle_periods. Corre la migracion 021:\n' +
            '  database/migrations/021_cycle_periods.sql');
        } else {
          console.warn('[ciclo] no se pudo registrar la apertura', t);
        }
      }
    } catch (e) {
      console.warn('[ciclo] no se pudo registrar la apertura', e);
    }
  }

  // Después de escribir en la nube: releer la frontera, dejar
  // constancia y repintar el botón. Separado de prepare() porque
  // prepare() corre ANTES de tocar nada y esto DESPUÉS, cuando
  // `weekly_reset_at` ya cambió.
  //
  // `origen` dice por cuál de los tres caminos se abrió. No cambia
  // nada de lo que se enseña; sirve para entender un ciclo raro sin
  // adivinar.
  async function settle(origen) {
    try {
      if (window.BarStockCycle) await window.BarStockCycle.load();
    } catch (e) {
      console.warn('[ciclo] no se pudo releer la frontera', e);
    }
    // Después de releer: la frontera que se registra es la de verdad.
    await registrar(origen);
    window.BarStockWeeklyCycle?.refresh?.();
  }

  window.BarStockCycleOpen = { prepare, settle, registrar, limpiarPanelOrdenes };
})();
