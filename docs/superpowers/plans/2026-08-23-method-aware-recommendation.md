# Method-Aware Brew Recommendation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. The user explicitly requested inline execution without subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build deterministic, method-isolated recommendations for hot pour-over, iced pour-over, cold brew, and espresso, then let DeepSeek optimize the bounded rule result and convert it into an editable brew draft.

**Architecture:** Add nullable brew-mode measurements through the existing v1 sync and backup envelopes without rewriting old records. Normalize legacy methods at the recommendation boundary, generate a complete method-specific rule recipe from compatible history/templates/settings, and send only a compact allow-listed DTO to `recommend-brew`. Hold “use this brew” drafts in authenticated React memory until the user explicitly saves a brew log.

**Tech Stack:** React 19, TypeScript 6, Vitest, IndexedDB sync repositories, Supabase Postgres/RPC/Edge Functions, Deno tests, GitHub Pages.

---

### Task 1: Canonical brew modes and form measurements

**Files:**
- Create: `app/src/features/brews/brewMode.ts`
- Create: `app/src/features/brews/brewMode.test.ts`
- Modify: `app/src/features/brews/brewTypes.ts`
- Modify: `app/src/features/brews/brewForm.ts`
- Modify: `app/src/features/brews/brewForm.test.ts`
- Modify: `app/src/features/brews/brewLogDetailModel.ts`
- Modify: `app/src/features/brews/brewLogDetailModel.test.ts`

- [ ] **Step 1: Write failing normalization and form tests**

```ts
expect(normalizeBrewMode({ brew_mode: null, method: '冰手冲' })).toBe('iced_pourover')
expect(normalizeBrewMode({ brew_mode: null, method: 'Pourover' })).toBe('hot_pourover')
expect(normalizeBrewMode({ brew_mode: null, method: '冷萃' })).toBe('cold_brew')
expect(normalizeBrewMode({ brew_mode: null, method: 'Espresso' })).toBe('espresso')
expect(normalizeBrewMode({ brew_mode: null, method: '未知方法' })).toBeNull()
expect(toBrewLogUpdatePayload(icedForm)).toMatchObject({
  brew_mode: 'iced_pourover', brew_variant: null, ice_grams: 90, beverage_grams: null,
})
expect(toBrewLogUpdatePayload(espressoForm)).toMatchObject({
  brew_mode: 'espresso', brew_variant: null, ice_grams: null, beverage_grams: 36,
})
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `cd app; npm test -- src/features/brews/brewMode.test.ts src/features/brews/brewForm.test.ts`
Expected: FAIL because canonical mode fields and normalization do not exist.

- [ ] **Step 3: Add the canonical types and mode helpers**

```ts
export type BrewMode = 'hot_pourover' | 'iced_pourover' | 'cold_brew' | 'espresso'
export type BrewVariant = 'ready_to_drink' | 'concentrate'

