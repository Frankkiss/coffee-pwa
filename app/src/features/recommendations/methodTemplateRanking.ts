import type { BrewTemplate } from '../brewTemplates/brewTemplateTypes'
import { getTemplateModeMetadata } from '../brewTemplates/brewTemplateMode'
import { getProcessFamily, getRoastBand, normalizeRuleText } from './beanMetadataRules'
import type { RecommendationContext } from './recommendationContext'

export type RankedMethodTemplate = {
  template: BrewTemplate
  score: number
  reasons: string[]
}

export function rankMethodTemplates(
  context: RecommendationContext,
  templates: BrewTemplate[],
): RankedMethodTemplate[] {
  const matchingMode = templates.filter((template) => {
    const metadata = getTemplateModeMetadata(template)
    if (metadata.brewMode !== context.mode) return false
    return context.mode !== 'cold_brew' || metadata.brewVariant === context.variant
  })
  const hasCompatibleEquipment = Boolean(context.gear.brewer) && matchingMode.some((template) =>
    isBrewerCompatible(context.gear.brewer, template.brewer),
  )

  return matchingMode
    .map((template) => scoreTemplate(context, template, hasCompatibleEquipment))
    .sort((left, right) =>
      right.score - left.score
      || Number(left.template.isChampionReference) - Number(right.template.isChampionReference),
    )
}

function scoreTemplate(
  context: RecommendationContext,
  template: BrewTemplate,
  hasCompatibleEquipment: boolean,
): RankedMethodTemplate {
  let score = template.difficulty === 'easy' ? 2 : template.difficulty === 'medium' ? 1 : 0
  const reasons: string[] = []
  const equipmentCompatible = isBrewerCompatible(context.gear.brewer, template.brewer)

  if (equipmentCompatible) {
    score += 30
    reasons.push('器具匹配')
  } else if (hasCompatibleEquipment && isSpecializedBrewer(template.brewer)) {
    score -= 30
  }

  const roastBand = getRoastBand(context.targetBean.roast_level)
  const suitableRoasts = template.suitableFor.map(getRoastBand).filter(Boolean)
  const avoidedRoasts = template.avoidFor.map(getRoastBand).filter(Boolean)
  if (roastBand && suitableRoasts.includes(roastBand)) {
    score += 12
    reasons.push('烘焙度匹配')
  }
  if (roastBand && avoidedRoasts.includes(roastBand)) score -= 14

  const processFamily = getProcessFamily(context.targetBean.process)
  if (processFamily && template.suitableFor.some((value) => getProcessFamily(value) === processFamily)) {
    score += 6
    reasons.push('处理法匹配')
  }

  const beanFlavors = context.targetBean.flavor_tags.map(normalizeRuleText).filter(Boolean)
  const flavorMatches = template.suitableFor.filter((value) => {
    const normalized = normalizeRuleText(value)
    return beanFlavors.some((flavor) => flavor === normalized || flavor.includes(normalized) || normalized.includes(flavor))
  })
  if (flavorMatches.length > 0) {
    score += Math.min(flavorMatches.length * 4, 8)
    reasons.push('风味匹配')
  }

  return { template, score, reasons: reasons.length > 0 ? reasons : ['方式匹配'] }
}

function isBrewerCompatible(selected: string, templateBrewer: string) {
  const selectedText = normalizeEquipment(selected)
  const templateText = normalizeEquipment(templateBrewer)
  if (!selectedText || !templateText) return false
  if (selectedText === templateText || selectedText.includes(templateText) || templateText.includes(selectedText)) return true
  if (selectedText.includes('v60') && (templateText.includes('v60') || templateText.includes('锥形'))) return true
  if (selectedText.includes('orea') && templateText.includes('orea')) return true
  if (selectedText.includes('冷萃') && templateText.includes('冷萃')) return true
  if (selectedText.includes('意式') && templateText.includes('意式')) return true
  return false
}

function isSpecializedBrewer(value: string) {
  const normalized = normalizeEquipment(value)
  return !['锥形滤杯', '平底滤杯', '冷萃壶', '意式咖啡机'].includes(normalized)
}

function normalizeEquipment(value: string) {
  return normalizeRuleText(value).replace(/[^\p{L}\p{N}]+/gu, '')
}
