import { GitBranch, Plus, RefreshCw, Link2, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SubCardMode, SubCardStatus } from '@/hooks/useSubCards'

interface SubCardBadgeProps {
    mode: SubCardMode
    status?: SubCardStatus
    parentTitle?: string
    activeCount?: number
    variant?: 'small' | 'normal'
    showLink?: boolean
    onClick?: () => void
}

/**
 * Badge to indicate sub-card status
 *
 * - Orange: Incremental mode (add item)
 * - Blue: Complete mode (replace proposal)
 * - Shows count of active sub-cards on parent cards
 */
export default function SubCardBadge({
    mode,
    status = 'active',
    parentTitle,
    activeCount,
    variant = 'normal',
    showLink = false,
    onClick
}: SubCardBadgeProps) {
    const isIncremental = mode === 'incremental'
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
                title={`${activeCount} alteração(ões) em andamento`}
            >
                <GitBranch className={cn(isSmall ? 'w-2.5 h-2.5' : 'w-3 h-3')} />
                {activeCount}
            </div>
        )
    }

    // Status-based styling
    if (status === 'merged') {
        return (
            <div
                className={cn(
                    'inline-flex items-center gap-1 rounded-full font-medium',
                    isSmall ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
                    'bg-green-100 text-green-700 border border-green-200'
                )}
                title="Alteração concluída"
            >
                <GitBranch className={cn(isSmall ? 'w-2.5 h-2.5' : 'w-3 h-3')} />
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
                title="Alteração cancelada"
            >
                <GitBranch className={cn(isSmall ? 'w-2.5 h-2.5' : 'w-3 h-3')} />
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
                isIncremental
                    ? 'bg-orange-100 text-orange-700 border border-orange-200'
                    : 'bg-blue-100 text-blue-700 border border-blue-200',
                onClick && 'cursor-pointer hover:opacity-80'
            )}
            onClick={onClick}
            title={isIncremental
                ? 'Alteração incremental (valor será somado)'
                : 'Alteração completa (valor substituirá)'
            }
        >
            {isIncremental ? (
                <Plus className={cn(isSmall ? 'w-2.5 h-2.5' : 'w-3 h-3')} />
            ) : (
                <RefreshCw className={cn(isSmall ? 'w-2.5 h-2.5' : 'w-3 h-3')} />
            )}
            <span>
                {isIncremental ? 'Adicional' : 'Revisão'}
            </span>
            {showLink && parentTitle && (
                <>
                    <Link2 className={cn(isSmall ? 'w-2.5 h-2.5' : 'w-3 h-3', 'ml-0.5')} />
                </>
            )}
        </div>
    )
}

/**
 * Banner component for sub-card detail pages
 */
interface SubCardParentBannerProps {
    parentId: string
    parentTitle: string
    mode: SubCardMode
    canMerge?: boolean
    onMerge?: () => void
    onNavigate?: () => void
}

export function SubCardParentBanner({
    parentTitle,
    mode,
    canMerge,
    onMerge,
    onNavigate
}: SubCardParentBannerProps) {
    const isIncremental = mode === 'incremental'

    // When ready to merge, show prominent green CTA
    if (canMerge) {
        return (
            <div className="rounded-lg border-2 border-green-400 bg-green-50 p-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-green-100">
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-green-800">
                                Pronto para concluir alteração
                            </p>
                            <p className="text-xs text-green-600">
                                Os dados serão transferidos para: <span className="font-medium">{parentTitle}</span>
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {onNavigate && (
                            <button
                                onClick={onNavigate}
                                className="text-xs px-3 py-1.5 rounded-md font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
                            >
                                Ver Card Principal
                            </button>
                        )}
                        {onMerge && (
                            <button
                                onClick={onMerge}
                                className="text-xs px-4 py-1.5 rounded-md font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors flex items-center gap-1.5"
                            >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Concluir Alteração
                            </button>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div
            className={cn(
                'flex items-center justify-between p-3 rounded-lg border-l-4',
                isIncremental
                    ? 'bg-orange-50 border-orange-500'
                    : 'bg-blue-50 border-blue-500'
            )}
        >
            <div className="flex items-center gap-3">
                <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center',
                    isIncremental ? 'bg-orange-100' : 'bg-blue-100'
                )}>
                    <GitBranch className={cn(
                        'w-4 h-4',
                        isIncremental ? 'text-orange-600' : 'text-blue-600'
                    )} />
                </div>
                <div>
                    <p className="text-xs text-gray-500">Card de Alteração vinculado a:</p>
                    <p className={cn(
                        'text-sm font-medium',
                        isIncremental ? 'text-orange-700' : 'text-blue-700'
                    )}>
                        {parentTitle}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <span className={cn(
                    'text-xs px-2 py-1 rounded-full',
                    isIncremental
                        ? 'bg-orange-200 text-orange-700'
                        : 'bg-blue-200 text-blue-700'
                )}>
                    {isIncremental ? 'Valor será SOMADO' : 'Valor SUBSTITUIRÁ'}
                </span>
                {onNavigate && (
                    <button
                        onClick={onNavigate}
                        className={cn(
                            'text-xs px-3 py-1.5 rounded-md font-medium transition-colors',
                            isIncremental
                                ? 'bg-orange-600 text-white hover:bg-orange-700'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                        )}
                    >
                        Ver Card Principal
                    </button>
                )}
            </div>
        </div>
    )
}
