import type { BrewMode, BrewVariant } from '../brews/brewTypes'
import type { BrewTemplate } from './brewTemplateTypes'

type ModeAwareTemplate = { brewMode?: BrewMode }

export function countTemplatesByMode(templates: ModeAwareTemplate[]) {
  return templates.reduce<Record<BrewMode, number>>(
    (counts, template) => {
      if (template.brewMode) counts[template.brewMode] += 1
      return counts
    },
    { hot_pourover: 0, iced_pourover: 0, cold_brew: 0, espresso: 0 },
  )
}

export function getTemplateModeMetadata(template: BrewTemplate): {
  brewMode: BrewMode | null
  brewVariant: BrewVariant | null
} {
  if (template.brewMode) {
    return {
      brewMode: template.brewMode,
      brewVariant: template.brewMode === 'cold_brew' ? template.brewVariant ?? null : null,
    }
  }

  const searchable = [template.id, template.name, template.brewer, ...template.suitableFor]
    .join(' ')
    .toLowerCase()

  if (template.category === 'cold-brew' || /冷萃|cold\s*brew/.test(searchable)) {
    const brewVariant = /浓缩|concentrate|兑奶|基底/.test(searchable)
      ? 'concentrate'
      : /直接饮用|ready.to.drink|清爽/.test(searchable)
        ? 'ready_to_drink'
        : null
    return { brewMode: 'cold_brew', brewVariant }
  }

  if (/意式|espresso/.test(searchable)) return { brewMode: 'espresso', brewVariant: null }
  if (/冰手冲|iced.pourover|flash.brew/.test(searchable)) return { brewMode: 'iced_pourover', brewVariant: null }
  if (template.category === 'daily-pourover' || /手冲|v60|orea|origami|kalita|april/.test(searchable)) {
    return { brewMode: 'hot_pourover', brewVariant: null }
  }

  return { brewMode: null, brewVariant: null }
}
