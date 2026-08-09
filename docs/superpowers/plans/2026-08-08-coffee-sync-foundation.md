# Coffee Unified Sync Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace page-owned offline queues with a user-scoped IndexedDB repository and one idempotent Supabase synchronization path without losing existing cached or pending data.

**Architecture:** Existing Supabase remains authoritative. React pages write to local repositories that atomically update an entity row and a compacted Outbox entry; one `SyncManager` uploads permanent-UUID mutations through authenticated RPCs, pulls a complete server snapshot, and overlays any remaining local intent. A user-level `sync_epoch` prevents pre-rollback mutations from replaying after a future full restore.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 4, IndexedDB, fake-indexeddb, Supabase JS 2, Supabase Postgres/RLS/RPC, pgTAP-compatible SQL tests.

---

## File map

**Supabase**

- Create `supabase/sql/004_data_safety_preflight.sql`: read-only production audit queries.
- Create `supabase/migrations/20260612000000_initial_schema.sql`: exact migration copy of the reviewed existing `001_initial_schema.sql`.
- Create `supabase/migrations/20260615000000_blend_beans.sql`: exact migration copy of the reviewed existing `002_blend_beans.sql`.
- Create `supabase/migrations/20260615010000_brew_templates.sql`: exact migration copy of the reviewed existing `003_brew_templates.sql`.
- Create `supabase/migrations/20260808010000_sync_foundation.sql`: additive tables, columns, constraints, indexes, triggers, and RLS.
- Create `supabase/migrations/20260808020000_sync_rpc.sql`: `apply_sync_batch` and `get_sync_snapshot`.
- Create `supabase/tests/005_sync_foundation.test.sql`: schema, RLS, relation, idempotency, epoch, and rollback tests.

**Client sync core**

- Create `app/src/features/sync/syncTypes.ts`: shared entity, Outbox, snapshot, status, and RPC contracts.
- Create `app/src/features/sync/syncDatabase.ts`: IndexedDB v3 open/upgrade and transaction helpers.
- Create `app/src/features/sync/outboxModel.ts`: pure compaction, dependency ordering, retry, and state logic.
- Create `app/src/features/sync/legacyMigration.ts`: v2 cache/queue to v3 entity store migration.
- Create `app/src/features/sync/localRepository.ts`: atomic local entity plus Outbox operations.
- Create `app/src/features/sync/syncApi.ts`: typed Supabase RPC adapter.
- Create `app/src/features/sync/syncLock.ts`: Web Locks and IndexedDB lease fallback.
- Create `app/src/features/sync/syncRealtime.ts`: user-filtered Realtime wake-up subscriptions.
- Create `app/src/features/sync/syncManager.ts`: synchronization state machine.
- Create `app/src/features/sync/SyncContext.tsx`: one manager per authenticated user.
- Create `app/src/features/sync/SyncStatusBanner.tsx`: global status and record-action UI.
- Create focused `*.test.ts` files beside each pure or IndexedDB module.

**Feature repositories and integration**

- Create `app/src/features/beans/beanRepository.ts`.
- Create `app/src/features/brews/brewLogRepository.ts`.
- Create `app/src/features/brewTemplates/brewTemplateRepository.ts`.
- Create `app/src/features/settings/userSettingsTypes.ts`.
- Create `app/src/features/settings/userSettingsRepository.ts`.
- Create `app/src/features/settings/userSettingsModel.ts` and test.
- Create `app/src/features/settings/UserSettingsPanel.tsx` and `settings.css`.
- Create `app/src/features/recommendations/recommendationRepository.ts` for offline saved-recommendation reads.
- Modify `AuthPanel.tsx`, `BeanDashboard.tsx`, `BrewLogPanel.tsx`, `BrewTemplatePanel.tsx`, `RecommendationPanel.tsx`, `HomeOverview.tsx`, `homeOverviewModel.ts`, `OnlineStatus.tsx`, and related tests.
- Delete `offlineCache.ts` and `offlineQueue.ts` only in the final cleanup task after migration coverage passes.

### Task 1: Add deterministic IndexedDB tests and CI quality gates

**Files:**
- Modify: `app/package.json`
- Modify: `app/package-lock.json`
- Modify: `.github/workflows/deploy-pages.yml`
- Create: `app/src/test/setupIndexedDb.ts`

- [ ] **Step 1: Install the IndexedDB test adapter**

Run from `app`:

```powershell
npm install --save-dev fake-indexeddb
```

Expected: `package.json` and `package-lock.json` contain `fake-indexeddb`; npm exits 0.

- [ ] **Step 2: Add the shared test setup**

Create `app/src/test/setupIndexedDb.ts`:

```ts
import 'fake-indexeddb/auto'

export async function deleteTestDatabase(name: string) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('Test database delete failed'))
    request.onblocked = () => reject(new Error('Test database delete blocked'))
  })
}
```

- [ ] **Step 3: Make CI run tests and lint before build**

Insert these steps after `npm ci` in `.github/workflows/deploy-pages.yml`:

```yaml
      - name: Test
        run: npm test
        working-directory: app

      - name: Lint
        run: npm run lint
        working-directory: app
```

- [ ] **Step 4: Run the existing suite**

Run from `app`:

```powershell
npm test
npm run lint
npm run build
```

Expected: all existing tests pass; lint and build exit 0.

- [ ] **Step 5: Commit the test foundation**

```powershell
git add app/package.json app/package-lock.json app/src/test/setupIndexedDb.ts .github/workflows/deploy-pages.yml
git commit -m "test: add sync storage test foundation"
```

### Task 2: Add the read-only production preflight audit

**Files:**
- Create: `supabase/sql/004_data_safety_preflight.sql`
- Create: `docs/operations/data-safety-preflight.md`

- [ ] **Step 1: Write the audit SQL**

Create `supabase/sql/004_data_safety_preflight.sql` with read-only queries for table presence, row counts, RLS, policies, columns, foreign-key integrity, and invalid ranges. The file must begin with a read-only transaction and end with rollback:

```sql
begin transaction read only;

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles', 'beans', 'brew_logs', 'brew_templates',
    'ai_recommendations', 'source_imports', 'backup_exports', 'user_settings'
  )
order by table_name;

select 'beans' as table_name, count(*) as row_count from public.beans
union all select 'brew_logs', count(*) from public.brew_logs
union all select 'brew_templates', count(*) from public.brew_templates
union all select 'ai_recommendations', count(*) from public.ai_recommendations
union all select 'source_imports', count(*) from public.source_imports
union all select 'backup_exports', count(*) from public.backup_exports
union all select 'user_settings', count(*) from public.user_settings;

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'profiles', 'beans', 'brew_logs', 'brew_templates',
    'ai_recommendations', 'source_imports', 'backup_exports', 'user_settings'
  )
order by c.relname;

select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

select bl.id, bl.user_id, bl.bean_id, b.user_id as bean_user_id
from public.brew_logs bl
left join public.beans b on b.id = bl.bean_id
where bl.bean_id is not null
  and (b.id is null or b.user_id <> bl.user_id);

select ar.id, ar.user_id, ar.bean_id, b.user_id as bean_user_id
from public.ai_recommendations ar
left join public.beans b on b.id = ar.bean_id
where ar.bean_id is not null
  and (b.id is null or b.user_id <> ar.user_id);

select id, rating, acidity, sweetness, bitterness, astringency, body, aftertaste
from public.brew_logs
where (rating is not null and (rating < 0 or rating > 5))
   or acidity not between 0 and 5
   or sweetness not between 0 and 5
   or bitterness not between 0 and 5
   or astringency not between 0 and 5
   or body not between 0 and 5
   or aftertaste not between 0 and 5;

select id, coffee_grams, water_grams, water_temperature_c, total_time_seconds
from public.brew_logs
where (coffee_grams is not null and coffee_grams <= 0)
   or (water_grams is not null and water_grams <= 0)
   or (water_temperature_c is not null and water_temperature_c not between 0 and 100)
   or (total_time_seconds is not null and total_time_seconds < 0);

select id, altitude_meters, net_weight_grams, price
from public.beans
where (altitude_meters is not null and altitude_meters < 0)
   or (net_weight_grams is not null and net_weight_grams <= 0)
   or (price is not null and price < 0);

select id, dose_grams, water_grams, water_temperature_min, water_temperature_max,
       target_time_min, target_time_max
from public.brew_templates
where dose_grams <= 0
   or water_grams <= 0
   or water_temperature_min not between 0 and 100
   or water_temperature_max not between water_temperature_min and 100
   or target_time_min < 0
   or target_time_max < target_time_min;

select id, status
from public.source_imports
where status not in ('draft', 'saved', 'failed');

select user_id, backup_reminder_days
from public.user_settings
where backup_reminder_days not between 1 and 365;

rollback;
```

- [ ] **Step 2: Document safe execution and evidence capture**

Create `docs/operations/data-safety-preflight.md` with these mandatory rules:

```markdown
# Data Safety Preflight

1. Run `004_data_safety_preflight.sql` against the linked Supabase project before any migration.
2. Save the unedited output with the execution date outside the public repository if it contains user data.
3. Record table counts, RLS state, policy count, orphan count, and invalid-range count in the rollout checklist.
4. Stop if any expected table is missing, RLS is disabled, a cross-user relation exists, or invalid values would violate the new constraints.
5. Do not edit or delete anomalous rows until a row-specific repair is reviewed.
```

- [ ] **Step 3: Confirm the audit is mutation-free**

Run:

```powershell
rg -n "insert|update|delete|truncate|alter|drop|create" supabase/sql/004_data_safety_preflight.sql
```

Expected: the only match is text inside identifiers or none; there are no modifying statements.

- [ ] **Step 4: Commit the audit**

```powershell
git add supabase/sql/004_data_safety_preflight.sql docs/operations/data-safety-preflight.md
git commit -m "docs: add production data safety preflight"
```

### Task 3: Add the additive sync schema and RLS

