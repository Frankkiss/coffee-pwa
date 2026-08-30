import { describe, expect, it } from 'vitest'
import type { BrewLog } from './brewTypes'
import { buildBrewLogDetailView } from './brewLogDetailModel'

function createBrewLog(overrides: Partial<BrewLog> = {}): BrewLog {
  return {
    id: 'brew-1',
    user_id: 'user-1',
    bean_id: 'bean-1',
    brewed_at: '2026-06-15T08:30:00.000Z',
    method: '手冲',
    dripper: 'V60',
    filter_paper: 'Hario V60 02',
    grinder: 'C40',
    grind_setting: '22 clicks',
    coffee_grams: 15,
    water_grams: 240,
    ratio: '1:16',
    water_temperature_c: 92,
    total_time_seconds: 150,
    pour_steps: [
      { label: '闷蒸', time: '0:00-0:30', water: 30, note: '轻柔绕圈' },
      { label: '第二段', time: '0:30-1:10', water: 120 },
    ],
    rating: 4.5,
    acidity: 4,
    sweetness: 5,
    bitterness: null,
    astringency: null,
    body: 4,
    aftertaste: 4,
    flavor_tags: ['柑橘', '蜂蜜'],
    is_pinned_recipe: true,
    notes: '甜感清晰，尾段干净。',
    created_at: '2026-06-15T08:35:00.000Z',
    updated_at: '2026-06-15T08:40:00.000Z',
    deleted_at: null,
    schema_version: 1,
    ...overrides,
  }
}

describe('buildBrewLogDetailView', () => {
  it('formats core brew parameters with Chinese labels and units', () => {
    const detail = buildBrewLogDetailView(createBrewLog(), '耶加雪菲 水洗')

    expect(detail.title).toBe('耶加雪菲 水洗')
    expect(detail.subtitle).toBe('热手冲 / V60')
    expect(detail.parameterFields).toEqual([
      { label: '滤纸', value: 'Hario V60 02' },
      { label: '磨豆机', value: 'C40' },
      { label: '研磨度', value: '22 clicks' },
      { label: '粉量', value: '15 g' },
      { label: '水量', value: '240 g' },
      { label: '粉水比', value: '1:16' },
      { label: '水温', value: '92°C' },
      { label: '总时间', value: '2:30' },
    ])
    expect(detail.ratingLabel).toBe('4.5 / 5')
    expect(detail.pinActionLabel).toBe('取消候选方案')
  })

  it('normalizes readable pour steps and uses an empty message otherwise', () => {
    const detail = buildBrewLogDetailView(createBrewLog(), '测试豆')
    const emptyDetail = buildBrewLogDetailView(
      createBrewLog({ pour_steps: [{ unknown: true }, null] }),
      '测试豆',
    )

    expect(detail.pourSteps).toEqual([
      { title: '闷蒸', detail: '0:00-0:30 / 30 g / 轻柔绕圈' },
      { title: '第二段', detail: '0:30-1:10 / 120 g' },
    ])
    expect(emptyDetail.pourSteps).toEqual([])
    expect(emptyDetail.pourStepEmptyText).toBe('暂未记录分段注水')
  })

  it('derives and labels an iced pour-over ratio from hot water only', () => {
    const detail = buildBrewLogDetailView(createBrewLog({
      brew_mode: 'iced_pourover',
      ice_grams: 90,
      coffee_grams: 15,
      water_grams: 150,
      ratio: '1:16',
    }), '冰手冲豆')

    expect(detail.parameterFields).toContainEqual({ label: '热水量', value: '150 g' })
    expect(detail.parameterFields).toContainEqual({ label: '冰量', value: '90 g' })
    expect(detail.parameterFields).toContainEqual({ label: '粉水比（仅热水）', value: '1:10' })
    expect(detail.subtitle).toBe('冰手冲 / V60')
  })

  it('includes the cold-brew variant without repeating the default method', () => {
    const detail = buildBrewLogDetailView(createBrewLog({
      method: '冷萃',
      brew_mode: 'cold_brew',
      brew_variant: 'concentrate',
      dripper: null,
    }), '冷萃豆')

    expect(detail.subtitle).toBe('冷萃 · 浓缩基底')
  })

  it('keeps sparse logs readable', () => {
    const detail = buildBrewLogDetailView(
      createBrewLog({
        method: null,
        dripper: null,
        filter_paper: null,
        grinder: null,
        grind_setting: null,
        coffee_grams: null,
        water_grams: null,
        ratio: null,
        water_temperature_c: null,
        total_time_seconds: null,
        rating: null,
        flavor_tags: [],
        is_pinned_recipe: false,
        notes: null,
      }),
      '',
    )

    expect(detail.title).toBe('未绑定豆子')
    expect(detail.subtitle).toBe('方式待补充')
    expect(detail.parameterFields).toEqual([])
    expect(detail.ratingLabel).toBe('未评分')
    expect(detail.flavorTags).toEqual([])
    expect(detail.notes).toBe('还没有记录口感备注。')
    expect(detail.pinActionLabel).toBe('设为候选方案')
  })
})
