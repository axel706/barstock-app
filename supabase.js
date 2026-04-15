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
      masterCount: Array.isArray(state?.master) ? state.master.length : 0,
      noMatchCount: Array.isArray(state?.noMatches) ? state.noMatches.length : 0,
      orderHistoryCount: Array.isArray(state?.orderHistory) ? state.orderHistory.length : 0,
      placedOrdersCount: Array.isArray(state?.placedOrders) ? state.placedOrders.length : 0,
      usageCount: Array.isArray(window.usageData) ? window.usageData.length : 0
    },
    state,
    aliases: typeof window.aliases !== 'undefined' ? window.aliases : {},
    usageData: typeof window.usageData !== 'undefined' ? window.usageData : [],
    priceAliases: typeof window.priceAliases !== 'undefined' ? window.priceAliases : {}
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
      showStatus('Cloud backup error: ' + error.message, false)
      console.error(error)
      return
    }

    showStatus(`Cloud backup saved: ${fileName} | Master: ${payload.summary.masterCount}`, true)
  } catch (err) {
    showStatus('Cloud backup failed: ' + err.message, false)
    console.error(err)
  }
}

async function restoreLatestBackup() {
  try {
    const { data: files, error: listError } = await supabaseClient.storage
      .from('backups')
      .list('', { limit: 100, sortBy: { column: 'name', order: 'desc' } })

    if (listError) {
      showStatus('Cloud list error: ' + listError.message, false)
      return
    }

    const latest = (files || []).find(f => f.name.startsWith('real-backup-'))
    if (!latest) {
      showStatus('No cloud backups found', false)
      return
    }

    const { data, error: downloadError } = await supabaseClient.storage
      .from('backups')
      .download(latest.name)

    if (downloadError) {
      showStatus('Cloud download error: ' + downloadError.message, false)
      return
    }

    const payload = JSON.parse(await data.text())

    if (payload.storageKeys?.state) localStorage.setItem(payload.storageKeys.state, JSON.stringify(payload.state))
    if (payload.storageKeys?.aliases) localStorage.setItem(payload.storageKeys.aliases, JSON.stringify(payload.aliases || {}))
    if (payload.storageKeys?.usage) localStorage.setItem(payload.storageKeys.usage, JSON.stringify(payload.usageData || []))
    if (payload.storageKeys?.priceAliases) localStorage.setItem(payload.storageKeys.priceAliases, JSON.stringify(payload.priceAliases || {}))

    showStatus('Cloud backup restored', true)
    setTimeout(() => location.reload(), 1000)
  } catch (err) {
    showStatus('Cloud restore failed: ' + err.message, false)
    console.error(err)
  }
}

function renameLocalBackupLabels() {
  const backupBtn = document.getElementById('backupBtn')
  if (backupBtn) backupBtn.textContent = 'Export Local Backup'

  const backupFile = document.getElementById('backupFile')
  if (backupFile) {
    const label = backupFile.closest('label')
    if (label) {
      label.innerHTML = 'Import Local Backup <input type="file" id="backupFile" accept=".json" />'
      const newInput = label.querySelector('#backupFile')
      if (newInput && typeof importBackup === 'function') {
        newInput.addEventListener('change', async e => {
          const f = e.target.files[0]
          if (!f) return
          try {
            await importBackup(f)
          } catch (err) {
            alert('Invalid backup file.')
          }
          e.target.value = ''
          const m = document.getElementById('importMenu')
          if (m) m.classList.add('hidden')
        })
      }
    }
  }
}

function injectCloudButtons() {
  const exportMenu = document.getElementById('exportMenu')
  const importMenu = document.getElementById('importMenu')

  if (exportMenu && !document.getElementById('cloudSaveBtn')) {
    const cloudSaveBtn = document.createElement('button')
    cloudSaveBtn.id = 'cloudSaveBtn'
    cloudSaveBtn.textContent = 'Save Cloud Backup'
    cloudSaveBtn.addEventListener('click', async () => {
      await uploadRealBackup()
      exportMenu.classList.add('hidden')
    })
    exportMenu.appendChild(cloudSaveBtn)
  }

  if (importMenu && !document.getElementById('cloudRestoreBtn')) {
    const cloudRestoreBtn = document.createElement('button')
    cloudRestoreBtn.id = 'cloudRestoreBtn'
    cloudRestoreBtn.textContent = 'Restore Latest Cloud Backup'
    cloudRestoreBtn.addEventListener('click', async () => {
      await restoreLatestBackup()
      importMenu.classList.add('hidden')
    })
    importMenu.appendChild(cloudRestoreBtn)
  }
}

function bootCloudMenus() {
  renameLocalBackupLabels()
  injectCloudButtons()
}

function bootWithRetries() {
  let tries = 0
  const timer = setInterval(() => {
    tries += 1
    bootCloudMenus()

    const ok = document.getElementById('cloudSaveBtn') && document.getElementById('cloudRestoreBtn')
    if (ok || tries > 20) {
      clearInterval(timer)
      if (ok) showStatus('Cloud menu options ready', true)
    }
  }, 300)
}

window.addEventListener('load', bootWithRetries)
