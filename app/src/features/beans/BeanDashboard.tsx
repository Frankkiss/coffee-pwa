import { useEffect, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { createInitialBeanForm, toBeanInsertPayload } from './beanForm'
import { createBean, listBeans } from './beanService'
import type { Bean, BeanForm } from './beanTypes'
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
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadBeans() {
      setIsLoading(true)
      setError('')

      try {
        const nextBeans = await listBeans(supabase)
        if (isMounted) {
          setBeans(nextBeans)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : '读取豆仓失败')
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
  }, [supabase])

  function updateField(field: keyof BeanForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setStatus('')
    setIsSaving(true)

    try {
      const payload = toBeanInsertPayload(form, session.user.id)
      const bean = await createBean(supabase, payload)
      setBeans((current) => [bean, ...current])
      setForm(createInitialBeanForm())
      setStatus('咖啡豆已保存到云端。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存咖啡豆失败')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="bean-dashboard" aria-labelledby="bean-dashboard-title">
      <div className="bean-dashboard__header">
        <div>
          <p className="bean-dashboard__eyebrow">Bean Vault</p>
          <h2 id="bean-dashboard-title">数字豆仓</h2>
        </div>
        <span>{beans.length} 支豆子</span>
      </div>

      <form className="bean-form" onSubmit={handleSubmit}>
        <div className="bean-form__grid">
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
            产地
            <input
              value={form.origin}
              onChange={(event) => updateField('origin', event.target.value)}
              placeholder="例如：Ethiopia"
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
            处理法
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
          </label>

          <label>
            品种
            <input
              value={form.variety}
              onChange={(event) => updateField('variety', event.target.value)}
              placeholder="例如：Heirloom"
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

        <label>
          备注
          <textarea
            value={form.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            placeholder="购买信息、豆袋描述、个人印象"
            rows={3}
          />
        </label>

        <button type="submit" disabled={isSaving}>
          {isSaving ? '保存中' : '保存咖啡豆'}
        </button>
      </form>

      {status ? <p className="bean-status">{status}</p> : null}
      {error ? <p className="bean-error">{error}</p> : null}

      <div className="bean-list" aria-live="polite">
        {isLoading ? <p className="bean-empty">正在读取豆仓...</p> : null}
        {!isLoading && beans.length === 0 ? (
          <p className="bean-empty">还没有咖啡豆。先保存第一支豆子。</p>
        ) : null}
        {beans.map((bean) => (
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
          </article>
        ))}
      </div>
    </section>
  )
}
