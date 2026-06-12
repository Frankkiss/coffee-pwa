# Supabase Auth And RLS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the coffee PWA to Supabase Auth and Postgres with Row Level Security so user data can be stored safely in the cloud.

**Architecture:** Supabase is the cloud source of truth for signed-in users. The React frontend uses the public Supabase URL and anon key, while every user-owned table includes `user_id` and RLS policies that restrict access to the current authenticated user. Service role keys and DeepSeek keys stay outside the frontend and are handled only by later Supabase Edge Function work.

**Tech Stack:** Supabase Auth, Supabase Postgres, Row Level Security, Vite, React, TypeScript, `@supabase/supabase-js`.

---

## Confirmed Supabase Project

- Dashboard URL: `https://supabase.com/dashboard/project/tmjpgcjcrcaxxxhqbyng`
- Frontend API URL: `https://tmjpgcjcrcaxxxhqbyng.supabase.co`
- Region: Asia Pacific, Sydney
- Login provider used for Supabase dashboard: GitHub

Sydney is acceptable for this project. The app is personal, mostly text-based, and writes small records. The latency tradeoff is reasonable for stronger cloud persistence.

## Scope

This plan implements:

- Local Supabase client setup.
- Environment variable wiring.
- Initial SQL schema file.
- RLS policies for user-owned data.
- Basic authentication UI placeholder.
- Smoke test for Supabase connectivity.

This plan does not implement:

- Full bean CRUD screens.
- Full brew log CRUD screens.
- DeepSeek Edge Functions.
- Source import.
- Backup/export/import.
- Offline IndexedDB queue.

Those are follow-up plans.

## Files

- Create: `supabase/sql/001_initial_schema.sql`
- Create: `supabase/README.md`
- Modify: `app/package.json`
- Modify: `app/package-lock.json`
- Modify: `app/.env.example`
- Create: `app/src/lib/supabaseClient.ts`
- Create: `app/src/features/auth/AuthPanel.tsx`
- Create: `app/src/features/auth/auth.css`
- Modify: `app/src/App.tsx`
- Modify: `app/src/App.css`

## Data Model

The first schema creates these tables:

- `profiles`: one row per authenticated user.
- `beans`: coffee bean records.
- `brew_logs`: brew records tied to beans.
- `ai_recommendations`: saved AI suggestions.
- `source_imports`: URL and supported-source import attempts.
- `backup_exports`: backup metadata.
- `user_settings`: per-user preferences and device defaults.

All user data tables include:

```sql
user_id uuid not null references auth.users(id) on delete cascade
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
deleted_at timestamptz
schema_version integer not null default 1
```

## Task 1: Add Supabase Project Metadata

**Files:**
- Modify: `app/.env.example`
- Create: `supabase/README.md`

- [ ] **Step 1: Update frontend environment example**

Set `app/.env.example` to:

```dotenv
VITE_SUPABASE_URL=https://tmjpgcjcrcaxxxhqbyng.supabase.co
VITE_SUPABASE_ANON_KEY=
```

`VITE_SUPABASE_ANON_KEY` must be copied from Supabase project settings later. Do not add `service_role` or DeepSeek keys to this file.

- [ ] **Step 2: Add Supabase README**

Create `supabase/README.md`:

```markdown
# Supabase Setup

Project dashboard:
https://supabase.com/dashboard/project/tmjpgcjcrcaxxxhqbyng

Frontend API URL:
https://tmjpgcjcrcaxxxhqbyng.supabase.co

Region:
Asia Pacific, Sydney

Rules:

- The frontend may use only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Never commit the Supabase service role key.
- Never commit DeepSeek API keys.
- Apply SQL files through the Supabase SQL editor or Supabase CLI after review.
- Keep Row Level Security enabled on all user-owned tables.
```

- [ ] **Step 3: Commit metadata**

Run:

```powershell
git add app/.env.example supabase/README.md
git commit -m "Document Supabase project metadata"
```

Expected output includes:

```text
Document Supabase project metadata
```

## Task 2: Add Initial SQL Schema

**Files:**
- Create: `supabase/sql/001_initial_schema.sql`

- [ ] **Step 1: Create SQL directory and schema file**

Create `supabase/sql/001_initial_schema.sql` with:

