import { useEffect, useState } from 'react'
import { useSyncRuntime } from '../sync/SyncContext'
import {
  createUserSettingsInput,
  normalizeUserSettings,
  toUserSettingsForm,
  type UserSettingsForm,
} from './userSettingsModel'
import type { UserSettingsRow } from './userSettingsTypes'
import './settings.css'

const initialForm: UserSettingsForm = {
  backupReminderDays: '7',
  preferredUnits: 'metric',
  defaultGear: '',
  tastePreferences: '',
  hotPouroverBrewer: '',
  hotPouroverGrinder: '',
  icedPouroverBrewer: '',
  icedPouroverGrinder: '',
  coldBrewBrewer: '',
  coldBrewGrinder: '',
  espressoBrewer: '',
  espressoGrinder: '',
  espressoDoseGrams: '',
  tasteGoals: '',
}

export function UserSettingsPanel({ userId }: { userId: string }) {
  const runtime = useSyncRuntime()
  const repository = runtime.repositories?.userSettings ?? null
  const [settings, setSettings] = useState<UserSettingsRow | null>(null)
  const [form, setForm] = useState(initialForm)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!repository) return
    let current = true
    let loadGeneration = 0
    const load = async () => {
      const generation = ++loadGeneration
      setIsLoading(true)
      try {
        const next = await repository.getUserSettings()
        if (!current || generation !== loadGeneration) return
        setSettings(next)
        setForm(toUserSettingsForm(normalizeUserSettings(next, userId)))
      } catch {
        if (current && generation === loadGeneration) {
          setError('读取设置失败，请稍后重试。')
        }
      } finally {
        if (current && generation === loadGeneration) setIsLoading(false)
      }
    }
    void load()
    const unsubscribe = repository.subscribe(() => void load())
    return () => {
      current = false
      loadGeneration += 1
      unsubscribe()
    }
  }, [repository, userId])

  function update<K extends keyof UserSettingsForm>(field: K, value: UserSettingsForm[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('')
    setError('')
    const parsed = createUserSettingsInput(form, settings ?? undefined)
    if (!parsed.ok) {
      setError(parsed.message)
      return
    }
    if (!repository) {
      setError('本地设置仍在初始化，请稍后再试。')
      return
    }
    setIsSaving(true)
    try {
      const saved = settings
        ? await repository.updateUserSettings(parsed.value)
        : await repository.createUserSettings(parsed.value)
      setSettings(saved)
      setForm(toUserSettingsForm(saved))
      setStatus('设置已保存到本机，正在等待同步。')
      void runtime.run().catch(() => undefined)
    } catch {
      setError('保存设置失败，请重新打开页面后再试。')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="settings-panel" aria-labelledby="settings-title">
      <header className="settings-panel__header">
        <div>
          <p>Daily setup</p>
          <h2 id="settings-title">使用设置</h2>
        </div>
        <span>{runtime.state.kind === 'offline' ? '离线可保存' : '自动同步'}</span>
      </header>
      <p className="settings-panel__intro">这些偏好会用于备份提醒和后续推荐；断网时也能修改。</p>

      {isLoading ? <p className="settings-panel__muted">正在读取本机设置...</p> : null}
      {!isLoading ? (
        <form className="settings-form" onSubmit={handleSubmit}>
          <label>
            备份提醒间隔
            <span>距离上次备份超过多少天时提醒</span>
            <input
              type="number"
              min="1"
              max="365"
              inputMode="numeric"
              value={form.backupReminderDays}
              onChange={(event) => update('backupReminderDays', event.target.value)}
              required
            />
          </label>
          <label>
            常用单位
            <select
              value={form.preferredUnits}
              onChange={(event) => update('preferredUnits', event.target.value as UserSettingsForm['preferredUnits'])}
            >
              <option value="metric">公制（克 / 摄氏度）</option>
              <option value="imperial">英制（盎司 / 华氏度）</option>
            </select>
          </label>
          <label>
            常用器具
            <span>每行一个，例如 V60、C40</span>
            <textarea
              rows={4}
              value={form.defaultGear}
              onChange={(event) => update('defaultGear', event.target.value)}
            />
          </label>
          <label>
            口味偏好
            <span>例如明亮、甜感、低苦味</span>
            <textarea
              rows={4}
              value={form.tastePreferences}
              onChange={(event) => update('tastePreferences', event.target.value)}
            />
          </label>
          <fieldset className="settings-form__recommendation">
            <legend>冲煮推荐默认设备</legend>
            <p>生成推荐时自动带入，生成前仍可临时修改。</p>
            <div className="settings-form__mode-grid">
              <section>
                <h3>热手冲</h3>
                <label>器具<input value={form.hotPouroverBrewer} onChange={(event) => update('hotPouroverBrewer', event.target.value)} placeholder="例如 V60" /></label>
                <label>磨豆机<input value={form.hotPouroverGrinder} onChange={(event) => update('hotPouroverGrinder', event.target.value)} placeholder="例如 C40" /></label>
              </section>
              <section>
                <h3>冰手冲</h3>
                <label>器具<input value={form.icedPouroverBrewer} onChange={(event) => update('icedPouroverBrewer', event.target.value)} placeholder="例如 V60" /></label>
                <label>磨豆机<input value={form.icedPouroverGrinder} onChange={(event) => update('icedPouroverGrinder', event.target.value)} placeholder="例如 C40" /></label>
              </section>
              <section>
                <h3>冷萃</h3>
                <label>器具<input value={form.coldBrewBrewer} onChange={(event) => update('coldBrewBrewer', event.target.value)} placeholder="例如 冷萃壶" /></label>
                <label>磨豆机<input value={form.coldBrewGrinder} onChange={(event) => update('coldBrewGrinder', event.target.value)} placeholder="例如 C40" /></label>
              </section>
              <section>
                <h3>意式</h3>
                <label>设备<input value={form.espressoBrewer} onChange={(event) => update('espressoBrewer', event.target.value)} placeholder="例如 Flair" /></label>
                <label>磨豆机<input value={form.espressoGrinder} onChange={(event) => update('espressoGrinder', event.target.value)} placeholder="例如 Kinu" /></label>
                <label>默认粉量（克）<input type="number" min="0.1" max="100" step="0.1" inputMode="decimal" value={form.espressoDoseGrams} onChange={(event) => update('espressoDoseGrams', event.target.value)} placeholder="例如 18" /></label>
              </section>
            </div>
            <label>
              推荐风味目标
              <span>用逗号或顿号分隔，例如明亮、甜感、干净</span>
              <input value={form.tasteGoals} onChange={(event) => update('tasteGoals', event.target.value)} />
            </label>
          </fieldset>
          <button type="submit" disabled={isSaving}>
            {isSaving ? '保存中' : '保存设置'}
          </button>
        </form>
      ) : null}
      {status ? <p className="settings-panel__status" role="status">{status}</p> : null}
      {error ? <p className="settings-panel__error" role="alert">{error}</p> : null}
    </section>
  )
}
