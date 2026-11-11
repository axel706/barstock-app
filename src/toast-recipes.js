(() => {
  if (window.BarStockToastRecipes) return;

  // ── Las recetas de Toast: cada ingrediente con su botella ────────────
  //
  // Las recetas las cargó la migración 029 (toast_recipes y
  // toast_recipe_lines), de las hojas de Axel. Cada línea nace SIN
  // botella: "Triage" es la vodka, la de vainilla y la de naranja, y eso
  // lo decide una persona. Aquí se leen y se guarda la botella elegida.
  //
  // Por cóctel, línea por línea: Axel eligió la opción B de la lámina
  // (2026-11-11), aunque St. Elder salga en cinco recetas. Por eso
  // elegir una botella NO se copia a las otras recetas que usan el mismo
  // ingrediente. Lo que sí se hace es SUGERIRLA: si "St. Elder" ya tiene
  // botella en otra receta, ésa es la sugerida, por delante de la que
  // diría el nombre.

  const cfg = () => window.BARSTOCK_CONFIG || {};
  const H = () => ({ apikey: cfg().SUPABASE_KEY, Authorization: 'Bearer ' + cfg().SUPABASE_KEY });
  const L = () => window.BarStockToastLinks;

  let _d = null;          // { estado, locationId, recetas, productos, error }
  let _cargando = null;
  const _oyentes = new Set();
  const avisar = () => { for (const f of _oyentes) { try { f(); } catch (e) {} } };
  function alCambiar(f) { _oyentes.add(f); return () => _oyentes.delete(f); }

  // PostgREST corta en 1000 filas sin decir nada. Aquí hay 41 recetas;
  // si algún día llegaran a 1000, se para y se dice, en vez de enseñar
  // una lista corta como si fuera la entera.
  const TOPE = 1000;

  async function cargar() {
    if (_cargando) return _cargando;
    _cargando = (async () => {
      _d = { estado: 'cargando' };
      avisar();
      try {
        const locationId = await window.BarStockInventoryCloud.fetchLocationId();
        const r = await fetch(cfg().SUPABASE_URL + '/rest/v1/toast_recipes?location_id=eq.' + locationId +
          '&select=*,toast_recipe_lines(*)&order=toast_name.asc&toast_recipe_lines.order=position.asc', { headers: H() });
        if (!r.ok) {
          _d = { estado: 'error', error: 'Supabase answered ' + r.status + ': ' + (await r.text()).slice(0, 200) };
        } else {
          const filas = await r.json();
          if (filas.length >= TOPE) {
            _d = { estado: 'error', error: 'More than ' + TOPE + ' recipes: the list would be cut short.' };
          } else {
            const productos = L().productosDelInventario();
            const recetas = filas.map(x => ({
              id: x.id, tipo: x.tipo, nombre: x.toast_name, hh: !!x.happy_hour,
              precio: x.price == null ? null : Number(x.price), nota: x.note || '', pendiente: x.pending || '',
              lineas: (x.toast_recipe_lines || []).map(l => ({
                id: l.id, etiqueta: l.label, oz: Number(l.oz), producto: l.item_name || null,
                eleccion: !!l.chosen, soloCon: l.only_with || null, sinCon: l.not_with || []
              }))
            }));
            _d = { estado: 'listo', locationId, recetas, productos };
          }
        }
      } catch (e) {
        _d = { estado: 'error', error: String((e && e.message) || e) };
      }
      _cargando = null;
      avisar();
    })();
    return _cargando;
  }

  const datos = () => _d;
  const recetas = () => (_d && _d.estado === 'listo') ? _d.recetas : [];
  const linea = (id) => { for (const R of recetas()) for (const l of R.lineas) if (l.id === id) return { R, l }; return null; };

  // Las tres pestañas, como las separa la carta: los cócteles, lo de
  // Happy Hour y los modificadores que convierten un licor en trago.
  function grupo(g) {
    return recetas().filter(R => g === 'mods' ? R.tipo === 'modifier'
      : g === 'hh' ? R.tipo === 'cocktail' && R.hh
        : R.tipo === 'cocktail' && !R.hh);
  }

  // Lo que falta: líneas con botella por elegir (el licor del cliente no
  // cuenta, no tiene botella fija) y recetas que no se saben.
  const porElegir = (R) => R.lineas.filter(l => !l.eleccion && !l.producto).length;
  const faltan = (lista) => (lista || recetas()).reduce((n, R) => n + porElegir(R), 0);

  // La sugerida: la botella que ya tiene ese mismo ingrediente en otra
  // receta y, si no, la que diga el nombre.
  function sugerida(id) {
    const x = linea(id);
    if (!x) return null;
    const n = L().norm(x.l.etiqueta);
    for (const R of recetas()) for (const l of R.lineas) {
      if (l.id !== id && l.producto && L().norm(l.etiqueta) === n) return l.producto;
    }
    return L().sugerir(x.l.etiqueta, _d.productos).producto || null;
  }

  // Primero la nube, luego la memoria: al revés, un fallo de red dejaría
  // la pantalla con la botella puesta y la base de datos sin ella.
  async function guardar(id, producto) {
    const x = linea(id);
    if (!x || x.l.eleccion) return false;
    const r = await fetch(cfg().SUPABASE_URL + '/rest/v1/toast_recipe_lines?id=eq.' + id, {
      method: 'PATCH',
      headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, H()),
      body: JSON.stringify({ item_name: producto || null })
    });
    if (!r.ok) throw new Error('Supabase answered ' + r.status + ': ' + (await r.text()).slice(0, 200));
    x.l.producto = producto || null;
    avisar();
    return true;
  }

  const elegir = (id, producto) => producto ? guardar(id, producto) : Promise.resolve(false);
  const quitar = (id) => guardar(id, null);

  // "only with Cosmo", "not with Dark": cuándo cuenta una línea.
  function condicion(l) {
    if (l.soloCon) return 'only with ' + l.soloCon;
    if (l.sinCon && l.sinCon.length) return 'not with ' + l.sinCon.join(' or ');
    return '';
  }

  window.BarStockToastRecipes = {
    cargar, datos, recetas, grupo, porElegir, faltan, sugerida, elegir, quitar, condicion, alCambiar,
    _reset: () => { _d = null; _cargando = null; }
  };
})();
