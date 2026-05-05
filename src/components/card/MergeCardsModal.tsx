import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/Input'
import { Loader2, ArrowRight, Combine, AlertTriangle, Search, User, Package, Archive, Inbox } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fundirCards, moverFinancialItems } from '@/hooks/useDuplicateCardDetection'
import { useToast } from '@/contexts/ToastContext'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrg } from '@/contexts/OrgContext'
import { cn, buildContactSearchFilter } from '@/lib/utils'
import { MergeCandidateCard, type MergeCandidate } from './MergeCandidateCard'

interface Props {
    open: boolean
    onClose: () => void
    sourceCardId: string | null
    /** Se null, exibe busca de cards do workspace ativo para o usuário escolher o destino. */
    targetCardId: string | null
    onMerged?: (destinoId: string) => void
}

interface CardSourceInfo {
    id: string
    titulo: string | null
    card_type: string | null
    parent_card_id: string | null
    pessoa_principal_id: string | null
    pessoa_principal_nome: string | null
    numero_venda_monde: string | null
    numeros_venda_monde_count: number
}


interface CardSummary {
    id: string
    titulo: string | null
    valor_final: number | null
    valor_estimado: number | null
    data_viagem_inicio: string | null
    data_viagem_fim: string | null
    items_count: number
    pessoa_principal_nome: string | null
}

interface FinancialItem {
    id: string
    description: string | null
    sale_value: number | null
    supplier_cost: number | null
    fornecedor: string | null
    product_type: string | null
    data_inicio: string | null
    data_fim: string | null
}

const formatBRL = (value: number | null | undefined) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)

const formatDateBR = (iso: string | null) => {
    if (!iso) return '—'
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
}

/** Info base do card origem (tipo, contato, pai, venda Monde) para decidir UX. */
function useCardSourceInfo(cardId: string | null) {
    return useQuery({
        queryKey: ['card-merge-source', cardId],
        enabled: !!cardId,
        queryFn: async (): Promise<CardSourceInfo | null> => {
            if (!cardId) return null
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from('cards') as any)
                .select('id, titulo, card_type, parent_card_id, pessoa_principal_id, produto_data, pessoa_principal:contatos!cards_pessoa_principal_id_fkey(nome, sobrenome)')
                .eq('id', cardId)
                .single()
            if (error || !data) return null
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const contato = (data as any).pessoa_principal as { nome?: string; sobrenome?: string } | null
            const nomeCompleto = contato
                ? [contato.nome, contato.sobrenome].filter(Boolean).join(' ').trim() || null
                : null
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pd = (data as any).produto_data as Record<string, unknown> | null
            const numeroVendaMonde = pd && typeof pd.numero_venda_monde === 'string' ? pd.numero_venda_monde : null
            const histArr = pd && Array.isArray(pd.numeros_venda_monde_historico)
                ? (pd.numeros_venda_monde_historico as unknown[])
                : []
            return {
                id: data.id,
                titulo: data.titulo,
                card_type: data.card_type,
                parent_card_id: data.parent_card_id,
                pessoa_principal_id: data.pessoa_principal_id,
                pessoa_principal_nome: nomeCompleto,
                numero_venda_monde: numeroVendaMonde,
                numeros_venda_monde_count: histArr.length,
            }
        },
    })
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

