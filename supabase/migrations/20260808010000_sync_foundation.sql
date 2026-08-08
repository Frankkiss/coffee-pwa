create table public.user_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sync_epoch bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint user_sync_state_sync_epoch_check check (sync_epoch > 0)
);

create table public.sync_mutation_receipts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  device_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  operation text not null,
  committed_at timestamptz not null default now(),
  result_summary jsonb not null default '{}'::jsonb,
  constraint sync_mutation_receipts_user_mutation_key unique (user_id, mutation_id),
  constraint sync_mutation_receipts_entity_type_check
    check (entity_type in ('bean', 'brewLog', 'brewTemplate', 'userSettings')),
  constraint sync_mutation_receipts_operation_check
    check (operation in ('upsert', 'delete'))
);

alter table public.brew_templates
add column schema_version integer not null default 1;

alter table public.beans
add constraint beans_id_user_id_key unique (id, user_id);

create index sync_mutation_receipts_committed_at_idx
on public.sync_mutation_receipts(committed_at);

create index beans_active_user_updated_at_idx
on public.beans(user_id, updated_at desc)
where deleted_at is null;

create index brew_logs_active_user_brewed_at_idx
on public.brew_logs(user_id, brewed_at desc)
where deleted_at is null;

create index brew_templates_active_user_updated_at_idx
on public.brew_templates(user_id, updated_at desc)
where deleted_at is null;

create index ai_recommendations_active_user_created_at_idx
on public.ai_recommendations(user_id, created_at desc)
where deleted_at is null;

create index source_imports_active_user_created_at_idx
on public.source_imports(user_id, created_at desc)
where deleted_at is null;

alter table public.brew_logs
drop constraint brew_logs_bean_id_fkey;

alter table public.brew_logs
add constraint brew_logs_bean_user_fkey
foreign key (bean_id, user_id)
references public.beans(id, user_id)
on delete restrict
deferrable initially deferred;

alter table public.ai_recommendations
drop constraint ai_recommendations_bean_id_fkey;

alter table public.ai_recommendations
add constraint ai_recommendations_bean_user_fkey
foreign key (bean_id, user_id)
references public.beans(id, user_id)
on delete restrict
deferrable initially deferred;

alter table public.brew_logs
add constraint brew_logs_rating_range_check
check (rating is null or rating between 0 and 5)
not valid;

alter table public.brew_logs
add constraint brew_logs_sensory_range_check
check (
  (acidity is null or acidity between 0 and 5)
  and (sweetness is null or sweetness between 0 and 5)
  and (bitterness is null or bitterness between 0 and 5)
  and (astringency is null or astringency between 0 and 5)
  and (body is null or body between 0 and 5)
  and (aftertaste is null or aftertaste between 0 and 5)
)
not valid;

alter table public.brew_logs
add constraint brew_logs_measurements_check
check (
  (coffee_grams is null or coffee_grams > 0)
  and (water_grams is null or water_grams > 0)
  and (
    water_temperature_c is null
    or water_temperature_c between 0 and 100
  )
  and (total_time_seconds is null or total_time_seconds >= 0)
)
not valid;

alter table public.beans
add constraint beans_measurements_check
check (
  (altitude_meters is null or altitude_meters >= 0)
  and (net_weight_grams is null or net_weight_grams > 0)
  and (price is null or price >= 0)
)
not valid;

alter table public.brew_templates
add constraint brew_templates_measurements_check
check (
  dose_grams > 0
  and water_grams > 0
  and water_temperature_min between 0 and 100
  and water_temperature_max between 0 and 100
  and water_temperature_min <= water_temperature_max
  and target_time_min >= 0
  and target_time_max >= 0
  and target_time_min <= target_time_max
)
not valid;

alter table public.source_imports
add constraint source_imports_status_check
check (status in ('draft', 'saved', 'failed'))
not valid;

alter table public.user_settings
add constraint user_settings_backup_reminder_days_check
check (backup_reminder_days between 1 and 365)
not valid;

create trigger set_user_sync_state_updated_at
before update on public.user_sync_state
for each row execute function public.set_updated_at();

alter table public.user_sync_state enable row level security;
alter table public.sync_mutation_receipts enable row level security;

revoke all on table public.user_sync_state from public, anon, authenticated;
revoke all on table public.sync_mutation_receipts from public, anon, authenticated;
revoke all on sequence public.sync_mutation_receipts_id_seq from public, anon, authenticated;

grant select on table public.user_sync_state to authenticated;
grant select on table public.sync_mutation_receipts to authenticated;

create policy "Users can read own sync state"
on public.user_sync_state for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can read own sync receipts"
on public.sync_mutation_receipts for select
to authenticated
using (auth.uid() = user_id);

create function public.purge_expired_sync_mutation_receipts()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  deleted_count bigint;
begin
  delete from public.sync_mutation_receipts
  where committed_at < now() - interval '30 days';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke execute on function public.purge_expired_sync_mutation_receipts()
from public, anon, authenticated;
