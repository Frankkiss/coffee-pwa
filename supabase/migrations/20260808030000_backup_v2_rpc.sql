create extension if not exists pgcrypto with schema extensions;

create or replace function private.javascript_utf16_sort_key(p_value text)
returns bytea
language plpgsql
immutable
strict
set search_path = pg_catalog, pg_temp
as $$
declare
  v_result bytea := '\x'::bytea;
  v_code_point integer;
  v_offset integer;
  v_high_surrogate integer;
  v_low_surrogate integer;
  v_index integer;
begin
  for v_index in 1..pg_catalog.char_length(p_value)
  loop
    v_code_point := pg_catalog.ascii(
      pg_catalog.substr(p_value, v_index, 1)
    );

    if v_code_point <= 65535 then
      v_result := v_result || pg_catalog.decode(
        pg_catalog.lpad(pg_catalog.to_hex(v_code_point), 4, '0'),
        'hex'
      );
    else
      v_offset := v_code_point - 65536;
      v_high_surrogate := 55296 + (v_offset >> 10);
      v_low_surrogate := 56320 + (v_offset & 1023);
      v_result := v_result
        || pg_catalog.decode(
          pg_catalog.lpad(pg_catalog.to_hex(v_high_surrogate), 4, '0'),
          'hex'
        )
        || pg_catalog.decode(
          pg_catalog.lpad(pg_catalog.to_hex(v_low_surrogate), 4, '0'),
          'hex'
        );
    end if;
  end loop;

  return v_result;
end;
$$;

create or replace function public.canonical_jsonb_text(p_value jsonb)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog, pg_temp
as $$
declare
  v_kind text := pg_catalog.jsonb_typeof(p_value);
  v_number_text text;
  v_number numeric;
  v_digits text;
  v_result text;
begin
  case v_kind
    when 'null' then
      return 'null';
    when 'boolean' then
      return p_value::text;
    when 'string' then
      return p_value::text;
    when 'number' then
      v_number_text := p_value::text;
      v_number := v_number_text::numeric;

      if v_number_text like '%.%' then
        v_digits := pg_catalog.ltrim(
          pg_catalog.regexp_replace(v_number_text, '[^0-9]', '', 'g'),
          '0'
        );

        if v_number_text !~ '^-?(0|[1-9][0-9]*)\.[0-9]*[1-9]$'
          or pg_catalog.length(v_digits) > 15
          or (v_number <> 0 and pg_catalog.abs(v_number) < 0.000001)
          or pg_catalog.abs(v_number) >= 1000000000000000000000
        then
          raise exception using
            errcode = '22023',
            message = 'BACKUP_NUMBER_NOT_CANONICAL';
        end if;
      elsif pg_catalog.abs(v_number) > 9007199254740991 then
        raise exception using
          errcode = '22023',
          message = 'BACKUP_NUMBER_NOT_CANONICAL';
      end if;

      return v_number_text;
    when 'array' then
      select '[' || coalesce(
        pg_catalog.string_agg(
          public.canonical_jsonb_text(items.value),
          ',' order by items.position
        ),
        ''
      ) || ']'
      into v_result
      from pg_catalog.jsonb_array_elements(p_value)
        with ordinality as items(value, position);

      return v_result;
    when 'object' then
      select '{' || coalesce(
        pg_catalog.string_agg(
          pg_catalog.to_jsonb(entries.key)::text
            || ':'
            || public.canonical_jsonb_text(entries.value),
          ',' order by private.javascript_utf16_sort_key(entries.key)
        ),
        ''
      ) || '}'
      into v_result
      from pg_catalog.jsonb_each(p_value) as entries(key, value);

      return v_result;
    else
      raise exception using
        errcode = '22023',
        message = 'BACKUP_JSON_TYPE_NOT_SUPPORTED';
  end case;
end;
$$;

create or replace function private.jsonb_has_exact_keys(
  p_value jsonb,
  p_keys text[]
)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog, pg_temp
as $$
  select pg_catalog.jsonb_typeof(p_value) = 'object'
    and not exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_value) as actual(key)
      where not (actual.key = any(p_keys))
    )
    and not exists (
      select 1
      from pg_catalog.unnest(p_keys) as expected(key)
      where not (p_value ? expected.key)
    )
$$;

create or replace function private.jsonb_matches_field_types(
  p_value jsonb,
  p_types jsonb
)
returns boolean
language plpgsql
immutable
strict
set search_path = pg_catalog, pg_temp
as $$
declare
  v_key text;
  v_expected text;
  v_actual text;
  v_scalar text;
begin
  for v_key, v_expected in
    select key, value #>> '{}'
    from pg_catalog.jsonb_each(p_types)
  loop
    v_actual := pg_catalog.jsonb_typeof(p_value->v_key);
    v_scalar := p_value->>v_key;
    if not (case v_expected
      when 'string' then v_actual = 'string'
      when 'nullable_string' then v_actual in ('string', 'null')
      when 'number' then v_actual = 'number'
      when 'nullable_number' then v_actual in ('number', 'null')
      when 'integer' then v_actual = 'number'
        and v_scalar::numeric = pg_catalog.trunc(v_scalar::numeric)
      when 'nullable_integer' then v_actual in ('number', 'null')
        and (v_actual = 'null'
          or v_scalar::numeric = pg_catalog.trunc(v_scalar::numeric))
      when 'boolean' then v_actual = 'boolean'
      when 'nullable_boolean' then v_actual in ('boolean', 'null')
      when 'array' then v_actual = 'array'
      when 'object' then v_actual = 'object'
      else false
    end) then
      return false;
    end if;
  end loop;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range then
  return false;
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
  v_item jsonb;
