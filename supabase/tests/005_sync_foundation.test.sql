begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(155);

-- 1. Technical sync tables exist.
select has_table('public', 'user_sync_state', 'user_sync_state exists');
-- 2.
select has_table('public', 'sync_mutation_receipts', 'sync_mutation_receipts exists');

-- 3. user_sync_state columns use the required types, nullability, and defaults.
select is(
  (
    select format('%s|%s|%s', udt_name, is_nullable, column_default is not null)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_sync_state'
      and column_name = 'user_id'
  ),
  'uuid|NO|f',
  'user_sync_state.user_id is a required uuid without a default'
);
-- 4.
select is(
  (
    select format('%s|%s|%s', udt_name, is_nullable, column_default is not null)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_sync_state'
      and column_name = 'sync_epoch'
  ),
  'int8|NO|t',
  'user_sync_state.sync_epoch is a required bigint with a default'
);
-- 5.
select is(
  (
    select format('%s|%s|%s', udt_name, is_nullable, column_default is not null)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_sync_state'
      and column_name = 'updated_at'
  ),
  'timestamptz|NO|t',
  'user_sync_state.updated_at is a required server timestamp with a default'
);

-- 6. sync_mutation_receipts columns use the required types and identity/default properties.
select is(
  (
    select format('%s|%s|%s', udt_name, is_nullable, is_identity)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sync_mutation_receipts'
      and column_name = 'id'
  ),
  'int8|NO|YES',
  'sync_mutation_receipts.id is a required bigint identity'
);
-- 7.
select is(
  (
    select format('%s|%s', udt_name, is_nullable)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sync_mutation_receipts'
      and column_name = 'user_id'
  ),
  'uuid|NO',
  'sync_mutation_receipts.user_id is a required uuid'
);
-- 8.
select is(
  (
    select format('%s|%s', udt_name, is_nullable)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sync_mutation_receipts'
      and column_name = 'mutation_id'
  ),
  'uuid|NO',
  'sync_mutation_receipts.mutation_id is a required uuid'
);
-- 9.
select is(
  (
    select format('%s|%s', udt_name, is_nullable)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sync_mutation_receipts'
      and column_name = 'device_id'
  ),
  'uuid|NO',
  'sync_mutation_receipts.device_id is a required uuid'
);
-- 10.
select is(
  (
    select format('%s|%s', udt_name, is_nullable)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sync_mutation_receipts'
      and column_name = 'entity_type'
  ),
  'text|NO',
  'sync_mutation_receipts.entity_type is required text'
);
-- 11.
select is(
  (
    select format('%s|%s', udt_name, is_nullable)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sync_mutation_receipts'
      and column_name = 'entity_id'
  ),
  'uuid|NO',
  'sync_mutation_receipts.entity_id is a required uuid'
);
-- 12.
select is(
  (
    select format('%s|%s', udt_name, is_nullable)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sync_mutation_receipts'
      and column_name = 'operation'
  ),
  'text|NO',
  'sync_mutation_receipts.operation is required text'
);
-- 13.
select is(
  (
    select format('%s|%s|%s', udt_name, is_nullable, column_default is not null)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sync_mutation_receipts'
      and column_name = 'committed_at'
  ),
  'timestamptz|NO|t',
  'sync_mutation_receipts.committed_at is a required server timestamp with a default'
);
-- 14.
select is(
  (
    select format('%s|%s|%s', udt_name, is_nullable, column_default is not null)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sync_mutation_receipts'
      and column_name = 'result_summary'
  ),
  'jsonb|NO|t',
  'sync_mutation_receipts.result_summary is required jsonb with a default'
);
-- 15.
select is(
  (
    select format('%s|%s|%s', udt_name, is_nullable, column_default is not null)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'brew_templates'
      and column_name = 'schema_version'
  ),
  'int4|NO|t',
  'brew_templates.schema_version is a required integer with a default'
);

-- 16. Primary, unique, and foreign-key foundations are present.
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.user_sync_state'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (user_id)'
  ),
  'user_sync_state has a user_id primary key'
);
-- 17.
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.sync_mutation_receipts'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
  ),
  'sync_mutation_receipts has an id primary key'
);
-- 18.
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.sync_mutation_receipts'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (user_id, mutation_id)'
  ),
  'sync mutation ids are unique per user'
);
-- 19.
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.beans'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (id, user_id)'
  ),
  'beans has a composite id and user_id unique constraint'
);
-- 20.
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.user_sync_state'::regclass
      and contype = 'f'
      and confdeltype = 'c'
      and pg_get_constraintdef(oid) like 'FOREIGN KEY (user_id) REFERENCES auth.users(id)%'
  ),
  'user_sync_state cascades when its auth user is deleted'
);
-- 21.
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.sync_mutation_receipts'::regclass
      and contype = 'f'
      and confdeltype = 'c'
      and pg_get_constraintdef(oid) like 'FOREIGN KEY (user_id) REFERENCES auth.users(id)%'
  ),
  'sync mutation receipts cascade when their auth user is deleted'
);

-- 22. Required committed and active-time indexes exist with the intended predicates.
select ok(
  pg_get_indexdef(to_regclass('public.sync_mutation_receipts_committed_at_idx'))
    like '%ON public.sync_mutation_receipts USING btree (committed_at)',
  'sync mutation receipts has a committed_at index'
);
-- 23.
select ok(
  pg_get_indexdef(to_regclass('public.beans_active_user_updated_at_idx'))
    like '%ON public.beans USING btree (user_id, updated_at DESC) WHERE (deleted_at IS NULL)',
  'beans has a partial active user and update-time index'
);
-- 24.
select ok(
  pg_get_indexdef(to_regclass('public.brew_logs_active_user_brewed_at_idx'))
    like '%ON public.brew_logs USING btree (user_id, brewed_at DESC) WHERE (deleted_at IS NULL)',
  'brew logs has a partial active user and brew-time index'
);
-- 25.
select ok(
  pg_get_indexdef(to_regclass('public.brew_templates_active_user_updated_at_idx'))
    like '%ON public.brew_templates USING btree (user_id, updated_at DESC) WHERE (deleted_at IS NULL)',
  'brew templates has a partial active user and update-time index'
);
-- 26.
select ok(
  pg_get_indexdef(to_regclass('public.ai_recommendations_active_user_created_at_idx'))
    like '%ON public.ai_recommendations USING btree (user_id, created_at DESC) WHERE (deleted_at IS NULL)',
  'AI recommendations has a partial active user and create-time index'
);
-- 27.
select ok(
  pg_get_indexdef(to_regclass('public.source_imports_active_user_created_at_idx'))
    like '%ON public.source_imports USING btree (user_id, created_at DESC) WHERE (deleted_at IS NULL)',
  'source imports has a partial active user and create-time index'
);

-- 28. New-table checks are validated because their tables start empty.
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.user_sync_state'::regclass
      and conname = 'user_sync_state_sync_epoch_check'
      and contype = 'c'
      and convalidated
  ),
  'sync_epoch must be positive'
);
-- 29.
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.sync_mutation_receipts'::regclass
      and conname = 'sync_mutation_receipts_entity_type_check'
      and contype = 'c'
      and convalidated
  ),
  'sync receipt entity types are constrained'
);
-- 30.
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.sync_mutation_receipts'::regclass
      and conname = 'sync_mutation_receipts_operation_check'
      and contype = 'c'
      and convalidated
  ),
  'sync receipt operations are constrained'
);

