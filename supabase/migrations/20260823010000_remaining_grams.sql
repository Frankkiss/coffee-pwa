alter table public.beans
  add column if not exists remaining_grams numeric;

do $constraint$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.beans'::regclass
      and conname = 'beans_remaining_grams_check'
  ) then
    alter table public.beans
      add constraint beans_remaining_grams_check
      check (
        remaining_grams is null
        or (
          remaining_grams >= 0
          and remaining_grams::text not in ('NaN', 'Infinity', '-Infinity')
        )
      )
      not valid;
  end if;
end
$constraint$;
create or replace function private.apply_bean_mutation(
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
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_roast_date date;
  v_purchase_date date;
  v_row_count bigint;
begin
  if private.has_unknown_fields(
    p_payload,
    array[
      'name', 'roaster', 'origin', 'farm_or_station', 'process', 'variety',
      'altitude_meters', 'roast_date', 'roast_level', 'flavor_tags',
      'flavor_notes', 'net_weight_grams', 'remaining_grams', 'price', 'purchase_date',
      'source_url', 'image_url', 'bean_type', 'blend_components',
      'blend_notes', 'notes', 'schema_version'
    ]::text[]
  ) then
    raise exception using errcode = 'P0001', message = 'UNKNOWN_FIELDS';
  end if;

  if p_operation = 'delete' then
    if p_payload <> '{}'::jsonb then
      raise exception using errcode = 'P0001', message = 'DELETE_PAYLOAD_MUST_BE_EMPTY';
    end if;

    update public.beans
    set deleted_at = v_now,
        updated_at = v_now
    where id = p_entity_id
      and user_id = p_user_id;

    get diagnostics v_row_count = row_count;
    if v_row_count = 0 then
      raise exception using errcode = 'P0001', message = 'ENTITY_NOT_FOUND';
    end if;
    return;
  end if;

  if not (p_payload ? 'name')
    or pg_catalog.jsonb_typeof(p_payload -> 'name') <> 'string'
    or pg_catalog.btrim(p_payload ->> 'name') = '' then
    raise exception using errcode = 'P0001', message = 'INVALID_NAME';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(p_payload) as fields(field_name, field_value)
    where field_name = any (array[
      'roaster', 'origin', 'farm_or_station', 'process', 'variety',
      'roast_level', 'flavor_notes', 'source_url', 'image_url',
      'blend_notes', 'notes'
    ]::text[])
      and field_value <> 'null'::jsonb
      and pg_catalog.jsonb_typeof(field_value) <> 'string'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_TEXT_FIELD';
  end if;

  if (p_payload ? 'flavor_tags') and (
    pg_catalog.jsonb_typeof(p_payload -> 'flavor_tags') <> 'array'
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_payload -> 'flavor_tags') as item
      where pg_catalog.jsonb_typeof(item) <> 'string'
    )
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_FLAVOR_TAGS';
  end if;

  if (p_payload ? 'blend_components')
    and pg_catalog.jsonb_typeof(p_payload -> 'blend_components') <> 'array' then
    raise exception using errcode = 'P0001', message = 'INVALID_BLEND_COMPONENTS';
  end if;

  if (p_payload ? 'bean_type') and (
    pg_catalog.jsonb_typeof(p_payload -> 'bean_type') <> 'string'
    or (p_payload ->> 'bean_type') not in ('single_origin', 'blend')
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_BEAN_TYPE';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(p_payload) as fields(field_name, field_value)
    where field_name = any (array['net_weight_grams', 'remaining_grams', 'price']::text[])
      and field_value <> 'null'::jsonb
      and pg_catalog.jsonb_typeof(field_value) <> 'number'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_NUMBER_FIELD';
  end if;

  if (p_payload ? 'altitude_meters')
    and (p_payload -> 'altitude_meters') <> 'null'::jsonb
    and (
      pg_catalog.jsonb_typeof(p_payload -> 'altitude_meters') <> 'number'
      or (p_payload ->> 'altitude_meters') !~ '^-?[0-9]+$'
    ) then
    raise exception using errcode = 'P0001', message = 'INVALID_ALTITUDE_METERS';
  end if;

  if (p_payload ? 'schema_version') and (
    pg_catalog.jsonb_typeof(p_payload -> 'schema_version') <> 'number'
    or (p_payload ->> 'schema_version') !~ '^[0-9]+$'
    or (p_payload ->> 'schema_version') <> '1'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_SCHEMA_VERSION';
  end if;

  if (p_payload ? 'roast_date')
    and (p_payload -> 'roast_date') <> 'null'::jsonb
    and (
      pg_catalog.jsonb_typeof(p_payload -> 'roast_date') <> 'string'
      or (p_payload ->> 'roast_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    ) then
    raise exception using errcode = 'P0001', message = 'INVALID_ROAST_DATE';
  end if;

  if (p_payload ? 'purchase_date')
    and (p_payload -> 'purchase_date') <> 'null'::jsonb
    and (
      pg_catalog.jsonb_typeof(p_payload -> 'purchase_date') <> 'string'
      or (p_payload ->> 'purchase_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    ) then
    raise exception using errcode = 'P0001', message = 'INVALID_PURCHASE_DATE';
  end if;

  begin
    v_roast_date := (p_payload ->> 'roast_date')::date;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode = 'P0001', message = 'INVALID_ROAST_DATE';
  end;

  begin
    v_purchase_date := (p_payload ->> 'purchase_date')::date;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode = 'P0001', message = 'INVALID_PURCHASE_DATE';
  end;

  begin
    if (p_payload ->> 'altitude_meters')::integer < 0
      or (p_payload ->> 'net_weight_grams')::numeric <= 0
      or (p_payload ->> 'remaining_grams')::numeric < 0
      or (p_payload ->> 'price')::numeric < 0
    then
      raise exception using errcode = 'P0001', message = 'INVALID_FIELD_RANGE';
    end if;

    if exists (
      select 1
      from public.beans
      where id = p_entity_id
        and user_id <> p_user_id
    ) then
      raise exception using errcode = 'P0001', message = 'ENTITY_NOT_OWNED';
    end if;

    insert into public.beans (
      id, user_id, name, roaster, origin, farm_or_station, process, variety,
      altitude_meters, roast_date, roast_level, flavor_tags, flavor_notes,
      net_weight_grams, remaining_grams, price, purchase_date, source_url, image_url, bean_type,
      blend_components, blend_notes, notes, created_at, updated_at, deleted_at,
      schema_version
    )
    values (
      p_entity_id,
      p_user_id,
      p_payload ->> 'name',
      p_payload ->> 'roaster',
      p_payload ->> 'origin',
      p_payload ->> 'farm_or_station',
      p_payload ->> 'process',
      p_payload ->> 'variety',
      (p_payload ->> 'altitude_meters')::integer,
      v_roast_date,
      p_payload ->> 'roast_level',
      private.jsonb_text_array(p_payload, 'flavor_tags'),
      p_payload ->> 'flavor_notes',
      (p_payload ->> 'net_weight_grams')::numeric,
      (p_payload ->> 'remaining_grams')::numeric,
      (p_payload ->> 'price')::numeric,
      v_purchase_date,
      p_payload ->> 'source_url',
      p_payload ->> 'image_url',
      coalesce(p_payload ->> 'bean_type', 'single_origin'),
      coalesce(p_payload -> 'blend_components', '[]'::jsonb),
      p_payload ->> 'blend_notes',
      p_payload ->> 'notes',
      v_now,
      v_now,
      null,
      coalesce((p_payload ->> 'schema_version')::integer, 1)
    )
    on conflict (id) do update
    set user_id = excluded.user_id,
        name = excluded.name,
        roaster = excluded.roaster,
        origin = excluded.origin,
        farm_or_station = excluded.farm_or_station,
        process = excluded.process,
        variety = excluded.variety,
        altitude_meters = excluded.altitude_meters,
        roast_date = excluded.roast_date,
        roast_level = excluded.roast_level,
        flavor_tags = excluded.flavor_tags,
        flavor_notes = excluded.flavor_notes,
        net_weight_grams = excluded.net_weight_grams,
        remaining_grams = excluded.remaining_grams,
        price = excluded.price,
        purchase_date = excluded.purchase_date,
        source_url = excluded.source_url,
        image_url = excluded.image_url,
        bean_type = excluded.bean_type,
        blend_components = excluded.blend_components,
        blend_notes = excluded.blend_notes,
        notes = excluded.notes,
        updated_at = excluded.updated_at,
        deleted_at = null,
        schema_version = excluded.schema_version
    where public.beans.user_id = p_user_id;

    get diagnostics v_row_count = row_count;
    if v_row_count = 0 then
      raise exception using errcode = 'P0001', message = 'ENTITY_NOT_OWNED';
    end if;
  exception
    when sqlstate 'P0001' then
      raise;
    when invalid_text_representation
      or invalid_datetime_format
      or datetime_field_overflow
      or numeric_value_out_of_range
      or check_violation
      or not_null_violation then
      raise exception using errcode = 'P0001', message = 'INVALID_FIELD_VALUE';
  end;
end;
$$;

revoke execute on function private.apply_bean_mutation(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
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
      "created_at":"timestamp","updated_at":"timestamp","schema_version":"integer"
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
      "created_at":"timestamp","updated_at":"timestamp","schema_version":"integer"
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
    if not private.jsonb_has_exact_keys(p_row - 'remaining_grams', array[
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
      "roast_date":"nullable_date","roast_level":"nullable_string",
      "flavor_tags":"array","flavor_notes":"nullable_string",
      "net_weight_grams":"nullable_number","price":"nullable_number",
      "purchase_date":"nullable_date","source_url":"nullable_string",
      "image_url":"nullable_string","bean_type":"string",
      "blend_components":"array","blend_notes":"nullable_string",
      "notes":"nullable_string","created_at":"timestamp","updated_at":"timestamp",
      "deleted_at":"nullable_timestamp","schema_version":"integer"
    }'::jsonb)
      or (
        p_row ? 'remaining_grams'
        and not private.jsonb_matches_field_types(
          p_row,
          '{"remaining_grams":"nullable_number"}'::jsonb
        )
      )
    then
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
      or (p_row->>'remaining_grams')::numeric < 0
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
      "brewed_at":"timestamp","method":"nullable_string",
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
      "created_at":"timestamp","updated_at":"timestamp",
      "deleted_at":"nullable_timestamp","schema_version":"integer"
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
      "copied_from_template_id":"nullable_string","created_at":"timestamp",
      "updated_at":"timestamp","deleted_at":"nullable_timestamp",
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
      "created_at":"timestamp","updated_at":"timestamp",
      "deleted_at":"nullable_timestamp","schema_version":"integer"
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
      "created_at":"timestamp","updated_at":"timestamp",
      "deleted_at":"nullable_timestamp","schema_version":"integer"
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

revoke execute on function private.validate_backup_preview_row(text, jsonb)
  from public, anon, authenticated;