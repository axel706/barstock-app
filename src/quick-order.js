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

  function renderVendorTabs(){
    const wrap = safeEl('quickOrderVendorTabs');
    if(!wrap) return;

    const vendors = ['LOOP','SOUTHERN','BREAKTHRU','WINE MERCHANT','UNKNOWN'];

    wrap.innerHTML = vendors.map(v => `
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

  async function save(){
    const vendor = quickOrderVendorTab;
    const dateValue = String(document.getElementById('quickOrderDateInput')?.value || '').trim();
    const timeValue = String(document.getElementById('quickOrderTimeInput')?.value || '12:00').trim() || '12:00';
    const note = String(document.getElementById('quickOrderNoteInput')?.value || 'Quick Order').trim() || 'Quick Order';

    if(!vendor || !dateValue || !quickOrderDraftItems.length){
      setStatus('Add at least one item and complete vendor/date.');
      return;
    }

    const when = new Date(`${dateValue}T${timeValue}:00`);
    if(Number.isNaN(when.getTime())){
      setStatus('Invalid quick order date or time.');
      return;
    }

    const items = quickOrderDraftItems.map(item => ({
      ...item,
      finalOrder: parseNum(item.qty || item.finalOrder),
      note
    }));

    const totalUnits = items.reduce((sum, item) => sum + parseNum(item.qty || item.finalOrder), 0);
    const subtotal = items.reduce((sum, item) => sum + (parseNum(item.qty || item.finalOrder) * parseNum(item.value)), 0);
    const exportType = vendor === 'LOOP' ? 'loop_csv' : 'vendor_jpg';
    const filename = vendor === 'LOOP' ? 'LOOP upload-ready CSV' : 'Vendor JPG';

    const entry = {
      id: uniqueOrderId(),
      vendor,
      createdAt: when.toISOString(),
      exportType,
      filename,
      totalUnits: clampNonNegative(totalUnits),
      subtotal: clampNonNegative(subtotal),
      items,
      quickOrder: true,
      note
    };

    try{
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

      closeModal();
      setStatus('Quick Order saved to Order History and synced to cloud.');
    } catch(err){
      console.error(err);
      alert('Quick Order was NOT saved to cloud.\\n\\n' + (err.message || String(err)));
      setStatus('Quick Order failed because cloud save failed.');
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
    replaceButtonHandler('quickOrderAddBtn', addItem);
    replaceButtonHandler('quickOrderSaveBtn', save);
    replaceButtonHandler('quickOrderCancel', closeModal);

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
    getVendor: () => quickOrderVendorTab,
    getItems: () => quickOrderDraftItems.slice()
  };

  window.addEventListener('load', () => {
    setTimeout(bindControls, 0);
  });
})();
