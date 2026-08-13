import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { sha256Hex } from './backupChecksum'
import {
  BackupRestoreApiError,
  createBackupRestoreApi,
} from './backupRestoreApi'
import type {
  BackupV2Document,
  MigratedV1SafeMergeDocument,
} from './backupTypes'

const time = '2026-08-12T08:00:00.000Z'

async function backup(): Promise<BackupV2Document> {
  const data = {
    profile: null,
    userSettings: null,
    beans: [],
    brewLogs: [],
    brewTemplates: [],
    aiRecommendations: [],
    sourceImports: [],
  }
  return {
    schemaVersion: 2,
    manifest: {
      exportedAt: time,
      appVersion: '0.0.0-test',
      backupMode: 'lightweight',
      recordCounts: {
        profile: 0, userSettings: 0, beans: 0, brewLogs: 0,
        brewTemplates: 0, aiRecommendations: 0, sourceImports: 0,
      },
      checksumAlgorithm: 'SHA-256',
      checksum: await sha256Hex(data),
      images: [],
      warnings: [],
    },
    data,
  }
}

async function derivedBackup(): Promise<MigratedV1SafeMergeDocument> {
  const document = await backup()
  return {
    ...document,
    manifest: {
      ...document.manifest,
      sourceSchemaVersion: 1 as const,
      fullRollbackEligible: false as const,
      authoritativeSections: ['beans'],
    },
  }
}

async function backupWithBadImageChecksum(): Promise<BackupV2Document> {
  const document = await backup()
  const bean = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    name: 'Test bean', roaster: null, origin: null, farm_or_station: null,
    process: null, variety: null, altitude_meters: null, roast_date: null,
    roast_level: null, flavor_tags: [], flavor_notes: null,
    net_weight_grams: null, price: null, purchase_date: null, source_url: null,
    image_url: null, bean_type: 'single_origin' as const,
    blend_components: [], blend_notes: null, notes: null,
    created_at: time, updated_at: time, deleted_at: null, schema_version: 1,
  }
  const data = { ...document.data, beans: [bean] }
  return {
    ...document,
    manifest: {
      ...document.manifest,
      recordCounts: { ...document.manifest.recordCounts, beans: 1 },
      checksum: await sha256Hex(data),
      images: [{
        entityType: 'bean', entityId: bean.id,
        originalUrl: 'https://example.invalid/bean.jpg',
        archivePath: 'images/bean.jpg', mediaType: 'image/jpeg', byteLength: 12,
        checksum: 'x', status: 'included', errorCode: null,
      }],
    },
    data,
  }
}

const zero = {
  total: 0, new: 0, existing: 0, softDeleted: 0, willUpdate: 0, willDelete: 0,
}

function preview() {
  return {
    mode: 'safe_merge',
    fullRollbackEligible: true,
    counts: {
      profile: { ...zero }, userSettings: { ...zero }, beans: { ...zero },
      brewLogs: { ...zero }, brewTemplates: { ...zero },
      aiRecommendations: { ...zero }, sourceImports: { ...zero },
    },
    invalidRelations: [],
    warnings: [],
  }
}

function safeMergeResult() {
  const empty = { inserted: 0, skipped: 0 }
  return {
    mode: 'safe_merge',
    counts: {
      profile: { ...empty }, userSettings: { ...empty }, beans: { ...empty },
      brewLogs: { ...empty }, brewTemplates: { ...empty },
      aiRecommendations: { ...empty }, sourceImports: { ...empty },
    },
  }
}

