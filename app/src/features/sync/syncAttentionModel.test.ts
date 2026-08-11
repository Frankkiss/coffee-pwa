import { describe, expect, it } from 'vitest'
import type { RetryMutationResult } from './syncManager'
import { createDeletePayload, type SyncMutation } from './syncTypes'
import {
  attentionItemKey,
  buildLegacyComparison,
  createAttentionActionGuard,
  toSafeActionError,
  toSafeAttentionItem,
} from './syncAttentionModel'

const userId = '00000000-0000-4000-8000-000000000001'
const deviceId = '20000000-0000-4000-8000-000000000001'

function mutation(overrides: Record<string, unknown> = {}): SyncMutation {
  return {
    mutationId: '30000000-0000-4000-8000-000000000001',
    deviceId,
    userId,
    entityType: 'bean',
    entityId: '40000000-0000-4000-8000-000000000001',
    operation: 'delete',
    payload: createDeletePayload(),
    baseSyncEpoch: 1,
    queuedAt: '2026-08-11T00:00:00.000Z',
    attemptCount: 0,
    status: 'needs_attention',
    lastErrorCode: 'UNKNOWN_DATABASE_ERROR',
    lastErrorMessage: 'select secret_note from beans https://secret.example {"token":"abc"}',
    ...overrides,
  } as SyncMutation
}

describe('safe attention view', () => {
  it('maps unknown raw server failures without exposing message contents or IDs', () => {
    const view = toSafeAttentionItem(mutation())
    const rendered = JSON.stringify(view)

    expect(view.errorText).toBe('同步未完成。请重试；若持续出现，可放弃并恢复云端版本。')
    expect(view.errorCode).toBeNull()
    expect(rendered).not.toContain('secret_note')
    expect(rendered).not.toContain('secret.example')
    expect(rendered).not.toContain('token')
    expect(rendered).not.toContain('30000000-')
  })

  it('maps thrown action errors by safe code without exposing raw messages', () => {
    const error = Object.assign(
      new Error('secret https://secret.example {"note":"private"}'),
      { code: 'PGRST116' },
    )
    const view = toSafeActionError(error)
    expect(view).toEqual({
      text: '操作未完成，请稍后重试。',
      code: null,
    })
    expect(JSON.stringify(view)).not.toContain('secret.example')
    expect(JSON.stringify(view)).not.toContain('private')
  })

  it('never exposes an unknown uppercase code that may contain a secret', () => {
    const view = toSafeActionError({ code: 'SECRETAPIKEY123' })
    expect(view).toEqual({ text: '操作未完成，请稍后重试。', code: null })
    expect(JSON.stringify(view)).not.toContain('SECRETAPIKEY123')
  })

  it('uses the fixed legacy explanation and a minimal bean summary', () => {
    const view = toSafeAttentionItem(mutation({
      operation: 'upsert',
      lastErrorCode: 'LEGACY_CREATE_REQUIRES_CONFIRMATION',
      payload: {
        name: '花魁', roaster: '小柜', origin: 'Ethiopia', roast_date: '2026-08-01',
        notes: 'private note', source_url: 'https://secret.example',
      } as SyncMutation['payload'],
    }))
    const rendered = JSON.stringify(view)

    expect(view.errorText).toBe('这条旧版新增记录可能已经存在于云端，请比较后再决定是否重新上传。')
    expect(view.localSummary).toEqual({
      title: '花魁',
      facts: ['烘焙商：小柜', '产地：Ethiopia', '烘焙日：2026-08-01'],
    })
    expect(rendered).not.toContain('private note')
    expect(rendered).not.toContain('secret.example')
  })

  it('summarizes a brew without exposing its related bean UUID', () => {
    const beanId = '50000000-0000-4000-8000-000000000001'
    const view = toSafeAttentionItem(mutation({
      entityType: 'brewLog',
      operation: 'upsert',
      payload: {
        method: '手冲', brewed_at: '2026-08-11T08:00:00.000Z', bean_id: beanId,
      } as SyncMutation['payload'],
    }))

    expect(view.localSummary).toEqual({
      title: '手冲',
      facts: ['冲煮时间：2026-08-11T08:00:00.000Z', '关联咖啡豆：已关联'],
    })
    expect(JSON.stringify(view)).not.toContain(beanId)
  })

  it('uses only the template name and whitelisted unit preferences', () => {
    const template = toSafeAttentionItem(mutation({
      entityType: 'brewTemplate',
      operation: 'upsert',
      payload: {
        name: '每日 V60', source_notes: 'private', source_urls: ['https://secret.example'],
      },
    }))
    const settings = toSafeAttentionItem(mutation({
      entityType: 'userSettings',
      operation: 'upsert',
      payload: {
        preferred_units: { weight: 'grams', temperature: 'celsius', secret: 'hidden' },
        taste_preferences: { note: 'private' },
      },
    }))

    expect(template.localSummary).toEqual({ title: '每日 V60', facts: [] })
    expect(settings.localSummary).toEqual({
      title: '偏好单位',
      facts: ['重量：grams', '温度：celsius'],
    })
    expect(JSON.stringify([template, settings])).not.toContain('private')
    expect(JSON.stringify([template, settings])).not.toContain('secret.example')
    expect(JSON.stringify([template, settings])).not.toContain('hidden')
  })
})

