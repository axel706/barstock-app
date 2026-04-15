const SUPABASE_URL = 'https://lqmoftpedmbhtuzlbbuh.supabase.co'
const SUPABASE_KEY = 'sb_publishable_OOsEgZD8rRC6115PkGSHsA_nAB9n68S'

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

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
  el.style.color = '#fff'
}

function getPayload() {
  return {
    exportedAt: new Date().toISOString(),
    source: 'BarStock Pro V3.1 Web',
    state: typeof state !== 'undefined' ? state : null,
    aliases: typeof aliases !== 'undefined' ? aliases : {},
    usageData: typeof usageData !== 'undefined' ? usageData : [],
    priceAliases: typeof priceAliases !== 'undefined' ? priceAliases : {}
  }
}

async function saveCloud() {
  try {
    const payload = getPayload()

    if (!payload.state) {
      showStatus('❌ no app state found', false)
      return
    }

    const fileName = `real-backup-${Date.now()}.json`

    const { error } = await supabaseClient.storage
      .from('backups')
      .upload(
        fileName,
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
        { contentType: 'application/json', upsert: false }
      )

    if (error) {
      showStatus('❌ upload error: ' + error.message, false)
      console.error(error)
      return
    }

    showStatus('✅ Cloud backup saved')
    const exportMenu = document.getElementById('exportMenu')
    if (exportMenu) exportMenu.classList.add('hidden')
  } catch (e) {
    showStatus('❌ crash on save', false)
    console.error(e)
  }
}

async function restoreCloud() {
  try {
    const { data: files, error: listError } = await supabaseClient.storage
      .from('backups')
      .list('', { limit: 100, sortBy: { column: 'name', order: 'desc' } })

    if (listError) {
      showStatus('❌ list error: ' + listError.message, false)
      console.error(listError)
      return
    }

    const latest = (files || []).find(f => f.name.startsWith('real-backup-'))
    if (!latest) {
      showStatus('❌ no cloud backups', false)
      return
    }

    const { data, error: downloadError } = await supabaseClient.storage
      .from('backups')
      .download(latest.name)

    if (downloadError) {
      showStatus('❌ download error: ' + downloadError.message, false)
      console.error(downloadError)
      return
    }

    const payload = JSON.parse(await data.text())

    if (typeof STORAGE_KEY !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(payload.state))
    if (typeof ALIAS_KEY !== 'undefined') localStorage.setItem(ALIAS_KEY, JSON.stringify(payload.aliases || {}))
    if (typeof USAGE_STORAGE_KEY !== 'undefined') localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(payload.usageData || []))
    if (typeof PRICE_ALIAS_KEY !== 'undefined') localStorage.setItem(PRICE_ALIAS_KEY, JSON.stringify(payload.priceAliases || {}))

    showStatus('✅ Cloud backup restored')
    const importMenu = document.getElementById('importMenu')
    if (importMenu) importMenu.classList.add('hidden')

    setTimeout(() => location.reload(), 900)
  } catch (e) {
    showStatus('❌ restore failed', false)
    console.error(e)
  }
}

document.addEventListener('click', async (e) => {
  const saveBtn = e.target.closest('#cloudSaveBtn')
  const restoreBtn = e.target.closest('#cloudRestoreBtn')

  if (saveBtn) {
    e.preventDefault()
    e.stopPropagation()
    await saveCloud()
    return
  }

  if (restoreBtn) {
    e.preventDefault()
    e.stopPropagation()
    await restoreCloud()
    return
  }
}, true)

window.addEventListener('load', () => {
  showStatus('Cloud controls armed')
  setTimeout(() => {
    const hasSave = !!document.getElementById('cloudSaveBtn')
    const hasRestore = !!document.getElementById('cloudRestoreBtn')
    console.log('Cloud buttons found:', { hasSave, hasRestore })
  }, 800)
})
