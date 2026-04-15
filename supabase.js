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

async function uploadTestBackup() {
  const payload = {
    createdAt: new Date().toISOString(),
    source: 'BarStock Pro V3.1',
    note: 'Test backup from web app',
    locations: ['The Crown Tavern', 'The Jockey Tavern', "Will's & Bill's"]
  }

  const fileName = `test-backup-${Date.now()}.json`
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json'
  })

  const { error } = await supabaseClient.storage
    .from('backups')
    .upload(fileName, blob, {
      contentType: 'application/json',
      upsert: false
    })

  if (error) {
    showStatus('Upload error: ' + error.message, false)
    console.error(error)
    return
  }

  showStatus('Backup uploaded: ' + fileName, true)
  console.log('✅ Backup uploaded:', fileName)
}

function createButtons() {
  const writeBtn = document.createElement('button')
  writeBtn.textContent = '☁️ Upload Test Backup'
  writeBtn.style.position = 'fixed'
  writeBtn.style.left = '16px'
  writeBtn.style.bottom = '16px'
  writeBtn.style.zIndex = '99999'
  writeBtn.style.padding = '12px 14px'
  writeBtn.style.borderRadius = '12px'
  writeBtn.style.background = '#0284c7'
  writeBtn.style.color = '#fff'
  writeBtn.style.border = 'none'
  writeBtn.style.fontWeight = '700'
  writeBtn.style.cursor = 'pointer'
  writeBtn.onclick = uploadTestBackup
  document.body.appendChild(writeBtn)
}

window.addEventListener('load', () => {
  loadLocations()
  createButtons()
})
