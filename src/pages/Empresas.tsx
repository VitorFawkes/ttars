import { useState, useMemo } from 'react'
import { Plus, Search, Building2, Users, Inbox, Loader2 } from 'lucide-react'
import { useEmpresas, type Empresa } from '../hooks/useEmpresas'
import CreateCompanyModal from '../components/empresas/CreateCompanyModal'
import CompanyDetailDrawer from '../components/empresas/CompanyDetailDrawer'

function relativeDate(iso: string | null): string {
    if (!iso) return '—'
    const ms = Date.now() - new Date(iso).getTime()
    const days = Math.floor(ms / (1000 * 60 * 60 * 24))
    if (days < 1) return 'hoje'
    if (days === 1) return 'ontem'
    if (days < 7) return `há ${days} dias`
    if (days < 30) return `há ${Math.floor(days / 7)} sem`
    return `há ${Math.floor(days / 30)} mes`
}

export default function Empresas() {
    const [search, setSearch] = useState('')
    const [showCreate, setShowCreate] = useState(false)
    const [selected, setSelected] = useState<Empresa | null>(null)
    const { data, isLoading } = useEmpresas(search)

    const empresas = useMemo(() => data ?? [], [data])
    const totalAbertos = useMemo(
        () => empresas.reduce((acc, e) => acc + e.cards_abertos, 0),
        [empresas]
    )

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-5">
                <div className="flex items-start justify-between gap-4 max-w-6xl mx-auto">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Empresas</h1>
                        <p className="text-sm text-slate-500 mt-1">
                            {empresas.length} {empresas.length === 1 ? 'empresa cadastrada' : 'empresas cadastradas'} ·{' '}
                            {totalAbertos} {totalAbertos === 1 ? 'atendimento aberto' : 'atendimentos abertos'}
                        </p>
                    </div>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Nova empresa
                    </button>
                </div>

                <div className="max-w-6xl mx-auto mt-4">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar empresa..."
                            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                    </div>
                </div>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
                <div className="max-w-6xl mx-auto">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-16 text-sm text-slate-400">
                            <Loader2 className="w-5 h-5 animate-spin mr-2" />
                            Carregando empresas...
                        </div>
                    ) : empresas.length === 0 ? (
                        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-10 text-center">
                            <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-3">
                                <Building2 className="w-6 h-6 text-purple-600" />
                            </div>
                            <h3 className="text-base font-semibold text-slate-900">
                                {search ? 'Nenhuma empresa encontrada' : 'Nenhuma empresa cadastrada ainda'}
                            </h3>
                            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                                {search
                                    ? `Não achamos empresas com "${search}". Verifique a busca ou cadastre uma nova.`
                                    : 'Cadastre as empresas-clientes do Corporativo. Depois, ao receber mensagem de qualquer pessoa cadastrada na empresa, o atendimento já cai no card certo.'}
                            </p>
                            <button
                                onClick={() => setShowCreate(true)}
                                className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                            >
                                <Plus className="w-4 h-4" />
                                Cadastrar primeira empresa
                            </button>
                        </div>
                    ) : (
                        <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                            <ul className="divide-y divide-slate-100">
                                {empresas.map((e) => (
                                    <li key={e.id}>
                                        <button
                                            onClick={() => setSelected(e)}
                                            className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50/60 transition-colors text-left group"
                                        >
                                            <div className="w-10 h-10 rounded-xl bg-purple-50 group-hover:bg-purple-100 flex items-center justify-center shrink-0 transition-colors">
                                                <Building2 className="w-5 h-5 text-purple-600" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold text-slate-900 truncate group-hover:text-indigo-700 transition-colors">
                                                    {e.nome}
                                                </p>
                                                {e.observacoes && (
                                                    <p className="text-xs text-slate-500 truncate mt-0.5">{e.observacoes}</p>
                                                )}
                                            </div>
                                            <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500 shrink-0">
                                                <span className="inline-flex items-center gap-1">
                                                    <Users className="w-3 h-3" />
                                                    {e.pessoas_count} {e.pessoas_count === 1 ? 'pessoa' : 'pessoas'}
                                                </span>
                                                <span className={`inline-flex items-center gap-1 ${e.cards_abertos > 0 ? 'text-indigo-600 font-medium' : ''}`}>
                                                    <Inbox className="w-3 h-3" />
                                                    {e.cards_abertos} {e.cards_abertos === 1 ? 'aberto' : 'abertos'}
                                                </span>
                                                <span className="text-slate-400">
                                                    {relativeDate(e.ultimo_contato_at ?? e.updated_at)}
                                                </span>
                                            </div>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>

            {showCreate && (
                <CreateCompanyModal
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { /* já invalidou via mutation */ }}
                />
            )}

            {selected && (
                <CompanyDetailDrawer
                    empresa={selected}
                    onClose={() => setSelected(null)}
                />
            )}
        </div>
    )
}
