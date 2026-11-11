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

  // ── Las medidas de la casa ───────────────────────────────────────────
  //
  // Las que escribió Axel en la hoja de recetas (2026-11-11, página 6,
  // "House pours"): Single 1.5, Double 2.5, Rocks 3, Up 3, Shot 1.5. En
  // Toast el grupo se llama "UP/RX" o "Up/Rx", que es Up o Rocks: 3. Y los
  // grupos "2oz" / "3oz" dicen su medida en el nombre.
  //
  // Una medida que no está aquí no se adivina: devuelve undefined y el
  // motor no guarda esa fila (vacío sería "una botella entera").
  const MEDIDAS = { single: 1.5, double: 2.5, 'up/rx': 3, up: 3, rx: 3, rocks: 3, shot: 1.5 };

  function ozDe(medida) {
    if (medida == null) return undefined;
    const m = String(medida).toLowerCase().replace(/\s+/g, '');
    if (Object.prototype.hasOwnProperty.call(MEDIDAS, m)) return MEDIDAS[m];
    const n = /^(\d+(?:\.\d+)?)oz$/.exec(m);
    return n ? Number(n[1]) : undefined;
  }

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
      const revisar = M.filas.filter(f => f.estado === 'review');
      const confirmada = M.filas.find(f => f.estado === 'confirmed');
      // Por revisar si queda CUALQUIER medida sin decidir: una medida
      // nueva en Toast (un Double que no existía) vuelve a traer la marca,
      // con la botella que ya tenía.
      const estado = revisar.length ? 'review' : (confirmada ? 'confirmed' : 'ignored');
      const producto = confirmada ? confirmada.producto : (revisar[0] && revisar[0].producto) || null;
      // Segura sólo si todas sus medidas por revisar lo son.
      const nivel = !revisar.length ? null
        : revisar.every(f => f.nivel === 'high' && f.producto === producto) ? 'high'
          : revisar.some(f => f.producto) ? 'mid' : 'none';
      const medidas = M.filas
        .map(f => ({ guid: f.guid, medida: f.medida, oz: ozDe(f.medida), estado: f.estado }))
        .sort((a, b) => (a.oz === undefined) - (b.oz === undefined) || (a.oz || 0) - (b.oz || 0));
      return Object.assign(M, { estado, producto, nivel, medidas });
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
    cargar: E.cargar, datos: E.datos, alCambiar: E.alCambiar,
    marcas, porTipo, confirmarMarca, ignorarMarca, deshacerMarca, confirmarSugeridas,
    ozDe, medidaTexto, MEDIDAS, DIAS: E.DIAS,
    _reset: E._reset
  };
})();
