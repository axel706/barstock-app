(() => {
  if (window.BarStockDeskCounts) return;

  // ── Reports › Counts en el escritorio (Axel, 2026-11-27) ──
  //
  // La lista es la opción B de la lámina "Counts · desktop" (velocidad y
  // exactitud: cada conteo con su tiempo y su Live vs count); tocar uno
  // abre su REPORTE, el de las láminas que siguieron ("en modo reporte,
  // fácil de entender pero mostrando información útil"; "sin que esto se
  // convierta en una lista infinita"):
  //   1. el resumen junto a "a dónde se fue el dinero" (la cascada);
  //   2. la tabla de todos los productos con SU scroll (la página no
  //      crece), la diferencia en una píldora, el dinero aparte, la
  //      verificación de la semana en su columna, en la misma línea, y
  //      bajo el producto la franja de lo que podría ser;
  //   3. lo que parece un error al contar, lo corto y lo de más, lo que se
  //      repite, lado a lado;
  //   4. semana tras semana.
  // Las cuentas y la lectura son de count-report.js (las usará también el
  // teléfono). Nada escribe.
  //
  // Sin "Recount": no hay forma de abrir el panel de una botella fuera de
  // un conteo activo (CLAUDE.md, pendientes); un botón que no lo hace
  // sería una afordancia que miente.

  const CR = () => window.BarStockCountReport;
  const DH = () => window.BarStockDeskHeader;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n1 = (v) => { const x = Math.round((Number(v) || 0) * 10) / 10; return Number.isInteger(x) ? String(x) : x.toFixed(1); };
  const firma = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + n1(Math.abs(v));
  const fmtUsd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const usd = (v) => fmtUsd.format(Math.abs(Number(v) || 0));
  const usdF = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + usd(v);
  const dur = (ms) => { const S = window.BarStockCountSession; return S && S.fmtDur ? S.fmtDur(ms) : Math.round(ms / 60000) + ' min'; };
  const dia = (iso, largo) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const md = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
    // "Sun Nov 23", sin la coma que pone toLocaleDateString con el día.
    return largo ? d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' }) + ' ' + md : md;
  };
  const hora = (iso) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }); };

  let _sec = null, _base = null, _rep = null, _sel = null, _error = '', _cargando = false;
  let _q = '', _tq = 0, _orden = 'pide', _solo = false, _gen = 0;

  const abierta = () => !!(_sec && _sec.classList.contains('bs-active-section'));
  const caja = () => _sec && _sec.querySelector('#dkCnt');

  // ── Leer ──
  async function cargarLista() {
    const g = ++_gen;
    _cargando = true; _error = ''; pintar();
    try { const b = await CR().lista(); if (g !== _gen) return; _base = b; }
    catch (e) { if (g !== _gen) return; _error = (e && e.message) || String(e); }
    _cargando = false; pintar();
  }
  async function abrirConteo(semana) {
    const g = ++_gen;
    _sel = semana; _rep = null; _q = ''; _solo = false; _orden = 'pide'; _cargando = true; _error = ''; pintar();
    try { const r = await CR().reporte(semana, _base); if (g !== _gen) return; _rep = r; }
    catch (e) { if (g !== _gen) return; _error = (e && e.message) || String(e); }
    _cargando = false; pintar();
    const c = caja(); if (c && window.scrollTo) window.scrollTo(0, 0);
  }
  function aLista() { _gen++; _sel = null; _rep = null; _error = ''; _cargando = false; pintar(); if (!_base) cargarLista(); }

  // ── La lista (opción B) ──
  function htmlLista() {
    const L = (_base && _base.conteos) || [];
    if (!L.length) return '<div class="dkn-nada"><i class="ti ti-clock-hour-4" aria-hidden="true"></i><b>No counts saved yet</b><small>Close a count and it shows up here, with its time and how far it was from Live.</small></div>';
    const u = L[0];
    const tramo = L.slice(0, 12).reverse();
    const max = Math.max.apply(null, tramo.map(x => x.activo)) || 1;
    const live = (x) => x.live
      ? (x.live.lejos ? `<span class="${x.live.corto > 0 ? 'am' : 'ok'}">${x.live.corto > 0 ? '−' + usd(x.live.corto) : '+' + usd(x.live.sobra)} · ${x.live.lejos} far</span>` : '<span class="ok">✓ all close</span>')
      : '<span class="gr">not saved</span>';
    const vs = (x) => x.vs ? `<span class="${x.vs.rapido ? 'ok' : x.vs.lento ? 'ma' : ''}">${x.vs.rapido ? '↘ ' : x.vs.lento ? '↗ ' : ''}${esc(x.vs.txt)}</span>` : `<span class="gr">${x.primero ? 'first saved' : '—'}</span>`;
    return `
      <div class="dkn-cab">
        <div><div class="dkn-k">Last count · ${esc(dia(u.fecha, true))}</div><div class="dkn-big">${esc(dur(u.activo))}</div>
          ${u.vs ? `<div class="dkn-vs ${u.vs.rapido ? 'ok' : u.vs.lento ? 'ma' : ''}">${esc(u.vs.txt)} than the one before</div>` : ''}</div>
        <div class="dkn-m"><b>${esc(u.items)}</b><span>products</span></div>
        <div class="dkn-m"><b>${u.porProducto ? esc(dur(u.porProducto)) : '—'}</b><span>per product</span></div>
        <div class="dkn-m"><b class="${u.live && u.live.corto > 0 ? 'am' : ''}">${u.live ? (u.live.corto > 0 ? '−' + usd(u.live.corto) : u.live.sobra > 0 ? '+' + usd(u.live.sobra) : '$0') : '—'}</b><span>Live vs count</span></div>
        <div class="dkn-ch" aria-hidden="true">${tramo.map((x, i) => `<div><i class="${i === tramo.length - 1 ? 'on' : ''}" style="height:${Math.max(6, Math.round(x.activo / max * 100))}%"></i><small>${esc(dia(x.fecha))}</small></div>`).join('')}</div>
      </div>
      <div class="dkn-cols dkn-lc"><span>COUNT</span><span>ACTIVE</span><span>PRODUCTS</span><span>PER PRODUCT</span><span>VS THE ONE BEFORE</span><span>LIVE VS COUNT</span></div>
      ${L.map(x => `<button type="button" class="dkn-fila dkn-lc" data-cnt="${esc(x.semana)}">
        <span><b>${esc(dia(x.fecha, true))}</b>${x.reconteos ? `<small>+${x.reconteos} recount${x.reconteos === 1 ? '' : 's'}</small>` : ''}</span>
        <span class="n">${esc(dur(x.activo))}</span><span class="n">${esc(x.items)}</span><span class="n">${x.porProducto ? esc(dur(x.porProducto)) : '—'}</span>
        <span class="n">${vs(x)}</span><span class="n">${live(x)}</span></button>`).join('')}`;
  }

  // ── El reporte de un conteo ──
  function frase(r) {
    const R = r.resumen, L = R.live;
    if (r.cicloCorto) return 'This count closed less than three days after the one before, so Live vs count can\'t be compared for it.';
    if (!L) return 'Live vs count was not saved for this count: it started with the counts of Nov 15. Below, what was counted against the count before.';
    const partes = [];
    if (L.corto > 0) partes.push(`The products that were off came up <b>${usd(L.corto)} short</b> of what Live expected` + (L.sobra > 0 ? `, and ${usd(L.sobra)} more on others` : ''));
    else if (L.sobra > 0) partes.push(`The products that were off had <b>${usd(L.sobra)} more</b> than Live expected`);
    else partes.push('Every product Toast sells came out <b>close to what Live expected</b>');
    if (L.dentro != null) partes.push(`<b>${L.dentro} %</b> of them within the rule`);
    let t = partes.join('; ') + '.';
    if (R.revisar) t += ` <b>${R.revisar} look like counting mistakes</b>: check those first.`;
    return t;
  }

  function cascada(c) {
    if (!c) return '';
    const max = Math.max(c.antes, c.esperado, c.contado, 1);
    const h = (v) => Math.max(4, Math.round(Math.abs(v) / max * 100));
    const b = (v, cl, et, t) => `<div><b>${t}</b><i class="${cl}" style="height:${h(v)}%"></i><span>${et}</span></div>`;
    return `<div class="dkn-car dkn-wf">
      <div class="dkn-k">Where the money went</div>
      <div class="dkn-cas">${b(c.antes, '', 'Last count', usd(c.antes))}${b(c.entro, 'p', 'Came in', '+' + usd(c.entro))}${b(c.vendido, 'n', 'Sold in Toast', '−' + usd(c.vendido))}${b(c.esperado, '', 'Expected', usd(c.esperado))}${b(c.contado, 'on', 'Counted', usd(c.contado))}</div>
      <p class="dkn-p">Of what Toast sells: ${usd(c.antes)} at the last count, ${usd(c.entro)} came in, Toast sold ${usd(c.vendido)} → Live expected ${usd(c.esperado)}. Counted ${usd(c.contado)}: ${usd(c.contado - c.esperado)} ${c.contado - c.esperado < 0 ? 'less' : 'more'} than expected, short and more together.</p></div>`;
  }

  function difHtml(x) {
    if (x.estado === 'sinContar') return '<span class="dkn-dif e">not counted</span>';
    if (x.estado === 'even') return '<span class="dkn-dif z"><i class="ti ti-check" aria-hidden="true"></i> even</span>';
    if (x.estado === 'sinLive') return '<span class="gr">no Live</span>';
    return `<span class="dkn-dif ${x.msg && x.msg.tono === 'ro' ? 'e' : x.dif < 0 ? 'm' : 'p'}">${esc(firma(x.dif))}</span>`;
  }
  const filaHtml = (x) => {
    const d = (v) => (v == null ? '<span class="gr">—</span>' : esc(n1(v)));
    const ck = x.check ? `<span class="dkn-ck"><i class="ti ti-check" aria-hidden="true"></i> ${esc(n1(x.check.n))} · ${esc(hora(x.check.at).split(' ')[0])}<span class="ckx"> ${esc(hora(x.check.at).split(' ').slice(1).join(' '))}${x.check.by ? ' · ' + esc(x.check.by) : ''}</span></span>` : '<span class="gr">—</span>';
    return `<div class="dkn-tr${x.msg ? ' cw' : ''}" role="row">
      <span class="nm"><b>${esc(x.item)}</b></span><span>${d(x.tenia)}</span><span>${x.entro == null ? '<span class="gr">—</span>' : (x.entro > 0 ? '+' : '') + esc(n1(x.entro))}</span>
      <span>${x.vendido == null ? '<span class="gr">—</span>' : (x.vendido > 0 ? '−' : '') + esc(n1(x.vendido))}</span><span>${d(x.esperado)}</span><span class="c">${d(x.contado)}</span>
      <span>${difHtml(x)}</span><span class="usd ${x.dinero < 0 ? 'am' : x.dinero > 0 ? 'ok' : ''}">${x.dinero ? esc(usdF(x.dinero)) : '<span class="gr">—</span>'}</span><span>${ck}</span>
      ${x.msg ? `<span class="dkn-wy ${esc(x.msg.tono)}">${esc(x.msg.txt)}</span>` : ''}</div>`;
  };

  function filasVistas(r) {
    let fs = r.filas.slice();
    if (_solo) fs = fs.filter(x => x.estado === 'corto' || x.estado === 'mas');
    const q = _q.trim().toLowerCase();
    if (q) fs = fs.filter(x => x.item.toLowerCase().includes(q));
    const by = {
      pide: null,
      dinero: (a, b) => (a.dinero || 0) - (b.dinero || 0),
      dif: (a, b) => (a.dif == null ? 1e9 : a.dif) - (b.dif == null ? 1e9 : b.dif),
      nombre: (a, b) => a.item.localeCompare(b.item),
      contado: (a, b) => (b.contado || 0) - (a.contado || 0)
    }[_orden];
    if (by) fs.sort(by);
    return fs;
  }

  function htmlReporte(r) {
    const R = r.resumen;
    const fs = filasVistas(r);
    const tabla = `<div class="dkn-tb" role="table" aria-label="Every product">
      <div class="dkn-sc"><div class="dkn-tr dkn-th" role="row"><span>PRODUCT</span><span>HAD</span><span>IN</span><span>SOLD</span><span>EXPECTED</span><span>COUNTED</span><span>DIFFERENCE</span><span>$</span><span>CHECKED</span></div>
      ${fs.length ? fs.map(filaHtml).join('') : '<p class="dkn-vacio">No product matches.</p>'}</div>
      <div class="dkn-pie"><span>${fs.length} of ${r.filas.length} products${_solo ? ' · short and more only · <button type="button" class="dkn-lk" data-cnt-acc="todos">Show all</button>' : ''}</span>
        <span class="lg"><span class="dkn-dif z"><i class="ti ti-check" aria-hidden="true"></i> even</span> within the rule</span><span class="lg"><span class="dkn-dif m">−</span> short</span><span class="lg"><span class="dkn-dif p">+</span> more</span><span class="lg"><span class="dkn-dif e">?</span> likely a counting mistake</span></div></div>`;
    const lin = (x, txt, n, cl) => `<div class="dkn-li"><div><b>${esc(x.item)}</b><small>${txt}</small></div><span class="${cl}">${n}</span></div>`;
    const revisar = r.revisar.length
      ? r.revisar.slice(0, 4).map(x => lin(x, esc(x.msg.txt.split(':')[0]), x.estado === 'sinContar' ? 'not counted' : firma(x.dif || 0), 'ma')).join('') + (r.revisar.length > 4 ? `<p class="dkn-mas">+ ${r.revisar.length - 4} more in the table</p>` : '')
      : '<p class="dkn-nd">Nothing looks like a counting mistake.</p>';
    const top = (xs) => xs.slice(0, 3).map(x => lin(x, esc(x.msg ? x.msg.txt.split(':')[0] : ''), firma(x.dif), x.dif < 0 ? 'am' : 'ok')).join('');
    const cym = (r.cortos.length || r.mas.length) ? `<div class="dkn-dos">
        <div><div class="dkn-k am">${r.cortos.length} short · −${usd(r.dineroCorto)}</div>${top(r.cortos) || '<p class="dkn-nd">None.</p>'}</div>
        <div><div class="dkn-k ok">${r.mas.length} more · +${usd(r.dineroMas)}</div>${top(r.mas) || '<p class="dkn-nd">None.</p>'}</div></div>
        ${r.cortos.length + r.mas.length > 0 ? `<button type="button" class="dkn-lk" data-cnt-acc="solo">See all ${r.cortos.length + r.mas.length} in the table ›</button>` : ''}`
      : `<p class="dkn-nd">${r.sinCiclo ? 'Needs Live vs count, saved since Nov 15.' : 'Nothing came out far from Live.'}</p>`;
    const reinc = r.reincidentes.length
      ? r.reincidentes.slice(0, 4).map(x => `<div class="dkn-li"><div><b>${esc(x.item)}</b><div class="dkn-px">${x.difs.map(d => `<span>${esc(firma(d))}</span>`).join('')}</div></div><span class="${x.lado === 'corto' ? 'am' : 'ok'}">${x.lado === 'corto' ? 'short' : 'more'} · ${x.difs.length} counts</span></div>`).join('')
      : `<p class="dkn-nd">${r.sinCiclo ? 'Needs Live vs count, saved since Nov 15.' : `Nothing off on the same side ${CR().SEGUIDAS} counts in a row.`}</p>`;
    const S = r.semanas || [];
    const smax = Math.max.apply(null, S.map(x => Math.abs(x.corto > 0 ? x.corto : x.sobra)).concat([1]));
    const semanas = S.length ? `<div class="dkn-car"><div class="dkn-k dkn-kr"><span>Week after week · Live vs count</span>${S.length && S[S.length - 1].sinReceta ? `<span class="am">${S[S.length - 1].sinReceta} drinks sold this week without a recipe</span>` : ''}</div>
      <div class="dkn-bars">${S.map(x => { const v = x.corto > 0 ? -x.corto : x.sobra; return `<div><b>${v ? usdF(v) : '$0'}</b><i class="${x.este ? 'on' : ''}${v > 0 ? ' p' : ''}" style="height:${Math.max(4, Math.round(Math.abs(v) / smax * 100))}%"></i><span>${esc(dia(x.fin))}${x.dentro != null ? ' · ' + x.dentro + ' %' : ''}</span></div>`; }).join('')}</div></div>` : '';
    return `
      <div class="dkn-top">
        <div class="dkn-car dkn-verd${R.live && R.live.corto > 0 ? ' am' : ''}">
          <div class="dkn-k">${esc(dia(r.fecha, true))} · ${esc(R.productos)} products · ${esc(dur(R.activo))}${R.vs ? ' · ' + esc(R.vs.txt) : ''}${r.reconteos ? ' · +' + r.reconteos + ' recount' + (r.reconteos === 1 ? '' : 's') : ''}</div>
          <div class="dkn-big ${R.live && R.live.corto > 0 ? 'am' : ''}">${R.live ? (R.live.corto > 0 ? '−' + usd(R.live.corto) : R.live.sobra > 0 ? '+' + usd(R.live.sobra) : '$0') : esc(n1(R.botellas)) + ' bottles'}</div>
          <p class="dkn-p">${frase(r)}</p>
          <div class="dkn-mini">
            <div><b>${esc(n1(R.botellas))}</b><span>bottles${R.botellasAntes != null ? ' · ' + firma(R.botellas - R.botellasAntes) + ' vs the count before' : ''}</span></div>
            <div><b>${usd(R.valor)}</b><span>on the shelf${R.valorAntes != null ? ' · ' + usdF(R.valor - R.valorAntes) : ''}</span></div>
            <div><b class="${R.cortos ? 'am' : ''}">${R.cortos} · ${R.mas}</b><span>short · more${R.nuevos ? ' · ' + R.nuevos + ' new' : ''}</span></div>
          </div>
        </div>
        ${cascada(r.cascada) || `<div class="dkn-car"><div class="dkn-k">Against the count before</div><p class="dkn-p">${R.botellasAntes != null ? `${n1(R.botellasAntes)} bottles then, ${n1(R.botellas)} now (${firma(R.botellas - R.botellasAntes)}); ${usd(R.valorAntes)} then, ${usd(R.valor)} now.` : 'This is the first count saved: nothing to compare with.'}</p></div>`}
      </div>
      <div class="dkn-sk">Every product</div>
      ${tabla}
      <div class="dkn-tres">
        <div class="dkn-car ro"><div class="dkn-k">Check these first · ${r.revisar.length}</div>${revisar}</div>
        <div class="dkn-car am2"><div class="dkn-k">Short and more · ${r.cortos.length + r.mas.length}</div>${cym}</div>
        <div class="dkn-car"><div class="dkn-k">Keeps happening · ${r.reincidentes.length}</div>${reinc}</div>
      </div>
      ${semanas}`;
  }

  function pintar() {
    const c = caja();
    if (!c || !abierta()) return;
    let html;
    if (_error) html = `<div class="dkn-nada mal"><i class="ti ti-alert-triangle" aria-hidden="true"></i><b>Could not load the counts</b><small>${esc(_error)}</small></div>`;
    else if (_cargando || (!_sel && !_base) || (_sel && !_rep)) html = '<div class="dkn-nada"><b>Loading…</b></div>';
    else html = _sel ? htmlReporte(_rep) : htmlLista();
    c.dataset.vista = _sel ? 'rep' : 'lista';
    c.innerHTML = html;
    const D = DH();
    if (D && D.refrescar) D.refrescar('counts');
  }
  // Sólo la tabla, al escribir en el filtro (el resto no cambia).
  function pintarTabla() {
    const c = caja();
    if (!c || !_rep) return pintar();
    const nuevo = document.createElement('div');
    nuevo.innerHTML = htmlReporte(_rep);
    const v = c.querySelector('.dkn-tb'), n = nuevo.querySelector('.dkn-tb');
    if (v && n) v.replaceWith(n); else pintar();
  }

  function alClic(ev) {
    const f = ev.target.closest('[data-cnt]');
    if (f) return abrirConteo(f.dataset.cnt);
    const a = ev.target.closest('[data-cnt-acc]');
    if (!a) return;
    if (a.dataset.cntAcc === 'solo') { _solo = true; _orden = 'dinero'; pintar(); const t = caja().querySelector('.dkn-tb'); if (t && t.scrollIntoView) t.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    if (a.dataset.cntAcc === 'todos') { _solo = false; pintarTabla(); }
  }

  // ── El header de sitios fijos ──
  const ORDENES = [['pide', 'What to look at first'], ['dinero', 'Money'], ['dif', 'Difference'], ['contado', 'Counted'], ['nombre', 'Name']];
  const CAB = {
    busca: false,
    titulo: () => (_sel && _rep ? [{ t: 'Counts', miga: 'lista' }, dia(_rep.fecha, true)] : _sel ? [{ t: 'Counts', miga: 'lista' }, '…'] : 'Counts'),
    alTitulo() { if (_sel) aLista(); else if (window.scrollTo) window.scrollTo(0, 0); },
    vistas() { return ''; },
    afinar() {
      const D = DH();
      if (!_sel || !_rep) return [D.vacio(), D.vacio(), D.vacio()];
      const o = ORDENES.find(x => x[0] === _orden);
      return [D.campo({ id: 'dknQ', icon: 'ti-search', placeholder: 'Product', value: _q }),
        D.boton({ acc: 'orden', icon: 'ti-arrows-sort', label: 'Sort', en: _orden !== 'pide', valor: 'Sort: ' + (o ? o[1] : '') }), D.vacio()];
    },
    acciones() {
      const D = DH();
      if (!_sel || !_rep) return [D.vacio(), D.vacio()];
      return [D.boton({ acc: 'antes', icon: 'ti-chevron-left', label: 'Count before', apagado: !_rep.anterior }),
        D.boton({ acc: 'despues', icon: 'ti-chevron-right', label: 'Count after', apagado: !_rep.siguiente })];
    },
    extras() { return []; },
    alClic(ev, t) {
      const k = t.dataset.dkc;
      if (k === 'miga') return aLista();
      if (k === 'antes' && _rep && _rep.anterior) return abrirConteo(_rep.anterior);
      if (k === 'despues' && _rep && _rep.siguiente) return abrirConteo(_rep.siguiente);
      if (k === 'orden') DH().menu(t, [{ h: 'Sort' }].concat(ORDENES.map(([v, l]) => ({ icon: _orden === v ? 'ti-check' : 'ti-point', label: l, fn: () => { _orden = v; pintarTabla(); DH().refrescar('counts'); } }))));
    },
    alEscribir(ev) {
      if (ev.target.id !== 'dknQ') return;
      _q = ev.target.value;
      clearTimeout(_tq);
      _tq = setTimeout(() => { _tq = 0; pintarTabla(); }, 120);
    }
  };

  // Al abrir: la lista, leída otra vez (un conteo recién cerrado tiene
  // que salir). Lo abierto se queda abierto si se vuelve a la sección.
  function alAbrirCerrar() {
    if (!abierta()) return;
    if (_sel) return pintar();
    cargarLista();
  }

  function montar() {
    if (_sec) return;
    const wrap = document.querySelector('.wrap');
    if (!wrap) return;
    _sec = document.createElement('section');
    _sec.className = 'card section-card dk-pantalla dk-cnt-sec';
    _sec.id = 'countsSection';
    _sec.innerHTML = '<div id="dkCnt"></div>';
    wrap.appendChild(_sec);
    _sec.querySelector('#dkCnt').addEventListener('click', alClic);
    new MutationObserver(alAbrirCerrar).observe(_sec, { attributes: true, attributeFilter: ['class'] });
    const D = DH();
    if (D && D.registrar) D.registrar('counts', CAB);
  }

  if (document.querySelector('.wrap')) montar();
  else document.addEventListener('DOMContentLoaded', montar);

  window.BarStockDeskCounts = { montar, abierta, abrirConteo, aLista, _estado: () => ({ sel: _sel, rep: _rep, base: _base, error: _error }) };
})();
