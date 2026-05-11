import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/viagem/useOnlineStatus'

export function OfflineBanner() {
  const isOnline = useOnlineStatus()

  if (isOnline) return null

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-50 border-b border-amber-200 px-4 py-2">
      <WifiOff className="h-4 w-4 text-amber-600 shrink-0" />
      <p className="text-xs font-medium text-amber-800">
        Você está offline — mostrando dados salvos
      </p>
    </div>
  )
}
