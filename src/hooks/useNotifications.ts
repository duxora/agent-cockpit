import { useEffect, useRef, useCallback } from 'react'
import type { Session } from '../types'

export function useNotifications(sessions: Session[]) {
  const prevWaitingRef = useRef<Set<string>>(new Set())
  const permissionRef = useRef<NotificationPermission>('default')

  // Request permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      permissionRef.current = Notification.permission
      if (Notification.permission === 'default') {
        Notification.requestPermission().then((perm) => {
          permissionRef.current = perm
        })
      }
    }
  }, [])

  // Detect new waiting sessions and notify
  useEffect(() => {
    if (permissionRef.current !== 'granted') return
    if (document.visibilityState === 'visible') return

    const currentWaiting = new Set(
      sessions.filter((s) => s.status === 'waiting').map((s) => s.sessionId || s.name)
    )

    // Find newly waiting sessions (not in previous set)
    for (const key of currentWaiting) {
      if (!prevWaitingRef.current.has(key)) {
        const session = sessions.find((s) => (s.sessionId || s.name) === key)
        if (session) {
          new Notification('Agent needs attention', {
            body: `${session.name} is waiting for input`,
            icon: '/favicon.ico',
            tag: `waiting-${key}`,
          })
        }
      }
    }

    prevWaitingRef.current = currentWaiting
  }, [sessions])

  const requestPermission = useCallback(async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission()
      permissionRef.current = perm
      return perm
    }
    return 'denied' as NotificationPermission
  }, [])

  return {
    permission: permissionRef.current,
    requestPermission,
    supported: 'Notification' in window,
  }
}
