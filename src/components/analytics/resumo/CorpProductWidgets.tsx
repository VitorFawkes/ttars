import { Building2, Inbox, Trophy, XCircle, Clock, CalendarClock } from 'lucide-react'
import KpiCard from '../KpiCard'
import ChartCard from '../ChartCard'
import { useOverviewKpis } from '@/hooks/analytics/useOverviewData'
import { useLossReasons } from '@/hooks/analytics/useFunnelConversion'

export default function CorpProductWidgets() {
    const { data: kpis, isLoading: kpisLoading } = useOverviewKpis()
    const { data: lossReasons, isLoading: lossLoading } = useLossReasons()

    const totalOpen = kpis?.total_open ?? 0
    const totalLeads = kpis?.total_leads ?? 0
    const totalWon = kpis?.total_won ?? 0
    const totalLost = kpis?.total_lost ?? 0
    const totalClosed = totalWon + totalLost
    const cycleDays = kpis?.ciclo_medio_dias ?? 0
    const conversaoRate = totalClosed > 0 ? (totalWon / totalClosed) * 100 : 0

    const reasons = (lossReasons ?? []).slice(0, 5)
    const maxReason = reasons[0]?.count || 1

    return (
        <div>
            <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-4 h-4 text-purple-500" />
                <h2 className="text-sm font-semibold text-slate-700">Atendimento Corporativo</h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <KpiCard
                    title="Abertos agora"
                    value={totalOpen}
                    icon={Inbox}
                    color="text-purple-600"
                    bgColor="bg-purple-50"
                    isLoading={kpisLoading}
                    subtitle="ao vivo"
                />
                <KpiCard
                    title="Abertos no período"
                    value={totalLeads}
                    icon={Inbox}
                    color="text-indigo-600"
                    bgColor="bg-indigo-50"
                    isLoading={kpisLoading}
                />
                <KpiCard
                    title="Viraram venda"
                    value={totalWon}
                    icon={Trophy}
                    color="text-emerald-600"
                    bgColor="bg-emerald-50"
                    isLoading={kpisLoading}
                    subtitle={`${conversaoRate.toFixed(0)}% dos fechados`}
                />
                <KpiCard
                    title="Fechados sem venda"
                    value={totalLost}
                    icon={XCircle}
                    color="text-rose-600"
                    bgColor="bg-rose-50"
                    isLoading={kpisLoading}
                />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-2 gap-4 mb-4">
                <KpiCard
                    title="Tempo médio aberto"
                    value={kpis ? `${cycleDays}d` : '—'}
                    icon={Clock}
                    color="text-amber-600"
                    bgColor="bg-amber-50"
                    isLoading={kpisLoading}
                    subtitle="abertura → fechamento"
                />
                <KpiCard
                    title="Oportunidades futuras"
                    value={reasons.find(r => r.motivo.toLowerCase().includes('futur'))?.count ?? 0}
                    icon={CalendarClock}
                    color="text-purple-600"
                    bgColor="bg-purple-50"
                    isLoading={lossLoading}
                    subtitle="agendadas pra retorno"
                />
            </div>

            <ChartCard
                title="Por que não viraram venda"
                description={`${totalLost} atendimentos fechados sem venda no período`}
                isLoading={lossLoading}
            >
                {reasons.length > 0 ? (
                    <ul className="divide-y divide-slate-100">
                        {reasons.map((r, i) => {
                            const pct = Math.round((r.count / maxReason) * 100)
                            const isFutura = r.motivo.toLowerCase().includes('futur')
                            return (
                                <li key={`${r.motivo}-${i}`} className="py-2.5 px-4">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-sm text-slate-800 font-medium flex items-center gap-2">
                                            <span
                                                className={`w-1.5 h-1.5 rounded-full ${isFutura ? 'bg-purple-500' : 'bg-slate-400'}`}
                                            />
                                            {r.motivo}
                                        </span>
                                        <span className="text-xs text-slate-600 tabular-nums shrink-0 ml-2">
                                            {r.count} · {Math.round(r.percentage)}%
                                        </span>
                                    </div>
                                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${isFutura ? 'bg-purple-500' : 'bg-slate-400'}`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                ) : (
                    <div className="h-[180px] flex items-center justify-center text-sm text-slate-400">
                        Nenhum fechamento sem venda registrado no período.
                    </div>
                )}
            </ChartCard>
        </div>
    )
}
