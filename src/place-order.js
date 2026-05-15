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

    let validationWarnings = [];

    try {
      if (window.BarStockOrderValidator && typeof window.BarStockOrderValidator.validate === 'function') {
        const validation = await window.BarStockOrderValidator.validate(order);
        if (validation?.warnings?.length) {
          validationWarnings = validation.warnings;
          console.warn('Place Order validation warnings:', validation.warnings);

          if (window.BarStockLogger) {
            await window.BarStockLogger.log('place_order_validation_warnings', {
              vendor: vendorAtStart,
              orderId: order.id,
              warnings: validation.warnings
            });
          }
        }
      }

      // 1. cloud obligatorio: save order before any local export/download prompt
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
        if (validationWarnings.length) {
          setStatus(`${vendorAtStart} order placed with warnings.`);
        } else {
          setStatus(`${vendorAtStart} order placed and synced to cloud.`);
        }
      }

      // 4. optional local export after cloud save; never block order placement
      try {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

        if (!isMobile) {
          if (vendorAtStart === 'LOOP') {
            if (typeof exportLoopCsvFromRows === 'function') {
              exportLoopCsvFromRows(rows, order.filename);
            }
          } else {
            if (typeof exportVendorJpgFromRows === 'function') {
              await exportVendorJpgFromRows(vendorAtStart, rows, order.filename);
            }
          }
        }
      } catch (exportErr) {
        console.warn('Order saved, but local export failed:', exportErr);
        if (typeof setStatus === 'function') {
          setStatus(`${vendorAtStart} order placed. Local export was skipped or blocked.`);
        }
      }

      if (validationWarnings.length) {
        const warningEl = document.createElement('div');
        warningEl.textContent = '⚠️ ' + validationWarnings.join(' | ');
        warningEl.style.position = 'fixed';
        warningEl.style.bottom = '20px';
        warningEl.style.right = '20px';
        warningEl.style.background = '#ffcc00';
        warningEl.style.color = '#000';
        warningEl.style.padding = '12px 16px';
        warningEl.style.borderRadius = '8px';
        warningEl.style.boxShadow = '0 4px 10px rgba(0,0,0,0.2)';
        warningEl.style.zIndex = '999999';
        warningEl.style.fontSize = '14px';
        warningEl.style.maxWidth = '420px';

        document.body.appendChild(warningEl);

        setTimeout(() => {
          warningEl.remove();
        }, 7000);
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
