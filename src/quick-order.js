(() => {
  if (window.BarStockQuickOrder?.active) return;

  let quickOrderDraftItems = [];
  let quickOrderVendorTab = 'LOOP';

  function safeEl(id){
    return document.getElementById(id);
  }

  function getMaster(){
    if (window.state?.master) return window.state.master;
    if (typeof state !== 'undefined' && Array.isArray(state.master)) return state.master;
    return [];
  }

  function refreshProducts(vendor = quickOrderVendorTab){
    const list = document.getElementById('quickOrderProductsList');
    if(!list) return;

    const rows = getMaster()
      .filter(r => !vendor || String(r.vendor||'').toUpperCase() === String(vendor||'').toUpperCase())
      .sort((a,b) => String(a.item||'').localeCompare(String(b.item||'')));

    list.innerHTML = rows.map(r => `<option value="${escapeHtml(r.item)}"></option>`).join('');
  }

  function renderDraft(){
    const body = safeEl('quickOrderItemsBody');
    const subtotal = safeEl('quickOrderSubtotalAmount');
    const countWrap = safeEl('quickOrderCount');

    if(!body || !subtotal || !countWrap) return;
    if(!Array.isArray(quickOrderDraftItems)) quickOrderDraftItems = [];

    const total = quickOrderDraftItems.reduce((sum, item) => sum + (parseNum(item.qty) * parseNum(item.value)), 0);

    subtotal.textContent = fmtMoney(total);
    countWrap.textContent = `${quickOrderDraftItems.length} item${quickOrderDraftItems.length===1?'':'s'}`;

    body.innerHTML = quickOrderDraftItems.map((item, index) => `
      <tr>
        <td><span class="quick-order-item-name">${escapeHtml(item.item)}</span></td>
        <td>${fmt(item.qty)}</td>
        <td>${fmtMoney(item.value)}</td>
        <td>${fmtMoney(parseNum(item.qty) * parseNum(item.value))}</td>
        <td><div class="rowactions"><button class="danger ui-control" type="button" onclick="removeQuickOrderItem(${index})">Remove</button></div></td>
      </tr>
    `).join('') || `<tr><td colspan="5" class="quick-order-empty">No quick order items added yet.</td></tr>`;
  }

  function removeItem(index){
    quickOrderDraftItems.splice(index, 1);
    renderDraft();
  }

  // La lista de proveedores sale de la app, no de aquí. Estaba escrita a
  // mano en este archivo, así que era una segunda lista: dar de alta un
  // proveedor lo hacía aparecer en Inventario y en los filtros pero no
  // en Quick Order, y eso no se nota hasta el día que hace falta.
  function vendors(){
    if (typeof window.getVendorsWithUnknown === 'function') {
      const l = window.getVendorsWithUnknown();
      if (Array.isArray(l) && l.length) return l;
    }
    return ['LOOP','SOUTHERN','BREAKTHRU','WINE MERCHANT','UNKNOWN'];
  }

  function renderVendorTabs(){
    const wrap = safeEl('quickOrderVendorTabs');
    if(!wrap) return;

    wrap.innerHTML = vendors().map(v => `
      <button type="button" class="${quickOrderVendorTab===v?'active':''}" data-quick-vendor="${escapeHtml(v)}">
        ${v}
      </button>
    `).join('');

    wrap.querySelectorAll('button[data-quick-vendor]').forEach(btn => {
      btn.addEventListener('click', () => {
        setVendor(btn.dataset.quickVendor || 'LOOP');
      });
    });
  }

  function setVendor(vendor){
    quickOrderVendorTab = vendor || 'LOOP';
    renderVendorTabs();
    refreshProducts(quickOrderVendorTab);
  }

  function openModal(){
    const dateEl = document.getElementById('quickOrderDateInput');
    const timeEl = document.getElementById('quickOrderTimeInput');
    const productEl = document.getElementById('quickOrderProductInput');
    const qtyEl = document.getElementById('quickOrderQtyInput');
    const priceEl = document.getElementById('quickOrderPriceInput');
    const noteEl = document.getElementById('quickOrderNoteInput');

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth()+1).padStart(2,'0');
    const d = String(now.getDate()).padStart(2,'0');
    const hh = String(now.getHours()).padStart(2,'0');
    const mm = String(now.getMinutes()).padStart(2,'0');

    quickOrderDraftItems = [];

    setVendor(typeof activeVendorTab !== 'undefined' && activeVendorTab !== 'ALL' ? activeVendorTab : 'LOOP');

    if(dateEl) dateEl.value = `${y}-${m}-${d}`;
    if(timeEl) timeEl.value = `${hh}:${mm}`;
    if(productEl) productEl.value = '';
    if(qtyEl) qtyEl.value = '1';
    if(priceEl) priceEl.value = '';
    if(noteEl) noteEl.value = 'Quick Order';

    renderDraft();
    document.getElementById('quickOrderModalBg')?.classList.remove('hidden');
  }

  function closeModal(){
    document.getElementById('quickOrderModalBg')?.classList.add('hidden');
  }

  function addItem(){
    const vendor = quickOrderVendorTab;
    const product = String(document.getElementById('quickOrderProductInput')?.value || '').trim();
    const qty = Math.max(0, parseNum(document.getElementById('quickOrderQtyInput')?.value));
    const manualPrice = parseNum(document.getElementById('quickOrderPriceInput')?.value);

    if(!vendor || !product || qty <= 0){
      setStatus('Please complete vendor, product, and quantity.');
      return;
    }

    const match = getMaster().find(r => String(r.vendor||'').toUpperCase() === vendor && normalizeName(r.item||'') === normalizeName(product));
    const value = manualPrice > 0 ? manualPrice : parseNum(match?.value);

    quickOrderDraftItems.push({
      code: String(match?.code || '').trim(),
      item: product,
      vendor,
      onHand: clampNonNegative(match?.onHand),
      suggested: clampNonNegative(match?.suggested),
      value: clampNonNegative(value),
      qty: clampNonNegative(qty),
      toOrder: clampNonNegative(qty),
      orderOverride: clampNonNegative(qty),
      finalOrder: clampNonNegative(qty),
      quickOrder: true
    });

    const productEl = document.getElementById('quickOrderProductInput');
    const qtyEl = document.getElementById('quickOrderQtyInput');
    const priceEl = document.getElementById('quickOrderPriceInput');

    if(productEl) productEl.value = '';
    if(qtyEl) qtyEl.value = '1';
    if(priceEl) priceEl.value = '';

    renderDraft();
  }

  // ── La forma de la entrada, en un solo sitio ───────────────────────
  //
  // El móvil arma su propio borrador con su propia pantalla, pero la
  // ENTRADA que acaba en la nube tiene que ser idéntica a la del
  // escritorio: mismo `exportType`, mismo `note`, mismo `finalOrder`.
  // Si cada pantalla la armara a su manera, el día que haya que
  // cambiar un campo se cambiaría en una y se olvidaría en la otra, y
  // el historial acabaría con dos clases de orden rápida.
  //
  // `when` es un Date ya validado. Aquí no se leen inputs: esta
  // función no sabe de qué pantalla viene.
  // ── La regla de LOOP, en un solo sitio ─────────────────────────────
  //
  // LOOP no se pide por correo: se sube un CSV a su portal. Los demás
  // reciben un PDF por email. Esa frase estaba escrita tres veces
  // —aquí, en `colocar()` y en la etiqueta del botón del móvil— y de
  // las tres la que decide de verdad es ésta, porque es la que pone
  // el `exportType` con el que se guarda la orden.
  function porCorreo(vendor){
    return String(vendor || '').toUpperCase() !== 'LOOP';
  }

  function construirEntrada({ vendor, when, note, items }){
    const nota = String(note || 'Quick Order').trim() || 'Quick Order';

    const filas = (items || []).map(item => ({
      ...item,
      finalOrder: parseNum(item.qty || item.finalOrder),
      note: nota
    }));

    const totalUnits = filas.reduce((sum, item) => sum + parseNum(item.qty || item.finalOrder), 0);
    const subtotal = filas.reduce((sum, item) => sum + (parseNum(item.qty || item.finalOrder) * parseNum(item.value)), 0);

    return {
      id: uniqueOrderId(),
      vendor,
      createdAt: (when instanceof Date ? when : new Date()).toISOString(),
      // El mismo reparto que el resto de la app: LOOP sale por CSV y
      // los demás por imagen. Ver `porCorreo`.
      exportType: porCorreo(vendor) ? 'vendor_jpg' : 'loop_csv',
      filename: porCorreo(vendor) ? 'Vendor JPG' : 'LOOP upload-ready CSV',
      totalUnits: clampNonNegative(totalUnits),
      subtotal: clampNonNegative(subtotal),
      items: filas,
      quickOrder: true,
      note: nota
    };
  }

  // `datos` lo pasa el móvil: { vendor, when, note, items }. Sin él se
  // leen los campos del diálogo del escritorio, como siempre.
  //
  // Es la MISMA función a propósito. Guardar una orden rápida tiene
  // avisos de validación, registro y recarga de la nube; con dos
  // copias, el arreglo de la segunda llega tarde o no llega.
  async function save(datos){
    const delMovil = !!(datos && Array.isArray(datos.items));

    let vendor, when, note, items;

    if (delMovil) {
      vendor = datos.vendor;
      when = datos.when instanceof Date ? datos.when : new Date();
      note = String(datos.note || 'Quick Order').trim() || 'Quick Order';
      items = datos.items;
      if (!vendor || !items.length) throw new Error('Add at least one item first.');
    } else {
      vendor = quickOrderVendorTab;
      const dateValue = String(document.getElementById('quickOrderDateInput')?.value || '').trim();
      const timeValue = String(document.getElementById('quickOrderTimeInput')?.value || '12:00').trim() || '12:00';
      note = String(document.getElementById('quickOrderNoteInput')?.value || 'Quick Order').trim() || 'Quick Order';

      if(!vendor || !dateValue || !quickOrderDraftItems.length){
        setStatus('Add at least one item and complete vendor/date.');
        return;
      }

      when = new Date(`${dateValue}T${timeValue}:00`);
      if(Number.isNaN(when.getTime())){
        setStatus('Invalid quick order date or time.');
        return;
      }
      items = quickOrderDraftItems;
    }

    const entry = construirEntrada({ vendor, when, note, items });
    const totalUnits = entry.totalUnits;
    const subtotal = entry.subtotal;

    let validationWarnings = [];
    const saveBtn = document.getElementById('quickOrderSaveBtn');

    try{
      if (!delMovil && typeof setButtonBusy === 'function') {
        setButtonBusy(saveBtn, 'Saving...');
      }
      if (window.BarStockOrderValidator && typeof window.BarStockOrderValidator.validate === 'function') {
        const validation = await window.BarStockOrderValidator.validate(entry);
        if (validation?.warnings?.length) {
          validationWarnings = validation.warnings;
          console.warn('Quick Order validation warnings:', validation.warnings);

          if (typeof setStatus === 'function') {
            setStatus('⚠️ ' + validation.warnings.join(' | '));
          }

          if (window.BarStockLogger) {
            console.info('Sending validation warnings to backend log...');
            await window.BarStockLogger.log('quick_order_validation_warnings', {
              vendor,
              orderId: entry.id,
              warnings: validation.warnings
            });
            console.info('Validation warnings sent to backend log.');
          }
        }
      }

      if (typeof window.persistOrderToSupabase !== 'function') {
        throw new Error('persistOrderToSupabase unavailable');
      }

      await window.persistOrderToSupabase(entry);

      if (typeof window.loadOrdersFromCloud === 'function') {
        await window.loadOrdersFromCloud();
      } else {
        state.orderHistory = [entry, ...(state.orderHistory || [])];
        saveState();
        render();
      }

      // El diálogo, la barra de estado y el cartel amarillo son del
      // escritorio. El móvil no los tiene: su pantalla cuenta el
      // resultado ella misma, y `setStatus` ahí escribe en una barra
      // que nadie ve.
      if (delMovil) {
        if (validationWarnings.length) {
          console.warn('[quick] guardada con avisos', validationWarnings);
        }
        if (window.BarStockLogger) {
          window.BarStockLogger.log("quick_order_saved", {
            vendor, totalUnits, subtotal, itemCount: items.length, from: 'mobile'
          });
        }
        // La entrada vuelve para que quien llama pueda enseñarla.
        return { entrada: entry, avisos: validationWarnings };
      }

      closeModal();
      if (validationWarnings.length) {
        const warningText = validationWarnings.join(' | ');
        setStatus('Quick Order saved with warnings.');

        const warningEl = document.createElement('div');
        warningEl.textContent = '⚠️ ' + warningText;
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
      } else {
        setStatus('Quick Order saved to History and synced to cloud.');
      }

      if (window.BarStockLogger) {
        window.BarStockLogger.log("quick_order_saved", {
          vendor,
          totalUnits,
          subtotal,
          itemCount: items.length
        });
      }
    } catch(err){
      console.error(err);
      // En el móvil se RELANZA. Un `alert` detrás de una pantalla de
      // teléfono es un diálogo del navegador que tapa la app, y
      // tragarse el error dejaría la pantalla diciendo que guardó
      // cuando no guardó — el fallo que ya nos costó una orden.
      if (delMovil) throw err;
      alert('Quick Order was NOT saved to cloud.\\n\\n' + (err.message || String(err)));
      setStatus('Quick Order failed because cloud save failed.');
    } finally {
      if (!delMovil && typeof clearButtonBusy === 'function') {
        clearButtonBusy(saveBtn);
      }
    }
  }

  function replaceButtonHandler(id, handler){
    const oldBtn = document.getElementById(id);
    if(!oldBtn) return;

    const newBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);
    newBtn.addEventListener('click', handler);
  }

  function bindControls(){
    replaceButtonHandler('quickOrderBtn', openModal);
    replaceButtonHandler('quickOrderAddItemBtn', addItem);
    replaceButtonHandler('quickOrderSaveBtn', save);
    replaceButtonHandler('quickOrderCancelBtn', closeModal);

    renderVendorTabs();
    refreshProducts(quickOrderVendorTab);
  }

  window.populateQuickOrderProducts = refreshProducts;
  window.renderQuickOrderDraft = renderDraft;
  window.removeQuickOrderItem = removeItem;
  window.openQuickOrderModal = openModal;
  window.closeQuickOrderModal = closeModal;
  window.addQuickOrderItem = addItem;
  window.saveQuickOrder = save;
  window.setQuickOrderVendor = setVendor;
  window.renderQuickOrderVendorTabs = renderVendorTabs;

  window.BarStockQuickOrder = {
    active: true,
    refreshProducts,
    renderDraft,
    openModal,
    closeModal,
    addItem,
    save,
    setVendor,
    renderVendorTabs,
    // Lo que usa la pantalla del móvil: la lista de proveedores y el
    // constructor de la entrada. Nada de armarla por su cuenta.
    vendors,
    construirEntrada,
    porCorreo,
    getVendor: () => quickOrderVendorTab,
    getItems: () => quickOrderDraftItems.slice()
  };

  window.addEventListener('load', () => {
    setTimeout(bindControls, 0);
  });
})();