/** Lista cards abertos candidatos. Busca em paralelo por contato (nome/email/tel) E por título. */
function useCandidateCards({
    sourceCardId,
    sourcePessoaId,
    searchTerm,
}: {
    sourceCardId: string | null
    sourcePessoaId: string | null
    searchTerm: string
}) {
    const { org } = useOrg()
    const activeOrgId = org?.id
    const term = searchTerm.trim()

    return useQuery({
        queryKey: ['card-merge-candidates', activeOrgId, sourceCardId, sourcePessoaId, term],
        enabled: !!activeOrgId && (!!sourcePessoaId || term.length > 1),
        queryFn: async (): Promise<MergeCandidate[]> => {
            if (!activeOrgId) return []

            const buildBaseQuery = () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let q = (supabase.from('view_cards_acoes') as any)
                    .select(VIEW_SELECT)
                    .eq('org_id', activeOrgId)
                    .is('archived_at', null)
                if (sourceCardId) q = q.neq('id', sourceCardId)
                return q
            }

            const hasTerm = term.length > 1

            // ----- Query A: por contato (nome/email/tel) -> cards do(s) contato(s)
            const queryByContact = async (): Promise<ViewRow[]> => {
                let pessoaIds: string[]
                if (hasTerm) {
                    const filter = buildContactSearchFilter(term)
                    const { data: contatos } = await supabase
                        .from('contatos')
                        .select('id')
                        .is('deleted_at', null)
                        .or(filter)
                        .limit(20)
                    pessoaIds = (contatos ?? []).map(c => c.id as string)
                } else if (sourcePessoaId) {
                    pessoaIds = [sourcePessoaId]
                } else {
                    return []
                }
                if (pessoaIds.length === 0) return []
                const { data, error } = await buildBaseQuery()
                    .in('pessoa_principal_id', pessoaIds)
                    .order('updated_at', { ascending: false })
                    .limit(20)
                if (error) {
                    console.warn('[useCandidateCards/contact]', error)
                    return []
                }
                return data ?? []
            }

            // ----- Query B: por título do card (só se tiver termo)
            const queryByTitle = async (): Promise<ViewRow[]> => {
                if (!hasTerm) return []
                const { data, error } = await buildBaseQuery()
                    .ilike('titulo', `%${term}%`)
                    .order('updated_at', { ascending: false })
                    .limit(20)
                if (error) {
                    console.warn('[useCandidateCards/title]', error)
                    return []
                }
                return data ?? []
            }

            const [byContact, byTitle] = await Promise.all([queryByContact(), queryByTitle()])

            // Merge + dedup, calcula match_reason e ordena
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

            // Ordenação: mesmo_contato > contato > titulo > outro
            const reasonRank: Record<MergeCandidate['match_reason'], number> = {
                mesmo_contato: 0,
                contato: 1,
                titulo: 2,
                outro: 3,
            }
            out.sort((a, b) => {
                const r = reasonRank[a.match_reason] - reasonRank[b.match_reason]
                if (r !== 0) return r
                return 0
            })

            return out.slice(0, 25)
        },
        staleTime: 10_000,
    })
}

function useCardSummary(cardId: string | null) {
    return useQuery({
        queryKey: ['card-summary', cardId],
        enabled: !!cardId,
        queryFn: async (): Promise<CardSummary | null> => {
            if (!cardId) return null
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: card, error } = await (supabase.from('cards') as any)
                .select('id, titulo, valor_final, valor_estimado, data_viagem_inicio, data_viagem_fim, pessoa_principal:contatos!cards_pessoa_principal_id_fkey(nome, sobrenome)')
                .eq('id', cardId)
                .single()
            if (error || !card) return null
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { count } = await (supabase.from('card_financial_items') as any)
                .select('id', { count: 'exact', head: true })
                .eq('card_id', cardId)
                .is('archived_at', null)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const contato = (card as any).pessoa_principal as { nome?: string; sobrenome?: string } | null
            const nomeCompleto = contato
                ? [contato.nome, contato.sobrenome].filter(Boolean).join(' ').trim() || null
                : null
            return {
                id: card.id,
                titulo: card.titulo,
                valor_final: card.valor_final,
                valor_estimado: card.valor_estimado,
                data_viagem_inicio: card.data_viagem_inicio,
                data_viagem_fim: card.data_viagem_fim,
                items_count: count ?? 0,
                pessoa_principal_nome: nomeCompleto,
            }
        },
    })
}

