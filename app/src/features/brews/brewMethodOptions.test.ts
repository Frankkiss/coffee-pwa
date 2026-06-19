import { describe, expect, it } from 'vitest'
import { brewMethodOptions } from './brewMethodOptions'

describe('brewMethodOptions', () => {
  it('includes moka pot as a built-in brew method', () => {
    expect(brewMethodOptions).toContain('摩卡壶')
  })
})
