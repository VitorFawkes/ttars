import { useState, useEffect, useCallback, useRef } from 'react'

interface NetworkStatus {
    isOnline: boolean
    wasOffline: boolean
}

export function useNetworkStatus(): NetworkStatus {
    const [isOnline, setIsOnline] = useState(navigator.onLine)
    const [wasOffline, setWasOffline] = useState(false)
    const wasOfflineTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    const handleOnline = useCallback(() => {
        setIsOnline(true)
        setWasOffline(true)
        wasOfflineTimerRef.current = setTimeout(() => setWasOffline(false), 4000)
    }, [])

    const handleOffline = useCallback(() => {
        setIsOnline(false)
    }, [])

    useEffect(() => {
        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
            if (wasOfflineTimerRef.current) clearTimeout(wasOfflineTimerRef.current)
        }
    }, [handleOnline, handleOffline])

    return { isOnline, wasOffline }
}
