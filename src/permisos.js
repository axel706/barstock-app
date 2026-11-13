// ── Roles y permisos ─────────────────────────────────────────────────
//
// Axel, 2026-11-13, sobre lámina (3A): roles (Owner, Manager, Bartender
// y los que él cree), cada uno con su lista de permisos, y por persona
// las excepciones: "aun cuando tengan el rol de manager pueda yo quitarle
// acceso a ciertas funciones". El mismo rol en todas sus locaciones.
//
// El catálogo y la cuenta de "qué puede esta persona" viven AQUÍ, una
// vez, para el navegador (window.BarStockPermisos) y para el servidor
// (require en api/admin.js y lib/integracion.js), como bartender-id.js.
// Si cada lado lo calculara por su cuenta, acabarían diciendo cosas
// distintas.
//
// Dónde vive cada cosa:
//   · La definición de cada rol (sus permisos): tabla `roles`
//     (migración 039). Owner no está ahí: tiene todo y no se edita.
//   · De cada persona, en app_metadata (sólo lo escribe el servidor):
//     `role` (la clave del rol), `off` (lo que se le quitó) y `perms`
//     (lo que puede, ya calculado con efectivos()). Va dentro de su
//     sesión: la app lo sabe al instante, sin preguntar.
//
// Lo que esto garantiza, y lo que no (hablado con Axel el 2026-11-13):
// un permiso apagado ESCONDE sus botones. Lo niega el servidor en lo que
// pasa por él (personas y roles, sync, mandar correos). Y quien no puede
// hacer nada más que recetas lleva el candado de guest.js, como el
// bartender de siempre. Un candado por permiso en la base es la Fase 0.
(function (raiz) {
  // El orden es el de la pantalla. `ver`: el bloque See; si no, Do.
  const CATALOGO = [
    { k: 'ver_dinero',       ver: true, n: 'Money',                        d: 'Costs, prices, sales in $' },
    { k: 'ver_ordenes',      ver: true, n: 'Orders and invoices' },
    { k: 'ver_ajustes',      ver: true, n: 'Settings' },
    { k: 'contar',                      n: 'Count inventory' },
    { k: 'cerrar_ciclo',                n: 'Close the count, restart the cycle' },
    { k: 'editar_productos',            n: 'Edit items',                   d: 'Name, par, price, delete' },
    { k: 'ordenes',                     n: 'Make and send orders' },
    { k: 'facturas',                    n: 'Link invoices',                d: 'And apply their prices' },
    { k: 'recetas',                     n: 'Recipes' },
    { k: 'toast',                       n: 'Pours and Toast matching' },
    { k: 'sincronizar',                 n: 'Sync Toast and MarginEdge' },
    { k: 'ajustes_locacion',            n: 'Location settings',            d: 'Sender, emails, delivery, zones' },
    { k: 'time_machine',                n: 'Restore from Time Machine' },
    { k: 'personas',                    n: 'People and roles' }
  ];
  const TODOS = CATALOGO.map(p => p.k);

  // Los roles de fábrica. Owner no se guarda ni se edita. Manager y
  // Bartender se guardan en `roles` y Axel los puede cambiar; esto es con
  // lo que nacen (y lo que vale si la tabla no se pudo leer).
  //   · Manager: todo, menos lo que toca la locación entera o a la gente.
  //   · Bartender: lo de 2026-11-12, "ve todo, sólo edita recetas".
  const FABRICA = {
    owner:     { key: 'owner',     name: 'Owner',     perms: TODOS.slice(), fijo: true },
    manager:   { key: 'manager',   name: 'Manager',
                 perms: TODOS.filter(k => ['ajustes_locacion', 'time_machine', 'personas'].indexOf(k) < 0) },
    bartender: { key: 'bartender', name: 'Bartender', perms: ['ver_dinero', 'ver_ordenes', 'ver_ajustes', 'recetas'] }
  };

  const limpia = (xs) => Array.isArray(xs) ? xs.filter(k => TODOS.indexOf(k) >= 0) : [];

  // La definición de un rol: la guardada si existe, si no la de fábrica.
  // Owner siempre la de fábrica.
  function rol(key, roles) {
    if (key === 'owner') return FABRICA.owner;
    const g = (roles || []).find(r => r && r.key === key);
    if (g) return { key: g.key, name: g.name, perms: limpia(g.perms) };
    return FABRICA[key] || null;
  }

  // Lo que puede una persona: los permisos de su rol menos los quitados.
  // Un rol que ya no existe no da nada: mejor sin permisos que con todos.
  function efectivos(key, roles, off) {
    if (key === 'owner') return TODOS.slice();
    const r = rol(key, roles);
    if (!r) return [];
    const quitados = limpia(off);
    return r.perms.filter(k => quitados.indexOf(k) < 0);
  }

  // Los permisos de un usuario de Supabase, leídos de su app_metadata.
  //   · Con `perms` (escrito por el servidor): esos.
  //   · Bartender de antes de los roles (sólo role = 'bartender'): los
  //     de fábrica del bartender, que es lo que tenía.
  //   · Sin rol, o con uno que no salió de aquí (sin `perms` y que no es
  //     de fábrica, como un 'staff' viejo): un usuario de los de siempre.
  //     Todo, como hasta hoy: no se le quita nada a nadie por actualizar
  //     la app. Con [] se quedaba bajo el candado de sólo recetas.
  function deUsuario(u) {
    const m = (u && u.app_metadata) || {};
    if (Array.isArray(m.perms)) return limpia(m.perms);
    if (m.role === 'bartender') return FABRICA.bartender.perms.slice();
    if (m.role && FABRICA[m.role]) return efectivos(m.role, null, m.off);
    return TODOS.slice();
  }

  // ¿Es una persona de PIN, de las que maneja Settings › People? Con
  // permisos calculados por el servidor, o con un rol de fábrica (el
  // bartender de antes de los roles). Un usuario de correo con un rol
  // viejo ('staff') NO: no se lista, no se edita ni se borra desde
  // People, y la app lo trata como siempre. La misma regla en la app y
  // en el servidor.
  function dePin(u) {
    const m = (u && u.app_metadata) || {};
    return !!m.role && (Array.isArray(m.perms) || !!FABRICA[m.role]);
  }

  // ¿Sólo puede leer y escribir recetas? Entonces lleva el candado de
  // guest.js: es la única regla que se puede cumplir de verdad en la app,
  // porque las recetas tienen sus propias tablas.
  function soloRecetas(perms) {
    const hacer = limpia(perms).filter(k => !CATALOGO.find(p => p.k === k).ver);
    return hacer.every(k => k === 'recetas');
  }

  // Una clave para un rol nuevo, sacada de su nombre: "Bar Lead" →
  // "bar_lead". Las de fábrica no se pueden usar.
  function claveDe(nombre) {
    const c = String(nombre == null ? '' : nombre).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
    return c;
  }

  const api = { CATALOGO, TODOS, FABRICA, rol, efectivos, deUsuario, dePin, soloRecetas, claveDe, limpia };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.BarStockPermisos = api;
})(typeof window !== 'undefined' ? window : this);
