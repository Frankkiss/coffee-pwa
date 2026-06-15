import type { SupabaseClient } from '@supabase/supabase-js'
import {
  toBrewTemplateFromRow,
  type BrewTemplateForm,
  toUserBrewTemplatePayload,
} from './brewTemplateModel'
import type {
  BrewTemplate,
  UserBrewTemplatePayload,
  UserBrewTemplateRow,
} from './brewTemplateTypes'

export async function listUserBrewTemplates(
  supabase: SupabaseClient,
): Promise<BrewTemplate[]> {
  const { data, error } = await supabase
    .from('brew_templates')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as UserBrewTemplateRow[]).map(toBrewTemplateFromRow)
}

export async function createUserBrewTemplate(
  supabase: SupabaseClient,
  payload: UserBrewTemplatePayload,
) {
  const { data, error } = await supabase
    .from('brew_templates')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return toBrewTemplateFromRow(data as UserBrewTemplateRow)
}

export async function updateUserBrewTemplate(
  supabase: SupabaseClient,
  id: string,
  payload: UserBrewTemplatePayload,
) {
  const { data, error } = await supabase
    .from('brew_templates')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return toBrewTemplateFromRow(data as UserBrewTemplateRow)
}

export async function softDeleteUserBrewTemplate(
  supabase: SupabaseClient,
  id: string,
) {
  const { error } = await supabase
    .from('brew_templates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    throw new Error(error.message)
  }
}

export function buildUserBrewTemplatePayload(
  form: BrewTemplateForm,
  userId: string,
  copiedFromTemplateId: string | null = null,
) {
  return toUserBrewTemplatePayload(form, userId, copiedFromTemplateId)
}
