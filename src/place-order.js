(() => {
  if (window.__barstockPlaceOrderCleanBooted) return;
  window.__barstockPlaceOrderCleanBooted = true;

  async function placeCurrentOrderCloudFirst(){
    if (typeof isPlacingOrder !== 'undefined' && isPlacingOrder) return;
    if (typeof canPlaceOrder === 'function' && !canPlaceOrder()) return;

    const placeBtn = document.getElementById('placeOrderBtn');
    const vendorAtStart = typeof activeVendorTab !== 'undefined' ? activeVendorTab : 'ALL';

    const rows = (typeof getOrderRowsForVendor === 'function' ? getOrderRowsForVendor(vendorAtStart) : [])
      .map(r => (typeof cloneOrderRow === 'function' ? cloneOrderRow(r) : r))
      .filter(r => (typeof parseNum === 'function' ? parseNum(r.finalOrder) : Number(r.finalOrder || 0)) > 0);

    if (!rows.length) {
      alert('No items available to place for this vendor.');
      return;
    }

    const now = new Date().toISOString();
    const order = {
      id: typeof uniqueOrderId === 'function' ? uniqueOrderId() : `ord_${Date.now()}`,
      vendor: vendorAtStart,
      createdAt: now,
      date: now,
      exportType: vendorAtStart === 'LOOP' ? 'loop_csv' : 'vendor_jpg',
      filename: vendorAtStart === 'LOOP'
        ? 'loop_upload.csv'
        : (typeof currentVendorFilenameStem === 'function'
            ? `${currentVendorFilenameStem()}.jpg`
            : `vendor_order_${String(vendorAtStart || '').toLowerCase().replace(/\s+/g,'_')}.jpg`),
      items: rows,
      totalUnits: rows.reduce((sum, r) => sum + (typeof parseNum === 'function' ? parseNum(r.finalOrder) : Number(r.finalOrder || 0)), 0),
      subtotal: typeof computeOrderSubtotal === 'function' ? computeOrderSubtotal(rows) : 0
    };

    if (typeof isPlacingOrder !== 'undefined') isPlacingOrder = true;
    if (placeBtn) {
      if (typeof setButtonBusy === 'function') setButtonBusy(placeBtn, 'PLACING');
      else {
        placeBtn.disabled = true;
        placeBtn.dataset.originalLabel = placeBtn.textContent;
        placeBtn.textContent = 'PLACING...';
      }
    }

    try {
      // 1. export local file como siempre
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (!isMobile) {
        if (vendorAtStart === 'LOOP') {
          if (typeof exportLoopCsvFromRows === 'function') {
            const ok = exportLoopCsvFromRows(rows, order.filename);
            if (ok === false) throw new Error('Could not export LOOP CSV');
          }
        } else {
          if (typeof exportVendorJpgFromRows === 'function') {
            await exportVendorJpgFromRows(vendorAtStart, rows, order.filename);
          }
        }
      } else {
      }

      // 2. cloud obligatorio
      if (typeof window.persistOrderToSupabase !== 'function') {
        throw new Error('persistOrderToSupabase unavailable');
      }

      await window.persistOrderToSupabase(order);

      if (window.BarStockLogger) {
        window.BarStockLogger.log('place_order_saved', {
          vendor: vendorAtStart,
          orderId: order.id,
          totalUnits: order.totalUnits,
          subtotal: order.subtotal,
          itemCount: rows.length,
          exportType: order.exportType
        });
      }

      // 3. recargar verdad desde cloud
      if (typeof window.loadOrdersFromCloud === 'function') {
        await window.loadOrdersFromCloud();
      } else {
        throw new Error('loadOrdersFromCloud unavailable');
      }

      if (typeof setStatus === 'function') {
        setStatus(`${vendorAtStart} order placed and synced to cloud.`);
      }

    } catch (err) {
      console.error(err);
      alert('Order was NOT saved to cloud.');
      if (typeof setStatus === 'function') {
        setStatus('Order failed because cloud save failed.');
      }
    } finally {
      if (typeof isPlacingOrder !== 'undefined') isPlacingOrder = false;
      if (placeBtn) {
        if (typeof clearButtonBusy === 'function') clearButtonBusy(placeBtn);
        else {
          placeBtn.disabled = false;
          placeBtn.textContent = placeBtn.dataset.originalLabel || 'PLACE ORDER';
        }
      }
    }
  }

  window.placeCurrentOrder = placeCurrentOrderCloudFirst;
  try { placeCurrentOrder = placeCurrentOrderCloudFirst; } catch (e) {}

  function bindCleanPlaceOrderHandler() {
    const oldBtn = document.getElementById('placeOrderBtn');
    if (!oldBtn) return;

    const newBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);

    newBtn.addEventListener('click', async () => {
      try {
        await window.placeCurrentOrder();
      } catch (err) {
        console.error(err);
        alert('Could not place vendor order.');
        if (typeof setStatus === 'function') {
          setStatus('Error placing vendor order.');
        }
      }
    });
  }

  window.addEventListener('load', () => {
    setTimeout(() => {
      bindCleanPlaceOrderHandler();
    }, 1500);
  });
})();
