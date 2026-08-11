import { describe, expect, it, vi } from 'vitest'
import {
  confirmAndSignOut,
  pendingCountForSignOut,
  pendingSignOutMessage,
} from './signOutGuard'

describe('confirmAndSignOut', () => {
  it('treats an outbox that has not loaded safely as pending', () => {
    expect(pendingCountForSignOut(false, 0)).toBe(1)
    expect(pendingCountForSignOut(true, 0)).toBe(0)
  })
  it('signs out without prompting when no local work remains', async () => {
    const confirm = vi.fn()
    const signOut = vi.fn().mockResolvedValue(undefined)
    await confirmAndSignOut(0, 0, confirm, signOut)
    expect(confirm).not.toHaveBeenCalled()
    expect(signOut).toHaveBeenCalledOnce()
  })

  it('does not sign out when pending work confirmation is cancelled', async () => {
    const confirm = vi.fn().mockReturnValue(false)
    const signOut = vi.fn()
    await confirmAndSignOut(1, 0, confirm, signOut)
    expect(confirm).toHaveBeenCalledWith(pendingSignOutMessage)
    expect(signOut).not.toHaveBeenCalled()
  })

  it('signs out after attention work is explicitly confirmed', async () => {
    const confirm = vi.fn().mockReturnValue(true)
    const signOut = vi.fn().mockResolvedValue(undefined)
    await confirmAndSignOut(0, 1, confirm, signOut)
    expect(confirm).toHaveBeenCalledWith(pendingSignOutMessage)
    expect(signOut).toHaveBeenCalledOnce()
  })
})
