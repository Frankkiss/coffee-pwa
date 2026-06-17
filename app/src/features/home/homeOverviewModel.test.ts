import { describe, expect, it } from 'vitest'
import type { BackupReminderView } from '../backup/backupReminder'
import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import { buildHomeOverview } from './homeOverviewModel'

function createBean(overrides: Partial<Bean> = {}): Bean {
  return {
    id: 'bean-1',
    user_id: 'user-1',
    name: '埃塞俄比亚 花魁',
    roaster: '测试烘焙',
    origin: 'Ethiopia',
    farm_or_station: 'Hambella',
    process: '日晒',
    variety: 'Heirloom',
    altitude_meters: 1950,
    roast_date: '2026-06-01',
    roast_level: '浅烘',
    flavor_tags: ['草莓', '奶油'],
    flavor_notes: null,
    net_weight_grams: 100,
    price: null,
    purchase_date: null,
    source_url: null,
    image_url: null,
    notes: null,
    created_at: '2026-06-10T08:00:00.000Z',
    updated_at: '2026-06-10T08:00:00.000Z',
    deleted_at: null,
    schema_version: 1,
    ...overrides,
  }
}

function createBrewLog(overrides: Partial<BrewLog> = {}): BrewLog {
  return {
    id: 'brew-1',
    user_id: 'user-1',
    bean_id: 'bean-1',
    brewed_at: '2026-06-15T08:30:00.000Z',
    method: '手冲',
    dripper: 'V60',
    filter_paper: null,
    grinder: 'C40',
    grind_setting: '22 clicks',
    coffee_grams: 15,
    water_grams: 240,
    ratio: '1:16',
    water_temperature_c: 92,
    total_time_seconds: 150,
    pour_steps: [],
    rating: 4.5,
    acidity: null,
    sweetness: null,
    bitterness: null,
    astringency: null,
    body: null,
    aftertaste: null,
    flavor_tags: ['莓果'],
    is_pinned_recipe: true,
    notes: null,
    created_at: '2026-06-15T08:30:00.000Z',
    updated_at: '2026-06-15T08:30:00.000Z',
    deleted_at: null,
    schema_version: 1,
    ...overrides,
  }
}

const backupReminder: BackupReminderView = {
  tone: 'ok',
  title: '最近已备份',
  message: '上次 JSON 备份在 2 天前，当前备份节奏正常。',
  fileName: 'coffee-backup-2026-06-13.json',
  daysSinceExport: 2,
}

describe('buildHomeOverview', () => {
  it('builds compact cards for beans, brews, backup, and quick summaries', () => {
    const overview = buildHomeOverview({
      beans: [
        createBean({ id: 'bean-1', name: '埃塞俄比亚 花魁' }),
        createBean({
          id: 'bean-2',
          name: '哥伦比亚 粉波旁',
          origin: 'Colombia',
          process: '水洗',
          flavor_tags: ['橙子'],
          created_at: '2026-06-12T08:00:00.000Z',
        }),
      ],
      brewLogs: [
        createBrewLog(),
        createBrewLog({
          id: 'brew-2',
          bean_id: 'bean-2',
          brewed_at: '2026-06-14T08:30:00.000Z',
          ratio: null,
          water_temperature_c: null,
          total_time_seconds: null,
          grind_setting: null,
        }),
      ],
      backupReminder,
      email: '1799263035@qq.com',
      isOnline: true,
    })

    expect(overview.stats).toEqual([
      { label: '豆仓', value: '2', caption: '支咖啡豆' },
      { label: '冲煮', value: '2', caption: '条记录' },
      { label: '推荐', value: '可用', caption: 'DeepSeek + 规则' },
      { label: '备份', value: '2天前', caption: '最近已备份' },
    ])
    expect(overview.currentBeans[0]).toMatchObject({
      id: 'bean-2',
      name: '哥伦比亚 粉波旁',
      meta: 'Colombia / 水洗 / 浅烘',
      note: '橙子',
    })
    expect(overview.recentBrews[0]).toMatchObject({
      id: 'brew-1',
      beanName: '埃塞俄比亚 花魁',
      summary: '手冲 / V60 / 1:16 / 92°C / 150s / 22 clicks',
      rating: '4.5/5',
    })
    expect(overview.accountLabel).toBe('1799263035')
    expect(overview.syncLabel).toBe('云同步在线')
  })
})
