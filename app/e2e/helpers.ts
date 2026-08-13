import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { login, type LocalTestUser } from './fixtures/auth'

export async function signedInContext(
  browser: Browser,
  user: LocalTestUser,
  viewport: { width: number; height: number },
) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  await login(page, user)
  return { context, page }
}

export async function openBeans(page: Page) {
  await page.locator('.app-bottom-nav button').nth(1).click()
  await expect(page.locator('#bean-dashboard')).toBeVisible()
}

export async function createBean(page: Page, name: string) {
  await openBeans(page)
  const section = page.locator('.bean-section').filter({ hasText: '手动加豆' })
  const summary = section.locator('.bean-section__summary')
  if (await summary.getAttribute('aria-expanded') !== 'true') await summary.click()
  await section.locator('.bean-form input[required]').fill(name)
  await section.locator('.bean-form button[type="submit"]').click()
  await expect(page.locator('.bean-card h3').filter({ hasText: name })).toBeVisible()
}

export async function editBean(page: Page, currentName: string, nextName: string) {
  await openBeans(page)
  const card = page.locator('.bean-card').filter({ hasText: currentName })
  await card.getByRole('button', { name: '编辑' }).click()
  const form = page.locator('.bean-form')
  await form.locator('input[required]').fill(nextName)
  await form.locator('button[type="submit"]').click()
  await expect(page.locator('.bean-card h3').filter({ hasText: nextName })).toBeVisible()
}

export async function createBrew(page: Page, note: string) {
  await openBeans(page)
  const section = page.locator('.bean-section').filter({ hasText: '冲煮记录' })
  const summary = section.locator('.bean-section__summary')
  if (await summary.getAttribute('aria-expanded') !== 'true') await summary.click()
  await section.locator('.brew-form textarea').fill(note)
  await section.locator('.brew-form button[type="submit"]').click()
  await expect(section.locator('.brew-card').filter({ hasText: note })).toBeVisible()
}

export async function waitForOutbox(page: Page, expected: number) {
  await expect.poll(() => page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kaday-offline-cache')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return await new Promise<number>((resolve, reject) => {
      const transaction = database.transaction('outbox', 'readonly')
      const request = transaction.objectStore('outbox').count()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      transaction.oncomplete = () => database.close()
    })
  })).toBe(expected)
}

export async function closeContexts(...contexts: BrowserContext[]) {
  await Promise.all(contexts.map((context) => context.close()))
}
