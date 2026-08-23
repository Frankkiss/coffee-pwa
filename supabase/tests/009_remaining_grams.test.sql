begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_column('public', 'beans', 'remaining_grams', 'beans stores a remaining amount');
select col_type_is('public', 'beans', 'remaining_grams', 'numeric', 'remaining amount uses numeric');
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.beans'::regclass
      and conname = 'beans_remaining_grams_check'
      and not convalidated
  ),
  'remaining amount has a staged non-negative check'
);

insert into auth.users (id, email)
values ('90000000-0000-4000-8000-000000000001', 'remaining-grams@example.invalid');

select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select lives_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"90000000-0000-4000-8000-000000000011",
    "deviceId":"90000000-0000-4000-8000-000000000012",
    "entityType":"bean",
    "entityId":"90000000-0000-4000-8000-000000000013",
    "operation":"upsert",
    "payload":{
      "name":"Remaining amount bean",
      "remaining_grams":0,
      "flavor_tags":[],
      "bean_type":"single_origin",
      "blend_components":[],
      "schema_version":1
    }
  }]'::jsonb)$$,
  'sync accepts zero as a valid remaining amount'
);

select is(
  (
    select remaining_grams
    from public.beans
    where id = '90000000-0000-4000-8000-000000000013'
  ),
  0::numeric,
  'sync persists zero without treating the bean as missing'
);

select is(
  public.get_sync_snapshot() #>> '{beans,0,remaining_grams}',
  '0',
  'sync snapshot returns the remaining amount'
);

select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"90000000-0000-4000-8000-000000000021",
    "deviceId":"90000000-0000-4000-8000-000000000012",
    "entityType":"bean",
    "entityId":"90000000-0000-4000-8000-000000000023",
    "operation":"upsert",
    "payload":{"name":"Invalid remaining amount","remaining_grams":-1}
  }]'::jsonb)$$,
  'P0001',
  'INVALID_PAYLOAD[1]: INVALID_FIELD_RANGE',
  'sync rejects a negative remaining amount before writing'
);

select ok(
  not exists (
    select 1
    from public.beans
    where id = '90000000-0000-4000-8000-000000000023'
  ),
  'rejected remaining amount writes no bean'
);

select is(
  public.export_backup_v2('0.0.0-test', 'lightweight') #>> '{data,beans,0,remaining_grams}',
  '0',
  'backup export preserves the remaining amount'
);

reset role;

select lives_ok(
  $$with exported as (
      select public.export_backup_v2('0.0.0-test', 'lightweight') as document
    ),
    stripped as (
      select pg_catalog.jsonb_set(
        document,
        '{data,beans,0}',
        (document #> '{data,beans,0}') - 'remaining_grams'
      ) as document
      from exported
    ),
    signed as (
      select pg_catalog.jsonb_set(
        document,
        '{manifest,checksum}',
        pg_catalog.to_jsonb(
          pg_catalog.encode(
            extensions.digest(
              pg_catalog.convert_to(
                public.canonical_jsonb_text(document->'data'),
                'UTF8'
              ),
              'sha256'
            ),
            'hex'
          )
        )
      ) as document
      from stripped
    )
    select public.preview_restore_v2(document, 'safe_merge') from signed$$,
  'server preview keeps older backups without remaining_grams compatible'
);

select throws_ok(
  $$with exported as (
      select public.export_backup_v2('0.0.0-test', 'lightweight') as document
    ),
    invalid as (
      select pg_catalog.jsonb_set(
        document,
        '{data,beans,0,remaining_grams}',
        '-1'::jsonb
      ) as document
      from exported
    ),
    signed as (
      select pg_catalog.jsonb_set(
        document,
        '{manifest,checksum}',
        pg_catalog.to_jsonb(
          pg_catalog.encode(
            extensions.digest(
              pg_catalog.convert_to(
                public.canonical_jsonb_text(document->'data'),
                'UTF8'
              ),
              'sha256'
            ),
            'hex'
          )
        )
      ) as document
      from invalid
    )
    select public.preview_restore_v2(document, 'safe_merge') from signed$$,
  '22023',
  'BACKUP_FORMAT_INVALID',
  'server preview rejects a negative remaining amount'
);
reset role;

select * from finish();
rollback;