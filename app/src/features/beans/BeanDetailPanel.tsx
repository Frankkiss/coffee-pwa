import type { BrewLog } from '../brews/brewTypes'
import { buildBeanDetailView } from './beanDetailModel'
import type { Bean } from './beanTypes'

type BeanDetailPanelProps = {
  bean: Bean
  brewLogs: BrewLog[]
  isBrewSummaryStale: boolean
  onBack: () => void
  onEdit: (bean: Bean) => void
}

export function BeanDetailPanel({
  bean,
  brewLogs,
  isBrewSummaryStale,
  onBack,
  onEdit,
}: BeanDetailPanelProps) {
  const detail = buildBeanDetailView(bean, brewLogs)

  return (
    <article className="bean-detail" aria-labelledby="bean-detail-title">
      <div className="bean-detail__topbar">
        <button type="button" className="bean-secondary-button" onClick={onBack}>
          返回豆仓
        </button>
        <button type="button" onClick={() => onEdit(bean)}>
          编辑豆子
        </button>
      </div>

      <header className="bean-detail__hero">
        <p>{detail.beanTypeLabel}</p>
        <h3 id="bean-detail-title">{bean.name}</h3>
        <div className="bean-detail__meta">
          {detail.primaryMeta.length > 0 ? (
            detail.primaryMeta.map((item) => <span key={item}>{item}</span>)
          ) : (
            <span>信息待补充</span>
          )}
        </div>
      </header>

      <section className="bean-detail__section" aria-labelledby="bean-detail-basic">
        <h4 id="bean-detail-basic">基础信息</h4>
        <dl className="bean-detail__fields">
          {detail.detailFields.map((field) => (
            <div key={field.label}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {detail.blendLines.length > 0 ? (
        <section className="bean-detail__section" aria-labelledby="bean-detail-blend">
          <h4 id="bean-detail-blend">拼配信息</h4>
          <ul className="bean-detail__blend">
            {detail.blendLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="bean-detail__section" aria-labelledby="bean-detail-flavor">
        <h4 id="bean-detail-flavor">风味与库存</h4>
        <p className="bean-detail__flavor">{detail.flavorText}</p>
        {detail.stockLines.length > 0 ? (
          <div className="bean-detail__chips">
            {detail.stockLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        ) : null}
        {detail.sourceUrl ? (
          <a href={detail.sourceUrl} target="_blank" rel="noreferrer">
            查看来源
          </a>
        ) : null}
        {detail.notes ? <p className="bean-detail__notes">{detail.notes}</p> : null}
      </section>

      <section className="bean-detail__section" aria-labelledby="bean-detail-brews">
        <div className="bean-detail__section-title">
          <h4 id="bean-detail-brews">冲煮摘要</h4>
          <span>
            {detail.brewCount} 条记录 · {detail.pinnedCount} 个候选方案
          </span>
        </div>

        {isBrewSummaryStale ? (
          <p className="bean-detail__empty">冲煮摘要暂时读取失败，当前只显示豆子信息。</p>
        ) : null}

        {detail.bestBrew ? (
          <div className="bean-detail__best">
            <span>最高评分</span>
            <strong>{detail.bestBrew.ratingLabel ?? '未评分'}</strong>
            <p>{detail.bestBrew.summary}</p>
          </div>
        ) : null}

        {detail.recentBrews.length > 0 ? (
          <div className="bean-detail__brew-list">
            {detail.recentBrews.map((brew) => (
              <div className="bean-detail__brew" key={brew.id}>
                <div>
                  <strong>{brew.title}</strong>
                  <p>{brew.summary}</p>
                </div>
                {brew.ratingLabel ? <span>{brew.ratingLabel}</span> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="bean-detail__empty">还没有这支豆子的冲煮记录。</p>
        )}

        <a className="bean-detail__anchor" href="#brew-log">
          去记录冲煮
        </a>
      </section>
    </article>
  )
}
