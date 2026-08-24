begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

insert into auth.users (id, email)
values (
  '91000000-0000-4000-8000-000000000001',
  'cold-brew-serving-ice@example.invalid'
);

select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select lives_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"91000000-0000-4000-8000-000000000011",
    "deviceId":"91000000-0000-4000-8000-000000000012",
    "entityType":"brewLog",
    "entityId":"91000000-0000-4000-8000-000000000013",
    "operation":"upsert",
    "payload":{
      "brewed_at":"2026-08-24T12:00:00Z",
      "method":"冷萃",
      "brew_mode":"cold_brew",
      "brew_variant":"concentrate",
      "ice_grams":120,
      "coffee_grams":50,
      "water_grams":400,
      "ratio":"1:8",
      "pour_steps":[],
      "flavor_tags":[],
      "is_pinned_recipe":false,
      "schema_version":1
    }
  }]'::jsonb)$$,
  'sync accepts serving ice for cold brew concentrate'
);

select is(
  (
    select format('%s|%s', ice_grams, ratio)
    from public.brew_logs
    where id = '91000000-0000-4000-8000-000000000013'
  ),
  '120|1:8',
  'serving ice persists without changing the extraction ratio'
);

reset role;

select lives_ok(
  $$select private.validate_backup_preview_row(
    'brewLogs',
    (
      select pg_catalog.to_jsonb(log)
      from public.brew_logs as log
      where id = '91000000-0000-4000-8000-000000000013'
    )
  )$$,
  'backup preview accepts cold brew concentrate serving ice'
);

select throws_ok(
  $$select private.validate_backup_preview_row(
    'brewLogs',
    pg_catalog.jsonb_set(
      (
        select pg_catalog.to_jsonb(log)
        from public.brew_logs as log
        where id = '91000000-0000-4000-8000-000000000013'
      ),
      '{brew_variant}',
      '"ready_to_drink"'::jsonb
    )
  )$$,
  '22023',
  'BACKUP_FORMAT_INVALID',
  'backup preview rejects serving ice for ready-to-drink cold brew'
);

select * from finish();
rollback;
