import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
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
    launchOptions: { executablePath: chromePath },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile-chrome', use: { viewport: { width: 360, height: 800 } } },
    { name: 'desktop-chrome', use: { viewport: { width: 1280, height: 900 } } },
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
    output = execFileSync(process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe', [
      '/d', '/s', '/c', 'npx --yes supabase status -o env',
    ], {
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
