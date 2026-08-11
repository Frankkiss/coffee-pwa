import { describe, expect, it, vi } from 'vitest'
import {
  confirmAndSignOut,
  createSignOutSingleFlight,
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
    const resume = vi.fn()
    const suspend = vi.fn(() => resume)
    const signOut = vi.fn().mockResolvedValue(undefined)
    await confirmAndSignOut(0, 0, confirm, suspend, signOut)
    expect(confirm).not.toHaveBeenCalled()
    expect(suspend).toHaveBeenCalledOnce()
    expect(signOut).toHaveBeenCalledOnce()
    expect(resume).not.toHaveBeenCalled()
  })

  it('does not sign out when pending work confirmation is cancelled', async () => {
    const confirm = vi.fn().mockReturnValue(false)
    const suspend = vi.fn(() => vi.fn())
    const signOut = vi.fn()
    await confirmAndSignOut(1, 0, confirm, suspend, signOut)
    expect(confirm).toHaveBeenCalledWith(pendingSignOutMessage)
    expect(suspend).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
  })

  it('signs out after attention work is explicitly confirmed', async () => {
    const confirm = vi.fn().mockReturnValue(true)
    const resume = vi.fn()
    const suspend = vi.fn(() => resume)
    const signOut = vi.fn().mockResolvedValue(undefined)
    await confirmAndSignOut(0, 1, confirm, suspend, signOut)
    expect(confirm).toHaveBeenCalledWith(pendingSignOutMessage)
    expect(signOut).toHaveBeenCalledOnce()
    expect(resume).not.toHaveBeenCalled()
  })

  it('suspends synchronously before a deferred sign-out and blocks wakes', async () => {
    const order: string[] = []
    let active = true
    let finishSignOut!: () => void
    const signOutResult = new Promise<void>((resolve) => { finishSignOut = resolve })
    const publish = vi.fn()
    const suspend = vi.fn(() => {
      order.push('suspend')
      active = false
      return vi.fn()
    })
    const signOut = vi.fn(() => {
      order.push('signOut')
      return signOutResult
    })

    const result = confirmAndSignOut(0, 0, vi.fn(), suspend, signOut)
    if (active) publish()

    expect(order).toEqual(['suspend', 'signOut'])
    expect(publish).not.toHaveBeenCalled()
    finishSignOut()
    await result
  })

  it('resumes exactly once when sign-out rejects', async () => {
    const resume = vi.fn()
    const failure = new Error('network unavailable')

    await expect(confirmAndSignOut(
      0,
      0,
      vi.fn(),
      () => resume,
      vi.fn().mockRejectedValue(failure),
    )).rejects.toBe(failure)

    expect(resume).toHaveBeenCalledOnce()
  })
})

describe('createSignOutSingleFlight', () => {
  it('coalesces repeated clicks until the active sign-out settles', async () => {
    let finish!: () => void
    const deferred = new Promise<void>((resolve) => { finish = resolve })
    const operation = vi.fn(() => deferred)
    const pendingChanges: boolean[] = []
    const flight = createSignOutSingleFlight((pending) => pendingChanges.push(pending))

    const first = flight.run(operation)
    const second = flight.run(operation)

    expect(operation).toHaveBeenCalledOnce()
    expect(second).toBe(first)
    expect(pendingChanges).toEqual([true])
    finish()
    await first
    expect(pendingChanges).toEqual([true, false])
  })
})
