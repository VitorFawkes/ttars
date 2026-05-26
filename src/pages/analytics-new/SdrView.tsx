import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Inbox, MessageCircle, CalendarCheck, Trophy, Loader2, ArrowRightLeft } from 'lucide-react'
import KpiCard from '@/components/analytics/KpiCard'
import { useFunnelConversion, useLossReasons } from '@/hooks/analytics/useFunnelConversion'
import { useTeamLeaderboard } from '@/hooks/analytics/useTeamLeaderboard'
import { useTeamPerformance } from '@/hooks/analytics/useTeamPerformance'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { useResumoOverview, useResumoOverviewPrevious } from '@/hooks/analytics/useResumoOverview'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/utils/whatsappFormatters'
import WidgetCard from './WidgetCard'
import { cn } from '@/lib/utils'

interface SdrFollowThroughRow {
  sdr_id: string | null
  sdr_name: string | null
  total: number
  won: number
  follow_through_pct: number
}

interface SdrFollowThroughResponse {
  total_handoffs: number
  handoffs_won: number
  follow_through_pct: number
  by_sdr: SdrFollowThroughRow[]
}

function useSdrFollowThroughLocal() {
  const { dateRange, product, ownerIds } = useAnalyticsFilters()
  return useQuery({
    queryKey: ['analytics', 'sdr_follow_through_v1', dateRange.start, dateRange.end, product, ownerIds],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC tipada via JSON
      const { data, error } = await (supabase.rpc as any)('analytics_sdr_follow_through', {
        p_date_start: dateRange.start,
        p_date_end: dateRange.end,
        p_product: product,
        p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
      })
      if (error) throw error
      const row = (data as SdrFollowThroughResponse[] | null)?.[0]
      return row ?? null
    },
    staleTime: 5 * 60 * 1000,
  })
}

// Etapas reconhecidas como marcos do funil SDR. Usado para cards de KPI.
// O matcher é por substring lowercase para sobreviver a variações ("Conectado", "Lead Conectado" etc).
const SDR_MILESTONES: Array<{ key: string; label: string; match: (n: string) => boolean }> = [
  { key: 'novo', label: 'Novos leads', match: n => /novo\s*lead|entrada/i.test(n) },
  { key: 'conectado', label: 'Conectados', match: n => /conectad/i.test(n) },
  { key: 'reuniao', label: 'Reunião agendada', match: n => /reuni[aã]o|meeting/i.test(n) },
  { key: 'qualificado', label: 'Qualificados (Apresentação)', match: n => /apresenta[cç][aã]o|qualif/i.test(n) },
]

const ORIGEM_LABELS: Record<string, string> = {
  manual: 'Planner direto',
  whatsapp: 'WhatsApp (Julia)',
  active_campaign: 'Active Campaign',
  mkt: 'Marketing',
  indicacao: 'Indicação',
  carteira_propria: 'Carteira própria',
  carteira_wg: 'Carteira WG',
  sorrento: 'Sorrento',
  weddings: 'Weddings (cruzado)',
  sem_origem: 'Sem origem',
}

function pct(v: number): string {
  return `${v.toFixed(0)}%`
}

function ConversionBadge({ rate }: { rate: number }) {
  const tone =
    rate >= 50 ? 'bg-emerald-50 text-emerald-700'
    : rate >= 30 ? 'bg-amber-50 text-amber-700'
    : 'bg-rose-50 text-rose-700'
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums', tone)}>
      {pct(rate)}
    </span>
  )
}

