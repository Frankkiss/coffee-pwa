import { describe, expect, it } from 'vitest'
import {
  readSyncRolloutMode,
  resolveSyncRolloutMode,
} from './syncFeatureFlag'

describe('resolveSyncRolloutMode', () => {
  it.each([
    [undefined, null, 'protection'],
    ['invalid', 'true', 'protection'],
    ['pilot', null, 'protection'],
    ['pilot', 'enabled', 'protection'],
    ['pilot', 'TRUE', 'protection'],
    ['pilot', 'true', 'enabled'],
    ['enabled', null, 'enabled'],
    ['enabled', 'false', 'enabled'],
    ['protection', 'true', 'protection'],
  ] as const)('resolves build=%s override=%s to %s', (buildValue, localOverride, expected) => {
    expect(resolveSyncRolloutMode({ buildValue, localOverride })).toBe(expected)
  })

  it('does not consult local storage outside pilot builds', () => {
    const storage = { getItem: () => { throw new Error('must not read') } }
    expect(readSyncRolloutMode('enabled', storage)).toBe('enabled')
    expect(readSyncRolloutMode('protection', storage)).toBe('protection')
    expect(readSyncRolloutMode(undefined, storage)).toBe('protection')
  })

  it('fails closed when pilot local storage cannot be read', () => {
    const storage = { getItem: () => { throw new Error('blocked') } }
    expect(readSyncRolloutMode('pilot', storage)).toBe('protection')
  })
})
