import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Inbox, MessageCircle, CalendarCheck, Trophy, Loader2, ArrowRightLeft } from 'lucide-react'
import KpiCard from '@/components/analytics/KpiCard'
import { useFunnelConversion, useLossReasons } from '@/hooks/analytics/useFunnelConversion'
import { useTeamLeaderboard } from '@/hooks/analytics/useTeamLeaderboard'
import { useAnalyticsFilters } from '@/hooks/analytics/useAnalyticsFilters'
import { useResumoOverview, useResumoOverviewPrevious } from '@/hooks/analytics/useResumoOverview'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { useFilterProfilesWithRole } from '@/hooks/analytics/useFilterOptions'
import { supabase } from '@/lib/supabase'
import WidgetCard from './WidgetCard'
import SimpleFilterBar from './SimpleFilterBar'
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
const SDR_MILESTONES: Array<{ key: string; label: string; match: (n: string) => boolean }> = [
  { key: 'novo', label: 'Novos leads', match: n => /novo\s*lead|entrada|primeiro/i.test(n) },
  { key: 'conectado', label: 'Conectados', match: n => /conectad/i.test(n) },
  { key: 'reuniao', label: 'Reunião agendada', match: n => /reuni[aã]o|meeting|agendad/i.test(n) },
  { key: 'qualificado', label: 'Qualificados', match: n => /apresenta[cç][aã]o|qualif/i.test(n) },
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
  const funnel = useFunnelConversion()
  const lossReasons = useLossReasons()
  const leaderboard = useTeamLeaderboard()
  const resumo = useResumoOverview()
  const resumoPrev = useResumoOverviewPrevious()
  const followThrough = useSdrFollowThroughLocal()
  const profilesByRole = useFilterProfilesWithRole()
  const drillDown = useDrillDownStore()
  const { origins, setOrigins } = useAnalyticsFilters()

  // IDs de quem é SDR de verdade (role='sdr') no workspace atual
  const sdrIds = useMemo(() => {
    const set = new Set<string>()
    for (const p of profilesByRole.data ?? []) {
      if (p.role === 'sdr') set.add(p.id)
    }
    return set
  }, [profilesByRole.data])

  // Etapas SDR ordenadas
  const sdrStages = useMemo(() => {
    return (funnel.data ?? []).filter(s => s.phase_slug === 'sdr').sort((a, b) => a.ordem - b.ordem)
  }, [funnel.data])
  const topStage = sdrStages[0]
  const topCount = topStage?.current_count ?? 0

  // Marcos do funil mapeados pelas etapas reais
  const milestoneStages = useMemo(() => {
    return SDR_MILESTONES.map(m => {
      const stage = sdrStages.find(s => m.match(s.stage_nome))
      return { ...m, stage }
    })
  }, [sdrStages])

  // Leaderboard só com profiles que TÊM role='sdr'
  const sdrLeaderboard = useMemo(() => {
    return (leaderboard.data ?? []).filter(row => sdrIds.has(row.user_id))
  }, [leaderboard.data, sdrIds])

  // Quando há filtro de pessoa global ativo, exibe info
  const prevLeads = resumoPrev.data?.empresa.kpis.leads_entrada

  const openCardsInStage = (stageId: string, stageName: string) => {
    drillDown.open({
      label: `Cards na etapa: ${stageName}`,
      drillStageId: stageId,
      drillSource: 'current_stage',
    })
  }

  const openCardsByOwner = (ownerId: string, ownerName: string) => {
    drillDown.open({
      label: `Cards de ${ownerName}`,
      drillSource: 'current_stage',
      drillOwnerId: ownerId,
    })
  }

  const openLostCards = (reason?: string) => {
    drillDown.open({
      label: reason ? `Perdidos: ${reason}` : 'Cards perdidos',
      drillSource: 'lost_deals',
      drillLossReason: reason,
      drillStatus: 'perdido',
    })
  }

  const openLeadsByOrigin = (origem: string) => {
    // Filtro global de origem — re-filtra toda a página
    setOrigins([origem])
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">SDR — Pré-venda</h1>
        <p className="text-sm text-slate-500 mt-1">
          Atividade de quem qualifica os leads que entram: quantos chegaram, quantos conectaram,
          quantos viraram reunião e quantos foram passados pro Planner. Clique em qualquer número pra ver os leads.
        </p>
      </header>

      <SimpleFilterBar roleFilter="sdr" myButtonLabel="Meus leads" />

      {/* Aviso quando há filtro de origem global ativo */}
      {origins.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center justify-between">
          <span className="text-xs text-amber-800">
            Filtrando por origem: <strong>{origins.map(o => ORIGEM_LABELS[o] ?? o).join(', ')}</strong>
          </span>
          <button onClick={() => setOrigins([])} className="text-xs text-amber-700 underline">
            limpar
          </button>
        </div>
      )}

      {/* KPIs hero — funil em números, clicáveis */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Novos leads no período"
          value={milestoneStages[0].stage?.current_count ?? resumo.data?.empresa.kpis.leads_entrada ?? 0}
          icon={Inbox}
          color="text-blue-600"
          bgColor="bg-blue-50"
          isLoading={funnel.isLoading}
          delta={prevLeads !== undefined ? {
            current: milestoneStages[0].stage?.current_count ?? 0,
            previous: prevLeads,
          } : undefined}
          onClick={milestoneStages[0].stage ? () => openCardsInStage(milestoneStages[0].stage!.stage_id, milestoneStages[0].stage!.stage_nome) : undefined}
          clickHint={milestoneStages[0].stage ? 'Ver leads →' : undefined}
        />
        <KpiCard
          title="Conectados"
          value={milestoneStages[1].stage?.current_count ?? 0}
          icon={MessageCircle}
          color="text-indigo-600"
          bgColor="bg-indigo-50"
          isLoading={funnel.isLoading}
          onClick={milestoneStages[1].stage ? () => openCardsInStage(milestoneStages[1].stage!.stage_id, milestoneStages[1].stage!.stage_nome) : undefined}
          clickHint={milestoneStages[1].stage ? 'Ver leads →' : undefined}
        />
        <KpiCard
          title="Reuniões agendadas"
          value={milestoneStages[2].stage?.current_count ?? 0}
          icon={CalendarCheck}
          color="text-purple-600"
          bgColor="bg-purple-50"
          isLoading={funnel.isLoading}
          onClick={milestoneStages[2].stage ? () => openCardsInStage(milestoneStages[2].stage!.stage_id, milestoneStages[2].stage!.stage_nome) : undefined}
          clickHint={milestoneStages[2].stage ? 'Ver leads →' : undefined}
        />
        <KpiCard
          title="Qualificados (passados pro Planner)"
          value={milestoneStages[3].stage?.current_count ?? 0}
          icon={Trophy}
          color="text-emerald-600"
          bgColor="bg-emerald-50"
          isLoading={funnel.isLoading}
          onClick={milestoneStages[3].stage ? () => openCardsInStage(milestoneStages[3].stage!.stage_id, milestoneStages[3].stage!.stage_nome) : undefined}
          clickHint={milestoneStages[3].stage ? 'Ver leads →' : undefined}
        />
      </div>

      {/* Funil SDR — barras clicáveis */}
      <WidgetCard
        title="Funil de qualificação SDR"
        subtitle="Quantos cards estão em cada etapa e a % em relação ao primeiro passo. Clique numa barra pra ver os cards."
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
                <button
                  key={stage.stage_id}
                  onClick={() => openCardsInStage(stage.stage_id, stage.stage_nome)}
                  className="w-full flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-indigo-50 transition-colors group"
                >
                  <span className="text-sm text-slate-700 group-hover:text-indigo-700 w-48 truncate text-left">{stage.stage_nome}</span>
                  <div className="flex-1 bg-slate-100 rounded h-6 overflow-hidden">
                    <div
                      className="bg-indigo-500 group-hover:bg-indigo-600 h-full transition-all"
                      style={{ width: `${Math.max(2, Math.min(100, conv))}%` }}
                    />
                  </div>
                  <span className="w-12 text-sm text-slate-700 tabular-nums text-right">
                    {stage.current_count}
                  </span>
                  <span className="w-14 text-right">
                    <ConversionBadge rate={conv} />
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </WidgetCard>

      {/* Leaderboard SDR — só quem tem role='sdr', clicável */}
      <WidgetCard
        title="Ranking dos SDRs"
        subtitle={`Apenas pessoas com função SDR (${sdrIds.size} no workspace). Clique numa pessoa pra ver os cards dela.`}
      >
        {leaderboard.isLoading || profilesByRole.isLoading ? (
          <div className="h-40 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : sdrLeaderboard.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400 flex-col gap-1">
            <p>Nenhum SDR atuou no período</p>
            {sdrIds.size === 0 && (
              <p className="text-xs text-slate-300">Nenhuma pessoa com função SDR cadastrada — configure em Configurações &gt; Times</p>
            )}
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
                  <tr
                    key={row.user_id}
                    className="border-b border-slate-50 hover:bg-indigo-50 cursor-pointer"
                    onClick={() => openCardsByOwner(row.user_id, row.user_nome)}
                  >
                    <td className="py-2.5 text-slate-400 tabular-nums">{idx + 1}</td>
                    <td className="py-2.5 text-slate-900 font-medium">
                      <span className="hover:text-indigo-700 hover:underline">{row.user_nome}</span>
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
        subtitle="De cada SDR — quantos leads ele passou e quantos depois fecharam venda com o Planner. Clique pra ver os cards."
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
                      <tr
                        key={row.sdr_id ?? row.sdr_name ?? 'sem'}
                        className={cn('border-b border-slate-50', row.sdr_id && 'hover:bg-indigo-50 cursor-pointer')}
                        onClick={row.sdr_id ? () => openCardsByOwner(row.sdr_id!, row.sdr_name ?? '') : undefined}
                      >
                        <td className="py-2.5 text-slate-900 font-medium">
                          <span className={row.sdr_id ? 'hover:text-indigo-700 hover:underline' : 'text-slate-400'}>
                            {row.sdr_name ?? 'Sem SDR atribuído'}
                          </span>
                        </td>
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

      {/* Motivos de perda — clicáveis */}
      <WidgetCard
        title="Por que perdemos leads no SDR"
        subtitle="Motivos mais frequentes. Clique pra ver os cards perdidos por aquele motivo."
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
              <button
                key={reason.motivo}
                onClick={() => openLostCards(reason.motivo)}
                className="w-full flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-rose-50 transition-colors group"
              >
                <span className="text-sm text-slate-700 group-hover:text-rose-700 w-72 truncate text-left" title={reason.motivo}>
                  {reason.motivo || 'Sem motivo informado'}
                </span>
                <div className="flex-1 bg-slate-100 rounded h-5 overflow-hidden">
                  <div
                    className="bg-rose-400 group-hover:bg-rose-500 h-full"
                    style={{ width: `${Math.max(2, reason.percentage)}%` }}
                  />
                </div>
                <span className="w-12 text-sm text-slate-700 tabular-nums text-right">{reason.count}</span>
                <span className="w-12 text-sm text-rose-700 tabular-nums text-right">
                  {reason.percentage.toFixed(0)}%
                </span>
              </button>
            ))}
          </div>
        )}
      </WidgetCard>

      {/* Leads por origem — clicáveis */}
      <WidgetCard
        title="De onde vieram os leads"
        subtitle="Quantos leads entraram por cada canal. Clique numa linha pra filtrar a página inteira por aquela origem."
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
                </tr>
              </thead>
              <tbody>
                {resumo.data.por_origem.map(row => {
                  const conv = row.leads > 0 ? Math.round((row.ganhos / row.leads) * 100) : 0
                  const isActive = origins.includes(row.origem)
                  return (
                    <tr
                      key={row.origem}
                      onClick={() => openLeadsByOrigin(row.origem)}
                      className={cn('border-b border-slate-50 hover:bg-indigo-50 cursor-pointer', isActive && 'bg-indigo-50')}
                    >
                      <td className="py-2.5 text-slate-900 font-medium">
                        <span className="hover:text-indigo-700 hover:underline">
                          {ORIGEM_LABELS[row.origem] ?? row.origem}
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.leads}</td>
                      <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.ganhos}</td>
                      <td className="py-2.5 text-right">
                        <ConversionBadge rate={conv} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="text-xs text-slate-400 mt-3">
              Clicar numa origem aplica como filtro nessa página. Volte limpando o filtro no topo.
            </p>
          </div>
        )}
      </WidgetCard>
    </div>
  )
}
