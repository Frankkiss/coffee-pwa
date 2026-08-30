import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('data safety workflow', () => {
  it('runs every Edge Function test file through the deployment gate', () => {
    const workflow = readFileSync(
      resolve(process.cwd(), '../.github/workflows/data-safety-checks.yml'),
      'utf8',
    )

    expect(workflow.match(/deno test supabase\/functions --allow-env/g)).toHaveLength(1)
  })

  it('runs the mobile core E2E with Playwright Chromium against local Supabase', () => {
    const workflow = readFileSync(
      resolve(process.cwd(), '../.github/workflows/data-safety-checks.yml'),
      'utf8',
    )

    expect(workflow).toContain('npx playwright install --with-deps chromium')
    expect(workflow).toContain('e2e/core-workflows.spec.ts --project=mobile-chromium')
    expect(workflow).not.toContain('supabase start --exclude')
  })

  it('publishes database test details as a check annotation on failure', () => {
    const workflow = readFileSync(
      resolve(process.cwd(), '../.github/workflows/data-safety-checks.yml'),
      'utf8',
    )

    expect(workflow).toContain('tee "$RUNNER_TEMP/database-tests.log"')
    expect(workflow).toContain('::error title=Database tests failed::')
  })

  it('does not duplicate the foundation push gate outside the Pages workflow', () => {
    const workflow = readFileSync(
      resolve(process.cwd(), '../.github/workflows/data-safety-checks.yml'),
      'utf8',
    )

    expect(workflow).not.toMatch(/\n\s*push:\s*\n/)
  })

  it('does not keep undocumented standalone smoke entry points', () => {
    for (const path of [
      'backup-flow-smoke.html',
      'indexeddb-smoke.html',
      'src/backupFlowSmoke.tsx',
      'src/features/backup/backupBrowserFixture.ts',
      'src/test/indexeddbReleaseSmoke.ts',
    ]) {
      expect(existsSync(resolve(process.cwd(), path)), path).toBe(false)
    }
  })
})
