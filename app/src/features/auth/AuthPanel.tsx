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
          onSignOut={handleSignOut}
          authStatus={status}
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
        <div className="auth-logo" aria-label="咖Day Coffee Day">
          <span className="auth-logo__mark">咖</span>
          <div>
            <h1 id="auth-title">咖Day</h1>
            <small>Coffee Day</small>
          </div>
        </div>

        {configError ? (
          <div className="auth-alert" role="status">
            <strong>需要配置 Supabase</strong>
            <span>{configError}</span>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label htmlFor="email">邮箱</label>
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
              {isSubmitting ? '发送中' : '发送登录邮件'}
            </button>
          </form>
        )}

        {status ? <p className="auth-status">{status}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}
      </section>
    </div>
  )
}