**Files:**
- Create: `supabase/migrations/20260612000000_initial_schema.sql`
- Create: `supabase/migrations/20260615000000_blend_beans.sql`
- Create: `supabase/migrations/20260615010000_brew_templates.sql`
- Create: `supabase/migrations/20260808010000_sync_foundation.sql`
- Create: `supabase/tests/005_sync_foundation.test.sql`

- [ ] **Step 1: Establish the local migration baseline**

Create the three dated baseline migration files as byte-for-byte SQL copies of `supabase/sql/001_initial_schema.sql`,
`002_blend_beans.sql`, and `003_brew_templates.sql`. Do not delete the reviewed setup scripts. Run `supabase db reset` and verify the local
database now contains `beans`, `brew_logs`, `brew_templates`, `ai_recommendations`, `source_imports`, `backup_exports`, and `user_settings`.

- [ ] **Step 2: Write failing schema assertions**

Create `supabase/tests/005_sync_foundation.test.sql` with pgTAP assertions:

```sql
begin;
select plan(21);

select has_table('public', 'user_sync_state', 'user_sync_state exists');
select has_table('public', 'sync_mutation_receipts', 'sync_mutation_receipts exists');
select has_column('public', 'brew_templates', 'schema_version', 'templates are versioned');
select col_is_pk('public', 'user_sync_state', 'user_id', 'sync state is per-user');
select has_index('public', 'sync_mutation_receipts', 'sync_mutation_receipts_user_mutation_uidx');
select has_index('public', 'beans', 'beans_id_user_id_uidx');
select has_index('public', 'brew_logs', 'brew_logs_user_active_idx');
select has_index('public', 'brew_templates', 'brew_templates_user_active_idx');
select has_check('public', 'brew_logs', 'brew_logs_rating_check');
select has_check('public', 'brew_logs', 'brew_logs_sensory_check');
select has_check('public', 'brew_logs', 'brew_logs_measurements_check');
select has_check('public', 'beans', 'beans_numeric_values_check');
select has_check('public', 'brew_templates', 'brew_templates_ranges_check');
select has_check('public', 'source_imports', 'source_imports_status_check');
select has_check('public', 'user_settings', 'user_settings_backup_days_check');
select table_privs_are('public', 'user_sync_state', 'anon', array[]::text[], 'anon has no sync-state privileges');
select table_privs_are('public', 'sync_mutation_receipts', 'anon', array[]::text[], 'anon has no receipt privileges');
select ok(
  exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.brew_logs'::regclass
      and conname = 'brew_logs_bean_user_fkey'
      and confdeltype = 'a'
      and condeferrable
      and condeferred
  ),
  'brew FK is deferred NO ACTION'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.ai_recommendations'::regclass
      and conname = 'ai_recommendations_bean_user_fkey'
      and confdeltype = 'a'
      and condeferrable
      and condeferred
  ),
  'AI FK is deferred NO ACTION'
);
select ok(
  not exists (
    select 1
    from pg_catalog.pg_constraint as constraints
    join pg_catalog.pg_attribute as source_column
      on source_column.attrelid = constraints.conrelid
      and source_column.attnum = constraints.conkey[1]
    join pg_catalog.pg_attribute as target_column
      on target_column.attrelid = constraints.confrelid
      and target_column.attnum = constraints.confkey[1]
    where constraints.contype = 'f'
      and constraints.conrelid = 'public.brew_logs'::regclass
      and constraints.confrelid = 'public.beans'::regclass
      and cardinality(constraints.conkey) = 1
      and cardinality(constraints.confkey) = 1
      and source_column.attname = 'bean_id'
      and target_column.attname = 'id'
  ),
  'brew legacy bean FK is removed by semantics'
);
select ok(
  not exists (
    select 1
    from pg_catalog.pg_constraint as constraints
    join pg_catalog.pg_attribute as source_column
      on source_column.attrelid = constraints.conrelid
      and source_column.attnum = constraints.conkey[1]
    join pg_catalog.pg_attribute as target_column
      on target_column.attrelid = constraints.confrelid
      and target_column.attnum = constraints.confkey[1]
    where constraints.contype = 'f'
      and constraints.conrelid = 'public.ai_recommendations'::regclass
      and constraints.confrelid = 'public.beans'::regclass
      and cardinality(constraints.conkey) = 1
      and cardinality(constraints.confkey) = 1
      and source_column.attname = 'bean_id'
      and target_column.attname = 'id'
  ),
  'AI legacy bean FK is removed by semantics'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Run the database test to verify it fails**

Run with the local Supabase stack active:

```powershell
supabase test db supabase/tests/005_sync_foundation.test.sql
```

Expected: FAIL because the two tables and new indexes do not exist.

- [ ] **Step 4: Implement the additive schema migration**

Create `supabase/migrations/20260808010000_sync_foundation.sql`. It must:

```sql
create table if not exists public.user_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sync_epoch bigint not null default 1 check (sync_epoch > 0),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.sync_mutation_receipts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  device_id uuid not null,
  entity_type text not null check (entity_type in ('bean', 'brewLog', 'brewTemplate', 'userSettings')),
  entity_id uuid not null,
  operation text not null check (operation in ('upsert', 'delete')),
  committed_at timestamptz not null default clock_timestamp(),
  result_summary jsonb not null default '{}'::jsonb
);

create unique index if not exists sync_mutation_receipts_user_mutation_uidx
  on public.sync_mutation_receipts(user_id, mutation_id);
create index if not exists sync_mutation_receipts_committed_at_idx
  on public.sync_mutation_receipts(committed_at);

alter table public.brew_templates
  add column if not exists schema_version integer not null default 1;

create unique index if not exists beans_id_user_id_uidx on public.beans(id, user_id);
create index if not exists beans_user_active_idx on public.beans(user_id, created_at desc) where deleted_at is null;
create index if not exists brew_logs_user_active_idx on public.brew_logs(user_id, brewed_at desc) where deleted_at is null;
create index if not exists brew_templates_user_active_idx on public.brew_templates(user_id, created_at desc) where deleted_at is null;
create index if not exists ai_recommendations_user_active_idx on public.ai_recommendations(user_id, created_at desc) where deleted_at is null;
create index if not exists source_imports_user_active_idx on public.source_imports(user_id, created_at desc) where deleted_at is null;

do $$
declare
  old_fk record;
begin
  for old_fk in
    select
      source_namespace.nspname as table_schema,
      source_table.relname as table_name,
      constraints.conname
    from pg_catalog.pg_constraint as constraints
    join pg_catalog.pg_class as source_table
      on source_table.oid = constraints.conrelid
    join pg_catalog.pg_namespace as source_namespace
      on source_namespace.oid = source_table.relnamespace
    join pg_catalog.pg_attribute as source_column
      on source_column.attrelid = constraints.conrelid
      and source_column.attnum = constraints.conkey[1]
    join pg_catalog.pg_attribute as target_column
      on target_column.attrelid = constraints.confrelid
      and target_column.attnum = constraints.confkey[1]
    where constraints.contype = 'f'
      and constraints.conrelid in (
        'public.brew_logs'::regclass,
        'public.ai_recommendations'::regclass
      )
      and constraints.confrelid = 'public.beans'::regclass
      and cardinality(constraints.conkey) = 1
      and cardinality(constraints.confkey) = 1
      and source_column.attname = 'bean_id'
      and target_column.attname = 'id'
  loop
    execute format(
      'alter table %I.%I drop constraint %I',
      old_fk.table_schema,
      old_fk.table_name,
      old_fk.conname
    );
  end loop;
end;
$$;

alter table public.brew_logs
  add constraint brew_logs_bean_user_fkey
  foreign key (bean_id, user_id) references public.beans(id, user_id)
  on delete no action deferrable initially deferred;

alter table public.ai_recommendations
  add constraint ai_recommendations_bean_user_fkey
  foreign key (bean_id, user_id) references public.beans(id, user_id)
  on delete no action deferrable initially deferred;

alter table public.brew_logs drop constraint if exists brew_logs_rating_check;
alter table public.brew_logs add constraint brew_logs_rating_check
  check (rating is null or rating between 0 and 5) not valid;
alter table public.brew_logs drop constraint if exists brew_logs_sensory_check;
alter table public.brew_logs add constraint brew_logs_sensory_check check (
  (acidity is null or acidity between 0 and 5)
  and (sweetness is null or sweetness between 0 and 5)
  and (bitterness is null or bitterness between 0 and 5)
  and (astringency is null or astringency between 0 and 5)
  and (body is null or body between 0 and 5)
  and (aftertaste is null or aftertaste between 0 and 5)
) not valid;
alter table public.brew_logs drop constraint if exists brew_logs_measurements_check;
alter table public.brew_logs add constraint brew_logs_measurements_check check (
  (coffee_grams is null or coffee_grams > 0)
  and (water_grams is null or water_grams > 0)
  and (water_temperature_c is null or water_temperature_c between 0 and 100)
  and (total_time_seconds is null or total_time_seconds >= 0)
) not valid;
alter table public.beans drop constraint if exists beans_numeric_values_check;
alter table public.beans add constraint beans_numeric_values_check check (
  (altitude_meters is null or altitude_meters >= 0)
  and (net_weight_grams is null or net_weight_grams > 0)
  and (price is null or price >= 0)
) not valid;
alter table public.brew_templates drop constraint if exists brew_templates_ranges_check;
alter table public.brew_templates add constraint brew_templates_ranges_check check (
  dose_grams > 0
  and water_grams > 0
  and water_temperature_min between 0 and 100
  and water_temperature_max between water_temperature_min and 100
  and target_time_min >= 0
  and target_time_max >= target_time_min
) not valid;
alter table public.source_imports drop constraint if exists source_imports_status_check;
alter table public.source_imports add constraint source_imports_status_check
  check (status in ('draft', 'saved', 'failed')) not valid;
alter table public.user_settings drop constraint if exists user_settings_backup_days_check;
alter table public.user_settings add constraint user_settings_backup_days_check
  check (backup_reminder_days between 1 and 365) not valid;

