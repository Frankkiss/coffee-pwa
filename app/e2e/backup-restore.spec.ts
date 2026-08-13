import { readFile } from 'node:fs/promises'
import { test, expect, restRows } from './fixtures/auth'
import { closeContexts, createBean, editBean, openBeans, signedInContext, waitForOutbox } from './helpers'

test('backup v2, legacy merge and full rollback preserve the safety gates', async ({ browser, testUser }) => {
  const desktop = await signedInContext(browser, testUser, { width: 1280, height: 900 })
  const phone = await signedInContext(browser, testUser, { width: 360, height: 800 })
  try {
    await createBean(desktop.page, 'Backup original')
    await waitForOutbox(desktop.page, 0)
    await desktop.page.locator('.app-bottom-nav button').nth(5).click()

    const backupDownload = await Promise.all([
      desktop.page.waitForEvent('download'),
      desktop.page.getByRole('button', { name: '下载 JSON 备份' }).click(),
    ]).then(([download]) => download)
    const backupPath = await backupDownload.path()
    expect(backupPath).not.toBeNull()
    const backupText = await readFile(backupPath!, 'utf8')
    const backup = JSON.parse(backupText)
    expect(backup.schemaVersion).toBe(2)

    await editBean(desktop.page, 'Backup original', 'Current must stay')
    await waitForOutbox(desktop.page, 0)
    await desktop.page.locator('.app-bottom-nav button').nth(5).click()
    await expect(desktop.page.locator('#backup')).toBeVisible()

    const corrupt = structuredClone(backup)
    corrupt.data.beans[0].name = 'tampered'
    await uploadJson(desktop.page, 'corrupt.json', corrupt)
    await expect(desktop.page.locator('.backup-error')).toContainText('文件可能损坏')

    const v1Bean = {
      id: backup.data.beans[0].id, user_id: testUser.id,
      name: 'Legacy must not overwrite', roaster: null, origin: null,
      farm_or_station: null, process: null, variety: null, altitude_meters: null,
      roast_date: null, roast_level: null, flavor_tags: [], flavor_notes: null,
      net_weight_grams: null, price: null, purchase_date: null, source_url: null,
      image_url: null, notes: null, created_at: '2026-06-12T01:00:00.000Z',
      updated_at: '2026-06-12T01:00:00.000Z', deleted_at: null, schema_version: 1,
    }
    const v1 = {
      schemaVersion: 1, exportedAt: backup.manifest.exportedAt, userId: testUser.id,
      includesImages: false, recordCounts: { beans: 1, brewLogs: 0 },
      data: { beans: [v1Bean], brewLogs: [] },
    }
    await uploadJson(desktop.page, 'legacy.json', v1)
    await expect(desktop.page.getByText('这份 v1 备份只能安全合并，不能全量回滚。')).toBeVisible()
    await desktop.page.getByRole('button', { name: '安全合并缺失数据' }).click()
    await expect(desktop.page.locator('.backup-result')).toBeVisible()

    await desktop.page.locator('.app-bottom-nav button').nth(1).click()
    await expect(desktop.page.locator('.bean-card h3').filter({ hasText: 'Current must stay' })).toBeVisible()

    await openBeans(phone.page)
    await phone.context.setOffline(true)
    await createBean(phone.page, 'Stale phone bean')
    await waitForOutbox(phone.page, 1)

    await desktop.page.locator('.app-bottom-nav button').nth(5).click()
    await uploadJson(desktop.page, 'backup-v2.json', backup)
    const preRestore = await Promise.all([
      desktop.page.waitForEvent('download'),
      desktop.page.getByRole('button', { name: '全量回滚' }).click(),
    ]).then(([download]) => download)
    expect(preRestore.suggestedFilename()).toMatch(/^coffee-pre-restore-/)
    const confirmation = desktop.page.locator('.backup-rollback input')
    const confirmButton = desktop.page.getByRole('button', { name: '确认全量回滚' })
    await expect(confirmation).toBeEnabled()
    await expect(confirmButton).toBeDisabled()
    await confirmation.fill('FULL RESTORE!')
    await expect(confirmButton).toBeDisabled()
    await confirmation.fill('FULL RESTORE')
    await expect(confirmButton).toBeEnabled()
    await confirmButton.click()
    await expect(desktop.page.locator('.backup-result')).toContainText('新同步代次 2')

    await phone.context.setOffline(false)
    await phone.page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(phone.page.locator('.sync-attention')).toBeVisible()
    await expect(phone.page.locator('.sync-attention')).toContainText('需要处理')
    await expect.poll(async () => (await restRows<{ id: string }>(
      testUser, `beans?user_id=eq.${testUser.id}&name=eq.Stale%20phone%20bean&select=id`,
    )).length).toBe(0)
    await waitForOutbox(phone.page, 1)
  } finally {
    await closeContexts(desktop.context, phone.context)
  }
})

async function uploadJson(page: import('@playwright/test').Page, name: string, value: unknown) {
  await page.locator('.backup-file input').setInputFiles({
    name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)),
  })
  await expect(page.locator('#backup-preview-title').or(page.locator('.backup-error'))).toBeVisible()
}
