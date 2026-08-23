# Vision Recommendation Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore DeepSeek brew recommendation generation with the vision model's content-block request format and replace the misleading catch-all “未启用” state with stable, accurate messages.

**Architecture:** Keep deterministic rule generation and the Edge Function response contract unchanged. Change only the DeepSeek user message to one text content block, normalize client invocation failures to a stable code, and isolate user-facing AI state copy in a tested presentation helper.

**Tech Stack:** React, TypeScript, Vitest, Supabase Edge Functions, Deno tests, DeepSeek OpenAI-compatible Chat Completions API.

---

### Task 1: Send recommendation context as a vision content block

**Files:**
- Modify: `supabase/functions/recommend-brew/index.test.ts`
- Modify: `supabase/functions/recommend-brew/index.ts`

- [ ] **Step 1: Change the existing upstream-request test** to require the user message below while continuing to assert that no image block is sent:

```ts
assertEquals(messages[1], {
  role: "user",
  content: [{ type: "text", text: messages[1].content[0].text }],
});
assertEquals(messages[1].content.length, 1);
assertEquals(messages[1].content[0].type, "text");
```

- [ ] **Step 2: Run** `npx --yes deno test supabase/functions/recommend-brew/index.test.ts --allow-env`; expect the content-block assertion to fail because the current user content is a string.
- [ ] **Step 3: Replace** `content: buildPrompt(payload)` with:

```ts
content: [{ type: "text", text: buildPrompt(payload) }],
```

- [ ] **Step 4: Re-run the Deno test** and expect all recommendation Edge Function tests to pass.

### Task 2: Distinguish unavailable AI states without exposing raw errors

**Files:**
- Modify: `app/src/features/recommendations/recommendationService.test.ts`
- Modify: `app/src/features/recommendations/recommendationService.ts`
- Create: `app/src/features/recommendations/aiRecommendationStatus.test.ts`
- Create: `app/src/features/recommendations/aiRecommendationStatus.ts`
- Modify: `app/src/features/recommendations/RecommendationPanel.tsx`

- [ ] **Step 1: Add a failing service test** proving an invocation error returns `{ configured: true, suggestion: null, structured: null, error: 'AI_FUNCTION_ERROR' }` rather than treating the model as unconfigured or exposing `error.message`.
- [ ] **Step 2: Add failing presentation tests** requiring these exact mappings:

```ts
configured false -> "DeepSeek 未配置，先显示规则推荐。"
AI_TIMEOUT -> "DeepSeek 响应超时，先显示规则推荐。"
AI_UPSTREAM_ERROR or AI_FUNCTION_ERROR -> "AI 推荐暂时不可用，先显示规则推荐。"
configured true with no output -> "DeepSeek 未返回可用建议，先显示规则推荐。"
```

- [ ] **Step 3: Run** `npm test -- --run src/features/recommendations/recommendationService.test.ts src/features/recommendations/aiRecommendationStatus.test.ts`; expect failures for the old invoke-error mapping and missing presentation helper.
- [ ] **Step 4: Implement** `getAiRecommendationStatusMessage(response)` as a pure function with the mappings above, change invocation errors to the stable `AI_FUNCTION_ERROR`, and use the helper in `RecommendationPanel` only when neither structured output nor suggestion is available.
- [ ] **Step 5: Re-run the focused Vitest command** and expect all tests to pass.

### Task 3: Verify, commit, deploy, and smoke-test

**Files:**
- Modify: `docs/superpowers/plans/2026-08-23-vision-recommendation-hotfix.md` (checkbox progress only)

- [ ] **Step 1: Run frontend verification** from `app`: `npm test`, `npm run lint`, and `npm run build`; all must exit 0.
- [ ] **Step 2: Run Edge verification** from the repository root: `npx --yes deno test supabase/functions/recommend-brew/index.test.ts supabase/functions/import-source/index.test.ts supabase/functions/import-source/index.vision.test.ts supabase/functions/import-source/deepSeekVisionRequest.test.ts supabase/functions/import-source/visionPrompt.test.ts supabase/functions/_shared/auth.test.ts supabase/functions/_shared/rateLimit.test.ts --allow-env`; all must pass.
- [ ] **Step 3: Run** `npx --yes deno fmt --check` for the touched Edge Function files, `git diff --check`, and `git status --short`; the two legacy patch files must remain untracked and untouched.
- [ ] **Step 4: Commit** implementation as `fix: restore vision brew recommendations`.
- [ ] **Step 5: Deploy** only `recommend-brew` to project `tmjpgcjcrcaxxxhqbyng`, verify it is ACTIVE with JWT enabled, then push `foundation`.
- [ ] **Step 6: Verify** GitHub Actions pass, the Pages assets contain the corrected state copy, and production function OPTIONS/unauthenticated POST still return 200/401. Ask the user to generate one authenticated recommendation draft; do not save it automatically.

## Self-review result

- Spec coverage: vision content blocks, unchanged rule engine, stable error states, no raw upstream error exposure, regression tests, deployment, and authenticated user smoke-test are all covered.
- Placeholder scan: every implementation and verification step is concrete; unrelated recommendation-rule work is excluded.
- Type consistency: service, presentation helper, and panel all use the existing `AiRecommendationResponse`; the only new stable client error code is `AI_FUNCTION_ERROR`.
