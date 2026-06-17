import type { Bean } from '../beans/beanTypes'
import { splitMultiValueText } from '../beans/blendComponents'
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

  const processHints = splitMultiValueText(targetBean.process)
  const matchingProcessHints = processHints.filter((processHint) =>
    template.suitableFor.includes(processHint),
  )

  if (matchingProcessHints.length > 0 && !(process && template.suitableFor.includes(process))) {
    score += Math.min(matchingProcessHints.length * 4, 8)
    reasons.push(`处理法线索匹配：${matchingProcessHints.join('、')}`)
  }

  const blendProcesses = getBlendProcesses(targetBean)
  const matchingBlendProcesses = blendProcesses.filter((blendProcess) =>
    template.suitableFor.includes(blendProcess),
  )

  if (matchingBlendProcesses.length > 0) {
    score += Math.min(matchingBlendProcesses.length * 5, 8)
    reasons.push(`拼配处理法匹配：${matchingBlendProcesses.join('、')}`)
  }

  const roastLevel = targetBean.roast_level?.trim()
  if (roastLevel && matchesRoastLevel(roastLevel, template)) {
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

function matchesRoastLevel(roastLevel: string, template: BrewTemplate) {
  if (template.suitableFor.includes(roastLevel)) {
    return true
  }

  return roastLevel === '极浅烘' && template.suitableFor.includes('浅烘')
}

function getBlendProcesses(targetBean: Bean) {
  if (targetBean.bean_type !== 'blend') {
    return []
  }

  return Array.from(
    new Set(
      (targetBean.blend_components ?? [])
        .map((component) => component.process.trim())
        .filter(Boolean),
    ),
  )
}
