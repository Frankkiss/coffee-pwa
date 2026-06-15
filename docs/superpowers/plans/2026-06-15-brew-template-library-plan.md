# Brew Template Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Android-first brew template library page with structured built-in recipes, filtering, and detail views.

**Architecture:** Keep template data, filtering logic, and React UI separate inside `app/src/features/brewTemplates/`. Templates are static application knowledge, not user data, so no Supabase schema changes are needed. The first implementation exposes the template library in the signed-in layout and leaves AI recommendation integration for the next plan.

**Tech Stack:** React, TypeScript, Vitest, CSS modules by feature folder, Vite build.

---

### File Structure

- Create: `app/src/features/brewTemplates/brewTemplateTypes.ts`
  - Owns template categories, difficulty, filter, and step types.
- Create: `app/src/features/brewTemplates/brewTemplates.ts`
  - Owns the built-in template constants.
- Create: `app/src/features/brewTemplates/brewTemplateFilters.ts`
  - Owns pure filtering and template summary helpers.
- Create: `app/src/features/brewTemplates/brewTemplateFilters.test.ts`
  - Tests template count, ids, filtering, and step invariants.
- Create: `app/src/features/brewTemplates/BrewTemplatePanel.tsx`
  - Renders filters, template cards, and expanded detail.
- Create: `app/src/features/brewTemplates/brewTemplates.css`
  - Mobile-first styling for the template page.
- Modify: `app/src/features/auth/AuthPanel.tsx`
  - Adds the template panel after the homepage and before bean management.

### Task 1: Template Types And Dataset

**Files:**
- Create: `app/src/features/brewTemplates/brewTemplateTypes.ts`
- Create: `app/src/features/brewTemplates/brewTemplates.ts`
- Test: `app/src/features/brewTemplates/brewTemplateFilters.test.ts`

- [ ] **Step 1: Write failing dataset invariant tests**

```ts
import { describe, expect, it } from 'vitest'
import { brewTemplates } from './brewTemplates'

describe('brew template dataset', () => {
  it('contains a broad v1 template library with unique ids', () => {
    const ids = new Set(brewTemplates.map((template) => template.id))

    expect(brewTemplates.length).toBeGreaterThanOrEqual(20)
    expect(ids.size).toBe(brewTemplates.length)
  })

  it('keeps each template executable with bounded cumulative pours', () => {
    for (const template of brewTemplates) {
      expect(template.pourSteps.length).toBeGreaterThanOrEqual(2)
      expect(template.waterGrams).toBeGreaterThan(0)
      expect(template.doseGrams).toBeGreaterThan(0)
      expect(template.sourceNotes.length).toBeGreaterThan(0)

      const lastStep = template.pourSteps.at(-1)
      expect(lastStep?.targetWaterGrams).toBeLessThanOrEqual(template.waterGrams)

      for (const step of template.pourSteps) {
        expect(step.targetWaterGrams).toBeLessThanOrEqual(template.waterGrams)
        expect(step.action.length).toBeGreaterThan(0)
      }
    }
  })

  it('marks champion templates as advanced references', () => {
    const championTemplates = brewTemplates.filter((template) => template.isChampionReference)

    expect(championTemplates.length).toBeGreaterThanOrEqual(4)
    expect(championTemplates.every((template) => template.difficulty === 'advanced')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run src/features/brewTemplates/brewTemplateFilters.test.ts`

Expected: fail because `brewTemplates` does not exist.

- [ ] **Step 3: Add template types**

Create `brewTemplateTypes.ts` with exported `BrewTemplate`, `BrewTemplatePourStep`, `BrewTemplateCategory`, `BrewTemplateDifficulty`, and `BrewTemplateFilters` types exactly matching the approved design.

- [ ] **Step 4: Add built-in template data**

Create `brewTemplates.ts` with at least 20 templates. Include daily hand brew templates, immersion/hybrid templates, special bean templates, and champion reference templates. Each template must include complete pour steps and reference notes.

- [ ] **Step 5: Run dataset tests**

