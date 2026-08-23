import type { Bean } from '../beans/beanTypes'
import { normalizeBrewMode, normalizeBrewVariant } from '../brews/brewMode'
import type { BrewLog, BrewMode } from '../brews/brewTypes'
import type { BrewTemplate } from '../brewTemplates/brewTemplateTypes'
import { formatTemplateTime, summarizePourSteps } from '../brewTemplates/brewTemplateFilters'
import { countSharedRuleTokens, getBeanProcessFamilies, getRoastBand, getSharedBeanFlavorTags } from './beanMetadataRules'
import { deriveFeedbackAdjustments } from './feedbackAdjustments'
import { getFreshnessAdjustment } from './freshnessRules'
import type { RecommendationContext } from './recommendationContext'
import type {
  BrewRecommendationCandidate,
  BrewTemplateCandidate,
  RecommendedBrewParameters,
  RecommendationConfidence,
  RuleRecommendationResult,
} from './recommendationTypes'

export function generateMethodAwareRuleRecommendation(
  context: RecommendationContext,
  beans: Bean[],
  brewLogs: BrewLog[],
  templates: BrewTemplate[],
): RuleRecommendationResult | null {
  if (context.mode === 'espresso' && context.espressoDoseGrams === null) return null
  const beanById = new Map(beans.map((bean) => [bean.id, bean]))
  const matchingLogs = brewLogs.filter((log) => matchesMode(log, context))
  const basePool = selectRatingTier(matchingLogs.filter(hasUsableParameters))
  const candidates = basePool
    .map((log) => scoreHistory(context, beanById.get(log.bean_id ?? '') ?? null, log))
    .sort((left, right) => right.score - left.score || Date.parse(right.brewLog.brewed_at) - Date.parse(left.brewLog.brewed_at))
  const templateCandidates = selectMethodTemplates(context, templates)
  const primary = candidates[0] ?? null
  const baseTemplate = !primary && templateCandidates[0]
    ? templates.find((template) => template.id === templateCandidates[0].id) ?? null
    : null
  if (!primary && !baseTemplate) return null

  const base = primary
    ? primary.recommended
    : parametersFromTemplate(context, baseTemplate as BrewTemplate)
  const latestFeedback = matchingLogs
    .filter((log) => log.bean_id === context.targetBean.id && log.rating !== null)
    .toSorted((left, right) => Date.parse(right.brewed_at) - Date.parse(left.brewed_at))[0] ?? null
  const feedbackAdjustments = deriveFeedbackAdjustments(latestFeedback, context.tasteGoals)
  const freshnessAdjustment = getFreshnessAdjustment({
    roastDate: context.targetBean.roast_date,
    roastLevel: context.targetBean.roast_level,
    mode: context.mode,
    now: context.now,
  })
  const recommended = applyBoundedAdjustments(base, feedbackAdjustments, freshnessAdjustment.extractionDelta)
  recommended.bloomTimeDeltaSeconds = freshnessAdjustment.bloomTimeDeltaSeconds

  return {
    targetBean: context.targetBean,
    primary,
    references: candidates.slice(0, 3),
    templateCandidates,
    recommended,
    confidence: confidence(primary, freshnessAdjustment.confidencePenalty),
    baseSource: primary
      ? { type: 'history', label: primary.bean?.name ?? primary.brewLog.id, brewLogId: primary.brewLog.id }
      : { type: 'template', label: baseTemplate?.name ?? '', templateId: baseTemplate?.id ?? '' },
    beanAdjustmentReasons: [
      ...feedbackAdjustments.map((item) => item.reason),
      ...(freshnessAdjustment.reason ? [freshnessAdjustment.reason] : []),
    ],
    feedbackAdjustments,
    freshnessAdjustment,
  }
}

function matchesMode(log: BrewLog, context: RecommendationContext) {
  if (normalizeBrewMode(log) !== context.mode) return false
  if (context.mode !== 'cold_brew') return true
  return normalizeBrewVariant('cold_brew', log.brew_variant) === context.variant
}

function selectRatingTier(logs: BrewLog[]) {
  const strong = logs.filter((log) => log.rating !== null && log.rating >= 4)
  if (strong.length > 0) return strong
  const fallback = logs.filter((log) => log.rating === 3)
  if (fallback.length > 0) return fallback
  return logs.filter((log) => log.rating === null)
}

