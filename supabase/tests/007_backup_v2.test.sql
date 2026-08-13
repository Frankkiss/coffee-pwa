begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;

select no_plan();

select has_function('public', 'canonical_jsonb_text', array['jsonb']);
select has_function('public', 'export_backup_v2', array['text', 'text']);
select has_function('public', 'preview_restore_v2', array['jsonb', 'text']);
select has_function(
  'public', 'restore_backup_v2', array['jsonb', 'text', 'text']
);
select has_function(
  'public',
  'record_backup_download',
  array['text', 'text', 'jsonb']
);

select volatility_is(
  'public', 'canonical_jsonb_text', array['jsonb'], 'immutable',
  'canonical JSON helper is immutable'
);
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
        'public.canonical_jsonb_text(jsonb)'::regprocedure,
        'private.javascript_utf16_sort_key(text)'::regprocedure
      )
      and privileges.privilege_type = 'EXECUTE'
      and privileges.grantee in (
        0,
        (select oid from pg_catalog.pg_roles where rolname = 'anon'),
        (select oid from pg_catalog.pg_roles where rolname = 'authenticated')
      )
  ),
  'canonical JSON helpers are not directly executable by client roles'
);

create or replace function private.test_rechecksum_backup(p_backup jsonb)
returns jsonb
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select pg_catalog.jsonb_set(
    p_backup,
    '{manifest,checksum}',
    pg_catalog.to_jsonb(
      pg_catalog.encode(
        extensions.digest(
          pg_catalog.convert_to(
            public.canonical_jsonb_text(p_backup->'data'),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
    )
  )
$$;
select ok(
  not has_function_privilege(
    'anon', 'public.export_backup_v2(text,text)', 'EXECUTE'
  )
    and not has_function_privilege(
      'anon', 'public.preview_restore_v2(jsonb,text)', 'EXECUTE'
    )
    and not has_function_privilege(
      'anon', 'public.record_backup_download(text,text,jsonb)', 'EXECUTE'
    )
    and not has_function_privilege(
      'anon', 'public.restore_backup_v2(jsonb,text,text)', 'EXECUTE'
    )
    and not exists (
      select 1
      from pg_catalog.pg_proc as procedures
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          procedures.proacl,
          pg_catalog.acldefault('f', procedures.proowner)
        )
      ) as privileges
      where procedures.oid in (
          'public.export_backup_v2(text,text)'::regprocedure,
          'public.preview_restore_v2(jsonb,text)'::regprocedure,
          'public.restore_backup_v2(jsonb,text,text)'::regprocedure,
          'public.record_backup_download(text,text,jsonb)'::regprocedure
        )
        and privileges.grantee = 0
        and privileges.privilege_type = 'EXECUTE'
    ),
  'PUBLIC and anon cannot execute backup RPCs'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.export_backup_v2(text,text)', 'EXECUTE'
  )
    and has_function_privilege(
      'authenticated', 'public.preview_restore_v2(jsonb,text)', 'EXECUTE'
    )
    and has_function_privilege(
      'authenticated',
      'public.record_backup_download(text,text,jsonb)',
      'EXECUTE'
    )
    and has_function_privilege(
      'authenticated',
      'public.restore_backup_v2(jsonb,text,text)',
      'EXECUTE'
    ),
  'authenticated can execute backup RPCs'
);
select ok(
  (
    select prosecdef
      and coalesce(
        proconfig @> array['search_path=pg_catalog, pg_temp']::text[],
        false
      )
    from pg_catalog.pg_proc
    where oid = 'public.export_backup_v2(text,text)'::regprocedure
  ),
  'export RPC is definer-owned and search-path hardened'
);
select ok(
  (
    select prosecdef
      and coalesce(
        proconfig @> array['search_path=pg_catalog, pg_temp']::text[],
        false
      )
    from pg_catalog.pg_proc
    where oid = 'public.record_backup_download(text,text,jsonb)'::regprocedure
  ),
  'download metadata RPC is definer-owned and search-path hardened'
);
select ok(
  (
    select prosecdef
      and coalesce(
        proconfig @> array['search_path=pg_catalog, pg_temp']::text[],
        false
      )
    from pg_catalog.pg_proc
    where oid = 'public.preview_restore_v2(jsonb,text)'::regprocedure
  ),
  'preview RPC is definer-owned and search-path hardened'
);
select ok(
  (
    select prosecdef
      and coalesce(
        proconfig @> array['search_path=pg_catalog, pg_temp']::text[],
        false
      )
    from pg_catalog.pg_proc
    where oid = 'public.restore_backup_v2(jsonb,text,text)'::regprocedure
  ),
  'restore RPC is definer-owned and search-path hardened'
);
select ok(
  pg_catalog.pg_get_functiondef(
    'public.export_backup_v2(text,text)'::regprocedure
  ) like '%pg_advisory_xact_lock%hashtextextended(v_user_id::text, 0)%',
  'export uses the same per-user transaction lock as sync'
);
select ok(
  pg_catalog.pg_get_functiondef(
    'public.preview_restore_v2(jsonb,text)'::regprocedure
  ) like '%pg_advisory_xact_lock%hashtextextended(v_user_id::text, 0)%',
  'preview uses the same per-user transaction lock as sync'
);
select ok(
  pg_catalog.pg_get_functiondef(
    'public.restore_backup_v2(jsonb,text,text)'::regprocedure
  ) like '%pg_advisory_xact_lock%hashtextextended(v_user_id::text, 0)%',
  'restore uses the same per-user transaction lock as sync'
);
select is(
  (
    select pg_catalog.count(*)
    from pg_catalog.regexp_matches(
      pg_catalog.pg_get_functiondef(
        'public.restore_backup_v2(jsonb,text,text)'::regprocedure
      ),
      'on conflict \(id\) do nothing',
      'g'
    )
  ),
  5::bigint,
  'every globally keyed array insert safely skips a concurrent ID collision'
);
select ok(
  pg_catalog.pg_get_functiondef(
    'public.restore_backup_v2(jsonb,text,text)'::regprocedure
  ) like '%pg_advisory_xact_lock%hashtextextended(''backup-bean:'' || v_bean_id::text, 0)%'
  and (
    select pg_catalog.count(*)
    from pg_catalog.regexp_matches(
      pg_catalog.pg_get_functiondef(
        'public.restore_backup_v2(jsonb,text,text)'::regprocedure
      ),
      'preview_restore_v2\(p_backup, ''safe_merge''\)',
      'g'
    )
  ) = 2,
  'restore serializes global bean IDs and revalidates after collision locks'
);
select ok(
  pg_catalog.pg_get_functiondef(
    'public.restore_backup_v2(jsonb,text,text)'::regprocedure
  ) like '%actual post-insert state before any dependent write%'
  and pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.restore_backup_v2(jsonb,text,text)'::regprocedure
    ),
    'actual post-insert state before any dependent write'
  ) < pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.restore_backup_v2(jsonb,text,text)'::regprocedure
    ),
    'insert into public.brew_logs'
  ),
  'restore checks actual bean ownership after insert and before dependents'
);

