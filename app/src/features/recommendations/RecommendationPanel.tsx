import { useEffect, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { useSyncRuntime } from '../sync/SyncContext'
import type { BrewForm, BrewMode, BrewVariant } from '../brews/brewTypes'
import { readRecommendationDefaults } from '../settings/recommendationDefaults'
import type { UserSettingsRow } from '../settings/userSettingsTypes'
import { getAiRecommendationStatusMessage } from './aiRecommendationStatus'
import type {
  AiRecommendationResponse,
  RuleRecommendationResult,
} from './recommendationTypes'
import {
  createRecommendationForContext,
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
import { createRecommendationContext } from './recommendationContext'
import { toBrewDraft } from './brewDraft'
import './recommendations.css'
import './recommendationMethodControls.css'

type RecommendationPanelProps = {
  session: Session
  supabase: SupabaseClient
  onUseDraft: (draft: BrewForm) => void
}

type RecommendationData = Awaited<ReturnType<typeof loadRuleRecommendationData>>

export function RecommendationPanel({ session, supabase, onUseDraft }: RecommendationPanelProps) {
  const runtime = useSyncRuntime()
  const repositories = runtime.repositories
  const recommendationRepository = repositories?.recommendations ?? null
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [data, setData] = useState<RecommendationData>({
    beans: [],
    brewLogs: [],
    templates: [],
    settings: null,
  })
  const [selectedBeanId, setSelectedBeanId] = useState('')
  const [ruleRecommendation, setRuleRecommendation] =
    useState<RuleRecommendationResult | null>(null)
  const [mode, setMode] = useState<BrewMode>('hot_pourover')
  const [variant, setVariant] = useState<BrewVariant>('ready_to_drink')
  const [brewer, setBrewer] = useState('')
  const [grinder, setGrinder] = useState('')
  const [espressoDose, setEspressoDose] = useState('')
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
    const update = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    let loadGeneration = 0
    async function loadData() {
      const generation = ++loadGeneration
      setIsLoading(true)
      setError('')

      try {
        if (!repositories) return
        const nextData = await loadRuleRecommendationData(repositories)

        if (isMounted && generation === loadGeneration) {
          setData(nextData)
          setSelectedBeanId((current) => current || nextData.beans[0]?.id || '')
          const defaults = recommendationDefaults(nextData.settings)
          const gear = defaults.hotPourover
          setBrewer((current) => current || gear.brewer)
          setGrinder((current) => current || gear.grinder)
          setEspressoDose((current) => current || defaults.espresso.doseGrams?.toString() || '')
        }
      } catch (err) {
        if (isMounted && generation === loadGeneration) {
          setError(err instanceof Error ? err.message : '读取推荐数据失败')
        }
      } finally {
        if (isMounted && generation === loadGeneration) {
          setIsLoading(false)
        }
      }
    }

    if (!repositories) return
    void loadData()
    const unsubscribes = [
      repositories.beans.subscribe(() => void loadData()),
      repositories.brewLogs.subscribe(() => void loadData()),
      repositories.brewTemplates.subscribe(() => void loadData()),
      repositories.userSettings.subscribe(() => void loadData()),
    ]

    return () => {
      isMounted = false
      loadGeneration += 1
      unsubscribes.forEach((unsubscribe) => unsubscribe())
    }
  }, [repositories])

  useEffect(() => {
    let isMounted = true
    let loadGeneration = 0

    async function loadSaved() {
      const generation = ++loadGeneration
      setIsLoadingSaved(true)
      setSavedError('')

      try {
        if (!recommendationRepository) return
        const rows = await recommendationRepository.listRecommendations()

        if (isMounted && generation === loadGeneration) {
          setSavedRecommendations(toSavedRecommendationCards(rows).slice(0, 5))
        }
      } catch (err) {
        if (isMounted && generation === loadGeneration) {
          setSavedError(err instanceof Error ? err.message : '读取已保存推荐失败')
        }
      } finally {
        if (isMounted && generation === loadGeneration) {
          setIsLoadingSaved(false)
        }
      }
    }

    if (!recommendationRepository) return
    void loadSaved()
    const unsubscribe = recommendationRepository.subscribe(() => void loadSaved())

    return () => {
      isMounted = false
      loadGeneration += 1
      unsubscribe()
    }
  }, [recommendationRepository])

  async function refreshSavedRecommendations() {
    if (!recommendationRepository) return
    const rows = await recommendationRepository.listRecommendations()
    setSavedRecommendations(toSavedRecommendationCards(rows).slice(0, 5))
  }

  function handleModeChange(nextMode: BrewMode) {
    const defaults = recommendationDefaults(data.settings)
    const gear = nextMode === 'hot_pourover' ? defaults.hotPourover
      : nextMode === 'iced_pourover' ? defaults.icedPourover
        : nextMode === 'cold_brew' ? defaults.coldBrew : defaults.espresso
    setMode(nextMode)
    setBrewer(gear.brewer)
    setGrinder(gear.grinder)
    if (nextMode === 'espresso') setEspressoDose(defaults.espresso.doseGrams?.toString() ?? '')
    setRuleRecommendation(null)
    setAiRecommendation(null)
    setStatus('')
    setError('')
  }

  async function handleGenerate() {
    setError('')
    setStatus('')
    setRuleRecommendation(null)
    setAiRecommendation(null)

    setIsGenerating(true)

    try {
      const targetBean = data.beans.find((bean) => bean.id === selectedBeanId)
      if (!targetBean) throw new Error('请选择咖啡豆')
      const nextRuleRecommendation = createRecommendationForContext(
        createRecommendationContext({
          targetBean,
          mode,
          variant,
          brewer,
          grinder,
          espressoDoseGrams: espressoDose.trim() ? Number(espressoDose) : null,
          tasteGoals: recommendationDefaults(data.settings).tasteGoals,
        }),
        data,
      )

      setRuleRecommendation(nextRuleRecommendation)

      if (!nextRuleRecommendation) {
        setError(mode === 'espresso' && !espressoDose.trim() ? '请先填写已确认的意式粉量。' : '还没有可用于该方式的历史参数或模板。')
        return
      }

      if (isOnline) {
        const nextAiRecommendation = await requestAiRecommendation(
          supabase,
          nextRuleRecommendation,
        )
        setAiRecommendation(nextAiRecommendation)
      } else {
        setStatus('已离线生成规则方案；联网后可再使用 DeepSeek 优化。')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成推荐失败')
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleSaveRecommendation() {
    if (!ruleRecommendation || !isOnline) {
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
        runtime.syncMode,
      )
      try {
        await runtime.run()
      } catch {
        setStatus('推荐已在线保存；本机列表会在同步恢复后刷新。')
        return
      }
      await refreshSavedRecommendations()
      setStatus('已保存为推荐记录。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存推荐失败')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleSavedAccepted(recommendation: SavedRecommendationCard) {
    if (!isOnline) return
    setSavedError('')
    setUpdatingSavedId(recommendation.id)

    try {
      await updateSavedRecommendationAccepted(supabase, recommendation.id, !recommendation.accepted, runtime.syncMode)
      try {
        await runtime.run()
      } catch {
        setSavedError('在线状态已更新；本机列表会在同步恢复后刷新。')
        return
      }
      await refreshSavedRecommendations()
    } catch (err) {
      setSavedError(err instanceof Error ? err.message : '更新推荐状态失败')
    } finally {
      setUpdatingSavedId(null)
    }
  }

  async function handleDeleteSavedRecommendation(recommendation: SavedRecommendationCard) {
    if (!isOnline) return
    const confirmed = window.confirm(`确定删除「${recommendation.targetName}」的这条推荐吗？数据会软删除。`)

    if (!confirmed) {
      return
    }

    setSavedError('')
    setUpdatingSavedId(recommendation.id)

    try {
      await softDeleteSavedRecommendation(supabase, recommendation.id, runtime.syncMode)
      try {
        await runtime.run()
      } catch {
        setSavedError('在线删除已完成；本机列表会在同步恢复后刷新。')
        return
      }
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
        <div className="recommendation-controls recommendation-controls--method">
          <div className="recommendation-controls__grid">
            <label>
              目标咖啡豆
              <select value={selectedBeanId} onChange={(event) => setSelectedBeanId(event.target.value)}>
              {data.beans.map((bean) => (
                <option key={bean.id} value={bean.id}>
                  {bean.name}
                </option>
              ))}
              </select>
            </label>
            <label>
              冲煮方式
              <select value={mode} onChange={(event) => handleModeChange(event.target.value as BrewMode)}>
                <option value="hot_pourover">热手冲</option>
                <option value="iced_pourover">冰手冲</option>
                <option value="cold_brew">冷萃</option>
                <option value="espresso">意式</option>
              </select>
            </label>
            {mode === 'cold_brew' ? (
              <label>
                冷萃类型
                <select value={variant} onChange={(event) => setVariant(event.target.value as BrewVariant)}>
                  <option value="ready_to_drink">直接饮用</option>
                  <option value="concentrate">浓缩基底</option>
                </select>
              </label>
            ) : null}
            <label>
              器具
              <input value={brewer} onChange={(event) => setBrewer(event.target.value)} placeholder="例如：V60" />
            </label>
            <label>
              磨豆机
              <input value={grinder} onChange={(event) => setGrinder(event.target.value)} placeholder="例如：C40" />
            </label>
            {mode === 'espresso' ? (
              <label>
                已确认粉量（克）
                <input type="number" min="1" max="100" step="0.1" inputMode="decimal"
                  value={espressoDose} onChange={(event) => setEspressoDose(event.target.value)} />
              </label>
            ) : null}
          </div>
          <button type="button" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? '生成中' : '生成推荐'}
          </button>
        </div>
      ) : null}

      {!isOnline ? (
        <p className="recommendation-empty" role="status">
          当前离线：仍可生成规则方案和冲煮草稿；仅跳过 DeepSeek 优化和在线状态修改。
        </p>
      ) : null}

      {aiRecommendation ? (
        <div className="recommendation-ai recommendation-ai--primary">
          <h3>DeepSeek 优化方案</h3>
          {aiRecommendation.configured && aiRecommendation.structured ? (
            <StructuredAiRecommendationView recommendation={aiRecommendation.structured} />
          ) : aiRecommendation.configured && aiRecommendation.suggestion && !aiRecommendation.error ? (
            <p>{aiRecommendation.suggestion}</p>
          ) : (
            <p>{getAiRecommendationStatusMessage(aiRecommendation)}</p>
          )}
        </div>
      ) : null}

      {ruleRecommendation ? (
        <div className="recommendation-result">
          <article className="recommendation-card">
            <p className="recommendation-card__meta">
              {`规则置信度：${ruleRecommendation.confidence} · 基础来源：${ruleRecommendation.baseSource.label}`}
            </p>
            <h3>{aiRecommendation?.structured ? '规则基础方案' : '规则方案'}</h3>
            <dl>
              <div>
                <dt>{ruleRecommendation.recommended.brewMode === 'iced_pourover' ? '粉水比（仅热水）' : '粉水比'}</dt>
                <dd>{ruleRecommendation.recommended.ratio ?? '未记录'}</dd>
              </div>
              <div>
                <dt>粉量</dt>
                <dd>{ruleRecommendation.recommended.coffeeGrams != null ? `${ruleRecommendation.recommended.coffeeGrams}g` : '未记录'}</dd>
              </div>
              {ruleRecommendation.recommended.waterGrams != null ? (
                <div>
                  <dt>{ruleRecommendation.recommended.brewMode === 'iced_pourover' ? '热水量' : '水量'}</dt>
                  <dd>{ruleRecommendation.recommended.waterGrams}g</dd>
                </div>
              ) : null}
              {ruleRecommendation.recommended.iceGrams != null ? (
                <div>
                  <dt>冰量</dt>
                  <dd>{ruleRecommendation.recommended.iceGrams}g</dd>
                </div>
              ) : null}
              {ruleRecommendation.recommended.beverageGrams != null ? (
                <div>
                  <dt>出液量</dt>
                  <dd>{ruleRecommendation.recommended.beverageGrams}g</dd>
                </div>
              ) : null}
              {ruleRecommendation.recommended.brewVariant ? (
                <div>
                  <dt>冷萃类型</dt>
                  <dd>{ruleRecommendation.recommended.brewVariant === 'concentrate' ? '浓缩基底' : '直接饮用'}</dd>
                </div>
              ) : null}
              <div>
                <dt>水温</dt>
                <dd>
                  {ruleRecommendation.recommended.waterTemperatureC
                    ? `${ruleRecommendation.recommended.waterTemperatureC}°C`
                    : '未记录'}
                </dd>
              </div>
              <div>
                <dt>研磨度</dt>
                <dd>
                  {ruleRecommendation.recommended.grindSetting ?? '未记录'}
                </dd>
              </div>
              <div>
                <dt>总时间</dt>
                <dd>
                  {ruleRecommendation.recommended.totalTimeSeconds
                    ? `${ruleRecommendation.recommended.totalTimeSeconds} 秒`
                    : '未记录'}
                </dd>
              </div>
              <div>
                <dt>器具</dt>
                <dd>
                  {[
                    ruleRecommendation.recommended.method,
                    ruleRecommendation.recommended.dripper,
                  ]
                    .filter(Boolean)
                    .join(' / ') || '未记录'}
                </dd>
              </div>
            </dl>
            <p>{ruleRecommendation.primary?.reasons.join('；') ?? '基于候选模板生成初始方案'}</p>
            <p>{ruleRecommendation.beanAdjustmentReasons.join('；')}</p>
          </article>

          <div className="recommendation-references">
            <h3>参考历史记录</h3>
            {ruleRecommendation.references.length === 0 ? <p>暂无可用历史记录，先使用模板兜底。</p> : null}
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
            <p>规则层已选择基础来源；DeepSeek 只参考摘要并在安全范围内微调。</p>
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


      {ruleRecommendation ? (
        <div className="recommendation-save">
          <div>
            <strong>使用或保存本次方案</strong>
            <p>用于本次冲煮只会填入可编辑草稿，不会自动保存。</p>
          </div>
          <button type="button" onClick={() => onUseDraft(toBrewDraft(ruleRecommendation, aiRecommendation))}>
            用于本次冲煮
          </button>
          <button type="button" onClick={handleSaveRecommendation} disabled={isSaving || !isOnline}>
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
                disabled={!isOnline || updatingSavedId === recommendation.id}
                onClick={() => handleToggleSavedAccepted(recommendation)}
              >
                {recommendation.accepted ? '取消采纳' : '标记采纳'}
              </button>
              <button
                type="button"
                className="recommendation-danger-button"
                disabled={!isOnline || updatingSavedId === recommendation.id}
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

function recommendationDefaults(settings: UserSettingsRow | null) {
  return readRecommendationDefaults(
    settings?.default_gear ?? {},
    settings?.taste_preferences ?? {},
  )
}
