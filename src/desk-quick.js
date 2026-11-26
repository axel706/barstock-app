(() => {
  if (window.BarStockDeskQuick) return;

  // ── Orders › Q-O: Quick order en el escritorio (lámina "Quick order ·
  //    desktop · in two steps", Axel 2026-11-26: "selecciono el vendor y
  //    trabajo en una quick order para él") ──
  //
  // Paso 1, el proveedor: una tarjeta por proveedor. Paso 2, su orden: a
  // la izquierda sus productos a la vista (lo que Axel pidió conservar:
  // "cuando filtras por vendor y seleccionas el campo producto te aparece
  // la lista de productos sólo de ese vendor"), con la búsqueda encima; a
  // la derecha fecha, hora, nota y las líneas; abajo, fijos, el total,
  // "Count in Live now?" y Review and send.
  //
  // El borrador es el de Quick order del TELÉFONO
  // (BarStockMobileQuick.escritorio: la misma forma de línea, el mismo
  // proveedor, las mismas cantidades), y enviarlo es la revisión de Open
  // (desk-orders.revisarQuick → mobile-orders.revisarBorradorEscritorio):
  // correo a quien sea o, en LOOP, el CSV; la orden la guarda colocar(),
  // con la llegada que se eligió aquí y la hora del borrador. Aquí no se
  // guarda nada.
  //
  // La pregunta del LIVE es la del teléfono, como dos botones: sin
  // contestarla no se pasa a la revisión ("una pregunta y no un
  // interruptor: sin responder no se guarda, así que no se puede
  // olvidar"). El diálogo de antes (#quickOrderModalBg) no la hacía y no
  // mandaba correo; queda en el DOM, sin abrirse desde el escritorio.

  const QE = () => window.BarStockMobileQuick && window.BarStockMobileQuick.escritorio;
  const VD = () => window.BarStockVendorDelivery;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v) => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
  const n2 = (v) => { const n = num(v); return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''); };
  const money = (v) => '$' + num(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const master = () => (window.state && Array.isArray(window.state.master)) ? window.state.master : [];
  const mismo = (a, b) => String(a || '').toUpperCase() === String(b || '').toUpperCase();

  let _caja = null, _abierto = false;
  let _paso = 1;          // 1 el proveedor · 2 su orden
  let _q = '';            // la búsqueda de productos
  let _live = null;       // 'ya' | 'luego' | null: sin contestar
  let _sig = null;        // la siguiente entrega del proveedor (ISO) o null
  let _sigDe = '';        // de qué proveedor y momento es _sig
  let _alCambiar = null;  // desk-orders: el título y los botones del header

  const avisar = (t) => { if (window.BarStockToast) window.BarStockToast.show(t); };
  const logo = (v) => (window.BarStockVendorLogo ? window.BarStockVendorLogo.html(v) : '');
  function entrega(v) {
    const S = window.BarStockSugerencia;
    const t = S && S.llegada ? S.llegada(v) : null;
    return t ? 'Next delivery ' + t : 'No set delivery day';
  }
  const vendor = () => (QE() ? QE().borrador().vendor : '');
  const lineas = () => (QE() ? QE().borrador().items : []);

  // ── Paso 1: el proveedor ──
  function pintarPaso1() {
    const el = _caja.querySelector('#dkqP1');
    // UNKNOWN es lo que no tiene proveedor, no uno al que se le pida.
    const vs = (QE() ? QE().proveedores() : []).filter(v => !/^unknown$/i.test(v));
    el.innerHTML = `<div class="dkq-h">Who is this quick order for?</div>
      <div class="dkq-s">A store run or an extra delivery. Pick the vendor; next you add its products.</div>
      <div class="dkq-vs">${vs.map(v => {
        const n = master().filter(r => mismo(r.vendor, v)).length;
        return `<button type="button" class="dkq-v" data-dkq="vendor" data-v="${esc(v)}">
          <span class="dkq-vlg">${logo(v)}</span>
          <span class="dkq-vn"><b>${esc(v)}</b><small>${n} product${n === 1 ? '' : 's'} · ${esc(entrega(v).replace(/^Next delivery /, ''))}</small></span>
          <i class="ti ti-chevron-right" aria-hidden="true"></i></button>`;
      }).join('')}</div>`;
  }

  async function elegir(v) {
    const Q = QE();
    if (!Q) return;
    const b = Q.borrador();
    if (v !== b.vendor && b.items.length) {
      const D = window.BarStockDialog;
      const n = b.items.length + ' line' + (b.items.length === 1 ? '' : 's');
      const ok = D && D.confirmar
        ? await D.confirmar({ titulo: 'Start a quick order for ' + v + '?', cuerpo: 'An order goes to one vendor.', aviso: 'The ' + n + ' for ' + b.vendor + ' will be cleared.', ok: 'Start', cancelar: 'Keep ' + b.vendor, peligro: true })
        : window.confirm('Clear the ' + n + ' for ' + b.vendor + '?');
      if (!ok) return;
    }
    Q.elegirVendor(v);
    _q = ''; _live = null;
    _paso = 2;
    pintar();
  }

  // ── Paso 2: sus productos, su orden ──
  function productos() {
    const v = vendor();
    const t = _q.trim().toLowerCase();
    return master()
      .filter(r => mismo(r.vendor, v))
      .filter(r => !t || String(r.item || '').toLowerCase().includes(t) || String(r.code || '').toLowerCase().includes(t))
      .sort((a, b) => String(a.item || '').localeCompare(String(b.item || '')));
  }
  function filasProductos() {
    const ps = productos();
    const en = new Map(lineas().map(x => [x.item, x]));
    if (!ps.length) return `<p class="dkq-nada">${_q.trim() ? 'Nothing in ' + esc(vendor()) + ' matches that.' : esc(vendor()) + ' has no products yet.'}</p>`;
    return ps.map((r, i) => {
      const x = en.get(r.item);
      const par = num(r.suggested);
      return `<button type="button" class="dkq-p${x ? ' en' : ''}" data-dkq="anadir" data-i="${i}">
        <span class="dkq-pn">${esc(r.item)}<small>${n2(r.onHand)}${par ? ' of ' + n2(par) : ''} on hand</small></span>
        <span class="dkq-pp">${num(r.value) > 0 ? money(r.value) : 'no price'}</span>
        <span class="dkq-pa">${x ? 'added · ' + n2(x.qty) : ''}</span>
        <span class="dkq-mas" aria-hidden="true"><i class="ti ti-plus"></i></span></button>`;
    }).join('');
  }
  function pintarCol() {
    const col = _caja.querySelector('#dkqCol');
    const v = vendor();
    const total = master().filter(r => mismo(r.vendor, v)).length;
    col.innerHTML = `<div class="dkq-cab"><span class="dkq-vlg">${logo(v)}</span><span><b>${esc(v)}</b><small>${esc(entrega(v))}</small></span></div>
      <label class="dkq-busca"><i class="ti ti-search" aria-hidden="true"></i><input id="dkqQ" type="search" autocomplete="off" spellcheck="false" placeholder="Search ${esc(v)} products…" value="${esc(_q)}"></label>
      <div class="dkq-k">${esc(v)} · ${total} product${total === 1 ? '' : 's'}</div>
      <div class="dkq-ps" id="dkqPs">${filasProductos()}</div>`;
  }
  function repintarProductos() {
    const el = _caja.querySelector('#dkqPs');
    if (el) el.innerHTML = filasProductos();
  }

  const fechaInput = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const horaInput = (d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  function pintarDer() {
    const el = _caja.querySelector('#dkqLineas');
    const b = QE().borrador();
    const cuando = b.cuando || new Date();
    const ls = b.items;
    el.innerHTML = `<div class="dkq-meta">
        <label><span>Date</span><input id="dkqFecha" type="date" value="${fechaInput(cuando)}"></label>
        <label><span>Time</span><input id="dkqHora" type="time" value="${horaInput(cuando)}"></label>
        <label><span>Note</span><input id="dkqNota" type="text" placeholder="Quick Order" value="${esc(b.nota)}"></label>
      </div>
      <div class="dkq-k">This quick order · ${ls.length} line${ls.length === 1 ? '' : 's'}</div>
      ${ls.length ? ls.map((x, i) => `<div class="dkq-l">
          <span class="dkq-ln">${esc(x.item)}</span>
          <span class="dkq-q"><button type="button" class="dki-cr" data-dkq="menos" data-i="${i}" aria-label="One less">−</button><input type="number" min="0" step="1" data-dkq="cant" data-i="${i}" value="${n2(x.qty)}" aria-label="How many"><button type="button" class="dki-cr" data-dkq="mas" data-i="${i}" aria-label="One more">+</button></span>
          <label class="dkq-pr"><span>$</span><input type="number" min="0" step="0.01" data-dkq="precio" data-i="${i}" value="${num(x.value) > 0 ? num(x.value).toFixed(2) : ''}" placeholder="price" aria-label="Price each"></label>
          <span class="dkq-lt">${num(x.value) > 0 ? money(num(x.value) * num(x.qty)) : 'No price'}</span>
          <button type="button" class="dkq-x" data-dkq="quitar" data-i="${i}" aria-label="Remove ${esc(x.item)}"><i class="ti ti-x" aria-hidden="true"></i></button>
        </div>`).join('')
        : '<p class="dkq-nada">Nothing on it yet. Add products from the left.</p>'}`;
  }

  // La siguiente entrega del proveedor, para "Next delivery". Se pide al
  // cambiar de proveedor o de hora; mientras llega, el botón no se ofrece.
  async function siguiente() {
    const v = vendor(), b = QE().borrador();
    const desde = b.cuando || new Date();
    const clave = v + '|' + (b.cuando ? b.cuando.getTime() : 'ahora');
    if (_sigDe === clave) return;
    _sigDe = clave; _sig = null;
    try { _sig = VD() && VD().llegadaDe ? await VD().llegadaDe(v, desde) : null; } catch (e) { _sig = null; }
    if (_live === 'luego' && !_sig) _live = null;
    if (_abierto && _paso === 2) pintarPie();
  }
  const fecha = (iso) => (VD() && VD().fecha ? VD().fecha(iso) : String(iso));
  function pintarPie() {
    const el = _caja.querySelector('#dkqPie');
    const Q = QE();
    const ls = lineas();
    const listo = ls.length && _live && (_live === 'ya' || _sig);
    const correo = Q.porCorreo(vendor());
    el.innerHTML = `<div class="dkq-tot"><b>${money(Q.total())}</b><small>${n2(Q.botellas())} bottle${Q.botellas() === 1 ? '' : 's'}</small></div>
      <div class="dkq-live"><span>Count in Live now?</span>
        <div class="dkq-seg" role="radiogroup" aria-label="Count in Live now?">
          <button type="button" role="radio" aria-checked="${_live === 'ya'}" class="${_live === 'ya' ? 'on' : ''}" data-dkq="live" data-v="ya">Yes, it's here</button>
          <button type="button" role="radio" aria-checked="${_live === 'luego'}" class="${_live === 'luego' ? 'on' : ''}" data-dkq="live" data-v="luego"${_sig ? '' : ' disabled'}>${_sig ? 'Next delivery · ' + esc(fecha(_sig)) : 'No delivery day'}</button>
        </div></div>
      <button type="button" class="dki-cr azul dkq-go" data-dkq="revisar"${listo ? '' : ' disabled'}><i class="ti ti-send" aria-hidden="true"></i>${correo ? 'Review and send' : 'Review and place'}</button>`;
    el.hidden = !ls.length;
  }

  function pintar() {
    if (!_caja || !_abierto) return;
    _caja.dataset.paso = String(_paso);
    if (_paso === 1) pintarPaso1();
    else { pintarCol(); pintarDer(); pintarPie(); siguiente(); }
    if (_alCambiar) _alCambiar();
  }
  // Tras cambiar una línea: la orden, el pie y lo marcado a la izquierda,
  // sin rehacer la búsqueda (no pierde el foco).
  function repintarOrden() { pintarDer(); pintarPie(); repintarProductos(); }

  function alClic(ev) {
    const b = ev.target.closest('[data-dkq]');
    if (!b || !QE()) return;
    const k = b.dataset.dkq, i = Number(b.dataset.i);
    if (k === 'vendor') return elegir(b.dataset.v);
    if (k === 'anadir') { const r = productos()[i]; if (r) { QE().anadir(r, 1); repintarOrden(); } return; }
    if (k === 'menos' || k === 'mas') { const x = lineas()[i]; if (x) { QE().cantidad(i, num(x.qty) + (k === 'mas' ? 1 : -1)); repintarOrden(); } return; }
    if (k === 'quitar') { QE().quitar(i); repintarOrden(); return; }
    if (k === 'live') { _live = b.dataset.v; pintarPie(); return; }
    if (k === 'revisar') return revisar();
  }
  function alCambio(ev) {
    const t = ev.target;
    if (!QE()) return;
    const k = t.dataset && t.dataset.dkq, i = Number(t.dataset && t.dataset.i);
    if (k === 'cant') { QE().cantidad(i, t.value); repintarOrden(); return; }
    if (k === 'precio') { QE().precio(i, t.value); repintarOrden(); return; }
    if (t.id === 'dkqFecha' || t.id === 'dkqHora') {
      const f = _caja.querySelector('#dkqFecha').value, h = _caja.querySelector('#dkqHora').value || '12:00';
      const d = new Date(f + 'T' + h + ':00');
      if (!Number.isNaN(d.getTime())) { QE().ponerCuando(d); siguiente(); }
    }
  }
  function alEscribir(ev) {
    const t = ev.target;
    if (t.id === 'dkqQ') { _q = t.value; repintarProductos(); return; }
    if (t.id === 'dkqNota' && QE()) QE().ponerNota(t.value);
  }
  // Enter en la búsqueda añade el primero que casa.
  function alTecla(ev) {
    if (ev.key !== 'Enter' || ev.target.id !== 'dkqQ') return;
    ev.preventDefault();
    const r = productos()[0];
    if (!r) return;
    QE().anadir(r, 1);
    repintarOrden();
  }

  function revisar() {
    const Q = QE();
    if (!Q || !lineas().length) return;
    if (!_live) return avisar('Answer "Count in Live now?" first.');
    const b = Q.borrador();
    const llegada = _live === 'ya' ? (b.cuando || new Date()).toISOString() : _sig;
    const DO = window.BarStockDeskOrders;
    if (DO && DO.revisarQuick) DO.revisarQuick(Q.paraRevisar(llegada));
  }

  // ── Montar y soltar (desk-orders.js, al entrar y salir de la vista) ──
  // Con un borrador a medias se vuelve a su orden; sin él, al paso 1.
  function abrir(caja, o) {
    _caja = caja;
    _alCambiar = o && o.alCambiar;
    if (!caja.querySelector('#dkqP1')) {
      caja.insertAdjacentHTML('beforeend', `<div class="dkq-p1" id="dkqP1"></div>
        <aside class="dkq-col" id="dkqCol" aria-label="Products"></aside>
        <div class="dkq-der" id="dkqDer"><div class="dkq-lineas" id="dkqLineas"></div><div class="dkq-pie" id="dkqPie" hidden></div></div>`);
      ['#dkqP1', '#dkqCol', '#dkqDer'].forEach(s => {
        const el = caja.querySelector(s);
        el.addEventListener('click', alClic);
        el.addEventListener('change', alCambio);
        el.addEventListener('input', alEscribir);
        el.addEventListener('keydown', alTecla);
      });
    }
    _abierto = true;
    _paso = QE() && lineas().length && vendor() ? 2 : 1;
    _sigDe = '';
    pintar();
  }
  function cerrar() { _abierto = false; }
  function alPaso1() { _paso = 1; pintar(); }
  function alPaso2() { if (vendor()) { _paso = 2; pintar(); } }

  window.BarStockDeskQuick = { abrir, cerrar, paso1: alPaso1, paso2: alPaso2, abierto: () => _abierto,
    paso: () => _paso, vendor };
})();
