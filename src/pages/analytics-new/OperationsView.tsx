import { useMemo } from 'react'
import { Plane, DollarSign, ReceiptText, TrendingUp, RefreshCw, Loader2, AlertTriangle, ExternalLink } from 'lucide-react'
import KpiCard from '@/components/analytics/KpiCard'
import { useOperationsData } from '@/hooks/analytics/useOperationsData'
import { useOperationsHealth, type OperationsHealthMotivo } from '@/hooks/analytics/useOperationsHealth'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { formatCurrency } from '@/utils/whatsappFormatters'
import { getRankTier, rankBadgeClass, rankTierLabel } from '@/utils/rankColor'
import WidgetCard from './WidgetCard'
import SimpleFilterBar from './SimpleFilterBar'
import { cn } from '@/lib/utils'

function formatWeek(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function OperationsView() {
  const { data, isLoading, error } = useOperationsData()
  const health = useOperationsHealth()
  const drillDown = useDrillDownStore()

  const kpis = data?.kpis
  const sub = data?.sub_card_stats
  const planners = data?.per_planner ?? []
  const timeline = data?.timeline ?? []

  const healthRows = health.data?.rows ?? []
  const totalHealthIssues = health.data?.totalCount ?? 0
  const totalDataAusente = health.data?.totalDataAusente ?? 0
  const totalEtapaErrada = health.data?.totalEtapaErrada ?? 0

  const openAllTrips = () => {
    drillDown.open({
      label: 'Viagens realizadas no período',
      drillSource: 'closed_deals',
    })
  }

  const openTripsByPlanner = (plannerId: string, plannerName: string) => {
    drillDown.open({
      label: `Viagens do consultor: ${plannerName}`,
      drillSource: 'closed_deals',
      drillOwnerId: plannerId,
    })
  }

  // Eixo do gráfico: máximo de viagens em uma semana
  const maxCount = timeline.length > 0 ? Math.max(...timeline.map(t => t.count), 1) : 1

  const plannersOrdenados = [...planners].sort((a, b) => b.viagens - a.viagens)

  // Sample para coloração relativa de mudanças por viagem (menos é melhor)
  const mudPorViagemSample = useMemo(
    () => plannersOrdenados.map(p => p.mudancas_por_viagem),
    [plannersOrdenados],
  )

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Operações de Pós-venda</h1>
        <p className="text-sm text-slate-500 mt-1">
          Viagens realizadas no período, retrabalho (sub-cards) e qualidade por consultor.
        </p>
      </header>

      <SimpleFilterBar roleFilter="vendas" showOrigins={false} myButtonLabel="Minhas viagens" />

      {/* KPIs principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Viagens realizadas"
          value={kpis?.viagens_realizadas ?? 0}
          icon={Plane}
          color="text-emerald-600"
          bgColor="bg-emerald-50"
          isLoading={isLoading}
          subtitle="Entregues no período selecionado"
          onClick={kpis && kpis.viagens_realizadas > 0 ? openAllTrips : undefined}
          clickHint="Ver as viagens"
        />
        <KpiCard
          title="Faturamento"
          value={kpis ? formatCurrency(kpis.valor_total) : 'R$ 0'}
          icon={DollarSign}
          color="text-indigo-600"
          bgColor="bg-indigo-50"
          isLoading={isLoading}
          subtitle="Soma de valor_final"
        />
        <KpiCard
          title="Receita (margem)"
          value={kpis ? formatCurrency(kpis.receita) : 'R$ 0'}
          icon={TrendingUp}
          color="text-emerald-600"
          bgColor="bg-emerald-50"
          isLoading={isLoading}
          subtitle="Margem das viagens"
        />
        <KpiCard
          title="Ticket médio"
          value={kpis ? formatCurrency(kpis.ticket_medio) : 'R$ 0'}
          icon={ReceiptText}
          color="text-indigo-600"
          bgColor="bg-indigo-50"
          isLoading={isLoading}
        />
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
          Erro ao carregar dados de operações.
        </div>
      )}

      {/* Saúde operacional do pós-venda — sinais de processo quebrado */}
      <WidgetCard
        title="Viagens com problema operacional"
        subtitle="Cards em pós-venda sem data de viagem preenchida ou em etapa errada para a data — sinal de quality gate violado ou cron de roteamento parado"
        action={
          health.isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          ) : totalHealthIssues > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-1 rounded-md">
              <AlertTriangle className="w-3.5 h-3.5" />
              {totalHealthIssues.toLocaleString('pt-BR')} {totalHealthIssues === 1 ? 'card' : 'cards'}
            </span>
          ) : (
            <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md font-medium">Tudo certo</span>
          )
        }
      >
        {health.isLoading ? (
          <div className="h-20 bg-slate-50 rounded-lg animate-pulse" />
        ) : totalHealthIssues === 0 ? (
          <div className="text-sm text-slate-500 py-3">
            Todas as viagens em pós-venda estão com data preenchida e na etapa coerente. ✅
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <HealthStatBlock
                label="Sem data de viagem"
                value={totalDataAusente}
                hint="Pós-venda exige data — quality gate pode ter sido violado em alguma janela"
                tone="rose"
              />
              <HealthStatBlock
                label="Em etapa errada"
                value={totalEtapaErrada}
                hint="Etapa atual não bate com a data da viagem — cron de roteamento pode ter falhado"
                tone="amber"
              />
            </div>

            {healthRows.length < totalHealthIssues && (
              <p className="text-[11px] text-slate-500 -mt-2">
                Mostrando primeiros {healthRows.length} de {totalHealthIssues.toLocaleString('pt-BR')} cards.
                Use filtro de consultor pra reduzir o escopo.
              </p>
            )}

            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                    <th className="text-left py-2 font-medium">Card</th>
                    <th className="text-left py-2 font-medium">Dono</th>
                    <th className="text-left py-2 font-medium">Etapa atual</th>
                    <th className="text-left py-2 font-medium">Etapa esperada</th>
                    <th className="text-left py-2 font-medium">Data da viagem</th>
                    <th className="text-left py-2 font-medium">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {healthRows.map(row => (
                    <tr key={row.card_id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 text-slate-900 font-medium max-w-[200px] truncate">
                        <a
                          href={`/cards/${row.card_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-indigo-600 inline-flex items-center gap-1"
                        >
                          {row.titulo}
                          <ExternalLink className="w-3 h-3 opacity-50" />
                        </a>
                      </td>
                      <td className="py-2.5 text-slate-600">{row.dono_atual_nome ?? '—'}</td>
                      <td className="py-2.5 text-slate-600 text-xs">{row.stage_atual_nome ?? '—'}</td>
                      <td className="py-2.5 text-slate-600 text-xs">{row.stage_esperado_nome ?? '—'}</td>
                      <td className="py-2.5 text-slate-600 tabular-nums text-xs">
                        {row.data_inicio
                          ? `${row.data_inicio.split('-').reverse().join('/')}` +
                            (row.data_fim ? ` → ${row.data_fim.split('-').reverse().join('/')}` : '')
                          : '—'}
                      </td>
                      <td className="py-2.5">
                        <MotivoBadge motivo={row.motivo} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </WidgetCard>

      {/* Estatísticas de retrabalho */}
      <WidgetCard
        title="Retrabalho (sub-cards)"
        subtitle="Mudanças solicitadas após venda fechada — quanto maior, mais retrabalho no pós-venda"
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatBlock
            label="Sub-cards criados"
            value={sub?.total_sub_cards ?? 0}
            tone="indigo"
            loading={isLoading}
          />
          <StatBlock
            label="Adições"
            value={sub?.additions_count ?? 0}
            tone="emerald"
            loading={isLoading}
            hint="Modo incremental (soma ao card pai)"
          />
          <StatBlock
            label="Mudanças"
            value={sub?.changes_count ?? 0}
            tone="amber"
            loading={isLoading}
            hint="Modo completo (substitui o card pai)"
          />
          <StatBlock
            label="Mudanças por viagem"
            value={sub?.changes_per_trip ? sub.changes_per_trip.toFixed(2) : '0'}
            tone="rose"
            loading={isLoading}
            hint={`${sub?.cards_with_changes ?? 0} viagens tiveram pelo menos 1 mudança`}
          />
        </div>
      </WidgetCard>

      {/* Qualidade por Planner */}
      <WidgetCard
        title="Qualidade por consultor"
        subtitle="Viagens entregues e retrabalho por planner — outliers acima da média geral indicam atenção"
      >
        {isLoading ? (
          <div className="h-40 flex items-center justify-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : plannersOrdenados.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Nenhuma viagem realizada no período selecionado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">Planner</th>
                  <th className="text-right py-2 font-medium">Viagens</th>
                  <th className="text-right py-2 font-medium">Adições</th>
                  <th className="text-right py-2 font-medium">Mudanças</th>
                  <th className="text-right py-2 font-medium">Mud./viagem</th>
                  <th className="text-right py-2 font-medium">Receita</th>
                </tr>
              </thead>
              <tbody>
                {plannersOrdenados.map(p => {
                  const tier = getRankTier(p.mudancas_por_viagem, mudPorViagemSample, 'lower_is_better')
                  return (
                    <tr key={p.planner_id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 text-slate-900 font-medium">
                        <button
                          onClick={() => openTripsByPlanner(p.planner_id, p.planner_nome)}
                          className="hover:text-indigo-600 hover:underline text-left"
                        >
                          {p.planner_nome}
                        </button>
                      </td>
                      <td className="py-2.5 text-right text-slate-700 tabular-nums">{p.viagens}</td>
                      <td className="py-2.5 text-right text-slate-700 tabular-nums">{p.additions}</td>
                      <td className="py-2.5 text-right text-slate-700 tabular-nums">{p.changes}</td>
                      <td className="py-2.5 text-right tabular-nums">
                        <span
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
                            rankBadgeClass(tier),
                          )}
                          title={rankTierLabel(tier)}
                        >
                          {p.mudancas_por_viagem.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-slate-700 tabular-nums">
                        {formatCurrency(p.receita)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>

      {/* Timeline */}
      <WidgetCard
        title="Viagens entregues por semana"
        subtitle="Volume operacional ao longo do tempo — busque sazonalidade e quedas inesperadas"
        action={
          isLoading ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : <RefreshCw className="w-4 h-4 text-slate-300" />
        }
      >
        {isLoading ? (
          <div className="h-32 bg-slate-50 rounded-lg animate-pulse" />
        ) : timeline.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Sem dados para esse período
          </div>
        ) : (
          <div className="flex items-end gap-1 h-32">
            {timeline.map((row, idx) => {
              const heightPct = (row.count / maxCount) * 100
              return (
                <div
                  key={idx}
                  className="flex-1 flex flex-col items-center group min-w-0"
                  title={`${formatWeek(row.week)} — ${row.count} viagens`}
                >
                  <div className="flex-1 w-full flex items-end">
                    <div
                      className="w-full bg-indigo-500 hover:bg-indigo-600 rounded-t transition-colors min-h-[2px]"
                      style={{ height: `${Math.max(heightPct, 2)}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-slate-400 mt-1 tabular-nums truncate">
                    {formatWeek(row.week)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </WidgetCard>
    </div>
  )
}

function StatBlock({
  label,
  value,
  tone,
  loading,
  hint,
}: {
  label: string
  value: number | string
  tone: 'indigo' | 'emerald' | 'amber' | 'rose'
  loading: boolean
  hint?: string
}) {
  const toneClasses: Record<typeof tone, string> = {
    indigo: 'text-indigo-700 bg-indigo-50',
    emerald: 'text-emerald-700 bg-emerald-50',
    amber: 'text-amber-700 bg-amber-50',
    rose: 'text-rose-700 bg-rose-50',
  }

  if (loading) {
    return (
      <div className="rounded-xl p-4 bg-slate-50 animate-pulse">
        <div className="h-3 w-20 bg-slate-200 rounded mb-3" />
        <div className="h-7 w-12 bg-slate-200 rounded" />
      </div>
    )
  }

  return (
    <div className={cn('rounded-xl p-4', toneClasses[tone].split(' ')[1])}>
      <p className="text-xs font-medium text-slate-600 mb-1">{label}</p>
      <p className={cn('text-2xl font-bold tracking-tight tabular-nums', toneClasses[tone].split(' ')[0])}>
        {value}
      </p>
      {hint && <p className="text-[10px] text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}

function HealthStatBlock({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: number
  hint?: string
  tone: 'rose' | 'amber'
}) {
  const cls = tone === 'rose' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
  return (
    <div className={cn('rounded-xl p-4', cls.split(' ')[0])}>
      <p className="text-xs font-medium text-slate-600 mb-1">{label}</p>
      <p className={cn('text-2xl font-bold tracking-tight tabular-nums', cls.split(' ')[1])}>
        {value}
      </p>
      {hint && <p className="text-[10px] text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}

function MotivoBadge({ motivo }: { motivo: OperationsHealthMotivo }) {
  if (motivo === 'data_ausente') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-rose-50 text-rose-700">
        Sem data
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-amber-50 text-amber-700">
      Etapa errada
    </span>
  )
}
