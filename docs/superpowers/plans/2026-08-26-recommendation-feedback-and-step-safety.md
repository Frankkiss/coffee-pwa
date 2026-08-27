# Recommendation Feedback and Step Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本项目按用户要求使用 `superpowers:executing-plans` 内联执行，不启用子智能体。

**Goal:** 让大白话冲煮反馈可靠进入下一次推荐，阻止不完整历史记录和虚构比例成为规则基础，并对四类 DeepSeek 冲煮步骤执行模式化重量校验。

**Architecture:** 保留现有数据库、同步、备份和推荐主流程，在规则层新增纯函数边界：反馈文本只产生有界调整，历史记录先分析核心重量与比例来源再参与基础选择。Edge Function 校验新步骤结构，前端将新结构归一化为统一展示模型并兼容旧 `pourPlan`。

**Tech Stack:** React 19、TypeScript 6、Vitest、Supabase Edge Functions、Deno 2.9.5、DeepSeek JSON 输出、Vite PWA。

---

## Scope and file map

- `app/src/features/recommendations/feedbackAdjustments.ts`：离线解析结构化感官值和大白话反馈。
- `app/src/features/recommendations/historyRecipeFacts.ts`：集中判断历史记录基础资格并推导可靠比例。
- `app/src/features/recommendations/methodAwareRuleRecommendation.ts`：区分基础候选与参考记录，使用模板补齐非核心参数。
- `app/src/features/recommendations/aiRecommendationContext.ts`：把最近低评分原始反馈加入现有受限上下文。
- `supabase/functions/recommend-brew/contract.ts`：校验新 AI 步骤的模式、时间和重量。
- `supabase/functions/recommend-brew/prompt.ts`：按四种方式约束 DeepSeek 步骤语义。
- `app/src/features/recommendations/structuredAiRecommendation.ts`：归一化新步骤并兼容旧步骤。
- `app/src/features/recommendations/aiBrewStepValidation.ts`：前端防御性复核步骤和最终处方的一致性。
- `app/src/features/recommendations/StructuredAiRecommendationView.tsx`：统一显示“冲煮步骤”和重量类型。
- `app/src/features/recommendations/savedRecommendationList.ts`：同时读取新步骤和旧 `waterGrams` 步骤。
- 不修改 `supabase/sql/**`、同步仓库、离线队列或备份格式。

### Task 1: Parse plain-language feedback and expose it to the existing AI request

**Files:**
- Modify: `app/src/features/recommendations/feedbackAdjustments.ts`
- Modify: `app/src/features/recommendations/feedbackAdjustments.test.ts`
- Modify: `app/src/features/recommendations/recommendationTypes.ts`
- Modify: `app/src/features/recommendations/methodAwareRuleRecommendation.ts`
- Modify: `app/src/features/recommendations/aiRecommendationContext.ts`
- Modify: `app/src/features/recommendations/aiRecommendationContext.test.ts`
- Modify: `app/src/features/brews/BrewLogPanel.tsx`

- [ ] **Step 1: Add failing natural-language feedback tests**

Add these cases inside the existing `describe('feedback adjustments', ...)` block:

```ts
it.each([
  ['偏苦，有点涩', 'extraction', 'decrease'],
  ['酸得尖，像没萃开', 'extraction', 'increase'],
  ['甜感不足，喝起来空', 'extraction', 'increase'],
  ['太淡了，水感明显', 'concentration', 'increase'],
  ['太厚重，尾段发闷', 'concentration', 'decrease'],
] as const)('parses low-rated plain-language feedback: %s', (notes, target, direction) => {
  expect(deriveFeedbackAdjustments(log({ rating: 2, notes }), []))
    .toContainEqual(expect.objectContaining({ target, direction }))
})

it.each([
  '酸得舒服，果酸很明亮',
  '醇厚但平衡，我很喜欢',
] as const)('does not turn accepted sensory language into a correction: %s', (notes) => {
  expect(deriveFeedbackAdjustments(log({ rating: 2, notes }), ['明亮']))
    .toEqual([])
})

it('does not adjust a high-rated brew from ordinary tasting notes', () => {
  expect(deriveFeedbackAdjustments(log({ rating: 4, notes: '莓果酸质，醇厚甜感' }), []))
    .toEqual([])
})
```

- [ ] **Step 2: Run the focused test and verify the new cases fail**

Run from `D:\coffee\app`:

```powershell
npm test -- --run src/features/recommendations/feedbackAdjustments.test.ts
```

Expected: the existing structured-field tests pass; the new natural-language cases fail because notes are not yet classified.

- [ ] **Step 3: Implement deterministic note classification**

Add these helpers to `feedbackAdjustments.ts` and use their booleans alongside the existing structured values:

```ts
type NoteSignals = {
  reduceExtraction: boolean
  increaseExtraction: boolean
  increaseConcentration: boolean
  decreaseConcentration: boolean
}

function noteSignals(notes: string | null, tasteGoals: string[]): NoteSignals {
  const text = notes?.trim() ?? ''
  const acceptsBrightness = tasteGoals.some((goal) => /明亮|酸质|果酸/.test(goal))
    || /酸得舒服|果酸.{0,6}(喜欢|舒服|明亮|平衡)|喜欢.{0,6}(果酸|酸质)/.test(text)
  const acceptsBody = /醇厚.{0,6}(喜欢|舒服|平衡)|喜欢.{0,6}醇厚/.test(text)
  const reduceExtraction = /偏苦|苦涩|干涩|萃取过度|过萃/.test(text)
  const increaseExtraction = !acceptsBrightness
    && /尖酸|酸得尖|酸涩|没萃开|萃取不足|欠萃/.test(text)
  const increaseConcentration = /太淡|水感|寡淡|很薄|偏薄/.test(text)
  const decreaseConcentration = !acceptsBody
    && /太厚|厚重|发闷|黏重|闷重/.test(text)

  return {
    reduceExtraction,
    increaseExtraction,
    increaseConcentration,
    decreaseConcentration,
  }
}
```

At the start of `deriveFeedbackAdjustments`, compute `const signals = noteSignals(brewLog.notes, tasteGoals)`. Update the decision booleans as follows:

```ts
const bitterOrAstringent = isHigh(brewLog.bitterness)
  || isHigh(brewLog.astringency)
  || signals.reduceExtraction
const sharpAcidity = (isHigh(brewLog.acidity) || signals.increaseExtraction)
  && (!brightPreferred || signals.increaseExtraction)
const weakSweetness = isLow(brewLog.sweetness)
  || /甜感不足|不够甜|缺少甜感/.test(brewLog.notes ?? '')
```