begin
  if p_section = 'profile' then
    if not private.jsonb_has_exact_keys(p_row, array[
      'id', 'display_name', 'created_at', 'updated_at', 'schema_version'
    ]) or not private.jsonb_matches_field_types(p_row, '{
      "id":"string","display_name":"nullable_string",
      "created_at":"string","updated_at":"string","schema_version":"integer"
    }'::jsonb) then
      raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
    end if;
    perform pg_catalog.jsonb_populate_record(null::public.profiles, p_row);
    if pg_catalog.jsonb_typeof(p_row->'id') <> 'string'
      or (p_row->>'display_name' is not null and pg_catalog.jsonb_typeof(p_row->'display_name') <> 'string')
      or pg_catalog.jsonb_typeof(p_row->'created_at') <> 'string'
      or pg_catalog.jsonb_typeof(p_row->'updated_at') <> 'string'
      or pg_catalog.jsonb_typeof(p_row->'schema_version') <> 'number'
      or (p_row->>'schema_version')::integer < 1
    then
      raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
    end if;
  elsif p_section = 'userSettings' then
    if not private.jsonb_has_exact_keys(p_row, array[
      'user_id', 'preferred_units', 'default_gear', 'taste_preferences',
      'backup_reminder_days', 'created_at', 'updated_at', 'schema_version'
    ]) or not private.jsonb_matches_field_types(p_row, '{
      "user_id":"string","preferred_units":"object","default_gear":"object",
      "taste_preferences":"object","backup_reminder_days":"integer",
      "created_at":"string","updated_at":"string","schema_version":"integer"
    }'::jsonb) then
      raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
    end if;
    perform pg_catalog.jsonb_populate_record(null::public.user_settings, p_row);
    if pg_catalog.jsonb_typeof(p_row->'user_id') <> 'string'
      or pg_catalog.jsonb_typeof(p_row->'preferred_units') <> 'object'
      or pg_catalog.jsonb_typeof(p_row->'default_gear') <> 'object'
      or pg_catalog.jsonb_typeof(p_row->'taste_preferences') <> 'object'
      or pg_catalog.jsonb_typeof(p_row->'backup_reminder_days') <> 'number'
      or (p_row->>'backup_reminder_days')::integer < 1
      or pg_catalog.jsonb_typeof(p_row->'created_at') <> 'string'
      or pg_catalog.jsonb_typeof(p_row->'updated_at') <> 'string'
      or pg_catalog.jsonb_typeof(p_row->'schema_version') <> 'number'
      or (p_row->>'schema_version')::integer < 1
    then
      raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
    end if;
  elsif p_section = 'beans' then
    if not private.jsonb_has_exact_keys(p_row, array[
      'id', 'user_id', 'name', 'roaster', 'origin', 'farm_or_station',
      'process', 'variety', 'altitude_meters', 'roast_date', 'roast_level',
      'flavor_tags', 'flavor_notes', 'net_weight_grams', 'price',
      'purchase_date', 'source_url', 'image_url', 'bean_type',
      'blend_components', 'blend_notes', 'notes', 'created_at', 'updated_at',
      'deleted_at', 'schema_version'
    ]) or not private.jsonb_matches_field_types(p_row, '{
      "id":"string","user_id":"string","name":"string",
      "roaster":"nullable_string","origin":"nullable_string",
      "farm_or_station":"nullable_string","process":"nullable_string",
      "variety":"nullable_string","altitude_meters":"nullable_integer",
      "roast_date":"nullable_string","roast_level":"nullable_string",
      "flavor_tags":"array","flavor_notes":"nullable_string",
      "net_weight_grams":"nullable_number","price":"nullable_number",
      "purchase_date":"nullable_string","source_url":"nullable_string",
      "image_url":"nullable_string","bean_type":"string",
      "blend_components":"array","blend_notes":"nullable_string",
      "notes":"nullable_string","created_at":"string","updated_at":"string",
      "deleted_at":"nullable_string","schema_version":"integer"
    }'::jsonb) then
      raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
    end if;
    perform pg_catalog.jsonb_populate_record(null::public.beans, p_row);
    if pg_catalog.jsonb_typeof(p_row->'id') <> 'string'
      or pg_catalog.jsonb_typeof(p_row->'user_id') <> 'string'
      or pg_catalog.jsonb_typeof(p_row->'name') <> 'string'
      or p_row->>'bean_type' not in ('single_origin', 'blend')
      or pg_catalog.jsonb_typeof(p_row->'flavor_tags') <> 'array'
      or exists (select 1 from pg_catalog.jsonb_array_elements(p_row->'flavor_tags') x where pg_catalog.jsonb_typeof(x) <> 'string')
      or pg_catalog.jsonb_typeof(p_row->'blend_components') <> 'array'
      or pg_catalog.jsonb_typeof(p_row->'created_at') <> 'string'
      or pg_catalog.jsonb_typeof(p_row->'updated_at') <> 'string'
      or pg_catalog.jsonb_typeof(p_row->'schema_version') <> 'number'
      or (p_row->>'schema_version')::integer < 1
    then
      raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
    end if;
    for v_item in select value from pg_catalog.jsonb_array_elements(p_row->'blend_components')
    loop
      if not private.jsonb_has_exact_keys(v_item, array[
        'origin', 'process', 'variety', 'percentage', 'role', 'notes'
      ]) or exists (
        select 1
        from pg_catalog.jsonb_each(v_item) e
        where e.key in ('origin', 'process', 'variety', 'role', 'notes')
          and pg_catalog.jsonb_typeof(e.value) <> 'string'
      ) or (
        pg_catalog.jsonb_typeof(v_item->'percentage') not in ('number', 'null')
      ) then
        raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
      end if;
    end loop;
  elsif p_section = 'brewLogs' then
    if not private.jsonb_has_exact_keys(p_row, array[
      'id', 'user_id', 'bean_id', 'brewed_at', 'method', 'dripper',
      'filter_paper', 'grinder', 'grind_setting', 'coffee_grams', 'water_grams',
      'ratio', 'water_temperature_c', 'total_time_seconds', 'pour_steps',
      'rating', 'acidity', 'sweetness', 'bitterness', 'astringency', 'body',
      'aftertaste', 'flavor_tags', 'is_pinned_recipe', 'notes', 'created_at',
      'updated_at', 'deleted_at', 'schema_version'
    ]) or not private.jsonb_matches_field_types(p_row, '{
      "id":"string","user_id":"string","bean_id":"nullable_string",
      "brewed_at":"string","method":"nullable_string",
      "dripper":"nullable_string","filter_paper":"nullable_string",
      "grinder":"nullable_string","grind_setting":"nullable_string",
      "coffee_grams":"nullable_number","water_grams":"nullable_number",
      "ratio":"nullable_string","water_temperature_c":"nullable_number",
      "total_time_seconds":"nullable_integer","pour_steps":"array",
      "rating":"nullable_number","acidity":"nullable_integer",
      "sweetness":"nullable_integer","bitterness":"nullable_integer",
      "astringency":"nullable_integer","body":"nullable_integer",
      "aftertaste":"nullable_integer","flavor_tags":"array",
      "is_pinned_recipe":"boolean","notes":"nullable_string",
      "created_at":"string","updated_at":"string",
      "deleted_at":"nullable_string","schema_version":"integer"
    }'::jsonb) then
      raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
    end if;
    perform pg_catalog.jsonb_populate_record(null::public.brew_logs, p_row);
    if pg_catalog.jsonb_typeof(p_row->'id') <> 'string'
      or pg_catalog.jsonb_typeof(p_row->'user_id') <> 'string'
      or pg_catalog.jsonb_typeof(p_row->'bean_id') not in ('string', 'null')
      or pg_catalog.jsonb_typeof(p_row->'brewed_at') <> 'string'
      or pg_catalog.jsonb_typeof(p_row->'pour_steps') <> 'array'
      or pg_catalog.jsonb_typeof(p_row->'flavor_tags') <> 'array'
      or exists (select 1 from pg_catalog.jsonb_array_elements(p_row->'flavor_tags') x where pg_catalog.jsonb_typeof(x) <> 'string')
      or pg_catalog.jsonb_typeof(p_row->'is_pinned_recipe') <> 'boolean'
      or pg_catalog.jsonb_typeof(p_row->'created_at') <> 'string'
      or pg_catalog.jsonb_typeof(p_row->'updated_at') <> 'string'
      or pg_catalog.jsonb_typeof(p_row->'schema_version') <> 'number'
      or (p_row->>'schema_version')::integer < 1
    then
      raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
    end if;
  elsif p_section = 'brewTemplates' then
    if not private.jsonb_has_exact_keys(p_row, array[
      'id', 'user_id', 'name', 'category', 'difficulty', 'brewer', 'filter',
      'dose_grams', 'water_grams', 'ratio', 'water_temperature_min',
      'water_temperature_max', 'grind_size', 'target_time_min',
      'target_time_max', 'pour_steps', 'suitable_for', 'avoid_for',
      'flavor_goal', 'adjustment_rules', 'source_notes', 'source_urls',
      'is_champion_reference', 'copied_from_template_id', 'created_at',
      'updated_at', 'deleted_at', 'schema_version'
    ]) or not private.jsonb_matches_field_types(p_row, '{
      "id":"string","user_id":"string","name":"string",
      "category":"string","difficulty":"string","brewer":"string",
      "filter":"string","dose_grams":"number","water_grams":"number",
      "ratio":"string","water_temperature_min":"integer",
      "water_temperature_max":"integer","grind_size":"string",
      "target_time_min":"integer","target_time_max":"integer",
      "pour_steps":"array","suitable_for":"array","avoid_for":"array",
      "flavor_goal":"string","adjustment_rules":"array",
      "source_notes":"string","source_urls":"array",
      "is_champion_reference":"boolean",
      "copied_from_template_id":"nullable_string","created_at":"string",
      "updated_at":"string","deleted_at":"nullable_string",
      "schema_version":"integer"
    }'::jsonb) then
      raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
    end if;
    perform pg_catalog.jsonb_populate_record(null::public.brew_templates, p_row);
    if pg_catalog.jsonb_typeof(p_row->'id') <> 'string'
      or pg_catalog.jsonb_typeof(p_row->'user_id') <> 'string'
      or p_row->>'category' not in ('daily-pourover', 'immersion-hybrid', 'bean-specific', 'cold-brew', 'moka-pot', 'champion-reference')
      or p_row->>'difficulty' not in ('easy', 'medium', 'advanced')
      or pg_catalog.jsonb_typeof(p_row->'pour_steps') <> 'array'
      or pg_catalog.jsonb_typeof(p_row->'is_champion_reference') <> 'boolean'
      or pg_catalog.jsonb_typeof(p_row->'schema_version') <> 'number'
      or (p_row->>'schema_version')::integer < 1
    then
      raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
    end if;
    for v_item in select value from pg_catalog.jsonb_array_elements(p_row->'pour_steps')
    loop
      if not private.jsonb_has_exact_keys(v_item, array[
        'order', 'startSeconds', 'endSeconds', 'targetWaterGrams', 'label', 'action'
      ]) or not private.jsonb_matches_field_types(v_item, '{
        "order":"number","startSeconds":"number","endSeconds":"nullable_number",
        "targetWaterGrams":"number","label":"string","action":"string"
      }'::jsonb) then
        raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
      end if;
    end loop;
    if exists (
      select 1
      from pg_catalog.jsonb_each(p_row) e
      where e.key in ('suitable_for', 'avoid_for', 'adjustment_rules', 'source_urls')
        and exists (
          select 1 from pg_catalog.jsonb_array_elements(e.value) x
          where pg_catalog.jsonb_typeof(x) <> 'string'
        )
    ) then
      raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
    end if;
  elsif p_section = 'aiRecommendations' then
    if not private.jsonb_has_exact_keys(p_row, array[
      'id', 'user_id', 'bean_id', 'input_context', 'recommendation',
      'model_name', 'accepted', 'created_at', 'updated_at', 'deleted_at',
      'schema_version'
    ]) or not private.jsonb_matches_field_types(p_row, '{
      "id":"string","user_id":"string","bean_id":"nullable_string",
      "input_context":"object","recommendation":"object",
      "model_name":"nullable_string","accepted":"nullable_boolean",
      "created_at":"string","updated_at":"string",
      "deleted_at":"nullable_string","schema_version":"integer"
    }'::jsonb) then
      raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
    end if;
    perform pg_catalog.jsonb_populate_record(null::public.ai_recommendations, p_row);
    if pg_catalog.jsonb_typeof(p_row->'id') <> 'string'
      or pg_catalog.jsonb_typeof(p_row->'user_id') <> 'string'
      or pg_catalog.jsonb_typeof(p_row->'bean_id') not in ('string', 'null')
      or pg_catalog.jsonb_typeof(p_row->'input_context') <> 'object'
      or pg_catalog.jsonb_typeof(p_row->'recommendation') <> 'object'
      or pg_catalog.jsonb_typeof(p_row->'accepted') not in ('boolean', 'null')
      or pg_catalog.jsonb_typeof(p_row->'schema_version') <> 'number'
      or (p_row->>'schema_version')::integer < 1
    then
      raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
    end if;
  elsif p_section = 'sourceImports' then
    if not private.jsonb_has_exact_keys(p_row, array[
      'id', 'user_id', 'source_url', 'source_type', 'status',
      'extracted_payload', 'selected_payload', 'error_message', 'created_at',
      'updated_at', 'deleted_at', 'schema_version'
    ]) or not private.jsonb_matches_field_types(p_row, '{
      "id":"string","user_id":"string","source_url":"string",
      "source_type":"string","status":"string","extracted_payload":"object",
      "selected_payload":"object","error_message":"nullable_string",
      "created_at":"string","updated_at":"string",
      "deleted_at":"nullable_string","schema_version":"integer"
    }'::jsonb) then
      raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
    end if;
    perform pg_catalog.jsonb_populate_record(null::public.source_imports, p_row);
    if pg_catalog.jsonb_typeof(p_row->'id') <> 'string'
      or pg_catalog.jsonb_typeof(p_row->'user_id') <> 'string'
      or pg_catalog.jsonb_typeof(p_row->'source_url') <> 'string'
      or pg_catalog.jsonb_typeof(p_row->'source_type') <> 'string'
      or p_row->>'status' not in ('draft', 'saved', 'failed')
      or pg_catalog.jsonb_typeof(p_row->'extracted_payload') <> 'object'
      or pg_catalog.jsonb_typeof(p_row->'selected_payload') <> 'object'
      or pg_catalog.jsonb_typeof(p_row->'schema_version') <> 'number'
      or (p_row->>'schema_version')::integer < 1
    then
      raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
    end if;
  else
    raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
  end if;
