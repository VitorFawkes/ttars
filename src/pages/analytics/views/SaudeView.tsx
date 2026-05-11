import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
    UserX, PhoneOff, Clock, AlertTriangle, CalendarX, FileWarning, CheckCircle2,
    ChevronLeft, ChevronRight, ExternalLink, X,
} from 'lucide-react'
import KpiCard from '@/components/analytics/KpiCard'
import { QueryErrorState } from '@/components/ui/QueryErrorState'
import { useSaudeSummary } from '@/hooks/analytics/useSaudeSummary'
import { useSaudeList, type SaudeBucket, type SaudeSortBy } from '@/hooks/analytics/useSaudeList'
import { useSaudeTarefasVencidas } from '@/hooks/analytics/useSaudeTarefasVencidas'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { cn } from '@/lib/utils'

type ActiveDrill =
    | { kind: 'cards'; bucket: SaudeBucket; label: string }
    | { kind: 'tarefas'; label: string }
    | null

const BUCKET_LABELS: Record<SaudeBucket, string> = {
    sem_dono: 'Sem dono',
    sem_contato: 'Sem contato principal',
    sla_violado: 'SLA da etapa violado',
    sem_atividade_7d: 'Sem atividade há 7+ dias',
    sem_atividade_14d: 'Sem atividade há 14+ dias',
    sem_atividade_30d: 'Sem atividade há 30+ dias',
    sem_briefing: 'Sem briefing inicial',
}

