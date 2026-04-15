const SUPABASE_URL = 'https://lqmoftpedmbhtuzlbbuh.supabase.co'
const SUPABASE_KEY = 'sb_publishable_OOsEgZD8rRC6115PkGSHsA_nAB9n68S'

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
window.supabaseClient = supabaseClient

function cloudStatus(message, ok = true) {
  if (typeof setStatus === 'function') {
    setStatus(message)
    return
  }

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
    priceAliases: typeof priceAliases !== 'undefined' ? priceAliases : {},
    theme: document.body.classList.contains('light') ? 'light' : 'dark',
    sectionStates: typeof loadSectionStates === 'function' ? loadSectionStates() : {}
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
      cloudStatus('Cloud backup failed: ' + error.message, false)
      console.error(error)
      return
    }

    cloudStatus(
      `Cloud backup saved. Master: ${payload.summary.masterCount} | No Match: ${payload.summary.noMatchCount}`,
      true
    )
    console.log('✅ Real backup uploaded:', fileName, payload)
  } catch (err) {
    cloudStatus('Cloud backup failed: ' + err.message, false)
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
      cloudStatus('Cloud restore failed: ' + listError.message, false)
      console.error(listError)
      return
    }

    const realFiles = (files || []).filter(f => f.name.startsWith('real-backup-'))
    if (!realFiles.length) {
      cloudStatus('No cloud backups found.', false)
      return
    }

    const latest = realFiles[0]

    const { data: downloadData, error: downloadError } = await supabaseClient.storage
      .from('backups')
      .download(latest.name)

    if (downloadError) {
      cloudStatus('Cloud restore failed: ' + downloadError.message, false)
      console.error(downloadError)
      return
    }

    const text = await downloadData.text()
    const payload = JSON.parse(text)

    if (!payload.state) {
      cloudStatus('Selected cloud backup is missing app state.', false)
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
    if (payload.storageKeys?.theme && payload.theme) {
      localStorage.setItem(payload.storageKeys.theme, payload.theme)
    }

    cloudStatus(
      `Cloud backup restored. Master: ${payload.summary?.masterCount ?? 'n/a'}`,
      true
    )

    setTimeout(() => {
      location.reload()
    }, 900)
  } catch (err) {
    cloudStatus('Cloud restore failed: ' + err.message, false)
    console.error(err)
  }
}

function makeMenuButton(id, text, handler) {
  const btn = document.createElement('button')
  btn.id = id
  btn.type = 'button'
  btn.textContent = text
  btn.addEventListener('click', handler)
  return btn
}

function renameLocalBackupLabels() {
  const backupBtn = document.getElementById('backupBtn')
  if (backupBtn) backupBtn.textContent = 'Export Local Backup'

  const backupInput = document.getElementById('backupFile')
  if (backupInput) {
    const label = backupInput.closest('label')
    if (label) {
      const textNode = Array.from(label.childNodes).find(n => n.nodeType === Node.TEXT_NODE)
      if (textNode) {
        textNode.nodeValue = 'Import Local Backup '
      } else {
        label.prepend('Import Local Backup ')
      }
    }
  }
}

function injectCloudButtons() {
  renameLocalBackupLabels()

  const exportMenu = document.getElementById('exportMenu')
  if (exportMenu && !document.getElementById('cloudBackupBtn')) {
    exportMenu.appendChild(
      makeMenuButton('cloudBackupBtn', 'Save Cloud Backup', uploadRealBackup)
    )
  }

  const importMenu = document.getElementById('importMenu')
  if (importMenu && !document.getElementById('cloudRestoreBtn')) {
    importMenu.appendChild(
      makeMenuButton('cloudRestoreBtn', 'Restore Latest Cloud Backup', restoreLatestBackup)
    )
  }
}

window.addEventListener('load', () => {
  injectCloudButtons()
})
