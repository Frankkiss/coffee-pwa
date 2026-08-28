import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { StructuredAiRecommendation } from './recommendationTypes'
import { StructuredAiRecommendationView } from './StructuredAiRecommendationView'

describe('StructuredAiRecommendationView', () => {
  it('renders espresso stages as generic brew steps with an output target', () => {
    const recommendation: StructuredAiRecommendation = {
      summary: '以 1:2 建立基准。',
      recipe: {
        method: '意式', brewMode: 'espresso', brewVariant: null,
        dripper: 'Flair 58', grinder: 'C40', grindSetting: '8',
        waterTemperatureC: 92, coffeeGrams: 18, waterGrams: null,
        iceGrams: null, beverageGrams: 36, ratio: '1:2', totalTimeSeconds: 28,
      },
      pourPlan: [{
        label: '萃取', time: '0:00-0:28', startSeconds: 0, endSeconds: 28,
        targetType: 'beverage', targetGrams: 36, action: '在目标液重停止',
      }],
      adjustments: [], reasons: [], riskNotes: [], rawText: '',
    }
    const html = renderToStaticMarkup(
      <StructuredAiRecommendationView recommendation={recommendation} />,
    )

    expect(html).toContain('冲煮步骤')
    expect(html).toContain('出液 36g')
    expect(html).not.toContain('分段注水')
  })

  it('labels iced pour-over ratio as hot-water-only and keeps ice separate', () => {
    const recommendation: StructuredAiRecommendation = {
      summary: '冰手冲基准。',
      recipe: {
        method: '冰手冲', brewMode: 'iced_pourover', brewVariant: null,
        dripper: 'V60', grinder: 'C40', grindSetting: '20 clicks',
        waterTemperatureC: 92, coffeeGrams: 15, waterGrams: 150,
        iceGrams: 75, beverageGrams: null, ratio: '1:10', totalTimeSeconds: 120,
      },
      pourPlan: [], adjustments: [], reasons: [], riskNotes: [], rawText: '',
    }
    const html = renderToStaticMarkup(
      <StructuredAiRecommendationView recommendation={recommendation} />,
    )

    expect(html).toContain('粉水比（仅热水）')
    expect(html).toContain('热水量')
    expect(html).toContain('冰量')
    expect(html).not.toContain('热水 / 水量')
  })
})
