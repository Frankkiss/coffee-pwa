import { describe, expect, expectTypeOf, it } from 'vitest'
import type { Bean, ServerBeanRow } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import type { UserBrewTemplateRow } from '../brewTemplates/brewTemplateTypes'
import type { SavedRecommendationRow } from '../recommendations/savedRecommendationList'
import type { UserSettingsRow } from '../settings/userSettingsTypes'
import type { JsonObject, JsonValue } from '../../lib/jsonTypes'
import {
  createEntityId,
  createMutationId,
  type BeanUpsertPayload,
  type BrewLogUpsertPayload,
  type BrewTemplateUpsertPayload,
  type SyncMutation,
  type SyncRpcOperation,
  type SyncSnapshot,
  type UserSettingsUpsertPayload,
} from './syncTypes'

const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const userId = '20000000-0000-4000-8000-000000000001'
const deviceId = '40000000-0000-4000-8000-000000000001'

const legacyBean = {
  id: '10000000-0000-4000-8000-000000000001',
  user_id: userId,
  name: 'Legacy bean',
  roaster: null,
  origin: null,
  farm_or_station: null,
  process: null,
  variety: null,
  altitude_meters: null,
  roast_date: null,
  roast_level: null,
  flavor_tags: [],
  flavor_notes: null,
  net_weight_grams: null,
  price: null,
  purchase_date: null,
  source_url: null,
  image_url: null,
  notes: null,
  created_at: '2026-08-08T00:00:00.000Z',
  updated_at: '2026-08-08T00:00:00.000Z',
  deleted_at: null,
  schema_version: 1,
} satisfies Bean

const serverBean = {
  ...legacyBean,
  name: 'Synchronized bean',
  bean_type: 'single_origin',
  blend_components: [],
  blend_notes: null,
} satisfies ServerBeanRow

const brewLog = {
  id: '10000000-0000-4000-8000-000000000002',
  user_id: userId,
  bean_id: serverBean.id,
  brewed_at: '2026-08-08T00:10:00.000Z',
  method: 'V60',
  dripper: 'V60',
  filter_paper: 'paper',
  grinder: 'hand grinder',
  grind_setting: '20 clicks',
  coffee_grams: 15,
  water_grams: 240,
  ratio: '1:16',
  water_temperature_c: 92,
  total_time_seconds: 150,
  pour_steps: [{ label: 'Bloom', waterGrams: 45 }, null, 'finish'],
  rating: 4,
  acidity: 4,
  sweetness: 4,
  bitterness: 1,
  astringency: 1,
  body: 3,
  aftertaste: 4,
  flavor_tags: ['clean'],
  is_pinned_recipe: false,
  notes: null,
  created_at: '2026-08-08T00:10:00.000Z',
  updated_at: '2026-08-08T00:10:00.000Z',
  deleted_at: null,
  schema_version: 1,
} satisfies BrewLog

const brewTemplate = {
  id: '10000000-0000-4000-8000-000000000003',
  user_id: userId,
  name: 'Daily V60',
  category: 'daily-pourover',
  difficulty: 'easy',
  brewer: 'V60',
  filter: 'paper',
  dose_grams: 15,
  water_grams: 240,
  ratio: '1:16',
  water_temperature_min: 90,
  water_temperature_max: 93,
  grind_size: 'medium-fine',
  target_time_min: 135,
  target_time_max: 165,
  pour_steps: [
    {
      order: 1,
      startSeconds: 0,
      endSeconds: 30,
      targetWaterGrams: 45,
      label: 'Bloom',
      action: 'Pour gently',
    },
  ],
  suitable_for: ['washed coffee'],
  avoid_for: [],
  flavor_goal: 'clean and sweet',
  adjustment_rules: ['grind finer when drawdown is fast'],
  source_notes: '',
  source_urls: [],
  is_champion_reference: false,
  copied_from_template_id: null,
  created_at: '2026-08-08T00:00:00.000Z',
  updated_at: '2026-08-08T00:00:00.000Z',
  deleted_at: null,
  schema_version: 1,
} satisfies UserBrewTemplateRow

const userSettings = {
  user_id: userId,
  preferred_units: { temperature: 'celsius' },
  default_gear: { brewer: 'V60' },
  taste_preferences: { acidity: 'bright' },
  backup_reminder_days: 7,
  created_at: '2026-08-08T00:00:00.000Z',
  updated_at: '2026-08-08T00:00:00.000Z',
  schema_version: 1,
} satisfies UserSettingsRow

const recommendation = {
  id: '10000000-0000-4000-8000-000000000004',
  user_id: userId,
  bean_id: null,
  input_context: { targetBean: { name: 'Sample bean' } },
  recommendation: { ratio: '1:16' },
  model_name: null,
  accepted: null,
  created_at: '2026-08-08T00:00:00.000Z',
  updated_at: '2026-08-08T00:00:00.000Z',
  deleted_at: null,
  schema_version: 1,
} satisfies SavedRecommendationRow

