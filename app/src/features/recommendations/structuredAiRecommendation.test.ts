import { describe, expect, it } from 'vitest'
import { normalizeAiRecommendationResponse } from './structuredAiRecommendation'

describe('normalizeAiRecommendationResponse', () => {
  it('keeps a valid structured DeepSeek response stable', () => {
    const result = normalizeAiRecommendationResponse({
      configured: true,
      suggestion: '第一杯建议用三段式。',
      structured: {
        summary: '用 V60 三段式突出甜感。',
        recipe: {
          method: '手冲',
          dripper: 'V60',
          grindSetting: '中细研磨',
          waterTemperatureC: 92,
          coffeeGrams: 15,
          waterGrams: 240,
          ratio: '1:16',
          totalTimeSeconds: 150,
        },
        pourPlan: [
          {
            label: '闷蒸',
            startSeconds: 0,
            endSeconds: 30,
            targetType: 'water',
            targetGrams: 30,
            action: '轻柔绕圈',
          },
        ],
        adjustments: ['偏酸就升高水温 1°C'],
        reasons: ['水洗豆适合干净萃取'],
        riskNotes: ['首次建议需要实测校正'],
        rawText: 'raw',
      },
    })

    expect(result.structured?.recipe).toMatchObject({
      method: '手冲',
      dripper: 'V60',
      waterTemperatureC: 92,
      coffeeGrams: 15,
    })
    expect(result.structured?.pourPlan).toEqual([
      {
        label: '闷蒸',
        time: '0:00-0:30',
        startSeconds: 0,
        endSeconds: 30,
        targetType: 'water',
        targetGrams: 30,
        action: '轻柔绕圈',
      },
    ])
    expect(result.suggestion).toBe('第一杯建议用三段式。')
  })

  it('falls back from old text-only AI responses', () => {
    const result = normalizeAiRecommendationResponse({
      configured: true,
      suggestion: '建议 15g 粉，1:16，92°C，三段注水。',
    })

    expect(result.structured).toMatchObject({
      summary: '建议 15g 粉，1:16，92°C，三段注水。',
      rawText: '建议 15g 粉，1:16，92°C，三段注水。',
    })
    expect(result.structured?.pourPlan).toEqual([])
    expect(result.structured?.recipe.ratio).toBeNull()
  })

  it('normalizes malformed structured values without inventing numbers', () => {
    const result = normalizeAiRecommendationResponse({
      configured: true,
      structured: {
        summary: 123,
        recipe: {
          waterTemperatureC: 'hot',
          coffeeGrams: '15',
          ratio: 16,
        },
        pourPlan: [
          {
            label: '',
            time: 30,
            waterGrams: 'bad',
            action: '注水到 120g',
          },
        ],
        adjustments: '偏苦就降温',
      },
    })

    expect(result.structured?.summary).toBe('')
    expect(result.structured?.recipe.waterTemperatureC).toBeNull()
    expect(result.structured?.recipe.coffeeGrams).toBe(15)
    expect(result.structured?.recipe.ratio).toBeNull()
    expect(result.structured?.pourPlan).toEqual([
      {
        label: '第 1 段',
        time: '',
        startSeconds: null,
        endSeconds: null,
        targetType: 'none',
        targetGrams: null,
        action: '注水到 120g',
      },
    ])
    expect(result.structured?.adjustments).toEqual([])
  })

  it('adapts a saved legacy waterGrams step', () => {
    const result = normalizeAiRecommendationResponse({
      configured: true,
      structured: {
        recipe: {},
        pourPlan: [{ label: '闷蒸', time: '0:00-0:30', waterGrams: 30, action: '轻柔绕圈' }],
      },
    })

    expect(result.structured?.pourPlan[0]).toMatchObject({
      targetType: 'water',
      targetGrams: 30,
      time: '0:00-0:30',
    })
  })
})
