import type { Bean } from '../beans/beanTypes'
import {
  formatTemplateTime,
  summarizePourSteps,
} from '../brewTemplates/brewTemplateFilters'
import { brewTemplates } from '../brewTemplates/brewTemplates'
import type { BrewTemplate } from '../brewTemplates/brewTemplateTypes'
import type { BrewTemplateCandidate } from './recommendationTypes'

type ScoredTemplate = {
  template: BrewTemplate
  score: number
  reasons: string[]
}

export function selectTemplateCandidates(
  targetBean: Bean,
  templates = brewTemplates,
): BrewTemplateCandidate[] {
  const scored = templates
    .map((template) => scoreTemplate(targetBean, template))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || rankTemplate(left) - rankTemplate(right))

  const regularCandidates = scored
    .filter((candidate) => !candidate.template.isChampionReference)
    .slice(0, 2)

  const championCandidate = scored.find((candidate) => candidate.template.isChampionReference)
  const selected = championCandidate
    ? [...regularCandidates, championCandidate]
    : scored.slice(0, 3)

  return selected.slice(0, 3).map(toTemplateCandidate)
}

function scoreTemplate(targetBean: Bean, template: BrewTemplate): ScoredTemplate {
  let score = template.difficulty === 'easy' ? 2 : 0
  const reasons: string[] = []

  const process = targetBean.process?.trim()
  if (process && template.suitableFor.includes(process)) {
    score += 8
    reasons.push('处理法匹配')
  }

  const roastLevel = targetBean.roast_level?.trim()
  if (roastLevel && template.suitableFor.includes(roastLevel)) {
    score += 5
    reasons.push('烘焙度匹配')
  }

  const sharedFlavorTags = targetBean.flavor_tags.filter((tag) =>
    template.suitableFor.includes(tag),
  )

  if (sharedFlavorTags.length > 0) {
    score += Math.min(sharedFlavorTags.length * 4, 10)
    reasons.push(`风味匹配：${sharedFlavorTags.join('、')}`)
  }

  if (template.category === 'bean-specific' && reasons.length > 0) {
    score += 3
    reasons.push('豆子适配模板')
  }

  if (template.isChampionReference) {
    score -= 3
    reasons.push('进阶冠军参考')
  }

  if (reasons.length === 0 && template.id === 'new-bean-default') {
    score += 4
    reasons.push('新豆默认试冲')
  }

  return { template, score, reasons }
}

function toTemplateCandidate(candidate: ScoredTemplate): BrewTemplateCandidate {
  const { template } = candidate

  return {
    id: template.id,
    name: template.name,
    brewer: template.brewer,
    ratio: template.ratio,
    waterTemperature: `${template.waterTemperatureC.min}-${template.waterTemperatureC.max}°C`,
    targetTime: `${formatTemplateTime(template.targetTimeSeconds.min)}-${formatTemplateTime(
      template.targetTimeSeconds.max,
    )}`,
    pourSummary: summarizePourSteps(template),
    isChampionReference: template.isChampionReference,
    score: candidate.score,
    reasons: candidate.reasons,
  }
}

function rankTemplate(candidate: ScoredTemplate) {
  if (candidate.template.isChampionReference) {
    return 3
  }

  if (candidate.template.category === 'bean-specific') {
    return 0
  }

  if (candidate.template.difficulty === 'easy') {
    return 1
  }

  return 2
}
