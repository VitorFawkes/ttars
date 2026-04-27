import { useState, useMemo } from 'react'
import { X, Search } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useProductContext } from '../../hooks/useProductContext'
import { useFilterOptions } from '../../hooks/useFilterOptions'
import { cn } from '../../lib/utils'
import { TASK_TYPE_CONFIG } from './taskTypeConfig'
import { useCriarAtendimento } from '../../hooks/concierge/useAtendimentoMutations'
import { CATEGORIAS_CONCIERGE, TIPO_LABEL, type TipoConcierge, type CategoriaConcierge } from '../../hooks/concierge/types'

interface CardOption {
    id: string
    titulo: string
    produto: string | null
}

const TYPES: { key: string; label: string }[] = [
    { key: 'tarefa', label: 'Tarefa' },
    { key: 'contato', label: 'Contato' },
    { key: 'email', label: 'Email' },
    { key: 'reuniao', label: 'Reunião' },
    { key: 'enviar_proposta', label: 'Proposta' },
    { key: 'coleta_documentos', label: 'Documentos' },
    { key: 'solicitacao_mudanca', label: 'Mudança' },
    { key: 'envio_presente', label: 'Presente' },
]

const PRIORIDADES: { key: string; label: string }[] = [
    { key: 'baixa', label: 'Baixa' },
    { key: 'media', label: 'Média' },
    { key: 'alta', label: 'Alta' },
]

