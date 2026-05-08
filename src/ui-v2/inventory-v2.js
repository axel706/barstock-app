(function () {
  if (window.BarStockInventoryV2) return;

  function isV2Mode() {
    return new URLSearchParams(window.location.search).get('uiV2') === '1';
  }

  function mountLegacyInventoryPreviewIntoV2() {
    if (!isV2Mode()) return;

    const root = document.getElementById('barstockInventoryV2');
    const legacyInventory = document.getElementById('inventorySection');

    if (!root || !legacyInventory) return;

    const clone = legacyInventory.cloneNode(true);

    clone.id = 'inventorySectionV2Preview';
    clone.classList.add('inventory-v2-mounted', 'inventory-v2-preview');

    clone.querySelectorAll('[id]').forEach((el) => {
      el.id = `${el.id}V2Preview`;
    });

    clone.querySelectorAll('button, input, select, textarea').forEach((el) => {
      el.disabled = true;
      el.setAttribute('aria-disabled', 'true');
    });

    root.innerHTML = '';
    root.appendChild(clone);
  }

  window.BarStockInventoryV2 = {
    mount: mountLegacyInventoryPreviewIntoV2
  };

  document.addEventListener('DOMContentLoaded', mountLegacyInventoryPreviewIntoV2);
  setTimeout(mountLegacyInventoryPreviewIntoV2, 500);
})();
