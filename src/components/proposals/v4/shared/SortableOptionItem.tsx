/**
 * SortableOptionItem - Componente reutilizavel para opcoes com drag-reorder
 *
 * Features:
 * - Drag-and-drop com @dnd-kit
 * - Toggle enable/disable
 * - Botao de recomendado
 * - Visual feedback
 */

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Star, ToggleLeft, ToggleRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface SortableOptionItemProps {
    id: string
    isRecommended: boolean
    enabled: boolean
    onSetRecommended: () => void
    onToggleEnabled: () => void
    onRemove: () => void
    children: ReactNode
    className?: string
    accentColor?: 'emerald' | 'orange' | 'teal' | 'sky' | 'indigo'
}

const ACCENT_COLORS = {
    emerald: {
        recommended: 'border-emerald-300 bg-emerald-50',
        disabled: 'border-slate-200 bg-slate-100 opacity-60',
        default: 'border-slate-200 bg-slate-50',
        starActive: 'text-emerald-600',
        starInactive: 'text-slate-400 hover:text-emerald-500',
    },
    orange: {
        recommended: 'border-orange-300 bg-orange-50',
        disabled: 'border-slate-200 bg-slate-100 opacity-60',
        default: 'border-slate-200 bg-slate-50',
        starActive: 'text-orange-600',
        starInactive: 'text-slate-400 hover:text-orange-500',
    },
    teal: {
        recommended: 'border-teal-300 bg-teal-50',
        disabled: 'border-slate-200 bg-slate-100 opacity-60',
        default: 'border-slate-200 bg-slate-50',
        starActive: 'text-teal-600',
        starInactive: 'text-slate-400 hover:text-teal-500',
    },
    sky: {
        recommended: 'border-sky-300 bg-sky-50',
        disabled: 'border-slate-200 bg-slate-100 opacity-60',
        default: 'border-slate-200 bg-slate-50',
        starActive: 'text-sky-600',
        starInactive: 'text-slate-400 hover:text-sky-500',
    },
    indigo: {
        recommended: 'border-indigo-300 bg-indigo-50',
        disabled: 'border-slate-200 bg-slate-100 opacity-60',
        default: 'border-slate-200 bg-slate-50',
        starActive: 'text-indigo-600',
        starInactive: 'text-slate-400 hover:text-indigo-500',
    },
}

export function SortableOptionItem({
    id,
    isRecommended,
    enabled,
    onSetRecommended,
    onToggleEnabled,
    onRemove,
    children,
    className,
    accentColor = 'emerald',
}: SortableOptionItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    const colors = ACCENT_COLORS[accentColor]
    const containerClasses = cn(
        'flex items-center gap-2 p-2 rounded-lg border transition-all duration-150',
        isDragging && 'shadow-lg z-50',
        !enabled
            ? colors.disabled
            : isRecommended
                ? colors.recommended
                : colors.default,
        className
    )

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={containerClasses}
        >
            {/* Drag Handle */}
            <button
                {...attributes}
                {...listeners}
                className="p-1 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 touch-none"
            >
                <GripVertical className="h-4 w-4" />
            </button>

            {/* Enable/Disable Toggle */}
            <button
                onClick={onToggleEnabled}
                className={cn(
                    'p-1 rounded transition-colors',
                    enabled ? 'text-emerald-500' : 'text-slate-400'
                )}
                title={enabled ? 'Opcao ativa - clique para desativar' : 'Opcao desativada - clique para ativar'}
            >
                {enabled ? (
                    <ToggleRight className="h-4 w-4" />
                ) : (
                    <ToggleLeft className="h-4 w-4" />
                )}
            </button>

            {/* Recommended Star */}
            <button
                onClick={onSetRecommended}
                disabled={!enabled}
                className={cn(
                    'p-1 rounded transition-colors',
                    !enabled && 'opacity-50 cursor-not-allowed',
                    isRecommended && enabled
                        ? colors.starActive
                        : colors.starInactive
                )}
                title={isRecommended ? 'Recomendado' : 'Marcar como recomendado'}
            >
                <Star className={cn('h-4 w-4', isRecommended && enabled && 'fill-current')} />
            </button>

            {/* Content (children) */}
            <div className={cn('flex-1', !enabled && 'pointer-events-none')}>
                {children}
            </div>

            {/* Remove Button */}
            <button
                onClick={onRemove}
                className="p-1 text-red-400 hover:text-red-600 transition-colors"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    )
}

export default SortableOptionItem
