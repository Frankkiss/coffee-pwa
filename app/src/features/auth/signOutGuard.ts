export const pendingSignOutMessage = '还有本地修改尚未同步。退出后这些修改仍保留在本机，但切换账号时不会上传。确认退出吗？'

export function createSignOutSingleFlight(
  onPendingChange: (pending: boolean) => void,
) {
  let active: Promise<unknown> | null = null
  return {
    run<Result>(operation: () => Promise<Result>) {
      if (active !== null) return active as Promise<Result>
      onPendingChange(true)
      let result: Promise<Result>
      try {
        result = operation()
      } catch (error) {
        result = Promise.reject(error)
      }
      const current = result.finally(() => {
        if (active === current) {
          active = null
          onPendingChange(false)
        }
      })
      active = current
      return current
    },
  }
}

export function pendingCountForSignOut(
  hasLoadedOutbox: boolean,
  pendingCount: number,
) {
  return hasLoadedOutbox ? pendingCount : Math.max(1, pendingCount)
}

export async function confirmAndSignOut(
  pendingCount: number,
  attentionCount: number,
  confirm: (message: string) => boolean,
  suspendForSignOut: () => () => void,
  signOut: () => Promise<unknown>,
) {
  if (
    (pendingCount > 0 || attentionCount > 0) &&
    !confirm(pendingSignOutMessage)
  ) {
    return false
  }
  const resume = suspendForSignOut()
  try {
    await signOut()
    return true
  } catch (error) {
    resume()
    throw error
  }
}
