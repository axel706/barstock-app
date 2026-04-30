export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const order = req.body || {};
  const items = Array.isArray(order.items) ? order.items : [];

  const warnings = [];

  if (!order.vendor) warnings.push("Missing vendor.");
  if (!items.length) warnings.push("Order has no items.");

  items.forEach((item, index) => {
    const name = String(item.item || item.item_name || "").trim();
    const qty = Number(item.finalOrder || item.qty || item.quantity || 0);
    const price = Number(item.value || item.unit_price || 0);

    if (!name) warnings.push(`Item ${index + 1}: missing name.`);
    if (qty <= 0) warnings.push(`${name || `Item ${index + 1}`}: quantity is zero or invalid.`);
    if (price <= 0) warnings.push(`${name || `Item ${index + 1}`}: price is zero or invalid.`);
  });

  const seen = new Set();
  items.forEach((item) => {
    const key = String(item.item || item.item_name || "").trim().toLowerCase();
    if (!key) return;
    if (seen.has(key)) warnings.push(`Duplicate item: ${item.item || item.item_name}`);
    seen.add(key);
  });

  return res.status(200).json({
    ok: warnings.length === 0,
    warnings,
    checkedAt: new Date().toISOString()
  });
}
