import type { SupabaseClient } from '@supabase/supabase-js'
import type { BrewLog, BrewLogInsertPayload } from './brewTypes'

export async function listBrewLogs(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('brew_logs')
    .select('*')
    .is('deleted_at', null)
    .order('brewed_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as BrewLog[]
}

export async function createBrewLog(
  supabase: SupabaseClient,
  payload: BrewLogInsertPayload,
) {
  const { data, error } = await supabase
    .from('brew_logs')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as BrewLog
}
