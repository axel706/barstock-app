const { resumir } = require('./resumir');
// La sesión, el fetch con tope, recortar y revisar la credencial son de
// todas las integraciones: viven en lib/integracion.js. La sesión ni
// siquiera se mira aquí: la comprueba api/integrations.js antes de
// repartir.
const { pedir: pedirComun, recortar, revisar, valor, faltan: faltanComun } = require('./integracion');

// ── Toast, sólo lectura ──────────────────────────────────────────────
//
// Fase 1 de la integración (ver docs/integrations-plan.md): conectar y
// MIRAR. Esta función no escribe nada, ni en Supabase ni en Toast. Pide
// y devuelve lo que llega, resumido, para ver la forma real de los
// datos antes de construir encima de suposiciones. Es el mismo camino
// que se siguió con MarginEdge, y por la misma razón.
//
// El navegador nunca habla con Toast. Habla con esta función, y la
// función pone la credencial. El repositorio es público.
//
// ── Por qué no hay página de OAuth ───────────────────────────────────
//
// Toast da a los restaurantes "Standard API access": un clientId y un
// clientSecret que se cambian por un token servidor con servidor
// (userAccessType TOAST_MACHINE_CLIENT). No hay inicio de sesión ni
// redirección, así que no hace falta un callback.
//
// ── Variables de entorno ─────────────────────────────────────────────
//
//   TOAST_CLIENT_ID         Secret
//   TOAST_CLIENT_SECRET     Secret
//   TOAST_API_HOST          p. ej. ws-api.toasttab.com
//   TOAST_RESTAURANT_GUID   el de Crown, para esta prueba
//
// El GUID en una variable vale para probar con UNA locación. No es el
// diseño final: BarStock es multi-locación, y con MarginEdge ya se
// aprendió que el restaurante va por locación en `location_settings`
// (ver la cabecera de src/settings-integrations.js). Cuando se conecten
// las demás, el GUID se muda allí.
//
// ── Vive en lib/, no en api/ ─────────────────────────────────────────
//
// El plan de Vercel admite 12 funciones y la doce se liberó a propósito
// (ver api/notify.js) para UNA función de integraciones compartida por
// Toast y TripleSeat. Esa es api/integrations.js, que sólo reparte por
// `provider`; la lógica de cada una vive aquí, en lib/, que no cuenta.
// La primera versión fue un api/toast.js y se comía la ranura entera:
// lo cazó test-correo-merge.

// Lo que Toast devuelve es de un restaurante entero. No se devuelve
// tal cual: un menú puede pesar varios MB, y un día de órdenes más.
const LIMITE_MUESTRA = 3;
const PAGINA_ORDENES = 100;     // el máximo que acepta ordersBulk

function host() {
  // Se acepta con o sin https:// y con o sin barra final: es lo
  // primero que se equivoca al copiarlo de Toast Web.
  return String(process.env.TOAST_API_HOST || '')
    .trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

// Ayer en Nueva York, como fecha de negocio de Toast (yyyymmdd). Ayer y
// no hoy: el día de hoy todavía no está cerrado.
function ayer() {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(Date.now() - 24 * 3600 * 1000));
  return f.replace(/-/g, '');
}

// Toast contesta 429 cuando se le pide demasiado seguido, y es
// pasajero: un segundo después contesta bien. La primera vez que se abrió
// Wine from Toast en Crown falló así, leyendo el menú tres veces a la vez.
// Se reintenta poco y con tope, para no pasarse del tiempo de Vercel; si
// sigue en 429, se devuelve el 429 tal cual.
const REINTENTOS_429 = 3;
const ESPERA_429_MS = 1000;
async function pedir(url, opciones) {
  let r;
  for (let i = 0; i <= REINTENTOS_429; i++) {
    if (i) await new Promise(ok => setTimeout(ok, ESPERA_429_MS));
    r = await pedirComun(url, opciones, 'Toast');
    if (r.status !== 429) return r;
  }
  return r;
}


