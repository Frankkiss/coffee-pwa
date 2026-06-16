import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabaseConfigError, supabase } from '../../lib/supabaseClient'
import { HomeOverview } from '../home/HomeOverview'
import type { HomeNavigationTarget } from '../home/HomeOverview'
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

const appNavItems: Array<{ view: AppView; label: string }> = [
  { view: 'home', label: '主页' },
  { view: 'beans', label: '豆仓与冲煮' },
  { view: 'brewTemplates', label: '冲煮模板' },
  { view: 'recommendations', label: '冲煮推荐' },
  { view: 'backup', label: '备份' },
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

        setStatus('登录成功。')
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
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
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

function AuthLogo({ title }: { title: string }) {
  return (
    <div className="auth-logo" aria-label="咖Day Coffee Day">
      <span className="auth-logo__mark">咖</span>
      <div>
        <h1 id="auth-title">{title}</h1>
        <small>Coffee Day</small>
      </div>
    </div>
  )
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
