import { useEffect, useMemo, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import {
  filterBrewTemplates,
  formatTemplateTime,
  getBrewTemplateFilterOptions,
  summarizePourSteps,
} from './brewTemplateFilters'
import {
  createBrewTemplateFormFromTemplate,
  createEmptyBrewTemplateForm,
  type BrewTemplateForm,
} from './brewTemplateModel'
import {
  buildUserBrewTemplatePayload,
  createUserBrewTemplate,
  listUserBrewTemplates,
  softDeleteUserBrewTemplate,
  updateUserBrewTemplate,
} from './brewTemplateService'
import { brewTemplates } from './brewTemplates'
import type {
  BrewTemplate,
  BrewTemplateCategory,
  BrewTemplateDifficulty,
  BrewTemplateFilters,
  BrewTemplatePourStep,
} from './brewTemplateTypes'
import './brewTemplates.css'

const difficultyLabels: Record<BrewTemplateDifficulty, string> = {
  easy: '日常',
  medium: '进阶',
  advanced: '高阶',
}

const categoryLabels: Record<BrewTemplateCategory, string> = {
  'daily-pourover': '日常手冲',
  'immersion-hybrid': '浸泡混合',
  'bean-specific': '豆子适配',
  'cold-brew': '冷萃',
  'champion-reference': '冠军参考',
}

type BrewTemplatePanelProps = {
  session: Session
  supabase: SupabaseClient
}

type EditingState =
  | { mode: 'create'; template: null; copiedFromTemplateId: null }
  | { mode: 'copy'; template: BrewTemplate; copiedFromTemplateId: string }
  | { mode: 'edit'; template: BrewTemplate; copiedFromTemplateId: string | null }

export function BrewTemplatePanel({ session, supabase }: BrewTemplatePanelProps) {
  const [filters, setFilters] = useState<BrewTemplateFilters>({
    brewer: '',
    flavor: '',
    difficulty: '',
    includeChampionReferences: false,
  })
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null)
  const [userTemplates, setUserTemplates] = useState<BrewTemplate[]>([])
  const [editingState, setEditingState] = useState<EditingState | null>(null)
  const [form, setForm] = useState<BrewTemplateForm>(() => createEmptyBrewTemplateForm())
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function loadTemplates() {
      setIsLoading(true)
      setError('')

      try {
        const templates = await listUserBrewTemplates(supabase)

        if (isMounted) {
          setUserTemplates(templates)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : '读取自定义模板失败')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadTemplates()

    return () => {
      isMounted = false
    }
  }, [supabase])

  const allTemplates = useMemo(
    () => [
      ...brewTemplates.map((template) => ({ ...template, source: 'system' as const })),
      ...userTemplates,
    ],
    [userTemplates],
  )
  const options = useMemo(() => getBrewTemplateFilterOptions(allTemplates), [allTemplates])
  const filteredTemplates = useMemo(
    () => filterBrewTemplates(allTemplates, filters),
    [allTemplates, filters],
  )

  function updateFilter<T extends keyof BrewTemplateFilters>(
    field: T,
    value: BrewTemplateFilters[T],
  ) {
    setFilters((current) => ({ ...current, [field]: value }))
  }

  function toggleTemplate(templateId: string) {
    setExpandedTemplateId((current) => (current === templateId ? null : templateId))
  }

  function startCreate() {
    setEditingState({ mode: 'create', template: null, copiedFromTemplateId: null })
    setForm(createEmptyBrewTemplateForm())
    setStatus('')
    setError('')
  }

  function startCopy(template: BrewTemplate) {
    setEditingState({
      mode: 'copy',
      template,
      copiedFromTemplateId: template.id,
    })
    setForm(createBrewTemplateFormFromTemplate(template))
    setStatus('')
    setError('')
  }

  function startEdit(template: BrewTemplate) {
    setEditingState({
      mode: 'edit',
      template,
      copiedFromTemplateId: template.copiedFromTemplateId ?? null,
    })
    setForm(createBrewTemplateFormFromTemplate(template))
    setStatus('')
    setError('')
  }

  function cancelEdit() {
    setEditingState(null)
    setForm(createEmptyBrewTemplateForm())
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!editingState) {
      return
    }

    setIsSaving(true)
    setStatus('')
    setError('')

    try {
      const payload = buildUserBrewTemplatePayload(
        form,
        session.user.id,
        editingState.copiedFromTemplateId,
      )
      const saved =
        editingState.mode === 'edit'
          ? await updateUserBrewTemplate(supabase, editingState.template.id, payload)
          : await createUserBrewTemplate(supabase, payload)

      setUserTemplates((current) => {
        if (editingState.mode === 'edit') {
          return current.map((template) => (template.id === saved.id ? saved : template))
        }

        return [saved, ...current]
      })
      setEditingState(null)
      setForm(createEmptyBrewTemplateForm())
      setStatus(editingState.mode === 'edit' ? '模板已更新。' : '模板已保存。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存模板失败')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(template: BrewTemplate) {
    if (!window.confirm(`确认删除模板「${template.name}」吗？`)) {
      return
    }

    setStatus('')
    setError('')

    try {
      await softDeleteUserBrewTemplate(supabase, template.id)
      setUserTemplates((current) => current.filter((item) => item.id !== template.id))
      setStatus('模板已删除。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除模板失败')
    }
  }

  return (
    <section id="brew-templates" className="brew-template-panel" aria-labelledby="brew-template-title">
      <div className="brew-template-panel__header">
        <div>
          <p className="brew-template-panel__eyebrow">Recipe Library</p>
          <h2 id="brew-template-title">冲煮模板</h2>
        </div>
        <div className="brew-template-panel__actions">
          <span>{filteredTemplates.length} / {allTemplates.length}</span>
          <button type="button" onClick={startCreate}>
            新增模板
          </button>
        </div>
      </div>

      <p className="brew-template-panel__intro">
        系统模板和我的模板分开管理，AI 推荐会优先参考这里。
      </p>

      {editingState ? (
        <BrewTemplateFormView
          form={form}
          isSaving={isSaving}
          mode={editingState.mode}
          onCancel={cancelEdit}
          onChange={setForm}
          onSubmit={handleSubmit}
        />
      ) : null}

      <div className="brew-template-filters" aria-label="冲煮模板筛选">
        <label>
          器具
          <select
            value={filters.brewer}
            onChange={(event) => updateFilter('brewer', event.target.value)}
          >
            <option value="">全部器具</option>
            {options.brewers.map((brewer) => (
              <option key={brewer} value={brewer}>
                {brewer}
              </option>
            ))}
          </select>
        </label>

        <label>
          风味倾向
          <select
            value={filters.flavor}
            onChange={(event) => updateFilter('flavor', event.target.value)}
          >
            <option value="">全部风味</option>
            {options.flavors.map((flavor) => (
              <option key={flavor} value={flavor}>
                {flavor}
              </option>
            ))}
          </select>
        </label>

        <label>
          难度
          <select
            value={filters.difficulty}
            onChange={(event) =>
              updateFilter('difficulty', event.target.value as BrewTemplateDifficulty | '')
            }
          >
            <option value="">全部难度</option>
            {options.difficulties.map((difficulty) => (
              <option key={difficulty} value={difficulty}>
                {difficultyLabels[difficulty]}
              </option>
            ))}
          </select>
        </label>

        <label className="brew-template-checkbox">
          <input
            type="checkbox"
            checked={filters.includeChampionReferences}
            onChange={(event) =>
              updateFilter('includeChampionReferences', event.target.checked)
            }
          />
          显示冠军参考
        </label>
      </div>

      {status ? <p className="brew-template-status">{status}</p> : null}
      {error ? <p className="brew-template-error">{error}</p> : null}
      {isLoading ? <p className="brew-template-empty">读取我的模板...</p> : null}

      <div className="brew-template-list" aria-live="polite">
        {filteredTemplates.length === 0 && !isLoading ? (
          <p className="brew-template-empty">没有匹配的模板，可以放宽筛选条件。</p>
        ) : null}
        {filteredTemplates.map((template) => (
          <TemplateCard
            key={`${template.source ?? 'system'}-${template.id}`}
            isExpanded={expandedTemplateId === template.id}
            template={template}
            onCopy={() => startCopy(template)}
            onDelete={() => handleDelete(template)}
            onEdit={() => startEdit(template)}
            onToggle={() => toggleTemplate(template.id)}
          />
        ))}
      </div>
    </section>
  )
}

type BrewTemplateFormViewProps = {
  form: BrewTemplateForm
  mode: EditingState['mode']
  isSaving: boolean
  onCancel: () => void
  onChange: (form: BrewTemplateForm) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}

function BrewTemplateFormView({
  form,
  isSaving,
  mode,
  onCancel,
  onChange,
  onSubmit,
}: BrewTemplateFormViewProps) {
  function update<K extends keyof BrewTemplateForm>(field: K, value: BrewTemplateForm[K]) {
    onChange({ ...form, [field]: value })
  }

  function updateStep(index: number, nextStep: BrewTemplatePourStep) {
    update(
      'pourSteps',
      form.pourSteps.map((step, stepIndex) => (stepIndex === index ? nextStep : step)),
    )
  }

  function addStep() {
    update('pourSteps', [
      ...form.pourSteps,
      {
        order: form.pourSteps.length + 1,
        startSeconds: 0,
        endSeconds: null,
        targetWaterGrams: form.waterGrams,
        label: `第 ${form.pourSteps.length + 1} 段`,
        action: '',
      },
    ])
  }

  function removeStep(index: number) {
    if (form.pourSteps.length <= 1) {
      return
    }

    update(
      'pourSteps',
      form.pourSteps.filter((_step, stepIndex) => stepIndex !== index),
    )
  }

  return (
    <form className="brew-template-form" onSubmit={onSubmit}>
      <div className="brew-template-form__header">
        <strong>{mode === 'edit' ? '编辑模板' : mode === 'copy' ? '复制为我的模板' : '新增模板'}</strong>
        <button type="button" onClick={onCancel}>
          取消
        </button>
      </div>

      <div className="brew-template-form__grid">
        <label>
          名称
          <input
            value={form.name}
            onChange={(event) => update('name', event.target.value)}
            required
          />
        </label>
        <label>
          分类
          <select
            value={form.category}
            onChange={(event) => update('category', event.target.value as BrewTemplateCategory)}
          >
            {Object.entries(categoryLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          难度
          <select
            value={form.difficulty}
            onChange={(event) => update('difficulty', event.target.value as BrewTemplateDifficulty)}
          >
            {Object.entries(difficultyLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          器具
          <input
            value={form.brewer}
            onChange={(event) => update('brewer', event.target.value)}
            required
          />
        </label>
        <label>
          滤纸 / 滤网
          <input value={form.filter} onChange={(event) => update('filter', event.target.value)} />
        </label>
        <label>
          粉量 g
          <input
            type="number"
            min="1"
            value={form.doseGrams}
            onChange={(event) => update('doseGrams', Number(event.target.value))}
            required
          />
        </label>
        <label>
          水量 g
          <input
            type="number"
            min="1"
            value={form.waterGrams}
            onChange={(event) => update('waterGrams', Number(event.target.value))}
            required
          />
        </label>
        <label>
          粉水比
          <input value={form.ratio} onChange={(event) => update('ratio', event.target.value)} />
        </label>
        <label>
          水温低值 °C
          <input
            type="number"
            value={form.waterTemperatureMin}
            onChange={(event) => update('waterTemperatureMin', Number(event.target.value))}
          />
        </label>
        <label>
          水温高值 °C
          <input
            type="number"
            value={form.waterTemperatureMax}
            onChange={(event) => update('waterTemperatureMax', Number(event.target.value))}
          />
        </label>
        <label>
          研磨
          <input
            value={form.grindSize}
            onChange={(event) => update('grindSize', event.target.value)}
          />
        </label>
        <label>
          目标时间低值 秒
          <input
            type="number"
            min="0"
            value={form.targetTimeMin}
            onChange={(event) => update('targetTimeMin', Number(event.target.value))}
          />
        </label>
        <label>
          目标时间高值 秒
          <input
            type="number"
            min="0"
            value={form.targetTimeMax}
            onChange={(event) => update('targetTimeMax', Number(event.target.value))}
          />
        </label>
      </div>

      <label>
        风味目标
        <textarea
          value={form.flavorGoal}
          onChange={(event) => update('flavorGoal', event.target.value)}
          rows={2}
        />
      </label>

      <div className="brew-template-step-editor">
        <div className="brew-template-step-editor__header">
          <strong>分段方案</strong>
          <button type="button" onClick={addStep}>
            添加一段
          </button>
        </div>
        {form.pourSteps.map((step, index) => (
          <div className="brew-template-step-row" key={index}>
            <label>
              名称
              <input
                value={step.label}
                onChange={(event) => updateStep(index, { ...step, label: event.target.value })}
              />
            </label>
            <label>
              开始秒
              <input
                type="number"
                min="0"
                value={step.startSeconds}
                onChange={(event) =>
                  updateStep(index, { ...step, startSeconds: Number(event.target.value) })
                }
              />
            </label>
            <label>
              结束秒
              <input
                type="number"
                min="0"
                value={step.endSeconds ?? ''}
                onChange={(event) =>
                  updateStep(index, {
                    ...step,
                    endSeconds: event.target.value ? Number(event.target.value) : null,
                  })
                }
              />
            </label>
            <label>
              到达水量 g
              <input
                type="number"
                min="0"
                value={step.targetWaterGrams}
                onChange={(event) =>
                  updateStep(index, { ...step, targetWaterGrams: Number(event.target.value) })
                }
              />
            </label>
            <label className="brew-template-step-row__action">
              动作
              <input
                value={step.action}
                onChange={(event) => updateStep(index, { ...step, action: event.target.value })}
              />
            </label>
            <button type="button" onClick={() => removeStep(index)}>
              删除
            </button>
          </div>
        ))}
      </div>

      <div className="brew-template-form__grid">
        <label>
          适合
          <textarea
            value={form.suitableForText}
            onChange={(event) => update('suitableForText', event.target.value)}
            rows={3}
            placeholder="水洗、浅烘、花香"
          />
        </label>
        <label>
          避免
          <textarea
            value={form.avoidForText}
            onChange={(event) => update('avoidForText', event.target.value)}
            rows={3}
          />
        </label>
        <label>
          调整规则
          <textarea
            value={form.adjustmentRulesText}
            onChange={(event) => update('adjustmentRulesText', event.target.value)}
            rows={4}
            placeholder="一行一条，例如：酸尖时降低粉水比或升温 1°C"
          />
        </label>
        <label>
          来源备注
          <textarea
            value={form.sourceNotes}
            onChange={(event) => update('sourceNotes', event.target.value)}
            rows={4}
          />
        </label>
      </div>

      <label>
        来源链接
        <textarea
          value={form.sourceUrlsText}
          onChange={(event) => update('sourceUrlsText', event.target.value)}
          rows={2}
          placeholder="一行一个链接"
        />
      </label>

      <label className="brew-template-checkbox">
        <input
          type="checkbox"
          checked={form.isChampionReference}
          onChange={(event) => update('isChampionReference', event.target.checked)}
        />
        作为冠军参考模板
      </label>

      <button type="submit" disabled={isSaving}>
        {isSaving ? '保存中' : '保存模板'}
      </button>
    </form>
  )
}

type TemplateCardProps = {
  template: BrewTemplate
  isExpanded: boolean
  onToggle: () => void
  onCopy: () => void
  onEdit: () => void
  onDelete: () => void
}

function TemplateCard({
  template,
  isExpanded,
  onToggle,
  onCopy,
  onEdit,
  onDelete,
}: TemplateCardProps) {
  const isUserTemplate = template.source === 'user'

  return (
    <article className="brew-template-card">
      <button
        type="button"
        className="brew-template-card__summary"
        aria-expanded={isExpanded}
        onClick={onToggle}
      >
        <div>
          <span className="brew-template-card__kicker">
            {template.brewer} · {difficultyLabels[template.difficulty]}
            {template.isChampionReference ? ' · 冠军参考' : ''}
          </span>
          <strong>{template.name}</strong>
          <p>{template.flavorGoal}</p>
        </div>
        <span>{isExpanded ? '收起' : '详情'}</span>
      </button>

      <div className="brew-template-card__metrics">
        <span>{isUserTemplate ? '我的模板' : '系统模板'}</span>
        <span>{template.doseGrams}g 粉</span>
        <span>{template.waterGrams}g 水</span>
        <span>{template.ratio}</span>
        <span>{template.waterTemperatureC.min}-{template.waterTemperatureC.max}°C</span>
      </div>

      <p className="brew-template-card__steps">{summarizePourSteps(template)}</p>

      <div className="brew-template-card__actions">
        {isUserTemplate ? (
          <>
            <button type="button" onClick={onEdit}>
              编辑
            </button>
            <button type="button" onClick={onDelete}>
              删除
            </button>
          </>
        ) : (
          <button type="button" onClick={onCopy}>
            复制为我的模板
          </button>
        )}
      </div>

      {isExpanded ? <TemplateDetail template={template} /> : null}
    </article>
  )
}

function TemplateDetail({ template }: { template: BrewTemplate }) {
  return (
    <div className="brew-template-detail">
      <dl>
        <div>
          <dt>滤纸</dt>
          <dd>{template.filter}</dd>
        </div>
        <div>
          <dt>研磨</dt>
          <dd>{template.grindSize}</dd>
        </div>
        <div>
          <dt>目标时间</dt>
          <dd>
            {formatTemplateTime(template.targetTimeSeconds.min)}-
            {formatTemplateTime(template.targetTimeSeconds.max)}
          </dd>
        </div>
      </dl>

      <div className="brew-template-tags">
        {template.suitableFor.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>

      <ol className="brew-template-steps">
        {template.pourSteps.map((step) => (
          <li key={step.order}>
            <strong>{step.label}</strong>
            <span>
              {formatTemplateTime(step.startSeconds)}
              {step.endSeconds === null ? '' : `-${formatTemplateTime(step.endSeconds)}`} · 到{' '}
              {step.targetWaterGrams}g
            </span>
            <p>{step.action}</p>
          </li>
        ))}
      </ol>

      <div className="brew-template-adjustments">
        <strong>调整建议</strong>
        <ul>
          {template.adjustmentRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </div>

      <p className="brew-template-source">{template.sourceNotes}</p>
    </div>
  )
}