// El token NUNCA sale de esta función. Se devuelve sólo si el login
// funcionó, cuándo caduca y qué permisos trae.
async function login() {
  const r = await pedir('https://' + host() + '/authentication/v1/authentication/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: valor('TOAST_CLIENT_ID'),
      clientSecret: valor('TOAST_CLIENT_SECRET'),
      userAccessType: 'TOAST_MACHINE_CLIENT'
    })
  });
  const tok = r.cuerpo && r.cuerpo.token;
  if (!r.ok || !tok || !tok.accessToken) {
    // Lo que dijo Toast, tal cual. Nada de adivinar la causa: lo que se
    // añade son hechos de la credencial, no una suposición sobre ella.
    return {
      ok: false, status: r.status, respuesta: recortar(r.cuerpo || r.texto),
      revision: {
        TOAST_CLIENT_ID: revisar('TOAST_CLIENT_ID'),
        TOAST_CLIENT_SECRET: revisar('TOAST_CLIENT_SECRET'),
        host: host(),
        hostDeSandbox: /sandbox/i.test(host())
      }
    };
  }
  return {
    ok: true,
    accessToken: tok.accessToken,
    expiraEnSegundos: tok.expiresIn,
    permisos: tok.scope || null
  };
}

function cabeceras(token) {
  return {
    Authorization: 'Bearer ' + token,
    'Toast-Restaurant-External-ID': String(process.env.TOAST_RESTAURANT_GUID || '').trim()
  };
}

// Las líneas de venta de un montón de órdenes, aplanadas. Es lo que hay
// que entender: qué es una "selección", cuánto vale `quantity`, cómo
// vienen los modificadores (shot, doble, copa).
function lineas(ordenes) {
  const out = [];
  for (const o of ordenes || []) {
    for (const c of (o && o.checks) || []) {
      for (const s of (c && c.selections) || []) out.push(s);
    }
  }
  return out;
}

function contarMenu(menus) {
  let grupos = 0, articulos = 0;
  const muestra = [];
  const recorrer = (g) => {
    grupos++;
    for (const it of g.menuItems || []) {
      articulos++;
      if (muestra.length < 25) muestra.push({ name: it.name, guid: it.guid, group: g.name });
    }
    for (const sub of g.menuGroups || []) recorrer(sub);
  };
  for (const m of menus || []) for (const g of m.menuGroups || []) recorrer(g);
  return { grupos, articulos, muestra };
}

// ── Qué bebidas se venden, y cómo las cuenta Toast ─────────────────────
//
// Para decidir cómo pasar de Toast a botellas (lo que hoy da el CSV de
// MarginEdge, ya convertido con sus recetas) primero hay que ver cómo
// vienen los tragos: si la marca es el artículo o un modificador, qué
// tamaños hay, cuántos artículos distintos se venden. Esto lo resume por
// categoría de venta, un día entero.
//
// Lo escrito a mano —un "open item", una petición especial— no tiene guid
// de artículo y es texto libre: puede decir cualquier cosa, también un
// nombre de cliente. Se cuenta, pero sin su texto. Es la regla que salió
// del panel de TripleSeat después de enseñar descripciones enteras.
const LIBRE = '(free text)';

function nombreDe(x) {
  if (!x) return LIBRE;
  const guid = x.item && x.item.guid;
  return guid ? String(x.displayName || x.name || '').trim() || '(no name)' : LIBRE;
}

function gruposDelMenu(menus) {
  const de = new Map();
  const recorrer = (g, ruta) => {
    const r = ruta ? ruta + ' › ' + g.name : g.name;
    for (const it of g.menuItems || []) if (it.guid) de.set(it.guid, r);
    for (const sub of g.menuGroups || []) recorrer(sub, r);
  };
  for (const m of menus || []) for (const g of m.menuGroups || []) recorrer(g, m.name);
  return de;
}

