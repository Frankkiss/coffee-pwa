import { describe, expect, it } from 'vitest'
import { createBrewFormFromLog, createInitialBrewForm, toBrewLogUpdatePayload } from './brewForm'
import type { BrewLog } from './brewTypes'

describe('method-aware brew measurements', () => {
  it('stores separate hot-water and ice weights for iced pour-over', () => {
    const payload = toBrewLogUpdatePayload({
      ...createInitialBrewForm('bean-1'),
      brewMode: 'iced_pourover',
      method: '冰手冲',
      coffeeGrams: '15',
      waterGrams: '150',
      iceGrams: '90',
    })

    expect(payload).toMatchObject({
      brew_mode: 'iced_pourover',
      brew_variant: null,
      water_grams: 150,
      ice_grams: 90,
      beverage_grams: null,
      ratio: '1:16',
    })
  })

  it('uses beverage weight for the espresso ratio', () => {
    const payload = toBrewLogUpdatePayload({
      ...createInitialBrewForm('bean-1'),
      brewMode: 'espresso',
      method: '意式',
      coffeeGrams: '18',
      beverageGrams: '36',
    })

    expect(payload).toMatchObject({
      brew_mode: 'espresso',
      brew_variant: null,
      water_grams: null,
      ice_grams: null,
      beverage_grams: 36,
      ratio: '1:2',
    })
  })

  it('round-trips canonical mode fields into the editable form', () => {
    const form = createBrewFormFromLog({
      id: 'brew-1',
      user_id: 'user-1',
      bean_id: 'bean-1',
      brewed_at: '2026-08-23T00:00:00.000Z',
      method: '冷萃',
      brew_mode: 'cold_brew',
      brew_variant: 'concentrate',
      ice_grams: null,
      beverage_grams: null,
      dripper: '冷萃壶',
      filter_paper: null,
      grinder: 'C40',
      grind_setting: '粗研磨',
      coffee_grams: 50,
      water_grams: 400,
      ratio: '1:8',
      water_temperature_c: 6,
      total_time_seconds: 43200,
      pour_steps: [],
      rating: null,
      acidity: null,
      sweetness: null,
      bitterness: null,
      astringency: null,
      body: null,
      aftertaste: null,
      flavor_tags: [],
      is_pinned_recipe: false,
      notes: null,
      created_at: '2026-08-23T00:00:00.000Z',
      updated_at: '2026-08-23T00:00:00.000Z',
      deleted_at: null,
      schema_version: 1,
    } satisfies BrewLog)

    expect(form).toMatchObject({
      brewMode: 'cold_brew',
      brewVariant: 'concentrate',
      iceGrams: '',
      beverageGrams: '',
    })
  })
})
