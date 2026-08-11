import { useEffect, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import {
  buildBackupImportPayloads,
  createBackupImportPreview,
  parseBackupDocument,
} from './backupImport'
import {
  buildBackupDocument,
  createBackupFileName,
  createRestorePointFileName,
} from './backupExport'
import {
  fetchBackupRows,
  fetchExistingBackupIds,
  importBackupRows,
  recordBackupExport,
  type ExistingBackupIds,
} from './backupService'
import { buildBeansCsv, buildBrewLogsCsv, createCsvFileName } from './csvExport'
import type { BackupImportPreview, ParsedBackupDocument } from './backupTypes'
import { useSyncRuntime } from '../sync/SyncContext'
import {
  buildBackupReminder,
  readBackupReminderMeta,
  writeBackupReminderMeta,
  type BackupReminderMeta,
} from './backupReminder'
import './backup.css'

type BackupPanelProps = {
  session: Session
  supabase: SupabaseClient
}

export function BackupPanel({ session, supabase }: BackupPanelProps) {
  const runtime = useSyncRuntime()
  const settingsRepository = runtime.repositories?.userSettings ?? null
  const [backupReminderDays, setBackupReminderDays] = useState(7)
  const [isExporting, setIsExporting] = useState(false)
  const [isExportingBeansCsv, setIsExportingBeansCsv] = useState(false)
  const [isExportingBrewLogsCsv, setIsExportingBrewLogsCsv] = useState(false)
  const [isReadingImport, setIsReadingImport] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importBackup, setImportBackup] = useState<ParsedBackupDocument | null>(null)
  const [importPreview, setImportPreview] =
    useState<BackupImportPreview | null>(null)
  const [existingIds, setExistingIds] = useState<ExistingBackupIds | null>(null)
  const [backupReminderMeta, setBackupReminderMeta] =
    useState<BackupReminderMeta | null>(() =>
      typeof window === 'undefined'
        ? null
        : readBackupReminderMeta(window.localStorage),
    )
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!settingsRepository) return
    let current = true
    let loadGeneration = 0
    const load = async () => {
      const generation = ++loadGeneration
      try {
        const settings = await settingsRepository.getUserSettings()
        if (current && generation === loadGeneration) {
          setBackupReminderDays(settings?.backup_reminder_days ?? 7)
        }
      } catch {
        if (current && generation === loadGeneration) setBackupReminderDays(7)
      }
    }
    void load()
    const unsubscribe = settingsRepository.subscribe(() => void load())
    return () => {
      current = false
      loadGeneration += 1
      unsubscribe()
    }
  }, [settingsRepository])

  async function handleExport() {
    setIsExporting(true)
    setStatus('')
    setError('')

    try {
      const now = new Date()
      const exportedAt = now.toISOString()
      const fileName = createBackupFileName(now)
      const rows = await fetchBackupRows(supabase)
      const backup = buildBackupDocument({
        userId: session.user.id,
        exportedAt,
        beans: rows.beans,
        brewLogs: rows.brewLogs,
        brewTemplates: rows.brewTemplates,
      })

      downloadTextFile(
        JSON.stringify(backup, null, 2),
        fileName,
        'application/json;charset=utf-8',
      )

      await recordBackupExport(supabase, {
        userId: session.user.id,
        fileName,
        recordCounts: backup.recordCounts,
      })

      const nextReminderMeta = { exportedAt, fileName }
      writeBackupReminderMeta(window.localStorage, nextReminderMeta)
      setBackupReminderMeta(nextReminderMeta)

      setStatus(
        `已导出 ${backup.recordCounts.beans} 支豆子、${backup.recordCounts.brewLogs} 条冲煮记录、${backup.recordCounts.brewTemplates} 个自定义模板。`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出备份失败')
    } finally {
      setIsExporting(false)
    }
  }

  async function handleBeansCsvExport() {
    setIsExportingBeansCsv(true)
    setStatus('')
    setError('')

    try {
      const rows = await fetchBackupRows(supabase)
      downloadTextFile(
        buildBeansCsv(rows.beans),
        createCsvFileName('beans', new Date()),
        'text/csv;charset=utf-8',
      )
      setStatus(`已导出 ${rows.beans.length} 支咖啡豆 CSV。`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出咖啡豆 CSV 失败')
    } finally {
      setIsExportingBeansCsv(false)
    }
  }

  async function handleBrewLogsCsvExport() {
    setIsExportingBrewLogsCsv(true)
    setStatus('')
    setError('')

    try {
      const rows = await fetchBackupRows(supabase)
      downloadTextFile(
        buildBrewLogsCsv(rows.brewLogs),
        createCsvFileName('brew-logs', new Date()),
        'text/csv;charset=utf-8',
      )
      setStatus(`已导出 ${rows.brewLogs.length} 条冲煮记录 CSV。`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出冲煮记录 CSV 失败')
    } finally {
      setIsExportingBrewLogsCsv(false)
    }
  }

  async function handleImportFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0]
    setImportBackup(null)
    setImportPreview(null)
    setExistingIds(null)
    setStatus('')
    setError('')

    if (!file) {
      return
    }

    setIsReadingImport(true)

    try {
      const jsonText = await file.text()
      const backup = await parseBackupDocument(jsonText)
      const nextExistingIds = await fetchExistingBackupIds(supabase)
      const preview = createBackupImportPreview(backup.document, nextExistingIds)

      setImportBackup(backup)
      setExistingIds(nextExistingIds)
      setImportPreview(preview)
      setStatus('备份文件已读取，请确认预览后再导入。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取备份文件失败')
    } finally {
      setIsReadingImport(false)
    }
  }

  async function handleConfirmImport() {
    if (!importBackup || !importPreview || !existingIds) {
      return
    }

    setIsImporting(true)
    setStatus('')
    setError('')

    try {
      const now = new Date()
      const restorePointFileName = createRestorePointFileName(now)
      const currentRows = await fetchBackupRows(supabase)
      const restorePoint = buildBackupDocument({
        userId: session.user.id,
        exportedAt: now.toISOString(),
        beans: currentRows.beans,
        brewLogs: currentRows.brewLogs,
        brewTemplates: currentRows.brewTemplates,
      })

      downloadTextFile(
        JSON.stringify(restorePoint, null, 2),
        restorePointFileName,
        'application/json;charset=utf-8',
      )

      const payloads = buildBackupImportPayloads(
        importBackup.document,
        importPreview,
        session.user.id,
        {
          existingBeanIds: existingIds.beanIds,
        },
      )

      await importBackupRows(supabase, payloads)
      setStatus(
        `已先下载恢复点 ${restorePointFileName}，再导入 ${payloads.beans.length} 支豆子、${payloads.brewLogs.length} 条冲煮记录、${payloads.brewTemplates.length} 个自定义模板；已跳过 ${importPreview.duplicates.beans} 支重复豆子、${importPreview.duplicates.brewLogs} 条重复冲煮记录、${importPreview.duplicates.brewTemplates} 个重复模板。`,
      )
      setImportBackup(null)
      setImportPreview(null)
      setExistingIds(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入备份失败')
    } finally {
      setIsImporting(false)
    }
  }

  const importableCount =
    (importPreview?.importable.beans ?? 0) +
    (importPreview?.importable.brewLogs ?? 0) +
    (importPreview?.importable.brewTemplates ?? 0)
  const backupReminder = buildBackupReminder(
    backupReminderMeta,
    new Date(),
    backupReminderDays,
  )

  return (
    <section id="backup" className="backup-panel" aria-labelledby="backup-title">
      <div>
        <p className="backup-panel__eyebrow">Backup</p>
        <h2 id="backup-title">本地备份</h2>
        <p>JSON 恢复，CSV 查看。</p>
      </div>

      <div className={`backup-reminder backup-reminder--${backupReminder.tone}`}>
        <strong>{backupReminder.title}</strong>
        <p>{backupReminder.message}</p>
        {backupReminder.fileName ? <span>最近文件：{backupReminder.fileName}</span> : null}
      </div>

      <button type="button" onClick={handleExport} disabled={isExporting}>
        {isExporting ? '导出中' : '导出 JSON'}
      </button>

      <div className="backup-panel__divider" />

      <div className="backup-csv">
        <div>
          <strong>CSV 导出</strong>
        </div>
        <div className="backup-csv__actions">
          <button
            type="button"
            onClick={handleBeansCsvExport}
            disabled={isExportingBeansCsv}
          >
            {isExportingBeansCsv ? '导出中' : '豆子 CSV'}
          </button>
          <button
            type="button"
            onClick={handleBrewLogsCsvExport}
            disabled={isExportingBrewLogsCsv}
          >
            {isExportingBrewLogsCsv ? '导出中' : '冲煮 CSV'}
          </button>
        </div>
      </div>

      <div className="backup-panel__divider" />

      <div className="backup-import">
        <label>
          导入 JSON
          <input
            type="file"
            accept="application/json,.json"
            onChange={handleImportFileChange}
            disabled={isReadingImport || isImporting}
          />
        </label>

        {importPreview ? (
          <div className="backup-preview" role="status">
            <strong>导入预览</strong>
            <span>
              豆子：共 {importPreview.total.beans} 支，可导入{' '}
              {importPreview.importable.beans} 支，跳过重复{' '}
              {importPreview.duplicates.beans} 支。
            </span>
            <span>
              冲煮记录：共 {importPreview.total.brewLogs} 条，可导入{' '}
              {importPreview.importable.brewLogs} 条，跳过重复{' '}
              {importPreview.duplicates.brewLogs} 条。
            </span>
            <span>
              自定义模板：共 {importPreview.total.brewTemplates} 个，可导入{' '}
              {importPreview.importable.brewTemplates} 个，跳过重复{' '}
              {importPreview.duplicates.brewTemplates} 个。
            </span>
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleConfirmImport}
          disabled={isImporting || isReadingImport || importableCount === 0}
        >
          {isImporting ? '导入中' : '确认导入'}
        </button>
      </div>

      {status ? <p className="backup-status">{status}</p> : null}
      {error ? <p className="backup-error">{error}</p> : null}
    </section>
  )
}

function downloadTextFile(content: string, fileName: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
