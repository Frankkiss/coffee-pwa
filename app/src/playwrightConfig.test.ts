import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Playwright configuration', () => {
  const config = readFileSync(resolve(process.cwd(), 'playwright.config.ts'), 'utf8')

  it('uses system Chrome only when it exists on Windows', () => {
    expect(config).toContain("process.platform === 'win32'")
    expect(config).toContain('existsSync(chromePath)')
    expect(config).toContain('executablePath: localChromePath')
  })

  it('keeps a dedicated mobile Chromium project for the core workflow gate', () => {
    expect(config).toContain("name: 'mobile-chromium'")
    expect(config).toContain("browserName: 'chromium'")
    expect(config).toContain('viewport: { width: 360, height: 800 }')
  })
})
