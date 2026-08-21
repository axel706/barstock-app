(() => {
  if (window.BarStockSettingsHome) return;

  // ── Portada de Ajustes ───────────────────────────────────────────────
  //
  // Antes eran siete opciones en lista plana. El problema no era la
  // lista, era el reparto: "General" resultaron ser el correo de
  // respuesta y los destinatarios, y eso pertenece al mismo tema que
  // "Sender Profile" y "Order Defaults" — todo lo que acaba impreso en
  // el PDF que recibe el proveedor. Estaban en tres sitios distintos.
  //
  // Tres grupos por PARA QUÉ SIRVE cada cosa, no por cómo se llamaba.
  //
  // Y cada baldosa muestra su valor actual. Es el cambio que más se nota
  // en el uso diario: la mayoría de las visitas a ajustes son para
  // mirar, no para cambiar. Con el dato a la vista, esas visitas
  // terminan sin entrar a ningún sitio.

  const GROUPS = [
    {
      title: 'Orders and email',
      color: '#38bdf8',
      tiles: [
        { id: 'senderProfile', icon: 'ti-user-circle',    name: 'Sender',      fallback: 'Who signs the order' },
        { id: 'orderDefaults', icon: 'ti-truck-delivery', name: 'Delivery',    fallback: 'Window and address' },
        { id: 'general',       icon: 'ti-mail',           name: 'Recipients',  fallback: 'Reply-to and reports' }
      ]
    },
    {
      title: 'Products',
      color: '#a78bfa',
      tiles: [
        { id: 'categories',  icon: 'ti-tags',    name: 'Categories',   fallback: 'Spirit type per item' },
        { id: 'vendorCodes', icon: 'ti-barcode', name: 'Vendor codes', fallback: 'Code to vendor mapping' },
        { id: 'copyPrices',  icon: 'ti-copy',    name: 'Copy prices',  fallback: 'From another location' }
      ]
    },
    {
      title: 'Appearance',
      color: '#22d3ee',
      tiles: [
        { id: 'appearance', icon: 'ti-palette', name: 'Look', fallback: 'Typeface and background' }
      ]
    }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  // Valores que se pueden leer al instante, sin esperar a la nube
  function fastValues() {
    const v = {};

    const master = (window.state && state.master) || [];
    if (master.length) {
      const withCat = master.filter(r => r.category).length;
      v.categories = `${withCat} of ${master.length} assigned`;
    }

    const rec = document.getElementById('settingsReportRecipients');
    if (rec && rec.value.trim()) {
      const n = rec.value.split(/[,;]/).map(s => s.trim()).filter(Boolean).length;
      v.general = `${n} recipient${n === 1 ? '' : 's'}`;
    }

    if (window.BarStockTypeface) {
      const f = window.BarStockTypeface.FONTS.find(x => x.id === window.BarStockTypeface.current());
      if (f) v.appearance = f.name;
    }

    return v;
  }

  // Los que hay que pedir. Llegan después y se rellenan en su sitio, sin
  // bloquear el dibujado: una portada que tarda en aparecer porque está
  // consultando la nube es peor que una con subtítulos genéricos.
  async function slowValues() {
    const out = {};
    try {
      if (window.BarStockSenderProfile?.getProfile) {
        const p = await window.BarStockSenderProfile.getProfile();
        const bits = [p?.name, p?.title].filter(Boolean);
        if (bits.length) out.senderProfile = bits.join(' · ');
      }
    } catch (e) {}
    return out;
  }

  function paint(values) {
    const menu = document.getElementById('settingsMenu');
    if (!menu) return;

    menu.innerHTML = GROUPS.map(g => `
      <div class="sh-group-title">${esc(g.title)}</div>
      <div class="sh-grid">
        ${g.tiles.map(t => `
          <button class="sh-tile" type="button" data-panel="${t.id}"
                  style="--sh-color:${g.color}">
            <i class="ti ${t.icon}" aria-hidden="true"></i>
            <span class="sh-name">${esc(t.name)}</span>
            <span class="sh-val" data-val="${t.id}">${esc(values[t.id] || t.fallback)}</span>
          </button>`).join('')}
      </div>`).join('');

    menu.querySelectorAll('.sh-tile').forEach(b => {
      b.onclick = () => window.showSettingsPanel(b.dataset.panel);
    });
  }

  function render() {
    paint(fastValues());
    slowValues().then(extra => {
      Object.entries(extra).forEach(([id, text]) => {
        const el = document.querySelector(`[data-val="${id}"]`);
        if (el && text) el.textContent = text;
      });
    });
  }

  window.BarStockSettingsHome = { render };
})();
