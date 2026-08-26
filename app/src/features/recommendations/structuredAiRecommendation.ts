import type {
  AiRecommendationResponse,
  StructuredAiBrewStep,
  StructuredAiRecipe,
  StructuredAiRecommendation,
} from './recommendationTypes'
import type { AiRecommendationContext } from './aiRecommendationContext'
import { validateAiBrewSteps } from './aiBrewStepValidation'
import { validateAiRecipe } from './aiRecipeValidation'

const emptyRecipe: StructuredAiRecipe = {
  method: null,
  dripper: null,
  grindSetting: null,
  waterTemperatureC: null,
  coffeeGrams: null,
  waterGrams: null,
  ratio: null,
  totalTimeSeconds: null,
}

export function normalizeAiRecommendationResponse(
  input: unknown,
  context?: AiRecommendationContext,
): AiRecommendationResponse {
  const record = isRecord(input) ? input : {}
  const configured = record.configured === true
  const suggestion = stringValue(record.suggestion)
  let error = stringValue(record.error) || undefined
  let structured = normalizeStructuredRecommendation(record.structured, suggestion)
  if (structured && context && (
    !validateAiRecipe(structured.recipe, context)
    || !validateAiBrewSteps(structured.pourPlan, structured.recipe, context)
  )) {
    structured = null
    error = 'AI_BOUNDARY_VIOLATION'
  }

  return {
    configured,
    suggestion,
    structured,
    ...(error ? { error } : {}),
  }
}

export function normalizeStructuredRecommendation(
  value: unknown,
  fallbackText = '',
): StructuredAiRecommendation | null {
  if (!isRecord(value)) {
    if (!fallbackText) {
      return null
    }

    return {
      summary: fallbackText,
      recipe: { ...emptyRecipe },
      pourPlan: [],
      adjustments: [],
      reasons: [],
      riskNotes: [],
      rawText: fallbackText,
    }
  }

  const recipe = isRecord(value.recipe) ? value.recipe : {}
  const rawText = stringValue(value.rawText) || fallbackText

  return {
    summary: stringValue(value.summary),
    recipe: {
      method: stringOrNull(recipe.method),
      brewMode: brewModeOrNull(recipe.brewMode),
      brewVariant: brewVariantOrNull(recipe.brewVariant),
      dripper: stringOrNull(recipe.dripper),
      grinder: stringOrNull(recipe.grinder),
      grindSetting: stringOrNull(recipe.grindSetting),
      waterTemperatureC: numberOrNull(recipe.waterTemperatureC),
      coffeeGrams: numberOrNull(recipe.coffeeGrams),
      waterGrams: numberOrNull(recipe.waterGrams),
      iceGrams: numberOrNull(recipe.iceGrams),
      beverageGrams: numberOrNull(recipe.beverageGrams),
      ratio: stringOrNull(recipe.ratio),
      totalTimeSeconds: numberOrNull(recipe.totalTimeSeconds),
    },
    pourPlan: normalizePourPlan(value.pourPlan),
    adjustments: stringArray(value.adjustments),
    reasons: stringArray(value.reasons),
    riskNotes: stringArray(value.riskNotes),
    rawText,
  }
}

function normalizePourPlan(value: unknown): StructuredAiBrewStep[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item, index) => {
      if (!isRecord(item)) {
        return null
      }

      const action = stringValue(item.action)

      if (!action) {
        return null
      }

      const startSeconds = nonNegativeNumberOrNull(item.startSeconds)
      const endSeconds = nonNegativeNumberOrNull(item.endSeconds)
      const legacyWaterGrams = numberOrNull(item.waterGrams)
      const targetType = stepTargetOrNull(item.targetType)
        ?? (legacyWaterGrams !== null ? 'water' : 'none')
      const targetGrams = numberOrNull(item.targetGrams) ?? legacyWaterGrams

      return {
        label: stringValue(item.label) || `第 ${index + 1} 段`,
        time: startSeconds !== null
          ? formatStepTime(startSeconds, endSeconds)
          : stringValue(item.time),
        startSeconds,
        endSeconds,
        targetType,
        targetGrams: targetType === 'none' ? null : targetGrams,
        action,
      }
    })
    .filter((item): item is StructuredAiBrewStep => item !== null)
}

function nonNegativeNumberOrNull(value: unknown) {
  const parsed = numberOrNull(value)
  return parsed !== null && parsed >= 0 ? parsed : null
}

function stepTargetOrNull(value: unknown) {
  return value === 'water' || value === 'ice' || value === 'beverage' || value === 'none'
    ? value
    : null
}

function formatStepTime(startSeconds: number, endSeconds: number | null) {
  const format = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  return endSeconds === null ? format(startSeconds) : `${format(startSeconds)}-${format(endSeconds)}`
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(
    new Set(value.map((item) => stringValue(item)).filter(Boolean)),
  )
}

function stringOrNull(value: unknown) {
  return stringValue(value) || null
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function numberOrNull(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function brewModeOrNull(value: unknown) {
  return value === 'hot_pourover' || value === 'iced_pourover'
      || value === 'cold_brew' || value === 'espresso'
    ? value
    : null
}

function brewVariantOrNull(value: unknown) {
  return value === 'ready_to_drink' || value === 'concentrate' ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
