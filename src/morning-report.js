(() => {
  if (window.BarStockMorningReport) return;
  // ── El correo de la mañana, desde la app ─────────────────────────────
  //
  // Axel, 2026-11-12: "constrúyelo y dame una opción de enviarlo
  // manualmente para fines de prueba, en ajustes tal vez". Vive en
  // Settings › Toast › Morning email: al entrar se ve el correo tal cual
  // saldría, y "Send a test" lo manda al reply-to de la locación, donde
  // llega el automático (el servidor lo lee de la base y no acepta otro
  // destinatario; lib/morning-report.js).
  //
  // Aquí sólo se REÚNEN los números, con los mismos módulos que enseñan
  // el Home y la ficha, para que no se calculen en dos sitios:
  //   · ayer:    BarStockToastSales.ahora() (la tarjeta Toast Sales).
  //   · agotan:  BarStockRunOut.ahora() (el LIVE, lo de siempre de cada
  //              día y lo que viene) y cuantoPedir() (hasta el domingo).
  // Las frases y el HTML los escribe el servidor.
  //
  // Lo que entra en "Won't make it to Sunday": lo que Toast vende, tiene
  // PAR y no llega al domingo. Sin par no se pide (Axel, 2026-11-11, la
  // misma regla que running-out.js).
  //
  // Si no se puede saber qué se acaba (un conteo a medias, poca historia
  // de Toast, un fallo), se dice por qué en `prevision`: una lista vacía
  // se leería "nothing runs out", y sería mentira.

  const conPar = (producto) => {
    const m = ((window.state && window.state.master) || []).find(r => r && r.item === producto);
    return !!(m && (Number(m.suggested) || 0) > 0);
  };

  // ── El resumen de la semana (el correo del lunes) ──────────────────
  //
  // Axel, 2026-11-17, sobre lámina: el lunes no se abre, así que el
  // correo del lunes es el resumen de la semana pasada (de lunes a
  // domingo, con el domingo en su caja), lo que suele dar esta semana día
  // por día, y lo que no llega al domingo. Los números son los de la
  // tarjeta de Toast del Home: semanaCal (la semana y su "vs usual", la
  // mediana de las semanas enteras anteriores), masVendido y la entrada
  // de cada día (V.dia: lo de siempre de ese día de la semana). Nada se
  // calcula aquí que no se calcule ya allí.
  const SEM_FIJOS = ['dinero', 'licor', 'vino', 'botellas', 'botLicor', 'botVino',
    'normalDinero', 'normalLicor', 'normalVino', 'normalBotellas', 'normalBotLicor', 'normalBotVino'];
  function semanal(V, TS) {
    const W = TS.semanaCal(V, 1);
    if (!W) return null;
    const total = {};
    for (const k of SEM_FIJOS) total[k] = W.total[k];
    const mejor = W.dias.reduce((m, x) => (!m || (x.dinero || 0) > (m.dinero || 0) ? x : m), null);
    const top = (f) => TS.masVendido(V.base, f, 'botellas').slice(0, 3).map(x => ({ nombre: x.nombre, botellas: x.botellas }));
    const dom = W.dias[6];
    const W0 = TS.semanaCal(V, 0);
    return {
      lunes: W.lunes, cargados: W.dias.filter(x => x.cargado).length, total,
      mejor: mejor && mejor.dinero > 0 ? { fecha: mejor.fecha, dinero: mejor.dinero } : null,
      top: top(W.fechas),
      domingo: { fecha: dom.fecha, cargado: dom.cargado, dinero: dom.dinero, normalDinero: dom.normalDinero, top: top(dom.fecha)[0] || null },
      // Esta semana: lo de siempre de cada día (la mediana de ese día de
      // la semana en lo cargado, ~13 semanas). Un día que siempre da cero
      // es un día cerrado.
      plan: W0 ? W0.dias.map(x => ({ fecha: x.fecha, dinero: x.normalDinero, botellas: x.normalBotellas })) : []
    };
  }

  // op.semanal: el resumen de la semana aunque no sea lunes (Weekly en
  // Settings). Un lunes sale solo, porque es el correo de ese día, salvo
  // con op.diario (Daily en Settings, para mandar el de cada día).
  async function datos(op) {
    const TS = window.BarStockToastSales, R = window.BarStockRunOut;
    const out = { local: (window.BARSTOCK_CONFIG || {}).LOCATION_NAME || '', hoy: null, ayer: null,
      agotan: [], prevision: 'ok', detalle: '' };

    const v = TS && TS.ahora ? await TS.ahora().catch(() => null) : null;
    const sem = (v && v.semana) || [];
    const a = sem[sem.length - 1];
    // La FECHA de hoy es v.base.hoy: v.hoy es la entrada de hoy (la del
    // Sync), no una fecha (toast-sales.js, semanaCal).
    const hoyF = v && ((v.base && v.base.hoy) || (typeof v.hoy === 'string' ? v.hoy : null));
    if (hoyF) out.hoy = hoyF;
    const lunes = hoyF && new Date(hoyF + 'T12:00:00Z').getUTCDay() === 1;
    if (v && TS.semanaCal && ((op && op.semanal) || (lunes && !(op && op.diario)))) {
      try { out.semanal = semanal(v, TS); } catch (e) { out.semanal = null; }
      // Live vs count: lo que encontró el último conteo de la semana
      // pasada, con lo que podría ser (live-diagnostico.js). Un fallo
      // aquí no tumba el resumen: se dice lo que pasó.
      const DG = window.BarStockLiveDiag;
      if (out.semanal && DG && DG.semana) {
        try { out.semanal.conteo = await DG.semana(out.semanal.lunes); }
        catch (e) { out.semanal.conteo = { error: String((e && e.message) || e) }; }
      }
    }
    if (a) {
      out.ayer = {};
      for (const k of ['fecha', 'cargado', 'dinero', 'licor', 'vino', 'normalDinero', 'normalLicor', 'normalVino',
        'botellas', 'botLicor', 'botVino', 'normalBotellas', 'normalBotLicor', 'normalBotVino']) out.ayer[k] = a[k];
    }

    let ro = null;
    try { ro = R && R.ahora ? await R.ahora() : null; }
    catch (e) { out.prevision = 'error'; out.detalle = String((e && e.message) || e); return out; }
    if (!ro) { out.prevision = 'error'; out.detalle = 'The run-out module is not loaded.'; return out; }
    if (ro.estado === 'contando') { out.prevision = 'counting'; return out; }
    if (ro.estado === 'sinConteo') { out.prevision = 'error'; out.detalle = 'there is no closed count to start from yet'; return out; }
    if (ro.estado !== 'listo') { out.prevision = 'error'; out.detalle = ro.error || ro.estado || ''; return out; }
    if (!ro.suficiente) { out.prevision = 'history'; return out; }
    out.hoy = ro.hoy || out.hoy;

    for (const f of ro.filas || []) {
      if (!f || !f.med || !f.med.some(x => x > 0) || !conPar(f.producto)) continue;
      const c = R.cuantoPedir({ stock: f.live, med: f.med, dem: f.dem, viene: f.viene, hoy: out.hoy, hoyVendido: f.hoyVendido, hoyFrac: f.hoyFrac, margen: f.margen });
      if (!(c.pedir > 0)) continue;
      out.agotan.push({ producto: f.producto, queda: f.live, agota: f.agota || c.hasta,
        vende: c.vende, llega: c.llega, pedir: c.pedir });
    }
    return out;
  }

  const D = () => window.BarStockDevPanel;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ── Settings › Toast › Morning email (Axel, 2026-11-17, lámina B) ────
  //
  // "Quiero mandar cualquiera de los 2 a distintos correos si lo
  // necesito, y configurar algunos a los que siempre se envía."
  //   · Arriba Daily | Weekly: la vista cambia y lo que se manda es lo que
  //     se ve. Un lunes abre en Weekly, que es el correo de ese día.
  //   · "Send a test": al reply-to con "[Test]", como siempre.
  //   · "Send to…": una hoja con la lista de siempre ya puesta; se quitan
  //     o se añaden correos, y "Every morning" guarda esos como la lista
  //     que recibe el automático (location_settings.morning_recipients,
  //     la misma de Settings › Emails). El servidor manda sólo a quien
  //     tenga el permiso de ajustes de la locación, a correos válidos y a
  //     10 como mucho.
  // Sustituye a "Send last week's summary (test)" y "Send to the list":
  // con el selector, cada uno era un botón que hacía lo mismo para un
  // solo tipo de correo.
  const CORREO = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
  const MAX_OTROS = 10;
  // La lista guardada, con la regla del servidor (lib/morning-report.js,
  // partirLista): comas o punto y coma, sólo correos, sin repetir.
  function partir(crudo) {
    const vistos = new Set(), out = [];
    for (const x of String(crudo || '').split(/[,;]/).map(t => t.trim())) {
      if (!x || !CORREO.test(x) || vistos.has(x.toLowerCase())) continue;
      vistos.add(x.toLowerCase()); out.push(x);
    }
    return out;
  }
  const cuenta = () => (window.BARSTOCK_CONFIG || {}).ACCOUNT_ID || 'wjm-hospitality';
  const NOMBRE = { daily: 'daily', weekly: 'weekly' };

  // op.tipo ('daily' | 'weekly') abre en ese; sin él, Weekly el lunes.
  async function montar(host, cab, volver, op) {
    host.innerHTML = cab() +
      '<div class="m-mr">' +
        '<div class="m-seg m-mr-tipo" id="mrTipo">' +
          '<button type="button" data-t="daily">Daily</button>' +
          '<button type="button" data-t="weekly">Weekly</button>' +
        '</div>' +
        '<button type="button" class="m-set-save m-mr-test" id="mrSend" disabled>Send a test</button>' +
        '<button type="button" class="m-set-save m-mr-otros" id="mrOtros" disabled>Send to…</button>' +
        '<div class="m-mr-estado" id="mrEstado">Building this morning\'s report…</div>' +
        // Sin scripts: el correo no lleva ninguno. allow-same-origin para
        // medir su alto; los enlaces se abren fuera, no dentro del marco.
        '<iframe class="m-mr-vista" title="Morning email preview" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>' +
      '</div>';
    if (volver) volver();
    const estado = host.querySelector('#mrEstado');
    const bTest = host.querySelector('#mrSend');
    const bOtros = host.querySelector('#mrOtros');
    const marco = host.querySelector('.m-mr-vista');
    const decir = (t) => { if (estado) estado.textContent = t; };
    const avisar = (t) => { decir(t); if (window.BarStockToast) window.BarStockToast.show(t); };

    // Lo que se ve es lo que se manda: los datos de cada tipo se reúnen
    // una vez y se guardan aquí.
    const cache = {};
    let tipo = null, actual = null, version = 0;
    const lunes = () => { const h = new Date(); return h.getDay() === 1; };

    async function elegir(t) {
      tipo = t;
      const v = ++version;
      host.querySelectorAll('#mrTipo button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
      actual = null;
      bTest.disabled = bOtros.disabled = true;
      decir(t === 'weekly' ? 'Building last week\'s summary…' : 'Building this morning\'s report…');
      try {
        if (!cache[t]) {
          const d = await datos(t === 'weekly' ? { semanal: true } : { diario: true });
          if (t === 'weekly' && !d.semanal) throw new Error('there is no full week of Toast sales to summarize yet');
          const r = await D().llamar('report', 'preview', { datos: d });
          if (!r || !r.ok) throw new Error((r && r.error) || 'no answer');
          cache[t] = { d, r };
        }
      } catch (e) {
        if (v === version) decir('Could not build the preview: ' + ((e && e.message) || e));
        return;
      }
      if (v !== version) return;   // ya se eligió el otro
      actual = cache[t];
      if (marco) {
        marco.setAttribute('srcdoc', '<base target="_blank">' + actual.r.html);
        marco.onload = () => {
          try { marco.style.height = marco.contentDocument.documentElement.scrollHeight + 'px'; } catch (e) { /* se queda con su alto */ }
        };
      }
      decir('Subject: ' + actual.r.asunto);
      bTest.disabled = bOtros.disabled = false;
    }
    host.querySelectorAll('#mrTipo button').forEach(b => { b.onclick = () => { if (b.dataset.t !== tipo) elegir(b.dataset.t); }; });

    bTest.onclick = async () => {
      if (!actual) return;
      bTest.disabled = true; bTest.textContent = 'Sending…';
      let s;
      try { s = await D().llamar('report', 'send', { datos: actual.d, para: 'replyto', cuenta: cuenta() }); }
      catch (e) { s = { ok: false, error: (e && e.message) || String(e) }; }
      bTest.disabled = false; bTest.textContent = 'Send a test';
      avisar(s && s.ok ? 'Sent to ' + s.to + '. Check that inbox.' : 'Could not send: ' + ((s && s.error) || 'no answer'));
    };
    bOtros.onclick = () => { if (actual) hoja(actual, tipo, avisar); };

    await elegir((op && op.tipo) || (lunes() ? 'weekly' : 'daily'));
  }

  // ── La hoja "Send to…" ────────────────────────────────────────────────
  async function hoja(actual, tipo, avisar) {
    const LS = window.BarStockLocationSettings;
    let st = null;
    try { st = LS ? await LS.getSettings() : null; } catch (e) { st = null; }
    const guardada = partir(st && st.morning_recipients);
    const rt = String((st && st.reply_to_email) || '').trim();
    let lista = guardada.slice();
    let siempre = false;

    const h = document.createElement('div');
    h.className = 'm-sheet';
    // El id le gana al radio de app.css (cabecera de mobile-app.css).
    h.id = 'mSheet';
    h.innerHTML =
      '<div class="m-sheet-bg"></div>' +
      '<div class="m-sheet-box m-mr-hoja" role="dialog" aria-label="Send the morning email">' +
        '<div class="m-sheet-grip"></div>' +
        '<div class="m-mr-ht">Send the ' + NOMBRE[tipo] + ' email</div>' +
        '<div class="m-sheet-t m-mr-to">To</div>' +
        '<div class="m-mr-chips" id="mrChips"></div>' +
        '<input class="m-mr-add" id="mrAdd" type="email" inputmode="email" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Add an email…">' +
        '<div class="m-mr-err" id="mrErr" hidden></div>' +
        '<button type="button" class="m-mr-siempre" id="mrSiempre" aria-pressed="false">' +
          '<span class="m-mr-ck" aria-hidden="true"></span>' +
          '<span><b>Every morning</b><small>Save these as the people who always get it</small></span></button>' +
        (rt ? '<div class="m-mr-nota">Every morning it also goes to the reply-to, ' + esc(rt) + '.</div>' : '') +
        '<button type="button" class="m-set-save m-mr-mandar" id="mrMandar"></button>' +
      '</div>';
    document.body.appendChild(h);
    const cerrar = () => h.remove();
    if (window.BarStockSheet) window.BarStockSheet.enganchar(h, cerrar);
    h.querySelector('.m-sheet-bg').onclick = cerrar;

    const chips = h.querySelector('#mrChips'), campo = h.querySelector('#mrAdd');
    const err = h.querySelector('#mrErr'), bS = h.querySelector('#mrSiempre'), bM = h.querySelector('#mrMandar');
    const error = (t) => { err.hidden = !t; err.textContent = t || ''; };
    const pintar = () => {
      chips.innerHTML = lista.map((x, i) =>
        '<span class="m-mr-chip">' + esc(x) + '<button type="button" data-i="' + i + '" aria-label="Remove ' + esc(x) + '">✕</button></span>').join('');
      chips.querySelectorAll('button').forEach(b => { b.onclick = () => { lista.splice(Number(b.dataset.i), 1); pintar(); }; });
      bM.textContent = lista.length ? 'Send to ' + lista.length : 'Add someone to send it to';
      bM.disabled = !lista.length;
    };
    // Lo escrito entra como chip al poner coma, Enter o salir del campo.
    const anadir = () => {
      const partes = campo.value.split(/[,;\s]+/).map(t => t.trim()).filter(Boolean);
      const malos = [];
      for (const x of partes) {
        if (!CORREO.test(x)) { malos.push(x); continue; }
        if (!lista.some(y => y.toLowerCase() === x.toLowerCase())) lista.push(x);
      }
      campo.value = malos.join(', ');
      error(malos.length ? 'Not an email address: ' + malos.join(', ') : '');
      pintar();
      return !malos.length;
    };
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); anadir(); } });
    campo.addEventListener('blur', () => { if (campo.value.trim()) anadir(); });
    bS.onclick = () => { siempre = !siempre; bS.setAttribute('aria-pressed', String(siempre)); bS.classList.toggle('on', siempre); };
    pintar();

    bM.onclick = async () => {
      if (campo.value.trim() && !anadir()) return;
      if (!lista.length) return;
      if (lista.length > MAX_OTROS) return error('At most ' + MAX_OTROS + ' addresses at a time.');
      bM.disabled = true; bM.textContent = 'Sending…';
      // Primero la lista de siempre, si se pidió: si no se puede guardar,
      // no se manda, para que no parezca que quedó guardada. Se guarda con
      // TODO lo de la locación: saveSettings pone a vacío lo que no le
      // llega, y guardar sólo la lista borraría el reply-to.
      if (siempre) {
        try {
          const ahora = LS ? await LS.getSettings() : null;
          if (!LS || !ahora) throw new Error('the location settings could not be read');
          await LS.saveSettings(Object.assign({}, ahora, { morning_recipients: lista.join(', ') }));
        } catch (e) {
          error('Could not save the every-morning list: ' + ((e && e.message) || e));
          pintar();
          return;
        }
      }
      let s;
      try { s = await D().llamar('report', 'send', { datos: actual.d, para: 'otros', to: lista.slice() }); }
      catch (e) { s = { ok: false, error: (e && e.message) || String(e) }; }
      if (!s || !s.ok) { error('Could not send: ' + ((s && s.error) || 'no answer')); pintar(); return; }
      cerrar();
      avisar('Sent the ' + NOMBRE[tipo] + ' email to ' + s.to + '.' + (siempre ? ' They’ll get it every morning.' : ''));
    };
  }

  window.BarStockMorningReport = { datos, montar, esc, partir };
})();