select is(
  public.canonical_jsonb_text(
    '{"nested":{"z":true,"a":"咖啡"},"decimal":1.5,"array":[3,{"a":"换行\n引号\"反斜杠\\"},null]}'::jsonb
  ),
  $expected${"array":[3,{"a":"换行\n引号\"反斜杠\\"},null],"decimal":1.5,"nested":{"a":"咖啡","z":true}}$expected$,
  'canonical JSON matches browser text for Chinese, escapes, decimal, null, arrays and reordered keys'
);
select is(
  public.canonical_jsonb_text('{"b":2,"a":{"d":4,"c":3}}'::jsonb),
  public.canonical_jsonb_text('{"a":{"c":3,"d":4},"b":2}'::jsonb),
  'canonical JSON ignores object insertion order'
);
select is(
  public.canonical_jsonb_text('{"":2,"😀":1}'::jsonb),
  '{"😀":1,"":2}',
  'canonical JSON sorts supplementary-plane keys by JavaScript UTF-16 order'
);
select is(
  public.canonical_jsonb_text(
    '{"safeInteger":9007199254740991,"smallDecimal":0.000001,"fifteenDigits":0.123456789012345,"ordinary":1.5}'::jsonb
  ),
  '{"fifteenDigits":0.123456789012345,"ordinary":1.5,"safeInteger":9007199254740991,"smallDecimal":0.000001}',
  'canonical JSON accepts the shared browser numeric boundaries'
);
select throws_ok(
  $$select public.canonical_jsonb_text('{"value":0.0000001}'::jsonb)$$,
  '22023', 'BACKUP_NUMBER_NOT_CANONICAL',
  'canonical JSON rejects JavaScript exponent-boundary decimals'
);
select throws_ok(
  $$select public.canonical_jsonb_text('{"value":1.00}'::jsonb)$$,
  '22023', 'BACKUP_NUMBER_NOT_CANONICAL',
  'canonical JSON rejects trailing fractional zeros'
);
select throws_ok(
  $$select public.canonical_jsonb_text('{"value":9007199254740992}'::jsonb)$$,
  '22023', 'BACKUP_NUMBER_NOT_CANONICAL',
  'canonical JSON rejects unsafe integers'
);
select throws_ok(
  $$select public.canonical_jsonb_text('{"value":0.1234567890123456}'::jsonb)$$,
  '22023', 'BACKUP_NUMBER_NOT_CANONICAL',
  'canonical JSON rejects precision-collapsing decimals'
);

insert into auth.users (id, email)
values
  ('70000000-0000-0000-0000-000000000001', 'backup-one@example.invalid'),
  ('70000000-0000-0000-0000-000000000002', 'backup-two@example.invalid');

insert into public.profiles (id, display_name)
values
  ('70000000-0000-0000-0000-000000000001', '备份用户一'),
  ('70000000-0000-0000-0000-000000000002', 'Backup user two');

insert into public.beans (
  id, user_id, name, flavor_tags, bean_type, blend_components, net_weight_grams,
  deleted_at
)
values
  (
    '71000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000001',
    'Own bean B', array['berry'], 'single_origin', '[]'::jsonb, 15.5, null
  ),
  (
    '71000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    'Own bean A', '{}', 'single_origin', '[]'::jsonb, 15, null
  ),
  (
    '71000000-0000-0000-0000-000000000003',
    '70000000-0000-0000-0000-000000000001',
    'Deleted own bean', '{}', 'single_origin', '[]'::jsonb, null,
    '2026-08-08T01:00:00Z'
  ),
  (
    '71000000-0000-0000-0000-000000000004',
    '70000000-0000-0000-0000-000000000002',
    'Other bean', '{}', 'single_origin', '[]'::jsonb, null, null
  );

insert into public.brew_logs (id, user_id, bean_id, brewed_at, coffee_grams)
values
  (
    '72000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    '2026-08-08T02:00:00Z', 15
  ),
  (
    '72000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000002',
    '71000000-0000-0000-0000-000000000004',
    '2026-08-08T03:00:00Z', 16
  );

insert into public.brew_templates (
  id, user_id, name, category, difficulty, brewer, dose_grams, water_grams,
  water_temperature_min, water_temperature_max, target_time_min, target_time_max
)
values
  (
    '73000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    'Own template', 'daily-pourover', 'easy', 'V60', 15, 250, 90, 94, 150, 210
  ),
  (
    '73000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000002',
    'Other template', 'daily-pourover', 'easy', 'V60', 16, 256, 90, 94, 150, 210
  );

insert into public.ai_recommendations (
  id, user_id, bean_id, input_context, recommendation, model_name, accepted
)
values
  (
    '74000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001',
    '{"taste":"明亮"}'::jsonb, '{"temperature":92}'::jsonb, 'test-model', true
  ),
  (
    '74000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000002',
    '71000000-0000-0000-0000-000000000004',
    '{}'::jsonb, '{}'::jsonb, 'test-model', false
  );

insert into public.source_imports (
  id, user_id, source_url, source_type, status, extracted_payload,
  selected_payload
)
values
  (
    '75000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    'https://example.invalid/one', 'url', 'draft', '{"name":"豆"}'::jsonb,
    '{}'::jsonb
  ),
  (
    '75000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000002',
    'https://example.invalid/two', 'url', 'draft', '{}'::jsonb, '{}'::jsonb
  );

