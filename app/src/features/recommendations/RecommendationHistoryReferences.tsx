import type { BrewRecommendationCandidate } from './recommendationTypes'

type RecommendationHistoryReferencesProps = {
  references: BrewRecommendationCandidate[]
}

export function RecommendationHistoryReferences({
  references,
}: RecommendationHistoryReferencesProps) {
  return (
    <div className="recommendation-references">
      <h3>参考历史记录</h3>
      {references.length === 0 ? <p>暂无可用历史记录，先使用模板兜底。</p> : null}
      {references.map((candidate) => (
        <article key={candidate.brewLog.id}>
          <strong>{candidate.bean?.name ?? '未知咖啡豆'}</strong>
          <span>
            {[
              candidate.recommended.ratio ?? '参数待补充',
              candidate.brewLog.rating ? `${candidate.brewLog.rating}/5` : null,
            ]
              .filter(Boolean)
              .join(' / ')}
          </span>
        </article>
      ))}
    </div>
  )
}
