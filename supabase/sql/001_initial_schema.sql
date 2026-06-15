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
  bean_type text not null default 'single_origin',
  blend_components jsonb not null default '[]'::jsonb,
  blend_notes text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  schema_version integer not null default 1,
  constraint beans_bean_type_check check (bean_type in ('single_origin', 'blend'))
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

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_beans_updated_at on public.beans;
create trigger set_beans_updated_at
before update on public.beans
for each row execute function public.set_updated_at();

drop trigger if exists set_brew_logs_updated_at on public.brew_logs;
create trigger set_brew_logs_updated_at
before update on public.brew_logs
for each row execute function public.set_updated_at();

drop trigger if exists set_ai_recommendations_updated_at on public.ai_recommendations;
create trigger set_ai_recommendations_updated_at
before update on public.ai_recommendations
for each row execute function public.set_updated_at();

drop trigger if exists set_source_imports_updated_at on public.source_imports;
create trigger set_source_imports_updated_at
before update on public.source_imports
for each row execute function public.set_updated_at();

drop trigger if exists set_backup_exports_updated_at on public.backup_exports;
create trigger set_backup_exports_updated_at
before update on public.backup_exports
for each row execute function public.set_updated_at();

drop trigger if exists set_user_settings_updated_at on public.user_settings;
create trigger set_user_settings_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.beans enable row level security;
alter table public.brew_logs enable row level security;
alter table public.ai_recommendations enable row level security;
alter table public.source_imports enable row level security;
alter table public.backup_exports enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select
using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles for insert
with check (auth.uid() = id);

drop policy if exists "Users manage own beans" on public.beans;
create policy "Users manage own beans"
on public.beans for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own brew logs" on public.brew_logs;
create policy "Users manage own brew logs"
on public.brew_logs for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own AI recommendations" on public.ai_recommendations;
create policy "Users manage own AI recommendations"
on public.ai_recommendations for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own source imports" on public.source_imports;
create policy "Users manage own source imports"
on public.source_imports for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own backup exports" on public.backup_exports;
create policy "Users manage own backup exports"
on public.backup_exports for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own settings" on public.user_settings;
create policy "Users manage own settings"
on public.user_settings for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
