create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

-- All entity triggers must use an actual server wall-clock timestamp. The
-- original trigger used transaction-start time through now(), which would make
-- every update in a long-running sync transaction share a stale timestamp.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at = pg_catalog.clock_timestamp();
  return new;
end;
$$;

revoke execute on function public.set_updated_at()
from public, anon, authenticated;

create function private.has_unknown_fields(
  p_payload jsonb,
  p_allowed_fields text[]
)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_payload) as fields(field_name)
    where not (field_name = any (p_allowed_fields))
  );
$$;

create function private.jsonb_text_array(
  p_payload jsonb,
  p_field_name text
)
returns text[]
language sql
immutable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(
    pg_catalog.array_agg(items.value order by items.ordinality),
    '{}'::text[]
  )
  from pg_catalog.jsonb_array_elements_text(
    coalesce(p_payload -> p_field_name, '[]'::jsonb)
  ) with ordinality as items(value, ordinality);
$$;

create function private.apply_bean_mutation(
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
      'flavor_notes', 'net_weight_grams', 'price', 'purchase_date',
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
    where field_name = any (array['net_weight_grams', 'price']::text[])
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
      net_weight_grams, price, purchase_date, source_url, image_url, bean_type,
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

create function private.apply_brew_log_mutation(
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
  v_bean_id uuid;
  v_brewed_at timestamptz;
  v_row_count bigint;
begin
  if private.has_unknown_fields(
    p_payload,
    array[
      'bean_id', 'brewed_at', 'method', 'dripper', 'filter_paper', 'grinder',
      'grind_setting', 'coffee_grams', 'water_grams', 'ratio',
      'water_temperature_c', 'total_time_seconds', 'pour_steps', 'rating',
      'acidity', 'sweetness', 'bitterness', 'astringency', 'body',
      'aftertaste', 'flavor_tags', 'is_pinned_recipe', 'notes',
      'schema_version'
    ]::text[]
  ) then
    raise exception using errcode = 'P0001', message = 'UNKNOWN_FIELDS';
  end if;

  if p_operation = 'delete' then
    if p_payload <> '{}'::jsonb then
      raise exception using errcode = 'P0001', message = 'DELETE_PAYLOAD_MUST_BE_EMPTY';
    end if;

    update public.brew_logs
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

  if not (p_payload ? 'brewed_at')
    or pg_catalog.jsonb_typeof(p_payload -> 'brewed_at') <> 'string'
    or (p_payload ->> 'brewed_at') !~
      '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]+)?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$'
  then
    raise exception using errcode = 'P0001', message = 'INVALID_BREWED_AT';
  end if;

  begin
    v_brewed_at := (p_payload ->> 'brewed_at')::timestamptz;

    if not pg_catalog.isfinite(v_brewed_at) then
      raise exception using errcode = 'P0001', message = 'INVALID_BREWED_AT';
    end if;
  exception
    when sqlstate 'P0001' then
      raise;
    when invalid_datetime_format
      or datetime_field_overflow
      or invalid_time_zone_displacement_value then
      raise exception using errcode = 'P0001', message = 'INVALID_BREWED_AT';
  end;

  if (p_payload ? 'bean_id')
    and (p_payload -> 'bean_id') <> 'null'::jsonb
    and (
      pg_catalog.jsonb_typeof(p_payload -> 'bean_id') <> 'string'
      or (p_payload ->> 'bean_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then
    raise exception using errcode = 'P0001', message = 'INVALID_BEAN_ID';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(p_payload) as fields(field_name, field_value)
    where field_name = any (array[
      'method', 'dripper', 'filter_paper', 'grinder', 'grind_setting',
      'ratio', 'notes'
    ]::text[])
      and field_value <> 'null'::jsonb
      and pg_catalog.jsonb_typeof(field_value) <> 'string'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_TEXT_FIELD';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(p_payload) as fields(field_name, field_value)
    where field_name = any (array[
      'coffee_grams', 'water_grams', 'water_temperature_c', 'rating'
    ]::text[])
      and field_value <> 'null'::jsonb
      and pg_catalog.jsonb_typeof(field_value) <> 'number'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_NUMBER_FIELD';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(p_payload) as fields(field_name, field_value)
    where field_name = any (array[
      'total_time_seconds', 'acidity', 'sweetness', 'bitterness',
      'astringency', 'body', 'aftertaste'
    ]::text[])
      and field_value <> 'null'::jsonb
      and (
        pg_catalog.jsonb_typeof(field_value) <> 'number'
        or field_value #>> '{}' !~ '^-?[0-9]+$'
      )
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_INTEGER_FIELD';
  end if;

  if (p_payload ? 'schema_version') and (
    pg_catalog.jsonb_typeof(p_payload -> 'schema_version') <> 'number'
    or (p_payload ->> 'schema_version') <> '1'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_SCHEMA_VERSION';
  end if;

  if (p_payload ? 'pour_steps')
    and pg_catalog.jsonb_typeof(p_payload -> 'pour_steps') <> 'array' then
    raise exception using errcode = 'P0001', message = 'INVALID_POUR_STEPS';
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

  if (p_payload ? 'is_pinned_recipe')
    and pg_catalog.jsonb_typeof(p_payload -> 'is_pinned_recipe') <> 'boolean' then
    raise exception using errcode = 'P0001', message = 'INVALID_PINNED_RECIPE';
  end if;

  begin
    v_bean_id := (p_payload ->> 'bean_id')::uuid;

    if v_bean_id is not null and not exists (
      select 1
      from public.beans
      where id = v_bean_id
        and user_id = p_user_id
        and deleted_at is null
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'BEAN_REFERENCE_NOT_AVAILABLE';
    end if;

    if (p_payload ->> 'coffee_grams')::numeric <= 0
      or (p_payload ->> 'water_grams')::numeric <= 0
      or (p_payload ->> 'water_temperature_c')::numeric not between 0 and 100
      or (p_payload ->> 'total_time_seconds')::integer < 0
      or (p_payload ->> 'rating')::numeric not between 0 and 5
      or (p_payload ->> 'acidity')::integer not between 0 and 5
      or (p_payload ->> 'sweetness')::integer not between 0 and 5
      or (p_payload ->> 'bitterness')::integer not between 0 and 5
      or (p_payload ->> 'astringency')::integer not between 0 and 5
      or (p_payload ->> 'body')::integer not between 0 and 5
      or (p_payload ->> 'aftertaste')::integer not between 0 and 5
    then
      raise exception using errcode = 'P0001', message = 'INVALID_FIELD_RANGE';
    end if;

    if exists (
      select 1
      from public.brew_logs
      where id = p_entity_id
        and user_id <> p_user_id
    ) then
      raise exception using errcode = 'P0001', message = 'ENTITY_NOT_OWNED';
    end if;

    insert into public.brew_logs (
      id, user_id, bean_id, brewed_at, method, dripper, filter_paper, grinder,
      grind_setting, coffee_grams, water_grams, ratio, water_temperature_c,
      total_time_seconds, pour_steps, rating, acidity, sweetness, bitterness,
      astringency, body, aftertaste, flavor_tags, is_pinned_recipe, notes,
      created_at, updated_at, deleted_at, schema_version
    )
    values (
      p_entity_id,
      p_user_id,
      v_bean_id,
      v_brewed_at,
      p_payload ->> 'method',
      p_payload ->> 'dripper',
      p_payload ->> 'filter_paper',
      p_payload ->> 'grinder',
      p_payload ->> 'grind_setting',
      (p_payload ->> 'coffee_grams')::numeric,
      (p_payload ->> 'water_grams')::numeric,
      p_payload ->> 'ratio',
      (p_payload ->> 'water_temperature_c')::numeric,
      (p_payload ->> 'total_time_seconds')::integer,
      coalesce(p_payload -> 'pour_steps', '[]'::jsonb),
      (p_payload ->> 'rating')::numeric,
      (p_payload ->> 'acidity')::integer,
      (p_payload ->> 'sweetness')::integer,
      (p_payload ->> 'bitterness')::integer,
      (p_payload ->> 'astringency')::integer,
      (p_payload ->> 'body')::integer,
      (p_payload ->> 'aftertaste')::integer,
      private.jsonb_text_array(p_payload, 'flavor_tags'),
      coalesce((p_payload ->> 'is_pinned_recipe')::boolean, false),
      p_payload ->> 'notes',
      v_now,
      v_now,
      null,
      coalesce((p_payload ->> 'schema_version')::integer, 1)
    )
    on conflict (id) do update
    set user_id = excluded.user_id,
        bean_id = excluded.bean_id,
        brewed_at = excluded.brewed_at,
        method = excluded.method,
        dripper = excluded.dripper,
        filter_paper = excluded.filter_paper,
        grinder = excluded.grinder,
        grind_setting = excluded.grind_setting,
        coffee_grams = excluded.coffee_grams,
        water_grams = excluded.water_grams,
        ratio = excluded.ratio,
        water_temperature_c = excluded.water_temperature_c,
        total_time_seconds = excluded.total_time_seconds,
        pour_steps = excluded.pour_steps,
        rating = excluded.rating,
        acidity = excluded.acidity,
        sweetness = excluded.sweetness,
        bitterness = excluded.bitterness,
        astringency = excluded.astringency,
        body = excluded.body,
        aftertaste = excluded.aftertaste,
        flavor_tags = excluded.flavor_tags,
        is_pinned_recipe = excluded.is_pinned_recipe,
        notes = excluded.notes,
        updated_at = excluded.updated_at,
        deleted_at = null,
        schema_version = excluded.schema_version
    where public.brew_logs.user_id = p_user_id;

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
      or not_null_violation
      or foreign_key_violation then
      raise exception using errcode = 'P0001', message = 'INVALID_FIELD_VALUE';
  end;
end;
$$;

create function private.apply_brew_template_mutation(
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
  v_row_count bigint;
begin
  if private.has_unknown_fields(
    p_payload,
    array[
      'name', 'category', 'difficulty', 'brewer', 'filter', 'dose_grams',
      'water_grams', 'ratio', 'water_temperature_min',
      'water_temperature_max', 'grind_size', 'target_time_min',
      'target_time_max', 'pour_steps', 'suitable_for', 'avoid_for',
      'flavor_goal', 'adjustment_rules', 'source_notes', 'source_urls',
      'is_champion_reference', 'copied_from_template_id', 'schema_version'
    ]::text[]
  ) then
    raise exception using errcode = 'P0001', message = 'UNKNOWN_FIELDS';
  end if;

  if p_operation = 'delete' then
    if p_payload <> '{}'::jsonb then
      raise exception using errcode = 'P0001', message = 'DELETE_PAYLOAD_MUST_BE_EMPTY';
    end if;

    update public.brew_templates
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

  if not (p_payload ?& array[
    'name', 'category', 'difficulty', 'brewer', 'dose_grams', 'water_grams',
    'water_temperature_min', 'water_temperature_max', 'target_time_min',
    'target_time_max'
  ]::text[]) then
    raise exception using errcode = 'P0001', message = 'MISSING_REQUIRED_FIELDS';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(p_payload) as fields(field_name, field_value)
    where field_name = any (array[
      'name', 'category', 'difficulty', 'brewer', 'filter', 'ratio',
      'grind_size', 'flavor_goal', 'source_notes', 'copied_from_template_id'
    ]::text[])
      and field_value <> 'null'::jsonb
      and pg_catalog.jsonb_typeof(field_value) <> 'string'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_TEXT_FIELD';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(p_payload) as fields(field_name, field_value)
    where field_name = any (array['dose_grams', 'water_grams']::text[])
      and pg_catalog.jsonb_typeof(field_value) <> 'number'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_NUMBER_FIELD';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(p_payload) as fields(field_name, field_value)
    where field_name = any (array[
      'water_temperature_min', 'water_temperature_max', 'target_time_min',
      'target_time_max'
    ]::text[])
      and (
        pg_catalog.jsonb_typeof(field_value) <> 'number'
        or field_value #>> '{}' !~ '^-?[0-9]+$'
      )
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_INTEGER_FIELD';
  end if;

  if (p_payload ? 'schema_version') and (
    pg_catalog.jsonb_typeof(p_payload -> 'schema_version') <> 'number'
    or (p_payload ->> 'schema_version') <> '1'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_SCHEMA_VERSION';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(p_payload) as fields(field_name, field_value)
    where field_name = any (array['pour_steps']::text[])
      and pg_catalog.jsonb_typeof(field_value) <> 'array'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_JSON_ARRAY';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(p_payload) as fields(field_name, field_value)
    where field_name = any (array[
      'suitable_for', 'avoid_for', 'adjustment_rules', 'source_urls'
    ]::text[])
      and (
        pg_catalog.jsonb_typeof(field_value) <> 'array'
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(field_value) as item
          where pg_catalog.jsonb_typeof(item) <> 'string'
        )
      )
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_TEXT_ARRAY';
  end if;

  if (p_payload ? 'is_champion_reference')
    and pg_catalog.jsonb_typeof(p_payload -> 'is_champion_reference') <> 'boolean' then
    raise exception using errcode = 'P0001', message = 'INVALID_CHAMPION_REFERENCE';
  end if;

  begin
    if pg_catalog.btrim(p_payload ->> 'name') = ''
      or pg_catalog.btrim(p_payload ->> 'category') = ''
      or pg_catalog.btrim(p_payload ->> 'difficulty') = ''
      or pg_catalog.btrim(p_payload ->> 'brewer') = ''
      or (p_payload ->> 'dose_grams')::numeric <= 0
      or (p_payload ->> 'water_grams')::numeric <= 0
      or (p_payload ->> 'water_temperature_min')::integer not between 0 and 100
      or (p_payload ->> 'water_temperature_max')::integer not between 0 and 100
      or (p_payload ->> 'water_temperature_min')::integer
        > (p_payload ->> 'water_temperature_max')::integer
      or (p_payload ->> 'target_time_min')::integer < 0
      or (p_payload ->> 'target_time_max')::integer < 0
      or (p_payload ->> 'target_time_min')::integer
        > (p_payload ->> 'target_time_max')::integer
    then
      raise exception using errcode = 'P0001', message = 'INVALID_FIELD_RANGE';
    end if;

    if exists (
      select 1
      from public.brew_templates
      where id = p_entity_id
        and user_id <> p_user_id
    ) then
      raise exception using errcode = 'P0001', message = 'ENTITY_NOT_OWNED';
    end if;

    insert into public.brew_templates (
      id, user_id, name, category, difficulty, brewer, filter, dose_grams,
      water_grams, ratio, water_temperature_min, water_temperature_max,
      grind_size, target_time_min, target_time_max, pour_steps, suitable_for,
      avoid_for, flavor_goal, adjustment_rules, source_notes, source_urls,
      is_champion_reference, copied_from_template_id, created_at, updated_at,
      deleted_at, schema_version
    )
    values (
      p_entity_id,
      p_user_id,
      p_payload ->> 'name',
      p_payload ->> 'category',
      p_payload ->> 'difficulty',
      p_payload ->> 'brewer',
      coalesce(p_payload ->> 'filter', ''),
      (p_payload ->> 'dose_grams')::numeric,
      (p_payload ->> 'water_grams')::numeric,
      coalesce(p_payload ->> 'ratio', ''),
      (p_payload ->> 'water_temperature_min')::integer,
      (p_payload ->> 'water_temperature_max')::integer,
      coalesce(p_payload ->> 'grind_size', ''),
      (p_payload ->> 'target_time_min')::integer,
      (p_payload ->> 'target_time_max')::integer,
      coalesce(p_payload -> 'pour_steps', '[]'::jsonb),
      private.jsonb_text_array(p_payload, 'suitable_for'),
      private.jsonb_text_array(p_payload, 'avoid_for'),
      coalesce(p_payload ->> 'flavor_goal', ''),
      private.jsonb_text_array(p_payload, 'adjustment_rules'),
      coalesce(p_payload ->> 'source_notes', ''),
      private.jsonb_text_array(p_payload, 'source_urls'),
      coalesce((p_payload ->> 'is_champion_reference')::boolean, false),
      p_payload ->> 'copied_from_template_id',
      v_now,
      v_now,
      null,
      coalesce((p_payload ->> 'schema_version')::integer, 1)
    )
    on conflict (id) do update
    set user_id = excluded.user_id,
        name = excluded.name,
        category = excluded.category,
        difficulty = excluded.difficulty,
        brewer = excluded.brewer,
        filter = excluded.filter,
        dose_grams = excluded.dose_grams,
        water_grams = excluded.water_grams,
        ratio = excluded.ratio,
        water_temperature_min = excluded.water_temperature_min,
        water_temperature_max = excluded.water_temperature_max,
        grind_size = excluded.grind_size,
        target_time_min = excluded.target_time_min,
        target_time_max = excluded.target_time_max,
        pour_steps = excluded.pour_steps,
        suitable_for = excluded.suitable_for,
        avoid_for = excluded.avoid_for,
        flavor_goal = excluded.flavor_goal,
        adjustment_rules = excluded.adjustment_rules,
        source_notes = excluded.source_notes,
        source_urls = excluded.source_urls,
        is_champion_reference = excluded.is_champion_reference,
        copied_from_template_id = excluded.copied_from_template_id,
        updated_at = excluded.updated_at,
        deleted_at = null,
        schema_version = excluded.schema_version
    where public.brew_templates.user_id = p_user_id;

    get diagnostics v_row_count = row_count;
    if v_row_count = 0 then
      raise exception using errcode = 'P0001', message = 'ENTITY_NOT_OWNED';
    end if;
  exception
    when sqlstate 'P0001' then
      raise;
    when invalid_text_representation
      or numeric_value_out_of_range
      or check_violation
      or not_null_violation then
      raise exception using errcode = 'P0001', message = 'INVALID_FIELD_VALUE';
  end;
end;
$$;

create function private.apply_user_settings_mutation(
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
begin
  if p_entity_id <> p_user_id then
    raise exception using errcode = 'P0001', message = 'ENTITY_ID_MUST_EQUAL_USER_ID';
  end if;

  if p_operation = 'delete' then
    raise exception using
      errcode = 'P0001',
      message = 'USER_SETTINGS_DELETE_NOT_ALLOWED';
  end if;

  if private.has_unknown_fields(
    p_payload,
    array[
      'preferred_units', 'default_gear', 'taste_preferences',
      'backup_reminder_days', 'schema_version'
    ]::text[]
  ) then
    raise exception using errcode = 'P0001', message = 'UNKNOWN_FIELDS';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(p_payload) as fields(field_name, field_value)
    where field_name = any (array[
      'preferred_units', 'default_gear', 'taste_preferences'
    ]::text[])
      and pg_catalog.jsonb_typeof(field_value) <> 'object'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_SETTINGS_OBJECT';
  end if;

  if (p_payload ? 'backup_reminder_days') and (
    pg_catalog.jsonb_typeof(p_payload -> 'backup_reminder_days') <> 'number'
    or (p_payload ->> 'backup_reminder_days') !~ '^[0-9]+$'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_BACKUP_REMINDER_DAYS';
  end if;

  if (p_payload ? 'schema_version') and (
    pg_catalog.jsonb_typeof(p_payload -> 'schema_version') <> 'number'
    or (p_payload ->> 'schema_version') <> '1'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_SCHEMA_VERSION';
  end if;

  begin
    if coalesce((p_payload ->> 'backup_reminder_days')::integer, 7)
        not between 1 and 365
    then
      raise exception using errcode = 'P0001', message = 'INVALID_FIELD_RANGE';
    end if;

    insert into public.user_settings (
      user_id, preferred_units, default_gear, taste_preferences,
      backup_reminder_days, created_at, updated_at, schema_version
    )
    values (
      p_user_id,
      coalesce(p_payload -> 'preferred_units', '{}'::jsonb),
      coalesce(p_payload -> 'default_gear', '{}'::jsonb),
      coalesce(p_payload -> 'taste_preferences', '{}'::jsonb),
      coalesce((p_payload ->> 'backup_reminder_days')::integer, 7),
      v_now,
      v_now,
      coalesce((p_payload ->> 'schema_version')::integer, 1)
    )
    on conflict (user_id) do update
    set preferred_units = excluded.preferred_units,
        default_gear = excluded.default_gear,
        taste_preferences = excluded.taste_preferences,
        backup_reminder_days = excluded.backup_reminder_days,
        updated_at = excluded.updated_at,
        schema_version = excluded.schema_version;
  exception
    when sqlstate 'P0001' then
      raise;
    when invalid_text_representation
      or numeric_value_out_of_range
      or check_violation
      or not_null_violation then
      raise exception using errcode = 'P0001', message = 'INVALID_FIELD_VALUE';
  end;
end;
$$;

create function public.apply_sync_batch(
  p_sync_epoch bigint,
  p_operations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_epoch bigint;
  v_operation jsonb;
  v_operation_index integer := 0;
  v_mutation_id uuid;
  v_device_id uuid;
  v_entity_id uuid;
  v_entity_type text;
  v_operation_type text;
  v_payload jsonb;
  v_receipt_summary jsonb;
  v_applied_summary jsonb;
  v_committed_at timestamptz;
  v_results jsonb := '[]'::jsonb;
  v_error_message text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if p_sync_epoch is null then
    raise exception using errcode = 'P0001', message = 'INVALID_BATCH: INVALID_SYNC_EPOCH';
  end if;

  if p_operations is null
    or pg_catalog.jsonb_typeof(p_operations) <> 'array' then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_BATCH: OPERATIONS_MUST_BE_ARRAY';
  end if;

  if pg_catalog.jsonb_array_length(p_operations) > 100 then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_BATCH: TOO_MANY_OPERATIONS';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  insert into public.user_sync_state (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select sync_epoch
  into v_current_epoch
  from public.user_sync_state
  where user_id = v_user_id
  for update;

  if v_current_epoch <> p_sync_epoch then
    raise exception using errcode = 'P0001', message = 'STALE_SYNC_EPOCH';
  end if;

  for v_operation in
    select operations.value
    from pg_catalog.jsonb_array_elements(p_operations)
      with ordinality as operations(value, position)
    order by operations.position
  loop
    v_operation_index := v_operation_index + 1;

    if pg_catalog.jsonb_typeof(v_operation) <> 'object' then
      raise exception using
        errcode = 'P0001',
        message = pg_catalog.format(
          'INVALID_OPERATION[%s]: OPERATION_MUST_BE_OBJECT',
          v_operation_index
        );
    end if;

    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(v_operation) as fields(field_name)
      where field_name not in (
        'mutationId', 'deviceId', 'entityType', 'entityId', 'operation', 'payload'
      )
    ) then
      raise exception using
        errcode = 'P0001',
        message = pg_catalog.format(
          'INVALID_OPERATION[%s]: UNKNOWN_FIELDS',
          v_operation_index
        );
    end if;

    if not (v_operation ?& array[
      'mutationId', 'deviceId', 'entityType', 'entityId', 'operation', 'payload'
    ]::text[]) then
      raise exception using
        errcode = 'P0001',
        message = pg_catalog.format(
          'INVALID_OPERATION[%s]: MISSING_FIELDS',
          v_operation_index
        );
    end if;

    if pg_catalog.jsonb_typeof(v_operation -> 'mutationId') <> 'string'
      or (v_operation ->> 'mutationId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using
        errcode = 'P0001',
        message = pg_catalog.format(
          'INVALID_OPERATION[%s]: INVALID_MUTATION_ID',
          v_operation_index
        );
    end if;

    if pg_catalog.jsonb_typeof(v_operation -> 'deviceId') <> 'string'
      or (v_operation ->> 'deviceId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using
        errcode = 'P0001',
        message = pg_catalog.format(
          'INVALID_OPERATION[%s]: INVALID_DEVICE_ID',
          v_operation_index
        );
    end if;

    if pg_catalog.jsonb_typeof(v_operation -> 'entityId') <> 'string'
      or (v_operation ->> 'entityId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using
        errcode = 'P0001',
        message = pg_catalog.format(
          'INVALID_OPERATION[%s]: INVALID_ENTITY_ID',
          v_operation_index
        );
    end if;

    if pg_catalog.jsonb_typeof(v_operation -> 'entityType') <> 'string'
      or (v_operation ->> 'entityType') not in (
        'bean', 'brewLog', 'brewTemplate', 'userSettings'
      ) then
      raise exception using
        errcode = 'P0001',
        message = pg_catalog.format(
          'INVALID_OPERATION[%s]: UNKNOWN_ENTITY_TYPE',
          v_operation_index
        );
    end if;

    if pg_catalog.jsonb_typeof(v_operation -> 'operation') <> 'string'
      or (v_operation ->> 'operation') not in ('upsert', 'delete') then
      raise exception using
        errcode = 'P0001',
        message = pg_catalog.format(
          'INVALID_OPERATION[%s]: UNKNOWN_OPERATION',
          v_operation_index
        );
    end if;

    if pg_catalog.jsonb_typeof(v_operation -> 'payload') <> 'object' then
      raise exception using
        errcode = 'P0001',
        message = pg_catalog.format(
          'INVALID_OPERATION[%s]: PAYLOAD_MUST_BE_OBJECT',
          v_operation_index
        );
    end if;

    v_mutation_id := (v_operation ->> 'mutationId')::uuid;
    v_device_id := (v_operation ->> 'deviceId')::uuid;
    v_entity_id := (v_operation ->> 'entityId')::uuid;
    v_entity_type := v_operation ->> 'entityType';
    v_operation_type := v_operation ->> 'operation';
    v_payload := v_operation -> 'payload';

    select result_summary
    into v_receipt_summary
    from public.sync_mutation_receipts
    where user_id = v_user_id
      and mutation_id = v_mutation_id;

    if found then
      v_results := v_results || pg_catalog.jsonb_build_array(
        v_receipt_summary
          || pg_catalog.jsonb_build_object('status', 'duplicate')
      );
      continue;
    end if;

    if v_entity_type = 'userSettings'
      and v_operation_type = 'delete' then
      raise exception using
        errcode = 'P0001',
        message = pg_catalog.format(
          'INVALID_OPERATION[%s]: USER_SETTINGS_DELETE_NOT_ALLOWED',
          v_operation_index
        );
    end if;

    begin
      case v_entity_type
        when 'bean' then
          perform private.apply_bean_mutation(
            v_user_id, v_entity_id, v_operation_type, v_payload
          );
        when 'brewLog' then
          perform private.apply_brew_log_mutation(
            v_user_id, v_entity_id, v_operation_type, v_payload
          );
        when 'brewTemplate' then
          perform private.apply_brew_template_mutation(
            v_user_id, v_entity_id, v_operation_type, v_payload
          );
        when 'userSettings' then
          perform private.apply_user_settings_mutation(
            v_user_id, v_entity_id, v_operation_type, v_payload
          );
      end case;
    exception
      when sqlstate 'P0001' then
        get stacked diagnostics v_error_message = message_text;
        if v_error_message in (
          'ENTITY_NOT_FOUND', 'ENTITY_NOT_OWNED',
          'ENTITY_ID_MUST_EQUAL_USER_ID', 'USER_SETTINGS_DELETE_NOT_ALLOWED'
        ) then
          raise exception using
            errcode = 'P0001',
            message = pg_catalog.format(
              'INVALID_OPERATION[%s]: %s',
              v_operation_index,
              v_error_message
            );
        end if;

        raise exception using
          errcode = 'P0001',
          message = pg_catalog.format(
            'INVALID_PAYLOAD[%s]: %s',
            v_operation_index,
            v_error_message
          );
    end;

    v_committed_at := pg_catalog.clock_timestamp();
    v_applied_summary := pg_catalog.jsonb_build_object(
      'mutationId', v_mutation_id,
      'deviceId', v_device_id,
      'entityType', v_entity_type,
      'entityId', v_entity_id,
      'operation', v_operation_type,
      'committedAt', v_committed_at,
      'status', 'applied'
    );

    insert into public.sync_mutation_receipts (
      user_id, mutation_id, device_id, entity_type, entity_id, operation,
      committed_at, result_summary
    )
    values (
      v_user_id, v_mutation_id, v_device_id, v_entity_type, v_entity_id,
      v_operation_type, v_committed_at, v_applied_summary
    );

    v_results := v_results || pg_catalog.jsonb_build_array(v_applied_summary);
  end loop;

  return pg_catalog.jsonb_build_object(
    'syncEpoch', v_current_epoch,
    'serverTime', pg_catalog.clock_timestamp(),
    'results', v_results
  );
end;
$$;

create function public.get_sync_snapshot()
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select pg_catalog.jsonb_build_object(
    'syncEpoch', coalesce(
      (
        select sync_epoch
        from public.user_sync_state
        where user_id = v_user_id
      ),
      1
    ),
    'serverTime', pg_catalog.clock_timestamp(),
    'beans', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(beans) order by beans.created_at, beans.id
        )
        from public.beans
        where user_id = v_user_id
      ),
      '[]'::jsonb
    ),
    'brewLogs', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(brew_logs)
          order by brew_logs.brewed_at, brew_logs.id
        )
        from public.brew_logs
        where user_id = v_user_id
      ),
      '[]'::jsonb
    ),
    'brewTemplates', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(brew_templates)
          order by brew_templates.created_at, brew_templates.id
        )
        from public.brew_templates
        where user_id = v_user_id
      ),
      '[]'::jsonb
    ),
    'userSettings', (
      select pg_catalog.to_jsonb(user_settings)
      from public.user_settings
      where user_id = v_user_id
    ),
    'aiRecommendations', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(ai_recommendations)
          order by ai_recommendations.created_at, ai_recommendations.id
        )
        from public.ai_recommendations
        where user_id = v_user_id
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke execute on function private.has_unknown_fields(jsonb, text[])
from public, anon, authenticated;
revoke execute on function private.jsonb_text_array(jsonb, text)
from public, anon, authenticated;
revoke execute on function private.apply_bean_mutation(uuid, uuid, text, jsonb)
from public, anon, authenticated;
revoke execute on function private.apply_brew_log_mutation(uuid, uuid, text, jsonb)
from public, anon, authenticated;
revoke execute on function private.apply_brew_template_mutation(uuid, uuid, text, jsonb)
from public, anon, authenticated;
revoke execute on function private.apply_user_settings_mutation(uuid, uuid, text, jsonb)
from public, anon, authenticated;

revoke execute on function public.apply_sync_batch(bigint, jsonb)
from public, anon;
revoke execute on function public.get_sync_snapshot()
from public, anon;

grant execute on function public.apply_sync_batch(bigint, jsonb)
to authenticated;
grant execute on function public.get_sync_snapshot()
to authenticated;

revoke select on table
  public.beans,
  public.brew_logs,
  public.brew_templates,
  public.user_settings,
  public.ai_recommendations
from public, anon;

grant select on table
  public.beans,
  public.brew_logs,
  public.brew_templates,
  public.user_settings,
  public.ai_recommendations
to authenticated;
