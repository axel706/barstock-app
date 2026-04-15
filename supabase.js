const SUPABASE_URL = 'https://lqmoftpedmbhtuzlbbuh.supabase.co'
const SUPABASE_KEY = 'sb_publishable_OOsEgZD8rRC6115PkGSHsA_nAB9n68S'

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
window.supabaseClient = supabaseClient

async function testSupabaseConnection() {
  try {
    const { data, error } = await supabaseClient
      .from('locations')
      .select('name')
      .limit(3)

    let el = document.getElementById('supabaseStatus')
    if (!el) {
      el = document.createElement('div')
      el.id = 'supabaseStatus'
      el.style.position = 'fixed'
      el.style.right = '16px'
      el.style.bottom = '16px'
      el.style.zIndex = '99999'
      el.style.padding = '12px 14px'
      el.style.borderRadius = '12px'
      el.style.fontWeight = '700'
      el.style.fontFamily = 'system-ui, sans-serif'
      el.style.maxWidth = '360px'
      el.style.boxShadow = '0 10px 24px rgba(0,0,0,.2)'
      document.body.appendChild(el)
    }

    if (error) {
      el.textContent = 'Supabase error: ' + error.message
      el.style.background = '#7f1d1d'
      el.style.color = '#fee2e2'
      console.error(error)
      return
    }

    el.textContent = 'Supabase conectado. Locations: ' + data.map(x => x.name).join(', ')
    el.style.background = '#166534'
    el.style.color = '#dcfce7'
    console.log('✅ Supabase conectado:', data)
  } catch (err) {
    let el = document.getElementById('supabaseStatus')
    if (!el) {
      el = document.createElement('div')
      el.id = 'supabaseStatus'
      el.style.position = 'fixed'
      el.style.right = '16px'
      el.style.bottom = '16px'
      el.style.zIndex = '99999'
      el.style.padding = '12px 14px'
      el.style.borderRadius = '12px'
      el.style.fontWeight = '700'
      el.style.fontFamily = 'system-ui, sans-serif'
      el.style.maxWidth = '360px'
      el.style.boxShadow = '0 10px 24px rgba(0,0,0,.2)'
      document.body.appendChild(el)
    }
    el.textContent = 'Supabase fatal error'
    el.style.background = '#7f1d1d'
    el.style.color = '#fee2e2'
    console.error(err)
  }
}

window.addEventListener('load', testSupabaseConnection)
