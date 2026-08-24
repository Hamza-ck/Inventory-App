import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { submitQueue } from '../lib/sync'

// Mounted once near the app root. Retries any pending, quantity-filled
// queue items whenever the browser regains connectivity, and as a
// safety net every 45s while items are pending. This is a lighter-weight
// stand-in for the Background Sync API (which needs a custom service
// worker and only helps once the browser decides to fire the event) —
// good enough for "employee keeps the tab open on a warehouse device".
export default function QueueAutoSync() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return

    const tryRun = () => {
      if (navigator.onLine) submitQueue(user.id).catch(() => {})
    }

    window.addEventListener('online', tryRun)
    const interval = setInterval(tryRun, 45000)
    tryRun()

    return () => {
      window.removeEventListener('online', tryRun)
      clearInterval(interval)
    }
  }, [user])

  return null
}
