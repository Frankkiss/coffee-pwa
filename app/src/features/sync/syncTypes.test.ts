import { describe, expect, expectTypeOf, it } from 'vitest'
import type { UserBrewTemplateRow } from '../brewTemplates/brewTemplateTypes'
import type { SavedRecommendationRow } from '../recommendations/savedRecommendationList'
import type { UserSettingsRow } from '../settings/userSettingsTypes'
import { createEntityId, createMutationId } from './syncTypes'

const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('sync identifiers', () => {
  it('creates distinct permanent UUID v4 identifiers', () => {
    const identifiers = [
      createEntityId(),
      createEntityId(),
      createMutationId(),
      createMutationId(),
    ]

    expect(identifiers).toEqual(
      identifiers.map(() => expect.stringMatching(uuidV4Pattern)),
    )
    expect(new Set(identifiers).size).toBe(identifiers.length)
  })
})

describe('synchronized server row contracts', () => {
  it('accepts complete brew-template, user-settings, and recommendation rows', () => {
    const brewTemplate = {
      id: '10000000-0000-4000-8000-000000000001',
      user_id: '20000000-0000-4000-8000-000000000001',
      name: 'Daily V60',
      category: 'daily-pourover',
      difficulty: 'easy',
      brewer: 'V60',
      filter: 'paper',
      dose_grams: 15,
      water_grams: 240,
      ratio: '1:16',
      water_temperature_min: 90,
      water_temperature_max: 93,
      grind_size: 'medium-fine',
      target_time_min: 135,
      target_time_max: 165,
      pour_steps: [
        {
          order: 1,
          startSeconds: 0,
          endSeconds: 30,
          targetWaterGrams: 45,
          label: 'Bloom',
          action: 'Pour gently',
        },
      ],
      suitable_for: ['washed coffee'],
      avoid_for: [],
      flavor_goal: 'clean and sweet',
      adjustment_rules: ['grind finer when drawdown is fast'],
      source_notes: '',
      source_urls: [],
      is_champion_reference: false,
      copied_from_template_id: null,
      created_at: '2026-08-08T00:00:00.000Z',
      updated_at: '2026-08-08T00:00:00.000Z',
      deleted_at: null,
      schema_version: 1,
    } satisfies UserBrewTemplateRow

    const userSettings = {
      user_id: '20000000-0000-4000-8000-000000000001',
      preferred_units: { temperature: 'celsius' },
      default_gear: { brewer: 'V60' },
      taste_preferences: { acidity: 'bright' },
      backup_reminder_days: 7,
      created_at: '2026-08-08T00:00:00.000Z',
      updated_at: '2026-08-08T00:00:00.000Z',
      schema_version: 1,
    } satisfies UserSettingsRow

    const recommendation = {
      id: '30000000-0000-4000-8000-000000000001',
      user_id: '20000000-0000-4000-8000-000000000001',
      bean_id: null,
      input_context: { targetBean: { name: 'Sample bean' } },
      recommendation: { ratio: '1:16' },
      model_name: null,
      accepted: null,
      created_at: '2026-08-08T00:00:00.000Z',
      updated_at: '2026-08-08T00:00:00.000Z',
      deleted_at: null,
      schema_version: 1,
    } satisfies SavedRecommendationRow

    expectTypeOf(brewTemplate).toMatchTypeOf<UserBrewTemplateRow>()
    expectTypeOf(userSettings).toMatchTypeOf<UserSettingsRow>()
    expectTypeOf(recommendation).toMatchTypeOf<SavedRecommendationRow>()
  })
})
