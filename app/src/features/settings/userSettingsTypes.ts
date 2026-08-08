export type UserSettingsRow = {
  user_id: string
  preferred_units: Record<string, unknown>
  default_gear: Record<string, unknown>
  taste_preferences: Record<string, unknown>
  backup_reminder_days: number
  created_at: string
  updated_at: string
  schema_version: number
}
