(() => {
  if (window.BarStockConsumptionReport) return;

  // ── Reporte de Consumption Match ─────────────────────────────────────
  //
  // Eliges artículos categoría por categoría, los mandas al reporte, y
  // sale un PDF con el mismo aspecto que Cost Report para enviar por
  // correo.
  //
  // ── Las cifras siguen sin recalcularse ──────────────────────────────
  //
  // Este módulo NO vuelve a computar used, sold ni loss. Recibe los
  // grupos que Consumption Match ya tiene —que a su vez vienen de
  // Usage— y solo los filtra por los artículos elegidos. La suma de una
  // categoría en el reporte es la suma de SUS artículos elegidos, no la
  // de la categoría entera: si eliges dos de cinco, el total baja, y
  // tiene que bajar.
  //
  // ── Dos pasos a propósito ───────────────────────────────────────────
  //
  // Marcar no es enviar. Marcas, revisas, y "Send to report" confirma.
  // Un solo paso sería más corto, pero entonces cada toque accidental
  // en la lista entra en un documento que acaba en el correo de otra
  // persona.
  //
  // ── La selección sobrevive al refresco ──────────────────────────────
  //
  // Vive en localStorage, por locación y por ciclo. Elegir cuarenta
  // artículos y perderlos por recargar la página sería el tipo de fallo
  // que hace que nadie vuelva a usar la pantalla. Por ciclo y no global
  // porque mezclar semanas en un mismo reporte daría un total que no
  // corresponde a ningún periodo real.

  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }
  const money  = (n) => '$' + Math.round(Math.abs(n)).toLocaleString();
  const money2 = (n) => '$' + Math.abs(n).toFixed(2);
  const btl    = (n) => Math.abs(n).toFixed(1).replace(/\.0$/, '');
  const btlSigned = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + btl(n);

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dayLabel = (w) => w ? MONTHS[+w.slice(5, 7) - 1] + ' ' + (+w.slice(8, 10)) : '';
  const longLabel = (w) => {
    if (!w) return '';
    const FULL = ['January','February','March','April','May','June','July',
                  'August','September','October','November','December'];
    return FULL[+w.slice(5, 7) - 1] + ' ' + (+w.slice(8, 10)) + ', ' + w.slice(0, 4);
  };

  function cfg() {
    const c = window.BARSTOCK_CONFIG || {};
    return { url: c.SUPABASE_URL, key: c.SUPABASE_KEY,
             loc: c.LOCATION_NAME || 'The Crown Tavern' };
  }

  // ── Estado ───────────────────────────────────────────────────────────
  let _week = null;
  let _picked = new Set();     // confirmados, en el reporte
  let _pending = new Set();    // marcados pero aún sin enviar
  let _notes = new Map();      // 'item:NOMBRE' | 'category:NOMBRE' -> texto
  let _showSold = true;
  let _showPoured = true;

  const key = () => `bs.cmreport.${cfg().loc}.${_week || 'none'}`;

  function load(week) {
    _week = week;
    _pending = new Set();
    try {
      const raw = localStorage.getItem(key());
      const d = raw ? JSON.parse(raw) : null;
      _picked = new Set(Array.isArray(d?.items) ? d.items : []);
      _showSold = d?.showSold !== false;
      _showPoured = d?.showPoured !== false;
    } catch (e) {
      _picked = new Set();
    }
  }

  function save() {
    try {
      localStorage.setItem(key(), JSON.stringify({
        items: [..._picked], showSold: _showSold, showPoured: _showPoured
      }));
    } catch (e) { /* modo privado de Safari: se pierde, no se rompe */ }
  }

  // ── Notas ────────────────────────────────────────────────────────────
  async function loadNotes(week) {
    _notes = new Map();
    const { url, key: k, loc } = cfg();
    if (!url) return;
    try {
      const lr = await fetch(
        `${url}/rest/v1/locations?name=eq.${encodeURIComponent(loc)}&select=id`,
        { headers: { apikey: k, Authorization: `Bearer ${k}` } });
      const ld = await lr.json();
      if (!ld?.length) return;
      const res = await fetch(
        `${url}/rest/v1/consumption_notes?location_id=eq.${ld[0].id}&week_start=eq.${week}&select=scope,ref,note`,
        { headers: { apikey: k, Authorization: `Bearer ${k}` } });
      const rows = await res.json();
      for (const r of rows || []) _notes.set(r.scope + ':' + r.ref, r.note || '');
    } catch (e) {
      console.warn('[cmreport] no se pudieron leer las notas', e);
    }
  }

  async function saveNote(scope, ref, note) {
    const k2 = scope + ':' + ref;
    if (note) _notes.set(k2, note); else _notes.delete(k2);

    const { url, key: k, loc } = cfg();
    if (!url) return;
    try {
      const lr = await fetch(
        `${url}/rest/v1/locations?name=eq.${encodeURIComponent(loc)}&select=id`,
        { headers: { apikey: k, Authorization: `Bearer ${k}` } });
      const ld = await lr.json();
      if (!ld?.length) return;
      const locId = ld[0].id;

      if (!note) {
        await fetch(`${url}/rest/v1/consumption_notes?location_id=eq.${locId}` +
                    `&week_start=eq.${_week}&scope=eq.${scope}&ref=eq.${encodeURIComponent(ref)}`,
          { method: 'DELETE', headers: { apikey: k, Authorization: `Bearer ${k}` } });
        return;
      }
      // merge-duplicates se apoya en el unique de la migración: guardar
      // dos veces corrige la nota en vez de crear una segunda fila.
      await fetch(`${url}/rest/v1/consumption_notes?on_conflict=location_id,week_start,scope,ref`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', apikey: k, Authorization: `Bearer ${k}`,
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({
          location_id: locId, week_start: _week, scope, ref,
          note, updated_at: new Date().toISOString()
        })
      });
    } catch (e) {
      console.warn('[cmreport] no se pudo guardar la nota', e);
      if (typeof setStatus === 'function') setStatus('Note kept on screen but not saved to the cloud.');
    }
  }

  // ── Los grupos, filtrados por lo elegido ─────────────────────────────
  //
  // Se reconstruyen los totales desde los artículos elegidos. Reutilizar
  // g.sold y g.used tal cual daría el total de la categoría entera junto
  // a una lista de tres artículos: un documento que no cuadra consigo
  // mismo delante de quien lo recibe.
  function picked(groups) {
    const out = [];
    for (const g of groups || []) {
      const items = (g.items || []).filter(it => _picked.has(it.item));
      if (!items.length) continue;
      out.push({
        cat: g.cat,
        items,
        sold: items.reduce((s, i) => s + i.sold, 0),
        used: items.reduce((s, i) => s + i.used, 0),
        loss: items.reduce((s, i) => s + i.money, 0)
      });
    }
    return out.sort((a, b) => b.loss - a.loss);
  }

  // ── Gráfica del reporte ──────────────────────────────────────────────
  const LBL = 20;
  function chart(sel) {
    const data = sel.filter(g => g.sold > 0 || g.used > 0);
    if (!data.length) return '';
    const max = Math.max(...data.map(g => Math.max(g.sold, g.used)), 1);

    const grid = [0, 0.5, 1].map(f => `
      <div class="cm-gline" style="bottom:calc(${LBL}px + ${f} * (100% - ${LBL}px))"></div>
      <div class="cm-glbl"  style="bottom:calc(${LBL}px + ${f} * (100% - ${LBL}px))">${Math.round(max * f)}</div>
    `).join('');

    const cols = data.map(g => `
      <div class="cm-col" title="${esc(g.cat)} · ${btl(g.sold)} sold, ${btl(g.used)} poured">
        <div class="cm-bars">
          <span class="cm-b cm-b-sold" style="height:${Math.max(1.5, (g.sold / max) * 100)}%"></span>
          <span class="cm-b cm-b-used" style="height:${Math.max(1.5, (g.used / max) * 100)}%"></span>
        </div>
        <span class="cm-xlabel">${esc(g.cat.split(/[\s&]/)[0])}</span>
      </div>`).join('');

    return `
      <div class="cm-chart">${grid}<div class="cm-plot">${cols}</div></div>
      <div class="cm-legend">
        <span><i class="cm-key cm-b-sold"></i>Sold</span>
        <span><i class="cm-key cm-b-used"></i>Poured</span>
      </div>`;
  }

  // ── Vista del reporte ────────────────────────────────────────────────
  function view(groups) {
    const sel = picked(groups);
    if (!sel.length) {
      return `<div class="cm-empty">
        <b>Nothing in the report yet.</b><br>
        Open a category, tick the items you want and press Send to report.
      </div>`;
    }

    const total = sel.reduce((s, g) => s + Math.max(0, g.loss), 0);
    const count = sel.reduce((s, g) => s + g.items.length, 0);

    const cols = 1 + (_showPoured ? 1 : 0) + (_showSold ? 1 : 0) + 2;

    const blocks = sel.map(g => {
      const note = _notes.get('category:' + g.cat) || '';
      return `
      <div class="cmr-block">
        <div class="cmr-blockhead">
          <span class="cmr-cat">${esc(g.cat)}</span>
          <span class="cmr-catmoney">${money(g.loss)}</span>
        </div>
        <div class="cmr-note ${note ? 'has' : ''}">
          <textarea rows="1" placeholder="Note for ${esc(g.cat)}…"
            onchange="window.BarStockConsumptionReport.setNote('category','${esc(g.cat).replace(/'/g, '&#39;')}', this.value)"
          >${esc(note)}</textarea>
        </div>
        <table class="cm-table cmr-table">
          <thead><tr>
            <th>Item</th>
            ${_showPoured ? '<th class="num">Poured</th>' : ''}
            ${_showSold ? '<th class="num">Sold</th>' : ''}
            <th class="num">Bottles</th>
            <th class="num">At cost</th>
          </tr></thead>
          <tbody>
            ${g.items.map(it => {
              const n = _notes.get('item:' + it.item) || '';
              const cls = it.bottles > 0.05 ? 'bad' : it.bottles < -0.05 ? 'good' : '';
              return `
                <tr>
                  <td class="cm-c1">${esc(it.item)}</td>
                  ${_showPoured ? `<td class="num">${btl(it.used)}</td>` : ''}
                  ${_showSold ? `<td class="num">${btl(it.sold)}</td>` : ''}
                  <td class="num ${cls}">${btlSigned(it.bottles)}</td>
                  <td class="num money ${cls}"><b>${it.money < 0 ? '+' : ''}${money(it.money)}</b></td>
                </tr>
                <tr class="cmr-noterow">
                  <td colspan="${cols}">
                    <div class="cmr-note ${n ? 'has' : ''}">
                      <textarea rows="1" placeholder="Note for ${esc(it.item)}…"
                        onchange="window.BarStockConsumptionReport.setNote('item','${esc(it.item).replace(/'/g, '&#39;')}', this.value)"
                      >${esc(n)}</textarea>
                    </div>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
    }).join('');

    return `
      <div class="cmr-bar">
        <label class="cmr-check">
          <input type="checkbox" ${_showPoured ? 'checked' : ''}
                 onchange="window.BarStockConsumptionReport.toggleCol('poured')"> Show poured
        </label>
        <label class="cmr-check">
          <input type="checkbox" ${_showSold ? 'checked' : ''}
                 onchange="window.BarStockConsumptionReport.toggleCol('sold')"> Show sold
        </label>
        <span class="cmr-spacer"></span>
        <span class="cmr-act" role="button" tabindex="0"
              onclick="window.BarStockConsumptionReport.exportPdf()">
          <i class="ti ti-download" aria-hidden="true"></i> Export PDF
        </span>
        <span class="cmr-act" role="button" tabindex="0"
              onclick="window.BarStockConsumptionReport.openEmail()">
          <i class="ti ti-mail" aria-hidden="true"></i> Email
        </span>
        <span class="cmr-act danger" role="button" tabindex="0"
              onclick="window.BarStockConsumptionReport.clearAll()">
          <i class="ti ti-trash" aria-hidden="true"></i> Clear
        </span>
      </div>

      <div class="cm-headzone">
        <div class="cm-total">
          <b>${money(total)}</b>
          <span>across ${count} item${count === 1 ? '' : 's'} in ${sel.length} categor${sel.length === 1 ? 'y' : 'ies'}, at cost</span>
        </div>
        ${chart(sel)}
      </div>

      ${blocks}`;
  }

  // ── PDF ──────────────────────────────────────────────────────────────
  //
  // Mismo lenguaje visual que Cost Report: cabecera azul marino con la
  // línea de acento, píldoras de resumen, banners por sección y tablas
  // de autoTable. No se comparte código con cost-report.js porque allí
  // el dibujo está dentro de una función de 400 líneas atada a sus
  // propios datos; extraerlo tocaría el informe que ya envía cada mes.
  const NAVY  = [15, 23, 42];
  const BLUE  = [56, 189, 248];
  const WHITE = [248, 250, 252];
  const GRAY  = [100, 116, 139];
  const RED   = [168, 45, 45];
  const GREEN = [29, 158, 117];

  function buildPdf(groups) {
    const sel = picked(groups);
    if (!sel.length) { alert('Nothing in the report yet.'); return null; }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin + 10;

    const location = (cfg().loc || 'BarStock').toUpperCase();
    const total = sel.reduce((s, g) => s + Math.max(0, g.loss), 0);
    const count = sel.reduce((s, g) => s + g.items.length, 0);

    function ensureSpace(need) { if (y > pageH - margin - need) { pdf.addPage(); y = margin + 10; } }
    function drawBanner(text) {
      pdf.setFillColor(...NAVY);
      pdf.roundedRect(margin, y, pageW - margin * 2, 24, 4, 4, 'F');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(224, 242, 254);
      pdf.text(text, pageW / 2, y + 16, { align: 'center' });
      y += 24;
    }
    function drawRoundedBlock(a, b) {
      pdf.setDrawColor(200, 215, 230); pdf.setLineWidth(0.8);
      pdf.roundedRect(margin, a, pageW - margin * 2, b - a, 6, 6, 'S');
    }

    // ── Cabecera ──
    const hdrH = y + 42;
    pdf.setFillColor(...NAVY); pdf.rect(0, 0, pageW, hdrH, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(22); pdf.setTextColor(...WHITE);
    pdf.text('BarStock', margin, y + 16);
    const bw = pdf.getTextWidth('BarStock');
    pdf.setFillColor(...BLUE); pdf.circle(margin + bw + 3.5, y + 13.5, 2.6, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(...GRAY);
    pdf.text('PRO', margin + bw + 9, y + 16);

    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
    const locW = pdf.getTextWidth(location) + 16;
    pdf.setFillColor(...BLUE); pdf.roundedRect(margin, y + 20, locW, 14, 7, 7, 'F');
    pdf.setTextColor(...NAVY); pdf.text(location, margin + locW / 2, y + 30, { align: 'center' });

    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...WHITE);
    pdf.text('CONSUMPTION MATCH', pageW - margin, y + 14, { align: 'right' });
    const per = 'Week of ' + longLabel(_week);
    pdf.setFontSize(8);
    const perW = pdf.getTextWidth(per) + 16;
    pdf.setFillColor(...BLUE); pdf.roundedRect(pageW - margin - perW, y + 20, perW, 14, 7, 7, 'F');
    pdf.setTextColor(...NAVY); pdf.text(per, pageW - margin - perW / 2, y + 30, { align: 'center' });

    y = hdrH;
    pdf.setFillColor(...BLUE); pdf.rect(0, y, pageW, 3, 'F');
    y += 28;

    const tableW = pageW - margin * 2;

    // ── Tres píldoras ──
    const cardH = 78, cardW = (tableW - 16) / 3;
    [
      { label: 'POURED BEYOND SALES', main: money(total), sub: 'at cost', color: RED },
      { label: 'ITEMS IN THIS REPORT', main: String(count), sub: `${sel.length} categor${sel.length === 1 ? 'y' : 'ies'}`, color: NAVY },
      { label: 'BOTTLES UNACCOUNTED',
        main: btl(sel.reduce((s, g) => s + g.items.reduce((a, i) => a + Math.max(0, i.bottles), 0), 0)),
        sub: 'poured with no sale', color: NAVY }
    ].forEach((c, i) => {
      const x = margin + i * (cardW + 8);
      pdf.setFillColor(240, 249, 255); pdf.roundedRect(x, y, cardW, cardH, 8, 8, 'F');
      pdf.setDrawColor(...BLUE); pdf.setLineWidth(0.8); pdf.roundedRect(x, y, cardW, cardH, 8, 8, 'S');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(...GRAY);
      pdf.text(c.label, x + 14, y + 20);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(19); pdf.setTextColor(...c.color);
      pdf.text(c.main, x + 14, y + 46);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(...GRAY);
      pdf.text(c.sub, x + 14, y + 62);
    });
    y += cardH + 18;

    // ── Gráfica: barras a mano ──
    //
    // Se dibuja con rectángulos en vez de incrustar la del navegador
    // como imagen: una captura del canvas sale borrosa al imprimir y
    // arrastra los colores del tema oscuro a un papel blanco.
    const withBars = sel.filter(g => g.sold > 0 || g.used > 0);
    if (withBars.length) {
      ensureSpace(190);
      const blockStart = y;
      drawBanner('SOLD  vs  POURED  —  SELECTED ITEMS');
      const chartH = 118, base = y + 12 + chartH, left = margin + 34;
      const usable = tableW - 44;
      const max = Math.max(...withBars.map(g => Math.max(g.sold, g.used)), 1);
      const slot = usable / withBars.length;
      const barW = Math.min(16, slot / 3);

      pdf.setDrawColor(214, 226, 240); pdf.setLineWidth(0.5);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(...GRAY);
      [0, 0.5, 1].forEach(f => {
        const gy = base - f * chartH;
        pdf.line(left, gy, margin + tableW - 6, gy);
        pdf.text(String(Math.round(max * f)), left - 6, gy + 2, { align: 'right' });
      });

      withBars.forEach((g, i) => {
        const cx = left + i * slot + slot / 2;
        const hS = Math.max(1, (g.sold / max) * chartH);
        const hU = Math.max(1, (g.used / max) * chartH);
        pdf.setFillColor(34, 197, 94);
        pdf.rect(cx - barW - 1, base - hS, barW, hS, 'F');
        pdf.setFillColor(245, 158, 11);
        pdf.rect(cx + 1, base - hU, barW, hU, 'F');
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.5); pdf.setTextColor(...NAVY);
        pdf.text(g.cat.split(/[\s&]/)[0].substring(0, 10), cx, base + 11, { align: 'center' });
      });

      // Leyenda
      const legY = base + 24;
      pdf.setFillColor(34, 197, 94); pdf.rect(left, legY - 5, 7, 7, 'F');
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(...GRAY);
      pdf.text('Sold', left + 12, legY + 1);
      pdf.setFillColor(245, 158, 11); pdf.rect(left + 44, legY - 5, 7, 7, 'F');
      pdf.text('Poured', left + 56, legY + 1);

      y = legY + 12;
      drawRoundedBlock(blockStart, y);
      y += 16;
    }

    // ── Una sección por categoría ──
    const HEAD = { fillColor: [224, 242, 254], textColor: NAVY, fontStyle: 'bold', fontSize: 7.5,
                   cellPadding: { top: 5, right: 8, bottom: 5, left: 8 } };
    const BODY = { fontSize: 8, textColor: NAVY, cellPadding: { top: 5, right: 8, bottom: 5, left: 8 },
                   valign: 'middle' };

    for (const g of sel) {
      ensureSpace(90);
      const blockStart = y;
      drawBanner(`${g.cat.toUpperCase()}  —  ${money(g.loss)}`);

      const catNote = _notes.get('category:' + g.cat) || '';
      if (catNote) {
        pdf.setFont('helvetica', 'italic'); pdf.setFontSize(8); pdf.setTextColor(...GRAY);
        const lines = pdf.splitTextToSize(catNote, tableW - 24);
        pdf.text(lines, margin + 12, y + 14);
        y += 10 + lines.length * 10;
      }

      const head = ['Item'];
      if (_showPoured) head.push('Poured');
      if (_showSold) head.push('Sold');
      head.push('Bottles', 'At cost');

      const nCols = head.length;
      const body = [];
      const noteRows = [];      // índices de fila que son una nota
      for (const it of g.items) {
        const r = [it.item];
        if (_showPoured) r.push(btl(it.used));
        if (_showSold) r.push(btl(it.sold));
        r.push(btlSigned(it.bottles), money2(it.money));
        body.push(r);

        const n = _notes.get('item:' + it.item);
        if (n) {
          noteRows.push(body.length);
          // El colSpan va AQUÍ, en la definición de la celda. Ponerlo en
          // didParseCell no surte efecto: para entonces autoTable ya ha
          // repartido el ancho de las columnas, y la nota salía metida en
          // la primera de ellas, cortada.
          body.push([{
            content: n,
            colSpan: nCols,
            styles: { fontStyle: 'italic', textColor: GRAY, fontSize: 7.5,
                      fillColor: [255, 255, 255], halign: 'left' }
          }]);
        }
      }

      const colStyles = { 0: { halign: 'left', cellWidth: 'auto' } };
      for (let i = 1; i < nCols; i++) colStyles[i] = { halign: 'right', cellWidth: 62 };

      pdf.autoTable({
        startY: y,
        margin: { left: margin, right: margin },
        head: [head],
        body,
        headStyles: HEAD,
        bodyStyles: BODY,
        alternateRowStyles: { fillColor: [248, 250, 253] },
        columnStyles: colStyles,
        theme: 'plain',
        didParseCell: (data) => {
          if (data.section !== 'body') return;
          // La nota ya trae su estilo y su colSpan de la definición; aquí
          // solo hay que no pintarla de rojo como si fuera una cifra.
          if (noteRows.includes(data.row.index)) return;
          if (data.column.index === nCols - 2 || data.column.index === nCols - 1) {
            const v = parseFloat(String(data.cell.raw).replace(/[^0-9.\-−]/g, '').replace('−', '-'));
            if (String(data.cell.raw).startsWith('+') || v > 0) {
              data.cell.styles.textColor = RED; data.cell.styles.fontStyle = 'bold';
            } else if (String(data.cell.raw).startsWith('−')) {
              data.cell.styles.textColor = GREEN; data.cell.styles.fontStyle = 'bold';
            }
          }
        },
        didDrawCell: (data) => {
          if (data.section === 'body') {
            pdf.setDrawColor(218, 224, 234); pdf.setLineWidth(0.3);
            pdf.line(data.cell.x, data.cell.y + data.cell.height,
                     data.cell.x + data.cell.width, data.cell.y + data.cell.height);
          }
        }
      });
      y = pdf.lastAutoTable.finalY;
      drawRoundedBlock(blockStart, y);
      y += 14;
    }

    // ── Pie: qué significa este número ──
    ensureSpace(56);
    pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7.5); pdf.setTextColor(...GRAY);
    const foot = pdf.splitTextToSize(
      'Figures are at cost, not menu price: this is the value of the stock, not lost revenue. ' +
      '"Poured" is opening stock plus deliveries minus closing count. Items with no line in the ' +
      'sales files are excluded from every total. Only the items selected for this report are included.',
      tableW);
    pdf.text(foot, margin, y + 8);

    return pdf;
  }

  function exportPdf() {
    const groups = window.BarStockConsumptionMatch?.groups?.() || [];
    const pdf = buildPdf(groups);
    if (!pdf) return;
    pdf.save(`consumption_match_${_week}.pdf`);
    if (typeof setStatus === 'function') setStatus('Consumption Match PDF generated.');
  }

  // ── Email ────────────────────────────────────────────────────────────
  const ENDPOINT = 'https://barstock-app.vercel.app/api/send-theoretical-report';
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e).trim());

  async function openEmail() {
    const groups = window.BarStockConsumptionMatch?.groups?.() || [];
    if (!picked(groups).length) { alert('Nothing in the report yet.'); return; }
    const bg = $('cmEmailModalBg');
    if (!bg) { alert('Email dialog not available.'); return; }
    const to = $('cmEmailTo'), cc = $('cmEmailCc');
    if (window.BarStockSenderProfile) {
      try {
        const p = await window.BarStockSenderProfile.load();
        if (p) {
          if (to && !to.value && p.reportRecipients) to.value = p.reportRecipients;
          if (cc && !cc.value && p.ccRecipients) cc.value = p.ccRecipients;
        }
      } catch (e) { /* el perfil es una comodidad, no un requisito */ }
    }
    const sum = $('cmEmailSummary');
    if (sum) {
      const sel = picked(groups);
      const total = sel.reduce((s, g) => s + Math.max(0, g.loss), 0);
      const count = sel.reduce((s, g) => s + g.items.length, 0);
      sum.innerHTML = `<b>${money(total)}</b> across ${count} item${count === 1 ? '' : 's'}
        in ${sel.length} categor${sel.length === 1 ? 'y' : 'ies'} · week of ${esc(longLabel(_week))}`;
    }
    bg.classList.remove('hidden');
  }

  function closeEmail() { $('cmEmailModalBg')?.classList.add('hidden'); }

  async function sendEmail() {
    const to = String($('cmEmailTo')?.value || '').trim();
    const cc = String($('cmEmailCc')?.value || '').trim();
    const btn = $('cmEmailSendBtn');

    if (!to || !to.split(',').map(e => e.trim()).filter(Boolean).every(validEmail)) {
      alert('Please enter a valid recipient email address.');
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    try {
      const groups = window.BarStockConsumptionMatch?.groups?.() || [];
      const sel = picked(groups);
      const pdf = buildPdf(groups);
      if (!pdf) throw new Error('PDF generation returned empty.');
      const pdfBase64 = pdf.output('datauristring').split(',')[1];

      let senderName = '', senderEmail = '';
      if (window.BarStockSenderProfile) {
        try { const p = await window.BarStockSenderProfile.load();
              senderName = p?.name || ''; senderEmail = p?.email || ''; } catch (e) {}
      }

      // Se reutiliza el endpoint del informe de Usage con un título
      // distinto. Vercel Hobby permite doce funciones y hay once: gastar
      // la última en un correo casi idéntico dejaría a la app sin margen
      // para lo siguiente que haga falta de verdad.
      const res = await fetch(ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to, cc,
          reportTitle: 'Consumption Match Report',
          locationName: cfg().loc,
          weekStart: _week,
          totalLoss: sel.reduce((s, g) => s + Math.max(0, g.loss), 0),
          itemsAnalyzed: sel.reduce((s, g) => s + g.items.length, 0),
          noSalesCount: 0,
          senderName, senderEmail,
          pdfBase64,
          filename: `consumption_match_${_week}.pdf`
        })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Unknown error');

      closeEmail();
      if (typeof setStatus === 'function') setStatus('Consumption Match report emailed.');
      alert('Report sent to ' + to);
    } catch (err) {
      console.error('[cmreport]', err);
      alert('Could not send report: ' + (err.message || String(err)));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Send'; }
    }
  }

  // ── API ──────────────────────────────────────────────────────────────
  function toggleCol(which) {
    if (which === 'sold') _showSold = !_showSold; else _showPoured = !_showPoured;
    save();
    window.BarStockConsumptionMatch?.paint();
  }

  function setNote(scope, ref, text) {
    saveNote(scope, ref, String(text || '').trim());
  }

  function clearAll() {
    if (!confirm('Remove every item from the report? The notes stay saved.')) return;
    _picked = new Set();
    _pending = new Set();
    save();
    window.BarStockConsumptionMatch?.goCycles();
  }

  window.BarStockConsumptionReport = {
    load, loadNotes, save, view, picked,
    exportPdf, openEmail, closeEmail, sendEmail,
    toggleCol, setNote, clearAll,
    // Estado que consulta Consumption Match para pintar las casillas
    get picked_() { return _picked; },
    get pending() { return _pending; },
    get week() { return _week; },
    isPicked: (n) => _picked.has(n),
    isPending: (n) => _pending.has(n),
    togglePending(n) { _pending.has(n) ? _pending.delete(n) : _pending.add(n); },
    pendingCount: () => _pending.size,
    pickedCount: () => _picked.size,
    commit() {
      // Enviar al reporte es mover lo marcado a lo confirmado. Se vacía
      // lo pendiente para que la siguiente categoría empiece limpia.
      for (const n of _pending) _picked.add(n);
      _pending = new Set();
      save();
    },
    removeItem(n) { _picked.delete(n); save(); }
  };
})();
