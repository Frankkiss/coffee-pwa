import type { SupabaseClient } from '@supabase/supabase-js'
import type { Bean, BeanInsertPayload, BeanUpdatePayload } from './beanTypes'

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

export async function updateBean(
  supabase: SupabaseClient,
  beanId: string,
  payload: BeanUpdatePayload,
) {
  const { data, error } = await supabase
    .from('beans')
    .update(payload)
    .eq('id', beanId)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as Bean
}

export async function softDeleteBean(
  supabase: SupabaseClient,
  beanId: string,
) {
  const { data, error } = await supabase
    .from('beans')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', beanId)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as Bean
}
