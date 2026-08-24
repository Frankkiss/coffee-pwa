# Cold Brew Serving Ice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the redundant method selector for cold brew and allow cold-brew concentrate records to store optional serving ice without changing extraction ratio semantics.

**Architecture:** Reuse `ice_grams` with one shared applicability rule: iced pour-over, or cold brew concentrate. Keep cold brew's internal legacy-compatible `method` value as `冷萃`, centralize form visibility/transition behavior in pure helpers, and extend frontend, backup, sync, and Postgres validation together. Apply the additive production migration only after local verification and a separate production approval.

**Tech Stack:** React, TypeScript, Vitest, IndexedDB sync repository, Supabase Postgres migrations and pgTAP, Vite PWA.

---

### Task 1: Lock the form and measurement semantics with failing tests

**Files:**
- Modify: `app/src/features/brews/brewMethodMeasurements.test.ts`
- Create: `app/src/features/brews/brewFormPresentation.test.ts`
- Create: `app/src/features/brews/brewFormPresentation.ts`

- [ ] **Step 1: Write failing measurement tests**

Add cases proving a concentrate stores `ice_grams: 120` while retaining extraction ratio `1:8`, direct-drink cold brew clears ice, and an existing concentrate record round-trips its ice value.

```ts
it('stores serving ice for cold brew concentrate without changing extraction ratio', () => {
  const payload = toBrewLogUpdatePayload({
    ...createInitialBrewForm('bean-1'), method: '冷萃', brewMode: 'cold_brew',
    brewVariant: 'concentrate', coffeeGrams: '50', waterGrams: '400', iceGrams: '120',
  })
  expect(payload).toMatchObject({ ice_grams: 120, ratio: '1:8' })
})

it('clears serving ice for ready-to-drink cold brew', () => {
  const payload = toBrewLogUpdatePayload({
    ...createInitialBrewForm('bean-1'), method: '冷萃', brewMode: 'cold_brew',
    brewVariant: 'ready_to_drink', coffeeGrams: '50', waterGrams: '650', iceGrams: '120',
  })
  expect(payload.ice_grams).toBeNull()
})
```

- [ ] **Step 2: Write failing presentation tests**

```ts
expect(getBrewFormPresentation('cold_brew', 'concentrate')).toEqual({
  showMethod: false, showIceGrams: true,
})
expect(getBrewFormPresentation('cold_brew', 'ready_to_drink')).toEqual({
  showMethod: false, showIceGrams: false,
})
expect(getBrewFormPresentation('iced_pourover', '')).toEqual({
  showMethod: true, showIceGrams: true,
})
```

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test --prefix app -- --run src/features/brews/brewMethodMeasurements.test.ts src/features/brews/brewFormPresentation.test.ts`

Expected: FAIL because concentrate ice is currently cleared and `getBrewFormPresentation` does not exist.

- [ ] **Step 4: Add the minimal pure presentation helper**

```ts
export function getBrewFormPresentation(mode: BrewMode | '', variant: BrewVariant | '') {
  return {
    showMethod: mode !== 'cold_brew',
    showIceGrams: mode === 'iced_pourover' || (mode === 'cold_brew' && variant === 'concentrate'),
  }
}
```

- [ ] **Step 5: Commit the test boundary and helper**

```bash
git add app/src/features/brews/brewMethodMeasurements.test.ts app/src/features/brews/brewFormPresentation.ts app/src/features/brews/brewFormPresentation.test.ts
git commit -m "test: define cold brew serving ice behavior"
```

### Task 2: Implement cold brew form behavior

**Files:**
- Modify: `app/src/features/brews/brewForm.ts`
- Modify: `app/src/features/brews/BrewLogPanel.tsx`
- Test: `app/src/features/brews/brewMethodMeasurements.test.ts`
- Test: `app/src/features/brews/brewFormPresentation.test.ts`

- [ ] **Step 1: Serialize serving ice only for supported combinations**

In `toBrewLogUpdatePayload`, compute:

```ts
const storesIceGrams = brewMode === 'iced_pourover'
  || (brewMode === 'cold_brew' && brewVariant === 'concentrate')
const iceGrams = storesIceGrams ? optionalNumber(form.iceGrams) : null
const ratioWaterGrams = brewMode === 'iced_pourover'
  ? sumNullable(waterGrams, iceGrams)
  : brewMode === 'espresso' ? beverageGrams : waterGrams
```

For cold brew, normalize the persisted method to `冷萃` before compatibility validation so the hidden control cannot submit an incompatible stale method.

- [ ] **Step 2: Update mode and variant transitions**

Add an `updateBrewVariant` handler that retains ice only for `concentrate`; switching to `ready_to_drink` clears it. `updateBrewMode` sets cold brew method to `冷萃`, preserves ice only when the resulting presentation supports it, and clears hidden values otherwise.

- [ ] **Step 3: Render progressive fields**

Wrap the method label with `presentation.showMethod`. Render the existing `冰量` input when `presentation.showIceGrams`. Route the cold brew subtype selector through `updateBrewVariant`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test --prefix app -- --run src/features/brews/brewMethodMeasurements.test.ts src/features/brews/brewFormPresentation.test.ts`

