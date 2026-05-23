/**
 * Drawer lateral pra ler e adicionar comentários numa proposta.
 *
 * Suporta os 3 escopos: proposta inteira, seção, item específico.
 * Usado tanto pelo cliente (modo 'public', via token) quanto pelo consultor
 * (modo 'admin', via auth).
 */
import { useMemo, useState } from 'react'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/textarea'
import { Send, CheckCircle2, RotateCcw, Loader2, MessageCircle, X, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
    type CommentScope,
    type ProposalComment,
    usePublicComments,
    useProposalComments,
    useAddPublicComment,
    useAddAdminComment,
    useToggleResolveComment,
    filterCommentsByScope,
    getStoredClientName,
    setStoredClientName,
} from '@/hooks/useProposalComments'

type CommentMode =
    | { kind: 'public'; proposalToken: string }
    | { kind: 'admin'; proposalId: string }

interface CommentsDrawerProps {
    open: boolean
    onClose: () => void
    mode: CommentMode
    scope: CommentScope
    /** Título amigável do escopo (ex: "Bambu Indah") */
    scopeLabel?: string
}

export function CommentsDrawer({ open, onClose, mode, scope, scopeLabel }: CommentsDrawerProps) {
    const publicQuery = usePublicComments(mode.kind === 'public' ? mode.proposalToken : undefined)
    const adminQuery = useProposalComments(mode.kind === 'admin' ? mode.proposalId : undefined)
    const all = mode.kind === 'public' ? publicQuery.data : adminQuery.data
    const isLoading = mode.kind === 'public' ? publicQuery.isLoading : adminQuery.isLoading

    const addPublic = useAddPublicComment()
    const addAdmin = useAddAdminComment()
    const toggleResolve = useToggleResolveComment()

    const filtered = useMemo(() => filterCommentsByScope(all ?? [], scope), [all, scope])

    // Raízes (sem parent) + replies por parent_id
    const { roots, repliesByParent } = useMemo(() => {
        const roots: ProposalComment[] = []
        const repliesByParent = new Map<string, ProposalComment[]>()
        for (const c of filtered) {
            if (c.parent_id) {
                const arr = repliesByParent.get(c.parent_id) ?? []
                arr.push(c)
                repliesByParent.set(c.parent_id, arr)
            } else {
                roots.push(c)
            }
        }
        return { roots, repliesByParent }
    }, [filtered])

    const [newComment, setNewComment] = useState('')
    const [replyingTo, setReplyingTo] = useState<string | null>(null)
    const [replyContent, setReplyContent] = useState('')

    // Nome do cliente (modo public): vem do localStorage ou pede no submit
    const [clientName, setClientName] = useState(() =>
        mode.kind === 'public' ? getStoredClientName(mode.proposalToken) ?? '' : ''
    )
    const [showNamePrompt, setShowNamePrompt] = useState(false)
    const [pendingContent, setPendingContent] = useState('')

    const isSubmitting = addPublic.isPending || addAdmin.isPending

    const handleSubmitRoot = async () => {
        const content = newComment.trim()
        if (!content) return

        if (mode.kind === 'public') {
            if (!clientName.trim()) {
                setPendingContent(content)
                setShowNamePrompt(true)
                return
            }
            await addPublic.mutateAsync({
                proposalToken: mode.proposalToken,
                content,
                authorName: clientName.trim(),
                scope,
            })
            setStoredClientName(mode.proposalToken, clientName.trim())
        } else {
            await addAdmin.mutateAsync({
                proposalId: mode.proposalId,
                content,
                scope,
            })
        }
        setNewComment('')
        toast.success('Comentário enviado')
    }

    const handleConfirmName = async () => {
        const name = clientName.trim()
        if (!name || mode.kind !== 'public' || !pendingContent) return
        setStoredClientName(mode.proposalToken, name)
        setShowNamePrompt(false)
        await addPublic.mutateAsync({
            proposalToken: mode.proposalToken,
            content: pendingContent,
            authorName: name,
            scope,
        })
        setNewComment('')
        setPendingContent('')
        toast.success('Comentário enviado')
    }

    const handleSubmitReply = async (parentId: string) => {
        const content = replyContent.trim()
        if (!content) return

        if (mode.kind === 'public') {
            if (!clientName.trim()) {
                toast.error('Preencha seu nome no início pra responder')
                return
            }
            await addPublic.mutateAsync({
                proposalToken: mode.proposalToken,
                content,
                authorName: clientName.trim(),
                scope,
                parentId,
            })
        } else {
            await addAdmin.mutateAsync({
                proposalId: mode.proposalId,
                content,
                scope,
                parentId,
            })
        }
        setReplyContent('')
        setReplyingTo(null)
    }

    const handleToggleResolve = (comment: ProposalComment) => {
        toggleResolve.mutate({ commentId: comment.id, resolved: !comment.is_resolved })
    }

    const isAdmin = mode.kind === 'admin'
    const scopeText =
        scope.kind === 'proposal' ? 'Comentários da proposta'
        : scope.kind === 'section' ? `Comentários — ${scopeLabel || 'Seção'}`
        : `Comentários — ${scopeLabel || 'Item'}`

    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="w-full max-w-md p-0 flex flex-col">
                <VisuallyHidden.Root>
                    <SheetTitle>{scopeText}</SheetTitle>
                    <SheetDescription>
                        Adicione ou responda comentários sobre {scope.kind === 'proposal' ? 'a proposta' : scope.kind === 'section' ? 'esta seção' : 'este item'}.
                    </SheetDescription>
                </VisuallyHidden.Root>

                {/* Header */}
                <div className="border-b border-slate-200 px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <MessageCircle className="h-4 w-4 text-indigo-600" />
                        <h3 className="text-sm font-semibold text-slate-900">{scopeText}</h3>
                    </div>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Lista */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-slate-50">
                    {isLoading ? (
                        <div className="text-center py-8">
                            <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                        </div>
                    ) : roots.length === 0 ? (
                        <div className="text-center py-12">
                            <MessageCircle className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                            <p className="text-sm text-slate-600">Nenhum comentário ainda</p>
                            <p className="text-xs text-slate-500 mt-1">
                                {isAdmin
                                    ? 'Quando o cliente comentar, aparece aqui.'
                                    : 'Seja o primeiro a comentar — use o campo abaixo.'}
                            </p>
                        </div>
                    ) : (
                        roots.map((c) => (
                            <CommentBubble
                                key={c.id}
                                comment={c}
                                replies={repliesByParent.get(c.id) ?? []}
                                isAdmin={isAdmin}
                                onToggleResolve={() => handleToggleResolve(c)}
                                onStartReply={() => setReplyingTo(c.id)}
                                replyingTo={replyingTo}
                                replyContent={replyContent}
                                setReplyContent={setReplyContent}
                                onSubmitReply={() => handleSubmitReply(c.id)}
                                onCancelReply={() => { setReplyingTo(null); setReplyContent('') }}
                                isSubmittingReply={isSubmitting}
                            />
                        ))
                    )}
                </div>

                {/* Composer */}
                <div className="border-t border-slate-200 px-5 py-3 bg-white">
                    {/* Cliente: pede nome (1ª vez) */}
                    {mode.kind === 'public' && !clientName && !showNamePrompt && (
                        <div className="mb-2 text-xs text-slate-500">
                            Você comentará pela primeira vez. Vamos perguntar seu nome quando enviar.
                        </div>
                    )}
                    {mode.kind === 'public' && clientName && (
                        <div className="mb-2 text-xs text-slate-500">
                            Comentando como <strong className="text-slate-700">{clientName}</strong>.{' '}
                            <button
                                onClick={() => {
                                    setStoredClientName(mode.proposalToken, '')
                                    setClientName('')
                                }}
                                className="text-indigo-600 hover:underline"
                            >
                                Trocar
                            </button>
                        </div>
                    )}

                    {showNamePrompt && mode.kind === 'public' ? (
                        <div className="space-y-2">
                            <label className="block text-xs font-medium text-slate-700">
                                Como podemos te chamar?
                            </label>
                            <input
                                type="text"
                                value={clientName}
                                onChange={(e) => setClientName(e.target.value)}
                                placeholder="Seu nome"
                                autoFocus
                                className="w-full h-9 px-3 text-sm rounded-md border border-slate-200 bg-white"
                            />
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    onClick={handleConfirmName}
                                    disabled={!clientName.trim() || isSubmitting}
                                    className="flex-1"
                                >
                                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar'}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setShowNamePrompt(false)}>
                                    Cancelar
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <Textarea
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder={isAdmin ? 'Responda ao cliente…' : 'Escreva seu comentário…'}
                                rows={2}
                                className="text-sm resize-none"
                            />
                            <Button
                                size="sm"
                                onClick={handleSubmitRoot}
                                disabled={!newComment.trim() || isSubmitting}
                                className="w-full"
                            >
                                {isSubmitting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <>
                                        <Send className="mr-1.5 h-3.5 w-3.5" />
                                        Enviar
                                    </>
                                )}
                            </Button>
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}

// ============================================================
// Bolha de um comentário (com replies)
// ============================================================

function CommentBubble({
    comment,
    replies,
    isAdmin,
    onToggleResolve,
    onStartReply,
    replyingTo,
    replyContent,
    setReplyContent,
    onSubmitReply,
    onCancelReply,
    isSubmittingReply,
}: {
    comment: ProposalComment
    replies: ProposalComment[]
    isAdmin: boolean
    onToggleResolve: () => void
    onStartReply: () => void
    replyingTo: string | null
    replyContent: string
    setReplyContent: (v: string) => void
    onSubmitReply: () => void
    onCancelReply: () => void
    isSubmittingReply: boolean
}) {
    const isClient = comment.author_type === 'client'
    const isReplyingHere = replyingTo === comment.id

    return (
        <div className={cn(
            'rounded-xl border p-3 bg-white shadow-sm',
            comment.is_resolved ? 'border-slate-200 opacity-70' : 'border-slate-200'
        )}>
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={cn(
                            "text-xs font-semibold",
                            isClient ? "text-indigo-700" : "text-emerald-700"
                        )}>
                            {comment.author_name}
                        </span>
                        <span className={cn(
                            "px-1.5 py-0.5 rounded-full text-[10px] font-medium",
                            isClient ? "bg-indigo-50 text-indigo-700" : "bg-emerald-50 text-emerald-700"
                        )}>
                            {isClient ? 'Cliente' : 'Consultor'}
                        </span>
                        {comment.is_resolved && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                                <Lock className="h-2.5 w-2.5" />
                                Resolvido
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap break-words">
                        {comment.content}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">
                        {new Date(comment.created_at).toLocaleString('pt-BR', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                    </p>
                </div>
            </div>

            {/* Replies */}
            {replies.length > 0 && (
                <div className="mt-3 ml-3 pl-3 border-l-2 border-slate-200 space-y-2">
                    {replies.map((r) => {
                        const rIsClient = r.author_type === 'client'
                        return (
                            <div key={r.id} className="rounded-lg bg-slate-50 p-2">
                                <div className="flex items-center gap-2">
                                    <span className={cn(
                                        "text-xs font-semibold",
                                        rIsClient ? "text-indigo-700" : "text-emerald-700"
                                    )}>
                                        {r.author_name}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                        {new Date(r.created_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <p className="text-sm text-slate-800 mt-0.5 whitespace-pre-wrap break-words">
                                    {r.content}
                                </p>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Ações */}
            <div className="mt-3 flex items-center gap-3 text-xs">
                {!isReplyingHere && (
                    <button
                        onClick={onStartReply}
                        className="text-slate-500 hover:text-indigo-700 font-medium"
                    >
                        Responder
                    </button>
                )}
                {isAdmin && (
                    <button
                        onClick={onToggleResolve}
                        className="inline-flex items-center gap-1 text-slate-500 hover:text-emerald-700 font-medium"
                    >
                        {comment.is_resolved ? (
                            <>
                                <RotateCcw className="h-3 w-3" />
                                Reabrir
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="h-3 w-3" />
                                Marcar resolvido
                            </>
                        )}
                    </button>
                )}
            </div>

            {/* Reply composer inline */}
            {isReplyingHere && (
                <div className="mt-2 space-y-1.5">
                    <Textarea
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        placeholder="Sua resposta…"
                        rows={2}
                        className="text-sm resize-none"
                        autoFocus
                    />
                    <div className="flex gap-1.5">
                        <Button
                            size="sm"
                            onClick={onSubmitReply}
                            disabled={!replyContent.trim() || isSubmittingReply}
                            className="flex-1"
                        >
                            {isSubmittingReply ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Responder'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={onCancelReply}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
