(() => {
  if (window.BarStockToastPours) return;
  // ── Los pours de cada restaurante ────────────────────────────────────
  //
  // Axel, 2026-11-13: "necesito que los restaurantes puedan configurar
  // sus pours, pueden ser distintos entre restaurante". Opción A sobre
  // lámina: Settings › Toast › Pours (mobile-toast-pours.js), una fila
  // por cada medida que ESA locación usa en Toast, con sus onzas.
  //
  // Antes era una tabla fija en toast-liquor.js, igual para todos, y la
  // medida se guardaba en cada licor al emparejarlo (pour_oz). Axel eligió
  // que cambiar una medida recalcule TODO, también lo ya emparejado: por
  // eso el cálculo (toast-usage.js) la lee de aquí al momento, por la
  // medida del grupo de Toast, y pour_oz queda sólo de reserva.
  //
  // Guardado en location_settings.pours (migración 037), sólo lo que la
  // locación cambió o añadió. Lo que no está sale de las de siempre.

  // Las de siempre: la hoja de Axel (2026-11-11, "House pours"): Single
  // 1.5, Double 2.5, Rocks 3, Up 3, Shot 1.5; en Toast el grupo se llama
  // "UP/RX" (Up o Rocks). "Mix" no estaba en la hoja: "1.5 en el mix".
  const DEFECTO = { single: 1.5, double: 2.5, 'up/rx': 3, up: 3, rx: 3, rocks: 3, shot: 1.5, mix: 1.5 };

  // La medida de Toast, como clave: "UP/RX", "Up/Rx" y "up / rx" son la
  // misma.
  const clave = (medida) => String(medida == null ? '' : medida).toLowerCase().replace(/\s+/g, '');

  // "2oz", "3 oz", "1.5oz": la medida dice sus onzas en el nombre.
  function enNombre(medida) {
    const n = /^(\d+(?:\.\d+)?)oz$/.exec(clave(medida));
    return n ? Number(n[1]) : undefined;
  }

  let _propias = {};          // lo que la locación cambió o añadió
  let _cargado = null;        // promesa de la lectura en curso

  // Las onzas de una medida, o undefined si no se sabe. Una medida sin
  // onzas no se adivina: vacío sería "una botella entera".
  function ozDe(medida) {
    if (medida == null) return undefined;
    const k = clave(medida);
    if (!k) return undefined;
    if (Object.prototype.hasOwnProperty.call(_propias, k)) {
      const v = Number(_propias[k]);
      return v > 0 ? v : undefined;
    }
    if (Object.prototype.hasOwnProperty.call(DEFECTO, k)) return DEFECTO[k];
    return enNombre(medida);
  }

  // La medida de un grupo de Toast guardado como ruta ("DRINKS › Liquor ›
  // Vodka › UP/RX" → "UP/RX"). Es la regla de lib/toast.js
  // (licoresDelMenu), que la saca recorriendo el menú: lo que cuelga de un
  // grupo "Liquor" exacto; el primero de debajo es el tipo, y el último,
  // si hay más de uno, la medida. Aquí sobre la ruta ya escrita, que es lo
  // que guardan toast_item_links y toast_sales.
  function medidaDeGrupo(grupo) {
    const partes = String(grupo || '').split('›').map(x => x.trim()).filter(Boolean);
    const i = partes.findIndex(x => /^liquor$/i.test(x));
    if (i < 0) return null;
    const debajo = partes.slice(i + 1);
    return debajo.length > 1 ? debajo[debajo.length - 1] : null;
  }

  const cfg = () => window.BARSTOCK_CONFIG || {};
  const H = () => ({ apikey: cfg().SUPABASE_KEY, Authorization: 'Bearer ' + cfg().SUPABASE_KEY });
  const locacion = () => window.BarStockInventoryCloud.fetchLocationId();

  // Una sola lectura a la vez; `forzar` para volver a pedirla (al entrar
  // a la pantalla, por si se cambió en otro teléfono).
  function cargar(forzar) {
    if (_cargado && !forzar) return _cargado;
    _cargado = (async () => {
      const loc = await locacion();
      const r = await fetch(cfg().SUPABASE_URL + '/rest/v1/location_settings?location_id=eq.' + loc + '&select=pours', { headers: H() });
      const t = await r.text();
      if (!r.ok) {
        _cargado = null;
        // Sólo si dice que falta ESA columna, cuál es la migración.
        if (/PGRST204|42703/.test(t) && /pours/.test(t)) throw new Error('The pours column is not in the database yet: run migration 037. (' + t.slice(0, 160) + ')');
        throw new Error('Supabase answered ' + r.status + ': ' + t.slice(0, 200));
      }
      let filas = [];
      try { filas = JSON.parse(t) || []; } catch (e) { filas = []; }
      const p = filas[0] && filas[0].pours;
      _propias = p && typeof p === 'object' ? Object.assign({}, p) : {};
      return todas();
    })();
    return _cargado;
  }

  // Guarda las onzas de estas medidas ({ "Single": 1.5, "Neat": 2 }).
  // Sólo la columna pours: location_settings tiene más (reply-to, listas
  // de correo) y saveSettings() las mandaría todas.
  async function guardar(cambios) {
    const nuevas = Object.assign({}, _propias);
    for (const [m, oz] of Object.entries(cambios || {})) {
      const n = Math.round(Number(oz) * 100) / 100;
      if (!(n > 0) || n > 12) throw new Error('A pour has to be more than 0 and at most 12 oz (' + m + ').');
      // Igual que la de siempre: no se guarda, para que siga a la de
      // siempre si algún día cambia.
      if (DEFECTO[clave(m)] === n && !Object.prototype.hasOwnProperty.call(_propias, clave(m))) continue;
      nuevas[clave(m)] = n;
    }
    const loc = await locacion();
    const r = await fetch(cfg().SUPABASE_URL + '/rest/v1/location_settings?on_conflict=location_id', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, H()),
      body: JSON.stringify([{ location_id: loc, pours: nuevas, updated_at: new Date().toISOString() }])
    });
    if (!r.ok) {
      const t = await r.text();
      if (/PGRST204|42703/.test(t) && /pours/.test(t)) throw new Error('The pours column is not in the database yet: run migration 037. (' + t.slice(0, 160) + ')');
      throw new Error('Supabase answered ' + r.status + ': ' + t.slice(0, 200));
    }
    _propias = nuevas;
    _cargado = Promise.resolve(todas());
    escuchas.forEach(fn => { try { fn(); } catch (e) {} });
    return true;
  }

  // Todas las que se saben, para enseñar: { clave: oz }.
  function todas() { return Object.assign({}, DEFECTO, _propias); }

  // Quien enseña o calcula con ellas se entera de un cambio.
  const escuchas = new Set();
  function alCambiar(fn) { escuchas.add(fn); return () => escuchas.delete(fn); }

  window.BarStockToastPours = { DEFECTO, clave, ozDe, enNombre, medidaDeGrupo, cargar, guardar, todas, alCambiar,
    _reset: () => { _propias = {}; _cargado = null; } };
})();