-- 31. Existing-data checks are installed as NOT VALID.
select ok(
  exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.brew_logs'::regclass
      and conname = 'brew_logs_rating_range_check'
      and contype = 'c'
      and not convalidated
  ),
  'brew rating range check is NOT VALID'
);
-- 32.
select ok(
  exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.brew_logs'::regclass
      and conname = 'brew_logs_sensory_range_check'
      and contype = 'c'
      and not convalidated
  ),
  'brew sensory range check is NOT VALID'
);
-- 33.
select ok(
  exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.brew_logs'::regclass
      and conname = 'brew_logs_measurements_check'
      and contype = 'c'
      and not convalidated
  ),
  'brew measurement check is NOT VALID'
);
-- 34.
select ok(
  exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.beans'::regclass
      and conname = 'beans_measurements_check'
      and contype = 'c'
      and not convalidated
  ),
  'bean measurement check is NOT VALID'
);
-- 35.
select ok(
  exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.brew_templates'::regclass
      and conname = 'brew_templates_measurements_check'
      and contype = 'c'
      and not convalidated
  ),
  'brew template measurement check is NOT VALID'
);
-- 36.
select ok(
  exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.source_imports'::regclass
      and conname = 'source_imports_status_check'
      and contype = 'c'
      and not convalidated
  ),
  'source import status check is NOT VALID'
);
-- 37.
select ok(
  exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.user_settings'::regclass
      and conname = 'user_settings_backup_reminder_days_check'
      and contype = 'c'
      and not convalidated
  ),
  'backup reminder range check is NOT VALID'
);

-- 38. Bean references enforce same-user ownership and deferred validation.
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.brew_logs'::regclass
      and conname = 'brew_logs_bean_user_fkey'
      and contype = 'f'
      and confdeltype = 'a'
      and condeferrable
      and condeferred
      and pg_get_constraintdef(oid)
        like 'FOREIGN KEY (bean_id, user_id) REFERENCES beans(id, user_id)%'
  ),
  'brew logs use a deferred same-user bean foreign key with NO ACTION'
);
-- 39.
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.ai_recommendations'::regclass
      and conname = 'ai_recommendations_bean_user_fkey'
      and contype = 'f'
      and confdeltype = 'a'
      and condeferrable
      and condeferred
      and pg_get_constraintdef(oid)
        like 'FOREIGN KEY (bean_id, user_id) REFERENCES beans(id, user_id)%'
  ),
  'AI recommendations use a deferred same-user bean foreign key with NO ACTION'
);
-- 40.
select ok(
  not exists (
    select 1
    from pg_catalog.pg_constraint as constraints
    join pg_catalog.pg_attribute as source_column
      on source_column.attrelid = constraints.conrelid
      and source_column.attnum = constraints.conkey[1]
    join pg_catalog.pg_attribute as target_column
      on target_column.attrelid = constraints.confrelid
      and target_column.attnum = constraints.confkey[1]
    where constraints.conrelid = 'public.brew_logs'::regclass
      and constraints.confrelid = 'public.beans'::regclass
      and constraints.contype = 'f'
      and cardinality(constraints.conkey) = 1
      and cardinality(constraints.confkey) = 1
      and source_column.attname = 'bean_id'
      and target_column.attname = 'id'
  ),
  'brew logs no longer has a simple bean_id foreign key'
);
-- 41.
select ok(
  not exists (
    select 1
    from pg_catalog.pg_constraint as constraints
    join pg_catalog.pg_attribute as source_column
      on source_column.attrelid = constraints.conrelid
      and source_column.attnum = constraints.conkey[1]
    join pg_catalog.pg_attribute as target_column
      on target_column.attrelid = constraints.confrelid
      and target_column.attnum = constraints.confkey[1]
    where constraints.conrelid = 'public.ai_recommendations'::regclass
      and constraints.confrelid = 'public.beans'::regclass
      and constraints.contype = 'f'
      and cardinality(constraints.conkey) = 1
      and cardinality(constraints.confkey) = 1
      and source_column.attname = 'bean_id'
      and target_column.attname = 'id'
  ),
  'AI recommendations no longer has a simple bean_id foreign key'
);

-- 42. Technical tables enforce RLS and current-user read policies.
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.user_sync_state'::regclass),
  'user_sync_state has RLS enabled'
);
-- 43.
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.sync_mutation_receipts'::regclass),
  'sync_mutation_receipts has RLS enabled'
);
-- 44.
select ok(
  exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'user_sync_state'
      and policyname = 'Users can read own sync state'
      and cmd = 'SELECT'
      and replace(qual, ' ', '') = '(auth.uid()=user_id)'
  ),
  'user_sync_state has a current-user SELECT policy'
);
-- 45.
select ok(
  exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'sync_mutation_receipts'
      and policyname = 'Users can read own sync receipts'
      and cmd = 'SELECT'
      and replace(qual, ' ', '') = '(auth.uid()=user_id)'
  ),
  'sync_mutation_receipts has a current-user SELECT policy'
);

-- 46. anon has no direct table access.
select ok(
  not has_table_privilege('anon', 'public.user_sync_state', 'SELECT')
    and not has_table_privilege('anon', 'public.user_sync_state', 'INSERT')
    and not has_table_privilege('anon', 'public.user_sync_state', 'UPDATE')
    and not has_table_privilege('anon', 'public.user_sync_state', 'DELETE'),
  'anon has no DML privileges on user_sync_state'
);
-- 47.
select ok(
  not has_table_privilege('anon', 'public.sync_mutation_receipts', 'SELECT')
    and not has_table_privilege('anon', 'public.sync_mutation_receipts', 'INSERT')
    and not has_table_privilege('anon', 'public.sync_mutation_receipts', 'UPDATE')
    and not has_table_privilege('anon', 'public.sync_mutation_receipts', 'DELETE'),
  'anon has no DML privileges on sync_mutation_receipts'
);

-- 48. authenticated is read-only on technical tables.
select ok(
  has_table_privilege('authenticated', 'public.user_sync_state', 'SELECT'),
  'authenticated can select user_sync_state'
);
-- 49.
select ok(
  has_table_privilege('authenticated', 'public.sync_mutation_receipts', 'SELECT'),
  'authenticated can select sync_mutation_receipts'
);
-- 50.
select ok(
  not has_table_privilege('authenticated', 'public.user_sync_state', 'INSERT')
    and not has_table_privilege('authenticated', 'public.user_sync_state', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.user_sync_state', 'DELETE'),
  'authenticated cannot write user_sync_state directly'
);
-- 51.
select ok(
  not has_table_privilege('authenticated', 'public.sync_mutation_receipts', 'INSERT')
    and not has_table_privilege('authenticated', 'public.sync_mutation_receipts', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.sync_mutation_receipts', 'DELETE'),
  'authenticated cannot write sync_mutation_receipts directly'
);

-- 52. Receipt cleanup is private, definer-owned, and search-path hardened.
select ok(
  to_regprocedure('public.purge_expired_sync_mutation_receipts()') is not null,
  'receipt purge function exists'
);
-- 53.
select ok(
  (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.purge_expired_sync_mutation_receipts()'::regprocedure
  ),
  'receipt purge function is SECURITY DEFINER'
);
-- 54.
select ok(
  (
    select coalesce(proconfig @> array['search_path=pg_catalog']::text[], false)
    from pg_catalog.pg_proc
    where oid = 'public.purge_expired_sync_mutation_receipts()'::regprocedure
  ),
  'receipt purge function fixes search_path to pg_catalog'
);
-- 55.
select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as procedures
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        procedures.proacl,
        pg_catalog.acldefault('f', procedures.proowner)
      )
    ) as privileges
    where procedures.oid = 'public.purge_expired_sync_mutation_receipts()'::regprocedure
      and privileges.privilege_type = 'EXECUTE'
      and privileges.grantee in (
        0,
        (select oid from pg_catalog.pg_roles where rolname = 'anon'),
        (select oid from pg_catalog.pg_roles where rolname = 'authenticated')
      )
  ),
  'public, anon, and authenticated cannot execute receipt purge directly'
);

