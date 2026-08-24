alter table public.brew_logs
  drop constraint if exists brew_logs_method_measurements_check;

alter table public.brew_logs
  add constraint brew_logs_method_measurements_check
    check (
      (brew_variant is null or brew_mode = 'cold_brew')
      and (
        ice_grams is null
        or brew_mode = 'iced_pourover'
        or (brew_mode = 'cold_brew' and brew_variant = 'concentrate')
      )
      and (beverage_grams is null or brew_mode = 'espresso')
    );

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
    or (
      p_row ->> 'ice_grams' is not null
      and not (
        p_row ->> 'brew_mode' = 'iced_pourover'
        or (
          p_row ->> 'brew_mode' = 'cold_brew'
          and p_row ->> 'brew_variant' = 'concentrate'
        )
      )
    )
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
