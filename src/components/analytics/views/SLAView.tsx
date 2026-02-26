import {
    Timer, CheckCircle, AlertTriangle,
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import KpiCard from '../KpiCard'
import ChartCard from '../ChartCard'
import { useSLAViolations, useSLASummary } from '@/hooks/analytics/useSLAData'
import { cn } from '@/lib/utils'

export default function SLAView() {
    const { data: violations, isLoading: violationsLoading } = useSLAViolations()
    const { data: summary, isLoading: summaryLoading } = useSLASummary()

    const stagesWithSLA = (summary || []).filter(s => s.sla_hours > 0)
    const totalWithSLA = stagesWithSLA.reduce((sum, s) => sum + s.total_cards, 0)
    const totalCompliant = stagesWithSLA.reduce((sum, s) => sum + s.compliant_cards, 0)
    const overallCompliance = totalWithSLA > 0
        ? Math.round(totalCompliant / totalWithSLA * 100 * 10) / 10
        : 0
    const totalViolating = (violations || []).length

    // Aging buckets (SDR >2d, Planner >3d, Proposta >5d)
    const agingBuckets = {
        sdr: (violations || []).filter(v => {
            const nome = v.stage_nome?.toLowerCase() || ''
            return nome.includes('lead') || nome.includes('contato') || nome.includes('conectado')
        }).length,
        planner: (violations || []).filter(v => {
            const nome = v.stage_nome?.toLowerCase() || ''
            return nome.includes('briefing') || nome.includes('proposta em') || nome.includes('qualificado')
        }).length,
        proposta: (violations || []).filter(v => {
            const nome = v.stage_nome?.toLowerCase() || ''
            return nome.includes('proposta enviada') || nome.includes('ajustes')
        }).length,
    }

    return (
        <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <KpiCard
                    title="% Dentro do SLA"
                    value={`${overallCompliance}%`}
                    icon={CheckCircle}
                    color={overallCompliance >= 80 ? 'text-green-600' : 'text-amber-600'}
                    bgColor={overallCompliance >= 80 ? 'bg-green-50' : 'bg-amber-50'}
                    isLoading={summaryLoading}
                />
                <KpiCard
                    title="Cards em Violacao"
                    value={totalViolating}
                    icon={AlertTriangle}
                    color="text-rose-600"
                    bgColor="bg-rose-50"
                    isLoading={violationsLoading}
                />
                <KpiCard
                    title="Etapas com SLA"
                    value={stagesWithSLA.length}
                    icon={Timer}
                    color="text-sky-600"
                    bgColor="bg-sky-50"
                    isLoading={summaryLoading}
                />
            </div>

            {/* Aging Alert Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <AgingCard
                    title="Parados no SDR (>2 dias)"
                    subtitle="Leads sem qualificacao"
                    count={agingBuckets.sdr}
                    severity="high"
                    isLoading={violationsLoading}
                />
                <AgingCard
                    title="Parados no Planner (>3 dias)"
                    subtitle="Aguardando proposta"
                    count={agingBuckets.planner}
                    severity="medium"
                    isLoading={violationsLoading}
                />
                <AgingCard
                    title="Proposta Enviada (>5 dias)"
                    subtitle="Sem resposta do cliente"
                    count={agingBuckets.proposta}
                    severity="warning"
                    isLoading={violationsLoading}
                />
            </div>

            {/* Compliance by Stage Chart */}
            <ChartCard
                title="Tempo Medio vs SLA por Etapa"
                description="Horas medias na etapa comparadas ao SLA configurado"
                isLoading={summaryLoading}
            >
                {stagesWithSLA.length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.max(250, stagesWithSLA.length * 40 + 40)}>
                        <BarChart
                            data={stagesWithSLA.map(s => ({
                                name: s.stage_nome,
                                horas: Math.round(s.avg_hours_in_stage),
                                sla: s.sla_hours,
                                compliance: s.compliance_rate,
                            }))}
                            layout="vertical"
                            margin={{ left: 10, right: 40 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                            <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} label={{ value: 'Horas', position: 'insideBottom', offset: -5, fontSize: 11, fill: '#94a3b8' }} />
                            <YAxis
                                dataKey="name"
                                type="category"
                                width={160}
                                tick={{ fontSize: 11, fill: '#334155' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                                formatter={(value: number, name: string) => [
                                    `${value}h`,
                                    name === 'horas' ? 'Tempo medio' : 'SLA'
                                ]}
                            />
                            <Bar dataKey="horas" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={16} name="horas" />
                            <ReferenceLine x={0} stroke="#e2e8f0" />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-[250px] flex items-center justify-center text-sm text-slate-400">
                        Nenhuma etapa com SLA configurado
                    </div>
                )}
            </ChartCard>

            {/* Risk Table */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                    <h3 className="text-sm font-semibold text-slate-800">Cards em Risco (SLA Estourado)</h3>
                    {!violationsLoading && (
                        <span className="ml-auto text-xs text-slate-400">{(violations || []).length} cards</span>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/50">
                                <th className="text-left px-6 py-3 font-medium text-slate-500">Card</th>
                                <th className="text-left px-4 py-3 font-medium text-slate-500">Etapa</th>
                                <th className="text-left px-4 py-3 font-medium text-slate-500">Responsavel</th>
                                <th className="text-right px-4 py-3 font-medium text-slate-500">Dias Parado</th>
                                <th className="text-right px-4 py-3 font-medium text-slate-500">SLA (h)</th>
                                <th className="text-right px-6 py-3 font-medium text-slate-500">Excedido (h)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {violationsLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="border-b border-slate-50">
                                        <td colSpan={6} className="px-6 py-4">
                                            <div className="h-4 bg-slate-100 rounded animate-pulse" />
                                        </td>
                                    </tr>
                                ))
                            ) : (violations || []).length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                                        Nenhum card em violacao de SLA
                                    </td>
                                </tr>
                            ) : (
                                (violations || []).slice(0, 20).map((v) => (
                                    <tr key={v.card_id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-3 font-medium text-slate-800 max-w-[200px] truncate">{v.titulo}</td>
                                        <td className="px-4 py-3 text-slate-600">{v.stage_nome}</td>
                                        <td className="px-4 py-3 text-slate-600">{v.owner_nome || '—'}</td>
                                        <td className="text-right px-4 py-3">
                                            <span className={cn(
                                                'font-medium',
                                                v.dias_na_etapa > 7 ? 'text-rose-600' : v.dias_na_etapa > 3 ? 'text-amber-600' : 'text-slate-600'
                                            )}>
                                                {v.dias_na_etapa}
                                            </span>
                                        </td>
                                        <td className="text-right px-4 py-3 text-slate-500">{v.sla_hours}</td>
                                        <td className="text-right px-6 py-3">
                                            <span className="text-rose-600 font-medium">+{Math.round(v.sla_exceeded_hours)}h</span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

function AgingCard({ title, subtitle, count, severity, isLoading }: {
    title: string
    subtitle: string
    count: number
    severity: 'high' | 'medium' | 'warning'
    isLoading: boolean
}) {
    const colors = {
        high: { icon: 'text-rose-500', bg: 'bg-rose-50', value: 'text-rose-600' },
        medium: { icon: 'text-amber-500', bg: 'bg-amber-50', value: 'text-amber-600' },
        warning: { icon: 'text-orange-500', bg: 'bg-orange-50', value: 'text-orange-600' },
    }[severity]

    if (isLoading) {
        return <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 h-24 animate-pulse" />
    }

    return (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
            <div className="flex items-start justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className={cn('w-4 h-4', colors.icon)} />
                        <p className="text-sm font-medium text-slate-700">{title}</p>
                    </div>
                    <p className="text-xs text-slate-400">{subtitle}</p>
                </div>
                <p className={cn('text-2xl font-bold', colors.value)}>{count}</p>
            </div>
        </div>
    )
}
