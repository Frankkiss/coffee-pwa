import { useEffect, useMemo, useState } from 'react'
import type { Bean } from '../beans/beanTypes'
import { useSyncRuntime } from '../sync/SyncContext'
import { getEntitySyncBadge } from '../sync/entitySyncPresentation'
import { filterBrewLogs } from './brewFilters'
import { brewMethodOptions } from './brewMethodOptions'
import { linkMethodToMode, linkModeToMethod } from './brewMethodLinkage'
import {
  createBrewFormFromLog,
  createInitialBrewForm,
  toBrewLogUpdatePayload,
  withFallbackBeanId,
} from './brewForm'
import { BrewLogDetailPanel } from './BrewLogDetailPanel'
import type { BrewForm, BrewLog, BrewLogFilters, BrewLogUpdatePayload, BrewMode } from './brewTypes'
import './brews.css'

type BrewLogPanelProps = {
  beans: Bean[]
  brewLogs: BrewLog[]
  initialDraft?: BrewForm | null
  onDraftConsumed?: () => void
}

export function BrewLogPanel({ beans, brewLogs, initialDraft, onDraftConsumed }: BrewLogPanelProps) {
  const runtime = useSyncRuntime()
  const repository = runtime.repositories?.brewLogs ?? null
  const firstBeanId = beans[0]?.id ?? ''
  const [form, setForm] = useState<BrewForm>(() => initialDraft ? { ...initialDraft } : createInitialBrewForm(firstBeanId))
  const [filters, setFilters] = useState<BrewLogFilters>({
    query: '',
    beanId: '',
    method: '',
    pinned: 'all',
  })
  const [editingLogId, setEditingLogId] = useState<string | null>(null)
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null)
  const isLoading = repository === null
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [status, setStatus] = useState(initialDraft ? '推荐参数已填入草稿；确认或修改后再保存。' : '')
  const [error, setError] = useState('')
  useEffect(() => {
    if (initialDraft) onDraftConsumed?.()
  }, [initialDraft, onDraftConsumed])


  const beanNameById = useMemo(
    () => new Map(beans.map((bean) => [bean.id, bean.name])),
    [beans],
  )
  const filteredBrewLogs = filterBrewLogs(brewLogs, filters)
  const selectedLog = selectedLogId
    ? brewLogs.find((log) => log.id === selectedLogId) ?? null
    : null
  const formWithFallbackBean = useMemo(
    () => withFallbackBeanId(form, firstBeanId),
    [firstBeanId, form],
  )
  const availableMethods = useMemo(() => {
    const methods = new Set(brewMethodOptions)
    brewLogs.forEach((log) => {
      if (log.method) {
        methods.add(log.method)
      }
    })
    return Array.from(methods)
  }, [brewLogs])

  function accelerateSync() {
    void runtime.run().catch(() => undefined)
  }

  function updateField(field: keyof BrewForm, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function updateBrewMode(nextMode: BrewMode | '') {
    setForm((current) => {
      const linked = linkModeToMethod(nextMode, current.method)
      return {
        ...current,
        ...linked,
        brewVariant: nextMode === 'cold_brew' ? (current.brewVariant || 'ready_to_drink') : '',
        iceGrams: nextMode === 'iced_pourover' ? current.iceGrams : '',
        beverageGrams: nextMode === 'espresso' ? current.beverageGrams : '',
      }
    })
  }

  function updateMethod(nextMethod: string) {
    setForm((current) => {
      const linked = linkMethodToMode(nextMethod, current.brewMode)
      const nextMode = linked.brewMode
      return {
        ...current,
        ...linked,
        brewVariant: nextMode === 'cold_brew' ? (current.brewVariant || 'ready_to_drink') : '',
        iceGrams: nextMode === 'iced_pourover' ? current.iceGrams : '',
        beverageGrams: nextMode === 'espresso' ? current.beverageGrams : '',
      }
    })
  }

  function updateFilter(field: keyof BrewLogFilters, value: string) {
    setFilters((current) => ({ ...current, [field]: value }))
  }

  function handleEdit(log: BrewLog) {
    setError('')
    setStatus('')
    setSelectedLogId(null)
    setEditingLogId(log.id)
    setForm(createBrewFormFromLog(log))
  }

  function handleCancelEdit() {
    setEditingLogId(null)
    setForm(createInitialBrewForm(firstBeanId))
    setStatus('')
    setError('')
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setStatus('')
    setIsSaving(true)

    try {
      if (!repository) throw new Error('本地冲煮记录仍在初始化，请稍后再试。')
      const payload = toBrewLogUpdatePayload(formWithFallbackBean)
      if (editingLogId) {
        const current = brewLogs.find((log) => log.id === editingLogId)
        if (!current) throw new Error('找不到要编辑的冲煮记录。')
        await repository.updateBrewLog(editingLogId, {
          ...payload,
          brewed_at: current.brewed_at,
        })
        setEditingLogId(null)
        setStatus('冲煮记录已更新，正在等待同步。')
      } else {
        await repository.createBrewLog({ ...payload, brewed_at: new Date().toISOString() })
        setStatus('冲煮记录已保存，正在等待同步。')
      }
      setForm(createInitialBrewForm(formWithFallbackBean.beanId))
      accelerateSync()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存冲煮记录失败')
    } finally {
      setIsSaving(false)
    }
  }
  async function handleDelete(log: BrewLog) {
    const beanName = log.bean_id ? beanNameById.get(log.bean_id) : ''
    const confirmed = window.confirm(
      `确定删除这条${beanName ? `「${beanName}」` : ''}冲煮记录吗？数据会软删除，不会物理抹掉。`,
    )

    if (!confirmed) {
      return
    }

    setError('')
    setStatus('')
    setIsDeleting(true)

    try {
      if (!repository) throw new Error('本地冲煮记录仍在初始化，请稍后再试。')
      await repository.deleteBrewLog(log.id)

      if (selectedLogId === log.id) {
        setSelectedLogId(null)
      }

      if (editingLogId === log.id) {
        handleCancelEdit()
      }

      setStatus('冲煮记录已删除，正在等待同步。')
      accelerateSync()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除冲煮记录失败')
    } finally {
      setIsDeleting(false)
    }
  }
  async function handleTogglePinned(log: BrewLog) {
    if (!log.bean_id) {
      setError('这条冲煮记录没有绑定咖啡豆，暂时不能设为候选方案。')
      return
    }

    const payload = createBrewLogPayloadFromRow(log, !log.is_pinned_recipe)
    setError('')
    setStatus('')
    setIsSaving(true)

    try {
      if (!repository) throw new Error('本地冲煮记录仍在初始化，请稍后再试。')
      const updatedLog = await repository.updateBrewLog(log.id, {
        ...payload,
        brewed_at: log.brewed_at,
      })
      setStatus(updatedLog.is_pinned_recipe ? '已设为候选方案，正在等待同步。' : '已取消候选方案，正在等待同步。')
      accelerateSync()
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新候选方案状态失败')
    } finally {
      setIsSaving(false)
    }
  }
  return (
    <section id="brew-log" className="brew-panel" aria-labelledby="brew-panel-title">
      <div className="brew-panel__header">
        <div>
          <p className="brew-panel__eyebrow">Brew Log</p>
          <h2 id="brew-panel-title">冲煮记录</h2>
        </div>
        <span>{brewLogs.length} 条记录</span>
      </div>

      {beans.length === 0 ? (
        <p className="brew-empty">先保存一支咖啡豆，再记录冲煮。</p>
      ) : (
        <form className="brew-form" onSubmit={handleSubmit}>
          {editingLogId ? (
            <div className="brew-editing-banner">
              <strong>正在编辑冲煮记录</strong>
              <button type="button" onClick={handleCancelEdit}>
                取消编辑
              </button>
            </div>
          ) : null}

          <div className="brew-form__grid">
            <label>
              咖啡豆
              <select
                value={formWithFallbackBean.beanId}
                onChange={(event) => updateField('beanId', event.target.value)}
                required
              >
                {beans.map((bean) => (
                  <option key={bean.id} value={bean.id}>
                    {bean.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              冲煮类型
              <select value={form.brewMode} onChange={(event) => updateBrewMode(event.target.value as BrewMode | '')}>
                <option value="">未选择</option>
                <option value="hot_pourover">热手冲</option>
                <option value="iced_pourover">冰手冲</option>
                <option value="cold_brew">冷萃</option>
                <option value="espresso">意式</option>
              </select>
            </label>
            {form.brewMode === 'cold_brew' ? (
              <label>
                冷萃类型
                <select value={form.brewVariant} onChange={(event) => updateField('brewVariant', event.target.value)}>
                  <option value="ready_to_drink">直接饮用</option>
                  <option value="concentrate">浓缩基底</option>
                </select>
              </label>
            ) : null}

            <label>
              具体方法
              <select
                value={form.method}
                onChange={(event) => updateMethod(event.target.value)}
              >
                <option value="">未选择</option>
                {Array.from(new Set([...brewMethodOptions, form.method].filter(Boolean))).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label>
              器具
              <input
                value={form.dripper}
                onChange={(event) => updateField('dripper', event.target.value)}
                placeholder="例如：V60"
              />
            </label>

            <label>
              磨豆机
              <input
                value={form.grinder}
                onChange={(event) => updateField('grinder', event.target.value)}
                placeholder="例如：C40"
              />
            </label>

            <label>
              研磨度
              <input
                value={form.grindSetting}
                onChange={(event) => updateField('grindSetting', event.target.value)}
                placeholder="例如：22 clicks"
              />
            </label>

            <label>
              粉量
              <input
                inputMode="decimal"
                value={form.coffeeGrams}
                onChange={(event) => updateField('coffeeGrams', event.target.value)}
                placeholder="克"
              />
            </label>

            {form.brewMode !== 'espresso' ? (
              <label>
                {form.brewMode === 'iced_pourover' ? '热水量' : '水量'}
                <input inputMode="decimal" value={form.waterGrams}
                  onChange={(event) => updateField('waterGrams', event.target.value)} placeholder="克" />
              </label>
            ) : null}
            {form.brewMode === 'iced_pourover' ? (
              <label>
                冰量
                <input inputMode="decimal" value={form.iceGrams}
                  onChange={(event) => updateField('iceGrams', event.target.value)} placeholder="克" />
              </label>
            ) : null}
            {form.brewMode === 'espresso' ? (
              <label>
                出液量
                <input inputMode="decimal" value={form.beverageGrams}
                  onChange={(event) => updateField('beverageGrams', event.target.value)} placeholder="克" />
              </label>
            ) : null}

            <label>
              水温
              <input
                inputMode="decimal"
                value={form.waterTemperatureC}
                onChange={(event) => updateField('waterTemperatureC', event.target.value)}
                placeholder="摄氏度"
              />
            </label>

            <label>
              总时间
              <input
                inputMode="numeric"
                value={form.totalTimeSeconds}
                onChange={(event) => updateField('totalTimeSeconds', event.target.value)}
                placeholder="秒"
              />
            </label>

            <label>
              评分
              <input
                inputMode="decimal"
                value={form.rating}
                onChange={(event) => updateField('rating', event.target.value)}
                placeholder="1-5"
              />
            </label>
          </div>

          <label>
            风味标签
            <input
              value={form.flavorTags}
              onChange={(event) => updateField('flavorTags', event.target.value)}
              placeholder="柑橘, 花香, 蜂蜜"
            />
          </label>

          <label>
            备注
            <textarea
              value={form.notes}
              onChange={(event) => updateField('notes', event.target.value)}
              placeholder="这杯的口感、问题和下次调整"
              rows={3}
            />
          </label>

          <label className="brew-form__checkbox">
            <input
              type="checkbox"
              checked={form.isPinnedRecipe}
              onChange={(event) => updateField('isPinnedRecipe', event.target.checked)}
            />
            设为这支豆子的候选推荐方案
          </label>

          <div className="brew-form__actions">
            <button type="submit" disabled={isSaving}>
              {isSaving ? '保存中' : editingLogId ? '更新冲煮记录' : '保存冲煮记录'}
            </button>
            {editingLogId ? (
              <button type="button" className="brew-secondary-button" onClick={handleCancelEdit}>
                取消
              </button>
            ) : null}
          </div>
        </form>
      )}

      {status ? <p className="brew-status">{status}</p> : null}
      {error ? <p className="brew-error">{error}</p> : null}

      {selectedLog ? (
        <BrewLogDetailPanel
          log={selectedLog}
          beanName={selectedLog.bean_id ? beanNameById.get(selectedLog.bean_id) ?? '未知咖啡豆' : ''}
          isDeleting={isDeleting}
          isSaving={isSaving}
          onBack={() => setSelectedLogId(null)}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onTogglePinned={handleTogglePinned}
        />
      ) : (
        <>
      <div className="brew-filters" aria-label="冲煮记录筛选">
        <label>
          搜索
          <input
            value={filters.query}
            onChange={(event) => updateFilter('query', event.target.value)}
            placeholder="方式、器具、研磨度、风味、备注"
          />
        </label>
        <label>
          咖啡豆
          <select
            value={filters.beanId}
            onChange={(event) => updateFilter('beanId', event.target.value)}
          >
            <option value="">全部</option>
            {beans.map((bean) => (
              <option key={bean.id} value={bean.id}>
                {bean.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          方式
          <select
            value={filters.method}
            onChange={(event) => updateFilter('method', event.target.value)}
          >
            <option value="">全部</option>
            {availableMethods.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </label>
        <label>
          推荐方案
          <select
            value={filters.pinned}
            onChange={(event) => updateFilter('pinned', event.target.value)}
          >
            <option value="all">全部</option>
            <option value="pinned">仅候选方案</option>
            <option value="unpinned">非候选方案</option>
          </select>
        </label>
      </div>

      <div className="brew-list" aria-live="polite">
        {isLoading ? <p className="brew-empty">正在读取冲煮记录...</p> : null}
        {!isLoading && brewLogs.length === 0 ? (
          <p className="brew-empty">还没有冲煮记录。</p>
        ) : null}
        {!isLoading && brewLogs.length > 0 && filteredBrewLogs.length === 0 ? (
          <p className="brew-empty">没有匹配的冲煮记录。</p>
        ) : null}
        {filteredBrewLogs.map((log) => (
          <article className="brew-card" key={log.id}>
            <div className="brew-card__main">
              <div>
                <h3>{log.bean_id ? beanNameById.get(log.bean_id) ?? '未知咖啡豆' : '未绑定豆子'}</h3>
                <p>{formatBrewSummary(log)}</p>
                {getEntitySyncBadge(runtime.statusByEntityId[log.id]) ? (
                  <span className="entity-sync-badge">
                    {getEntitySyncBadge(runtime.statusByEntityId[log.id])}
                  </span>
                ) : null}
              </div>
              {log.rating ? (
                <strong className="brew-card__rating" aria-label={`评分 ${log.rating}/5`}>
                  <span>{log.rating}</span>
                  <small>/5</small>
                </strong>
              ) : null}
            </div>

            {log.flavor_tags.length > 0 ? (
              <div className="brew-tags">
                {log.flavor_tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            ) : null}

            {log.notes ? <p className="brew-card__notes">{log.notes}</p> : null}

            <div className="brew-card__actions">
              <button type="button" onClick={() => setSelectedLogId(log.id)}>
                详情
              </button>
              <button type="button" onClick={() => handleEdit(log)}>
                编辑
              </button>
              <button
                type="button"
                className="brew-danger-button"
                disabled={isDeleting}
                onClick={() => handleDelete(log)}
              >
                删除
              </button>
            </div>
          </article>
        ))}
      </div>
        </>
      )}
    </section>
  )
}

function formatBrewSummary(log: BrewLog) {
  return (
    [
      log.method,
      log.ratio,
      log.water_temperature_c ? `${log.water_temperature_c}°C` : null,
      log.total_time_seconds ? `${log.total_time_seconds}s` : null,
      log.grind_setting,
    ]
      .filter(Boolean)
      .join(' / ') || '参数待补充'
  )
}

function createBrewLogPayloadFromRow(
  log: BrewLog,
  isPinnedRecipe: boolean,
): BrewLogUpdatePayload {
  if (!log.bean_id) {
    throw new Error('这条冲煮记录没有绑定咖啡豆。')
  }

  return {
    bean_id: log.bean_id,
    method: log.method,
    dripper: log.dripper,
    filter_paper: log.filter_paper,
    grinder: log.grinder,
    grind_setting: log.grind_setting,
    coffee_grams: log.coffee_grams,
    water_grams: log.water_grams,
    ratio: log.ratio,
    water_temperature_c: log.water_temperature_c,
    total_time_seconds: log.total_time_seconds,
    pour_steps: log.pour_steps,
    rating: log.rating,
    acidity: log.acidity,
    sweetness: log.sweetness,
    bitterness: log.bitterness,
    astringency: log.astringency,
    body: log.body,
    aftertaste: log.aftertaste,
    flavor_tags: log.flavor_tags,
    is_pinned_recipe: isPinnedRecipe,
    notes: log.notes,
  }
}