Keep extraction precedence as `reduceExtraction` → `increaseExtraction` → `weakSweetness`. For concentration, combine structured body values with `signals.increaseConcentration` and `signals.decreaseConcentration`. Continue returning `adjustments.slice(0, 2)`.

- [ ] **Step 4: Run feedback tests and verify they pass**

Run:

```powershell
npm test -- --run src/features/recommendations/feedbackAdjustments.test.ts
```

Expected: all feedback tests pass, including accepted-positive wording and the `rating > 3` gate.

- [ ] **Step 5: Add a compact feedback source to the rule result**

Add to `recommendationTypes.ts`:

```ts
export type RecommendationFeedbackSource = {
  brewLogId: string
  rating: number
  notes: string
}
```

Add this optional field to `RuleRecommendationResult`:

```ts
feedbackSource?: RecommendationFeedbackSource | null
```

In `generateMethodAwareRuleRecommendation`, populate it from `latestFeedback` without changing persistence:

```ts
feedbackSource: latestFeedback?.rating !== null
  ? {
      brewLogId: latestFeedback.id,
      rating: latestFeedback.rating,
      notes: (latestFeedback.notes ?? '').slice(0, 240),
    }
  : null,
```

In `buildAiRecommendationContext`, append the original feedback to `rule.reasons.feedback`:

```ts
feedback: [
  ...(result.feedbackAdjustments?.map((item) => item.reason) ?? []),
  ...(result.feedbackSource?.notes
    ? [`上一杯评分 ${result.feedbackSource.rating}/5，原始反馈：${result.feedbackSource.notes}`]
    : []),
],
```

This keeps the existing version-2 request schema unchanged because `feedback` remains a bounded string array.

- [ ] **Step 6: Test that the bounded AI context includes the raw low-score feedback**

In `aiRecommendationContext.test.ts`, add these exact fields to the object returned by `createResult()`:

```ts
feedbackAdjustments: [{
  source: 'feedback',
  priority: 'primary',
  target: 'extraction',
  direction: 'decrease',
  reason: '上一杯偏苦，降低萃取压力',
  limits: { temperatureC: 2, timePercent: 10, ratioDenominator: 0.5, grindSteps: 1 },
}],
feedbackSource: {
  brewLogId: 'brew-feedback',
  rating: 2,
  notes: '偏苦，有点涩',
},
```

Then assert:

```ts
expect(context.rule.reasons.feedback).toEqual([
  '上一杯偏苦，降低萃取压力',
  '上一杯评分 2/5，原始反馈：偏苦，有点涩',
])
```

Run:

```powershell
npm test -- --run src/features/recommendations/aiRecommendationContext.test.ts src/features/recommendations/feedbackAdjustments.test.ts
```

Expected: both files pass and the serialized context still excludes remaining amount, URLs, images and blend internals.

- [ ] **Step 7: Clarify the existing notes field without adding controls**

Change the notes placeholder in `BrewLogPanel.tsx` to:

```tsx
placeholder="例如：偏苦有点涩、酸得尖、太淡，或醇厚但很喜欢"
```

Do not add the six sensory score inputs and do not call AI during save.

- [ ] **Step 8: Commit the feedback slice**

```powershell
git add -- app/src/features/recommendations/feedbackAdjustments.ts app/src/features/recommendations/feedbackAdjustments.test.ts app/src/features/recommendations/recommendationTypes.ts app/src/features/recommendations/methodAwareRuleRecommendation.ts app/src/features/recommendations/aiRecommendationContext.ts app/src/features/recommendations/aiRecommendationContext.test.ts app/src/features/brews/BrewLogPanel.tsx
git commit -m "fix: use plain-language brew feedback"
```

### Task 2: Reject incomplete history bases and derive ratios only from facts

**Files:**
- Create: `app/src/features/recommendations/historyRecipeFacts.ts`
- Create: `app/src/features/recommendations/historyRecipeFacts.test.ts`
- Modify: `app/src/features/recommendations/methodAwareRuleRecommendation.ts`
- Modify: `app/src/features/recommendations/methodAwareRuleRecommendation.test.ts`

- [ ] **Step 1: Write focused history-fact tests**

Create `historyRecipeFacts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { BrewLog } from '../brews/brewTypes'
import { analyzeHistoryRecipe } from './historyRecipeFacts'

function log(overrides: Partial<BrewLog>): BrewLog {
  return {
    coffee_grams: null,
    water_grams: null,
    ice_grams: null,
    beverage_grams: null,
    ratio: null,
    ...overrides,
  } as BrewLog
}

describe('history recipe facts', () => {
  it('derives each mode ratio from its real output masses', () => {
    expect(analyzeHistoryRecipe(log({ coffee_grams: 15, water_grams: 240 }), 'hot_pourover').ratio).toBe('1:16')
    expect(analyzeHistoryRecipe(log({ coffee_grams: 15, water_grams: 150, ice_grams: 75 }), 'iced_pourover').ratio).toBe('1:15')
    expect(analyzeHistoryRecipe(log({ coffee_grams: 50, water_grams: 700 }), 'cold_brew').ratio).toBe('1:14')
    expect(analyzeHistoryRecipe(log({ coffee_grams: 18, beverage_grams: 36 }), 'espresso').ratio).toBe('1:2')
  })

  it('prefers masses over a conflicting recorded ratio', () => {
    expect(analyzeHistoryRecipe(log({ coffee_grams: 18, beverage_grams: 45, ratio: '1:2' }), 'espresso'))
      .toMatchObject({ ratio: '1:2.5', ratioSource: 'weights', eligible: true })
  })

  it('does not invent a ratio or accept parameter fragments as a base', () => {
    expect(analyzeHistoryRecipe(log({ grind_setting: '22 clicks' }), 'hot_pourover'))
      .toEqual({ ratio: null, ratioSource: null, eligible: false })
    expect(analyzeHistoryRecipe(log({ coffee_grams: 18 }), 'espresso').eligible).toBe(false)
  })

  it('keeps ratio-only iced history as reference-only because the hot-water/ice split is unknown', () => {
    expect(analyzeHistoryRecipe(log({ coffee_grams: 15, ratio: '1:15' }), 'iced_pourover'))
      .toMatchObject({ ratio: '1:15', ratioSource: 'recorded', eligible: false })
  })
})
```

