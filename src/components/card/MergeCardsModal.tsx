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
import { cn, buildContactSearchFilter } from '@/lib/utils'
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
    const [motivo, setMotivo] = useState('')
    const [isMerging, setIsMerging] = useState(false)

    // Sementes: card-fonte (sempre adicionado) + lockedTarget (se passado)
    const { data: sourceCard } = useCardFromView(sourceCardId)
    const { data: lockedTargetCard } = useCardFromView(lockedTargetId)

    // Reset ao abrir/fechar
    useEffect(() => {
        if (!open) {
            setSelectedCards([])
            setDestinoId(null)
            setSearchTerm('')
            setDebouncedSearch('')
            setMigrateTasks(true)
            setMigrateVendaMonde(true)
            setMotivo('')
            setIsMerging(false)
        }
    }, [open])

    // Auto-adiciona source + lockedTarget quando abre. Destino default = lockedTarget se houver, senão source.
    useEffect(() => {
        if (!open) return
        if (selectedCards.length > 0) return
        const seeds: MergeCandidate[] = []
        if (sourceCard) seeds.push(sourceCard)
        if (lockedTargetCard && lockedTargetCard.id !== sourceCard?.id) seeds.push(lockedTargetCard)
        if (seeds.length > 0) {
            setSelectedCards(seeds)
            setDestinoId(lockedTargetCard?.id ?? sourceCard?.id ?? null)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, sourceCard?.id, lockedTargetCard?.id])

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

    const canConfirm = !isMerging && selectedCards.length >= 2 && !!destinoId && origens.length >= 1

    const handleMerge = async () => {
        if (!destinoId || origens.length === 0) return
        setIsMerging(true)
        try {
            const result = await fundirCardsV2({
                origens: origens.map(o => o.id),
                destino: destinoId,
                migrateTasks,
                migrateVendaMonde,
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

                            {/* Opcionais */}
                            <div className="space-y-2">
                                <label className={cn(
                                    'flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors',
                                    migrateTasks ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:border-slate-300',
                                )}>
                                    <input
                                        type="checkbox"
                                        checked={migrateTasks}
                                        onChange={e => setMigrateTasks(e.target.checked)}
                                        disabled={isMerging}
                                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-900">Puxar tarefas pendentes</p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {migrateTasks
                                                ? 'Tarefas das origens vão pro destino e continuam ativas.'
                                                : 'Tarefas das origens serão canceladas (não migram).'}
                                        </p>
                                    </div>
                                </label>

                                <label className={cn(
                                    'flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors',
                                    migrateVendaMonde ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:border-slate-300',
                                )}>
                                    <input
                                        type="checkbox"
                                        checked={migrateVendaMonde}
                                        onChange={e => setMigrateVendaMonde(e.target.checked)}
                                        disabled={isMerging}
                                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-900">Puxar números de venda do Monde</p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {migrateVendaMonde
                                                ? 'Números de venda Monde de cada origem entram no histórico do destino.'
                                                : 'Números de venda Monde ficam só nas origens (que serão arquivadas).'}
                                        </p>
                                    </div>
                                </label>
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
