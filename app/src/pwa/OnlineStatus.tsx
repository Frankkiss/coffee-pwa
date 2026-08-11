import { useEffect, useState } from 'react'
import type { SyncState } from '../features/sync/syncTypes'
import { buildOnlineStatusText, subscribeToNetworkChanges } from './onlineStatusModel'
import './pwa.css'

export function OnlineStatus({ syncState }: { syncState: SyncState }) {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
    }

    function handleOffline() {
      setIsOnline(false)
    }

    return subscribeToNetworkChanges(window, () => {
      if (navigator.onLine) handleOnline()
      else handleOffline()
    })
  }, [])

  return (
    <div className={isOnline ? 'online-status' : 'online-status online-status--offline'}>
      <span aria-hidden="true" />
      {buildOnlineStatusText(syncState, isOnline)}
    </div>
  )
}