export default function SdrView() {
  const [individualUser, setIndividualUser] = useState<string | null>(null)
  void individualUser // placeholder para futuro drawer

  const funnel = useFunnelConversion()
  const lossReasons = useLossReasons()
  const leaderboard = useTeamLeaderboard()
  const sdrPerf = useTeamPerformance('sdr')
  const resumo = useResumoOverview()
  const resumoPrev = useResumoOverviewPrevious()
  const followThrough = useSdrFollowThroughLocal()

  const prevLeads = resumoPrev.data?.empresa.kpis.leads_entrada
  const prevGanhos = resumoPrev.data?.empresa.kpis.ganhos

  // Filtra apenas etapas SDR do funil
  const sdrStages = (funnel.data ?? []).filter(s => s.phase_slug === 'sdr').sort((a, b) => a.ordem - b.ordem)
  const topStage = sdrStages[0]
  const topCount = topStage?.current_count ?? 0

  // Resolve KPIs hero a partir das etapas do funil
  const milestoneCounts = SDR_MILESTONES.map(m => {
    const stage = sdrStages.find(s => m.match(s.stage_nome))
    return { ...m, count: stage?.current_count ?? 0 }
  })

  // Leaderboard só com quem atua em SDR
  const sdrLeaderboard = (leaderboard.data ?? []).filter(row => row.fases.includes('sdr'))

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">SDR — Pré-venda</h1>
        <p className="text-sm text-slate-500 mt-1">
          Atividade de quem qualifica os leads que entram: quantos chegaram, quantos conectaram,
          quantos viraram reunião e quantos foram passados pro Planner.
        </p>
      </header>

      {/* KPIs hero — funil em números */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Novos leads no período"
          value={milestoneCounts[0].count || resumo.data?.empresa.kpis.leads_entrada || 0}
          icon={Inbox}
          color="text-blue-600"
          bgColor="bg-blue-50"
          isLoading={funnel.isLoading}
          delta={prevLeads !== undefined ? {
            current: milestoneCounts[0].count || resumo.data?.empresa.kpis.leads_entrada || 0,
            previous: prevLeads,
          } : undefined}
        />
        <KpiCard
          title="Conectados"
          value={milestoneCounts[1].count}
          icon={MessageCircle}
          color="text-indigo-600"
          bgColor="bg-indigo-50"
          isLoading={funnel.isLoading}
        />
        <KpiCard
          title="Reuniões agendadas"
          value={milestoneCounts[2].count}
          icon={CalendarCheck}
          color="text-purple-600"
          bgColor="bg-purple-50"
          isLoading={funnel.isLoading}
        />
        <KpiCard
          title="Qualificados (passados pro Planner)"
          value={milestoneCounts[3].count}
          icon={Trophy}
          color="text-emerald-600"
          bgColor="bg-emerald-50"
          isLoading={funnel.isLoading}
          delta={prevGanhos !== undefined ? {
            current: milestoneCounts[3].count,
            previous: prevGanhos,
          } : undefined}
        />
      </div>

      {/* Funil SDR — etapas com conversão a partir do topo */}
      <WidgetCard
        title="Funil de qualificação SDR"
        subtitle="Cada etapa mostra quantos cards passaram e a % em relação ao primeiro passo (novos leads)"
      >
        {funnel.isLoading ? (
          <div className="h-40 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : sdrStages.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Sem etapas de SDR mapeadas no funil
          </div>
        ) : (
          <div className="space-y-2">
            {sdrStages.map(stage => {
              const conv = topCount > 0 ? (stage.current_count / topCount) * 100 : 0
              return (
                <div key={stage.stage_id} className="flex items-center gap-3">
                  <span className="text-sm text-slate-700 w-48 truncate">{stage.stage_nome}</span>
                  <div className="flex-1 bg-slate-100 rounded h-6 overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full transition-all"
                      style={{ width: `${Math.max(2, conv)}%` }}
                    />
                  </div>
                  <span className="w-12 text-sm text-slate-700 tabular-nums text-right">
                    {stage.current_count}
                  </span>
                  <span className="w-14 text-right">
                    <ConversionBadge rate={conv} />
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </WidgetCard>

      {/* Leaderboard SDR */}
      <WidgetCard
        title="Ranking dos SDRs"
        subtitle="Quem atua em SDR no período — leads na carteira, qualificados, perdidos"
      >
        {leaderboard.isLoading ? (
          <div className="h-40 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : sdrLeaderboard.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Nenhum SDR atuou no período
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">#</th>
                  <th className="text-left py-2 font-medium">Pessoa</th>
                  <th className="text-right py-2 font-medium">Leads envolvidos</th>
                  <th className="text-right py-2 font-medium">Qualificados</th>
                  <th className="text-right py-2 font-medium">Perdidos</th>
                  <th className="text-right py-2 font-medium">% Sucesso</th>
                  <th className="text-right py-2 font-medium">Abertos</th>
                  <th className="text-right py-2 font-medium">Tarefas vencidas</th>
                </tr>
              </thead>
              <tbody>
                {sdrLeaderboard.map((row, idx) => (
                  <tr key={row.user_id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 text-slate-400 tabular-nums">{idx + 1}</td>
                    <td className="py-2.5 text-slate-900 font-medium">
                      <button
                        onClick={() => setIndividualUser(row.user_id)}
                        className="hover:text-indigo-600 hover:underline text-left"
                      >
                        {row.user_nome}
                      </button>
                    </td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.cards_envolvidos}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.cards_ganhos}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      <span className={cn(row.cards_perdidos > 0 ? 'text-rose-700' : 'text-slate-400')}>
                        {row.cards_perdidos}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <ConversionBadge rate={row.win_rate} />
                    </td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.cards_abertos}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-md font-semibold',
                          row.tarefas_vencidas === 0
                            ? 'text-slate-400'
                            : row.tarefas_vencidas <= 3
                              ? 'text-amber-700 bg-amber-50'
                              : 'text-rose-700 bg-rose-50'
                        )}
                      >
                        {row.tarefas_vencidas}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>

      {/* Handoffs → Venda no Planner */}
      <WidgetCard
        title="Handoffs do SDR que viraram venda"
        subtitle="De cada SDR — quantos leads ele passou e quantos depois fecharam venda com o Planner"
        action={<ArrowRightLeft className="w-4 h-4 text-slate-300" />}
      >
        {followThrough.isLoading ? (
          <div className="h-40 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : !followThrough.data || followThrough.data.total_handoffs === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Nenhum handoff registrado no período
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl p-3 bg-blue-50">
                <p className="text-[10px] font-medium text-slate-600 uppercase tracking-wider">
                  Handoffs no período
                </p>
                <p className="text-2xl font-bold text-blue-700 tabular-nums">
                  {followThrough.data.total_handoffs}
                </p>
              </div>
              <div className="rounded-xl p-3 bg-emerald-50">
                <p className="text-[10px] font-medium text-slate-600 uppercase tracking-wider">
                  Viraram venda
                </p>
                <p className="text-2xl font-bold text-emerald-700 tabular-nums">
                  {followThrough.data.handoffs_won}
                </p>
              </div>
              <div className="rounded-xl p-3 bg-indigo-50">
                <p className="text-[10px] font-medium text-slate-600 uppercase tracking-wider">
                  % do total
                </p>
                <p className="text-2xl font-bold text-indigo-700 tabular-nums">
                  {followThrough.data.follow_through_pct?.toFixed(0) ?? 0}%
                </p>
              </div>
            </div>

            {followThrough.data.by_sdr && followThrough.data.by_sdr.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                      <th className="text-left py-2 font-medium">SDR</th>
                      <th className="text-right py-2 font-medium">Handoffs</th>
                      <th className="text-right py-2 font-medium">Viraram venda</th>
                      <th className="text-right py-2 font-medium">% Sucesso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {followThrough.data.by_sdr.map(row => (
                      <tr key={row.sdr_id ?? row.sdr_name ?? 'sem'} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2.5 text-slate-900 font-medium">{row.sdr_name ?? 'Sem SDR atribuído'}</td>
                        <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.total}</td>
                        <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.won}</td>
                        <td className="py-2.5 text-right">
                          <ConversionBadge rate={row.follow_through_pct} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </WidgetCard>

      {/* Performance SDR detalhada (com ciclo) */}
      <WidgetCard
        title="Detalhe por SDR"
        subtitle="Conversão, ticket médio dos leads passados e tempo médio até qualificar"
      >
        {sdrPerf.isLoading ? (
          <div className="h-40 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : !sdrPerf.data || sdrPerf.data.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Sem dados de performance SDR no período
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">Pessoa</th>
                  <th className="text-right py-2 font-medium">Total</th>
                  <th className="text-right py-2 font-medium">Qualificados</th>
                  <th className="text-right py-2 font-medium">Perdidos</th>
                  <th className="text-right py-2 font-medium">Abertos</th>
                  <th className="text-right py-2 font-medium">% Sucesso</th>
                  <th className="text-right py-2 font-medium">Ticket médio</th>
                  <th className="text-right py-2 font-medium">Dias até qualificar</th>
                </tr>
              </thead>
              <tbody>
                {sdrPerf.data.map(row => (
                  <tr key={row.user_id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 text-slate-900 font-medium">{row.user_nome}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.total_cards}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.won_cards}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.lost_cards}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.open_cards}</td>
                    <td className="py-2.5 text-right">
                      <ConversionBadge rate={row.conversion_rate} />
                    </td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">
                      {formatCurrency(row.ticket_medio)}
                    </td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">
                      {row.ciclo_medio_dias > 0 ? row.ciclo_medio_dias.toFixed(0) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>

      {/* Motivos de perda */}
      <WidgetCard
        title="Por que perdemos leads no SDR"
        subtitle="Os motivos mais frequentes — o ideal é o time preencher um motivo específico em cada perda"
      >
        {lossReasons.isLoading ? (
          <div className="h-40 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : !lossReasons.data || lossReasons.data.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Sem perdas registradas no período
          </div>
        ) : (
          <div className="space-y-2">
            {lossReasons.data.map(reason => (
              <div key={reason.motivo} className="flex items-center gap-3">
                <span className="text-sm text-slate-700 w-72 truncate" title={reason.motivo}>
                  {reason.motivo || 'Sem motivo informado'}
                </span>
                <div className="flex-1 bg-slate-100 rounded h-5 overflow-hidden">
                  <div
                    className="bg-rose-400 h-full"
                    style={{ width: `${Math.max(2, reason.percentage)}%` }}
                  />
                </div>
                <span className="w-12 text-sm text-slate-700 tabular-nums text-right">{reason.count}</span>
                <span className="w-12 text-sm text-rose-700 tabular-nums text-right">
                  {reason.percentage.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </WidgetCard>

      {/* Leads por origem */}
      <WidgetCard
        title="De onde vieram os leads"
        subtitle="Quantos leads entraram por cada canal no período"
      >
        {resumo.isLoading ? (
          <div className="h-32 bg-slate-50 rounded-lg animate-pulse" />
        ) : !resumo.data || resumo.data.por_origem.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Sem leads no período
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">Origem</th>
                  <th className="text-right py-2 font-medium">Leads</th>
                  <th className="text-right py-2 font-medium">Ganhos</th>
                  <th className="text-right py-2 font-medium">% Sucesso</th>
                  <th className="text-right py-2 font-medium">Faturamento</th>
                </tr>
              </thead>
              <tbody>
                {resumo.data.por_origem.map(row => {
                  const conv = row.leads > 0 ? Math.round((row.ganhos / row.leads) * 100) : 0
                  return (
                    <tr key={row.origem} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 text-slate-900 font-medium">
                        {ORIGEM_LABELS[row.origem] ?? row.origem}
                      </td>
                      <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.leads}</td>
                      <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.ganhos}</td>
                      <td className="py-2.5 text-right">
                        <ConversionBadge rate={conv} />
                      </td>
                      <td className="py-2.5 text-right text-slate-700 tabular-nums">
                        {formatCurrency(row.faturamento)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>
    </div>
  )
}
