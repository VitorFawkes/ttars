import {
  TrendingUp, DollarSign, Trophy, Target, Users, ReceiptText, Calendar, Sparkles,
} from 'lucide-react'
import KpiCard from '@/components/analytics/KpiCard'
import { useResumoOverview } from '@/hooks/analytics/useResumoOverview'
import { formatCurrency } from '@/utils/whatsappFormatters'
import WidgetCard from './WidgetCard'
import { cn } from '@/lib/utils'

const FASE_LABELS: Record<string, string> = {
  sdr: 'SDR',
  planner: 'Planner',
  pos_venda: 'Pós-venda',
}

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

function formatMes(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
}

export default function ResumoView() {
  const { data, isLoading } = useResumoOverview()

  const kpis = data?.empresa.kpis
  const sparkline = data?.empresa.sparkline ?? []
  const maxSpark = Math.max(...sparkline.map(s => s.faturamento), 1)

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Resumo</h1>
        <p className="text-sm text-slate-500 mt-1">
          Visão executiva — empresa, time, tipo, operação atual e previsão. Rolável.
        </p>
        {/* Âncoras pra rolar dentro da página */}
        <nav className="mt-3 flex gap-3 text-xs text-slate-500 flex-wrap">
          <a href="#empresa" className="hover:text-indigo-600">A. Empresa</a>
          <a href="#por-time" className="hover:text-indigo-600">B. Por Time</a>
          <a href="#por-tipo" className="hover:text-indigo-600">C. Por Tipo</a>
          <a href="#operacao" className="hover:text-indigo-600">D. Operação</a>
          <a href="#previsao" className="hover:text-indigo-600">E. Previsão</a>
        </nav>
      </header>

      {/* BLOCO A: EMPRESA */}
      <section id="empresa" className="space-y-4 scroll-mt-6">
        <h2 className="text-lg font-semibold text-slate-900">A. Visão Empresa</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Faturamento"
            value={kpis ? formatCurrency(kpis.faturamento) : 'R$ 0'}
            icon={DollarSign}
            color="text-emerald-600"
            bgColor="bg-emerald-50"
            isLoading={isLoading}
            subtitle={`${kpis?.ganhos ?? 0} ganhos no período`}
          />
          <KpiCard
            title="Receita (margem)"
            value={kpis ? formatCurrency(kpis.receita) : 'R$ 0'}
            icon={TrendingUp}
            color="text-emerald-600"
            bgColor="bg-emerald-50"
            isLoading={isLoading}
          />
          <KpiCard
            title="Ticket médio"
            value={kpis ? formatCurrency(kpis.ticket_medio) : 'R$ 0'}
            icon={ReceiptText}
            color="text-indigo-600"
            bgColor="bg-indigo-50"
            isLoading={isLoading}
          />
          <KpiCard
            title="Conversão geral"
            value={kpis ? `${kpis.conversao_geral}%` : '0%'}
            icon={Target}
            color="text-indigo-600"
            bgColor="bg-indigo-50"
            isLoading={isLoading}
            subtitle={`${kpis?.leads_entrada ?? 0} leads no período`}
          />
        </div>

        {/* Sparkline 12 meses */}
        <WidgetCard title="Faturamento últimos 12 meses" subtitle="Tendência mês a mês">
          {isLoading ? (
            <div className="h-24 bg-slate-50 rounded-lg animate-pulse" />
          ) : sparkline.length === 0 ? (
            <div className="h-24 flex items-center justify-center text-sm text-slate-400">
              Sem dados nos últimos 12 meses
            </div>
          ) : (
            <div className="flex items-end gap-2 h-24">
              {sparkline.map(row => (
                <div key={row.mes} className="flex-1 flex flex-col items-center gap-1 group">
                  <div className="text-[9px] text-slate-500 tabular-nums opacity-0 group-hover:opacity-100 absolute -mt-4">
                    {formatCurrency(row.faturamento)}
                  </div>
                  <div
                    className="w-full bg-emerald-500 rounded-t min-h-[2px]"
                    style={{ height: `${(row.faturamento / maxSpark) * 100}%` }}
                    title={`${formatMes(row.mes)}: ${formatCurrency(row.faturamento)} (${row.ganhos} ganhos)`}
                  />
                  <span className="text-[9px] text-slate-500 tabular-nums">{formatMes(row.mes)}</span>
                </div>
              ))}
            </div>
          )}
        </WidgetCard>
      </section>

      {/* BLOCO B: POR TIME */}
      <section id="por-time" className="space-y-4 scroll-mt-6">
        <h2 className="text-lg font-semibold text-slate-900">B. Por Time</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(data?.por_time ?? []).map(row => {
            const tarefas = data?.tarefas_time.find(t => t.fase === row.fase)
            return (
              <div key={row.fase} className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-semibold text-slate-900">{FASE_LABELS[row.fase] ?? row.fase}</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-slate-500">Cards abertos</span>
                    <span className="text-xl font-bold text-slate-900 tabular-nums">{row.cards_abertos}</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-slate-500">Valor pipeline</span>
                    <span className="text-sm font-semibold text-emerald-700 tabular-nums">
                      {formatCurrency(row.valor_pipeline)}
                    </span>
                  </div>
                  {tarefas && (
                    <>
                      <div className="border-t border-slate-100 my-2" />
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-slate-500">Tarefas feitas</span>
                        <span className="text-sm font-semibold text-emerald-700 tabular-nums">{tarefas.feitas}</span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-slate-500">Pendentes</span>
                        <span className="text-sm text-slate-600 tabular-nums">{tarefas.pendentes}</span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-slate-500">Atrasadas</span>
                        <span className={cn(
                          'text-sm tabular-nums font-semibold',
                          tarefas.vencidas > 0 ? 'text-rose-700' : 'text-slate-400'
                        )}>
                          {tarefas.vencidas}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* BLOCO C: POR TIPO (origem) */}
      <section id="por-tipo" className="space-y-4 scroll-mt-6">
        <h2 className="text-lg font-semibold text-slate-900">C. Por Tipo (origem)</h2>
        <WidgetCard
          title="Origem dos leads e ganhos"
          subtitle="De onde vem o dinheiro — leads entrados no período × ganhos × faturamento"
        >
          {isLoading ? (
            <div className="h-32 bg-slate-50 rounded-lg animate-pulse" />
          ) : !data || data.por_origem.length === 0 ? (
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
                    <th className="text-right py-2 font-medium">Conversão</th>
                    <th className="text-right py-2 font-medium">Faturamento</th>
                  </tr>
                </thead>
                <tbody>
                  {data.por_origem.map(row => {
                    const conv = row.leads > 0 ? Math.round((row.ganhos / row.leads) * 100) : 0
                    return (
                      <tr key={row.origem} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2.5 text-slate-900 font-medium">
                          {ORIGEM_LABELS[row.origem] ?? row.origem}
                        </td>
                        <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.leads}</td>
                        <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.ganhos}</td>
                        <td className="py-2.5 text-right tabular-nums">
                          <span
                            className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold',
                              conv >= 30 ? 'bg-emerald-50 text-emerald-700' :
                                conv >= 15 ? 'bg-amber-50 text-amber-700' :
                                  'text-slate-500'
                            )}
                          >
                            {conv}%
                          </span>
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
      </section>

      {/* BLOCO D: OPERAÇÃO */}
      <section id="operacao" className="space-y-4 scroll-mt-6">
        <h2 className="text-lg font-semibold text-slate-900">D. Pela Operação Operando</h2>
        <WidgetCard
          title="Snapshot do funil agora"
          subtitle="Cards abertos por fase do pipeline neste momento"
        >
          {isLoading ? (
            <div className="h-24 bg-slate-50 rounded-lg animate-pulse" />
          ) : !data || data.snapshot_fases.length === 0 ? (
            <div className="h-24 flex items-center justify-center text-sm text-slate-400">
              Sem cards abertos
            </div>
          ) : (
            <div className="flex items-stretch gap-2">
              {data.snapshot_fases.map(row => {
                const total = data.snapshot_fases.reduce((a, r) => a + r.qtd, 0)
                const pct = total > 0 ? Math.round((row.qtd / total) * 100) : 0
                return (
                  <div key={row.fase} className="flex-1 bg-indigo-50 rounded-xl p-4">
                    <p className="text-[10px] font-medium text-slate-600 uppercase tracking-wider">
                      {FASE_LABELS[row.fase] ?? row.fase}
                    </p>
                    <p className="text-2xl font-bold text-indigo-700 tabular-nums">{row.qtd}</p>
                    <p className="text-[10px] text-slate-500 mt-1">{pct}% do total aberto</p>
                  </div>
                )
              })}
            </div>
          )}
        </WidgetCard>
      </section>

      {/* BLOCO E: PREVISÃO */}
      <section id="previsao" className="space-y-4 scroll-mt-6">
        <h2 className="text-lg font-semibold text-slate-900">E. Previsão de Fechamento</h2>
        <p className="text-sm text-slate-500 -mt-2">
          Usa orçamento + data prevista de fechamento dos cards abertos. Substitui meta enquanto ela não existe.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Previsto no período"
            value={data?.forecast?.qtd_prevista ?? 0}
            icon={Calendar}
            color="text-indigo-600"
            bgColor="bg-indigo-50"
            isLoading={isLoading}
            subtitle="Cards com data prev. neste range"
          />
          <KpiCard
            title="Valor previsto"
            value={data?.forecast ? formatCurrency(data.forecast.valor_previsto) : 'R$ 0'}
            icon={DollarSign}
            color="text-emerald-600"
            bgColor="bg-emerald-50"
            isLoading={isLoading}
            subtitle="Soma de orçamento dos previstos"
          />
          <KpiCard
            title="Próximos 7 dias"
            value={data?.forecast?.qtd_prox_7d ?? 0}
            icon={Sparkles}
            color="text-amber-600"
            bgColor="bg-amber-50"
            isLoading={isLoading}
            subtitle="Cards com fechamento prev. próx 7d"
          />
          <KpiCard
            title="Valor próximos 7d"
            value={data?.forecast ? formatCurrency(data.forecast.valor_prox_7d) : 'R$ 0'}
            icon={Trophy}
            color="text-amber-600"
            bgColor="bg-amber-50"
            isLoading={isLoading}
          />
        </div>
      </section>
    </div>
  )
}
