(() => {
  if (window.BarStockToastPanel) return;

  // ── Toast · Developer tools ──────────────────────────────────────────
  //
  // Axel (2026-11-10): "¿la única forma de probarlo es en consola?". Lo
  // era. Las ventas del día en dinero y cómo cuenta Toast los tragos sólo
  // se podían ver pegando tools/toast.js en la consola del ordenador. Y
  // para ligar las recetas de los cócteles hay que ver cómo llama Toast
  // a cada artículo y a cada modificador, y él lo quiso "desde la app",
  // que es desde el teléfono.
  //
  // Es el mismo patrón que el panel de TripleSeat: un plegable en
  // Settings → Connections, botones que preguntan y un resultado que se
  // puede copiar. La llamada y el copiar son de dev-panel.js.
  //
  // ── Sólo lee ──────────────────────────────────────────────────────
  //
  // Las acciones salen de la lista de abajo, y `sync` —la única de Toast
  // que escribe, en toast_sales— no está. `correr` no acepta ninguna que
  // no esté en la lista, aunque se la pidan a mano.
  //
  // Toast está ligado a un solo restaurante (Crown, por variable de
  // entorno): da igual la locación que esté abierta en la app.

  const ACCIONES = [
    { id: 'ping',   nombre: 'Ping',   nota: 'Does the login work' },
    { id: 'sales',  nombre: 'Sales',  nota: 'Money by category, uses Date' },
    { id: 'drinks', nombre: 'Drinks', nota: 'Items and modifiers, uses Date' }
  ];

  const D = () => window.BarStockDevPanel;
  const esc = (s) => (D() ? D().esc(s) : String(s == null ? '' : s));
  const $ = id => document.getElementById(id);

  // La fecha local, no la de toISOString: a las 9 de la noche en Nueva
  // York, UTC ya es mañana y "hoy" saldría corrido un día.
  function dia(d) {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function params(action) {
    const p = {};
    if (action === 'ping') return p;
    // Toast quiere el día de negocio como AAAAMMDD.
    const f = (($('tpFecha') || {}).value || '').replace(/-/g, '');
    if (/^\d{8}$/.test(f)) p.businessDate = f;
    const c = (($('tpCategoria') || {}).value || '').trim();
    if (c) p.categoria = c;
    return p;
  }

  // ── Copiar ────────────────────────────────────────────────────────
  //
  // Lo copiable se arma aparte, de una lista cerrada de claves: si la
  // función devolviera mañana un campo nuevo, no entra en lo copiado sin
  // que alguien lo decida. Es la regla que salió del panel de TripleSeat
  // después de enseñar descripciones enteras de eventos, con nombres de
  // clientes. Aquí lo que llega ya viene sin texto libre (lib/toast.js),
  // pero la lista no depende de eso.
  let seguro = null;
  const SEGUROS_OK = ['accion', 'businessDate', 'ordenes', 'diaCompleto', 'cerrado', 'categoriasDeVenta',
    'porCategoria', 'total', 'restaurante', 'expiraEnSegundos'];
  const SEGUROS_MAL = ['accion', 'businessDate', 'paso', 'pagina', 'status', 'error', 'diagnostico'];

  function armarSeguro(res) {
    const out = {};
    for (const k of (res && res.ok ? SEGUROS_OK : SEGUROS_MAL)) {
      if (res && res[k] !== undefined && res[k] !== null) out[k] = res[k];
    }
    return out;
  }

  async function alCopiar(b) {
    if (!seguro || !D()) return;
    const ok = await D().copiar(JSON.stringify(seguro, null, 2));
    const antes = b.dataset.texto || b.textContent;
    b.dataset.texto = antes;
    b.textContent = ok ? 'Copied' : 'Could not copy';
    setTimeout(() => { b.textContent = antes; }, 1500);
  }

  const botonCopiar = (texto) =>
    '<button type="button" class="ts-copiar" data-copiar="todo">' + esc(texto || 'Copy results') + '</button>';

  const dinero = (n) => (typeof n === 'number' && isFinite(n)
    ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '—');
  const num = (n) => (typeof n === 'number' && isFinite(n) ? n.toLocaleString('en-US') : '—');

  function fechaLegible(d) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(d || ''));
    return m ? m[2] + '/' + m[3] + '/' + m[1] : String(d || '');
  }

  // ── Sales ─────────────────────────────────────────────────────────
  //
  // Los avisos van ARRIBA de la tabla y no debajo: un número a medias
  // (el día sin cerrar, el día sin leer entero, líneas sin precio) no
  // puede leerse como el total antes de haber visto que no lo es.
  function pintarVentas(res) {
    const cats = res.porCategoria || [];
    const t = res.total || {};
    const avisos = [];
    if (res.diaCompleto === false) avisos.push('This is not the full day: there were more orders than could be read.');
    if (t.sinPrecio) avisos.push(t.sinPrecio + ' line' + (t.sinPrecio === 1 ? '' : 's') + ' came without a price and ' + (t.sinPrecio === 1 ? 'is' : 'are') + ' not added in.');
    if (res.cerrado === false) avisos.push('The day is still open: this is what has sold so far.');
    if (typeof res.categoriasDeVenta === 'string') avisos.push('Sales categories: ' + res.categoriasDeVenta + '.');

    const fila = (c, total) =>
      '<tr' + (total ? ' class="tp-total"' : '') + '><td>' + esc(total ? 'Total' : c.categoria) + '</td>' +
      '<td>' + num(c.unidades) + '</td><td>' + dinero(c.bruto) + '</td><td>' + dinero(c.descuentos) + '</td>' +
      '<td><b>' + dinero(c.neto) + '</b></td><td>' + dinero(c.impuesto) + '</td><td>' + dinero(c.modificadores) + '</td></tr>';

    return (avisos.length ? '<div class="tp-avisos">' + avisos.map(a => '<div>' + esc(a) + '</div>').join('') + '</div>' : '') +
      (cats.length
        ? '<div class="tp-rueda"><table class="tp-tabla"><thead><tr><th>Category</th><th>Units</th><th>Gross</th>' +
          '<th>Discounts</th><th>Net</th><th>Tax</th><th>Modifiers</th></tr></thead>' +
          '<tbody>' + cats.map(c => fila(c, false)).join('') + '</tbody>' +
          '<tfoot>' + fila(t, true) + '</tfoot></table></div>' +
          '<div class="small muted tp-pie">Net is after discounts, before tax. Modifiers with a price are shown apart: ' +
          'compare Net with Toast’s own sales report to see whether it already includes them.</div>'
        : '<div class="small muted">Nothing sold in that selection.</div>');
  }

  // ── Drinks ────────────────────────────────────────────────────────
  //
  // Los nombres van TAL COMO los escribe Toast: son los que hay que usar
  // para ligar cada artículo con su receta.
  function pintarTragos(res) {
    const cats = res.porCategoria || [];
    if (!cats.length) return '<div class="small muted">Nothing sold in that selection.</div>';
    return (res.diaCompleto === false
        ? '<div class="tp-avisos"><div>This is not the full day: there were more orders than could be read.</div></div>' : '') +
      cats.map(c =>
        '<div class="ts-tit">' + esc(c.categoria) + ' <span class="small muted">' + num(c.unidades) + ' sold · ' +
          num(c.articulosDistintos) + ' item' + (c.articulosDistintos === 1 ? '' : 's') + '</span></div>' +
        '<div class="tp-lista">' + (c.articulos || []).map(a =>
          '<div class="tp-art"><div class="tp-art-n"><b>' + esc(a.nombre) + '</b><span>×' + num(a.unidades) + '</span></div>' +
          (a.grupo ? '<div class="small muted">' + esc(a.grupo) + '</div>' : '') +
          ((a.modificadores || []).length
            ? '<div class="tp-mods">' + a.modificadores.map(m => '<i>' + esc(m) + '</i>').join('') + '</div>' : '') +
          '</div>').join('') + '</div>').join('');
  }

  function pintar(action, res) {
    const el = $('tpSalida');
    if (!el) return;
    res = res || {};
    seguro = armarSeguro(Object.assign({ accion: action }, res));

    if (!res.ok) {
      // Lo que pasó, no lo que se supone: el estado y lo que contestó
      // Toast, tal cual llegan. `crudo` es la respuesta de una lectura
      // que falló; `toast`, la del login (lib/toast.js ya le quita el
      // secreto y el token); `diagnostico`, las variables que la función
      // no ve en este despliegue.
      const texto = (v) => (v == null ? '' : (typeof v === 'string' ? v : JSON.stringify(v, null, 2)));
      const dicho = texto(res.crudo != null ? res.crudo : res.toast);
      el.innerHTML =
        '<div class="ts-mal">' + esc(action) + ' · failed' + (res.paso ? ' at ' + esc(res.paso) : '') +
          (res.status ? ' · HTTP ' + esc(res.status) : '') + botonCopiar('Copy result') + '</div>' +
        (res.error ? '<div class="small">' + esc(res.error) + '</div>' : '') +
        (dicho ? '<div class="ts-tit">What Toast said</div><pre class="ts-pre">' + esc(dicho) + '</pre>' : '') +
        (res.diagnostico ? '<div class="ts-tit">Diagnosis</div><pre class="ts-pre">' + esc(texto(res.diagnostico)) + '</pre>' : '');
      return;
    }

    const linea = [];
    if (res.businessDate) linea.push(fechaLegible(res.businessDate));
    if (res.ordenes != null) linea.push(res.ordenes + ' orders');
    if (res.expiraEnSegundos) linea.push('token for ' + Math.round(res.expiraEnSegundos / 60) + ' min');

    el.innerHTML =
      '<div class="ts-bien">' + esc(action) + ' · ok' + (linea.length ? ' · ' + esc(linea.join(' · ')) : '') +
        botonCopiar() + '</div>' +
      (action === 'sales' ? pintarVentas(res) : action === 'drinks' ? pintarTragos(res) : '');
  }

  function fallo(action, e) {
    console.error('[toast]', e);
    pintar(action, { ok: false, error: 'Something broke in the browser: ' + ((e && e.message) || String(e)) });
  }

  async function correr(action) {
    if (!ACCIONES.some(a => a.id === action)) return;   // sólo las de la lista: ninguna escribe
    const el = $('tpSalida');
    if (!el) { console.error('[toast] falta #tpSalida'); return; }
    el.innerHTML = '<div class="small muted">Asking Toast…</div>';
    let res;
    try { res = await D().llamar('toast', action, params(action)); }
    catch (e) { return fallo(action, e); }
    pintar(action, res);
  }

  function render() {
    const cont = $('tpBotones');
    if (!cont || cont.dataset.listo === '1') return;
    cont.dataset.listo = '1';

    // Un solo escuchador para copiar: el resultado se repinta entero con
    // cada pregunta.
    const sal = $('tpSalida');
    if (sal) sal.addEventListener('click', e => {
      const b = e.target && e.target.closest && e.target.closest('[data-copiar]');
      if (b) alCopiar(b);
    });

    const cajas = $('tpCajas');
    if (cajas) {
      cajas.innerHTML =
        '<label class="small muted">Date <input type="date" id="tpFecha" value="' + dia(new Date()) + '"></label>' +
        '<label class="small muted">Category <input type="text" id="tpCategoria" placeholder="all, or liquor" class="ts-media" autocomplete="off"></label>';
    }

    cont.innerHTML = ACCIONES.map(a =>
      '<button type="button" class="ui-control ts-b" data-tp="' + a.id + '">' +
      '<span class="ts-bn">' + esc(a.nombre) + '</span>' +
      '<span class="small muted ts-bt">' + esc(a.nota) + '</span></button>').join('');

    // Un fallo dentro del manejador se traga el clic y el botón parece
    // muerto: ya pasó dos veces en el panel de MarginEdge.
    cont.querySelectorAll('[data-tp]').forEach(b => {
      b.onclick = () => {
        try {
          const p = correr(b.dataset.tp);
          if (p && p.catch) p.catch(e => fallo(b.dataset.tp, e));
        } catch (e) { fallo(b.dataset.tp, e); }
      };
    });
  }

  // `toggle` no burbujea, pero se ve en la fase de captura del documento:
  // así da igual si el plegable ya existe cuando carga este archivo.
  document.addEventListener('toggle', e => {
    if (e.target && e.target.id === 'toastDiag' && e.target.open) render();
  }, true);

  window.BarStockToastPanel = { render, correr, pintar };
})();
