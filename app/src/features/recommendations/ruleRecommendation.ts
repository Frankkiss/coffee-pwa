import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import type {
  BrewRecommendationCandidate,
  RecommendedBrewParameters,
  RuleRecommendationResult,
} from './recommendationTypes'

export function generateRuleRecommendation(
  targetBean: Bean,
  beans: Bean[],
  brewLogs: BrewLog[],
): RuleRecommendationResult | null {
  const beanById = new Map(beans.map((bean) => [bean.id, bean]))
  const candidates = brewLogs
    .filter(hasUsableBrewParameters)
    .map((brewLog) =>
      scoreBrewLog(targetBean, beanById.get(brewLog.bean_id ?? '') ?? null, brewLog),
    )
    .sort((a, b) => b.score - a.score)

  if (candidates.length === 0) {
    return null
  }

  return {
    targetBean,
    primary: candidates[0],
    references: candidates.slice(0, 3),
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
  }

  if (sourceBean?.origin && sourceBean.origin === targetBean.origin) {
    score += 3
    reasons.push('产地相同')
  }

  if (sourceBean?.variety && sourceBean.variety === targetBean.variety) {
    score += 2
    reasons.push('品种相同')
  }

  if (sourceBean?.roast_level && sourceBean.roast_level === targetBean.roast_level) {
    score += 3
    reasons.push('烘焙度相近')
  }

  const sharedFlavorTags = getSharedFlavorTags(targetBean, sourceBean)

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

function getSharedFlavorTags(targetBean: Bean, sourceBean: Bean | null) {
  if (!sourceBean) {
    return []
  }

  const targetTags = new Set(targetBean.flavor_tags)

  return sourceBean.flavor_tags.filter((tag) => targetTags.has(tag))
}
