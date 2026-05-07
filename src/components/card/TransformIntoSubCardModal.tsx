import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ArrowDownToLine, Loader2, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { useOrg } from '@/contexts/OrgContext'
import { useToast } from '@/contexts/ToastContext'
import { useTransformIntoSubCard, type SubCardCategory } from '@/hooks/useTransformIntoSubCard'
import { cn, buildContactSearchFilter } from '@/lib/utils'

interface ParentCandidate {
    id: string
    titulo: string | null
    pessoa_principal_nome: string | null
    etapa_nome: string | null
    fase: string | null
    valor_display: number | null
    updated_at: string | null
}

interface Props {
    open: boolean
    onClose: () => void
    card: {
        id: string
        titulo?: string | null
        produto?: string | null
        pipeline_id?: string | null
    }
    onLinked?: (parentId: string) => void
}

const formatBRL = (v: number | null | undefined) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

function useEligibleParents(opts: {
    cardId: string
    produto: string | null | undefined
    pipelineId: string | null | undefined
    searchTerm: string
}) {
    const { org } = useOrg()
    const activeOrgId = org?.id
    const term = opts.searchTerm.trim()

    return useQuery({
        queryKey: ['transform-parent-search', activeOrgId, opts.cardId, opts.produto, opts.pipelineId, term],
        enabled: !!activeOrgId && !!opts.produto && !!opts.pipelineId,
        queryFn: async (): Promise<ParentCandidate[]> => {
            if (!activeOrgId) return []

            const buildBase = () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let q = (supabase.from('view_cards_acoes') as any)
                    .select('id, titulo, pessoa_principal_id, pessoa_nome, valor_display, etapa_nome, fase, phase_slug, card_type, sub_card_status, parent_card_id, archived_at, updated_at, produto, pipeline_id, org_id')
                    .eq('org_id', activeOrgId)
                    .eq('produto', opts.produto)
                    .eq('pipeline_id', opts.pipelineId)
                    .eq('card_type', 'standard')
                    .eq('phase_slug', 'pos_venda')
                    .is('parent_card_id', null)
                    .is('sub_card_status', null)
                    .is('archived_at', null)
                    .neq('id', opts.cardId)

                return q
            }

            const queryByContact = async () => {
                if (term.length <= 1) return []
                const filter = buildContactSearchFilter(term)
                const { data: contatos } = await supabase
                    .from('contatos')
                    .select('id')
                    .is('deleted_at', null)
                    .or(filter)
                    .limit(20)
                const ids = (contatos ?? []).map(c => c.id as string)
                if (ids.length === 0) return []
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data } = await buildBase()
                    .in('pessoa_principal_id', ids)
                    .order('updated_at', { ascending: false })
                    .limit(15)
                return (data ?? []) as Array<Record<string, unknown>>
            }

            const queryByTitle = async () => {
                if (term.length <= 1) return []
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data } = await buildBase()
                    .ilike('titulo', `%${term}%`)
                    .order('updated_at', { ascending: false })
                    .limit(15)
                return (data ?? []) as Array<Record<string, unknown>>
            }

            const queryRecent = async () => {
                if (term.length > 1) return []
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data } = await buildBase()
                    .order('updated_at', { ascending: false })
                    .limit(10)
                return (data ?? []) as Array<Record<string, unknown>>
            }

            const [byContact, byTitle, recent] = await Promise.all([
                queryByContact(),
                queryByTitle(),
                queryRecent(),
            ])

            const seen = new Set<string>()
            const out: ParentCandidate[] = []
            for (const row of [...byContact, ...byTitle, ...recent]) {
                const id = row.id as string
                if (seen.has(id)) continue
                seen.add(id)
                out.push({
                    id,
                    titulo: (row.titulo as string) ?? null,
                    pessoa_principal_nome: (row.pessoa_nome as string) ?? null,
                    etapa_nome: (row.etapa_nome as string) ?? null,
                    fase: (row.fase as string) ?? null,
                    valor_display: (row.valor_display as number) ?? null,
                    updated_at: (row.updated_at as string) ?? null,
                })
            }
            return out.slice(0, 15)
        },
        staleTime: 10_000,
    })
}

