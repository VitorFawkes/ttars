import { DollarSign, TrendingUp, ReceiptText, Clock, Percent } from 'lucide-react'
import KpiCard from '@/components/analytics/KpiCard'
import { useFinanceiroOverview } from '@/hooks/analytics/useFinanceiroOverview'
import { formatCurrency } from '@/utils/whatsappFormatters'
import WidgetCard from './WidgetCard'
import SimpleFilterBar from './SimpleFilterBar'
import { cn } from '@/lib/utils'

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

export default function FinancialView() {
  const { data, isLoading } = useFinanceiroOverview()

  const kpis = data?.kpis
  const pendente = data?.pendente
  const serie = data?.serie_mensal ?? []
  const porOrigem = data?.por_origem ?? []
  const porConsultor = data?.por_consultor ?? []

  const maxFatMensal = Math.max(...serie.map(s => s.faturamento), 1)
  const maxFatOrigem = Math.max(...porOrigem.map(o => o.faturamento), 1)
  const maxFatConsultor = Math.max(...porConsultor.map(p => p.faturamento), 1)

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Financeiro</h1>
        <p className="text-sm text-slate-500 mt-1">
          Faturamento, receita (margem), ticket médio — quebrado por origem, consultor e mês.
        </p>
      </header>

      <SimpleFilterBar showOwner={false} showOrigins={false} />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Faturamento"
          value={kpis ? formatCurrency(kpis.faturamento) : 'R$ 0'}
          icon={DollarSign}
          color="text-emerald-600"
          bgColor="bg-emerald-50"
          isLoading={isLoading}
          subtitle={`${kpis?.qtd ?? 0} vendas no período`}
        />
        <KpiCard
          title="Receita (margem)"
          value={kpis ? formatCurrency(kpis.receita) : 'R$ 0'}
          icon={TrendingUp}
          color="text-emerald-700"
          bgColor="bg-emerald-50"
          isLoading={isLoading}
          subtitle={kpis ? `Margem: ${kpis.margem_pct}%` : undefined}
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
          title="Pendente no período"
          value={pendente ? formatCurrency(pendente.valor_pendente) : 'R$ 0'}
          icon={Clock}
          color="text-amber-600"
          bgColor="bg-amber-50"
          isLoading={isLoading}
          subtitle={`${pendente?.qtd_pendente ?? 0} cards com data prev. de fechar aqui`}
        />
      </div>

      {/* Série mensal */}
      <WidgetCard
        title="Faturamento e receita por mês (últimos 12)"
        subtitle="Barra escura = faturamento; verde claro = receita (margem)"
      >
        {isLoading ? (
          <div className="h-32 bg-slate-50 rounded-lg animate-pulse" />
        ) : serie.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Sem dados nos últimos 12 meses
          </div>
        ) : (
          <div className="flex items-end gap-2 h-32">
            {serie.map(row => (
              <div key={row.mes} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="flex-1 w-full flex items-end justify-center gap-0.5">
                  <div
                    className="w-2/3 bg-emerald-600 rounded-t min-h-[2px]"
                    style={{ height: `${(row.faturamento / maxFatMensal) * 100}%` }}
                    title={`${formatMes(row.mes)} faturamento: ${formatCurrency(row.faturamento)}`}
                  />
                  <div
                    className="w-1/3 bg-emerald-300 rounded-t min-h-[2px]"
                    style={{ height: `${(row.receita / maxFatMensal) * 100}%` }}
                    title={`${formatMes(row.mes)} receita: ${formatCurrency(row.receita)}`}
                  />
                </div>
                <span className="text-[9px] text-slate-500 tabular-nums">{formatMes(row.mes)}</span>
              </div>
            ))}
          </div>
        )}
      </WidgetCard>

      {/* Por origem */}
      <WidgetCard
        title="Por origem"
        subtitle="Onde está o dinheiro vindo — faturamento, receita e margem por origem"
      >
        {isLoading ? (
          <div className="h-32 bg-slate-50 rounded-lg animate-pulse" />
        ) : porOrigem.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Sem vendas no período
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">Origem</th>
                  <th className="text-right py-2 font-medium">Vendas</th>
                  <th className="text-right py-2 font-medium">Faturamento</th>
                  <th className="text-right py-2 font-medium">Receita</th>
                  <th className="text-right py-2 font-medium">Margem</th>
                  <th className="text-left py-2 font-medium w-1/4">Visual</th>
                </tr>
              </thead>
              <tbody>
                {porOrigem.map(row => (
                  <tr key={row.origem} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 text-slate-900 font-medium">
                      {ORIGEM_LABELS[row.origem] ?? row.origem}
                    </td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.qtd}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">
                      {formatCurrency(row.faturamento)}
                    </td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">
                      {formatCurrency(row.receita)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold',
                          row.margem_pct >= 10 ? 'bg-emerald-50 text-emerald-700' :
                            row.margem_pct >= 5 ? 'bg-amber-50 text-amber-700' :
                              'text-slate-500'
                        )}
                      >
                        <Percent className="w-3 h-3" />
                        {row.margem_pct}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden max-w-[150px]">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${(row.faturamento / maxFatOrigem) * 100}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>

      {/* Por consultor */}
      <WidgetCard
        title="Top 20 consultores por receita"
        subtitle="Quem mais gera margem"
      >
        {isLoading ? (
          <div className="h-32 bg-slate-50 rounded-lg animate-pulse" />
        ) : porConsultor.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Sem dados de consultores no período
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">#</th>
                  <th className="text-left py-2 font-medium">Consultor</th>
                  <th className="text-right py-2 font-medium">Vendas</th>
                  <th className="text-right py-2 font-medium">Faturamento</th>
                  <th className="text-right py-2 font-medium">Receita</th>
                  <th className="text-left py-2 font-medium w-1/4">Visual</th>
                </tr>
              </thead>
              <tbody>
                {porConsultor.map((row, idx) => (
                  <tr key={row.user_id ?? idx} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 text-slate-400 tabular-nums">{idx + 1}</td>
                    <td className="py-2.5 text-slate-900 font-medium">{row.user_nome ?? '—'}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.qtd}</td>
                    <td className="py-2.5 text-right text-slate-700 tabular-nums">
                      {formatCurrency(row.faturamento)}
                    </td>
                    <td className="py-2.5 text-right text-emerald-700 tabular-nums font-semibold">
                      {formatCurrency(row.receita)}
                    </td>
                    <td className="py-2.5">
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden max-w-[150px]">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${(row.faturamento / maxFatConsultor) * 100}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>
    </div>
  )
}