-- 56. user_sync_state updated_at remains server-controlled on updates.
select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.user_sync_state'::regclass
      and tgname = 'set_user_sync_state_updated_at'
      and not tgisinternal
  ),
  'user_sync_state has a server updated_at trigger'
);

-- 57. Entity type and operation check definitions contain the complete allowlists.
select ok(
  (
    select pg_get_constraintdef(oid)
    from pg_catalog.pg_constraint
    where conrelid = 'public.sync_mutation_receipts'::regclass
      and conname = 'sync_mutation_receipts_entity_type_check'
  ) like '%bean%brewLog%brewTemplate%userSettings%',
  'sync receipt entity type check contains every supported entity'
);
-- 58.
select ok(
  (
    select pg_get_constraintdef(oid)
    from pg_catalog.pg_constraint
    where conrelid = 'public.sync_mutation_receipts'::regclass
      and conname = 'sync_mutation_receipts_operation_check'
  ) like '%upsert%delete%',
  'sync receipt operation check contains both supported operations'
);

-- 59. Version and epoch defaults are exactly one.
select is(
  (
    select pg_get_expr(defaults.adbin, defaults.adrelid)
    from pg_catalog.pg_attrdef as defaults
    join pg_catalog.pg_attribute as attributes
      on attributes.attrelid = defaults.adrelid
      and attributes.attnum = defaults.adnum
    where defaults.adrelid = 'public.user_sync_state'::regclass
      and attributes.attname = 'sync_epoch'
  ),
  '1',
  'sync_epoch defaults to one'
);
-- 60.
select is(
  (
    select pg_get_expr(defaults.adbin, defaults.adrelid)
    from pg_catalog.pg_attrdef as defaults
    join pg_catalog.pg_attribute as attributes
      on attributes.attrelid = defaults.adrelid
      and attributes.attnum = defaults.adnum
    where defaults.adrelid = 'public.brew_templates'::regclass
      and attributes.attname = 'schema_version'
  ),
  '1',
  'brew template schema_version defaults to one'
);

-- 61. Transactional sync RPCs exist with the public contract.
select has_function('public', 'apply_sync_batch', array['bigint', 'jsonb']);
-- 62.
select has_function('public', 'get_sync_snapshot', array[]::text[]);

-- 63. The write RPC is definer-owned and search-path hardened.
select ok(
  (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.apply_sync_batch(bigint,jsonb)'::regprocedure
  ),
  'apply_sync_batch is SECURITY DEFINER'
);
-- 64.
select ok(
  (
    select coalesce(
      proconfig @> array['search_path=pg_catalog, pg_temp']::text[],
      false
    )
    from pg_catalog.pg_proc
    where oid = 'public.apply_sync_batch(bigint,jsonb)'::regprocedure
  ),
  'apply_sync_batch fixes search_path to pg_catalog with pg_temp last'
);

-- 65. The snapshot RPC preserves caller RLS and also fixes its search path.
select ok(
  not (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.get_sync_snapshot()'::regprocedure
  ),
  'get_sync_snapshot is SECURITY INVOKER'
);
-- 66.
select ok(
  (
    select coalesce(
      proconfig @> array['search_path=pg_catalog, pg_temp']::text[],
      false
    )
    from pg_catalog.pg_proc
    where oid = 'public.get_sync_snapshot()'::regprocedure
  ),
  'get_sync_snapshot fixes search_path to pg_catalog with pg_temp last'
);

-- 67. PUBLIC and anon cannot execute either RPC; authenticated can execute both.
select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as procedures
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        procedures.proacl,
        pg_catalog.acldefault('f', procedures.proowner)
      )
    ) as privileges
    where procedures.oid in (
        'public.apply_sync_batch(bigint,jsonb)'::regprocedure,
        'public.get_sync_snapshot()'::regprocedure
      )
      and privileges.grantee = 0
      and privileges.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute sync RPCs'
);
-- 68.
select ok(
  not has_function_privilege('anon', 'public.apply_sync_batch(bigint,jsonb)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.get_sync_snapshot()', 'EXECUTE'),
  'anon cannot execute sync RPCs'
);
-- 69.
select ok(
  has_function_privilege('authenticated', 'public.apply_sync_batch(bigint,jsonb)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.get_sync_snapshot()', 'EXECUTE'),
  'authenticated can execute sync RPCs'
);

-- 70. Four private mutation helpers exist with one fixed signature.
select ok(
  to_regprocedure('private.apply_bean_mutation(uuid,uuid,text,jsonb)') is not null
    and to_regprocedure('private.apply_brew_log_mutation(uuid,uuid,text,jsonb)') is not null
    and to_regprocedure('private.apply_brew_template_mutation(uuid,uuid,text,jsonb)') is not null
    and to_regprocedure('private.apply_user_settings_mutation(uuid,uuid,text,jsonb)') is not null,
  'all four private mutation helpers exist'
);
-- 71.
select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as procedures
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        procedures.proacl,
        pg_catalog.acldefault('f', procedures.proowner)
      )
    ) as privileges
    where procedures.oid in (
        'private.has_unknown_fields(jsonb,text[])'::regprocedure,
        'private.jsonb_text_array(jsonb,text)'::regprocedure,
        'private.apply_bean_mutation(uuid,uuid,text,jsonb)'::regprocedure,
        'private.apply_brew_log_mutation(uuid,uuid,text,jsonb)'::regprocedure,
        'private.apply_brew_template_mutation(uuid,uuid,text,jsonb)'::regprocedure,
        'private.apply_user_settings_mutation(uuid,uuid,text,jsonb)'::regprocedure,
        'public.set_updated_at()'::regprocedure
      )
      and privileges.privilege_type = 'EXECUTE'
      and privileges.grantee in (
        0,
        (select oid from pg_catalog.pg_roles where rolname = 'anon'),
        (select oid from pg_catalog.pg_roles where rolname = 'authenticated')
      )
  ),
  'public, anon, and authenticated cannot execute any non-client helper'
);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000001', 'sync-one@example.invalid'),
  ('00000000-0000-0000-0000-000000000002', 'sync-two@example.invalid');

insert into public.beans (
  id, user_id, name, flavor_tags, bean_type, blend_components, deleted_at
)
values
  (
    '40000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Snapshot bean',
    '{}',
    'single_origin',
    '[]'::jsonb,
    null
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'Snapshot tombstone',
    '{}',
    'single_origin',
    '[]'::jsonb,
    clock_timestamp()
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000002',
    'Other user bean',
    '{}',
    'single_origin',
    '[]'::jsonb,
    null
  );

