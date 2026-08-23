alter table public.brew_logs
  add column if not exists brew_mode text,
  add column if not exists brew_variant text,
  add column if not exists ice_grams numeric,
  add column if not exists beverage_grams numeric;

alter table public.brew_logs
  add constraint brew_logs_brew_mode_check
    check (brew_mode is null or brew_mode in (
      'hot_pourover', 'iced_pourover', 'cold_brew', 'espresso'
    )),
  add constraint brew_logs_brew_variant_check
    check (brew_variant is null or brew_variant in ('ready_to_drink', 'concentrate')),
  add constraint brew_logs_ice_grams_check
    check (ice_grams is null or ice_grams >= 0),
  add constraint brew_logs_beverage_grams_check
    check (beverage_grams is null or beverage_grams >= 0),
  add constraint brew_logs_method_measurements_check
    check (
      (brew_variant is null or brew_mode = 'cold_brew')
      and (ice_grams is null or brew_mode = 'iced_pourover')
      and (beverage_grams is null or brew_mode = 'espresso')
    );

do $$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'private.apply_brew_log_mutation(uuid,uuid,text,jsonb)'::regprocedure
  ) into v_definition;
  v_definition := pg_catalog.replace(
    v_definition,
    'private.apply_brew_log_mutation',
    'private.apply_brew_log_mutation_before_method_fields'
  );
  execute v_definition;
end;
$$;

create or replace function private.apply_brew_log_mutation(
  p_user_id uuid,
  p_entity_id uuid,
  p_operation text,
  p_payload jsonb
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_clean_payload jsonb;
begin
  if p_operation = 'delete' then
    perform private.apply_brew_log_mutation_before_method_fields(
      p_user_id, p_entity_id, p_operation, p_payload
    );
    return;
  end if;

  if private.has_unknown_fields(
    p_payload,
    array[
      'bean_id', 'brewed_at', 'method', 'dripper', 'filter_paper', 'grinder',
      'grind_setting', 'coffee_grams', 'water_grams', 'ratio',
      'water_temperature_c', 'total_time_seconds', 'pour_steps', 'rating',
      'acidity', 'sweetness', 'bitterness', 'astringency', 'body',
      'aftertaste', 'flavor_tags', 'is_pinned_recipe', 'notes',
      'brew_mode', 'brew_variant', 'ice_grams', 'beverage_grams',
      'schema_version'
    ]::text[]
  ) then
    raise exception using errcode = 'P0001', message = 'UNKNOWN_FIELDS';
  end if;

  if (p_payload ? 'brew_mode')
    and (p_payload -> 'brew_mode') <> 'null'::jsonb
    and (
      pg_catalog.jsonb_typeof(p_payload -> 'brew_mode') <> 'string'
      or p_payload ->> 'brew_mode' not in (
        'hot_pourover', 'iced_pourover', 'cold_brew', 'espresso'
      )
    )
  then
    raise exception using errcode = 'P0001', message = 'INVALID_BREW_MODE';
  end if;

  if (p_payload ? 'brew_variant')
    and (p_payload -> 'brew_variant') <> 'null'::jsonb
    and (
      pg_catalog.jsonb_typeof(p_payload -> 'brew_variant') <> 'string'
      or p_payload ->> 'brew_variant' not in ('ready_to_drink', 'concentrate')
    )
  then
    raise exception using errcode = 'P0001', message = 'INVALID_BREW_VARIANT';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(p_payload) as fields(field_name, field_value)
    where field_name in ('ice_grams', 'beverage_grams')
      and field_value <> 'null'::jsonb
      and (
        pg_catalog.jsonb_typeof(field_value) <> 'number'
        or (field_value #>> '{}')::numeric < 0
      )
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_METHOD_MEASUREMENT';
  end if;

  v_clean_payload := p_payload - array[
    'brew_mode', 'brew_variant', 'ice_grams', 'beverage_grams'
  ]::text[];

  perform private.apply_brew_log_mutation_before_method_fields(
    p_user_id, p_entity_id, p_operation, v_clean_payload
  );

  update public.brew_logs
  set brew_mode = case when p_payload ? 'brew_mode'
        then p_payload ->> 'brew_mode' else brew_mode end,
      brew_variant = case when p_payload ? 'brew_variant'
        then p_payload ->> 'brew_variant' else brew_variant end,
      ice_grams = case when p_payload ? 'ice_grams'
        then (p_payload ->> 'ice_grams')::numeric else ice_grams end,
      beverage_grams = case when p_payload ? 'beverage_grams'
        then (p_payload ->> 'beverage_grams')::numeric else beverage_grams end
  where id = p_entity_id
    and user_id = p_user_id;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'INVALID_METHOD_MEASUREMENT';
end;
$$;

revoke execute on function private.apply_brew_log_mutation(uuid, uuid, text, jsonb)
  from public, anon, authenticated;

revoke execute on function private.apply_brew_log_mutation_before_method_fields(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
do $$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'private.validate_backup_preview_row(text,jsonb)'::regprocedure
  ) into v_definition;
  v_definition := pg_catalog.replace(
    v_definition,
    'private.validate_backup_preview_row',
    'private.validate_backup_preview_row_before_method_fields'
  );
  execute v_definition;
end;
$$;

create or replace function private.validate_backup_preview_row(
  p_section text,
  p_row jsonb
)
returns void
language plpgsql
stable
strict
set search_path = pg_catalog, pg_temp
as $$
declare
  v_clean_row jsonb;
begin
  if p_section <> 'brewLogs' then
    perform private.validate_backup_preview_row_before_method_fields(p_section, p_row);
    return;
  end if;

  v_clean_row := p_row - array[
    'brew_mode', 'brew_variant', 'ice_grams', 'beverage_grams'
  ]::text[];
  perform private.validate_backup_preview_row_before_method_fields(p_section, v_clean_row);

  if (p_row ? 'brew_mode')
    and (p_row -> 'brew_mode') <> 'null'::jsonb
    and (
      pg_catalog.jsonb_typeof(p_row -> 'brew_mode') <> 'string'
      or p_row ->> 'brew_mode' not in (
        'hot_pourover', 'iced_pourover', 'cold_brew', 'espresso'
      )
    )
  then
    raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
  end if;

  if (p_row ? 'brew_variant')
    and (p_row -> 'brew_variant') <> 'null'::jsonb
    and (
      pg_catalog.jsonb_typeof(p_row -> 'brew_variant') <> 'string'
      or p_row ->> 'brew_variant' not in ('ready_to_drink', 'concentrate')
    )
  then
    raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(p_row) as fields(field_name, field_value)
    where field_name in ('ice_grams', 'beverage_grams')
      and field_value <> 'null'::jsonb
      and (
        pg_catalog.jsonb_typeof(field_value) <> 'number'
        or (field_value #>> '{}')::numeric < 0
      )
  ) or (p_row ->> 'brew_variant' is not null and p_row ->> 'brew_mode' <> 'cold_brew')
    or (p_row ->> 'ice_grams' is not null and p_row ->> 'brew_mode' <> 'iced_pourover')
    or (p_row ->> 'beverage_grams' is not null and p_row ->> 'brew_mode' <> 'espresso')
  then
    raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
  end if;

  perform pg_catalog.jsonb_populate_record(null::public.brew_logs, p_row);
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
end;
$$;

revoke execute on function private.validate_backup_preview_row(text, jsonb)
  from public, anon, authenticated;
revoke execute on function private.validate_backup_preview_row_before_method_fields(text, jsonb)
  from public, anon, authenticated;
