export const pendingSignOutMessage = '还有本地修改尚未同步。退出后这些修改仍保留在本机，但切换账号时不会上传。确认退出吗？'

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
  signOut: () => Promise<unknown>,
) {
  if (
    (pendingCount > 0 || attentionCount > 0) &&
    !confirm(pendingSignOutMessage)
  ) {
    return false
  }
  await signOut()
  return true
}
