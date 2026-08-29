# Coffee PWA Project Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. The user explicitly requested inline execution without subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace superseded dated documentation and proven duplicate artifacts with a small set of current, stable project documents while preserving all runtime behavior and data-safety mechanisms.

**Architecture:** Treat current implementation plus the approved consolidation design as the source for a documentation-only normalization. Preserve migrations, sync, backup, restore, compatibility code and development dependencies; remove only files proven duplicate, unused, generated or fully merged into canonical documents. Validate references and repository invariants before cleaning local caches and merged worktrees.

**Tech Stack:** Markdown, React 19, TypeScript 6, Vite 8, Vitest, ESLint, Supabase migrations and Edge Functions, Git worktrees, PowerShell.

---

## File structure

### Create

- `README.md`: repository entry point, development commands, deployment and documentation links.
- `docs/README.md`: canonical documentation index and maintenance policy.
- `docs/product-design.md`: current user-visible product behavior.
- `docs/data-architecture.md`: sync, storage, backup, restore and database safety contracts.
- `docs/ai-recommendation.md`: source parsing and four-mode recommendation contracts.
- `docs/operations/production-runbook.md`: current production preflight, rollout, rollback and verification procedure.

### Modify

- `AGENTS.md`: replace the dated design source with the stable canonical document index.
- `docs/operations/deepseek-edge-function-setup.md`: update links and remove references to retired setup state while retaining safe Secret handling.
- `supabase/README.md`: point to the canonical documentation and keep the current shared Secret name.
- `.github/workflows/data-safety-checks.yml`: rename the unused CI placeholder from `DEEPSEEK_API_KEY` to `DEEPSEEK_VISION_API_KEY` so test configuration matches both Edge Functions.
- `app/index.html`: use `%BASE_URL%icons/icon.svg` as the single favicon source.

### Delete after content migration

- `docs/superpowers/plans/*.md`, including this implementation plan after completion.
- `docs/superpowers/specs/*.md`, including the approved consolidation design after its durable rules are represented in `docs/README.md` and the canonical documents.
- `docs/operations/data-safety-preflight.md`.
- `docs/operations/data-safety-production-approval-2026-08-22.md`.
- `docs/operations/data-safety-rc-2026-08-22.md`.
- `docs/operations/data-safety-rollback.md`.
- `docs/operations/data-safety-rollout.md`.
- `app/README.md`.
- `app/public/favicon.svg`.
- `app/src/assets/hero.png`.
- `app/src/assets/react.svg`.
- `app/src/assets/vite.svg`.
- `supabase/sql/001_initial_schema.sql`.
- `supabase/sql/002_blend_beans.sql`.
- `supabase/sql/003_brew_templates.sql`.

### Preserve unchanged

- `supabase/migrations/**` and migration order.
- `supabase/sql/004_data_safety_preflight.sql`.
- `app/src/features/sync/**`, `app/src/features/backup/**` and their tests.
- Legacy migration and blend compatibility fields and code.
- `app/node_modules` and both ignored Supabase CLI executables.

---

### Task 1: Create the stable documentation set

**Files:**
- Create: `README.md`
- Create: `docs/README.md`
- Create: `docs/product-design.md`
- Create: `docs/data-architecture.md`
- Create: `docs/ai-recommendation.md`
- Create: `docs/operations/production-runbook.md`
- Modify: `AGENTS.md`
- Modify: `docs/operations/deepseek-edge-function-setup.md`
- Modify: `supabase/README.md`

- [ ] **Step 1: Write the repository README**

Create `README.md` with these exact sections and responsibilities:

```markdown
# Coffee PWA

## 当前能力
豆仓、四类冲煮记录、模板、规则与 AI 推荐、离线写入、Supabase 同步、备份恢复。

## 安全边界
服务端 AI Secret、RLS、草稿确认、禁止网址抓取、禁止破坏性数据迁移。

## 目录
`app/`, `supabase/`, `docs/`, `.github/workflows/`。

## 本地开发
在 `app` 下运行 `npm install`、`npm run dev`、`npm test`、`npm run lint`、`npm run build`。

## 部署
GitHub Pages 由 `deploy-pages.yml` 发布；数据库和 Edge Function 按运维手册单独审批。

## 文档
链接 `docs/README.md`。
```

- [ ] **Step 2: Write the documentation index and maintenance policy**

