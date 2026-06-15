import type {
  BrewTemplate,
  BrewTemplateDifficulty,
  BrewTemplateFilters,
} from './brewTemplateTypes'

export function filterBrewTemplates(
  templates: BrewTemplate[],
  filters: BrewTemplateFilters,
) {
  return templates.filter((template) => {
    if (!filters.includeChampionReferences && template.isChampionReference) {
      return false
    }

    if (filters.brewer && !template.brewer.includes(filters.brewer)) {
      return false
    }

    if (filters.difficulty && template.difficulty !== filters.difficulty) {
      return false
    }

    if (filters.flavor && !matchesFlavor(template, filters.flavor)) {
      return false
    }

    return true
  })
}

export function getBrewTemplateFilterOptions(templates: BrewTemplate[]) {
  const brewers = new Set<string>()
  const flavors = new Set<string>()
  const difficulties: BrewTemplateDifficulty[] = ['easy', 'medium', 'advanced']

  templates.forEach((template) => {
    brewers.add(template.brewer)
    template.suitableFor.forEach((tag) => flavors.add(tag))
  })

  return {
    brewers: Array.from(brewers).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN')),
    flavors: Array.from(flavors).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN')),
    difficulties,
  }
}

export function summarizePourSteps(template: BrewTemplate) {
  return template.pourSteps
    .slice(0, 3)
    .map((step) => `${step.order}. ${formatTemplateTime(step.startSeconds)} 到 ${step.targetWaterGrams}g`)
    .join(' / ')
}

export function formatTemplateTime(seconds: number) {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.round((seconds % 3600) / 60)

    return minutes > 0 ? `${hours}小时${minutes}分` : `${hours}小时`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function matchesFlavor(template: BrewTemplate, flavor: string) {
  return (
    template.suitableFor.includes(flavor) ||
    template.flavorGoal.includes(flavor) ||
    template.adjustmentRules.some((rule) => rule.includes(flavor))
  )
}