alter table public.user_sync_state enable row level security;
alter table public.sync_mutation_receipts enable row level security;

revoke all on public.user_sync_state from anon;
revoke all on public.sync_mutation_receipts from anon;
grant select on public.user_sync_state to authenticated;

drop policy if exists "Users read own sync state" on public.user_sync_state;
create policy "Users read own sync state"
on public.user_sync_state for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users read own mutation receipts" on public.sync_mutation_receipts;
create policy "Users read own mutation receipts"
on public.sync_mutation_receipts for select to authenticated
using (auth.uid() = user_id);

create or replace function public.purge_expired_sync_mutation_receipts()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count bigint;
begin
  delete from public.sync_mutation_receipts
  where committed_at < clock_timestamp() - interval '30 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.purge_expired_sync_mutation_receipts() from public, anon, authenticated;
```

Do not validate new `not valid` CHECK constraints until preflight confirms old rows comply. Extend the preflight query for every range above.
Do not grant direct insert, update, or delete on the technical tables to authenticated clients; RPCs own those writes.
Schedule the purge function once per day through Supabase Cron during the approved production rollout. A missed cleanup must not block synchronization.

- [ ] **Step 5: Apply locally and rerun schema tests**

```powershell
supabase db reset
supabase test db supabase/tests/005_sync_foundation.test.sql
```

Expected: all 17 pgTAP assertions pass.

- [ ] **Step 6: Commit the schema foundation**

```powershell
git add supabase/migrations supabase/tests/005_sync_foundation.test.sql
git commit -m "feat: add sync database foundation"
```

### Task 4: Add transactional sync RPCs

**Files:**
- Create: `supabase/migrations/20260808020000_sync_rpc.sql`
- Modify: `supabase/tests/005_sync_foundation.test.sql`

- [ ] **Step 1: Add failing RPC tests**

Extend the SQL test with cases that set a test JWT claim, insert one test user, and first call
`get_sync_snapshot` before any sync-state row exists. Assert that this initial snapshot succeeds with
`syncEpoch = 1` and does not create a `user_sync_state` row. Then call `apply_sync_batch` and assert:

- each supported entity upsert succeeds with `schema_version: 1` (or the omitted default of `1`);
- `schema_version: 2` and non-integer versions are rejected with stable errors and leave no business row or receipt;
- `brewLog.brewed_at` accepts a valid `Z` timestamp and a valid numeric-offset timestamp, but rejects
  `infinity`, space-separated or timezone-free values, impossible dates, and invalid timezone offsets with a stable
  `INVALID_BREWED_AT` error; every rejected operation leaves neither a business row nor a receipt;
- ownership and server fields `id`, `user_id`, `created_at`, `updated_at`, and `deleted_at` remain forbidden in payloads.

Also inspect the stored `get_sync_snapshot()` definition to enforce that `syncEpoch` and every entity collection are
constructed by one SQL statement. This catalog-level assertion is only a static contract check. A real two-session test
that races a full snapshot with a concurrent write remains a required database runtime gate; do not substitute a
single-session test or assume `dblink` is installed.

```sql
select has_function('public', 'apply_sync_batch', array['bigint', 'jsonb']);
select has_function('public', 'get_sync_snapshot', array[]::text[]);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000001",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"bean",
    "entityId":"30000000-0000-0000-0000-000000000001",
    "operation":"upsert",
    "payload":{"name":"RPC bean","flavor_tags":[],"bean_type":"single_origin","blend_components":[],"schema_version":1}
  }]'::jsonb)$$,
  'applies a bean mutation'
);

select is((select count(*) from public.beans where name = 'RPC bean'), 1::bigint, 'bean inserted once');
select lives_ok(
  $$select public.apply_sync_batch(1, '[{
    "mutationId":"10000000-0000-0000-0000-000000000001",
    "deviceId":"20000000-0000-0000-0000-000000000001",
    "entityType":"bean",
    "entityId":"30000000-0000-0000-0000-000000000001",
    "operation":"upsert",
    "payload":{"name":"must not duplicate","flavor_tags":[],"bean_type":"single_origin","blend_components":[],"schema_version":1}
  }]'::jsonb)$$,
  'duplicate mutation is acknowledged'
);
select is((select name from public.beans where id = '30000000-0000-0000-0000-000000000001'), 'RPC bean', 'duplicate does not reapply');
select throws_ok(
  $$select public.apply_sync_batch(0, '[]'::jsonb)$$,
  'P0001',
  'STALE_SYNC_EPOCH',
  'stale epoch is rejected'
);
```

- [ ] **Step 2: Run the test to verify the RPC is absent**

```powershell
supabase test db supabase/tests/005_sync_foundation.test.sql
```

Expected: FAIL on `has_function`.

- [ ] **Step 3: Implement strict mutation parsing and helper functions**

In `20260808020000_sync_rpc.sql`, define a private helper per entity and reject unknown fields before applying full-record upserts. Each helper must overwrite `user_id` with `auth.uid()` and use `clock_timestamp()` for `updated_at`. The public function signature and guards are fixed:

```sql
create or replace function public.apply_sync_batch(p_sync_epoch bigint, p_operations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_epoch bigint;
  v_operation jsonb;
  v_results jsonb := '[]'::jsonb;
  v_mutation_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if jsonb_typeof(p_operations) <> 'array' or jsonb_array_length(p_operations) > 100 then
    raise exception using errcode = '22023', message = 'INVALID_SYNC_BATCH';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  insert into public.user_sync_state(user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select sync_epoch into v_current_epoch
  from public.user_sync_state
  where user_id = v_user_id
  for update;

  if p_sync_epoch <> v_current_epoch then
    raise exception using errcode = 'P0001', message = 'STALE_SYNC_EPOCH';
  end if;

  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    v_mutation_id := (v_operation->>'mutationId')::uuid;

    if exists (
      select 1 from public.sync_mutation_receipts
      where user_id = v_user_id and mutation_id = v_mutation_id
    ) then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'mutationId', v_mutation_id,
        'status', 'duplicate'
      ));
      continue;
    end if;

    case v_operation->>'entityType'
      when 'bean' then perform public.apply_bean_sync_mutation(v_user_id, v_operation);
      when 'brewLog' then perform public.apply_brew_log_sync_mutation(v_user_id, v_operation);
      when 'brewTemplate' then perform public.apply_brew_template_sync_mutation(v_user_id, v_operation);
      when 'userSettings' then perform public.apply_user_settings_sync_mutation(v_user_id, v_operation);
      else raise exception using errcode = '22023', message = 'UNKNOWN_SYNC_ENTITY';
    end case;

    insert into public.sync_mutation_receipts(
      user_id, mutation_id, device_id, entity_type, entity_id, operation, result_summary
    ) values (
      v_user_id,
      v_mutation_id,
      (v_operation->>'deviceId')::uuid,
      v_operation->>'entityType',
      (v_operation->>'entityId')::uuid,
      v_operation->>'operation',
      jsonb_build_object('status', 'applied')
    );

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'mutationId', v_mutation_id,
      'status', 'applied'
    ));
  end loop;

  return jsonb_build_object(
    'syncEpoch', v_current_epoch,
    'serverTime', clock_timestamp(),
    'results', v_results
  );
end;
$$;
```

The four private helper functions must explicitly map every mutable column from the current row types. They must implement `delete` as `deleted_at = clock_timestamp()` and `upsert` as full replacement while preserving server-owned `created_at` for existing rows. `schema_version` remains in each entity payload allowlist as a controlled migration label: it defaults to `1`, must be a JSON integer when present, and the current RPC accepts only version `1`. Reject future versions until the corresponding server migration and compatibility path ship. Continue to reject `id`, `user_id`, `created_at`, `updated_at`, and `deleted_at`, and do not build table or column names from client strings.
Revoke public execution from the four helpers and the public batch RPC before granting only `apply_sync_batch` to `authenticated`. Because the public RPC uses definer rights, every helper must accept the already verified `v_user_id`, overwrite all payload ownership, reject cross-user relations, and never read a client-supplied user ID.

- [ ] **Step 4: Implement the complete snapshot RPC**

Add:

```sql
create or replace function public.get_sync_snapshot()
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select jsonb_build_object(
    'syncEpoch', coalesce(
      (
        select sync_epoch
        from public.user_sync_state
        where user_id = v_user_id
      ),
      1
    ),
    'serverTime', clock_timestamp(),
    'beans', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at, x.id) from public.beans x where x.user_id = v_user_id), '[]'::jsonb),
    'brewLogs', coalesce((select jsonb_agg(to_jsonb(x) order by x.brewed_at, x.id) from public.brew_logs x where x.user_id = v_user_id), '[]'::jsonb),
    'brewTemplates', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at, x.id) from public.brew_templates x where x.user_id = v_user_id), '[]'::jsonb),
    'userSettings', (select to_jsonb(x) from public.user_settings x where x.user_id = v_user_id),
    'aiRecommendations', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at, x.id) from public.ai_recommendations x where x.user_id = v_user_id), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
```

The authentication check may run first, but the epoch and all entity collections must be read by this single `select`
so they share one PostgreSQL statement snapshot. Keep the snapshot function `SECURITY INVOKER` and rely on RLS.

- [ ] **Step 5: Lock down function grants**

```sql
revoke all on function public.apply_sync_batch(bigint, jsonb) from public, anon;
revoke all on function public.get_sync_snapshot() from public, anon;
grant execute on function public.apply_sync_batch(bigint, jsonb) to authenticated;
grant execute on function public.get_sync_snapshot() to authenticated;
```

- [ ] **Step 6: Reset locally and run SQL tests**

```powershell
supabase db reset
supabase test db supabase/tests/005_sync_foundation.test.sql
```

Expected: schema, RLS, idempotency, stale epoch, and snapshot tests pass.

Database runtime release gate: run a real two-session concurrency test that overlaps `get_sync_snapshot()` with a
committed sync write and proves the returned `syncEpoch` and entity collections form one consistent MVCC snapshot.

- [ ] **Step 7: Commit RPCs**

```powershell
git add supabase/migrations/20260808020000_sync_rpc.sql supabase/tests/005_sync_foundation.test.sql
git commit -m "feat: add transactional sync RPCs"
```

### Task 5: Define client synchronization contracts

**Files:**
- Create: `app/src/lib/jsonTypes.ts`
- Create: `app/src/features/sync/syncTypes.ts`
- Create: `app/src/features/sync/syncTypes.test.ts`
- Modify: `app/src/features/beans/beanTypes.ts`
- Modify: `app/src/features/brews/brewTypes.ts`
- Modify: `app/src/features/brewTemplates/brewTemplateTypes.ts`
- Create: `app/src/features/settings/userSettingsTypes.ts`
- Modify: `app/src/features/recommendations/savedRecommendationList.ts`

- [ ] **Step 1: Write failing UUID and compile-time boundary tests**

Create `syncTypes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createEntityId, createMutationId } from './syncTypes'

