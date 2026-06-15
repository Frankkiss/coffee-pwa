import { useEffect, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import type { BrewTemplate } from '../brewTemplates/brewTemplateTypes'
import type {
  AiRecommendationResponse,
  RuleRecommendationResult,
} from './recommendationTypes'
import {
  createRecommendationForBean,
  listSavedRecommendations,
  loadRuleRecommendationData,
  requestAiRecommendation,
  saveRecommendation,
  softDeleteSavedRecommendation,
  updateSavedRecommendationAccepted,
} from './recommendationService'
import { buildSavedRecommendationPayload } from './savedRecommendation'
import {
  toSavedRecommendationCards,
  type SavedRecommendationCard,
} from './savedRecommendationList'
import { StructuredAiRecommendationView } from './StructuredAiRecommendationView'
import './recommendations.css'

type RecommendationPanelProps = {
  session: Session
  supabase: SupabaseClient
}

type RecommendationData = {
  beans: Bean[]
  brewLogs: BrewLog[]
  templates: BrewTemplate[]
}

export function RecommendationPanel({ session, supabase }: RecommendationPanelProps) {
  const [data, setData] = useState<RecommendationData>({
    beans: [],
    brewLogs: [],
    templates: [],
  })
  const [selectedBeanId, setSelectedBeanId] = useState('')
  const [ruleRecommendation, setRuleRecommendation] =
    useState<RuleRecommendationResult | null>(null)
  const [aiRecommendation, setAiRecommendation] =
    useState<AiRecommendationResponse | null>(null)
  const [savedRecommendations, setSavedRecommendations] = useState<SavedRecommendationCard[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingSaved, setIsLoadingSaved] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [updatingSavedId, setUpdatingSavedId] = useState<string | null>(null)
  const [expandedSavedId, setExpandedSavedId] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [savedError, setSavedError] = useState('')

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

  useEffect(() => {
    let isMounted = true

    async function loadSaved() {
      setIsLoadingSaved(true)
      setSavedError('')

      try {
        const rows = await listSavedRecommendations(supabase)

        if (isMounted) {
          setSavedRecommendations(toSavedRecommendationCards(rows))
        }
      } catch (err) {
        if (isMounted) {
          setSavedError(err instanceof Error ? err.message : '读取已保存推荐失败')
        }
      } finally {
        if (isMounted) {
          setIsLoadingSaved(false)
        }
      }
    }

    loadSaved()

    return () => {
      isMounted = false
    }
  }, [supabase])

  async function refreshSavedRecommendations() {
    const rows = await listSavedRecommendations(supabase)
    setSavedRecommendations(toSavedRecommendationCards(rows))
  }

  async function handleGenerate() {
    setError('')
    setStatus('')
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

  async function handleSaveRecommendation() {
    if (!ruleRecommendation) {
      return
    }

    setError('')
    setStatus('')
    setIsSaving(true)

    try {
      await saveRecommendation(
        supabase,
        buildSavedRecommendationPayload({
          userId: session.user.id,
          ruleRecommendation,
          aiRecommendation,
        }),
      )
      await refreshSavedRecommendations()
      setStatus('已保存为推荐记录。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存推荐失败')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleSavedAccepted(recommendation: SavedRecommendationCard) {
    setSavedError('')
    setUpdatingSavedId(recommendation.id)

    try {
      await updateSavedRecommendationAccepted(supabase, recommendation.id, !recommendation.accepted)
      await refreshSavedRecommendations()
    } catch (err) {
      setSavedError(err instanceof Error ? err.message : '更新推荐状态失败')
    } finally {
      setUpdatingSavedId(null)
    }
  }

  async function handleDeleteSavedRecommendation(recommendation: SavedRecommendationCard) {
    const confirmed = window.confirm(`确定删除「${recommendation.targetName}」的这条推荐吗？数据会软删除。`)

    if (!confirmed) {
      return
    }

    setSavedError('')
    setUpdatingSavedId(recommendation.id)

    try {
      await softDeleteSavedRecommendation(supabase, recommendation.id)
      await refreshSavedRecommendations()
      setExpandedSavedId((current) => (current === recommendation.id ? null : current))
    } catch (err) {
      setSavedError(err instanceof Error ? err.message : '删除推荐失败')
    } finally {
      setUpdatingSavedId(null)
    }
  }

  return (
    <section id="recommendation" className="recommendation-panel" aria-labelledby="recommendation-title">
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

          <div className="recommendation-templates">
            <h3>候选冲煮模板</h3>
            <p>DeepSeek 会参考这些模板。</p>
            {ruleRecommendation.templateCandidates.map((template) => (
              <article key={template.id}>
                <div>
                  <strong>{template.name}</strong>
                  {template.isChampionReference ? <em>冠军参考</em> : null}
                </div>
                <span>
                  {[template.brewer, template.ratio, template.waterTemperature, template.targetTime]
                    .filter(Boolean)
                    .join(' / ')}
                </span>
                <small>{template.reasons.join('，')}</small>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {aiRecommendation ? (
        <div className="recommendation-ai">
          <h3>DeepSeek 建议</h3>
          {aiRecommendation.configured && aiRecommendation.structured ? (
            <StructuredAiRecommendationView recommendation={aiRecommendation.structured} />
          ) : aiRecommendation.configured && aiRecommendation.suggestion ? (
            <p>{aiRecommendation.suggestion}</p>
          ) : (
            <p>DeepSeek 未启用，先显示规则推荐。</p>
          )}
        </div>
      ) : null}

      {ruleRecommendation ? (
        <div className="recommendation-save">
          <div>
            <strong>保存为推荐记录</strong>
            <p>用于回看和对比。</p>
          </div>
          <button type="button" onClick={handleSaveRecommendation} disabled={isSaving}>
            {isSaving ? '保存中' : '保存本次推荐'}
          </button>
        </div>
      ) : null}

      {status ? <p className="recommendation-status">{status}</p> : null}
      {error ? <p className="recommendation-error">{error}</p> : null}

      <div className="recommendation-saved">
        <div className="recommendation-saved__header">
          <div>
            <h3>已保存推荐</h3>
            <p>最近 5 条。</p>
          </div>
        </div>

        {isLoadingSaved ? <p className="recommendation-empty">正在读取已保存推荐...</p> : null}
        {!isLoadingSaved && savedRecommendations.length === 0 ? (
          <p className="recommendation-empty">还没有保存过推荐。</p>
        ) : null}
        {savedRecommendations.map((recommendation) => (
          <article className="recommendation-saved-card" key={recommendation.id}>
            <div className="recommendation-saved-card__title">
              <div>
                <strong>{recommendation.targetName}</strong>
                <span>{recommendation.createdAtLabel}</span>
              </div>
              {recommendation.modelName ? <em>{recommendation.modelName}</em> : null}
            </div>
            <p>{recommendation.parameterSummary}</p>
            <span>{recommendation.aiSummary}</span>
            <div className="recommendation-saved-card__actions">
              <button
                type="button"
                onClick={() =>
                  setExpandedSavedId((current) =>
                    current === recommendation.id ? null : recommendation.id,
                  )
                }
              >
                {expandedSavedId === recommendation.id ? '收起详情' : '查看详情'}
              </button>
              <button
                type="button"
                disabled={updatingSavedId === recommendation.id}
                onClick={() => handleToggleSavedAccepted(recommendation)}
              >
                {recommendation.accepted ? '取消采纳' : '标记采纳'}
              </button>
              <button
                type="button"
                className="recommendation-danger-button"
                disabled={updatingSavedId === recommendation.id}
                onClick={() => handleDeleteSavedRecommendation(recommendation)}
              >
                删除
              </button>
            </div>
            {expandedSavedId === recommendation.id ? (
              <div className="recommendation-saved-detail">
                <dl>
                  <div>
                    <dt>状态</dt>
                    <dd>{recommendation.acceptedLabel}</dd>
                  </div>
                  <div>
                    <dt>候选模板</dt>
                    <dd>{recommendation.templateNames.join(' / ') || '未记录'}</dd>
                  </div>
                  <div>
                    <dt>规则理由</dt>
                    <dd>{recommendation.ruleReasons.join('；') || '未记录'}</dd>
                  </div>
                </dl>
                <strong>DeepSeek 完整建议</strong>
                {recommendation.structuredSummary ||
                recommendation.structuredRecipeSummary ||
                recommendation.pourPlan.length > 0 ? (
                  <div className="recommendation-saved-structured">
                    {recommendation.structuredSummary ? (
                      <p>{recommendation.structuredSummary}</p>
                    ) : null}
                    {recommendation.structuredRecipeSummary ? (
                      <span>{recommendation.structuredRecipeSummary}</span>
                    ) : null}
                    {recommendation.pourPlan.length > 0 ? (
                      <ol>
                        {recommendation.pourPlan.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    ) : null}
                    {recommendation.aiReasons.length > 0 ? (
                      <p>理由：{recommendation.aiReasons.join('；')}</p>
                    ) : null}
                    {recommendation.aiAdjustments.length > 0 ? (
                      <p>微调：{recommendation.aiAdjustments.join('；')}</p>
                    ) : null}
                    {recommendation.aiRiskNotes.length > 0 ? (
                      <p>注意：{recommendation.aiRiskNotes.join('；')}</p>
                    ) : null}
                  </div>
                ) : (
                  <p>{recommendation.aiDetail || '仅保存了规则推荐。'}</p>
                )}
              </div>
            ) : null}
          </article>
        ))}
        {savedError ? <p className="recommendation-error">{savedError}</p> : null}
      </div>
    </section>
  )
}
