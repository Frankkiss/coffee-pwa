import { describe, expect, it } from 'vitest'
import {
  createOfflinePendingMutation,
  getPendingMutationsForUser,
  isOfflineWriteFailure,
} from './offlineQueue'

describe('offline pending mutations', () => {
  it('builds a user-scoped pending mutation with retry metadata', () => {
    const mutation = createOfflinePendingMutation({
      id: 'mutation-1',
      userId: 'user-1',
      entity: 'bean',
      action: 'create',
      payload: { name: 'Ethiopia' },
      createdAt: new Date('2026-06-20T00:00:00.000Z'),
    })

    expect(mutation).toEqual({
      id: 'mutation-1',
      userId: 'user-1',
      entity: 'bean',
      action: 'create',
      payload: { name: 'Ethiopia' },
      createdAt: '2026-06-20T00:00:00.000Z',
      attempts: 0,
      lastError: null,
    })
  })

  it('returns pending mutations for the current user in created order', () => {
    const mutations = [
      createOfflinePendingMutation({
        id: 'later',
        userId: 'user-1',
        entity: 'bean',
        action: 'delete',
        entityId: 'bean-1',
        createdAt: new Date('2026-06-20T00:02:00.000Z'),
      }),
      createOfflinePendingMutation({
        id: 'other-user',
        userId: 'user-2',
        entity: 'bean',
        action: 'create',
        payload: { name: 'Ignored' },
        createdAt: new Date('2026-06-20T00:01:00.000Z'),
      }),
      createOfflinePendingMutation({
        id: 'earlier',
        userId: 'user-1',
        entity: 'brewLog',
        action: 'update',
        entityId: 'brew-1',
        payload: { notes: 'retry later' },
        createdAt: new Date('2026-06-20T00:00:00.000Z'),
      }),
    ]

    expect(getPendingMutationsForUser(mutations, 'user-1').map((mutation) => mutation.id)).toEqual([
      'earlier',
      'later',
    ])
  })

  it('treats offline network errors as retryable write failures', () => {
    expect(isOfflineWriteFailure(new TypeError('Failed to fetch'))).toBe(true)
    expect(isOfflineWriteFailure(new Error('NetworkError when attempting to fetch resource.'))).toBe(
      true,
    )
    expect(isOfflineWriteFailure(new Error('duplicate key value violates unique constraint'))).toBe(
      false,
    )
  })
})
