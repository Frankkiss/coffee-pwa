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
revoke execute on function public.export_backup_v2(text, text)
from public, anon;
revoke execute on function public.record_backup_download(text, text, jsonb)
from public, anon;

grant execute on function public.export_backup_v2(text, text)
to authenticated;
grant execute on function public.record_backup_download(text, text, jsonb)
to authenticated;

revoke select on table public.backup_exports from public, anon;
grant select on table public.backup_exports to authenticated;