```sql
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  schema_version integer not null default 1
);

create table if not exists public.beans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  roaster text,
  origin text,
  farm_or_station text,
  process text,
  variety text,
  altitude_meters integer,
  roast_date date,
  roast_level text,
  flavor_tags text[] not null default '{}',
  flavor_notes text,
  net_weight_grams numeric,
  remaining_grams numeric,
  price numeric,
  purchase_date date,
  source_url text,
  image_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  schema_version integer not null default 1
);

create table if not exists public.brew_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bean_id uuid references public.beans(id) on delete set null,
  brewed_at timestamptz not null default now(),
  method text,
  dripper text,
  filter_paper text,
  grinder text,
  grind_setting text,
  coffee_grams numeric,
  water_grams numeric,
  ratio text,
  water_temperature_c numeric,
  total_time_seconds integer,
  pour_steps jsonb not null default '[]'::jsonb,
  rating numeric,
  acidity integer,
  sweetness integer,
  bitterness integer,
  astringency integer,
  body integer,
  aftertaste integer,
  flavor_tags text[] not null default '{}',
  is_pinned_recipe boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  schema_version integer not null default 1
);

create table if not exists public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bean_id uuid references public.beans(id) on delete set null,
  input_context jsonb not null default '{}'::jsonb,
  recommendation jsonb not null default '{}'::jsonb,
  model_name text,
  accepted boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  schema_version integer not null default 1
);

create table if not exists public.source_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_url text not null,
  source_type text not null,
  status text not null default 'draft',
  extracted_payload jsonb not null default '{}'::jsonb,
  selected_payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  schema_version integer not null default 1
);

create table if not exists public.backup_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  export_type text not null,
  includes_images boolean not null default false,
  file_name text,
  record_counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  schema_version integer not null default 1
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_units jsonb not null default '{}'::jsonb,
  default_gear jsonb not null default '{}'::jsonb,
  taste_preferences jsonb not null default '{}'::jsonb,
  backup_reminder_days integer not null default 7,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  schema_version integer not null default 1
);

create index if not exists beans_user_id_idx on public.beans(user_id);
create index if not exists brew_logs_user_id_idx on public.brew_logs(user_id);
create index if not exists brew_logs_bean_id_idx on public.brew_logs(bean_id);
create index if not exists ai_recommendations_user_id_idx on public.ai_recommendations(user_id);
create index if not exists source_imports_user_id_idx on public.source_imports(user_id);
create index if not exists backup_exports_user_id_idx on public.backup_exports(user_id);

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger set_beans_updated_at
before update on public.beans
for each row execute function public.set_updated_at();

create trigger set_brew_logs_updated_at
before update on public.brew_logs
for each row execute function public.set_updated_at();

create trigger set_ai_recommendations_updated_at
before update on public.ai_recommendations
for each row execute function public.set_updated_at();

create trigger set_source_imports_updated_at
before update on public.source_imports
for each row execute function public.set_updated_at();

create trigger set_backup_exports_updated_at
before update on public.backup_exports
for each row execute function public.set_updated_at();

create trigger set_user_settings_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();
```

- [ ] **Step 2: Commit SQL schema**

Run:

```powershell
git add supabase/sql/001_initial_schema.sql
git commit -m "Add initial Supabase schema"
```

Expected output includes:

```text
Add initial Supabase schema
```

## Task 3: Add Row Level Security Policies

**Files:**
- Modify: `supabase/sql/001_initial_schema.sql`

- [ ] **Step 1: Append RLS policies**

Append this SQL to `supabase/sql/001_initial_schema.sql`:

```sql
alter table public.profiles enable row level security;
alter table public.beans enable row level security;
alter table public.brew_logs enable row level security;
alter table public.ai_recommendations enable row level security;
alter table public.source_imports enable row level security;
alter table public.backup_exports enable row level security;
alter table public.user_settings enable row level security;

create policy "Users can read own profile"
on public.profiles for select
using (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Users can insert own profile"
on public.profiles for insert
with check (auth.uid() = id);

create policy "Users manage own beans"
on public.beans for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users manage own brew logs"
on public.brew_logs for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users manage own AI recommendations"
on public.ai_recommendations for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users manage own source imports"
on public.source_imports for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users manage own backup exports"
on public.backup_exports for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users manage own settings"
on public.user_settings for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

- [ ] **Step 2: Commit RLS policies**

Run:

```powershell
git add supabase/sql/001_initial_schema.sql
git commit -m "Add Supabase row level security policies"
```

Expected output includes:

```text
Add Supabase row level security policies
```

## Task 4: Install Supabase Client

**Files:**
- Modify: `app/package.json`
- Modify: `app/package-lock.json`

- [ ] **Step 1: Install client library**

Run:

```powershell
npm install --prefix app @supabase/supabase-js
```

Expected output includes:

```text
found 0 vulnerabilities
```

- [ ] **Step 2: Run build**

Run:

```powershell
npm run build --prefix app
```

Expected output includes:

```text
✓ built in
```

- [ ] **Step 3: Commit dependency**

Run:

```powershell
git add app/package.json app/package-lock.json
git commit -m "Add Supabase JavaScript client"
```

Expected output includes:

```text
Add Supabase JavaScript client
```

## Task 5: Add Supabase Client Module

**Files:**
- Create: `app/src/lib/supabaseClient.ts`

- [ ] **Step 1: Create client module**

Create `app/src/lib/supabaseClient.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl) {
  throw new Error('Missing VITE_SUPABASE_URL')
}

