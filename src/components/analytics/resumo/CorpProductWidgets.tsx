import { Building2, Inbox, Trophy, XCircle, Clock, CalendarClock, Plane, Hotel as HotelIcon, Car, Bus, Shield, Package } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import KpiCard from '../KpiCard'
import ChartCard from '../ChartCard'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { useOverviewKpis } from '@/hooks/analytics/useOverviewData'
import { useLossReasons } from '@/hooks/analytics/useFunnelConversion'

const CATEGORIA_LABELS: Record<string, { label: string; icon: typeof Plane; color: string }> = {
    aereo_nacional:      { label: 'Aéreo nacional',      icon: Plane,    color: 'bg-sky-500' },
    aereo_internacional: { label: 'Aéreo internacional', icon: Plane,    color: 'bg-indigo-500' },
    hotel:               { label: 'Hotel',               icon: HotelIcon, color: 'bg-amber-500' },
    carro:               { label: 'Carro',               icon: Car,      color: 'bg-emerald-500' },
    onibus:              { label: 'Ônibus',              icon: Bus,      color: 'bg-orange-500' },
    seguro_viagem:       { label: 'Seguro viagem',       icon: Shield,   color: 'bg-purple-500' },
    outros:              { label: 'Outros',              icon: Package,  color: 'bg-slate-400' },
}

interface CategoriaRow {
    categoria: string | null
    total: number
    ganhos: number
    perdidos: number
    abertos: number
}

function useCorpCategorias() {
    const { org } = useOrg()
    const { dateRange } = useAnalyticsFilters()
    return useQuery<CategoriaRow[]>({
        queryKey: ['corp-categorias', org?.id, dateRange.start, dateRange.end],
        enabled: !!org?.id,
        staleTime: 5 * 60 * 1000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('cards')
                .select('produto_data, status_comercial')
                .eq('org_id', org!.id)
                .eq('produto', 'CORP')
                .gte('created_at', dateRange.start)
                .lte('created_at', dateRange.end)
                .is('deleted_at', null)
            if (error) throw error
            const buckets = new Map<string, CategoriaRow>()
            for (const row of (data ?? [])) {
                const cat = ((row.produto_data as { categoria_produto?: string } | null)?.categoria_produto) ?? null
                const key = cat ?? '__sem__'
                const b = buckets.get(key) ?? { categoria: cat, total: 0, ganhos: 0, perdidos: 0, abertos: 0 }
                b.total += 1
                if (row.status_comercial === 'ganho') b.ganhos += 1
                else if (row.status_comercial === 'perdido') b.perdidos += 1
                else b.abertos += 1
                buckets.set(key, b)
            }
            return Array.from(buckets.values()).sort((a, b) => b.total - a.total)
        },
    })
}

export default function CorpProductWidgets() {
    const { data: kpis, isLoading: kpisLoading } = useOverviewKpis()
    const { data: lossReasons, isLoading: lossLoading } = useLossReasons()
    const { data: categorias, isLoading: categoriasLoading } = useCorpCategorias()

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
                title="Atendimentos por categoria"
                description="Mix de demandas no período"
                isLoading={categoriasLoading}
                className="mb-4"
            >
                {(() => {
                    const rows = (categorias ?? []).filter(r => r.total > 0)
                    const totalAll = rows.reduce((acc, r) => acc + r.total, 0)
                    if (rows.length === 0) {
                        return (
                            <div className="h-[180px] flex items-center justify-center text-sm text-slate-400">
                                Nenhum atendimento Corp registrado no período.
                            </div>
                        )
                    }
                    return (
                        <ul className="divide-y divide-slate-100">
                            {rows.map((r) => {
                                const meta = r.categoria
                                    ? CATEGORIA_LABELS[r.categoria]
                                    : { label: 'Sem categoria', icon: Package, color: 'bg-slate-300' }
                                const pct = totalAll > 0 ? Math.round((r.total / totalAll) * 100) : 0
                                const conv = (r.ganhos + r.perdidos) > 0
                                    ? Math.round((r.ganhos / (r.ganhos + r.perdidos)) * 100)
                                    : null
                                const Icon = meta.icon
                                return (
                                    <li key={r.categoria ?? 'sem'} className="py-2.5 px-4">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-sm text-slate-800 font-medium flex items-center gap-2">
                                                <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                {meta.label}
                                            </span>
                                            <span className="text-xs text-slate-600 tabular-nums shrink-0 ml-2">
                                                {r.total} · {pct}%
                                                {conv !== null && (
                                                    <span className="text-emerald-600 ml-2">{conv}% conversão</span>
                                                )}
                                            </span>
                                        </div>
                                        <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${meta.color}`}
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    )
                })()}
            </ChartCard>

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
