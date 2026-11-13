(() => {
  if (window.BarStockToastLiquor) return;

  // ── El licor de Toast, emparejado con el inventario ──────────────────
  //
  // Para el "deberías tener" en vivo, cada licor que Toast vende solo
  // tiene que apuntar a su botella. En Toast el licor solo es la MARCA y
  // la medida la dice el grupo del menú (lib/toast.js, licoresDelMenu):
  // "Grey Goose" Single y "Grey Goose" UP/RX son dos artículos, con la
  // misma botella y distinta medida.
  //
  // Por eso la pantalla (mobile-toast-liquor.js, opción C) trabaja por
  // MARCA: se elige la botella una vez y se guardan todos sus artículos,
  // cada uno con su medida. El motor es el del vino (toast-links.js).
  //
  // Los cócteles y lo de Happy Hour no pasan por aquí: van por receta.

  // ── Las medidas ──────────────────────────────────────────────────────
  //
  // Eran una tabla fija aquí, igual para todos los restaurantes. Desde el
  // 2026-11-13 cada locación pone las suyas (Settings › Toast › Pours):
  // viven en toast-pours.js, con las de siempre por defecto. Una medida
  // sin onzas no se adivina: devuelve undefined y el motor no guarda esa
  // fila (vacío sería "una botella entera").
  const P = () => window.BarStockToastPours;
  const ozDe = (medida) => P().ozDe(medida);

  const L = () => window.BarStockToastLinks;
  const E = L().crear({
    kind: 'liquor',
    accion: 'liquor',
    pour: (f) => ozDe(f.medida),
    // Se sugiere por la marca: "3oz Maker's Mark" y "Maker's Mark" son la
    // misma botella.
    nombre: (a) => a.marca || a.nombre
  });

  // ── Las marcas ───────────────────────────────────────────────────────
  //
  // Una por tipo y marca. Lleva sus artículos (uno por medida) y lo que se
  // enseña en la fila: la botella elegida o la sugerida, si queda algo
  // por revisar, y lo vendido en la semana.
  const clave = (f) => (f.tipo || '') + '|' + L().norm(f.marca || f.nombre);

  function marcas() {
    const d = E.datos();
    if (!d || d.estado !== 'listo') return [];
    const por = new Map();
    for (const f of d.filas) {
      const k = clave(f);
      if (!por.has(k)) por.set(k, { clave: k, tipo: f.tipo || 'Other', marca: f.marca || f.nombre, filas: [], vendido: 0 });
      const M = por.get(k);
      M.filas.push(f);
      M.vendido += f.vendido || 0;
    }
    return [...por.values()].map(M => {
      // Lo que queda por decidir, separado en lo que SE PUEDE decidir (su
      // medida tiene pour) y lo que no.
      const pendientes = M.filas.filter(f => f.estado === 'review');
      const revisar = pendientes.filter(f => ozDe(f.medida) !== undefined);
      const sinPour = pendientes.filter(f => ozDe(f.medida) === undefined).map(f => f.medida || 'No size');
      const confirmada = M.filas.find(f => f.estado === 'confirmed');
      // Por revisar si queda una medida sin decidir que SÍ se puede guardar:
      // una medida nueva en Toast (un Double que no existía) vuelve a traer
      // la marca, con la botella que ya tenía.
      //
      // Una medida sin pour no la retiene. Retenía: casi todas las marcas
      // tienen en Toast una medida "Mix" que no estaba en la hoja, sus
      // otras medidas se guardaban, y la marca seguía "por revisar" con
      // la botella correcta puesta. Axel: "le doy Confirm 10 y no pasa
      // nada, ahí siguen" (2026-11-11). Ahora pasa a hechas y lleva la
      // lista de lo que no cuenta (`sinPour`). Si NO tiene ninguna medida
      // con pour, no hay nada que elegir: 'sinPour', aparte.
      const estado = revisar.length ? 'review'
        : confirmada ? 'confirmed'
          : M.filas.some(f => f.estado === 'ignored') ? 'ignored'
            : 'sinPour';
      const producto = confirmada ? confirmada.producto : (revisar[0] && revisar[0].producto) || null;
      // Segura sólo si todas sus medidas por revisar lo son.
      const nivel = !revisar.length ? null
        : revisar.every(f => f.nivel === 'high' && f.producto === producto) ? 'high'
          : revisar.some(f => f.producto) ? 'mid' : 'none';
      const medidas = M.filas
        .map(f => ({ guid: f.guid, medida: f.medida, oz: ozDe(f.medida), estado: f.estado }))
        .sort((a, b) => (a.oz === undefined) - (b.oz === undefined) || (a.oz || 0) - (b.oz || 0));
      return Object.assign(M, { estado, producto, nivel, medidas, sinPour });
    }).sort((a, b) => (b.vendido - a.vendido) || L().norm(a.marca).localeCompare(L().norm(b.marca)));
  }

  // Por tipo, en el orden de lo más vendido de cada uno.
  function porTipo(lista) {
    const t = new Map();
    for (const M of lista) {
      if (!t.has(M.tipo)) t.set(M.tipo, { tipo: M.tipo, marcas: [], vendido: 0 });
      const T = t.get(M.tipo);
      T.marcas.push(M);
      T.vendido += M.vendido;
    }
    return [...t.values()].sort((a, b) => (b.vendido - a.vendido) || a.tipo.localeCompare(b.tipo));
  }

  const marca = (k) => marcas().find(M => M.clave === k);

  // Guarda la botella para TODAS las medidas de la marca. Las que no
  // tienen medida conocida no se guardan y se devuelven, para decirlo.
  async function confirmarMarca(k, producto) {
    const M = marca(k);
    if (!M || !producto) return { hechas: 0, sinMedida: [] };
    let hechas = 0;
    const sinMedida = [];
    for (const f of M.filas) {
      if (f.estado === 'confirmed' && f.producto === producto) { hechas++; continue; }
      if (ozDe(f.medida) === undefined) { sinMedida.push(f.medida || f.grupo); continue; }
      if (await E.confirmar(f.guid, producto)) hechas++;
    }
    return { hechas, sinMedida };
  }

  async function ignorarMarca(k) {
    const M = marca(k);
    if (!M) return 0;
    let n = 0;
    for (const f of M.filas) if (f.estado !== 'ignored' && await E.ignorar(f.guid)) n++;
    return n;
  }

  async function deshacerMarca(k) {
    const M = marca(k);
    if (!M) return 0;
    let n = 0;
    for (const f of M.filas) if (f.estado !== 'review' && await E.deshacer(f.guid)) n++;
    return n;
  }

  // Las seguras de un tipo, de una vez. Las dudosas las mira una persona.
  async function confirmarSugeridas(tipo) {
    const claras = marcas().filter(M => M.estado === 'review' && M.nivel === 'high' && M.producto && (!tipo || M.tipo === tipo));
    let n = 0;
    for (const M of claras) { if ((await confirmarMarca(M.clave, M.producto)).hechas) n++; }
    return n;
  }

  // "Single 1.5 oz": la medida y su cuenta, igual en todas las filas.
  const medidaTexto = (m) => (m.medida || 'No size') + ' · ' + (m.oz === undefined ? '? oz' : m.oz + ' oz');

  window.BarStockToastLiquor = {
    // Las medidas de la locación, antes que las marcas: sin ellas, cada
    // marca saldría "sin pour" hasta que llegaran.
    cargar: (...a) => P().cargar().catch(() => null).then(() => E.cargar(...a)), datos: E.datos, alCambiar: E.alCambiar,
    marcas, porTipo, confirmarMarca, ignorarMarca, deshacerMarca, confirmarSugeridas,
    ozDe, medidaTexto, DIAS: E.DIAS,
    _reset: E._reset
  };
})();
