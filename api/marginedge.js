const { createClient } = require('@supabase/supabase-js');

// ── MarginEdge, sólo lectura ─────────────────────────────────────────
//
// El navegador NUNCA habla con MarginEdge. Habla con esta función, y la
// función pone la clave. El repositorio es público: una clave en
// `src/config.js` quedaría en el historial de git para siempre.
//
// Esta primera versión no escribe nada en Supabase. Sólo pregunta y
// devuelve lo que llega, para que podamos ver la forma real de los datos
// antes de construir encima de suposiciones.
//
// ── Por qué hay varias rutas candidatas por acción ──────────────────
//
// La documentación oficial de MarginEdge no es pública; lo que se sabe
// de la API viene de catálogos de terceros. En vez de adivinar una ruta
// y fallar con un 404 sin explicación, cada acción lleva una lista de
// rutas plausibles: se prueban en orden y se informa de lo que contestó
// cada una. La primera vez que esto corra vamos a saber cuáles son las
// buenas, y entonces la lista se reduce a una.

const BASE = 'https://api.marginedge.com/public';

const RUTAS = {
  units:      ['/restaurantUnits', '/restaurant-units', '/units'],
  categories: ['/categories'],
  vendors:    ['/vendors'],
  products:   ['/products'],
  invoices:   ['/orders', '/invoices'],

  // `/orders` devuelve cabeceras: proveedor, número, fecha, total. Las
  // líneas —qué producto y cuántos— tienen que estar en otro sitio, y
  // son las que de verdad alimentan el cálculo de consumo. El `{id}` se
  // sustituye por el orderId.
  invoice:    ['/orders/{id}', '/orders/{id}/items', '/orders/{id}/lineItems', '/orders/{id}/products'],

  // ── La pregunta de las unidades ────────────────────────────────────
  //
  // Una línea de factura dice `quantity: 6` y `packagingId: 12345`. Seis
  // ¿botellas, cajas de doce, barriles? Sin esa tabla, "recibido" entra
  // con el número equivocado y el consumo calculado queda mal sin que
  // nada avise: el total en dinero sí cuadra con la factura, así que el
  // error pasa desapercibido hasta que la varianza deja de tener
  // sentido meses después.
  packaging:  ['/packaging', '/packagings', '/vendorItems', '/vendors/items', '/units']
};

// Sólo estos parámetros pasan del navegador a MarginEdge. Una lista
// blanca y no un reenvío ciego: esta función lleva una credencial, y
// lo que lleva credencial no reenvía lo que le den sin mirar.
const PARAMS_OK = ['restaurantUnitId', 'startDate', 'endDate', 'nextPage', 'limit'];

const LIMITE_MUESTRA = 3;      // objetos completos de ejemplo
const LIMITE_CRUDO   = 20000;  // caracteres del cuerpo que devolvemos
const MAX_PAGINAS    = 25;     // tope de seguridad al seguir nextPage
// Hobby corta a los 10 s. Se deja margen para la última petición en
// vuelo y para serializar la respuesta.
const PRESUPUESTO_MS = 6500;
const MAX_DISTINTOS  = 40;     // más allá de esto, el campo es texto libre

// ── Por qué un resumen y no una muestra ──────────────────────────────
//
// Tres filas de ejemplo no dicen qué valores puede tomar un campo, y
// justo eso es lo que hay que saber antes de construir nada:
// `categoryType` decide qué categorías son de bebida, y `reportByUnit`
// decide si `latestPrice` es el precio de la botella o el de la caja.
// Equivocarse en el segundo mete un coste falso en el inventario, que
// es el tipo de error que no se nota hasta que la cifra de pérdida deja
// de cuadrar meses después.
//
// Así que para cada campo escalar con pocos valores distintos se
// devuelve la lista con su frecuencia. Si tiene muchos, es texto libre
// y sólo se dice cuántos hay.
function resumir(lista) {
  const conteo = {};

  for (const fila of lista) {
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
    if (distintos > MAX_DISTINTOS) {
      out[campo] = distintos + ' valores distintos (texto libre)';
    } else {
      out[campo] = Object.fromEntries(
        Object.entries(valores).sort((a, b) => b[1] - a[1])
      );
    }
  }
  return out;
}