Run: `npm run test -- --run src/features/brewTemplates/brewTemplateFilters.test.ts`

Expected: pass.

### Task 2: Template Filtering Model

**Files:**
- Modify: `app/src/features/brewTemplates/brewTemplateFilters.ts`
- Modify: `app/src/features/brewTemplates/brewTemplateFilters.test.ts`

- [ ] **Step 1: Add failing filter tests**

Add tests proving:

```ts
import {
  filterBrewTemplates,
  getBrewTemplateFilterOptions,
  summarizePourSteps,
} from './brewTemplateFilters'

it('filters templates by brewer, flavor, difficulty, and champion visibility', () => {
  const filtered = filterBrewTemplates(brewTemplates, {
    brewer: 'V60',
    flavor: '明亮',
    difficulty: 'easy',
    includeChampionReferences: false,
  })

  expect(filtered.length).toBeGreaterThan(0)
  expect(filtered.every((template) => template.brewer.includes('V60'))).toBe(true)
  expect(filtered.every((template) => template.difficulty === 'easy')).toBe(true)
  expect(filtered.every((template) => !template.isChampionReference)).toBe(true)
})

it('builds stable filter options from template data', () => {
  const options = getBrewTemplateFilterOptions(brewTemplates)

  expect(options.brewers).toContain('V60')
  expect(options.flavors).toContain('明亮')
  expect(options.difficulties).toEqual(['easy', 'medium', 'advanced'])
})

it('summarizes cumulative pour steps for compact cards', () => {
  const summary = summarizePourSteps(brewTemplates[0])

  expect(summary).toContain('1.')
  expect(summary).toContain('g')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run src/features/brewTemplates/brewTemplateFilters.test.ts`

Expected: fail because filter helpers do not exist.

- [ ] **Step 3: Implement pure helpers**

Create `brewTemplateFilters.ts`:

- `filterBrewTemplates(templates, filters)`
- `getBrewTemplateFilterOptions(templates)`
- `summarizePourSteps(template)`
- `formatTime(seconds)`

Filtering must exclude champion references by default unless `includeChampionReferences` is true.

- [ ] **Step 4: Run filter tests**

Run: `npm run test -- --run src/features/brewTemplates/brewTemplateFilters.test.ts`

Expected: pass.

### Task 3: Template Library UI

**Files:**
- Create: `app/src/features/brewTemplates/BrewTemplatePanel.tsx`
- Create: `app/src/features/brewTemplates/brewTemplates.css`
- Modify: `app/src/features/auth/AuthPanel.tsx`

- [ ] **Step 1: Add panel component**

Create `BrewTemplatePanel.tsx` with local filter state, template count summary, filter controls, cards, and expandable details. It should import `brewTemplates`, `filterBrewTemplates`, `getBrewTemplateFilterOptions`, and `summarizePourSteps`.

- [ ] **Step 2: Add mobile-first styles**

Create `brewTemplates.css` with compact controls, cards, badges, step lists, and detail sections. Keep styling aligned with the current warm coffee theme.

- [ ] **Step 3: Wire panel into authenticated layout**

Modify `AuthPanel.tsx`:

```tsx
import { BrewTemplatePanel } from '../brewTemplates/BrewTemplatePanel'
```

Render after `<HomeOverview />` and before `<BeanDashboard />`:

```tsx
<BrewTemplatePanel />
```

- [ ] **Step 4: Build check**

Run: `npm run build`

Expected: pass.

### Task 4: Full Verification And Commit

**Files:**
- All files changed in Tasks 1-3.

- [ ] **Step 1: Run full tests**

Run: `npm run test`

Expected: all tests pass.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: pass.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: pass.

- [ ] **Step 4: Review diff**

Run: `git diff --stat`

Expected: only `brewTemplates` files, `AuthPanel.tsx`, and this plan are changed.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-06-15-brew-template-library-plan.md app/src/features/brewTemplates app/src/features/auth/AuthPanel.tsx
git commit -m "Add brew template library"
```

- [ ] **Step 6: Push**

```bash
git push origin foundation
```
