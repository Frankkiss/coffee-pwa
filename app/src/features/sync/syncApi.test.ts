import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  SyncApiError,
  createSyncApi,
  toSyncRpcOperation,
} from './syncApi'
import { createDeletePayload, type SyncMutation } from './syncTypes'

const ids = {
  user: '11111111-1111-4111-8111-111111111111',
  mutation: '22222222-2222-4222-8222-222222222222',
  device: '33333333-3333-4333-8333-333333333333',
  bean: '44444444-4444-4444-8444-444444444444',
  brew: '55555555-5555-4555-8555-555555555555',
  template: '66666666-6666-4666-8666-666666666666',
}

const time = '2026-08-09T12:34:56.123Z'

function beanPayload() {
  return {
    name: 'Ethiopia', roaster: null, origin: 'Guji', farm_or_station: null,
    process: 'washed', variety: null, altitude_meters: 2000,
    roast_date: '2026-08-01', roast_level: null, flavor_tags: ['tea'],
    flavor_notes: null, net_weight_grams: 200, remaining_grams: null, price: 88,
    purchase_date: null, source_url: null, image_url: null,
    bean_type: 'single_origin' as const, blend_components: [], blend_notes: null,
    notes: null, schema_version: 1,
  }
}

function mutation(overrides: Partial<SyncMutation> = {}): SyncMutation {
  return {
    mutationId: ids.mutation, deviceId: ids.device, entityType: 'bean',
    entityId: ids.bean, operation: 'upsert', payload: beanPayload(),
    userId: ids.user, baseSyncEpoch: 1, queuedAt: time, attemptCount: 0,
    status: 'pending', lastErrorCode: null, lastErrorMessage: null,
    ...overrides,
  } as SyncMutation
}

function snapshot() {
  return {
    syncEpoch: 1,
    serverTime: time,
    beans: [{ id: ids.bean, user_id: ids.user, ...beanPayload(), created_at: time, updated_at: time, deleted_at: null }],
    brewLogs: [{
      id: ids.brew, user_id: ids.user, bean_id: ids.bean, brewed_at: time,
      brew_mode: 'iced_pourover', brew_variant: null,
      ice_grams: 90, beverage_grams: null,
      method: null, dripper: null, filter_paper: null, grinder: null,
      grind_setting: null, coffee_grams: 15, water_grams: 250, ratio: null,
      water_temperature_c: 92, total_time_seconds: 180, pour_steps: [{ water: 50 }],
      rating: 4, acidity: null, sweetness: null, bitterness: null,
      astringency: null, body: null, aftertaste: null, flavor_tags: [],
      is_pinned_recipe: false, notes: null, created_at: time, updated_at: time,
      deleted_at: null, schema_version: 1,
    }],
    brewTemplates: [{
      id: ids.template, user_id: ids.user, name: 'V60', category: 'daily-pourover',
      difficulty: 'easy', brewer: 'V60', filter: 'paper', dose_grams: 15,
      water_grams: 250, ratio: '1:16.7', water_temperature_min: 90,
      water_temperature_max: 94, grind_size: 'medium', target_time_min: 150,
      target_time_max: 210, pour_steps: [{ order: 1, startSeconds: 0,
        endSeconds: 30, targetWaterGrams: 50, label: 'Bloom', action: 'Pour' }],
      suitable_for: [], avoid_for: [], flavor_goal: '', adjustment_rules: [],
      source_notes: '', source_urls: [], is_champion_reference: false,
      brew_mode: 'iced_pourover', brew_variant: null, ice_grams: 75,
      beverage_grams: null,
      copied_from_template_id: null, created_at: time, updated_at: time,
      deleted_at: null, schema_version: 1,
    }],
    userSettings: {
      user_id: ids.user, preferred_units: {}, default_gear: {},
      taste_preferences: {}, backup_reminder_days: 7, created_at: time,
      updated_at: time, schema_version: 1,
    },
    aiRecommendations: [{
      id: '77777777-7777-4777-8777-777777777777', user_id: ids.user,
      bean_id: ids.bean, input_context: {}, recommendation: {}, model_name: null,
      accepted: null, created_at: time, updated_at: time, deleted_at: null,
      schema_version: 1,
    }],
  }
}

