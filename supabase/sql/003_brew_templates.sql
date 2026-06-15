create table if not exists public.brew_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null,
  difficulty text not null,
  brewer text not null,
  filter text not null default '',
  dose_grams numeric not null,
  water_grams numeric not null,
  ratio text not null default '',
  water_temperature_min integer not null,
  water_temperature_max integer not null,
  grind_size text not null default '',
  target_time_min integer not null,
  target_time_max integer not null,
  pour_steps jsonb not null default '[]'::jsonb,
  suitable_for text[] not null default '{}'::text[],
  avoid_for text[] not null default '{}'::text[],
  flavor_goal text not null default '',
  adjustment_rules text[] not null default '{}'::text[],
  source_notes text not null default '',
  source_urls text[] not null default '{}'::text[],
  is_champion_reference boolean not null default false,
  copied_from_template_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists brew_templates_user_id_idx on public.brew_templates(user_id);
create index if not exists brew_templates_deleted_at_idx on public.brew_templates(deleted_at);

drop trigger if exists set_brew_templates_updated_at on public.brew_templates;
create trigger set_brew_templates_updated_at
before update on public.brew_templates
for each row execute function public.set_updated_at();

alter table public.brew_templates enable row level security;

drop policy if exists "Users manage own brew templates" on public.brew_templates;
create policy "Users manage own brew templates"
on public.brew_templates for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