Expected: all focused tests PASS.

- [ ] **Step 5: Commit the UI behavior**

```bash
git add app/src/features/brews/BrewLogPanel.tsx app/src/features/brews/brewForm.ts app/src/features/brews/brewFormPresentation.ts app/src/features/brews/*.test.ts
git commit -m "feat: simplify cold brew log fields"
```

### Task 3: Extend offline, backup, and sync validation

**Files:**
- Modify: `app/src/features/brews/brewMode.ts`
- Modify: `app/src/features/brews/brewMode.test.ts`
- Modify: `app/src/features/sync/localRepository.ts`
- Modify: `app/src/features/sync/localRepository.test.ts`
- Modify: `app/src/features/sync/syncApi.ts`
- Modify: `app/src/features/sync/syncApi.test.ts`
- Modify: `app/src/features/backup/backupImport.ts`
- Modify: `app/src/features/backup/backupImport.test.ts`

- [ ] **Step 1: Write failing validation tests**

Add one accepted record with `brew_mode: 'cold_brew'`, `brew_variant: 'concentrate'`, `ice_grams: 120`, plus rejected ready-to-drink and hot-pourover cases, to local repository, sync snapshot, and backup import suites.

- [ ] **Step 2: Run validation tests and verify RED**

Run: `npm test --prefix app -- --run src/features/brews/brewMode.test.ts src/features/sync/localRepository.test.ts src/features/sync/syncApi.test.ts src/features/backup/backupImport.test.ts`

Expected: concentrate records fail the current iced-pourover-only validation.

- [ ] **Step 3: Add and reuse one applicability predicate**

```ts
export function allowsIceGrams(mode: unknown, variant: unknown) {
  return mode === 'iced_pourover'
    || (mode === 'cold_brew' && variant === 'concentrate')
}
```

Replace each `ice_grams == null || brew_mode === 'iced_pourover'` check with `ice_grams == null || allowsIceGrams(brew_mode, brew_variant)`. Keep nonnegative finite-number validation unchanged.

- [ ] **Step 4: Run validation tests and verify GREEN**

Run the command from Step 2; expected: all selected tests PASS.

- [ ] **Step 5: Commit the validation change**

```bash
git add app/src/features/brews/brewMode.ts app/src/features/brews/brewMode.test.ts app/src/features/sync app/src/features/backup
git commit -m "feat: validate cold brew serving ice"
```

### Task 4: Add and verify the additive Supabase migration

**Files:**
- Create: `supabase/migrations/20260824010000_cold_brew_serving_ice.sql`
- Modify: `supabase/tests/005_sync_foundation.test.sql`
- Modify: `supabase/tests/007_backup_v2.test.sql`

- [ ] **Step 1: Write failing pgTAP coverage**

Add transactions proving sync and backup preview accept concentrate ice, and reject the same ice value for direct-drink cold brew.

- [ ] **Step 2: Run SQL tests and verify RED**

Run: `npx --yes supabase db reset && npx --yes supabase test db`

Expected: new concentrate-ice assertions FAIL against the old constraint.

- [ ] **Step 3: Add the constraint migration**

Drop and recreate only `brew_logs_method_measurements_check` with:

```sql
check (
  (brew_variant is null or brew_mode = 'cold_brew')
  and (
    ice_grams is null
    or brew_mode = 'iced_pourover'
    or (brew_mode = 'cold_brew' and brew_variant = 'concentrate')
  )
  and (beverage_grams is null or brew_mode = 'espresso')
)
```

Replace `private.validate_backup_preview_row` so its ice condition uses the identical predicate. Do not rewrite rows or alter any existing values.

- [ ] **Step 4: Run SQL tests and lint**

Run: `npx --yes supabase db reset`, `npx --yes supabase test db`, and `npx --yes supabase db lint --local`.

Expected: migrations apply cleanly, all pgTAP tests PASS, lint reports no new errors.

- [ ] **Step 5: Commit the migration**

```bash
git add supabase/migrations/20260824010000_cold_brew_serving_ice.sql supabase/tests/005_sync_foundation.test.sql supabase/tests/007_backup_v2.test.sql
git commit -m "feat: persist cold brew serving ice"
```

### Task 5: Full verification and production gate

**Files:**
- Modify only if verification exposes a defect in files already listed above.

- [ ] **Step 1: Run frontend verification**

Run: `npm test --prefix app -- --run` and `npm run build --prefix app`.

Expected: all tests and production build PASS.

- [ ] **Step 2: Verify at 390 × 844**

Confirm cold brew shows subtype but no method; concentrate shows ice; direct drink hides it; iced pour-over remains unchanged; editing existing records round-trips correctly.

- [ ] **Step 3: Check repository state**

Run: `git status --short --branch` and `git log --oneline -8`.

Expected: only intentional commits, no unrelated user files.

- [ ] **Step 4: Dry-run production migration**

Run: `npx --yes supabase db push --linked --dry-run`.

Expected: only `20260824010000_cold_brew_serving_ice.sql` is listed.

- [ ] **Step 5: Stop for explicit production approval**

Do not run the real `supabase db push --linked` or push Git commits until the user reviews verification evidence and explicitly approves deployment.