insert into public.brew_logs (id, user_id, bean_id, brewed_at)
values
  (
    '41000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '2026-08-08T01:00:00Z'
  ),
  (
    '41000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000003',
    '2026-08-08T02:00:00Z'
  );

insert into public.brew_templates (
  id, user_id, name, category, difficulty, brewer, dose_grams, water_grams,
  water_temperature_min, water_temperature_max, target_time_min, target_time_max
)
values
  (
    '42000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Snapshot template', 'pour-over', 'easy', 'V60', 15, 250, 90, 94, 150, 210
  ),
  (
    '42000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'Other template', 'pour-over', 'easy', 'V60', 15, 250, 90, 94, 150, 210
  );

insert into public.user_settings (
  user_id, preferred_units, default_gear, taste_preferences, backup_reminder_days
)
values
  (
    '00000000-0000-0000-0000-000000000001',
    '{"weight":"grams"}'::jsonb,
    '{"grinder":"Sync grinder"}'::jsonb,
    '{"acidity":3}'::jsonb,
    9
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '{"weight":"ounces"}'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb,
    14
  );

insert into public.ai_recommendations (
  id, user_id, bean_id, input_context, recommendation, model_name
)
values
  (
    '43000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '{}'::jsonb,
    '{"method":"V60"}'::jsonb,
    'test-model'
  ),
  (
    '43000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000003',
    '{}'::jsonb,
    '{"method":"other"}'::jsonb,
    'test-model'
  );

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- 72. A new user can read the initial snapshot without a sync-state row.
select lives_ok(
  $$select public.get_sync_snapshot()$$,
  'initial snapshot succeeds before sync state exists'
);
-- 73.
select is(
  (public.get_sync_snapshot()->>'syncEpoch')::bigint,
  1::bigint,
  'initial snapshot defaults syncEpoch to one'
);
-- 74.
select is(
  (select count(*) from public.user_sync_state),
  0::bigint,
  'initial snapshot does not create sync state'
);
-- 75.
select ok(
  public.get_sync_snapshot() ?& array[
    'syncEpoch', 'serverTime', 'beans', 'brewLogs', 'brewTemplates',
    'userSettings', 'aiRecommendations'
  ]
    and jsonb_typeof(public.get_sync_snapshot()->'serverTime') = 'string',
  'snapshot contains every collection and serverTime'
);
-- 76.
select ok(
  (
    with snapshot as (
      select public.get_sync_snapshot()->'beans' as rows
    )
    select jsonb_array_length(rows) = 2
      and not exists (
        select 1
        from jsonb_array_elements(rows) as item
        where item->>'user_id' <> '00000000-0000-0000-0000-000000000001'
      )
      and exists (
        select 1
        from jsonb_array_elements(rows) as item
        where item->>'id' = '40000000-0000-0000-0000-000000000002'
          and item->>'deleted_at' is not null
      )
    from snapshot
  ),
  'snapshot contains only own beans and includes tombstones'
);
-- 77.
select ok(
  (
    with snapshot as (
      select public.get_sync_snapshot()->'brewLogs' as rows
    )
    select jsonb_array_length(rows) = 1
      and rows #>> '{0,user_id}' = '00000000-0000-0000-0000-000000000001'
    from snapshot
  ),
  'snapshot contains only own brew logs'
);
-- 78.
select ok(
  (
    with snapshot as (
      select public.get_sync_snapshot()->'brewTemplates' as rows
    )
    select jsonb_array_length(rows) = 1
      and rows #>> '{0,user_id}' = '00000000-0000-0000-0000-000000000001'
    from snapshot
  ),
  'snapshot contains only own brew templates'
);
-- 79.
select is(
  public.get_sync_snapshot() #>> '{userSettings,user_id}',
  '00000000-0000-0000-0000-000000000001',
  'snapshot contains only own user settings'
);
-- 80.
select ok(
  (
    with snapshot as (
      select public.get_sync_snapshot()->'aiRecommendations' as rows
    )
    select jsonb_array_length(rows) = 1
      and rows #>> '{0,user_id}' = '00000000-0000-0000-0000-000000000001'
    from snapshot
  ),
  'snapshot contains only own AI recommendations'
);

select set_config('request.jwt.claim.sub', '', true);

-- 81. Both RPCs reject a caller without an authenticated user id.
select throws_ok(
  $$select public.apply_sync_batch(1, '[]'::jsonb)$$,
  '42501',
  'AUTH_REQUIRED',
  'apply_sync_batch rejects an unauthenticated caller'
);
-- 82.
select throws_ok(
  $$select public.get_sync_snapshot()$$,
  '42501',
  'AUTH_REQUIRED',
  'get_sync_snapshot rejects an unauthenticated caller'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',
  true
);

-- 83. Batch guards reject non-arrays and batches over the fixed limit.
select throws_ok(
  $$select public.apply_sync_batch(1, '{}'::jsonb)$$,
  'P0001',
  'INVALID_BATCH: OPERATIONS_MUST_BE_ARRAY',
  'batch operations must be a JSON array'
);
-- 84.
select throws_ok(
  $$select public.apply_sync_batch(
    1,
    (select jsonb_agg('{}'::jsonb) from generate_series(1, 101))
  )$$,
  'P0001',
  'INVALID_BATCH: TOO_MANY_OPERATIONS',
  'batch rejects more than one hundred operations'
);

