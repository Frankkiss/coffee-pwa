# Coffee Data Safety Implementation Roadmap

Approved design: [`../specs/2026-08-08-coffee-data-safety-sync-design.md`](../specs/2026-08-08-coffee-data-safety-sync-design.md)

The approved design spans three sequential deliverables. Each deliverable is independently testable and has its own implementation plan:

1. [`2026-08-08-coffee-sync-foundation.md`](./2026-08-08-coffee-sync-foundation.md)

   Add the Supabase synchronization contract, migrate IndexedDB safely, introduce the unified client synchronization engine, and move beans, brews, templates, settings, and offline recommendation reads onto it.
2. [`2026-08-08-coffee-backup-v2.md`](./2026-08-08-coffee-backup-v2.md)

   Add complete logical-data export, v1 compatibility, safe merge, explicit full rollback, server-backed reminders, and optional image ZIP backup.
3. [`2026-08-08-coffee-security-rollout.md`](./2026-08-08-coffee-security-rollout.md)

   Harden source fetching and AI calls, add browser and database release gates, document live migration, and run the guarded production rollout.

Execution order is mandatory. Plan 2 depends on the sync epoch and RPC foundations from Plan 1. Plan 3 verifies and deploys Plans 1 and 2. Production writes require a separate explicit approval after the local migrations and tests are reviewed.

## Design coverage

| Approved design area | Implementation coverage |
| --- | --- |
| Local entity stores, permanent UUIDs, atomic Outbox | Plan 1, Tasks 5-7 and 10 |
| Legacy IndexedDB preservation and ID rewrite | Plan 1, Task 8 |
| One SyncManager, locking, Realtime wake-up, error states | Plan 1, Tasks 9 and 11 |
| Beans, brews, templates, settings, offline recommendation reads | Plan 1, Tasks 10-13 |
| RLS, same-user relations, idempotency, sync epoch | Plan 1, Tasks 2-4 |
| Complete logical backup, v1 compatibility, safe merge, full rollback | Plan 2, Tasks 1-7 |
| Optional compressed image ZIP and cloud reminder | Plan 2, Tasks 8-9 |
| Edge Function auth, rate limits, SSRF and response bounds | Plan 3, Tasks 1-3 |
| Protection mode, multi-device E2E, CI, live rollout and rollback | Plan 3, Tasks 4-10 |

The approved non-goals remain excluded: field-level merge, CRDT/event sourcing, permanent row history, WebDAV, native apps, Bluetooth scales, offline AI generation, and complex incremental cursors.
