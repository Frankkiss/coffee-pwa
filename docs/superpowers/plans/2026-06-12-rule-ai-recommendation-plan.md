# Rule and DeepSeek Recommendation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a recommendation panel that combines rule-based historical matching with optional DeepSeek text suggestions via Supabase Edge Function.

**Architecture:** `app/src/features/recommendations/` owns rule scoring, frontend service calls, and UI. `supabase/functions/recommend-brew/` owns DeepSeek API access so secrets stay server-side.

**Tech Stack:** React, TypeScript, Vitest, Supabase JS, Supabase Edge Functions, DeepSeek OpenAI-compatible chat API.

---

### Task 1: Rule Recommendation Engine

**Files:**
- Create: `app/src/features/recommendations/recommendationTypes.ts`
- Create: `app/src/features/recommendations/ruleRecommendation.ts`
- Test: `app/src/features/recommendations/ruleRecommendation.test.ts`

- [ ] **Step 1: Write failing tests**

Test that the engine prefers high-rated pinned logs from similar beans and returns no recommendation when no logs have usable brew parameters.

- [ ] **Step 2: Run failing tests**

Run: `npm test --prefix app -- src/features/recommendations/ruleRecommendation.test.ts`

Expected: FAIL because `ruleRecommendation` does not exist.

- [ ] **Step 3: Implement engine**

Implement `generateRuleRecommendation(targetBean, beans, brewLogs)` returning primary recommendation and up to three references.

- [ ] **Step 4: Run passing tests**

Run: `npm test --prefix app -- src/features/recommendations/ruleRecommendation.test.ts`

Expected: PASS.

---

### Task 2: DeepSeek Edge Function

**Files:**
- Create: `supabase/functions/recommend-brew/index.ts`

- [ ] **Step 1: Create CORS-safe function**

Handle `OPTIONS`, parse JSON request, and require `DEEPSEEK_API_KEY` from `Deno.env`.

- [ ] **Step 2: Call DeepSeek**

POST to `https://api.deepseek.com/chat/completions` with `model: "deepseek-v4-flash"` and non-streaming messages.

- [ ] **Step 3: Return safe fallback**

If the secret is missing, return `{ configured: false, suggestion: null }`.

---

### Task 3: Recommendation Frontend

**Files:**
- Create: `app/src/features/recommendations/recommendationService.ts`
- Create: `app/src/features/recommendations/RecommendationPanel.tsx`
- Create: `app/src/features/recommendations/recommendations.css`
- Modify: `app/src/features/auth/AuthPanel.tsx`

- [ ] **Step 1: Add frontend service**

Use `listBeans`, `listBrewLogs`, `generateRuleRecommendation`, and `supabase.functions.invoke("recommend-brew")`.

- [ ] **Step 2: Add panel UI**

Render bean selector, generate button, rule recommendation cards, references, AI suggestion or unavailable message.

- [ ] **Step 3: Wire panel into authenticated app**

Render `<RecommendationPanel session={session} supabase={supabase} />` between bean dashboard and backup panel.

---

### Task 4: Verification and Publish

- [ ] **Step 1: Run tests**

Run: `npm test --prefix app`

- [ ] **Step 2: Run build**

Run: `npm run build --prefix app`

- [ ] **Step 3: Scan for secrets**

Run: `rg -n "DEEPSEEK_API_KEY=|service_role|sk-[A-Za-z0-9]|VITE_SUPABASE_ANON_KEY=." -S .`

- [ ] **Step 4: Commit and push**

Run:

```bash
git add docs/superpowers/specs/2026-06-12-rule-ai-recommendation-design.md docs/superpowers/plans/2026-06-12-rule-ai-recommendation-plan.md app/src/features/recommendations app/src/features/auth/AuthPanel.tsx supabase/functions/recommend-brew
git commit -m "Add rule and DeepSeek brew recommendations"
git push
```

- [ ] **Step 5: Verify deployment**

Check GitHub Pages latest HTML and asset URLs return HTTP 200. Tell the user that Supabase function deployment and `DEEPSEEK_API_KEY` secret setup are still required before AI text works online.