const beanPayload = {
  name: serverBean.name,
  roaster: serverBean.roaster,
  origin: serverBean.origin,
  farm_or_station: serverBean.farm_or_station,
  process: serverBean.process,
  variety: serverBean.variety,
  altitude_meters: serverBean.altitude_meters,
  roast_date: serverBean.roast_date,
  roast_level: serverBean.roast_level,
  flavor_tags: serverBean.flavor_tags,
  flavor_notes: serverBean.flavor_notes,
  net_weight_grams: serverBean.net_weight_grams,
  price: serverBean.price,
  purchase_date: serverBean.purchase_date,
  source_url: serverBean.source_url,
  image_url: serverBean.image_url,
  bean_type: serverBean.bean_type,
  blend_components: serverBean.blend_components,
  blend_notes: serverBean.blend_notes,
  notes: serverBean.notes,
  schema_version: serverBean.schema_version,
} satisfies BeanUpsertPayload

const brewLogPayload = {
  bean_id: brewLog.bean_id,
  brewed_at: brewLog.brewed_at,
  method: brewLog.method,
  dripper: brewLog.dripper,
  filter_paper: brewLog.filter_paper,
  grinder: brewLog.grinder,
  grind_setting: brewLog.grind_setting,
  coffee_grams: brewLog.coffee_grams,
  water_grams: brewLog.water_grams,
  ratio: brewLog.ratio,
  water_temperature_c: brewLog.water_temperature_c,
  total_time_seconds: brewLog.total_time_seconds,
  pour_steps: brewLog.pour_steps,
  rating: brewLog.rating,
  acidity: brewLog.acidity,
  sweetness: brewLog.sweetness,
  bitterness: brewLog.bitterness,
  astringency: brewLog.astringency,
  body: brewLog.body,
  aftertaste: brewLog.aftertaste,
  flavor_tags: brewLog.flavor_tags,
  is_pinned_recipe: brewLog.is_pinned_recipe,
  notes: brewLog.notes,
  schema_version: brewLog.schema_version,
} satisfies BrewLogUpsertPayload

const brewTemplatePayload = {
  name: brewTemplate.name,
  category: brewTemplate.category,
  difficulty: brewTemplate.difficulty,
  brewer: brewTemplate.brewer,
  filter: brewTemplate.filter,
  dose_grams: brewTemplate.dose_grams,
  water_grams: brewTemplate.water_grams,
  ratio: brewTemplate.ratio,
  water_temperature_min: brewTemplate.water_temperature_min,
  water_temperature_max: brewTemplate.water_temperature_max,
  grind_size: brewTemplate.grind_size,
  target_time_min: brewTemplate.target_time_min,
  target_time_max: brewTemplate.target_time_max,
  pour_steps: brewTemplate.pour_steps,
  suitable_for: brewTemplate.suitable_for,
  avoid_for: brewTemplate.avoid_for,
  flavor_goal: brewTemplate.flavor_goal,
  adjustment_rules: brewTemplate.adjustment_rules,
  source_notes: brewTemplate.source_notes,
  source_urls: brewTemplate.source_urls,
  is_champion_reference: brewTemplate.is_champion_reference,
  copied_from_template_id: brewTemplate.copied_from_template_id,
  schema_version: brewTemplate.schema_version,
} satisfies BrewTemplateUpsertPayload

const userSettingsPayload = {
  preferred_units: userSettings.preferred_units,
  default_gear: userSettings.default_gear,
  taste_preferences: userSettings.taste_preferences,
  backup_reminder_days: userSettings.backup_reminder_days,
  schema_version: userSettings.schema_version,
} satisfies UserSettingsUpsertPayload

const upsertOperations = [
  {
    mutationId: '30000000-0000-4000-8000-000000000001',
    deviceId,
    entityType: 'bean',
    entityId: serverBean.id,
    operation: 'upsert',
    payload: beanPayload,
  },
  {
    mutationId: '30000000-0000-4000-8000-000000000002',
    deviceId,
    entityType: 'brewLog',
    entityId: brewLog.id,
    operation: 'upsert',
    payload: brewLogPayload,
  },
  {
    mutationId: '30000000-0000-4000-8000-000000000003',
    deviceId,
    entityType: 'brewTemplate',
    entityId: brewTemplate.id,
    operation: 'upsert',
    payload: brewTemplatePayload,
  },
  {
    mutationId: '30000000-0000-4000-8000-000000000004',
    deviceId,
    entityType: 'userSettings',
    entityId: userId,
    operation: 'upsert',
    payload: userSettingsPayload,
  },
] satisfies SyncRpcOperation[]

