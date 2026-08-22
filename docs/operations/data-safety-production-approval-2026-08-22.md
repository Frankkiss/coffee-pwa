# Data Safety Production Approval Package — 2026-08-22

## Decision status

**Production status: NOT RUN.**

This package records local release-candidate evidence and defines the boundary for a later production decision. It does not authorize or record a Supabase link, production query, migration, Edge Function deployment, GitHub Pages deployment, pilot enablement, or data restore.

The approved operational procedures remain:

- [Production rollout runbook](./data-safety-rollout.md)
- [Production rollback runbook](./data-safety-rollback.md)
- [Detailed local release-candidate evidence](./data-safety-rc-2026-08-22.md)

## Verified local gates

| Gate | Fresh result |
| --- | --- |
| Local database reset and all seven migrations | PASS |
| pgTAP `005_sync_foundation`, `007_backup_v2`, `008_edge_rate_limit` | PASS — 3 files, 291 tests |
| Frontend unit tests | PASS — 63 files, 545 tests |
| ESLint | PASS |
| TypeScript and Vite production build | PASS |
| Edge Function Deno tests | PASS — 19 tests |
| Deno format, lint, and type checks | PASS |
| Playwright mobile and desktop release scenarios | PASS — 6 tests |
| GitHub Actions workflow validation | PASS — 2 workflows |
| Tracked-secret scan | PASS — no production JWT, `sb_secret`, or provider secret patterns found |
| Production dependency audit | PASS — 0 vulnerabilities |

The full development dependency tree reports three high-severity advisories involving `brace-expansion`, `nanoid`, and `postcss`. They are development-only and are not shipped as application runtime dependencies. No automatic dependency rewrite was performed as part of this gate. The existing Vite main-chunk size warning (about 520 kB) is also non-blocking for data safety.

## Verified artifact identity

Migration SHA-256 values:

- `20260808010000_sync_foundation.sql`: `c9cb9de13dee3c0636c15940c33966da41e493a72443b1878334f5a249698131`
- `20260808020000_sync_rpc.sql`: `8f15ace7c0fd1326c58ddb00abb692868ea650f2e8169482126e8875957289fc`
- `20260808030000_backup_v2_rpc.sql`: `01087800e498ada8e75c469b5d53b9a1d97d14571aa8a18d5673d2c4fa1ff61f`
- `20260808040000_edge_rate_limit.sql`: `6e3fe73ecd4ab5ec56df5c1d67aeaca6b57741557541bc492ba9eb1bbe64a184`

Component anchors:

- frontend and workflows: `d21134169ec5560b462b5858e8e76c34744c4b03`
- Edge Functions and configuration: `349fa3e55d6aea9fb10cad99e6b3e06435c21fd9`
- migrations and SQL tests: `4eac6bc85348fcdab2d5945eafbaa4da9c6bbe17`
- reviewed runbook baseline: `bac7476d83d9edef2263bdedd8a504c36e76f981`

## Local cleanup evidence

- Local Supabase stopped with `--no-backup` after verification.
- WSL was shut down.
- No local database, preview server, or browser automation service was intentionally left running.

## Approval boundary

The next task may begin only after the user explicitly approves production rollout. Approval must cover all of the following:

- reading the production migration inventory and current table counts;
- producing the current-version export and database backup required by the runbook;
- applying the reviewed additive migrations in exact order;
- validating the seven reviewed `NOT VALID` constraints only after the anomaly count is zero;
- creating the reviewed daily Supabase Cron receipt-cleanup job;
- deploying the reviewed authenticated, rate-limited Edge Functions;
- publishing a `pilot` frontend build;
- enabling one named desktop/phone pilot pair;
- monitoring the pilot against documented stop conditions;
- either returning to `protection` mode or proceeding to the separately approved broader enablement step.

Production-only evidence—counts, backup locations, account identifiers, timestamps, and named owners—must not be committed to public Git history. Until explicit approval is given, every production approval checkbox remains unchecked.
