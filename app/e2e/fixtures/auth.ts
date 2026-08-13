import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test'

export type LocalTestUser = {
  id: string
  email: string
  password: string
  accessToken: string
  api: APIRequestContext
  adminApi: APIRequestContext
}

type Fixtures = { testUser: LocalTestUser }

export const test = base.extend<Fixtures>({
  testUser: async ({ playwright }, provide, testInfo) => {
    const url = requireLocalUrl(process.env.E2E_SUPABASE_URL)
    const anonKey = requireValue(process.env.E2E_SUPABASE_ANON_KEY, 'E2E_SUPABASE_ANON_KEY')
    const serviceRoleKey = requireValue(
      process.env.E2E_SUPABASE_SERVICE_ROLE_KEY,
      'E2E_SUPABASE_SERVICE_ROLE_KEY',
    )
    const api = await playwright.request.newContext({
      baseURL: url,
      extraHTTPHeaders: { apikey: anonKey },
    })
    const adminApi = await playwright.request.newContext({
      baseURL: url,
      extraHTTPHeaders: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    })
    const email = `coffee-e2e-${testInfo.workerIndex}-${Date.now()}@example.test`
    const password = `Coffee-e2e-${crypto.randomUUID()}!`
    const response = await api.post('/auth/v1/signup', { data: { email, password } })
    expect(response.ok(), `local signup failed (${response.status()})`).toBeTruthy()
    const body = await response.json() as { access_token?: string; user?: { id?: string } }
    if (!body.access_token || !body.user?.id) {
      throw new Error('Local Auth did not return a test session; email confirmation must be disabled locally.')
    }
    await provide({
      id: body.user.id, email, password, accessToken: body.access_token, api, adminApi,
    })
    await adminApi.delete(`/auth/v1/admin/users/${body.user.id}`)
    await adminApi.dispose()
    await api.dispose()
  },
})

export { expect }

export async function login(page: Page, user: LocalTestUser) {
  await page.goto('./')
  await page.locator('#email').fill(user.email)
  await page.locator('#password').fill(user.password)
  await page.locator('.auth-form button[type="submit"]').click()
  await expect(page.locator('.auth-layout--app')).toBeVisible()
}

export async function restRows<T>(user: LocalTestUser, path: string): Promise<T[]> {
  const response = await user.api.get(`/rest/v1/${path}`, {
    headers: { Authorization: `Bearer ${user.accessToken}` },
  })
  expect(response.ok(), `local REST read failed (${response.status()})`).toBeTruthy()
  return await response.json() as T[]
}

function requireLocalUrl(value: string | undefined) {
  const url = requireValue(value, 'E2E_SUPABASE_URL')
  const parsed = new URL(url)
  if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new Error('E2E refuses to use a non-local Supabase URL.')
  }
  return parsed.origin
}

function requireValue(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required for local E2E.`)
  return value
}
