import { useEffect, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import type {
  AiRecommendationResponse,
  RuleRecommendationResult,
} from './recommendationTypes'
import {
  createRecommendationForBean,
  loadRuleRecommendationData,
  requestAiRecommendation,
} from './recommendationService'
import './recommendations.css'

type RecommendationPanelProps = {
  session: Session
  supabase: SupabaseClient
}

type RecommendationData = {
  beans: Bean[]
  brewLogs: BrewLog[]
}

export function RecommendationPanel({
  session: _session,
  supabase,
}: RecommendationPanelProps) {
  const [data, setData] = useState<RecommendationData>({
    beans: [],
    brewLogs: [],
  })
  const [selectedBeanId, setSelectedBeanId] = useState('')
  const [ruleRecommendation, setRuleRecommendation] =
    useState<RuleRecommendationResult | null>(null)
  const [aiRecommendation, setAiRecommendation] =
    useState<AiRecommendationResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadData() {
      setIsLoading(true)
      setError('')

      try {
        const nextData = await loadRuleRecommendationData(supabase)

        if (isMounted) {
          setData(nextData)
          setSelectedBeanId((current) => current || nextData.beans[0]?.id || '')
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : '读取推荐数据失败')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadData()

    return () => {
      isMounted = false
    }
  }, [supabase])

  async function handleGenerate() {
    setError('')
    setRuleRecommendation(null)
    setAiRecommendation(null)
    setIsGenerating(true)

    try {
      const nextRuleRecommendation = createRecommendationForBean(
        selectedBeanId,
        data,
      )

      setRuleRecommendation(nextRuleRecommendation)

      if (!nextRuleRecommendation) {
        setError('还没有足够的历史冲煮参数用于推荐。')
        return
      }

      const nextAiRecommendation = await requestAiRecommendation(
        supabase,
        nextRuleRecommendation,
      )
      setAiRecommendation(nextAiRecommendation)
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成推荐失败')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <section className="recommendation-panel" aria-labelledby="recommendation-title">
      <div className="recommendation-panel__header">
        <div>
          <p className="recommendation-panel__eyebrow">Recommendation</p>
          <h2 id="recommendation-title">冲煮方案推荐</h2>
        </div>
        <span>{data.brewLogs.length} 条历史记录</span>
      </div>

      {isLoading ? <p className="recommendation-empty">正在读取推荐数据...</p> : null}

      {!isLoading && data.beans.length === 0 ? (
        <p className="recommendation-empty">先保存咖啡豆和冲煮记录，再生成推荐。</p>
      ) : null}

      {data.beans.length > 0 ? (
        <div className="recommendation-controls">
          <label>
            目标咖啡豆
            <select
              value={selectedBeanId}
              onChange={(event) => setSelectedBeanId(event.target.value)}
            >
              {data.beans.map((bean) => (
                <option key={bean.id} value={bean.id}>
                  {bean.name}
                </option>
              ))}
            </select>
          </label>

          <button type="button" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? '生成中' : '生成推荐'}
          </button>
        </div>
      ) : null}

      {ruleRecommendation ? (
        <div className="recommendation-result">
          <article className="recommendation-card">
            <h3>规则推荐</h3>
            <dl>
              <div>
                <dt>粉水比</dt>
                <dd>{ruleRecommendation.primary.recommended.ratio ?? '未记录'}</dd>
              </div>
              <div>
                <dt>水温</dt>
                <dd>
                  {ruleRecommendation.primary.recommended.waterTemperatureC
                    ? `${ruleRecommendation.primary.recommended.waterTemperatureC}°C`
                    : '未记录'}
                </dd>
              </div>
              <div>
                <dt>研磨度</dt>
                <dd>
                  {ruleRecommendation.primary.recommended.grindSetting ?? '未记录'}
                </dd>
              </div>
              <div>
                <dt>总时间</dt>
                <dd>
                  {ruleRecommendation.primary.recommended.totalTimeSeconds
                    ? `${ruleRecommendation.primary.recommended.totalTimeSeconds} 秒`
                    : '未记录'}
                </dd>
              </div>
              <div>
                <dt>器具</dt>
                <dd>
                  {[
                    ruleRecommendation.primary.recommended.method,
                    ruleRecommendation.primary.recommended.dripper,
                  ]
                    .filter(Boolean)
                    .join(' / ') || '未记录'}
                </dd>
              </div>
            </dl>
            <p>{ruleRecommendation.primary.reasons.join('；')}</p>
          </article>

          <div className="recommendation-references">
            <h3>参考历史记录</h3>
            {ruleRecommendation.references.map((candidate) => (
              <article key={candidate.brewLog.id}>
                <strong>{candidate.bean?.name ?? '未知咖啡豆'}</strong>
                <span>
                  {[candidate.brewLog.ratio, candidate.brewLog.rating ? `${candidate.brewLog.rating}/5` : null]
                    .filter(Boolean)
                    .join(' / ') || '参数待补充'}
                </span>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {aiRecommendation ? (
        <div className="recommendation-ai">
          <h3>DeepSeek 建议</h3>
          {aiRecommendation.configured && aiRecommendation.suggestion ? (
            <p>{aiRecommendation.suggestion}</p>
          ) : (
            <p>AI 建议暂未启用。规则推荐已经可用，配置 Supabase Secret 后会显示 DeepSeek 建议。</p>
          )}
        </div>
      ) : null}

      {error ? <p className="recommendation-error">{error}</p> : null}
    </section>
  )
}
