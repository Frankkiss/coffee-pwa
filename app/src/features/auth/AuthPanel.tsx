import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { CoffeeDayLogo } from '../../components/CoffeeDayLogo'
import { getSupabaseConfigError, supabase } from '../../lib/supabaseClient'
import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import { HomeOverview } from '../home/HomeOverview'
import type { HomeNavigationTarget } from '../home/HomeOverview'
import { SyncProvider, useSyncRuntime } from '../sync/SyncContext'
import { SyncStatusBanner } from '../sync/SyncStatusBanner'
import {
  confirmAndSignOut,
  createSignOutSingleFlight,
  pendingCountForSignOut,
} from './signOutGuard'
import {
  validateEmail,
  validateLoginForm,
  validateNewPasswordForm,
  validateResetRequestForm,
  validateSignupForm,
} from './authForm'
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
type AuthMode = 'password-login' | 'signup' | 'magic-link' | 'reset-request'

const appNavItems: Array<{ view: AppView; label: string; mark: string }> = [
  { view: 'home', label: '主页', mark: '咖' },
  { view: 'beans', label: '豆仓与冲煮', mark: '豆' },
  { view: 'brewTemplates', label: '冲煮模板', mark: '模' },
  { view: 'recommendations', label: '冲煮推荐', mark: '荐' },
  { view: 'backup', label: '备份', mark: '存' },
]

const previewSession = {
  access_token: 'home-preview',
  refresh_token: 'home-preview',
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id: 'home-preview-user',
    email: 'coffee@day.local',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-06-18T00:00:00.000Z',
  },
} as Session

const previewBeans: Bean[] = [
  {
    id: 'bean-1',
    user_id: previewSession.user.id,
    name: '埃塞俄比亚 桃子甜感',
    roaster: '咖Day 小柜',
    origin: 'Ethiopia',
    farm_or_station: 'Banko Gotiti',
    process: '水洗',
    variety: 'Heirloom',
    altitude_meters: 2100,
    roast_date: '2026-06-14',
    roast_level: '浅烘',
    flavor_tags: ['白桃', '茉莉', '蜂蜜'],
    flavor_notes: '轻盈花香，冷下来更甜。',
    net_weight_grams: 100,
    price: null,
    purchase_date: '2026-06-15',
    source_url: null,
    image_url: null,
    bean_type: 'single_origin',
    blend_components: [],
    blend_notes: null,
    notes: null,
    created_at: '2026-06-18T08:00:00.000Z',
    updated_at: '2026-06-18T08:00:00.000Z',
    deleted_at: null,
    schema_version: 1,
  },
  {
    id: 'bean-2',
    user_id: previewSession.user.id,
    name: '哥伦比亚 黄水果拼盘',
    roaster: '周末烘焙',
    origin: 'Colombia',
    farm_or_station: 'La Esperanza',
    process: '厌氧日晒',
    variety: 'Caturra',
    altitude_meters: 1850,
    roast_date: '2026-06-10',
    roast_level: '中浅烘',
    flavor_tags: ['芒果', '红茶', '焦糖'],
    flavor_notes: '适合慢一点的早晨。',
    net_weight_grams: 200,
    price: null,
    purchase_date: '2026-06-12',
    source_url: null,
    image_url: null,
    bean_type: 'single_origin',
    blend_components: [],
    blend_notes: null,
    notes: null,
    created_at: '2026-06-17T08:00:00.000Z',
    updated_at: '2026-06-17T08:00:00.000Z',
    deleted_at: null,
    schema_version: 1,
  },
  {
    id: 'bean-3',
    user_id: previewSession.user.id,
    name: '早餐拼配 榛果可可',
    roaster: 'Coffee Day',
    origin: 'Brazil / Guatemala',
    farm_or_station: null,
    process: '拼配',
    variety: null,
    altitude_meters: null,
    roast_date: '2026-06-08',
    roast_level: '中烘',
    flavor_tags: ['榛果', '可可', '奶油'],
    flavor_notes: '牛奶和手冲都稳。',
    net_weight_grams: 227,
    price: null,
    purchase_date: '2026-06-11',
    source_url: null,
    image_url: null,
    bean_type: 'blend',
    blend_components: [],
    blend_notes: null,
    notes: null,
    created_at: '2026-06-16T08:00:00.000Z',
    updated_at: '2026-06-16T08:00:00.000Z',
    deleted_at: null,
    schema_version: 1,
  },
]

