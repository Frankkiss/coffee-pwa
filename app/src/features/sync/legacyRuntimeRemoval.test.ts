import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url))
const deprecatedModules = [
  'features/offline/offlineCache.ts',
  'features/offline/offlineQueue.ts',
  'features/beans/beanService.ts',
  'features/brews/brewLogService.ts',
  'features/brewTemplates/brewTemplateService.ts',
]

describe('legacy runtime removal gate', () => {
  it('has no deprecated runtime modules or production imports while retaining raw stores', () => {
    expect(deprecatedModules.filter((path) => existsSync(`${sourceRoot}/${path}`))).toEqual([])

    const productionSources = listProductionSources(sourceRoot)
    const forbiddenImports = productionSources.flatMap((path) => {
      const source = readFileSync(path, 'utf8')
      return deprecatedModules
        .filter((modulePath) => source.includes(modulePath.split('/').at(-1)!.replace('.ts', '')))
        .map((modulePath) => ({ path, modulePath }))
    })
    expect(forbiddenImports).toEqual([])

    const databaseSource = readFileSync(new URL('./syncDatabase.ts', import.meta.url), 'utf8')
    expect(databaseSource).toContain("database.createObjectStore('snapshots')")
    expect(databaseSource).toContain("database.createObjectStore('pendingMutations'")
  })
})

function listProductionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) return listProductionSources(path)
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : []
  })
}
