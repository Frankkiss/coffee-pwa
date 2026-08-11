import { useEffect, useState, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { BrewLog } from '../brews/brewTypes'
import { BrewLogPanel } from '../brews/BrewLogPanel'
import { SourceImportPanel } from '../sourceImports/SourceImportPanel'
import { useOptionalSyncRuntime } from '../sync/SyncContext'
import { filterBrewLogsForBean, getEntitySyncBadge } from '../sync/entitySyncPresentation'
import { filterBeans } from './beanFilters'
import {
  createBeanFormFromBean,
  createInitialBeanForm,
  toBeanUpdatePayload,
} from './beanForm'
import { BeanDetailPanel } from './BeanDetailPanel'
import { BlendComponentEditor } from './BlendComponentEditor'
import { PROCESS_OPTIONS, ROAST_LEVEL_OPTIONS } from './beanOptions'
import type { Bean, BeanFilters, BeanForm } from './beanTypes'
import './beans.css'

type BeanDashboardProps = {
  session: Session
  supabase: SupabaseClient
  previewRows?: {
    beans: Bean[]
    brewLogs: BrewLog[]
  }
}
type BeanSectionKey = 'sourceImport' | 'beanForm' | 'beanList' | 'brewLogs'

export function BeanDashboard({ session, supabase, previewRows }: BeanDashboardProps) {
  const isPreview = Boolean(previewRows)
  const runtime = useOptionalSyncRuntime()
  const beanRepository = runtime?.repositories?.beans ?? null
  const brewLogRepository = runtime?.repositories?.brewLogs ?? null
  const [beans, setBeans] = useState<Bean[]>(() => previewRows?.beans ?? [])
  const [brewLogs, setBrewLogs] = useState<BrewLog[]>(() => previewRows?.brewLogs ?? [])
  const [form, setForm] = useState<BeanForm>(() => createInitialBeanForm())
  const [filters, setFilters] = useState<BeanFilters>({
    search: '',
    process: '',
    roastLevel: '',
  })
  const [editingBeanId, setEditingBeanId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(!previewRows)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [status, setStatus] = useState(
    previewRows ? '本地数字豆仓预览，不连接 Supabase。' : '',
  )
  const [error, setError] = useState('')
  const [selectedBeanId, setSelectedBeanId] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<BeanSectionKey, boolean>>({
    sourceImport: false,
    beanForm: false,
    beanList: true,
    brewLogs: false,
  })
  const filteredBeans = filterBeans(beans, filters)
  const selectedBean = selectedBeanId
    ? beans.find((bean) => bean.id === selectedBeanId) ?? null
    : null

  useEffect(() => {
    if (!beanRepository) return
    let current = true
    let loadGeneration = 0
    const loadBeans = async () => {
      const generation = ++loadGeneration
      setIsLoading(true)
      try {
        const nextBeans = await beanRepository.listBeans()
        if (current && generation === loadGeneration) setBeans(nextBeans)
      } catch (err) {
        if (current && generation === loadGeneration) {
          setError(err instanceof Error ? err.message : '读取豆仓失败')
        }
      } finally {
        if (current && generation === loadGeneration) setIsLoading(false)
      }
    }
    void loadBeans()
    const unsubscribe = beanRepository.subscribe(() => void loadBeans())
    return () => {
      current = false
      loadGeneration += 1
      unsubscribe()
    }
  }, [beanRepository])

  useEffect(() => {
    if (!brewLogRepository) return
    let current = true
    let loadGeneration = 0
    const loadBrewLogs = async () => {
      const generation = ++loadGeneration
      try {
        const logs = await brewLogRepository.listBrewLogs()
        if (current && generation === loadGeneration) setBrewLogs(logs)
      } catch (err) {
        if (current && generation === loadGeneration) {
          setError(err instanceof Error ? err.message : '读取冲煮记录失败')
        }
      }
    }
    void loadBrewLogs()
    const unsubscribe = brewLogRepository.subscribe(() => void loadBrewLogs())
    return () => {
      current = false
      loadGeneration += 1
      unsubscribe()
    }
  }, [brewLogRepository])

  function accelerateSync() {
    if (runtime) void runtime.run().catch(() => undefined)
  }
  function updateField<K extends keyof BeanForm>(field: K, value: BeanForm[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function updateFilter(field: keyof BeanFilters, value: string) {
    setFilters((current) => ({ ...current, [field]: value }))
  }

  function handleEdit(bean: Bean) {
    setError('')
    setStatus('')
    setSelectedBeanId(null)
    setEditingBeanId(bean.id)
    setForm(createBeanFormFromBean(bean))
    setExpandedSections((current) => ({ ...current, beanForm: true }))
  }

  function handleCancelEdit() {
    setEditingBeanId(null)
    setForm(createInitialBeanForm())
    setStatus('')
    setError('')
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setStatus('')
    setIsSaving(true)

    try {
      if (!beanRepository) throw new Error('本地豆仓仍在初始化，请稍后再试。')
      const payload = toBeanUpdatePayload(form)
      if (editingBeanId) {
        await beanRepository.updateBean(editingBeanId, payload)
        setEditingBeanId(null)
        setStatus('咖啡豆已更新，正在等待同步。')
      } else {
        await beanRepository.createBean(payload)
        setStatus('咖啡豆已保存，正在等待同步。')
      }
      setForm(createInitialBeanForm())
      accelerateSync()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存咖啡豆失败')
    } finally {
      setIsSaving(false)
    }
  }
  async function handleDelete(bean: Bean) {
    const confirmed = window.confirm(`确定删除「${bean.name}」吗？数据会软删除，不会物理抹掉。`)

    if (!confirmed) {
      return
    }

    setError('')
    setStatus('')
    setIsDeleting(true)

    try {
      if (!beanRepository) throw new Error('本地豆仓仍在初始化，请稍后再试。')
      await beanRepository.deleteBean(bean.id)
      if (selectedBeanId === bean.id) {
        setSelectedBeanId(null)
      }

      if (editingBeanId === bean.id) {
        handleCancelEdit()
      }

      setStatus('咖啡豆已删除，正在等待同步。')
      accelerateSync()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除咖啡豆失败')
    } finally {
      setIsDeleting(false)
    }
  }
  function toggleSection(section: BeanSectionKey) {
    setExpandedSections((current) => ({
      ...current,
      [section]: !current[section],
    }))
  }

  return (
    <section id="bean-dashboard" className="bean-dashboard" aria-labelledby="bean-dashboard-title">
      <div className="bean-dashboard__header">
        <div>
          <p className="bean-dashboard__eyebrow">Bean Vault</p>
          <h2 id="bean-dashboard-title">数字豆仓</h2>
        </div>
        <span>{beans.length} 支豆子</span>
      </div>

      {selectedBean ? (
        <BeanDetailPanel
          bean={selectedBean}
          brewLogs={filterBrewLogsForBean(brewLogs, selectedBean.id)}
          isBrewSummaryStale={false}
          onBack={() => setSelectedBeanId(null)}
          onEdit={handleEdit}
        />
      ) : (
        <>
          <CollapsibleSection
            isOpen={expandedSections.sourceImport}
            title="来源导入"
            onToggle={() => toggleSection('sourceImport')}
          >
            {isPreview ? (
              <p className="bean-preview-note">本地预览模式不连接 Supabase，来源导入仅在正式登录后可用。</p>
            ) : (
              <SourceImportPanel
                session={session}
                supabase={supabase}
                onBeanCreated={(bean) => {
                  void bean
                  setExpandedSections((current) => ({ ...current, beanList: true }))
                  accelerateSync()
                }}
              />
            )}
          </CollapsibleSection>

          <CollapsibleSection
            isOpen={expandedSections.beanForm}
            title={editingBeanId ? '编辑豆子' : '手动加豆'}
            onToggle={() => toggleSection('beanForm')}
          >
            <form className="bean-form" onSubmit={handleSubmit}>
              {editingBeanId ? (
                <div className="bean-editing-banner">
                  <strong>正在编辑咖啡豆</strong>
                  <button type="button" onClick={handleCancelEdit}>
                    取消编辑
                  </button>
                </div>
              ) : null}

              <div className="bean-form__grid">
                <label>
                  豆子类型
                  <select
                    value={form.beanType}
                    onChange={(event) =>
                      updateField(
                        'beanType',
                        event.target.value === 'blend' ? 'blend' : 'single_origin',
                      )
                    }
                  >
                    <option value="single_origin">单一产区 / SOE</option>
                    <option value="blend">拼配豆</option>
                  </select>
                </label>

                <label>
                  名称
                  <input
                    value={form.name}
                    onChange={(event) => updateField('name', event.target.value)}
                    placeholder="例如：埃塞俄比亚 耶加雪菲"
                    required
                  />
                </label>

                <label>
                  烘焙商
                  <input
                    value={form.roaster}
                    onChange={(event) => updateField('roaster', event.target.value)}
                    placeholder="例如：某某咖啡"
                  />
                </label>

                <label>
                  {form.beanType === 'blend' ? '产地（可多个）' : '产地'}
                  <input
                    value={form.origin}
                    onChange={(event) => updateField('origin', event.target.value)}
                    placeholder={
                      form.beanType === 'blend' ? '例如：巴西 / 埃塞俄比亚' : '例如：Ethiopia'
                    }
                  />
                </label>

                <label>
                  庄园 / 处理站
                  <input
                    value={form.farmOrStation}
                    onChange={(event) => updateField('farmOrStation', event.target.value)}
                    placeholder="例如：Aricha"
                  />
                </label>

                <label>
                  {form.beanType === 'blend' ? '处理法（可多个）' : '处理法'}
                  {form.beanType === 'blend' ? (
                    <input
                      value={form.process}
                      onChange={(event) => updateField('process', event.target.value)}
                      placeholder="例如：日晒 / 水洗"
                    />
                  ) : (
                    <select
                      value={form.process}
                      onChange={(event) => updateField('process', event.target.value)}
                    >
                      <option value="">未选择</option>
                      {PROCESS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  )}
                </label>

                <label>
                  {form.beanType === 'blend' ? '品种（可多个）' : '品种'}
                  <input
                    value={form.variety}
                    onChange={(event) => updateField('variety', event.target.value)}
                    placeholder={
                      form.beanType === 'blend' ? '例如：黄波旁 / 原生种' : '例如：Heirloom'
                    }
                  />
                </label>

                <label>
                  海拔
                  <input
                    inputMode="numeric"
                    value={form.altitudeMeters}
                    onChange={(event) => updateField('altitudeMeters', event.target.value)}
                    placeholder="例如：1950"
                  />
                </label>

                <label>
                  烘焙日期
                  <input
                    type="date"
                    value={form.roastDate}
                    onChange={(event) => updateField('roastDate', event.target.value)}
                  />
                </label>

                <label>
                  烘焙度
                  <select
                    value={form.roastLevel}
                    onChange={(event) => updateField('roastLevel', event.target.value)}
                  >
                    <option value="">未选择</option>
                    {ROAST_LEVEL_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  风味标签
                  <input
                    value={form.flavorTags}
                    onChange={(event) => updateField('flavorTags', event.target.value)}
                    placeholder="柑橘, 茉莉, 蜂蜜"
                  />
                </label>

              </div>

              {form.beanType === 'blend' ? (
                <>
                  <BlendComponentEditor
                    components={form.blendComponents}
                    onChange={(components) => updateField('blendComponents', components)}
                  />
                  <label>
                    拼配说明
                    <textarea
                      value={form.blendNotes}
                      onChange={(event) => updateField('blendNotes', event.target.value)}
                      placeholder="例如：整体坚果、奶油、柑橘调，适合冰手冲或奶咖。"
                      rows={3}
                    />
                  </label>
                </>
              ) : null}

              <label>
                备注
                <textarea
                  value={form.notes}
                  onChange={(event) => updateField('notes', event.target.value)}
                  placeholder="购买信息、豆袋描述、个人印象"
                  rows={3}
                />
              </label>

              <div className="bean-form__actions">
                <button type="submit" disabled={isSaving}>
                  {isSaving ? '保存中' : editingBeanId ? '更新咖啡豆' : '保存咖啡豆'}
                </button>
                {editingBeanId ? (
                  <button type="button" className="bean-secondary-button" onClick={handleCancelEdit}>
                    取消
                  </button>
                ) : null}
              </div>
            </form>
          </CollapsibleSection>

          {status ? <p className="bean-status">{status}</p> : null}
          {error ? <p className="bean-error">{error}</p> : null}

          <CollapsibleSection
            isOpen={expandedSections.beanList}
            title="豆子清单"
            onToggle={() => toggleSection('beanList')}
          >
            <div className="bean-filters" aria-label="豆仓筛选">
              <label>
                搜索
                <input
                  value={filters.search}
                  onChange={(event) => updateFilter('search', event.target.value)}
                  placeholder="名称、烘焙商、产地、处理站"
                />
              </label>
              <label>
                处理法
                <select
                  value={filters.process}
                  onChange={(event) => updateFilter('process', event.target.value)}
                >
                  <option value="">全部</option>
                  {PROCESS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                烘焙度
                <select
                  value={filters.roastLevel}
                  onChange={(event) => updateFilter('roastLevel', event.target.value)}
                >
                  <option value="">全部</option>
                  {ROAST_LEVEL_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="bean-list" aria-live="polite">
              {isLoading ? <p className="bean-empty">读取豆仓...</p> : null}
              {!isLoading && beans.length === 0 ? (
                <p className="bean-empty">先保存第一支豆子。</p>
              ) : null}
              {!isLoading && beans.length > 0 && filteredBeans.length === 0 ? (
                <p className="bean-empty">没有匹配的咖啡豆。</p>
              ) : null}
              {filteredBeans.map((bean) => (
                <article className="bean-card bean-card--ledger" key={bean.id}>
                  <div className="bean-card__heading">
                    <div className="bean-card__title">
                      <h3>{bean.name}</h3>
                      <p>
                        {[bean.origin, bean.process, bean.roaster].filter(Boolean).join(' / ') ||
                          '信息待补充'}
                      </p>
                    </div>
                    <div className="bean-card__badges">
                      <span className="bean-card__badge">
                        {bean.roast_level || (bean.bean_type === 'blend' ? '拼配' : '单品')}
                      </span>
                      {getEntitySyncBadge(runtime?.statusByEntityId[bean.id]) ? (
                        <span className="entity-sync-badge">
                          {getEntitySyncBadge(runtime?.statusByEntityId[bean.id])}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {bean.flavor_tags.length > 0 ? (
                    <div className="bean-tags">
                      {bean.flavor_tags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  ) : null}
                  <div className="bean-card__actions">
                    <button
                      type="button"
                      className="bean-card__primary-action"
                      onClick={() => setSelectedBeanId(bean.id)}
                    >
                      详情
                    </button>
                    <button type="button" onClick={() => handleEdit(bean)}>
                      编辑
                    </button>
                    <button
                      type="button"
                      className="bean-danger-button"
                      disabled={isDeleting}
                      onClick={() => handleDelete(bean)}
                    >
                      删除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            isOpen={expandedSections.brewLogs}
            title="冲煮记录"
            onToggle={() => toggleSection('brewLogs')}
          >
            {isPreview ? (
              <p className="bean-preview-note">本地预览模式只展示豆仓外观，冲煮记录请在正式登录后查看。</p>
            ) : (
              <BrewLogPanel
                beans={beans}
                brewLogs={brewLogs}
              />
            )}
          </CollapsibleSection>
        </>
      )}
    </section>
  )
}
type CollapsibleSectionProps = {
  children: ReactNode
  isOpen: boolean
  title: string
  onToggle: () => void
}

function CollapsibleSection({
  children,
  isOpen,
  title,
  onToggle,
}: CollapsibleSectionProps) {
  return (
    <section className={`bean-section${isOpen ? ' bean-section--open' : ''}`}>
      <button
        type="button"
        className="bean-section__summary"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <span>
          <strong>{title}</strong>
        </span>
        <em aria-hidden="true">{isOpen ? '收起' : '展开'}</em>
      </button>
      {isOpen ? <div className="bean-section__content">{children}</div> : null}
    </section>
  )
}
