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
    el.style.maxWidth = '520px'
    el.style.boxShadow = '0 10px 24px rgba(0,0,0,.2)'
    document.body.appendChild(el)
  }

  el.textContent = message
  el.style.background = ok ? '#166534' : '#7f1d1d'
  el.style.color = ok ? '#dcfce7' : '#fee2e2'
}

function getRealBackupPayload() {
  return {
    exportedAt: new Date().toISOString(),
    source: 'BarStock Pro V3.1 Web',
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
      .upload(fileName, blob)

    if (error) {
      showStatus('Cloud backup error', false)
      return
    }

    showStatus('Cloud backup saved', true)
  } catch (err) {
    showStatus('Cloud backup failed', false)
  }
}

async function restoreLatestBackup() {
  try {
    const { data: files } = await supabaseClient.storage
      .from('backups')
      .list('', { sortBy: { column: 'name', order: 'desc' } })

    const latest = files.find(f => f.name.startsWith('real-backup-'))
    if (!latest) {
      showStatus('No cloud backups', false)
      return
    }

    const { data } = await supabaseClient.storage
      .from('backups')
      .download(latest.name)

    const payload = JSON.parse(await data.text())

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload.state))
    localStorage.setItem(ALIAS_KEY, JSON.stringify(payload.aliases || {}))
    localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(payload.usageData || []))
    localStorage.setItem(PRICE_ALIAS_KEY, JSON.stringify(payload.priceAliases || {}))

    showStatus('Cloud backup restored', true)
    setTimeout(() => location.reload(), 1000)
  } catch {
    showStatus('Cloud restore failed', false)
  }
}

window.addEventListener('load', () => {
  document.getElementById('cloudSaveBtn')?.addEventListener('click', uploadRealBackup)
  document.getElementById('cloudRestoreBtn')?.addEventListener('click', restoreLatestBackup)
})
