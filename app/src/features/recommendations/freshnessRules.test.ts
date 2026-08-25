import { describe, expect, it } from 'vitest'
import { getFreshnessAdjustment } from './freshnessRules'

describe('freshness rules', () => {
  it.each([
    ['浅烘', '2026-08-18', 'degassing'],
    ['浅烘', '2026-07-09', 'normal'],
    ['浅烘', '2026-07-08', 'aged'],
    ['中烘', '2026-08-20', 'degassing'],
    ['中烘', '2026-07-19', 'normal'],
    ['中烘', '2026-07-18', 'aged'],
    ['深烘', '2026-08-21', 'degassing'],
    ['深烘', '2026-07-26', 'normal'],
    ['深烘', '2026-07-25', 'aged'],
  ] as const)('%s %s maps to %s', (roastLevel, roastDate, stage) => {
    expect(getFreshnessAdjustment({ roastLevel, roastDate, mode: 'hot_pourover', now: new Date('2026-08-23T12:00:00Z') }).stage).toBe(stage)
  })

  it('ignores missing, impossible and future dates', () => {
    for (const roastDate of [null, 'bad', '2026-02-30', '2026-08-24']) {
      expect(getFreshnessAdjustment({ roastLevel: '浅烘', roastDate, mode: 'hot_pourover', now: new Date('2026-08-23T12:00:00Z') }).stage).toBe('unknown')
    }
  })

  it('extends hand-brew bloom but only lowers espresso confidence during degassing', () => {
    const base = { roastLevel: '浅烘', roastDate: '2026-08-20', now: new Date('2026-08-23T12:00:00Z') }
    expect(getFreshnessAdjustment({ ...base, mode: 'iced_pourover' })).toMatchObject({ bloomTimeDeltaSeconds: 10, confidencePenalty: false })
    expect(getFreshnessAdjustment({ ...base, mode: 'espresso' })).toMatchObject({ bloomTimeDeltaSeconds: 0, confidencePenalty: true })
  })

  it('does not apply a temperature-style extraction delta to aged cold brew', () => {
    expect(getFreshnessAdjustment({
      roastLevel: '浅烘',
      roastDate: '2026-06-01',
      mode: 'cold_brew',
      now: new Date('2026-08-23T12:00:00Z'),
    })).toMatchObject({
      stage: 'aged',
      extractionDelta: 0,
      confidencePenalty: true,
    })
  })
})
