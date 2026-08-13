# Coffee Security Hardening and Production Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden server-side source and AI requests, prove multi-device behavior in browsers and SQL, and deploy the data-safety redesign to the existing Supabase project with explicit backups, feature flags, and rollback checkpoints.

**Architecture:** Shared Edge Function guards authenticate the current user, enforce a database-backed rate limit, reject URL-fetch input, bound pasted-text requests, and redact logs. Playwright exercises two browser contexts and offline transitions against a local Supabase stack. Production rollout is expand-first: audit and backup, apply additive SQL, deploy a pilot client, migrate one desktop/phone pair, then enable and monitor before removing any legacy storage.

**Tech Stack:** Supabase Edge Functions on the Deno-compatible Edge Runtime, Deno test, Supabase CLI, Postgres, React/Vite, Playwright, GitHub Actions, GitHub Pages.

---

## File map

**Edge security**

- Create `supabase/functions/_shared/auth.ts` and `auth.test.ts`.
- Create `supabase/functions/_shared/rateLimit.ts` and `rateLimit.test.ts`.
- Delete the retired `supabase/functions/_shared/safeFetch.ts` and `safeFetch.test.ts`.
- Create `supabase/migrations/20260808040000_edge_rate_limit.sql` and SQL test.
- Modify `supabase/functions/import-source/index.ts`.
- Modify `supabase/functions/recommend-brew/index.ts`.

**Release tests and operations**

- Create `app/playwright.config.ts`.
- Create `app/e2e/sync-multi-device.spec.ts`.
- Create `app/e2e/backup-restore.spec.ts`.
- Create `app/src/features/sync/syncFeatureFlag.ts` and test.
- Modify `.github/workflows/deploy-pages.yml`.
- Create `.github/workflows/data-safety-checks.yml`.
- Create `docs/operations/data-safety-rollout.md`.
- Create `docs/operations/data-safety-rollback.md`.

### Task 1: Add authenticated per-user Edge Function rate limiting

**Files:**
- Create: `supabase/migrations/20260808040000_edge_rate_limit.sql`
- Create: `supabase/tests/008_edge_rate_limit.test.sql`
- Create: `supabase/functions/_shared/auth.ts`
- Create: `supabase/functions/_shared/rateLimit.ts`

- [ ] **Step 1: Write failing SQL tests**

Assert `consume_edge_rate_limit(text, integer, integer)` accepts the first N calls for a user/window, rejects N+1, isolates users and actions, and cannot be executed by `anon`.

- [ ] **Step 2: Implement the rate-limit table and RPC**

Create an unexposed table keyed by `(user_id, action, window_started_at)`. The RPC derives `auth.uid()`, locks or inserts the current bucket, increments atomically, and returns:

```json
{
  "allowed": true,
  "remaining": 9,
  "retryAfterSeconds": 0
}
```

Validate `p_action` against `import-source` and `recommend-brew`, limit max requests to 1 through 100, and window seconds to 10 through 3600. Revoke table access from `anon` and `authenticated`; expose only the authenticated RPC.

- [ ] **Step 3: Implement bearer-token user verification**

`auth.ts` exports `requireUser(request)` and constructs a Supabase client with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and the incoming `Authorization` header. It calls `auth.getUser()` and returns the verified user or a 401 JSON response. Do not trust a user ID in the request body.

- [ ] **Step 4: Implement the Edge rate-limit adapter**

`rateLimit.ts` calls `consume_edge_rate_limit` through the verified user's client. Fixed policies:

```ts
export const edgeRatePolicies = {
  'import-source': { maxRequests: 10, windowSeconds: 600 },
  'recommend-brew': { maxRequests: 20, windowSeconds: 600 },
} as const
```

Return a 429 response with `Retry-After` when denied.

- [ ] **Step 5: Run local SQL and Deno tests**

```powershell
supabase test db supabase/tests/008_edge_rate_limit.test.sql
deno test supabase/functions/_shared/auth.test.ts supabase/functions/_shared/rateLimit.test.ts --allow-env
```

Expected: all tests pass.

- [ ] **Step 6: Commit rate limiting**

```powershell
git add supabase/migrations/20260808040000_edge_rate_limit.sql supabase/tests/008_edge_rate_limit.test.sql supabase/functions/_shared
git commit -m "feat: rate limit authenticated edge calls"
```