function clientWith(results: unknown[]) {
  const rpc = vi.fn()
  for (const result of results) rpc.mockResolvedValueOnce(result)
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

describe('sync API boundary', () => {
  it('sends only six rebuilt wire fields and validates complete receipts', async () => {
    const receipt = { mutationId: ids.mutation, deviceId: ids.device,
      entityType: 'bean', entityId: ids.bean, operation: 'upsert',
      committedAt: time, status: 'applied' }
    const { client, rpc } = clientWith([{ data: { syncEpoch: 1, serverTime: time, results: [receipt] }, error: null }])
    const api = createSyncApi(client)
    const result = await api.applyBatch(1, [mutation()])
    expect(rpc).toHaveBeenCalledWith('apply_sync_batch', {
      p_sync_epoch: 1,
      p_operations: [{ mutationId: ids.mutation, deviceId: ids.device,
        entityType: 'bean', entityId: ids.bean, operation: 'upsert', payload: beanPayload() }],
    })
    expect(Object.keys(rpc.mock.calls[0][1].p_operations[0]).sort()).toEqual([
      'deviceId', 'entityId', 'entityType', 'mutationId', 'operation', 'payload',
    ])
    expect(result.results).toEqual([receipt])
    expect(result.results[0].mutationId).toBe(ids.mutation)
  })

  it('rejects duplicate request mutation IDs before calling RPC', async () => {
    const { client, rpc } = clientWith([])
    const duplicate = mutation({ entityId: '88888888-8888-4888-8888-888888888888' })
    await expect(createSyncApi(client).applyBatch(1, [mutation(), duplicate]))
      .rejects.toMatchObject({
        code: 'DUPLICATE_SYNC_MUTATION_ID',
        retryable: false,
      })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rebuilds upserts, emits a fresh empty delete object, and rejects malicious payloads', () => {
    const source = mutation()
    const wire = toSyncRpcOperation(source)
    expect(wire.payload).toEqual(beanPayload())
    expect(wire.payload).not.toBe(source.payload)
    const deleteSource = mutation({ operation: 'delete', payload: createDeletePayload() })
    const deleteWire = toSyncRpcOperation(deleteSource)
    expect(deleteWire.payload).toEqual({})
    expect(deleteWire.payload).not.toBe(deleteSource.payload)

    for (const payload of [
      { ...beanPayload(), user_id: ids.user },
      { ...beanPayload(), id: ids.bean },
      { ...beanPayload(), updated_at: time },
      { ...beanPayload(), deleted_at: null },
      { ...beanPayload(), surprise: true },
      { ...beanPayload(), schema_version: 2 },
      { ...beanPayload(), price: Number.NaN },
      { ...beanPayload(), flavor_tags: [undefined] },
    ]) {
      expect(() => toSyncRpcOperation(mutation({ payload } as unknown as Partial<SyncMutation>))).toThrowError(SyncApiError)
    }
    expect(() => toSyncRpcOperation(mutation({ operation: 'delete', payload: { hidden: true } } as unknown as Partial<SyncMutation>))).toThrowError(SyncApiError)
    expect(() => toSyncRpcOperation({ ...mutation(), operation: 'merge' } as unknown as SyncMutation)).toThrowError(SyncApiError)
    expect(() => toSyncRpcOperation({ ...mutation(), entityType: 'unknown', operation: 'delete', payload: {} } as unknown as SyncMutation)).toThrowError(SyncApiError)
  })

  it('maps Supabase errors to stable retryability', async () => {
    const { client } = clientWith([{ data: null, error: { code: '503', message: 'service unavailable' } }])
    await expect(createSyncApi(client).getSnapshot()).rejects.toMatchObject({
      name: 'SyncApiError', code: '503', message: 'service unavailable', retryable: true,
    })
  })

  it('uses the RPC HTTP status when PostgREST error codes are not numeric', async () => {
    const { client } = clientWith([{
      data: null,
      error: { code: 'PGRST500', message: 'Internal server error' },
      status: 503,
    }])
    await expect(createSyncApi(client).getSnapshot()).rejects.toMatchObject({
      code: 'PGRST500', retryable: true,
    })
  })

  it('promotes stable Postgres sync messages to logical error codes', async () => {
    const { client } = clientWith([{ data: null, error: { code: 'P0001', message: 'STALE_SYNC_EPOCH' } }])
    await expect(createSyncApi(client).applyBatch(1, [mutation()])).rejects.toMatchObject({
      code: 'STALE_SYNC_EPOCH', retryable: false,
    })
  })

  it('accepts a fully validated snapshot', async () => {
    const value = snapshot()
    const { client, rpc } = clientWith([{ data: value, error: null }])
    await expect(createSyncApi(client).getSnapshot()).resolves.toEqual(value)
    expect(rpc).toHaveBeenCalledWith('get_sync_snapshot')
  })

  it('accepts a built-in template source identifier in a snapshot', async () => {
    const base = snapshot()
    const value = {
      ...base,
      brewTemplates: [{
        ...base.brewTemplates[0],
        copied_from_template_id: 'classic-v60-three-pour',
      }],
    }
    const { client } = clientWith([{ data: value, error: null }])

    await expect(createSyncApi(client).getSnapshot()).resolves.toEqual(value)
  })

  it('accepts cold brew concentrate serving ice in a snapshot', async () => {
    const base = snapshot()
    const value = {
      ...base,
      brewLogs: [{
        ...base.brewLogs[0],
        brew_mode: 'cold_brew',
        brew_variant: 'concentrate',
        ice_grams: 120,
      }],
    }
    const { client } = clientWith([{ data: value, error: null }])

    await expect(createSyncApi(client).getSnapshot()).resolves.toEqual(value)
  })

  it.each([
    ['non-object top level', null],
    ['unknown top-level field', { ...snapshot(), extra: true }],
    ['bad epoch', { ...snapshot(), syncEpoch: 1.5 }],
    ['bad RFC3339', { ...snapshot(), serverTime: 'yesterday' }],
    ['normalized impossible RFC3339', { ...snapshot(), serverTime: '2026-02-30T12:00:00Z' }],
    ['missing bean field', { ...snapshot(), beans: [{ ...snapshot().beans[0], name: undefined }] }],
    ['unknown bean field', { ...snapshot(), beans: [{ ...snapshot().beans[0], extra: true }] }],
    ['non-finite number', { ...snapshot(), beans: [{ ...snapshot().beans[0], price: Infinity }] }],
    ['non-json value', { ...snapshot(), brewLogs: [{ ...snapshot().brewLogs[0], pour_steps: [undefined] }] }],
    ['bad template enum', { ...snapshot(), brewTemplates: [{ ...snapshot().brewTemplates[0], category: 'magic' }] }],
    ['bad template steps', { ...snapshot(), brewTemplates: [{ ...snapshot().brewTemplates[0], pour_steps: [{ ...snapshot().brewTemplates[0].pour_steps[0], order: NaN }] }] }],
    ['bad settings nullability', { ...snapshot(), userSettings: { ...snapshot().userSettings, preferred_units: null } }],
    ['bad recommendation boolean', { ...snapshot(), aiRecommendations: [{ ...snapshot().aiRecommendations[0], accepted: 'yes' }] }],
    ['unsupported bean schema', { ...snapshot(), beans: [{ ...snapshot().beans[0], schema_version: 2 }] }],
    ['unsupported brew schema', { ...snapshot(), brewLogs: [{ ...snapshot().brewLogs[0], schema_version: 2 }] }],
    ['unsupported template schema', { ...snapshot(), brewTemplates: [{ ...snapshot().brewTemplates[0], schema_version: 2 }] }],
    ['unsupported settings schema', { ...snapshot(), userSettings: { ...snapshot().userSettings, schema_version: 2 } }],
    ['bad brew mode', { ...snapshot(), brewLogs: [{ ...snapshot().brewLogs[0], brew_mode: 'moka' }] }],
    ['negative ice weight', { ...snapshot(), brewLogs: [{ ...snapshot().brewLogs[0], ice_grams: -1 }] }],
    ['non-finite output weight', { ...snapshot(), brewLogs: [{ ...snapshot().brewLogs[0], brew_mode: 'espresso', ice_grams: null, beverage_grams: Infinity }] }],
    ['mode-incompatible output weight', { ...snapshot(), brewLogs: [{ ...snapshot().brewLogs[0], beverage_grams: 30 }] }],
    ['unsupported recommendation schema', { ...snapshot(), aiRecommendations: [{ ...snapshot().aiRecommendations[0], schema_version: 2 }] }],
  ])('rejects malformed snapshot: %s', async (_name, data) => {
    const { client } = clientWith([{ data, error: null }])
    await expect(createSyncApi(client).getSnapshot()).rejects.toMatchObject({ code: 'INVALID_SYNC_RESPONSE', retryable: false })
  })

  it.each([
    ['bad top level', []],
    ['bad status', { syncEpoch: 1, serverTime: time, results: [{ mutationId: ids.mutation, deviceId: ids.device, entityType: 'bean', entityId: ids.bean, operation: 'upsert', committedAt: time, status: 'ok' }] }],
    ['missing receipt field', { syncEpoch: 1, serverTime: time, results: [{ mutationId: ids.mutation, status: 'applied' }] }],
    ['invalid time', { syncEpoch: 1, serverTime: time, results: [{ mutationId: ids.mutation, deviceId: ids.device, entityType: 'bean', entityId: ids.bean, operation: 'upsert', committedAt: 'no', status: 'applied' }] }],
    ['missing receipt', { syncEpoch: 1, serverTime: time, results: [] }],
    ['duplicate receipt', { syncEpoch: 1, serverTime: time, results: Array(2).fill({ mutationId: ids.mutation, deviceId: ids.device, entityType: 'bean', entityId: ids.bean, operation: 'upsert', committedAt: time, status: 'applied' }) }],
    ['extra receipt', { syncEpoch: 1, serverTime: time, results: [{ mutationId: ids.mutation, deviceId: ids.device, entityType: 'bean', entityId: ids.bean, operation: 'upsert', committedAt: time, status: 'applied' }, { mutationId: ids.device, deviceId: ids.device, entityType: 'bean', entityId: ids.bean, operation: 'upsert', committedAt: time, status: 'applied' }] }],
  ])('rejects malformed apply response: %s', async (_name, data) => {
    const { client } = clientWith([{ data, error: null }])
    await expect(createSyncApi(client).applyBatch(1, [mutation()])).rejects.toMatchObject({ code: 'INVALID_SYNC_RESPONSE', retryable: false })
  })
})
