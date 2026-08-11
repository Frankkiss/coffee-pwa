import type { JsonObject } from '../../lib/jsonTypes'
import type { UserSettingsWriteInput } from './userSettingsRepository'
import type { UserSettingsRow } from './userSettingsTypes'

export type UserSettingsForm = {
  backupReminderDays: string
  preferredUnits: 'metric' | 'imperial'
  defaultGear: string
  tastePreferences: string
}

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string }

export function normalizeUserSettings(
  settings: UserSettingsRow | null,
  userId: string,
): UserSettingsRow {
  if (settings) return settings
  const now = new Date(0).toISOString()
  return {
    user_id: userId,
    preferred_units: {},
    default_gear: {},
    taste_preferences: {},
    backup_reminder_days: 7,
    created_at: now,
    updated_at: now,
    schema_version: 1,
  }
}

export function parseBackupReminderDays(value: string): ValidationResult<number> {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
    return { ok: false, message: '备份提醒天数必须在 1 到 365 之间' }
  }
  return { ok: true, value: parsed }
}

export function createUserSettingsInput(
  form: UserSettingsForm,
  current?: UserSettingsWriteInput,
): ValidationResult<UserSettingsWriteInput> {
  const reminderDays = parseBackupReminderDays(form.backupReminderDays)
  if (!reminderDays.ok) return reminderDays
  const gear = splitLines(form.defaultGear)
  return {
    ok: true,
    value: {
      backup_reminder_days: reminderDays.value,
      preferred_units: { ...(current?.preferred_units ?? {}), system: form.preferredUnits },
      default_gear: { ...(current?.default_gear ?? {}), items: gear },
      taste_preferences: {
        ...(current?.taste_preferences ?? {}),
        notes: form.tastePreferences.trim(),
      },
    },
  }
}

export function toUserSettingsForm(
  settings: Pick<UserSettingsWriteInput, 'backup_reminder_days' | 'preferred_units' | 'default_gear' | 'taste_preferences'>,
): UserSettingsForm {
  return {
    backupReminderDays: String(settings.backup_reminder_days),
    preferredUnits: readUnitSystem(settings.preferred_units),
    defaultGear: readStringArray(settings.default_gear, 'items').join('\n'),
    tastePreferences: readString(settings.taste_preferences, 'notes'),
  }
}

function splitLines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
}

function readUnitSystem(value: JsonObject): 'metric' | 'imperial' {
  return value.system === 'imperial' ? 'imperial' : 'metric'
}

function readString(value: JsonObject, key: string) {
  return typeof value[key] === 'string' ? value[key] : ''
}

function readStringArray(value: JsonObject, key: string) {
  const candidate = value[key]
  return Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === 'string')
    : []
}
