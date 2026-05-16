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

    return { vendor, items, totalUnits, subtotal };
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

    if (!isValidEmail(to)) {
      alert('Please enter a valid recipient email.');
      return;
    }

    if (cc && !isValidEmail(cc)) {
      alert('CC field is not a valid email. Leave it empty or enter a valid email.');
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
    const filename = data.vendor.toLowerCase().replace(/\s+/g, '_') + '_order_' +
      new Date().toISOString().slice(0, 10) + '.jpg';

    if (typeof setButtonBusy === 'function') setButtonBusy(btn, 'SENDING');

    try {
      const payload = {
        to,
        vendor: data.vendor,
        items: data.items,
        totalUnits: data.totalUnits,
        subtotal: data.subtotal,
        locationName,
        jpgBase64: _emailOrderJpgBase64,
        filename
      };

      if (cc) payload.cc = cc;

      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (!result.ok) throw new Error(result.error || 'Unknown error');

      closeModal();
      if (typeof setStatus === 'function') setStatus('Order emailed to ' + to + '.');

      if (window.BarStockLogger) {
        window.BarStockLogger.log('email_order_sent', {
          vendor: data.vendor,
          to,
          cc: cc || null,
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