describe('sync identifiers', () => {
  it('creates UUIDs for entities and mutations', () => {
    expect(createEntityId()).toMatch(/^[0-9a-f-]{36}$/)
    expect(createMutationId()).toMatch(/^[0-9a-f-]{36}$/)
  })
})
```

Also add `satisfies` fixtures for all four upserts and the three legal deletes. Use `@ts-expect-error` cases that must be checked by
`tsc -b`: settings delete, nullable payload, ownership/server fields inside upsert payloads, non-JSON `undefined`/function/symbol values,
and a server bean missing required `bean_type`, `blend_components`, or `blend_notes`. Assert wire fixtures contain exactly the six transport
fields and no Outbox metadata. The positive JSON fixtures must cover scalars, arrays, objects, and `null`.

Do not rely only on excess-property checks. Add negative cases where `{ ...beanPayload, user_id: userId }`, representative `id` / timestamp
fields, and a settings payload with `user_id` are first assigned to ordinary variables and then passed as payloads; structural width
compatibility must still reject them. Legal deletes must use `createDeletePayload()`. Prove a literal `{}`, a non-empty literal, and a non-empty
value widened to `{}` cannot be assigned to `EmptyJsonObject`; at runtime the factory result must have zero enumerable keys and stringify to `{}`.

- [ ] **Step 2: Run the focused test and verify failure**

```powershell
npm test -- syncTypes.test.ts
```

Expected: FAIL because the current broad payload and server-row types do not enforce the new boundary.

- [ ] **Step 3: Add exact shared types**

Create `jsonTypes.ts` first. These recursive types are the only general JSON types used by synchronization contracts:

```ts
export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject
export type JsonObject = { [key: string]: JsonValue }
```

Change saved recommendation object fields and the three user-settings JSON fields to `JsonObject`. Change `BrewLog.pour_steps` and both
brew payload equivalents to `JsonValue[]`. Preserve the old optional `Bean` fields for v1 backup compatibility, but add a complete
`ServerBeanRow` whose `bean_type`, `blend_components`, and `blend_notes` are required. `SyncSnapshot.beans` uses `ServerBeanRow[]`.

Create `syncTypes.ts` with discriminated local and wire contracts. `EmptyJsonObject` must reject objects with named values; runtime code still
validates that delete payload is exactly `{}`:

```ts
import type { ServerBeanRow } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import type { UserBrewTemplateRow } from '../brewTemplates/brewTemplateTypes'
import type { UserSettingsRow } from '../settings/userSettingsTypes'
import type { SavedRecommendationRow } from '../recommendations/savedRecommendationList'

export type SyncEntityType = 'bean' | 'brewLog' | 'brewTemplate' | 'userSettings'
export type SyncOperation = 'upsert' | 'delete'
export type OutboxStatus = 'pending' | 'syncing' | 'needs_attention'

type ServerOwnedFields = 'id' | 'user_id' | 'created_at' | 'updated_at' | 'deleted_at'
export type ForbiddenServerFields<Keys extends PropertyKey> = {
  readonly [Key in Keys]?: never
}

declare const deletePayloadBrand: unique symbol
export type EmptyJsonObject = {
  readonly [deletePayloadBrand]: true
  readonly [key: string]: never
}

export type BeanUpsertPayload = Omit<ServerBeanRow, ServerOwnedFields> &
  ForbiddenServerFields<ServerOwnedFields>
export type BrewLogUpsertPayload = Omit<BrewLog, ServerOwnedFields> &
  ForbiddenServerFields<ServerOwnedFields>
export type BrewTemplateUpsertPayload = Omit<UserBrewTemplateRow, ServerOwnedFields> &
  ForbiddenServerFields<ServerOwnedFields>
export type UserSettingsUpsertPayload = Omit<
  UserSettingsRow,
  'user_id' | 'created_at' | 'updated_at'
> & ForbiddenServerFields<ServerOwnedFields>

type WireBase = {
  mutationId: string
  deviceId: string
  entityId: string
}

export type SyncRpcOperation = WireBase & (
  | { entityType: 'bean'; operation: 'upsert'; payload: BeanUpsertPayload }
  | { entityType: 'bean'; operation: 'delete'; payload: EmptyJsonObject }
  | { entityType: 'brewLog'; operation: 'upsert'; payload: BrewLogUpsertPayload }
  | { entityType: 'brewLog'; operation: 'delete'; payload: EmptyJsonObject }
  | { entityType: 'brewTemplate'; operation: 'upsert'; payload: BrewTemplateUpsertPayload }
  | { entityType: 'brewTemplate'; operation: 'delete'; payload: EmptyJsonObject }
  | { entityType: 'userSettings'; operation: 'upsert'; payload: UserSettingsUpsertPayload }
)

export type SyncMutation = SyncRpcOperation & {
  userId: string
  baseSyncEpoch: number
  queuedAt: string
  attemptCount: number
  status: OutboxStatus
  lastErrorCode: string | null
  lastErrorMessage: string | null
}

export type SyncSnapshot = {
  syncEpoch: number
  serverTime: string
  beans: ServerBeanRow[]
  brewLogs: BrewLog[]
  brewTemplates: UserBrewTemplateRow[]
  userSettings: UserSettingsRow | null
  aiRecommendations: SavedRecommendationRow[]
}

export type ApplySyncResult = {
  syncEpoch: number
  serverTime: string
  results: Array<{
    mutationId: string
    status: 'applied' | 'duplicate'
  }>
}

export type SyncStorage = {
  listOutbox(userId: string): Promise<SyncMutation[]>
  acknowledgeMutations(userId: string, mutationIds: string[]): Promise<void>
  markMutationsSyncing(userId: string, mutationIds: string[]): Promise<void>
  recordRetryableFailure(userId: string, mutationIds: string[], code: string, message: string): Promise<void>
  markMutationAttention(userId: string, mutationIds: string[], code: string, message: string): Promise<void>
  markMutationPending(userId: string, mutationId: string): Promise<void>
  discardMutationAndReplaceSnapshot(userId: string, mutationId: string, snapshot: SyncSnapshot): Promise<void>
  quarantineOlderEpoch(userId: string, currentEpoch: number, code: string, message: string): Promise<void>
  replaceServerSnapshot(userId: string, snapshot: SyncSnapshot): Promise<void>
  readSyncEpoch(userId: string): Promise<number>
  writeSyncMeta(userId: string, input: { syncEpoch: number; lastSyncedAt: string }): Promise<void>
}

export type SyncState =
  | { kind: 'synced'; lastSyncedAt: string }
  | { kind: 'syncing'; pendingCount: number }
  | { kind: 'offline'; pendingCount: number }
  | { kind: 'retrying'; pendingCount: number; message: string }
  | { kind: 'needs_attention'; pendingCount: number; attentionCount: number }

export function createEntityId() {
  return crypto.randomUUID()
}

export function createMutationId() {
  return crypto.randomUUID()
}

export function createDeletePayload(): EmptyJsonObject {
  // The unique-symbol brand is compile-time only; the RPC must receive plain `{}` JSON.
  return {} as EmptyJsonObject
}
```

Add `schema_version: number` to `UserBrewTemplateRow`. Define `UserSettingsRow` with the exact columns from `public.user_settings`.
Expand `SavedRecommendationRow` to the complete cached server row: `id`, `user_id`, `bean_id`, `input_context`, `recommendation`,
`model_name`, `accepted`, `created_at`, `updated_at`, `deleted_at`, and `schema_version`. Existing cards may continue selecting a display subset from this complete type.
Template narrow enums and structured `pour_steps` describe a validated complete server row only; add a comment forbidding direct RPC casts.

- [ ] **Step 4: Run the focused test**

```powershell
npm test -- syncTypes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit contracts**

```powershell
git add app/src/lib/jsonTypes.ts app/src/features/sync app/src/features/beans/beanTypes.ts app/src/features/brews/brewTypes.ts app/src/features/settings/userSettingsTypes.ts app/src/features/brewTemplates/brewTemplateTypes.ts app/src/features/recommendations/savedRecommendationList.ts
git commit -m "fix: strengthen sync type boundaries"
```

### Task 6: Create IndexedDB v3 and atomic local writes

**Files:**
- Modify: `app/src/features/sync/syncTypes.ts`
- Create: `app/src/features/sync/syncDatabase.ts`
- Create: `app/src/features/sync/syncDatabase.test.ts`
- Create: `app/src/features/sync/localRepository.ts`
- Create: `app/src/features/sync/localRepository.test.ts`

- [ ] **Step 1: Write failing database-upgrade tests**

The tests must import `deleteTestDatabase`, open `kaday-offline-cache` v3, and assert these stores exist:

```ts
expect(Array.from(database.objectStoreNames)).toEqual([
  'aiRecommendations',
  'beans',
  'brewLogs',
  'brewTemplates',
  'migrationMeta',
  'outbox',
  'pendingMutations',
  'snapshots',
  'syncMeta',
  'userSettings',
])
```

Keep `pendingMutations` and `snapshots`; migration must not delete them yet.

- [ ] **Step 2: Verify the test fails**

