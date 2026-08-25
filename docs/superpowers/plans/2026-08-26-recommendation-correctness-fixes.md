# Recommendation Correctness Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make deterministic recommendations internally consistent and mode-safe before DeepSeek optimization, while preserving researched cold-brew concentrate templates.

**Architecture:** Centralize mode and source-specific numeric boundaries in a pure recommendation policy module. Rank already mode-filtered templates with the selected equipment and bag-level bean metadata, then apply feedback and freshness only inside the chosen source boundaries. Recompute dependent masses after every ratio change so the rule recipe is valid before it reaches the Edge Function.

**Tech Stack:** TypeScript 6, React 19, Vitest, Vite, existing Supabase Edge Function contract.

---

### Task 1: Source-aware recommendation boundaries

**Files:**
- Create: `app/src/features/recommendations/recommendationPolicy.ts`
- Create: `app/src/features/recommendations/recommendationPolicy.test.ts`
- Modify: `app/src/features/recommendations/recommendationRanges.ts`
- Modify: `app/src/features/recommendations/methodAwareRuleRecommendation.test.ts`
- Modify: `app/src/features/recommendations/methodAwareRuleRecommendation.ts`

- [ ] **Step 1: Write failing policy and cold-brew tests**

Add table tests proving:

```ts
expect(getRatioEnvelope('cold_brew', 'concentrate')).toEqual({ min: 5, max: 10 })
expect(getFallbackRatioRange('cold_brew', 'concentrate')).toEqual({ min: 7, max: 10 })
expect(getLocalRatioRange('1:5.5', { min: 5, max: 10 })).toEqual({ min: 5, max: 6 })
```

Add integration cases proving the Toddy template produces a rule recipe inside `1:5–1:6`, `18–24°C`, and `12–24h`, while an aged refrigerated cold brew remains inside its final temperature range instead of becoming `84°C`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --run src/features/recommendations/recommendationPolicy.test.ts src/features/recommendations/methodAwareRuleRecommendation.test.ts`

Expected: FAIL because the policy helper does not exist and aged cold brew still returns `84°C`.

- [ ] **Step 3: Implement the pure policy**

Create helpers with these explicit boundaries:

```ts
export function getRatioEnvelope(mode: BrewMode, variant: BrewVariant | null) {
  if (mode === 'cold_brew') return variant === 'concentrate' ? range(5, 10) : range(12, 16)
  if (mode === 'espresso') return range(1.5, 3)
  return range(14, 18)
}

export function getFallbackRatioRange(mode: BrewMode, variant: BrewVariant | null) {
  return mode === 'cold_brew' && variant === 'concentrate'
    ? range(7, 10)
    : getRatioEnvelope(mode, variant)
}

export function getLocalRatioRange(ratio: string | null, envelope: NumericRange) {
  const value = parseRatioDenominator(ratio)
  if (value === null) return envelope
  return range(Math.max(envelope.min, value - 0.5), Math.min(envelope.max, value + 0.5))
}
```

Make `getRecommendationAllowedRanges` accept the selected full template or `null`. For a template source use its temperature/time boundaries and local ratio window; for history use the local ratio window plus mode fallback temperature/time. Preserve the researched Toddy room-temperature boundary rather than intersecting it with refrigerated fallback limits.

- [ ] **Step 4: Normalize the base recipe into the chosen boundary**

Determine the full base template before building the result. Generate `allowedRanges` from the unadjusted source recipe, clamp the rule base into those ranges, and store that same immutable range object for both later adjustments and the AI DTO. Cold brew must retain a template midpoint temperature/time, while history without reliable source bounds uses the refrigerated fallback.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: all selected tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/features/recommendations/recommendationPolicy.ts app/src/features/recommendations/recommendationPolicy.test.ts app/src/features/recommendations/recommendationRanges.ts app/src/features/recommendations/methodAwareRuleRecommendation.ts app/src/features/recommendations/methodAwareRuleRecommendation.test.ts
git commit -m "fix: align recommendation source boundaries"
```

### Task 2: Equipment- and bean-aware template ranking

**Files:**
- Create: `app/src/features/recommendations/methodTemplateRanking.ts`
- Create: `app/src/features/recommendations/methodTemplateRanking.test.ts`
- Modify: `app/src/features/recommendations/methodAwareRuleRecommendation.ts`
- Modify: `app/src/features/recommendations/methodAwareRuleRecommendation.test.ts`

- [ ] **Step 1: Write failing ranking tests**

Cover these behaviors with real built-in templates:

```ts
expect(rankMethodTemplates(oreaContext, brewTemplates)[0].template.id).toBe('hot-orea-balanced-flat')
expect(rankMethodTemplates(darkRoastContext, brewTemplates)[0].template.id).toBe('hot-frontstreet-dark-low-temp')
expect(rankMethodTemplates(coldConcentrateContext, brewTemplates)
  .every(({ template }) => template.brewVariant === 'concentrate')).toBe(true)
```