function scoreHistory(context: RecommendationContext, sourceBean: Bean | null, log: BrewLog): BrewRecommendationCandidate {
  let score = 0
  const reasons: string[] = []
  if (sourceBean?.id === context.targetBean.id) { score += 20; reasons.push('同豆、同方式') }
  if (sameText(log.dripper, context.gear.brewer)) { score += 6; reasons.push('器具相同') }
  if (sameText(log.grinder, context.gear.grinder)) { score += 6; reasons.push('磨豆机相同') }
  if (sourceBean?.process === context.targetBean.process && sourceBean?.process) { score += 4; reasons.push('处理法相同') }
  else if (sharedProcessFamily(context.targetBean, sourceBean)) { score += 3; reasons.push('处理法家族相近') }
  if (sourceBean?.origin === context.targetBean.origin && sourceBean?.origin) { score += 3; reasons.push('产地相同') }
  if (sourceBean?.farm_or_station === context.targetBean.farm_or_station && sourceBean?.farm_or_station) { score += 6; reasons.push('庄园或处理站相同') }
  if (sourceBean?.variety === context.targetBean.variety && sourceBean?.variety) { score += 2; reasons.push('品种相同') }
  else score += Math.min(countSharedRuleTokens(context.targetBean.variety, sourceBean?.variety), 2)
  if (getRoastBand(sourceBean?.roast_level) === getRoastBand(context.targetBean.roast_level)) { score += 2; reasons.push('烘焙区间相近') }
  const sharedFlavors = getSharedBeanFlavorTags(context.targetBean, sourceBean)
  if (sharedFlavors.length) { score += Math.min(sharedFlavors.length * 2, 6); reasons.push(`共享风味：${sharedFlavors.join('、')}`) }
  if (log.rating !== null) { score += log.rating * 2; reasons.push(`满意度 ${log.rating}/5`) }
  return { bean: sourceBean, brewLog: log, score, reasons, recommended: parametersFromHistory(context, log) }
}

function parametersFromHistory(context: RecommendationContext, log: BrewLog): RecommendedBrewParameters {
  const grinderCompatible = !context.gear.grinder || sameText(log.grinder, context.gear.grinder)
  return modeParameters(context, {
    method: methodLabel(context.mode),
    dripper: context.gear.brewer || log.dripper,
    grinder: context.gear.grinder || log.grinder,
    grindSetting: grinderCompatible ? log.grind_setting : null,
    ratio: log.ratio,
    waterTemperatureC: log.water_temperature_c,
    totalTimeSeconds: log.total_time_seconds,
    coffeeGrams: log.coffee_grams,
    waterGrams: log.water_grams,
    iceGrams: log.ice_grams ?? null,
    beverageGrams: log.beverage_grams ?? null,
  })
}

function parametersFromTemplate(context: RecommendationContext, template: BrewTemplate): RecommendedBrewParameters {
  return modeParameters(context, {
    method: methodLabel(context.mode),
    dripper: context.gear.brewer || template.brewer,
    grinder: context.gear.grinder || null,
    grindSetting: template.grindSize,
    ratio: template.ratio,
    waterTemperatureC: midpoint(template.waterTemperatureC.min, template.waterTemperatureC.max),
    totalTimeSeconds: midpoint(template.targetTimeSeconds.min, template.targetTimeSeconds.max),
    coffeeGrams: template.doseGrams,
    waterGrams: template.waterGrams,
    iceGrams: null,
    beverageGrams: null,
  })
}

function modeParameters(context: RecommendationContext, base: RecommendedBrewParameters): RecommendedBrewParameters {
  const ratioRange = context.mode === 'cold_brew'
    ? (context.variant === 'concentrate' ? [7, 10] : [12, 16])
    : context.mode === 'espresso' ? [1.5, 3] : [14, 18]
  const safe = {
    ...base,
    ratio: clampRatio(base.ratio, ratioRange[0], ratioRange[1]),
    waterTemperatureC: base.waterTemperatureC === null ? null : clamp(base.waterTemperatureC, context.mode === 'hot_pourover' ? 84 : 85, 96),
    totalTimeSeconds: base.totalTimeSeconds === null ? null : clamp(base.totalTimeSeconds, context.mode === 'espresso' ? 20 : 90, context.mode === 'espresso' ? 40 : context.mode === 'cold_brew' ? 64_800 : 300),
  }
  const coffee = context.mode === 'espresso' ? context.espressoDoseGrams : safe.coffeeGrams
  if (context.mode === 'iced_pourover') {
    const total = ratioDenominator(safe.ratio) * (coffee ?? 15)
    const requestedIce = safe.iceGrams ?? Math.round(total * 0.35)
    const ice = clamp(requestedIce, Math.round(total * 0.25), Math.round(total * 0.45))
    return { ...safe, brewMode: context.mode, brewVariant: null, coffeeGrams: coffee, iceGrams: ice, waterGrams: total - ice, beverageGrams: null }
  }
  if (context.mode === 'cold_brew') {
    const dose = coffee ?? 50
    return { ...safe, brewMode: context.mode, brewVariant: context.variant, coffeeGrams: dose, waterGrams: Math.round(dose * ratioDenominator(safe.ratio)), iceGrams: null, beverageGrams: null, waterTemperatureC: 6 }
  }
  if (context.mode === 'espresso') {
    const dose = coffee as number
    return { ...safe, brewMode: context.mode, brewVariant: null, coffeeGrams: dose, waterGrams: null, iceGrams: null, beverageGrams: Math.round(dose * ratioDenominator(safe.ratio)) }
  }
  return { ...safe, brewMode: context.mode, brewVariant: null, coffeeGrams: coffee, iceGrams: null, beverageGrams: null }
}

