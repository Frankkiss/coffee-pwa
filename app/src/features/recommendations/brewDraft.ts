import { createInitialBrewForm } from '../brews/brewForm'
import type { BrewForm } from '../brews/brewTypes'
import type { AiRecommendationResponse, RuleRecommendationResult } from './recommendationTypes'

export function toBrewDraft(
  rule: RuleRecommendationResult,
  ai: AiRecommendationResponse | null,
): BrewForm {
  const source = ai?.structured?.recipe ?? rule.recommended
  const form = createInitialBrewForm(rule.targetBean.id)
  const mode = source.brewMode ?? rule.selection?.mode ?? ''
  const variant = source.brewVariant ?? rule.selection?.variant ?? ''
  const aiNotes = ai?.structured
    ? [ai.structured.summary, ...ai.structured.adjustments].filter(Boolean).join('\n')
    : ''

  return {
    ...form,
    method: source.method ?? '',
    brewMode: mode,
    brewVariant: variant ?? '',
    dripper: source.dripper ?? rule.selection?.brewer ?? '',
    grinder: source.grinder ?? rule.selection?.grinder ?? '',
    grindSetting: source.grindSetting ?? '',
    coffeeGrams: numberValue(source.coffeeGrams),
    waterGrams: mode === 'espresso' ? '' : numberValue(source.waterGrams),
    iceGrams: mode === 'iced_pourover' ? numberValue(source.iceGrams) : '',
    beverageGrams: mode === 'espresso' ? numberValue(source.beverageGrams) : '',
    waterTemperatureC: numberValue(source.waterTemperatureC),
    totalTimeSeconds: numberValue(source.totalTimeSeconds),
    notes: aiNotes,
  }
}

function numberValue(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}
