# Iced Pour-over Ratio Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every iced pour-over ratio mean hot water divided by coffee, while keeping ice independent and correcting old-record presentation without a data migration.

**Architecture:** Add one pure brew-ratio helper for record write/read semantics, then reuse the same invariant in history analysis, deterministic recommendations, frontend AI validation, and the Supabase Edge contract. Correct the two system iced templates and keep legacy stored rows untouched; derived views and recommendation contexts override ambiguous stored iced ratios only when real coffee and hot-water masses exist.

**Tech Stack:** React 19, TypeScript 6, Vitest, Deno tests, Supabase Edge Functions, Vite.

---

### Task 1: Canonical record ratio and old-record presentation

**Files:**
- Create: `app/src/features/brews/brewRatio.ts`
- Create: `app/src/features/brews/brewRatio.test.ts`
- Modify: `app/src/features/brews/brewForm.ts`
- Modify: `app/src/features/brews/brewMethodMeasurements.test.ts`
- Modify: `app/src/features/brews/BrewLogPanel.tsx`
- Modify: `app/src/features/brews/brewLogDetailModel.ts`
- Modify: `app/src/features/brews/brewLogDetailModel.test.ts`

- [x] **Step 1: Write failing ratio tests**

Add tests proving `15g coffee + 150g hot water + 90g ice` saves and displays as `1:10`, and an old iced row with stored `1:16` displays `1:10` from its real masses. A legacy iced row missing either coffee or hot water must return no derived ratio.

```ts
expect(deriveRatioFromMasses('iced_pourover', 15, 150, null)).toBe('1:10')
expect(getCanonicalBrewRatio({ ...icedLog, coffee_grams: 15, water_grams: 150, ratio: '1:16' })).toBe('1:10')
expect(getCanonicalBrewRatio({ ...icedLog, water_grams: null, ratio: '1:16' })).toBeNull()
```

- [x] **Step 2: Run the focused tests and verify RED**

Run: `npm --prefix app test -- src/features/brews/brewRatio.test.ts src/features/brews/brewMethodMeasurements.test.ts src/features/brews/brewLogDetailModel.test.ts`

Expected: FAIL because iced records still add ice to the ratio and views still read stored `ratio` directly.

- [x] **Step 3: Implement the pure helper and use it at write/read boundaries**

Implement `deriveRatioFromMasses(mode, coffee, water, beverage)` so iced, hot pour-over, and cold brew use water, while espresso uses beverage. Implement `getCanonicalBrewRatio(log)` so valid iced masses override the stored ratio and incomplete iced rows return `null`; non-iced records retain their stored ratio for compatibility. Remove `sumNullable` from `brewForm.ts`.

Use the canonical ratio in the brew card summary and detail model. Label iced detail ratios `粉水比（仅热水）` and iced water `热水量`.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2.

Expected: all focused brew tests PASS.

- [x] **Step 5: Commit**

```bash
git add app/src/features/brews
git commit -m "fix: correct iced brew record ratios"
```

### Task 2: Correct history, templates, and deterministic rules

**Files:**
- Modify: `app/src/features/recommendations/historyRecipeFacts.ts`
- Modify: `app/src/features/recommendations/historyRecipeFacts.test.ts`
- Modify: `app/src/features/recommendations/recommendationPolicy.ts`
- Modify: `app/src/features/recommendations/methodAwareRuleRecommendation.ts`
- Modify: `app/src/features/recommendations/methodAwareRuleRecommendation.test.ts`
- Modify: `app/src/features/brewTemplates/brewTemplateTypes.ts`
- Modify: `app/src/features/brewTemplates/brewTemplates.ts`
- Modify: `app/src/features/brewTemplates/brewTemplateMode.test.ts`

- [x] **Step 1: Write failing history, template, and rule tests**

Change the iced history expectation from `(150 + 75) / 15 = 1:15` to `150 / 15 = 1:10`. Add assertions that Orea uses 150g hot water, 75g ice and `1:10`, while Seven Miles uses 105g hot water, 105g ice and `1:7`. Update the mass invariant:

```ts
const ratioMass = mode === 'espresso' ? recipe.beverageGrams : recipe.waterGrams
expect((ratioMass ?? 0) / (recipe.coffeeGrams ?? 1)).toBeCloseTo(denominator, 1)
```

Assert `getRatioEnvelope('iced_pourover', null)` equals `{ min: 7, max: 12 }`.

- [x] **Step 2: Run focused tests and verify RED**

Run: `npm --prefix app test -- src/features/recommendations/historyRecipeFacts.test.ts src/features/recommendations/methodAwareRuleRecommendation.test.ts src/features/brewTemplates/brewTemplateMode.test.ts`

