import type { SupabaseClient } from '@supabase/supabase-js'

const tables = [
  'beans',
  'brew_logs',
  'brew_templates',
  'user_settings',
  'ai_recommendations',
] as const

type RealtimeOptions = {
  schedule: (callback: () => void, delayMs: number) => number
  cancelSchedule: (id: number) => void
  debounceMs: number
}

const defaultOptions: RealtimeOptions = {
  schedule: (callback, delayMs) => globalThis.setTimeout(callback, delayMs) as unknown as number,
  cancelSchedule: (id) => globalThis.clearTimeout(id),
  debounceMs: 100,
}

type Channel = {
  on(kind: string, config: Record<string, string>, handler: () => void): Channel
  subscribe(): Channel
}

type RealtimeClient = {
  channel(name: string): Channel
  removeChannel(channel: Channel): unknown
}

export function subscribeToSyncWakeups(
  supabase: SupabaseClient,
  userId: string,
  wake: () => void,
  options: RealtimeOptions = defaultOptions,
): () => void {
  const client = supabase as unknown as RealtimeClient
  const channel = client.channel(`coffee-sync:${userId}`)
  let active = true
  let debounceTimer: number | null = null
  const signal = () => {
    if (!active || debounceTimer !== null) return
    debounceTimer = options.schedule(() => {
      debounceTimer = null
      if (active) wake()
    }, options.debounceMs)
  }

  for (const table of tables) {
    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table,
      filter: `user_id=eq.${userId}`,
    }, signal)
  }
  channel.subscribe()

  return () => {
    if (!active) return
    active = false
    if (debounceTimer !== null) {
      options.cancelSchedule(debounceTimer)
      debounceTimer = null
    }
    void client.removeChannel(channel)
  }
}
