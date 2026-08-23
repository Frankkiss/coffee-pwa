import type { BrewMode } from '../brews/brewTypes'
import { getRoastBand } from './beanMetadataRules'

export type FreshnessAdjustment = {
  stage: 'unknown' | 'degassing' | 'normal' | 'aged'
  roastAgeDays: number | null
  bloomTimeDeltaSeconds: number
  extractionDelta: -1 | 0 | 1
  confidencePenalty: boolean
  reason: string | null
}

export function getFreshnessAdjustment(input: {
  roastDate: string | null | undefined
  roastLevel: string | null | undefined
  mode: BrewMode
  now: Date
}): FreshnessAdjustment {
  const age = roastAgeDays(input.roastDate, input.now)
  if (age === null) return emptyFreshness()

  const roastBand = getRoastBand(input.roastLevel)
  const degassingEnd = roastBand === 'light' ? 5 : roastBand === 'dark' ? 2 : 3
  const normalEnd = roastBand === 'light' ? 45 : roastBand === 'dark' ? 28 : 35
  if (age <= degassingEnd) {
    return {
      stage: 'degassing', roastAgeDays: age,
      bloomTimeDeltaSeconds: input.mode === 'hot_pourover' || input.mode === 'iced_pourover' ? 10 : 0,
      extractionDelta: 0,
      confidencePenalty: input.mode === 'espresso',
      reason: input.mode === 'espresso' ? '仍在明显排气期，意式稳定性可能较低' : '仍在明显排气期，手冲闷蒸最多延长 10 秒',
    }
  }
  if (age <= normalEnd) {
    return { ...emptyFreshness(), stage: 'normal', roastAgeDays: age }
  }
  return {
    stage: 'aged', roastAgeDays: age, bloomTimeDeltaSeconds: 0,
    extractionDelta: 1, confidencePenalty: false,
    reason: '放置时间较久，仅做一次小幅萃取补偿，风味可能已有衰减',
  }
}

function roastAgeDays(roastDate: string | null | undefined, now: Date) {
  if (!roastDate || !/^\d{4}-\d{2}-\d{2}$/.test(roastDate)) return null
  const [year, month, day] = roastDate.split('-').map(Number)
  const calendarCheck = new Date(Date.UTC(year, month - 1, day))
  if (calendarCheck.getUTCFullYear() !== year
    || calendarCheck.getUTCMonth() !== month - 1
    || calendarCheck.getUTCDate() !== day) return null
  const start = new Date(`${roastDate}T00:00:00Z`)
  if (!Number.isFinite(start.getTime())) return null
  const age = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - start.getTime()) / 86_400_000)
  return age >= 0 ? age : null
}

function emptyFreshness(): FreshnessAdjustment {
  return { stage: 'unknown', roastAgeDays: null, bloomTimeDeltaSeconds: 0, extractionDelta: 0, confidencePenalty: false, reason: null }
}
