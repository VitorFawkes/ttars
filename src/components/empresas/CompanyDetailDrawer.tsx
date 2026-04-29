import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { X, Building2, Pencil, ExternalLink, Loader2, Trophy, XCircle, Inbox } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useUpdateEmpresa, type Empresa } from '../../hooks/useEmpresas'
import EmpresaPessoasSection from '../card/EmpresaPessoasSection'

interface CompanyDetailDrawerProps {
    empresa: Empresa
    onClose: () => void
}

interface CardRow {
    id: string
    titulo: string | null
    status_comercial: string | null
    pipeline_stage_id: string | null
    created_at: string | null
    updated_at: string | null
    valor_estimado: number | null
}

function useEmpresaCards(empresaId: string) {
    return useQuery<CardRow[]>({
        queryKey: ['empresa-cards', empresaId],
        staleTime: 30 * 1000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('cards')
                .select('id, titulo, status_comercial, pipeline_stage_id, created_at, updated_at, valor_estimado')
                .eq('pessoa_principal_id', empresaId)
                .eq('produto', 'CORP')
                .is('deleted_at', null)
                .order('updated_at', { ascending: false })
                .limit(50)
            if (error) throw error
            return (data ?? []) as CardRow[]
        },
    })
}

function statusBadge(status: string | null) {
    if (status === 'ganho') return { label: 'Ganho', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Trophy }
    if (status === 'perdido') return { label: 'Perdido', cls: 'bg-rose-50 text-rose-700 border-rose-200', icon: XCircle }
    return { label: 'Aberto', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: Inbox }
}

export default function CompanyDetailDrawer({ empresa, onClose }: CompanyDetailDrawerProps) {
    const navigate = useNavigate()
    const [editing, setEditing] = useState(false)
    const [nome, setNome] = useState(empresa.nome)
    const [obs, setObs] = useState(empresa.observacoes ?? '')
    const updateMut = useUpdateEmpresa()
    const { data: cards, isLoading: cardsLoading } = useEmpresaCards(empresa.id)

    const handleSave = async () => {
        await updateMut.mutateAsync({
            id: empresa.id,
            nome: nome.trim(),
            observacoes: obs.trim() || null,
        })
        setEditing(false)
    }

    return (
        <div className="fixed inset-0 z-40 flex justify-end">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full max-w-xl h-full overflow-y-auto shadow-2xl border-l border-slate-200">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-start justify-between gap-3 z-10">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                            <Building2 className="w-5 h-5 text-purple-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                            {editing ? (
                                <input
                                    type="text"
                                    value={nome}
                                    onChange={(e) => setNome(e.target.value)}
                                    className="w-full text-lg font-semibold text-slate-900 tracking-tight border-b border-indigo-500 focus:outline-none pb-0.5"
                                />
                            ) : (
                                <h2 className="text-lg font-semibold text-slate-900 tracking-tight truncate">
                                    {empresa.nome}
                                </h2>
                            )}
                            <p className="text-xs text-slate-500 mt-0.5">
                                {empresa.pessoas_count} {empresa.pessoas_count === 1 ? 'pessoa cadastrada' : 'pessoas cadastradas'} ·{' '}
                                {empresa.cards_abertos} {empresa.cards_abertos === 1 ? 'atendimento aberto' : 'atendimentos abertos'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {!editing ? (
                            <button
                                onClick={() => setEditing(true)}
                                className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-50"
                                title="Editar"
                            >
                                <Pencil className="w-4 h-4" />
                            </button>
                        ) : (
                            <button
                                onClick={handleSave}
                                disabled={updateMut.isPending || !nome.trim()}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50"
                            >
                                {updateMut.isPending ? 'Salvando...' : 'Salvar'}
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-5">
                    {/* Observações */}
                    <section>
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                            Observações
                        </h3>
                        {editing ? (
                            <textarea
                                value={obs}
                                onChange={(e) => setObs(e.target.value)}
                                rows={3}
                                placeholder="Notas internas sobre a empresa..."
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        ) : empresa.observacoes ? (
                            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{empresa.observacoes}</p>
                        ) : (
                            <p className="text-xs text-slate-400 italic">Sem observações cadastradas.</p>
                        )}
                    </section>

                    {/* Pessoas vinculadas — reusa o componente do card */}
                    <section className="bg-white rounded-lg border border-slate-200 shadow-sm p-3">
                        <EmpresaPessoasSection empresaId={empresa.id} empresaNome={empresa.nome} />
                    </section>

                    {/* Atendimentos */}
                    <section>
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                            Atendimentos {cards && cards.length > 0 && `· ${cards.length}`}
                        </h3>
                        {cardsLoading ? (
                            <div className="flex items-center justify-center py-6 text-sm text-slate-400">
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                Carregando...
                            </div>
                        ) : !cards || cards.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">Nenhum atendimento ainda.</p>
                        ) : (
                            <ul className="space-y-1.5">
                                {cards.map((c) => {
                                    const badge = statusBadge(c.status_comercial)
                                    const Icon = badge.icon
                                    return (
                                        <li key={c.id}>
                                            <button
                                                onClick={() => navigate(`/cards/${c.id}`)}
                                                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors text-left"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-medium text-slate-800 truncate">
                                                        {c.titulo || '(sem título)'}
                                                    </p>
                                                    <p className="text-[10px] text-slate-500 mt-0.5">
                                                        {c.updated_at && `Atualizado ${new Date(c.updated_at).toLocaleDateString('pt-BR')}`}
                                                    </p>
                                                </div>
                                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${badge.cls}`}>
                                                    <Icon className="w-3 h-3" />
                                                    {badge.label}
                                                </span>
                                                <ExternalLink className="w-3 h-3 text-slate-300 shrink-0" />
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </section>
                </div>
            </div>
        </div>
    )
}
