import { describe, expect, it } from 'vitest'
import {
  buildBackupReminder,
  readBackupReminderMeta,
  writeBackupReminderMeta,
} from './backupReminder'

describe('backup reminder', () => {
  it('asks for a backup when no previous export is recorded', () => {
    expect(buildBackupReminder(null, new Date('2026-06-15T00:00:00Z'), 14)).toMatchObject({
      tone: 'warning',
      title: '尚未创建本地备份',
      fileName: null,
      daysSinceExport: null,
    })
  })

  it('shows a normal state when the last export is within seven days', () => {
    expect(
      buildBackupReminder(
        { exportedAt: '2026-06-12T00:00:00.000Z', fileName: 'coffee-backup-2026-06-12.json' },
        new Date('2026-06-15T00:00:00Z'),
        7,
      ),
    ).toMatchObject({
      tone: 'ok',
      title: '最近已备份',
      fileName: 'coffee-backup-2026-06-12.json',
      daysSinceExport: 3,
    })
  })

  it('warns when the last export is older than seven days', () => {
    expect(
      buildBackupReminder(
        { exportedAt: '2026-06-01T00:00:00.000Z', fileName: 'coffee-backup-2026-06-01.json' },
        new Date('2026-06-15T00:00:00Z'),
        7,
      ),
    ).toMatchObject({
      tone: 'warning',
      title: '建议导出一次备份',
      daysSinceExport: 14,
    })
  })

  it('round-trips valid metadata through localStorage', () => {
    const storage = createMemoryStorage()

    writeBackupReminderMeta(storage, {
      exportedAt: '2026-06-15T00:00:00.000Z',
      fileName: 'coffee-backup-2026-06-15.json',
    })

    expect(readBackupReminderMeta(storage)).toEqual({
      exportedAt: '2026-06-15T00:00:00.000Z',
      fileName: 'coffee-backup-2026-06-15.json',
    })
  })
})

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()

  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key: string) {
      return values.get(key) ?? null
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null
    },
    removeItem(key: string) {
      values.delete(key)
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
  }
}