export function normalizeBrewMode(input: { brew_mode?: string | null; method?: string | null }): BrewMode | null {
  if (isBrewMode(input.brew_mode)) return input.brew_mode
  const method = input.method?.trim().toLowerCase() ?? ''
  if (/冰手冲|iced\s*(pour|filter)/.test(method)) return 'iced_pourover'
  if (/冷萃|cold\s*brew/.test(method)) return 'cold_brew'
  if (/意式|espresso|浓缩咖啡/.test(method)) return 'espresso'
  if (/手冲|pourover|pour-over|filter/.test(method)) return 'hot_pourover'
  return null
}
```

Add nullable `brew_mode`, `brew_variant`, `ice_grams`, and `beverage_grams` to `BrewLog` and payloads; add string form fields `brewMode`, `brewVariant`, `iceGrams`, and `beverageGrams`. Serialize only the field relevant to the selected mode and calculate espresso ratio from coffee/output weight.

- [ ] **Step 4: Show mode-specific fields in the detail model and verify GREEN**

Run: `cd app; npm test -- src/features/brews/brewMode.test.ts src/features/brews/brewForm.test.ts src/features/brews/brewLogDetailModel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/features/brews
git commit -m "feat: add canonical brew modes"
```

### Task 2: Additive database, sync, and backup compatibility

**Files:**
- Create: `supabase/migrations/20260823020000_method_aware_brews.sql`
- Modify: `app/src/features/brews/brewLogRepository.ts`
- Modify: `app/src/features/brews/brewLogRepository.test.ts`
- Modify: `app/src/features/sync/syncApi.ts`
- Modify: `app/src/features/sync/syncApi.test.ts`
- Modify: `app/src/features/sync/localRepository.ts`
- Modify: `app/src/features/sync/localRepository.test.ts`
- Modify: `app/src/features/sync/legacyMigration.ts`
- Modify: `app/src/features/sync/legacyMigration.test.ts`
- Modify: `app/src/features/backup/backupImport.ts`
- Modify: `app/src/features/backup/backupImport.test.ts`
- Modify: `app/src/features/backup/backupExport.test.ts`
- Modify: `app/src/features/backup/csvExport.ts`
- Modify: `app/src/features/backup/csvExport.test.ts`

- [ ] **Step 1: Write failing boundary tests**

```ts
expect(validateSnapshot(methodAwareSnapshot).brewLogs[0]).toMatchObject({
  brew_mode: 'iced_pourover', brew_variant: null, ice_grams: 90, beverage_grams: null,
})
expect(parseBackup(oldBackup).brewLogs[0]).toMatchObject({
  brew_mode: null, brew_variant: null, ice_grams: null, beverage_grams: null,
})
expect(buildBrewLogsCsv([espressoLog])).toContain('意式出液克数')
```

Also assert invalid modes, non-finite/negative weights, and non-null mode-incompatible measurements are rejected before local or network writes.

- [ ] **Step 2: Run boundary tests and confirm RED**

Run: `cd app; npm test -- src/features/sync/syncApi.test.ts src/features/sync/localRepository.test.ts src/features/backup/backupImport.test.ts src/features/backup/csvExport.test.ts`
Expected: FAIL on missing allow-listed fields.

- [ ] **Step 3: Add columns and constraints without rewriting rows**

```sql
alter table public.brew_logs
  add column if not exists brew_mode text,
  add column if not exists brew_variant text,
  add column if not exists ice_grams numeric,
  add column if not exists beverage_grams numeric;

alter table public.brew_logs
  add constraint brew_logs_brew_mode_check
    check (brew_mode is null or brew_mode in ('hot_pourover','iced_pourover','cold_brew','espresso')),
  add constraint brew_logs_brew_variant_check
    check (brew_variant is null or brew_variant in ('ready_to_drink','concentrate')),
  add constraint brew_logs_method_measurements_check
    check (
      (ice_grams is null or (brew_mode = 'iced_pourover' and ice_grams >= 0)) and
      (beverage_grams is null or (brew_mode = 'espresso' and beverage_grams >= 0)) and
      (brew_variant is null or brew_mode = 'cold_brew')
    );
```

In the same migration, replace `apply_sync_mutation`, brew backup validation, and restore routines using their current security-definer/search-path/ownership grants while adding the four exact keys to brew allow-lists, insert/update columns, and type checks. Do not change bean, restore transaction, RLS, rate-limit, or ownership behavior.

- [ ] **Step 4: Thread fields through local and wire boundaries**

Add the four keys to repository payload construction, exact-key validators, snapshot rebuilding, legacy defaults, backup parsing, and CSV columns. Old v1 backups may omit only these four keys and normalize them to `null`; current backups require them.

- [ ] **Step 5: Verify app and SQL tests**

Run: `cd app; npm test -- src/features/brews/brewLogRepository.test.ts src/features/sync/syncApi.test.ts src/features/sync/localRepository.test.ts src/features/sync/legacyMigration.test.ts src/features/backup/backupImport.test.ts src/features/backup/backupExport.test.ts src/features/backup/csvExport.test.ts`
Expected: PASS.

Run: `npx --yes supabase db lint --local`
Expected: PASS when a local Supabase stack is available; otherwise run migration parsing through the repository SQL test command and record the unavailable local-stack limitation.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260823020000_method_aware_brews.sql app/src/features/brews app/src/features/sync app/src/features/backup
git commit -m "feat: persist method-aware brew data"
```