- [ ] **Step 2: Run the new test and verify it fails because the module does not exist**

Run:

```powershell
npm test -- --run src/features/recommendations/historyRecipeFacts.test.ts
```

Expected: FAIL with an unresolved `./historyRecipeFacts` import.

- [ ] **Step 3: Implement the pure history analyzer**

Create `historyRecipeFacts.ts`:

```ts
import type { BrewLog, BrewMode } from '../brews/brewTypes'
import { parseRatioDenominator } from './recommendationPolicy'

export type HistoryRecipeFacts = {
  ratio: string | null
  ratioSource: 'weights' | 'recorded' | null
  eligible: boolean
}

export function analyzeHistoryRecipe(log: BrewLog, mode: BrewMode): HistoryRecipeFacts {
  const coffee = positive(log.coffee_grams)
  const water = positive(log.water_grams)
  const ice = positive(log.ice_grams)
  const beverage = positive(log.beverage_grams)
  const weightedDenominator = coffee === null ? null
    : mode === 'espresso' && beverage !== null ? beverage / coffee
    : mode === 'iced_pourover' && water !== null && ice !== null ? (water + ice) / coffee
    : mode !== 'espresso' && mode !== 'iced_pourover' && water !== null ? water / coffee
    : null
  const recordedDenominator = parseRatioDenominator(log.ratio)
  const denominator = weightedDenominator ?? recordedDenominator
  const ratio = denominator === null ? null : formatRatio(denominator)
  const eligible = coffee !== null && denominator !== null
    && (mode !== 'iced_pourover' || weightedDenominator !== null)

  return {
    ratio,
    ratioSource: weightedDenominator !== null ? 'weights' : recordedDenominator !== null ? 'recorded' : null,
    eligible,
  }
}

function positive(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function formatRatio(value: number) {
  return `1:${Math.round(value * 10) / 10}`
}
```

- [ ] **Step 4: Run the analyzer tests and verify they pass**

Run:

```powershell
npm test -- --run src/features/recommendations/historyRecipeFacts.test.ts
```

Expected: all history-fact tests pass.

- [ ] **Step 5: Add failing recommendation integration cases**

Append these cases to `methodAwareRuleRecommendation.test.ts`:

```ts
it('uses an incomplete high-rated history only as a reference and falls back to a template base', () => {
  const result = generateMethodAwareRuleRecommendation(
    context('hot_pourover'),
    [bean()],
    [log('hot_pourover', {
      id: 'fragment',
      rating: 5,
      coffee_grams: null,
      water_grams: 240,
      ratio: '1:16',
    })],
    brewTemplates,
  )

  expect(result?.primary).toBeNull()
  expect(result?.references.map((item) => item.brewLog.id)).toContain('fragment')
  expect(result?.baseSource.type).toBe('template')
  expect(result?.recommended.coffeeGrams).toBeGreaterThan(0)
})

it('derives a missing cold-brew ratio from real masses', () => {
  const result = generateMethodAwareRuleRecommendation(
    context('cold_brew', 'ready_to_drink'),
    [bean()],
    [log('cold_brew', {
      brew_variant: 'ready_to_drink',
      coffee_grams: 50,
      water_grams: 700,
      ratio: null,
    })],
    brewTemplates,
  )

  expect(result?.primary).not.toBeNull()
  expect(result?.recommended.ratio).toBe('1:14')
  expect(result?.allowedRanges?.ratioDenominator).toEqual({ min: 13.5, max: 14.5 })
})

it('fills non-core history parameters from the best compatible template', () => {
  const result = generateMethodAwareRuleRecommendation(
    context('hot_pourover'),
    [bean()],
    [log('hot_pourover', {
      water_temperature_c: null,
      total_time_seconds: null,
      grind_setting: null,
    })],
    brewTemplates,
  )

  expect(result?.primary).not.toBeNull()
  expect(result?.recommended.waterTemperatureC).not.toBeNull()
  expect(result?.recommended.totalTimeSeconds).not.toBeNull()
  expect(result?.recommended.grindSetting).not.toBeNull()
})

it('does not narrow a ratio range around an invented default', () => {
  const result = generateMethodAwareRuleRecommendation(
    context('cold_brew', 'concentrate'),
    [bean()],
    [log('cold_brew', {
      brew_variant: 'concentrate',
      coffee_grams: null,
      water_grams: null,
      ratio: null,
      grind_setting: '粗',
    })],
    [],
  )

  expect(result).toBeNull()
})
```

- [ ] **Step 6: Run the recommendation tests and confirm the fragment case fails**

Run:

```powershell
npm test -- --run src/features/recommendations/methodAwareRuleRecommendation.test.ts
```

Expected: the new cases fail because `hasUsableParameters` still accepts fragments and `ratioDenominator(null)` still returns 15.

- [ ] **Step 7: Separate reference candidates from eligible base candidates**

In `generateMethodAwareRuleRecommendation`, select the optional-field fallback without using an incompatible specialized brewer:

```ts
const rankedTemplates = rankMethodTemplates(context, templates)
const fallbackTemplate = rankedTemplates.find((item) => item.reasons.includes('器具匹配'))?.template
  ?? (!context.gear.brewer ? rankedTemplates[0]?.template ?? null : null)
```

Then:

1. Score all matching records into `referenceCandidates`.
2. Apply `selectRatingTier` only to records where `analyzeHistoryRecipe(log, context.mode).eligible` is true.
3. Use the eligible candidates for `primary`.
4. Return `references: referenceCandidates.slice(0, 3)` so incomplete records remain visible as references.

Use this structure:

```ts
const referenceCandidates = matchingLogs
  .map((log) => scoreHistory(context, beanById.get(log.bean_id ?? '') ?? null, log, fallbackTemplate))
  .sort(compareCandidates)
const basePool = selectRatingTier(
  matchingLogs.filter((log) => analyzeHistoryRecipe(log, context.mode).eligible),
)
const candidates = basePool
  .map((log) => scoreHistory(context, beanById.get(log.bean_id ?? '') ?? null, log, fallbackTemplate))
  .sort(compareCandidates)
```

Add the complete comparator:

```ts
function compareCandidates(left: BrewRecommendationCandidate, right: BrewRecommendationCandidate) {
  return right.score - left.score
    || Date.parse(right.brewLog.brewed_at) - Date.parse(left.brewLog.brewed_at)
}
```

- [ ] **Step 8: Build history parameters from facts and template fallbacks**