/** Lista os card_financial_items (Produto-Vendas) do source para o user escolher o que migrar. */
function useSourceFinancialItems(sourceCardId: string | null) {
    return useQuery({
        queryKey: ['card-financial-items', sourceCardId],
        enabled: !!sourceCardId,
        queryFn: async (): Promise<FinancialItem[]> => {
            if (!sourceCardId) return []
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from('card_financial_items') as any)
                .select('id, description, sale_value, supplier_cost, fornecedor, product_type, data_inicio, data_fim')
                .eq('card_id', sourceCardId)
                .is('archived_at', null)
                .order('created_at', { ascending: true })
            if (error) {
                console.warn('[useSourceFinancialItems]', error)
                return []
            }
            return (data ?? []) as FinancialItem[]
        },
    })
}

type SourceAfterAction = 'archive' | 'keep_open'

export default function MergeCardsModal({
    open,
    onClose,
    sourceCardId,
    targetCardId: initialTargetId,
    onMerged,
}: Props) {
    const { toast } = useToast()
    const queryClient = useQueryClient()
    const [motivo, setMotivo] = useState('')
    const [isMerging, setIsMerging] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [selectedTargetId, setSelectedTargetId] = useState<string | null>(initialTargetId)
    const [autoSelectedFromParent, setAutoSelectedFromParent] = useState(false)
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set())
    const [sourceAction, setSourceAction] = useState<SourceAfterAction>('archive')
    const [userTouchedAction, setUserTouchedAction] = useState(false)
    const [migrateVendaMonde, setMigrateVendaMonde] = useState(false)

    const { data: sourceInfo } = useCardSourceInfo(sourceCardId)

    useEffect(() => {
        if (!open || initialTargetId) return
        if (sourceInfo?.card_type === 'sub_card' && sourceInfo.parent_card_id && !selectedTargetId) {
            setSelectedTargetId(sourceInfo.parent_card_id)
            setAutoSelectedFromParent(true)
        }
    }, [open, sourceInfo, initialTargetId, selectedTargetId])

    useEffect(() => {
        setSelectedTargetId(initialTargetId)
    }, [initialTargetId])

    useEffect(() => {
        if (!open) {
            setSearchTerm('')
            setDebouncedSearch('')
            setSelectedTargetId(initialTargetId)
            setMotivo('')
            setAutoSelectedFromParent(false)
            setSelectedItemIds(new Set())
            setSourceAction('archive')
            setUserTouchedAction(false)
            setMigrateVendaMonde(false)
        }
    }, [open, initialTargetId])

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchTerm), 250)
        return () => clearTimeout(t)
    }, [searchTerm])

    const { data: candidates = [], isLoading: isSearching } = useCandidateCards({
        sourceCardId,
        sourcePessoaId: sourceInfo?.pessoa_principal_id ?? null,
        searchTerm: debouncedSearch,
    })

    const targetCardId = selectedTargetId
    const { data: source, isLoading: loadingSource } = useCardSummary(sourceCardId)
    const { data: target, isLoading: loadingTarget } = useCardSummary(targetCardId)
    const { data: sourceItems = [], isLoading: loadingItems } = useSourceFinancialItems(sourceCardId)

    // Quando os itens carregam, pré-seleciona todos
    useEffect(() => {
        if (sourceItems.length > 0 && selectedItemIds.size === 0 && !userTouchedAction) {
            setSelectedItemIds(new Set(sourceItems.map(i => i.id)))
        }
    }, [sourceItems, selectedItemIds.size, userTouchedAction])

    const allItemsSelected = sourceItems.length > 0 && selectedItemIds.size === sourceItems.length
    const someItemsSelected = selectedItemIds.size > 0 && !allItemsSelected
    const noItemsSelected = sourceItems.length > 0 && selectedItemIds.size === 0

    // Default da ação sobre o source: arquivar se todos itens vão; manter aberto se split
    useEffect(() => {
        if (userTouchedAction) return
        if (sourceItems.length === 0) {
            setSourceAction('archive')
        } else if (allItemsSelected) {
            setSourceAction('archive')
        } else {
            setSourceAction('keep_open')
        }
    }, [allItemsSelected, sourceItems.length, userTouchedAction])

    const toggleItem = (id: string) => {
        setSelectedItemIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const toggleAll = () => {
        if (allItemsSelected) setSelectedItemIds(new Set())
        else setSelectedItemIds(new Set(sourceItems.map(i => i.id)))
    }

    const handleMerge = async () => {
        if (!sourceCardId || !selectedTargetId) return
        setIsMerging(true)
        try {
            const itemsToMove = sourceItems.filter(i => selectedItemIds.has(i.id))
            const movingAllItems = sourceItems.length > 0 && itemsToMove.length === sourceItems.length
            const archiveSource = sourceAction === 'archive'

            // Roteador:
            //   - Move tudo + arquivar  → fundir_cards (transfere itens, passageiros, contatos, atividades, time)
            //   - Caso parcial ou keep_open → mover_financial_items (só move itens) e source segue aberto
            let itemsMoved = 0
            let passengersMoved = 0
            let contatosMoved = 0
            let activitiesMoved = 0
            let sourceArchived = false

            if (movingAllItems && archiveSource) {
                const result = await fundirCards(sourceCardId, selectedTargetId, motivo.trim() || undefined)
                itemsMoved = result.items_moved
                passengersMoved = result.passengers_moved
                contatosMoved = result.contatos_moved
                activitiesMoved = result.activities_moved
                sourceArchived = true
            } else if (itemsToMove.length > 0) {
                const result = await moverFinancialItems(
                    itemsToMove.map(i => i.id),
                    selectedTargetId,
                    migrateVendaMonde,
                )
                itemsMoved = result.items_moved
            }

            // Invalida queries antes de navegar/fechar
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['cards'] }),
                queryClient.invalidateQueries({ queryKey: ['card-detail', selectedTargetId] }),
                queryClient.invalidateQueries({ queryKey: ['card-detail', sourceCardId] }),
                queryClient.invalidateQueries({ queryKey: ['card-summary', selectedTargetId] }),
                queryClient.invalidateQueries({ queryKey: ['card-summary', sourceCardId] }),
                queryClient.invalidateQueries({ queryKey: ['financial-items', selectedTargetId] }),
                queryClient.invalidateQueries({ queryKey: ['financial-items', sourceCardId] }),
                queryClient.invalidateQueries({ queryKey: ['card-financial-items', sourceCardId] }),
                queryClient.invalidateQueries({ queryKey: ['card-financial-items', selectedTargetId] }),
                queryClient.invalidateQueries({ queryKey: ['pipeline'] }),
                queryClient.invalidateQueries({ queryKey: ['duplicate-cards'] }),
            ])

            const destinoTitulo = target?.titulo || 'destino'
            const partes: string[] = []
            if (itemsMoved > 0) partes.push(`${itemsMoved} produto${itemsMoved === 1 ? '' : 's'}`)
            if (passengersMoved > 0) partes.push(`${passengersMoved} viajante${passengersMoved === 1 ? '' : 's'}`)
            if (contatosMoved > 0) partes.push(`${contatosMoved} contato${contatosMoved === 1 ? '' : 's'}`)
            if (activitiesMoved > 0) partes.push(`${activitiesMoved} atividade${activitiesMoved === 1 ? '' : 's'}`)
            const lista = partes.length > 0 ? partes.join(', ') : 'nada'

            const restantes = sourceItems.length - itemsToMove.length
            const sourceFate = sourceArchived
                ? 'O card antigo foi arquivado (recuperável na Lixeira).'
                : restantes > 0
                    ? `O card de origem segue aberto com ${restantes} produto${restantes === 1 ? '' : 's'} restante${restantes === 1 ? '' : 's'}.`
                    : 'O card de origem segue aberto, sem produtos.'

            toast({
                title: `${lista} movidos para "${destinoTitulo}"`,
                description: sourceFate,
                type: 'success',
            })

            setMotivo('')
            onClose()
            onMerged?.(selectedTargetId)
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

    const isSubCard = sourceInfo?.card_type === 'sub_card'
    const sourceContatoNome = sourceInfo?.pessoa_principal_nome
    const canConfirm =
        !!sourceCardId &&
        !!selectedTargetId &&
        !isMerging &&
        // permite confirmar se há itens selecionados OU se source não tem itens (caso fundir tudo metadata)
        (sourceItems.length === 0 || selectedItemIds.size > 0)

    const searchPlaceholder = useMemo(() => {
        if (sourceContatoNome) return `Buscando em "${sourceContatoNome}" — ou digite contato/título...`
        return 'Buscar por contato (nome, email, telefone) ou título da viagem...'
    }, [sourceContatoNome])

    const selectedCandidate = useMemo(
        () => candidates.find(c => c.id === selectedTargetId) ?? null,
        [candidates, selectedTargetId],
    )

    const buttonLabel = useMemo(() => {
        if (sourceItems.length === 0) return 'Agrupar cards'
        if (allItemsSelected) {
            return sourceAction === 'archive' ? 'Mover tudo e arquivar origem' : 'Mover todos os produtos'
        }
        if (someItemsSelected) {
            const n = selectedItemIds.size
            return `Mover ${n} produto${n === 1 ? '' : 's'}`
        }
        return 'Agrupar cards'
    }, [sourceItems.length, allItemsSelected, someItemsSelected, sourceAction, selectedItemIds.size])

    return (
        <Dialog open={open} onOpenChange={v => !v && !isMerging && onClose()}>
            <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <Combine className="h-5 w-5 text-amber-600" />
                        Agrupar Cards
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {isSubCard && autoSelectedFromParent && targetCardId && (
                        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 flex items-center gap-2">
                            <div className="text-xs text-indigo-800">
                                Este é um sub-card. Já pré-selecionamos o <strong>card principal</strong> como destino.
                            </div>
                        </div>
                    )}

                    {/* Seletor de destino */}
                    {!targetCardId && (
                        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                                Escolha o card destino
                            </label>

                            {sourceContatoNome && debouncedSearch.length <= 1 && (
                                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                    <User className="h-3 w-3" />
                                    Mostrando cards abertos de <strong>{sourceContatoNome}</strong>
                                </div>
                            )}

                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    placeholder={searchPlaceholder}
                                    className="pl-10"
                                    autoFocus={!sourceContatoNome}
                                    disabled={isMerging}
                                />
                                {isSearching && (
                                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
                                )}
                            </div>

                            {candidates.length > 0 ? (
                                <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                                    {candidates.map(hit => (
                                        <MergeCandidateCard
                                            key={hit.id}
                                            candidate={hit}
                                            selected={selectedTargetId === hit.id}
                                            searchTerm={debouncedSearch}
                                            onSelect={() => setSelectedTargetId(hit.id)}
                                        />
                                    ))}
                                </div>
                            ) : (
                                !isSearching && (
                                    <p className="text-xs text-slate-500 italic">
                                        {debouncedSearch.length > 1
                                            ? 'Nenhum card encontrado por contato ou título.'
                                            : sourceContatoNome
                                                ? 'Este contato não tem outros cards abertos. Digite contato ou título da viagem acima para buscar.'
                                                : 'Digite pelo menos 2 letras do nome do contato ou do título da viagem.'}
                                    </p>
                                )
                            )}
                        </div>
                    )}

                    {targetCardId && (
                        <>
                            <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
                                {/* Source */}
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                            Origem
                                        </span>
                                    </div>
                                    {loadingSource ? (
                                        <div className="flex items-center justify-center py-4">
                                            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                                        </div>
                                    ) : source ? (
                                        <CardSummaryView summary={source} />
                                    ) : (
                                        <p className="text-xs text-slate-500">Card não encontrado</p>
                                    )}
                                </div>

                                <div className="flex items-center justify-center">
                                    <div className="rounded-full bg-indigo-100 p-2">
                                        <ArrowRight className="h-4 w-4 text-indigo-600" />
                                    </div>
                                </div>

                                {/* Target */}
                                <div className={cn(
                                    'rounded-lg border p-3 space-y-2',
                                    autoSelectedFromParent ? 'border-indigo-300 bg-indigo-50' : 'border-emerald-300 bg-emerald-50',
                                )}>
                                    <div className="flex items-center justify-between">
                                        <span className={cn(
                                            'text-[10px] font-semibold uppercase tracking-wide',
                                            autoSelectedFromParent ? 'text-indigo-700' : 'text-emerald-700',
                                        )}>
                                            {autoSelectedFromParent ? 'Card principal (destino)' : 'Destino'}
                                        </span>
                                        {!initialTargetId && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSelectedTargetId(null)
                                                    setAutoSelectedFromParent(false)
                                                }}
                                                className="text-[10px] text-slate-500 hover:text-slate-700 underline"
                                            >
                                                trocar
                                            </button>
                                        )}
                                    </div>
                                    {loadingTarget ? (
                                        <div className="flex items-center justify-center py-4">
                                            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                                        </div>
                                    ) : target ? (
                                        <CardSummaryView summary={target} />
                                    ) : (
                                        <p className="text-xs text-slate-500">Card não encontrado</p>
                                    )}
                                </div>
                            </div>

                            {/* Avisos sobre características do destino */}
                            {selectedCandidate && (selectedCandidate.is_group_parent || selectedCandidate.card_type === 'sub_card' || selectedCandidate.parent_card_id || selectedCandidate.status_comercial === 'perdido' || selectedCandidate.status_comercial === 'ganho') && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-2">
                                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                                    <div className="text-xs text-amber-900 space-y-1">
                                        <p className="font-medium">Atenção com o destino escolhido:</p>
                                        <ul className="list-disc list-inside space-y-0.5 ml-1">
                                            {selectedCandidate.is_group_parent && (
                                                <li>É um <strong>grupo pai</strong>. Ao mover, este card vira um item dentro do grupo.</li>
                                            )}
                                            {selectedCandidate.card_type === 'sub_card' && (
                                                <li>É um <strong>sub-card</strong> (pedido de mudança). Confirme se faz sentido juntar aqui.</li>
                                            )}
                                            {selectedCandidate.parent_card_id && !selectedCandidate.is_group_parent && selectedCandidate.card_type !== 'sub_card' && (
                                                <li>Já está vinculado a um grupo{selectedCandidate.parent_card_title ? ` ("${selectedCandidate.parent_card_title}")` : ''}.</li>
                                            )}
                                            {selectedCandidate.status_comercial === 'ganho' && (
                                                <li>Está com status <strong>ganho</strong>. O agrupamento vai mexer numa venda já fechada.</li>
                                            )}
                                            {selectedCandidate.status_comercial === 'perdido' && (
                                                <li>Está com status <strong>perdido</strong>. Talvez não seja o destino ideal.</li>
                                            )}
                                        </ul>
                                    </div>
                                </div>
                            )}

                            {/* Lista de itens com checkbox */}
                            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                                            <Package className="h-4 w-4 text-amber-600" />
                                            Quais produtos vão para o destino?
                                        </p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Marque os que devem migrar. Os desmarcados ficam no card de origem.
                                        </p>
                                    </div>
                                    {sourceItems.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={toggleAll}
                                            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium shrink-0"
                                        >
                                            {allItemsSelected ? 'Desmarcar todos' : 'Marcar todos'}
                                        </button>
                                    )}
                                </div>

                                {loadingItems ? (
                                    <div className="flex items-center justify-center py-4">
                                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                                    </div>
                                ) : sourceItems.length === 0 ? (
                                    <p className="text-xs text-slate-500 italic py-1">
                                        Este card não tem produtos cadastrados em Produto - Vendas. Mesmo assim, ao confirmar, contatos, viajantes e histórico migram.
                                    </p>
                                ) : (
                                    <div className="border border-slate-200 rounded-lg max-h-56 overflow-y-auto divide-y divide-slate-100">
                                        {sourceItems.map(item => {
                                            const checked = selectedItemIds.has(item.id)
                                            const dateRange =
                                                item.data_inicio || item.data_fim
                                                    ? [formatDateBR(item.data_inicio), formatDateBR(item.data_fim)].join(' → ')
                                                    : null
                                            return (
                                                <label
                                                    key={item.id}
                                                    className={cn(
                                                        'flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors',
                                                        !checked && 'opacity-60',
                                                    )}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleItem(item.id)}
                                                        disabled={isMerging}
                                                        className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-baseline justify-between gap-2">
                                                            <p className="text-sm font-medium text-slate-900 truncate">
                                                                {item.description || `Produto ${item.product_type || ''}`.trim() || 'Sem descrição'}
                                                            </p>
                                                            <span className="text-xs font-medium text-slate-700 shrink-0">
                                                                {formatBRL(Number(item.sale_value) || 0)}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                                            {item.fornecedor && <span className="truncate">{item.fornecedor}</span>}
                                                            {item.fornecedor && dateRange && <span className="text-slate-300">·</span>}
                                                            {dateRange && <span>{dateRange}</span>}
                                                            {item.product_type && (
                                                                <span className="ml-auto px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 text-[10px] uppercase tracking-wide">
                                                                    {item.product_type}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </label>
                                            )
                                        })}
                                    </div>
                                )}

                                {noItemsSelected && (
                                    <p className="text-xs text-rose-600 mt-1">
                                        Marque pelo menos um produto para mover, ou cancele e use Excluir se quiser apenas arquivar este card.
                                    </p>
                                )}
                            </div>

                            {/* O que fazer com o card de origem */}
                            {sourceItems.length > 0 && (
                                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                                    <p className="text-sm font-semibold text-slate-900">
                                        E o card de origem ({source?.titulo || '...'})?
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <label
                                            className={cn(
                                                'flex items-start gap-2 cursor-pointer rounded-lg border p-3 transition-colors',
                                                sourceAction === 'archive'
                                                    ? 'border-amber-400 bg-amber-50'
                                                    : 'border-slate-200 hover:border-slate-300',
                                                !allItemsSelected && 'opacity-50 cursor-not-allowed',
                                            )}
                                        >
                                            <input
                                                type="radio"
                                                name="source-action"
                                                checked={sourceAction === 'archive'}
                                                onChange={() => {
                                                    setUserTouchedAction(true)
                                                    setSourceAction('archive')
                                                }}
                                                disabled={!allItemsSelected || isMerging}
                                                className="mt-0.5 h-4 w-4 text-amber-600 focus:ring-amber-500"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                                                    <Archive className="h-3.5 w-3.5 text-amber-600" />
                                                    Arquivar este card
                                                </p>
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                    Vai pra Lixeira (recuperável). Recomendado quando todos os produtos migram.
                                                </p>
                                                {!allItemsSelected && (
                                                    <p className="text-[11px] text-rose-600 mt-1">
                                                        Disponível só quando todos os produtos forem movidos.
                                                    </p>
                                                )}
                                            </div>
                                        </label>

                                        <label
                                            className={cn(
                                                'flex items-start gap-2 cursor-pointer rounded-lg border p-3 transition-colors',
                                                sourceAction === 'keep_open'
                                                    ? 'border-emerald-400 bg-emerald-50'
                                                    : 'border-slate-200 hover:border-slate-300',
                                            )}
                                        >
                                            <input
                                                type="radio"
                                                name="source-action"
                                                checked={sourceAction === 'keep_open'}
                                                onChange={() => {
                                                    setUserTouchedAction(true)
                                                    setSourceAction('keep_open')
                                                }}
                                                disabled={isMerging}
                                                className="mt-0.5 h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                                                    <Inbox className="h-3.5 w-3.5 text-emerald-600" />
                                                    Manter aberto
                                                </p>
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                    O card segue ativo. Ideal quando só parte dos produtos migra (vira outra venda).
                                                </p>
                                            </div>
                                        </label>
                                    </div>
                                </div>
                            )}

                            {/* Checkbox: migrar nº de venda Monde quando split */}
                            {sourceItems.length > 0 &&
                                !(allItemsSelected && sourceAction === 'archive') &&
                                (sourceInfo?.numero_venda_monde || (sourceInfo?.numeros_venda_monde_count ?? 0) > 0) && (
                                    <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white p-3 cursor-pointer hover:bg-slate-50">
                                        <input
                                            type="checkbox"
                                            checked={migrateVendaMonde}
                                            onChange={e => setMigrateVendaMonde(e.target.checked)}
                                            disabled={isMerging}
                                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-slate-900">
                                                Levar também o nº da venda Monde
                                                {sourceInfo?.numero_venda_monde && (
                                                    <span className="ml-2 text-xs font-mono px-1.5 py-0.5 bg-slate-100 rounded">
                                                        {sourceInfo.numero_venda_monde}
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                Adiciona ao histórico do card destino. O card de origem mantém o número.
                                            </p>
                                        </div>
                                    </label>
                                )}

                            {/* Aviso geral */}
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                                <div className="text-xs text-amber-900 space-y-1">
                                    <p className="font-medium">Como vai ficar:</p>
                                    <ul className="list-disc list-inside space-y-0.5 ml-1">
                                        {selectedItemIds.size > 0 && (
                                            <li>
                                                <strong>{selectedItemIds.size}</strong> produto{selectedItemIds.size === 1 ? '' : 's'} vão pro destino
                                                {sourceItems.length - selectedItemIds.size > 0 && (
                                                    <> · <strong>{sourceItems.length - selectedItemIds.size}</strong> ficam no origem</>
                                                )}
                                            </li>
                                        )}
                                        {allItemsSelected && sourceAction === 'archive' && (
                                            <>
                                                <li>Passageiros, contatos, atividades e equipe também migram</li>
                                                {(sourceInfo?.numero_venda_monde || (sourceInfo?.numeros_venda_monde_count ?? 0) > 0) && (
                                                    <li>
                                                        Nº da venda Monde
                                                        {sourceInfo?.numero_venda_monde && (
                                                            <> ({sourceInfo.numero_venda_monde})</>
                                                        )}
                                                        {' '}vai pro destino (com histórico)
                                                    </li>
                                                )}
                                                <li>O card de origem é arquivado (recuperável na Lixeira)</li>
                                            </>
                                        )}
                                        {(!allItemsSelected || sourceAction === 'keep_open') && (
                                            <>
                                                <li>O card de origem permanece aberto com o que você não marcou</li>
                                                {migrateVendaMonde && sourceInfo?.numero_venda_monde && (
                                                    <li>Nº da venda Monde ({sourceInfo.numero_venda_monde}) é copiado pro destino (origem mantém)</li>
                                                )}
                                            </>
                                        )}
                                        <li>Valor e receita do destino são recalculados</li>
                                    </ul>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                                    Motivo (opcional)
                                </label>
                                <Textarea
                                    value={motivo}
                                    onChange={e => setMotivo(e.target.value)}
                                    placeholder="Ex: produto ficou na viagem errada, cliente cadastrou duas vezes..."
                                    rows={2}
                                    className="resize-none text-sm"
                                    disabled={isMerging}
                                />
                            </div>
                        </>
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
                                Movendo...
                            </>
                        ) : (
                            <>
                                <Combine className="h-4 w-4 mr-2" />
                                {buttonLabel}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function CardSummaryView({ summary }: { summary: CardSummary }) {
    const dateRange = [formatDateBR(summary.data_viagem_inicio), formatDateBR(summary.data_viagem_fim)].join(' → ')
    const valor = summary.valor_final ?? summary.valor_estimado ?? 0
    return (
        <>
            <p className="text-sm font-medium text-slate-900 truncate">{summary.titulo || 'Sem título'}</p>
            <div className="text-xs text-slate-600 space-y-0.5">
                {summary.pessoa_principal_nome && (
                    <p className="flex items-center gap-1 text-slate-500">
                        <User className="h-3 w-3" />
                        {summary.pessoa_principal_nome}
                    </p>
                )}
                <p>{dateRange}</p>
                <p>
                    <span className="text-slate-400">Produtos:</span>{' '}
                    <span className="font-medium">{summary.items_count}</span>
                </p>
                <p>
                    <span className="text-slate-400">Valor:</span>{' '}
                    <span className="font-medium">{formatBRL(valor)}</span>
                </p>
            </div>
        </>
    )
}
