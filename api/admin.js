const { createClient } = require('@supabase/supabase-js');

const ADMIN_EMAIL = 'axeltorressalgado@icloud.com';
const ACCOUNT_ID = 'wjm-hospitality';

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ ok: false, error: "Missing token" });

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return res.status(401).json({ ok: false, error: "Invalid session" });
    }
    if (userData.user.email !== ADMIN_EMAIL) {
      return res.status(403).json({ ok: false, error: "Not authorized" });
    }

    const { action } = req.body || {};

    if (action === 'list') {
      const { data, error } = await supabase
        .from('signup_requests')
        .select('id, email, status, created_at, first_name, last_name, business_name, address, phone, message')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return res.status(200).json({ ok: true, requests: data });
    }

    if (action === 'listLocations') {
      const { data, error } = await supabase
        .from('locations')
        .select('id, name')
        .eq('account_id', ACCOUNT_ID)
        .order('name', { ascending: true });
      if (error) throw error;
      return res.status(200).json({ ok: true, locations: data });
    }

    if (action === 'approve') {
      const { requestId, locationId, role } = req.body || {};
      if (!requestId || !locationId) {
        return res.status(400).json({ ok: false, error: "Missing requestId or locationId" });
      }

      const { data: reqRow, error: reqError } = await supabase
        .from('signup_requests')
        .select('id, user_id, status')
        .eq('id', requestId)
        .single();
      if (reqError || !reqRow) throw reqError || new Error('Request not found');
      if (reqRow.status !== 'pending') {
        return res.status(400).json({ ok: false, error: "Request already processed" });
      }

      const { error: accessError } = await supabase
        .from('user_location_access')
        .insert({
          user_id: reqRow.user_id,
          account_id: ACCOUNT_ID,
          location_id: locationId,
          role: role || 'staff'
        });
      if (accessError) throw accessError;

      const { error: updateError } = await supabase
        .from('signup_requests')
        .update({ status: 'approved' })
        .eq('id', requestId);
      if (updateError) throw updateError;

      return res.status(200).json({ ok: true });
    }

    if (action === 'deny') {
      const { requestId } = req.body || {};
      if (!requestId) return res.status(400).json({ ok: false, error: "Missing requestId" });

      const { error } = await supabase
        .from('signup_requests')
        .update({ status: 'denied' })
        .eq('id', requestId);
      if (error) throw error;

      return res.status(200).json({ ok: true });
    }

    if (action === 'createLocation') {
      const { name } = req.body || {};
      if (!name || !name.trim()) {
        return res.status(400).json({ ok: false, error: "Missing location name" });
      }

      const { data, error } = await supabase
        .from('locations')
        .insert({ name: name.trim(), account_id: ACCOUNT_ID })
        .select('id, name')
        .single();
      if (error) throw error;

      return res.status(200).json({ ok: true, location: data });
    }

    return res.status(400).json({ ok: false, error: "Unknown action" });
  } catch (err) {
    console.error('admin endpoint error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
