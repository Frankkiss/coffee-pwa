/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./brewTemplates.css', import.meta.url), 'utf8')

describe('brew template responsive CSS', () => {
  it('lets form controls shrink inside grid cells instead of overflowing', () => {
    expect(css).toMatch(
      /\.brew-template-form input,[\s\S]*?\.brew-template-form select,[\s\S]*?\.brew-template-form textarea \{[\s\S]*?box-sizing: border-box;[\s\S]*?min-width: 0;[\s\S]*?width: 100%;[\s\S]*?\}/,
    )
  })

  it('keeps pour-step action and delete controls on separate grid areas', () => {
    expect(css).toMatch(
      /\.brew-template-step-row \{[\s\S]*?grid-template-areas:[\s\S]*?"label start end water delete"[\s\S]*?"action action action action delete"/,
    )
    expect(css).toMatch(/\.brew-template-step-row__remove \{[\s\S]*?grid-area: delete;/)
  })

  it('collapses pour-step editing before the mobile breakpoint gets cramped', () => {
    expect(css).toMatch(/@media \(max-width: 1020px\) \{[\s\S]*?\.brew-template-step-row/)
  })
})