insert into public.user_settings (
  user_id, preferred_units, default_gear, taste_preferences,
  backup_reminder_days
)
values
  (
    '70000000-0000-0000-0000-000000000001',
    '{"weight":"grams"}'::jsonb, '{"dripper":"V60"}'::jsonb,
    '{"acidity":3}'::jsonb, 7
  ),
  (
    '70000000-0000-0000-0000-000000000002',
    '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 14
  );

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;

select is(
  (public.export_backup_v2('0.0.0-test', 'lightweight')->>'schemaVersion')::integer,
  2,
  'export produces schema version two'
);
select ok(
  public.export_backup_v2('0.0.0-test', 'lightweight') #> '{manifest}'
    @> '{"appVersion":"0.0.0-test","backupMode":"lightweight","checksumAlgorithm":"SHA-256","images":[],"warnings":[]}'::jsonb,
  'export returns the validated manifest contract'
);
reset role;
select is(
  public.export_backup_v2('0.0.0-test', 'lightweight') #>> '{manifest,checksum}',
  encode(
    digest(
      convert_to(
        public.canonical_jsonb_text(
          public.export_backup_v2('0.0.0-test', 'lightweight')->'data'
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),
  'export checksum matches the browser-compatible canonical data text'
);
set local role authenticated;
select is(
  public.export_backup_v2('0.0.0-test', 'lightweight') #> '{manifest,recordCounts}',
  '{"profile":1,"userSettings":1,"beans":2,"brewLogs":1,"brewTemplates":1,"aiRecommendations":1,"sourceImports":1}'::jsonb,
  'manifest contains exact counts for all seven logical sections'
);
select ok(
  (
    with exported as (
      select public.export_backup_v2('0.0.0-test', 'lightweight')->'data' as data
    )
    select jsonb_array_length(data->'beans') = 2
      and data #>> '{beans,0,id}' = '71000000-0000-0000-0000-000000000001'
      and data #>> '{beans,1,id}' = '71000000-0000-0000-0000-000000000002'
      and not exists (
        select 1
        from jsonb_array_elements(data->'beans') as row_data
        where row_data->>'user_id' <> '70000000-0000-0000-0000-000000000001'
          or row_data->>'deleted_at' is not null
      )
    from exported
  ),
  'export contains only active own beans in deterministic ID order'
);
select ok(
  (
    with data as (
      select public.export_backup_v2('0.0.0-test', 'lightweight')->'data' as value
    )
    select value->'profile' ?& array[
        'id', 'display_name', 'created_at', 'updated_at', 'schema_version'
      ]
      and value->'userSettings' ?& array[
        'user_id', 'preferred_units', 'default_gear', 'taste_preferences',
        'backup_reminder_days', 'created_at', 'updated_at', 'schema_version'
      ]
      and (value #> '{beans,0}') ?& array[
        'id', 'user_id', 'name', 'roaster', 'origin', 'farm_or_station',
        'process', 'variety', 'altitude_meters', 'roast_date', 'roast_level',
        'flavor_tags', 'flavor_notes', 'net_weight_grams', 'price',
        'purchase_date', 'source_url', 'image_url', 'bean_type',
        'blend_components', 'blend_notes', 'notes', 'created_at', 'updated_at',
        'deleted_at', 'schema_version'
      ]
    from data
  ),
  'export preserves complete profile, settings and bean row fields'
);
select ok(
  (
    with data as (
      select public.export_backup_v2('0.0.0-test', 'lightweight')->'data' as value
    )
    select jsonb_array_length(value->'brewLogs') = 1
      and jsonb_array_length(value->'brewTemplates') = 1
      and jsonb_array_length(value->'aiRecommendations') = 1
      and jsonb_array_length(value->'sourceImports') = 1
      and value #>> '{brewLogs,0,user_id}' = '70000000-0000-0000-0000-000000000001'
      and value #>> '{brewTemplates,0,user_id}' = '70000000-0000-0000-0000-000000000001'
      and value #>> '{aiRecommendations,0,user_id}' = '70000000-0000-0000-0000-000000000001'
      and value #>> '{sourceImports,0,user_id}' = '70000000-0000-0000-0000-000000000001'
      and (value #> '{brewLogs,0}') ?& array[
        'id', 'user_id', 'bean_id', 'brewed_at', 'method', 'dripper',
        'filter_paper', 'grinder', 'grind_setting', 'coffee_grams',
        'water_grams', 'ratio', 'water_temperature_c', 'total_time_seconds',
        'pour_steps', 'rating', 'acidity', 'sweetness', 'bitterness',
        'astringency', 'body', 'aftertaste', 'flavor_tags', 'is_pinned_recipe',
        'notes', 'created_at', 'updated_at', 'deleted_at', 'schema_version'
      ]
      and (value #> '{brewTemplates,0}') ?& array[
        'id', 'user_id', 'name', 'category', 'difficulty', 'brewer', 'filter',
        'dose_grams', 'water_grams', 'ratio', 'water_temperature_min',
        'water_temperature_max', 'grind_size', 'target_time_min',
        'target_time_max', 'pour_steps', 'suitable_for', 'avoid_for',
        'flavor_goal', 'adjustment_rules', 'source_notes', 'source_urls',
        'is_champion_reference', 'copied_from_template_id', 'created_at',
        'updated_at', 'deleted_at', 'schema_version'
      ]
      and (value #> '{aiRecommendations,0}') ?& array[
        'id', 'user_id', 'bean_id', 'input_context', 'recommendation',
        'model_name', 'accepted', 'created_at', 'updated_at', 'deleted_at',
        'schema_version'
      ]
      and (value #> '{sourceImports,0}') ?& array[
        'id', 'user_id', 'source_url', 'source_type', 'status',
        'extracted_payload', 'selected_payload', 'error_message', 'created_at',
        'updated_at', 'deleted_at', 'schema_version'
      ]
    from data
  ),
  'export includes complete active rows for every array section and no other user rows'
);

select throws_ok(
  $$select public.export_backup_v2('', 'lightweight')$$,
  '22023', 'INVALID_APP_VERSION',
  'export rejects an empty app version'
);
select throws_ok(
  $$select public.export_backup_v2('bad version', 'lightweight')$$,
  '22023', 'INVALID_APP_VERSION',
  'export rejects an app version with whitespace'
);
select throws_ok(
  $$select public.export_backup_v2('0.0.0-test', 'other')$$,
  '22023', 'INVALID_BACKUP_MODE',
  'export rejects an unknown mode'
);

reset role;

create temporary table restore_preview_fixtures (
  name text primary key,
  document jsonb not null
) on commit drop;

with base as materialized (
  select public.export_backup_v2('0.0.0-test', 'lightweight') as document
), changed as (
  select pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      document,
      '{data,beans}',
      pg_catalog.jsonb_build_array(
        (document #> '{data,beans,0}')
          || '{"user_id":"70000000-0000-0000-0000-000000000002"}'::jsonb,
        (document #> '{data,beans,0}')
          || '{"id":"71000000-0000-0000-0000-000000000003","user_id":"70000000-0000-0000-0000-000000000002","name":"Backup deleted bean"}'::jsonb,
        (document #> '{data,beans,0}')
          || '{"id":"71000000-0000-0000-0000-000000000099","user_id":"70000000-0000-0000-0000-000000000002","name":"Backup new bean"}'::jsonb
      )
    ),
    '{data,brewLogs}',
    pg_catalog.jsonb_build_array(
      (document #> '{data,brewLogs,0}')
        || '{"id":"72000000-0000-0000-0000-000000000099","user_id":"70000000-0000-0000-0000-000000000002","bean_id":"71000000-0000-0000-0000-000000000098"}'::jsonb
    )
  ) as document
  from base
), counted as (
  select pg_catalog.jsonb_set(
    document,
    '{manifest,recordCounts}',
    (document #> '{manifest,recordCounts}')
      || '{"beans":3,"brewLogs":1}'::jsonb
  ) as document
  from changed
)
insert into restore_preview_fixtures (name, document)
select 'native-v2', private.test_rechecksum_backup(document)
from counted;

create temporary table restore_preview_state_before on commit drop as
select pg_catalog.jsonb_build_object(
  'profiles', (select pg_catalog.jsonb_agg(p order by p.id) from public.profiles p),
  'settings', (select pg_catalog.jsonb_agg(s order by s.user_id) from public.user_settings s),
  'beans', (select pg_catalog.jsonb_agg(b order by b.id) from public.beans b),
  'brews', (select pg_catalog.jsonb_agg(l order by l.id) from public.brew_logs l),
  'templates', (select pg_catalog.jsonb_agg(t order by t.id) from public.brew_templates t),
  'recommendations', (select pg_catalog.jsonb_agg(a order by a.id) from public.ai_recommendations a),
  'imports', (select pg_catalog.jsonb_agg(i order by i.id) from public.source_imports i),
  'syncState', (select pg_catalog.jsonb_agg(ss order by ss.user_id) from public.user_sync_state ss),
  'backupExports', (select pg_catalog.jsonb_agg(be order by be.id) from public.backup_exports be)
) as value;

create temporary table restore_preview_results (
  mode text primary key,
  result jsonb not null
) on commit drop;

insert into restore_preview_results (mode, result)
select mode, public.preview_restore_v2(document, mode)
from restore_preview_fixtures
cross join (values ('safe_merge'), ('full_rollback')) as modes(mode)
where name = 'native-v2';

select is(
  (select result from restore_preview_results where mode = 'safe_merge'),
  '{"mode":"safe_merge","fullRollbackEligible":true,"counts":{"profile":{"total":1,"new":0,"existing":1,"softDeleted":0,"willUpdate":0,"willDelete":0},"userSettings":{"total":1,"new":0,"existing":1,"softDeleted":0,"willUpdate":0,"willDelete":0},"beans":{"total":3,"new":1,"existing":1,"softDeleted":1,"willUpdate":0,"willDelete":0},"brewLogs":{"total":1,"new":1,"existing":0,"softDeleted":0,"willUpdate":0,"willDelete":0},"brewTemplates":{"total":1,"new":0,"existing":1,"softDeleted":0,"willUpdate":0,"willDelete":0},"aiRecommendations":{"total":1,"new":0,"existing":1,"softDeleted":0,"willUpdate":0,"willDelete":0},"sourceImports":{"total":1,"new":0,"existing":1,"softDeleted":0,"willUpdate":0,"willDelete":0}},"invalidRelations":[{"entityType":"brewLog","entityId":"72000000-0000-0000-0000-000000000099","field":"bean_id","value":"71000000-0000-0000-0000-000000000098"}],"warnings":[]}'::jsonb,
  'safe merge preview distinguishes new, active, soft-deleted and invalid relations without destructive effects'
);
select is(
  (select result #> '{counts,beans}' from restore_preview_results where mode = 'full_rollback'),
  '{"total":3,"new":1,"existing":1,"softDeleted":1,"willUpdate":2,"willDelete":1}'::jsonb,
  'full rollback preview reports rows that will update, revive and soft-delete'
);
select is(
  (
    select pg_catalog.count(*)
    from restore_preview_results,
      lateral pg_catalog.jsonb_object_keys(result->'counts') keys(key)
    where mode = 'full_rollback'
  ),
  7::bigint,
  'preview returns exactly seven logical count partitions'
);
select is(
  (select value from restore_preview_state_before),
  pg_catalog.jsonb_build_object(
    'profiles', (select pg_catalog.jsonb_agg(p order by p.id) from public.profiles p),
    'settings', (select pg_catalog.jsonb_agg(s order by s.user_id) from public.user_settings s),
    'beans', (select pg_catalog.jsonb_agg(b order by b.id) from public.beans b),
    'brews', (select pg_catalog.jsonb_agg(l order by l.id) from public.brew_logs l),
    'templates', (select pg_catalog.jsonb_agg(t order by t.id) from public.brew_templates t),
    'recommendations', (select pg_catalog.jsonb_agg(a order by a.id) from public.ai_recommendations a),
    'imports', (select pg_catalog.jsonb_agg(i order by i.id) from public.source_imports i),
    'syncState', (select pg_catalog.jsonb_agg(ss order by ss.user_id) from public.user_sync_state ss),
    'backupExports', (select pg_catalog.jsonb_agg(be order by be.id) from public.backup_exports be)
  ),
  'preview leaves business rows, sync metadata and backup metadata unchanged'
);
select throws_ok(
  $$select public.preview_restore_v2(
    pg_catalog.jsonb_set(
      (select document from restore_preview_fixtures where name = 'native-v2'),
      '{manifest,checksum}',
      '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"'
    ),
    'safe_merge'
  )$$,
  '22023', 'BACKUP_CHECKSUM_MISMATCH',
  'preview rejects a checksum mismatch'
);
select throws_ok(
  $$select public.preview_restore_v2(
    (select document from restore_preview_fixtures where name = 'native-v2')
      || '{"unexpected":true}'::jsonb,
    'safe_merge'
  )$$,
  '22023', 'BACKUP_FORMAT_INVALID',
  'preview rejects unknown root keys'
);
select throws_ok(
  $$select public.preview_restore_v2(
    private.test_rechecksum_backup(
      pg_catalog.jsonb_set(
        (select document from restore_preview_fixtures where name = 'native-v2'),
        '{data,beans,0}',
        (select document #> '{data,beans,0}' from restore_preview_fixtures where name = 'native-v2')
          || '{"unexpected":true}'::jsonb
      )
    ),
    'safe_merge'
  )$$,
  '22023', 'BACKUP_FORMAT_INVALID',
  'preview rejects unknown row keys'
);
select throws_ok(
  $$select public.preview_restore_v2(
    private.test_rechecksum_backup(
      pg_catalog.jsonb_set(
        (select document from restore_preview_fixtures where name = 'native-v2'),
        '{data,beans,0,name}',
        '42'::jsonb
      )
    ),
    'safe_merge'
  )$$,
  '22023', 'BACKUP_FORMAT_INVALID',
  'preview rejects coercible values with the wrong JSON type'
);
select throws_ok(
  $$select public.preview_restore_v2(
    pg_catalog.jsonb_set(
      (select document from restore_preview_fixtures where name = 'native-v2'),
      '{schemaVersion}',
      '3'::jsonb
    ),
    'safe_merge'
  )$$,
  '22023', 'BACKUP_FORMAT_INVALID',
  'preview rejects unsupported schema versions'
);
select throws_ok(
  $$select public.preview_restore_v2(
    private.test_rechecksum_backup(
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          (select document from restore_preview_fixtures where name = 'native-v2'),
          '{data,beans}',
          pg_catalog.jsonb_build_array(
            (select document #> '{data,beans,0}' from restore_preview_fixtures where name = 'native-v2')
              || '{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'::jsonb,
            (select document #> '{data,beans,0}' from restore_preview_fixtures where name = 'native-v2')
              || '{"id":"AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"}'::jsonb
          )
        ),
        '{manifest,recordCounts,beans}',
        '2'::jsonb
      )
    ),
    'safe_merge'
  )$$,
  '22023', 'BACKUP_FORMAT_INVALID',
  'preview rejects UUID duplicates that differ only by hexadecimal case'
);
select is(
  public.preview_restore_v2(
    private.test_rechecksum_backup(
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          pg_catalog.jsonb_set(
            pg_catalog.jsonb_set(
              (select document from restore_preview_fixtures where name = 'native-v2'),
              '{data,beans}',
              pg_catalog.jsonb_build_array(
                (select document #> '{data,beans,0}' from restore_preview_fixtures where name = 'native-v2')
                  || '{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'::jsonb
              )
            ),
            '{data,brewLogs}',
            pg_catalog.jsonb_build_array(
              (select document #> '{data,brewLogs,0}' from restore_preview_fixtures where name = 'native-v2')
                || '{"bean_id":"AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"}'::jsonb
            )
          ),
          '{data,aiRecommendations}',
          '[]'::jsonb
        ),
        '{manifest,recordCounts}',
        (select document #> '{manifest,recordCounts}' from restore_preview_fixtures where name = 'native-v2')
          || '{"beans":1,"brewLogs":1,"aiRecommendations":0}'::jsonb
      )
    ),
    'safe_merge'
  ) #> '{invalidRelations}',
  '[]'::jsonb,
  'preview resolves UUID relations case-insensitively'
);
select throws_ok(
  $$select public.preview_restore_v2(
    private.test_rechecksum_backup(
      pg_catalog.jsonb_set(
        (select document from restore_preview_fixtures where name = 'native-v2'),
        '{data,beans,0,net_weight_grams}',
        '0.0000001'::jsonb
      )
    ),
    'safe_merge'
  )$$,
  '22023', 'BACKUP_NUMBER_NOT_CANONICAL',
  'preview rejects a noncanonical numeric value before computing impact'
);

with native as (
  select document from restore_preview_fixtures where name = 'native-v2'
), transport as (
  select pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      document,
      '{data}',
      pg_catalog.jsonb_build_object(
        'profile', null,
        'userSettings', null,
        'beans', document #> '{data,beans}',
        'brewLogs', '[]'::jsonb,
        'brewTemplates', '[]'::jsonb,
        'aiRecommendations', '[]'::jsonb,
        'sourceImports', '[]'::jsonb
      )
    ),
    '{manifest}',
    (document->'manifest') || pg_catalog.jsonb_build_object(
      'sourceSchemaVersion', 1,
      'fullRollbackEligible', false,
      'authoritativeSections', pg_catalog.jsonb_build_array('beans'),
      'recordCounts', '{"profile":0,"userSettings":0,"beans":3,"brewLogs":0,"brewTemplates":0,"aiRecommendations":0,"sourceImports":0}'::jsonb
    )
  ) as document
  from native
)
insert into restore_preview_fixtures (name, document)
select 'derived-v1', private.test_rechecksum_backup(document) from transport;

select is(
  public.preview_restore_v2(
    (select document from restore_preview_fixtures where name = 'derived-v1'),
    'safe_merge'
  ) #>> '{fullRollbackEligible}',
  'false',
  'v1-derived backup remains safe-merge-only'
);
select throws_ok(
  $$select public.preview_restore_v2(
    (select document from restore_preview_fixtures where name = 'derived-v1'),
    'full_rollback'
  )$$,
  '22023', 'BACKUP_FULL_ROLLBACK_NOT_ELIGIBLE',
  'v1-derived backup cannot preview full rollback'
);
select throws_ok(
  $$select public.preview_restore_v2(
    private.test_rechecksum_backup(
      pg_catalog.jsonb_set(
        (select document from restore_preview_fixtures where name = 'derived-v1'),
        '{manifest,authoritativeSections}',
        '["beans","sourceImports"]'::jsonb
      )
    ),
    'safe_merge'
  )$$,
  '22023', 'BACKUP_FORMAT_INVALID',
  'v1-derived backup rejects forged authoritative sections'
);
select throws_ok(
  $$select public.preview_restore_v2(
    pg_catalog.jsonb_set(
      (select document from restore_preview_fixtures where name = 'derived-v1'),
      '{manifest,fullRollbackEligible}',
      'true'::jsonb
    ),
    'safe_merge'
  )$$,
  '22023', 'BACKUP_FORMAT_INVALID',
  'v1-derived backup rejects forged eligibility'
);

create temporary table safe_merge_fixtures (
  name text primary key,
  document jsonb not null
) on commit drop;

with base as materialized (
  select public.export_backup_v2('0.0.0-test', 'lightweight') as document
), changed as (
  select pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          pg_catalog.jsonb_set(
            document,
            '{data,beans}',
            pg_catalog.jsonb_build_array(
              (document #> '{data,beans,0}')
                || '{"user_id":"ffffffff-ffff-4fff-8fff-ffffffffffff","name":"must not update active"}'::jsonb,
              (document #> '{data,beans,0}')
                || '{"id":"71000000-0000-0000-0000-000000000003","user_id":"ffffffff-ffff-4fff-8fff-ffffffffffff","name":"must not revive deleted"}'::jsonb,
              (document #> '{data,beans,0}')
                || '{"id":"71000000-0000-0000-0000-000000000004","user_id":"ffffffff-ffff-4fff-8fff-ffffffffffff","name":"must not expose cross-user collision"}'::jsonb,
              (document #> '{data,beans,0}')
                || '{"id":"71000000-0000-4000-8000-000000000101","user_id":"ffffffff-ffff-4fff-8fff-ffffffffffff","name":"safe merged bean"}'::jsonb
            )
          ),
          '{data,brewLogs}',
          pg_catalog.jsonb_build_array(
            (document #> '{data,brewLogs,0}')
              || '{"id":"72000000-0000-4000-8000-000000000101","user_id":"ffffffff-ffff-4fff-8fff-ffffffffffff","bean_id":"71000000-0000-4000-8000-000000000101"}'::jsonb
          )
        ),
        '{data,brewTemplates}',
        pg_catalog.jsonb_build_array(
          (document #> '{data,brewTemplates,0}')
            || '{"id":"73000000-0000-4000-8000-000000000101","user_id":"ffffffff-ffff-4fff-8fff-ffffffffffff","name":"safe merged template"}'::jsonb
        )
      ),
      '{data,aiRecommendations}',
      pg_catalog.jsonb_build_array(
        (document #> '{data,aiRecommendations,0}')
          || '{"id":"74000000-0000-4000-8000-000000000101","user_id":"ffffffff-ffff-4fff-8fff-ffffffffffff","bean_id":"71000000-0000-4000-8000-000000000101"}'::jsonb
      )
    ),
    '{data,sourceImports}',
    pg_catalog.jsonb_build_array(
      (document #> '{data,sourceImports,0}')
        || '{"id":"75000000-0000-4000-8000-000000000101","user_id":"ffffffff-ffff-4fff-8fff-ffffffffffff","source_url":"https://example.invalid/safe-merge"}'::jsonb
    )
  ) as document
  from base
), counted as (
  select pg_catalog.jsonb_set(
    document,
    '{manifest,recordCounts}',
    (document #> '{manifest,recordCounts}')
      || '{"beans":4,"brewLogs":1,"brewTemplates":1,"aiRecommendations":1,"sourceImports":1}'::jsonb
  ) as document
  from changed
)
insert into safe_merge_fixtures (name, document)
select 'complete', private.test_rechecksum_backup(document) from counted;

create temporary table safe_merge_epoch_before on commit drop as
select sync_epoch from public.user_sync_state
where user_id = '70000000-0000-0000-0000-000000000001';

select is(
  public.restore_backup_v2(
    (select document from safe_merge_fixtures where name = 'complete'),
    'safe_merge',
    null
  ),
  '{"mode":"safe_merge","counts":{"profile":{"inserted":0,"skipped":1},"userSettings":{"inserted":0,"skipped":1},"beans":{"inserted":1,"skipped":3},"brewLogs":{"inserted":1,"skipped":0},"brewTemplates":{"inserted":1,"skipped":0},"aiRecommendations":{"inserted":1,"skipped":0},"sourceImports":{"inserted":1,"skipped":0}}}'::jsonb,
  'safe merge returns exact inserted and skipped counts for seven sections'
);
select ok(
  (select user_id = '70000000-0000-0000-0000-000000000001'::uuid
     from public.beans where id = '71000000-0000-4000-8000-000000000101')
  and (select user_id = '70000000-0000-0000-0000-000000000001'::uuid
     from public.brew_logs where id = '72000000-0000-4000-8000-000000000101')
  and (select user_id = '70000000-0000-0000-0000-000000000001'::uuid
     from public.brew_templates where id = '73000000-0000-4000-8000-000000000101')
  and (select user_id = '70000000-0000-0000-0000-000000000001'::uuid
     from public.ai_recommendations where id = '74000000-0000-4000-8000-000000000101')
  and (select user_id = '70000000-0000-0000-0000-000000000001'::uuid
     from public.source_imports where id = '75000000-0000-4000-8000-000000000101'),
  'safe merge inserts dependencies first and rewrites every supplied owner'
);
select ok(
  (select name = 'Own bean A' from public.beans where id = '71000000-0000-0000-0000-000000000001')
  and (select name = 'Deleted own bean' and deleted_at is not null from public.beans where id = '71000000-0000-0000-0000-000000000003')
  and (select user_id = '70000000-0000-0000-0000-000000000002'::uuid and name = 'Other bean' from public.beans where id = '71000000-0000-0000-0000-000000000004'),
  'safe merge never updates, revives, or takes ownership of global ID collisions'
);
select is(
  (select sync_epoch from public.user_sync_state where user_id = '70000000-0000-0000-0000-000000000001'),
  (select sync_epoch from safe_merge_epoch_before),
  'safe merge does not change sync epoch'
);

select throws_ok(
  $$select public.restore_backup_v2(
    private.test_rechecksum_backup(
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          (select document from safe_merge_fixtures where name = 'complete'),
          '{data,brewLogs,0,bean_id}',
          '"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"'::jsonb
        ),
        '{manifest,recordCounts,beans}',
        '4'::jsonb
      )
    ), 'safe_merge', null
  )$$,
  '22023', 'BACKUP_INVALID_RELATIONS',
  'safe merge rejects orphan relations instead of weakening them'
);

select throws_ok(
  $$select public.restore_backup_v2(
    private.test_rechecksum_backup(
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          pg_catalog.jsonb_set(
            (select document from safe_merge_fixtures where name = 'complete'),
            '{data,beans}',
            pg_catalog.jsonb_build_array(
              ((select document #> '{data,beans,3}' from safe_merge_fixtures where name = 'complete')
                || '{"id":"71000000-0000-4000-8000-000000000102"}'::jsonb)
            )
          ),
          '{data,brewTemplates,0}',
          ((select document #> '{data,brewTemplates,0}' from safe_merge_fixtures where name = 'complete')
            || '{"id":"73000000-0000-4000-8000-000000000102","dose_grams":-1}'::jsonb)
        ),
        '{manifest,recordCounts,beans}', '1'::jsonb
      )
    ), 'safe_merge', null
  )$$,
  '23514',
  'new row for relation "brew_templates" violates check constraint "brew_templates_measurements_check"',
  'a later selected-row constraint failure aborts the whole restore statement'
);
select is(
  (select count(*) from public.beans where id = '71000000-0000-4000-8000-000000000102'),
  0::bigint,
  'safe merge rolls back earlier dependency inserts after a later failure'
);

select throws_ok(
  $$select public.restore_backup_v2(
    private.test_rechecksum_backup(
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          (select document from safe_merge_fixtures where name = 'complete'),
          '{data,beans}',
          pg_catalog.jsonb_build_array(
            ((select document #> '{data,beans,3}' from safe_merge_fixtures where name = 'complete') || '{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'::jsonb),
            ((select document #> '{data,beans,3}' from safe_merge_fixtures where name = 'complete') || '{"id":"AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"}'::jsonb)
          )
        ),
        '{manifest,recordCounts,beans}', '2'::jsonb
      )
    ), 'safe_merge', null
  )$$,
  '22023', 'BACKUP_FORMAT_INVALID',
  'safe merge rejects duplicate UUIDs after case normalization'
);

select is(
  public.restore_backup_v2(
    private.test_rechecksum_backup(
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          (select document from safe_merge_fixtures where name = 'complete'),
          '{data}',
          '{"profile":null,"userSettings":null,"beans":[],"brewLogs":[],"brewTemplates":[],"aiRecommendations":[],"sourceImports":[]}'::jsonb
        ),
        '{manifest,recordCounts}',
        '{"profile":0,"userSettings":0,"beans":0,"brewLogs":0,"brewTemplates":0,"aiRecommendations":0,"sourceImports":0}'::jsonb
      )
    ), 'safe_merge', null
  ),
  '{"mode":"safe_merge","counts":{"profile":{"inserted":0,"skipped":0},"userSettings":{"inserted":0,"skipped":0},"beans":{"inserted":0,"skipped":0},"brewLogs":{"inserted":0,"skipped":0},"brewTemplates":{"inserted":0,"skipped":0},"aiRecommendations":{"inserted":0,"skipped":0},"sourceImports":{"inserted":0,"skipped":0}}}'::jsonb,
  'safe merge preserves nullable profile/settings and empty seven-section semantics'
);

delete from public.brew_logs where id = '72000000-0000-4000-8000-000000000101';
delete from public.ai_recommendations where id = '74000000-0000-4000-8000-000000000101';
delete from public.brew_templates where id = '73000000-0000-4000-8000-000000000101';
delete from public.source_imports where id = '75000000-0000-4000-8000-000000000101';
delete from public.beans where id = '71000000-0000-4000-8000-000000000101';

select is(
  public.restore_backup_v2(
    (select document from restore_preview_fixtures where name = 'derived-v1'),
    'safe_merge', null
  ) #> '{counts}',
  '{"profile":{"inserted":0,"skipped":0},"userSettings":{"inserted":0,"skipped":0},"beans":{"inserted":1,"skipped":2},"brewLogs":{"inserted":0,"skipped":0},"brewTemplates":{"inserted":0,"skipped":0},"aiRecommendations":{"inserted":0,"skipped":0},"sourceImports":{"inserted":0,"skipped":0}}'::jsonb,
  'v1-derived safe merge writes only its declared authoritative sections'
);
delete from public.beans where id = '71000000-0000-0000-0000-000000000099';

select throws_ok(
  $$select public.restore_backup_v2(
    (select document from safe_merge_fixtures where name = 'complete'),
    'full_rollback', 'FULL RESTORE'
  )$$,
  '22023', 'INVALID_RESTORE_MODE',
  'Task 5 restore endpoint cannot execute full rollback'
);

select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-0000-0000-000000000002',
  true
);
select is(
  public.preview_restore_v2(
    (select document from restore_preview_fixtures where name = 'native-v2'),
    'safe_merge'
  ) #> '{counts,beans}',
  '{"total":3,"new":3,"existing":0,"softDeleted":0,"willUpdate":0,"willDelete":0}'::jsonb,
  'preview does not reveal another user rows even when backup IDs collide'
);

select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.preview_restore_v2(
    (select document from restore_preview_fixtures where name = 'native-v2'),
    'safe_merge'
  )$$,
  '42501', 'AUTH_REQUIRED',
  'preview rejects a missing authenticated user'
);
select throws_ok(
  $$select public.export_backup_v2('0.0.0-test', 'lightweight')$$,
  '42501', 'AUTH_REQUIRED',
  'export rejects a missing authenticated user'
);
select throws_ok(
  $$select public.record_backup_download(
    'coffee-backup-2026-08-08.json',
    'lightweight',
    '{"profile":1,"userSettings":1,"beans":2,"brewLogs":1,"brewTemplates":1,"aiRecommendations":1,"sourceImports":1}'::jsonb
  )$$,
  '42501', 'AUTH_REQUIRED',
  'download metadata rejects a missing authenticated user'
);

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-0000-0000-000000000001',
  true
);

with recorded as materialized (
  select public.record_backup_download(
    'coffee-backup-2026-08-08.json',
    'lightweight',
    '{"profile":1,"userSettings":1,"beans":2,"brewLogs":1,"brewTemplates":1,"aiRecommendations":1,"sourceImports":1}'::jsonb
  ) as created_at
)
select ok(
  (select created_at from recorded) >= statement_timestamp() - interval '5 seconds'
    and (select created_at from recorded) <= clock_timestamp() + interval '1 second',
  'download metadata returns a server timestamp'
);
select ok(
  (
    select user_id = '70000000-0000-0000-0000-000000000001'::uuid
      and export_type = 'lightweight'
      and includes_images is false
      and file_name = 'coffee-backup-2026-08-08.json'
      and record_counts = '{"profile":1,"userSettings":1,"beans":2,"brewLogs":1,"brewTemplates":1,"aiRecommendations":1,"sourceImports":1}'::jsonb
      and created_at = updated_at
      and deleted_at is null
    from public.backup_exports
    where file_name = 'coffee-backup-2026-08-08.json'
  ),
  'download metadata derives owner and complete metadata on the server'
);
select throws_ok(
  $$select public.record_backup_download(
    'coffee-backup-2026-08-08.json', 'other',
    '{"profile":1,"userSettings":1,"beans":2,"brewLogs":1,"brewTemplates":1,"aiRecommendations":1,"sourceImports":1}'::jsonb
  )$$,
  '22023', 'INVALID_BACKUP_MODE',
  'download metadata rejects an unknown mode'
);
select throws_ok(
  $$select public.record_backup_download(
    '../coffee-backup-2026-08-08.json', 'lightweight',
    '{"profile":1,"userSettings":1,"beans":2,"brewLogs":1,"brewTemplates":1,"aiRecommendations":1,"sourceImports":1}'::jsonb
  )$$,
  '22023', 'INVALID_BACKUP_FILE_NAME',
  'download metadata rejects a noncanonical filename'
);
select throws_ok(
  $$select public.record_backup_download(
    'coffee-backup-2026-02-30.json', 'lightweight',
    '{"profile":1,"userSettings":1,"beans":2,"brewLogs":1,"brewTemplates":1,"aiRecommendations":1,"sourceImports":1}'::jsonb
  )$$,
  '22023', 'INVALID_BACKUP_FILE_NAME',
  'download metadata rejects an impossible calendar date'
);
select throws_ok(
  $$select public.record_backup_download(
    'coffee-backup-2026-08-08.json', 'lightweight',
    '{"profile":1,"userSettings":1,"beans":2}'::jsonb
  )$$,
  '22023', 'INVALID_RECORD_COUNTS',
  'download metadata rejects missing count keys'
);
select throws_ok(
  $$select public.record_backup_download(
    'coffee-backup-2026-08-08.json', 'lightweight',
    '{"profile":1,"userSettings":1,"beans":2,"brewLogs":1,"brewTemplates":1,"aiRecommendations":1,"sourceImports":1,"user_id":9}'::jsonb
  )$$,
  '22023', 'INVALID_RECORD_COUNTS',
  'download metadata rejects unknown count keys including user_id'
);
select throws_ok(
  $$select public.record_backup_download(
    'coffee-backup-2026-08-08.json', 'lightweight',
    '{"profile":2,"userSettings":1,"beans":2,"brewLogs":1,"brewTemplates":1,"aiRecommendations":1,"sourceImports":1}'::jsonb
  )$$,
  '22023', 'INVALID_RECORD_COUNTS',
  'download metadata limits singleton section counts'
);
select throws_ok(
  $$select public.record_backup_download(
    'coffee-backup-2026-08-08.json', 'lightweight',
    '{"profile":1,"userSettings":1,"beans":-1,"brewLogs":1,"brewTemplates":1,"aiRecommendations":1,"sourceImports":1}'::jsonb
  )$$,
  '22023', 'INVALID_RECORD_COUNTS',
  'download metadata rejects negative counts'
);
select throws_ok(
  $$select public.record_backup_download(
    'coffee-backup-2026-08-08.json', 'lightweight',
    '{"profile":1,"userSettings":1,"beans":1.5,"brewLogs":1,"brewTemplates":1,"aiRecommendations":1,"sourceImports":1}'::jsonb
  )$$,
  '22023', 'INVALID_RECORD_COUNTS',
  'download metadata rejects fractional counts'
);
select lives_ok(
  $$select public.record_backup_download(
    'coffee-backup-2026-08-08.zip', 'complete',
    '{"profile":1,"userSettings":1,"beans":2,"brewLogs":1,"brewTemplates":1,"aiRecommendations":1,"sourceImports":1}'::jsonb
  )$$,
  'download metadata accepts canonical complete-backup ZIP metadata'
);

select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-0000-0000-000000000002',
  true
);
select is(
  (select count(*) from public.backup_exports),
  0::bigint,
  'RLS prevents another user from reading download metadata'
);

reset role;

select is(
  (
    select count(*)
    from public.backup_exports
    where user_id = '70000000-0000-0000-0000-000000000001'
  ),
  2::bigint,
  'only successful current-user metadata calls insert rows'
);
select is(
  (
    select count(*)
    from public.backup_exports
    where user_id = '70000000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  'client input cannot create metadata for another user'
);

select * from finish();
rollback;
