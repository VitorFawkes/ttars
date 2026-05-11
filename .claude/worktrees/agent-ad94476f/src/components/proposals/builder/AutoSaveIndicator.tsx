import { useEffect, useState } from 'react'
import { useProposalBuilder } from '@/hooks/useProposalBuilder'
import { cn } from '@/lib/utils'
import { Check, Cloud, CloudOff, Loader2 } from 'lucide-react'

/**
 * AutoSaveIndicator - Visual indicator for proposal save state
 * 
 * Shows:
 * - Saving... (spinner)
 * - Saved (check with timestamp)
 * - Unsaved changes (warning)
 */

interface AutoSaveIndicatorProps {
    className?: string
}

export function AutoSaveIndicator({ className }: AutoSaveIndicatorProps) {
    const { isDirty, isSaving, lastSavedAt } = useProposalBuilder()
    const [showSaved, setShowSaved] = useState(false)

    // Show "Saved" briefly after save completes
    useEffect(() => {
        if (lastSavedAt && !isSaving && !isDirty) {
            setShowSaved(true)
            const timer = setTimeout(() => setShowSaved(false), 3000)
            return () => clearTimeout(timer)
        }
    }, [lastSavedAt, isSaving, isDirty])

    // Format time ago
    const timeAgo = lastSavedAt
        ? formatTimeAgo(new Date(lastSavedAt))
        : null

    if (isSaving) {
        return (
            <div className={cn(
                'flex items-center gap-2 text-sm text-blue-600',
                className
            )}>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Salvando...</span>
            </div>
        )
    }

    if (isDirty) {
        return (
            <div className={cn(
                'flex items-center gap-2 text-sm text-amber-600',
                className
            )}>
                <CloudOff className="h-4 w-4" />
                <span>Alterações não salvas</span>
            </div>
        )
    }

    if (showSaved || lastSavedAt) {
        return (
            <div className={cn(
                'flex items-center gap-2 text-sm transition-colors',
                showSaved ? 'text-green-600' : 'text-slate-400',
                className
            )}>
                {showSaved ? (
                    <Check className="h-4 w-4" />
                ) : (
                    <Cloud className="h-4 w-4" />
                )}
                <span>
                    {showSaved ? 'Salvo!' : `Salvo ${timeAgo}`}
                </span>
            </div>
        )
    }

    return null
}

// Helper to format relative time
function formatTimeAgo(date: Date): string {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    const diffMins = Math.floor(diffSecs / 60)
    const diffHours = Math.floor(diffMins / 60)

    if (diffSecs < 60) {
        return 'agora'
    }
    if (diffMins < 60) {
        return `há ${diffMins} min`
    }
    if (diffHours < 24) {
        return `há ${diffHours}h`
    }
    return date.toLocaleDateString('pt-BR')
}

export default AutoSaveIndicator
