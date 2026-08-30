import { describe, expect, it } from 'vitest'
import {
  applyUserTemplateOverrides,
  createBrewTemplateFormFromTemplate,
  toBrewTemplateWriteInput,
  toBrewTemplateFromRow,
  toUserBrewTemplatePayload,
} from './brewTemplateModel'
import type { BrewTemplate } from './brewTemplateTypes'

const template = {
  id: 'system-v60',
  name: 'V60 三段式',
  category: 'daily-pourover',
  difficulty: 'easy',
  brewer: 'V60',
  filter: 'V60 滤纸',
  doseGrams: 15,
  waterGrams: 240,
  ratio: '1:16',
  waterTemperatureC: { min: 91, max: 93 },
  grindSize: '中细研磨',
  targetTimeSeconds: { min: 135, max: 165 },
  pourSteps: [
    {
      order: 1,
      startSeconds: 0,
      endSeconds: 30,
      targetWaterGrams: 40,
      label: '闷蒸',
      action: '注水到 40g',
    },
  ],
  suitableFor: ['水洗', '浅烘'],
  avoidFor: [],
  flavorGoal: '干净明亮',
  adjustmentRules: ['酸尖时升温 1°C'],
  sourceNotes: '系统模板',
  sourceUrls: [],
  isChampionReference: false,
  brewMode: 'iced_pourover',
  brewVariant: null,
  iceGrams: 75,
} satisfies BrewTemplate

describe('brew template model', () => {
  it('maps a Supabase row into the frontend template shape', () => {
    const mapped = toBrewTemplateFromRow({
      id: 'template-1',
      user_id: 'user-1',
      name: '我的冷萃壶模板',
      category: 'cold-brew',
      difficulty: 'easy',
      brewer: '冷萃壶',
      filter: '内置滤网',
      dose_grams: 30,
      water_grams: 300,
      ratio: '1:10',
      water_temperature_min: 4,
      water_temperature_max: 8,
      grind_size: '中粗研磨',
      target_time_min: 43200,
      target_time_max: 57600,
      pour_steps: template.pourSteps,
      suitable_for: ['低酸', '甜感'],
      avoid_for: ['深烘苦感明显'],
      flavor_goal: '低酸顺滑',
      adjustment_rules: ['风味偏淡时延长 2 小时'],
      source_notes: '自己记录',
      source_urls: [],
      is_champion_reference: false,
      copied_from_template_id: null,
      brew_mode: 'cold_brew',
      brew_variant: 'concentrate',
      ice_grams: 120,
      beverage_grams: null,
      created_at: '2026-06-15T01:00:00.000Z',
      updated_at: '2026-06-15T01:00:00.000Z',
      deleted_at: null,
      schema_version: 1,
    })

    expect(mapped).toMatchObject({
      id: 'template-1',
      source: 'user',
      userId: 'user-1',
      brewer: '冷萃壶',
      ratio: '1:10',
      brewMode: 'cold_brew',
      brewVariant: 'concentrate',
      iceGrams: 120,
      waterTemperatureC: { min: 4, max: 8 },
    })
  })

  it('copies a built-in template into a user-owned payload', () => {
    const form = createBrewTemplateFormFromTemplate(template)
    const payload = toUserBrewTemplatePayload(form, 'user-1', template.id)

    expect(payload).toMatchObject({
      user_id: 'user-1',
      name: 'V60 三段式',
      brewer: 'V60',
      brew_mode: 'iced_pourover',
      brew_variant: null,
      ice_grams: 75,
      beverage_grams: null,
      copied_from_template_id: 'system-v60',
    })
    expect(payload.pour_steps).toHaveLength(1)
    expect(payload.suitable_for).toEqual(['水洗', '浅烘'])
  })

  it('round-trips espresso output as a mode-specific field', () => {
    const form = createBrewTemplateFormFromTemplate({
      ...template,
      brewMode: 'espresso',
      iceGrams: undefined,
      beverageGrams: 36,
      brewer: '意式咖啡机',
      waterGrams: 240,
      ratio: '1:2',
    })

    expect(form).toMatchObject({
      brewMode: 'espresso',
      brewVariant: '',
      iceGrams: 0,
      beverageGrams: 36,
    })
    expect(toBrewTemplateWriteInput(form)).toMatchObject({
      brew_mode: 'espresso',
      brew_variant: null,
      ice_grams: null,
      beverage_grams: 36,
      water_grams: 36,
    })
  })

  it('keeps legacy user templates readable when method fields are absent', () => {
    const legacyRow = {
      id: 'legacy-template', user_id: 'user-1', name: '旧 V60',
      category: 'daily-pourover' as const, difficulty: 'easy' as const,
      brewer: 'V60', filter: '滤纸', dose_grams: 15, water_grams: 240,
      ratio: '1:16', water_temperature_min: 90, water_temperature_max: 93,
      grind_size: '中细', target_time_min: 120, target_time_max: 180,
      pour_steps: template.pourSteps, suitable_for: [], avoid_for: [],
      flavor_goal: '', adjustment_rules: [], source_notes: '旧模板', source_urls: [],
      is_champion_reference: false, copied_from_template_id: null,
      created_at: '2026-06-15T01:00:00.000Z', updated_at: '2026-06-15T01:00:00.000Z',
      deleted_at: null, schema_version: 1,
    }

    const mapped = toBrewTemplateFromRow(legacyRow)

    expect(mapped).toMatchObject({ id: 'legacy-template', brewMode: undefined })
    expect(createBrewTemplateFormFromTemplate(mapped).brewMode).toBe('hot_pourover')
  })

  it('creates a local repository input without ownership fields', () => {
    const input = toBrewTemplateWriteInput(
      createBrewTemplateFormFromTemplate(template),
      template.id,
    )
    expect(input).toMatchObject({
      name: 'V60 三段式',
      copied_from_template_id: 'system-v60',
    })
    expect(input).not.toHaveProperty('user_id')
  })

  it('uses a copied user template as the editable replacement for its built-in source', () => {
    const replacement = {
      ...template,
      id: 'user-v60',
      name: '我的 V60 三段式',
      waterGrams: 230,
      source: 'user',
      userId: 'user-1',
      copiedFromTemplateId: template.id,
    } satisfies BrewTemplate
    const custom = {
      ...template,
      id: 'user-original',
      name: '我的原创模板',
      source: 'user',
      userId: 'user-1',
      copiedFromTemplateId: null,
    } satisfies BrewTemplate

    const merged = applyUserTemplateOverrides([template], [custom, replacement])

    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({
      id: 'user-v60',
      name: '我的 V60 三段式',
      waterGrams: 230,
      copiedFromTemplateId: 'system-v60',
    })
    expect(merged.map((item) => item.id)).not.toContain('system-v60')
    expect(merged[1]).toMatchObject({ id: 'user-original' })
  })
})
