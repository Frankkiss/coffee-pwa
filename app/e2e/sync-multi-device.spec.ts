import { test, expect, restRows } from './fixtures/auth'
import {
  closeContexts, createBean, createBrew, editBean, openBeans, signedInContext, waitForOutbox,
} from './helpers'

test('desktop and phone safely merge online and offline edits', async ({ browser, testUser }) => {
  const desktop = await signedInContext(browser, testUser, { width: 1280, height: 900 })
  const phone = await signedInContext(browser, testUser, { width: 360, height: 800 })
  try {
    await createBean(desktop.page, 'Desktop bean')
    await waitForOutbox(desktop.page, 0)

    await phone.page.reload()
    await phone.page.locator('.app-bottom-nav button').nth(1).click()
    await expect(phone.page.locator('.bean-card h3').filter({ hasText: 'Desktop bean' })).toBeVisible()

    await phone.context.setOffline(true)
    await createBrew(phone.page, 'Phone offline brew')
    await waitForOutbox(phone.page, 1)
    await editBean(desktop.page, 'Desktop bean', 'Desktop edited bean')
    await waitForOutbox(desktop.page, 0)

    await phone.context.setOffline(false)
    await phone.page.evaluate(() => window.dispatchEvent(new Event('online')))
    await waitForOutbox(phone.page, 0)
    await expect.poll(async () => (await restRows<{ notes: string }>(
      testUser, `brew_logs?user_id=eq.${testUser.id}&notes=eq.Phone%20offline%20brew&select=notes`,
    )).length).toBe(1)
  } finally {
    await closeContexts(desktop.context, phone.context)
  }
})

test('two tabs share one batch lock and an ambiguous retry stays idempotent', async ({ browser, testUser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const first = await context.newPage()
  try {
    const { login } = await import('./fixtures/auth')
    await login(first, testUser)
    const second = await context.newPage()
    await second.goto('./')
    await expect(second.locator('.auth-layout--app')).toBeVisible()
    // Load the lazy bean screen in both tabs before simulating a network loss.
    await Promise.all([openBeans(first), openBeans(second)])

    await context.setOffline(true)
    await createBean(first, 'One batch bean')
    await waitForOutbox(first, 1)

    let applyCalls = 0
    let returnedAmbiguousFailure = false
    await context.route('**/rest/v1/rpc/apply_sync_batch', async (route) => {
      applyCalls += 1
      const response = await route.fetch()
      if (!returnedAmbiguousFailure) {
        returnedAmbiguousFailure = true
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"retry"}' })
        return
      }
      await route.fulfill({ response })
    })

    await context.setOffline(false)
    await Promise.all([
      first.evaluate(() => window.dispatchEvent(new Event('online'))),
      second.evaluate(() => window.dispatchEvent(new Event('online'))),
    ])
    await waitForOutbox(first, 0)
    expect(applyCalls).toBe(2)
    const rows = await restRows<{ id: string }>(
      testUser, `beans?user_id=eq.${testUser.id}&name=eq.One%20batch%20bean&select=id`,
    )
    expect(rows).toHaveLength(1)
  } finally {
    await context.close()
  }
})