```powershell
npm test -- syncDatabase.test.ts
```

Expected: FAIL because v3 stores do not exist.

- [ ] **Step 3: Implement the database opener**

`syncDatabase.ts` must export:

```ts
export const syncDatabaseName = 'kaday-offline-cache'
export const syncDatabaseVersion = 3

export const syncStoreNames = {
  beans: 'beans',
  brewLogs: 'brewLogs',
  brewTemplates: 'brewTemplates',
  userSettings: 'userSettings',
  aiRecommendations: 'aiRecommendations',
  outbox: 'outbox',
  syncMeta: 'syncMeta',
  migrationMeta: 'migrationMeta',
} as const

export function entityKey(userId: string, entityId: string) {
  return `${userId}:${entityId}`
}

export function openSyncDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(syncDatabaseName, syncDatabaseVersion)
    request.onupgradeneeded = () => {
      const database = request.result
      for (const storeName of Object.values(syncStoreNames)) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: 'key' })
        }
      }
      if (!database.objectStoreNames.contains('snapshots')) {
        database.createObjectStore('snapshots')
      }
      if (!database.objectStoreNames.contains('pendingMutations')) {
        database.createObjectStore('pendingMutations', { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
    request.onblocked = () => reject(new Error('IndexedDB open blocked'))
  })
}
```

- [ ] **Step 4: Write a failing atomicity test**

Test that `saveLocalEntity` writes both the entity and Outbox row, and that a forced Outbox failure aborts both writes. Use an injected `beforeOutboxWrite` callback in test-only options to throw inside the transaction.

- [ ] **Step 5: Implement the local repository transaction**

`localRepository.ts` must export `saveLocalEntity`, `softDeleteLocalEntity`, `listLocalEntities`, `replaceServerSnapshot`, `listOutbox`,
`acknowledgeMutations`, `markMutationsSyncing`, `recordRetryableFailure`, `markMutationAttention`, `markMutationPending`,
`discardMutationAndReplaceSnapshot`, and `quarantineOlderEpoch`. Every Outbox write method explicitly receives `userId` and verifies both the
stored envelope and key belong to that user before changing it. `saveLocalEntity` must use one readwrite transaction over the entity store and `outbox`:

```ts
const transaction = database.transaction([storeName, syncStoreNames.outbox], 'readwrite')
transaction.objectStore(storeName).put({ key: entityKey(userId, entity.id), userId, value: entity })
transaction.objectStore(syncStoreNames.outbox).put({
  key: mutation.mutationId,
  userId,
  value: mutation,
})
```

Resolve only from `transaction.oncomplete`; reject on both `onerror` and `onabort`.

`markMutationsSyncing(userId, ids)` performs one Outbox transaction that increments `attemptCount` and changes every selected current-user row
to `syncing` before the network call. `recordRetryableFailure(userId, ids, code, message)` atomically returns those rows to `pending` and records
both error fields. Tests must prove a different `userId` cannot acknowledge, retry, atomically discard/restore, quarantine, or change status for another user's
mutation, and that a forced transaction failure leaves every selected row unchanged.

Treat local IndexedDB rows as untrusted. Outbox reads classify each row as missing, foreign, valid, or corrupt-owned. Any envelope/value/key/
canonical-time inconsistency that points to the current user throws `LocalSyncDataCorruptionError` with code `LOCAL_SYNC_DATA_CORRUPT` and
aborts list, snapshot, or batch/status work. A valid foreign row remains invisible; a wholly unowned corrupt orphan does not block unrelated
users, but a target-id lookup that directly hits it must reject without mutation. Tests cover envelope owner, value owner, key/mutationId,
queuedAt, batch rollback, snapshot rollback, and non-leakage of foreign data.

Replace `discardMutation` with
`discardMutationAndReplaceSnapshot(userId, mutationId, snapshot)`. SyncManager must fetch and fully validate the server snapshot first. The
storage method then uses one transaction across all five entity stores, Outbox, and syncMeta to validate/delete the exact owned mutation,
recompute protected keys from the remaining valid Outbox, apply the snapshot, and update metadata. Missing, foreign, corrupt-owned, stale
snapshot, or injected failure rejects and rolls back everything. Tests prove the discarded overlay becomes the server row/tombstone, other
local intents remain protected, and other users are unchanged.

Both `replaceServerSnapshot` and `writeSyncMeta` read current-user syncMeta inside their write transaction before any entity delete/put. Reject
lower epochs, or an older `serverTime`/`lastSyncedAt` within the same epoch, with `STALE_LOCAL_SNAPSHOT`; allow equal/newer same-epoch writes and
higher epochs. Validate canonical finite timezone-qualified RFC 3339 timestamps. Outbox ordering compares parsed milliseconds then mutationId,
not raw strings. Tests cover equivalent offset ordering, locale-string rejection, stale snapshot/meta rollback, and higher-epoch advancement.

`openSyncDatabase` deduplicates an underlying blocked upgrade request: callers may receive `IndexedDB open blocked` immediately, but repeated
calls must not start more upgrade opens until the original request reaches real success/error and clears module state. The late success closes.
Task 9 owns complete external `SyncSnapshot` business-schema validation; only a validated snapshot may enter these storage methods. Task 6 still
validates snapshot ownership, canonical metadata, monotonicity, and every local envelope it consumes.

- [ ] **Step 6: Run storage tests**

```powershell
npm test -- syncDatabase.test.ts localRepository.test.ts
```

Expected: PASS, including the forced-abort assertion.

- [ ] **Step 7: Commit the local storage layer**

```powershell
git add app/src/features/sync/syncDatabase.ts app/src/features/sync/syncDatabase.test.ts app/src/features/sync/localRepository.ts app/src/features/sync/localRepository.test.ts
git commit -m "feat: add atomic local sync repository"
```

### Task 7: Implement Outbox compaction, ordering, and retry state

**Files:**
- Create: `app/src/features/sync/outboxModel.ts`
- Create: `app/src/features/sync/outboxModel.test.ts`

- [ ] **Step 1: Write failing compaction tests**

Cover these exact cases:

```ts
expect(compactMutations([createBean, editBean])).toEqual([expect.objectContaining({
  mutationId: editBean.mutationId,
  operation: 'upsert',
  payload: editBean.payload,
})])

expect(compactMutations([createBean, deleteBean])).toEqual([
  expect.objectContaining({ mutationId: createBean.mutationId, operation: 'upsert' }),
  expect.objectContaining({ mutationId: deleteBean.mutationId, operation: 'delete' }),
])
expect(orderMutations([brewMutation, beanMutation]).map((item) => item.entityType))
  .toEqual(['bean', 'brewLog'])
expect(nextRetryDelayMs(1)).toBe(1000)
expect(nextRetryDelayMs(8)).toBe(60000)
```

- [ ] **Step 2: Verify failure**

```powershell
npm test -- outboxModel.test.ts
```

Expected: FAIL because model functions are absent.

- [ ] **Step 3: Implement pure model functions**

Export:

```ts
export function compactMutations(mutations: SyncMutation[]): SyncMutation[]
export function orderMutations(mutations: SyncMutation[]): SyncMutation[]
export function selectSendableMutationBatch(
  mutations: SyncMutation[]
): Array<{ mutation: SyncMutation; coveredMutationIds: string[] }>
export function selectSendableMutations(mutations: SyncMutation[]): SyncMutation[]
export function nextRetryDelayMs(attemptCount: number): number
export function isRetryableSyncError(error: unknown): boolean
export function deriveSyncState(input: {
  online: boolean
  running: boolean
  mutations: SyncMutation[]
  lastSyncedAt: string | null
  retryMessage: string | null
}): SyncState
```

Compaction is deliberately conservative because `SyncMutation` has no trustworthy server-existence/provenance field. Group only by
`userId + entityType + entityId`. An `upsert → delete` chain must retain the latest complete upsert and the final delete in order; it must not
cancel them, because the entity may already exist on the server. A `delete → upsert` chain becomes the final complete upsert; multiple upserts
become the last complete upsert; multiple deletes become the last delete. Only future, validated origin metadata may allow a confirmed
never-on-server create/delete pair to cancel.

Each selected sendable mutation must expose every original mutation ID it covers. Task 9 must acknowledge a selected operation and its covered
IDs only after the whole atomic RPC succeeds and that operation has an `applied | duplicate` result; a failed batch acknowledges none. This
prevents superseded Outbox rows from reappearing on the next cycle. Treat every `syncing` mutation as an uncompressed, unselectable boundary
because it may already be in flight or applied; compact only `pending` runs between `syncing`/`needs_attention` boundaries. After acquiring the
cross-tab lock, Task 9 must recover stale `syncing` rows with the existing user-scoped `markMutationPending`, reload Outbox, and only then select
a new batch.

Compare canonical RFC 3339 timestamps without losing sub-millisecond precision and use priority `bean = 0`, `brewTemplate = 1`,
`userSettings = 1`, `brewLog = 2` only as an equal-time tie-breaker before `mutationId`. Apply true bean-to-referencing-brew dependencies and
same-entity input order as stable topological constraints over that base order: same-entity operations may not reverse, while unrelated
mutations retain time order. Cap retry delay at
60 seconds. Preserve `needs_attention` rows during compaction, never merge them with `pending`/`syncing` rows, and never send them
automatically. Export `selectSendableMutations()` as the compact + filter + order boundary so callers cannot accidentally upload attention rows.
Whenever compaction constructs or replaces a delete mutation payload, it must call `createDeletePayload()`; it must not use a literal `{}` or
reuse a legacy payload object.

- [ ] **Step 4: Run the test**

