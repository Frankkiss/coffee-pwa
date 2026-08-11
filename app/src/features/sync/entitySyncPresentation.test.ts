import { describe, expect, it } from 'vitest'
import type { BrewLog } from '../brews/brewTypes'
import { filterBrewLogsForBean, getEntitySyncBadge } from './entitySyncPresentation'

describe('entity sync presentation', () => {
  it('maps only repository-derived pending states to stable badges', () => {
    expect(getEntitySyncBadge('pending')).toBe('待同步')
    expect(getEntitySyncBadge('needs_attention')).toBe('需要处理')
    expect(getEntitySyncBadge(undefined)).toBeNull()
  })

  it('filters bean detail brews from the shared repository list', () => {
    const rows = [
      { id: 'brew-1', bean_id: 'bean-1' },
      { id: 'brew-2', bean_id: 'bean-2' },
    ] as BrewLog[]
    expect(filterBrewLogsForBean(rows, 'bean-1')).toEqual([rows[0]])
  })
})
