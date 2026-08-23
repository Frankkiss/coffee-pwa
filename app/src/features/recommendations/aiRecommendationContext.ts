import type { BrewMode, BrewVariant } from '../brews/brewTypes'
import type {
  RecommendationAllowedRanges,
  RuleRecommendationBaseSource,
  RuleRecommendationResult,
} from './recommendationTypes'

export type AiRecommendationContext = {
  version: 2
  targetBean: {
    id: string
    name: string
    roaster: string | null
    beanType: string
    origin: string | null
    farmOrStation: string | null
    process: string | null
    variety: string | null
    altitudeMeters: number | null
    roastDate: string | null
    roastLevel: string | null
    flavorTags: string[]
    flavorNotes: string | null
  }
  selection: {
    mode: BrewMode
    variant: BrewVariant | null
    brewer: string
    grinder: string
    espressoDoseGrams: number | null
  }
  rule: {
    recipe: RuleRecommendationResult['recommended']
    allowedRanges: RecommendationAllowedRanges
    confidence: RuleRecommendationResult['confidence']
    baseSource: RuleRecommendationBaseSource
    reasons: { bean: string[]; feedback: string[]; freshness: string[] }
  }
  references: Array<{
    id: string
    beanName: string | null
    rating: number | null
    sensory: Record<string, number | null>
    notes: string
    equipmentMatch: { brewer: boolean; grinder: boolean }
    recipe: RuleRecommendationResult['recommended']
  }>
  templates: {
    selected: RuleRecommendationResult['templateCandidates'][number] | null
    alternatives: RuleRecommendationResult['templateCandidates']
  }
  tasteGoals: string[]
}

export function buildAiRecommendationContext(
  result: RuleRecommendationResult,
): AiRecommendationContext {
  const recipe = result.recommended
  const selection = result.selection ?? {
    mode: recipe.brewMode ?? 'hot_pourover',
    variant: recipe.brewVariant ?? null,
    brewer: recipe.dripper ?? '',
    grinder: recipe.grinder ?? '',
    espressoDoseGrams: recipe.brewMode === 'espresso' ? recipe.coffeeGrams ?? null : null,
    tasteGoals: [],
  }
  const selectedId = result.baseSource.type === 'template' ? result.baseSource.templateId : null
  const selected = result.templateCandidates.find((item) => item.id === selectedId) ?? null

  return {
    version: 2,
    targetBean: {
      id: result.targetBean.id,
      name: result.targetBean.name,
      roaster: result.targetBean.roaster,
      beanType: result.targetBean.bean_type ?? 'single_origin',
      origin: result.targetBean.origin,
      farmOrStation: result.targetBean.farm_or_station,
      process: result.targetBean.process,
      variety: result.targetBean.variety,
      altitudeMeters: result.targetBean.altitude_meters,
      roastDate: result.targetBean.roast_date,
      roastLevel: result.targetBean.roast_level,
      flavorTags: result.targetBean.flavor_tags.slice(0, 12),
      flavorNotes: result.targetBean.flavor_notes,
    },
    selection: {
      mode: selection.mode,
      variant: selection.variant,
      brewer: selection.brewer,
      grinder: selection.grinder,
      espressoDoseGrams: selection.espressoDoseGrams,
    },
    rule: {
      recipe,
      allowedRanges: result.allowedRanges ?? fallbackRanges(recipe.coffeeGrams ?? 15),
      confidence: result.confidence,
      baseSource: result.baseSource,
      reasons: {
        bean: result.primary?.reasons.slice(0, 8) ?? [],
        feedback: result.feedbackAdjustments?.map((item) => item.reason) ?? [],
        freshness: result.freshnessAdjustment?.reason ? [result.freshnessAdjustment.reason] : [],
      },
    },
    references: result.references.slice(0, 3).map(({ bean, brewLog, recommended }) => ({
      id: brewLog.id,
      beanName: bean?.name ?? null,
      rating: brewLog.rating,
      sensory: {
        acidity: brewLog.acidity,
        sweetness: brewLog.sweetness,
        bitterness: brewLog.bitterness,
        astringency: brewLog.astringency,
        body: brewLog.body,
        aftertaste: brewLog.aftertaste,
      },
      notes: (brewLog.notes ?? '').slice(0, 240),
      equipmentMatch: {
        brewer: equalText(brewLog.dripper, selection.brewer),
        grinder: equalText(brewLog.grinder, selection.grinder),
      },
      recipe: recommended,
    })),
    templates: {
      selected,
      alternatives: result.templateCandidates.filter((item) => item.id !== selected?.id).slice(0, 2),
    },
    tasteGoals: selection.tasteGoals.slice(0, 8),
  }
}

function equalText(left: string | null, right: string) {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase())
}

function fallbackRanges(coffee: number): RecommendationAllowedRanges {
  return {
    ratioDenominator: { min: 14, max: 18 },
    waterTemperatureC: { min: 84, max: 96 },
    coffeeGrams: { min: coffee, max: coffee },
    waterGrams: { min: coffee * 14, max: coffee * 18 },
    iceGrams: null,
    beverageGrams: null,
    totalTimeSeconds: { min: 90, max: 300 },
  }
}
