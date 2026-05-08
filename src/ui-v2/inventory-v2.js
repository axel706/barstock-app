(function () {
  if (window.BarStockInventoryV2) return;

  function isV2Mode() {
    return new URLSearchParams(window.location.search).get('uiV2') === '1';
  }

  function mountLegacyInventoryIntoV2() {
    if (!isV2Mode()) return;

    const root = document.getElementById('barstockInventoryV2');
    const legacyInventory = document.getElementById('inventorySection');

    if (!root || !legacyInventory) return;

    root.innerHTML = '';
    root.appendChild(legacyInventory);

    legacyInventory.classList.add('inventory-v2-mounted');

    if (typeof window.render === 'function') {
      window.render();
    }
  }

  window.BarStockInventoryV2 = {
    mount: mountLegacyInventoryIntoV2
  };

  document.addEventListener('DOMContentLoaded', mountLegacyInventoryIntoV2);
  setTimeout(mountLegacyInventoryIntoV2, 500);
})();
