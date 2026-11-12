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
// ── El token se guarda mientras dura ─────────────────────────────────
//
// Cada llamada pedía un login nuevo. Al rehacer 90 días con el dinero
// (Axel, 2026-11-12) fueron 64 logins seguidos en pocos minutos y el 65
// volvió con "Toast no aceptó el login", cuando el token que da Toast
// dura 24 horas. Se guarda en la instancia, que Vercel reutiliza
// mientras está caliente, y se usa hasta cinco minutos antes de caducar.
// Va atado a la credencial: otro TOAST_CLIENT_ID u otro host piden el
// suyo. Un login fallido no se guarda.
const MARGEN_MS = 5 * 60 * 1000;
let _token = null;
const claveToken = () => valor('TOAST_CLIENT_ID') + '|' + host();

async function loginGuardado() {
  if (_token && _token.clave === claveToken() && Date.now() < _token.vence) return _token.l;
  const l = await login();
  _token = null;
  const vida = Number(l.expiraEnSegundos) * 1000;
  if (l.ok && vida > MARGEN_MS) _token = { clave: claveToken(), vence: Date.now() + vida - MARGEN_MS, l };
  return l;
}

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

// ── El dinero vendido en un día, por categoría de venta ───────────────
//
// Axel, 2026-11-10: "lo que quiero saber es si somos capaces de traer las
// ventas de licor del día... números, dinero". Hasta aquí todo lo de
// Toast contaba tragos: ni `drinks` ni `sync` llevaban importes.
//
// El precio viene en cada línea de la orden. Se dan tres sumas y no una
// sola cifra, porque cuál es "la venta" depende de con qué informe de
// Toast se compare:
//
//   bruto     preDiscountPrice: antes de descuentos.
//   neto      price: después de descuentos, sin impuesto.
//   impuesto  tax.
//
// Los modificadores con precio (un doble, un upcharge) se enseñan
// APARTE y no se suman a la venta: Toast ya los incluye en el precio de
// la línea. Medido contra su informe del 2026-11-10: el neto da Net sales
// al centavo, y con los modificadores sumados el licor salía $22.50 de
// más.
//
// Una línea sin `price` se cuenta en `sinPrecio` y no como cero vendido:
// si Toast cambiara el nombre de ese campo, saldría todo ahí y no un
// "$0" con cara de dato.
//
// Todas las categorías, no sólo bebida: ver el licor al lado de la comida
// y del total del día es lo que permite comprobarlo contra Toast. Y sólo
// nombres de CATEGORÍA: ni artículos ni texto libre.
function ventasEnDinero(ordenes, categorias, op) {
  op = op || {};
  const anulada = (x) => x && (x.voided || x.deleted);
  const porCat = new Map();
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const nueva = () => ({ lineas: 0, unidades: 0, bruto: 0, neto: 0, impuesto: 0, modificadores: 0, sinPrecio: 0 });
  const total = nueva();
  for (const o of ordenes || []) {
    if (anulada(o)) continue;
    for (const c of (o && o.checks) || []) {
      if (anulada(c)) continue;
      for (const s of (c && c.selections) || []) {
        if (anulada(s)) continue;
        const cg = s.salesCategory && s.salesCategory.guid;
        const cat = (cg && categorias.get(cg)) || '(no sales category)';
        if (op.categoria && !cat.toLowerCase().includes(String(op.categoria).toLowerCase())) continue;
        if (!porCat.has(cat)) porCat.set(cat, nueva());
        const C = porCat.get(cat);
        const q = Number(s.quantity) || 1;
        const neto = num(s.price);
        const bruto = num(s.preDiscountPrice);
        let mods = 0;
        const recorrer = (ms) => {
          for (const m of ms || []) {
            if (anulada(m)) continue;
            mods += num(m.price) || 0;
            recorrer(m.modifiers);
          }
        };
        recorrer(s.modifiers);
        for (const X of [C, total]) {
          X.lineas++; X.unidades += q;
          if (neto === null) X.sinPrecio++;
          X.neto += neto || 0;
          // Sin preDiscountPrice, el bruto es el neto: no hubo descuento
          // que Toast haya dicho.
          X.bruto += bruto !== null ? bruto : (neto || 0);
          X.impuesto += num(s.tax) || 0;
          X.modificadores += mods;
        }
      }
    }
  }
  const c2 = (n) => Math.round(n * 100) / 100;
  const cerrar = (X) => ({ lineas: X.lineas, unidades: c2(X.unidades), bruto: c2(X.bruto),
    descuentos: c2(X.bruto - X.neto), neto: c2(X.neto), impuesto: c2(X.impuesto),
    modificadores: c2(X.modificadores), sinPrecio: X.sinPrecio });
  return {
    porCategoria: [...porCat.entries()].sort((a, b) => b[1].neto - a[1].neto)
      .map(([nombre, X]) => Object.assign({ categoria: nombre }, cerrar(X))),
    total: cerrar(total)
  };
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

// ── Licor: qué artículos de Toast son licor solo ──────────────────────
//
// Para emparejar cada licor de Toast con su botella (src/toast-liquor.js).
// En Toast el licor solo es la MARCA, y la medida la dice el GRUPO, no un
// modificador: "Grey Goose" en DRINKS › Liquor › Vodka › UP/RX, "Titos
// vodka" en … › Vodka › Single, "3oz Maker's Mark" en … › Bourbon + Rye ›
// 3oz. Lo enseñó Drinks en el panel de Toast (2026-11-10).
//
// Entra lo que cuelga de un grupo que se llama exactamente "Liquor". Así
// quedan fuera los cócteles (DRINKS › Cocktails) y lo de Happy Hour
// (HAPPY HOUR › HH Liquor: el "Gin" y el "Vodka" de ahí son tragos de la
// casa con su receta, no una marca). Esos van por receta, aparte.
//
//   tipo    el grupo de debajo de Liquor: Vodka, Gin, Bourbon + Rye…
//   medida  el último grupo, si hay uno por debajo del tipo: Single,
//           UP/RX, 3oz… Cuánto es cada una lo decide la app, no esto.
//   marca   el nombre sin la medida que a veces lleva pegada ("3oz
//           Maker's Mark", "Gin UP/RX"): es lo que se empareja, y una
//           misma marca se vende en varias medidas.
// "DBL" también: así escribe Toast el doble en el nombre ("360 Chocolate
// Vodka DBL", visto en Crown), y sin quitarlo salía como otra marca.
const MEDIDA_EN_NOMBRE = /^\s*\d+(\.\d+)?\s*oz\s+|\s+(up\s*\/\s*rx|single|double|dbl|shot)\s*$/ig;

function licoresDelMenu(menus) {
  const out = new Map();
  const recorrer = (g, ruta, tras) => {
    const r = ruta ? ruta + ' › ' + g.name : g.name;
    // `tras`: los nombres de grupo por debajo de "Liquor", si estamos dentro.
    const debajo = tras ? tras.concat(String(g.name || '').trim()) : (/^liquor$/i.test(String(g.name || '').trim()) ? [] : null);
    if (debajo && debajo.length) {
      for (const it of g.menuItems || []) {
        if (!it.guid || out.has(it.guid)) continue;
        const nombre = String(it.name || '').trim();
        const marca = nombre.replace(MEDIDA_EN_NOMBRE, '').trim() || nombre;
        out.set(it.guid, { guid: it.guid, nombre, grupo: r, tipo: debajo[0],
          medida: debajo.length > 1 ? debajo[debajo.length - 1] : null, marca });
      }
    }
    for (const sub of g.menuGroups || []) recorrer(sub, r, debajo);
  };
  for (const m of menus || []) for (const g of m.menuGroups || []) recorrer(g, m.name, null);
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
// ── Lo vendido de bebida en un día, para guardarlo ──────────────────
//
// Para el inventario en vivo: cada artículo de Toast con sus
// modificadores es una fila, con lo vendido ese día. Se guarda lo que
// dijo Toast, no botellas: la conversión se hace al leer, con
// toast_item_links, para que corregir un emparejamiento corrija también
// la historia.
//
// Sólo bebida. El inventario es de bebida y la comida serían más de la
// mitad de las filas para nada. Qué es bebida lo dice la CATEGORÍA DE
// VENTA de Toast, no el nombre; si las categorías no se pueden leer, no
// se guarda nada (adivinar es peor que no tener el dato).
//
// El texto libre (una línea sin guid, un modificador escrito a mano) no
// se guarda: puede llevar el nombre de un cliente. La línea libre no se
// puede emparejar con nada, así que sólo se cuenta cuántas hubo.
//
// "Banquet Beverage" también entra: es el open bar de un evento ("2 HOUR
// Silver Bar" × 31 personas). Toast no dice qué se sirvió, así que no se
// puede pasar a botellas, pero sin guardarlo no se sabría qué días hubo
// open bar, y esos días el inventario baja sin ventas que lo expliquen.
// "Beverage" a secas son refrescos de máquina y café: fuera.
//
// ── Y el dinero (Axel, 2026-11-12) ───────────────────────────────────
//
// La tarjeta Toast Sales del Home enseña net sales. Cada fila guarda:
//   net             Σ price de sus líneas: después de descuentos, sin
//                   impuesto. ES el Net sales de Toast: medido contra su
//                   informe del 2026-11-10 al centavo (Liquor $749.25,
//                   Wine $537.25, Beer $438.50). null si alguna línea vino
//                   sin precio: un hueco no es $0.
//   mods_price      Σ precio de los modificadores. YA ESTÁN DENTRO de
//                   `price`: sumarlos los cuenta dos veces (el licor de
//                   ese día daba $771.75). Se guarda sólo como detalle de
//                   cuánto del neto vino de recargos; no se suma nunca.
//   sales_category  la categoría de venta (Liquor, Wine…), para partir el
//                   dinero en licor y vino sin adivinar por el nombre.
const BEBIDA = /liquor|spirit|cocktail|wine|beer|banquet bev/i;

function ventasDeBebida(ordenes, categorias, grupoDe) {
  const anulada = (x) => x && (x.voided || x.deleted);
  const filas = new Map();
  const guardadas = new Set(), fuera = new Set();
  let libres = 0;
  for (const o of ordenes || []) {
    if (anulada(o)) continue;
    for (const c of (o && o.checks) || []) {
      if (anulada(c)) continue;
      for (const s of (c && c.selections) || []) {
        if (anulada(s)) continue;
        const cg = s.salesCategory && s.salesCategory.guid;
        const cat = (cg && categorias.get(cg)) || '(no sales category)';
        if (!BEBIDA.test(cat)) { fuera.add(cat); continue; }
        guardadas.add(cat);
        const guid = s.item && s.item.guid;
        if (!guid) { libres++; continue; }
        const mods = [];
        const recorrer = (ms) => {
          for (const m of ms || []) {
            if (anulada(m)) continue;
            if (m.item && m.item.guid) mods.push(String(m.displayName || m.name || '').trim());
            recorrer(m.modifiers);
          }
        };
        recorrer(s.modifiers);
        const firma = mods.filter(Boolean).sort().join(' · ');
        const k = guid + '|' + firma;
        if (!filas.has(k)) {
          filas.set(k, { toast_item_guid: guid, toast_item_name: nombreDe(s),
            toast_group: grupoDe.get(guid) || null, mods: firma, quantity: 0,
            net: 0, mods_price: 0, sales_category: cat });
        }
        const F = filas.get(k);
        F.quantity += Number(s.quantity) || 1;
        const precio = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
        const neto = precio(s.price);
        // Una vez null, null: la fila ya no sabe su neto entero.
        F.net = F.net === null || neto === null ? null : F.net + neto;
        let pm = 0;
        const sumarMods = (ms) => {
          for (const m of ms || []) {
            if (anulada(m)) continue;
            pm += precio(m.price) || 0;
            sumarMods(m.modifiers);
          }
        };
        sumarMods(s.modifiers);
        F.mods_price += pm;
      }
    }
  }
  const orden = (x) => [...x].sort();
  const c2 = (n) => n === null ? null : Math.round(n * 100) / 100;
  for (const F of filas.values()) { F.net = c2(F.net); F.mods_price = c2(F.mods_price); }
  return { filas: [...filas.values()], libres,
    categorias: { guardadas: orden(guardadas), fuera: orden(fuera) } };
}

// El menú y las categorías cambian poco y Toast limita las lecturas del
// menú (de ahí salió el 429 de Wine from Toast). Cargar un año son cientos
// de llamadas seguidas: se guardan unos minutos en la instancia, que
// Vercel reutiliza mientras esté caliente.
const CATALOGO_MS = 10 * 60 * 1000;
let _catalogo = null;

module.exports = async function handler(req, res) {
  try {
    const { action, params } = req.body || {};
    // `ping` sólo necesita las tres primeras: así se puede probar el
    // login antes de tener el GUID.
    const NECESARIAS = ['TOAST_CLIENT_ID', 'TOAST_CLIENT_SECRET', 'TOAST_API_HOST']
      .concat(action === 'ping' ? [] : ['TOAST_RESTAURANT_GUID']);
    const falta = faltanComun(NECESARIAS, /toast/i);
    if (falta) return res.status(200).json(falta);

    const ACCIONES = ['ping', 'restaurant', 'restaurants', 'menu', 'orders', 'drinks', 'wine', 'liquor', 'sales', 'sync'];
    if (!ACCIONES.includes(action)) {
      return res.status(400).json({ ok: false, error: 'Acción desconocida. Usa: ' + ACCIONES.join(', ') });
    }

    // `ping` prueba las credenciales: siempre con un login nuevo.
    const l = action === 'ping' ? await login() : await loginGuardado();
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

    // ── Qué restaurantes abre este login ────────────────────────────
    //
    // Para traer Will's & Bill's (Axel, 2026-11-12): antes de mudar el
    // GUID de Vercel a cada locación hay que saber si estas credenciales
    // abren W&B, y cuál es su GUID. Se pregunta a qué grupo pertenece el
    // restaurante de Vercel (Crown), qué restaurantes tiene ese grupo, y
    // se prueba a leer cada uno con SU GUID en la cabecera: 200 es que el
    // login lo abre; otra cosa se dice tal cual. Sólo lee.
    //
    // Los campos del grupo no los hemos visto todavía en una respuesta de
    // verdad: se aceptan los nombres posibles y, si no aparece el grupo,
    // se devuelve lo que contestó Toast en vez de inventar una lista.
    if (action === 'restaurants') {
      const actual = String(process.env.TOAST_RESTAURANT_GUID).trim();
      const leer = (g) => pedir(base + '/restaurants/v1/restaurants/' + encodeURIComponent(g),
        { headers: { Authorization: 'Bearer ' + l.accessToken, 'Toast-Restaurant-External-ID': g } });
      const nombreDe = (x) => String((x && (x.locationName || x.restaurantName || x.name)) || '').trim() || null;
      const r0 = await leer(actual);
      const g0 = (r0.cuerpo && r0.cuerpo.general) || {};
      const grupo = g0.managementGroupGuid || (r0.cuerpo && (r0.cuerpo.managementGroupGuid || r0.cuerpo.restaurantGroupGuid)) || null;
      if (!r0.ok || !grupo) {
        return res.status(200).json({ ok: false, accion: 'restaurants', paso: 'grupo', status: r0.status,
          error: r0.ok ? 'Toast did not say which restaurant group this one belongs to.' : 'Toast did not answer for the current restaurant.',
          crudo: recortar(r0.cuerpo || r0.texto) });
      }
      const rg = await pedir(base + '/restaurants/v1/groups/' + encodeURIComponent(grupo) + '/restaurants', { headers: h });
      const lista = Array.isArray(rg.cuerpo) ? rg.cuerpo : (rg.cuerpo && Array.isArray(rg.cuerpo.restaurants) ? rg.cuerpo.restaurants : null);
      if (!rg.ok || !lista) {
        return res.status(200).json({ ok: false, accion: 'restaurants', paso: 'lista', grupo, status: rg.status, crudo: recortar(rg.cuerpo || rg.texto) });
      }
      const restaurantes = [];
      for (const x of lista.slice(0, 40)) {
        const g = String((x && (x.restaurantGuid || x.guid)) || '').trim();
        if (!g) continue;
        const r = g === actual ? r0 : await leer(g);
        const gen = (r.cuerpo && r.cuerpo.general) || {};
        restaurantes.push({ guid: g, nombre: nombreDe(gen) || nombreDe(x), acceso: !!r.ok, status: r.status, actual: g === actual });
      }
      return res.status(200).json({ ok: true, accion: 'restaurants', grupo, restaurantes });
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

    // Las páginas de un día entero, con su tope. Lo usan drinks, wine,
    // sales y sync.
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

    // wine y liquor: lo mismo con otro filtro del menú. Las dos alimentan
    // el motor de toast-links.js, que pide primero un día con el menú y
    // después los demás sólo con `guids`.
    if (action === 'wine' || action === 'liquor') {
      const delMenu = action === 'wine' ? vinosDelMenu : licoresDelMenu;
      // Con `guids`, la pantalla ya leyó el menú el primer día y sólo
      // quiere lo vendido de esos artículos: el menú no se vuelve a pedir.
      // Toast limita las lecturas del menú, y pedirlo una vez por cada
      // uno de los siete días le hizo contestar 429.
      let vinos;
      if (Array.isArray(p.guids)) {
        vinos = new Map(p.guids.map(String).map(g => [g, null]));
      } else {
        const rm = await pedir(base + '/menus/v2/menus', { headers: h });
        if (!rm.ok) {
          return res.status(200).json({ ok: false, accion: action, paso: 'menu', status: rm.status, crudo: recortar(rm.cuerpo || rm.texto) });
        }
        vinos = delMenu((rm.cuerpo && rm.cuerpo.menus) || []);
      }
      const d = await ordenesDelDia();
      if (!d.ok) {
        return res.status(200).json({ ok: false, accion: action, paso: 'orders', businessDate: dia, pagina: d.pagina, status: d.status, crudo: d.crudo });
      }
      return res.status(200).json({
        ok: true, accion: action, businessDate: dia,
        // El restaurante del que sale esto: la pantalla lo compara con el
        // de la locación abierta, para no emparejar el vino de Crown con
        // el inventario de otra.
        restaurante: String(process.env.TOAST_RESTAURANT_GUID || '').trim(),
        diaCompleto: d.completo,
        articulos: [...vinos.values()].filter(Boolean),
        vendido: vendidoPorGuid(d.ordenes, new Set(vinos.keys()))
      });
    }

    if (action === 'sync') {
      // La única acción que escribe en la base, y sólo en toast_sales y
      // toast_sales_days, con la llave de servicio: así el correo de la
      // mañana podrá cargar ventas sin que nadie abra la app.
      const loc = String(p.locationId || '');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(loc)) {
        return res.status(200).json({ ok: false, accion: 'sync', paso: 'location', error: 'Location id missing or malformed.' });
      }
      const sbUrl = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '') + '/rest/v1/';
      const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const sbH = (extra) => Object.assign({ apikey: llave, Authorization: 'Bearer ' + llave,
        'Content-Type': 'application/json' }, extra || {});
      const sb = (ruta, op) => pedirComun(sbUrl + ruta, op, 'Supabase');
      const fecha = dia.slice(0, 4) + '-' + dia.slice(4, 6) + '-' + dia.slice(6, 8);

      // Los datos de Toast son de UN restaurante (el de Vercel). Guardarlos
      // en otra locación sería mezclar las ventas de Crown con el
      // inventario de otra.
      const rl = await sb('locations?id=eq.' + loc + '&select=toast_restaurant_guid', { headers: sbH() });
      if (!rl.ok || !Array.isArray(rl.cuerpo)) {
        return res.status(200).json({ ok: false, accion: 'sync', paso: 'location', status: rl.status, crudo: recortar(rl.cuerpo || rl.texto) });
      }
      const guidLoc = String(((rl.cuerpo[0] || {}).toast_restaurant_guid) || '').trim();
      const restaurante = String(process.env.TOAST_RESTAURANT_GUID || '').trim();
      if (!guidLoc || guidLoc !== restaurante) {
        return res.status(200).json({ ok: false, accion: 'sync', paso: 'location',
          error: guidLoc ? 'This location belongs to another Toast restaurant.' : "This location isn't linked to a Toast restaurant." });
      }

      if (!_catalogo || Date.now() - _catalogo.en > CATALOGO_MS) {
        const [rc, rm] = await Promise.all([
          pedir(base + '/config/v2/salesCategories', { headers: h }),
          pedir(base + '/menus/v2/menus', { headers: h })
        ]);
        if (!rc.ok || !Array.isArray(rc.cuerpo)) {
          return res.status(200).json({ ok: false, accion: 'sync', paso: 'categorias', status: rc.status, crudo: recortar(rc.cuerpo || rc.texto) });
        }
        if (!rm.ok) {
          return res.status(200).json({ ok: false, accion: 'sync', paso: 'menu', status: rm.status, crudo: recortar(rm.cuerpo || rm.texto) });
        }
        _catalogo = { en: Date.now(),
          categorias: new Map(rc.cuerpo.map(c => [c.guid, c.name])),
          grupoDe: gruposDelMenu((rm.cuerpo && rm.cuerpo.menus) || []) };
      }

      const d = await ordenesDelDia();
      if (!d.ok) {
        return res.status(200).json({ ok: false, accion: 'sync', paso: 'orders', businessDate: dia, pagina: d.pagina, status: d.status, crudo: d.crudo });
      }
      const v = ventasDeBebida(d.ordenes, _catalogo.categorias, _catalogo.grupoDe);
      const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, '');
      // Las órdenes que valen: una anulada no es una venta.
      const validas = d.ordenes.filter(o => !(o && (o.voided || o.deleted))).length;
      const elDia = (completo) => ({ location_id: loc, business_date: fecha, orders: validas,
        complete: completo, closed: dia < hoy, fetched_at: new Date().toISOString() });
      const marcar = (completo) => sb('toast_sales_days?on_conflict=location_id,business_date', {
        method: 'POST', headers: sbH({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(elDia(completo)) });
      const fallo = (paso, r) => res.status(200).json({ ok: false, accion: 'sync', paso, businessDate: dia, status: r.status, crudo: recortar(r.cuerpo || r.texto) });

      // Primero el día queda incompleto, luego se borra y se escribe, y
      // sólo al final se marca completo. Si algo falla a medias, el día
      // se ve incompleto y se vuelve a cargar; nunca queda a medias con
      // cara de entero. Se borra en vez de actualizar porque una orden
      // anulada después ya no viene, y un upsert la dejaría guardada.
      let r = await marcar(false);
      if (!r.ok) return fallo('days', r);
      r = await sb('toast_sales?location_id=eq.' + loc + '&business_date=eq.' + fecha, { method: 'DELETE', headers: sbH() });
      if (!r.ok) return fallo('delete', r);
      // Sin la migración 034 PostgREST no conoce las columnas del dinero
      // y rechaza el insert entero. Las ventas alimentan el LIVE y no
      // pueden dejar de cargarse por eso: se reintenta sin el dinero y se
      // dice. Sólo ante ESE error (la columna que falta), no ante
      // cualquiera: un fallo de otra cosa se cuenta tal cual.
      let dinero = true;
      if (v.filas.length) {
        const insertar = (filas) => sb('toast_sales', { method: 'POST', headers: sbH({ Prefer: 'return=minimal' }),
          body: JSON.stringify(filas.map(f => Object.assign({ location_id: loc, business_date: fecha }, f))) });
        r = await insertar(v.filas);
        const sinColumna = !r.ok && /PGRST204|Could not find the '(net|mods_price|sales_category)' column/.test(JSON.stringify(r.cuerpo || r.texto || ''));
        if (sinColumna) {
          dinero = false;
          r = await insertar(v.filas.map(({ net, mods_price, sales_category, ...resto }) => resto));
        }
        if (!r.ok) return fallo('insert', r);
      }
      r = await marcar(d.completo);
      if (!r.ok) return fallo('days', r);

      return res.status(200).json({ ok: true, accion: 'sync', businessDate: dia,
        ordenes: validas, diaCompleto: d.completo, cerrado: dia < hoy,
        filas: v.filas.length, libres: v.libres, categorias: v.categorias, dinero,
        aviso: dinero ? undefined : 'Sales saved without money: toast_sales has no net/mods_price/sales_category columns (migration 034).' });
    }

    // sales: el dinero del día por categoría de venta. Sólo lee. No pide
    // el menú: no hacen falta los artículos, y Toast limita esas lecturas.
    if (action === 'sales') {
      const rc = await pedir(base + '/config/v2/salesCategories', { headers: h });
      const categorias = new Map((Array.isArray(rc.cuerpo) ? rc.cuerpo : []).map(c => [c.guid, c.name]));
      const d = await ordenesDelDia();
      if (!d.ok) {
        return res.status(200).json({ ok: false, accion: 'sales', businessDate: dia, pagina: d.pagina, status: d.status, crudo: d.crudo });
      }
      const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, '');
      const cat = typeof p.categoria === 'string' ? p.categoria.slice(0, 40) : '';
      return res.status(200).json({
        ok: true, accion: 'sales', businessDate: dia,
        ordenes: d.ordenes.length,
        // Si se llegó al tope de páginas, el día NO está entero: lo que
        // sale no es el total. Y un día sin cerrar sigue creciendo.
        diaCompleto: d.completo,
        cerrado: dia < hoy,
        categoriasDeVenta: rc.ok ? categorias.size : 'no se pudieron leer (HTTP ' + rc.status + ')',
        ...ventasEnDinero(d.ordenes, categorias, { categoria: cat || null })
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

// Para las pruebas: el catálogo guardado haría que un fallo de Toast en
// las categorías no se viera, porque ya no se le preguntaría.
module.exports._olvidarCatalogo = () => { _catalogo = null; };
module.exports._olvidarToken = () => { _token = null; };