Change `scoreHistory` and `parametersFromHistory` to accept `fallbackTemplate: BrewTemplate | null`. Within `parametersFromHistory`, use:

```ts
const facts = analyzeHistoryRecipe(log, context.mode)
const grinderCompatible = !context.gear.grinder || sameText(log.grinder, context.gear.grinder)
return modeParameters(context, {
  method: methodLabel(context.mode),
  dripper: context.gear.brewer || log.dripper || fallbackTemplate?.brewer || null,
  grinder: context.gear.grinder || log.grinder,
  grindSetting: grinderCompatible
    ? log.grind_setting ?? fallbackTemplate?.grindSize ?? null
    : fallbackTemplate?.grindSize ?? null,
  ratio: facts.ratio,
  waterTemperatureC: log.water_temperature_c
    ?? (fallbackTemplate ? midpoint(fallbackTemplate.waterTemperatureC.min, fallbackTemplate.waterTemperatureC.max) : null),
  totalTimeSeconds: log.total_time_seconds
    ?? (fallbackTemplate ? midpoint(fallbackTemplate.targetTimeSeconds.min, fallbackTemplate.targetTimeSeconds.max) : null),
  coffeeGrams: log.coffee_grams,
  waterGrams: log.water_grams,
  iceGrams: log.ice_grams ?? null,
  beverageGrams: log.beverage_grams ?? null,
})
```

Keep `baseTemplate` passed to `getRecommendationAllowedRanges` only when the base source itself is a template. A fallback template used to fill optional history fields must not relabel a history value as a template source.

- [ ] **Step 9: Remove the implicit ratio default**

Import `parseRatioDenominator` from `recommendationPolicy.ts`. Replace the local `ratioDenominator` and `clampRatio` helpers with nullable versions:

```ts
function ratioDenominator(ratio: string | null) {
  return parseRatioDenominator(ratio)
}

function clampRatio(ratio: string | null, min: number, max: number) {
  const denominator = ratioDenominator(ratio)
  if (denominator === null) return null
  const bounded = clamp(denominator, min, max)
  return `1:${Math.round(bounded * 10) / 10}`
}
```

At the top of the arithmetic portion of `modeParameters`, add:

```ts
const denominator = ratioDenominator(safe.ratio)
if (denominator === null) {
  return {
    ...safe,
    brewMode: context.mode,
    brewVariant: context.mode === 'cold_brew' ? context.variant : null,
  }
}
```

Replace each later `ratioDenominator(safe.ratio)` multiplication with `denominator`. In `recomputeOutputMasses`, use:

```ts
const denominator = ratioDenominator(recipe.ratio)
if (coffee === null || coffee === undefined || denominator === null) return recipe
```

Do not substitute 15, 50g or any other invented history value. Template bases remain complete because system and validated user templates already require dose, water and ratio.

- [ ] **Step 10: Run the history and recommendation tests**

Run:

```powershell
npm test -- --run src/features/recommendations/historyRecipeFacts.test.ts src/features/recommendations/methodAwareRuleRecommendation.test.ts src/features/recommendations/recommendationRanges.test.ts
```

Expected: all tests pass; incomplete history is reference-only, mass-derived ratios are local, and no null ratio becomes `1:15`.

- [ ] **Step 11: Commit the history-boundary slice**

```powershell
git add -- app/src/features/recommendations/historyRecipeFacts.ts app/src/features/recommendations/historyRecipeFacts.test.ts app/src/features/recommendations/methodAwareRuleRecommendation.ts app/src/features/recommendations/methodAwareRuleRecommendation.test.ts
git commit -m "fix: require complete recommendation history"
```

### Task 3: Make the Edge Function generate and validate mode-aware brew steps

**Files:**
- Modify: `supabase/functions/recommend-brew/contract.ts`
- Modify: `supabase/functions/recommend-brew/contract.test.ts`
- Modify: `supabase/functions/recommend-brew/prompt.ts`
- Create: `supabase/functions/recommend-brew/prompt.test.ts`

- [ ] **Step 1: Add failing Edge contract tests for mode and mass violations**

Define a valid espresso step fixture in `contract.test.ts`:

```ts
const espressoSteps = [{
  label: '萃取',
  startSeconds: 0,
  endSeconds: 28,
  targetType: 'beverage',
  targetGrams: 36,
  action: '在 36g 附近停止萃取',
}]
```

Change the valid call to `validateStructuredAiResponse({ recipe, pourPlan: espressoSteps }, request as never)`. Add:

```ts
assertEquals(
  validateStructuredAiResponse({
    recipe,
    pourPlan: [{ ...espressoSteps[0], targetType: 'water', targetGrams: 999 }],
  }, request as never),
  null,
)

assertEquals(
  validateStructuredAiResponse({
    recipe,
    pourPlan: [{ ...espressoSteps[0], targetGrams: 54 }],
  }, request as never),
  null,
)
```

Add this cold-brew request and assertion:

```ts
const coldRequest = {
  ...request,
  selection: {
    mode: 'cold_brew',
    variant: 'ready_to_drink',
    brewer: '冷萃壶',
    grinder: 'C40',
    espressoDoseGrams: null,
  },
  rule: {
    ...request.rule,
    recipe: { grindSetting: '中粗' },
    allowedRanges: {
      ratioDenominator: { min: 12, max: 16 },
      waterTemperatureC: { min: 4, max: 8 },
      coffeeGrams: { min: 50, max: 50 },
      waterGrams: { min: 600, max: 800 },
      iceGrams: null,
      beverageGrams: null,
      totalTimeSeconds: { min: 28_800, max: 64_800 },
    },
  },
}
const coldRecipe = {
  brewMode: 'cold_brew',
  brewVariant: 'ready_to_drink',
  dripper: '冷萃壶',
  grinder: 'C40',
  grindSetting: '中粗',
  waterTemperatureC: 6,
  coffeeGrams: 50,
  waterGrams: 700,
  iceGrams: null,
  beverageGrams: null,
  ratio: '1:14',
  totalTimeSeconds: 43_200,
}
assertEquals(
  validateStructuredAiResponse({
    recipe: coldRecipe,
    pourPlan: [{
      label: '主注水',
      startSeconds: 0,
      endSeconds: 60,
      targetType: 'water',
      targetGrams: 700,
      action: '绕圈注水至 700g',
    }],
  }, coldRequest as never),
  null,
)
```

