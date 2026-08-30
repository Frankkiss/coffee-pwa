import { test, expect, login } from './fixtures/auth'
import { openBeans, waitForOutbox } from './helpers'

test('mobile bean, brew modes, custom template and recommendation draft stay aligned', async ({ page, testUser }) => {
  await login(page, testUser)
  await openBeans(page)

  const beanSection = page.locator('.bean-section').filter({ hasText: '手动加豆' })
  const beanSummary = beanSection.locator('.bean-section__summary')
  if (await beanSummary.getAttribute('aria-expanded') !== 'true') await beanSummary.click()
  await beanSection.getByLabel('名称').fill('移动端流程豆')
  await beanSection.getByLabel('净含量（克）').fill('250')
  await beanSection.getByRole('button', { name: '保存咖啡豆' }).click()
  await waitForOutbox(page, 0)
  await expect(page.locator('.bean-card').filter({ hasText: '移动端流程豆' })).toBeVisible()

  const brewSection = page.locator('.bean-section').filter({ hasText: '冲煮记录' })
  const brewSummary = brewSection.locator('.bean-section__summary')
  if (await brewSummary.getAttribute('aria-expanded') !== 'true') await brewSummary.click()
  const mode = brewSection.getByLabel('冲煮类型')

  await mode.selectOption('hot_pourover')
  await expect(brewSection.getByLabel('具体方法')).toBeVisible()
  await expect(brewSection.getByLabel('冰量')).toHaveCount(0)

  await mode.selectOption('iced_pourover')
  await expect(brewSection.getByLabel('热水量')).toBeVisible()
  await expect(brewSection.getByLabel('冰量')).toBeVisible()

  await mode.selectOption('cold_brew')
  await expect(brewSection.getByLabel('冷萃类型')).toHaveValue('ready_to_drink')
  await expect(brewSection.getByLabel('具体方法')).toHaveCount(0)
  await expect(brewSection.getByLabel('冰量')).toHaveCount(0)
  await brewSection.getByLabel('冷萃类型').selectOption('concentrate')
  await expect(brewSection.getByLabel('冰量')).toBeVisible()

  await mode.selectOption('espresso')
  await expect(brewSection.getByLabel('出液量')).toBeVisible()
  await expect(brewSection.getByLabel('水量')).toHaveCount(0)

  await page.getByRole('button', { name: '冲煮模板' }).click()
  await expect(page.locator('#brew-templates')).toBeVisible()
  await page.getByRole('button', { name: '新增模板' }).click()
  const templateForm = page.locator('.brew-template-form')
  await templateForm.getByLabel('名称').fill('移动端冰手冲模板')
  await templateForm.getByLabel('冲煮方式').selectOption('iced_pourover')
  await templateForm.getByLabel('冰量 g').fill('75')
  await templateForm.getByLabel('粉水比（仅热水）').fill('1:10')
  await templateForm.getByRole('button', { name: '保存模板' }).click()
  await waitForOutbox(page, 0)
  await expect(page.locator('.brew-template-card').filter({ hasText: '移动端冰手冲模板' })).toBeVisible()

  await page.route('**/functions/v1/recommend-brew', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: '{"message":"AI unavailable in deterministic E2E"}',
  }))
  await page.getByRole('button', { name: '冲煮推荐' }).click()
  await expect(page.locator('#recommendations')).toBeVisible()
  await page.getByLabel('冲煮方式').selectOption('iced_pourover')
  await page.getByRole('button', { name: '生成推荐' }).click()
  await expect(page.locator('.recommendation-result')).toBeVisible()
  await expect(page.locator('.recommendation-card')).toContainText('粉水比（仅热水）')
  await page.getByRole('button', { name: '用于本次冲煮' }).click()

  await expect(page.locator('#bean-dashboard')).toBeVisible()
  const draftSection = page.locator('.bean-section').filter({ hasText: '冲煮记录' })
  await expect(draftSection.getByLabel('冲煮类型')).toHaveValue('iced_pourover')
  await expect(draftSection.getByLabel('冰量')).not.toHaveValue('')
})
