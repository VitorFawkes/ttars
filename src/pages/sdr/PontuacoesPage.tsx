import { useMemo, useState } from 'react'
import { CheckCircle2, XCircle, Clock, Target, Loader2, Search } from 'lucide-react'
import { useListarPontuacoes } from '../../hooks/useSdrQualification'
import { Badge } from '../../components/ui/Badge'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { formatPhoneBR } from '../../utils/normalizePhone'

function statusLabel(s: string) {
    if (s === 'rascunho') return { label: 'Rascunho', color: 'bg-slate-100 text-slate-700' }
    if (s === 'finalizado') return { label: 'Finalizado', color: 'bg-emerald-100 text-emerald-700' }
    if (s === 'descartado') return { label: 'Descartado', color: 'bg-slate-200 text-slate-500' }
    return { label: s, color: 'bg-slate-100 text-slate-700' }
}

export default function PontuacoesPage() {
    const [status, setStatus] = useState<string>('')
    const [onlyMine, setOnlyMine] = useState(false)
    const [search, setSearch] = useState('')

    const filtros = useMemo(
        () => ({
            status: status || undefined,
            only_mine: onlyMine,
            produto: 'WEDDING',
        }),
        [status, onlyMine],
    )

    const { data, isLoading, error } = useListarPontuacoes(filtros)
    const list = data?.pontuacoes ?? []

    const filtered = useMemo(() => {
        if (!search.trim()) return list
        const q = search.toLowerCase()
        return list.filter((p) => {
            const nome = (p.dados_lead?.nome_casal ?? '').toLowerCase()
            const card = (p.card_titulo ?? '').toLowerCase()
            const sdr = (p.sdr_nome ?? '').toLowerCase()
            const tel = (p.telefone ?? '').toLowerCase()
            return nome.includes(q) || card.includes(q) || sdr.includes(q) || tel.includes(q)
        })
    }, [list, search])

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <header>
                <h1 className="text-2xl font-semibold text-slate-900">Pontuações SDR</h1>
                <p className="text-sm text-slate-500 mt-1">
                    Pontuações registradas em tempo real pelas SDRs, com a mesma régua que a Estela.
                </p>
            </header>

            {/* KPIs */}
            {data && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <Kpi label="Total" value={data.total} icon={Target} />
                    <Kpi label="Qualificados" value={data.qualificados} icon={CheckCircle2} color="text-emerald-600" />
                    <Kpi label="Rascunhos" value={data.rascunhos} icon={Clock} color="text-amber-600" />
                    <Kpi label="Descartados" value={data.descartados} icon={XCircle} color="text-slate-500" />
                    <Kpi label="Score médio" value={data.score_medio ?? '—'} icon={Target} />
                </div>
            )}

            {/* Filtros */}
            <div className="flex flex-wrap gap-2 items-end bg-white border border-slate-200 rounded-lg p-3">
                <div className="flex-1 min-w-[200px]">
                    <label className="text-xs text-slate-600 mb-1 block">Buscar</label>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Nome do casal, card, SDR, telefone..."
                            className="pl-9"
                        />
                    </div>
                </div>
                <div>
                    <label className="text-xs text-slate-600 mb-1 block">Status</label>
                    <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="h-10 px-3 rounded-md border border-slate-300 text-sm bg-white"
                    >
                        <option value="">Todos</option>
                        <option value="rascunho">Rascunhos</option>
                        <option value="finalizado">Finalizados</option>
                        <option value="descartado">Descartados</option>
                    </select>
                </div>
                <Button
                    variant={onlyMine ? 'default' : 'outline'}
                    onClick={() => setOnlyMine(!onlyMine)}
                    className="h-10"
                >
                    {onlyMine ? 'Mostrar todas' : 'Só as minhas'}
                </Button>
            </div>

            {/* Tabela */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                {isLoading ? (
                    <div className="p-12 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                    </div>
                ) : error ? (
                    <div className="p-8 text-center text-rose-600">
                        Erro ao carregar pontuações: {(error as Error).message}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                        Nenhuma pontuação encontrada.
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-600 text-xs">
                            <tr>
                                <th className="text-left p-3 font-medium">Lead</th>
                                <th className="text-left p-3 font-medium">SDR</th>
                                <th className="text-left p-3 font-medium">Score</th>
                                <th className="text-left p-3 font-medium">Status</th>
                                <th className="text-left p-3 font-medium">Card</th>
                                <th className="text-left p-3 font-medium">Quando</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filtered.map((p) => {
                                const st = statusLabel(p.status)
                                const dataExibicao = p.finalized_at ?? p.created_at
                                const score = p.score_result?.score ?? 0
                                const qualificado = p.score_result?.qualificado ?? false
                                const disq = p.score_result?.disqualified ?? false
                                return (
                                    <tr key={p.id} className="hover:bg-slate-50">
                                        <td className="p-3">
                                            <div className="font-medium text-slate-900">
                                                {p.dados_lead?.nome_casal ?? '—'}
                                            </div>
                                            <div className="text-xs text-slate-500">
                                                {p.telefone ? formatPhoneBR(p.telefone) : ''}
                                            </div>
                                        </td>
                                        <td className="p-3 text-slate-700">{p.sdr_nome ?? '—'}</td>
                                        <td className="p-3">
                                            <span
                                                className={
                                                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ' +
                                                    (disq
                                                        ? 'bg-rose-100 text-rose-700'
                                                        : qualificado
                                                            ? 'bg-emerald-100 text-emerald-700'
                                                            : 'bg-slate-100 text-slate-700')
                                                }
                                            >
                                                {score}
                                                {disq ? ' ✗' : qualificado ? ' ✓' : ''}
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            <Badge className={st.color}>{st.label}</Badge>
                                        </td>
                                        <td className="p-3 text-slate-700">
                                            {p.card_id ? (
                                                <a
                                                    href={`/cards/${p.card_id}`}
                                                    className="text-indigo-600 hover:underline"
                                                >
                                                    {p.card_titulo ?? 'Abrir card'}
                                                </a>
                                            ) : (
                                                <span className="text-slate-400">Sem card</span>
                                            )}
                                        </td>
                                        <td className="p-3 text-xs text-slate-500">
                                            {new Date(dataExibicao).toLocaleString('pt-BR', {
                                                day: '2-digit', month: '2-digit', year: 'numeric',
                                                hour: '2-digit', minute: '2-digit',
                                            })}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}

function Kpi({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: React.ComponentType<{ className?: string }>; color?: string }) {
    return (
        <div className="bg-white border border-slate-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-500">{label}</span>
                <Icon className={`w-4 h-4 ${color ?? 'text-slate-400'}`} />
            </div>
            <div className="text-2xl font-semibold text-slate-900">{value}</div>
        </div>
    )
}
