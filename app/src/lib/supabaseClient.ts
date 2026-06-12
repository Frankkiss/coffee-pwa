import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export function getSupabaseConfigError() {
  if (!supabaseUrl) {
    return 'Missing VITE_SUPABASE_URL'
  }

  if (!supabaseAnonKey) {
    return 'Missing VITE_SUPABASE_ANON_KEY'
  }

  return null
}

export const supabase: SupabaseClient | null = getSupabaseConfigError()
  ? null
  : createClient(supabaseUrl as string, supabaseAnonKey as string)