```powershell
npm test -- outboxModel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Outbox logic**

```powershell
git add app/src/features/sync/outboxModel.ts app/src/features/sync/outboxModel.test.ts
git commit -m "feat: add compacted sync outbox model"
```

### Task 8: Migrate legacy cache and pending mutations without deletion

**Files:**
- Create: `app/src/features/sync/legacyMigration.ts`
- Create: `app/src/features/sync/legacyMigration.test.ts`
- Modify: `app/src/features/offline/offlineQueue.ts`

- [ ] **Step 1: Write failing migration tests**

Seed v2 `snapshots` and `pendingMutations` with a `local-bean-123` create and a brew create referencing that ID. Assert after migration:

```ts
expect(result.status).toBe('completed')
expect(result.idMap['local-bean-123']).toMatch(/^[0-9a-f-]{36}$/)
expect(migratedBrew.bean_id).toBe(result.idMap['local-bean-123'])
expect(legacyPendingMutationCount).toBe(2)
expect(migrationMeta.sourcePreserved).toBe(true)
```

Add a forced validation failure and assert no v3 entity or Outbox rows remain while both legacy rows remain.

Treat legacy snapshots as local materialized-cache baselines, never as acknowledgement evidence. Add realistic legacy ordering tests where
the queue write happens first and the cache write follows: create then cached row, delete then missing cached row, and update then updated
cached row. All three pending writes must still be represented one-for-one in the migrated Outbox. Also cover multiple pending writes whose
send-time conservative compaction reports every source mutation through `coveredMutationIds`.

Version completion metadata with the current migration algorithm version and enforce
`counts.sourceMutations === counts.migratedMutations`. A completed record with a missing/older version or a violated count invariant must fail
with stable code `LEGACY_MIGRATION_UPGRADE_REQUIRED`, leave all v2/v3 stores and the original metadata unchanged, and direct recovery through
`exportLegacyRecoveryData`. Never clear and rerun automatically: an intermediate build was not released, but the client still cannot safely
distinguish migration-produced rows from later v3 edits. Test both compacted old counts and an old record whose counts happen to be equal.

Reject ambiguous snapshot-local IDs instead of synthesizing cloud writes. Every `local-bean-*` or `local-brew-*` row ID found in a current-user
snapshot must have a valid pending `create` for the same entity type and ID; every local bean reference in a brew snapshot must likewise have
a valid bean create chain. If proof is missing, fail the transaction with stable code `LEGACY_MIGRATION_RECOVERY_REQUIRED`, point to
`exportLegacyRecoveryData`, and leave v2, v3, and migration metadata byte-for-byte unchanged. Advance the current migration algorithm version
so an intermediate completion cannot bypass this new safety gate. Tests cover orphaned local bean rows, orphaned local brew rows/references,
and the normal proven-create path.

Require explicit legacy bean/brew `schema_version` values in snapshots and pending payloads to equal `1`; reject `2`, `999`, and every other
future version with `LEGACY_MIGRATION_RECOVERY_REQUIRED` without down-conversion or dropping unknown fields. Preserve recovery export access and
all stores on failure.

Advance the current migration algorithm to version `5` and add a non-sensitive `sourceFingerprint` over the complete semantic content of the
current-user-filtered legacy snapshots and pending rows. Use stable key serialization and stable row ordering with a sufficiently strong
deterministic digest; metadata stores only the digest, never user payload. A current-version completion must reread the legacy sources in the
same IndexedDB transaction and return idempotently only when the digest still matches. Appended/deleted rows or same-ID payload rewrites throw
stable `LEGACY_MIGRATION_SOURCE_CHANGED`, point to `exportLegacyRecoveryData`, and leave v2, v3, and metadata untouched. Never rerun or overwrite
automatically. Old v4 completions remain `LEGACY_MIGRATION_UPGRADE_REQUIRED`. Tests cover append, rewrite, delete, unchanged idempotency, and
snapshot/pending future schema versions.

- [ ] **Step 2: Verify failure**

```powershell
npm test -- legacyMigration.test.ts
```

Expected: FAIL because the migrator does not exist.

- [ ] **Step 3: Implement the migration**

`migrateLegacyOfflineData(userId, deviceId, syncEpoch)` must:

1. Accept stored completion metadata only when it has exact `migrationVersion: 5`, a valid `sourceFingerprint`, validates completely, and
   satisfies `counts.sourceMutations === counts.migratedMutations`. Missing/older versions or invariant failures throw
   `LEGACY_MIGRATION_UPGRADE_REQUIRED` without modifying any store; do not auto-clear or rerun.
2. Even when completion metadata exists, read legacy snapshots and pending rows for only `userId` in the same transaction. Validate snapshot
   `updatedAt` for audit, compute the stable filtered-source fingerprint, and return the stored result only when it matches. A mismatch throws
   `LEGACY_MIGRATION_SOURCE_CHANGED` without modifying any store.
3. Parse and validate pending rows, then require every local entity ID and local bean reference found in snapshots to have a valid pending
   `create` for the matching entity type and ID. Missing proof throws `LEGACY_MIGRATION_RECOVERY_REQUIRED` without writes; never synthesize an
   upsert for an orphaned local snapshot row. After this safety gate passes, build one stable ID map for every legacy `local-bean-*` and
   `local-brew-*` ID. Reserve every valid UUID already present in legacy entity IDs/references and existing v3 entity rows so generated entity
   IDs cannot collide. Generated mutation IDs must likewise exclude every existing Outbox key across all users and every ID generated in the
   current batch. Retry collisions only to a fixed bound; exhaustion fails and rolls back the complete transaction.
4. Rewrite entity IDs, mutation entity IDs, payload IDs, and `brewLog.bean_id`.
5. Starting from the complete snapshot row baseline, apply every valid pending mutation in canonical `createdAt` plus ID order: merge partial
   updates, reconstruct or merge creates, and apply delete tombstone/removal semantics. A complete create may rebuild a missing row; an update
   without a complete baseline must abort the whole migration, while a delete without a row remains a valid delete intent.
6. Convert every legacy `create` and `update` to `upsert`, and every `delete` to `delete`, preserving one v3 Outbox row per valid legacy pending
   row in canonical `createdAt` plus legacy ID order. Upserts carry the final complete migrated entity payload. Do not compact during migration:
   Task 7 `selectSendableMutationBatch` performs conservative send-time compaction, returns the complete `coveredMutationIds`, and allows the
   source rows to be acknowledged only after a successful server receipt. No pending row may be discarded because the snapshot is newer;
   snapshot `updatedAt` is not a cloud receipt. Send-time selection must preserve the required `upsert` then `delete` pair for a local create
   followed by delete.
7. Write v3 stores and completion metadata in one transaction.
8. Leave `snapshots` and `pendingMutations` untouched.
9. Persist and return `{ status: 'completed', migrationVersion: 5, sourceFingerprint, idMap, sourcePreserved: true }`; first-release migrations only
   write the current version.

Every converted legacy delete receives a fresh `createDeletePayload()` result after legacy payload validation; no legacy delete payload is
copied into the v3 Outbox.

Add a read-only export function for failed migration recovery:

```ts
export async function exportLegacyRecoveryData(userId: string): Promise<{
  exportedAt: string
  userId: string
  snapshots: unknown[]
  pendingMutations: unknown[]
}>
```

- [ ] **Step 4: Run migration tests**

```powershell
npm test -- legacyMigration.test.ts
```

Expected: PASS for mapping, relationship rewrite, idempotency, and rollback.

- [ ] **Step 5: Commit migration support**

```powershell
git add app/src/features/sync/legacyMigration.ts app/src/features/sync/legacyMigration.test.ts app/src/features/offline/offlineQueue.ts
git commit -m "feat: migrate legacy offline writes safely"
```

### Task 9: Add the Supabase sync adapter, lock, and manager

**Files:**
- Create: `app/src/features/sync/syncApi.ts`
- Create: `app/src/features/sync/syncApi.test.ts`
- Create: `app/src/features/sync/syncLock.ts`
- Create: `app/src/features/sync/syncLock.test.ts`
- Create: `app/src/features/sync/syncRealtime.ts`
- Create: `app/src/features/sync/syncRealtime.test.ts`
- Create: `app/src/features/sync/syncManager.ts`
- Create: `app/src/features/sync/syncManager.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Use a typed mock Supabase client and assert:

```ts
expect(rpc).toHaveBeenNthCalledWith(1, 'apply_sync_batch', {
  p_sync_epoch: 1,
  p_operations: wireOperations,
})
expect(rpc).toHaveBeenNthCalledWith(2, 'get_sync_snapshot')
```

Assert each `wireOperations` item has only `mutationId`, `deviceId`, `entityType`, `entityId`, `operation`, and `payload`; no `userId`,
`baseSyncEpoch`, queue status, attempts, timestamps, or error fields may be sent. Assert Supabase errors become `SyncApiError` with `code`,
`message`, and `retryable`. Feed malformed top-level results, malformed complete rows, invalid template enums/steps, non-JSON values, missing
required bean fields, and invalid `applied | duplicate` statuses; every case must return `INVALID_SYNC_RESPONSE` and never produce a typed result.

- [ ] **Step 2: Implement `syncApi.ts`**

Export:

```ts
export class SyncApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message)
  }
}

export function createSyncApi(supabase: SupabaseClient) {
  return {
    applyBatch(syncEpoch: number, operations: SyncRpcOperation[]): Promise<ApplySyncResult>,
    getSnapshot(): Promise<SyncSnapshot>,
  }
}
```

Export `toSyncRpcOperation(mutation: SyncMutation): SyncRpcOperation` and explicitly construct the six wire fields; never spread an Outbox row.
For each entity/operation branch, validate the outgoing payload against that entity's complete mutable-field allowlist and rebuild a fresh payload
object field by field. Upserts reject missing, unknown, ownership, primary-key, server timestamp, and soft-delete keys while retaining the allowed
`schema_version`; they must not return the original payload reference. Deletes require a plain record with `Object.keys(payload).length === 0`,
then emit a new plain `{}` wire value—the local unique-symbol brand is compile-time-only and never enters JSON. Thus the outgoing mapper remains
a runtime safety boundary even if untyped storage, migration data, or JavaScript callers bypass TypeScript.

