begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_column('public', 'brew_templates', 'brew_mode', 'brew_templates exposes brew mode');
select has_column('public', 'brew_templates', 'brew_variant', 'brew_templates exposes brew variant');
select has_column('public', 'brew_templates', 'ice_grams', 'brew_templates exposes ice mass');
select has_column('public', 'brew_templates', 'beverage_grams', 'brew_templates exposes beverage mass');

insert into auth.users (id, email)
values (
  '92000000-0000-4000-8000-000000000001',
  'method-aware-template@example.invalid'
);

select set_config(
  'request.jwt.claim.sub',
  '92000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select lives_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"92000000-0000-4000-8000-000000000011",
    "deviceId":"92000000-0000-4000-8000-000000000012",
    "entityType":"brewTemplate",
    "entityId":"92000000-0000-4000-8000-000000000013",
    "operation":"upsert",
    "payload":{
      "name":"冰手冲测试模板",
      "category":"daily-pourover",
      "difficulty":"easy",
      "brewer":"V60",
      "filter":"锥形滤纸",
      "dose_grams":15,
      "water_grams":150,
      "ratio":"1:10",
      "water_temperature_min":92,
      "water_temperature_max":95,
      "grind_size":"中细",
      "target_time_min":100,
      "target_time_max":150,
      "pour_steps":[],
      "suitable_for":[],
      "avoid_for":[],
      "flavor_goal":"清甜",
      "adjustment_rules":[],
      "source_notes":"自定义模板",
      "source_urls":[],
      "is_champion_reference":false,
      "copied_from_template_id":null,
      "brew_mode":"iced_pourover",
      "brew_variant":null,
      "ice_grams":75,
      "beverage_grams":null,
      "schema_version":1
    }
  }]'::jsonb)$$,
  'sync accepts an explicit iced-pourover user template'
);

select is(
  public.get_sync_snapshot() #>> '{brewTemplates,0,brew_mode}',
  'iced_pourover',
  'sync snapshot exposes template mode metadata'
);

select is(
  public.get_sync_snapshot() #>> '{brewTemplates,0,ice_grams}',
  '75',
  'sync snapshot exposes template ice mass'
);

select throws_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"92000000-0000-4000-8000-000000000021",
    "deviceId":"92000000-0000-4000-8000-000000000012",
    "entityType":"brewTemplate",
    "entityId":"92000000-0000-4000-8000-000000000023",
    "operation":"upsert",
    "payload":{
      "name":"无效模板","category":"cold-brew","difficulty":"easy",
      "brewer":"冷萃壶","dose_grams":60,"water_grams":800,
      "water_temperature_min":4,"water_temperature_max":8,
      "target_time_min":43200,"target_time_max":64800,
      "brew_mode":"cold_brew","brew_variant":"ready_to_drink",
      "ice_grams":100,"schema_version":1
    }
  }]'::jsonb)$$,
  'P0001',
  'INVALID_PAYLOAD[1]: INVALID_METHOD_MEASUREMENT',
  'sync rejects serving ice for ready-to-drink cold brew templates'
);

reset role;

select lives_ok(
  $$select private.validate_backup_preview_row(
    'brewTemplates',
    (select pg_catalog.to_jsonb(template_row)
     from public.brew_templates as template_row
     where id = '92000000-0000-4000-8000-000000000013')
  )$$,
  'backup preview accepts method-aware templates'
);

select lives_ok(
  $$select private.validate_backup_preview_row(
    'brewLogs',
    '{
      "id":"92000000-0000-4000-8000-000000000031",
      "user_id":"92000000-0000-4000-8000-000000000001",
      "bean_id":null,
      "brewed_at":"2026-08-30T12:00:00Z",
      "method":"冷萃",
      "brew_mode":"cold_brew",
      "brew_variant":"concentrate",
      "ice_grams":120,
      "beverage_grams":null,
      "dripper":"冷萃壶",
      "filter_paper":"",
      "grinder":"",
      "grind_setting":"",
      "coffee_grams":50,
      "water_grams":400,
      "ratio":"1:8",
      "water_temperature_c":6,
      "total_time_seconds":43200,
      "pour_steps":[],
      "rating":null,
      "acidity":null,
      "sweetness":null,
      "bitterness":null,
      "astringency":null,
      "body":null,
      "aftertaste":null,
      "flavor_tags":[],
      "is_pinned_recipe":false,
      "notes":null,
      "created_at":"2026-08-30T12:00:00Z",
      "updated_at":"2026-08-30T12:00:00Z",
      "deleted_at":null,
      "schema_version":1
    }'::jsonb
  )$$,
  'the template backup wrapper preserves brew-log validation behavior'
);

select * from finish();
rollback;
