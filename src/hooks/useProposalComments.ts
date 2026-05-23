import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'

export type CommentScope =
    | { kind: 'proposal' }
    | { kind: 'section'; sectionId: string }
    | { kind: 'item'; itemId: string }

export interface ProposalComment {
    id: string
    proposal_id: string
    section_id: string | null
    item_id: string | null
    parent_id: string | null
    author_type: 'client' | 'consultor'
    author_name: string
    content: string
    is_resolved: boolean
    resolved_at: string | null
    created_at: string
}

// ============================================================
// Listagem (cliente via token público)
// ============================================================

export function usePublicComments(proposalToken: string | undefined) {
    return useQuery({
        queryKey: ['proposal-comments', 'public', proposalToken],
        queryFn: async (): Promise<ProposalComment[]> => {
            if (!proposalToken) return []
            const { data, error } = await supabase.rpc('get_proposal_comments_by_token', {
                p_token: proposalToken,
            })
            if (error) throw error
            return (data ?? []) as ProposalComment[]
        },
        enabled: !!proposalToken,
        staleTime: 15_000,
    })
}

// ============================================================
// Listagem (consultor autenticado)
// ============================================================

export function useProposalComments(proposalId: string | undefined) {
    return useQuery({
        queryKey: ['proposal-comments', 'admin', proposalId],
        queryFn: async (): Promise<ProposalComment[]> => {
            if (!proposalId) return []
            const { data, error } = await supabase
                .from('proposal_comments')
                .select('id, proposal_id, section_id, item_id, parent_id, author_type, author_name, content, is_resolved, resolved_at, created_at')
                .eq('proposal_id', proposalId)
                .order('created_at', { ascending: true })
            if (error) throw error
            return (data ?? []) as unknown as ProposalComment[]
        },
        enabled: !!proposalId,
        staleTime: 15_000,
    })
}

// ============================================================
// Adicionar comentário (cliente via token)
// ============================================================

interface AddPublicCommentInput {
    proposalToken: string
    content: string
    authorName: string
    scope: CommentScope
    parentId?: string
}

export function useAddPublicComment() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (input: AddPublicCommentInput): Promise<string> => {
            const { proposalToken, content, authorName, scope, parentId } = input
            const { data, error } = await supabase.rpc('add_proposal_comment_by_token', {
                p_token: proposalToken,
                p_content: content,
                p_author_name: authorName,
                p_section_id: scope.kind === 'section' ? scope.sectionId : undefined,
                p_item_id: scope.kind === 'item' ? scope.itemId : undefined,
                p_parent_id: parentId ?? undefined,
            })
            if (error) throw error
            return data as string
        },
        onSuccess: (_id, variables) => {
            qc.invalidateQueries({ queryKey: ['proposal-comments', 'public', variables.proposalToken] })
        },
        onError: (err: Error) => toast.error('Erro ao enviar comentário', { description: err.message }),
    })
}

// ============================================================
// Adicionar comentário (consultor — autenticado)
// ============================================================

interface AddAdminCommentInput {
    proposalId: string
    content: string
    scope: CommentScope
    parentId?: string
}

export function useAddAdminComment() {
    const { user, profile } = useAuth()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (input: AddAdminCommentInput): Promise<string> => {
            const { proposalId, content, scope, parentId } = input
            const { data, error } = await supabase
                .from('proposal_comments')
                .insert({
                    proposal_id: proposalId,
                    section_id: scope.kind === 'section' ? scope.sectionId : null,
                    item_id: scope.kind === 'item' ? scope.itemId : null,
                    parent_id: parentId ?? null,
                    author_type: 'consultor',
                    author_id: user?.id ?? null,
                    author_name: profile?.nome || user?.email || 'Consultor',
                    content: content.trim(),
                    visibility: 'client',
                })
                .select('id')
                .single()
            if (error) throw error
            return (data as { id: string }).id
        },
        onSuccess: (_id, variables) => {
            qc.invalidateQueries({ queryKey: ['proposal-comments', 'admin', variables.proposalId] })
            qc.invalidateQueries({ queryKey: ['proposal-comments', 'public'] })
        },
        onError: (err: Error) => toast.error('Erro ao responder', { description: err.message }),
    })
}

// ============================================================
// Resolver / re-abrir comentário
// ============================================================

export function useToggleResolveComment() {
    const { user } = useAuth()
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ commentId, resolved }: { commentId: string; resolved: boolean }) => {
            const { error } = await supabase
                .from('proposal_comments')
                .update({
                    is_resolved: resolved,
                    resolved_at: resolved ? new Date().toISOString() : null,
                    resolved_by: resolved ? (user?.id ?? null) : null,
                })
                .eq('id', commentId)
            if (error) throw error
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['proposal-comments'] })
            qc.invalidateQueries({ queryKey: ['proposal-unread-counts'] })
        },
        onError: (err: Error) => toast.error('Erro: ' + err.message),
    })
}

// ============================================================
// Contador de não-resolvidos (badge no card de pipeline / lista)
// ============================================================

export function useUnreadCommentsCount(proposalIds: string[]) {
    return useQuery({
        queryKey: ['proposal-unread-counts', proposalIds.slice().sort().join(',')],
        queryFn: async (): Promise<Record<string, number>> => {
            if (!proposalIds.length) return {}
            const { data, error } = await supabase.rpc('proposal_unread_comments_count', {
                p_proposal_ids: proposalIds,
            })
            if (error) throw error
            const map: Record<string, number> = {}
            for (const row of (data ?? []) as Array<{ proposal_id: string; unread_count: number }>) {
                map[row.proposal_id] = Number(row.unread_count) || 0
            }
            return map
        },
        enabled: proposalIds.length > 0,
        staleTime: 30_000,
    })
}

// ============================================================
// LocalStorage helper pra nome do cliente
// ============================================================

const CLIENT_NAME_PREFIX = 'welcomecrm-client-name:'

export function getStoredClientName(proposalToken: string): string | null {
    try {
        return localStorage.getItem(CLIENT_NAME_PREFIX + proposalToken)
    } catch {
        return null
    }
}

export function setStoredClientName(proposalToken: string, name: string): void {
    try {
        localStorage.setItem(CLIENT_NAME_PREFIX + proposalToken, name.trim())
    } catch {
        /* localStorage unavailable */
    }
}

// ============================================================
// Helpers
// ============================================================

/**
 * Filtra comentários por escopo e organiza em árvore (parent → replies).
 * Usado pelo drawer pra mostrar a thread do escopo atual.
 */
export function filterCommentsByScope(
    comments: ProposalComment[],
    scope: CommentScope,
): ProposalComment[] {
    return comments.filter((c) => {
        if (scope.kind === 'proposal') return !c.section_id && !c.item_id
        if (scope.kind === 'section') return c.section_id === scope.sectionId && !c.item_id
        if (scope.kind === 'item') return c.item_id === scope.itemId
        return false
    })
}

/**
 * Conta comentários (raízes + replies) não-resolvidos por escopo. Usado pra
 * mostrar badge no ícone do botão de comentar.
 */
export function countUnresolvedByScope(
    comments: ProposalComment[],
    scope: CommentScope,
): number {
    return filterCommentsByScope(comments, scope).filter((c) => !c.is_resolved).length
}
