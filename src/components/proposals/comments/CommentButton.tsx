/**
 * Botão com ícone de balão + badge de contagem (não-resolvidos).
 * Abre o CommentsDrawer no escopo passado.
 *
 * Tamanhos: 'sm' (pra cards/headers) e 'md' (pra sidebar/header de proposta).
 */
import { useState, useMemo } from 'react'
import { MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CommentsDrawer } from './CommentsDrawer'
import {
    type CommentScope,
    type ProposalComment,
    countUnresolvedByScope,
    usePublicComments,
    useProposalComments,
} from '@/hooks/useProposalComments'

type Mode =
    | { kind: 'public'; proposalToken: string }
    | { kind: 'admin'; proposalId: string }

interface Props {
    mode: Mode
    scope: CommentScope
    scopeLabel?: string
    size?: 'sm' | 'md'
    variant?: 'icon' | 'full'
    className?: string
    /** Permite passar lista de comentários já carregada (evita query duplicada) */
    comments?: ProposalComment[]
}

export function CommentButton({
    mode,
    scope,
    scopeLabel,
    size = 'sm',
    variant = 'icon',
    className,
    comments: commentsProp,
}: Props) {
    const [open, setOpen] = useState(false)

    // Carrega só se ninguém passou — evita N queries em listas
    const publicQuery = usePublicComments(
        !commentsProp && mode.kind === 'public' ? mode.proposalToken : undefined
    )
    const adminQuery = useProposalComments(
        !commentsProp && mode.kind === 'admin' ? mode.proposalId : undefined
    )
    const all = commentsProp ?? (mode.kind === 'public' ? publicQuery.data : adminQuery.data)

    const count = useMemo(() => countUnresolvedByScope(all ?? [], scope), [all, scope])

    const iconSize = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'
    const buttonClasses = cn(
        'relative inline-flex items-center gap-1 transition',
        size === 'md'
            ? 'rounded-lg px-3 py-1.5 text-sm font-medium'
            : 'rounded-md px-2 py-1 text-xs font-medium',
        count > 0
            ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            : 'text-slate-500 hover:text-indigo-700 hover:bg-slate-100',
        className
    )

    return (
        <>
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpen(true) }}
                className={buttonClasses}
                title={
                    count > 0
                        ? `${count} comentário${count > 1 ? 's' : ''} pendente${count > 1 ? 's' : ''}`
                        : 'Comentar'
                }
            >
                <MessageCircle className={iconSize} />
                {variant === 'full' && (
                    <span>{count > 0 ? `Comentários (${count})` : 'Comentar'}</span>
                )}
                {variant === 'icon' && count > 0 && (
                    <span className={cn(
                        'inline-flex items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white',
                        size === 'md' ? 'h-4 min-w-4' : 'h-3.5 min-w-3.5'
                    )}>
                        {count}
                    </span>
                )}
            </button>

            <CommentsDrawer
                open={open}
                onClose={() => setOpen(false)}
                mode={mode}
                scope={scope}
                scopeLabel={scopeLabel}
            />
        </>
    )
}
