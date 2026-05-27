import { useState, useMemo } from 'react'
import { useFilterParams } from '../components/FilterBar'
import { useWwPerfilCompare, type WwPerfilCompareDimensao, type WwPerfilCompareItem } from '@/hooks/analyticsWeddings/useWw2'
import { SectionCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { DrillDrawer, type DrillContext } from '../components/DrillDrawer'
import { PerfilCompareChart } from '../components/PerfilCompareChart'
import { LiftBadge } from '../components/LiftBadge'
import { formatNumber } from '../lib/format'

type Dim = 'faixa' | 'destino' | 'convidados' | 'origem' | 'tipo' | 'utm_medium' | 'utm_campaign'

export function Perfil() {
  const filters = useFilterParams()
  const [minAmostra] = useState(2)
  const [dim, setDim] = useState<Dim>('faixa')
  const [drill, setDrill] = useState<DrillContext | null>(null)
  const { data, isLoading, error } = useWwPerfilCompare(filters, minAmostra)
  const baseCtx = { dateStart: filters.dateStart, dateEnd: filters.dateEnd }

  if (isLoading) return <LoadingSkeleton rows={10} />
  if (error) return <ErrorBanner error={error as Error} />
  if (!data || data.error) return <EmptyState message={data?.error ?? 'Sem dados'} />

  const dimensaoAtual = data.comparacoes.find(c => c.dimensao === dim)
  const dadosAtual = dimensaoAtual?.dados ?? []

  return (
    <div className="space-y-5">
      <UniversoHeader data={data} />
      <ResumoLifts comparacoes={data.comparacoes} onCategoriaClick={(d, cat) => setDrill(buildDrill(baseCtx, d, cat))} />

      <SectionCard
        title="🎯 Quem ENTRA × quem FECHA — explorador por dimensão"
        subtitle={`Compare a distribuição de leads que ENTRARAM no período com a distribuição de vendas que FECHARAM. Lift maior que 1 = essa categoria fecha mais do que a média esperada.`}
      >
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {(['faixa','destino','convidados','origem','tipo','utm_medium','utm_campaign'] as Dim[]).map(d => (
            <button
              key={d}
              onClick={() => setDim(d)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${dim === d ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'}`}
            >
              {labelDim(d)}
            </button>
          ))}
        </div>
        {dadosAtual.length > 0 ? (
          <PerfilCompareChart
            dados={dadosAtual}
            dimensao={dim}
            minSample={1}
            onCategoriaClick={(cat) => setDrill(buildDrill(baseCtx, dim, cat))}
          />
        ) : (
          <EmptyState message="Sem dados suficientes nessa dimensão" />
        )}
      </SectionCard>

      <TabelaDetalhada dimensoes={data.comparacoes} onCategoriaClick={(d, cat) => setDrill(buildDrill(baseCtx, d, cat))} />

      <DrillDrawer ctx={drill} onClose={() => setDrill(null)} />
    </div>
  )
}

function UniversoHeader({ data }: { data: { entrada: { total: number }; fechamento: { total: number }; date_start: string; date_end: string } }) {
  const dStart = new Date(data.date_start).toLocaleDateString('pt-BR')
  const dEnd = new Date(data.date_end).toLocaleDateString('pt-BR')
  return (
    <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl p-5">
      <h2 className="text-base font-semibold text-slate-900">📊 Perfil — quem entra × quem fecha</h2>
      <p className="text-sm text-slate-600 mt-1">
        No período de <strong>{dStart}</strong> a <strong>{dEnd}</strong>:
        {' '}<strong>{formatNumber(data.entrada.total)} leads entraram</strong> ·
        {' '}<strong className="text-emerald-700">{formatNumber(data.fechamento.total)} vendas fecharam</strong>
        {' '}<span className="text-slate-500">(independente de quando o lead entrou).</span>
      </p>
      <p className="text-xs text-slate-500 mt-2">
        Pra cada dimensão (faixa, destino, convidados, origem, tipo, fonte UTM) comparamos como cada categoria pesa nos dois grupos.
        <strong className="text-slate-700"> Lift = quantas vezes a categoria está sobre-representada nos fechamentos.</strong>
        {' '}Verde = fecha mais que a média. Rosa = fecha menos.
      </p>
    </div>
  )
}

function ResumoLifts({ comparacoes, onCategoriaClick }: { comparacoes: WwPerfilCompareDimensao[]; onCategoriaClick: (dim: string, cat: string) => void }) {
  const todasCategorias = useMemo(() => {
    const all: { dim: string; cat: string; lift: number; entrada_qtd: number; fechou_qtd: number; entrada_pct: number | null; fechou_pct: number | null }[] = []
    for (const d of comparacoes) {
      for (const item of d.dados) {
        if (item.lift !== null && item.entrada_qtd >= 3 && item.fechou_qtd >= 1) {
          all.push({ dim: d.dimensao, cat: item.categoria, lift: item.lift, entrada_qtd: item.entrada_qtd, fechou_qtd: item.fechou_qtd, entrada_pct: item.entrada_pct, fechou_pct: item.fechou_pct })
        }
      }
    }
    return all
  }, [comparacoes])

  const topAlto = useMemo(() => [...todasCategorias].sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0)).slice(0, 5), [todasCategorias])
  const topBaixo = useMemo(() => [...todasCategorias].filter(t => (t.lift ?? 1) < 1).sort((a, b) => (a.lift ?? 0) - (b.lift ?? 0)).slice(0, 5), [todasCategorias])

  if (topAlto.length === 0 && topBaixo.length === 0) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <SectionCard
        title="🚀 Categorias que fecham MAIS que a média"
        subtitle="Top 5 com maior lift (mínimo 3 leads entrando e 1 fechado). Clique pra ver os casais."
      >
        {topAlto.length === 0 ? <EmptyState message="Sem categorias com lift alto suficiente" /> : (
          <div className="space-y-2">
            {topAlto.map(t => (
              <button
                key={`${t.dim}-${t.cat}`}
                onClick={() => onCategoriaClick(t.dim, t.cat)}
                className="w-full flex items-center justify-between p-2.5 border border-emerald-200 bg-emerald-50/50 rounded-lg hover:bg-emerald-50 cursor-pointer text-left transition"
              >
                <div>
                  <div className="text-xs uppercase text-slate-500 tracking-wide">{labelDim(t.dim as Dim)}</div>
                  <div className="text-sm font-medium text-slate-900">{t.cat}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Entrada: {t.entrada_pct ?? 0}% ({t.entrada_qtd}) · Fechou: {t.fechou_pct ?? 0}% ({t.fechou_qtd})
                  </div>
                </div>
                <LiftBadge lift={t.lift} size="md" showDelta={true} />
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="📉 Categorias que fecham MENOS que a média"
        subtitle="Top 5 com menor lift. Geralmente entra muito mas vira venda pouco."
      >
        {topBaixo.length === 0 ? <EmptyState message="Sem categorias com lift baixo identificadas" /> : (
          <div className="space-y-2">
            {topBaixo.map(t => (
              <button
                key={`${t.dim}-${t.cat}`}
                onClick={() => onCategoriaClick(t.dim, t.cat)}
                className="w-full flex items-center justify-between p-2.5 border border-rose-200 bg-rose-50/50 rounded-lg hover:bg-rose-50 cursor-pointer text-left transition"
              >
                <div>
                  <div className="text-xs uppercase text-slate-500 tracking-wide">{labelDim(t.dim as Dim)}</div>
                  <div className="text-sm font-medium text-slate-900">{t.cat}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Entrada: {t.entrada_pct ?? 0}% ({t.entrada_qtd}) · Fechou: {t.fechou_pct ?? 0}% ({t.fechou_qtd})
                  </div>
                </div>
                <LiftBadge lift={t.lift} size="md" showDelta={true} />
              </button>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function TabelaDetalhada({ dimensoes, onCategoriaClick }: { dimensoes: WwPerfilCompareDimensao[]; onCategoriaClick: (dim: string, cat: string) => void }) {
  return (
    <SectionCard
      title="📋 Tabela completa por dimensão"
      subtitle="Pra cada dimensão, todas as categorias com a comparação detalhada. Clique numa linha pra ver os casais que entraram nela."
    >
      <div className="space-y-5">
        {dimensoes.map(d => (
          <DimensaoTabela key={d.dimensao} dim={d.dimensao as Dim} dados={d.dados} onCategoriaClick={(cat) => onCategoriaClick(d.dimensao, cat)} />
        ))}
      </div>
    </SectionCard>
  )
}

function DimensaoTabela({ dim, dados, onCategoriaClick }: { dim: Dim; dados: WwPerfilCompareItem[]; onCategoriaClick: (cat: string) => void }) {
  if (dados.length === 0) return null
  return (
    <div>
      <h4 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">{labelDim(dim)}</h4>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Categoria</th>
              <th className="px-3 py-2 text-right font-medium">Leads entraram</th>
              <th className="px-3 py-2 text-right font-medium">% no grupo entrou</th>
              <th className="px-3 py-2 text-right font-medium">Vendas fecharam</th>
              <th className="px-3 py-2 text-right font-medium">% no grupo fechou</th>
              <th className="px-3 py-2 text-center font-medium">Lift</th>
            </tr>
          </thead>
          <tbody>
            {dados.map(it => (
              <tr key={it.categoria} className="border-t border-slate-100 hover:bg-indigo-50/30 cursor-pointer" onClick={() => onCategoriaClick(it.categoria)}>
                <td className="px-3 py-2 text-slate-900 font-medium">{it.categoria}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(it.entrada_qtd)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">{it.entrada_pct ?? 0}%</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{formatNumber(it.fechou_qtd)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{it.fechou_pct ?? 0}%</td>
                <td className="px-3 py-2 text-center"><LiftBadge lift={it.lift} size="sm" showDelta={true} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function labelDim(d: Dim): string {
  switch (d) {
    case 'faixa': return 'Faixa de investimento'
    case 'destino': return 'Destino'
    case 'convidados': return 'Nº convidados'
    case 'origem': return 'Origem do lead'
    case 'tipo': return 'Tipo de casamento'
    case 'utm_medium': return 'Canal (UTM medium)'
    case 'utm_campaign': return 'Campanha (UTM campaign)'
  }
}

function buildDrill(baseCtx: { dateStart: string; dateEnd: string }, dim: string, cat: string): DrillContext {
  const title = `Casais — ${cat}`
  switch (dim) {
    case 'faixa':        return { ...baseCtx, faixa: cat, title }
    case 'destino':      return { ...baseCtx, destino: cat, title }
    case 'origem':       return { ...baseCtx, origem: cat, title }
    case 'tipo':         return { ...baseCtx, tipo: cat, title }
    case 'utm_medium':   return { ...baseCtx, medium: cat, title }
    case 'utm_campaign': return { ...baseCtx, campaign: cat, title }
    case 'convidados':
    default:             return { ...baseCtx, title }
  }
}