export function CreateTaskModal({
    open,
    onOpenChange,
    initialCardId,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    initialCardId?: string | null
}) {
    const { profile } = useAuth()
    const { currentProduct } = useProductContext()
    const { data: options } = useFilterOptions()
    const queryClient = useQueryClient()
    const profiles = options?.profiles || []
    const criarAtendimento = useCriarAtendimento()

    const [cardSearch, setCardSearch] = useState('')
    const [cardId, setCardId] = useState<string | null>(initialCardId || null)
    const [cardTitulo, setCardTitulo] = useState<string>('')
    const [tipo, setTipo] = useState<string>('tarefa')
    const [titulo, setTitulo] = useState<string>('')
    const [descricao, setDescricao] = useState<string>('')
    const [dataVencimento, setDataVencimento] = useState<string>('')
    const [prioridade, setPrioridade] = useState<string>('media')
    const [responsavelId, setResponsavelId] = useState<string | null>(profile?.id || null)
    const [isConciergeRequest, setIsConciergeRequest] = useState(false)
    const [conciergeType, setConciergeType] = useState<TipoConcierge | ''>('')
    const [conciergeCategory, setConciergCategory] = useState<CategoriaConcierge | ''>('')

    const resetForm = () => {
        setCardSearch(''); setCardId(null); setCardTitulo('')
        setTitulo(''); setDescricao(''); setDataVencimento('')
        setTipo('tarefa'); setPrioridade('media')
        setIsConciergeRequest(false); setConciergeType(''); setConciergCategory('')
        if (profile?.id) setResponsavelId(profile.id)
    }

    const handleClose = () => {
        resetForm()
        onOpenChange(false)
    }

    const { data: cardResults } = useQuery({
        queryKey: ['create-task-card-search', cardSearch, currentProduct],
        enabled: open && cardSearch.trim().length >= 2 && !cardId,
        queryFn: async () => {
            let q = supabase
                .from('cards')
                .select('id, titulo, produto')
                .ilike('titulo', `%${cardSearch.trim()}%`)
                .limit(10)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (currentProduct) q = q.eq('produto', currentProduct as any)
            const { data, error } = await q
            if (error) throw error
            return (data || []) as CardOption[]
        },
        staleTime: 10000,
    })

    const mutation = useMutation({
        mutationFn: async () => {
            if (!cardId) throw new Error('Selecione um card')
            if (!titulo.trim()) throw new Error('Informe um título')

            if (isConciergeRequest) {
                if (!conciergeType) throw new Error('Selecione o tipo de atendimento')
                if (!conciergeCategory) throw new Error('Selecione a categoria')
                return criarAtendimento.mutateAsync({
                    card_id: cardId,
                    tipo_concierge: conciergeType as TipoConcierge,
                    categoria: conciergeCategory as CategoriaConcierge,
                    source: 'planner_request',
                    titulo: titulo.trim(),
                    descricao: descricao.trim() || undefined,
                    data_vencimento: dataVencimento ? new Date(dataVencimento).toISOString() : undefined,
                    responsavel_id: responsavelId || undefined,
                    prioridade,
                })
            } else {
                const { error } = await supabase.from('tarefas').insert({
                    card_id: cardId,
                    titulo: titulo.trim(),
                    descricao: descricao.trim() || null,
                    tipo,
                    prioridade,
                    responsavel_id: responsavelId,
                    data_vencimento: dataVencimento ? new Date(dataVencimento).toISOString() : null,
                    status: 'pendente',
                    concluida: false,
                    created_by: profile?.id,
                    metadata: { origin: 'manual' },
                })
                if (error) throw error
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
            queryClient.invalidateQueries({ queryKey: ['my-day-tasks'] })
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            queryClient.invalidateQueries({ queryKey: ['concierge'] })
            toast.success(isConciergeRequest ? 'Atendimento concierge criado' : 'Tarefa criada')
            handleClose()
        },
        onError: (err: Error) => {
            toast.error(isConciergeRequest ? 'Erro ao criar atendimento' : 'Erro ao criar tarefa', { description: err.message })
        },
    })

    const filteredProfiles = useMemo(() => profiles, [profiles])

    if (!open) return null

    return (
        <div
            className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={handleClose}
        >
            <div
                className="bg-white rounded-xl border border-slate-200 shadow-lg max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between mb-4">
                    <h3 className="text-base font-semibold text-slate-900 tracking-tight">Nova tarefa</h3>
                    <button
                        onClick={handleClose}
                        className="text-slate-400 hover:text-slate-600"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="space-y-3">
                    {/* Card selector */}
                    <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Card *</label>
                        {cardId ? (
                            <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg">
                                <span className="text-sm text-indigo-900 flex-1 truncate">{cardTitulo}</span>
                                <button
                                    onClick={() => { setCardId(null); setCardTitulo(''); setCardSearch('') }}
                                    className="text-indigo-500 hover:text-indigo-700"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Buscar card pelo título..."
                                        value={cardSearch}
                                        onChange={(e) => setCardSearch(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                                    />
                                </div>
                                {cardResults && cardResults.length > 0 && (
                                    <div className="mt-1 max-h-[160px] overflow-y-auto border border-slate-200 rounded-lg bg-white shadow-sm">
                                        {cardResults.map((c) => (
                                            <button
                                                key={c.id}
                                                onClick={() => { setCardId(c.id); setCardTitulo(c.titulo) }}
                                                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0"
                                            >
                                                {c.titulo}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Tipo */}
                    <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Tipo</label>
                        <div className="flex flex-wrap gap-1.5">
                            {TYPES.map((t) => {
                                const cfg = TASK_TYPE_CONFIG[t.key]
                                const Icon = cfg?.icon
                                const active = tipo === t.key
                                return (
                                    <button
                                        key={t.key}
                                        onClick={() => setTipo(t.key)}
                                        className={cn(
                                            "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-all",
                                            active
                                                ? `${cfg?.bg} ${cfg?.color} border-current/30`
                                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                        )}
                                    >
                                        {Icon && <Icon className="h-3 w-3" />}
                                        {t.label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Título */}
                    <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Título *</label>
                        <input
                            type="text"
                            value={titulo}
                            onChange={(e) => setTitulo(e.target.value)}
                            placeholder="ex: Ligar para o cliente"
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                        />
                    </div>

                    {/* Descrição */}
                    <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Descrição</label>
                        <textarea
                            value={descricao}
                            onChange={(e) => setDescricao(e.target.value)}
                            rows={2}
                            placeholder="Detalhes da tarefa..."
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 resize-none"
                        />
                    </div>

                    {/* Data + Prioridade */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-medium text-slate-600 mb-1 block">Vencimento</label>
                            <input
                                type="datetime-local"
                                value={dataVencimento}
                                onChange={(e) => setDataVencimento(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-600 mb-1 block">Prioridade</label>
                            <div className="flex gap-1">
                                {PRIORIDADES.map((p) => (
                                    <button
                                        key={p.key}
                                        onClick={() => setPrioridade(p.key)}
                                        className={cn(
                                            "flex-1 px-2 py-2 text-xs font-medium rounded-md border transition-all",
                                            prioridade === p.key
                                                ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                        )}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Responsável */}
                    <div>
                        <label className="text-xs font-medium text-slate-600 mb-1 block">Responsável</label>
                        <select
                            value={responsavelId || ''}
                            onChange={(e) => setResponsavelId(e.target.value || null)}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                        >
                            <option value="">(Sem responsável)</option>
                            {filteredProfiles.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.full_name || p.email}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* É demanda de concierge? */}
                    <div className="flex items-center gap-2 py-2">
                        <input
                            type="checkbox"
                            id="isConcierge"
                            checked={isConciergeRequest}
                            onChange={(e) => {
                                setIsConciergeRequest(e.target.checked)
                                if (!e.target.checked) {
                                    setConciergeType('')
                                    setConciergCategory('')
                                }
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <label htmlFor="isConcierge" className="text-xs font-medium text-slate-600 cursor-pointer">
                            É demanda de concierge?
                        </label>
                    </div>

                    {/* Tipo e Categoria — condicional */}
                    {isConciergeRequest && (
                        <div className="grid grid-cols-2 gap-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                            <div>
                                <label className="text-xs font-medium text-slate-600 mb-1 block">Tipo *</label>
                                <select
                                    value={conciergeType}
                                    onChange={(e) => {
                                        setConciergeType(e.target.value as TipoConcierge)
                                        setConciergCategory('')
                                    }}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                                >
                                    <option value="">Selecione...</option>
                                    {Object.entries(TIPO_LABEL).map(([key, val]) => (
                                        <option key={key} value={key}>
                                            {val.emoji} {val.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600 mb-1 block">Categoria *</label>
                                <select
                                    value={conciergeCategory}
                                    onChange={(e) => setConciergCategory(e.target.value as CategoriaConcierge)}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                                    disabled={!conciergeType}
                                >
                                    <option value="">Selecione...</option>
                                    {conciergeType && Object.entries(CATEGORIAS_CONCIERGE)
                                        .filter(([, config]) => config.tipo === conciergeType)
                                        .map(([key, config]) => (
                                            <option key={key} value={key}>
                                                {config.label}
                                            </option>
                                        ))}
                                </select>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            onClick={handleClose}
                            className="px-3 py-2 text-sm font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={() => mutation.mutate()}
                            disabled={!cardId || !titulo.trim() || mutation.isPending || (isConciergeRequest && (!conciergeType || !conciergeCategory))}
                            className="px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {mutation.isPending ? 'Criando...' : isConciergeRequest ? 'Criar atendimento' : 'Criar tarefa'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