-- 85. A valid bean upsert initializes state and records one receipt.
select lives_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000001",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"bean",
    "entityId":"30000000-0000-0000-0000-000000000001",
    "operation":"upsert",
    "payload":{
      "name":"RPC bean",
      "roaster":"RPC roaster",
      "roast_date":"2026-08-01",
      "purchase_date":"2026-08-02",
      "flavor_tags":["berry"],
      "bean_type":"single_origin",
      "blend_components":[],
      "schema_version":1
    }
  }]'::jsonb)$$,
  'applies a bean mutation'
);
-- 86.
select ok(
  exists (
    select 1
    from public.beans
    where id = '30000000-0000-0000-0000-000000000001'
      and user_id = '00000000-0000-0000-0000-000000000001'
      and name = 'RPC bean'
      and roast_date = '2026-08-01'
      and purchase_date = '2026-08-02'
      and deleted_at is null
  ),
  'bean upsert writes only the authenticated owner'
);
-- 87.
select is(
  (
    select sync_epoch
    from public.user_sync_state
    where user_id = '00000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'first batch initializes sync state at epoch one'
);
-- 88.
select is(
  (
    select count(*)
    from public.sync_mutation_receipts
    where mutation_id = '10000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'successful bean upsert records one receipt'
);

-- 89. A repeated mutation id is acknowledged without replaying its payload.
select is(
  public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000001",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"bean",
    "entityId":"30000000-0000-0000-0000-000000000001",
    "operation":"upsert",
    "payload":{"name":"must not replay"}
  }]'::jsonb) #>> '{results,0,status}',
  'duplicate',
  'duplicate mutation returns duplicate status'
);
-- 90.
select is(
  (
    select name
    from public.beans
    where id = '30000000-0000-0000-0000-000000000001'
  ),
  'RPC bean',
  'duplicate mutation does not replay changed payload'
);
-- 91.
select is(
  (
    select count(*)
    from public.sync_mutation_receipts
    where mutation_id = '10000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'duplicate mutation does not add another receipt'
);

-- 92. A stale epoch fails before any business or receipt write.
select throws_ok(
  $$select public.apply_sync_batch(0, '[{
    "mutationId":"10000000-0000-0000-0000-000000000002",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"bean",
    "entityId":"30000000-0000-0000-0000-000000000002",
    "operation":"upsert",
    "payload":{"name":"stale bean"}
  }]'::jsonb)$$,
  'P0001',
  'STALE_SYNC_EPOCH',
  'stale epoch is rejected'
);
-- 93.
select is(
  (
    select count(*)
    from public.beans
    where id = '30000000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  'stale epoch writes no bean'
);
-- 94.
select is(
  (
    select count(*)
    from public.sync_mutation_receipts
    where mutation_id = '10000000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  'stale epoch writes no receipt'
);

-- 95. A later structural error rolls back earlier valid operations in the batch.
select throws_ok(
  $$select public.apply_sync_batch(1, '[
    {
      "mutationId":"10000000-0000-0000-0000-000000000003",
      "deviceId":"20000000-0000-0000-0000-000000000001",
      "entityType":"bean",
      "entityId":"30000000-0000-0000-0000-000000000003",
      "operation":"upsert",
      "payload":{"name":"must roll back"}
    },
    {
      "mutationId":"10000000-0000-0000-0000-000000000004",
      "deviceId":"20000000-0000-0000-0000-000000000001",
      "entityType":"aiRecommendation",
      "entityId":"30000000-0000-0000-0000-000000000004",
      "operation":"upsert",
      "payload":{}
    }
  ]'::jsonb)$$,
  'P0001',
  'INVALID_OPERATION[2]: UNKNOWN_ENTITY_TYPE',
  'unknown entity makes the entire batch fail'
);
-- 96.
select is(
  (
    select count(*)
    from public.beans
    where id = '30000000-0000-0000-0000-000000000003'
  ),
  0::bigint,
  'earlier valid business write is rolled back'
);
-- 97.
select is(
  (
    select count(*)
    from public.sync_mutation_receipts
    where mutation_id in (
      '10000000-0000-0000-0000-000000000003',
      '10000000-0000-0000-0000-000000000004'
    )
  ),
  0::bigint,
  'atomic failure leaves no receipt from the batch'
);

-- 98. Payload allowlists reject unknown and ownership fields.
select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000005",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"bean",
    "entityId":"30000000-0000-0000-0000-000000000005",
    "operation":"upsert",
    "payload":{"name":"unknown field bean","surprise":true}
  }]'::jsonb)$$,
  'P0001',
  'INVALID_PAYLOAD[1]: UNKNOWN_FIELDS',
  'bean payload rejects unknown fields'
);
-- 99.
select ok(
  not exists (
    select 1 from public.beans
    where id = '30000000-0000-0000-0000-000000000005'
  )
    and not exists (
      select 1 from public.sync_mutation_receipts
      where mutation_id = '10000000-0000-0000-0000-000000000005'
    ),
  'unknown payload field writes neither row nor receipt'
);
-- 100.
select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000006",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"bean",
    "entityId":"30000000-0000-0000-0000-000000000006",
    "operation":"upsert",
    "payload":{
      "name":"forged owner",
      "user_id":"00000000-0000-0000-0000-000000000002"
    }
  }]'::jsonb)$$,
  'P0001',
  'INVALID_PAYLOAD[1]: UNKNOWN_FIELDS',
  'client cannot submit user_id in a payload'
);
-- 101.
select ok(
  not exists (
    select 1 from public.beans
    where id = '30000000-0000-0000-0000-000000000006'
  )
    and not exists (
      select 1 from public.sync_mutation_receipts
      where mutation_id = '10000000-0000-0000-0000-000000000006'
    ),
  'forged ownership payload writes neither row nor receipt'
);

-- 102. A brew log cannot reference another user's bean.
select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000007",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"brewLog",
    "entityId":"31000000-0000-0000-0000-000000000001",
    "operation":"upsert",
    "payload":{
      "bean_id":"40000000-0000-0000-0000-000000000003",
      "brewed_at":"2026-08-08T03:00:00Z"
    }
  }]'::jsonb)$$,
  'P0001',
  'INVALID_PAYLOAD[1]: BEAN_REFERENCE_NOT_AVAILABLE',
  'brew log rejects a cross-user bean reference'
);
-- 103.
select ok(
  not exists (
    select 1 from public.brew_logs
    where id = '31000000-0000-0000-0000-000000000001'
  )
    and not exists (
      select 1 from public.sync_mutation_receipts
      where mutation_id = '10000000-0000-0000-0000-000000000007'
    ),
  'cross-user reference writes neither log nor receipt'
);

-- 104. Operations run in client order so a later log can reference a new bean.
select lives_ok(
  $$select public.apply_sync_batch(1, '[
    {
      "mutationId":"10000000-0000-0000-0000-000000000008",
      "deviceId":"20000000-0000-0000-0000-000000000001",
      "entityType":"bean",
      "entityId":"30000000-0000-0000-0000-000000000008",
      "operation":"upsert",
      "payload":{"name":"Ordered bean"}
    },
    {
      "mutationId":"10000000-0000-0000-0000-000000000009",
      "deviceId":"20000000-0000-0000-0000-000000000001",
      "entityType":"brewLog",
      "entityId":"31000000-0000-0000-0000-000000000009",
      "operation":"upsert",
      "payload":{
        "bean_id":"30000000-0000-0000-0000-000000000008",
        "brewed_at":"2026-08-08T04:00:00Z",
        "coffee_grams":15,
        "water_grams":250,
        "flavor_tags":["clean"],
        "pour_steps":[],
        "schema_version":1
      }
    }
  ]'::jsonb)$$,
  'same-batch bean then brew log succeeds in client order'
);
-- 105.
select ok(
  exists (
    select 1 from public.beans
    where id = '30000000-0000-0000-0000-000000000008'
  )
    and exists (
      select 1 from public.brew_logs
      where id = '31000000-0000-0000-0000-000000000009'
        and bean_id = '30000000-0000-0000-0000-000000000008'
    ),
  'same-batch dependency writes both records'
);

-- 106. The remaining two entity helpers accept complete valid upserts.
select lives_ok(
  $$select public.apply_sync_batch(1, '[
    {
      "mutationId":"10000000-0000-0000-0000-000000000010",
      "deviceId":"20000000-0000-0000-0000-000000000001",
      "entityType":"brewTemplate",
      "entityId":"32000000-0000-0000-0000-000000000010",
      "operation":"upsert",
      "payload":{
        "name":"RPC template",
        "category":"pour-over",
        "difficulty":"medium",
        "brewer":"V60",
        "filter":"paper",
        "dose_grams":16,
        "water_grams":256,
        "ratio":"1:16",
        "water_temperature_min":91,
        "water_temperature_max":94,
        "grind_size":"medium-fine",
        "target_time_min":150,
        "target_time_max":210,
        "pour_steps":[{"water":50}],
        "suitable_for":["washed"],
        "avoid_for":[],
        "flavor_goal":"clarity",
        "adjustment_rules":["grind finer if fast"],
        "source_notes":"test",
        "source_urls":["https://example.invalid/template"],
        "is_champion_reference":false,
        "copied_from_template_id":null,
        "schema_version":1
      }
    },
    {
      "mutationId":"10000000-0000-0000-0000-000000000011",
      "deviceId":"20000000-0000-0000-0000-000000000001",
      "entityType":"userSettings",
      "entityId":"00000000-0000-0000-0000-000000000001",
      "operation":"upsert",
      "payload":{
        "preferred_units":{"weight":"grams"},
        "default_gear":{"grinder":"RPC grinder"},
        "taste_preferences":{"sweetness":5},
        "backup_reminder_days":21,
        "schema_version":1
      }
    }
  ]'::jsonb)$$,
  'brew template and user settings upserts succeed'
);
-- 107.
select ok(
  exists (
    select 1 from public.brew_templates
    where id = '32000000-0000-0000-0000-000000000010'
      and name = 'RPC template'
      and source_urls = array['https://example.invalid/template']
  ),
  'brew template helper maps the complete payload'
);
-- 108.
select ok(
  exists (
    select 1 from public.user_settings
    where user_id = '00000000-0000-0000-0000-000000000001'
      and backup_reminder_days = 21
      and default_gear = '{"grinder":"RPC grinder"}'::jsonb
  ),
  'user settings helper enforces the user singleton id and replaces fields'
);

