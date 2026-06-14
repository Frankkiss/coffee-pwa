import { useEffect, useMemo, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
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
}

type HomeRows = {
  beans: Bean[]
  brewLogs: BrewLog[]
}

const quickActions = [
  { label: '新增咖啡豆', href: '#bean-dashboard' },
  { label: '来源导入', href: '#source-import' },
  { label: '记录冲煮', href: '#brew-log' },
  { label: 'AI 推荐', href: '#recommendation' },
  { label: '备份导出', href: '#backup' },
]

export function HomeOverview({ session, supabase }: HomeOverviewProps) {
  const [rows, setRows] = useState<HomeRows>({ beans: [], brewLogs: [] })
  const [isLoading, setIsLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [isUsingCache, setIsUsingCache] = useState(false)
  const [error, setError] = useState('')

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
        <div>
          <p className="home-overview__eyebrow">Ka Day</p>
          <h1 id="home-overview-title">咖Day</h1>
          <p>
            {overview.accountLabel}，今天也记录一杯。
            {isUsingCache ? '离线缓存可用' : overview.syncLabel}
          </p>
        </div>
        <div className="home-hero__cup" aria-hidden="true">
          <span />
        </div>
      </div>

      <nav className="home-actions" aria-label="首页快捷操作">
        {quickActions.map((action) => (
          <a key={action.href} href={action.href}>
            {action.label}
          </a>
        ))}
      </nav>

      {error ? <p className="home-overview__error">{error}</p> : null}
      {isUsingCache ? (
        <p className="home-overview__cache">正在显示本机缓存，新增和编辑仍需要联网。</p>
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
            <a href="#bean-dashboard">管理</a>
          </div>
          {isLoading ? <p className="home-empty">正在读取豆仓...</p> : null}
          {!isLoading && overview.currentBeans.length === 0 ? (
            <p className="home-empty">还没有咖啡豆，先新增第一支豆子。</p>
          ) : null}
          {overview.currentBeans.map((bean) => (
            <article className="home-bean" key={bean.id}>
              <div className="home-bean__thumb" aria-hidden="true">
                {bean.name.slice(0, 1)}
              </div>
              <div>
                <h3>{bean.name}</h3>
                <p>{bean.meta}</p>
                <span>{bean.remainingLabel ?? bean.note}</span>
              </div>
            </article>
          ))}
        </section>

        <section className="home-panel" aria-labelledby="home-brews-title">
          <div className="home-panel__header">
            <h2 id="home-brews-title">最近冲煮</h2>
            <a href="#brew-log">记录</a>
          </div>
          {isLoading ? <p className="home-empty">正在读取冲煮记录...</p> : null}
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

      <a
        className={`home-backup home-backup--${overview.backup.tone}`}
        href="#backup"
        aria-label="查看备份导出"
      >
        <strong>{overview.backup.title}</strong>
        <span>{overview.backup.message}</span>
      </a>
    </section>
  )
}