### Task 2: Remove URL fetching and bound pasted-text source parsing

**Files:**
- Delete: `supabase/functions/_shared/safeFetch.ts`
- Delete: `supabase/functions/_shared/safeFetch.test.ts`
- Modify: `supabase/functions/import-source/index.ts`
- Modify: `app/src/features/sourceImports/*`

- [ ] **Step 1: Write failing no-fetch and request-bound tests**

Cover stable 400 rejection when a forged `url` field is present and prove no external fetch dependency is reachable. Cover authentication, rate limiting, a 64 KiB actual streamed body limit before JSON parsing, invalid JSON, and one valid pasted-text request whose normalized model prompt is capped at 12,000 characters.

- [ ] **Step 2: Remove all URL fetching code**

Delete `safeFetch` and every source-page networking branch. The production source-import path must have no page-fetch implementation to bypass.

- [ ] **Step 3: Enforce pasted-text-only input**

Reject any payload containing a `url` field with stable 400 `SOURCE_URL_NOT_SUPPORTED`, even when pasted text is also present. Accept only pasted/OCR text for this handler.

- [ ] **Step 4: Bound inbound and model text**

Reject declared or actual request bodies over 65,536 bytes before JSON parsing, then normalize pasted text and cap the text sent to the model at 12,000 characters.

- [ ] **Step 5: Preserve auth and rate limiting**

At the top of the handler, require a verified user and consume the `import-source` rate limit before reading the body. Preserve pasted-text parsing and stable client errors.

- [ ] **Step 6: Run Deno tests and local function smoke test**

```powershell
deno test supabase/functions/import-source/index.test.ts --allow-env
supabase functions serve import-source --env-file supabase/.env.local
```

Expected: tests pass; unauthenticated curl receives 401; any URL field receives 400 without an outbound request; authenticated pasted text reaches the existing parse flow.

- [ ] **Step 7: Commit safe fetching**

```powershell
git add -A supabase/functions/_shared/safeFetch.ts supabase/functions/_shared/safeFetch.test.ts supabase/functions/import-source app/src/features/sourceImports
git commit -m "refactor: retire URL source imports"
```

### Task 3: Bound and authenticate AI recommendation calls

**Files:**
- Modify: `supabase/functions/recommend-brew/index.ts`
- Create: `supabase/functions/recommend-brew/index.test.ts`

- [ ] **Step 1: Write failing handler tests**

Inject a fetch implementation and assert unauthenticated calls return 401, rate-limited calls return 429, bodies over 256 KB return 413, invalid shapes return 400, DeepSeek aborts after 30 seconds, and error responses do not expose bearer tokens, prompt contents, or upstream response bodies.

- [ ] **Step 2: Integrate shared auth and rate limit**

Call `requireUser` and `consumeRateLimit('recommend-brew')` before parsing the recommendation payload.

- [ ] **Step 3: Add request and upstream bounds**

Reject `Content-Length` above 262,144 bytes and cap actual bytes while reading. Validate required `targetBean` and array fields. Use an AbortController with 30 seconds for DeepSeek. Limit saved raw AI text returned to the existing structured parser to 50,000 characters.

- [ ] **Step 4: Redact errors**

Return stable client error codes such as `AI_TIMEOUT`, `AI_UPSTREAM_ERROR`, and `INVALID_RECOMMENDATION_INPUT`. Server logs may include request ID, status, elapsed milliseconds, and user UUID hash; never log authorization, full prompt, source text, or upstream body.

- [ ] **Step 5: Run Deno tests and commit**

```powershell
deno test supabase/functions/recommend-brew/index.test.ts --allow-env
git add supabase/functions/recommend-brew
git commit -m "fix: harden AI recommendation requests"
```

### Task 4: Add a disabled-by-default sync feature flag and protection mode

**Files:**
- Create: `app/src/features/sync/syncFeatureFlag.ts`
- Create: `app/src/features/sync/syncFeatureFlag.test.ts`
- Modify: `app/src/features/sync/SyncContext.tsx`
- Modify: `app/src/features/sync/SyncStatusBanner.tsx`
- Modify: `app/src/features/sync/syncTypes.ts`

