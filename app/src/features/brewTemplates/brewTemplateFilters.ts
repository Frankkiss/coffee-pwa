import { getTemplateModeMetadata } from './brewTemplateMode'
import type { BrewTemplate, BrewTemplateFilters } from './brewTemplateTypes'

export function filterBrewTemplates(templates: BrewTemplate[], filters: BrewTemplateFilters) {
  if (!filters.mode) return templates

  return templates.filter((template) => {
    const metadata = getTemplateModeMetadata(template)
    if (filters.mode === 'cold_brew_ready_to_drink') {
      return metadata.brewMode === 'cold_brew' && metadata.brewVariant === 'ready_to_drink'
    }
    if (filters.mode === 'cold_brew_concentrate') {
      return metadata.brewMode === 'cold_brew' && metadata.brewVariant === 'concentrate'
    }
    return metadata.brewMode === filters.mode
  })
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
