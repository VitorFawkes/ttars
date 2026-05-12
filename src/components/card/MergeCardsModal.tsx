import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/Input'
import { Loader2, Combine, Search, X, Plus, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fundirCardsV2 } from '@/hooks/useDuplicateCardDetection'
import { useToast } from '@/contexts/ToastContext'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrg } from '@/contexts/OrgContext'
import { cn } from '@/lib/utils'
import { MergeCandidateCard, type MergeCandidate } from './MergeCandidateCard'

interface Props {
    open: boolean
    onClose: () => void
    sourceCardId: string | null
    /** Se passado, o card destino fica pré-selecionado e bloqueado nesse id. */
    targetCardId: string | null
    onMerged?: (destinoId: string) => void
}

const VIEW_SELECT = [
    'id', 'titulo', 'pessoa_principal_id', 'pessoa_nome',
    'valor_display', 'valor_final', 'valor_estimado',
    'data_viagem_inicio', 'dias_ate_viagem', 'destinos',
    'etapa_nome', 'fase', 'status_comercial',
    'dono_atual_id', 'dono_atual_nome',
    'sdr_owner_id', 'sdr_nome',
    'vendas_owner_id', 'vendas_nome',
    'pos_owner_id', 'pos_owner_nome',
    'concierge_owner_id', 'concierge_nome',
    'is_group_parent', 'parent_card_id', 'parent_card_title', 'card_type',
    'prods_total', 'tempo_sem_contato', 'archived_at', 'updated_at',
].join(', ')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ViewRow = any

function pickDonoRelevante(row: ViewRow): { nome: string | null; role: MergeCandidate['dono_relevante_role'] } {
    const fase = (row.fase ?? '').toLowerCase()
    if ((fase.includes('pos') || fase.includes('pós')) && row.pos_owner_nome) {
        return { nome: row.pos_owner_nome, role: 'pos' }
    }
    if (row.concierge_nome && (fase.includes('concierge') || fase.includes('viagem'))) {
        return { nome: row.concierge_nome, role: 'concierge' }
    }
    if (row.vendas_nome && (fase.includes('planner') || fase.includes('venda'))) {
        return { nome: row.vendas_nome, role: 'planner' }
    }
    if (row.sdr_nome && (fase.includes('sdr') || fase.includes('lead') || fase.includes('qualif'))) {
        return { nome: row.sdr_nome, role: 'sdr' }
    }
    if (row.dono_atual_nome) return { nome: row.dono_atual_nome, role: null }
    return { nome: row.vendas_nome ?? row.sdr_nome ?? row.pos_owner_nome ?? null, role: null }
}

function rowToCandidate(row: ViewRow, matchReason: MergeCandidate['match_reason']): MergeCandidate {
    const dono = pickDonoRelevante(row)
    return {
        id: row.id,
        titulo: row.titulo,
        valor_display: row.valor_display ?? row.valor_final ?? row.valor_estimado ?? 0,
        pessoa_principal_id: row.pessoa_principal_id,
        pessoa_principal_nome: row.pessoa_nome,
        data_viagem_inicio: row.data_viagem_inicio,
        dias_ate_viagem: row.dias_ate_viagem,
        destinos: row.destinos,
        etapa_nome: row.etapa_nome,
        fase: row.fase,
        dono_relevante_nome: dono.nome,
        dono_relevante_role: dono.role,
        status_comercial: row.status_comercial,
        is_group_parent: row.is_group_parent === true,
        parent_card_id: row.parent_card_id,
        parent_card_title: row.parent_card_title,
        card_type: row.card_type,
        prods_total: Number(row.prods_total ?? 0),
        tempo_sem_contato: row.tempo_sem_contato,
        archived_at: row.archived_at,
        match_reason: matchReason,
    }
}

/** Carrega 1 card via view_cards_acoes pelo id. */
function useCardFromView(cardId: string | null) {
    return useQuery({
        queryKey: ['card-merge-view', cardId],
        enabled: !!cardId,
        queryFn: async (): Promise<MergeCandidate | null> => {
            if (!cardId) return null
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from('view_cards_acoes') as any)
                .select(VIEW_SELECT)
                .eq('id', cardId)
                .single()
            if (error || !data) return null
            return rowToCandidate(data, 'mesmo_contato')
        },
    })
}

