import { describe, expect, it } from 'vitest'
import type { Bean } from '../beans/beanTypes'
import { createOwnedHomeRows, selectHomeRowsForOwner } from './homeRowsModel'

const empty = { beans: [], brewLogs: [] }
const bean = { id: 'bean-a', name: 'private-a' } as Bean

describe('home row ownership', () => {
  it('hides the previous account rows while the next account is still loading', () => {
    const accountARows = createOwnedHomeRows('account-a', { ...empty, beans: [bean] })

    expect(selectHomeRowsForOwner(accountARows, 'account-b')).toEqual(empty)
    expect(selectHomeRowsForOwner(accountARows, 'account-a').beans).toEqual([bean])
  })

  it('keeps a late previous-account result invisible and accepts preview rows for their owner', () => {
    const lateAccountARows = createOwnedHomeRows('account-a', { ...empty, beans: [bean] })
    const previewRows = createOwnedHomeRows('preview-user', { ...empty, beans: [bean] })

    expect(selectHomeRowsForOwner(lateAccountARows, 'account-b')).toEqual(empty)
    expect(selectHomeRowsForOwner(previewRows, 'preview-user').beans).toEqual([bean])
  })
})
