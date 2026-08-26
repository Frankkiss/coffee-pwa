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
  const signals = noteSignals(brewLog.notes, tasteGoals)
  const bitterOrAstringent = isHigh(brewLog.bitterness)
    || isHigh(brewLog.astringency)
    || signals.reduceExtraction
  const brightPreferred = tasteGoals.some((goal) => /明亮|酸质|果酸/.test(goal))
  const sharpAcidity = (isHigh(brewLog.acidity) || signals.increaseExtraction)
    && (!brightPreferred || signals.increaseExtraction)
  const weakSweetness = isLow(brewLog.sweetness)
    || /甜感不足|不够甜|缺少甜感/.test(brewLog.notes ?? '')

  if (bitterOrAstringent) {
    adjustments.push(adjustment('primary', 'extraction', 'decrease', '上一杯苦味或涩感强且满意度低，降低萃取压力'))
  } else if (sharpAcidity) {
    adjustments.push(adjustment('primary', 'extraction', 'increase', '上一杯酸质强且满意度低，小幅提高萃取'))
  } else if (weakSweetness) {
    adjustments.push(adjustment('primary', 'extraction', 'increase', '上一杯甜感弱且没有明显苦涩，小幅提高萃取'))
  }

  if (isLow(brewLog.body) || signals.increaseConcentration) {
    adjustments.push(adjustment('secondary', 'concentration', 'increase', '上一杯醇厚度低且满意度低，小幅提高浓度'))
  } else if (
    (isHigh(brewLog.body) && /厚重|闷|黏/.test(brewLog.notes ?? ''))
    || signals.decreaseConcentration
  ) {
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

type NoteSignals = {
  reduceExtraction: boolean
  increaseExtraction: boolean
  increaseConcentration: boolean
  decreaseConcentration: boolean
}

function noteSignals(notes: string | null, tasteGoals: string[]): NoteSignals {
  const text = notes?.trim() ?? ''
  const acceptsBrightness = tasteGoals.some((goal) => /明亮|酸质|果酸/.test(goal))
    || /酸得舒服|果酸.{0,6}(喜欢|舒服|明亮|平衡)|喜欢.{0,6}(果酸|酸质)/.test(text)
  const acceptsBody = /醇厚.{0,6}(喜欢|舒服|平衡)|喜欢.{0,6}醇厚/.test(text)

  return {
    reduceExtraction: /偏苦|苦涩|干涩|萃取过度|过萃/.test(text),
    increaseExtraction: !acceptsBrightness
      && /尖酸|酸得尖|酸涩|没萃开|萃取不足|欠萃/.test(text),
    increaseConcentration: /太淡|水感|寡淡|很薄|偏薄/.test(text),
    decreaseConcentration: !acceptsBody
      && /太厚|厚重|发闷|黏重|闷重/.test(text),
  }
}
