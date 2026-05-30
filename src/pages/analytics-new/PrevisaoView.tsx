import { useMemo } from 'react'
import { CalendarClock, TrendingUp, AlertTriangle, ListChecks, Loader2 } from 'lucide-react'
import { format, addDays } from 'date-fns'
import KpiCard from '@/components/analytics/KpiCard'
import PlannerForecastChart from '@/components/analytics/PlannerForecastChart'
import { usePlannerForecastByDono } from '@/hooks/analytics/usePlannerForecastByDono'
import { useDrillDownStore } from '@/hooks/analytics/useAnalyticsDrillDown'
import { formatCurrency } from '@/utils/whatsappFormatters'
import WidgetCard from './WidgetCard'
import SimpleFilterBar from './SimpleFilterBar'
import { cn } from '@/lib/utils'

const ORIGEM_LABELS: Record<string, string> = {
  manual: 'Planner direto', whatsapp: 'WhatsApp', active_campaign: 'Active Campaign',
  mkt: 'Marketing', indicacao: 'Indicação', carteira_propria: 'Carteira própria',
  carteira_wg: 'Carteira WG', sorrento: 'Sorrento', weddings: 'Weddings', sem_origem: 'Sem origem',
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000)
}

export default function PrevisaoView() {
  const drillDown = useDrillDownStore()
  const today = useMemo(() => new Date(), []) // estável por mount — evita recomputar janela/memo a cada render
  const todayStr = format(today, 'yyyy-MM-dd')

  // Janela ampla: 180 dias pra trás (atrasados) + 180 pra frente (previsão).
  const { data: cards, isLoading } = usePlannerForecastByDono({
    dateStart: format(addDays(today, -180), 'yyyy-MM-dd'),
    dateEnd: format(addDays(today, 180), 'yyyy-MM-dd'),
    ownerIds: [], origens: [], stageIds: [], valueMin: null, valueMax: null,
  })

  const stats = useMemo(() => {
    const list = cards ?? []
    const in30 = format(addDays(today, 30), 'yyyy-MM-dd')
    const in90 = format(addDays(today, 90), 'yyyy-MM-dd')
    let v30 = 0, c30 = 0, v90 = 0, c90 = 0, vOver = 0
    const overdue: typeof list = []
    for (const c of list) {
      const d = c.data_prevista
      if (!d) continue
      if (d < todayStr) { vOver += c.valor; overdue.push(c) }
      else {
        if (d < in30) { v30 += c.valor; c30++ }
        if (d < in90) { v90 += c.valor; c90++ }
      }
    }
    overdue.sort((a, b) => b.valor - a.valor)
    // por consultor (próximos 90d, abertos não-atrasados)
    const byPlanner = new Map<string, { nome: string; valor: number; qtd: number }>()
    for (const c of list) {
      if (!c.data_prevista || c.data_prevista < todayStr || c.data_prevista >= in90) continue
      const cur = byPlanner.get(c.planner_id) ?? { nome: c.planner_nome, valor: 0, qtd: 0 }
      cur.valor += c.valor; cur.qtd++
      byPlanner.set(c.planner_id, cur)
    }
    const planners = Array.from(byPlanner.values()).sort((a, b) => b.valor - a.valor)
    const maxPlanner = Math.max(...planners.map(p => p.valor), 1)
    return { v30, c30, v90, c90, vOver, overdueCount: overdue.length, overdue, planners, maxPlanner, total: list.length }
  }, [cards, todayStr, today])

  const openPlannerPipeline = (plannerId: string, plannerNome: string) => {
    drillDown.open({ label: `Pipeline de ${plannerNome}`, drillSource: 'current_stage', drillOwnerId: plannerId })
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Previsão de fechamento</h1>
        <p className="text-sm text-slate-500 mt-1">
          Quanto está previsto fechar e quando — por período e por consultor. Baseado na data prevista de
          fechamento de cada card aberto ({stats.total} cards com data preenchida). Quem não tem data não entra na conta.
        </p>
      </header>

      <SimpleFilterBar showOwner={false} showOrigins={false} myButtonLabel="Meu pipeline" />

      {/* KPIs executivos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Previsto — próximos 30 dias"
          value={isLoading ? '—' : formatCurrency(stats.v30)}
          icon={CalendarClock} color="text-indigo-600" bgColor="bg-indigo-50" isLoading={isLoading}
          subtitle={`${stats.c30} cards com data nos próximos 30d`}
        />
        <KpiCard
          title="Previsto — próximos 90 dias"
          value={isLoading ? '—' : formatCurrency(stats.v90)}
          icon={TrendingUp} color="text-blue-600" bgColor="bg-blue-50" isLoading={isLoading}
          subtitle={`${stats.c90} cards com data nos próximos 90d`}
        />
        <KpiCard
          title="Atrasados (passou da data)"
          value={isLoading ? '—' : formatCurrency(stats.vOver)}
          icon={AlertTriangle}
          color={stats.vOver > 0 ? 'text-rose-600' : 'text-slate-400'}
          bgColor={stats.vOver > 0 ? 'bg-rose-50' : 'bg-slate-50'}
          isLoading={isLoading}
          subtitle={`${stats.overdueCount} cards já passaram da data prevista e seguem abertos`}
        />
        <KpiCard
          title="Cards na previsão"
          value={isLoading ? '—' : stats.total}
          icon={ListChecks} color="text-slate-600" bgColor="bg-slate-50" isLoading={isLoading}
          subtitle="Com data prevista de fechamento"
        />
      </div>

      {/* Linha do tempo de previsão — gráfico interativo (reusa o existente, rico) */}
      <PlannerForecastChart />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Atrasados / em risco — acionável */}
        <WidgetCard
          title="Atrasados — precisam de atenção"
          subtitle="Cards cuja data prevista de fechamento já passou e ainda estão abertos. Ordenados por valor."
          action={<AlertTriangle className="w-4 h-4 text-rose-300" />}
        >
          {isLoading ? (
            <div className="h-40 flex items-center justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : stats.overdue.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-sm text-slate-400">Nenhum card atrasado 🎉</div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b border-rose-100">
                <span className="text-xs text-rose-700 font-semibold">
                  {formatCurrency(stats.vOver)} em {stats.overdueCount} cards atrasados
                </span>
              </div>
              {stats.overdue.slice(0, 12).map(c => {
                const atraso = daysBetween(todayStr, c.data_prevista)
                return (
                  <button
                    key={c.card_id}
                    onClick={() => openPlannerPipeline(c.planner_id, c.planner_nome)}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-rose-50 transition-colors text-left group"
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-slate-800 font-medium truncate group-hover:text-rose-700">{c.card_titulo}</span>
                      <span className="block text-[11px] text-slate-400 truncate">
                        {c.planner_nome} · {c.stage_nome ?? 'sem etapa'} · {ORIGEM_LABELS[c.origem] ?? c.origem}
                      </span>
                    </span>
                    <span className="text-[11px] font-semibold text-rose-600 bg-rose-50 rounded px-1.5 py-0.5 tabular-nums whitespace-nowrap">
                      {atraso}d atrasado
                    </span>
                    <span className="w-20 text-right text-sm text-slate-700 font-semibold tabular-nums">{formatCurrency(c.valor)}</span>
                  </button>
                )
              })}
              {stats.overdue.length > 12 && (
                <p className="text-xs text-slate-400 pt-2 text-center">+ {stats.overdue.length - 12} outros cards atrasados</p>
              )}
            </div>
          )}
        </WidgetCard>

        {/* Previsão por consultor (próximos 90d) */}
        <WidgetCard
          title="Previsão por consultor (próximos 90 dias)"
          subtitle="Quanto cada consultor tem previsto pra fechar nos próximos 90 dias."
        >
          {isLoading ? (
            <div className="h-40 flex items-center justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : stats.planners.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-sm text-slate-400">Sem previsão nos próximos 90 dias</div>
          ) : (
            <div className="space-y-2.5">
              {stats.planners.slice(0, 12).map(p => (
                <div key={p.nome} className="flex items-center gap-3">
                  <span className="w-32 text-xs font-medium text-slate-700 truncate" title={p.nome}>{p.nome}</span>
                  <div className="flex-1 h-6 bg-slate-100 rounded overflow-hidden relative">
                    <div className="h-full bg-indigo-400" style={{ width: `${(p.valor / stats.maxPlanner) * 100}%` }} />
                    <span className="absolute inset-y-0 left-2 flex items-center text-[11px] text-slate-700 tabular-nums">
                      {p.qtd} card{p.qtd > 1 ? 's' : ''}
                    </span>
                  </div>
                  <span className={cn('w-24 text-right text-sm font-semibold text-slate-800 tabular-nums')}>{formatCurrency(p.valor)}</span>
                </div>
              ))}
            </div>
          )}
        </WidgetCard>
      </div>
    </div>
  )
}
