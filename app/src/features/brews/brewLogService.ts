import type { SupabaseClient } from '@supabase/supabase-js'
import type { BrewLog, BrewLogInsertPayload, BrewLogUpdatePayload } from './brewTypes'

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

export async function updateBrewLog(
  supabase: SupabaseClient,
  logId: string,
  payload: BrewLogUpdatePayload,
) {
  const { data, error } = await supabase
    .from('brew_logs')
    .update(payload)
    .eq('id', logId)
    .is('deleted_at', null)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as BrewLog
}

export async function softDeleteBrewLog(supabase: SupabaseClient, logId: string) {
  const { error } = await supabase
    .from('brew_logs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', logId)
    .is('deleted_at', null)

  if (error) {
    throw new Error(error.message)
  }
}
