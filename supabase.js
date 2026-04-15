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
    el.style.maxWidth = '460px'
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

  showStatus('Supabase OK. Locations: ' + data.map(x => x.name).join(', '), true)
}

function getRealBackupPayload() {
  if (typeof state === 'undefined') {
    throw new Error('App state is not available')
  }

  return {
    exportedAt: new Date().toISOString(),
    source: 'BarStock Pro V3.1 Web',
    storageKeys: {
      state: typeof STORAGE_KEY !== 'undefined' ? STORAGE_KEY : null,
      aliases: typeof ALIAS_KEY !== 'undefined' ? ALIAS_KEY : null,
      usage: typeof USAGE_STORAGE_KEY !== 'undefined' ? USAGE_STORAGE_KEY : null,
      priceAliases: typeof PRICE_ALIAS_KEY !== 'undefined' ? PRICE_ALIAS_KEY : null,
      theme: typeof THEME_KEY !== 'undefined' ? THEME_KEY : null
    },
    summary: {
      masterCount: Array.isArray(state.master) ? state.master.length : 0,
      noMatchCount: Array.isArray(state.noMatches) ? state.noMatches.length : 0,
      orderHistoryCount: Array.isArray(state.orderHistory) ? state.orderHistory.length : 0,
      placedOrdersCount: Array.isArray(state.placedOrders) ? state.placedOrders.length : 0,
      usageCount: Array.isArray(usageData) ? usageData.length : 0
    },
    state,
    aliases: typeof aliases !== 'undefined' ? aliases : {},
    usageData: typeof usageData !== 'undefined' ? usageData : [],
    priceAliases: typeof priceAliases !== 'undefined' ? priceAliases : {}
  }
}

async function uploadRealBackup() {
  try {
    const payload = getRealBackupPayload()
    const fileName = `real-backup-${Date.now()}.json`

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

    showStatus(
      `Backup uploaded: ${fileName} | Master: ${payload.summary.masterCount} | No Match: ${payload.summary.noMatchCount}`,
      true
    )
    console.log('✅ Real backup uploaded:', fileName, payload)
  } catch (err) {
    showStatus('Backup failed: ' + err.message, false)
    console.error(err)
  }
}

function createButtons() {
  const btn = document.createElement('button')
  btn.textContent = '☁️ Upload Real Backup'
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
  btn.onclick = uploadRealBackup
  document.body.appendChild(btn)
}

window.addEventListener('load', () => {
  loadLocations()
  createButtons()
})
