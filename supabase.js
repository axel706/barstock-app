const SUPABASE_URL = 'https://lqmoftpedmbhtuzlbbuh.supabase.co'
const SUPABASE_KEY = 'sb_publishable_OOsEgZD8rRC6115PkGSHsA_nAB9n68S'

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
window.supabaseClient = supabaseClient

function showStatus(message, ok = true) {
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
    el.style.maxWidth = '420px'
    el.style.boxShadow = '0 10px 24px rgba(0,0,0,.2)'
    document.body.appendChild(el)
  }

  el.textContent = message
  el.style.background = ok ? '#166534' : '#7f1d1d'
  el.style.color = ok ? '#dcfce7' : '#fee2e2'
}

async function loadLocations() {
  const { data, error } = await supabaseClient
    .from('locations')
    .select('name')
    .order('name')

  if (error) {
    showStatus('Read error: ' + error.message, false)
    return
  }

  showStatus('Locations: ' + data.map(x => x.name).join(', '), true)
}

async function insertTestLocation() {
  const name = 'Test ' + Math.floor(Math.random() * 1000)

  const { error } = await supabaseClient
    .from('locations')
    .insert([{ name }])

  if (error) {
    showStatus('Insert error: ' + error.message, false)
    return
  }

  showStatus('Inserted: ' + name, true)
  loadLocations()
}

function createButton() {
  const btn = document.createElement('button')
  btn.textContent = '➕ Add Test Location'
  btn.style.position = 'fixed'
  btn.style.left = '16px'
  btn.style.bottom = '16px'
  btn.style.zIndex = '99999'
  btn.style.padding = '12px 14px'
  btn.style.borderRadius = '12px'
  btn.style.background = '#0284c7'
  btn.style.color = '#fff'
  btn.style.border = 'none'
  btn.style.fontWeight = '700'
  btn.style.cursor = 'pointer'

  btn.onclick = insertTestLocation

  document.body.appendChild(btn)
}

window.addEventListener('load', () => {
  loadLocations()
  createButton()
})