- [ ] **Step 2: Run the Edge contract test and verify invalid steps are still accepted**

Run from `D:\coffee`:

```powershell
npx --yes deno@2.9.5 test supabase/functions/recommend-brew/contract.test.ts --allow-env
```

Expected: FAIL because `validateStructuredAiResponse` currently ignores `pourPlan`.

- [ ] **Step 3: Implement the strict step validator**

Add these constants and helpers to `contract.ts`:

```ts
const stepKeys = [
  'label',
  'startSeconds',
  'endSeconds',
  'targetType',
  'targetGrams',
  'action',
]
const targetTypes = ['water', 'ice', 'beverage', 'none'] as const

function validBrewSteps(
  value: unknown,
  recipe: Record<string, unknown>,
  mode: RecommendationRequest['selection']['mode'],
) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) return false
  let previousStart = -1
  const targets = new Map<string, number[]>()

  for (const raw of value) {
    if (!hasExactly(raw, stepKeys) || !text(raw.label) || !text(raw.action)) return false
    if (!finite(raw.startSeconds) || raw.startSeconds < 0 || raw.startSeconds < previousStart) return false
    if (raw.endSeconds !== null && (!finite(raw.endSeconds) || raw.endSeconds < raw.startSeconds)) return false
    if (!targetTypes.includes(raw.targetType as typeof targetTypes[number])) return false
    if (raw.targetType === 'none' ? raw.targetGrams !== null : !finite(raw.targetGrams) || raw.targetGrams <= 0) return false
    previousStart = raw.startSeconds
    if (raw.targetType !== 'none') {
      const values = targets.get(String(raw.targetType)) ?? []
      values.push(raw.targetGrams as number)
      targets.set(String(raw.targetType), values)
    }
  }

  const allowed = mode === 'espresso'
    ? new Set(['beverage', 'none'])
    : mode === 'hot_pourover'
      ? new Set(['water', 'none'])
      : new Set(['water', 'ice', 'none'])
  if ([...targets.keys()].some((key) => !allowed.has(key))) return false
  if ((mode === 'cold_brew' || mode === 'espresso')
    && value.some((step) => /绕圈|闷蒸|分段注水/.test(String(step.action)))) return false

  return finalTargetMatches(targets.get('water'), recipe.waterGrams)
    && finalTargetMatches(targets.get('ice'), recipe.iceGrams)
    && finalTargetMatches(targets.get('beverage'), recipe.beverageGrams)
}

function finalTargetMatches(values: number[] | undefined, expected: unknown) {
  if (expected === null || expected === undefined) return values === undefined
  if (!finite(expected) || !values || values.length === 0) return false
  return values.every((value, index) => index === 0 || value >= values[index - 1])
    && Math.abs(values[values.length - 1] - expected) <= 0.1
}
```

Before returning `value` in `validateStructuredAiResponse`, add:

```ts
if (!validBrewSteps(value.pourPlan, recipe, selection.mode)) return null
```

- [ ] **Step 4: Run the Edge contract test and verify it passes**

Run:

```powershell
npx --yes deno@2.9.5 test supabase/functions/recommend-brew/contract.test.ts --allow-env
```

Expected: valid espresso and cold-brew steps pass; wrong target type, wrong final mass and hand-pour cold-brew language fail.

- [ ] **Step 5: Add a prompt test for all four mode instructions**

Create `prompt.test.ts`:

```ts
import { assertStringIncludes } from 'jsr:@std/assert@1'
import { buildBoundedPrompt } from './prompt.ts'

const base = {
  version: 2,
  targetBean: { id: 'bean', name: '豆' },
  selection: { mode: 'hot_pourover', variant: null, brewer: 'V60', grinder: 'C40', espressoDoseGrams: null },
  rule: { recipe: {}, allowedRanges: {}, confidence: 'low', baseSource: {}, reasons: {} },
  references: [],
  templates: { selected: null, alternatives: [] },
  tasteGoals: [],
} as never

Deno.test('prompt defines typed steps and all four mode boundaries', () => {
  const prompt = buildBoundedPrompt(base)
  assertStringIncludes(prompt, 'targetType')
  assertStringIncludes(prompt, 'hot_pourover')
  assertStringIncludes(prompt, 'iced_pourover')
  assertStringIncludes(prompt, 'cold_brew')
  assertStringIncludes(prompt, 'espresso')
  assertStringIncludes(prompt, '原始反馈')
})
```

- [ ] **Step 6: Replace the universal step example with the typed contract**

In `prompt.ts`, require each `pourPlan` item to use:

```ts
{
  label: '阶段',
  startSeconds: 0,
  endSeconds: 30,
  targetType: 'water',
  targetGrams: 30,
  action: '操作',
}
```

Add explicit prompt rules:

```ts
const modeInstructions = [
  'hot_pourover：步骤只能使用 water/none；最后一个 water 目标必须等于 recipe.waterGrams。',
  'iced_pourover：步骤只能使用 water/ice/none；最后 water 与 ice 目标必须分别等于 recipe.waterGrams 和 recipe.iceGrams。',
  'cold_brew：使用混合、浸泡、过滤、稀释或加冰语义，不得生成闷蒸、绕圈或分段注水。',
  'espresso：步骤只能使用 beverage/none；最后 beverage 目标必须等于 recipe.beverageGrams，不得生成手冲注水。',
].join('\n')
```

Also add this exact instruction:

```ts
'rule.reasons.feedback 可能包含上一杯的原始反馈；结合完整语境解释，但处方修改仍不得超出 allowedRanges。'
```

Tell DeepSeek that `targetGrams` is a cumulative scale target for its `targetType`, `startSeconds`/`endSeconds` are numeric, and `none` requires `targetGrams: null`. Keep the raw feedback inside the already bounded request JSON; do not add a second AI call.

- [ ] **Step 7: Run all recommend-brew Edge tests**

Run:

```powershell
npx --yes deno@2.9.5 test supabase/functions/recommend-brew --allow-env
```

Expected: all Edge Function contract, prompt and index tests pass.

- [ ] **Step 8: Commit the server boundary slice**

```powershell
git add -- supabase/functions/recommend-brew/contract.ts supabase/functions/recommend-brew/contract.test.ts supabase/functions/recommend-brew/prompt.ts supabase/functions/recommend-brew/prompt.test.ts
git commit -m "fix: validate mode-aware AI brew steps"
```

### Task 4: Normalize and display new steps while preserving saved recommendations

