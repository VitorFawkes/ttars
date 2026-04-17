import { cn } from '@/lib/utils'
import { Loader2, Cloud, CloudOff, Check } from 'lucide-react'

/**
 * SaveIndicator - Visual feedback for save state
 * 
 * Shows:
 * - Saving in progress (spinner)
 * - Saved successfully (checkmark)  
 * - Unsaved changes (warning)
 * - Offline (cloud off)
 */
interface SaveIndicatorProps {
    isDirty: boolean
    isSaving: boolean
    lastSaved?: Date | null
    isOnline?: boolean
    className?: string
}

export function SaveIndicator({
    isDirty,
    isSaving,
    lastSaved,
    isOnline = true,
    className,
}: SaveIndicatorProps) {
    // Offline state
    if (!isOnline) {
        return (
            <div className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full',
                'bg-amber-50 border border-amber-200',
                className
            )}>
                <CloudOff className="h-3.5 w-3.5 text-amber-600" />
                <span className="text-xs font-medium text-amber-700">Offline</span>
            </div>
        )
    }

    // Saving state
    if (isSaving) {
        return (
            <div className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full',
                'bg-blue-50 border border-blue-200',
                className
            )}>
                <Loader2 className="h-3.5 w-3.5 text-blue-600 animate-spin" />
                <span className="text-xs font-medium text-blue-700">Salvando...</span>
            </div>
        )
    }

    // Unsaved changes
    if (isDirty) {
        return (
            <div className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full',
                'bg-amber-50 border border-amber-200',
                className
            )}>
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-xs font-medium text-amber-700">Alterações não salvas</span>
            </div>
        )
    }

    // Saved state
    if (lastSaved) {
        const timeAgo = getTimeAgo(lastSaved)
        return (
            <div className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full',
                'bg-emerald-50 border border-emerald-200',
                className
            )}>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-xs font-medium text-emerald-700">
                    Salvo {timeAgo}
                </span>
            </div>
        )
    }

    // Default: synced
    return (
        <div className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full',
            'bg-slate-50 border border-slate-200',
            className
        )}>
            <Cloud className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-xs font-medium text-slate-600">Sincronizado</span>
        </div>
    )
}

// Helper to format time ago
function getTimeAgo(date: Date): string {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSeconds = Math.floor(diffMs / 1000)
    const diffMinutes = Math.floor(diffSeconds / 60)
    const diffHours = Math.floor(diffMinutes / 60)

    if (diffSeconds < 10) return 'agora'
    if (diffSeconds < 60) return `há ${diffSeconds}s`
    if (diffMinutes < 60) return `há ${diffMinutes}min`
    if (diffHours < 24) return `há ${diffHours}h`

    return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
}

export default SaveIndicator