export default function TransformIntoSubCardModal({ open, onClose, card, onLinked }: Props) {
    const { toast } = useToast()
    const transform = useTransformIntoSubCard()

    const [searchTerm, setSearchTerm] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [selectedParentId, setSelectedParentId] = useState<string | null>(null)
    const [category, setCategory] = useState<SubCardCategory>('change')

    useEffect(() => {
        if (!open) {
            setSearchTerm('')
            setDebouncedSearch('')
            setSelectedParentId(null)
            setCategory('change')
        }
    }, [open])

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchTerm), 250)
        return () => clearTimeout(t)
    }, [searchTerm])

    const { data: candidates = [], isLoading } = useEligibleParents({
        cardId: card.id,
        produto: card.produto ?? null,
        pipelineId: card.pipeline_id ?? null,
        searchTerm: debouncedSearch,
    })

    const selectedParent = useMemo(
        () => candidates.find(c => c.id === selectedParentId) ?? null,
        [candidates, selectedParentId],
    )

    const handleConfirm = async () => {
        if (!selectedParentId) return
        try {
            await transform.mutateAsync({
                cardId: card.id,
                parentId: selectedParentId,
                category,
            })
            toast({
                type: 'success',
                title: 'Vinculado como sub-card',
                description: `Este card agora é mudança de "${selectedParent?.titulo ?? 'card pai'}".`,
            })
            onClose()
            onLinked?.(selectedParentId)
        } catch (err) {
            toast({
                type: 'error',
                title: 'Não consegui vincular',
                description: (err as Error).message || 'Tente novamente.',
            })
        }
    }

    return (
        <Dialog open={open} onOpenChange={v => !v && !transform.isPending && onClose()}>
            <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <ArrowDownToLine className="h-5 w-5 text-purple-600" />
                        Vincular como sub-card
                    </DialogTitle>
                    <p className="text-sm text-slate-500 mt-1">
                        Este card vai virar mudança ou adicional de outro card já em pós-venda. O valor dele soma no card pai quando ele também chegar em pós-venda.
                    </p>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Busca */}
                    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                            Escolha o card principal
                        </label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder="Buscar por contato ou título da viagem em pós-venda..."
                                className="pl-10"
                                disabled={transform.isPending}
                            />
                            {isLoading && (
                                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
                            )}
                        </div>

                        {candidates.length > 0 ? (
                            <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
                                {candidates.map(p => {
                                    const isSelected = p.id === selectedParentId
                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => setSelectedParentId(p.id)}
                                            disabled={transform.isPending}
                                            className={cn(
                                                'w-full text-left rounded-lg border-2 p-3 transition-all',
                                                isSelected
                                                    ? 'border-purple-400 bg-purple-50'
                                                    : 'border-slate-200 bg-white hover:border-purple-200 hover:bg-purple-50/30',
                                            )}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-slate-900 truncate">
                                                        {p.titulo || 'Sem título'}
                                                    </p>
                                                    <p className="text-xs text-slate-600 mt-0.5 truncate">
                                                        {p.pessoa_principal_nome || 'Sem contato'}
                                                        {p.etapa_nome && (
                                                            <>
                                                                <span className="text-slate-300"> · </span>
                                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700">
                                                                    {p.etapa_nome}
                                                                </span>
                                                            </>
                                                        )}
                                                    </p>
                                                </div>
                                                <span className="text-sm font-semibold text-slate-900 shrink-0">
                                                    {formatBRL(p.valor_display)}
                                                </span>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        ) : (
                            !isLoading && (
                                <p className="text-xs text-slate-500 italic">
                                    {debouncedSearch.length > 1
                                        ? 'Nenhum card em pós-venda encontrado com esse termo.'
                                        : 'Nenhum card em pós-venda no momento. Lembrando: o card pai precisa estar em pós-venda.'}
                                </p>
                            )
                        )}
                    </div>

                    {/* Categoria */}
                    {selectedParent && (
                        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                Tipo de vínculo
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setCategory('change')}
                                    disabled={transform.isPending}
                                    className={cn(
                                        'text-left rounded-lg border-2 p-3 transition-all',
                                        category === 'change'
                                            ? 'border-purple-400 bg-purple-50'
                                            : 'border-slate-200 bg-white hover:border-purple-200',
                                    )}
                                >
                                    <p className="text-sm font-medium text-slate-900">Mudança da viagem</p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Cliente quer trocar/alterar algo na viagem original
                                    </p>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCategory('addition')}
                                    disabled={transform.isPending}
                                    className={cn(
                                        'text-left rounded-lg border-2 p-3 transition-all',
                                        category === 'addition'
                                            ? 'border-purple-400 bg-purple-50'
                                            : 'border-slate-200 bg-white hover:border-purple-200',
                                    )}
                                >
                                    <p className="text-sm font-medium text-slate-900">Item adicional</p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Cliente está comprando algo a mais na mesma viagem
                                    </p>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Resumo */}
                    {selectedParent && (
                        <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs text-purple-900 space-y-1">
                            <p className="font-medium">Como vai ficar:</p>
                            <ul className="list-disc list-inside space-y-0.5 ml-1">
                                <li>
                                    Este card (<strong>{card.titulo || 'sem título'}</strong>) vira sub-card de <strong>{selectedParent.titulo}</strong>
                                </li>
                                <li>Aparece uma tarefa de "{category === 'change' ? 'mudança' : 'item adicional'}" no card pai pra resolver</li>
                                <li>Quando este card chegar em pós-venda, o valor dele soma no card pai</li>
                                <li>Você pode desfazer depois ("Virar card principal")</li>
                            </ul>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose} disabled={transform.isPending}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!selectedParentId || transform.isPending}
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                        {transform.isPending ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Vinculando...
                            </>
                        ) : (
                            <>
                                <ArrowDownToLine className="h-4 w-4 mr-2" />
                                Vincular como sub-card
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