**Files:**
- Create: `app/src/features/recommendations/aiBrewStepValidation.ts`
- Create: `app/src/features/recommendations/aiBrewStepValidation.test.ts`
- Modify: `app/src/features/recommendations/recommendationTypes.ts`
- Modify: `app/src/features/recommendations/structuredAiRecommendation.ts`
- Modify: `app/src/features/recommendations/structuredAiRecommendation.test.ts`
- Modify: `app/src/features/recommendations/StructuredAiRecommendationView.tsx`
- Create: `app/src/features/recommendations/StructuredAiRecommendationView.test.tsx`
- Modify: `app/src/features/recommendations/savedRecommendationList.ts`
- Modify: `app/src/features/recommendations/savedRecommendationList.test.ts`
- Modify: `app/src/features/recommendations/savedRecommendation.test.ts`

- [ ] **Step 1: Replace the frontend step type with a normalized generic step**

In `recommendationTypes.ts`, replace `StructuredAiPourStep` with:

```ts
export type StructuredAiStepTarget = 'water' | 'ice' | 'beverage' | 'none'

export type StructuredAiBrewStep = {
  label: string
  time: string
  startSeconds: number | null
  endSeconds: number | null
  targetType: StructuredAiStepTarget
  targetGrams: number | null
  action: string
}
```

Keep the persisted property name `pourPlan` in `StructuredAiRecommendation`, but change its type to `StructuredAiBrewStep[]`. This avoids rewriting existing saved recommendation objects.

- [ ] **Step 2: Add failing normalization compatibility tests**

Update the valid structured response fixture in `structuredAiRecommendation.test.ts` to use the new server fields, and expect:

```ts
expect(result.structured?.pourPlan[0]).toEqual({
  label: '闷蒸',
  time: '0:00-0:30',
  startSeconds: 0,
  endSeconds: 30,
  targetType: 'water',
  targetGrams: 30,
  action: '轻柔绕圈',
})
```

Add an old-data compatibility case:

```ts
it('adapts a saved legacy waterGrams step', () => {
  const result = normalizeAiRecommendationResponse({
    configured: true,
    structured: {
      recipe: {},
      pourPlan: [{ label: '闷蒸', time: '0:00-0:30', waterGrams: 30, action: '轻柔绕圈' }],
    },
  })

  expect(result.structured?.pourPlan[0]).toMatchObject({
    targetType: 'water',
    targetGrams: 30,
    time: '0:00-0:30',
  })
})
```

- [ ] **Step 3: Run normalization tests and verify they fail on the new fields**

Run:

```powershell
npm test -- --run src/features/recommendations/structuredAiRecommendation.test.ts
```

Expected: FAIL because the current normalizer only reads `waterGrams`.

- [ ] **Step 4: Normalize new and old steps**

Update `normalizePourPlan` in `structuredAiRecommendation.ts` so each item follows this logic:

```ts
const startSeconds = nonNegativeNumberOrNull(item.startSeconds)
const endSeconds = nonNegativeNumberOrNull(item.endSeconds)
const targetType = stepTargetOrNull(item.targetType)
  ?? (numberOrNull(item.waterGrams) !== null ? 'water' : 'none')
const targetGrams = numberOrNull(item.targetGrams) ?? numberOrNull(item.waterGrams)

return {
  label: stringValue(item.label) || `第 ${index + 1} 段`,
  time: startSeconds !== null
    ? formatStepTime(startSeconds, endSeconds)
    : stringValue(item.time),
  startSeconds,
  endSeconds,
  targetType,
  targetGrams: targetType === 'none' ? null : targetGrams,
  action,
}
```

Add complete helpers:

```ts
function nonNegativeNumberOrNull(value: unknown) {
  const parsed = numberOrNull(value)
  return parsed !== null && parsed >= 0 ? parsed : null
}

function stepTargetOrNull(value: unknown) {
  return value === 'water' || value === 'ice' || value === 'beverage' || value === 'none'
    ? value
    : null
}

function formatStepTime(startSeconds: number, endSeconds: number | null) {
  const format = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  return endSeconds === null ? format(startSeconds) : `${format(startSeconds)}-${format(endSeconds)}`
}
```

- [ ] **Step 5: Add frontend defense-in-depth step validation**

Create `aiBrewStepValidation.ts` exporting:

```ts
import type { AiRecommendationContext } from './aiRecommendationContext'
import type { StructuredAiBrewStep, StructuredAiRecipe } from './recommendationTypes'

export function validateAiBrewSteps(
  steps: StructuredAiBrewStep[],
  recipe: StructuredAiRecipe,
  context: AiRecommendationContext,
) {
  if (steps.length < 1 || steps.length > 8) return false
  const allowed = context.selection.mode === 'espresso'
    ? new Set(['beverage', 'none'])
    : context.selection.mode === 'hot_pourover'
      ? new Set(['water', 'none'])
      : new Set(['water', 'ice', 'none'])
  if (steps.some((step) => !allowed.has(step.targetType))) return false
  if ((context.selection.mode === 'cold_brew' || context.selection.mode === 'espresso')
    && steps.some((step) => /绕圈|闷蒸|分段注水/.test(step.action))) return false

  return matchesFinal(steps, 'water', recipe.waterGrams)
    && matchesFinal(steps, 'ice', recipe.iceGrams ?? null)
    && matchesFinal(steps, 'beverage', recipe.beverageGrams ?? null)
}

function matchesFinal(
  steps: StructuredAiBrewStep[],
  type: StructuredAiBrewStep['targetType'],
  expected: number | null,
) {
  const values = steps
    .filter((step) => step.targetType === type)
    .map((step) => step.targetGrams)
  if (expected === null) return values.length === 0
  return values.length > 0
    && values.every((value, index) => value !== null && (index === 0 || value >= (values[index - 1] ?? 0)))
    && Math.abs((values.at(-1) ?? 0) - expected) <= 0.1
}
```

