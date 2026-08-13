import { describe, expect, it } from 'vitest'
import { requireDevelopmentFixture } from './backupFixturePolicy'

describe('requireDevelopmentFixture', () => {
  it('rejects a supplied backup fixture in production mode', () => {
    const fixture = { api: 'fake-api' }

    expect(() => requireDevelopmentFixture(fixture, false)).toThrow(
      'Backup fixtures are development-only',
    )
  })

  it('allows a supplied backup fixture in development mode', () => {
    const fixture = { api: 'fake-api' }

    expect(requireDevelopmentFixture(fixture, true)).toBe(fixture)
  })

  it('allows production rendering when no fixture is supplied', () => {
    expect(requireDevelopmentFixture(undefined, false)).toBeUndefined()
  })
})
