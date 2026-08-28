import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { BrewRecommendationCandidate } from './recommendationTypes'
import { RecommendationHistoryReferences } from './RecommendationHistoryReferences'

function candidate(
  id: string,
  storedRatio: string,
  canonicalRatio: string | null,
): BrewRecommendationCandidate {
  return {
    bean: null,
    brewLog: { id, ratio: storedRatio, rating: 4 } as BrewRecommendationCandidate['brewLog'],
    score: 10,
    reasons: [],
    recommended: {
      method: '冰手冲',
      brewMode: 'iced_pourover',
      brewVariant: null,
      grinder: null,
      coffeeGrams: 16,
      waterGrams: 150,
      iceGrams: 100,
      beverageGrams: null,
      dripper: 'V60',
      grindSetting: null,
      ratio: canonicalRatio,
      waterTemperatureC: 95,
      totalTimeSeconds: 100,
    },
  }
}

describe('RecommendationHistoryReferences', () => {
  it('shows the canonical ratio instead of the stored legacy iced ratio', () => {
    const html = renderToStaticMarkup(
      <RecommendationHistoryReferences references={[candidate('complete', '1:15.6', '1:9.4')]} />,
    )

    expect(html).toContain('1:9.4')
    expect(html).not.toContain('1:15.6')
  })

  it('does not expose a stored legacy ratio when canonical weights are incomplete', () => {
    const html = renderToStaticMarkup(
      <RecommendationHistoryReferences references={[candidate('incomplete', '1:16.7', null)]} />,
    )

    expect(html).toContain('参数待补充')
    expect(html).not.toContain('1:16.7')
  })
})