-- 109. Delete is a server-stamped soft delete, never a physical delete.
select lives_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000012",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"bean",
    "entityId":"30000000-0000-0000-0000-000000000008",
    "operation":"delete",
    "payload":{}
  }]'::jsonb)$$,
  'bean delete succeeds as a soft delete'
);
-- 110.
select ok(
  exists (
    select 1 from public.beans
    where id = '30000000-0000-0000-0000-000000000008'
      and deleted_at is not null
      and updated_at is not null
  ),
  'bean delete keeps the row and stamps deleted_at and updated_at'
);

-- 111. New logs cannot attach to a soft-deleted bean.
select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000013",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"brewLog",
    "entityId":"31000000-0000-0000-0000-000000000013",
    "operation":"upsert",
    "payload":{
      "bean_id":"30000000-0000-0000-0000-000000000008",
      "brewed_at":"2026-08-08T05:00:00Z"
    }
  }]'::jsonb)$$,
  'P0001',
  'INVALID_PAYLOAD[1]: BEAN_REFERENCE_NOT_AVAILABLE',
  'brew log rejects a soft-deleted bean reference'
);

-- 112. userSettings delete has explicit safe semantics: it is rejected.
select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000014",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"userSettings",
    "entityId":"00000000-0000-0000-0000-000000000001",
    "operation":"delete",
    "payload":{}
  }]'::jsonb)$$,
  'P0001',
  'INVALID_OPERATION[1]: USER_SETTINGS_DELETE_NOT_ALLOWED',
  'user settings delete is rejected'
);
-- 113.
select ok(
  exists (
    select 1 from public.user_settings
    where user_id = '00000000-0000-0000-0000-000000000001'
      and backup_reminder_days = 21
  )
    and not exists (
      select 1 from public.sync_mutation_receipts
      where mutation_id = '10000000-0000-0000-0000-000000000014'
    ),
  'rejected settings delete leaves settings and no receipt'
);

-- 114. Brew log and template delete paths also create tombstones.
select lives_ok(
  $$select public.apply_sync_batch(1, '[
    {
      "mutationId":"10000000-0000-0000-0000-000000000015",
      "deviceId":"20000000-0000-0000-0000-000000000001",
      "entityType":"brewLog",
      "entityId":"31000000-0000-0000-0000-000000000009",
      "operation":"delete",
      "payload":{}
    },
    {
      "mutationId":"10000000-0000-0000-0000-000000000016",
      "deviceId":"20000000-0000-0000-0000-000000000001",
      "entityType":"brewTemplate",
      "entityId":"32000000-0000-0000-0000-000000000010",
      "operation":"delete",
      "payload":{}
    }
  ]'::jsonb)$$,
  'brew log and template deletes succeed'
);
-- 115.
select ok(
  exists (
    select 1 from public.brew_logs
    where id = '31000000-0000-0000-0000-000000000009'
      and deleted_at is not null
  ),
  'brew log delete creates a tombstone'
);
-- 116.
select ok(
  exists (
    select 1 from public.brew_templates
    where id = '32000000-0000-0000-0000-000000000010'
      and deleted_at is not null
  ),
  'brew template delete creates a tombstone'
);

-- 117. Top-level keys, UUIDs, operation, and payload shape have stable errors.
select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000017",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"bean",
    "entityId":"30000000-0000-0000-0000-000000000017",
    "operation":"upsert",
    "payload":{"name":"extra top-level"},
    "unexpected":true
  }]'::jsonb)$$,
  'P0001',
  'INVALID_OPERATION[1]: UNKNOWN_FIELDS',
  'operation rejects unknown top-level fields'
);
-- 118.
select is(
  (
    select count(*) from public.sync_mutation_receipts
    where mutation_id = '10000000-0000-0000-0000-000000000017'
  ),
  0::bigint,
  'unknown top-level field writes no receipt'
);
-- 119.
select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"not-a-uuid",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"bean",
    "entityId":"30000000-0000-0000-0000-000000000018",
    "operation":"upsert",
    "payload":{"name":"bad uuid"}
  }]'::jsonb)$$,
  'P0001',
  'INVALID_OPERATION[1]: INVALID_MUTATION_ID',
  'operation rejects malformed mutation UUID without leaking cast errors'
);
-- 120.
select ok(
  not exists (
    select 1 from public.beans
    where id = '30000000-0000-0000-0000-000000000018'
  ),
  'malformed UUID writes no business row'
);
-- 121.
select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000019",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"bean",
    "entityId":"30000000-0000-0000-0000-000000000019",
    "operation":"remove",
    "payload":{}
  }]'::jsonb)$$,
  'P0001',
  'INVALID_OPERATION[1]: UNKNOWN_OPERATION',
  'operation rejects unsupported delete spelling'
);
-- 122.
select is(
  (
    select count(*) from public.sync_mutation_receipts
    where mutation_id = '10000000-0000-0000-0000-000000000019'
  ),
  0::bigint,
  'unsupported operation writes no receipt'
);
-- 123.
select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000020",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"bean",
    "entityId":"30000000-0000-0000-0000-000000000020",
    "operation":"upsert",
    "payload":[]
  }]'::jsonb)$$,
  'P0001',
  'INVALID_OPERATION[1]: PAYLOAD_MUST_BE_OBJECT',
  'operation payload must be an object'
);
-- 124.
select is(
  (
    select count(*) from public.sync_mutation_receipts
    where mutation_id = '10000000-0000-0000-0000-000000000020'
  ),
  0::bigint,
  'invalid payload shape writes no receipt'
);

