import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('PWA service worker source', () => {
  it('separates shell and runtime caches and prunes runtime assets on online navigation', () => {
    const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

    expect(source).toContain("const SHELL_CACHE_NAME = 'kaday-shell-v2'")
    expect(source).toContain("const RUNTIME_CACHE_NAME = 'kaday-runtime-v2'")
    expect(source).toContain('clearRuntimeCache()')
    expect(source).toContain('cache.put(request, copy)')
  })

  it('keeps third-party libraries out of the main application chunk', () => {
    const config = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')

    expect(config).toContain("name: 'vendor'")
    expect(config).toContain("test: /node_modules[\\\\/]/")
  })
})
