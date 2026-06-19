import type { Bean } from '../beans/beanTypes'
import { splitMultiValueText } from '../beans/blendComponents'
import type { BrewLog } from '../brews/brewTypes'
import { brewTemplates } from '../brewTemplates/brewTemplates'
import type { BrewTemplate } from '../brewTemplates/brewTemplateTypes'
import {
  countSharedRuleTokens,
  getAltitudeBand,
  getBeanProcessFamilies,
  getRoastBand,
  getSharedBeanFlavorTags,
  isExtractiveStyleBean,
} from './beanMetadataRules'
import type {
  BrewRecommendationCandidate,
  BrewTemplateCandidate,
  RecommendedBrewParameters,
  RecommendationConfidence,
  RuleRecommendationBaseSource,
  RuleRecommendationResult,
} from './recommendationTypes'
import { selectTemplateCandidates } from './templateRecommendation'

export function generateRuleRecommendation(
  targetBean: Bean,
  beans: Bean[],
  brewLogs: BrewLog[],
  templates?: BrewTemplate[],
): RuleRecommendationResult | null {
  const availableTemplates = templates ?? brewTemplates
  const beanById = new Map(beans.map((bean) => [bean.id, bean]))
  const templateCandidates = selectTemplateCandidates(targetBean, availableTemplates)
  const candidates = brewLogs
    .filter(hasUsableBrewParameters)
    .map((brewLog) =>
      scoreBrewLog(targetBean, beanById.get(brewLog.bean_id ?? '') ?? null, brewLog),
    )
    .sort((a, b) => b.score - a.score)

  if (candidates.length === 0) {
    if (brewLogs.length > 0 || templateCandidates.length === 0) {
      return null
    }

    const template = findTemplateById(availableTemplates, templateCandidates[0].id)
    const recommended = applyBeanAwareAdjustments(
      targetBean,
      templateToRecommendedParameters(template, templateCandidates[0]),
    )

    return {
      targetBean,
      primary: null,
      references: [],
      templateCandidates,
      recommended: recommended.parameters,
      confidence: 'low',
      baseSource: {
        type: 'template',
        label: templateCandidates[0].name,
        templateId: templateCandidates[0].id,
      },
      beanAdjustmentReasons: recommended.reasons,
    }
  }

  const primary = candidates[0]
  const adjusted = applyBeanAwareAdjustments(targetBean, primary.recommended)

  return {
    targetBean,
    primary,
    references: candidates.slice(0, 3),
    templateCandidates,
    recommended: adjusted.parameters,
    confidence: getRecommendationConfidence(primary),
    baseSource: getHistoryBaseSource(primary),
    beanAdjustmentReasons: adjusted.reasons,
  }
}

