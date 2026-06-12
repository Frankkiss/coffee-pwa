import './auth.css'

export function AuthPanel() {
  return (
    <section className="auth-panel" aria-labelledby="auth-title">
      <p className="auth-eyebrow">Cloud Sync</p>
      <h1 id="auth-title">咖啡数据将保存到 Supabase</h1>
      <p>
        下一步会接入登录。当前阶段先确认云数据库地址、数据表和权限策略，
        避免后续记录咖啡豆时出现数据归属不清的问题。
      </p>
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
      </dl>
    </section>
  )
}
