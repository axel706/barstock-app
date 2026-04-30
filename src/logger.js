(() => {
  if (window.BarStockLogger) return;

  async function log(eventName, payload = {}) {
    try {
      const config = window.BARSTOCK_CONFIG || {};
      if (!config.BACKEND_URL) return;

      await fetch(`${config.BACKEND_URL}/api/log`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          eventName,
          payload,
          locationName: config.LOCATION_NAME || null,
          userAgent: navigator.userAgent,
          url: window.location.href,
          timestamp: new Date().toISOString()
        })
      });
    } catch (err) {
      console.warn("BarStock log failed", err);
    }
  }

  window.BarStockLogger = { log };
})();
