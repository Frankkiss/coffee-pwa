begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(60);

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

select * from finish();
rollback;
