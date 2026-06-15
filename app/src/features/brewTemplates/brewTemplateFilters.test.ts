import { describe, expect, it } from 'vitest'
import {
  filterBrewTemplates,
  formatTemplateTime,
  getBrewTemplateFilterOptions,
  summarizePourSteps,
} from './brewTemplateFilters'
import { brewTemplates } from './brewTemplates'

describe('brew template dataset', () => {
  it('contains a broad v1 template library with unique ids', () => {
    const ids = new Set(brewTemplates.map((template) => template.id))

    expect(brewTemplates.length).toBeGreaterThanOrEqual(20)
    expect(ids.size).toBe(brewTemplates.length)
  })

  it('keeps each template executable with bounded cumulative pours', () => {
    for (const template of brewTemplates) {
      expect(template.pourSteps.length).toBeGreaterThanOrEqual(2)
      expect(template.waterGrams).toBeGreaterThan(0)
      expect(template.doseGrams).toBeGreaterThan(0)
      expect(template.sourceNotes.length).toBeGreaterThan(0)

      const lastStep = template.pourSteps.at(-1)
      expect(lastStep?.targetWaterGrams).toBeLessThanOrEqual(template.waterGrams)

      for (const step of template.pourSteps) {
        expect(step.targetWaterGrams).toBeLessThanOrEqual(template.waterGrams)
        expect(step.action.length).toBeGreaterThan(0)
      }
    }
  })

  it('marks champion templates as advanced references', () => {
    const championTemplates = brewTemplates.filter((template) => template.isChampionReference)

    expect(championTemplates.length).toBeGreaterThanOrEqual(4)
    expect(championTemplates.every((template) => template.difficulty === 'advanced')).toBe(true)
  })

  it('filters templates by brewer, flavor, difficulty, and champion visibility', () => {
    const filtered = filterBrewTemplates(brewTemplates, {
      brewer: 'V60',
      flavor: '明亮',
      difficulty: 'easy',
      includeChampionReferences: false,
    })

    expect(filtered.length).toBeGreaterThan(0)
    expect(filtered.every((template) => template.brewer.includes('V60'))).toBe(true)
    expect(filtered.every((template) => template.difficulty === 'easy')).toBe(true)
    expect(filtered.every((template) => !template.isChampionReference)).toBe(true)
  })

  it('builds stable filter options from template data', () => {
    const options = getBrewTemplateFilterOptions(brewTemplates)

    expect(options.brewers).toContain('V60')
    expect(options.flavors).toContain('明亮')
    expect(options.difficulties).toEqual(['easy', 'medium', 'advanced'])
  })

  it('summarizes cumulative pour steps for compact cards', () => {
    const summary = summarizePourSteps(brewTemplates[0])

    expect(summary).toContain('1.')
    expect(summary).toContain('g')
    expect(formatTemplateTime(125)).toBe('2:05')
  })
})