Create `docs/README.md` listing exactly four canonical documents: product design, data architecture, AI recommendation, and production runbook, plus the DeepSeek setup guide. State that completed dated plans are retained by Git history rather than the working tree, and that any user-visible behavior change updates the relevant canonical document before implementation.

- [ ] **Step 3: Consolidate current product behavior**

Create `docs/product-design.md` from the current product design and implemented feature specs. It must contain sections for goals, usage model, page structure, bean entry, source import, brew logs, templates, saved recommendations, settings, offline behavior and acceptance criteria. Preserve these exact current rules:

- manual blend entry treats a blend as one packaged product and does not show composition or blend-note controls;
- old blend fields remain losslessly compatible in sync and backup paths;
- source import accepts pasted text and a user-selected package image only, never URLs or browser OCR;
- brew modes are hot pour-over, iced pour-over, cold brew and espresso;
- cold brew hides the redundant method selector and distinguishes ready-to-drink from concentrate;
- ice appears for iced pour-over and cold-brew concentrate only;
- iced pour-over ratio is hot water divided by coffee dose and excludes ice;
- current system templates cover the four modes and cold-brew variants only;
- all AI output remains a draft until user confirmation.

- [ ] **Step 4: Consolidate data architecture and safety contracts**

Create `docs/data-architecture.md` with sections for source of truth, local IndexedDB, repository writes, outbox, stable IDs, validation, pull/push/realtime ordering, conflict handling, legacy migration, RLS, transaction RPCs, backup v2, image backup, restore preview/restore point, failure recovery and invariants. Copy every still-active MUST/NEVER safety constraint from `2026-08-08-coffee-data-safety-sync-design.md`; summarize implementation history rather than copying dated task logs. Explicitly state that schema evolution is additive unless a separately approved migration proves restoration and rollback.

- [ ] **Step 5: Consolidate AI and recommendation contracts**

Create `docs/ai-recommendation.md` with sections for architecture, server secret/model, source parsing, deterministic rule stage, recommendation inputs, excluded inputs, four-mode ranges, template/history ranking, feedback interpretation, structured output, step validation, timeouts/fallback and draft conversion. Preserve the current model `deepseek-v4-flash-vision-exp`, Secret `DEEPSEEK_VISION_API_KEY`, no remaining-amount input, no blend-internal input, and hot-water-only iced ratio semantics.

- [ ] **Step 6: Consolidate production operations**

Create `docs/operations/production-runbook.md` by combining current preflight, rollout and rollback instructions. Retain the read-only SQL preflight, backup-before-change, additive migration order, authenticated smoke tests, deployment stop conditions, frontend rollback, Edge Function rollback and approved full-data-restore boundary. Replace dated RC/approval evidence with a short “current stable baseline” entry identifying production sync as globally enabled and GitHub Pages as the frontend target; do not copy private data or credentials.

- [ ] **Step 7: Update canonical references**

Update `AGENTS.md` so `docs/README.md` is the index and `docs/product-design.md` is the user-visible source of truth. Update the DeepSeek setup guide and `supabase/README.md` to link only stable paths. Keep `DEEPSEEK_VISION_API_KEY`; remove instructions that imply the retired key is still required.

- [ ] **Step 8: Verify documentation coverage before deleting sources**

Run:

```powershell
rg -n "网址|OCR|blend_components|热手冲|冰手冲|冷萃|意式|仅热水|DEEPSEEK_VISION_API_KEY|恢复点|outbox|RLS|rollback" docs/product-design.md docs/data-architecture.md docs/ai-recommendation.md docs/operations/production-runbook.md
rg -n "docs/superpowers" AGENTS.md README.md docs/README.md docs/operations supabase/README.md
```

Expected: the first command finds all critical boundaries in their canonical documents; the second command returns no references outside the transitional design/plan that will be deleted.

- [ ] **Step 9: Commit the canonical documentation**

```powershell
git add README.md AGENTS.md docs/README.md docs/product-design.md docs/data-architecture.md docs/ai-recommendation.md docs/operations/production-runbook.md docs/operations/deepseek-edge-function-setup.md supabase/README.md
git commit -m "docs: consolidate current project guidance"
```

Expected: one documentation-only commit; no application, migration or Edge Function file changed.

---

### Task 2: Remove superseded documents and duplicate project files

**Files:**
- Delete: all dated files listed in the file structure section
- Modify: `app/index.html`
- Modify: `.github/workflows/data-safety-checks.yml`

