import { describe, expect, it } from 'vitest'
import { getAuthRedirectTo } from './authRedirect'

describe('getAuthRedirectTo', () => {
  it('returns the GitHub Pages app root when Vite base is a subpath', () => {
    expect(getAuthRedirectTo('https://frankkiss.github.io', '/coffee-pwa/')).toBe(
      'https://frankkiss.github.io/coffee-pwa/',
    )
  })

  it('normalizes a missing trailing slash on the base path', () => {
    expect(getAuthRedirectTo('http://localhost:5173', '/coffee-pwa')).toBe(
      'http://localhost:5173/coffee-pwa/',
    )
  })

  it('uses the origin root when the app is deployed at slash', () => {
    expect(getAuthRedirectTo('http://localhost:5173', '/')).toBe(
      'http://localhost:5173/',
    )
  })
})