exception
  when invalid_text_representation or datetime_field_overflow
    or numeric_value_out_of_range or null_value_not_allowed
  then
    raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
end;
$$;

create or replace function public.export_backup_v2(
  p_app_version text,
  p_backup_mode text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_data jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if p_app_version is null
    or p_app_version !~ '^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$'
  then
    raise exception using errcode = '22023', message = 'INVALID_APP_VERSION';
  end if;

  if p_backup_mode is null
    or p_backup_mode not in ('lightweight', 'complete')
  then
    raise exception using errcode = '22023', message = 'INVALID_BACKUP_MODE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  select pg_catalog.jsonb_build_object(
    'profile', (
      select pg_catalog.to_jsonb(profile_row)
      from public.profiles as profile_row
      where profile_row.id = v_user_id
    ),
    'userSettings', (
      select pg_catalog.to_jsonb(settings_row)
      from public.user_settings as settings_row
      where settings_row.user_id = v_user_id
    ),
    'beans', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(bean_row) order by bean_row.id
      )
      from public.beans as bean_row
      where bean_row.user_id = v_user_id
        and bean_row.deleted_at is null
    ), '[]'::jsonb),
    'brewLogs', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(brew_row) order by brew_row.id
      )
      from public.brew_logs as brew_row
      where brew_row.user_id = v_user_id
        and brew_row.deleted_at is null
    ), '[]'::jsonb),
    'brewTemplates', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(template_row) order by template_row.id
      )
      from public.brew_templates as template_row
      where template_row.user_id = v_user_id
        and template_row.deleted_at is null
    ), '[]'::jsonb),
    'aiRecommendations', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(recommendation_row) order by recommendation_row.id
      )
      from public.ai_recommendations as recommendation_row
      where recommendation_row.user_id = v_user_id
        and recommendation_row.deleted_at is null
    ), '[]'::jsonb),
    'sourceImports', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(import_row) order by import_row.id
      )
      from public.source_imports as import_row
      where import_row.user_id = v_user_id
        and import_row.deleted_at is null
    ), '[]'::jsonb)
  )
  into v_data;

  return pg_catalog.jsonb_build_object(
    'schemaVersion', 2,
    'manifest', pg_catalog.jsonb_build_object(
      'exportedAt', pg_catalog.clock_timestamp(),
      'appVersion', p_app_version,
      'backupMode', p_backup_mode,
      'recordCounts', pg_catalog.jsonb_build_object(
        'profile', case when v_data->'profile' = 'null'::jsonb then 0 else 1 end,
        'userSettings', case
          when v_data->'userSettings' = 'null'::jsonb then 0 else 1
        end,
        'beans', pg_catalog.jsonb_array_length(v_data->'beans'),
        'brewLogs', pg_catalog.jsonb_array_length(v_data->'brewLogs'),
        'brewTemplates', pg_catalog.jsonb_array_length(v_data->'brewTemplates'),
        'aiRecommendations', pg_catalog.jsonb_array_length(v_data->'aiRecommendations'),
        'sourceImports', pg_catalog.jsonb_array_length(v_data->'sourceImports')
      ),
      'checksumAlgorithm', 'SHA-256',
      'checksum', pg_catalog.encode(
        extensions.digest(
          pg_catalog.convert_to(public.canonical_jsonb_text(v_data), 'UTF8'),
          'sha256'
        ),
        'hex'
      ),
      'images', '[]'::jsonb,
      'warnings', '[]'::jsonb
    ),
    'data', v_data
  );