Create `aiBrewStepValidation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { AiRecommendationContext } from './aiRecommendationContext'
import type { BrewMode } from '../brews/brewTypes'
import type { StructuredAiBrewStep, StructuredAiRecipe } from './recommendationTypes'
import { validateAiBrewSteps } from './aiBrewStepValidation'

function context(mode: BrewMode): AiRecommendationContext {
  return { selection: { mode } } as AiRecommendationContext
}

function recipe(mode: BrewMode): StructuredAiRecipe {
  return {
    method: null,
    brewMode: mode,
    brewVariant: mode === 'cold_brew' ? 'ready_to_drink' : null,
    dripper: null,
    grinder: null,
    grindSetting: null,
    waterTemperatureC: mode === 'cold_brew' ? 6 : 92,
    coffeeGrams: mode === 'cold_brew' ? 50 : mode === 'espresso' ? 18 : 15,
    waterGrams: mode === 'hot_pourover' ? 240 : mode === 'iced_pourover' ? 150 : mode === 'cold_brew' ? 700 : null,
    iceGrams: mode === 'iced_pourover' ? 75 : null,
    beverageGrams: mode === 'espresso' ? 36 : null,
    ratio: mode === 'cold_brew' ? '1:14' : mode === 'espresso' ? '1:2' : '1:16',
    totalTimeSeconds: mode === 'cold_brew' ? 43_200 : mode === 'espresso' ? 28 : 150,
  }
}

function step(overrides: Partial<StructuredAiBrewStep>): StructuredAiBrewStep {
  return {
    label: '阶段',
    time: '0:00-0:30',
    startSeconds: 0,
    endSeconds: 30,
    targetType: 'none',
    targetGrams: null,
    action: '准备',
    ...overrides,
  }
}

describe('AI brew step validation', () => {
  it.each([
    ['hot_pourover', [step({ targetType: 'water', targetGrams: 240, action: '注水至目标' })]],
    ['iced_pourover', [
      step({ targetType: 'water', targetGrams: 150, action: '热水冲煮' }),
      step({ startSeconds: 30, endSeconds: 40, targetType: 'ice', targetGrams: 75, action: '与冰混合' }),
    ]],
    ['cold_brew', [step({ targetType: 'water', targetGrams: 700, action: '混合后冷藏浸泡' })]],
    ['espresso', [step({ targetType: 'beverage', targetGrams: 36, action: '萃取至目标液重' })]],
  ] as const)('accepts valid %s steps', (mode, steps) => {
    expect(validateAiBrewSteps([...steps], recipe(mode), context(mode))).toBe(true)
  })

  it('rejects espresso hand-pour water and an impossible target', () => {
    expect(validateAiBrewSteps([
      step({ targetType: 'water', targetGrams: 999, action: '注水' }),
    ], recipe('espresso'), context('espresso'))).toBe(false)
  })

  it('rejects hand-pour language for cold brew', () => {
    expect(validateAiBrewSteps([
      step({ targetType: 'water', targetGrams: 700, action: '绕圈注水' }),
    ], recipe('cold_brew'), context('cold_brew'))).toBe(false)
  })

  it('rejects mismatched iced water and ice totals', () => {
    expect(validateAiBrewSteps([
      step({ targetType: 'water', targetGrams: 180, action: '热水冲煮' }),
      step({ startSeconds: 30, endSeconds: 40, targetType: 'ice', targetGrams: 45, action: '与冰混合' }),
    ], recipe('iced_pourover'), context('iced_pourover'))).toBe(false)
  })
})
```

In `normalizeAiRecommendationResponse`, after `validateAiRecipe`, also call `validateAiBrewSteps`. If either check fails, set `structured = null` and `error = 'AI_BOUNDARY_VIOLATION'`.

- [ ] **Step 6: Run normalization and defense tests**

Run:

```powershell
npm test -- --run src/features/recommendations/structuredAiRecommendation.test.ts src/features/recommendations/aiBrewStepValidation.test.ts src/features/recommendations/aiRecipeValidation.test.ts
```

Expected: valid mode-specific steps pass; invalid quantities or cross-mode wording produce `AI_BOUNDARY_VIOLATION`.

- [ ] **Step 7: Display generic brew steps instead of hand-pour wording**

In `StructuredAiRecommendationView.tsx`:

- Change the heading to `冲煮步骤`.
- Replace `formatNumber(step.waterGrams, 'g')` with a target formatter:

```ts
function formatStepTarget(step: StructuredAiBrewStep) {
  if (step.targetGrams === null || step.targetType === 'none') return null
  const label = {
    water: '水量',
    ice: '冰量',
    beverage: '出液',
  }[step.targetType]
  return `${label} ${step.targetGrams}g`
}
```

Render `[step.time, formatStepTarget(step), step.action]`.

Create `StructuredAiRecommendationView.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { StructuredAiRecommendation } from './recommendationTypes'
import { StructuredAiRecommendationView } from './StructuredAiRecommendationView'

describe('StructuredAiRecommendationView', () => {
  it('renders espresso stages as generic brew steps with an output target', () => {
    const recommendation: StructuredAiRecommendation = {
      summary: '以 1:2 建立基准。',
      recipe: {
        method: '意式',
        brewMode: 'espresso',
        brewVariant: null,
        dripper: 'Flair 58',
        grinder: 'C40',
        grindSetting: '8',
        waterTemperatureC: 92,
        coffeeGrams: 18,
        waterGrams: null,
        iceGrams: null,
        beverageGrams: 36,
        ratio: '1:2',
        totalTimeSeconds: 28,
      },
      pourPlan: [{
        label: '萃取',
        time: '0:00-0:28',
        startSeconds: 0,
        endSeconds: 28,
        targetType: 'beverage',
        targetGrams: 36,
        action: '在目标液重停止',
      }],
      adjustments: [],
      reasons: [],
      riskNotes: [],
      rawText: '',
    }
    const html = renderToStaticMarkup(
      <StructuredAiRecommendationView recommendation={recommendation} />,
    )

    expect(html).toContain('冲煮步骤')
    expect(html).toContain('出液 36g')
    expect(html).not.toContain('分段注水')
  })
})
```

- [ ] **Step 8: Preserve old and new steps in saved recommendation cards**

Update `formatPourStep` in `savedRecommendationList.ts`:

```ts
const targetGrams = getNumber(step.targetGrams) ?? getNumber(step.waterGrams)
const targetType = getString(step.targetType) ?? (getNumber(step.waterGrams) !== null ? 'water' : null)
const targetLabel = targetType === 'ice' ? '冰量'
  : targetType === 'beverage' ? '出液'
  : targetType === 'water' ? '水量'
  : null
const amount = targetLabel && targetGrams !== null ? `${targetLabel} ${targetGrams}g` : null
const parts = [getString(step.time), amount, getString(step.action)].filter(Boolean)
```

Extend `savedRecommendationList.test.ts` with one new typed step and keep the existing legacy `waterGrams` fixture. Update `savedRecommendation.test.ts` to store the normalized typed fields and verify they remain inside the draft recommendation object rather than becoming a brew log.

