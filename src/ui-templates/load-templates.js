(function () {
  async function loadTemplate(id, path) {
    const target = document.getElementById(id);
    if (!target) return;

    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path}`);

    target.innerHTML = await res.text();
  }

  window.BarStockTemplates = {
    loadAll: async function () {
      await loadTemplate('inventoryTemplateMount', 'src/ui-templates/inventory-section.html');
      await loadTemplate('vendorTemplateMount', 'src/ui-templates/vendor-section.html');
      await loadTemplate('historyTemplateMount', 'src/ui-templates/history-section.html');
      await loadTemplate('noMatchTemplateMount', 'src/ui-templates/no-match-section.html');
      await loadTemplate('usageTemplateMount', 'src/ui-templates/usage-section.html');
    }
  };
})();


document.addEventListener('DOMContentLoaded', () => {
  window.BarStockTemplates.loadAll();
});