function selectMethodTemplates(context: RecommendationContext, templates: BrewTemplate[]): BrewTemplateCandidate[] {
  return templates.filter((template) => templateMatchesMode(template, context.mode))
    .filter((template) => context.mode !== 'cold_brew'
      || (context.variant === 'concentrate'
        ? template.id.includes('concentrate')
        : !template.id.includes('concentrate')))
    .map((template) => ({
      id: template.id, name: template.name, brewer: template.brewer, ratio: template.ratio,
      waterTemperature: `${template.waterTemperatureC.min}-${template.waterTemperatureC.max}°C`,
      targetTime: `${formatTemplateTime(template.targetTimeSeconds.min)}-${formatTemplateTime(template.targetTimeSeconds.max)}`,
      pourSummary: summarizePourSteps(template), isChampionReference: template.isChampionReference,
      score: template.difficulty === 'easy' ? 2 : 1,
      reasons: [`${methodLabel(context.mode)}模板`],
    }))
    .sort((left, right) => Number(left.isChampionReference) - Number(right.isChampionReference) || right.score - left.score)
    .slice(0, 3)
}

function templateMatchesMode(template: BrewTemplate, mode: BrewMode) {
  if (mode === 'iced_pourover') return template.id.startsWith('iced-pourover-')
  if (mode === 'espresso') return template.id.startsWith('espresso-')
  if (mode === 'cold_brew') return template.category === 'cold-brew'
  return !template.id.startsWith('iced-pourover-') && !template.id.startsWith('espresso-')
    && ['daily-pourover', 'immersion-hybrid', 'bean-specific', 'champion-reference'].includes(template.category)
}

function applyBoundedAdjustments(base: RecommendedBrewParameters, feedback: ReturnType<typeof deriveFeedbackAdjustments>, freshnessDelta: -1 | 0 | 1) {
  const result = { ...base }
  const extraction = feedback.find((item) => item.target === 'extraction')
  const extractionDelta = extraction ? (extraction.direction === 'increase' ? 1 : -1) : freshnessDelta
  if (result.waterTemperatureC !== null && extractionDelta) result.waterTemperatureC = clamp(result.waterTemperatureC + extractionDelta, 84, 96)
  const concentration = feedback.find((item) => item.target === 'concentration')
  if (concentration && result.ratio) result.ratio = adjustRatio(result.ratio, concentration.direction === 'increase' ? -0.5 : 0.5)
  return result
}

function confidence(primary: BrewRecommendationCandidate | null, penalty: boolean): RecommendationConfidence {
  let value: RecommendationConfidence = !primary || primary.brewLog.rating === null || primary.brewLog.rating === 3 ? 'low' : primary.reasons.includes('同豆、同方式') ? 'high' : 'medium'
  if (penalty) value = value === 'high' ? 'medium' : 'low'
  return value
}

function hasUsableParameters(log: BrewLog) { return Boolean(log.ratio || log.grind_setting || log.water_temperature_c || log.total_time_seconds || log.beverage_grams || log.ice_grams) }
function sameText(left: string | null | undefined, right: string | null | undefined) { return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase()) }
function sharedProcessFamily(target: Bean, source: Bean | null) { const targetFamilies = new Set(getBeanProcessFamilies(target)); return source ? getBeanProcessFamilies(source).some((family) => targetFamilies.has(family)) : false }
function midpoint(min: number, max: number) { return Math.round((min + max) / 2) }
function ratioDenominator(ratio: string | null) { const value = ratio?.match(/1\s*:\s*(\d+(?:\.\d+)?)/)?.[1]; return value ? Number(value) : 15 }
function adjustRatio(ratio: string, delta: number) { return `1:${Math.round((ratioDenominator(ratio) + delta) * 10) / 10}` }
function clamp(value: number, min: number, max: number) { return Math.min(Math.max(value, min), max) }
function methodLabel(mode: BrewMode) { return ({ hot_pourover: '热手冲', iced_pourover: '冰手冲', cold_brew: '冷萃', espresso: '意式' } as const)[mode] }
function clampRatio(ratio: string | null, min: number, max: number) {
  const denominator = clamp(ratioDenominator(ratio), min, max)
  return `1:${Math.round(denominator * 10) / 10}`
}
