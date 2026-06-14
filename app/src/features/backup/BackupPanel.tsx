import { useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import {
  buildBackupImportPayloads,
  createBackupImportPreview,
  parseBackupDocument,
} from './backupImport'
import { buildBackupDocument, createBackupFileName } from './backupExport'
import {
  fetchBackupRows,
  fetchExistingBackupIds,
  importBackupRows,
  recordBackupExport,
  type ExistingBackupIds,
} from './backupService'
import { buildBeansCsv, buildBrewLogsCsv, createCsvFileName } from './csvExport'
import type { BackupDocument, BackupImportPreview } from './backupTypes'
import './backup.css'

type BackupPanelProps = {
  session: Session
  supabase: SupabaseClient
}

export function BackupPanel({ session, supabase }: BackupPanelProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [isExportingBeansCsv, setIsExportingBeansCsv] = useState(false)
  const [isExportingBrewLogsCsv, setIsExportingBrewLogsCsv] = useState(false)
  const [isReadingImport, setIsReadingImport] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importBackup, setImportBackup] = useState<BackupDocument | null>(null)
  const [importPreview, setImportPreview] =
    useState<BackupImportPreview | null>(null)
  const [existingIds, setExistingIds] = useState<ExistingBackupIds | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

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

      setStatus(
        `已导出 ${backup.recordCounts.beans} 支豆子、${backup.recordCounts.brewLogs} 条冲煮记录。`,
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
      const backup = parseBackupDocument(jsonText)
      const nextExistingIds = await fetchExistingBackupIds(supabase)
      const preview = createBackupImportPreview(backup, nextExistingIds)

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
      const payloads = buildBackupImportPayloads(
        importBackup,
        importPreview,
        session.user.id,
        {
          existingBeanIds: existingIds.beanIds,
        },
      )

      await importBackupRows(supabase, payloads)
      setStatus(
        `已导入 ${payloads.beans.length} 支豆子、${payloads.brewLogs.length} 条冲煮记录；已跳过 ${importPreview.duplicates.beans} 支重复豆子、${importPreview.duplicates.brewLogs} 条重复冲煮记录。`,
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
    (importPreview?.importable.brewLogs ?? 0)

  return (
    <section className="backup-panel" aria-labelledby="backup-title">
      <div>
        <p className="backup-panel__eyebrow">Backup</p>
        <h2 id="backup-title">本地备份</h2>
        <p>导出当前账号的豆仓和冲煮记录。JSON 用于恢复，CSV 用于表格查看。</p>
      </div>

      <button type="button" onClick={handleExport} disabled={isExporting}>
        {isExporting ? '导出中' : '导出 JSON 备份'}
      </button>

      <div className="backup-panel__divider" />

      <div className="backup-csv">
        <div>
          <strong>CSV 导出</strong>
          <p>用于 Excel、WPS、Notion 等工具查看；不影响 JSON 备份恢复。</p>
        </div>
        <div className="backup-csv__actions">
          <button
            type="button"
            onClick={handleBeansCsvExport}
            disabled={isExportingBeansCsv}
          >
            {isExportingBeansCsv ? '导出中' : '导出咖啡豆 CSV'}
          </button>
          <button
            type="button"
            onClick={handleBrewLogsCsvExport}
            disabled={isExportingBrewLogsCsv}
          >
            {isExportingBrewLogsCsv ? '导出中' : '导出冲煮记录 CSV'}
          </button>
        </div>
      </div>

      <div className="backup-panel__divider" />

      <div className="backup-import">
        <label>
          选择 JSON 备份文件
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
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleConfirmImport}
          disabled={isImporting || isReadingImport || importableCount === 0}
        >
          {isImporting ? '导入中' : '确认导入非重复数据'}
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
