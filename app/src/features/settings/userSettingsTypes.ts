import type { JsonObject } from '../../lib/jsonTypes'

export type UserSettingsRow = {
  user_id: string
  preferred_units: JsonObject
  default_gear: JsonObject
  taste_preferences: JsonObject
  backup_reminder_days: number
  created_at: string
  updated_at: string
  schema_version: number
}
