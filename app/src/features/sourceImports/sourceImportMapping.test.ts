import { describe, expect, it } from 'vitest'
import {
  createBeanFormFromSourceDraft,
  normalizeSourceImportDraft,
} from './sourceImportMapping'

describe('source import mapping', () => {
  it('normalizes AI draft fields into stable bean draft values', () => {
    const draft = normalizeSourceImportDraft({
      name: ' Ethiopia Guji ',
      roaster: ' Test Roaster ',
      origin: 'Ethiopia',
      farmOrStation: 'Guji Station',
      process: 'Washed',
      variety: 'Heirloom',
      altitudeMeters: '1900',
      roastLevel: 'Light',
      flavorTags: ['citrus', ' honey ', 'citrus', ''],
      flavorNotes: 'citrus and honey',
      beanType: 'blend',
      blendComponents: [
        {
          origin: 'Brazil',
          process: 'Natural',
          variety: 'Bourbon',
          percentage: '60',
          notes: 'body and sweetness',
        },
      ],
      blendNotes: '60% Brazil Natural Bourbon',
      sourceUrl: 'https://example.com/bean',
      notes: 'Imported draft',
      confidence: 'medium',
      missingFields: ['roast date', 'net weight'],
    })

    expect(draft).toMatchObject({
      name: 'Ethiopia Guji',
      roaster: 'Test Roaster',
      origin: '埃塞俄比亚',
      farmOrStation: 'Guji Station',
      process: '水洗',
      variety: '原生种',
      altitudeMeters: 1900,
      roastLevel: '浅烘',
      flavorTags: ['柑橘', '蜂蜜'],
      flavorNotes: 'citrus and honey',
      beanType: 'blend',
      blendComponents: [
        {
          origin: '巴西',
          process: '日晒',
          variety: '波旁',
          percentage: 60,
          role: '',
          notes: 'body and sweetness',
        },
      ],
      blendNotes: '60% Brazil Natural Bourbon',
      sourceUrl: 'https://example.com/bean',
      notes: 'Imported draft',
      confidence: 'medium',
      missingFields: ['烘焙日期', '净含量'],
    })
  })

  it('maps a normalized draft into the existing bean form shape', () => {
    const draft = normalizeSourceImportDraft({
      name: 'Ethiopia Guji',
      altitudeMeters: 1900,
      flavorTags: ['citrus', 'honey'],
      sourceUrl: 'https://example.com/bean',
    })

    expect(createBeanFormFromSourceDraft(draft)).toMatchObject({
      name: 'Ethiopia Guji',
      altitudeMeters: '1900',
      flavorTags: '柑橘, 蜂蜜',
      beanType: 'single_origin',
      sourceUrl: 'https://example.com/bean',
    })
  })

  it('keeps missing or invalid values editable instead of inventing data', () => {
    const draft = normalizeSourceImportDraft({
      name: null,
      altitudeMeters: 'not-a-number',
      flavorTags: 'berry, sweet, berry',
      missingFields: 'origin, process',
    })

    expect(draft.name).toBe('')
    expect(draft.altitudeMeters).toBe(null)
    expect(draft.flavorTags).toEqual(['莓果', '甜感'])
    expect(draft.missingFields).toEqual(['产地', '处理法'])
  })
})
