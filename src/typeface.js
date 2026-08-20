(() => {
  if (window.BarStockTypeface) return;

  // ── Selector de tipografía ───────────────────────────────────────────
  //
  // Cambia la letra de la app, NUNCA la del logo. El logo lleva Manrope
  // fijada en su propio CSS justamente por esto: antes heredaba del body
  // y habría cambiado con el resto.
  //
  // Las tres opciones son geométricas de palo seco con anchos muy
  // parecidos a Manrope. Eso no es gusto, es necesidad: la app tiene
  // paneles de altura fija y columnas repartidas en porcentajes, y una
  // letra más ancha los desacomoda.
  //
  // La preferencia vive solo en este navegador. No va a la nube a
  // proposito: el fondo es de la locacion, pero la letra es de quien mira.

  const KEY = 'bs_typeface';

  const FONTS = [
    { id: 'manrope', name: 'Manrope',           note: 'La original, la del logo', google: 'Manrope:wght@400;500;600;700;800' },
    { id: 'jakarta', name: 'Plus Jakarta Sans', note: 'Más redonda y actual',     google: 'Plus+Jakarta+Sans:wght@400;500;600;700;800' },
    { id: 'inter',   name: 'Inter',             note: 'Neutra, la más legible',   google: 'Inter:wght@400;500;600;700;800' }
  ];

  const FALLBACK = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';

  function current() {
    return localStorage.getItem(KEY) || 'manrope';
  }

  function byId(id) {
    return FONTS.find(f => f.id === id) || FONTS[0];
  }

  // Manrope ya viene en theme.css. Las otras se piden solo cuando se
  // eligen, para no descargar tres tipografias en cada carga.
  function ensureLoaded(font) {
    if (font.id === 'manrope') return;
    const tag = 'bsFont-' + font.id;
    if (document.getElementById(tag)) return;
    const link = document.createElement('link');
    link.id = tag;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`;
    document.head.appendChild(link);
  }

  function apply(id) {
    const font = byId(id);
    ensureLoaded(font);
    document.body.style.fontFamily = `"${font.name}",${FALLBACK}`;
  }

  function set(id) {
    localStorage.setItem(KEY, id);
    apply(id);
    render();
  }

  function render() {
    const grid = document.getElementById('fontGrid');
    if (!grid) return;
    const cur = current();

    FONTS.forEach(ensureLoaded); // para que las muestras se vean como son

    grid.innerHTML = FONTS.map(f => {
      const on = f.id === cur;
      return `
        <button class="bs-font-opt${on ? ' on' : ''}" data-font="${f.id}" type="button">
          <span class="bs-font-sample" style="font-family:'${f.name}',${FALLBACK}">Wine COGS 22.4%</span>
          <span class="bs-font-meta">
            <span class="bs-font-name">${f.name}</span>
            <span class="bs-font-note">${f.note}</span>
          </span>
          ${on ? '<i class="ti ti-check" aria-hidden="true"></i>' : ''}
        </button>`;
    }).join('');

    grid.querySelectorAll('.bs-font-opt').forEach(b => {
      b.onclick = () => set(b.dataset.font);
    });
  }

  // Se aplica antes de que se dibuje nada para evitar el parpadeo de
  // ver la letra por defecto y que cambie un instante despues.
  apply(current());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }

  window.BarStockTypeface = { render, set, current, FONTS };
})();