-- 125. Later snapshots still include soft-delete tombstones.
select ok(
  (
    with snapshot as (
      select public.get_sync_snapshot() as body
    )
    select exists (
      select 1 from jsonb_array_elements(body->'beans') as item
      where item->>'id' = '30000000-0000-0000-0000-000000000008'
        and item->>'deleted_at' is not null
    )
      and exists (
        select 1 from jsonb_array_elements(body->'brewLogs') as item
        where item->>'id' = '31000000-0000-0000-0000-000000000009'
          and item->>'deleted_at' is not null
      )
      and exists (
        select 1 from jsonb_array_elements(body->'brewTemplates') as item
        where item->>'id' = '32000000-0000-0000-0000-000000000010'
          and item->>'deleted_at' is not null
      )
    from snapshot
  ),
  'snapshot returns bean, brew log, and template tombstones'
);
-- 126.
select ok(
  (
    with snapshot as (
      select public.get_sync_snapshot() as body
    )
    select not exists (
      select 1
      from jsonb_array_elements(body->'beans') as item
      where item->>'user_id' <> '00000000-0000-0000-0000-000000000001'
    )
      and not exists (
        select 1
        from jsonb_array_elements(body->'brewLogs') as item
        where item->>'user_id' <> '00000000-0000-0000-0000-000000000001'
      )
      and not exists (
        select 1
        from jsonb_array_elements(body->'brewTemplates') as item
        where item->>'user_id' <> '00000000-0000-0000-0000-000000000001'
      )
      and not exists (
        select 1
        from jsonb_array_elements(body->'aiRecommendations') as item
        where item->>'user_id' <> '00000000-0000-0000-0000-000000000001'
      )
      and body #>> '{userSettings,user_id}' =
        '00000000-0000-0000-0000-000000000001'
    from snapshot
  ),
  'snapshot never returns another user data after mutations'
);

-- 127. SECURITY DEFINER cannot overwrite another user's entity ids directly.
select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000021",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"bean",
    "entityId":"40000000-0000-0000-0000-000000000003",
    "operation":"upsert",
    "payload":{"name":"hijacked bean"}
  }]'::jsonb)$$,
  'P0001',
  'INVALID_OPERATION[1]: ENTITY_NOT_OWNED',
  'bean helper rejects another user entity id'
);
-- 128.
select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000022",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"brewLog",
    "entityId":"41000000-0000-0000-0000-000000000002",
    "operation":"upsert",
    "payload":{"brewed_at":"2026-08-09T00:00:00Z"}
  }]'::jsonb)$$,
  'P0001',
  'INVALID_OPERATION[1]: ENTITY_NOT_OWNED',
  'brew log helper rejects another user entity id'
);
-- 129.
select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000023",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"brewTemplate",
    "entityId":"42000000-0000-0000-0000-000000000002",
    "operation":"upsert",
    "payload":{
      "name":"hijacked template",
      "category":"pour-over",
      "difficulty":"easy",
      "brewer":"V60",
      "dose_grams":15,
      "water_grams":250,
      "water_temperature_min":90,
      "water_temperature_max":94,
      "target_time_min":150,
      "target_time_max":210
    }
  }]'::jsonb)$$,
  'P0001',
  'INVALID_OPERATION[1]: ENTITY_NOT_OWNED',
  'brew template helper rejects another user entity id'
);
-- 130.
select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000024",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"userSettings",
    "entityId":"00000000-0000-0000-0000-000000000002",
    "operation":"upsert",
    "payload":{"backup_reminder_days":99}
  }]'::jsonb)$$,
  'P0001',
  'INVALID_OPERATION[1]: ENTITY_ID_MUST_EQUAL_USER_ID',
  'settings helper rejects another user singleton id'
);
-- 131.
select is(
  (
    select count(*)
    from public.sync_mutation_receipts
    where mutation_id in (
      '10000000-0000-0000-0000-000000000021',
      '10000000-0000-0000-0000-000000000022',
      '10000000-0000-0000-0000-000000000023',
      '10000000-0000-0000-0000-000000000024'
    )
  ),
  0::bigint,
  'direct cross-user attacks leave no receipts'
);

reset role;
-- 132.
select ok(
  exists (
    select 1 from public.beans
    where id = '40000000-0000-0000-0000-000000000003'
      and name = 'Other user bean'
  )
    and exists (
      select 1 from public.brew_logs
      where id = '41000000-0000-0000-0000-000000000002'
        and brewed_at = '2026-08-08T02:00:00Z'
    )
    and exists (
      select 1 from public.brew_templates
      where id = '42000000-0000-0000-0000-000000000002'
        and name = 'Other template'
    )
    and exists (
      select 1 from public.user_settings
      where user_id = '00000000-0000-0000-0000-000000000002'
        and backup_reminder_days = 14
    ),
  'direct cross-user attacks leave every target unchanged'
);

create temporary table sync_rpc_created_at_before as
select id, created_at
from public.beans
where id in (
  '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000008'
);

set local role authenticated;

-- 133. Bean upsert is a full replacement and also restores tombstones.
select lives_ok(
  $$select public.apply_sync_batch(1, '[
    {
      "mutationId":"10000000-0000-0000-0000-000000000025",
      "deviceId":"20000000-0000-0000-0000-000000000001",
      "entityType":"bean",
      "entityId":"30000000-0000-0000-0000-000000000001",
      "operation":"upsert",
      "payload":{"name":"Replaced RPC bean"}
    },
    {
      "mutationId":"10000000-0000-0000-0000-000000000026",
      "deviceId":"20000000-0000-0000-0000-000000000001",
      "entityType":"bean",
      "entityId":"30000000-0000-0000-0000-000000000008",
      "operation":"upsert",
      "payload":{"name":"Restored ordered bean"}
    }
  ]'::jsonb)$$,
  'bean replacements and tombstone restoration succeed'
);

reset role;
-- 134.
select ok(
  exists (
    select 1
    from public.beans as beans
    join sync_rpc_created_at_before as prior using (id)
    where beans.id = '30000000-0000-0000-0000-000000000001'
      and beans.name = 'Replaced RPC bean'
      and beans.roaster is null
      and beans.created_at = prior.created_at
      and beans.updated_at > beans.created_at
  )
    and exists (
      select 1
      from public.beans as beans
      join sync_rpc_created_at_before as prior using (id)
      where beans.id = '30000000-0000-0000-0000-000000000008'
        and beans.name = 'Restored ordered bean'
        and beans.deleted_at is null
        and beans.created_at = prior.created_at
        and beans.updated_at > beans.created_at
    ),
  'replacement clears omitted fields, preserves created_at, updates time, and restores'
);

set local role authenticated;

-- 135. Remaining operation structure branches return stable indexed errors.
select throws_ok(
  $$select public.apply_sync_batch(1, '[42]'::jsonb)$$,
  'P0001',
  'INVALID_OPERATION[1]: OPERATION_MUST_BE_OBJECT',
  'operation array elements must be objects'
);
-- 136.
select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000027",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"bean",
    "entityId":"30000000-0000-0000-0000-000000000027",
    "operation":"upsert"
  }]'::jsonb)$$,
  'P0001',
  'INVALID_OPERATION[1]: MISSING_FIELDS',
  'operation rejects missing required fields'
);
-- 137.
select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000028",
    "deviceId":"bad-device",
    "entityType":"bean",
    "entityId":"30000000-0000-0000-0000-000000000028",
    "operation":"upsert",
    "payload":{"name":"bad device"}
  }]'::jsonb)$$,
  'P0001',
  'INVALID_OPERATION[1]: INVALID_DEVICE_ID',
  'operation rejects malformed device UUID'
);
-- 138.
select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000029",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"bean",
    "entityId":"bad-entity",
    "operation":"upsert",
    "payload":{"name":"bad entity"}
  }]'::jsonb)$$,
  'P0001',
  'INVALID_OPERATION[1]: INVALID_ENTITY_ID',
  'operation rejects malformed entity UUID'
);
-- 139.
select ok(
  not exists (
    select 1 from public.beans
    where id in (
      '30000000-0000-0000-0000-000000000027',
      '30000000-0000-0000-0000-000000000028'
    )
  )
    and not exists (
      select 1 from public.sync_mutation_receipts
      where mutation_id in (
        '10000000-0000-0000-0000-000000000027',
        '10000000-0000-0000-0000-000000000028',
        '10000000-0000-0000-0000-000000000029'
      )
    ),
  'strict structure failures write no business rows or receipts'
);