### Task 3: Structured recommendation defaults in user settings

**Files:**
- Create: `app/src/features/settings/recommendationDefaults.ts`
- Create: `app/src/features/settings/recommendationDefaults.test.ts`
- Modify: `app/src/features/settings/userSettingsModel.ts`
- Modify: `app/src/features/settings/userSettingsModel.test.ts`
- Modify: `app/src/features/settings/UserSettingsPanel.tsx`
- Modify: `app/src/features/settings/settings.css`

- [ ] **Step 1: Write failing round-trip tests**

```ts
expect(readRecommendationDefaults(settings.default_gear, settings.taste_preferences)).toEqual({
  hotPourover: { brewer: 'V60', grinder: 'C40' },
  icedPourover: { brewer: 'V60', grinder: 'C40' },
  coldBrew: { brewer: '冷萃壶', grinder: 'C40' },
  espresso: { brewer: 'Flair', grinder: 'Kinu', doseGrams: 18 },
  tasteGoals: ['明亮', '甜感'],
})
```

- [ ] **Step 2: Confirm RED**

Run: `cd app; npm test -- src/features/settings/recommendationDefaults.test.ts src/features/settings/userSettingsModel.test.ts`
Expected: FAIL because structured defaults are not implemented.

- [ ] **Step 3: Implement additive JSON helpers and UI**

Store defaults under `default_gear.recommendation` and goals under `taste_preferences.goals`, preserving all unknown keys and the existing `items`/`notes`. Render compact per-mode equipment fields; only espresso exposes `doseGrams`. Temporary recommendation edits never write settings.

- [ ] **Step 4: Verify and commit**

Run: `cd app; npm test -- src/features/settings/recommendationDefaults.test.ts src/features/settings/userSettingsModel.test.ts`
Expected: PASS.

```bash
git add app/src/features/settings
git commit -m "feat: add recommendation equipment defaults"
```

### Task 4: Deterministic method-aware rule engine

**Files:**
- Create: `app/src/features/recommendations/recommendationContext.ts`
- Create: `app/src/features/recommendations/recommendationContext.test.ts`
- Create: `app/src/features/recommendations/feedbackAdjustments.ts`
- Create: `app/src/features/recommendations/feedbackAdjustments.test.ts`
- Create: `app/src/features/recommendations/freshnessRules.ts`
- Create: `app/src/features/recommendations/freshnessRules.test.ts`
- Modify: `app/src/features/recommendations/recommendationTypes.ts`
- Modify: `app/src/features/recommendations/ruleRecommendation.ts`
- Modify: `app/src/features/recommendations/ruleRecommendation.test.ts`
- Modify: `app/src/features/recommendations/templateRecommendation.ts`
- Modify: `app/src/features/recommendations/templateRecommendation.test.ts`
- Modify: `app/src/features/brewTemplates/brewTemplates.ts`

- [ ] **Step 1: Write failing method-isolation and feedback tests**

```ts
expect(generateRuleRecommendation(context('iced_pourover'), beans, mixedLogs, templates)
  ?.references.every((item) => normalizeBrewMode(item.brewLog) === 'iced_pourover')).toBe(true)
expect(lowRatedBitterLogUsedAsBase).toBe(false)
expect(nextRecipe.adjustments).toContainEqual(expect.objectContaining({ source: 'feedback' }))
expect(crossGrinderRecipe.grindSetting).not.toBe('22 clicks')
expect(rulePayload.targetBean).not.toHaveProperty('remaining_grams')
```

