import { ShieldAlert, X, Loader2 } from 'lucide-react'

interface DataQualityBannerProps {
    fixableIssues: number
    isLoading: boolean
    onReview: () => void
    onDismiss: () => void
}

export function DataQualityBanner({
    fixableIssues, isLoading, onReview, onDismiss
}: DataQualityBannerProps) {
    if (fixableIssues === 0 && !isLoading) return null

    return (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
                <ShieldAlert className="h-5 w-5 text-amber-500 flex-shrink-0" />
                <p className="text-sm text-amber-800 truncate">
                    {isLoading ? (
                        <span className="flex items-center gap-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Verificando qualidade dos dados...
                        </span>
                    ) : (
                        <>
                            <span className="font-semibold">{fixableIssues}</span>{' '}
                            contato{fixableIssues !== 1 ? 's' : ''} com problemas de qualidade
                        </>
                    )}
                </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
                {!isLoading && fixableIssues > 0 && (
                    <button
                        onClick={onReview}
                        className="text-sm font-medium text-amber-900 underline underline-offset-2 hover:text-amber-700 transition-colors"
                    >
                        Revisar
                    </button>
                )}
                <button
                    onClick={onDismiss}
                    className="text-amber-400 hover:text-amber-600 transition-colors"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    )
}
