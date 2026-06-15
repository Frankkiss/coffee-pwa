# Template-Based AI Recommendation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI brew recommendations use brew template candidates as grounding context instead of free-form recipe generation.

**Architecture:** Add a pure template selector in the recommendation feature that scores built-in brew templates against the target bean. Attach up to three template summaries to the rule recommendation, send them to the `recommend-brew` Edge Function, display them in the recommendation UI, and save them with AI recommendation records.

**Tech Stack:** React, TypeScript, Vitest, Supabase Edge Functions, DeepSeek API.

---

### Task 1: Template Candidate Selection

**Files:**
- Create: `app/src/features/recommendations/templateRecommendation.ts`
- Create: `app/src/features/recommendations/templateRecommendation.test.ts`
- Modify: `app/src/features/recommendations/recommendationTypes.ts`
- Modify: `app/src/features/recommendations/ruleRecommendation.ts`

- [ ] Write failing tests for selecting up to three template candidates from bean process, roast level, and flavor tags.
- [ ] Run the focused test and confirm it fails because the selector does not exist.
- [ ] Implement a pure selector that returns compact template summaries with scores and reasons.
- [ ] Add `templateCandidates` to `RuleRecommendationResult`.
- [ ] Attach selected templates inside `generateRuleRecommendation`.
- [ ] Run focused recommendation tests.

### Task 2: Send And Save Template Context

**Files:**
- Modify: `app/src/features/recommendations/recommendationService.ts`
- Modify: `app/src/features/recommendations/savedRecommendation.ts`
- Modify: `app/src/features/recommendations/savedRecommendation.test.ts`
- Modify: `supabase/functions/recommend-brew/index.ts`

- [ ] Send `templateCandidates` in the `recommend-brew` function body.
- [ ] Save `templateCandidates` into `input_context`.
- [ ] Update saved recommendation tests.
- [ ] Tighten the Edge Function prompt so DeepSeek must choose from provided templates and explain any parameter changes.

### Task 3: UI Display And Verification

**Files:**
- Modify: `app/src/features/recommendations/RecommendationPanel.tsx`
- Modify: `app/src/features/recommendations/recommendations.css`

- [ ] Show candidate template names, ratios, water temperature, and reasons under the rule recommendation.
- [ ] Run full tests, lint, and build.
- [ ] Commit and push.
- [ ] Deploy `recommend-brew` Edge Function because its prompt changes.