const previewBrewLogs: BrewLog[] = [
  {
    id: 'brew-1',
    user_id: previewSession.user.id,
    bean_id: 'bean-1',
    brewed_at: '2026-06-18T07:42:00.000Z',
    method: '手冲',
    dripper: 'V60',
    filter_paper: '01',
    grinder: 'C40',
    grind_setting: '22 click',
    coffee_grams: 15,
    water_grams: 240,
    ratio: '1:16',
    water_temperature_c: 92,
    total_time_seconds: 138,
    pour_steps: [],
    rating: 4.6,
    acidity: 4,
    sweetness: 5,
    bitterness: 1,
    astringency: 1,
    body: 3,
    aftertaste: 4,
    flavor_tags: ['桃子', '蜂蜜'],
    is_pinned_recipe: true,
    notes: '第一段小水量，甜感更干净。',
    created_at: '2026-06-18T07:45:00.000Z',
    updated_at: '2026-06-18T07:45:00.000Z',
    deleted_at: null,
    schema_version: 1,
  },
  {
    id: 'brew-2',
    user_id: previewSession.user.id,
    bean_id: 'bean-2',
    brewed_at: '2026-06-17T21:08:00.000Z',
    method: '手冲',
    dripper: 'Origami',
    filter_paper: 'Kalita',
    grinder: 'C40',
    grind_setting: '24 click',
    coffee_grams: 16,
    water_grams: 250,
    ratio: '1:15.6',
    water_temperature_c: 90,
    total_time_seconds: 152,
    pour_steps: [],
    rating: 4.3,
    acidity: 3,
    sweetness: 4,
    bitterness: 1,
    astringency: 1,
    body: 4,
    aftertaste: 4,
    flavor_tags: ['芒果', '红茶'],
    is_pinned_recipe: false,
    notes: '尾段不用拉太长。',
    created_at: '2026-06-17T21:12:00.000Z',
    updated_at: '2026-06-17T21:12:00.000Z',
    deleted_at: null,
    schema_version: 1,
  },
]