Treat both RPC `data` values as `unknown`. Add recursive JSON validation plus complete validators for every snapshot row, timestamps, numbers,
nullability, template enums/steps, and result enums before returning `ApplySyncResult` or `SyncSnapshot`. The database intentionally remains able
to store general JSON and unconstrained template text in this task; the validator is the trust boundary and direct casts are forbidden.

- [ ] **Step 3: Write and implement lock tests**

Test that a second lease owner cannot enter before expiry and can enter after expiry. `withSyncLock(userId, action)` uses `navigator.locks.request` when available; otherwise store `{ ownerId, expiresAt }` under `syncMeta` key `lock:${userId}` with a 30-second lease renewed every 10 seconds.

- [ ] **Step 4: Write failing manager tests**

Cover one full cycle, response loss retry, snapshot failure, validation failure isolation, stale epoch quarantine, offline trigger, and concurrent `run()` calls. The full-cycle expectation is:

```ts
expect(api.applyBatch).toHaveBeenCalledTimes(1)
expect(storage.markMutationsSyncing).toHaveBeenCalledWith('user-1', ['mutation-1'])
expect(api.applyBatch).toHaveBeenCalledWith(1, [expectedWireOperation])
expect(api.getSnapshot).toHaveBeenCalledTimes(1)
expect(storage.acknowledgeMutations).toHaveBeenCalledWith('user-1', ['mutation-1'])
expect(storage.replaceServerSnapshot).toHaveBeenCalledWith('user-1', snapshot)
expect(manager.getState().kind).toBe('synced')
```

- [ ] **Step 5: Implement Realtime as a wake-up signal**

`subscribeToSyncWakeups(supabase, userId, wake)` creates one channel and registers `postgres_changes` handlers for `beans`,
`brew_logs`, `brew_templates`, `user_settings`, and `ai_recommendations`, filtered to `user_id=eq.${userId}`. Every handler calls a debounced
`wake`; it never applies payload rows directly. The returned cleanup function removes the channel. Tests use a chainable fake channel and
assert all five handlers share the current-user filter.

- [ ] **Step 6: Implement `SyncManager`**

Constructor dependencies must be explicit:

```ts
export type SyncManagerDependencies = {
  userId: string
  deviceId: string
  api: ReturnType<typeof createSyncApi>
  storage: SyncStorage
  lock: typeof withSyncLock
  now: () => Date
  online: () => boolean
  schedule: (callback: () => void, delayMs: number) => number
  cancelSchedule: (id: number) => void
}
```

Expose `start`, `stop`, `run`, `retryMutation`, `discardMutation`, `subscribe`, and `getState`. `start` registers online and visibility listeners,
a 60-second foreground interval, and `subscribeToSyncWakeups`. `run` must pull even when Outbox is empty, never acknowledge before RPC
confirmation, pull after push, and quarantine all old-epoch mutations on `STALE_SYNC_EPOCH` before pulling. Before upload it calls
`markMutationsSyncing(userId, ids)`, maps each mutation with `toSyncRpcOperation`, and on retryable failure calls
`recordRetryableFailure(userId, ids, code, message)`. Retry/discard/attention paths pass `userId` to storage.

Capture a generation token for each start/user session and re-check it after every awaited API/storage operation; callbacks from a stopped or
replaced user session must return without any later storage write or state publication. A malformed apply response leaves mutations unacknowledged.
A malformed snapshot never calls `replaceServerSnapshot`; `INVALID_SYNC_RESPONSE` is a non-retryable safety error that publishes global
`needs_attention` without overwriting the last valid cache. If apply validation already succeeded before snapshot validation failed, only those
validated confirmations may be acknowledged. Add manager tests for both stale-user callback suppression and malformed-response cache preservation.

`discardMutation` first awaits `api.getSnapshot()` and therefore receives only the same fully validated `SyncSnapshot` used by normal pulls.
After re-checking the active generation it calls
`storage.discardMutationAndReplaceSnapshot(userId, mutationId, snapshot)` exactly once. It must never call a legacy delete-only method.
`LOCAL_SYNC_DATA_CORRUPT` and `STALE_LOCAL_SNAPSHOT` stop the cycle and publish `needs_attention` without acknowledging, deleting, or replacing
other local data. Normal snapshot installation can still use `replaceServerSnapshot` after RPC validation; the local repository remains the
second trust boundary for IndexedDB envelope corruption and monotonic metadata.

- [ ] **Step 7: Run focused sync tests**

```powershell
npm test -- syncApi.test.ts syncLock.test.ts syncRealtime.test.ts syncManager.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the manager**

```powershell
git add app/src/features/sync/syncApi.ts app/src/features/sync/syncApi.test.ts app/src/features/sync/syncLock.ts app/src/features/sync/syncLock.test.ts app/src/features/sync/syncRealtime.ts app/src/features/sync/syncRealtime.test.ts app/src/features/sync/syncManager.ts app/src/features/sync/syncManager.test.ts
git commit -m "feat: add unified sync manager"
```

### Task 10: Add feature repositories

**Files:**
- Create: `app/src/features/beans/beanRepository.ts`
- Create: `app/src/features/beans/beanRepository.test.ts`
- Create: `app/src/features/brews/brewLogRepository.ts`
- Create: `app/src/features/brews/brewLogRepository.test.ts`
- Create: `app/src/features/brewTemplates/brewTemplateRepository.ts`
- Create: `app/src/features/brewTemplates/brewTemplateRepository.test.ts`
- Create: `app/src/features/settings/userSettingsRepository.ts`
- Create: `app/src/features/settings/userSettingsRepository.test.ts`
- Create: `app/src/features/recommendations/recommendationRepository.ts`
- Create: `app/src/features/recommendations/recommendationRepository.test.ts`

- [ ] **Step 1: Write repository behavior tests**

For each editable entity assert list, create, update, and soft delete operate locally and enqueue exactly one full-record mutation. Bean creation must use a permanent UUID before local save. Brew creation must preserve a newly created bean UUID. Settings must use `userId` as its stable entity ID. Saved recommendations expose local list only and no offline write method.
Every bean, brew-log, and template soft-delete repository path calls `createDeletePayload()`; settings has no delete path. Tests assert the stored
delete payload has zero enumerable keys and is not assembled from caller input.

- [ ] **Step 2: Verify repository tests fail**

```powershell
npm test -- beanRepository.test.ts brewLogRepository.test.ts brewTemplateRepository.test.ts userSettingsRepository.test.ts recommendationRepository.test.ts
```

Expected: FAIL because repositories are absent.

- [ ] **Step 3: Implement the repositories with one shared dependency shape**

Each editable repository receives:

```ts
export type RepositoryContext = {
  userId: string
  deviceId: string
  getSyncEpoch: () => Promise<number>
  now: () => Date
}
```

Repository methods never call Supabase. `createBean` constructs a complete `Bean` row with UUID, server-compatible field names, `created_at` and provisional `updated_at`, then calls `saveLocalEntity`. Server snapshots later replace provisional timestamps.

- [ ] **Step 4: Run repository tests**

```powershell
npm test -- beanRepository.test.ts brewLogRepository.test.ts brewTemplateRepository.test.ts userSettingsRepository.test.ts recommendationRepository.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit repositories**

```powershell
git add app/src/features/beans/beanRepository.ts app/src/features/beans/beanRepository.test.ts app/src/features/brews/brewLogRepository.ts app/src/features/brews/brewLogRepository.test.ts app/src/features/brewTemplates/brewTemplateRepository.ts app/src/features/brewTemplates/brewTemplateRepository.test.ts app/src/features/settings app/src/features/recommendations/recommendationRepository.ts app/src/features/recommendations/recommendationRepository.test.ts
git commit -m "feat: add offline-first coffee repositories"
```

### Task 11: Provide one authenticated sync runtime and status UI

**Files:**
- Create: `app/src/features/sync/SyncContext.tsx`
- Create: `app/src/features/sync/syncStatusModel.ts`
- Create: `app/src/features/sync/syncStatusModel.test.ts`
- Create: `app/src/features/sync/SyncStatusBanner.tsx`
- Create: `app/src/features/sync/syncStatus.css`
- Modify: `app/src/features/auth/AuthPanel.tsx`
- Modify: `app/src/features/home/homeOverviewModel.ts`
- Modify: `app/src/features/home/homeOverviewModel.test.ts`
- Modify: `app/src/features/home/HomeOverview.tsx`
- Modify: `app/src/pwa/OnlineStatus.tsx`

- [ ] **Step 1: Write failing status-label tests**

Add pure mapping tests in `syncStatusModel.test.ts`:

```ts
expect(toSyncStatusView({ kind: 'offline', pendingCount: 2 })).toEqual({
  tone: 'warning',
  title: '离线，2 条修改待同步',
  canRetry: false,
})
expect(toSyncStatusView({ kind: 'needs_attention', pendingCount: 1, attentionCount: 1 })).toEqual({
  tone: 'danger',
  title: '1 条数据需要处理',
  canRetry: true,
})
```

- [ ] **Step 2: Implement provider lifecycle**

Create `syncStatusModel.ts` and export `toSyncStatusView(state: SyncState)` with exact mappings asserted above.

`SyncProvider` receives `session` and `supabase`, loads or creates one non-sensitive `deviceId`, runs legacy migration, constructs one manager,
starts it, and stops it on user/session change. Export `useSyncRuntime()` returning repositories, state, `run`, `pendingCount`,
`attentionItems`, and `statusByEntityId`. Each entity status is `synced`, `pending`, or `needs_attention`.

- [ ] **Step 3: Wrap authenticated views**

In `AuthPanel.tsx`, wrap the authenticated app layout with:

```tsx
<SyncProvider session={session} supabase={supabase}>
  <AuthenticatedApp
    activeView={activeView}
    onNavigate={setActiveView}
    onSignOut={handleSignOut}
  />
</SyncProvider>
```

Move the authenticated view switch into the focused `AuthenticatedApp` component in the same file during this task. Preview modes remain outside the provider and continue using their fixture rows.

- [ ] **Step 4: Replace network-only labels**

