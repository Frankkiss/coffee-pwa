import { describe, expect, it, vi } from 'vitest'
import { prepareRepositoryWrite } from './repositoryContext'

describe('repository protection mode', () => {
  it('rejects before reading time, sync metadata, or creating a mutation', async () => {
    const now = vi.fn(() => new Date())
    const getSyncEpoch = vi.fn(async () => 1)

    await expect(prepareRepositoryWrite({
      userId: 'user-a',
      deviceId: '20000000-0000-4000-8000-000000000001',
      getSyncEpoch,
      now,
      syncMode: 'protection',
    })).rejects.toMatchObject({ code: 'SYNC_PROTECTION_MODE' })

    expect(now).not.toHaveBeenCalled()
    expect(getSyncEpoch).not.toHaveBeenCalled()
  })
})