function scoreBrewLog(
  targetBean: Bean,
  sourceBean: Bean | null,
  brewLog: BrewLog,
): BrewRecommendationCandidate {
  let score = 0
  const reasons: string[] = []

  if (sourceBean?.id === targetBean.id) {
    score += 10
    reasons.push('同一支豆子的历史记录')
  }

  if (sourceBean?.process && sourceBean.process === targetBean.process) {
    score += 4
    reasons.push('处理法相同')
  } else if (hasSharedProcessFamily(targetBean, sourceBean)) {
    score += 3
    reasons.push('process family match')
  }

  if (sourceBean?.origin && sourceBean.origin === targetBean.origin) {
    score += 3
    reasons.push('产地相同')
  }

  if (sourceBean?.farm_or_station && sourceBean.farm_or_station === targetBean.farm_or_station) {
    score += 6
    reasons.push('station match')
  }

  if (sourceBean?.variety && sourceBean.variety === targetBean.variety) {
    score += 2
    reasons.push('品种相同')
  }

  const sharedVarietyTokenCount = countSharedRuleTokens(targetBean.variety, sourceBean?.variety)
  if (sharedVarietyTokenCount > 0 && sourceBean?.variety !== targetBean.variety) {
    score += Math.min(sharedVarietyTokenCount, 3)
    reasons.push('variety token match')
  }

  const sharedAltitudeScore = scoreSharedAltitudeBand(targetBean, sourceBean)
  if (sharedAltitudeScore > 0) {
    score += sharedAltitudeScore
    reasons.push(sharedAltitudeScore >= 6 ? 'altitude band match' : 'near altitude band')
  }

  const sharedBlendTextScore = scoreSharedBlendTextFields(targetBean, sourceBean)
  if (sharedBlendTextScore > 0) {
    score += sharedBlendTextScore
    reasons.push('拼配文字信息相近')
  }

  const sharedBlendComponentScore = scoreSharedBlendComponents(targetBean, sourceBean)
  if (sharedBlendComponentScore > 0) {
    score += sharedBlendComponentScore
    reasons.push('拼配组成相近')
  }

  if (sourceBean?.roast_level && sourceBean.roast_level === targetBean.roast_level) {
    score += 3
    reasons.push('烘焙度相近')
  } else if (getRoastBand(sourceBean?.roast_level) && getRoastBand(sourceBean?.roast_level) === getRoastBand(targetBean.roast_level)) {
    score += 2
    reasons.push('roast band match')
  }

  const sharedFlavorTags = getSharedBeanFlavorTags(targetBean, sourceBean)

  if (sharedFlavorTags.length > 0) {
    score += Math.min(sharedFlavorTags.length * 2, 6)
    reasons.push(`共享风味标签：${sharedFlavorTags.join('、')}`)
  }

  if (brewLog.is_pinned_recipe) {
    score += 5
    reasons.push('已钉为候选方案')
  }

  if (brewLog.rating) {
    score += brewLog.rating * 2
    reasons.push(`历史评分 ${brewLog.rating}/5`)

    if (brewLog.rating < 3) {
      score -= 4
      reasons.push('low rating penalty')
    }
  }

  if (reasons.length === 0) {
    reasons.push('可用历史冲煮参数')
  }

  return {
    bean: sourceBean,
    brewLog,
    score,
    reasons,
    recommended: toRecommendedParameters(brewLog),
  }
}

function hasUsableBrewParameters(brewLog: BrewLog) {
  return Boolean(
    brewLog.ratio ||
      brewLog.water_temperature_c ||
      brewLog.grind_setting ||
      brewLog.total_time_seconds ||
      brewLog.dripper ||
      brewLog.method,
  )
}

function toRecommendedParameters(
  brewLog: BrewLog,
): RecommendedBrewParameters {
  return {
    method: brewLog.method,
    dripper: brewLog.dripper,
    grindSetting: brewLog.grind_setting,
    ratio: brewLog.ratio,
    waterTemperatureC: brewLog.water_temperature_c,
    totalTimeSeconds: brewLog.total_time_seconds,
  }
}

function templateToRecommendedParameters(
  template: BrewTemplate | null,
  candidate: BrewTemplateCandidate,
): RecommendedBrewParameters {
  return {
    method: template?.category === 'cold-brew' ? 'Cold brew' : 'Pourover',
    dripper: candidate.brewer,
    grindSetting: template?.grindSize ?? null,
    ratio: candidate.ratio,
    waterTemperatureC: template
      ? Math.round((template.waterTemperatureC.min + template.waterTemperatureC.max) / 2)
      : parseFirstNumber(candidate.waterTemperature),
    totalTimeSeconds: template
      ? Math.round((template.targetTimeSeconds.min + template.targetTimeSeconds.max) / 2)
      : parseFirstNumber(candidate.targetTime),
  }
}

function applyBeanAwareAdjustments(targetBean: Bean, base: RecommendedBrewParameters) {
  const parameters = { ...base }
  const reasons: string[] = []
  let temperatureDelta = 0
  let timeDelta = 0
  const processFamilies = getBeanProcessFamilies(targetBean)
  const roastBand = getRoastBand(targetBean.roast_level)

  if (isExtractiveStyleBean(targetBean)) {
    temperatureDelta += 1
    timeDelta += 10
    reasons.push('high-altitude light roast: nudge extraction upward with slightly hotter water and longer contact')
  }

  if (processFamilies.includes('anaerobic')) {
    temperatureDelta -= 2
    timeDelta -= 5
    reasons.push('anaerobic process: keep water cooler and agitation gentler to avoid ferment harshness')
  } else if (processFamilies.includes('natural') || processFamilies.includes('honey')) {
    temperatureDelta -= 1
    reasons.push('natural or honey process: slightly cooler, lower-agitation brew protects fruit sweetness')
  }

  if (roastBand === 'dark') {
    temperatureDelta -= 3
    timeDelta -= 10
    reasons.push('dark roast: lower extraction pressure to reduce bitterness')
  }

  if (parameters.waterTemperatureC !== null && temperatureDelta !== 0) {
    parameters.waterTemperatureC = clampNumber(parameters.waterTemperatureC + temperatureDelta, 86, 96)
  }

  if (parameters.totalTimeSeconds !== null && timeDelta !== 0) {
    parameters.totalTimeSeconds = clampNumber(parameters.totalTimeSeconds + timeDelta, 90, 240)
  }

  if (reasons.length === 0) {
    reasons.push('bean metadata supports keeping the base recipe unchanged for the first brew')
  }

  return { parameters, reasons }
}

