import { describe, expect, it, vi } from 'vitest'
import { requestSourceImport } from './sourceImportService'

describe('requestSourceImport', () => {
  it('sends url and pasted text to the import-source function', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        configured: true,
        sourceUrl: 'https://item.taobao.com/item.htm?id=1',
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
      url: 'https://item.taobao.com/item.htm?id=1',
      pastedText: '咖啡豆商品详情文本',
    })

    expect(invoke).toHaveBeenCalledWith('import-source', {
      body: {
        url: 'https://item.taobao.com/item.htm?id=1',
        pastedText: '咖啡豆商品详情文本',
      },
    })
  })
})