/** Busca candidatos por contato OU título, paralelo. */
function useSearchCandidates({
    searchTerm,
    excludeIds,
    sourcePessoaId,
}: {
    searchTerm: string
    excludeIds: string[]
    sourcePessoaId: string | null
}) {
    const { org } = useOrg()
    const activeOrgId = org?.id
    const term = searchTerm.trim()
    const hasTerm = term.length > 1

    return useQuery({
        queryKey: ['card-merge-search', activeOrgId, term, excludeIds.join(','), sourcePessoaId],
        enabled: !!activeOrgId && (hasTerm || !!sourcePessoaId),
        queryFn: async (): Promise<MergeCandidate[]> => {
            if (!activeOrgId) return []

            const buildBase = () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let q = (supabase.from('view_cards_acoes') as any)
                    .select(VIEW_SELECT)
                    .eq('org_id', activeOrgId)
                    .is('archived_at', null)
                if (excludeIds.length > 0) {
                    q = q.not('id', 'in', `(${excludeIds.join(',')})`)
                }
                return q
            }

            // Query A: por contato
            const queryByContact = async (): Promise<ViewRow[]> => {
                let pessoaIds: string[]
                if (hasTerm) {
                    const { data: contatos } = await (supabase.rpc as any)('search_contatos', {
                        p_term: term,
                        p_limit: 20,
                    })
                    pessoaIds = ((contatos ?? []) as Array<{ id: string }>).map(c => c.id)
                } else if (sourcePessoaId) {
                    pessoaIds = [sourcePessoaId]
                } else {
                    return []
                }
                if (pessoaIds.length === 0) return []
                const { data } = await buildBase()
                    .in('pessoa_principal_id', pessoaIds)
                    .order('updated_at', { ascending: false })
                    .limit(20)
                return data ?? []
            }

            // Query B: por título (só com termo)
            const queryByTitle = async (): Promise<ViewRow[]> => {
                if (!hasTerm) return []
                const { data } = await buildBase()
                    .ilike('titulo', `%${term}%`)
                    .order('updated_at', { ascending: false })
                    .limit(20)
                return data ?? []
            }

            const [byContact, byTitle] = await Promise.all([queryByContact(), queryByTitle()])

            const seen = new Set<string>()
            const out: MergeCandidate[] = []
            for (const row of byContact) {
                if (seen.has(row.id)) continue
                seen.add(row.id)
                const reason: MergeCandidate['match_reason'] = !hasTerm
                    ? 'mesmo_contato'
                    : sourcePessoaId && row.pessoa_principal_id === sourcePessoaId
                        ? 'mesmo_contato'
                        : 'contato'
                out.push(rowToCandidate(row, reason))
            }
            for (const row of byTitle) {
                if (seen.has(row.id)) continue
                seen.add(row.id)
                out.push(rowToCandidate(row, 'titulo'))
            }
            const reasonRank: Record<MergeCandidate['match_reason'], number> = {
                mesmo_contato: 0, contato: 1, titulo: 2, outro: 3,
            }
            out.sort((a, b) => reasonRank[a.match_reason] - reasonRank[b.match_reason])
            return out.slice(0, 20)
        },
        staleTime: 10_000,
    })
}

const formatBRL = (value: number | null | undefined) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)

const formatDateBRShort = (iso: string | null) => {
    if (!iso) return null
    const dateOnly = iso.slice(0, 10)
    const [y, m, d] = dateOnly.split('-')
    if (!y || !m || !d) return null
    return `${d}/${m}`
}

interface PendingTask {
    id: string
    titulo: string
    data_vencimento: string | null
    card_id: string
    card_titulo: string | null
}

/** Carrega tarefas pendentes (não concluídas, não deletadas) das origens. */
function usePendingTasks(cardIds: string[]) {
    return useQuery({
        queryKey: ['merge-tasks', cardIds.sort().join(',')],
        enabled: cardIds.length > 0,
        queryFn: async (): Promise<PendingTask[]> => {
            if (cardIds.length === 0) return []
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from('tarefas') as any)
                .select('id, titulo, data_vencimento, card_id, card:cards!inner(titulo)')
                .in('card_id', cardIds)
                .is('deleted_at', null)
                .eq('concluida', false)
                .order('data_vencimento', { ascending: true, nullsFirst: false })
            if (error) {
                console.warn('[usePendingTasks]', error)
                return []
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (data ?? []).map((t: any) => ({
                id: t.id,
                titulo: t.titulo,
                data_vencimento: t.data_vencimento,
                card_id: t.card_id,
                card_titulo: t.card?.titulo ?? null,
            }))
        },
    })
}

