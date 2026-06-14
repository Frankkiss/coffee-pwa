import { useEffect, useState } from 'react'
import './pwa.css'

export function OnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
    }

    function handleOffline() {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return (
    <div className={isOnline ? 'online-status' : 'online-status online-status--offline'}>
      <span aria-hidden="true" />
      {isOnline ? '在线，同步与 AI 推荐可用' : '离线，可打开已缓存页面，保存与 AI 推荐需联网'}
    </div>
  )
}