function construirUrl(ruta, params) {
  const u = new URL(BASE + ruta);
  for (const k of PARAMS_OK) {
    const v = params[k];
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  }
  return u.toString();
}

// MarginEdge puede devolver el array suelto o envuelto en algún campo.
// No sabemos cuál todavía, así que se busca el primer array que haya.
function sacarLista(cuerpo) {
  if (Array.isArray(cuerpo)) return cuerpo;
  if (cuerpo && typeof cuerpo === 'object') {
    for (const k of Object.keys(cuerpo)) {
      if (Array.isArray(cuerpo[k])) return cuerpo[k];
    }
  }
  return null;
}

const dormir = ms => new Promise(r => setTimeout(r, ms));

// ── El 429 ───────────────────────────────────────────────────────────
//
// MarginEdge limita las peticiones por clave y no publica el número.
// Recorrer páginas una detrás de otra lo dispara enseguida.
//
// Se reintenta con esperas crecientes, respetando `Retry-After` si lo
// manda. Tres intentos y se rinde: insistir más no arregla un límite,
// sólo consume el presupuesto de tiempo de la función.
const REINTENTOS = 3;
const ESPERA_BASE = 700;

async function pedir(url, apiKey) {
  let r;

  for (let intento = 0; intento <= REINTENTOS; intento++) {
    r = await fetch(url, {
      method: 'GET',
      headers: { 'x-api-key': apiKey, 'Accept': 'application/json' }
    });

    if (r.status !== 429 || intento === REINTENTOS) break;

    const cabecera = Number(r.headers.get('retry-after'));
    await dormir(cabecera > 0 ? Math.min(cabecera * 1000, 4000)
                              : ESPERA_BASE * Math.pow(2, intento));
  }

  const texto = await r.text();
  let cuerpo = null;
  try { cuerpo = JSON.parse(texto); } catch (e) { /* no era JSON */ }

  return {
    status: r.status,
    ok: r.ok,
    cuerpo,
    texto: cuerpo ? null : texto.slice(0, 600)  // sólo si no se pudo parsear
  };
}

// Las 13 categorías de bebida de las 94 que tiene el restaurante. Todo
// lo demás —comida, químicos, desechables, nómina— se queda fuera.
const TIPOS_BEBIDA = ['BEER', 'LIQUOR', 'WINE', 'NA_BEVERAGES'];