- [ ] **Step 9: Run all structured and saved recommendation tests**

Run:

```powershell
npm test -- --run src/features/recommendations/structuredAiRecommendation.test.ts src/features/recommendations/aiBrewStepValidation.test.ts src/features/recommendations/StructuredAiRecommendationView.test.tsx src/features/recommendations/savedRecommendation.test.ts src/features/recommendations/savedRecommendationList.test.ts
```

Expected: new steps render with typed quantities, legacy saved steps remain readable, and invalid AI results are discarded.

- [ ] **Step 10: Commit the frontend compatibility slice**

```powershell
git add -- app/src/features/recommendations/aiBrewStepValidation.ts app/src/features/recommendations/aiBrewStepValidation.test.ts app/src/features/recommendations/recommendationTypes.ts app/src/features/recommendations/structuredAiRecommendation.ts app/src/features/recommendations/structuredAiRecommendation.test.ts app/src/features/recommendations/StructuredAiRecommendationView.tsx app/src/features/recommendations/StructuredAiRecommendationView.test.tsx app/src/features/recommendations/savedRecommendationList.ts app/src/features/recommendations/savedRecommendationList.test.ts app/src/features/recommendations/savedRecommendation.test.ts
git commit -m "fix: present safe mode-aware brew steps"
```

### Task 5: Complete integration, mobile verification, and release gate

**Files:**
- Modify only if a test exposes a defect: files already listed in Tasks 1–4
- Verify: `docs/superpowers/specs/2026-08-26-recommendation-feedback-and-step-safety-design.md`

- [ ] **Step 1: Run all focused frontend recommendation tests**

Run from `D:\coffee\app`:

```powershell
npm test -- --run src/features/recommendations
```

Expected: every recommendation test passes, including feedback, history, range, AI context, structured output and saved recommendation compatibility.

- [ ] **Step 2: Run all Edge Function recommendation tests**

Run from `D:\coffee`:

```powershell
npx --yes deno@2.9.5 test supabase/functions/recommend-brew --allow-env
```

Expected: all Deno tests pass. If downloading Deno requires network permission, request it rather than skipping the Edge tests.

- [ ] **Step 3: Run the complete frontend quality gate**

Run from `D:\coffee\app`:

```powershell
npm test -- --run
npm run lint
npm run build
```

Expected: all tests pass, ESLint exits 0, and the GitHub Pages production build completes. The existing Vite chunk-size warning may remain but no new warning or error is accepted.

- [ ] **Step 4: Verify the core flow at a 360×800 mobile viewport**

Start the app from `D:\coffee\app`:

```powershell
npm run dev -- --host 127.0.0.1
```

Open the printed local URL in the in-app browser, set a 360×800 viewport, sign into the local test account, and verify:

1. A brew log can be saved with rating and the note “偏苦，有点涩” without six sensory inputs.
2. Generating the next recommendation shows the feedback adjustment in the rule reasons.
3. AI unavailable mode still leaves a complete rule recipe.
4. Hot and iced recommendations show “冲煮步骤” with water/ice quantities.
5. Cold brew shows mixing/steeping/filtering language, not “分段注水”.
6. Espresso shows an output target, not hand-pour water steps.
7. “用于本次冲煮” creates a draft only and does not create a formal brew log.

Capture screenshots for any failed state before changing code. Do not use production user data for this verification.

- [ ] **Step 5: Review the final diff for protected boundaries**

Run from `D:\coffee`:

```powershell
git diff --check
git status --short
git diff --stat HEAD~3..HEAD
git diff HEAD~3..HEAD -- supabase/sql app/src/features/sync app/src/features/backups
```

Expected: no whitespace errors; only intended files are changed; the final protected-boundary diff is empty.

- [ ] **Step 6: Commit any integration-only corrections**

Only when Step 1–5 exposed a necessary correction, stage the exact corrected files and commit:

```powershell
git add -- app/src/features/recommendations supabase/functions/recommend-brew app/src/features/brews/BrewLogPanel.tsx
git commit -m "test: complete recommendation safety verification"
```

If no correction was required, do not create an empty commit.

## Completion criteria

- The implementation consists of three focused feature commits plus an optional integration correction commit.
- No database migration or destructive data rewrite exists.
- Low-rated plain-language feedback affects local rules and is supplied to DeepSeek only during recommendation generation.
- Incomplete history cannot become a base; no missing ratio becomes `1:15`.
- Edge and frontend reject mode-incompatible or mass-inconsistent AI steps.
- Old saved recommendations remain readable.
- Full tests, lint, build and mobile verification have recorded evidence before any push or production deployment.

### Task 6: Prevent repeated vision-model recommendation timeouts

- [x] Update the Edge request test to require `thinking: { type: "enabled" }`, `reasoning_effort: "high"`, and `max_tokens: 2500`; verify that it fails against the previous disabled-thinking request.
- [x] Keep high-intensity thinking for the bounded JSON optimization request and raise the application timeout from 90 seconds to 135 seconds, below Supabase's 150-second request boundary.
- [x] Run the complete `recommend-brew` Deno suite and formatting check, then deploy only that function and verify an authenticated recommendation in production.

### Task 7: Diagnose rejected structured recommendations without logging user data

- [x] Add failing contract tests that require a fixed validation failure code while preserving `validateStructuredAiResponse` compatibility.
- [x] Add a failing Edge test requiring the fixed failure code in the single security log entry and confirming prompts, AI bodies, bean data, feedback, and parameter values remain absent.
- [x] Implement the minimal fixed-code validator and attach only that code to the existing security log entry.
- [x] Run all Edge tests and formatting checks, deploy only `recommend-brew`, and use one authenticated draft generation to identify the production failure stage before changing prompt or validation behavior.

### Task 8: Preserve high-intensity reasoning without truncating the JSON result

- [x] Update the Edge request and prompt tests first to require a 16384-token ceiling plus a completion-priority instruction while retaining enabled thinking, high reasoning effort, and the 135-second timeout.
- [x] Raise the DeepSeek output ceiling to 16384 after production confirmed that 2500, 4096, and 8192 all truncate; require concise non-repetitive reasoning that prioritizes the final JSON, without relaxing validation, adding retries, or changing fallback behavior.
- [x] Run the complete Edge suite and formatting check, deploy only `recommend-brew`, then verify one authenticated production recommendation before pushing.