export function AuthPanel() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [authMode, setAuthMode] = useState<AuthMode>('password-login')
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeView, setActiveView] = useState<AppView>('home')
  const configError = getSupabaseConfigError()
  const isHomePreview =
    import.meta.env.DEV && new URLSearchParams(window.location.search).has('homePreview')
  const isBeanPreview =
    import.meta.env.DEV && new URLSearchParams(window.location.search).has('beanPreview')
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
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true)
        setAuthMode('password-login')
        setStatus('请输入新密码完成重置。')
      }

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

    const normalizedEmail = email.trim()
    const validationError = getAuthValidationError(
      authMode,
      normalizedEmail,
      password,
      confirmPassword,
    )

    if (validationError) {
      setError(validationError)
      return
    }

    setIsSubmitting(true)

    try {
      if (authMode === 'password-login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        })

        if (signInError) {
          setError(signInError.message)
          return
        }

        return
      }

      if (authMode === 'signup') {
        const { error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: redirectTo,
          },
        })

        if (signUpError) {
          setError(signUpError.message)
          return
        }

        setStatus('注册请求已提交。如果需要验证邮箱，请先查看邮箱。')
        return
      }

      if (authMode === 'reset-request') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          normalizedEmail,
          { redirectTo },
        )

        if (resetError) {
          setError(resetError.message)
          return
        }

        setStatus('重置密码邮件已发送，请查看邮箱。')
        return
      }

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: redirectTo,
        },
      })

      if (otpError) {
        setError(otpError.message)
        return
      }

      setStatus('登录链接已发送，请检查邮箱。')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleUpdatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setStatus('')

    if (!supabase) {
      setError('Supabase 前端配置还没有完成。')
      return
    }

    const validationError = validateNewPasswordForm(password, confirmPassword)

    if (validationError) {
      setError(validationError)
      return
    }

    setIsSubmitting(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setIsSubmitting(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setPassword('')
    setConfirmPassword('')
    setIsPasswordRecovery(false)
    setStatus('密码已更新。')
  }

  if (session && supabase && isPasswordRecovery) {
    return (
      <div className="auth-layout">
        <section className="auth-panel" aria-labelledby="auth-title">
          <AuthLogo title="设置新密码" />
          <form className="auth-form" onSubmit={handleUpdatePassword}>
            <label htmlFor="new-password">新密码</label>
            <input
              id="new-password"
              name="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <label htmlFor="confirm-new-password">确认新密码</label>
            <input
              id="confirm-new-password"
              name="confirm-new-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? '保存中' : '保存新密码'}
            </button>
          </form>
          {status ? <p className="auth-status">{status}</p> : null}
          {error ? <p className="auth-error">{error}</p> : null}
        </section>
      </div>
    )
  }

  if (isHomePreview) {
    return (
      <div className="auth-layout auth-layout--app">
        <main className="app-view" aria-label="咖Day 首页预览">
          <HomeOverview
            session={previewSession}
            supabase={{} as SupabaseClient}
            onNavigate={(view) => setStatus(`预览模式：${view} 页面未打开。`)}
            onSignOut={() => setStatus('预览模式不需要退出登录。')}
            authStatus={status || '本地首页预览，不连接 Supabase。'}
            previewRows={{ beans: previewBeans, brewLogs: previewBrewLogs }}
            syncState={{ kind: 'offline', pendingCount: 0 }}
          />
        </main>
      </div>
    )
  }

  if (isBeanPreview) {
    return (
      <div className="auth-layout auth-layout--app">
        <main className="app-view" aria-label="咖Day 数字豆仓预览">
          <Suspense fallback={<p className="app-view__loading">正在打开数字豆仓...</p>}>
            <BeanDashboard
              session={previewSession}
              supabase={{} as SupabaseClient}
              previewRows={{ beans: previewBeans, brewLogs: previewBrewLogs }}
            />
          </Suspense>
        </main>
      </div>
    )
  }

  if (session && supabase) {
    return (
      <SyncProvider session={session} supabase={supabase}>
        <AuthenticatedApp
          session={session}
          supabase={supabase}
          activeView={activeView}
          onNavigate={setActiveView}
          authStatus={status}
          onSignedOut={() => setStatus('已退出登录。')}
        />
      </SyncProvider>
    )
  }

  return (
    <div className="auth-layout">
      <section className="auth-panel" aria-labelledby="auth-title">
        <AuthLogo title="咖Day" />

        {configError ? (
          <div className="auth-alert" role="status">
            <strong>需要配置 Supabase</strong>
            <span>{configError}</span>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-mode-tabs" role="tablist" aria-label="登录方式">
              <button
                type="button"
                className={authMode === 'password-login' ? 'is-active' : ''}
                onClick={() => setAuthMode('password-login')}
              >
                密码登录
              </button>
              <button
                type="button"
                className={authMode === 'signup' ? 'is-active' : ''}
                onClick={() => setAuthMode('signup')}
              >
                注册
              </button>
              <button
                type="button"
                className={authMode === 'magic-link' ? 'is-active' : ''}
                onClick={() => setAuthMode('magic-link')}
              >
                邮箱链接
              </button>
            </div>
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
            {authMode === 'password-login' || authMode === 'signup' ? (
              <>
                <label htmlFor="password">密码</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </>
            ) : null}
            {authMode === 'signup' ? (
              <>
                <label htmlFor="confirm-password">确认密码</label>
                <input
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </>
            ) : null}
            <button type="submit" disabled={isSubmitting}>
              {getSubmitLabel(authMode, isSubmitting)}
            </button>
            <div className="auth-secondary-actions">
              {authMode === 'password-login' ? (
                <button type="button" onClick={() => setAuthMode('reset-request')}>
                  忘记密码
                </button>
              ) : null}
              {authMode === 'reset-request' ? (
                <button type="button" onClick={() => setAuthMode('password-login')}>
                  返回密码登录
                </button>
              ) : null}
            </div>
          </form>
        )}

        {status ? <p className="auth-status">{status}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}
      </section>
    </div>
  )
}

