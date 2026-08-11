# Data Safety Preflight

1. Run `004_data_safety_preflight.sql` against the linked Supabase project before any migration.
2. Save the unedited output with the execution date outside the public repository if it contains user data.
3. Record table counts, RLS state, policy count, orphan count, and invalid-range count in the rollout checklist.
4. Stop if any expected table is missing, RLS is disabled, a cross-user relation exists, or invalid values would violate the new constraints.
5. Do not edit or delete anomalous rows until a row-specific repair is reviewed.

Run the script in a SQL client using the same project connection intended for the migration. It opens a read-only transaction and ends with a rollback; do not remove those statements. Review the complete, unedited result before approving any production change.

## 2026-08-11 local sync-foundation release gate

This record contains no user rows, access tokens, project secrets, or private backup locations.

- Commit under review: `539d7d3d996ebec34c2d24cdbb6b54e00681e539`
- Production database writes: **NOT RUN**
- Overall gate: **BLOCKED** until both local Supabase SQL checks below pass. Frontend and real-browser checks passing does not override this block.

### Environment inventory

| Dependency | Result | Evidence |
| --- | --- | --- |
| Node.js | PASS | `node --version` -> `v24.15.0` |
| npm / npx | PASS | both report `11.12.1` |
| Real Chromium | PASS | Google Chrome executable reports `151.0.7922.76`; the Playwright session reports `HeadlessChrome/151.0.0.0` |
| Supabase CLI | BLOCKED | `supabase --version` cannot find the command |
| Docker | BLOCKED | `docker --version` cannot find the command |
| PostgreSQL client | BLOCKED | `psql --version` cannot find the command |

### Verification results

| Gate | Result | Evidence |
| --- | --- | --- |
| `supabase db reset` | BLOCKED | Supabase CLI and Docker are unavailable. Install/start both, then rerun from repository root. This is not a PASS. |
| `supabase test db supabase/tests/005_sync_foundation.test.sql` | BLOCKED | The same local Supabase prerequisites are unavailable. Rerun only after `supabase db reset` succeeds. This is not a PASS. |
| `npm test` | PASS | Vitest: 54 files, 427 tests passed. |
| `npm run lint` | PASS | ESLint exited 0 with no findings. |
| `npx tsc -b` | PASS | TypeScript build exited 0. |
| `npm run build` | PASS | Vite 8.0.16 built 166 modules. The existing chunk-size advisory is non-fatal. |
| Real Chromium IndexedDB smoke | PASS | Fresh Playwright-controlled Chrome session, 6/6 checks passed. |
| `git diff --check` | PASS | No whitespace errors before the evidence commit. |

The real Chromium smoke page is `app/indexeddb-smoke.html`. It exercises the application modules without `fake-indexeddb` and covers:

1. v2-to-v3 upgrade with unchanged legacy source rows;
2. unsupported legacy `schema_version` recovery rejection with no partial target writes;
3. completed migration source-fingerprint change rejection with unchanged targets;
4. blocked open deduplication and closure of the late connection;
5. atomic entity-plus-Outbox abort;
6. atomic snapshot-plus-sync-metadata abort.

Reproduce it in one terminal:

```powershell
Set-Location app
npm run dev -- --host 127.0.0.1 --port 4188 --strictPort
```

Then run in another terminal:

```powershell
Set-Location app
npx --yes --package @playwright/cli playwright-cli --session coffee-task15 open http://127.0.0.1:4188/coffee-pwa/indexeddb-smoke.html --browser chrome
npx --yes --package @playwright/cli playwright-cli --session coffee-task15 run-code "async (page) => { await page.waitForFunction(() => document.documentElement.dataset.smokeStatus, null, { timeout: 30000 }); return await page.evaluate(() => window.indexedDbSmokeResult); }" --json
npx --yes --package @playwright/cli playwright-cli --session coffee-task15 close
```

Require top-level `status: PASS` and all six checks to be `PASS`. Use a fresh browser session after changing the smoke source so hot-module replacement cannot leave an old IndexedDB connection alive.

### Migration files reviewed locally

Baseline SQL already applied outside migration history:

1. `20260612000000_initial_schema.sql`
2. `20260615000000_blend_beans.sql`
3. `20260615010000_brew_templates.sql`

New additive sync migrations, not applied by this task:

1. `20260808010000_sync_foundation.sql`
2. `20260808020000_sync_rpc.sql`

### Production stop, repair, and rollback order

Do not link a project, run `supabase db push`, use the SQL Editor, or deploy an Edge Function until the two BLOCKED SQL gates pass and the user gives explicit production approval.

After approval, preserve this order:

1. Run `supabase/sql/004_data_safety_preflight.sql` read-only against the intended project; privately retain the complete output and stop on any anomaly.
2. Create and verify a production backup before changing migration history or schema.
3. Run `supabase migration list --linked` and stop if its state differs from the reviewed expectation.
4. Only when the three baseline versions are absent from migration history but their schema is confirmed present, mark them applied in ascending order:

```powershell
supabase migration repair 20260612000000 --status applied --linked
supabase migration repair 20260615000000 --status applied --linked
supabase migration repair 20260615010000 --status applied --linked
```

5. Re-run `supabase migration list --linked`, then apply only `20260808010000_sync_foundation.sql` followed by `20260808020000_sync_rpc.sql` through the reviewed migration workflow.
6. Re-run the read-only preflight and authenticated sync smoke before enabling the frontend.

If an additive migration fails before commit, rely on its transaction rollback and stop. If a failure is discovered after commit, do not mark migrations reverted, truncate user tables, delete browser IndexedDB, or replay an older schema blindly. Put the frontend in `VITE_SYNC_ROLLOUT_MODE=protection`, preserve every device Outbox, export incident evidence and a fresh backup, then use a separately reviewed forward repair. A data rollback must use a verified backup, impact preview, pre-restore download, epoch invalidation, and explicit full-rollback approval. Edge-only regressions roll back by redeploying the previous function version without altering database data.