interface MondeNumber {
    numero: string
    card_id: string
    card_titulo: string | null
    is_current: boolean
}

/** Carrega números de venda Monde (atual + histórico) das origens. */
function useMondeNumbers(cardIds: string[]) {
    return useQuery({
        queryKey: ['merge-monde', cardIds.sort().join(',')],
        enabled: cardIds.length > 0,
        queryFn: async (): Promise<MondeNumber[]> => {
            if (cardIds.length === 0) return []
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from('cards') as any)
                .select('id, titulo, produto_data')
                .in('id', cardIds)
            if (error) {
                console.warn('[useMondeNumbers]', error)
                return []
            }
            const out: MondeNumber[] = []
            const seen = new Set<string>()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const card of (data ?? []) as any[]) {
                const pd = (card.produto_data ?? {}) as Record<string, unknown>
                const atual = typeof pd.numero_venda_monde === 'string' ? pd.numero_venda_monde : null
                const hist = Array.isArray(pd.numeros_venda_monde_historico) ? pd.numeros_venda_monde_historico : []
                if (atual && !seen.has(`${card.id}:${atual}`)) {
                    out.push({ numero: atual, card_id: card.id, card_titulo: card.titulo, is_current: true })
                    seen.add(`${card.id}:${atual}`)
                }
                for (const entry of hist) {
                    if (entry && typeof entry === 'object') {
                        const num = (entry as Record<string, unknown>).numero
                        if (typeof num === 'string' && num && !seen.has(`${card.id}:${num}`)) {
                            out.push({ numero: num, card_id: card.id, card_titulo: card.titulo, is_current: false })
                            seen.add(`${card.id}:${num}`)
                        }
                    }
                }
            }
            return out
        },
    })
}