export default function SaudeView() {
    const { setActiveView } = useAnalyticsFilters()
    const [activeDrill, setActiveDrill] = useState<ActiveDrill>(null)
    const [page, setPage] = useState(0)
    const [sortBy, setSortBy] = useState<SaudeSortBy>('dias_parado')

    useEffect(() => { setActiveView('saude') }, [setActiveView])

    const { data: summary, isLoading, error, refetch } = useSaudeSummary()

    const cardsDrill = useSaudeList(
        activeDrill?.kind === 'cards' ? activeDrill.bucket : null,
        page,
        sortBy,
    )
    const tarefasDrill = useSaudeTarefasVencidas(
        page,
        activeDrill?.kind === 'tarefas',
    )

    const openBucket = (bucket: SaudeBucket) => {
        setActiveDrill({ kind: 'cards', bucket, label: BUCKET_LABELS[bucket] })
        setPage(0)
        setSortBy('dias_parado')
    }
    const openTarefas = () => {
        setActiveDrill({ kind: 'tarefas', label: 'Tarefas vencidas' })
        setPage(0)
    }
    const closeDrill = () => setActiveDrill(null)

    const totalAbertos = summary?.total_abertos ?? 0
    const semAtividade14 = summary?.sem_atividade_14d ?? 0
    const totalProblemas = summary
        ? (summary.sem_dono + summary.sem_contato + summary.sla_violado + summary.tarefas_vencidas + semAtividade14)
        : 0
    const saudeLivre = summary && totalAbertos > 0
        ? Math.max(0, 100 - Math.round((totalProblemas / totalAbertos) * 100))
        : null

    return (
        <div className="space-y-6">
            {error && (
                <QueryErrorState compact title="Erro ao carregar saúde do pipeline" onRetry={() => refetch()} />
            )}

            <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Saúde do Pipeline</h1>
                <p className="text-sm text-slate-500 mt-1">O que está travado, parado ou faltando atenção.</p>
            </div>

            {/* Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard
                    title="Total em aberto"
                    value={totalAbertos.toLocaleString('pt-BR')}
                    icon={CheckCircle2}
                    color="text-slate-700"
                    bgColor="bg-slate-100"
                    isLoading={isLoading}
                    subtitle="Sem contar ganhos/perdidos"
                />
                <KpiCard
                    title="Índice de saúde"
                    value={saudeLivre != null ? `${saudeLivre}%` : '—'}
                    icon={CheckCircle2}
                    color={saudeLivre == null ? 'text-slate-400' : saudeLivre >= 80 ? 'text-emerald-600' : saudeLivre >= 60 ? 'text-amber-600' : 'text-rose-600'}
                    bgColor={saudeLivre == null ? 'bg-slate-100' : saudeLivre >= 80 ? 'bg-emerald-50' : saudeLivre >= 60 ? 'bg-amber-50' : 'bg-rose-50'}
                    isLoading={isLoading}
                    subtitle="Quanto menor, mais atenção"
                />
                <KpiCard
                    title="Cards com problemas"
                    value={totalProblemas.toLocaleString('pt-BR')}
                    icon={AlertTriangle}
                    color={totalProblemas === 0 ? 'text-emerald-600' : 'text-rose-600'}
                    bgColor={totalProblemas === 0 ? 'bg-emerald-50' : 'bg-rose-50'}
                    isLoading={isLoading}
                />
                <KpiCard
                    title="Tarefas vencidas"
                    value={(summary?.tarefas_vencidas ?? 0).toLocaleString('pt-BR')}
                    icon={CalendarX}
                    color={(summary?.tarefas_vencidas ?? 0) === 0 ? 'text-emerald-600' : 'text-rose-600'}
                    bgColor={(summary?.tarefas_vencidas ?? 0) === 0 ? 'bg-emerald-50' : 'bg-rose-50'}
                    isLoading={isLoading}
                    onClick={(summary?.tarefas_vencidas ?? 0) > 0 ? openTarefas : undefined}
                    clickHint="Ver tarefas"
                />
            </div>

            {/* Buckets detalhados */}
            <div>
                <h2 className="text-sm font-semibold text-slate-700 mb-3 mt-2">Onde está o problema</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <KpiCard
                        title="Sem dono"
                        value={(summary?.sem_dono ?? 0).toLocaleString('pt-BR')}
                        icon={UserX}
                        color={(summary?.sem_dono ?? 0) === 0 ? 'text-emerald-600' : 'text-amber-600'}
                        bgColor={(summary?.sem_dono ?? 0) === 0 ? 'bg-emerald-50' : 'bg-amber-50'}
                        isLoading={isLoading}
                        subtitle="Cards órfãos"
                        onClick={(summary?.sem_dono ?? 0) > 0 ? () => openBucket('sem_dono') : undefined}
                        clickHint="Ver cards"
                    />
                    <KpiCard
                        title="Sem contato"
                        value={(summary?.sem_contato ?? 0).toLocaleString('pt-BR')}
                        icon={PhoneOff}
                        color={(summary?.sem_contato ?? 0) === 0 ? 'text-emerald-600' : 'text-amber-600'}
                        bgColor={(summary?.sem_contato ?? 0) === 0 ? 'bg-emerald-50' : 'bg-amber-50'}
                        isLoading={isLoading}
                        subtitle="Sem pessoa principal"
                        onClick={(summary?.sem_contato ?? 0) > 0 ? () => openBucket('sem_contato') : undefined}
                        clickHint="Ver cards"
                    />
                    <KpiCard
                        title="SLA violado"
                        value={(summary?.sla_violado ?? 0).toLocaleString('pt-BR')}
                        icon={Clock}
                        color={(summary?.sla_violado ?? 0) === 0 ? 'text-emerald-600' : 'text-rose-600'}
                        bgColor={(summary?.sla_violado ?? 0) === 0 ? 'bg-emerald-50' : 'bg-rose-50'}
                        isLoading={isLoading}
                        subtitle="Tempo na etapa passou do limite"
                        onClick={(summary?.sla_violado ?? 0) > 0 ? () => openBucket('sla_violado') : undefined}
                        clickHint="Ver cards"
                    />
                    <KpiCard
                        title="Parados 7+ dias"
                        value={(summary?.sem_atividade_7d ?? 0).toLocaleString('pt-BR')}
                        icon={Clock}
                        color={(summary?.sem_atividade_7d ?? 0) === 0 ? 'text-emerald-600' : 'text-slate-700'}
                        bgColor={(summary?.sem_atividade_7d ?? 0) === 0 ? 'bg-emerald-50' : 'bg-slate-100'}
                        isLoading={isLoading}
                        subtitle="Última alteração há mais de uma semana"
                        onClick={(summary?.sem_atividade_7d ?? 0) > 0 ? () => openBucket('sem_atividade_7d') : undefined}
                        clickHint="Ver cards"
                    />
                    <KpiCard
                        title="Parados 14+ dias"
                        value={(summary?.sem_atividade_14d ?? 0).toLocaleString('pt-BR')}
                        icon={Clock}
                        color={(summary?.sem_atividade_14d ?? 0) === 0 ? 'text-emerald-600' : 'text-amber-600'}
                        bgColor={(summary?.sem_atividade_14d ?? 0) === 0 ? 'bg-emerald-50' : 'bg-amber-50'}
                        isLoading={isLoading}
                        subtitle="Alto risco de esfriar"
                        onClick={(summary?.sem_atividade_14d ?? 0) > 0 ? () => openBucket('sem_atividade_14d') : undefined}
                        clickHint="Ver cards"
                    />
                    <KpiCard
                        title="Parados 30+ dias"
                        value={(summary?.sem_atividade_30d ?? 0).toLocaleString('pt-BR')}
                        icon={Clock}
                        color={(summary?.sem_atividade_30d ?? 0) === 0 ? 'text-emerald-600' : 'text-rose-600'}
                        bgColor={(summary?.sem_atividade_30d ?? 0) === 0 ? 'bg-emerald-50' : 'bg-rose-50'}
                        isLoading={isLoading}
                        subtitle="Provavelmente perdidos"
                        onClick={(summary?.sem_atividade_30d ?? 0) > 0 ? () => openBucket('sem_atividade_30d') : undefined}
                        clickHint="Ver cards"
                    />
                    <KpiCard
                        title="Sem briefing"
                        value={(summary?.sem_briefing ?? 0).toLocaleString('pt-BR')}
                        icon={FileWarning}
                        color={(summary?.sem_briefing ?? 0) === 0 ? 'text-emerald-600' : 'text-amber-600'}
                        bgColor={(summary?.sem_briefing ?? 0) === 0 ? 'bg-emerald-50' : 'bg-amber-50'}
                        isLoading={isLoading}
                        subtitle="Em fase SDR, briefing inicial vazio"
                        onClick={(summary?.sem_briefing ?? 0) > 0 ? () => openBucket('sem_briefing') : undefined}
                        clickHint="Ver cards"
                    />
                </div>
            </div>

            {/* Drill-down inline */}
            {activeDrill && (
                <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                        <div>
                            <h3 className="text-sm font-semibold text-slate-900">{activeDrill.label}</h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {activeDrill.kind === 'cards'
                                    ? `${cardsDrill.data?.totalCount ?? 0} cards encontrados`
                                    : `${tarefasDrill.data?.totalCount ?? 0} tarefas encontradas`}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {activeDrill.kind === 'cards' && (
                                <select
                                    value={sortBy}
                                    onChange={(e) => { setSortBy(e.target.value as SaudeSortBy); setPage(0) }}
                                    className="text-xs rounded-md border border-slate-200 bg-white px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                >
                                    <option value="dias_parado">Mais parado primeiro</option>
                                    <option value="valor">Maior valor primeiro</option>
                                    <option value="dono">Por dono (A-Z)</option>
                                </select>
                            )}
                            <button
                                onClick={closeDrill}
                                className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                                aria-label="Fechar"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {activeDrill.kind === 'cards' && (
                        <CardsTable
                            rows={cardsDrill.data?.rows ?? []}
                            isLoading={cardsDrill.isLoading}
                            bucket={activeDrill.bucket}
                        />
                    )}
                    {activeDrill.kind === 'tarefas' && (
                        <TarefasTable
                            rows={tarefasDrill.data?.rows ?? []}
                            isLoading={tarefasDrill.isLoading}
                        />
                    )}

                    {activeDrill.kind === 'cards' && (cardsDrill.data?.totalPages ?? 0) > 1 && (
                        <Pagination
                            page={page}
                            totalPages={cardsDrill.data?.totalPages ?? 0}
                            onChange={setPage}
                        />
                    )}
                    {activeDrill.kind === 'tarefas' && (tarefasDrill.data?.totalPages ?? 0) > 1 && (
                        <Pagination
                            page={page}
                            totalPages={tarefasDrill.data?.totalPages ?? 0}
                            onChange={setPage}
                        />
                    )}
                </div>
            )}
        </div>
    )
}

