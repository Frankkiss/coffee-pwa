import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Supabase migrations', () => {
  it('does not schema-qualify PostgreSQL special-syntax position calls', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        '../supabase/migrations/20260830010000_method_aware_brew_templates.sql',
      ),
      'utf8',
    )

    expect(migration).not.toContain('pg_catalog.position(')
  })
})
