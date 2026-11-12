// ── El nombre de un bartender, y su correo de mentira ────────────────
//
// Axel, 2026-11-12: "quiero que sean usuarios y un PIN que yo les doy,
// ejemplo Billie y el PIN 324324". Supabase sólo sabe de correo y
// contraseña, así que Billie ES un usuario de Supabase: su correo se
// saca de su nombre (billie@bartenders.barstockpro.com, nadie lo ve ni
// le llega nada: se crea ya confirmado) y su contraseña es el PIN.
//
// La misma cuenta en DOS sitios: el login del teléfono (con el nombre
// que teclea Billie) y api/admin.js (al crearlo). Si las dos no dijeran
// lo mismo, Billie no podría entrar nunca. Por eso vive aquí, una vez,
// y sirve a los dos: en el navegador cuelga de window y en el servidor
// se carga con require.
(function (raiz) {
  const DOMINIO = 'bartenders.barstockpro.com';

  // "Billie" → "billie", "Mary Jo" → "maryjo", "José" → "jose". Sin
  // mayúsculas ni espacios: Billie no tiene que acordarse de cómo lo
  // escribió Axel.
  function clave(nombre) {
    return String(nombre == null ? '' : nombre)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function correo(nombre) {
    const c = clave(nombre);
    return c ? c + '@' + DOMINIO : '';
  }

  // Exactamente seis dígitos: Supabase no acepta contraseñas de menos de
  // seis, y el teclado del login tiene seis casillas.
  function pinValido(pin) { return /^\d{6}$/.test(String(pin == null ? '' : pin)); }

  // Un nombre que se pueda teclear y que dé una clave.
  function nombreValido(nombre) {
    const n = String(nombre == null ? '' : nombre).trim();
    return n.length >= 1 && n.length <= 30 && clave(n).length >= 1;
  }

  const api = { DOMINIO, clave, correo, pinValido, nombreValido, ROL: 'bartender' };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.BarStockBartenderId = api;
})(typeof window !== 'undefined' ? window : this);
