import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const event = req.body || {};

    const { error } = await supabase.from("app_logs").insert([
      {
        event_name: event.eventName,
        location_name: event.locationName || null,
        payload: event.payload || {},
        url: event.url || null,
        user_agent: event.userAgent || null,
        received_at: event.timestamp || null
      }
    ]);

    if (error) {
      console.error("Supabase insert error:", error);
    }

    console.log("[BARSTOCK LOG]", {
      receivedAt: new Date().toISOString(),
      ...event
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Log endpoint error:", err);
    return res.status(500).json({ ok: false });
  }
}
