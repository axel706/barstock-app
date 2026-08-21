(() => {
  if (window.BarStockLoginBg) return;

  // ── Fondo de la pantalla de entrada ──────────────────────────────────
  //
  // Es GLOBAL: uno solo para todas las locaciones y todos los
  // dispositivos. Eso descarta localStorage como origen — ahí cada
  // navegador tendría el suyo.
  //
  // Pero tiene una exigencia rara: se pinta antes de iniciar sesión, así
  // que quien lo lee no está autenticado. Por eso vive en app_config,
  // una tabla con lectura pública y escritura reservada al admin.
  //
  // localStorage sigue en juego, pero como CACHÉ: se pinta al instante
  // con lo último que se vio y luego se refresca desde la nube. Sin eso,
  // cada entrada empezaría con el fondo de fábrica durante el medio
  // segundo que tarda la consulta.

  const CACHE = 'bs_login_bg_cache';
  const KEY = 'login_bg';
  const MAX_W = 1920;
  const QUALITY = 0.82;

  const PRESETS = [
    { id: 'crown-lounge', label: 'Crown Lounge',    src: 'assets/backgrounds/crown-lounge.jpg' },
    { id: 'crown-dining', label: 'Crown Dining',    src: 'assets/backgrounds/crown-dining.jpg' },
    { id: 'wills-bills',  label: "Will's & Bill's", src: 'assets/backgrounds/wills-bills.jpg' },
    { id: 'jockey-bar',   label: 'The Jockey',      src: 'assets/backgrounds/jockey-bar.jpg' },
    { id: 'midnight',     label: 'Medianoche',      src: 'assets/backgrounds/midnight.svg' }
  ];

  let _current = '';

  function cfg() {
    const c = window.BARSTOCK_CONFIG || {};
    return { url: c.SUPABASE_URL, key: c.SUPABASE_KEY };
  }

  function paintBg(src) {
    const root = document.documentElement;
    if (src) root.style.setProperty('--login-bg', `url("${String(src).replace(/"/g, '\\"')}")`);
    else root.style.removeProperty('--login-bg');
  }

  // 1. Pintar de inmediato con la caché
  try {
    _current = localStorage.getItem(CACHE) || '';
    if (_current) paintBg(_current);
  } catch (e) {}

  // 2. Traer el valor real. Sin sesión, con la llave pública: la tabla
  //    tiene política de lectura abierta justamente para esto.
  async function refresh() {
    const { url, key } = cfg();
    if (!url || !key) return _current;
    try {
      const res = await fetch(
        `${url}/rest/v1/app_config?key=eq.${KEY}&select=value`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      const rows = await res.json();
      const v = Array.isArray(rows) && rows[0] ? (rows[0].value || '') : '';
      if (v !== _current) {
        _current = v;
        paintBg(v);
        try { v ? localStorage.setItem(CACHE, v) : localStorage.removeItem(CACHE); } catch (e) {}
      }
      return v;
    } catch (e) {
      console.warn('[login bg] no se pudo leer, se queda la cache', e);
      return _current;
    }
  }
  refresh();

  async function save(src) {
    const client = await window.BarStockAuth.getAuthClient();
    const { data } = await client.auth.getSession();
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
                 'Authorization': 'Bearer ' + (data?.session?.access_token || '') },
      body: JSON.stringify({ action: 'setConfig', key: KEY, value: src || '' })
    });
    const out = await res.json();
    if (!out.ok) { alert(out.error || 'Could not save the background.'); return false; }
    _current = src || '';
    paintBg(_current);
    try { _current ? localStorage.setItem(CACHE, _current) : localStorage.removeItem(CACHE); } catch (e) {}
    render();
    return true;
  }

  function shrink(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read the file'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('That file is not an image'));
        img.onload = () => {
          const scale = Math.min(1, MAX_W / img.width);
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', QUALITY));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  // El ajuste solo aparece para el admin y estando en The Crown Tavern.
  // Lo primero es lo que de verdad protege: el valor es global y lo ven
  // todos, asi que no puede cambiarlo cualquiera. Lo segundo es para que
  // viva en un solo sitio y no se busque en cuatro.
  function canEdit() {
    const c = window.BARSTOCK_CONFIG || {};
    const isCrown = (c.LOCATION_NAME || '') === 'The Crown Tavern';
    const email = window.__bsUserEmail || '';
    return isCrown && email && email === c.ADMIN_EMAIL;
  }

  function render() {
    const host = document.getElementById('loginBgPicker');
    if (!host) return;

    if (!canEdit()) {
      host.innerHTML = `<div class="lb-note">The sign-in background is shared by every location.
        It is managed from The Crown Tavern by the account admin.</div>`;
      return;
    }

    const cur = _current;
    const isCustom = cur && !PRESETS.some(p => p.src === cur);

    host.innerHTML = `
      <div class="lb-grid">
        ${PRESETS.map(p => `
          <button type="button" class="lb-thumb${cur === p.src ? ' on' : ''}"
                  data-src="${esc(p.src)}" title="${esc(p.label)}"
                  style="background-image:url('${esc(p.src)}')">
            <span>${esc(p.label)}</span>
          </button>`).join('')}
        <button type="button" class="lb-thumb lb-custom${isCustom ? ' on' : ''}"
                data-upload="1" title="Upload an image"
                ${isCustom ? `style="background-image:url('${esc(cur)}')"` : ''}>
          <i class="ti ti-upload" aria-hidden="true"></i>
          <span>${isCustom ? 'Your image' : 'Upload'}</span>
        </button>
      </div>
      <input type="file" id="lbFile" accept="image/*" style="display:none">
      <div class="lb-url">
        <input type="url" id="lbUrl" placeholder="https://images.unsplash.com/..."
               value="${isCustom && /^https?:/.test(cur) ? esc(cur) : ''}">
        <button type="button" class="ui-control" id="lbUrlApply">Use link</button>
      </div>
      <div class="lb-note">Applies to every location and every device.</div>
      ${cur ? '<button type="button" class="lb-reset" id="lbReset">Back to default</button>' : ''}`;

    host.querySelectorAll('[data-src]').forEach(b => b.onclick = () => save(b.dataset.src));

    const file = document.getElementById('lbFile');
    host.querySelector('[data-upload]').onclick = () => file.click();
    file.onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      try { await save(await shrink(f)); }
      catch (err) { alert(err.message || 'Could not use that image.'); }
      e.target.value = '';
    };

    document.getElementById('lbUrlApply').onclick = () => {
      const u = document.getElementById('lbUrl').value.trim();
      if (!u) return;
      if (!/^https?:\/\//i.test(u)) { alert('The link must start with http or https.'); return; }
      save(u);
    };

    const reset = document.getElementById('lbReset');
    if (reset) reset.onclick = () => save('');
  }

  window.BarStockLoginBg = { render, refresh, get: () => _current };
})();