- [ ] **Step 1: Write failing flag tests**

```ts
expect(resolveSyncRolloutMode({ buildValue: undefined, localOverride: null })).toBe('protection')
expect(resolveSyncRolloutMode({ buildValue: 'pilot', localOverride: null })).toBe('protection')
expect(resolveSyncRolloutMode({ buildValue: 'pilot', localOverride: 'true' })).toBe('enabled')
expect(resolveSyncRolloutMode({ buildValue: 'enabled', localOverride: null })).toBe('enabled')
expect(resolveSyncRolloutMode({ buildValue: 'protection', localOverride: 'true' })).toBe('protection')
```

Protection mode always wins and cannot be overridden locally.

- [ ] **Step 2: Implement three rollout modes**

```ts
export type SyncBuildRolloutMode = 'pilot' | 'enabled' | 'protection'
export type EffectiveSyncMode = 'enabled' | 'protection'
```

Read `VITE_SYNC_ROLLOUT_MODE`. `pilot` enables SyncManager only when localStorage key `kaday:sync-pilot-enabled` is exactly `true`;
every other device receives protection behavior. This key is consulted only by a `pilot` build and is ignored by `enabled` and `protection` builds.
`resolveSyncRolloutMode` returns `EffectiveSyncMode`.
`enabled` starts SyncManager for all users. `protection` permits cached reads and exports but disables repository writes and uploads.
Missing or invalid build values resolve to `protection`.

- [ ] **Step 3: Prevent ambiguous UI state**

Add `protection` to `SyncState`. The banner text is:

```text
同步写入已暂停。现有本地和云端数据仍可查看与导出，请等待恢复通知。
```

It must never display “已同步”.

- [ ] **Step 4: Run tests and commit**

```powershell
npm test -- syncFeatureFlag.test.ts
npm run lint
npm run build
git add app/src/features/sync
git commit -m "feat: add sync rollout protection mode"
```

### Task 5: Add multi-device and restore browser tests

**Files:**
- Modify: `app/package.json`
- Modify: `app/package-lock.json`
- Create: `app/playwright.config.ts`
- Create: `app/e2e/fixtures/auth.ts`
- Create: `app/e2e/sync-multi-device.spec.ts`
- Create: `app/e2e/backup-restore.spec.ts`

- [ ] **Step 1: Install Playwright and browser**

Run from `app`:

```powershell
npm install --save-dev @playwright/test
npx playwright install chromium
```

Add scripts:

```json
{
  "test:e2e": "playwright test",
  "test:e2e:headed": "playwright test --headed"
}
```

- [ ] **Step 2: Configure the local PWA server**

`playwright.config.ts` uses Chromium, base URL `http://127.0.0.1:4173/coffee-pwa/`, a mobile project at 360x800, a desktop project at 1280x900, and `npm run build && npm run preview -- --host 127.0.0.1` as the web server.

- [ ] **Step 3: Add authenticated local test fixtures**

Create one Supabase test user per worker through the local Auth API, store no production credentials, and delete test data after each spec. The fixture must fail fast if the configured Supabase URL is not localhost or `127.0.0.1`.

- [ ] **Step 4: Implement multi-device scenarios**

Use two browser contexts for desktop and phone. Cover:

1. desktop creates a bean; phone receives/pulls it;
2. phone goes offline and creates a brew linked to that bean;
3. desktop edits the bean and syncs;
4. phone reconnects and syncs its brew;
5. both contexts show zero pending items;
6. two tabs trigger sync but one RPC batch occurs;
7. the same mutation retry does not duplicate data.

- [ ] **Step 5: Implement backup and rollback scenarios**

Cover v2 download, v1 safe-merge-only UI, checksum rejection, safe merge not overwriting current data, full rollback requiring a pre-restore download and exact confirmation, epoch increment, and stale phone Outbox becoming “需要处理” rather than automatically uploading.

- [ ] **Step 6: Run E2E locally**

```powershell
npm run test:e2e
```

Expected: desktop and mobile Chromium projects pass against the local Supabase stack.

- [ ] **Step 7: Commit browser tests**

```powershell
git add app/package.json app/package-lock.json app/playwright.config.ts app/e2e
git commit -m "test: cover multi-device sync and restore"
```

