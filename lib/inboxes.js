// ── A dónde va cada correo ───────────────────────────────────────────
//
// Un solo sitio con las direcciones. Estaban repartidas por seis
// archivos, cada uno con la misma cadena escrita a mano, y cambiar de
// buzón era buscarlas todas y confiar en no dejarse ninguna.
//
// ── Alias, no cuentas ────────────────────────────────────────────────
//
// hello@ y alerts@ son alias que caen en el mismo buzón real. Los alias
// son gratis en cualquier proveedor y las cuentas se pagan por usuario,
// así que separar por dirección no cuesta nada.
//
// Y separar sirve para algo más que ordenar la bandeja: la dirección es
// el enrutador. El día que alguien más lleve las ventas, se redirige
// hello@ a esa persona desde el panel del proveedor, sin tocar código ni
// desplegar nada. Con todo cayendo en una sola dirección, ese cambio
// sería un commit.
//
// ── Lo que NO está aquí ──────────────────────────────────────────────
//
// El correo de ADMIN. `src/config.js`, `api/admin.js` y `api/backup.js`
// guardan axeltorressalgado@icloud.com, y eso no es un buzón: es una
// IDENTIDAD. `auth.js` la compara contra el correo de la sesión de
// Supabase para decidir quién ve la pestaña de Admin. Cambiarla aquí sin
// cambiar antes el correo del usuario en Supabase Auth dejaría a Axel
// fuera de su propio panel. Son dos cosas distintas y viven separadas a
// propósito.

module.exports = {
  // Lo que ve gente de fuera. Firma el acuse del formulario y recibe las
  // respuestas, así que la conversación queda en un solo hilo: te
  // escriben a la misma dirección desde la que les contestaste.
  LEADS: 'hello@barstockpro.com',

  // Ruido de operación: inicios de sesión y solicitudes de acceso. Los
  // inicios de sesión llegan en cada entrada, y un lead sepultado bajo
  // cuarenta avisos de login es un lead perdido.
  ALERTS: 'alerts@barstockpro.com',

  // El remitente de todo lo automático. Resend verifica el DOMINIO, no
  // cada dirección, así que cualquier buzón de barstockpro.com puede
  // firmar sin configurar nada.
  NOREPLY: 'BarStock Pro <noreply@barstockpro.com>',

  // El remitente de lo que espera respuesta.
  HELLO: 'BarStock Pro <hello@barstockpro.com>'
};
