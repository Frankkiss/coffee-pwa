import type { JsonObject } from '../../lib/jsonTypes'
import type { UserSettingsWriteInput } from './userSettingsRepository'
import type { UserSettingsRow } from './userSettingsTypes'
import {
  readRecommendationDefaults,
  writeRecommendationDefaults,
} from './recommendationDefaults'

export type UserSettingsForm = {
  backupReminderDays: string
  preferredUnits: 'metric' | 'imperial'
  defaultGear: string
  tastePreferences: string
  hotPouroverBrewer: string
  hotPouroverGrinder: string
  icedPouroverBrewer: string
  icedPouroverGrinder: string
  coldBrewBrewer: string
  coldBrewGrinder: string
  espressoBrewer: string
  espressoGrinder: string
  espressoDoseGrams: string
  tasteGoals: string
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
  const doseGrams = parseOptionalDose(form.espressoDoseGrams)
  if (!doseGrams.ok) return doseGrams
  const recommendation = writeRecommendationDefaults(
    { ...(current?.default_gear ?? {}), items: gear },
    { ...(current?.taste_preferences ?? {}), notes: form.tastePreferences.trim() },
    {
      hotPourover: gearDefault(form.hotPouroverBrewer, form.hotPouroverGrinder),
      icedPourover: gearDefault(form.icedPouroverBrewer, form.icedPouroverGrinder),
      coldBrew: gearDefault(form.coldBrewBrewer, form.coldBrewGrinder),
      espresso: { ...gearDefault(form.espressoBrewer, form.espressoGrinder), doseGrams: doseGrams.value },
      tasteGoals: splitGoals(form.tasteGoals),
    },
  )
  return {
    ok: true,
    value: {
      backup_reminder_days: reminderDays.value,
      preferred_units: { ...(current?.preferred_units ?? {}), system: form.preferredUnits },
      default_gear: recommendation.defaultGear,
      taste_preferences: {
        ...(current?.taste_preferences ?? {}),
        ...recommendation.tastePreferences,
        notes: form.tastePreferences.trim(),
      },
    },
  }
}

export function toUserSettingsForm(
  settings: Pick<UserSettingsWriteInput, 'backup_reminder_days' | 'preferred_units' | 'default_gear' | 'taste_preferences'>,
): UserSettingsForm {
  const recommendation = readRecommendationDefaults(settings.default_gear, settings.taste_preferences)
  return {
    backupReminderDays: String(settings.backup_reminder_days),
    preferredUnits: readUnitSystem(settings.preferred_units),
    defaultGear: readStringArray(settings.default_gear, 'items').join('\n'),
    tastePreferences: readString(settings.taste_preferences, 'notes'),
    hotPouroverBrewer: recommendation.hotPourover.brewer,
    hotPouroverGrinder: recommendation.hotPourover.grinder,
    icedPouroverBrewer: recommendation.icedPourover.brewer,
    icedPouroverGrinder: recommendation.icedPourover.grinder,
    coldBrewBrewer: recommendation.coldBrew.brewer,
    coldBrewGrinder: recommendation.coldBrew.grinder,
    espressoBrewer: recommendation.espresso.brewer,
    espressoGrinder: recommendation.espresso.grinder,
    espressoDoseGrams: recommendation.espresso.doseGrams?.toString() ?? '',
    tasteGoals: recommendation.tasteGoals.join('、'),
  }
}

function splitLines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
}
function parseOptionalDose(value: string): ValidationResult<number | null> {
  if (value.trim() === '') return { ok: true, value: null }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
    return { ok: false, message: '意式默认粉量必须大于 0 且不超过 100 克' }
  }
  return { ok: true, value: parsed }
}

function gearDefault(brewer: string, grinder: string) {
  return { brewer: brewer.trim(), grinder: grinder.trim() }
}

function splitGoals(value: string) {
  return value
    .split(/[\r\n,，、]+/)
    .map((item) => item.trim())
    .filter(Boolean)
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