describe('legacy comparison safety', () => {
  function preview(ids: string[]): Extract<RetryMutationResult, { status: 'confirmation_required' }>['preview'] {
    return {
      target: {
        mutationId: ids[0],
        entityType: 'bean',
        entityId: '60000000-0000-4000-8000-000000000001',
        operation: 'upsert',
      },
      relatedMutationIds: ids,
      cloudCandidates: [{
        entityType: 'bean',
        id: '70000000-0000-4000-8000-000000000001',
        label: '云端花魁 / 小柜 / Ethiopia',
        updatedAt: '2026-08-11T00:00:00.000Z',
        deletedAt: null,
      }],
    }
  }

  it('blocks confirmation when two local beans cannot be distinguished', () => {
    const first = mutation({
      mutationId: '30000000-0000-4000-8000-000000000011',
      entityId: '40000000-0000-4000-8000-000000000011',
      operation: 'upsert',
      lastErrorCode: 'LEGACY_CREATE_REQUIRES_CONFIRMATION',
      payload: { name: '同名豆', roaster: null, origin: null, roast_date: null } as SyncMutation['payload'],
    })
    const second = mutation({
      mutationId: '30000000-0000-4000-8000-000000000012',
      entityId: '40000000-0000-4000-8000-000000000012',
      operation: 'upsert',
      lastErrorCode: 'LEGACY_CREATE_REQUIRES_CONFIRMATION',
      payload: { name: '同名豆', roaster: null, origin: null, roast_date: null } as SyncMutation['payload'],
    })

    const view = buildLegacyComparison(preview([first.mutationId]), [first, second])

    expect(view.canConfirm).toBe(false)
    expect(view.blockedReason).toBe('无法安全比较')
    expect(JSON.stringify(view)).not.toContain(first.entityId)
  })

  it('allows confirmation when local bean summaries are distinct and drops cloud IDs', () => {
    const first = mutation({
      mutationId: '30000000-0000-4000-8000-000000000021',
      entityId: '40000000-0000-4000-8000-000000000021',
      operation: 'upsert',
      lastErrorCode: 'LEGACY_CREATE_REQUIRES_CONFIRMATION',
      payload: { name: '花魁 A', roaster: '甲', origin: 'Ethiopia', roast_date: null } as SyncMutation['payload'],
    })
    const second = mutation({
      mutationId: '30000000-0000-4000-8000-000000000022',
      entityId: '40000000-0000-4000-8000-000000000022',
      operation: 'upsert',
      lastErrorCode: 'LEGACY_CREATE_REQUIRES_CONFIRMATION',
      payload: { name: '花魁 B', roaster: '乙', origin: 'Ethiopia', roast_date: null } as SyncMutation['payload'],
    })

    const view = buildLegacyComparison(preview([first.mutationId, second.mutationId]), [first, second])

    expect(view.canConfirm).toBe(true)
    expect(view.localTargets.map((target) => target.title)).toEqual(['花魁 A', '花魁 B'])
    expect(view.cloudCandidates[0]).toEqual({
      label: '云端花魁 / 小柜 / Ethiopia',
      updatedAt: '2026-08-11T00:00:00.000Z',
      deleted: false,
    })
    expect(JSON.stringify(view)).not.toContain('70000000-')
  })
})

describe('attention action generation', () => {
  it('invalidates a slow A result after B starts and after item state changes', () => {
    const guard = createAttentionActionGuard()
    const item = mutation()
    const keyA = attentionItemKey(item)
    const tokenA = guard.begin(keyA)
    const tokenB = guard.begin(keyA)
    expect(guard.isCurrent(tokenA, keyA)).toBe(false)
    expect(guard.isCurrent(tokenB, keyA)).toBe(true)

    const changedKey = attentionItemKey(mutation({ attemptCount: 1 }))
    expect(guard.isCurrent(tokenB, changedKey)).toBe(false)
    expect(attentionItemKey(mutation({ lastErrorMessage: 'changed safely hidden error' }))).not.toBe(keyA)
    expect(attentionItemKey(mutation({
      operation: 'upsert',
      payload: { name: 'changed local target' },
    }))).not.toBe(keyA)
    guard.invalidate()
    expect(guard.isCurrent(tokenB, keyA)).toBe(false)
  })
})
