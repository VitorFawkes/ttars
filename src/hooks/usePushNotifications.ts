import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray.buffer as ArrayBuffer
}

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

export function usePushNotifications() {
  const { profile } = useAuth()
  const [isSupported, setIsSupported] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Check support and existing subscription on mount
  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY
    setIsSupported(supported)

    if (!supported || !profile?.id) return

    navigator.serviceWorker.getRegistration('/sw-push.js').then((reg) => {
      if (!reg) return
      reg.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(!!sub)
      })
    })
  }, [profile?.id])

  const subscribe = useCallback(async () => {
    if (!profile?.id || !VAPID_PUBLIC_KEY) return false
    setIsLoading(true)

    try {
      // 1. Request permission (must be from user gesture)
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setIsLoading(false)
        return false
      }

      // 2. Register service worker
      const registration = await navigator.serviceWorker.register('/sw-push.js')
      await navigator.serviceWorker.ready

      // 3. Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      const subJson = subscription.toJSON()
      if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
        throw new Error('Invalid subscription data')
      }

      // 4. Save to database (table created by migration, types regenerated after)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('push_subscriptions')
        .upsert(
          {
            user_id: profile.id,
            endpoint: subJson.endpoint,
            p256dh: subJson.keys.p256dh,
            auth: subJson.keys.auth,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,endpoint' }
        )

      if (error) throw error

      setIsSubscribed(true)
      return true
    } catch (err) {
      console.error('[Push] Subscribe failed:', err)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [profile?.id])

  const unsubscribe = useCallback(async () => {
    if (!profile?.id) return false
    setIsLoading(true)

    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw-push.js')
      if (registration) {
        const subscription = await registration.pushManager.getSubscription()
        if (subscription) {
          await subscription.unsubscribe()

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('push_subscriptions')
            .delete()
            .eq('user_id', profile.id)
            .eq('endpoint', subscription.endpoint)
        }
      }

      setIsSubscribed(false)
      return true
    } catch (err) {
      console.error('[Push] Unsubscribe failed:', err)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [profile?.id])

  return { isSupported, isSubscribed, isLoading, subscribe, unsubscribe }
}
