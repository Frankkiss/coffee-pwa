import { describe, expect, it } from 'vitest'
import {
  formatBlendComponents,
  parseBlendComponentsText,
} from './blendComponents'

describe('blend component helpers', () => {
  it('parses blend composition lines into structured components', () => {
    expect(
      parseBlendComponentsText(
        '60% 巴西 日晒 黄波旁，提供坚果和甜感\n40% 埃塞俄比亚 水洗 原生种，提供花香和柑橘',
      ),
    ).toEqual([
      {
        origin: '巴西',
        process: '日晒',
        variety: '黄波旁',
        percentage: 60,
        role: '',
        notes: '提供坚果和甜感',
      },
      {
        origin: '埃塞俄比亚',
        process: '水洗',
        variety: '原生种',
        percentage: 40,
        role: '',
        notes: '提供花香和柑橘',
      },
    ])
  })

  it('keeps unstructured blend lines as notes instead of dropping data', () => {
    expect(parseBlendComponentsText('拉美豆做主体，埃塞豆增加香气')).toEqual([
      {
        origin: '',
        process: '',
        variety: '',
        percentage: null,
        role: '',
        notes: '拉美豆做主体，埃塞豆增加香气',
      },
    ])
  })

  it('parses known blend components without requiring percentages', () => {
    expect(parseBlendComponentsText('巴西 日晒 黄波旁\n埃塞俄比亚 水洗 原生种')).toEqual([
      {
        origin: '巴西',
        process: '日晒',
        variety: '黄波旁',
        percentage: null,
        role: '',
        notes: '',
      },
      {
        origin: '埃塞俄比亚',
        process: '水洗',
        variety: '原生种',
        percentage: null,
        role: '',
        notes: '',
      },
    ])
  })

  it('formats structured components back into editable text', () => {
    expect(
      formatBlendComponents([
        {
          origin: '巴西',
          process: '日晒',
          variety: '黄波旁',
          percentage: 60,
          role: '主体甜感',
          notes: '坚果、巧克力',
        },
      ]),
    ).toBe('60% 巴西 日晒 黄波旁 主体甜感，坚果、巧克力')
  })

  it('formats unknown-ratio blend components without implying a ratio', () => {
    expect(
      formatBlendComponents([
        {
          origin: '埃塞俄比亚',
          process: '水洗',
          variety: '原生种',
          percentage: null,
          role: '香气',
          notes: '花香和柑橘',
        },
      ]),
    ).toBe('埃塞俄比亚 水洗 原生种 香气，花香和柑橘')
  })
})