function AuthenticatedApp({
  session,
  supabase: authenticatedSupabase,
  activeView,
  onNavigate,
  authStatus,
  onSignedOut,
}: {
  session: Session
  supabase: SupabaseClient
  activeView: AppView
  onNavigate: (view: AppView) => void
  authStatus: string
  onSignedOut: () => void
}) {
  const runtime = useSyncRuntime()
  const [signOutError, setSignOutError] = useState('')
  const [isSigningOut, setIsSigningOut] = useState(false)
  const mountedRef = useRef(true)
  const [signOutFlight] = useState(() =>
    createSignOutSingleFlight(setIsSigningOut),
  )
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  async function handleSignOut() {
    await signOutFlight.run(async () => {
      setSignOutError('')
      try {
        const signedOut = await confirmAndSignOut(
          pendingCountForSignOut(runtime.outboxLoaded, runtime.pendingCount),
          runtime.attentionItems.length,
          window.confirm,
          runtime.suspendForSignOut,
          () => authenticatedSupabase.auth.signOut(),
        )
        if (signedOut && mountedRef.current) onSignedOut()
      } catch {
        if (mountedRef.current) {
          setSignOutError('退出失败，请检查网络后重试。')
        }
      }
    })
  }

  function renderActiveView() {
    if (activeView === 'home') {
      return (
        <HomeOverview
          session={session}
          supabase={authenticatedSupabase}
          onNavigate={onNavigate}
          onSignOut={handleSignOut}
          isSigningOut={isSigningOut}
          authStatus={authStatus}
          syncState={runtime.state}
        />
      )
    }
    if (activeView === 'brewTemplates') {
      return <BrewTemplatePanel session={session} supabase={authenticatedSupabase} />
    }
    if (activeView === 'beans') {
      return <BeanDashboard session={session} supabase={authenticatedSupabase} />
    }
    if (activeView === 'recommendations') {
      return <RecommendationPanel session={session} supabase={authenticatedSupabase} />
    }
    return <BackupPanel session={session} supabase={authenticatedSupabase} />
  }

  return (
    <div className="auth-layout auth-layout--app">
      <main className="app-view" aria-label="咖Day 当前页面">
        <SyncStatusBanner />
        {signOutError ? (
          <p className="auth-error" role="alert">{signOutError}</p>
        ) : null}
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
            aria-label={item.label}
            onClick={() => onNavigate(item.view)}
          >
            <span>{item.mark}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

function AuthLogo({ title }: { title: string }) {
  return <CoffeeDayLogo headingId="auth-title" title={title} variant="login" />
}

function getAuthValidationError(
  authMode: AuthMode,
  email: string,
  password: string,
  confirmPassword: string,
) {
  if (authMode === 'password-login') {
    return validateLoginForm(email, password)
  }

  if (authMode === 'signup') {
    return validateSignupForm(email, password, confirmPassword)
  }

  if (authMode === 'reset-request') {
    return validateResetRequestForm(email)
  }

  return validateEmail(email)
}

function getSubmitLabel(authMode: AuthMode, isSubmitting: boolean) {
  if (isSubmitting) {
    return '处理中'
  }

  if (authMode === 'password-login') {
    return '登录'
  }

  if (authMode === 'signup') {
    return '注册'
  }

  if (authMode === 'reset-request') {
    return '发送重置邮件'
  }

  return '发送登录邮件'
}
