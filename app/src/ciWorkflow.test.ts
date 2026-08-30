import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('data safety workflow', () => {
  it('runs every Edge Function test file through the deployment gate', () => {
    const workflow = readFileSync(
      resolve(process.cwd(), '../.github/workflows/data-safety-checks.yml'),
      'utf8',
    )

    expect(workflow).toContain('deno test supabase/functions --allow-env')
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
