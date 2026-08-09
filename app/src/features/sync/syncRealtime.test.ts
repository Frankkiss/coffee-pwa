import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { subscribeToSyncWakeups } from './syncRealtime'

describe('sync Realtime wake-ups', () => {
  it('uses one current-user channel for all five tables and debounces payloads', () => {
    const handlers: Array<() => void> = []
    const on = vi.fn((_kind, _config, handler) => {
      handlers.push(handler)
      return channel
    })
    const subscribe = vi.fn(() => channel)
    const channel = { on, subscribe }
    const removeChannel = vi.fn()
    const supabase = {
      channel: vi.fn(() => channel),
      removeChannel,
    } as unknown as SupabaseClient
    const scheduled: Array<{ callback: () => void; cancelled: boolean }> = []
    const wake = vi.fn()

    const cleanup = subscribeToSyncWakeups(supabase, 'user-1', wake, {
      schedule(callback) {
        scheduled.push({ callback, cancelled: false })
        return scheduled.length
      },
      cancelSchedule(id) { scheduled[id - 1].cancelled = true },
      debounceMs: 75,
    })

    expect(supabase.channel).toHaveBeenCalledOnce()
    expect(on.mock.calls.map((call) => call[1])).toEqual(
      ['beans', 'brew_logs', 'brew_templates', 'user_settings', 'ai_recommendations'].map((table) => ({
        event: '*', schema: 'public', table, filter: 'user_id=eq.user-1',
      })),
    )
    expect(subscribe).toHaveBeenCalledOnce()
    handlers[0]()
    handlers[4]()
    expect(scheduled).toHaveLength(1)
    expect(wake).not.toHaveBeenCalled()
    scheduled[0].callback()
    expect(wake).toHaveBeenCalledOnce()

    handlers[1]()
    cleanup()
    cleanup()
    expect(scheduled[1].cancelled).toBe(true)
    expect(removeChannel).toHaveBeenCalledTimes(1)
    expect(removeChannel).toHaveBeenCalledWith(channel)
    scheduled[1].callback()
    expect(wake).toHaveBeenCalledOnce()
  })
})
