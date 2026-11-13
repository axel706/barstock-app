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
            // `nombre` es como lo vende Toast (la llave con la que casa el
            // cálculo de botellas); `titulo`, como se enseña: el nombre que
            // le diste al escribirla, si al emparejarla con Toast cambió.
            // `tambien`: otros nombres de Toast con la misma receta
            // ("Same as…").
            const recetas = filas.map(x => ({
              id: x.id, tipo: x.tipo, nombre: x.toast_name, titulo: x.name || x.toast_name,
              tambien: Array.isArray(x.also) ? x.also : [], hh: !!x.happy_hour,
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

  // ── Escribir, editar y casar con Toast ─────────────────────────────
  //
  // Axel, 2026-11-12, opción A sobre lámina: escribir una receta de cero,
  // cambiarla (ingredientes, onzas, Happy Hour, el licor del cliente),
  // borrarla, y casar con Toast lo que no case por nombre. Siempre primero
  // la nube y luego la pantalla (se vuelve a leer todo): un fallo deja la
  // pantalla como estaba y se dice con lo que contestó Supabase.
  async function pedir(ruta, op) {
    const r = await fetch(cfg().SUPABASE_URL + '/rest/v1/' + ruta, Object.assign({}, op, {
      headers: Object.assign({ 'Content-Type': 'application/json' }, (op && op.headers) || {}, H()) }));
    const t = await r.text();
    if (!r.ok) {
      // Un nombre repetido es lo único que se traduce: lo demás, tal cual.
      if (r.status === 409 && /23505|duplicate/.test(t)) {
        const e = new Error('duplicado'); e.duplicado = true; throw e;
      }
      throw new Error('Supabase answered ' + r.status + ': ' + t.slice(0, 200));
    }
    try { return t ? JSON.parse(t) : null; } catch (e) { return null; }
  }
  const locacion = () => (_d && _d.locationId) || window.BarStockInventoryCloud.fetchLocationId();
  const ELECCION = "Customer's choice";

  // Una línea NUEVA necesita su botella (en el editor se añade eligiéndola).
  // Una que ya estaba puede seguir sin ella: es "Choose a bottle", lo que
  // falta por elegir de las recetas cargadas, y no puede impedir editar
  // el resto de la receta.
  function validar(lineas) {
    for (const l of lineas || []) {
      const oz = Number(l.oz);
      if (!(oz > 0)) throw new Error('Every ingredient needs its ounces (more than 0 oz).');
      if (l.id == null && !l.eleccion && !l.producto) throw new Error('Every new ingredient needs its bottle.');
    }
  }
  const filaDe = (l, recipeId, pos) => ({
    recipe_id: recipeId, position: pos, label: l.eleccion ? ELECCION : (l.etiqueta && !l._cambio ? l.etiqueta : l.producto),
    item_name: l.eleccion ? null : l.producto, oz: Number(l.oz), chosen: !!l.eleccion,
    only_with: l.soloCon || null, not_with: l.sinCon || []
  });

  async function crear(o) {
    const nombre = String((o && o.nombre) || '').trim();
    if (!nombre) throw new Error('The recipe needs a name.');
    validar(o.lineas);
    const loc = await locacion();
    let fila;
    try {
      fila = await pedir('toast_recipes', { method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify([{ location_id: loc, tipo: 'cocktail', toast_name: nombre, happy_hour: !!o.hh }]) });
    } catch (e) {
      if (e.duplicado) throw new Error('A recipe called "' + nombre + '" already exists.');
      throw e;
    }
    const id = fila && fila[0] && fila[0].id;
    if ((o.lineas || []).length) {
      await pedir('toast_recipe_lines', { method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(o.lineas.map((l, i) => filaDe(Object.assign({}, l, { _cambio: true }), id, i))) });
    }
    await cargar();
    return id;
  }

  // Cambia lo que cambió y conserva lo que el editor no toca (las
  // condiciones "only with" / "not with"). Lo quitado se borra AL FINAL:
  // si algo falla antes, la receta no se queda sin líneas, que se leería
  // como un trago que no gasta nada.
  async function guardarReceta(id, o) {
    const R = recetas().find(x => x.id === id);
    if (!R) throw new Error('That recipe is no longer here.');
    validar(o.lineas);
    const antes = new Map(R.lineas.map(l => [l.id, l]));
    const quedan = new Set();
    const nuevas = [];
    for (let i = 0; i < o.lineas.length; i++) {
      const l = o.lineas[i];
      const viejo = l.id != null ? antes.get(l.id) : null;
      if (!viejo) { nuevas.push(filaDe(Object.assign({}, l, { _cambio: true }), id, i)); continue; }
      quedan.add(l.id);
      const cambioBotella = (viejo.producto || null) !== (l.producto || null);
      const cambio = {};
      if (Number(viejo.oz) !== Number(l.oz)) cambio.oz = Number(l.oz);
      if (cambioBotella) { cambio.item_name = l.eleccion ? null : l.producto; if (!l.eleccion) cambio.label = l.producto; }
      if (i !== R.lineas.indexOf(viejo)) cambio.position = i;
      if (Object.keys(cambio).length) {
        await pedir('toast_recipe_lines?id=eq.' + l.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(cambio) });
      }
    }
    if (nuevas.length) {
      await pedir('toast_recipe_lines', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(nuevas) });
    }
    if (!!o.hh !== R.hh) {
      await pedir('toast_recipes?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ happy_hour: !!o.hh }) });
    }
    const fuera = R.lineas.filter(l => !quedan.has(l.id)).map(l => l.id);
    if (fuera.length) await pedir('toast_recipe_lines?id=in.(' + fuera.join(',') + ')', { method: 'DELETE' });
    await cargar();
    return true;
  }

  async function borrar(id) {
    await pedir('toast_recipes?id=eq.' + id, { method: 'DELETE' });
    await cargar();
    return true;
  }

  // La receta pasa a casar con ESE artículo de Toast; el nombre que le
  // diste se queda para enseñarla.
  async function emparejar(id, toastName) {
    const R = recetas().find(x => x.id === id);
    if (!R) throw new Error('That recipe is no longer here.');
    const nuevo = String(toastName || '').trim();
    if (!nuevo) throw new Error('Pick a Toast item.');
    try {
      await pedir('toast_recipes?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ toast_name: nuevo, name: R.titulo !== nuevo ? R.titulo : null }) });
    } catch (e) {
      if (e.duplicado) throw new Error('"' + nuevo + '" already has its own recipe.');
      throw e;
    }
    await cargar();
    return true;
  }

  // "Same as…": otro nombre de Toast que gasta lo mismo.
  async function igualQue(id, toastName) {
    const R = recetas().find(x => x.id === id);
    if (!R) throw new Error('That recipe is no longer here.');
    const n = String(toastName || '').trim();
    if (!n) throw new Error('Pick a Toast item.');
    const also = R.tambien.concat(R.tambien.includes(n) ? [] : [n]);
    await pedir('toast_recipes?id=eq.' + id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ also }) });
    await cargar();
    return true;
  }

  // "Not a drink": ignorado en toast_item_links, por su guid. El cálculo
  // de botellas (toast-usage.js) ya se salta lo ignorado.
  async function ignorar(x) {
    if (!x || !x.guid) throw new Error('That Toast item has no id.');
    const loc = await locacion();
    await pedir('toast_item_links?on_conflict=location_id,toast_item_guid', { method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{ location_id: loc, toast_item_guid: x.guid, toast_item_name: x.nombre, toast_group: x.grupo || null,
        kind: 'liquor', status: 'ignored', item_name: null, updated_at: new Date().toISOString() }]) });
    _sinReceta = null;
    return true;
  }

  // ── "Not drinks": lo marcado, y devolverlo ─────────────────────────
  //
  // Axel, 2026-11-13: "marqué algunos cocktails como NOT A DRINK por
  // accidente, ¿cómo los recupero?". Lo marcado desaparecía sin rastro y
  // volver atrás era SQL. Opción A sobre lámina: al final de From Toast,
  // "Not drinks · N", cada uno con Restore.
  //
  // Son las filas 'ignored' de licor de toast_item_links QUE NO cuelgan
  // de un grupo "Liquor": ésas son el "Not in inventory" de Liquor from
  // Toast, que usa la misma tabla y el mismo estado, y no son de aquí.
  async function noBebidas() {
    const loc = await locacion();
    const filas = await window.BarStockRest.leerTodo('toast_item_links?location_id=eq.' + loc +
      '&status=eq.ignored&kind=eq.liquor&select=toast_item_guid,toast_item_name,toast_group,updated_at&order=id.asc');
    return filas.filter(f => !enGrupoLicor(f.toast_group))
      .map(f => ({ guid: f.toast_item_guid, nombre: String(f.toast_item_name || '').trim() || '(no name)',
        grupo: f.toast_group || null, cuando: f.updated_at || null }))
      .sort((a, b) => String(b.cuando || '').localeCompare(String(a.cuando || '')));
  }

  // Restore: se borra la fila 'ignored', y nada más. Sin fila, el trago
  // vuelve a ser "vendido sin receta" y sale otra vez en From Toast. El
  // filtro lleva status y kind para que, con un guid equivocado, no se
  // lleve por delante un emparejamiento de verdad.
  async function restaurar(x) {
    if (!x || !x.guid) throw new Error('That Toast item has no id.');
    const loc = await locacion();
    await pedir('toast_item_links?location_id=eq.' + loc + '&toast_item_guid=eq.' + encodeURIComponent(x.guid) +
      '&status=eq.ignored&kind=eq.liquor', { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    _sinReceta = null;
    return true;
  }

  // ── Lo que Toast vende sin receta ──────────────────────────────────
  //
  // Los cócteles: ventas de categoría Liquor de los últimos 30 días que
  // NO están bajo el grupo "Liquor" del menú (ése es el licor solo, que
  // empareja Liquor from Toast con la misma regla que lib/toast.js), sin
  // emparejar ni ignorar en toast_item_links, y sin receta por su nombre
  // ni por "also". El más vendido primero.
  const DIAS_TOAST = 30;
  let _sinReceta = null;       // { vendidos: Set de nombres normalizados }
  const enGrupoLicor = (g) => String(g || '').split('›').map(x => x.trim()).some(x => /^liquor$/i.test(x));
  async function sinReceta() {
    const loc = await locacion();
    const desde = new Date(Date.now() - DIAS_TOAST * 864e5).toISOString().slice(0, 10);
    const [ventas, enlaces] = await Promise.all([
      window.BarStockRest.leerTodo('toast_sales?location_id=eq.' + loc + '&business_date=gte.' + desde +
        '&sales_category=ilike.*liquor*&select=toast_item_guid,toast_item_name,toast_group,quantity&order=id.asc'),
      window.BarStockRest.leerTodo('toast_item_links?location_id=eq.' + loc + '&select=toast_item_guid,status&order=id.asc')
    ]);
    const tocados = new Set(enlaces.map(e => e.toast_item_guid));
    const conReceta = new Set();
    for (const R of recetas()) { conReceta.add(L().norm(R.nombre)); for (const a of R.tambien || []) conReceta.add(L().norm(a)); }
    const vendidos = new Set(), por = new Map();
    for (const v of ventas) {
      const n = String(v.toast_item_name || '').trim();
      if (!n) continue;
      vendidos.add(L().norm(n));
      if (enGrupoLicor(v.toast_group) || tocados.has(v.toast_item_guid) || conReceta.has(L().norm(n))) continue;
      const k = v.toast_item_guid || n;
      const x = por.get(k) || { guid: v.toast_item_guid || null, nombre: n, grupo: v.toast_group || null, vendidos: 0 };
      x.vendidos += Number(v.quantity) || 0;
      por.set(k, x);
    }
    _sinReceta = { vendidos };
    return [...por.values()].sort((a, b) => b.vendidos - a.vendidos);
  }
  // ¿Toast vende esta receta por su nombre (o "also")? null si todavía no
  // se han leído las ventas: no se sabe, y no se dice que no.
  function enToast(R) {
    if (!_sinReceta || !R) return null;
    return [R.nombre].concat(R.tambien || []).some(n => _sinReceta.vendidos.has(L().norm(n)));
  }

  window.BarStockToastRecipes = {
    cargar, datos, recetas, grupo, porElegir, faltan, sugerida, elegir, quitar, condicion, alCambiar,
    crear, guardarReceta, borrar, emparejar, igualQue, ignorar, noBebidas, restaurar, sinReceta, enToast, ELECCION,
    _reset: () => { _d = null; _cargando = null; }
  };
})();
