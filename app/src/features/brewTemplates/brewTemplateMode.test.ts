import { describe, expect, it } from 'vitest'
import { brewTemplates } from './brewTemplates'
import { countTemplatesByMode } from './brewTemplateMode'

describe('core brew template modes', () => {
  it('contains exactly the approved 20 active system templates', () => {
    expect(brewTemplates).toHaveLength(20)
    expect(countTemplatesByMode(brewTemplates)).toEqual({
      hot_pourover: 11,
      iced_pourover: 2,
      cold_brew: 4,
      espresso: 3,
    })
  })

  it('contains two cold brew templates for each serving style', () => {
    expect(brewTemplates.filter((item) => item.brewVariant === 'ready_to_drink')).toHaveLength(2)
    expect(brewTemplates.filter((item) => item.brewVariant === 'concentrate')).toHaveLength(2)
  })

  it('stores iced templates with separate hot-water ratios and ice weights', () => {
    expect(brewTemplates.find((item) => item.id === 'iced-orea-flash')).toMatchObject({
      doseGrams: 15,
      waterGrams: 150,
      iceGrams: 75,
      ratio: '1:10',
    })
    expect(brewTemplates.find((item) => item.id === 'iced-seven-miles-177')).toMatchObject({
      doseGrams: 15,
      waterGrams: 105,
      iceGrams: 105,
      ratio: '1:7',
    })
  })

  it('does not expose retired system methods or champion references', () => {
    expect(brewTemplates.some((item) => /摩卡|法压|爱乐压|Switch|聪明杯/.test(item.brewer))).toBe(false)
    expect(brewTemplates.some((item) => item.isChampionReference)).toBe(false)
  })

  it('keeps every core recipe executable and attributed', () => {
    const ids = new Set(brewTemplates.map((item) => item.id))
    expect(ids.size).toBe(20)

    for (const template of brewTemplates) {
      expect(template.brewMode).toBeTruthy()
      expect(template.sourceNotes.trim()).not.toBe('')
      expect(template.sourceUrls.length).toBeGreaterThan(0)
      expect(template.pourSteps.length).toBeGreaterThanOrEqual(2)
      expect(template.pourSteps.at(-1)?.targetWaterGrams).toBe(template.waterGrams)
      expect(template.pourSteps.every((item, index, steps) =>
        index === 0 || item.targetWaterGrams >= steps[index - 1].targetWaterGrams,
      )).toBe(true)
    }
  })
})
