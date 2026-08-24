import { describe, expect, it } from 'vitest'
import { filterBrewTemplates, formatTemplateTime, summarizePourSteps } from './brewTemplateFilters'
import { brewTemplates } from './brewTemplates'
import type { BrewTemplate } from './brewTemplateTypes'

describe('brew template mode filtering', () => {
  it.each([
    ['hot_pourover', 11],
    ['iced_pourover', 2],
    ['cold_brew_ready_to_drink', 2],
    ['cold_brew_concentrate', 2],
    ['espresso', 3],
  ] as const)('filters %s templates using mode metadata', (mode, expected) => {
    expect(filterBrewTemplates(brewTemplates, { mode })).toHaveLength(expected)
  })

  it('keeps an unmapped legacy user template visible when no mode filter is active', () => {
    const legacy = {
      ...brewTemplates[0],
      id: 'legacy-user-template',
      source: 'user',
      brewMode: undefined,
      category: 'immersion-hybrid',
      brewer: '旧设备',
      name: '旧自定义模板',
      suitableFor: [],
    } satisfies BrewTemplate

    expect(filterBrewTemplates([legacy], { mode: '' })).toEqual([legacy])
    expect(filterBrewTemplates([legacy], { mode: 'hot_pourover' })).toEqual([])
  })

  it('summarizes cumulative steps and long durations', () => {
    expect(summarizePourSteps(brewTemplates[0])).toContain('1.')
    expect(formatTemplateTime(125)).toBe('2:05')
    expect(formatTemplateTime(12 * 60 * 60)).toBe('12小时')
  })
})
