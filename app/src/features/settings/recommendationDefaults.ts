import type { JsonObject } from '../../lib/jsonTypes'

export type RecommendationGear = {
  brewer: string
  grinder: string
}

export type RecommendationDefaults = {
  hotPourover: RecommendationGear
  icedPourover: RecommendationGear
  coldBrew: RecommendationGear
  espresso: RecommendationGear & { doseGrams: number | null }
  tasteGoals: string[]
}

const emptyGear = (): RecommendationGear => ({ brewer: '', grinder: '' })

export function readRecommendationDefaults(
  defaultGear: JsonObject,
  tastePreferences: JsonObject,
): RecommendationDefaults {
  const recommendation = asObject(defaultGear.recommendation)
  return {
    hotPourover: readGear(recommendation.hotPourover),
    icedPourover: readGear(recommendation.icedPourover),
    coldBrew: readGear(recommendation.coldBrew),
    espresso: {
      ...readGear(recommendation.espresso),
      doseGrams: readDose(recommendation.espresso),
    },
    tasteGoals: readStringArray(tastePreferences.goals),
  }
}

export function writeRecommendationDefaults(
  defaultGear: JsonObject,
  tastePreferences: JsonObject,
  defaults: RecommendationDefaults,
) {
  return {
    defaultGear: {
      ...defaultGear,
      recommendation: {
        hotPourover: { ...defaults.hotPourover },
        icedPourover: { ...defaults.icedPourover },
        coldBrew: { ...defaults.coldBrew },
        espresso: { ...defaults.espresso },
      },
    } satisfies JsonObject,
    tastePreferences: {
      ...tastePreferences,
      goals: [...defaults.tasteGoals],
    } satisfies JsonObject,
  }
}

function readGear(value: unknown): RecommendationGear {
  const gear = asObject(value)
  return {
    brewer: typeof gear.brewer === 'string' ? gear.brewer : '',
    grinder: typeof gear.grinder === 'string' ? gear.grinder : '',
  }
}

function readDose(value: unknown) {
  const dose = asObject(value).doseGrams
  return typeof dose === 'number' && Number.isFinite(dose) && dose > 0
    ? dose
    : null
}

function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : {}
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export function createEmptyRecommendationDefaults(): RecommendationDefaults {
  return {
    hotPourover: emptyGear(),
    icedPourover: emptyGear(),
    coldBrew: emptyGear(),
    espresso: { ...emptyGear(), doseGrams: null },
    tasteGoals: [],
  }
}
