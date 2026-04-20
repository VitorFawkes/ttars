import { MapPin, Calendar, Plane } from 'lucide-react'
import ChartCard from '../ChartCard'
import { useTopDestinations } from '@/hooks/analytics/useFinancialData'
import { formatCurrency } from '@/utils/whatsappFormatters'

export default function TripsProductWidgets() {
    const { data: destinations, isLoading: destLoading } = useTopDestinations()

    const topDestinations = (destinations ?? []).slice(0, 8)

    return (
        <div>
            <div className="flex items-center gap-2 mb-3">
                <Plane className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-semibold text-slate-700">Dados da viagem</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ChartCard
                    title="Destinos mais vendidos"
                    description="Somente cards ganhos no período"
                    isLoading={destLoading}
                >
                    {topDestinations.length > 0 ? (
                        <ul className="divide-y divide-slate-100">
                            {topDestinations.map((d, i) => {
                                const max = topDestinations[0]?.receita_total || 1
                                const pct = Math.round((Number(d.receita_total) / Number(max)) * 100)
                                return (
                                    <li key={`${d.destino}-${i}`} className="py-2.5 px-1">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-sm text-slate-800 font-medium truncate flex items-center gap-2">
                                                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                {d.destino || '—'}
                                            </span>
                                            <span className="text-xs text-slate-600 tabular-nums shrink-0 ml-2">
                                                {d.total_cards} · {formatCurrency(Number(d.receita_total))}
                                            </span>
                                        </div>
                                        <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-indigo-500 rounded-full"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    ) : (
                        <div className="h-[180px] flex items-center justify-center text-sm text-slate-400">
                            Nenhum destino registrado no período.
                        </div>
                    )}
                </ChartCard>

                <ChartCard
                    title="Época das viagens"
                    description="Informação disponível no card detalhado"
                >
                    <div className="h-[180px] flex flex-col items-center justify-center gap-2 text-slate-400">
                        <Calendar className="w-8 h-8 opacity-40" />
                        <p className="text-xs text-center max-w-[220px]">
                            Em breve: distribuição dos meses de saída mais vendidos.
                        </p>
                    </div>
                </ChartCard>
            </div>
        </div>
    )
}