Also assert that ranking reasons mention compatible equipment or matching roast/flavor, and no score reads blend components or blend notes.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --run src/features/recommendations/methodTemplateRanking.test.ts src/features/recommendations/methodAwareRuleRecommendation.test.ts`

Expected: FAIL because template selection currently sorts mainly by difficulty and array order.

- [ ] **Step 3: Implement the ranker**

Filter by explicit `brewMode` and cold-brew `brewVariant`, then score only:

```text
exact or normalized equipment compatibility
target roast band against suitableFor and avoidFor
bag-level process tokens
shared bean flavor tags
template difficulty as a small tie-breaker
```

When the user supplied equipment and at least one compatible template exists, place incompatible specialized templates below all compatible templates. Return `{ template, score, reasons }` without mutating template data.

- [ ] **Step 4: Use ranking as the single template source**

Replace `selectMethodTemplates` array-order scoring with the new ranker. Build both `templateCandidates` and `baseTemplate` from the same ranked result so the displayed first candidate, rule base source, allowed ranges, and AI selected template cannot disagree.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: all selected tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/features/recommendations/methodTemplateRanking.ts app/src/features/recommendations/methodTemplateRanking.test.ts app/src/features/recommendations/methodAwareRuleRecommendation.ts app/src/features/recommendations/methodAwareRuleRecommendation.test.ts
git commit -m "fix: rank templates by equipment and bean"
```

### Task 3: Mode-safe adjustments and mass conservation

**Files:**
- Modify: `app/src/features/recommendations/freshnessRules.ts`
- Modify: `app/src/features/recommendations/freshnessRules.test.ts`
- Modify: `app/src/features/recommendations/methodAwareRuleRecommendation.ts`
- Modify: `app/src/features/recommendations/methodAwareRuleRecommendation.test.ts`
- Modify: `app/src/features/recommendations/aiRecipeValidation.test.ts`

- [ ] **Step 1: Write failing adjustment tests**

Add cases proving:

```ts
// Aged cold brew does not receive a temperature delta and lowers confidence.
expect(getFreshnessAdjustment({ ...coldInput, oldRoastDate })).toMatchObject({
  extractionDelta: 0,
  confidencePenalty: true,
})

// After a concentration adjustment, displayed ratio and actual output agree.
expect(actualOutput / coffeeGrams).toBeCloseTo(ratioDenominator, 1)
```

Run the mass assertion for hot pour-over, iced pour-over, cold brew, and espresso. For iced pour-over assert `waterGrams + iceGrams` is the output; for espresso assert `beverageGrams` is the output.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --run src/features/recommendations/freshnessRules.test.ts src/features/recommendations/methodAwareRuleRecommendation.test.ts src/features/recommendations/aiRecipeValidation.test.ts`

Expected: FAIL because ratio changes do not recalculate mass and aged cold brew uses the generic extraction delta.

- [ ] **Step 3: Apply adjustments inside final ranges**

Pass `allowedRanges` into the adjustment function. Clamp temperature and ratio against those ranges, execute at most one extraction adjustment and one concentration adjustment, and never apply a cold-brew temperature adjustment from freshness.

- [ ] **Step 4: Recompute dependent masses after ratio changes**

After the final ratio is selected:

```ts
hot/cold: waterGrams = round(coffeeGrams * denominator)
iced: preserve the pre-adjustment ice share within 25–45%, then split rounded total into iceGrams and waterGrams
espresso: beverageGrams = round(coffeeGrams * denominator)
```

Keep cold-brew serving ice out of extraction mass. Ensure the resulting rule recipe itself passes the same mass tolerance used by frontend and Edge Function AI validation.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: all selected tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/features/recommendations/freshnessRules.ts app/src/features/recommendations/freshnessRules.test.ts app/src/features/recommendations/methodAwareRuleRecommendation.ts app/src/features/recommendations/methodAwareRuleRecommendation.test.ts app/src/features/recommendations/aiRecipeValidation.test.ts
git commit -m "fix: keep recommendation adjustments consistent"
```

### Task 4: Full verification

**Files:**
- Modify only if verification exposes an in-scope defect.

- [ ] **Step 1: Run focused recommendation tests**

Run: `npm test -- --run src/features/recommendations`

Expected: all recommendation tests PASS.

- [ ] **Step 2: Run full frontend checks**

Run: `npm test -- --run`, `npm run lint`, and `npm run build` from `app`.

Expected: all tests PASS, ESLint exits 0, and production build succeeds.

- [ ] **Step 3: Run Edge Function contract tests**

Use the repository CI-equivalent Deno command when Deno is available. If local Deno is unavailable, verify the pushed commit through the GitHub `edge-functions` job before production deployment; do not claim local Edge tests ran.

- [ ] **Step 4: Verify at 390 × 844**

Generate one recommendation for each of hot pour-over, iced pour-over, cold brew direct, cold brew concentrate, and espresso. Confirm the rule card has mode-correct temperature/time units and internally consistent mass, and that AI failure still leaves a usable rule draft.

- [ ] **Step 5: Review repository state**

Run: `git diff --check`, `git status --short --branch`, and `git log --oneline -8`.

Expected: only the approved small commits on `foundation`, with no temporary audit files or unrelated changes.
