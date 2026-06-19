# Bean-Aware Recommendation Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve rule-based AI brew recommendations so they combine history, templates, and real bean attributes such as process, altitude, variety, roast, origin, and processing station.
**Architecture:** Keep the deterministic recommendation engine in the frontend, pass richer context to the Supabase Edge Function, and keep AI output as an explainable suggestion draft.
**Tech Stack:** React, TypeScript, Vitest, Supabase Edge Functions, DeepSeek-compatible JSON prompt contract.

---

## Scope

Only touch the recommendation feature surface:

- Rule recommendation scoring and generated parameter adjustments.
- Template candidate scoring where bean metadata can improve template choice.
- Recommendation UI display for confidence and bean-aware adjustment reasons.
- Saved recommendation payload compatibility.
- Supabase `recommend-brew` prompt text so the AI respects the richer rule context.

Do not modify unrelated home, bean storage, brew log, backup, auth, or import flows.

## Research Basis

Use conservative hand-brew heuristics from common pour-over guidance:

- Water temperature baseline stays around 90-96 C / 195-205 F.
- Hotter water and slightly longer contact can help dense, light-roasted, high-altitude beans extract enough sweetness.
- Cooler water and gentler agitation can reduce bitterness or ferment-forward harshness for darker, natural, honey, or anaerobic beans.
- Dripper shape, contact time, channeling risk, and pouring style influence extraction, so rule output should explain adjustments rather than claim certainty.

## Implementation Tasks

- [ ] Add tests for template-only fallback when there is no usable history.
- [ ] Add tests for bean-aware historical scoring: altitude band, processing station, process family, and rating guardrails.
- [ ] Add tests for bean-aware parameter tuning: high-altitude light roast nudges extraction upward; anaerobic/natural/dark beans avoid overly hot aggressive recipes.
- [ ] Add tests for template scoring penalties using `avoidFor` and stronger matches using `suitableFor` bean metadata.
- [ ] Extend recommendation types with top-level `recommended`, `confidence`, `baseSource`, and `beanAdjustmentReasons` while keeping existing history candidate fields compatible.
- [ ] Implement reusable bean metadata helpers for process family, altitude band, roast band, station matching, and flavor/variety token matching.
- [ ] Update `generateRuleRecommendation` so it can produce a low-confidence template-based recommendation when no history is usable.
- [ ] Update the recommendation panel to display the new top-level recommendation, confidence, and bean adjustment reasons without changing unrelated sections.
- [ ] Update saved recommendation payloads to persist the richer rule context and keep old saved data readable.
- [ ] Update Supabase AI prompt requirements so AI uses the deterministic base recipe and bean-aware adjustment reasons, and avoids pretending the result is guaranteed perfect.
- [ ] Run focused recommendation tests, then full test/build checks.
- [ ] Commit and push the implementation.

## Acceptance Criteria

- A bean with no brew history can still receive a template-based rule recommendation with low confidence.
- Similar historical records are ranked by real bean similarity, not only simple exact string equality.
- The final base recipe reflects small, bounded adjustments for altitude, process, roast, and bean style.
- The UI explains why a rule changed temperature/time/agitation expectations.
- Saved recommendation records include the final rule recommendation and enough context to audit it later.
- Tests cover the key rule branches and existing recommendation tests still pass.