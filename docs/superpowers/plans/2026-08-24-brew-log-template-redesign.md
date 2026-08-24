# Brew Log And Template Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user explicitly requested inline execution without subagents.

**Goal:** Link the brew-log selectors and replace 32 broad system templates with 20 mode-grouped core templates without migrating user data.

**Architecture:** Put method compatibility in a pure helper shared by UI transitions and save validation. Give system templates explicit frontend-only mode metadata, keep persisted user-template rows unchanged, and make recommendation filtering consume the same metadata instead of ID prefixes.

**Tech Stack:** React 19, TypeScript 6, Vitest, Vite, existing IndexedDB and Supabase repositories.

---

### Task 1: Approved behavior and compatibility

**Files:**
- Modify: `docs/superpowers/specs/2026-06-12-coffee-pwa-design.md`
- Create: `docs/superpowers/plans/2026-08-24-brew-log-template-redesign.md`

- [ ] Record 11 hot-pourover, 2 iced-pourover, 2 ready cold-brew, 2 concentrate cold-brew, and 3 espresso templates.
- [ ] Record that retired system templates leave the active UI and recommendation pool only; user templates and serialized history are untouched.
- [ ] Commit with `git commit -m "docs: define brew template redesign"`.

### Task 2: Brew selector linkage

**Files:**
- Create: `app/src/features/brews/brewMethodLinkage.ts`
- Create: `app/src/features/brews/brewMethodLinkage.test.ts`
- Modify: `app/src/features/brews/brewForm.ts`
- Modify: `app/src/features/brews/brewForm.test.ts`
- Modify: `app/src/features/brews/BrewLogPanel.tsx`

- [ ] Write tests for `linkMethodToMode`, `linkModeToMethod`, and `isMethodCompatible` covering 手冲, 爱乐压, 法压, 冷萃, 意式, and 摩卡壶.
- [ ] Run `npm test -- src/features/brews/brewMethodLinkage.test.ts src/features/brews/brewForm.test.ts` and verify the new tests fail for missing behavior.
- [ ] Implement the compatibility table: 手冲 supports hot/iced; 爱乐压 and 法压 map to hot; 冷萃 maps to cold; 意式 and 摩卡壶 map to espresso.
- [ ] Make both selectors use the pure helpers and preserve the cold-brew variant and conditional measurement cleanup.
- [ ] Reject a payload with both fields present but incompatible using `冲煮类型与具体方法不一致`.
- [ ] Re-run brew tests and commit with `git commit -m "fix: link brew type and method selectors"`.

### Task 3: Explicit template modes and 20 core recipes

**Files:**
- Modify: `app/src/features/brewTemplates/brewTemplateTypes.ts`
- Create: `app/src/features/brewTemplates/brewTemplateMode.ts`
- Create: `app/src/features/brewTemplates/brewTemplateMode.test.ts`
- Modify: `app/src/features/brewTemplates/brewTemplates.ts`
- Modify: `app/src/features/brewTemplates/brewTemplateFilters.test.ts`

- [ ] Write failing assertions for exactly 20 unique templates and distribution `{ hot_pourover: 11, iced_pourover: 2, cold_brew: 4, espresso: 3 }`.
- [ ] Assert two cold-brew templates per variant, no retired brewers, no champion flags, executable cumulative steps, and non-empty source notes/URLs.
- [ ] Run the focused template tests and verify they fail against the current 32-item library.
- [ ] Add optional `brewMode` and `brewVariant` frontend fields without changing the persisted user-template schema.
- [ ] Replace the built-in dataset with the approved researched recipes and re-run tests.
- [ ] Commit with `git commit -m "feat: curate core brew templates"`.

### Task 4: Mode-first template UI and recommendation filtering

**Files:**
- Modify: `app/src/features/brewTemplates/brewTemplateFilters.ts`
- Modify: `app/src/features/brewTemplates/BrewTemplatePanel.tsx`
- Modify: `app/src/features/brewTemplates/brewTemplates.css`
- Modify: `app/src/features/recommendations/methodAwareRuleRecommendation.ts`
- Modify: `app/src/features/recommendations/methodAwareRuleRecommendation.test.ts`

- [ ] Write failing mode-filter tests for hot, iced, both cold variants, and espresso without relying on ID prefixes.
- [ ] Replace brewer/flavor/difficulty/champion controls with one canonical mode selector.
- [ ] Render “我的模板” before “系统核心模板”; keep unmapped legacy user templates visible in the personal section.
- [ ] Use explicit mode and variant metadata in method-aware recommendation selection; derive conservative metadata for unchanged persisted user rows.
- [ ] Run template and recommendation tests and commit with `git commit -m "refactor: group templates by brew mode"`.

### Task 5: Verification

**Files:**
- Modify only if verification exposes an in-scope defect.

- [ ] Run `npm test -- src/features/brews src/features/brewTemplates src/features/recommendations`.
- [ ] Run `npm run build`.
- [ ] At 390x844 verify linked selectors, conditional fields, mode filter, personal/system ordering, and no horizontal overflow.
- [ ] Review `git status --short --branch` and recent commits before reporting completion.
