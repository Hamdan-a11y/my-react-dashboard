import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://sdzrqsnxvcciksrrwcbo.supabase.co'
const supabaseAnonKey = 'sb_publishable_H6sv-7eZE9A3NvRcfHH2gQ_WrysNYxS'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
