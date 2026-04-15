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

async function restoreLatestBackup() {
  try {
    const { data: files, error: listError } = await supabaseClient.storage
      .from('backups')
      .list('', {
        limit: 100,
        sortBy: { column: 'name', order: 'desc' }
      })

    if (listError) {
      showStatus('List error: ' + listError.message, false)
      console.error(listError)
      return
    }

    const realFiles = (files || []).filter(f => f.name.startsWith('real-backup-'))
    if (!realFiles.length) {
      showStatus('No real backups found', false)
      return
    }

    const latest = realFiles[0]

    const { data: downloadData, error: downloadError } = await supabaseClient.storage
      .from('backups')
      .download(latest.name)

    if (downloadError) {
      showStatus('Download error: ' + downloadError.message, false)
      console.error(downloadError)
      return
    }

    const text = await downloadData.text()
    const payload = JSON.parse(text)

    if (!payload.state) {
      showStatus('Backup is missing state', false)
      return
    }

    if (payload.storageKeys?.state) {
      localStorage.setItem(payload.storageKeys.state, JSON.stringify(payload.state))
    }
    if (payload.storageKeys?.aliases) {
      localStorage.setItem(payload.storageKeys.aliases, JSON.stringify(payload.aliases || {}))
    }
    if (payload.storageKeys?.usage) {
      localStorage.setItem(payload.storageKeys.usage, JSON.stringify(payload.usageData || []))
    }
    if (payload.storageKeys?.priceAliases) {
      localStorage.setItem(payload.storageKeys.priceAliases, JSON.stringify(payload.priceAliases || {}))
    }

    showStatus(
      `Backup restored: ${latest.name} | Master: ${payload.summary?.masterCount ?? 'n/a'}`,
      true
    )

    setTimeout(() => {
      location.reload()
    }, 1200)
  } catch (err) {
    showStatus('Restore failed: ' + err.message, false)
    console.error(err)
  }
}

function createButtons() {
  const uploadBtn = document.createElement('button')
  uploadBtn.textContent = '☁️ Upload Real Backup'
  uploadBtn.style.position = 'fixed'
  uploadBtn.style.left = '16px'
  uploadBtn.style.bottom = '16px'
  uploadBtn.style.zIndex = '99999'
  uploadBtn.style.padding = '12px 14px'
  uploadBtn.style.borderRadius = '12px'
  uploadBtn.style.background = '#0284c7'
  uploadBtn.style.color = '#fff'
  uploadBtn.style.border = 'none'
  uploadBtn.style.fontWeight = '700'
  uploadBtn.style.cursor = 'pointer'
  uploadBtn.onclick = uploadRealBackup
  document.body.appendChild(uploadBtn)

  const restoreBtn = document.createElement('button')
  restoreBtn.textContent = '☁️ Restore Latest Backup'
  restoreBtn.style.position = 'fixed'
  restoreBtn.style.left = '16px'
  restoreBtn.style.bottom = '70px'
  restoreBtn.style.zIndex = '99999'
  restoreBtn.style.padding = '12px 14px'
  restoreBtn.style.borderRadius = '12px'
  restoreBtn.style.background = '#16a34a'
  restoreBtn.style.color = '#fff'
  restoreBtn.style.border = 'none'
  restoreBtn.style.fontWeight = '700'
  restoreBtn.style.cursor = 'pointer'
  restoreBtn.onclick = restoreLatestBackup
  document.body.appendChild(restoreBtn)
}

window.addEventListener('load', () => {
  createButtons()
})
