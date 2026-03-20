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

export type NotificationType =
  | 'lead_assigned'
  | 'task_expiring'
  | 'task_overdue'
  | 'proposal_status'
  | 'meeting_reminder'

export interface PushPreferences {
  enabled: boolean
  lead_assigned: boolean
  task_expiring: boolean
  task_overdue: boolean
  proposal_status: boolean
  meeting_reminder: boolean
}

const DEFAULT_PREFERENCES: PushPreferences = {
  enabled: true,
  lead_assigned: true,
  task_expiring: true,
  task_overdue: true,
  proposal_status: true,
  meeting_reminder: true,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export function usePushNotifications() {
  const { profile } = useAuth()
  const [isSupported, setIsSupported] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [preferences, setPreferences] = useState<PushPreferences>(DEFAULT_PREFERENCES)

  // Check support, subscription, and load preferences on mount
  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY
    setIsSupported(supported)

    if (!profile?.id) return

    // Load preferences
    db.from('push_notification_preferences')
      .select('*')
      .eq('user_id', profile.id)
      .maybeSingle()
      .then(({ data }: { data: PushPreferences | null }) => {
        if (data) {
          setPreferences(data)
        }
      })

    if (!supported) return

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
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setIsLoading(false)
        return false
      }

      const registration = await navigator.serviceWorker.register('/sw-push.js')
      await navigator.serviceWorker.ready

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      const subJson = subscription.toJSON()
      if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
        throw new Error('Invalid subscription data')
      }

      // Save subscription
      const { error } = await db
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

      // Create/update preferences with enabled = true
      await db
        .from('push_notification_preferences')
        .upsert(
          { user_id: profile.id, enabled: true, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )

      setPreferences((prev) => ({ ...prev, enabled: true }))
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
          await db
            .from('push_subscriptions')
            .delete()
            .eq('user_id', profile.id)
            .eq('endpoint', subscription.endpoint)
        }
      }

      // Update preferences
      await db
        .from('push_notification_preferences')
        .upsert(
          { user_id: profile.id, enabled: false, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )

      setPreferences((prev) => ({ ...prev, enabled: false }))
      setIsSubscribed(false)
      return true
    } catch (err) {
      console.error('[Push] Unsubscribe failed:', err)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [profile?.id])

  const updatePreference = useCallback(async (key: NotificationType, value: boolean) => {
    if (!profile?.id) return false

    try {
      const { error } = await db
        .from('push_notification_preferences')
        .upsert(
          { user_id: profile.id, [key]: value, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )

      if (error) throw error

      setPreferences((prev) => ({ ...prev, [key]: value }))
      return true
    } catch (err) {
      console.error('[Push] Update preference failed:', err)
      return false
    }
  }, [profile?.id])

  return {
    isSupported,
    isSubscribed,
    isLoading,
    preferences,
    subscribe,
    unsubscribe,
    updatePreference,
  }
}
