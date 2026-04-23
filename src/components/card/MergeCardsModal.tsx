import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/Input'
import { Loader2, ArrowRight, Combine, AlertTriangle, Search, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fundirCards } from '@/hooks/useDuplicateCardDetection'
import { useToast } from '@/contexts/ToastContext'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrg } from '@/contexts/OrgContext'
import { cn, buildContactSearchFilter } from '@/lib/utils'

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
}

interface CardCandidate {
    id: string
    titulo: string | null
    produto: string | null
    data_viagem_inicio: string | null
    data_viagem_fim: string | null
    valor_final: number | null
    valor_estimado: number | null
    pessoa_principal_id: string | null
    pessoa_principal_nome: string | null
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

const formatBRL = (value: number | null | undefined) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)

const formatDateBR = (iso: string | null) => {
    if (!iso) return '—'
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
}

/** Info base do card origem (tipo, contato, pai) para decidir UX de pré-seleção. */
function useCardSourceInfo(cardId: string | null) {
    return useQuery({
        queryKey: ['card-merge-source', cardId],
        enabled: !!cardId,
        queryFn: async (): Promise<CardSourceInfo | null> => {
            if (!cardId) return null
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from('cards') as any)
                .select('id, titulo, card_type, parent_card_id, pessoa_principal_id, pessoa_principal:contatos!cards_pessoa_principal_id_fkey(nome, sobrenome)')
                .eq('id', cardId)
                .single()
            if (error || !data) return null
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const contato = (data as any).pessoa_principal as { nome?: string; sobrenome?: string } | null
            const nomeCompleto = contato
                ? [contato.nome, contato.sobrenome].filter(Boolean).join(' ').trim() || null
                : null
            return {
                id: data.id,
                titulo: data.titulo,
                card_type: data.card_type,
                parent_card_id: data.parent_card_id,
                pessoa_principal_id: data.pessoa_principal_id,
                pessoa_principal_nome: nomeCompleto,
            }
        },
    })
}

