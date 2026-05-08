(() => {
  if (window.BarStockUIV2) return;

  function init() {
    console.info('BarStock UI V2 shell loaded in passive mode.');
  }

  window.BarStockUIV2 = {
    init
  };

  window.addEventListener('load', init);
})();