end;
$$;

create or replace function public.preview_restore_v2(
  p_backup jsonb,
  p_mode text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_manifest jsonb;
  v_data jsonb;
  v_counts_manifest jsonb;
  v_expected_sections constant text[] := array[
    'profile', 'userSettings', 'beans', 'brewLogs', 'brewTemplates',
    'aiRecommendations', 'sourceImports'
  ];
  v_native_manifest_keys constant text[] := array[
    'exportedAt', 'appVersion', 'backupMode', 'recordCounts',
    'checksumAlgorithm', 'checksum', 'images', 'warnings'
  ];
  v_derived_manifest_keys constant text[] := array[
    'exportedAt', 'appVersion', 'backupMode', 'recordCounts',
    'checksumAlgorithm', 'checksum', 'images', 'warnings',
    'sourceSchemaVersion', 'fullRollbackEligible', 'authoritativeSections'
  ];
  v_is_v1 boolean := false;
  v_authoritative text[] := v_expected_sections;
  v_section text;
  v_rows jsonb;
  v_row jsonb;
  v_total integer;
  v_existing integer;
  v_soft_deleted integer;
  v_new integer;
  v_will_update integer;
  v_will_delete integer;
  v_table_name text;
  v_counts jsonb := '{}'::jsonb;
  v_invalid_relations jsonb := '[]'::jsonb;
  v_checksum text;
  v_actual_checksum text;
  v_key text;
  v_image jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if p_mode is null or p_mode not in ('safe_merge', 'full_rollback') then
    raise exception using errcode = '22023', message = 'INVALID_RESTORE_MODE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  if p_backup is null
    or not private.jsonb_has_exact_keys(
      p_backup, array['schemaVersion', 'manifest', 'data']
    )
    or pg_catalog.jsonb_typeof(p_backup->'schemaVersion') <> 'number'
    or p_backup->>'schemaVersion' <> '2'
    or pg_catalog.jsonb_typeof(p_backup->'manifest') <> 'object'
    or not private.jsonb_has_exact_keys(p_backup->'data', v_expected_sections)
  then
    raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
  end if;

  v_manifest := p_backup->'manifest';
  v_data := p_backup->'data';
  v_is_v1 := v_manifest ? 'sourceSchemaVersion'
    or v_manifest ? 'fullRollbackEligible'
    or v_manifest ? 'authoritativeSections';

  if v_is_v1 then
    if not private.jsonb_has_exact_keys(v_manifest, v_derived_manifest_keys)
      or v_manifest->>'sourceSchemaVersion' <> '1'
      or v_manifest->'fullRollbackEligible' <> 'false'::jsonb
      or pg_catalog.jsonb_typeof(v_manifest->'authoritativeSections') <> 'array'
      or exists (
        select 1
        from pg_catalog.jsonb_array_elements(v_manifest->'authoritativeSections') item
        where pg_catalog.jsonb_typeof(item) <> 'string'
          or item #>> '{}' not in ('beans', 'brewLogs', 'brewTemplates')
      )
      or (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements_text(v_manifest->'authoritativeSections') item
      ) <> (
        select pg_catalog.count(distinct item)
        from pg_catalog.jsonb_array_elements_text(v_manifest->'authoritativeSections') item
      )
    then
      raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
    end if;
    select coalesce(pg_catalog.array_agg(item order by ordinality), '{}'::text[])
    into v_authoritative
    from pg_catalog.jsonb_array_elements_text(v_manifest->'authoritativeSections')
      with ordinality as sections(item, ordinality);
    if p_mode <> 'safe_merge' then
      raise exception using
        errcode = '22023', message = 'BACKUP_FULL_ROLLBACK_NOT_ELIGIBLE';
    end if;
    if v_data->'profile' <> 'null'::jsonb
      or v_data->'userSettings' <> 'null'::jsonb
      or (not ('beans' = any(v_authoritative)) and v_data->'beans' <> '[]'::jsonb)
      or (not ('brewLogs' = any(v_authoritative)) and v_data->'brewLogs' <> '[]'::jsonb)
      or (not ('brewTemplates' = any(v_authoritative)) and v_data->'brewTemplates' <> '[]'::jsonb)
      or v_data->'aiRecommendations' <> '[]'::jsonb
      or v_data->'sourceImports' <> '[]'::jsonb
    then
      raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
    end if;
  elsif not private.jsonb_has_exact_keys(v_manifest, v_native_manifest_keys) then
    raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
  end if;

  if pg_catalog.jsonb_typeof(v_manifest->'exportedAt') <> 'string'
    or pg_catalog.jsonb_typeof(v_manifest->'appVersion') <> 'string'
    or pg_catalog.length(v_manifest->>'appVersion') = 0
    or v_manifest->>'backupMode' not in ('lightweight', 'complete')
    or v_manifest->>'checksumAlgorithm' <> 'SHA-256'
    or pg_catalog.jsonb_typeof(v_manifest->'checksum') <> 'string'
    or v_manifest->>'checksum' !~ '^[0-9a-f]{64}$'
    or pg_catalog.jsonb_typeof(v_manifest->'recordCounts') <> 'object'
    or not private.jsonb_has_exact_keys(
      v_manifest->'recordCounts', v_expected_sections
    )
    or pg_catalog.jsonb_typeof(v_manifest->'images') <> 'array'
    or pg_catalog.jsonb_typeof(v_manifest->'warnings') <> 'array'
    or exists (
      select 1 from pg_catalog.jsonb_array_elements(v_manifest->'warnings') x
      where pg_catalog.jsonb_typeof(x) <> 'string'
    )
  then
    raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
  end if;

  begin
    perform (v_manifest->>'exportedAt')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
  end;

  for v_image in select value from pg_catalog.jsonb_array_elements(v_manifest->'images')
  loop
    if not private.jsonb_has_exact_keys(v_image, array[
      'entityType', 'entityId', 'originalUrl', 'archivePath', 'mediaType',
      'byteLength', 'checksum', 'status', 'errorCode'
    ])
      or not private.jsonb_matches_field_types(v_image, '{
        "entityType":"string","entityId":"string","originalUrl":"string",
        "archivePath":"nullable_string","mediaType":"nullable_string",
        "byteLength":"integer","checksum":"nullable_string",
        "status":"string","errorCode":"nullable_string"
      }'::jsonb)
      or v_image->>'entityType' <> 'bean'
      or pg_catalog.jsonb_typeof(v_image->'entityId') <> 'string'
      or pg_catalog.jsonb_typeof(v_image->'originalUrl') <> 'string'
      or pg_catalog.jsonb_typeof(v_image->'byteLength') <> 'number'
      or (v_image->>'byteLength')::numeric < 0
      or v_image->>'status' not in ('included', 'missing')
      or (v_image->>'checksum' is not null
        and v_image->>'checksum' !~ '^[0-9a-f]{64}$')
    then
      raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
    end if;
    perform (v_image->>'entityId')::uuid;
    if pg_catalog.jsonb_typeof(v_data->'beans') <> 'array' then
      raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
    end if;
    if not exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_data->'beans') bean
      where bean->>'id' = v_image->>'entityId'
    ) then
      raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
    end if;
  end loop;

  v_counts_manifest := v_manifest->'recordCounts';
  foreach v_section in array v_expected_sections
  loop
    if pg_catalog.jsonb_typeof(v_counts_manifest->v_section) <> 'number'
      or v_counts_manifest->>v_section !~ '^(0|[1-9][0-9]*)$'
    then
      raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
    end if;

    if v_section = 'profile' or v_section = 'userSettings' then
      if v_data->v_section <> 'null'::jsonb
        and pg_catalog.jsonb_typeof(v_data->v_section) <> 'object'
      then
        raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
      end if;
      v_total := case when v_data->v_section = 'null'::jsonb then 0 else 1 end;
      if v_total = 1 then
        perform private.validate_backup_preview_row(v_section, v_data->v_section);
      end if;
    else
      if pg_catalog.jsonb_typeof(v_data->v_section) <> 'array' then
        raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
      end if;
      v_total := pg_catalog.jsonb_array_length(v_data->v_section);
      for v_row in select value from pg_catalog.jsonb_array_elements(v_data->v_section)
      loop
        perform private.validate_backup_preview_row(v_section, v_row);
      end loop;
      if (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements(v_data->v_section) row_data
      ) <> (
        select pg_catalog.count(distinct row_data->>'id')
        from pg_catalog.jsonb_array_elements(v_data->v_section) row_data
      ) then
        raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
      end if;
    end if;

    if (v_counts_manifest->>v_section)::integer <> v_total then
      raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
    end if;
  end loop;

  v_actual_checksum := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(public.canonical_jsonb_text(v_data), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_checksum := v_manifest->>'checksum';
  if v_checksum <> v_actual_checksum then
    raise exception using errcode = '22023', message = 'BACKUP_CHECKSUM_MISMATCH';
  end if;

  foreach v_section in array v_expected_sections
  loop
    if v_is_v1 and not (v_section = any(v_authoritative)) then
      v_total := 0;
      v_existing := 0;
      v_soft_deleted := 0;
      v_will_delete := 0;
    elsif v_section = 'profile' then
      v_total := case when v_data->'profile' = 'null'::jsonb then 0 else 1 end;
      select case when exists (
        select 1 from public.profiles where id = v_user_id
      ) then v_total else 0 end into v_existing;
      v_soft_deleted := 0;
      v_will_delete := 0;
    elsif v_section = 'userSettings' then
      v_total := case when v_data->'userSettings' = 'null'::jsonb then 0 else 1 end;
      select case when exists (
        select 1 from public.user_settings where user_id = v_user_id
      ) then v_total else 0 end into v_existing;
      v_soft_deleted := 0;
      v_will_delete := 0;
    else
      v_rows := v_data->v_section;
      v_total := pg_catalog.jsonb_array_length(v_rows);
      v_table_name := case v_section
        when 'beans' then 'beans'
        when 'brewLogs' then 'brew_logs'
        when 'brewTemplates' then 'brew_templates'
        when 'aiRecommendations' then 'ai_recommendations'
        when 'sourceImports' then 'source_imports'
      end;
      execute pg_catalog.format(
        'select count(*) filter (where current_row.deleted_at is null), count(*) filter (where current_row.deleted_at is not null) from pg_catalog.jsonb_array_elements($1) backup_row join public.%I current_row on current_row.id = (backup_row->>''id'')::uuid and current_row.user_id = $2',
        v_table_name
      ) into v_existing, v_soft_deleted using v_rows, v_user_id;
      if p_mode = 'full_rollback' then
        execute pg_catalog.format(
          'select count(*) from public.%I current_row where current_row.user_id = $1 and current_row.deleted_at is null and not exists (select 1 from pg_catalog.jsonb_array_elements($2) backup_row where (backup_row->>''id'')::uuid = current_row.id)',
          v_table_name
        ) into v_will_delete using v_user_id, v_rows;
      else
        v_will_delete := 0;
      end if;
    end if;

    v_new := v_total - v_existing - v_soft_deleted;
    v_will_update := case
      when p_mode = 'full_rollback' then v_existing + v_soft_deleted
      else 0
    end;
    v_counts := v_counts || pg_catalog.jsonb_build_object(
      v_section,
      pg_catalog.jsonb_build_object(
        'total', v_total,
        'new', v_new,
        'existing', v_existing,
        'softDeleted', v_soft_deleted,
        'willUpdate', v_will_update,
        'willDelete', v_will_delete
      )
    );
  end loop;

  with relation_issues as (
    select 'brewLog'::text as entity_type,
      row_data->>'id' as entity_id,
      'bean_id'::text as field,
      row_data->>'bean_id' as value
    from pg_catalog.jsonb_array_elements(v_data->'brewLogs') row_data
    where (not v_is_v1 or 'brewLogs' = any(v_authoritative))
      and row_data->'bean_id' <> 'null'::jsonb
      and not exists (
        select 1 from pg_catalog.jsonb_array_elements(v_data->'beans') bean
        where bean->>'id' = row_data->>'bean_id'
      )
      and (
        p_mode = 'full_rollback'
        or not exists (
          select 1 from public.beans
          where user_id = v_user_id
            and id = (row_data->>'bean_id')::uuid
            and deleted_at is null
        )
      )
    union all
    select 'aiRecommendation', row_data->>'id', 'bean_id', row_data->>'bean_id'
    from pg_catalog.jsonb_array_elements(v_data->'aiRecommendations') row_data
    where not v_is_v1
      and row_data->'bean_id' <> 'null'::jsonb
      and not exists (
        select 1 from pg_catalog.jsonb_array_elements(v_data->'beans') bean
        where bean->>'id' = row_data->>'bean_id'
      )
      and (
        p_mode = 'full_rollback'
        or not exists (
          select 1 from public.beans
          where user_id = v_user_id
            and id = (row_data->>'bean_id')::uuid
            and deleted_at is null
        )
      )
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'entityType', entity_type,
        'entityId', entity_id,
        'field', field,
        'value', value
      ) order by entity_type, entity_id, field, value
    ),
    '[]'::jsonb
  ) into v_invalid_relations
  from relation_issues;

  return pg_catalog.jsonb_build_object(
    'mode', p_mode,
    'fullRollbackEligible', not v_is_v1,
    'counts', v_counts,
    'invalidRelations', v_invalid_relations,
    'warnings', '[]'::jsonb
  );