// Recorre todas las páginas de una ruta y devuelve la lista entera.
async function traerTodo(ruta, params, apiKey) {
  let lista = [];
  let cursor = null;
  let paginas = 0;

  do {
    const p = cursor ? Object.assign({}, params, { nextPage: cursor }) : params;
    const r = await pedir(construirUrl(ruta, p), apiKey);
    if (!r.ok) {
      return { error: ruta + ' → ' + r.status + ' ' +
        (r.cuerpo?.message || r.texto || ''), lista, incompleto: true };
    }
    const trozo = sacarLista(r.cuerpo);
    if (!trozo || !trozo.length) break;
    lista = lista.concat(trozo);
    cursor = r.cuerpo?.nextPage || null;
    paginas++;
  } while (cursor && paginas < MAX_PAGINAS);

  return { lista, incompleto: !!cursor };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Sesión válida de la app, ANTES que nada. Esto devuelve lo que se
    // compra y a qué precio, y además el diagnóstico de abajo lista
    // nombres de variables de entorno: ni una cosa ni la otra puede
    // quedar abierta a quien conozca la URL.
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ ok: false, error: 'Missing token' });

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }

    // ── Por qué este diagnóstico ───────────────────────────────────
    //
    // "Falta la clave" tiene al menos cuatro causas distintas: el
    // nombre no coincide, se guardó en otro proyecto, se guardó en un
    // entorno que este despliegue no usa, o se guardó después del
    // último despliegue. Sin saber cuál es, se arregla a ciegas.
    //
    // Se devuelven NOMBRES de variables, nunca valores. Y sólo a una
    // sesión válida.
    const apiKey = process.env.MARGINEDGE_API_KEY;
    if (!apiKey) {
      const parecidos = Object.keys(process.env).filter(k => /margin|edge/i.test(k));
      return res.status(200).json({
        ok: false,
        error: 'La función no ve MARGINEDGE_API_KEY en este despliegue.',
        diagnostico: {
          variablesParecidas: parecidos.length ? parecidos : 'ninguna',
          otrasClavesPresentes: ['ANTHROPIC_API_KEY', 'RESEND_API_KEY', 'SUPABASE_URL']
            .filter(k => !!process.env[k]),
          entorno: process.env.VERCEL_ENV || 'desconocido',
          totalVariables: Object.keys(process.env).length
        }
      });
    }

    const { action, params } = req.body || {};

    // ── El catálogo de bebida, ya resuelto ─────────────────────────
    //
    // La pantalla de emparejar necesita TODOS los productos de bebida,
    // no una muestra. Pedirlos en crudo serían varios miles de líneas
    // con campos que no usa, y el cruce con categorías habría que
    // hacerlo en el navegador.
    //
    // Se hace aquí: dos recorridos, el filtro por categoryType, y sale
    // una lista corta con lo justo para decidir.
    // ── El catálogo, por tramos ───────────────────────────────────
    //
    // Dos límites se juntan aquí: MarginEdge throttlea por clave, y el
    // plan Hobby corta las funciones a los diez segundos. El catálogo
    // entero son miles de productos a cien por página, así que traerlo
    // de una sentada no cabe ni con reintentos.
    //
    // Se devuelve lo que quepa en un presupuesto de tiempo, junto con
    // el cursor para seguir. El navegador vuelve a llamar hasta que no
    // haya cursor y va enseñando el avance. Más vueltas, pero ninguna
    // se queda a medias.
    if (action === 'catalog') {
      const u = (params || {}).restaurantUnitId;
      if (!u) return res.status(400).json({ ok: false, error: 'Falta restaurantUnitId.' });

      // Los tipos de categoría sólo se resuelven en la primera llamada;
      // después viajan de ida y vuelta para no volver a pedirlos.
      let tipos = (params || {}).tipos;   // sólo las de bebida
      let todas = (params || {}).todas;   // todas, para saber si una id es conocida
      if (!tipos || typeof tipos !== 'object' || !todas || typeof todas !== 'object') {
        const cats = await traerTodo('/categories', { restaurantUnitId: u }, apiKey);
        if (cats.error) return res.status(200).json({ ok: false, error: cats.error });
        tipos = {}; todas = {};
        for (const c of cats.lista) {
          todas[String(c.categoryId)] = c.categoryType || 'OTHER';
          if (TIPOS_BEBIDA.includes(c.categoryType)) tipos[String(c.categoryId)] = c.categoryType;
        }
      }

      const otros = [];
      let sinCategoria = 0, desconocidas = 0;
      const muestraIds = [];

      const limite = Date.now() + PRESUPUESTO_MS;
      const bebida = [];
      let cursor = (params || {}).nextPage || null;
      let vistos = 0;
      let paginas = 0;

      do {
        const p = { restaurantUnitId: u };
        if (cursor) p.nextPage = cursor;

        const r = await pedir(construirUrl('/products', p), apiKey);
        if (!r.ok) {
          // Lo recogido hasta aquí sirve igual: el navegador se queda
          // con ello y puede reintentar desde el cursor.
          return res.status(200).json({
            ok: bebida.length > 0,
            action, tipos, todas, productos: bebida, otros, vistos, nextPage: cursor,
            sinCategoria, desconocidas, muestraIds,
            error: '/products → ' + r.status + ' ' + (r.cuerpo?.message || r.texto || '')
          });
        }

        const trozo = sacarLista(r.cuerpo);
        if (!trozo || !trozo.length) { cursor = null; break; }
        vistos += trozo.length;
        paginas++;

        for (const prod of trozo) {
          const cs = Array.isArray(prod.categories) ? prod.categories : [];
          let tipo = '';
          let conocida = false;
          for (const c of cs) {
            const id = String(c.categoryId);
            if (todas[id]) conocida = true;
            const t = tipos[id];
            if (t) { tipo = t; break; }
          }

          // ── Por qué se cuenta esto ──────────────────────────────
          //
          // Los `categoryId` de /categories iban por 1048, 1049, 1050
          // y el primer producto traía 45847. Si los identificadores
          // de producto no existen en la lista de categorías, el
          // filtro no está separando bebida de comida: está tirando
          // todo lo que no reconoce, y productos que sí tienes —Villa
          // Brici, por ejemplo— desaparecen sin dejar rastro.
          //
          // Contar los desconocidos convierte esa sospecha en un dato.
          if (!cs.length) sinCategoria++;
          else if (!conocida) {
            desconocidas++;
            if (muestraIds.length < 6) muestraIds.push(String(cs[0].categoryId));
          }

          // `sinFiltro` lleva el catálogo entero para que el buscador
          // a mano no dependa de que el filtro esté bien.
          const slim = {
            id: String(prod.companyConceptProductId),
            name: prod.productName || '',
            type: tipo,
            price: prod.latestPrice != null ? prod.latestPrice : null,
            unit: prod.reportByUnit || ''
          };
          if (tipo) bebida.push(slim); else otros.push(slim);
        }

        cursor = r.cuerpo?.nextPage || null;
      } while (cursor && Date.now() < limite && paginas < MAX_PAGINAS);

      return res.status(200).json({
        ok: true, action, tipos, todas,
        productos: bebida, otros, vistos, paginas,
        sinCategoria, desconocidas, muestraIds,
        nextPage: cursor   // null = se acabó
      });
    }

    // ── Qué compras de verdad ─────────────────────────────────────
    //
    // El catálogo entero son miles de productos de los que compras unos
    // cientos. Para emparejar, el resto es ruido: una botella de tu
    // estante no puede ser un producto que nunca has pedido.
    //
    // Sale de las líneas de factura, y eso son dos vueltas: `/orders`
    // da las cabeceras y cada `/orders/{id}` sus líneas. Con 300
    // facturas al mes no caben en una llamada, así que el trabajo se
    // reparte igual que el catálogo: el navegador pide las cabeceras,
    // y luego va mandando tandas de ids.
    if (action === 'purchases') {
      const u = (params || {}).restaurantUnitId;
      if (!u) return res.status(400).json({ ok: false, error: 'Falta restaurantUnitId.' });

      const limite = Date.now() + PRESUPUESTO_MS;
      const ids = (params || {}).orderIds;

      // Fase 1 · las cabeceras
      if (!Array.isArray(ids)) {
        const base = {
          restaurantUnitId: u,
          startDate: (params || {}).startDate,
          endDate: (params || {}).endDate
        };
        let cursor = (params || {}).nextPage || null;
        const cabeceras = [];
        let paginas = 0;

        do {
          const p = cursor ? Object.assign({}, base, { nextPage: cursor }) : base;
          const r = await pedir(construirUrl('/orders', p), apiKey);
          if (!r.ok) {
            return res.status(200).json({
              ok: cabeceras.length > 0, action, fase: 'headers',
              pedidos: cabeceras, nextPage: cursor,
              error: '/orders → ' + r.status + ' ' + (r.cuerpo?.message || r.texto || '')
            });
          }
          const trozo = sacarLista(r.cuerpo);
          if (!trozo || !trozo.length) { cursor = null; break; }
          paginas++;

          for (const o of trozo) {
            // Sólo las cerradas. Una pendiente de aprobar todavía puede
            // cambiar de cantidad o de precio.
            if (o.status !== 'CLOSED' && o.status !== 'COMPLETED') continue;
            cabeceras.push({
              id: String(o.orderId),
              vendor: o.vendorName || '',
              date: o.invoiceDate || o.createdDate || null
            });
          }
          cursor = r.cuerpo?.nextPage || null;
        } while (cursor && Date.now() < limite && paginas < MAX_PAGINAS);

        return res.status(200).json({
          ok: true, action, fase: 'headers', pedidos: cabeceras, nextPage: cursor
        });
      }

      // Fase 2 · las líneas, por tandas
      const lineas = [];
      let hechos = 0;

      for (const id of ids) {
        if (Date.now() >= limite) break;
        if (!/^\d+$/.test(String(id))) { hechos++; continue; }

        const r = await pedir(construirUrl('/orders/' + id, {}), apiKey);
        hechos++;
        if (!r.ok) continue;

        const trozo = sacarLista(r.cuerpo) || [];
        for (const l of trozo) {
          if (!l || !l.companyConceptProductId) continue;
          lineas.push({
            product: String(l.companyConceptProductId),
            vendorName: l.vendorItemName || '',
            code: l.vendorItemCode || '',
            packaging: l.packagingId != null ? String(l.packagingId) : '',
            unitPrice: l.unitPrice != null ? l.unitPrice : null,
            qty: l.quantity != null ? l.quantity : null
          });
        }
      }

      return res.status(200).json({
        ok: true, action, fase: 'lines',
        lineas, hechos, pendientes: ids.slice(hechos)
      });
    }

    // ── Buscar un producto concreto, sin filtros de por medio ──────
    //
    // Villa Brici se pide cada semana, está en MarginEdge, y no
    // aparecía al emparejar. Con el filtro de categorías de por medio
    // hay tres explicaciones posibles y ninguna forma de distinguirlas:
    // que no esté en `/products`, que el recorrido de páginas se quede
    // corto, o que su categoría no se reconozca.
    //
    // Esto recorre el catálogo crudo buscando un texto y devuelve el
    // registro TAL CUAL, más qué dice la lista de categorías sobre cada
    // `categoryId` que traiga. Una respuesta, no una hipótesis.
    if (action === 'find') {
      const u = (params || {}).restaurantUnitId;
      const q = String((params || {}).q || '').trim().toUpperCase();
      if (!u) return res.status(400).json({ ok: false, error: 'Falta restaurantUnitId.' });
      if (q.length < 2) return res.status(400).json({ ok: false, error: 'Escribe al menos dos letras.' });

      let todas = (params || {}).todas;
      if (!todas || typeof todas !== 'object') {
        const cats = await traerTodo('/categories', { restaurantUnitId: u }, apiKey);
        if (cats.error) return res.status(200).json({ ok: false, error: cats.error });
        todas = {};
        for (const c of cats.lista) todas[String(c.categoryId)] = c.categoryType || 'OTHER';
      }

      const limite = Date.now() + PRESUPUESTO_MS;
      let cursor = (params || {}).nextPage || null;
      let vistos = 0, paginas = 0;
      const hits = [];

      do {
        const p = { restaurantUnitId: u };
        if (cursor) p.nextPage = cursor;

        const r = await pedir(construirUrl('/products', p), apiKey);
        if (!r.ok) {
          return res.status(200).json({
            ok: false, action, hits, vistos, nextPage: cursor, todas,
            error: '/products → ' + r.status + ' ' + (r.cuerpo?.message || r.texto || '')
          });
        }

        const trozo = sacarLista(r.cuerpo);
        if (!trozo || !trozo.length) { cursor = null; break; }
        vistos += trozo.length;
        paginas++;

        for (const prod of trozo) {
          if (!String(prod.productName || '').toUpperCase().includes(q)) continue;
          hits.push({
            crudo: prod,
            categorias: (Array.isArray(prod.categories) ? prod.categories : []).map(c => ({
              categoryId: String(c.categoryId),
              conocida: Object.prototype.hasOwnProperty.call(todas, String(c.categoryId)),
              tipo: todas[String(c.categoryId)] || null
            }))
          });
        }

        cursor = r.cuerpo?.nextPage || null;
      } while (cursor && Date.now() < limite && paginas < MAX_PAGINAS);

      return res.status(200).json({
        ok: true, action, q, hits, vistos, paginas, todas,
        totalCategorias: Object.keys(todas).length,
        nextPage: cursor
      });
    }

    const candidatas = RUTAS[action];
    if (!candidatas) {
      return res.status(400).json({
        ok: false,
        error: 'Acción desconocida: ' + action,
        acciones: Object.keys(RUTAS)
      });
    }

    // El id va en la RUTA, no en la query, así que no puede pasar por
    // la lista blanca de parámetros. Sólo dígitos: lo que viaja en una
    // URL que lleva credencial no se construye con texto sin mirar.
    let rutas = candidatas;
    if (candidatas.some(r => r.includes('{id}'))) {
      const id = String((params || {}).orderId || '');
      if (!/^\d+$/.test(id)) {
        return res.status(400).json({ ok: false, error: 'Hace falta un orderId numérico.' });
      }
      rutas = candidatas.map(r => r.replace('{id}', id));
    }

    const intentos = [];

    for (const ruta of rutas) {
      const url = construirUrl(ruta, params || {});
      let r;
      try {
        r = await pedir(url, apiKey);
      } catch (e) {
        intentos.push({ ruta, error: String(e && e.message || e) });
        continue;
      }

      intentos.push({
        ruta,
        status: r.status,
        mensaje: r.cuerpo?.message || r.cuerpo?.Message || undefined
      });

      // Qué significa "esta ruta no existe" aquí.
      //
      // Lo esperable sería un 404. Pero detrás hay un AWS API Gateway, y
      // a una ruta que no tiene configurada contesta **403 con "Missing
      // Authentication Token"**. El mensaje suena a problema de
      // credenciales y no lo es: es su manera de no confirmar qué rutas
      // existen. Tratarlo como un error real hacía que el sondeo parara
      // en la primera candidata y no probara el resto.
      //
      // Un 403 con cualquier OTRO mensaje sí es un permiso de verdad y
      // hay que enseñarlo.
      const noExiste = r.status === 404 ||
        (r.status === 403 && /missing authentication token/i.test(
          r.cuerpo?.message || r.cuerpo?.Message || r.texto || ''));
      if (noExiste) continue;

      if (!r.ok) {
        return res.status(200).json({
          ok: false,
          action,
          ruta,
          status: r.status,
          error: r.cuerpo?.message || r.cuerpo?.error || r.texto || ('HTTP ' + r.status),
          intentos
        });
      }

      let lista = sacarLista(r.cuerpo);

      // Seguir las páginas. La primera página de 100 no sirve para saber
      // qué valores existen: los de bebida pueden estar en la cuarta.
      let paginas = 1;
      let cursor = r.cuerpo?.nextPage || null;
      while (cursor && lista && paginas < MAX_PAGINAS) {
        const sig = await pedir(
          construirUrl(ruta, Object.assign({}, params || {}, { nextPage: cursor })),
          apiKey);
        if (!sig.ok) break;
        const trozo = sacarLista(sig.cuerpo);
        if (!trozo || !trozo.length) break;
        lista = lista.concat(trozo);
        cursor = sig.cuerpo?.nextPage || null;
        paginas++;
      }

      return res.status(200).json({
        ok: true,
        action,
        ruta,
        status: r.status,
        total: lista ? lista.length : null,
        paginas,
        incompleto: !!cursor,
        campos: lista && lista.length && typeof lista[0] === 'object'
          ? Object.keys(lista[0])
          : null,
        resumen: lista ? resumir(lista) : null,
        muestra: lista ? lista.slice(0, LIMITE_MUESTRA) : null,
        // Para una factura suelta el objeto entero importa: `sacarLista`
        // devolvería sólo el array de líneas y perderíamos la cabecera.
        crudo: (!lista || action === 'invoice')
          ? JSON.stringify(r.cuerpo).slice(0, LIMITE_CRUDO)
          : null,
        intentos
      });
    }

    return res.status(200).json({
      ok: false,
      action,
      error: 'Ninguna de las rutas candidatas existe. Hay que mirar la documentación del portal.',
      intentos
    });

  } catch (err) {
    console.error('marginedge endpoint error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
};