export default function MergeCardsModal({
    open,
    onClose,
    sourceCardId,
    targetCardId: lockedTargetId,
    onMerged,
}: Props) {
    const { toast } = useToast()
    const queryClient = useQueryClient()

    // Cards no "carrinho" de fusão. Primeiro item adicionado vira destino default.
    const [selectedCards, setSelectedCards] = useState<MergeCandidate[]>([])
    const [destinoId, setDestinoId] = useState<string | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [migrateTasks, setMigrateTasks] = useState(true)
    const [migrateVendaMonde, setMigrateVendaMonde] = useState(true)
    const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
    const [selectedMondeNumbers, setSelectedMondeNumbers] = useState<Set<string>>(new Set())
    const [tasksAutoSeeded, setTasksAutoSeeded] = useState(false)
    const [mondeAutoSeeded, setMondeAutoSeeded] = useState(false)
    const [showTasksList, setShowTasksList] = useState(false)
    const [showMondeList, setShowMondeList] = useState(false)
    const [motivo, setMotivo] = useState('')
    const [isMerging, setIsMerging] = useState(false)
    const [subCardAutoSelected, setSubCardAutoSelected] = useState(false)

    // Sementes: card-fonte (sempre adicionado) + lockedTarget (se passado)
    const { data: sourceCard } = useCardFromView(sourceCardId)
    const { data: lockedTargetCard } = useCardFromView(lockedTargetId)
    // Se source é sub-card, auto-carregar pai pra usar como destino default
    const subCardParentId = sourceCard?.card_type === 'sub_card' ? sourceCard?.parent_card_id ?? null : null
    const { data: subCardParentCard } = useCardFromView(subCardParentId)

    // Reset ao abrir/fechar
    useEffect(() => {
        if (!open) {
            setSelectedCards([])
            setDestinoId(null)
            setSearchTerm('')
            setDebouncedSearch('')
            setMigrateTasks(true)
            setMigrateVendaMonde(true)
            setSelectedTaskIds(new Set())
            setSelectedMondeNumbers(new Set())
            setTasksAutoSeeded(false)
            setMondeAutoSeeded(false)
            setShowTasksList(false)
            setShowMondeList(false)
            setMotivo('')
            setIsMerging(false)
            setSubCardAutoSelected(false)
        }
    }, [open])

    // Auto-adiciona source + lockedTarget (ou pai do sub-card) quando abre.
    useEffect(() => {
        if (!open) return
        if (selectedCards.length > 0) return
        const seeds: MergeCandidate[] = []
        if (sourceCard) seeds.push(sourceCard)
        // Se source é sub-card, adiciona o pai como destino auto-detectado
        if (subCardParentCard && subCardParentCard.id !== sourceCard?.id) {
            seeds.push(subCardParentCard)
        }
        // lockedTarget tem prioridade sobre auto-detect
        if (lockedTargetCard && lockedTargetCard.id !== sourceCard?.id && lockedTargetCard.id !== subCardParentCard?.id) {
            seeds.push(lockedTargetCard)
        }
        if (seeds.length > 0) {
            setSelectedCards(seeds)
            // Destino default: lockedTarget > pai do sub-card > source
            const defaultDest = lockedTargetCard?.id ?? subCardParentCard?.id ?? sourceCard?.id ?? null
            setDestinoId(defaultDest)
            if (subCardParentCard && !lockedTargetCard) {
                setSubCardAutoSelected(true)
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, sourceCard?.id, lockedTargetCard?.id, subCardParentCard?.id])

    // Debounce
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchTerm), 250)
        return () => clearTimeout(t)
    }, [searchTerm])

    const selectedIds = useMemo(() => selectedCards.map(c => c.id), [selectedCards])
    const sourcePessoaId = sourceCard?.pessoa_principal_id ?? null

    const { data: searchResults = [], isLoading: isSearching } = useSearchCandidates({
        searchTerm: debouncedSearch,
        excludeIds: selectedIds,
        sourcePessoaId,
    })

    const addCard = (card: MergeCandidate) => {
        setSelectedCards(prev => {
            if (prev.find(c => c.id === card.id)) return prev
            return [...prev, card]
        })
        if (!destinoId) setDestinoId(card.id)
        setSearchTerm('')
    }

    const removeCard = (cardId: string) => {
        if (lockedTargetId === cardId) return
        setSelectedCards(prev => prev.filter(c => c.id !== cardId))
        if (destinoId === cardId) {
            const remaining = selectedCards.filter(c => c.id !== cardId)
            setDestinoId(remaining[0]?.id ?? null)
        }
    }

    const destinoCard = useMemo(
        () => selectedCards.find(c => c.id === destinoId) ?? null,
        [selectedCards, destinoId],
    )
    const origens = useMemo(
        () => selectedCards.filter(c => c.id !== destinoId),
        [selectedCards, destinoId],
    )

    // Totais agregados
    const totalProdutosOrigens = origens.reduce((s, c) => s + (c.prods_total ?? 0), 0)
    const totalValorOrigens = origens.reduce((s, c) => s + (c.valor_display ?? 0), 0)

    // Carrega tarefas pendentes e números Monde das origens
    const origensIds = useMemo(() => origens.map(o => o.id), [origens])
    const { data: pendingTasks = [] } = usePendingTasks(origensIds)
    const { data: mondeNumbers = [] } = useMondeNumbers(origensIds)

    // Auto-seed: ao primeiro carregar tarefas/Mondes, marca todas
    useEffect(() => {
        if (pendingTasks.length > 0 && !tasksAutoSeeded) {
            setSelectedTaskIds(new Set(pendingTasks.map(t => t.id)))
            setTasksAutoSeeded(true)
        }
    }, [pendingTasks, tasksAutoSeeded])
    useEffect(() => {
        if (mondeNumbers.length > 0 && !mondeAutoSeeded) {
            setSelectedMondeNumbers(new Set(mondeNumbers.map(n => n.numero)))
            setMondeAutoSeeded(true)
        }
    }, [mondeNumbers, mondeAutoSeeded])

    // Reseta o auto-seed quando origens mudam (entrar/sair da lista)
    useEffect(() => {
        setTasksAutoSeeded(false)
        setMondeAutoSeeded(false)
        // limpa seleções que apontam para tasks/Mondes que não pertencem mais a nenhuma origem
        setSelectedTaskIds(prev => {
            const ids = new Set(pendingTasks.map(t => t.id))
            return new Set([...prev].filter(id => ids.has(id)))
        })
        setSelectedMondeNumbers(prev => {
            const nums = new Set(mondeNumbers.map(n => n.numero))
            return new Set([...prev].filter(n => nums.has(n)))
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [origensIds.join(',')])

    const toggleTaskMaster = (next: boolean) => {
        setMigrateTasks(next)
        if (next) {
            setSelectedTaskIds(new Set(pendingTasks.map(t => t.id)))
        } else {
            setSelectedTaskIds(new Set())
        }
    }
    const toggleMondeMaster = (next: boolean) => {
        setMigrateVendaMonde(next)
        if (next) {
            setSelectedMondeNumbers(new Set(mondeNumbers.map(n => n.numero)))
        } else {
            setSelectedMondeNumbers(new Set())
        }
    }

    const allTasksSelected = pendingTasks.length > 0 && selectedTaskIds.size === pendingTasks.length
    const noTasksSelected = pendingTasks.length > 0 && selectedTaskIds.size === 0
    const allMondeSelected = mondeNumbers.length > 0 && selectedMondeNumbers.size === mondeNumbers.length
    const noMondeSelected = mondeNumbers.length > 0 && selectedMondeNumbers.size === 0

    // Sincroniza master com seleção individual (estado intermediário)
    useEffect(() => {
        if (pendingTasks.length === 0) return
        if (noTasksSelected && migrateTasks) setMigrateTasks(false)
        else if (!noTasksSelected && !migrateTasks) setMigrateTasks(true)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTaskIds, pendingTasks.length])
    useEffect(() => {
        if (mondeNumbers.length === 0) return
        if (noMondeSelected && migrateVendaMonde) setMigrateVendaMonde(false)
        else if (!noMondeSelected && !migrateVendaMonde) setMigrateVendaMonde(true)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedMondeNumbers, mondeNumbers.length])

    const canConfirm = !isMerging && selectedCards.length >= 2 && !!destinoId && origens.length >= 1

    const handleMerge = async () => {
        if (!destinoId || origens.length === 0) return
        setIsMerging(true)
        try {
            // Calcular taskIds e mondeNumbers a passar:
            // - se migrateTasks=false: passa null (RPC cancela tudo)
            // - se todas selecionadas: passa null (RPC migra tudo, mais simples)
            // - se subset: passa array
            let taskIds: string[] | null = null
            if (migrateTasks && pendingTasks.length > 0 && !allTasksSelected) {
                taskIds = [...selectedTaskIds]
            }
            let mondeNums: string[] | null = null
            if (migrateVendaMonde && mondeNumbers.length > 0 && !allMondeSelected) {
                mondeNums = [...selectedMondeNumbers]
            }

            const result = await fundirCardsV2({
                origens: origens.map(o => o.id),
                destino: destinoId,
                migrateTasks,
                migrateVendaMonde,
                taskIds,
                vendaMondeNumbers: mondeNums,
                motivo: motivo.trim() || undefined,
            })

            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['cards'] }),
                queryClient.invalidateQueries({ queryKey: ['card-detail', destinoId] }),
                queryClient.invalidateQueries({ queryKey: ['pipeline'] }),
                queryClient.invalidateQueries({ queryKey: ['duplicate-cards'] }),
                ...origens.map(o =>
                    queryClient.invalidateQueries({ queryKey: ['card-detail', o.id] }),
                ),
            ])

            const partes: string[] = []
            if (result.items_moved > 0) partes.push(`${result.items_moved} produto${result.items_moved === 1 ? '' : 's'}`)
            if (result.passengers_moved > 0) partes.push(`${result.passengers_moved} viajante${result.passengers_moved === 1 ? '' : 's'}`)
            if (result.tasks_moved > 0) partes.push(`${result.tasks_moved} tarefa${result.tasks_moved === 1 ? '' : 's'}`)
            if (result.contatos_moved > 0) partes.push(`${result.contatos_moved} contato${result.contatos_moved === 1 ? '' : 's'}`)
            if (result.activities_moved > 0) partes.push(`${result.activities_moved} item${result.activities_moved === 1 ? '' : 's'} de histórico`)
            const lista = partes.length > 0 ? partes.join(', ') : 'nada'

            toast({
                title: `${origens.length} card${origens.length === 1 ? '' : 's'} agrupado${origens.length === 1 ? '' : 's'} em "${destinoCard?.titulo ?? 'destino'}"`,
                description: `${lista}. Cards de origem foram arquivados (recuperáveis na Lixeira).`,
                type: 'success',
            })

            onClose()
            onMerged?.(destinoId)
        } catch (err) {
            console.error('[MergeCardsModal]', err)
            toast({
                title: 'Erro ao agrupar cards',
                description: (err as Error).message || 'Tente novamente.',
                type: 'error',
            })
        } finally {
            setIsMerging(false)
        }
    }

    const searchPlaceholder = sourceCard?.pessoa_principal_nome
        ? `Buscar por contato ou título da viagem... (sugerindo "${sourceCard.pessoa_principal_nome}")`
        : 'Buscar por contato (nome, email, telefone) ou título da viagem...'

    return (
        <Dialog open={open} onOpenChange={v => !v && !isMerging && onClose()}>
            <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <Combine className="h-5 w-5 text-amber-600" />
                        Agrupar Cards
                    </DialogTitle>
                    <p className="text-sm text-slate-500 mt-1">
                        Junte 2 ou mais cards em um só. Escolha o card destino e o que migrar.
                    </p>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Banner sub-card */}
                    {subCardAutoSelected && subCardParentCard && (
                        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 flex items-start gap-2">
                            <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                            <div className="text-xs text-indigo-800">
                                Este card é um <strong>sub-card</strong> (pedido de mudança). Já marcamos o card principal <strong>"{subCardParentCard.titulo}"</strong> como destino.
                            </div>
                        </div>
                    )}

                    {/* Cards selecionados */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                                Cards a juntar ({selectedCards.length})
                            </label>
                            {selectedCards.length >= 2 && (
                                <span className="text-[11px] text-slate-500">
                                    Marque qual será o <strong>destino</strong> (recebe tudo)
                                </span>
                            )}
                        </div>

                        {selectedCards.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
                                Adicione pelo menos 2 cards abaixo para agrupar.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {selectedCards.map(card => {
                                    const isDestino = card.id === destinoId
                                    const isLocked = lockedTargetId === card.id
                                    return (
                                        <div
                                            key={card.id}
                                            className={cn(
                                                'rounded-lg border-2 p-3 transition-all',
                                                isDestino
                                                    ? 'border-emerald-400 bg-emerald-50'
                                                    : 'border-slate-200 bg-white',
                                            )}
                                        >
                                            <div className="flex items-start gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setDestinoId(card.id)}
                                                    disabled={isMerging}
                                                    className="shrink-0 mt-0.5"
                                                    title={isDestino ? 'Este é o destino' : 'Marcar como destino'}
                                                >
                                                    <span className={cn(
                                                        'block w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
                                                        isDestino
                                                            ? 'border-emerald-500 bg-emerald-500'
                                                            : 'border-slate-300 bg-white hover:border-emerald-400',
                                                    )}>
                                                        {isDestino && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                                                    </span>
                                                </button>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-baseline justify-between gap-2">
                                                        <p className="text-sm font-medium text-slate-900 truncate">
                                                            {card.titulo || 'Sem título'}
                                                        </p>
                                                        <span className="text-sm font-semibold text-slate-900 shrink-0">
                                                            {formatBRL(card.valor_display)}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-600 mt-0.5 truncate">
                                                        {card.pessoa_principal_nome || 'Sem contato'}
                                                        {card.etapa_nome && (
                                                            <>
                                                                <span className="text-slate-300"> · </span>
                                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700">
                                                                    {card.etapa_nome}
                                                                </span>
                                                            </>
                                                        )}
                                                        <span className="text-slate-300"> · </span>
                                                        {card.prods_total} produto{card.prods_total === 1 ? '' : 's'}
                                                    </p>
                                                    <p className="text-[11px] mt-1">
                                                        {isDestino ? (
                                                            <span className="text-emerald-700 font-medium">⤓ Destino — vai receber o conteúdo dos outros</span>
                                                        ) : (
                                                            <span className="text-slate-500">↗ Origem — será arquivada após mover</span>
                                                        )}
                                                    </p>
                                                </div>
                                                {!isLocked && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeCard(card.id)}
                                                        disabled={isMerging}
                                                        className="shrink-0 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                                        title="Remover do agrupamento"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    {/* Adicionar mais cards */}
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 flex items-center gap-1.5">
                            <Plus className="w-3.5 h-3.5" />
                            Adicionar outro card
                        </label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder={searchPlaceholder}
                                className="pl-10"
                                disabled={isMerging}
                            />
                            {isSearching && (
                                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
                            )}
                        </div>

                        {searchResults.length > 0 ? (
                            <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                                {searchResults.map(hit => (
                                    <MergeCandidateCard
                                        key={hit.id}
                                        candidate={hit}
                                        selected={false}
                                        searchTerm={debouncedSearch}
                                        onSelect={() => addCard(hit)}
                                    />
                                ))}
                            </div>
                        ) : (
                            !isSearching && debouncedSearch.length > 1 && (
                                <p className="text-xs text-slate-500 italic">
                                    Nenhum card encontrado por contato ou título.
                                </p>
                            )
                        )}
                        {!isSearching && debouncedSearch.length <= 1 && selectedCards.length < 2 && (
                            <p className="text-xs text-slate-500 italic">
                                Digite pelo menos 2 letras do nome do contato ou do título da viagem.
                            </p>
                        )}
                    </div>

                    {/* Toggles do que migrar */}
                    {selectedCards.length >= 2 && destinoCard && (
                        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                            <div>
                                <p className="text-sm font-semibold text-slate-900">
                                    O que vai para "{destinoCard.titulo || 'destino'}"
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Conteúdo das origens é movido para o destino. Marque os opcionais.
                                </p>
                            </div>

                            {/* Sempre migra */}
                            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-2.5">
                                <p className="text-xs font-medium text-emerald-800 mb-1">Sempre vai (não dá pra desmarcar):</p>
                                <ul className="text-xs text-emerald-700 list-disc list-inside space-y-0.5">
                                    <li>Produtos vendidos ({totalProdutosOrigens} ao todo) e viajantes</li>
                                    <li>Contatos e equipe</li>
                                    <li>Histórico e mensagens</li>
                                    <li>Anexos</li>
                                </ul>
                            </div>

                            {/* Opcionais com granularidade */}
                            <div className="space-y-2">
                                {/* TAREFAS */}
                                <div className={cn(
                                    'rounded-lg border transition-colors',
                                    selectedTaskIds.size > 0 ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-200',
                                )}>
                                    <div className="flex items-start gap-2.5 p-3">
                                        <input
                                            type="checkbox"
                                            checked={migrateTasks && selectedTaskIds.size > 0}
                                            ref={el => { if (el) el.indeterminate = selectedTaskIds.size > 0 && !allTasksSelected }}
                                            onChange={e => toggleTaskMaster(e.target.checked)}
                                            disabled={isMerging || pendingTasks.length === 0}
                                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-sm font-medium text-slate-900">
                                                    Puxar tarefas pendentes
                                                    {pendingTasks.length > 0 && (
                                                        <span className="ml-2 text-xs text-slate-500 font-normal">
                                                            ({selectedTaskIds.size} de {pendingTasks.length} marcadas)
                                                        </span>
                                                    )}
                                                </p>
                                                {pendingTasks.length > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowTasksList(v => !v)}
                                                        className="text-[11px] text-indigo-600 hover:text-indigo-700 font-medium shrink-0"
                                                    >
                                                        {showTasksList ? 'Ocultar' : 'Escolher quais'}
                                                    </button>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                {pendingTasks.length === 0
                                                    ? 'Origens não têm tarefas pendentes.'
                                                    : selectedTaskIds.size === 0
                                                        ? 'Tarefas serão canceladas (não migram).'
                                                        : selectedTaskIds.size === pendingTasks.length
                                                            ? 'Todas vão pro destino e continuam ativas.'
                                                            : `${pendingTasks.length - selectedTaskIds.size} desmarcada${pendingTasks.length - selectedTaskIds.size === 1 ? '' : 's'} ${pendingTasks.length - selectedTaskIds.size === 1 ? 'será cancelada' : 'serão canceladas'}.`}
                                            </p>
                                        </div>
                                    </div>
                                    {showTasksList && pendingTasks.length > 0 && (
                                        <div className="border-t border-slate-200 bg-white px-3 py-2 space-y-1 max-h-56 overflow-y-auto">
                                            {pendingTasks.map(task => {
                                                const checked = selectedTaskIds.has(task.id)
                                                const venc = formatDateBRShort(task.data_vencimento)
                                                return (
                                                    <label
                                                        key={task.id}
                                                        className="flex items-start gap-2.5 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer text-sm"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => {
                                                                setSelectedTaskIds(prev => {
                                                                    const next = new Set(prev)
                                                                    if (next.has(task.id)) next.delete(task.id)
                                                                    else next.add(task.id)
                                                                    return next
                                                                })
                                                            }}
                                                            disabled={isMerging}
                                                            className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                        />
                                                        <div className="flex-1 min-w-0">
                                                            <p className={cn('text-sm truncate', !checked && 'text-slate-400 line-through')}>
                                                                {task.titulo}
                                                            </p>
                                                            <p className="text-[11px] text-slate-500 truncate">
                                                                {task.card_titulo || 'Card sem título'}
                                                                {venc && <> · vence {venc}</>}
                                                            </p>
                                                        </div>
                                                    </label>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* VENDAS MONDE */}
                                <div className={cn(
                                    'rounded-lg border transition-colors',
                                    selectedMondeNumbers.size > 0 ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-200',
                                )}>
                                    <div className="flex items-start gap-2.5 p-3">
                                        <input
                                            type="checkbox"
                                            checked={migrateVendaMonde && selectedMondeNumbers.size > 0}
                                            ref={el => { if (el) el.indeterminate = selectedMondeNumbers.size > 0 && !allMondeSelected }}
                                            onChange={e => toggleMondeMaster(e.target.checked)}
                                            disabled={isMerging || mondeNumbers.length === 0}
                                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-sm font-medium text-slate-900">
                                                    Puxar números de venda do Monde
                                                    {mondeNumbers.length > 0 && (
                                                        <span className="ml-2 text-xs text-slate-500 font-normal">
                                                            ({selectedMondeNumbers.size} de {mondeNumbers.length})
                                                        </span>
                                                    )}
                                                </p>
                                                {mondeNumbers.length > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowMondeList(v => !v)}
                                                        className="text-[11px] text-indigo-600 hover:text-indigo-700 font-medium shrink-0"
                                                    >
                                                        {showMondeList ? 'Ocultar' : 'Escolher quais'}
                                                    </button>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                {mondeNumbers.length === 0
                                                    ? 'Origens não têm números de venda Monde.'
                                                    : selectedMondeNumbers.size === 0
                                                        ? 'Números ficam só nas origens (arquivadas).'
                                                        : selectedMondeNumbers.size === mondeNumbers.length
                                                            ? 'Todos vão pro histórico do destino.'
                                                            : `${selectedMondeNumbers.size} marcado${selectedMondeNumbers.size === 1 ? '' : 's'} pro destino. O resto fica nas origens.`}
                                            </p>
                                        </div>
                                    </div>
                                    {showMondeList && mondeNumbers.length > 0 && (
                                        <div className="border-t border-slate-200 bg-white px-3 py-2 space-y-1 max-h-56 overflow-y-auto">
                                            {mondeNumbers.map(item => {
                                                const checked = selectedMondeNumbers.has(item.numero)
                                                return (
                                                    <label
                                                        key={`${item.card_id}:${item.numero}`}
                                                        className="flex items-start gap-2.5 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer text-sm"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => {
                                                                setSelectedMondeNumbers(prev => {
                                                                    const next = new Set(prev)
                                                                    if (next.has(item.numero)) next.delete(item.numero)
                                                                    else next.add(item.numero)
                                                                    return next
                                                                })
                                                            }}
                                                            disabled={isMerging}
                                                            className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                        />
                                                        <div className="flex-1 min-w-0">
                                                            <p className={cn(
                                                                'text-sm font-mono',
                                                                !checked && 'text-slate-400 line-through',
                                                            )}>
                                                                {item.numero}
                                                                {item.is_current && (
                                                                    <span className="ml-2 text-[10px] font-sans font-medium uppercase text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded">atual</span>
                                                                )}
                                                            </p>
                                                            <p className="text-[11px] text-slate-500 truncate">
                                                                {item.card_titulo || 'Card sem título'}
                                                            </p>
                                                        </div>
                                                    </label>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Resumo final */}
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                                <p className="font-medium">Como vai ficar:</p>
                                <ul className="list-disc list-inside space-y-0.5 ml-1">
                                    <li>
                                        Destino <strong>{destinoCard.titulo || 'sem título'}</strong> recebe {totalProdutosOrigens} produto{totalProdutosOrigens === 1 ? '' : 's'} ({formatBRL(totalValorOrigens)} adicionais)
                                    </li>
                                    <li>
                                        {origens.length} card{origens.length === 1 ? '' : 's'} de origem {origens.length === 1 ? 'é arquivado' : 'são arquivados'} (recuperáveis na Lixeira)
                                    </li>
                                    <li>Valor e receita do destino são recalculados</li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* Motivo */}
                    {selectedCards.length >= 2 && (
                        <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1.5">
                                Motivo (opcional)
                            </label>
                            <Textarea
                                value={motivo}
                                onChange={e => setMotivo(e.target.value)}
                                placeholder="Ex: cliente cadastrou duas vezes, mesmo grupo de família..."
                                rows={2}
                                className="resize-none text-sm"
                                disabled={isMerging}
                            />
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose} disabled={isMerging}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleMerge}
                        disabled={!canConfirm}
                        className="bg-amber-600 hover:bg-amber-700 text-white"
                    >
                        {isMerging ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Agrupando...
                            </>
                        ) : (
                            <>
                                <Combine className="h-4 w-4 mr-2" />
                                {selectedCards.length >= 2
                                    ? `Agrupar ${origens.length + 1} cards em 1`
                                    : 'Agrupar cards'}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
