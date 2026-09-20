(() => {
  if (window.BarStockItemShapes) return;

  // ── La silueta es del producto, no de la locación ────────────────────
  //
  // Un código de barras aprendido vale para todas las locaciones. La
  // silueta no lo hacía, y esa incoherencia se notaba enseguida:
  //
  //   Escaneas un Beefeater en The Crown, la app aprende su código y le
  //   asignas la silueta. Alguien escanea el mismo Beefeater en Will's &
  //   Bill's: el código lo reconoce, pero la forma está vacía y el conteo
  //   dibuja la botella genérica.
  //
  // Y no hay motivo para que difieran. Un código identifica un producto;
  // la forma de su botella es física. La misma botella no cambia de forma
  // al cruzar la calle.
  //
  // Este módulo es el mapa global. Se apoya en `item_shapes`, que usa la
  // misma clave que `item_barcodes` —(account_id, item_name)— para que un
  // producto se identifique igual en toda la aplicación.
  //
  // ── Qué manda sobre qué ─────────────────────────────────────────────
  //
  //   FORMA   manda la tabla global. Si no hay, la fila local. Si
  //           tampoco, genérica.
  //
  //   TAMAÑO  manda la fila LOCAL, y la global solo rellena huecos. El
  //           nombre de un artículo no siempre lleva el formato
  //           ("Beefeater London Dry Gin" a secas) y dos barras pueden
  //           stockear el mismo nombre en 750 y en 1 L. Igualar eso
  //           cambiaría cantidades, no dibujos.
  //
  // ── Por qué se sigue escribiendo la columna local ───────────────────
  //
  // `inventory_items.bottle_shape` pasa a ser una copia, no la verdad.
  // Se conserva porque el import semanal ya sabe respetarla, y porque si
  // esta tabla no responde el conteo sigue teniendo con qué dibujar.

  let _map = null;        // item_name -> { shape, size }
  let _loading = null;

  function cfg() {
    const c = window.BARSTOCK_CONFIG || {};
    return { url: c.SUPABASE_URL, key: c.SUPABASE_KEY, account: c.ACCOUNT_ID || '' };
  }

  // ── Cargar ───────────────────────────────────────────────────────────
  //
  // Una sola consulta en vuelo aunque varias pantallas la pidan a la vez,
  // igual que hace BarStockCycle. En un arranque, el inventario en tiempo
  // real y el panel de conteo pueden pedirla casi al mismo tiempo.
  function load(force) {
    if (_map && !force) return Promise.resolve(_map);
    if (_loading) return _loading;

    _loading = (async () => {
      const { url, key, account } = cfg();
      if (!url || !key) { _map = {}; return _map; }
      try {
        // ── Paginado, no `limit` a ojo ────────────────────────────────
        //
        // PostgREST corta cualquier respuesta en un maximo de filas —mil
        // por defecto— y lo hace EN SILENCIO: devuelve un array valido y
        // mas corto. Un `limit=5000` no salva de eso, porque el tope del
        // servidor manda sobre el del cliente.
        //
        // Este mismo fallo ya mordio una vez en este proyecto: las
        // consultas de inventory_snapshots llegaban truncadas y muchos
        // productos parecian tener tres semanas de historial cuando
        // tenian ocho. Aqui se traduciria en siluetas que desaparecen
        // para los productos del final del alfabeto.
        const PAGE = 1000;
        const rows = [];
        for (let p = 0; p < 50; p++) {
          const res = await fetch(
            `${url}/rest/v1/item_shapes?account_id=eq.${encodeURIComponent(account)}` +
            `&select=item_name,code,bottle_shape,bottle_size_ml` +
            `&order=item_name.asc&limit=${PAGE}&offset=${p * PAGE}`,
            { headers: { apikey: key, Authorization: `Bearer ${key}` } });
          const lote = await res.json();
          if (!Array.isArray(lote)) {
            // Tabla que todavía no existe: PostgREST devuelve un objeto de
            // error, no un array. Se dice qué falta en vez de comportarse
            // como si no hubiera nada asignado, que es indistinguible.
            if (lote && /item_shapes/.test(JSON.stringify(lote))) {
              console.warn('[siluetas] falta la tabla item_shapes. Corre la migracion 012.');
            }
            break;
          }
          rows.push(...lote);
          if (lote.length < PAGE) break;   // pagina incompleta = no hay mas
        }
        const m = {};
        for (const r of rows) {
          if (!r.item_name) continue;
          m[r.item_name] = { shape: r.bottle_shape || null, size: r.bottle_size_ml || null };
        }
        _map = m;
      } catch (e) {
        console.warn('[siluetas] no se pudo leer el mapa global', e);
        _map = {};
      } finally {
        _loading = null;
      }
      return _map;
    })();
    return _loading;
  }

  function isLoaded() { return _map !== null; }
  function get(itemName) { return (_map && _map[itemName]) || null; }

  // ── Aplicar sobre las filas del inventario ───────────────────────────
  //
  // Se llama después de cargar el inventario. Muta las filas en sitio: la
  // pantalla de conteo puede tener una referencia abierta a una de ellas,
  // y sustituirlas la dejaría dibujando la forma vieja.
  function applyTo(rows) {
    if (!_map || !Array.isArray(rows)) return 0;
    let n = 0;
    for (const r of rows) {
      const g = _map[r.item];
      if (!g) continue;
      if (g.shape && r.bottleShape !== g.shape) { r.bottleShape = g.shape; n++; }
      // El tamaño solo rellena huecos: la fila local manda.
      if (!r.bottleSizeMl && g.size) r.bottleSizeMl = g.size;
    }
    return n;
  }

  // Carga y aplica en un paso. Es lo que llama el cargador de inventario.
  async function hydrate(rows) {
    await load();
    return applyTo(rows);
  }

  // ── Guardar ──────────────────────────────────────────────────────────
  //
  // Escribe el mapa global. Quien llama sigue escribiendo también la fila
  // local: esto no la sustituye, la respalda.
  async function save(itemName, code, shape, sizeMl) {
    if (!itemName) return false;
    const { url, key, account } = cfg();
    if (!url || !key) return false;

    try {
      const res = await fetch(`${url}/rest/v1/item_shapes?on_conflict=account_id,item_name`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key, Authorization: `Bearer ${key}`,
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify([{
          account_id: account,
          item_name: itemName,
          code: code || null,
          bottle_shape: shape || null,
          bottle_size_ml: sizeMl || null,
          updated_at: new Date().toISOString(),
          updated_by: window.__bsUserEmail || null
        }])
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        console.warn('[siluetas] la nube rechazo el guardado (' + res.status + ')', t);
        if (/item_shapes/.test(t)) {
          console.warn('[siluetas] falta la tabla. Corre la migracion 012.');
        }
        return false;
      }
    } catch (e) {
      console.warn('[siluetas] no se pudo guardar en el mapa global', e);
      return false;
    }

    if (!_map) _map = {};
    _map[itemName] = { shape: shape || null, size: sizeMl || null };

    // Y se propaga a las otras filas del inventario en memoria que tengan
    // el mismo nombre. No suele haber dos, pero si las hay deben coincidir
    // desde ya y no esperar a la siguiente recarga.
    const master = (window.state && window.state.master) || [];
    for (const r of master) {
      if (r.item === itemName && shape) r.bottleShape = shape;
    }
    return true;
  }

  // ── Varios de golpe ──────────────────────────────────────────────────
  //
  // UNA peticion con todas las filas, no una por articulo. PostgREST
  // acepta un array en el upsert, asi que 300 productos son 300 filas en
  // un solo POST en vez de 300 viajes de ida y vuelta.
  //
  // Lo escribi primero de cinco en cinco, copiando el patron del resto
  // del proyecto. Ahi tiene sentido porque cada articulo necesita su
  // propio PATCH con su propio filtro; aqui no: es la misma tabla, la
  // misma clave y el mismo tipo de fila. Sesenta tandas de cinco contra
  // una peticion es la diferencia entre medio minuto y medio segundo.
  //
  // Se trocea de todas formas: un cuerpo con miles de filas puede pasarse
  // del limite de tamaño de peticion, y 500 es holgado por los dos lados.
  async function saveMany(items) {
    const { url, key, account } = cfg();
    if (!url || !key || !items || !items.length) return 0;

    const ahora = new Date().toISOString();
    const quien = window.__bsUserEmail || null;
    const filas = items.filter(x => x && x.item).map(x => ({
      account_id: account,
      item_name: x.item,
      code: x.code || null,
      bottle_shape: x.shape || null,
      bottle_size_ml: x.size || null,
      updated_at: ahora,
      updated_by: quien
    }));

    let ok = 0;
    const LOTE = 500;
    for (let i = 0; i < filas.length; i += LOTE) {
      const trozo = filas.slice(i, i + LOTE);
      try {
        const res = await fetch(`${url}/rest/v1/item_shapes?on_conflict=account_id,item_name`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: key, Authorization: `Bearer ${key}`,
            Prefer: 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify(trozo)
        });
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          console.warn('[siluetas] lote rechazado (' + res.status + ')', t.slice(0, 200));
          continue;
        }
        ok += trozo.length;
        if (!_map) _map = {};
        for (const f of trozo) {
          _map[f.item_name] = { shape: f.bottle_shape, size: f.bottle_size_ml };
        }
      } catch (e) {
        console.warn('[siluetas] no se pudo guardar el lote', e);
      }
    }
    return ok;
  }

  function invalidate() { _map = null; }

  window.BarStockItemShapes = { load, isLoaded, get, applyTo, hydrate, save, saveMany, invalidate };
})();