function clientWith(results: unknown[]) {
  const rpc = vi.fn()
  for (const result of results) rpc.mockResolvedValueOnce(result)
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

describe('backup restore API boundary', () => {
  it('exposes only a strictly validated safe-merge restore request', async () => {
    const document = await backup()
    const result = safeMergeResult()
    const { client, rpc } = clientWith([{ data: result, error: null }])
    const api = createBackupRestoreApi(client)

    await expect(api.restoreSafeMerge(document)).resolves.toEqual(result)
    expect(rpc).toHaveBeenCalledWith('restore_backup_v2', {
      p_backup: document,
      p_mode: 'safe_merge',
      p_confirmation: null,
      p_restore_request_id: null,
    })
    expect('restoreFullRollback' in api).toBe(true)
  })

  it('exposes a guarded full rollback request with a stable request ID', async () => {
    const document = await backup()
    const empty = { inserted: 0, updated: 0, revived: 0, deleted: 0 }
    const result = {
      mode: 'full_rollback', syncEpoch: 4,
      counts: Object.fromEntries([
        'profile', 'userSettings', 'beans', 'brewLogs', 'brewTemplates',
        'aiRecommendations', 'sourceImports',
      ].map((key) => [key, { ...empty }])),
    }
    const { client, rpc } = clientWith([{ data: result, error: null }])
    await expect(createBackupRestoreApi(client).restoreFullRollback(
      document, 'FULL RESTORE', '76000000-0000-4000-8000-000000000001',
    )).resolves.toEqual(result)
    expect(rpc).toHaveBeenCalledWith('restore_backup_v2', {
      p_backup: document,
      p_mode: 'full_rollback',
      p_confirmation: 'FULL RESTORE',
      p_restore_request_id: '76000000-0000-4000-8000-000000000001',
    })
  })

  it.each([
    ['unknown root', { ...safeMergeResult(), surprise: true }],
    ['wrong mode', { ...safeMergeResult(), mode: 'full_rollback' }],
    ['missing section', { ...safeMergeResult(), counts: { ...safeMergeResult().counts, beans: undefined } }],
    ['unknown count field', { ...safeMergeResult(), counts: { ...safeMergeResult().counts, beans: { inserted: 0, skipped: 0, total: 0 } } }],
    ['negative count', { ...safeMergeResult(), counts: { ...safeMergeResult().counts, beans: { inserted: -1, skipped: 1 } } }],
    ['fractional count', { ...safeMergeResult(), counts: { ...safeMergeResult().counts, beans: { inserted: 0.5, skipped: 0 } } }],
  ])('rejects malformed safe-merge response: %s', async (_name, data) => {
    const { client } = clientWith([{ data, error: null }])
    await expect(createBackupRestoreApi(client).restoreSafeMerge(await backup()))
      .rejects.toMatchObject({ code: 'INVALID_BACKUP_RPC_RESPONSE' })
  })

  it('validates v1-derived safe-merge transport before restore RPC', async () => {
    const document = await derivedBackup()
    const malformed = { ...document, hidden: true }
    const { client, rpc } = clientWith([])
    await expect(createBackupRestoreApi(client).restoreSafeMerge(malformed as never))
      .rejects.toMatchObject({ code: 'INVALID_BACKUP_RPC_REQUEST' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sends only the validated preview request and accepts the exact response', async () => {
    const document = await backup()
    const result = preview()
    const { client, rpc } = clientWith([{ data: result, error: null }])
    const api = createBackupRestoreApi(client)
    await expect(api.preview(document, 'safe_merge')).resolves.toEqual(result)
    expect(rpc).toHaveBeenCalledWith('preview_restore_v2', {
      p_backup: document,
      p_mode: 'safe_merge',
    })
    expect('restore' in api).toBe(false)
  })

  it.each([
    ['unknown root response key', { ...preview(), surprise: true }],
    ['missing partition', { ...preview(), counts: { ...preview().counts, beans: undefined } }],
    ['unknown count key', { ...preview(), counts: { ...preview().counts, beans: { ...zero, skipped: 1 } } }],
    ['fractional count', { ...preview(), counts: { ...preview().counts, beans: { ...zero, total: 0.5 } } }],
    ['mode mismatch', { ...preview(), mode: 'full_rollback' }],
    ['unknown warning', { ...preview(), warnings: ['raw server detail'] }],
    ['bad relation', { ...preview(), invalidRelations: [{ entityType: 'bean', entityId: 'x', field: 'bean_id', value: 'x' }] }],
  ])('rejects malformed preview response: %s', async (_name, data) => {
    const { client } = clientWith([{ data, error: null }])
    await expect(createBackupRestoreApi(client).preview(await backup(), 'safe_merge'))
      .rejects.toMatchObject({ code: 'INVALID_BACKUP_RPC_RESPONSE' })
  })

  it('rejects unknown request fields and invalid modes before making an RPC', async () => {
    const document = await backup()
    const { client, rpc } = clientWith([])
    const api = createBackupRestoreApi(client)
    await expect(api.preview({ ...document, hidden: true } as BackupV2Document, 'safe_merge'))
      .rejects.toMatchObject({ code: 'INVALID_BACKUP_RPC_REQUEST' })
    await expect(api.preview(document, 'overwrite' as 'safe_merge'))
      .rejects.toMatchObject({ code: 'INVALID_BACKUP_RPC_REQUEST' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('strictly validates every v1-derived request field before calling RPC', async () => {
    const document = await derivedBackup()
    const malformedData = { ...document.data, beans: [{}] }
    const malformed = {
      ...document,
      manifest: {
        ...document.manifest,
        exportedAt: 'yesterday',
        recordCounts: { ...document.manifest.recordCounts, beans: 1 },
        checksum: await sha256Hex(malformedData),
      },
      data: malformedData,
    }
    const { client, rpc } = clientWith([])
    await expect(createBackupRestoreApi(client).preview(malformed as never, 'safe_merge'))
      .rejects.toMatchObject({ code: 'INVALID_BACKUP_RPC_REQUEST' })
    await expect(createBackupRestoreApi(client).preview({
      ...document,
      data: { ...document.data, beans: 1 },
    } as never, 'safe_merge')).rejects.toMatchObject({
      code: 'INVALID_BACKUP_RPC_REQUEST',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('requires response rollback eligibility to match the request document', async () => {
    const nativeClient = clientWith([{
      data: { ...preview(), fullRollbackEligible: false },
      error: null,
    }])
    await expect(createBackupRestoreApi(nativeClient.client).preview(
      await backup(),
      'safe_merge',
    )).rejects.toMatchObject({ code: 'INVALID_BACKUP_RPC_RESPONSE' })

    const derivedClient = clientWith([{
      data: { ...preview(), fullRollbackEligible: true },
      error: null,
    }])
    await expect(createBackupRestoreApi(derivedClient.client).preview(
      await derivedBackup(),
      'safe_merge',
    )).rejects.toMatchObject({ code: 'INVALID_BACKUP_RPC_RESPONSE' })
  })

  it('rejects malformed image checksums in requests and export responses', async () => {
    const malformed = await backupWithBadImageChecksum()
    const requestClient = clientWith([])
    await expect(createBackupRestoreApi(requestClient.client).preview(
      malformed,
      'safe_merge',
    )).rejects.toMatchObject({ code: 'INVALID_BACKUP_RPC_REQUEST' })
    expect(requestClient.rpc).not.toHaveBeenCalled()

    const exportClient = clientWith([{ data: malformed, error: null }])
    await expect(createBackupRestoreApi(exportClient.client).exportBackup(
      '0.0.0-test',
      'lightweight',
    )).rejects.toMatchObject({ code: 'INVALID_BACKUP_RPC_RESPONSE' })
  })

  it('validates export responses and download metadata requests', async () => {
    const document = await backup()
    const counts = document.manifest.recordCounts
    const { client, rpc } = clientWith([
      { data: document, error: null },
      { data: time, error: null },
    ])
    const api = createBackupRestoreApi(client)
    await expect(api.exportBackup('0.0.0-test', 'lightweight')).resolves.toEqual(document)
    await expect(api.recordBackupDownload('coffee-backup-2026-08-12.json', 'lightweight', counts))
      .resolves.toBe(time)
    expect(rpc.mock.calls).toEqual([
      ['export_backup_v2', { p_app_version: '0.0.0-test', p_backup_mode: 'lightweight' }],
      ['record_backup_download', { p_file_name: 'coffee-backup-2026-08-12.json', p_backup_mode: 'lightweight', p_record_counts: counts }],
    ])
  })

  it('rejects malformed export/download responses and count requests', async () => {
    const malformed = { ...(await backup()), extra: true }
    const first = clientWith([{ data: malformed, error: null }])
    await expect(createBackupRestoreApi(first.client).exportBackup('0.0.0-test', 'lightweight'))
      .rejects.toMatchObject({ code: 'INVALID_BACKUP_RPC_RESPONSE' })

    const second = clientWith([{ data: 'yesterday', error: null }])
    await expect(createBackupRestoreApi(second.client).recordBackupDownload(
      'coffee-backup-2026-08-12.json',
      'lightweight',
      { ...(await backup()).manifest.recordCounts, extra: 1 } as never,
    )).rejects.toMatchObject({ code: 'INVALID_BACKUP_RPC_REQUEST' })
    expect(second.rpc).not.toHaveBeenCalled()

    const third = clientWith([{ data: 'yesterday', error: null }])
    await expect(createBackupRestoreApi(third.client).recordBackupDownload(
      'coffee-backup-2026-08-12.json',
      'lightweight',
      (await backup()).manifest.recordCounts,
    )).rejects.toMatchObject({ code: 'INVALID_BACKUP_RPC_RESPONSE' })
    expect(third.rpc).toHaveBeenCalledOnce()
  })

  it('does not expose unknown server text through API errors', async () => {
    const { client } = clientWith([{
      data: null,
      error: { code: 'P0001', message: 'SECRET table detail' },
      status: 400,
    }])
    await expect(createBackupRestoreApi(client).preview(await backup(), 'safe_merge'))
      .rejects.toEqual(expect.objectContaining({
        name: 'BackupRestoreApiError',
        code: 'BACKUP_RPC_FAILED',
        message: '备份操作失败，请稍后重试',
      }))
    expect(BackupRestoreApiError).toBeDefined()
  })
})
