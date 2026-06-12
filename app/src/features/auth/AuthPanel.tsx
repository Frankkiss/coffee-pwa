import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabaseConfigError, supabase } from '../../lib/supabaseClient'
import { getAuthRedirectTo } from './authRedirect'
import './auth.css'

export function AuthPanel() {
  const [email, setEmail] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
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

  return (
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
      ) : session ? (
        <div className="auth-session">
          <span>当前登录邮箱</span>
          <strong>{session.user.email}</strong>
          <button type="button" onClick={handleSignOut}>
            退出登录
          </button>
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
  )
}
