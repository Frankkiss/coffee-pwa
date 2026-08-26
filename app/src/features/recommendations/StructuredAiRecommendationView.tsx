import type {
  StructuredAiBrewStep,
  StructuredAiRecommendation,
} from './recommendationTypes'

type StructuredAiRecommendationViewProps = {
  recommendation: StructuredAiRecommendation
}

export function StructuredAiRecommendationView({
  recommendation,
}: StructuredAiRecommendationViewProps) {
  const recipeFields = [
    ['方法', recommendation.recipe.method],
    ['子类型', recommendation.recipe.brewVariant === 'concentrate' ? '浓缩基底' : recommendation.recipe.brewVariant === 'ready_to_drink' ? '直接饮用' : null],
    ['器具', recommendation.recipe.dripper],
    ['磨豆机', recommendation.recipe.grinder],
    ['粉水比', recommendation.recipe.ratio],
    ['粉量', formatNumber(recommendation.recipe.coffeeGrams, 'g')],
    ['热水 / 水量', formatNumber(recommendation.recipe.waterGrams, 'g')],
    ['冰量', formatNumber(recommendation.recipe.iceGrams, 'g')],
    ['出液量', formatNumber(recommendation.recipe.beverageGrams, 'g')],
    ['水温', formatNumber(recommendation.recipe.waterTemperatureC, '°C')],
    ['研磨', recommendation.recipe.grindSetting],
    ['总时间', formatNumber(recommendation.recipe.totalTimeSeconds, '秒')],
  ].filter((field): field is [string, string] => Boolean(field[1]))

  return (
    <div className="recommendation-ai-structured">
      {recommendation.summary ? <p>{recommendation.summary}</p> : null}

      {recipeFields.length > 0 ? (
        <dl>
          {recipeFields.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {recommendation.pourPlan.length > 0 ? (
        <div className="recommendation-ai-steps">
          <h4>冲煮步骤</h4>
          <ol>
            {recommendation.pourPlan.map((step) => (
              <li key={`${step.label}-${step.time}-${step.action}`}>
                <strong>{step.label}</strong>
                <span>
                  {[step.time, formatStepTarget(step), step.action]
                    .filter(Boolean)
                    .join(' / ')}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <StructuredList title="推荐理由" items={recommendation.reasons} />
      <StructuredList title="微调建议" items={recommendation.adjustments} />
      <StructuredList title="注意事项" items={recommendation.riskNotes} />

      {!recommendation.summary && recommendation.rawText ? <p>{recommendation.rawText}</p> : null}
    </div>
  )
}

function StructuredList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="recommendation-ai-list">
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

function formatNumber(value: number | null | undefined, suffix: string) {
  return value == null ? null : `${value}${suffix}`
}

function formatStepTarget(step: StructuredAiBrewStep) {
  if (step.targetGrams === null || step.targetType === 'none') return null
  const label = {
    water: '水量',
    ice: '冰量',
    beverage: '出液',
  }[step.targetType]
  return `${label} ${step.targetGrams}g`
}
