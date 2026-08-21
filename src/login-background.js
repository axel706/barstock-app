(() => {
  if (window.BarStockLoginBg) return;

  // ── Fondo de la pantalla de entrada ──────────────────────────────────
  //
  // Se guarda en localStorage y no en la nube, y no es una limitación
  // sino la única opción: en el login todavía no hay sesión, así que la
  // app no puede preguntarle nada a Supabase. Lo que se vea ahí tiene
  // que estar ya en el navegador.
  //
  // Consecuencia a tener presente: es por dispositivo. En un navegador
  // nuevo sale el de fábrica hasta que lo elijas otra vez.
  //
  // Las imágenes subidas se guardan reescaladas y en JPEG. Sin eso, una
  // foto de teléfono de 6 MB en base64 revienta el límite de
  // localStorage — y cuando revienta, se lleva por delante el resto de
  // lo guardado, no solo la imagen.

  const KEY = 'bs_login_bg';
  const MAX_W = 1920;
  const QUALITY = 0.82;

  const PRESETS = [
    { id: 'crown-lounge', label: 'Crown Lounge', src: 'assets/backgrounds/crown-lounge.jpg' },
    { id: 'crown-dining', label: 'Crown Dining', src: 'assets/backgrounds/crown-dining.jpg' },
    { id: 'wills-bills',  label: "Will's & Bill's", src: 'assets/backgrounds/wills-bills.jpg' },
    { id: 'jockey-bar',   label: 'The Jockey',   src: 'assets/backgrounds/jockey-bar.jpg' },
    { id: 'midnight',     label: 'Medianoche',   src: 'assets/backgrounds/midnight.svg' }
  ];

  function get() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }

  function apply(src) {
    const v = src !== undefined ? src : get();
    const root = document.documentElement;
    if (v) root.style.setProperty('--login-bg', `url("${v.replace(/"/g, '\\"')}")`);
    else root.style.removeProperty('--login-bg');
  }

  function save(src) {
    try {
      if (src) localStorage.setItem(KEY, src);
      else localStorage.removeItem(KEY);
    } catch (e) {
      alert('Could not save the image — it may be too large for this browser.');
      return false;
    }
    apply(src || '');
    render();
    return true;
  }

  // Reescala antes de guardar. Una foto de teléfono son varios megas y
  // en base64 crece otro tercio; guardarla tal cual llena el almacén.
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

  function render() {
    const host = document.getElementById('loginBgPicker');
    if (!host) return;
    const cur = get();
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
      <div class="lb-note">Saved on this device only — the sign-in screen loads before there is any session to read from.</div>
      ${cur ? '<button type="button" class="lb-reset" id="lbReset">Back to default</button>' : ''}`;

    host.querySelectorAll('[data-src]').forEach(b => b.onclick = () => save(b.dataset.src));

    const file = document.getElementById('lbFile');
    host.querySelector('[data-upload]').onclick = () => file.click();
    file.onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      try { save(await shrink(f)); }
      catch (err) { alert(err.message || 'Could not use that image.'); }
      e.target.value = '';
    };

    const urlBtn = document.getElementById('lbUrlApply');
    urlBtn.onclick = () => {
      const u = document.getElementById('lbUrl').value.trim();
      if (!u) return;
      if (!/^https?:\/\//i.test(u)) { alert('The link must start with http or https.'); return; }
      save(u);
    };

    const reset = document.getElementById('lbReset');
    if (reset) reset.onclick = () => save('');
  }

  // Se aplica de inmediato, antes de que se dibuje el overlay. Si se
  // esperara al DOM, se vería un parpadeo del fondo de fábrica.
  apply();

  window.BarStockLoginBg = { apply, render, get };
})();
