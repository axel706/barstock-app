(() => {
  if (window.BarStockEvents) return;

  function emit(eventName, payload = {}) {
    window.dispatchEvent(new CustomEvent(`barstock:${eventName}`, {
      detail: payload
    }));
  }

  function on(eventName, handler) {
    const wrapped = (event) => handler(event.detail || {});
    window.addEventListener(`barstock:${eventName}`, wrapped);

    return () => {
      window.removeEventListener(`barstock:${eventName}`, wrapped);
    };
  }

  window.BarStockEvents = {
    emit,
    on
  };
})();
