import { useEffect, useRef } from 'react'
import { WifiOff, Wifi } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { cn } from '../../lib/utils'

export function NetworkStatusBanner() {
    const { isOnline, wasOffline } = useNetworkStatus()
    const queryClient = useQueryClient()
    const prevOnlineRef = useRef(isOnline)

    // Revalidar queries quando a conexão voltar
    useEffect(() => {
        if (isOnline && !prevOnlineRef.current) {
            queryClient.invalidateQueries()
        }
        prevOnlineRef.current = isOnline
    }, [isOnline, queryClient])

    if (isOnline && !wasOffline) return null

    return (
        <div
            className={cn(
                'flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-all duration-300',
                !isOnline
                    ? 'bg-amber-50 border-b border-amber-200 text-amber-800'
                    : 'bg-emerald-50 border-b border-emerald-200 text-emerald-800'
            )}
        >
            {!isOnline ? (
                <>
                    <WifiOff className="h-4 w-4" />
                    <span>Sem conexão com a internet. Os dados exibidos podem estar desatualizados.</span>
                </>
            ) : (
                <>
                    <Wifi className="h-4 w-4" />
                    <span>Conexão restabelecida. Atualizando dados...</span>
                </>
            )}
        </div>
    )
}
