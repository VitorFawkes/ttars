import {
    ShieldCheck, Package, GitPullRequest, Users,
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line,
} from 'recharts'
import KpiCard from '../KpiCard'
import ChartCard from '../ChartCard'
import { useOperationsData } from '@/hooks/analytics/useOperationsData'
import { cn } from '@/lib/utils'

function formatCurrency(value: number): string {
    if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)} mi`
    if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)} mil`
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

export default function OperationsView() {
    const { data: ops, isLoading } = useOperationsData()

    const kpis = ops?.kpis
    const subStats = ops?.sub_card_stats
    const planners = ops?.per_planner || []
    const timeline = ops?.timeline || []

    return (
        <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard
                    title="Viagens Realizadas"
                    value={kpis?.viagens_realizadas ?? 0}
                    icon={Package}
                    color="text-green-600"
                    bgColor="bg-green-50"
                    isLoading={isLoading}
                />
                <KpiCard
                    title="Mudancas / Viagem"
                    value={subStats?.changes_per_trip ?? 0}
                    subtitle={subStats ? `${subStats.total_sub_cards} total` : undefined}
                    icon={GitPullRequest}
                    color="text-amber-600"
                    bgColor="bg-amber-50"
                    isLoading={isLoading}
                />
                <KpiCard
                    title="Viagens com Mudanca"
                    value={subStats?.cards_with_changes ?? 0}
                    icon={ShieldCheck}
                    color="text-indigo-600"
                    bgColor="bg-indigo-50"
                    isLoading={isLoading}
                />
                <KpiCard
                    title="Planners Ativos"
                    value={planners.length}
                    icon={Users}
                    color="text-slate-700"
                    bgColor="bg-slate-100"
                    isLoading={isLoading}
                />
            </div>

            {/* NPS Placeholder */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                        <ShieldCheck size={20} />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-800">NPS / Satisfacao do Cliente</p>
                        <p className="text-xs text-slate-400">Sistema de feedback em desenvolvimento. Dados estarao disponiveis apos implementacao.</p>
                    </div>
                </div>
            </div>

            {/* Timeline de Sub-cards */}
            <ChartCard
                title="Solicitacoes de Mudanca"
                description="Tendencia semanal de sub-cards criados"
                isLoading={isLoading}
            >
                {timeline.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={timeline} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis
                                dataKey="week"
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(v: string) => v.slice(5)}
                            />
                            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                            <Line type="monotone" dataKey="count" name="Mudancas" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: '#6366f1' }} />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-[250px] flex items-center justify-center text-sm text-slate-400">
                        Nenhum dado de mudancas
                    </div>
                )}
            </ChartCard>

            {/* Qualidade por Planner */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-800">Qualidade por Planner</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Taxa de mudancas por Planner que montou a viagem</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/50">
                                <th className="text-left px-6 py-3 font-medium text-slate-500">Planner</th>
                                <th className="text-right px-4 py-3 font-medium text-slate-500">Viagens</th>
                                <th className="text-right px-4 py-3 font-medium text-slate-500">Mudancas</th>
                                <th className="text-right px-4 py-3 font-medium text-slate-500">Mud./Viagem</th>
                                <th className="text-right px-6 py-3 font-medium text-slate-500">Receita</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <tr key={i} className="border-b border-slate-50">
                                        <td colSpan={5} className="px-6 py-4">
                                            <div className="h-4 bg-slate-100 rounded animate-pulse" />
                                        </td>
                                    </tr>
                                ))
                            ) : planners.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                                        Nenhum planner com viagens no periodo
                                    </td>
                                </tr>
                            ) : (
                                planners.map((p) => (
                                    <tr key={p.planner_nome} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-3 font-medium text-slate-800">{p.planner_nome}</td>
                                        <td className="text-right px-4 py-3 text-slate-600">{p.viagens}</td>
                                        <td className="text-right px-4 py-3 text-slate-600">{p.mudancas}</td>
                                        <td className="text-right px-4 py-3">
                                            <span className={cn(
                                                'font-medium',
                                                p.mudancas_por_viagem <= 0.5 ? 'text-green-600' :
                                                    p.mudancas_por_viagem <= 1 ? 'text-amber-600' : 'text-rose-600'
                                            )}>
                                                {p.mudancas_por_viagem}
                                            </span>
                                        </td>
                                        <td className="text-right px-6 py-3 text-slate-700 font-medium">{formatCurrency(p.receita)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Workload Chart */}
            <ChartCard
                title="Viagens por Planner"
                description="Distribuicao de viagens realizadas"
                isLoading={isLoading}
            >
                {planners.length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.max(200, planners.length * 40 + 40)}>
                        <BarChart
                            data={planners.map(p => ({ name: p.planner_nome, viagens: p.viagens, mudancas: p.mudancas }))}
                            layout="vertical"
                            margin={{ left: 10, right: 30 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                            <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                            <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11, fill: '#334155' }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                            <Bar dataKey="viagens" fill="#22c55e" radius={[0, 4, 4, 0]} barSize={18} name="Viagens" />
                            <Bar dataKey="mudancas" fill="#f97316" radius={[0, 4, 4, 0]} barSize={18} name="Mudancas" />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">
                        Nenhum dado de viagens por planner
                    </div>
                )}
            </ChartCard>
        </div>
    )
}
