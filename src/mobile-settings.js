(() => {
  if (window.BarStockMobileSettings) return;

  // ── Ajustes en el teléfono ───────────────────────────────────────────
  //
  // No es el modal del escritorio metido en una pantalla estrecha. Ése
  // tiene rejillas de dos columnas y filas de botones alineadas a la
  // derecha: en un móvil los campos salen a media anchura y "Guardar"
  // acaba fuera del pulgar.
  //
  // Esta pantalla pinta su propio marcado —una columna, campos a lo
  // alto, guardar ancho abajo— pero NO duplica lógica: guarda con las
  // mismas funciones que el escritorio (BarStockSenderProfile,
  // BarStockLocationSettings, BarStockVendorDefaults, BarStockZones).
  // Dos formas de escribir el mismo ajuste es como se desincronizan.
  //
  // Lo que no está aquí —categorías, códigos de proveedor, copiar
  // precios, MarginEdge— son tablas anchas. Se declara que son de
  // escritorio en vez de llevar a algo inservible.

  let _panel = null;      // null | 'sender' | 'emails' | 'delivery' | 'zones' | 'look'
  let _vendor = null;     // proveedor abierto dentro de delivery
  let _valores = {};      // lo que se enseña bajo cada entrada del menú

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

  function aviso(t) {
    if (typeof window.setStatus === 'function') window.setStatus(t);
  }

  // ── El menú ──────────────────────────────────────────────────────────

  const GRUPOS = [
    { t: 'Orders and email', items: [
      { id: 'sender',   ico: 'ti-user-circle',    n: 'Sender',   d: 'Who signs the order' },
      { id: 'emails',   ico: 'ti-mail',           n: 'Emails',   d: 'Reply-to and reports' },
      { id: 'delivery', ico: 'ti-truck-delivery', n: 'Delivery', d: 'Details per vendor' }
    ]},
    { t: 'Counting', items: [
      { id: 'zones', ico: 'ti-map-pin', n: 'Zones', d: 'Where the bottles are' }
    ]},
    { t: 'Appearance', items: [
      { id: 'look', ico: 'ti-typography', n: 'Typeface',  d: 'The app font' },
      { id: 'size', ico: 'ti-text-size',  n: 'Text size', d: 'Default' }
    ]}
  ];

  function pintarMenu(host) {
    const loc = (window.BARSTOCK_CONFIG || {}).LOCATION_NAME || '';

    // La raíz también necesita salida: se entra desde More o desde el
    // engranaje de la banda, y sin flecha no hay forma de volver —
    // ninguna pestaña está encendida y el gesto del borde no tiene a
    // dónde retroceder.
    const M = window.BarStockMobile;
    const vuelta = (M && M.nombreAnterior && M.nombreAnterior()) || 'Back';

    host.innerHTML =
      '<button type="button" class="m-back m-back-gde" id="msOut">' +
        '<i class="ti ti-chevron-left" aria-hidden="true"></i> ' + esc(vuelta) +
      '</button>' +
      '<div class="m-inv-t">Settings</div>' +
      '<div class="m-hsub">' + esc(loc) + '</div>' +
      GRUPOS.map(g =>
        '<div class="m-lab">' + esc(g.t.toUpperCase()) + '</div>' +
        g.items.map(it =>
          '<button type="button" class="m-item" data-p="' + it.id + '">' +
            '<i class="ti ' + it.ico + '" aria-hidden="true"></i>' +
            '<span class="m-item-t">' + esc(it.n) +
              '<small>' + esc(_valores[it.id] || it.d) + '</small>' +
            '</span>' +
            '<i class="ti ti-chevron-right m-chev" aria-hidden="true"></i>' +
          '</button>').join('')
      ).join('') +

      // Decirlo es mejor que esconderlo: así nadie busca categorías en
      // el teléfono creyendo que se le han perdido.
      '<div class="m-lab">ON DESKTOP ONLY</div>' +
      '<div class="m-set-off">' +
        'Categories, vendor codes, copy prices and the MarginEdge ' +
        'integration are wide tables. Open those on a computer.' +
      '</div>';

    const out = host.querySelector('#msOut');
    if (out) out.onclick = () => { if (M && M.volver) M.volver(); };

    host.querySelectorAll('[data-p]').forEach(b => {
      b.onclick = () => { _panel = b.dataset.p; _vendor = null; pintar(host); };
    });
  }

  // ── Piezas de formulario ─────────────────────────────────────────────

  function campo(id, etiqueta, valor, pista, tipo) {
    return '<div class="m-set-f">' +
      '<label for="' + id + '">' + esc(etiqueta) + '</label>' +
      '<input id="' + id + '" type="' + (tipo || 'text') +
        '" value="' + esc(valor || '') + '" autocomplete="off">' +
      (pista ? '<small>' + esc(pista) + '</small>' : '') +
    '</div>';
  }

  function cabecera(host, titulo, sub) {
    return '<button type="button" class="m-back m-back-gde" id="msBack">' +
      '<i class="ti ti-chevron-left" aria-hidden="true"></i> Settings</button>' +
      '<div class="m-inv-t">' + esc(titulo) + '</div>' +
      (sub ? '<div class="m-hsub">' + esc(sub) + '</div>' : '');
  }

  function volver(host) {
    const b = host.querySelector('#msBack');
    if (b) b.onclick = () => { _panel = null; _vendor = null; montar(host); };
  }

  function guardar(host, texto, fn) {
    const b = host.querySelector('#msSave');
    if (!b) return;
    b.onclick = async () => {
      b.disabled = true;
      const antes = b.textContent;
      b.textContent = 'Saving…';
      let ok = false;
      try { ok = await fn(); } catch (e) { ok = false; }
      b.disabled = false;
      b.textContent = antes;
      aviso(ok ? texto : 'Could not save that.');
      if (ok) { _panel = null; _vendor = null; montar(host); }
    };
  }

  const val = (host, id) => {
    const el = host.querySelector('#' + id);
    return el ? el.value.trim() : '';
  };

  // ── Sender ───────────────────────────────────────────────────────────

  async function pintarSender(host) {
    let p = {};
    try { p = (await window.BarStockSenderProfile.getProfile()) || {}; } catch (e) {}

    host.innerHTML = cabecera(host, 'Sender', 'How you appear on purchase orders.') +
      campo('ms_name',  'Full name', p.name,  '', 'text') +
      campo('ms_title', 'Title',     p.title, 'Optional. Prints under your name.') +
      campo('ms_email', 'Email',     p.email, '', 'email') +
      campo('ms_phone', 'Phone',     p.phone, 'Optional.', 'tel') +
      '<button type="button" class="m-set-save" id="msSave">Save</button>';

    volver(host);
    guardar(host, 'Sender saved', () =>
      window.BarStockSenderProfile.saveProfile({
        name:  val(host, 'ms_name'),
        title: val(host, 'ms_title'),
        email: val(host, 'ms_email'),
        phone: val(host, 'ms_phone')
      }).then(() => true));
  }

  // ── Emails ───────────────────────────────────────────────────────────

  async function pintarEmails(host) {
    let s = {};
    try { s = (await window.BarStockLocationSettings.getSettings()) || {}; } catch (e) {}

    host.innerHTML = cabecera(host, 'Emails', 'Where order replies and reports go.') +
      campo('ms_reply', 'Reply-to email', s.reply_to_email,
        'When a vendor replies to an order, it goes here. Empty means it goes to whoever sent it.',
        'email') +
      campo('ms_rcpt', 'Cost report recipients', s.report_recipients,
        'Separate several with commas. Pre-filled when sending the cost report.') +
      '<button type="button" class="m-set-save" id="msSave">Save</button>';

    volver(host);
    guardar(host, 'Emails saved', () =>
      window.BarStockLocationSettings.saveSettings({
        reply_to_email: val(host, 'ms_reply'),
        report_recipients: val(host, 'ms_rcpt')
      }).then(() => true));
  }

  // ── Delivery ─────────────────────────────────────────────────────────
  //
  // En el escritorio son pestañas de proveedor sobre un formulario. En
  // el teléfono no caben siete pestañas, así que son dos pasos: elegir
  // proveedor y luego su ficha. Un paso más, pero legible.

  function vendors() {
    if (typeof window.getActiveVendors !== 'function') return [];
    return window.getActiveVendors().filter(v => v && v !== 'UNKNOWN');
  }

  function pintarDeliveryLista(host) {
    const vs = vendors();
    host.innerHTML = cabecera(host, 'Delivery',
      'Each vendor keeps its own details. These print on their orders only.') +
      (vs.length
        ? vs.map(v =>
            '<button type="button" class="m-item" data-v="' + esc(v) + '">' +
              '<i class="ti ti-truck-delivery" aria-hidden="true"></i>' +
              '<span class="m-item-t">' + esc(v) + '</span>' +
              '<i class="ti ti-chevron-right m-chev" aria-hidden="true"></i>' +
            '</button>').join('')
        : '<div class="m-empty">No vendors yet.</div>');

    volver(host);
    host.querySelectorAll('[data-v]').forEach(b => {
      b.onclick = () => { _vendor = b.dataset.v; pintar(host); };
    });
  }

  async function pintarDeliveryFicha(host) {
    let d = {};
    try { d = (await window.BarStockVendorDefaults.getDefaults(_vendor)) || {}; } catch (e) {}

    host.innerHTML =
      '<button type="button" class="m-back m-back-gde" id="msBack">' +
        '<i class="ti ti-chevron-left" aria-hidden="true"></i> Delivery</button>' +
      '<div class="m-inv-t">' + esc(_vendor) + '</div>' +
      '<div class="m-hsub">These details print on this vendor’s orders only.</div>' +
      campo('ms_vemail', 'Vendor email', d.vendor_email,
        'Pre-filled when emailing an order.', 'email') +
      campo('ms_acct',   'Account number', d.account_number, 'Optional.') +
      campo('ms_rep',    'Rep name',       d.rep_name,       'Optional.') +
      campo('ms_repph',  'Rep phone',      d.rep_phone,      'Optional.', 'tel') +
      campo('ms_win',    'Delivery window', d.delivery_window, 'Optional. e.g. 8am – 2pm') +
      campo('ms_addr',   'Delivery address', d.delivery_address, 'Optional.') +
      campo('ms_note',   'Special instructions', d.special_instructions, 'Optional.') +
      '<button type="button" class="m-set-save" id="msSave">Save</button>';

    // El atrás de esta ficha vuelve a la LISTA de proveedores, no al
    // menú: salir del todo desde aquí perdería el sitio.
    const b = host.querySelector('#msBack');
    if (b) b.onclick = () => { _vendor = null; pintar(host); };

    guardar(host, 'Delivery saved for ' + _vendor, () =>
      window.BarStockVendorDefaults.saveDefaults(_vendor, {
        vendor_email: val(host, 'ms_vemail'),
        account_number: val(host, 'ms_acct'),
        rep_name: val(host, 'ms_rep'),
        rep_phone: val(host, 'ms_repph'),
        delivery_window: val(host, 'ms_win'),
        delivery_address: val(host, 'ms_addr'),
        special_instructions: val(host, 'ms_note')
      }));
  }

  // ── Zones ────────────────────────────────────────────────────────────

  async function pintarZonas(host) {
    const Z = window.BarStockZones;
    let lista = [], defecto = '';
    try { lista = (await Z.cargar(true)) || []; defecto = Z.porDefecto() || ''; } catch (e) {}

    host.innerHTML = cabecera(host, 'Zones',
      'Where the bottles are. While scanning you pick one, so later you can ' +
      'see where a bottle is without being at the bar.') +
      (lista.length
        ? '<div class="m-set-zs">' + lista.map((z, i) =>
            '<div class="m-set-z">' +
              '<button type="button" class="m-set-zd' + (z === defecto ? ' on' : '') +
                '" data-def="' + esc(z) + '" aria-label="Start counts here">' +
                '<i class="ti ti-star" aria-hidden="true"></i></button>' +
              '<span class="m-set-zn">' + esc(z) + '</span>' +
              '<button type="button" class="m-set-zx" data-del="' + i + '">Remove</button>' +
            '</div>').join('') + '</div>'
        : '<div class="m-empty">No zones yet. Counting works exactly as it does today.</div>') +
      '<div class="m-set-add">' +
        '<input id="ms_zona" type="text" placeholder="New zone…" autocomplete="off">' +
        '<button type="button" id="msZAdd">Add</button>' +
      '</div>' +
      '<button type="button" class="m-set-save" id="msSave">Save zones</button>';

    volver(host);

    // El borrador vive en memoria hasta que se guarda: tocar una zona
    // no puede reescribir el reparto de un conteo en curso.
    let borrador = lista.slice();
    let def = defecto;

    const repintar = () => {
      _valores.zones = borrador.join(' · ');
      host.querySelectorAll('[data-del]').forEach(b => {
        b.onclick = () => { borrador.splice(Number(b.dataset.del), 1); refrescarZonas(); };
      });
      host.querySelectorAll('[data-def]').forEach(b => {
        b.onclick = () => { def = b.dataset.def; refrescarZonas(); };
      });
    };

    const refrescarZonas = () => {
      const cont = host.querySelector('.m-set-zs');
      if (!cont) return;
      cont.innerHTML = borrador.map((z, i) =>
        '<div class="m-set-z">' +
          '<button type="button" class="m-set-zd' + (z === def ? ' on' : '') +
            '" data-def="' + esc(z) + '" aria-label="Start counts here">' +
            '<i class="ti ti-star" aria-hidden="true"></i></button>' +
          '<span class="m-set-zn">' + esc(z) + '</span>' +
          '<button type="button" class="m-set-zx" data-del="' + i + '">Remove</button>' +
        '</div>').join('');
      repintar();
    };

    repintar();

    const add = host.querySelector('#msZAdd');
    if (add) add.onclick = () => {
      const el = host.querySelector('#ms_zona');
      const v = el ? el.value.trim() : '';
      if (!v || borrador.includes(v)) return;
      borrador.push(v);
      if (el) el.value = '';
      refrescarZonas();
    };

    guardar(host, 'Zones saved', () => Z.guardarLista(borrador, def).then(() => true));
  }

  // ── Typeface ─────────────────────────────────────────────────────────

  function pintarLook(host) {
    const T = window.BarStockTypeface;
    const actual = T.current();

    host.innerHTML = cabecera(host, 'Typeface', 'The app font. The logo never changes.') +
      '<div class="m-set-fonts">' + T.FONTS.map(f =>
        '<button type="button" class="m-set-font' + (f.id === actual ? ' on' : '') +
          '" data-font="' + esc(f.id) + '">' +
          '<span class="m-set-font-s" style="font-family:\'' + esc(f.name) +
            '\',-apple-system,BlinkMacSystemFont,sans-serif">Wine COGS 22.4%</span>' +
          '<span class="m-set-font-n">' + esc(f.name) +
            '<small>' + esc(f.note) + '</small></span>' +
        '</button>').join('') + '</div>';

    volver(host);
    host.querySelectorAll('[data-font]').forEach(b => {
      b.onclick = () => {
        T.set(b.dataset.font);
        _valores.look = (T.FONTS.find(f => f.id === b.dataset.font) || {}).name || '';
        pintarLook(host);
      };
    });
  }

  // ── Tamaño del texto ─────────────────────────────────────────────────
  //
  // Toda la escala del móvil cuelga de una variable, `--m-base`. Tres
  // ajustes la mueven y los ocho pasos se recolocan solos: no hay una
  // lista de tamaños que mantener en paralelo.
  //
  // Vive en el dispositivo, no en la nube: es una preferencia de los
  // ojos de quien mira esta pantalla, no de la locación. El iPad de la
  // barra y el teléfono del gerente pueden querer cosas distintas.

  const TAMANOS = [
    { id: 'sm', n: 'Small',   d: 'Fits more on screen' },
    { id: 'md', n: 'Default', d: 'What the app was drawn at' },
    { id: 'lg', n: 'Large',   d: 'Easier at arm\u2019s length' }
  ];
  const LS_TAM = 'bs_m_txt';

  function tamanoActual() {
    try { return localStorage.getItem(LS_TAM) || 'md'; } catch (e) { return 'md'; }
  }

  function aplicarTamano(id) {
    const b = document.body;
    b.classList.remove('m-txt-sm', 'm-txt-lg');
    if (id === 'sm') b.classList.add('m-txt-sm');
    if (id === 'lg') b.classList.add('m-txt-lg');
    try { localStorage.setItem(LS_TAM, id); } catch (e) {}
  }

  function pintarTamano(host) {
    const act = tamanoActual();
    host.innerHTML = cabecera(host, 'Text size',
      'Moves every size in the app at once. Only on this device.') +
      '<div class="m-set-fonts">' + TAMANOS.map(t =>
        '<button type="button" class="m-set-font' + (t.id === act ? ' on' : '') +
          '" data-size="' + t.id + '">' +
          '<span class="m-set-font-s">Wine COGS 22.4%</span>' +
          '<span class="m-set-font-n">' + esc(t.n) +
            '<small>' + esc(t.d) + '</small></span>' +
        '</button>').join('') + '</div>';

    volver(host);
    host.querySelectorAll('[data-size]').forEach(b => {
      b.onclick = () => {
        aplicarTamano(b.dataset.size);
        _valores.size = (TAMANOS.find(t => t.id === b.dataset.size) || {}).n || '';
        pintarTamano(host);
      };
    });
  }

  // Se aplica al cargar, no al abrir Ajustes: si no, la app arrancaría
  // con el tamaño de fábrica y daría un salto al entrar aquí.
  aplicarTamano(tamanoActual());

  // ── Entrada ──────────────────────────────────────────────────────────

  function pintar(host) {
    if (!host) return;
    if (_panel === 'sender')   return pintarSender(host);
    if (_panel === 'emails')   return pintarEmails(host);
    if (_panel === 'delivery') return _vendor ? pintarDeliveryFicha(host)
                                              : pintarDeliveryLista(host);
    if (_panel === 'zones')    return pintarZonas(host);
    if (_panel === 'look')     return pintarLook(host);
    if (_panel === 'size')     return pintarTamano(host);
    return pintarMenu(host);
  }

  // Los valores bajo cada entrada se piden en segundo plano: una
  // portada que tarda en salir porque está consultando la nube es peor
  // que una con subtítulos genéricos.
  async function valores(host) {
    try {
      const p = await window.BarStockSenderProfile.getProfile();
      const bits = [p && p.name, p && p.title].filter(Boolean);
      if (bits.length) _valores.sender = bits.join(' · ');
    } catch (e) {}
    try {
      const s = await window.BarStockLocationSettings.getSettings();
      const n = String((s && s.report_recipients) || '')
        .split(/[,;]/).map(x => x.trim()).filter(Boolean).length;
      const bits = [];
      if (s && s.reply_to_email) bits.push('Reply-to set');
      if (n) bits.push(n + ' recipient' + (n === 1 ? '' : 's'));
      if (bits.length) _valores.emails = bits.join(' · ');
    } catch (e) {}
    try {
      const z = await window.BarStockZones.cargar();
      _valores.zones = z.length ? z.slice(0, 3).join(' · ') + (z.length > 3 ? ' +' + (z.length - 3) : '')
                                : 'Off · counting as usual';
    } catch (e) {}
    try {
      const T = window.BarStockTypeface;
      const f = T.FONTS.find(x => x.id === T.current());
      if (f) _valores.look = f.name;
    } catch (e) {}
    const n = vendors().length;
    if (n) _valores.delivery = n + ' vendor' + (n === 1 ? '' : 's') + ', each its own';
    _valores.size = (TAMANOS.find(t => t.id === tamanoActual()) || {}).n || '';

    if (_panel === null) pintarMenu(host);
  }

  function montar(host) {
    pintar(host);
    if (_panel === null) valores(host);
  }

  window.BarStockMobileSettings = { montar };

  function registrar() {
    if (!window.BarStockMobile) return;
    window.BarStockMobile.register({
      id: 'settings', icon: 'ti-settings', label: 'Settings',
      tab: false,
      mount: montar,
      show(host) { _panel = null; _vendor = null; montar(host); },
      atras(host, hacerlo) {
        // Desde la raíz, el gesto sale de Ajustes en vez de no hacer
        // nada: es lo que espera cualquiera que entró desde More.
        if (_panel === null) {
          if (hacerlo && window.BarStockMobile) window.BarStockMobile.volver();
          return true;
        }
        if (hacerlo) {
          if (_panel === 'delivery' && _vendor) _vendor = null;
          else { _panel = null; _vendor = null; }
          montar(host);
        }
        return true;
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registrar);
  else registrar();
})();
