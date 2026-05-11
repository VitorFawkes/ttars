/**
 * ConditionalSection - Seção que pode ser habilitada/desabilitada
 *
 * Usado quando campos são opcionais e podem não ser relevantes
 * Ex: Transfer pode ou não ter origem/destino definidos
 */

import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConditionalSectionProps {
    title: string
    enabled: boolean
    onToggle: (enabled: boolean) => void
    children: ReactNode
    icon?: ReactNode
    description?: string
    accentColor?: 'sky' | 'emerald' | 'orange' | 'teal' | 'indigo' | 'violet'
    defaultExpanded?: boolean
}

const ACCENT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    sky: { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
    orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
    teal: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700' },
    indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700' },
    violet: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700' },
}

export function ConditionalSection({
    title,
    enabled,
    onToggle,
    children,
    icon,
    description,
    accentColor = 'violet',
}: ConditionalSectionProps) {
    const colors = ACCENT_COLORS[accentColor]

    return (
        <div className={cn(
            "rounded-lg border transition-all",
            enabled ? colors.border : "border-slate-200 border-dashed"
        )}>
            {/* Header */}
            <button
                type="button"
                onClick={() => onToggle(!enabled)}
                className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-t-lg transition-colors",
                    enabled ? colors.bg : "bg-slate-50 hover:bg-slate-100"
                )}
            >
                {/* Toggle indicator */}
                <div className={cn(
                    "w-5 h-5 rounded flex items-center justify-center transition-colors",
                    enabled ? `${colors.bg} ${colors.text}` : "bg-slate-200 text-slate-400"
                )}>
                    {enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </div>

                {/* Icon */}
                {icon && (
                    <span className={cn(
                        "transition-colors",
                        enabled ? colors.text : "text-slate-400"
                    )}>
                        {icon}
                    </span>
                )}

                {/* Title */}
                <span className={cn(
                    "text-sm font-medium flex-1 text-left transition-colors",
                    enabled ? colors.text : "text-slate-500"
                )}>
                    {title}
                </span>

                {/* Description */}
                {description && !enabled && (
                    <span className="text-xs text-slate-400">
                        {description}
                    </span>
                )}

                {/* Expand indicator */}
                {enabled ? (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                )}
            </button>

            {/* Content */}
            {enabled && (
                <div className="p-3 pt-2">
                    {children}
                </div>
            )}
        </div>
    )
}

/**
 * ToggleField - Campo único com toggle on/off
 * Para campos simples que podem ser habilitados/desabilitados
 */
interface ToggleFieldProps {
    label: string
    enabled: boolean
    onToggle: (enabled: boolean) => void
    children: ReactNode
    className?: string
}

export function ToggleField({
    label,
    enabled,
    onToggle,
    children,
    className,
}: ToggleFieldProps) {
    return (
        <div className={cn("space-y-2", className)}>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => onToggle(!enabled)}
                    className={cn(
                        "w-8 h-5 rounded-full transition-colors relative",
                        enabled ? "bg-emerald-500" : "bg-slate-300"
                    )}
                >
                    <div className={cn(
                        "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                        enabled ? "translate-x-3.5" : "translate-x-0.5"
                    )} />
                </button>
                <span className={cn(
                    "text-xs font-medium transition-colors",
                    enabled ? "text-slate-700" : "text-slate-400"
                )}>
                    {label}
                </span>
            </div>
            {enabled && children}
        </div>
    )
}

export default ConditionalSection
