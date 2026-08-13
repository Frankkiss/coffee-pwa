begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
select no_plan();

select has_function(
  'public', 'consume_edge_rate_limit', array['text', 'integer', 'integer']
);
select ok(
  not has_table_privilege('anon', 'private.edge_rate_limits', 'SELECT')
    and not has_table_privilege('authenticated', 'private.edge_rate_limits', 'SELECT')
    and not has_table_privilege('authenticated', 'private.edge_rate_limits', 'INSERT')
    and not has_table_privilege('authenticated', 'private.edge_rate_limits', 'UPDATE')
    and (
      select relrowsecurity
      from pg_catalog.pg_class
      where oid = 'private.edge_rate_limits'::regclass
    ),
  'client roles cannot access rate-limit buckets directly'
);
select ok(
  not has_function_privilege(
    'anon', 'public.consume_edge_rate_limit(text,integer,integer)', 'EXECUTE'
  )
    and has_function_privilege(
      'authenticated',
      'public.consume_edge_rate_limit(text,integer,integer)',
      'EXECUTE'
    ),
  'only authenticated clients can execute the rate-limit RPC'
);

insert into auth.users (id, email)
values
  ('80000000-0000-4000-8000-000000000001', 'rate-one@example.invalid'),
  ('80000000-0000-4000-8000-000000000002', 'rate-two@example.invalid');

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '80000000-0000-4000-8000-000000000001', true
);

select is(
  public.consume_edge_rate_limit('import-source', 2, 600),
  '{"allowed":true,"remaining":1,"retryAfterSeconds":0}'::jsonb,
  'first call consumes one request'
);
select is(
  public.consume_edge_rate_limit('import-source', 2, 600),
  '{"allowed":true,"remaining":0,"retryAfterSeconds":0}'::jsonb,
  'Nth call is still accepted'
);
select ok(
  (public.consume_edge_rate_limit('import-source', 2, 600)->>'allowed')::boolean is false
    and (public.consume_edge_rate_limit('import-source', 2, 600)->>'remaining')::integer = 0
    and (public.consume_edge_rate_limit('import-source', 2, 600)->>'retryAfterSeconds')::integer
      between 1 and 600,
  'N+1 and later calls are rejected with a bounded retry delay'
);
select is(
  public.consume_edge_rate_limit('recommend-brew', 2, 600)->>'allowed',
  'true',
  'actions use independent buckets'
);

select set_config(
  'request.jwt.claim.sub', '80000000-0000-4000-8000-000000000002', true
);
select is(
  public.consume_edge_rate_limit('import-source', 2, 600)->>'allowed',
  'true',
  'users use independent buckets'
);

select throws_ok(
  $$select public.consume_edge_rate_limit('unknown', 10, 600)$$,
  '22023', 'INVALID_EDGE_RATE_ACTION', 'unknown actions are rejected'
);
select throws_ok(
  $$select public.consume_edge_rate_limit('import-source', 0, 600)$$,
  '22023', 'INVALID_EDGE_RATE_MAX_REQUESTS', 'maximum must be at least one'
);
select throws_ok(
  $$select public.consume_edge_rate_limit('import-source', 101, 600)$$,
  '22023', 'INVALID_EDGE_RATE_MAX_REQUESTS', 'maximum cannot exceed one hundred'
);
select throws_ok(
  $$select public.consume_edge_rate_limit('import-source', 10, 9)$$,
  '22023', 'INVALID_EDGE_RATE_WINDOW', 'window must be at least ten seconds'
);
select throws_ok(
  $$select public.consume_edge_rate_limit('import-source', 10, 3601)$$,
  '22023', 'INVALID_EDGE_RATE_WINDOW', 'window cannot exceed one hour'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.consume_edge_rate_limit('import-source', 10, 600)$$,
  '42501', 'AUTH_REQUIRED', 'RPC rejects a missing authenticated user'
);

select * from finish();
rollback;
