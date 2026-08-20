(() => {
  if (window.BarStockEmailOrder?.active) return;

  let _emailOrderContext = null;
  let _emailOrderJpgBase64 = null;

  const ENDPOINT = 'https://barstock-app.vercel.app/api/send-order';

  function isValidEmail(email) {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  function getContextData() {
    if (!_emailOrderContext) return null;

    if (_emailOrderContext.type === 'history') {
      const order = _emailOrderContext.order;
      return {
        vendor: order.vendor,
        poNumber: order.poNumber || '',
        items: order.items,
        totalUnits: order.totalUnits,
        subtotal: order.subtotal
      };
    }

    const vendor = _emailOrderContext.vendor;
    const items = _emailOrderContext.rows.map(r => ({
      item: r.item,
      code: r.code,
      finalOrder: typeof getEffectiveOrder === 'function' ? getEffectiveOrder(r) : r.toOrder
    }));
    const totalUnits = items.reduce((sum, r) => sum + Number(r.finalOrder || 0), 0);
    const subtotal = typeof computeOrderSubtotal === 'function'
      ? computeOrderSubtotal(_emailOrderContext.rows)
      : 0;

    // poNumber desde la orden más reciente del vendor en orderHistory
    let poNumber = '';
    if (typeof state !== 'undefined' && Array.isArray(state.orderHistory)) {
      const match = state.orderHistory.find(o => o.vendor === vendor && o.poNumber);
      if (match) poNumber = match.poNumber;
    }

    return { vendor, poNumber, items, totalUnits, subtotal };
  }

  async function generatePdfBase64(vendor, items, summary) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
    const W = pdf.internal.pageSize.getWidth();
    const H = pdf.internal.pageSize.getHeight();
    const margin = 48;
    const contentW = W - margin * 2;
    let y = margin;
    const f = 'helvetica';

    // ── helpers ──────────────────────────────────────────────
    function txt(text, x, yy, opts) { pdf.text(String(text || ''), x, yy, opts || {}); }
    function line(x1, y1, x2, y2, color) {
      pdf.setDrawColor(...(color || [226, 232, 240]));
      pdf.setLineWidth(0.8);
      pdf.line(x1, y1, x2, y2);
    }
    function roundRect(x, ry, w, h, r, fill, stroke) {
      if (fill) { pdf.setFillColor(...fill); pdf.roundedRect(x, ry, w, h, r, r, 'F'); }
      if (stroke) { pdf.setDrawColor(...stroke); pdf.setLineWidth(0.5); pdf.roundedRect(x, ry, w, h, r, r, 'S'); }
    }
    function label(text, x, yy) {
      pdf.setFont(f, 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(148, 163, 184);
      txt(text, x, yy);
    }
    function value(text, x, yy, bold) {
      pdf.setFont(f, bold ? 'bold' : 'normal'); pdf.setFontSize(10); pdf.setTextColor(15, 23, 42);
      txt(text, x, yy);
    }

    // ── HEADER — navy bg + linea azul ───────────────────────
    const hdrH = y + 42; // margin + contenido
    pdf.setFillColor(15, 23, 42);
    pdf.rect(0, 0, W, hdrH, 'F');

    // Logo — BarStock
    pdf.setFont(f, 'bold'); pdf.setFontSize(22); pdf.setTextColor(248, 250, 252);
    txt('BarStock', margin, y + 16);
    const bw = pdf.getTextWidth('BarStock');
    // Punto circular azul
    pdf.setFillColor(56, 189, 248);
    pdf.circle(margin + bw + 3.5, y + 13.5, 2.6, 'F');
    // PRO
    pdf.setFont(f, 'bold'); pdf.setFontSize(8); pdf.setTextColor(100, 116, 139);
    txt('PRO', margin + bw + 9, y + 16);
    // Location — pill azul
    pdf.setFont(f, 'bold'); pdf.setFontSize(8);
    const locText = (summary.location || '').toUpperCase();
    const locW = pdf.getTextWidth(locText) + 16;
    pdf.setFillColor(56, 189, 248);
    pdf.roundedRect(margin, y + 20, locW, 14, 7, 7, 'F');
    pdf.setTextColor(15, 23, 42);
    txt(locText, margin + locW / 2, y + 30, { align: 'center' });

    // Derecha — titulo + capsula PO
    pdf.setFont(f, 'bold'); pdf.setFontSize(10); pdf.setTextColor(248, 250, 252);
    txt('PURCHASE ORDER', W - margin, y + 14, { align: 'right' });

    if (summary.poNumber) {
      const poText = summary.poNumber;
      pdf.setFont(f, 'bold'); pdf.setFontSize(9);
      const poW = pdf.getTextWidth(poText) + 16;
      pdf.setFillColor(56, 189, 248);
      pdf.roundedRect(W - margin - poW, y + 20, poW, 14, 7, 7, 'F');
      pdf.setTextColor(15, 23, 42);
      txt(poText, W - margin - poW / 2, y + 30, { align: 'center' });
    }

    y = hdrH;
    // Linea azul de acento — full width
    pdf.setFillColor(56, 189, 248);
    pdf.rect(0, y, W, 3, 'F');
    y += 18;

    // ── META GRID — 2 cards ──────────────────────────────────
    const colW = contentW / 2;
    const cardPad = 12;
    const cardGap = 8;
    const cardW = (contentW - cardGap) / 2;

    // Calcular altura de cards
    const orderRowsData = [
      ['Date issued',        summary.date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })],
      ['Requested delivery', summary.deliveryDate ? (() => { const [yr,mo,dy] = summary.deliveryDate.split('-'); return new Date(+yr,+mo-1,+dy).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); })() : ''],
      ['Buyer',    summary.buyerName ? (summary.buyerTitle ? summary.buyerName + ' · ' + summary.buyerTitle : summary.buyerName) : ''],
      ['Email',    summary.buyerEmail || ''],
      ['Phone',    summary.buyerPhone || ''],
    ].filter(r => r[1]);
    const vendorRowsData = [
      ['Company',   vendor],
      ['Account #', summary.vendorDefaults?.account_number || ''],
      ['Rep',       summary.vendorDefaults?.rep_name || ''],
      ['Phone',     summary.vendorDefaults?.rep_phone || ''],
    ].filter(r => r[1]);

    const cardH = Math.max(orderRowsData.length, vendorRowsData.length) * 14 + cardPad * 2 + 16;

    // Card ORDER INFO
    pdf.setFillColor(247, 249, 252);
    pdf.setDrawColor(218, 224, 234);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(margin, y, cardW, cardH, 4, 4, 'FD');
    pdf.setFont(f, 'bold'); pdf.setFontSize(7.5); pdf.setTextColor(148, 163, 184);
    txt('ORDER INFO', margin + cardPad, y + cardPad + 4);
    let oy = y + cardPad + 16;
    orderRowsData.forEach(([k, v]) => {
      label(k, margin + cardPad, oy);
      value(v, margin + cardPad + 88, oy, false);
      oy += 14;
    });

    // Card VENDOR
    const vCardX = margin + cardW + cardGap;
    pdf.setFillColor(247, 249, 252);
    pdf.setDrawColor(218, 224, 234);
    pdf.roundedRect(vCardX, y, cardW, cardH, 4, 4, 'FD');
    pdf.setFont(f, 'bold'); pdf.setFontSize(7.5); pdf.setTextColor(148, 163, 184);
    txt('VENDOR', vCardX + cardPad, y + cardPad + 4);
    let vy = y + cardPad + 16;
    vendorRowsData.forEach(([k, v]) => {
      label(k, vCardX + cardPad, vy);
      pdf.setFont(f, v === vendor ? 'bold' : 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(v === vendor ? 30 : 15, v === vendor ? 91 : 23, v === vendor ? 138 : 42);
      txt(v || '', vCardX + cardPad + 72, vy);
      vy += 14;
    });

    y += cardH + 16;

    // ── ITEMS TABLE ───────────────────────────────────────────
    // Badge navy — ITEMS ORDERED full width
    pdf.setFillColor(30, 58, 95);
    pdf.rect(0, y, W, 20, 'F');
    pdf.setFont(f, 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(224, 242, 254);
    txt('ITEMS ORDERED', margin, y + 13);
    y += 26;

    const cols = { code: margin, item: margin + 72, qty: W - margin };
    const rowH = 22;

    // Table header
    pdf.setFillColor(241, 245, 251);
    pdf.rect(margin, y, contentW, rowH, 'F');
    pdf.setFont(f, 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(30, 60, 90);
    txt('CODE',  cols.code + 6,  y + 14);
    txt('ITEM DESCRIPTION', cols.item, y + 14);
    txt('QTY',  cols.qty,  y + 14, { align: 'right' });
    y += rowH;

    // Table rows — con paginacion automatica
    (items || []).forEach((item, i) => {
      // Page break si no hay espacio para otra fila + footer
      if (y + rowH + 60 > H) {
        pdf.addPage();
        y = margin + 16;
        // Repetir header de tabla en nueva pagina
        pdf.setFillColor(241, 245, 251);
        pdf.rect(margin, y, contentW, rowH, 'F');
        pdf.setFont(f, 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(30, 60, 90);
        txt('CODE', cols.code + 6, y + 14);
        txt('ITEM DESCRIPTION', cols.item, y + 14);
        txt('QTY', cols.qty, y + 14, { align: 'right' });
        y += rowH;
      }

      if (i % 2 === 1) { pdf.setFillColor(248, 250, 253); pdf.rect(margin, y, contentW, rowH, 'F'); }
      pdf.setDrawColor(241, 245, 249); pdf.setLineWidth(0.4);
      pdf.line(margin, y + rowH, W - margin, y + rowH);

      pdf.setFont(f, 'normal'); pdf.setFontSize(9.5); pdf.setTextColor(100, 116, 139);
      txt(String(item.code || ''), cols.code + 6, y + 14);

      pdf.setFont(f, 'normal'); pdf.setFontSize(9.5); pdf.setTextColor(15, 23, 42);
      const itemName = String(item.item || '');
      const maxW = cols.qty - cols.item - 20;
      const truncated = pdf.getTextWidth(itemName) > maxW
        ? itemName.substring(0, Math.floor(itemName.length * maxW / pdf.getTextWidth(itemName)) - 1) + '…'
        : itemName;
      txt(truncated, cols.item, y + 14);

      pdf.setFont(f, 'bold'); pdf.setFontSize(9.5); pdf.setTextColor(30, 91, 138);
      txt(String(item.finalOrder || 0), cols.qty, y + 14, { align: 'right' });
      y += rowH;
    });

    // Table footer — total
    pdf.setFillColor(232, 240, 250);
    pdf.rect(margin, y, contentW, rowH, 'F');
    pdf.setFont(f, 'bold'); pdf.setFontSize(9.5); pdf.setTextColor(15, 23, 42);
    txt('Total units ordered', cols.code + 6, y + 14);
    txt(String(summary.totalUnits || 0), cols.qty, y + 14, { align: 'right' });
    y += rowH + 16;

    // ── DELIVERY & TERMS BOX ──────────────────────────────────
    const defs = summary.vendorDefaults || {};
    const termRows = [
      ['Delivery window',      defs.delivery_window      || ''],
      ['Delivery address',     defs.delivery_address     || ''],
      ['Special instructions', defs.special_instructions || ''],
    ].filter(r => r[1]);
    if (termRows.length) {
      const labelW = 110;
      const valueW = contentW - labelW - 36;
      const rowHeights = termRows.map(([k, v]) => {
        pdf.setFont(f, 'normal'); pdf.setFontSize(9.5);
        const lines = pdf.splitTextToSize(String(v), valueW);
        return Math.max(18, lines.length * 14 + 6);
      });
      const boxH = 26 + rowHeights.reduce((a, b) => a + b, 0);

      // El bloque se dibujaba donde quedara la tabla, sin preguntar si
      // cabia. La tabla si revisa el espacio antes de cada fila, pero
      // reserva solo lo del pie — no lo de este bloque, que viene despues.
      // Con la tabla terminando cerca del fondo, el bloque invadia el pie
      // y "Special instructions" salia por debajo de el, casi fuera de la
      // hoja. Paso el 17 de agosto con una orden de 20 articulos.
      //
      // FOOTER_ZONE es la franja intocable: la linea del pie va en H-36 y
      // su texto en H-22, mas un respiro.
      const FOOTER_ZONE = 52;
      if (y + boxH + FOOTER_ZONE > H) {
        pdf.addPage();
        y = margin + 16;
      }

      roundRect(margin, y, contentW, boxH, 6, [248, 250, 252], [226, 232, 240]);
      pdf.setFont(f, 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(148, 163, 184);
      txt('DELIVERY & TERMS', margin + 12, y + 16);
      let ty = y + 30;
      termRows.forEach(([k, v], i) => {
        label(k, margin + 12, ty);
        pdf.setFont(f, 'bold'); pdf.setFontSize(9.5); pdf.setTextColor(15, 23, 42);
        const lines = pdf.splitTextToSize(String(v), valueW);
        lines.forEach((line, li) => { txt(line, margin + labelW + 12, ty + li * 14); });
        ty += rowHeights[i];
      });
      y += boxH + 16;
    }

    // ── FOOTER — todas las paginas ──────────────────────────
    const totalPages = pdf.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      pdf.setPage(p);
      line(margin, H - 36, W - margin, H - 36);
      pdf.setFont(f, 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(148, 163, 184);
      // Generated by solo en ultima pagina
      if (p === totalPages) {
        txt('Generated by BarStock Pro · Internal use only', margin, H - 22);
      }
      if (summary.poNumber) {
        txt(summary.poNumber + ' · ' + (summary.date || '') + ' · Page ' + p + ' of ' + totalPages, W - margin, H - 22, { align: 'right' });
      }
    }

    return pdf.output('datauristring').split(',')[1];
  }

    async function openModal(historyOrderId) {
    const modal = document.getElementById('emailOrderModalBg');
    const label = document.getElementById('emailOrderModalLabel');
    const toInput = document.getElementById('emailOrderTo');
    const ccInput = document.getElementById('emailOrderCc');
    const preview = document.getElementById('emailOrderPreview');

    if (!modal) return;

    let vendor, rows;

    if (historyOrderId) {
      const order = (state.orderHistory || []).find(o => o.id === historyOrderId);
      if (!order) return;
      _emailOrderContext = { type: 'history', order };
      vendor = order.vendor;
      rows = order.items;
      label.textContent = vendor + ' order - ' + new Date(order.createdAt).toLocaleDateString();
    } else {
      vendor = typeof activeVendorTab !== 'undefined' ? activeVendorTab : 'ALL';
      rows = (typeof getOrderRowsForVendor === 'function' ? getOrderRowsForVendor(vendor) : [])
        .filter(r => Number((typeof parseNum === 'function' ? parseNum(r.finalOrder) : r.finalOrder) || 0) > 0);
      if (!rows.length) {
        alert('No items to email for this vendor.');
        return;
      }
      _emailOrderContext = { type: 'current', vendor, rows };
      label.textContent = vendor + ' order - ' + rows.length + ' items';
    }

    if (ccInput) ccInput.value = '';
    if (preview) preview.innerHTML = '<div class="small muted">Generating preview...</div>';
    _emailOrderJpgBase64 = null;

    // Pre-llenar To con el email del vendor si existe
    if (toInput) {
      toInput.value = '';
      try {
        if (window.BarStockVendorDefaults) {
          const vd = await window.BarStockVendorDefaults.getDefaults(vendor);
          if (vd?.vendor_email) toInput.value = vd.vendor_email;
        }
      } catch(e) { console.warn('Could not load vendor email', e); }
    }

    modal.classList.remove('hidden');

    try {
      const canvas = await generateVendorJpgCanvas(vendor, rows);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      _emailOrderJpgBase64 = dataUrl.split(',')[1];
      if (preview) {
        preview.innerHTML = '<img src="' + dataUrl + '" style="max-width:100%;height:auto;border-radius:6px;display:block">';
      }
    } catch (err) {
      console.error('Preview generation failed:', err);
      if (preview) {
        preview.innerHTML = '<div class="small" style="color:#ef4444">Could not generate preview: ' + err.message + '</div>';
      }
    }
  }

  function closeModal() {
    document.getElementById('emailOrderModalBg')?.classList.add('hidden');
    const overlay = document.getElementById('emailOrderSuccessOverlay');
    const circle  = document.getElementById('emailOrderCheckCircle');
    const svg     = document.getElementById('emailOrderCheckSvg');
    const msg     = document.getElementById('emailOrderSuccessMsg');
    const sub     = document.getElementById('emailOrderSuccessSub');
    if (overlay) { overlay.style.opacity = '0'; overlay.style.pointerEvents = 'none'; }
    if (circle)  { circle.style.transform = 'scale(0)'; circle.style.opacity = '0'; }
    if (svg)     { const pl = svg.querySelector('polyline'); if (pl) pl.style.strokeDashoffset = '30'; }
    if (msg)     { msg.style.opacity = '0'; msg.style.transform = 'translateY(8px)'; }
    if (sub)     { sub.style.opacity = '0'; sub.style.transform = 'translateY(8px)'; sub.textContent = ''; }
    _emailOrderContext = null;
    _emailOrderJpgBase64 = null;
  }

  async function send() {
    const to = String(document.getElementById('emailOrderTo')?.value || '').trim();
    const cc = String(document.getElementById('emailOrderCc')?.value || '').trim();
    const btn = document.getElementById('emailOrderSendBtn');

    // Validar múltiples emails separados por coma
    const splitEmails = (val) => String(val || '').split(',').map(e => e.trim()).filter(Boolean);
    const toEmails = splitEmails(to);
    const ccEmails = splitEmails(cc);

    if (!toEmails.length) {
      alert('Please enter at least one recipient email.');
      return;
    }
    const badTo = toEmails.find(e => !isValidEmail(e));
    if (badTo) {
      alert('Invalid recipient email: ' + badTo + '\nSeparate multiple emails with commas.');
      return;
    }
    const badCc = ccEmails.find(e => !isValidEmail(e));
    if (badCc) {
      alert('Invalid CC email: ' + badCc + '\nSeparate multiple emails with commas.');
      return;
    }

    if (!_emailOrderContext) return;
    if (!_emailOrderJpgBase64) {
      alert('Preview not ready yet, please wait.');
      return;
    }

    const data = getContextData();
    if (!data) return;

    const locationName = (window.BARSTOCK_CONFIG || {}).LOCATION_NAME || 'BarStock';
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = data.vendor.toLowerCase().replace(/\s+/g, '_') + '_order_' + dateStr + '.pdf';

    if (typeof setButtonBusy === 'function') setButtonBusy(btn, 'SENDING');

    try {
      // Generate PDF with summary + items table
      const deliveryDate = String(document.getElementById('emailOrderDeliveryDate')?.value || '');
      let vendorDefaults = {};
      let senderProfile = {};
      try {
        if (window.BarStockVendorDefaults) {
          const vd = await window.BarStockVendorDefaults.getDefaults(data.vendor);
          vendorDefaults = vd || {};
        }
      } catch(e) { console.warn('Could not load vendor defaults', e); }
      try {
        if (window.BarStockSenderProfile) {
          const sp = await window.BarStockSenderProfile.getProfile();
          senderProfile = sp || {};
        }
      } catch(e) { console.warn('Could not load sender profile', e); }

      const pdfBase64 = await generatePdfBase64(data.vendor, data.items, {
        location: locationName,
        vendor: data.vendor,
        poNumber: data.poNumber || '',
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        deliveryDate,
        buyerName: senderProfile.name || '',
        buyerEmail: senderProfile.email || '',
        buyerPhone: senderProfile.phone || '',
        buyerTitle: senderProfile.title || '',
        items: data.items.length,
        totalUnits: data.totalUnits,
        vendorDefaults
      });

      // Determine reply-to: custom location setting → logged-in user → null
      let replyTo = null;
      try {
        if (window.BarStockLocationSettings) {
          replyTo = await window.BarStockLocationSettings.getReplyToEmail();
        }
      } catch(e) {
        console.warn('Could not get reply-to email', e);
      }

      const payload = {
        to: toEmails,
        vendor: data.vendor,
        items: data.items,
        totalUnits: data.totalUnits,
        subtotal: data.subtotal,
        locationName,
        jpgBase64: _emailOrderJpgBase64,
        pdfBase64,
        filename
      };

      if (ccEmails.length) payload.cc = ccEmails;
      if (replyTo) payload.replyTo = replyTo;
      try {
        if (window.BarStockSenderProfile) {
          const sp = await window.BarStockSenderProfile.getProfile();
          if (sp?.name) payload.senderName = sp.name;
          if (sp?.email) payload.senderEmail = sp.email;
        }
      } catch(e) { console.warn('Could not get sender profile for order email', e); }

      console.log('🔍 EMAIL ORDER PAYLOAD:', {
        to: payload.to,
        vendor: payload.vendor,
        itemsCount: payload.items?.length,
        hasJpg: !!payload.jpgBase64,
        hasPdf: !!payload.pdfBase64,
        replyTo: payload.replyTo,
        cc: payload.cc
      });
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (!result.ok) throw new Error(result.error || 'Unknown error');

      if (typeof setStatus === 'function') setStatus('Order emailed to ' + toEmails.join(', ') + '.');
      const overlay = document.getElementById('emailOrderSuccessOverlay');
      const circle  = document.getElementById('emailOrderCheckCircle');
      const svg     = document.getElementById('emailOrderCheckSvg');
      const sub     = document.getElementById('emailOrderSuccessSub');
      if (overlay && circle && svg && sub) {
        sub.textContent = toEmails.join(', ');
        overlay.style.opacity = '1';
        overlay.style.pointerEvents = 'auto';
        setTimeout(() => { circle.style.transform = 'scale(1)'; circle.style.opacity = '1'; }, 50);
        setTimeout(() => { svg.querySelector('polyline').style.strokeDashoffset = '0'; }, 400);
        setTimeout(() => {
          document.getElementById('emailOrderSuccessMsg').style.opacity = '1';
          document.getElementById('emailOrderSuccessMsg').style.transform = 'translateY(0)';
        }, 550);
        setTimeout(() => { sub.style.opacity = '1'; sub.style.transform = 'translateY(0)'; }, 700);
        setTimeout(() => { closeModal(); }, 2600);
      } else {
        closeModal();
      }

      if (window.BarStockLogger) {
        window.BarStockLogger.log('email_order_sent', {
          vendor: data.vendor,
          to: toEmails.join(', '),
          cc: ccEmails.join(', ') || null,
          itemCount: data.items.length
        });
      }
    } catch (err) {
      console.error(err);
      alert('Could not send email: ' + err.message);
    } finally {
      if (typeof clearButtonBusy === 'function') clearButtonBusy(btn);
    }
  }

  function bindModalBackdrop() {
    const bg = document.getElementById('emailOrderModalBg');
    if (!bg) return;
    bg.addEventListener('click', function(e) {
      if (e.target.id === 'emailOrderModalBg') closeModal();
    });
  }

  async function previewPdf() {
    const btn = document.getElementById('emailOrderPreviewPdfBtn');
    const data = getContextData();
    if (!data) return;
    const locationName = (window.BARSTOCK_CONFIG || {}).LOCATION_NAME || 'BarStock';
    const deliveryDate = String(document.getElementById('emailOrderDeliveryDate')?.value || '');
    let vendorDefaults = {};
    let senderProfile = {};
    try {
      if (window.BarStockVendorDefaults) {
        const vd = await window.BarStockVendorDefaults.getDefaults(data.vendor);
        vendorDefaults = vd || {};
      }
    } catch(e) {}
    try {
      if (window.BarStockSenderProfile) {
        const sp = await window.BarStockSenderProfile.getProfile();
        senderProfile = sp || {};
      }
    } catch(e) {}
    if (typeof setButtonBusy === 'function') setButtonBusy(btn, 'GENERATING');
    try {
      const pdfBase64 = await generatePdfBase64(data.vendor, data.items, {
        location: locationName,
        vendor: data.vendor,
        poNumber: data.poNumber || '',
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        deliveryDate,
        buyerName: senderProfile.name || '',
        buyerEmail: senderProfile.email || '',
        buyerPhone: senderProfile.phone || '',
        buyerTitle: senderProfile.title || '',
        items: data.items.length,
        totalUnits: data.totalUnits,
        vendorDefaults
      });
      const link = document.createElement('a');
      link.href = 'data:application/pdf;base64,' + pdfBase64;
      link.download = data.vendor.toLowerCase().replace(/\s+/g, '_') + '_order_preview.pdf';
      link.click();
    } catch(err) {
      alert('Could not generate PDF: ' + err.message);
    } finally {
      if (typeof clearButtonBusy === 'function') clearButtonBusy(btn);
    }
  }

  window.previewOrderPdf = previewPdf;
  window.openEmailOrderModal = openModal;
  window.closeEmailOrderModal = closeModal;
  window.sendEmailOrder = send;

  window.BarStockEmailOrder = {
    active: true,
    openModal,
    closeModal,
    send,
    isValidEmail
  };

  document.addEventListener('DOMContentLoaded', bindModalBackdrop);
})();
