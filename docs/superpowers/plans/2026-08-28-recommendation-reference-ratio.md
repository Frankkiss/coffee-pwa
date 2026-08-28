# Recommendation Reference Ratio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the recommendation page show the canonical, weight-derived iced pour-over ratio in every history reference without rewriting stored brew logs.

**Architecture:** Extract the history-reference list into a small presentational component. The component receives already-scored `BrewRecommendationCandidate` values and displays `candidate.recommended.ratio`, which is produced by the existing mode-aware history analysis, instead of reading the raw `candidate.brewLog.ratio` again.

**Tech Stack:** React 19, TypeScript 6, Vitest, React server rendering.

---

### Task 1: Read canonical ratios in recommendation history references

**Files:**
- Create: `app/src/features/recommendations/RecommendationHistoryReferences.tsx`
- Create: `app/src/features/recommendations/RecommendationHistoryReferences.test.tsx`
- Modify: `app/src/features/recommendations/RecommendationPanel.tsx`
- Modify: `docs/superpowers/plans/2026-08-28-recommendation-reference-ratio.md`

- [ ] **Step 1: Write the failing presentation test**

Render a reference candidate whose stored brew log contains `1:15.6` but whose canonical recommendation contains `1:9.4`:

```tsx
const html = renderToStaticMarkup(
  <RecommendationHistoryReferences references={[candidate]} />,
)

expect(html).toContain('1:9.4')
expect(html).not.toContain('1:15.6')
```

Add a second candidate with `recommended.ratio: null` and require the list to show `参数待补充` rather than its stored legacy ratio.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm --prefix app test -- src/features/recommendations/RecommendationHistoryReferences.test.tsx
```

Expected: FAIL because the component does not exist yet and the current page reads `candidate.brewLog.ratio`.

- [ ] **Step 3: Implement the focused reference component**

Create a component with this read boundary:

```tsx
export function RecommendationHistoryReferences({ references }: Props) {
  return (
    <div className="recommendation-references">
      <h3>参考历史记录</h3>
      {references.length === 0 ? <p>暂无可用历史记录，先使用模板兜底。</p> : null}
      {references.map((candidate) => (
        <article key={candidate.brewLog.id}>
          <strong>{candidate.bean?.name ?? '未知咖啡豆'}</strong>
          <span>
            {[candidate.recommended.ratio, candidate.brewLog.rating ? `${candidate.brewLog.rating}/5` : null]
              .filter(Boolean)
              .join(' / ') || '参数待补充'}
          </span>
        </article>
      ))}
    </div>
  )
}
```

Replace the inline reference list in `RecommendationPanel.tsx` with `<RecommendationHistoryReferences references={ruleRecommendation.references} />`. Do not modify `BrewLog`, IndexedDB, sync payloads, backups, database migrations, or Edge Functions.

- [ ] **Step 4: Run focused and full frontend verification**

Run:

```bash
npm --prefix app test -- src/features/recommendations/RecommendationHistoryReferences.test.tsx src/features/recommendations/historyRecipeFacts.test.ts src/features/recommendations/methodAwareRuleRecommendation.test.ts
npm --prefix app test
npm --prefix app run lint
npm --prefix app run build
```

Expected: the focused regression passes; all frontend tests pass; lint and production build exit with code 0.

- [ ] **Step 5: Commit**

```bash
git add app/src/features/recommendations/RecommendationHistoryReferences.tsx app/src/features/recommendations/RecommendationHistoryReferences.test.tsx app/src/features/recommendations/RecommendationPanel.tsx docs/superpowers/plans/2026-08-28-recommendation-reference-ratio.md
git commit -m "fix: show canonical recommendation references"
```

- [ ] **Step 6: Deployment gate**

Push `foundation` only after explicit user approval. This frontend-only fix requires GitHub Pages deployment but does not require redeploying `recommend-brew`.
