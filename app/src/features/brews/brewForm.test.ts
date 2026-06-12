import { describe, expect, it } from 'vitest'
import { createInitialBrewForm, toBrewLogInsertPayload } from './brewForm'

describe('toBrewLogInsertPayload', () => {
  it('maps brew form values to a Supabase insert payload', () => {
    const form = {
      ...createInitialBrewForm('bean-1'),
      method: '手冲',
      dripper: 'V60',
      filterPaper: 'Hario 01',
      grinder: 'C40',
      grindSetting: '22 clicks',
      coffeeGrams: '15',
      waterGrams: '240',
      waterTemperatureC: '92',
      totalTimeSeconds: '150',
      rating: '4.5',
      acidity: '4',
      sweetness: '5',
      bitterness: '2',
      astringency: '1',
      body: '3',
      aftertaste: '4',
      flavorTags: '柑橘, 茉莉, 柑橘',
      notes: '甜感清楚，尾段干净',
      isPinnedRecipe: true,
    }

    expect(toBrewLogInsertPayload(form, 'user-1')).toEqual({
      user_id: 'user-1',
      bean_id: 'bean-1',
      method: '手冲',
      dripper: 'V60',
      filter_paper: 'Hario 01',
      grinder: 'C40',
      grind_setting: '22 clicks',
      coffee_grams: 15,
      water_grams: 240,
      ratio: '1:16',
      water_temperature_c: 92,
      total_time_seconds: 150,
      pour_steps: [],
      rating: 4.5,
      acidity: 4,
      sweetness: 5,
      bitterness: 2,
      astringency: 1,
      body: 3,
      aftertaste: 4,
      flavor_tags: ['柑橘', '茉莉'],
      is_pinned_recipe: true,
      notes: '甜感清楚，尾段干净',
    })
  })

  it('normalizes empty optional values to null', () => {
    const payload = toBrewLogInsertPayload(createInitialBrewForm('bean-1'), 'user-1')

    expect(payload).toMatchObject({
      bean_id: 'bean-1',
      method: null,
      coffee_grams: null,
      water_grams: null,
      ratio: null,
      rating: null,
      flavor_tags: [],
      is_pinned_recipe: false,
    })
  })

  it('rejects a missing bean id', () => {
    expect(() => toBrewLogInsertPayload(createInitialBrewForm(''), 'user-1')).toThrow(
      '请选择咖啡豆',
    )
  })
})
