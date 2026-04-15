const SUPABASE_URL = 'https://lqmoftpedmbhtuzlbbuh.supabase.co'
const SUPABASE_KEY = 'sb_publishable_OOsEgZD8rRC6115PkGSHsA_nAB9n68S'

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
window.supabaseClient = supabaseClient

console.log('✅ Supabase conectado:', supabaseClient)
