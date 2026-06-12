import type { SupabaseClient } from '@supabase/supabase-js'
import type { Bean, BeanInsertPayload } from './beanTypes'

export async function listBeans(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('beans')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as Bean[]
}

export async function createBean(
  supabase: SupabaseClient,
  payload: BeanInsertPayload,
) {
  const { data, error } = await supabase
    .from('beans')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as Bean
}
