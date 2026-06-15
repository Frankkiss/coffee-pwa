# Structured AI Recommendation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display and save DeepSeek recommendations as structured recipe, pour plan, reasons, adjustments, and risk notes.

**Architecture:** Add a frontend normalization module that accepts new and old AI responses. Update the Edge Function prompt and parser to prefer JSON, while preserving raw text fallback. Render structured sections in the recommendation panel and saved recommendation details.

**Tech Stack:** React 19, TypeScript, Vitest, Supabase Edge Functions, DeepSeek OpenAI-compatible API.

---

### Task 1: Frontend AI Response Model

**Files:**
- Modify: `app/src/features/recommendations/recommendationTypes.ts`
- Create: `app/src/features/recommendations/structuredAiRecommendation.ts`
- Test: `app/src/features/recommendations/structuredAiRecommendation.test.ts`

- [ ] **Step 1: Write failing tests**

Test structured object normalization, old text fallback, and malformed object fallback.

- [ ] **Step 2: Run focused test**

Run: `npm run test -- --run src/features/recommendations/structuredAiRecommendation.test.ts`

- [ ] **Step 3: Implement normalizer**

Add `normalizeAiRecommendationResponse` and helpers.

- [ ] **Step 4: Run focused test**

Run: `npm run test -- --run src/features/recommendations/structuredAiRecommendation.test.ts`

### Task 2: Save And Display Structured AI

**Files:**
- Modify: `app/src/features/recommendations/recommendationService.ts`
- Modify: `app/src/features/recommendations/savedRecommendation.ts`
- Modify: `app/src/features/recommendations/savedRecommendation.test.ts`
- Modify: `app/src/features/recommendations/savedRecommendationList.ts`
- Modify: `app/src/features/recommendations/savedRecommendationList.test.ts`
- Modify: `app/src/features/recommendations/RecommendationPanel.tsx`
- Modify: `app/src/features/recommendations/recommendations.css`

- [ ] **Step 1: Use normalizer in service**

Normalize Supabase function responses before returning to UI.

- [ ] **Step 2: Save structured AI**

Persist `ai.structured` and fallback `ai.suggestion`.

- [ ] **Step 3: Render structured sections**

Show recipe fields, pour plan, reasons, adjustments, and risk notes. Fall back to raw text when needed.

### Task 3: Edge Function JSON Contract

**Files:**
- Modify: `supabase/functions/recommend-brew/index.ts`

- [ ] **Step 1: Update prompt**

Ask DeepSeek for JSON only with the agreed schema.

- [ ] **Step 2: Parse model output**

Extract JSON from raw content or markdown fences. Return `{ configured, suggestion, structured }`.

### Task 4: Verification And Commit

- [ ] Run focused tests.
- [ ] Run `npm run lint`.
- [ ] Run `npm run test`.
- [ ] Run `npm run build`.
- [ ] Commit with `Add structured AI recommendations`.