`HomeOverview` and `OnlineStatus` must consume `SyncState`. Keep network state as secondary text for AI/source availability, but never render “云同步在线” solely from `navigator.onLine`.

`SyncStatusBanner` lists attention items with the server error message and buttons wired to `retryMutation` and `discardMutation`. Discard must
reload and validate the current server snapshot, then use the single atomic storage operation that deletes the selected mutation, reapplies the
snapshot with remaining overlays protected, and updates meta. The UI must not report success before that transaction completes. Pending items
remain non-destructive and show their count.

- [ ] **Step 5: Add sign-out protection**

Before `supabase.auth.signOut()`, inspect `pendingCount` and `attentionItems`. If either is nonzero, show a confirmation dialog whose exact message is:

```text
还有本地修改尚未同步。退出后这些修改仍保留在本机，但切换账号时不会上传。确认退出吗？
```

- [ ] **Step 6: Run model and full tests**

```powershell
npm test -- syncStatusModel.test.ts homeOverviewModel.test.ts
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit the runtime shell**

```powershell
git add app/src/features/sync/SyncContext.tsx app/src/features/sync/syncStatusModel.ts app/src/features/sync/syncStatusModel.test.ts app/src/features/sync/SyncStatusBanner.tsx app/src/features/sync/syncStatus.css app/src/features/auth/AuthPanel.tsx app/src/features/home app/src/pwa/OnlineStatus.tsx
git commit -m "feat: expose global sync state"
```

### Task 12: Move beans and brews onto repositories

**Files:**
- Modify: `app/src/features/beans/BeanDashboard.tsx`
- Modify: `app/src/features/brews/BrewLogPanel.tsx`
- Modify: `app/src/features/beans/beanForm.test.ts`
- Modify: `app/src/features/brews/brewForm.test.ts`
- Delete after migration verification: `app/src/features/beans/beanService.ts`
- Delete after migration verification: `app/src/features/brews/brewLogService.ts`

- [ ] **Step 1: Add regression tests for permanent local relationships**

Add a test that creates a bean offline, creates a brew referencing it, edits both, and asserts the final Outbox contains one bean `upsert` followed by one brew `upsert` with the same UUID in `bean_id`.

- [ ] **Step 2: Remove page-owned synchronization callbacks**

In both panels remove imports from `offlineCache`, `offlineQueue`, and direct CRUD services. Delete `syncPendingBeanMutations`, `syncPendingBrewLogMutations`, `mergeIntoPendingCreate`, local temporary ID builders, and online-event sync effects.

- [ ] **Step 3: Replace handlers with repository calls**

Use:

```ts
const { beans, brewLogs, sync } = useSyncRuntime()
```

List data from local repository subscriptions. Submit and delete handlers await repository writes, update UI from the subscribed local state, then call `void sync.run()` as a best-effort online acceleration. A failed network sync must not make the local save fail.

- [ ] **Step 4: Verify bean detail reads shared brew state**

Remove the second direct brew fetch inside `BeanDashboard`; filter the shared `brewLogs` repository list by `bean_id`.

Render a compact `待同步` badge on bean and brew cards whose IDs map to `pending`, and `需要处理` for `needs_attention`. These badges must
derive from `statusByEntityId`; do not infer status from network availability.

- [ ] **Step 5: Run focused and full tests**

```powershell
npm test -- beanRepository.test.ts brewLogRepository.test.ts beanForm.test.ts brewForm.test.ts
npm test
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit entity migration**

```powershell
git add app/src/features/beans app/src/features/brews
git commit -m "refactor: route beans and brews through sync core"
```

### Task 13: Move templates, settings, and recommendation reads

**Files:**
- Modify: `app/src/features/brewTemplates/BrewTemplatePanel.tsx`
- Modify: `app/src/features/recommendations/RecommendationPanel.tsx`
- Modify: `app/src/features/recommendations/recommendationService.ts`
- Create: `app/src/features/settings/userSettingsModel.ts`
- Create: `app/src/features/settings/userSettingsModel.test.ts`
- Create: `app/src/features/settings/UserSettingsPanel.tsx`
- Create: `app/src/features/settings/settings.css`
- Modify: `app/src/features/auth/AuthPanel.tsx`
- Modify: `app/src/features/backup/backupReminder.ts`
- Modify: `app/src/features/backup/backupReminder.test.ts`

- [ ] **Step 1: Write settings normalization tests**

Test defaults and range validation:

```ts
expect(normalizeUserSettings(null, 'user-1')).toMatchObject({
  user_id: 'user-1',
  preferred_units: {},
  default_gear: {},
  taste_preferences: {},
  backup_reminder_days: 7,
  schema_version: 1,
})
expect(parseBackupReminderDays('0')).toEqual({ ok: false, message: '备份提醒天数必须在 1 到 365 之间' })
```

- [ ] **Step 2: Migrate templates to the repository**

Remove direct CRUD calls from `BrewTemplatePanel`. System templates remain compile-time read-only data; only user templates flow through `brewTemplateRepository` and Outbox.

- [ ] **Step 3: Add the settings panel**

The first settings UI edits `backup_reminder_days`, `preferred_units`, `default_gear`, and `taste_preferences` as focused fields. Save through `userSettingsRepository`; offline save succeeds locally. Add a settings navigation item in `AuthPanel`.

- [ ] **Step 4: Cache and read saved recommendations offline**

`RecommendationPanel` reads saved recommendations from `recommendationRepository`. AI generation and source parsing retain their online Supabase Edge Function calls. Updating accepted state and deleting a saved recommendation remain online-only in this phase; disable those controls offline with explanatory text.

Refactor `loadRuleRecommendationData` so its bean, brew, and user-template inputs come from `useSyncRuntime()` repositories rather than
`beanService`, `brewLogService`, or `brewTemplateService`. Keep `recommendationService.ts` focused on the online Edge Function call and
online saved-recommendation mutations, then call `sync.run()` after a successful online mutation to refresh the local recommendation cache.

- [ ] **Step 5: Use cloud settings for reminder calculation**

Refactor `buildBackupReminder` to accept `backupReminderDays` explicitly. Remove the `localStorage` reminder metadata write path only after Plan 2 adds server export metadata; until then keep reading old metadata as a display fallback and mark it deprecated.

- [ ] **Step 6: Run tests and build**

```powershell
npm test -- brewTemplateModel.test.ts recommendationRepository.test.ts userSettingsModel.test.ts backupReminder.test.ts
npm test
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit remaining feature migration**

```powershell
git add app/src/features/brewTemplates app/src/features/recommendations app/src/features/settings app/src/features/auth/AuthPanel.tsx app/src/features/backup/backupReminder.ts app/src/features/backup/backupReminder.test.ts
git commit -m "feat: sync templates settings and recommendation cache"
```

### Task 14: Remove obsolete runtime paths only after migration coverage

**Files:**
- Delete: `app/src/features/offline/offlineCache.ts`
- Delete: `app/src/features/offline/offlineCache.test.ts`
- Delete: `app/src/features/offline/offlineQueue.ts`
- Delete: `app/src/features/offline/offlineQueue.test.ts`
- Delete if no imports remain: `app/src/features/beans/beanService.ts`
- Delete if no imports remain: `app/src/features/brews/brewLogService.ts`
- Delete if no imports remain: `app/src/features/brewTemplates/brewTemplateService.ts`
- Modify: `app/src/features/sync/legacyMigration.ts`

- [ ] **Step 1: Prove old modules are no longer runtime dependencies**

```powershell
rg -n "offlineCache|offlineQueue|beanService|brewLogService|brewTemplateService" app/src --glob '!**/*.test.ts'
```

Expected: only `legacyMigration.ts` references the legacy IndexedDB store names; no page imports old modules.

- [ ] **Step 2: Preserve raw migration readers before deletion**

Move the minimal legacy row types and raw `snapshots`/`pendingMutations` readers into `legacyMigration.ts`. Do not call functions from the modules being deleted.

- [ ] **Step 3: Delete obsolete modules**

Delete only the files listed above whose imports are zero. Keep the physical legacy IndexedDB stores for at least one stable release; this task removes source modules, not user data.

- [ ] **Step 4: Run the entire quality gate**

```powershell
npm test
npm run lint
npm run build
```

Expected: all tests pass; lint and build exit 0.

- [ ] **Step 5: Commit cleanup**

```powershell
git add -A app/src/features
git commit -m "refactor: remove page-owned sync paths"
```

### Task 15: Review the local foundation before any live database write

**Files:**
- Modify: `docs/operations/data-safety-preflight.md`

- [ ] **Step 1: Run all local checks**

```powershell
supabase db reset
supabase test db supabase/tests/005_sync_foundation.test.sql
Set-Location app
npm test
npm run lint
npm run build
# Run the real Chromium IndexedDB smoke suite and record the browser version.
```

Expected: SQL tests, Vitest, lint, build, and the real Chromium IndexedDB smoke suite all pass. The smoke suite must cover v2-to-v3 upgrade,
legacy schema-version recovery rejection, completed-source fingerprint change rejection, blocked open deduplication/late close,
entity-plus-Outbox abort, and snapshot-plus-meta abort. fake-indexeddb passing alone is not a release gate. Chromium remains a Task 15 release
gate and is not required by the focused Task 8 implementation loop.

- [ ] **Step 2: Record verification evidence**

Append a dated checklist to `docs/operations/data-safety-preflight.md` containing command names, pass/fail result, migration filenames, and the commit hash under review. Do not record user row contents.

- [ ] **Step 3: Stop for production approval**

Do not run `supabase db push`, SQL Editor migrations, or deploy a function in this task. Present the preflight results, local test evidence,
generated migrations, and rollback procedure to the user. Because the three baseline files represent SQL already applied outside migration history,
the production procedure must mark those baseline versions as applied with `supabase migration repair --status applied` before pushing only the
2026-08-08 migrations. Request explicit authorization for the linked production Supabase project.

- [ ] **Step 4: Commit local verification documentation**

```powershell
git add docs/operations/data-safety-preflight.md
git commit -m "docs: record sync foundation verification"
```