Expected: FAIL because history, templates, ranges, and recomputation still use total liquid.

- [x] **Step 3: Implement the new rule invariant**

Reuse `deriveRatioFromMasses` in history analysis. Add optional `iceGrams` to in-memory `BrewTemplate`, set the two system template values explicitly, and correct their final hot-water targets and source notes.

For iced rule recomputation, calculate hot water from the ratio, then preserve the previous ice share of total liquid:

```ts
const water = Math.round(coffee * denominator)
const share = clamp(previousIceShare, 0.25, 0.5)
const ice = Math.round(water * share / (1 - share))
```

Use the explicit system-template ice when present and retain the existing 35% total-liquid fallback only for templates without an ice field. Change the iced global ratio envelope to `1:7–1:12`; keep template/history local windows at ±0.5.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2.

Expected: all focused history/template/rule tests PASS.

- [x] **Step 5: Commit**

```bash
git add app/src/features/recommendations app/src/features/brewTemplates
git commit -m "fix: align iced recommendation ratios"
```

### Task 3: Align AI contracts and user-visible explanations

**Files:**
- Modify: `app/src/features/recommendations/aiRecipeValidation.ts`
- Modify: `app/src/features/recommendations/aiRecipeValidation.test.ts`
- Modify: `app/src/features/recommendations/RecommendationPanel.tsx`
- Modify: `app/src/features/recommendations/StructuredAiRecommendationView.tsx`
- Modify: `supabase/functions/recommend-brew/contract.ts`
- Modify: `supabase/functions/recommend-brew/contract.test.ts`
- Modify: `supabase/functions/recommend-brew/prompt.ts`
- Modify: `supabase/functions/recommend-brew/prompt.test.ts`

- [ ] **Step 1: Write failing frontend and Edge tests**

Add an iced recipe with 15g coffee, 150g hot water, 75g ice, and ratio `1:10`; require both validators to accept it. Change only the ratio to `1:15` and require rejection because that value incorrectly includes ice. Require the prompt to include `冰手冲粉水比只计算热水，不包含冰量`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm --prefix app test -- src/features/recommendations/aiRecipeValidation.test.ts
npx --yes deno test --allow-env supabase/functions/recommend-brew/contract.test.ts supabase/functions/recommend-brew/prompt.test.ts
```

Expected: FAIL because both validators still compare the ratio with hot water plus ice and the prompt omits the semantic rule.

- [ ] **Step 3: Implement frontend, Edge, and copy changes**

In both mass validators, compare iced ratio against `waterGrams / coffeeGrams`; continue independently validating `iceGrams` and final water/ice step targets. Add the explicit prompt sentence. In rule and structured AI cards, label iced ratios `粉水比（仅热水）`, hot water `热水量`, and keep `冰量` separate.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the commands from Step 2.

Expected: all focused frontend and Edge tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/features/recommendations supabase/functions/recommend-brew
git commit -m "fix: enforce iced ratio AI boundaries"
```

### Task 4: Full verification and release gate

**Files:**
- Modify: `docs/superpowers/plans/2026-08-27-iced-pourover-ratio.md`

- [ ] **Step 1: Run complete frontend verification**

Run:

```bash
npm --prefix app test
npm --prefix app run lint
npm --prefix app run build
```

Expected: all tests PASS, ESLint exits 0, and Vite production build completes.

- [ ] **Step 2: Run complete Edge verification**

Run:

```bash
npx --yes deno test --allow-env supabase/functions
npx --yes deno fmt --check supabase/functions/recommend-brew
```

Expected: all Edge tests PASS and all six recommend-brew files are formatted.

- [ ] **Step 3: Verify mobile-sized core flows**

At a phone-sized viewport, confirm an iced brew with 15g coffee, 150g hot water, and 90g ice shows `1:10`; an old conflicting row also displays `1:10`; Orea and Seven Miles rule recommendations show `1:10`/`1:7`, separate hot water and ice, and no total-liquid ratio explanation. Do not save an AI result during verification.

- [ ] **Step 4: Record verification and commit**

Mark completed checkboxes only after evidence exists, then commit the plan update:

```bash
git add docs/superpowers/plans/2026-08-27-iced-pourover-ratio.md
git commit -m "docs: record iced ratio verification"
```

- [ ] **Step 5: Deployment and push gate**

Deploy only `recommend-brew` after the user explicitly approves production deployment. Push `foundation` only after the Edge version is active, one authenticated iced recommendation passes the new contract, GitHub Data Safety Checks pass, and GitHub Pages deployment succeeds.
