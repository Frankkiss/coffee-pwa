import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('custom template entry fields', () => {
  it('uses the four-mode selector and mode-specific measurements', () => {
    const panel = readFileSync(
      resolve(process.cwd(), 'src/features/brewTemplates/BrewTemplatePanel.tsx'),
      'utf8',
    )

    expect(panel).toContain('冲煮方式')
    expect(panel).toContain("update('brewMode'")
    expect(panel).toContain("update('brewVariant'")
    expect(panel).toContain("update('iceGrams'")
    expect(panel).toContain("update('beverageGrams'")
    expect(panel).not.toContain('作为冠军参考模板')
    expect(panel).not.toContain('摩卡壶')
    expect(panel).not.toContain('法压壶')
  })
})