Add table tests for all four modes, both cold-brew variants, ratings 1–5, sensory-intensity combinations, roast-age bands, grinder mismatch, sparse history, and blend fields being ignored.

- [ ] **Step 2: Confirm RED**

Run: `cd app; npm test -- src/features/recommendations/recommendationContext.test.ts src/features/recommendations/feedbackAdjustments.test.ts src/features/recommendations/freshnessRules.test.ts src/features/recommendations/ruleRecommendation.test.ts src/features/recommendations/templateRecommendation.test.ts`
Expected: FAIL on missing context and cross-method filtering.

- [ ] **Step 3: Implement isolated rule units**

`RecommendationContext` owns bean, mode, variant, gear, espresso dose, taste goals, and current date. Candidate selection owns mode/rating/gear eligibility. `feedbackAdjustments.ts` returns at most one primary and one secondary bounded change. `freshnessRules.ts` implements the approved roast-band table. `ruleRecommendation.ts` composes these units and returns final parameters plus explicit allowed ranges.

Add only focused iced-pour-over and espresso system templates; retain cold-brew templates, exclude moka-pot and unrelated templates from the four-mode candidate set, and keep champion recipes as non-default references.

- [ ] **Step 4: Verify recommendation tests and commit**

Run: `cd app; npm test -- src/features/recommendations`
Expected: PASS.

```bash
git add app/src/features/recommendations app/src/features/brewTemplates/brewTemplates.ts
git commit -m "feat: add method-aware recommendation rules"
```

### Task 5: Compact bounded DeepSeek optimization

**Files:**
- Create: `app/src/features/recommendations/aiRecommendationContext.ts`
- Create: `app/src/features/recommendations/aiRecommendationContext.test.ts`
- Modify: `app/src/features/recommendations/recommendationService.ts`
- Modify: `app/src/features/recommendations/recommendationService.test.ts`
- Modify: `app/src/features/recommendations/structuredAiRecommendation.ts`
- Modify: `app/src/features/recommendations/structuredAiRecommendation.test.ts`
- Modify: `supabase/functions/recommend-brew/index.ts`
- Modify: `supabase/functions/recommend-brew/index.test.ts`

- [ ] **Step 1: Write failing allow-list and Edge tests**

```ts
expect(JSON.stringify(buildAiRecommendationContext(result))).not.toMatch(
  /remaining_grams|blend_components|blend_notes|source_url|image_url/,
)
expect(context.references).toHaveLength(3)
expect(validateAiRecipe(outOfBoundsRecipe, context.allowedRanges)).toBeNull()
```

Assert the prompt says the rule layer already chose the base, rejects extra request keys, keeps the text content-block array, uses the Vision key/model, and returns a stable upstream error when DeepSeek changes mode/equipment/dose or leaves allowed ranges.

- [ ] **Step 2: Confirm RED**

Run: `cd app; npm test -- src/features/recommendations/aiRecommendationContext.test.ts src/features/recommendations/recommendationService.test.ts src/features/recommendations/structuredAiRecommendation.test.ts`
Expected: FAIL because the frontend currently sends full entities.

Run: `npx --yes deno test --allow-env supabase/functions/recommend-brew/index.test.ts`
Expected: FAIL on the new compact request contract.

- [ ] **Step 3: Implement compact DTO and bounded output validation**

Send only the approved bag-level bean summary, context, final rule recipe, ranges, grouped reasons, three history summaries, selected/alternate template summaries, and taste goals. Remove the prompt instruction that AI chooses the base template. Validate returned mode, gear, espresso dose, cold variant, numeric ranges, and grinder setting before returning structured output.

- [ ] **Step 4: Verify and commit**

Run the focused frontend and Deno commands from Step 2; expected PASS.

```bash
git add app/src/features/recommendations supabase/functions/recommend-brew
git commit -m "feat: bound DeepSeek brew optimization"
```

### Task 6: Recommendation controls, result view, and editable draft

