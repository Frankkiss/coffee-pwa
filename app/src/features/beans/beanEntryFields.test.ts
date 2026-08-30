import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('bean entry field visibility', () => {
  it('shows net package weight in the manual bean form', () => {
    const dashboard = source('src/features/beans/BeanDashboard.tsx')

    expect(dashboard).toMatch(
      /净含量（克）[\s\S]{0,300}value=\{form\.netWeightGrams\}[\s\S]{0,220}updateField\('netWeightGrams'/,
    )
  })

  it('shows editable AI net weight and price before source-import confirmation', () => {
    const panel = source('src/features/sourceImports/SourceImportPanel.tsx')

    expect(panel).toMatch(
      /净含量（克）[\s\S]{0,300}value=\{form\.netWeightGrams\}[\s\S]{0,220}updateField\('netWeightGrams'/,
    )
    expect(panel).toMatch(
      /价格（可选）[\s\S]{0,300}value=\{form\.price\}[\s\S]{0,220}updateField\('price'/,
    )
  })
})
