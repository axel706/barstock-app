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

    // ── HEADER ────────────────────────────────────────────────
    // Logo
    pdf.setFont(f, 'bold'); pdf.setFontSize(22); pdf.setTextColor(15, 23, 42);
    txt('BarStock', margin, y + 16);
    const bw = pdf.getTextWidth('BarStock');
    pdf.setTextColor(59, 130, 246);
    txt('.', margin + bw, y + 16);
    const dw = pdf.getTextWidth('.');
    pdf.setFont(f, 'bold'); pdf.setFontSize(9); pdf.setTextColor(148, 163, 184);
    txt('PRO', margin + bw + dw + 3, y + 14);

    // Location name under logo
    pdf.setFont(f, 'normal'); pdf.setFontSize(10); pdf.setTextColor(100, 116, 139);
    txt(summary.location || '', margin, y + 30);

    // Right side — Purchase Order title + PO number + status badge
    pdf.setFont(f, 'bold'); pdf.setFontSize(20); pdf.setTextColor(15, 23, 42);
    txt('Purchase Order', W - margin, y + 16, { align: 'right' });

    if (summary.poNumber) {
      // PO badge
      const poText = summary.poNumber;
      pdf.setFont(f, 'bold'); pdf.setFontSize(10); pdf.setTextColor(30, 91, 138);
      const poW = pdf.getTextWidth(poText) + 16;
      roundRect(W - margin - poW, y + 20, poW, 16, 3, [241, 245, 251], [181, 212, 244]);
      txt(poText, W - margin - poW / 2, y + 31, { align: 'center' });
    }

    // Open badge
    const badgeX = summary.poNumber ? W - margin - (pdf.getTextWidth(summary.poNumber) + 16) - 10 - 38 : W - margin - 38;
    roundRect(badgeX, y + 20, 38, 16, 3, [232, 240, 250], null);
    pdf.setFont(f, 'bold'); pdf.setFontSize(8); pdf.setTextColor(30, 91, 138);
    txt('Open', badgeX + 19, y + 31, { align: 'center' });

    y += 48;
    line(margin, y, W - margin, y);
    y += 18;

    // ── META GRID — 2 columnas ────────────────────────────────
    const colW = contentW / 2;

    // Col izquierda — Order info
    pdf.setFont(f, 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(148, 163, 184);
    txt('ORDER INFO', margin, y);
    y += 12;

    const orderRows = [
      ['Date issued',         summary.date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })],
      ['Requested delivery',  summary.deliveryDate ? (() => { const [y,m,d] = summary.deliveryDate.split('-'); return new Date(+y,+m-1,+d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); })() : ''],
      ['Buyer',               summary.buyerName || ''],
      ['Contact',             summary.buyerEmail || ''],
    ];
    orderRows.forEach(([k, v]) => {
      if (!v) return;
      label(k, margin, y);
      value(v, margin + 90, y, false);
      y += 14;
    });

    // Col derecha — Vendor info (resetear y al inicio de la sección)
    const metaStartY = y - (orderRows.filter(r => r[1]).length * 14) - 12;
    let vy = metaStartY;
    pdf.setFont(f, 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(148, 163, 184);
    txt('VENDOR', margin + colW, vy);
    vy += 12;

    const vendorRows = [
      ['Company',    vendor],
      ['Account #',  summary.vendorDefaults?.account_number || ''],
      ['Rep',        summary.vendorDefaults?.rep_name || ''],
      ['Phone',      summary.vendorDefaults?.rep_phone || ''],
    ];
    vendorRows.forEach(([k, v]) => {
      label(k, margin + colW, vy);
      pdf.setFont(f, v === vendor ? 'bold' : 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(v === vendor ? 30 : 15, v === vendor ? 91 : 23, v === vendor ? 138 : 42);
      txt(v || '', margin + colW + 72, vy);
      vy += 14;
    });

    y = Math.max(y, vy) + 10;
    line(margin, y, W - margin, y);
    y += 16;

    // ── ITEMS TABLE ───────────────────────────────────────────
    pdf.setFont(f, 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(148, 163, 184);
    txt('ITEMS ORDERED', margin, y);
    y += 10;

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

    // Table rows
    (items || []).forEach((item, i) => {
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
      const valueW = contentW - labelW - 24;
      const rowHeights = termRows.map(([k, v]) => {
        pdf.setFontSize(9.5);
        const lines = pdf.splitTextToSize(v, valueW);
        return Math.max(18, lines.length * 13 + 6);
      });
      const boxH = 22 + rowHeights.reduce((a, b) => a + b, 0);
      roundRect(margin, y, contentW, boxH, 6, [248, 250, 252], [226, 232, 240]);
      pdf.setFont(f, 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(148, 163, 184);
      txt('DELIVERY & TERMS', margin + 12, y + 14);
      let ty = y + 28;
      termRows.forEach(([k, v], i) => {
        label(k, margin + 12, ty);
        pdf.setFontSize(9.5);
        const lines = pdf.splitTextToSize(v, valueW);
        pdf.setFont(f, 'bold'); pdf.setTextColor(15, 23, 42);
        lines.forEach((line, li) => { txt(line, margin + labelW + 12, ty + li * 13); });
        ty += rowHeights[i];
      });
      y += boxH + 16;
    }

    // ── FOOTER ────────────────────────────────────────────────
    line(margin, H - 36, W - margin, H - 36);
    pdf.setFont(f, 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(148, 163, 184);
    txt('Generated by BarStock Pro · Internal use only', margin, H - 22);
    if (summary.poNumber) {
      txt(summary.poNumber + ' · ' + (summary.date || '') + ' · Page 1 of 1', W - margin, H - 22, { align: 'right' });
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

    if (toInput) toInput.value = '';
    if (ccInput) ccInput.value = '';
    if (preview) preview.innerHTML = '<div class="small muted">Generating preview...</div>';
    _emailOrderJpgBase64 = null;
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
      try {
        if (window.BarStockVendorDefaults) {
          const vd = await window.BarStockVendorDefaults.getDefaults(data.vendor);
          vendorDefaults = vd || {};
        }
      } catch(e) { console.warn('Could not load vendor defaults', e); }

      const pdfBase64 = await generatePdfBase64(data.vendor, data.items, {
        location: locationName,
        vendor: data.vendor,
        poNumber: data.poNumber || '',
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        deliveryDate,
        buyerName: (window.BARSTOCK_CONFIG || {}).USER_NAME || '',
        buyerEmail: (window.BARSTOCK_CONFIG || {}).USER_EMAIL || '',
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

      closeModal();
      if (typeof setStatus === 'function') setStatus('Order emailed to ' + toEmails.join(', ') + '.');

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
    try {
      if (window.BarStockVendorDefaults) {
        const vd = await window.BarStockVendorDefaults.getDefaults(data.vendor);
        vendorDefaults = vd || {};
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
        buyerName: (window.BARSTOCK_CONFIG || {}).USER_NAME || '',
        buyerEmail: (window.BARSTOCK_CONFIG || {}).USER_EMAIL || '',
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
