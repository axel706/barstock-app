(() => {
  if (window.BarStockQuickOrder) return;

  let quickOrderDraftItems = [];
  let quickOrderVendorTab = 'LOOP';

  function getState(){
    return window.state || state;
  }

  function expose(){
    window.BarStockQuickOrder = {
      get quickOrderDraftItems(){ return quickOrderDraftItems; },
      get quickOrderVendorTab(){ return quickOrderVendorTab; }
    };
  }

  expose();

  console.info('BarStock Quick Order module loaded in passive mode.');
})();
