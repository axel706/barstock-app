const SUPABASE_URL = 'https://lqmoftpedmbhtuzlbbuh.supabase.co'
const SUPABASE_KEY = 'sb_publishable_OOsEgZD8rRC6115PkGSHsA_nAB9n68S'

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

function cloudShow(message) {
  alert(message)
}

async function pushInventoryToDB() {
  try {
    if (typeof state === 'undefined' || !state || !Array.isArray(state.master)) {
      cloudShow('no inventory found')
      return
    }

    const rows = state.master.map(r => ({
      location_id: null,
      code: r.code || '',
      item_name: r.item || '',
      vendor: r.vendor || '',
      suggested: Number(r.suggested || 0),
      on_hand: Number(r.onHand || 0),
      value: Number(r.value || 0)
    }))

    const { error } = await supabaseClient
      .from('inventory_items')
      .insert(rows)

    if (error) {
      console.error(error)
      cloudShow('error pushing inventory: ' + error.message)
      return
    }

    cloudShow('inventory pushed to DB 🚀')
  } catch (e) {
    console.error(e)
    cloudShow('crash: ' + e.message)
  }
}

window.pushInventoryToDB = pushInventoryToDB
