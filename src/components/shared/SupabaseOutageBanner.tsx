import { useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { subscribeToSupabaseHealth, getSupabaseOutageState } from '../../lib/supabaseHealth'

export function SupabaseOutageBanner() {
    const [isOutage, setIsOutage] = useState<boolean>(() => getSupabaseOutageState())

    useEffect(() => {
        return subscribeToSupabaseHealth(setIsOutage)
    }, [])

    if (!isOutage) return null

    return (
        <div
            role="alert"
            className="fixed inset-x-0 top-0 z-[100] bg-amber-50 border-b border-amber-200 shadow-sm"
        >
            <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
                <p className="flex-1 text-sm text-amber-900">
                    <span className="font-medium">Instabilidade no banco de dados.</span>{' '}
                    <span className="text-amber-800">
                        Não é problema do seu computador — geralmente volta em alguns minutos. Tentando reconectar…
                    </span>
                </p>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium text-amber-900 transition hover:bg-amber-100"
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Recarregar
                </button>
            </div>
        </div>
    )
}
