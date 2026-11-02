/* ── ¿Existe este producto, y si existe por qué no lo veo? ───────────
 *
 * SÓLO LECTURA. Hace GETs y escribe en la consola. No toca nada.
 *
 *   1. Abre app.barstockpro.com en la locación.
 *   2. Consola del navegador.
 *   3. Pega este archivo entero y Enter.
 *   4. await bsExiste('baileys')
 *
 * Busca en la NUBE, no en lo que la pantalla tenga cargado, y para
 * cada coincidencia dice si está dormido, si lo esconde un filtro, o
 * si de verdad no está.
 */
(() => {
  const c = window.BARSTOCK_CONFIG || {};
  const H = { apikey: c.SUPABASE_KEY, Authorization: 'Bearer ' + c.SUPABASE_KEY };
  const norm = (s) => typeof window.normalizeName === 'function'
    ? window.normalizeName(s || '') : String(s || '').trim().toLowerCase();

  async function leer(ruta) {
    let todo = [], p = 0;
    for (;;) {
      const r = await fetch(`${c.SUPABASE_URL}/rest/v1/${ruta}&limit=1000&offset=${p * 1000}`,
        { headers: H });
      if (!r.ok) throw new Error(await r.text());
      const t = await r.json();
      if (!Array.isArray(t) || !t.length) break;
      todo = todo.concat(t);
      if (t.length < 1000) break;
      p++;
    }
    return todo;
  }

  window.bsExiste = async function (texto) {
    const locId = await window.BarStockParIntelligence.fetchLocationId();
    const filas = await leer(
      `inventory_items?location_id=eq.${locId}` +
      `&select=code,item_name,vendor,on_hand,suggested,value&order=item_name.asc`);

    console.log('%cEn la nube hay ' + filas.length + ' productos en esta locación.',
      'font-weight:bold');

    const t = norm(texto);
    const hits = filas.filter(r => norm(r.item_name).includes(t) ||
                                   String(r.code || '').toLowerCase().includes(String(texto).toLowerCase()));

    if (!hits.length) {
      console.log('%c✗ NO está en la base. Esto sí sería una pérdida de datos.',
        'color:#f87171;font-weight:bold');
      console.log('Dímelo y lo miramos: hay respaldos en inventory_backups.');
      return;
    }

    console.log('%c✓ SÍ está en la base — ' + hits.length + ' coincidencia(s).',
      'color:#4ade80;font-weight:bold');
    console.table(hits.map(r => ({
      nombre: r.item_name, codigo: r.code || '—', proveedor: r.vendor || '—',
      on_hand: r.on_hand, par: r.suggested, precio: r.value
    })));

    // Por qué no se ve. Mismo criterio que la pantalla.
    const D = window.BarStockDormant;
    if (D && D.cargar) { try { await D.cargar(); } catch (e) {} }

    for (const r of hits) {
      const fila = {
        item: r.item_name, onHand: Number(r.on_hand) || 0,
        suggested: Number(r.suggested) || 0, vendor: r.vendor
      };
      const dormido = !!(D && D.estaQuieto && D.estaQuieto(fila));
      const sinProveedor = !r.vendor || String(r.vendor).toUpperCase() === 'UNKNOWN';

      console.log('%c— ' + r.item_name, 'font-weight:bold');
      console.log('   en Inventory: ' +
        (dormido
          ? 'OCULTO por dormido (sin stock, sin par y quieto). ' +
            'Para verlo: botón de filtros → el interruptor de dormidos.'
          : 'visible'));
      console.log('   en el conteo: ' +
        (dormido || sinProveedor
          ? 'NO entra en el total' +
            (sinProveedor ? ' (sin proveedor)' : '') +
            (dormido ? ' (dormido)' : '')
          : 'sí entra'));
    }

    console.log('\nSi dice OCULTO, el producto está entero y no se perdió nada: ' +
      'sólo hay que darle proveedor y par para que vuelva a la lista.');
  };

  console.log('%cListo. Ahora:  await bsExiste(\'baileys\')',
    'font-weight:bold;color:#4ade80');
})();