### Task 6: Add release CI without using production secrets

**Files:**
- Create: `.github/workflows/data-safety-checks.yml`
- Modify: `.github/workflows/deploy-pages.yml`

- [ ] **Step 1: Add unit-quality workflow gates**

`data-safety-checks.yml` runs on pull requests and pushes to `foundation`. It installs Node, runs `npm ci`, `npm test`, `npm run lint`, and `npm run build` with non-secret placeholder Vite values valid only for compilation.

- [ ] **Step 2: Add local Supabase SQL tests**

Use `supabase/setup-cli@v2` with CLI version `2.101.0`, start the local stack, reset migrations, and run all files in `supabase/tests`.
Do not link the production project in CI.

- [ ] **Step 3: Add Edge Function tests**

Install Deno through the official setup action and run shared and function `deno test` commands with only test environment values.

- [ ] **Step 4: Gate Pages deployment**

Make the deploy job depend on the unit-quality job. Do not deploy when tests or lint fail. Keep the currently deployed old frontend untouched
until the production database migration is approved. The first deployment of the new frontend uses `VITE_SYNC_ROLLOUT_MODE=pilot`.

- [ ] **Step 5: Validate workflow syntax and commit**

```powershell
git diff --check
git add .github/workflows
git commit -m "ci: gate data safety rollout"
```

### Task 7: Write exact production rollout and rollback runbooks

**Files:**
- Create: `docs/operations/data-safety-rollout.md`
- Create: `docs/operations/data-safety-rollback.md`
- Modify: `docs/operations/data-safety-preflight.md`

- [ ] **Step 1: Write the rollout checklist**

The runbook must list exact order and evidence fields:

1. record current production commit and Supabase project ref;
2. run read-only preflight and store counts privately;
3. export a verified production backup;
4. mark the three reviewed baseline migrations as already applied in production migration history;
5. apply `20260808010000_sync_foundation.sql`, then `20260808020000_sync_rpc.sql`,
   `20260808030000_backup_v2_rpc.sql`, and `20260808040000_edge_rate_limit.sql`;
6. schedule `purge_expired_sync_mutation_receipts()` once per day through Supabase Cron;
7. validate constraints only after anomaly count is zero;
8. run authenticated smoke tests for RLS, snapshot, duplicate mutation, backup export, preview, and rate limit;
9. deploy Edge Functions;
10. deploy the new frontend in `pilot` mode;
11. enable one desktop and one phone through the reviewed local pilot flag;
12. compare counts and exercise offline creation;
13. set build mode to `enabled` and deploy;
14. observe for one stable release before removing any legacy store.

Use these reviewed baseline-history commands only after `supabase migration list --linked` confirms the versions are absent:

```powershell
supabase migration repair 20260612000000 --status applied --linked
supabase migration repair 20260615000000 --status applied --linked
supabase migration repair 20260615010000 --status applied --linked
```

Schedule receipt cleanup with:

```sql
select cron.schedule(
  'purge-expired-sync-mutation-receipts',
  '17 3 * * *',
  $$select public.purge_expired_sync_mutation_receipts();$$
);
```

- [ ] **Step 2: Write the rollback runbook**

Define triggers and actions:

- migration error before commit: database transaction rolls back;
- client migration failure: set `VITE_SYNC_ROLLOUT_MODE=protection` and redeploy;
- elevated validation or sync failure: protection mode, no schema rollback, preserve queues;
- corrupt server mutation: export incident snapshot, protection mode, use reviewed backup restore only after impact preview;
- Edge regression: redeploy previous function version without changing database data.

Never instruct operators to use `git reset --hard`, truncate user tables, or delete IndexedDB.

- [ ] **Step 3: Add approval boxes**

The production section must include explicit unchecked approval fields for database migration, Edge Function deployment, frontend enablement, and full rollback. Record approver and timestamp outside committed docs if they contain personal information.

- [ ] **Step 4: Commit runbooks**

```powershell
git add docs/operations/data-safety-rollout.md docs/operations/data-safety-rollback.md docs/operations/data-safety-preflight.md
git commit -m "docs: add guarded data safety rollout"
```

### Task 8: Local release candidate verification and production approval gate

