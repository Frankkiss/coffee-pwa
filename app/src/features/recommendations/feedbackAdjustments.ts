import type { BrewLog } from '../brews/brewTypes'

export type FeedbackAdjustment = {
  source: 'feedback'
  priority: 'primary' | 'secondary'
  target: 'extraction' | 'concentration'
  direction: 'increase' | 'decrease'
  reason: string
  limits: {
    temperatureC: 2
    timePercent: 10
    ratioDenominator: 0.5
    grindSteps: 1
  }
}

const limits = {
  temperatureC: 2,
  timePercent: 10,
  ratioDenominator: 0.5,
  grindSteps: 1,
} as const

export function deriveFeedbackAdjustments(
  brewLog: BrewLog | null,
  tasteGoals: string[],
): FeedbackAdjustment[] {
  if (!brewLog || brewLog.rating === null || brewLog.rating > 3) return []
  const adjustments: FeedbackAdjustment[] = []
  const bitterOrAstringent = isHigh(brewLog.bitterness) || isHigh(brewLog.astringency)
  const brightPreferred = tasteGoals.some((goal) => /明亮|酸质|果酸/.test(goal))
  const sharpAcidity = isHigh(brewLog.acidity)
    && (!brightPreferred || /尖酸|酸涩|酸得/.test(brewLog.notes ?? ''))

  if (bitterOrAstringent) {
    adjustments.push(adjustment('primary', 'extraction', 'decrease', '上一杯苦味或涩感强且满意度低，降低萃取压力'))
  } else if (sharpAcidity) {
    adjustments.push(adjustment('primary', 'extraction', 'increase', '上一杯酸质强且满意度低，小幅提高萃取'))
  } else if (isLow(brewLog.sweetness)) {
    adjustments.push(adjustment('primary', 'extraction', 'increase', '上一杯甜感弱且没有明显苦涩，小幅提高萃取'))
  }

  if (isLow(brewLog.body)) {
    adjustments.push(adjustment('secondary', 'concentration', 'increase', '上一杯醇厚度低且满意度低，小幅提高浓度'))
  } else if (isHigh(brewLog.body) && /厚重|闷|黏/.test(brewLog.notes ?? '')) {
    adjustments.push(adjustment('secondary', 'concentration', 'decrease', '上一杯醇厚度高且反馈厚重，小幅降低浓度'))
  }

  return adjustments.slice(0, 2)
}

function adjustment(
  priority: FeedbackAdjustment['priority'],
  target: FeedbackAdjustment['target'],
  direction: FeedbackAdjustment['direction'],
  reason: string,
): FeedbackAdjustment {
  return { source: 'feedback', priority, target, direction, reason, limits }
}

function isHigh(value: number | null) { return value !== null && value >= 4 }
function isLow(value: number | null) { return value !== null && value <= 2 }