-- 140. Every remaining helper also rejects unknown payload fields.
select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000030",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"brewLog",
    "entityId":"31000000-0000-0000-0000-000000000030",
    "operation":"upsert",
    "payload":{"surprise":true}
  }]'::jsonb)$$,
  'P0001',
  'INVALID_PAYLOAD[1]: UNKNOWN_FIELDS',
  'brew log payload rejects unknown fields'
);
-- 141.
select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000031",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"brewTemplate",
    "entityId":"32000000-0000-0000-0000-000000000031",
    "operation":"upsert",
    "payload":{"surprise":true}
  }]'::jsonb)$$,
  'P0001',
  'INVALID_PAYLOAD[1]: UNKNOWN_FIELDS',
  'brew template payload rejects unknown fields'
);
-- 142.
select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000032",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"userSettings",
    "entityId":"00000000-0000-0000-0000-000000000001",
    "operation":"upsert",
    "payload":{"surprise":true}
  }]'::jsonb)$$,
  'P0001',
  'INVALID_PAYLOAD[1]: UNKNOWN_FIELDS',
  'user settings payload rejects unknown fields'
);
-- 143.
select ok(
  not exists (
    select 1 from public.sync_mutation_receipts
    where mutation_id in (
      '10000000-0000-0000-0000-000000000030',
      '10000000-0000-0000-0000-000000000031',
      '10000000-0000-0000-0000-000000000032'
    )
  ),
  'unknown helper payload fields leave no receipts'
);

reset role;

-- 144. Function privilege checks use every exact non-client signature.
select ok(
  not has_function_privilege(
    'anon', 'private.has_unknown_fields(jsonb,text[])', 'EXECUTE'
  )
    and not has_function_privilege(
      'authenticated', 'private.has_unknown_fields(jsonb,text[])', 'EXECUTE'
    )
    and not has_function_privilege(
      'anon', 'private.jsonb_text_array(jsonb,text)', 'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated', 'private.jsonb_text_array(jsonb,text)', 'EXECUTE'
    )
    and not has_function_privilege(
      'anon', 'private.apply_bean_mutation(uuid,uuid,text,jsonb)', 'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'private.apply_bean_mutation(uuid,uuid,text,jsonb)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon', 'private.apply_brew_log_mutation(uuid,uuid,text,jsonb)', 'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'private.apply_brew_log_mutation(uuid,uuid,text,jsonb)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'private.apply_brew_template_mutation(uuid,uuid,text,jsonb)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'private.apply_brew_template_mutation(uuid,uuid,text,jsonb)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'private.apply_user_settings_mutation(uuid,uuid,text,jsonb)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'private.apply_user_settings_mutation(uuid,uuid,text,jsonb)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon', 'public.set_updated_at()', 'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated', 'public.set_updated_at()', 'EXECUTE'
    ),
  'anon and authenticated cannot execute all seven non-client functions'
);
-- 145.
select ok(
  not exists (
    select 1
    from pg_catalog.pg_namespace as namespaces
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        namespaces.nspacl,
        pg_catalog.acldefault('n', namespaces.nspowner)
      )
    ) as privileges
    where namespaces.nspname = 'private'
      and privileges.grantee = 0
      and privileges.privilege_type = 'USAGE'
  )
    and not has_schema_privilege('anon', 'private', 'USAGE')
    and not has_schema_privilege('authenticated', 'private', 'USAGE'),
  'public, anon, and authenticated have no USAGE on private schema'
);

set local role authenticated;

-- 146. Revoking direct trigger-function execution does not disable triggers.
select lives_ok(
  $$update public.beans
    set updated_at = '2000-01-01T00:00:00Z'
    where id = '30000000-0000-0000-0000-000000000001'$$,
  'bean updated_at trigger still executes for authenticated table updates'
);
-- 147.
select ok(
  (
    select updated_at > '2026-01-01T00:00:00Z'
    from public.beans
    where id = '30000000-0000-0000-0000-000000000001'
  ),
  'updated_at trigger ignores the submitted timestamp after execute revoke'
);

-- 148. Entity schema versions are controlled and currently fixed at one.
select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000033",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"bean",
    "entityId":"30000000-0000-0000-0000-000000000033",
    "operation":"upsert",
    "payload":{"name":"future version bean","schema_version":2}
  }]'::jsonb)$$,
  'P0001',
  'INVALID_PAYLOAD[1]: INVALID_SCHEMA_VERSION',
  'future entity schema version is rejected'
);
-- 149.
select ok(
  not exists (
    select 1 from public.beans
    where id = '30000000-0000-0000-0000-000000000033'
  )
    and not exists (
      select 1 from public.sync_mutation_receipts
      where mutation_id = '10000000-0000-0000-0000-000000000033'
    ),
  'future schema version writes neither entity nor receipt'
);
-- 150.
select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000034",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"bean",
    "entityId":"30000000-0000-0000-0000-000000000034",
    "operation":"upsert",
    "payload":{"name":"fractional version bean","schema_version":1.5}
  }]'::jsonb)$$,
  'P0001',
  'INVALID_PAYLOAD[1]: INVALID_SCHEMA_VERSION',
  'non-integer entity schema version is rejected'
);
-- 151.
select ok(
  not exists (
    select 1 from public.beans
    where id = '30000000-0000-0000-0000-000000000034'
  )
    and not exists (
      select 1 from public.sync_mutation_receipts
      where mutation_id = '10000000-0000-0000-0000-000000000034'
    ),
  'non-integer schema version writes neither entity nor receipt'
);

-- 152. Bean dates require real ISO date strings, never numeric coercion.
select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000035",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"bean",
    "entityId":"30000000-0000-0000-0000-000000000035",
    "operation":"upsert",
    "payload":{"name":"numeric date bean","roast_date":20260808}
  }]'::jsonb)$$,
  'P0001',
  'INVALID_PAYLOAD[1]: INVALID_ROAST_DATE',
  'numeric roast_date is rejected before database date coercion'
);
-- 153.
select ok(
  not exists (
    select 1 from public.beans
    where id = '30000000-0000-0000-0000-000000000035'
  )
    and not exists (
      select 1 from public.sync_mutation_receipts
      where mutation_id = '10000000-0000-0000-0000-000000000035'
    ),
  'numeric roast_date writes neither bean nor receipt'
);
-- 154.
select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000036",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"bean",
    "entityId":"30000000-0000-0000-0000-000000000036",
    "operation":"upsert",
    "payload":{"name":"impossible date bean","purchase_date":"2026-02-30"}
  }]'::jsonb)$$,
  'P0001',
  'INVALID_PAYLOAD[1]: INVALID_PURCHASE_DATE',
  'impossible ISO purchase_date is rejected with a stable error'
);
-- 155.
select ok(
  not exists (
    select 1 from public.beans
    where id = '30000000-0000-0000-0000-000000000036'
  )
    and not exists (
      select 1 from public.sync_mutation_receipts
      where mutation_id = '10000000-0000-0000-0000-000000000036'
    ),
  'impossible purchase_date writes neither bean nor receipt'
);

select * from finish();
rollback;
