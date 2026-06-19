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

  it('uses Chinese brewer labels for common non-brand devices', () => {
    const options = getBrewTemplateFilterOptions(brewTemplates)

    expect(options.brewers).toContain('聪明杯')
    expect(options.brewers).toContain('Switch 浸泡滤杯')
    expect(options.brewers).toContain('Kalita Wave 平底滤杯')
    expect(options.brewers).toContain('摩卡壶')
    expect(options.brewers).not.toContain('Clever Dripper')
    expect(options.brewers).not.toContain('Hario Switch')
    expect(options.brewers).not.toContain('Kalita Wave')
  })

  it('includes executable cold brew pitcher templates', () => {
    const coldBrewTemplates = brewTemplates.filter((template) => template.category === 'cold-brew')

    expect(coldBrewTemplates.length).toBeGreaterThanOrEqual(3)
    expect(coldBrewTemplates.map((template) => template.brewer)).toContain('冷萃壶')
    expect(
      coldBrewTemplates.every((template) =>
        template.pourSteps.some((step) => step.label.includes('冷藏')),
      ),
    ).toBe(true)
  })

  it('summarizes cumulative pour steps for compact cards', () => {
    const summary = summarizePourSteps(brewTemplates[0])

    expect(summary).toContain('1.')
    expect(summary).toContain('g')
    expect(formatTemplateTime(125)).toBe('2:05')
    expect(formatTemplateTime(12 * 60 * 60)).toBe('12小时')
  })

  it('calibrates core daily templates for a stronger sweeter preference', () => {
    const expected = new Map([
      ['classic-v60-three-pour', { ratio: '1:15', time: { min: 110, max: 145 } }],
      ['v60-five-pulse', { ratio: '1:15', time: { min: 130, max: 165 } }],
      ['hoffmann-v60-inspired', { ratio: '1:15', time: { min: 120, max: 155 } }],
      ['kasuya-46-daily', { ratio: '1:15', time: { min: 150, max: 190 } }],
      ['kalita-wave-stable-sweet', { ratio: '1:15', time: { min: 135, max: 175 } }],
      ['new-bean-default', { ratio: '1:15', time: { min: 115, max: 150 } }],
    ])

    for (const [id, expectation] of expected) {
      const template = brewTemplates.find((item) => item.id === id)

      expect(template?.ratio).toBe(expectation.ratio)
      expect(template?.doseGrams).toBe(15)
      expect(template?.waterGrams).toBe(225)
      expect(template?.targetTimeSeconds).toEqual(expectation.time)
      expect(template?.suitableFor).toContain('浓郁')
      expect(template?.suitableFor).toContain('甜感')
    }
  })

  it('includes executable moka pot templates for concentrated coffee', () => {
    const mokaTemplates = brewTemplates.filter((template) => template.brewer === '摩卡壶')

    expect(mokaTemplates.length).toBeGreaterThanOrEqual(2)
    expect(mokaTemplates.every((template) => template.category === 'moka-pot')).toBe(true)
    expect(mokaTemplates.map((template) => template.ratio)).toContain('1:10')
    expect(
      mokaTemplates.every((template) =>
        template.pourSteps.some((step) => step.action.includes('不要压粉')) &&
        template.pourSteps.some((step) => step.action.includes('安全阀')) &&
        template.pourSteps.some((step) => step.action.includes('离火')),
      ),
    ).toBe(true)
  })
})
