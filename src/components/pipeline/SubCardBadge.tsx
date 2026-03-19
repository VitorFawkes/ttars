import { GitBranch, Package } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SubCardStatus } from '@/hooks/useSubCards'

interface SubCardBadgeProps {
    status?: SubCardStatus
    parentTitle?: string
    activeCount?: number
    variant?: 'small' | 'normal'
    onClick?: () => void
}

/**
 * Badge to indicate sub-card (item da viagem) status
 *
 * - Purple: active item
 * - Shows count of active sub-cards on parent cards
 */
export default function SubCardBadge({
    status = 'active',
    activeCount,
    variant = 'normal',
    onClick
}: SubCardBadgeProps) {
    const isSmall = variant === 'small'

    // If showing count of active sub-cards (for parent cards)
    if (activeCount !== undefined) {
        if (activeCount === 0) return null

        return (
            <div
                className={cn(
                    'inline-flex items-center gap-1 rounded-full font-medium',
                    isSmall ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
                    'bg-purple-100 text-purple-700 border border-purple-200'
                )}
                title={`${activeCount} item(ns) da viagem`}
            >
                <Package className={cn(isSmall ? 'w-2.5 h-2.5' : 'w-3 h-3')} />
                {activeCount}
            </div>
        )
    }

    // Status-based styling
    if (status === 'completed' || status === 'merged') {
        return (
            <div
                className={cn(
                    'inline-flex items-center gap-1 rounded-full font-medium',
                    isSmall ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
                    'bg-green-100 text-green-700 border border-green-200'
                )}
                title="Item concluído"
            >
                <Package className={cn(isSmall ? 'w-2.5 h-2.5' : 'w-3 h-3')} />
                Concluído
            </div>
        )
    }

    if (status === 'cancelled') {
        return (
            <div
                className={cn(
                    'inline-flex items-center gap-1 rounded-full font-medium',
                    isSmall ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
                    'bg-gray-100 text-gray-500 border border-gray-200'
                )}
                title="Item cancelado"
            >
                <Package className={cn(isSmall ? 'w-2.5 h-2.5' : 'w-3 h-3')} />
                Cancelado
            </div>
        )
    }

    // Active sub-card badge
    return (
        <div
            className={cn(
                'inline-flex items-center gap-1 rounded-full font-medium cursor-default',
                isSmall ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
                'bg-purple-100 text-purple-700 border border-purple-200',
                onClick && 'cursor-pointer hover:opacity-80'
            )}
            onClick={onClick}
            title="Item da viagem"
        >
            <Package className={cn(isSmall ? 'w-2.5 h-2.5' : 'w-3 h-3')} />
            <span>Item</span>
        </div>
    )
}

/**
 * Banner component for sub-card detail pages
 */
interface SubCardParentBannerProps {
    parentId: string
    parentTitle: string
    onNavigate?: () => void
}

export function SubCardParentBanner({
    parentTitle,
    onNavigate
}: SubCardParentBannerProps) {
    return (
        <div className="flex items-center justify-between p-3 rounded-lg border-l-4 bg-purple-50 border-purple-500">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-purple-100">
                    <GitBranch className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                    <p className="text-xs text-gray-500">Este é um item adicional de:</p>
                    <p className="text-sm font-medium text-purple-700">
                        {parentTitle}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-1 rounded-full bg-purple-200 text-purple-700">
                    Valor agrega automaticamente
                </span>
                {onNavigate && (
                    <button
                        onClick={onNavigate}
                        className="text-xs px-3 py-1.5 rounded-md font-medium bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                    >
                        Ver Card Principal
                    </button>
                )}
            </div>
        </div>
    )
}
