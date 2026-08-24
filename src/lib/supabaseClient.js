import { createClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Missing Supabase env vars. Copy .env.example to .env and fill in your project URL and anon key.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
