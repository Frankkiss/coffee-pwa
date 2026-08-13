import { describe, expect, it } from 'vitest'
import {
  buildBackupReminder,
  buildBackupReminderFromResolution,
  createOwnedBackupReminderResolution,
  createBackupReminderApi,
  resolveBackupReminderMeta,
  selectBackupReminderResolutionForOwner,
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

  it('uses the newest cloud export across devices instead of legacy local metadata', async () => {
    const storage = createMemoryStorage()
    storage.setItem('kaday:last-json-backup', JSON.stringify({
      exportedAt: '2026-06-15T00:00:00.000Z',
      fileName: 'coffee-backup-legacy.json',
    }))
    await expect(resolveBackupReminderMeta({
      getLatestBackupExport: async () => ({
        exportedAt: '2026-06-18T00:00:00.000Z',
        fileName: 'coffee-backup-2026-06-18.json',
      }),
    }, storage)).resolves.toEqual({
      status: 'ready', source: 'cloud', meta: {
        exportedAt: '2026-06-18T00:00:00.000Z',
        fileName: 'coffee-backup-2026-06-18.json',
      },
    })
  })

  it('reads the deprecated local fallback only after cloud explicitly returns no row', async () => {
    const storage = createMemoryStorage()
    storage.setItem('kaday:last-json-backup', JSON.stringify({
      exportedAt: '2026-06-15T00:00:00.000Z', fileName: 'legacy.json',
    }))
    await expect(resolveBackupReminderMeta({
      getLatestBackupExport: async () => null,
    }, storage)).resolves.toMatchObject({ status: 'ready', source: 'legacy' })
  })

  it('does not disguise cloud failure as legacy or cloud success', async () => {
    const storage = createMemoryStorage()
    storage.setItem('kaday:last-json-backup', JSON.stringify({
      exportedAt: '2026-06-15T00:00:00.000Z', fileName: 'legacy.json',
    }))
    await expect(resolveBackupReminderMeta({
      getLatestBackupExport: async () => { throw new Error('offline') },
    }, storage)).resolves.toEqual({ status: 'unavailable', source: null, meta: null })
  })

  it('renders cloud failure as unavailable instead of never-backed-up', () => {
    expect(buildBackupReminderFromResolution(
      { status: 'unavailable', source: null, meta: null },
      new Date('2026-06-15T00:00:00Z'),
      7,
    )).toMatchObject({
      tone: 'warning', title: '暂时无法读取云端备份记录', daysSinceExport: null,
    })
  })

  it('isolates reminder metadata when the signed-in account changes', () => {
    const accountA = createOwnedBackupReminderResolution('account-a', {
      status: 'ready', source: 'cloud', meta: {
        exportedAt: '2026-06-18T00:00:00.000Z', fileName: 'account-a.json',
      },
    })
    expect(selectBackupReminderResolutionForOwner(accountA, 'account-b')).toEqual({
      status: 'unavailable', source: null, meta: null,
    })
    expect(selectBackupReminderResolutionForOwner(accountA, 'account-a')).toEqual(accountA.resolution)
  })

  it('strictly validates the latest-export RPC response', async () => {
    const responses: unknown[] = [
      { exportedAt: '2026-06-18T00:00:00Z', fileName: 'ok.json', userId: 'leak' },
      { exportedAt: 'not-a-time', fileName: 'ok.json' },
      { exportedAt: '2026-02-30T00:00:00Z', fileName: 'ok.json' },
      { exportedAt: '2026-06-18T24:00:00Z', fileName: 'ok.json' },
      { exportedAt: '2026-06-18T00:00:00+24:00', fileName: 'ok.json' },
      { exportedAt: 'Infinity', fileName: 'ok.json' },
      { exportedAt: '2026-06-18T00:00:00Z', fileName: '../bad.json' },
    ]
    for (const data of responses) {
      const api = createBackupReminderApi({
        rpc: async () => ({ data, error: null }),
      } as never)
      await expect(api.getLatestBackupExport()).rejects.toMatchObject({
        code: 'INVALID_BACKUP_REMINDER_RESPONSE',
      })
    }
  })

  it('accepts null and an exact safe reminder response', async () => {
    const values: unknown[] = [null, {
      exportedAt: '2026-06-18T00:00:00.000Z', fileName: 'coffee-backup-2026-06-18.json',
    }, {
      exportedAt: '2024-02-29T23:59:59.123456789+05:30', fileName: 'offset.json',
    }]
    for (const data of values) {
      const api = createBackupReminderApi({ rpc: async () => ({ data, error: null }) } as never)
      await expect(api.getLatestBackupExport()).resolves.toEqual(data)
    }
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