function resumirBebidas(ordenes, categorias, grupoDe, op) {
  op = op || {};
  const ARTICULOS = op.articulos || 30, MODIFICADORES = op.modificadores || 8;
  const porCat = new Map();
  const anulada = (x) => x && (x.voided || x.deleted);
  for (const o of ordenes || []) {
    if (anulada(o)) continue;
    for (const c of (o && o.checks) || []) {
      if (anulada(c)) continue;
      for (const s of (c && c.selections) || []) {
        if (anulada(s)) continue;
        const cg = s.salesCategory && s.salesCategory.guid;
        const cat = (cg && categorias.get(cg)) || '(no sales category)';
        if (op.categoria && !cat.toLowerCase().includes(String(op.categoria).toLowerCase())) continue;
        const q = Number(s.quantity) || 1;
        if (!porCat.has(cat)) porCat.set(cat, { lineas: 0, unidades: 0, articulos: new Map() });
        const C = porCat.get(cat);
        C.lineas++; C.unidades += q;
        const nom = nombreDe(s);
        if (!C.articulos.has(nom)) {
          C.articulos.set(nom, { unidades: 0, grupo: (s.item && grupoDe.get(s.item.guid)) || null, mods: new Map() });
        }
        const A = C.articulos.get(nom);
        A.unidades += q;
        const recorrer = (mods) => {
          for (const m of mods || []) {
            if (anulada(m)) continue;
            const mn = nombreDe(m);
            A.mods.set(mn, (A.mods.get(mn) || 0) + (Number(m.quantity) || 1) * q);
            recorrer(m.modifiers);
          }
        };
        recorrer(s.modifiers);
      }
    }
  }
  const redondo = (n) => Math.round(n * 100) / 100;
  return [...porCat.entries()]
    .sort((a, b) => b[1].unidades - a[1].unidades)
    .map(([nombre, C]) => ({
      categoria: nombre,
      lineas: C.lineas,
      unidades: redondo(C.unidades),
      articulosDistintos: C.articulos.size,
      articulos: [...C.articulos.entries()]
        .sort((a, b) => b[1].unidades - a[1].unidades)
        .slice(0, ARTICULOS)
        .map(([n, A]) => ({
          nombre: n, unidades: redondo(A.unidades), grupo: A.grupo,
          modificadores: [...A.mods.entries()].sort((a, b) => b[1] - a[1]).slice(0, MODIFICADORES)
            .map(([mn, mq]) => mn + ' ×' + redondo(mq))
        }))
    }));
}

// ── Vino: qué artículos de Toast son vino, y cuánto se vendió ──────────
//
// Para emparejar cada artículo de Toast con una botella del inventario
// (src/toast-wine.js). Los artículos salen del MENÚ, no de las ventas:
// así aparece también el vino que esta semana no se vendió.
//
// Es vino lo que cuelga de un grupo con "wine" en su ruta: en Crown,
// "DRINKS › Wine › …" y "HAPPY HOUR › HH Wines". Copa o botella lo dice
// el propio Toast: los grupos "By The Bottle" y los nombres "BTL …" son
// botella; lo demás, copa. Es lo que se vio al medir un viernes entero.
function vinosDelMenu(menus) {
  const out = new Map();
  const recorrer = (g, ruta) => {
    const r = ruta ? ruta + ' › ' + g.name : g.name;
    const esVino = /wine/i.test(r);
    for (const it of g.menuItems || []) {
      if (!esVino || !it.guid || out.has(it.guid)) continue;
      const nombre = String(it.name || '').trim();
      const botella = /by the bottle/i.test(r) || /^btl\b/i.test(nombre);
      out.set(it.guid, { guid: it.guid, nombre, grupo: r, servicio: botella ? 'bottle' : 'glass' });
    }
    for (const sub of g.menuGroups || []) recorrer(sub, r);
  };
  for (const m of menus || []) for (const g of m.menuGroups || []) recorrer(g, m.name);
  return out;
}

// Lo vendido de esos artículos, por guid. Se salta lo anulado: cuando a un
// cliente se le cobra mal, la línea mala se anula y se timbra otra con
// "Don't Make"; la que queda es la única copa que salió, y esa sí cuenta.
function vendidoPorGuid(ordenes, guids) {
  const v = {};
  const anulada = (x) => x && (x.voided || x.deleted);
  for (const o of ordenes || []) {
    if (anulada(o)) continue;
    for (const c of (o && o.checks) || []) {
      if (anulada(c)) continue;
      for (const s of (c && c.selections) || []) {
        const g = s && s.item && s.item.guid;
        if (anulada(s) || !g || !guids.has(g)) continue;
        v[g] = (v[g] || 0) + (Number(s.quantity) || 1);
      }
    }
  }
  return v;
}

