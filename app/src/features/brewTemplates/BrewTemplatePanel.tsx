import { useMemo, useState } from 'react'
import {
  filterBrewTemplates,
  formatTemplateTime,
  getBrewTemplateFilterOptions,
  summarizePourSteps,
} from './brewTemplateFilters'
import { brewTemplates } from './brewTemplates'
import type { BrewTemplate, BrewTemplateDifficulty, BrewTemplateFilters } from './brewTemplateTypes'
import './brewTemplates.css'

const difficultyLabels: Record<BrewTemplateDifficulty, string> = {
  easy: '日常',
  medium: '进阶',
  advanced: '高阶',
}

export function BrewTemplatePanel() {
  const [filters, setFilters] = useState<BrewTemplateFilters>({
    brewer: '',
    flavor: '',
    difficulty: '',
    includeChampionReferences: false,
  })
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null)
  const options = useMemo(() => getBrewTemplateFilterOptions(brewTemplates), [])
  const filteredTemplates = useMemo(
    () => filterBrewTemplates(brewTemplates, filters),
    [filters],
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

  return (
    <section id="brew-templates" className="brew-template-panel" aria-labelledby="brew-template-title">
      <div className="brew-template-panel__header">
        <div>
          <p className="brew-template-panel__eyebrow">Recipe Library</p>
          <h2 id="brew-template-title">冲煮模板</h2>
        </div>
        <span>{filteredTemplates.length} / {brewTemplates.length}</span>
      </div>

      <p className="brew-template-panel__intro">
        先从结构化模板中选择方案，再让 AI 根据豆子信息微调。冠军方案默认作为进阶参考，不直接混入日常推荐。
      </p>

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

      <div className="brew-template-list" aria-live="polite">
        {filteredTemplates.length === 0 ? (
          <p className="brew-template-empty">没有匹配的模板，可以放宽筛选条件。</p>
        ) : null}
        {filteredTemplates.map((template) => (
          <TemplateCard
            key={template.id}
            isExpanded={expandedTemplateId === template.id}
            template={template}
            onToggle={() => toggleTemplate(template.id)}
          />
        ))}
      </div>
    </section>
  )
}

type TemplateCardProps = {
  template: BrewTemplate
  isExpanded: boolean
  onToggle: () => void
}

function TemplateCard({ template, isExpanded, onToggle }: TemplateCardProps) {
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
        <span>{template.doseGrams}g 粉</span>
        <span>{template.waterGrams}g 水</span>
        <span>{template.ratio}</span>
        <span>{template.waterTemperatureC.min}-{template.waterTemperatureC.max}°C</span>
      </div>

      <p className="brew-template-card__steps">{summarizePourSteps(template)}</p>

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
