import { AlertTriangle, RefreshCw } from 'lucide-react'

interface QueryErrorStateProps {
    title?: string
    message?: string
    onRetry?: () => void
    compact?: boolean
}

export function QueryErrorState({
    title = 'Erro ao carregar dados',
    message = 'Verifique sua conexão e tente novamente.',
    onRetry,
    compact = false,
}: QueryErrorStateProps) {
    if (compact) {
        return (
            <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="rounded-full bg-red-100 p-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                </div>
                <p className="text-sm font-medium text-slate-700">{title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{message}</p>
                {onRetry && (
                    <button onClick={onRetry} className="mt-2 text-xs text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" /> Tentar novamente
                    </button>
                )}
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <div className="rounded-full bg-red-100 p-4">
                <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
            <div>
                <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                <p className="text-sm text-slate-500">{message}</p>
            </div>
            {onRetry && (
                <button onClick={onRetry} className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 inline-flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" /> Tentar Novamente
                </button>
            )}
        </div>
    )
}