function hasSharedProcessFamily(targetBean: Bean, sourceBean: Bean | null) {
  if (!sourceBean) {
    return false
  }

  const targetFamilies = new Set(getBeanProcessFamilies(targetBean))
  const sourceFamilies = getBeanProcessFamilies(sourceBean)

  return sourceFamilies.some((family) => targetFamilies.has(family))
}

function scoreSharedAltitudeBand(targetBean: Bean, sourceBean: Bean | null) {
  if (!sourceBean) {
    return 0
  }

  const targetBand = getAltitudeBand(targetBean.altitude_meters)
  const sourceBand = getAltitudeBand(sourceBean.altitude_meters)

  if (!targetBand || !sourceBand) {
    return 0
  }

  if (targetBand === sourceBand) {
    return 6
  }

  return Math.abs(altitudeBandRank(targetBand) - altitudeBandRank(sourceBand)) === 1 ? 3 : 0
}

function altitudeBandRank(value: NonNullable<ReturnType<typeof getAltitudeBand>>) {
  return ['low', 'medium', 'high', 'very_high'].indexOf(value)
}

function findTemplateById(templates: BrewTemplate[], id: string) {
  return templates.find((template) => template.id === id) ?? null
}

function getHistoryBaseSource(candidate: BrewRecommendationCandidate): RuleRecommendationBaseSource {
  return {
    type: 'history',
    label: candidate.bean?.name ?? candidate.brewLog.id,
    brewLogId: candidate.brewLog.id,
  }
}

function getRecommendationConfidence(candidate: BrewRecommendationCandidate): RecommendationConfidence {
  if (candidate.reasons.includes('同一支豆子的历史记录') || candidate.score >= 28) {
    return 'high'
  }

  if (candidate.score >= 16) {
    return 'medium'
  }

  return 'low'
}

function scoreSharedBlendComponents(targetBean: Bean, sourceBean: Bean | null) {
  if (!sourceBean || targetBean.bean_type !== 'blend' || sourceBean.bean_type !== 'blend') {
    return 0
  }

  let score = 0

  for (const targetComponent of targetBean.blend_components ?? []) {
    for (const sourceComponent of sourceBean.blend_components ?? []) {
      if (targetComponent.origin && targetComponent.origin === sourceComponent.origin) {
        score += 3
      }

      if (targetComponent.process && targetComponent.process === sourceComponent.process) {
        score += 2
      }

      if (targetComponent.variety && targetComponent.variety === sourceComponent.variety) {
        score += 1
      }
    }
  }

  return Math.min(score, 8)
}

function scoreSharedBlendTextFields(targetBean: Bean, sourceBean: Bean | null) {
  if (!sourceBean || targetBean.bean_type !== 'blend' || sourceBean.bean_type !== 'blend') {
    return 0
  }

  const sharedOrigins = countSharedValues(targetBean.origin, sourceBean.origin)
  const sharedProcesses = countSharedValues(targetBean.process, sourceBean.process)
  const sharedVarieties = countSharedValues(targetBean.variety, sourceBean.variety)

  return Math.min(sharedOrigins * 3 + sharedProcesses * 2 + sharedVarieties, 6)
}

function countSharedValues(left: string | null | undefined, right: string | null | undefined) {
  const rightValues = new Set(splitMultiValueText(right))

  return splitMultiValueText(left).filter((value) => rightValues.has(value)).length
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function parseFirstNumber(value: string) {
  const match = value.match(/\d+/)

  return match ? Number(match[0]) : null
}