**Files:**
- Modify: `docs/operations/data-safety-rollout.md`

- [ ] **Step 1: Run the complete local release gate**

```powershell
supabase db reset
supabase test db
deno test supabase/functions --allow-env --allow-net
Set-Location app
npm test
npm run lint
npm run build
npm run test:e2e
```

Expected: every command exits 0.

- [ ] **Step 2: Perform a secret scan**

```powershell
rg -n "service_role|DEEPSEEK_API_KEY|SUPABASE_SERVICE_ROLE_KEY|Bearer [A-Za-z0-9._-]+" . --glob '!app/node_modules/**' --glob '!.git/**'
```

Expected: only variable names and documentation rules appear; no key value or token appears.

- [ ] **Step 3: Verify the production package**

Record migration file hashes, test output summaries, frontend commit, Edge Function commit, backup checksum, current production row counts, and rollback owner in the private rollout record. Confirm the public runbook contains no user data.

- [ ] **Step 4: Stop and request explicit production authorization**

Present the local evidence and exact planned mutations. Do not link, push, apply SQL, deploy Edge Functions, change GitHub variables, or enable synchronization in production until the user explicitly approves those external changes.

- [ ] **Step 5: Commit release-candidate evidence without private data**

```powershell
git add docs/operations/data-safety-rollout.md
git commit -m "docs: record data safety release candidate"
```

### Task 9: Execute the approved production rollout

**Files:**
- Modify after execution: `docs/operations/data-safety-rollout.md`

- [ ] **Step 1: Reconfirm scope immediately before mutation**

Verify the linked project ref is `tmjpgcjcrcaxxxhqbyng`, the reviewed commit matches the release candidate, a current backup checksum exists, and explicit approval covers database, functions, and frontend deployment.

- [ ] **Step 2: Execute expand migrations in documented order**

Apply only reviewed additive SQL files. Capture transaction success and rerun preflight counts and relation queries. Stop immediately on any mismatch.

- [ ] **Step 3: Deploy Edge Functions and smoke test**

Deploy `import-source` and `recommend-brew` with JWT verification enabled. Test one authenticated allowed request, one unauthenticated denial, one rate-limit denial, and one forbidden-source denial.

- [ ] **Step 4: Deploy pilot mode and migrate the test devices**

Deploy the frontend with `pilot`, enable the reviewed pilot flag on one desktop and one phone, verify legacy queue preservation,
sync zero-loss counts, and backup download. All other devices remain in protection behavior until the global enable deployment.

- [ ] **Step 5: Enable production synchronization**

Set `VITE_SYNC_ROLLOUT_MODE=enabled`, deploy Pages, verify commit and service worker version, then run the multi-device smoke checklist. Keep the protection-mode build ready.

- [ ] **Step 6: Record results and commit the public status**

Record timestamps, pass/fail checks, deployed commit, migration names, and whether rollback was needed. Do not commit user row contents, tokens, or private backup locations.

```powershell
git add docs/operations/data-safety-rollout.md
git commit -m "docs: record production sync rollout"
```

### Task 10: Stable-release cleanup checkpoint

**Files:**
- Modify: `docs/operations/data-safety-rollout.md`
- Modify only after evidence: `app/src/features/sync/legacyMigration.ts`
- Modify only after evidence: `app/src/features/backup/backupReminder.ts`

- [ ] **Step 1: Confirm one stable release has elapsed**

Require zero unresolved data-loss incidents, successful backups after enablement, no legacy migration failures, and no need to re-enable the page-owned runtime.

- [ ] **Step 2: Remove only deprecated reads, not user stores**

Remove the old `localStorage` backup reminder fallback and the `pilot` branch after global enablement is stable. Keep raw legacy IndexedDB stores
intact for an additional release unless a separate approved cleanup design authorizes deletion.

- [ ] **Step 3: Rerun full gates**

```powershell
npm test
npm run lint
npm run build
npm run test:e2e
```

Expected: all commands exit 0.

- [ ] **Step 4: Commit stable cleanup**

```powershell
git add app/src/features/sync/legacyMigration.ts app/src/features/backup/backupReminder.ts docs/operations/data-safety-rollout.md
git commit -m "refactor: retire compatibility reads"
```
