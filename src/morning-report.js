(() => {
  if (window.BarStockMorningReport) return;
  // ── El correo de la mañana, desde la app ─────────────────────────────
  //
  // Axel, 2026-11-12: "constrúyelo y dame una opción de enviarlo
  // manualmente para fines de prueba, en ajustes tal vez". Vive en
  // Settings › Toast › Morning email: al entrar se ve el correo tal cual
  // saldría, y "Send to me" lo manda al correo de quien tiene la sesión
  // (el servidor no acepta otro destinatario; lib/morning-report.js).
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

  async function datos() {
    const TS = window.BarStockToastSales, R = window.BarStockRunOut;
    const out = { local: (window.BARSTOCK_CONFIG || {}).LOCATION_NAME || '', hoy: null, ayer: null,
      agotan: [], prevision: 'ok', detalle: '' };

    const v = TS && TS.ahora ? await TS.ahora().catch(() => null) : null;
    const sem = (v && v.semana) || [];
    const a = sem[sem.length - 1];
    if (v && v.hoy) out.hoy = v.hoy;
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
      const c = R.cuantoPedir({ stock: f.live, med: f.med, viene: f.viene, hoy: out.hoy, hoyVendido: f.hoyVendido });
      if (!(c.pedir > 0)) continue;
      out.agotan.push({ producto: f.producto, queda: f.live, agota: f.agota || c.hasta,
        vende: c.vende, llega: c.llega, pedir: c.pedir });
    }
    return out;
  }

  // ── Settings › Toast › Morning email ─────────────────────────────────
  const D = () => window.BarStockDevPanel;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  async function montar(host, cab, volver) {
    host.innerHTML = cab() +
      '<div class="m-mr">' +
        '<button type="button" class="m-set-save" id="mrSend" disabled>Send to me</button>' +
        '<div id="mrListaCaja"></div>' +
        '<div class="m-mr-estado" id="mrEstado">Building this morning\'s report…</div>' +
        // Sin scripts: el correo no lleva ninguno. allow-same-origin para
        // medir su alto; los enlaces se abren fuera, no dentro del marco.
        '<iframe class="m-mr-vista" title="Morning email preview" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>' +
      '</div>';
    if (volver) volver();
    const estado = host.querySelector('#mrEstado');
    const boton = host.querySelector('#mrSend');
    const marco = host.querySelector('.m-mr-vista');
    const decir = (t) => { if (estado) estado.textContent = t; };

    // Lo que se ve es lo que se manda: los mismos datos, reunidos una vez.
    let d;
    try { d = await datos(); }
    catch (e) { return decir('Could not gather the numbers: ' + ((e && e.message) || e)); }
    let r;
    try { r = await D().llamar('report', 'preview', { datos: d }); }
    catch (e) { return decir('Could not build the preview: ' + ((e && e.message) || e)); }
    if (!r || !r.ok) return decir('Could not build the preview: ' + ((r && r.error) || 'no answer'));
    if (marco) {
      marco.setAttribute('srcdoc', '<base target="_blank">' + r.html);
      marco.onload = () => {
        try { marco.style.height = marco.contentDocument.documentElement.scrollHeight + 'px'; } catch (e) { /* se queda con su alto */ }
      };
    }
    decir('Subject: ' + r.asunto);

    const mandar = async (b, texto, extra, fin) => {
      b.disabled = true;
      b.textContent = 'Sending…';
      let s;
      try { s = await D().llamar('report', 'send', Object.assign({ datos: d }, extra)); }
      catch (e) { s = { ok: false, error: (e && e.message) || String(e) }; }
      b.disabled = false;
      b.textContent = texto;
      const t = s && s.ok ? 'Sent to ' + s.to + '.' + (fin || '') : 'Could not send: ' + ((s && s.error) || 'no answer');
      decir(t);
      if (window.BarStockToast) window.BarStockToast.show(t);
    };
    if (boton) {
      boton.disabled = false;
      boton.onclick = () => mandar(boton, 'Send to me', {}, ' Check your inbox.');
    }

    // ── A la lista de la locación (Settings › Emails) ──────────────────
    // Axel, 2026-11-12: "necesito la posibilidad de mandarlo a más
    // destinatarios". Aquí la lista sólo se CUENTA para el botón: quien
    // la lee para mandar es el servidor, de la base. Es un correo de
    // verdad a varias personas, así que el primer toque pide el segundo,
    // como Reopen en Sent.
    const caja = host.querySelector('#mrListaCaja');
    if (!caja) return;
    let n = 0;
    try {
      const st = window.BarStockLocationSettings ? await window.BarStockLocationSettings.getSettings() : null;
      n = new Set(String((st && st.morning_recipients) || '').split(/[,;]/)
        .map(x => x.trim().toLowerCase()).filter(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))).size;
    } catch (e) { /* sin lista que contar: se dice abajo */ }
    if (!n) {
      caja.innerHTML = '<div class="m-mr-estado">To send it to more people, add them in Settings › Emails › Morning email recipients.</div>';
      return;
    }
    const gente = n + (n === 1 ? ' person' : ' people');
    const texto = 'Send to the list · ' + gente;
    caja.innerHTML = '<button type="button" class="m-set-save m-mr-lista" id="mrLista">' + esc(texto) + '</button>';
    const bl = caja.querySelector('#mrLista');
    let armado = null;
    bl.onclick = () => {
      if (!armado) {
        bl.textContent = 'Tap again to send to ' + gente;
        armado = setTimeout(() => { armado = null; bl.textContent = texto; }, 4000);
        return;
      }
      clearTimeout(armado); armado = null;
      mandar(bl, texto, { para: 'lista', cuenta: (window.BARSTOCK_CONFIG || {}).ACCOUNT_ID || 'wjm-hospitality' });
    };
  }

  window.BarStockMorningReport = { datos, montar, esc };
})();