function CardsTable({
    rows,
    isLoading,
    bucket,
}: {
    rows: import('@/hooks/analytics/useSaudeList').SaudeCardRow[]
    isLoading: boolean
    bucket: SaudeBucket
}) {
    if (isLoading) {
        return (
            <div className="p-8 text-center text-xs text-slate-400">Carregando…</div>
        )
    }
    if (rows.length === 0) {
        return (
            <div className="p-8 text-center text-sm text-slate-500">Nenhum card neste bucket.</div>
        )
    }
    const showSla = bucket === 'sla_violado'
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-xs text-slate-500 uppercase tracking-wider">
                        <th className="text-left px-5 py-2.5 font-medium">Card</th>
                        <th className="text-left px-3 py-2.5 font-medium">Etapa</th>
                        <th className="text-left px-3 py-2.5 font-medium">Dono</th>
                        <th className="text-left px-3 py-2.5 font-medium">Contato</th>
                        <th className="text-right px-3 py-2.5 font-medium">Valor</th>
                        <th className="text-right px-3 py-2.5 font-medium">{showSla ? 'SLA (h)' : 'Dias parado'}</th>
                        <th className="text-right px-5 py-2.5 font-medium"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                        <tr key={r.card_id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-5 py-2.5 text-slate-900 font-medium truncate max-w-[280px]">{r.titulo}</td>
                            <td className="px-3 py-2.5 text-slate-600 text-xs">{r.stage_nome}</td>
                            <td className="px-3 py-2.5 text-slate-600 text-xs">{r.dono_atual_nome ?? <span className="text-amber-600">—</span>}</td>
                            <td className="px-3 py-2.5 text-slate-600 text-xs truncate max-w-[160px]">{r.pessoa_nome ?? <span className="text-amber-600">—</span>}</td>
                            <td className="px-3 py-2.5 text-right text-slate-700 text-xs tabular-nums">
                                {r.valor_display > 0 ? formatCurrency(r.valor_display) : '—'}
                            </td>
                            <td className={cn(
                                'px-3 py-2.5 text-right text-xs tabular-nums font-medium',
                                showSla
                                    ? (r.horas_sla_excedidas ?? 0) > 48 ? 'text-rose-600' : 'text-amber-600'
                                    : r.dias_parado > 14 ? 'text-rose-600' : r.dias_parado > 7 ? 'text-amber-600' : 'text-slate-500'
                            )}>
                                {showSla
                                    ? r.horas_sla_excedidas != null ? `+${r.horas_sla_excedidas}h` : '—'
                                    : `${r.dias_parado}d`}
                            </td>
                            <td className="px-5 py-2.5 text-right">
                                <Link
                                    to={`/cards/${r.card_id}`}
                                    className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
                                >
                                    Abrir <ExternalLink className="w-3 h-3" />
                                </Link>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

function TarefasTable({
    rows,
    isLoading,
}: {
    rows: import('@/hooks/analytics/useSaudeTarefasVencidas').TarefaVencidaRow[]
    isLoading: boolean
}) {
    if (isLoading) {
        return <div className="p-8 text-center text-xs text-slate-400">Carregando…</div>
    }
    if (rows.length === 0) {
        return <div className="p-8 text-center text-sm text-slate-500">Nenhuma tarefa vencida.</div>
    }
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-xs text-slate-500 uppercase tracking-wider">
                        <th className="text-left px-5 py-2.5 font-medium">Tarefa</th>
                        <th className="text-left px-3 py-2.5 font-medium">Card</th>
                        <th className="text-left px-3 py-2.5 font-medium">Responsável</th>
                        <th className="text-right px-3 py-2.5 font-medium">Vencimento</th>
                        <th className="text-right px-3 py-2.5 font-medium">Dias atrasada</th>
                        <th className="text-right px-5 py-2.5 font-medium"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                        <tr key={r.tarefa_id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-5 py-2.5 text-slate-900 font-medium truncate max-w-[240px]">{r.titulo}</td>
                            <td className="px-3 py-2.5 text-slate-600 text-xs truncate max-w-[200px]">{r.card_titulo}</td>
                            <td className="px-3 py-2.5 text-slate-600 text-xs">{r.responsavel_nome ?? <span className="text-amber-600">—</span>}</td>
                            <td className="px-3 py-2.5 text-right text-slate-500 text-xs">
                                {new Date(r.data_vencimento).toLocaleDateString('pt-BR')}
                            </td>
                            <td className={cn(
                                'px-3 py-2.5 text-right text-xs tabular-nums font-medium',
                                r.dias_vencida > 14 ? 'text-rose-600' : r.dias_vencida > 3 ? 'text-amber-600' : 'text-slate-600'
                            )}>
                                {r.dias_vencida}d
                            </td>
                            <td className="px-5 py-2.5 text-right">
                                <Link
                                    to={`/cards/${r.card_id}`}
                                    className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
                                >
                                    Abrir <ExternalLink className="w-3 h-3" />
                                </Link>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
    return (
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-slate-50 text-xs">
            <span className="text-slate-500">Página {page + 1} de {totalPages}</span>
            <div className="flex items-center gap-1">
                <button
                    onClick={() => onChange(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="p-1.5 rounded-md text-slate-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={() => onChange(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                    className="p-1.5 rounded-md text-slate-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <ChevronRight className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    )
}
