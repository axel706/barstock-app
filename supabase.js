const SUPABASE_URL = 'https://lqmoftpedmbhtuzlbbuh.supabase.co'
const SUPABASE_KEY = 'sb_publishable_OOsEgZD8rRC6115PkGSHsA_nAB9n68S'

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

function cloudSave() {
  try {
    const payload = {
      exportedAt: new Date().toISOString(),
      state,
      aliases,
      usageData,
      priceAliases
    }

    const fileName = 'real-backup-' + Date.now() + '.json'

    supabaseClient.storage.from('backups')
      .upload(fileName, new Blob([JSON.stringify(payload)]))
      .then(res => {
        if (res.error) {
          alert('❌ Upload error')
          console.error(res.error)
        } else {
          alert('✅ Cloud backup saved')
        }
      })

  } catch (e) {
    alert('❌ crash')
    console.error(e)
  }
}

function cloudRestore() {
  supabaseClient.storage.from('backups')
    .list('', { sortBy: { column: 'name', order: 'desc' } })
    .then(({ data }) => {
      const latest = data.find(f => f.name.startsWith('real-backup-'))
      if (!latest) return alert('no backups')

      return supabaseClient.storage.from('backups')
        .download(latest.name)
        .then(async ({ data }) => {
          const payload = JSON.parse(await data.text())

          localStorage.setItem(STORAGE_KEY, JSON.stringify(payload.state))
          localStorage.setItem(ALIAS_KEY, JSON.stringify(payload.aliases))
          localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(payload.usageData))
          localStorage.setItem(PRICE_ALIAS_KEY, JSON.stringify(payload.priceAliases))

          alert('✅ restored')
          location.reload()
        })
    })
}

async function pushInventoryToDB() {
  try {
    if (!state || !state.master) {
      alert('no inventory found')
      return
    }

    const rows = state.master.map(r => ({
      code: r.code || '',
      item: r.item || '',
      vendor: r.vendor || '',
      on_hand: r.onHand || 0,
      suggested: r.suggested || 0,
      value: r.value || 0
    }))

    const { error } = await supabaseClient
      .from('inventory_items')
      .insert(rows)

    if (error) {
      console.error(error)
      alert('error pushing inventory')
      return
    }

    alert('inventory pushed to DB 🚀')

  } catch (e) {
    console.error(e)
    alert('crash')
  }
}

window.pushInventoryToDB = pushInventoryToDB

