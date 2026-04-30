export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const event = req.body || {};

  console.log("[BARSTOCK LOG]", {
    receivedAt: new Date().toISOString(),
    ...event
  });

  return res.status(200).json({
    ok: true,
    receivedAt: new Date().toISOString()
  });
}
