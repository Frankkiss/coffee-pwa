import type { SupabaseClient } from '@supabase/supabase-js'
import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import type { BackupRecordCounts } from './backupTypes'

export type BackupRows = {
  beans: Bean[]
  brewLogs: BrewLog[]
}

export async function fetchBackupRows(
  supabase: SupabaseClient,
): Promise<BackupRows> {
  const [beansResult, brewLogsResult] = await Promise.all([
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
  ])

  if (beansResult.error) {
    throw new Error(beansResult.error.message)
  }

  if (brewLogsResult.error) {
    throw new Error(brewLogsResult.error.message)
  }

  return {
    beans: (beansResult.data ?? []) as Bean[],
    brewLogs: (brewLogsResult.data ?? []) as BrewLog[],
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
