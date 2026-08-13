import { describe, expect, it, vi } from 'vitest'
import { requestSourceImport } from './sourceImportService'

describe('requestSourceImport', () => {
  it('sends only pasted text to the import-source function', async () => {
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
    })

    expect(invoke).toHaveBeenCalledWith('import-source', {
      body: {
        pastedText: '咖啡豆商品详情文本',
      },
    })
  })
})
