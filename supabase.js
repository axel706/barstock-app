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
    el.style.background = ok ? '#166534' : '#7f1d1d'
    el.style.color = '#fff'
    document.body.appendChild(el)
  }
  el.textContent = message
}

function getPayload() {
  return {
    exportedAt: new Date().toISOString(),
    state,
    aliases: aliases || {},
    usageData: usageData || [],
    priceAliases: priceAliases || {}
  }
}

async function saveCloud() {
  try {
    const payload = getPayload()
    const fileName = `real-backup-${Date.now()}.json`

    const { error } = await supabaseClient.storage
      .from('backups')
      .upload(fileName, new Blob([JSON.stringify(payload)]))

    if (error) {
      showStatus('❌ upload error')
      console.error(error)
      return
    }

    showStatus('✅ Cloud backup saved')
  } catch (e) {
    showStatus('❌ crash')
    console.error(e)
  }
}

async function restoreCloud() {
  try {
    const { data: files } = await supabaseClient.storage
      .from('backups')
      .list('', { sortBy: { column: 'name', order: 'desc' } })

    const latest = files.find(f => f.name.startsWith('real-backup-'))
    if (!latest) return showStatus('no backups')

    const { data } = await supabaseClient.storage
      .from('backups')
      .download(latest.name)

    const payload = JSON.parse(await data.text())

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload.state))
    localStorage.setItem(ALIAS_KEY, JSON.stringify(payload.aliases || {}))
    localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(payload.usageData || []))
    localStorage.setItem(PRICE_ALIAS_KEY, JSON.stringify(payload.priceAliases || {}))

    showStatus('✅ restored')
    setTimeout(() => location.reload(), 800)
  } catch (e) {
    showStatus('❌ restore error')
    console.error(e)
  }
}

function attachHandlers() {
  const saveBtn = document.getElementById('cloudSaveBtn')
  const restoreBtn = document.getElementById('cloudRestoreBtn')

  if (saveBtn) {
    saveBtn.onclick = saveCloud
  }

  if (restoreBtn) {
    restoreBtn.onclick = restoreCloud
  }
}

function waitAndAttach() {
  let tries = 0
  const i = setInterval(() => {
    tries++
    attachHandlers()

    if (document.getElementById('cloudSaveBtn') || tries > 20) {
      clearInterval(i)
    }
  }, 300)
}

window.addEventListener('load', waitAndAttach)