if (!supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

- [ ] **Step 2: Run build without local env**

Run:

```powershell
npm run build --prefix app
```

Expected result before `.env.local` exists:

```text
Build succeeds because the module is not imported yet.
```

- [ ] **Step 3: Commit client module**

Run:

```powershell
git add app/src/lib/supabaseClient.ts
git commit -m "Add Supabase client module"
```

Expected output includes:

```text
Add Supabase client module
```

## Task 6: Add Auth UI Placeholder

**Files:**
- Create: `app/src/features/auth/AuthPanel.tsx`
- Create: `app/src/features/auth/auth.css`
- Modify: `app/src/App.tsx`
- Modify: `app/src/App.css`

- [ ] **Step 1: Create AuthPanel**

Create `app/src/features/auth/AuthPanel.tsx`:

```tsx
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
```

- [ ] **Step 2: Create auth CSS**

Create `app/src/features/auth/auth.css`:

```css
.auth-panel {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(21, 24, 28, 0.72);
}

.auth-eyebrow {
  margin: 0;
  color: #72d6a3;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.auth-panel h1 {
  margin: 0;
  font-size: clamp(1.6rem, 4vw, 2.8rem);
  line-height: 1.1;
}

.auth-panel p {
  margin: 0;
  color: #c7d0d9;
  line-height: 1.7;
}

.auth-facts {
  display: grid;
  gap: 0.75rem;
  margin: 0;
}

.auth-facts div {
  display: grid;
  gap: 0.25rem;
  padding: 0.75rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
}

.auth-facts dt {
  color: #8ea0ad;
  font-size: 0.78rem;
}

.auth-facts dd {
  margin: 0;
  color: #f7fafc;
  word-break: break-word;
}
```

- [ ] **Step 3: Import AuthPanel in App**

Replace `app/src/App.tsx` with:

```tsx
import './App.css'
import { AuthPanel } from './features/auth/AuthPanel'

function App() {
  return (
    <main className="app-shell">
      <AuthPanel />
    </main>
  )
}

export default App
```

- [ ] **Step 4: Replace App CSS**

Replace `app/src/App.css` with:

```css
.app-shell {
  min-height: 100vh;
  display: grid;
  align-items: center;
  padding: 1rem;
  background:
    radial-gradient(circle at 20% 20%, rgba(114, 214, 163, 0.16), transparent 26rem),
    #111418;
  color: #f7fafc;
}

@media (min-width: 760px) {
  .app-shell {
    padding: 3rem;
  }
}
```

- [ ] **Step 5: Run build**

Run:

```powershell
npm run build --prefix app
```

Expected output includes:

```text
✓ built in
```

- [ ] **Step 6: Commit auth placeholder**

Run:

```powershell
git add app/src/features/auth/AuthPanel.tsx app/src/features/auth/auth.css app/src/App.tsx app/src/App.css
git commit -m "Add Supabase auth setup placeholder"
```

Expected output includes:

```text
Add Supabase auth setup placeholder
```

## Task 7: Apply SQL In Supabase Dashboard

**Files:**
- No committed file changes.

- [ ] **Step 1: Open SQL editor**

Open:

```text
https://supabase.com/dashboard/project/tmjpgcjcrcaxxxhqbyng/sql
```

- [ ] **Step 2: Paste reviewed SQL**

Paste the full contents of:

```text
supabase/sql/001_initial_schema.sql
```

- [ ] **Step 3: Run SQL**

Click:

```text
Run
```

Expected:

```text
Success. No rows returned
```

- [ ] **Step 4: Verify tables**

Open Table Editor and confirm these tables exist:

```text
profiles
beans
brew_logs
ai_recommendations
source_imports
backup_exports
user_settings
```

## Task 8: Final Verification

**Files:**
- No file changes unless fixing failures.

- [ ] **Step 1: Run local build**

Run:

```powershell
npm run build --prefix app
```

Expected output includes:

```text
✓ built in
```

- [ ] **Step 2: Check git status**

Run:

```powershell
git status --short --branch
```

Expected:

```text
## foundation...origin/foundation
```

- [ ] **Step 3: Push branch**

Run:

```powershell
git push
```

Expected output includes:

```text
foundation -> foundation
```

## Follow-Up Plans

After this plan succeeds, write separate plans for:

1. Real login flow.
2. Bean CRUD backed by Supabase.
3. Brew log CRUD backed by Supabase.
4. Backup/export/import.
5. DeepSeek recommendation Edge Function.
6. Source import and `coffeer.net/beans` adapter.
