import { useEffect, useMemo, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Bean } from '../beans/beanTypes'
import { createInitialBrewForm, toBrewLogInsertPayload } from './brewForm'
import { createBrewLog, listBrewLogs } from './brewLogService'
import type { BrewForm, BrewLog } from './brewTypes'
import './brews.css'

type BrewLogPanelProps = {
  beans: Bean[]
  session: Session
  supabase: SupabaseClient
}

const methodOptions = ['手冲', '爱乐压', '法压', '冷萃', '意式']

export function BrewLogPanel({ beans, session, supabase }: BrewLogPanelProps) {
  const firstBeanId = beans[0]?.id ?? ''
  const [brewLogs, setBrewLogs] = useState<BrewLog[]>([])
  const [form, setForm] = useState<BrewForm>(() => createInitialBrewForm(firstBeanId))
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const beanNameById = useMemo(
    () => new Map(beans.map((bean) => [bean.id, bean.name])),
    [beans],
  )

  useEffect(() => {
    setForm((current) => {
      if (current.beanId || !firstBeanId) {
        return current
      }

      return { ...current, beanId: firstBeanId }
    })
  }, [firstBeanId])

  useEffect(() => {
    let isMounted = true

    async function loadBrewLogs() {
      setIsLoading(true)
      setError('')

      try {
        const logs = await listBrewLogs(supabase)
        if (isMounted) {
          setBrewLogs(logs)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : '读取冲煮记录失败')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadBrewLogs()

    return () => {
      isMounted = false
    }
  }, [supabase])

  function updateField(field: keyof BrewForm, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setStatus('')
    setIsSaving(true)

    try {
      const payload = toBrewLogInsertPayload(form, session.user.id)
      const log = await createBrewLog(supabase, payload)
      setBrewLogs((current) => [log, ...current])
      setForm(createInitialBrewForm(form.beanId))
      setStatus('冲煮记录已保存。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存冲煮记录失败')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="brew-panel" aria-labelledby="brew-panel-title">
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
          <div className="brew-form__grid">
            <label>
              咖啡豆
              <select
                value={form.beanId}
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
              冲煮方式
              <select
                value={form.method}
                onChange={(event) => updateField('method', event.target.value)}
              >
                <option value="">未选择</option>
                {methodOptions.map((option) => (
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

            <label>
              水量
              <input
                inputMode="decimal"
                value={form.waterGrams}
                onChange={(event) => updateField('waterGrams', event.target.value)}
                placeholder="克"
              />
            </label>

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

          <button type="submit" disabled={isSaving}>
            {isSaving ? '保存中' : '保存冲煮记录'}
          </button>
        </form>
      )}

      {status ? <p className="brew-status">{status}</p> : null}
      {error ? <p className="brew-error">{error}</p> : null}

      <div className="brew-list" aria-live="polite">
        {isLoading ? <p className="brew-empty">正在读取冲煮记录...</p> : null}
        {!isLoading && brewLogs.length === 0 ? (
          <p className="brew-empty">还没有冲煮记录。</p>
        ) : null}
        {brewLogs.map((log) => (
          <article className="brew-card" key={log.id}>
            <div>
              <h3>{log.bean_id ? beanNameById.get(log.bean_id) ?? '未知咖啡豆' : '未绑定豆子'}</h3>
              <p>
                {[log.method, log.ratio, log.water_temperature_c ? `${log.water_temperature_c}°C` : null]
                  .filter(Boolean)
                  .join(' / ') || '参数待补充'}
              </p>
            </div>
            {log.rating ? <strong>{log.rating}/5</strong> : null}
          </article>
        ))}
      </div>
    </section>
  )
}