const deleteOperations = [
  {
    mutationId: '30000000-0000-4000-8000-000000000005',
    deviceId,
    entityType: 'bean',
    entityId: serverBean.id,
    operation: 'delete',
    payload: {},
  },
  {
    mutationId: '30000000-0000-4000-8000-000000000006',
    deviceId,
    entityType: 'brewLog',
    entityId: brewLog.id,
    operation: 'delete',
    payload: {},
  },
  {
    mutationId: '30000000-0000-4000-8000-000000000007',
    deviceId,
    entityType: 'brewTemplate',
    entityId: brewTemplate.id,
    operation: 'delete',
    payload: {},
  },
] satisfies SyncRpcOperation[]

function acceptOperation(operation: SyncRpcOperation) {
  return operation
}

function acceptJsonValue(value: JsonValue) {
  return value
}

function acceptJsonObject(value: JsonObject) {
  return value
}

function acceptServerBean(value: ServerBeanRow) {
  return value
}

describe('sync identifiers', () => {
  it('creates distinct permanent UUID v4 identifiers', () => {
    const identifiers = [
      createEntityId(),
      createEntityId(),
      createMutationId(),
      createMutationId(),
    ]

    expect(identifiers).toEqual(
      identifiers.map(() => expect.stringMatching(uuidV4Pattern)),
    )
    expect(new Set(identifiers).size).toBe(identifiers.length)
  })
})

describe('synchronization type boundaries', () => {
  it('accepts complete synchronized server rows and JSON values', () => {
    const jsonValues = [
      null,
      true,
      42,
      'coffee',
      ['nested', 1, false, null],
      { nested: { values: [1, 2, 3] } },
    ] satisfies JsonValue[]

    const snapshot = {
      syncEpoch: 1,
      serverTime: '2026-08-08T01:00:00.000Z',
      beans: [serverBean],
      brewLogs: [brewLog],
      brewTemplates: [brewTemplate],
      userSettings,
      aiRecommendations: [recommendation],
    } satisfies SyncSnapshot

    expect(jsonValues).toHaveLength(6)
    expect(snapshot.beans[0].bean_type).toBe('single_origin')
    expectTypeOf(snapshot).toMatchTypeOf<SyncSnapshot>()
  })

  it('models four upserts and only the three legal deletes', () => {
    expect(upsertOperations.map((item) => item.entityType)).toEqual([
      'bean',
      'brewLog',
      'brewTemplate',
      'userSettings',
    ])
    expect(deleteOperations.map((item) => item.entityType)).toEqual([
      'bean',
      'brewLog',
      'brewTemplate',
    ])
    expectTypeOf(upsertOperations).toMatchTypeOf<SyncRpcOperation[]>()
    expectTypeOf(deleteOperations).toMatchTypeOf<SyncRpcOperation[]>()
  })

  it('keeps wire operations free of local Outbox metadata', () => {
    expect(Object.keys(upsertOperations[0]).sort()).toEqual([
      'deviceId',
      'entityId',
      'entityType',
      'mutationId',
      'operation',
      'payload',
    ])

    const mutation = {
      ...upsertOperations[0],
      userId,
      baseSyncEpoch: 1,
      queuedAt: '2026-08-08T00:00:00.000Z',
      attemptCount: 0,
      status: 'pending',
      lastErrorCode: null,
      lastErrorMessage: null,
    } satisfies SyncMutation

    expect(mutation.userId).toBe(userId)
  })

  it('uses compile-time rejections for invalid operations and JSON', () => {
    // @ts-expect-error user settings cannot be deleted
    acceptOperation({ mutationId: 'invalid-1', deviceId, entityType: 'userSettings', entityId: userId, operation: 'delete', payload: {} })

    // @ts-expect-error sync payloads are never nullable
    acceptOperation({ mutationId: 'invalid-2', deviceId, entityType: 'bean', entityId: serverBean.id, operation: 'upsert', payload: null })

    // @ts-expect-error delete payloads must be strictly empty
    acceptOperation({ mutationId: 'invalid-3', deviceId, entityType: 'bean', entityId: serverBean.id, operation: 'delete', payload: { reason: 'cleanup' } })

    // @ts-expect-error ownership fields cannot be submitted in an upsert payload
    acceptOperation({ mutationId: 'invalid-4', deviceId, entityType: 'bean', entityId: serverBean.id, operation: 'upsert', payload: { ...beanPayload, user_id: userId } })

    // @ts-expect-error server timestamps cannot be submitted in an upsert payload
    acceptOperation({ mutationId: 'invalid-5', deviceId, entityType: 'bean', entityId: serverBean.id, operation: 'upsert', payload: { ...beanPayload, updated_at: '2026-08-08T00:00:00.000Z' } })

    // @ts-expect-error local ownership metadata is not part of a wire operation
    acceptOperation({ ...upsertOperations[0], userId })

    // @ts-expect-error undefined is not JSON
    acceptJsonValue(undefined)

    // @ts-expect-error functions are not JSON object values
    acceptJsonObject({ invalid: () => 'not JSON' })

    // @ts-expect-error symbols are not JSON
    acceptJsonValue(Symbol('not JSON'))

    // @ts-expect-error legacy Bean rows cannot stand in for complete server rows
    acceptServerBean(legacyBean)
  })
})
