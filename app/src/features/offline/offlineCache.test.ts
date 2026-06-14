import { describe, expect, it } from 'vitest'
import {
  buildOfflineCacheSnapshot,
  getOfflineRowsForUser,
  isOfflineCacheForUser,
} from './offlineCache'

type TestRow = {
  id: string
  name: string
}

describe('offline cache snapshots', () => {
  it('builds a user-scoped cache snapshot', () => {
    const rows: TestRow[] = [{ id: 'bean-1', name: 'Ethiopia' }]

    const snapshot = buildOfflineCacheSnapshot(
      rows,
      'user-1',
      new Date('2026-06-15T00:00:00.000Z'),
    )

    expect(snapshot).toEqual({
      userId: 'user-1',
      updatedAt: '2026-06-15T00:00:00.000Z',
      rows,
    })
  })

  it('only returns rows for the current user', () => {
    const snapshot = buildOfflineCacheSnapshot(
      [{ id: 'bean-1', name: 'Ethiopia' }],
      'user-1',
      new Date('2026-06-15T00:00:00.000Z'),
    )

    expect(isOfflineCacheForUser(snapshot, 'user-1')).toBe(true)
    expect(getOfflineRowsForUser(snapshot, 'user-1')).toEqual([
      { id: 'bean-1', name: 'Ethiopia' },
    ])
    expect(isOfflineCacheForUser(snapshot, 'user-2')).toBe(false)
    expect(getOfflineRowsForUser(snapshot, 'user-2')).toBeNull()
  })

  it('rejects missing or malformed snapshots', () => {
    expect(getOfflineRowsForUser(null, 'user-1')).toBeNull()
    expect(getOfflineRowsForUser({ userId: 'user-1' }, 'user-1')).toBeNull()
    expect(getOfflineRowsForUser({ userId: 'user-1', updatedAt: '', rows: [] }, 'user-1')).toBeNull()
  })
})