exception
  when invalid_text_representation or datetime_field_overflow
    or numeric_value_out_of_range or null_value_not_allowed
  then
    raise exception using errcode = '22023', message = 'BACKUP_FORMAT_INVALID';
end;
$$;

create or replace function public.record_backup_download(
  p_file_name text,
  p_backup_mode text,
  p_record_counts jsonb
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_expected_count_keys constant text[] := array[
    'profile', 'userSettings', 'beans', 'brewLogs', 'brewTemplates',
    'aiRecommendations', 'sourceImports'
  ];
  v_count_key text;
  v_date_text text;
  v_created_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if p_backup_mode is null
    or p_backup_mode not in ('lightweight', 'complete')
  then
    raise exception using errcode = '22023', message = 'INVALID_BACKUP_MODE';
  end if;

  if p_file_name is null
    or pg_catalog.length(p_file_name) > 128
    or (
      p_backup_mode = 'lightweight'
      and p_file_name !~ '^coffee-(backup|pre-restore)-[0-9]{4}-[0-9]{2}-[0-9]{2}\.json$'
    )
    or (
      p_backup_mode = 'complete'
      and p_file_name !~ '^coffee-backup-[0-9]{4}-[0-9]{2}-[0-9]{2}\.zip$'
    )
  then
    raise exception using errcode = '22023', message = 'INVALID_BACKUP_FILE_NAME';
  end if;

  v_date_text := (pg_catalog.regexp_match(
    p_file_name,
    '([0-9]{4}-[0-9]{2}-[0-9]{2})'
  ))[1];

  begin
    perform v_date_text::date;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception using
        errcode = '22023',
        message = 'INVALID_BACKUP_FILE_NAME';
  end;

  if p_record_counts is null
    or pg_catalog.jsonb_typeof(p_record_counts) <> 'object'
    or not (p_record_counts ?& v_expected_count_keys)
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_record_counts) as keys(key_name)
      where not (keys.key_name = any(v_expected_count_keys))
    )
  then
    raise exception using errcode = '22023', message = 'INVALID_RECORD_COUNTS';
  end if;

  foreach v_count_key in array v_expected_count_keys
  loop
    if pg_catalog.jsonb_typeof(p_record_counts->v_count_key) <> 'number'
      or (p_record_counts->>v_count_key) !~ '^(0|[1-9][0-9]*)$'
      or (
        v_count_key in ('profile', 'userSettings')
        and (p_record_counts->>v_count_key)::numeric > 1
      )
    then
      raise exception using errcode = '22023', message = 'INVALID_RECORD_COUNTS';
    end if;
  end loop;

  insert into public.backup_exports (
    user_id,
    export_type,
    includes_images,
    file_name,
    record_counts
  )
  values (
    v_user_id,
    p_backup_mode,
    p_backup_mode = 'complete',
    p_file_name,
    p_record_counts
  )
  returning created_at into v_created_at;

  return v_created_at;
end;
$$;

revoke execute on function public.canonical_jsonb_text(jsonb)
from public, anon, authenticated;
revoke execute on function private.javascript_utf16_sort_key(text)
from public, anon, authenticated;
revoke execute on function private.jsonb_has_exact_keys(jsonb, text[])
from public, anon, authenticated;
revoke execute on function private.jsonb_matches_field_types(jsonb, jsonb)
from public, anon, authenticated;
revoke execute on function private.validate_backup_preview_row(text, jsonb)
from public, anon, authenticated;
revoke execute on function public.export_backup_v2(text, text)
from public, anon;
revoke execute on function public.preview_restore_v2(jsonb, text)
from public, anon;
revoke execute on function public.record_backup_download(text, text, jsonb)
from public, anon;

grant execute on function public.export_backup_v2(text, text)
to authenticated;
grant execute on function public.preview_restore_v2(jsonb, text)
to authenticated;
grant execute on function public.record_backup_download(text, text, jsonb)
to authenticated;

revoke select on table public.backup_exports from public, anon;
grant select on table public.backup_exports to authenticated;
