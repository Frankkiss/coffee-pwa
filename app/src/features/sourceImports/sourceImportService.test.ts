import { describe, expect, it, vi } from 'vitest'
import { recordSourceImport, requestSourceImport } from './sourceImportService'

it('blocks source import record writes in protection mode before touching Supabase', async () => {
  await expect(recordSourceImport(null as never, {
    userId: 'user-a', sourceUrl: 'manual://pasted-text', status: 'draft',
    extractedPayload: {},
  }, 'protection')).rejects.toMatchObject({ code: 'SYNC_PROTECTION_MODE' })
})

describe('requestSourceImport', () => {
  it('sends pasted text and an optional image to the import-source function', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        configured: true,
        sourceUrl: 'manual://pasted-text',
        draft: null,
      },
      error: null,
    })
    const supabase = {
      functions: {
        invoke,
      },
    }

    await requestSourceImport(supabase as never, {
      pastedText: '咖啡豆商品详情文本',
      image: {
        mediaType: 'image/jpeg',
        dataUrl: 'data:image/jpeg;base64,/9j/',
      },
    })

    expect(invoke).toHaveBeenCalledWith('import-source', {
      body: {
        pastedText: '咖啡豆商品详情文本',
        image: {
          mediaType: 'image/jpeg',
          dataUrl: 'data:image/jpeg;base64,/9j/',
        },
      },
    })
  })
})
