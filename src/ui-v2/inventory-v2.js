(() => {
  if (window.BarStockInventoryV2) return;

  function getRows() {
    if (Array.isArray(window.state?.master)) return window.state.master;
    if (typeof state !== 'undefined' && Array.isArray(state.master)) return state.master;
    return [];
  }

  function render() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('uiV2') !== '1') return;

    const root = document.getElementById('barstockInventoryV2');
    if (!root) return;

    const rows = getRows();

    root.innerHTML = `
      <section class="v2-panel">
        <div class="v2-section-head">
          <h2>Inventory V2</h2>
          <span>${rows.length} items</span>
        </div>
      </section>
    `;
  }

  window.BarStockInventoryV2 = {
    render
  };

  window.addEventListener('load', render);
})();
