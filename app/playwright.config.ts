import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const localChromePath = process.platform === 'win32' && existsSync(chromePath)
  ? chromePath
  : undefined
const localConfig = readLocalSupabaseConfig()

process.env.E2E_SUPABASE_URL = localConfig.url
process.env.E2E_SUPABASE_ANON_KEY = localConfig.anonKey
process.env.E2E_SUPABASE_SERVICE_ROLE_KEY = localConfig.serviceRoleKey

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173/coffee-pwa/',
    launchOptions: { executablePath: localChromePath },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile-chromium', use: { browserName: 'chromium', viewport: { width: 360, height: 800 } } },
    { name: 'desktop-chromium', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4173/coffee-pwa/',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: localConfig.url,
      VITE_SUPABASE_ANON_KEY: localConfig.anonKey,
      VITE_SYNC_ROLLOUT_MODE: 'enabled',
    },
  },
})

function readLocalSupabaseConfig() {
  let output: string
  try {
    const executable = process.platform === 'win32'
      ? process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe'
      : 'npx'
    const args = process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npx --yes supabase status -o env']
      : ['--yes', 'supabase', 'status', '-o', 'env']
    output = execFileSync(executable, args, {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    throw new Error('Local Supabase is required. Start the local stack before npm run test:e2e.')
  }
  const values = Object.fromEntries(output.split(/\r?\n/).flatMap((line) => {
    const match = /^([A-Z_]+)="(.*)"$/.exec(line.trim())
    return match ? [[match[1], match[2]]] : []
  }))
  const url = values.API_URL
  const anonKey = values.ANON_KEY
  const serviceRoleKey = values.SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error('Local Supabase status did not provide required test credentials.')
  }
  const hostname = new URL(url).hostname
  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    throw new Error('E2E refuses to use a non-local Supabase URL.')
  }
  return { url, anonKey, serviceRoleKey }
}
