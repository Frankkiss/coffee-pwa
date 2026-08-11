import { describe, expect, it } from 'vitest'
import {
  createUserSettingsInput,
  normalizeUserSettings,
  parseBackupReminderDays,
  toUserSettingsForm,
} from './userSettingsModel'

const userId = '00000000-0000-4000-8000-000000000001'

describe('userSettingsModel', () => {
  it('provides safe defaults when settings have not synced yet', () => {
    expect(normalizeUserSettings(null, userId)).toMatchObject({
      user_id: userId,
      preferred_units: {},
      default_gear: {},
      taste_preferences: {},
      backup_reminder_days: 7,
      schema_version: 1,
    })
  })

  it('accepts reminder days only from 1 through 365', () => {
    expect(parseBackupReminderDays('1')).toEqual({ ok: true, value: 1 })
    expect(parseBackupReminderDays('365')).toEqual({ ok: true, value: 365 })
    expect(parseBackupReminderDays('0')).toEqual({
      ok: false,
      message: '备份提醒天数必须在 1 到 365 之间',
    })
    expect(parseBackupReminderDays('1.5').ok).toBe(false)
  })

  it('round-trips the focused settings fields without exposing raw JSON editing', () => {
    const input = createUserSettingsInput({
      backupReminderDays: '14',
      preferredUnits: 'metric',
      defaultGear: 'V60\nC40',
      tastePreferences: '明亮、甜感、低苦味',
    })

    expect(input).toEqual({
      ok: true,
      value: {
        backup_reminder_days: 14,
        preferred_units: { system: 'metric' },
        default_gear: { items: ['V60', 'C40'] },
        taste_preferences: { notes: '明亮、甜感、低苦味' },
      },
    })
    if (!input.ok) throw new Error('expected valid settings')
    expect(toUserSettingsForm(input.value)).toEqual({
      backupReminderDays: '14',
      preferredUnits: 'metric',
      defaultGear: 'V60\nC40',
      tastePreferences: '明亮、甜感、低苦味',
    })
  })

  it('preserves settings keys that the focused form does not edit', () => {
    const result = createUserSettingsInput({
      backupReminderDays: '21',
      preferredUnits: 'metric',
      defaultGear: 'V60',
      tastePreferences: '甜感',
    }, {
      backup_reminder_days: 7,
      preferred_units: { weight: 'grams' },
      default_gear: { grinder: 'C40' },
      taste_preferences: { acidity: 4 },
    })
    expect(result).toEqual({
      ok: true,
      value: {
        backup_reminder_days: 21,
        preferred_units: { weight: 'grams', system: 'metric' },
        default_gear: { grinder: 'C40', items: ['V60'] },
        taste_preferences: { acidity: 4, notes: '甜感' },
      },
    })
  })
})