**Files:**
- Create: `app/src/features/recommendations/brewDraft.ts`
- Create: `app/src/features/recommendations/brewDraft.test.ts`
- Modify: `app/src/features/recommendations/RecommendationPanel.tsx`
- Modify: `app/src/features/recommendations/recommendations.css`
- Modify: `app/src/features/auth/AuthPanel.tsx`
- Modify: `app/src/features/beans/BeanDashboard.tsx`
- Modify: `app/src/features/brews/BrewLogPanel.tsx`
- Modify: `app/src/features/brews/brews.css`

- [ ] **Step 1: Write failing draft-mapping tests**

```ts
expect(toBrewDraft(icedRecommendation)).toMatchObject({
  beanId: 'bean-1', brewMode: 'iced_pourover', waterGrams: '150', iceGrams: '90',
})
expect(toBrewDraft(espressoRecommendation)).toMatchObject({
  coffeeGrams: '18', beverageGrams: '36', waterGrams: '',
})
```

- [ ] **Step 2: Confirm RED**

Run: `cd app; npm test -- src/features/recommendations/brewDraft.test.ts`
Expected: FAIL because draft mapping does not exist.

- [ ] **Step 3: Implement controls and in-memory draft handoff**

Load settings with beans/logs/templates, render mode/variant/gear/dose inputs, and generate rules even offline. When online, automatically request DeepSeek after the rule result. Show the optimized recipe first and an expandable rule basis. `AuthenticatedApp` owns nullable `BrewForm` draft state; RecommendationPanel sets it and navigates to beans, BeanDashboard opens the brew section, and BrewLogPanel consumes it once without saving.

Render `iceGrams` only for iced pour-over, `beverageGrams` only for espresso, cold variant only for cold brew, and keep visible keyboard focus/mobile single-column behavior.

- [ ] **Step 4: Verify component behavior and commit**

Run: `cd app; npm test -- src/features/recommendations/brewDraft.test.ts src/features/recommendations/recommendationService.test.ts src/features/brews/brewForm.test.ts`
Expected: PASS.

```bash
git add app/src/features/recommendations app/src/features/auth/AuthPanel.tsx app/src/features/beans/BeanDashboard.tsx app/src/features/brews
git commit -m "feat: create editable brew drafts from recommendations"
```

### Task 7: Full verification and staged deployment

**Files:**
- Modify only if verification exposes a scoped defect.

- [ ] **Step 1: Run full frontend verification**

Run: `cd app; npm test`
Expected: all tests pass.

Run: `cd app; npm run lint`
Expected: exit 0.

Run: `cd app; npm run build`
Expected: exit 0; the existing Vite chunk-size warning is non-blocking.

- [ ] **Step 2: Run Edge verification**

Run: `npx --yes deno test --allow-env supabase/functions/_shared/*.test.ts supabase/functions/import-source/index.test.ts supabase/functions/recommend-brew/index.test.ts`
Expected: all tests pass.

Run: `npx --yes deno fmt --check supabase/functions/recommend-brew/index.ts supabase/functions/recommend-brew/index.test.ts`
Expected: checked files formatted.

- [ ] **Step 3: Verify desktop and phone flows**

At `390x844`, verify all four method inputs, both cold variants, conditional ice/output fields, offline rule generation, AI error fallback, and “用于本次冲煮” opening a populated but unsaved form. At desktop width, verify the form remains compact and readable.

- [ ] **Step 4: Deploy in dependency order**

Deploy the additive Supabase migration first; verify existing row counts and sync snapshot. Deploy `recommend-brew` second and smoke-test authenticated output without saving. Push `foundation` last, wait for GitHub Pages and data-safety workflows, then perform phone and desktop production smoke tests.

- [ ] **Step 5: Final status check**

Run: `git status --short --branch`
Expected: only `task8-final.patch` and `task8-final-v2.patch` remain untracked; local and remote `foundation` match after push.
