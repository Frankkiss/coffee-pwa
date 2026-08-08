begin transaction read only;

-- Expected public tables.
select
  expected.table_name,
  (tables.table_name is not null) as table_exists
from (
  values
    ('profiles'),
    ('beans'),
    ('brew_logs'),
    ('brew_templates'),
    ('ai_recommendations'),
    ('source_imports'),
    ('backup_exports'),
    ('user_settings')
) as expected(table_name)
left join information_schema.tables as tables
  on tables.table_schema = 'public'
  and tables.table_name = expected.table_name
  and tables.table_type = 'BASE TABLE'
order by expected.table_name;

-- Record counts for user-owned data tables.
select 'beans' as table_name, count(*) as row_count from public.beans
union all
select 'brew_logs' as table_name, count(*) as row_count from public.brew_logs
union all
select 'brew_templates' as table_name, count(*) as row_count from public.brew_templates
union all
select 'ai_recommendations' as table_name, count(*) as row_count from public.ai_recommendations
union all
select 'source_imports' as table_name, count(*) as row_count from public.source_imports
union all
select 'backup_exports' as table_name, count(*) as row_count from public.backup_exports
union all
select 'user_settings' as table_name, count(*) as row_count from public.user_settings
order by table_name;

-- Row Level Security state for every expected table.
select
  expected.table_name,
  coalesce(classes.relrowsecurity, false) as rls_enabled
from (
  values
    ('profiles'),
    ('beans'),
    ('brew_logs'),
    ('brew_templates'),
    ('ai_recommendations'),
    ('source_imports'),
    ('backup_exports'),
    ('user_settings')
) as expected(table_name)
left join pg_catalog.pg_namespace as namespaces
  on namespaces.nspname = 'public'
left join pg_catalog.pg_class as classes
  on classes.relnamespace = namespaces.oid
  and classes.relname = expected.table_name
  and classes.relkind in ('r', 'p')
order by expected.table_name;

-- Public RLS policies and their effective command and checks.
select
  policies.tablename as table_name,
  policies.policyname as policy_name,
  policies.cmd,
  policies.qual,
  policies.with_check
from pg_policies as policies
where policies.schemaname = 'public'
  and policies.tablename in (
    'profiles',
    'beans',
    'brew_logs',
    'brew_templates',
    'ai_recommendations',
    'source_imports',
    'backup_exports',
    'user_settings'
  )
order by policies.tablename, policies.policyname;

-- Column definitions needed to assess schema compatibility.
select
  columns.table_name,
  columns.column_name,
  columns.data_type,
  columns.is_nullable,
  columns.column_default,
  columns.ordinal_position
from information_schema.columns as columns
where columns.table_schema = 'public'
  and columns.table_name in (
    'profiles',
    'beans',
    'brew_logs',
    'brew_templates',
    'ai_recommendations',
    'source_imports',
    'backup_exports',
    'user_settings'
  )
order by columns.table_name, columns.ordinal_position;

-- Brew-log bean references that are missing or owned by a different user.
select
  brew_logs.id as brew_log_id,
  brew_logs.user_id as brew_log_user_id,
  brew_logs.bean_id,
  beans.user_id as bean_user_id,
  case
    when beans.id is null then 'orphaned'
    else 'cross_user'
  end as relation_status
from public.brew_logs
left join public.beans
  on beans.id = brew_logs.bean_id
where brew_logs.bean_id is not null
  and (beans.id is null or beans.user_id is distinct from brew_logs.user_id)
order by brew_logs.id;

-- AI-recommendation bean references that are missing or owned by a different user.
select
  ai_recommendations.id as ai_recommendation_id,
  ai_recommendations.user_id as ai_recommendation_user_id,
  ai_recommendations.bean_id,
  beans.user_id as bean_user_id,
  case
    when beans.id is null then 'orphaned'
    else 'cross_user'
  end as relation_status
from public.ai_recommendations
left join public.beans
  on beans.id = ai_recommendations.bean_id
where ai_recommendations.bean_id is not null
  and (beans.id is null or beans.user_id is distinct from ai_recommendations.user_id)
order by ai_recommendations.id;

-- Brew sensory values outside the allowed 0..5 range.
select
  id as brew_log_id,
  rating,
  acidity,
  sweetness,
  bitterness,
  astringency,
  body,
  aftertaste
from public.brew_logs
where rating not between 0 and 5
  or acidity not between 0 and 5
  or sweetness not between 0 and 5
  or bitterness not between 0 and 5
  or astringency not between 0 and 5
  or body not between 0 and 5
  or aftertaste not between 0 and 5
order by id;

-- Brew measurements outside their allowed ranges.
select
  id as brew_log_id,
  coffee_grams,
  water_grams,
  water_temperature_c,
  total_time_seconds
from public.brew_logs
where coffee_grams <= 0
  or water_grams <= 0
  or water_temperature_c not between 0 and 100
  or total_time_seconds < 0
order by id;

-- Bean values outside their allowed ranges.
select
  id as bean_id,
  altitude_meters,
  net_weight_grams,
  price
from public.beans
where altitude_meters < 0
  or net_weight_grams <= 0
  or price < 0
order by id;

-- Brew template values and ranges that are invalid.
select
  id as brew_template_id,
  dose_grams,
  water_grams,
  water_temperature_min,
  water_temperature_max,
  target_time_min,
  target_time_max
from public.brew_templates
where dose_grams <= 0
  or water_grams <= 0
  or water_temperature_min < 0
  or water_temperature_min > 100
  or water_temperature_max < 0
  or water_temperature_max > 100
  or water_temperature_min > water_temperature_max
  or target_time_min < 0
  or target_time_max < 0
  or target_time_min > target_time_max
order by id;

-- Source imports with an unsupported workflow status.
select
  id as source_import_id,
  status
from public.source_imports
where status not in ('draft', 'saved', 'failed')
order by id;

-- Backup reminder settings outside the supported 1..365 day range.
select
  user_id,
  backup_reminder_days
from public.user_settings
where backup_reminder_days not between 1 and 365
order by user_id;

rollback;
