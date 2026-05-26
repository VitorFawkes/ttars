import { useMemo } from 'react'
import {
  Headphones,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import KpiCard from '@/components/analytics/KpiCard'
import { useConciergeOverview, useConciergePendentes } from '@/hooks/analytics/useConciergeOverview'
import { getRankTier, rankBadgeClass, rankTextClass, rankTierLabel } from '@/utils/rankColor'
import WidgetCard from './WidgetCard'
import { cn } from '@/lib/utils'

function formatMes(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '')
}

function formatHorasAberto(h: number): string {
  if (h < 24) return `${h.toFixed(0)}h`
  return `${Math.floor(h / 24)}d ${Math.floor(h % 24)}h`
}

const TIPO_LABELS: Record<string, string> = {
  oferta: 'Oferta',
  operacional: 'Operacional',
  reserva: 'Reserva',
  suporte: 'Suporte',
}

export default function ConciergeView() {
  const overview = useConciergeOverview()
  const pendentes = useConciergePendentes()

  const data = overview.data
  const kpis = data?.kpis
  const cobertura = data?.cobertura
  const isLoading = overview.isLoading

  const taxaResolucao =
    kpis && kpis.total > 0 ? Math.round((kpis.feitos / kpis.total) * 100) : 0
  const taxaCobertura =
    cobertura && cobertura.cards_pos_venda > 0
      ? Math.round((cobertura.cards_com_atendimento / cobertura.cards_pos_venda) * 100)
      : 0

  const maxVolumeMes = Math.max(...(data?.volume_mensal ?? []).map(v => v.qtd), 1)
  const maxPorTipo = Math.max(...(data?.por_tipo ?? []).map(t => t.qtd), 1)
  const maxPorCategoria = Math.max(...(data?.por_categoria ?? []).map(c => c.qtd), 1)

  // Samples para coloração relativa nas tabelas (top/meio/bottom 25% do contexto)
  const pendingHoursSample = useMemo(
    () => (pendentes.data?.rows ?? []).map(r => r.horas_aberto),
    [pendentes.data],
  )
  const conciergeTaxaSample = useMemo(
    () =>
      (data?.por_concierge ?? []).map(r =>
        r.atendimentos > 0 ? Math.round((r.feitos / r.atendimentos) * 100) : 0,
      ),
    [data?.por_concierge],
  )

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Concierge</h1>
        <p className="text-sm text-slate-500 mt-1">
          Atendimentos durante a viagem — volume, cobertura, tipo de problema e performance por concierge.
        </p>
      </header>

      {/* KPIs principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Atendimentos no período"
          value={kpis?.total ?? 0}
          icon={Headphones}
          color="text-indigo-600"
          bgColor="bg-indigo-50"
          isLoading={isLoading}
        />
        <KpiCard
          title="Resolvidos"
          value={kpis ? `${kpis.feitos} (${taxaResolucao}%)` : '0'}
          icon={CheckCircle2}
          color="text-emerald-600"
          bgColor="bg-emerald-50"
          isLoading={isLoading}
          subtitle={`Cancelados: ${kpis?.cancelados ?? 0}`}
        />
        <KpiCard
          title="Pendentes"
          value={kpis?.pendentes ?? 0}
          icon={AlertCircle}
          color={kpis && kpis.pendentes > 0 ? 'text-rose-600' : 'text-slate-400'}
          bgColor={kpis && kpis.pendentes > 0 ? 'bg-rose-50' : 'bg-slate-50'}
          isLoading={isLoading}
          subtitle="Sem desfecho registrado"
        />
        <KpiCard
          title="Tempo típico de resolução"
          value={kpis ? formatHorasAberto(kpis.tempo_medio_resolucao_horas) : '0h'}
          icon={Clock}
          color="text-amber-600"
          bgColor="bg-amber-50"
          isLoading={isLoading}
          subtitle="Da criação até marcar feito"
        />
      </div>

      {/* Cobertura */}
      <WidgetCard
        title="Cobertura de pós-venda"
        subtitle="% de viagens em pós-venda que tiveram pelo menos 1 atendimento concierge no período"
      >
        {isLoading ? (
          <div className="h-20 bg-slate-50 rounded-lg animate-pulse" />
        ) : (
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <p className="text-4xl font-bold text-slate-900 tracking-tight tabular-nums">
                {taxaCobertura}
                <span className="text-2xl text-slate-500">%</span>
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {cobertura?.cards_com_atendimento ?? 0} de {cobertura?.cards_pos_venda ?? 0} viagens
              </p>
            </div>
            <div className="flex-1 min-w-[300px] h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all"
                style={{ width: `${Math.min(taxaCobertura, 100)}%` }}
              />
            </div>
          </div>
        )}
      </WidgetCard>

      {/* Pendentes abertos */}
      <WidgetCard
        title="Atendimentos pendentes"
        subtitle="Sem desfecho — quanto mais tempo aberto, mais urgente"
        action={
          pendentes.isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          ) : pendentes.data && pendentes.data.totalCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-1 rounded-md">
              {pendentes.data.totalCount} aberto{pendentes.data.totalCount === 1 ? '' : 's'}
            </span>
          ) : (
            <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md font-medium">
              Nenhum pendente
            </span>
          )
        }
      >
        {pendentes.isLoading ? (
          <div className="h-20 bg-slate-50 rounded-lg animate-pulse" />
        ) : !pendentes.data || pendentes.data.rows.length === 0 ? (
          <div className="text-sm text-slate-500 py-3">
            Tudo resolvido. ✅
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">Card</th>
                  <th className="text-left py-2 font-medium">Tipo</th>
                  <th className="text-left py-2 font-medium">Categoria</th>
                  <th className="text-left py-2 font-medium">Concierge</th>
                  <th className="text-right py-2 font-medium">Aberto há</th>
                </tr>
              </thead>
              <tbody>
                {pendentes.data.rows.map(row => {
                  const tier = getRankTier(row.horas_aberto, pendingHoursSample, 'lower_is_better')
                  return (
                    <tr key={row.atendimento_id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 text-slate-900 font-medium max-w-[220px] truncate">
                        <a
                          href={`/cards/${row.card_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-indigo-600 inline-flex items-center gap-1"
                        >
                          {row.card_titulo}
                          <ExternalLink className="w-3 h-3 opacity-50" />
                        </a>
                      </td>
                      <td className="py-2.5 text-slate-600 text-xs">
                        {TIPO_LABELS[row.tipo_concierge] ?? row.tipo_concierge}
                      </td>
                      <td className="py-2.5 text-slate-600 text-xs">{row.categoria.replace(/_/g, ' ')}</td>
                      <td className="py-2.5 text-slate-600">{row.concierge_nome ?? '—'}</td>
                      <td className="py-2.5 text-right tabular-nums">
                        <span
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold',
                            rankBadgeClass(tier),
                          )}
                          title={rankTierLabel(tier)}
                        >
                          {formatHorasAberto(row.horas_aberto)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>

      {/* Volume mensal */}
      <WidgetCard
        title="Volume mensal"
        subtitle="Quantos atendimentos por mês — busque sazonalidade"
      >
        {isLoading ? (
          <div className="h-32 bg-slate-50 rounded-lg animate-pulse" />
        ) : !data || data.volume_mensal.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Sem atendimentos no período
          </div>
        ) : (
          <div className="flex items-end gap-2 h-32">
            {data.volume_mensal.map(row => (
              <div key={row.mes} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="text-[10px] text-slate-500 tabular-nums opacity-0 group-hover:opacity-100">
                  {row.qtd}
                </div>
                <div
                  className="w-full bg-indigo-500 rounded-t min-h-[2px]"
                  style={{ height: `${(row.qtd / maxVolumeMes) * 100}%` }}
                  title={`${formatMes(row.mes)}: ${row.qtd} atendimentos`}
                />
                <span className="text-[9px] text-slate-500 tabular-nums">{formatMes(row.mes)}</span>
              </div>
            ))}
          </div>
        )}
      </WidgetCard>

      {/* Por tipo e categoria — 2 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WidgetCard title="Por tipo" subtitle="Oferta / Operacional / Reserva / Suporte">
          {isLoading ? (
            <div className="h-32 bg-slate-50 rounded-lg animate-pulse" />
          ) : !data || data.por_tipo.length === 0 ? (
            <div className="text-sm text-slate-400">Sem dados</div>
          ) : (
            <div className="space-y-2">
              {data.por_tipo.map(row => (
                <div key={row.tipo} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-700 w-24 truncate">
                    {TIPO_LABELS[row.tipo] ?? row.tipo}
                  </span>
                  <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-indigo-500"
                      style={{ width: `${(row.qtd / maxPorTipo) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-600 tabular-nums w-16 text-right">
                    {row.qtd} ({row.feitos} feitos)
                  </span>
                </div>
              ))}
            </div>
          )}
        </WidgetCard>

        <WidgetCard title="Por categoria" subtitle="Tipo de problema mais comum">
          {isLoading ? (
            <div className="h-32 bg-slate-50 rounded-lg animate-pulse" />
          ) : !data || data.por_categoria.length === 0 ? (
            <div className="text-sm text-slate-400">Sem dados</div>
          ) : (
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
              {data.por_categoria.map(row => (
                <div key={row.categoria} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-700 w-32 truncate">
                    {row.categoria.replace(/_/g, ' ')}
                  </span>
                  <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${(row.qtd / maxPorCategoria) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-600 tabular-nums w-10 text-right">
                    {row.qtd}
                  </span>
                </div>
              ))}
            </div>
          )}
        </WidgetCard>
      </div>

      {/* Performance por concierge */}
      <WidgetCard
        title="Performance por concierge"
        subtitle="Atendimentos, resolução e tempo típico por consultor de concierge"
      >
        {isLoading ? (
          <div className="h-32 bg-slate-50 rounded-lg animate-pulse" />
        ) : !data || data.por_concierge.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm text-slate-400">
            Sem atendimentos atribuídos a concierges no período
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">Concierge</th>
                  <th className="text-right py-2 font-medium">Atendimentos</th>
                  <th className="text-right py-2 font-medium">Resolvidos</th>
                  <th className="text-right py-2 font-medium">Pendentes</th>
                  <th className="text-right py-2 font-medium">Tempo médio</th>
                </tr>
              </thead>
              <tbody>
                {data.por_concierge.map(row => {
                  const taxa = row.atendimentos > 0 ? Math.round((row.feitos / row.atendimentos) * 100) : 0
                  const taxaTier = getRankTier(taxa, conciergeTaxaSample, 'higher_is_better')
                  return (
                    <tr key={row.user_id ?? 'sem'} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 text-slate-900 font-medium">{row.user_nome ?? '—'}</td>
                      <td className="py-2.5 text-right text-slate-700 tabular-nums">{row.atendimentos}</td>
                      <td className="py-2.5 text-right tabular-nums">
                        <span
                          className={cn('font-semibold', rankTextClass(taxaTier))}
                          title={rankTierLabel(taxaTier)}
                        >
                          {row.feitos} ({taxa}%)
                        </span>
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        <span
                          className={cn(
                            row.pendentes > 0 ? 'text-amber-700 font-semibold' : 'text-slate-400'
                          )}
                        >
                          {row.pendentes}
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-slate-700 tabular-nums">
                        {row.tempo_medio_h > 0 ? formatHorasAberto(row.tempo_medio_h) : '—'}
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
