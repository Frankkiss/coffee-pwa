import { useEffect, useMemo, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { CoffeeDayLogo } from '../../components/CoffeeDayLogo'
import {
  buildBackupReminder,
  readBackupReminderMeta,
} from '../backup/backupReminder'
import { listBeans } from '../beans/beanService'
import type { Bean } from '../beans/beanTypes'
import { listBrewLogs } from '../brews/brewLogService'
import type { BrewLog } from '../brews/brewTypes'
import type { SyncState } from '../sync/syncTypes'
import {
  buildOfflineCacheSnapshot,
  readOfflineCache,
  writeOfflineCache,
} from '../offline/offlineCache'
import { buildHomeOverview } from './homeOverviewModel'
import './home.css'

type HomeOverviewProps = {
  session: Session
  supabase: SupabaseClient
  onNavigate: (view: HomeNavigationTarget) => void
  onSignOut: () => void
  isSigningOut?: boolean
  authStatus?: string
  previewRows?: HomeRows
  syncState: SyncState
}

type HomeRows = {
  beans: Bean[]
  brewLogs: BrewLog[]
}

export type HomeNavigationTarget =
  | 'beans'
  | 'brewTemplates'
  | 'recommendations'
  | 'backup'

const quickActions: Array<{
  label: string
  mark: string
  view: HomeNavigationTarget
}> = [
  { label: '加豆', mark: '豆', view: 'beans' },
  { label: '导入', mark: '扫', view: 'beans' },
  { label: '模板', mark: '模', view: 'brewTemplates' },
  { label: '推荐', mark: '荐', view: 'recommendations' },
  { label: '备份', mark: '存', view: 'backup' },
]

const lifeNotes = [
  '今天这杯，先给自己留三分钟',
  '豆子会醒，记录也会慢慢变香',
  '水烧开之前，先想好第一段注水',
  '不赶时间的时候，咖啡更容易好喝',
  '杯子热起来，今天也就开始了',
  '好喝的那一口，值得多写两个字',
  '磨豆声响起，先把烦心事放旁边',
  '如果酸甜刚好，记得给未来的自己留线索',
  '今天不追求完美，先追求舒服',
  '水流慢一点，心也慢一点',
]

const greetingNotes = [
  '今天也来一杯吧 ( ´ ▽ ` )ﾉ',
  '咖Day 已经把杯子摆好啦 (๑˃̵ᴗ˂̵)و',
  '先闻香，再动手 ( ˘ω˘ )',
  '欢迎回到小咖啡台 (•̀ᴗ•́)و',
  '今天适合慢慢冲一杯 ( ᐛ )',
]

export function HomeOverview({
  session,
  supabase,
  onNavigate,
  onSignOut,
  isSigningOut = false,
  authStatus,
  previewRows,
  syncState,
}: HomeOverviewProps) {
  const [rows, setRows] = useState<HomeRows>({ beans: [], brewLogs: [] })
  const [isLoading, setIsLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [isUsingCache, setIsUsingCache] = useState(false)
  const [error, setError] = useState('')
  const [lifeNoteIndex, setLifeNoteIndex] = useState(0)
  const [openDrawers, setOpenDrawers] = useState({
    beans: true,
    brews: true,
  })
  const [isToolTrayOpen, setIsToolTrayOpen] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function loadRows() {
      if (previewRows) {
        setRows(previewRows)
        setIsUsingCache(false)
        setError('')
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError('')

      try {
        const [beans, brewLogs] = await Promise.all([
          listBeans(supabase),
          listBrewLogs(supabase),
        ])

        if (isMounted) {
          setRows({ beans, brewLogs })
          setIsUsingCache(false)
        }

        await Promise.all([
          writeOfflineCache(
            'beans',
            buildOfflineCacheSnapshot(beans, session.user.id, new Date()),
          ),
          writeOfflineCache(
            'brewLogs',
            buildOfflineCacheSnapshot(brewLogs, session.user.id, new Date()),
          ),
        ])
      } catch (err) {
        const [cachedBeans, cachedBrewLogs] = await Promise.all([
          readOfflineCache<Bean>('beans', session.user.id),
          readOfflineCache<BrewLog>('brewLogs', session.user.id),
        ])

        if (isMounted) {
          if (cachedBeans || cachedBrewLogs) {
            setRows({
              beans: cachedBeans ?? [],
              brewLogs: cachedBrewLogs ?? [],
            })
            setIsUsingCache(true)
            setError('')
          } else {
            setError(err instanceof Error ? err.message : '读取首页概览失败')
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadRows()

    return () => {
      isMounted = false
    }
  }, [previewRows, session.user.id, supabase])

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
    }

    function handleOffline() {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const overview = useMemo(
    () =>
      buildHomeOverview({
        beans: rows.beans,
        brewLogs: rows.brewLogs,
        backupReminder: buildBackupReminder(
          readBackupReminderMeta(window.localStorage),
          new Date(),
        ),
        email: session.user.email,
        syncState,
      }),
    [rows.beans, rows.brewLogs, session.user.email, syncState],
  )
  const [beanStat, brewStat, recommendationStat] = overview.stats
  const recommendationPreview = overview.recommendationPreview
  const greetingNote = greetingNotes[lifeNoteIndex % greetingNotes.length]
  const toggleDrawer = (drawer: 'beans' | 'brews') => {
    setOpenDrawers((current) => ({
      ...current,
      [drawer]: !current[drawer],
    }))
  }

  return (
    <section className="home-overview" aria-labelledby="home-overview-title">
      <div className="home-hero">
        <div className="home-hero__topline">
          <span
            className={`home-sync-dot ${syncState.kind === 'synced' ? 'is-online' : 'is-offline'}`}
            aria-label={`云同步状态：${overview.syncLabel}；网络${isOnline ? '在线' : '离线'}`}
          >
            <span>状态</span>
            <strong>{overview.syncLabel}</strong>
          </span>
          <button type="button" onClick={onSignOut} disabled={isSigningOut}>
            {isSigningOut ? '退出中' : '退出'}
          </button>
        </div>
        <div className="home-hero__brand">
          <CoffeeDayLogo headingId="home-overview-title" title="咖Day" variant="hero" />
          <p className="home-hero__greeting">
            <span>Hi，{overview.accountLabel}</span>
            <strong>{greetingNote}</strong>
          </p>
        </div>
        <button
          type="button"
          className="home-life-note"
          onClick={() => setLifeNoteIndex((current) => (current + 1) % lifeNotes.length)}
        >
          <span>今日小纸条</span>
          <strong>{lifeNotes[lifeNoteIndex]}</strong>
        </button>
      </div>

      {authStatus ? <p className="home-overview__status">{authStatus}</p> : null}

      <section
        className={`home-tool-tray ${isToolTrayOpen ? 'is-open' : 'is-collapsed'}`}
        aria-label="台面工具"
      >
        <button
          type="button"
          className="home-tool-tray__toggle"
          onClick={() => setIsToolTrayOpen((current) => !current)}
          aria-expanded={isToolTrayOpen}
          aria-controls="home-tool-actions"
        >
          <span aria-hidden="true">具</span>
          <strong>{isToolTrayOpen ? '收起' : '工具'}</strong>
        </button>
        <div
          id="home-tool-actions"
          className="home-tool-tray__actions"
          aria-hidden={!isToolTrayOpen}
        >
          <nav className="home-actions" aria-label="首页快捷操作">
            {quickActions.map((action) => (
              <button
                key={action.label}
                type="button"
                tabIndex={isToolTrayOpen ? undefined : -1}
                aria-label={action.label}
                onClick={() => onNavigate(action.view)}
              >
                <span aria-hidden="true">{action.mark}</span>
              </button>
            ))}
          </nav>
        </div>
      </section>

      {error ? <p className="home-overview__error">{error}</p> : null}
      {isUsingCache ? (
        <p className="home-overview__cache">当前显示本机缓存，编辑需要联网。</p>
      ) : null}

      <section className="home-workbench" aria-labelledby="home-workbench-title">
        <div className="home-workbench__header">
          <div className="home-section-heading">
            <span>今日台面</span>
            <h2 id="home-workbench-title" className="home-visually-hidden">
              首页记录概览
            </h2>
          </div>
          <div className="home-workbench__stamp" aria-hidden="true">
            Coffee Day desk
          </div>
        </div>

        <div className="home-counter-board" aria-label="咖啡记录概览">
          {[beanStat, brewStat].map((stat) => (
            <article className="home-counter" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{isLoading ? '...' : stat.value}</strong>
              <p>{stat.caption}</p>
            </article>
          ))}
          <div className="home-counter-board__side">
            <button
              type="button"
              className="home-recommendation-card"
              onClick={() => onNavigate('recommendations')}
              aria-label="打开冲煮方案推荐"
            >
              <span className="home-recommendation-card__eyebrow">
                {recommendationStat.label}
                <em>{isLoading ? '读取中' : recommendationPreview.status}</em>
              </span>
              <strong>{isLoading ? '正在读取推荐参数' : recommendationPreview.title}</strong>
              <div className="home-recommendation-card__params" aria-hidden={isLoading}>
                {recommendationPreview.parameters.map((parameter) => (
                  <span key={parameter.label}>
                    <small>{parameter.label}</small>
                    <b>{isLoading ? '...' : parameter.value}</b>
                  </span>
                ))}
              </div>
              <p>{isLoading ? recommendationStat.caption : recommendationPreview.source}</p>
              <span className="home-recommendation-card__action">
                {recommendationPreview.actionLabel}
              </span>
            </button>

          </div>
        </div>

        <div className="home-cabinet">
          <section
            className={`home-drawer home-drawer--beans ${
              openDrawers.beans ? 'is-open' : 'is-collapsed'
            }`}
            aria-labelledby="home-beans-title"
          >
            <div className="home-drawer__top">
              <button
                type="button"
                className="home-drawer__toggle"
                onClick={() => toggleDrawer('beans')}
                aria-expanded={openDrawers.beans}
                aria-controls="home-beans-drawer"
                aria-label={openDrawers.beans ? '收起豆仓抽屉' : '展开豆仓抽屉'}
              >
                <span className="home-drawer__handle" aria-hidden="true">
                  豆
                </span>
                <span className="home-drawer__toggle-icon" aria-hidden="true" />
              </button>
              <div className="home-panel__header">
                <div>
                  <span>豆仓抽屉</span>
                  <h2 id="home-beans-title">最近豆子</h2>
                </div>
                <button type="button" onClick={() => onNavigate('beans')}>
                  管理
                </button>
              </div>
            </div>
            <div
              id="home-beans-drawer"
              className="home-drawer__body-shell"
              aria-hidden={!openDrawers.beans}
            >
              <div className="home-drawer__body">
                {isLoading ? <p className="home-empty">读取豆仓...</p> : null}
                {!isLoading && overview.currentBeans.length === 0 ? (
                  <p className="home-empty">先加一支豆子</p>
                ) : null}
                {overview.currentBeans.map((bean) => (
                  <article className="home-bean home-ledger-entry" key={bean.id}>
                    <div className="home-bean__thumb" aria-hidden="true">
                      <span>{bean.name.slice(0, 1)}</span>
                    </div>
                    <div className="home-ledger-entry__content">
                      <div className="home-ledger-entry__title-row">
                        <h3>{bean.name}</h3>
                        <span className="home-ledger-entry__tag">{bean.tag}</span>
                      </div>
                      <p className="home-ledger-entry__meta">{bean.meta}</p>
                      {bean.note ? (
                        <span className="home-ledger-entry__note">{bean.note}</span>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section
            className={`home-drawer home-drawer--brews ${
              openDrawers.brews ? 'is-open' : 'is-collapsed'
            }`}
            aria-labelledby="home-brews-title"
          >
            <div className="home-drawer__top">
              <button
                type="button"
                className="home-drawer__toggle"
                onClick={() => toggleDrawer('brews')}
                aria-expanded={openDrawers.brews}
                aria-controls="home-brews-drawer"
                aria-label={openDrawers.brews ? '收起冲煮抽屉' : '展开冲煮抽屉'}
              >
                <span className="home-drawer__handle" aria-hidden="true">
                  杯
                </span>
                <span className="home-drawer__toggle-icon" aria-hidden="true" />
              </button>
              <div className="home-panel__header">
                <div>
                  <span>冲煮抽屉</span>
                  <h2 id="home-brews-title">最近冲煮</h2>
                </div>
                <button type="button" onClick={() => onNavigate('beans')}>
                  记录
                </button>
              </div>
            </div>
            <div
              id="home-brews-drawer"
              className="home-drawer__body-shell"
              aria-hidden={!openDrawers.brews}
            >
              <div className="home-drawer__body">
                {isLoading ? <p className="home-empty">读取冲煮...</p> : null}
                {!isLoading && overview.recentBrews.length === 0 ? (
                  <p className="home-empty">还没有冲煮记录</p>
                ) : null}
                {overview.recentBrews.map((brew) => (
                  <article className="home-brew home-ledger-entry" key={brew.id}>
                    <div className="home-brew__thumb" aria-hidden="true">
                      <span>{brew.summary.slice(0, 1)}</span>
                    </div>
                    <div className="home-ledger-entry__content">
                      <div className="home-ledger-entry__title-row">
                        <h3>{brew.beanName}</h3>
                        <span className="home-ledger-entry__tag">
                          {brew.rating ?? brew.brewedAt}
                        </span>
                      </div>
                      <p className="home-ledger-entry__meta">{brew.summary}</p>
                      <span className="home-ledger-entry__note">{brew.brewedAt}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </div>

        <button
          type="button"
          className={`home-backup home-backup--${overview.backup.tone}`}
          onClick={() => onNavigate('backup')}
          aria-label="查看备份导出"
        >
          <strong>{overview.backup.title}</strong>
          <span>{overview.backup.message}</span>
        </button>
      </section>

    </section>
  )
}
