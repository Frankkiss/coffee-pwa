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
  authStatus?: string
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

const quickActions: Array<{ label: string; mark: string; view: HomeNavigationTarget }> = [
  { label: '加豆', mark: '豆', view: 'beans' },
  { label: '导入', mark: '扫', view: 'beans' },
  { label: '模板', mark: '模', view: 'brewTemplates' },
  { label: '推荐', mark: '荐', view: 'recommendations' },
  { label: '备份', mark: '存', view: 'backup' },
]

const lifeNotes = [
  '今天这杯，先给自己留三分钟 ( ˘ω˘ )',
  '豆子会醒，记录也会慢慢变香 ´▽`',
  '水烧开之前，想好第一段注水 ᕕ( ᐛ )ᕗ',
  '不赶时间的时候，咖啡更容易好喝 (•̀ᴗ•́)و',
]

export function HomeOverview({
  session,
  supabase,
  onNavigate,
  onSignOut,
  authStatus,
}: HomeOverviewProps) {
  const [rows, setRows] = useState<HomeRows>({ beans: [], brewLogs: [] })
  const [isLoading, setIsLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [isUsingCache, setIsUsingCache] = useState(false)
  const [error, setError] = useState('')
  const [lifeNoteIndex, setLifeNoteIndex] = useState(0)

  useEffect(() => {
    let isMounted = true

    async function loadRows() {
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
  }, [session.user.id, supabase])

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
        isOnline,
      }),
    [isOnline, rows.beans, rows.brewLogs, session.user.email],
  )

  return (
    <section className="home-overview" aria-labelledby="home-overview-title">
      <div className="home-hero">
        <div className="home-hero__topline">
          <span className={`home-sync-dot ${isOnline ? 'is-online' : 'is-offline'}`}>
            {isOnline ? '在线' : '离线'}
          </span>
          <button type="button" onClick={onSignOut}>
            退出
          </button>
        </div>
        <div className="home-hero__brand">
          <CoffeeDayLogo headingId="home-overview-title" title="咖Day" variant="hero" />
          <p>
            {overview.accountLabel}
            <span>{isUsingCache ? '离线缓存' : overview.syncLabel}</span>
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

      <nav className="home-actions" aria-label="首页快捷操作">
        {quickActions.map((action) => (
          <button key={action.label} type="button" onClick={() => onNavigate(action.view)}>
            <span aria-hidden="true">{action.mark}</span>
            <strong>{action.label}</strong>
          </button>
        ))}
      </nav>

      {error ? <p className="home-overview__error">{error}</p> : null}
      {isUsingCache ? (
        <p className="home-overview__cache">当前显示本机缓存，编辑需要联网。</p>
      ) : null}

      <div className="home-stats" aria-label="咖啡记录概览">
        {overview.stats.map((stat) => (
          <article className="home-stat" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{isLoading ? '...' : stat.value}</strong>
            <p>{stat.caption}</p>
          </article>
        ))}
      </div>

      <div className="home-panels">
        <section className="home-panel" aria-labelledby="home-beans-title">
          <div className="home-panel__header">
            <h2 id="home-beans-title">最近豆子</h2>
            <button type="button" onClick={() => onNavigate('beans')}>
              管理
            </button>
          </div>
          {isLoading ? <p className="home-empty">读取豆仓...</p> : null}
          {!isLoading && overview.currentBeans.length === 0 ? (
            <p className="home-empty">先加一支豆子。</p>
          ) : null}
          {overview.currentBeans.map((bean) => (
            <article className="home-bean" key={bean.id}>
              <div className="home-bean__thumb" aria-hidden="true">
                {bean.name.slice(0, 1)}
              </div>
              <div>
                <h3>{bean.name}</h3>
                <p>{bean.meta}</p>
                <span>{bean.note}</span>
              </div>
            </article>
          ))}
        </section>

        <section className="home-panel" aria-labelledby="home-brews-title">
          <div className="home-panel__header">
            <h2 id="home-brews-title">最近冲煮</h2>
            <button type="button" onClick={() => onNavigate('beans')}>
              记录
            </button>
          </div>
          {isLoading ? <p className="home-empty">读取冲煮...</p> : null}
          {!isLoading && overview.recentBrews.length === 0 ? (
            <p className="home-empty">还没有冲煮记录。</p>
          ) : null}
          {overview.recentBrews.map((brew) => (
            <article className="home-brew" key={brew.id}>
              <div>
                <h3>{brew.beanName}</h3>
                <p>{brew.summary}</p>
              </div>
              <span>{brew.rating ?? brew.brewedAt}</span>
            </article>
          ))}
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
  )
}