// Un día pide varias páginas: 100 órdenes es la página más grande que
// acepta Toast, y un sábado de Crown son varias. Con tope, para que la
// función no se pase de tiempo en Vercel; si se llega al tope se dice.
const TOPE_PAGINAS = 15;

// La sesión, el método y el CORS ya los comprobó api/integrations.js.
module.exports = async function handler(req, res) {
  try {
    const { action, params } = req.body || {};
    // `ping` sólo necesita las tres primeras: así se puede probar el
    // login antes de tener el GUID.
    const NECESARIAS = ['TOAST_CLIENT_ID', 'TOAST_CLIENT_SECRET', 'TOAST_API_HOST']
      .concat(action === 'ping' ? [] : ['TOAST_RESTAURANT_GUID']);
    const falta = faltanComun(NECESARIAS, /toast/i);
    if (falta) return res.status(200).json(falta);

    const ACCIONES = ['ping', 'restaurant', 'menu', 'orders', 'drinks', 'wine'];
    if (!ACCIONES.includes(action)) {
      return res.status(400).json({ ok: false, error: 'Acción desconocida. Usa: ' + ACCIONES.join(', ') });
    }

    const l = await login();
    if (!l.ok) {
      return res.status(200).json({ ok: false, paso: 'login', error: 'Toast no aceptó el login.', toast: l });
    }
    if (action === 'ping') {
      return res.status(200).json({
        ok: true, accion: 'ping', host: host(),
        expiraEnSegundos: l.expiraEnSegundos, permisos: l.permisos
      });
    }

    const base = 'https://' + host();
    const h = cabeceras(l.accessToken);

    if (action === 'restaurant') {
      const guid = String(process.env.TOAST_RESTAURANT_GUID).trim();
      const r = await pedir(base + '/restaurants/v1/restaurants/' + encodeURIComponent(guid), { headers: h });
      const g = r.cuerpo && r.cuerpo.general;
      return res.status(200).json({
        ok: r.ok, accion: 'restaurant', status: r.status,
        nombre: g ? (g.locationName || g.name || null) : null,
        crudo: recortar(r.cuerpo || r.texto)
      });
    }

    if (action === 'menu') {
      const r = await pedir(base + '/menus/v2/menus', { headers: h });
      if (!r.ok) {
        return res.status(200).json({ ok: false, accion: 'menu', status: r.status, crudo: recortar(r.cuerpo || r.texto) });
      }
      const menus = (r.cuerpo && r.cuerpo.menus) || [];
      return res.status(200).json({
        ok: true, accion: 'menu', status: r.status,
        menus: menus.map(m => m.name),
        ...contarMenu(menus)
      });
    }

    const p = params || {};
    const dia = /^\d{8}$/.test(String(p.businessDate || '')) ? String(p.businessDate) : ayer();

    // Las páginas de un día entero, con su tope. Lo usan drinks y wine.
    async function ordenesDelDia() {
      const ordenes = [];
      for (let pagina = 1; pagina <= TOPE_PAGINAS; pagina++) {
        const r = await pedir(base + '/orders/v2/ordersBulk?businessDate=' + dia +
          '&pageSize=' + PAGINA_ORDENES + '&page=' + pagina, { headers: h });
        if (!r.ok || !Array.isArray(r.cuerpo)) return { ok: false, pagina, status: r.status, crudo: recortar(r.cuerpo || r.texto) };
        ordenes.push(...r.cuerpo);
        if (r.cuerpo.length < PAGINA_ORDENES) return { ok: true, ordenes, completo: true };
      }
      return { ok: true, ordenes, completo: false };
    }

    if (action === 'wine') {
      // Con `guids`, la pantalla ya leyó el menú el primer día y sólo
      // quiere lo vendido de esos vinos: el menú no se vuelve a pedir.
      // Toast limita las lecturas del menú, y pedirlo una vez por cada
      // uno de los siete días le hizo contestar 429.
      let vinos;
      if (Array.isArray(p.guids)) {
        vinos = new Map(p.guids.map(String).map(g => [g, null]));
      } else {
        const rm = await pedir(base + '/menus/v2/menus', { headers: h });
        if (!rm.ok) {
          return res.status(200).json({ ok: false, accion: 'wine', paso: 'menu', status: rm.status, crudo: recortar(rm.cuerpo || rm.texto) });
        }
        vinos = vinosDelMenu((rm.cuerpo && rm.cuerpo.menus) || []);
      }
      const d = await ordenesDelDia();
      if (!d.ok) {
        return res.status(200).json({ ok: false, accion: 'wine', paso: 'orders', businessDate: dia, pagina: d.pagina, status: d.status, crudo: d.crudo });
      }
      return res.status(200).json({
        ok: true, accion: 'wine', businessDate: dia,
        // El restaurante del que sale esto: la pantalla lo compara con el
        // de la locación abierta, para no emparejar el vino de Crown con
        // el inventario de otra.
        restaurante: String(process.env.TOAST_RESTAURANT_GUID || '').trim(),
        diaCompleto: d.completo,
        articulos: [...vinos.values()].filter(Boolean),
        vendido: vendidoPorGuid(d.ordenes, new Set(vinos.keys()))
      });
    }

    if (action === 'drinks') {
      const [rc, rm] = await Promise.all([
        pedir(base + '/config/v2/salesCategories', { headers: h }),
        pedir(base + '/menus/v2/menus', { headers: h })
      ]);
      const categorias = new Map((Array.isArray(rc.cuerpo) ? rc.cuerpo : []).map(c => [c.guid, c.name]));
      const grupoDe = gruposDelMenu((rm.cuerpo && rm.cuerpo.menus) || []);
      const d = await ordenesDelDia();
      if (!d.ok) {
        return res.status(200).json({ ok: false, accion: 'drinks', businessDate: dia, pagina: d.pagina, status: d.status, crudo: d.crudo });
      }
      const ordenes = d.ordenes, completo = d.completo;
      const cat = typeof p.categoria === 'string' ? p.categoria.slice(0, 40) : '';
      return res.status(200).json({
        ok: true, accion: 'drinks', businessDate: dia,
        ordenes: ordenes.length,
        // Si se llegó al tope de páginas, el día NO está entero. Se dice,
        // para que nadie lea esto como el total.
        diaCompleto: completo,
        categoriasDeVenta: rc.ok ? categorias.size : 'no se pudieron leer (HTTP ' + rc.status + ')',
        porCategoria: resumirBebidas(ordenes, categorias, grupoDe, {
          categoria: cat || null, articulos: cat ? 200 : 30, modificadores: cat ? 20 : 8
        })
      });
    }

    // orders: un solo día de negocio, la primera página. Para mirar la
    // forma, no para traer la semana.
    const u = base + '/orders/v2/ordersBulk?businessDate=' + dia + '&pageSize=' + PAGINA_ORDENES + '&page=1';
    const r = await pedir(u, { headers: h });
    if (!r.ok || !Array.isArray(r.cuerpo)) {
      return res.status(200).json({ ok: false, accion: 'orders', businessDate: dia, status: r.status, crudo: recortar(r.cuerpo || r.texto) });
    }
    const sel = lineas(r.cuerpo);
    return res.status(200).json({
      ok: true, accion: 'orders', businessDate: dia, status: r.status,
      ordenes: r.cuerpo.length,
      // Si llega justo a la página entera, hay más ese día. Se dice
      // para que el resumen no se lea como el día completo.
      hayMas: r.cuerpo.length === PAGINA_ORDENES,
      lineas: sel.length,
      campos: resumir(sel),
      muestra: recortar(sel.slice(0, LIMITE_MUESTRA))
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