- [ ] **Step 1: Prove the SQL copies still match migrations**

Normalize CRLF/LF in memory and compare each pair:

```powershell
$pairs = @(
  @('supabase/sql/001_initial_schema.sql','supabase/migrations/20260612000000_initial_schema.sql'),
  @('supabase/sql/002_blend_beans.sql','supabase/migrations/20260615000000_blend_beans.sql'),
  @('supabase/sql/003_brew_templates.sql','supabase/migrations/20260615010000_brew_templates.sql')
)
foreach ($pair in $pairs) {
  $left = (Get-Content -Raw -Encoding UTF8 -LiteralPath $pair[0]).Replace("`r`n","`n")
  $right = (Get-Content -Raw -Encoding UTF8 -LiteralPath $pair[1]).Replace("`r`n","`n")
  if ($left -ne $right) { throw "SQL files differ: $($pair -join ' <> ')" }
}
```

Expected: no output and exit code 0. Any difference stops deletion.

- [ ] **Step 2: Point the favicon to the retained PWA icon**

Change the favicon line in `app/index.html` to:

```html
<link rel="icon" type="image/svg+xml" href="%BASE_URL%icons/icon.svg" />
```

- [ ] **Step 3: Align the CI placeholder Secret name**

In `.github/workflows/data-safety-checks.yml`, replace only the Edge Function test environment key:

```yaml
DEEPSEEK_VISION_API_KEY: ci-placeholder-deepseek-key
```

Do not add a real key and do not change production deployment configuration.

- [ ] **Step 4: Delete proven duplicate and unused tracked files**

Delete the three duplicate SQL files, duplicate favicon, three unreferenced assets and Vite default `app/README.md`. Before deleting an asset, rerun:

```powershell
rg -n "hero\.png|react\.svg|vite\.svg|/favicon\.svg" app --glob '!dist/**'
```

Expected before deletion: only the favicon line changed in Step 2 may have removed the final favicon reference; there are no references to the three assets.

- [ ] **Step 5: Delete merged historical documentation**

Delete all 48 files under `docs/superpowers/plans`, the dated specs under `docs/superpowers/specs`, and the five superseded data-safety operations files. Keep the current transitional consolidation design and this plan until Task 4 so their checklists remain available during execution.

- [ ] **Step 6: Verify no broken tracked references**

Run:

```powershell
rg -n "docs/superpowers|data-safety-preflight\.md|data-safety-rollout\.md|data-safety-rollback\.md|app/README\.md|supabase/sql/00[1-3]_" . --glob '!.git/**' --glob '!app/node_modules/**' --glob '!app/dist/**'
```

Expected: matches appear only in the two transitional consolidation documents. No canonical document, source file, workflow or README references a deleted path.

- [ ] **Step 7: Commit tracked cleanup**

```powershell
git add -A
git commit -m "chore: remove superseded project files"
```

Expected: the commit contains documentation deletion, duplicate resources, the favicon reference and the CI placeholder rename; it contains no migration modification.

---

### Task 3: Verify runtime and data-safety invariants

**Files:**
- Verify only; do not modify application or database code unless a failure proves the cleanup caused it.

- [ ] **Step 1: Prove migration history is untouched**

Run:

```powershell
git diff --exit-code fd54762 -- supabase/migrations app/src/features/sync app/src/features/backup supabase/functions
```

Expected: no output and exit code 0.

- [ ] **Step 2: Run the complete frontend unit suite**

Run from `app`:

```powershell
npm test
```

Expected: all Vitest files and tests pass.

- [ ] **Step 3: Run lint**

Run from `app`:

```powershell
npm run lint
```

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 4: Build the production PWA**

Run from `app` with non-secret local build values:

```powershell
$env:VITE_SUPABASE_URL='http://127.0.0.1:54321'
$env:VITE_SUPABASE_ANON_KEY='ci-placeholder-anon-key'
$env:VITE_SYNC_ROLLOUT_MODE='enabled'
npm run build
```

Expected: TypeScript and Vite build succeed and `app/dist` is produced.

- [ ] **Step 5: Verify the consolidated icon and Pages base**

Run:

```powershell
rg -n "coffee-pwa/icons/icon\.svg|icons/icon\.svg" app/dist/index.html app/dist/manifest.webmanifest app/dist/sw.js
```

Expected: the built HTML, manifest and service worker reference the retained icon under the GitHub Pages base; no built file references `/favicon.svg`.

- [ ] **Step 6: Run Edge Function unit tests**

Run from the repository root:

```powershell
deno test supabase/functions --allow-env
```

Expected: shared guards, source import and brew recommendation tests pass. If Deno is unavailable, stop and report the missing runtime rather than changing code.

- [ ] **Step 7: Run secret and stale-path scans**

Run:

```powershell
rg -n "sk-[A-Za-z0-9_-]{16,}|service_role[^a-zA-Z_]|Bearer [A-Za-z0-9._-]{20,}" . --glob '!.git/**' --glob '!app/node_modules/**' --glob '!app/dist/**'
rg -n "docs/superpowers|DEEPSEEK_API_KEY" README.md AGENTS.md docs supabase/README.md .github/workflows
```

Expected: no credential-like values. `DEEPSEEK_API_KEY` may appear only as explicitly retired historical terminology in the stable setup/runbook; no workflow or current setup step requires it.

---

### Task 4: Remove transitional records and local generated state

**Files:**
- Delete: `docs/superpowers/specs/2026-08-29-project-consolidation-design.md`
- Delete: `docs/superpowers/plans/2026-08-29-project-consolidation.md`
- Delete locally, not from Git: `.npm-cache`, `app/dist`, `supabase/.branches`, `supabase/.temp`, empty `.superpowers`, merged worktrees.

- [ ] **Step 1: Copy durable maintenance rules into the documentation index**

Ensure `docs/README.md` states: canonical documents use stable paths; dated completed plans live only in Git history; user-visible behavior changes update design first; data-safety mechanisms are never removed as folder cleanup; generated artifacts remain ignored.

- [ ] **Step 2: Recheck worktrees immediately before removal**

Run:

```powershell
git worktree list --porcelain
git -C D:\coffee\.worktrees\data-safety-sync status --short
git -C D:\coffee\.worktrees\remaining-grams-recovery status --short
git merge-base --is-ancestor codex/data-safety-sync foundation
git merge-base --is-ancestor codex/remaining-grams-recovery foundation
```

Expected: both status commands are empty and both ancestor checks exit 0. Any dirty status or failed ancestor check stops removal.

- [ ] **Step 3: Remove the registered merged worktrees and branches**

Run:

```powershell
git worktree remove D:\coffee\.worktrees\data-safety-sync
git worktree remove D:\coffee\.worktrees\remaining-grams-recovery
git branch -d codex/data-safety-sync
git branch -d codex/remaining-grams-recovery
git worktree prune
```

Expected: both worktrees and already-merged local branches are removed without `--force`.

- [ ] **Step 4: Resolve and remove only approved generated directories**

Resolve every target and verify it begins with `D:\coffee\` before removal. Remove these exact paths if present:

```text
D:\coffee\.npm-cache
D:\coffee\app\dist
D:\coffee\supabase\.branches
D:\coffee\supabase\.temp
D:\coffee\.superpowers
D:\coffee\.worktrees\method-aware-recommendations
D:\coffee\.worktrees\template-source-id-sync
```

Do not remove `D:\coffee\app\node_modules`, `D:\coffee\supabase\supabase.exe` or `D:\coffee\supabase\supabase-go.exe`.

- [ ] **Step 5: Delete the transitional design and plan**

Delete the two dated consolidation documents only after all previous verification passes. Their committed versions remain recoverable from Git commit `fd54762` and the plan commit.

- [ ] **Step 6: Final repository checks**

Run:

```powershell
git diff --check
git status --short --branch
rg --files docs | Sort-Object
git ls-files supabase/migrations
```

Expected: only the intentional deletion of transitional documents and any final `docs/README.md` maintenance wording are uncommitted; the docs list contains only stable documents; every migration remains tracked.

- [ ] **Step 7: Commit final documentation cleanup**

```powershell
git add -A docs
git commit -m "docs: finalize canonical project documentation"
```

Expected: a small commit removing the two transitional files and preserving the stable documentation index.

- [ ] **Step 8: Final status and delivery evidence**

Run:

```powershell
git status --short --branch
git log -4 --oneline
git worktree list
```

Expected: clean `foundation`, only the main worktree remains, and the recent commits show design, canonical documentation, tracked cleanup and finalization. Do not push until the user explicitly requests or confirms deployment.
