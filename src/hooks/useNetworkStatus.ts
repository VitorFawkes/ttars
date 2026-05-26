import { useState, useEffect, useCallback, useRef } from 'react'

interface NetworkStatus {
    isOnline: boolean
    wasOffline: boolean
}

const CONNECTIVITY_TIMEOUT_MS = 5000
const RECHECK_INTERVAL_MS = 10000
const WAS_OFFLINE_DISPLAY_MS = 4000

async function checkConnectivity(): Promise<boolean> {
    try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT_MS)
        const res = await fetch(`/favicon.ico?_=${Date.now()}`, {
            method: 'HEAD',
            cache: 'no-store',
            signal: controller.signal,
        })
        clearTimeout(timeoutId)
        return res.ok
    } catch {
        return false
    }
}

export function useNetworkStatus(): NetworkStatus {
    const [isOnline, setIsOnline] = useState(true)
    const [wasOffline, setWasOffline] = useState(false)
    const wasOfflineTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const recheckIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

    const stopRecheck = useCallback(() => {
        if (recheckIntervalRef.current) {
            clearInterval(recheckIntervalRef.current)
            recheckIntervalRef.current = undefined
        }
    }, [])

    const markOnline = useCallback(() => {
        stopRecheck()
        setIsOnline(prev => {
            if (!prev) {
                setWasOffline(true)
                if (wasOfflineTimerRef.current) clearTimeout(wasOfflineTimerRef.current)
                wasOfflineTimerRef.current = setTimeout(
                    () => setWasOffline(false),
                    WAS_OFFLINE_DISPLAY_MS,
                )
            }
            return true
        })
    }, [stopRecheck])

    const startRecheck = useCallback(() => {
        if (recheckIntervalRef.current) return
        recheckIntervalRef.current = setInterval(async () => {
            const ok = await checkConnectivity()
            if (ok) markOnline()
        }, RECHECK_INTERVAL_MS)
    }, [markOnline])

    const verifyOffline = useCallback(async () => {
        // navigator.onLine is unreliable (false positives offline via VPN,
        // extensions, captive portals). Confirm with a real fetch before
        // showing the offline banner.
        const ok = await checkConnectivity()
        if (ok) {
            markOnline()
            return
        }
        setIsOnline(false)
        startRecheck()
    }, [markOnline, startRecheck])

    useEffect(() => {
        const handleOnline = () => {
            void verifyOffline()
        }
        const handleOffline = () => {
            void verifyOffline()
        }

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        const initialCheckId = !navigator.onLine
            ? setTimeout(() => {
                  void verifyOffline()
              }, 0)
            : undefined

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
            if (initialCheckId !== undefined) clearTimeout(initialCheckId)
            if (wasOfflineTimerRef.current) clearTimeout(wasOfflineTimerRef.current)
            stopRecheck()
        }
    }, [verifyOffline, stopRecheck])

    return { isOnline, wasOffline }
}
