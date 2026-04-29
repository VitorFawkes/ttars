import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Building2, Search, Plus, Loader2, X, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useOrg } from '../../contexts/OrgContext'
import { useVincularContatoEmpresa } from '../../hooks/useEmpresaPessoas'

interface LinkPersonToCompanyBannerProps {
    contatoId: string
    contatoNome: string
}

interface EmpresaOption {
    id: string
    nome: string
    sobrenome: string | null
}

export default function LinkPersonToCompanyBanner({ contatoId, contatoNome }: LinkPersonToCompanyBannerProps) {
    const [open, setOpen] = useState(false)

    return (
        <>
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 mb-2">
                <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-4 h-4 text-amber-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-amber-900">
                            Esse atendimento ainda não está vinculado a uma empresa
                        </p>
                        <p className="text-[11px] text-amber-800 mt-0.5 leading-snug">
                            Esse contato veio do WhatsApp como pessoa solta. Vincule {contatoNome} a uma empresa cliente
                            pra que futuras mensagens dela caiam direto no card da empresa correta.
                        </p>
                        <button
                            onClick={() => setOpen(true)}
                            className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-medium shadow-sm"
                        >
                            <Building2 className="w-3 h-3" />
                            Vincular à empresa
                            <ChevronRight className="w-3 h-3" />
                        </button>
                    </div>
                </div>
            </div>

            {open && (
                <SelectCompanyModal
                    contatoId={contatoId}
                    contatoNome={contatoNome}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    )
}

interface SelectCompanyModalProps {
    contatoId: string
    contatoNome: string
    onClose: () => void
}

function SelectCompanyModal({ contatoId, contatoNome, onClose }: SelectCompanyModalProps) {
    const { org } = useOrg()
    const [query, setQuery] = useState('')
    const [creatingNew, setCreatingNew] = useState(false)
    const [novaEmpresaNome, setNovaEmpresaNome] = useState('')

    const { data: empresas, isLoading } = useQuery<EmpresaOption[]>({
        queryKey: ['empresas-list', org?.id],
        enabled: !!org?.id,
        staleTime: 30 * 1000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('contatos')
                .select('id, nome, sobrenome')
                .eq('org_id', org!.id)
                .eq('tipo_contato', 'empresa')
                .is('deleted_at', null)
                .order('nome', { ascending: true })
                .limit(200)
            if (error) throw error
            return (data ?? []) as EmpresaOption[]
        },
    })

    const filtered = useMemo(() => {
        const list = empresas ?? []
        if (!query.trim()) return list.slice(0, 50)
        const q = query.toLowerCase()
        return list.filter(e => (e.nome ?? '').toLowerCase().includes(q)).slice(0, 50)
    }, [empresas, query])

    const vincularMut = useVincularContatoEmpresa()

    const handleSelect = async (empresaId: string) => {
        await vincularMut.mutateAsync({ contato_id: contatoId, empresa_id: empresaId })
        onClose()
    }

    const handleCreateAndLink = async () => {
        if (!novaEmpresaNome.trim() || !org?.id) return
        // Cria empresa e em seguida vincula
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: created, error } = await (supabase.from('contatos') as any)
            .insert({
                nome: novaEmpresaNome.trim(),
                tipo_contato: 'empresa',
                tipo_pessoa: 'adulto',
                org_id: org.id,
                origem: 'manual_corp',
            })
            .select('id')
            .single()
        if (error || !created) return
        await vincularMut.mutateAsync({ contato_id: contatoId, empresa_id: created.id })
        onClose()
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md flex flex-col max-h-[80vh]">
                <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100">
                    <div>
                        <h2 className="text-base font-semibold text-slate-900 tracking-tight">
                            Vincular {contatoNome} a uma empresa
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Cards abertos dela passam pra empresa escolhida.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-slate-100 text-slate-400"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {!creatingNew ? (
                    <>
                        <div className="px-5 py-3 border-b border-slate-100">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Buscar empresa..."
                                    autoFocus
                                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-3 py-2">
                            {isLoading ? (
                                <div className="flex items-center justify-center py-8 text-sm text-slate-400">
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    Carregando...
                                </div>
                            ) : filtered.length === 0 ? (
                                <div className="text-center py-6 px-4">
                                    <p className="text-sm text-slate-500">Nenhuma empresa encontrada.</p>
                                    <button
                                        onClick={() => {
                                            setCreatingNew(true)
                                            setNovaEmpresaNome(query)
                                        }}
                                        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                                    >
                                        <Plus className="w-3 h-3" />
                                        Cadastrar "{query}" como nova empresa
                                    </button>
                                </div>
                            ) : (
                                <ul className="space-y-0.5">
                                    {filtered.map((e) => (
                                        <li key={e.id}>
                                            <button
                                                onClick={() => handleSelect(e.id)}
                                                disabled={vincularMut.isPending}
                                                className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors"
                                            >
                                                <div className="w-7 h-7 rounded-md bg-purple-50 flex items-center justify-center shrink-0">
                                                    <Building2 className="w-3.5 h-3.5 text-purple-600" />
                                                </div>
                                                <span className="text-sm text-slate-800 truncate">{e.nome}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
                            <button
                                onClick={() => setCreatingNew(true)}
                                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-indigo-600 hover:bg-white border border-indigo-100 rounded-md"
                            >
                                <Plus className="w-3 h-3" />
                                Cadastrar empresa nova
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="px-5 py-4 space-y-3 flex-1">
                        <div>
                            <label className="text-xs font-medium text-slate-700 mb-1 block">
                                Nome da empresa <span className="text-rose-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={novaEmpresaNome}
                                onChange={(e) => setNovaEmpresaNome(e.target.value)}
                                placeholder="Ex: Magazine Luiza"
                                autoFocus
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-2">
                            <button
                                onClick={() => setCreatingNew(false)}
                                className="text-xs font-medium text-slate-500 hover:text-slate-700"
                            >
                                ← Voltar à busca
                            </button>
                            <button
                                onClick={handleCreateAndLink}
                                disabled={vincularMut.isPending || !novaEmpresaNome.trim()}
                                className="px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5"
                            >
                                {vincularMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Cadastrar e vincular
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
