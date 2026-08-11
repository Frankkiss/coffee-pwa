begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;

select no_plan();

select has_function('public', 'canonical_jsonb_text', array['jsonb']);
select has_function('public', 'export_backup_v2', array['text', 'text']);
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
select ok(
  not has_function_privilege(
    'anon', 'public.export_backup_v2(text,text)', 'EXECUTE'
  )
    and not has_function_privilege(
      'anon', 'public.record_backup_download(text,text,jsonb)', 'EXECUTE'
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
      'authenticated',
      'public.record_backup_download(text,text,jsonb)',
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
  pg_catalog.pg_get_functiondef(
    'public.export_backup_v2(text,text)'::regprocedure
  ) like '%pg_advisory_xact_lock%hashtextextended(v_user_id::text, 0)%',
  'export uses the same per-user transaction lock as sync'
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

select set_config('request.jwt.claim.sub', '', true);
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
