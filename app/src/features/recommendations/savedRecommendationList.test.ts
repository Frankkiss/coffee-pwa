import { describe, expect, it } from 'vitest'
import {
  toSavedRecommendationCard,
  toSavedRecommendationCards,
} from './savedRecommendationList'

describe('saved recommendation list view model', () => {
  it('maps a saved recommendation row into a compact card', () => {
    const card = toSavedRecommendationCard({
      id: 'rec-1',
      bean_id: 'bean-1',
      input_context: {
        targetBean: {
          name: '埃塞俄比亚 花魁',
        },
      },
      recommendation: {
        rule: {
          recommended: {
            method: '手冲',
            dripper: 'V60',
            ratio: '1:16',
            waterTemperatureC: 92,
            totalTimeSeconds: 150,
            grindSetting: '22 clicks',
          },
          reasons: ['处理法相同', '候选模板匹配'],
          templateCandidates: [
            {
              name: '经典三段式 V60',
            },
            {
              name: '水洗浅烘明亮模板',
            },
          ],
        },
        ai: {
          structured: {
            summary: '用 V60 三段式突出甜感。',
            recipe: {
              method: '手冲',
              dripper: 'V60',
              ratio: '1:16',
              waterTemperatureC: 92,
              totalTimeSeconds: 150,
              grindSetting: '22 clicks',
            },
            pourPlan: [
              {
                label: '闷蒸',
                time: '0:00-0:30',
                waterGrams: 30,
                action: '轻柔绕圈',
              },
            ],
            adjustments: ['偏酸就升高水温 1°C'],
            reasons: ['模板适合水洗浅烘'],
            riskNotes: ['首次建议需要实测校正'],
            rawText:
              '建议从 1:16、92°C、V60 开始，前段注水轻柔，观察酸甜平衡。如果偏酸，可以略微提高水温或拉长总时长。',
          },
          suggestion:
            '建议从 1:16、92°C、V60 开始，前段注水轻柔，观察酸甜平衡。如果偏酸，可以略微提高水温或拉长总时长。',
        },
      },
      model_name: 'deepseek-v4-pro',
      accepted: false,
      created_at: '2026-06-15T08:30:00.000Z',
    })

    expect(card).toEqual({
      id: 'rec-1',
      targetName: '埃塞俄比亚 花魁',
      createdAtLabel: '6/15',
      parameterSummary: '手冲 / V60 / 1:16 / 92°C / 150s / 22 clicks',
      aiSummary:
        '建议从 1:16、92°C、V60 开始，前段注水轻柔，观察酸甜平衡。如果偏酸，可以略微提高水温或拉长总时长。',
      aiDetail:
        '建议从 1:16、92°C、V60 开始，前段注水轻柔，观察酸甜平衡。如果偏酸，可以略微提高水温或拉长总时长。',
      structuredSummary: '用 V60 三段式突出甜感。',
      structuredRecipeSummary: '手冲 / V60 / 1:16 / 92°C / 150s / 22 clicks',
      pourPlan: ['闷蒸：0:00-0:30 / 30g / 轻柔绕圈'],
      aiAdjustments: ['偏酸就升高水温 1°C'],
      aiReasons: ['模板适合水洗浅烘'],
      aiRiskNotes: ['首次建议需要实测校正'],
      ruleReasons: ['处理法相同', '候选模板匹配'],
      templateNames: ['经典三段式 V60', '水洗浅烘明亮模板'],
      modelName: 'deepseek-v4-pro',
      accepted: false,
      acceptedLabel: '未采纳',
    })
  })

  it('falls back to rule-only text and sorts newest first', () => {
    const cards = toSavedRecommendationCards([
      {
        id: 'older',
        bean_id: 'bean-older',
        input_context: {},
        recommendation: {
          rule: {
            recommended: {
              ratio: '1:15',
            },
          },
        },
        model_name: null,
        accepted: null,
        created_at: '2026-06-14T08:30:00.000Z',
      },
      {
        id: 'newer',
        bean_id: 'bean-newer',
        input_context: {},
        recommendation: {},
        model_name: null,
        accepted: null,
        created_at: '2026-06-15T08:30:00.000Z',
      },
    ])

    expect(cards[0].id).toBe('newer')
    expect(cards[0].targetName).toBe('bean-newer')
    expect(cards[0].aiSummary).toBe('仅保存了规则推荐。')
    expect(cards[1].parameterSummary).toBe('1:15')
  })
})
