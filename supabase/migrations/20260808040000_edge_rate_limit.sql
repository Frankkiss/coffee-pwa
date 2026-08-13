create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.edge_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_started_at timestamptz not null,
  request_count integer not null,
  primary key (user_id, action, window_started_at),
  constraint edge_rate_limits_action_check
    check (action in ('import-source', 'recommend-brew')),
  constraint edge_rate_limits_request_count_check check (request_count > 0)
);

alter table private.edge_rate_limits enable row level security;
revoke all on table private.edge_rate_limits from public, anon, authenticated;

create index edge_rate_limits_window_started_at_idx
on private.edge_rate_limits (window_started_at);

create or replace function public.consume_edge_rate_limit(
  p_action text,
  p_max_requests integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_window_started_at timestamptz;
  v_request_count integer;
  v_allowed boolean;
  v_retry_after integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if p_action is null
    or p_action not in ('import-source', 'recommend-brew')
  then
    raise exception using errcode = '22023', message = 'INVALID_EDGE_RATE_ACTION';
  end if;

  if p_max_requests is null or p_max_requests not between 1 and 100 then
    raise exception using
      errcode = '22023', message = 'INVALID_EDGE_RATE_MAX_REQUESTS';
  end if;

  if p_window_seconds is null or p_window_seconds not between 10 and 3600 then
    raise exception using errcode = '22023', message = 'INVALID_EDGE_RATE_WINDOW';
  end if;

  if (p_action = 'import-source'
      and (p_max_requests <> 10 or p_window_seconds <> 600))
    or (p_action = 'recommend-brew'
      and (p_max_requests <> 20 or p_window_seconds <> 600))
  then
    raise exception using errcode = '22023', message = 'INVALID_EDGE_RATE_POLICY';
  end if;

  delete from private.edge_rate_limits
  where window_started_at < v_now - interval '1 hour';

  v_window_started_at := pg_catalog.to_timestamp(
    pg_catalog.floor(extract(epoch from v_now) / p_window_seconds)
      * p_window_seconds
  );

  insert into private.edge_rate_limits (
    user_id, action, window_started_at, request_count
  )
  values (v_user_id, p_action, v_window_started_at, 1)
  on conflict (user_id, action, window_started_at)
  do update
  set request_count = private.edge_rate_limits.request_count + 1
  returning request_count into v_request_count;

  v_allowed := v_request_count <= p_max_requests;
  v_retry_after := case
    when v_allowed then 0
    else greatest(
      1,
      ceil(
        extract(
          epoch from (
            v_window_started_at
              + pg_catalog.make_interval(secs => p_window_seconds)
              - v_now
          )
        )
      )::integer
    )
  end;

  return pg_catalog.jsonb_build_object(
    'allowed', v_allowed,
    'remaining', greatest(p_max_requests - v_request_count, 0),
    'retryAfterSeconds', v_retry_after
  );
end;
$$;

revoke execute on function public.consume_edge_rate_limit(text, integer, integer)
from public, anon;
grant execute on function public.consume_edge_rate_limit(text, integer, integer)
to authenticated;
