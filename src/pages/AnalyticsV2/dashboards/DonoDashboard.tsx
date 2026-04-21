import { useEffect, useMemo } from 'react'
import { DollarSign, Target, TrendingUp, AlertTriangle, Users, Clock } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar
} from 'recharts'
import KpiCard from '@/components/analytics/KpiCard'
import WidgetCard from '../WidgetCard'
import {
  useOverviewKpisV2,
  useRevenueTimeseriesV2,
  useStageConversion,
  useReworkRate,
  useLeadEntryPathBreakdown,
  useTopDestinationsV2,
} from '@/hooks/analyticsV2/useAnalyticsV2Rpcs'
import { useAnalyticsV2Filters } from '@/hooks/analyticsV2/useAnalyticsV2Filters'

function formatBRL(v: number | null | undefined): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

function formatPct(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${v.toFixed(1)}%`
}

export default function DonoDashboard() {
  const applyPersonaDefaults = useAnalyticsV2Filters(s => s.applyPersonaDefaults)
  useEffect(() => { applyPersonaDefaults('dono') }, [applyPersonaDefaults])

  const { data: kpis, isLoading: loadingKpis } = useOverviewKpisV2()
  const { data: timeseries, isLoading: loadingTs } = useRevenueTimeseriesV2()
  const { data: stageConv, isLoading: loadingSc } = useStageConversion()
  const { data: rework, isLoading: loadingRw } = useReworkRate()
  const { data: paths, isLoading: loadingPath } = useLeadEntryPathBreakdown()
  const { data: destinos, isLoading: loadingDest } = useTopDestinationsV2()

  const chartData = useMemo(() => (timeseries ?? []).map(p => ({
    period: p.period,
    receita: Number(p.total_receita ?? 0),
  })), [timeseries])

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">👑 Dono</h1>
        <p className="text-sm text-slate-500 mt-1">Visão macro do negócio — receita, funil, riscos.</p>
      </header>

      {/* Norte (KPI principal) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Receita do período"
          value={formatBRL(kpis?.receita_total as number | null)}
          icon={DollarSign}
          color="text-emerald-600"
          bgColor="bg-emerald-50"
          isLoading={loadingKpis}
        />
        <KpiCard
          title="Ganhos Planner"
          value={String(kpis?.ganho_planner_count ?? '—')}
          subtitle={kpis?.ganho_planner_rate != null ? `${Number(kpis.ganho_planner_rate).toFixed(1)}% conversão` : undefined}
          icon={Target}
          color="text-indigo-600"
          bgColor="bg-indigo-50"
          isLoading={loadingKpis}
        />
        <KpiCard
          title="Ticket médio"
          value={formatBRL(kpis?.ticket_medio as number | null)}
          icon={TrendingUp}
          color="text-blue-600"
          bgColor="bg-blue-50"
          isLoading={loadingKpis}
        />
        <KpiCard
          title="Retrabalho"
          value={rework ? formatPct(rework.rework_pct) : '—'}
          subtitle={rework ? `${rework.rework_count} de ${rework.total_moved} cards movidos` : undefined}
          icon={AlertTriangle}
          color="text-amber-600"
          bgColor="bg-amber-50"
          isLoading={loadingRw}
        />
      </div>

      {/* Receita ao longo do tempo */}
      <WidgetCard title="Receita ao longo do tempo" subtitle="Ganho Planner agregado por mês">
        {loadingTs ? (
          <div className="h-64 flex items-center justify-center text-sm text-slate-400">Carregando…</div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm text-slate-400">Sem dados no período</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1"
                tickFormatter={(v) => new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(v as number)} />
              <Tooltip
                formatter={(v: number) => formatBRL(v)}
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
              />
              <Line type="monotone" dataKey="receita" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </WidgetCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funil de conversão por etapa */}
        <WidgetCard title="Conversão por etapa" subtitle="% que avançou pra uma etapa com ordem maior">
          {loadingSc ? (
            <div className="h-56 flex items-center justify-center text-sm text-slate-400">Carregando…</div>
          ) : !stageConv || stageConv.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-sm text-slate-400">Sem movimentos no período</div>
          ) : (
            <div className="space-y-2">
              {stageConv.slice(0, 8).map(s => (
                <div key={s.stage_id} className="flex items-center gap-3">
                  <div className="w-32 text-xs text-slate-600 truncate" title={s.stage_name}>{s.stage_name}</div>
                  <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden relative">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, s.conversion_pct)}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[11px] font-medium text-slate-700">
                      {s.conversion_pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-16 text-right text-xs text-slate-500">
                    {s.advanced}/{s.entered}
                  </div>
                </div>
              ))}
            </div>
          )}
        </WidgetCard>

        {/* Caminho de entrada */}
        <WidgetCard title="Caminho de entrada dos leads" subtitle="Conversão e ticket por origem do funil">
          {loadingPath ? (
            <div className="h-56 flex items-center justify-center text-sm text-slate-400">Carregando…</div>
          ) : !paths || paths.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-sm text-slate-400">Sem dados</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-500">
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 font-medium">Caminho</th>
                    <th className="text-right py-2 font-medium">Leads</th>
                    <th className="text-right py-2 font-medium">Ganhos</th>
                    <th className="text-right py-2 font-medium">Conv.</th>
                    <th className="text-right py-2 font-medium">Ticket</th>
                  </tr>
                </thead>
                <tbody>
                  {paths.map(p => (
                    <tr key={p.entry_path} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 font-medium text-slate-900">{labelPath(p.entry_path)}</td>
                      <td className="py-2 text-right text-slate-600">{p.total_leads}</td>
                      <td className="py-2 text-right text-slate-600">{p.wins}</td>
                      <td className="py-2 text-right text-slate-600">{formatPct(p.conversion_pct)}</td>
                      <td className="py-2 text-right text-slate-600">{formatBRL(p.avg_ticket)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WidgetCard>
      </div>

      {/* Top destinos */}
      <WidgetCard title="Top destinos por receita">
        {loadingDest ? (
          <div className="h-56 flex items-center justify-center text-sm text-slate-400">Carregando…</div>
        ) : !destinos || destinos.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-sm text-slate-400">Sem destinos no período</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={destinos.slice(0, 10)} margin={{ top: 5, right: 20, left: 10, bottom: 5 }} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1"
                tickFormatter={(v) => new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(v as number)} />
              <YAxis type="category" dataKey="destino" tick={{ fontSize: 12, fill: '#64748b' }} stroke="#cbd5e1" width={100} />
              <Tooltip formatter={(v: number) => formatBRL(v)} contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="receita_total" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </WidgetCard>

      {/* Rodapé com contadores secundários */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="Leads no período" value={String(kpis?.total_leads ?? '—')} icon={Users}
          color="text-slate-600" bgColor="bg-slate-100" isLoading={loadingKpis} />
        <KpiCard title="Em aberto" value={String(kpis?.total_open ?? '—')} icon={Clock}
          color="text-slate-600" bgColor="bg-slate-100" isLoading={loadingKpis} />
        <KpiCard title="Ciclo médio (dias)" value={String(kpis?.ciclo_medio_dias ?? '—')} icon={Clock}
          color="text-slate-600" bgColor="bg-slate-100" isLoading={loadingKpis} />
        <KpiCard title="Viagens vendidas" value={String(kpis?.viagens_vendidas ?? '—')} icon={Target}
          color="text-slate-600" bgColor="bg-slate-100" isLoading={loadingKpis} />
      </div>
    </div>
  )
}

function labelPath(path: string): string {
  switch (path) {
    case 'full_funnel': return 'Funil completo'
    case 'direct_planner': return 'Direto ao Planner'
    case 'returning': return 'Cliente recorrente'
    case 'referred': return 'Indicação'
    case 'unknown': return 'Desconhecido'
    default: return path
  }
}
