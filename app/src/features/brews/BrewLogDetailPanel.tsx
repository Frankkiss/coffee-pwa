import { buildBrewLogDetailView } from './brewLogDetailModel'
import type { BrewLog } from './brewTypes'

type BrewLogDetailPanelProps = {
  log: BrewLog
  beanName: string
  isDeleting: boolean
  isSaving: boolean
  onBack: () => void
  onEdit: (log: BrewLog) => void
  onDelete: (log: BrewLog) => void
  onTogglePinned: (log: BrewLog) => void
}

export function BrewLogDetailPanel({
  log,
  beanName,
  isDeleting,
  isSaving,
  onBack,
  onEdit,
  onDelete,
  onTogglePinned,
}: BrewLogDetailPanelProps) {
  const detail = buildBrewLogDetailView(log, beanName)

  return (
    <article className="brew-detail" aria-labelledby="brew-detail-title">
      <div className="brew-detail__topbar">
        <button type="button" className="brew-secondary-button" onClick={onBack}>
          返回记录
        </button>
        <button type="button" onClick={() => onEdit(log)}>
          编辑
        </button>
      </div>

      <header className="brew-detail__hero">
        <p>{detail.subtitle}</p>
        <h3 id="brew-detail-title">{detail.title}</h3>
        <div className="brew-detail__meta">
          <span>冲煮：{detail.brewedAtLabel}</span>
          <span>更新：{detail.updatedAtLabel}</span>
          <span>{detail.ratingLabel}</span>
          {detail.isPinnedRecipe ? <span>候选方案</span> : null}
        </div>
      </header>

      <section className="brew-detail__section" aria-labelledby="brew-detail-params">
        <h4 id="brew-detail-params">冲煮参数</h4>
        {detail.parameterFields.length > 0 ? (
          <dl className="brew-detail__fields">
            {detail.parameterFields.map((field) => (
              <div key={field.label}>
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="brew-detail__empty">参数还没有补充完整。</p>
        )}
      </section>

      <section className="brew-detail__section" aria-labelledby="brew-detail-pours">
        <h4 id="brew-detail-pours">分段注水</h4>
        {detail.pourSteps.length > 0 ? (
          <ol className="brew-detail__steps">
            {detail.pourSteps.map((step) => (
              <li key={`${step.title}-${step.detail}`}>
                <strong>{step.title}</strong>
                <span>{step.detail}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="brew-detail__empty">{detail.pourStepEmptyText}</p>
        )}
      </section>

      <section className="brew-detail__section" aria-labelledby="brew-detail-result">
        <h4 id="brew-detail-result">风味复盘</h4>
        {detail.flavorTags.length > 0 ? (
          <div className="brew-tags">
            {detail.flavorTags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        ) : null}
        {detail.sensoryFields.length > 0 ? (
          <dl className="brew-detail__fields brew-detail__fields--sensory">
            {detail.sensoryFields.map((field) => (
              <div key={field.label}>
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <p className="brew-detail__notes">{detail.notes}</p>
      </section>

      <div className="brew-detail__actions">
        <button type="button" disabled={isSaving} onClick={() => onTogglePinned(log)}>
          {detail.pinActionLabel}
        </button>
        <button
          type="button"
          className="brew-danger-button"
          disabled={isDeleting}
          onClick={() => onDelete(log)}
        >
          删除
        </button>
      </div>
    </article>
  )
}
