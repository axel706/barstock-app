(() => {
  if (window.BarStockOrderValidator) return;

  async function validate(order) {
    try {
      const config = window.BARSTOCK_CONFIG || {};
      if (!config.BACKEND_URL) return { ok: true, warnings: [] };

      const res = await fetch(`${config.BACKEND_URL}/api/validate-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order)
      });

      if (!res.ok) {
        return { ok: true, warnings: [`Validator unavailable: ${res.status}`] };
      }

      return await res.json();
    } catch (err) {
      console.warn("BarStock order validation failed", err);
      return { ok: true, warnings: ["Validator failed silently."] };
    }
  }

  window.BarStockOrderValidator = { validate };
})();
