import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabaseConfigError, supabase } from '../../lib/supabaseClient'
import { HomeOverview } from '../home/HomeOverview'
import type { HomeNavigationTarget } from '../home/HomeOverview'
import { getAuthRedirectTo } from './authRedirect'
import './auth.css'

const BackupPanel = lazy(() =>
  import('../backup/BackupPanel').then((module) => ({ default: module.BackupPanel })),
)
const BeanDashboard = lazy(() =>
  import('../beans/BeanDashboard').then((module) => ({ default: module.BeanDashboard })),
)
const BrewTemplatePanel = lazy(() =>
  import('../brewTemplates/BrewTemplatePanel').then((module) => ({
    default: module.BrewTemplatePanel,
  })),
)
const RecommendationPanel = lazy(() =>
  import('../recommendations/RecommendationPanel').then((module) => ({
    default: module.RecommendationPanel,
  })),
)

type AppView = 'home' | HomeNavigationTarget

const appNavItems: Array<{ view: AppView; label: string; shortLabel: string }> = [
  { view: 'home', label: '首页概览', shortLabel: '首页' },
  { view: 'beans', label: '豆仓', shortLabel: '豆仓' },
  { view: 'brewTemplates', label: '模板', shortLabel: '模板' },
  { view: 'recommendations', label: '推荐', shortLabel: '推荐' },
  { view: 'backup', label: '备份', shortLabel: '备份' },
]

export function AuthPanel() {
  const [email, setEmail] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeView, setActiveView] = useState<AppView>('home')
  const configError = getSupabaseConfigError()
  const redirectTo = useMemo(
    () => getAuthRedirectTo(window.location.origin, import.meta.env.BASE_URL),
    [],
  )

  useEffect(() => {
    if (!supabase) {
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setStatus('')

    if (!supabase) {
      setError('Supabase 前端配置还没有完成。')
      return
    }

    setIsSubmitting(true)
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    })
    setIsSubmitting(false)

    if (signInError) {
      setError(signInError.message)
      return
    }

    setStatus('登录链接已发送，请检查邮箱。')
  }

  async function handleSignOut() {
    if (!supabase) {
      return
    }

    await supabase.auth.signOut()
    setStatus('已退出登录。')
  }

  function renderActiveView() {
    if (!session || !supabase) {
      return null
    }

    if (activeView === 'home') {
      return (
        <HomeOverview
          session={session}
          supabase={supabase}
          onNavigate={setActiveView}
        />
      )
    }

    if (activeView === 'brewTemplates') {
      return <BrewTemplatePanel session={session} supabase={supabase} />
    }

    if (activeView === 'beans') {
      return <BeanDashboard session={session} supabase={supabase} />
    }

    if (activeView === 'recommendations') {
      return <RecommendationPanel session={session} supabase={supabase} />
    }

    return <BackupPanel session={session} supabase={supabase} />
  }

  if (session && supabase) {
    return (
      <div className="auth-layout auth-layout--app">
        <header className="account-bar">
          <div>
            <span>当前登录邮箱</span>
            <strong>{session.user.email}</strong>
          </div>
          <button type="button" onClick={handleSignOut}>
            退出登录
          </button>
        </header>
        {status ? <p className="auth-status">{status}</p> : null}
        <main className="app-view" aria-label="咖Day 当前页面">
          <Suspense fallback={<p className="app-view__loading">正在打开页面...</p>}>
            {renderActiveView()}
          </Suspense>
        </main>
        <nav className="app-bottom-nav" aria-label="咖Day 页面导航">
          {appNavItems.map((item) => (
            <button
              key={item.view}
              type="button"
              className={activeView === item.view ? 'is-active' : ''}
              aria-current={activeView === item.view ? 'page' : undefined}
              onClick={() => setActiveView(item.view)}
            >
              <span>{item.shortLabel}</span>
              <small>{item.label}</small>
            </button>
          ))}
        </nav>
      </div>
    )
  }

  return (
    <div className="auth-layout">
      <section className="auth-panel" aria-labelledby="auth-title">
        <p className="auth-eyebrow">Cloud Sync</p>
        <h1 id="auth-title">邮箱 Magic Link 登录</h1>
        <p>用邮箱接收一次性登录链接。登录后，咖啡豆仓和冲煮记录会归属于当前用户。</p>

        {configError ? (
          <div className="auth-alert" role="status">
            <strong>等待配置</strong>
            <span>{configError}</span>
            <span>把 Supabase anon key 配到本地 `.env.local` 和 GitHub 仓库变量后即可使用。</span>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label htmlFor="email">邮箱地址</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? '发送中' : '发送登录链接'}
            </button>
          </form>
        )}

        {status ? <p className="auth-status">{status}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <dl className="auth-facts">
          <div>
            <dt>Project</dt>
            <dd>tmjpgcjcrcaxxxhqbyng</dd>
          </div>
          <div>
            <dt>Region</dt>
            <dd>Asia Pacific, Sydney</dd>
          </div>
          <div>
            <dt>Security</dt>
            <dd>Row Level Security required</dd>
          </div>
          <div>
            <dt>Redirect</dt>
            <dd>{redirectTo}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