/** Lista cards abertos candidatos para agrupamento (default: mesmo contato; ou busca por nome). */
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
        queryFn: async (): Promise<CardCandidate[]> => {
            if (!activeOrgId) return []

            const baseSelect =
                'id, titulo, produto, data_viagem_inicio, data_viagem_fim, valor_final, valor_estimado, pessoa_principal_id, pessoa_principal:contatos!cards_pessoa_principal_id_fkey(nome, sobrenome)'

            let pessoaIds: string[] | null = null

            if (term.length > 1) {
                // Buscar contatos pelo nome/telefone/email e depois cards daquela pessoa
                const filter = buildContactSearchFilter(term)
                const { data: contatos } = await supabase
                    .from('contatos')
                    .select('id')
                    .is('deleted_at', null)
                    .or(filter)
                    .limit(20)
                pessoaIds = (contatos ?? []).map(c => c.id as string)
                if (pessoaIds.length === 0) return []
            } else if (sourcePessoaId) {
                pessoaIds = [sourcePessoaId]
            } else {
                return []
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let q = (supabase.from('cards') as any)
                .select(baseSelect)
                .eq('org_id', activeOrgId)
                .is('deleted_at', null)
                .is('archived_at', null)
                .in('pessoa_principal_id', pessoaIds)
                .order('updated_at', { ascending: false })
                .limit(12)
            if (sourceCardId) q = q.neq('id', sourceCardId)

            const { data, error } = await q
            if (error) {
                console.warn('[useCandidateCards]', error)
                return []
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (data ?? []).map((c: any) => {
                const contato = c.pessoa_principal as { nome?: string; sobrenome?: string } | null
                const nomeCompleto = contato
                    ? [contato.nome, contato.sobrenome].filter(Boolean).join(' ').trim() || null
                    : null
                return {
                    id: c.id,
                    titulo: c.titulo,
                    produto: c.produto,
                    data_viagem_inicio: c.data_viagem_inicio,
                    data_viagem_fim: c.data_viagem_fim,
                    valor_final: c.valor_final,
                    valor_estimado: c.valor_estimado,
                    pessoa_principal_id: c.pessoa_principal_id,
                    pessoa_principal_nome: nomeCompleto,
                } as CardCandidate
            })
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

    const { data: sourceInfo } = useCardSourceInfo(sourceCardId)

    // Quando é sub-card com pai, pré-seleciona o pai como destino automaticamente
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

    const handleMerge = async () => {
        if (!sourceCardId || !selectedTargetId) return
        setIsMerging(true)
        try {
            const result = await fundirCards(sourceCardId, selectedTargetId, motivo.trim() || undefined)
            toast({
                title: 'Cards agrupados com sucesso',
                description: `${result.items_moved} produto(s) e ${result.contatos_moved} contato(s) movidos.`,
                type: 'success',
            })
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['card-detail', selectedTargetId] })
            queryClient.invalidateQueries({ queryKey: ['card-detail', sourceCardId] })
            queryClient.invalidateQueries({ queryKey: ['financial-items', selectedTargetId] })
            queryClient.invalidateQueries({ queryKey: ['financial-items', sourceCardId] })
            queryClient.invalidateQueries({ queryKey: ['pipeline'] })
            queryClient.invalidateQueries({ queryKey: ['duplicate-cards'] })
            onMerged?.(selectedTargetId)
            setMotivo('')
            onClose()
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

    const canMerge = !!sourceCardId && !!selectedTargetId && !isMerging

    const isSubCard = sourceInfo?.card_type === 'sub_card'
    const sourceContatoNome = sourceInfo?.pessoa_principal_nome

    const searchPlaceholder = useMemo(() => {
        if (sourceContatoNome) return `Buscando em "${sourceContatoNome}" — ou digite outro nome...`
        return 'Buscar pelo nome do contato principal...'
    }, [sourceContatoNome])

    return (
        <Dialog open={open} onOpenChange={v => !v && !isMerging && onClose()}>
            <DialogContent className="sm:max-w-[640px]">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <Combine className="h-5 w-5 text-amber-600" />
                        Agrupar Cards
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-xs text-amber-800 space-y-1">
                            <p className="font-medium">O que vai acontecer:</p>
                            <ul className="list-disc list-inside space-y-0.5 ml-1">
                                <li>Todos os produtos (Produto - Vendas) do card origem vão para o destino</li>
                                <li>Passageiros, contatos e atividades também migram</li>
                                <li>O card origem é arquivado (pode ser recuperado na Lixeira)</li>
                                <li>Valor e receita do destino são recalculados automaticamente</li>
                            </ul>
                        </div>
                    </div>

                    {isSubCard && autoSelectedFromParent && targetCardId && (
                        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 flex items-center gap-2">
                            <div className="text-xs text-indigo-800">
                                Este é um sub-card. Já pré-selecionamos o <strong>card principal</strong> como destino.
                            </div>
                        </div>
                    )}

                    {/* Target selector (when no target pre-selected or user clicked "trocar") */}
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
                                <div className="border border-slate-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-slate-100">
                                    {candidates.map(hit => {
                                        const dateRange = [formatDateBR(hit.data_viagem_inicio), formatDateBR(hit.data_viagem_fim)].join(' → ')
                                        const valor = hit.valor_final ?? hit.valor_estimado ?? 0
                                        const showContato =
                                            hit.pessoa_principal_id !== sourceInfo?.pessoa_principal_id && hit.pessoa_principal_nome
                                        return (
                                            <button
                                                key={hit.id}
                                                type="button"
                                                onClick={() => setSelectedTargetId(hit.id)}
                                                className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors"
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-sm font-medium text-slate-900 truncate">
                                                        {hit.titulo || 'Sem título'}
                                                    </p>
                                                    <span className="text-xs text-slate-500 shrink-0">{formatBRL(valor)}</span>
                                                </div>
                                                <p className="text-xs text-slate-500 flex items-center gap-2">
                                                    {showContato && (
                                                        <span className="flex items-center gap-0.5">
                                                            <User className="h-3 w-3" />
                                                            {hit.pessoa_principal_nome}
                                                        </span>
                                                    )}
                                                    {showContato && <span className="text-slate-300">·</span>}
                                                    <span>{dateRange}</span>
                                                </p>
                                            </button>
                                        )
                                    })}
                                </div>
                            ) : (
                                !isSearching && (
                                    <p className="text-xs text-slate-500 italic">
                                        {debouncedSearch.length > 1
                                            ? 'Nenhum card encontrado para este contato.'
                                            : sourceContatoNome
                                                ? 'Este contato não tem outros cards abertos. Digite o nome de outro contato acima para buscar.'
                                                : 'Digite pelo menos 2 letras do nome do contato principal.'}
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
                                            Origem (será arquivado)
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
                                            {autoSelectedFromParent ? 'Card principal (destino)' : 'Destino (ficará com tudo)'}
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

                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                                    Motivo do agrupamento (opcional)
                                </label>
                                <Textarea
                                    value={motivo}
                                    onChange={e => setMotivo(e.target.value)}
                                    placeholder="Ex: mesma viagem, contato cadastrou duas vezes..."
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
                        disabled={!canMerge}
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
                                Agrupar cards
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
