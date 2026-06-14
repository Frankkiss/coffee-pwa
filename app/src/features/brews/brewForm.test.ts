import { describe, expect, it } from 'vitest'
import {
  createBrewFormFromLog,
  createInitialBrewForm,
  toBrewLogInsertPayload,
  toBrewLogUpdatePayload,
  withFallbackBeanId,
} from './brewForm'
import type { BrewLog } from './brewTypes'

describe('toBrewLogInsertPayload', () => {
  it('maps brew form values to a Supabase insert payload', () => {
    const form = {
      ...createInitialBrewForm('bean-1'),
      method: 'V60',
      dripper: 'Hario',
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
      flavorTags: 'citrus, jasmine, citrus',
      notes: 'clean sweetness',
      isPinnedRecipe: true,
    }

    expect(toBrewLogInsertPayload(form, 'user-1')).toEqual({
      user_id: 'user-1',
      bean_id: 'bean-1',
      method: 'V60',
      dripper: 'Hario',
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
      flavor_tags: ['citrus', 'jasmine'],
      is_pinned_recipe: true,
      notes: 'clean sweetness',
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

describe('brew log edit helpers', () => {
  const log: BrewLog = {
    id: 'log-1',
    user_id: 'user-1',
    bean_id: 'bean-1',
    brewed_at: '2026-06-14T08:00:00.000Z',
    method: 'V60',
    dripper: 'Origami',
    filter_paper: 'Kalita 155',
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
    flavor_tags: ['citrus', 'honey'],
    is_pinned_recipe: true,
    notes: 'clean and sweet',
    created_at: '2026-06-14T08:00:00.000Z',
    updated_at: '2026-06-14T08:00:00.000Z',
    deleted_at: null,
    schema_version: 1,
  }

  it('maps an existing brew log back to editable form values', () => {
    expect(createBrewFormFromLog(log)).toMatchObject({
      beanId: 'bean-1',
      method: 'V60',
      dripper: 'Origami',
      coffeeGrams: '15',
      waterGrams: '240',
      waterTemperatureC: '92',
      totalTimeSeconds: '150',
      rating: '4.5',
      flavorTags: 'citrus, honey',
      notes: 'clean and sweet',
      isPinnedRecipe: true,
    })
  })

  it('maps editable form values to an update payload without user id', () => {
    const form = {
      ...createInitialBrewForm('bean-1'),
      method: 'V60',
      coffeeGrams: '16',
      waterGrams: '250',
      rating: '4',
      flavorTags: 'berry, sweet',
      isPinnedRecipe: true,
    }

    const payload = toBrewLogUpdatePayload(form)

    expect(payload).toMatchObject({
      bean_id: 'bean-1',
      method: 'V60',
      coffee_grams: 16,
      water_grams: 250,
      ratio: '1:15.6',
      rating: 4,
      flavor_tags: ['berry', 'sweet'],
      is_pinned_recipe: true,
    })
    expect(payload).not.toHaveProperty('user_id')
  })
})

describe('withFallbackBeanId', () => {
  it('uses the fallback bean id when the form does not have one yet', () => {
    expect(withFallbackBeanId(createInitialBrewForm(''), 'bean-1').beanId).toBe('bean-1')
  })

  it('keeps the selected bean id when the form already has one', () => {
    expect(withFallbackBeanId(createInitialBrewForm('bean-2'), 'bean-1').beanId).toBe(
      'bean-2',
    )
  })
})
