import type { SupabaseClient } from '@supabase/supabase-js'
import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import type { UserBrewTemplateRow } from '../brewTemplates/brewTemplateTypes'
import type { BackupRecordCounts } from './backupTypes'

export type BackupRows = {
  beans: Bean[]
  brewLogs: BrewLog[]
  brewTemplates: UserBrewTemplateRow[]
}

export type ExistingBackupIds = {
  beanIds: Set<string>
  brewLogIds: Set<string>
  brewTemplateIds: Set<string>
}

export type BackupImportRows = {
  beans: Bean[]
  brewLogs: BrewLog[]
  brewTemplates: UserBrewTemplateRow[]
}

export async function fetchBackupRows(
  supabase: SupabaseClient,
): Promise<BackupRows> {
  const [beansResult, brewLogsResult, brewTemplatesResult] = await Promise.all([
    supabase
      .from('beans')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('brew_logs')
      .select('*')
      .is('deleted_at', null)
      .order('brewed_at', { ascending: false }),
    supabase
      .from('brew_templates')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])

  if (beansResult.error) {
    throw new Error(beansResult.error.message)
  }

  if (brewLogsResult.error) {
    throw new Error(brewLogsResult.error.message)
  }

  if (brewTemplatesResult.error) {
    throw new Error(brewTemplatesResult.error.message)
  }

  return {
    beans: (beansResult.data ?? []) as Bean[],
    brewLogs: (brewLogsResult.data ?? []) as BrewLog[],
    brewTemplates: (brewTemplatesResult.data ?? []) as UserBrewTemplateRow[],
  }
}

export async function recordBackupExport(
  supabase: SupabaseClient,
  input: {
    userId: string
    fileName: string
    recordCounts: BackupRecordCounts
  },
) {
  const { error } = await supabase.from('backup_exports').insert({
    user_id: input.userId,
    export_type: 'json',
    includes_images: false,
    file_name: input.fileName,
    record_counts: input.recordCounts,
  })

  if (error) {
    throw new Error(error.message)
  }
}

export async function fetchExistingBackupIds(
  supabase: SupabaseClient,
): Promise<ExistingBackupIds> {
  const [beansResult, brewLogsResult, brewTemplatesResult] = await Promise.all([
    supabase.from('beans').select('id').is('deleted_at', null),
    supabase.from('brew_logs').select('id').is('deleted_at', null),
    supabase.from('brew_templates').select('id').is('deleted_at', null),
  ])

  if (beansResult.error) {
    throw new Error(beansResult.error.message)
  }

  if (brewLogsResult.error) {
    throw new Error(brewLogsResult.error.message)
  }

  if (brewTemplatesResult.error) {
    throw new Error(brewTemplatesResult.error.message)
  }

  return {
    beanIds: new Set((beansResult.data ?? []).map((row) => row.id as string)),
    brewLogIds: new Set(
      (brewLogsResult.data ?? []).map((row) => row.id as string),
    ),
    brewTemplateIds: new Set(
      (brewTemplatesResult.data ?? []).map((row) => row.id as string),
    ),
  }
}

export async function importBackupRows(
  supabase: SupabaseClient,
  rows: BackupImportRows,
) {
  if (rows.beans.length > 0) {
    const { error } = await supabase.from('beans').insert(rows.beans)

    if (error) {
      throw new Error(error.message)
    }
  }

  if (rows.brewLogs.length > 0) {
    const { error } = await supabase.from('brew_logs').insert(rows.brewLogs)

    if (error) {
      throw new Error(error.message)
    }
  }

  if (rows.brewTemplates.length > 0) {
    const { error } = await supabase.from('brew_templates').insert(rows.brewTemplates)

    if (error) {
      throw new Error(error.message)
    }
  }
}
