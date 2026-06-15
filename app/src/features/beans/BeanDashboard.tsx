import { useEffect, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { BrewLogPanel } from '../brews/BrewLogPanel'
import {
  buildOfflineCacheSnapshot,
  readOfflineCache,
  writeOfflineCache,
} from '../offline/offlineCache'
import { SourceImportPanel } from '../sourceImports/SourceImportPanel'
import { filterBeans } from './beanFilters'
import {
  createBeanFormFromBean,
  createInitialBeanForm,
  toBeanInsertPayload,
  toBeanUpdatePayload,
} from './beanForm'
import { createBean, listBeans, softDeleteBean, updateBean } from './beanService'
import type { Bean, BeanFilters, BeanForm } from './beanTypes'
import './beans.css'

type BeanDashboardProps = {
  session: Session
  supabase: SupabaseClient
}

const processOptions = ['水洗', '日晒', '蜜处理', '厌氧', '特殊处理']
const roastOptions = ['浅烘', '中浅烘', '中烘', '中深烘', '深烘']

export function BeanDashboard({ session, supabase }: BeanDashboardProps) {
  const [beans, setBeans] = useState<Bean[]>([])
  const [form, setForm] = useState<BeanForm>(() => createInitialBeanForm())
  const [filters, setFilters] = useState<BeanFilters>({
    search: '',
    process: '',
    roastLevel: '',
  })
  const [editingBeanId, setEditingBeanId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const filteredBeans = filterBeans(beans, filters)

  useEffect(() => {
    let isMounted = true

    async function loadBeans() {
      setIsLoading(true)
      setError('')

      try {
        const nextBeans = await listBeans(supabase)
        if (isMounted) {
          setBeans(nextBeans)
          setStatus('')
        }
        await writeOfflineCache(
          'beans',
          buildOfflineCacheSnapshot(nextBeans, session.user.id, new Date()),
        )
      } catch (err) {
        const cachedBeans = await readOfflineCache<Bean>('beans', session.user.id)

        if (isMounted) {
          if (cachedBeans) {
            setBeans(cachedBeans)
            setStatus('正在显示本机缓存的豆仓数据，新增和编辑仍需要联网。')
          } else {
            setError(err instanceof Error ? err.message : '读取豆仓失败')
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadBeans()

    return () => {
      isMounted = false
    }
  }, [session.user.id, supabase])

  function updateField<K extends keyof BeanForm>(field: K, value: BeanForm[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function updateFilter(field: keyof BeanFilters, value: string) {
    setFilters((current) => ({ ...current, [field]: value }))
  }

  function handleEdit(bean: Bean) {
    setError('')
    setStatus('')
    setEditingBeanId(bean.id)
    setForm(createBeanFormFromBean(bean))
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
      if (editingBeanId) {
        const payload = toBeanUpdatePayload(form)
        const bean = await updateBean(supabase, editingBeanId, payload)
        setBeans((current) =>
          current.map((currentBean) => (currentBean.id === bean.id ? bean : currentBean)),
        )
        setEditingBeanId(null)
        setStatus('咖啡豆已更新。')
      } else {
        const payload = toBeanInsertPayload(form, session.user.id)
        const bean = await createBean(supabase, payload)
        setBeans((current) => [bean, ...current])
        setStatus('咖啡豆已保存到云端。')
      }

      setForm(createInitialBeanForm())
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
      await softDeleteBean(supabase, bean.id)
      setBeans((current) => current.filter((currentBean) => currentBean.id !== bean.id))

      if (editingBeanId === bean.id) {
        handleCancelEdit()
      }

      setStatus('咖啡豆已删除。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除咖啡豆失败')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <section id="bean-dashboard" className="bean-dashboard" aria-labelledby="bean-dashboard-title">
        <div className="bean-dashboard__header">
          <div>
            <p className="bean-dashboard__eyebrow">Bean Vault</p>
            <h2 id="bean-dashboard-title">数字豆仓</h2>
          </div>
          <span>{beans.length} 支豆子</span>
        </div>

        <SourceImportPanel
          session={session}
          supabase={supabase}
          onBeanCreated={(bean) => setBeans((current) => [bean, ...current])}
        />

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
                  updateField('beanType', event.target.value === 'blend' ? 'blend' : 'single_origin')
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
              placeholder={form.beanType === 'blend' ? '例如：巴西 / 埃塞俄比亚' : '例如：Ethiopia'}
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
                {processOptions.map((option) => (
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
              placeholder={form.beanType === 'blend' ? '例如：黄波旁 / 原生种' : '例如：Heirloom'}
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
              {roastOptions.map((option) => (
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

          <label>
            净含量
            <input
              inputMode="decimal"
              value={form.netWeightGrams}
              onChange={(event) => updateField('netWeightGrams', event.target.value)}
              placeholder="克"
            />
          </label>

          <label>
            剩余量
            <input
              inputMode="decimal"
              value={form.remainingGrams}
              onChange={(event) => updateField('remainingGrams', event.target.value)}
              placeholder="克"
            />
          </label>
          </div>

          {form.beanType === 'blend' ? (
            <label>
              拼配说明
              <textarea
                value={form.blendComponentsText}
                onChange={(event) => updateField('blendComponentsText', event.target.value)}
                placeholder={'可写比例，也可以不写比例。例如：\n巴西 日晒 黄波旁，提供坚果和甜感\n埃塞俄比亚 水洗 原生种，提供花香和柑橘'}
                rows={4}
              />
            </label>
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

        {status ? <p className="bean-status">{status}</p> : null}
        {error ? <p className="bean-error">{error}</p> : null}

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
              {processOptions.map((option) => (
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
              {roastOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="bean-list" aria-live="polite">
          {isLoading ? <p className="bean-empty">正在读取豆仓...</p> : null}
          {!isLoading && beans.length === 0 ? (
            <p className="bean-empty">还没有咖啡豆。先保存第一支豆子。</p>
          ) : null}
          {!isLoading && beans.length > 0 && filteredBeans.length === 0 ? (
            <p className="bean-empty">没有匹配的咖啡豆。</p>
          ) : null}
          {filteredBeans.map((bean) => (
            <article className="bean-card" key={bean.id}>
              <div>
                <h3>{bean.name}</h3>
                <p>
                  {[bean.origin, bean.process, bean.roast_level].filter(Boolean).join(' / ') ||
                    '信息待补充'}
                </p>
              </div>
              {bean.flavor_tags.length > 0 ? (
                <div className="bean-tags">
                  {bean.flavor_tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              ) : null}
              <div className="bean-card__actions">
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
      </section>

      <BrewLogPanel beans={beans} session={session} supabase={supabase} />
    </>
  )
}
